"use strict";
/* ============================================================
   常量
============================================================ */
const FONT_PRESETS={
  clear:{label:"界面雅黑",stack:'"Microsoft YaHei UI","PingFang SC","Noto Sans SC","Segoe UI",sans-serif'},
  serif:{label:"书卷宋体",stack:'"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif'},
  handwritten:{label:"手写楷体",stack:'"LXGW WenKai","WX-Kalam","WX-Indie","KaiTi","STKaiti",serif'},
  artistic:{label:"艺术手写",stack:'"STXingkai","FZShuTi","STKaiti","KaiTi",cursive'},
  manrope:{label:"Manrope",stack:'"Manrope","Noto Sans SC","PingFang SC",sans-serif'},
  bricolage:{label:"Bricolage",stack:'"Bricolage Grotesque","Noto Sans SC","PingFang SC",sans-serif'},
  sora:{label:"Sora",stack:'"Sora","Noto Sans SC","PingFang SC",sans-serif'},
  outfit:{label:"Outfit",stack:'"Outfit","Noto Sans SC","PingFang SC",sans-serif'},
  archivo:{label:"Archivo",stack:'"Archivo","Noto Sans SC","PingFang SC",sans-serif'},
  spaceMono:{label:"Space Mono",stack:'"Space Mono","Geist Mono","Consolas",monospace'},
  ibm:{label:"IBM Plex",stack:'"IBM Plex Sans","Noto Sans SC","PingFang SC",sans-serif'},
  syne:{label:"Syne",stack:'"Syne","Noto Sans SC","PingFang SC",sans-serif'},
  epilogue:{label:"Epilogue",stack:'"Epilogue","Noto Sans SC","PingFang SC",sans-serif'},
};
let FONT=FONT_PRESETS.serif.stack;
const BRAND_FONT='"STKaiti","KaiTi","Noto Serif SC","Source Han Serif SC",serif';
const MONO_STACK='"Geist Mono","SF Mono","Cascadia Mono","Consolas",ui-monospace,monospace';
const TOPBAR_H=50;
const NOTE_COLORS=["#fef3c7","#d1fadf","#dbeafe","#fde2e2","#ede4ff","#ccfbf1","#f5f5f4"];
const LINE_COLORS=["#3a4a6b","#c94a3e","#e0882a","#1fa06a","#2d5fd3","#7a55c0","#9090a0"];
const MIND_COLORS=["#2d5fd3","#3a4a6b","#1fa06a","#7a55c0","#e0882a","#c94a3e"];
const DEFAULT_NOTE_COLOR="#fef3c7";
const DEFAULT_LINE_COLOR="#6e7080";
/* ============================================================
   全局样式系统 — 4 套风格（思维导图节点 + 附件卡片统一）
   依据 2025 设计趋势：玻璃拟态 / 拟物纸感 / 新拟态 / 清晰扁平
============================================================ */
const STYLE_PRESETS={
  clear:{label:"默认",desc:"清晰层级，统一卡片语言"},
  glass:{label:"玻璃",desc:"带厚度的磨砂玻璃与冷光连线"},
  minimal:{label:"简约",desc:"极简边框，字号/颜色分层"},
  neumorph:{label:"新拟态",desc:"连续表面、双向柔影与内凹按压"},
  colorful:{label:"多彩拟态",desc:"彩色表面与柔和阴影，鲜活而有质感"},
  bento:{label:"多彩圆角",desc:"超圆角卡片与悬浮微交互"},
  editorial:{label:"多彩矩形",desc:"小圆角卡片与杂志排版，书卷质感"},
}
const STYLE_ALIAS={fluent:"glass"};   /* 兼容旧存档：Fluent 质感 → 玻璃 */
const DEFAULT_STYLE="clear";

