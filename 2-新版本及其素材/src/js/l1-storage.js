/* L1: atomic asynchronous archives, immutable recovery blobs, legacy migration. */
const L1Storage=(()=>{
  let tail=Promise.resolve(),blocked=false,pending=0;
  const fingerprints=new Map();
  function tx(stores,mode,run){return new Promise((resolve,reject)=>{
    if(!idb){reject(new Error("本地数据库不可用"));return;}
    const t=idb.transaction(stores,mode);let result;
    try{result=run(t);}catch(e){t.abort();reject(e);return;}
    t.oncomplete=()=>resolve(typeof result==='function'?result():result);
    t.onerror=t.onabort=()=>reject(t.error||new Error("数据库提交失败"));
  });}
  async function get(store,key){let r;return tx([store],'readonly',t=>{r=t.objectStore(store).get(key);return()=>r.result;});}
  async function all(store){let r;return tx([store],'readonly',t=>{r=t.objectStore(store).getAll();return()=>r.result;});}
  function capture(){
    const ui={};for(const key of ['sideCollapsed','dark','bgPattern','bgColorName','mindMode','mindColorMode','layoutType','fontPreset','stylePreset','reducedMotion','fantinIcon','autoTheme','saveInterval','storagePath','materialLibraryPath','noteColor','mindColor','linkAvoid'])ui[key]=state[key];
    return {projects:L1Search.archiveView(state.projects.map(p=>PackageModel.clone(p))),activeProjectId:state.activeProjectId,activeCanvasId:state.activeCanvasId,ui,savedAt:Date.now(),schemaVersion:3};
  }
  function save(){
    if(blocked)return Promise.resolve(false);
    const data=capture();pending++;updateSaveStatus('saving');
    const job=tail.then(async()=>{
      const changed=[],next=new Map();
      for(const p of data.projects){const json=JSON.stringify(p);next.set(p.id,json);if(fingerprints.get(p.id)!==json)changed.push(p);await new Promise(r=>setTimeout(r,0));}
      const {projects,...meta}=data;meta.projectIds=projects.map(p=>p.id);
      await tx(['l1Projects','l1Meta'],'readwrite',t=>{
        const store=t.objectStore('l1Projects');for(const p of changed)store.put(p,p.id);
        for(const id of fingerprints.keys())if(!next.has(id))store.delete(id);
        t.objectStore('l1Meta').put(meta,'current');
      });
      fingerprints.clear();for(const [id,value]of next)fingerprints.set(id,value);
      pending--;updateSaveStatus(failedWrites.size?'error':pendingWrites.size||pending?'saving':'saved');return !failedWrites.size;
    }).catch(e=>{pending--;updateSaveStatus('error');toast('保存失败：'+e.message);return false;});
    tail=job.then(()=>{});return job;
  }
  async function load(){
    const meta=await get('l1Meta','current');
    if(meta){
      const projects=[];for(const id of meta.projectIds){const p=await get('l1Projects',id);if(!p)throw new Error('项目数据缺失：'+id);projects.push(p);fingerprints.set(id,JSON.stringify(p));}
      return {...meta,projects};
    }
    const raw=localStorage.getItem('board-state');if(!raw)return null;
    let legacy;try{legacy=JSON.parse(raw);}catch(e){blocked=true;throw new Error('旧版存档无法解析，原始数据已保留，未覆盖');}
    if(!Array.isArray(legacy.projects)||!legacy.projects.length){blocked=true;throw new Error('旧版存档结构无效，原始数据已保留');}
    // Keep exact legacy bytes in both their original location and the migration journal.
    await tx(['l1Meta'],'readwrite',t=>t.objectStore('l1Meta').put({raw,created:Date.now()},'k8.5-original'));
    return legacy;
  }
  const blobHashes=new WeakMap();
  function hash(blob){if(!blobHashes.has(blob))blobHashes.set(blob,hashBytes(blob).catch(e=>{blobHashes.delete(blob);throw e;}));return blobHashes.get(blob);}
  async function hashBytes(blob){
    // Chunked digest keeps peak memory bounded even for large attachments.
    const hashes=[];for(let i=0;i<blob.size;i+=4*1024*1024){const b=await blob.slice(i,i+4*1024*1024).arrayBuffer();hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join(''));}
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(blob.size+':'+hashes.join(':')));
    return 'sha256-chunks-v1:'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  }
  function recoverySnapshot(){return {data:capture(),files:state.projects.flatMap(p=>p.files.map(f=>({...f})))};}
  async function recover(label,snapshot=recoverySnapshot()){
    const {data,files}=snapshot,refs=[];
    for(const f of files){
      if(f.kind==='link'||f.sourceOnly)continue;
      const blob=await readStoredBlob(f);if(!blob)throw new Error('无法备份附件：'+f.name);
      const key=await hash(blob);f.contentHash=key;
      if(!await get('l1RecoveryBlobs',key))await tx(['l1RecoveryBlobs'],'readwrite',t=>t.objectStore('l1RecoveryBlobs').put(blob,key));
      refs.push({id:f.id,key});
    }
    const record={id:Date.now()+'-'+crypto.randomUUID(),created:Date.now(),label,data,refs};
    await tx(['l1Recovery'],'readwrite',t=>t.objectStore('l1Recovery').put(record,record.id));
    const records=(await all('l1Recovery')).sort((a,b)=>b.created-a.created),keep=records.slice(0,10);
    const referenced=new Set(keep.flatMap(r=>r.refs.map(f=>f.key)));
    await tx(['l1Recovery','l1RecoveryBlobs'],'readwrite',t=>{
      for(const old of records.slice(10))t.objectStore('l1Recovery').delete(old.id);
      const request=t.objectStore('l1RecoveryBlobs').openKeyCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){if(!referenced.has(cursor.key))t.objectStore('l1RecoveryBlobs').delete(cursor.key);cursor.continue();}};
    });
    return true;
  }
  async function records(){
    const current=(await all('l1Recovery')).map(r=>({...r,blobs:r.refs.map(f=>({id:f.id}))}));
    // Legacy records stay readable; do not delete the user's existing recovery history.
    const old=await all('recovery');return [...current,...old].sort((a,b)=>b.created-a.created);
  }
  async function hydrate(record){if(!record.refs)return record;const blobs=[];for(const ref of record.refs){const blob=await get('l1RecoveryBlobs',ref.key);if(!blob)throw new Error('恢复附件缺失');blobs.push({id:ref.id,blob});}return {...record,blobs};}
  return {tx,get,all,capture,save,load,hash,recover,recoverySnapshot,records,hydrate,pending:()=>pending,flush:()=>tail,block:()=>{blocked=true;}};
})();
