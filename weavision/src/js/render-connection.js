"use strict";

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
  if(t==="org")return{axis:"y",sign:1,u:false};        /* 纯向下 */
  if(t==="orgUp")return{axis:"y",sign:-1,u:false};     /* 向上（旧存档） */
  if(t==="left")return{axis:"x",sign:-1,u:false};      /* 向左 */
  if(t==="u")return{axis:"x",sign:1,u:true};           /* U 型：按向量判断 */
  if(t==="fishbone")return{axis:"x",sign:1,u:true};    /* 鱼骨：上下交错，按向量 */
  if(t==="timeline")return{axis:"y",sign:1,u:false};   /* 时间轴：一级在轴，子树垂轴下 */
  /* L6：左右分布两侧都有子树、四向布局四个方向都有子树，都不满足"固定单轴方向"
     这一假设，一律走按父子实际向量判断的 u 分支，否则锚点出口会取错边。 */
  if(t==="both"||t==="fourway")return{axis:"x",sign:1,u:true};
  return{axis:"x",sign:1,u:false};                     /* 默认逐级向右 */
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
    const mindId="mind:"+p.id+":"+ch.id;
    const isSel=state.selected===ch.id||state.selected===p.id||state.selected===mindId;
    /* K7：大画布中，屏幕外未选中分支的长线只会堆成噪点。
       子节点进入视口或任一端被选中时仍完整绘制。 */
    if(state.items.length>1000&&!isSel&&inViewport(pb)&&!inViewport(chb))continue;
    const lineBounds={x:Math.min(pb.x,chb.x),y:Math.min(pb.y,chb.y),w:Math.max(pb.x+pb.w,chb.x+chb.w)-Math.min(pb.x,chb.x),h:Math.max(pb.y+pb.h,chb.y+chb.h)-Math.min(pb.y,chb.y)};
    if(!inViewport(lineBounds))continue;
    const sides=relAnchors(pb,chb);
    let pa=anchorOn(pb,sides.out),cb=anchorOn(chb,sides.inp);
    /* 平滑过渡：拖动的每一帧对端点/朝向做指数平滑（约90ms收敛），
       避免方位切换时连线生硬跳变；自动布局时已清动画状态=定格就位 */
    const sm=smoothLinkEndpoints({id:"mind:"+p.id+":"+ch.id},pa,cb,sides.out,sides.inp);
    pa=sm.ea;cb=sm.eb;
    const outSide=sm.outSide,inpSide=sm.inpSide;
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

/* ============================================================
   B 方案：关系线避障路由（obstacle-avoiding routing）
   ------------------------------------------------------------
   【要解决什么】
   自由关系线（state.links）走的是"两端点之间的几何最短线"。两头之间
   若横着一张卡片，线就从卡片身上直接穿过去。密画布里这种"穿人"不算
   少见——总框架 34 个节点 22 条关系线，而且越长的线越容易穿。

   【原则：不改形状，只改路径】
   1. 只在"真的撞上"时才改路。不撞的线一像素都不动 —— 既有视觉零回归。
   2. 撞上的线换成一条避开障碍的正交折线（圆角收口），与既有 ortho 线型
      共用同一套语言，读起来是"这条线在绕行"，不是"这条线坏了"。
   3. 用户显式指定过线形状（curve/polyline/straight）的线一律不插手 ——
      那是明确意图，不是待优化的默认值。这同时天然提供了一个单线开关。

   【算法五步】
   ① 端点桩（stub）：沿出口/入口法线先走一小段。作用有二 —— 让线贴着
      卡片边缘出去（不斜切自己的角），并且把"回拐进自己身体"堵死。
   ② 走廊筛选：以两端点连线为轴外扩 search，只把落在这个窗口里的卡片
      当候选障碍。密画布有上百张卡片时，这一步把搜索空间砍到个位数。
   ③ 建网格：候选 x = 每张候选卡片 ± pad ∪ 端点桩 ∪ 走廊边界，y 同理，
      网格节点 = 交点。网格线本身贴着卡片外沿，所以"贴着卡片走"的路径
      天然落在网格上，不必额外处理。
   ④ A* 走网格：相邻节点之间的边若穿过任一卡片则不可通行。代价 = 长度
      + 拐弯惩罚，逼出"少折、短走"的路径，而不是贴着每张卡片绕一圈。
   ⑤ 圆角化：折点处 quadraticCurveTo 倒角，半径随相邻边长自适应。

   【端点自己的卡片为什么留在障碍表里】
   桩长(14) > 间隙(9)，所以桩的末端落在"自己这张卡片外扩 pad"之外。把
   自己的卡片也放进网格障碍表，A* 就永远给不出"从桩末往回拐进自己身体"
   的路径 —— 那是穿人，不是绕行。但快筛碰撞测试必须把它排除，否则锚点
   本身就在外扩后的矩形里，每条线都会被误判成撞人。
============================================================ */
/* maxNodes：网格节点上限。网格规模 ≈ (候选卡片数×2)²，防呆用的。
   一开始定的 1500 太紧，火箭层那条"民营份额路径→投资启示"因为
   1764 > 1500 被直接放弃、继续穿人 —— 实测漏网就是这么来的。 */
