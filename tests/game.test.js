import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, ROUND_DURATION, TIERS } from '../src/arena.js';

test('server simulation accepts input but never client position or mass', () => {
  const arena=new Arena(()=>.5); arena.food=[]; arena.bots=[]; const p=arena.addPlayer('one','One');
  arena.setInput('one',{x:0,y:-1,mass:99999,position:{x:1,y:1}});
  arena.update(.05);
  assert.ok(p.y<2500); assert.ok(p.mass<100);
});

test('one thousand mass is a normie tier and gigamogger is fifty thousand', () => {
  assert.deepEqual(TIERS.find(([mass]) => mass === 800), [800,'normie','#53c7a7']);
  assert.deepEqual(TIERS.find(([mass]) => mass === 50000), [50000,'gigamogger','#f6d371']);
});
test('split, food and player collision are resolved by shared arena', () => {
  const arena=new Arena(()=>.5), a=arena.addPlayer('a','A'), b=arena.addPlayer('b','B');
  a.parts[0].mass=120; arena.syncPlayer(a); arena.setInput('a',{x:1,y:0});
  assert.equal(arena.split('a'),true); assert.equal(a.parts.length,2);
  b.parts[0].x=a.parts[0].x; b.parts[0].y=a.parts[0].y; b.parts[0].mass=10; arena.syncPlayer(b);
  arena.resolveEating(arena.livingParts());
  assert.equal(b.alive,false); assert.equal(arena.snapshot().players.length,2);
});

test('bonus zones are server-authoritative and stars are not food', () => {
  const arena=new Arena(()=>.1); arena.bots=[]; arena.food=[];
  const player=arena.addPlayer('one','One');
  assert.equal(arena.snapshot().map.id,'classic');
  arena.time=59.99; arena.update(.05);
  const world=arena.snapshot();
  assert.equal(world.zoneEvent.kind,'bonus');
  assert.equal(world.zoneEvent.radius,390);
  assert.ok(world.nextZoneEventAt>=120);
  const food=new Arena(()=>.01).makeFood();
  assert.notEqual(food.type,'редкий деликатес');
});

test('foid and makeup food flee when a player gets close', () => {
  const arena=new Arena(()=>.5); arena.bots=[]; arena.food=[];
  const player=arena.addPlayer('one','One');
  player.parts[0].x=1000; player.parts[0].y=1000;
  arena.food.push({id:'flee',x:1080,y:1000,type:'фоидка',value:1,velocity:{x:0,y:0}});
  arena.update(.05);
  assert.ok(arena.food[0].x>1080);
  assert.ok(arena.snapshot().food[0].velocity.x>0);
});

test('foid food can only be collected from sub3 mass onward', () => {
  const arena=new Arena(()=>.5); arena.bots=[]; arena.food=[];
  const player=arena.addPlayer('one','One');
  arena.food.push({id:'foid',x:player.parts[0].x,y:player.parts[0].y,type:'фоидка',value:50,velocity:{x:0,y:0}});
  arena.collectFood(player.parts[0]); assert.equal(player.parts[0].mass,1);
  player.parts[0].mass=75; arena.syncPlayer(player); arena.collectFood(player.parts[0]);
  assert.equal(player.parts[0].mass,125);
});

test('makeup food can only be collected from normie mass onward', () => {
  const arena=new Arena(()=>.5); arena.bots=[]; arena.food=[];
  const player=arena.addPlayer('one','One');
  arena.food.push({id:'makeup',x:player.parts[0].x,y:player.parts[0].y,type:'мейкапцелка',value:3,velocity:{x:0,y:0}});
  const before=player.parts[0].mass; arena.update(.05);
  assert.equal(player.parts[0].mass,before);
  player.parts[0].mass=800; arena.syncPlayer(player); arena.update(.05);
  assert.ok(player.parts[0].mass>800);
});

test('stacey food is worth one thousand and requires chadlite mass', () => {
  const arena=new Arena(()=>.5); arena.bots=[]; arena.food=[];
  const player=arena.addPlayer('one','One');
  arena.food.push({id:'stacey',x:player.parts[0].x,y:player.parts[0].y,type:'стейси',value:1000,velocity:{x:0,y:0}});
  arena.collectFood(player.parts[0]); assert.equal(player.parts[0].mass,1);
  player.parts[0].mass=3500; arena.syncPlayer(player); arena.collectFood(player.parts[0]);
  assert.equal(player.parts[0].mass,4500);
});

test('hammer food is stationary and gives every player ten mass', () => {
  const arena=new Arena(()=>.5); arena.bots=[]; arena.food=[];
  const player=arena.addPlayer('one','One');
  arena.random=()=>.5;
  const generated=arena.makeFood();
  assert.equal(generated.type,'молоточек');
  assert.equal(generated.value,10);
  assert.equal('velocity' in generated,false);
  const hammer={id:'hammer',x:1080,y:1000,type:'молоточек',value:10};
  player.parts[0].x=1000; player.parts[0].y=1000;
  arena.food.push(hammer);
  arena.update(.05);
  assert.equal(hammer.x,1080);
  assert.equal(hammer.y,1000);
  hammer.x=player.parts[0].x; hammer.y=player.parts[0].y;
  const before=player.parts[0].mass;
  arena.update(.05);
  assert.equal(player.parts[0].mass,before+10);
});

