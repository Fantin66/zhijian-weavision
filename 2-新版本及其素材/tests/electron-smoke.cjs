/* Run with Electron, never against an existing user profile. */
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k6-smoke-'));
app.setPath('userData',profile);
const packaged=process.argv[2]||path.join(root,'out/k6-final-installer/win-unpacked/resources');
const resources=path.resolve(packaged);
const results=[],errors=[];
app.whenReady().then(async()=>{
  let win;
  try{
    for(const [name,value] of Object.entries({'get-version':'0.8.0','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true,'cancel-quit':true}))ipcMain.handle(name,()=>value);
    win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{preload:path.join(resources,'app.asar','preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
    await win.loadFile(path.join(resources,'index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const deadline=Date.now()+10000;while((typeof state==='undefined'||!state.projects.length||!document.getElementById('saveStatus'))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
      if(typeof PackageModel==='undefined'||typeof k6Export!=='function')throw new Error('K6 modules unavailable');
      const p=createProject('桌面独立验证');const c=curCanvas();c.items=[{id:uid++,type:'note',text:'桌面测试',x:0,y:0,w:120,h:70}];
      const f={id:'f'+uid++,name:'证据.txt',kind:'text',blob:new Blob(['desktop-test'])};p.files.push(f);await persistBlob(f);
      const saved=await flushPersistence();
      const snapshot=PackageModel.encode(p);const recovery=await queueRecovery('桌面验证恢复点');
      return {version:await window.electronAPI.getVersion(),saved,recovery,files:snapshot.fileMeta.length,canvasItems:curCanvas().items.length};
    })()`);
    results.push(result);
    if(result.version!=='0.8.0'||!result.saved||!result.recovery||result.files!==1||result.canvasItems!==1)throw new Error('Desktop regression failed');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ok:true,results,errors}));
  }catch(e){console.error(JSON.stringify({ok:false,error:e.stack,results,errors}));process.exitCode=1;}
  finally{if(win)win.destroy();app.exit(process.exitCode||0);}
});
