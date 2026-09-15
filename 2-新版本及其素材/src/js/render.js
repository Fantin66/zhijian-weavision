"use strict";
/* C4 Neumorphism */
function neumorphPath(c,x,y,w,h,r){roundRectPath(c,x,y,w,h,r);}
function drawNeumorph(c,x,y,w,h,r,sel,dark,bgColor){
  const z=state.camera.zoom;const off=6/z,blur=22/z;
  const surface=dark?"#2e2e34":"#f2f3f6";
  const ls=dark?"rgba(0,0,0,.15)":"rgba(255,255,255,.95)";
  const ds=dark?"rgba(0,0,0,.5)":"rgba(28,42,74,.14)";
  if(sel){
    c.save();c.shadowColor=ds;c.shadowOffsetX=-off;c.shadowOffsetY=-off;c.shadowBlur=blur;neumorphPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
    c.save();c.shadowColor=ls;c.shadowOffsetX=off;c.shadowOffsetY=off;c.shadowBlur=blur;neumorphPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
  }else{
    c.save();c.shadowColor=ls;c.shadowOffsetX=-off;c.shadowOffsetY=-off;c.shadowBlur=blur;neumorphPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
    c.save();c.shadowColor=ds;c.shadowOffsetX=off;c.shadowOffsetY=off;c.shadowBlur=blur;neumorphPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
  }
}

/* C9 多彩拟态: colored surface + soft dual shadow */
function drawColorful(c,x,y,w,h,r,sel,dark,color){
  const z=state.camera.zoom;const off=5/z,blur=16/z;
  const surface=dark?shadeColor(color,.3):shadeColor(color,1.15);
  const ls=dark?"rgba(255,255,255,.06)":"rgba(255,255,255,.6)";
  const ds=dark?"rgba(0,0,0,.35)":"rgba(0,0,0,.12)";
  if(sel){
    c.save();c.shadowColor=ds;c.shadowOffsetX=-off;c.shadowOffsetY=-off;c.shadowBlur=blur;roundRectPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
    c.save();c.shadowColor=ls;c.shadowOffsetX=off;c.shadowOffsetY=off;c.shadowBlur=blur;roundRectPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
  }else{
    c.save();c.shadowColor=ls;c.shadowOffsetX=-off;c.shadowOffsetY=-off;c.shadowBlur=blur;roundRectPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
    c.save();c.shadowColor=ds;c.shadowOffsetX=off;c.shadowOffsetY=off;c.shadowBlur=blur;roundRectPath(c,x,y,w,h,r);c.fillStyle=surface;c.fill();c.restore();
  }
}
/* ============================================================
   渲染
============================================================ */
function inViewport(b){const z=state.camera.zoom,m=80/z,vx=state.camera.x-m,vy=state.camera.y-m,vw=W/z+2*m,vh=H/z+2*m;return b.x<vx+vw&&b.x+b.w>vx&&b.y<vy+vh&&b.y+b.h>vy;}
function render(){
  const perfFrame=ZhijianPerf.beginFrame();
  syncHistoryBtns();
  ensureIdMap();
  if(W<=0||H<=0){W=board.clientWidth||1;H=board.clientHeight||1;}
  /* F1 */
  const z=state.camera.zoom;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  /* F1 材质系统：背景由 L1–L4 DOM 层处理，canvas 仅画节点/连线/便签。
     仍同步 bgColor 供 HUD 颜色自适应 + 导出管线使用。 */
  state.bgColor=getBgColor(state.bgColorName,state.dark);
  ctx.save();
  ctx.translate(-state.camera.x*z,-state.camera.y*z);
  ctx.scale(z,z);
  /* drawGrid 已迁移到 L4 DOM 图案层，不再在 canvas 上绘制 */
  /* 聚焦模式：计算分层（I5-fix: focusSecondary/getSecondary 计算后从未被消费，删除） */
  let focusPrimary=null,focusId=null;
  if(state.focusMode){
    focusId=state.focusMode.id;
    focusPrimary=getRelated(focusId);
  }
  drawMindConnections(focusPrimary);
  drawLinks(focusPrimary);
  ZhijianPerf.mark(perfFrame,"relations");
  const sel=selectedItem();
  const filterOk=()=>true;
  /* 聚焦模式：过渡期间非关联元素渐隐，完成后不画 */
  if(focusId!==null){
    /* 过渡期间：非关联元素用淡出 alpha 绘制 */
    if(focusTransition<1){
      ctx.save();
      ctx.globalAlpha=1-focusTransition;
      for(const it of state.items){
        if(!focusPrimary.has(it.id)&&it.id!==focusId&&filterOk(it)){
          drawItem(it);
        }
      }
      ctx.restore();
    }
    /* 直接关联：正常显示，但只给轻量关联光晕。 */
    ctx.save();
    for(const it of state.items){
      if(focusPrimary.has(it.id)&&it.id!==focusId&&filterOk(it)){
        const b=itemBounds(it);
        /* 关联项只保留一层蓝紫环境光，不再套黄色边框。 */
        if(b){
          ctx.save();ctx.globalAlpha=.1;ctx.fillStyle="rgba(80,126,232,.42)";
          ctx.shadowColor="rgba(74,119,232,.55)";ctx.shadowBlur=22/z;
          roundRectPath(ctx,b.x-1/z,b.y-1/z,b.w+2/z,b.h+2/z,11);ctx.fill();ctx.restore();
        }
        drawItem(it);
      }
    }
    ctx.restore();
    /* 焦点：放大+发光 */
    ctx.save();
    const focusIt=idMap.get(focusId);
    if(focusIt&&filterOk(focusIt)){
      const fb=itemBounds(focusIt);
      if(fb){
        /* 放大后实际占位（描边必须跟随放大，否则框比元素小） */
        const SCALE=1.15;
        const cx=fb.x+fb.w/2,cy=fb.y+fb.h/2;
        const gb={x:cx-fb.w*SCALE/2,y:cy-fb.h*SCALE/2,w:fb.w*SCALE,h:fb.h*SCALE};
        /* 仅保留焦点外侧的冷色光影，不再额外画"框"。 */
        ctx.save();
        ctx.shadowColor="rgba(73,119,235,"+(state.dark?".68":".48")+")";
        ctx.shadowBlur=42/z;
        ctx.fillStyle="rgba(82,126,238,.10)";ctx.globalAlpha=.9;
        roundRectPath(ctx,gb.x-4/z,gb.y-4/z,gb.w+8/z,gb.h+8/z,15);ctx.fill();
        ctx.restore();
        /* 绘制放大的元素本体 */
        ctx.save();
        ctx.translate(cx,cy);
        ctx.scale(SCALE,SCALE);
        ctx.translate(-cx,-cy);
        drawItem(focusIt);
        ctx.restore();
      }
    }
    ctx.restore();
    /* 与焦点直接关联的画笔/锚定连线才保留。 */
    for(const it of state.items){
      if(it.type==="stroke"||it.type==="connector"){
        if(focusPrimary.has(it.id)&&filterOk(it)) drawItem(it);
      }
    }
  }else{
    /* 普通模式 */
    /* 空画布引导 */
    if(state.items.length===0&&!state.focusMode){
      const cx=state.camera.x+W/(2*z),cy=state.camera.y+H/(2*z);
      ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";
      /* 织纹背景 — 交织斜线隐喻纺织 */
      const weave=200/z;
      ctx.save();ctx.globalAlpha=state.dark?.04:.035;
      ctx.strokeStyle=state.dark?"#5b7bc4":"#3a4a6b";ctx.lineWidth=1/z;
      for(let i=-3;i<=3;i++){
        ctx.beginPath();
        ctx.moveTo(cx+i*weave*.7-50/z,cy-50/z);
        ctx.lineTo(cx+i*weave*.7+50/z,cy+50/z);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx-i*weave*.7-50/z,cy-50/z);
        ctx.lineTo(cx-i*weave*.7+50/z,cy+50/z);
        ctx.stroke();
      }
      ctx.restore();
      /* 装饰圆环 */
      ctx.save();ctx.globalAlpha=state.dark?.1:.08;
      ctx.strokeStyle=state.dark?"#5b7bc4":"#3a4a6b";ctx.lineWidth=1.5/z;
      ctx.beginPath();ctx.arc(cx,cy-28/z,38/z,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=state.dark?.05:.04;ctx.lineWidth=1/z;
      ctx.beginPath();ctx.arc(cx,cy-28/z,52/z,0,Math.PI*2);ctx.stroke();
      ctx.restore();
      /* 大号品牌字 — 用楷体增强文化感 */
      ctx.font="700 42px "+BRAND_FONT;
      ctx.globalAlpha=state.dark?.22:.18;
      ctx.fillStyle=state.dark?"#7b9bd4":"#3a4a6b";
      ctx.fillText("织",cx,cy-28/z);
      /* 提示文字 */
      ctx.font="600 14px "+FONT;ctx.globalAlpha=state.dark?.55:.45;
      ctx.fillStyle=state.dark?"#98989d":"#6e6e73";
      ctx.fillText("双击任意位置开始织网",cx,cy+22/z);
      ctx.font="400 11px "+FONT;ctx.globalAlpha=state.dark?.4:.35;
      ctx.fillStyle=state.dark?"#98989d":"#a0a2b0";
      ctx.fillText("或从左侧材料库拖入文件 · 导入材料后拖到画布",cx,cy+42/z);
      ctx.restore();
    }
    for(const it of state.items){
      if(it.type!=="mindNode"&&filterOk(it)){const _b=itemBounds(it);if(!_b||inViewport(_b))drawItem(it);} /* H3 任务14: 视口裁剪，跳过屏幕外元素 */
    }
    for(const it of state.items){
      if(it.type==="mindNode"&&isMindNodeVisible(it)&&filterOk(it)){const _b=itemBounds(it);if(!_b||inViewport(_b))drawItem(it);} /* H3 任务14: 视口裁剪 */
    }
  }
  /* 选中框/手柄叠加在内容之上 */
  if(sel&&!state.focusMode&&filterOk(sel)&&(sel.type!=="mindNode"||isMindNodeVisible(sel))) drawSelection(sel);
  if(state.multiSel.length) drawMultiSel();
  drawMarqueeSelection();
  /* 拖动/缩放期间不画 hover 框，避免框停在旧位置造成"漂移"观感 */
  if(state.hover && state.hover.id&&(!sel||state.hover.id!==sel.id)&&!drag){
    const hov=idMap.get(state.hover.id);
    if(hov&&filterOk(hov)&&(hov.type!=="mindNode"||isMindNodeVisible(hov))){
      const hb=itemBounds(hov);
      if(hb){
        ctx.save();
        /* hover 预发光：极淡背景光晕 */
        if(hov.type==="mindNode"||hov.type==="note"){
          ctx.shadowColor=hov.type==="mindNode"?"rgba(45,95,211,.15)":dc("rgba(255,255,255,.3)","rgba(255,255,255,.06)");
          ctx.shadowBlur=14/z;
          ctx.fillStyle="rgba(45,95,211,.04)";
          roundRectPath(ctx,hb.x,hb.y,hb.w,hb.h,hov.type==="mindNode"?10:6);ctx.fill();
          ctx.shadowColor="transparent";
        }
        ctx.lineWidth=2/z;
        ctx.strokeStyle=hov.type==="mindNode"?"#3a4a6b":"rgba(60,60,67,.45)";
        if(hov.type==="mindNode"){ctx.setLineDash([]);ctx.shadowColor="rgba(45,95,211,.35)";ctx.shadowBlur=10/z;}
        else ctx.setLineDash([5/z,4/z]);
        roundRectPath(ctx,hb.x-3/z,hb.y-3/z,hb.w+6/z,hb.h+6/z,hov.type==="mindNode"?10:8);
        ctx.stroke();
        ctx.restore();
        /* hover 到含 detail 的元素时，在右上角显示文档图标提示 */
        if(hov.detail&&!state.focusMode){
          ctx.save();
          ctx.font=(10/z)+"px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
          ctx.fillStyle="rgba(45,95,211,.5)";
          ctx.fillText("📄",hb.x+hb.w-6/z,hb.y-10/z);
          ctx.restore();
        }
      }
    }
  }
  /* 搜索高亮 */
  if(state._hlIds){
    const curId=state.search?state.search.results[state.search.idx]:null;
    /* 聚焦模式下的非关联元素，淡出且不画搜索高亮 */
    const focusRel=state.focusMode?getRelated(state.focusMode.id):null;
    for(const id of state._hlIds){
      const it=idMap.get(id);
      if(!it||!filterOk(it)) continue;
      if(state.focusMode&&focusRel&&!focusRel.has(id))continue;
      const hb=itemBounds(it);
      if(!hb) continue;
      ctx.save();
      if(id===curId){
        ctx.strokeStyle="#c48840";ctx.lineWidth=2.6/z;
        ctx.shadowColor="rgba(255,159,10,.6)";ctx.shadowBlur=16/z;
      }else{
        ctx.strokeStyle="rgba(255,159,10,.55)";ctx.lineWidth=1.8/z;
      }
      ctx.setLineDash([5/z,4/z]);
      roundRectPath(ctx,hb.x-4/z,hb.y-4/z,hb.w+8/z,hb.h+8/z,12);
      ctx.stroke();
      ctx.restore();
    }
  }
  /* hover 节点时，高亮其关联物（便签/材料） */
  if(state.hover&&state.hover.type==="mindNode"){
    const n=state.items.find(x=>x.id===state.hover.id);
    /* （已移除：hover 节点时高亮其关联物的虚线框） */
  }
  if(drag){
    /* （已移除：拖动便签时的所有节点可挂接虚线提示） */
    if(drag.mode==="pen"&&drag.points.length>1){
      ctx.strokeStyle=state.penColor;ctx.lineWidth=state.penSize;
      ctx.lineCap="round";ctx.lineJoin="round";
      ctx.beginPath();
      drag.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.stroke();
    }
    if(drag.mode==="connector"){
      const a=resolveEnd(drag.a),b=resolveEnd(drag.b);
      drawConnectorLine(ctx,a,b,state.lineColor,Math.max(1.5,state.penSize),true);
    }
    /* （已移除：拖入节点时的 ⊕ 关联角标提示） */
    if(drag.mode==="mindLink"){
      const fb=itemBounds(drag.from);
      const fa={x:fb.x+fb.w,y:fb.y+fb.h/2};
      const tb=drag.to;
      ctx.save();
      ctx.strokeStyle="#3a4a6b";ctx.lineWidth=2/z;ctx.lineCap="round";
      ctx.setLineDash([8/z,5/z]);
      ctx.beginPath();ctx.moveTo(fa.x,fa.y);
      const mx=(fa.x+tb.x)/2;
      ctx.bezierCurveTo(mx,fa.y,mx,tb.y,tb.x,tb.y);
      ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle="#3a4a6b";
      ctx.beginPath();ctx.arc(tb.x,tb.y,5/z,0,7);ctx.fill();
      ctx.restore();
      if(drag.target){
        const tgb=itemBounds(drag.target);
        ctx.save();
        ctx.lineWidth=2.5/z;ctx.strokeStyle="#3a4a6b";
        ctx.shadowColor="rgba(45,95,211,.5)";ctx.shadowBlur=12/z;
        roundRectPath(ctx,tgb.x-4/z,tgb.y-4/z,tgb.w+8/z,tgb.h+8/z,12);ctx.stroke();
        ctx.fillStyle="#3a4a6b";ctx.font=(11/z)+"px sans-serif";ctx.textAlign="center";
        ctx.fillText("设为子节点",tgb.x+tgb.w/2,tgb.y-8/z);
        ctx.restore();
      }
    }
  }
  ctx.restore();
  ZhijianPerf.mark(perfFrame,"canvas");
  /* 连接点 hover tooltip — DOM 实现（K5-fix: canvas 绘制在 restore 后用世界坐标=位置漂移，
     字号 10/z 低缩放时巨大=大小不协调，canvas z-index 低于预览层=被遮挡） */
  var linkTip=document.getElementById("linkPtTip");
  if(linkTip){
    if(state.linkPointHover){
      var lnode=idMap.get(state.linkPointHover);
      if(lnode){
        var lb=itemBounds(lnode);
        var sx=(lb.x+lb.w-state.camera.x)*z,sy=(lb.y+lb.h/2-state.camera.y)*z;
        linkTip.textContent="拖出建立子节点";
        linkTip.style.display="block";
        linkTip.style.left=(sx+10)+"px";
        linkTip.style.top=(sy-linkTip.offsetHeight/2)+"px";
      }
    }else{linkTip.style.display="none";}
  }
  /* K7：相机手势中不写入与视图位置无关的 DOM，停止后下一帧再恢复。 */
  if(state._camInteracting){
    if(selbar)selbar.style.display="none";
  }else{
    updateSelBar();updateFocusHud();renderDock();
  }
  updateStatusBar();drawStatusHUD();
  /* J2-fix: 缩放/平移时跳过 DOM 同步 + 隐藏覆盖层——预览内容用 canvas 占位替代，
     停止后 200ms 自动恢复。避免 syncDetailReadDom 的 scrollWidth/Height 重排和
     syncMorphDom/syncPvDom 的逐元素样式写入拖慢缩放帧率 */
  if(state._camInteracting){
    if(previewLayer)previewLayer.style.visibility="hidden";
    if(typeof detailReadLayer!=="undefined"&&detailReadLayer)detailReadLayer.style.visibility="hidden";
  }else{
    if(previewLayer)previewLayer.style.visibility="";
    if(typeof detailReadLayer!=="undefined"&&detailReadLayer)detailReadLayer.style.visibility="";
    syncMorphDom();
    if(typeof syncDetailReadDom==="function")syncDetailReadDom();
    syncPvDom();
  }
  /* 连接待选态清理：待选元素被删/不存在时退出待选 */
  if(linkPendingId!==null&&!state.items.some(i=>i.id===linkPendingId))linkPendingId=null;
  /* 清理已删除连线的动画状态（防 Map 泄漏）。
     自由连接以 link.id 为键；导图隐式连线以 "mind:父:子" 为键——两者都要存活：
     mind 键由 drawMindConnections 按需复用，节点删除时另行清理 */
  if(linkAnimMap.size){
    const live=new Set(state.links.map(l=>l.id));
    for(const [lid] of linkAnimMap){
      if(lid.indexOf("mind:")===0){
        /* 校验导图连线两端节点是否仍存在（id 数值/字符串统一为 Number 比较） */
        const parts=lid.split(":");
        const pId=Number(parts[1]),cId=Number(parts[2]);
        const pOk=state.items.some(i=>i.id===pId);
        const cOk=state.items.some(i=>i.id===cId);
        if(!pOk||!cOk)linkAnimMap.delete(lid);
      }else if(!live.has(lid)){
        linkAnimMap.delete(lid);
      }
    }
  }
  const visibleCount=ZhijianPerf.isEnabled()?state.items.reduce((n,it)=>{const b=itemBounds(it);return n+(b&&inViewport(b)?1:0);},0):0;
  ZhijianPerf.endFrame(perfFrame,{items:state.items.length,links:state.links.length,visible:visibleCount});
  /* H1 任务3: 跃迁闪烁由 CSS .jump-confirm 动画完成，不再触发低频全量重绘定时器 */
}
/* 形变覆盖层跟随文件卡片：位置/尺寸按相机变换实时同步；
   卡片关闭形变或删除时销毁覆盖层 */
