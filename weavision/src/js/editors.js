"use strict";
/* ============================================================
   下 Dock 栏：上下文工具条（内容只随状态切换，绝不叠加全局入口）
   ------------------------------------------------------------
   状态机：
     idle   —— 未选中任何元素：画布功能（布局/背景/画笔/批量选中/添加）
     select —— 选中元素：元素编辑功能（连接/聚焦/展开/跃迁/批注…）
     edit   —— 编辑态：当前编辑场景的功能浮窗（与编辑上下文强绑定）
   切换规则（过渡）：
     淡出 .18s var(--ease-out) → 换内容 → 淡入 .26s var(--ease-pop)
     即：先加 .switching（180ms 淡出+下沉10px+缩至.97），
         换完 DOM 后移除 .switching 触发淡入（260ms，带回弹缓动）。
   层级优先级：
     编辑态(edit) > 选中(select) > 空闲(idle)
     编辑态时跟随鼠标的 #noteFormatBar 显示"全部功能"（完整格式工具），
     下 Dock 只显示该场景"主要功能"，两者层级不同、互不冲突。
============================================================ */
const dockBar=document.getElementById("dockBar");
const dockInner=dockBar?dockBar.querySelector(".dock-inner"):null;
let dockState=null,dockSwitchTimer=0,dockSelectionKey="";
function dkBtn(opt){
  const b=document.createElement("button");
  b.className="dk-btn"+(opt.on?" on":"");
  b.title=opt.title||opt.label||"";
  b.innerHTML=(opt.icon||"")+(opt.label?'<span>'+escapeHtml(opt.label)+'</span>':"");
  b.addEventListener("click",opt.fn);
  return b;
}
function dkSep(){const s=document.createElement("span");s.className="dk-sep";return s;}
function dkLabel(t){const s=document.createElement("span");s.className="dk-label";s.textContent=t;return s;}
/* 下 Dock 内容：只随状态变化 */

/* E5: Detail inline editor — reuses noteEditor + noteFormatBar */
let editingDetailId=null;
function openDetailEditor(it){
  if(!it||it.type!=="mindNode")return;
  closeEditor(true);closeMindEditor(true);
  editingDetailId=it.id;activeMdEditor=noteEd;
  noteEd.value=it.detail||"";
  const b=itemBounds(it);
  const contentY=b.y+detailBaseHeight(it,b);
  const tl=w2s(b.x,contentY),br=w2s(b.x+b.w,b.y+b.h);
  noteEd.style.display="block";noteEd.classList.remove("float");
  noteEd.style.left=tl.x+"px";noteEd.style.top=tl.y+"px";
  noteEd.style.width=(br.x-tl.x)+"px";noteEd.style.height=(br.y-tl.y)+"px";
  noteEd.style.fontSize="13px";noteEd.style.background="#fff";noteEd.style.color="#1d1d1f";
  if(typeof showNoteEditorChrome==="function")showNoteEditorChrome(it,tl,br);
  noteEd.focus();noteEd.setSelectionRange(noteEd.value.length,noteEd.value.length);
  renderDock(true);
}

function dockContent(st){
  const sel=selectedItem();
  if(st==="edit"){
    /* 编辑态：当前编辑场景的功能（与上下文强绑定） */
    const out=[dkLabel("编辑中")];
    if(editingNoteId!==null){
      out.push(dkBtn({icon:ICON.check||"✔",label:"完成",title:"完成编辑 (Ctrl+Enter)",fn:()=>{closeEditor(false);render();saveState();}}));
      out.push(dkSep());
      out.push(dkBtn({icon:"🔤",label:"字体",title:"字体工具栏（全部功能）",fn:()=>{noteFormatBar.style.display=noteFormatBar.style.display==="none"?"flex":"none";}}));
      out.push(dkBtn({icon:"𝐁",label:"粗体",title:"加粗 **文本**",fn:()=>mdWrap("**","**","加粗")}));
      out.push(dkBtn({icon:"𝐼",label:"斜体",title:"斜体 *文本*",fn:()=>mdWrap("*","*","斜体")}));
      out.push(dkBtn({icon:"H",label:"标题",title:"标题层级",on:dockSubKind==="mdHeading",fn:()=>toggleDockSub("mdHeading")}));
      out.push(dkBtn({icon:"▦",label:"区块",title:"列表、待办、表格、引用与分割线",on:dockSubKind==="mdBlock",fn:()=>toggleDockSub("mdBlock")}));
      out.push(dkBtn({icon:"</>",label:"代码",title:"行内代码 `code`",fn:()=>mdWrap("`","`","code")}));
      out.push(dkBtn({icon:"🔗",label:"链接",title:"插入链接 [文本](https://)",fn:()=>mdInsert("[文本](https://)")}));
    }else if(editingDetailId!==null){
      out.push(dkBtn({icon:ICON.check||"✔",label:"完成",title:"完成编辑 (Ctrl+Enter)",fn:()=>{closeEditor(false);render();saveState();}}));
      out.push(dkSep());
      out.push(dkBtn({icon:"🔤",label:"字体",title:"字体工具栏（全部功能）",fn:()=>{noteFormatBar.style.display=noteFormatBar.style.display==="none"?"flex":"none";}}));
      out.push(dkBtn({icon:"𝐁",label:"粗体",title:"加粗 **文本**",fn:()=>mdWrap("**","**","加粗")}));
      out.push(dkBtn({icon:"𝐼",label:"斜体",title:"斜体 *文本*",fn:()=>mdWrap("*","*","斜体")}));
      out.push(dkBtn({icon:"H",label:"标题",title:"标题层级",on:dockSubKind==="mdHeading",fn:()=>toggleDockSub("mdHeading")}));
      out.push(dkBtn({icon:"▦",label:"区块",title:"列表、待办、表格、引用与分割线",on:dockSubKind==="mdBlock",fn:()=>toggleDockSub("mdBlock")}));
      out.push(dkBtn({icon:"</>",label:"代码",title:"行内代码 `code`",fn:()=>mdWrap("`","`","code")}));
      out.push(dkBtn({icon:"🔗",label:"链接",title:"插入链接 [文本](https://)",fn:()=>mdInsert("[文本](https://)")}));
    }else if(editingMindId!==null){
      out.push(dkBtn({icon:"✔",label:"完成",title:"完成 (Enter)",fn:()=>{closeMindEditor(false);render();saveState();}}));
      out.push(dkSep());
      out.push(dkBtn({icon:ICON.plus,label:"子级",title:"新建子级 (Tab)",fn:()=>{const n=state.items.find(i=>i.id===editingMindId);if(n){closeMindEditor(false);addChildMind(n);}}}));
      out.push(dkBtn({icon:ICON.plus,label:"同级",title:"新建同级 (Enter)",fn:()=>{const n=state.items.find(i=>i.id===editingMindId);if(n){closeMindEditor(false);addSiblingMind(n);}}}));
    }
    return out;
  }
  if(st==="select"&&sel){
    const out=[];
    /* 连接待选态：按钮高亮 + 文案切换 */
    if(sel.type==="mindLink"){
      /* E5: mind links also support level/shape — stored on child node */
      var lvlLabels={normal:"普通",emphasis:"强调",highlight:"醒目"};
      var shpLabels={auto:"跟随",curve:"曲线",polyline:"折线",straight:"直线"};
      var mlChild=state.items.find(x=>x.id===sel.bId);
      var mlLvl=mlChild?(mlChild._linkLevel||"normal"):"normal";
      var mlShp=mlChild?(mlChild._linkShape||"auto"):"auto";
      out.push(dkBtn({icon:"≡",label:lvlLabels[mlLvl],title:"线等级",on:dockSubKind==="linkLevel",fn:()=>toggleDockSub("linkLevel")}));
      out.push(dkBtn({icon:"∼",label:shpLabels[mlShp],title:"线形状",on:dockSubKind==="linkShape",fn:()=>toggleDockSub("linkShape")}));
      out.push(dkBtn({icon:ICON.check||"✔",label:"取消选择",title:"回到画布",fn:()=>{state.selected=null;render();renderDock(true);}}));
      return out;
    }else if(sel.type==="mindNode"){
      out.push(dkBtn({icon:ICON.connector,label:linkPendingId===sel.id?"取消连接":"连接",title:"连接选中 (C)",on:linkPendingId===sel.id,fn:()=>toggleLink()}));
      out.push(dkBtn({icon:ICON.focus,label:"聚焦",title:"聚焦 (F)",fn:()=>{state.selected=sel.id;enterFocus(sel.id);}}));
      out.push(dkBtn({icon:ICON.plus,label:"形变展开",title:"形变展开 (E)",fn:()=>{state.selected=sel.id;toggleDetailInPlace(sel);}}));
      if(sel.detail)out.push(dkBtn({icon:ICON.trash,label:"删除展开",title:"删除展开内容 (Alt+E)",fn:()=>{pushHistory("删除展开内容");sel.detail="";collapseDetailInPlace(sel);render();saveState();toast("已删除展开内容");}}));
      out.push(dkBtn({icon:ICON.fullscreen,label:"全屏编辑",title:"展开内容全屏编辑（Typora 式）",fn:()=>{state.selected=sel.id;openDetailFullscreen(sel);}}));
      out.push(dkSep());
      out.push(dkBtn({icon:ICON.plus,label:"子级",title:"新建子级 (Tab)",fn:()=>addChildMind(sel)}));
      out.push(dkBtn({icon:ICON.plus,label:"同级",title:"新建同级 (Enter)",fn:()=>addSiblingMind(sel)}));
    }else if(sel.type==="note"||sel.type==="fileCard"){
      if(sel.type==="note"&&sel.sourceRef)out.push(dkBtn({icon:"↗",label:"查看来源",title:"打开附件并定位摘录原文",fn:()=>openSourceRef(sel)}));
      out.push(dkBtn({icon:ICON.connector,label:linkPendingId===sel.id?"取消连接":"连接",title:"连接选中 (C)",on:linkPendingId===sel.id,fn:()=>toggleLink()}));
      out.push(dkBtn({icon:ICON.focus,label:"聚焦",title:"聚焦 (F)",fn:()=>{state.selected=sel.id;enterFocus(sel.id);}}));
      out.push(dkBtn({icon:ICON.fullscreen,label:"全屏",title:"全屏预览 (Alt+F)",fn:()=>{
        if(sel.type==="fileCard"){const f=state.files.find(x=>x.id===sel.fileId);if(f){openFullscreen(f);toast("全屏预览："+f.name);}}
        else openFullscreenNote(sel);
      }}));
      out.push(dkBtn({icon:ICON.annotate,label:"批注",title:"批注 (A)",fn:()=>openAnnotation()}));
      out.push(dkSep());
      out.push(dkBtn({icon:ICON.edit,label:"编辑",title:"编辑内容 (双击)",fn:()=>{if(sel.type==="note")openTextEditor(sel);else{state.selected=sel.id;/* E5: openDetail removed */}}}));
    }else if(sel.type==="link"){
    out.push(dkBtn({icon:"↗",label:"来源",title:"设置证据来源",fn:()=>editSourceRef(sel)}));
    if(sel.sourceRef)out.push(dkBtn({icon:"↗",label:"查看来源",title:"定位到证据原文",fn:()=>openSourceRef(sel)}));
    /* E5: link dock — level, shape, relation, annotate, focus */
    var lvlLabels={normal:"普通",emphasis:"强调",highlight:"醒目"};
    var lvl=sel.level||"normal";
    out.push(dkBtn({icon:"≡",label:lvlLabels[lvl],title:"线等级",on:dockSubKind==="linkLevel",fn:()=>toggleDockSub("linkLevel")}));
    var shpLabels={auto:"跟随",curve:"曲线",polyline:"折线",straight:"直线"};
    var shp=sel.shape||"auto";
    out.push(dkBtn({icon:"∼",label:shpLabels[shp],title:"线形状",on:dockSubKind==="linkShape",fn:()=>toggleDockSub("linkShape")}));
    out.push(dkBtn({icon:ICON.connector,label:(RELATION_TYPES[sel.relationType]||{}).label||"关联",title:"关系语义",fn:()=>setLinkRelation(sel)}));
    out.push(dkBtn({icon:ICON.annotate,label:"批注",title:"批注 (A)",fn:()=>openAnnotation()}));
    out.push(dkBtn({icon:ICON.focus,label:"聚焦",title:"聚焦 (F)",fn:()=>{state.selected=sel.id;enterFocus(sel.id);}}));
  }else{
    out.push(dkBtn({icon:ICON.focus,label:"聚焦",title:"聚焦 (F)",fn:()=>{state.selected=sel.id;enterFocus(sel.id);}}));
    out.push(dkBtn({icon:ICON.annotate,label:"批注",title:"批注 (A)",fn:()=>openAnnotation()}));
  }
    out.push(dkSep());
    out.push(dkBtn({icon:ICON.trash||"🗑",label:"删除",title:"删除 (Delete)",fn:()=>{deleteItem(sel.id);}}));
    return out;
  }
  /* idle：画布功能（仅当前状态的上下文操作，不含全局入口） */
  const out=[dkLabel("画布")];
  out.push(dkBtn({icon:ICON.layout,label:"布局",title:"布局样式（点击展开选择）",on:dockSubKind==="layout",fn:()=>{toggleDockSub("layout");}}));
  out.push(dkBtn({icon:ICON.style,label:"样式",title:"样式风格（点击展开选择）",on:dockSubKind==="style",fn:()=>{toggleDockSub("style");}}));
  out.push(dkBtn({icon:ICON.grid,label:"背景",title:"背景颜色与纹理（点击展开选择）",on:dockSubKind==="bg",fn:()=>{toggleDockSub("bg");}}));
  out.push(dkBtn({icon:ICON.pen,label:"画笔",title:"画笔 (P)",on:state.tempTool==="pen",fn:()=>{state.tempTool=state.tempTool==="pen"?"":"pen";renderToolOptions();renderDock(true);toast(state.tempTool==="pen"?"画笔模式":"已退出");}}));
  out.push(dkBtn({icon:ICON.note,label:"便签",title:"便签模式 (N)",on:state.tempTool==="note",fn:()=>{state.tempTool=state.tempTool==="note"?"":"note";renderToolOptions();renderDock(true);toast(state.tempTool==="note"?"便签模式":"已退出");}}));
  out.push(dkSep());
  out.push(dkBtn({icon:ICON.marquee,label:"框选",title:"拖空白框选；点击累加；再次拖动已选元素可整体移动",on:state.tool==="marquee",fn:()=>{setTool(state.tool==="marquee"?"select":"marquee");renderDock(true);toast(state.tool==="marquee"?"框选模式：拖空白框选，点击累加；再次拖已选元素才会整体移动":"已退出框选模式");}}));
  out.push(dkBtn({icon:ICON.plus,label:"添加",title:"添加节点/文件",fn:()=>{const t=document.querySelector('.menu-tab[data-menu="add"]');if(t)t.click();}}));
  out.push(dkSep());
  out.push(dkBtn({icon:ICON.immersive,label:"沉浸",title:"沉浸模式（隐藏辅助元素，F11）",on:document.body.classList.contains("immersive"),fn:()=>{toggleImmersive();renderDock(true);}}));
  return out;
}
/* 通过点击顶栏 menu-tab 打开对应菜单（复用上 Dock 的全局入口） */
/* 计算当前应处的状态 */
function dockTargetState(){
  if(editingNoteId!==null||editingMindId!==null||editingDetailId!==null)return "edit";
  if(state.selected)return "select";
  return "idle";
}
/* 渲染下 Dock：状态变化时淡出→换内容→淡入 */
function renderDock(immediate){
  if(!dockBar||!dockInner)return;
  const st=dockTargetState();
  const sel=selectedItem(),key=String(state.selected)+":"+String(sel?.type)+":"+String(!!sel?.sourceRef);
  const changed=(st!==dockState||key!==dockSelectionKey);
  if(!changed&&!immediate)return;
  dockSelectionKey=key;
  if(dockSwitchTimer){clearTimeout(dockSwitchTimer);dockSwitchTimer=0;}
  dockState=st;
  dockBar.dataset.state=st;
  const build=()=>{
    dockInner.innerHTML="";
    const items=dockContent(st);
    if(!items.length){dockBar.classList.add("hidden");return;}
    dockBar.classList.remove("hidden");
    items.forEach(el=>dockInner.appendChild(el));
  };
  if(immediate||!changed||st==="select"){build();dockBar.classList.remove("switching");return;}
  /* 过渡：淡出 180ms → 换内容 → 淡入 260ms */
  if(dockSwitchTimer)clearTimeout(dockSwitchTimer);
  dockBar.classList.add("switching");
  dockSwitchTimer=setTimeout(()=>{
    build();
    requestAnimationFrame(()=>{dockBar.classList.remove("switching");});
  },180);
}
/* ============================================================
   底 Dock 二级菜单：布局 / 背景 缩略图选择面板
   —— 悬停或点击按钮 → 面板浮在 Dock 上方展示缩略图
   —— 点选直接应用 → 实时生效 → 高亮当前项（✓ 角标 + 描边）
============================================================ */
let dockSubKind=null;      /* "layout" | "bg" | null */
const dockSubEl=document.getElementById("dockSub");
/* 布局缩略图：用简笔 SVG 表达五种布局形态 */
const LAYOUT_THUMBS={
  right:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="6" y="16" width="20" height="16" rx="3" fill="#2d5fd3"/><rect x="42" y="4" width="14" height="10" rx="2" fill="#9db8f0"/><rect x="42" y="19" width="14" height="10" rx="2" fill="#9db8f0"/><rect x="42" y="34" width="14" height="10" rx="2" fill="#9db8f0"/><rect x="74" y="4" width="12" height="7" rx="2" fill="#c9d8f8"/><rect x="74" y="19" width="12" height="7" rx="2" fill="#c9d8f8"/><path d="M26 24h16M56 9h18M56 24h18M56 39h18" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  left:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="70" y="16" width="20" height="16" rx="3" fill="#2d5fd3"/><rect x="40" y="4" width="14" height="10" rx="2" fill="#9db8f0"/><rect x="40" y="19" width="14" height="10" rx="2" fill="#9db8f0"/><rect x="40" y="34" width="14" height="10" rx="2" fill="#9db8f0"/><rect x="10" y="4" width="12" height="7" rx="2" fill="#c9d8f8"/><rect x="10" y="19" width="12" height="7" rx="2" fill="#c9d8f8"/><path d="M70 24H54M40 9H22M40 24H22M40 39H22" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  org:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="36" y="3" width="24" height="11" rx="3" fill="#2d5fd3"/><rect x="6" y="34" width="16" height="11" rx="2" fill="#9db8f0"/><rect x="40" y="34" width="16" height="11" rx="2" fill="#9db8f0"/><rect x="74" y="34" width="16" height="11" rx="2" fill="#9db8f0"/><path d="M48 14v8M48 22H14M48 22h18M48 22H82" stroke="#7c98d8" stroke-width="1.5" fill="none"/><path d="M14 28v6M48 28v6M82 28v6" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  u:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="3" y="3" width="22" height="14" rx="3" fill="#2d5fd3"/><rect x="3" y="31" width="16" height="11" rx="2" fill="#9db8f0"/><rect x="33" y="31" width="16" height="11" rx="2" fill="#9db8f0"/><rect x="63" y="31" width="16" height="11" rx="2" fill="#9db8f0"/><path d="M14 17v14M14 31h34M48 31v-4" stroke="#7c98d8" stroke-width="1.5" fill="none"/><path d="M11 17h6M62 31h17" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  fishbone:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="56" y="19" width="32" height="10" rx="3" fill="#2d5fd3"/><rect x="6" y="4" width="16" height="9" rx="2" fill="#9db8f0"/><rect x="6" y="19" width="16" height="9" rx="2" fill="#9db8f0"/><rect x="6" y="35" width="16" height="9" rx="2" fill="#9db8f0"/><path d="M22 8h34M22 24h34M22 40h34" stroke="#7c98d8" stroke-width="1.5" fill="none"/><path d="M56 8v32" stroke="#7c98d8" stroke-width="1" fill="none"/></svg>',
  timeline:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="3" y="20" width="14" height="9" rx="2" fill="#2d5fd3"/><rect x="31" y="20" width="14" height="9" rx="2" fill="#9db8f0"/><rect x="59" y="20" width="14" height="9" rx="2" fill="#9db8f0"/><rect x="3" y="4" width="17" height="7" rx="2" fill="#c9d8f8"/><rect x="31" y="4" width="17" height="7" rx="2" fill="#c9d8f8"/><rect x="59" y="4" width="17" height="7" rx="2" fill="#c9d8f8"/><path d="M17 24h14M45 24h14M20 7.5h11M48 7.5h11" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  brace:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="6" y="18" width="16" height="12" rx="3" fill="#2d5fd3"/><rect x="48" y="3" width="12" height="9" rx="2" fill="#9db8f0"/><rect x="48" y="19" width="12" height="9" rx="2" fill="#9db8f0"/><rect x="48" y="35" width="12" height="9" rx="2" fill="#9db8f0"/><path d="M22 24h10" stroke="#7c98d8" stroke-width="1.5" fill="none"/><path d="M32 24c8 0 4-18 14-18M32 24c8 0 4 18 14 18M32 24c8 0 4-8 14-8M32 24c8 0 4 8 14 8" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  both:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="39" y="16" width="18" height="16" rx="3" fill="#2d5fd3"/><rect x="6" y="4" width="16" height="10" rx="2" fill="#9db8f0"/><rect x="6" y="19" width="16" height="10" rx="2" fill="#9db8f0"/><rect x="6" y="34" width="16" height="10" rx="2" fill="#9db8f0"/><rect x="74" y="4" width="16" height="10" rx="2" fill="#9db8f0"/><rect x="74" y="19" width="16" height="10" rx="2" fill="#9db8f0"/><rect x="74" y="34" width="16" height="10" rx="2" fill="#9db8f0"/><path d="M39 24H22M39 24H22M39 24H22M57 24h17M57 24h17M57 24h17" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
  fourway:'<svg viewBox="0 0 96 48" width="100%" height="100%"><rect x="39" y="17" width="18" height="14" rx="3" fill="#2d5fd3"/><rect x="5" y="19" width="17" height="10" rx="2" fill="#9db8f0"/><rect x="74" y="19" width="17" height="10" rx="2" fill="#9db8f0"/><rect x="31" y="3" width="15" height="9" rx="2" fill="#9db8f0"/><rect x="50" y="3" width="15" height="9" rx="2" fill="#9db8f0"/><rect x="31" y="36" width="15" height="9" rx="2" fill="#9db8f0"/><rect x="50" y="36" width="15" height="9" rx="2" fill="#9db8f0"/><path d="M39 24H22M57 24h17M48 17V12M48 31v5" stroke="#7c98d8" stroke-width="1.5" fill="none"/></svg>',
};
LAYOUT_THUMBS.logic=LAYOUT_THUMBS.right;
/* L6：名称直接描述"排布往哪去"，不再用"逻辑图"这类看不出方向的说法。
   第三项是面板里的说明文案，同时作为 title 悬浮提示。
   顺序按使用频率排：逐级向右（默认）→ 左右分布 → 上下左右 → 纯向下 → U 型 → 鱼骨 → 时间轴。 */
