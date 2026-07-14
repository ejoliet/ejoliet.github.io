#!/usr/bin/env node
// Local-only. Mints one signed license string for a buyer, after they've paid
// via Lemon Squeezy (Lemon Squeezy is the merchant of record / payment
// processor here; popvote's own Ed25519 signature is the license mechanism,
// verified fully offline in the browser — no license-check network call).
//
// Usage:
//   node popvote/keygen/generate-license.js --holder "buyer@example.com" [--exp 2027-07-14]
//
// Prints the license string (base64url(payload) + "." + base64url(signature))
// to send to the buyer. NEVER commit this output anywhere in the repo — it's
// a real, usable license key (see the "Never commit" rule in the build
// prompt's commit-hygiene section, right alongside private keys).
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function b64url(buf){
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseArgs(argv){
  const out = {};
  for (let i = 0; i < argv.length; i++){
    if (argv[i] === "--holder") out.holder = argv[++i];
    else if (argv[i] === "--exp") out.exp = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.holder){
  console.error("Usage: node generate-license.js --holder \"buyer@example.com\" [--exp YYYY-MM-DD]");
  process.exit(1);
}

const privPath = path.join(__dirname, "..", "keys", "private.pem");
if (!fs.existsSync(privPath)){
  console.error("No private key at " + privPath + " — run generate-keypair.js first.");
  process.exit(1);
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(privPath, "utf8"));

const payload = {
  holder: args.holder,
  issued: Date.now(),
};
if (args.exp) payload.exp = new Date(args.exp + "T00:00:00Z").getTime();

const payloadBytes = Buffer.from(JSON.stringify(payload));
const sig = crypto.sign(null, payloadBytes, privateKey); // Ed25519: no digest algorithm param

const license = b64url(payloadBytes) + "." + b64url(sig);
console.log(license);