/* ============================================================
   预览内容 zoom 实时同步：画布缩放(camera.zoom)时，
   iframe/视频/图片等内容使用 transform 等比缩放，而非仅撑大容器。
   —— 根因修复：iframe 有独立文档流，容器 size 变化只会让内容重排，
      不会等比缩放。改为"固定逻辑视口 + scale(z)"与画布 transform 同步。
   预览窗口本身已经按画布缩放后的屏幕尺寸定位，因此 iframe 不再重复叠加画布 zoom；
   否则会在缩放画布时产生二次缩小、留白和不必要的滚动条。
============================================================ */
/* I5-fix: 手机/PC 网页视口缩放统一入口（此前 syncPvContentZoom 与 syncMorphDom 两份拷贝已漂移，且手机模式
   ratio=(375/宽)×userZoom 方向写反、漏乘画布 zoom——内容显示过大且不随画布缩放）。
   stagePx = 舞台的"渲染基准宽"：独立预览窗传屏幕像素宽(画布宽×z)；morph 覆盖层外层已带 scale(z)，传画布宽。
   mb(手机模式)：375 逻辑视口按 ratio=stagePx×zv/375 等比装入舞台，超出部分横向可滚；
   PC 模式：H5 尺寸补偿方案(宽高=100/eff% + zoom=eff)——框撑满、整页等比缩完整可见。 */
function applyWebViewportZoom(iframe,stage,stagePx,userZoom,mb){
  const zv=Math.max(0.3,Math.min(3,userZoom||1));
  if(mb){
    const ratio=(Math.max(60,stagePx)*zv)/375;
    iframe.style.width="375px";
    iframe.style.height="100%";
    applyEmbeddedPageZoom(iframe,ratio);
    stage.style.overflowX="auto";stage.style.overflowY="hidden";
    stage.style.justifyContent="center";stage.style.alignItems="flex-start";
  }else{
    const eff=zv*0.7;
    iframe.style.width=(100/eff)+"%";
    iframe.style.height=(100/eff)+"%";
    applyEmbeddedPageZoom(iframe,eff);
    stage.style.overflow="auto";
    stage.style.justifyContent="flex-start";stage.style.alignItems="flex-start";
  }
}
function syncPvContentZoom(el,pv,z){
  if(!el||!pv)return;
  const body=el.querySelector(".pv-body");
  if(!body)return;
  /* 1) 网页链接（iframe）：NoTab 100% 撑满 + CSS zoom（布局级缩放，不裁剪、不破坏滚动） */
  const iframe=body.__pvIframe;
  const stage=body.__pvStage;
  if(iframe&&stage){
    const mb=body.__pvMb?body.__pvMb():false;
    const userZoom=parseFloat(el.dataset.pvZoom||"1");
    applyWebViewportZoom(iframe,stage,(pv.w-16)*z,userZoom,mb);
    return;
  }
  /* 2) 视频/图片：object-fit:contain 随容器等比，无需额外处理 */
}
/* ============================================================
   左热区/Dock 相关同步（保留原 syncMorphDom）
============================================================ */
function syncMorphDom(){
  /* 防御：扫描 previewLayer 中的孤儿 .pv-morph 元素（不在 morphMap 中的残留覆盖层），
     避免残留 DOM 拦截画布指针事件导致附件拖不动 */
  const layer=document.getElementById("previewLayer");
  if(layer){
    for(const child of [...layer.children]){
      if(child.classList&&child.classList.contains("pv-morph")&&!child.dataset.card)continue;
      if(child.classList&&child.classList.contains("pv-morph")){
        const cid=child.dataset.card;
        if(!cid||!morphMap.has(cid)){child.remove();}
      }
    }
  }
  /* 多实例：遍历每个已展开卡片的覆盖层，跟随卡片位置/缩放；
     仍在预览态之外的覆盖层销毁（收起/删除时清理） */
  const morphSC=styleCfg();
  for(const [cardId,m] of [...morphMap]){
    const el=m.el;
    /* 防御：若节点已被其他逻辑移出 DOM，重新挂载 */
    if(!document.body.contains(el)){
      const layer=document.getElementById("previewLayer");
      if(layer)layer.appendChild(el);else{destroyMorphDom(cardId);continue;}
    }
    const card=state.items.find(i=>i.type==="fileCard"&&String(i.id)===cardId);
    if(!card||!card.previewOpen){
      destroyMorphDom(cardId);
      continue;
    }
    const b=itemBounds(card);
    if(!b){destroyMorphDom(cardId);continue;}
    const z=state.camera.zoom;
    /* C1 修复：形变层从卡片顶部开始（覆盖整张卡片），不再从 PV_HEAD_H 下方开始。
       此前 B1 从标题栏下方开始——但 canvas 标题栏与 DOM pv-morph-tools 形成双上栏。
       现在 canvas 不画标题栏（hasMorph 时跳过），形变层接管整个卡片区域。 */
    const tl=w2s(b.x,b.y);
    const w=Math.round(b.w),h=Math.round(b.h);
    el.style.left=tl.x+"px";
    el.style.top=tl.y+"px";
    el.style.width=Math.max(20,w)+"px";
    el.style.height=Math.max(20,h)+"px";
    el.style.transformOrigin="top left";
    el.style.transform="scale("+z+")";
    /* G11: 形变覆盖层圆角与画布卡片 SC.radius 同步，不再是硬编码直角 */
    el.style.borderRadius=morphSC.radius+"px";
    /* G7: 不再在容器尺寸变化时重算 docx 缩放 — 拖拽容器只改变可视区域，
       不影响 Word 页面缩放。fitDocxPreview 只在初始渲染和用户点缩放按钮时调用。 */
    /* 形变覆盖层内的 iframe（网页链接）—— I5-fix: 与 syncPvContentZoom 共用 applyWebViewportZoom。
       覆盖层外层已带 scale(z)（el.style.transform），故 stagePx 传画布宽 b.w-16，不再重复乘 z。 */
    const mBody=m.body||el.querySelector(".pv-morph-content")||el;
    if(mBody){
      const iframe=mBody.__pvIframe;
      const stage=mBody.__pvStage;
      if(iframe&&stage){
        const mb=mBody.__pvMb?mBody.__pvMb():false;
        const userZoom=parseFloat(el.dataset.pvZoom||"1");
        applyWebViewportZoom(iframe,stage,b.w-16,userZoom,mb);
      }
    }
  }
  /* G6 fix: previewOpen=true 但不在 morphMap 里的 fileCard，通过 ensureMorphDom 完整创建 */
  if(layer){
    for(const it of (state.items||[])){
      if(it.type==="fileCard"&&it.previewOpen&&it.fileId){
        const cid=String(it.id);
        if(!morphMap.has(cid)){
          /* 修复：previewOpen=true 但尺寸仍是卡片尺寸的情况（教程预设/AI build/update_item）。
             初始化 rest 尺寸 + 计算预览目标尺寸，确保覆盖层以正确尺寸创建。
             跳过正在动画的卡片，避免干扰 */
          if(!morphAnimFrames.has(cid)){
            if(it._cardW===undefined){it._cardW=160;it._cardH=it.kind==="img"&&it.tw&&it.th?160:52;}
            if(!it._morphW||!it._morphH||it._morphW<=(it._cardW||160)){const ts=previewTargetSize(it);it._morphW=ts.w;it._morphH=ts.h;}
            if(Math.abs((it.w||0)-it._morphW)>20||Math.abs((it.h||0)-it._morphH)>20){it.w=it._morphW;it.h=it._morphH;}
          }
          /* 委托 ensureMorphDom 完整创建：工具栏+拖拽+缩放+加载文件内容 */
          if(typeof ensureMorphDom==="function")ensureMorphDom(it);
        }
      }
    }
    layer.style.display=layer.children.length>0?"block":"none";
  }
}
function updateFocusHud(){
  if(!state.focusMode){focusHud.classList.remove("show");return;}
  const item=state.items.find(i=>i.id===state.focusMode.id);
  if(!item){focusHud.classList.remove("show");return;}
  const related=getRelated(item.id);
  focusHud.querySelector("strong").textContent=item.text||"未命名元素";
  focusHud.querySelector(".focus-meta").textContent="直接关系 "+Math.max(0,related.size-1)+" 个";
  focusHud.classList.add("show");
}
focusHud.querySelector("button").addEventListener("click",()=>exitFocus());
function drawGrid(z){
  const dark=state.dark;
  const pat=state.bgPattern||"grid";
  /* F1: 底色由统一函数 getBgColor 提供（原 BG_COLOR_MAP 已合并） */
  /* 纯色背景不需要纹理 */
  if(pat==="blank") return;
  let step=20;while(step*z<16) step*=2;
  const i0x=Math.floor(state.camera.x/step),i0y=Math.floor(state.camera.y/step);
  const i1x=Math.ceil((state.camera.x+W/z)/step),i1y=Math.ceil((state.camera.y+H/z)/step);
  /* 纹理必须在舒适阅读距离下仍可辨认；此前 4% 透明度几乎等同于无纹理。 */
  const fine=dark?"rgba(142,164,210,.11)":"rgba(45,95,211,.075)";
  const bold=dark?"rgba(142,164,210,.18)":"rgba(45,95,211,.14)";
  if(pat==="grid"||pat==="dots"){
    if(pat==="dots"){
      ctx.fillStyle=fine;
      for(let i=i0x;i<=i1x;i++)for(let j=i0y;j<=i1y;j++){
        if(i%5===0&&j%5===0) continue;
        ctx.beginPath();ctx.arc(i*step,j*step,0.8,0,7);ctx.fill();
      }
      ctx.fillStyle=bold;
      for(let i=Math.floor(i0x/5)*5;i<=i1x;i+=5)for(let j=Math.floor(i0y/5)*5;j<=i1y;j+=5){
        ctx.beginPath();ctx.arc(i*step,j*step,1.2,0,7);ctx.fill();
      }
    }else{
      ctx.lineWidth=1;ctx.strokeStyle=fine;
      ctx.beginPath();
      for(let i=i0x;i<=i1x;i++){if(i%5===0)continue;ctx.moveTo(i*step,i0y*step);ctx.lineTo(i*step,i1y*step);}
      for(let j=i0y;j<=i1y;j++){if(j%5===0)continue;ctx.moveTo(i0x*step,j*step);ctx.lineTo(i1x*step,j*step);}
      ctx.stroke();
      ctx.strokeStyle=bold;
      ctx.beginPath();
      for(let i=Math.floor(i0x/5);i<=Math.ceil(i1x/5);i++){ctx.moveTo(i*step*5,i0y*step);ctx.lineTo(i*step*5,i1y*step);}
      for(let j=Math.floor(i0y/5);j<=Math.ceil(i1y/5);j++){ctx.moveTo(i0x*step,j*step*5);ctx.lineTo(i1x*step,j*step*5);}
      ctx.stroke();
    }
  }else if(pat==="lines"){
    /* 横格线 */
    ctx.lineWidth=1;ctx.strokeStyle=fine;
    ctx.beginPath();
    for(let j=i0y;j<=i1y;j++){ctx.moveTo(i0x*step,j*step);ctx.lineTo(i1x*step,j*step);}
    ctx.stroke();
  }else if(pat==="kraft"||pat==="paper"){
    /* 草稿纸/牛皮纸：横格 + 左侧红色竖线 */
    ctx.lineWidth=1;ctx.strokeStyle=fine;
    ctx.beginPath();
    for(let j=i0y;j<=i1y;j++){ctx.moveTo(i0x*step,j*step);ctx.lineTo(i1x*step,j*step);}
    ctx.stroke();
    /* 左侧茜红竖线 — 染料色系 */
    ctx.strokeStyle=dark?"rgba(180,100,110,.35)":"rgba(138,74,90,.2)";
    ctx.lineWidth=1.5;
    const marginX=Math.ceil(state.camera.x/step)*step;
    ctx.beginPath();ctx.moveTo(marginX,i0y*step);ctx.lineTo(marginX,i1y*step);ctx.stroke();
  }
  /* 径向晕影：中心明亮、边缘渐暗，营造空间感 */
  const cx=state.camera.x+W/(2*z),cy=state.camera.y+H/(2*z);
  const rmax=Math.max(W,H)/(2*z)*1.3;
  const vg=ctx.createRadialGradient(cx,cy,0,cx,cy,rmax);
  vg.addColorStop(0,dark?"rgba(80,100,140,.025)":"rgba(45,95,211,.02)");
  vg.addColorStop(.6,dark?"rgba(0,0,0,0)":"rgba(0,0,0,0)");
  vg.addColorStop(1,dark?"rgba(0,0,0,.15)":"rgba(0,0,0,.04)");
  ctx.fillStyle=vg;
  ctx.fillRect(state.camera.x,state.camera.y,W/z,H/z);
}

