"use strict";
/* ---------------- 通用工具 ---------------- */
function layoutRoot(){
  return state.items.find(it=>it.type==="mindNode"&&!it.parentId);
}
function kidsOf(n){
  if(!n||n.collapsed)return [];
  return (n.children||[]).map(id=>state.items.find(it=>it.id===id)).filter(Boolean);
}
/* 自动排版以“内容占区”而非裸节点计算：批注是信息的一部分，必须预留位置。 */
function annotationLayoutReserve(it){
  if(!it||!it.annotation)return 0;
  const m=annotationMetrics(it.annotation);
  return m.h+14/state.camera.zoom;
}
function layoutNodeHeight(n){const b=itemBounds(n);return b?b.h+annotationLayoutReserve(n):0;}
function layoutCollisionBounds(it){
  const b=itemBounds(it);if(!b||!it.annotation)return b;
  const a=annotationRectFor(it,b,it.annotationSide||"bottom");
  return union(b,a);
}
function subTreeH(n,GAP_Y){
  const b=itemBounds(n),ks=kidsOf(n);
  const own=layoutNodeHeight(n);
  if(!ks.length)return own;
  return Math.max(own,ks.reduce((s,k)=>s+subTreeH(k,GAP_Y),0)+GAP_Y*(ks.length-1));
}
/* ---------------- 1. 逻辑图（向右） ---------------- */
function logicRightLayout(){
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{};
  const GAP_X=(S.gapX?S.gapX(1):64)+(S.linkLane||0), GAP_Y=S.gapY||14;
  const rb=itemBounds(root);root.x=-rb.w/2;root.y=-rb.h/2;
  function place(node,x,cursor){
    const b=itemBounds(node),ks=kidsOf(node);
    const total=subTreeH(node,GAP_Y);
    node.x=x;node.y=cursor+(total-layoutNodeHeight(node))/2;
    if(!ks.length)return;
    let cy=cursor;
    for(const k of ks){
      const kh=subTreeH(k,GAP_Y);
      place(k,x+b.w+GAP_X,cy);
      cy+=kh+GAP_Y;
    }
  }
  let cy=-subTreeH(root,GAP_Y)/2;
  for(const k of kidsOf(root)){
    const kh=subTreeH(k,GAP_Y);
    place(k,-rb.w/2+rb.w+GAP_X,cy);
    cy+=kh+GAP_Y;
  }
}
/* ---------------- 1b. 逻辑图（向左）：与向右镜像对称 ----------------
   子节点在父节点左侧（x 递减），连线由 resolveAnchors 自动取 父左→子右。 */
function logicLeftLayout(){
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{};
  const GAP_X=(S.gapX?S.gapX(1):64)+(S.linkLane||0), GAP_Y=S.gapY||14;
  const rb=itemBounds(root);root.x=-rb.w/2;root.y=-rb.h/2;
  function place(node,xRight,cursor){
    /* xRight = 该节点右边界，节点向左展开 */
    const b=itemBounds(node),ks=kidsOf(node);
    const total=subTreeH(node,GAP_Y);
    node.x=xRight-b.w;node.y=cursor+(total-layoutNodeHeight(node))/2;
    if(!ks.length)return;
    let cy=cursor;
    for(const k of ks){
      const kh=subTreeH(k,GAP_Y);
      place(k,node.x-GAP_X,cy);
      cy+=kh+GAP_Y;
    }
  }
  let cy=-subTreeH(root,GAP_Y)/2;
  const rRight=root.x+rb.w;
  for(const k of kidsOf(root)){
    const kh=subTreeH(k,GAP_Y);
    place(k,rRight-rb.w-GAP_X,cy);
    cy+=kh+GAP_Y;
  }
}
/* ---------------- 逻辑图：方向由用户拖拽后的方位决定，不再用“向左/向右”拆菜单 ---------------- */
function logicTemplateLayout(){
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{},gapY=S.gapY||42;
  const rb=itemBounds(root);root.x=-rb.w/2;root.y=-rb.h/2;
  const rootCenter=root.x+rb.w/2;
  const sides={left:[],right:[]};
  for(const k of kidsOf(root)){
    const kb=itemBounds(k),center=kb.x+kb.w/2;
    const dir=k.branchDirection||((center<rootCenter-8)?"left":"right");
    sides[dir==="left"?"left":"right"].push(k);
  }
  const place=(node,dir,cursor)=>{
    const b=itemBounds(node),total=subTreeH(node,gapY);
    const parent=node.parentId&&state.items.find(x=>x.id===node.parentId),pb=parent&&itemBounds(parent);
    const branchGap=(S.gapX?S.gapX(nodeDepth(node)+1):96)+(S.linkLane||20);
    node.x=dir==="left"?pb.x-branchGap-b.w:pb.x+pb.w+branchGap;
    node.y=cursor+(total-layoutNodeHeight(node))/2;
    node.branchDirection=dir;
    let cy=cursor;
    for(const child of kidsOf(node)){
      const span=subTreeH(child,gapY);
      place(child,dir,cy);cy+=span+gapY;
    }
  };
  for(const dir of ["left","right"]){
    const list=sides[dir];if(!list.length)continue;
    const total=list.reduce((sum,k)=>sum+subTreeH(k,gapY),0)+gapY*(list.length-1);
    let cursor=-total/2;
    for(const k of list){const span=subTreeH(k,gapY);place(k,dir,cursor);cursor+=span+gapY;}
  }
}
/* ---------------- 1c. U 型布局：根在左上，子树向下再向右环绕 ----------------
   形状像字母 U：根节点位于左上角，一级节点沿左侧向下排列，
   每个一级节点的子树向右展开 —— 适合"纵向分类 + 横向细节"的场景。
   连线由 resolveAnchors 的 u 分支按实际向量判断（父下→子上 / 父右→子左）。 */