const AVOID={stub:14,pad:9,search:170,searchWide:480,turn:46,maxNodes:6500,maxRects:18,maxRectsWide:28,radius:13};
/* 出口/入口法线（由卡片指向外） */
const OUTN={l:{x:-1,y:0},r:{x:1,y:0},t:{x:0,y:-1},b:{x:0,y:1}};

function padRectX(r,p){return{x:r.x-p,y:r.y-p,w:r.w+p*2,h:r.h+p*2};}
/* 线段(p, p+d) 与 线段(c, c+e) 是否相交（含端点接触）。
   标准叉积定向测试，全部走标量 —— 见 segHitsRect 的说明。 */
function segSegXY(px,py,dx,dy,cx,cy,ex,ey){
  const o1=dx*(cy-py)-dy*(cx-px);
  const o2=dx*(cy+ey-py)-dy*(cx+ex-px);
  const o3=ex*(py-cy)-ey*(px-cx);
  const o4=ex*(py+dy-cy)-ey*(px+dx-cx);
  if(((o1>1e-9&&o2<-1e-9)||(o1<-1e-9&&o2>1e-9))&&((o3>1e-9&&o4<-1e-9)||(o3<-1e-9&&o4>1e-9)))return true;
  if(Math.abs(o1)<1e-9&&onSegXY(cx,cy,ex,ey,px,py))return true;
  if(Math.abs(o2)<1e-9&&onSegXY(cx,cy,ex,ey,px+dx,py+dy))return true;
  if(Math.abs(o3)<1e-9&&onSegXY(px,py,dx,dy,cx,cy))return true;
  if(Math.abs(o4)<1e-9&&onSegXY(px,py,dx,dy,cx+ex,cy+ey))return true;
  return false;
}
/* 点 (qx,qy) 是否落在线段 (px,py)+(dx,dy) 的包围盒里 */
function onSegXY(px,py,dx,dy,qx,qy){
  return Math.min(px,px+dx)-1e-9<=qx&&qx<=Math.max(px,px+dx)+1e-9
      && Math.min(py,py+dy)-1e-9<=qy&&qy<=Math.max(py,py+dy)+1e-9;
}
/* 线段与矩形（可外扩 pad）是否相交。
   ⚠ 这是 A* 的内循环：一次全量重算要调它几万次。
   早先的写法每个矩形边都 new 两个点对象再交给通用函数，GC 压力全压在这一层上。
   改成纯标量之后同样的判定、零分配 —— 拖拽帧的避障开销直接降下来。 */
