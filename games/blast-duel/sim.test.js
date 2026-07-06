// Headless smoke test for game.js sim logic (host side)
const fs = require('fs');
const html = fs.readFileSync(__dirname+'/../index.html','utf8');
const m = html.match(/<script>\n([\s\S]*)<\/script>\s*<\/body>/);
const code = m[1];

// --- browser stubs ---
const el = () => new Proxy({ style: {}, value: '', textContent: '' }, {
  get(t, k) {
    if (k === 'addEventListener') return () => {};
    if (k === 'getContext') return () => new Proxy({}, { get: () => () => {} });
    if (!(k in t)) t[k] = (k === 'style') ? {} : '';
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});
global.document = { getElementById: () => el(), createElement: () => el(), body: { appendChild: () => {} } };
global.window = { addEventListener: () => {}, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1 };
global.location = { search: '', origin: 'http://x', pathname: '/' };
global.localStorage = { setItem(){}, removeItem(){}, getItem(){ return null; } };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {}; // do not run the RAF loop
global.navigator = {};
global.Peer = function () { return { on: () => {} }; };
global.URLSearchParams = URLSearchParams;
global.setTimeout = setTimeout; global.clearTimeout = clearTimeout;

eval(code + `
;globalThis.__T = { newSim, stepSim, snapshot, S, WPN, FRAG_LIMIT, applyEvent };
`);

const { newSim, stepSim, snapshot, S, FRAG_LIMIT } = globalThis.__T;

// simulate: p0 chases p1 and fires constantly; p1 stands still
const sim = newSim();
S.phase = 'play'; S.myIdx = 0; S.names = ['A', 'B'];
let frags = 0, overs = 0, hits = 0, booms = 0;
const dt = 1 / 60;
for (let step = 0; step < 60 * 120; step++) {
  const p0 = sim.players[0], p1 = sim.players[1];
  const dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy) || 1;
  const in0 = { ux: dx / d, uy: dy / d, ax: dx / d, ay: dy / d, f: true };
  const in1 = { ux: 0, uy: 0, ax: -dx / d, ay: -dy / d, f: false };
  stepSim(sim, dt, [in0, in1]);
  for (const e of sim.ev) {
    if (e.k === 'frag') frags++;
    if (e.k === 'over') { overs++; }
    if (e.k === 'hit') hits++;
    if (e.k === 'boom') booms++;
  }
  sim.ev.length = 0;
  if (overs) break;
}
const snap = snapshot(sim);
console.log('frags:', frags, 'hits:', hits, 'score:', sim.players.map(p => p.score), 'over:', overs);
console.log('snapshot players:', JSON.stringify(snap.p));
console.log('bullets in flight:', snap.b.length, 'pads:', snap.pd.join(''));

let fail = 0;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); fail = 1; } };
assert(frags >= FRAG_LIMIT, 'expected at least FRAG_LIMIT frags');
assert(overs === 1, 'expected exactly one over event');
assert(sim.players[0].score === FRAG_LIMIT, 'winner score should equal frag limit');
assert(hits > 0, 'expected hit events');
assert(snap.p.length === 2 && snap.pd.length === 4, 'snapshot shape');

// wall containment check: run 20s of random-direction movement, ensure players never inside walls
const sim2 = newSim();
let inside = 0;
for (let step = 0; step < 60 * 20; step++) {
  const a = step / 37, b = step / 53;
  stepSim(sim2, dt, [
    { ux: Math.cos(a), uy: Math.sin(a), ax: 1, ay: 0, f: (step % 7 === 0) },
    { ux: Math.cos(b), uy: Math.sin(b), ax: -1, ay: 0, f: (step % 5 === 0) },
  ]);
  sim2.ev.length = 0;
  for (const p of sim2.players) {
    if (p.x < 0 || p.y < 0 || p.x > 1600 || p.y > 1000) inside++;
  }
}
assert(inside === 0, 'players escaped world bounds ' + inside + ' times');

console.log(fail ? 'SMOKE_FAIL' : 'SMOKE_OK');
process.exit(fail);