function uShapeLayout(){
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{};
  const GAP_Y=S.gapY+18||44, GAP_X=(S.gapX?S.gapX(1):64)+(S.linkLane||0);
  const rb=itemBounds(root);
  root.x=-rb.w/2;root.y=-rb.h/2;
  const l1=kidsOf(root);
  if(!l1.length)return;
  /* 一级节点：沿根下方纵向排列（U 的左竖） */
  let cy=root.y+rb.h+annotationLayoutReserve(root)+GAP_Y;
  for(const k of l1){
    const kb=itemBounds(k);
    k.x=root.x;k.y=cy;
    /* 二级及以下：向右横向展开（U 的底与右竖） */
    const kids=kidsOf(k);
    let cx=kb.x+kb.w+GAP_X;
    let rowY=cy;
    for(const g of kids){
      const gb=itemBounds(g);
      g.x=cx;g.y=rowY;
      rowY+=gb.h+12;
      /* 三级继续向右 */
      const gg=kidsOf(g);
      let gx=cx+gb.w+GAP_X*0.6;
      let gy2=rowY-(gb.h+12);
      for(const h of gg){
        const hb=itemBounds(h);
        h.x=gx;h.y=gy2;
        gy2+=hb.h+10;
      }
    }
    cy=Math.max(rowY,cy+layoutNodeHeight(k)+GAP_Y);
  }
}
/* ---------------- 2. 组织结构图（向下） ---------------- */
function orgDownLayout(){
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{};
  const GAP_Y=(S.gapY||14)+42, GAP_X=(S.gapX?S.gapX(1):26)+(S.linkLane||0);
  const rb=itemBounds(root);root.x=-rb.w/2;root.y=-rb.h/2;
  function subTreeW(n){
    const b=itemBounds(n),ks=kidsOf(n);
    if(!ks.length)return b.w;
    return Math.max(b.w,ks.reduce((s,k)=>s+subTreeW(k),0)+GAP_X*(ks.length-1));
  }
  function place(node,cx,y){
    const b=itemBounds(node),ks=kidsOf(node);
    node.x=cx-b.w/2;node.y=y;
    if(!ks.length)return;
    const totalW=ks.reduce((s,k)=>s+subTreeW(k),0)+GAP_X*(ks.length-1);
    let x=cx-totalW/2;
    for(const k of ks){
      const kw=subTreeW(k);
      place(k,x+kw/2,y+b.h+annotationLayoutReserve(node)+GAP_Y);
      x+=kw+GAP_X;
    }
  }
  place(root,0,-rb.h/2);
}
/* ---------------- 3. 鱼骨图（因果分析） ---------------- */
/* I5-fix: 三级及更深节点沿同方向继续竖排——原先只排两层，深层节点滞留原位与新布局重叠 */
function placeDeepChain(n,dir){
  const nb=itemBounds(n);
  let cursor=dir<0?nb.y:nb.y+nb.h+12;
  kidsOf(n).forEach((g)=>{
    const gb=itemBounds(g);
    g.x=nb.x-24;
    if(dir<0){cursor-=gb.h;g.y=cursor;cursor-=12;}
    else{g.y=cursor;cursor+=gb.h+12;}
    placeDeepChain(g,dir);
  });
}
function fishboneLayout(){
  const root=layoutRoot();if(!root)return;
  const ks=kidsOf(root);
  const rb=itemBounds(root);
  const SPINE_LEN=560;
  root.x=SPINE_LEN;root.y=-rb.h/2;
  if(!ks.length)return;
  let upIdx=0,downIdx=0;
  ks.forEach((k,i)=>{
    const up=i%2===0;
    const slot=up?upIdx++:downIdx++;
    const b=itemBounds(k);
    const x=SPINE_LEN-120-slot*176-b.w;
    const y=up?-(100+slot*60)-b.h:(100+slot*60);
    k.x=x;k.y=y;
    kidsOf(k).forEach((g,j)=>{
      const gb=itemBounds(g);
      g.x=x-20-j*26;
      g.y=up?y-(j+1)*(gb.h+14):y+b.h+12+j*(gb.h+14);
      placeDeepChain(g,up?-1:1);
    });
  });
}
/* ---------------- 4. 时间轴（横向） ---------------- */
function timelineLayout(){
  const root=layoutRoot();if(!root)return;
  const ks=kidsOf(root);
  const rb=itemBounds(root);
  root.x=-rb.w/2;root.y=-rb.h/2;
  const GAP=190,AXIS_Y=150;
  if(!ks.length)return;
  const totalW=ks.length*GAP;
  let x=-totalW/2+GAP/2;
  for(const k of ks){
    const b=itemBounds(k);
    k.x=x-b.w/2;k.y=AXIS_Y;
    let gy=AXIS_Y+b.h+annotationLayoutReserve(k)+42;
    for(const g of kidsOf(k)){
      const gb=itemBounds(g);
      g.x=x-gb.w/2;g.y=gy;gy+=layoutNodeHeight(g)+18;
      placeDeepChain(g,1);
    }
    x+=GAP;
  }
}
/* ---------------- 5. 括号图（向右，大括号连接） ---------------- */
function braceLayout(){
  logicRightLayout();
}
/* ============================================================
   布局切换方法论（避免"切换即混乱"）
   ------------------------------------------------------------
   【为什么以前会乱】
   1. 切换布局只重排 mindNode，便签/附件完全不参与 → 它们停在旧坐标，
      与新排布的节点大量重叠。
   2. 随后 avoidOverlap() 做全局推挤，把刚排好的树又推歪，
      且推挤顺序不确定，导致每次切换结果都不一样。
   3. 同级子节点沿用 children 数组的插入顺序（谁先建谁在上），
      视觉上毫无规律，看起来"乱"。

   【现在的方法论】分为四步，顺序不可颠倒：
   ① 归一（normalizeTree）  —— 清理悬空/环状引用，保证树结构合法
   ② 分级（classifyLevels）  —— 按 parentId 链计算出一/二/三级元素
   ③ 排序（sortSiblings）    —— 同级按名称稳定排序，让顺序可预期
   ④ 排布（各 layout 函数）  —— 只按层级坐标排布节点
   ⑤ 归位附属（placeAttachments）—— 分析便签/附件离哪个节点最近，
      放到该节点右侧（或下方）留 GAP 的位置，而不是让它们原地不动
   注意：布局后不再调用全局 avoidOverlap，避免把排布成果推歪；
        仅对"附属元素"做局部微调，保证不与节点重叠。
============================================================ */
/* ① 归一：清理悬空引用与环，保证树结构合法 */
function normalizeTree(){
  const ids=new Set(state.items.map(i=>i.id));
  for(const it of state.items){
    if(it.type!=="mindNode")continue;
    if(it.parentId&&!ids.has(it.parentId))it.parentId=null;
    it.children=(it.children||[]).filter(c=>ids.has(c));
    /* 环检测：若祖先链回到自己，则提升为根级 */
    let p=it.parentId,guard=0;
    while(p&&guard++<500){
      if(p===it.id){it.parentId=null;break;}
      const pp=state.items.find(x=>x.id===p);
      p=pp?pp.parentId:null;
    }
  }
}
/* ② 分级：返回 {1:[一级],2:[二级],3:[三级+]} */
function classifyLevels(){
  const root=state.items.find(it=>it.type==="mindNode"&&!it.parentId);
  if(!root)return{1:[],2:[],3:[],root:null};
  const L1=(root.children||[]).map(id=>state.items.find(i=>i.id===id)).filter(Boolean);
  const L2=[],L3=[];
  for(const n of L1){
    for(const cid of (n.children||[])){
      const c=state.items.find(i=>i.id===cid);if(!c)continue;
      L2.push(c);
      for(const gid of (c.children||[])){
        const g=state.items.find(i=>i.id===gid);if(g)L3.push(g);
      }
    }
  }
  return {1:L1,2:L2,3:L3,root};
}
/* ③ 排序：保留用户 / AI 给出的结构顺序。
   标题排序会把“问题→证据→结论”等叙事顺序打散，也是 AI 画布看起来杂乱的
   主要原因之一；只有明确给出 layoutOrder 时才按该值排序。 */
