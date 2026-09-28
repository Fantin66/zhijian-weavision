const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {Worker}=require('worker_threads');
const base=path.resolve(__dirname,'..'),model=require('../src/js/package-model');
const worker=job=>new Promise((resolve,reject)=>{const w=new Worker(path.join(base,'desktop/electron/package-stream-worker.js'),{workerData:job});w.on('message',m=>{if(m.committing)w.postMessage({commit:true});if(m.result){resolve(m.result);w.terminate();}});w.on('error',reject)});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'zhijian-l1-unit-'));
test('L1 streamed 128 MiB attachment round trip, checksum and overwritten export',async()=>{
 const root=temp();try{const scratch=path.join(root,'scratch'),dir=path.join(scratch,'package');fs.mkdirSync(path.join(dir,'attachments'),{recursive:true});
 fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify({schemaVersion:3,canvases:[{id:'c',items:[],links:[]}],fileMeta:[]}));
 const original=path.join(dir,'attachments','large.bin'),chunk=crypto.randomBytes(4*1024**2),digest=crypto.createHash('sha256');const fd=fs.openSync(original,'w');for(let n=0;n<32;n++){fs.writeSync(fd,chunk);digest.update(chunk)}fs.closeSync(fd);const expected=digest.digest('hex');
 const output=path.join(root,'test.fantin');fs.writeFileSync(output,'previous export');const result=await worker({op:'export',format:'fantin',scratch,output});assert.equal(result.ok,true,result.error);
 const imported=path.join(root,'import');fs.mkdirSync(imported);const r=await worker({op:'import',format:'fantin',input:output,scratch:imported});assert.equal(r.ok,true,r.error);assert.equal(r.attachments[0].size,128*1024**2);
 const actual=crypto.createHash('sha256');for await(const data of fs.createReadStream(path.join(imported,'package/attachments/large.bin')))actual.update(data);assert.equal(actual.digest('hex'),expected);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('stream IPC rejects truncated writes and cancellation preserves destination',async()=>{
 const root=temp();try{const handlers={},output=path.join(root,'keep.fantin');fs.writeFileSync(output,'original');require('../desktop/electron/package-stream').install({ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{showSaveDialog:async()=>({filePath:output})},app:{getPath:()=>root},getWindow:()=>null});
 const event={sender:{id:1}},begin=()=>handlers['l1-package-begin'](event,{op:'export',format:'fantin',projectName:'test',structure:{fileMeta:[{packageName:'a.txt',size:9}],canvases:[]}});
 let r=await begin();assert.equal(r.ok,true);await handlers['l1-package-chunk'](event,{id:r.id,name:'a.txt',offset:0,buffer:Buffer.from('abc')});const finish=await handlers['l1-package-finish'](event,{id:r.id});assert.equal(finish.ok,false);assert.match(finish.error,/不完整/);assert.equal(fs.readFileSync(output,'utf8'),'original');
 r=await begin();assert.equal((await handlers['l1-package-cancel'](event,{id:r.id})).ok,true);assert.equal(fs.readFileSync(output,'utf8'),'original');assert.equal(fs.readdirSync(root).length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('parser keeps full text, ownership, unresolved jumps and handles cycles',()=>{
 const {analyze,render}=require('../../.agents/skills/zhijian-ai/scripts/parse-fantin');const report=analyze({schemaVersion:3,canvases:[{id:'c',items:[{id:1,parentId:2,text:'title',detail:'full detail',annotation:'full annotation',attachIds:[3],sourceRef:{quote:'original quote'}},{id:2,parentId:1},{id:3,type:'note',text:'full note',externalJump:{canvasId:'other'}}],links:[{aId:1,bId:999,annotation:'full relation annotation'}]}]});
 const output=render(report);for(const text of ['full detail','original quote','full note','full annotation','full relation annotation'])assert.ok(output.includes(text));assert.ok(report.warnings.some(w=>w.message==='父级循环'));assert.ok(report.warnings.some(w=>w.message==='关系端点缺失'));assert.equal(report.canvases[0].ownership[0].itemId,3);
});
test('managed skill updates pristine files and preserves customized files',()=>{
 const root=temp();try{const src=path.join(root,'src'),dst=path.join(root,'dst');fs.mkdirSync(src);const write=text=>{fs.writeFileSync(path.join(src,'SKILL.md'),text);fs.writeFileSync(path.join(src,'managed-manifest.json'),JSON.stringify({version:'L1',files:{'SKILL.md':crypto.createHash('sha256').update(text).digest('hex')}}))};
 const {installSkill}=require('../desktop/electron/skill-install');write('v1');installSkill(src,dst);write('v2');assert.equal(installSkill(src,dst).conflicts.length,0);assert.equal(fs.readFileSync(path.join(dst,'SKILL.md'),'utf8'),'v2');fs.writeFileSync(path.join(dst,'SKILL.md'),'custom');write('v3');assert.equal(installSkill(src,dst).conflicts.length,1);assert.equal(fs.readFileSync(path.join(dst,'SKILL.md'),'utf8'),'custom');assert.equal(fs.readFileSync(path.join(dst,'.updates/L1/SKILL.md'),'utf8'),'v3');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('single-canvas package retains external jumps and unresolved reading steps',()=>{
 const p={id:'p',name:'p',files:[],canvases:[{id:'a',items:[{id:1,jumpTo:{projectId:'p',canvasId:'b',itemId:2}}],links:[]},{id:'b',items:[{id:2}],links:[]}],readingPaths:[{id:'r',steps:[{canvasId:'a',itemId:1},{canvasId:'b',itemId:2}]}]};const packed=model.encode(p,'a');assert.equal(packed.canvases[0].items[0].externalJump.canvasId,'b');let i=10;const result=model.decode(packed,[],x=>x+(i++));assert.equal(result.readingPaths[0].steps[0].itemId,result.canvases[0].items[0].id);assert.equal(result.readingPaths[0].steps[1].unresolved,true);
});
