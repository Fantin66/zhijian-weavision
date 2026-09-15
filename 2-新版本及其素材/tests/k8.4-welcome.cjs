/* Isolated visual replay: actual welcome markup/CSS, without slowing normal startup. */
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'../..'),resources=process.argv[2];
const html=resources?path.join(resources,'index.html'):path.join(root,'2-新版本及其素材/织见-思维关系板-K6.html');
const markup=fs.readFileSync(html,'utf8').split('<!-- G1 启动动画 -->')[1].split('<header')[0];
const out=path.join(root,'out/k8.4-validation');fs.mkdirSync(out,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-welcome-')));
app.whenReady().then(async()=>{
 let win;
 try{
  for(const [key,value] of Object.entries({'get-version':'0.10.4','get-system-theme':false,'get-open-file':null,'set-taskbar-icon':{ok:true},'set-fantin-icon':{ok:true},'quit-modal-ready':true}))ipcMain.handle(key,()=>value);
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,backgroundThrottling:false,preload:resources?path.join(resources,'app.asar/preload.js'):path.join(root,'2-新版本及其素材/desktop/electron/preload.js'),contextIsolation:true}});
  await win.loadFile(html);
  await win.webContents.executeJavaScript(`(async()=>{while(document.getElementById('splashScreen'))await new Promise(r=>setTimeout(r,20));document.querySelector('#licenseModal button')?.click();})()`);
  const result=[];
  for(const theme of ['light','dark']){
   await win.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.insertAdjacentHTML('beforeend',${JSON.stringify(markup)});`);
   await new Promise(r=>setTimeout(r,550));
   fs.writeFileSync(path.join(out,'welcome-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
   result.push(await win.webContents.executeJavaScript(`(async()=>{
    const el=document.getElementById('splashScreen'),logo=el.querySelector('img'),dot=el.querySelector('.splash-thread');
    if(!logo.complete||!logo.naturalWidth)throw new Error('Welcome logo missing');
    const before=getComputedStyle(dot).transform;await new Promise(r=>setTimeout(r,180));
    if(before===getComputedStyle(dot).transform&&!matchMedia('(prefers-reduced-motion: reduce)').matches)throw new Error('Welcome animation static');
    const start=performance.now();dismissSplash();
    if(getComputedStyle(el).pointerEvents!=='none')throw new Error('Welcome blocks ready app');
    while(el.isConnected){if(performance.now()-start>500)throw new Error('Welcome exit delayed');await new Promise(r=>setTimeout(r,10));}
    return {theme:${JSON.stringify(theme)},animated:true,exitMs:Math.round(performance.now()-start),inputReleased:true};
   })()`));
  }
  const reading=await win.webContents.executeJavaScript(`(async()=>{
   const p=createProject('阅读居中验证');document.documentElement.dataset.theme='light';
   const results=[];
   for(const ext of ['md','txt']){
    const f={id:'reading-'+ext,name:'阅读居中.'+ext,kind:'text',blob:new Blob(['# 阅读居中\\n\\n正文保持左对齐，页面保持居中。'.repeat(12)])};p.files.push(f);
    openFullscreen(f);await new Promise(r=>setTimeout(r,450));
    const body=document.querySelector('#fullscreenView .fv-body'),content=body.querySelector('.pv-md-wrap,pre.pv-text');
    if(!content)throw new Error('Reading content missing');
    for(const zoom of [.75,1,1.5]){
     applyFullscreenZoom(zoom);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const b=body.getBoundingClientRect(),c=content.getBoundingClientRect();
     const error=Math.abs((c.left+c.right)*zoom-(2*b.left+body.clientWidth));
     if(error>3)throw new Error('Reading not centered: '+ext+' zoom '+zoom+' error '+error+' b '+JSON.stringify(b)+' c '+JSON.stringify(c));
     results.push({ext,zoom,centerError:error});
    }
    applyFullscreenZoom(1);
    closeFullscreen();await new Promise(r=>setTimeout(r,350));
   }
   openFullscreen(p.files[0]);await new Promise(r=>setTimeout(r,450));return results;
  })()`);
  fs.writeFileSync(path.join(out,'reading-centered.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(900,600);await new Promise(r=>setTimeout(r,200));
  reading.push(await win.webContents.executeJavaScript(`(()=>{
   const body=document.querySelector('#fullscreenView .fv-body'),content=body.querySelector('.pv-md-wrap');
   const b=body.getBoundingClientRect(),c=content.getBoundingClientRect(),error=Math.abs(c.left+c.right-2*b.left-body.clientWidth);
   if(error>3||c.width>body.clientWidth)throw new Error('Narrow reading layout');
   return {width:900,centerError:error};
  })()`));
  fs.writeFileSync(path.join(out,'reading-narrow.png'),(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(out,'reading-result.json'),JSON.stringify(reading,null,2));
  fs.writeFileSync(path.join(out,'welcome-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{win?.destroy();app.exit(process.exitCode||0);}
});
