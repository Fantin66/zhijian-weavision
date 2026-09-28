const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const base=path.resolve(__dirname,'..'),model=require('../src/js/package-model');

test('L3 shortest walks parentId/children when type=all',()=>{
  function shortest(canvas,from,to,type,direction){
    const queue=[[from]],seen=new Set([from]);
    while(queue.length){
      const route=queue.shift(),id=route[route.length-1];
      if(id===to)return route;
      for(const link of canvas.links||[]){if(type!=='all'&&link.relationType!==type)continue;let other;if(link.aId===id&&(direction!=='in'||!link.directional))other=link.bId;if(link.bId===id&&(direction!=='out'||!link.directional))other=link.aId;if(other!==undefined&&!seen.has(other)){seen.add(other);queue.push([...route,other]);}}
      if(type==='all'){const it=canvas.items.find(i=>i.id===id);if(it){if(it.parentId!=null&&!seen.has(it.parentId)){seen.add(it.parentId);queue.push([...route,it.parentId]);}for(const ch of it.children||[]){if(!seen.has(ch)){seen.add(ch);queue.push([...route,ch]);}}}}
    }
    return [];
  }
  const c={items:[{id:1,parentId:null,children:[2]},{id:2,parentId:1,children:[3]},{id:3,parentId:2,children:[]}],links:[]};
  assert.equal(shortest(c,1,3,'all','both').length,3,'root→grandchild via parentId');
  assert.equal(shortest(c,3,1,'all','both').length,3,'grandchild→root via parentId');
  const c2={items:[{id:1,parentId:null,children:[]},{id:2,parentId:null,children:[]}],links:[]};
  assert.equal(shortest(c2,1,2,'all','both').length,0,'disconnected roots no path');
  const c3={items:[{id:1,parentId:null,children:[2]},{id:2,parentId:1,children:[]}],links:[{aId:2,bId:1,relationType:'related',directional:false}]};
  assert.equal(shortest(c3,1,2,'all','both').length,2,'root→child via parentId or link');
});

test('L3 inspectRelations only flags mindNode as unconnected (not note/fileCard)',()=>{
  function inspectRelations(project){
    const issues=[];
    for(const c of project.canvases){
      const ids=new Map(c.items.map(i=>[i.id,i])),connected=new Set();
      for(const l of c.links||[]){connected.add(l.aId);connected.add(l.bId);}
      for(const i of c.items){if(i.parentId){connected.add(i.id);connected.add(i.parentId);}}
      for(const i of c.items)if(i.type==="mindNode"&&!connected.has(i.id))issues.push({text:'未连接',itemId:i.id});
    }
    return issues;
  }
  const p={canvases:[{id:'c',items:[
    {id:1,type:'mindNode',parentId:null,children:[2]},
    {id:2,type:'mindNode',parentId:1,children:[]},
    {id:3,type:'note'},
    {id:4,type:'fileCard'}
  ],links:[]}]};
  const issues=inspectRelations(p);
  assert.equal(issues.length,0,'no unconnected: root via child parentId, note/fileCard not checked');
  const p2={canvases:[{id:'c',items:[{id:5,type:'mindNode',parentId:null,children:[]},{id:6,type:'note'}],links:[]}]};
  const issues2=inspectRelations(p2);
  assert.equal(issues2.length,1,'isolated mindNode flagged');
  assert.equal(issues2[0].itemId,5);
});

test('L3 package-model round trip preserves parentId/children consistency',()=>{
  let i=100;
  const p={id:'p',name:'test',files:[],folders:[],canvases:[{id:'c',items:[
    {id:1,type:'mindNode',text:'root',parentId:null,children:[2],x:0,y:0,w:156,h:44,color:'#2d5fd3',collapsed:false,attachIds:[],detail:'',annotation:''},
    {id:2,type:'mindNode',text:'child',parentId:1,children:[],x:100,y:100,w:156,h:44,color:'#319b77',collapsed:false,attachIds:[],detail:'',annotation:''}
  ],links:[{id:'l1',aId:1,bId:2,relationType:'supports',directional:true,annotation:'test',level:'normal'}],camera:{x:0,y:0,zoom:1},previews:[]}],isBuiltin:false};
  const packed=model.encode(p);
  const decoded=model.decode(packed,[],x=>x+(i++));
  const root=decoded.canvases[0].items.find(it=>it.text==='root');
  const child=decoded.canvases[0].items.find(it=>it.text==='child');
  assert.equal(child.parentId,root.id,'child parentId remapped to new root id');
  assert.ok(root.children.includes(child.id),'root children includes new child id');
  assert.equal(decoded.canvases[0].links[0].relationType,'supports');
});

test('L3 CSS has no dangling selector lists',()=>{
  const css=fs.readFileSync(path.join(base,'src/styles.css'),'utf8');
  const lines=css.split('\n');
  let dangling=0;
  for(const line of lines){
    const trimmed=line.trimEnd();
    if(/\[data-style="[^"]*"\]\s*$/.test(trimmed)&&trimmed.endsWith('] ')){
      dangling++;
    }
  }
  assert.equal(dangling,0,'no dangling selector lists in styles.css');
});
