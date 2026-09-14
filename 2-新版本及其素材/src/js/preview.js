"use strict";
/* ============================================================
   画布内预览窗口（替代右侧面板）
============================================================ */
const PV_W=380,PV_H=300,PV_PAD=24;
let pvUid=1;
function openPreview(fileId,forceNew){
  const c=curCanvas();if(!c)return;
  const exist=c.previews.find(p=>p.fileId===fileId);
  /* 再次点击=关闭预览（除非 forceNew——NoTab 式"⊕新弹窗"强制再开一个） */
  if(exist&&!forceNew){closePreview(exist.id);return;}
  const f=state.files.find(x=>x.id===fileId);
  if(!f) return;
  const card=state.items.find(i=>i.type==="fileCard"&&i.fileId===fileId);
  let px,py,pw,ph;
  if(card){
    /* 原地变身：预览窗口定位在 fileCard 位置，宽度扩展以适应内容 */
    px=card.x-(PV_W-card.w)/2;py=card.y-(PV_H-card.h)/2;
    pw=PV_W;ph=PV_H;
  }else{
    const cx=state.camera.x+W/2/state.camera.zoom, cy=state.camera.y+H/2/state.camera.zoom;
    px=cx-PV_W/2;py=cy-PV_H/2;
    pw=PV_W;ph=PV_H;
  }
  /* 避让已有预览窗口 */
  for(let pass=0;pass<6;pass++){
    let overlap=false;
    for(const op of c.previews){
      const ox=Math.min(px+pw,op.x+op.w)-Math.max(px,op.x);
      const oy=Math.min(py+ph,op.y+op.h)-Math.max(py,op.y);
      if(ox>4&&oy>4){
        px=op.x+op.w+PV_PAD;
        overlap=true;break;
      }
    }
    if(!overlap)break;
  }
  const pv={id:"pv"+(pvUid++),fileId,x:px,y:py,w:pw,h:ph};
  /* H2 任务10: 跨域网页预览=独立渲染进程，限制同时打开数（≥3 则关最早一个），避免进程数飙升 */
  if(f.kind==="link"){
    const linkPvs=c.previews.filter(p=>{const pf=state.files.find(x=>x.id===p.fileId);return pf&&pf.kind==="link";});
    if(linkPvs.length>=3)closePreview(linkPvs[0].id);
  }
  c.previews.push(pv);
  renderPreviewWindows();
}
function closePreview(pvId){
  const c=curCanvas();if(!c)return;
  c.previews=c.previews.filter(p=>p.id!==pvId);
  syncPvDom();
  render();
}
function bringPreviewFront(pv){
  const c=curCanvas();if(!c)return;
  c.previews=c.previews.filter(p=>p.id!==pv.id);
  c.previews.push(pv);
  syncPvDom();
  render();
}
/* 把画布内预览窗口渲染到 DOM 层（跟随相机变换） */
function renderPreviewWindows(){
  /* 先占位：在对应文件卡片旁打开，若有 card 跟随 */
  syncPvDom();
  render();
}
/* 预览窗口拖动/resize 结束后：按新尺寸重新适配内容（替代直接裁切）
   —— iframe/视频的 zoom 已由 syncPvContentZoom 随容器重算；
      这里对 DOM 型内容（docx/pdf/表格）触发一次容器内容重排（overflow 重算），
      并让图片类（canvas 绘制的 img 分支）由下一帧 render 按新 b.w/b.h 重绘 */
function reflowPreview(el,pv){
  if(!el)return;
  const body=el.querySelector&&el.querySelector(".pv-body");
  if(body){
    /* DOM 内容层强制 reflow：容器尺寸变化后重算布局，消除"剪切"残留 */
    const cont=body.firstElementChild;
    if(cont){
      cont.style.display="none";
      void cont.offsetHeight;   /* 强制 reflow */
      cont.style.display="";
    }
    fitDocxPreview(body);
  }
  requestAnimationFrame(()=>{render();});
}
async function tryNativeOpen(f){
  const path=f&&f.localPath;
  try{
    if(path&&window.electronAPI&&typeof window.electronAPI.openPath==="function"){await window.electronAPI.openPath(path);return true;}
    if(path&&window.desktopAPI&&typeof window.desktopAPI.openPath==="function"){await window.desktopAPI.openPath(path);return true;}
    if(path&&window.pywebview&&window.pywebview.api&&typeof window.pywebview.api.open_file==="function"){await window.pywebview.api.open_file(path);return true;}
    if(path&&window.chrome&&window.chrome.webview){window.chrome.webview.postMessage({type:"open-default-app",path});return true;}
  }catch(e){console.warn("native open failed",e);}
  return false;
}
/* 用系统默认外部应用打开附件：桌面容器具备桥接能力时直接唤起；
   普通浏览器出于安全限制无法启动任意本机程序，才降级为下载。 */
