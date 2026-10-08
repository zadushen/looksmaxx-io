import { WORLD_SIZE, radius } from './game.js';
import { TIERS } from './arena.js';
const AVATARS = Object.fromEntries(TIERS.map(([,name,color],index)=>[name,[color,'✦',index]]));
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const formatTier = tier => tier.replace(/^sub(\d+)$/i, 'SUB $1').toUpperCase();
export class UI {
  constructor(game, canvas) { this.game = game; this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.mass = document.querySelector('#mass'); this.tier = document.querySelector('#tier'); this.leaders = document.querySelector('#leaders'); this.over = document.querySelector('#game-over'); this.finalMass = document.querySelector('#final-mass'); this.finalKills = document.querySelector('#final-kills'); this.finalPlace = document.querySelector('#final-place'); this.resultTitle = document.querySelector('#result-title'); this.resultCopy = document.querySelector('#result-copy'); this.respawnCopy = document.querySelector('#respawn-copy'); this.lastTier = null; this.shownResultRound = null; this.avatarAtlas = new Image(); this.avatarAtlas.src = './public/assets/avatar-evolution-v2.png'; this.makeupSprite = new Image(); this.makeupSprite.src = './public/assets/makeupcelka-avatar.png'; this.foidSprite = new Image(); this.foidSprite.src = './public/assets/foidka-avatar.png'; this.staceySprite = new Image(); this.staceySprite.src = './public/assets/stacey-avatar.png'; this.hammerSprite = new Image(); this.hammerSprite.src = './public/assets/hammer-avatar.png'; }
  resize() { this.canvas.width = innerWidth * devicePixelRatio; this.canvas.height = innerHeight * devicePixelRatio; this.canvas.style.width = `${innerWidth}px`; this.canvas.style.height = `${innerHeight}px`; this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }
  render() { const { ctx, game } = this; const width = innerWidth, height = innerHeight, player = game.player,zoom=this.updateCamera(width,height),viewWidth=width/zoom,viewHeight=height/zoom,camera={x:this.cameraFocus.x-viewWidth/2,y:this.cameraFocus.y-viewHeight/2};this.zoom=zoom;this.pendingLabels=[];this.viewWidth=viewWidth;this.viewHeight=viewHeight;ctx.clearRect(0,0,width,height);ctx.save();ctx.scale(zoom,zoom);this.drawGrid(camera,viewWidth,viewHeight);this.drawZones(camera);game.food.forEach(item=>this.drawFood(item,camera));game.ejectedFood.forEach(item=>this.drawFood(item,camera));[...game.bots,...game.remotePlayers,...player.parts].filter(e=>e.alive).sort((a,b)=>a.mass-b.mass).forEach(e=>this.drawEntity(e,camera));const occupied=[];const localIds=new Set(player.parts.map(part=>part.id));this.pendingLabels.sort((a,b)=>Number(localIds.has(b.entity.id))-Number(localIds.has(a.entity.id))||b.r-a.r).forEach(label=>this.drawEntityLabel(label,occupied));this.pendingLabels=null;ctx.restore();this.drawMinimap();this.updateHUD(); }
  updateCamera(width,height,now=performance.now()) {
    const player=this.game.player,parts=player.parts.length?player.parts:[player];
    const left=Math.min(...parts.map(p=>p.x-Math.max(28,radius(p.mass)))),right=Math.max(...parts.map(p=>p.x+Math.max(28,radius(p.mass))));
    const top=Math.min(...parts.map(p=>p.y-Math.max(28,radius(p.mass)))),bottom=Math.max(...parts.map(p=>p.y+Math.max(28,radius(p.mass))));
    const focus={x:(left+right)/2,y:(top+bottom)/2};
    const target=Math.max(.005,Math.min(1,110/Math.max(28,radius(player.mass)),width*.7/(right-left),height*.55/(bottom-top)));
    const dt=this.cameraTime===undefined?0:Math.min(.1,Math.max(0,(now-this.cameraTime)/1000));this.cameraTime=now;
    const blend=1-Math.exp(-dt*4);
    this.zoom=this.zoom===undefined?target:this.zoom+(target-this.zoom)*blend;
    this.cameraFocus ||= focus;
    // Track the player immediately; smooth the scale so steering stays responsive.
    this.cameraFocus=focus;
    return this.zoom;
  }
  drawZones(camera){const {ctx,game}=this,zone=(z,color,label)=>{const x=z.x-camera.x,y=z.y-camera.y;ctx.save();ctx.fillStyle=`${color}20`;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash([11,8]);ctx.beginPath();ctx.arc(x,y,z.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillStyle=color;ctx.shadowColor='#000';ctx.shadowBlur=6;ctx.fillText(label,x,y+4);ctx.restore();};game.map?.riskZones?.forEach(z=>zone(z,'#f05d70','РИСК'));if(game.zoneEvent)zone(game.zoneEvent,game.zoneEvent.kind==='danger'?'#ff6078':'#78ef9a',game.zoneEvent.kind==='danger'?'ОПАСНОСТЬ':'ВЫГОДА');}
  drawGrid(camera, width, height) { const {ctx}=this;ctx.fillStyle='#4b4a42';ctx.fillRect(0,0,width,height);const step=180;ctx.strokeStyle='#77756a';ctx.lineWidth=1;for(let x=(-camera.x%step)-step;x<width+step;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke()}for(let y=(-camera.y%step)-step;y<height+step;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}ctx.strokeStyle='#cbc4b1';ctx.lineWidth=3;const major=step*3;for(let x=(-camera.x%major)-major;x<width+major;x+=major){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke()}for(let y=(-camera.y%major)-major;y<height+major;y+=major){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()} }
  drawFood(item, camera) { const {ctx}=this,x=item.x-camera.x,y=item.y-camera.y,ejected=item.type==='выброшенная масса',makeup=item.type==='мейкапцелка',stacey=item.type==='стейси',hammer=item.type==='молоточек',s=ejected?7:stacey?102:makeup?68:hammer?11:23;if(x < -s-4 || x > this.viewWidth+s+4 || y < -s-4 || y > this.viewHeight+s+4)return;ctx.save();ctx.translate(x,y);
    if(ejected){ctx.fillStyle='#262520';ctx.beginPath();ctx.arc(0,0,s+2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b88752';ctx.beginPath();ctx.arc(0,0,s,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff88';ctx.beginPath();ctx.arc(-2,-2,s*.48,Math.PI*1.12,Math.PI*1.86);ctx.lineWidth=2;ctx.stroke();ctx.restore();return;}
    if(hammer){ctx.fillStyle='#24231f';ctx.beginPath();ctx.arc(0,0,s+3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d8d1c1';ctx.beginPath();ctx.arc(0,0,s,0,Math.PI*2);ctx.fill();if(this.hammerSprite.complete&&this.hammerSprite.naturalWidth){ctx.save();ctx.beginPath();ctx.arc(0,0,s-2,0,Math.PI*2);ctx.clip();ctx.drawImage(this.hammerSprite,-s,-s,s*2,s*2);ctx.restore();ctx.restore();return;}ctx.save();ctx.rotate(-.58);ctx.fillStyle='#282824';ctx.fillRect(-3,-2,6,15);ctx.fillStyle='#9a6b47';ctx.fillRect(-1.5,-1,3,13);ctx.fillStyle='#c79260';ctx.fillRect(-.6,0,1.2,10);ctx.fillStyle='#24231f';ctx.beginPath();ctx.moveTo(-8,-9);ctx.lineTo(8,-9);ctx.lineTo(9,-4);ctx.lineTo(4,-2);ctx.lineTo(-7,-3);ctx.closePath();ctx.fill();ctx.fillStyle='#8e918e';ctx.beginPath();ctx.moveTo(-6.5,-7.5);ctx.lineTo(6.5,-7.5);ctx.lineTo(7,-5);ctx.lineTo(3.5,-3.8);ctx.lineTo(-6,-4.8);ctx.closePath();ctx.fill();ctx.fillStyle='#c7c8c1';ctx.fillRect(-4.5,-7,7,1.1);ctx.restore();ctx.restore();return;}
    const foodAvatar=stacey?this.staceySprite:makeup?this.makeupSprite:this.foidSprite;if(foodAvatar?.complete&&foodAvatar.naturalWidth){ctx.fillStyle='#171a20';ctx.beginPath();ctx.arc(0,0,s+3,0,Math.PI*2);ctx.fill();ctx.save();ctx.beginPath();ctx.arc(0,0,s-3,0,Math.PI*2);ctx.clip();ctx.drawImage(foodAvatar,-s,-s,s*2,s*2);ctx.restore();ctx.restore();return;}
    // Every pickup is a simple in-world emblem, not a miniature generated portrait.
    const ink='#171a20',paper='#f2eddf',accent=stacey?'#ffcb45':makeup?'#ff5c66':'#a982dc';ctx.fillStyle=ink;ctx.beginPath();ctx.arc(0,0,s+3,0,Math.PI*2);ctx.fill();ctx.fillStyle=paper;ctx.beginPath();ctx.arc(0,0,s,0,Math.PI*2);ctx.fill();ctx.save();ctx.beginPath();ctx.arc(0,0,s-3,0,Math.PI*2);ctx.clip();ctx.fillStyle=accent;ctx.fillRect(-s,-s,s*2,s*2);
    if(stacey){ctx.fillStyle=paper;ctx.beginPath();ctx.moveTo(-s*.57,s*.28);ctx.lineTo(-s*.57,-s*.25);ctx.lineTo(-s*.27,-s*.02);ctx.lineTo(0,-s*.5);ctx.lineTo(s*.27,-s*.02);ctx.lineTo(s*.57,-s*.25);ctx.lineTo(s*.57,s*.28);ctx.closePath();ctx.fill();ctx.fillStyle=ink;ctx.fillRect(-s*.42,s*.33,s*.84,s*.14);}
    else if(makeup){ctx.fillStyle=paper;ctx.beginPath();ctx.arc(0,0,s*.43,0,Math.PI*2);ctx.fill();ctx.fillStyle=ink;ctx.beginPath();ctx.arc(0,0,s*.25,0,Math.PI*2);ctx.fill();ctx.fillStyle=paper;ctx.fillRect(-s*.07,-s*.63,s*.14,s*.55);ctx.fillRect(-s*.24,-s*.63,s*.48,s*.14);}
    else {ctx.fillStyle=paper;ctx.beginPath();ctx.moveTo(0,-s*.57);ctx.lineTo(s*.46,0);ctx.lineTo(0,s*.57);ctx.lineTo(-s*.46,0);ctx.closePath();ctx.fill();ctx.fillStyle=ink;ctx.beginPath();ctx.arc(0,0,s*.16,0,Math.PI*2);ctx.fill();}
    ctx.restore();ctx.restore();return; }
  drawAvatarEmblem(tierIndex, avatarIndex, r, base, mark) { const {ctx}=this, ink='#201f1b', paper='#f2eddf', accent=['#d85955','#e69245','#d9c453','#7fb75a','#4fa6a0','#5b89d4','#9b6fc7'][avatarIndex];
    ctx.fillStyle=base;ctx.fillRect(-r,-r,2*r,2*r);ctx.fillStyle='#00000016';for(let i=-r*2;i<r*2;i+=r*.35){ctx.fillRect(i,-r,r*.08,2*r)}
    ctx.save();ctx.scale(r/36,r/36);ctx.strokeStyle=paper;ctx.fillStyle=paper;ctx.lineWidth=3.2;ctx.lineJoin='miter';
    // Seven deliberately graphic "club marks" make players recognisable at a glance, without pretending to be portraits.
    if(avatarIndex===0){ctx.beginPath();ctx.moveTo(-25,-16);ctx.lineTo(-9,-25);ctx.lineTo(25,16);ctx.lineTo(9,25);ctx.closePath();ctx.fill();ctx.fillStyle=accent;ctx.fillRect(-6,-23,12,46)}
    if(avatarIndex===1){ctx.strokeStyle=paper;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,2,19,Math.PI*.95,Math.PI*2.05);ctx.stroke();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,-13,5,0,Math.PI*2);ctx.fill()}
    if(avatarIndex===2){ctx.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;const px=Math.cos(a)*22,py=Math.sin(a)*22;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.stroke();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill()}
    if(avatarIndex===3){ctx.beginPath();ctx.moveTo(-24,-17);ctx.lineTo(0,3);ctx.lineTo(24,-17);ctx.lineTo(24,-4);ctx.lineTo(0,17);ctx.lineTo(-24,-4);ctx.closePath();ctx.fill();ctx.fillStyle=accent;ctx.fillRect(-4,-24,8,48)}
    if(avatarIndex===4){ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,19,0,Math.PI*2);ctx.stroke();ctx.fillStyle=accent;ctx.beginPath();ctx.arc(18,0,5,0,Math.PI*2);ctx.arc(-18,0,5,0,Math.PI*2);ctx.fill()}
    if(avatarIndex===5){ctx.fillStyle=paper;ctx.beginPath();ctx.moveTo(-18,-23);ctx.lineTo(20,-15);ctx.lineTo(8,0);ctx.lineTo(20,15);ctx.lineTo(-18,23);ctx.closePath();ctx.fill();ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-14,-12);ctx.lineTo(10,-7);ctx.lineTo(1,0);ctx.lineTo(10,7);ctx.lineTo(-14,12);ctx.closePath();ctx.fill()}
    if(avatarIndex===6){ctx.fillStyle=paper;ctx.fillRect(-5,-24,10,48);ctx.fillRect(-24,-5,48,10);ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill()}
    ctx.fillStyle=ink;ctx.font='900 13px system-ui';ctx.textAlign='center';ctx.fillText(mark,0,5);if(tierIndex>4){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,28,0,Math.PI*2);ctx.stroke()}ctx.restore(); }
  drawPortraitAvatar(tierIndex, r) {
    const sheet = this.avatarAtlas;
    if (!sheet.complete || !sheet.naturalWidth || tierIndex < 0 || tierIndex >= TIERS.length) return false;
    const cellWidth=sheet.naturalWidth/5,cellHeight=sheet.naturalHeight/4;
    const size=Math.min(cellWidth,cellHeight)*.84;
    const x=(tierIndex%5)*cellWidth+(cellWidth-size)/2;
    const y=Math.floor(tierIndex/5)*cellHeight+(cellHeight-size)/2;
    this.ctx.drawImage(sheet,x,y,size,size,-r,-r,r*2,r*2);
    return true;
  }
  drawEntity(entity, camera) { const {ctx}=this,r=Math.max(28,radius(entity.mass)),x=entity.x-camera.x,y=entity.y-camera.y;if(x < -r-8 || x > this.viewWidth+r+8 || y < -r-28 || y > this.viewHeight+r+28)return;const [,tier,color]=this.game.getTier({mass:entity.avatarMass??entity.mass}),[base,mark,tierIndex]=AVATARS[tier],avatarIndex=tierIndex%7;ctx.save();ctx.translate(x,y);ctx.fillStyle='#1a1916';ctx.beginPath();ctx.arc(0,0,r+3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101722';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();if((entity.protectedUntil||0)>this.game.worldTime){ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r+9,0,Math.PI*2);ctx.stroke();}ctx.save();ctx.beginPath();ctx.arc(0,0,r-2,0,Math.PI*2);ctx.clip();if(!this.drawPortraitAvatar(tierIndex,r,base))this.drawAvatarEmblem(tierIndex,avatarIndex,r,base,mark);ctx.restore();ctx.strokeStyle=entity.player?'#b8f63c':base;ctx.lineWidth=entity.player?2.5:2;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.restore();
    // Each tier has its own ring and rank badge, even when it shares a base portrait.
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r+5,0,Math.PI*2);ctx.stroke();
    const badgeZoom=this.zoom||1;
    if(r*badgeZoom>=18){const badgeRadius=12/badgeZoom,badgeY=r-3/badgeZoom;ctx.fillStyle='#101722';ctx.beginPath();ctx.arc(0,badgeY,badgeRadius,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.font=`900 ${11/badgeZoom}px system-ui`;ctx.textAlign='center';ctx.fillText(String(tierIndex+1),0,badgeY+4/badgeZoom);}
    ctx.restore();
    const label={entity,x,y,r,tier,color};
    if(this.pendingLabels)this.pendingLabels.push(label);else this.drawEntityLabel(label,[]);
  }
  drawEntityLabel({entity,x,y,r,tier,color}, occupied) {
    const {ctx}=this,zoom=this.zoom||1;
    const fontSize=Math.max(11/zoom,Math.min(20/zoom,r*.31));
    ctx.save();ctx.textAlign='center';ctx.font=`700 ${fontSize}px system-ui`;
    const nameWidth=ctx.measureText(entity.name).width;
    const tierSize=10/zoom;
    ctx.font=`800 ${tierSize}px system-ui`;
    const width=Math.max(nameWidth,ctx.measureText(formatTier(tier)).width)+12/zoom;
    const height=fontSize+tierSize+12/zoom;
    const rect={left:x-width/2,right:x+width/2,top:y-r-height-10/zoom,bottom:y-r-6/zoom};
    if(occupied.some(box=>rect.left<box.right&&rect.right>box.left&&rect.top<box.bottom&&rect.bottom>box.top)){ctx.restore();return;}
    occupied.push(rect);
    ctx.fillStyle='#101722df';ctx.fillRect(rect.left,rect.top,width,height);
    ctx.font=`700 ${fontSize}px system-ui`;ctx.fillStyle='#edf4fa';ctx.fillText(entity.name,x,rect.top+fontSize+2/zoom);
    ctx.font=`800 ${tierSize}px system-ui`;ctx.fillStyle=color;ctx.fillText(formatTier(tier),x,rect.bottom-3/zoom);
    ctx.restore();
  }
  drawMinimap() { const {ctx,game}=this,size=Math.min(innerHeight<=450?64:130,innerWidth*.28),x=innerWidth-size-22,y=innerHeight-size-((innerWidth<=600||innerHeight<=450||(typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches))?116:90);ctx.fillStyle='#080a08';ctx.fillRect(x,y,size,size);ctx.strokeStyle='#f5f5e9';ctx.lineWidth=3;ctx.strokeRect(x,y,size,size);const dot=e=>{ctx.fillStyle=e.player?'#b6ff32':'#ffd23f';ctx.fillRect(x+e.x/WORLD_SIZE*size-2,y+e.y/WORLD_SIZE*size-2,4,4)};game.bots.forEach(dot);game.remotePlayers.forEach(dot);game.player.parts.forEach(dot); }
  updateHUD() { const { game }=this;const [,name,color]=game.getTier(game.player);const massHTML=`Масса <b>${Math.floor(game.player.mass)}</b>`;if(massHTML!==this.massHTML){this.mass.innerHTML=massHTML;this.massHTML=massHTML;}if(name!==this.lastTier){this.tier.textContent=formatTier(name);this.tier.style.color=color;}if(this.lastLeaderboard!==game.leaderboard){this.lastLeaderboard=game.leaderboard;const leadersHTML=game.leaders().map((e,i)=>`<li class="${e.player?'you':''}"><b>${i+1}</b> <span class="leader-name" title="${escapeHTML(e.name)}">${escapeHTML(e.name)}</span> <span class="leader-mass">${Math.floor(e.mass)}</span></li>`).join('');if(leadersHTML!==this.leadersHTML){this.leaders.innerHTML=leadersHTML;this.leadersHTML=leadersHTML;}}
    if(this.lastTier!==null&&this.lastTier!==name){this.tier.classList.remove('tier-up');void this.tier.offsetWidth;this.tier.classList.add('tier-up');}
    this.lastTier=name;
    if(game.round.phase==='results'&&game.result&&this.shownResultRound!==game.round.number){const result=game.result;this.shownResultRound=game.round.number;this.finalMass.textContent=result.mass;this.finalKills.textContent=result.kills;this.finalPlace.textContent=`#${result.place}`;this.resultTitle.textContent=result.won?'ПОБЕДА — ТЫ #1':'Раунд завершён';this.resultCopy.textContent=result.won?'Ты занял первое место.':'Твоя позиция в этом раунде.';this.respawnCopy.textContent='Следующий раунд начнётся через несколько секунд.';this.over.hidden=false;}
    if(game.round.phase==='playing'&&this.shownResultRound!==null&&game.round.number>this.shownResultRound)this.over.hidden=true;
  }
}