/* ============================================================
   通用连线适配方法论（一套规则，适配所有布局方向）
   ------------------------------------------------------------
   【为什么以前会坏】
   旧代码硬编码"父节点右侧 → 子节点左侧"（nodeAnchorR → nodeAnchorL），
   且贝塞尔控制点固定取水平中点 mx。这是一套"向右排布"的隐含假设，
   一旦布局改为向下/向左/U型，连线就会从错误的边穿出、横穿元素、
   甚至反向折回，破坏视觉。

   【通用规则：三步推导】不做固定侧假设，全部由实际位置推导
   ① 定主轴（layoutAxis）
      由 state.layoutType 推出布局主轴方向 axis ∈ {x, y} 与正负号 sign
      （+1 表示子节点在父节点的正方向：右 / 下；-1 表示左 / 上）。
      U 型按"父→子"实际向量判断，不预设符号。
   ② 推导出口/入口（resolveAnchors）
      以父子两矩形的中心向量 v = child.center - parent.center 投影到主轴：
      - 若 |v·axis| ≥ |v·cross|（主轴位移占优）→ 出/入口取主轴两侧边中点
        （右向：父右→子左；左向：父左→子右；下向：父下→子上）
      - 否则（横轴位移占优，如同层或折返）→ 取横轴两侧边中点，
        保证连线沿最短路径出边，不横穿元素本体。
   ③ 定路径与拐角（routePath）
      统一用"出边 → 拐点 → 入边"的三段式：
      - 主轴连线：直连贝塞尔（S 形，控制点在中点，视觉平滑）
      - 跨轴连线：正交圆角折线（圆弧拐角，避免尖锐与交叉）
      拐角半径随连线长度自适应，短距离自动收紧，防止过度圆滑。

   【箭头语义】箭头始终沿"入边法线"方向插入（即垂直进入子节点边界），
   清晰表达依赖/层次方向；不再用连线两端点连线的粗略角度。
============================================================ */
/* ① 定主轴：返回 {axis:'x'|'y', sign:+1|-1, u:bool}（u=U型，需按向量判断） */
function layoutAxis(){
  const t=state.layoutType||"logic";
  if(t==="org")return{axis:"y",sign:1,u:false};        /* 向下 */
  if(t==="orgUp")return{axis:"y",sign:-1,u:false};     /* 向上 */
  if(t==="left")return{axis:"x",sign:-1,u:false};      /* 向左 */
  if(t==="u")return{axis:"x",sign:1,u:true};           /* U 型：按向量判断 */
  if(t==="fishbone")return{axis:"x",sign:1,u:true};    /* 鱼骨：上下交错，按向量 */
  if(t==="timeline")return{axis:"y",sign:1,u:false};   /* 时间轴：一级在轴，二级在下 */
  return{axis:"x",sign:1,u:false};                     /* 默认向右 */
}
/* 四方向边中点锚点 */
function anchorOn(b,side){
  if(side==="l")return{x:b.x,y:b.y+b.h/2};
  if(side==="r")return{x:b.x+b.w,y:b.y+b.h/2};
  if(side==="t")return{x:b.x+b.w/2,y:b.y};
  return{x:b.x+b.w/2,y:b.y+b.h};                        /* b: bottom */
}
/* ============================================================
   自由连接（用户拖拽的关系线）连接点规范：
   按元素真实相对方位决定出口/入口侧 ——
     A 在 B 上方          → A 底部(t) → B 顶部(b)
     A 在 B 下方          → A 顶部(b) → B 底部(t)
     A 在 B 左侧          → A 右侧(r) → B 左侧(l)
     A 在 B 右侧          → A 左侧(l) → B 右侧(r)
     中心重叠(曼哈顿距离小) → A 底部 → B 顶部（默认向下）
  与布局主轴无关（布局感知的 resolveAnchors 只用于导图父子连线）。
============================================================ */
function relAnchors(a,b){
  const ac={x:a.x+a.w/2,y:a.y+a.h/2};
  const bc={x:b.x+b.w/2,y:b.y+b.h/2};
  const dx=bc.x-ac.x,dy=bc.y-ac.y;
  const man=Math.abs(dx)+Math.abs(dy);
  /* 重叠或几乎重合：默认 上→下 */
  if(man<Math.max(a.w,b.w)*0.5+Math.max(a.h,b.h)*0.5){
    return{out:"b",inp:"t"};
  }
  /* 水平主导 → 左右对；垂直主导 → 上下对 */
  if(Math.abs(dx)>=Math.abs(dy)){
    return dx>=0?{out:"r",inp:"l"}:{out:"l",inp:"r"};
  }
  return dy>=0?{out:"b",inp:"t"}:{out:"t",inp:"b"};
}
/* 连线端点平滑过渡：记录每根线当前视觉端点/朝向，
   拖动时 endpoints 渐变动画（lerp），避免切换连接点时生硬跳变 */
const linkAnimMap=new Map();   /* linkId -> {ea,eb,outSide,inpSide,lastT} */
/* 出口/入口侧是离散枚举(l/r/t/b)：变化时直接切换（无法插值），
   端点坐标走 lerp 即可视觉平滑 */
function lerpSide(cur,next){return cur===next?cur:next;}
function smoothLinkEndpoints(l,ea,eb,outSide,inpSide){
  const now=performance.now();
  let s=linkAnimMap.get(l.id);
  if(!s){
    s={ea:{...ea},eb:{...eb},outSide,inpSide,lastT:now};
    linkAnimMap.set(l.id,s);
    return{ea,eb,outSide,inpSide,first:true};
  }
  /* 端点位置：指数平滑（约 12 帧收敛），朝向变化：立即切（海龟走法视觉更稳） */
  const k=Math.min(1,Math.max(0.08,(now-s.lastT)/90));
  const nea={x:s.ea.x+(ea.x-s.ea.x)*k,y:s.ea.y+(ea.y-s.ea.y)*k};
  const neb={x:s.eb.x+(eb.x-s.eb.x)*k,y:s.eb.y+(eb.y-s.eb.y)*k};
  s.ea=nea;s.eb=neb;
  s.outSide=lerpSide(s.outSide,outSide);
  s.inpSide=lerpSide(s.inpSide,inpSide);
  s.lastT=now;
  return{ea:nea,eb:neb,outSide:s.outSide,inpSide:s.inpSide,first:false};
}
/* 拖动时强制让动画贴近目标（拖完停顿后收敛） */
function snapLinkAnim(l){const s=linkAnimMap.get(l.id);if(s)s.lastT=0;}
/* ② 推导出口/入口侧：基于父子中心向量在主轴/横轴上的投影 */
function resolveAnchors(pb,cb){
  const A=layoutAxis();
  const vcx=(cb.x+cb.w/2)-(pb.x+pb.w/2);
  const vcy=(cb.y+cb.h/2)-(pb.y+pb.h/2);
  let ds,dc;   /* 主轴位移、横轴位移 */
  if(A.axis==="x"){ds=vcx;dc=vcy;}
  else{ds=vcy;dc=vcx;}
  if(A.u){
    /* U 型/鱼骨：不预设符号，直接按实际位移大小决定走主轴还是横轴 */
    if(Math.abs(ds)>=Math.abs(dc)){
      if(A.axis==="x")return ds>=0?{out:"r",inp:"l"}:{out:"l",inp:"r"};
      return ds>=0?{out:"b",inp:"t"}:{out:"t",inp:"b"};
    }
    if(A.axis==="x")return dc>=0?{out:"b",inp:"t"}:{out:"t",inp:"b"};
    return dc>=0?{out:"r",inp:"l"}:{out:"l",inp:"r"};
  }
  if(!A.u){
    /* 定轴布局（向右/向左/向下/时间轴/括号图）：始终沿主轴出/入。
       原因：同层级连线方向必须一致才视觉均衡；若按向量比较，
       组织图里远离父节点的子节点会因横轴位移占优而改成左右出线，
       导致同层连线方向杂乱（这正是旧方案损坏视觉的根源）。 */
    if(A.axis==="x")return A.sign>0?{out:"r",inp:"l"}:{out:"l",inp:"r"};
    return A.sign>0?{out:"b",inp:"t"}:{out:"t",inp:"b"};
  }
}
/* ③ 布局→线型矩阵：每个布局有专属几何路由（视觉一致性的基础） */
function layoutLinetype(){
  const L=state.layoutType||"right";
  const map={
    logic:"curvy", right:"curvy", left:"curvy", u:"curvy",
    org:"ortho",
    timeline:"timeline",
    fishbone:"fishbone",
    brace:"brace",
  };
  return map[L]||"curvy";
}
/* 路线：按布局线型 + 起止方向渲染
   curvy=  S 形贝塞尔（逻辑图/U型）
   ortho=  圆角正交折线（组织图）
   timeline= 水平主干+垂直支线（时间轴）
   fishbone= 斜向骨刺折线（鱼骨图）
   brace=  括号弧线（总分） */
