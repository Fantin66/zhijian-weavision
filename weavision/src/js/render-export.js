"use strict";

/* ============================================================
   整图导出 PNG — 离屏 canvas 复用绘制管线
   方案：内容世界包围盒 → 离屏 canvas（scale 因子）→ 临时把全局
   ctx 指向离屏上下文 → 走与 render() 相同的绘制序列
   （背景/网格/连线/元素）→ 恢复 ctx → 下载
============================================================ */
/* G11: 水印图片缓存 — fetch→blob→dataURL→Image，避免 file:// 污染 canvas */
let _wmImgCache={img:null,key:""};
async function getWatermarkImg(){
  const preset=parseInt(localStorage.getItem("zhijian-logo"))||3;
  const dark=state.dark;
  const key=preset+"-"+(dark?"dark":"light");
  if(_wmImgCache.img&&_wmImgCache.key===key)return _wmImgCache.img;
  try{
    const url="src/assets/watermarks/wm-"+preset+"-"+(dark?"dark":"light")+".png";
    const resp=await fetch(url);
    if(!resp.ok)throw new Error("fetch "+resp.status);
    const blob=await resp.blob();
    const dataURL=await new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onloadend=()=>resolve(r.result);
      r.onerror=()=>reject(new Error("FileReader failed"));
      r.readAsDataURL(blob);
    });
    const img=await new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=()=>reject(new Error("Image load failed"));
      im.src=dataURL;
    });
    _wmImgCache={img,key};
    return img;
  }catch(e){
    console.warn("水印图片加载失败，回退文字水印:",e);
    return null;
  }
}
async function exportPNG(){
  /* 空画布：提示 */
  if(!state.items.length){toast("画布为空，无可导出内容");return;}
  /* I5-fix: 水印图必须在切换离屏画布"之前"取好——此处的 await 会放行 rAF 渲染，
     而届时全局 ctx/camera 已指向导出画布，插进来的渲染会把选择框/HUD 画进导出图 */
  var wmImg=await getWatermarkImg();
  /* 内容世界包围盒（含节点/便签/卡片/画笔，取 itemBounds） */
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(const it of state.items){
    if(it.type==="mindNode"&&!isMindNodeVisible(it))continue;  /* 折叠子树不导出 */
    const b=itemBounds(it);
    if(!b)continue;
    minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
    maxX=Math.max(maxX,b.x+b.w);maxY=Math.max(maxY,b.y+b.h);
  }
  /* 连接线不在 items，用 state.links 两端补充包围盒 */
  for(const l of state.links){
    const a=state.items.find(i=>i.id===l.aId),b=state.items.find(i=>i.id===l.bId);
    if(!a||!b)continue;
    for(const n of [a,b]){
      const bb=itemBounds(n);if(!bb)continue;
      minX=Math.min(minX,bb.x);minY=Math.min(minY,bb.y);
      maxX=Math.max(maxX,bb.x+bb.w);maxY=Math.max(maxY,bb.y+bb.h);
    }
  }
  if(!(maxX>minX&&maxY>minY)){toast("无可导出内容");return;}
  const PAD=48;                                   /* 四周留白（世界单位） */
  const wWorld=(maxX-minX)+PAD*2,hWorld=(maxY-minY)+PAD*2;
  /* 导出倍率：2x 保清晰（高清屏友好），限制最大像素防内存爆 */
  const scale=2;
  const Wout=Math.min(8192,Math.round(wWorld*scale));
  const Hout=Math.min(8192,Math.round(hWorld*scale));
  const s=Wout/wWorld;                            /* 实际生效倍率（等比） */
  const oc=document.createElement("canvas");
  oc.width=Wout;oc.height=Hout;
  const octx=oc.getContext("2d");
  /* 保存当前 ctx 与 camera 与 W/H，切换到离屏 */
  const savedCtx=ctx;
  const savedW=W,savedH=H;
  const savedZoom=state.camera.zoom,savedX=state.camera.x,savedY=state.camera.y;
  ctx=octx;
  W=Wout;H=Hout;  /* G2: drawGrid 用全局 W/H，必须同步为导出尺寸否则纹理不铺满 */
  /* 视口：把世界包围盒映射到离屏（含 PAD），scale=s */
  state.camera.zoom=s;
  state.camera.x=minX-PAD;
  state.camera.y=minY-PAD;
  /* J3-fix: 导出时保留形变预览——设 _exporting 标志让 drawFileCard 忽略 hasMorph
     始终画背景+内容。图片/文本预览直接画在 canvas 上；DOM 类预览画文件名占位。
     就地展开仍收起（纯 DOM 无法捕获）。 */
  state._exporting=true;
  const _exportDetailBk=[];
  for(const _id of [...expandedDetailIds]){
    const _dit=state.items.find(x=>x.id===_id);
    if(_dit){
      _exportDetailBk.push({it:_dit,w:_dit.w,h:_dit.h});
      if(_dit._detailBase){_dit.w=_dit._detailBase.w;_dit.h=_dit._detailBase.h;}
    }
    expandedDetailIds.delete(_id);
  }
  try{
    /* 1) 背景：画布当前 bgColor */
    const dark=state.dark;
    octx.fillStyle=getBgColor(state.bgColorName,dark);
    octx.fillRect(0,0,Wout,Hout);
    /* 2) 视口变换 */
    octx.save();
    octx.translate(-(minX-PAD)*s,-(minY-PAD)*s);
    octx.scale(s,s);
    /* 3) 网格 */
    try{drawGrid(s);}catch(e){}
    /* 4) 连线 + 元素 */
    const filterOk=it=>true;
    drawMindConnections(null);
    try{drawLinks(null);}catch(e){}
    for(const it of state.items){
      if(it.type!=="mindNode"&&filterOk(it)) drawItem(it);
    }
    for(const it of state.items){
      if(it.type==="mindNode"&&isMindNodeVisible(it)&&filterOk(it)) drawItem(it);
    }
    octx.restore();
    /* G11: 水印 — 优先黑白图片（已在导出开始前取好），加载失败则回退文字 */
    try{
      octx.save();
      octx.globalAlpha=.35;
      if(wmImg){
        var wmW=Math.min(wmImg.naturalWidth,Math.round(Wout*0.12));
        var wmH=Math.round(wmImg.naturalHeight*(wmW/wmImg.naturalWidth));
        octx.drawImage(wmImg,Wout-wmW-24,Hout-wmH-20,wmW,wmH);
      }else{
        octx.font="600 "+Math.round(Wout*0.018)+"px sans-serif";
        octx.textAlign="right";octx.textBaseline="bottom";
        octx.fillStyle=dark?"rgba(255,255,255,.5)":"rgba(45,95,211,.5)";
        octx.fillText("织见 WEAVISION · 织连万象，见聚一隅",Wout-24,Hout-20);
      }
      octx.restore();
    }catch(e){}
    triggerDownload();
  }catch(e){
    console.warn("导出绘制异常:",e);
    triggerDownload();
  }finally{
    ctx=savedCtx;
    W=savedW;H=savedH;
    state.camera.zoom=savedZoom;state.camera.x=savedX;state.camera.y=savedY;
    state._exporting=false;
    for(const _b of _exportDetailBk){expandedDetailIds.add(_b.it.id);_b.it.w=_b.w;_b.it.h=_b.h;}
    requestRender();
  }
  function triggerDownload(){
    var cur=curCanvas()||{name:"画布"};
    var name=(cur.name||"织见画布").replace(/[\\/:*?\"<>|]/g,"_");
    /* G2: 优先用 toBlob（对大 canvas 更稳定），降级到 toDataURL */
    if(oc.toBlob){
      oc.toBlob(function(blob){
        if(blob&&blob.size>0){
          var url=URL.createObjectURL(blob);
          var a=document.createElement("a");
          a.download=name+"-导出.png";a.href=url;
          document.body.appendChild(a);a.click();a.remove();
          setTimeout(function(){URL.revokeObjectURL(url);},1000);
          toast("已导出 PNG（"+Wout+"×"+Hout+"）");
        }else{_fallbackDataURL();}
      },"image/png");
    }else{_fallbackDataURL();}
    function _fallbackDataURL(){
      try{
        var url=oc.toDataURL("image/png");
        var a=document.createElement("a");
        a.download=name+"-导出.png";a.href=url;
        document.body.appendChild(a);a.click();a.remove();
        toast("已导出 PNG（"+Wout+"×"+Hout+"）");
      }catch(e){
        console.warn("导出失败:",e);
        toast("导出失败：画布内容可能包含跨域资源");
      }
    }
  }
}
