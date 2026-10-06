import { Game } from './game.js';
import { UI } from './ui.js';
const canvas = document.querySelector('#game');
let game = new Game(); let ui = new UI(game, canvas); let last = performance.now();
let audio, lastBoostTone = 0, socket, clientId, pendingRoom='public', activeRoom='public';
const serverOrigin = location.protocol === 'file:' ? 'http://localhost:3000' : location.origin;
const socketOrigin = location.protocol === 'file:' ? 'ws://localhost:3000' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const start = document.querySelector('#start-screen'), nickname = document.querySelector('#nickname'), roomInput = document.querySelector('#room-code-input'), roomStatus = document.querySelector('#room-status'), roomBar = document.querySelector('#room-bar'), roomLabel = document.querySelector('#room-label'), copyInvite = document.querySelector('#copy-invite');
const tone = (frequency, duration = .08, volume = .035) => { if (!audio) return; const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration); };
const setStatus=(message,error=false)=>{roomStatus.textContent=message;roomStatus.classList.toggle('error',error);};
const showRoom=room=>{activeRoom=room.code||'public';roomBar.hidden=false;if(room.isPublic){roomLabel.textContent='Общий мир';copyInvite.hidden=true;}else{roomLabel.textContent=`Комната: ${room.code} · ${room.players}/${room.limit}`;copyInvite.hidden=false;}start.hidden=true;ui.over.hidden=true;canvas.focus();};
const connect = () => {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  socket = new WebSocket(socketOrigin);
  socket.addEventListener('open',()=>socket.send(JSON.stringify(pendingRoom==='create'?{type:'create-room'}:{type:'join-room',code:pendingRoom==='public'?'':pendingRoom})));
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.type === 'welcome') clientId=data.id; if (data.type === 'room') showRoom(data); if(data.type==='room-error'){start.hidden=false;setStatus(data.message,true);} if (data.type === 'world' && clientId) game.applySnapshot(data, clientId); });
  socket.addEventListener('close',()=>{clearInput();pendingRoom=activeRoom;start.hidden=false;roomBar.hidden=true;setStatus('Соединение потеряно. Нажми «Играть» или войди в комнату снова.',true);});
};
ui.resize(); addEventListener('resize', () => ui.resize());
const input={x:0,y:0,keys:new Set(),boostTouch:false};
let touchOrigin=null;let lastInputSent=-Infinity;
const pointDirection=e=>{if(touchOrigin){input.x=e.clientX-touchOrigin.x;input.y=e.clientY-touchOrigin.y;}else{input.x=e.clientX-innerWidth/2;input.y=e.clientY-innerHeight/2;}};
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){touchOrigin={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);}pointDirection(e);});
canvas.addEventListener('pointermove',pointDirection);
const releasePointer=e=>{if(e.pointerType==='touch'){touchOrigin=null;input.x=0;input.y=0;}};
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('lostpointercapture',releasePointer);
addEventListener('keydown', e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return; if (!start.hidden) return; if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/.test(e.code)) e.preventDefault(); if (e.code === 'Space' && !e.repeat) { socket?.readyState===WebSocket.OPEN&&socket.send(JSON.stringify({type:'split'})); tone(520,.12,.055); } input.keys.add(e.code); });
addEventListener('keyup', e => input.keys.delete(e.code));
const clearInput=()=>{input.keys.clear();input.x=0;input.y=0;input.boostTouch=false;touchOrigin=null;};
addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
const begin = room => { audio ??= new AudioContext(); pendingRoom=room;setStatus(room==='create'?'Создаём комнату…':'Подключаемся…');connect();if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(room==='create'?{type:'create-room'}:{type:'join-room',code:room==='public'?'':room}));tone(330,.1,.05); };
document.querySelector('#play').addEventListener('click', ()=>begin('public'));
document.querySelector('#create-room').addEventListener('click', ()=>begin('create'));
document.querySelector('#join-room').addEventListener('click', ()=>{const code=roomInput.value.trim().toUpperCase();if(!code)return setStatus('Введи код комнаты.',true);begin(code);});
nickname.addEventListener('keydown', e => { if (e.key === 'Enter') begin('public'); });
roomInput.addEventListener('input',()=>roomInput.value=roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
document.querySelector('#restart').addEventListener('click', () => { ui.over.hidden = true; });
document.querySelector('#split-touch').addEventListener('click',()=>{socket?.readyState===WebSocket.OPEN&&socket.send(JSON.stringify({type:'split'}));tone(520,.12,.055);});
const boostTouch=document.querySelector('#boost-touch');
['pointerdown','pointerup','pointercancel','pointerleave'].forEach(type=>boostTouch.addEventListener(type,e=>{e.preventDefault();input.boostTouch=type==='pointerdown';}));
copyInvite.addEventListener('click',async()=>{const code=activeRoom;const invite=`${serverOrigin}/?room=${encodeURIComponent(code)}`;try{await navigator.clipboard.writeText(invite);copyInvite.textContent='Скопировано ✓';copyInvite.classList.add('copied');setTimeout(()=>{copyInvite.textContent='Копировать приглашение';copyInvite.classList.remove('copied');},1600);}catch{setStatus(`Код комнаты: ${code}`,false);}});
const invitationCode=new URLSearchParams(location.search).get('room');if(invitationCode){roomInput.value=invitationCode.toUpperCase().slice(0,6);setStatus(`Приглашение в комнату ${roomInput.value}`);}
function direction(){let x=0,y=0,k=input.keys;if(k.has('ArrowUp')||k.has('KeyW'))y--;if(k.has('ArrowDown')||k.has('KeyS'))y++;if(k.has('ArrowLeft')||k.has('KeyA'))x--;if(k.has('ArrowRight')||k.has('KeyD'))x++;return x||y?{x,y}:{x:input.x,y:input.y};}
function frame(now) { const dt = Math.min((now-last)/1000,.05);last=now; const d=direction(),boost=input.keys.has('ShiftLeft')||input.keys.has('ShiftRight')||input.boostTouch; if (boost && game.player.mass > 24 && now - lastBoostTone > 180) { tone(180,.045,.018); lastBoostTone = now; } if (socket?.readyState === WebSocket.OPEN && !start.hidden){} else if(socket?.readyState===WebSocket.OPEN&&now-lastInputSent>=30&&socket.bufferedAmount<16384){socket.send(JSON.stringify({type:'input',name:nickname.value.trim()||'Ты',x:d.x,y:d.y,boost}));lastInputSent=now;} game.smooth(dt);ui.render();requestAnimationFrame(frame); }
requestAnimationFrame(frame);
