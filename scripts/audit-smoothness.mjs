import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {Arena} from '../src/arena.js';
import {Game} from '../src/game.js';
const baselineRef=process.env.BASELINE_REF||'eedbfcb';
const source=execFileSync('git',['show',`${baselineRef}:src/game.js`],{encoding:'utf8'}).replace("'./arena.js'",JSON.stringify(new URL('../src/arena.js',import.meta.url).href)).replace("'./network.js'",JSON.stringify(new URL('../src/network.js',import.meta.url).href));
const {Game:Before}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function trace(Client){
 const arena=new Arena(()=>.5);arena.bots=[];arena.food=[];const player=arena.addPlayer('me');player.parts[0].x=2500;player.parts[0].y=2500;arena.syncPlayer(player);
 const game=new Client();game.applySnapshot(arena.snapshot(),'me');const queue=[];let firstResponseMs=null,maxPacketJump=0;
 // Controlled 60Hz presentation, 10Hz snapshots, 100ms one-way latency and bounded jitter.
 for(let frame=1;frame<=300;frame++){
  const time=frame/60,input=time>=.2?{x:1,y:0,boost:false}:{x:0,y:0,boost:false};
  player.parts[0].x=2500+245*Math.max(0,time-.3);arena.time=time;arena.syncPlayer(player);
  if(frame%6===0)queue.push({at:frame+[6,7,5][(frame/6)%3],world:arena.snapshot()});
  while(queue.length&&queue[0].at<=frame){const old=game.player.parts[0].x;game.applySnapshot(queue.shift().world,'me');maxPacketJump=Math.max(maxPacketJump,Math.abs(game.player.parts[0].x-old));}
  game.smooth(1/60,input);
  if(time>=.2&&firstResponseMs===null&&game.player.parts[0].x>2500+.01)firstResponseMs=Math.round((time-.2+1/60)*1000);
 }
 return{firstVisibleMovementMs:firstResponseMs,maxSnapshotPositionJump:+maxPacketJump.toFixed(2)};
}
const report={checkedAt:new Date().toISOString(),baselineRef,scenario:'Synthetic 60Hz frames, 10Hz world, 100ms one-way input and snapshot latency, ±16.7ms snapshot jitter',before:trace(Before),after:trace(Game),limitations:'Controlled model, not measured end-to-end input latency on a physical device.'};
await writeFile(new URL('../artifacts/smoothness-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