function routeConnection(c,a,b,outSide,inpSide,color,width,shapeOverride){
  const z=state.camera.zoom;
  /* E10: "auto" 应跟随布局线型，不能当 truthy 覆盖值用 */
  const lt=(shapeOverride&&shapeOverride!=="auto")?shapeOverride:layoutLinetype();
  const ax=Math.abs(b.x-a.x),ay=Math.abs(b.y-a.y);
  const horiz=(outSide==="l"||outSide==="r");
  c.beginPath();c.moveTo(a.x,a.y);

  if(lt==="straight"){
    c.lineTo(b.x,b.y);return;
  }
  if(lt==="ortho"||lt==="polyline"){
    /* 组织架构图采用直线/折线：层级、汇合点与阅读方向最清晰。 */
    const midY=(a.y+b.y)/2;
    c.lineTo(a.x,midY);c.lineTo(b.x,midY);c.lineTo(b.x,b.y);
    return;
  }
  if(lt==="timeline"){
    /* 时间轴：水平主干至终点上方，垂直支线入边 */
    const seg=Math.min(10/z,ay/2);
    c.lineTo(b.x,a.y);
    c.quadraticCurveTo(b.x,a.y,b.x,a.y+(b.y>a.y?seg:-seg));
    c.lineTo(b.x,b.y);
    return;
  }
  if(lt==="fishbone"){
    /* 鱼骨：45° 斜刺折线，先斜后直 */
    const slant=Math.min(24/z,ax/2,ay/2);
    const sx=outSide==="l"||outSide==="r"?slant:0;
    const sy=(outSide==="b"||outSide==="t")?slant:slant*0.6;
    c.lineTo(a.x+sx,a.y+sy);
    c.lineTo(b.x,b.y);
    return;
  }
  if(lt==="brace"){
    /* 括号：左右两段弧收束（总分结构） */
    const k=Math.min(18/z,ax/3,ay/3);
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    /* 第一段：a → 中点（弧） */
    c.bezierCurveTo(mx-k,a.y,mx,(a.y+my)/2,mx,my);
    /* 第二段：中点 → b（弧） */
    c.bezierCurveTo(mx,(my+b.y)/2,mx+k,b.y,b.x,b.y);
    return;
  }
  /* 默认 curvy / curve override：S 形贝塞尔 */
  if(horiz){
    c.bezierCurveTo((a.x+b.x)/2,a.y,(a.x+b.x)/2,b.y,b.x,b.y);
  }else if((outSide==="t"||outSide==="b")&&(inpSide==="t"||inpSide==="b")){
    c.bezierCurveTo(a.x,(a.y+b.y)/2,b.x,(a.y+b.y)/2,b.x,b.y);
  }else{
    /* 跨轴：圆角正交兜底 */
    const r=Math.min(14/z,ax/2,ay/2);
    const my=(a.y+b.y)/2;
    c.lineTo(b.x,a.y);
    c.quadraticCurveTo(b.x+(horiz?r:-r),a.y,b.x,a.y+(b.y>a.y?r:-r));
    c.lineTo(b.x,b.y);
  }
}
/* 箭头：沿入边法线插入，语义清晰 */
function drawAnchorArrow(c,tip,inpSide,color,size){
  const n={l:{x:1,y:0},r:{x:-1,y:0},t:{x:0,y:1},b:{x:0,y:-1}}[inpSide]||{x:-1,y:0};
  const ang=Math.atan2(n.y,n.x);
  c.fillStyle=color;
  c.beginPath();c.moveTo(tip.x,tip.y);
  c.lineTo(tip.x-size*Math.cos(ang-Math.PI/7),tip.y-size*Math.sin(ang-Math.PI/7));
  c.lineTo(tip.x-size*0.55*Math.cos(ang),tip.y-size*0.55*Math.sin(ang));
  c.lineTo(tip.x-size*Math.cos(ang+Math.PI/7),tip.y-size*Math.sin(ang+Math.PI/7));
  c.closePath();c.fill();
}
/* 导图连线（柔色 + 渐变生长动画） */
function drawMindConnections(scope){
  const z=state.camera.zoom;
  const now=performance.now();
  const SC=styleCfg();
  for(const ch of state.items){
    if(ch.type!=="mindNode"||!ch.parentId)continue;
    const p=idMap.get(ch.parentId);
    if(!p||!isMindNodeVisible(ch)||!isMindNodeVisible(p)) continue;
    if(scope&&(!scope.has(ch.id)||!scope.has(p.id))) continue;
    /* 通用规则：由实际相对位置推导出口/入口侧（布局期与主轴规则一致；
       拖动后实时跟随真实方位——被拖到异侧/上下颠倒时自动换向，不脱落不偏离） */
    const pb=itemBounds(p),chb=itemBounds(ch);
    const lineBounds={x:Math.min(pb.x,chb.x),y:Math.min(pb.y,chb.y),w:Math.max(pb.x+pb.w,chb.x+chb.w)-Math.min(pb.x,chb.x),h:Math.max(pb.y+pb.h,chb.y+chb.h)-Math.min(pb.y,chb.y)};
    if(!inViewport(lineBounds))continue;
    const sides=relAnchors(pb,chb);
    let pa=anchorOn(pb,sides.out),cb=anchorOn(chb,sides.inp);
    /* 平滑过渡：拖动的每一帧对端点/朝向做指数平滑（约90ms收敛），
       避免方位切换时连线生硬跳变；自动布局时已清动画状态=定格就位 */
    const sm=smoothLinkEndpoints({id:"mind:"+p.id+":"+ch.id},pa,cb,sides.out,sides.inp);
    pa=sm.ea;cb=sm.eb;
    const outSide=sm.outSide,inpSide=sm.inpSide;
    const mindId="mind:"+p.id+":"+ch.id;
    const isSel=state.selected===ch.id||state.selected===p.id||state.selected===mindId;
    /* 生长动画 */
    let grow=1;
    if(ch.birth){
      const t=(now-ch.birth)/420;
      if(t<1){ grow=Math.max(.02,1-Math.pow(1-t,3)); }else{ ch.birth=null; }
    }
    if(grow<1){
      /* 生长阶段：按同侧规则插值端点 */
      const ex=pa.x+(cb.x-pa.x)*grow, ey=pa.y+(cb.y-pa.y)*grow;
      ctx.save();
      const g=ctx.createLinearGradient(pa.x,pa.y,ex,ey);
      g.addColorStop(0,p.color);g.addColorStop(1,ch.color);
      ctx.strokeStyle=g;
      ctx.globalAlpha=isSel?.7:.45;
      ctx.lineWidth=2/z;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(pa.x,pa.y);
      const mx=(pa.x+ex)/2;
      ctx.bezierCurveTo(mx,pa.y,mx,ey,ex,ey);
      ctx.stroke();
      ctx.restore();
    }else{
      if(SC.paper){
        /* 纸张风格使用带细微断续感的墨水路线，而不是高光渐变的屏幕线。 */
        ctx.save();ctx.strokeStyle=state.dark?"rgba(239,224,198,.82)":"rgba(82,58,31,.82)";
        ctx.globalAlpha=isSel?.95:.82;ctx.lineWidth=(isSel?2.3:1.65)/z;ctx.lineCap="round";ctx.lineJoin="round";
        ctx.setLineDash([1.7/z,1.05/z]);routeConnection(ctx,pa,cb,outSide,inpSide,ctx.strokeStyle,ctx.lineWidth);ctx.stroke();ctx.setLineDash([]);
        if(isSel){ctx.globalAlpha=.24;ctx.lineWidth=.65/z;routeConnection(ctx,{x:pa.x+.55/z,y:pa.y+.35/z},{x:cb.x+.55/z,y:cb.y+.35/z},outSide,inpSide,ctx.strokeStyle,ctx.lineWidth);ctx.stroke();}
        ctx.restore();
        continue;
      }
      ctx.save();
      /* E5: mind link level — width primary, no halo */
      var mlLvl=ch._linkLevel||"normal";
      var mlShp=ch._linkShape||"auto";
      var mlLvlW=mlLvl==="highlight"?4.5:mlLvl==="emphasis"?2.8:1.9;
      var mlLvlA=mlLvl==="highlight"?.75:mlLvl==="emphasis"?.5:(SC.glass?.48:.34);
      var mlColor=p.color;
      if(mlLvl==="highlight"){mlColor=shadeColor(p.color,1.6);}
      else if(mlLvl==="emphasis"){mlColor=shadeColor(p.color,1.15);}
      ctx.strokeStyle=mlColor;
      ctx.strokeStyle=p.color;
      ctx.globalAlpha=isSel?.76:mlLvlA;
      var mlBaseW=isSel?mlLvlW+0.7:mlLvlW;
      ctx.lineWidth=mlBaseW/z;ctx.lineCap="round";
      if(SC.glass){ctx.shadowColor=ch.color;ctx.shadowBlur=5/z;}
      routeConnection(ctx,pa,cb,outSide,inpSide,p.color,mlBaseW/z,mlShp);
      ctx.stroke();
      /* E5: highlight level — inner light line */
      if(mlLvl==="highlight"&&!isSel){
        ctx.globalAlpha=.3;ctx.strokeStyle=dc("#ffffff",p.color);ctx.lineWidth=0.8/z;ctx.stroke();
      }
      /* 丝质高光 — 在主线上叠加一层极细白光，模拟丝线光泽 */
      ctx.globalAlpha=isSel?.25:.15;
      ctx.strokeStyle=dc("#ffffff","#ffffff");
      ctx.lineWidth=0.6/z;
      ctx.stroke();
      /* 箭头沿入边法线，语义清晰 */
      if(isSel){ctx.globalAlpha=.88;drawAnchorArrow(ctx,cb,inpSide,p.color,7/z);}
      ctx.restore();
      /* 选中节点的连线上画流动光点 — "织"的视觉隐喻 */
      if(isSel&&!state.focusMode){
        const t=(now%2000)/2000;
        /* 沿当前路线取点：主轴 S 形用贝塞尔，跨轴折线用线性插值 */
        const horiz=(outSide==="l"||outSide==="r");
        let bx,by;
        if(horiz){
          const P1={x:(pa.x+cb.x)/2,y:pa.y},P2={x:(pa.x+cb.x)/2,y:cb.y};
          const p=bezierAt(pa,P1,P2,cb,t);bx=p.x;by=p.y;
        }else if((outSide==="t"||outSide==="b")&&(inpSide==="t"||inpSide==="b")){
          const P1={x:pa.x,y:(pa.y+cb.y)/2},P2={x:cb.x,y:(pa.y+cb.y)/2};
          const p=bezierAt(pa,P1,P2,cb,t);bx=p.x;by=p.y;
        }else{
          bx=pa.x+(cb.x-pa.x)*t;by=pa.y+(cb.y-pa.y)*t;
        }
        ctx.save();
        ctx.fillStyle=ch.color;ctx.globalAlpha=.6*(1-t);
        ctx.shadowColor=ch.color;ctx.shadowBlur=8/z;
        ctx.beginPath();ctx.arc(bx,by,3/z,0,7);ctx.fill();
        ctx.fillStyle="#fff";ctx.globalAlpha=.8*(1-t*.5);
        ctx.beginPath();ctx.arc(bx,by,1.5/z,0,7);ctx.fill();
        ctx.restore();
        if(t>.1)requestRender();
      }
    }
  }
}
/* I5-fix: nodeAnchorR/nodeAnchorL 仅被已删除的死函数 exportBranch 使用，随之移除 */
/* 子树节点总数（含自身） */
function subtreeCount(n){
  let cnt=0;const seen=new Set();
  (function walk(x){
    if(seen.has(x.id))return;seen.add(x.id);
    cnt++;
    (x.children||[]).forEach(c=>{const ci=idMap.get(c);if(ci)walk(ci);});
  })(n);
  return cnt;
}
/* 节点层级深度：根=0，子=1，孙=2... */
function nodeDepth(n){
  if(n&&n._forcedDepth!==undefined)return n._forcedDepth;
  let d=0,p=n;const seen=new Set();
  while(p&&p.parentId&&!seen.has(p.id)){seen.add(p.id);d++;p=idMap.get(p.parentId);}
  return d;
}
/* 折叠的是一个子树：节点本身保留，所有后代都不参与绘制和命中。 */
function isMindNodeVisible(n){
  if(!n||n.type!=="mindNode")return true;
  const seen=new Set();let parentId=n.parentId;
  while(parentId&&!seen.has(parentId)){
    seen.add(parentId);
    const parent=idMap.get(parentId);
    if(!parent)return true;
    if(parent.collapsed)return false;
    parentId=parent.parentId;
  }
  return true;
}

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
function roundRectPath(c,x,y,w,h,r){
  const rr=Math.max(0.5,Math.min(Math.max(0,r),w/2,h/2));
  c.beginPath();
  c.moveTo(x+rr,y);c.arcTo(x+w,y,x+w,y+h,rr);c.arcTo(x+w,y+h,x,y+h,rr);c.arcTo(x,y+h,x,y,rr);c.arcTo(x,y,x+w,y,rr);
  c.closePath();
}
function wrapLines(c,text,maxW){
  const lines=[];
  for(const para of String(text).split("\n")){
    let line="";
    for(const ch of para){
      const t=line+ch;
      if(c.measureText(t).width>maxW&&line){lines.push(line);line=ch;}
      else line=t;
    }
    if(line) lines.push(line);
  }
  return lines.length?lines:[""];
}
function truncateStr(s,maxW){
  if(!s) return "";
  ctx.font="600 12px "+FONT;
  if(ctx.measureText(s).width<=maxW) return s;
  let out=s;
  while(out.length>1&&ctx.measureText(out+"…").width>maxW) out=out.slice(0,-1);
  return out+"…";
}
function hostOf(u){try{const x=new URL(u);return x.hostname;}catch(e){return u;}}
function isSafePreviewUrl(value){try{const url=new URL(value);return url.protocol==="https:"||url.protocol==="http:";}catch(e){return false;}}
/* 网页缩放统一入口：普通浏览器 iframe 使用布局缩放；Electron webview 则调用
   Chromium 访客页自己的缩放 API，避免 CSS zoom 让原生访客表面尺寸失真。 */
