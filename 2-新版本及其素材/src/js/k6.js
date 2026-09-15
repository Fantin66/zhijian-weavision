"use strict";
/* Persistence, recovery and diagnostics use the same state and file stores as K5. */
const pendingWrites=new Set(),failedWrites=new Map();
let packageBusy=false,packageCancelled=false,lastRecoveryAt=0,recoveryWork=Promise.resolve();
function updateSaveStatus(status){
  let el=document.getElementById("saveStatus");
  if(!el){el=document.createElement("button");el.id="saveStatus";el.className="k6-save";el.type="button";el.onclick=retryPersistence;el.setAttribute("aria-live","polite");document.body.appendChild(el);}
  el.dataset.status=status;el.textContent=({saving:"保存中…",saved:"已保存",error:"保存失败 · 点击重试"})[status]||status;
}
function persistBlob(file){
  const promise=new Promise((resolve,reject)=>{
    if(!idb){reject(new Error("附件存储不可用"));return;}
    try{const tx=idb.transaction("files","readwrite");tx.objectStore("files").put(file.blob,file.id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error("附件写入中断"));}catch(e){reject(e);}
  });
  pendingWrites.add(promise);updateSaveStatus("saving");
  promise.then(()=>failedWrites.delete(file.id),()=>failedWrites.set(file.id,file)).finally(()=>{pendingWrites.delete(promise);updateSaveStatus(failedWrites.size?"error":pendingWrites.size?"saving":"saved");});
  return promise;
}
async function readStoredBlob(file){
  if(!file)return null;if(file.blob)return file.blob;if(!idb)return null;
  return new Promise((resolve,reject)=>{try{const tx=idb.transaction("files","readonly"),r=tx.objectStore("files").get(file.id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);tx.onabort=()=>reject(tx.error||new Error("读取中断"));}catch(e){reject(e);}});
}
async function flushPersistence(){
  closeEditor(false);closeMindEditor(false);
  if(packageBusy){toast("请先完成或取消导入导出任务");return false;}
  await Promise.allSettled([...pendingWrites]);const saved=saveState()&&!failedWrites.size;
  await recoveryWork.catch(()=>{});return saved;
}
async function retryPersistence(){
  if(!idb)await openDB();
  await Promise.allSettled([...failedWrites.values()].map(persistBlob));
  const ok=await flushPersistence();toast(ok?"画布与附件已保存":"保存仍未完成，请导出备份或释放存储空间");return ok;
}
async function createThumbnail(blob){
  const full=await createImageBitmap(blob),scale=Math.min(1,300/Math.max(full.width,full.height));
  if(scale===1)return full;
  try{return await createImageBitmap(full,{resizeWidth:Math.max(1,Math.round(full.width*scale)),resizeHeight:Math.max(1,Math.round(full.height*scale)),resizeQuality:"medium"});}
  finally{full.close();}
}
function showPackageProgress(text){
  packageCancelled=false;let el=document.getElementById("packageProgress");
  if(!el){el=document.createElement("div");el.id="packageProgress";el.className="k6-progress";el.innerHTML='<span role="status"></span><button type="button">取消</button>';document.body.appendChild(el);}
  el.hidden=false;el.querySelector("span").textContent=text;
  el.querySelector("button").onclick=async()=>{packageCancelled=true;await window.electronAPI?.cancelPackage?.();el.querySelector("span").textContent="正在取消…";};
}
function hidePackageProgress(){const el=document.getElementById("packageProgress");if(el)el.hidden=true;}
async function k6Export(scope,format){
  if(!window.electronAPI){toast("请在桌面版导出项目包");return;}
  if(packageBusy){toast("请等待当前任务完成");return;}
  packageBusy=true;showPackageProgress("准备导出");
  try{
    const p=curProject(),structure=PackageModel.encode(p,scope==="project"?null:curCanvas().id),attachments=[];
    const exportFiles=new Map(p.files.map(f=>[f.id,{...f}]));
    for(const fm of structure.fileMeta){
      if(packageCancelled)throw new Error("cancelled");if(fm.kind==="link"&&fm.url)continue;
      const blob=await readStoredBlob(exportFiles.get(fm.oldId));if(!blob)throw new Error("附件读取失败："+fm.name);
      attachments.push({name:fm.packageName,buffer:await blob.arrayBuffer()});
    }
    if(packageCancelled)throw new Error("cancelled");
    const data={projectName:p.name+(scope==="project"?"":"-"+structure.canvases[0].name),structure,attachments};
    const res=await window.electronAPI[format==="fantin"?"exportFantin":"exportFolder"](data);
    if(!res.ok)throw new Error(res.error);toast("已导出："+res.path+"（"+res.attachments+" 个附件）");
  }catch(e){toast(e.message==="cancelled"?"已取消导出":"导出失败："+e.message);}
  finally{packageBusy=false;hidePackageProgress();}
}
async function k6Import(format,presetPath){
  if(packageBusy){toast("请等待当前任务完成");return;}packageBusy=true;showPackageProgress("准备导入");let imported=null;
  try{
    const res=await window.electronAPI[format==="fantin"?"importFantin":"importFolder"](presetPath);
    if(!res.ok)throw new Error(res.error);if(packageCancelled)throw new Error("cancelled");
    const p=imported=PackageModel.decode(res.structure,res.attachments,prefix=>prefix==="item"?uid++:prefix+(uid++));
    for(const f of p.files)if(!f.kind)f.kind=kindOf(f.name);
    for(const f of p.files)if(f.blob){if(packageCancelled)throw new Error("cancelled");await persistBlob(f);}
    const oldProject=state.activeProjectId,oldCanvas=state.activeCanvasId;
    state.projects.push(p);state.activeProjectId=p.id;state.activeCanvasId=p.canvases[0].id;resetTransientState();syncUid();
    if(!saveState()){
      state.projects=state.projects.filter(x=>x!==p);state.activeProjectId=oldProject;state.activeCanvasId=oldCanvas;
      throw new Error("画布保存失败，导入未提交，请释放存储空间后重试");
    }
    await restoreFiles();renderSidePanel();render();fitAll();toast("已导入："+p.name+"（"+p.canvases.length+" 张画布，"+p.files.length+" 个附件）");
  }catch(e){if(imported&&!state.projects.includes(imported))for(const f of imported.files)failedWrites.delete(f.id);toast(e.message==="cancelled"?"已取消导入":"导入失败："+e.message);}
  finally{packageBusy=false;hidePackageProgress();}
}
function recoveryTransaction(mode,action){
  return new Promise((resolve,reject)=>{if(!idb){reject(new Error("恢复存储不可用"));return;}try{const tx=idb.transaction("recovery",mode);const result=action(tx.objectStore("recovery"));tx.oncomplete=()=>resolve(result?.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error("恢复记录写入失败"));}catch(e){reject(e);}});
}
function captureRecoveryData(){
  return {projects:PackageModel.clone(state.projects),activeProjectId:state.activeProjectId,activeCanvasId:state.activeCanvasId};
}
function queueRecovery(label){
  const data=captureRecoveryData(),files=state.projects.flatMap(p=>p.files.map(f=>({...f})));
  const task=recoveryWork.catch(()=>{}).then(async()=>{
    const blobs=[];for(const f of files){if(f.kind==="link")continue;const blob=await readStoredBlob(f);if(!blob)throw new Error("无法备份附件："+f.name);blobs.push({id:f.id,blob});}
    const record={id:Date.now()+"-"+Math.random().toString(36).slice(2),created:Date.now(),label,data,blobs};
    await recoveryTransaction("readwrite",store=>store.put(record));
    const records=await recoveryTransaction("readonly",store=>store.getAll());
    const old=records.sort((a,b)=>b.created-a.created).slice(10);
    if(old.length)await recoveryTransaction("readwrite",store=>{for(const r of old)store.delete(r.id);});
    lastRecoveryAt=Date.now();return true;
  });
  recoveryWork=task;
  return task.catch(e=>{toast("未能创建恢复点："+e.message);return false;});
}
function scheduleRecovery(){
  if(!idb||pendingWrites.size||failedWrites.size||Date.now()-lastRecoveryAt<300000)return;
  lastRecoveryAt=Date.now();queueRecovery("自动版本");
}
async function showRecoveryCenter(){
  try{
    const records=(await recoveryTransaction("readonly",s=>s.getAll())).sort((a,b)=>b.created-a.created);
    showModal("恢复中心",'<p>保留最近 10 个版本，包含附件。恢复时创建副本，现有项目继续保留。</p><div id="recoveryList"></div>',[{label:"关闭"}]);
    const list=modal.querySelector("#recoveryList");if(!records.length){list.textContent="暂无恢复记录";return;}
    for(const r of records){const button=document.createElement("button");button.className="k6-list-row";button.textContent=new Date(r.created).toLocaleString()+" · "+r.label;button.onclick=()=>{
      const count=r.data.projects.reduce((n,p)=>n+p.canvases.length,0);
      showModal("恢复预览",'<p>'+escapeHtml(r.label)+'</p><p>'+r.data.projects.length+' 个项目 · '+count+' 张画布 · '+r.blobs.length+' 份附件</p><p>将作为新项目加入，不覆盖现有项目。</p>',[{label:"取消"},{label:"恢复为副本",primary:true,onClick:async()=>{await restoreRecoveryRecord(r);}}]);
    };list.appendChild(button);}
  }catch(e){toast("恢复中心不可用："+e.message);}
}
async function restoreRecoveryRecord(record){
  const blobMap=new Map(record.blobs.map(f=>[f.id,f.blob])),newProjects=[];
  for(const original of record.data.projects){
    const structure=PackageModel.encode(original),attachments=[];
    for(const f of structure.fileMeta){const b=blobMap.get(f.oldId);if(b)attachments.push({name:f.packageName,buffer:await b.arrayBuffer()});}
    const p=PackageModel.decode(structure,attachments,prefix=>prefix==="item"?uid++:prefix+(uid++));p.name+="（恢复副本）";
    for(const f of p.files)if(f.blob)await persistBlob(f);newProjects.push(p);
  }
  // Restore references across project boundaries to the corresponding new copies.
  const copies=new Map(record.data.projects.map((p,i)=>[p.id,newProjects[i]]));
  for(const original of record.data.projects){const copy=copies.get(original.id);for(const c of original.canvases)for(const item of c.items||[]){
    if(!item.jumpTo)continue;const ref=typeof item.jumpTo==="string"?{canvasId:item.jumpTo}:item.jumpTo;
    const target=copies.get(ref.projectId||original.id);if(!target)continue;
    const destination=target._importMaps.canvases.get(ref.canvasId);if(!destination)continue;
    const restoredCanvas=copy.canvases.find(b=>b.id===copy._importMaps.canvases.get(c.id));
    const restoredItem=restoredCanvas.items.find(i=>i.id===copy._importMaps.items.get(c.id).get(item.id));
    restoredItem.jumpTo={projectId:target.id,canvasId:destination,itemId:target._importMaps.items.get(ref.canvasId)?.get(ref.itemId)||null};
  }}
  const oldProject=state.activeProjectId,oldCanvas=state.activeCanvasId;
  state.projects.push(...newProjects);state.activeProjectId=newProjects[0].id;state.activeCanvasId=newProjects[0].canvases[0].id;
  if(!saveState()){state.projects=state.projects.filter(p=>!newProjects.includes(p));state.activeProjectId=oldProject;state.activeCanvasId=oldCanvas;throw new Error("存储空间不足，恢复副本未提交");}
  resetTransientState();await restoreFiles();renderSidePanel();render();toast("已恢复为副本");
}
async function k6ImportBackup(file){
  try{
    const data=JSON.parse(await file.text());if(data.type!=="userData"||!Array.isArray(data.projects)||!data.projects.length)throw new Error("不是有效的织见备份");
    const blobs=[];for(const a of data.attachments||[]){if(!a.b64)continue;const raw=atob(a.b64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));blobs.push({id:a.id,blob:new Blob([bytes],{type:a.mime||"application/octet-stream"})});}
    await restoreRecoveryRecord({data:{projects:data.projects},blobs});
  }catch(e){toast("恢复失败："+e.message);}
}
function inspectRelations(project){
  const issues=[];
  for(const c of project.canvases){
    const ids=new Map(c.items.map(i=>[i.id,i])),connected=new Set();
    const add=(text,item)=>issues.push({text,canvasId:c.id,itemId:item?.id});
    for(const l of c.links||[]){connected.add(l.aId);connected.add(l.bId);if(!ids.has(l.aId)||!ids.has(l.bId))add("连线端点已不存在",ids.get(l.aId)||ids.get(l.bId));if(l.sourceRef?.fileId&&!project.files.some(f=>f.id===l.sourceRef.fileId))add("证据来源附件已不存在",ids.get(l.aId));}
    for(const i of c.items){
      if(i.parentId){connected.add(i.id);connected.add(i.parentId);if(!ids.has(i.parentId))add("父节点已不存在",i);}
      if(i.fileId&&!project.files.some(f=>f.id===i.fileId))add("材料卡片缺少附件记录",i);
      if(i.jumpTo){const ref=typeof i.jumpTo==="string"?{canvasId:i.jumpTo}:i.jumpTo;const p=state.projects.find(p=>p.id===(ref.projectId||project.id)),target=p?.canvases.find(b=>b.id===ref.canvasId);if(!target||(ref.itemId&&!target.items.some(n=>n.id===ref.itemId)))add("跃迁目标已不存在",i);}
      const seen=new Set([i.id]);let ancestor=i;while(ancestor?.parentId){if(seen.has(ancestor.parentId)){add("父子关系存在循环",i);break;}seen.add(ancestor.parentId);ancestor=ids.get(ancestor.parentId);}
    }
    for(const i of c.items)if(["mindNode","note","fileCard"].includes(i.type)&&!connected.has(i.id))add("未连接的元素（可按需保留）",i);
  }
  return issues;
}
async function showRelationCheck(){
  const p=curProject();if(!p)return;const issues=inspectRelations(p);
  for(const f of p.files)if(f.kind!=="link"&&!await readStoredBlob(f))issues.push({text:"附件内容缺失："+f.name});
  showModal("关系检查",'<p>'+issues.length+' 项检查提示；不会自动删除或修改内容。</p><div id="relationIssues"></div>',[{label:"关闭"}]);
  const list=modal.querySelector("#relationIssues");if(!issues.length)list.textContent="未发现失效引用或孤立元素。";
  for(const issue of issues){const row=document.createElement("button");row.className="k6-list-row";const c=p.canvases.find(c=>c.id===issue.canvasId);row.textContent=(c?c.name+" · ":"")+issue.text;row.onclick=()=>{hideModal();if(!c)return;switchProject(p.id);switchCanvas(c.id);const item=c.items.find(i=>i.id===issue.itemId);if(item){state.selected=item.id;const b=itemBounds(item);if(b){state.camera.x=b.x-W/2/state.camera.zoom;state.camera.y=b.y-H/2/state.camera.zoom;}}render();};list.appendChild(row);}
}
function editSourceRef(selection){
  const link=state.links.find(l=>l.id===selection.id);if(!link)return;
  const ref=link.sourceRef||{};
  showModal("证据来源",'<label>附件<select id="sourceFile" class="modal-input"><option value="">不选择附件</option>'+state.files.map(f=>'<option value="'+escapeHtml(f.id)+'" '+(f.id===ref.fileId?'selected':'')+'>'+escapeHtml(f.name)+'</option>').join("")+'</select></label><label>页码（PDF）<input id="sourcePage" class="modal-input" type="number" min="1" value="'+(Number(ref.page)||1)+'"></label><label>原文摘录 / 段落<input id="sourceQuote" class="modal-input" value="'+escapeHtml(ref.quote||"")+'"></label><label>网页地址<input id="sourceUrl" class="modal-input" type="url" value="'+escapeHtml(ref.url||"")+'"></label>',[{label:"取消"},{label:"保存",primary:true,onClick:()=>{
    const url=modal.querySelector("#sourceUrl").value.trim();if(url&&!/^https?:\/\//i.test(url)){toast("网页地址需以 http:// 或 https:// 开头");return false;}
    const page=Number(modal.querySelector("#sourcePage").value);if(!Number.isInteger(page)||page<1){toast("页码需为正整数");return false;}
    pushHistory("设置证据来源");link.sourceRef={fileId:modal.querySelector("#sourceFile").value||null,page,quote:modal.querySelector("#sourceQuote").value.trim(),url};saveState();render();
  }}]);
}
async function openSourceRef(selection){
  const ref=state.links.find(l=>l.id===selection.id)?.sourceRef;if(!ref){editSourceRef(selection);return;}
  if(ref.url){if(!/^https?:\/\//i.test(ref.url)){toast("来源网页地址无效");return;}window.open(ref.url,"_blank","noopener");return;}
  const f=state.files.find(f=>f.id===ref.fileId);if(!f){toast("来源附件已不存在");return;}
  openFullscreen(f,{sourcePage:ref.page,sourceQuote:ref.quote});
}
function initK6(){
  updateSaveStatus("saved");
  document.fonts?.addEventListener("loadingdone",()=>{mindMetricsCache=new WeakMap();requestRender();});
  window.electronAPI?.onPackageProgress?.(p=>{const el=document.querySelector("#packageProgress span");if(el)el.textContent=p.text+" "+p.percent+"%";});
  const menu=document.createElement("button");menu.type="button";menu.className="k6-check";menu.textContent="关系检查";menu.onclick=showRelationCheck;document.body.appendChild(menu);
}

function highlightSourceQuote(container,quote){
  if(!quote)return;const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){const index=node.textContent.indexOf(quote);if(index<0)continue;const range=document.createRange();range.setStart(node,index);range.setEnd(node,index+quote.length);const mark=document.createElement("mark");mark.className="k6-source-highlight";range.surroundContents(mark);mark.scrollIntoView({block:"center"});return;}
  toast("已打开来源，未找到完全匹配的摘录");
}
