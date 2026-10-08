import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import WebSocket from 'ws';

test('configured shared capacity rejects excess connections and allows replacing a solo private room',{timeout:10000},async t=>{
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),PUBLIC_LIMIT:'6',ROOM_LIMIT:'6',CONNECTION_LIMIT:'6',MAX_ROOMS:'2'},stdio:['ignore','pipe','pipe']});const sockets=[];t.after(()=>{sockets.forEach(s=>s.terminate());child.kill();});await once(child.stdout,'data');
 async function client(){const socket=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(socket);const queue=[],waiters=[];socket.on('message',raw=>{const message=JSON.parse(raw),i=waiters.findIndex(w=>w.type===message.type);if(i<0){queue.push(message);if(queue.length>30)queue.shift();}else{const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(message);}});await once(socket,'open');return{socket,send(m){socket.send(JSON.stringify(m));},receive(type){const i=queue.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={type,resolve};w.timer=setTimeout(()=>reject(Error(`Timed out: ${type}`)),3000);waiters.push(w);});}};}
 const publicPeer=await client();publicPeer.send({type:'join-room',code:''});assert.equal((await publicPeer.receive('room')).limit,6);
 const owner=await client();owner.send({type:'create-room'});const room=await owner.receive('room');assert.equal(room.limit,6);
 const guests=[];for(let i=0;i<4;i++){const peer=await client();peer.send({type:'join-room',code:room.code});await peer.receive('room');guests.push(peer);}
 const extra=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(extra);assert.equal((await once(extra,'close'))[0],1013);
 publicPeer.send({type:'create-room'});assert.match((await publicPeer.receive('room-error')).message,/занят/);
 for(const guest of guests){const closed=once(guest.socket,'close');guest.socket.close();await closed;}
 owner.send({type:'create-room'});const replacement=await owner.receive('room');assert.notEqual(replacement.code,room.code);
 publicPeer.send({type:'join-room',code:room.code});assert.match((await publicPeer.receive('room-error')).message,/не найдена/);
});
