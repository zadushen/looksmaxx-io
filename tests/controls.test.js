import test from 'node:test';
import assert from 'node:assert/strict';
import { browserHarness } from './helpers/browser.js';

const latestInput = socket => socket.sent.filter(m=>m.type==='input').at(-1);

test('WASD and Space do not intercept typing in nickname or room fields', () => {
  const h=browserHarness(); h.loadMain();
  for (const selector of ['#nickname','#room-code-input']) for(const code of ['KeyW','KeyA','KeyS','KeyD','Space']) {
    const event=h.windowEvent('keydown',{code,target:h.elements.get(selector)});
    assert.ok(!event.defaultPrevented, `${selector}: ${code}`);
  }
});

test('keyboard directions, boost and release send correct input; split fires once per press', () => {
  const h=browserHarness(), socket=h.start();
  for(const [code,x,y] of [['KeyW',0,-1],['KeyA',-1,0],['KeyS',0,1],['KeyD',1,0],['ArrowUp',0,-1],['ArrowDown',0,1],['ArrowLeft',-1,0],['ArrowRight',1,0]]) {
    h.windowEvent('keydown',{code}); h.frame(); assert.equal(latestInput(socket).x,x); assert.equal(latestInput(socket).y,y);
    h.windowEvent('keyup',{code});
  }
  h.windowEvent('keydown',{code:'ShiftLeft'}); h.frame(); assert.equal(latestInput(socket).boost,true);
  h.windowEvent('keyup',{code:'ShiftLeft'}); h.frame(); assert.equal(latestInput(socket).boost,false);
  h.windowEvent('keydown',{code:'Space',repeat:false}); h.windowEvent('keydown',{code:'Space',repeat:true});
  assert.equal(socket.sent.filter(m=>m.type==='split').length,1);
});

test('mouse and touch directions work; canceled touch and lost focus stop movement', () => {
  const h=browserHarness(),socket=h.start(),canvas=h.elements.get('#game');
  canvas.dispatch('pointermove',{clientX:900,clientY:384,pointerType:'mouse'}); h.frame(); assert.ok(latestInput(socket).x>0);
  canvas.dispatch('pointerdown',{clientX:100,clientY:100,pointerType:'touch',pointerId:1});
  canvas.dispatch('pointermove',{clientX:100,clientY:150,pointerType:'touch'}); h.frame(); assert.equal(latestInput(socket).y,50);
  canvas.dispatch('pointercancel',{pointerType:'touch'}); h.frame(); assert.equal(latestInput(socket).y,0);
  h.windowEvent('keydown',{code:'KeyW'}); h.windowEvent('keydown',{code:'ShiftLeft'}); h.windowEvent('blur'); h.frame();
  assert.equal(latestInput(socket).y,0); assert.equal(latestInput(socket).boost,false);
});

test('touch split and held boost send actions and release on cancellation', () => {
  const h=browserHarness(),socket=h.start();
  h.elements.get('#split-touch').dispatch('click'); assert.equal(socket.sent.at(-1).type,'split');
  h.elements.get('#boost-touch').dispatch('pointerdown'); h.frame(); assert.equal(latestInput(socket).boost,true);
  h.elements.get('#boost-touch').dispatch('pointercancel'); h.frame(); assert.equal(latestInput(socket).boost,false);
});

test('start, private-room creation and room errors update the interface', () => {
  const h=browserHarness();h.loadMain();h.elements.get('#create-room').dispatch('click');
  const socket=h.sockets[0]; socket.emit('open'); assert.equal(socket.sent.at(-1).type,'create-room');
  socket.emit('message',{type:'room-error',message:'Нет комнаты'}); assert.equal(h.elements.get('#room-status').textContent,'Нет комнаты');
  assert.equal(h.elements.get('#start-screen').hidden,false);
  socket.emit('message',{type:'room',isPublic:false,code:'ABC123',players:1,limit:12});
  assert.equal(h.elements.get('#start-screen').hidden,true);assert.equal(h.elements.get('#room-bar').hidden,false);
  assert.match(h.elements.get('#room-label').textContent,/ABC123/);
});

test('lost connections show the menu and allow a fresh connection; Enter starts play',()=>{
 const h=browserHarness();h.loadMain();h.elements.get('#nickname').dispatch('keydown',{key:'Enter'});assert.equal(h.sockets.length,1);
 const socket=h.sockets[0];socket.emit('open');socket.emit('message',{type:'room',isPublic:true,code:'',players:1,limit:12});
 socket.emit('close');assert.equal(h.elements.get('#start-screen').hidden,false);assert.equal(h.elements.get('#room-bar').hidden,true);
 h.elements.get('#play').dispatch('click');assert.equal(h.sockets.length,2);
});
