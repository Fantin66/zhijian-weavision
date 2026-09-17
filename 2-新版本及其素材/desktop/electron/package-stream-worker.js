const {parentPort,workerData:job}=require('worker_threads');
const fs=require('fs'),path=require('path'),{pipeline}=require('stream/promises');
const MAX_TOTAL=2*1024**3,MAX_FILE=512*1024**2,MAX_JSON=16*1024**2;
function valid(name){if(!/^attachments\/[^/\\]+$/.test(name)&&name!=='data.json')throw new Error('不支持的包路径');if(name.split('/').some(s=>!s||s==='..'||/[\x00-\x1f:*?"<>|]/.test(s)))throw new Error('无效的包路径');return name;}
const progress=(text,percent)=>parentPort.postMessage({progress:{text,percent}});
async function extractZip(input,dir){
  const yauzl=require('yauzl');
  const zip=await new Promise((resolve,reject)=>yauzl.open(input,{lazyEntries:true,validateEntrySizes:true},(e,z)=>e?reject(e):resolve(z)));
  let total=0,count=0;const seen=new Set();
  await new Promise((resolve,reject)=>{
    const fail=e=>{zip.close();reject(e);};zip.on('error',fail);zip.on('end',resolve);
    zip.on('entry',entry=>{(async()=>{
      if(entry.fileName.endsWith('/')){if(entry.fileName!=='attachments/')throw new Error('不支持的目录');zip.readEntry();return;}
      const name=valid(entry.fileName);if(seen.has(name.toLowerCase()))throw new Error('压缩包包含重名文件');seen.add(name.toLowerCase());
      total+=entry.uncompressedSize;count++;if(count>10001||total>MAX_TOTAL||entry.uncompressedSize>(name==='data.json'?MAX_JSON:MAX_FILE))throw new Error('包大小或数量超过上限');
      const mode=entry.externalFileAttributes>>>16;if((mode&0xf000)===0xa000)throw new Error('不支持符号链接');
      const source=await new Promise((res,rej)=>zip.openReadStream(entry,(e,s)=>e?rej(e):res(s)));
      const target=path.join(dir,...name.split('/'));await fs.promises.mkdir(path.dirname(target),{recursive:true});
      await pipeline(source,fs.createWriteStream(target,{flags:'wx'}));progress('解压附件',Math.min(95,count));zip.readEntry();
    })().catch(fail);});zip.readEntry();
  });
}
async function inspect(dir){
  const file=path.join(dir,'data.json'),stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_JSON)throw new Error('无效的 data.json');
  const structure=JSON.parse(await fs.promises.readFile(file,'utf8')),attachments=[];let total=0;
  const folder=path.join(dir,'attachments');if(fs.existsSync(folder)){
    if((await fs.promises.lstat(folder)).isSymbolicLink())throw new Error('附件目录不允许符号链接');
    const names=await fs.promises.readdir(folder);if(names.length>10000)throw new Error('附件数量超过上限');
    for(const name of names){valid('attachments/'+name);const s=await fs.promises.lstat(path.join(folder,name));if(!s.isFile()||s.isSymbolicLink())throw new Error('附件必须是普通文件');total+=s.size;if(s.size>MAX_FILE||total>MAX_TOTAL)throw new Error('附件大小超过上限');attachments.push({name,size:s.size});}
  }return {structure,attachments};
}
async function run(){
  if(job.op==='import'){
    const dir=path.join(job.scratch,'package');await fs.promises.mkdir(dir,{recursive:true});
    if(job.format==='fantin'){if((await fs.promises.stat(job.input)).size>MAX_TOTAL)throw new Error('包文件超过上限');await extractZip(job.input,dir);}
    else {const inspected=await inspect(job.input);await fs.promises.mkdir(path.join(dir,'attachments'));await fs.promises.copyFile(path.join(job.input,'data.json'),path.join(dir,'data.json'));for(const a of inspected.attachments)await fs.promises.copyFile(path.join(job.input,'attachments',a.name),path.join(dir,'attachments',a.name));}
    return {ok:true,...await inspect(dir)};
  }
  const dir=path.join(job.scratch,'package');await inspect(dir);
  let result=dir;
  if(job.format==='fantin'){
    result=path.join(job.scratch,'result.fantin');const archiver=require('archiver');
    await new Promise((resolve,reject)=>{const archive=archiver('zip',{zlib:{level:6}}),output=fs.createWriteStream(result);output.on('close',resolve);output.on('error',reject);archive.on('error',reject);archive.pipe(output);archive.directory(dir,false);archive.finalize();});
  }
  progress('提交导出文件',99);
  await new Promise(resolve=>{parentPort.once('message',m=>{if(m.commit)resolve();});parentPort.postMessage({committing:true});});
  await fs.promises.rename(result,job.output);return {ok:true,path:job.output};
}
run().then(result=>parentPort.postMessage({result})).catch(e=>parentPort.postMessage({result:{ok:false,error:e.message}}));
