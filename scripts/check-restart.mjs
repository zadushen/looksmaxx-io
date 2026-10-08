import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile,mkdir} from 'node:fs/promises';
import WebSocket from 'ws';
const origin=new URL(process.argv[2]||'');assert.equal(origin.protocol,'https:');const wsUrl=new URL(origin);wsUrl.protocol='wss:';
const sockets=new Set();
async function client(){const socket=new WebSocket(wsUrl,{handshakeTimeout:15000});sockets.add(socket);socket.on('error',()=>{});const queue=[],waiters=[];socket.on('message',raw=>{const m=JSON.parse(raw),index=waiters.findIndex(w=>w.type===m.type);if(index<0){queue.push(m);if(queue.length>20)queue.shift();}else{const w=waiters.splice(index,1)[0];clearTimeout(w.timer);w.resolve(m);}});await once(socket,'open');return{socket,receive(type){const index=queue.findIndex(m=>m.type===type);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const w={type,resolve};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Response timed out'));},15000);waiters.push(w);});}};}
const report={url:origin.href,checkedAt:new Date().toISOString(),passed:false};
try{
 const before=await client();before.socket.send(JSON.stringify({type:'create-room'}));const room=await before.receive('room');await before.receive('world');console.log('READY: waiting for the authorized Render restart');
 const closed=await Promise.race([once(before.socket,'close'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('No restart observed within five minutes')),300000);timer.unref();})]);report.closeCode=closed[0];
 for(let i=0;i<30;i++){try{const response=await fetch(new URL('/healthz',origin),{signal:AbortSignal.timeout(5000)});if(response.ok){report.healthAfterRestart=200;break;}}catch{}await new Promise(r=>setTimeout(r,2000));}
 const after=await client();after.socket.send(JSON.stringify({type:'join-room',code:room.code}));assert.equal((await after.receive('room-error')).type,'room-error');report.oldRoomRemoved=true;
 after.socket.send(JSON.stringify({type:'join-room',code:''}));await after.receive('room');await after.receive('world');report.freshConnectionWorks=true;report.passed=report.healthAfterRestart===200;
}catch(error){report.error=error.message;process.exitCode=1;}finally{for(const socket of sockets)socket.terminate();await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/restart-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