function segHitsRect(p,q,r,pad){
  const pd=pad||0,x0=r.x-pd,y0=r.y-pd,x1=r.x+r.w+pd,y1=r.y+r.h+pd;
  if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1)return true;
  if(q.x>=x0&&q.x<=x1&&q.y>=y0&&q.y<=y1)return true;
  const dx=q.x-p.x,dy=q.y-p.y;
  return segSegXY(p.x,p.y,dx,dy,x0,y0,x1-x0,0)
      || segSegXY(p.x,p.y,dx,dy,x1,y0,0,y1-y0)
      || segSegXY(p.x,p.y,dx,dy,x1,y1,x0-x1,0)
      || segSegXY(p.x,p.y,dx,dy,x0,y1,0,y0-y1);
}
function segHitsAny(p,q,rects,pad){for(const r of rects)if(segHitsRect(p,q,r,pad))return true;return false;}
/* 二叉堆：A* 开表。网格规模不大，但线性扫描会把 60fps 吃掉。 */
function _hpush(h,n){h.push(n);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(h[p].f<=h[i].f)break;const t=h[p];h[p]=h[i];h[i]=t;i=p;}}
function _hpop(h){const top=h[0],last=h.pop();if(h.length){h[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<h.length&&h[l].f<h[m].f)m=l;if(r<h.length&&h[r].f<h[m].f)m=r;if(m===i)break;const t=h[m];h[m]=h[i];h[i]=t;i=m;}}return top;}
function _uniqSorted(a){
  a.sort((p,q)=>p-q);
  const o=[];
  for(const v of a){if(!o.length||v-o[o.length-1]>0.5)o.push(v);}
  return o;
}
function _nearestIdx(arr,v){
  let bi=0,bd=Infinity;
  for(let i=0;i<arr.length;i++){const d=Math.abs(arr[i]-v);if(d<bd){bd=d;bi=i;}}
  return bi;
}
/* ① 端点桩 + ② 走廊筛选。
   返回 {S0,S1,near,soft,bx0,bx1,by0,by1}；连一个候选障碍都没有时返回 null。
   拆出来单独一步，是为了让调用方能拿 near 算指纹做缓存键 —— 指纹只看
   "这条线走廊里的卡片"，画布别处有节点移动就不会误伤它的缓存。

   【走廊为什么是"胶囊"而不是"包围盒"】
   一开始用的是 bbox(P0,P3) 外扩 search。对角线的 bbox 几乎盖住整块画布，
   34 个节点的画布上一条长对角线能圈进二十几个候选，直接把候选上限撑爆、
   于是那条线放弃避障继续穿人（实测就漏了这一条）。
   改成"以两端点连线为轴、半径 search 的胶囊"——判据是线段与"卡片外扩
   search"是否相交。这对碰撞判定是等价的（线真的穿过某张卡片，那张卡片
   必然在胶囊里），但排除掉了所有离这条线很远、本来就不该参与绕行的卡片。 */
