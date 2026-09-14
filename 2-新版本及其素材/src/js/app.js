"use strict";
/* ============================================================
   IndexedDB / 持久化
============================================================ */
const DB_NAME="boardlib",DB_VER=1;
let idb=null;
function openDB(){
  return new Promise((res,rej)=>{
    const rq=indexedDB.open(DB_NAME,DB_VER);
    rq.onupgradeneeded=()=>{
      const db=rq.result;
      if(!db.objectStoreNames.contains("files")) db.createObjectStore("files");
    };
    rq.onsuccess=()=>{idb=rq.result;res();};
    rq.onerror=()=>{idb=null;res();};  // 降级：无 IDB 时文件仅会话内
  });
}
function saveState(){
  try{
    const data={
      projects:state.projects.map(p=>({
        id:p.id,name:p.name,tutorialVersion:p.tutorialVersion||null,isBuiltin:p.isBuiltin||false,
        files:p.files.map(f=>({id:f.id,name:f.name,kind:f.kind,size:f.size,mime:f.mime,url:f.url||null,created:f.created,folderId:f.folderId||null})),
        folders:p.folders.map(f=>({id:f.id,name:f.name,parentId:f.parentId||null})),
        canvases:p.canvases.map(c=>({id:c.id,name:c.name,items:c.items,camera:c.camera,previews:c.previews||[],links:c.links||[]})),
      })),
      activeProjectId:state.activeProjectId,
      activeCanvasId:state.activeCanvasId,
      ui:{sideCollapsed:state.sideCollapsed,dark:state.dark,bgPattern:state.bgPattern,bgColorName:state.bgColorName,mindMode:state.mindMode,mindColorMode:state.mindColorMode,layoutType:state.layoutType,fontPreset:state.fontPreset,stylePreset:state.stylePreset,reducedMotion:state.reducedMotion,fantinIcon:state.fantinIcon,autoTheme:state.autoTheme,saveInterval:state.saveInterval,storagePath:state.storagePath,noteColor:state.noteColor,mindColor:state.mindColor},
      savedAt:Date.now(),
    };
    localStorage.setItem("board-state",JSON.stringify(data));
  }catch(e){
    console.warn("save board state failed",e);
    toast("保存失败：本地存储空间不足或被浏览器限制");
  }
}
/* H1 任务5: 防抖存档——连续操作只在停顿后序列化一次，削平松手时的 CPU 尖峰。
   关键路径（beforeunload）走立即存档绕过防抖，确保最终状态落盘。 */
/* I5-fix: debounce 的 flush/cancel 扩展零调用方且 flush 的 this 取向有误，删除 */
function debounce(fn,wait){let t=null;const d=function(){const ctx=this,args=arguments;if(t)clearTimeout(t);t=setTimeout(()=>fn.apply(ctx,args),wait);};return d;}
const saveStateDebounced=debounce(saveState,1500);
/* G3: 可配置自动保存间隔——I5-fix 提为顶层函数，init 与设置面板（数据）共用；
   原先是 init() 内的局部函数，设置面板调用时直接 ReferenceError */
var _saveTimer=null;
function setupAutoSave(){
  if(_saveTimer){clearInterval(_saveTimer);_saveTimer=null;}
  var sec=state.saveInterval;
  if(sec>0){_saveTimer=setInterval(saveState,sec*1000);}
}
/* I5: 统一版本标签——网页与桌面共用一个来源（桌面端异步取 package.json 版本号，
   修复关于页把 Promise 拼进字符串显示"v[object Promise]"、网页端回退旧标签"G3"的问题） */
