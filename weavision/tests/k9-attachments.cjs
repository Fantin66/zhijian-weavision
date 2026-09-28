const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..'),tag=process.argv[2]||'attachments-baseline';
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k9-attachments-')));
app.whenReady().then(async()=>{
 let win;
 try{
  for(const [key,value] of Object.entries({'get-version':'0.11.0','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(root,'weavision/desktop/electron/preload.js'),contextIsolation:true}});
  await win.loadFile(path.join(root,'weavision/index.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));while(document.getElementById('splashScreen'))await wait(20);document.querySelector('#licenseModal button')?.click();await wait(300);
   const results=[];let reads=0;const read=getBlob;getBlob=function(...args){reads++;return read(...args)};
   for(const count of [20,30]){
    const p=createProject('附件场景 '+count),c=curCanvas();
    c.items=Array.from({length:50},(_,i)=>({id:uid++,type:'note',text:'便签 '+i,color:'#fff1b8',x:i%10*180,y:2300+Math.floor(i/10)*100,w:150,h:80}));
    for(let i=0;i<count;i++){
     const f={id:'k9-'+count+'-'+i,name:'材料'+i+(i%2?'.txt':'.md'),kind:'text',blob:new Blob(['# 附件测试\\n\\n'+('说明文字与引用内容。\\n\\n'.repeat(160))])};p.files.push(f);
     c.items.push({id:uid++,type:'fileCard',fileId:f.id,name:f.name,kind:'text',x:i%6*640,y:Math.floor(i/6)*440,w:600,h:400,previewOpen:true,_morphW:600,_morphH:400});
    }
    rebuildIdMap();reads=0;const start=performance.now();fitAll();
    while(morphMap.size<count||[...morphMap.values()].some(m=>m.body.querySelector('.pv-loading'))){if(performance.now()-start>15000)throw new Error('Attachment initialization timeout');await wait(30);}
    const loadMs=performance.now()-start,initialReads=reads;await wait(300);
    for(let run=0;run<3;run++){
     ZhijianPerf.clear();ZhijianPerf.enable();const before=reads;
     animateCamera(state.camera.x+200,state.camera.y+100,state.camera.zoom*1.15);await wait(400);fitAll();await wait(500);
     const snapshot=ZhijianPerf.snapshot();ZhijianPerf.enable(false);
     results.push({count,notes:50,run,loadMs,initialReads,extraReads:reads-before,previews:morphMap.size,snapshot});
    }
   }
   getBlob=read;return results;
  })()`);
  const out=path.join(root,'out/k9-validation');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,tag+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result.map(r=>({count:r.count,run:r.run,loadMs:r.loadMs,reads:r.initialReads,extra:r.extraReads,p95:r.snapshot.p95,gap:r.snapshot.frameGaps.max}))));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
});