function sortSiblings(){
  for(const n of state.items){
    if(n.type!=="mindNode"||!n.children||n.children.length<2)continue;
    const kids=n.children.map(id=>state.items.find(i=>i.id===id)).filter(Boolean);
    const original=new Map(kids.map((item,index)=>[item.id,index]));
    kids.sort((a,b)=>{
      const ao=Number.isFinite(a.layoutOrder)?a.layoutOrder:null;
      const bo=Number.isFinite(b.layoutOrder)?b.layoutOrder:null;
      if(ao!==null&&bo!==null&&ao!==bo)return ao-bo;
      if(ao!==null&&bo===null)return-1;
      if(ao===null&&bo!==null)return 1;
      return original.get(a.id)-original.get(b.id);
    });
    n.children=kids.map(k=>k.id);
  }
}
/* ⑤ 归位附属：优先使用显式 attachIds；仅在没有关联信息时才用最近节点兜底。 */
function placeAttachments(opts){
  const o=opts||{};
  const GAP=o.gap||34;
  const nodes=state.items.filter(i=>i.type==="mindNode");
  const attach=state.items.filter(i=>i.type==="note"||i.type==="fileCard");
  if(!nodes.length||!attach.length)return;
  const below=o.below||"right";   /* right=放节点右侧；down=放节点下方（组织图用） */
  const ownerByItem=new Map();
  for(const n of nodes)for(const id of n.attachIds||[])ownerByItem.set(id,n);
  /* 每个节点已占用的附属槽位，避免多个便签叠在一起 */
  const slots=new Map();
  const ordered=attach.slice().sort((a,b)=>{
    const ao=ownerByItem.get(a.id),bo=ownerByItem.get(b.id);
    if(ao&&bo&&ao.id!==bo.id)return String(ao.id).localeCompare(String(bo.id));
    if(ao&&!bo)return-1;if(!ao&&bo)return 1;
    return String(a.id).localeCompare(String(b.id));
  });
  for(const a of ordered){
    const ab=itemBounds(a);if(!ab)continue;
    let best=ownerByItem.get(a.id)||null;
    if(!best){
      let bestD=Infinity;
      const acx=ab.x+ab.w/2,acy=ab.y+ab.h/2;
      for(const n of nodes){
        const nb=itemBounds(n);if(!nb)continue;
        const d=Math.hypot(nb.x+nb.w/2-acx,nb.y+nb.h/2-acy);
        if(d<bestD){bestD=d;best=n;}
      }
    }
    if(!best)continue;
    if(a.annotation)a.annotationSide="bottom";
    const nb=itemBounds(best);
    const idx=(slots.get(best.id)||0);
    slots.set(best.id,idx+1);
    if(below==="down"){
      a.x=nb.x+idx*(ab.w+GAP);
      a.y=nb.y+nb.h+GAP;
    }else{
      a.x=nb.x+nb.w+GAP;
      a.y=nb.y+idx*(ab.h+GAP);
    }
  }
  /* 最后：附属元素之间做一次轻量避让，防止互相叠压 */
  for(let pass=0;pass<3;pass++){
    let moved=false;
    for(let i=0;i<attach.length;i++){
      for(let j=i+1;j<attach.length;j++){
        const A=layoutCollisionBounds(attach[i]),B=layoutCollisionBounds(attach[j]);
        if(!A||!B)continue;
        const ox=Math.min(A.x+A.w,B.x+B.w)-Math.max(A.x,B.x);
        const oy=Math.min(A.y+A.h,B.y+B.h)-Math.max(A.y,B.y);
        if(ox>2&&oy>2){attach[j].y=A.y+A.h+GAP;moved=true;}
      }
    }
    if(!moved)break;
  }
}
/* 布局分发（radial 大爆炸 / both 双列 已按需求删除） */
/* ============================================================
   统一排版美学规范（LAYOUT_SPEC）
   —— 全部间距设下限阈值：节点增多时只放大、不压缩。
   层级间距随深度递增（深层需要更多呼吸），同级间距随密度线性放大。
   ============================================================ */
const LAYOUT_SPEC={
  /* 层级水平间距（父→子）：按深度取档，深层次级稀疏时用更宽间距 */
  gapXByDepth:[136,150,166,184,204], /* d0→d1, d1→d2, d2→d3, d3→d4, d4+ */
  /* 同级垂直间距：保证文字、批注和附件都有呼吸空间，再随密度继续扩大。 */
  gapYBase:46,
  gapYPerDense:8,                    /* 每 6 个并列节点追加 8px */
  gapYMax:104,
  linkLane:28,                       /* 父子主线与关系线各自保留可读通道 */
  /* 节点最小尺寸（世界单位） */
  minNodeW:120, minNodeH:36,
  /* 安全边距与画布留白（世界单位） */
  safetyMargin:120,                  /* 画布四周留白，防止贴边 */
  /* 末端疏散：深处并列节点数>阈值时，对末端子树额外放大 */
  denseThreshold:6,                  /* 并列 ≥6 视为密集 */
  denseExtra:10,                     /* 密集时同级间距额外 +10 */
  denseLevelFrom:3,                  /* 从第 3 级起参与疏散 */
  /* 批注/附属元素包围盒 */
  annGap:6, annBubbleH:16,           /* 批注文字高度估计 */
};
/* 计算当前树的深度档位间距：按并列密度动态放大 GAP_Y */
function layoutSpec(){
  const spec={...LAYOUT_SPEC};
  /* 密度扫描：统计各级最大并列数（n 的并列数在循环外统计一次，避免被兄弟覆盖） */
  const D={1:0,2:0,3:0,4:0};
  const root=layoutRoot();
  const walk=(n,d)=>{
    if(!n)return;
    const dIdx=Math.max(1,Math.min(4,d));
    D[dIdx]=Math.max(D[dIdx]||0,(n.children||[]).length);
    for(const k of kidsOf(n)){
      walk(k,d+1);
    }
  };
  if(root)walk(root,1);
  /* 密集层：取"深层并列最大数"（含第2层起的密集，3/4级自然覆盖） */
  const maxDense=Math.max(D[2]||0,D[3]||0,D[4]||0);
  spec.gapY=spec.gapYBase+Math.min(spec.gapYMax-spec.gapYBase, Math.floor(maxDense/spec.gapYPerDense)*spec.gapYPerDense);
  if(maxDense>=spec.denseThreshold)spec.gapY+=spec.denseExtra;
  spec.gapY=Math.min(spec.gapYMax,spec.gapY);
  /* 深度档的水平间距 */
  spec.gapX=(d)=>{const i=Math.max(0,Math.min(4,d-1));return spec.gapXByDepth[i];};
  return spec;
}
/* 空间方向决策：严格遵守用户当前选定的布局类型，不做动态换向。
   I6-fix: 原实现有 ~25 行密度/视口分析（动态返回 "both"/"down"），但函数入口对
   logic/org/fishbone/timeline 立即 return、对其它类型也立即 return，分析段永远不可达——
   已删除。legacy 存档里的 "both"/"down" 仍由 applyAutoLayout 的模板映射处理。 */
