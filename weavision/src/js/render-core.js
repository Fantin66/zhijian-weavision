"use strict";

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
  let visibleCount=0;
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
    state.focusMode._relSet=focusPrimary; /* 供命中/框选/悬停过滤：被隐藏的元素不响应鼠标 */
  }
  ZhijianPerf.mark(perfFrame,"prepare");
  /* 聚焦/超聚焦的"舞台灯"：铺在元素之下（背景层），只压暗四周、凸显聚焦内容——
     此前画在元素之上，会把元素本身也一起压暗，逻辑反了 */
  if(state.focusMode||(state._spotFade&&state._spotFade.t>0.01))drawFocusSpotlight();
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
      if(it.type!=="mindNode"&&filterOk(it)){const _b=itemBounds(it);if(!_b||inViewport(_b)){visibleCount++;drawItem(it);}} /* H3 任务14: 视口裁剪，跳过屏幕外元素 */
    }
    for(const it of state.items){
      if(it.type==="mindNode"&&isMindNodeVisible(it)&&filterOk(it)){const _b=itemBounds(it);if(!_b||inViewport(_b)){visibleCount++;drawItem(it);}} /* H3 任务14: 视口裁剪 */
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
  if(previewInteractionActive()){
    if(selbar)selbar.style.display="none";
  }else{
    updateSelBar();updateFocusHud();renderDock();
  }
  updateStatusBar();drawStatusHUD();
  /* 仅镜头变化暂停附件正文。保留外框和工具栏的轻量坐标更新。 */
  previewLayer.style.visibility="";
  previewLayer.classList.toggle("preview-camera-paused",previewInteractionActive());
  if(previewInteractionActive()){
    syncPausedPreviewGeometry();
    if(typeof syncDetailReadDom==="function")syncDetailReadDom();
  }else{
    for(const layer of [previewLayer,typeof detailReadLayer!=="undefined"?detailReadLayer:null])if(layer){layer.style.transform="";layer.style.overflow="";}
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
    const liveMind=new Set();
    for(const item of state.items){if(item.type==="mindNode"&&item.parentId)liveMind.add("mind:"+item.parentId+":"+item.id);}
    for(const [lid] of linkAnimMap){
      if(lid.indexOf("mind:")===0){
        /* K7：一次构造存活关系集合，避免每条线再扫描整张画布。 */
        if(!liveMind.has(lid))linkAnimMap.delete(lid);
      }else if(!live.has(lid)){
        linkAnimMap.delete(lid);
      }
    }
  }
  ZhijianPerf.endFrame(perfFrame,{items:state.items.length,links:state.links.length,visible:visibleCount});
  /* H1 任务3: 跃迁闪烁由 CSS .jump-confirm 动画完成，不再触发低频全量重绘定时器 */
}

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

/* 聚焦 / 超聚焦的"舞台灯"：中心透亮、四周向外压暗的圆形柔光（画在元素之下，世界坐标）。
   —— 按 F 聚焦即淡入（轻微），进入超聚焦进一步收拢加强；退出由 _spotFade 残影淡出。
   中心/半径/强度都随动画量平滑插值：t1=focusTransition（聚焦）、t2=fm._superT（超聚焦）。 */
