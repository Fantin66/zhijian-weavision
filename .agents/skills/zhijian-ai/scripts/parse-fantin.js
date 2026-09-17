#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
function analyze(data,dir){
 if(!data||!Array.isArray(data.canvases))throw new Error('缺少 canvases');
 if(data.schemaVersion>3)throw new Error('较新格式，请升级解析器');
 const warnings=[],coverage=[],files=new Map(),canvasMap=new Map();
 const warn=(location,message)=>warnings.push({location,message});
 function index(values,key,label){const map=new Map();for(const v of values||[]){if(map.has(v[key]))warn(label,'重复 ID: '+v[key]);map.set(v[key],v)}return map;}
 for(const f of data.fileMeta||[]){if(files.has(f.oldId))warn('fileMeta','重复附件 ID: '+f.oldId);files.set(f.oldId,f);
  const name=f.packageName||f.name;let status=f.sourceOnly?'source-only':f.kind==='link'&&f.url?'remote-unread':'unread';
  let href=null;
  if(!f.sourceOnly&&!(f.kind==='link'&&f.url)){
   if(typeof name!=='string'||name!==path.basename(name)||/[\\/:\x00-\x1f]/.test(name)||name==='.'||name==='..'){status='invalid-path';warn('fileMeta',String(name)+' 路径无效');}
   else{href='attachments/'+encodeURIComponent(name);if(dir){const full=path.join(dir,'attachments',name);if(!fs.existsSync(full)){status='missing';warn('fileMeta',name+' 原文件缺失');}else if(!fs.lstatSync(full).isFile()||fs.lstatSync(full).isSymbolicLink()){status='invalid-path';warn('fileMeta',name+' 不是普通文件');}}}
  }
  coverage.push({id:f.oldId,name:f.name,packageName:name,status,href,aiSource:f.aiSource||null});
 }
 for(const c of data.canvases){if(canvasMap.has(c.id))warn('canvases','重复画布 ID: '+c.id);canvasMap.set(c.id,c);}
 const canvases=data.canvases.map(c=>{
  const items=index(c.items,'id',c.id),links=index(c.links,'id',c.id+'/links'),ownership=[];
  const label=id=>{const i=items.get(id);return i?i.text||files.get(i.fileId)?.name||i.type:String(id);};
  for(const i of items.values()){
   const location=c.id+'/'+i.id;
   if(i.parentId!=null&&!items.has(i.parentId))warn(location,'父节点缺失');
   const seen=new Set([i.id]);let cursor=i;
   while(cursor.parentId!=null&&items.has(cursor.parentId)){if(seen.has(cursor.parentId)){warn(location,'父级循环');break;}seen.add(cursor.parentId);cursor=items.get(cursor.parentId);}
   if(i.parentId!=null&&items.has(i.parentId)&&!(items.get(i.parentId).children||[]).includes(i.id))warn(location,'父级 children 缺少本节点');
   for(const child of i.children||[])if(!items.has(child)||items.get(child).parentId!==i.id)warn(location,'children 与 parentId 不一致: '+child);
   for(const id of i.attachIds||[]){ownership.push({nodeId:i.id,itemId:id,node:label(i.id),material:label(id)});if(!items.has(id))warn(location,'归属目标缺失: '+id);}
   for(const id of [i.fileId,i.sourceRef?.fileId].filter(v=>v!=null))if(!files.has(id))warn(location,'附件记录缺失: '+id);
   if(i.externalJump)warn(location,'外部跳转待关联: '+JSON.stringify(i.externalJump));
   if(i.jumpTo){const j=typeof i.jumpTo==='string'?{canvasId:i.jumpTo}:i.jumpTo;const target=canvasMap.get(j.canvasId);if(j.projectId&&data.sourceProjectId&&j.projectId!==data.sourceProjectId)warn(location,'跨项目跳转未包含目标项目');else if(!target)warn(location,'跳转画布缺失');else if(j.itemId!=null&&!(target.items||[]).some(v=>v.id===j.itemId))warn(location,'跳转元素缺失');}
  }
  for(const l of links.values()){if(!items.has(l.aId)||!items.has(l.bId))warn(c.id+'/'+l.id,'关系端点缺失');if(l.sourceRef?.fileId&&!files.has(l.sourceRef.fileId))warn(c.id+'/'+l.id,'证据附件缺失');}
  for(const p of c.previews||[])if(p.fileId&&!files.has(p.fileId))warn(c.id+'/preview','预览附件缺失');
  return {...c,ownership};
 });
 for(const route of data.readingPaths||[])for(const step of route.steps||[]){const c=canvasMap.get(step.canvasId);if(step.unresolved||!c||!(c.items||[]).some(i=>i.id===step.itemId))warn('readingPaths/'+route.id,'阅读步骤待关联');}
 return {schemaVersion:data.schemaVersion||1,projectName:data.projectName,canvases,fileMeta:data.fileMeta||[],folders:data.folders||[],readingPaths:data.readingPaths||[],coverage,warnings};
}
function render(report){
 const lines=['# '+(report.projectName||'未命名项目'),'解析仅包含画布与元数据；附件正文需另外读取。'];
 for(const c of report.canvases){lines.push('\n## '+(c.name||c.id));for(const i of c.items||[]){lines.push('\n### '+i.id+' · '+i.type);for(const key of ['text','detail','annotation','parentId','children','attachIds','fileId','sourceRef','jumpTo','externalJump'])if(i[key]!=null)lines.push(key+': '+(typeof i[key]==='string'?i[key]:JSON.stringify(i[key])));}
 lines.push('\n归属索引: '+JSON.stringify(c.ownership));for(const l of c.links||[])lines.push('\n关系: '+JSON.stringify(l));lines.push('\n预览引用: '+JSON.stringify(c.previews||[]));}
 lines.push('\n## 阅读路径\n'+JSON.stringify(report.readingPaths,null,2),'\n## 资料覆盖\n'+JSON.stringify(report.coverage,null,2),'\n## 结构告警\n'+(report.warnings.length?JSON.stringify(report.warnings,null,2):'未发现结构异常（不代表附件原文已读取）'));return lines.join('\n');
}
if(require.main===module){try{const input=process.argv[2];if(!input)throw new Error('用法: node parse-fantin.js data.json [--dir 解压目录] [--json]');if(fs.statSync(input).size>16*1024**2)throw new Error('data.json 超过 16 MiB');const at=process.argv.indexOf('--dir'),dir=at>=0?process.argv[at+1]:null;const report=analyze(JSON.parse(fs.readFileSync(input,'utf8')),dir);console.log(process.argv.includes('--json')?JSON.stringify(report,null,2):render(report));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={analyze,render};
