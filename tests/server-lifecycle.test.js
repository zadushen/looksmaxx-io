import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import WebSocket from 'ws';

test('server shutdown informs clients and a restart creates a clean healthy arena',{timeout:10000},async t=>{
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const children=[],sockets=[];t.after(()=>{sockets.forEach(s=>s.terminate());children.forEach(c=>c.kill());});
 async function server(){const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});children.push(child);await once(child.stdout,'data');return child;}
 async function client(){const socket=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(socket);const queue=[],waiters=[];socket.on('message',raw=>{const m=JSON.parse(raw),i=waiters.findIndex(w=>w.type===m.type);if(i<0)queue.push(m);else waiters.splice(i,1)[0].resolve(m);});await once(socket,'open');return{socket,receive(type){const i=queue.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise(resolve=>waiters.push({type,resolve}));}};}
 const child=await server(),owner=await client();owner.socket.send(JSON.stringify({type:'create-room'}));const room=await owner.receive('room');await owner.receive('world');
 const closed=once(owner.socket,'close'),exited=once(child,'exit');child.kill('SIGTERM');assert.equal((await closed)[0],1012);assert.equal((await exited)[0],0);
 await server();assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status,200);
 const next=await client();next.socket.send(JSON.stringify({type:'join-room',code:room.code}));assert.equal((await next.receive('room-error')).type,'room-error');
 next.socket.send(JSON.stringify({type:'join-room',code:''}));await next.receive('room');assert.equal((await next.receive('world')).players.length,1);
 await Promise.all(Array.from({length:63},async()=>{const peer=await client();peer.socket.send(JSON.stringify({type:'join-room',code:''}));await peer.receive('room');}));
 const extra=await client();extra.socket.send(JSON.stringify({type:'join-room',code:''}));assert.match((await extra.receive('room-error')).message,/заполнен/);

});