const LAYOUT_ORDER=[
  ["logic","逐级向右","子节点一级一级向右展开，链条长时纵向会拉得很长"],
  ["both","左右分布","一级分支左右两侧对半分，画面接近方形"],
  ["fourway","上下左右","一级分支向上、下、左、右四个方向辐射展开"],
  ["org","纯向下","像组织架构图那样逐层向下摊开，过宽自动折行"],
  ["fishbone","鱼骨形","主轴横向放置，分支交替斜插在上下两侧"],
  ["timeline","时间轴","一级节点沿横向轴线排列，子树垂在轴下方"],
];
/* 已下线：U 型（u）。它的一级分支沿左侧纵向罗列，实测 818×3953、宽高比 0.21，
   是所有排布里最细长的一种——与"逐级向右"同为纵向形态却更极端，
   在菜单里属于负价值项；且它的子树纵向间距与兄弟分支冲突，是唯一出现
   "节点互压"的模板。相关实现 uShapeLayout 保留在 layout.js，未接入菜单与 AI 布局清单。 */
/* 背景色板（与 _BCM 一致） */
/* 背景色板（与 BK 函数内 _BCM 一致，供二级菜单全局使用） */
const BG_COLORS=[["mixed","流光"],["red","红色"],["yellow","黄色"],["blue","蓝色"],["green","绿色"]];
const BG_PATTERNS=[["grid","网格"],["dots","圆点"],["paper","纸纹"],["blank","纯色"]];
function applyLayout(id){
  pushHistory(state.layoutType===id?"重新排版":"切换布局");
  state.layoutType=id;autoLayout();render();saveState();
  renderDockSub();
  toast("布局："+((LAYOUT_ORDER.find(x=>x[0]===id)||["",""])[1]||id));
}
function relayoutCanvas(){
  pushHistory("重新排版");
  autoLayout();render();saveState();
  toast("已按当前布局重新排版");
}
/* ============================================================
   一键优化：三个强度档
   ------------------------------------------------------------
   用户原话是"我自己建立的布局，大体的样子其实已经定了，我只是想对它进行
   美观性优化"。据此把"整理"拆成三档，强度从低到高：
     · 优化排布（polishCanvas / layout.js 的 polishLayout）
         —— 坐标不可侵犯。只把"差一点点没对齐"的那批兄弟吸附齐、把真压住
            的推开。没被压住、也没差一点的节点，一个像素都不动。
     · 规整排布（tidyCanvas / layout.js 的 tidyLayout）
         —— 保留方位、兄弟顺序、纵向行结构，但**重算所有非根节点坐标**，
            等距排开。它本质上已经是重排，只是方位来自当前坐标而非模板。
     · 按布局重排（relayoutCanvas）
         —— 用当前选中的布局模板把整张图重排，形状完全交给规则。
   最初把 tidyCanvas 直接叫作"优化排布"是名实不符——用户实测后指出了
   "它改变了原本的排布逻辑"，这个判断是对的，故拆档并补上真正的保形版。
============================================================ */
function tidyCanvas(){
  const root=layoutRoot();
  if(!root){toast("当前画布还没有导图节点");return;}
  pushHistory("一键优化排布");
  normalizeTree();
  sortSiblings();
  /* 先清掉上一轮排布留下的朝向：tidy 的方位判定走的是"当前坐标"，
     残留的 branchDirection 只会在 placeAttachments 阶段被误读。 */
  for(const it of state.items){if(it.type==="mindNode")delete it.branchDirection;}
  for(const it of state.items){if(it.annotation)it.annotationSide="bottom";}
  const spec=layoutSpec();
  state._layoutSpec=spec;
  const n=tidyLayout();
  placeAttachments({below:"right"});
  settleLayoutOverlaps();
  delete state._layoutSpec;
  render();saveState();
  toast(n?("已规整排布：重排了 "+n+" 个分支的间距与对齐"):"当前没有可整理的分支");
}
/* 保形整理：只做兄弟吸附 + 消重叠，节点坐标结构不动。
   实现在 layout.js 的 polishLayout()，这里只负责前后处理与结果播报。 */
function polishCanvas(){
  const root=layoutRoot();
  if(!root){toast("当前画布还没有导图节点");return;}
  pushHistory("优化排布");
  const r=polishLayout();
  placeAttachments({below:"right"});
  settleLayoutOverlaps();
  render();saveState();
  const parts=[];
  if(r.aligned)parts.push("对齐 "+r.aligned+" 组兄弟");
  if(r.separated)parts.push("分开 "+r.separated+" 处重叠");
  if(!parts.length){
    toast(r.skipped?("没有可安全调整处："+r.skipped+" 处重叠需要大位移，已跳过"):"这张图已经足够整齐，未作调整");
    return;
  }
  toast("已优化："+parts.join(" · ")+(r.skipped?"（另有 "+r.skipped+" 处位移过大已跳过）":""));
}
/* ============================================================
   L6：画布级线型（连线形态）
   ------------------------------------------------------------
   线型能力本身早就有了（link.shape / mindNode._linkShape，取值为
   auto / curve / polyline / straight），但入口只有"选中某条连线后"
   才在上下文菜单里出现，语义上却是整张画布层级的设置——44 条线要一条条点。
   这里补上画布级入口，一次作用于当前画布的全部连线。
   state.items / state.links 存的就是当前活动画布的内容，无需再按画布过滤。
============================================================ */
const LINK_SHAPES=[["auto","跟随布局"],["curve","曲线"],["polyline","折线"],["straight","直线"]];
const LINK_SHAPE_ICONS={
  auto:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c98d8" stroke-width="1.7" stroke-linecap="round"><path d="M4 18 Q12 6 20 18" opacity=".4"/><path d="M4 18 Q12 6 20 18"/></svg>',
  curve:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c98d8" stroke-width="1.7" stroke-linecap="round"><path d="M4 18 Q12 6 20 18"/></svg>',
  polyline:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c98d8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18 L10 18 L10 6 L20 6"/></svg>',
  straight:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7c98d8" stroke-width="1.7" stroke-linecap="round"><line x1="4" y1="18" x2="20" y2="6"/></svg>'
};
/* 当前画布线型：全部一致时返回该值；混合时返回 mixed（此时无按钮高亮） */
function currentCanvasLinkShape(){
  const vals=[];
  for(const l of state.links)vals.push(l.shape||"auto");
  for(const it of state.items)if(it.type==="mindNode"&&it.parentId)vals.push(it._linkShape||"auto");
  if(!vals.length)return "auto";
  const first=vals[0];
  return vals.every(v=>v===first)?first:"mixed";
}
/* 一次作用于整张画布的全部连线：父子层级连接（存在子节点的 _linkShape）
   与自由关系线（link.shape）。 */
