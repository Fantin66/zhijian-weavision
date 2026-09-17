/* Fresh profile only. Run with Electron; optional resources dir tests a packaged build. */
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..'),resources=process.argv[2];
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k8-')));
const out=path.join(root,'out/l1-experience');fs.mkdirSync(out,{recursive:true});
function pdfFixture(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',...Array.from({length:2},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>')];
 let text='%PDF-1.4\n',offsets=[0];objects.forEach((v,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+v+'\nendobj\n';});
 const start=Buffer.byteLength(text);text+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';return Buffer.from(text).toString('base64');
}
function docxFixture(){
 const Zip=require('../desktop/electron/node_modules/adm-zip'),zip=new Zip();
 for(const [name,text] of Object.entries({'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>','_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>','word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>K8 Word preview verified</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>'}))zip.addFile(name,Buffer.from(text));return zip.toBuffer().toString('base64');
}
app.whenReady().then(async()=>{
 let win;const errors=[];
 try{
  for(const [key,value] of Object.entries({'get-version':'0.11.0','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,preload:resources?path.join(resources,'app.asar/preload.js'):path.join(root,'2-新版本及其素材/desktop/electron/preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
  await win.loadFile(resources?path.join(resources,'index.html'):path.join(root,'2-新版本及其素材/织见-思维关系板-K6.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw new Error(m)};
   while(typeof idb==='undefined'||!idb||!state.projects.length)await wait(50);
   while(document.getElementById('splashScreen'))await wait(100);
   document.querySelector('#licenseModal button')?.click();await wait(300);
   const p=createProject('K8 体验验证'),c=curCanvas();c.name='阅读研究';
   const f={id:'f'+uid++,name:'阅读说明.md',kind:'text',blob:new Blob(['# 阅读研究\\n\\n选中文字后，可以复制到便签或其他应用。\\n\\n## 本次改进\\n- 纵览保持预览内容\\n- 附件按画布归档\\n\\n> 原文件保留，方便继续使用。'])};p.files.push(f);await persistBlob(f);
   c.items=[{id:uid++,type:'fileCard',fileId:f.id,name:f.name,kind:'text',x:80,y:60,w:600,h:440,previewOpen:true,_morphW:600,_morphH:440}];
   state.camera={x:0,y:0,zoom:1};renderSidePanel();render();await wait(350);
   let card=c.items[0];const m=getMorph(card.id);assert(m.body.textContent.includes('阅读研究'),'Markdown preview');
   const savedPosition=m.el.style.cssText;state._camInteracting=true;state.camera={x:40,y:30,zoom:.8};render();
   assert(getComputedStyle(m.body).visibility==='hidden','Only content pauses during camera interaction');
   assert(getComputedStyle(m.el.querySelector('.pv-morph-tools')).visibility==='visible','Toolbar remains visible');
   assert(m.el.style.cssText!==savedPosition,'Toolbar geometry follows camera');
   state._camInteracting=false;render();
   const r=m.el.getBoundingClientRect(),expected=w2s(card.x,card.y),boardRect=board.getBoundingClientRect();
   assert(Math.abs(r.x-boardRect.x-expected.x)<2&&Math.abs(r.y-boardRect.y-expected.y)<2,'Restored preview alignment');
   assert(getComputedStyle(previewLayer).visibility!=='hidden'&&getMorph(card.id)===m,'Restore cached preview immediately');
   drag={mode:'pan'};render();assert(getComputedStyle(previewLayer).visibility!=='hidden','Stationary click must not hide preview');onPointerUp({});await wait(40);
   for(const mode of ['pan','move','resize']){drag={mode,previewMoved:true};render();assert(getComputedStyle(m.body).visibility===(mode==='pan'?'hidden':'visible'),'Only camera pan pauses content; ordinary '+mode);drag=null;render();assert(getComputedStyle(m.body).visibility==='visible','Restore preview for '+mode);}
   drag={mode:'resize',previewMoved:true,item:card};render();assert(getComputedStyle(m.body).visibility==='hidden'&&getComputedStyle(m.el.querySelector('.pv-morph-tools')).visibility==='visible','Resize pauses only target content');drag=null;render();
   drag={mode:'pan',previewMoved:true};render();onPointerUp({});await wait(40);assert(getComputedStyle(previewLayer).visibility!=='hidden','Pointer release restores preview without another gesture');
   const paragraph=m.body.querySelector('p'),range=document.createRange();range.selectNodeContents(paragraph);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
   const transfer=new DataTransfer();paragraph.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
   assert(transfer.types.includes(EXCERPT_DRAG_TYPE),'Selection drag recognized');
   const bx=board.getBoundingClientRect(),dropX=bx.right-70,dropY=bx.top+500,point=s2w(dropX-bx.left,dropY-bx.top);
   canvas.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:dropX,clientY:dropY}));assert(dropOverlay.style.display==='none','No false file import prompt');
   canvas.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:dropX,clientY:dropY}));
   let excerpt=c.items.find(x=>x.type==='note'&&x.sourceRef);assert(excerpt&&excerpt.x===Math.round(point.x)&&excerpt.y===Math.round(point.y),'Excerpt created at drop coordinates');
   const ordinary=addNote(100,100,'ordinary');state.selected=ordinary.id;render();assert(selbar.querySelector('.source-action')?.disabled,'Ordinary note source disabled');state.selected=excerpt.id;render();
   assert(dockInner.textContent.includes('查看来源'),'Dock refreshes when switching selected notes');
   assert(selbar.style.display==='flex'&&!selbar.querySelector('.source-action').disabled,'Floating source button enabled');assert(selbar.querySelector('.source-action svg')&&selbar.querySelector('.source-action').getAttribute('aria-label')==='查看来源','Source icon has accessible label');
   selbar.querySelector('.source-action').click();await wait(400);assert(document.querySelector('#fullscreenView .k6-source-highlight'),'Visible source button navigates');closeFullscreen();await wait(400);
   c.items=c.items.filter(x=>x!==ordinary);
   const excerptId=excerpt.id;assert(excerpt.sourceRef.fileId===f.id,'Excerpt source attached');undo();assert(!state.items.some(x=>x.id===excerptId),'Undo excerpt');redo();excerpt=state.items.find(x=>x.id===excerptId);card=state.items.find(x=>x.id===card.id);assert(excerpt?.sourceRef.fileId===f.id,'Redo source');
   await openSourceRef(excerpt);await wait(400);assert(document.querySelector('#fullscreenView .k6-source-highlight')?.textContent===excerpt.sourceRef.quote,'Return to original quote');closeFullscreen();await wait(400);
   const split=document.createElement('div');split.innerHTML='<p>前文<strong>重复</strong>句子</p><p>后文重复句子结束</p>';document.body.appendChild(split);
   assert(highlightExcerptSource(split,'重复句子',{start:10,prefix:'前文重复句子后文',suffix:'结束'}),'Multi-node quote');
   assert([...split.querySelectorAll('mark')].map(x=>x.textContent).join('')==='重复句子','Exact highlight text');split.remove();
   assert(resolveExcerptOffset('重复句子和重复句子','重复句子',null)===-1,'Ambiguous quote must not select wrong occurrence');
   const gaps=[];let last=performance.now(),running=true;function sample(t){gaps.push(t-last);last=t;if(running)requestAnimationFrame(sample);}requestAnimationFrame(sample);
   state.camera.zoom=.8;state.reducedMotion=true;animateCamera(0,0,1);await wait(60);
   assert(state._camInteracting&&state.camera.zoom>.8&&state.camera.zoom<1,'Background toggle must not disable camera animation');
   animateCamera(20,10,.9);await wait(500);running=false;
   assert(state.camera.x===20&&state.camera.y===10&&state.camera.zoom===.9,'Latest camera animation wins');
   assert(getMorph(card.id)===m,'Preview DOM reused');
   enterFocus(card.id);await wait(60);assert(focusTransition>0&&focusTransition<1&&state._camInteracting,'Focus fade and camera animation remain');await wait(300);exitFocus();await wait(300);
   state._camInteracting=true;card.name='保存验证';assert(await saveState(),'Explicit save');assert((await L1Storage.load()).projects.find(x=>x.id===p.id).canvases[0].items[0].name==='保存验证','Save really persisted during interaction');state._camInteracting=false;
   const target=createProject('目标项目');target.folders.push({id:'existing',name:'阅读研究',parentId:null});
   state.activeProjectId=p.id;state.activeCanvasId=c.id;moveCanvasToProject(c.id,target.id);
   const moved=target.files.find(x=>x.id===f.id),folder=target.folders.find(x=>x.id===moved.folderId);
   assert(folder.name==='阅读研究（2）','Folder collision');assert(p.files.includes(f),'Source retained');assert(await readStoredBlob(moved),'Moved attachment readable');
   await wait(350);render();const sorted=gaps.filter(n=>n>0).sort((a,b)=>a-b);
   return {sourceButtonVisible:true,dockSelectionRefresh:true,toolbarVisibleDuringCamera:true,ordinaryNoteDragKeepsPreview:true,targetResizePausesContent:true,clickPreviewRestored:true,excerptDrop:true,excerptUndoRedo:true,excerptSourceHighlight:true,cachedRestore:true,cameraAnimation:true,focusAnimation:true,frameGaps:{samples:sorted.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},folder:folder.name};
  })()`);
  const clickPoint=await win.webContents.executeJavaScript(`(()=>{const b=board.getBoundingClientRect();return {x:Math.round(b.right-30),y:Math.round(b.top+180)}})()`);
  for(let i=0;i<3;i++){
   win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...clickPoint});
   win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...clickPoint});
   await new Promise(r=>setTimeout(r,80));
   await win.webContents.executeJavaScript(`if(getComputedStyle(previewLayer).visibility==='hidden')throw new Error('Real mouse click left preview hidden');`);
  }
  fs.writeFileSync(path.join(out,'light.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(()=>{const note=state.items.find(i=>i.sourceRef);state.selected=note.id;state.camera.x=note.x-400;state.camera.y=note.y-180;render();})()`);
  await new Promise(r=>setTimeout(r,150));
  fs.writeFileSync(path.join(out,'source-entry.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(async()=>{state.dark=true;_applyThemeInner();render();await new Promise(r=>setTimeout(r,250));if(getComputedStyle(document.getElementById('saveStatus')).position!=='fixed')throw new Error('Save status CSS broken');})()`);
  fs.writeFileSync(path.join(out,'dark.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`showSettings();`);
  await new Promise(r=>setTimeout(r,250));
  fs.writeFileSync(path.join(out,'settings.png'),(await win.webContents.capturePage()).toPNG());
  const documents=await win.webContents.executeJavaScript(`(async()=>{
    const blob=s=>new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))]);
    const host=document.createElement('div');document.body.appendChild(host);
    try{
      await renderPdf(blob('${pdfFixture()}'),host,{fitToWidth:true});
      if(host.querySelectorAll('canvas').length!==1||!host.textContent.includes('1 / 2'))throw new Error('PDF must initially render one page with controls');
      const buttons=host.querySelectorAll('button');buttons[1].click();buttons[0].click();await new Promise(r=>setTimeout(r,200));
      if(!host.textContent.includes('1 / 2'))throw new Error('Rapid PDF paging');
      const work=renderDocxDirect(blob('${docxFixture()}'),host,'test.docx');
      if(!host.querySelector('.pv-loading'))throw new Error('Word loading indicator missing');
      await work;if(!host.textContent.includes('K8 Word preview verified')||host.querySelector('.pv-loading'))throw new Error('Word preview completion');
      return {pdfFirstPage:true,pdfRapidPaging:true,wordLoading:true,wordContent:true};
    }finally{host.remove();}
  })()`);
  const stress=await win.webContents.executeJavaScript(`(async()=>{
    hideModal();state.dark=false;_applyThemeInner();
    const p=createProject('密集场景验证'),c=curCanvas();
    const f={id:'f'+uid++,name:'压力测试.md',kind:'text',blob:new Blob(['# Preview\\n'+('Paragraph text\\n\\n'.repeat(40))])};p.files.push(f);await persistBlob(f);
    c.items=Array.from({length:1000},(_,i)=>({id:uid++,type:'note',text:'节点 '+i,color:'#fff1b8',x:(i%40)*180,y:Math.floor(i/40)*100,w:140,h:70}));
    for(let i=0;i<10;i++)c.items.push({id:uid++,type:'fileCard',fileId:f.id,name:f.name,kind:'text',x:i*620,y:-500,w:580,h:400,previewOpen:true,_morphW:580,_morphH:400});
    state.camera={x:0,y:0,zoom:1};render();await new Promise(r=>setTimeout(r,1000));
    const gaps=[];let last=performance.now(),run=true;function tick(t){gaps.push(t-last);last=t;if(run)requestAnimationFrame(tick);}requestAnimationFrame(tick);
    fitAll();await new Promise(r=>setTimeout(r,1800));run=false;
    gaps.sort((a,b)=>a-b);return {items:c.items.length,previews:morphMap.size,samples:gaps.length,p95:gaps[Math.floor(gaps.length*.95)],max:gaps.at(-1)};
  })()`);
  if(errors.length)throw new Error(errors.join('\n'));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,...result,documents,stress,errors},null,2));console.log(JSON.stringify({ok:true,...result,documents,stress,errors}));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
});
setTimeout(()=>{console.error('Validation timed out');app.exit(1)},45000).unref();
