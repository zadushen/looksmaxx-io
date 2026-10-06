import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {writeFileSync} from 'node:fs';
import WebSocket, {WebSocketServer} from 'ws';
const loadSeconds=Math.max(5,Number(process.env.LOAD_SECONDS)||20);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
const sockets=[],report={scope:'Local real WebSockets; not a public internet or physical phone test',scenarios:[]};
try {
 await once(child.stdout,'data');
 for(const count of (process.env.LOAD_PLAYERS?process.env.LOAD_PLAYERS.split(',').map(Number):[12,32,64])){
  const records=[];
  await Promise.all(Array.from({length:count},async(_,i)=>{
   const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);
   const r={socket:ws,packets:0,bytes:0,gaps:[],last:0};records.push(r);
   ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='world'){const now=performance.now();if(r.last)r.gaps.push(now-r.last);r.last=now;r.packets++;r.bytes+=raw.length;}});
   await once(ws,'open');r.startWireBytes=ws._socket.bytesRead;ws.send(JSON.stringify({type:'join-room',code:''}));
   r.timer=setInterval(()=>ws.readyState===1&&ws.send(JSON.stringify({type:'input',name:`Load ${i}`,x:Math.sin(performance.now()/1000+i),y:Math.cos(performance.now()/1000+i)})),33);
  }));
  const started=performance.now();await delay(loadSeconds*1000);const duration=(performance.now()-started)/1000;
  const gaps=records.flatMap(r=>r.gaps).sort((a,b)=>a-b);
  report.scenarios.push({players:count,durationSeconds:+duration.toFixed(2),minSnapshots:Math.min(...records.map(r=>r.packets)),p95SnapshotGapMs:+gaps[Math.floor(gaps.length*.95)].toFixed(1),maxSnapshotGapMs:+Math.max(...gaps).toFixed(1),wireMBPerSecond:+(records.reduce((sum,r)=>sum+r.socket._socket.bytesRead-r.startWireBytes,0)/duration/1e6).toFixed(2),outboundMBPerSecond:+(records.reduce((sum,r)=>sum+r.bytes,0)/duration/1e6).toFixed(2)});
  console.log(JSON.stringify(report.scenarios.at(-1)));
  for(const r of records)clearInterval(r.timer);
  for(const ws of sockets.splice(0))ws.terminate();await delay(200);
 }
 const proxy=new WebSocketServer({port:0,host:'127.0.0.1'});await once(proxy,'listening');
 const timers=new Set();const later=fn=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},150);timers.add(timer);};
 proxy.on('connection',front=>{
  const back=new WebSocket(`ws://127.0.0.1:${port}`);const queue=[];
  front.on('message',raw=>{const send=()=>later(()=>back.readyState===1&&back.send(raw.toString()));if(back.readyState===1)send();else queue.push(send);});
  back.on('open',()=>queue.splice(0).forEach(send=>send()));
  back.on('message',raw=>later(()=>front.readyState===1&&front.send(raw.toString())));
  front.on('close',()=>back.terminate());back.on('error',()=>front.terminate());
 });
 const slow=new WebSocket(`ws://127.0.0.1:${proxy.address().port}`);sockets.push(slow);await once(slow,'open');
 const started=performance.now();
 const echo=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Delayed input timed out')),5000);slow.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='world'&&m.players.some(p=>p.name==='Delayed player')){clearTimeout(timeout);resolve(performance.now()-started);}});});
 slow.send(JSON.stringify({type:'join-room',code:''}));slow.send(JSON.stringify({type:'input',name:'Delayed player',x:1,y:0}));
 report.simulatedLatency={oneWayDelayMs:150,inputVisibleMs:Math.round(await echo),passed:true};
 slow.terminate();await delay(200);for(const timer of timers)clearTimeout(timer);await new Promise(r=>proxy.close(r));
 report.httpExposure={};
 for(const path of ['/server.js','/package.json','/.env.example','/artifacts/arena-audit.json'])report.httpExposure[path]=(await fetch(`http://127.0.0.1:${port}${path}`)).status;
 writeFileSync(new URL('../artifacts/network-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{for(const ws of sockets)ws.terminate();child.kill();}
