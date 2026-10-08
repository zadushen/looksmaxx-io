import { TIERS, WORLD_SIZE, radius } from './arena.js';
import { applyFoodDelta } from './network.js';
export { WORLD_SIZE, radius };
export class Game {
  constructor(){this.player={id:null,name:'Ты',alive:true,x:2500,y:2500,mass:1,kills:0,parts:[]};this.remotePlayers=[];this.bots=[];this.food=[];this.ejectedFood=[];this.dead=false;this.leaderboard=[];this.targetParts=new Map();this.round={number:1,phase:'playing',remaining:null};this.events=[];this.result=null;this.map=null;this.zoneEvent=null;this.worldTime=0;this.nextZoneEventAt=0;this.snapshotAge=Infinity;}
  getTier(e){return TIERS.filter(([m])=>e.mass>=m).at(-1);}
  resetSnapshotHistory(){this.targetParts.clear();this.player.parts=[];this.remotePlayers=[];this.bots=[];this.snapshotAge=Infinity;}
  applySnapshot(world,myId){this.snapshotAge=0;const old=new Map([...this.player.parts,...this.remotePlayers,...this.bots].map(part=>[part.id,part]));this.food=applyFoodDelta(this.food,world);this.ejectedFood=world.ejectedFood;this.map=world.map||this.map;this.zoneEvent=world.zoneEvent||null;this.worldTime=world.time||0;this.nextZoneEventAt=world.nextZoneEventAt||0;this.bots=world.bots.map(b=>({...this.interpolate(b,old),player:false}));this.leaderboard=world.players.concat(world.bots);this.round=world.round||this.round;this.events=world.events||[];this.result=world.results?.[myId]||null;const mine=world.players.find(p=>p.id===myId);if(mine){this.player={...mine,parts:mine.parts.map(p=>({...this.interpolate(p,old),avatarMass:mine.mass})),player:true};this.dead=!mine.alive;}this.remotePlayers=world.players.filter(p=>p.id!==myId).flatMap(p=>p.parts.map(part=>({...this.interpolate(part,old),avatarMass:p.mass,player:true})));this.targetParts=new Map([...world.players,...world.bots.map(b=>({parts:[b]}))].flatMap(p=>p.parts.map(part=>[part.id,part])));}
  interpolate(part,old){const previous=old.get(part.id);return previous?{...part,x:previous.x,y:previous.y}: {...part};}
  smooth(dt,input=null){
    dt=Math.max(0,Math.min(dt,.05));this.snapshotAge+=dt;
    const blend=1-Math.exp(-dt*18),correction=1-Math.exp(-dt*6);
    // Predict presentation only. Server snapshots remain the source of mass, hits and death.
    const predict=input&&this.player.alive&&this.player.parts.length===1&&this.snapshotAge<=.25;
    const len=Math.hypot(input?.x||0,input?.y||0)||1;
    for(const part of [...this.player.parts,...this.remotePlayers,...this.bots]){
      const target=this.targetParts.get(part.id);if(!target)continue;
      if(predict&&part===this.player.parts[0]){
        const speed=245/Math.pow(Math.max(1,part.mass/15),.22)*(input.boost?1.7:1);
        const vx=(input.x||0)/len*speed,vy=(input.y||0)/len*speed;
        part.x+=vx*dt;part.y+=vy*dt;
        const lead=Math.min(this.snapshotAge,.15);
        part.x+=(target.x+vx*lead-part.x)*correction;part.y+=(target.y+vy*lead-part.y)*correction;
      }else{part.x+=(target.x-part.x)*blend;part.y+=(target.y-part.y)*blend;}
      const r=radius(part.mass);part.x=Math.max(r,Math.min(WORLD_SIZE-r,part.x));part.y=Math.max(r,Math.min(WORLD_SIZE-r,part.y));
    }
  }
  ranked(){return this.leaderboard.slice().sort((a,b)=>b.mass-a.mass).map(p=>({...p,player:p.id===this.player.id}));}
  leaders(){return this.ranked().slice(0,6);}
  rank(){const rank=this.ranked().findIndex(p=>p.id===this.player.id);return rank < 0 ? null : rank+1;}
}