let APP_VERSION="I5";
if(window.electronAPI&&window.electronAPI.getVersion){
  try{window.electronAPI.getVersion().then(function(v){if(v)APP_VERSION="v"+v;}).catch(function(){});}catch(e){}
}
function loadState(){
  try{
    const raw=localStorage.getItem("board-state");
    if(!raw) return false;
    const d=JSON.parse(raw);
    if(d.projects&&d.projects.length){
      state.projects=d.projects.map(p=>({
        ...p,
        files:(p.files||[]).map(f=>({...f,thumb:null,tw:1,th:1})),
        canvases:(p.canvases||[]).map(c=>({...c,items:c.items||[],camera:c.camera||{x:0,y:0,zoom:1},previews:c.previews||[],links:c.links||[]})),
      }));
      state.activeProjectId=d.activeProjectId||state.projects[0].id;
      state.activeCanvasId=d.activeCanvasId||curProject().canvases[0].id;
      /* 旧配色 → 新配色迁移（保证已保存内容的观感更新） */
      const COLOR_MIGRATE={"#2a8a9a":"#2d5fd3","#4a9a5a":"#1fa06a","#8a5a9a":"#7a55c0","#d48840":"#e0882a","#c5483a":"#c94a3e","#fde68a":"#fef3c7","#dcfce7":"#dbeafe","#f5e6c8":"#fef3c7","#f0d690":"#fef3c7","#e8c5c0":"#fde2e2","#c5c0e0":"#ede4ff","#b8c8e0":"#dbeafe","#a8d0c0":"#ccfbf1","#e8e8ea":"#f5f5f4","#0f8aa0":"#2d5fd3","#7a7a82":"#9090a0"};
      if(COLOR_MIGRATE[state.noteColor])state.noteColor=COLOR_MIGRATE[state.noteColor];
      for(const canvas of state.projects.flatMap(p=>p.canvases||[])){
        for(const item of canvas.items||[]){
          if(item.color&&COLOR_MIGRATE[item.color])item.color=COLOR_MIGRATE[item.color];
          if(item.type==="note"&&item.color&&COLOR_MIGRATE[item.color])item.color=COLOR_MIGRATE[item.color];
        }
        for(const link of canvas.links||[]){
          if(link.annotation&&link.color&&COLOR_MIGRATE[link.color])link.color=COLOR_MIGRATE[link.color];
        }
      }
    }else{
      return false; /* projects 为空，需要 seed */
    }
    if(d.ui){
      state.sideCollapsed=!!d.ui.sideCollapsed;
      if(d.ui.dark!==undefined)state.dark=!!d.ui.dark;
      if(d.ui.bgPattern)state.bgPattern=d.ui.bgPattern;
      if(d.ui.reducedMotion!==undefined)state.reducedMotion=d.ui.reducedMotion;
      if(d.ui.fantinIcon!==undefined)state.fantinIcon=d.ui.fantinIcon;
      if(d.ui.autoTheme!==undefined)state.autoTheme=d.ui.autoTheme;
      if(d.ui.saveInterval!==undefined)state.saveInterval=d.ui.saveInterval;
      if(d.ui.storagePath)state.storagePath=d.ui.storagePath;
      if(d.ui.bgColorName&&["default","eye","cream","blue","kraft"].includes(d.ui.bgColorName))state.bgColorName=d.ui.bgColorName;
      /* I5-fix: 便签/节点自选颜色随档案持久化（此前每次启动都被重置成默认色） */
      if(d.ui.noteColor&&/^#[0-9a-fA-F]{3,8}$/.test(d.ui.noteColor))state.noteColor=d.ui.noteColor;
      if(d.ui.mindColor&&/^#[0-9a-fA-F]{3,8}$/.test(d.ui.mindColor))state.mindColor=d.ui.mindColor;
      if(d.ui.mindMode)state.mindMode=d.ui.mindMode;
      if(d.ui.mindColorMode==="single"||d.ui.mindColorMode==="auto")state.mindColorMode=d.ui.mindColorMode;
      if(d.ui.layoutType){
        const legacyLayout={right:"logic",left:"logic",u:"logic",brace:"logic"};
        state.layoutType=legacyLayout[d.ui.layoutType]||d.ui.layoutType;
      }
      if(d.ui.stylePreset){let sp=d.ui.stylePreset;if(STYLE_ALIAS[sp])sp=STYLE_ALIAS[sp];if(STYLE_PRESETS[sp])state.stylePreset=sp;}
      if(d.ui.fontPreset&&FONT_PRESETS[d.ui.fontPreset])state.fontPreset=d.ui.fontPreset;
    }
    /* 强制刷新一次 bgColor（确保和 bgColorName 一致） */
    state.bgColor=getBgColor(state.bgColorName,state.dark);
    applyTheme();
    applyFontPreset();
    cleanupProjectReferences();
    syncUid();
    return true;
  }catch(e){
    /* I5-fix: 解析失败的原档先隔离留档，再走新建流程——此前直接被示例数据覆盖且无法找回 */
    try{
      const raw2=localStorage.getItem("board-state");
      if(raw2)localStorage.setItem("board-state-corrupt-backup-"+Date.now(),raw2);
    }catch(e2){}
    return false;
  }
}
/* 预览内容缓存：避免每次渲染重复读取 */
const previewCache=new Map();   /* fileId -> {kind,img,text,loading,err} */
function getPreviewContent(fileId){
  if(previewCache.has(fileId))return previewCache.get(fileId);
  const f=state.files.find(x=>x.id===fileId);
  if(!f)return null;
  const rec={kind:f.kind,img:null,text:"",url:null,loading:true,err:false};
  previewCache.set(fileId,rec);
  getBlob(fileId).then(async b=>{
    if(!b){rec.loading=false;rec.err=true;requestRender();return;}
    try{
      if(f.kind==="img"){
        /* 图片：加载原图（比缩略图清晰，真正实时预览） */
        rec.img=await createImageBitmap(b);
      }else if(f.kind==="media"&&/video/i.test(f.mime||"")){
        /* 视频：提取首帧作为静态预览（画布内无法内嵌播放器，用首帧+时长标注） */
        rec.kind="video";
        rec.url=(f._url)||URL.createObjectURL(b);
        if(!f._url)f._url=rec.url;
        const v=document.createElement("video");
        v.preload="metadata";v.muted=true;v.src=rec.url;
        await new Promise(res=>{
          v.onloadeddata=()=>res();
          setTimeout(res,3000);
        });
        if(v.videoWidth){
          const cv=document.createElement("canvas");
          cv.width=v.videoWidth;cv.height=v.videoHeight;
          cv.getContext("2d").drawImage(v,0,0,cv.width,cv.height);
          rec.img=await createImageBitmap(cv);
          rec.dur=v.duration||0;
        }
      }else if(f.kind==="text"||f.kind==="code"||/\.(md|txt|csv|json|log)$/i.test(f.name)){
        rec.text=(await b.text()).slice(0,4000);
      }else{
        rec.text="";   /* PDF/二进制：显示文件信息卡 */
      }
    }catch(e){rec.err=true;}
    rec.loading=false;
    requestRender();
  }).catch(()=>{rec.loading=false;rec.err=true;requestRender();});
  return rec;
}
/* 文件内容变更/删除时清缓存 */
function clearPreviewCache(fileId){
  /* H2 任务8: 清缓存时主动 close ImageBitmap，避免解码位图靠 GC 滞留堆积 */
  const closeRec=(r)=>{if(r&&r.img&&typeof r.img.close==="function"){try{r.img.close();}catch(e){}}};
  if(fileId){closeRec(previewCache.get(fileId));previewCache.delete(fileId);}
  else{for(const r of previewCache.values())closeRec(r);previewCache.clear();}
}
/* 恢复文件 blob 到内存 map（fileCard 的 thumb 从 files 恢复） */
async function restoreFiles(){
  for(const file of state.files){
    if(file.kind==="img"){
      try{
        const b=await getBlob(file.id);
        const bmp=await createImageBitmap(b);
        const max=300,sc=Math.min(1,max/Math.max(bmp.width,bmp.height));
        file.thumb=bmp;file.tw=bmp.width*sc;file.th=bmp.height*sc;
        for(const it of state.items){
          if(it.type==="fileCard"&&it.fileId===file.id){it.thumb=bmp;it.tw=file.tw;it.th=file.th;}
        }
      }catch(e){}
    }
  }
  render();
}

/* ============================================================
   状态栏 → 画布 HUD
   —— 数据计算与绘制分离：
   updateStatusBar 仅缓存最新 HUD 数据（轻量，render 内每帧调用）；
   drawStatusHUD 在 render 尾部用 canvas 直接绘制（无白底框、亮度自适应）
============================================================ */
let HUD=null;
function updateStatusBar(){
  const sel=selectedItem();
  const cnt={mindNode:0,note:0,fileCard:0,stroke:0,connector:0};
  for(const it of state.items){if(cnt[it.type]!==undefined)cnt[it.type]++;}
  /* 彩点计数段：保留原色点语义 */
  const dots={mindNode:"#3a4a6b",note:"#c48840",fileCard:"#c48840",stroke:"#6e7080",connector:"#2a7a6a"};
  const segs=[];
  for(const [type,n] of Object.entries(cnt)){
    if(!n)continue;
    segs.push({dot:dots[type],txt:String(n),strong:true});
  }
  if(state.links.length)segs.push({txt:"线 "+state.links.length,strong:true});
  if(sel){
    const selLabel=sel.type==="mindNode"?(sel.text||"节点").slice(0,12):sel.type==="note"?(sel.text||"").slice(0,12):sel.type==="fileCard"?(state.files.find(f=>f.id===sel.fileId)?.name||"材料").slice(0,12):SEL_LABEL[sel.type]||"";
    segs.push({k:"选中",txt:(SEL_LABEL[sel.type]||"")+" · "+selLabel});
  }
  HUD={
    segs,
    zoom:Math.round(state.camera.zoom*100),
    mx:Math.round(state.mouseWorld.x),my:Math.round(state.mouseWorld.y),
  };
}
/* 在画布左下角直接绘制数据面板（无白框，背景亮度自适应 + 阴影增强可读）：
   - 背景取 render 已同步的 state.bgColor，按亮度(>0.58)选深/浅文字
   - 缩放段可点击重置 100%（命中区记录在 HUD.resetZoomRect）
   - 左下角固定锚点，天然避开底部刻度线（刻度线更靠内/下方） */
function drawStatusHUD(){
  if(!HUD)return;
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const bg=state.bgColor||(state.dark?"#1a1a2e":"#ffffff");
  const m=/^#?([0-9a-f]{6})$/i.exec(bg);
  let lum=1;
  if(m){
    const r=parseInt(m[1].slice(0,2),16),g=parseInt(m[1].slice(2,4),16),b=parseInt(m[1].slice(4,6),16);
    lum=(0.299*r+0.587*g+0.114*b)/255;
  }
  const light=lum>0.58;
  const fg=light?"rgba(26,30,44,.88)":"rgba(236,240,248,.94)";
  const faint=light?"rgba(26,30,44,.56)":"rgba(236,240,248,.6)";
  ctx.font="500 11px "+FONT;
  ctx.textBaseline="alphabetic";
  ctx.textAlign="left";
  const x=14,y=H-14,sep=16;
  let cx=x,rects=[];
  ctx.shadowColor=light?"rgba(0,0,0,.32)":"rgba(0,0,0,.55)";
  ctx.shadowBlur=4;ctx.shadowOffsetY=1;
  for(const s of HUD.segs){
    const str=(s.k?s.k+" ":"")+s.txt;
    const tw=ctx.measureText(str).width;
    if(s.dot){
      ctx.fillStyle=s.dot;
      ctx.beginPath();ctx.arc(cx-6,y-5,3.2,0,7);ctx.fill();
    }
    ctx.fillStyle=s.strong?fg:faint;
    ctx.fillText(str,cx+(s.dot?5:0),y);
    rects.push({x:cx-2,y:y-15,w:tw+(s.dot?12:4),h:20});
    cx+=tw+(s.dot?12:4)+sep-4;
  }
  cx+=6;
  const zx=cx;
  const zstr="缩放 "+HUD.zoom+"%";
  ctx.fillStyle=fg;
  ctx.fillText(zstr,zx,y);
  rects.push({x:zx-2,y:y-15,w:ctx.measureText(zstr).width+6,h:20});
  cx+=ctx.measureText(zstr).width+sep;
  const cstr="坐标 "+HUD.mx+", "+HUD.my;
  ctx.fillStyle=faint;
  ctx.fillText(cstr,cx,y);
  ctx.shadowColor="transparent";ctx.shadowBlur=0;
  HUD.rects=rects;
  /* I5-fix: 缩放区是最后 push 的一格，取 length-1——原 -1 错位导致点最后一个计数段
     会意外重置缩放、点"缩放 NN%"反而无反应 */
  HUD.resetZoomRect=rects[rects.length-1];
  ctx.restore();
}
/* 画布左下的 HUD 命中检测：返回 "zoom"（重置缩放）/ "hud"（整个面板） */
function statusHUDHit(sx,sy){
  if(!HUD||!HUD.rects)return null;
  if(HUD.resetZoomRect&&sx>=HUD.resetZoomRect.x&&sx<=HUD.resetZoomRect.x+HUD.resetZoomRect.w&&sy>=HUD.resetZoomRect.y&&sy<=HUD.resetZoomRect.y+HUD.resetZoomRect.h)return "zoom";
  for(const r of HUD.rects){
    if(sx>=r.x&&sx<=r.x+r.w&&sy>=r.y&&sy<=r.y+r.h)return "hud";
  }
  return null;
}
/* 暗色/亮色主题切换：只切换 data-theme 属性，变量覆盖由 CSS 负责 */
/* G10: theme token — 手动切换时递增，使启动时的异步 getSystemTheme 回调过期失效 */
var _themeToken=0;
function applyTheme(){
  /* G2/G3: autoTheme 跟随系统——桌面用 electronAPI，网页用 matchMedia */
  if(state.autoTheme){
    if(window.electronAPI&&window.electronAPI.getSystemTheme){
      /* Electron 桌面：异步读取系统主题，回调中补 render+saveState 确保画布同步 */
      var myToken=++_themeToken;
      window.electronAPI.getSystemTheme().then(function(t){
        if(myToken!==_themeToken)return;  /* 过期回调，用户已手动切换 */
        var prev=state.dark;
        state.dark=(t==="dark");
        _applyThemeInner();
        if(prev!==state.dark){requestRender();saveStateDebounced();}
      });
      return;
    }
    var sys=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");
    if(sys){state.dark=sys.matches;}
  }
  _applyThemeInner();
}
function _applyThemeInner(){
  document.documentElement.setAttribute("data-theme",state.dark?"dark":"light");
  document.body.classList.toggle("reduced-motion",!!state.reducedMotion); /* H1 任务4: 减弱动画开关联动 body class，让 #bg-l1-drift 等 CSS 动画停止 */
  document.documentElement.dataset.style=state.stylePreset||DEFAULT_STYLE;
  document.documentElement.dataset.variant=variantOf(state.stylePreset||DEFAULT_STYLE);
  document.documentElement.dataset.bgfamily=driftFamilyOf(state.bgColorName||"default");
  if(typeof updateBgLayers==="function")updateBgLayers();
  if(typeof applyLogo==="function"){var sl=parseInt(localStorage.getItem("zhijian-logo"))||3;applyLogo(sl);}
}
/* G2/G3: 系统主题变化监听——网页用 matchMedia，桌面用 nativeTheme IPC（main.js 已处理） */
if(window.matchMedia&&!window.electronAPI){
  var _mq=window.matchMedia("(prefers-color-scheme: dark)");
  var _mqCb=function(){if(state.autoTheme){state.dark=_mq.matches;applyTheme();requestRender();saveStateDebounced();}};
  if(_mq.addEventListener){_mq.addEventListener("change",_mqCb);}
  else if(_mq.addListener){_mq.addListener(_mqCb);}
}
function applyFontPreset(){
  /* 字体分离原则：只改画布字体 FONT，不动 UI 字体变量(--font/--brand-font)。
     UI 界面字体恒为系统默认（Satoshi/雅黑），由 CSS :root 定义；画布内节点/便签/连线
     字体随 fontPreset 切换。 */
  /* 旧版本的 elegant 指向 Montserrat；该字体已从产品选项中移除，
     读取旧存档时无缝迁移到中文艺术手写。 */
  if(state.fontPreset==="elegant")state.fontPreset="artistic";
  for(const project of state.projects||[]){
    for(const canvas of project.canvases||[]){
      for(const item of canvas.items||[]){
        if(item.fontFamily==="elegant")item.fontFamily="artistic";
      }
    }
  }
  const preset=FONT_PRESETS[state.fontPreset]||FONT_PRESETS.serif;
  FONT=preset.stack;
}
/* 整体样式切换：仅切换画布视觉风格；画布字体内在联动（可被后续独立切换覆盖）
   —— paper 拟物自动切手写字体（节点/便签/连线质感一致）
   —— minimal 简约自动切宋体（干净正文字体层级）
   —— UI 字体不受任何样式切换影响 */

/* E5: Logo system — 3 icon sets. G1: paths use g1/ prefix (HTML is in parent dir) */
const LOGO_PRESETS={
  1:{label:"穿线元素",light:"src/assets/logos/logo1-light.png",dark:"src/assets/logos/logo1-dark.png",
     cnLight:"src/assets/logos/logo01-中文字标-light.png",cnDark:"src/assets/logos/logo01-中文字标-dark.png",
     enLight:"src/assets/logos/logo01-英文字标-light.png",enDark:"src/assets/logos/logo01-英文字标-dark.png",
     comboLight:"src/assets/logos/logo01-横版组合-light.png",comboDark:"src/assets/logos/logo01-横版组合-dark.png"},
  2:{label:"聚焦轨道",light:"src/assets/logos/logo2-light.png",dark:"src/assets/logos/logo2-dark.png",
     cnLight:"src/assets/logos/logo02-中文字标-light.png",cnDark:"src/assets/logos/logo02-中文字标-dark.png",
     enLight:"src/assets/logos/logo02-英文字标-light.png",enDark:"src/assets/logos/logo02-英文字标-dark.png",
     comboLight:"src/assets/logos/logo02-横版组合-light.png",comboDark:"src/assets/logos/logo02-横版组合-dark.png"},
  3:{label:"叠合元素",light:"src/assets/logos/logo3-light.png",dark:"src/assets/logos/logo3-dark.png",
     cnLight:"src/assets/logos/logo03-中文字标-light.png",cnDark:"src/assets/logos/logo03-中文字标-dark.png",
     enLight:"src/assets/logos/logo03-英文字标-light.png",enDark:"src/assets/logos/logo03-英文字标-dark.png",
     comboLight:"src/assets/logos/logo03-横版组合-light.png",comboDark:"src/assets/logos/logo03-横版组合-dark.png"},
};
let logoPreset=3;
function applyLogo(n,showToast){
  logoPreset=n;
  var preset=LOGO_PRESETS[n]||LOGO_PRESETS[1];
  var isDark=document.documentElement.getAttribute("data-theme")==="dark";
  var comboSrc=isDark?preset.comboDark:preset.comboLight;
  document.querySelectorAll(".brand-combo").forEach(function(img){img.src=comboSrc;});
  var bfSrc=isDark?preset.comboDark:preset.comboLight;
  document.querySelectorAll(".bf-cn").forEach(function(img){img.src=bfSrc;});
  localStorage.setItem("zhijian-logo",String(n));
  /* G11: 联动任务栏图标 — 预设变化时同步更新任务栏 */
  if(window.electronAPI&&window.electronAPI.setTaskbarIcon){
    var _iconStyle=localStorage.getItem("zhijian-icon-style")||"clean";
    window.electronAPI.setTaskbarIcon({preset:n,style:_iconStyle}).then(function(r){
      if(r&&r.ok===false)console.error("taskbar icon failed:",r.error);
    });
  }
  /* G9: 仅在用户手动切换图标时弹 toast，主题切换时不弹 */
  if(showToast)toast("图标："+preset.label);
}
(function bindSettingsButton(){
  var btn=document.querySelector(".bf-settings");
  if(!btn)return;
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  btn.addEventListener("click",showSettings);
})();
/* removed unreliable keydown pointer-events toggle — Ctrl+click now handled in el capture phase */

function applyStyle(key){
  if(STYLE_ALIAS[key])key=STYLE_ALIAS[key];    /* 兼容旧值：fluent → glass */
  if(!STYLE_PRESETS[key])return;
  state.stylePreset=key;
  document.documentElement.dataset.style=key;
  document.documentElement.dataset.variant=variantOf(key);  /* F1: 变体驱动 chrome */
  if(key==="neumorph"||key==="minimal"||key==="editorial"){state.fontPreset="serif";applyFontPreset();}
  /* 字体联动规则：仅"自带字体配置"的样式切换时同步恢复其专属字体；
     其余样式（默认/玻璃）不碰字体，保持用户当前独立选择。 */
  render();saveStateDebounced();
  toast("样式："+STYLE_PRESETS[key].label);
}
/* Canvas 暗黑模式颜色适配 */
function dc(light,dark){return state.dark?dark:light;}
/* F1 材质系统：更新 L1–L4 背景层 data 属性，CSS 驱动实际渲染。
   - data-bgpattern: grid/dots/lines/kraft/blank → L4 图案层显隐 + 类型
   - data-bgfamily: neutral/warm/cool/green → L1 漂移色族
   - data-variant: fluent/neumorph/minimal → 各层开关（由 applyStyle/applyTheme 设置）
   - #board 背景 = 用户底色（L2 Mica 半透明，底色透出）
   调用时机：applyTheme / applyStyle / bgBtn / bgColorBtn */
function updateBgLayers(){
  const de=document.documentElement;
  de.dataset.bgpattern=state.bgPattern||"grid";
  de.dataset.bgfamily=driftFamilyOf(state.bgColorName||"default");
  /* F2: 先重算 bgColor（主题切换时 render() 尚未跑到，需确保同步） */
  state.bgColor=getBgColor(state.bgColorName,state.dark);
  const board=document.getElementById("board");
  if(board){board.style.background=state.bgColor;}
  /* F3: 拟态/简约变体 L2 = 用户底色（固定实色会盖住底色，导致切换无效） */
  const l2=document.getElementById("bg-l2-mica");
  if(l2){
    const v=variantOf(state.stylePreset||DEFAULT_STYLE);
    if(v==="neumorph"||v==="minimal"){
      l2.style.background=state.bgColor;
    }else{
      l2.style.background=""; /* 让 CSS 渐变规则接管 */
    }
  }
}
function darkenColor(hex,factor){
  if(!hex||!hex.startsWith("#"))return hex;
  const r=Math.round(parseInt(hex.slice(1,3),16)*factor);
  const g=Math.round(parseInt(hex.slice(3,5),16)*factor);
  const b=Math.round(parseInt(hex.slice(5,7),16)*factor);
  return"#"+r.toString(16).padStart(2,"0")+g.toString(16).padStart(2,"0")+b.toString(16).padStart(2,"0");
}
/* 提亮(>1)或调暗(<1)十六进制颜色，结果 clamp 到 0-255 */
function shadeColor(hex,factor){
  if(!hex||!hex.startsWith("#"))return hex;
  const cl= v=>Math.max(0,Math.min(255,Math.round(v)));
  const r=cl(parseInt(hex.slice(1,3),16)*factor);
  const g=cl(parseInt(hex.slice(3,5),16)*factor);
  const b=cl(parseInt(hex.slice(5,7),16)*factor);
  return"#"+r.toString(16).padStart(2,"0")+g.toString(16).padStart(2,"0")+b.toString(16).padStart(2,"0");
}
/* 十六进制色转 rgba 字符串 */
function hexToRgba(hex,alpha){
  if(!hex||!hex.startsWith("#"))return hex;
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return"rgba("+r+","+g+","+b+","+alpha+")";
}

/* ============================================================
   键盘
============================================================ */
document.addEventListener("keydown",e=>{
  /* I5-fix: 中文输入法组词期间不响应任何快捷键——否则确认候选词的回车会被当成"提交+建同级"、
     Esc 会取消整个编辑（网页/macOS 下必现；Windows Electron 此前靠 key==="Process" 侥幸避开） */
  if(e.isComposing||e.keyCode===229)return;
  /* I5-fix: 应用内弹窗打开期间屏蔽画布快捷键——此前 Del 能删掉弹窗背后的选中元素、
     C/A/P/N/B 照常改画布、Esc 是清空选区而不是关弹窗 */
  if(modal&&modal.classList.contains("show")){
    if(e.key==="Escape")hideModal();
    return;
  }
  if(isTyping()){
    if(e.key==="Escape"){closeEditor(true);closeMindEditor(true);}
    if(e.key==="Enter"&&!e.shiftKey){
      /* 规范：Enter = 建立同级（与选中态一致）。Ctrl/Cmd+Enter = 仅确认不新建 */
      if(editingMindId!==null){
        const n=state.items.find(i=>i.id===editingMindId);
        closeMindEditor(false);
        if(n&&(e.ctrlKey||e.metaKey)){render();saveStateDebounced();}
        else if(n)addSiblingMind(n);
      }
      else if(editingNoteId!==null){
        /* 便签：Enter 换行（默认行为），Ctrl/Cmd+Enter 才完成编辑 */
        if(e.ctrlKey||e.metaKey){e.preventDefault();closeEditor(false);}
        /* 否则不拦截，让 textarea 正常换行 */
      }
    }
    /* 规范：Tab = 建立子级（与选中态一致） */
    if(e.key==="Tab"&&!e.altKey){
      if(editingMindId!==null){
        e.preventDefault();
        const n=state.items.find(i=>i.id===editingMindId);
        closeMindEditor(false);
        if(n)addChildMind(n);
      }
    }
    return;
  }
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&(e.key==="z"||e.key==="Z")){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&(e.key==="y"||e.key==="Y")){e.preventDefault();redo();return;}
  if(mod&&e.key.toLowerCase()==="d"){e.preventDefault();const s=selectedItem();if(s)duplicateItem(s.id);return;}
  if(e.key==="Delete"||e.key==="Backspace"){
    if((document.activeElement&&document.activeElement.tagName)==="INPUT") return;
    const s=selectedItem();if(s)deleteItem(s.id);
    return;
  }
  if(e.key==="Escape"){
    /* 全屏预览优先退出 */
    const fv=document.getElementById("fullscreenView");
    if(fv&&!fv.hidden){closeFullscreen();return;}
    if(state.focusMode){exitFocus();return;}
    if(state.tempTool){state.tempTool=null;setTool("select");toast("已退出临时工具");return;}
    state.selected=null;state.multiSel=[];hideCtxMenu();helpPop.style.display="none";render();return;
  }
  if(e.key===" "){state.spaceDown=true;board.classList.add("space-pan");e.preventDefault();return;}
  const k=e.key.toLowerCase();
  const t=TOOLS.find(t=>t.key===k.toUpperCase());
  if(t&&!e.ctrlKey&&!e.metaKey&&!e.altKey) setTool(t.id);
  /* 临时工具：P 画笔 / N 便签（所见即所得，用完自动退出） */
  if(e.key==="p"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){setTool("select");state.tempTool=state.tempTool==="pen"?"": "pen";renderToolOptions();toast(state.tempTool==="pen"?"画笔模式：按住左键涂鸦":"已退出");return;}
  if(e.key==="n"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(state.tempTool==="note"){state.tempTool="";renderToolOptions();toast("已退出便签模式");}else{setTool("select");state.tempTool="note";renderToolOptions();toast("便签模式：点击空白添加");}return;}
  /* 导图快捷键（选中节点即可，不限工具） */
  if(e.key==="Tab"&&!e.altKey&&!e.ctrlKey){e.preventDefault();const s=selectedItem();if(s&&s.type==="mindNode")addChildMind(s);return;}
  if(e.key==="Enter"&&!e.altKey&&!e.ctrlKey&&!isTyping()){e.preventDefault();const s=selectedItem();if(s&&s.type==="mindNode")addSiblingMind(s);else if(s&&(s.type==="note"||s.type==="mindNode"))openTextEditor(s);return;}
  if(e.key==="-"&&!e.altKey&&!e.ctrlKey){e.preventDefault();const s=selectedItem();if(s&&s.type==="mindNode")toggleCollapse(s);}
  if((e.key==="+"||e.key==="=")&&!e.altKey&&!e.ctrlKey){e.preventDefault();const s=selectedItem();if(s&&s.type==="mindNode"){s.collapsed=false;render();saveStateDebounced();}}
  /* Alt+方向键：同级排序 / 提级 / 降级 */
  if(e.altKey&&!e.ctrlKey){
    if(e.key==="ArrowUp"){e.preventDefault();moveSibling(-1);return;}
    if(e.key==="ArrowDown"){e.preventDefault();moveSibling(1);return;}
    if(e.key==="ArrowLeft"){e.preventDefault();promoteNode();return;}
    if(e.key==="ArrowRight"){e.preventDefault();demoteNode();return;}
  }
  /* Shift+方向键：空间导航到最近节点 */
  if(e.shiftKey&&!e.ctrlKey&&!e.altKey&&!isTyping()){
    const dirs={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
    const d=dirs[e.key];
    if(d){
      e.preventDefault();
      const sel=selectedItem();
      if(!sel)return;
      const sb=itemBounds(sel);
      if(!sb)return;
      const cx=sb.x+sb.w/2,cy=sb.y+sb.h/2;
      let best=null,bestDist=Infinity;
      for(const it of state.items){
        if(it.id===sel.id)continue;
        if(it.type!=="mindNode"&&it.type!=="note"&&it.type!=="fileCard")continue;
        if(it.type==="mindNode"&&!isMindNodeVisible(it))continue;
        const b=itemBounds(it);if(!b)continue;
        const dx=(b.x+b.w/2)-cx,dy=(b.y+b.h/2)-cy;
        /* 方向投影必须为正（在目标方向上） */
        const proj=dx*d.x+dy*d.y;
        if(proj<=0)continue;
        const dist=Math.hypot(dx,dy);
        if(dist<bestDist){bestDist=dist;best=it;}
      }
      if(best){state.selected=best.id;state.multiSel=[];render();updateSelBar();}
      return;
    }
  }
  /* C 键：连接/断开（需多选两个元素） */
  /* C 键：连接/断开 */
  if(e.key==="c"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();toggleLink();return;}
  /* 全屏预览/编辑：Alt+F */
  if(e.altKey&&e.key.toLowerCase()==="f"){
    e.preventDefault();
    const s=selectedItem();
    if(s&&s.type==="fileCard"){
      const f=state.files.find(x=>x.id===s.fileId);
      if(f){const r=getFileCardOriginRect(s);openFullscreen(f,r?{originRect:r}:{});toast("全屏预览："+f.name);}
    }else if(s&&s.type==="note"){
      openFullscreenNote(s);
    }else if(s&&s.type==="mindNode"){
      openDetailFullscreen(s);
      toast("全屏编辑："+(s.text||"节点"));
    }
    return;
  }
  /* 沉浸模式：F11 切换（隐藏/恢复辅助元素） */
  if(e.key==="F11"){
    e.preventDefault();
    toggleImmersive();
    return;
  }
  /* J4: 原生全屏：Alt+Enter 切换窗口全屏 */
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.key==="Enter"){
    e.preventDefault();
    if(window.electronAPI&&window.electronAPI.toggleFullscreen)window.electronAPI.toggleFullscreen();
    return;
  }
  /* A 键：添加批注 */
  if(e.key==="a"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openAnnotation();return;}
  /* E 键：编辑展开内容 */
  if(e.key==="e"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    e.preventDefault();
    const s=selectedItem();
    if(!s)return;
    if(s.type==="mindNode")toggleDetailInPlace(s);
    else if(s.type==="fileCard"){togglePreviewMorph(s);}
    return;
  }
  /* E5: Alt+E = delete detail content (mindNode only) */
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&(e.key==="e"||e.key==="Æ")){
    e.preventDefault();
    const s=selectedItem();
    if(!s||s.type!=="mindNode"||!s.detail)return;
    pushHistory("删除展开内容");
    s.detail="";collapseDetailInPlace();
    render();saveStateDebounced();toast("已删除展开内容");
    return;
  }
  /* F 键：聚焦模式 */
      /* C8: Shift+1/2/3/4 = add standalone node at that depth level */
  if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!isTyping()){
    var lvl=parseInt(e.code.replace("Digit",""));
    if(lvl>=1&&lvl<=4){
      e.preventDefault();
      pushHistory("添加"+lvl+"级节点");
      var wpt=state.mouseWorld||{x:W/2/state.camera.zoom+state.camera.x,y:H/2/state.camera.zoom+state.camera.y};
      var n=addMindNode(defaultNodeName(null),null,state.mindColor,wpt.x,wpt.y);
      n._forcedDepth=lvl-1;
      state.selected=n.id;
      render();saveStateDebounced();
      setTimeout(function(){openTextEditor(n);},50);
      return;
    }
  }
  if(e.key==="b"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(state.tool==="marquee"){state.tool="select";board.className="mode-select";renderToolOptions();toast("已退出框选");}else{state.tool="marquee";board.className="mode-marquee";renderToolOptions();toast("框选模式");}return;}
  if(e.key==="g"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();gazeAtSelection();return;}
  if(e.key==="y"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();fitAll();return;}
  if(e.key==="f"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();toggleFocus();return;}
  /* J 键：跃迁 */
  if(e.key==="j"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();openJump();return;}
});
document.addEventListener("keyup",e=>{
  if(e.key===" "){state.spaceDown=false;board.classList.remove("space-pan");}
});