function applyCanvasLinkShape(shape){
  if(!LINK_SHAPES.some(x=>x[0]===shape))return;
  pushHistory("设置线型");
  let n=0;
  for(const l of state.links){l.shape=shape;n++;}
  for(const it of state.items){
    if(it.type!=="mindNode"||!it.parentId)continue;
    it._linkShape=shape;n++;
  }
  render();saveState();
  toast("线型："+((LINK_SHAPES.find(x=>x[0]===shape)||["",""])[1])+"（"+n+" 条）");
}
function applyBgColor(name){
  state.bgColorName=name;
  state.bgColor=getBgColor(name||"default", state.dark);
  if(typeof updateBgLayers==="function")updateBgLayers();
  render();saveState();
  renderDockSub();
}
function applyBgPattern(pat){
  state.bgPattern=pat;
  if(typeof updateBgLayers==="function")updateBgLayers();
  render();saveState();
  renderDockSub();
  toast("纹理："+((BG_PATTERNS.find(x=>x[0]===pat)||["",""])[1]||pat));
}
function applyMindColorMode(mode){
  if(mode!=="single"&&mode!=="auto")return;
  state.mindColorMode=mode;
  renderDockSub();render();saveState();
  toast(mode==="auto"?"节点配色：自动轮换":"节点配色：统一单色");
}
function toggleDockSub(kind){
  if(dockSubKind===kind){dockSubKind=null;dockSubEl.classList.remove("show");renderDock(true);return;}
  dockSubKind=kind;
  renderDockSub();
  renderDock(true);
}
function renderDockSub(){
  if(!dockSubEl)return;
  if(!dockSubKind){dockSubEl.classList.remove("show");return;}
  dockSubEl.innerHTML="";
  if(dockSubKind==="mdHeading"||dockSubKind==="mdBlock"){
    const isHeading=dockSubKind==="mdHeading";
    const title=document.createElement("div");title.className="ds-title";title.textContent=isHeading?"标题层级":"内容区块";
    dockSubEl.appendChild(title);
    const grid=document.createElement("div");grid.className="ds-grid";
    const choices=isHeading
      ?[["H1","一级标题",()=>mdLinePrefix("# ",true)],["H2","二级标题",()=>mdLinePrefix("## ",true)],["H3","三级标题",()=>mdLinePrefix("### ",true)],["正文","正文",()=>mdLinePrefix("",false)]]
      :[["☑","待办",()=>mdLinePrefix("- [ ] ",true)],["•","无序列表",()=>mdLinePrefix("- ",true)],["1.","有序列表",()=>mdLinePrefix("1. ",true)],["▦","表格",()=>mdInsert(TABLE_TPL)],["❝","引用",()=>mdLinePrefix("> ",true)],["—","分割线",()=>mdInsert("\n---\n")],["S̶","删除线",()=>mdWrap("~~","~~","删除线")],["U","下划线",()=>mdWrap("++","++","下划线")]];
    for(const [icon,label,run] of choices){
      const it=document.createElement("button");it.type="button";it.className="ds-item";
      it.innerHTML='<div class="ds-thumb" style="display:grid;place-items:center;font-size:18px;font-weight:700">'+icon+'</div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>{run();hideDockSub();});grid.appendChild(it);
    }
    dockSubEl.appendChild(grid);
  }else if(dockSubKind==="layout"){
    /* ── 分区一：选择布局（排布）—— 只改节点坐标 ──────────────────
       L6 把"排布"与"线型"拆成两个并列分区。此前线型只能靠选中某条连线才在
       上下文菜单里出现，两件事混在一个入口下，"布局"其实只做了排布这一半。
       列数固定 3：6 个布局正好两行。用 auto-fill 时 620px 宽的面板排得下 5 列，
       6 个项会落成"5 + 1"，第二行孤零零一个，很难看。 */
    const t=document.createElement("div");t.className="ds-title";t.textContent="选择布局";
    dockSubEl.appendChild(t);
    const grid=document.createElement("div");grid.className="ds-grid cols-3";
    for(const [id,label,desc] of LAYOUT_ORDER){
      const it=document.createElement("div");
      it.className="ds-item"+(state.layoutType===id?" on":"");
      if(desc)it.title=label+"："+desc;
      it.innerHTML='<div class="ds-thumb">'+(LAYOUT_THUMBS[id]||"")+'</div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>applyLayout(id));
      grid.appendChild(it);
    }
    dockSubEl.appendChild(grid);
    /* ── 分区二：一键优化 —— 不改布局类型，只把当前这张图整理干净 ──────
       三个档位，强度由低到高（区别详见 polishCanvas / tidyCanvas 上方注释）：
         · 优化排布   = 保形：只吸附 + 消重叠，坐标结构不动（polishLayout）
         · 规整排布   = 保留方位/顺序/行，但重算坐标、等距排开（tidyLayout）
         · 按布局重排 = 形状完全交给当前选中的布局模板
       用户实测指出旧的「优化排布」其实改变了原本的排布逻辑——它做的是
       规整档的行为，却被放在了保形档的位置上；现在补上真正的保形档，
       三个档各就各位。列数 3：正好一行放完。 */
    const ot=document.createElement("div");ot.className="ds-title";ot.textContent="一键优化";
    dockSubEl.appendChild(ot);
    const ogrid=document.createElement("div");ogrid.className="ds-grid cols-3";
    /* 档一：优化排布（保形） */
    const pol=document.createElement("div");
    pol.className="ds-item ds-auto";
    pol.title="优化排布：不动你摆的坐标，只把差一点点没对齐的兄弟吸附齐、把真正压住的推开。没被压住也没差一点的节点，一个像素都不动。";
    pol.innerHTML='<div class="ds-thumb" style="background:linear-gradient(145deg,#12916a,#1f9d7a);display:grid;place-items:center">'
      +'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
      +'<path d="M5 3.5v17" stroke-dasharray="2 2.2" opacity=".75"/>'
      +'<rect x="8" y="4" width="12" height="4.2" rx="1.2" opacity=".95"/>'
      +'<rect x="8" y="9.9" width="7" height="4.2" rx="1.2" opacity=".95"/>'
      +'<rect x="8" y="15.8" width="9.5" height="4.2" rx="1.2" opacity=".95"/></svg>'
      +'</div><span class="ds-name">优化排布</span>';
    pol.addEventListener("click",()=>{polishCanvas();});
    ogrid.appendChild(pol);
    /* 档二：规整排布（保留方位/顺序/行，但重算坐标） */
    const tidy=document.createElement("div");
    tidy.className="ds-item ds-auto";
    tidy.title="规整排布：保留当前方位、兄弟顺序与行的划分，把所有节点等距重排一遍。注意——它会重算每个节点的坐标，你摆出来的距离会被抹平。";
    tidy.innerHTML='<div class="ds-thumb" style="background:linear-gradient(145deg,#2f6fd8,#3f86e6);display:grid;place-items:center">'
      +'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
      +'<path d="M5 3.2v17.6" opacity=".55"/>'
      +'<rect x="8" y="4" width="11" height="4.5" rx="1.3" opacity=".95"/>'
      +'<rect x="8" y="9.75" width="11" height="4.5" rx="1.3" opacity=".95"/>'
      +'<rect x="8" y="15.5" width="11" height="4.5" rx="1.3" opacity=".95"/></svg>'
      +'</div><span class="ds-name">规整排布</span>';
    tidy.addEventListener("click",()=>{tidyCanvas();});
    ogrid.appendChild(tidy);
    /* 档三：按布局重排（模板） */
    const re=document.createElement("div");
    re.className="ds-item ds-auto";
    re.title="按布局重排：用当前选中的布局，把整张图重新排一遍（形状会被布局规则覆盖）";
    re.innerHTML='<div class="ds-thumb" style="background:linear-gradient(145deg,#7a55c0,#5d3fb0);display:grid;place-items:center">'
      +'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
      +'<rect x="3" y="6" width="6" height="6" rx="1.5" opacity=".9"/><rect x="15" y="6" width="6" height="6" rx="1.5" opacity=".9"/>'
      +'<rect x="9" y="15" width="6" height="6" rx="1.5" opacity=".9"/>'
      +'<path d="M9 9h6M12 12v3" stroke="#fff" stroke-width="1.5"/></svg>'
      +'</div><span class="ds-name">按布局重排</span>';
    re.addEventListener("click",()=>{relayoutCanvas();hideDockSub();});
    ogrid.appendChild(re);
    dockSubEl.appendChild(ogrid);
    /* ── 分区三：选择线型（连线形态）—— 只改连线形态，不动节点位置 ──────
       一次作用于整张画布的全部连线（父子层级连接 + 自由关系线）。
       列数固定 4：正好一行，auto-fill 会排出 5 个轨道空一格。 */
    const st=document.createElement("div");st.className="ds-title";st.textContent="选择线型";
    dockSubEl.appendChild(st);
    const sgrid=document.createElement("div");sgrid.className="ds-grid cols-4";
    const curShape=currentCanvasLinkShape();
    for(const [key,label] of LINK_SHAPES){
      const it=document.createElement("div");
      it.className="ds-item"+(curShape===key?" on":"");
      it.title="整张画布："+label;
      it.innerHTML='<div class="ds-thumb" style="display:grid;place-items:center">'+(LINK_SHAPE_ICONS[key]||"")+'</div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>{applyCanvasLinkShape(key);renderDockSub();});
      sgrid.appendChild(it);
    }
    dockSubEl.appendChild(sgrid);
  }else if(dockSubKind==="style"){
    /* 样式独立分类：5 套风格一键切换（仅样式，不影响布局） */
    const t=document.createElement("div");t.className="ds-title";t.textContent="选择样式";
    dockSubEl.appendChild(t);
    const grid=document.createElement("div");grid.className="ds-grid";
    var dk=state.dark;
    var styleThumbs={
      clear:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;background:'+(dk?"#1a1a2e":"#fff")+'"><div style="flex:1;background:rgba(45,95,211,'+(dk?".25":".12")+');border:1px solid rgba(45,95,211,.3);border-radius:8px"></div><div style="flex:1;background:rgba(25,161,135,'+(dk?".2":".1")+');border:1px solid rgba(25,161,135,.25);border-radius:8px"></div></div>',
      glass:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;background:linear-gradient(135deg,'+(dk?"#1e2a4a,#2a1530":"#e3f2fd,#fce4ec")+')"><div style="flex:1;background:rgba(255,255,255,'+(dk?".1":".45")+');backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,'+(dk?".15":".5")+');border-radius:12px;box-shadow:0 2px 8px rgba(45,95,211,.08)"></div><div style="flex:1;background:rgba(255,255,255,'+(dk?".08":".35")+');border:1px solid rgba(255,255,255,'+(dk?".12":".4")+');border-radius:12px"></div></div>',
      minimal:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px"><div style="flex:1;background:transparent;border:1px solid '+(dk?"rgba(255,255,255,.18)":"rgba(0,0,0,.12)")+';border-radius:2px"></div><div style="flex:1;background:transparent;border:1px solid '+(dk?"rgba(255,255,255,.12)":"rgba(0,0,0,.08)")+';border-radius:2px"></div></div>',
      neumorph:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;background:'+(dk?"#2e2e34":"#eef0f4")+'"><div style="flex:1;background:'+(dk?"#2e2e34":"#eef0f4")+';box-shadow:'+(dk?"3px 3px 6px rgba(0,0,0,.4),-3px -3px 6px rgba(255,255,255,.04)":"3px 3px 6px rgba(0,0,0,.1),-3px -3px 6px rgba(255,255,255,.9)")+';border-radius:12px"></div><div style="flex:1;background:'+(dk?"#2e2e34":"#eef0f4")+';box-shadow:'+(dk?"inset 2px 2px 4px rgba(0,0,0,.3),inset -2px -2px 4px rgba(255,255,255,.03)":"inset 2px 2px 4px rgba(0,0,0,.08),inset -2px -2px 4px rgba(255,255,255,.8)")+';border-radius:10px"></div></div>',
      colorful:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;background:'+(dk?"#1a1a2e":"#f2f3f7")+'"><div style="flex:1;background:linear-gradient(135deg,#367bf0,#265AB1);box-shadow:'+(dk?"2px 2px 4px rgba(0,0,0,.3),-2px -2px 4px rgba(255,255,255,.04)":"2px 2px 4px rgba(0,0,0,.1),-2px -2px 4px rgba(255,255,255,.6)")+';border-radius:12px"></div><div style="flex:1;background:linear-gradient(135deg,#19A187,#0d6b54);box-shadow:'+(dk?"2px 2px 4px rgba(0,0,0,.3),-2px -2px 4px rgba(255,255,255,.04)":"2px 2px 4px rgba(0,0,0,.1),-2px -2px 4px rgba(255,255,255,.6)")+';border-radius:12px"></div></div>',
      bento:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;background:'+(dk?"#1a1a2e":"#f8f9fb")+'"><div style="flex:1.2;background:#ff6b6b;box-shadow:0 4px 12px rgba(0,0,0,'+(dk?".3":".08")+');border-radius:18px"></div><div style="flex:1;background:#4ecdc4;box-shadow:0 2px 8px rgba(0,0,0,'+(dk?".2":".04")+');border-radius:18px"></div></div>',
      editorial:'<div style="width:100%;height:100%;display:flex;flex-direction:column;gap:3px;padding:4px;background:'+(dk?"#1a1a2e":"#f8f9fb")+'"><div style="flex:1;background:#ffe66d;border:1px solid rgba(0,0,0,.1);border-radius:4px"></div><div style="flex:1;background:#a8e6cf;border:1px solid rgba(0,0,0,.06);border-radius:4px"></div></div>',
    };
    for(const [key,def] of Object.entries(STYLE_PRESETS)){
      var it=document.createElement("div");
      it.className="ds-item"+(state.stylePreset===key?" on":"");
      var thumb=styleThumbs[key]||styleThumbs.clear;
      it.innerHTML='<div class="ds-thumb">'+thumb+'</div><span class="ds-name">'+def.label+'</span>';
      it.addEventListener("click",function(){applyStyle(key);hideDockSub();});
      grid.appendChild(it);
    }
    dockSubEl.appendChild(grid);
    /* L9：节点配色 / 关系线路径 每组只有两项，各占一整行是白费面板高度。
       并成一行：左右各半幅，每组仍保留自己的小标题 + 两项。 */
    const pairRow=document.createElement("div");pairRow.className="ds-pair";
    const colorCol=document.createElement("div");
    const colorTitle=document.createElement("div");colorTitle.className="ds-title";colorTitle.textContent="节点配色";
    colorCol.appendChild(colorTitle);
    const colorGrid=document.createElement("div");colorGrid.className="ds-grid cols-2";
    [["single","统一单色"],["auto","自动轮换"]].forEach(([mode,label])=>{
      const it=document.createElement("div");
      it.className="ds-item"+(state.mindColorMode===mode?" on":"");
      const sw=mode==="single"?state.mindColor:"linear-gradient(90deg,"+MIND_COLORS.join(",")+")";
      it.innerHTML='<div class="ds-thumb" style="background:'+sw+';border:1px solid rgba(127,127,127,.2)"></div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>applyMindColorMode(mode));
      colorGrid.appendChild(it);
    });
    colorCol.appendChild(colorGrid);
    pairRow.appendChild(colorCol);
    /* B：关系线避障。默认开——只在真的撞上卡片时才改路，不撞的线一像素不动，
       所以开着没有代价；关掉是给"我就是要那条最短直线"的场合兜底。
       L9：与节点配色同排，占右半幅。 */
    const avoidCol=document.createElement("div");
    const avoidTitle=document.createElement("div");avoidTitle.className="ds-title";avoidTitle.textContent="关系线路径";
    avoidCol.appendChild(avoidTitle);
    const avoidGrid=document.createElement("div");avoidGrid.className="ds-grid cols-2";
    [["on","避障绕行","撞到卡片才绕，其余不动"],["off","直连","始终走最短线"]].forEach(([key,label,desc])=>{
      const it=document.createElement("div");
      it.className="ds-item"+((state.linkAvoid!==false)=== (key==="on")?" on":"");
      it.title=desc;
      it.innerHTML='<div class="ds-thumb" style="display:grid;place-items:center;font-size:14px">'+(key==="on"?"⌐":"╱")+'</div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>{
        state.linkAvoid=(key==="on");
        toast(key==="on"?"关系线已开启避障绕行":"关系线已改为直连");
        renderDockSub();render();saveState();
      });
      avoidGrid.appendChild(it);
    });
    avoidCol.appendChild(avoidGrid);
    pairRow.appendChild(avoidCol);
    dockSubEl.appendChild(pairRow);
  }else if(dockSubKind==="linkLevel"){
    /* E5: link level dock sub-menu */
    var sel=selectedItem();
    var isML=sel&&sel.type==="mindLink";
    var mlChild=isML?state.items.find(x=>x.id===sel.bId):null;
    var curLvl=sel?(isML?(mlChild&&mlChild._linkLevel||"normal"):(sel.level||"normal")):"normal";
    var t=document.createElement("div");t.className="ds-title";t.textContent="线等级";dockSubEl.appendChild(t);
    var g=document.createElement("div");g.className="ds-grid";
    var lvlOpts=[["normal","普通","默认细线"],["emphasis","强调","加粗+鲜艳"],["highlight","醒目","最粗+内高光"]];
    for(var i=0;i<lvlOpts.length;i++){
      var lk=lvlOpts[i];
      var it=document.createElement("div");
      it.className="ds-item"+(curLvl===lk[0]?" on":"");
      it.innerHTML='<div class="ds-thumb" style="background:'+(lk[0]==="highlight"?"#2d5fd3":lk[0]==="emphasis"?"#5b8aeb":"#ccc")+';height:'+(lk[0]==="highlight"?"6px":lk[0]==="emphasis"?"4px":"2px")+';border-radius:2px"></div><span class="ds-name">'+lk[1]+'</span>';
      it.addEventListener("click",(function(key){return function(){
        var s=selectedItem();if(!s)return;
        if(s.type==="mindLink"){var c=state.items.find(x=>x.id===s.bId);if(c)c._linkLevel=key;}
        else{var l=state.links.find(x=>x.id===s.id);if(l)l.level=key;}
        pushHistory("change link level");hideDockSub();render();saveState();renderDock(true);
      };})(lk[0]));
      g.appendChild(it);
    }
    dockSubEl.appendChild(g);
  }else if(dockSubKind==="linkShape"){
    /* E5: link shape dock sub-menu */
    var sel2=selectedItem();
    var isML2=sel2&&sel2.type==="mindLink";
    var mlChild2=isML2?state.items.find(x=>x.id===sel2.bId):null;
    var curShp=sel2?(isML2?(mlChild2&&mlChild2._linkShape||"auto"):(sel2.shape||"auto")):"auto";
    var t2=document.createElement("div");t2.className="ds-title";t2.textContent="线形状";dockSubEl.appendChild(t2);
    var g2=document.createElement("div");g2.className="ds-grid";
    var shpOpts=[["auto","跟随","自动"],["curve","曲线","S形"],["polyline","折线","圆角"],["straight","直线","两点"]];
    for(var i2=0;i2<shpOpts.length;i2++){
      var sk=shpOpts[i2];
      var it2=document.createElement("div");
      it2.className="ds-item"+(curShp===sk[0]?" on":"");
      it2.innerHTML='<div class="ds-thumb" style="display:grid;place-items:center;font-size:14px">'+(sk[0]==="auto"?"~":sk[0]==="curve"?"∿":sk[0]==="polyline"?"≉":"—")+'</div><span class="ds-name">'+sk[1]+'</span>';
      it2.addEventListener("click",(function(key){return function(){
        var s=selectedItem();if(!s)return;
        if(s.type==="mindLink"){var c=state.items.find(x=>x.id===s.bId);if(c)c._linkShape=key;}
        else{var l=state.links.find(x=>x.id===s.id);if(l)l.shape=key;}
        pushHistory("change link shape");hideDockSub();render();saveState();renderDock(true);
      };})(sk[0]));
      g2.appendChild(it2);
    }
    dockSubEl.appendChild(g2);
  }else{
    /* 背景：上排颜色，下排纹理 */
    const t1=document.createElement("div");t1.className="ds-title";t1.textContent="背景颜色";
    dockSubEl.appendChild(t1);
    const g1=document.createElement("div");g1.className="ds-grid";
    for(const [id,label] of BG_COLORS){
      const it=document.createElement("div");
      it.className="ds-item"+(state.bgColorName===id?" on":"");
      const col=getBgColor(id||"default", state.dark);
      const isDark=state.dark;
      it.innerHTML='<div class="ds-thumb" style="background:'+col+';border-color:rgba(127,127,127,.25)"></div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>applyBgColor(id));
      g1.appendChild(it);
    }
    dockSubEl.appendChild(g1);
    const t2=document.createElement("div");t2.className="ds-title";t2.textContent="背景纹理";
    dockSubEl.appendChild(t2);
    const g2=document.createElement("div");g2.className="ds-grid";
    for(const [id,label] of BG_PATTERNS){
      const it=document.createElement("div");
      it.className="ds-item"+(state.bgPattern===id?" on":"");
      const patSvg=id==="grid"?'<svg viewBox="0 0 40 24" width="100%" height="100%"><defs><pattern id="pg" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#9db8f0" stroke-width=".7"/></pattern></defs><rect width="40" height="24" fill="url(#pg)"/></svg>'
        :id==="dots"?'<svg viewBox="0 0 40 24" width="100%" height="100%"><defs><pattern id="pd" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#9db8f0"/></pattern></defs><rect width="40" height="24" fill="url(#pd)"/></svg>'
        :id==="paper"?'<svg viewBox="0 0 40 24" width="100%" height="100%"><rect width="40" height="24" fill="#f5f0e4"/><path d="M0 5h40M0 11h40M0 17h40" stroke="#d8cbb0" stroke-width=".6" fill="none"/></svg>'
        :'<svg viewBox="0 0 40 24" width="100%" height="100%"><rect width="40" height="24" fill="#fff"/>';
      it.innerHTML='<div class="ds-thumb" style="background:#fff;overflow:hidden">'+patSvg+'</div><span class="ds-name">'+label+'</span>';
      it.addEventListener("click",()=>applyBgPattern(id));
      g2.appendChild(it);
    }
    dockSubEl.appendChild(g2);
  }
  dockSubEl.classList.add("show");
}
/* 隐藏二级菜单（点击外部/切状态） */
function hideDockSub(){
  dockSubKind=null;
  if(dockSubEl)dockSubEl.classList.remove("show");
  renderDock(true);
}
document.addEventListener("pointerdown",e=>{
  if(!dockSubKind)return;
  if(dockBar&&dockBar.contains(e.target))return;
  hideDockSub();
});
/* ============================================================
   展开内容：Markdown 工具栏
============================================================ */
/* 统一 MD 编辑：当前活跃编辑器（便签浮动态 / 展开居中态共用同一套操作逻辑） */
/* I5-fix: mdTarget 的 detailTextarea 兜底随 render.js 的 E5 null 桩一并删除（原本就永不生效） */
let activeMdEditor=null;
function mdTarget(){return activeMdEditor;}
/* 在选区两端包裹标记（无选区则插入占位并选中） */
function mdWrap(before,after,placeholder,ta){
  ta=ta||mdTarget();
  const s=ta.selectionStart,e=ta.selectionEnd;
  const sel=ta.value.slice(s,e)||placeholder||"";
  const nv=ta.value.slice(0,s)+before+sel+after+ta.value.slice(e);
  ta.value=nv;
  ta.focus();
  if(sel)ta.setSelectionRange(s+before.length,s+before.length+sel.length);
  else ta.setSelectionRange(s+before.length,s+before.length+(placeholder?placeholder.length:0));
  ta.dispatchEvent(new Event("input"));
}
/* 在行首插入前缀（列表/标题/引用/待办） */
function mdLinePrefix(prefix,toggle,ta){
  ta=ta||mdTarget();
  const s=ta.selectionStart;
  const lineStart=ta.value.lastIndexOf("\n",s-1)+1;
  let lineEnd=ta.value.indexOf("\n",s);
  if(lineEnd<0)lineEnd=ta.value.length;
  const line=ta.value.slice(lineStart,lineEnd);
  let newLine;
  if(toggle&&line.startsWith(prefix))newLine=line.slice(prefix.length);
  else newLine=prefix+line;
  ta.value=ta.value.slice(0,lineStart)+newLine+ta.value.slice(lineEnd);
  ta.focus();
  ta.setSelectionRange(lineStart+newLine.length,lineStart+newLine.length);
  ta.dispatchEvent(new Event("input"));
}
/* 插入块级内容（表格/分隔线/链接） */
function mdInsert(text,ta){
  ta=ta||mdTarget();
  const s=ta.selectionStart;
  const needNl=s>0&&ta.value[s-1]!=="\n";
  const ins=(needNl?"\n":"")+text;
  ta.value=ta.value.slice(0,s)+ins+ta.value.slice(s);
  ta.focus();
  const pos=s+ins.length;
  ta.setSelectionRange(pos,pos);
  ta.dispatchEvent(new Event("input"));
}
const TABLE_TPL="| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |";
/* E5: dp-t/dp-sel/detailTextarea handlers all removed */
/* 批注：A键，选中元素后添加常驻小字 */
function openAnnotation(){
  const s=selectedItem();
  if(!s){toast("请先选中一个元素");return;}
  const label=s.type==="link"?"连接线":s.text||(s.type==="connector"?"连线":s.type==="stroke"?"画笔":"元素");
  showPrompt("添加批注","一句话批注…",s.annotation||"",text=>{
    if((s.annotation||"")!==(text||""))pushHistory("批注");
    if(s.type==="link"){const l=state.links.find(l=>l.id===s.id);if(l)l.annotation=text||"";}
    else s.annotation=text||"";
    render();saveState();
    if(text)toast("已添加批注");else toast("已清除批注");
  });
}
/* I5-fix: mdMask/mdModalMask 死查找已删——HTML 中从无该元素，取回 null 后从未使用 */
function markdownCanvasText(text){
  return String(text||"")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
    .replace(/(\*\*|__)(.*?)\1/g,"$2")
    .replace(/(~~)(.*?)\1/g,"$2")
    .replace(/(`)(.*?)\1/g,"$2")
    .replace(/(\*|_)(.*?)\1/g,"$2")
    .trim();
}
function renderMarkdownPlain(md){
  /* Canvas 阅读层是格式化预览，不展示 Markdown 源符号。 */
  if(!md)return[];
  const lines=md.split("\n");
  const out=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/^\|/.test(line)&&/\|/.test(line.slice(1))){
      if(/^\|?\s*:?-{3,}/.test(line.replace(/\|/g," ")))continue;
      const cells=line.split("|").slice(1,-1).map(markdownCanvasText).filter(Boolean);
      if(cells.length)out.push({t:cells.join("    ·    "),h:i+1<lines.length&&/^\|?\s*:?-{3,}/.test(lines[i+1].replace(/\|/g," "))?2:0,table:true});
    }else if(/^### (.+)$/.test(line)){out.push({t:markdownCanvasText(line.replace(/^### /,"")),h:3});}
    else if(/^## (.+)$/.test(line)){out.push({t:markdownCanvasText(line.replace(/^## /,"")),h:2});}
    else if(/^# (.+)$/.test(line)){out.push({t:markdownCanvasText(line.replace(/^# /,"")),h:1});}
    else if(/^- \[[ xX]\] (.+)$/.test(line)){out.push({t:(/- \[x\]/i.test(line)?"☑ ":"☐ ")+markdownCanvasText(line.replace(/^- \[[ xX]\] /,"")),h:0,indent:1});}
    else if(/^- (.+)$/.test(line)){out.push({t:"• "+markdownCanvasText(line.replace(/^- /,"")),h:0,indent:1});}
    else if(/^\d+\. (.+)$/.test(line)){out.push({t:markdownCanvasText(line),h:0,indent:1});}
    else if(/^> (.+)$/.test(line)){out.push({t:markdownCanvasText(line.replace(/^> /,"")),h:0,quote:true});}
    else if(line.trim()===""||/^```/.test(line)||/^---+$/.test(line.trim())){continue;}
    else{out.push({t:markdownCanvasText(line),h:0});}
  }
  return out.filter(x=>x.t);
}
/* 展开是临时的“形变布局”，不写入用户的原始排布或撤销记录。 */
function detailBaseHeight(it,b){
  const dl=detailLayoutMap.get(it.id);
  if(dl)return dl.baseH;
  return it.type==="mindNode"?Math.max(it.h||40,b.h):(it.h||b.h);
}
/* 展开内容字体：正文用宋体系（与标题 Sans 字族区分），
   字号略小于标题（标题约 14-15，正文 13），保证美观与层级 */
