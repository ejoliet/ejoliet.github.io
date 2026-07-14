"use strict";
// Exercises verifyLicensePayload() — the signature/expiry check underlying
// verifyLicenseString() — against an ephemeral test keypair generated with
// the same Node Ed25519 API popvote/keygen/generate-keypair.js uses. This
// never touches the real project keypair (whose private half is a secret
// that only exists locally, gitignored), so it works the same in CI as it
// does on a dev machine.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { loadApp } = require("./helpers/load-app.js");

function b64url(buf){
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeTestLicense(payload, privateKey){
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, payloadBytes, privateKey);
  return b64url(payloadBytes) + "." + b64url(sig);
}

function testKeypair(){
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" });
  const rawPublicKey = new Uint8Array(der.subarray(der.length - 32));
  return { rawPublicKey, privateKey };
}

test("a validly-signed, unexpired license verifies and returns its payload", async () => {
  const { window } = loadApp();
  const { rawPublicKey, privateKey } = testKeypair();
  const license = makeTestLicense({ holder: "buyer@example.com", issued: Date.now() }, privateKey);

  const payload = await window.verifyLicensePayload(license, rawPublicKey);
  assert.ok(payload, "a genuinely valid license must verify");
  assert.equal(payload.holder, "buyer@example.com");
});

test("a forged signature (right shape, wrong bytes) is rejected", async () => {
  const { window } = loadApp();
  const { rawPublicKey, privateKey } = testKeypair();
  const license = makeTestLicense({ holder: "buyer@example.com", issued: Date.now() }, privateKey);
  const [payloadPart, sigPart] = license.split(".");
  const forged = payloadPart + "." + sigPart.slice(0, -4) + (sigPart.slice(-4) === "AAAA" ? "BBBB" : "AAAA");

  assert.equal(await window.verifyLicensePayload(forged, rawPublicKey), null);
});

test("a license signed by a DIFFERENT keypair is rejected against this app's public key", async () => {
  const { window } = loadApp();
  const { rawPublicKey } = testKeypair();
  const otherKeypair = testKeypair(); // a completely different seller's key
  const license = makeTestLicense({ holder: "buyer@example.com", issued: Date.now() }, otherKeypair.privateKey);

  assert.equal(await window.verifyLicensePayload(license, rawPublicKey), null);
});

test("an expired license is rejected even though its signature is genuinely valid", async () => {
  const { window } = loadApp();
  const { rawPublicKey, privateKey } = testKeypair();
  const license = makeTestLicense({ holder: "buyer@example.com", issued: Date.now() - 1000, exp: Date.now() - 1 }, privateKey);

  assert.equal(await window.verifyLicensePayload(license, rawPublicKey), null);
});

test("a not-yet-expired license (exp in the future) verifies", async () => {
  const { window } = loadApp();
  const { rawPublicKey, privateKey } = testKeypair();
  const license = makeTestLicense({ holder: "buyer@example.com", issued: Date.now(), exp: Date.now() + 86400000 }, privateKey);

  assert.ok(await window.verifyLicensePayload(license, rawPublicKey));
});

test("garbage input (wrong shape, not base64, empty string) is rejected without throwing", async () => {
  const { window } = loadApp();
  const { rawPublicKey } = testKeypair();
  for (const bad of ["", "no-dot-here", "a.b.c", "!!!.###", null, undefined]){
    assert.equal(await window.verifyLicensePayload(bad, rawPublicKey), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("activateLicense() persists the raw string and updates the in-memory cache on success", async () => {
  const { window } = loadApp();
  const { rawPublicKey, privateKey } = testKeypair();
  // Point the app's baked-in constant at our ephemeral test key for this one check.
  window.LICENSE_PUBLIC_KEY_B64 = Buffer.from(rawPublicKey).toString("base64");
  const license = makeTestLicense({ holder: "buyer@example.com", issued: Date.now() }, privateKey);

  const ok = await window.activateLicense(license);
  assert.equal(ok, true);
  assert.equal(window.isPro(), true);
  assert.equal(JSON.parse(window.localStorage.getItem("pv.license")), license);
});

test("activateLicense() rejects a forged key and leaves isPro() false", async () => {
  const { window } = loadApp();
  const ok = await window.activateLicense("not-a-real-license");
  assert.equal(ok, false);
  assert.equal(window.isPro(), false);
});
