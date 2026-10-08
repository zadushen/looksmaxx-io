import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile,mkdir} from 'node:fs/promises';
import WebSocket from 'ws';
const origin=new URL(process.argv[2]||'');assert.equal(origin.protocol,'https:');const url=new URL(origin);url.protocol='wss:';
const groups=(process.env.LOAD_GROUPS||'public:3,private:3').split(',').map(s=>{const [kind,count]=s.split(':');return{kind,count:Number(count)};});
const duration=Math.max(10,Math.min(120,Number(process.env.LOAD_SECONDS)||60));
const peers=[],timers=[];const report={url:origin.href,checkedAt:new Date().toISOString(),seconds:duration,groups,passed:false};
async function connect(){const socket=new WebSocket(url,{handshakeTimeout:15000});socket.on('error',()=>{});const queue=[],waiters=[],metric={packets:0,gaps:[],last:0,firstTime:null,lastTime:0};
 socket.on('message',raw=>{const message=JSON.parse(raw);if(message.type==='world'){const now=performance.now();if(metric.last)metric.gaps.push(now-metric.last);metric.last=now;metric.firstTime??=message.time;metric.lastTime=message.time;metric.packets++;}const index=waiters.findIndex(w=>w.predicate(message));if(index<0){queue.push(message);if(queue.length>20)queue.shift();}else{const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(message);}});
 const receive=predicate=>new Promise((resolve,reject)=>{const i=queue.findIndex(predicate);if(i>=0)return resolve(queue.splice(i,1)[0]);const w={predicate,resolve};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Response timed out'));},15000);waiters.push(w);});
 const peer={socket,metric,receive,send(m){socket.send(JSON.stringify(m));}};peers.push(peer);await once(socket,'open');const welcome=await receive(m=>m.type==='welcome');peer.id=welcome.id;return peer;}
try{
 let index=0;
 for(const group of groups){assert.ok(['public','private'].includes(group.kind));assert.ok(Number.isInteger(group.count)&&group.count>0&&group.count<=12);let code;
  for(let i=0;i<group.count;i++){
   const peer=await connect();peer.send(group.kind==='public'?{type:'join-room',code:''}:i===0?{type:'create-room'}:{type:'join-room',code});const room=await peer.receive(m=>m.type==='room'||m.type==='room-error');assert.equal(room.type,'room',room.message);code=room.code;await peer.receive(m=>m.type==='world'&&m.players.some(p=>p.id===peer.id));
   const phase=index++;timers.push(setInterval(()=>peer.socket.readyState===1&&peer.send({type:'input',name:`Multi ${phase}`,x:Math.sin(performance.now()/1000+phase),y:Math.cos(performance.now()/1000+phase)}),50));
  }
 }
 for(const peer of peers)peer.metric.gaps.length=0;
 const starts=peers.map(p=>({packets:p.metric.packets,time:p.metric.lastTime,bytes:p.socket._socket.bytesRead}));
 await new Promise(r=>setTimeout(r,duration*1000));
 report.clients=peers.map((peer,i)=>{const m=peer.metric,gaps=m.gaps.sort((a,b)=>a-b);return{packets:m.packets-starts[i].packets,p95GapMs:Math.round(gaps[Math.floor(gaps.length*.95)]),simulationRate:+((m.lastTime-starts[i].time)/duration).toFixed(2),open:peer.socket.readyState===1,wireKBPerSecond:Math.round((peer.socket._socket.bytesRead-starts[i].bytes)/duration/1000)};});
 report.passed=report.clients.every(c=>c.open&&c.packets>=duration*7&&c.p95GapMs<200&&c.simulationRate>=.9);if(!report.passed)process.exitCode=1;
}catch(error){report.error=error.message;process.exitCode=1;}finally{timers.forEach(clearInterval);peers.forEach(p=>p.socket.terminate());await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/multiroom-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
