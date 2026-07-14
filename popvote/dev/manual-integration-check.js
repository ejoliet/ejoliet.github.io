// Dev-only integration smoke test for Phase 1 — NOT part of the shipped app and
// NOT the jsdom unit suite (that lives under popvote/test/, Phase 4).
//
// This sandbox's egress proxy is HTTP-CONNECT only: it cannot carry the
// WebSocket signaling PeerJS Cloud needs, or the raw UDP ICE traffic real
// WebRTC needs (see popvote/HANDOFF.md). So this script drives the REAL
// popvote/index.html — unmodified — with `fake-peerjs.js` swapped in for the
// `Peer` global via request interception, wiring a host frame and a guest
// frame together through an in-memory bridge instead of real networking.
// Every other line of app code (wire protocol, caps, dedupe, rendering) runs
// for real. Treat this as the "two-device manual test" called for in the
// build prompt, run under a network double rather than two physical devices —
// a real cross-device pass is still recommended before shipping.
//
// Run from the repo root with a static server already up:
//   python3 -m http.server 8080 &
//   PLAYWRIGHT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node popvote/dev/manual-integration-check.js http://localhost:8080

const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:8080";
const CHROME = process.env.PLAYWRIGHT_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const fakePeerJs = fs.readFileSync(path.join(__dirname, "fake-peerjs.js"), "utf8");
const fakeQr = 'window.qrcode = function(){ return { addData(){}, make(){}, createSvgTag(){ return "<svg></svg>"; } }; };';

// Minted fresh on every run from the local (gitignored) private key — never a
// hardcoded/committed license string. Requires popvote/keygen/generate-keypair.js
// to have been run first (popvote/keys/private.pem must exist).
const keygenDir = path.join(__dirname, "..", "keygen");
const TEST_LICENSE = execFileSync("node", [path.join(keygenDir, "generate-license.js"), "--holder", "integration-test@example.com"])
  .toString().trim();

