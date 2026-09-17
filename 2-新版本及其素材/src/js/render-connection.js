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
