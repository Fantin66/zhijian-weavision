/* PDF.js text layer shares the exact canvas viewport and scale. One page at a time. */
async function renderPdf(blob,body,opt={}){
  body.innerHTML='<div class="pv-loading">加载 PDF…</div>';
  let pdf,observer;
  try{
    if(!await ensureCdn('pdf'))throw new Error('PDF 组件不可用');
    pdf=await pdfjsLib.getDocument({data:await blob.arrayBuffer()}).promise;
    const host=document.createElement('div'),pageHost=document.createElement('div'),bar=document.createElement('div');
    host.className='l1-pdf';bar.className='l1-pdf-controls';
    const previous=document.createElement('button'),next=document.createElement('button'),counter=document.createElement('span'),excerpt=document.createElement('button');
    previous.textContent='‹ 上一页';next.textContent='下一页 ›';excerpt.textContent='✎ 摘录';excerpt.title='Ctrl+Shift+E：将所选文字摘录到当前画布';
    for(const button of [previous,next,excerpt]){button.type='button';button.className='pv-page-btn';}
    excerpt.addEventListener('mousedown',e=>e.preventDefault());excerpt.onclick=()=>l1ExcerptSelection();
    bar.append(previous,counter,next,excerpt);host.append(bar,pageHost);body.replaceChildren(host);
    let current=1,token=0,closed=false;
    const show=async n=>{
      current=Math.max(1,Math.min(pdf.numPages,n));const mine=++token;
      previous.disabled=current===1;next.disabled=current===pdf.numPages;counter.textContent=current+' / '+pdf.numPages;
      const page=await pdf.getPage(current),width=Math.max(220,body.clientWidth-32),base=page.getViewport({scale:1});
      const scale=opt.fitToWidth?Math.min(1.5,width/base.width):1.35,viewport=page.getViewport({scale});
      const wrap=document.createElement('div'),canvas=document.createElement('canvas'),text=document.createElement('div');
      wrap.className='l1-pdf-page';wrap.dataset.pdfPage=current;wrap.style.width=viewport.width+'px';wrap.style.height=viewport.height+'px';
      text.className='l1-pdf-text textLayer';text.style.setProperty('--scale-factor',String(scale));
      const ratio=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
      wrap.append(canvas,text);
      await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;
      const content=await page.getTextContent();await pdfjsLib.renderTextLayer({textContentSource:content,container:text,viewport,textDivs:[]}).promise;
      if(closed||mine!==token)return;
      pageHost.replaceChildren(wrap);
      if(!content.items.some(i=>i.str?.trim())){const info=document.createElement('p');info.textContent='此页没有可提取文字，扫描内容需要 OCR 后才能搜索或摘录。';pageHost.append(info);}
      if(opt.sourceQuote&&current===(opt.initialPage||1))highlightExcerptSource(text,opt.sourceQuote,opt.sourceAnchor);
      page.cleanup();
    };
    const navigate=n=>show(n).catch(e=>{counter.textContent='加载失败：'+e.message;});
    previous.onclick=()=>navigate(current-1);next.onclick=()=>navigate(current+1);
    await show(opt.initialPage||1);
    observer=new MutationObserver(()=>{if(!host.isConnected){closed=true;token++;observer.disconnect();pdf.destroy().catch(()=>{});}});
    observer.observe(document.body,{childList:true,subtree:true});
  }catch(e){observer?.disconnect();pdf?.destroy().catch(()=>{});body.innerHTML='<div class="pv-msg">PDF 读取失败：'+escapeHtml(e.message)+'</div>';}
}
function l1ExcerptSelection(){
  const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed){toast('请先选择原文');return;}
  const range=selection.getRangeAt(0),element=range.startContainer.parentElement,host=element?.closest('[data-source-file-id]');
  if(!host||!host.contains(range.endContainer)){toast('请选择同一附件内的文字');return;}
  const file=state.files.find(f=>f.id===host.dataset.sourceFileId);if(!file)return;
  const root=element.closest('.l1-pdf-text')||excerptContentRoot(host),map=excerptTextMap(root);
  if(!root.contains(range.endContainer)){toast('请按页摘录');return;}
  const start=excerptOffset(root,range.startContainer,range.startOffset),end=excerptOffset(root,range.endContainer,range.endOffset),quote=map.text.slice(start,end);
  if(!quote.trim()||quote.length>100000){toast('请选择有效且不超过十万字的原文');return;}
  pushHistory('摘录原文');const point=s2w(W/2,H/2),note=addNote(point.x,point.y,selection.toString(),state.noteColor);
  note.w=280;note.h=160;note.sourceRef={fileId:file.id,name:file.name,quote,page:Number(element.closest('[data-pdf-page]')?.dataset.pdfPage)||undefined,contentHash:file.contentHash||null,anchor:{start,end,prefix:map.text.slice(Math.max(0,start-64),start),suffix:map.text.slice(end,end+64)}};
  const ref=note.sourceRef;readStoredBlob(file).then(async blob=>{if(blob&&!ref.contentHash){ref.contentHash=await L1Storage.hash(blob);file.contentHash=ref.contentHash;saveStateDebounced();}}).catch(()=>{});
  state.selected=note.id;render();saveStateDebounced();toast('已摘录到当前画布，可通过“查看来源”回到原文');
}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='e'){e.preventDefault();l1ExcerptSelection();}});