const DETAIL_SERIF='"Noto Serif SC","Source Han Serif SC","Songti SC",Georgia,serif';
function detailFont(ln){return(ln.h===1?"700 14px ":(ln.h===2?"600 13px ":(ln.h===3?"600 12px ":"13px ")))+DETAIL_SERIF;}
function detailPreferredWidth(it){
  const base=itemBounds(it);let widest=0;
  ctx.save();
  for(const ln of renderMarkdownPlain(it.detail||"")){ctx.font=detailFont(ln);widest=Math.max(widest,ctx.measureText(ln.t).width+(ln.indent?12:0));}
  ctx.restore();
  const lines=String(it.detail||"").split("\n"),tableLine=lines.find(line=>/^\s*\|.*\|\s*$/.test(line));
  const tableCols=tableLine?Math.max(1,tableLine.split("|").length-2):0;
  /* 内容很多时允许同时向右和向下生长；表格按列预留空间，但保留合理上限。 */
  const contentWish=Math.max(widest+40,tableCols?tableCols*104+28:0);
  const maxW=Math.min(560,Math.max((it._detailBase?.w||base.w)+190,380));
  return clamp(Math.max(base.w,Math.min(contentWish,maxW)),Math.min(base.w,220),maxW);
}
function detailRows(it,width){
  const rows=[],available=Math.max(80,width-28);
  ctx.save();
  for(const ln of renderMarkdownPlain(it.detail||"")){
    ctx.font=detailFont(ln);
    const maxW=Math.max(48,available-(ln.indent?12:0));
    for(const text of wrapLines(ctx,ln.t,maxW))rows.push({...ln,t:text});
  }
  ctx.restore();
  return rows.length?rows:[{t:"",h:0}];
}
function detailContentHeight(it,width){
  /* 这是初始估值；展开后还会按 DOM 实际高度二次校正，避免表格被裁。 */
  const tableRows=String(it.detail||"").split("\n").filter(line=>/^\|/.test(line)&&!/^\|?\s*:?-{3,}/.test(line.replace(/\|/g," "))).length;
  return Math.max(108,56+detailRows(it,width).length*26+(tableRows?34+tableRows*28:0));
}
function repairStaleDetailGeometry(){
  /* 早期版本曾把展开态几何写入节点。非当前展开节点一律回落到正常卡片上限。 */
  if(!state.items)return;
  let repaired=false;
  for(const it of state.items){
    if(it.type!=="mindNode"||!it.detail)continue;
    /* _detailBase 也属于存档数据：旧存档可能已把异常的展开宽高记录在这里。 */
    if(it._detailBase){
      const safeBase={w:clamp(Number(it._detailBase.w)||it.w||130,110,260),h:clamp(Number(it._detailBase.h)||it.h||40,36,72)};
      if(safeBase.w!==it._detailBase.w||safeBase.h!==it._detailBase.h){it._detailBase=safeBase;repaired=true;}
    }
    if(detailLayoutMap.has(it.id))continue;
    const maxW=260,maxH=72;
    if(it.w>maxW||it.h>maxH){it.w=Math.min(it.w,maxW);it.h=Math.min(it.h,maxH);repaired=true;}
  }
  if(repaired)saveState();
}
function movableDetailItems(){return state.items.filter(it=>it.type==="note"||it.type==="mindNode"||it.type==="fileCard");}
function captureDetailGeometry(){
  const snapshot=new Map();
  for(const it of movableDetailItems())snapshot.set(it.id,{x:it.x,y:it.y,w:it.w,h:it.h});
  return snapshot;
}
function copyDetailGeometry(source){return new Map([...source].map(([id,box])=>[id,{...box}]));}
function applyDetailGeometry(geometry){
  for(const [id,box] of geometry){
    const it=state.items.find(x=>x.id===id);if(!it)continue;
    it.x=box.x;it.y=box.y;it.w=box.w;it.h=box.h;
  }
}
function detailRectsOverlap(a,b,gap){
  return a.x<b.x+b.w+gap&&a.x+a.w>b.x-gap&&a.y<b.y+b.h+gap&&a.y+a.h>b.y-gap;
}
function makeExpandedGeometry(it,backup,baseH,contentH,width){
  const target=copyDetailGeometry(backup);
  const owner=target.get(it.id);if(!owner)return target;
  owner.w=width;owner.h=baseH+contentH;
  applyDetailGeometry(target);
  const gap=18;
  const occupied=[itemBounds(it)];
  const candidates=movableDetailItems().filter(x=>x.id!==it.id).sort((a,b)=>{
    const ab=itemBounds(a),bb=itemBounds(b);return ab.y-bb.y||ab.x-bb.x;
  });
  for(const candidate of candidates){
    let box=itemBounds(candidate),shift=0;
    for(const used of occupied){
      if(detailRectsOverlap(box,used,gap))shift=Math.max(shift,used.y+used.h+gap-box.y);
    }
    if(shift>0){candidate.y+=shift;box={...box,y:box.y+shift};}
    occupied.push(box);
  }
  return captureDetailGeometry();
}
function animateDetailGeometry(from,to,onDone,ownerId){
  /* ownerId: 展开主体节点 id，用于 per-item rAF 句柄，避免不同节点的动画互相取消 */
  const key=ownerId?String(ownerId):(to.size?String([...to.keys()][0]):"__detail");
  const prev=detailAnimFrames.get(key);
  if(prev)cancelAnimationFrame(prev);
  const start=performance.now(),duration=230;
  function step(now){
    const p=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-p,4);
    const current=new Map();
    for(const [id,end] of to){
      const begin=from.get(id)||end;
      current.set(id,{x:begin.x+(end.x-begin.x)*ease,y:begin.y+(end.y-begin.y)*ease,w:begin.w+(end.w-begin.w)*ease,h:begin.h+(end.h-begin.h)*ease});
    }
    applyDetailGeometry(current);render();
    if(p<1)detailAnimFrames.set(key,requestAnimationFrame(step));
    else{detailAnimFrames.delete(key);onDone&&onDone();}
  }
  detailAnimFrames.set(key,requestAnimationFrame(step));
}
/* G6: 多实例展开 — E 键独立切换，不再自动收起前一个节点 */
function expandDetailInPlace(it,allowEmpty=false){
  if(!it||(!it.detail&&!allowEmpty))return;
  if(expandedDetailIds.has(it.id))return;
  /* 首次展开记住原卡片；同时修复旧版残留的超大展开尺寸。 */
  const savedBase=it._detailBase||{w:it.w||130,h:it.h||40};
  it._detailBase={w:clamp(Number(savedBase.w)||130,110,260),h:clamp(Number(savedBase.h)||40,36,72)};
  it.w=it._detailBase.w;it.h=it._detailBase.h;
  const backup=captureDetailGeometry();
  const baseH=Math.max(it.h||0,itemBounds(it).h),width=detailPreferredWidth(it),contentH=detailContentHeight(it,width);
  const layout={id:it.id,backup,baseH,width,contentH,closing:false};
  detailLayoutMap.set(it.id,layout);
  expandedDetailIds.add(it.id);
  const target=makeExpandedGeometry(it,backup,baseH,contentH,width);
  applyDetailGeometry(backup);
  animateDetailGeometry(backup,target,undefined,it.id);
}
function collapseDetailInPlace(it){
  /* G6: 接受可选参数 it；不传则收起所有（用于清理） */
  if(!it){
    for(const id of [...expandedDetailIds]){
      const item=state.items.find(x=>x.id===id);
      if(item)collapseDetailInPlace(item);
    }
    return;
  }
  const layout=detailLayoutMap.get(it.id);
  if(!layout){expandedDetailIds.delete(it.id);render();return;}
  const current=captureDetailGeometry();
  layout.closing=true;
  animateDetailGeometry(current,layout.backup,()=>{
    if(detailLayoutMap.get(it.id)!==layout)return;
    applyDetailGeometry(layout.backup);detailLayoutMap.delete(it.id);expandedDetailIds.delete(it.id);render();
  },it.id);
}
function toggleDetailInPlace(it){
  if(expandedDetailIds.has(it.id))collapseDetailInPlace(it);
  else expandDetailInPlace(it,true);
}
function syncDetailReadDom(){
  if(!detailReadLayer)return;
  /* G6: 多实例 — 为每个展开节点各渲染一个 .detail-read */
  const expanded=[];
  for(const id of expandedDetailIds){
    const it=state.items.find(x=>x.id===id);
    if(!it){expandedDetailIds.delete(id);continue;}
    /* 修复：在 expandedDetailIds 中但 detailLayoutMap 无记录（教程预设/AI 直接 add）。
       初始化展开几何，使节点以正确的展开尺寸出现，而非原始卡片尺寸。
       跳过正在动画的节点 */
    if(!detailLayoutMap.has(id)&&!detailAnimFrames.has(String(id))){
      const savedBase=it._detailBase||{w:it.w||130,h:it.h||40};
      it._detailBase={w:clamp(Number(savedBase.w)||130,110,260),h:clamp(Number(savedBase.h)||40,36,72)};
      it.w=it._detailBase.w;it.h=it._detailBase.h;
      const dbackup=captureDetailGeometry();
      const dbaseH=Math.max(it.h||0,itemBounds(it).h);
      const dwidth=detailPreferredWidth(it);
      const dcontentH=detailContentHeight(it,dwidth);
      detailLayoutMap.set(it.id,{id:it.id,backup:dbackup,baseH:dbaseH,width:dwidth,contentH:dcontentH,closing:false});
      /* makeExpandedGeometry 内部 applyDetailGeometry + 推挤相邻元素 */
      makeExpandedGeometry(it,dbackup,dbaseH,dcontentH,dwidth);
    }
    const b=itemBounds(it);if(!b)continue;
    const baseH=detailBaseHeight(it,b),bodyH=b.h-baseH;
    if(bodyH<4)continue;
    expanded.push({it,b,baseH,bodyH});
  }
  if(!expanded.length){detailReadLayer.style.display="none";detailReadLayer.innerHTML="";return;}
  detailReadLayer.style.display="block";
  /* 清理已收起节点的残留 DOM */
  const validIds=new Set(expanded.map(e=>String(e.it.id)));
  for(const el of [...detailReadLayer.querySelectorAll(".detail-read")]){
    if(!validIds.has(el.dataset.itemId))el.remove();
  }
  for(const {it,b,baseH,bodyH} of expanded){
    let el=detailReadLayer.querySelector('.detail-read[data-item-id="'+it.id+'"]');
    if(!el){
      el=document.createElement("div");el.className="detail-read";
      el.dataset.itemId=String(it.id);
      detailReadLayer.appendChild(el);
    }
    if(!it.detail){
      el.dataset.source="";
      el.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:13px;font-family:var(--font)">双击编辑</div>';
    }else{
      if(el.dataset.source!==it.detail){
        el.dataset.source=it.detail;
        renderMdDom(it.detail,el);
      }
    }
    /* I5-fix: 读层应用条目排版（与便签同一组字段，格式栏改动从此在阅读层可见） */
    const _ts=noteTypography(it);
    el.style.fontFamily=(FONT_PRESETS[_ts.fontFamily]||FONT_PRESETS[state.fontPreset]).stack;
    el.style.fontSize=(_ts.fontSize||13)+"px";
    el.style.fontWeight=_ts.bold?"700":"500";
    el.style.textDecoration=_ts.underline?"underline":"none";
    const z=state.camera.zoom;
    el.style.left=((b.x-state.camera.x)*z)+"px";
    el.style.top=((b.y+baseH-state.camera.y)*z)+"px";
    el.style.width=b.w+"px";
    el.style.height=bodyH+"px";
    el.style.transform="scale("+z+")";
    /* 测量与自适应高度（per-item） */
    const layout=detailLayoutMap.get(it.id);
    const measureKey=it.id+":"+it.detail+":"+Math.round(b.w);
    if(layout&&!layout.closing&&layout.measureKey!==measureKey&&it.detail){
      layout.measureKey=measureKey;
      requestAnimationFrame(()=>{
        const dl=detailLayoutMap.get(it.id);
        if(!dl||dl.closing||!expandedDetailIds.has(it.id))return;
        const body=el.querySelector(".md-body")||el;
        const tableWide=Math.max(0,...[...el.querySelectorAll("table")].map(t=>Math.ceil(t.scrollWidth||0)+36));
        const neededW=Math.min(560,Math.max(dl.width||b.w,Math.ceil(body.scrollWidth||0)+4,tableWide));
        const needed=Math.ceil(body.scrollHeight||0)+2;
        if(needed<=bodyH+2&&neededW<=b.w+2)return;
        dl.width=Math.max(dl.width||0,neededW);
        dl.contentH=Math.max(dl.contentH||0,needed);
        const from=captureDetailGeometry();
        const to=makeExpandedGeometry(it,dl.backup,dl.baseH,dl.contentH,dl.width);
        animateDetailGeometry(from,to,undefined,it.id);
        if(state.focusMode&&state.focusMode.id===it.id){
          animateCamera(
            b.x+dl.width/2-W/2/state.camera.zoom,
            b.y+(dl.baseH+dl.contentH)/2-H/2/state.camera.zoom,
            state.camera.zoom
          );
        }
      });
    }
  }
}
/* 绘制展开内容：作为元素下半部分的延展阅读区，而不是外挂卡片。 */
function drawDetail(it,b){
  if(!expandedDetailIds.has(it.id))return;
  const z=state.camera.zoom;
  const baseH=detailBaseHeight(it,b),bodyH=b.h-baseH;
  if(bodyH<4)return;
  const dx=b.x,dy=b.y+baseH,dw=b.w,dh=bodyH;
  ctx.save();
  const reveal=clamp(bodyH/(20/z),0,1);
  ctx.globalAlpha=reveal;
  /* 详情必须是稳定的阅读面，而非在节点色上叠一层半透明文字。 */
  ctx.fillStyle=dc("#fffdf9","#20242f");ctx.fillRect(dx,dy,dw,dh);
  ctx.strokeStyle=dc("rgba(23,38,74,.14)","rgba(255,255,255,.13)");ctx.lineWidth=1/z;
  ctx.beginPath();ctx.moveTo(dx+8/z,dy+.5/z);ctx.lineTo(dx+dw-8/z,dy+.5/z);ctx.stroke();
  ctx.restore();
}
/* 检测点击是否命中展开把手或展开层 */
function hitDetail(it,b,wx,wy){
  /* G4 fix: 如果节点已展开，即使 detail 为空也要检测 body 区域 */
  if(!it.detail&&!expandedDetailIds.has(it.id))return false;
  const z=state.camera.zoom;
  const box=detailToggleBounds(it,b);
  const pad=4/z;
  if(wx>=box.x-pad&&wx<=box.x+box.w+pad&&wy>=box.y-pad&&wy<=box.y+box.h+pad) return "toggle";
  /* 展开状态：展开层内容区 */
  if(expandedDetailIds.has(it.id)){
    const baseH=detailBaseHeight(it,b);
    if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y+baseH&&wy<=b.y+b.h) return "body";
  }
  return false;
}
function hitMindCollapse(it,b,wx,wy){
  const box=mindCollapseBounds(it,b);if(!box)return false;
  const pad=3/state.camera.zoom;
  return wx>=box.x-pad&&wx<=box.x+box.w+pad&&wy>=box.y-pad&&wy<=box.y+box.h+pad;
}
/* 控件要先于连接点命中：否则点击把手会被当作拖拽父子连线。 */
function hitNodeControl(wx,wy){
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i];
    if(["note","mindNode","fileCard","connector","stroke"].indexOf(it.type)<0)continue;
    if(it.type==="mindNode"&&!isMindNodeVisible(it))continue;
    const b=itemBounds(it);if(!b)continue;
    if(it.jumpTo){
      const jb=jumpBounds(it,b);
      if(wx>=jb.x&&wx<=jb.x+jb.w&&wy>=jb.y&&wy<=jb.y+jb.h)return{item:it,kind:"jump"};
    }
    const detailHit=hitDetail(it,b,wx,wy);
    if(detailHit)return{item:it,kind:"detail",hit:detailHit};
    if(hitMindCollapse(it,b,wx,wy))return{item:it,kind:"collapse"};
  }
  return null;
}/* E5: detail keydown listener removed *//* 连接待选态：点击"连接"按钮时若仅选中 1 个元素，
   进入"等待选择另一个元素"状态；再点另一元素立即完成连接 */
