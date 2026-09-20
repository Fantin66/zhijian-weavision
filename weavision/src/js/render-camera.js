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