function applyEmbeddedPageZoom(frame,value){
  if(!frame)return;
  const zoom=clamp(Number(value)||1,.3,3);
  if(String(frame.tagName||"").toUpperCase()==="WEBVIEW"){
    frame.__pvDesiredZoom=zoom;
    frame.style.zoom="1";
    frame.style.transform="none";
    try{if(typeof frame.setZoomFactor==="function")frame.setZoomFactor(zoom);}catch(e){}
  }else{
    frame.style.transform="none";
    frame.style.zoom=String(zoom);
  }
}
/* 远程网页预览统一配置。
   旧版 sandbox 缺少 allow-same-origin，部分站点会因此失去 Cookie、存储与正常跳转环境，
   最终把 iframe 误判为异常访问并返回 403。这里保留沙箱，但补齐现代站点运行所需能力；
   仍不允许远程页面无条件接管父窗口。 */
function configureWebPreviewFrame(iframe,url,title){
  iframe.className="pv-html";
  iframe.src=url;
  iframe.sandbox="allow-forms allow-scripts allow-popups allow-same-origin allow-popups-to-escape-sandbox";
  iframe.referrerPolicy="no-referrer-when-downgrade";
  iframe.allow="autoplay; encrypted-media; picture-in-picture";
  iframe.title=title||"网页材料预览";
  return iframe;
}
/* 少数站点会根据 iframe 上下文触发自身的反爬 / 风控页。
   这不是链接失效，也不能由父页面安全地绕过；改为清晰的外部打开入口，避免把 403 当作预览内容展示。 */
