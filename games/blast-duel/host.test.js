// Full-page smoke test in jsdom: boot -> host -> fake guest joins -> play frames -> over? -> rematch
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname+'/../index.html','utf8')
  .replace(/<script src="https:[^"]+"><\/script>/, ''); // drop CDN script

let rafQ = [];
let fakeNow = 0;

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  beforeParse(window) {
    // canvas 2d stub
    const ctxStub = new Proxy({ canvas: null }, {
      get(t, k) {
        if (k === 'canvas') return t.canvas;
        return typeof k === 'string' ? function () {} : undefined;
      },
      set() { return true; },
    });
    window.HTMLCanvasElement.prototype.getContext = function () { return ctxStub; };
    window.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
    window.performance.now = () => fakeNow;
    // fake PeerJS
    window.__hostConn = null;
    window.Peer = function (id) {
      const handlers = {};
      const peer = {
        id, on(ev, cb) { handlers[ev] = cb; setTimeout(() => { if (ev === 'open' && handlers.open) handlers.open(); }, 0); },
        destroy() {}, reconnect() {},
        _emit(ev, arg) { if (handlers[ev]) handlers[ev](arg); },
      };
      window.__lastPeer = peer;
      return peer;
    };
    window.AudioContext = function () {
      return { state: 'running', currentTime: 0, sampleRate: 44100, resume() {}, destination: {},
        createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
        createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: o => o, start() {}, stop() {} }),
        createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: o => o }),
        createBufferSource: () => ({ loop: false, connect: o => o, start() {}, stop() {} }),
        createBiquadFilter: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: o => o }),
      };
    };
  },
});

const w = dom.window, doc = w.document;
const step = (ms) => { fakeNow += ms; const q = rafQ; rafQ = []; for (const cb of q) cb(fakeNow); };

setTimeout(() => {
  try {
    let fail = 0;
    const assert = (c, m) => { if (!c) { console.error('FAIL:', m); fail = 1; } };

    // boot ran: menu visible, frame scheduled
    assert(doc.getElementById('menu').style.display !== 'none', 'menu shown at boot');
    assert(rafQ.length === 1, 'rAF loop scheduled');
    step(16); step(16); // draw with null view — must not throw

    // host flow
    doc.getElementById('nameinput').value = 'Manu';
    doc.getElementById('hostbtn').click();
    const code = () => doc.getElementById('bigcode').textContent;
    setTimeout(() => {
      assert(/^[A-Z2-9]{4}$/.test(code()), 'lobby shows 4-char code, got: ' + code());
      assert(doc.getElementById('sharelink').textContent.includes('?j=' + code()), 'share link contains code');

      // fake guest connects
      const hostPeer = w.__lastPeer;
      const sent = [];
      let connHandlers = {};
      const fakeConn = {
        open: true,
        on(ev, cb) { connHandlers[ev] = cb; },
        send(m) { sent.push(m); },
        close() {},
      };
      hostPeer._emit('connection', fakeConn);
      connHandlers.data({ t: 'hi', name: 'Kid' });

      assert(sent.some(m => m.t === 'welcome'), 'host sent welcome');
      assert(sent.some(m => m.t === 'count'), 'host sent countdown');

      // run through countdown (3s) into play
      for (let i = 0; i < 200; i++) step(16);
      // guest fires input at host
      connHandlers.data({ t: 'in', ux: 1, uy: 0, ax: 1, ay: 0, f: true });
      for (let i = 0; i < 400; i++) step(16);

      const snaps = sent.filter(m => m.t === 'snap');
      assert(snaps.length > 50, 'host streamed snapshots, got ' + snaps.length);
      const lastP = snaps[snaps.length - 1].s.p;
      assert(lastP.length === 2, 'snapshot has 2 players');
      const evs = sent.filter(m => m.t === 'ev').map(m => m.e.k);
      assert(evs.includes('shootfx'), 'guest firing produced shoot events, saw: ' + [...new Set(evs)].join(','));
      assert(lastP[1].x > 200, 'guest player moved right (x=' + lastP[1].x + ')');

      // opponent leaves -> host returns to lobby
      connHandlers.close();
      step(16);
      assert(doc.getElementById('lobby').style.display === 'flex', 'host back in lobby after disconnect');

      console.log('snapshots:', snaps.length, 'events:', [...new Set(evs)].join(','));
      console.log(fail ? 'PAGE_FAIL' : 'PAGE_OK');
      process.exit(fail);
    }, 10);
  } catch (e) {
    console.error('THROW:', e);
    process.exit(1);
  }
}, 20);
