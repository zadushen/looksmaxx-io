import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/arena.js';

test('eating one split part removes every part of the defeated player', () => {
  const arena=new Arena(()=>.5); arena.food=[]; arena.bots=[];
  const hunter=arena.addPlayer('hunter','Hunter'), victim=arena.addPlayer('victim','Victim');
  hunter.parts[0].mass=100; arena.syncPlayer(hunter);
  victim.parts[0].mass=120; arena.syncPlayer(victim); arena.setInput('victim',{x:1,y:0});
  assert.equal(arena.split('victim'),true);
  victim.parts.forEach(part=>{part.x=hunter.parts[0].x;part.y=hunter.parts[0].y;});
  const parts=arena.livingParts(); arena.resolveEating(parts);
  assert.equal(victim.alive,false);
  assert.ok(parts.filter(part=>part.id!==hunter.parts[0].id).every(part=>!part.alive));
});
