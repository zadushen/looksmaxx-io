import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import WebSocket from 'ws';
const origin=new URL(process.argv[2]||'');
assert.equal(origin.protocol,'https:','Provide the deployed HTTPS origin');
origin.pathname='/';origin.search='';origin.hash='';
const wsOrigin=new URL(origin);wsOrigin.protocol='wss:';
const report={url:origin.href,checkedAt:new Date().toISOString(),checks:[],load:[],limitations:['Physical phone, two independent devices and human balance require separate verification; restart is recorded in restart-audit.json.']};
const loadPublic=process.env.LOAD_ROOM==='public';
const sockets=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function client(){
 const socket=new WebSocket(wsOrigin,{handshakeTimeout:15000});sockets.add(socket);const queue=[],waiters=[];
 socket.on('error',()=>{});
 socket.on('message',raw=>{const message=JSON.parse(raw);const index=waiters.findIndex(w=>w.predicate(message));if(index>=0){const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(message);}else{queue.push(message);if(queue.length>50)queue.shift();}});
 socket.on('close',()=>{sockets.delete(socket);for(const w of waiters.splice(0)){clearTimeout(w.timer);w.reject(Error('Connection closed'));}});
 const receive=predicate=>new Promise((resolve,reject)=>{const index=queue.findIndex(predicate);if(index>=0)return resolve(queue.splice(index,1)[0]);const waiter={predicate,resolve,reject};waiter.timer=setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);reject(Error('Server response timed out'));},15000);waiters.push(waiter);});
 await once(socket,'open');const welcome=await receive(m=>m.type==='welcome');
 return{socket,receive,id:welcome.id,send(message){socket.send(JSON.stringify(message));}};
}
try{
 for(const path of ['/','/healthz','/styles.css','/src/main.js','/src/game.js','/src/network.js']){const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(90000)});assert.equal(response.status,200,path);report.checks.push({path,status:response.status});}
 for(const name of ['avatar-evolution-v2','hammer-avatar','foidka-avatar','makeupcelka-avatar','stacey-avatar']){
  const path=`public/assets/${name}.png`;const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const local=await readFile(new URL(`../${path}`,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(local).digest('hex'));
  report.checks.push({path,verified:'Matches local PNG'});
 }
 const a=await client(),b=await client();a.send({type:'create-room'});const room=await a.receive(m=>m.type==='room');b.send({type:'join-room',code:room.code});await b.receive(m=>m.type==='room');
 const world=await b.receive(m=>m.type==='world'&&m.players.some(p=>p.id===a.id)&&m.players.some(p=>p.id===b.id));
 const before=world.players.find(p=>p.id===a.id);a.send({type:'input',name:'Release check',x:before.x<2500?1:-1,y:0});
 await b.receive(m=>m.type==='world'&&m.players.some(p=>p.id===a.id&&p.name==='Release check'&&Math.abs(p.x-before.x)>1));
 report.checks.push({test:'Private room and authoritative movement over WSS',passed:true});
 a.socket.terminate();await b.receive(m=>m.type==='world'&&!m.players.some(p=>p.id===a.id));
 const replacement=await client();replacement.send({type:'join-room',code:room.code});await replacement.receive(m=>m.type==='room');await b.receive(m=>m.type==='world'&&m.players.some(p=>p.id===replacement.id));
 report.checks.push({test:'Abrupt disconnect and fresh reconnect into existing room',passed:true});
 b.socket.terminate();replacement.socket.terminate();await sleep(500);
 // Progressively load a disposable private room; stop at the first failed stage.
 const stages=(process.env.LOAD_PLAYERS||'1,2,4,6').split(',').map(Number);
 const duration=Math.max(5,Math.min(120,Number(process.env.LOAD_SECONDS)||20));
 for(const count of stages){
  assert.ok(Number.isInteger(count)&&count>=1&&count<=12,'Private load stage must be 1..12');
  const peers=[],metrics=[];let code;
  for(let i=0;i<count;i++){
   const peer=await client();peers.push(peer);peer.send(loadPublic?{type:'join-room',code:''}:i===0?{type:'create-room'}:{type:'join-room',code});const joined=await peer.receive(m=>m.type==='room'||m.type==='room-error');assert.equal(joined.type,'room');code=joined.code;
   const metric={packets:0,gaps:[],last:0,firstWorldTime:null,lastWorldTime:0,startBytes:peer.socket._socket.bytesRead};metrics.push(metric);
   peer.socket.on('message',raw=>{const world=JSON.parse(raw);if(world.type!=='world')return;metric.firstWorldTime??=world.time;metric.lastWorldTime=world.time;const now=performance.now();if(metric.last)metric.gaps.push(now-metric.last);metric.last=now;metric.packets++;});
   metric.timer=setInterval(()=>peer.socket.readyState===1&&peer.send({type:'input',name:`Audit ${i}`,x:Math.sin(performance.now()/1000+i),y:Math.cos(performance.now()/1000+i)}),50);
  }
  try{
   await sleep(duration*1000);
   const gaps=metrics.flatMap(m=>m.gaps).sort((a,b)=>a-b);assert.ok(gaps.length>0);
   const result={arena:loadPublic?'public':'private',players:count,seconds:duration,minSnapshots:Math.min(...metrics.map(m=>m.packets)),p95GapMs:Math.round(gaps[Math.floor(gaps.length*.95)]),maxGapMs:Math.round(gaps.at(-1)),wireKBPerSecond:Math.round(metrics.reduce((sum,m,i)=>sum+peers[i].socket._socket.bytesRead-m.startBytes,0)/duration/1000),simulationRate:+Math.min(...metrics.map(m=>(m.lastWorldTime-m.firstWorldTime)/duration)).toFixed(2),connectionsOpen:peers.every(p=>p.socket.readyState===1)};
   result.passed=result.connectionsOpen&&result.minSnapshots>=duration*7&&result.p95GapMs<200&&result.simulationRate>=.9;report.load.push(result);console.log(JSON.stringify(result));if(!result.passed)break;
  }finally{metrics.forEach(m=>clearInterval(m.timer));peers.forEach(p=>p.socket.terminate());await sleep(500);}
 }
 const pub=await client();pub.send({type:'join-room',code:''});const publicRoom=await pub.receive(m=>m.type==='room');await pub.receive(m=>m.type==='world'&&m.players.some(p=>p.id===pub.id));report.checks.push({test:'Public arena',passed:true,configuredLimit:publicRoom.limit});
 report.passed=report.load.length>0&&report.load.every(stage=>stage.passed);if(!report.passed)process.exitCode=1;
} catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
finally{
 for(const socket of sockets)socket.terminate();await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL(loadPublic?'../artifacts/online-public-audit.json':'../artifacts/online-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
