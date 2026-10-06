import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';
import { applyFoodDelta } from '../src/network.js';

function inbox(socket) {
  const queue=[], waiters=[];let food=[];
  socket.on('message', raw=>{const data=JSON.parse(raw);if(data.type==='world'){food=applyFoodDelta(food,data);data.food=food;}const index=waiters.findIndex(w=>w.predicate(data));if(index<0){queue.push(data);if(queue.length>100)queue.shift();}else{const [w]=waiters.splice(index,1);clearTimeout(w.timer);w.resolve(data);}});
  return predicate=>new Promise((resolve,reject)=>{const index=queue.findIndex(predicate);if(index>=0)return resolve(queue.splice(index,1)[0]);const w={predicate,resolve};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(new Error('Timed out waiting for server message'));},3000);waiters.push(w);});
}

test('real HTTP and WebSocket server supports assets, shared rooms and isolated arenas', {timeout:20000}, async t=>{
  const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const sockets=[];t.after(()=>{for(const socket of sockets)socket.terminate();child.kill();});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(([code])=>{throw new Error(`Server exited: ${code}`);})]);
  const origin=`http://127.0.0.1:${port}`;
  await t.test('HTTP does not expose server source, configuration or private project files',async()=>{
    for(const path of ['/server.js','/package.json','/.env.example','/.git/config','/artifacts/arena-audit.json','/public/../server.js','/public/%2e%2e/server.js'])assert.equal((await fetch(`${origin}${path}`)).status,404,path);
    for(const path of ['/styles.css','/src/main.js','/src/game.js','/src/arena.js','/src/ui.js'])assert.equal((await fetch(`${origin}${path}`)).status,200,path);
  });
  await t.test('page and all seven PNG assets are served successfully',async()=>{
    const page=await fetch(origin);assert.equal(page.status,200);assert.match(await page.text(),/id="game"/);
    for(const file of ['avatar-evolution-v2','looksmaxx-characters-color','looksmaxx-tiers','foidka-avatar','makeupcelka-avatar','stacey-avatar','hammer-avatar']){
      const response=await fetch(`${origin}/public/assets/${file}.png`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.ok((await response.arrayBuffer()).byteLength>100);
    }
  });
  async function client(){const socket=new WebSocket(origin.replace('http:','ws:'));sockets.push(socket);const receive=inbox(socket);await once(socket,'open');const welcome=await receive(m=>m.type==='welcome');return {socket,receive,id:welcome.id,send(data){socket.send(JSON.stringify(data));}};}
  const a=await client(),b=await client();let code;
  await t.test('two players in a private room receive the same entities and authoritative movement',async()=>{
    a.send({type:'create-room'});const room=await a.receive(m=>m.type==='room');code=room.code;assert.match(code,/^[A-Z0-9]{6}$/);
    b.send({type:'join-room',code});await b.receive(m=>m.type==='room');
    const [first,second]=await Promise.all([a.receive(m=>m.type==='world'&&m.players.length===2),b.receive(m=>m.type==='world'&&m.players.length===2)]);
    assert.deepEqual(first.players.map(p=>p.id),second.players.map(p=>p.id));assert.deepEqual(first.food.map(f=>f.id),second.food.map(f=>f.id));
    const before=first.players.find(p=>p.id===a.id);a.send({type:'input',name:'Test A',x:1,y:0,mass:999999});
    const moved=await b.receive(m=>m.type==='world'&&m.players.some(p=>p.id===a.id&&p.name==='Test A'&&p.x>before.x));
    assert.ok(moved.players.find(p=>p.id===a.id).mass<999999);
    a.socket.send('{broken');a.send({type:'split'});assert.equal((await a.receive(m=>m.type==='world')).type,'world');
  });
  await t.test('invalid room codes show errors; public arena remains separate',async()=>{
    const c=await client();c.send({type:'join-room',code:'INVALID'});assert.equal((await c.receive(m=>m.type==='room-error')).type,'room-error');
    c.send({type:'join-room',code:''});await c.receive(m=>m.type==='room');const world=await c.receive(m=>m.type==='world');
    assert.deepEqual(world.players.map(p=>p.id),[c.id]);assert.equal(world.round.remaining,null);
  });
  await t.test('private rooms accept twelve clients, reject the thirteenth and remove disconnected players',async()=>{
    a.send({type:'create-room'});const room=await a.receive(m=>m.type==='room');
    const clients=[a];for(let i=0;i<11;i++){const peer=await client();peer.send({type:'join-room',code:room.code});await peer.receive(m=>m.type==='room');clients.push(peer);}
    const extra=await client();extra.send({type:'join-room',code:room.code});assert.match((await extra.receive(m=>m.type==='room-error')).message,/12/);
    await a.receive(m=>m.type==='world'&&m.players.length===12);
    clients.at(-1).socket.close();const world=await a.receive(m=>m.type==='world'&&m.players.length===11);assert.ok(!world.players.some(p=>p.id===clients.at(-1).id));
  });

  await t.test('public players see each other moving and can reconnect after an abrupt disconnect',async()=>{
    const peers=await Promise.all(Array.from({length:4},()=>client()));
    for(const peer of peers){peer.send({type:'join-room',code:''});await peer.receive(m=>m.type==='room');}
    const initial=await peers[0].receive(m=>m.type==='world'&&peers.every(p=>m.players.some(entity=>entity.id===p.id)));
    const starts=new Map(initial.players.map(p=>[p.id,p]));
    for(const [i,peer] of peers.entries()){
      const start=starts.get(peer.id);
      peer.send({type:'input',name:`Online ${i}`,x:start.x<2500?1:-1,y:0});
    }
    await Promise.all(peers.map(peer=>peer.receive(m=>m.type==='world'&&peers.every((p,i)=>{
      const entity=m.players.find(e=>e.id===p.id);
      return entity?.name===`Online ${i}`&&Math.abs(entity.x-starts.get(p.id).x)>1;
    }))));
    const dropped=peers.pop();dropped.socket.terminate();
    await peers[0].receive(m=>m.type==='world'&&!m.players.some(p=>p.id===dropped.id));
    const replacement=await client();assert.notEqual(replacement.id,dropped.id);
    replacement.send({type:'join-room',code:''});await replacement.receive(m=>m.type==='room');
    await peers[0].receive(m=>m.type==='world'&&m.players.some(p=>p.id===replacement.id));
  });

  await t.test('empty private rooms are deleted and stale room codes are rejected',async()=>{
    const owner=await client();owner.send({type:'create-room'});const room=await owner.receive(m=>m.type==='room');
    owner.send({type:'join-room',code:''});await owner.receive(m=>m.type==='room');
    const visitor=await client();visitor.send({type:'join-room',code:room.code});
    assert.match((await visitor.receive(m=>m.type==='room-error')).message,/не найдена/);
    visitor.send({type:'join-room',code:''});await visitor.receive(m=>m.type==='room');
    await visitor.receive(m=>m.type==='world'&&m.players.some(p=>p.id===visitor.id));
  });

  await t.test('silent input stops movement and health checks remain responsive',async()=>{
    const peer=await client();peer.send({type:'create-room'});await peer.receive(m=>m.type==='room');
    peer.send({type:'input',x:1,y:0});
    await new Promise(resolve=>setTimeout(resolve,700));
    const first=await peer.receive(m=>m.type==='world'&&m.time>=.7);
    const next=await peer.receive(m=>m.type==='world'&&m.time>=first.time+.2);
    assert.equal(first.players[0].x,next.players[0].x);
    const response=await fetch(`${origin}/healthz`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'ok'});
  });

  await t.test('message floods and oversized payloads disconnect only the offending client',async()=>{
    const flood=await client();const closed=once(flood.socket,'close');
    for(let i=0;i<130;i++)flood.socket.send('{"type":"unknown"}');
    assert.equal((await closed)[0],1008);
    const large=await client();const oversized=once(large.socket,'close');large.socket.send('x'.repeat(5000));assert.equal((await oversized)[0],1009);
    const survivor=await client();survivor.send({type:'join-room',code:''});await survivor.receive(m=>m.type==='room');await survivor.receive(m=>m.type==='world');
  });

});
