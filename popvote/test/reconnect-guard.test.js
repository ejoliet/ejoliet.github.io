"use strict";
// scheduleGuestRetry() drives the capped-backoff reconnect UI. Rather than
// waiting out real RETRY_DELAY_MS timers, these tests seed guestState.retries
// at the boundary and check the synchronous bookkeeping/UI update that
// happens before any timer is scheduled.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app.js");

test("scheduleGuestRetry increments the attempt counter and keeps retrying under the cap", () => {
  const { window, document } = loadApp();
  window.guestState.retries = 0;
  // Under the cap, scheduleGuestRetry() arms a real setTimeout(connectAsGuest,
  // RETRY_DELAY_MS) — stub it first so that timer firing later doesn't crash
  // on a null guestPeer (this test isn't exercising a live connection).
  window.connectAsGuest = () => {};
  window.scheduleGuestRetry();
  assert.equal(window.guestState.retries, 1);
  assert.equal(document.getElementById("gcRetry").hidden, true, "still under the cap — no manual retry button yet");
});

test("scheduleGuestRetry gives up and shows a manual retry button once RECONNECT_MAX_ATTEMPTS is exceeded", () => {
  const { window, document } = loadApp();
  window.guestState.retries = window.RECONNECT_MAX_ATTEMPTS; // one shy of the cap
  window.connectAsGuest = () => {}; // defense in depth: this path shouldn't schedule a timer at all once over the cap
  window.scheduleGuestRetry();
  assert.equal(window.guestState.retries, window.RECONNECT_MAX_ATTEMPTS + 1);
  assert.equal(document.getElementById("gcRetry").hidden, false, "cap exceeded — must surface a manual retry, never fail silently");
  assert.match(document.getElementById("gcTitle").textContent, /could not connect/i);
});

test("clicking the manual retry button resets the counter, hides itself, and re-attempts", () => {
  const { window, document } = loadApp();
  window.guestState.retries = 999;
  document.getElementById("gcRetry").hidden = false;
  let reattempted = false;
  window.connectAsGuest = () => { reattempted = true; }; // real connectAsGuest() needs a live guestPeer; that path is covered end-to-end in dev/manual-integration-check.js
  document.getElementById("gcRetry").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(window.guestState.retries, 0);
  assert.equal(document.getElementById("gcRetry").hidden, true);
  assert.equal(reattempted, true, "the click handler must call connectAsGuest() again");
});