/* ============================================================
   工具栏
============================================================ */
function setTool(id){
  state.tool=id;
  board.className="mode-"+id+(state.spaceDown?" space-pan":"");
  requestRender();
}
/* 历史遗留的空钩子：buildToolbar/renderToolOptions 的功能早已移到下拉菜单与 Dock，
   但调用点分布在 app/interaction 两文件的多个工具切换路径里，保留空实现避免无谓的改动面 */
function buildToolbar(){
}
function renderToolOptions(){
}

function toast(msg){
  toastEl.textContent=msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t=setTimeout(()=>toastEl.classList.remove("show"),2200);
}

/* ============================================================
   初始化
============================================================ */
function mountControls(){
  document.getElementById("undoBtn").innerHTML=ICON.undo;
  document.getElementById("redoBtn").innerHTML=ICON.redo;
  document.getElementById("zoomInBtn").innerHTML=ICON.zoomIn;
  document.getElementById("zoomOutBtn").innerHTML=ICON.zoomOut;
  document.getElementById("fitBtn").innerHTML=ICON.fit;
  document.getElementById("helpBtn").innerHTML=ICON.help;
  document.getElementById("bgBtn").innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>';
  document.getElementById("bgColorBtn").innerHTML=ICON.palette;
  document.getElementById("themeBtn").innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
  document.getElementById("exportBtn").innerHTML=ICON.export+"导出";
  document.getElementById("importBtn").innerHTML=ICON.import+"导入";
  document.getElementById("libImportBtn").innerHTML=ICON.plus;
  document.getElementById("newProjectBtn").innerHTML=ICON.plus;
  document.getElementById("newCanvasBtn").innerHTML=ICON.plus;
  /* 侧栏唯一突出部件：常驻展开显示 <（收起），收起态显示 >（展开）——由 applySide 统一维护 */

  document.getElementById("undoBtn").addEventListener("click",undo);
  document.getElementById("redoBtn").addEventListener("click",redo);
  document.getElementById("zoomInBtn").addEventListener("click",()=>zoomAt(W/2,H/2,1.25));
  document.getElementById("zoomOutBtn").addEventListener("click",()=>zoomAt(W/2,H/2,0.8));
  document.getElementById("zoomPct").addEventListener("click",()=>{
    /* 重置到100%：保持视口中心不变 */
    const oldZoom=state.camera.zoom;
    const cx=state.camera.x+W/(2*oldZoom);
    const cy=state.camera.y+H/(2*oldZoom);
    state.camera.zoom=1;
    state.camera.x=cx-W/2;
    state.camera.y=cy-H/2;
    if(zoomPctEl)zoomPctEl.textContent="100%";
    render();updateStatusBar();
  });
  document.getElementById("fitBtn").addEventListener("click",fitAll);
  document.getElementById("fitBtn").title="纵览全部内容";
  document.getElementById("helpBtn").addEventListener("click",e=>{
    helpPop.style.display=helpPop.style.display==="block"?"none":"block";
    if(helpPop.style.display==="block"){
      const r=e.currentTarget.getBoundingClientRect();
      helpPop.style.right="44px";
      helpPop.style.top="40px";
    }
  });
  document.getElementById("bgBtn").addEventListener("click",()=>{
    const pats=["grid","dots","lines","blank"];
    const labels={grid:"方格",dots:"点阵",lines:"横格",blank:"纯色无纹理"};
    const idx=pats.indexOf(state.bgPattern||"grid");
    /* F4: kraft 已移除，旧值迁移到 blank */
    if(idx===-1)state.bgPattern="grid";
    state.bgPattern=pats[(idx+1)%pats.length]||"grid";
    if(typeof updateBgLayers==="function")updateBgLayers();
    render();saveStateDebounced();
    toast("纹理："+labels[state.bgPattern]);
  });
  document.getElementById("bgColorBtn").addEventListener("click",()=>{
    const cols=["default","eye","cream","blue","kraft"];
    const idx=cols.indexOf(state.bgColorName||"default");
    state.bgColorName=cols[(idx+1)%cols.length];
    state.bgColor=getBgColor(state.bgColorName,state.dark);
    document.documentElement.dataset.bgfamily=driftFamilyOf(state.bgColorName);
    if(typeof updateBgLayers==="function")updateBgLayers();
    render();saveStateDebounced();
    requestAnimationFrame(()=>render());
  });
  document.getElementById("themeBtn").addEventListener("click",()=>{
    /* I5-fix: 顶栏主题按钮此前在"跟随系统"（默认开）时被 applyTheme 的系统回读立刻打回，形同虚设。
       手动切换即视为退出跟随系统，与设置面板的明/暗按钮同一待遇 */
    state.autoTheme=false;
    state.dark=!state.dark;
    _applyThemeInner();
    render();saveStateDebounced();
    toast((state.dark?"暗色模式":"亮色模式")+"（已退出跟随系统）");
    /* 强制再绘一帧，确保 Canvas 和 DOM 同步 */
    requestAnimationFrame(()=>render());
  });
  document.getElementById("exportBtn").addEventListener("click",showExportOptions);
  document.getElementById("importBtn").addEventListener("click",showImportOptions);
  document.getElementById("libImportBtn").addEventListener("click",function(e){
    showFloatMenu(e.currentTarget,[
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>',label:"本地文件",onClick:()=>fileInput.click()},
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',label:"整个文件夹",onClick:()=>document.getElementById("folderInput").click()},
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',label:"网页链接",onClick:()=>showLinkPrompt(function(url,name){if(url&&/^https?:\/\//i.test(url))addLinkFile(url,name);})}
    ]);
  });
  fileInput.addEventListener("change",async()=>{
    const files=Array.from(fileInput.files||[]);
    fileInput.value="";
    if(files.length)await importFiles(files);
  });
  document.getElementById("newProjectBtn").addEventListener("click",function(e){
    showFloatMenu(e.currentTarget,[
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',label:"新建空白项目",onClick:()=>showPrompt("新建项目","项目名称","新项目",function(name){if(name)createProject(name);})},
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',label:"导入项目包",onClick:function(){var inp=document.createElement("input");inp.type="file";inp.accept=".json";inp.onchange=function(){if(inp.files&&inp.files[0])importProject(inp.files[0]);};inp.click();}}
    ]);
  });
  document.getElementById("newCanvasBtn").addEventListener("click",function(e){
    showFloatMenu(e.currentTarget,[
      {icon:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',label:"新建空白画布",onClick:()=>showPrompt("新建画布","画布名称","新画布",function(name){if(name)createCanvas(name);})}
    ]);
  });

  function toggleSidePersistent(){
    /* 显式点把手是固定状态的意图，不让任何临时 peek 残留干扰这次切换。 */
    if(peekTimer){clearTimeout(peekTimer);peekTimer=0;}
    if(peekEnterTimer){clearTimeout(peekEnterTimer);peekEnterTimer=0;}
    sidePanel.classList.remove("peek");
    state.sideCollapsed=!state.sideCollapsed;state._respAuto=false;
    applySide();saveStateDebounced();
  }
  /* Logo 是第二个显式入口：不依赖贴边悬停，键盘也可以完成同一操作。 */
  if(brandEl){
    brandEl.setAttribute("role","button");
    brandEl.tabIndex=0;
    const toggleFromBrand=()=>{
      brandEl.classList.remove("side-switch");
      void brandEl.offsetWidth; /* 重启动画，连续点击也有状态反馈 */
      brandEl.classList.add("side-switch");
      toggleSidePersistent();
    };
    brandEl.addEventListener("click",toggleFromBrand);
    brandEl.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleFromBrand();}
    });
  }

  /* 侧栏三区可折叠 */
  function toggleSection(id){
    const el=document.getElementById(id);
    if(el) el.classList.toggle("section-collapsed");
  }
  document.getElementById("project-head").addEventListener("click",e=>{
    if(e.target.closest(".icon-btn"))return;
    toggleSection("project-section");
  });
  document.getElementById("canvas-head").addEventListener("click",e=>{
    if(e.target.closest(".icon-btn"))return;
    toggleSection("canvas-section");
  });
  document.getElementById("lib-head").addEventListener("click",e=>{
    if(e.target.closest(".icon-btn"))return;
    const fg=document.getElementById("file-groups");
    if(fg){const hidden=fg.style.display==="none";fg.style.display=hidden?"block":"none";document.getElementById("lib-head").classList.toggle("collapsed",!hidden);}
  });
  /* 下拉菜单栏（WPS风格） */
  const menuDrop=document.getElementById("menuDrop");
  const MENUS={
    layout:[
      {sep:true},
      {icon:"",label:"重新排版",key:"",fn:()=>relayoutCanvas()},
      {sep:true},
      {icon:"",label:"逻辑图",key:"",fn:()=>applyLayout("logic")},
      {icon:"",label:"组织架构图",key:"",fn:()=>applyLayout("org")},
      {icon:"",label:"鱼骨图（因果分析）",key:"",fn:()=>applyLayout("fishbone")},
      {icon:"",label:"时间轴（横向）",key:"",fn:()=>applyLayout("timeline")},
    ],
    style:[
      {icon:"",label:"样式：默认",key:"",fn:()=>applyStyle("clear")},
      {icon:"",label:"样式：玻璃",key:"",fn:()=>applyStyle("glass")},
      {icon:"",label:"样式：新拟态",key:"",fn:()=>applyStyle("neumorph")},
      {icon:"",label:"样式：简约",key:"",fn:()=>applyStyle("minimal")},
      {icon:"",label:"样式：多彩拟态",key:"",fn:()=>applyStyle("colorful")},
      {icon:"",label:"样式：多彩圆角",key:"",fn:()=>applyStyle("bento")},
      {icon:"",label:"样式：多彩矩形",key:"",fn:()=>applyStyle("editorial")},
    ],
    add:[
      {icon:ICON.mind,label:"节点",key:"Tab",fn:()=>{const s=selectedItem();if(s&&s.type==="mindNode"){addChildMind(s);}else{pushHistory("添加节点");const n=addMindNode(defaultNodeName(null),null,state.mindColor,W/2/state.camera.zoom+state.camera.x,H/2/state.camera.zoom+state.camera.y);smartPlace(n);state.selected=n.id;render();saveStateDebounced();}}},
      {icon:ICON.note,label:"便签",key:"N",fn:()=>{setTool("select");state.tempTool=state.tempTool==="note"?"":"note";renderToolOptions();toast(state.tempTool==="note"?"便签模式":"已退出");}},
      {icon:ICON.pen,label:"画笔",key:"P",fn:()=>{setTool("select");state.tempTool=state.tempTool==="pen"?"":"pen";renderToolOptions();toast(state.tempTool==="pen"?"画笔模式":"已退出");}},
      {icon:ICON.plus,label:"放入文件",key:"",fn:()=>{offerImport();}},
      {sep:true},
      {icon:ICON.annotate,label:"添加批注",key:"A",fn:()=>openAnnotation()},
    ],
    relate:[
      {icon:ICON.connector,label:"连接选中",key:"C",fn:()=>toggleLink()},
      {icon:ICON.jump,label:"跃迁到画布",key:"J",fn:()=>openJump()},
    ],
    font:[
      {icon:"",label:"字体 · 界面雅黑",key:"",fn:()=>{state.fontPreset="clear";applyFontPreset();render();saveStateDebounced();toast("字体：界面雅黑");}},
      {icon:"",label:"字体 · 书卷宋体",key:"",fn:()=>{state.fontPreset="serif";applyFontPreset();render();saveStateDebounced();toast("字体：书卷宋体");}},
      {icon:"",label:"字体 · 手写楷体",key:"",fn:()=>{state.fontPreset="handwritten";applyFontPreset();render();saveStateDebounced();toast("字体：手写楷体");}},
      {icon:"",label:"字体 · 艺术手写",key:"",fn:()=>{state.fontPreset="artistic";applyFontPreset();render();saveStateDebounced();toast("字体：艺术手写");}},
      {sep:true},
      {icon:"",label:"字体 · Manrope",key:"",fn:()=>{state.fontPreset="manrope";applyFontPreset();render();saveStateDebounced();toast("字体：Manrope");}},
      {icon:"",label:"字体 · Bricolage",key:"",fn:()=>{state.fontPreset="bricolage";applyFontPreset();render();saveStateDebounced();toast("字体：Bricolage Grotesque");}},
      {icon:"",label:"字体 · Sora",key:"",fn:()=>{state.fontPreset="sora";applyFontPreset();render();saveStateDebounced();toast("字体：Sora");}},
      {icon:"",label:"字体 · Outfit",key:"",fn:()=>{state.fontPreset="outfit";applyFontPreset();render();saveStateDebounced();toast("字体：Outfit");}},
      {icon:"",label:"字体 · Archivo",key:"",fn:()=>{state.fontPreset="archivo";applyFontPreset();render();saveStateDebounced();toast("字体：Archivo");}},
      {icon:"",label:"字体 · Space Mono",key:"",fn:()=>{state.fontPreset="spaceMono";applyFontPreset();render();saveStateDebounced();toast("字体：Space Mono");}},
      {icon:"",label:"字体 · IBM Plex",key:"",fn:()=>{state.fontPreset="ibm";applyFontPreset();render();saveStateDebounced();toast("字体：IBM Plex Sans");}},
      {icon:"",label:"字体 · Syne",key:"",fn:()=>{state.fontPreset="syne";applyFontPreset();render();saveStateDebounced();toast("字体：Syne");}},
      {icon:"",label:"字体 · Epilogue",key:"",fn:()=>{state.fontPreset="epilogue";applyFontPreset();render();saveStateDebounced();toast("字体：Epilogue");}},
    ],
    view:[
      {icon:ICON.focus,label:"聚焦模式",key:"F",fn:()=>toggleFocus()},
      {icon:"",label:"凝视（100%居中）",key:"G",fn:()=>gazeAtSelection()},
      {icon:"",label:"纵览（全部内容）",key:"Y",fn:()=>fitAll()},
      {icon:"",label:"沉浸模式",key:"F11",fn:()=>toggleImmersive()},
      {icon:"",label:"全屏",key:"Alt+Enter",fn:()=>{if(window.electronAPI&&window.electronAPI.toggleFullscreen)window.electronAPI.toggleFullscreen();}},
      {sep:true},
      {icon:"",label:"重置织见学堂",key:"",fn:()=>resetTutorial()},
      {icon:"",label:"设置",key:"",fn:()=>showSettings()},
    ],
  };
  function showMenuDrop(key,btn){
    const items=MENUS[key];if(!items)return;
    menuDrop.innerHTML="";
    for(const it of items){
      if(it.sep){const s=document.createElement("div");s.className="sep";menuDrop.appendChild(s);continue;}
      const mi=document.createElement("button");
      mi.className="mi";
      mi.innerHTML='<span class="mi-ic">'+(it.icon||"")+'</span><span class="mi-label">'+it.label+'</span>'+(it.key?'<span class="mi-key">'+it.key+'</span>':'');
      mi.addEventListener("click",()=>{hideMenuDrop();it.fn();});
      menuDrop.appendChild(mi);
    }
    const r=btn.getBoundingClientRect();
    menuDrop.style.left=r.left+"px";
    menuDrop.style.top=(r.bottom+4)+"px";
    menuDrop.classList.add("show");
  }
  function hideMenuDrop(){menuDrop.classList.remove("show");}
  document.querySelectorAll(".menu-tab").forEach(tab=>{
    tab.addEventListener("click",e=>{
      e.stopPropagation();
      const key=tab.dataset.menu;
      const isActive=tab.classList.contains("active");
      document.querySelectorAll(".menu-tab").forEach(t=>t.classList.remove("active"));
      if(isActive){hideMenuDrop();return;}
      tab.classList.add("active");
      showMenuDrop(key,tab);
    });
  });
  document.addEventListener("click",e=>{
    if(!menuDrop.contains(e.target)&&!e.target.classList.contains("menu-tab"))hideMenuDrop();
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape")hideMenuDrop();});

  mountSearch();
}
/* ============================================================
   全局搜索（Ctrl+F / 顶栏输入框）
============================================================ */
function mountSearch(){
  const input=document.getElementById("searchInput");
  const wrap=document.getElementById("searchWrap");
  const resBox=document.getElementById("searchResults");
  const cnt=document.getElementById("searchCount");

  function itemLabel(it){
    if(it.type==="mindNode") return it.text||"(空)";
    if(it.type==="note") return it.text||"" ;
    if(it.type==="fileCard"){
      const f=state.files.find(x=>x.id===it.fileId);
      return f?f.name:"材料";
    }
    return "";
  }
  function itemTypeLabel(it){
    return it.type==="mindNode"?"节点":it.type==="note"?"便签":it.type==="fileCard"?"材料":"图形";
  }
  function runSearch(){
    const q=input.value.trim().toLowerCase();
    if(!q){ state.search=null; resBox.style.display="none"; cnt.textContent=""; hideSearchHighlights(); render(); return; }
    const results=[];
    for(const it of state.items){
      const label=itemLabel(it);
      if(label.toLowerCase().includes(q)||(it.detail||"").toLowerCase().includes(q)){
        results.push(it.id);
      }
    }
    state.search={q,results:results,idx:results.length?0:-1};
    renderResults();
    if(results.length){highlightResults();gotoResult(0);}
    else render();
  }
  function renderResults(){
    const s=state.search;
    if(!s){resBox.style.display="none";cnt.textContent="";return;}
    cnt.textContent=s.results.length?s.results.length+" 条":"0";
    resBox.innerHTML="";
    if(!s.results.length){
      const e=document.createElement("div");e.className="sr-empty";e.textContent="无匹配结果";
      resBox.appendChild(e);resBox.style.display="block";
      return;
    }
    const maxShow=30;
    s.results.slice(0,maxShow).forEach((id,i)=>{
      const it=state.items.find(x=>x.id===id);
      if(!it) return;
      const row=document.createElement("div");
      row.className="sr-item"+(i===s.idx?" sr-active":"");
      row.innerHTML='<span class="sr-type">'+itemTypeLabel(it)+'</span><span class="sr-txt"></span>';
      row.querySelector(".sr-txt").textContent=itemLabel(it);
      row.addEventListener("mousedown",e=>{e.preventDefault();gotoResult(i);});
      resBox.appendChild(row);
    });
    resBox.style.display="block";
  }
  function gotoResult(i){
    const s=state.search;
    if(!s||i<0||i>=s.results.length) return;
    s.idx=i;
    const id=s.results[i];
    const it=state.items.find(x=>x.id===id);
    if(it){
      const b=itemBounds(it);
      if(b){
        state.camera.x=b.x+b.w/2-W/state.camera.zoom/2;
        state.camera.y=b.y+b.h/2-H/state.camera.zoom/2;
      }
      state.selected=id;
    }
    highlightResults();
    renderResults();
    render();
  }
  function highlightResults(){
    const s=state.search;
    if(!s) return;
    state._hlIds=s.results;
    requestRender();
  }
  function hideSearchHighlights(){ state._hlIds=null; }

  input.addEventListener("input",runSearch);
  input.addEventListener("focus",()=>{if(state.search)renderResults();});
  input.addEventListener("keydown",e=>{
    if(e.key==="Escape"){input.blur();resBox.style.display="none";hideSearchHighlights();render();}
    if(e.key==="Enter"||e.key==="ArrowDown"){e.preventDefault();const s=state.search;if(s)gotoResult(Math.min(s.idx+1,s.results.length-1));}
    if(e.key==="ArrowUp"){e.preventDefault();const s=state.search;if(s)gotoResult(Math.max(s.idx-1,0));}
    e.stopPropagation();
  });
  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="f"){
      e.preventDefault();
      input.focus();input.select();
    }
  });
  /* 点击外部关闭 */
  document.addEventListener("pointerdown",e=>{
    if(!wrap.contains(e.target)){resBox.style.display="none";hideSearchHighlights();render();}
  });
}

