"use strict";
/* ============================================================
   DOM / 状态
============================================================ */
const board=document.getElementById("board");
const canvas=document.getElementById("canvas");
let ctx=canvas.getContext("2d");
const selbar=document.getElementById("selbar");
const noteEd=document.getElementById("noteEditor");
const noteFormatBar=document.getElementById("noteFormatBar");
const notePreview=document.getElementById("notePreview");
const noteFontSelect=document.getElementById("noteFontSelect");
const noteFontSize=document.getElementById("noteFontSize");
const ctxMenu=document.getElementById("ctxMenu");
const helpPop=document.getElementById("helpPop");
const focusHud=document.getElementById("focusHud");
const toolOptions={innerHTML:"",appendChild:()=>{}}; /* 兼容旧引用 */
const zoomPctEl=document.getElementById("zoomPct");
const sidePanel=document.getElementById("side-panel");
const brandEl=document.querySelector(".brand");
const previewLayer=document.getElementById("previewLayer");
const fileGroups=document.getElementById("file-groups");
const fileInput=document.getElementById("fileInput");
const dropOverlay=document.getElementById("dropOverlay");
const toastEl=document.getElementById("toast");

const TOOLS=[
  {id:"select",label:"选择",key:"V",icon:"select"},
];
const ICON={
  select:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>',
  hand:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  mind:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="5" r="2.6"/><circle cx="18" cy="5" r="2.6"/><circle cx="12" cy="13" r="2.6"/><circle cx="6" cy="21" r="2.6"/><circle cx="18" cy="21" r="2.6"/><path d="m8.2 6.6 2.4 4M15.8 6.6l-2.4 4"/><path d="m8.6 19.4 2.6-4.6M15.4 19.4l-2.6-4.6"/></svg>',
  note:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>',
  pen:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>',
  connector:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/></svg>',
  undo:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5A5.5 5.5 0 0 1 14.5 20H11"/></svg>',
  redo:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></svg>',
  zoomIn:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>',
  zoomOut:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/></svg>',
  fit:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2"/></svg>',
  help:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  copy:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="16" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  trash:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  plus:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  expand:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
  collapse:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>',
  folder:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  view:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  close:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  import:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M12 3v12M8 11l4 4 4-4"/></svg>',
  export:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m8 8 4-4 4 4"/><path d="M12 4v12"/></svg>',
  focus:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
  annotate:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/><path d="M9 8h6M9 11h4"/></svg>',
  palette:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="13" r="1.5" fill="currentColor" stroke="none"/></svg>',
  jump:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><path d="M14 4h6v6"/><path d="m10 14 10-10"/></svg>',
  /* —— 统一视觉体系的补充图标（全部 SVG 线性，与既有 ICON 同一设计语言） —— */
  layout:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 13v3M17 19v1"/><circle cx="17" cy="17" r="1"/></svg>',
  style:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a5 5 0 0 0-5 5c0 1 .3 1.9.8 2.7L4.5 14a2 2 0 0 0 0 2.8l2.7 2.7a2 2 0 0 0 2.8 0l3.3-3.3c.8.5 1.7.8 2.7.8a5 5 0 0 0 5-5c0-2.8-2.2-5-5-5Z"/><path d="M17.5 6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>',
  immersive:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>',
  marquee:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/></svg>',
  relayout:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a4 4 0 0 1 4-4h2M21 7a4 4 0 0 0-4-4h-2"/><path d="M3 17a4 4 0 0 0 4 4h2M21 17a4 4 0 0 1-4 4h-2"/><path d="M7 12h.01M12 12h.01M17 12h.01"/></svg>',
  grid:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  bgColor:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 10.5a9 9 0 0 1 16.8 0z"/><path d="M12 3v18"/></svg>',
  fullscreen:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M9 15h6v-6H9z"/></svg>',
  edit:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
};