function decideLayoutDirection(spec){
  const t=state.layoutType||"logic";
  return{dir:t,reason:"使用当前布局"};
}
/* 平移整棵子树（含后代节点与附属），保持相对位置；用于双向分叉时把一级子树搬到根两侧 */
function translateSubtree(node,dx,dy){
  if(!node)return;
  const stack=[node];const seen=new Set();
  while(stack.length){
    const n=stack.pop();if(seen.has(n.id))continue;seen.add(n.id);
    if(n.x!==undefined){n.x+=dx;n.y+=dy;}
    for(const cid of (n.children||[])){
      const c=state.items.find(i=>i.id===cid);
      if(c&&c.type==="mindNode")stack.push(c);
    }
  }
  for(const a of state.items){
    if(a.type!=="note"&&a.type!=="fileCard")continue;
    if(a._attachTo===node.id){a.x+=dx;a.y+=dy;continue;}
    const ab=itemBounds(a),nb=itemBounds(node);
    if(ab&&nb){
      const acx=ab.x+ab.w/2,acy=ab.y+ab.h/2;
      if(acx>=nb.x&&acx<=nb.x+nb.w&&acy>=nb.y&&acy<=nb.y+nb.h){
        a._attachTo=node.id;a.x+=dx;a.y+=dy;
      }
    }
  }
}
function applyAutoLayout(){
  for(const it of state.items){
    if(it.type==="mindNode"&&it.collapsed)it.collapsed=false;
  }
  /* ① 归一 → ② 分级 → ③ 排序 → ④ 排布 → ⑤ 归位附属 */
  normalizeTree();
  sortSiblings();
  for(const it of state.items){if(it.annotation)it.annotationSide="bottom";}
  /* 前置：美学参数 + 密度 + 方向决策 */
  const spec=layoutSpec();
  const dir=decideLayoutDirection(spec);
  state._layoutSpec=spec;state._layoutDir=dir;
  const t=dir.dir;
  /* 模板映射：逻辑图按一级分支的实际左右方位排布。 */
  let eff=t;
  if(t==="both")eff="logic";
  if(t==="down")eff="org";
  if(eff==="org")orgDownLayout();
  else if(eff==="logic")logicTemplateLayout();
  else if(eff==="left")logicLeftLayout();
  else if(eff==="u")uShapeLayout();
  else if(eff==="fishbone")fishboneLayout();
  else if(eff==="timeline")timelineLayout();
  else if(eff==="brace")braceLayout();
  else logicTemplateLayout();
  /* 双向分叉后处理：把一级节点按奇偶分到根左右两侧 */
  if(t==="both"){
    const root=layoutRoot();if(root){
      const kids=kidsOf(root);
      const rb=itemBounds(root);
      const gx=spec.gapX(1)+spec.gapY;
      const rootW=rb.w;
      for(let i=0;i<kids.length;i++){
        const k=kids[i];
        const kb=itemBounds(k);
        const targetX=(i%2===0)? (root.x-gx-rootW-kb.w/2) : (root.x+rootW+gx+kb.w/2);
        const dx=targetX-kb.x;
        translateSubtree(k,dx,0);
      }
    }
  }
  /* ⑤ 附属元素归位（组织图用下方，其余用右侧） */
  placeAttachments({below:(t==="org"||t==="down")?"down":"right"});
  /* ⑥ 最终防重叠：自动树的节点位置已经由子树尺寸计算得到。
     这里只移动便签/材料，不能再把节点逐个推开，否则会破坏父子对齐。 */
  let ov=1,guard=0;
  while(ov>0&&guard<4){
    avoidOverlap({attachmentsOnly:true});
    ov=0;
    const its=state.items.filter(i=>i.type!=="stroke"&&i.type!=="connector");
    for(let i=0;i<its.length;i++)for(let j=i+1;j<its.length;j++){
      const a=layoutCollisionBounds(its[i]),b2=layoutCollisionBounds(its[j]);
      if(!a||!b2)continue;
      const ox=Math.min(a.x+a.w,b2.x+b2.w)-Math.max(a.x,b2.x);
      const oy=Math.min(a.y+a.h,b2.y+b2.h)-Math.max(a.y,b2.y);
      if(ox>4&&oy>4)ov++;
    }
    guard++;
  }
  /* 清空临时态 */
  delete state._layoutSpec;delete state._layoutDir;
}
/* 兼容旧名 */
function radialLayout(){applyAutoLayout();}
function bothSidesLayout(){applyAutoLayout();}

/* （已移除重复的 avoidOverlap 定义，保留后方的唯一实现） */

function avoidOverlap(options){
  const opts=options||{};
  const elems=state.items.filter(it=>(it.type==="mindNode"||it.type==="note"||it.type==="fileCard")&&(!opts.attachmentsOnly||it.type!=="mindNode"));
  /* 只在手动模式下做微调（自动模式由 autoLayout 处理），但便签/卡片始终微调 */
  for(let pass=0;pass<3;pass++){
    let moved=false;
    for(let i=0;i<elems.length;i++){
      for(let j=i+1;j<elems.length;j++){
        const a=elems[i],b=elems[j];
        const ba=layoutCollisionBounds(a),bb=layoutCollisionBounds(b);
        /* 检查重叠 */
        const ox=Math.min(ba.x+ba.w,bb.x+bb.w)-Math.max(ba.x,bb.x);
        const oy=Math.min(ba.y+ba.h,bb.y+bb.h)-Math.max(ba.y,bb.y);
        if(ox>4&&oy>4){
          /* 有重叠，推开 */
          const pushX=(ox/2+8);
          const pushY=(oy/2+8);
          /* 沿较短轴推开 */
          if(ox<oy){ a.x-=pushX; b.x+=pushX; }
          else { a.y-=pushY; b.y+=pushY; }
          moved=true;
        }
      }
    }
    if(!moved) break;
  }
}

/* 拖拽后的局部分支重排：节点的位置是用户的意图，子树的朝向随节点相对父级的方位变化。
   这避免了“二级节点拖到下方，三级仍向右发散”的断裂排版。 */
function branchDirectionFromParent(node){
  const parent=node&&node.parentId&&state.items.find(it=>it.id===node.parentId);
  if(!parent)return null;
  const a=itemBounds(parent),b=itemBounds(node);
  const dx=(b.x+b.w/2)-(a.x+a.w/2),dy=(b.y+b.h/2)-(a.y+a.h/2);
  if(Math.abs(dx)>=Math.abs(dy))return dx>=0?"right":"left";
  return dy>=0?"down":"up";
}
function branchPerpSpan(node,dir,gap){
  const b=itemBounds(node),kids=kidsOf(node);
  const own=(dir==="left"||dir==="right")?layoutNodeHeight(node):b.w;
  if(!kids.length)return own;
  const total=kids.reduce((sum,k)=>sum+branchPerpSpan(k,dir,gap),0)+gap*(kids.length-1);
  return Math.max(own,total);
}
function reflowBranch(node,dir,spec){
  const kids=kidsOf(node);if(!kids.length)return;
  const b=itemBounds(node),horizontal=dir==="left"||dir==="right";
  const gap=horizontal?spec.gapX(nodeDepth(node)+1)+spec.linkLane:spec.gapY+34;
  const perpGap=horizontal?spec.gapY:spec.gapX(nodeDepth(node)+1)*.55;
  const total=kids.reduce((sum,k)=>sum+branchPerpSpan(k,dir,perpGap),0)+perpGap*(kids.length-1);
  let cursor=(horizontal?b.y+b.h/2:b.x+b.w/2)-total/2;
  for(const child of kids){
    const cb=itemBounds(child),span=branchPerpSpan(child,dir,perpGap);
    if(horizontal){
      child.x=dir==="right"?b.x+b.w+gap:b.x-gap-cb.w;
      child.y=cursor+(span-layoutNodeHeight(child))/2;
    }else{
      child.x=cursor+span/2-cb.w/2;
      child.y=dir==="down"?b.y+b.h+annotationLayoutReserve(node)+gap:b.y-gap-cb.h;
    }
    child.branchDirection=dir;
    reflowBranch(child,dir,spec);
    cursor+=span+perpGap;
  }
}
function reflowDraggedBranches(d){
  if(!d||d.movedDist<8)return;
  const selected=new Set(state.multiSel.length>1?state.multiSel:[d.item.id]);
  const roots=[];
  for(const id of selected){
    const node=state.items.find(it=>it.id===id&&it.type==="mindNode");
    if(!node)continue;
    let ancestor=node.parentId,covered=false;
    while(ancestor){if(selected.has(ancestor)){covered=true;break;}const p=state.items.find(it=>it.id===ancestor);ancestor=p&&p.parentId;}
    if(!covered&&node.parentId)roots.push(node);
  }
  if(!roots.length)return;
  const spec=layoutSpec();
  for(const node of roots){
    const dir=branchDirectionFromParent(node);
    if(dir)reflowBranch(node,dir,spec);
  }
}

