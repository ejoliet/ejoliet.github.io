"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app.js");

test("mulberry32 is deterministic for a given seed", () => {
  const { window } = loadApp();
  const seqA = Array.from({ length: 5 }, window.mulberry32(42));
  const seqB = Array.from({ length: 5 }, window.mulberry32(42));
  assert.deepEqual(seqA, seqB);
  const seqC = Array.from({ length: 5 }, window.mulberry32(43));
  assert.notDeepEqual(seqA, seqC, "a different seed should (overwhelmingly likely) produce a different sequence");
});

test("computeWordCloudLayout produces identical positions for the same words+seed", () => {
  const { window } = loadApp();
  const words = [
    { text: "awesome", count: 5 },
    { text: "great", count: 3 },
    { text: "meh", count: 1 },
  ];
  const seed = window.seedFromString("ROOM1" + "act1");
  const layoutA = window.computeWordCloudLayout(words, seed, 640, 360);
  const layoutB = window.computeWordCloudLayout(words, seed, 640, 360);
  assert.deepEqual(layoutA, layoutB, "same words + same seed must place every word at the same x/y/size — this is what keeps the live view and the Instant Recap visually identical");

  const layoutDifferentSeed = window.computeWordCloudLayout(words, seed + 1, 640, 360);
  assert.notDeepEqual(layoutA, layoutDifferentSeed);
});

test("computeBarLayout marks the single winner and computes fractions relative to the max", () => {
  const { window } = loadApp();
  const layout = window.computeBarLayout([
    { label: "A", count: 2 },
    { label: "B", count: 10 },
    { label: "C", count: 0 },
  ]);
  assert.equal(layout[1].isWinner, true);
  assert.equal(layout[0].isWinner, false);
  assert.equal(layout[2].isWinner, false);
  assert.equal(layout[1].frac, 1);
  assert.equal(layout[0].frac, 0.2);
  assert.equal(layout[2].frac, 0);
});

test("computeBarLayout: an all-zero result has no winner (avoids highlighting an arbitrary option)", () => {
  const { window } = loadApp();
  const layout = window.computeBarLayout([{ label: "A", count: 0 }, { label: "B", count: 0 }]);
  assert.ok(layout.every(row => row.isWinner === false));
});