let W=0,H=0,dpr=1;
/* 最后一次指针的屏幕坐标（供悬浮编辑器跟随定位） */
let lastPointer={x:0,y:0};
const state={
  tool:"select",
  projects:[],            // [{id,name,files:[],folders:[],canvases:[{id,name,items:[],camera:{},previews:[]}]}]
  activeProjectId:null,
  activeCanvasId:null,
  selected:null,
  spaceDown:false,mouseWorld:{x:0,y:0},
  penSize:3,penColor:LINE_COLORS[0],lineColor:LINE_COLORS[6],noteColor:DEFAULT_NOTE_COLOR,
  mindColor:MIND_COLORS[0],mindColorMode:"single",mindMode:"manual",
  hover:null,
  multiSel:[],           /* Shift+点击多选的元素 id 列表 */
  links:[],              /* 自由连接：[{id, aId, bId}] 元素之间的连接线 */
  focusMode:null,        /* 聚焦模式：{id, collapsedBackup:{id:bool}} */
  layoutType:"logic",    /* 排布模板：logic 逐级向右 / both 左右分布 / fourway 上下左右 /
                            org 纯向下 / u U型环绕 / fishbone 鱼骨形 / timeline 时间轴 /
                            left 逐级向左 / brace 括号图 */
  stylePreset:DEFAULT_STYLE, /* 全局样式：clear/glass/paper/soft */
  tempTool:null,
  hoveredNodeId:null,
  sideCollapsed:false,
  reducedMotion:true,  /* E10/H4: 背景流光开关，默认关（静止）；开关 ON=!reducedMotion=流动 */
  fantinIcon:2,  /* H4: .fantin 文件图标选择 1/2/3（构建偏好，下次打包安装版生效） */
  autoTheme:true,  /* G4: 默认跟随系统白天黑夜 */
  saveInterval:30,  /* G3: 自动保存间隔（秒），0=关闭 */
  storagePath:"",  /* G3: 桌面版文件存储位置 */
  materialLibraryPath:"",  /* L5: 材料库根目录——导入材料在磁盘上的落盘镜像位置 */
  _respAuto:false,_applyingResize:false,
  search:null,
  bgColor:"#fbfbfd",
  bgPattern:"grid",      /* 纹理版式 */
  linkAvoid:true,        /* B: 关系线避障绕行（撞到卡片才改路，不撞一律不动） */
  bgColorName:"mixed", /* 背景颜色：mixed=三色流光, red/yellow/blue=单色铺满 */
  dark:false,
  fontPreset:"serif",
};
let uid=1,drag=null,renderQueued=false,focusTransition=1;
/* I5-fix: 裸全局 linkPointHover 已删——连接点悬停态统一存 state.linkPointHover
   （此前读写分裂在两个变量上，悬停提示永远不显示） */
