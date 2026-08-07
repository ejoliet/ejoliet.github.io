#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { RTCPeerConnection, RTCSessionDescription } from 'werift';

const peerId = crypto.randomUUID();
const storeDir = process.env.MESHDROP_DIR || path.join(os.homedir(), 'MeshDropImages');
fs.mkdirSync(storeDir, { recursive: true });
const manifestPath = path.join(storeDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const channels = new Set();
const rl = readline.createInterface({ input, output });

function saveManifest(){ fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); }
function encode(desc){ return Buffer.from(JSON.stringify({ v:1, from:peerId, alias:os.hostname(), desc })).toString('base64'); }
function decode(s){ return JSON.parse(Buffer.from(s.trim(), 'base64').toString('utf8')); }
function safeName(name){ return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120); }
function log(s){ console.log(`[meshdrop] ${s}`); }

async function waitIce(pc){
  if (pc.iceGatheringState === 'complete') return;
  await new Promise(resolve => {
    const t = setTimeout(resolve, 3000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
}

function setupChannel(ch){
  channels.add(ch);
  ch.onopen = () => { log('channel open'); send(ch, { type:'hello', peerId, alias:os.hostname(), hashes:manifest.map(x=>x.hash) }); };
  ch.onclose = () => channels.delete(ch);
  ch.onmessage = ({ data }) => handleMessage(data, ch);
}
function send(ch, obj){ if (ch.readyState === 'open') ch.send(JSON.stringify(obj)); }
function broadcast(obj, except){ for (const ch of channels) if (ch !== except) send(ch, obj); }
function handleMessage(raw, ch){
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (m.type === 'hello') {
    log(`hello from ${m.alias || m.peerId || 'peer'}`);
    return;
  }
  if (m.type === 'image' && m.image) {
    if (manifest.some(x => x.hash === m.image.hash)) return;
    const ext = (m.image.type || '').split('/')[1] || 'img';
    const filename = `${m.image.hash.slice(0,12)}-${safeName(m.image.name || 'image')}`;
    const out = path.join(storeDir, filename.includes('.') ? filename : `${filename}.${ext}`);
    const base64 = String(m.image.dataUrl).split(',')[1];
    fs.writeFileSync(out, Buffer.from(base64, 'base64'));
    manifest.unshift({ hash:m.image.hash, name:m.image.name, file:out, ts:Date.now(), from:m.image.from });
    saveManifest();
    log(`saved ${out}`);
    broadcast(m, ch);
  }
}

async function createHostOffer(){
  const pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
  pc.onconnectionstatechange = () => log(`connection ${pc.connectionState}`);
  setupChannel(pc.createDataChannel('mesh-terminal'));
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  console.log('\nLOCAL OFFER\n');
  console.log(encode(pc.localDescription));
  const ans = await rl.question('\nPaste browser answer: ');
  const sig = decode(ans);
  await pc.setRemoteDescription(new RTCSessionDescription(sig.desc));
  log(`storing images in ${storeDir}`);
}

async function joinOffer(){
  const offer = await rl.question('Paste browser offer: ');
  const sig = decode(offer);
  const pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
  pc.onconnectionstatechange = () => log(`connection ${pc.connectionState}`);
  pc.ondatachannel = ({ channel }) => setupChannel(channel);
  await pc.setRemoteDescription(new RTCSessionDescription(sig.desc));
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);
  console.log('\nLOCAL ANSWER\n');
  console.log(encode(pc.localDescription));
  log(`storing images in ${storeDir}`);
}

console.log(`MeshDrop terminal peer ${peerId.slice(0,8)}`);
console.log(`Default folder: ${storeDir}`);
console.log('1) Create host offer');
console.log('2) Join browser offer');
const choice = await rl.question('Choose 1 or 2: ');
if (choice.trim() === '1') await createHostOffer(); else await joinOffer();
console.log('Connected process stays open. Press Ctrl+C to stop.');
setInterval(() => {}, 1 << 30);