function openTextEditor(it){
  const isMind=it.type==="mindNode";
  if((isMind?editingMindId:editingNoteId)===it.id) return;
  closeEditor(true);closeMindEditor(true);
  const z=state.camera.zoom,b=itemBounds(it);
  const style=noteTypography(it);
  const tl=w2s(b.x,b.y),br=w2s(b.x+b.w,b.y+b.h);
  noteEd.style.display="block";
  noteEd.style.fontFamily=style.family;
  noteEd.style.fontWeight=style.bold?"700":"500";
  noteEd.style.textDecoration=style.underline?"underline":"none";
  noteEd.value=it.text;
  if(isMind){
    /* 节点：原位编辑（贴合元素，保持"改写节点标题"的直接感） */
    noteEd.classList.remove("float");
    noteEd.style.left=tl.x+"px";noteEd.style.top=tl.y+"px";
    noteEd.style.width=(br.x-tl.x)+"px";noteEd.style.height=(br.y-tl.y)+"px";
    noteEd.style.fontSize=13*z+"px";
    noteEd.style.lineHeight=20*z+"px";
    noteEd.style.background=(it.parentId?"#ffffff":"#2d5fd3");
    noteEd.style.color=it.parentId?"#1d1d1f":"#fff";
    editingMindId=it.id;noteFormatBar.style.display="none";notePreview.style.display="none";
  }else{
    /* 便签：原位覆盖编辑（彻底消除漂移）
       关键修复：此前用 330×200 悬浮卡 + translateY(-6px) 弹入动画，
       编辑内容会"跳"到元素旁边，视觉上就是便签漂移。
       现在改为与思维导图节点一致——textarea 精确覆盖元素本体，
       无动画、无位移，编辑前后屏幕位置完全一致。 */
    editingNoteId=it.id;
    editingNoteDraftStyle={fontFamily:it.fontFamily||state.fontPreset,fontSize:style.size,underline:style.underline,bold:style.bold};
    noteEd.classList.remove("float");
    noteEd.style.left=tl.x+"px";noteEd.style.top=tl.y+"px";
    noteEd.style.width=(br.x-tl.x)+"px";noteEd.style.height=(br.y-tl.y)+"px";
    noteEd.style.fontSize=style.size*z+"px";
    noteEd.style.lineHeight=Math.round(style.size*1.42)*z+"px";
    noteEd.style.background=it.color||state.noteColor;
    noteEd.style.color="#1d1d1f";
    showNoteEditorChrome(it,tl,br);
  }
  activeMdEditor=noteEd;
  noteEd.focus();noteEd.setSelectionRange(noteEd.value.length,noteEd.value.length);
  renderDock(true);   /* 立即切换下 Dock 到编辑态（工具栏与上下文一致） */
}

function localAvoid(dragged){
  if(!dragged)return;
  const GAP=18;
  /* H1 任务6: 预算并缓存所有元素 bounds，避免内层每轮每元素重算 itemBounds
     （mindNode 会触发 measureText，原为 O(n²) 文本测量，拖材料卡卡顿主因之一）。
     位置变化时按需失效重算。cur 查找用 idMap.get（O(1)）替代 state.items.find。 */
  const bcache=new Map();
  const bget=(it)=>{let b=bcache.get(it.id);if(!b){b=itemBounds(it);if(b)bcache.set(it.id,b);}return b;};
  const queue=[dragged.id];
  const visited=new Set();
  for(let iter=0;iter<10;iter++){
    while(queue.length>0){
      const id=queue.shift();
      if(visited.has(id))continue;
      visited.add(id);
      const cur=idMap.get(id);
      if(!cur)continue;
      const db=bget(cur);if(!db)continue;
      for(const other of state.items){
        if(other===cur||other.type==="stroke"||other.type==="connector")continue;
        const ob=bget(other);if(!ob)continue;
        const ox=Math.min(db.x+db.w,ob.x+ob.w)-Math.max(db.x,ob.x);
        const oy=Math.min(db.y+db.h,ob.y+ob.h)-Math.max(db.y,ob.y);
        if(ox>4&&oy>4){
          if(ox<oy){
            const push=ox/2+GAP;
            if(other.x+ob.w/2>db.x+db.w/2) other.x+=push;
            else other.x-=push;
          }else{
            const push=oy/2+GAP;
            if(other.y+ob.h/2>db.y+db.h/2) other.y+=push;
            else other.y-=push;
          }
          /* 位置变了：失效缓存，下次重算（note/fileCard/mindNode 位置变即 bounds 变） */
          bcache.delete(other.id);
          bcache.delete(cur.id);
          /* 被推开的元素加入队列，检查连锁碰撞 */
          if(!visited.has(other.id))queue.push(other.id);
        }
      }
    }
    if(queue.length===0)break;
    visited.clear();
  }
}
function renderSelBar(sel){
  selbar.dataset.id=String(sel.id);
  selbar.innerHTML="";
  const label=document.createElement("span");label.className="stype";label.textContent=SEL_LABEL[sel.type]||"";
  selbar.appendChild(label);
  const palette=sel.type==="note"?NOTE_COLORS:sel.type==="mindNode"?MIND_COLORS:null;
  if(palette){
    for(const col of palette){
      const b=document.createElement("button");
      b.className="swatch"+(col===sel.color?" on":"");
      b.style.background=col;b.title="颜色";
      b.addEventListener("pointerdown",e=>{
        e.stopPropagation();e.preventDefault();
        pushHistory();sel.color=col;
        if(sel.type==="note") state.noteColor=col;
        if(sel.type==="mindNode"&&!sel.parentId) state.mindColor=col;
        renderSelBar(sel);render();saveState();
      });
      selbar.appendChild(b);
    }
    const sep=document.createElement("span");sep.className="ssep";selbar.appendChild(sep);
  }
  if(sel.type==="fileCard"){
    const f=state.files.find(x=>x.id===sel.fileId);
    if(f&&f.kind==="link") selbar.appendChild(sbtn('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',"在新窗口打开",()=>{if(isSafePreviewUrl(f.url))window.open(f.url,"_blank","noopener");}));
    if(f) selbar.appendChild(sbtn(ICON.view,sel.previewOpen?"收起预览":"展开预览",()=>{togglePreviewMorph(sel);}));
    if(f) selbar.appendChild(sbtn(ICON.fullscreen,"全屏预览 (Alt+F)",()=>{const r=getFileCardOriginRect(sel);openFullscreen(f,r?{originRect:r}:{});}));
    if(f) selbar.appendChild(sbtn(ICON.export,"默认打开",()=>{if(typeof openWithExternalApp==="function")openWithExternalApp(f);}));
  }
  if(sel.type==="note"){
    selbar.appendChild(sbtn(ICON.fullscreen,"全屏预览 (Alt+F)",()=>openFullscreenNote(sel)));
  }
  if(sel.type==="mindNode"){
    selbar.appendChild(sbtn(ICON.plus,"添加子节点 (Tab)",()=>addChildMind(sel)));
    selbar.appendChild(sbtn(sel.collapsed?"+":"−","折叠/展开子树",()=>toggleCollapse(sel)));
  }
  /* E5: link selbar — click-to-cycle with graphical icons */
  if(sel.type==="link"||sel.type==="mindLink"){
    var isML=sel.type==="mindLink";
    var linkItem=isML?state.items.find(x=>x.id===sel.bId):null;
    var curLvl=isML?(linkItem&&linkItem._linkLevel||"normal"):(sel.level||"normal");
    var curShp=isML?(linkItem&&linkItem._linkShape||"auto"):(sel.shape||"auto");
    /* Level icon: thin/medium/thick bar */
    var lvlIcons={
      normal:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>',
      emphasis:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>',
      highlight:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>'
    };
    var lvlLbls={normal:"普通",emphasis:"强调",highlight:"醒目"};
    var shpIcons={
      auto:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18 Q12 6 20 18" opacity=".5"/><path d="M4 18 Q12 6 20 18"/></svg>',
      curve:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18 Q12 6 20 18"/></svg>',
      polyline:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18 L10 18 L10 6 L20 6"/></svg>',
      straight:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="18" x2="20" y2="6"/></svg>'
    };
    var shpLbls={auto:"跟随",curve:"曲线",polyline:"折线",straight:"直线"};
    selbar.appendChild(sbtn(lvlIcons[curLvl],lvlLbls[curLvl],()=>{
      var levels=["normal","emphasis","highlight"];
      if(isML){linkItem._linkLevel=levels[(levels.indexOf(linkItem._linkLevel||"normal")+1)%3];}
      else{var l=state.links.find(x=>x.id===sel.id);if(l)l.level=levels[(levels.indexOf(l.level||"normal")+1)%3];}
      pushHistory("change link level");render();saveState();renderSelBar(selectedItem());renderDock(true);
    }));
    selbar.appendChild(sbtn(shpIcons[curShp],shpLbls[curShp],()=>{
      var shapes=["auto","curve","polyline","straight"];
      if(isML){linkItem._linkShape=shapes[(shapes.indexOf(linkItem._linkShape||"auto")+1)%4];}
      else{var l=state.links.find(x=>x.id===sel.id);if(l)l.shape=shapes[(shapes.indexOf(l.shape||"auto")+1)%4];}
      pushHistory("change link shape");render();saveState();renderSelBar(selectedItem());renderDock(true);
    }));
    if(!isML) selbar.appendChild(sbtn(ICON.connector,(RELATION_TYPES[sel.relationType]||{}).label||"关联",()=>setLinkRelation(sel.id)));
  }
  selbar.appendChild(sbtn(ICON.copy,"复制 (Ctrl+D)",()=>duplicateItem(sel.id)));
  selbar.appendChild(sbtn(ICON.trash,"删除 (Delete)",()=>deleteItem(sel.id),true));
}

