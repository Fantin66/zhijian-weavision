"use strict";
/* ============================================================
   指针交互
============================================================ */
/* 记录指针屏幕坐标，供悬浮编辑器跟随定位 */
canvas.addEventListener("pointermove",e=>{lastPointer={x:e.clientX,y:e.clientY};},{passive:true});
canvas.addEventListener("pointerdown",onPointerDown);
canvas.addEventListener("pointermove",onPointerMove);
canvas.addEventListener("pointerup",onPointerUp);
canvas.addEventListener("pointercancel",onPointerUp);
canvas.addEventListener("contextmenu",e=>{
  e.preventDefault();
  const bxy=boardXY(e.clientX,e.clientY);
  lastPointer={x:e.clientX,y:e.clientY};
  const wpt=s2w(bxy.x,bxy.y);
  const hit=hitTest(wpt.x,wpt.y);
  if(hit) state.selected=hit.id;
  showCtxMenu(e,hit);
  render();
});
canvas.addEventListener("dblclick",e=>{
  const bxy=boardXY(e.clientX,e.clientY);
  const wpt=s2w(bxy.x,bxy.y);
  const hit=hitTest(wpt.x,wpt.y);
  const nc=hitNodeControl(wpt.x,wpt.y);if(nc&&nc.kind==="detail"&&nc.hit==="body"){state.selected=nc.item.id;openDetailEditor(nc.item);return;}if(hit&&(hit.type==="note"||hit.type==="mindNode")){ state.selected=hit.id; openTextEditor(hit); render(); }
  else if(hit&&hit.type==="fileCard"){
    /* 预期交互：双击附件 = 形变展开预览（图片/视频/文档直接呈现在形变区域内）。
       链接类型保持在新窗口打开。不再弹独立预览窗口。 */
    const f=state.files.find(x=>x.id===hit.fileId);
    if(f){
      if(f.kind==="link"){ window.open(f.url,"_blank"); }
      else togglePreviewMorph(hit);
    }
  }
  else{
    /* 双击空白处：按当前工具/临时工具建对应元素 */
    if(state.tempTool==="note"){
      pushHistory("添加便签");const n=addNote(wpt.x,wpt.y,undefined,state.noteColor);state.selected=n.id;render();saveStateDebounced();state.tempTool="";renderToolOptions();
    }else{
      /* 默认建导图节点（不管是不是 M 工具） */
      pushHistory("添加节点");const n=addMindNode(defaultNodeName(null),null,state.mindColor,wpt.x,wpt.y);state.selected=n.id;render();saveStateDebounced();
      setTimeout(()=>{const s=selectedItem();if(s&&s.type==="mindNode")openTextEditor(s);},50);
    }
  }
});
/* 悬停：高亮 + 光标反馈（mousemove 驱动，CDP 下也稳定派发） */
canvas.addEventListener("mousemove",e=>{
  const bxy=boardXY(e.clientX,e.clientY);
  const wpt=s2w(bxy.x,bxy.y);
  state.mouseWorld=wpt;
  const hit=hoverHit(wpt.x,wpt.y);
  const linkPt=hitMindLinkPoint(wpt.x,wpt.y);
  const hkey=hit?hit.type+":"+hit.id:linkPt?"linkpt:"+linkPt.id:null;
  const prev=state.hover?state.hover.type+":"+state.hover.id:state.linkPointHover?"linkpt:"+state.linkPointHover:null;
  if(hkey!==prev){
    state.hover=hit?{id:hit.id,type:hit.type}:null;
    state.linkPointHover=linkPt?linkPt.id:null;
    requestRender();
  }
  const htype=hit?hit.type:null;
  let cur="default";
  if(state.tempTool==="pen") cur="crosshair";
  else if(state.tempTool==="note") cur="copy";
  else if(linkPt) cur="crosshair";
  else if(htype==="mindNode") cur="pointer";
  else if(htype==="fileCard") cur="pointer";
  else if(htype==="note") cur="move";
  else if(isConnectionItem(hit)) cur="move";
  canvas.style.cursor=cur;
});
canvas.addEventListener("mouseleave",()=>{if(state.hover){state.hover=null;}if(state.linkPointHover){state.linkPointHover=null;}requestRender();});
let trackpadPanUntil=0;
let _camTimer=0;
/* J2-fix: 缩放/平移时设标志——render 里跳过 DOM 同步 + 预览内容用占位替代，
   200ms 无操作后清除，恢复完整渲染 */
board.addEventListener("wheel",e=>{
  if(isTyping()) return;
  /* 浮层内滚轮放行：预览窗/形变层/Dock二级菜单/便签编辑/全屏层等
     内部滚动由各自容器原生接管，不拦截、不触发画布平移/缩放 */
  const t=e.target;
  if(t&&t.closest&&t.closest(".pv-morph-content,.pv-body,#dockSub,#noteEditor,#notePreview,#detailPanel,#menuDrop,#fullscreenView,#dockBar .dock-inner,#searchResults")) return;
  e.preventDefault();
  state._camInteracting=true;clearTimeout(_camTimer);
  _camTimer=setTimeout(function(){state._camInteracting=false;requestRender();},80);
  const bxy=boardXY(e.clientX,e.clientY);
  /* Windows Precision Touchpad 会送出从很小到 100+ 的连续像素值，
     不能再用 deltaY<40 判断。只让 ctrl+wheel（捏合）和离散鼠标滚轮缩放；
     双指纵/横滑一律平移画布。 */
  if(e.ctrlKey){
    /* 触控板捏合缩放 */
    const factor=Math.exp(-e.deltaY*0.01);
    zoomAt(bxy.x,bxy.y,factor);
  }else{
    const ax=Math.abs(e.deltaX),ay=Math.abs(e.deltaY),now=performance.now();
    /* I5-fix: 判据去掉 ay%100 分支——120 增量的鼠标滚轮被误判成触控板，只能平移不能缩放。
       新判据：有横向分量或纵向小增量=触控板；大纵向增量(≥88)且无横向=离散鼠标滚轮 */
    const isTrackpad=e.deltaMode===0&&(ax>2||(ay>0&&ay<88)||now<trackpadPanUntil);
    if(isTrackpad){
      trackpadPanUntil=now+180;
      /* Windows 触控板：双指移动表示“滚动视口”，不是抓住内容一起拖。
         因此相机与滚动增量同向变化，画布在视觉上与手指方向相反，
         和 Windows 桌面、资源管理器的默认方向一致。 */
      const z=state.camera.zoom;
      state.camera.x+=e.deltaX/z;
      state.camera.y+=e.deltaY/z;
      if(zoomPctEl) zoomPctEl.textContent=Math.round(z*100)+"%";
      requestRender();updateStatusBar();
    }else{
      /* 离散鼠标滚轮 → 缩放 */
      const factor=Math.exp(-e.deltaY*0.0016);
      zoomAt(bxy.x,bxy.y,factor);
    }
  }
},{passive:false});

/* I5-fix: 拖拽类撤销快照延迟到真正发生位移时才入栈——此前 pointerdown 即 pushHistory，
   普通点击也会塞入一条无变化的空快照，Ctrl+Z 连按多次都"没有反应"，60 深历史被空快照挤掉 */