async function openWithExternalApp(f){
  if(!f)return;
  if(f.kind==="link"){
    if(isSafePreviewUrl(f.url)){window.open(f.url,"_blank","noopener");return;}
    toast("链接地址无效");
    return;
  }
  if(await tryNativeOpen(f)){toast("已交给电脑默认应用打开");return;}
  /* G8: 无 localPath 时，尝试 blob → 临时文件 → 系统打开 */
  if(window.electronAPI&&typeof window.electronAPI.openBlob==="function"){
    var blob=f.blob;
    if(!blob){
      try{blob=await getBlob(f.id);}catch(e){blob=null;}
    }
    if(blob){
      try{
        var buf=await blob.arrayBuffer();
        var ok=await window.electronAPI.openBlob({name:f.name||"file",bytes:new Uint8Array(buf)});
        if(ok){toast("已交给电脑默认应用打开");return;}
      }catch(e){console.warn("openBlob failed",e);}
    }
  }
  /* 兜底：下载 */
  const b=f.blob;
  if(b){
    const url=f._url||URL.createObjectURL(b);
    if(!f._url)f._url=url;
    const a=document.createElement("a");
    a.href=url;a.download=f.name||"文件";
    document.body.appendChild(a);a.click();a.remove();
    toast("已下载「"+f.name+"」（浏览器环境不支持直接唤起系统 APP，已触发下载）");
    return;
  }
  getBlob(f.id).then(b2=>{
    if(!b2){toast("文件不存在");return;}
    const url=f._url||URL.createObjectURL(b2);
    if(!f._url)f._url=url;
    const a=document.createElement("a");
    a.href=url;a.download=f.name||"文件";
    document.body.appendChild(a);a.click();a.remove();
    toast("已下载「"+f.name+"」");
  }).catch(()=>toast("读取文件失败"));
}
function syncPvDom(){
  const z=state.camera.zoom;
  const existing=new Map();
  for(const child of previewLayer.children){
    /* 跳过形变预览覆盖层(.pv-morph，无 dataset.pv)与残留无 key 节点，
       否则会被当作孤儿移除，导致 morphDom 指向脱离 DOM 的节点=预览空白 */
    if(!child.dataset.pv)continue;
    existing.set(child.dataset.pv,child);
  }
  const seen=new Set();
  for(const pv of state.previews){
    seen.add(pv.id);
    let el=existing.get(pv.id);
    if(!el){
      const f=state.files.find(x=>x.id===pv.fileId);
      el=document.createElement("div");
      el.className="pv-win";
      el.dataset.pv=pv.id;
      el.innerHTML='<div class="pv-head"><span class="pv-fname"></span><span class="pv-size"></span><div class="pv-zoom"><button class="pv-zo" title="缩小">−</button><span class="pv-zoom-val">100%</span><button class="pv-zi" title="放大">+</button></div><button class="pv-open" title="用默认外部应用打开">⬈</button><button class="pv-newtab" title="在新弹窗打开（NoTab 式）">⊕</button><span class="pv-close">×</span></div><div class="pv-body"></div><div class="pv-resize"></div>';
      /* 缩放按钮：用户内容缩放（I5-fix: 唯一数据源=dataset.pvZoom，头部按钮与内容缩放栏共用同一状态，读数恒一致；
         原此处引用了不存在的 it 变量，首次创建预览窗口必崩 ReferenceError，已修） */
      const zoomVal=el.querySelector(".pv-zoom-val");
      el.dataset.pvZoom=String(1);
      const applyZoom=(v)=>{
        const zv=Math.max(0.3,Math.min(3,v||1));
        el.dataset.pvZoom=String(zv);
        zoomVal.textContent=Math.round(zv*100)+"%";
        syncPvDom();
      };
      const getPvZoom=()=>parseFloat(el.dataset.pvZoom)||1;
      el.querySelector(".pv-zo").addEventListener("click",()=>applyZoom(getPvZoom()-0.2));
      el.querySelector(".pv-zi").addEventListener("click",()=>applyZoom(getPvZoom()+0.2));
      el.querySelector(".pv-zoom-val").addEventListener("click",()=>applyZoom(1));
      const head=el.querySelector(".pv-head");
      head.addEventListener("pointerdown",e=>{
        if(e.button!==0) return;
        e.preventDefault();e.stopPropagation();
        const sx=e.clientX,sy=e.clientY,wsx=pv.x,wsy=pv.y;
        const mv=ev=>{
          const bxy=boardXY(ev.clientX,ev.clientY);
          pv.x=wsx+(bxy.x-(sx-board.offsetLeft))/state.camera.zoom;
          pv.y=wsy+(bxy.y-(sy-board.offsetTop))/state.camera.zoom;
          syncPvDom();
        };
        const up=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);reflowPreview(el,pv);render();saveState();};
        window.addEventListener("pointermove",mv);
        window.addEventListener("pointerup",up);
      });
      el.querySelector(".pv-close").addEventListener("click",e=>{e.stopPropagation();closePreview(pv.id);});
      /* NoTab 式"⊕ 新弹窗"：为当前文件再开一个新的独立预览窗口（避免遮挡原窗口，
         相当于超链接开新弹框的复用；对 link 文件可连续打开多级链接内容） */
      el.querySelector(".pv-newtab").addEventListener("click",e=>{
        e.stopPropagation();
        const nf=state.files.find(x=>x.id===pv.fileId);
        if(!nf)return;
        openPreview(pv.fileId,true);   /* forceNew：另开新弹窗并排（NoTab 超链接复用） */
        toast("已再开一个预览弹窗："+(nf.name||""));
      });
      /* 用默认外部应用打开（独立预览窗头部） */
      el.querySelector(".pv-open").addEventListener("click",e=>{
        e.stopPropagation();
        const nf=state.files.find(x=>x.id===pv.fileId);
        if(nf)openWithExternalApp(nf);
      });
      const rz=el.querySelector(".pv-resize");
      rz.addEventListener("pointerdown",e=>{
        e.preventDefault();e.stopPropagation();
        const sx=e.clientX,sy=e.clientY,sw=pv.w,sh=pv.h;
        const mv=ev=>{
          const bxy=boardXY(ev.clientX,ev.clientY);
          pv.w=Math.max(220,sw+(bxy.x-(sx-board.offsetLeft))/state.camera.zoom);
          pv.h=Math.max(160,sh+(bxy.y-(sy-board.offsetTop))/state.camera.zoom);
          syncPvDom();
        };
        const up=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);reflowPreview(el,pv);render();saveState();};
        window.addEventListener("pointermove",mv);
        window.addEventListener("pointerup",up);
      });
      el.addEventListener("pointerdown",()=>{
        const card=state.items.find(i=>i.type==="fileCard"&&i.fileId===pv.fileId);
        if(card&&state.selected!==card.id){state.selected=card.id;render();}
        bringPreviewFront(pv);
      },true);
      previewLayer.appendChild(el);
    }
    const f=state.files.find(x=>x.id===pv.fileId);
    if(f){
      const fname=el.querySelector(".pv-fname");
      const fsize=el.querySelector(".pv-size");
      if(fname.textContent!==f.name) fname.textContent=f.name;
      const sizeTxt=KIND_LABEL[f.kind]||"";
      if(fsize.textContent!==sizeTxt) fsize.textContent=sizeTxt;
    }
    /* I5-fix: 缩放读数统一由 dataset.pvZoom 驱动——头部百分比与内容栏输入框无论哪边改动，另一侧都同步 */
    const zv=parseFloat(el.dataset.pvZoom)||1;
    const zvTxt=Math.round(zv*100)+"%";
    const zLabel=el.querySelector(".pv-zoom-val");
    if(zLabel&&zLabel.textContent!==zvTxt)zLabel.textContent=zvTxt;
    const zInputEl=el.querySelector(".pv-zinput");
    if(zInputEl&&document.activeElement!==zInputEl&&zInputEl.value!==String(Math.round(zv*100)))zInputEl.value=String(Math.round(zv*100));
    const spX=(pv.x-state.camera.x)*z,spY=(pv.y-state.camera.y)*z;
    const spW=pv.w*z,spH=pv.h*z;
    el.style.left=spX+"px";el.style.top=spY+"px";
    el.style.width=spW+"px";el.style.height=spH+"px";
    const docxFitKey=Math.round(pv.w)+"x"+Math.round(pv.h);
    if(el.dataset.docxFitKey!==docxFitKey){el.dataset.docxFitKey=docxFitKey;fitDocxPreview(el);}
    /* 画布 zoom 实时同步：iframe/视频等多格式内容随 transform 等比缩放，
       而不只是容器撑大——否则缩小画布后网页内容保持原尺寸（根因） */
    syncPvContentZoom(el,pv,z);
    /* 内容体只在首次创建时渲染（滚动位置保留） */
    if(!el.dataset.rendered){
      el.dataset.rendered="1";
      const f=state.files.find(x=>x.id===pv.fileId);
      renderPvContent(pv,f,el.querySelector(".pv-body"));
    }
  }
  /* 移除已关闭的 */
  for(const [k,el] of existing){
    if(!seen.has(k)){
      /* H2 任务10: 关闭即销毁——先断开 iframe src 促使独立渲染进程释放，再移除 DOM */
      const ifr=el.querySelector&&el.querySelector("iframe");if(ifr){try{ifr.src="about:blank";}catch(e){}}
      el.remove();
    }
  }
}
function renderPvContent(pv,f,body){
  if(!f){body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>文件不存在</div>';return;}
  const kick=(url,type)=>{
    if(type==="img"){
      /* 通过 DOM 属性写入 URL，避免带引号的材料链接破坏预览 DOM。 */
      renderPreviewImage(body,url,{wrapClass:"pv-img-wrap",style:"max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto"});
    }else if(type==="media"){
      /* 视频预览：preload=auto + 携带 Referer（防盗链），否则无法起播 */
      const v=document.createElement("video");
      v.style.cssText="width:100%;height:100%;object-fit:contain;background:#000";
      v.src=url;v.controls=true;v.autoplay=false;v.preload="auto";v.referrerPolicy="no-referrer-when-downgrade";
      body.innerHTML="";body.appendChild(v);
    }else if(type==="text"){
      fetch(url).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.text();}).then(t=>{
        if(f&&/\.(md|markdown)$/i.test(f.name)){
          /* Markdown：完整 DOM 渲染（标题/表格/列表/代码/下划线） */
          const box=document.createElement("div");
          box.className="pv-md-wrap";
          renderMdDom(t,box);
          body.innerHTML="";body.appendChild(box);
        }else{
          body.innerHTML='<pre class="pv-text"></pre>';body.firstChild.textContent=t;
        }
      }).catch(()=>{body.innerHTML='<div class="pv-msg">无法读取文本</div>';});
    }else if(type==="link"){
      if(rejectsEmbeddedPreview(f.url||url)){renderWebEmbedFallback(body,f.url||url,f.name);return;}
      const win=body.closest(".pv-win");
      const wrap=document.createElement("div");
      wrap.className="pv-web-wrap";
      const bar=document.createElement("div");
      bar.style.cssText="display:flex;align-items:center;gap:4px;padding:4px 6px;border-bottom:1px solid var(--card-border);flex:none";
      /* —— 视图往返切换：手机 ⇄ 桌面（统一 SVG 线性图标，与整套视觉一致） —— */
      const devMode=document.createElement("div");
      devMode.style.cssText="display:flex;gap:2px;margin-right:6px";
      const pcBtn=document.createElement("button");
      pcBtn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
      pcBtn.title="桌面版视图";pcBtn.className="pv-devbtn";
      const mbBtn=document.createElement("button");
      mbBtn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>';
      mbBtn.title="手机版视图";mbBtn.className="pv-devbtn";
      const devBase="padding:3px 7px;border:1px solid var(--card-border);border-radius:6px;cursor:pointer;font-size:11px;display:flex;align-items:center;background:transparent;color:var(--ink-dim);transition:background-color .12s ease,border-color .12s ease,color .12s ease";
      pcBtn.style.cssText=devBase;mbBtn.style.cssText=devBase;
      devMode.appendChild(pcBtn);devMode.appendChild(mbBtn);bar.appendChild(devMode);
      /* —— 精确缩放：− [输入百分比] + （与窗口/画布 zoom 合并生效） —— */
      const zo=document.createElement("button");zo.textContent="−";zo.title="缩小 20%";
      const zInput=document.createElement("input");zInput.type="text";zInput.value="100";zInput.className="pv-zinput";zInput.title="点击输入精确缩放百分比（30%-300%）";
      zInput.style.cssText="width:42px;text-align:center;border:1px solid var(--card-border);border-radius:6px;font-size:11px;padding:2px 0;background:var(--surface);color:var(--ink);outline:none";
      const zi=document.createElement("button");zi.textContent="+";zi.title="放大 20%";
      zo.style.cssText=devBase;zi.style.cssText=devBase;
      bar.appendChild(zo);bar.appendChild(zInput);bar.appendChild(zi);
      const applyZoom=v=>{
        if(!win)return;
        win.dataset.pvZoom=String(Math.max(0.3,Math.min(3,v)));
        zInput.value=Math.round(v*100);
        syncPvDom();
      };
      zo.addEventListener("click",()=>applyZoom((parseFloat(win.dataset.pvZoom)||1)-0.2));
      zi.addEventListener("click",()=>applyZoom((parseFloat(win.dataset.pvZoom)||1)+0.2));
      zInput.addEventListener("change",()=>{const v=(parseFloat(zInput.value)||100)/100;applyZoom(v);});
      zInput.addEventListener("keydown",e=>{if(e.key==="Enter")zInput.blur();});
      /* 新窗口打开（独立预览窗内网页的外部入口） */
      const extBtn=document.createElement("button");
      extBtn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';
      extBtn.title="在新窗口打开";
      extBtn.style.cssText=devBase+";margin-left:auto";
      extBtn.addEventListener("click",()=>{if(isSafePreviewUrl(f.url))window.open(f.url,"_blank","noopener");});
      bar.appendChild(extBtn);
      /* ===== NoTab 原生视口接管 + CSS zoom 画布缩放同步 =====
         iframe 全屏撑满容器（width/height:100%），流式排版+原生滚动=内容完整显示；
         画布缩放同步交给 syncPvContentZoom 用 CSS zoom（布局级，不裁剪不破坏滚动） */
      const stage=document.createElement("div");
      stage.className="pv-stage";
      stage.style.cssText="position:relative;flex:1 1 0;width:100%;height:auto;min-height:0;overflow:hidden;display:flex;justify-content:flex-start;align-items:flex-start;background:#fff";
      const iframe=configureWebPreviewFrame(document.createElement("iframe"),f.url,"网页材料预览");
      let mbMode=false;
      /* 挂引用到 body，供 syncPvContentZoom 读取（zoom 缩放基准） */
      body.__pvStage=stage;body.__pvIframe=iframe;body.__pvMb=()=>mbMode;
      const layout=()=>{
        if(mbMode){
          /* 手机模式：375 逻辑宽视口，交由 syncPvContentZoom 用 zoom 等比适配 */
          iframe.style.cssText="display:block;position:relative;inset:auto;border:none;width:375px;height:100%;min-height:0;flex:none;background:#fff";
          stage.style.justifyContent="center";
        }else{
          /* PC 模式：100% 撑满（NoTab 原生视口接管） */
          iframe.style.cssText="display:block;position:absolute;inset:0;border:none;width:100%;height:100%;min-height:0;flex:none;background:#fff;zoom:1";
          stage.style.justifyContent="flex-start";
        }
        stage.style.alignItems="flex-start";
      };
      const paintDev=()=>{
        pcBtn.style.background=mbMode?"transparent":"var(--accent)";pcBtn.style.color=mbMode?"var(--ink-dim)":"#fff";
        mbBtn.style.background=mbMode?"var(--accent)":"transparent";mbBtn.style.color=mbMode?"#fff":"var(--ink-dim)";
      };
      const setPC=()=>{mbMode=false;layout();paintDev();zInput.value=Math.round((parseFloat(win.dataset.pvZoom)||1)*100);syncPvDom();};
      const setMB=()=>{mbMode=true;layout();paintDev();zInput.value=Math.round((parseFloat(win.dataset.pvZoom)||1)*100);syncPvDom();};
      layout();
      if(pv.w<380)setMB();else setPC();
      stage.appendChild(iframe);
      pcBtn.addEventListener("click",setPC);
      mbBtn.addEventListener("click",setMB);
      /* 普通预览窗已有文件名、缩放及外部打开操作；网页内容只保留一套外层栏。
         关键：工具栏和阅读区必须作为同一个 flex 容器挂载。此前只挂了 stage，
         导致其 height:auto 在普通预览中按 iframe 顶部内容收缩，卡片下半区留白。 */
      wrap.appendChild(bar);
      wrap.appendChild(stage);
      body.innerHTML="";
      body.appendChild(wrap);
      return;
    }else{
      body.innerHTML='<div class="pv-msg"><span class="big">📄</span>'+KIND_LABEL[f.kind]+' 文件<br><a href="'+url+'" target="_blank" download>下载文件</a></div>';
    }
  };
  if(f._url&&(f.kind==="img"||f.kind==="text"||f.kind==="link"||f.kind==="media"||f.kind==="other")){kick(f._url,f.kind);return;}
  if(f.kind==="link"){
    if(!isSafePreviewUrl(f.url)){body.innerHTML='<div class="pv-msg">链接地址无效，未加载预览</div>';return;}
    kick(f.url,"link");return;
  }
  body.innerHTML='<div class="pv-loading"><div class="spinner"></div>加载中…</div>';
  getBlob(pv.fileId).then(b=>{
    if(!b){body.innerHTML='<div class="pv-msg">文件不存在</div>';return;}
    if(!f._url) f._url=URL.createObjectURL(b);
    if(f.kind==="doc") renderDocx(b,body,f.name);
    else if(f.kind==="sheet") renderSheet(b,body);
    else if(f.kind==="pdf") renderPdf(b,body);
    else if(f.kind==="slide") renderPptx(b,body);
    else if(f.kind==="media") kick(f._url,"media");
    else kick(f._url,f.kind);
  }).catch(()=>{body.innerHTML='<div class="pv-msg">读取失败</div>';});
}
function removePreviewsOf(fileId){
  for(const p of state.projects){
    for(const c of p.canvases){
      c.previews=c.previews.filter(p=>p.fileId!==fileId);
    }
  }
  syncPvDom();
}
/* ============================================================
   形变预览 DOM 覆盖层：卡片形变后，在形变区域内直接渲染真实内容
   （文档/表格/PPT/PDF/视频/网页链接），复用 renderPvContent 全套能力
   —— 单一交互链路：点击附件 → 形变 → 直接预览，无独立窗口
   —— 多实例：每个展开卡片一个覆盖层（Map<cardId,{el,fileId,token}>），
       多个附件形变可同时打开，互不销毁（修复切换/聚焦时网页预览被重建白屏）
============================================================ */
const morphMap=new Map();            /* cardId -> {el,fileId,token} */
let morphToken=0;                    /* 全局令牌：任一覆盖层重建/销毁时递增，作废在途回调 */
function getMorph(cardId){return morphMap.get(String(cardId));}
function ensureMorphDom(it){
  if(!it||it.type!=="fileCard")return;
  const ex=getMorph(it.id);
  if(ex&&ex.fileId===it.fileId)return;   /* 同卡同文件已渲染，复用不重建 */
  destroyMorphDom(it.id);                /* 仅销毁该卡的旧覆盖层（若换文件） */
  const f=state.files.find(x=>x.id===it.fileId);
  if(!f)return;
  const layer=document.getElementById("previewLayer");
  if(!layer)return;
  const el=document.createElement("div");
  el.className="pv-morph";
  el.dataset.card=String(it.id);   /* dataset 恒为字符串，必须 String 化比对的基准 */
  el.dataset.pvZoom=String(it._morphPvZoom||1);
  const tools=document.createElement("div");tools.className="pv-morph-tools";
  tools.innerHTML='<span class="pv-morph-name"></span><button class="pv-morph-zo" title="缩小预览">−</button><button class="pv-morph-zoom" title="恢复 100%">100%</button><button class="pv-morph-zi" title="放大预览">+</button><button class="pv-morph-fullscreen" title="全屏预览">⤢</button><button class="pv-morph-open" title="使用电脑默认应用打开">默认打开</button><button class="pv-morph-close" title="收起预览" aria-label="收起预览">⌃</button>';
  tools.querySelector(".pv-morph-name").textContent=f.name;
  const body=document.createElement("div");body.className="pv-morph-content";
  const applyZoom=value=>{
    const zoom=clamp(value,.35,3);
    /* G7: doc 缩放全权交给 fitDocxPreview 用 CSS zoom 处理（像图片等比缩小）；
       link 用 applyEmbeddedPageZoom（在 syncMorphDom 中处理）；
       其他用 body.style.zoom 直接缩放 */
    el.dataset.pvZoom=String(zoom);
    if(f.kind==="doc"){
      body.style.zoom="1"; /* doc 不用 body zoom，由 stage zoom 统一控制 */
      el.dataset.docxFitKey="";fitDocxPreview(el);
    }else{
      body.style.zoom=f.kind==="link"?"1":(f.kind==="pdf"?String(zoom*0.7):String(zoom));
    }
    tools.querySelector(".pv-morph-zoom").textContent=Math.round(zoom*100)+"%";
    syncMorphDom();
  };
  tools.querySelector(".pv-morph-zo").addEventListener("click",e=>{e.stopPropagation();applyZoom((parseFloat(el.dataset.pvZoom)||1)-.15);});
  tools.querySelector(".pv-morph-zi").addEventListener("click",e=>{e.stopPropagation();applyZoom((parseFloat(el.dataset.pvZoom)||1)+.15);});
  tools.querySelector(".pv-morph-zoom").addEventListener("click",e=>{e.stopPropagation();applyZoom(1);});
  tools.querySelector(".pv-morph-open").addEventListener("click",e=>{e.stopPropagation();openWithExternalApp(f);});
  tools.querySelector(".pv-morph-fullscreen").addEventListener("click",e=>{
    e.stopPropagation();
    const r=el.getBoundingClientRect();
    openFullscreen(f,{originRect:{left:r.left,top:r.top,width:r.width,height:r.height}});
  });
  tools.querySelector(".pv-morph-close").addEventListener("click",e=>{e.stopPropagation();togglePreviewMorph(it);});
  /* 标题栏既是选中区也是拖拽把手；正文仍完整留给网页、PDF、Word 等原生操作。 */
  tools.addEventListener("pointerdown",e=>{
    if(e.button!==0||e.target.closest("button"))return;
    /* Ctrl/Cmd+click handled by el capture handler above */
    if(e.ctrlKey||e.metaKey)return;
    e.preventDefault();e.stopPropagation();
    if(state.selected!==it.id||state.multiSel.length!==1||state.multiSel[0]!==it.id){
      state.selected=it.id;state.multiSel=[it.id];requestRender();
    }
    const startX=e.clientX,startY=e.clientY,startItemX=it.x,startItemY=it.y,startZoom=state.camera.zoom;
    let moved=false;
    const move=ev=>{
      const dx=(ev.clientX-startX)/startZoom,dy=(ev.clientY-startY)/startZoom;
      if(!moved&&Math.hypot(dx,dy)<1.5)return;
      if(!moved){pushHistory("移动附件");moved=true;}
      it.x=startItemX+dx;it.y=startItemY+dy;
      syncMorphDom();requestRender();
    };
    const end=ev=>{
      tools.removeEventListener("pointermove",move);tools.removeEventListener("pointerup",end);tools.removeEventListener("pointercancel",end);
      if(tools.hasPointerCapture&&tools.hasPointerCapture(ev.pointerId))tools.releasePointerCapture(ev.pointerId);
      if(moved){saveState();requestRender();}
    };
    tools.setPointerCapture(e.pointerId);
    tools.addEventListener("pointermove",move);tools.addEventListener("pointerup",end);tools.addEventListener("pointercancel",end);
  });
  el.appendChild(tools);el.appendChild(body);
  layer.appendChild(el);
  /* Ctrl/Cmd+click 在此（capture 阶段，最高优先级）统一处理多选+自动连接，
     无论点击落在标题栏、内容区还是边缘。非 Ctrl 时仅边缘 8px 做选中。 */
  el.addEventListener("pointerdown",e=>{
    if(e.ctrlKey||e.metaKey){
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      var idx=state.multiSel.indexOf(it.id);
      if(idx>=0){
        var parentId=state.multiSel[0];
        if(idx>0&&parentId){
          var exist=state.links.find(function(l){return(l.aId===parentId&&l.bId===it.id)||(l.aId===it.id&&l.bId===parentId);});
          if(exist){pushHistory("断开连接");state.links=state.links.filter(function(l){return l!==exist;});toast("已断开连接");}
        }
        state.multiSel.splice(idx,1);
        render();saveState();return;
      }
      state.multiSel.push(it.id);state.selected=it.id;
      if(state.multiSel.length>=2){
        var pid=state.multiSel[0];
        var ex2=state.links.find(function(l){return(l.aId===pid&&l.bId===it.id)||(l.aId===it.id&&l.bId===pid);});
        if(!ex2){
          pushHistory("自动连接");
          state.links.push({id:"lnk"+(uid++),aId:pid,bId:it.id,annotation:"",relationType:"related",directional:false});
          toast("已连接（Ctrl+点击可继续添加）");
        }
      }
      render();saveState();return;
    }
    var r=el.getBoundingClientRect();
    var edge=8;
    var onEdge=e.clientX-r.left<=edge||r.right-e.clientX<=edge||e.clientY-r.top<=edge||r.bottom-e.clientY<=edge;
    if(!onEdge)return;
    e.preventDefault();e.stopPropagation();
    if(state.selected!==it.id||state.multiSel.length!==1||state.multiSel[0]!==it.id){
      state.selected=it.id;state.multiSel=[it.id];render();
    }
  },true);
  const token=++morphToken;
  morphMap.set(String(it.id),{el,body,fileId:it.fileId,token});
  if(it._morphPvZoom&&it._morphPvZoom!==1){var _sz=parseFloat(it._morphPvZoom);if(_sz>=.35&&_sz<=3){el.dataset.pvZoom=String(_sz);if(f.kind!=="link"&&f.kind!=="doc"){body.style.zoom=String(_sz);}tools.querySelector(".pv-morph-zoom").textContent=Math.round(_sz*100)+"%";}}
  /* 过期检查：此回调执行时该卡已被关闭/替换则丢弃 */
  const stale=()=>{const m=getMorph(it.id);return !m||m.el!==el||m.token!==token;};
  body.innerHTML='<div class="pv-loading"><div class="spinner"></div>加载中…</div>';
  if(f.kind==="link"){
    if(!isSafePreviewUrl(f.url)){body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>链接地址无效，未加载预览</div>';return;}
    kickMorph(el,f.url,"link");
  }else{
    /* G7: getBlob 的 catch 兜底 + 所有 async 渲染函数加 .catch 防止 unhandled rejection */
    getBlob(it.fileId).then(b=>{
      if(stale())return;
      if(!b){if(stale())return;body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>文件不存在<br><a download>重新导入后再试</a></div>';return;}
      if(!f._url)f._url=URL.createObjectURL(b);
      try{
        var p;
        if(f.kind==="doc")p=renderDocx(b,body,f.name);
        else if(f.kind==="sheet")p=renderSheet(b,body);
        else if(f.kind==="pdf")p=renderPdf(b,body);
        else if(f.kind==="slide")p=renderPptx(b,body);
        else if(f.kind==="media")kickMorph(el,f._url,"media");
        else if(f.kind==="text"||f.kind==="code"||/\.(md|txt|csv|json|log)$/i.test(f.name)){
          kickTextBlob(b,it.id);
        }
        else if(/\.svg$/i.test(f.name)){
          /* G3: SVG 用 <object> 渲染（<img> 对 SVG blob 有兼容性问题） */
          const wrap=document.createElement("div");
          wrap.className="morph-fit";
          wrap.style.cssText="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:auto";
          const obj=document.createElement("object");
          obj.data=f._url;obj.type="image/svg+xml";
          obj.style.cssText="max-width:100%;max-height:100%;width:auto;height:auto";
          obj.onerror=()=>{if(!stale())body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>SVG 加载失败</div>';};
          wrap.appendChild(obj);body.innerHTML="";body.appendChild(wrap);
        }
        else kickMorph(el,f._url,f.kind);
      }catch(e){
        if(stale())return;
        body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>渲染异常：'+escapeHtml(String(e.message||e).slice(0,60))+'<br><a download>下载文件查看</a></div>';
      }
      /* G7: async 渲染函数（docx/sheet/pdf/pptx）的 rejection 兜底，
         防止 unhandled rejection 污染全局状态导致连锁故障 */
      if(p&&typeof p.then==="function")p.catch(function(e){
        if(stale())return;
        console.warn("async render failed:",e);
        body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>预览加载失败：'+escapeHtml(String(e&&e.message||e).slice(0,60))+'<br><a download>下载文件查看</a></div>';
      });
    }).catch(()=>{
      if(stale())return;
      body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>读取失败<br><a download>下载文件查看</a></div>';
    });
  }
}
/* ============================================================
   Markdown → HTML 渲染器（轻量、无外部依赖、防 XSS）
   支持：标题/粗斜/删除线/下划线/行内代码/代码块/列表(有序无序)/
        表格/引用/分隔线/任务清单/链接/图片
   供 Markdown 附件（.md/.markdown）形变预览与全屏预览使用
============================================================ */
/* 行内元素：粗体/斜体/删除线/下划线/行内代码/链接 */
function mdInline(src){
  let s=escapeHtml(src);
  /* 行内代码（先转义保护，避免后面的规则破坏代码内容） */
  s=s.replace(/`([^`]+)`/g,(m,c)=>'<code class="md-code">'+c+'</code>');
  /* 粗体 **x** / __x__ */
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>');
  /* 斜体 *x* / _x_（避免误伤普通文本，要求两侧非字母数字） */
  s=s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>');
  s=s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g,'$1<em>$2</em>');
  /* 删除线 ~~x~~ */
  s=s.replace(/~~([^~]+)~~/g,'<del>$1</del>');
  /* 下划线 +u+ 语法（Typora 风格扩展） */
  s=s.replace(/\+\+([^+]+)\+\+/g,'<u>$1</u>');
  /* 链接 [text](url) */
  s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}
/* 完整 Markdown → HTML（分块解析） */
function mdToHtml(src){
  if(!src)return "";
  const lines=String(src).replace(/\r\n/g,"\n").split("\n");
  const out=[];
  let i=0;
  const flushList=()=>{if(listStack.length){for(let k=listStack.length-1;k>=0;k--)out.push(listStack[k].close);listStack.length=0;}};
  const listStack=[];
  while(i<lines.length){
    const raw=lines[i];
    const line=raw.trim();
    /* 代码块 ```lang */
    if(/^```/.test(line)){
      flushList();
      const buf=[];
      i++;
      while(i<lines.length&&!/^```/.test(lines[i].trim())){buf.push(lines[i]);i++;}
      i++; /* 跳过收尾 ``` */
      out.push('<pre class="md-pre"><code class="md-code">'+escapeHtml(buf.join("\n"))+'</code></pre>');
      continue;
    }
    /* 标题 */
    const h=line.match(/^(#{1,6})\s+(.*)$/);
    if(h){flushList();const n=h[1].length;out.push('<h'+n+' class="md-h md-h'+n+'">'+mdInline(h[2])+'</h'+n+'>');i++;continue;}
    /* 分隔线 */
    if(/^(\s*[-*_]\s*){3,}$/.test(line)){flushList();out.push('<hr class="md-hr">');i++;continue;}
    /* 引用 */
    if(/^>\s?/.test(line)){
      flushList();
      const buf=[];
      while(i<lines.length&&/^>\s?/.test(lines[i])){buf.push(lines[i].replace(/^>\s?/,""));i++;}
      out.push('<blockquote class="md-quote">'+mdInline(buf.join("<br>"))+'</blockquote>');
      continue;
    }
    /* 表格（当前行为表头，下一行为分隔 |---|） */
    if(/^\|.+\|$/.test(line)&&i+1<lines.length&&/^\|[\s:|-]+\|$/.test(lines[i+1].trim())){
      flushList();
      const headerCells=line.split("|").slice(1,-1).map(x=>x.trim());
      i+=2;
      const rows=[];
      while(i<lines.length&&/^\|.+\|$/.test(lines[i].trim())){
        rows.push(lines[i].split("|").slice(1,-1).map(x=>x.trim()));
        i++;
      }
      let th=headerCells.map(c=>'<th class="md-th">'+mdInline(c)+'</th>').join("");
      let tb=rows.map(r=>'<tr class="md-tr">'+r.map(c=>'<td class="md-td">'+mdInline(c)+'</td>').join("")+'</tr>').join("");
      out.push('<div class="md-table-wrap"><table class="md-table"><thead class="md-thead"><tr class="md-tr">'+th+'</tr></thead><tbody class="md-tbody">'+tb+'</tbody></table></div>');
      continue;
    }
    /* 任务清单 - [x] / - [ ] */
    const task=line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if(task){
      const checked=task[1].toLowerCase()==="x";
      out.push('<div class="md-task'+(checked?' done':'')+'"><label class="md-task-label"><input type="checkbox"'+(checked?' checked':'')+' disabled><span>'+mdInline(task[2])+'</span></label></div>');
      i++;continue;
    }
    /* 无序列表 */
    const ul=line.match(/^\s*[-*+]\s+(.*)$/);
    if(ul){
      if(!listStack.length||listStack[listStack.length-1].type!=="ul"){flushList();listStack.push({type:"ul",close:"</ul>",open:'<ul class="md-ul">'});out.push(listStack[listStack.length-1].open);}
      out.push('<li class="md-li">'+mdInline(ul[1])+'</li>');
      i++;continue;
    }
    /* 有序列表 */
    const ol=line.match(/^\s*\d+\.\s+(.*)$/);
    if(ol){
      if(!listStack.length||listStack[listStack.length-1].type!=="ol"){flushList();listStack.push({type:"ol",close:"</ol>",open:'<ol class="md-ol">'});out.push(listStack[listStack.length-1].open);}
      out.push('<li class="md-li">'+mdInline(ol[1])+'</li>');
      i++;continue;
    }
    /* 空行→段分隔 */
    if(!line){flushList();out.push('<div class="md-gap"></div>');i++;continue;}
    /* 普通段落（合并连续行） */
    flushList();
    const buf=[line];
    i++;
    while(i<lines.length&&lines[i].trim()&&!/^(#{1,6}\s|```|>|\||[-*+]\s|\d+\.\s)/.test(lines[i].trim())){
      buf.push(lines[i].trim());i++;
    }
    out.push('<p class="md-p">'+mdInline(buf.join(" "))+'</p>');
  }
  flushList();
  return out.join("\n");
}
/* Markdown DOM 渲染（供形变覆盖层 / 全屏预览使用） */
function renderMdDom(text,container){
  container.innerHTML='<div class="md-body">'+mdToHtml(text)+'</div>';
  return container;
}
/* ============================================================
   全屏预览：为展开的 Markdown 元素及各类文件提供全屏查看。
   —— 放大至占屏幕主要区域（left/top 4%，非全铺满，保留留白与层级）
   —— 顶部工具栏：文件名 + 退出全屏按钮（Esc 或点击按钮退出）
   —— 支持：Markdown 完整渲染 / 图片 / 视频播放 / 文本 / 网页 iframe / 其他下载
============================================================ */
let fullscreenToken=0;
let fullscreenFile=null,fullscreenZoom=1;
let fullscreenOriginRect=null;  /* C12: FLIP 过渡源位置（morph 卡片屏幕矩形） */
let fullscreenTabs=[],fullscreenActiveTabId=null,fullscreenCloseTimer=0;
const fullscreenDismissedTabIds=new Set();
function fullscreenTabId(fileId){return "file:"+String(fileId);}
function rememberFullscreenFile(f,force=false){
  if(!f)return;
  const id=fullscreenTabId(f.id);
  if(force)fullscreenDismissedTabIds.delete(id);
  else if(fullscreenDismissedTabIds.has(id))return;
  const old=fullscreenTabs.find(tab=>tab.id===id);
  if(old){old.title=f.name||"未命名附件";old.kind=f.kind||"other";return old;}
  const tab={id,fileId:f.id,title:f.name||"未命名附件",kind:f.kind||"other"};
  fullscreenTabs.push(tab);
  return tab;
}
function rememberOpenAttachmentPreviews(activeFile){
  const ids=[];
  for(const pv of state.previews||[])if(pv&&pv.fileId)ids.push(pv.fileId);
  for(const item of state.items||[])if(item&&item.type==="fileCard"&&item.previewOpen&&item.fileId)ids.push(item.fileId);
  for(const id of ids){const f=state.files.find(file=>file.id===id);if(f)rememberFullscreenFile(f,false);}
  rememberFullscreenFile(activeFile,true);
  fullscreenTabs=fullscreenTabs.filter(tab=>state.files.some(file=>file.id===tab.fileId));
}
function renderFullscreenTabs(){
  const host=document.getElementById("fvTabs");
  if(!host)return;
  host.innerHTML="";
  host.classList.toggle("empty",fullscreenTabs.length===0);
  for(const tab of fullscreenTabs){
    const f=state.files.find(file=>file.id===tab.fileId);
    if(!f)continue;
    const shell=document.createElement("div");
    shell.className="fv-tab";
    shell.setAttribute("role","presentation");
    shell.setAttribute("aria-selected",String(tab.id===fullscreenActiveTabId));
    const main=document.createElement("button");
    main.type="button";main.className="fv-tab-main";main.setAttribute("role","tab");
    main.setAttribute("aria-selected",String(tab.id===fullscreenActiveTabId));
    main.title=tab.title;
    const icon=document.createElement("span");icon.className="fv-tab-icon";icon.setAttribute("aria-hidden","true");
    icon.innerHTML=(FILE_ICONS[tab.kind]||FILE_ICONS.other||ICON.view);
    const name=document.createElement("span");name.className="fv-tab-name";name.textContent=tab.title;
    main.appendChild(icon);main.appendChild(name);
    main.addEventListener("click",()=>openFullscreen(tab.fileId,{fromTab:true}));
    const close=document.createElement("button");
    close.type="button";close.className="fv-tab-close";close.title="关闭此附件";close.setAttribute("aria-label","关闭 "+tab.title);close.innerHTML=ICON.close;
    close.addEventListener("click",()=>closeFullscreenTab(tab.id));
    shell.appendChild(main);shell.appendChild(close);host.appendChild(shell);
  }
  const current=host.querySelector('.fv-tab[aria-selected="true"]');
  if(current)requestAnimationFrame(()=>current.scrollIntoView({block:"nearest",inline:"nearest"}));
}
function closeFullscreenTab(tabId){
  const index=fullscreenTabs.findIndex(tab=>tab.id===tabId);
  if(index<0)return;
  const wasActive=fullscreenActiveTabId===tabId;
  fullscreenDismissedTabIds.add(tabId);
  fullscreenTabs.splice(index,1);
  if(!wasActive){renderFullscreenTabs();return;}
  const next=fullscreenTabs[Math.min(index,fullscreenTabs.length-1)];
  if(next){const f=state.files.find(file=>file.id===next.fileId);if(f){openFullscreen(f,{fromTab:true});return;}}
  fullscreenActiveTabId=null;renderFullscreenTabs();closeFullscreen();
}
function fullscreenControls(){return document.getElementById("fullscreenTopControls");}
function applyFullscreenZoom(value){
  const fv=document.getElementById("fullscreenView"),body=fv&&fv.querySelector(".fv-body"),controls=fullscreenControls(),val=controls&&controls.querySelector(".fv-zoom-val");
  fullscreenZoom=clamp(value,.35,3);
  if(body)body.style.setProperty("--fv-content-zoom",String(fullscreenZoom));
  if(val)val.textContent=Math.round(fullscreenZoom*100)+"%";
}
/* C12: 获取 fileCard 的屏幕矩形，用于 FLIP 过渡（morph 覆盖层或画布卡片位置） */
function getFileCardOriginRect(it){
  if(!it||it.type!=="fileCard")return null;
  if(it.previewOpen){
    const morphEl=document.querySelector('.pv-morph[data-card="'+String(it.id)+'"]');
    if(morphEl){const r=morphEl.getBoundingClientRect();if(r.width>0&&r.height>0)return {left:r.left,top:r.top,width:r.width,height:r.height};}
  }
  const b=itemBounds(it);if(!b)return null;
  const z=state.camera.zoom;
  const tl=w2s(b.x,b.y);
  return {left:tl.x,top:tl.y,width:Math.max(20,b.w*z),height:Math.max(20,b.h*z)};
}
function openFullscreen(fileIdOrItem,options={}){
  const f=typeof fileIdOrItem==="object"?fileIdOrItem:state.files.find(x=>x.id===fileIdOrItem);
  if(!f)return;
  const fv=document.getElementById("fullscreenView");
  const controls=fullscreenControls();
  const body=fv.querySelector(".fv-body");
  const title=controls&&controls.querySelector(".fv-title");
  fv.classList.remove("editor-view");
  controls&&controls.querySelectorAll(".fv-mode").forEach(button=>button.classList.add("hidden"));
  controls&&controls.querySelector(".fv-file-tools").classList.remove("hidden");
  body.classList.remove("markdown-only");body.classList.add("file-preview");
  if(fullscreenCloseTimer){clearTimeout(fullscreenCloseTimer);fullscreenCloseTimer=0;}
  rememberOpenAttachmentPreviews(f);
  fullscreenActiveTabId=fullscreenTabId(f.id);
  renderFullscreenTabs();
  fullscreenFile=f;applyFullscreenZoom(1);
  const myToken=++fullscreenToken;
  title.textContent=f.name+"  /  "+ (KIND_LABEL[f.kind]||"文件");
  body.innerHTML='<div class="pv-loading"><div class="spinner"></div>加载中…</div>';
  document.body.classList.add("fullscreen-active");
  fv.classList.remove("closing");
  fv.hidden=false;
  layoutFullscreen();
  /* C11: layout toggle button */
  if(!document.getElementById("fullscreenTopControls").querySelector(".fv-layout-toggle")){
    var lt=document.createElement("button");
    lt.type="button";lt.className="fv-layout-toggle";
    lt.title="切换标签页布局";
    lt.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="11" rx="1"/></svg>';
    lt.addEventListener("click",function(){
      document.getElementById("fullscreenTopControls").classList.toggle("fv-vertical-controls");
      lt.innerHTML=document.getElementById("fullscreenTopControls").classList.contains("fv-vertical-controls")?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="11" height="18" rx="1"/></svg>':'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="11" rx="1"/></svg>';
    });
    var ctrls=document.getElementById("fullscreenTopControls");
    if(ctrls){var fc=ctrls.querySelector(".fv-close");if(fc)ctrls.insertBefore(lt,fc);}
  }
  /* C12: FLIP 过渡 — 从 morph 卡片位置展开到全屏，或右侧滑入 */
  if(fullscreenToken===myToken){
    if(options.originRect){
      fullscreenOriginRect=options.originRect;
      const fvRect=fv.getBoundingClientRect();
      var flipSx=options.originRect.width/fvRect.width;
      var flipSy=options.originRect.height/fvRect.height;
      var flipTx=options.originRect.left-fvRect.left;
      var flipTy=options.originRect.top-fvRect.top;
      fv.style.transition="none";
      fv.style.transformOrigin="top left";
      fv.style.transform="translate("+flipTx+"px,"+flipTy+"px) scale("+flipSx+","+flipSy+")";
      fv.style.opacity="0";
      fv.offsetHeight;  /* force reflow */
      requestAnimationFrame(function(){
        fv.style.transition="";
        fv.style.transform="";
        fv.style.opacity="";
        fv.classList.add("open");
      });
    }else{
      fullscreenOriginRect=null;
      requestAnimationFrame(()=>{fv.classList.add("open");});
    }
  }
  const render=()=>{
    if(fullscreenToken!==myToken)return;
    body.innerHTML="";
    if(f.kind==="link"){
      if(!isSafePreviewUrl(f.url)){body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>链接地址无效<br><a href="'+escapeHtml(f.url)+'" target="_blank" rel="noopener">在新窗口打开</a></div>';return;}
      if(rejectsEmbeddedPreview(f.url)){renderWebEmbedFallback(body,f.url,f.name);return;}
      const iframe=configureWebPreviewFrame(document.createElement("iframe"),f.url,"网页全屏预览");
      iframe.onerror=()=>{if(fullscreenToken===myToken)body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>链接加载失败<br><a href="'+escapeHtml(f.url)+'" target="_blank" rel="noopener">在新窗口打开</a></div>';};
      body.appendChild(iframe);
      return;
    }
    if(f.kind==="img"){
      getBlob(f.id).then(b=>{
        if(fullscreenToken!==myToken)return;
        if(!b){body.innerHTML='<div class="pv-msg">文件不存在</div>';return;}
        const url=f._url||URL.createObjectURL(b);if(!f._url)f._url=url;
        if(/\.svg$/i.test(f.name)){
          /* G3: SVG 用 <object> 渲染 */
          body.innerHTML='<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:auto"><object data="'+url+'" type="image/svg+xml" style="max-width:100%;max-height:100%"></object></div>';
        }else{
          body.innerHTML='<img src="'+url+'" alt="'+escapeHtml(f.name)+'">';
        }
      }).catch(()=>{if(fullscreenToken===myToken)body.innerHTML='<div class="pv-msg">图片读取失败</div>';});
      return;
    }
    if(f.kind==="media"&&/video/i.test(f.mime||"")){
      getBlob(f.id).then(b=>{
        if(fullscreenToken!==myToken)return;
        if(!b){body.innerHTML='<div class="pv-msg">文件不存在</div>';return;}
        const url=f._url||URL.createObjectURL(b);if(!f._url)f._url=url;
        const v=document.createElement("video");
        v.src=url;v.controls=true;v.autoplay=false;v.preload="auto";v.referrerPolicy="no-referrer-when-downgrade";
        v.style.cssText="width:100%;height:100%;max-height:calc(100vh - 120px);object-fit:contain;background:#000";
        body.appendChild(v);
      }).catch(()=>{if(fullscreenToken===myToken)body.innerHTML='<div class="pv-msg">视频读取失败</div>';});
      return;
    }
    if(/\.(md|markdown)$/i.test(f.name)||f.kind==="text"||f.kind==="code"||/\.(txt|csv|json|log)$/i.test(f.name)){
      getBlob(f.id).then(b=>{
        if(fullscreenToken!==myToken)return;
        if(!b){body.innerHTML='<div class="pv-msg">文件不存在</div>';return;}
        b.text().then(t=>{
          if(fullscreenToken!==myToken)return;
          // Markdown 文件：全量渲染（不受 canvas 4000 字符截断限制）
          if(/\.(md|markdown)$/i.test(f.name)){
            const box=document.createElement("div");
            box.className="pv-md-wrap";
            renderMdDom(t,box);
            body.appendChild(box);
          }else{
            const pre=document.createElement("pre");
            pre.className="pv-text";
            pre.textContent=t;
            body.appendChild(pre);
          }
        });
      }).catch(()=>{if(fullscreenToken===myToken)body.innerHTML='<div class="pv-msg">文本读取失败</div>';});
      return;
    }
    if(f.kind==="doc"||f.kind==="sheet"||f.kind==="pdf"||f.kind==="slide"){
      getBlob(f.id).then(b=>{
        if(fullscreenToken!==myToken)return;
        if(!b){body.innerHTML='<div class="pv-msg">文件不存在</div>';return;}
        if(!f._url)f._url=URL.createObjectURL(b);
        if(f.kind==="doc")renderDocx(b,body,f.name);
        else if(f.kind==="sheet")renderSheet(b,body);
        else if(f.kind==="pdf")renderPdf(b,body);
        else if(f.kind==="slide")renderPptx(b,body);
      }).catch(()=>{if(fullscreenToken===myToken)body.innerHTML='<div class="pv-msg">文件读取失败</div>';});
      return;
    }
    body.innerHTML='<div class="pv-msg"><span class="big">📄</span>'+escapeHtml(f.name||"文件")+'<br><a href="'+(f._url||"#")+'" download>下载文件查看</a><br><span style="color:var(--ink-faint);font-size:10px">该格式暂不支持在线全屏预览</span></div>';
  };
  render();
}
/* 全屏工作区固定铺满顶栏以下区域；进入时侧栏由 fullscreen-active 自动退场。 */
function layoutFullscreen(){
  const fv=document.getElementById("fullscreenView");
  if(!fv||fv.hidden)return;
  fv.style.left="";fv.style.top="";fv.style.right="";fv.style.bottom="";
}
function closeFullscreen(){
  fullscreenToken++;
  /* I8-fix: 显式 blur 全屏编辑器 textarea，否则 isTyping() 仍返回 true 导致快捷键失效 */
  if(fvEditorState&&fvEditorState.src)fvEditorState.src.blur();
  fvEditorState=null;
  const fv=document.getElementById("fullscreenView");
  if(fv){
    fv.classList.remove("open");
    /* C12: FLIP 退出 — 收缩回 morph 卡片位置 */
    if(fullscreenOriginRect){
      const fvRect=fv.getBoundingClientRect();
      var flipSx=fullscreenOriginRect.width/fvRect.width;
      var flipSy=fullscreenOriginRect.height/fvRect.height;
      var flipTx=fullscreenOriginRect.left-fvRect.left;
      var flipTy=fullscreenOriginRect.top-fvRect.top;
      fv.style.transition="opacity .2s ease, transform .32s var(--ease-snap)";
      fv.style.transformOrigin="top left";
      fv.style.transform="translate("+flipTx+"px,"+flipTy+"px) scale("+flipSx+","+flipSy+")";
      fv.style.opacity="0";
    }else{
      fv.classList.add("closing");
    }
    const finish=()=>{
      fv.hidden=true;
      fv.classList.remove("closing","editor-view");
      fv.style.transition="";fv.style.transform="";fv.style.transformOrigin="";fv.style.opacity="";
      const body=fv.querySelector(".fv-body");body.innerHTML="";body.classList.remove("file-preview","markdown-only");body.style.removeProperty("--fv-content-zoom");
      document.body.classList.remove("fullscreen-active");fullscreenCloseTimer=0;
    };
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)finish();
    else fullscreenCloseTimer=setTimeout(finish,330);
  }
  fullscreenFile=null;fullscreenZoom=1;
  fullscreenOriginRect=null;
}
/* 便签全屏预览（内容按 Markdown 完整渲染）—— 升级为 Typora 式双模式编辑器 */
function openFullscreenNote(note){
  return openMdFullscreenEditor({
    title:(note.text?note.text.replace(/\n.*$/s,"").slice(0,32):"便签")+" · 便签编辑",
    initial:note.text||"",
    onSave:v=>{if(note){pushHistory("编辑便签");note.text=v;render();saveState();}}
  });
}
/* ============================================================
   Typora 式全屏 Markdown 编辑器
   —— 编辑/预览/分屏 三模式切换，实时所见即所得
   —— 保留各类功能框（代码块/引用/表格/图片/链接）的工具栏插入
   —— 粘贴 Markdown 文本自动渲染（输入即渲染）
============================================================ */
let fvEditorState=null;   /* {src,onSave,mode} */
function openMdFullscreenEditor(opt){
  const fv=document.getElementById("fullscreenView");
  const controls=fullscreenControls();
  const body=fv.querySelector(".fv-body");
  const title=controls&&controls.querySelector(".fv-title");
  const modes=controls?controls.querySelectorAll(".fv-mode"):[];
  if(!fv||!body)return;
  if(fullscreenCloseTimer){clearTimeout(fullscreenCloseTimer);fullscreenCloseTimer=0;}
  const myToken=++fullscreenToken;
  fv.classList.add("editor-view");
  fullscreenActiveTabId=null;renderFullscreenTabs();
  title.textContent=opt.title||"Markdown 编辑";
  /* 隐藏非编辑器模式按钮：仅 Markdown 内容显示编辑/预览/分屏 */
  modes.forEach(b=>b.classList.toggle("hidden",false));
  controls&&controls.querySelector(".fv-file-tools").classList.add("hidden");
  fullscreenFile=null;body.classList.remove("file-preview");body.style.removeProperty("--fv-content-zoom");
  body.innerHTML="";
  body.classList.add("markdown-only");
  /* —— 编辑器骨架 —— */
  const ed=document.createElement("div");ed.className="fv-md-editor";
  const tb=document.createElement("div");tb.className="fv-md-toolbar";
  const main=document.createElement("div");main.className="fv-md-main";
  const ta=document.createElement("textarea");ta.className="fv-md-src";ta.spellcheck=false;
  ta.placeholder="输入 Markdown…（实时预览）";
  ta.value=opt.initial||"";
  const prev=document.createElement("div");prev.className="fv-md-prev";
  main.appendChild(ta);main.appendChild(prev);
  ed.appendChild(tb);ed.appendChild(main);
  body.appendChild(ed);
  /* —— 工具栏（T ypora 常用格式）—— */
  const tool=(label,title,fn)=>{const b=document.createElement("button");b.textContent=label;b.title=title;b.addEventListener("click",()=>{ta.focus();fn();sync();});tb.appendChild(b);return b;};
  const tsep=()=>{const s=document.createElement("span");s.className="sep";tb.appendChild(s);};
  /* 包装选中文本 */
  const wrap=(b,a)=>{const s=ta.selectionStart,e2=ta.selectionEnd,sel=ta.value.slice(s,e2)||b;ta.value=ta.value.slice(0,s)+b+sel+a+ta.value.slice(e2);const ns=s+b.length;ta.setSelectionRange(ns,ns+sel.length);};
  /* 行前加前缀 */
  const prefix=(p)=>{const s=ta.selectionStart;const ls=ta.value.lastIndexOf("\n",s-1)+1;const l=ta.value.slice(ls);const nl=l.startsWith(p)?l.slice(p.length):p+l;ta.value=ta.value.slice(0,ls)+nl+ta.value.slice(ls+l.length);};
  tool("𝐁","加粗",()=>wrap("**","**"));
  tool("𝐼","斜体",()=>wrap("*","*"));
  tool("S̶","删除线",()=>wrap("~~","~~"));
  tool("U","下划线",()=>wrap("++","++"));
  tool("`","行内代码",()=>wrap("`","`"));
  tsep();
  tool("H1","标题",()=>{const s=ta.selectionStart;const ls=ta.value.lastIndexOf("\n",s-1)+1;ta.value=ta.value.slice(0,ls)+"# "+ta.value.slice(ls);});
  tool("•","无序列表",()=>prefix("- "));
  tool("1.","有序列表",()=>prefix("1. "));
  tool("☑","待办",()=>prefix("- [ ] "));
  tsep();
  tool("❝","引用",()=>prefix("> "));
  tool("▦","表格",()=>{const s=ta.selectionStart;ta.value=ta.value.slice(0,s)+"\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n"+ta.value.slice(s);});
  tool("📎","链接",()=>wrap("[","](https://)"));
  tool("🖼","图片",()=>wrap("![","](https://)"));
  tool("```","代码块",()=>{const s=ta.selectionStart;ta.value=ta.value.slice(0,s)+"\n```\n"+ta.value.slice(s)+"\n```\n";});
  tool("—","分割线",()=>{const s=ta.selectionStart;ta.value=ta.value.slice(0,s)+"\n---\n"+ta.value.slice(s);});
  /* —— 渲染同步：输入/粘贴即渲染（所见即所得） —— */
  const renderPreview=()=>{prev.innerHTML='<div class="md-body">'+mdToHtml(ta.value)+'</div>';prev.scrollTop=prev.scrollTop;};
  let syncT=0;
  const sync=()=>{if(syncT)clearTimeout(syncT);syncT=setTimeout(renderPreview,60);};
  ta.addEventListener("input",sync);
  ta.addEventListener("paste",()=>setTimeout(sync,30));   /* 粘贴后稍等再渲染 */
  /* —— 模式切换：编辑 / 预览 / 分屏 —— */
  const setMode=m=>{
    fvEditorState&&(fvEditorState.mode=m);
    modes.forEach(b=>b.classList.toggle("on",b.dataset.mode===m));
    if(m==="edit"){main.classList.remove("split");ta.style.display="";prev.style.display="none";}
    else if(m==="preview"){main.classList.remove("split");ta.style.display="none";prev.style.display="";renderPreview();}
    else{main.classList.add("split");ta.style.display="";prev.style.display="";renderPreview();}
  };
  modes.forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
  setMode("split");   /* 默认分屏：编辑+预览同步可见 */
  fvEditorState={src:ta,onSave:opt.onSave||null,mode:"split"};
  renderPreview();
  /* —— 保存（未显式保存也保留；Esc 退出同样写回） —— */
  const save=()=>{if(fvEditorState&&fvEditorState.onSave)fvEditorState.onSave(ta.value);};
  /* 保存按钮放工具栏尾 */
  const saveBtn=document.createElement("button");saveBtn.className="fv-save";saveBtn.textContent="💾 保存";saveBtn.style.cssText="margin-left:auto;background:var(--accent);color:#fff;border-radius:var(--radius-full);padding:0 14px;height:26px;border:none;font-weight:700;cursor:pointer";
  saveBtn.addEventListener("click",()=>{save();toast("已保存");});
  tb.appendChild(saveBtn);
  document.body.classList.add("fullscreen-active");
  fv.classList.remove("closing");fv.hidden=false;
  layoutFullscreen();
  /* C11: layout toggle button */
  if(!document.getElementById("fullscreenTopControls").querySelector(".fv-layout-toggle")){
    var lt=document.createElement("button");
    lt.type="button";lt.className="fv-layout-toggle";
    lt.title="切换标签页布局";
    lt.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="11" rx="1"/></svg>';
    lt.addEventListener("click",function(){
      document.getElementById("fullscreenTopControls").classList.toggle("fv-vertical-controls");
      lt.innerHTML=document.getElementById("fullscreenTopControls").classList.contains("fv-vertical-controls")?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="11" height="18" rx="1"/></svg>':'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="11" rx="1"/></svg>';
    });
    var ctrls=document.getElementById("fullscreenTopControls");
    if(ctrls){var fc=ctrls.querySelector(".fv-close");if(fc)ctrls.insertBefore(lt,fc);}
  }
  if(fullscreenToken===myToken)requestAnimationFrame(()=>{fv.classList.add("open");ta.focus();});
  return {save};
}
/* 展开内容（节点 detail）全屏 Markdown 编辑 */
function openDetailFullscreen(it){
  return openMdFullscreenEditor({
    title:((it.text||"节点").slice(0,24))+" · 展开内容编辑",
    initial:it.detail||"",
    onSave:v=>{if(it){pushHistory("编辑展开内容");it.detail=v;render();saveState();}}
  });
}
/* ============================================================
   沉浸模式：一键隐藏侧栏/顶栏/下Dock/状态栏，只留画布专注浏览编辑
   —— 进入/退出通过 F11 或下 Dock 按钮切换；退出自动恢复布局
============================================================ */
function toggleImmersive(){
  const on=document.body.classList.toggle("immersive");
  if(on){
    /* 进入：先收起侧栏浮出态与选中条，避免残留浮层 */
    if(state.sideCollapsed)sidePanel.classList.remove("peek");
    toast("沉浸模式：已隐藏辅助元素（F11 退出）");
  }else{
    toast("已退出沉浸模式");
  }
  /* 全屏编辑器/预览层在沉浸态下全屏容纳，退出时恢复原定位 */
  const fv=document.getElementById("fullscreenView");
  if(fv&&!fv.hidden){layoutFullscreen();requestAnimationFrame(resize);}
  setTimeout(resize,60);
  requestAnimationFrame(()=>{render();});
  saveState();
  return on;
}
document.getElementById("immersiveExitBtn").addEventListener("click",()=>{if(document.body.classList.contains("immersive"))toggleImmersive();});
/* 关闭按钮 + Esc 快捷键（Esc 需在全局 keydown 统一处理，此处单独补绑） */
(function bindFullscreen(){
  const controls=fullscreenControls();
  if(!controls)return;
  controls.querySelector(".fv-close").addEventListener("click",closeFullscreen);
  controls.querySelector(".fv-zoom-out").addEventListener("click",()=>applyFullscreenZoom(fullscreenZoom-.15));
  controls.querySelector(".fv-zoom-in").addEventListener("click",()=>applyFullscreenZoom(fullscreenZoom+.15));
  controls.querySelector(".fv-zoom-val").addEventListener("click",()=>applyFullscreenZoom(1));
  controls.querySelector(".fv-open-default").addEventListener("click",()=>{if(fullscreenFile)openWithExternalApp(fullscreenFile);});
})();
/* 形变覆盖层的渲染（复用 renderPvContent 的 kick 逻辑，按 cardId 定位覆盖层） */
function kickTextBlob(blob,cardId){
  const m=getMorph(cardId);
  if(!m)return;
  const token=m.token,outer=m.el,body=m.body||m.el;
  const f=state.files.find(x=>x.id===m.fileId);
  blob.text().then(t=>{
    const cur=getMorph(cardId);
    if(!cur||cur.el!==outer||cur.token!==token)return;
    if(f&&/\.(md|markdown)$/i.test(f.name)){
      /* Markdown：完整 DOM 渲染（标题/表格/列表/代码/下划线等） */
      body.innerHTML='';
      const box=document.createElement("div");
      box.className="pv-md-wrap";
      renderMdDom(t,box);
      body.appendChild(box);
    }else{
      body.innerHTML='<pre class="pv-text"></pre>';
      body.firstChild.textContent=(t||"").slice(0,20000);
    }
  }).catch(()=>{const cur=getMorph(cardId);if(cur&&cur.el===outer&&cur.token===token)body.innerHTML='<div class="pv-msg">无法读取文本</div>';});
}
function kickMorph(el,url,type){
  if(!el)return;
  const cardId=el.dataset.card;
  const m=getMorph(cardId);
  const token=m?m.token:0;
  const body=m&&m.body?m.body:el;
  const owns=()=>{const cur=getMorph(cardId);return cur&&cur.el===el&&cur.token===token;};
  if(type==="img"){
    renderPreviewImage(body,url,{wrapClass:"morph-fit",style:"max-width:100%;max-height:100%;object-fit:contain;margin:auto"});
  }else if(type==="media"){
    const v=document.createElement("video");
    v.style.cssText="width:100%;height:100%;object-fit:contain;background:#000";
    v.src=url;v.controls=true;v.autoplay=false;v.preload="auto";v.referrerPolicy="no-referrer-when-downgrade";
    v.onerror=()=>{if(owns())body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>视频加载失败<br><a download>下载后本地播放</a></div>';};
    body.innerHTML="";body.appendChild(v);
  }else if(type==="text"){
    fetch(url).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.text();}).then(t=>{
      if(!owns())return;
      body.innerHTML='<pre class="pv-text"></pre>';body.firstChild.textContent=t;
    }).catch(()=>{if(owns())body.innerHTML='<div class="pv-msg">无法读取文本</div>';});
  }else if(type==="link"){
    const linkedFile=state.files.find(file=>file.url===url&&file.kind==="link");
    if(rejectsEmbeddedPreview(url)){renderWebEmbedFallback(body,url,linkedFile&&linkedFile.name);return;}
    /* C1 修复：网页形变预览只保留 ensureMorphDom 创建的 pv-morph-tools 工具栏
       （名称 + 缩放 + 默认打开 + 收起），不再在此处重复创建 bar 工具栏。
       此前 B1/C0 在 kickMorph 内额外创建了一层 bar（桌面/手机切换 + 精确缩放 + 新窗口打开），
       与 pv-morph-tools 叠加形成"双上栏"；点击第一层 bar 的收起按钮会导致单元错乱。
       wrap 容器仍然需要——它提供 flex 纵向布局让 stage 获得正确高度，iframe 才可见。 */
    const wrap=document.createElement("div");
    wrap.className="pv-web-wrap";
    const stage=document.createElement("div");
    stage.className="pv-stage";
    const iframe=configureWebPreviewFrame(document.createElement("iframe"),url,"网页材料预览");
    iframe.loading="eager";
    /* G7: webview 用 flex:1 撑满 stage（position:absolute 在 Electron webview 上不生效） */
    iframe.style.cssText="display:block;flex:1;width:100%;height:100%;border:none;background:#fff";
    iframe.onerror=()=>{if(owns())body.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>链接加载失败<br>可使用工具栏「默认打开」在外部查看</div>';};
    stage.appendChild(iframe);
    wrap.appendChild(stage);
    body.innerHTML="";body.appendChild(wrap);
    /* 供 syncMorphDom 同步缩放——pv-morph-tools 的缩放按钮设置 el.dataset.pvZoom，
       syncMorphDom 读取后将 zoom 应用到 iframe。mbMode 固定 false（移除了手机视图切换）。 */
    body.__pvIframe=iframe;body.__pvStage=stage;body.__pvMb=()=>false;
    syncMorphDom();
  }else{
    body.innerHTML='<div class="pv-msg"><span class="big">📄</span>'+KIND_LABEL[type]+' 文件<br><a href="'+url+'" target="_blank" download>下载文件</a><br><span style="color:var(--ink-faint);font-size:10px">该格式暂不支持在线预览</span></div>';
  }
}
function destroyMorphDom(cardId){
  if(cardId!==undefined&&cardId!==null){
    /* 单卡销毁：仅使该卡的异步回调失效并移除 DOM */
    morphToken++;
    const m=morphMap.get(String(cardId));
    if(m){m.el.remove();morphMap.delete(String(cardId));}
    return;
  }
  /* 全量销毁（画布切换/保存等场景） */
  morphToken++;
  for(const [,m] of [...morphMap]){m.el.remove();}
  morphMap.clear();
}
/* G7: Promise 缓存 — 同一库加载中时复用 Promise，避免重复发起 */
const _cdnPromises={};
async function ensureCdn(kind){
  const map={doc:"docx",sheet:"xlsx",pdf:"pdfjs",slide:"pptx"};
  const key=map[kind];
  if(!key) return true;
  if(window[key+"_loaded"]) return true;
  /* 已有加载在途：复用同一 Promise，不重复加载 */
  if(_cdnPromises[key]) return _cdnPromises[key];
  const kindLabel=kind==="pdf"?"PDF":kind==="doc"?"Word":kind==="sheet"?"表格":"演示";
  const loadScript=(src)=>new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src=src;s.onload=res;s.onerror=()=>rej(new Error("load fail: "+src));
    document.head.appendChild(s);
  });
  /* 本地优先：vendor 脚本随版本目录发布（src/assets/vendor/），与 HTML 同根相对引用，离线也能渲染。
     I6-fix: 原路径 "assets/vendor/" 从 I6.html 解析到根目录的 assets/vendor（只有 README），
     本地文件全 404、退而走 CDN；改为 "src/assets/vendor/" 后本地直接命中，不再依赖 CDN。 */
  const LOCAL=function(key2){
    const names={jszip:"jszip.min.js",docx:"docx-preview.min.js",xlsx:"xlsx.full.min.js",pdfjs:"pdf.min.js",pdfjsWorker:"pdf.worker.min.js",pptx:"pptx-preview.umd.js"};
    return "src/assets/vendor/"+names[key2];
  };
  toast("正在加载"+kindLabel+"预览组件…");
  _cdnPromises[key]=(async function(){
  try{
    const lib=CDN[key];
    /* 先加载依赖（如 docx-preview 依赖 jszip） */
    if(lib.dep){
      const depKey=lib.dep;
      if(!window[depKey+"_loaded"]){
        let okD=false;
        try{await loadScript(LOCAL(depKey));okD=true;}catch(e){}
        if(!okD)await loadScript(CDN[depKey].url);
        window[depKey+"_loaded"]=true;
      }
    }
    if(key==="pdfjs"){
      let okP=false;
      try{await loadScript(LOCAL("pdfjs"));okP=true;}catch(e){}
      if(!okP)await loadScript(lib.url);
      if(window.pdfjsLib){
        /* I6-fix: worker 不能用 loadScript 当普通脚本加载——pdf.js 是按 workerSrc 内部 new Worker。
           主库本地命中则 worker 也用本地（同源 file:// 可正常 spawn）；
           主库走 CDN 兜底则 worker 也走 CDN。原实现 workerSrc 未设/设错导致"PDF 渲染失败"。 */
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=okP?LOCAL("pdfjsWorker"):CDN.pdfjsWorker.url;
      }
      window.pdfjs_loaded=true;
    }else{
      let okK=false;
      try{await loadScript(LOCAL(key));okK=true;}catch(e){}
      if(!okK)await loadScript(lib.url);
      window[key+"_loaded"]=true;
    }
    return true;
  }catch(e){ console.warn("CDN load fail:",e); return false; }
  })();
  return _cdnPromises[key];
}
function fitDocxPreview(bodyEl){
  /* G7: 纯 CSS zoom 方案 — 像图片一样等比缩小，排版比例不变。
     G7 fix: 测量 nativeWidth 前先移除 stage zoom，避免 zoom 改变 offsetWidth 造成反馈循环 */
  if(!bodyEl||!bodyEl.closest||!bodyEl.closest("#previewLayer"))return;
  const stage=bodyEl.querySelector(".pv-docx-stage");
  if(!stage)return;
  const container=stage.querySelector(".docx-container");
  const wrapper=stage.querySelector(".docx-wrapper")||container;
  const pages=[...stage.querySelectorAll(".docx,section")];
  if(!pages.length)return;
  /* 临时移除 stage zoom，确保 offsetWidth 返回原始未缩放尺寸 */
  var prevZoom=stage.style.zoom||"";
  stage.style.zoom="1";
  for(const page of pages){page.style.removeProperty("zoom");page.style.removeProperty("transform");}
  wrapper.style.removeProperty("zoom");
  wrapper.style.removeProperty("transform");
  wrapper.style.removeProperty("width");
  /* 现在测量的是 Word 原始页宽，不受 stage zoom 影响 */
  const nativeWidth=Math.max(1,...pages.map(page=>page.offsetWidth||page.scrollWidth||0));
  const nativeHeight=Math.max(1,wrapper.scrollHeight||0,...pages.map(page=>(page.offsetTop||0)+(page.offsetHeight||page.scrollHeight||0)));
  const stageWidth=Math.max(120,(bodyEl.clientWidth||0));
  const available=Math.max(120,stageWidth-16);
  var fit=clamp(available/nativeWidth,.12,3);
  var pvZoom=parseFloat(bodyEl.dataset.pvZoom)||1;
  var totalZoom=clamp(fit*pvZoom,.1,3);
  /* 一次性设回 zoom：浏览器先按 nativeWidth 排版，再整体等比缩小 */
  stage.style.zoom=String(totalZoom);
  stage.style.width="auto";
  stage.style.height="auto";
  wrapper.style.setProperty("position","relative","important");
  wrapper.style.setProperty("width",nativeWidth+"px","important");
  for(const page of pages)page.style.setProperty("transform","none","important");
}
function docxFallbackMessage(blob,bodyEl,fileName,error){
  const url=URL.createObjectURL(blob);
  bodyEl.innerHTML="";
  const box=document.createElement("div");box.className="pv-msg";
  box.innerHTML='<span class="big">📝</span><strong>浏览器暂时无法解析此 Word 文档</strong><br>原文件没有被修改；可下载后使用 Word / WPS 查看。<br>';
  if(error){const detail=document.createElement("span");detail.style.cssText="display:block;margin-top:6px;font-size:10px;color:var(--ink-faint)";detail.textContent=String(error.message||error).slice(0,90);box.appendChild(detail);}
  const link=document.createElement("a");link.href=url;link.download=fileName||"document.docx";link.textContent="下载后用 Word / WPS 打开";
  link.addEventListener("click",()=>setTimeout(()=>URL.revokeObjectURL(url),3000),{once:true});
  box.appendChild(link);bodyEl.appendChild(box);
}
async function renderDocx(b,bodyEl,fileName="document.docx"){
  /* 回归原先的浏览器内 DOCX 预览：不调用本地服务，也不等待 Office/WPS 转换。 */
  return renderDocxDirect(b,bodyEl,fileName);
}
async function renderDocxDirect(b,bodyEl,fileName="document.docx"){
  const ok=await ensureCdn("doc");
  if(!ok){docxFallbackMessage(b,bodyEl,fileName,new Error("浏览器 Word 解析组件未加载"));return;}
  bodyEl.innerHTML='<div class="pv-loading"><div class="spinner"></div>正在解析 Word 文档…</div>';
  try{
    bodyEl.innerHTML='';
    /* 浏览器直接解析 DOCX；卡片预览另设舞台以保留纸张感，并在解析完成后按页宽适配。 */
    const stage=document.createElement("div");stage.className="pv-docx-stage";bodyEl.appendChild(stage);
    await window.docx.renderAsync(b,stage,null,{className:"docx-container",inWrapper:true,ignoreWidth:false,ignoreHeight:false,breakPages:true});
    if(bodyEl.closest("#previewLayer"))requestAnimationFrame(()=>fitDocxPreview(bodyEl));
  }catch(e){
    console.warn("browser docx preview failed",e);
    docxFallbackMessage(b,bodyEl,fileName,e);
  }
}
async function renderPdf(b,bodyEl,opt={}){
  const ok=await ensureCdn("pdf");
  if(!ok){bodyEl.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>加载 PDF 预览组件失败<br>请检查网络连接或放入 assets/vendor/pdf.min.js<br><a download>下载文件本地打开</a></div>';return;}
  bodyEl.innerHTML='<div class="pv-loading"><div class="spinner"></div>加载 PDF…</div>';
  try{
    const buf=await b.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
    const container=document.createElement("div");
    container.style.cssText="padding:8px";
    const paint=async(pageNo,canvas)=>{
      const page=await pdf.getPage(pageNo);
    /* Canvas 按设备像素比输出，CSS 仍按文档尺寸展示。
       之前只画了 1.2 倍像素，在 Windows 高 DPI 显示器/全屏放大时文字会发虚。 */
    const viewport=page.getViewport({scale:1.35});
    const pixelRatio=Math.max(1.75,window.devicePixelRatio||1);
    canvas.width=Math.ceil(viewport.width*pixelRatio);canvas.height=Math.ceil(viewport.height*pixelRatio);
    canvas.style.width=Math.ceil(viewport.width)+"px";canvas.style.height=Math.ceil(viewport.height)+"px";
    const ctx2=canvas.getContext("2d");
    await page.render({canvasContext:ctx2,viewport,transform:[pixelRatio,0,0,pixelRatio,0,0]}).promise;
    };
    if(opt.paginate&&pdf.numPages>1){
      const canvas=document.createElement("canvas");
      const ratio=clamp(Number(opt.previewScale)||1,.65,1);
      canvas.style.cssText="display:block;margin:0 auto 8px;box-shadow:0 2px 12px rgba(0,0,0,.12);background:#fff"+(opt.fitToWidth?";max-width:"+Math.round(ratio*100)+"%;height:auto":"");
      const controls=document.createElement("div");
      controls.style.cssText="display:flex;align-items:center;justify-content:center;gap:9px;padding:2px 8px 8px;color:var(--ink-dim);font-size:11px";
      const makeButton=(label,title)=>{const btn=document.createElement("button");btn.type="button";btn.textContent=label;btn.title=title;btn.style.cssText="width:24px;height:22px;border:1px solid var(--card-border);border-radius:7px;background:var(--surface);color:var(--ink);font:600 15px/1 var(--font);cursor:pointer";["pointerdown","mousedown","click"].forEach(type=>btn.addEventListener(type,e=>e.stopPropagation()));return btn;};
      const prev=makeButton("‹","上一页"),next=makeButton("›","下一页"),counter=document.createElement("span");
      controls.append(prev,counter,next);container.append(canvas,controls);
      let current=1,paintToken=0;
      const show=async(pageNo)=>{
        current=clamp(pageNo,1,pdf.numPages);const token=++paintToken;
        counter.textContent="第 "+current+" / "+pdf.numPages+" 页";prev.disabled=current===1;next.disabled=current===pdf.numPages;
        prev.style.opacity=prev.disabled?".35":"1";next.style.opacity=next.disabled?".35":"1";
        try{await paint(current,canvas);if(token!==paintToken)return;}catch(e){console.warn("pdf page render failed",e);}
      };
      prev.addEventListener("click",()=>show(current-1));next.addEventListener("click",()=>show(current+1));
      await show(1);
    }else{
      for(let i=1;i<=pdf.numPages;i++){
        const canvas=document.createElement("canvas");
        canvas.style.cssText="display:block;margin:0 auto 12px;box-shadow:0 2px 12px rgba(0,0,0,.12)"+(opt.fitToWidth?";max-width:100%;height:auto":"");
        await paint(i,canvas);container.appendChild(canvas);
      }
    }
    bodyEl.innerHTML="";bodyEl.appendChild(container);
  }catch(e){bodyEl.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>PDF 渲染失败<br>'+escapeHtml(e.message||"")+'</div>';}
}
async function renderSheet(b,bodyEl){
  const ok=await ensureCdn("sheet");
  if(!ok){bodyEl.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>加载表格预览组件失败<br>请检查网络连接或放入 assets/vendor/xlsx.full.min.js<br><a download>下载文件本地打开</a></div>';return;}
  bodyEl.innerHTML='<div class="pv-loading"><div class="spinner"></div>解析中…</div>';
  try{
    /* IndexedDB/文件导入链路返回 Blob；SheetJS 的 array 模式必须接收 ArrayBuffer 或 Uint8Array。 */
    const data=b instanceof Blob?await b.arrayBuffer():b;
    const wb=window.XLSX.read(data,{type:"array",cellDates:true,cellFormula:false,cellHTML:false});
    if(!wb.SheetNames||!wb.SheetNames.length)throw new Error("工作簿中没有可预览的工作表");
    /* C2 安全：sheet_to_html 输出经 sanitizer 剥离 <script>/on* 事件属性等危险内容，
       防止恶意单元格 HTML 在预览中执行。允许的标签白名单：table/thead/tbody/tr/th/td/colgroup/col。 */
    const sanitizeSheetHtml=(raw)=>{
      const tpl=document.createElement("template");tpl.innerHTML=raw;
      tpl.content.querySelectorAll("script,style,link,meta,iframe,object,embed").forEach(el=>el.remove());
      tpl.content.querySelectorAll("*").forEach(el=>{
        [...el.attributes].forEach(attr=>{if(/^on/i.test(attr.name))el.removeAttribute(attr.name);});
      });
      return tpl.innerHTML;
    };
    const html=wb.SheetNames.map(n=>'<section class="pv-sheet"><h4>'+escapeHtml(n)+'</h4>'+sanitizeSheetHtml(window.XLSX.utils.sheet_to_html(wb.Sheets[n],{header:"",footer:"",editable:false,id:"sheet-"+escapeHtml(n)}))+'</section>').join("");
    bodyEl.innerHTML='<div style="padding:0 12px 20px">'+html+'</div>';
    /* J3-fix: 表格样式改用 CSS 类（.pv-sheet table/td/th），跟着 data-theme 自动切换，
       不再用内联样式（避免切主题后表格不刷新） */
    /* Sheet tabs for multi-sheet workbooks */
    var sheetNames=wb.SheetNames;if(sheetNames.length>1){
      var tabBar=document.createElement("div");tabBar.style.cssText="display:flex;gap:2px;padding:4px 0;border-bottom:1px solid "+(state.dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)")+";margin-bottom:6px";
      bodyEl.insertBefore(tabBar,bodyEl.firstChild);
      var sections=bodyEl.querySelectorAll("section.pv-sheet");
      sheetNames.forEach(function(name,idx){
        var tab=document.createElement("button");tab.textContent=name;tab.style.cssText="padding:4px 12px;border:none;border-radius:4px 4px 0 0;font-size:11px;font-weight:600;cursor:pointer;background:"+(state.dark?"#252530":"#f0f0f2")+";color:"+(state.dark?"#aaa":"#666")+";font-family:var(--font)";
        tab.addEventListener("click",function(){sections.forEach(function(s){s.style.display="none";});sections[idx].style.display="block";tabBar.querySelectorAll("button").forEach(function(b){b.style.background=state.dark?"#252530":"#f0f0f2";b.style.color=state.dark?"#aaa":"#666";});tab.style.background=state.dark?"#1a1a2e":"#fff";tab.style.color=state.dark?"#e8e8ec":"#1d1d1f";});
        tabBar.appendChild(tab);
      });
      sections.forEach(function(s,i){if(i>0)s.style.display="none";});
      tabBar.firstChild.click();
    }
  }catch(e){
    console.warn("sheet preview failed",e);
    bodyEl.innerHTML='<div class="pv-msg"><span class="big">⚠️</span>表格解析失败<br><span style="font-size:11px">'+escapeHtml(String(e.message||"文件格式不受支持").slice(0,90))+'</span><br><a download>下载文件用本地表格软件打开</a></div>';
  }
}
async function renderPptx(b,bodyEl){
  const ok=await ensureCdn("slide");
  if(!ok||!window.pptxPreview||typeof window.pptxPreview.init!=="function"){
    const url=URL.createObjectURL(b);
    bodyEl.innerHTML='<div class="pv-msg"><span class="big">📊</span>PPT 预览组件加载失败<br><a download>下载后用本地应用打开</a></div>';
    const link=bodyEl.querySelector("a");link.href=url;link.download="presentation.pptx";
    link.addEventListener("click",()=>setTimeout(()=>URL.revokeObjectURL(url),3000),{once:true});
    return;
  }
  bodyEl.innerHTML='<div class="pv-loading"><div class="spinner"></div>正在解析演示文稿…</div>';
  try{
    const host=document.createElement("div");
    const w=clamp(Math.round((bodyEl.clientWidth||960)-20),320,1440);
    const h=Math.round(w*9/16);
    host.style.cssText="min-height:100%;padding:10px;box-sizing:border-box;overflow:auto;background:#f2f4f8";
    bodyEl.innerHTML="";bodyEl.appendChild(host);
    const viewer=window.pptxPreview.init(host,{width:w,height:h,mode:"slide"});
    await viewer.preview(await b.arrayBuffer());
  }catch(e){
    console.warn("pptx preview failed",e);
    const url=URL.createObjectURL(b);
    bodyEl.innerHTML='<div class="pv-msg"><span class="big">📊</span>PPT 解析失败<br><span style="font-size:11px"></span><br><a download>下载后用本地应用打开</a></div>';
    bodyEl.querySelector("span[style]").textContent=String(e.message||e).slice(0,90);
    const link=bodyEl.querySelector("a");link.href=url;link.download="presentation.pptx";
    link.addEventListener("click",()=>setTimeout(()=>URL.revokeObjectURL(url),3000),{once:true});
  }
}
/* I5-fix: exportBranch（子树 PNG 导出）零调用方，已删除——其连线锚点走的是退役的
   nodeAnchorR/L 硬编码路由，与现行 relAnchors/routeConnection 不一致，留着是颗雷 */