let linkPendingId=null;
function toggleLink(){
  const s=selectedItem();
  /* 场景 A：已处于待选态 → 再点按钮 = 退出待选 */
  if(linkPendingId!==null){
    linkPendingId=null;
    render();saveState();
    toast("已取消连接");
    return;
  }
  /* 场景 B：多点已选 → 批量连接/断开（原逻辑） */
  const selectedContentIds=state.multiSel.filter(id=>state.items.some(it=>it.id===id));
  if(selectedContentIds.length>=2){
    pushHistory("连接/断开");
    const parentId=selectedContentIds[0];
    let connected=0,disconnected=0;
    for(let i=1;i<selectedContentIds.length;i++){
      const childId=selectedContentIds[i];
      const exist=state.links.find(l=>(l.aId===parentId&&l.bId===childId)||(l.aId===childId&&l.bId===parentId));
      if(exist){
        state.links=state.links.filter(l=>l!==exist);
        disconnected++;
      }else{
        state.links.push({id:"lnk"+(uid++),aId:parentId,bId:childId,annotation:"",relationType:"related",directional:false});
        connected++;
      }
    }
    render();saveState();
    if(connected>0)toast("已连接 "+connected+" 个元素");
    else if(disconnected>0)toast("已断开 "+disconnected+" 个连接");
    return;
  }
  /* 场景 C：仅选中 1 个 → 进入待选（要求再点另一元素） */
  if(s){
    linkPendingId=s.id;
    state.selected=s.id;
    render();saveState();
    toast("请选择另一个元素进行连接");
  }else{
    toast("请先选中一个元素，再点击连接");
  }
}
/* 元素点击时若处于连接待选态 → 与待选元素立即连线（避免无效提示） */
function tryFinishPending(targetId){
  if(linkPendingId===null||targetId===null)return false;
  if(linkPendingId===targetId){linkPendingId=null;render();return true;}
  const aId=linkPendingId,bId=targetId;
  linkPendingId=null;
  pushHistory("连接");
  const exist=state.links.find(l=>(l.aId===aId&&l.bId===bId)||(l.aId===bId&&l.bId===aId));
  if(!exist)state.links.push({id:"lnk"+(uid++),aId,bId,annotation:"",relationType:"related",directional:false});
  else state.links=state.links.filter(l=>l!==exist);
  state.multiSel=[aId,bId];
  render();saveState();
  toast(exist?"已断开连接":"已连接");
  return true;
}
function setLinkRelation(linkId){
  const link=state.links.find(l=>l.id===linkId);
  if(!link)return;
  showOptions("设置关系语义",Object.entries(RELATION_TYPES).map(([type,meta])=>({
    id:type,label:meta.label,desc:meta.directional?"带方向的关系":"双向关系",
    onClick:()=>{pushHistory("设置关系语义");link.relationType=type;link.directional=meta.directional;render();saveState();toast("关系已设为「"+meta.label+"」");}
  })));
}
/* 获取元素之间的所有连接线 */
function linksOf(it){
  if(!it)return[];
  return state.links.filter(l=>l.aId===it.id||l.bId===it.id);
}
/* 避障用的障碍集合：所有"占位的卡片"。画笔笔画、连接器不是卡片，不参与避障；
   收起的子节点等同于不存在，也不该把线顶开。整帧只建一次，逐条线复用。 */
function collectLinkObstacles(){
  const out=[];
  for(const it of state.items){
    if(it.type==="stroke"||it.type==="connector"||it.type==="link")continue;
    if(it.type==="mindNode"&&!isMindNodeVisible(it))continue;
    const b=itemBounds(it);
    if(!b||!(b.w>0&&b.h>0))continue;
    out.push({id:it.id,x:b.x,y:b.y,w:b.w,h:b.h});
  }
  return out;
}
/* 避障路线缓存：绕行要跑 A*，每帧每条线都算扛不住。
   键 = 两端锚点坐标 + 出入口侧 + 沿线邻域内的卡片指纹。
   指纹只覆盖这条线自己包围盒外扩一圈里的卡片 —— 画布别处的节点怎么动
   都不影响它，所以拖一个节点时只有"被拖的这张"以及"就在它旁边的那些"
   会重算，其余全是纯命中。已算出绕行时把 hadAvoid 传下去做迟滞，
   免得拖拽收尾阶段在"绕行"和"直连"之间来回跳。
   实测（probe-avoid.js，00·总框架 22 条线）：静帧 0 次 A*，
   拖 1 个节点 4.93 次/帧 ≈ 该节点的度数。 */
/* 邻域指纹：把"这条线附近有哪些卡片、各自在哪"压成一个整数。
   端点没动、但附近有卡片挪了位置时，指纹会变 → 缓存失效 → 重算。
   这正是"把一张卡片拖到一条线上，线会自己绕开"能生效的原因。
   只扫这条线自己的包围盒（外扩到最宽走廊），画布别处的卡片不参与，
   所以拖一个节点时，绝大多数不相关的线依然是纯命中、零开销。
   用 FNV-1a：几行整数运算、无分配，比建走廊便宜两个量级。 */
