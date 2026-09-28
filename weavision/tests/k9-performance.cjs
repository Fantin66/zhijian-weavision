const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..'),tag=process.argv[2]||'baseline';
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k9-perf-')));
app.whenReady().then(async()=>{
 let win;
 try{
  for(const [key,value] of Object.entries({'get-version':'0.11.0','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(root,'weavision/desktop/electron/preload.js'),contextIsolation:true}});
  await win.loadFile(path.join(root,'weavision/index.html'));
  const results=await win.webContents.executeJavaScript(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));while(document.getElementById('splashScreen'))await wait(20);document.querySelector('#licenseModal button')?.click();await wait(350);
   const results=[];const p=createProject('K9 固定性能样本'),c=curCanvas();
   for(const count of [500,2000,5000]){
    c.items=Array.from({length:count},(_,i)=>({id:100000+i,type:'note',text:'固定节点 '+i,color:'#fff1b8',x:(i%50)*200,y:Math.floor(i/50)*120,w:160,h:80}));c.links=[];rebuildIdMap();
    for(let run=0;run<3;run++){
     state.camera={x:0,y:0,zoom:1};render();await wait(200);ZhijianPerf.clear();ZhijianPerf.enable();
     for(let step=0;step<30;step++){state._camInteracting=true;state.camera.x=step*12;state.camera.y=step*5;render();await new Promise(r=>requestAnimationFrame(r));}
     state._camInteracting=false;render();await wait(100);const pan=ZhijianPerf.snapshot();ZhijianPerf.clear();
     fitAll();await wait(600);const overview=ZhijianPerf.snapshot();ZhijianPerf.enable(false);
     results.push({count,run,pan,overview});
    }
   }
   return {environment:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,userAgent:navigator.userAgent},results};
  })()`);
  const out=path.join(root,'out/k9-validation');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,tag+'.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.results.map(r=>({count:r.count,run:r.run,pan:r.pan.p95,overview:r.overview.p95,stages:r.overview.stages,gaps:r.overview.frameGaps.max}))));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
});
