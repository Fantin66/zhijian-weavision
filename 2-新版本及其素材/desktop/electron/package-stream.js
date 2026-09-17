const fs=require('fs'),path=require('path'),crypto=require('crypto'),{Worker}=require('worker_threads');
const {directoryName}=require('./package-ipc');
function install({ipcMain,dialog,app,getWindow}){
  let current=null;
  const fail=e=>({ok:false,error:e.message});
  async function clean(job){if(!job)return;if(job.worker)await job.worker.terminate();const target=path.resolve(job.scratch);if(path.basename(target).startsWith('.zhijian-l1-'))await fs.promises.rm(target,{recursive:true,force:true});if(current===job)current=null;}
  function owns(event,id){if(!current||current.id!==id||current.owner!==event.sender.id)throw new Error('导入导出任务已结束');return current;}
  function worker(job,args){return new Promise(resolve=>{
    job.worker=new Worker(path.join(__dirname,'package-stream-worker.js'),{workerData:{...args,scratch:job.scratch}});
    let done=false;const end=result=>{if(!done){done=true;resolve(result);}};
    job.worker.on('error',e=>end(fail(e)));job.worker.on('exit',()=>end({ok:false,error:'任务已取消或后台停止'}));
    job.worker.on('message',m=>{if(m.committing){job.committing=true;job.worker.postMessage({commit:true});}if(m.progress)getWindow()?.webContents.send('package-progress',m.progress);if(m.result)end(m.result);});
  });}
  ipcMain.handle('l1-package-begin',async(event,data)=>{
    if(current)return {ok:false,error:'已有导入导出任务'};current={pending:true};let job;
    try{
      if(!['import','export'].includes(data.op)||!['fantin','folder'].includes(data.format))throw new Error('无效任务');
      let input,output;
      if(data.op==='export'){
        const name=directoryName(data.projectName);
        if(data.format==='fantin'){const r=await dialog.showSaveDialog(getWindow(),{defaultPath:name+'.fantin',filters:[{name:'Fantin',extensions:['fantin']}]});if(r.canceled)throw new Error('cancelled');output=r.filePath;}
        else{const r=await dialog.showOpenDialog(getWindow(),{properties:['openDirectory','createDirectory']});if(r.canceled)throw new Error('cancelled');output=path.join(r.filePaths[0],name);let n=2;while(fs.existsSync(output))output=path.join(r.filePaths[0],name+' ('+n+++')');}
      }else{input=data.input;if(!input){const r=await dialog.showOpenDialog(getWindow(),{properties:[data.format==='folder'?'openDirectory':'openFile'],...(data.format==='fantin'?{filters:[{name:'Fantin',extensions:['fantin']}]}:{})});if(r.canceled)throw new Error('cancelled');input=r.filePaths[0];}}
      const scratch=await fs.promises.mkdtemp(path.join(output?path.dirname(output):app.getPath('temp'),'.zhijian-l1-'));
      job=current={id:crypto.randomUUID(),owner:event.sender.id,scratch,op:data.op,format:data.format,output,files:new Map(),total:0};
      if(data.op==='import'){const result=await worker(job,{op:'import',format:data.format,input});if(!result.ok)throw new Error(result.error);for(const f of result.attachments)job.files.set(f.name,{...f,offset:0});return {...result,id:job.id};}
      const json=JSON.stringify(data.structure);if(Buffer.byteLength(json)>16*1024**2)throw new Error('项目结构超过 16MB');
      const dir=path.join(scratch,'package');await fs.promises.mkdir(path.join(dir,'attachments'),{recursive:true});await fs.promises.writeFile(path.join(dir,'data.json'),json);
      for(const f of data.structure.fileMeta||[]){if(f.sourceOnly||f.kind==='link'&&f.url)continue;const name=f.packageName;if(!name||name!==path.basename(name)||/[\\/:*?"<>|]/.test(name)||name==='.'||name==='..')throw new Error('附件名无效');if(job.files.has(name))throw new Error('附件重名');job.files.set(name,{name,offset:0,size:f.size});}
      return {ok:true,id:job.id};
    }catch(e){if(job)await clean(job);else current=null;return fail(e);}
  });
  ipcMain.handle('l1-package-chunk',async(event,data)=>{try{
    const job=owns(event,data.id);if(job.transferring||job.finishing)throw new Error('分块传输尚未结束');const file=job.files.get(data.name);if(!file)throw new Error('附件不在任务清单中');
    const target=path.join(job.scratch,'package','attachments',file.name);
    if(job.op==='export'){
      const buffer=Buffer.from(data.buffer);if(buffer.length>4*1024**2||data.offset!==file.offset)throw new Error('分块顺序或大小无效');if(file.offset+buffer.length>512*1024**2||job.total+buffer.length>2*1024**3)throw new Error('附件超过大小上限');
      job.transferring=true;try{await fs.promises.appendFile(target,buffer);}finally{job.transferring=false;}file.offset+=buffer.length;job.total+=buffer.length;return {ok:true,offset:file.offset};
    }
    if(!Number.isSafeInteger(data.offset)||data.offset<0||data.offset>file.size)throw new Error('读取偏移无效');
    const handle=await fs.promises.open(target,'r');try{const buffer=Buffer.alloc(Math.min(4*1024**2,file.size-data.offset));const {bytesRead}=await handle.read(buffer,0,buffer.length,data.offset);return {ok:true,buffer:buffer.subarray(0,bytesRead),size:file.size};}finally{await handle.close();}
  }catch(e){return fail(e);}});
  ipcMain.handle('l1-package-finish',async(event,data)=>{let job;try{const candidate=owns(event,data.id);if(candidate.transferring||candidate.finishing)throw new Error('任务仍在处理中');job=candidate;job.finishing=true;if(job.op==='import')return {ok:true};for(const f of job.files.values()){if(!fs.existsSync(path.join(job.scratch,'package','attachments',f.name)))throw new Error('附件未传输：'+f.name);if(Number.isSafeInteger(f.size)&&f.size!==f.offset)throw new Error('附件传输不完整：'+f.name);}return await worker(job,{op:'export',format:job.format,output:job.output});}catch(e){return fail(e);}finally{if(job)await clean(job);}});
  ipcMain.handle('l1-package-cancel',async(event,data)=>{try{const job=owns(event,data.id);if(job.committing)return {ok:false,error:'正在提交，请等待完成'};await clean(job);return {ok:true};}catch(e){return fail(e);}});
}
module.exports={install};