/* H1 任务7: id→item 索引，供 collectKids/localAvoid/move-loop 用 O(1) 查找替代 state.items.find */
let idMap=new Map(),idMapItems=null,idMapLength=-1;
/* K7：索引只在画布内容集合改变时重建。相机移动、悬停和逐帧绘制不再扫描整张画布。 */
function rebuildIdMap(){
  const items=state.items;idMap=new Map();for(const it of items)idMap.set(it.id,it);
  idMapItems=items;idMapLength=items.length;
}
function ensureIdMap(){if(idMapItems!==state.items||idMapLength!==state.items.length)rebuildIdMap();return idMap;}
/* 代理属性：items/camera/files/folders/previews 始终指向当前项目/画布 */
function curProject(){return state.projects.find(p=>p.id===state.activeProjectId)||state.projects[0];}
function curCanvas(){
  const p=curProject();if(!p)return null;
  return p.canvases.find(c=>c.id===state.activeCanvasId)||p.canvases[0]||null;
}
Object.defineProperty(state,"items",{get(){const c=curCanvas();return c?c.items:[];},set(v){const c=curCanvas();if(c)c.items=v;}});
Object.defineProperty(state,"camera",{get(){const c=curCanvas();return c?c.camera:{x:0,y:0,zoom:1};},set(v){const c=curCanvas();if(c)c.camera=v;}});
Object.defineProperty(state,"files",{get(){const p=curProject();return p?p.files:[];},set(v){const p=curProject();if(p)p.files=v;}});
Object.defineProperty(state,"folders",{get(){const p=curProject();return p?p.folders:[];},set(v){const p=curProject();if(p)p.folders=v;}});
Object.defineProperty(state,"previews",{get(){const c=curCanvas();return c?c.previews:[];},set(v){const c=curCanvas();if(c)c.previews=v;}});
Object.defineProperty(state,"links",{get(){const c=curCanvas();return c?c.links||[]:[];},set(v){const c=curCanvas();if(c)c.links=v;}});
/* 确保 uid 大于所有已有 item/file 的 id（避免 id 冲突） */
function syncUid(){
  let max=0;
  const observe=id=>{const n=parseInt(String(id||"").replace(/\D/g,"")||"0");if(n>max)max=n;};
  for(const p of state.projects){
    observe(p.id);
    for(const f of p.files||[])observe(f.id);
    for(const folder of p.folders||[])observe(folder.id);
    for(const c of p.canvases||[]){
      observe(c.id);
      for(const it of c.items||[])observe(it.id);
      for(const link of c.links||[])observe(link.id);
    }
  }
  uid=max+1;
}
/* 项目/画布 CRUD */
function createProject(name){
  const p={id:"p"+(uid++),name:name||"新项目",files:[],folders:[],canvases:[]};
  p.canvases.push({id:"c"+(uid++),name:"主画布",items:[],camera:{x:0,y:0,zoom:1},previews:[],links:[]});
  state.projects.push(p);
  state.activeProjectId=p.id;
  state.activeCanvasId=p.canvases[0].id;
  state.selected=null;
  renderSidePanel();render();saveStateDebounced();
  return p;
}
async function deleteProject(id){
  const proj=state.projects.find(p=>p.id===id);
  if(proj&&proj.isBuiltin){toast("内置项目不可删除，可使用「重置学堂」恢复初始状态");return false;}
  if(state.projects.length<=1){toast("至少保留一个项目");return false;}
  const idx=state.projects.findIndex(p=>p.id===id);if(idx<0)return false;
  /* Delete only after a durable recovery point exists. */
  const proj2=state.projects[idx];
  if(!await queueRecovery("删除项目："+proj2.name))return false;
  state.projects=state.projects.filter(p=>p.id!==id);
  const np=state.projects[0];
  state.activeProjectId=np.id;
  state.activeCanvasId=np.canvases[0].id;
  resetTransientState();
  renderSidePanel();render();saveStateDebounced();syncPvDom();return true;
}
function switchProject(id){
  if(typeof L1Search!=="undefined")L1Search.clearPreview();
  saveCurrentCanvas();
  state.activeProjectId=id;
  const p=curProject();
  state.activeCanvasId=p.canvases[0].id;
  resetTransientState();
  renderSidePanel();render();saveStateDebounced();syncPvDom();
}
function createCanvas(name){
  const p=curProject();if(!p)return;
  const c={id:"c"+(uid++),name:name||"新画布",items:[],camera:{x:0,y:0,zoom:1},previews:[],links:[]};
  p.canvases.push(c);
  state.activeCanvasId=c.id;
  state.selected=null;
  renderSidePanel();render();saveStateDebounced();
  return c;
}
async function deleteCanvas(id){
  const p=curProject();if(!p||!p.canvases.some(c=>c.id===id))return false;
  if(p.canvases.length<=1){toast("至少保留一张画布");return false;}
  if(!await queueRecovery("删除画布："+(p.canvases.find(c=>c.id===id)?.name||"画布")))return false;
  p.canvases=p.canvases.filter(c=>c.id!==id);
  cleanupProjectReferences();
  state.activeCanvasId=p.canvases[0].id;
  state.selected=null;
  renderSidePanel();render();saveStateDebounced();syncPvDom();return true;
}
function switchCanvas(id){
  if(typeof L1Search!=="undefined")L1Search.clearPreview();
  saveCurrentCanvas();
  state.activeCanvasId=id;
  resetTransientState();
  renderSidePanel();render();saveStateDebounced();syncPvDom();
}
function renameCanvas(id,name){
  const p=curProject();if(!p)return;
  const c=p.canvases.find(c=>c.id===id);
  if(c&&name){c.name=name;renderSidePanel();saveStateDebounced();}
}

