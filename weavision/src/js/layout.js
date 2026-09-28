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
/* L6: 子树宽度度量。同级横向并排时的占用宽度，供组织图换行、四向布局、
   鱼骨/时间轴槽位分配使用——这三个模板原先用固定步长，不考虑节点实际尺寸，
   遇到不规则的真实树就互相压叠（实测 28 / 26 处重叠）。 */
function layoutNodeWidth(n){const b=itemBounds(n);return b?b.w:0;}
function subTreeW(n,GAP_X){
  const ks=kidsOf(n),own=layoutNodeWidth(n);
  if(!ks.length)return own;
  return Math.max(own,ks.reduce((s,k)=>s+subTreeW(k,GAP_X),0)+GAP_X*(ks.length-1));
}
/* L6: 把一个一级分支挂到根节点的指定侧。四向/双列布局共用。 */
function assignBranchDirection(k,dir){k.branchDirection=dir;}
/* L6: 子树在指定方向上的"横向跨度"——朝左右展开时看高度，朝上下展开时看宽度。
   四向布局用它做贪心均衡，避免四个方向高度悬殊。 */
function subTreeSpan(k,dir,gapY,gapX){
  return (dir==="left"||dir==="right")?subTreeH(k,gapY):subTreeW(k,gapX);
}
/* L6: 子树里"最宽的那个单节点"宽度。鱼骨形/时间轴这类把后代垂直串成一列的模板
   用它分配槽位——若改用 subTreeW（同级并排累加），宽树会横向爆炸
   （实测鱼骨 6791×850、时间轴 8503×464，宽高比 8.0 / 18.3）。 */
function subTreeMaxW(n){
  let m=layoutNodeWidth(n);
  for(const k of kidsOf(n)){const w=subTreeMaxW(k);if(w>m)m=w;}
  return m;
}
/* L6: 把后代串成一条垂直链——每一层的节点都居中对齐在父节点正下方（dir=down）
   或正上方（dir=up），沿 y 单向推进。鱼骨的中骨、时间轴的详情列都用这个形态：
   横向只占最宽的那个节点，不再随层数累加。 */
function placeColumnChain(node,dir,gapY){
  const kids=kidsOf(node);
  if(!kids.length)return;
  const nb=itemBounds(node);
  let y=dir==="up"?nb.y-gapY:nb.y+nb.h+gapY;
  for(const k of kids){
    const kb=itemBounds(k);
    k.x=nb.x+nb.w/2-kb.w/2;
    if(dir==="up"){y-=kb.h;k.y=y;y-=gapY;}
    else{k.y=y;y+=kb.h+gapY;}
    k.branchDirection=dir;
    placeColumnChain(k,dir,gapY);
  }
}
/* L6: reflowBranch 以父节点中心为基准把子树居中展开；U 型/鱼骨/时间轴这类
   "子树从父节点某一侧单向延伸"的模板需要在展开后再把整棵子树（不含父节点自身）
   平移到期望的起始边。dir 指子树相对父节点的方位。 */
function alignSubtreeToEdge(node,dir,gap){
  const desc=[],stack=kidsOf(node).slice();
  while(stack.length){const n=stack.pop();desc.push(n);for(const c of kidsOf(n))stack.push(c);}
  if(!desc.length)return;
  const nb=itemBounds(node);if(!nb)return;
  const bs=desc.map(n=>itemBounds(n)).filter(Boolean);
  if(!bs.length)return;
  if(dir==="down"||dir==="up"){
    if(dir==="down"){
      const top=Math.min(...bs.map(b=>b.y));
      const dy=(nb.y+nb.h+gap)-top;
      for(const n of desc)n.y+=dy;
    }else{
      const bottom=Math.max(...bs.map(b=>b.y+b.h));
      const dy=(nb.y-gap)-bottom;
      for(const n of desc)n.y+=dy;
    }
  }else if(dir==="right"){
    const left=Math.min(...bs.map(b=>b.x));
    const dx=(nb.x+nb.w+gap)-left;
    for(const n of desc)n.x+=dx;
  }else{
    const right=Math.max(...bs.map(b=>b.x+b.w));
    const dx=(nb.x-gap)-right;
    for(const n of desc)n.x+=dx;
  }
}
/* L6: reflowBranch 把子树以父节点为中心上下对称展开。U 型/时间轴这类纵向排列
   一级分支的模板需要子树"只往下长"，否则它会向上越过前一个分支的地盘，
   和兄弟的子树压在一起（实测 U 型 3 处节点互压全部来自这里）。 */