function _spotDraw(cx,cy,r0,alpha){
  if(alpha<=0.002)return;
  const g=ctx.createRadialGradient(cx,cy,r0*0.5,cx,cy,r0*2.3);
  g.addColorStop(0,"rgba(8,12,22,0)");
  g.addColorStop(0.5,"rgba(8,12,22,"+(alpha*0.42).toFixed(3)+")");
  g.addColorStop(1,"rgba(8,12,22,"+alpha.toFixed(3)+")");
  ctx.save();
  ctx.fillStyle=g;
  ctx.fillRect(state.camera.x,state.camera.y,W/state.camera.zoom,H/state.camera.zoom);
  ctx.restore();
}
function drawFocusSpotlight(){
  const fm=state.focusMode;
  if(fm){
    const it=state.items.find(i=>i.id===fm.id);if(!it)return;
    const ib=itemBounds(it);if(!ib)return;
    /* 聚焦基准：圈大、只做氛围 */
    const fx=ib.x+ib.w/2, fy=ib.y+ib.h/2, fr=Math.max(ib.w,ib.h)*0.8+170;
    /* 超聚焦基准：收拢到邻域范围 */
    let sx=fx,sy=fy,sr=fr;
    if(fm.superBox){const b=fm.superBox;sx=b.x+b.w/2;sy=b.y+b.h/2;sr=Math.min(b.w,b.h)*0.58;}
    const t1=(typeof focusTransition==="number"?focusTransition:1);
    const t2=fm._superT||0;
    const cx=fx+(sx-fx)*t2, cy=fy+(sy-fy)*t2, r0=fr+(sr-fr)*t2;
    _spotDraw(cx,cy,Math.max(90,r0),0.10*t1+0.19*t2);   /* 整体调淡，只做氛围 */
    return;
  }
  const s=state._spotFade;
  if(s&&s.t>0.01)_spotDraw(s.cx,s.cy,s.r0,0.10*s.t);
}
/* 退出聚焦时：把当前聚光中心/半径记成"残影"，随后淡出（避免遮罩瞬间消失） */
let _spotFadeGen=0;
function startFocusSpotFade(){
  const fm=state.focusMode;if(!fm)return;
  const it=state.items.find(i=>i.id===fm.id);if(!it)return;
  const ib=itemBounds(it);if(!ib)return;
  let cx=ib.x+ib.w/2, cy=ib.y+ib.h/2, r0=Math.max(ib.w,ib.h)*0.8+170;
  const t2=fm._superT||0;
  if(fm.superBox){const b=fm.superBox;cx=cx+(b.x+b.w/2-cx)*t2;cy=cy+(b.y+b.h/2-cy)*t2;r0=r0+(Math.min(b.w,b.h)*0.58-r0)*t2;}
  state._spotFade={cx:cx,cy:cy,r0:Math.max(90,r0),t:1};
  const gen=++_spotFadeGen, t0=performance.now();
  function step(now){
    if(gen!==_spotFadeGen)return;
    const p=Math.min(1,(now-t0)/300);
    if(!state._spotFade||gen!==_spotFadeGen)return;
    state._spotFade.t=1-p;
    render();
    if(p<1)requestAnimationFrame(step);else state._spotFade=null;
  }
  requestAnimationFrame(step);
}
function updateFocusHud(){
  if(!state.focusMode){focusHud.classList.remove("show");return;}
  const item=state.items.find(i=>i.id===state.focusMode.id);
  if(!item){focusHud.classList.remove("show");return;}
  const related=getRelated(item.id);
  focusHud.querySelector("strong").textContent=item.text||"未命名元素";
  focusHud.querySelector(".focus-meta").textContent="直接关系 "+Math.max(0,related.size-1)+" 个";
  const _sfb=focusHud.querySelector("#superFocusBtn");
  if(_sfb){const _t=state.focusMode.super?"退出超聚焦":"进入超聚焦";if(_sfb.textContent!==_t)_sfb.textContent=_t;}
  focusHud.classList.add("show");
}
focusHud.querySelector("#focusExitBtn").addEventListener("click",()=>exitFocus());
focusHud.querySelector("#superFocusBtn").addEventListener("click",()=>toggleSuperFocus());
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

function roundRectPath(c,x,y,w,h,r){
  const rr=Math.max(0.5,Math.min(Math.max(0,r),w/2,h/2));
  c.beginPath();
  c.moveTo(x+rr,y);c.arcTo(x+w,y,x+w,y+h,rr);c.arcTo(x+w,y+h,x,y+h,rr);c.arcTo(x,y+h,x,y,rr);c.arcTo(x,y,x+w,y,rr);
  c.closePath();
}
const wrappedTextCache=new Map();let wrappedTextChars=0;
document.fonts?.addEventListener("loadingdone",()=>{wrappedTextCache.clear();wrappedTextChars=0;requestRender();});
function wrapLines(c,text,maxW){
  text=String(text);
  const key=JSON.stringify([c.font,c.fontKerning,c.letterSpacing,c.wordSpacing,c.direction,maxW,text]);
  const hit=wrappedTextCache.get(key);
  if(hit){wrappedTextCache.delete(key);wrappedTextCache.set(key,hit);return hit.slice();}
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
  const result=lines.length?lines:[""];
  if(text.length<=10000){
    while(wrappedTextCache.size&&(wrappedTextCache.size>=3000||wrappedTextChars+key.length>1000000)){
      const oldest=wrappedTextCache.keys().next().value;wrappedTextChars-=oldest.length;wrappedTextCache.delete(oldest);
    }
    wrappedTextCache.set(key,result);wrappedTextChars+=key.length;
  }
  return result.slice();
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
  container.innerHTML='<div class="pv-loading"><div class="spinner"></div>加载图片…</div>';
  const loading=container.firstElementChild;
  const wrap=document.createElement("div");
  wrap.className=o.wrapClass||"morph-fit";
  if(o.wrapStyle)wrap.style.cssText=o.wrapStyle;
  const img=document.createElement("img");
  img.onload=()=>{loading.remove();};
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

/* E5: removed detail modal handlers */

/* E5: Detail state variables (restored after truncation) */
/* G6: 多实例展开 — Set 替代单值 detailItemId，Map 替代单值 detailLayout */
/* I5-fix: E5 时代的 null 桩 detailEditId/detailEditSession/detailPanel/detailTextarea 已删——
   detailTextarea 曾被 editors.js mdTarget() 当兜底引用（永不为真，删桩时已同步改 mdTarget） */
let expandedDetailIds=new Set();
let detailLayoutMap=new Map();
const detailAnimFrames=new Map();  /* ownerId -> rAF handle；每节点独立，避免互相取消 */
const detailReadLayer=document.getElementById("detailReadLayer");