function renameProject(id,name){
  const p=state.projects.find(x=>x.id===id);
  if(p&&name){p.name=name;renderSidePanel();saveStateDebounced();}
}
/* K5: 拖动排序——项目和画布 */
function reorderProjects(fromId,toId,before){
  var from=state.projects.findIndex(p=>p.id===fromId);
  if(from<0)return;
  var item=state.projects.splice(from,1)[0];
  var to=state.projects.findIndex(p=>p.id===toId);
  if(to<0){state.projects.push(item);to=state.projects.length-1;}
  else if(!before)to++;
  state.projects.splice(to,0,item);
  renderSidePanel();saveStateDebounced();
}
function reorderCanvases(fromId,toId,before){
  var p=curProject();if(!p)return;
  var from=p.canvases.findIndex(c=>c.id===fromId);
  if(from<0)return;
  var item=p.canvases.splice(from,1)[0];
  var to=p.canvases.findIndex(c=>c.id===toId);
  if(to<0){p.canvases.push(item);}
  else if(!before)to++;
  p.canvases.splice(to,0,item);
  renderSidePanel();saveStateDebounced();
}
function moveCanvasToProject(canvasId,targetProjectId){
  const source=curProject(),target=state.projects.find(p=>p.id===targetProjectId);
  if(!source||!target||source===target)return;
  const c=source.canvases.find(c=>c.id===canvasId);if(!c)return;
  const needed=new Set((c.items||[]).filter(i=>i.fileId).map(i=>i.fileId));
  for(const item of c.items||[])if(item.sourceRef?.fileId)needed.add(item.sourceRef.fileId);
  for(const p of c.previews||[])if(p.fileId)needed.add(p.fileId);
  for(const l of c.links||[])if(l.sourceRef?.fileId)needed.add(l.sourceRef.fileId);
  for(const id of needed)if(!source.files.some(f=>f.id===id)){toast("移动失败：附件记录缺失，请先检查关系");return;}
  const additions=[...needed].filter(id=>!target.files.some(f=>f.id===id));
  let folder=null;
  if(additions.length){
    target.folders=target.folders||[];
    const base=c.name||"画布附件";let name=base,n=2;
    while(target.folders.some(f=>!f.parentId&&f.name===name))name=base+"（"+(n++)+"）";
    folder={id:"fld"+(uid++),name,parentId:null,collapsed:false};target.folders.push(folder);
    for(const id of additions){const f=source.files.find(f=>f.id===id);target.files.push({...f,folderId:folder.id,thumb:null,_url:null});}
  }
  for(const p of state.projects)for(const board of p.canvases)for(const i of board.items||[]){
    if(!i.jumpTo)continue;const j=typeof i.jumpTo==="string"?{canvasId:i.jumpTo}:i.jumpTo;
    if(j.canvasId===c.id)i.jumpTo={...j,projectId:target.id};else if(board===c)i.jumpTo={...j,projectId:j.projectId||source.id};
  }
  source.canvases=source.canvases.filter(b=>b!==c);target.canvases.push(c);
  if(!source.canvases.length)source.canvases.push({id:"c"+(uid++),name:"主画布",items:[],links:[],previews:[],camera:{x:0,y:0,zoom:1}});
  saveCurrentCanvas();state.activeProjectId=target.id;state.activeCanvasId=c.id;resetTransientState();
  renderSidePanel();render();saveStateDebounced();syncPvDom();restoreFiles();
  const reused=needed.size-additions.length;
  toast("画布已移动"+(folder?"；新增附件放入「"+folder.name+"」":"")+(reused?"；"+reused+" 个已有附件沿用原位置":"")+"。原项目文件保留");
}
function renameFile(id,name){
  const f=state.files.find(x=>x.id===id);
  if(f&&name){f.name=name;renderFileGroups();saveStateDebounced();}
}
function saveCurrentCanvas(){
  /* items/camera/previews 是代理属性，数据已直接写入 canvas 对象，无需额外操作 */
  /* 清理预览 DOM（含 morphDom 覆盖层，否则其 fileId 引用残留导致不再重建=空白） */
  if(previewLayer)previewLayer.innerHTML="";
  destroyMorphDom();
}
let editingNoteId=null,editingMindId=null,editingNoteDraftStyle=null;
let undoStack=[],redoStack=[];
const canvasHistories=new Map();
function activateHistory(){const c=curCanvas();if(!c){undoStack=[];redoStack=[];return;}let h=canvasHistories.get(c.id);if(!h){h={undo:[],redo:[]};canvasHistories.set(c.id,h);}undoStack=h.undo;redoStack=h.redo;}
function resetTransientState(){if(typeof _cameraAnimation!=="undefined")++_cameraAnimation;state._camInteracting=false;state.selected=null;state.multiSel=[];state.hover=null;state.focusMode=null;state.search=null;}

