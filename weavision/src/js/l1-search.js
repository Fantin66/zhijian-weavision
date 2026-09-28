/* Full workspace search with explicit extraction coverage and page provenance. */
const L1Search=(()=>{
  const active=new Map();let generation=0;
  const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase();
  async function extract(file){
    if(file.sourceOnly)return {status:'reference',parts:[{text:[file.aiSource?.summary,file.aiSource?.locator,file.aiSource?.excerpt].filter(Boolean).join('\n'),label:'来源信息（未含原文）'}]};
    if(file.kind==='link')return {status:'unread',reason:'网页正文未存入本地',parts:[{text:file.url||'',label:'网址'}]};
    const blob=await readStoredBlob(file);if(!blob)return {status:'error',reason:'附件内容缺失',parts:[]};
    const hash=await L1Storage.hash(blob);file.contentHash=hash;
    const cacheKey='v1:'+file.kind+':'+file.name.split('.').pop().toLowerCase()+':'+hash;
    const cache=await L1Storage.get('l1Search',cacheKey).catch(()=>null);if(cache)return cache;
    let parts=[],status='complete',reason='';
    const ext=(file.name.match(/\.([^.]*)$/)||[])[1]?.toLowerCase();
    if(file.kind==='pdf'||ext==='pdf'){
      if(!await ensureCdn('pdf'))throw new Error('PDF 组件加载失败');
      const pdf=await pdfjsLib.getDocument({data:await blob.arrayBuffer()}).promise;
      try{for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n),content=await page.getTextContent();
        const text=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');
        parts.push({page:n,label:'第 '+n+' 页',text});page.cleanup();
        if(!text.trim()){status='partial';reason='部分页面没有可提取文字，可能需要 OCR';}
      }}finally{await pdf.destroy();}
    }else if(file.kind==='sheet'||['xlsx','xls','csv'].includes(ext)){
      if(!await ensureCdn('sheet'))throw new Error('表格组件加载失败');
      const book=XLSX.read(await blob.arrayBuffer(),{type:'array',cellFormula:true});
      for(const name of book.SheetNames){const sheet=book.Sheets[name];for(const [cell,value]of Object.entries(sheet))if(!cell.startsWith('!'))parts.push({label:name+'!'+cell,text:[value.w??value.v,value.f].filter(v=>v!==undefined).join(' ')});}
    }else if(['docx','pptx'].includes(ext)){
      if(!await ensureCdn('doc')||!window.JSZip)throw new Error('文档组件加载失败');
      const zip=await JSZip.loadAsync(blob);
      const names=Object.keys(zip.files).filter(n=>ext==='docx'?/^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(n):/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      for(const name of names){const xml=new DOMParser().parseFromString(await zip.file(name).async('string'),'application/xml');parts.push({label:name,text:[...xml.getElementsByTagName('*')].filter(n=>n.localName==='t').map(n=>n.textContent).join('\n')});}
    }else if(['text','code'].includes(file.kind)||/^text\//.test(file.mime)||['md','txt','json','xml','html','log','js','ts','py','css','yaml','yml','svg'].includes(ext)){
      parts=[{label:'正文',text:await blob.text()}];
    }else{status='unread';reason='此格式尚不能提取正文（图片、扫描件及音视频需要额外识别）';}
    if(status==='complete'&&!parts.some(p=>p.text.trim())){status='empty';reason='未提取到正文';}
    const result={hash,status,reason,parts};
    await L1Storage.tx(['l1Search'],'readwrite',t=>t.objectStore('l1Search').put(result,cacheKey)).catch(()=>{});return result;
  }
  function indexed(file){
    const key=file.id+':'+file.size+':'+(file.contentHash||'');
    if(!active.has(key))active.set(key,extract(file).catch(e=>({status:'error',reason:e.message,parts:[]})).finally(()=>active.delete(key)));
    return active.get(key);
  }

  function matches(value,query){
    const text=String(value||''),q=normalize(query),map=[],ends=[];let folded='',offset=0;
    for(const ch of text){const n=normalize(ch);for(let k=0;k<n.length;k++){map.push(offset);ends.push(offset+ch.length);}folded+=n;offset+=ch.length;}
    const found=[];if(!q)return found;let at=0,index;
    while((index=folded.indexOf(q,at))>=0){found.push({start:map[index],end:ends[index+q.length-1]});at=index+q.length;}return found;
  }
  async function query(text,{projectId,canvasId,category='all',onProgress}={}){
    const token=++generation,results=[],coverage=[];if(!String(text).trim())return {results,coverage};
    function add(value,ref){let occurrence=0;for(const {start,end}of matches(value,text)){const full=String(value);results.push({...ref,query:text,occurrence:occurrence++,offset:start,quote:full.slice(start,end),snippet:full.slice(Math.max(0,start-38),end+90),anchor:{start,end,prefix:full.slice(Math.max(0,start-40),start),suffix:full.slice(end,end+40)}});}}
    for(const p of state.projects.filter(p=>!projectId||p.id===projectId)){
      const canvases=p.canvases.filter(c=>!canvasId||c.id===canvasId);
      for(const c of canvases){
        for(const it of c.items){const ref={projectId:p.id,projectName:p.name,canvasId:c.id,canvasName:c.name,itemId:it.id,title:it.text||p.files.find(f=>f.id===it.fileId)?.name||'未命名元素'};
          if(category==='all'||category==='elements'){if(it.type!=='note')add(it.text,{...ref,field:'text',type:'元素'});if(it.type==='mindNode')add(it.detail,{...ref,field:'detail',type:'节点详情'});}
          if(category==='all'||category==='notes'){if(it.type==='note')add(it.text,{...ref,field:'text',type:'便签'});add(it.annotation,{...ref,field:'annotation',type:'元素批注'});add(it.sourceRef?.quote,{...ref,field:'quote',type:'来源引文'});}
        }
        if(category==='all'||category==='notes')for(const l of c.links||[]){const ref={projectId:p.id,projectName:p.name,canvasId:c.id,canvasName:c.name,itemId:l.aId,linkId:l.id,title:(c.items.find(i=>i.id===l.aId)?.text||'元素')+' → '+(c.items.find(i=>i.id===l.bId)?.text||'元素')};add(l.annotation,{...ref,field:'annotation',type:'关系批注'});add(l.sourceRef?.quote,{...ref,field:'quote',type:'来源引文'});}
      }
      if(!['all','attachments'].includes(category))continue;
      const allowed=canvasId?new Set(canvases.flatMap(c=>[...c.items,...(c.links||[]),...(c.previews||[])]).flatMap(i=>[i.fileId,i.sourceRef?.fileId]).filter(Boolean)):null;
      for(const file of p.files){
        if(token!==generation)return {results:[],coverage,cancelled:true};if(allowed&&!allowed.has(file.id))continue;
        const used=canvases.find(c=>c.items.some(i=>i.fileId===file.id||i.sourceRef?.fileId===file.id)||(c.links||[]).some(l=>l.sourceRef?.fileId===file.id)||(c.previews||[]).some(v=>v.fileId===file.id));
        const card=used?.items.find(i=>i.fileId===file.id);
        const ref={projectId:p.id,projectName:p.name,canvasId:used?.id,canvasName:used?.name,itemId:card?.id,fileId:file.id,fileName:file.name,title:file.name,type:'附件'};
        add(file.name,{...ref,field:'name',type:'附件名称'});
        const record=await indexed(file);if(token!==generation)return {results:[],coverage,cancelled:true};coverage.push({...ref,status:record.status,reason:record.reason});
        for(const part of record.parts)add(part.text,{...ref,field:'content',page:part.page,location:part.label,contentHash:record.hash,partText:part.text});
        onProgress?.({files:coverage.length,results:results.length,fileName:file.name});await new Promise(r=>setTimeout(r,0));
      }
    }return {results,coverage};
  }
  let previewGeneration=0,temporary=null;
  const viewFields=['x','y','w','h','collapsed','previewOpen','_cardW','_cardH','_morphW','_morphH','_morphPvZoom','_detailBase'];
  function rememberView(){
    temporary={projectId:state.activeProjectId,canvasId:state.activeCanvasId,items:new Map(state.items.map(it=>[it.id,Object.fromEntries(viewFields.map(key=>[key,{present:Object.prototype.hasOwnProperty.call(it,key),value:it[key]}]))])),detailIds:new Set(expandedDetailIds),openedDetails:new Set(),changedMorphs:new Set(),scroll:[]};
    for(const m of morphMap.values())temporary.scroll.push({id:m.cardId||m.el.dataset.card,top:m.body.scrollTop,left:m.body.scrollLeft});
  }
  function applyView(items,snapshot){for(const it of items){const values=snapshot.items.get(it.id);if(values)for(const [key,entry]of Object.entries(values)){if(entry.present)it[key]=entry.value;else delete it[key];}}}
  function archiveView(projects){if(temporary){const c=projects.find(p=>p.id===temporary.projectId)?.canvases.find(c=>c.id===temporary.canvasId);if(c)applyView(c.items,temporary);}return projects;}
  function restoreView(){
    const previous=temporary;temporary=null;if(!previous)return;
    const canvas=state.projects.find(p=>p.id===previous.projectId)?.canvases.find(c=>c.id===previous.canvasId);
    for(const id of previous.openedDetails){const key=String(id);if(detailAnimFrames.has(key)){cancelAnimationFrame(detailAnimFrames.get(key));detailAnimFrames.delete(key);}detailLayoutMap.delete(id);expandedDetailIds.delete(id);}
    if(canvas)applyView(canvas.items,previous);
    for(const id of previous.changedMorphs)destroyMorphDom(id);
    if(state.activeProjectId===previous.projectId&&state.activeCanvasId===previous.canvasId){render();for(const v of previous.scroll){const m=getMorph(v.id);if(m){m.body.scrollTop=v.top;m.body.scrollLeft=v.left;}}}
  }
  function highlight(root,result){
    for(const mark of root.querySelectorAll('mark.search-hit'))mark.replaceWith(document.createTextNode(mark.textContent));root.normalize();
    const {text,nodes}=excerptTextMap(root),hits=matches(text,result.query||result.quote);let chosen=hits.find(h=>h.start===result.offset)||hits[result.occurrence||0];
    if(!chosen)return false;
    for(let i=nodes.length-1;i>=0;i--){const {node,start}=nodes[i],a=Math.max(0,chosen.start-start),b=Math.min(node.length,chosen.end-start);if(a>=b)continue;const range=document.createRange();range.setStart(node,a);range.setEnd(node,b);const mark=document.createElement('mark');mark.className='search-hit';range.surroundContents(mark);}
    const mark=root.querySelector('mark.search-hit');if(mark){root.scrollTop=Math.max(0,mark.offsetTop-root.clientHeight/3);mark.scrollIntoView({block:'nearest'});}return true;
  }
  function clearPreview(){previewGeneration++;document.getElementById('searchReading')?.remove();document.querySelectorAll('.search-hit').forEach(m=>{const parent=m.parentNode;m.replaceWith(document.createTextNode(m.textContent));parent?.normalize();});restoreView();}
  async function locate(result){
    clearPreview();
    if(state.activeProjectId!==result.projectId)switchProject(result.projectId);
    if(result.canvasId&&state.activeCanvasId!==result.canvasId)switchCanvas(result.canvasId);
    const token=++previewGeneration;
    if(result.query||result.quote)rememberView();
    const it=state.items.find(i=>i.id===result.itemId),entity=result.linkId?state.links.find(l=>l.id===result.linkId):it;
    if(it){let parent=it;const visited=new Set();while(parent?.parentId&&!visited.has(parent.parentId)){visited.add(parent.parentId);parent=state.items.find(i=>i.id===parent.parentId);if(parent)parent.collapsed=false;}
      if(result.field==='detail'&&!expandedDetailIds.has(it.id)){temporary?.openedDetails.add(it.id);expandDetailInPlace(it,true);}
      if(result.fileId&&it.type==='fileCard'&&!it.previewOpen){temporary?.changedMorphs.add(it.id);it.previewOpen=true;const size=it._morphW&&it._morphH?{w:it._morphW,h:it._morphH}:previewTargetSize(it);it.w=size.w;it.h=size.h;}
      state.selected=result.linkId||it.id;state.multiSel=[];const b=itemBounds(it);if(b){state.camera.x=b.x+b.w/2-W/state.camera.zoom*.42;state.camera.y=b.y+b.h/2-H/state.camera.zoom/2;}render();
    }
    if(!result.query&&!result.quote)return;
    document.getElementById('searchReading')?.remove();
    const pane=document.createElement('aside');pane.id='searchReading';pane.setAttribute('aria-label','搜索内容预览');
    const header=document.createElement('header'),label=document.createElement('div'),close=document.createElement('button');label.textContent=result.fileName||String(result.title||result.type||'内容预览').slice(0,80);close.textContent='×';close.title='关闭内容预览';close.onclick=clearPreview;header.append(label,close);
    const meta=document.createElement('div');meta.className='search-reading-meta';meta.textContent=[result.type,result.page?'第 '+result.page+' 页':friendlyLocation(result.location),result.canvasName||'项目资料库'].filter(Boolean).join(' · ');
    const body=document.createElement('div');body.className='search-reading-body';pane.append(header,meta,body);document.body.append(pane);
    if(it){const b=itemBounds(it),rect=board.getBoundingClientRect(),menu=document.getElementById('searchResults').getBoundingClientRect(),right=pane.getBoundingClientRect().left-rect.left,z=state.camera.zoom;
      if(b){const centerX=Math.max(b.w*z/2+20,right/2),centerY=Math.min(H-b.h*z/2-90,Math.max(H*.6,menu.bottom-rect.top+b.h*z/2+18));state.camera.x=b.x+b.w/2-centerX/z;state.camera.y=b.y+b.h/2-centerY/z;render();}}
    if(!result.fileId){const value=result.field==='quote'?entity?.sourceRef?.quote:entity?.[result.field||'text'];body.textContent=value||result.snippet||'';highlight(body,result);
      if(result.field==='detail')setTimeout(()=>{if(token===previewGeneration){const read=[...document.querySelectorAll('.detail-read')].find(el=>el.dataset.itemId===String(it?.id));if(read)highlight(read,result);}},300);return;}
    const file=curProject().files.find(f=>f.id===result.fileId);if(!file){body.textContent='原附件已不存在';return;}body.dataset.sourceFileId=file.id;body.textContent='正在打开原文…';
    try{const blob=await readStoredBlob(file);if(token!==previewGeneration)return;
      const staging=document.createElement('div');staging.className='search-document';
      if(file.kind==='pdf'&&blob){body.replaceChildren(staging);await renderPdf(blob,staging,{initialPage:result.page||1,fitToWidth:true});if(token===previewGeneration&&result.field!=='name'&&!highlight(staging,result))meta.textContent+=' · 本页未能精确高亮，请核对原文';}
      else if(blob&&['text','code'].includes(file.kind)){const text=await blob.text();if(/\.(md|markdown)$/i.test(file.name)){staging.className='pv-md-wrap';renderMdDom(text,staging);}else{staging.className='pv-text';staging.textContent=text;}if(token!==previewGeneration)return;body.replaceChildren(staging);if(result.field!=='name')highlight(staging,result);}
      else if(file.sourceOnly){body.textContent=[file.aiSource?.summary,file.aiSource?.locator,file.aiSource?.excerpt].filter(Boolean).join('\n');highlight(body,result);}
      else if(file.kind==='doc'&&blob&&/\.docx$/i.test(file.name)){await renderDocx(blob,staging,file.name);if(token!==previewGeneration)return;body.replaceChildren(staging);if(result.field!=='name'&&!highlight(staging,result)){const fallback=document.createElement('div');fallback.className='search-extracted';fallback.textContent=result.partText||result.snippet;body.prepend(fallback);highlight(fallback,result);meta.textContent+=' · 命中附属文字，显示提取内容';}}
      else{body.textContent=result.partText||result.snippet||'此格式暂不支持正文预览';meta.textContent+=' · 提取文字预览';highlight(body,result);}
      if(it?.type==='fileCard'&&blob&&token===previewGeneration){
        for(let n=0;n<20&&!getMorph(it.id);n++)await new Promise(r=>setTimeout(r,25));
        const morph=getMorph(it.id);if(morph&&token===previewGeneration){
          if(/\.(md|markdown)$/i.test(file.name)){
            for(let n=0;n<80&&!morph.body.querySelector('.pv-md-wrap')&&token===previewGeneration;n++)await new Promise(r=>setTimeout(r,25));
            if(token===previewGeneration&&result.field!=='name')highlight(morph.body,result);
          }else{
            temporary?.changedMorphs.add(it.id);
            const copy=document.createElement('div');copy.className='search-document';
            if(file.kind==='pdf'){await renderPdf(blob,copy,{initialPage:result.page||1,fitToWidth:true});}
            else if(['text','code'].includes(file.kind)){copy.textContent=await blob.text();}
            else copy.textContent=result.partText||result.snippet||'';
            if(token===previewGeneration&&morph.el.isConnected){morph.body.replaceChildren(copy);if(result.field!=='name')highlight(copy,result);}
          }
        }
      }
    }catch(e){if(token===previewGeneration)body.textContent='预览未完成：'+e.message;}
  }
  function friendlyLocation(location){if(!location)return '';if(location.startsWith('word/'))return location.includes('comments')?'文档批注':location.includes('header')?'页眉':location.includes('footer')?'页脚':'文档正文';const slide=/slide(\d+)\.xml/.exec(location);if(slide)return '第 '+slide[1]+' 张幻灯片';return location;}
  function appendMarked(node,text,query){const hits=matches(text,query);let at=0;for(const h of hits){node.append(document.createTextNode(text.slice(at,h.start)));const mark=document.createElement('mark');mark.textContent=text.slice(h.start,h.end);node.append(mark);at=h.end;}node.append(document.createTextNode(text.slice(at)));}
  function bind(){
    const input=document.getElementById('searchInput'),box=document.getElementById('searchResults'),count=document.getElementById('searchCount'),wrap=document.getElementById('searchWrap');
    let category='elements',scope='canvas',timer,last=null,selected=-1,request=0,context=null;
    const labels={elements:'元素',notes:'便签与批注',attachments:'附件'},shortcuts={elements:'Ctrl+F',notes:'Ctrl+Shift+F',attachments:'Ctrl+Alt+F'};
    box.innerHTML='<div class="search-controls"><div class="search-tabs" role="tablist" aria-label="搜索分类"></div><label class="search-scope-label">范围 <select id="searchScope" aria-label="搜索范围"><option value="canvas">当前画布</option><option value="project">当前项目</option></select></label></div><div class="search-summary"></div><div class="search-list" id="searchList" role="listbox" aria-label="搜索结果"></div><div class="search-footer">↑ ↓ 切换预览 <span>Enter 定位 · Esc 收起</span></div>';
    const tabs=box.querySelector('.search-tabs'),summary=box.querySelector('.search-summary'),list=box.querySelector('.search-list');
    input.setAttribute('role','combobox');input.setAttribute('aria-controls','searchList');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
    for(const key of Object.keys(labels)){const b=document.createElement('button');b.type='button';b.textContent=labels[key];b.role='tab';b.title=shortcuts[key];b.dataset.category=key;b.onclick=()=>{category=key;refreshMode();run();input.focus();};tabs.append(b);}
    function refreshMode(){for(const b of tabs.children)b.setAttribute('aria-selected',String(b.dataset.category===category));input.placeholder='搜索'+labels[category]+'…';input.setAttribute('aria-label','搜索'+labels[category]);}
    function open(){box.style.display='block';input.setAttribute('aria-expanded','true');if(!last)summary.textContent='输入关键词，在'+(scope==='canvas'?'当前画布':'当前项目')+'查找'+labels[category];}
    function close(){box.style.display='none';input.setAttribute('aria-expanded','false');request++;generation++;clearTimeout(timer);clearPreview();}
    function choose(index){if(!last?.results.length)return;selected=Math.max(0,Math.min(last.results.length-1,index));paint();const row=list.querySelector('[aria-selected="true"]');row?.scrollIntoView({block:'nearest'});input.setAttribute('aria-activedescendant','search-option-'+selected);locate(last.results[selected]).catch(e=>toast('定位失败：'+e.message));}
    function paint(){list.replaceChildren();if(!last)return;const bad=last.coverage.filter(x=>!['complete','reference'].includes(x.status));summary.textContent=last.results.length+' 处匹配'+(last.coverage.length?' · 已检索 '+last.coverage.length+' 份资料':'');
      const page=Math.floor(Math.max(0,selected)/40),start=page*40;
      last.results.slice(start,start+40).forEach((r,n)=>{const index=start+n,b=document.createElement('button');b.type='button';b.className='search-result';b.id='search-option-'+index;b.role='option';b.setAttribute('aria-selected',String(index===selected));const icon=document.createElement('span');icon.className='search-result-icon';icon.textContent=r.fileId?'▤':r.type==='便签'?'▧':r.field==='annotation'?'✎':'◇';const content=document.createElement('span');content.className='search-result-content';const title=document.createElement('strong');title.textContent=String(r.title||r.fileName||r.type).replace(/\s+/g,' ').slice(0,72);const snippet=document.createElement('span');snippet.className='search-result-snippet';appendMarked(snippet,r.snippet,r.query);const meta=document.createElement('small');meta.textContent=[r.type,r.canvasName||'项目资料库',r.page?'第 '+r.page+' 页':friendlyLocation(r.location)].filter(Boolean).join(' · ');content.append(title,snippet,meta);b.append(icon,content);b.onclick=()=>choose(index);list.append(b);});
      if(!last.results.length){const empty=document.createElement('div');empty.className='search-empty';empty.textContent='没有找到匹配内容，可切换分类或扩大到当前项目';list.append(empty);}
      if(last.results.length>40){const paging=document.createElement('div');paging.className='search-paging';for(const [name,delta]of [['上一组',-1],['下一组',1]]){const b=document.createElement('button');b.textContent=name;b.disabled=page+delta<0||(page+delta)*40>=last.results.length;b.onclick=()=>choose((page+delta)*40);paging.append(b);}list.append(paging);}
      if(bad.length){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=bad.length+' 份资料未完整检索';d.append(s);for(const f of bad){const row=document.createElement('p');row.textContent=f.fileName+'：'+(f.reason||f.status);d.append(row);}list.append(d);}
    }
    async function run(){clearTimeout(timer);const own=++request;generation++;clearPreview();last=null;selected=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');open();if(!input.value.trim()){count.textContent='';return;}context={projectId:state.activeProjectId,canvasId:scope==='canvas'?state.activeCanvasId:undefined};summary.textContent='正在搜索…';try{const result=await query(input.value,{...context,category,onProgress:p=>{if(own===request)summary.textContent='正在检索资料 · '+p.files+' 份';}});if(own!==request||result.cancelled)return;last=result;count.textContent=result.results.length?String(result.results.length):'';paint();}catch(e){if(own===request)summary.textContent='搜索未完成：'+e.message;}}
    box.querySelector('select').onchange=e=>{scope=e.target.value;run();input.focus();};
    input.addEventListener('input',()=>{request++;generation++;clearTimeout(timer);clearPreview();last=null;list.replaceChildren();timer=setTimeout(run,180);});
    input.addEventListener('focus',()=>{if(context&&(context.projectId!==state.activeProjectId||(scope==='canvas'&&context.canvasId!==state.activeCanvasId)))run();else open();});input.addEventListener('click',open);
    wrap.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Escape')close();else if(e.key==='Enter')choose(selected<0?0:selected);else choose(selected+(e.key==='ArrowDown'?1:-1));}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&temporary){e.preventDefault();e.stopImmediatePropagation();close();return;}if((e.ctrlKey||e.metaKey)&&!(e.ctrlKey&&e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();e.stopImmediatePropagation();category=e.altKey?'attachments':e.shiftKey?'notes':'elements';refreshMode();input.focus();input.select();run();}},true);
    document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target)&&!document.getElementById('searchReading')?.contains(e.target)){close();}},true);
    refreshMode();
  }
  return {query,indexed,extract,locate,bind,matches,highlight,clearPreview,archiveView,cancel:()=>generation++};
})();
