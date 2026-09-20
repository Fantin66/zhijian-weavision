"use strict";

function drawItem(it){
  /* 编辑态由 DOM 编辑器接管，避免画布中的原便签与预览重叠。 */
  if((it.type==="note"&&it.id===editingNoteId)||(it.type==="mindNode"&&it.id===editingMindId)) return;
  /* 拖拽时元素半透明（幽灵效果） */
  const isDragging=drag&&drag.mode==="move"&&drag.item&&(drag.item.id===it.id||state.multiSel.includes(it.id));
  if(isDragging) ctx.globalAlpha=.6;
  /* 出生弹入动画：新元素 380ms 内从 0.6 弹性放大到 1 */
  let popScale=1;
  if(it.birth){
    const t=(performance.now()-it.birth)/380;
    if(t<1){
      const e=1-Math.pow(1-t,3);
      popScale=0.6+0.4*e+(t<0.6?Math.sin(t*Math.PI*2.5)*0.06:0);
    }else{ it.birth=null; }
  }
  if(popScale!==1){
    const b=itemBounds(it);
    if(b){
      ctx.save();
      ctx.translate(b.x+b.w/2,b.y+b.h/2);
      ctx.scale(popScale,popScale);
      ctx.translate(-(b.x+b.w/2),-(b.y+b.h/2));
    }
  }
  if(it.type==="note") drawNote(it);
  else if(it.type==="stroke") drawStroke(it);
  else if(it.type==="connector") drawConnector(it);
  else if(it.type==="mindNode") drawMindNode(it);
  else if(it.type==="fileCard") drawFileCard(it);
  if(popScale!==1) ctx.restore();
  if(isDragging) ctx.globalAlpha=1;
}


