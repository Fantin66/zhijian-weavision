const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {Worker}=require('node:worker_threads');
const model=require('../src/js/package-model.js');
test('every application script parses',()=>{for(const f of fs.readdirSync(path.join(__dirname,'../src/js')).filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(__dirname,'../src/js',f),'utf8'),{filename:f});});
test('export directory names reject traversal and reserved devices',()=>{const {directoryName}=require('../desktop/electron/package-ipc');for(const n of ['.','..','CON','NUL.txt','   '])assert.throws(()=>directoryName(n));assert.equal(directoryName('资料/研究'),'资料_研究');});
const board=(id,items=[])=>({id,name:id,items,links:[],previews:[],camera:{x:0,y:0,zoom:1}});
const project=()=>({id:'p1',name:'项目',folders:[{id:'folder',name:'研究',parentId:null}],files:[{id:'f1',name:'报告.txt',kind:'text',folderId:'folder'},{id:'f2',name:'报告.txt',kind:'text',folderId:null}],canvases:[board('c1',[{id:1,type:'mindNode',parentId:2,children:[]},{id:2,type:'mindNode',children:[1]},{id:3,type:'fileCard',fileId:'f1',jumpTo:{canvasId:'c2',itemId:4}}]),board('c2',[{id:4,type:'note',text:'目标'}])]});
test('complete package includes unused library files, folders and distinct attachment names',()=>{
 const p=project(),s=model.encode(p);assert.equal(s.fileMeta.length,2);assert.notEqual(s.fileMeta[0].packageName,s.fileMeta[1].packageName);assert.equal(s.folders[0].name,'研究');
 const single=model.encode(p,'c1');assert.equal(single.fileMeta.length,1);assert.equal(single.canvases[0].items[2].jumpTo,null);
});
test('round trip preserves forward parent, cross-canvas target, folders, evidence and previews',()=>{
 const p=project();p.canvases[0].links=[{id:'l',aId:1,bId:3,sourceRef:{fileId:'f2',page:3}}];p.canvases[0].previews=[{id:'pv1',fileId:'f1'}];
 const s=model.encode(p);let uid=100;const out=model.decode(s,s.fileMeta.map((f,i)=>({name:f.packageName,buffer:new TextEncoder().encode('content '+i)})),prefix=>prefix+(uid++));
 const [a,b]=out.canvases;assert.equal(a.items[0].parentId,a.items[1].id);assert.equal(a.items[2].jumpTo.canvasId,b.id);assert.equal(a.items[2].jumpTo.itemId,b.items[0].id);assert.equal(out.files[0].folderId,out.folders[0].id);assert.equal(a.links[0].sourceRef.fileId,out.files[1].id);assert.equal(a.previews[0].fileId,out.files[0].id);
});
test('missing attachments reject entire import; legacy name-based packages remain readable',()=>{
 const p=project(),s=model.encode(p);assert.throws(()=>model.decode(s,[],x=>x),/附件缺失/);
 const old={version:'G4',canvases:[board('old')],fileMeta:[{oldId:'f',name:'old.txt',kind:'text'}]};assert.equal(model.decode(old,[{name:'old.txt',buffer:new Uint8Array([1])}],x=>x).files.length,1);
});
test('excerpt-only canvas exports its source and remaps the provenance on import',()=>{
 const p=project();p.canvases=[board('c1',[{id:1,type:'note',text:'摘录',sourceRef:{fileId:'f2',quote:'原文',anchor:{start:5,prefix:'前文',suffix:'后文'}}}])];
 const packed=model.encode(p,'c1');assert.equal(packed.fileMeta.length,1);assert.equal(packed.fileMeta[0].oldId,'f2');
 let uid=1;const imported=model.decode(packed,[{name:packed.fileMeta[0].packageName,buffer:Buffer.from('source')}],prefix=>prefix+(uid++));
 assert.equal(imported.canvases[0].items[0].sourceRef.fileId,imported.files[0].id);assert.equal(imported.canvases[0].items[0].sourceRef.anchor.prefix,'前文');
});
test('invalid graph cycles are rejected before import is committed',()=>{const p=project();p.files=[];p.canvases=[board('c',[{id:1,parentId:2},{id:2,parentId:1}])];assert.throws(()=>model.decode(model.encode(p),[],(()=>{let n=1;return p=>p+(n++);})()),/循环/);});
function stateSandbox(){
 const src=fs.readFileSync(path.join(__dirname,'../src/js/state.js'),'utf8');
 const ctx={structuredClone,console,document:{getElementById:()=>({style:{}})},renderSidePanel(){},render(){},saveStateDebounced(){},syncPvDom(){},destroyMorphDom(){},cleanupReferences(){},closeEditor(){},closeMindEditor(){},toast(){},previewLayer:null,restoreFiles(){}};
 vm.createContext(ctx);vm.runInContext('const state={projects:[],activeProjectId:null,activeCanvasId:null};let uid=1;function rebuildIdMap(){};'+src.slice(src.indexOf('function curProject()'),src.indexOf('/* 确保 uid'))+src.slice(src.indexOf('function switchCanvas('),src.indexOf('function renameFile('))+src.slice(src.indexOf('function saveCurrentCanvas('),src.indexOf('function boardXY(')),ctx);return ctx;
}
test('undo is isolated by canvas, switching back retains its history',()=>{
 const ctx=stateSandbox();ctx.setup={id:'p',files:[],canvases:[board('a',[{id:1}]),board('b',[{id:2}])]};
 vm.runInContext(`state.projects=[setup];state.activeProjectId='p';state.activeCanvasId='a';pushHistory('edit');state.items.push({id:3});switchCanvas('b');undo();`,ctx);
 assert.equal(ctx.setup.canvases[1].items[0].id,2);vm.runInContext(`switchCanvas('a');undo();`,ctx);assert.equal(ctx.setup.canvases[0].items.length,1);
});
test('moving last canvas copies dependencies, preserves jumps and leaves valid active state',()=>{
 const ctx=stateSandbox();ctx.projects=[{id:'source',files:[{id:'f'}],canvases:[board('only',[{id:1,fileId:'f'}])]},{id:'target',files:[],canvases:[board('t')]}];
 vm.runInContext(`state.projects=projects;state.activeProjectId='source';state.activeCanvasId='only';moveCanvasToProject('only','target');globalThis.active={project:state.activeProjectId,canvas:curCanvas().id};`,ctx);
 assert.equal(ctx.active.project,'target');assert.equal(ctx.active.canvas,'only');assert.equal(ctx.projects[0].canvases.length,1);assert.equal(ctx.projects[1].files[0].id,'f');
});
test('canvas move keeps existing attachment locations and excludes unrelated folder contents',()=>{
 const ctx=stateSandbox();ctx.projects=[{id:'source',files:[{id:'used',folderId:'uploaded'},{id:'unrelated',folderId:'uploaded'}],canvases:[board('only',[{id:1,fileId:'used'}])]},{id:'target',folders:[{id:'keep',name:'已有资料'}],files:[{id:'used',folderId:'keep'}],canvases:[board('t')]}];
 vm.runInContext(`state.projects=projects;state.activeProjectId='source';state.activeCanvasId='only';moveCanvasToProject('only','target');`,ctx);
 assert.equal(ctx.projects[1].files.length,1);assert.equal(ctx.projects[1].files[0].folderId,'keep');assert.equal(ctx.projects[1].folders.length,1);assert.equal(ctx.projects[0].files.length,2);
});
test('moving excerpt-only canvas carries its source without a material card',()=>{
 const ctx=stateSandbox();ctx.projects=[{id:'source',files:[{id:'f'}],canvases:[board('only',[{id:1,type:'note',sourceRef:{fileId:'f',quote:'original'}}])]},{id:'target',files:[],canvases:[board('t')]}];
 vm.runInContext(`state.projects=projects;state.activeProjectId='source';state.activeCanvasId='only';moveCanvasToProject('only','target');`,ctx);
 assert.equal(ctx.projects[1].files[0].id,'f');assert.equal(ctx.projects[1].canvases[1].items[0].sourceRef.fileId,'f');
});
function worker(job){return new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'../desktop/electron/package-worker.js'),{workerData:job});w.on('message',m=>{if(m.committing)w.postMessage({commit:true});if(m.result)resolve(m.result);});w.on('error',reject);});}
test('worker writes and reads distinct same-name originals and rejects collisions',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k6-test-'));try{
  const scratch=path.join(root,'scratch');fs.mkdirSync(scratch);const s=model.encode(project()),output=path.join(root,'result');
  const attachments=s.fileMeta.map((f,i)=>({name:f.packageName,buffer:Buffer.from('file '+i)}));
  const r=await worker({op:'export-folder',scratch,output,data:{structure:s,attachments}});assert.equal(r.ok,true);
  const loaded=await worker({op:'import-folder',input:output});assert.equal(loaded.attachments.length,2);assert.notDeepEqual(loaded.attachments[0].buffer,loaded.attachments[1].buffer);
  const bad=path.join(root,'bad');fs.mkdirSync(bad);const fail=await worker({op:'export-folder',scratch:bad,output:path.join(root,'badout'),data:{structure:s,attachments:[attachments[0],attachments[0]]}});assert.equal(fail.ok,false);assert.match(fail.error,/重复/);
 }finally{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('zhijian-k6-test-'))throw new Error('unsafe test cleanup');fs.rmSync(root,{recursive:true,force:true});}
});
test('cancel before commit leaves existing export untouched',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-k6-test-'));try{
  const scratch=path.join(root,'scratch');fs.mkdirSync(scratch);const output=path.join(root,'existing.fantin');fs.writeFileSync(output,'original');
  const result=await new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'../desktop/electron/package-worker.js'),{workerData:{op:'export-fantin',scratch,output,data:{structure:model.encode(project()),attachments:[]}}});w.on('message',async m=>{if(m.committing){await w.terminate();resolve('cancelled');}else if(m.result)reject(new Error('committed without authorization'));});w.on('error',reject);});
  assert.equal(result,'cancelled');assert.equal(fs.readFileSync(output,'utf8'),'original');
 }finally{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('zhijian-k6-test-'))throw new Error('unsafe cleanup');fs.rmSync(root,{recursive:true,force:true});}
});
