export const WORLD_SIZE = 5000;
export const START_MASS = 1;
export const TIERS = [
  [0,'sub0','#77706a'],[15,'sub1','#877380'],[35,'sub2','#9a70d6'],[75,'sub3','#8c78db'],[150,'sub4','#7a83df'],[300,'sub5','#5e95ee'],[500,'sub6','#55b5df'],
  [800,'normie','#53c7a7'],[1200,'normie+','#66ca8c'],[2000,'high-tier normie','#d7bf52'],
  [3500,'chadlite','#e6ad54'],[6000,'chadlite+','#ed935e'],[10000,'low chad','#ea7b70'],
  [17000,'chad','#e96373'],[28000,'high chad','#d9588a'],[40000,'gigachad','#f1e7c2'],
  [50000,'gigamogger','#f6d371'],[80000,'apex gigamogger','#f0a651'],[150000,'arena overlord','#e8744c'],[300000,'final boss','#e44f58']
];
export const MAPS = [
  {id:'classic',name:'Классическая арена',description:'Чистая арена: собирай находки и охоться за массой',riskZones:[]}
];
const BOT_NAMES=['JawlineJoe','MewMaster','SigmaSam','AuraMaxxer','RizzKid','Cheekbone','PslGod','BloatLord','MoggerMax','CantMew','TempleKing','Facecard','Orbiter','LateralLord','BrowRaiser','NeckTrainer','Rizzless','HollowCheeks','MouthBreather','HairlineHero','SoftMaxxer','MirrorCheck','BoneStruct','GymCoper'];
const SPLIT_MIN=120, SPLIT_CD=.85, MERGE_AFTER=7, BOOST_MIN=60, BOOST_COST=8, EJECT_VALUE=5, EJECT_LIMIT=150, EJECT_TTL=13, OWNER_PICKUP_DELAY=.9, RESPAWN_AFTER=2, EVENT_INTERVAL=60, EVENT_DURATION=18, EVENT_RADIUS=390, FOID_PICKUP_MASS=75, MAKEUP_PICKUP_MASS=800, STACEY_PICKUP_MASS=3500;
export const ROUND_DURATION=300, ROUND_RESULTS_DURATION=7;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Mass must read as a clear advantage without turning high-tier avatars into a full-screen wall.
export const radius=m=>{const raw=12+Math.sqrt(Math.max(0,m))*1.4;return raw<=450?raw:450+450*(1-Math.exp(-(raw-450)/450));};
export class Arena {
  constructor(random=Math.random,mapIndex=0) { this.random=random;this.mapIndex=mapIndex;this.map=MAPS[this.mapIndex%MAPS.length];this.nextEntityId=1;this.time=0;this.nextZoneEventAt=EVENT_INTERVAL;this.zoneEvent=null;this.players=new Map();this.roundNumber=1;this.roundStartedAt=0;this.roundEndsAt=null;this.roundPhase='playing';this.resultsUntil=0;this.roundResults=new Map();this.events=[];this.nextEventId=1;this.resetWorld(); }
  resetWorld(){this.bots=BOT_NAMES.map((n,i)=>this.makeEntity(n,400+(i*613)%4200,400+(i*997)%4200,160+this.random()*640,'bot'));this.bots.push(this.makeEntity('GIGAMOGGER',4400,4400,50000,'bot'));this.food=Array.from({length:560},()=>this.makeFood());this.ejectedFood=[];}
  makeEntity(name,x,y,mass,kind='player'){return{id:`e${this.nextEntityId++}`,name,x:clamp(x,radius(mass),WORLD_SIZE-radius(mass)),y:clamp(y,radius(mass),WORLD_SIZE-radius(mass)),mass,kind,alive:true,velocity:{x:0,y:0},mergeAt:0};} makeFood(){const roll=this.random(),type=roll<.75?'молоточек':roll<.92?'фоидка':roll<.98?'мейкапцелка':'стейси',food={id:`f${this.nextEntityId++}`,x:80+this.random()*4840,y:80+this.random()*4840,type,value:type==='стейси'?1000:type==='молоточек'?10:type==='мейкапцелка'?250:50};return type==='молоточек'?food:{...food,velocity:{x:0,y:0}};}
  safeSpawn(mass=START_MASS){
    const r=radius(mass),threats=this.livingParts().filter(e=>e.mass>mass*1.22);
    let best={x:2500,y:2500},bestGap=-Infinity;
    const candidates=[best,...Array.from({length:40},()=>({x:r+100+this.random()*(WORLD_SIZE-2*r-200),y:r+100+this.random()*(WORLD_SIZE-2*r-200)}))];
    for(const point of candidates){const gap=Math.min(...threats.map(e=>distance(point,e)-radius(e.mass)-r));if(gap>bestGap){bestGap=gap;best=point;}if(gap>350)return point;}
    return best;
  }
  addPlayer(id,name='Игрок'){const spawn=this.safeSpawn(START_MASS);const core=this.makeEntity(name,spawn.x,spawn.y,START_MASS);const p={id,name,alive:true,parts:[core],x:core.x,y:core.y,mass:core.mass,kills:0,input:{x:0,y:0,boost:false},speedMultiplier:1,splitReadyAt:0,ejectCarry:0,respawnAt:0};this.players.set(id,p);return p;} removePlayer(id){this.players.delete(id);}
  setInput(id,input={}){const p=this.players.get(id);if(!p)return;if(typeof input.name==='string'){p.name=input.name.trim().slice(0,14)||'Игрок';p.parts.forEach(part=>part.name=p.name);}const x=Number(input.x),y=Number(input.y);if(Number.isFinite(x)&&Number.isFinite(y)){const len=Math.hypot(x,y);p.input.x=len>1?x/len:x;p.input.y=len>1?y/len:y;}p.input.boost=Boolean(input.boost);}
  grow(id,amount=25){const p=this.players.get(id);if(!p||!p.alive)return false;const part=p.parts.reduce((a,b)=>a.mass>b.mass?a:b);part.mass+=amount;this.syncPlayer(p);return true;}
  speedUp(id){const p=this.players.get(id);if(!p)return false;p.speedMultiplier+=.5;return true;}
  split(id){const p=this.players.get(id);if(!p||!p.alive||this.time<p.splitReadyAt||p.parts.length>=2||p.mass<SPLIT_MIN)return false;const source=p.parts.reduce((a,b)=>a.mass>b.mass?a:b),{x,y}=p.input,len=Math.hypot(x,y)||1,ux=(x||1)/len,uy=y/len,half=source.mass/2,gap=radius(half)*2.1;source.mass=half;source.mergeAt=this.time+MERGE_AFTER;const launched=this.makeEntity(p.name,clamp(source.x+ux*gap,radius(half),WORLD_SIZE-radius(half)),clamp(source.y+uy*gap,radius(half),WORLD_SIZE-radius(half)),half);launched.mergeAt=source.mergeAt;launched.velocity={x:ux*620,y:uy*620};p.parts.push(launched);p.splitReadyAt=this.time+SPLIT_CD;this.syncPlayer(p);return true;}
  update(dt){dt=Math.min(Math.max(dt,0),.05);this.time+=dt;if(this.roundPhase==='results'){if(this.time>=this.resultsUntil)this.startRound();return;}if(this.roundEndsAt!==null&&this.time>=this.roundEndsAt){this.finishRound();return;}this.updateZoneEvent();this.updateEjectedFood(dt);for(const p of this.players.values()){if(!p.alive){if(this.time>=p.respawnAt)this.respawn(p);continue;}this.updatePlayer(p,dt);}const parts=this.livingParts();for(const b of this.bots)this.updateBot(b,dt,parts);const entities=this.livingParts();this.updateSkittishFood(dt,entities);this.applyZoneEffects(entities,dt);for(const e of entities)this.collectFood(e);this.resolveEating(entities);for(const p of this.players.values())if(p.alive){this.mergePlayer(p);this.syncPlayer(p);}this.bots=this.bots.filter(b=>b.alive);this.bots.forEach(b=>this.boundEntity(b));while(this.bots.length<BOT_NAMES.length)this.bots.push(this.makeEntity(BOT_NAMES.find(name=>!this.bots.some(bot=>bot.name===name))||`Bot${this.nextEntityId}`,this.random()*WORLD_SIZE,this.random()*WORLD_SIZE,14+this.random()*80,'bot'));}
  updateZoneEvent(){if(this.zoneEvent&&this.time>=this.zoneEvent.endsAt)this.zoneEvent=null;if(this.time>=this.nextZoneEventAt){this.zoneEvent={id:`zone-${this.nextEntityId++}`,kind:'bonus',x:700+this.random()*3600,y:700+this.random()*3600,radius:EVENT_RADIUS,endsAt:this.time+EVENT_DURATION};this.nextZoneEventAt+=EVENT_INTERVAL;}}
  applyZoneEffects(entities,dt){for(const entity of entities)if(this.zoneEvent&&distance(entity,this.zoneEvent)<this.zoneEvent.radius)entity.mass+=dt*2.5;}
  livingParts(){return[...this.players.values()].flatMap(p=>p.alive?p.parts:[]).concat(this.bots).filter(e=>e.alive);} move(e,dx,dy,dt,multi=1){const len=Math.hypot(dx,dy)||1,speed=245/Math.pow(Math.max(1,e.mass/15),.22)*multi;e.x=clamp(e.x+(dx/len*speed+e.velocity.x)*dt,radius(e.mass),WORLD_SIZE-radius(e.mass));e.y=clamp(e.y+(dy/len*speed+e.velocity.y)*dt,radius(e.mass),WORLD_SIZE-radius(e.mass));e.velocity.x*=Math.pow(.012,dt);e.velocity.y*=Math.pow(.012,dt);}
  updatePlayer(p,dt){const{x,y,boost}=p.input;if(boost&&p.mass>BOOST_MIN){const lost=this.drain(p,Math.min(BOOST_COST*dt,p.mass-BOOST_MIN));this.ejectMass(p,lost,x,y);}p.parts.forEach(part=>this.move(part,x,y,dt,(boost?1.7:1)*p.speedMultiplier));} drain(p,amount){let left=amount,taken=0;[...p.parts].sort((a,b)=>b.mass-a.mass).forEach(part=>{const take=Math.min(left,part.mass);part.mass-=take;left-=take;taken+=take;});return taken;}
  ejectMass(p,amount,dx,dy){if(!amount)return;p.ejectCarry+=amount;const len=Math.hypot(dx,dy)||1,ux=(dx||1)/len,uy=dy/len;while(p.ejectCarry>=EJECT_VALUE){p.ejectCarry-=EJECT_VALUE;const owner=p.parts.reduce((a,b)=>a.mass>b.mass?a:b),r=radius(owner.mass),spread=(this.random()-.5)*.34,cos=Math.cos(spread),sin=Math.sin(spread),ex=ux*cos-uy*sin,ey=ux*sin+uy*cos;this.ejectedFood.push({id:`j${this.nextEntityId++}`,x:clamp(owner.x+ex*(r+15),8,WORLD_SIZE-8),y:clamp(owner.y+ey*(r+15),8,WORLD_SIZE-8),type:'выброшенная масса',value:EJECT_VALUE,ownerId:owner.id,ownerLockedUntil:this.time+OWNER_PICKUP_DELAY,ttl:EJECT_TTL,velocity:{x:ex*(150+this.random()*55),y:ey*(150+this.random()*55)}});if(this.ejectedFood.length>EJECT_LIMIT)this.ejectedFood.shift();}}
  updateEjectedFood(dt){for(let i=this.ejectedFood.length-1;i>=0;i--){const f=this.ejectedFood[i];f.ttl-=dt;f.x=clamp(f.x+f.velocity.x*dt,8,WORLD_SIZE-8);f.y=clamp(f.y+f.velocity.y*dt,8,WORLD_SIZE-8);f.velocity.x*=Math.pow(.02,dt);f.velocity.y*=Math.pow(.02,dt);if(f.ttl<=0)this.ejectedFood.splice(i,1);}}
  updateSkittishFood(dt,entities){for(const food of this.food){if(food.type!=='фоидка'&&food.type!=='мейкапцелка'&&food.type!=='стейси')continue;const threat=entities.reduce((closest,entity)=>!closest||distance(food,entity)<distance(food,closest)?entity:closest,null);if(!threat)continue;const d=distance(food,threat);if(d>115)continue;const strength=(1-d/115)*46,dx=(food.x-threat.x)/(d||1),dy=(food.y-threat.y)/(d||1);food.velocity.x=(food.velocity.x||0)*.52+dx*strength;food.velocity.y=(food.velocity.y||0)*.52+dy*strength;const speed=Math.hypot(food.velocity.x,food.velocity.y);if(speed>55){food.velocity.x=food.velocity.x/speed*55;food.velocity.y=food.velocity.y/speed*55;}food.x=clamp(food.x+food.velocity.x*dt,12,WORLD_SIZE-12);food.y=clamp(food.y+food.velocity.y*dt,12,WORLD_SIZE-12);}}
  canCollectFood(entity, food) {
    const minimum={'фоидка':FOID_PICKUP_MASS,'мейкапцелка':MAKEUP_PICKUP_MASS,'стейси':STACEY_PICKUP_MASS};
    return entity.mass >= (minimum[food.type] || 0);
  }
  updateBot(bot,dt,entities) {
    if(!bot.alive)return;
    const gap=e=>distance(bot,e)-radius(bot.mass)-radius(e.mass||1);
    const nearest=items=>items.reduce((best,e)=>!best||gap(e)<gap(best)?e:best,null);
    const threats=entities.filter(e=>e!==bot&&e.alive&&e.mass>bot.mass*1.22);
    const remembered=threats.find(e=>e.id===bot.dangerId);
    const danger=remembered&&gap(remembered)<560?remembered:nearest(threats);
    let target;
    if(danger&&gap(danger)<(bot.dangerId===danger.id?560:420)){
      bot.dangerId=danger.id;
      let dx=bot.x-danger.x,dy=bot.y-danger.y;
      const length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
      const margin=radius(bot.mass)+60;
      // Slide along walls instead of alternating between escape and wall correction.
      if(bot.x<margin&&dx<0||bot.x>WORLD_SIZE-margin&&dx>0){dx=0;dy=Math.abs(dy)>.15?Math.sign(dy):(bot.y<WORLD_SIZE/2?1:-1);}
      if(bot.y<margin&&dy<0||bot.y>WORLD_SIZE-margin&&dy>0){dy=0;dx=Math.abs(dx)>.15?Math.sign(dx):(bot.x<WORLD_SIZE/2?1:-1);}
      if(!dx&&!dy){dx=WORLD_SIZE/2-bot.x;dy=WORLD_SIZE/2-bot.y;}
      target={x:bot.x+dx*500,y:bot.y+dy*500};
      bot.targetId=null;
    }else{
      bot.dangerId=null;
      const prey=entities.filter(e=>e!==bot&&e.alive&&bot.mass>e.mass*1.22&&gap(e)<400);
      const botRadius=radius(bot.mass);
      const reachable=f=>{const point={x:clamp(f.x,botRadius,WORLD_SIZE-botRadius),y:clamp(f.y,botRadius,WORLD_SIZE-botRadius)};const pickup=f.type==='стейси'?92:f.type==='мейкапцелка'?62:f.type==='фоидка'?18:10;return distance(point,f)<botRadius+pickup;};
      const food=this.food.filter(f=>this.canCollectFood(bot,f)&&reachable(f));
      const candidates=prey.length?prey:[...this.ejectedFood.filter(f=>gap(f)<500),...food];
      const held=candidates.find(e=>e.id===bot.targetId);
      target=held&&this.time<(bot.targetUntil||0)?held:nearest(candidates);
      if(target&&target.id!==bot.targetId){bot.targetId=target.id;bot.targetUntil=this.time+.8;}
    }
    if(!target){bot.targetId=null;target=bot.wanderTarget;if(!target||distance(bot,target)<80){target={x:500+this.random()*4000,y:500+this.random()*4000};bot.wanderTarget=target;}}
    const dx=target.x-bot.x,dy=target.y-bot.y,len=Math.hypot(dx,dy)||1;
    const blend=1-Math.exp(-dt*(danger&&gap(danger)<420?14:7));
    bot.steering ||= {x:dx/len,y:dy/len};
    bot.steering.x+=(dx/len-bot.steering.x)*blend;
    bot.steering.y+=(dy/len-bot.steering.y)*blend;
    this.move(bot,bot.steering.x,bot.steering.y,dt);
  }
  collectFood(e){for(let i=this.food.length-1;i>=0;i--){const food=this.food[i],pickupRadius=food.type==='стейси'?92:food.type==='мейкапцелка'?62:food.type==='фоидка'?18:10;if(!this.canCollectFood(e,food))continue;if(distance(e,food)<radius(e.mass)+pickupRadius){e.mass+=food.value;this.food[i]=this.makeFood();}}for(let i=this.ejectedFood.length-1;i>=0;i--){const f=this.ejectedFood[i];if(e.id===f.ownerId&&this.time<f.ownerLockedUntil)continue;if(distance(e,f)<radius(e.mass)+5){e.mass+=f.value;this.ejectedFood.splice(i,1);}}}
  resolveEating(entities){entities.forEach((a,i)=>entities.slice(i+1).forEach(b=>{if(!a.alive||!b.alive||this.time<(a.protectedUntil||0)||this.time<(b.protectedUntil||0))return;const ownerA=this.ownerOf(a),ownerB=this.ownerOf(b);if(ownerA&&ownerA===ownerB)return;const big=a.mass>b.mass?a:b,small=big===a?b:a;if(big.mass>small.mass*1.22&&distance(a,b)<radius(big.mass)-radius(small.mass)*.22){big.mass+=small.mass*.7;small.alive=false;const victim=this.ownerOf(small),killer=this.ownerOf(big);if(victim)this.kill(victim,killer);}}));} ownerOf(part){for(const p of this.players.values())if(p.parts.includes(part))return p;return null;} kill(p,killer){if(!p.alive)return;p.alive=false;p.parts.forEach(part=>part.alive=false);p.parts=[];p.respawnAt=this.time+RESPAWN_AFTER;if(killer){killer.kills++;this.addEvent('kill',{killerId:killer.id,killerName:killer.name,victimId:p.id,victimName:p.name});}else this.addEvent('death',{victimId:p.id,victimName:p.name});} respawn(p){const spawn=this.safeSpawn();const core=this.makeEntity(p.name,spawn.x,spawn.y,START_MASS);core.protectedUntil=this.time+1.5;p.parts=[core];p.alive=true;p.respawnAt=0;this.syncPlayer(p);}
  mergePlayer(p){if(p.parts.length<2||this.time<Math.max(...p.parts.map(part=>part.mergeAt)))return;const total=p.parts.reduce((s,part)=>s+part.mass,0),x=p.parts.reduce((s,part)=>s+part.x*part.mass,0)/total,y=p.parts.reduce((s,part)=>s+part.y*part.mass,0)/total;p.parts=[this.makeEntity(p.name,x,y,total)];} boundEntity(e){const r=radius(e.mass);e.x=clamp(e.x,r,WORLD_SIZE-r);e.y=clamp(e.y,r,WORLD_SIZE-r);} syncPlayer(p){p.parts.forEach(part=>this.boundEntity(part));const total=p.parts.reduce((s,part)=>s+part.mass,0)||1;p.mass=total;p.x=p.parts.reduce((s,part)=>s+part.x*part.mass,0)/total;p.y=p.parts.reduce((s,part)=>s+part.y*part.mass,0)/total;}
  addEvent(type,data){this.events.push({id:this.nextEventId++,type,...data});if(this.events.length>40)this.events.shift();}
  finishRound(){const ranked=this.ranked();this.roundResults=new Map([...this.players.values()].map(p=>{const place=ranked.findIndex(e=>e.id===p.id)+1;return[p.id,{place,mass:Math.floor(p.mass),kills:p.kills,won:place===1}];}));this.roundPhase='results';this.resultsUntil=this.time+ROUND_RESULTS_DURATION;}
  startRound(){this.roundNumber++;this.mapIndex++;this.map=MAPS[this.mapIndex%MAPS.length];this.roundPhase='playing';this.roundStartedAt=this.time;this.roundEndsAt=null;this.roundResults.clear();this.events=[];this.zoneEvent=null;this.nextZoneEventAt=this.time+EVENT_INTERVAL;this.resetWorld();for(const p of this.players.values()){p.kills=0;p.input={x:0,y:0,boost:false};p.speedMultiplier=1;p.splitReadyAt=0;p.ejectCarry=0;p.respawnAt=0;const core=this.makeEntity(p.name,400+this.random()*4200,400+this.random()*4200,START_MASS);p.parts=[core];p.alive=true;this.syncPlayer(p);}}
  ranked(){return[...this.players.values(),...this.bots].sort((a,b)=>b.mass-a.mass);}
  snapshot(){const player=p=>({id:p.id,name:p.name,alive:p.alive,mass:p.mass,x:p.x,y:p.y,kills:p.kills,parts:p.parts.map(({id,name,x,y,mass,alive,protectedUntil})=>({id,name,x,y,mass,alive,protectedUntil,player:true}))});const zoneEvent=this.zoneEvent&&{id:this.zoneEvent.id,kind:this.zoneEvent.kind,x:this.zoneEvent.x,y:this.zoneEvent.y,radius:this.zoneEvent.radius,endsAt:this.zoneEvent.endsAt};const food=({id,x,y,type,value,velocity})=>({id,x,y,type,value,velocity});const remaining=this.roundPhase==='playing'&&this.roundEndsAt===null?null:Math.max(0,(this.roundPhase==='playing'?this.roundEndsAt:this.resultsUntil)-this.time);return{type:'world',time:this.time,map:this.map,zoneEvent,nextZoneEventAt:this.nextZoneEventAt,round:{number:this.roundNumber,phase:this.roundPhase,remaining},players:[...this.players.values()].map(player),bots:this.bots.map(({id,name,x,y,mass,alive})=>({id,name,x,y,mass,alive})),food:this.food.map(food),ejectedFood:this.ejectedFood.map(({id,x,y,type,value})=>({id,x,y,type,value})),events:this.events,results:Object.fromEntries(this.roundResults)};}
}