function sbtn(html,title,fn,danger){
  const b=document.createElement("button");
  b.className="sbtn"+(danger?" danger":"");b.title=title;b.innerHTML=html;
  b.addEventListener("pointerdown",e=>{e.stopPropagation();e.preventDefault();fn();});
  return b;
}

const SEL_LABEL={note:"便签",stroke:"画笔",connector:"连线",link:"关系线",mindLink:"层级连接",mindNode:"导图节点",fileCard:"文件"};
function updateSelBar(){
  if(editingNoteId!==null||editingMindId!==null){selbar.style.display="none";renderDock();return;}
  const sel=selectedItem();
  if(!sel){selbar.style.display="none";renderDock();return;}
  if(selbar.dataset.id!==String(sel.id)) renderSelBar(sel);
  /* E5: links don't have itemBounds — use midpoint of connected items */
  var b;
  if(sel.type==="link"||sel.type==="mindLink"){
    var aItem=state.items.find(x=>x.id===sel.aId);
    var bItem=state.items.find(x=>x.id===sel.bId);
    if(aItem&&bItem){
      var ab2=itemBounds(aItem),bb2=itemBounds(bItem);
      if(ab2&&bb2){
        var sp=w2s((ab2.x+ab2.w/2+bb2.x+bb2.w/2)/2,(ab2.y+bb2.y)/2);
        selbar.style.display="flex";
        selbar.style.left=clamp(sp.x-selbar.offsetWidth/2,10,W-selbar.offsetWidth-10)+"px";
        selbar.style.top=Math.max(58,sp.y-selbar.offsetHeight-14)+"px";
        return;
      }
    }
    selbar.style.display="none";return;
  }
  b=itemBounds(sel);
  if(!b){selbar.style.display="none";return;}
  var sp=w2s(b.x+b.w/2,b.y);
  selbar.style.display="flex";
  selbar.style.left=clamp(sp.x-selbar.offsetWidth/2,10,W-selbar.offsetWidth-10)+"px";
  selbar.style.top=Math.max(58,sp.y-selbar.offsetHeight-14)+"px";
}
function showNoteEditorChrome(it,tl,br){
  for(const [id,preset] of Object.entries(FONT_PRESETS)){
    if(!noteFontSelect.querySelector('option[value="'+id+'"]')){const o=document.createElement("option");o.value=id;o.textContent=preset.label;noteFontSelect.appendChild(o);}
  }
  const style=editingNoteDraftStyle||noteTypography(it);
  noteFontSelect.value=style.fontFamily||state.fontPreset;
  noteFontSize.textContent=style.fontSize;
  document.getElementById("noteUnderline").classList.toggle("on",!!style.underline);
  document.getElementById("noteBold").classList.toggle("on",!!style.bold);
  noteFormatBar.style.display="flex";
  noteFormatBar.style.left=clamp(tl.x,8,Math.max(8,W-noteFormatBar.offsetWidth-8))+"px";
  noteFormatBar.style.top=Math.max(8,tl.y-noteFormatBar.offsetHeight-8)+"px";
  /* （已移除：编辑便签时的 Markdown 预览浮窗，用途不明且干扰编辑） */
  notePreview.style.display="none";
}
function updateNotePreview(){
  if(editingNoteId===null)return;
  if(editingNoteId===null)return;
  const style=editingNoteDraftStyle||{};
  notePreview.innerHTML=markdownToHtml(noteEd.value);
  notePreview.style.fontFamily=(FONT_PRESETS[style.fontFamily]||FONT_PRESETS[state.fontPreset]).stack;
  notePreview.style.fontSize=(style.fontSize||13)+"px";
  notePreview.style.textDecoration=style.underline?"underline":"none";
  notePreview.style.fontWeight=style.bold?"700":"500";
}
function changeNoteFormat(patch){
  /* I5-fix: 详情编辑复用同一格式栏——原守卫只认 editingNoteId，编辑展开内容时
     字体/字号/加粗/下划线点击全部无效（editingDetailId 态被拦在门外） */
  const editId=editingNoteId!==null?editingNoteId:editingDetailId;
  if(editId===null)return;
  editingNoteDraftStyle={...editingNoteDraftStyle,...patch};
  const it=state.items.find(i=>i.id===editId);if(!it)return;
  const style=editingNoteDraftStyle,z=state.camera.zoom;
  noteEd.style.fontFamily=(FONT_PRESETS[style.fontFamily]||FONT_PRESETS[state.fontPreset]).stack;
  noteEd.style.fontSize=style.fontSize*z+"px";
  noteEd.style.lineHeight=Math.round(style.fontSize*1.42)*z+"px";
  noteEd.style.fontWeight=style.bold?"700":"500";noteEd.style.textDecoration=style.underline?"underline":"none";
  const b=itemBounds(it),tl=w2s(b.x,b.y),br=w2s(b.x+b.w,b.y+b.h);showNoteEditorChrome(it,tl,br);
}
noteEd.addEventListener("input",updateNotePreview);
noteFontSelect.addEventListener("change",()=>changeNoteFormat({fontFamily:noteFontSelect.value}));
document.getElementById("noteFontDown").addEventListener("pointerdown",e=>{e.preventDefault();changeNoteFormat({fontSize:clamp(((editingNoteDraftStyle&&editingNoteDraftStyle.fontSize)||13)-1,10,28)});});
document.getElementById("noteFontUp").addEventListener("pointerdown",e=>{e.preventDefault();changeNoteFormat({fontSize:clamp(((editingNoteDraftStyle&&editingNoteDraftStyle.fontSize)||13)+1,10,28)});});
document.getElementById("noteUnderline").addEventListener("pointerdown",e=>{e.preventDefault();changeNoteFormat({underline:!editingNoteDraftStyle.underline});});
document.getElementById("noteBold").addEventListener("pointerdown",e=>{e.preventDefault();changeNoteFormat({bold:!editingNoteDraftStyle.bold});});
/* 浮动栏 Markdown 行内/块级插入（与下 Dock 编辑态一致） */
const _nb=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();fn();});};
_nb("noteItalic",()=>mdWrap("*","*","斜体"));
_nb("noteStrike",()=>mdWrap("~~","~~","删除线"));
_nb("noteCode",()=>mdWrap("`","`","code"));
_nb("noteH1",()=>mdLinePrefix("# ",true));
_nb("noteUL",()=>mdLinePrefix("- ",true));
_nb("noteTask",()=>mdLinePrefix("- [ ] ",true));
_nb("noteTable",()=>mdInsert(TABLE_TPL));
_nb("noteQuote",()=>mdLinePrefix("> ",true));
_nb("noteLink",()=>mdInsert("[文本](https://)"));
function closeEditor(cancel){
  if(editingDetailId!==null){
    const it=state.items.find(i=>i.id===editingDetailId);
    if(it&&!cancel){
      const v=noteEd.value;
      const draft=editingNoteDraftStyle||{};
      const changed=v!==it.detail||it.fontFamily!==draft.fontFamily||Number(it.fontSize||13)!==Number(draft.fontSize)||!!it.underline!==!!draft.underline||!!it.bold!==!!draft.bold;
      /* I5-fix: 提交时同步排版草稿并立即落盘——原实现只存文本、且完全没调 saveState，
         点空白关闭后只剩 30s 自动保存兜底 */
      if(changed){pushHistory("编辑展开内容");it.detail=v;it.fontFamily=draft.fontFamily;it.fontSize=draft.fontSize;it.underline=!!draft.underline;it.bold=!!draft.bold;}
      saveStateDebounced();
    }
    editingDetailId=null;editingNoteDraftStyle=null;
    noteEd.blur();noteEd.style.display="none";noteFormatBar.style.display="none";
    if(activeMdEditor===noteEd)activeMdEditor=null;renderDock(true);requestRender();return;
  }
  if(editingNoteId===null) return;
  const it=state.items.find(i=>i.id===editingNoteId);
  if(it){
    const v=noteEd.value;
    const draft=editingNoteDraftStyle||{};
    const changed=v!==it.text||it.fontFamily!==draft.fontFamily||Number(it.fontSize||13)!==Number(draft.fontSize)||!!it.underline!==!!draft.underline||!!it.bold!==!!draft.bold;
    if(!cancel&&changed){pushHistory("编辑便签");it.text=v;it.fontFamily=draft.fontFamily;it.fontSize=draft.fontSize;it.underline=!!draft.underline;it.bold=!!draft.bold;}
    saveState();
  }
  editingNoteId=null;
  editingNoteDraftStyle=null;
  noteEd.blur();noteEd.style.display="none";
  noteEd.classList.remove("float");   /* 退出浮动态 */
  if(activeMdEditor===noteEd)activeMdEditor=null;
  noteFormatBar.style.display="none";notePreview.style.display="none";
  renderDock(true);   /* 关闭后下 Dock 回到相应状态 */
  requestRender();
}
function closeMindEditor(cancel){
  if(editingMindId===null) return;
  const it=state.items.find(i=>i.id===editingMindId);
  if(it){
    const v=noteEd.value;
    if(!cancel&&v!==it.text){pushHistory("编辑节点");it.text=v;if(state.mindMode==="auto")autoLayout();}
    saveState();
  }
  editingMindId=null;
  noteEd.blur();noteEd.style.display="none";
  noteFormatBar.style.display="none";notePreview.style.display="none";
  renderDock(true);   /* 关闭后下 Dock 回到相应状态 */
  requestRender();
}
function isTyping(){
  const ae=document.activeElement;
  if(!ae||ae===document.body)return false;
  /* I9-fix: 隐藏元素（display:none 或在 display:none 容器内）的 offsetParent===null。
     弹窗/编辑器关闭后浏览器可能把焦点留在隐藏元素上——忽略它，
     否则所有快捷键被 isTyping() 拦截（自愈现象的第二道防线） */
  if(ae.offsetParent===null)return false;
  const tag=ae.tagName||"";
  if(tag==="TEXTAREA"||tag==="INPUT"||tag==="SELECT")return true;
  return !!(ae.isContentEditable||(ae.closest&&ae.closest(".fv-md-editor")));
}

