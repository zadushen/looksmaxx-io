import { TIERS, WORLD_SIZE, radius } from './arena.js';
import { applyFoodDelta } from './network.js';
export { WORLD_SIZE, radius };
export class Game {
  constructor(){this.player={id:null,name:'Ты',alive:true,x:2500,y:2500,mass:1,kills:0,parts:[]};this.remotePlayers=[];this.bots=[];this.food=[];this.ejectedFood=[];this.dead=false;this.leaderboard=[];this.targetParts=new Map();this.round={number:1,phase:'playing',remaining:null};this.events=[];this.result=null;this.map=null;this.zoneEvent=null;this.worldTime=0;this.nextZoneEventAt=0;}
  getTier(e){return TIERS.filter(([m])=>e.mass>=m).at(-1);}
  applySnapshot(world,myId){const old=new Map([...this.player.parts,...this.remotePlayers,...this.bots].map(part=>[part.id,part]));this.food=applyFoodDelta(this.food,world);this.ejectedFood=world.ejectedFood;this.map=world.map||this.map;this.zoneEvent=world.zoneEvent||null;this.worldTime=world.time||0;this.nextZoneEventAt=world.nextZoneEventAt||0;this.bots=world.bots.map(b=>({...this.interpolate(b,old),player:false}));this.leaderboard=world.players.concat(world.bots);this.round=world.round||this.round;this.events=world.events||[];this.result=world.results?.[myId]||null;const mine=world.players.find(p=>p.id===myId);if(mine){this.player={...mine,parts:mine.parts.map(p=>({...this.interpolate(p,old),avatarMass:mine.mass})),player:true};this.dead=!mine.alive;}this.remotePlayers=world.players.filter(p=>p.id!==myId).flatMap(p=>p.parts.map(part=>({...this.interpolate(part,old),avatarMass:p.mass,player:true})));this.targetParts=new Map([...world.players,...world.bots.map(b=>({parts:[b]}))].flatMap(p=>p.parts.map(part=>[part.id,part])));}
  interpolate(part,old){const previous=old.get(part.id);return previous?{...part,x:previous.x+(part.x-previous.x)*.55,y:previous.y+(part.y-previous.y)*.55}: {...part};}
  smooth(dt){const blend=1-Math.exp(-Math.max(0,Math.min(dt,.1))*18);for(const part of [...this.player.parts,...this.remotePlayers,...this.bots]){const target=this.targetParts.get(part.id);if(target){part.x+=(target.x-part.x)*blend;part.y+=(target.y-part.y)*blend;}}}
  ranked(){return this.leaderboard.slice().sort((a,b)=>b.mass-a.mass).map(p=>({...p,player:p.id===this.player.id}));}
  leaders(){return this.ranked().slice(0,6);}
  rank(){const rank=this.ranked().findIndex(p=>p.id===this.player.id);return rank < 0 ? null : rank+1;}
}
