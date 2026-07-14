"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app.js");

test("Store round-trips a value through real localStorage", () => {
  const { window } = loadApp();
  window.Store.set("license", { holder: "a@b.com" });
  // jsdom's window is a separate realm, so its plain objects aren't
  // reference-equal to Node-realm object literals even with identical
  // structure — compare via JSON instead of assert.deepEqual.
  assert.equal(JSON.stringify(window.Store.get("license", null)), JSON.stringify({ holder: "a@b.com" }));
  // namespaced under pv.* per the build prompt's wire/storage spec
  assert.equal(window.localStorage.getItem("pv.license"), JSON.stringify({ holder: "a@b.com" }));
});

test("Store.get falls back to the default when the key is missing", () => {
  const { window } = loadApp();
  assert.equal(window.Store.get("nope", "fallback"), "fallback");
});

test("Store degrades to an in-memory store when localStorage throws (artifact previews, privacy modes)", () => {
  const { window } = loadApp();
  const boom = () => { throw new DOMException("blocked", "SecurityError"); };
  Object.defineProperty(window, "localStorage", { get: boom, configurable: true });

  window.Store.set("license", "raw-string-value");
  assert.equal(window.Store.get("license", null), "raw-string-value",
    "in-memory fallback must round-trip even though every localStorage access throws");
  assert.equal(window.Store.get("missing", "def"), "def");
});