let _deferredHistory;   /* undefined=无待入栈；null=待入栈(无标签)；字符串=待入栈(带标签) */
function deferHistory(label){_deferredHistory=(label===undefined)?null:label;}
function flushDeferredHistory(){
  if(_deferredHistory===undefined)return;
  pushHistory(_deferredHistory===null?undefined:_deferredHistory);
  _deferredHistory=undefined;
}
function cancelDeferredHistory(){_deferredHistory=undefined;}
function beginMoveDrag(hit,wpt,pointer,marqueeSelect){
  deferHistory();
  const startPosMap={},startPtsMap={};
  const ids=state.multiSel.length>1?state.multiSel:[hit.id];
  const allIds=new Set(ids);
  for(const mid of ids){
    const mi=idMap.get(mid);
    if(mi&&mi.type==="mindNode"){
      const collectKids=node=>{for(const cid of node.children||[]){
        allIds.add(cid);const child=idMap.get(cid);if(child)collectKids(child);
      }};
      collectKids(mi);
    }
  }
  for(const mid of allIds){
    const mi=idMap.get(mid);
    if(mi){startPosMap[mid]={x:mi.x,y:mi.y};if(mi.type==="stroke")startPtsMap[mid]=mi.points.map(p=>({x:p.x,y:p.y}));}
  }
  drag={mode:"move",item:hit,start:wpt,startX:hit.x,startY:hit.y,movedDist:0,startPosMap,startPtsMap,
    startPts:hit.type==="stroke"?hit.points.map(p=>({...p})):null,
    startA:hit.type==="connector"?{ax:hit.a.x,ay:hit.a.y,bx:hit.b.x,by:hit.b.y,af:!!hit.a.free,bf:!!hit.b.free}:null,
    marqueeSelect:!!marqueeSelect,pointer};
  canvas.setPointerCapture(pointer);
}
function onPointerDown(e){
  /* 防御：如果上一次交互的 drag 未正常结束（如指针在窗口外释放），
     清除残留状态，避免后续交互失效 */
  if(drag&&!e.buttons){drag=null;board.classList.remove("panning");}
  rebuildIdMap(); /* H1 任务7: 交互前刷新 id→item 索引，collectKids/move-loop 即时命中最新元素 */
  hideCtxMenu();
  if(editingNoteId!==null||editingDetailId!==null) closeEditor(false);
  if(editingMindId!==null) closeMindEditor(false);
  if(e.button===2) return;
  const bxy=boardXY(e.clientX,e.clientY);
  const sx=bxy.x,sy=bxy.y;
  /* 左下角数据 HUD：点击缩放段 → 重置100%；点击其他段 → 仅隐藏 HUD（不干扰画布） */
  const hudHit=statusHUDHit(sx,sy);
  if(hudHit){
    if(hudHit==="zoom"){
      const oldZoom=state.camera.zoom;
      const cx=state.camera.x+W/(2*oldZoom),cy=state.camera.y+H/(2*oldZoom);
      state.camera.zoom=1;state.camera.x=cx-W/2;state.camera.y=cy-H/2;
      render();
    }
    return;
  }
  const wpt=s2w(sx,sy);
  state.mouseWorld=wpt;
  /* 平移：中键 / 空格 / 空白拖拽统一走 select 分支 */
  if(e.button===1||state.spaceDown){
    drag={mode:"pan",lastX:sx,lastY:sy,pointer:e.pointerId};
    board.classList.add("panning");
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if(e.button!==0) return;
  const cur=selectedItem();
  /* 手柄优先（选中便签/文件卡片的 8 个手柄） */
  if(cur&&isResizableItem(cur)){
    const h=hitHandle(cur,sx,sy);
    if(h){
      deferHistory();
      drag={mode:"resize",handle:h,item:cur,startW:cur.w,startH:cur.h,startX:cur.x,startY:cur.y,start:wpt,pointer:e.pointerId};
      canvas.setPointerCapture(e.pointerId);
      return;
    }
  }
  /* 右侧功能把手优先：避免连接点把普通点击截获。 */
  const nodeControl=hitNodeControl(wpt.x,wpt.y);
  if(nodeControl){
    state.selected=nodeControl.item.id;state.multiSel=[];
    if(nodeControl.kind==="detail"){
      if(nodeControl.hit==="toggle"){
        toggleDetailInPlace(nodeControl.item);
      }
      return; /* 展开内容的阅读区不触发拖动 */
    }
    if(nodeControl.kind==="jump"){
      /* G6: 二次确认 — 先弹窗显示目标画布名，再点击确认跳转 */
      showJumpConfirm(nodeControl.item);
      return;
    }
    toggleCollapse(nodeControl.item);
    return;
  }
  /* 连接点检测：鼠标在 mindNode 右侧连接点附近 → 拖出连线建立父子关系 */
  const linkHit=hitMindLinkPoint(wpt.x,wpt.y);
  if(linkHit){
    /* I5-fix: 连线快照改到成功建立时入栈（pointerup），拖空落下的失败尝试不再产生撤销记录 */
    drag={mode:"mindLink",from:linkHit,to:{x:wpt.x,y:wpt.y},pointer:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  const hit=hitTest(wpt.x,wpt.y);
  if(hit){
    if(hit.type==="link"||hit.type==="mindLink"){state.selected=hit.id;state.multiSel=[];render();renderDock(true);return;}
    /* 预览态附件：仅点击标题栏右上角"收起"圆钮 => 形变退回卡片（其余区域不收起） */
    if(hit.type==="fileCard"&&hit.previewOpen){
      const cb=previewCollapseBounds(hit);
      if(cb&&wpt.x>=cb.x&&wpt.x<=cb.x+cb.w&&wpt.y>=cb.y&&wpt.y<=cb.y+cb.h){
        togglePreviewMorph(hit);
        return;
      }
    }
    /* 框选模式：首次点元素只加入选择；只有再次从已选元素拖动，才整体移动。
       这样框选时不会因为“点一下”就意外带着所有元素位移。 */
    if(state.tool==="marquee"){
      const idx=state.multiSel.indexOf(hit.id);
      if(e.ctrlKey||e.metaKey){
        if(idx>=0)state.multiSel.splice(idx,1);
        if(state.selected===hit.id)state.selected=state.multiSel[state.multiSel.length-1]||null;
        render();renderDock(true);saveStateDebounced();return;
      }
      if(idx<0){
        state.multiSel.push(hit.id);
        state.selected=hit.id;
        render();renderDock(true);saveStateDebounced();
        return;
      }
      state.selected=hit.id;
      beginMoveDrag(hit,wpt,e.pointerId,false);
      render();renderDock(true);return;
    }
    /* Ctrl/Cmd+点击：多选并自动连接（第一个=父项，后续点击即自动连线） */
    if(e.ctrlKey||e.metaKey){
      const idx=state.multiSel.indexOf(hit.id);
      if(idx>=0){
        /* 再次点击已选项 = 取消选择，并断开它与父项的连接 */
        const parentId=state.multiSel[0];
        if(idx>0&&parentId){
          const exist=state.links.find(l=>(l.aId===parentId&&l.bId===hit.id)||(l.aId===hit.id&&l.bId===parentId));
          if(exist){pushHistory("断开连接");state.links=state.links.filter(l=>l!==exist);toast("已断开连接");}
        }
        state.multiSel.splice(idx,1);
        render();saveStateDebounced();return;
      }
      state.multiSel.push(hit.id);state.selected=hit.id;
      /* 第二个及之后：自动与首个元素建立连接 */
      if(state.multiSel.length>=2){
        const parentId=state.multiSel[0];
        const exist=state.links.find(l=>(l.aId===parentId&&l.bId===hit.id)||(l.aId===hit.id&&l.bId===parentId));
        if(!exist){
          pushHistory("自动连接");
          state.links.push({id:"lnk"+(uid++),aId:parentId,bId:hit.id,annotation:"",relationType:"related",directional:false});
          toast("已连接（Ctrl+点击可继续添加）");
        }
      }
      render();saveStateDebounced();return;
    }
    /* 非 Ctrl：单选，清空多选 */
    if(state.multiSel.length){state.multiSel=[];}
    /* 连接待选态：点击任意元素即与待选元素完成连接（不再出现无效提示） */
    if(linkPendingId!==null){
      tryFinishPending(hit.id);
      return;
    }
    if(state.selected!==hit.id){state.selected=hit.id;render();}
    /* 所有元素统一用 move：拖动 = 纯移动，不再自动改父级（消除误触） */
    beginMoveDrag(hit,wpt,e.pointerId,false);
    return;
  }
  /* —— 空白处 —— */
  /* 连接待选态：点击空白取消待选 */
  if(linkPendingId!==null){linkPendingId=null;render();}
  if(state.tool==="connector"){
    pushHistory();
    const a=anchorFor(wpt.x,wpt.y);
    const b=a.free?{x:wpt.x+1,y:wpt.y+1,free:true}:{...a};
    drag={mode:"connector",a,b,pointer:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    render();
    return;
  }
  /* M 工具下空白单击不再自动建节点（改由双击触发），统一走默认平移 */
  if(state.tempTool==="pen"){
    pushHistory();
    const s=addStroke(wpt.x,wpt.y);
    drag={mode:"pen",item:s,points:s.points,last:wpt,pointer:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if(state.tempTool==="note"){
    pushHistory();
    const n=addNote(wpt.x,wpt.y,undefined,state.noteColor);
    state.selected=n.id;
    /* 记录所有选中元素的起始位置（多选拖动） */
    const startPosMap={};
    const startPtsMap={};
    const ids=state.multiSel.length>1?state.multiSel:[n.id];
    for(const mid of ids){
      const mi=idMap.get(mid);
      if(mi){startPosMap[mid]={x:mi.x,y:mi.y};if(mi.type==="stroke")startPtsMap[mid]=mi.points.map(p=>({x:p.x,y:p.y}));}
    }
    drag={mode:"move",item:n,start:wpt,startX:n.x,startY:n.y,startPosMap,startPtsMap,pointer:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    /* C9: auto-exit note mode — note created, exit immediately */
    state.tempTool="";renderToolOptions();
    render();
    return;
  }
  if(state.tool==="marquee"){
    drag={mode:"marquee",start:wpt,current:wpt,pointer:e.pointerId};
    canvas.setPointerCapture(e.pointerId);
    render();
    return;
  }
  /* 默认：空白拖拽 = 平移画布 */
  state.selected=null;state.multiSel=[];
  helpPop.style.display="none";
  /* I5-fix: closeDetail 未定义且 detailEditId 恒为 null 的死守卫已删（点空白关闭编辑由 closeEditor 承担） */
  hideCtxMenu();
  drag={mode:"pan",lastX:sx,lastY:sy,pointer:e.pointerId};
  board.classList.add("panning");
  canvas.setPointerCapture(e.pointerId);
  render();
}
function onPointerMove(e){
  const bxy=boardXY(e.clientX,e.clientY);
  const sx=bxy.x,sy=bxy.y;
  const wpt=s2w(sx,sy);
  state.mouseWorld=wpt;
  if(!drag) return;
  if(drag.mode==="pan"){
    state.camera.x-=(sx-drag.lastX)/state.camera.zoom;
    state.camera.y-=(sy-drag.lastY)/state.camera.zoom;
    drag.lastX=sx;drag.lastY=sy;
    requestRender();
    return;
  }
  if(drag.mode==="marquee"){
    drag.current=wpt;
    requestRender();
    return;
  }
  if(drag.mode==="move"){
    const dx=wpt.x-drag.start.x,dy=wpt.y-drag.start.y;
    drag.movedDist=(drag.movedDist||0)+Math.abs(dx)+Math.abs(dy);
    if(drag.movedDist>3)flushDeferredHistory();
    const it=drag.item;
    /* 多选拖动：所有选中元素一起移动 */
    const moveIds=(state.multiSel.length>1?state.multiSel:[it.id]);
    /* 收集需要联动的所有元素（选中元素+其后代节点） */
    const allMoveIds=new Set(moveIds);
    for(const mid of moveIds){
      const mi=idMap.get(mid);
      if(mi&&mi.type==="mindNode"){
        /* 递归收集所有后代节点 */
        const collectKids=(node)=>{
          if(!node.children)return;
          for(const cid of node.children){
            allMoveIds.add(cid);
            const child=idMap.get(cid);
            if(child)collectKids(child);
          }
        };
        collectKids(mi);
      }
    }
    for(const mid of allMoveIds){
      const mi=idMap.get(mid);
      if(!mi)continue;
      if(mi.type==="stroke"&&drag.startPtsMap&&drag.startPtsMap[mid]){
        mi.points.forEach((p,i)=>{const sp=drag.startPtsMap[mid][i];if(sp){p.x=sp.x+dx;p.y=sp.y+dy;}});
      }else if(mi.type==="connector"){
        /* connector 拖动端点，跳过 */
      }else{
        const sp=drag.startPosMap&&drag.startPosMap[mid];
        if(sp){mi.x=sp.x+dx;mi.y=sp.y+dy;}
      }
    }
    /* 单元素的旧逻辑保留兼容 */
    if(it.type==="stroke"&&drag.startPts&&!state.multiSel.length){
      it.points.forEach((p,i)=>{if(drag.startPts[i]){p.x=drag.startPts[i].x+dx;p.y=drag.startPts[i].y+dy;}});
    }else if(it.type==="connector"&&drag.startA){
      if(drag.startA.af){it.a.x=drag.startA.ax+dx;it.a.y=drag.startA.ay+dy;}
      if(drag.startA.bf){it.b.x=drag.startA.bx+dx;it.b.y=drag.startA.by+dy;}
    }
    /* 拖动便签/材料时：实时推开周围重叠元素，保持空隙并即时可见 */
    if(drag.item.type==="note"||drag.item.type==="fileCard"){
      localAvoid(drag.item);
    }
    /* （已移除：拖动便签/材料到节点上的关联目标检测） */
    requestRender();return;
  }
  if(drag.mode==="resize"){
    const dx=wpt.x-drag.start.x,dy=wpt.y-drag.start.y;
    if(Math.abs(dx)+Math.abs(dy)>3)flushDeferredHistory();
    const h=drag.handle,it=drag.item;
    if(h.includes("w")){const nw=clamp(drag.startW-dx,60,800);it.x=drag.startX+(drag.startW-nw);it.w=nw;}
    else if(h.includes("e")){it.w=clamp(drag.startW+dx,60,800);}
    if(h.includes("n")){const nh=clamp(drag.startH-dy,40,600);it.y=drag.startY+(drag.startH-nh);it.h=nh;}
    else if(h.includes("s")){it.h=clamp(drag.startH+dy,40,600);}
    requestRender();
    return;
  }
  if(drag.mode==="pen"){
    const last=drag.points[drag.points.length-1];
    if(Math.hypot(wpt.x-last.x,wpt.y-last.y)>0.6/state.camera.zoom){
      drag.points.push(wpt);
      requestRender();
    }
    return;
  }
  if(drag.mode==="connector"){
    drag.b=anchorFor(wpt.x,wpt.y);
    requestRender();
    return;
  }
  if(drag.mode==="mindLink"){
    drag.to={x:wpt.x,y:wpt.y};
    /* 检测是否悬停在目标节点上 */
    drag.target=hitTest(wpt.x,wpt.y);
    if(drag.target===drag.from) drag.target=null;
    requestRender();
    return;
  }
}
function onPointerUp(e){
  if(!drag) return;
  const d=drag;
  drag=null;
  board.classList.remove("panning");
  /* I5-fix: 未发生位移的拖拽（纯点击）放弃延迟快照；连线拖空失败同样不入栈 */
  if(_deferredHistory!==undefined&&(d.mode==="move"||d.mode==="resize"||d.mode==="mindLink"))cancelDeferredHistory();
  /* I5-fix: 画笔/连线完成即入栈+落盘（此前只 render，30s 自动保存窗口内退出会丢最后一笔） */
  if(d.mode==="pen"){ pushHistory("画笔");render();saveStateDebounced(); }
  else if(d.mode==="connector"){
    const a=resolveEnd(d.a),b=resolveEnd(d.b);
    if(Math.hypot(b.x-a.x,b.y-a.y)>4/state.camera.zoom){
      pushHistory("添加连接线");
      addConnector(d.a,d.b);
      render();saveStateDebounced();
    }
  }
  /* 点击（无位移）文件卡片：
       未展开（卡片态）→ 形变展开预览
       已展开（预览态）→ 仅当点击落在顶部带标识的标题栏区域时复原；
       点击内容区仅选中，不触发复原（避免误收起） */
  else if(d.mode==="marquee"){
    const picked=marqueeCandidates(d);
    state.multiSel=picked;
    state.selected=picked[picked.length-1]||null;
    renderDock(true);render();saveStateDebounced();
    toast(picked.length?"已框选 "+picked.length+" 个元素":"未框选到元素");
  }
  else if(d.mode==="move"&&!d.marqueeSelect&&!d.item&&d.movedDist<6&&state.tempTool==="note"){
    /* C9: single-click on blank in note mode = add note + auto-exit */
    var wp=s2w(d.start.x,d.start.y);
    pushHistory("添加便签");var nn=addNote(wp.x,wp.y,undefined,state.noteColor);state.selected=nn.id;render();saveStateDebounced();
    state.tempTool="";renderToolOptions();toast("已添加便签");
  }
  else if(d.mode==="move"&&!d.marqueeSelect&&d.item&&d.item.type==="fileCard"&&d.movedDist<6){
    const fc=d.item;
    if(!fc.previewOpen){
      state.selected=fc.id;state.multiSel=[];render();
    }else{
      /* 预览态：仅标题栏右上角"收起"圆钮（previewCollapseBounds）触发复原；
         标题栏其余区域保留拖动，内容区仅选中 */
      const world=state.mouseWorld||d.start;
      const cb=previewCollapseBounds(fc);
      if(world&&cb&&world.x>=cb.x&&world.x<=cb.x+cb.w&&world.y>=cb.y&&world.y<=cb.y+cb.h){
        togglePreviewMorph(fc);
      }else{
        /* 非收起按钮区域：仅选中，保持预览展开 */
        state.selected=fc.id;state.multiSel=[];
        render();
      }
    }
  }
  /* 拖动松手后：局部避让（被拖元素推开周围重叠元素，不全局重排） */
  else if(d.mode==="move"){
    localAvoid(d.item);
    reflowDraggedBranches(d);
    /* 拖动结束：让相关连线的平滑动画收敛贴近目标（防永久悬浮）。
       覆盖两类：自由连接(linkAnimMap 里以 link.id 为键) +
       导图父子隐式连线(以 "mind:父:子" 为键)。统一按键前缀 + 节点 id 匹配 */
    const movedIds=new Set(state.multiSel.length>1?state.multiSel:[d.item.id]);
    /* 自由连接 */
    for(const l of state.links){
      if(movedIds.has(l.aId)||movedIds.has(l.bId)) snapLinkAnim(l);
    }
    /* 导图隐式连线：键形如 "mind:<父id>:<子id>"，任一端是移动节点即收敛 */
    for(const [key] of linkAnimMap){
      if(key.indexOf("mind:")!==0)continue;
      const parts=key.split(":");
      const pId=Number(parts[1]),cId=Number(parts[2]);
      if(movedIds.has(pId)||movedIds.has(cId)){
        const s=linkAnimMap.get(key);if(s)s.lastT=0;
      }
    }
    render();saveStateDebounced();
  }
  else if(d.mode==="mindLink"){
    if(d.target&&d.target.id!==d.from.id){
      if(d.target.type==="mindNode"){
        /* 拖到节点上 → 建立父子关系 */
        reparentNode(d.from,d.target);
      }else{
        /* 拖到便签/卡片上 → 自由连接 */
        const exist=state.links.find(l=>(l.aId===d.from.id&&l.bId===d.target.id)||(l.aId===d.target.id&&l.bId===d.from.id));
        if(!exist){
          state.links.push({id:"lnk"+(uid++),aId:d.from.id,bId:d.target.id,annotation:"",relationType:"related",directional:false});
          toast("已连接");
        }
      }
    }
    render();saveStateDebounced();
  }
  syncHistoryBtns();
}

/* ============================================================
   文件系统：导入 / 资源库 / .board 链接
============================================================ */
function getBlob(fileId){
  return new Promise((res,rej)=>{
    const f=state.files.find(x=>x.id===fileId);
    if(!f){rej(new Error("no file"));return;}
    if(f.blob){res(f.blob);return;}
    if(!idb){res(null);return;}  /* G6: IDB 不可用时返回 null 而非抛异常 */
    try{
      const tx=idb.transaction("files","readonly");
      const rq=tx.objectStore("files").get(fileId);
      rq.onsuccess=()=>res(rq.result||null);
      rq.onerror=()=>res(null);  /* G6: 出错也返回 null，不 reject */
    }catch(e){res(null);}
  });
}
function makeBlobURL(f){
  getBlob(f.id).then(b=>{
    if(!b){toast("文件不存在");return;}
    if(f._url) URL.revokeObjectURL(f._url);
    f._url=URL.createObjectURL(b);
    /* 若有预览窗口则刷新其内容 */
    const pvs=state.previews.filter(p=>p.fileId===f.id);
    if(pvs.length) syncPvDom();
  }).catch(()=>toast("读取文件失败"));
}
async function importFiles(fileList,folderId){
  const destinationProject=curProject();if(!destinationProject)return;
  /* FileList 是 input 的 live collection。必须在任何 await 前复制，
     否则调用方清空 input 后，文件夹导入会只剩第一项。 */
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  let added=0;
  for(const file of files){
    const kind=kindOf(file.name);
    /* 从 webkitRelativePath 提取路径信息 */
    let relPath=file.webkitRelativePath||"";
    let actualFolderId=folderId;
    if(relPath&&relPath.includes("/")){
      /* 文件夹上传：自动创建/复用文件夹结构 */
      const parts=relPath.split("/");
      parts.pop(); /* 去掉文件名 */
      let curFolderId=folderId||null;
      for(const p of parts){
        let folder=destinationProject.folders.find(f=>f.name===p&&f.parentId===curFolderId);
        if(!folder){
          folder={id:"fld"+(uid++),name:p,parentId:curFolderId,collapsed:false};
          destinationProject.folders.push(folder);
        }
        curFolderId=folder.id;
      }
      actualFolderId=curFolderId;
    }
    const f={id:"f"+(uid++),name:file.name,kind,size:file.size,mime:file.type,created:Date.now(),thumb:null,tw:1,th:1,folderId:actualFolderId||null,localPath:file.path||null,blob:file};
    destinationProject.files.push(f);
    /* 存 blob — 内存已有备份，IDB 不可用时降级仅会话内可用 */
    if(kind!=="link"){try{await persistBlob(f);}catch(err){toast("附件尚未保存："+f.name+"，请点击保存状态重试");}}
    /* 图片生成缩略图 */
    if(kind==="img"){
      try{
        const blob=f.blob;
        const bmp=await createThumbnail(blob);
        const max=300;
        const sc=Math.min(1,max/Math.max(bmp.width,bmp.height));
        f.tw=Math.max(1,Math.round(bmp.width*sc));
        f.th=Math.max(1,Math.round(bmp.height*sc));
        f.thumb=bmp;
      }catch(err){console.warn("thumb fail",err);}
    }
    added++;
  }
  renderFileGroups();
  render();saveStateDebounced();
  toast("已导入 "+added+" 个文件"+(failedWrites.size?"；部分附件尚未保存，请重试保存":""));
}
function removeFile(id){
  /* C2 修复：删除文件时撤销其缓存的 Object URL，避免内存泄漏。 */
  const removed=state.files.find(f=>f.id===id);
  if(removed&&removed._url){try{URL.revokeObjectURL(removed._url);}catch(e){}removed._url=null;}
  if(removed&&removed.thumb&&typeof removed.thumb.close==="function"){try{removed.thumb.close();}catch(e){}removed.thumb=null;} /* H2 任务8: 回收缩略图 ImageBitmap */
  state.files=state.files.filter(f=>f.id!==id);
  /* 资源库在项目级：所有画布中的材料卡片及其关系都必须同时清理。 */
  const project=curProject();
  if(project){
    for(const canvas of project.canvases){
      const removedIds=new Set((canvas.items||[]).filter(it=>it.type==="fileCard"&&it.fileId===id).map(it=>it.id));
      canvas.items=(canvas.items||[]).filter(it=>!removedIds.has(it.id));
      canvas.links=(canvas.links||[]).filter(link=>!removedIds.has(link.aId)&&!removedIds.has(link.bId));
      for(const node of canvas.items){if(node.type==="mindNode")node.attachIds=(node.attachIds||[]).filter(a=>!removedIds.has(a));}
    }
  }
  cleanupProjectReferences();
  removePreviewsOf(id);
  clearPreviewCache(id); /* H2 任务8: 回收该文件预览位图缓存 */
  try{
    const tx=idb.transaction("files","readwrite");
    if(!state.projects.some(p=>p.files.some(f=>f.id===id)))tx.objectStore("files").delete(id);
  }catch(e){}
  renderFileGroups();render();saveStateDebounced();
  toast("已删除文件");
}
/* 新建文件夹 */
function createFolder(name,parentId=null){
  const f={id:"fld"+(uid++),name:name||"新文件夹",parentId:parentId||null,collapsed:false};
  state.folders.push(f);
  renderFileGroups();saveStateDebounced();
  return f;
}
function folderPathName(folder){
  const names=[folder.name];let parent=folder.parentId&&state.folders.find(f=>f.id===folder.parentId),guard=0;
  while(parent&&guard++<20){names.unshift(parent.name);parent=parent.parentId&&state.folders.find(f=>f.id===parent.parentId);}
  return names.join(" / ");
}
function folderContains(folderId,possibleChildId){
  let cur=state.folders.find(f=>f.id===possibleChildId),guard=0;
  while(cur&&guard++<30){if(cur.parentId===folderId)return true;cur=state.folders.find(f=>f.id===cur.parentId);}
  return false;
}
function moveLibraryFile(fileId,folderId){
  const file=state.files.find(f=>f.id===fileId);if(!file)return;
  file.folderId=folderId||null;renderFileGroups();saveStateDebounced();
  toast("已移动到"+(folderId?"「"+folderPathName(state.folders.find(f=>f.id===folderId))+"」":"「未分类」"));
}
/* I5-fix: showMoveFile 零调用方（由 app.js showMoveFileMenu 取代），已删除 */
/* 删除文件夹（文件移到根级） */
function removeFolder(id){
  const removed=new Set([id]);
  let changed=true;
  while(changed){
    changed=false;
    for(const folder of state.folders){
      if(removed.has(folder.parentId)&&!removed.has(folder.id)){removed.add(folder.id);changed=true;}
    }
  }
  for(const f of state.files){if(removed.has(f.folderId))f.folderId=null;}
  state.folders=state.folders.filter(f=>!removed.has(f.id));
  renderFileGroups();saveStateDebounced();
}
function renderSidePanel(){
  const projectList=document.getElementById("project-list");
  const canvasList=document.getElementById("canvas-list");
  projectList.innerHTML="";
  canvasList.innerHTML="";
  /* 项目列表 */
  for(const p of state.projects){
    const el=document.createElement("div");
    el.className="proj-item"+(p.id===state.activeProjectId?" active":"");
    el.innerHTML='<span class="pi-name"></span><span class="pi-del" title="删除项目">✕</span>';
    el.querySelector(".pi-name").textContent=p.name;
    el.addEventListener("click",()=>switchProject(p.id));
    el.addEventListener("contextmenu",e=>{
      e.preventDefault();e.stopPropagation();
      showFloatMenu(el,[
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',label:"重命名",onClick:()=>startInlineRename(el,".pi-name",p.name,function(name){renameProject(p.id,name);})},
        {sep:true},
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',label:"删除项目",danger:true,onClick:()=>showModal("删除项目","确定删除「"+p.name+"」吗？画布和内容将一并删除。",[{label:"取消"},{label:"删除",primary:true,onClick:()=>deleteProject(p.id)}])}
      ]);
    });
    el.querySelector(".pi-del").addEventListener("click",e=>{
      e.stopPropagation();
      showModal("删除项目",`<p style="font-size:var(--text-base);color:var(--ink-dim);line-height:1.7;margin:0">删除项目「${escapeHtml(p.name)}」及其所有画布和材料？<br>此操作不可撤销。</p>`,[
        {label:"取消"},{label:"删除",primary:true,onClick:()=>deleteProject(p.id)}
      ]);
    });
    /* K5: 项目拖动排序 + 接受画布移入 */
    el.draggable=true;
    el.addEventListener("dragstart",e=>{
      e.dataTransfer.setData("application/x-sidebar-project",p.id);
      e.dataTransfer.effectAllowed="move";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend",()=>el.classList.remove("dragging"));
    el.addEventListener("dragover",e=>{
      if(e.dataTransfer.types.includes("application/x-sidebar-project")||e.dataTransfer.types.includes("application/x-sidebar-canvas")){
        e.preventDefault();e.stopPropagation();
        el.classList.add("drop-target");
      }
    });
    el.addEventListener("dragleave",()=>el.classList.remove("drop-target"));
    el.addEventListener("drop",e=>{
      e.preventDefault();e.stopPropagation();el.classList.remove("drop-target");
      var projId=e.dataTransfer.getData("application/x-sidebar-project");
      var canvasId=e.dataTransfer.getData("application/x-sidebar-canvas");
      if(projId&&projId!==p.id){
        var rect=el.getBoundingClientRect();
        var before=e.clientY<rect.top+rect.height/2;
        reorderProjects(projId,p.id,before);
      }else if(canvasId){
        moveCanvasToProject(canvasId,p.id);
      }
    });
    projectList.appendChild(el);
  }
  /* 画布列表 */
  const cp=curProject();if(!cp)return;
  for(const c of cp.canvases){
    const el=document.createElement("div");
    el.className="canvas-item"+(c.id===state.activeCanvasId?" active":"");
    el.innerHTML='<svg class="ci-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg><span class="ci-name"></span><span class="ci-del" title="删除画布">✕</span>';
    el.querySelector(".ci-name").textContent=c.name;
    el.addEventListener("click",()=>switchCanvas(c.id));
    el.addEventListener("dblclick",e=>{
      e.stopPropagation();
      startInlineRename(el,".ci-name",c.name,name=>{if(name)renameCanvas(c.id,name);});
    });
    el.addEventListener("contextmenu",e=>{
      e.preventDefault();e.stopPropagation();
      showFloatMenu(el,[
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',label:"重命名",onClick:()=>startInlineRename(el,".ci-name",c.name,function(name){renameCanvas(c.id,name);})},
        {sep:true},
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',label:"删除画布",danger:true,onClick:()=>showModal("删除画布","确定删除「"+c.name+"」吗？",[{label:"取消"},{label:"删除",primary:true,onClick:()=>deleteCanvas(c.id)}])}
      ]);
    });
    el.querySelector(".ci-del").addEventListener("click",e=>{
      e.stopPropagation();
      showModal("删除画布",`<p style="font-size:var(--text-base);color:var(--ink-dim);line-height:1.7;margin:0">删除画布「${escapeHtml(c.name)}」？</p>`,[
        {label:"取消"},{label:"删除",primary:true,onClick:()=>deleteCanvas(c.id)}
      ]);
    });
    /* K5: 画布拖动排序 */
    el.draggable=true;
    el.addEventListener("dragstart",e=>{
      e.dataTransfer.setData("application/x-sidebar-canvas",c.id);
      e.dataTransfer.effectAllowed="move";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend",()=>el.classList.remove("dragging"));
    el.addEventListener("dragover",e=>{
      if(e.dataTransfer.types.includes("application/x-sidebar-canvas")){
        e.preventDefault();e.stopPropagation();
        el.classList.add("drop-target");
      }
    });
    el.addEventListener("dragleave",()=>el.classList.remove("drop-target"));
    el.addEventListener("drop",e=>{
      e.preventDefault();e.stopPropagation();el.classList.remove("drop-target");
      var canvasId=e.dataTransfer.getData("application/x-sidebar-canvas");
      if(canvasId&&canvasId!==c.id){
        var rect=el.getBoundingClientRect();
        var before=e.clientY<rect.top+rect.height/2;
        reorderCanvases(canvasId,c.id,before);
      }
    });
    canvasList.appendChild(el);
  }
  /* 更新区标题数量徽章 */
  const pc=document.getElementById("proj-count");if(pc)pc.textContent=state.projects.length;
  const cc=document.getElementById("canvas-count");if(cc)cc.textContent=cp?cp.canvases.length:0;
  const fc=document.getElementById("file-count");if(fc)fc.textContent=state.files.length;
  renderFileGroups();
}
function renderFileGroups(){
  /* 先渲染文件夹列表，再渲染根级文件 */
  fileGroups.innerHTML="";
  if(!state.files.length&&!state.folders.length){
    fileGroups.innerHTML='<div id="lib-empty"><div class="big">📁</div>尚未导入任何材料<br>点击右上角「+」导入文件或文件夹<br>或直接拖入文件</div>';
    return;
  }
  /* 顶部操作栏 */
  const actionBar=document.createElement("div");
  actionBar.style.cssText="display:flex;gap:6px;padding:4px 2px 8px;border-radius:10px";
  const newFolderBtn=document.createElement("button");
  newFolderBtn.className="tbtn";newFolderBtn.style.cssText="flex:1;font-size:11px;height:28px;border:1px solid var(--card-border);background:var(--surface);color:var(--ink-dim)";
  newFolderBtn.innerHTML=ICON.folder+"新建文件夹";
  newFolderBtn.addEventListener("click",()=>{showPrompt("新建文件夹","文件夹名称","新文件夹",name=>{if(name)createFolder(name);});});
  actionBar.appendChild(newFolderBtn);
  actionBar.addEventListener("dragover",e=>{if(e.dataTransfer.types.includes("application/x-board-file")||e.dataTransfer.types.includes("application/x-board-folder")){e.preventDefault();actionBar.classList.add("drop-target");}});
  actionBar.addEventListener("dragleave",()=>actionBar.classList.remove("drop-target"));
  actionBar.addEventListener("drop",e=>{
    e.preventDefault();actionBar.classList.remove("drop-target");
    const fileId=e.dataTransfer.getData("application/x-board-file"),folderId=e.dataTransfer.getData("application/x-board-folder");
    if(fileId)moveLibraryFile(fileId,null);
    else if(folderId){const folder=state.folders.find(f=>f.id===folderId);if(folder){folder.parentId=null;renderFileGroups();saveStateDebounced();toast("文件夹已移到根级");}}
  });
  fileGroups.appendChild(actionBar);
  /* 渲染文件夹 */
  const topFolders=state.folders.filter(f=>!f.parentId);
  for(const folder of topFolders){
    const fwrap=renderFolderItem(folder);
    fileGroups.appendChild(fwrap);
  }
  /* 渲染根级文件（无 folderId 的） */
  const rootFiles=state.files.filter(f=>!f.folderId);
  if(rootFiles.length){
    const wrap=document.createElement("div");wrap.className="fgroup";
    const rootCollapsed=!!state._rootFilesCollapsed;
    const head=document.createElement("button");head.className="fgroup-head"+(rootCollapsed?"":" open");
    head.innerHTML='<span class="chev">›</span><span>未分类</span><span class="cnt">'+rootFiles.length+'</span>';
    wrap.appendChild(head);
    const list=document.createElement("div");list.className="fgroup-list"+(rootCollapsed?" collapsed":"");
    head.addEventListener("click",()=>{state._rootFilesCollapsed=!state._rootFilesCollapsed;head.classList.toggle("open",!state._rootFilesCollapsed);list.classList.toggle("collapsed",state._rootFilesCollapsed);saveStateDebounced();});
    for(const f of rootFiles){ list.appendChild(renderFileItem(f)); }
    wrap.appendChild(list);
    fileGroups.appendChild(wrap);
  }
}
function renderFolderItem(folder){
  const wrap=document.createElement("div");wrap.className="fgroup";
  const head=document.createElement("button");head.className="fgroup-head"+(folder.collapsed?"":" open");head.draggable=true;
  /* 计算文件夹下文件数（含子文件夹） */
  let cnt=countFilesInFolder(folder.id);
  head.innerHTML='<span class="chev">›</span><span>'+ICON.folder.replace(/width="14"/,'width="12"').replace(/height="14"/,'height="12"')+' '+escapeHtml(folder.name)+'</span><span class="cnt">'+cnt+'</span>';
  const list=document.createElement("div");list.className="fgroup-list"+(folder.collapsed?" collapsed":"");
  head.addEventListener("click",()=>{folder.collapsed=!folder.collapsed;head.classList.toggle("open",!folder.collapsed);list.classList.toggle("collapsed",folder.collapsed);saveStateDebounced();});
  head.addEventListener("dragstart",e=>{e.dataTransfer.setData("application/x-board-folder",folder.id);e.dataTransfer.effectAllowed="move";});
  head.addEventListener("dragover",e=>{
    if(e.dataTransfer.types.includes("application/x-board-file")||e.dataTransfer.types.includes("application/x-board-folder")){e.preventDefault();e.stopPropagation();head.classList.add("drop-target");}
  });
  head.addEventListener("dragleave",()=>head.classList.remove("drop-target"));
  head.addEventListener("drop",e=>{
    e.preventDefault();e.stopPropagation();head.classList.remove("drop-target");
    const fileId=e.dataTransfer.getData("application/x-board-file"),movedFolderId=e.dataTransfer.getData("application/x-board-folder");
    if(fileId){moveLibraryFile(fileId,folder.id);return;}
    if(movedFolderId&&movedFolderId!==folder.id&&!folderContains(movedFolderId,folder.id)){
      const moved=state.folders.find(f=>f.id===movedFolderId);if(moved){moved.parentId=folder.id;folder.collapsed=false;renderFileGroups();saveStateDebounced();toast("文件夹已移动");}
    }
  });
  /* 右键提供整理操作 */
  head.addEventListener("contextmenu",e=>{
    e.preventDefault();e.stopPropagation();
    showFloatMenu(head,[
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',label:"新建子文件夹",onClick:()=>showPrompt("新建子文件夹","文件夹名称","新文件夹",function(name){if(name)createFolder(name,folder.id);})},
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',label:"重命名",onClick:()=>startInlineRename(head,".fgroup-head span:nth-child(2)",folder.name,function(name){folder.name=name;renderFileGroups();saveStateDebounced();})},
      {sep:true},
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',label:"删除文件夹",danger:true,onClick:()=>removeFolder(folder.id)}
    ]);
  });
  wrap.appendChild(head);
  /* 子文件夹 */
  const subFolders=state.folders.filter(f=>f.parentId===folder.id);
  for(const sf of subFolders){ list.appendChild(renderFolderItem(sf)); }
  /* 文件 */
  const files=state.files.filter(f=>f.folderId===folder.id);
  for(const f of files){ list.appendChild(renderFileItem(f)); }
  wrap.appendChild(list);
  return wrap;
}
function countFilesInFolder(folderId){
  let cnt=state.files.filter(f=>f.folderId===folderId).length;
  for(const sf of state.folders.filter(f=>f.parentId===folderId)){
    cnt+=countFilesInFolder(sf.id);
  }
  return cnt;
}
function renderFileItem(f){
  const item=document.createElement("div");
  item.className="fitem";
  item.draggable=true;
  item.innerHTML=(FILE_ICONS[f.kind]||FILE_ICONS.other)+'<span class="fname"></span><span class="fdel" title="删除"></span>';
  item.querySelector(".fname").textContent=f.name;
  item.querySelector(".fdel").innerHTML=ICON.trash;
  item.querySelector(".fdel").addEventListener("click",ev=>{ev.stopPropagation();removeFile(f.id);});
  item.addEventListener("click",()=>{f.kind==="link"?window.open(f.url,"_blank"):openPreview(f.id);});
  item.addEventListener("dragstart",ev=>{
    ev.dataTransfer.setData("application/x-board-file",f.id);
    ev.dataTransfer.effectAllowed="copyMove";
    item.classList.add("dragging");
  });
  item.addEventListener("contextmenu",ev=>{
      ev.preventDefault();ev.stopPropagation();
      showFloatMenu(item,[
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',label:f.kind==="link"?"打开链接":"预览",onClick:()=>{f.kind==="link"?window.open(f.url,"_blank"):openPreview(f.id);}},
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',label:"重命名",onClick:()=>startInlineRename(item,".fname",f.name,function(name){renameFile(f.id,name);})},
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',label:"移动到…",onClick:()=>showMoveFileMenu(f.id,item)},
        {sep:true},
        {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',label:"删除",danger:true,onClick:()=>removeFile(f.id)}
      ]);
    });
  /* F8: 双击文件名触发原地重命名 */
  item.addEventListener("dblclick",ev=>{
    ev.preventDefault();ev.stopPropagation();
    startInlineRename(item,".fname",f.name,function(name){renameFile(f.id,name);});
  });
  item.addEventListener("dragend",()=>item.classList.remove("dragging"));
  return item;
}
/* 拖拽文件放到画布 */
board.addEventListener("dragover",e=>{e.preventDefault();dropOverlay.style.display="flex";});
board.addEventListener("dragleave",e=>{dropOverlay.style.display="none";});
board.addEventListener("drop",e=>{
  e.preventDefault();
  dropOverlay.style.display="none";
  const fid=e.dataTransfer.getData("application/x-board-file");
  const bxy=boardXY(e.clientX,e.clientY);
  const wpt=s2w(bxy.x,bxy.y);
  if(fid&&state.files.find(x=>x.id===fid)){
    pushHistory();
    const fc=addFileCard(wpt.x,wpt.y,fid);
    state.selected=fc.id;
    render();saveStateDebounced();
    return;
  }
  /* 系统文件拖入 */
  if(e.dataTransfer.files&&e.dataTransfer.files.length){
    importFiles(e.dataTransfer.files);
  }
});
/* 添加链接 */
/* promptAddLink 已被 showLinkPrompt 替代，删除 */

/* 导出/导入项目 */

/* C11: Reset tutorial to initial state (from code seed) */
function resetTutorial(){
  const idx=state.projects.findIndex(p=>p.isBuiltin);
  if(idx>=0)state.projects.splice(idx,1);
  ensureTutorProject();
  saveStateDebounced();
  renderSidePanel();
  render();
  toast("织见学堂已重置为初始状态");
}
/* C11: Export all user projects (excluding builtin) */
/* I5-fix: 附件以 base64 一并写入备份，并配套 importUserData 恢复入口——
   此前只导元数据且全代码无读取 type:"userData" 的路径，"完整备份"名不副实 */
async function exportUserData(){
  const userProjects=state.projects.filter(p=>!p.isBuiltin);
  if(!userProjects.length){toast("没有用户项目可导出");return;}
  toast("正在打包附件，请稍候…");
  const attachments=[];
  const seen=new Set();
  for(const p of userProjects){
    for(const f of (p.files||[])){
      if(seen.has(f.id))continue;seen.add(f.id);
      try{
        const b=await readStoredBlob(f);
        if(!b){
          if(f.url)attachments.push({id:f.id,name:f.name,kind:f.kind,mime:f.mime||"",url:f.url});
          if(!f.url){toast("备份中止：附件无法读取 — "+f.name);return;}
          continue;
        }
        const buf=new Uint8Array(await b.arrayBuffer());
        let bin="";const CH=0x8000;
        for(let i=0;i<buf.length;i+=CH){bin+=String.fromCharCode.apply(null,buf.subarray(i,i+CH));}
        attachments.push({id:f.id,name:f.name,kind:f.kind,mime:f.mime||"",url:f.url||null,b64:btoa(bin)});
      }catch(e){toast("备份中止："+f.name+" — "+e.message);return;}
    }
  }
  const data={
    v:5,app:"织见",type:"userData",
    projects:userProjects.map(p=>({
      id:p.id,name:p.name,
      files:(p.files||[]).map(f=>({id:f.id,name:f.name,kind:f.kind,size:f.size,mime:f.mime,url:f.url||null,created:f.created,folderId:f.folderId||null})),
      folders:(p.folders||[]).map(f=>({id:f.id,name:f.name,parentId:f.parentId||null})),
      canvases:(p.canvases||[]).map(c=>({id:c.id,name:c.name,items:c.items||[],camera:c.camera,links:c.links||[],previews:c.previews||[]})),
    })),
    attachments:attachments,
    exportedAt:new Date().toISOString(),
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download="织见-用户数据-"+new Date().toISOString().slice(0,10)+".json";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),3000);
  toast("已导出 "+userProjects.length+" 个用户项目（含 "+attachments.length+" 个材料）");
}
/* I5-fix: 备份恢复入口——读取 type:"userData" 的备份文件，重建项目并把附件写回 IndexedDB */
async function importUserData(file){return k6ImportBackup(file);}

function exportProject(){
  const c=curCanvas();if(!c){toast("无画布");return;}
  const p=curProject();
  const data={
    v:3,
    app:"织见",
    canvasName:c.name,
    items:c.items,
    camera:c.camera,
    links:c.links||[],
    previews:c.previews||[],
    files:p.files.map(f=>({id:f.id,name:f.name,kind:f.kind,size:f.size,mime:f.mime,url:f.url||null,created:f.created,folderId:f.folderId||null})),
    folders:p.folders.map(f=>({id:f.id,name:f.name,parentId:f.parentId||null})),
    exportedAt:new Date().toISOString(),
    assetNote:"画布 JSON 包含材料索引；本地文件内容保留在原浏览器的材料库中。",
  };
  const blob=new Blob([JSON.stringify(data)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=(c.name||"canvas")+".board.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  toast("画布已导出");
}
function importProject(file){
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data.items||!Array.isArray(data.files)) throw new Error("bad");
      const incomingItems=data.items.map(it=>({...it}));
      const existingFiles=new Map(state.files.map(f=>[f.id,f]));
      const fileIdMap=new Map();
      for(const imported of data.files){
        const existing=existingFiles.get(imported.id);
        if(existing&&existing.name===imported.name&&existing.size===imported.size){fileIdMap.set(imported.id,existing.id);continue;}
        const id=existing?"imp-"+(uid++):imported.id;
        fileIdMap.set(imported.id,id);
        existingFiles.set(id,{...imported,id,thumb:null,tw:1,th:1,url:imported.url||null});
      }
      for(const it of incomingItems){if(it.type==="fileCard"&&fileIdMap.has(it.fileId))it.fileId=fileIdMap.get(it.fileId);}
      /* I5-fix: 导入会整体替换当前画布——先弹确认，确认后先入撤销栈再替换；
         此前直接覆盖且不入撤销栈，误导入无法恢复 */
      showModal("导入画布",
        '<div style="font-size:13px;line-height:1.7;color:var(--ink)">导入将<b>替换当前画布的全部内容</b>（节点、连线、预览与视角）。<br><span style="color:var(--ink-dim);font-size:12px">替换前的内容可通过撤销（Ctrl+Z）找回。</span></div>',
        [
          {label:"取消",onClick:function(){}},
          {label:"导入并替换",primary:true,onClick:async function(){
            try{
              pushHistory("导入画布");
              state.items=incomingItems;
              state.links=(data.links||[]).map(l=>({...l,relationType:l.relationType||"related",directional:!!l.directional}));
              state.previews=(data.previews||[]).map(p=>({...p,fileId:fileIdMap.get(p.fileId)||p.fileId}));
              state.files=[...existingFiles.values()];
              const foldersById=new Map(state.folders.map(f=>[f.id,f]));
              for(const folder of data.folders||[]){if(!foldersById.has(folder.id))foldersById.set(folder.id,{...folder});}
              state.folders=[...foldersById.values()];
              state.camera=data.camera||state.camera;
              cleanupReferences();syncUid();
              /* 尝试重建缩略图（若有 idb 里的 blob） */
              for(const f of state.files){
                if(f.kind==="img"){
                  try{const b=await getBlob(f.id);const bmp=await createThumbnail(b);const max=300;const sc=Math.min(1,max/Math.max(bmp.width,bmp.height));f.thumb=bmp;f.tw=bmp.width*sc;f.th=bmp.height*sc;}catch(e){}
                }
              }
              render();renderFileGroups();saveStateDebounced();
              toast("画布已导入；缺失的本地材料可在资源库重新导入");
            }catch(err){toast("导入失败：文件格式不正确");}
          }}
        ]);
    }catch(err){toast("导入失败：文件格式不正确");}
  };
  reader.readAsText(file);
}


/* C13: OPML & Markdown import parsers */
function importOPML(file){
  var reader=new FileReader();
  reader.onload=function(){
    try{
      var doc=new DOMParser().parseFromString(reader.result,"text/xml");
      var parseError=doc.querySelector("parsererror");
      if(parseError)throw new Error("OPML XML 解析失败");
      var outlines=doc.querySelectorAll("opml > body > outline");
      if(!outlines.length)throw new Error("未找到任何 outline 节点");
      pushHistory("导入 OPML");
      var cx=W/2/state.camera.zoom+state.camera.x;
      var cy=H/2/state.camera.zoom+state.camera.y;
      var created=[];
      function parseOutline(el,parentId,depth){
        var text=el.getAttribute("text")||el.getAttribute("title")||"节点";
        var node=addMindNode(text,parentId,null,cx+depth*20,cy+created.length*70);
        created.push(node);
        var children=el.querySelectorAll(":scope > outline");
        children.forEach(function(ch){parseOutline(ch,node.id,depth+1);});
        return node;
      }
      outlines.forEach(function(root){parseOutline(root,null,0);});
      if(typeof relayoutCanvas==="function")relayoutCanvas();
      render();saveStateDebounced();
      toast("OPML 导入完成："+created.length+" 个节点");
    }catch(e){
      toast("OPML 导入失败："+e.message);
    }
  };
  reader.readAsText(file);
}
function importMarkdown(file){
  var reader=new FileReader();
  reader.onload=function(){
    try{
      var text=reader.result;
      if(!text||!text.trim())throw new Error("文件为空");
      var lines=text.split(/\r?\n/);
      var nodes=[];
      var stack=[];
      pushHistory("导入 Markdown");
      var cx=W/2/state.camera.zoom+state.camera.x;
      var cy=H/2/state.camera.zoom+state.camera.y;
      for(var i=0;i<lines.length;i++){
        var line=lines[i];
        var m=line.match(/^(#{1,6})\s+(.+)/);
        if(m){
          var level=m[1].length;
          var text2=m[2].trim();
          while(stack.length>0&&stack[stack.length-1].level>=level)stack.pop();
          var parentId2=stack.length>0?stack[stack.length-1].id:null;
          var node2=addMindNode(text2,parentId2,null,cx+(level-1)*20,cy+nodes.length*70);
          stack.push({level:level,id:node2.id});
          nodes.push(node2);
          continue;
        }
        var m2=line.match(/^(\s*)[-*+]\s+(.+)/);
        if(m2){
          var indent=Math.floor(m2[1].length/2);
          while(stack.length>0&&stack[stack.length-1].level>=indent+1)stack.pop();
          var parentId3=stack.length>0?stack[stack.length-1].id:null;
          var node3=addMindNode(m2[2].trim(),parentId3,null,cx+indent*20,cy+nodes.length*70);
          stack.push({level:indent+1,id:node3.id});
          nodes.push(node3);
          continue;
        }
        var m3=line.match(/^(\s*)(\d+)\.\s+(.+)/);
        if(m3){
          var indent2=Math.floor(m3[1].length/2);
          while(stack.length>0&&stack[stack.length-1].level>=indent2+1)stack.pop();
          var parentId4=stack.length>0?stack[stack.length-1].id:null;
          var node4=addMindNode(m3[3].trim(),parentId4,null,cx+indent2*20,cy+nodes.length*70);
          stack.push({level:indent2+1,id:node4.id});
          nodes.push(node4);
        }
      }
      if(!nodes.length)throw new Error("未识别到有效的大纲内容");
      if(typeof relayoutCanvas==="function")relayoutCanvas();
      render();saveStateDebounced();
      toast("Markdown 导入完成："+nodes.length+" 个节点");
    }catch(e){
      toast("Markdown 导入失败："+e.message);
    }
  };
  reader.readAsText(file);
}
