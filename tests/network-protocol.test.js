import test from 'node:test';
import assert from 'node:assert/strict';
import {Arena} from '../src/arena.js';
import {Game} from '../src/game.js';
import {wireWorld,foodDelta} from '../src/network.js';

test('food deltas reconstruct movement, replacement and removal across a long match',()=>{
 const arena=new Arena(),game=new Game();arena.addPlayer('me');let previous;
 for(let tick=0;tick<500;tick++){
  arena.setInput('me',{x:1,y:Math.sin(tick/20)});arena.update(.05);
  if(tick%2)continue;
  const world=wireWorld(arena.snapshot()),delta=foodDelta(world.food,previous);previous=delta.current;
  const {food,map,...rest}=world;
  game.applySnapshot(tick===0?world:{...rest,foodChanges:delta.changes,foodRemoved:delta.removed},'me');
  assert.deepEqual([...game.food].sort((a,b)=>a.id.localeCompare(b.id)),[...food].sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual(game.map,arena.map);
 }
});

test('a full snapshot resets food and map when switching rooms or resynchronizing',()=>{
 const a=new Arena(),b=new Arena(),game=new Game();a.addPlayer('me');b.addPlayer('me');
 game.applySnapshot(wireWorld(a.snapshot()),'me');b.food=b.food.slice(0,3);
 game.applySnapshot(wireWorld(b.snapshot()),'me');assert.deepEqual(game.food,wireWorld(b.snapshot()).food);
});

test('wire rounding does not change authoritative mass, positions or tier thresholds',()=>{
 const arena=new Arena();const p=arena.addPlayer('me');p.parts[0].mass=14.999;arena.syncPlayer(p);
 const original=arena.snapshot(),wire=wireWorld(original);
 assert.equal(p.mass,14.999);assert.equal(original.players[0].mass,14.999);
 assert.equal(new Game().getTier(wire.players[0])[1],'sub0');
 assert.ok(Math.abs(wire.players[0].x-original.players[0].x)<=.0051);
});
