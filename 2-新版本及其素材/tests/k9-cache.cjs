const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k9-cache-')));
app.whenReady().then(async()=>{
 let win;
 try{
  for(const [key,value] of Object.entries({'get-version':'0.11.0','get-startup-timings':[],'get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(root,'2-新版本及其素材/desktop/electron/preload.js'),contextIsolation:true}});
  await win.loadFile(path.join(root,'2-新版本及其素材/织见-思维关系板-K6.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   while(document.getElementById('splashScreen'))await new Promise(r=>setTimeout(r,20));document.querySelector('#licenseModal button')?.click();
   const assert=(v,m)=>{if(!v)throw new Error(m)};
   const original=ctx.measureText;let calls=0;ctx.measureText=function(t){calls++;return original.call(this,t)};
   ctx.font='13px sans-serif';wrappedTextCache.clear();wrappedTextChars=0;
   const first=wrapLines(ctx,'缓存换行宽度测试',48),initial=calls;wrapLines(ctx,'缓存换行宽度测试',48);assert(initial>0&&calls===initial,'Repeated layout cached');
   first.push('must not leak');assert(!wrapLines(ctx,'缓存换行宽度测试',48).includes('must not leak'),'Caller cannot mutate cache');
   wrapLines(ctx,'缓存换行宽度测试',120);assert(calls>initial,'Width invalidates layout');const afterWidth=calls;
   ctx.font='24px sans-serif';wrapLines(ctx,'缓存换行宽度测试',120);assert(calls>afterWidth,'Font invalidates layout');
   document.fonts.dispatchEvent(new Event('loadingdone'));assert(!wrappedTextCache.size,'Loaded fonts invalidate layout');ctx.measureText=original;
   ZhijianPerf.enable(true);ZhijianPerf.measure('probe',()=>42);const sample=ZhijianPerf.snapshot();ZhijianPerf.enable(false);assert(sample.tasks.probe.samples===1&&!ZhijianPerf.isEnabled(),'Profiler lifecycle');
   return {ok:true,layoutCache:true,fontInvalidation:true,profilerLifecycle:true,startup:await ZhijianStartup.snapshot()};
  })()`);
  const out=path.join(root,'out/k9-validation');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'cache-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
});
