"use strict";
/* ============================================================
   知见学堂 · Demo 教学项目（完整重写 V16）
   8 张画布：总览 → 聚焦类 → 连接类 → 美观性 → 案例×2 → AI 功能 → 现状与规划
   每种元素类型展示一种展开机制：
   - mindNode → 就地展开详情 (E)
   - fileCard → 形变展开预览 (previewOpen)
   - 语义关系线 → 五种类型 + 线权重 + 线型
   - 跃迁 → 跨画布跳转 (jumpTo)
============================================================ */
const TUTORIAL_VERSION=20;
function storeBuiltinTutorBlob(id,blob){
  if(!idb)return;
  try{const tx=idb.transaction("files","readwrite");tx.objectStore("files").put(blob,id);}catch(_){}
}
function ensureTutorProject(){
  const previousProject=state.activeProjectId,previousCanvas=state.activeCanvasId;
  const countBefore=state.projects.length;
  /* I5-fix: 只回收真正的内置教程项目（isBuiltin 标记），不再按名字删除——
     用户恰好把项目起名"知见学堂/织见学堂/回归测试"时原实现会整体销毁 */
  state.projects=state.projects.filter(p=>!(p.isBuiltin&&(p.name==="知见学堂"||p.name==="织见学堂"||p.name==="回归测试")));
  const removedOld=countBefore!==state.projects.length;
  const existing=state.projects.find(p=>p.isBuiltin&&p.name==="知见学堂");
  if(existing&&existing.tutorialVersion===TUTORIAL_VERSION){
    /* I5-fix: 版本一致即复用——不再要求画布数恰好 7 个，
       用户在教程项目里增删过画布不该被静默重置回演示版 */
    if(!state.projects.some(p=>p.id===previousProject)){state.activeProjectId=existing.id;state.activeCanvasId=existing.canvases[0].id;state.selected=null;}
    return removedOld;
  }
  const project=existing||{id:"p"+(uid++),name:"知见学堂",files:[],folders:[],canvases:[]};
  if(!existing)state.projects.push(project);
  project.files=[];project.folders=[];project.canvases=[];project.tutorialVersion=TUTORIAL_VERSION;project.isBuiltin=true;

  /* ── 工厂函数 ── */
  const makeCanvas=(name,layout)=>({id:"c"+(uid++),name,items:[],camera:{x:0,y:0,zoom:1},previews:[],links:[],layoutVersion:TUTORIAL_VERSION,tutorialLayout:layout||"logic"});
  const makeNode=(canvas,text,x,y,color,parent=null,detail="",annotation="")=>{
    const item={id:uid++,type:"mindNode",text,parentId:parent?parent.id:null,children:[],x,y,w:156,h:44,color,collapsed:false,attachIds:[],detail,annotation,birth:performance.now()};
    if(parent)parent.children.push(item.id);canvas.items.push(item);return item;
  };
  const makeNote=(canvas,text,x,y,color,w=280,h=130,annotation="")=>{
    const item={id:uid++,type:"note",x,y,w,h,text,color,fontFamily:state.fontPreset,fontSize:13,underline:false,bold:false,annotation,birth:performance.now()};
    canvas.items.push(item);return item;
  };
  const relate=(canvas,a,b,type,annotation,level,shape)=>{
    const link={id:"lnk"+(uid++),aId:a.id,bId:b.id,relationType:type,directional:type!=="related",annotation,level:level||"normal"};
    if(shape)link.shape=shape;
    canvas.links.push(link);return link;
  };
  const makeBuiltinFile=(name,kind,mime,content="",url="")=>{
    const id="tutor-file-"+(uid++);const blob=content?new Blob([content],{type:mime}):null;
    /* G6: blob 同时存内存和 IndexedDB，确保 IDB 不可用时预览仍可用 */
    const file={id,name,kind,mime,size:blob?blob.size:0,created:Date.now(),folderId:null,url:url||null,blob:blob||undefined};
    project.files.push(file);if(blob)storeBuiltinTutorBlob(id,blob);return file;
  };
  const makeFileCard=(canvas,file,x,y,w=200,h=58,annotation="",previewOpen=false)=>{
    /* 预设展开态时使用合理的预览目标尺寸（与 previewTargetSize 默认值对齐），
       并存储 rest 尺寸 _cardW/_cardH，避免 syncMorphDom 以卡片尺寸创建覆盖层 */
    const cardW=160,cardH=file.kind==="img"?160:52;
    let fw=w,fh=h;
    if(previewOpen){
      if(file.kind==="link"){fw=480;fh=340;}
      else if(file.kind==="img"){fw=460;fh=340;}
      else if(file.kind==="media"){fw=500;fh=376;}
      else if(file.kind==="doc"||file.kind==="sheet"||file.kind==="pdf"||file.kind==="slide"){fw=460;fh=366;}
      else{fw=460;fh=330;}
    }
    const item={id:uid++,type:"fileCard",x,y,w:fw,h:fh,fileId:file.id,kind:file.kind,thumb:null,tw:1,th:1,annotation,previewOpen,birth:performance.now()};
    if(previewOpen){item._cardW=cardW;item._cardH=cardH;item._morphW=fw;item._morphH=fh;}
    canvas.items.push(item);return item;
  };

  /* ── 先创建全部 7 张画布（便于设置跨画布跃迁）── */
  const c1=makeCanvas("01-总览：什么是织见","logic");       project.canvases.push(c1);
  const c2=makeCanvas("02-聚焦类功能","logic");              project.canvases.push(c2);
  const c3=makeCanvas("03-连接类功能","logic");              project.canvases.push(c3);
  const c4=makeCanvas("04-美观性","logic");                   project.canvases.push(c4);
  const c5=makeCanvas("05-案例：一级市场投资分析","fishbone"); project.canvases.push(c5);
  const c6=makeCanvas("06-案例：行业研究展示","timeline");     project.canvases.push(c6);
  const c7=makeCanvas("07-AI 功能","logic");              project.canvases.push(c7);
  const c8=makeCanvas("08-现状与规划","logic");              project.canvases.push(c8);

  /* ── 附件文件 ── */
  const conceptSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#eff6ff"/><stop offset="1" stop-color="#ecfdf5"/></linearGradient></defs><rect width="720" height="420" rx="32" fill="url(#g)"/><g fill="none" stroke="#8ba9e8" stroke-width="8" stroke-linecap="round"><path d="M170 210C250 100 330 105 360 210S490 320 570 210"/><path d="M170 210C250 320 330 315 360 210S490 100 570 210"/></g><circle cx="170" cy="210" r="34" fill="#2d5fd3"/><circle cx="360" cy="210" r="48" fill="#5e75d9"/><circle cx="570" cy="210" r="34" fill="#319b77"/><g fill="white" font-family="Arial, sans-serif" text-anchor="middle"><text x="170" y="218" font-size="22">织</text><text x="360" y="220" font-size="30">连接</text><text x="570" y="218" font-size="22">见</text></g><text x="360" y="354" fill="#45536f" font-size="28" font-family="Arial, sans-serif" text-anchor="middle">把线索编在一起，把重要处看清</text></svg>`;
  const conceptFile=makeBuiltinFile("织见-连接与聚焦.svg","img","image/svg+xml",conceptSvg);
  const quickstartFile=makeBuiltinFile("织见-一分钟上手.md","text","text/markdown;charset=utf-8",`# 织见一分钟上手\n\n1. 空白处双击 → 建节点\n2. Tab → 加子节点；Enter → 加同级\n3. 选中两个元素按 C → 连接并标语义\n4. 按 F 聚焦只看直接关系\n5. 按 E 展开完整内容\n6. 按 A 添加批注\n7. 按 Y 回到全景\n\n> 先织成一张网，再在需要的地方"见"。\n\n织连万象，见聚一隅。`);
  const relationFile=makeBuiltinFile("五种语义关系.md","text","text/markdown;charset=utf-8",`# 织见的五种语义关系\n\n| 关系 | 方向 | 用途 |\n|---|---|---|\n| 关联 | 无向 | 两者有关，暂不确定方向 |\n| 支撑 | 有向 | A 支持 B 的判断 |\n| 导致 | 有向 | A 促使 B 发生 |\n| 反证 | 有向 | A 与 B 矛盾，需要解决 |\n| 证据 | 有向 | A 是 B 的来源或依据 |\n\n## 线权重\n\n- **normal**：普通线\n- **emphasis**：加粗——重要论证\n- **highlight**：高亮——核心路径\n\n## 线型\n\n- **auto**：跟随布局\n- **curve**：曲线\n- **polyline**：折线\n- **straight**：直线\n\n> 线不是装饰，要有语义。给每条线一个名字，让网络变成可追溯的判断。`);
  const brandFile=makeBuiltinFile("织见-品牌宣言.md","text","text/markdown;charset=utf-8",`# 织见品牌宣言\n\n这里没有制式的层级，只有元素与线。\n\n元素是任何可以放上画布的事物——一行标题、一页文档、一张便签、一个网页。\n线带有方向，方向带来逻辑：父子、支撑、反驳、证据、因果。\n\n它们任意组合：并列，嵌套，成网。\n\n图越大，越需要聚焦——只留下与这一点相连的一切，其余退为背景。\n全貌与单点，俯视与沉浸，由同一次聚焦切换。\n\n**织连万象，见聚一隅。**`);
  const ddFile=makeBuiltinFile("DD尽调-关系板模板.md","text","text/markdown;charset=utf-8",`# DD 尽调关系板\n\n织见的核心使用场景：把尽调材料组织成一张可追溯的关系网。\n\n## 节点 = 判断\n- 核心判断：行业增长驱动力\n- 支撑判断：财务指标改善\n- 风险判断：客户集中度过高\n\n## 线 = 判断之间的关系\n- 财务改善 → 支撑 → 增长驱动\n- 客户集中 → 反证 → 商业可持续\n- 行业报告 → 证据 → 增长驱动\n\n## 便签 = 不确定的内容\n- "大客户续约率未公开，待验证"\n- "技术路线切换的窗口期不确定"\n\n## 附件 = 来源\n- 行业研究报告\n- 企业公告\n- 公开访谈记录`);
  const industryFile=makeBuiltinFile("商业航天-公开研究口径.md","text","text/markdown;charset=utf-8",`# 商业航天公开研究口径\n\n仅使用公开来源：\n\n- 政府公开政策与统计\n- 企业公告和公开访谈\n- 已公开的行业研究报告\n\n不纳入：会议纪要、上会材料、交易条款、项目专属资料。`);
  const materialFile=makeBuiltinFile("Win11-Fluent-材质系统.md","text","text/markdown;charset=utf-8",`# Win11 Fluent Design 材质系统\n\n织见的视觉基础是 Windows 11 Fluent Design 的材质方法论。\n\n## 七层堆叠\n\n| 层 | 名称 | 作用 |\n|---|---|---|\n| L1 | 漂移色 | 缓慢流动的底色光晕 |\n| L2 | Mica | 半透明云母质感 |\n| L3 | 噪点 | 微观颗粒感 |\n| L4 | 纹理 | 网格/圆点/线条/空白 |\n| L5 | 画布 | 透明，让底层透出 |\n| L6 | 节点 | 卡片层 |\n| L7 | Chrome | 工具栏/侧栏 |\n\n## 三种变体\n\n- **fluent**：磨砂玻璃（默认）\n- **neumorph**：新拟态——连续表面\n- **minimal**：简约——极简边框\n\n> 材质是地板，不是天花板。底层统一，表层因内容而变。`);
  const roadmapFile=makeBuiltinFile("织见-路线图.md","text","text/markdown;charset=utf-8",`# 织见路线图\n\n## 已完成（C1–K2）\n\n- C1–C8：基础画布、节点、连接、便签、附件\n- C9–C12：形变展开、语义关系、布局系统\n- C13：精简重构，移除展开内容\n- E5：Win11 Fluent Design 材质系统\n- F1–F19：七种样式预设、背景纹理、漂移色、Mica\n- G1–G12：桌面应用（Electron）、导入导出（.fantin）、自动主题、AI 接口 v1.3、任务栏图标、版权声明、形变 Bug 修复\n- H1–H5：性能优化（撤销栈/位图生命周期/渲染节流）、Web 预览机制、安全加固\n- I5–I9：v0.5.0–0.5.2 发布——第三方库本地化、PDF/Word 预览修复、安装版优化、导出图片修复\n- J1–J4：v0.6.0–0.6.3——路径优化（i6→src）、性能 LOD 降级渲染、流光效果三层独立游动、Alt+Enter 全屏、Excel 暗色模式\n- K1–K2：v0.7.0–0.7.1——AI skill 集成（操作画布 + 读 .fantin 生成报告）、skill 自动安装、合并指引\n\n## 待优化\n\n- 性能优化中阶任务（H2/H3 待续）\n- 玻璃样式绿带问题（已搁置）\n- SVG 矢量导出（已搁置）\n\n## 待开发\n\n- AI 自主画板构建（利用 typed relations + morph）\n- OPML 导出\n- 更多预览格式支持\n- 形变机制深化`);

  /* ═══════════════════════════════════════════════════════════
     画布一：总览——什么是织见
     布局：radial（手动放置为放射状）
     核心：织（连接）+ 见（聚焦）= 织见
  ═══════════════════════════════════════════════════════════ */
  const c1Root=makeNode(c1,"织见 = 织（连接）+ 见（聚焦）",-10,-10,"#2d5fd3",null,
    "# 织见\n\n**织连万象，见聚一隅。**\n\n织见不是一个传统的思维导图工具。它把画布上的东西简化为两样：**元素**和**线**。\n\n元素可以是标题、便签、附件——任何你想放在画布上的东西。\n线带方向和语义——不只是从属，还有支撑、导致、反证、证据。\n\n图大了？按 F 聚焦，只看直接相关的一切。\n要细看？按 E 展开完整内容。\n\n织是把线索编在一起，见是在重要处看清。",
    "双击编辑文字，E 展开完整内容，A 看批注。");
  /* ── 织（连接）分支 ── */
  const c1Elements=makeNode(c1,"元素：任何可以放上画布的事物",-480,-200,"#319b77",c1Root,
    "## 元素\n\n不是只有标题。织见的元素有三种：\n\n- **节点**：一行判断。「卫星制造是重资产赛道」\n- **便签**：一段 Markdown 说明。可以写表格、列表、链接\n- **附件**：文件、网页、表格。以卡片形态存在，需要时形变展开\n\n标题只是入口，内容才是本体。",
    "元素内容密度远大于普通导图的纯标题。");
  const c1Lines=makeNode(c1,"线：带方向，方向带来逻辑",-480,180,"#319b77",c1Root,
    "## 线不是装饰\n\n每条线有五种语义之一：\n\n- **关联**：有关，暂不确定方向\n- **支撑**：A 支持 B 的判断\n- **导致**：A 促使 B 发生\n- **反证**：A 与 B 矛盾\n- **证据**：A 是 B 的来源\n\n方向带来逻辑。线可以跨层级、跨分支、跨画布。",
    "选中两个元素按 C 创建连接。");
  const c1Hierarchy=makeNode(c1,"层级没有消失，但不再是制式",-480,40,"#319b77",c1Elements,
    "层级只是「线的一种可能含义」，而非唯一结构。\n\n线可以是父子（有层级），也可以是支撑/反证/证据/因果（无层级语义关系）。\n\n**网络不是树。**",
    "织见的关系网可以表达比树复杂得多的结构。");
  /* ── 见（聚焦）分支 ── */
  const c1Focus=makeNode(c1,"聚焦 F：只留直接关系",460,-80,"#6b73cc",c1Root,
    "## 聚焦\n\n思维导图做大了有个真实痛点：东西越来越多，想找一个节点时，它旁边什么都有，人就乱了。\n\n聚焦只留下与这一点直接相关的内容，其余退为背景——**不是把视野变小，是把噪音切掉**。",
    "选中后按 F 聚焦，再按 F 回到全景。");
  const c1Expand=makeNode(c1,"展开 E：内容完整出现",460,40,"#6b73cc",c1Focus,
    "## 展开\n\n节点上按 E——文字多时，展开区域完整呈现内容，不裁断中间。\n\n节点和附件都支持形变展开。附件先以卡片存在，阅读时才展开为阅读区。",
    "E 键展开/收起。");
  const c1Immersive=makeNode(c1,"沉浸 F11：无干扰浏览",460,160,"#7890e5",c1Expand,
    "## 沉浸\n\n隐藏顶栏和侧栏，画布占满窗口。\n\n适合：长时间阅读、展示汇报、专注梳理。",
    "F11 切换沉浸。");
  /* ── Slogan 便签 ── */
  makeNote(c1,"# 织连万象，见聚一隅\n\n织 ↔ 见（动词对仗）\n连 ↔ 聚（动作对仗）\n万象 ↔ 一隅（广度 ↔ 精微）\n\n**Weave the many, See the one.**\n\n品牌名 Weave & Vision = 织（连接）+ 见（聚焦）",40,-340,"#fef3c7",320,160,"Slogan 和品牌名的含义。");
  /* ── 概念图附件（展开状态）── */
  const c1Concept=makeFileCard(c1,conceptFile,280,200,230,145,"用一张概念图把织与见的关系先看清。",true);
  /* ── 快速上手卡 ── */
  const c1Start=makeFileCard(c1,quickstartFile,-120,380,220,58,"一分钟上手的 Markdown 卡。");
  /* ── 关系（含线权重）── */
  relate(c1,c1Elements,c1Lines,"related","元素通过连接，才会成为网的一部分");
  relate(c1,c1Lines,c1Focus,"causes","清晰关系帮助聚焦","emphasis");
  relate(c1,c1Focus,c1Expand,"supports","聚焦后展开看详情","emphasis");
  relate(c1,c1Expand,c1Immersive,"causes","展开后可沉浸阅读");
  relate(c1,c1Concept,c1Root,"evidence","概念图：连接与聚焦","highlight");
  relate(c1,c1Start,c1Elements,"evidence","快速上手指南");

  /* ═══════════════════════════════════════════════════════════
     画布二：聚焦类功能
     布局：logic
     每种元素类型 = 一种展开机制
  ═══════════════════════════════════════════════════════════ */
  const c2Root=makeNode(c2,"聚焦类功能：看清与看全",-10,-280,"#2d5fd3",null,
    "# 看清与看全\n\n画布越大，越需要切换视角。\n\n**F 聚焦**：沉浸进一个点，只看它和直接关系。\n**Y 全景**：回到全貌，所有元素回到视野。\n\n两种视角，一次按键切换。",
    "F 聚焦，Y 全景。");
  const c2Focus=makeNode(c2,"F 聚焦：只留直接关系",-460,-100,"#6b73cc",c2Root,
    "## 聚焦单点\n\n选中一个元素，按 F——只留下与它直接相关的节点、连线和批注，其余退为背景。\n\n**不是把视野变小，是把噪音切掉。**\n\n聚焦模式下，HUD 显示当前焦点和直接关系数量。",
    "再按 F 回到全貌。");
  const c2FitAll=makeNode(c2,"Y 全景：回到全貌",230,-100,"#319b77",c2Root,
    "## 全景\n\n按 Y——画布自动缩放，让所有元素回到视野中。\n\n适合：从聚焦切回全貌、初次打开画布时定位、切换画布后重新定位。",
    "Y 键回到全景。");
  const c2Expand=makeNode(c2,"E 展开：节点详情就地展开",230,40,"#6b73cc",c2Root,
    "## 就地展开\n\n选中节点按 E——节点就地展开为详情阅读区，显示完整的 Markdown 内容。\n\n**形变**是织见的标志性能力：元素在原位变形，不弹窗、不跳转，上下文不丢失。\n\n展开是多实例的——可以同时展开多个节点，互不打断，逐个按 E 收起。",
    "E 键展开/收起节点。");
  const c2Morph=makeNode(c2,"形变：附件卡片 → 阅读区",230,180,"#319b77",c2Root,
    "## 附件形变\n\n附件以紧凑卡片形态存在。需要细看时，点击展开——卡片就地变形为预览面板，显示文件内容。\n\n支持的格式：Markdown、纯文本、图片（含 SVG）、PDF、Office 文档、网页链接。\n\n**每种元素类型对应一种展开机制：**\n- mindNode → E 键展开详情\n- fileCard → 点击形变预览",
    "点击附件卡片展开预览。");
  const c2Immersive=makeNode(c2,"F11 沉浸：无干扰浏览",-460,180,"#7890e5",c2Root,
    "## 沉浸模式\n\n隐藏顶栏和侧栏，画布占满整个窗口。\n\n适合：长时间阅读、展示汇报、专注梳理。\n\n配合聚焦使用效果最佳：先 F 聚焦，再 F11 沉浸。",
    "F11 切换沉浸。");
  const c2Jump=makeNode(c2,"J 跃迁：跨画布继续",-460,40,"#319b77",c2Root,
    "## 跃迁\n\n一条线索在当前画布讲不完？按 J 跃迁到另一张画布继续。\n\n跃迁让知识不困在一张画布里。每个元素都可以设置跃迁目标。\n\n> 本画布的节点已设置跃迁到其他画布，选中后按 J 试试。",
    "J 键跃迁到目标画布。");
  /* ── 演示附件（展开状态）── */
  const c2Card=makeFileCard(c2,quickstartFile,230,310,230,145,"展开的附件预览——这就是形变。",true);
  /* ── 便签 ── */
  makeNote(c2,"## 聚焦的使用场景\n\n1. 画布只有 10 个元素 → 不需要聚焦\n2. 画布有 50+ 元素 → 聚焦帮你快速定位\n3. 画布有 100+ 元素 → 聚焦是必需品\n\n> 图越大，聚焦越重要。",230,-280,"#dbeafe",300,130,"聚焦解决「东西多找人乱」的痛点。");
  /* ── 关系 ── */
  relate(c2,c2Focus,c2FitAll,"related","聚焦与全景是两种视角");
  relate(c2,c2Focus,c2Expand,"supports","聚焦后展开看详情","emphasis");
  relate(c2,c2Expand,c2Morph,"causes","展开理念延伸到附件","emphasis");
  relate(c2,c2Expand,c2Immersive,"causes","展开后可沉浸阅读");
  relate(c2,c2Card,c2Morph,"evidence","这个附件本身就是形变的演示","highlight");
  /* ── 跃迁设置（跨画布）── */
  c2Focus.jumpTo={canvasId:c1.id,itemId:c1Focus.id};
  c2Expand.jumpTo={canvasId:c5.id,itemId:null};
  c2Morph.jumpTo={canvasId:c6.id,itemId:null};
  c2Jump.jumpTo={canvasId:c8.id,itemId:null};

  /* ═══════════════════════════════════════════════════════════
     画布三：连接类功能
     布局：logic
     五种语义关系 + 线权重 + 线型 + 布局
  ═══════════════════════════════════════════════════════════ */
  const c3Root=makeNode(c3,"连接类功能：线说什么",-10,-300,"#2d5fd3",null,
    "# 线说什么\n\n普通导图的线只是「从属」——A 是 B 的子项。\n\n织见的线有五种语义。每一种都代表一种判断：A 和 B 到底是什么关系？\n\n线还有权重和线型——不只是视觉，是信息层级。",
    "线是判断，不是装饰。");
  const c3Relate=makeNode(c3,"关联：有关，暂不确定方向",-520,-120,"#319b77",c3Root,
    "## 关联（无向）\n\n「A 和 B 有关系，但现在还不确定是什么关系。」\n\n用在你还在探索、还没下判断的时候。",
    "关联是「待定」标签。");
  const c3Support=makeNode(c3,"支撑：A 支持 B",-520,20,"#319b77",c3Root,
    "## 支撑（有向）\n\n「财务指标改善」 →支撑→ 「增长驱动力」\n\nA 提供理由让你更相信 B。",
    "支撑是论证链条上的环节。");
  const c3Cause=makeNode(c3,"导致：A 促使 B 发生",200,-120,"#d78f36",c3Root,
    "## 导致（有向）\n\n「需求爆发」 →导致→ 「产能扩张」\n\n不只是相关，是因果——A 是 B 发生的原因。",
    "导致比支撑更强：不只是支持，是驱动力。");
  const c3Contradict=makeNode(c3,"反证：A 与 B 矛盾",200,20,"#c04a2a",c3Root,
    "## 反证（有向）\n\n「客户集中度过高」 →反证→ 「商业可持续」\n\nA 和 B 矛盾。不是否定 B，而是标出需要解决的张力。",
    "反证不等于否定——它标出需要验证的张力。");
  const c3Evidence=makeNode(c3,"证据：A 是 B 的来源",200,160,"#7a55c0",c3Root,
    "## 证据（有向）\n\n「行业研究报告」 →证据→ 「市场空间测算」\n\nA 是 B 这个判断的事实依据。",
    "证据是「出处」——让判断可追溯。");
  const c3Level=makeNode(c3,"线权重：normal / emphasis / highlight",-520,160,"#5270d8",c3Root,
    "## 线权重\n\n- **normal**：普通线——默认\n- **emphasis**：加粗——重要论证路径\n- **highlight**：高亮——核心论点链\n\n线权重让读者一眼看到哪些线是关键论证。",
    "选中线后可切换权重。");
  const c3Shape=makeNode(c3,"线型：auto / curve / polyline / straight",200,300,"#5270d8",c3Evidence,
    "## 线型\n\n- **auto**：跟随布局类型（默认）\n- **curve**：S 形曲线\n- **polyline**：折线（圆角正交）\n- **straight**：直线\n\n可按需覆盖布局默认线型。",
    "线型可在选中线后设置。");
  /* ── 便签 ── */
  makeNote(c3,"## 实战示例\n\n「政策推动」 →导致→ 「低轨星座部署」\n「卫星需求」 →支撑→ 「运载市场增长」\n「发射失败率」 →反证→ 「供给可靠性」\n「公开数据」 →证据→ 「市场空间测算」\n\n> 每条线都是一句判断。",-520,300,"#fef3c7",300,140,"用真实语义连接，而非堆砌节点。");
  /* ── 语义关系速查卡（展开状态）── */
  const c3RelationCard=makeFileCard(c3,relationFile,200,-300,260,145,"五种语义关系 + 线权重 + 线型速查表。",true);
  /* ── 关系（展示不同线权重和线型）── */
  relate(c3,c3Relate,c3Support,"related","关联可以细化为支撑");
  relate(c3,c3Support,c3Cause,"related","支撑是论证，导致是因果","emphasis","polyline");
  relate(c3,c3Contradict,c3Support,"contradicts","反证与支撑形成张力","emphasis");
  relate(c3,c3Evidence,c3Support,"evidence","证据支撑判断","highlight");
  relate(c3,c3Level,c3Shape,"related","权重和线型是线的两个属性");
  relate(c3,c3RelationCard,c3Root,"evidence","语义关系速查表","highlight");

  /* ═══════════════════════════════════════════════════════════
     画布四：美观性
     布局：logic
     昼夜主题 / 背景色 / 纹理 / 样式 / 字体 / Win11 设计
  ═══════════════════════════════════════════════════════════ */
  const c4Root=makeNode(c4,"美观性：阅读氛围",-10,-280,"#2d5fd3",null,
    "# 阅读氛围\n\n织见的视觉不是装饰，是**阅读体验的基础设施**。\n\n基于 Windows 11 Fluent Design 的材质方法论，底层统一、表层因内容而变。",
    "材质是地板，不是天花板。");
  const c4Theme=makeNode(c4,"昼夜主题：自动跟随系统",-460,-120,"#2d5fd3",c4Root,
    "## 昼夜主题\n\n默认**自动跟随系统**——系统切到深色，织见跟着切。\n\n手动切换只是临时覆盖，下次启动依然跟随系统。\n\n设置面板可关闭自动跟随。",
    "默认 autoTheme = true。");
  const c4BgColor=makeNode(c4,"背景底色：默认 / 护眼 / 米白 / 浅蓝 / 牛皮纸",-460,40,"#319b77",c4Root,
    "## 背景底色\n\n五种底色，各自带一套漂移光晕基调（neutral / warm / cool / green）：\n\n- **默认**：中性灰蓝\n- **护眼**：柔绿\n- **米白**：暖米色\n- **浅蓝**：冷青蓝\n- **牛皮纸**：暖纸色\n\n每种底色都有昼/夜两套配色。",
    "色系决定漂移色的基调。");
  const c4Texture=makeNode(c4,"背景纹理：grid / dots / paper / blank",230,-120,"#319b77",c4Root,
    "## 背景纹理\n\n四种纹理叠加在底色之上：\n\n- **grid**：网格线\n- **dots**：圆点阵\n- **paper**：纸纹\n- **blank**：纯色无纹理\n\n纹理是 L4 层，在 Mica 和噪点之上。",
    "纹理在设置面板切换。");
  const c4Style=makeNode(c4,"七种样式预设",230,40,"#6b73cc",c4Root,
    "## 样式预设\n\n| 样式 | 特点 |\n|---|---|\n| clear | 清晰层级（默认） |\n| glass | 磨砂玻璃 |\n| neumorph | 新拟态 |\n| minimal | 简约 |\n| colorful | 多彩拟态 |\n| bento | 多彩圆角 |\n| editorial | 杂志排版 |\n\n样式驱动 Chrome 层的视觉规则。",
    "样式 = Chrome 层变体。");
  const c4Font=makeNode(c4,"字体预设",230,180,"#7890e5",c4Style,
    "## 字体\n\n13 种字体预设可选，涵盖中英文与手写风格（含本地内嵌手写字体，离线可用）。\n\n部分样式会自动切换字体：minimal → serif。",
    "在设置面板切换字体。");
  const c4Win11=makeNode(c4,"Win11 Fluent Design 理念",-460,180,"#2d5fd3",c4Root,
    "## Win11 Fluent Design\n\n织见的视觉方法论源自 Windows 11 的 Fluent Design System：\n\n- **材质层叠**：七层从底到顶，各司其职\n- **内容为主**：Chrome 退让，内容突出\n- **连贯表面**：Mica 半透明质感连接不同区域\n- **光影一致**：统一光源，一致的阴影方向",
    "Fluent Design 是织见的视觉基因。");
  /* ── 材质系统便签 ── */
  makeNote(c4,"## 七层堆叠\n\nL1 漂移色 → L2 Mica → L3 噪点 → L4 纹理 → L5 画布 → L6 节点 → L7 Chrome\n\n> 底层统一（L1-L4），表层因内容而变（L5-L7）。",-460,300,"#dbeafe",360,140,"材质系统方法论。");
  /* ── 材质系统文档附件（展开状态）── */
  const c4Material=makeFileCard(c4,materialFile,230,-280,260,145,"Win11 Fluent 材质系统完整说明。",true);
  /* ── 关系 ── */
  relate(c4,c4Theme,c4BgColor,"supports","主题和色系共同决定底色");
  relate(c4,c4BgColor,c4Texture,"related","色系和纹理叠加");
  relate(c4,c4Style,c4Font,"related","样式可联动字体");
  relate(c4,c4Win11,c4Theme,"causes","Fluent 理念驱动主题方案","emphasis");
  relate(c4,c4Material,c4Win11,"evidence","材质系统文档","highlight");
  /* ── 跃迁 ── */
  c4Style.jumpTo={canvasId:c1.id,itemId:c1Root.id};

  /* ═══════════════════════════════════════════════════════════
     画布五：案例——一级市场投资分析
     布局：fishbone
     typed relations + 展开节点 + 强调线 + 形变附件
  ═══════════════════════════════════════════════════════════ */
  const c5Root=makeNode(c5,"案例：一级市场投资分析",-850,-15,"#d78f36",null,
    "# 一级市场投资分析\n\n展示织见如何用 typed relations 组织投资判断。\n\n**核心判断 → 支撑/反证/证据 → 不确定项**\n\n每条线都是可追溯的论证环节。",
    "织见的 typed relations 就是投资论证语言。");
  const c5Thesis=makeNode(c5,"核心判断：低轨星座驱动运载市场增长",-500,-15,"#d78f36",c5Root,
    "## 核心判断\n\n「低轨星座部署驱动运载市场进入增长周期」\n\n一个判断。接下来要问：\n- 什么支撑它？\n- 什么反对它？\n- 证据在哪？\n- 什么还不确定？",
    "尽调的核心是判断，不是资料。");
  const c5Support=makeNode(c5,"支撑：发射成本下降 + 订单增长",-200,-200,"#319b77",c5Thesis,
    "## 支撑判断\n\n「头部企业发射成本下降 40%，订单量同比增长」\n\n→支撑→ 核心判断\n\n成本下降和订单增长共同支撑增长判断。",
    "支撑是论证链条的环节。");
  const c5Contradict=makeNode(c5,"反证：客户集中度过高",150,200,"#c04a2a",c5Thesis,
    "## 反证\n\n「前三大客户占比 75%，续约率未公开」\n\n→反证→ 商业可持续性\n\n不是否定，是标出需要验证的张力。",
    "反证标出需要验证的张力。");
  const c5Evidence=makeNode(c5,"证据：行业研究报告",-200,200,"#7a55c0",c5Thesis,
    "## 证据\n\n「2024 行业报告：全球发射次数 260+，低轨占比 60%」\n\n→证据→ 增长驱动力",
    "证据让判断可追溯。");
  const c5Uncertain=makeNode(c5,"不确定：大客户续约率",150,-200,"#7a55c0",c5Thesis,
    "## 不确定\n\n「大客户续约率未公开，待验证」\n\n不确定的内容用便签标记，不混入判断。",
    "不确定的内容用便签标记。");
  /* ── 便签 ── */
  makeNote(c5,"## 板 → 文：投资建议书\n\n织见的终极能力：把关系板结构转化为 Markdown 投资建议书。\n\n- 节点结构 = 建议书框架\n- 形变内容 = 建议书段落\n- 语义关系 = 论证逻辑\n\n**画板即建议书骨架。**",500,-200,"#fef3c7",300,160,"板→文是织见的第四个定位轴。");
  makeNote(c5,"## 织见的四个定位轴\n\n1. **就地形变**：节点展开变成阅读区（护城河）\n2. **语义连接**：typed relations = 投资论证语言\n3. **聚焦切换**：全貌与单点之间切换\n4. **板→文导出**：关系板 → 投资建议书\n\n> AI 是辅助，不是卖点。",-850,-250,"#dbeafe",350,150,"四个定位轴。");
  /* ── DD 模板附件（展开状态）── */
  const c5DDCard=makeFileCard(c5,ddFile,500,100,260,145,"DD 尽调关系板模板——展开查看。",true);
  const c5BrandCard=makeFileCard(c5,brandFile,-850,180,220,58,"织见品牌宣言。");
  /* ── 关系（含线权重和线型）── */
  relate(c5,c5Support,c5Thesis,"supports","财务改善支撑增长判断","emphasis");
  relate(c5,c5Contradict,c5Thesis,"contradicts","客户集中反证商业可持续","emphasis");
  relate(c5,c5Evidence,c5Thesis,"evidence","行业报告是增长判断的来源","highlight");
  relate(c5,c5Uncertain,c5Contradict,"supports","续约率不确定加强反证力度");
  relate(c5,c5DDCard,c5Root,"evidence","DD 尽调模板","highlight");
  relate(c5,c5BrandCard,c5Root,"evidence","品牌宣言");
  /* ── 跃迁到案例2 ── */
  c5Root.jumpTo={canvasId:c6.id,itemId:null};

  /* ═══════════════════════════════════════════════════════════
     画布六：案例——行业研究展示
     布局：timeline
     时间轴排版，展示用
  ═══════════════════════════════════════════════════════════ */
  const c6Root=makeNode(c6,"案例：行业研究展示",-10,-300,"#2d5fd3",null,
    "# 行业研究展示\n\n用时间轴布局展示行业演进路径，适合汇报和展示场景。\n\n时间轴 = 水平主干 + 垂直支线，按时间顺序排列。",
    "timeline 布局适合展示。");
  const c6Phase1=makeNode(c6,"2015-2019：技术验证期",-650,-100,"#319b77",c6Root,
    "## 技术验证\n\n- 首批低轨星座计划公布\n- 可回收火箭技术验证\n- 商业发射成本开始下降",
    "技术验证阶段。");
  const c6Phase2=makeNode(c6,"2020-2023：商业化起步",-300,-100,"#5270d8",c6Root,
    "## 商业化起步\n\n- 星座组网加速\n- 商业发射服务公司涌现\n- 监管框架逐步建立",
    "商业化阶段。");
  const c6Phase3=makeNode(c6,"2024-2026：规模化部署",50,-100,"#d78f36",c6Root,
    "## 规模化部署\n\n- 低轨星座进入密集部署期\n- 发射频次显著提升\n- 地面应用开始变现",
    "规模化阶段。");
  const c6Phase4=makeNode(c6,"2027+：应用爆发期",400,-100,"#c04a2a",c6Root,
    "## 应用爆发\n\n- 遥感数据产品化成熟\n- 通信服务覆盖偏远地区\n- 行业进入盈利验证期",
    "应用爆发阶段。");
  /* ── 子节点 ── */
  ["可回收火箭","星座计划公布"].forEach((t,i)=>makeNode(c6,t,-650,60+i*80,"#319b77",c6Phase1,"","技术验证期。"));
  ["组网加速","监管框架"].forEach((t,i)=>makeNode(c6,t,-300,60+i*80,"#5270d8",c6Phase2,"","商业化起步。"));
  ["密集部署","发射频次提升"].forEach((t,i)=>makeNode(c6,t,50,60+i*80,"#d78f36",c6Phase3,"","规模化部署。"));
  ["遥感数据产品化","通信服务覆盖"].forEach((t,i)=>makeNode(c6,t,400,60+i*80,"#c04a2a",c6Phase4,"","应用爆发。"));
  /* ── 便签 ── */
  makeNote(c6,"## 展示技巧\n\n1. **F11 沉浸模式**：隐藏 UI，画布占满窗口\n2. **E 展开**：逐个展开节点详情做讲解\n3. **形变附件**：展开行业报告做证据展示\n4. **聚焦 F**：讲到某个阶段时聚焦展示",50,-280,"#dbeafe",360,130,"展示汇报的最佳实践。");
  /* ── 公开口径附件 ── */
  const c6IndustryCard=makeFileCard(c6,industryFile,400,-280,240,58,"公开研究口径说明。");
  /* ── 关系（时间轴用 supports 表示演进）── */
  relate(c6,c6Phase1,c6Phase2,"causes","技术验证推动商业化","emphasis");
  relate(c6,c6Phase2,c6Phase3,"causes","商业化进入规模化","emphasis");
  relate(c6,c6Phase3,c6Phase4,"causes","规模化带来应用爆发","highlight");
  relate(c6,c6IndustryCard,c6Root,"evidence","公开信息研究口径");
  /* ── 跃迁回案例1 ── */
  c6Root.jumpTo={canvasId:c5.id,itemId:c5Thesis.id};

  /* ───────────────────────────────────────────────────────────
     画布七：AI 功能
     布局：logic
     两个方向：操作画布 / 读取导出
  ═══════════════════════════════════════════════════════════ */
  const c7Root=makeNode(c7,"织见的 AI 能力",-10,-280,"#2d5fd3",null,
    "# AI 能力\n\n织见与 AI 的交互有两个方向：\n\n1. **AI 操作画布**：AI 通过 ZhijianAI 接口在应用内创建节点、连线、布局\n2. **AI 读取 .fantin**：AI 解析导出文件，读取关系网络和附件，生成报告\n\n设置 → AI 设置里可导出完整指引。",
    "AI 双向交互。");
  const c7Operate=makeNode(c7,"AI 操作画布",-460,-100,"#319b77",c7Root,
    "## AI 操作画布\n\n通过 `window.ZhijianAI` 接口（37 个命令）：\n\n- 创建节点、便签、附件\n- 建立语义连线（关联/支撑/导致/反证/证据）\n- 切换布局和样式\n- 批量构建（buildCanvas）\n- 形变/展开控制\n\n**场景**：AI 根据文档/报告自动构建思维关系板。",
    "37 个操作命令。");
  const c7Report=makeNode(c7,"AI 读取 .fantin",230,-100,"#319b77",c7Root,
    "## AI 读取 .fantin 生成报告\n\n导出 .fantin 文件后发给 AI：\n\n1. AI 解压（ZIP 格式）\n2. 读 data.json（关系网络）\n3. 读附件内容（Markdown 全文）\n4. 按关系结构组织报告\n5. 输出带超链接 + 数据来源标注的报告\n\n**素材边界铁律**：AI 可联网辅助理解，但报告内容只能来自 .fantin。",
    "导出 → AI → 报告。");
  const c7Howto=makeNode(c7,"如何使用",-460,80,"#d78f36",c7Root,
    "## 使用步骤\n\n1. 在画布上构建关系板（节点 + 连线 + 附件）\n2. 导出 → .fantin 文件\n3. 设置 → AI 设置 → 复制指引到剪贴板\n4. 将指引 + .fantin 文件发给任意 AI\n5. AI 生成报告（含超链接和来源标注）\n\n**兼容性**：ZCode 自动发现 skill；其他 agent 粘贴指引即可。",
    "三步上手。");
  makeNote(c7,"## 素材边界铁律\n\nAI 可联网查资料辅助理解，\n但报告内容只能来自\n.fantin 的 data.json + 附件。\n\n每条数据标注来源。\n\n外部知识不可写入报告。",230,80,"#fef3c7",260,160,"核心原则。");
  relate(c7,c7Operate,c7Report,"related","两个方向互补");
  relate(c7,c7Howto,c7Root,"evidence","使用步骤","","highlight");
  c7Root.jumpTo={canvasId:c1.id,itemId:c1Root.id};

  /* ═══════════════════════════════════════════════════════════
     画布八：现状与规划
     布局：logic
     已完成 / 待优化 / 待开发
  ═══════════════════════════════════════════════════════════ */
  const c8Root=makeNode(c8,"织见：现状与规划",-10,-280,"#2d5fd3",null,
    "# 现状与规划\n\n织见从 2024 年概念诞生到现在，经历了 C1–K2 多个版本迭代，已发布 v0.7.1。\n\n这里记录已完成的工作、正在优化的问题、以及未来规划。",
    "持续迭代中。");
  const c8Done=makeNode(c8,"已完成：C1–K2",-460,-100,"#319b77",c8Root,
    "## 已完成里程碑\n\n- **C1–C8**：基础画布、节点、连接、便签、附件\n- **C9–C12**：形变展开、语义关系、布局系统\n- **C13**：精简重构，移除展开内容（将回归）\n- **E5**：Win11 Fluent Design 材质系统\n- **F1–F19**：七种样式预设、背景纹理、漂移色、Mica\n- **G1–G12**：桌面应用（Electron）、导入导出（.fantin）、自动主题、AI 接口 v1.3、任务栏图标、版权声明、形变 Bug 修复\n- **H1–H5**：性能优化（撤销栈/位图生命周期/渲染节流）、Web 预览机制、安全加固\n- **I5–I9**：v0.5.0–0.5.2 发布——第三方库本地化、PDF/Word 预览修复、安装版优化、导出图片修复\n- **J1–J4**：v0.6.0–0.6.3——路径优化（i6→src）、性能 LOD 降级渲染、流光效果三层独立游动、Alt+Enter 全屏、Excel 暗色模式\n- **K1–K2**：v0.7.0–0.7.1——AI skill 集成（操作画布 + 读 .fantin 生成报告）、skill 自动安装、合并指引",
    "核心功能已完成，已发布桌面安装版。");
  const c8Optimize=makeNode(c8,"待优化",230,-100,"#d78f36",c8Root,
    "## 待优化\n\n- 性能优化中阶任务（H2/H3 待续）\n- 玻璃样式绿带问题（已搁置）\n- SVG 矢量导出（已搁置）\n- Web 预览兼容性（部分站点禁止嵌入）",
    "持续打磨中。");
  const c8Develop=makeNode(c8,"待开发",-460,80,"#6b73cc",c8Root,
    "## 待开发\n\n- **AI 自主画板构建**：利用 typed relations + morph 自动画板\n- **OPML 导出**：标准格式互通\n- **更多预览格式**：扩展 PPT/PDF/Word 之外\n- **形变机制深化**：mind-node 展开的精简实现",
    "下一阶段重点。");
  const c8Position=makeNode(c8,"竞争定位",230,80,"#7a55c0",c8Root,
    "## 定位\n\n- **就地形变**：节点展开 → 阅读区\n- **语义连接**：typed relations = 投资论证语言\n- **聚焦切换**：全貌与单点\n- **板→文导出**：关系板 → 投资建议书\n\n> AI 是辅助，不是卖点。",
    "差异化定位。");
  /* ── 路线图附件（展开状态）── */
  const c8Roadmap=makeFileCard(c8,roadmapFile,230,-280,260,145,"完整路线图——展开查看。",true);
  /* ── 品牌宣言 ── */
  const c8Brand=makeFileCard(c8,brandFile,-460,-280,220,58,"织见品牌宣言。");
  /* ── 便签 ── */
  makeNote(c8,"## 版本命名规则\n\n- **C** 系列：Canvas（画布功能）\n- **E** 系列：Experience（材质体验）\n- **F** 系列：Fluent（样式预设）\n- **G** 系列：Desktop（桌面应用）\n- **H** 系列：Hardening（体检加固）\n- **I** 系列：Installer（安装集成）\n- **J** 系列：Journey（性能与体验优化）\n- **K** 系列：Knowledge（AI 能力集成）\n\n> 每个大版本 = 一个完整的能力域。",-460,220,"#dbeafe",360,170,"版本命名逻辑。");
  /* ── 关系 ── */
  relate(c8,c8Done,c8Optimize,"causes","已完成才知待优化");
  relate(c8,c8Optimize,c8Develop,"related","待优化和待开发并行推进");
  relate(c8,c8Position,c8Done,"evidence","定位由已完成功能支撑","emphasis");
  relate(c8,c8Roadmap,c8Root,"evidence","完整路线图","highlight");
  relate(c8,c8Brand,c8Root,"evidence","品牌宣言");
  /* ── 跃迁回总览 ── */
  c8Root.jumpTo={canvasId:c1.id,itemId:c1Root.id};

  /* ── 设置活动画布的节点展开状态 ── */
  state.activeProjectId=state.projects.some(p=>p.id===previousProject)?previousProject:project.id;
  const ap=curProject();
  state.activeCanvasId=ap&&ap.canvases.some(c=>c.id===previousCanvas)?previousCanvas:(ap&&ap.canvases[0]&&ap.canvases[0].id);
  state.selected=null;

  /* expandedDetailIds：展开活动画布（c1）的核心节点，展示就地展开效果 */
  if(state.activeCanvasId===c1.id){
    /* G6: 多实例展开 — Set 替代单值，用 add 而非赋值 */
    expandedDetailIds.add(c1Root.id);
  }

  /* ── 首次打开自动框选 ── */
  const frameCanvas=canvas=>{
    const items=canvas.items||[];if(!items.length)return;
    const left=Math.min(...items.map(i=>i.x)),top=Math.min(...items.map(i=>i.y));
    const right=Math.max(...items.map(i=>i.x+(i.w||156))),bottom=Math.max(...items.map(i=>i.y+(i.h||44)));
    const pad=100,wW=Math.max(1,right-left),hW=Math.max(1,bottom-top);
    const z=clamp(Math.min((Math.max(900,W)-pad*2)/wW,(Math.max(620,H)-pad*2)/hW),.32,.9);
    canvas.camera={x:left-(Math.max(900,W)/z-wW)/2,y:top-(Math.max(620,H)/z-hW)/2,zoom:z};
  };
  [c1,c2,c3,c4,c5,c6,c7,c8].forEach(frameCanvas);

  syncUid();return true;
}
