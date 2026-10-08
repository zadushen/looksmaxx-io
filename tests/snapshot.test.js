import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/arena.js';
import { Game } from '../src/game.js';

test('client snapshots track local and remote avatars, death and respawn',()=>{
  const arena=new Arena(()=>.5);arena.bots=[];arena.food=[];const me=arena.addPlayer('me'),remote=arena.addPlayer('remote');
  const game=new Game();game.applySnapshot(arena.snapshot(),'me');
  assert.equal(game.player.id,'me');assert.equal(game.player.parts.length,1);assert.equal(game.remotePlayers.length,1);
  remote.parts[0].mass=240;arena.syncPlayer(remote);arena.split('remote');game.applySnapshot(arena.snapshot(),'me');assert.equal(game.remotePlayers.length,2);
  arena.kill(me,remote);game.applySnapshot(arena.snapshot(),'me');assert.equal(game.dead,true);assert.equal(game.player.parts.length,0);
  arena.respawn(me);game.applySnapshot(arena.snapshot(),'me');assert.equal(game.dead,false);assert.equal(game.player.mass,1);
});


test('split avatars retain the character tier based on total player mass',()=>{
 const arena=new Arena(()=>.5);arena.food=[];arena.bots=[];
 const me=arena.addPlayer('me'),remote=arena.addPlayer('remote');
 for(const p of [me,remote]){p.parts[0].mass=150;arena.syncPlayer(p);arena.split(p.id);}
 const game=new Game();game.applySnapshot(arena.snapshot(),'me');
 for(const part of [...game.player.parts,...game.remotePlayers]){
  assert.equal(part.mass,75);assert.equal(part.avatarMass,150);
  assert.equal(game.getTier({mass:part.avatarMass})[1],'sub4');
 }
});

test('bots advance smoothly toward their latest authoritative snapshot between packets',()=>{
 const arena=new Arena(()=>.5),game=new Game();arena.addPlayer('me');game.applySnapshot(arena.snapshot(),'me');
 const id=game.bots[0].id,old=game.bots[0].x;arena.bots[0].x+=100;game.applySnapshot(arena.snapshot(),'me');
 const before=game.bots.find(b=>b.id===id).x;assert.equal(before,old);
 game.smooth(1/60);const after=game.bots.find(b=>b.id===id).x;assert.ok(after>before&&after<old+100);
});

test('local presentation responds before a packet and snapshots do not jump it',()=>{
 const arena=new Arena(()=>.5);arena.bots=[];arena.food=[];arena.addPlayer('me');const game=new Game();game.applySnapshot(arena.snapshot(),'me');
 const part=game.player.parts[0],x=part.x,mass=part.mass;
 game.smooth(1/60,{x:1,y:0,boost:false});assert.ok(part.x>x,'movement must start on the first frame without a new packet');assert.equal(part.mass,mass);
 const visible=part.x;game.applySnapshot(arena.snapshot(),'me');assert.equal(game.player.parts[0].x,visible,'snapshot reception must not snap the displayed position');
 for(let i=0;i<120;i++)game.smooth(1/60,{x:1,y:0,boost:false});assert.ok(Math.abs(game.player.parts[0].x-x)<1,'stale authority stops prediction and reconciles');
 game.resetSnapshotHistory();assert.equal(game.player.parts.length,0);assert.equal(game.targetParts.size,0);
});

test('prediction respects bounds and new split parts and respawns stay authoritative',()=>{
 const arena=new Arena(()=>.5);arena.bots=[];arena.food=[];const me=arena.addPlayer('me');me.parts[0].x=4990;me.parts[0].mass=150;arena.syncPlayer(me);
 const game=new Game();game.applySnapshot(arena.snapshot(),'me');game.smooth(1/60,{x:1,y:0,boost:true});assert.ok(game.player.parts[0].x<=5000-26);
 arena.split('me');game.applySnapshot(arena.snapshot(),'me');assert.equal(game.player.parts.length,2);assert.equal(game.player.mass,150);
 arena.kill(me,null);game.applySnapshot(arena.snapshot(),'me');game.smooth(1/60,{x:1,y:0});assert.equal(game.player.parts.length,0);
});