function shiftSubtreeTopTo(node,targetTop){
  const desc=[],stack=kidsOf(node).slice();
  while(stack.length){const n=stack.pop();desc.push(n);for(const c of kidsOf(n))stack.push(c);}
  if(!desc.length)return;
  const bs=desc.map(n=>itemBounds(n)).filter(Boolean);
  if(!bs.length)return;
  const dy=targetTop-Math.min(...bs.map(b=>b.y));
  if(Math.abs(dy)>0.5)for(const n of desc)n.y+=dy;
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
/* L6.1: opts.dir 用于"有确定方向"的模板（如 逐级向右）强制所有一级分支朝同一侧。
   ------------------------------------------------------------
   此前本函数只有一条判定路径：一个一级分支朝左还是朝右，看它【当前】落在根节点
   中心线的哪一侧。这个推断对"用户手工把分支拖到某一边"是正确的，但被固定方向的
   布局模板复用时就会串味：先点"左右分布"，一级分支已被摆到两侧；再点"逐级向右"，
   几何推断仍然读出"左边那几个确实在左边"，于是排出来还是两侧分布——
   用户看到的现象就是"点了逐级向右没反应，还是分布在两侧"。
   现在只有 when opts.dir 缺省（both 模板、手工拖拽后重排）才回落到几何推断。 */
function logicTemplateLayout(opts){
  const force=(opts&&opts.dir)||null;
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{},gapY=S.gapY||42;
  const rb=itemBounds(root);root.x=-rb.w/2;root.y=-rb.h/2;
  const rootCenter=root.x+rb.w/2;
  const sides={left:[],right:[]};
  for(const k of kidsOf(root)){
    const kb=itemBounds(k),center=kb.x+kb.w/2;
    const dir=force||k.branchDirection||((center<rootCenter-8)?"left":"right");
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
/* ---------------- 1d. 左右分布（双翼） ----------------
   与 logicTemplateLayout 的关键差别：后者判断一个一级分支朝左还是朝右，看的是它
   "当前"落在根节点中心线的哪一侧；首次排版后 branchDirection 被固化，从此永远
   单侧展开——这正是"总框架排成一根竖长条"的成因（同一画布实测 1357×2857，
   宽高比 0.47，6 个一级分支全挤在右侧纵向堆叠）。
   本模板在排版前先按子树跨度把一级分支贪心均衡地分到左右两侧，再交给
   logicTemplateLayout 展开，得到接近方形的双翼树（同画布实测 2236×1713，
   宽高比 1.31）。贪心而非奇偶交替，是为了让左右两侧高度接近。 */
function logicBothLayout(){
  const root=layoutRoot();if(!root)return;
  const ks=kidsOf(root);
  if(!ks.length){logicTemplateLayout();return;}
  const S=state._layoutSpec||{};
  const gapY=S.gapY||42;
  let hL=0,hR=0;
  for(const k of ks){
    const span=subTreeH(k,gapY)+gapY;
    if(hL<=hR){k.branchDirection="left";hL+=span;}
    else{k.branchDirection="right";hR+=span;}
  }
  logicTemplateLayout();
}
/* ---------------- 1e. 上下左右（四向辐射） ----------------
   一级分支按子树跨度贪心分到 上/下/左/右 四个方向；每个方向内部沿垂直轴排列，
   子树继续朝"远离根节点"的方向展开。连线锚点由 render-connection 的 U 型分支
   按父子实际向量判断（layoutAxis 对该类型返回 u:true），不预设固定出口边。 */
function fourWayLayout(){
  const root=layoutRoot();if(!root)return;
  const ks=kidsOf(root);
  const rb=itemBounds(root);
  root.x=-rb.w/2;root.y=-rb.h/2;
  if(!ks.length)return;
  const spec=state._layoutSpec||layoutSpec();
  const gapY=spec.gapY,gapX=spec.gapX(1)+spec.linkLane;
  const GAP_MAIN=Math.max(gapX,150),GAP_PERP=Math.max(gapY,54);
  const dirs=["right","down","left","up"];
  const used={right:0,down:0,left:0,up:0};
  const groups={right:[],down:[],left:[],up:[]};
  for(const k of ks){
    let pick=dirs[0];
    for(const d of dirs)if(used[d]<used[pick])pick=d;
    groups[pick].push(k);
    used[pick]+=subTreeSpan(k,pick,gapY,gapX)+GAP_PERP;
  }
  const cx=0,cy=0;   /* root 已归中，其中心即原点 */
  for(const dir of dirs){
    const list=groups[dir];if(!list.length)continue;
    const horizontal=dir==="left"||dir==="right";
    const total=list.reduce((s,k)=>s+subTreeSpan(k,dir,gapY,gapX),0)+GAP_PERP*(list.length-1);
    let cursor=(horizontal?cy:cx)-total/2;
    for(const k of list){
      const kb=itemBounds(k),span=subTreeSpan(k,dir,gapY,gapX);
      if(dir==="right"){k.x=root.x+rb.w+GAP_MAIN;k.y=cursor+(span-layoutNodeHeight(k))/2;}
      else if(dir==="left"){k.x=root.x-GAP_MAIN-kb.w;k.y=cursor+(span-layoutNodeHeight(k))/2;}
      else if(dir==="down"){k.y=root.y+rb.h+annotationLayoutReserve(root)+GAP_MAIN;k.x=cursor+span/2-kb.w/2;}
      else{k.y=root.y-GAP_MAIN-kb.h;k.x=cursor+span/2-kb.w/2;}
      k.branchDirection=dir;
      reflowBranch(k,dir,spec);
      cursor+=span+GAP_PERP;
    }
  }
}
/* ---------------- 1c. U 型布局：根在左上，子树向下再向右环绕 ----------------
   形状像字母 U：根节点位于左上角，一级节点沿左侧向下排列，
   每个一级节点的子树向右展开 —— 适合"纵向分类 + 横向细节"的场景。
   连线由 resolveAnchors 的 u 分支按实际向量判断（父下→子上 / 父右→子左）。

   L6 重写：原实现二级节点统一从 cx 起排、三级节点统一从 gx 起排，
   同一层不同分支的行进游标互相不感知，层内必然压叠（实测 3 处重叠），
   且只写到三级、更深层滞留原位。现改为逐分支调用 reflowBranch 展开整棵子树，
   再用 alignSubtreeToEdge 把子树推到父节点右下方，层次不再有展开深度上限。 */
function uShapeLayout(){
  const root=layoutRoot();if(!root)return;
  const spec=state._layoutSpec||layoutSpec();
  const rb=itemBounds(root);
  root.x=-rb.w/2;root.y=-rb.h/2;
  const l1=kidsOf(root);
  if(!l1.length)return;
  const GAP_Y=Math.max(spec.gapY,44);
  let cy=root.y+rb.h+annotationLayoutReserve(root)+GAP_Y;
  for(const k of l1){
    const kb=itemBounds(k);
    k.x=root.x;k.y=cy;
    k.branchDirection="right";
    reflowBranch(k,"right",spec);
    alignSubtreeToEdge(k,"right",GAP_Y);
    /* 子树只往下长：从 k 的底部开始，不再以 k 为中心上下对称展开 */
    shiftSubtreeTopTo(k,k.y+kb.h+GAP_Y);
    cy+=subTreeH(k,GAP_Y)+GAP_Y;
  }
}
/* ---------------- 2. 组织结构图（向下） ---------------- */
/* L6: 加逐层最大行宽限制。原实现把所有叶子横向平铺，宽树直接撑爆
   （同一画布实测 9391×478，宽高比 19.7，比竖长条更难用）。
   单行超过上限时按贪心装箱折行，把"极宽横条"收敛成多行块状。
   行高按该行最矮的子树高度推进，保证折行后不上下交叠。 */
const ORG_MAX_ROW_W=2400;
function orgDownLayout(opts){
  const o=opts||{};
  const root=layoutRoot();if(!root)return;
  const S=state._layoutSpec||{};
  const GAP_Y=(S.gapY||14)+42, GAP_X=(S.gapX?S.gapX(1):26)+(S.linkLane||0);
  const MAX_W=o.maxRowWidth||ORG_MAX_ROW_W;
  const rb=itemBounds(root);root.x=-rb.w/2;root.y=-rb.h/2;
  const subW=(n)=>subTreeW(n,GAP_X);
  function place(node,cx,y){
    const b=itemBounds(node),ks=kidsOf(node);
    node.x=cx-b.w/2;node.y=y;
    if(!ks.length)return;
    const childY=y+b.h+annotationLayoutReserve(node)+GAP_Y;
    const rows=[];let row=[],rowW=0;
    for(const k of ks){
      const kw=subW(k);
      if(row.length&&rowW+GAP_X+kw>MAX_W){rows.push({items:row,w:rowW});row=[];rowW=0;}
      rowW+=(row.length?GAP_X:0)+kw;
      row.push(k);
    }
    if(row.length)rows.push({items:row,w:rowW});
    let ry=childY;
    for(const r of rows){
      let x=cx-r.w/2;
      for(const k of r.items){
        const kw=subW(k);
        place(k,x+kw/2,ry);
        x+=kw+GAP_X;
      }
      let maxSubH=0;
      for(const k of r.items){const h=subTreeH(k,GAP_Y);if(h>maxSubH)maxSubH=h;}
      ry+=maxSubH+GAP_Y;
    }
  }
  place(root,0,-rb.h/2);
}
/* ---------------- 3. 鱼骨形（主轴横放，分支斜插上下） ----------------
   L6 重写：原实现一级节点沿主轴用固定步长 176、垂直方向固定 60 排位，
   二级节点用 `x-20-j*26` 固定斜排，三级起才交给 placeDeepChain——
   槽位完全不看节点实际宽度与子树规模，遇到不规则的真实树必然压叠
   （同一画布实测 28 处重叠）。现改为按每棵一级子树的实测包围盒分配主轴槽位，
   子树展开复用 reflowBranch，深度不再受限。 */
function fishboneLayout(){
  const root=layoutRoot();if(!root)return;
  const ks=kidsOf(root);const rb=itemBounds(root);
  const spec=state._layoutSpec||layoutSpec();
  root.x=0;root.y=-rb.h/2;
  if(!ks.length)return;
  const GAP_Y=Math.max(spec.gapY,40);
  const SLOT_GAP=Math.max(spec.gapX(1),90);
  const SPINE_OFF=Math.max(rb.h,60)+90;
  /* 槽位宽按"最宽的那个后代节点"算，后代垂直串成一列。
     第一版曾用 reflowBranch + subTreeW（同级并排累加）分配槽位，
     重叠确实降下来了，但宽树把主轴撑到 6791px（宽高比 8.0）。 */
  let upX=0,downX=0;
  ks.forEach((k,i)=>{
    const up=i%2===0;
    const b=itemBounds(k);
    const w=Math.max(subTreeMaxW(k),b.w);
    if(up){
      k.x=-(upX+w);k.y=-(SPINE_OFF+b.h);
      k.branchDirection="up";
      placeColumnChain(k,"up",GAP_Y);
      upX+=w+SLOT_GAP;
    }else{
      k.x=-(downX+w);k.y=SPINE_OFF;
      k.branchDirection="down";
      placeColumnChain(k,"down",GAP_Y);
      downX+=w+SLOT_GAP;
    }
  });
}
/* ---------------- 4. 时间轴（横向，子树垂在轴下） ----------------
   L6 重写：原实现列距固定 190、每列内二级节点居中对齐后交给 placeDeepChain，
   列宽不看子树实际宽度，相邻列的深层子树互相压叠（同一画布实测 26 处重叠）。
   现按每列子树实测宽度分配列宽，列内子树用 reflowBranch 一次性展开。 */
function timelineLayout(){
  const root=layoutRoot();if(!root)return;
  const ks=kidsOf(root);const rb=itemBounds(root);
  const spec=state._layoutSpec||layoutSpec();
  root.x=-rb.w/2;root.y=-rb.h/2;
  if(!ks.length)return;
  const SLOT_GAP=Math.max(spec.gapX(1),110);
  const AXIS_Y=150;
  /* 同上：列宽按各列最宽的后代节点算，后代垂直串成详情列。
     用 subTreeW 时总宽达 8503px（宽高比 18.3），比改造前的 1379×915 更难用。 */
  const widths=ks.map(k=>Math.max(subTreeMaxW(k),layoutNodeWidth(k)));
  const totalW=widths.reduce((a,b)=>a+b,0)+SLOT_GAP*(ks.length-1);
  let x=-totalW/2;
  ks.forEach((k,i)=>{
    const w=widths[i];
    const b=itemBounds(k);
    k.x=x+w/2-b.w/2;k.y=AXIS_Y;
    k.branchDirection="down";
    placeColumnChain(k,"down",Math.max(spec.gapY,36)+10);
    x+=w+SLOT_GAP;
  });
}
/* ---------------- 5. 括号图（向右，大括号连接） ---------------- */
function braceLayout(){
  logicRightLayout();
}
/* ============================================================
   6. 一键优化排布（tidy）—— 整理，而不是重排
   ------------------------------------------------------------
   与上面六个模板的根本区别在"输入是什么"：
     模板 = 重排。规则由模板决定，用户手工摆的位置全部作废，图会变成
            该模板的规范形状（这也是用户觉得"生硬"的来源——形状不是他的）。
     tidy = 整理。把节点【当前坐标】当作输入，认定用户摆出来的大体形状
            就是意图，只做三件事：
       ① 方位保持：分支原本在父节点的哪一侧，整理后仍在那一侧
       ② 顺序保持：同一父节点的子节点，按"垂直于展开轴"的当前坐标排序，
                   用户把谁放在上面/左边，整理后还在那里
       ③ 间距统一：按 LAYOUT_SPEC 的层级间距等距重排，同级对齐、
                   子树之间不再互相压叠
   根节点原地不动，避免整张画布在屏幕上"跳走"。
   返回值 = 被整理的一级分支数（0 表示这张图没有可整理的分支）。
   ============================================================ */

/* 判定一个分支"往哪个方向展开"——看它的【后代重心】落在它的哪一侧。
   ------------------------------------------------------------
   这里踩了两次坑，记录清楚，避免以后又绕回去：
   ① 看子节点自己相对父节点的中心偏移 → 错。
      "逐级向右"排出来的是 1357×3649 的竖列，最上面那个一级分支的中心离根
      1800px 高、只有 216px 远，|dy|>|dx|，被读成"向上"；中间那个分支更糟，
      dx=136 / dy=24，被读成"向下"。tidy 照此重排，整棵树被扭转 90°。
   ② 看"整棵子树（含自己）的重心"相对根节点的方向 → 还是错。
      子树重心同样被它在竖列里的纵向位置带偏（最上面那个分支的重心仍然在根的上方）。
   ✅ 正确的是看【后代（不含自己）的重心】相对【自己】的方向：
      展开方向描述的是"这棵子树往哪边长"，与它在画布上的绝对位置无关。
      竖列最上面那个分支，后代清一色在它右侧铺开，dx≈+500 / dy≈0 → 向右。
   ------------------------------------------------------------
   叶子分支没有后代可看，返回 null，由调用方用同层多数方向补齐。 */
function expandDirOfBranch(node){
  const pb=itemBounds(node);if(!pb)return null;
  const ncx=pb.x+pb.w/2,ncy=pb.y+pb.h/2;
  let sx=0,sy=0,cnt=0;
  const stack=kidsOf(node).slice(),seen=new Set();
  while(stack.length){
    const cur=stack.pop();if(seen.has(cur.id))continue;seen.add(cur.id);
    const b=itemBounds(cur);
    if(b){sx+=b.x+b.w/2;sy+=b.y+b.h/2;cnt++;}
    for(const c of kidsOf(cur))stack.push(c);
  }
  if(cnt<1)return null;
  const dx=sx/cnt-ncx,dy=sy/cnt-ncy;
  if(Math.abs(dx)>=Math.abs(dy))return dx>=0?"right":"left";
  return dy>=0?"down":"up";
}
/* 纵向分组的"行"切分：按当前主轴坐标聚类。
   保留用户已有的行结构，而不是按宽度重新装箱——用户把"哪几个放在第一行"
   摆出来，这件事本身就是排版意图；重新装箱会把它改掉，那就成了"重排"而不是"整理"。
   ------------------------------------------------------------
   阈值取"相邻间距的下四分位 × 2.5"，下限 120px。
   这里刻意不用中位数：行数少的时候中位数会被【行间】间距占据——实测组织图
   6 个分支 4 行，相邻间距是 [14, 507, 588, 15, 606]，中位数是 507，
   阈值被抬到 811，结果每个间距都低于阈值、6 个分支全部并成一行，
   用户排的 4 行全丢了（转储坐标：需求(683)/时长(1271)/材料(1286)/画布(1892)
   被压成同一行，随后又按宽度重新折行，行的组成和用户排的不一样）。
   下四分位落在"行内间距"那一侧（本列为 15），阈值 120 才既不吃掉行内抖动、
   又能切开行间间距。 */
function clusterIntoRows(items,alongOf,minGap){
  const sorted=items.slice().sort((a,b)=>alongOf(a)-alongOf(b));
  if(sorted.length<3)return [sorted];
  const gaps=[];
  for(let i=1;i<sorted.length;i++)gaps.push(alongOf(sorted[i])-alongOf(sorted[i-1]));
  const gs=gaps.slice().sort((a,b)=>a-b);
  const intra=gs[Math.floor((gs.length-1)*0.25)];
  const thr=Math.max(minGap,(Number.isFinite(intra)?intra:0)*2.5);
  /* 行的切分要按主轴坐标（alongOf）来，但行【内】的顺序必须还原成传入时的顺序——
     调用方传进来的是"按副轴排好序"的列表（横向展开看 y、纵向展开看 x），
     若直接沿用按 alongOf 排过的顺序，行内左右/上下次序就被 y 顺序覆盖了：
     实测组织图第三行两个分支 材料(x=-622) / 时长(x=728) 会被排成 时长 在前，
     用户的左右次序被无声翻转。 */
  const origin=new Map(items.map((o,i)=>[o,i]));
  const rows=[];let cur=[sorted[0]];
  for(let i=1;i<sorted.length;i++){
    if(gaps[i-1]>thr){rows.push(cur);cur=[];}
    cur.push(sorted[i]);
  }
  rows.push(cur);
  return rows.map(r=>r.slice().sort((a,b)=>origin.get(a)-origin.get(b)));
}
function tidyLayout(){
  const root=layoutRoot();if(!root)return 0;
  const spec=state._layoutSpec||layoutSpec();
  const rb=itemBounds(root);if(!rb)return 0;
  const rcx=rb.x+rb.w/2,rcy=rb.y+rb.h/2;
  const GAP_MAIN=Math.max(spec.gapX(1)+spec.linkLane,150);
  const GAP_PERP=Math.max(spec.gapY,52);
  /* 纵向行宽上限 = 整理前的画布宽度（下限 1400，避免窄画布被压得过狠）。
     含义是"整理不会让图变宽"。没有这道上限时，用户排成一行（或只排了一行）
     的情况会被 tidy 重新等距后撑爆：实测组织图 2559×2414 → 7455×592，
     宽高比 1.06 → 12.59，那不是整理，是毁图。 */
  let bx0=Infinity,bx1=-Infinity;
  for(const it of state.items){
    const b=itemBounds(it);if(!b)continue;
    if(b.x<bx0)bx0=b.x;
    if(b.x+b.w>bx1)bx1=b.x+b.w;
  }
  const MAX_ROW_W=Number.isFinite(bx0)?Math.max(1400,bx1-bx0):2400;
  /* ① 方位判定：先按"后代重心"逐个判（见 expandDirOfBranch），
        叶子分支没后代可参照，用同层非叶子分支的多数方向补齐——
        它们本来就是同一个布局里长出来的，方向必然一致。 */
  const ks=kidsOf(root);
  const raw=ks.map(k=>({k,dir:expandDirOfBranch(k)}));
  const votes={right:0,left:0,down:0,up:0};
  for(const r of raw)if(r.dir)votes[r.dir]++;
  const top=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0];
  const majority=(top&&votes[top]>0)?top:"right";
  const groups={right:[],left:[],down:[],up:[]};
  for(const r of raw)groups[r.dir||majority].push(r.k);
  /* ② 组内按当前"副坐标"排序（横向展开看 y，纵向展开看 x），保持用户设定的顺序 */
  const perpOf=(n,d)=>{
    const b=itemBounds(n);if(!b)return 0;
    return (d==="right"||d==="left")?(b.y+b.h/2):(b.x+b.w/2);
  };
  for(const d in groups)groups[d].sort((a,b)=>perpOf(a,d)-perpOf(b,d));
  let n=0;
  for(const d of ["right","left","down","up"]){
    const list=groups[d];if(!list.length)continue;
    const horizontal=(d==="right"||d==="left");
    /* ③ 第一遍：把每个分支先摊开一次，实测出子树的真实包围盒。
       不另写估算函数（subTreeW/subTreeH/branchPerpSpan）是刻意的——
       L6 里鱼骨/时间轴先炸宽 6791/8503、后留大空档，根因就是"分槽用的尺子"
       和"实际展开用的尺子"不是同一把。实测则天然一致，改 reflowBranch
       也不会让这里悄悄失配。 */
    const info=list.map(k=>{
      const b=itemBounds(k);if(!b)return null;
      const savedX=k.x,savedY=k.y;
      k.x=0;k.y=0;k.branchDirection=d;
      reflowBranch(k,d,spec);
      let ax0=Infinity,ay0=Infinity,ax1=-Infinity,ay1=-Infinity;
      const stack=[k],seen=new Set();
      while(stack.length){
        const m=stack.pop();if(seen.has(m.id))continue;seen.add(m.id);
        const mb=layoutCollisionBounds(m);
        if(mb){if(mb.x<ax0)ax0=mb.x;if(mb.y<ay0)ay0=mb.y;if(mb.x+mb.w>ax1)ax1=mb.x+mb.w;if(mb.y+mb.h>ay1)ay1=mb.y+mb.h;}
        for(const c of kidsOf(m))stack.push(c);
      }
      k.x=savedX;k.y=savedY;
      const ok=Number.isFinite(ax0);
      const w=ok?ax1-ax0:0, h=ok?ay1-ay0:0;
      /* perp = 副轴占用（横排看高、竖排看宽）；along = 主轴占用（纵向分行时推进行高用） */
      const perp=horizontal?h:w, along=horizontal?w:h;
      /* 子树包围盒中心相对节点自身中心的偏移：后代全挂在某一侧时重心不在节点中心，
         不补偿的话排出来整体偏。 */
      const offPerp=horizontal?((ok?(ay0+ay1)/2:0)-b.h/2):((ok?(ax0+ax1)/2:0)-b.w/2);
      return {k,b,perp,along,offPerp,offTop:ok?ay0:0,offBottom:ok?ay1:0};
    }).filter(Boolean);
    if(!info.length)continue;
    /* ④ 第二遍：按实测尺寸等距排槽位 */
    if(horizontal){
      const total=info.reduce((s,o)=>s+o.perp,0)+GAP_PERP*(info.length-1);
      let cursor=rcy-total/2;
      for(const o of info){
        const cy=cursor+o.perp/2;
        o.k.y=cy-o.offPerp-o.b.h/2;
        o.k.x=d==="right"?rb.x+rb.w+GAP_MAIN:rb.x-GAP_MAIN-o.b.w;
        o.k.branchDirection=d;
        reflowBranch(o.k,d,spec);
        cursor+=o.perp+GAP_PERP;n++;
      }
    }else{
      /* 纵向分组：先按当前位置恢复用户排的"行"（保留他的分行意图），
         再在行宽超过上限时折行，最后逐行等距、行间等距。 */
      const rows0=clusterIntoRows(info,(o)=>d==="down"?o.b.y:(o.b.y+o.b.h),120);
      const rows=[];
      for(const r0 of rows0){
        let cur=[],cw=0;
        for(const o of r0){
          if(cur.length&&cw+GAP_PERP+o.perp>MAX_ROW_W){rows.push(cur);cur=[];cw=0;}
          cw+=(cur.length?GAP_PERP:0)+o.perp;cur.push(o);
        }
        if(cur.length)rows.push(cur);
      }
      let ry=d==="down"?(rb.y+rb.h+annotationLayoutReserve(root)+GAP_MAIN):(rb.y-GAP_MAIN);
      for(const r of rows){
        const rowW=r.reduce((s,o)=>s+o.perp,0)+GAP_PERP*(r.length-1);
        let rowH=0;
        for(const o of r)if(o.along>rowH)rowH=o.along;
        let cx=rcx-rowW/2;
        for(const o of r){
          const ccx=cx+o.perp/2;
          o.k.x=ccx-o.offPerp-o.b.w/2;
          o.k.y=d==="down"?(ry-o.offTop):(ry-o.offBottom);
          o.k.branchDirection=d;
          reflowBranch(o.k,d,spec);
          cx+=o.perp+GAP_PERP;n++;
        }
        ry+=d==="down"?(rowH+GAP_PERP):-(rowH+GAP_PERP);
      }
    }
  }
  return n;
}
/* ============================================================
   L8：保形整理（polishLayout）——「优化排布」的真正实现
   ------------------------------------------------------------
   【为什么另起一个函数：tidyLayout 的真实行为】
   实测反馈是"点了优化排布之后，它改变了原本的排布逻辑"。这个判断准确。
   tidyLayout 确实保住了三样东西——方位（expandDirOfBranch）、兄弟顺序
   （组内按副坐标排）、纵向行结构（clusterIntoRows）——但它**重算了每一个
   非根节点的坐标**：
     · 一级分支被硬拽到 rb.x+rb.w+GAP_MAIN，用户摆的距离全部作废；
     · 一级分支的 y 按子树实测高度重新等距居中；
     · 再交给 reflowBranch()，逐个子节点无条件覆盖 x/y。
   所以它产出的是"沿当前方位重新等距排一遍"，本质仍是重排，
   与「按布局重排」的差别只在方位从哪来（一个读当前坐标、一个读模板）。
   把它叫作"整理"名不副实，故保留为「规整排布」档，另立本函数。

   【本函数的原则：用户的坐标是不可侵犯的输入】
   只在两件事上动手，其余一律不碰：
     ① 兄弟吸附 —— 同一父节点下、本来就铺开成一排的兄弟，若其中多数
        已经落在一条窄带里（"想对齐，只差一点"），才把这一批吸附到同一条
        中心线；落在带外的当作刻意远离，不动。多数不在一条带上（阶梯式、
        错落式排布）则整组跳过——那是排版意图，不是误差。
     ② 消重叠 —— 两两检测，真的压住了才沿更短的分离轴对推、各让一半。
        单节点累计位移超过自身尺寸的 0.75 倍就放弃这一对：为了不重叠而把
        某个节点甩到远处，那是重排，不是整理。

   根节点固定不动（它是形状的锚点），主轴距离、兄弟顺序、节点尺寸一律不碰。
   因此本函数的结果可预期：**没被压住、也没差一点点的节点，一个像素都不动。**
============================================================ */
function polishLayout(){
  const nodes=state.items.filter(i=>i.type==="mindNode");
  if(nodes.length<2)return {aligned:0,separated:0,skipped:0};
  const root=layoutRoot();
  const depthOf=n=>{let d=0,c=n;while(c&&c.parentId){c=state.items.find(i=>i.id===c.parentId);if(!c)break;d++;if(d>64)break;}return d;};
  /* ── ① 兄弟吸附 ──────────────────────────────────────────────
     按层级由浅到深处理：父节点先落位，子节点再量自己的那条带。 */
  let aligned=0;
  const ordered=nodes.slice().sort((a,b)=>depthOf(a)-depthOf(b));
  for(const p of ordered){
    const kids=kidsOf(p).filter(k=>k.type==="mindNode");
    if(kids.length<2)continue;
    const pb=itemBounds(p);if(!pb)continue;
    const bs=kids.map(k=>itemBounds(k));
    if(bs.some(b=>!b))continue;
    /* 展开方向：子节点重心相对父节点中心（与 expandDirOfBranch 同一判据） */
    let sx=0,sy=0;
    for(const b of bs){sx+=b.x+b.w/2;sy+=b.y+b.h/2;}
    sx=sx/bs.length-(pb.x+pb.w/2);
    sy=sy/bs.length-(pb.y+pb.h/2);
    const horizontal=Math.abs(sx)>=Math.abs(sy);
    const vals=bs.map(b=>horizontal?(b.y+b.h/2):(b.x+b.w/2));
    const sorted=vals.slice().sort((a,b)=>a-b);
    const med=sorted[Math.floor((sorted.length-1)/2)];
    const spread=sorted[sorted.length-1]-sorted[0];
    if(spread<1.5)continue;                        /* 本来就齐，不用动 */
    /* 窄带半径取"这一排里最大节点尺寸"的三分之一：一条带上能容纳肉眼看不出的
       参差，但装不下成心摆出来的阶梯。 */
    const refSize=horizontal?Math.max.apply(null,bs.map(b=>b.h)):Math.max.apply(null,bs.map(b=>b.w));
    const band=Math.max(10,refSize*0.35);
    const inBand=vals.filter(v=>Math.abs(v-med)<=band);
    /* 多数（≥70%）在带内才吸附，否则认定整组是刻意错落 */
    if(inBand.length/vals.length<0.7)continue;
    const target=inBand.reduce((s,v)=>s+v,0)/inBand.length;
    let moved=0;
    for(let i=0;i<kids.length;i++){
      const cur=vals[i];
      if(Math.abs(cur-med)>band)continue;          /* 带外的刻意远离，不动 */
      const d=target-cur;
      if(Math.abs(d)<0.5)continue;
      if(horizontal)kids[i].y+=d;else kids[i].x+=d;
      moved++;
    }
    if(moved)aligned++;
  }
  /* ── ② 消重叠 ────────────────────────────────────────────── */
  const shiftUsed=new Map(nodes.map(n=>[n.id,0]));
  const canMove=(n,amt)=>{
    const b=itemBounds(n);if(!b)return false;
    return (shiftUsed.get(n.id)||0)+amt<=Math.max(b.w,b.h)*0.75;
  };
  const move=(n,dx,dy)=>{
    n.x+=dx;n.y+=dy;
    shiftUsed.set(n.id,(shiftUsed.get(n.id)||0)+Math.abs(dx)+Math.abs(dy));
  };
  let separated=0,skipped=0;
  for(let pass=0;pass<6;pass++){
    let any=false;
    for(let i=0;i<nodes.length;i++){
      for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i],b=nodes[j];
        const ba=layoutCollisionBounds(a),bb=layoutCollisionBounds(b);
        if(!ba||!bb)continue;
        const ox=Math.min(ba.x+ba.w,bb.x+bb.w)-Math.max(ba.x,bb.x);
        const oy=Math.min(ba.y+ba.h,bb.y+bb.h)-Math.max(ba.y,bb.y);
        if(ox<=4||oy<=4)continue;
        const push=(ox<oy?ox:oy)/2+8;
        const aRoot=(a===root),bRoot=(b===root);
        if(ox<oy){
          if(aRoot){if(canMove(b,push)){move(b,push,0);separated++;any=true;}else skipped++;}
          else if(bRoot){if(canMove(a,push)){move(a,-push,0);separated++;any=true;}else skipped++;}
          else{
            const okA=canMove(a,push),okB=canMove(b,push);
            if(okA)move(a,-push,0);
            if(okB)move(b,push,0);
            if(okA||okB){separated++;any=true;}else skipped++;
          }
        }else{
          if(aRoot){if(canMove(b,push)){move(b,0,push);separated++;any=true;}else skipped++;}
          else if(bRoot){if(canMove(a,push)){move(a,0,-push);separated++;any=true;}else skipped++;}
          else{
            const okA=canMove(a,push),okB=canMove(b,push);
            if(okA)move(a,0,-push);
            if(okB)move(b,0,push);
            if(okA||okB){separated++;any=true;}else skipped++;
          }
        }
      }
    }
    if(!any)break;
  }
  return {aligned,separated,skipped};
}
/* 排布收尾：附属元素归位 → 迭代避让 → 统计残余重叠。
   applyAutoLayout 与 tidyLayout 共用，两者此前各写一份会导致口径漂移。 */