function neighborhoodFingerprint(rects,x0,y0,x1,y1,pad){
  let h=2166136261>>>0;
  for(let i=0;i<rects.length;i++){
    const r=rects[i];
    if(r.x>x1+pad||r.x+r.w<x0-pad||r.y>y1+pad||r.y+r.h<y0-pad)continue;
    h=Math.imul(h^(Math.round(r.x)|0),16777619)>>>0;
    h=Math.imul(h^(Math.round(r.y)|0),16777619)>>>0;
    h=Math.imul(h^(Math.round(r.w)|0),16777619)>>>0;
    h=Math.imul(h^(Math.round(r.h)|0),16777619)>>>0;
  }
  return h;
}
const _avoidCache=new Map();
function avoidCurveFor(l,curve,obstacles){
  if(state.linkAvoid===false)return null;
  const ob=obstacles||collectLinkObstacles();
  /* bk = 缓存键。两截组成：
       ① 两端锚点坐标 + 出入口侧 —— 线自己动了没动
       ② 沿线包围盒内的卡片指纹 —— 线周围的东西动了没动
     ② 不能省。少了它，把一张卡片拖到一条原本不撞的线上时，那条线的
     端点一个像素没变，缓存照样命中，线就会直挺挺穿过新来的卡片。
     （注：这里比较的必须是裸键 bk；曾经错拿"bk+走廊指纹"的合成串去比，
       于是 100% 失效、每帧全量重跑 —— 是 probe-avoid 的确定性计数
       把这个坑挖出来的，毫秒基准下被噪声完全盖住。） */
  const bx0=Math.min(curve.ea.x,curve.eb.x),bx1=Math.max(curve.ea.x,curve.eb.x);
  const by0=Math.min(curve.ea.y,curve.eb.y),by1=Math.max(curve.ea.y,curve.eb.y);
  const bk=Math.round(curve.ea.x)+","+Math.round(curve.ea.y)+","+Math.round(curve.eb.x)+","+Math.round(curve.eb.y)
    +","+curve.outSide+curve.inpSide
    +","+neighborhoodFingerprint(ob,bx0,by0,bx1,by1,AVOID.searchWide+AVOID.pad);
  const prev=_avoidCache.get(l.id);
  const hadAvoid=!!(prev&&prev.pts);
  if(prev&&prev.bk===bk)return prev.pts;
  const r=computeAvoid(curve.ea,curve.outSide,curve.eb,curve.inpSide,ob,[l.aId,l.bId],hadAvoid);
  if(_avoidCache.size>600)_avoidCache.clear();
  _avoidCache.set(l.id,{bk:bk,k:bk+","+r.key,pts:r.pts});
  return r.pts;
}
/* 绘制自由连接线 */
function linkCurve(l,obstacles){
  const a=idMap.get(l.aId)||state.items.find(i=>i.id===l.aId),b=idMap.get(l.bId)||state.items.find(i=>i.id===l.bId);
  if(!a||!b)return null;
  const ab=itemBounds(a),bb=itemBounds(b);
  if(!ab||!bb)return null;
  /* 自由连接规范：按真实相对方位推导出口/入口侧（与布局主轴无关），
     解决"A 拖到 B 左侧却从 A 左连 B 右"的视觉怪异 */
  const s1=relAnchors(ab,bb);
  const s2=relAnchors(bb,ab);
  const ea=anchorOn(ab,s1.out),eb=anchorOn(bb,s2.out);
  const outSide=s1.out,inpSide=s2.out;
  /* 平滑过渡：拖动时端点/朝向用指数平滑，避免生硬跳变 */
  const sm=smoothLinkEndpoints(l,ea,eb,outSide,inpSide);
  const horizontal=(sm.outSide==="l"||sm.outSide==="r")&&(sm.inpSide==="l"||sm.inpSide==="r");
  const curve={ea:sm.ea,eb:sm.eb,mx:(sm.ea.x+sm.eb.x)/2,my:(sm.ea.y+sm.eb.y)/2,horizontal,outSide:sm.outSide,inpSide:sm.inpSide,pts:null};
  /* B 方案：避障路由。用户显式选过线形状的线不插手（那是明确意图），
     "跟随/auto"（默认）才交给避障。 */
  if(l.shape===undefined||l.shape==="auto"){
    curve.pts=avoidCurveFor(l,curve,obstacles);
  }
  return curve;
}
/* 沿关系线的路径取点：有绕行走折线，没有就走原来的贝塞尔/折线 */
function curvePointAt(curve,t,ctxPathOnly){
  if(curve.pts)return polyMidAt(curve.pts,t);
  const horiz=(curve.outSide==="l"||curve.outSide==="r");
  if(horiz){
    const P1={x:curve.mx,y:curve.ea.y},P2={x:curve.mx,y:curve.eb.y};
    return bezierAt(curve.ea,P1,P2,curve.eb,t);
  }
  if((curve.outSide==="t"||curve.outSide==="b")&&(curve.inpSide==="t"||curve.inpSide==="b")){
    const P1={x:curve.ea.x,y:curve.my},P2={x:curve.eb.x,y:curve.my};
    return bezierAt(curve.ea,P1,P2,curve.eb,t);
  }
  return{x:curve.ea.x+(curve.eb.x-curve.ea.x)*t,y:curve.ea.y+(curve.eb.y-curve.ea.y)*t};
}
/* 三次贝塞尔取点 */
function bezierAt(p0,p1,p2,p3,t){
  const mt=1-t;
  return{
    x:mt*mt*mt*p0.x+3*mt*mt*t*p1.x+3*mt*t*t*p2.x+t*t*t*p3.x,
    y:mt*mt*mt*p0.y+3*mt*mt*t*p1.y+3*mt*t*t*p2.y+t*t*t*p3.y,
  };
}
/* 稳定伪随机（同一连线每帧抖动一致，避免闪烁） */
function jitterAt(seed,i){
  const v=Math.sin((seed+i*1.7)*12.9898)*43758.5453;
  return (v-Math.floor(v))-0.5;   /* -0.5 ~ 0.5 */
}
function strokeLinkCurve(c,curve){
  /* B: 有绕行折线时走折线（拟物笔触沿折线采样，保持同一支笔的手感） */
  if(curve.pts){
    if(styleCfg().linkStyle==="pen")strokePolylinePen(c,curve.pts);
    else strokeRoundedPolyline(c,curve.pts,AVOID.radius);
    return;
  }
  /* 水平连线走横向 S 曲线，垂直连线走纵向 S 曲线，避免歪斜 */
  const P0=curve.ea,P3=curve.eb;
  const P1=curve.horizontal?{x:curve.mx,y:curve.ea.y}:{x:curve.ea.x,y:curve.my};
  const P2=curve.horizontal?{x:curve.mx,y:curve.eb.y}:{x:curve.eb.x,y:curve.my};
  /* 拟物纸感：钢笔/铅笔质感 —— 曲线采样成多段微抖动笔触 */
  if(styleCfg().linkStyle==="pen"){
    const SEG=16, seed=(curve.ea.x*0.37+curve.eb.y*0.11);
    const amp=Math.min(1.6,Math.hypot(P3.x-P0.x,P3.y-P0.y)*0.012);
    c.beginPath();
    for(let i=0;i<=SEG;i++){
      const t=i/SEG;
      const p=bezierAt(P0,P1,P2,P3,t);
      /* 端点不抖动，中间笔触自然 */
      const edge=t<0.12||t>0.88?0:1;
      const jx=jitterAt(seed,i)*amp*edge;
      const jy=jitterAt(seed+9.1,i)*amp*edge;
      if(i===0)c.moveTo(p.x+jx,p.y+jy);
      else c.lineTo(p.x+jx,p.y+jy);
    }
    return;
  }
  c.beginPath();c.moveTo(P0.x,P0.y);
  c.bezierCurveTo(P1.x,P1.y,P2.x,P2.y,P3.x,P3.y);
}
/* 拟物笔触沿绕行折线采样：与 strokeLinkCurve 的钢笔分支同一套抖动参数，
   只是把这套手感从贝塞尔搬到折线上，换路径不换笔。 */