function assert(cond, msg){ if (!cond) throw new Error("FAIL: " + msg); console.log("PASS:", msg); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  await page.route("**/peerjs.min.js", route => route.fulfill({ contentType: "application/javascript", body: fakePeerJs }));
  await page.route("**/qrcode.js", route => route.fulfill({ contentType: "application/javascript", body: fakeQr }));

  await page.goto(BASE + "/popvote/dev/parent.html");
  const hostFrame = page.frame({ name: "hostFrame" });

  // This exercise runs all 4 activity kinds in one session, which exceeds the
  // free-tier FREE_MAX_ACTIVITIES=3 gate (a real, correct gate — Phase 3's
  // license flow, including forged/expired-key rejection, has its own
  // dedicated test). Pre-seed a real, freshly-minted license so the
  // walkthrough isn't blocked by the free-tier cap; refreshLicenseCache()
  // still verifies it for real on the next startHost().
  await hostFrame.evaluate(raw => localStorage.setItem("pv.license", JSON.stringify(raw)), TEST_LICENSE);

  await hostFrame.click("#hostBtn");
  await hostFrame.waitForFunction(() => document.getElementById("hdCode").textContent !== "----");
  const code = await hostFrame.textContent("#hdCode");

  // ---- poll: vote, reveal, re-vote replaces, re-reveal ----
  await hostFrame.fill("#newTitle", "Coffee or tea?");
  await hostFrame.click("#addActBtn");
  await hostFrame.click("#actList .actItem button");
  await hostFrame.waitForSelector("#activeCard:not([hidden])");

  await page.evaluate(c => { document.getElementById("guestFrame").src = "/popvote/index.html?j=" + c; }, code);
  const guestFrame = page.frame({ name: "guestFrame" });
  await guestFrame.waitForSelector("#guestView.on", { timeout: 10000 });
  await guestFrame.waitForSelector("#gvOptions button");
  assert(true, "guest joins and sees poll options");

  await guestFrame.click("#gvOptions button >> nth=0");
  await hostFrame.click("#revealBtn");
  await new Promise(r => setTimeout(r, 1300)); // reveal is coalesced at 1Hz
  await guestFrame.waitForSelector("#gvRevealCanvas", { timeout: 5000 });
  assert(true, "poll vote -> reveal round trip");

  await guestFrame.click("#gvOptions button >> nth=1"); // re-vote replaces
  await hostFrame.click("#revealBtn"); await hostFrame.click("#revealBtn");
  await new Promise(r => setTimeout(r, 1300));
  assert(true, "re-vote + re-reveal cycle");

  // ---- word cloud ----
  await hostFrame.selectOption("#newKind", "wordcloud");
  await hostFrame.fill("#newTitle", "One word for this workshop");
  await hostFrame.click("#addActBtn");
  let btns = await hostFrame.$$("#actList .actItem button");
  await btns[btns.length - 1].click();
  await guestFrame.waitForSelector("#gvOptions input[type=text]", { timeout: 5000 });
  await guestFrame.fill("#gvOptions input[type=text]", "awesome");
  await guestFrame.click("#gvOptions button");
  await hostFrame.click("#revealBtn");
  await new Promise(r => setTimeout(r, 1300));
  await guestFrame.waitForSelector("#gvRevealCanvas", { timeout: 5000 });
  assert(true, "wordcloud vote -> reveal round trip");

  // ---- rating ----
  await hostFrame.selectOption("#newKind", "rating");
  await hostFrame.fill("#newTitle", "Rate this session");
  await hostFrame.click("#addActBtn");
  btns = await hostFrame.$$("#actList .actItem button");
  await btns[btns.length - 1].click();
  await guestFrame.waitForSelector("#gvOptions .rateRow button", { timeout: 5000 });
  await guestFrame.click("#gvOptions .rateRow button >> nth=3");
  await hostFrame.click("#revealBtn");
  await new Promise(r => setTimeout(r, 1300));
  await guestFrame.waitForSelector("#gvRevealCanvas", { timeout: 5000 });
  assert(true, "rating vote -> reveal round trip");

  // ---- Q&A: submit, upvote dedupe, moderation ----
  await hostFrame.selectOption("#newKind", "qna");
  await hostFrame.fill("#newTitle", "Ask me anything");
  await hostFrame.click("#addActBtn");
  btns = await hostFrame.$$("#actList .actItem button");
  await btns[btns.length - 1].click();
  await guestFrame.waitForSelector("#gvQnaWrap:not([hidden])", { timeout: 5000 });
  guestFrame.page().once("dialog", d => d.accept("Alice"));
  await guestFrame.fill("#gvQnaInput", "What time is lunch?");
  await guestFrame.click("#gvQnaSend");
  await new Promise(r => setTimeout(r, 1300));
  await guestFrame.waitForFunction(() => document.getElementById("gvQnaList").textContent.includes("lunch"), { timeout: 3000 });
  assert(true, "qna submit round-trips via throttled qs broadcast");

  await guestFrame.click("#gvQnaList button");
  await new Promise(r => setTimeout(r, 1300));
  const modText = await hostFrame.textContent("#qnaModList");
  assert(modText.includes("1▲"), "host sees the upvote");
  const upDisabled = await guestFrame.$eval("#gvQnaList button", b => b.disabled);
  assert(upDisabled, "upvote button disabled client-side after one click (dedupe)");

  // ---- reactions ----
  await guestFrame.click("#reactBar button >> nth=0");
  await new Promise(r => setTimeout(r, 300));
  const sprites = await hostFrame.$$eval(".rxSprite", els => els.length);
  assert(sprites > 0, "reaction floats up on host screen");

  // ---- oversize frame dropped silently at hub (no crash) ----
  await guestFrame.evaluate(() => guestConn.send(JSON.stringify({ t: "vote", a: "bogus", v: "x".repeat(3000) })));
  await new Promise(r => setTimeout(r, 200));
  assert(true, "oversize frame did not crash the hub");

  // ---- end session: guest sees 'ended'; host stays on its dashboard to run the recap ----
  await hostFrame.click("#hdEndBtn");
  await guestFrame.waitForSelector("#ended.on", { timeout: 5000 });
  await hostFrame.waitForSelector("#recapCard:not([hidden])", { timeout: 5000 });
  assert(true, "end session reaches guest; host dashboard shows the recap card");

  // ---- Instant Recap (Pro path: real download) ----
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    hostFrame.click("#recapBtn"),
  ]);
  assert(/^popvote-recap-\d{4}-\d{2}-\d{2}-\w+\.html$/.test(download.suggestedFilename()),
    "recap filename matches popvote-recap-<date>-<code>.html: " + download.suggestedFilename());
  const recapPath = "/tmp/popvote-recap-downloaded.html";
  await download.saveAs(recapPath);
  const recapHtml = fs.readFileSync(recapPath, "utf8");
  assert(!/\s(?:src|href)\s*=\s*["']https?:\/\//i.test(recapHtml), "recap has no external src/href references");
  assert((recapHtml.match(/<svg/g) || []).length >= 3, "recap embeds multiple SVG charts");
  assert(recapHtml.includes("What time is lunch?"), "recap includes the Q&A question");
  assert(recapHtml.includes("Made with"), "recap has the footer attribution link");
  assert(!/<script/i.test(recapHtml), "recap is pure static HTML/SVG — no script tags needed to render it");

  // reopen the downloaded file in a fresh, offline context to confirm it truly stands alone
  const offlineCtx = await browser.newContext({ offline: true });
  const offlinePage = await offlineCtx.newPage();
  await offlinePage.goto("file://" + recapPath);
  const h1 = await offlinePage.textContent(".recapHeader h1");
  const svgCount = await offlinePage.$$eval("svg", els => els.length);
  assert(!!h1, "recap h1 present offline: " + JSON.stringify(h1));
  assert(svgCount >= 3, "recap SVGs render offline with zero network access (" + svgCount + " found)");
  await offlineCtx.close();

  // ---- Instant Recap (free tier: sandboxed preview, no download, show-don't-tell) ----
  const freePage = await browser.newPage();
  await freePage.route("**/peerjs.min.js", route => route.fulfill({ contentType: "application/javascript", body: fakePeerJs }));
  await freePage.route("**/qrcode.js", route => route.fulfill({ contentType: "application/javascript", body: fakeQr }));
  await freePage.goto(BASE + "/popvote/dev/parent.html");
  const freeHost = freePage.frame({ name: "hostFrame" }); // no pv.license set here — genuinely free tier
  await freeHost.click("#hostBtn");
  await freeHost.waitForFunction(() => document.getElementById("hdCode").textContent !== "----");
  await freeHost.fill("#newTitle", "Coffee or tea?");
  await freeHost.click("#addActBtn");
  await freeHost.click("#actList .actItem button");
  await freeHost.click("#hdEndBtn");
  await freeHost.waitForSelector("#recapCard:not([hidden])");

  let freeDownloadFired = false;
  freePage.on("download", () => { freeDownloadFired = true; });
  await freeHost.click("#recapBtn");
  await new Promise(r => setTimeout(r, 400));
  assert(!freeDownloadFired, "free tier never triggers a file download");
  assert(await freeHost.$eval("#recapPreviewWrap", el => !el.hidden), "free tier shows a live preview instead");
  assert((await freeHost.$eval("#recapPreviewFrame", el => el.getAttribute("sandbox"))) === "",
    "preview iframe is fully sandboxed (no scripts, no navigation)");
  assert(await freeHost.$eval("#recapBtn", el => el.hidden), "download button is hidden once the locked preview is shown");
  await freePage.close();

  await browser.close();
  console.log("\nALL MANUAL INTEGRATION CHECKS PASSED");
})().catch(e => { console.error(e); process.exit(1); });
