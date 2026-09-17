const L1Research=(()=>{
  function usages(fileId){const rows=[];for(const p of state.projects)for(const c of p.canvases){
    for(const i of c.items)if(i.fileId===fileId||i.sourceRef?.fileId===fileId)rows.push({projectId:p.id,projectName:p.name,canvasId:c.id,canvasName:c.name,itemId:i.id,type:i.fileId===fileId?'材料卡片':'摘录来源',text:i.text||i.annotation||'材料'});
    for(const l of c.links||[])if(l.sourceRef?.fileId===fileId)rows.push({projectId:p.id,projectName:p.name,canvasId:c.id,canvasName:c.name,itemId:l.aId,linkId:l.id,type:'关系证据',text:l.annotation||l.relationType});
    for(const v of c.previews||[])if(v.fileId===fileId)rows.push({projectId:p.id,projectName:p.name,canvasId:c.id,canvasName:c.name,type:'打开的预览',text:'附件预览'});
  }return rows;}
  function showUsages(fileId){const file=state.projects.flatMap(p=>p.files).find(f=>f.id===fileId);const rows=usages(fileId);
    showModal('资料使用位置 · '+(file?.name||''),'<p>共 '+rows.length+' 处引用；查看位置不会复制或移动原文件。</p><div id="l1UsageList"></div>',[{label:'关闭'}]);
    const host=modal.querySelector('#l1UsageList');for(const row of rows){const b=document.createElement('button');b.className='k6-list-row';b.textContent=row.projectName+' / '+row.canvasName+' · '+row.type+' · '+row.text;b.onclick=()=>{hideModal();L1Search.locate(row);};host.append(b);}
    if(!rows.length)host.textContent='该资料尚未被画布引用。';
  }
  function shortest(canvas,from,to,type='all',direction='out'){
    const queue=[[from]],seen=new Set([from]);while(queue.length){const route=queue.shift(),id=route.at(-1);if(id===to)return route;
      for(const link of canvas.links||[]){if(type!=='all'&&link.relationType!==type)continue;let other;
        if(link.aId===id&&(direction!=='in'||!link.directional))other=link.bId;
        if(link.bId===id&&(direction!=='out'||!link.directional))other=link.aId;
        if(other!==undefined&&!seen.has(other)){seen.add(other);queue.push([...route,other]);}
      }
      if(type==='all'){const it=canvas.items.find(i=>i.id===id);if(it){if(it.parentId!=null&&!seen.has(it.parentId)){seen.add(it.parentId);queue.push([...route,it.parentId]);}for(const ch of it.children||[]){if(!seen.has(ch)){seen.add(ch);queue.push([...route,ch]);}}}}
    }return [];}
  function showRelations(){
    const canvas=curCanvas(),project=curProject();
    const option=canvas.items.filter(i=>i.type!=='stroke').map(i=>'<option value="'+escapeHtml(String(i.id))+'">'+escapeHtml((i.text||state.files.find(f=>f.id===i.fileId)?.name||i.type).slice(0,70))+'</option>').join('');
    showModal('关系分析与阅读路径','<div class="rel-panel"><div class="rel-filters"><label class="rel-field">关系类型 <select id="l1RelType"><option value="all">全部</option>'+Object.entries(RELATION_TYPES).map(([id,v])=>'<option value="'+id+'">'+escapeHtml(v.label)+'</option>').join('')+'</select></label><label class="rel-field">方向 <select id="l1RelDirection"><option value="out">沿出向</option><option value="in">沿入向</option><option value="both">忽略方向</option></select></label></div><div class="rel-path"><span>从</span><select id="l1RelFrom">'+option+'</select><span>到</span><select id="l1RelTo">'+option+'</select></div><div class="rel-actions"><button id="l1FindPath" class="modal-btn secondary">查找最短关系路径</button><button id="l1SavePath" class="modal-btn secondary">保存为阅读路径</button></div><div id="l1RelList" class="rel-list"></div><div class="rel-actions"><button id="l1ResolveJumps" class="modal-btn secondary">重新关联外部跃迁</button></div><h4 class="rel-section-title">已保存的阅读路径</h4><div id="l1Routes" class="rel-list"></div></div>',[{label:'关闭'}]);
    modal.querySelector('#l1ResolveJumps').onclick=()=>resolveJumps(project);
    let route=[];const list=modal.querySelector('#l1RelList'),filter=modal.querySelector('#l1RelType');
    const item=id=>canvas.items.find(i=>String(i.id)===String(id));
    function relations(){list.innerHTML='';for(const l of canvas.links||[]){if(filter.value!=='all'&&l.relationType!==filter.value)continue;const b=document.createElement('button');b.className='k6-list-row';b.textContent=(item(l.aId)?.text||l.aId)+(l.directional?' → ':' ↔ ')+(item(l.bId)?.text||l.bId)+' · '+(RELATION_TYPES[l.relationType]?.label||l.relationType)+' · '+(l.annotation||'');b.onclick=()=>{hideModal();L1Search.locate({projectId:project.id,canvasId:canvas.id,itemId:l.aId,linkId:l.id});};list.append(b);}}
    filter.onchange=relations;relations();
    modal.querySelector('#l1FindPath').onclick=()=>{const from=item(modal.querySelector('#l1RelFrom').value),to=item(modal.querySelector('#l1RelTo').value);if(!from||!to)return;route=shortest(canvas,from.id,to.id,filter.value,modal.querySelector('#l1RelDirection').value);list.textContent=route.length?route.map(id=>item(id)?.text||id).join(' → '):'所选方向和关系类型下没有可达路径';};
    function routes(){const host=modal.querySelector('#l1Routes');host.innerHTML='';for(const r of project.readingPaths||[]){const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:4px';const b=document.createElement('button');b.className='k6-list-row';b.style.flex='1';b.textContent=r.name+' · '+r.steps.length+' 步';b.onclick=()=>play(r,0,project.id);const del=document.createElement('button');del.className='k6-list-row';del.textContent='×';del.title='删除此阅读路径';del.style.cssText='flex:none;width:28px;padding:0;font-size:16px;color:var(--ink-faint)';del.onclick=async()=>{const i=project.readingPaths.indexOf(r);if(i>=0){project.readingPaths.splice(i,1);if(await saveState())toast('已删除');routes();}};row.append(b,del);host.append(row);}}
    modal.querySelector('#l1SavePath').onclick=async()=>{if(!route.length){toast('请先查找一条路径');return;}(project.readingPaths||=[]).push({id:crypto.randomUUID(),name:route.map(id=>item(id)?.text||id).join(' → ').slice(0,100),steps:route.map(itemId=>({canvasId:canvas.id,itemId}))});if(await saveState()){toast('阅读路径已保存');routes();}};routes();
  }
  function play(route,index,projectId){const step=route.steps[index];if(!step)return;
    if(step.unresolved){toast('该步骤的画布不在当前导入范围，请重新关联');return;}
    hideModal();L1Search.locate({projectId,...step});
    const previous=document.getElementById('l1Reading');previous?.remove();
    const bar=document.createElement('div');bar.id='l1Reading';bar.className='k6-progress';bar.style.bottom='72px';
    const title=document.createElement('span');title.textContent=route.name+' · '+(index+1)+' / '+route.steps.length;bar.append(title);
    for(const [label,delta]of [['上一步',-1],['下一步',1]]){const b=document.createElement('button');b.textContent=label;b.disabled=index+delta<0||index+delta>=route.steps.length;b.onclick=()=>play(route,index+delta,projectId);bar.append(b);}const close=document.createElement('button');close.textContent='结束阅读';close.onclick=()=>bar.remove();bar.append(close);document.body.append(bar);
  }
  function resolveJumps(project){
    const unresolved=project.canvases.flatMap(c=>c.items.filter(i=>i.externalJump).map(item=>({canvas:c,item})));
    showModal('重新关联外部跃迁','<p>选择当前已有的目标画布；原目标信息会保留到关联成功。</p><div id="l1JumpList"></div>',[{label:'关闭'}]);
    const host=modal.querySelector('#l1JumpList'),targets=state.projects.flatMap(p=>p.canvases.map(c=>({p,c})));
    if(!unresolved.length)host.textContent='没有待关联的外部跃迁。';
    for(const {canvas,item}of unresolved){const row=document.createElement('div'),text=document.createElement('p'),select=document.createElement('select'),button=document.createElement('button');
      text.textContent=canvas.name+' / '+(item.text||item.id)+' → '+(item.externalJump.canvasName||item.externalJump.canvasId);const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='请选择目标';select.append(placeholder);
      targets.forEach(({p,c},n)=>{const option=document.createElement('option');option.value=n;option.textContent=p.name+' / '+c.name;select.append(option);});button.textContent='关联';
      button.onclick=async()=>{if(select.value==='')return;const {p,c}=targets[Number(select.value)],before=PackageModel.clone(item);item.jumpTo={projectId:p.id,canvasId:c.id,itemId:c.items.some(i=>i.id===item.externalJump.itemId)?item.externalJump.itemId:null};delete item.externalJump;if(await saveState()){row.remove();toast('跃迁已关联');}else{Object.assign(item,before);item.jumpTo=before.jumpTo||null;}};
      row.append(text,select,button);host.append(row);
    }
  }
  function exportImpact(project,canvasId){const packed=PackageModel.encode(project,canvasId);return packed.canvases.flatMap(c=>c.items.filter(i=>i.externalJump).map(i=>({canvas:c.name,item:i.text||i.id,target:i.externalJump})));}
  return {usages,showUsages,shortest,showRelations,play,exportImpact};
})();
const l1RemoveFile=removeFile;
removeFile=function(id){const rows=L1Research.usages(id);showModal('删除资料','<p>此操作影响 '+rows.length+' 处引用。摘录正文保留，来源标记为缺失。删除前会创建恢复点。</p>',[{label:'取消'},{label:'删除',primary:true,onClick:async()=>{if(!await queueRecovery('删除资料'))return false;l1RemoveFile(id);return await saveState();}}]);};