/* ---------- 右键菜单（内容编辑 / 空白添加） ---------- */
let ctxTarget=null;
/* 右键菜单位于 #board 内，必须先换算为画布容器坐标；直接使用 clientX/Y
   会把顶栏与左侧栏的位移也算进去，造成菜单总在鼠标右下方偏移。 */
function placeCtxMenu(e){
  const rect=board.getBoundingClientRect(),pad=8;
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  ctxMenu.style.left=mx+"px";ctxMenu.style.top=my+"px";
  requestAnimationFrame(()=>{
    const w=ctxMenu.offsetWidth,h=ctxMenu.offsetHeight;
    let nx=mx,ny=my;
    if(nx+w>rect.width-pad)nx=Math.max(pad,mx-w);
    if(ny+h>rect.height-pad)ny=Math.max(pad,my-h);
    nx=Math.min(Math.max(pad,nx),Math.max(pad,rect.width-w-pad));
    ny=Math.min(Math.max(pad,ny),Math.max(pad,rect.height-h-pad));
    ctxMenu.style.left=nx+"px";ctxMenu.style.top=ny+"px";
  });
}
function showCtxMenu(e,item){
  ctxTarget=item;
  ctxMenu.innerHTML="";
  const bxy=boardXY(e.clientX,e.clientY);
  const mw=s2w(bxy.x,bxy.y);
  const sec=document.createElement("div");
  sec.style.cssText="padding:6px 10px 4px;font-size:var(--text-xs);color:#9aa3b2;letter-spacing:.4px;font-weight:700";
  const body=document.createElement("div");
  ctxMenu.appendChild(sec);ctxMenu.appendChild(body);

  if(item&&item.type==="link"){
    const rel=RELATION_TYPES[item.relationType]||RELATION_TYPES.related;
    sec.textContent="关系线 · "+rel.label;
    const semantic=mkItem(ICON.connector,"设置关系语义",null,false);semantic.onclick=()=>{hideCtxMenu();setLinkRelation(item.id);};
    const ann=mkItem("",item.annotation?"编辑批注 (A)":"添加批注 (A)",null,false);ann.onclick=()=>{hideCtxMenu();state.selected=item.id;openAnnotation();};
    const del=mkItem(ICON.trash,"删除连接",null,true);del.onclick=()=>{hideCtxMenu();deleteItem(item.id);};
    body.appendChild(semantic);body.appendChild(ann);
    const sep=document.createElement("div");sep.className="csep";body.appendChild(sep);body.appendChild(del);
    ctxMenu.style.display="block";
    placeCtxMenu(e);
    return;
  }

  if(item){
    const t=item.type;
    const label=t==="mindNode"?(item.text||"节点"):t==="note"?"便签":t==="fileCard"?(state.files.find(f=>f.id===item.fileId)?.name||"材料"):"元素";
    sec.textContent=label;
    /* 第一段：钻探 — 聚焦、展开内容、批注、跃迁 */
    const grp1=document.createElement("div");grp1.className="cgrp-title";grp1.textContent="钻探";body.appendChild(grp1);
    const focus=mkItem(ICON.focus,"聚焦","F",false);focus.onclick=()=>{hideCtxMenu();state.selected=item.id;enterFocus(item.id);};
    const ann=mkItem(ICON.annotate,""+(item.annotation?"编辑批注":"添加批注"),"A",false);ann.onclick=()=>{hideCtxMenu();state.selected=item.id;openAnnotation();};
    body.appendChild(focus);body.appendChild(ann);
    const jmp=mkItem(ICON.jump,""+(item.jumpTo?"跳转/修改跃迁":"设置跃迁"),"J",false);jmp.onclick=()=>{hideCtxMenu();state.selected=item.id;openJump();};
    body.appendChild(jmp);
    if(state.multiSel.length>=1){
      const link=mkItem(ICON.connector,"连接选中","C",false);link.onclick=()=>{hideCtxMenu();toggleLink();};
      body.appendChild(link);
    }
    const s1=document.createElement("div");s1.className="csep";body.appendChild(s1);
    /* 第二段：结构 — 加子/同级/折叠/颜色 */
    const grp2=document.createElement("div");grp2.className="cgrp-title";grp2.textContent="结构";body.appendChild(grp2);
    if(t==="mindNode"){
      const chi=mkItem(ICON.plus,"加子节点","Tab",false);chi.onclick=()=>{hideCtxMenu();addChildMind(item);};
      const sib=mkItem("","加同级","Enter",false);sib.onclick=()=>{hideCtxMenu();addSiblingMind(item);};
      const col=mkItem("",item.collapsed?"展开子树":"折叠子树","",false);col.onclick=()=>{hideCtxMenu();toggleCollapse(item);};
      body.appendChild(chi);body.appendChild(sib);body.appendChild(col);
      /* 颜色选择：内联一行 */
      const colr=document.createElement("div");colr.className="cswatch-row";colr.style.padding="4px 8px 8px";
      MIND_COLORS.forEach(c=>{const s=document.createElement("button");s.className="swatch";s.style.background=c;s.onclick=()=>{pushHistory("改颜色");item.color=c;hideCtxMenu();render();saveState();};colr.appendChild(s);});
      body.appendChild(colr);
    }else if(t==="note"){
      const edit=mkItem("","编辑文字","",false);edit.onclick=()=>{hideCtxMenu();openTextEditor(item);render();};
      body.appendChild(edit);
      const colr=document.createElement("div");colr.className="cswatch-row";colr.style.padding="4px 8px 8px";
      NOTE_COLORS.forEach(c=>{const s=document.createElement("button");s.className="swatch";s.style.background=c;s.onclick=()=>{pushHistory("改颜色");item.color=c;hideCtxMenu();render();saveState();};colr.appendChild(s);});
      body.appendChild(colr);
    }else if(t==="fileCard"){
      const pv=mkItem(ICON.view,item.previewOpen?"收起预览":"展开预览","",false);pv.onclick=()=>{hideCtxMenu();togglePreviewMorph(item);};
      body.appendChild(pv);
    }
    const s3=document.createElement("div");s3.className="csep";body.appendChild(s3);
    /* 第三段：操作 — 复制、删除 */
    const cp=mkItem(ICON.copy,"复制","Ctrl+D",false);cp.onclick=()=>{hideCtxMenu();duplicateItem(item.id);};
    const del=mkItem(ICON.trash,"删除","Del",true);del.onclick=()=>{hideCtxMenu();deleteItem(item.id);};
    body.appendChild(cp);body.appendChild(del);
  }else{
    sec.textContent="添加";
    const addM=mkItem(ICON.mind,"导图节点",null,false);addM.onclick=()=>{hideCtxMenu();pushHistory("添加节点");const n=addMindNode(defaultNodeName(null),null,state.mindColor,mw.x,mw.y);smartPlace(n);state.selected=n.id;render();saveState();};
    const addN=mkItem(ICON.note,"便签 (B)",null,false);addN.onclick=()=>{hideCtxMenu();pushHistory("添加便签");const n=addNote(mw.x,mw.y);smartPlace(n);state.selected=n.id;render();saveState();};
    body.appendChild(addM);body.appendChild(addN);
    const s2=document.createElement("div");s2.className="csep";body.appendChild(s2);
    if(state.files.length){
      const fn=mkItem(ICON.plus,"放入文件…",null,false);
      const items=state.files.slice(-6).reverse();
      const sub=document.createElement("div");
      sub.style.cssText="padding:2px 6px 6px 16px;display:flex;flex-direction:column;gap:2px";
      items.forEach(f=>{
        const fi=document.createElement("div");
        fi.className="citem";fi.style.cssText="font-size:var(--text-sm);padding:5px 8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        fi.innerHTML='<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(f.name)+'</span>';
        fi.addEventListener("click",()=>{hideCtxMenu();pushHistory("添加材料卡片");const fc=addFileCard(mw.x,mw.y,f.id);smartPlace(fc);state.selected=fc.id;render();saveState();});
        sub.appendChild(fi);
      });
      body.appendChild(fn);body.appendChild(sub);
    }
  }
  ctxMenu.style.display="block";
  placeCtxMenu(e);
}
function hideCtxMenu(){ctxMenu.style.display="none";ctxTarget=null;}
function mkItem(icon,label,key,danger){
  const d=document.createElement("div");
  d.className="citem"+(danger?" danger":"");
  d.innerHTML=(icon?'<span class="ci-ic">'+icon+"</span>":"")+'<span class="ci-label">'+label+"</span>"+(key?'<span class="ci-key">'+key+"</span>":"");
  return d;
}

