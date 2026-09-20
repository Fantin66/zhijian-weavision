/* K6: portable package model; kept independent of DOM and storage. */
(function(root){
  "use strict";
  const clone=value=>JSON.parse(JSON.stringify(value,(key,v)=>["thumb","blob","_url"].includes(key)?undefined:v));
  function encode(project,canvasId){
    const canvases=canvasId?project.canvases.filter(c=>c.id===canvasId):project.canvases;
    if(!canvases.length)throw new Error("没有可导出的画布");
    const used=new Set();
    for(const c of canvases){for(const i of c.items||[])if(i.fileId)used.add(i.fileId);for(const p of c.previews||[])if(p.fileId)used.add(p.fileId);for(const l of c.links||[])if(l.sourceRef?.fileId)used.add(l.sourceRef.fileId);}
    for(const c of canvases)for(const i of c.items||[])if(i.sourceRef?.fileId)used.add(i.sourceRef.fileId);
    const files=project.files.filter(f=>!canvasId||used.has(f.id));
    for(const id of used)if(!project.files.some(f=>f.id===id))throw new Error("附件记录缺失："+id);
    const selected=new Set(canvases.map(c=>c.id));
    const copies=clone(canvases);
    for(const c of copies)for(const i of c.items||[]){const j=typeof i.jumpTo==="string"?{canvasId:i.jumpTo}:i.jumpTo;if(j&&(!selected.has(j.canvasId)||(j.projectId&&j.projectId!==project.id))){i.externalJump={...j,projectId:j.projectId||project.id,projectName:j.projectName||(j.projectId&&j.projectId!==project.id?null:project.name),canvasName:project.canvases.find(x=>x.id===j.canvasId)?.name||j.canvasName||null,status:"unresolved"};i.jumpTo=null;}}
    return {schemaVersion:3,version:"L1",sourceProjectId:project.id,readingPaths:clone(project.readingPaths||[]),type:canvasId?"canvas":"project",exportedAt:Date.now(),projectName:project.name,
      folders:clone(project.folders||[]),canvases:copies,fileMeta:files.map((f,index)=>({oldId:f.id,name:f.name,packageName:"asset-"+index+"-"+String(f.id).replace(/[^a-zA-Z0-9_-]/g,"_")+(/\.[a-zA-Z0-9]{1,12}$/.exec(f.name)||[""])[0],size:f.blob?.size??f.size,kind:f.kind,mime:f.mime,url:f.url||null,folderId:f.folderId||null,created:f.created,sourceOnly:!!f.sourceOnly||!!f.aiSource&&!f.blob&&f.size===0,aiSource:f.aiSource||null,contentHash:f.contentHash||null}))};
  }
  function decode(structure,attachments,next){
    if(!structure||!Array.isArray(structure.canvases)||!structure.canvases.length)throw new Error("数据格式不正确：缺少画布");
    if(structure.schemaVersion&&structure.schemaVersion>3)throw new Error("此文件来自较新版本，请先升级织见");
    const byName=new Map((attachments||[]).map(a=>[a.name,a]));
    const p={id:next("p"),name:structure.projectName||"导入",files:[],folders:[],canvases:[],isBuiltin:false};
    const fm=new Map(),cm=new Map(),maps=new Map(),folders=new Map();
    for(const f of structure.folders||[]){if(folders.has(f.id))throw new Error("文件夹编号重复");folders.set(f.id,next("fld"));}
    p.folders=(structure.folders||[]).map(f=>({...clone(f),id:folders.get(f.id),parentId:folders.get(f.parentId)||null}));
    for(const f of structure.fileMeta||[]){
      if(fm.has(f.oldId))throw new Error("附件编号重复");
      const id=next("f"),a=byName.get(f.packageName||f.name);
      if(!a&&!f.sourceOnly&&!(f.kind==="link"&&f.url))throw new Error("附件缺失："+f.name);
      const blob=a?(a.blob||new Blob([a.buffer],{type:f.mime||"application/octet-stream"})):null;
      fm.set(f.oldId,id);p.files.push({sourceOnly:!!f.sourceOnly,aiSource:clone(f.aiSource||null),contentHash:f.contentHash||null,id,name:f.name,kind:f.kind,mime:f.mime||"",url:f.url||null,size:blob?.size||0,blob,created:f.created||Date.now(),folderId:folders.get(f.folderId)||null,thumb:null,tw:1,th:1});
    }
    for(const c of structure.canvases){
      if(cm.has(c.id))throw new Error("画布编号重复");cm.set(c.id,next("c"));
      const m=new Map();for(const i of c.items||[]){if(m.has(i.id))throw new Error("元素编号重复");m.set(i.id,next("item"));}maps.set(c.id,m);
    }
    for(const c of structure.canvases){
      const m=maps.get(c.id),copy=clone(c);copy.id=cm.get(c.id);copy.camera=copy.camera||{x:0,y:0,zoom:1};
      copy.items=(copy.items||[]).map(i=>{
        const old=i.id;i.id=m.get(old);
        if(i.parentId!=null){if(!m.has(i.parentId))throw new Error("父节点缺失");i.parentId=m.get(i.parentId);}
        for(const field of ["children","attachIds"])if(i[field])i[field]=i[field].map(id=>{if(!m.has(id))throw new Error("层级或归属目标缺失："+id);return m.get(id);});
        if(i.fileId){if(!fm.has(i.fileId))throw new Error("材料卡片缺少附件");i.fileId=fm.get(i.fileId);}
        if(i.sourceRef?.fileId){if(!fm.has(i.sourceRef.fileId))throw new Error("摘录缺少来源附件");i.sourceRef.fileId=fm.get(i.sourceRef.fileId);}
        if(i.type==="connector")for(const field of ["a","b"]){const v=i[field];if(v&&typeof v==="object"){if(v.noteId!=null)v.noteId=m.get(v.noteId)||null;}else if(v!=null)i[field]=m.get(v)||null;}
        if(i.externalJump)i.externalJump.status="unresolved";
        if(i.jumpTo){const j=typeof i.jumpTo==="string"?{canvasId:i.jumpTo}:i.jumpTo;if(cm.has(j.canvasId)&&(!j.projectId||!structure.sourceProjectId||j.projectId===structure.sourceProjectId)&&(j.itemId==null||maps.get(j.canvasId).has(j.itemId)))i.jumpTo={canvasId:cm.get(j.canvasId),itemId:maps.get(j.canvasId).get(j.itemId)||null};else{i.externalJump={...j,status:"unresolved"};i.jumpTo=null;}}
        return i;
      });
      copy.links=(copy.links||[]).map(l=>{l.id=next("lnk");l.aId=m.get(l.aId);l.bId=m.get(l.bId);if(l.sourceRef?.fileId){if(!fm.has(l.sourceRef.fileId))throw new Error("关系来源附件缺失");l.sourceRef.fileId=fm.get(l.sourceRef.fileId);}return l;});
      const nodes=new Map(copy.items.map(i=>[i.id,i]));
      for(const i of copy.items){for(const key of ["x","y","w","h"])if(i[key]!=null&&!Number.isFinite(Number(i[key])))throw new Error("元素坐标或尺寸无效");const seen=new Set([i.id]);let n=i;while(n.parentId!=null){if(seen.has(n.parentId))throw new Error("父子关系存在循环");seen.add(n.parentId);n=nodes.get(n.parentId);if(!n)break;}}
      if(copy.links.some(l=>l.aId==null||l.bId==null))throw new Error("连线端点不存在");
      copy.previews=(copy.previews||[]).map(v=>({...v,id:next("pv"),fileId:fm.get(v.fileId),noteId:m.get(v.noteId)}));
      p.canvases.push(copy);
    }
    p.readingPaths=(structure.readingPaths||[]).map(r=>({...clone(r),id:next("route"),steps:(r.steps||[]).map(v=>cm.has(v.canvasId)&&maps.get(v.canvasId).has(v.itemId)?{...v,unresolved:false,canvasId:cm.get(v.canvasId),itemId:maps.get(v.canvasId).get(v.itemId)||null}:{...v,unresolved:true})}));
    Object.defineProperty(p,"_importMaps",{value:{canvases:cm,items:maps},enumerable:false});
    return p;
  }
  const api={clone,encode,decode};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.PackageModel=api;
})(typeof window!=="undefined"?window:globalThis);
