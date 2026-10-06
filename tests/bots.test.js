import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../src/arena.js';
const setup=()=>{const a=new Arena(()=>.5);a.bots=[];a.food=[];return a;};
test('bots can eat other bots but player split parts cannot eat each other',()=>{
 const a=setup(),big=a.makeEntity('Big',1000,1000,1000,'bot'),small=a.makeEntity('Small',1000,1000,100,'bot');a.resolveEating([big,small]);assert.equal(small.alive,false);assert.equal(big.mass,1070);
 const p=a.addPlayer('p');p.parts[0].mass=240;a.syncPlayer(p);a.split('p');p.parts[1].x=p.parts[0].x;p.parts[1].y=p.parts[0].y;a.resolveEating(p.parts);assert.ok(p.parts.every(e=>e.alive));
});
test('bots choose eligible food and keep a valid target briefly',()=>{
 const a=setup(),bot=a.makeEntity('Bot',1000,1000,20,'bot');a.food=[{id:'stacey',type:'стейси',x:1001,y:1000},{id:'hammer',type:'молоточек',x:1100,y:1000}];a.updateBot(bot,.05,[bot]);assert.equal(bot.targetId,'hammer');
 a.food.push({id:'closer',type:'молоточек',x:bot.x+5,y:bot.y});a.time=.1;a.updateBot(bot,.05,[bot]);assert.equal(bot.targetId,'hammer');
 a.food=a.food.filter(f=>f.id!=='hammer');a.updateBot(bot,.05,[bot]);assert.equal(bot.targetId,'closer');
});
test('bots flee giant threats based on surface distance and ignore dead entities',()=>{
 const a=setup(),bot=a.makeEntity('Bot',1000,1000,20,'bot'),giant=a.makeEntity('Giant',1800,1000,150000,'bot');const x=bot.x;a.updateBot(bot,.05,[bot,giant]);assert.ok(bot.x<x);
 giant.alive=false;a.food=[{id:'food',type:'молоточек',x:1200,y:1000}];a.updateBot(bot,.05,[bot,giant]);assert.equal(bot.targetId,'food');
});

test('threatened bots travel along a wall instead of jittering against it',()=>{
 const a=setup(),bot=a.makeEntity('Runner',18.3,1000,20,'bot'),giant=a.makeEntity('Threat',500,1000,10000,'bot');
 const start={x:bot.x,y:bot.y};for(let i=0;i<200;i++){a.time+=.05;a.updateBot(bot,.05,[bot,giant]);}
 assert.ok(Math.hypot(bot.x-start.x,bot.y-start.y)>400);assert.ok(bot.y>start.y);
});
test('large bots reject inaccessible corner food and keep roaming',()=>{
 const a=setup(),bot=a.makeEntity('Large',1000,1000,500000,'bot');a.food=[{id:'corner',type:'молоточек',x:0,y:0}];
 const start={x:bot.x,y:bot.y};for(let i=0;i<200;i++){a.time+=.05;a.updateBot(bot,.05,[bot]);}
 assert.notEqual(bot.targetId,'corner');assert.ok(Math.hypot(bot.x-start.x,bot.y-start.y)>100);
});
