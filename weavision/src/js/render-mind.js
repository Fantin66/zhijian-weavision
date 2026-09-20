"use strict";

/* C4 Neumorphism */
function neumorphPath(c,x,y,w,h,r){roundRectPath(c,x,y,w,h,r);}
function drawNeumorph(c,x,y,w,h,r,sel,dark,bgColor){
  const z=state.camera.zoom;const off=5/z,blur=15/z;
  const surface=dark?"#2e2e34":"#f2f3f6";
  const ls=dark?"rgba(0,0,0,.1)":"rgba(255,255,255,.85)";
  const ds=dark?"rgba(0,0,0,.28)":"rgba(28,42,74,.1)";
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
  /* L1.3 LOD: 拖动/相机手势时跳过节点投影（shadowBlur 是 canvas 最贵的操作之一），
     松手即恢复完整投影——拖动态视觉无损，换流畅。 */
  if(!previewInteractionActive()){
  if(sel){c.shadowColor="rgba(45,95,211,.4)";c.shadowBlur=14/z;c.shadowOffsetY=2/z;}
  /* 阴影使用冷灰蓝，而不是纯黑。低层节点也保留极浅接触阴影，
     让用户在缩小时仍能一眼识别出"这是一个可操作的框"。 */
  else if(depth===0){c.shadowColor="rgba(28,50,94,"+(SC.shadowAlpha+.08)+")";c.shadowBlur=SC.shadowBlur/z;c.shadowOffsetY=4/z;}
  else if(depth===1){c.shadowColor="rgba(28,50,94,"+SC.shadowAlpha+")";c.shadowBlur=Math.max(7,SC.shadowBlur-2)/z;c.shadowOffsetY=2/z;}
  else if(depth===2){c.shadowColor="rgba(28,50,94,"+Math.max(.11,SC.shadowAlpha*.72)+")";c.shadowBlur=Math.max(5,SC.shadowBlur-4)/z;c.shadowOffsetY=1.5/z;}
  else{c.shadowColor="rgba(28,50,94,"+Math.max(.07,SC.shadowAlpha*.48)+")";c.shadowBlur=Math.max(3,SC.shadowBlur-6)/z;c.shadowOffsetY=1/z;}
  }
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