function strokePolylinePen(c,pts){
  const seed=pts[0].x*0.37+pts[0].y*0.11;
  const amp=1.1;
  c.beginPath();
  let n=0;
  for(let s=0;s<pts.length-1;s++){
    const a=pts[s],b=pts[s+1];
    const len=Math.hypot(b.x-a.x,b.y-a.y);
    const steps=Math.max(2,Math.round(len/24));
    for(let i=(s===0?0:1);i<=steps;i++){
      const t=i/steps,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      const edge=(s===0&&t<0.12)||(s===pts.length-2&&t>0.88)?0:1;
      const jx=jitterAt(seed,n)*amp*edge,jy=jitterAt(seed+9.1,n)*amp*edge;
      if(n===0)c.moveTo(p.x+jx,p.y+jy);else c.lineTo(p.x+jx,p.y+jy);
      n++;
    }
  }
}
function drawLinks(scope){
  const z=state.camera.zoom;
  /* B: 障碍集合整帧建一次，逐条线复用（逐条重建会在密画布上把帧率吃光） */
  const obstacles=(state.linkAvoid===false)?null:collectLinkObstacles();
  for(const l of state.links){
    if(scope&&(!scope.has(l.aId)||!scope.has(l.bId)))continue;
    const a=idMap.get(l.aId),b=idMap.get(l.bId);
    if((a&&a.type==="mindNode"&&!isMindNodeVisible(a))||(b&&b.type==="mindNode"&&!isMindNodeVisible(b)))continue;
    /* B: 视口外先剔掉，再谈避障。避障要跑 A*，给屏幕外看不见的线白算是纯浪费；
       用两端点的包围盒（外扩 260，容得下绕行甩出去的部分）当便宜的预筛。
       idMap 没索引到就不预筛，交给 linkCurve 自己去找。 */
    const ab0=a&&itemBounds(a),bb0=b&&itemBounds(b);
    if(ab0&&bb0){
      const pad=260;
      const x0=Math.min(ab0.x,bb0.x)-pad,y0=Math.min(ab0.y,bb0.y)-pad;
      if(!inViewport({x:x0,y:y0,
        w:Math.max(ab0.x+ab0.w,bb0.x+bb0.w)-x0+pad,
        h:Math.max(ab0.y+ab0.h,bb0.y+bb0.h)-y0+pad}))continue;
    }
    const curve=linkCurve(l,obstacles);if(!curve)continue;
    /* 控制点位于端点盒内，保守裁剪仍会保留穿过视口的关系线。 */
    const curveBounds={x:Math.min(curve.ea.x,curve.eb.x),y:Math.min(curve.ea.y,curve.eb.y),w:Math.abs(curve.ea.x-curve.eb.x),h:Math.abs(curve.ea.y-curve.eb.y)};
    if(!inViewport(curveBounds))continue;
    const {ea,eb,mx}=curve;
    ctx.save();
    const rel=RELATION_TYPES[l.relationType]||RELATION_TYPES.related;
    const linkColor=rel.color;
    const active=state.selected===l.id||state.selected===l.aId||state.selected===l.bId;
    ctx.strokeStyle=linkColor;
    const LK=styleCfg();
    /* E5: line level — width is the primary distinguisher, NOT glow/halo */
    var lvl=l.level||"normal";
    var lvlW=lvl==="highlight"?4.5:lvl==="emphasis"?2.8:1.9;
    var lvlA=lvl==="highlight"?.75:lvl==="emphasis"?.5:(LK.glass?.28:.22);
    /* E5: higher levels use more vivid color */
    var lvlColor=linkColor;
    if(lvl==="highlight"){lvlColor=shadeColor(linkColor,1.6);}
    else if(lvl==="emphasis"){lvlColor=shadeColor(linkColor,1.15);}
    ctx.strokeStyle=lvlColor;
    ctx.globalAlpha=active?.94:lvlA;
    var baseW=lvlW*(LK.linkWidth||1);
    ctx.lineWidth=(active?baseW+0.7:baseW)/z;ctx.lineCap="round";
    /* selection shadow only — levels don't add glow, just width */
    if(active){ctx.shadowColor=linkColor;ctx.shadowBlur=11/z;}
    const dash=rel.dash||[];
    ctx.setLineDash(dash.map(d=>d/z));
    if(LK.linkStyle==="pen") strokeLinkCurve(ctx,curve);
    else pathConnection(ctx,curve,linkColor,baseW/z,l.shape);
    ctx.stroke();ctx.setLineDash([]);
    /* E5: highlight level — inner light line (thin lighter stroke on top of thick line) */
    if(lvl==="highlight"&&!active){
      ctx.globalAlpha=.3;ctx.strokeStyle=dc("#ffffff",linkColor);ctx.lineWidth=0.8/z;ctx.stroke();
    }
    /* white highlight — selection only */
    if(active){ctx.globalAlpha=.2;ctx.strokeStyle=dc("#ffffff","#ffffff");ctx.lineWidth=0.7/z;ctx.stroke();}
    /* 端点只在选中时显露辅助点，常态不再叠加两枚醒目圆环。 */
    if(active){
      ctx.globalAlpha=.82;ctx.fillStyle=linkColor;
      for(const ep of [ea,eb]){ctx.beginPath();ctx.arc(ep.x,ep.y,3.2/z,0,7);ctx.fill();}
    }
    /* 有向关系：箭头沿入边法线插入（语义清晰，准确表达依赖方向） */
    if(l.directional||rel.directional){
      ctx.fillStyle=linkColor;ctx.globalAlpha=.92;
      if(active){ctx.shadowColor=linkColor;ctx.shadowBlur=5/z;}
      drawAnchorArrow(ctx,eb,curve.inpSide,linkColor,9/z);
      ctx.shadowColor="transparent";
    }
    ctx.restore();
    /* 关系标签和普通批注共享同一张说明卡；关系类型是内容的一部分，
       不再让“线的批注”成为另一套视觉语言。 */
    /* 默认只留下低调的关系线。选中线条或其两端时，才显示沿线文字说明，
       使密集关系网仍能被逐条阅读。 */
    const annotationActive=active;
    /* 关系线未选中时不泄露文字，只以与节点一致的低频呼吸光提示“此线有批注”。 */
    if(l.annotation&&!annotationActive){
      const p=annotationPulse();
      const cue=annotationCueColor(l);
      ctx.save();ctx.globalAlpha=.12+p*.16;ctx.strokeStyle=cue;ctx.shadowColor=cue;ctx.shadowBlur=(16+p*20)/z;
      ctx.lineWidth=(4.8+p*3.6)/z;
      pathConnection(ctx,curve,cue,ctx.lineWidth);ctx.stroke();ctx.restore();
    }
    if(annotationActive&&(l.annotation||l.relationType!=="related")){
      /* B: 有绕行时标签跟到折线的中点，否则会飘在障碍另一侧、跟线脱节 */
      const mp=curve.pts?polyMidAt(curve.pts,0.5):{x:(ea.x+eb.x)/2,y:(ea.y+eb.y)/2};
      const midX=mp.x,midY=mp.y;
      const label=rel.label+(l.annotation?" · "+l.annotation:"");
      const m=annotationMetrics(label,ctx);
      const dv=curve.pts?polyDirAt(curve.pts,0.5):null;
      const angle=dv?Math.atan2(dv.y,dv.x):Math.atan2(eb.y-ea.y,eb.x-ea.x);
      /* 关系标签的阅读规则：只顺着接近水平的线走；斜线与竖线一律保持水平、
         就近贴线并用短引线归属，长中文不再被强迫竖读。 */
      const shallow=Math.abs(angle)<=Math.PI/7||Math.abs(Math.abs(angle)-Math.PI)<=Math.PI/7;
      ctx.save();
      if(shallow){
        let readableAngle=angle;
        if(readableAngle>Math.PI/2||readableAngle<-Math.PI/2)readableAngle+=Math.PI;
        ctx.translate(midX,midY);ctx.rotate(readableAngle);
        drawAnnotationBubble(label,{x:-m.w/2,y:-m.h-12/z,w:m.w,h:m.h,metrics:m},linkColor,ctx,{active:true,leaderFrom:{x:0,y:-3/z}});
      }else{
        const dx=eb.x-ea.x,dy=eb.y-ea.y;
        const side=(dy>=0?1:-1)*(Math.abs(dx)>Math.abs(dy)*.55?1:-1);
        const rx=midX+(Math.abs(dx)>Math.abs(dy)?0:13/z);
        const ry=midY+side*(m.h/2+12/z);
        drawAnnotationBubble(label,{x:rx-m.w/2,y:ry-m.h/2,w:m.w,h:m.h,metrics:m},linkColor,ctx,{active:true,leaderFrom:{x:midX,y:midY}});
      }
      ctx.restore();
    }
    /* C8: 流动光点 — 与思维导图连线一致，选中时沿线流动 */
    if(active&&!state.focusMode){
      const t=(performance.now()%2000)/2000;
      const easeT=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      let px,py;
      if(curve.pts){
        /* B: 有绕行时光点要沿折线跑，否则会从障碍中间穿过去 */
        const q=curvePointAt(curve,easeT);
        px=q.x;py=q.y;
      }else if(curve.outSide==="l"||curve.outSide==="r"){
        px=curve.ea.x+(curve.eb.x-curve.ea.x)*easeT;
        py=curve.ea.y+(curve.eb.y-curve.ea.y)*easeT+Math.sin(t*Math.PI)*((curve.ea.y+curve.eb.y)/2-curve.ea.y)*0.2;
      }else{
        px=curve.ea.x+(curve.eb.x-curve.ea.x)*easeT;
        py=curve.ea.y+(curve.eb.y-curve.ea.y)*easeT;
      }
      ctx.save();
      ctx.globalAlpha=.9;
      ctx.fillStyle=linkColor;
      ctx.shadowColor=linkColor;ctx.shadowBlur=8/z;
      ctx.beginPath();ctx.arc(px,py,3/z,0,7);ctx.fill();
      ctx.restore();
    }
  }
}
function hitRelationLink(wx,wy){
  const tolerance=Math.max(5,8/state.camera.zoom);
  for(let i=state.links.length-1;i>=0;i--){
    const l=state.links[i],a=state.items.find(it=>it.id===l.aId),b=state.items.find(it=>it.id===l.bId);
    if((a&&a.type==="mindNode"&&!isMindNodeVisible(a))||(b&&b.type==="mindNode"&&!isMindNodeVisible(b)))continue;
    const curve=linkCurve(l);if(!curve)continue;
    let nearest=Infinity;
    if(curve.pts){
      /* B: 绕行线必须按折线做命中判定，否则点和线的位置对不上 */
      for(let j=1;j<curve.pts.length;j++)nearest=Math.min(nearest,distToSegment(wx,wy,curve.pts[j-1],curve.pts[j]));
      if(nearest<=tolerance)return{type:"link",id:l.id,...l,annotation:l.annotation||""};
      continue;
    }
    /* E5: use correct control points based on direction (horizontal vs vertical S-curve) */
    var p1x,p1y,p2x,p2y;
    if(curve.horizontal){
      p1x=curve.mx;p1y=curve.ea.y;p2x=curve.mx;p2y=curve.eb.y;
    }else{
      p1x=curve.ea.x;p1y=curve.my;p2x=curve.eb.x;p2y=curve.my;
    }
    let prev=curve.ea;
    for(let step=1;step<=32;step++){
      const t=step/32,u=1-t;
      const p={x:u*u*u*curve.ea.x+3*u*u*t*p1x+3*u*t*t*p2x+t*t*t*curve.eb.x,
               y:u*u*u*curve.ea.y+3*u*u*t*p1y+3*u*t*t*p2y+t*t*t*curve.eb.y};
      nearest=Math.min(nearest,distToSegment(wx,wy,prev,p));prev=p;
    }
    if(nearest<=tolerance)return{type:"link",id:l.id,...l,annotation:l.annotation||""};
  }
  return null;
}
function mindLinkSamples(parent,child){
  const pb=itemBounds(parent),cb=itemBounds(child);if(!pb||!cb)return[];
  const sides=relAnchors(pb,cb);
  const a=anchorOn(pb,sides.out),b=anchorOn(cb,sides.inp);
  const type=layoutLinetype(),pts=[];
  if(type==="ortho")return[a,{x:a.x,y:(a.y+b.y)/2},{x:b.x,y:(a.y+b.y)/2},b];
  if(type==="timeline")return[a,{x:b.x,y:a.y},b];
  if(type==="fishbone"){
    const ax=Math.abs(b.x-a.x),ay=Math.abs(b.y-a.y),slant=Math.min(24/state.camera.zoom,ax/2,ay/2);
    return[a,{x:a.x+slant,y:a.y+slant*.6},b];
  }
  const horizontal=sides.out==="l"||sides.out==="r";
  const p1=horizontal?{x:(a.x+b.x)/2,y:a.y}:{x:a.x,y:(a.y+b.y)/2};
  const p2=horizontal?{x:(a.x+b.x)/2,y:b.y}:{x:b.x,y:(a.y+b.y)/2};
  for(let i=0;i<=28;i++)pts.push(bezierAt(a,p1,p2,b,i/28));
  return pts;
}
function hitMindConnection(wx,wy){
  const tolerance=Math.max(5,7/state.camera.zoom);
  const nodes=state.items.filter(it=>it.type==="mindNode"&&it.parentId&&isMindNodeVisible(it));
  for(let i=nodes.length-1;i>=0;i--){
    const child=nodes[i],parent=state.items.find(it=>it.type==="mindNode"&&it.id===child.parentId);
    if(!parent||!isMindNodeVisible(parent))continue;
    const pts=mindLinkSamples(parent,child);let near=Infinity;
    for(let j=1;j<pts.length;j++)near=Math.min(near,distToSegment(wx,wy,pts[j-1],pts[j]));
    if(near<=tolerance)return{type:"mindLink",id:"mind:"+parent.id+":"+child.id,aId:parent.id,bId:child.id,parent,child};
  }
  return null;
}
function drawLinkSelection(l){
  const curve=linkCurve(l);if(!curve)return;
  const z=state.camera.zoom;
  ctx.save();ctx.strokeStyle="#3a4a6b";ctx.lineWidth=5/z;ctx.globalAlpha=.26;ctx.lineCap="round";strokeLinkCurve(ctx,curve);ctx.stroke();
  ctx.globalAlpha=1;ctx.strokeStyle="#3a4a6b";ctx.lineWidth=1.5/z;ctx.setLineDash([4/z,3/z]);strokeLinkCurve(ctx,curve);ctx.stroke();ctx.restore();
}
function edgePoint(cx,cy,px,py,r){
  let dx=px-cx,dy=py-cy;
  const d2=dx*dx+dy*dy;
  if(d2<1e-6) return{x:cx,y:cy};
  const tx=dx>0?(r.x+r.w-cx)/dx:dx<0?(r.x-cx)/dx:Infinity;
  const ty=dy>0?(r.y+r.h-cy)/dy:dy<0?(r.y-cy)/dy:Infinity;
  const t=Math.min(Math.max(tx,0),Math.max(ty,0));
  if(t===Infinity||t<=0) return{x:cx,y:cy};
  return{x:cx+dx*t,y:cy+dy*t};
}
/* 锚点：吸附到矩形四边正中间（而非射线交点的任意位置），连线横平竖直更美观 */
function anchorMid(cx,cy,px,py,r){
  const dx=px-cx,dy=py-cy;
  if(dx===0&&dy===0) return{x:cx,y:cy};
  const gapX=Math.abs(dx)-(r.w/2);
  const gapY=Math.abs(dy)-(r.h/2);
  /* 水平间距更大 → 走左右边中点；否则走上下边中点 */
  if(gapX>=gapY){
    return dx>0?{x:r.x+r.w,y:r.y+r.h/2}:{x:r.x,y:r.y+r.h/2};
  }else{
    return dy>0?{x:r.x+r.w/2,y:r.y+r.h}:{x:r.x+r.w/2,y:r.y};
  }
}
const HANDLES=["nw","n","ne","e","se","s","sw","w"];
function handlePos(b,h){
  const cx=b.x+b.w/2,cy=b.y+b.h/2;
  return{nw:{x:b.x,y:b.y},n:{x:cx,y:b.y},ne:{x:b.x+b.w,y:b.y},e:{x:b.x+b.w,y:cy},se:{x:b.x+b.w,y:b.y+b.h},s:{x:cx,y:b.y+b.h},sw:{x:b.x,y:b.y+b.h},w:{x:b.x,y:cy}}[h];
}
function drawSelection(it){
  if(it.type==="link"){drawLinkSelection(it);return;}
  if(it.type==="mindLink")return; /* drawMindConnections 已以同一选中态强调真实路径 */
  const c=ctx,z=state.camera.zoom,b=itemBounds(it);
  if(!b) return;
  const r=it.type==="mindNode"?12:Math.min(10,b.h/4);
  const AC=state.dark?"#7b9bd4":"#3a4a6b";
  const pad=3/z;
  c.save();
  /* 第1层：外围柔光晕（立体感） */
  c.shadowColor=state.dark?"rgba(123,155,212,.55)":"rgba(45,95,211,.45)";
  c.shadowBlur=18/z;c.shadowOffsetY=0;
  c.strokeStyle=state.dark?"rgba(123,155,212,.35)":"rgba(45,95,211,.28)";
  c.lineWidth=(5/z);
  roundRectPath(c,b.x-pad,b.y-pad,b.w+pad*2,b.h+pad*2,r+pad);c.stroke();
  /* 第2层：主描边（清晰实线，严格贴合元素 bounds） */
  c.shadowColor="transparent";
  c.strokeStyle=AC;c.lineWidth=2/z;c.setLineDash([]);
  roundRectPath(c,b.x-pad*0.5,b.y-pad*0.5,b.w+pad,b.h+pad,r+pad*0.5);c.stroke();
  /* 第3层：内侧高光（顶部一条白光，增强立体） */
  c.save();
  roundRectPath(c,b.x-pad*0.5,b.y-pad*0.5,b.w+pad,b.h+pad,r+pad*0.5);c.clip();
  c.strokeStyle="rgba(255,255,255,"+(state.dark?.28:.5)+")";c.lineWidth=1/z;
  c.beginPath();c.moveTo(b.x+2/z,b.y-pad*0.5+1/z);c.lineTo(b.x+b.w-2/z,b.y-pad*0.5+1/z);c.stroke();
  c.restore();
  /* 缩放手柄（便签/卡片） */
  if(it.type==="note"||it.type==="fileCard"){
    const hr=3.3/z,inset=3.5/z;
    for(const h of HANDLES){
      const p=handlePos(b,h);
      p.x=clamp(p.x,b.x+inset,b.x+b.w-inset);p.y=clamp(p.y,b.y+inset,b.y+b.h-inset);
      c.fillStyle="#fff";c.strokeStyle=AC;c.lineWidth=2/z;
      c.beginPath();c.arc(p.x,p.y,hr,0,7);c.fill();c.stroke();
    }
  }
  c.restore();
}
/* 绘制多选元素的框 */
function drawMultiSel(){
  const z=state.camera.zoom;
  for(const id of state.multiSel){
    if(id===state.selected) continue;
    /* links 类型 */
    const l=state.links.find(l=>l.id===id);
    if(l){
      const a=state.items.find(i=>i.id===l.aId),b=state.items.find(i=>i.id===l.bId);
      if(a&&b){
        const ab=itemBounds(a),bb=itemBounds(b);
        ctx.save();
        ctx.strokeStyle="#3a4a6b";ctx.lineWidth=4/z;ctx.lineCap="round";
        ctx.globalAlpha=.3;
        ctx.beginPath();ctx.moveTo(ab.x+ab.w/2,ab.y+ab.h/2);ctx.lineTo(bb.x+bb.w/2,bb.y+bb.h/2);ctx.stroke();
        ctx.restore();
      }
      continue;
    }
    const it=state.items.find(i=>i.id===id);
    if(!it) continue;
    if(it.type==="mindNode"&&!isMindNodeVisible(it))continue;
    const b=itemBounds(it);if(!b)continue;
    ctx.save();
    /* 次选中：虚线灰色，区别于主选中的实线蓝色 */
    ctx.setLineDash([6/z,4/z]);ctx.lineWidth=1.5/z;ctx.strokeStyle="rgba(60,60,67,.5)";
    roundRectPath(ctx,b.x-2/z,b.y-2/z,b.w+4/z,b.h+4/z,10);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle="rgba(60,60,67,.5)";
    ctx.beginPath();ctx.arc(b.x-2/z,b.y-2/z,5/z,0,7);ctx.fill();
    ctx.fillStyle="#fff";ctx.font="700 9px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText("✓",b.x-2/z,b.y-2/z+0.5);
    ctx.restore();
  }
}
/* 框选仅在“框选”工具启用时出现：拖空白画选区，点击可累加，拖已选元素可整体移动。 */
function marqueeWorldRect(d){
  const x1=Math.min(d.start.x,d.current.x),y1=Math.min(d.start.y,d.current.y);
  return{x:x1,y:y1,w:Math.abs(d.current.x-d.start.x),h:Math.abs(d.current.y-d.start.y)};
}
function marqueeCandidates(d){
  const r=marqueeWorldRect(d),ids=[];
  for(const it of state.items){
    if((it.type==="mindNode"&&!isMindNodeVisible(it))||it.type==="connector")continue;
    const b=itemBounds(it);if(!b)continue;
    if(b.x<b.x+b.w&&b.x+b.w>=r.x&&b.x<=r.x+r.w&&b.y+b.h>=r.y&&b.y<=r.y+r.h)ids.push(it.id);
  }
  return ids;
}
function drawMarqueeSelection(){
  if(!drag||drag.mode!=="marquee")return;
  const r=marqueeWorldRect(drag),z=state.camera.zoom;
  ctx.save();
  ctx.fillStyle="rgba(45,95,211,.10)";ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.strokeStyle="rgba(45,95,211,.92)";ctx.lineWidth=1.2/z;ctx.setLineDash([5/z,4/z]);
  ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.setLineDash([]);
  for(const id of marqueeCandidates(drag)){
    const it=state.items.find(x=>x.id===id),b=it&&itemBounds(it);if(!b)continue;
    ctx.strokeStyle="rgba(45,95,211,.45)";ctx.lineWidth=1/z;ctx.strokeRect(b.x-2/z,b.y-2/z,b.w+4/z,b.h+4/z);
  }
  ctx.restore();
}
/* 检测鼠标是否在 mindNode 右侧连接点附近（用于拖出连线建立父子关系） */
function hitMindLinkPoint(wx,wy){
  const tol=12/state.camera.zoom;
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i];
    if(it.type!=="mindNode"||!isMindNodeVisible(it)||nodeDepth(it)>=3) continue;
    const b=itemBounds(it);
    const lx=b.x+b.w,ly=b.y+b.h/2;
    if(Math.hypot(wx-lx,wy-ly)<=tol) return it;
  }
  return null;
}
function hitTest(wx,wy){
  /* 内容元素优先；关系线只在精准命中真实曲线时才被选中。 */
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i];
    if(it.type==="note"){
      if(wx>=it.x&&wx<=it.x+it.w&&wy>=it.y&&wy<=it.y+it.h) return it;
    }else if(it.type==="mindNode"){
      if(!isMindNodeVisible(it))continue;
      const b=itemBounds(it);
      if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h) return it;
    }else if(it.type==="fileCard"){
      const b=itemBounds(it);
      if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h) return it;
    }else if(it.type==="stroke"){
      const tol=Math.max(6,it.size)/state.camera.zoom+3/state.camera.zoom;
      if(segDistToPoint(it.points,wx,wy)<=tol) return it;
    }else if(it.type==="connector"){
      const a=resolveEnd(it.a),b=resolveEnd(it.b);
      if(distToSegment(wx,wy,a,b)<=10/state.camera.zoom) return it;
    }
  }
  return hitRelationLink(wx,wy)||hitMindConnection(wx,wy);
}
/* 悬停预览只跟随元素本体，避免选中元素时边框在邻近节点间漂移。 */
function hoverHit(wx,wy){
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i];
    if(it.type==="note"){
      const m=2/state.camera.zoom;
      if(wx>=it.x-m&&wx<=it.x+it.w+m&&wy>=it.y-m&&wy<=it.y+it.h+m) return it;
    }else if(it.type==="mindNode"){
      if(!isMindNodeVisible(it))continue;
      const b=itemBounds(it);
      const m=2/state.camera.zoom;
      if(wx>=b.x-m&&wx<=b.x+b.w+m&&wy>=b.y-m&&wy<=b.y+b.h+m) return it;
    }else if(it.type==="fileCard"){
      const b=itemBounds(it);
      const m=2/state.camera.zoom;
      if(wx>=b.x-m&&wx<=b.x+b.w+m&&wy>=b.y-m&&wy<=b.y+b.h+m) return it;
    }else if(it.type==="stroke"){
      const tol=Math.max(3,it.size*.6)/state.camera.zoom+2/state.camera.zoom;
      if(segDistToPoint(it.points,wx,wy)<=tol) return it;
    }else if(it.type==="connector"){
      const a=resolveEnd(it.a),b=resolveEnd(it.b);
      if(distToSegment(wx,wy,a,b)<=5/state.camera.zoom) return it;
    }
  }
  return null;
}
function isConnectionItem(it){ return it&&(it.type==="connector"||it.type==="stroke"); }
function isResizableItem(it){ return it&&(it.type==="note"||it.type==="fileCard"); }
/* 导图拖放目标：优先取节点，排除自身及其后代，避免拖到自己子树上 */
function mindDropTarget(wx,wy,selfId){
  let best=null,bestDist=Infinity;
  for(const it of state.items){
    if(it.type!=="mindNode"||it.id===selfId) continue;
    const b=itemBounds(it);
    if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h) return it;
    const d=Math.hypot(wx-(b.x+b.w/2),wy-(b.y+b.h/2));
    if(d<bestDist&&d<120/state.camera.zoom){best=it;bestDist=d;}
  }
  return best;
}
function segDistToPoint(pts,x,y){
  if(pts.length<2) return Infinity;
  let best=Infinity;
  for(let i=1;i<pts.length;i++){const d=distToSegment(x,y,pts[i-1],pts[i]);if(d<best)best=d;}
  return best;
}
function distToSegment(px,py,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
  let t=l2?((px-a.x)*dx+(py-a.y)*dy)/l2:0;t=clamp(t,0,1);
  const x=a.x+dx*t,y=a.y+dy*t;
  return Math.hypot(px-x,py-y);
}
function hitHandle(sel,sx,sy){
  const b=itemBounds(sel);if(!b) return null;
  /* 命中判定放宽（用户反馈：原 9px 圆形判定太严，鼠标必须精确落在角点/边中点的
     那一条线上才触发，很难用）。改为"一块区域"判定——
     角手柄=方形区域、边手柄=带状区域，向元素内收进一段距离仍可命中。 */
  const CORNER=20;  /* 角手柄：方形半宽（屏幕像素） */
  const BAND=14;    /* 边手柄：法向厚度（往元素内收一段） */
  const EXT=22;     /* 边手柄：切向延伸半长（沿边方向放宽） */
  let best=null,bestD=Infinity;
  for(const h of HANDLES){
    const p=w2s(handlePos(b,h).x,handlePos(b,h).y);
    const dx=sx-p.x,dy=sy-p.y;
    const ok=(h==="n"||h==="s")?(Math.abs(dx)<=EXT&&Math.abs(dy)<=BAND)
            :(h==="e"||h==="w")?(Math.abs(dx)<=BAND&&Math.abs(dy)<=EXT)
            :(Math.abs(dx)<=CORNER&&Math.abs(dy)<=CORNER);
    if(ok){const d=Math.hypot(dx,dy);if(d<bestD){bestD=d;best=h;}}
  }
  return best;
}

