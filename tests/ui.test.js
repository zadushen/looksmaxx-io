import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UI } from '../src/ui.js';
import { radius as radiusForAudit, TIERS } from '../src/arena.js';
import { browserHarness } from './helpers/browser.js';

function setup(options) {
  const h = browserHarness(options);
  const saved = Object.fromEntries(['document', 'Image', 'innerWidth', 'innerHeight', 'devicePixelRatio'].map(key => [key, globalThis[key]]));
  for (const key of Object.keys(saved)) globalThis[key] = h.env[key];
  const game = new Game(), ui = new UI(game, h.elements.get('#game'));
  ui.resize(); ui.viewWidth = h.env.innerWidth; ui.viewHeight = h.env.innerHeight;
  return { h, game, ui, cleanup() { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('every tier renders a loaded portrait with a valid sprite crop and balanced canvas state', () => {
  const {h, ui, cleanup} = setup({width: 2400, height: 1800});
  try { for (const [mass, tier] of TIERS) {
    h.calls.length = 0;
    ui.drawEntity({name: tier, mass, x: 1200, y: 900, player: true}, {x:0,y:0});
    const image = h.calls.find(([method]) => method === 'drawImage');
    assert.ok(image, `No portrait for ${tier}`);
    const [,sheet,sx,sy,sw,sh] = image;
    assert.ok(sx >= 0 && sy >= 0 && sx+sw <= sheet.naturalWidth+.01 && sy+sh <= sheet.naturalHeight, tier);
    assert.equal(h.depth, 0, `Canvas state leaks for ${tier}`);
    assert.ok(h.calls.some(([method,text]) => method === 'fillText' && text === tier.replace(/^sub(\d+)$/, 'SUB $1').toUpperCase()));
  }} finally { cleanup(); }
});

test('partially visible avatars and pickups render at the viewport edge; offscreen objects are culled', () => {
  const {h, ui, cleanup} = setup();
  try {
    ui.drawEntity({name:'Edge',mass:1,x:0,y:100}, {x:0,y:0});
    assert.ok(h.calls.some(([method])=>method==='drawImage'));
    h.calls.length=0; ui.drawFood({type:'фоидка',x:0,y:100}, {x:0,y:0});
    assert.ok(h.calls.some(([method])=>method==='drawImage'));
    h.calls.length=0; ui.drawEntity({name:'Gone',mass:1,x:-100,y:100}, {x:0,y:0});
    assert.equal(h.calls.length,0);
  } finally { cleanup(); }
});

test('all food portraits render and fallback emblems render when images fail', () => {
  const {h,ui,cleanup}=setup();
  try {
    for (const type of ['молоточек','фоидка','мейкапцелка','стейси','выброшенная масса']) {
      h.calls.length=0; ui.drawFood({type,x:400,y:400},{x:0,y:0});
      assert.equal(h.depth,0,type);
      if (type!=='выброшенная масса') assert.ok(h.calls.some(([m])=>m==='drawImage'),type);
    }
    for (const key of ['avatarAtlas','hammerSprite','foidSprite','makeupSprite','staceySprite']) ui[key].complete=false;
    ui.drawEntity({name:'Fallback',mass:1,x:400,y:400},{x:0,y:0});
    for(const type of ['молоточек','фоидка','мейкапцелка','стейси']) ui.drawFood({type,x:400,y:400},{x:0,y:0});
    assert.equal(h.depth,0);
  } finally { cleanup(); }
});

test('HUD formats tier and mass and escapes player names in the leaderboard', () => {
  const {h,game,ui,cleanup}=setup();
  try {
    game.player.mass=75.9; game.player.id='me'; game.leaderboard=[{id:'me',name:'<img src=x onerror=alert(1)>',mass:75.9}];
    ui.updateHUD();
    assert.equal(h.elements.get('#tier').textContent,'SUB 3');
    assert.equal(h.elements.get('#mass').innerHTML,'Масса <b>75</b>');
    assert.ok(!h.elements.get('#leaders').innerHTML.includes('<img'));
    assert.match(h.elements.get('#leaders').innerHTML,/class="leader-name"/);
    assert.match(h.elements.get('#leaders').innerHTML,/class="leader-mass"/);
  } finally { cleanup(); }
});

test('canvas scales for retina desktop and small mobile viewports without leaking state', () => {
  for(const options of [{width:1280,height:800,dpr:2},{width:390,height:844,dpr:3}]) {
    const {h,game,ui,cleanup}=setup(options);
    try { game.player.parts=[{name:'You',x:2500,y:2500,mass:1,alive:true,player:true}];
      for(let i=0;i<10;i++)ui.render();
      assert.equal(h.elements.get('#game').width,options.width*options.dpr);
      assert.equal(h.elements.get('#game').height,options.height*options.dpr);
      assert.equal(h.depth,0);
    } finally {cleanup();}
  }
});

test('each gameplay tier has a unique ordered portrait crop with unchanged proportions',()=>{
  const {h,ui,cleanup}=setup();
  try {const crops=new Set();
    for(let tier=0;tier<TIERS.length;tier++){
      h.calls.length=0;ui.drawPortraitAvatar(tier,80);
      const [,sheet,sx,sy,sw,sh,,,dw,dh]=h.calls.find(([m])=>m==='drawImage');
      assert.equal(sheet,ui.avatarAtlas);assert.equal(sw/sh,dw/dh);
      assert.equal(Math.floor(sx/(sheet.naturalWidth/5)),tier%5);
      assert.equal(Math.floor(sy/(sheet.naturalHeight/4)),Math.floor(tier/5));
      crops.add(`${sx},${sy},${sw},${sh}`);
    }
    assert.equal(crops.size,TIERS.length);
  }finally{cleanup();}
});

test('overlapping labels are suppressed and separated labels remain readable',()=>{
  const {h,ui,cleanup}=setup();
  try {const occupied=[],label={entity:{name:'First'},x:200,y:200,r:40,tier:'normie',color:'#fff'};
    ui.drawEntityLabel(label,occupied);ui.drawEntityLabel({...label,entity:{name:'Second'}},occupied);
    assert.equal(h.calls.filter(([m,text])=>m==='fillText'&&text==='First').length,1);
    assert.equal(h.calls.filter(([m,text])=>m==='fillText'&&text==='Second').length,0);
    ui.drawEntityLabel({...label,x:600,entity:{name:'Third'}},occupied);
    assert.ok(h.calls.some(([m,text])=>m==='fillText'&&text==='Third'));assert.equal(h.depth,0);
  }finally{cleanup();}
});

test('camera smoothly follows growth, ignores nearby giants and frames separated parts',()=>{
 const {game,ui,cleanup}=setup();try{
  game.player.parts=[];game.player.mass=1;assert.equal(ui.updateCamera(390,844,0),1);
  game.bots=[{x:2500,y:2500,mass:300000,alive:true}];assert.equal(ui.updateCamera(390,844,16),1);
  game.player.mass=50000;const first=ui.updateCamera(390,844,32);assert.ok(first<1&&first>.8);
  for(let t=48;t<3000;t+=16)ui.updateCamera(390,844,t);assert.ok(ui.zoom<.4);
  game.player.mass=240;game.player.parts=[{x:1000,y:1000,mass:120},{x:3000,y:1000,mass:120}];
  for(let t=3000;t<6000;t+=16)ui.updateCamera(390,844,t);
  assert.ok(ui.zoom*2100<390);assert.equal(ui.cameraFocus.x,2000);
 }finally{cleanup();}
});

test('rank badges keep an eleven-pixel screen font when the camera zooms out',()=>{
 const {h,ui,cleanup}=setup({width:2400,height:1800});try{
  ui.zoom=.25;ui.drawEntity({name:'Large',mass:50000,x:1200,y:900},{x:0,y:0});
  assert.ok(h.calls.some(([method,text])=>method==='fillText'&&text==='17'));
  const badge=h.calls.find(([method,, ,r])=>method==='arc'&&r===48);assert.ok(badge);
  h.calls.length=0;ui.drawEntity({name:'Tiny',mass:1,x:1200,y:900},{x:0,y:0});
  assert.ok(!h.calls.some(([method,text])=>method==='fillText'&&text==='1'));
 }finally{cleanup();}
});

test('fourteen million mass remains framed on desktop and a narrow phone',()=>{
 for(const [width,height] of [[1280,720],[320,640]]){
  const {game,ui,cleanup}=setup({width,height});try{game.player.mass=14143206;game.player.parts=[];const zoom=ui.updateCamera(width,height,0);
  const r=radiusForAudit(game.player.mass);assert.ok(2*r*zoom<=width*.7+.01);assert.ok(2*r*zoom<=height*.55+.01);
  }finally{cleanup();}
 }
});
