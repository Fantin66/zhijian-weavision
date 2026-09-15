"use strict";
/* K7 性能观测：默认关闭；用于同机、同数据下记录画布帧耗时，不影响正常使用。 */
const ZhijianPerf=(()=>{
  const frames=[],LIMIT=240;let enabled=false;
  const percentile=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),i=Math.min(s.length-1,Math.ceil(s.length*p)-1);return +s[i].toFixed(2);};
  function beginFrame(){return enabled?{start:performance.now(),marks:{}}:null;}
  function mark(frame,name){if(frame)frame.marks[name]=performance.now();}
  function endFrame(frame,meta){
    if(!frame)return;
    const end=performance.now(),m=frame.marks;
    frames.push({total:end-frame.start,relations:(m.relations||end)-frame.start,canvas:(m.canvas||end)-frame.start,dom:end-(m.canvas||end),items:meta.items,links:meta.links,visible:meta.visible});
    if(frames.length>LIMIT)frames.shift();
  }
  function snapshot(){
    const totals=frames.map(f=>f.total),long33=totals.filter(x=>x>33.3).length,long50=totals.filter(x=>x>50).length;
    return {frames:frames.length,p50:percentile(totals,.5),p95:percentile(totals,.95),p99:percentile(totals,.99),over33ms:long33,over50ms:long50,last:frames.at(-1)||null};
  }
  return Object.freeze({enable(v=true){enabled=!!v;return enabled;},clear(){frames.length=0;},beginFrame,mark,endFrame,snapshot,isEnabled:()=>enabled});
})();
window.ZhijianPerf=ZhijianPerf;
