"use strict";

/* 形变覆盖层跟随文件卡片：位置/尺寸按相机变换实时同步；
   卡片关闭形变或删除时销毁覆盖层 */

/* ============================================================
   左热区/Dock 相关同步（保留原 syncMorphDom）
============================================================ */
function previewInteractionActive(){return !!(state._camInteracting||(drag&&drag.previewMoved));}
function syncPausedPreviewGeometry(){
  const z=state.camera.zoom,items=new Map(state.items.map(i=>[String(i.id),i]));
  for(const [id,m] of morphMap){
    const it=items.get(id);if(!it)continue;const b=itemBounds(it),p=w2s(b.x,b.y);
    m.el.style.left=p.x+"px";m.el.style.top=p.y+"px";m.el.style.transform="scale("+z+")";
  }
  const windows=new Map([...previewLayer.children].filter(el=>el.dataset.pv).map(el=>[el.dataset.pv,el]));
  for(const pv of state.previews){const el=windows.get(String(pv.id));if(!el)continue;const p=w2s(pv.x,pv.y);el.style.left=p.x+"px";el.style.top=p.y+"px";el.style.width=pv.w*z+"px";el.style.height=pv.h*z+"px";}
}
function syncMorphDom(){
  if(previewInteractionActive())return;
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
  const cards=new Map(state.items.filter(i=>i.type==="fileCard").map(i=>[String(i.id),i]));
  for(const [cardId,m] of [...morphMap]){
    const el=m.el;
    /* 防御：若节点已被其他逻辑移出 DOM，重新挂载 */
    if(!document.body.contains(el)){
      const layer=document.getElementById("previewLayer");
      if(layer)layer.appendChild(el);else{destroyMorphDom(cardId);continue;}
    }
    const card=cards.get(cardId);
    if(!card||!card.previewOpen){
      destroyMorphDom(cardId);
      continue;
    }
    const b=itemBounds(card);
    if(!b){destroyMorphDom(cardId);continue;}
    const resizing=!!(drag?.previewMoved&&drag.mode==="resize"&&String(drag.item?.id)===cardId);
    el.classList.toggle("preview-body-paused",resizing);
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
    if(mBody&&!resizing){
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
      if(it.type==="fileCard"&&it.previewOpen&&it.fileId&&inViewport(itemBounds(it))){
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
          if(typeof ensureMorphDom==="function"){ensureMorphDom(it);requestRender();break;}
        }
      }
    }
    layer.style.display=layer.children.length>0?"block":"none";
  }
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
  /* 超聚焦态下按 F：退回聚焦态（带回位动画） */
  if(state.focusMode&&state.focusMode.super){exitSuperFocus();return;}
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
  /* 退出也要有过渡：聚光遮罩以残影淡出（进入有淡入，退出不该瞬间消失） */
  if(typeof startFocusSpotFade==="function")startFocusSpotFade();
  /* 超聚焦态退出：先还原重排，避免布局残留 */
  if(state.focusMode.super)revertSuperLayout();
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

