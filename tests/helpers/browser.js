import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { Game } from '../../src/game.js';
import { radius, WORLD_SIZE, TIERS } from '../../src/arena.js';

export function browserHarness({ width = 1024, height = 768, dpr = 1 } = {}) {
  const calls = [], elements = new Map(), windowEvents = new Map();
  let depth = 0, frame, frameTime=0;
  const ctx = new Proxy({measureText(text) { return {width: String(text).length*8}; }}, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => { calls.push([key, ...args]); if (key === 'save') depth++; if (key === 'restore') { depth--; if (depth < 0) throw new Error('Canvas restore without save'); } };
  }});
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const listeners = new Map();
    elements.set(`#${match[3]}`, {
      id: match[3], tagName: match[1].toUpperCase(), value: '', hidden: /\bhidden\b/.test(match[2]), style: {}, textContent: '', innerHTML: '',
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, cb) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(cb); },
      dispatch(type, props = {}) { const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...props }; for (const cb of listeners.get(type) || []) cb(event); return event; },
      getContext: () => ctx, focus() {}, setPointerCapture() {}
    });
  }
  const document = { hidden: false, addEventListener(type, cb) { windowEvents.set(type, cb); }, querySelector(selector) { if (!elements.has(selector)) throw new Error(`Missing element ${selector}`); return elements.get(selector); } };
  class Image {
    complete = true;
    set src(value) { this._src = value; const bytes = readFileSync(new URL(`../../${value}`, import.meta.url)); this.naturalWidth = bytes.readUInt32BE(16); this.naturalHeight = bytes.readUInt32BE(20); }
    get src() { return this._src; }
  }
  const sockets = [];
  class WebSocket {
    static OPEN = 1; static CONNECTING = 0;
    bufferedAmount = 0; readyState = 0; events = new Map(); sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    addEventListener(type, cb) { this.events.set(type, cb); }
    send(value) { this.sent.push(JSON.parse(value)); }
    emit(type, value) { if (type === 'open') this.readyState = 1; if (type === 'close') this.readyState = 3; this.events.get(type)?.(type === 'message' ? { data: JSON.stringify(value) } : value); }
  }
  const env = { Game, radius, WORLD_SIZE, TIERS, document, Image, WebSocket, innerWidth: width, innerHeight: height, devicePixelRatio: dpr,
    location: { protocol: 'http:', origin: 'http://localhost:3000', host: 'localhost:3000', search: '' },
    performance: { now: () => 0 }, URLSearchParams, navigator: { clipboard: { async writeText() {} } }, setTimeout,
    AudioContext: class { createOscillator() { return { frequency: {}, connect() { return this; }, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } },
    addEventListener(type, cb) { windowEvents.set(type, cb); }, requestAnimationFrame(cb) { frame = cb; }
  };
  return { env, calls, ctx, elements, sockets, get depth() { return depth; },
    loadMain() { const code = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''); const context = createContext(env); const uiCode = readFileSync(new URL('../../src/ui.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export class UI', 'class UI'); new Script(uiCode + '\n' + code).runInContext(context); },
    windowEvent(type, props = {}) { const event = { target: elements.get('#game'), preventDefault() { this.defaultPrevented = true; }, ...props }; windowEvents.get(type)?.(event); return event; },
    frame(now) { frameTime=now??frameTime+34;frame(frameTime); },
    start() { this.loadMain(); elements.get('#play').dispatch('click'); const socket = sockets[0]; socket.emit('open'); socket.emit('message', { type: 'welcome', id: 'me' }); socket.emit('message', { type: 'room', isPublic: true, code: '', players: 1, limit: 12 }); return socket; }
  };
}
