// Dev-only check for Phase 3 (Ed25519 licensing) — not the jsdom unit suite.
// Requires popvote/keygen/generate-keypair.js to have been run first
// (popvote/keys/private.pem must exist locally; it's gitignored and never
// committed). Mints fresh test licenses on every run via the real keygen
// scripts — no license string is ever hardcoded or committed.
//
// Run from the repo root with a static server already up:
//   python3 -m http.server 8080 &
//   PLAYWRIGHT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node popvote/dev/license-flow-check.js http://localhost:8080

const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://localhost:8080";
const CHROME = process.env.PLAYWRIGHT_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const fakePeerJs = fs.readFileSync(path.join(__dirname, "fake-peerjs.js"), "utf8");
const fakeQr = 'window.qrcode = function(){ return { addData(){}, make(){}, createSvgTag(){ return "<svg></svg>"; } }; };';

const keygenDir = path.join(__dirname, "..", "keygen");
function mintLicense(args){
  return execFileSync("node", [path.join(keygenDir, "generate-license.js"), ...args]).toString().trim();
}
const VALID = mintLicense(["--holder", "license-check@example.com"]);
const EXPIRED = mintLicense(["--holder", "license-check@example.com", "--exp", "2020-01-01"]);
const FORGED = VALID.slice(0, -4) + (VALID.slice(-4) === "AAAA" ? "BBBB" : "AAAA"); // corrupt the signature tail

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

  assert((await hostFrame.textContent("#licenseBadge")) === "Free", "starts on Free tier");

  async function tryActivate(raw){
    if (await hostFrame.$eval("#licensePanel", el => el.hidden)) await hostFrame.click("#licenseBadge");
    await hostFrame.fill("#licenseInput", raw);
    await hostFrame.click("#licenseActivateBtn");
  }

  await tryActivate(FORGED);
  await hostFrame.waitForFunction(() => document.getElementById("licenseError").textContent.length > 0, { timeout: 5000 });
  assert((await hostFrame.textContent("#licenseError")).includes("isn't valid"), "forged key rejected with a friendly error");
  assert((await hostFrame.textContent("#licenseBadge")) === "Free", "still Free after a forged key");

  await tryActivate("not-a-license-at-all");
  await hostFrame.waitForFunction(() => document.getElementById("licenseError").textContent.length > 0, { timeout: 5000 });
  assert(true, "garbage input rejected without throwing");

  await tryActivate(EXPIRED);
  await hostFrame.waitForFunction(() => document.getElementById("licenseError").textContent.length > 0, { timeout: 5000 });
  assert((await hostFrame.textContent("#licenseBadge")) === "Free", "expired key does not unlock Pro");

  await tryActivate(VALID);
  await hostFrame.waitForFunction(() => document.getElementById("licenseBadge").textContent === "Pro", { timeout: 5000 });
  assert(true, "valid signed key unlocks Pro");
  assert((await hostFrame.textContent("#guestCapBadge")) === "100", "guest cap switches to 100 once Pro");

  const storedRaw = await hostFrame.evaluate(() => JSON.parse(localStorage.getItem("pv.license")));
  assert(storedRaw === VALID, "raw license string persisted to localStorage under pv.license");

  await page.evaluate(() => { document.getElementById("hostFrame").src = "/popvote/index.html"; });
  const hostFrame2 = page.frame({ name: "hostFrame" });
  await hostFrame2.waitForLoadState();
  await hostFrame2.click("#hostBtn");
  await hostFrame2.waitForFunction(() => document.getElementById("hdCode").textContent !== "----");
  assert((await hostFrame2.textContent("#licenseBadge")) === "Pro", "Pro persists across a fresh session (re-verified at startHost)");

  for (let i = 0; i < 4; i++){
    await hostFrame2.fill("#newTitle", "Activity " + i);
    await hostFrame2.click("#addActBtn");
  }
  const count = await hostFrame2.$$eval("#actList .actItem", els => els.length);
  assert(count === 4, "Pro allows a 4th activity past the free cap of 3 (found " + count + ")");
  assert(await hostFrame2.$eval("#freeGateNote", el => el.hidden), "free-tier gate note stays hidden once Pro");

  await browser.close();
  console.log("\nALL LICENSE FLOW CHECKS PASSED");
})().catch(e => { console.error(e); process.exit(1); });