function avoidCorridor(P0,outSide,P3,inpSide,rects,skipIds,search,maxRects){
  const R=search||AVOID.search, CAP=maxRects||AVOID.maxRects;
  const n0=OUTN[outSide]||OUTN.r,n1=OUTN[inpSide]||OUTN.l;
  const L=Math.hypot(P3.x-P0.x,P3.y-P0.y);
  if(L<4)return null;
  const stub=Math.min(AVOID.stub,Math.max(5,L*0.25));
  const S0={x:P0.x+n0.x*stub,y:P0.y+n0.y*stub};
  const S1={x:P3.x+n1.x*stub,y:P3.y+n1.y*stub};
  const bx0=Math.min(P0.x,S0.x,S1.x,P3.x)-R,bx1=Math.max(P0.x,S0.x,S1.x,P3.x)+R;
  const by0=Math.min(P0.y,S0.y,S1.y,P3.y)-R,by1=Math.max(P0.y,S0.y,S1.y,P3.y)+R;
  const near=[];
  for(const r of rects){
    if(r.x>bx1||r.x+r.w<bx0||r.y>by1||r.y+r.h<by0)continue;
    /* 胶囊判据：线段与"卡片外扩 search"相交 → 这张卡片的绕行半径内 */
    if(!segHitsRect(P0,P3,r,R))continue;
    near.push(r);
  }
  if(!near.length)return null;
  /* 兜底：极密画布上同一条线旁边真挤了太多卡片时，按"离这条线多近"排序
     保留最近的 CAP 张。用距离排序而不是按遍历顺序截断 —— 遍历顺序
     随 items 数组变动，会让缓存指纹无端失效。 */
  if(near.length>CAP){
    const mid={x:(P0.x+P3.x)/2,y:(P0.y+P3.y)/2};
    near.sort(function(a,b){
      const da=Math.hypot(a.x+a.w/2-mid.x,a.y+a.h/2-mid.y);
      const db=Math.hypot(b.x+b.w/2-mid.x,b.y+b.h/2-mid.y);
      return da-db;
    });
    near.length=CAP;
  }
  const soft=[];
  for(const r of near)if(!skipIds||(skipIds[0]!==r.id&&skipIds[1]!==r.id))soft.push(r);
  if(!soft.length)return null;
  return{S0:S0,S1:S1,near:near,soft:soft,bx0:bx0,bx1:bx1,by0:by0,by1:by1};
}
/* 走廊里候选障碍的指纹：位置或数量一变就换键 */
function avoidFingerprint(rects){
  let fp=0;
  for(const r of rects)fp=(fp*31+((r.x*7+r.y*13+r.w*3+r.h*5)|0))|0;
  return fp;
}
/* ③④⑤ 建网格 → A* → 圆角折线。
   返回值有三态，调用方必须区分开：
     undefined —— 原路线本来就不撞人，不该动手（不要升级走廊重试）
     null      —— 确实撞人，但这一版走廊里找不到通路（可以升级走廊再试）
     Point[]   —— 绕行折线 */