/* E5: Float menu — positioned next to anchor element, not at cursor */
const floatMenu=document.getElementById("floatMenu");
function showFloatMenu(anchorEl,items){
  if(!anchorEl||!items||!items.length)return;
  floatMenu.innerHTML="";
  for(const it of items){
    if(it.sep){const s=document.createElement("div");s.className="fm-sep";floatMenu.appendChild(s);continue;}
    const el=document.createElement("div");
    el.className="fm-item"+(it.danger?" danger":"");
    el.innerHTML='<span class="fm-icon">'+(it.icon||"")+'</span><span>'+it.label+'</span>';
    el.addEventListener("click",()=>{hideFloatMenu();if(it.onClick)it.onClick();});
    floatMenu.appendChild(el);
  }
  var r=anchorEl.getBoundingClientRect();
  var mw=floatMenu.offsetWidth||180,mh=floatMenu.offsetHeight||100;
  var left=r.right+4;
  if(left+mw>window.innerWidth)left=Math.max(4,r.left-mw-4);
  var top=r.top;
  if(top+mh>window.innerHeight)top=Math.max(4,window.innerHeight-mh-4);
  floatMenu.style.left=left+"px";
  floatMenu.style.top=top+"px";
  floatMenu.classList.add("show");
  /* F7: 修复 pointerdown 过早关闭菜单 — 原代码在 document 上加 {once:true} 的 pointerdown 监听，
     点击菜单项时 pointerdown 先于 click 触发，菜单被清空后 click 找不到目标 → 按钮无反应。
     修复：只在外部点击时关闭，内部点击放行让 click 正常执行。 */
  setTimeout(()=>{
    function fmOutsideHandler(e){
      if(!floatMenu.contains(e.target)){
        hideFloatMenu();
        document.removeEventListener("pointerdown",fmOutsideHandler);
      }
    }
    document.addEventListener("pointerdown",fmOutsideHandler);
  },0);
}
function hideFloatMenu(){floatMenu.classList.remove("show");floatMenu.innerHTML="";}
/* F8/F9: 原地内联重命名 — 替代 showPrompt 居中弹窗，名字在哪就在哪改 */
function startInlineRename(el,nameSelector,currentName,onConfirm){
  const nameEl=el.querySelector(nameSelector);
  if(!nameEl)return;
  const input=document.createElement("input");
  input.type="text";
  input.value=currentName;
  input.className="inline-rename-input";
  /* F9: 阻止 click/pointerdown 冒泡到父元素，否则触发 switchProject/switchCanvas/openPreview
     导致 re-render 把 input 清掉 + 可能产生异常 DOM 状态（项目重复） */
  input.addEventListener("click",e=>e.stopPropagation());
  input.addEventListener("pointerdown",e=>e.stopPropagation());
  nameEl.replaceWith(input);
  input.focus();input.select();
  let done=false;
  function finish(save){
    if(done)return;done=true;
    if(save&&input.value.trim()){
      onConfirm(input.value.trim()); /* 回调会 re-render，input 自动被替换 */
    }else{
      /* 取消：把原始元素原样放回（保留 icon 等子元素） */
      if(input.parentNode)input.replaceWith(nameEl);
    }
  }
  input.addEventListener("keydown",e=>{
    e.stopPropagation();
    if(e.key==="Enter"){e.preventDefault();finish(true);}
    else if(e.key==="Escape"){e.preventDefault();finish(false);}
  });
  input.addEventListener("blur",()=>finish(true));
}
/* F8: 轻量移动文件 — 替代 showMoveFile 的居中弹窗，用 showFloatMenu 列文件夹 */
function showMoveFileMenu(fileId,anchorEl){
  const items=[{icon:ICON.folder,label:"未分类（根级）",onClick:()=>moveLibraryFile(fileId,null)}];
  for(const folder of state.folders){
    items.push({icon:ICON.folder,label:folderPathName(folder),onClick:()=>moveLibraryFile(fileId,folder.id)});
  }
  showFloatMenu(anchorEl,items);
}