function rejectsEmbeddedPreview(url){
  const host=String(hostOf(url)||"").toLowerCase();
  return host==="thepaper.cn"||host.endsWith(".thepaper.cn")||host==="zhihu.com"||host.endsWith(".zhihu.com");
}
function renderWebEmbedFallback(container,url,name){
  container.innerHTML="";
  const shell=document.createElement("div");shell.className="pv-web-embed-fallback";
  const card=document.createElement("div");card.className="web-fallback-card";
  const title=document.createElement("strong");title.textContent=name||hostOf(url)||"网页材料";
  const note=document.createElement("p");note.textContent="该网站拒绝嵌入式预览。链接仍可正常使用，建议在默认浏览器中打开。";
  const open=document.createElement("button");open.type="button";open.textContent="用默认浏览器打开";
  open.addEventListener("click",()=>{if(isSafePreviewUrl(url))window.open(url,"_blank","noopener");});
  card.append(title,note,open);shell.appendChild(card);container.appendChild(shell);
}
function renderPreviewImage(container,url,opts){
  const o=opts||{};
  container.innerHTML="";
  const wrap=document.createElement("div");
  wrap.className=o.wrapClass||"morph-fit";
  if(o.wrapStyle)wrap.style.cssText=o.wrapStyle;
  const img=document.createElement("img");
  img.src=url;img.referrerPolicy="no-referrer-when-downgrade";img.alt=o.alt||"图片材料";
  img.style.cssText=o.style||"max-width:100%;max-height:100%;object-fit:contain;display:block;margin:auto";
  img.onerror=()=>{container.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>图片加载失败</div>';};
  wrap.appendChild(img);container.appendChild(wrap);
}
function cameraZ(){return state.camera.zoom;}
function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function markdownInlineText(s){return String(s).replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/(\*\*|__|`|\*|_)/g,"");}
function markdownInlineHtml(s){return escapeHtml(s).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/__([^_]+)__/g,"<u>$1</u>").replace(/\+\+([^+]+)\+\+/g,"<u>$1</u>").replace(/~~([^~]+)~~/g,"<del>$1</del>").replace(/\*([^*]+)\*/g,"<em>$1</em>");}
function markdownLines(text){
  return String(text||"").split("\n").map(raw=>{
    let m=raw.match(/^(#{1,3})\s+(.*)$/);if(m)return{text:markdownInlineText(m[2]),kind:"h"+m[1].length};
    m=raw.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s*)?(.*)$/);if(m)return{text:(m[1]?"☑ ":"• ")+markdownInlineText(m[2]),kind:"bullet"};
    m=raw.match(/^>\s?(.*)$/);if(m)return{text:"│ "+markdownInlineText(m[1]),kind:"quote"};
    return{text:markdownInlineText(raw),kind:"text"};
  });
}
function markdownToHtml(text){
  return String(text||"").split("\n").map(raw=>{
    let m=raw.match(/^(#{1,3})\s+(.*)$/);if(m)return"<h"+m[1].length+">"+markdownInlineHtml(m[2])+"</h"+m[1].length+">";
    m=raw.match(/^\s*[-*+]\s+(?:\[([ xX])\]\s*)?(.*)$/);if(m)return"<ul><li>"+(m[1]?(m[1].toLowerCase()==="x"?"☑ ":"☐ "):"")+markdownInlineHtml(m[2])+"</li></ul>";
    m=raw.match(/^>\s?(.*)$/);if(m)return"<blockquote>"+markdownInlineHtml(m[1])+"</blockquote>";
    return raw?"<p>"+markdownInlineHtml(raw)+"</p>":"<p>&nbsp;</p>";
  }).join("");
}
function noteTypography(it){
  const family=(it.fontFamily&&FONT_PRESETS[it.fontFamily]?FONT_PRESETS[it.fontFamily].stack:FONT);
  return{family,size:clamp(Number(it.fontSize)||13,10,28),underline:!!it.underline,bold:!!it.bold};
}
function formatSize(n){if(!n)return"";if(n<1024)return n+" B";if(n<1048576)return(n/1024).toFixed(1)+" KB";return(n/1048576).toFixed(1)+" MB";}

/* ---------- 便签 ---------- */
function drawNote(it,cc){
  const c=cc||ctx;const{x,y,w,h}=it;
  const coreH=detailBaseHeight(it,{x,y,w,h});
  const z=state.camera.zoom;
  const sel=it.id===state.selected;
  const SC=styleCfg();
  /* 便签圆角跟随当前风格：paper=方角(2) / minimal=微圆(4) / 其余 7 */
  const nr=SC.paper?8:SC.glass?14:SC.minimal?4:SC.neumorph?14:SC.colorful?16:SC.bento?20:SC.editorial?4:9;
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
    lines.slice(0,maxL).forEach((row,i)=>{c.font=row.weight+" "+Math.round(base*row.scale)+"px "+fam;c.fillText(row.line,x+10,y+12+i*lh);if(style.underline){const tw=c.measureText(row.line).width;c.fillRect(x+10,y+12+i*lh+base*1.16,tw,Math.max(1,base*.07));}});
    if(lines.length>maxL){c.font="600 "+base+"px "+fam;c.fillText("…",x+10,y+12+(maxL-1)*lh+12);}
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
/* ---------- 导图节点 ---------- */
function drawMindNode(it,cc){
  const c=cc||ctx;const b=itemBounds(it);
  const depth=nodeDepth(it);
  const sel=it.id===state.selected;
  const z=state.camera.zoom;
  const coreH=detailBaseHeight(it,b);
  /* 层级视觉降级 + 质感提升：
     d0(根) = 纵向渐变填充+白字+大圆角+强投影
     d1(二级) = 白底+极淡同色渐变+2px 彩色边+彩色文字+中投影
     d2(三级) = 白底+1px 灰边+左侧 3px 彩色竖条+深灰字+轻投影
     d3+     = 透明灰底+1px 浅灰边+浅灰字+无投影 */
  /* —— 全局样式：阴影/圆角/半透明/描边统一由 styleCfg 驱动 —— */
  const SC=styleCfg();
  const rBase=SC.radius;
  const r=Math.max(2,rBase);
  const prevAlpha=c.globalAlpha;
  if(SC.neumorph){drawNeumorph(c,b.x,b.y,b.w,b.h,r,sel,state.dark,state.bgColor);}else if(SC.colorful){drawColorful(c,b.x,b.y,b.w,b.h,r,sel,state.dark,it.color);}else if(SC.bento){drawColorful(c,b.x,b.y,b.w,b.h,r,sel,state.dark,it.color);}else if(SC.editorial){drawColorful(c,b.x,b.y,b.w,b.h,r,sel,state.dark,it.color);}else{
  c.save();
  if(sel){c.shadowColor="rgba(45,95,211,.4)";c.shadowBlur=14/z;c.shadowOffsetY=2/z;}
  /* 阴影使用冷灰蓝，而不是纯黑。低层节点也保留极浅接触阴影，
     让用户在缩小时仍能一眼识别出"这是一个可操作的框"。 */
  else if(depth===0){c.shadowColor="rgba(28,50,94,"+(SC.shadowAlpha+.08)+")";c.shadowBlur=SC.shadowBlur/z;c.shadowOffsetY=4/z;}
  else if(depth===1){c.shadowColor="rgba(28,50,94,"+SC.shadowAlpha+")";c.shadowBlur=Math.max(7,SC.shadowBlur-2)/z;c.shadowOffsetY=2/z;}
  else if(depth===2){c.shadowColor="rgba(28,50,94,"+Math.max(.11,SC.shadowAlpha*.72)+")";c.shadowBlur=Math.max(5,SC.shadowBlur-4)/z;c.shadowOffsetY=1.5/z;}
  else{c.shadowColor="rgba(28,50,94,"+Math.max(.07,SC.shadowAlpha*.48)+")";c.shadowBlur=Math.max(3,SC.shadowBlur-6)/z;c.shadowOffsetY=1/z;}
  /* 同一风格内使用同一轮廓；层级只通过色阶、字号和字重表达，避免一二三级像三套产品。 */
  /* 半透明（玻璃/纸感）：先设置全局 alpha */
  if(SC.nodeAlpha<1)c.globalAlpha=prevAlpha*SC.nodeAlpha;
  roundRectPath(c,b.x,b.y,b.w,b.h,r);
  /* 风格专属质感 */
  if(SC.fluent){
    /* Fluent 质感：双描边+顶部辉光+iOS 通透
       —— 修正：高光强度收敛（浅色 .85→.28 / 暗色 .2→.18），
          避免整卡被白膜遮盖、底色色相透不出来（"像塑料白膜"） */
    c.save();c.shadowColor="transparent";
    roundRectPath(c,b.x,b.y,b.w,b.h,r);c.clip();
    const fg=c.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
    fg.addColorStop(0,"rgba(255,255,255,"+(state.dark?.18:.28)+")");
    fg.addColorStop(.55,"rgba(255,255,255,"+(state.dark?.03:.10)+")");
    fg.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=fg;c.fillRect(b.x,b.y,b.w,b.h);
    c.restore();
    /* 底部柔光 */
    c.save();
    c.shadowColor="rgba(45,95,211,.12)";c.shadowBlur=10/z;
    c.strokeStyle="rgba(45,95,211,.08)";c.lineWidth=3/z;
    roundRectPath(c,b.x+b.w*.1,b.y,b.w*.8,b.h,2);c.stroke();
    c.restore();
  }
  if(SC.glass){
    /* 玻璃拟态：斜向高光带 */
    c.save();c.shadowColor="transparent";
    roundRectPath(c,b.x,b.y,b.w,b.h,r);c.clip();
    const gg=c.createLinearGradient(b.x,b.y,b.x+b.w*.6,b.y+b.h);
    gg.addColorStop(0,dc("rgba(255,255,255,.5)","rgba(255,255,255,.1)"));
    gg.addColorStop(.45,dc("rgba(255,255,255,.06)","rgba(255,255,255,.02)"));
    gg.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=gg;c.fillRect(b.x,b.y,b.w,b.h);
    c.restore();
  }
  if(SC.paper){
    /* 拟物展示模式：纸堆底页、纤维、压边和小块固定胶带共同说明"这是可触摸的材料"，
       但所有材质都被裁进节点边界，不会污染连接与文字层。 */
    c.save();c.shadowColor="transparent";
    roundRectPath(c,b.x+2.3/z,b.y+3/z,b.w,b.h,r);c.fillStyle="rgba(99,68,28,.18)";c.fill();
    c.lineWidth=.8/z;c.strokeStyle="rgba(94,62,24,.34)";c.stroke();c.restore();
    c.save();c.shadowColor="transparent";
    roundRectPath(c,b.x,b.y,b.w,b.h,r);c.clip();
    c.globalAlpha=.18;c.strokeStyle="rgba(100,76,48,.48)";c.lineWidth=.55/z;
    for(let yy=b.y+8/z;yy<b.y+b.h;yy+=6/z){c.beginPath();c.moveTo(b.x+5/z,yy);c.lineTo(b.x+b.w-5/z,yy+.45/z);c.stroke();}
    /* 纸纤维颗粒保持确定性，刷新不会闪烁。 */
    const seed=Number(it.id)||1;c.fillStyle="rgba(83,57,26,.13)";
    for(let i=0;i<15;i++){const px=b.x+(8+((seed*31+i*47)%(Math.max(10,Math.floor(b.w-16)))))/z;const py=b.y+(7+((seed*19+i*29)%(Math.max(8,Math.floor(b.h-14)))))/z;c.fillRect(px,py,.72/z,.72/z);}
    c.globalAlpha=1;c.fillStyle=dc("rgba(255,255,255,.46)","rgba(255,255,255,.08)");c.fillRect(b.x+2/z,b.y+2/z,b.w-4/z,1.3/z);
    c.restore();
  }
  /* 节点本体：每个预设先定义完整材料，再用同一结构表达所有层级。 */
  if(SC.paper){
    /* 不透明的纸张色阶：从牛皮纸根节点到浅杏、羊皮纸的分支，不能再与白画布融为一体。 */
    const warm=depth===0?shadeColor(it.color,.92):depth===1?"#eed8ad":depth===2?"#f5e5c3":"#fbefd7";
    const g=c.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
    g.addColorStop(0,depth===0?shadeColor(warm,1.10):depth===1?"#fff6df":"#fff9e8");
    g.addColorStop(1,warm);c.fillStyle=g;c.fill();
    c.lineWidth=(depth===0?1.65:1.25)/z;c.strokeStyle=depth===0?shadeColor(it.color,.62):"rgba(101,70,30,.72)";c.stroke();
  }else if(SC.glass){
    const g=c.createLinearGradient(b.x,b.y,b.x+b.w,b.y+b.h);
    if(depth===0){g.addColorStop(0,hexToRgba(shadeColor(it.color,1.16),.92));g.addColorStop(1,hexToRgba(shadeColor(it.color,.74),.82));}
    else{g.addColorStop(0,hexToRgba(it.color,depth===1?.24:.15));g.addColorStop(1,dc("rgba(255,255,255,.72)","rgba(255,255,255,.08)"));}
    c.fillStyle=g;c.fill();
    c.lineWidth=(depth===0?1.4:1)/z;c.strokeStyle=depth===0?dc("rgba(255,255,255,.72)","rgba(255,255,255,.12)"):hexToRgba(it.color,.45);c.stroke();
  }else if(depth===0){
    if(SC.minimal){
      /* 简约：根节点纯色实底，无渐变/无内阴影/无装饰 */
      c.fillStyle=it.color;c.fill();
    }else{
      /* 根节点：纵向渐变模拟微弧面光线 */
      const g=c.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
      const baseCol=it.color;
      g.addColorStop(0,shadeColor(baseCol,1.12));
      g.addColorStop(.5,baseCol);
      g.addColorStop(1,shadeColor(baseCol,.88));
      c.fillStyle=g;c.fill();
      /* 底部1px内阴影模拟厚度 */
      c.save();c.shadowColor="transparent";
      c.fillStyle="rgba(0,0,0,.12)";c.fillRect(b.x+2,b.y+b.h-1.5/z,b.w-4,1.5/z);
      c.restore();
    }
  }else if(depth===1){
    if(SC.minimal){
      /* 简约：极浅底色，但仍保留一条可读的细框。 */
      c.fillStyle=dc("rgba(255,255,255,.72)","rgba(255,255,255,.08)");c.fill();
      c.lineWidth=1.15/z;c.strokeStyle=hexToRgba(it.color,.5);c.stroke();
    }else{
      /* 默认：同一张卡片语言，只收敛色阶与字号。 */
      const g=c.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
      g.addColorStop(0,dc("#ffffff","#2c2c2e"));
      g.addColorStop(1,dc(hexToRgba(it.color,.06),"#252527"));
      c.fillStyle=g;c.fill();
      c.lineWidth=1.35/z;c.strokeStyle=hexToRgba(it.color,.72);c.stroke();
    }
  }else if(depth===2){
    if(SC.minimal){
      c.fillStyle=dc("rgba(255,255,255,.62)","rgba(255,255,255,.06)");c.fill();
      c.lineWidth=1.05/z;c.strokeStyle=hexToRgba(it.color,.42);c.stroke();
    }else{
      c.fillStyle=dc("#ffffff","#2c2c2e");c.fill();
      c.lineWidth=1.15/z;c.strokeStyle=hexToRgba(it.color,.52);c.stroke();
    }
  }else{
    if(SC.minimal){
      c.fillStyle=dc("rgba(255,255,255,.48)","rgba(255,255,255,.05)");c.fill();
      c.lineWidth=1/z;c.strokeStyle=hexToRgba(it.color,.3);c.stroke();
    }else{
      c.fillStyle=dc("rgba(255,255,255,.84)","rgba(255,255,255,.06)");c.fill();
      c.lineWidth=1/z;c.strokeStyle=hexToRgba(it.color,.28);c.stroke();
    }
  }
  c.restore();
  } /* end else */
  /* 二、三级节点用极细同色侧脊定住层级。它比粗卡片更克制，
     但在缩放后的远景中仍能明确给出边界和归属。 */
  if(depth>=2&&!SC.paper&&!SC.neumorph){
    c.save();c.shadowColor="transparent";
    roundRectPath(c,b.x,b.y,b.w,b.h,r);c.clip();
    c.fillStyle=hexToRgba(it.color,depth===2?.72:.46);
    c.fillRect(b.x,b.y,2.2/z,b.h);
    c.restore();
  }
  /* 材料表面必须在底色之后叠加，才能产生真实玻璃/纸张的受光，而不是被底色覆盖。 */
  if(SC.glass){
    c.save();roundRectPath(c,b.x+1/z,b.y+1/z,b.w-2/z,b.h-2/z,r);c.clip();
    const shine=c.createLinearGradient(b.x,b.y,b.x+b.w*.72,b.y+b.h);
    shine.addColorStop(0,dc("rgba(255,255,255,.46)","rgba(255,255,255,.08)"));shine.addColorStop(.32,dc("rgba(255,255,255,.12)","rgba(255,255,255,.03)"));shine.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=shine;c.fillRect(b.x,b.y,b.w,b.h);
    c.fillStyle=dc("rgba(255,255,255,.11)","rgba(255,255,255,.03)");c.fillRect(b.x+1/z,b.y+1/z,b.w-2/z,1.1/z);c.restore();
  }else if(SC.paper){
    c.save();roundRectPath(c,b.x+1/z,b.y+1/z,b.w-2/z,b.h-2/z,r);c.clip();
    /* 纸张不再只是黄底：纤维、压纹、旧纸边、胶带和折页共同构成可识别的材质。
       这些细节只在"拟物"样式绘制，默认效率样式保持干净。 */
    const grainSeed=Number(it.id)||37;
    c.globalAlpha=.13;c.strokeStyle="rgba(87,59,27,.66)";c.lineWidth=.48/z;
    for(let yy=b.y+7/z;yy<b.y+b.h;yy+=5/z){
      const drift=((grainSeed*17+Math.round((yy-b.y)*z))%7-3)*.16/z;
      c.beginPath();c.moveTo(b.x+5/z,yy);c.lineTo(b.x+b.w-5/z,yy+drift);c.stroke();
    }
    c.globalAlpha=.16;c.fillStyle="rgba(105,72,34,.48)";
    for(let i=0;i<Math.max(6,Math.floor(b.w*z/18));i++){
      const px=b.x+(7+((grainSeed*29+i*37)%(Math.max(12,Math.floor(b.w*z)-14))))/z;
      const py=b.y+(6+((grainSeed*13+i*19)%(Math.max(8,Math.floor(b.h*z)-10))))/z;
      c.fillRect(px,py,.75/z,.75/z);
    }
    /* 顶部压纹和固定胶带：根节点更厚，二级节点更像便签纸。 */
    c.globalAlpha=.36;c.fillStyle=dc("rgba(255,255,255,.62)","rgba(255,255,255,.1)");c.fillRect(b.x+4/z,b.y+3/z,b.w-8/z,1/z);
    if(depth<=1){
      const tapeW=Math.min(48/z,b.w*.31),tapeX=b.x+b.w*.13;
      c.globalAlpha=.76;c.fillStyle="rgba(233,190,83,.47)";c.fillRect(tapeX,b.y-1/z,tapeW,5.4/z);
      c.globalAlpha=.26;c.strokeStyle="rgba(126,83,22,.72)";c.lineWidth=.55/z;c.strokeRect(tapeX,b.y-1/z,tapeW,5.4/z);
      /* 翘起的页角。 */
      const fold=Math.min(13/z,b.h*.28,b.w*.12);
      c.globalAlpha=.38;c.fillStyle="rgba(133,91,39,.42)";c.beginPath();c.moveTo(b.x+b.w-fold,b.y+b.h);c.lineTo(b.x+b.w,b.y+b.h-fold);c.lineTo(b.x+b.w,b.y+b.h);c.closePath();c.fill();
      c.globalAlpha=.28;c.fillStyle=dc("rgba(255,255,255,.86)","rgba(255,255,255,.12)");c.beginPath();c.moveTo(b.x+b.w-fold,b.y+b.h);c.lineTo(b.x+b.w-fold,b.y+b.h-fold);c.lineTo(b.x+b.w,b.y+b.h-fold);c.closePath();c.fill();
    }
    c.restore();
  }
  /* 恢复半透明 alpha，并叠加样式描边（玻璃/纸感的关键质感） */
  c.globalAlpha=prevAlpha;
  if(SC.outlined&&SC.borderAlpha>0){
    c.save();
    roundRectPath(c,b.x,b.y,b.w,b.h,r);
    c.strokeStyle=SC.borderColor;c.lineWidth=1/z;
    c.globalAlpha=prevAlpha*Math.max(.25,SC.borderAlpha*2.4);
    c.stroke();
    c.restore();
  }
  /* 非选中根/二级节点的顶部内高光 — 微妙光照感（简约风格无装饰，跳过） */
  if(!sel&&(depth===0||depth===1)&&!SC.minimal){
    c.save();c.shadowColor="transparent";
    roundRectPath(c,b.x+1/z,b.y+1/z,b.w-2/z,b.h-2/z,r-1);c.clip();
    c.strokeStyle="rgba(255,255,255,"+(state.dark?.06:depth===0?.14:.18)+")";
    c.lineWidth=1/z;
    c.beginPath();c.moveTo(b.x+3/z,b.y+1/z);c.lineTo(b.x+b.w-3/z,b.y+1/z);c.stroke();
    c.restore();
  }
  if(sel){
    /* 选中态：品牌亮色外发光环 + 亮色描边（不再用深色实线） */
    c.save();
    const HL=state.dark?"#8fb0e8":"#2d5fd3";
    /* 外发光 */
    c.shadowColor=state.dark?"rgba(143,176,232,.75)":"rgba(45,95,211,.55)";
    c.shadowBlur=16/z;
    c.strokeStyle=HL;c.lineWidth=2.5/z;
    roundRectPath(c,b.x-2/z,b.y-2/z,b.w+4/z,b.h+4/z,r+2);c.stroke();
    c.shadowColor="transparent";
    /* 内描边（亮色细线） */
    c.strokeStyle=dc("rgba(255,255,255,.6)","rgba(255,255,255,.1)");c.lineWidth=1/z;
    roundRectPath(c,b.x+.5/z,b.y+.5/z,b.w-1/z,b.h-1/z,r);c.stroke();
    /* 顶光 — 节点顶部内 1px 白光，模拟光从上方照入 */
    if(depth<=1){
      c.strokeStyle="rgba(255,255,255,"+(state.dark?.15:.22)+")";c.lineWidth=1/z;
      roundRectPath(c,b.x+1.5/z,b.y+1.5/z,b.w-3/z,b.h-3/z,r-1);c.clip();
      c.beginPath();c.moveTo(b.x+2/z,b.y+1.5/z);c.lineTo(b.x+b.w-2/z,b.y+1.5/z);c.stroke();
    }
    c.restore();
  }
  /* 文字样式降级 + 暗黑模式加亮加粗
     —— 节点字号/字重统一走 styleCfg 的 fontScale 缩放（三风格各自层级），
        简约风格 fontScale 1.14 → 层级拉大，仅靠字体大小/粗细/颜色区分 */
  const metrics=mindNodeMetrics(it,c);
  const fontSz=metrics.size+"px ";
  const fontW=state.dark?(depth===0?"700 ":depth===1?"700 ":depth===2?"600 ":"600 "):(depth===0?"700 ":depth===1?"600 ":"500 ");
  c.font=fontW+fontSz+FONT;
  c.textBaseline="middle";
  const padL=14;
  if(SC.neumorph){c.fillStyle=depth===0?it.color:dc(shadeColor(it.color,.7),shadeColor(it.color,1.3));}
  else if(SC.colorful) c.fillStyle=depth===0?"#fff":dc("#ffffff","rgba(255,255,255,.7)");
  else if(SC.bento) c.fillStyle=depth===0?"#fff":dc("#fff","rgba(255,255,255,.7)");
  else if(SC.editorial) c.fillStyle=depth===0?"#fff":dc("#fff","rgba(255,255,255,.7)");
  else if(SC.paper) c.fillStyle=depth===0?"#fffdf6":"#493621";
  else if(SC.glass) c.fillStyle=depth===0?"#ffffff":dc("#253450","#f3f6ff");
  else if(depth===0) c.fillStyle="#ffffff";
  else if(depth===1) c.fillStyle=dc(SC.minimal?shadeColor(it.color,1.35):it.color,"#ffffff");
  else if(depth===2) c.fillStyle=dc(SC.minimal?shadeColor(it.color,.85):"#3c3c43","#e0e0e3");
  else c.fillStyle=dc(SC.minimal?shadeColor(it.color,.65):"#6e7080","#a8a8ad");
  const ty=b.y+coreH/2;
  /* 连接点（右侧边缘，用于拖拽建立父子关系）— 选中/hover时高亮放大 */
  if(depth<3){
    const lx=b.x+b.w,ly=ty;
    const dotHover=state.hover&&state.hover.id===it.id;
    const dotR=(sel?5:dotHover?4.5:3.5)/z;
    const dotA=sel?.85:dotHover?.7:.25;
    c.save();
    if(sel||dotHover){c.shadowColor="rgba(45,95,211,.5)";c.shadowBlur=8/z;}
    c.fillStyle="rgba(45,95,211,"+dotA+")";
    c.beginPath();c.arc(lx,ly,dotR,0,7);c.fill();
    c.restore();
  }
  c.textAlign="left";
  /* 给右侧的展开内容和子树控制留出专属空间，文字不会再压住控件。 */
  const collapseBox=mindCollapseBounds(it,b);
  /* E5: detail toggle is on LEFT side now — doesn't affect text width */
  const controlStart=collapseBox?collapseBox.x:Infinity;
  c.save();
  c.beginPath();
  const textW=Math.max(56/z,(isFinite(controlStart)?controlStart:b.x+b.w)-b.x-padL-5/z);
  c.rect(b.x+padL,b.y+2/z,textW,b.h-4/z);
  c.clip();
  const lines=wrapLines(c,it.text||"(空)",textW);
  const lineH=metrics.lineH,blockH=lines.length*lineH;
  let textY=b.y+coreH/2-blockH/2+lineH/2;
  for(const line of lines){c.fillText(line,b.x+padL,textY);textY+=lineH;}
  c.restore();
  drawMindCollapseControl(it,b,c);
  /* （已移除：节点的附件数量角标） */
  c.textBaseline="alphabetic";c.textAlign="start";
  drawDetail(it,b);
  drawAnnotation(it,b);
}
/* 右侧的功能把手：展开内容与批注/跃迁信息 */
function detailToggleBounds(it,b){
  /* E5: left-side tab — sticks out from node's left edge */
  const z=state.camera.zoom;
  const coreH=detailBaseHeight(it,b),w=22/z,h=22/z;
  return{x:b.x-w-3/z,y:b.y+(coreH-h)/2,w,h};
}
function detailCollapseBounds(it,b){
  /* I5-fix: 与 detailToggleBounds 逐字节相同，改为委托，避免两份拷贝漂移 */
  return detailToggleBounds(it,b);
}
function mindCollapseBounds(it,b){
  if(it.type!=="mindNode"||!(it.children&&it.children.length))return null;
  const z=state.camera.zoom;
  const coreH=detailBaseHeight(it,b),w=25/z,h=Math.max(18/z,coreH-10/z);
  /* E5: no detailSpace shift */
  return{x:b.x+b.w-w-5/z,y:b.y+(coreH-h)/2,w,h};
}
function drawMindCollapseControl(it,b,c){
  const box=mindCollapseBounds(it,b);if(!box)return;
  const depth=nodeDepth(it),z=state.camera.zoom;
  const hover=state.hover&&state.hover.id===it.id&&state.hover.area==="collapse";
  c.save();
  c.shadowColor="transparent";
  /* 背景：hover 时微亮 */
  const bgA=hover?.16:depth===0?dc("rgba(255,255,255,.2)","rgba(255,255,255,.04)"):"rgba(45,95,211,.08)";
  c.fillStyle=depth===0?(hover?"rgba(255,255,255,.28)":dc("rgba(255,255,255,.2)","rgba(255,255,255,.04)")):dc(hover?"rgba(45,95,211,.14)":"rgba(45,95,211,.08)","rgba(255,255,255,.1)");
  roundRectPath(c,box.x,box.y,box.w,box.h,box.h/2);c.fill();
  c.lineWidth=1/z;c.strokeStyle=depth===0?dc("rgba(255,255,255,.24)","rgba(255,255,255,.06)"):dc("rgba(45,95,211,.16)","rgba(255,255,255,.13)");c.stroke();
  const hidden=Math.max(0,subtreeCount(it)-1);
  c.fillStyle=depth===0?"#fff":dc(it.color,"#f5f5f7");
  c.font="700 10px "+FONT;c.textAlign="center";c.textBaseline="middle";
  c.fillText(it.collapsed?"+"+hidden:"−",box.x+box.w/2,box.y+box.h/2+.5/z);
  c.restore();
}
/* 绘制批注 + 展开内容把手 */
/* 批注是轻量文字层：无底色、无边框；选择上下文时才提升强度。 */
function annotationMetrics(text,c){
  const cc=c||ctx,maxTextW=190,z=state.camera.zoom;
  cc.save();cc.font="500 10.5px "+FONT;
  const lines=wrapLines(cc,text||"",maxTextW).slice(0,8);
  const widest=lines.reduce((m,line)=>Math.max(m,cc.measureText(line).width),0);
  cc.restore();
  const lineH=13/z;
  return{lines,w:Math.max(48/z,Math.min(maxTextW,widest)),h:Math.max(13/z,lines.length*lineH),lineH,padX:0,padY:0};
}
function annotationRectFor(it,b,side){
  const m=annotationMetrics(it.annotation),z=state.camera.zoom,gap=9/z;
  const s=side||it.annotationSide||"bottom";
  let x=b.x+b.w/2-m.w/2,y=b.y+b.h+gap;
  if(s==="top")y=b.y-m.h-gap;
  else if(s==="left"){x=b.x-m.w-gap;y=b.y+b.h/2-m.h/2;}
  else if(s==="right"){x=b.x+b.w+gap;y=b.y+b.h/2-m.h/2;}
  return{x,y,w:m.w,h:m.h,metrics:m,side:s};
}
function annotationCollisionScore(rect,ownerId){
  let score=0;
  for(const other of state.items){
    if(other.id===ownerId||other.type==="stroke"||other.type==="connector")continue;
    const ob=itemBounds(other);if(!ob)continue;
    const ox=Math.min(rect.x+rect.w,ob.x+ob.w)-Math.max(rect.x,ob.x);
    const oy=Math.min(rect.y+rect.h,ob.y+ob.h)-Math.max(rect.y,ob.y);
    if(ox>0&&oy>0)score+=ox*oy*3;
    if(other.annotation){
      const ar=annotationRectFor(other,ob);
      const ax=Math.min(rect.x+rect.w,ar.x+ar.w)-Math.max(rect.x,ar.x);
      const ay=Math.min(rect.y+rect.h,ar.y+ar.h)-Math.max(rect.y,ar.y);
      if(ax>0&&ay>0)score+=ax*ay;
    }
  }
  return score;
}
function annotationIsActive(it){
  if(state.selected===it.id)return true;
  if(!state.selected)return false;
  const link=state.links.find(l=>l.id===state.selected);
  if(link)return link.aId===it.id||link.bId===it.id;
  /* 选中节点时：自身、父子、显式连接及挂接元素属于同一阅读上下文。 */
  const selected=state.items.find(x=>x.id===state.selected);
  return !!(selected&&getRelated(selected.id).has(it.id));
}
function computeAnnotationPos(it,b){
  if(it.annotationSide)return annotationRectFor(it,b,it.annotationSide);
  const sides=["bottom","top","right","left"];
  let best=null,bestScore=Infinity;
  for(const side of sides){
    const rect=annotationRectFor(it,b,side),score=annotationCollisionScore(rect,it.id);
    if(score<bestScore){best=rect;bestScore=score;}
    if(score===0)break;
  }
  return best||annotationRectFor(it,b,"bottom");
}
function drawAnnotationBubble(text,rect,color,c,opts){
  const cc=c||ctx,m=rect.metrics||annotationMetrics(text,cc),z=state.camera.zoom,o=opts||{};
  const alpha=o.active?0.94:(o.alpha===undefined ? .58 : o.alpha);
  cc.save();cc.globalAlpha=alpha;
  /* 一根短引线确定文字的归属，但不制造新的卡片轮廓。 */
  if(o.leaderFrom){
    const lx=clamp(o.leaderFrom.x,rect.x,rect.x+rect.w),ly=clamp(o.leaderFrom.y,rect.y,rect.y+rect.h);
    cc.strokeStyle=color;cc.lineWidth=1/z;cc.beginPath();cc.moveTo(o.leaderFrom.x,o.leaderFrom.y);cc.lineTo(lx,ly);cc.stroke();
    cc.fillStyle=color;cc.beginPath();cc.arc(o.leaderFrom.x,o.leaderFrom.y,1.7/z,0,7);cc.fill();
  }
  cc.font=(o.active?"600 ":"500 ")+"10.5px "+FONT;
  cc.fillStyle=state.dark?"#dbe4fa":color;
  cc.textAlign="left";cc.textBaseline="top";
  let y=rect.y;
  for(const line of m.lines){cc.fillText(line,rect.x,y);y+=m.lineH;}
  cc.restore();
}
function annotationPulse(){
  /* 低频呼吸，不用"闪烁"：只提示存在，不夺走正在阅读的内容。 */
  const p=(Math.sin(performance.now()/720)+1)/2;
  requestRender();
  return p;
}
function annotationCueColor(source){
  /* 批注提示统一使用轻亮色，不沿用节点/关系线可能很深的业务色。 */
  const palette=["#ffd95a","#75e0a7","#75c9ff","#ff9a86","#cf9cff"];
  const key=String(source&&source.id||source&&source.text||"annotation");
  let hash=0;for(let i=0;i<key.length;i++)hash=(hash*31+key.charCodeAt(i))>>>0;
  return palette[hash%palette.length];
}
function drawAnnotationCue(it,b){
  /* 元素/附件未选中时，只给一枚呼吸光点；具体文字只在选中后显示。 */
  const z=state.camera.zoom;
  /* H-fix: 形变预览(morph)覆盖层盖住整张卡片 b，cue 点原本在 b 内右上角会被遮住。
     预览态把 cue 上移到 morph 层上方（b.y 之上），保持可见；bubble（选中态文字）本就画在 b 外侧不受影响。 */
  const x=b.x+b.w-7/z,y=it.previewOpen?b.y-9/z:b.y+7/z;
  const p=annotationPulse();
  ctx.save();
  const cue=annotationCueColor(it);
  ctx.globalAlpha=.18+p*.18;
  ctx.fillStyle=cue;
  ctx.beginPath();ctx.arc(x,y,(8+p*4)/z,0,7);ctx.fill();
  ctx.globalAlpha=.72+p*.22;
  ctx.shadowColor=cue;ctx.shadowBlur=(14+p*18)/z;
  ctx.fillStyle=dc("rgba(255,255,255,.95)","rgba(31,36,48,.96)");
  ctx.strokeStyle=cue;ctx.lineWidth=1.1/z;
  ctx.beginPath();ctx.arc(x,y,4.2/z,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle=cue;ctx.beginPath();ctx.arc(x,y,1.35/z,0,7);ctx.fill();
  ctx.restore();
}
function drawAnnotation(it,b){
  const z=state.camera.zoom;
  ctx.save();
  /* 有展开内容：嵌入节点右缘的竖向把手——低调中性，仅小文档图标，无背景色块（与批注纯文字风格统一） */
  if(it.detail){
    /* E5: left-side tab button — distinct color, prominent, sticks out from left edge */
    const expanded=expandedDetailIds.has(it.id);
    const box=expanded?detailCollapseBounds(it,b):detailToggleBounds(it,b);
    const cx=box.x+box.w/2,cy=box.y+box.h/2;
    ctx.save();
    /* Drop shadow for depth */
    ctx.shadowColor="rgba(0,0,0,.18)";ctx.shadowBlur=6/z;ctx.shadowOffsetX=0;ctx.shadowOffsetY=2/z;
    /* Background: amber when collapsed (inviting), accent when expanded (active) */
    if(expanded){
      ctx.fillStyle="#2d5fd3";
    }else{
      ctx.fillStyle="#f59e0b";
    }
    roundRectPath(ctx,box.x,box.y,box.w,box.h,6/z);ctx.fill();
    ctx.shadowColor="transparent";
    /* Icon */
    ctx.strokeStyle="#fff";ctx.lineWidth=2/z;ctx.lineCap="round";ctx.lineJoin="round";
    if(expanded){
      /* Collapse: chevron-left */
      ctx.beginPath();ctx.moveTo(cx+2.5/z,cy-4/z);ctx.lineTo(cx-2.5/z,cy);ctx.lineTo(cx+2.5/z,cy+4/z);ctx.stroke();
    }else{
      /* Expand: chevron-right */
      ctx.beginPath();ctx.moveTo(cx-2.5/z,cy-4/z);ctx.lineTo(cx+2.5/z,cy);ctx.lineTo(cx-2.5/z,cy+4/z);ctx.stroke();
    }
    ctx.restore();
  }
  /* G6: 跃迁按钮移到节点下方，加闪烁脉冲提示 */
  if(it.jumpTo){
    const jb=jumpBounds(it,b);
    const pulse=0.55+0.45*Math.sin(performance.now()/500);
    ctx.save();ctx.globalAlpha=pulse;
    ctx.fillStyle=dc("rgba(255,255,255,.85)","rgba(47,56,75,.9)");
    roundRectPath(ctx,jb.x,jb.y,jb.w,jb.h,8/z);ctx.fill();
    ctx.strokeStyle=dc("rgba(42,94,195,.5)","rgba(147,180,245,.5)");ctx.lineWidth=1/z;ctx.stroke();
    ctx.fillStyle=dc("#285bbc","#c7dcff");ctx.font="600 9px "+FONT;ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText("↗ 跃迁",jb.x+jb.w/2,jb.y+jb.h/2+.4/z);ctx.restore();
  }
  /* 节点、附件与便签均使用同一种批注卡；颜色来自对象本身。 */
  if(it.annotation){
    const pos=computeAnnotationPos(it,b);
    const active=annotationIsActive(it);
    if(active)drawAnnotationBubble(it.annotation,pos,it.color||"#2d5fd3",ctx,{active:true,leaderFrom:{x:b.x+b.w/2,y:b.y+b.h}});
    else drawAnnotationCue(it,b);
  }
  ctx.restore();
}
function jumpBounds(it,b){
  /* G6: 跃迁按钮移到节点下方，紧靠节点留小间隙 */
  const z=state.camera.zoom,w=52/z,h=18/z;
  return{x:b.x+b.w/2-w/2,y:b.y+b.h+4/z,w,h};
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
  c.shadowColor=sel?"rgba(45,95,211,.35)":"rgba(0,0,0,"+SC.shadowAlpha+")";
  c.shadowBlur=(sel?12:SC.shadowBlur)/z;c.shadowOffsetY=2/z;
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
    if(it.previewOpen){
      if(state._cameraInteracting){c.fillStyle=dc("rgba(240,242,245,.95)","rgba(28,28,32,.95)");c.fillRect(b.x,cy,b.w,ch);c.fillStyle=dc("#9a9a9e","#7a7a7e");c.font="12px "+SANS_STACK;c.textAlign="center";c.textBaseline="middle";var _fn=f?f.name:"";c.fillText(_fn.length>22?_fn.slice(0,20)+"…":_fn,b.x+b.w/2,cy+ch/2);}else{
      const pv=getPreviewContent(it.fileId);
      const isMd=f&&/\.(md|markdown)$/i.test(f.name);
      /* 多维覆盖层已存在（DOM 层正在/已经呈现内容）→ canvas 不画白底，
         避免"canvas 白底占位 ↔ DOM 内容"每帧交替造成的闪烁 */
      if(isMd){
        /* Markdown：DOM 覆盖层完整渲染（标题/表格/列表/代码/下划线） */
        if(!hasMorph){c.fillStyle=dc("rgba(255,255,255,.94)","rgba(30,30,34,.94)");c.fillRect(b.x,cy,b.w,ch);}
        if(!state._exporting)ensureMorphDom(it);
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
        if(!state._exporting)ensureMorphDom(it);
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
function selectedItem(){
  if(!state.selected) return null;
  /* 先找 items */
  const it=state.items.find(i=>i.id===state.selected);
  if(it)return it;
  /* 再找 links */
  const l=state.links.find(l=>l.id===state.selected);
  if(l)return {type:"link",...l,annotation:l.annotation||""};
  /* 层级连接也是可选择的矢量关系，只是它的父子归属来自树结构而非 links 数组。 */
  const key=String(state.selected||"");
  if(key.startsWith("mind:")){
    const parts=key.split(":");
    const parent=state.items.find(i=>String(i.id)===parts[1]),child=state.items.find(i=>String(i.id)===parts.slice(2).join(":"));
    if(parent&&child)return{type:"mindLink",id:key,aId:parent.id,bId:child.id,relationType:"hierarchy",annotation:"",parent,child};
  }
  return null;
}
/* 聚焦模式：F键进入/退出 */

/* C7 凝视：以选中元素为中心，缩放到 100% */
function gazeAtSelection(){
  const s=selectedItem();
  let tx,ty,tz=1;
  if(s){
    const b=itemBounds(s);
    if(b){
      tx=b.x+b.w/2-W/2;
      ty=b.y+b.h/2-H/2;
      toast("\u51dd\u89c6\uff1a"+(s.text||s.title||"\u5143\u7d20"));
    }else{tx=state.camera.x;ty=state.camera.y;}
  }else{
    const cx=state.camera.x+W/(2*state.camera.zoom);
    const cy=state.camera.y+H/(2*state.camera.zoom);
    tx=cx-W/2;ty=cy-H/2;
    toast("\u51dd\u89c6\uff1a\u753b\u5e03\u4e2d\u5fc3");
  }
  animateCamera(tx,ty,tz);
  setTimeout(function(){zoomPctEl.textContent="100%";},300);
}
function toggleFocus(){
  if(state.focusMode){exitFocus();return;}
  const s=selectedItem();
  if(!s||s.type==="link"||s.type==="mindLink"){toast("请先选中一个内容元素");return;}
  enterFocus(s.id);
}
function enterFocus(id){
  const it=state.items.find(i=>i.id===id);
  if(!it)return;
  /* 记住哪些节点是之前折叠的 */
  const collapsedBackup={};
  for(const n of state.items){
    if(n.type==="mindNode"&&n.collapsed){collapsedBackup[n.id]=true;n.collapsed=false;}
  }
  state.focusMode={id,collapsedBackup,cameraBackup:{...state.camera}};
  /* 聚焦过渡帧：非关联元素渐隐 */
  focusTransition=0;
  const tStart=performance.now();
  function focusAnimStep(now){
    const p=Math.min(1,(now-tStart)/280);
    focusTransition=1-Math.pow(1-p,3);
    if(p<1){requestAnimationFrame(focusAnimStep);}
    else{focusTransition=1;}
    requestRender();
  }
  requestAnimationFrame(focusAnimStep);
  /* 焦点有 detail → 自动展开阅读层 */
  if(it.detail){
    if(typeof expandDetailInPlace==="function")expandDetailInPlace(it);
  }
  /* 以展开后的完整外框居中。旧逻辑的反向补偿会把整体推到视口下方。 */
  const b=itemBounds(it);
  const dl=detailLayoutMap.get(it.id);
  const fullW=dl?dl.width:b.w;
  const fullH=dl?dl.baseH+dl.contentH:b.h;
  const targetX=b.x+fullW/2-W/2/state.camera.zoom;
  const targetY=b.y+fullH/2-H/2/state.camera.zoom;
  animateCamera(targetX,targetY,state.camera.zoom);
  render();
  toast("聚焦模式：F退出");
}
function exitFocus(){
  if(!state.focusMode)return;
  /* 恢复折叠状态与原视角 */
  const bak=state.focusMode.collapsedBackup||{};
  for(const id in bak){
    const n=state.items.find(i=>i.id==id);
    if(n)n.collapsed=true;
  }
  /* 关闭聚焦时自动展开的阅读层（仅收起聚焦节点，不影响 E 键展开的其他节点） */
  if(state.focusMode&&expandedDetailIds.has(state.focusMode.id)){
    const focusItem=state.items.find(i=>i.id===state.focusMode.id);
    if(focusItem&&typeof collapseDetailInPlace==="function")collapseDetailInPlace(focusItem);
  }
  const cameraBak=state.focusMode.cameraBackup;
  state.focusMode=null;
  focusTransition=1; /* 重置过渡帧 */
  /* C12: 退出聚焦 — 相机平滑回归，对称化进入动画 */
  if(cameraBak) state.camera=cameraBak;
  render();
}
/* 获取一级关联 */
function getRelated(id){
  const ids=new Set([id]);
  const it=state.items.find(i=>i.id===id);
  if(!it)return ids;
  /* 聚焦邻域：只保留直接上下游和显式关系；同级节点不是关联。 */
  /* 直接子节点 */
  if(it.children)for(const cid of it.children)ids.add(cid);
  /* 直接父节点（提供来源语境） */
  if(it.parentId)ids.add(it.parentId);
  /* 自由关系线的端点 */
  for(const l of state.links){
    if(l.aId===id)ids.add(l.bId);
    if(l.bId===id)ids.add(l.aId);
  }
  /* 便签、材料的显式挂接 */
  if(it.attachIds)for(const aid of it.attachIds)ids.add(aid);
  /* 被谁 attach */
  for(const n of state.items){
    if(n.type==="mindNode"&&(n.attachIds||[]).includes(id))ids.add(n.id);
  }
  return ids;
}
/* I5-fix: getSecondary（二级关联，恒返回空集且无消费方）已随 focusSecondary 一并删除 */
/* camera 平滑动画 */
function animateCamera(tx,ty,tz){
  const sx=state.camera.x,sy=state.camera.y,sz=state.camera.zoom;
  const start=performance.now();const dur=200;
  state._camInteracting=true;
  function step(){
    const t=Math.min(1,(performance.now()-start)/dur);
    const e=t<1?1-Math.pow(1-t,2.5):1; /* easeOutQuint-ish: fast start, smooth settle */
    state.camera.x=sx+(tx-sx)*e;
    state.camera.y=sy+(ty-sy)*e;
    state.camera.zoom=sz+(tz-sz)*e;
    if(t<1){requestRender();requestAnimationFrame(step);}
    else{state._camInteracting=false;render();} /* 动画结束——直接全量渲染，预览即时出现 */
  }
  step();
}
/* H1 任务3: 已移除跃迁脉冲定时器（_jumpPulseTimer / _jumpPulseCheck / ensureJumpPulse）——
   按钮闪烁完全由 CSS .jump-confirm{animation:jumpPulse 1.2s infinite} 承担，省去每 400ms 一次的全量重绘。 */

/* G6: 跃迁二次确认 — 点击按钮先弹出目标画布名，再点确认才跳转 */
let jumpConfirmEl=null;
function showJumpConfirm(item){
  if(!item||!item.jumpTo)return;
  const targetRef=typeof item.jumpTo==="string"?{canvasId:item.jumpTo}:item.jumpTo;
  const targetProject=state.projects.find(p=>p.id===(targetRef.projectId||state.activeProjectId));
  const target=targetProject?.canvases.find(c=>c.id===targetRef.canvasId);
  if(!target){toast("跃迁目标已不存在");return;}
  dismissJumpConfirm();
  const b=itemBounds(item);if(!b)return;
  const z=state.camera.zoom;
  const el=document.createElement("div");
  el.className="jump-confirm";
  var cn=target.name||"目标画布";
  /* I5-fix: 画布名先转义再进 innerHTML，防内容夹带标签（跳转链路唯一未转义点） */
  el.innerHTML='<span style="margin-right:4px">↗</span>跃迁到「<strong>'+(typeof escapeHtml==="function"?escapeHtml(cn):cn)+'</strong>」<span class="jc-hint">点击确认</span>';
  var dk=state.dark;
  el.style.cssText='position:absolute;pointer-events:auto;cursor:pointer;z-index:9999;'+
    'left:'+((b.x-state.camera.x)*z)+'px;'+
    'top:'+((b.y+b.h+4/z-state.camera.y)*z)+'px;'+
    'transform:scale('+z+');transform-origin:top center;'+
    'background:'+(dk?'rgba(47,56,75,.95)':'rgba(255,255,255,.96)')+';'+
    'border:1px solid '+(dk?'rgba(147,180,245,.5)':'rgba(42,94,195,.45)')+';'+
    'border-radius:8px;padding:6px 14px;font:600 12px var(--font);'+
    'color:'+(dk?'#c7dcff':'#285bbc')+';white-space:nowrap;text-align:center;';
  el.addEventListener("pointerdown",function(e){
    e.stopPropagation();e.preventDefault();
    dismissJumpConfirm();
    followJump(item);
  });
  var board=document.getElementById("board");
  if(board)board.appendChild(el);
  jumpConfirmEl=el;
  /* 外部点击关闭（延迟注册避免当前事件立刻触发） */
  setTimeout(function(){
    document.addEventListener("pointerdown",_jumpConfirmOutside,{once:true});
  },0);
}
function _jumpConfirmOutside(e){
  if(jumpConfirmEl&&jumpConfirmEl!==e.target&&!jumpConfirmEl.contains(e.target)){
    dismissJumpConfirm();
  }
}
function dismissJumpConfirm(){
  if(jumpConfirmEl){jumpConfirmEl.remove();jumpConfirmEl=null;}
}

/* 执行跃迁：切换画布并定位目标元素。 */
function followJump(s){
  if(!s||!s.jumpTo)return false;
  const targetRef=typeof s.jumpTo==="string"?{canvasId:s.jumpTo}:s.jumpTo;
  const targetProject=state.projects.find(p=>p.id===(targetRef.projectId||state.activeProjectId));
  const target=targetProject?.canvases.find(c=>c.id===targetRef.canvasId);
  if(!target){toast("跃迁目标已不存在");return false;}
  if(targetProject.id!==state.activeProjectId)switchProject(targetProject.id);
  switchCanvas(target.id);
  const targetItem=targetRef.itemId&&target.items.find(i=>i.id===targetRef.itemId);
  if(targetItem){
    state.selected=targetItem.id;
    const b=itemBounds(targetItem);
    state.camera.x=b.x+b.w/2-W/2/state.camera.zoom;
    state.camera.y=b.y+b.h/2-H/2/state.camera.zoom;
  }
  render();toast("已跃迁到「"+target.name+"」"+(targetItem?"的「"+(targetItem.text||"元素")+"」":""));return true;
}
/* 跃迁：已设置目标时立即执行；否则进入目标选择。 */
function openJump(){
  const s=selectedItem();
  if(!s||s.type==="link"){toast("请先选中一个内容元素");return;}
  if(followJump(s))return;
  const cp=curProject();
  const opts=cp.canvases.filter(c=>c.id!==state.activeCanvasId).map(c=>({
    id:c.id,label:c.name,desc:"选择该画布中的目标元素",onClick:()=>{
      const targetItems=c.items.filter(i=>i.type!=="connector"&&i.type!=="stroke").slice(0,40);
      if(!targetItems.length){pushHistory("设置跃迁");s.jumpTo={canvasId:c.id,itemId:null};saveState();render();toast("已设置画布跃迁目标："+c.name);return;}
      showOptions("选择跃迁目标",targetItems.map(i=>({
        id:String(i.id),label:i.text||KIND_LABEL[i.kind]||"元素",desc:i.type==="mindNode"?"导图节点":"定位到该元素",
        onClick:()=>{pushHistory("设置跃迁");s.jumpTo={canvasId:c.id,itemId:i.id};saveState();render();toast("已设置跃迁："+c.name+" · "+(i.text||"元素"));}
      })));
    }
  }));
  if(!opts.length){toast("当前项目只有一张画布，请先新建画布");return;}
  showOptions("跃迁到画布",opts);
}
/* E5: removed detail modal handlers */

/* E5: Detail state variables (restored after truncation) */
/* G6: 多实例展开 — Set 替代单值 detailItemId，Map 替代单值 detailLayout */
/* I5-fix: E5 时代的 null 桩 detailEditId/detailEditSession/detailPanel/detailTextarea 已删——
   detailTextarea 曾被 editors.js mdTarget() 当兜底引用（永不为真，删桩时已同步改 mdTarget） */
let expandedDetailIds=new Set();
let detailLayoutMap=new Map();
const detailAnimFrames=new Map();  /* ownerId -> rAF handle；每节点独立，避免互相取消 */
const detailReadLayer=document.getElementById("detailReadLayer");
