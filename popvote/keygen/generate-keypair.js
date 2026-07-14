#!/usr/bin/env node
// Local-only. Generates the Ed25519 keypair popvote licenses are signed with.
// Run this ONCE per deployment (re-running invalidates every license you've
// already sold, since the public key baked into index.html would change).
//
// Usage: node popvote/keygen/generate-keypair.js
//
// Writes popvote/keys/private.pem and popvote/keys/public.pem — both are
// gitignored (see the security invariant at the top of the repo .gitignore:
// *.pem and popvote/keys/ were added in the very first commit of this
// feature, before this script existed). Never commit either file.
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const keysDir = path.join(__dirname, "..", "keys");
const privPath = path.join(keysDir, "private.pem");
const pubPath = path.join(keysDir, "public.pem");

if (fs.existsSync(privPath)){
  console.error("Refusing to overwrite " + privPath + " — delete it yourself first if you really mean to rotate keys.");
  process.exit(1);
}

fs.mkdirSync(keysDir, { recursive: true });
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

fs.writeFileSync(privPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
fs.writeFileSync(pubPath, publicKey.export({ type: "spki", format: "pem" }));

// WebCrypto's importKey("raw", ...) wants the bare 32-byte Ed25519 key, not
// the SPKI wrapper — strip the fixed 12-byte SPKI-for-Ed25519 ASN.1 prefix.
const spkiDer = publicKey.export({ type: "spki", format: "der" });
const rawPublicKey = spkiDer.subarray(spkiDer.length - 32);

console.log("Wrote " + privPath + " and " + pubPath + " (both gitignored).");
console.log("");
console.log("Paste this into the LICENSE_PUBLIC_KEY_B64 constant in popvote/index.html:");
console.log("");
console.log("  " + rawPublicKey.toString("base64"));
console.log("");
console.log("Keep private.pem safe and offline — anyone who has it can mint valid licenses.");
