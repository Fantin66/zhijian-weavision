/* Measures isolated Electron renderer startup, not single-exe extraction. */
const start=Date.now();
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const resources=process.argv[2];
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-startup-')));
app.whenReady().then(async()=>{
 let win;
 try{
  for(const [key,value] of Object.entries({'get-version':'benchmark','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(resources,'app.asar/preload.js'),contextIsolation:true,sandbox:true}});
  const windowMs=Date.now()-start;
  await win.loadFile(path.join(resources,'index.html'));
  const loadedMs=Date.now()-start;
  await win.webContents.executeJavaScript(`(async()=>{const limit=Date.now()+15000;while(document.getElementById('splashScreen')&&Date.now()<limit)await new Promise(r=>setTimeout(r,10));if(document.getElementById('splashScreen'))throw new Error('startup timeout');})()`);
  console.log(JSON.stringify({windowMs,loadedMs,readyMs:Date.now()-start}));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
});
