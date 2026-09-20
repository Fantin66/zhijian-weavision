"use strict";
const {parentPort,workerData}=require("worker_threads");
const fs=require("fs"),path=require("path"),AdmZip=require("adm-zip");
const MAX_BYTES=2*1024*1024*1024,MAX_FILE=512*1024*1024,MAX_COUNT=10000;
const report=(text,percent)=>parentPort.postMessage({progress:{text,percent}});
function safeName(name){
  if(typeof name!=="string"||!name||name==="."||name===".."||/[\\/:*?"<>|\x00-\x1f]/.test(name)||/[. ]$/.test(name))throw new Error("文件名无效");
  return name;
}
function readDirectory(dir){
  const jsonPath=path.join(dir,"data.json");
  if(!fs.existsSync(jsonPath)||fs.lstatSync(jsonPath).isSymbolicLink()||fs.statSync(jsonPath).size>16*1024*1024)throw new Error("data.json 缺失或超过 16MB");
  const structure=JSON.parse(fs.readFileSync(jsonPath,"utf8"));
  const folder=path.join(dir,"attachments"),attachments=[];let total=0;
  if(fs.existsSync(folder)){
    if(fs.lstatSync(folder).isSymbolicLink())throw new Error("附件目录不能是符号链接");
    const names=fs.readdirSync(folder);if(names.length>MAX_COUNT)throw new Error("附件数量超过上限");
    for(const [index,name] of names.entries()){
      safeName(name);const file=path.join(folder,name),stat=fs.lstatSync(file);
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error("附件必须是普通文件");
      total+=stat.size;if(stat.size>MAX_FILE||total>MAX_BYTES)throw new Error("附件超过大小上限（单个 512MB／合计 2GB）");
      const b=fs.readFileSync(file);attachments.push({name,buffer:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
      report("读取附件",Math.round((index+1)/names.length*90));
    }
  }
  return {ok:true,structure,attachments};
}
function commitReady(){return new Promise(resolve=>{parentPort.once("message",message=>{if(message.commit)resolve();});parentPort.postMessage({committing:true});});}
async function run(job){
  if(job.op==="import-folder")return readDirectory(job.input);
  if(job.op==="import-fantin"){
    const size=fs.statSync(job.input).size;if(size>MAX_BYTES)throw new Error("项目包超过 2GB，请拆分后导入");
    const zip=new AdmZip(job.input),entries=zip.getEntries();let total=0;
    if(entries.length>MAX_COUNT+10)throw new Error("压缩包文件数量超过上限");
    const seen=new Set();
    for(const entry of entries){
      const name=entry.entryName.replace(/\\/g,"/");
      if(name.startsWith("/")||name.split("/").some(v=>v===".."||v.includes(":")))throw new Error("压缩包包含非法路径");
      if(seen.has(name.toLowerCase()))throw new Error("压缩包包含重名文件");seen.add(name.toLowerCase());
      total+=entry.header.size;if(entry.header.size>MAX_FILE||total>MAX_BYTES)throw new Error("解压大小超过上限");
      if(!entry.isDirectory&&name!=="data.json"&&!/^attachments\/[^/]+$/.test(name))throw new Error("压缩包包含不支持的文件路径");
    }
    report("解压项目包",10);zip.extractAllTo(job.scratch,true);return readDirectory(job.scratch);
  }
  const data=job.data,dir=path.join(job.scratch,"package"),attDir=path.join(dir,"attachments");
  fs.mkdirSync(attDir,{recursive:true});
  const json=JSON.stringify(data.structure,null,2);if(Buffer.byteLength(json)>16*1024*1024)throw new Error("项目结构超过 16MB，请拆分导出");
  fs.writeFileSync(path.join(dir,"data.json"),json);
  let total=0;const used=new Set(),attachments=data.attachments||[];
  if(attachments.length>MAX_COUNT)throw new Error("附件数量超过上限");
  for(const [index,att] of attachments.entries()){
    const name=safeName(att.name),key=name.toLowerCase();if(used.has(key))throw new Error("附件文件名重复");used.add(key);
    const b=Buffer.from(att.buffer);total+=b.length;if(b.length>MAX_FILE||total>MAX_BYTES)throw new Error("附件超过大小上限");
    fs.writeFileSync(path.join(attDir,name),b);report("写入附件",Math.round((index+1)/Math.max(1,attachments.length)*70));
  }
  if(job.op==="export-fantin"){
    report("压缩项目包",80);const zip=new AdmZip();zip.addLocalFolder(dir);
    const temp=path.join(job.scratch,"result.fantin");zip.writeZip(temp);
    await commitReady();fs.renameSync(temp,job.output);
  }else{
    await commitReady();fs.renameSync(dir,job.output);
  }
  return {ok:true,path:job.output,attachments:attachments.length};
}
run(workerData).then(result=>parentPort.postMessage({result})).catch(e=>parentPort.postMessage({result:{ok:false,error:e.message}}));
