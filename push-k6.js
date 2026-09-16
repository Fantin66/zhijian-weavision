const fs=require('fs'),https=require('https'),{execSync}=require('child_process');
const TOKEN=process.argv[2];
const baseCommit='b1cdaf6ce384b681c79f28f0c30a5fc239511ee4';
const repo='Fantin66/weavision';

function apiCall(method,path,body){
  return new Promise((res,rej)=>{
    const data=body?JSON.stringify(body):null;
    const req=https.request({hostname:'api.github.com',path:'/repos/'+repo+path,method,
      headers:{'Authorization':'token '+TOKEN,'Content-Type':'application/json','Content-Length':data?Buffer.byteLength(data):0,'User-Agent':'node'}
    },r=>{let c='';r.on('data',d=>c+=d);r.on('end',()=>{try{res(JSON.parse(c))}catch(e){res(c)}})});
    if(data)req.write(data);req.end();req.on('error',rej);
  });
}

async function main(){
  const changed=execSync('git diff --name-only b1cdaf6 4d2fe3a').toString().trim().split('\n');
  console.log('Changed files:',changed.length);
  
  const treeEntries=[];
  for(const f of changed){
    const content=fs.readFileSync(f);
    const b64=content.toString('base64');
    const blob=await apiCall('POST','/git/blobs',{content:b64,encoding:'base64'});
    if(!blob.sha){console.log('blob fail:',f,blob);continue;}
    treeEntries.push({path:f,mode:'100644',type:'blob',sha:blob.sha});
    console.log('blob:',f,'->',blob.sha);
  }
  
  const k5TreeSha=execSync('git log --format=%T -1 b1cdaf6').toString().trim();
  console.log('K5 tree:',k5TreeSha);
  
  const newTree=await apiCall('POST','/git/trees',{base_tree:k5TreeSha,tree:treeEntries});
  console.log('New tree:',newTree.sha);
  
  const commit=await apiCall('POST','/git/commits',{message:'K6 0.8.0',tree:newTree.sha,parents:[baseCommit]});
  console.log('Commit response:',JSON.stringify(commit).slice(0,200));
  if(!commit.sha){console.log('Commit failed, full:',JSON.stringify(commit));return;}
  console.log('New commit:',commit.sha);
  
  const ref=await apiCall('PATCH','/git/refs/heads/master',{sha:commit.sha,force:true});
  console.log('Master updated:',ref.object&&ref.object.sha);
  
  const tag=await apiCall('POST','/git/refs',{ref:'refs/tags/v0.8.0-K6',sha:commit.sha});
  console.log('Tag created:',tag.ref||JSON.stringify(tag));
}
main().catch(e=>console.error('ERROR:',e.message));
