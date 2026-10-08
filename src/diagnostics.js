const percentile=(values,p)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)]||0;};
export class Diagnostics {
  constructor(){this.frames=[];this.renders=[];this.gaps=[];this.lastFrame=null;this.lastSnapshot=null;this.lastDisplay=0;this.rtt=null;this.panel=document.createElement('pre');this.panel.id='performance-diagnostics';this.panel.style.cssText='position:fixed;left:12px;bottom:76px;z-index:30;margin:0;padding:8px;background:#101722ee;color:#fff;font:12px monospace;pointer-events:none';document.body.appendChild(this.panel);}
  reset(){this.frames=[];this.renders=[];this.lastFrame=null;}
  snapshot(now){if(this.lastSnapshot!==null)this.push(this.gaps,now-this.lastSnapshot);this.lastSnapshot=now;}
  push(list,value){list.push(value);if(list.length>600)list.shift();}
  frame(now,renderMs){if(this.lastFrame!==null)this.push(this.frames,now-this.lastFrame);this.lastFrame=now;this.push(this.renders,renderMs);if(now-this.lastDisplay<1000)return;this.lastDisplay=now;const average=this.frames.reduce((a,b)=>a+b,0)/this.frames.length;this.panel.textContent=`FPS ${average?(1000/average).toFixed(1):'—'} | frame p95 ${percentile(this.frames,.95).toFixed(1)} ms\nrender p95 ${percentile(this.renders,.95).toFixed(1)} ms | stalls >100ms ${this.frames.filter(v=>v>100).length}\nWSS gap p95 ${percentile(this.gaps,.95).toFixed(1)} ms | RTT ${this.rtt===null?'—':this.rtt.toFixed(0)+' ms'}`;}
}
