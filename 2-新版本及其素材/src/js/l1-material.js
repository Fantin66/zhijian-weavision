"use strict";
/* ============================================================
   L5: 材料库 —— 导入材料的本地落盘镜像
   ------------------------------------------------------------
   浏览器数据库（IndexedDB）仍是在用的数据源；材料库是同一份内容
   在磁盘上的可查找副本，目录结构 <根目录>/<项目名>/<文件名>。
   设计约束：
   · 落盘失败不阻塞导入——镜像尽力而为，失败只提示一次。
   · 删除项目只解除引用，绝不删磁盘文件。
   · 磁盘文件只能由用户在设置面板显式清理，或按文件名逐个删除。
============================================================ */
const L1Material=(()=>{
  const mirrored=new Map();          /* fileId -> {path,size} 会话内去重，不写进项目数据 */
  let defaultRoot=null,rootProbe=null,warned=false;

  function isDesktop(){return !!(window.electronAPI&&window.electronAPI.materialLibraryWrite);}
  function projectName(project){return (project||curProject())?.name||"未命名项目";}

  /* 解析材料库根目录：用户设置优先，其次系统文档目录下的「织见材料库」 */
  async function rootPath(){
    if(state.materialLibraryPath)return state.materialLibraryPath;
    if(defaultRoot)return defaultRoot;
    if(!isDesktop())return "";
    if(!rootProbe)rootProbe=window.electronAPI.materialLibraryDefault().then(r=>{
      defaultRoot=(r&&r.ok&&r.path)||"";
      if(defaultRoot&&!state.materialLibraryPath){state.materialLibraryPath=defaultRoot;saveStateDebounced();}
      return defaultRoot;
    }).catch(()=>{rootProbe=null;return "";});
    return rootProbe;
  }
  function rootSync(){return state.materialLibraryPath||defaultRoot||"（未初始化）";}

  /* 导入时把一份材料同步到磁盘。失败只提示一次，不影响画布数据。 */
  async function mirrorFile(file,project){
    if(!isDesktop()||!file)return {ok:false,error:"非桌面版"};
    if(file.kind==="link"||file.sourceOnly)return {ok:false,error:"此材料没有本地文件"};
    const known=mirrored.get(file.id);
    if(known&&known.size===file.size)return {ok:true,path:known.path,reused:true};
    let blob=null;
    try{blob=await readStoredBlob(file);}catch(e){blob=null;}
    if(!blob)return {ok:false,error:"材料内容不可读"};
    let bytes;
    try{bytes=new Uint8Array(await blob.arrayBuffer());}catch(e){return {ok:false,error:"材料读取失败："+e.message};}
    let result;
    try{
      result=await window.electronAPI.materialLibraryWrite({root:await rootPath(),projectName:projectName(project),fileName:file.name,bytes});
    }catch(e){result={ok:false,error:e.message};}
    if(result&&result.ok){
      mirrored.set(file.id,{path:result.path,size:file.size});
      /* libraryPath 始终指向材料库副本；localPath 保留导入前的来源路径，两者用途不同 */
      file.libraryPath=result.path;
      if(!file.localPath)file.localPath=result.path;
      return result;
    }
    if(!warned){
      warned=true;
      toast("材料已存入画布，但未能同步到材料库"+(result&&result.error?"："+result.error:"")+"（可在设置→数据中检查材料库目录）");
    }
    return result||{ok:false,error:"写入失败"};
  }
  async function mirrorProject(project){
    const target=project||curProject();if(!target)return {ok:false,count:0};
    let count=0,failed=0;
    for(const file of target.files||[]){
      const r=await mirrorFile(file,target);
      if(r&&r.ok)count++;else if(file.kind!=="link"&&!file.sourceOnly)failed++;
    }
    return {ok:true,count,failed};
  }

  /* 打开材料库（可按项目定位到子目录） */
  async function openDir(project){
    if(!isDesktop()){toast("请在桌面版使用材料库");return;}
    const r=await window.electronAPI.materialLibraryOpen({root:await rootPath(),projectName:project===false?null:projectName(project)});
    if(!r||!r.ok)toast("打开材料库失败："+((r&&r.error)||"未知错误"));
  }
  /* 在文件夹中显示一份材料；未落盘则先落盘，再退化为临时文件 */
  async function reveal(file){
    if(!isDesktop()){toast("请在桌面版中打开文件夹");return;}
    let bytes=null;
    try{const blob=await readStoredBlob(file);if(blob)bytes=new Uint8Array(await blob.arrayBuffer());}catch(e){}
    const r=await window.electronAPI.revealBlob({root:await rootPath(),projectName:projectName(),fileName:file.name,bytes});
    if(!r||!r.ok)toast("未能定位材料："+((r&&r.error)||"未知错误"));
    else if(r.temporary)toast("材料已导出到临时目录并定位");
  }
  async function deleteMirror(file,project){
    if(!isDesktop())return {ok:false,error:"非桌面版"};
    const r=await window.electronAPI.materialLibraryDelete({root:await rootPath(),projectName:projectName(project),fileName:file.name});
    if(r&&r.ok)mirrored.delete(file.id);
    return r;
  }

  async function stats(){return isDesktop()?window.electronAPI.materialLibraryStats({root:await rootPath()}):{ok:false,error:"非桌面版"};}
  async function chooseRoot(){
    if(!isDesktop()){toast("请在桌面版中设置材料库目录");return null;}
    /* M1-fix: 先确认 bridge 上真有这个方法再调。
       以前直接调用一个名字对不上的方法 → TypeError → 被调用方的 async 吞掉 →
       用户看到的是"点了没反应"，连报错都没有。现在缺方法就说缺方法。 */
    const api=window.electronAPI&&window.electronAPI.materialLibraryChoose;
    if(typeof api!=="function"){toast("当前版本不支持更改材料库目录，请更新应用");return null;}
    let r=null;
    try{r=await api();}
    catch(e){toast("打开目录选择失败："+((e&&e.message)||e));return null;}
    /* 用户点了取消是正常操作，不提示；真出错才提示 */
    if(!r||!r.ok){
      if(!(r&&r.canceled))toast("未能更改材料库目录："+((r&&r.error)||"未知错误"));
      return null;
    }
    state.materialLibraryPath=r.path;defaultRoot=r.path;rootProbe=Promise.resolve(r.path);
    saveStateDebounced();
    return r.path;
  }
  function resetRoot(){state.materialLibraryPath=defaultRoot||"";saveStateDebounced();}

  /* 给路径即导入：唯一入口。AI 的 import_files 与「从磁盘导入」按钮都走这里。 */
  async function importPaths(paths,folderId){
    const project=curProject();if(!project)return {ok:false,error:"没有可用项目"};
    if(!isDesktop())return {ok:false,error:"按路径导入仅支持桌面版"};
    const list=(paths||[]).filter(p=>typeof p==="string"&&p.trim());
    if(!list.length)return {ok:false,error:"未提供文件路径"};
    const res=await window.electronAPI.readMaterialFiles(list);
    if(!res||!res.ok)return {ok:false,error:(res&&res.error)||"读取失败"};
    const created=[];
    for(const entry of res.files){
      const blob=new Blob([entry.bytes],{type:entry.mime});
      const file={id:"f"+(uid++),name:entry.name,kind:kindOf(entry.name),size:entry.size,mime:entry.mime,created:Date.now(),thumb:null,tw:1,th:1,folderId:folderId||null,localPath:entry.path,blob};
      project.files.push(file);
      try{await persistBlob(file);}catch(e){toast("附件尚未保存："+file.name);}
      if(file.kind==="img"){
        try{
          const bmp=await createThumbnail(blob);
          const max=300,sc=Math.min(1,max/Math.max(bmp.width,bmp.height));
          file.tw=Math.max(1,Math.round(bmp.width*sc));file.th=Math.max(1,Math.round(bmp.height*sc));file.thumb=bmp;
        }catch(e){}
      }
      await mirrorFile(file,project);
      created.push(file);
    }
    renderFileGroups();render();saveStateDebounced();
    return {ok:true,files:created.map(f=>({id:f.id,name:f.name,size:f.size,kind:f.kind})),errors:(res.errors||[]).map(e=>e.path+"："+e.error)};
  }

  /* 从系统对话框选文件后导入 */
  async function pickImport(folderId){
    if(!isDesktop()){toast("请在桌面版中使用磁盘导入");return null;}
    const picked=await window.electronAPI.selectMaterialFiles();
    if(!picked||!picked.ok)return null;
    const out=await importPaths(picked.paths.map(p=>p.path),folderId);
    if(out.ok){
      toast("已导入 "+out.files.length+" 个文件"+(out.errors.length?"；"+out.errors.length+" 个失败":""));
      return out;
    }
    toast("导入失败："+out.error);return out;
  }

  /* ============================================================
     附件存储体检与清理
     files 库按 file.id 存 blob；项目删除只摘掉引用，不回收 blob，
     多次导入同一批材料会留下大量无引用副本。此处做只读体检 +
     显式清理两步，避免误删。
  ============================================================ */
  function referencedIds(){
    const ids=new Set();
    for(const p of state.projects)for(const f of p.files||[])ids.add(String(f.id));
    return ids;
  }
  function allKeys(store){
    return new Promise((resolve,reject)=>{
      if(!idb){reject(new Error("附件存储不可用"));return;}
      try{
        const tx=idb.transaction(store,"readonly"),keys=[],rq=tx.objectStore(store).openKeyCursor();
        rq.onsuccess=()=>{const cursor=rq.result;if(cursor){keys.push(cursor.key);cursor.continue();}else resolve(keys);};
        rq.onerror=()=>reject(rq.error||new Error("读取中断"));
      }catch(e){reject(e);}
    });
  }
  function sizeOf(store,key){
    return new Promise(resolve=>{
      try{
        const tx=idb.transaction(store,"readonly"),rq=tx.objectStore(store).get(key);
        rq.onsuccess=()=>resolve(Number(rq.result?.size)||0);rq.onerror=()=>resolve(0);
      }catch(e){resolve(0);}
    });
  }
  /* dryRun=true 只统计；false 才删除未引用记录 */
  async function gcAttachments(dryRun=true){
    if(!idb)await openDB();
    if(!idb)return {ok:false,error:"附件存储不可用"};
    const referenced=referencedIds();
    const keys=await allKeys("files");
    const orphans=keys.filter(k=>!referenced.has(String(k)));
    let bytes=0;for(const key of orphans)bytes+=await sizeOf("files",key);
    /* referenced 统计的是存储里的实际份数；项目声明的 id 可能多于存储（来源信息卡、
       网页链接、尚未落库的附件），两者分开报，避免出现「引用 14 / 总数 13」这种误导。 */
    const report={ok:true,dryRun,total:keys.length,referenced:keys.length-orphans.length,orphans:orphans.length,bytes,projectFileIds:referenced.size};
    if(dryRun||!orphans.length)return report;
    await new Promise((resolve,reject)=>{
      try{
        const tx=idb.transaction("files","readwrite"),store=tx.objectStore("files");
        for(const key of orphans)store.delete(key);
        tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error("清理中断"));
      }catch(e){reject(e);}
    }).catch(e=>{report.ok=false;report.error=e.message;});
    report.removed=orphans.length;
    return report;
  }

  return {isDesktop,rootPath,rootSync,mirrorFile,mirrorProject,openDir,reveal,deleteMirror,
    stats,chooseRoot,resetRoot,importPaths,pickImport,gcAttachments,projectName};
})();

function formatBytes7(n){
  const value=Number(n)||0;
  if(value<1024)return value+" B";
  if(value<1024*1024)return (value/1024).toFixed(1)+" KB";
  if(value<1024*1024*1024)return (value/1048576).toFixed(1)+" MB";
  return (value/1073741824).toFixed(2)+" GB";
}
