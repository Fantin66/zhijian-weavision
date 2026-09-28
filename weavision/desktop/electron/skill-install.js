const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function installSkill(source,destination){
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'managed-manifest.json'),'utf8'));
 let previous={files:{}};try{previous=JSON.parse(fs.readFileSync(path.join(destination,'managed-manifest.json'),'utf8'))}catch{}
 const conflicts=[],installed={},staged=path.join(destination,'.updates',manifest.version);
 for(const [name,digest]of Object.entries(manifest.files)){
  if(name.split('/').includes('..')||path.isAbsolute(name))throw new Error('Invalid managed path');
  const src=path.join(source,name),dst=path.join(destination,name);
  if(hash(src)!==digest)throw new Error('Skill package checksum mismatch: '+name);
  if(fs.existsSync(dst)&&hash(dst)!==digest&&hash(dst)!==previous.files[name]){
   const update=path.join(staged,name);fs.mkdirSync(path.dirname(update),{recursive:true});fs.copyFileSync(src,update);conflicts.push(name);if(previous.files[name])installed[name]=previous.files[name];
  }else{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);installed[name]=digest;}
 }
 fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'managed-manifest.json'),JSON.stringify({version:manifest.version,files:installed,conflicts},null,2));
 if(conflicts.length){fs.mkdirSync(staged,{recursive:true});fs.copyFileSync(path.join(source,'managed-manifest.json'),path.join(staged,'managed-manifest.json'));fs.writeFileSync(path.join(staged,'README.txt'),'Existing files were preserved because they were customized or installed before managed upgrades. Review this L1 update before replacing them.\n'+conflicts.join('\n'));}
 return {ok:true,conflicts,staged:conflicts.length?staged:null};
}
module.exports={installSkill};