/* ---------- 便签 ---------- */
function paintNoteSurface(c,it,coreH,z,sel,SC,nr){
  const {x,y,w,h}=it;
  if(SC.neumorph){drawNeumorph(c,x,y,w,h,nr,sel,state.dark,state.bgColor);}else if(SC.colorful){drawColorful(c,x,y,w,h,nr,sel,state.dark,it.color);}else if(SC.bento){drawColorful(c,x,y,w,h,nr,sel,state.dark,it.color);}else if(SC.editorial){drawColorful(c,x,y,w,h,nr,sel,state.dark,it.color);}else{
  /* 立体感：外层柔和投影（纸感悬浮）+ 内层接触阴影 */
  c.save();
  c.shadowColor=sel?"rgba(45,95,211,.38)":"rgba(15,23,42,.18)";
  c.shadowBlur=(sel?16:10)/z;c.shadowOffsetY=(sel?4:3)/z;
  roundRectPath(c,x,y,w,h,nr);
  if(SC.paper){
    const pg=c.createLinearGradient(x,y,x,y+h);pg.addColorStop(0,"#fffdf7");pg.addColorStop(1,"#f6e9c8");c.fillStyle=pg;
  }else if(SC.glass){
    const gg=c.createLinearGradient(x,y,x+w,y+h);gg.addColorStop(0,dc("rgba(255,255,255,.76)","rgba(103,125,172,.56)"));gg.addColorStop(1,dc(hexToRgba(it.color,.22),"rgba(29,35,55,.78)"));c.fillStyle=gg;
  }else c.fillStyle=state.dark?darkenColor(it.color,0.4):it.color;
  c.fill();
  c.restore();
  /* 描边：显著提升与背景的区分度 */
  c.save();
  roundRectPath(c,x,y,w,h,nr);
  c.strokeStyle=SC.paper?"rgba(104,76,42,.48)":SC.glass?dc("rgba(255,255,255,.72)","rgba(255,255,255,.12)"):state.dark?"rgba(255,255,255,.16)":"rgba(0,0,0,.13)";
  c.lineWidth=1/z;c.stroke();
  c.restore();
  /* 顶部高光：纵向渐变模拟自然光线（简约风格无材质装饰，跳过） */
  if(!SC.minimal&&!SC.neumorph){
    c.save();
    roundRectPath(c,x,y,w,h,nr);c.clip();
    const hg=c.createLinearGradient(x,y,x,y+Math.min(14,coreH/3));
    hg.addColorStop(0,dc("rgba(255,255,255,.24)","rgba(255,255,255,.06)"));
    hg.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=hg;c.fillRect(x,y,w,Math.min(14,coreH/3));
    /* 底部微暗：纸张厚度感 */
    const bg=c.createLinearGradient(x,y+h-8,x,y+h);
    bg.addColorStop(0,"rgba(0,0,0,0)");
    bg.addColorStop(1,"rgba(0,0,0,.06)");
    c.fillStyle=bg;c.fillRect(x,y+h-8,w,8);
    c.restore();
  }
  if(SC.glass){
    c.save();roundRectPath(c,x+1/z,y+1/z,w-2/z,h-2/z,nr);c.clip();
    const shine=c.createLinearGradient(x,y,x+w*.7,y+h);shine.addColorStop(0,dc("rgba(255,255,255,.34)","rgba(255,255,255,.08)"));shine.addColorStop(.45,dc("rgba(255,255,255,.05)","rgba(255,255,255,.02)"));shine.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=shine;c.fillRect(x,y,w,h);c.restore();
  }
  } /* end else */
}
function drawNote(it,cc){
  const c=cc||ctx;const{x,y,w,h}=it;
  const coreH=detailBaseHeight(it,{x,y,w,h});
  const z=state.camera.zoom;
  const sel=it.id===state.selected;
  const SC=styleCfg();
  /* 便签圆角跟随当前风格：paper=方角(2) / minimal=微圆(4) / 其余 7 */
  const nr=SC.paper?8:SC.glass?14:SC.minimal?4:SC.neumorph?14:SC.colorful?16:SC.bento?20:SC.editorial?4:9;
  paintNoteSurface(c,it,coreH,z,sel,SC,nr);
  /* 选中态描边 */
  if(sel){
    c.save();
    /* 立体高亮：外圈柔光 + 品牌亮色细描边（不再用深色实线） */
    const HL=state.dark?"#8fb0e8":"#2d5fd3";
    c.shadowColor=state.dark?"rgba(143,176,232,.75)":"rgba(45,95,211,.55)";
    c.shadowBlur=14/z;
    c.strokeStyle=HL;c.lineWidth=2/z;
    roundRectPath(c,x-2/z,y-2/z,w+4/z,h+4/z,8.5);c.stroke();
    c.shadowColor="transparent";
    c.strokeStyle=dc("rgba(255,255,255,.55)","rgba(255,255,255,.1)");c.lineWidth=1/z;
    roundRectPath(c,x+.5/z,y+.5/z,w-1/z,h-1/z,6.5);c.stroke();
    c.restore();
  }
  if(w>34&&h>22){
    /* 风格字体联动：Fluent/拟物手作走专属字族，其余用界面字体 */
    const styCfg=styleCfg();
    const style=noteTypography(it),base=Math.round(style.size*(styCfg.fontScale||1)),lh=Math.round(base*1.42),lines=[];
    let fam=style.family;
    if(styCfg.paper&&styCfg.fontPreset==="handwritten")fam=FONT_PRESETS.handwritten.stack;
    c.fillStyle=dc("rgba(29,29,31,.86)","rgba(255,255,255,.92)");c.textBaseline="top";
    for(const token of markdownLines(it.text)){
      const scale=token.kind==="h1"?1.25:token.kind==="h2"?1.14:token.kind==="h3"?1.05:1;
      const weight=style.bold||token.kind.startsWith("h")?700:500;
      c.font=weight+" "+Math.round(base*scale)+"px "+fam;
      const wrapped=wrapLines(c,token.text,w-20);for(const line of wrapped)lines.push({line,scale,weight,quote:token.kind==="quote"});
    }
    const maxL=Math.max(1,Math.floor((coreH-14)/lh));
    /* 便签非编辑态滚动：内容超出可视高度时按 it.scrollY 偏移显示窗口，
       由交互层（interaction.js 的 wheel）更新 scrollY 并重绘，
       这样不必双击进入编辑态也能上下滚动看全内容。 */
    const total=lines.length;
    const scrollMax=Math.max(0,total-maxL);
    it._scrollMax=scrollMax;it._maxL=maxL;
    const sy=clamp(Math.round(it.scrollY||0),0,scrollMax);
    it.scrollY=sy;
    lines.slice(sy,sy+maxL).forEach((row,i)=>{c.font=row.weight+" "+Math.round(base*row.scale)+"px "+fam;c.fillText(row.line,x+10,y+12+i*lh);if(style.underline){const tw=c.measureText(row.line).width;c.fillRect(x+10,y+12+i*lh+base*1.16,tw,Math.max(1,base*.07));}});
    /* 可滚动时：右侧细滚动条（替代旧的截断省略号），提示下方还有内容 */
    if(scrollMax>0){
      const trackY=y+8,trackH=Math.max(12,coreH-16);
      const thumbH=Math.max(16,trackH*maxL/total);
      const thumbY=trackY+(trackH-thumbH)*(sy/scrollMax);
      c.save();
      c.fillStyle=dc("rgba(29,29,31,.14)","rgba(255,255,255,.2)");
      roundRectPath(c,x+w-5,trackY,2.5,trackH,1.25);c.fill();
      c.fillStyle=dc("rgba(29,29,31,.42)","rgba(255,255,255,.5)");
      roundRectPath(c,x+w-5,thumbY,2.5,thumbH,1.25);c.fill();
      c.restore();
    }
  }
  /* （已移除：关联到节点时便签右上角的橙色角标） */
  drawDetail(it,{x,y,w,h});
  drawAnnotation(it,{x,y,w,h});
}
/* ---------- 画笔 ---------- */
function drawStroke(it,cc){
  const c=cc||ctx;if(!it.points.length)return;
  const z=state.camera.zoom;
  const sel=it.id===state.selected;
  const SC=styleCfg();
  /* 画笔质感随整体风格联动（统一设计语言）：
     - paper 拟物手作：笔触加粗 + 手写微抖 + 轻微透墨 → 与钢笔连线一致
     - minimal 简约：更细、纯色、零装饰，线条干净
     - fluent/其余：平滑润泽 */
  let lw=it.size;
  if(SC.paper)lw=it.size*1.25;
  else if(SC.minimal)lw=Math.max(1.2,it.size*0.8);
  c.save();
  if(sel){c.shadowColor="rgba(45,95,211,.35)";c.shadowBlur=8/z;}
  c.strokeStyle=it.color;c.lineWidth=lw;
  c.lineCap="round";c.lineJoin="round";
  if(SC.paper){
    /* 手写墨迹：沿轨迹微抖 + 稍透（同钢笔连线质感） */
    c.globalAlpha=.92;
    const seed=(it.id||0)*1.7;
    c.beginPath();
    it.points.forEach((p,i)=>{
      const amp=Math.min(.5,lw*.12);
      const edge=i===0||i===it.points.length-1?0:1;
      const jx=jitterAt(seed+(SC.paper?1:0),i)*amp*edge;
      const jy=jitterAt(seed+4.2,i)*amp*edge;
      if(i===0)c.moveTo(p.x+jx,p.y+jy);else c.lineTo(p.x+jx,p.y+jy);
    });
    c.stroke();
  }else{
    c.beginPath();it.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
  }
  c.restore();
  /* 选中态：叠加品牌色描边光晕 */
  if(sel){
    c.save();
    c.strokeStyle="rgba(45,95,211,.3)";c.lineWidth=lw+3/z;
    c.lineCap="round";c.lineJoin="round";
    c.beginPath();it.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
    c.restore();
  }
  /* 画笔批注也使用与节点、附件、关系线一致的批注卡。 */
  if(it.annotation){
    const mid=it.points[Math.floor(it.points.length/2)],m=annotationMetrics(it.annotation,c);
    drawAnnotationBubble(it.annotation,{x:mid.x-m.w/2,y:mid.y-m.h-10/z,w:m.w,h:m.h,metrics:m},it.color||"#2d5fd3",c);
  }
}
/* ---------- 连线 ---------- */
function resolveEnd(p){
  if(p.noteId){
    const n=state.items.find(i=>i.id===p.noteId);
    if(n) return{x:n.x+p.ox,y:n.y+p.oy};
    return{x:0,y:0,free:true};
  }
  return{x:p.x,y:p.y,free:true};
}
/* edgePoint 统一定义在文件后段，此处原本是重复定义，已移除 */
function drawConnectorLine(c,a,b,color,width,arrowEnd){
  c.strokeStyle=color;c.lineWidth=width;c.lineCap="round";
  c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
  if(arrowEnd){
    const ang=Math.atan2(b.y-a.y,b.x-a.x),L=8,spread=0.45;
    c.fillStyle=color;
    c.beginPath();c.moveTo(b.x,b.y);
    c.lineTo(b.x-L*Math.cos(ang-spread),b.y-L*Math.sin(ang-spread));
    c.lineTo(b.x-L*Math.cos(ang+spread),b.y-L*Math.sin(ang+spread));
    c.closePath();c.fill();
  }
}
function drawConnector(it,cc){
  const c=cc||ctx;
  const z=state.camera.zoom;
  const sel=it.id===state.selected;
  let a=resolveEnd(it.a),b=resolveEnd(it.b);
  if(!it.a.free&&!a.free){
    const n=state.items.find(i=>i.id===it.a.noteId);
    if(n) a=edgePoint(n.x+n.w/2,n.y+n.h/2,b.x,b.y,n);
  }
  if(!it.b.free&&!b.free){
    const n=state.items.find(i=>i.id===it.b.noteId);
    if(n) b=edgePoint(n.x+n.w/2,n.y+n.h/2,a.x,a.y,n);
  }
  /* 选中态：品牌色光晕 */
  if(sel){
    c.save();
    c.strokeStyle="rgba(45,95,211,.25)";c.lineWidth=Math.max(1.5,it.width||2)+3/z;
    c.lineCap="round";
    c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    c.restore();
  }
  drawConnectorLine(c,a,b,it.color,Math.max(1.5,it.width||2),true);
}

