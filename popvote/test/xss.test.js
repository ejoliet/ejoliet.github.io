"use strict";
// Confirms peer-sourced strings (names, questions, words) never reach the
// DOM through innerHTML — only textContent — so a guest can't inject markup
// via a poisoned name or question. See the AIDEV-NOTE above clearEl() in
// index.html for the rule this test enforces.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./helpers/load-app.js");

const PAYLOAD_TXT = '<img src=x onerror="window.__pwned=true">';
const PAYLOAD_NAME = "<b>evil</b><script>window.__pwned2=true<\/script>";

test("renderGuestQnaList never interprets a malicious question/name as markup", () => {
  const { window, document } = loadApp();
  window.guestState.currentAct = { id: "act1", kind: "qna", title: "Q&A" };
  window.renderGuestQnaList([
    { qid: "q1", txt: PAYLOAD_TXT, n: PAYLOAD_NAME, up: 3, ans: false },
  ]);

  const list = document.getElementById("gvQnaList");
  assert.equal(list.querySelector("img"), null, "no real <img> element should have been created");
  assert.equal(list.querySelector("script"), null, "no real <script> element should have been created");
  assert.equal(window.__pwned, undefined, "onerror handler must never execute");
  assert.equal(window.__pwned2, undefined, "injected script must never execute");
  assert.ok(list.textContent.includes(PAYLOAD_TXT), "the literal text should still be visible to the user, just inert");
  assert.ok(list.textContent.includes(PAYLOAD_NAME));
});

test("host Q&A moderation panel (renderQnaModeration) also renders peer text inertly", () => {
  const { window, document } = loadApp();
  const act = { id: "act1", kind: "qna" };
  window.session.activities = [act];
  window.session.activeId = "act1";
  window.qnaStore["act1"] = new Map([
    ["q1", { txt: PAYLOAD_TXT, n: PAYLOAD_NAME, up: new Set(["g1"]), ans: false, hidden: false }],
  ]);
  window.renderQnaModeration(act);

  const list = document.getElementById("qnaModList");
  assert.equal(list.querySelector("img"), null);
  assert.equal(list.querySelector("script"), null);
  assert.ok(list.textContent.includes(PAYLOAD_TXT));
});

test("recap HTML string-building (a genuinely different code path) escapes the same payload instead", () => {
  const { window } = loadApp();
  const html = window.qnaListToHTML([{ qid: "q1", txt: PAYLOAD_TXT, n: PAYLOAD_NAME, up: 1, ans: false }]);
  assert.ok(!html.includes("<img"), "the recap's own markup string must not contain a live <img> tag");
  assert.ok(!html.includes("<script>window.__pwned2"), "must not contain a live <script> tag");
  assert.ok(html.includes("&lt;img"), "the payload should appear escaped as text");
});