const MAX_HISTORY=60;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cloneCanvasState=()=>{
  /* H1 任务1: 撤销快照不克隆 ImageBitmap（.thumb）——图片内容统一从 state.files
     重新引用，避免 60 步撤销栈深拷贝出几十份缩略图副本（曾致 700MB 内存）。 */
  const items=state.items.map(it=>(it.type==="fileCard"&&it.thumb)?{...it,thumb:null}:it);
  const d={items,links:state.links,camera:state.camera,previews:state.previews};
  return typeof structuredClone==="function"?structuredClone(d):JSON.parse(JSON.stringify(d));
};
function restoreCanvasState(snapshot){
  state.items=snapshot.items||[];
  state.links=snapshot.links||[];
  state.camera=snapshot.camera||{x:0,y:0,zoom:1};
  state.previews=snapshot.previews||[];
  cleanupReferences();
  /* H1 任务1: 快照不含 .thumb，按 fileId 从 state.files 重新挂载共享引用（不克隆） */
  for(const it of state.items){
    if(it.type==="fileCard"&&!it.thumb&&it.fileId){
      const f=state.files.find(x=>x.id===it.fileId);
      if(f&&f.thumb){it.thumb=f.thumb;it.tw=f.tw;it.th=f.th;}
    }
  }
  rebuildIdMap();
}

function pushHistory(label){
  activateHistory();
  undoStack.push({state:cloneCanvasState(),label:label||"操作"});
  if(undoStack.length>MAX_HISTORY) undoStack.shift();
  redoStack.length=0;
  syncHistoryBtns();
}
function undo(){
  activateHistory();
  if(!undoStack.length) return;
  const entry=undoStack.pop();
  redoStack.push({state:cloneCanvasState(),label:entry.label});
  restoreCanvasState(entry.state);
  state.selected=null;
  closeEditor(true);closeMindEditor(true);
  syncHistoryBtns();render();saveStateDebounced();
  toast("撤销："+entry.label);
}
function redo(){
  activateHistory();
  if(!redoStack.length) return;
  const entry=redoStack.pop();
  undoStack.push({state:cloneCanvasState(),label:entry.label});
  restoreCanvasState(entry.state);
  state.selected=null;
  closeEditor(true);closeMindEditor(true);
  syncHistoryBtns();render();saveStateDebounced();
  toast("重做："+entry.label);
}
let _historyButtonState="";
function syncHistoryBtns(){
  activateHistory();
  const next=(undoStack.length?1:0)+":"+(redoStack.length?1:0);
  if(next===_historyButtonState)return;
  _historyButtonState=next;
  document.getElementById("undoBtn").style.opacity=undoStack.length?1:.4;
  document.getElementById("redoBtn").style.opacity=redoStack.length?1:.4;
}
/* 视口坐标 → 画布内坐标（canvas 定位在 left:sidebar / top:topbar 内） */
function boardXY(clientX,clientY){
  const r=canvas.getBoundingClientRect();
  return {x:clientX-r.left, y:clientY-r.top};
}

