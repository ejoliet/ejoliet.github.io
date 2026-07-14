"use strict";
// Loads the real popvote/index.html into a jsdom window so tests exercise
// the actual shipped code — not a reimplementation of it. The two CDN
// <script src> tags (PeerJS, qrcode-generator) are swapped for minimal stubs
// so jsdom never needs real network access; every other line is unmodified.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const INDEX_HTML_PATH = path.join(__dirname, "..", "..", "index.html");

const PEER_STUB = `window.Peer = function(){ throw new Error("Peer is stubbed out in jsdom tests — these tests call app functions directly instead of driving a real connection."); };`;
const QR_STUB = `window.qrcode = function(){ return { addData(){}, make(){}, createSvgTag(){ return "<svg></svg>"; } }; };`;

function loadApp(url){
  let html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  html = html.replace(
    /<script src="https:\/\/unpkg\.com\/peerjs@1\.5\.5\/dist\/peerjs\.min\.js"><\/script>/,
    `<script>${PEER_STUB}</script>`
  );
  html = html.replace(
    /<script src="https:\/\/unpkg\.com\/qrcode-generator@1\.4\.4\/qrcode\.js"><\/script>/,
    `<script>${QR_STUB}</script>`
  );
  if (!/window\.Peer = function/.test(html) || !/window\.qrcode = function/.test(html)){
    throw new Error("load-app: CDN <script src> tags in index.html no longer match the expected pattern — update the regexes above.");
  }

  const dom = new JSDOM(html, {
    url: url || "https://localhost/popvote/index.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });

  // jsdom doesn't implement SubtleCrypto or TextEncoder/TextDecoder; Node's
  // own globals are drop-in replacements for all three.
  dom.window.crypto.subtle = require("crypto").webcrypto.subtle;
  dom.window.TextEncoder = TextEncoder;
  dom.window.TextDecoder = TextDecoder;

  return { dom, window: dom.window, document: dom.window.document };
}

module.exports = { loadApp };
