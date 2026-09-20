"use strict";
/* K9: bounded, opt-in sampling. Disabled mode owns no animation loop or observer. */
const ZhijianPerf=(()=>{
  const frames=[],gaps=[],tasks=[],LIMIT=600;let enabled=false,raf=0,last=0,observer=null;
  function append(a,v){a.push(v);if(a.length>LIMIT)a.shift();}
  const stats=a=>{const s=[...a].sort((x,y)=>x-y),q=p=>s.length?+s[Math.min(s.length-1,Math.ceil(s.length*p)-1)].toFixed(2):0;return {samples:s.length,p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),over33ms:s.filter(x=>x>33.3).length,over50ms:s.filter(x=>x>50).length};};
  function tick(t){if(!enabled)return;if(last)append(gaps,t-last);last=t;raf=requestAnimationFrame(tick);}
  function enable(v=true){
    v=!!v;if(v===enabled)return enabled;enabled=v;
    if(v){last=0;raf=requestAnimationFrame(tick);if(typeof PerformanceObserver!=="undefined"&&PerformanceObserver.supportedEntryTypes?.includes("longtask")){observer=new PerformanceObserver(list=>{for(const e of list.getEntries())append(tasks,{name:"longtask",ms:e.duration});});observer.observe({type:"longtask"});}}
    else{cancelAnimationFrame(raf);raf=0;last=0;observer?.disconnect();observer=null;}return enabled;
  }
  function beginFrame(){return enabled?{start:performance.now(),marks:{}}:null;}
  function mark(frame,name){if(frame)frame.marks[name]=performance.now();}
  function endFrame(frame,meta){if(!frame)return;const end=performance.now(),m=frame.marks;append(frames,{total:end-frame.start,prepare:(m.prepare||frame.start)-frame.start,relations:(m.relations||end)-(m.prepare||frame.start),canvas:(m.canvas||end)-(m.relations||frame.start),dom:end-(m.canvas||end),...meta});}
  function measure(name,fn){if(!enabled)return fn();const t=performance.now();try{return fn();}finally{append(tasks,{name,ms:performance.now()-t});}}
  function snapshot(){const total=stats(frames.map(f=>f.total));return {frames:frames.length,...total,stages:Object.fromEntries(["prepare","relations","canvas","dom"].map(k=>[k,stats(frames.map(f=>f[k]))])),frameGaps:stats(gaps),tasks:Object.fromEntries([...new Set(tasks.map(t=>t.name))].map(k=>[k,stats(tasks.filter(t=>t.name===k).map(t=>t.ms))])),last:frames.at(-1)||null};}
  return Object.freeze({enable,clear(){frames.length=0;gaps.length=0;tasks.length=0;last=0;},beginFrame,mark,endFrame,measure,snapshot,isEnabled:()=>enabled});
})();
window.ZhijianPerf=ZhijianPerf;

/* Read on demand: renderer timings and main-process timings have separate origins. */
const startupMarks=[{name:"scripts-ready",ms:performance.now()}];
window.ZhijianStartup=Object.freeze({
  mark(name){if(!startupMarks.some(m=>m.name===name))startupMarks.push({name,ms:performance.now()});},
  async snapshot(){return {renderer:[...performance.getEntriesByType("paint").map(p=>({name:p.name,ms:p.startTime})),...startupMarks],main:await window.electronAPI?.getStartupTimings?.().catch(()=>null)||null};}
});