/* ============================================================
   创建元素
============================================================ */
function addNote(x,y,text,color){
  const it={id:uid++,type:"note",x:Math.round(x-80),y:Math.round(y-40),w:160,h:90,text:text===undefined?"双击编辑":text,color:color||DEFAULT_NOTE_COLOR,fontFamily:state.fontPreset,fontSize:13,underline:false,bold:false,detail:"",annotation:"",birth:performance.now()};
  state.items.push(it);
  return it;
}
function addStroke(wx,wy){
  const it={id:uid++,type:"stroke",points:[{x:wx,y:wy}],color:state.penColor,size:state.penSize,detail:"",annotation:"",birth:performance.now()};
  state.items.push(it);
  return it;
}
function anchorFor(wx,wy){
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i];
    if(it.type==="note"&&wx>=it.x&&wx<=it.x+it.w&&wy>=it.y&&wy<=it.y+it.h){
      return{noteId:it.id,ox:wx-it.x,oy:wy-it.y,free:false};
    }
    if(it.type==="mindNode"||it.type==="fileCard"){
      const b=itemBounds(it);
      if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h){
        return{noteId:it.id,ox:wx-b.x,oy:wy-b.y,free:false};
      }
    }
  }
  return{x:wx,y:wy,free:true};
}
function addConnector(a,b){
  const it={id:uid++,type:"connector",a,b,color:state.lineColor,width:Math.max(1.5,state.penSize),detail:"",annotation:"",birth:performance.now()};
  state.items.push(it);
  return it;
}
function addMindNode(text,parentId,color,x,y){
  /* 自动轮换只在用户启用时生效；单色模式始终沿用当前主色。 */
  if(!color&&parentId&&state.mindColorMode==="auto"){
    const p=state.items.find(i=>i.id===parentId);
    if(p&&p.children){
      const palette=MIND_COLORS.filter(c=>c!==p.color);
      color=palette[p.children.length%palette.length]||state.mindColor;
    }
  }
  const it={
    id:uid++,type:"mindNode",text:text||"新节点",
    parentId:parentId||null,children:[],
    x:x!==undefined?x:0,y:y!==undefined?y:0,
    w:130,h:40,color:color||state.mindColor,collapsed:false,
    attachIds:[],detail:"",annotation:"",
    birth:performance.now(),
  };
  if(parentId){
    const p=state.items.find(i=>i.id===parentId);
    if(p) p.children.push(it.id);
  }
  state.items.push(it);
  return it;
}
function addFileCard(x,y,fileId){
  const f=state.files.find(x=>x.id===fileId);
  const it={id:uid++,type:"fileCard",x:x-80,y:y-24,w:160,h:52,fileId,kind:f?f.kind:"other",thumb:f&&f.thumb?f.thumb:null,tw:f&&f.tw?f.tw:1,th:f&&f.th?f.th:1,detail:"",annotation:"",birth:performance.now()};
  if(f&&f.kind==="img"&&f.thumb&&f.tw){it.thumb=f.thumb;it.tw=f.tw;it.th=f.th;it.h=Math.max(52,f.thumb.height?Math.round(f.thumb.height*(100/f.thumb.width))+26:52);}
  state.items.push(it);
  return it;
}
function deleteItem(id){
  const linkIndex=state.links.findIndex(l=>l.id===id);
  if(linkIndex>=0){
    pushHistory("删除连接");state.links.splice(linkIndex,1);
    state.selected=null;state.multiSel=state.multiSel.filter(x=>x!==id);
    render();saveState();toast("已删除连接");
    /* L5: 返回实际删除的 id，供 AI 等调用方核对（此前返回 undefined） */
    return {removed:[id],kind:"link"};
  }
  const idx=state.items.findIndex(i=>i.id===id);
  if(idx<0) return {removed:[],kind:"none"};
  pushHistory("删除元素");
  const removeIds=new Set();
  const collect=itemId=>{
    if(removeIds.has(itemId))return;removeIds.add(itemId);
    const node=state.items.find(i=>i.id===itemId);
    if(node&&node.type==="mindNode") for(const childId of node.children||[]) collect(childId);
  };
  collect(id);
  state.items=state.items.filter(it=>{
    if(removeIds.has(it.id))return false;
    if(it.type==="connector")return !removeIds.has(it.a.noteId)&&!removeIds.has(it.b.noteId);
    return true;
  });
  state.links=state.links.filter(l=>!removeIds.has(l.aId)&&!removeIds.has(l.bId));
  for(const it of state.items){
    if(it.type!=="mindNode")continue;
    it.children=(it.children||[]).filter(c=>!removeIds.has(c));
    it.attachIds=(it.attachIds||[]).filter(a=>!removeIds.has(a));
  }
  if(removeIds.has(state.selected))state.selected=null;
  state.multiSel=state.multiSel.filter(x=>!removeIds.has(x));
  cleanupProjectReferences();
  render();saveState();
  /* L5: 级联删除的子节点、关联连线、连接器都记录在 removeIds 里，一并返回 */
  return {removed:[...removeIds],kind:"item"};
}
function duplicateItem(id){
  const src=state.items.find(i=>i.id===id);
  if(!src) return;
  pushHistory("复制");
  const cp=typeof structuredClone==="function"?structuredClone(src):JSON.parse(JSON.stringify(src));
  cp.id=uid++;
  cp.birth=performance.now();
  if(cp.type==="note"){cp.x+=24;cp.y+=24;}
  if(cp.type==="stroke") cp.points=cp.points.map(p=>({x:p.x+24,y:p.y+24}));
  if(cp.type==="connector"){cp.a.free&&(cp.a.x+=24);cp.a.free&&(cp.a.y+=24);cp.b.free&&(cp.b.x+=24);cp.b.free&&(cp.b.y+=24);}
  if(cp.type==="mindNode"){cp.x+=24;cp.y+=24;cp.children=[];cp.parentId=null;}
  if(cp.type==="fileCard"){cp.x+=24;cp.y+=24;const f=state.files.find(x=>x.id===cp.fileId);if(f){cp.thumb=f.thumb||null;}}
  state.items.push(cp);
  state.selected=cp.id;
  /* I5-fix: 复制完成后立即落盘（此前只靠 30s 自动保存/beforeunload 兜底） */
  saveStateDebounced();
  render();
}
/* 导图操作 */
/* 节点自动命名：根=总节点，1级=一级节点A/B/C，2级=二级节点A/B/C */
function defaultNodeName(parentId){
  if(!parentId){
    /* 根节点 */
    const roots=state.items.filter(i=>i.type==="mindNode"&&!i.parentId);
    return roots.length===0?"总节点":"总节点 "+String.fromCharCode(65+roots.length-1);
  }
  const depth=nodeDepthById(parentId);
  const levelNames=["总节点","一级节点","二级节点","三级节点"];
  const baseName=levelNames[depth+1]||"节点";
  /* 统计同父同级已有节点数 */
  const parent=state.items.find(i=>i.id===parentId);
  const siblings=(parent?.children||[]).map(cid=>state.items.find(i=>i.id===cid)).filter(Boolean);
  const letter=String.fromCharCode(65+siblings.length);
  return baseName+" "+letter;
}
/* 通过 parentId 计算深度（不依赖 nodeDepth 避免循环） */
function nodeDepthById(id){
  let d=0;
  let it=state.items.find(i=>i.id===id);
  const seen=new Set();
  while(it&&it.parentId&&!seen.has(it.id)){
    seen.add(it.id);
    d++;
    it=state.items.find(i=>i.id===it.parentId);
  }
  return d;
}
function addChildMind(n){
  if(!n||n.type!=="mindNode") return;
  pushHistory("添加子节点");
  const b=itemBounds(n);
  const child=addMindNode(defaultNodeName(n.id),n.id,null,b.x+b.w+60,b.y);
  /* 自动找不遮挡位置 */
  smartPlace(child);
  state.selected=child.id;
  if(state.mindMode==="auto") autoLayout();
  render();saveState();
  setTimeout(()=>openTextEditor(child),50);
}
function addSiblingMind(n){
  if(!n||n.type!=="mindNode"||!n.parentId) return;
  const p=state.items.find(i=>i.id===n.parentId);
  if(!p) return;
  pushHistory("添加同级");
  const pb=itemBounds(p);
  const b=itemBounds(n);
  const idx=(p.children||[]).indexOf(n.id);
  const sib=addMindNode(defaultNodeName(n.parentId),p.id,state.mindColorMode==="auto"?null:n.color,b.x,b.y+b.h+12);
  p.children=(p.children||[]).slice(0,idx+1).concat(sib.id,(p.children||[]).slice(idx+1));
  /* 自动找不遮挡位置 */
  smartPlace(sib);
  state.selected=sib.id;
  if(state.mindMode==="auto") autoLayout();
  render();saveState();
  setTimeout(()=>openTextEditor(sib),50);
}
/* smartPlace：给新元素找一个不遮挡其他元素的位置 */
function smartPlace(it){
  const GAP=18;
  let tries=0;
  while(tries<20){
    const b=layoutCollisionBounds(it);if(!b)return;
    let overlap=false;
    for(const other of state.items){
      if(other===it) continue;
      const ob=layoutCollisionBounds(other);if(!ob)continue;
      const ox=Math.min(b.x+b.w,ob.x+ob.w)-Math.max(b.x,ob.x);
      const oy=Math.min(b.y+b.h,ob.y+ob.h)-Math.max(b.y,ob.y);
      if(ox>4&&oy>4){
        /* 有重叠，向下移 */
        it.y=ob.y+ob.h+GAP;
        overlap=true;break;
      }
    }
    if(!overlap)break;
    tries++;
  }
}
function toggleCollapse(n){
  if(!n||!(n.children&&n.children.length))return;
  pushHistory("折叠/展开");
  n.collapsed=!n.collapsed;
  render();saveState();
  toast(n.collapsed?"已收起 "+Math.max(0,subtreeCount(n)-1)+" 个子节点":"已展开子节点");
}
/* 显式改父级（替代拖拽误触）：将 node 移到 newParent 下，或移到根级 */
function reparentNode(node,newParent){
  if(!node||node.type!=="mindNode") return;
  if(newParent&&node.id===newParent.id) {toast("不能设为自己的子节点");return;}
  /* 环检测：禁止移到自己的后代下 */
  if(newParent){
    let p=newParent;
    while(p){
      if(p.id===node.id){toast("不能移到自己的后代下（会形成环）");return;}
      p=p.parentId?state.items.find(i=>i.id===p.parentId):null;
    }
  }
  pushHistory("改父级");
  /* 从旧父级的 children 移除 */
  if(node.parentId){
    const oldP=state.items.find(i=>i.id===node.parentId);
    if(oldP) oldP.children=(oldP.children||[]).filter(c=>c!==node.id);
  }
  if(newParent){
    node.parentId=newParent.id;
    if(!newParent.children.includes(node.id)) newParent.children.push(node.id);
    toast("已设为「"+newParent.text+"」的子节点");
  }else{
    node.parentId=null;
    toast("已移到根级");
  }
  if(state.mindMode==="auto") autoLayout();
  render();saveState();
}
/* 同级排序：上移/下移 */
function moveSibling(dir){
  const n=selectedItem();
  if(!n||n.type!=="mindNode"||!n.parentId) return;
  const p=state.items.find(i=>i.id===n.parentId);
  if(!p||!p.children) return;
  const idx=p.children.indexOf(n.id);
  const ni=idx+dir;
  if(ni<0||ni>=p.children.length) return;
  pushHistory("同级排序");
  [p.children[idx],p.children[ni]]=[p.children[ni],p.children[idx]];
  if(state.mindMode==="auto") autoLayout();
  render();saveState();
  toast(dir<0?"已上移":"已下移");
}
/* 提级：将当前节点移到其父级的同级（父级的父级下） */
function promoteNode(){
  const n=selectedItem();
  if(!n||n.type!=="mindNode"||!n.parentId) {toast("已在根级");return;}
  const p=state.items.find(i=>i.id===n.parentId);
  if(!p) return;
  if(!p.parentId){ /* 父是根，移到根级 */ reparentNode(n,null); return; }
  const gp=state.items.find(i=>i.id===p.parentId);
  if(!gp){ reparentNode(n,null); return; }
  reparentNode(n,gp);
  /* 提级后放在原父级后面 */
  const gi=gp.children.indexOf(n.id);
  const pi=gp.children.indexOf(p.id);
  if(gi>=0&&pi>=0&&gi!==pi+1){
    gp.children.splice(gi,1);
    gp.children.splice(pi+1,0,n.id);
  }
  if(state.mindMode==="auto") autoLayout();
  render();saveState();
  toast("已提级");
}
/* 降级：将当前节点移到前一个同级节点下 */
function demoteNode(){
  const n=selectedItem();
  if(!n||n.type!=="mindNode"||!n.parentId) {toast("无法降级：已在根级");return;}
  const p=state.items.find(i=>i.id===n.parentId);
  if(!p||!p.children) return;
  const idx=p.children.indexOf(n.id);
  if(idx<=0){toast("无前驱同级节点可降入");return;}
  const prev=state.items.find(i=>i.id===p.children[idx-1]);
  if(!prev){return;}
  reparentNode(n,prev);
  toast("已降级");
}

/* ============================================================
   便签/材料 ↔ 导图节点 关联（attachIds）— 已按需求整体移除
   ------------------------------------------------------------
   拖动便签到节点建立关联、节点/便签右上角角标均已删除。
   以下保留空实现，仅为兼容遗留调用点，不再产生任何关联行为。
============================================================ */
function attachToNode(){ return false; }
function detachAll(){}
function attachedItems(){ return []; }
function nodeOf(){ return null; }
/* 导入、撤销和删除之后统一清理悬空引用，避免“看不见但还存在”的关系。 */
function cleanupCanvasReferences(canvas){
  const ids=new Set((canvas.items||[]).map(it=>it.id));
  canvas.links=(canvas.links||[]).filter(l=>ids.has(l.aId)&&ids.has(l.bId)).map(l=>({
    ...l,relationType:RELATION_TYPES[l.relationType]?l.relationType:"related",
    directional:l.directional===undefined?!!RELATION_TYPES[l.relationType]?.directional:!!l.directional,level:["normal","emphasis","highlight"].includes(l.level)?l.level:"normal",shape:["auto","curve","polyline","straight"].includes(l.shape)?l.shape:"auto",
  }));
  for(const it of canvas.items||[]){
    if(it.type!=="mindNode")continue;
    it.children=(it.children||[]).filter(id=>ids.has(id));
    it.attachIds=(it.attachIds||[]).filter(id=>ids.has(id));
    if(it.parentId&&!ids.has(it.parentId))it.parentId=null;
  }
}
function cleanupProjectReferences(){
  const project=curProject();if(!project)return;
  for(const canvas of project.canvases){cleanupCanvasReferences(canvas);}
  for(const canvas of project.canvases){
    for(const item of canvas.items||[]){
      if(!item.jumpTo)continue;
      const ref=typeof item.jumpTo==="string"?{canvasId:item.jumpTo}:item.jumpTo;
      const targetProject=state.projects.find(p=>p.id===(ref.projectId||project.id));
      const target=targetProject?.canvases.find(c=>c.id===ref.canvasId);
      if(!target){item.jumpTo=null;continue;}
      if(ref.itemId&&!target.items.some(i=>i.id===ref.itemId))item.jumpTo={...ref,canvasId:target.id,itemId:null};
    }
  }
}
function cleanupReferences(){cleanupProjectReferences();}
/* 自动树布局：根在左，向右逐层展开（手动模式下不调用） */
function autoLayout(){
  /* 切换布局时先展开所有折叠节点，避免隐藏子树干扰布局计算 */
  for(const it of state.items){
    if(it.type==="mindNode"&&it.collapsed)it.collapsed=false;
  }
  /* 布局变更是"定格"场景：清空连线动画状态，让连接点按新方位立即就位 */
  linkAnimMap.clear();
  /* 统一走新布局分发（radial 大爆炸 / both 双列 已删除） */
  applyAutoLayout();
  /* I5-fix: return 之后的 ~40 行旧树布局实现不可达，已删除 */
}
