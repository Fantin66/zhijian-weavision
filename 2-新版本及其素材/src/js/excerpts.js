"use strict";
/* Only a selection made in this window can create an attachment excerpt. */
const EXCERPT_DRAG_TYPE="application/x-zhijian-excerpt";
let excerptDrag=null,excerptDropHint=null;
function excerptContentRoot(container){return container.querySelector(".pv-md-wrap,pre.pv-text,.pv-docx-stage")||container;}
function excerptTextMap(root){
  const nodes=[];let text="";const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
    if(node.parentElement?.closest("style,script,button,.pv-loading"))continue;
    nodes.push({node,start:text.length});text+=node.textContent;
  }
  return {text,nodes};
}
function excerptOffset(root,container,offset){
  const range=document.createRange();range.selectNodeContents(root);range.setEnd(container,offset);
  return excerptTextMap(range.cloneContents()).text.length;
}
function resolveExcerptOffset(text,quote,anchor){
  if(!quote)return -1;
  const matches=index=>(!anchor?.prefix||text.slice(Math.max(0,index-anchor.prefix.length),index)===anchor.prefix)&&(!anchor?.suffix||text.slice(index+quote.length,index+quote.length+anchor.suffix.length)===anchor.suffix);
  if(Number.isInteger(anchor?.start)&&text.slice(anchor.start,anchor.start+quote.length)===quote&&matches(anchor.start))return anchor.start;
  const found=[];let from=0,index;
  while((index=text.indexOf(quote,from))!==-1){found.push(index);from=index+Math.max(1,quote.length);}
  if(found.length===1)return found[0];
  const contextual=found.filter(matches);return contextual.length===1?contextual[0]:-1;
}
function highlightExcerptSource(container,quote,anchor){
  const root=excerptContentRoot(container),{text,nodes}=excerptTextMap(root);
  const start=resolveExcerptOffset(text,quote,anchor);
  if(start<0){toast("已打开来源；原文已变化或有多处匹配，无法准确定位");return false;}
  const end=start+quote.length;let first=null;
  for(let i=nodes.length-1;i>=0;i--){
    const {node,start:offset}=nodes[i],a=Math.max(0,start-offset),b=Math.min(node.length,end-offset);
    if(a>=b)continue;
    const range=document.createRange();range.setStart(node,a);range.setEnd(node,b);
    const mark=document.createElement("mark");mark.className="k6-source-highlight";range.surroundContents(mark);first=mark;
  }
  first?.scrollIntoView({block:"center"});return true;
}
function clearExcerptDrag(){excerptDrag=null;excerptDropHint?.remove();excerptDropHint=null;}
document.addEventListener("dragstart",e=>{
  clearExcerptDrag();
  const selection=window.getSelection();if(!e.dataTransfer||!selection||selection.isCollapsed||!selection.rangeCount)return;
  const range=selection.getRangeAt(0),element=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
  const host=element?.closest("[data-source-file-id]");if(!host||!host.contains(e.target)||!host.contains(range.endContainer))return;
  if(element.closest("textarea,input,[contenteditable=true]"))return;
  const file=state.files.find(f=>f.id===host.dataset.sourceFileId);if(!file||!["text","code","doc"].includes(file.kind))return;
  const root=excerptContentRoot(host);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return;
  const {text}=excerptTextMap(root),start=excerptOffset(root,range.startContainer,range.startOffset),end=excerptOffset(root,range.endContainer,range.endOffset),quote=text.slice(start,end);
  if(!quote.trim())return;
  if(quote.length>100000){e.preventDefault();toast("这段文字过长，请分段摘录");return;}
  excerptDrag={projectId:state.activeProjectId,canvasId:state.activeCanvasId,text:selection.toString(),ref:{fileId:file.id,name:file.name,quote,anchor:{start,end,prefix:text.slice(Math.max(0,start-64),start),suffix:text.slice(end,end+64)}}};
  e.dataTransfer.setData(EXCERPT_DRAG_TYPE,"selection");e.dataTransfer.setData("text/plain",excerptDrag.text);e.dataTransfer.effectAllowed="copy";
},true);
function excerptBoardDrop(e){
  return excerptDrag&&Array.from(e.dataTransfer?.types||[]).includes(EXCERPT_DRAG_TYPE)&&board.contains(e.target)&&!e.target.closest?.(".pv-morph,.pv-win,#noteEditor,#notePreview,#dockBar,#detailReadLayer");
}
document.addEventListener("dragover",e=>{
  if(!excerptDrag)return;
  dropOverlay.style.display="none";
  if(!excerptBoardDrop(e)){excerptDropHint?.remove();excerptDropHint=null;e.preventDefault();e.stopImmediatePropagation();e.dataTransfer.dropEffect="none";return;}
  e.preventDefault();e.stopImmediatePropagation();e.dataTransfer.dropEffect="copy";
  if(!excerptDropHint){excerptDropHint=document.createElement("div");excerptDropHint.className="excerpt-drop-hint";excerptDropHint.textContent="松开创建摘录便签 · 保留原文来源";document.body.appendChild(excerptDropHint);}
  excerptDropHint.style.left=Math.max(8,Math.min(e.clientX+14,window.innerWidth-300))+"px";excerptDropHint.style.top=Math.max(8,Math.min(e.clientY+14,window.innerHeight-45))+"px";
},true);
document.addEventListener("drop",e=>{
  if(!excerptDrag)return;
  if(!excerptBoardDrop(e)){e.preventDefault();e.stopImmediatePropagation();clearExcerptDrag();return;}
  e.preventDefault();e.stopImmediatePropagation();dropOverlay.style.display="none";
  const data=excerptDrag;clearExcerptDrag();
  if(data.projectId!==state.activeProjectId||data.canvasId!==state.activeCanvasId||!state.files.some(f=>f.id===data.ref.fileId)){toast("画布或附件已变化，请重新选择文字");return;}
  const xy=boardXY(e.clientX,e.clientY),point=s2w(xy.x,xy.y);
  pushHistory("拖入附件摘录");const note=addNote(point.x,point.y,data.text,state.noteColor);
  note.x=Math.round(point.x);note.y=Math.round(point.y);note.w=260;note.h=160;note.sourceRef=data.ref;
  state.selected=note.id;state.multiSel=[];window.getSelection()?.removeAllRanges();render();saveStateDebounced();
  toast("已创建摘录便签；选中后点击「查看来源」返回原文");
},true);
document.addEventListener("dragend",clearExcerptDrag,true);
window.addEventListener("blur",clearExcerptDrag);