/* ============================================================
   F1 材质系统 — 变体映射 + 统一底色
   每个预设归属一个材质变体，chrome 规则按变体绑定（不再逐预设 !important）
   变体: fluent(分层材质/漂移/渐变) / neumorph(静默均匀/柔影) / minimal(反材质/平实)
============================================================ */
const VARIANT_MAP={
  clear:"fluent",
  glass:"fluent",
  bento:"fluent",
  editorial:"fluent",
  neumorph:"neumorph",
  colorful:"neumorph",
  minimal:"minimal",
};
function variantOf(key){return VARIANT_MAP[key]||"fluent";}

/* 统一底色函数 — 替代原先散落在 4 处的 _BCM 副本
   底色牵引漂移色板: 底色色族决定漂移色族方向 */
function getBgColor(name,dark){
  const m={
    default:dark?"#1a1a2e":"#ffffff",
    eye:dark?"#1a2a1e":"#c8e6c9",
    cream:dark?"#2a2a20":"#fff8e1",
    blue:dark?"#1a2030":"#e3f2fd",
    kraft:dark?"#2a2218":"#f4ecd8",
  };
  return m[name]||m.default;
}
/* 底色→漂移色族映射（L1 漂移色板跟随底色色族，避免漂移色与底色打架） */
function driftFamilyOf(bgName){
  return {default:"neutral",eye:"green",cream:"warm",blue:"cool",kraft:"warm"}[bgName]||"neutral";
}
/* 返回当前风格的关键视觉参数（统一供节点/卡片/连线查询） */
function styleCfg(){
  const s=state.stylePreset||DEFAULT_STYLE;
  const dark=state.dark;
  if(s==="glass")return{
    id:"glass",
    nodeAlpha:1,
    nodeBlur:0,
    borderAlpha:dark?.5:.45, /* 玻璃厚边 */
    borderColor:dark?"rgba(255,255,255,.6)":"rgba(255,255,255,.95)",
    shadowBlur:dark?30:28, shadowAlpha:dark?.5:.2,
    innerGlow:dark?.22:.68,  /* 强顶部高光，玻璃反光 */
    radius:16,              /* 大圆角 */
    linkStyle:"glass",
    linkAlpha:.7,
    linkWidth:1.05,
    fontScale:1,
    outlined:true,
    glass:true,             /* 玻璃专属：底部反光条 */
  };
  if(s==="neumorph")return{id:"neumorph",nodeAlpha:1,nodeBlur:0,borderAlpha:0,borderColor:"transparent",shadowBlur:dark?16:18,shadowAlpha:dark?.55:.5,innerGlow:0,radius:14,linkStyle:"clean",linkAlpha:.3,linkWidth:.8,fontScale:1.02,outlined:false,neumorph:true,fontPreset:"serif"};
  if(s==="colorful")return{id:"colorful",nodeAlpha:1,nodeBlur:0,borderAlpha:dark?.15:.18,borderColor:dark?"rgba(255,255,255,.15)":"rgba(0,0,0,.1)",shadowBlur:dark?16:14,shadowAlpha:dark?.4:.3,innerGlow:dark?.2:.25,radius:16,linkStyle:"clean",linkAlpha:.5,linkWidth:1,fontScale:1.03,outlined:true,colorful:true};
  if(s==="bento")return{id:"bento",nodeAlpha:1,nodeBlur:0,borderAlpha:dark?.12:.15,borderColor:dark?"rgba(255,255,255,.12)":"rgba(0,0,0,.08)",shadowBlur:dark?14:12,shadowAlpha:dark?.25:.18,innerGlow:dark?.08:.12,radius:20,linkStyle:"clean",linkAlpha:.4,linkWidth:.9,fontScale:1.05,outlined:true,bento:true};
  if(s==="editorial")return{id:"editorial",nodeAlpha:1,nodeBlur:0,borderAlpha:dark?.2:.25,borderColor:dark?"rgba(255,240,220,.2)":"rgba(60,40,15,.25)",shadowBlur:dark?10:8,shadowAlpha:dark?.3:.2,innerGlow:dark?.1:.15,radius:4,linkStyle:"clean",linkAlpha:.5,linkWidth:1,fontScale:1.1,outlined:true,editorial:true,fontPreset:"serif"};
  if(s==="minimal")return{
    id:"minimal",
    nodeAlpha:.96,           /* 近实底，无装饰干扰 */
    nodeBlur:0,
    /* 简约不等于无边界：低层节点仍需在缩小时保持可辨识的轮廓。 */
    borderAlpha:dark?.18:.22,
    borderColor:dark?"rgba(255,255,255,.28)":"rgba(45,74,128,.26)",
    shadowBlur:5, shadowAlpha:dark?.12:.10,
    innerGlow:0,
    radius:4,                /* 微圆角，不喧宾夺主 */
    linkStyle:"clean",
    linkAlpha:.38,           /* 连线最淡，弱化装饰 */
    linkWidth:.75,           /* 更细线条 */
    fontScale:1.14,          /* 强字号分层：靠字体大小/粗细/颜色区分层级 */
    outlined:true,
    minimal:true,            /* 极简：细边框 + 字体层级 */
  };
  return{ /* clear 默认 */
    id:"clear",
    nodeAlpha:1,
    nodeBlur:0,
    borderAlpha:dark?.22:.28,
    borderColor:dark?"rgba(255,255,255,.3)":"rgba(45,74,128,.3)",
    shadowBlur:dark?12:10, shadowAlpha:dark?.22:.16,
    innerGlow:dark?.06:.12,
    radius:8,               /* 小圆角=利落 */
    linkStyle:"clean",
    linkAlpha:.55,
    linkWidth:1,
    fontScale:1,
    outlined:true,
  };
}
const RELATION_TYPES={
  related:{label:"关联",color:"#1fa06a",directional:false,dash:[]},
  supports:{label:"支撑",color:"#3a4a6b",directional:true,dash:[]},
  causes:{label:"导致",color:"#e0882a",directional:true,dash:[]},
  contradicts:{label:"反证",color:"#c94a3e",directional:true,dash:[6,4]},
  evidence:{label:"证据",color:"#7a55c0",directional:true,dash:[2,3]},
};