function avoidSolve(P0,P3,near,soft,c,S0,S1,hadAvoid){
  /* 快筛：原路线（P0→S0→S1→P3）不撞人 → 不动。
     已有绕行的线用更小的判定间隙，避免端点平滑动画期间在两种走法间来回跳。 */
  const clearPad=hadAvoid?AVOID.pad*0.35:AVOID.pad;
  if(!segHitsAny(P0,S0,soft,clearPad)&&!segHitsAny(S0,S1,soft,clearPad)&&!segHitsAny(S1,P3,soft,clearPad))return undefined;
  /* ③ 建网格 */
  const blockers=[];
  for(const r of near)blockers.push(padRectX(r,AVOID.pad));
  const xs=[P0.x,S0.x,S1.x,P3.x,c.bx0,c.bx1],ys=[P0.y,S0.y,S1.y,P3.y,c.by0,c.by1];
  for(const r of blockers){xs.push(r.x,r.x+r.w);ys.push(r.y,r.y+r.h);}
  const X=_uniqSorted(xs),Y=_uniqSorted(ys);
  const W=X.length,H=Y.length;
  if(W*H>AVOID.maxNodes)return null;
  const xi0=_nearestIdx(X,S0.x),yi0=_nearestIdx(Y,S0.y),xi1=_nearestIdx(X,S1.x),yi1=_nearestIdx(Y,S1.y);
  S0={x:X[xi0],y:Y[yi0]};S1={x:X[xi1],y:Y[yi1]};
  /* ④ A* */
  const N=W*H;
  const g=new Float64Array(N).fill(Infinity);
  const prev=new Int32Array(N).fill(-1);
  const fdir=new Int8Array(N).fill(-1);
  const done=new Uint8Array(N);
  const si=yi0*W+xi0,ti=yi1*W+xi1;
  const hOf=function(i){const ix=i%W,iy=(i-ix)/W;return Math.abs(X[ix]-S1.x)+Math.abs(Y[iy]-S1.y);};
  const heap=[];
  g[si]=0;_hpush(heap,{i:si,f:hOf(si)});
  let found=false;
  /* 复用的暂存点：邻域展开一次最多建 4 个 {x,y}，在几万次迭代下也是可观的开销 */
  const sp={x:0,y:0},sq={x:0,y:0};
  while(heap.length){
    const cur=_hpop(heap),idx=cur.i;
    if(done[idx])continue;
    done[idx]=1;
    if(idx===ti){found=true;break;}
    const ix=idx%W,iy=(idx-ix)/W;
    sp.x=X[ix];sp.y=Y[iy];
    for(let k=0;k<4;k++){
      const nx=ix+(k===0?1:k===1?-1:0),ny=iy+(k===2?1:k===3?-1:0);
      if(nx<0||nx>=W||ny<0||ny>=H)continue;
      const ni=ny*W+nx;
      if(done[ni])continue;
      sq.x=X[nx];sq.y=Y[ny];
      if(segHitsAny(sp,sq,blockers,0))continue;
      const dir=k<2?0:1;
      const step=dir===0?Math.abs(sq.x-sp.x):Math.abs(sq.y-sp.y);
      if(step<1e-6)continue;
      const ng=g[idx]+step+(fdir[idx]>=0&&fdir[idx]!==dir?AVOID.turn:0);
      if(ng<g[ni]){g[ni]=ng;prev[ni]=idx;fdir[ni]=dir;_hpush(heap,{i:ni,f:ng+hOf(ni)});}
    }
  }
  if(!found)return null;
  /* 回溯 → 合并共线 → 首尾换成真正的锚点 */
  const raw=[];
  let c2=ti;
  while(c2>=0){const ix2=c2%W;raw.push({x:X[ix2],y:Y[(c2-ix2)/W]});c2=prev[c2];}
  raw.reverse();
  if(raw.length<2)return null;
  raw[0]={x:P0.x,y:P0.y};raw[raw.length-1]={x:P3.x,y:P3.y};
  const out=[raw[0]];
  for(let i=1;i<raw.length-1;i++){
    const a=out[out.length-1],b=raw[i],c3=raw[i+1];
    if(Math.abs((b.x-a.x)*(c3.y-b.y)-(b.y-a.y)*(c3.x-b.x))>1e-6)out.push(b);
  }
  out.push(raw[raw.length-1]);
  /* 少于 3 个点说明没绕成，交给原路线；顺手丢掉肉眼看不见的碎折 */
  if(out.length<3)return null;
  const fin=out.filter(function(p,i){return i===0||i===out.length-1||Math.hypot(p.x-out[i-1].x,p.y-out[i-1].y)>2;});
  return fin.length>=3?fin:null;
}
/* 避障总入口：窄走廊 → （失败才）宽走廊重试。
   返回 {pts, key}；pts=null 表示这条线不用动（要么本来不撞，要么绕不出来）。
   key 是缓存指纹，两次尝试用的走廊不同、指纹也不同，所以升级过的结果
   不会跟没升级的混在同一个缓存条目里。

   【为什么要升级重试】
   密画布上"一条线要横穿一整列节点"很常见。窄走廊里那一列卡片首尾相接，
   中间一道缝都没有，A* 必然无解 —— 火箭层的"民营份额路径→投资启示"
   就是这么漏的（16 处穿点一处没消）。把走廊放大到 searchWide 之后，
   网格跟着变宽，才能从列的两端绕过去。升级只在窄走廊失败时发生，
   所以常态开销不变。 */