function settleLayoutOverlaps(){
  let ov=1,guard=0;
  while(ov>0&&guard<4){
    avoidOverlap({attachmentsOnly:true});
    detachAttachmentsFromNodes();
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
  /* L6: 附件落位方向优先跟随宿主节点的分支朝向（branchDirection）——左右分布 /
     四向布局下，左侧或上侧分支的便签若仍统一放到右侧，会压到根节点或对侧分支上。
     below 仅作兜底方向（宿主无朝向信息时使用）。 */
  const below=o.below||"right";
  /* L6: 节点边界缓存一次。附件落位要在几个候选方向里挑一个"不压节点"的，
     若逐个候选现算 itemBounds 的话——mindNode 会触发 measureText——
     27 个附件 × 4 个候选 × 47 个节点就是上万次文字测量。 */
  const nodeBounds=nodes.map(n=>({id:n.id,b:layoutCollisionBounds(n)})).filter(x=>x.b);
  const hitsNode=(r)=>{
    for(const x of nodeBounds){
      const b=x.b;
      const ox=Math.min(r.x+r.w,b.x+b.w)-Math.max(r.x,b.x);
      const oy=Math.min(r.y+r.h,b.y+b.h)-Math.max(r.y,b.y);
      if(ox>2&&oy>2)return true;
    }
    return false;
  };
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
    const dir=best.branchDirection||below;
    /* L6: 候选方向按"避让子树"排序——节点朝哪边长子树，就先别往那边放附件；
       再逐个候选检测是否压到别的节点，取第一个干净的。
       实测未做这层检测时，"附件压节点"是全部重叠里唯一的大头
       （8 种排布共 30 处重叠，其中 27 处是这一类，附件↔附件为 0）。 */
    const order = dir==="right" ? ["down","up","left","right"]
                : dir==="left"  ? ["down","up","right","left"]
                : dir==="up"    ? ["right","left","down","up"]
                :                 ["right","left","up","down"];
    const slotAt=(d,ix)=>{
      if(d==="down")return{x:nb.x+ix*(ab.w+GAP),y:nb.y+nb.h+GAP,w:ab.w,h:ab.h};
      if(d==="up")return{x:nb.x+ix*(ab.w+GAP),y:nb.y-ab.h-GAP,w:ab.w,h:ab.h};
      if(d==="left")return{x:nb.x-ab.w-GAP,y:nb.y+ix*(ab.h+GAP),w:ab.w,h:ab.h};
      return{x:nb.x+nb.w+GAP,y:nb.y+ix*(ab.h+GAP),w:ab.w,h:ab.h};
    };
    let done=false;
    for(const d of order){
      /* 先试"独占槽位"，压住了就退而求其次用第 0 槽位再试一遍 */
      for(const ix of [idx,0]){
        const cand=slotAt(d,ix);
        if(!hitsNode(cand)){a.x=cand.x;a.y=cand.y;done=true;break;}
      }
      if(done)break;
    }
    if(!done){const cand=slotAt(order[0],idx);a.x=cand.x;a.y=cand.y;}
    slots.set(best.id,idx+1);
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
  /* L6: 清空上一次排布留下的分支朝向，各模板会各自重新赋值。
     不清的话，placeAttachments（按 branchDirection 决定把便签放到节点哪一侧）
     会沿用上一个布局的方向，把附件丢到已经被子树占满的那一边。 */
  for(const it of state.items){if(it.type==="mindNode")delete it.branchDirection;}
  for(const it of state.items){if(it.annotation)it.annotationSide="bottom";}
  /* 前置：美学参数 + 密度 + 方向决策 */
  const spec=layoutSpec();
  const dir=decideLayoutDirection(spec);
  state._layoutSpec=spec;state._layoutDir=dir;
  const t=dir.dir;
  /* L6 模板分发：每种排布都走各自的真实模板，不再把多种类型压成同一个 logic。
     原实现把 both 映射成 logic，再用后置的 translateSubtree 把一级子树平移到根两侧；
     但子树朝向已在 logicTemplateLayout 内被固化成单向，平移之后左右两侧的子树
     仍然朝同一侧延伸，双列并没有真正形成——实测宽度只从 1357 增到 1814，
     一级分支方位依旧是 1/1/3/1（没分开）。现在由 logicBothLayout 在排版"之前"
     先分侧，从根上解决。 */
  let eff=t;
  if(t==="down")eff="org";       /* 兼容旧存档命名 */
  if(eff==="org")orgDownLayout();
  else if(eff==="both")logicBothLayout();
  else if(eff==="fourway")fourWayLayout();
  /* L6.1 固定方向的模板必须显式指定朝向：见 logicTemplateLayout 里 force 参数的说明。
     "逐级向右"若回落到几何推断，点过"左右分布"之后再点它仍然会是两侧分布。 */
  else if(eff==="logic")logicTemplateLayout({dir:"right"});
  else if(eff==="left")logicLeftLayout();
  else if(eff==="u")uShapeLayout();
  else if(eff==="fishbone")fishboneLayout();
  else if(eff==="timeline")timelineLayout();
  else if(eff==="brace")braceLayout();
  else logicTemplateLayout({dir:"right"});
  /* ⑤ 附属元素归位（组织图用下方，其余用右侧） */
  placeAttachments({below:(t==="org"||t==="down")?"down":"right"});
  /* ⑥ 最终防重叠：自动树的节点位置已经由子树尺寸计算得到。
     这里只移动便签/材料，不能再把节点逐个推开，否则会破坏父子对齐。 */
  settleLayoutOverlaps();
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
          /* 沿较短轴推开，**方向必须按两者实际相对位置定**。
             原先写死 `a.x-=; b.x+=` / `a.y-=; b.y+=`，等价于"默认 a 在左上"。
             一旦 a 实际位于 b 的右/下方，这条规则就是把两者**往一起推**：
             三轮迭代后它们会互相穿过、上下顺序颠倒，且仍留着大片重叠。
             实测两张 460×330 的形变预览在起点接近时正是这个下场
             （2026-09-20 修：资源库/形变展开互相遮挡）。 */
          if(ox<oy){
            const s=(a.x+a.w/2<b.x+b.w/2)?-1:1;
            a.x+=s*pushX; b.x-=s*pushX;
          }else{
            const s=(a.y+a.h/2<b.y+b.h/2)?-1:1;
            a.y+=s*pushY; b.y-=s*pushY;
          }
          moved=true;
        }
      }
    }
    if(!moved) break;
  }
}