function kindOf(name){
  const ext=(name.split(".").pop()||"").toLowerCase();
  if(["png","jpg","jpeg","gif","svg","webp","bmp","ico","avif"].includes(ext)) return "img";
  if(ext==="pdf") return "pdf";
  if(["txt","md","csv","json","log","html","htm","xml","js","css","py","ts","mdx"].includes(ext)) return "text";
  if(["doc","docx"].includes(ext)) return "doc";
  if(["xls","xlsx"].includes(ext)) return "sheet";
  if(["ppt","pptx"].includes(ext)) return "slide";
  if(["mp3","wav","ogg","mp4","webm","mov"].includes(ext)) return "media";
  return "other";
}
const FILE_ICONS={
  img:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L10 19"/></svg>',
  pdf:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/><path d="M8.5 15.5h.01M12 15.5h2.5M8.5 12.5h.01M12 12.5h2.5"/></svg>',
  doc:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h8"/></svg>',
  sheet:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  slide:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M3 4h18v12H3z"/><path d="m9 19 3-3 3 3"/></svg>',
  text:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
  link:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  media:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>',
  other:'<svg class="ficon" viewBox="0 0 24 24" fill="none" stroke="#6e7080" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/></svg>',
};
const KIND_LABEL={img:"图片",pdf:"PDF",doc:"Word",sheet:"表格",slide:"演示",text:"文本",link:"链接",media:"音视频",other:"文件"};
/* CDN 预览组件配置（免费 CDN，非商用） */
const CDN={
  jszip:{url:"https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"},
  docx:{url:"https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js",dep:"jszip"},
  xlsx:{url:"https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"},
  pdfjs:{url:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"},
  /* 纯浏览器 PPTX → HTML 渲染器；仅解析本地文件，不上传文件内容。 */
  pptx:{url:"https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/dist/pptx-preview.umd.js"},
  pdfjsWorker:{url:"https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"},
};

