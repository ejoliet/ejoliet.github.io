// Guest-side smoke: join flow, welcome/count/snap/ev handling, interpolation render
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname+'/../index.html','utf8').replace(/<script src="https:[^"]+"><\/script>/,'');
let rafQ = []; let fakeNow = 0;
const dom = new JSDOM(html, { runScripts:'dangerously', url:'http://localhost/?j=ABCD',
  beforeParse(window){
    const ctxStub = new Proxy({}, { get:(t,k)=> typeof k==='string' ? function(){} : undefined, set:()=>true });
    window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
    window.requestAnimationFrame = cb => { rafQ.push(cb); return 1; };
    window.performance.now = () => fakeNow;
    window.Peer = function(){ const h={}; const p={ on(ev,cb){h[ev]=cb; setTimeout(()=>{if(ev==='open'&&h.open)h.open();},0);}, connect(id,opts){ window.__conn = mkConn(id); return window.__conn; }, destroy(){}, reconnect(){} }; return p; };
    function mkConn(id){ const h={}; const sent=[]; return { open:false, _h:h, sent, target:id,
      on(ev,cb){ h[ev]=cb; }, send(m){ sent.push(m); }, close(){} }; }
    window.AudioContext = function(){ return { state:'running', currentTime:0, sampleRate:44100, resume(){}, destination:{},
      createBuffer:()=>({getChannelData:()=>new Float32Array(64)}),
      createOscillator:()=>({type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect:o=>o,start(){},stop(){}}),
      createGain:()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect:o=>o}),
      createBufferSource:()=>({loop:false,connect:o=>o,start(){},stop(){}}),
      createBiquadFilter:()=>({type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect:o=>o}) }; };
  }});
const w = dom.window, doc = w.document;
const step = ms => { fakeNow += ms; const q = rafQ; rafQ = []; for (const cb of q) cb(fakeNow); };
const mkSnap = (x0,x1) => ({ p:[
  {x:x0,y:500,ax:1,ay:0,hp:100,s:0,d:0,w:0,a:0,pr:0},
  {x:x1,y:500,ax:-1,ay:0,hp:88,s:1,d:0,w:1,a:3,pr:0}],
  b:[{id:1,x:x0+50,y:500,ty:0}], pd:[1,1,0,1] });
setTimeout(()=>{
  let fail=0; const assert=(c,m)=>{ if(!c){console.error('FAIL:',m); fail=1;} };
  assert(doc.getElementById('codeinput').value==='ABCD','?j= prefilled code');
  doc.getElementById('nameinput').value='Kid';
  doc.getElementById('joinbtn').click();
  setTimeout(()=>{
    const conn = w.__conn;
    assert(conn && conn.target.includes('ABCD'), 'guest dialed room id');
    conn.open = true; conn._h.open();
    assert(conn.sent.some(m=>m.t==='hi'), 'guest sent hi');
    conn._h.data({t:'welcome', hostName:'Manu'});
    conn._h.data({t:'count'});
    // stream snapshots during/after countdown, advancing time
    for(let i=0;i<80;i++){ conn._h.data({t:'snap', s:mkSnap(200+i*4, 1400-i*4)}); step(50); }
    conn._h.data({t:'ev', e:{k:'boom', x:800, y:500}});
    conn._h.data({t:'ev', e:{k:'frag', ki:0, vi:1, self:false, x:800, y:500, s0:1, s1:0}});
    step(16); step(16);
    // reach into page state
    const S = w.eval('S');
    assert(S.phase==='play', 'guest reached play phase, got '+S.phase);
    assert(S.lastSnapView && S.lastSnapView.p.length===2, 'guest built interpolated view');
    const gx = S.lastSnapView.p[0].x;
    assert(gx>200 && gx<=200+79*4, 'interpolated x in range, got '+gx);
    assert(conn.sent.filter(m=>m.t==='in').length>10, 'guest streamed inputs');
    conn._h.data({t:'ev', e:{k:'over', wi:0}});
    step(16);
    assert(doc.getElementById('over').style.display==='flex','over screen shown');
    assert(doc.getElementById('overwait').style.display==='block','guest sees wait-for-host');
    console.log(fail?'GUEST_FAIL':'GUEST_OK');
    process.exit(fail);
  },10);
},20);