/* 自定义弹层（替代浏览器原生 prompt/confirm） */
const modal=document.getElementById("modal");
var _modalFocusTimer=null;
function showModal(title,bodyHtml,actions){
  const box=modal.querySelector(".modal-box");
  box.style.width=""; /* reset：showSettings 设的 680px 固定宽不残留到其他弹窗（如退出确认） */
  const titleEl=box.querySelector(".modal-title");
  titleEl.textContent=title;
  titleEl.style.display=title?"":"none";  /* G11: 空标题时隐藏，避免多余间距 */
  box.querySelector(".modal-body").innerHTML=bodyHtml;
  const actEl=box.querySelector(".modal-actions");
  actEl.innerHTML="";
  for(const a of actions){
    const b=document.createElement("button");
    b.className="modal-btn "+(a.primary?"primary":"secondary");
    b.textContent=a.label;
    b.addEventListener("click",()=>{if(a.onClick)a.onClick();hideModal();});
    actEl.appendChild(b);
  }
  /* 绑定关闭按钮 */
  const closeBtn=box.querySelector(".modal-close");
  if(closeBtn)closeBtn.onclick=hideModal;
  modal.classList.add("show");
  /* I9-fix: 用可取消的 timer 替代裸 setTimeout——hideModal 时取消，
     否则 timer 在弹窗关闭后才触发，focus 一个隐藏的 input，
     导致 isTyping() 返回 true 拦截所有快捷键（自愈现象的根因） */
  if(_modalFocusTimer)clearTimeout(_modalFocusTimer);
  _modalFocusTimer=setTimeout(function(){
    _modalFocusTimer=null;
    if(!modal.classList.contains("show"))return; /* 弹窗已关闭，不 focus */
    const inp=box.querySelector(".modal-input");
    if(inp)inp.focus();
  },50);
}
function hideModal(){
  if(_modalFocusTimer){clearTimeout(_modalFocusTimer);_modalFocusTimer=null;}
  var ae=document.activeElement;
  if(ae&&modal.contains(ae))ae.blur();
  modal.classList.remove("show");
}
modal.addEventListener("click",e=>{if(e.target===modal)hideModal();});
/* 选项弹层 */
function showOptions(title,opts){
  const list=opts.map(o=>`<div class="opt-item" data-id="${escapeHtml(o.id)}"><div class="opt-ic">${o.icon||""}</div><div class="opt-tx"><div class="opt-name">${escapeHtml(o.label)}</div><div class="opt-desc">${escapeHtml(o.desc||"")}</div></div></div>`).join("");
  showModal(title,`<div class="opt-list">${list}</div>`,[{label:"取消"}]);
  modal.querySelectorAll(".opt-item").forEach(el=>{
    el.addEventListener("click",()=>{
      const id=el.dataset.id;
      const opt=opts.find(o=>o.id===id);
      hideModal();
      if(opt&&opt.onClick)opt.onClick();
      /* I9-fix: onClick 里的 render() 可能残留焦点到隐藏元素上，
         导致 isTyping() 拦截所有快捷键。强制把焦点交还给 body。 */
      var ae=document.activeElement;
      if(ae&&ae!==document.body&&ae.tagName!=="CANVAS")ae.blur();
    });
  });
}
/* 输入弹层 */
function showPrompt(title,placeholder,defaultValue,onConfirm){
  showModal(title,`<input class="modal-input" type="text" placeholder="${escapeHtml(placeholder||"")}" value="${escapeHtml(defaultValue||"")}">`,[
    {label:"取消"},
    {label:"确定",primary:true,onClick:()=>{const inp=modal.querySelector(".modal-input");if(inp&&onConfirm)onConfirm(inp.value);}}
  ]);
  const inp=modal.querySelector(".modal-input");
  if(inp){
    inp.addEventListener("keydown",e=>{
      if(e.key==="Enter"){e.preventDefault();if(onConfirm)onConfirm(inp.value);hideModal();}
      if(e.key==="Escape")hideModal();
    });
    /* I9-fix: blur input after confirm to prevent isTyping() trap */
    inp.select();
  }
}
/* 链接导入弹层 */
function showLinkPrompt(onConfirm){
  showModal("添加链接",`<input class="modal-input" type="url" placeholder="https://…" style="margin-bottom:10px"><input class="modal-input" type="text" placeholder="显示名称（可选）">`,[
    {label:"取消"},
    {label:"添加",primary:true,onClick:()=>{const inputs=modal.querySelectorAll(".modal-input");if(inputs&&onConfirm)onConfirm(inputs[0].value,inputs[1].value);}}
  ]);
  const inp=modal.querySelector(".modal-input");
  if(inp){inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const inputs=modal.querySelectorAll(".modal-input");if(inputs&&onConfirm)onConfirm(inputs[0].value,inputs[1].value);hideModal();}});}
}
function showExportOptions(){
  var opts=[
    {id:"png",label:"导出图片 PNG",desc:"导出画布为图片",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L9 20"/></svg>',onClick:()=>exportPNG()},
  ];
  var isDesktop=window.electronAPI&&window.electronAPI.isDesktop;
  if(isDesktop){
    opts.push({id:"canvasFantin",label:"导出当前画布",desc:".fantin 文件（含附件）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/></svg>',onClick:()=>doExport("canvas","fantin")});
    opts.push({id:"canvasFolder",label:"导出当前画布",desc:"文件夹（含附件，可直接看原始资料）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.4-.6L7.5 3.6A2 2 0 0 0 6.1 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>',onClick:()=>doExport("canvas","folder")});
    opts.push({id:"projFantin",label:"导出整个项目",desc:".fantin 文件（含全部画布 + 附件）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 2H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6Z"/><path d="M9 2v4h4"/><path d="M18 8H10a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V12Z"/><path d="M16 8v4h4"/></svg>',onClick:()=>doExport("project","fantin")});
    opts.push({id:"projFolder",label:"导出整个项目",desc:"文件夹（含全部画布 + 附件）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 16a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5L4 3H2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9z"/><path d="M22 22a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.4-.6L9.5 5.6A2 2 0 0 0 8.1 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>',onClick:()=>doExport("project","folder")});
  }
  showOptions("导出",opts);
}
function showImportOptions(){
  var opts=[
    {id:"opml",label:"从 OPML 导入",desc:"OPML 格式（多数思维导图通用）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M8 13h8M8 17h5"/></svg>',onClick:()=>{var inp=document.createElement("input");inp.type="file";inp.accept=".opml,.xml";inp.onchange=function(){if(inp.files&&inp.files[0])importOPML(inp.files[0]);};inp.click();}},
    {id:"md",label:"从 Markdown 导入",desc:"Markdown 大纲转节点",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 13l2 2 2-2M13 17h4"/></svg>',onClick:()=>{var inp=document.createElement("input");inp.type="file";inp.accept=".md,.markdown,.txt";inp.onchange=function(){if(inp.files&&inp.files[0])importMarkdown(inp.files[0]);};inp.click();}},
    {id:"backup",label:"从备份恢复",desc:"织见用户数据备份（.json，含全部附件）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>',onClick:()=>{var inp=document.createElement("input");inp.type="file";inp.accept=".json";inp.onchange=function(){if(inp.files&&inp.files[0])importUserData(inp.files[0]);};inp.click();}},
  ];
  var isDesktop=window.electronAPI&&window.electronAPI.isDesktop;
  if(isDesktop){
    opts.push({id:"fantin",label:"从 .fantin 导入",desc:"织见专属格式（含附件，自动检测项目/画布）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',onClick:()=>doImport("fantin")});
    opts.push({id:"folder",label:"从文件夹导入",desc:"织见文件夹格式（含附件，自动检测项目/画布）",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 1 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>',onClick:()=>doImport("folder")});
  }
  showOptions("导入",opts);
}
/* G4: 统一导出 — scope=canvas/project, format=fantin/folder */
function doExport(scope,format){
  var cp=curProject();
  if(!cp){toast("无当前项目");return;}
  var canvasesToExport=scope==="project"?cp.canvases:[curCanvas()];
  if(!canvasesToExport||!canvasesToExport.length){toast("无可导出的画布");return;}
  var fileMeta=[],fileCardIds=[],canvases=[];
  for(var c of canvasesToExport){
    var cCopy=JSON.parse(JSON.stringify(c));
    canvases.push(cCopy);
    for(var it of c.items){
      if(it.type==="fileCard"&&it.fileId){
        var f=state.files.find(function(x){return x.id===it.fileId;});
        if(f&&!fileCardIds.includes(it.fileId)){
          fileCardIds.push(it.fileId);
          /* I5-fix: 补记 url/kind——网页链接类文件没有二进制 blob，缺这两项会导致
             导出→导入后链接文件整条丢失、画布卡片变孤儿 */
          fileMeta.push({oldId:it.fileId,name:f.name,mime:f.mime||"application/octet-stream",url:f.url||null,kind:f.kind||null});
        }
      }
    }
  }
  var structure={version:"G4",type:scope,exportedAt:Date.now(),projectName:cp.name,fileMeta:fileMeta,canvases:canvases};
  var attPromises=fileCardIds.map(function(fid,idx){
    var fileName=fileMeta[idx].name;
    return getBlob(fid).then(function(b){if(!b)return null;return b.arrayBuffer().then(function(buf){return{id:fid,name:fileName,buffer:buf};});}).catch(function(){return null;});
  });
  Promise.all(attPromises).then(function(results){
    var attachments=results.filter(function(r){return r!==null;});
    var pkgName=(cp.name||"织见画布")+(scope==="project"?"":"-"+(curCanvas().name||"画布"));
    var data={projectName:pkgName,structure:structure,attachments:attachments};
    var apiFn=format==="fantin"?"exportFantin":"exportFolder";
    window.electronAPI[apiFn](data).then(function(res){
      if(res.ok)toast("已导出："+res.path+"（含 "+res.attachments+" 个附件）");
      else toast("导出失败："+(res.error||"未知错误"));
    });
  });
}
/* G4: 统一导入 — format=fantin/folder，自动检测项目/画布 */
function doImport(format,presetPath){
  var apiFn=format==="fantin"?"importFantin":"importFolder";
  window.electronAPI[apiFn](presetPath).then(function(res){
    if(!res.ok){toast("导入失败："+(res.error||"未知错误"));return;}
    var structure=res.structure;
    var attachments=res.attachments||[];
    var srcCanvases=structure.canvases;
    if(!srcCanvases||!srcCanvases.length){toast("数据格式不正确：缺少画布数据");return;}
    var fileIdMap={},restoredFiles=0;
    var attachByName={};
    for(var att of attachments)attachByName[att.name]=att;
    var newProj={id:"p"+(uid++),name:(structure.projectName||"导入")+(structure.type==="project"?"":"（单画布）"),files:[],folders:[],canvases:[],isBuiltin:false};
    for(var fm of (structure.fileMeta||[])){
      var att=attachByName[fm.name];
      var newFid="f"+(uid++);
      if(!att){
        /* I5-fix: 链接文件无二进制附件——从 fileMeta.url 重建，不再整条丢弃 */
        if(fm.kind==="link"&&fm.url){
          newProj.files.push({id:newFid,name:fm.name,kind:"link",mime:"",size:0,created:Date.now(),folderId:null,url:fm.url});
          fileIdMap[fm.oldId]=newFid;restoredFiles++;
        }
        continue;
      }
      var blob=new Blob([att.buffer],{type:fm.mime||"application/octet-stream"});
      newProj.files.push({id:newFid,name:fm.name,kind:fm.kind||kindOf(fm.name),mime:fm.mime||"application/octet-stream",size:blob.size,created:Date.now(),folderId:null,blob:blob});
      if(blob&&idb){try{var tx=idb.transaction("files","readwrite");tx.objectStore("files").put(blob,newFid);}catch(_){}}
      fileIdMap[fm.oldId]=newFid;restoredFiles++;
    }
    var canvasIdMap={};
    for(var srcCanvas of srcCanvases){
      var itemIdMap={};
      var newCanvas={id:"c"+(uid++),name:srcCanvas.name||"导入的画布",items:[],camera:srcCanvas.camera||{x:0,y:0,zoom:1},previews:[],links:[],layoutVersion:srcCanvas.layoutVersion||3};
      canvasIdMap[srcCanvas.id]=newCanvas.id;
      for(var it of (srcCanvas.items||[])){
        var newItem=JSON.parse(JSON.stringify(it));
        var oldId=newItem.id;newItem.id=uid++;itemIdMap[oldId]=newItem.id;
        if(newItem.parentId)newItem.parentId=itemIdMap[newItem.parentId]||null;
        if(newItem.children)newItem.children=newItem.children.map(function(c){return itemIdMap[c]||c;});
        if(newItem.attachIds)newItem.attachIds=newItem.attachIds.map(function(a){return itemIdMap[a]||a;});
        if(newItem.type==="fileCard"&&newItem.fileId)newItem.fileId=fileIdMap[newItem.fileId]||newItem.fileId;
        if(newItem.type==="connector"){if(newItem.a)newItem.a=itemIdMap[newItem.a]||newItem.a;if(newItem.b)newItem.b=itemIdMap[newItem.b]||newItem.b;}
        if(newItem.jumpTo&&newItem.jumpTo.canvasId)newItem.jumpTo.canvasId=canvasIdMap[newItem.jumpTo.canvasId]||newItem.jumpTo.canvasId;
        if(newItem.type==="note"&&!newItem.fontFamily)newItem.fontFamily=state.fontPreset||"clear";
        newCanvas.items.push(newItem);
      }
      for(var lnk of (srcCanvas.links||[])){
        var newLink=JSON.parse(JSON.stringify(lnk));newLink.id="lnk"+(uid++);
        newLink.aId=itemIdMap[lnk.aId]||lnk.aId;newLink.bId=itemIdMap[lnk.bId]||lnk.bId;
        newCanvas.links.push(newLink);
      }
      newProj.canvases.push(newCanvas);
    }
    state.projects.push(newProj);
    state.activeProjectId=newProj.id;
    state.activeCanvasId=newProj.canvases[0].id;
    state.selected=null;syncUid();
    renderSidePanel();render();fitAll();saveStateDebounced();
    toast("已导入："+newProj.name+"（"+newProj.canvases.length+" 张画布，"+restoredFiles+" 个附件）");
  });
}
function offerImport(){
  showOptions("导入材料",[
    {id:"file",label:"本地文件",desc:"选择一个或多个文件",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>',onClick:()=>fileInput.click()},
    {id:"folder",label:"整个文件夹",desc:"导入文件夹，保留目录结构",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',onClick:()=>document.getElementById("folderInput").click()},
    {id:"link",label:"网页链接",desc:"粘贴一个 URL",icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',onClick:()=>showLinkPrompt((url,name)=>{if(url&&/^https?:\/\//i.test(url))addLinkFile(url,name);})},
  ]);
}
async function resolveLinkTitle(url){
  /* 安全：仅对 http/https URL 发起请求，阻止内网/回环地址的请求伪造。 */
  if(!isSafePreviewUrl(url))return "";
  /* 仅在网页允许跨域读取时提取标题；被站点拦截时安静降级为域名。 */
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);
  try{
    const res=await fetch(url,{signal:controller.signal,headers:{Accept:"text/html"}});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const type=res.headers.get("content-type")||"";
    if(type&&!/html|xhtml/i.test(type))return "";
    const html=(await res.text()).slice(0,180000);
    const doc=new DOMParser().parseFromString(html,"text/html");
    return (doc.querySelector("title")?.textContent||"").replace(/\s+/g," ").trim().slice(0,100);
  }catch(e){return "";}finally{clearTimeout(timer);}
}
async function addLinkFile(url,name){
  if(!name){
    toast("正在读取网页标题…");
    name=await resolveLinkTitle(url);
  }
  if(!name){try{name=new URL(url).hostname;}catch(e){name=url;}}
  const f={id:"f"+(uid++),name:name||url,kind:"link",url,size:0,mime:"",created:Date.now()};
  state.files.push(f);
  renderFileGroups();saveStateDebounced();
  toast("已添加链接");
}
/* 文件夹上传 */
document.getElementById("folderInput").addEventListener("change",async()=>{
  const fi=document.getElementById("folderInput");
  const files=Array.from(fi.files||[]);
  fi.value="";
  if(files.length) await importFiles(files);
});
function isEditingTarget(target){
  return !!(target&&target.closest&&target.closest("input,textarea,select,[contenteditable='true'],.fv-md-editor"));
}
/* 系统文件复制粘贴与网址粘贴：编辑文本时保持原生粘贴，不抢输入。 */
document.addEventListener("paste",e=>{
  if(isEditingTarget(e.target))return;
  const files=[...(e.clipboardData&&e.clipboardData.files||[])];
  if(files.length){e.preventDefault();importFiles(files);return;}
  const text=(e.clipboardData&&e.clipboardData.getData("text/plain")||"").trim();
  if(!/^https?:\/\/\S+$/i.test(text))return;
  e.preventDefault();
  let host=text;try{host=new URL(text).hostname;}catch(err){}
  showModal("添加网页到资源库",'<p style="font-size:12px;color:var(--ink-dim);line-height:1.7;margin:0">检测到网址：<strong style="color:var(--ink)">'+escapeHtml(host)+'</strong><br>添加后会自动尝试读取网页标题。</p>',[
    {label:"取消"},{label:"添加",primary:true,onClick:()=>addLinkFile(text,"")}
  ]);
});
/* 外部文件拖到应用任意区域都进入资源库；内部资源拖拽不受影响。 */
document.addEventListener("dragover",e=>{
  if(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes("Files")){e.preventDefault();dropOverlay.style.display="flex";}
},true);
document.addEventListener("drop",e=>{
  if(!(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length))return;
  e.preventDefault();e.stopImmediatePropagation();dropOverlay.style.display="none";importFiles(e.dataTransfer.files);
},true);
/* 文件拖到资源库区域：直接导入；资源库内部拖拽仍由文件夹整理逻辑接管。 */
fileGroups.addEventListener("dragover",e=>{if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){e.preventDefault();dropOverlay.style.display="flex";}});
fileGroups.addEventListener("drop",e=>{
  if(!(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length))return;
  e.preventDefault();e.stopPropagation();dropOverlay.style.display="none";importFiles(e.dataTransfer.files);
});
function applySide(){
  sidePanel.classList.toggle("collapsed",state.sideCollapsed);
  board.classList.toggle("side-collapsed",state.sideCollapsed);
  ["lib-head","file-groups","project-section","canvas-section"].forEach(id=>{
    const el=document.getElementById(id);if(el)el.classList.toggle("side-hidden",state.sideCollapsed);
  });
  if(brandEl){
    const action=state.sideCollapsed?"展开左侧栏":"收起左侧栏";
    brandEl.classList.toggle("side-is-collapsed",state.sideCollapsed);
    brandEl.title="织见 · "+action;
    brandEl.setAttribute("aria-label",brandEl.title);
    brandEl.setAttribute("aria-pressed",String(!state.sideCollapsed));
  }
  /* 已移除侧栏把手与贴边浮出热区；Logo 是唯一明确的常驻/收起入口。 */
  sidePanel.classList.remove("peek");
  if(peekTimer){clearTimeout(peekTimer);peekTimer=0;}
  if(peekEnterTimer){clearTimeout(peekEnterTimer);peekEnterTimer=0;}
  /* 全屏窗口即时适配：Dock 收起/展开状态变化后立刻重算全屏边界，
     避免边界错位/残留间距/延迟（此前仅打开或沉浸时布局，切换后不再重算） */
  layoutFullscreen();
  requestAnimationFrame(resize);
  setTimeout(resize,60);
  setTimeout(resize,150);
  setTimeout(resize,300);
}
/* ============================================================
   左 Dock 浮出/弹回（收起态下的临时展开）
   —— 触发：鼠标进入左边缘 10px 热区（或聚焦到面板内）
   —— 浮出：transform 平移 .34s var(--ease-snap)，叠加阴影表现"浮在画布上"
   —— 弹回：鼠标离开面板后延迟 320ms（避免掠过误触）
   —— 吸附：浮出时左边缘严格贴 0；弹回后完全移出屏幕（translateX(-100%)），
             不残留任何白框/白条
============================================================ */
let peekTimer=0,peekEnterTimer=0,peekLocked=false;
const PEEK_DELAY=300,PEEK_ENTER_DELAY=180;   /* 边缘停留后再弹出；离开时再留一点缓冲 */
function sidePeek(on,source="edge",pointerY=lastPointer&&lastPointer.y){
  if(!state.sideCollapsed){sidePanel.classList.remove("peek");return;}
  /* 统一缓冲：无论 on/off 都先清旧计时器，避免竞态 */
  if(peekTimer){clearTimeout(peekTimer);peekTimer=0;}
  if(!on&&peekEnterTimer){clearTimeout(peekEnterTimer);peekEnterTimer=0;}
  if(on&&source==="edge"){
    if(peekEnterTimer)clearTimeout(peekEnterTimer);
    peekEnterTimer=setTimeout(()=>{
      peekEnterTimer=0;
      if(state.sideCollapsed&&isPointerOverHoverZone())sidePanel.classList.add("peek");
    },PEEK_ENTER_DELAY);
    return;
  }
  if(on){if(peekEnterTimer){clearTimeout(peekEnterTimer);peekEnterTimer=0;}sidePanel.classList.add("peek");return;}
  /* 离开：延迟 PEEK_DELAY 后再真正收回；期间若有鼠标回到热区/面板，
     由 mouseenter 再次 sidePeek(true) 清掉本计时器，形成"停留缓冲" */
  peekTimer=setTimeout(()=>{
    if(!peekLocked&&!sidePanel.matches(":hover")&&!isPointerOverHoverZone())sidePanel.classList.remove("peek");
    peekTimer=0;
  },PEEK_DELAY);
}
/* 指针是否悬停在侧栏区域内 */
function isPointerOverHoverZone(){
  if(!lastPointer)return false;
  const sp=sidePanel.getBoundingClientRect();
  if(lastPointer.x>=sp.left&&lastPointer.x<=sp.right&&lastPointer.y>=sp.top&&lastPointer.y<=sp.bottom)return true;
  return false;
}
(function initSidePeek(){
  /* 鼠标移入面板 → 保持浮出（锁定，防止移开即刻收起） */
  sidePanel.addEventListener("mouseenter",()=>{peekLocked=true;sidePeek(true,"panel");});
  /* 鼠标离开面板 → 解除锁定并延迟弹回（300ms 滞后） */
  sidePanel.addEventListener("mouseleave",()=>{peekLocked=false;sidePeek(false);});
  /* 键盘可达：Tab 聚焦到面板内也浮出 */
  sidePanel.addEventListener("focusin",()=>{peekLocked=true;sidePeek(true,"panel");});
  /* 在画布上移动时，若面板处于浮出且鼠标不在其内 → 走滞后缓冲收回 */
  document.addEventListener("pointermove",e=>{
    lastPointer={x:e.clientX,y:e.clientY};
    if(!state.sideCollapsed)return;
    if(!sidePanel.classList.contains("peek"))return;
    if(peekLocked)return;
    const r=sidePanel.getBoundingClientRect();
    const inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
    if(!inside&&e.clientX>14)sidePeek(false);
  },{passive:true});
})();

/* ============================================================
   临时回归测试模式（本轮排障专用）
   首次载入会清除 board-state 与附件 Blob，只生成一份很小的测试项目。
   后续刷新保留测试中的操作结果，便于观察重排、跳转和展开。
============================================================ */
/* 发布版必须关闭临时回归测试模式；该模式会刻意只保留一份小型测试项目，
   从而跳过“织见学堂”及正常项目初始化。 */
const SIMPLE_TEST_MODE=false;
const SIMPLE_TEST_RESET_VERSION="20260830-simple-regression-v1";
function resetLocalArchiveForSimpleTest(){
  try{
    if(localStorage.getItem("zhijian-simple-test-reset")===SIMPLE_TEST_RESET_VERSION)return false;
    localStorage.removeItem("board-state");
    localStorage.setItem("zhijian-simple-test-reset",SIMPLE_TEST_RESET_VERSION);
    if(idb){
      const tx=idb.transaction("files","readwrite");
      tx.objectStore("files").clear();
    }
    return true;
  }catch(e){return false;}
}
function seedSimpleRegressionTest(){
  const project=createProject("回归测试");
  const canvas=curCanvas();canvas.name="01-基础交互";
  state.layoutType="logic";
  const root=addMindNode("织见 · 回归测试",null,"#2d5fd3",-120,70);
  const layout=addMindNode("布局与重排",root.id,"#1fa06a",190,-80);
  const reading=addMindNode("批注与展开",root.id,"#7a55c0",190,80);
  const jump=addMindNode("跃迁验证",root.id,"#e0882a",190,240);
  const childA=addMindNode("子节点 A",layout.id,"#1fa06a",470,-125);
  const childB=addMindNode("子节点 B",layout.id,"#1fa06a",470,-35);
  const detailChild=addMindNode("完整内容不裁切",reading.id,"#7a55c0",470,85);
  reading.annotation="选中节点后，这条批注应当清晰；未选中时保持弱化。";
  reading.detail="# 展开阅读区\n\n这里用于检查文字对比度、留白与完整显示。\n\n- 内容可读\n- 背景稳定\n- 不应裁切";
  detailChild.annotation="这是子节点批注，用来验证归属与避让。";
  state.links.push({id:"l"+(uid++),aId:layout.id,bId:reading.id,relationType:"supports",annotation:"验证关系线的选择聚焦",directional:true});
  addNote(20,355,"测试顺序：\n1. 选中关系线或节点\n2. 展开“批注与展开”\n3. 点击“跃迁验证”中的跳转\n4. 点击重新排版后再撤销",NOTE_COLORS[0]);
  const target=createCanvas("02-跃迁目标");
  const targetNode=addMindNode("已抵达目标节点",null,"#e0882a",120,80);
  addMindNode("可继续编辑",targetNode.id,"#1fa06a",390,80);
  jump.jumpTo={canvasId:target.id,itemId:targetNode.id};
  state.activeCanvasId=canvas.id;
  state.selected=root.id;
  syncUid();renderSidePanel();fitAll();
}

/* 种子数据：商业航天总纲 */
function seed(){
  /* 创建默认项目 */
  const p=createProject("商业航天总纲");
  const root=addMindNode("商业航天总纲",null,MIND_COLORS[0],80,200);
  const a=addMindNode("火箭",root.id,MIND_COLORS[1],320,120);
  const b=addMindNode("卫星",root.id,MIND_COLORS[2],320,220);
  const c=addMindNode("发射场",root.id,MIND_COLORS[3],320,320);
  const d=addMindNode("应用场景",root.id,MIND_COLORS[4],320,420);
  const a1=addMindNode("液氧甲烷发动机",a.id,MIND_COLORS[1],540,90);
  const a2=addMindNode("可回收复用",a.id,MIND_COLORS[1],540,150);
  const a3=addMindNode("核心配套",a.id,MIND_COLORS[1],540,210);
  const b1=addMindNode("低轨宽带星座",b.id,MIND_COLORS[2],540,190);
  const b2=addMindNode("通导遥一体化",b.id,MIND_COLORS[2],540,250);
  const b3=addMindNode("卫星制造",b.id,MIND_COLORS[2],540,310);
  state.selected=root.id;
  addNote(860,60,"交互提示\n· 空白拖动 = 平移画布\n· 双击内容 = 编辑文字\n· 节点蓝点拖出 = 建立父子\n· 便签拖到节点 = 关联\n· P 画笔 · N 便签",NOTE_COLORS[0]);
  addNote(860,250,"把 BP、投决书、招股书导入资源库\n拖到画布变成材料卡片\n点击卡片 → 画布内预览\n左侧可新建多个画布和项目",NOTE_COLORS[2]);
  /* 重命名主画布 */
  curCanvas().name="商业航天总纲";
  if(state.mindMode==="auto") autoLayout();
  syncUid();
  renderSidePanel();
}

/* 织见学堂：内嵌教程 seed（无存档时自动生成，含内联附件） */
/* I5-fix: upgradeTutorLayouts 从未被调用且其布局升级机制已由教程版本门接管，删除 */



function init(){
  buildToolbar();
  setTool("select");
  syncHistoryBtns();
  mountControls();
  applySide();
  applyTheme();
  applyFontPreset();
  resize();
  /* G7: splash 期间异步预加载 PDF/PPT 预览库，不阻塞 init */
  setTimeout(function(){
    if(typeof ensureCdn==="function"){
      ensureCdn("pdf").catch(function(){});
      ensureCdn("slide").catch(function(){});
    }
  },200);
  openDB().then(()=>{
    const resetForTest=SIMPLE_TEST_MODE&&resetLocalArchiveForSimpleTest();
    const has=resetForTest?false:loadState();
    /* G4 fix: loadState 后重新 applyTheme，确保 autoTheme 生效 */
    applyTheme();
    if(!has){
      if(SIMPLE_TEST_MODE)seedSimpleRegressionTest();
      /* 发布版的首次打开只建立内置学堂，不再生成开发期“回归测试”数据。 */
      else{ensureTutorProject();}
      saveStateDebounced();
      fitAll();
    }else{
      /* 内置学堂有独立版本号；只升级它，不影响用户自己的项目与画布。 */
      if(!SIMPLE_TEST_MODE&&ensureTutorProject())saveStateDebounced();
      restoreFiles().then(()=>{
        renderSidePanel();
        render();fitAll();
        syncPvDom();
      });
    }
    renderSidePanel();
    render();
  }).catch(function(e){
    console.error("init error:",e);
    try{renderSidePanel();render();}catch(_){}
  }).finally(function(){
    /* G1: 启动动画收尾 — 最低展示 1.5s 后淡出（放 finally 确保即使出错也消失） */
    var el=document.getElementById("splashScreen");
    if(el){
      setTimeout(function(){
        el.classList.add("hide");
        setTimeout(function(){
          if(el.parentNode)el.parentNode.removeChild(el);
          /* G9: 首次启动强制展示版权声明 */
          if(!localStorage.getItem("zhijian-license-accepted")){
            showLicenseModal(true);
          }
        },600);
      },1500);
    }
  });
  window.addEventListener("resize",resize);
  /* G3: 可配置自动保存间隔 */
  /* I5-fix: setupAutoSave 原是 init() 内的局部函数，设置面板的全局作用域里调不到
     （点击间隔按钮直接 ReferenceError）——提为顶层函数 */
  window.addEventListener("beforeunload",saveState);
  setupAutoSave();
  /* E5: load saved logo preference. G1: default 3 (叠合元素) */
  var savedLogo=parseInt(localStorage.getItem("zhijian-logo"))||3;
  applyLogo(savedLogo);

  /* G8: 文件关联 — 启动时检查 argv 中是否有 .fantin 文件待导入 */
  if(window.electronAPI&&window.electronAPI.getOpenFile){
    window.electronAPI.getOpenFile().then(function(fp){
      if(fp&&fp.toLowerCase().endsWith(".fantin")){
        /* 等画布初始化完成后再导入 */
        setTimeout(function(){doImport("fantin",fp);},500);
      }
    });
    /* 监听 second-instance（应用已运行时双击 .fantin） */
    if(window.electronAPI.onOpenFantinFile){
      window.electronAPI.onOpenFantinFile(function(){
        window.electronAPI.getOpenFile().then(function(fp){
          if(fp&&fp.toLowerCase().endsWith(".fantin")){
            doImport("fantin",fp);
          }
        });
      });
    }
    /* G11: 退出确认 — 自定义 modal 替代系统对话框 */
    if(window.electronAPI.onShowQuitModal){
      window.electronAPI.onShowQuitModal(function(){
        showModal("",
          '<div style="text-align:center;padding:8px 0 4px">'+
            '<div style="width:52px;height:52px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--accent-soft)">'+
              '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
                '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'+
                '<polyline points="16 17 21 12 16 7"/>'+
                '<line x1="21" y1="12" x2="9" y2="12"/>'+
              '</svg>'+
            '</div>'+
            '<div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">确认退出织见？</div>'+
            '<div style="font-size:12px;color:var(--ink-faint);line-height:1.5">画布数据已自动保存<br>可随时重新打开</div>'+
          '</div>',
          [
            {label:"取消",onClick:function(){if(window.electronAPI.cancelQuit)window.electronAPI.cancelQuit();}},
            {label:"退出",primary:true,onClick:function(){window.electronAPI.confirmQuit();}}
          ]
        );
      });
    }
  }
}
/* G9: 版权与使用授权声明弹窗 — 首次启动强制展示，关于页可查看 */
var LICENSE_TEXT=[
  "织见 Weavision 版权与使用授权声明","",
  "一、版权归属","本软件「织见 Weavision」（含源代码、可执行程序、界面设计、图标、文案、教程、配套素材及 .fantin 文件格式）的著作权及一切知识产权归 FANTIN 所有。","",
  "二、授权方式：源代码公开 · 免费使用 · 禁止商用","FANTIN 以「源代码公开、免费使用」方式向公众提供。在遵守本声明的前提下，任何人可在非商业目的下自由获取、安装、使用、复制、分发本软件，并查阅、学习其源代码。","",
  "三、禁止行为","未经 FANTIN 书面授权，任何人不得：","1. 将本软件用于任何商业用途（含付费提供、嵌入付费产品、企业营利性使用等）；","2. 移除、掩盖、篡改版权声明或 FANTIN 标识；","3. 声称本软件或衍生作品为自己所有。","",
  "四、衍生作品","基于源代码二次开发的衍生作品著作权由 FANTIN 与修改者共有，商用仍须授权。","",
  "五、商业授权","商用须事先取得 FANTIN 书面授权。联系：996128611@qq.com","",
  "六、个人与非营利使用","个人学习、研究、教学等非营利场景可自由使用。学校、科研机构及非营利组织在非商业活动中使用视为授权范围内使用。","",
  "七、免责与责任限制","本软件按「现状」提供，FANTIN 不保证可用性、准确性、适销性。因使用或无法使用本软件产生的损失，FANTIN 概不负责。","",
  "八、权利保留","本声明未明确授予的权利均由 FANTIN 保留。未经授权的侵权使用，FANTIN 有权依法追究法律责任。","",
  "© FANTIN · 织见 Weavision. 保留所有权利。"
].join("\n");
function showLicenseModal(isFirstRun){
  var existing=document.getElementById("licenseModal");
  if(existing)existing.remove();
  var overlay=document.createElement("div");
  overlay.id="licenseModal";
  overlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)";
  var box=document.createElement("div");
  var dk=document.documentElement.getAttribute("data-theme")==="dark";
  box.style.cssText="max-width:560px;max-height:80vh;display:flex;flex-direction:column;background:"+(dk?"#1e2029":"#fff")+";border:1px solid "+(dk?"#3a3f4d":"#d0d5dd")+";border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.2);overflow:hidden";
  var head=document.createElement("div");
  head.style.cssText="padding:16px 20px;border-bottom:1px solid "+(dk?"#3a3f4d":"#e0e3eb")+";font:700 14px var(--font);color:"+(dk?"#c7dcff":"#1a1a2e");
  head.textContent="织见 Weavision · 版权与使用授权声明";
  var body=document.createElement("div");
  body.style.cssText="flex:1;overflow:auto;padding:16px 20px;font:400 12px/1.7 "+(dk?"#a0a8b8":"#475467")+";white-space:pre-wrap;color:"+(dk?"#a0a8b8":"#475467");
  body.textContent=LICENSE_TEXT;
  var foot=document.createElement("div");
  foot.style.cssText="padding:12px 20px;border-top:1px solid "+(dk?"#3a3f4d":"#e0e3eb")+";display:flex;justify-content:center;gap:12px";
  var btn=document.createElement("button");
  btn.textContent=isFirstRun?"已知悉并同意":"关闭";
  btn.style.cssText="padding:8px 24px;border:none;border-radius:8px;background:var(--accent);color:#fff;font:600 13px var(--font);cursor:pointer";
  btn.onclick=function(){
    if(isFirstRun)localStorage.setItem("zhijian-license-accepted","true");
    overlay.remove();
  };
  foot.appendChild(btn);
  box.appendChild(head);box.appendChild(body);box.appendChild(foot);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
init();
/* G1: 启动动画 — 尽早设置 Logo src，在 init 之前就显示 */
(function(){
  var sl=parseInt(localStorage.getItem("zhijian-logo"))||3;
  var preset=LOGO_PRESETS[sl]||LOGO_PRESETS[3];
  var img=document.querySelector(".splash-logo");
  if(img)img.src="src/assets/logos/splash-"+sl+".png";  /* G1: 用透明母版 icon */
})();
/* ResizeObserver 持续监听 board 尺寸变化（CSS transition/窗口变化/响应式折叠都覆盖） */

/* E5: Settings modal */
/* E10: 重写设置面板 — 左侧分类栏 + 右侧内容区
   原则：只列主界面没有的功能，不重复主题/样式/底色/纹理（这些在顶栏按钮和菜单里） */
const SETTINGS_CATEGORIES=[
  {id:"general",label:"通用",icon:"⚙"},
  {id:"appearance",label:"外观",icon:"🎨"},
  {id:"data",label:"数据",icon:"💾"},
  {id:"shortcuts",label:"快捷键",icon:"⌨"},
  {id:"ai",label:"AI",icon:"🤖"},
  {id:"about",label:"关于",icon:"ℹ"},
];
let _settingsCat=null;  /* H4: 记住当前设置分类，避免改一项后弹窗跳回"通用" */
function showSettings(){
  showModal("设置",null,[
    {label:"关闭",onClick:function(){}}
  ]);
  var box=document.querySelector(".modal-box");
  if(!box)return;
  box.style.width="680px";box.style.maxWidth="680px";
  /* E10: 白天模式强制不透明白底 + 关掉毛玻璃模糊，用 !important 覆盖 CSS */
  if(!state.dark){
    box.style.setProperty("background","rgba(255,255,255,.98)","important");
    box.style.setProperty("backdrop-filter","none","important");
    box.style.setProperty("-webkit-backdrop-filter","none","important");
  }
  var body=box.querySelector(".modal-body");
  body.innerHTML='<div style="display:flex;min-height:380px"><div id="settingsNav" style="width:140px;flex:none;border-right:1px solid var(--card-border);padding:8px 0;overflow-y:auto"></div><div id="settingsContent" style="flex:1;padding:16px 20px;overflow-y:auto;max-height:380px"></div></div>';
  var nav=body.querySelector("#settingsNav");
  var content=body.querySelector("#settingsContent");
  SETTINGS_CATEGORIES.forEach(function(cat){
    var item=document.createElement("div");
    item.textContent=cat.icon+"  "+cat.label;
    item.dataset.cat=cat.id;
    item.style.cssText="padding:8px 14px;cursor:pointer;font-size:13px;font-weight:600;color:var(--ink-dim);border-radius:8px;transition:all .12s ease";
    item.addEventListener("click",function(){
      nav.querySelectorAll("[data-cat]").forEach(function(n){n.style.background="transparent";n.style.color="var(--ink-dim)";});
      item.style.background="var(--accent-soft)";item.style.color="var(--accent)";
      _settingsCat=cat.id;
      renderSettingsContent(cat.id,content);
    });
    nav.appendChild(item);
  });
  var _c=_settingsCat?nav.querySelector('[data-cat="'+_settingsCat+'"]'):null;
  (_c||nav.firstChild).click();
}
function renderSettingsContent(catId,content){
  if(catId==="general"){
    content.innerHTML=
      '<h4 style="margin:0 0 16px;font-size:14px">通用设置</h4>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">沉浸模式</div>'+
      '<button id="setImmersive" style="padding:8px 16px;border:1px solid var(--card-border);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer;font:600 12px var(--font)">切换沉浸 (F11)</button>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px">隐藏顶栏和侧栏，专注画布</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">全屏窗口</div>'+
      '<button id="setFullscreen" style="padding:8px 16px;border:1px solid var(--card-border);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer;font:600 12px var(--font)">'+(document.fullscreenElement||document.webkitFullscreenElement?"退出全屏":"进入全屏")+'</button>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px">使用浏览器/桌面应用的全屏模式（独立于沉浸）</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">启动行为</div>'+
      '<div style="font-size:12px;color:var(--ink)">当前：自动加载上次项目</div>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px">未来可选：打开上次项目 / 打开新建项目 / 打开教程</div></div>';
    var im=content.querySelector("#setImmersive");if(im)im.onclick=function(){toggleImmersive();};
    var fsw=content.querySelector("#setFullscreen");
    if(fsw)fsw.onclick=function(){
      /* G3: 桌面用 electronAPI，网页用 Fullscreen API */
      if(window.electronAPI&&window.electronAPI.toggleFullscreen){
        window.electronAPI.toggleFullscreen().then(function(fs){toast(fs?"已进入全屏":"已退出全屏");});
      }else{
        var el=document.documentElement;
        if(document.fullscreenElement||document.webkitFullscreenElement){
          if(document.exitFullscreen){document.exitFullscreen();}
          else if(document.webkitExitFullscreen){document.webkitExitFullscreen();}
        }else{
          if(el.requestFullscreen){el.requestFullscreen();}
          else if(el.webkitRequestFullscreen){el.webkitRequestFullscreen();}
          else{toast("此环境不支持全屏 API");}
        }
      }
    };
  }
  else if(catId==="data"){
    var isDesktop=window.electronAPI&&window.electronAPI.isDesktop;
    content.innerHTML=
      '<h4 style="margin:0 0 16px;font-size:14px">数据管理</h4>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">存储方式</div>'+
      '<div style="font-size:12px;color:var(--ink)">'+(isDesktop?"桌面应用（Electron）":"浏览器 localStorage（网页版）")+'</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">自动保存间隔</div>'+
      '<div style="display:flex;gap:6px">'+
      [{v:0,l:"关闭"},{v:10,l:"10秒"},{v:30,l:"30秒"},{v:60,l:"60秒"}].map(function(o){
        var on=state.saveInterval===o.v;
        return '<button class="saveIntBtn" data-v="'+o.v+'" style="padding:6px 12px;border:1px solid '+(on?"var(--accent)":"var(--card-border)")+';border-radius:8px;background:'+(on?"var(--accent-soft)":"var(--surface)")+';color:'+(on?"var(--accent)":"var(--ink-dim)")+';cursor:pointer;font:600 11px var(--font)">'+o.l+'</button>';
      }).join("")+
      '</div><div style="font-size:11px;color:var(--ink-faint);margin-top:4px">关闭页面时无论设置如何都会自动保存</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">数据备份</div>'+
      '<button id="setExportAll" style="padding:8px 16px;border:1px solid var(--accent);border-radius:8px;background:var(--accent-soft);color:var(--accent);cursor:pointer;font:600 12px var(--font)">导出全部数据</button>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px">所有项目、画布与附件的完整备份（JSON）；可通过「导入 → 从备份恢复」还原</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">清理</div>'+
      '<button id="setClearCache" style="padding:8px 16px;border:1px solid var(--danger);border-radius:8px;background:var(--danger-soft);color:var(--danger);cursor:pointer;font:600 12px var(--font)">清除预览缓存</button>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:4px">清理文件预览的临时缓存，不影响数据</div></div>';
    /* I5-fix: 「文件存储位置」死设置已移除——storagePath 无任何消费方，UI 承诺从未兑现 */
    var ea=content.querySelector("#setExportAll");if(ea)ea.onclick=function(){exportUserData();};
    content.querySelectorAll(".saveIntBtn").forEach(function(btn){btn.onclick=function(){state.saveInterval=parseInt(btn.dataset.v);saveStateDebounced();setupAutoSave();showSettings();toast("自动保存："+(state.saveInterval>0?state.saveInterval+"秒":"已关闭"));};});
    /* I5-fix: 清缓存改为真清 previewCache Map——此前删的 pv_* localStorage 键全代码无人写入，假成功 */
    var cc=content.querySelector("#setClearCache");if(cc)cc.onclick=function(){
      try{previewCache.clear();toast("预览缓存已清除");}catch(e){toast("清除失败");}
    };
  }
  else if(catId==="appearance"){
    content.innerHTML=
      '<h4 style="margin:0 0 16px;font-size:14px">外观</h4>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">主题模式</div>'+
      '<div style="display:flex;gap:8px;align-items:center">'+
      '<button id="setAutoTheme" style="padding:8px 14px;border:1px solid '+(state.autoTheme?"var(--accent)":"var(--card-border)")+';border-radius:8px;background:'+(state.autoTheme?"var(--accent-soft)":"var(--surface)")+';color:'+(state.autoTheme?"var(--accent)":"var(--ink)")+';cursor:pointer;font:600 12px var(--font)">'+(state.autoTheme?"跟随系统 ✓":"手动切换")+'</button>'+
      '<button id="setLight" style="padding:8px 14px;border:1px solid '+(!state.dark?"var(--accent)":"var(--card-border)")+';border-radius:8px;background:'+(!state.dark?"var(--accent-soft)":"var(--surface)")+';color:'+(!state.dark?"var(--accent)":"var(--ink)")+';cursor:pointer;font:600 12px var(--font)">☀ 亮色</button>'+
      '<button id="setDark" style="padding:8px 14px;border:1px solid '+(state.dark?"var(--accent)":"var(--card-border)")+';border-radius:8px;background:'+(state.dark?"var(--accent-soft)":"var(--surface)")+';color:'+(state.dark?"var(--accent)":"var(--ink)")+';cursor:pointer;font:600 12px var(--font)">☾ 暗色</button>'+
      '</div><div style="font-size:11px;color:var(--ink-faint);margin-top:4px">跟随系统时手动切换仅当前会话生效，重启后恢复跟随</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">应用图标</div><div style="display:flex;gap:12px" id="logoChoices"></div></div>'+
      '<div style="margin-bottom:20px" id="iconStyleSection"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">任务栏图标风格</div><div style="display:flex;gap:12px" id="iconStyleChoices"></div></div>'+
      '<div style="margin-bottom:20px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
      '<div style="font-size:12px;color:var(--ink-dim)">背景流光</div>'+
      '<div id="bgFlowSwitch" style="width:44px;height:24px;border-radius:12px;background:'+(state.reducedMotion?"var(--card-border)":"var(--accent)")+';position:relative;cursor:pointer;transition:background .2s ease;flex:none">'+
      '<div style="position:absolute;top:2px;left:'+(state.reducedMotion?"2px":"22px")+';width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .2s ease"></div></div></div>'+
      '<div style="font-size:11px;color:var(--ink-faint)">开启后背景有缓慢漂浮的色块（其他动画不受影响）</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">Fantin 文件图标</div>'+
      '<div style="display:flex;gap:12px">'+
      [1,2,3].map(function(n){var on=(state.fantinIcon||2)===n;return '<div class="fantinIconBtn" data-n="'+n+'" style="flex:1;cursor:pointer;padding:12px;border:2px solid '+(on?"var(--accent)":"var(--card-border)")+';border-radius:12px;text-align:center;transition:all .15s ease"><img src="src/assets/icons/fantin-'+n+'.ico" style="width:48px;height:48px;object-fit:contain;margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:'+(on?"var(--accent)":"var(--ink-dim)")+'">第'+n+'张</div></div>';}).join("")+
      '</div><div style="font-size:11px;color:var(--ink-faint);margin-top:6px">点击即实时生效（写注册表 + 刷新缓存，无需重装）</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">默认样式（新建项目时）</div>'+
      '<div style="font-size:12px;color:var(--ink-faint)">未来可选：默认使用哪种视觉样式</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">默认字体（新建项目时）</div>'+
      '<div style="font-size:12px;color:var(--ink-faint)">未来可选：默认使用哪种画布字体</div></div>';
    var choices=content.querySelector("#logoChoices");
    for(var n=1;n<=3;n++)(function(num){
      var preset=LOGO_PRESETS[num];var isDark=document.documentElement.getAttribute("data-theme")==="dark";
      var item=document.createElement("div");
      item.style.cssText="flex:1;cursor:pointer;padding:12px;border:2px solid "+(logoPreset===num?"var(--accent)":"var(--card-border)")+";border-radius:12px;text-align:center;transition:all .15s ease";
      item.innerHTML='<img src="'+(isDark?preset.comboDark:preset.comboLight)+'" style="width:48px;height:48px;object-fit:contain;margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:'+(logoPreset===num?"var(--accent)":"var(--ink-dim)")+'">'+preset.label+'</div>';
      item.onclick=function(){applyLogo(num,true);showSettings();};
      choices.appendChild(item);
    })(n);
    /* G11: 任务栏图标风格 — 仅桌面模式显示 */
    var iconStyleSec=content.querySelector("#iconStyleSection");
    if(window.electronAPI&&iconStyleSec){
      var iconStyleVal=localStorage.getItem("zhijian-icon-style")||"clean";
      var iconStyleChoices=content.querySelector("#iconStyleChoices");
      var iconStyles=[
        {id:"flat",label:"扁平化",desc:"带框图标，适配亮暗"},
        {id:"clean",label:"轻拟物",desc:"透明无框，亮暗通用"}
      ];
      for(var si=0;si<iconStyles.length;si++)(function(s){
        var sItem=document.createElement("div");
        sItem.style.cssText="flex:1;cursor:pointer;padding:10px 12px;border:2px solid "+(iconStyleVal===s.id?"var(--accent)":"var(--card-border)")+";border-radius:10px;transition:all .15s ease";
        sItem.innerHTML='<div style="font-size:12px;font-weight:600;color:'+(iconStyleVal===s.id?"var(--accent)":"var(--ink-dim)")+'">'+s.label+'</div><div style="font-size:10px;color:var(--ink-faint);margin-top:4px">'+s.desc+'</div>';
        sItem.onclick=function(){
          localStorage.setItem("zhijian-icon-style",s.id);
          var preset=parseInt(localStorage.getItem("zhijian-logo"))||3;
          showSettings();
          if(window.electronAPI&&window.electronAPI.setTaskbarIcon){
            window.electronAPI.setTaskbarIcon({preset:preset,style:s.id}).then(function(r){
              if(r&&r.ok===false){
                toast("任务栏图标切换失败："+(r.error||"未知错误"));
              }else{
                toast("任务栏图标："+s.label);
              }
            });
          }else{
            toast("任务栏图标："+s.label);
          }
        };
        iconStyleChoices.appendChild(sItem);
      })(iconStyles[si]);
    }else if(iconStyleSec){
      iconStyleSec.style.display="none";
    }
    var at=content.querySelector("#setAutoTheme");
    if(at)at.onclick=function(){state.autoTheme=!state.autoTheme;saveStateDebounced();if(state.autoTheme){applyTheme();render();}showSettings();};
    var sl=content.querySelector("#setLight");
    if(sl)sl.onclick=function(){_themeToken++;state.dark=false;_applyThemeInner();render();saveStateDebounced();showSettings();};
    var sd=content.querySelector("#setDark");
    if(sd)sd.onclick=function(){_themeToken++;state.dark=true;_applyThemeInner();render();saveStateDebounced();showSettings();};
    var bfs=content.querySelector("#bgFlowSwitch");
    if(bfs)bfs.onclick=function(){state.reducedMotion=!state.reducedMotion;document.body.classList.toggle("reduced-motion",state.reducedMotion);saveStateDebounced();showSettings();};
    content.querySelectorAll(".fantinIconBtn").forEach(function(b){b.onclick=function(){
      state.fantinIcon=parseInt(b.dataset.n);
      saveStateDebounced();
      showSettings();
      if(window.electronAPI&&window.electronAPI.setFantinIcon){
        window.electronAPI.setFantinIcon(state.fantinIcon).then(function(r){
          if(r&&r.ok===false){
            toast("Fantin 图标更新失败："+(r.error||"未知错误"));
          }else{
            toast("Fantin 图标已更新（实时生效）");
          }
        });
      }else{
        toast("Fantin 图标已更新（实时生效）");
      }
    };});
  }
  else if(catId==="shortcuts"){
    var rows=[
      ["节点操作","",""],
      ["加子节点","Tab","选中节点后按"],
      ["加同级","Enter","选中节点后按"],
      ["加根/二/三/四级","Shift+1/2/3/4",""],
      ["折叠/展开","− / +","选中节点"],
      ["同级排序","Alt+↑↓",""],
      ["提级/降级","Alt+←→",""],
      ["删除选中","Delete",""],
      ["","",""],
      ["编辑","",""],
      ["撤销/重做","Ctrl+Z / Ctrl+Shift+Z",""],
      ["编辑文字","双击节点 / 双击便签",""],
      ["形变展开","E","选中节点/卡片"],
      ["删除展开","Alt+E","选中节点"],
      ["复制","Ctrl+D","选中元素"],
      ["","",""],
      ["工具","",""],
      ["便签","N",""],
      ["画笔","P",""],
      ["框选","B",""],
      ["连接/断开","C","选中两元素"],
      ["添加批注","A","选中元素"],
      ["","",""],
      ["视图","",""],
      ["聚焦模式","F",""],
      ["凝视(100%)","G",""],
      ["纵览全部","Y",""],
      ["沉浸模式","F11 / Alt+F",""],
      ["全屏","Alt+Enter","原生窗口全屏"],
      ["跃迁到画布","J",""],
      ["搜索","Ctrl+F",""],
      ["","",""],
      ["画布","",""],
      ["平移","空白拖动 / 空格+拖",""],
      ["缩放","滚轮",""],
      ["新建节点","空白双击",""],
    ];
    var html='<h4 style="margin:0 0 16px;font-size:14px">快捷键</h4><div style="font-size:11px;color:var(--ink-dim);margin-bottom:12px">以下为当前快捷键，未来版本支持自定义</div><table style="width:100%;border-collapse:collapse;font-size:12px">';
    rows.forEach(function(r){
      if(r[0]&&!r[1]){html+='<tr><td colspan="3" style="padding:8px 0 4px;font-weight:700;color:var(--ink)">'+r[0]+'</td></tr>';}
      else if(!r[0]){html+='<tr style="height:8px"></tr>';}
      else{html+='<tr><td style="padding:4px 8px;color:var(--ink-dim)">'+r[0]+'</td><td style="padding:4px 8px;font-weight:600;font-family:var(--font)"><kbd style="background:var(--accent-soft);padding:2px 6px;border-radius:4px;border:1px solid var(--card-border);font-size:11px">'+r[1]+'</kbd></td><td style="padding:4px 8px;color:var(--ink-faint);font-size:11px">'+r[2]+'</td></tr>';}
    });
    html+='</table>';
    content.innerHTML=html;
  }
  else if(catId==="ai"){
    content.innerHTML=
      '<h4 style="margin:0 0 16px;font-size:14px">AI 设置</h4>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">AI 完整指引</div>'+
      '<div style="font-size:12px;color:var(--ink);margin-bottom:8px">导出完整 AI 指引文档，包含两部分：(1) 操作画布——ZhijianAI 37 个命令接口；(2) 读取 .fantin 文件——解析脚本 + 报告生成工作流。导出后连同 .fantin 文件发给任意 AI agent 即可。</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button id="exportAISkill" style="padding:8px 16px;border:1px solid var(--accent);border-radius:8px;background:var(--accent-soft);color:var(--accent);cursor:pointer;font:600 12px var(--font)">导出完整指引</button>'+
      '<button id="copyReportGuide" style="padding:8px 16px;border:1px solid var(--card-border);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer;font:600 12px var(--font)">复制报告指引到剪贴板</button>'+
      '</div></div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">AI 接口</div>'+
      '<div style="font-size:12px;color:var(--ink)">当前接口：ZhijianAI v1.3（37 个操作，支持批量+回滚+形变控制）</div>'+
      '</div>'+
      '<div style="margin-bottom:20px"><div style="font-size:12px;color:var(--ink-dim);margin-bottom:6px">未来功能（预留）</div>'+
      '<div style="font-size:11px;color:var(--ink-faint)">· 自主建图（AI 自主构建思维关系板）<br>· 关系类型自动标注<br>· 投资建议书一键导出<br>· 多模型接入配置</div></div>';
    var eb=content.querySelector("#exportAISkill");
    /* K2: 报告生成指引 + 解析脚本（导出和复制共用） */
    var PARSE_SCRIPT='#!/usr/bin/env node\nconst fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));\nfunction nm(it,fm){if(it.type==="fileCard"&&it.fileId){var f=fm.find(function(m){return m.oldId===it.fileId});return"[附件] "+(f?f.name:"未知")}\nif(it.type==="note")return"[便签] "+(it.text||"").slice(0,40);return it.text||"(空)"}\nfunction tree(items,fm,nameMap,item,depth){var pad="  ".repeat(depth);var line=pad+(nameMap[item.id]||"(空)");\nif(item.annotation)line+=" //批注："+item.annotation;if(item.detail)line+=" [展开"+item.detail.length+"字]";console.log(line);\nitems.filter(function(i){return i.parentId===item.id}).forEach(function(c){tree(items,fm,nameMap,c,depth+1)})}\nconsole.log("=== 项目："+d.projectName+" ===");\nfor(var c of d.canvases){var items=c.items||[],links=c.links||[];var fm=d.fileMeta||[];\nvar nameMap={};items.forEach(function(it){nameMap[it.id]=nm(it,fm)});\nconsole.log("\\n--- 画布："+c.name+"（"+items.length+"元素 "+links.length+"连线）---");\nconsole.log("\\n[层级结构]");\nitems.filter(function(i){return !i.parentId||!items.some(function(p){return p.id===i.parentId})}).forEach(function(r){tree(items,fm,nameMap,r,0)});\nif(links.length){console.log("\\n[语义连线]");links.forEach(function(l){console.log((nameMap[l.aId]||l.aId).slice(0,40)+" --["+l.relationType+"]--> "+(nameMap[l.bId]||l.bId).slice(0,40)+(l.annotation?" //"+l.annotation:""))})}\nvar ann=items.filter(function(i){return i.annotation});if(ann.length){console.log("\\n[批注]");ann.forEach(function(i){console.log((nameMap[i.id]||i.id)+"："+i.annotation)})}\nvar notes=items.filter(function(i){return i.type==="note"});if(notes.length){console.log("\\n[便签]");notes.forEach(function(n){console.log(n.text)})}}\nif(d.fileMeta&&d.fileMeta.length){console.log("\\n[附件清单]");d.fileMeta.forEach(function(f,i){console.log((i+1)+". "+f.name+" ("+(f.kind||"unknown")+")")})}';
    var reportGuide="\n\n---\n\n## 二、AI 读取 .fantin 生成报告\n\n### 素材边界铁律\n\n可联网查资料以辅助理解 .fantin 文件中的概念和关系，但报告的最终内容必须且只能来自 data.json 和附件原文。外部知识仅用于辅助理解，不可写入报告。每条数据、结论都标注来源。\n\n### 工作流程\n\n1. 解压 .fantin（ZIP 格式）：unzip xxx.fantin -d /tmp/fantin/\n2. 读 data.json（画布关系结构：节点、连线、层级、批注）\n3. 运行解析脚本（见下方），输出 AI 友好的关系网络文本\n4. 读 attachments/ 目录下所有 .md 文件全文\n5. 二进制附件（docx/xlsx/png）尝试转换读取，读不了用文件名标注\n6. 按关系网络层级组织报告，引用处加超链接和来源标注\n7. 报告保存到解压目录，超链接用相对路径 attachments/文件名\n\n### 数据来源标注格式\n\n> 数据来源：[附件名](attachments/附件名.md)\n> 画布批注：批注内容\n> 画布便签：便签内容\n\n### 关系类型对照\n\nrelated=关联 / supports=支撑 / causes=导致 / contradicts=反证 / evidence=证据\n\nparentId 构成层级树（不在 links 里），links 是跨层级语义连线，fileCard 的 fileId 指向 fileMeta 获取文件名。三种关系系统都要在报告中体现。\n\n### 解析脚本\n\n将以下脚本保存为 parse-fantin.js，运行 node parse-fantin.js data.json：\n\n~~~js\n"+PARSE_SCRIPT+"\n~~~\n\n### 报告要求\n\n- 全部元素都要用上（每个节点、附件、便签、批注）\n- 按层级树组织章节（根节点→章，子节点→节）\n- 语义连线在对应章节标注元素间关系\n- 附件内容填入对应章节，引用处加超链接\n- 报告末尾加附录：全部附件索引表\n";
    if(eb)eb.onclick=function(){
      /* G3: 生成 AI Skill 文件并下载 */
      var stylesStr="";
      Object.keys(STYLE_PRESETS).forEach(function(k){stylesStr+="- `"+k+"`："+STYLE_PRESETS[k].label+"（"+STYLE_PRESETS[k].desc+"）\n";});
      var skill="# 织见 AI 接口 (ZhijianAI v"+(window.ZhijianAI?window.ZhijianAI.version:"1.3")+")\n\n";
      skill+="织见（Weavision）是一款\"就地形变\"思维关系板。页面加载后提供 `window.ZhijianAI`，AI 可通过它操作画布、构建思维关系板。\n\n";
      skill+="## 调用方式\n\n~~~js\nconst snap = window.ZhijianAI.snapshot();           // 获取当前状态快照\nconst result = window.ZhijianAI.execute({ op: \"create_node\", title: \"新节点\" });  // 执行命令\nconst built = window.ZhijianAI.buildCanvas(plan);    // 从计划批量构建画布\n// result = { ok: true, value: {...} } 或 { ok: false, error: \"...\" }\n~~~\n\n";
      skill+="接口仅在页面自身 JavaScript 上下文中可用（同页调用，不跨域）。\n\n";
      skill+="## 操作边界\n\n- 只通过 `execute()` / `buildCanvas()` 操作画布，不直接改 DOM / localStorage / 源代码\n- 删除类操作（delete_project/canvas/item/relation）需 `confirm: true`\n- 不臆造内容，不确定的标为便签\n- 画布类命令内部自动 pushHistory 可回滚（set_style/set_preferences 属全局偏好，不入撤销栈）；batch 失败整体回滚\n\n";
      skill+="## 命令清单（37 个 op）\n\n";
      skill+="### 项目/画布\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| snapshot | — | 当前完整状态快照 |\n| activate | projectId?, canvasId? | 切到指定项目/画布 |\n| create_project | name | 新建项目 |\n| rename_project | projectId?, name | 重命名项目 |\n| delete_project | projectId?, confirm:true | 删除（需确认） |\n| create_canvas | projectId?, name | 新建画布 |\n| rename_canvas | projectId?, canvasId, name | 重命名画布 |\n| delete_canvas | projectId?, canvasId, confirm:true | 删除画布（需确认） |\n\n";
      skill+="### 元素创建\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| create_node | title, parentId?, color?, x?, y?, detail? | 新建思维节点 |\n| create_note | text/markdown, x?, y?, color?, fontFamily?, fontSize?, bold?, underline? | 新建便签 |\n| create_attachment | name, kind?, summary?, x?, y?, attachTo? | 新建附件（AI 来源材料） |\n| create_stroke | points:[{x,y}], color?, size? | 画笔线条 |\n| create_connector | a:{x,y,free?}, b:{x,y,free?}, color?, width? | 连接器 |\n| build_canvas | plan:{...} | 从计划批量构建画布（见下） |\n\n";
      skill+="### 元素操作\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| update_item | itemId, patch:{text?,color?,detail?,annotation?,x?,y?,w?,h?,collapsed?,fontFamily?,fontSize?,bold?,underline?,jumpTo?,previewOpen?} | 更新属性 |\n| duplicate_item | itemId | 复制 |\n| delete_item | itemId | 删除（含关系线） |\n\n";
      skill+="### 关系/连接\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| relate | from, to, type?, annotation? | 创建/更新关系线 |\n| update_relation | linkId, type?, annotation?, level?, shape? | 更新关系线 |\n| delete_relation | linkId | 删除关系线 |\n| attach | nodeId, itemId | 便签/附件关联到节点 |\n| detach | nodeId, itemId | 解除关联 |\n| reparent_node | nodeId, parentId? | 移动节点（防循环） |\n\n";
      skill+="### 形变/展开\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| toggle_morph | itemId | 切换附件形变预览 |\n| set_morph | itemId, open?:bool | 设定附件展开/收起 |\n| toggle_detail | itemId | 切换节点详情展开 |\n| set_detail | itemId, expand?:bool | 设定详情展开/收起 |\n\n";
      skill+="### 关系线样式\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| set_link_level | linkId, level:\"normal\"\\|\"emphasis\"\\|\"highlight\" | 线权重 |\n| set_link_shape | linkId, shape:\"auto\"\\|\"curve\"\\|\"polyline\"\\|\"straight\" | 线型 |\n\n";
      skill+="### 全局/系统\n| op | 关键参数 | 说明 |\n|----|----------|------|\n| set_layout | layout:\"right\"\\|\"org\"\\|\"u\"\\|\"fishbone\"\\|\"timeline\"\\|\"brace\" | 切换布局+自动排版 |\n| set_style | style, fontPreset? | 切换视觉样式+字体 |\n| set_preferences | dark?, bgPattern?, bgColorName?, stylePreset?, fontPreset? | 外观偏好 |\n| focus | itemId | 聚焦模式（高亮关联） |\n| exit_focus | — | 退出聚焦 |\n| undo | — | 撤销 |\n| redo | — | 重做 |\n| batch | commands:[{op,...}] | 批量（≤60 条，失败回滚） |\n\n";
      skill+="## buildCanvas 计划格式\n\n~~~json\n{\n  \"title\": \"画布标题\",\n  \"layout\": \"right\",\n  \"replace\": false,\n  \"rootTitle\": \"主题\",\n  \"nodes\": [{ \"key\":\"n1\", \"title\":\"节点\", \"parentKey\":null, \"color\":\"#2d5fd3\", \"order\":0, \"detail\":\"详情\", \"annotation\":\"批注\", \"collapsed\":false, \"jumpTo\":\"canvasId\" }],\n  \"notes\": [{ \"key\":\"note1\", \"text\":\"便签内容\", \"x\":0, \"y\":0, \"color\":\"#fef3c7\", \"attachTo\":\"n1\" }],\n  \"attachments\": [{ \"key\":\"att1\", \"name\":\"材料\", \"summary\":\"摘要\", \"x\":0, \"y\":0, \"previewOpen\":false, \"attachTo\":\"n1\" }],\n  \"relations\": [{ \"from\":\"n1\", \"to\":\"n2\", \"type\":\"causes\", \"annotation\":\"导致\", \"level\":\"emphasis\", \"shape\":\"curve\" }]\n}\n~~~\n\n";
      skill+="## 关系类型（type）\nrelated（关联·无向）、supports（支撑）、causes（导致）、contradicts（反证）、evidence（证据）\n\n";
      skill+="## 关系线权重（level）\nnormal（常规）、emphasis（强调）、highlight（高亮）\n\n";
      skill+="## 关系线线型（shape）\nauto、curve（曲线）、polyline（折线）、straight（直线）\n\n";
      skill+="## 布局类型（layout）\nright（逻辑图）、org（组织架构）、u（U型）、fishbone（鱼骨图）、timeline（时间轴）、brace（总分）\n\n";
      skill+="## 可用样式（set_style 的 style 值）\n"+stylesStr+"\n";
      skill+="## Slogan\n\n织连万象，见聚一隅。\nWeave the many, See the one.\n";
      skill+=reportGuide;
      var blob=new Blob([skill],{type:"text/markdown;charset=utf-8"});
      var url=URL.createObjectURL(blob);
      var a=document.createElement("a");
      a.download="织见-AI-Skill.md";a.href=url;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(url);},1000);
      toast("AI Skill 已导出");
    };
    var cb=content.querySelector("#copyReportGuide");
    if(cb)cb.onclick=function(){
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(reportGuide).then(function(){toast("指引已复制到剪贴板");}).catch(function(){fallbackCopy(reportGuide);});
      }else{fallbackCopy(reportGuide);}
      function fallbackCopy(text){var ta2=document.createElement("textarea");ta2.value=text;ta2.style.position="fixed";ta2.style.opacity="0";document.body.appendChild(ta2);ta2.select();try{document.execCommand("copy");toast("指引已复制到剪贴板");}catch(e){toast("复制失败，请手动选取");}ta2.remove();}
    };
  }
  else if(catId==="about"){
    content.innerHTML=
      '<h4 style="margin:0 0 16px;font-size:14px">关于织见</h4>'+
      '<div style="text-align:center;padding:20px 0">'+
      '<img src="'+(document.documentElement.getAttribute("data-theme")==="dark"?LOGO_PRESETS[logoPreset].comboDark:LOGO_PRESETS[logoPreset].comboLight)+'" style="width:64px;height:64px;object-fit:contain;margin-bottom:12px">'+
      '<div style="font-size:18px;font-weight:700;color:var(--ink)">织见 WEAVISION</div>'+
      '<div style="font-size:12px;color:var(--ink-dim);margin-top:4px">思维关系板 · '+(window.electronAPI&&window.electronAPI.isDesktop?"桌面版 ":"Demo ")+APP_VERSION+'</div>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:8px;font-style:italic">织连万象，见聚一隅</div>'+
      '</div>'+
      '<div style="font-size:12px;color:var(--ink);text-align:center;margin-top:12px;font-weight:600">Designed by Fantin</div>'+
      '<div style="font-size:11px;color:var(--ink-dim);text-align:center;margin-top:12px">本地优先 · '+(window.electronAPI&&window.electronAPI.isDesktop?"数据存储于本地文件系统":"数据存储于浏览器 localStorage")+'</div>'+
      '<div style="margin-top:20px;padding:12px;border:1px solid var(--card-border);border-radius:8px;background:var(--surface)">'+
      '<div style="font-size:12px;font-weight:600;color:var(--ink);margin-bottom:6px">版权与使用授权</div>'+
      '<div style="font-size:11px;color:var(--ink-dim);line-height:1.6">本软件由 FANTIN 以「源代码公开、免费使用、禁止商用」方式授权。个人及非营利组织可自由使用；商业用途须事先取得书面授权。</div>'+
      '<div style="font-size:11px;color:var(--ink-faint);margin-top:6px">商用授权 / 合作：996128611@qq.com</div>'+
      '<button id="viewLicenseBtn" style="margin-top:8px;padding:4px 12px;border:1px solid var(--card-border);border-radius:6px;background:transparent;color:var(--accent);font:600 11px var(--font);cursor:pointer">查看完整声明</button>'+
      '</div>';
    var vlb=content.querySelector("#viewLicenseBtn");
    if(vlb)vlb.onclick=function(){showLicenseModal();};
  }
}

if(typeof ResizeObserver!=="undefined"){
  new ResizeObserver(debounce(resize,120)).observe(board); /* H2 任务12: 防抖，避免动画/布局抖动时连环触发 resize→render */
}
