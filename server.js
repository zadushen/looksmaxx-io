import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { Arena } from './src/arena.js';
import { wireWorld, foodDelta } from './src/network.js';
import { serverLimits } from './server-config.js';

const root=process.cwd(), types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'"};
const http=createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end();return;}
  if(req.url==='/healthz'){res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok'}));return;}
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400,headers);res.end('Bad request');return;}
  const clientFile=pathname==='/'||pathname==='/index.html'||pathname==='/styles.css'||/^\/src\/[a-z0-9-]+\.js$/i.test(pathname)||pathname.startsWith('/public/')||/^\/artifacts\/avatar-review\.(html|css|js)$/.test(pathname);
  if(!clientFile||pathname.split('/').some(segment=>segment.startsWith('.'))){res.writeHead(404,headers);res.end('Not found');return;}
  const path=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
  if((path!==root&&!path.startsWith(`${root}${sep}`))||!existsSync(path)||statSync(path).isDirectory()){res.writeHead(404,headers);res.end('Not found');return;}
  res.writeHead(200,{...headers,'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  if(req.method==='HEAD'){res.end();return;} createReadStream(path).on('error',()=>res.destroy()).pipe(res);
});
const wss=new WebSocketServer({server:http,maxPayload:4096,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:4,zlibDeflateOptions:{level:3}}});
const limits=serverLimits();
const ROOM_LIMIT=limits.privatePlayers, PUBLIC_LIMIT=limits.publicPlayers, CONNECTION_LIMIT=limits.connections, MAX_ROOMS=limits.rooms, PUBLIC_ROOM='public';
let nextMapIndex=0;
const createArena=()=>new Arena(Math.random,nextMapIndex++);
const rooms=new Map([[PUBLIC_ROOM,{arena:createArena(),sockets:new Set(),public:true}]]);
let nextId=1,last=Date.now();
const send=(socket,message)=>socket.readyState===1&&socket.send(JSON.stringify(message));
const roomCode=()=>{let code;do{code=Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');}while(rooms.has(code));return code;};
function announceRoom(socket,code){const room=rooms.get(code);send(socket,{type:'room',code:room.public?'':code,isPublic:room.public,players:room.arena.players.size,limit:room.public?PUBLIC_LIMIT:ROOM_LIMIT});}
function leaveRoom(socket){const code=socket.roomCode;if(!code)return;const room=rooms.get(code);if(!room)return;room.sockets.delete(socket);room.arena.removePlayer(socket.playerId);socket.roomCode=null;if(!room.public&&!room.sockets.size)rooms.delete(code);}
function joinRoom(socket,code){const room=rooms.get(code);if(!room){send(socket,{type:'room-error',message:'Комната с таким кодом не найдена.'});return false;}if(room.arena.players.size>=(room.public?PUBLIC_LIMIT:ROOM_LIMIT)){send(socket,{type:'room-error',message:room.public?'Общий мир заполнен. Попробуй позже.':`В комнате уже ${ROOM_LIMIT} игроков.`});return false;}leaveRoom(socket);room.sockets.add(socket);socket.roomCode=code;socket.needsFull=true;room.arena.addPlayer(socket.playerId);announceRoom(socket,code);return true;}
function createRoom(socket){const current=rooms.get(socket.roomCode);if(rooms.size>=MAX_ROOMS&&current&&!current.public&&current.sockets.size===1)leaveRoom(socket);if(rooms.size>=MAX_ROOMS){send(socket,{type:'room-error',message:'Сервер занят. Войди в общий мир или существующую комнату.'});return;}const code=roomCode();rooms.set(code,{arena:createArena(),sockets:new Set(),public:false});joinRoom(socket,code);}
function playerArena(socket){return rooms.get(socket.roomCode)?.arena;}
function publish(){
  for(const room of rooms.values()){
    if(!room.sockets.size)continue;
    const world=wireWorld(room.arena.snapshot());
    const delta=foodDelta(world.food,room.previousFood);room.previousFood=delta.current;
    const {food,map,...rest}=world;
    const message=JSON.stringify({...rest,foodChanges:delta.changes,foodRemoved:delta.removed});
    let full;
    for(const socket of room.sockets){
      if(socket.readyState!==1)continue;
      if(socket.bufferedAmount>256*1024){socket.needsFull=true;continue;}
      if(socket.needsFull){full??=JSON.stringify(world);socket.send(full);socket.needsFull=false;}
      else socket.send(message);
    }
  }
}
wss.on('connection',socket=>{
  socket.on('error',()=>{});
  if(wss.clients.size>CONNECTION_LIMIT){socket.close(1013,'Server full');return;}
  socket.playerId=`p${nextId++}`;socket.roomCode=null;socket.alive=true;socket.windowStarted=Date.now();socket.messages=0;socket.roomActions=0;
  send(socket,{type:'welcome',id:socket.playerId});
  const joinTimeout=setTimeout(()=>{if(!socket.roomCode)socket.close(1008,'Join a room to play');},10000);joinTimeout.unref();socket.on('close',()=>clearTimeout(joinTimeout));
  socket.on('pong',()=>socket.alive=true);
  socket.on('message',raw=>{
    const now=Date.now();
    if(now-socket.windowStarted>=1000){socket.windowStarted=now;socket.messages=0;socket.roomActions=0;}
    if(++socket.messages>120){socket.close(1008,'Too many messages');return;}
    try{
      const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))return;
      if(data.type==='create-room'||data.type==='join-room'){
        if(++socket.roomActions>4){socket.close(1008,'Too many room changes');return;}
        if(data.type==='create-room')createRoom(socket);
        else joinRoom(socket,String(data.code||'').trim().toUpperCase()||PUBLIC_ROOM);
      }else{
        const arena=playerArena(socket);
        if(data.type==='input'){arena?.setInput(socket.playerId,data);socket.lastInputAt=now;}
        else if(data.type==='split')arena?.split(socket.playerId);
        // Respawn timing is controlled exclusively by the arena.
      }
    }catch{}
  });
  socket.on('close',()=>leaveRoom(socket));
});
let ticks=0;
const simulation=setInterval(()=>{
  const now=Date.now(),dt=(now-last)/1000;last=now;
  for(const socket of wss.clients)if(socket.roomCode&&now-(socket.lastInputAt||0)>500)playerArena(socket)?.setInput(socket.playerId,{x:0,y:0,boost:false});
  for(const room of rooms.values())if(room.sockets.size)room.arena.update(dt);
  if(++ticks%2===0)publish();
},50);
const heartbeat=setInterval(()=>{
  for(const socket of wss.clients){if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();}
},15000);
const metrics=setInterval(()=>{if(process.env.LOG_METRICS==='true')console.log(JSON.stringify({event:'server-metrics',connections:wss.clients.size,rooms:rooms.size,players:[...rooms.values()].reduce((sum,room)=>sum+room.arena.players.size,0),rssMB:Math.round(process.memoryUsage().rss/1024/1024)}));},30000);
function shutdown(){console.log(JSON.stringify({event:'shutdown',matchesReset:true}));clearInterval(simulation);clearInterval(heartbeat);clearInterval(metrics);for(const socket of wss.clients)socket.close(1012,'Server restarting');http.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
const configuredPort=Number(process.env.PORT);
const port=Number.isInteger(configuredPort)&&configuredPort>0&&configuredPort<65536?configuredPort:3000;
// 0.0.0.0 keeps both the public arena and private rooms available on the LAN.
http.listen(port,'0.0.0.0',()=>console.log(`Looksmaxx.io running on http://localhost:${port}`));
