"use strict";
// Exercises the host-side hub logic directly (handleVote/handleUpvote/
// handleQuestion/onGuestData) against hand-built session/responses/qnaStore
// fixtures — the same functions the real wire protocol handlers call, just
// without a real PeerJS connection underneath them.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app.js");

function pollFixture(window){
  const act = { id: "act1", kind: "poll", closed: false, revealed: false,
    options: [{ idx: 0, label: "A" }, { idx: 1, label: "B" }] };
  window.session.activities = [act];
  window.session.activeId = "act1";
  window.responses["act1"] = new Map();
  return act;
}

test("one vote per guest per activity; re-vote replaces rather than accumulating", () => {
  const { window } = loadApp();
  pollFixture(window);
  window.handleVote("guestA", { t: "vote", a: "act1", v: 0 });
  window.handleVote("guestA", { t: "vote", a: "act1", v: 1 }); // re-vote
  window.handleVote("guestB", { t: "vote", a: "act1", v: 0 });

  const tally = window.responses["act1"];
  assert.equal(tally.size, 2, "two distinct guests, not three votes");
  assert.equal(tally.get("guestA"), 1, "guestA's second vote replaced the first");
  assert.equal(tally.get("guestB"), 0);
});

test("a vote for an activity that isn't the current active one is rejected", () => {
  const { window } = loadApp();
  pollFixture(window);
  window.session.activeId = "some-other-activity";
  window.handleVote("guestA", { t: "vote", a: "act1", v: 0 });
  assert.equal(window.responses["act1"].size, 0);
});

test("a vote on a closed activity is rejected", () => {
  const { window } = loadApp();
  const act = pollFixture(window);
  act.closed = true;
  window.handleVote("guestA", { t: "vote", a: "act1", v: 0 });
  assert.equal(window.responses["act1"].size, 0);
});

test("an out-of-range poll option index is rejected", () => {
  const { window } = loadApp();
  pollFixture(window);
  window.handleVote("guestA", { t: "vote", a: "act1", v: 99 });
  assert.equal(window.responses["act1"].size, 0);
});

function qnaFixture(window){
  const act = { id: "qact", kind: "qna", closed: false };
  window.session.activities = [act];
  window.session.activeId = "qact";
  window.qnaStore["qact"] = new Map();
  return act;
}

test("one upvote per guest per question — a second upvote from the same guest is a no-op", () => {
  const { window } = loadApp();
  const act = qnaFixture(window);
  window.qnaStore["qact"].set("q1", { txt: "hi?", n: "", up: new Set(), ans: false, hidden: false });
  window.handleUpvote("guestA", { t: "up", a: "qact", qid: "q1" });
  window.handleUpvote("guestA", { t: "up", a: "qact", qid: "q1" });
  window.handleUpvote("guestB", { t: "up", a: "qact", qid: "q1" });
  assert.equal(window.qnaStore["qact"].get("q1").up.size, 2);
});

test("handleQuestion rejects text over the 500-char hard cap, but stores (truncated at 240) anything at or under it", () => {
  const { window } = loadApp();
  qnaFixture(window);
  const rec = { name: "", bucket: [] };

  window.handleQuestion("guestA", rec, { t: "q", a: "qact", txt: "x".repeat(501), n: "Al" });
  assert.equal(window.qnaStore["qact"].size, 0, "over the 500-char hub hard cap must be rejected outright");

  window.handleQuestion("guestA", rec, { t: "q", a: "qact", txt: "y".repeat(300), n: "Al" });
  assert.equal(window.qnaStore["qact"].size, 1, "under the hard cap (even if over the 240 UI cap) is accepted");
  const stored = Array.from(window.qnaStore["qact"].values())[0];
  assert.equal(stored.txt.length, 240, "stored text is truncated to the UI cap regardless of what a modified client sent");
});

test("handleQuestion enforces the 200-entry cap per activity", () => {
  const { window } = loadApp();
  qnaFixture(window);
  const rec = { name: "", bucket: [] };
  for (let i = 0; i < 200; i++) window.qnaStore["qact"].set("seed" + i, { txt: "q", n: "", up: new Set(), ans: false, hidden: false });
  window.handleQuestion("guestA", rec, { t: "q", a: "qact", txt: "one more?", n: "Al" });
  assert.equal(window.qnaStore["qact"].size, 200, "the 201st question must be rejected");
});

test("onGuestData drops an oversize (>2KB) frame before it even reaches the rate limiter", async () => {
  const { window } = loadApp();
  const rec = { name: "", bucket: [] };
  const oversize = JSON.stringify({ t: "vote", a: "x", v: "y".repeat(3000) });
  await window.onGuestData("guestA", rec, oversize);
  assert.equal(rec.bucket.length, 0, "an oversize frame must not even count against the per-guest rate limit");
});

test("onGuestData rate-limits a guest to 5 messages/second at the hub", async () => {
  const { window } = loadApp();
  qnaFixture(window);
  const rec = { name: "", bucket: [] };
  let reactions = 0;
  window.spawnReactionSprite = () => { reactions++; };
  for (let i = 0; i < 8; i++) await window.onGuestData("guestA", rec, JSON.stringify({ t: "rx", e: "👍" }));
  assert.equal(reactions, 5, "only the first 5 messages within the 1-second window should be processed");
  assert.equal(rec.bucket.length, 5);
});

test("onGuestData ignores malformed JSON without throwing", async () => {
  const { window } = loadApp();
  const rec = { name: "", bucket: [] };
  await assert.doesNotReject(() => window.onGuestData("guestA", rec, "{not json"));
  assert.equal(rec.bucket.length, 1, "the rate-limit bucket still counts the attempt even though parsing failed");
});
