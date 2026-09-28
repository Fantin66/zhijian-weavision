const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-l1-test-'));app.setPath('userData',profile);
const base=path.resolve(__dirname,'..'),resources=process.argv[2];
function pdfFixture(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(const text of ['First searchable page','Second needle PDF source']){const stream='BT /F1 14 Tf 30 330 Td ('+text+') Tj ET';objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');}
 let text='%PDF-1.4\n',offsets=[0];objects.forEach((v,i)=>{offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+v+'\nendobj\n';});const start=Buffer.byteLength(text);text+='xref\n0 8\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';return Buffer.from(text).toString('base64');
}
app.whenReady().then(async()=>{
 let win;const errors=[];const watchdog=setTimeout(()=>{console.error('TIMEOUT',errors);app.exit(2)},60000);
 try{
  for(const [key,value]of Object.entries({'get-version':'0.11.0','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,preload:resources?path.join(resources,'app.asar/preload.js'):path.join(base,'desktop/electron/preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  require(resources?path.join(resources,'app.asar/package-stream.js'):path.join(base,'desktop/electron/package-stream.js')).install({ipcMain,app,getWindow:()=>win,dialog:{showSaveDialog:async()=>({filePath:path.join(profile,'roundtrip.fantin')}),showOpenDialog:async()=>({filePaths:[path.join(profile,'roundtrip.fantin')]})}});
  win.webContents.on('console-message',(_e,l,m)=>{if(l>=3)errors.push(m)});
  await win.loadFile(resources?path.join(resources,'index.html'):path.join(base,'index.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),passed=[];
    function assert(v,m){if(!v)throw new Error(m);passed.push(m);}
    while(!idb||!state.projects.length||document.getElementById('splashScreen'))await wait(40);
    createProject('L1 regression');const p=curProject(),c=curCanvas();
    const n=addMindNode('needle node',null,null,50,50),n2=addMindNode('second',null,null,500,50);
    n.detail='needle detail';n.annotation='needle annotation';addNote(10,300,'needle note');
    const file={id:'f'+uid++,name:'source.txt',kind:'text',size:12,blob:new Blob(['needle attachment'])};p.files.push(file);await persistBlob(file);
    assert(await saveState(),'atomic save succeeds');
    const snapshot=await L1Storage.load();assert(snapshot.projects.some(x=>x.id===p.id),'archive reload contains project');
    let r=await ZhijianAI.execute({op:'update_item',itemId:n.id,patch:{text:'bad',w:'bad'}});assert(!r.ok&&state.items.find(x=>x.id===n.id).text==='needle node','invalid operation rolls back all fields');
    r=await ZhijianAI.execute({op:'delete_item',itemId:n.id});assert(!r.ok&&state.items.some(x=>x.id===n.id),'unconfirmed deletion rejected');
    r=await ZhijianAI.execute({op:'activate',canvasId:'missing'});assert(!r.ok,'missing canvas rejected');
    r=await ZhijianAI.execute({op:'relate',from:n.id,to:n2.id,type:'supports'});assert(r.ok&&r.persisted,'AI success includes committed persistence');
    r=await ZhijianAI.execute({op:'relate',from:n2.id,to:n.id,type:'causes'});assert(r.ok&&state.links.length===2,'reverse directed relations are distinct');
    const command={op:'create_note',text:'idempotent',requestId:'req1'};const first=await ZhijianAI.execute(command),again=await ZhijianAI.execute(command);assert(first.ok&&again.value.id===first.value.id&&state.items.filter(x=>x.text==='idempotent').length===1,'retry request is idempotent');
    assert(!(await ZhijianAI.execute({...command,text:'different'})).ok,'request id cannot change payload');
    r=await ZhijianAI.execute({op:'batch',commands:[{op:'create_note',text:'rollback-me'},{op:'activate',canvasId:'missing'}]});assert(!r.ok&&!state.items.some(x=>x.text==='rollback-me'),'failed batch rolls back');
    const hits=await L1Search.query('needle');assert(['元素','节点详情','元素批注','便签','附件'].every(type=>hits.results.some(r=>r.type===type)),'penetrating search includes five content types');
    const source=aiRegisterSource({name:'reference.pdf',summary:'reference summary',locator:'page 7'});addFileCard(500,300,source.id);
    const packed=PackageModel.encode(curProject());let next=9000;const copy=PackageModel.decode(packed,packed.fileMeta.filter(f=>!f.sourceOnly).map(f=>({name:f.packageName,blob:file.blob})),prefix=>prefix+(next++));assert(copy.files.some(f=>f.sourceOnly&&f.aiSource.summary==='reference summary'),'source-only material round trip');
    await queueRecovery('test-one');const blobCount=(await L1Storage.all('l1RecoveryBlobs')).length;await queueRecovery('test-two');const recoveries=await L1Storage.records();assert(recoveries.length>=2,'recovery history available');assert((await L1Storage.all('l1RecoveryBlobs')).length===blobCount,'recovery deduplicates unchanged attachments');
    const hydrated=await L1Storage.hydrate(recoveries[0]);assert(await hydrated.blobs.find(b=>b.id===file.id).blob.text()==='needle attachment','recovery restores exact attachment');
    assert(L1Research.shortest(curCanvas(),n.id,n2.id,'supports','out').length===2,'directed relation path found');assert(L1Research.shortest(curCanvas(),n2.id,n.id,'supports','out').length===0,'directed path rejects reverse traversal');
    const pdf={id:'f'+uid++,name:'fixture.pdf',kind:'pdf',blob:new Blob([Uint8Array.from(atob('${pdfFixture()}'),ch=>ch.charCodeAt(0))],{type:'application/pdf'})};curProject().files.push(pdf);await persistBlob(pdf);
    const extracted=await L1Search.extract(pdf);assert(extracted.parts.length===2&&extracted.parts[1].text.includes('needle'),'PDF all pages searchable');
    openFullscreen(pdf,{sourcePage:2,sourceQuote:'needle'});let tries=0;while(!document.querySelector('#fullscreenView .l1-pdf-text span')&&tries++<100)await wait(50);
    const pdfPage=document.querySelector('#fullscreenView [data-pdf-page]');assert(pdfPage?.dataset.pdfPage==='2','PDF source opens exact page');
    const span=pdfPage.querySelector('.l1-pdf-text span'),selection=window.getSelection(),range=document.createRange();range.selectNodeContents(span);selection.removeAllRanges();selection.addRange(range);l1ExcerptSelection();
    const excerpt=state.items.find(i=>i.sourceRef?.fileId===pdf.id);assert(excerpt?.sourceRef.page===2&&excerpt.sourceRef.quote.includes('needle'),'PDF selected text creates excerpt with page');
    closeFullscreen();await wait(400);await openSourceRef(excerpt);tries=0;while(!document.querySelector('#fullscreenView [data-pdf-page="2"] .k6-source-highlight')&&tries++<100)await wait(50);assert(document.querySelector('#fullscreenView [data-pdf-page="2"] .k6-source-highlight'),'PDF excerpt source highlighted on return');closeFullscreen();
    await ensureCdn('sheet');const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['needle cell',42]]),'Evidence');const sheet={id:'f'+uid++,name:'data.xlsx',kind:'sheet',blob:new Blob([XLSX.write(book,{type:'array',bookType:'xlsx'})])};curProject().files.push(sheet);assert((await L1Search.extract(sheet)).parts.some(p=>p.label==='Evidence!A1'&&p.text.includes('needle')),'spreadsheet body includes cell location');
    await ensureCdn('doc');const zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="urn:test"><w:p><w:r><w:t>needle docx body</w:t></w:r></w:p></w:document>');zip.file('word/comments.xml','<w:comments xmlns:w="urn:test"><w:t>needle document comment</w:t></w:comments>');const doc={id:'f'+uid++,name:'source.docx',kind:'doc',blob:await zip.generateAsync({type:'blob'})};curProject().files.push(doc);const documentText=await L1Search.extract(doc);assert(documentText.parts.length===2&&documentText.parts.some(p=>p.text.includes('document comment')),'Word body and embedded comments searchable');
    const unsupported={id:'f'+uid++,name:'scan.png',kind:'img',blob:new Blob(['not-readable'])};assert((await L1Search.extract(unsupported)).status==='unread','unsupported image cannot claim full-text coverage');
    assert(ZHIJIAN_AI_GUIDE.full.includes('必须 await')&&ZHIJIAN_AI_GUIDE.full.includes('attachIds'),'exported skill matches L1 contract');
    L1Research.showUsages(pdf.id);assert(modal.querySelectorAll('#l1UsageList button').length>0,'material usages expose excerpt location');hideModal();
    L1Research.showRelations();modal.querySelector('#l1RelFrom').value=String(n.id);modal.querySelector('#l1RelTo').value=String(n2.id);modal.querySelector('#l1FindPath').click();await modal.querySelector('#l1SavePath').onclick();assert(curProject().readingPaths?.[0]?.steps.length===2,'reading path saved from relation dialog');hideModal();
    const jumpItem=state.items.find(i=>i.id===n.id);jumpItem.jumpTo={canvasId:'outside-package'};const cancelledExport=k6Export('canvas','fantin');tries=0;while(!modal.classList.contains('show')&&tries++<100)await wait(20);hideModal();await cancelledExport;assert(!packageBusy,'closing export impact dialog cancels cleanly');delete jumpItem.jumpTo;
    const searchPdf=(await L1Search.query('needle',{projectId:curProject().id,category:'attachments'})).results.find(r=>r.fileId===pdf.id&&r.page===2);await L1Search.locate(searchPdf);assert(document.querySelector('#searchReading [data-pdf-page="2"] mark.search-hit'),'search preview opens matching PDF page and highlights text');L1Search.clearPreview();
    await k6Export('project','fantin');assert(!packageBusy&&!packageTaskId,'desktop streaming export finishes');
    const projectCount=state.projects.length,original=curProject();await k6Import('fantin');assert(state.projects.length===projectCount+1&&curProject().name===original.name,'packaged streaming worker and IPC import round trip');assert(curProject().files.length===original.files.length,'streaming import retains all material records');
    return {passed,api:ZhijianAI.version};
  })()`);
  console.log(JSON.stringify({ok:true,...result,errors},null,2));clearTimeout(watchdog);app.exit(errors.length?1:0);
 }catch(e){console.error(e.stack,errors);clearTimeout(watchdog);app.exit(1);}
});
