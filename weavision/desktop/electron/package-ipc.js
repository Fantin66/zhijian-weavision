"use strict";
const fs=require("fs"),path=require("path"),{Worker}=require("worker_threads");
function directoryName(value){
  const name=String(value||"织见画布").replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").replace(/[. ]+$/g,"").trim();
  if(!name||name==="."||name===".."||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new Error("项目名称不能用作文件夹名称，请先重命名项目");return name;
}
function install({ipcMain,dialog,app,getWindow}){
  let active=null;
  async function run(op,input,output,data){
    if(active)return {ok:false,error:"已有导入导出任务正在运行"};
    const job={worker:null,cancelled:false,committing:false};active=job;let scratch;
    try{
      scratch=await fs.promises.mkdtemp(path.join(output?path.dirname(output):app.getPath("temp"),".zhijian-job-"));
      if(job.cancelled)return {ok:false,error:"cancelled"};
      return await new Promise(resolve=>{
        const worker=job.worker=new Worker(path.join(__dirname,"package-worker.js"),{workerData:{op,input,output,data,scratch}});
        let done=false;const finish=r=>{if(!done){done=true;resolve(r);}};
        worker.on("message",m=>{if(m.committing&&!job.cancelled){job.committing=true;worker.postMessage({commit:true});}const win=getWindow();if(m.progress&&win&&!win.isDestroyed())win.webContents.send("package-progress",m.progress);if(m.result)finish(m.result);});
        worker.on("error",e=>finish({ok:false,error:e.message}));worker.on("exit",()=>finish({ok:false,error:job.cancelled?"cancelled":"后台处理意外停止"}));
      });
    }catch(e){return {ok:false,error:e.message};}
    finally{
      if(job.worker)await job.worker.terminate();
      // This exact path is created by mkdtemp above, never derived from project names.
      if(scratch)await fs.promises.rm(scratch,{recursive:true,force:true}).catch(()=>{});active=null;
    }
  }
  ipcMain.handle("cancel-package",async()=>{if(!active||active.committing)return false;active.cancelled=true;if(active.worker)await active.worker.terminate();return true;});
  for(const op of ["export-fantin","export-folder","import-fantin","import-folder"]){
    ipcMain.handle(op,async(event,data)=>{
      const win=getWindow();if(!win)return {ok:false,error:"no window"};
      try{
        if(op==="export-fantin"){
          const r=await dialog.showSaveDialog(win,{title:"导出为 .fantin 文件",defaultPath:directoryName(data.projectName)+".fantin",filters:[{name:"Fantin 文件",extensions:["fantin"]}]});
          if(r.canceled||!r.filePath)return {ok:false,error:"cancelled"};return run(op,null,r.filePath,data);
        }
        if(op==="export-folder"){
          const name=directoryName(data.projectName),r=await dialog.showOpenDialog(win,{properties:["openDirectory","createDirectory"],title:"选择导出位置（同名文件夹自动另存）"});
          if(r.canceled)return {ok:false,error:"cancelled"};let output=path.join(r.filePaths[0],name),n=2;
          while(fs.existsSync(output))output=path.join(r.filePaths[0],name+" ("+(n++)+")");return run(op,null,output,data);
        }
        let input=op==="import-fantin"?data:null;
        if(!input){const r=await dialog.showOpenDialog(win,{properties:[op==="import-folder"?"openDirectory":"openFile"],title:"选择要导入的项目",...(op==="import-fantin"?{filters:[{name:"Fantin 文件",extensions:["fantin"]}]}:{})});if(r.canceled||!r.filePaths.length)return {ok:false,error:"cancelled"};input=r.filePaths[0];}
        return run(op,input,null,null);
      }catch(e){return {ok:false,error:e.message};}
    });
  }
}
module.exports={install,directoryName};