/* ============================================================
   超聚焦（Super Focus）
   —— 聚焦态下点击 HUD 的「进入超聚焦」按钮触发（不占用快捷键，避免与搜索等冲突）。
   设计要点（按用户要求）：
   1) 只把过远/过散的一级邻域「收拢拉近」，尽量保持每个元素原有的方位与相对关系，
      不重排成另一种布局（它只是"把散开的收回来"，不是"重新排一遍"）；
   2) 收拢后再做去重叠，避免附件之间互相遮盖；
   3) 进入/退出都有位移动画；进入时中心高亮、四周压暗，形成明显的"超聚焦"观感。
============================================================ */
function _superNeighbors(centerId){
  const rel=getRelated(centerId);
  const list=[];
  for(const id of rel){
    if(id===centerId)continue;
    const it=state.items.find(i=>i.id===id);
    if(!it||it.type==="stroke"||it.type==="connector")continue;
    list.push(it);
  }
  return list;
}
/* 去重叠：以中心为锚，迭代把相互遮盖的盒子推开（lock 的盒子不动） */
function _separateBoxes(boxes){
  const pad=26;
  for(let iter=0;iter<60;iter++){
    let moved=false;
    for(let i=0;i<boxes.length;i++){
      for(let j=i+1;j<boxes.length;j++){
        const a=boxes[i],b=boxes[j];
        const ox=(a.x+a.w/2)-(b.x+b.w/2), oy=(a.y+a.h/2)-(b.y+b.h/2);
        const px=(a.w+b.w)/2+pad-Math.abs(ox), py=(a.h+b.h)/2+pad-Math.abs(oy);
        if(px>0&&py>0){
          moved=true;
          if(a.lock&&b.lock)continue;
          if(a.lock){ b.x+=(ox>=0?-1:1)*px; b.y+=(oy>=0?-1:1)*py; continue; }
          if(b.lock){ a.x+=(ox>=0?1:-1)*px; a.y+=(oy>=0?1:-1)*py; continue; }
          if(px<py){ const s=(ox>=0?1:-1)*px/2; a.x+=s; b.x-=s; }
          else{ const s=(oy>=0?1:-1)*py/2; a.y+=s; b.y-=s; }
        }
      }
    }
    if(!moved)break;
  }
}
function _superBoxOf(center,others,moves){
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  const cb=itemBounds(center);
  minX=Math.min(minX,cb.x);minY=Math.min(minY,cb.y);maxX=Math.max(maxX,cb.x+cb.w);maxY=Math.max(maxY,cb.y+cb.h);
  others.forEach((n,i)=>{const b=itemBounds(n);const x=moves[i].tx,y=moves[i].ty;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+b.w);maxY=Math.max(maxY,y+b.h);});
  const pad=70;
  return {x:minX-pad,y:minY-pad,w:maxX-minX+pad*2,h:maxY-minY+pad*2};
}
function _superFitCamera(){
  const fm=state.focusMode;if(!fm||!fm.superBox)return;
  const b=fm.superBox;
  const nz=clamp(Math.min(state.camera.zoom,Math.min(W/(b.w+80),H/(b.h+80))),0.3,1.6);
  animateCamera(b.x+b.w/2-W/2/nz,b.y+b.h/2-H/2/nz,nz);
}
let _superAnimGen=0;
function _animateSuper(moves,dur,done){
  if(!moves||!moves.length){if(done)done();return;}
  const gen=++_superAnimGen,t0=performance.now();
  function step(now){
    if(gen!==_superAnimGen)return;
    const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);
    for(const m of moves){m.it.x=m.fx+(m.tx-m.fx)*e;m.it.y=m.fy+(m.ty-m.fy)*e;}
    render();
    if(p<1)requestAnimationFrame(step);
    else{for(const m of moves){m.it.x=m.tx;m.it.y=m.ty;}render();if(done)done();}
  }
  requestAnimationFrame(step);
}
/* 超聚焦"聚光强度"动画（0→1 收拢加强 / →0 淡出）：驱动 drawFocusSpotlight 的强度与半径 */
let _superTGen=0;
function _animateSuperT(target,dur,done){
  const fm=state.focusMode;if(!fm){if(done)done();return;}
  const gen=++_superTGen,t0=performance.now(),from=fm._superT||0;
  function step(now){
    if(gen!==_superTGen)return;
    const cur=state.focusMode;
    if(!cur){if(done)done();return;}
    const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);
    cur._superT=from+(target-from)*e;
    render();
    if(p<1)requestAnimationFrame(step);else{cur._superT=target;if(done)done();}
  }
  requestAnimationFrame(step);
}
/* 生成"收拢但保持相对方位"的目标位置 */
function _superMoves(){
  const fm=state.focusMode;if(!fm)return null;
  const center=state.items.find(i=>i.id===fm.id);if(!center)return null;
  const others=_superNeighbors(fm.id);
  if(!others.length)return null;
  const cb=itemBounds(center),cx=cb.x+cb.w/2,cy=cb.y+cb.h/2;
  const info=others.map(n=>{
    const b=itemBounds(n);const nx=b.x+b.w/2,ny=b.y+b.h/2;
    const dx=nx-cx,dy=ny-cy;const d=Math.hypot(dx,dy)||1;
    return {n,ux:dx/d,uy:dy/d,d,b};
  });
  const maxD=Math.max.apply(null,info.map(o=>o.d));
  const target=clamp(maxD*0.55,240,560);
  const moves=info.map(o=>{
    const nd=Math.min(o.d,target);
    return {it:o.n,fx:o.n.x,fy:o.n.y,tx:cx+o.ux*nd-o.b.w/2,ty:cy+o.uy*nd-o.b.h/2};
  });
  const boxes=[{it:center,x:cb.x,y:cb.y,w:cb.w,h:cb.h,lock:true}]
    .concat(moves.map(m=>({it:m.it,x:m.tx,y:m.ty,w:itemBounds(m.it).w,h:itemBounds(m.it).h})));
  _separateBoxes(boxes);
  moves.forEach((m,i)=>{m.tx=Math.round(boxes[i+1].x);m.ty=Math.round(boxes[i+1].y);});
  return {center,others,moves};
}
function applySuperLayout(){
  const fm=state.focusMode;if(!fm)return false;
  const r=_superMoves();
  if(!r){toast("该元素没有直接关联内容，无法超聚焦");return false;}
  if(!fm.layoutBackup){fm.layoutBackup=[r.center].concat(r.others).map(n=>({id:n.id,x:n.x,y:n.y}));}
  fm.superBox=_superBoxOf(r.center,r.others,r.moves);
  _superFitCamera();
  _animateSuper(r.moves,320);
  fm.layoutType="compact";
  return true;
}
/* 还原重排坐标（保留聚焦态本身） */
function revertSuperLayout(){
  const fm=state.focusMode;if(!fm||!fm.layoutBackup)return;
  for(const s of fm.layoutBackup){const n=state.items.find(i=>i.id===s.id);if(n){n.x=s.x;n.y=s.y;}}
  fm.layoutBackup=null;fm.layoutType=null;fm.superBox=null;
}
/* HUD 按钮：进入 / 退出超聚焦（仅聚焦态可用；不占快捷键） */
function toggleSuperFocus(){
  if(state.focusMode&&state.focusMode.super){exitSuperFocus();return;}
  if(!state.focusMode){toast("请先按 F 进入聚焦，再点「进入超聚焦」");return;}
  if(applySuperLayout()){state.focusMode.super=true;_animateSuperT(1,320);render();if(typeof updateFocusHud==="function")updateFocusHud();}
}
/* 退出超聚焦 → 回到聚焦态（位置回程动画 + 聚光由"超聚焦级"平滑退回"聚焦级"） */
function exitSuperFocus(){
  if(!state.focusMode||!state.focusMode.super)return;
  const fm=state.focusMode;
  const moves=[];
  if(fm.layoutBackup)for(const s of fm.layoutBackup){const n=state.items.find(i=>i.id===s.id);if(n)moves.push({it:n,fx:n.x,fy:n.y,tx:s.x,ty:s.y});}
  fm.super=false;fm.layoutBackup=null;
  /* 注意：superBox 要留到强度动画结束再清，否则聚光中心会瞬移 */
  _animateSuperT(0,280,()=>{fm.superBox=null;fm.layoutType=null;if(typeof updateFocusHud==="function")updateFocusHud();render();});
  _animateSuper(moves,280,()=>{saveStateDebounced();if(typeof updateFocusHud==="function")updateFocusHud();});
  render();
  toast("已退出超聚焦");
}

/* camera 平滑动画 */
let _cameraAnimation=0;
function animateCamera(tx,ty,tz){
  const generation=++_cameraAnimation;
  if(typeof _camTimer!=="undefined")clearTimeout(_camTimer);
  const sx=state.camera.x,sy=state.camera.y,sz=state.camera.zoom;
  /* reducedMotion 是既有的背景流光开关，不能借它关闭纵览/聚焦动画。 */
  const start=performance.now();const dur=200;
  state._camInteracting=true;
  function step(){
    if(generation!==_cameraAnimation)return;
    const t=dur?Math.min(1,(performance.now()-start)/dur):1;
    const e=t<1?1-Math.pow(1-t,2.5):1; /* easeOutQuint-ish: fast start, smooth settle */
    state.camera.x=sx+(tx-sx)*e;
    state.camera.y=sy+(ty-sy)*e;
    state.camera.zoom=sz+(tz-sz)*e;
    if(t<1){requestRender();requestAnimationFrame(step);}
    else{state._camInteracting=false;if(zoomPctEl)zoomPctEl.textContent=Math.round(tz*100)+"%";requestRender();}
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