/* 坐标变换 */
const s2w=(sx,sy)=>({x:state.camera.x+sx/state.camera.zoom,y:state.camera.y+sy/state.camera.zoom});
const w2s=(wx,wy)=>({x:(wx-state.camera.x)*state.camera.zoom,y:(wy-state.camera.y)*state.camera.zoom});

function resize(){
  dpr=window.devicePixelRatio||1;
  W=board.clientWidth;H=board.clientHeight;
  if(W<=0||H<=0){W=window.innerWidth-(state.sideCollapsed?0:270);H=window.innerHeight-52;}
  canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  canvas.style.width=W+"px";canvas.style.height=H+"px";
  applyResponsive();
  render();
}
/* 多长宽比适配：窄屏/竖屏自动折叠侧栏，宽且充足时恢复 */
function applyResponsive(){
  if(state._applyingResize) return;
  state._applyingResize=true;
  const vw=window.innerWidth,vh=window.innerHeight;
  const narrow=vw<900||(vw<vh&&vw<1000);
  if(narrow&&!state.sideCollapsed){
    state.sideCollapsed=true;
    applySide();
  }else if(!narrow&&state.sideCollapsed&&state._respAuto){
    /* 仅在"自动折叠"恢复范围内放开，用户手动折叠不受影响 */
    state.sideCollapsed=false;
    state._respAuto=false;
    applySide();
  }
  if(narrow) state._respAuto=true;
  state._applyingResize=false;
}
function zoomAt(sx,sy,factor){
  const nz=clamp(state.camera.zoom*factor,0.15,4);
  const wx=state.camera.x+sx/state.camera.zoom;
  const wy=state.camera.y+sy/state.camera.zoom;
  state.camera.zoom=nz;state.camera.x=wx-sx/nz;state.camera.y=wy-sy/nz;
  if(zoomPctEl) zoomPctEl.textContent=Math.round(nz*100)+"%";
  requestRender();
}
function fitAll(){
  const b=boundsOfItems();if(!b) return;
  const pad=80;
  /* L1.5d: 只 clear/glass 画布全屏铺底才排除上栏左栏；其他样式 board 已退在左栏右，W/H 本就排除，不重复排除 */
  if(state.stylePreset==="glass"||state.stylePreset==="clear"){
    const sw=state.sideCollapsed?0:270,th=52;
    const z=clamp(Math.min(((W-sw)-pad*2)/Math.max(1,b.w),((H-th)-pad*2)/Math.max(1,b.h)),0.15,1.6);
    const tx=b.x-(((W+sw)/z-b.w)/2);
    const ty=b.y-(((H+th)/z-b.h)/2);
    animateCamera(tx,ty,z);
  }else{
    const z=clamp(Math.min((W-pad*2)/Math.max(1,b.w),(H-pad*2)/Math.max(1,b.h)),0.15,1.6);
    const tx=b.x-((W/z-b.w)/2);
    const ty=b.y-((H/z-b.h)/2);
    animateCamera(tx,ty,z);
  }
}
function boundsOfItems(){
  let b=null;
  for(const it of state.items){const ib=itemBounds(it);if(!ib) continue;b=b?union(b,ib):ib;}
  if(!b) b={x:-320,y:-240,w:640,h:480};
  return b;
}
function union(a,b){
  const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
  const x2=Math.max(a.x+a.w,b.x+b.w),y2=Math.max(a.y+a.h,b.y+b.h);
  return{x,y,w:x2-x,h:y2-y};
}
/* 节点正文按可读宽度折行；宽度有上限、内容高度无硬截断，避免长标题被省略或撑成一条横幅。 */
let mindMetricsCache=new WeakMap();
function mindNodeMetrics(it,c){
  const cc=c||ctx,depth=nodeDepth(it),SC=styleCfg(),fs=SC.fontScale||1;
  const controls=(it.children&&it.children.length?30:0)+(it.detail?26:0);
  const key=[it.text,it.w,it.h,depth,fs,FONT,controls];
  const cached=mindMetricsCache.get(it);
  if(cached&&cached.key.every((v,i)=>v===key[i]))return cached.value;
  const size=depth===0?Math.round(14*fs):depth===1?Math.round(13*fs):Math.round(12.5*fs);
  const weight=depth===0?"700 ":depth===1?"600 ":"500 ";
  const minW=depth===0?180:depth===1?164:148,maxW=depth===0?340:depth===1?310:280;
  cc.save();cc.font=weight+size+"px "+FONT;
  const natural=cc.measureText(it.text||"").width+30+controls;
  const w=clamp(Math.max(it.w||0,minW,Math.min(natural,maxW)),minW,maxW);
  const available=Math.max(76,w-28-controls);
  const lines=wrapLines(cc,it.text||"(空)",available);
  cc.restore();
  const lineH=Math.ceil(size*1.38),h=Math.max(it.h||40,Math.ceil(lines.length*lineH+18));
  const value={w,h,lines,size,weight,lineH,available};mindMetricsCache.set(it,{key,value});return value;
}
function itemBounds(it){
  if(!it) return null;
  if(it.type==="link"){
    /* 连接线 bounds = 两端中点合并 */
    const a=state.items.find(i=>i.id===it.aId),b=state.items.find(i=>i.id===it.bId);
    if(!a||!b)return null;
    const ab=itemBounds(a),bb=itemBounds(b);
    const x1=Math.min(ab.x+ab.w/2,bb.x+bb.w/2);
    const x2=Math.max(ab.x+ab.w/2,bb.x+bb.w/2);
    const y1=Math.min(ab.y+ab.h/2,bb.y+bb.h/2);
    const y2=Math.max(ab.y+ab.h/2,bb.y+bb.h/2);
    return{x:x1,y:y1,w:x2-x1,h:y2-y1};
  }
  if(it.type==="note") return{x:it.x,y:it.y,w:it.w,h:it.h};
  if(it.type==="mindNode"){
    const m=mindNodeMetrics(it,ctx);
    return{x:it.x,y:it.y,w:m.w,h:m.h};
  }
  if(it.type==="fileCard"){
    let w=it.w||160,h=it.h||52;
    /* 形变预览态：直接用当前动画尺寸（不做缩略图自适应覆盖） */
    if(it.previewOpen) return{x:it.x,y:it.y,w,h};
    if(it.kind==="img"&&it.tw&&it.th){
      /* 图片按实际长宽比自适应 */
      const maxW=200,maxH=160;
      const asp=it.tw/it.th;
      if(asp>1){w=maxW;h=Math.min(maxH,maxW/asp);}
      else{h=maxH;w=Math.min(maxW,maxH*asp);}
    }
    return{x:it.x,y:it.y,w,h};
  }
  if(it.type==="stroke"){
    if(!it.points.length) return null;
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
    for(const p of it.points){if(p.x<x1)x1=p.x;if(p.x>x2)x2=p.x;if(p.y<y1)y1=p.y;if(p.y>y2)y2=p.y;}
    return{x:x1-it.size,y:y1-it.size,w:x2-x1+it.size*2,h:y2-y1+it.size*2};
  }
  if(it.type==="connector"){
    const a=resolveEnd(it.a),b=resolveEnd(it.b);
    return{x:Math.min(a.x,b.x)-12,y:Math.min(a.y,b.y)-12,w:Math.abs(b.x-a.x)+24,h:Math.abs(b.y-a.y)+24};
  }
  return null;
}
function requestRender(){
  if(renderQueued) return;
  renderQueued=true;
  requestAnimationFrame(()=>{renderQueued=false;try{render();}catch(e){console.error("E5 RENDER ERROR:",e.message);}});
}

