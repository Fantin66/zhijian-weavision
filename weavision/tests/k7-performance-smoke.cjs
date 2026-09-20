/* Run with Electron against a fresh profile and a packaged resources directory. */
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k7-perf-'));
app.setPath('userData',profile);
const resources=path.resolve(process.argv[2]||path.join(root,'out/k7-release-installer/win-unpacked/resources'));
app.whenReady().then(async()=>{
  let win;
  try{
    for(const [name,value] of Object.entries({'get-version':'0.9.0','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true,'cancel-quit':true}))ipcMain.handle(name,()=>value);
    win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{preload:path.join(resources,'app.asar','preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    await win.loadFile(path.join(resources,'index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const until=Date.now()+10000;while((typeof ZhijianPerf==='undefined'||!state.projects.length)&&Date.now()<until)await new Promise(r=>setTimeout(r,30));
      if(typeof ZhijianPerf==='undefined')throw new Error('K7 performance module unavailable');
      const p=createProject('K7 性能验证'),c=curCanvas(),root={id:'perf-root',type:'mindNode',text:'性能根节点',x:0,y:0,children:[],color:'#3a4a6b'};
      c.items=[root];c.links=[];
      for(let i=1;i<5000;i++){const id='perf-'+i;root.children.push(id);c.items.push({id,type:'mindNode',text:'节点 '+i,x:(i%100)*260+320,y:Math.floor(i/100)*110,children:[],parentId:root.id,color:'#6f8ed9'});}
      c.camera={x:0,y:0,zoom:1};ZhijianPerf.enable();render();ZhijianPerf.clear();for(let i=0;i<8;i++)render();
      const s=ZhijianPerf.snapshot();
      if(s.frames<8||s.last.items!==5000||s.last.visible>=5000||!Number.isFinite(s.p95))throw new Error('Invalid performance snapshot '+JSON.stringify(s));
      return s;
    })()`);
    console.log(JSON.stringify({ok:true,result}));
  }catch(e){console.error(JSON.stringify({ok:false,error:e.stack}));process.exitCode=1;}
  finally{if(win)win.destroy();app.exit(process.exitCode||0);}
});