test('a first hammer does not cause a sudden speed drop', () => {
  const arena=new Arena(()=>.5); arena.food=[]; arena.bots=[];
  const player=arena.addPlayer('one','One'), part=player.parts[0];
  const travelAt=mass=>{part.mass=mass; part.x=1000; part.y=1000; arena.move(part,1,0,.05); return part.x-1000;};
  const startDistance=travelAt(1), hammerDistance=travelAt(11);
  assert.equal(startDistance,hammerDistance);
});

test('the shared arena has no timer and does not reset players', () => {
  const arena=new Arena(()=>.5); arena.food=[]; arena.bots=[];
  const first=arena.addPlayer('first','First'), second=arena.addPlayer('second','Second');
  first.parts[0].mass=120; first.kills=2; arena.syncPlayer(first);
  second.parts[0].mass=60; arena.syncPlayer(second);
  arena.time=ROUND_DURATION; arena.update(.05);
  const world=arena.snapshot();
  assert.equal(world.round.phase,'playing');
  assert.equal(world.round.remaining,null);
  assert.ok(world.players.find(player=>player.id==='first').mass>100);
  assert.ok(world.players.find(player=>player.id==='second').mass>30);
});

test('split conserves mass, respects cooldown and merges after seven seconds', () => {
  const arena=new Arena(()=>.5);arena.food=[];arena.bots=[];
  const p=arena.addPlayer('one');p.parts[0].mass=240;arena.syncPlayer(p);arena.setInput(p.id,{x:1,y:0});
  assert.equal(arena.split(p.id),true);assert.equal(p.mass,240);assert.equal(p.parts.length,2);
  assert.equal(arena.split(p.id),false);
  arena.time=6.9;arena.mergePlayer(p);assert.equal(p.parts.length,2);
  arena.time=7;arena.mergePlayer(p);arena.syncPlayer(p);assert.equal(p.parts.length,1);assert.equal(p.mass,240);
});

test('boost spends mass, ejects recoverable food and stops draining at minimum mass', () => {
  const arena=new Arena(()=>.5);arena.food=[];arena.bots=[];const p=arena.addPlayer('one');
  p.parts[0].mass=100;arena.syncPlayer(p);arena.setInput(p.id,{x:1,y:0,boost:true});
  for(let i=0;i<20;i++){arena.updatePlayer(p,.05);arena.syncPlayer(p);}
  assert.ok(Math.abs(p.mass-92)<.0001);assert.equal(arena.ejectedFood.length,1);assert.equal(arena.ejectedFood[0].value,5);
  p.parts[0].mass=60;arena.syncPlayer(p);arena.updatePlayer(p,.05);arena.syncPlayer(p);assert.equal(p.mass,60);
});

test('death credits the killer and automatic respawn restores starting mass', () => {
  const arena=new Arena(()=>.5);arena.food=[];arena.bots=[];
  const hunter=arena.addPlayer('hunter'),victim=arena.addPlayer('victim');
  arena.kill(victim,hunter);assert.equal(hunter.kills,1);assert.equal(victim.alive,false);assert.equal(victim.parts.length,0);
  assert.equal(arena.snapshot().events.at(-1).type,'kill');
  arena.time=1.9;arena.update(.05);assert.equal(victim.alive,false);
  arena.bots=[];arena.time=2;arena.update(.05);assert.equal(victim.alive,true);assert.equal(victim.mass,1);assert.equal(victim.parts.length,1);
});

test('extreme mass stays inside the map and respawn temporarily protects against eating',async()=>{
 const {radius,WORLD_SIZE}=await import('../src/arena.js');
 for(const mass of [300000,14143206,1e12]){assert.ok(radius(mass)<WORLD_SIZE/4);}
 const arena=new Arena(()=>.5);arena.food=[];arena.bots=[];
 const hunter=arena.addPlayer('hunter'),victim=arena.addPlayer('victim');hunter.parts[0].mass=100000;arena.syncPlayer(hunter);
 arena.kill(victim,hunter);arena.respawn(victim);victim.parts[0].x=hunter.x;victim.parts[0].y=hunter.y;
 arena.resolveEating(arena.livingParts());assert.equal(victim.alive,true);
 arena.time=1.6;arena.resolveEating(arena.livingParts());assert.equal(victim.alive,false);
});

test('entities stay within valid bounds after creation and extreme growth',async()=>{
 const {radius,WORLD_SIZE}=await import('../src/arena.js');const arena=new Arena(()=>.5);arena.bots=[];arena.food=[];
 const bot=arena.makeEntity('Edge',0,WORLD_SIZE,10,'bot');assert.equal(bot.x,radius(10));assert.equal(bot.y,WORLD_SIZE-radius(10));
 const p=arena.addPlayer('p');p.parts[0].x=20;p.parts[0].y=20;p.parts[0].mass=14143206;arena.syncPlayer(p);
 assert.ok(p.x>=radius(p.mass));assert.ok(p.y>=radius(p.mass));
});