function computeAvoid(P0,outSide,P3,inpSide,rects,skipIds,hadAvoid){
  const c=avoidCorridor(P0,outSide,P3,inpSide,rects,skipIds,AVOID.search,AVOID.maxRects);
  if(!c)return{pts:null,key:0};
  const key0=avoidFingerprint(c.near);
  const p0=avoidSolve(P0,P3,c.near,c.soft,c,c.S0,c.S1,hadAvoid);
  if(p0===undefined)return{pts:null,key:key0};   /* 本来就不撞，别升级 */
  if(p0)return{pts:p0,key:key0};
  const c2=avoidCorridor(P0,outSide,P3,inpSide,rects,skipIds,AVOID.searchWide,AVOID.maxRectsWide);
  if(!c2)return{pts:null,key:key0};
  const p2=avoidSolve(P0,P3,c2.near,c2.soft,c2,c2.S0,c2.S1,false);
  if(!p2)return{pts:null,key:key0};
  /* 高位置位，与窄走廊的指纹分属两个命名空间，不会互相命中缓存 */
  return{pts:p2,key:avoidFingerprint(c2.near)|0x40000000};
}
/* 圆角折线：折点处倒角，半径随相邻边长自适应 */
function strokeRoundedPolyline(c,pts,r0){
  if(!pts||pts.length<2)return;
  c.beginPath();c.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length-1;i++){
    const a=pts[i-1],p=pts[i],b=pts[i+1];
    const d1=Math.hypot(p.x-a.x,p.y-a.y),d2=Math.hypot(b.x-p.x,b.y-p.y);
    if(d1<1e-6||d2<1e-6){c.lineTo(p.x,p.y);continue;}
    const r=Math.min(r0,d1*0.5,d2*0.5);
    c.lineTo(p.x+(a.x-p.x)/d1*r,p.y+(a.y-p.y)/d1*r);
    c.quadraticCurveTo(p.x,p.y,p.x+(b.x-p.x)/d2*r,p.y+(b.y-p.y)/d2*r);
  }
  const e=pts[pts.length-1];c.lineTo(e.x,e.y);
}
/* 折线取点（按弧长比例），供标签定位与流动光点复用 */
function polyMidAt(pts,t){
  if(!pts||pts.length<2)return null;
  if(pts.length===2)return{x:pts[0].x+(pts[1].x-pts[0].x)*t,y:pts[0].y+(pts[1].y-pts[0].y)*t};
  const segs=[];let total=0;
  for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);segs.push(l);total+=l;}
  if(total<1e-6)return{x:pts[0].x,y:pts[0].y};
  let want=total*t;
  for(let i=0;i<segs.length;i++){
    if(want<=segs[i]||i===segs.length-1){
      const k=segs[i]>1e-6?Math.min(1,want/segs[i]):0,a=pts[i],b=pts[i+1];
      return{x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k};
    }
    want-=segs[i];
  }
  return{x:pts[pts.length-1].x,y:pts[pts.length-1].y};
}
/* 折线上某点处的走向（单位向量）。标签要顺着"线在那个位置的方向"排，
   不能顺着两端点的连线方向 —— 绕行线的局部走向和整体弦向经常差 90°。 */
function polyDirAt(pts,t){
  if(!pts||pts.length<2)return{x:1,y:0};
  let total=0;const segs=[];
  for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);segs.push(l);total+=l;}
  if(total<1e-6)return{x:1,y:0};
  let want=total*t;
  for(let i=0;i<segs.length;i++){
    if(want<=segs[i]||i===segs.length-1){
      const a=pts[i],b=pts[i+1],l=segs[i];
      return l>1e-6?{x:(b.x-a.x)/l,y:(b.y-a.y)/l}:{x:1,y:0};
    }
    want-=segs[i];
  }
  return{x:1,y:0};
}
/* 路径分发：有绕行折线走折线，否则沿用既有线型（routeConnection）。
   所有"沿关系线画东西"的地方（主线、批注呼吸光、选中高亮）都走这里，
   保证同一条线在三个图层上永远是同一条路径。 */
function pathConnection(c,curve,color,width,shapeOverride){
  if(curve&&curve.pts){strokeRoundedPolyline(c,curve.pts,AVOID.radius);return;}
  routeConnection(c,curve.ea,curve.eb,curve.outSide,curve.inpSide,color,width,shapeOverride);
}
