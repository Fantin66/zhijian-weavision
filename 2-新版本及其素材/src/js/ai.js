"use strict";
/* ============================================================
   AI 编排接口（同页上下文调用，不读取或传出本地文件内容）
============================================================ */
const ZHIJIAN_AI_API_VERSION="1.3";   /* 1.3: 形变/展开/线权重/线型控制 */
const AI_LIMITS={nodes:240,notes:120,attachments:120,relations:480,batch:60,planChars:160000};
const AI_LAYOUTS={logic:"logic",right:"logic",left:"logic",org:"org",fishbone:"fishbone",timeline:"timeline",u:"logic",brace:"logic",radial:"logic",both:"logic"};
function aiFail(message){throw new Error(message);}
function aiProject(projectId){
  const project=state.projects.find(p=>p.id===projectId);
  if(!project)aiFail("未找到项目："+projectId);return project;
}
function aiActivate(projectId,canvasId){
  const project=aiProject(projectId||state.activeProjectId);
  const canvas=project.canvases.find(c=>c.id===canvasId)||project.canvases[0];
  if(!canvas)aiFail("项目中没有可用画布");
  state.activeProjectId=project.id;state.activeCanvasId=canvas.id;state.selected=null;return{project,canvas};
}
function aiItem(ref,aliases){
  const id=aliases&&aliases.get(String(ref))||ref;
  const item=state.items.find(it=>String(it.id)===String(id));
  if(!item)aiFail("未找到元素："+ref);return item;
}
function aiSnapshot(){
  const d={
    version:ZHIJIAN_AI_API_VERSION,
    activeProjectId:state.activeProjectId,activeCanvasId:state.activeCanvasId,
    projects:state.projects.map(p=>({id:p.id,name:p.name,files:(p.files||[]).map(f=>({id:f.id,name:f.name,kind:f.kind,size:f.size,mime:f.mime,folderId:f.folderId||null,aiSource:f.aiSource||null})),canvases:(p.canvases||[]).map(c=>({id:c.id,name:c.name,items:c.items||[],links:c.links||[]}))})),
    preferences:{dark:state.dark,fontPreset:state.fontPreset,bgPattern:state.bgPattern,bgColorName:state.bgColorName,layoutType:state.layoutType,stylePreset:state.stylePreset,immersive:!!document.body.classList.contains("immersive")},
  };
  return typeof structuredClone==="function"?structuredClone(d):JSON.parse(JSON.stringify(d));
}
function aiCommit(){cleanupProjectReferences();syncUid();renderSidePanel();render();saveState();}
function aiRelation(aId,bId,type,annotation){
  const relationType=RELATION_TYPES[type]?type:"related";
  const existing=state.links.find(l=>(l.aId===aId&&l.bId===bId)||(l.aId===bId&&l.bId===aId));
  if(existing){existing.relationType=relationType;existing.directional=!!RELATION_TYPES[relationType].directional;existing.annotation=annotation||existing.annotation||"";return existing;}
  const link={id:"lnk"+(uid++),aId,bId,annotation:annotation||"",relationType,directional:!!RELATION_TYPES[relationType].directional};
  state.links.push(link);return link;
}
function aiRegisterSource(source){
  if(source.fileId){const file=state.files.find(f=>f.id===source.fileId);if(!file)aiFail("未找到附件："+source.fileId);return file;}
  /* I5-fix: 放行 source.kind（此前硬编码 "other"，与命令文档宣称的 kind 参数不符） */
  const file={id:"ai-file-"+(uid++),name:source.name||"AI 来源材料",kind:source.kind||"other",size:Number(source.size)||0,mime:source.mime||"text/plain",url:null,created:Date.now(),folderId:null,aiSource:{summary:source.summary||"",locator:source.locator||"",excerpt:source.excerpt||""}};
  state.files.push(file);return file;
}
function normalizeAiLayout(value){
  const key=String(value||"right");
  if(!Object.prototype.hasOwnProperty.call(AI_LAYOUTS,key))aiFail("不支持的布局："+key);
  return AI_LAYOUTS[key];
}
function aiApplyStyle(value,explicitFont){
  let key=value||state.stylePreset;
  if(STYLE_ALIAS[key])key=STYLE_ALIAS[key];
  if(!STYLE_PRESETS[key])aiFail("不支持的样式："+key);
  state.stylePreset=key;
  if(explicitFont&&FONT_PRESETS[explicitFont])state.fontPreset=explicitFont;
  /* I5-fix: key==="paper" 分支不可达（STYLE_PRESETS 无 paper 且上方已 aiFail），删除 */
  else if(key==="minimal")state.fontPreset="serif";
  applyFontPreset();
  return key;
}
function aiValidatePlan(plan){
  const nodes=Array.isArray(plan.nodes)?plan.nodes:[];
  const notes=Array.isArray(plan.notes)?plan.notes:[];
  const attachments=Array.isArray(plan.attachments)?plan.attachments:[];
  const relations=Array.isArray(plan.relations)?plan.relations:[];
  if(nodes.length>AI_LIMITS.nodes||notes.length>AI_LIMITS.notes||attachments.length>AI_LIMITS.attachments||relations.length>AI_LIMITS.relations)aiFail("画布计划超过安全上限，请拆分为多个画布");
  if(JSON.stringify(plan).length>AI_LIMITS.planChars)aiFail("画布计划文本过大，请拆分后重试");
  const keys=new Set();
  for(const spec of [...nodes,...notes,...attachments]){
    if(!spec||typeof spec!=="object")aiFail("计划元素必须是对象");
    const key=spec&& (spec.key||spec.id);
    if(key===undefined||key===null)continue;
    if(keys.has(String(key)))aiFail("计划内 key/id 重复："+key);
    keys.add(String(key));
    for(const axis of ["x","y","w","h","order"]){
      if(spec[axis]!==undefined&&!Number.isFinite(Number(spec[axis])))aiFail("元素 "+key+" 的 "+axis+" 必须是有限数字");
    }
  }
  normalizeAiLayout(plan.layout||"logic");
}
function aiCaptureState(){
  /* I5-fix: file.blob 是 Blob 对象，JSON 序列化会把它丢成 null——按引用单独保存，
     恢复时回填，否则 batch 失败回滚后全部附件预览失效直到重启 */
  const blobs={};
  for(const p of state.projects)for(const f of (p.files||[]))if(f.blob)blobs[p.id+":"+f.id]=f.blob;
  return {
    json:JSON.stringify({
      projects:state.projects,activeProjectId:state.activeProjectId,activeCanvasId:state.activeCanvasId,
      selected:state.selected,ui:{dark:state.dark,fontPreset:state.fontPreset,bgPattern:state.bgPattern,bgColorName:state.bgColorName,layoutType:state.layoutType,stylePreset:state.stylePreset,immersive:document.body.classList.contains("immersive")},uid,
    }),
    blobs,
  };
}
function aiRestoreState(snapshot){
  const snap=JSON.parse(snapshot.json!==undefined?snapshot.json:snapshot);
  state.projects=snap.projects;state.activeProjectId=snap.activeProjectId;state.activeCanvasId=snap.activeCanvasId;state.selected=snap.selected||null;
  Object.assign(state,snap.ui||{});uid=snap.uid||uid;
  if(snapshot.blobs)for(const p of state.projects)for(const f of (p.files||[])){const k=p.id+":"+f.id;if(snapshot.blobs[k])f.blob=snapshot.blobs[k];}
  applyTheme();applyFontPreset();cleanupProjectReferences();syncUid();renderSidePanel();render();saveState();
}
function aiRunBatch(commands){
  if(!Array.isArray(commands)||!commands.length)aiFail("batch 需要非空 commands 数组");
  if(commands.length>AI_LIMITS.batch)aiFail("batch 命令过多，请拆分执行");
  const before=aiCaptureState(),undoLen=undoStack.length,redoLen=redoStack.length,results=[];
  for(let index=0;index<commands.length;index++){
    const command=commands[index];
    if(!command||typeof command!=="object"||command.op==="batch"){
      aiRestoreState(before);undoStack.length=undoLen;redoStack.length=redoLen;aiFail("batch 第 "+(index+1)+" 条命令无效");
    }
    const result=aiExecute(command);
    if(!result.ok){
      aiRestoreState(before);undoStack.length=undoLen;redoStack.length=redoLen;
      aiFail("batch 第 "+(index+1)+" 条失败："+result.error);
    }
    results.push(result.value);
  }
  return results;
}
function aiBuildCanvas(plan){
  if(!plan||typeof plan!=="object")aiFail("画布计划必须是对象");
  aiValidatePlan(plan);
  if(plan.replace&&plan.confirmReplace!==true)aiFail("替换画布需要 confirmReplace: true");
  /* I5-fix: 先快照再动工——构建中途 aiFail（保留 key/循环引用/关联引用等）时整体回滚。
     此前 replace 清空在先、校验失败在后，失败会留下被清空/半建的画布+一条孤儿撤销记录 */
  const _snapshot=aiCaptureState(),_undoLen=undoStack.length,_redoLen=redoStack.length;
  try{
  let project=curProject();
  if(plan.projectId)project=aiProject(plan.projectId);
  if(plan.projectName&&!plan.projectId){const found=state.projects.find(p=>p.name===plan.projectName);if(found)project=found;else{project=createProject(plan.projectName);}}
  state.activeProjectId=project.id;
  let canvas=plan.canvasId?project.canvases.find(c=>c.id===plan.canvasId):null;
  if(!canvas){canvas=createCanvas(plan.canvasName||plan.title||"AI 生成画布");}
  state.activeCanvasId=canvas.id;
  pushHistory();
  if(plan.replace){state.items=[];state.links=[];state.previews=[];}
  const aliases=new Map(),nodes=[...(plan.nodes||[])].map(spec=>({...spec})),notes=plan.notes||[],attachments=plan.attachments||[];
  /* 一张思维关系板需要稳定的唯一根。AI 有时会把多个章节都写成根级，
     旧引擎只排第一个根，其他根便会堆在原点。此处自动包一层主题根。 */
  const roots=nodes.filter(spec=>!(spec.parentKey||spec.parentId));
  if(nodes.length>1&&roots.length>1){
    const rootKey="__zhijian_auto_root__";
    if(nodes.some(spec=>String(spec.key||spec.id)===rootKey))aiFail("计划不能使用保留 key："+rootKey);
    nodes.unshift({key:rootKey,title:plan.rootTitle||plan.title||"主题",order:-1});
    for(const spec of roots)spec.parentKey=rootKey;
  }
  let unresolved=nodes.slice();
  while(unresolved.length){
    const before=unresolved.length;
    unresolved=unresolved.filter(spec=>{
      const parentRef=spec.parentKey||spec.parentId||null;
      if(parentRef&&!aliases.has(String(parentRef)))return true;
      const parentId=parentRef?aliases.get(String(parentRef)):null;
      const node=addMindNode(spec.title||spec.text||"未命名主题",parentId,spec.color||null,spec.x,spec.y);
      node.detail=spec.explanation||spec.detail||"";node.annotation=spec.annotation||"";
      if(spec.order!==undefined)node.layoutOrder=Number(spec.order);
      if(spec.collapsed===true)node.collapsed=true;
      if(spec.jumpTo)node.jumpTo=spec.jumpTo;
      aliases.set(String(spec.key||spec.id||node.id),node.id);return false;
    });
    if(unresolved.length===before)aiFail("节点父级不存在或存在循环引用");
  }
  for(const spec of notes){
    const note=addNote(spec.x||0,spec.y||0,spec.markdown||spec.text||"",spec.color||state.noteColor);
    note.annotation=spec.annotation||""; /* E5: note.detail removed — mind-node only */
    if(spec.fontFamily)note.fontFamily=spec.fontFamily;if(spec.fontSize)note.fontSize=spec.fontSize;if(spec.underline)note.underline=true;if(spec.bold)note.bold=true;
    if(spec.jumpTo)note.jumpTo=spec.jumpTo;
    aliases.set(String(spec.key||spec.id||note.id),note.id);
  }
  for(const spec of attachments){
    const file=aiRegisterSource(spec);const card=addFileCard(spec.x||0,spec.y||0,file.id);
    card.annotation=spec.annotation||""; /* E5: card.detail removed — mind-node only */
    if(spec.previewOpen===true){
      card.previewOpen=true;
      /* 修复：同步设置预览目标尺寸，否则 syncMorphDom 会以卡片尺寸创建覆盖层 */
      if(card._cardW===undefined){card._cardW=160;card._cardH=card.kind==="img"&&card.tw&&card.th?160:52;}
      if(!card._morphW||!card._morphH){const ts=previewTargetSize(card);card._morphW=ts.w;card._morphH=ts.h;}
      card.w=card._morphW;card.h=card._morphH;
    }
    if(spec.jumpTo)card.jumpTo=spec.jumpTo;
    aliases.set(String(spec.key||spec.id||card.id),card.id);
    if(spec.attachTo||spec.nodeKey){const node=aiItem(spec.attachTo||spec.nodeKey,aliases);if(node.type!=="mindNode")aiFail("附件只能关联到导图节点");node.attachIds=Array.from(new Set([...(node.attachIds||[]),card.id]));}
  }
  for(const spec of plan.relations||[]){
    const a=aiItem(spec.from||spec.a||spec.aId,aliases),b=aiItem(spec.to||spec.b||spec.bId,aliases);
    const link=aiRelation(a.id,b.id,spec.type||spec.relationType,spec.annotation);
    if(spec.level&&["normal","emphasis","highlight"].includes(spec.level))link.level=spec.level;
    if(spec.shape&&["auto","curve","polyline","straight"].includes(spec.shape))link.shape=spec.shape;
  }
  for(const spec of notes){
    if(spec.attachTo||spec.nodeKey){const node=aiItem(spec.attachTo||spec.nodeKey,aliases),note=aiItem(spec.key||spec.id,aliases);if(node.type!=="mindNode")aiFail("便签只能关联到导图节点");node.attachIds=Array.from(new Set([...(node.attachIds||[]),note.id]));}
  }
  state.layoutType=normalizeAiLayout(plan.layout||"logic");
  if(plan.arrange!==false)autoLayout();
  aiCommit();
  return{projectId:project.id,canvasId:canvas.id,aliases:Object.fromEntries(aliases)};
  }catch(e){
    aiRestoreState(_snapshot);undoStack.length=_undoLen;redoStack.length=_redoLen;
    aiFail(e&&e.message?e.message:"画布构建失败，已回滚");
  }
}
function aiUpdateItem(ref,patch){
  const item=aiItem(ref);const allowed=["text","color","detail","annotation","x","y","w","h","collapsed","fontFamily","fontSize","underline","bold","jumpTo","previewOpen"];
  for(const key of allowed)if(Object.prototype.hasOwnProperty.call(patch||{},key)){
    if(key==="previewOpen"&&item.type==="fileCard"){
      /* 修复：patch previewOpen 不能直接赋值，需走 togglePreviewMorph 正确设尺寸+动画 */
      const want=!!patch[key];
      if(item.previewOpen!==want)togglePreviewMorph(item);
      continue;
    }
    /* I5-fix: 坐标/尺寸/字号必须是有限数字——"w":"big" 之类的脏值会毒化包围盒计算 */
    if(["x","y","w","h","fontSize"].includes(key)){
      const num=Number(patch[key]);
      if(!Number.isFinite(num))aiFail("字段 "+key+" 必须是有限数字");
      item[key]=num;continue;
    }
    item[key]=patch[key];
  }
  aiCommit();return item;
}
function aiExecute(command){
  try{
    if(!command||typeof command!=="object")aiFail("命令必须是对象");
    const op=command.op||command.action;
    let value;
    switch(op){
      case "snapshot":value=aiSnapshot();break;
      case "activate":value=aiActivate(command.projectId,command.canvasId).canvas;aiCommit();break;
      case "create_project":value=createProject(command.name||"AI 项目");break;
      case "rename_project":{const project=aiProject(command.projectId||state.activeProjectId);if(!command.name)aiFail("项目名称不能为空");project.name=command.name;aiCommit();value={id:project.id,name:project.name};break;}
      case "create_canvas":aiActivate(command.projectId||state.activeProjectId);value=createCanvas(command.name||"AI 画布");break;
      case "rename_canvas":aiActivate(command.projectId||state.activeProjectId,command.canvasId);renameCanvas(command.canvasId,command.name);value={id:command.canvasId,name:command.name};break;
      case "delete_project":if(command.confirm!==true)aiFail("删除项目需要 confirm: true");deleteProject(command.projectId||state.activeProjectId);value={};break;
      case "delete_canvas":if(command.confirm!==true)aiFail("删除画布需要 confirm: true");aiActivate(command.projectId||state.activeProjectId,command.canvasId);deleteCanvas(command.canvasId);value={};break;
      case "create_node":aiActivate(command.projectId||state.activeProjectId,command.canvasId||state.activeCanvasId);pushHistory();value=addMindNode(command.title||command.text||"未命名主题",command.parentId||null,command.color||null,command.x,command.y);value.detail=command.detail||command.explanation||"";aiCommit();break;
      case "create_note":aiActivate(command.projectId||state.activeProjectId,command.canvasId||state.activeCanvasId);pushHistory();value=addNote(command.x||0,command.y||0,command.markdown||command.text||"",command.color||state.noteColor);if(command.fontFamily&&FONT_PRESETS[command.fontFamily])value.fontFamily=command.fontFamily;if(Number.isFinite(Number(command.fontSize)))value.fontSize=clamp(Number(command.fontSize),10,28);if(command.underline)value.underline=true;if(command.bold)value.bold=true; /* E5: note.detail removed; I5-fix: 兑现文档承诺的排版参数 */aiCommit();break;
      case "create_attachment":aiActivate(command.projectId||state.activeProjectId,command.canvasId||state.activeCanvasId);pushHistory();{const file=aiRegisterSource(command.source||command);value=addFileCard(command.x||0,command.y||0,file.id);if(command.attachTo){const node=aiItem(command.attachTo);if(node.type!=="mindNode")aiFail("附件只能关联到导图节点");node.attachIds=Array.from(new Set([...(node.attachIds||[]),value.id]));}aiCommit();}break;
      case "create_stroke":{const points=command.points||[];if(points.length<2)aiFail("画笔至少需要两个坐标点");if(!points.every(p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))))aiFail("画笔坐标必须是有限数字");pushHistory();value={id:uid++,type:"stroke",points:points.map(p=>({x:Number(p.x),y:Number(p.y)})),color:command.color||state.penColor,size:Number(command.size)||state.penSize,detail:command.detail||"",annotation:command.annotation||"",birth:performance.now()};state.items.push(value);aiCommit();break;}
      case "create_connector":{if(!command.a||!command.b)aiFail("连接线需要 a 和 b 两个端点");pushHistory();value=addConnector(command.a,command.b);value.color=command.color||value.color;value.width=Number(command.width)||value.width;aiCommit();break;}
      case "build_canvas":value=aiBuildCanvas(command.plan||command);break;
      case "update_item":pushHistory();value=aiUpdateItem(command.itemId||command.id,command.patch);break;
      case "duplicate_item":duplicateItem(command.itemId||command.id);value={};break;
      case "delete_item":deleteItem(command.itemId||command.id);value={id:command.itemId||command.id};break;
      case "relate":pushHistory();value=aiRelation(aiItem(command.from).id,aiItem(command.to).id,command.type,command.annotation);aiCommit();break;
      case "update_relation":{const link=state.links.find(l=>l.id===(command.linkId||command.id));if(!link)aiFail("未找到关系线");pushHistory();if(command.type&&RELATION_TYPES[command.type]){link.relationType=command.type;link.directional=!!RELATION_TYPES[command.type].directional;}if(Object.prototype.hasOwnProperty.call(command,"annotation"))link.annotation=command.annotation||"";if(command.level&&["normal","emphasis","highlight"].includes(command.level))link.level=command.level;if(command.shape&&["auto","curve","polyline","straight"].includes(command.shape))link.shape=command.shape;aiCommit();value=link;break;}
      case "attach":{const node=aiItem(command.nodeId),item=aiItem(command.itemId);if(node.type!=="mindNode"||item.type==="mindNode")aiFail("只能将非节点元素关联到导图节点");pushHistory();node.attachIds=Array.from(new Set([...(node.attachIds||[]),item.id]));aiCommit();value={nodeId:node.id,itemId:item.id};break;}
      case "detach":{const node=aiItem(command.nodeId),item=aiItem(command.itemId);if(node.type!=="mindNode")aiFail("关联目标必须是导图节点");pushHistory();node.attachIds=(node.attachIds||[]).filter(id=>id!==item.id);aiCommit();value={nodeId:node.id,itemId:item.id};break;}
      case "reparent_node":{const node=aiItem(command.nodeId),parent=command.parentId?aiItem(command.parentId):null;if(node.type!=="mindNode"||(parent&&parent.type!=="mindNode"))aiFail("父子关系只能用于导图节点");let cursor=parent;while(cursor){if(cursor.id===node.id)aiFail("不能把节点移动到自己的子树中");cursor=cursor.parentId&&state.items.find(it=>it.id===cursor.parentId);}pushHistory();const old=node.parentId&&state.items.find(it=>it.id===node.parentId);if(old)old.children=(old.children||[]).filter(id=>id!==node.id);node.parentId=parent?parent.id:null;if(parent)parent.children=Array.from(new Set([...(parent.children||[]),node.id]));aiCommit();value={nodeId:node.id,parentId:node.parentId};break;}
      case "delete_relation":deleteItem(command.linkId||command.id);value={id:command.linkId||command.id};break;
      /* ── 形变/展开控制（G5-AI v1.3）── */
      case "toggle_morph":{const it=aiItem(command.itemId||command.id);if(it.type!=="fileCard")aiFail("形变控制仅适用于附件卡片");togglePreviewMorph(it);value={itemId:it.id,previewOpen:it.previewOpen};break;}
      case "set_morph":{const it=aiItem(command.itemId||command.id);if(it.type!=="fileCard")aiFail("形变控制仅适用于附件卡片");const want=command.open!==undefined?!!command.open:command.previewOpen!==undefined?!!command.previewOpen:true;if(it.previewOpen!==want){togglePreviewMorph(it);}value={itemId:it.id,previewOpen:it.previewOpen};break;}
      case "toggle_detail":{const it=aiItem(command.itemId||command.id);if(it.type!=="mindNode")aiFail("展开控制仅适用于导图节点");pushHistory();toggleDetailInPlace(it);value={itemId:it.id,expanded:expandedDetailIds.has(it.id)};break;}
      case "set_detail":{const it=aiItem(command.itemId||command.id);if(it.type!=="mindNode")aiFail("展开控制仅适用于导图节点");const want=command.expand!==undefined?!!command.expand:true;pushHistory();if(want&&!expandedDetailIds.has(it.id)){expandDetailInPlace(it,true);}else if(!want&&expandedDetailIds.has(it.id)){collapseDetailInPlace(it);}render();value={itemId:it.id,expanded:expandedDetailIds.has(it.id)};break;}
      case "set_link_level":{const link=state.links.find(l=>l.id===(command.linkId||command.id));if(!link)aiFail("未找到关系线");if(!["normal","emphasis","highlight"].includes(command.level))aiFail("线权重必须是 normal/emphasis/highlight");pushHistory();link.level=command.level;aiCommit();value={linkId:link.id,level:link.level};break;}
      case "set_link_shape":{const link=state.links.find(l=>l.id===(command.linkId||command.id));if(!link)aiFail("未找到关系线");if(!["auto","curve","polyline","straight"].includes(command.shape))aiFail("线型必须是 auto/curve/polyline/straight");pushHistory();link.shape=command.shape;aiCommit();value={linkId:link.id,shape:link.shape};break;}
      case "set_layout":{state.layoutType=normalizeAiLayout(command.layout);pushHistory();autoLayout();aiCommit();value={layout:state.layoutType};break;}
      case "set_style":{aiApplyStyle(command.style||command.stylePreset,command.fontPreset);render();aiCommit();value={stylePreset:state.stylePreset,fontPreset:state.fontPreset};break;}
      case "set_preferences":{
        state.dark=command.dark??state.dark;
        state.bgPattern=command.bgPattern||state.bgPattern;
        state.bgColorName=command.bgColorName||state.bgColorName;
        if(command.stylePreset!==undefined)aiApplyStyle(command.stylePreset,command.fontPreset);
        else if(command.fontPreset&&FONT_PRESETS[command.fontPreset])state.fontPreset=command.fontPreset;
        applyTheme();applyFontPreset();render();aiCommit();value=aiSnapshot().preferences;break;
      }
      case "focus":enterFocus(aiItem(command.itemId||command.id).id);value={id:command.itemId||command.id};break;
      case "exit_focus":exitFocus();value={};break;
      case "undo":undo();value={};break;
      case "redo":redo();value={};break;
      case "batch":value=aiRunBatch(command.commands);break;
      default:aiFail("不支持的 AI 命令："+op);
    }
    return{ok:true,value};
  }catch(error){return{ok:false,error:error.message||String(error)};}
}
window.ZhijianAI=Object.freeze({version:ZHIJIAN_AI_API_VERSION,snapshot:aiSnapshot,execute:aiExecute,buildCanvas:plan=>aiExecute({op:"build_canvas",plan})});
/* 不再监听可被任意同页脚本伪造的 zhijian:command 事件。
   自动化应显式调用 window.ZhijianAI，调用方与用户可清楚看到入口和返回值。 */
/* init() moved to app.js */
