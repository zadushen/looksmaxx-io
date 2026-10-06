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
 const before=game.bots.find(b=>b.id===id).x;assert.ok(before>old&&before<old+100);
 game.smooth(1/60);const after=game.bots.find(b=>b.id===id).x;assert.ok(after>before&&after<old+100);
});