/* ============================================================
   附件形变预览（morph）：同一元素尺寸动画，卡片 ⇄ 预览一体
   —— 不再是覆盖式独立窗口，元素本体就是预览本体
============================================================ */
const morphAnimFrames=new Map();  /* itemId -> rAF handle；每卡片独立，避免互相取消 */
const PV_HEAD_H=36;   /* 预览态顶部标题栏高度（点击可退回卡片）——加宽让标题显示完整 */
/* 预览目标尺寸：点击形变后给出可阅读的紧凑预览。
   网页以流式 iframe 撑满约 480×340 的缩略视口；更大阅读由全屏承接。
   手机模式由预览头部按钮切换（375 逻辑宽 + 舞台横向滚动）。 */
function previewTargetSize(it){
  const f=state.files&&state.files.length?state.files.find(x=>x.id===it.fileId):null;
  /* 展开卡片是"可阅读缩略预览"，而不是第二个全屏窗口。
     更大的阅读需求由全屏按钮承接，默认尺寸始终能与导图节点共存。 */
  const safeW=clamp(Math.round(W/Math.max(.25,state.camera.zoom)*.78),460,920);
  const safeH=clamp(Math.round(H/Math.max(.25,state.camera.zoom)*.72),360,680);
  let w=Math.min(460,safeW),h=Math.min(330,safeH);
  if(it.kind==="link"&&f){
    w=Math.min(480,safeW);h=Math.min(340,safeH); /* 网页：舒适缩略视口；全屏查看完整网页 */
  }else if(it.kind==="img"&&it.tw&&it.th){
    const maxW=460,maxH=340,asp=it.tw/it.th;
    if(asp>1){w=maxW;h=Math.min(maxH,maxW/asp);}
    else{h=maxH;w=Math.min(maxW,maxH*asp);}
  }else if(it.kind==="media"){
    w=Math.min(500,safeW);h=Math.min(340,safeH)+PV_HEAD_H;
  }else if(it.kind==="doc"||it.kind==="sheet"||it.kind==="pdf"||it.kind==="slide"){
    w=Math.min(460,safeW);h=Math.min(330,safeH)+PV_HEAD_H;
  }
  return {w,h};
}
/* I5-fix: previewHeadBounds 无任何调用方，删除（收起热区唯一由 previewCollapseBounds 承担） */
/* 预览态"收起"专用按钮区：标题栏右侧的胶囊钮（唯一收起热区） */
function previewCollapseBounds(it){
  const b=itemBounds(it);if(!b)return null;
  const CBW=30/* 世界单位 */;
  return {x:b.x+b.w-CBW-4,y:b.y+4,w:CBW,h:PV_HEAD_H-8};
}
function animatePreviewMorph(it,from,to,done){
  const cid=String(it.id);
  const prev=morphAnimFrames.get(cid);
  if(prev)cancelAnimationFrame(prev);
  const t0=performance.now(),dur=280;
  function step(now){
    const p=Math.min(1,(now-t0)/dur);
    const e=1-Math.pow(1-p,3);
    it.w=from.w+(to.w-from.w)*e;
    it.h=from.h+(to.h-from.h)*e;
    render();
    if(p<1)morphAnimFrames.set(cid,requestAnimationFrame(step));
    else{morphAnimFrames.delete(cid);it.w=to.w;it.h=to.h;if(done)done();}
  }
  morphAnimFrames.set(cid,requestAnimationFrame(step));
}
function togglePreviewMorph(it){
  if(!it||it.type!=="fileCard")return;
  if(it._cardW===undefined){it._cardW=160;it._cardH=it.kind==="img"&&it.tw&&it.th?160:52;}
  const from={w:it.w||it._cardW,h:it.h||it._cardH};
  /* I5-fix: 先快照后翻转——原顺序 pushHistory 拿到的已是翻转后的状态，撤销成了无效操作 */
  pushHistory(it.previewOpen?"收起预览":"展开预览");
  let to;
  if(it.previewOpen){
    /* C7: 收起前记住当前尺寸和缩放，下次展开时恢复 */
    it._morphW=it.w;it._morphH=it.h;
    /* 记住 DOM 覆盖层的 pvZoom */
    const m=getMorph(it.id);
    if(m&&m.el)it._morphPvZoom=parseFloat(m.el.dataset.pvZoom||"1");
    to={w:it._cardW,h:it._cardH};
  }else{
    /* C7: 展开时恢复记忆的尺寸，没有记忆则用默认 */
    if(it._morphW&&it._morphH){to={w:it._morphW,h:it._morphH};}
    else{to=previewTargetSize(it);}
  }
  it.previewOpen=!it.previewOpen;
  animatePreviewMorph(it,from,to,()=>{
    /* 展开完成后：以该卡片为锚做局部避让，推走被新预览覆盖的相邻元素
       （此前仅在拖动时触发 localAvoid，导致依次形变多个附件时相互重叠）；
       若场景中已有多个展开预览且局部推挤会保留重叠，再全局避让一轮兜底 */
    if(it.previewOpen){
      localAvoid(it);
      const openCount=state.items.filter(x=>x.type==="fileCard"&&x.previewOpen).length;
      if(openCount>1)avoidOverlap();
    }
    render();saveState();
  });
}
function drawFileCard(it,cc){
  const c=cc||ctx;const b=itemBounds(it);
  const f=state.files.find(x=>x.id===it.fileId);
  const z=state.camera.zoom;
  const sel=it.id===state.selected;
  /* —— 全局样式：附件卡片与思维导图节点统一 —— */
  const SC=styleCfg();
  const fcAlpha=c.globalAlpha;
  if(SC.neumorph){drawNeumorph(c,b.x,b.y,b.w,b.h,SC.radius,sel,state.dark,state.bgColor);}else if(SC.colorful){drawColorful(c,b.x,b.y,b.w,b.h,SC.radius,sel,state.dark,"#ffffff");}else if(SC.bento){drawColorful(c,b.x,b.y,b.w,b.h,SC.radius,sel,state.dark,"#ffffff");}else if(SC.editorial){drawColorful(c,b.x,b.y,b.w,b.h,SC.radius,sel,state.dark,"#fff8e1");}else{
  c.save();
  /* L1.3 LOD: 拖动/相机手势时跳过附件卡片投影，松手恢复。 */
  if(!previewInteractionActive()){
  c.shadowColor=sel?"rgba(45,95,211,.35)":"rgba(0,0,0,"+SC.shadowAlpha+")";
  c.shadowBlur=(sel?12:SC.shadowBlur)/z;c.shadowOffsetY=2/z;
  }
  if(SC.nodeAlpha<1)c.globalAlpha=fcAlpha*SC.nodeAlpha;
  roundRectPath(c,b.x,b.y,b.w,b.h,SC.radius);
  if(SC.paper){
    const pg=c.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
    pg.addColorStop(0,"#fffdf7");pg.addColorStop(1,"#f3e7cf");c.fillStyle=pg;
  }else if(SC.glass){
    const gg=c.createLinearGradient(b.x,b.y,b.x+b.w,b.y+b.h);
    gg.addColorStop(0,dc("rgba(255,255,255,.82)","rgba(93,116,164,.62)"));gg.addColorStop(1,dc("rgba(207,222,255,.48)","rgba(31,39,62,.78)"));c.fillStyle=gg;
  }else c.fillStyle=dc("#ffffff","#2c2c2e");
  c.fill();
  c.globalAlpha=fcAlpha;
  c.lineWidth=(SC.paper?1.1:1)/z;c.strokeStyle=SC.paper?"rgba(104,76,42,.52)":SC.glass?dc("rgba(255,255,255,.76)","rgba(255,255,255,.12)"):SC.borderColor;
  c.globalAlpha=fcAlpha*Math.max(.25,SC.borderAlpha*2.2);c.stroke();
  c.globalAlpha=fcAlpha;
  c.restore();
  if(SC.glass){
    c.save();roundRectPath(c,b.x+1/z,b.y+1/z,b.w-2/z,b.h-2/z,SC.radius);c.clip();
    const shine=c.createLinearGradient(b.x,b.y,b.x+b.w*.65,b.y+b.h);
    shine.addColorStop(0,"rgba(255,255,255,.38)");shine.addColorStop(.4,"rgba(255,255,255,.06)");shine.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=shine;c.fillRect(b.x,b.y,b.w,b.h);c.restore();
  }
  } /* end else */
  /* 顶部内高光（简约风格无材质，跳过） */
  c.save();
  roundRectPath(c,b.x+1/z,b.y+1/z,b.w-2/z,b.h-2/z,9);c.clip();
  if(!SC.minimal&&!SC.neumorph){
    c.strokeStyle=dc(dc("rgba(255,255,255,.2)","rgba(255,255,255,.04)"),"rgba(255,255,255,.06)");c.lineWidth=1/z;
    c.beginPath();c.moveTo(b.x+3/z,b.y+1/z);c.lineTo(b.x+b.w-3/z,b.y+1/z);c.stroke();
  }
  c.restore();
  /* 选中态描边：品牌亮色 + 外发光（不再用深色实线） */
  if(sel){
    c.save();
    const HL=state.dark?"#8fb0e8":"#2d5fd3";
    c.shadowColor=state.dark?"rgba(143,176,232,.75)":"rgba(45,95,211,.55)";
    c.shadowBlur=14/z;
    c.strokeStyle=HL;c.lineWidth=2/z;
    roundRectPath(c,b.x-2/z,b.y-2/z,b.w+4/z,b.h+4/z,11.5);c.stroke();
    c.shadowColor="transparent";
    c.strokeStyle=dc("rgba(255,255,255,.55)","rgba(255,255,255,.1)");c.lineWidth=1/z;
    roundRectPath(c,b.x+.8/z,b.y+.8/z,b.w-1.6/z,b.h-1.6/z,9.5);c.stroke();
    c.restore();
  }
  const pad=10;
  if(!f){c.fillStyle=dc("#a1a1a6","#636366");c.font="12px "+FONT;c.textAlign="center";c.textBaseline="middle";c.fillText("文件已移除",b.x+b.w/2,b.y+b.h/2);return;}
  /* ===== 预览态（形变展开后）：顶部标题栏 + 大内容区，元素本体即预览 ===== */
  if(it.previewOpen){
    const hasMorph=state._exporting?false:!!getMorph(it.id);
    const headH=hasMorph?0:PV_HEAD_H,cy=b.y+headH,ch=Math.max(10,b.h-headH);
    if(!hasMorph){
    /* 标题栏（仅在 DOM 覆盖层不存在时绘制——动画期间或覆盖层尚未创建时；
       覆盖层接管后由 pv-morph-tools 统一提供标题与控件，不再画 canvas 标题栏） */
    c.save();
    roundRectPath(c,b.x,b.y,b.w,headH,10,10,0,0);c.clip();
    c.fillStyle=dc("rgba(45,95,211,.09)","rgba(255,255,255,.09)");c.fill();
    c.restore();
    c.save();
    c.fillStyle=dc("#1a1a2e","#f5f5f7");c.font="600 12px "+FONT;c.textAlign="left";c.textBaseline="middle";
    c.save();c.font="10px "+FONT;c.textBaseline="middle";var fn=f.name||"";var maxW=b.w-20;var fnLines=wrapLines(c,fn,maxW);var fnH=fnLines.length*12;if(fnH<=headH-4){fnLines.forEach(function(ln,i){c.fillText(ln,b.x+10,b.y+headH/2-(fnLines.length-1)*6+i*12);});}else{c.font="9px "+FONT;c.fillText(truncateStr(fn,maxW),b.x+10,b.y+headH/2);}c.restore();
    /* 明确标识的收起按钮：右上角胶囊钮 + 上箭头（收起/退回复原卡片，比 × 更直观） */
    const cb=previewCollapseBounds(it);
    if(cb){
      /* 悬停检测：鼠标是否在收起钮上（用于 hover 高亮） */
      const hover=state.hover&&state.hover.id===it.id;
      c.save();
      c.translate(cb.x+cb.w/2,cb.y+cb.h/2);
      /* 胶囊底：柔和渐变，hover 时品牌色 */
      const grd=c.createLinearGradient(cb.x,cb.y,cb.x,cb.y+cb.h);
      const baseCol=dc("rgba(45,95,211,.16)",dc("rgba(255,255,255,.2)","rgba(255,255,255,.04)"));
      grd.addColorStop(0,hover?"rgba(45,95,211,.34)":baseCol);
      grd.addColorStop(1,hover?"rgba(45,95,211,.2)":dc("rgba(45,95,211,.1)","rgba(255,255,255,.12)"));
      c.fillStyle=grd;
      roundRectPath(c,-cb.w/2,-cb.h/2,cb.w,cb.h,cb.h/2);c.fill();
      /* 描边 */
      c.strokeStyle=hover?dc("rgba(45,95,211,.6)","rgba(255,255,255,.55)"):dc("rgba(45,95,211,.4)","rgba(255,255,255,.35)");
      c.lineWidth=1/z;
      roundRectPath(c,-cb.w/2,-cb.h/2,cb.w,cb.h,cb.h/2);c.stroke();
      /* 上箭头（收起语义：内容收回卡片） */
      c.strokeStyle=hover?dc("#2d5fd3","#fff"):dc("#4a5a7b","#c8c8cc");
      c.lineWidth=1.7/z;c.lineCap="round";c.lineJoin="round";
      const s=cb.w*0.26;
      c.beginPath();c.moveTo(-s,cb.h*0.12);c.lineTo(0,-cb.h*0.18);c.lineTo(s,cb.h*0.12);c.stroke();
      c.restore();
    }
    c.strokeStyle=dc("rgba(0,0,0,.08)","rgba(255,255,255,.12)");c.lineWidth=1/z;
    c.beginPath();c.moveTo(b.x,b.y+headH);c.lineTo(b.x+b.w,b.y+headH);c.stroke();
    c.restore();
    } /* end if(!hasMorph) — 标题栏仅无覆盖层时绘制 */
    /* 内容区 */
    c.save();
    roundRectPath(c,b.x,cy,b.w,ch,0,0,10,10);c.clip();
    /* DOM owns live preview content. Canvas only renders it for image export. */
    if(!state._exporting&&!hasMorph){
      c.fillStyle=dc("#f5f6f8","#22222a");c.fillRect(b.x,cy,b.w,ch);
      c.fillStyle=dc("#6e7080","#98989d");c.font="12px "+FONT;c.textAlign="center";c.textBaseline="middle";
      c.fillText("正在准备预览…",b.x+b.w/2,cy+ch/2);
    }
    if(it.previewOpen&&state._exporting){
      if(state._cameraInteracting){c.fillStyle=dc("rgba(240,242,245,.95)","rgba(28,28,32,.95)");c.fillRect(b.x,cy,b.w,ch);c.fillStyle=dc("#9a9a9e","#7a7a7e");c.font="12px "+SANS_STACK;c.textAlign="center";c.textBaseline="middle";var _fn=f?f.name:"";c.fillText(_fn.length>22?_fn.slice(0,20)+"…":_fn,b.x+b.w/2,cy+ch/2);}else{
      const pv=getPreviewContent(it.fileId);
      const isMd=f&&/\.(md|markdown)$/i.test(f.name);
      /* 多维覆盖层已存在（DOM 层正在/已经呈现内容）→ canvas 不画白底，
         避免"canvas 白底占位 ↔ DOM 内容"每帧交替造成的闪烁 */
      if(isMd){
        /* Markdown：DOM 覆盖层完整渲染（标题/表格/列表/代码/下划线） */
        if(!hasMorph){c.fillStyle=dc("rgba(255,255,255,.94)","rgba(30,30,34,.94)");c.fillRect(b.x,cy,b.w,ch);}
        /* Live creation is handled by the visible preview queue. */
      }else if(pv&&pv.kind==="img"&&pv.img){
        if(pv.img){c.drawImage(pv.img,b.x,cy,b.w,ch);}else{c.fillStyle=dc("#f5f6f8","#22222a");c.fillRect(b.x,cy,b.w,ch);}
      }else if(pv&&pv.text){
        /* 文本：真实内容预览（等宽字体 + 行距，保证可读） */
        if(!hasMorph){c.fillStyle=dc("#ffffff","#1c1c1e");c.fillRect(b.x,cy,b.w,ch);}
        const fs2=12,lh=Math.round(fs2*1.7),padX=14,padY=12;
        c.font=fs2+"px "+MONO_STACK;
        c.fillStyle=dc("#1a1a2e","#e8e8ea");c.textAlign="left";c.textBaseline="top";
        const maxW=b.w-padX*2;
        let y=cy+padY;
        for(const rawLine of pv.text.split("\n")){
          if(y>cy+ch-padY)break;
          /* 简单折行 */
          let line=rawLine;
          while(line.length){
            let cut=line.length;
            while(cut>1&&c.measureText(line.slice(0,cut)).width>maxW)cut--;
            if(y>cy+ch-padY)break;
            c.fillText(line.slice(0,cut),b.x+padX,y);
            y+=lh;
            line=line.slice(cut);
          }
        }
      }else if(pv&&pv.loading){
        /* 加载中（仅无覆盖层时画占位；有覆盖层则 DOM 的 loading 态可见，避免双闪） */
        if(!hasMorph){
          c.fillStyle=dc("#f5f6f8","#22222a");c.fillRect(b.x,cy,b.w,ch);
          c.fillStyle=dc("#6e7080","#98989d");c.font="12px "+FONT;c.textAlign="center";c.textBaseline="middle";
          c.fillText("正在加载预览…",b.x+b.w/2,cy+ch/2);
        }
      }else if(f.kind==="doc"||f.kind==="sheet"||f.kind==="pdf"||f.kind==="slide"||f.kind==="link"||f.kind==="media"){
        /* 文档/表格/PPT/PDF/链接/音视频：由 DOM 覆盖层直接渲染真实预览
           （canvas 仅在无覆盖层时画半透明白底占位，避免闪烁） */
        if(!hasMorph){c.fillStyle=dc("rgba(255,255,255,.88)","rgba(30,30,34,.88)");c.fillRect(b.x,cy,b.w,ch);}
        if(state._exporting){
          /* J3-fix: 导出时 DOM 类预览画文件名+类型占位，避免空白 */
          c.fillStyle=dc("#3a4a6b","#6a7a9b");c.font="600 15px "+FONT;c.textAlign="center";c.textBaseline="middle";
          c.fillText(KIND_LABEL[f.kind]||"文件",b.x+b.w/2,cy+ch/2-12);
          c.fillStyle=dc("#1a1a2e","#e8e8ea");c.font="600 12px "+FONT;
          c.fillText(truncateStr(f.name,b.w-28),b.x+b.w/2,cy+ch/2+12);
          c.textAlign="start";c.textBaseline="alphabetic";
        }
        /* Live creation is handled by the visible preview queue. */
      }else{
        /* 其他二进制：信息卡 + 下载降级提示 */
        c.fillStyle=dc("#f5f6f8","#22222a");c.fillRect(b.x,cy,b.w,ch);
        const kindLabel=KIND_LABEL[f.kind]||"文件";
        c.fillStyle=dc("#3a4a6b","#6a7a9b");c.font="600 15px "+FONT;c.textAlign="center";c.textBaseline="middle";
        c.fillText(kindLabel,b.x+b.w/2,cy+ch/2-24);
        c.fillStyle=dc("#1a1a2e","#e8e8ea");c.font="600 12px "+FONT;
        c.fillText(truncateStr(f.name,b.w-28),b.x+b.w/2,cy+ch/2);
        c.fillStyle=dc("#6e7080","#98989d");c.font="10px "+FONT;
        const sz=f.size?formatSize(f.size):"";
        c.fillText(sz+" · 点击下方下载查看",b.x+b.w/2,cy+ch/2+22);
      }
    }
    }
    c.restore();
    c.textAlign="start";c.textBaseline="alphabetic";
    /* H-fix: 形变态原本在此 return，跳过了 drawAnnotation → 批注完全不画（用户看不到提示）。
       现补画批注：cue 已在 drawAnnotationCue 内上移到 morph 覆盖层上方，bubble（选中态文字）画在 b 外侧，均可见。 */
    drawAnnotation(it,b);
    return;
  }
  if(it.kind==="img"&&it.thumb){
    /* 图片整张填充卡片 */
    c.save();
    roundRectPath(c,b.x,b.y,b.w,b.h,10);c.clip();
    if(it.thumb&&typeof it.thumb==="object"){try{c.drawImage(it.thumb,b.x,b.y,b.w,b.h);}catch(e){c.fillStyle=dc("#f5f6f8","#22222a");c.fillRect(b.x,b.y,b.w,b.h);}}else{c.fillStyle=dc("#f5f6f8","#22222a");c.fillRect(b.x,b.y,b.w,b.h);}
    c.restore();
    /* 底部文件名条 */
    c.save();
    c.fillStyle="rgba(0,0,0,.5)";
    roundRectPath(c,b.x,b.y+b.h-20,b.w,20,0,0,10,10);c.fill();
    c.fillStyle="#fff";c.font="10px "+FONT;c.textAlign="left";c.textBaseline="middle";
    c.fillText(truncateStr(f.name,b.w-12),b.x+6,b.y+b.h-10);
    c.restore();
  }else if(it.kind==="link"){
    const tx=b.x+pad;
    c.fillStyle=dc("#3a4a6b","#6a7a9b");c.font="600 11.5px "+FONT;c.textAlign="left";c.textBaseline="middle";
    c.fillText(truncateStr(it.title||f.name,b.w-pad*2),tx,b.y+b.h/2-6);
    c.fillStyle=dc("#a1a1a6","#636366");c.font="10px "+FONT;
    c.fillText(truncateStr(hostOf(f.url),b.w-pad*2),tx,b.y+b.h/2+10);
  }else{
    const tx=b.x+pad;
    c.fillStyle=dc("#1d1d1f","#f5f5f7");c.font="600 11.5px "+FONT;c.textAlign="left";c.textBaseline="middle";
    c.fillText(truncateStr(f.name,b.w-pad*2),tx,b.y+b.h/2-6);
    c.fillStyle=dc("#a1a1a6","#636366");c.font="10px "+FONT;
    c.fillText(KIND_LABEL[f.kind]||"文件",tx,b.y+b.h/2+10);
  }
  /* （已移除：文件卡片右上角的关联角标） */
  /* 拟物手作：附件礼物包装（缎带 + 蝴蝶结小角标）——简约风格禁用（无装饰） */
  const SCg=styleCfg();
  if(SCg.gift&&!SCg.minimal&&(f.kind==="doc"||f.kind==="sheet"||f.kind==="pdf"||f.kind==="slide"||f.kind==="other")){
    c.save();
    const gw=b.w,gh=b.h;
    /* 底部缎带横条 */
    c.fillStyle=dc("rgba(214,87,60,.16)","rgba(255,138,101,.2)");
    c.fillRect(b.x+1,b.y+gh-6,b.w-2,2.5);
    /* 垂直缎带（居中） */
    c.fillStyle=dc("rgba(214,87,60,.14)","rgba(255,138,101,.18)");
    c.fillRect(b.x+b.w/2-1.5,b.y+4,3,b.h-8);
    /* 顶部蝴蝶结：两小圆 + 中心结 */
    const bx=b.x+b.w/2,by=b.y+6;
    c.fillStyle=dc("rgba(214,87,60,.45)","rgba(255,138,101,.5)");
    c.beginPath();c.arc(bx-5,by-3,3.6,0,Math.PI*2);c.fill();
    c.beginPath();c.arc(bx+5,by-3,3.6,0,Math.PI*2);c.fill();
    c.beginPath();c.arc(bx,by-1,2.2,0,Math.PI*2);c.fill();
    c.restore();
  }
  c.textAlign="start";c.textBaseline="alphabetic";
  drawDetail(it,b);
  drawAnnotation(it,b);
}
