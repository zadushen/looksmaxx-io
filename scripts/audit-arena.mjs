import {Arena,radius,WORLD_SIZE} from '../src/arena.js';
import {writeFileSync} from 'node:fs';
let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const arena=new Arena(random),samples=[];const started=performance.now();
for(let tick=0;tick<36000;tick++){
 arena.update(.05);
 if(arena.bots.some(b=>!Number.isFinite(b.x+b.y+b.mass)||b.x<radius(b.mass)-.01||b.x>WORLD_SIZE-radius(b.mass)+.01||b.y<radius(b.mass)-.01||b.y>WORLD_SIZE-radius(b.mass)+.01))throw Error('Invalid bot geometry');
 if(tick%6000===5999){const p=arena.addPlayer('audit-newcomer');const gap=Math.min(...arena.bots.map(b=>Math.hypot(p.x-b.x,p.y-b.y)-radius(b.mass)-radius(p.mass)));samples.push({minutes:(tick+1)*.05/60,topMass:Math.floor(Math.max(...arena.bots.map(b=>b.mass))),newcomerClearance:Math.round(gap),bots:arena.bots.length});arena.removePlayer(p.id);}
}
const report={seed:42,simulatedMinutes:30,elapsedSeconds:Math.round((performance.now()-started)/1000),samples};writeFileSync(new URL('../artifacts/arena-audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