/* L6: avoidOverlap({attachmentsOnly:true}) 只在"附件↔附件"之间避让，
   从不处理"便签压住节点"这一种重叠——因为节点位置由布局算法算出，不能被随意挪动
   （挪了就破坏父子对齐）。于是这块只能由本函数兜住：只推附件一侧。
   节点在本函数内不移动，其边界缓存一次；附件被推后按需重算边界。
   （mindNode 的 itemBounds 要现场量文字，逐轮重算是这类避让最贵的部分。） */
function detachAttachmentsFromNodes(){
  const nodes=state.items.filter(i=>i.type==="mindNode");
  const atts=state.items.filter(i=>i.type==="note"||i.type==="fileCard");
  if(!nodes.length||!atts.length)return 0;
  const nb=nodes.map(n=>layoutCollisionBounds(n));
  let moved=0;
  for(let pass=0;pass<3;pass++){
    let any=false;
    for(const a of atts){
      let ab=layoutCollisionBounds(a);if(!ab)continue;
      for(let i=0;i<nodes.length;i++){
        const b=nb[i];if(!b)continue;
        const ox=Math.min(ab.x+ab.w,b.x+b.w)-Math.max(ab.x,b.x);
        const oy=Math.min(ab.y+ab.h,b.y+b.h)-Math.max(ab.y,b.y);
        if(ox>4&&oy>4){
          /* 沿重叠更短的轴推出去：纵向通常是空的，优先往上下让位 */
          if(ox<oy)a.x+=(ab.x+ab.w/2<b.x+b.w/2)?-(ox+10):(ox+10);
          else a.y+=(ab.y+ab.h/2<b.y+b.h/2)?-(oy+10):(oy+10);
          ab=layoutCollisionBounds(a);
          any=true;moved++;
        }
      }
    }
    if(!any)break;
  }
  return moved;
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
  /* K7：大画布拖动优先保障手感。只处理拖动物附近的直接重叠对象，
     避免一次轻微移动触发整张画布的级联避让。小画布仍保留完整级联避让。 */
  if(state.items.length>360){
    const db=bget(dragged);if(!db)return;
    const RANGE=360;
    for(const other of state.items){
      if(other===dragged||other.type==="stroke"||other.type==="connector")continue;
      const ob=bget(other);if(!ob||ob.x>db.x+db.w+RANGE||ob.x+ob.w<db.x-RANGE||ob.y>db.y+db.h+RANGE||ob.y+ob.h<db.y-RANGE)continue;
      const ox=Math.min(db.x+db.w,ob.x+ob.w)-Math.max(db.x,ob.x),oy=Math.min(db.y+db.h,ob.y+ob.h)-Math.max(db.y,ob.y);
      if(ox>4&&oy>4){
        if(ox<oy){const push=ox/2+GAP;if(other.x+ob.w/2>db.x+db.w/2)other.x+=push;else other.x-=push;}
        else{const push=oy/2+GAP;if(other.y+ob.h/2>db.y+db.h/2)other.y+=push;else other.y-=push;}
      }
    }
    return;
  }
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
    const source=document.createElement("button");
    source.type="button";source.className="sbtn source-action";source.innerHTML=ICON.jump;source.setAttribute("aria-label","查看来源");
    source.addEventListener("pointerdown",e=>e.stopPropagation());
    source.addEventListener("click",e=>{e.stopPropagation();if(!source.disabled)openSourceRef(selectedItem());});
    selbar.appendChild(source);
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
  const source=selbar.querySelector(".source-action");
  if(source){
    const ref=sel.sourceRef;
    source.disabled=!ref?.fileId||!state.files.some(f=>String(f.id)===String(ref.fileId));
    source.title=!ref?"查看来源 · 此便签没有来源":source.disabled?"查看来源 · 来源附件已不存在":"查看来源 · 打开附件并定位摘录原文";
  }
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
      /* L5: 材料在磁盘上的位置——材料库镜像；未落盘时按需补写后再定位 */
      if(typeof L1Material!=="undefined"&&L1Material.isDesktop()){
        const fd=mkItem(ICON.folder,"在文件夹中显示","",false);
        fd.onclick=()=>{hideCtxMenu();const f=state.files.find(x=>x.id===item.fileId);if(f)L1Material.reveal(f);else toast("附件记录已不存在");};
        body.appendChild(fd);
      }
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
    /* L5: 直接从磁盘导入材料——不改动原文件，只读入内容并镜像到材料库 */
    if(typeof L1Material!=="undefined"&&L1Material.isDesktop()){
      const s4=document.createElement("div");s4.className="csep";body.appendChild(s4);
      const imp=mkItem(ICON.import,"从磁盘导入材料…",null,false);
      imp.onclick=()=>{hideCtxMenu();L1Material.pickImport();};
      body.appendChild(imp);
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

