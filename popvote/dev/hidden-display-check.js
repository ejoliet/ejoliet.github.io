// Dev-only regression check for a real bug found while eyeballing a
// screenshot of the app: several elements (#gvQnaWrap, #reactBar,
// #liveCanvas) are shown/hidden by toggling the `hidden` IDL property, but
// also had an author CSS rule setting `display` on that same selector
// (e.g. `#reactBar{display:flex}`). Per the CSS cascade, author-origin
// rules always beat the user-agent stylesheet's `[hidden]{display:none}`
// regardless of specificity — so those elements stayed visible even while
// "hidden". Fixed by scoping the display-setting rules to `:not([hidden])`.
// This script locks that in.
//
// Run from the repo root with a static server already up:
//   python3 -m http.server 8080 &
//   PLAYWRIGHT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node popvote/dev/hidden-display-check.js http://localhost:8080

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:8080";
const CHROME = process.env.PLAYWRIGHT_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const fakePeerJs = fs.readFileSync(path.join(__dirname, "fake-peerjs.js"), "utf8");
const fakeQr = 'window.qrcode = function(){ return { addData(){}, make(){}, createSvgTag(){ return "<svg></svg>"; } }; };';

function assert(cond, msg){ if (!cond) throw new Error("FAIL: " + msg); console.log("PASS:", msg); }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  await page.route("**/peerjs.min.js", route => route.fulfill({ contentType: "application/javascript", body: fakePeerJs }));
  await page.route("**/qrcode.js", route => route.fulfill({ contentType: "application/javascript", body: fakeQr }));
  await page.goto(BASE + "/popvote/dev/parent.html");
  const hostFrame = page.frame({ name: "hostFrame" });
  await hostFrame.click("#hostBtn");
  await hostFrame.waitForFunction(() => document.getElementById("hdCode").textContent !== "----");
  await hostFrame.fill("#newTitle", "Coffee or tea?");
  await hostFrame.click("#addActBtn");
  await hostFrame.click("#actList .actItem button");
  const code = await hostFrame.textContent("#hdCode");
  await page.evaluate(c => { document.getElementById("guestFrame").src = "/popvote/index.html?j=" + c; }, code);
  const guestFrame = page.frame({ name: "guestFrame" });
  await guestFrame.waitForSelector("#guestView.on");
  await guestFrame.waitForSelector("#gvOptions button");

  const qnaDisplay = await guestFrame.$eval("#gvQnaWrap", el => getComputedStyle(el).display);
  assert(qnaDisplay === "none", "#gvQnaWrap must be display:none while a poll (not qna) is active — got " + qnaDisplay);

  const reactDisplay = await guestFrame.$eval("#reactBar", el => getComputedStyle(el).display);
  assert(reactDisplay === "flex", "#reactBar must be visible (flex) once an activity is active — got " + reactDisplay);

  // switch to qna and confirm gvQnaWrap now shows, with the intended flex layout
  await hostFrame.selectOption("#newKind", "qna");
  await hostFrame.fill("#newTitle", "Ask me anything");
  await hostFrame.click("#addActBtn");
  const btns = await hostFrame.$$("#actList .actItem button");
  await btns[btns.length - 1].click();
  await guestFrame.waitForSelector("#gvQnaWrap:not([hidden])", { timeout: 5000 });
  const qnaDisplay2 = await guestFrame.$eval("#gvQnaWrap", el => getComputedStyle(el).display);
  assert(qnaDisplay2 === "flex", "#gvQnaWrap must be display:flex once qna is the active activity — got " + qnaDisplay2);

  // canvas hidden for qna (no live chart), confirm it's genuinely not displayed
  const canvasDisplay = await hostFrame.$eval("#liveCanvas", el => getComputedStyle(el).display);
  assert(canvasDisplay === "none", "#liveCanvas must be display:none for a qna activity (no chart) — got " + canvasDisplay);

  // and back to poll, canvas should show as block again
  await hostFrame.selectOption("#newKind", "poll");
  await hostFrame.fill("#newTitle", "Second poll");
  await hostFrame.click("#addActBtn");
  const btns2 = await hostFrame.$$("#actList .actItem button");
  await btns2[btns2.length - 1].click();
  await new Promise(r => setTimeout(r, 200));
  const canvasDisplay2 = await hostFrame.$eval("#liveCanvas", el => getComputedStyle(el).display);
  assert(canvasDisplay2 === "block", "#liveCanvas must be display:block again for a poll activity — got " + canvasDisplay2);

  await browser.close();
  console.log("\nALL HIDDEN/DISPLAY REGRESSION CHECKS PASSED");
})().catch(e => { console.error(e); process.exit(1); });
