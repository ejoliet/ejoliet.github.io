# popvote — HANDOFF

Living log of build state, spike results, burned items, open questions, and
the exact next step. Updated at every phase boundary.

## State: all 4 phases complete

## Phase log

### Phase 0 — Spike — **GO**

`popvote/dev/spike.html`, run headless via Playwright/Chromium
(`chromium-1194`, no GUI available in this sandbox).

**1. Burst fan-in** — 100 loopback-simulated guest votes fired at random
offsets inside a 2000ms window, aggregated into a `Map` keyed by guest id
(same shape as the real hub's `{t:"vote", a, v}` handler: O(1) set, re-vote
replaces). 5 settled trials (300ms warm-up before measuring, to exclude
page-load noise):

| trial | received | unique tallied | worst frame delta |
|---|---|---|---|
| 1 | 100/100 | 100/100 | 16.8ms |
| 2 | 100/100 | 100/100 | 16.8ms |
| 3 | 100/100 | 100/100 | 16.8ms |
| 4 | 100/100 | 100/100 | 16.8ms |
| 5 | 100/100 | 100/100 | 16.8ms |

Zero vote loss across every trial; worst single frame 16.8ms, well under the
50ms budget (a cold, unwarmed first run once showed 66.7ms — page-load
noise, not aggregation cost; excluded from the table above but recorded here
for honesty).

**2. Recap generation** — fake session (3 activities: 4-option poll, 50-word
word cloud, 20-question Q&A) rendered twice with the same seed (424242) via
pure functions (`mulberry32`, `renderBarChartSVG`, `renderWordCloudSVG`,
`renderQnaListHTML`, `renderTimelineSVG`) serialized with
`Function.prototype.toString()` into the recap's own inline `<script>`.
Result: **byte-identical** output across both runs (13,825 bytes), **no**
external `src=`/`href=` references, and the downloaded file was reopened in a
**second, offline** browser context — `<h1>` and all 3 `<svg>` elements
rendered correctly with zero network access.

**Browser coverage**: Chromium only — this sandbox has no Firefox or iOS
Safari runtime available (`/opt/pw-browsers` ships Chromium only, and
`playwright install` is blocked by `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).
**Firefox and iOS Safari are untested** — flagged as an explicit gap, not
silently assumed to pass. Recommend a manual pass on real devices before
calling this production-ready.

**GO decision**: proceeding to Phase 1. Both primitives pass on the one
browser available; the untested-browser gap is carried forward to the final
acceptance checklist rather than blocking the whole build.

**Burned items**: none — first attempt on both primitives succeeded.

### Phase 1 — Core loop — **done**

`popvote/index.html`: host/guest onboarding (4-char ambiguity-free room
codes, QR via CDN-pinned `qrcode-generator@1.4.4`, join link/share/copy),
all 4 activity types (poll, word cloud, open Q&A, 1–5 rating), host-side live
canvas viz (bar race + seeded word cloud, both driven by pure `computeBarLayout`
/ `computeWordCloudLayout` functions shared with Phase 2's recap), reveal-to-
audience, Q&A moderation (mark answered / hide), reactions, the full wire
protocol, inbound caps (2KB size, 200 Q&A entries, 500-char hard/240-char UI
text cap, 5 msg/sec/guest hub-side rate limit + a client-side mirror that
toasts on throttled votes), resilience (capped backoff reconnect, guest
auto-rejoin, host `beforeunload` guard), and free-tier gates (3 activities /
30 guests) stubbed against a `Store`-backed `isPro()` that Phase 3 will wire
to real Ed25519 verification.

**Testing approach + a genuine environment constraint**: this sandbox's
egress proxy is HTTP-CONNECT only (confirmed via `/root/.ccr/README.md`) —
it cannot carry PeerJS Cloud's WebSocket signaling or real WebRTC's raw UDP
ICE traffic, so an actual two-device (or two-real-browser) PeerJS session
cannot be exercised here. Built `popvote/dev/fake-peerjs.js`, a minimal
network-layer test double with the same `Peer`/`DataConnection` API surface
popvote uses, backed by an in-memory bridge (`window.top.__PV_NET`) instead
of real signaling. `popvote/dev/parent.html` loads the **real, unmodified**
`index.html` in a host iframe and a guest iframe side by side so both share
that bridge, and `popvote/dev/manual-integration-check.js` drives them with
Playwright through the full house style. Every line of app logic that ran
was the real product code — only the transport library was swapped. Result,
**all checks passed**: poll vote → reveal, re-vote-replaces → re-reveal, word
cloud vote → reveal, rating vote → reveal, Q&A submit → throttled `qs`
round-trip, upvote → hub dedupe → client-side re-click disabled, reactions
float on the host screen, an oversize (3KB) frame is dropped at the hub
without crashing it, and `end` reaches both host and guest.

**Bugs found and fixed via this harness** (both were real defects in
`index.html`, not test artifacts):
1. An `AIDEV-NOTE` comment contained a literal `</script>` inside a code
   comment — HTML parses that as the real closing tag regardless of JS
   comment syntax, silently truncating the whole app script after that
   point (`startHost`/`startGuest`/etc. never defined). Fixed by rewording
   the comment to avoid the substring.
2. `let guestPeer, guestConn` (and `guestState`) were declared textually
   after the boot section, but the boot section calls `startGuest()`
   synchronously for guest page loads — a `let` temporal-dead-zone
   `ReferenceError`. Fixed by moving those declarations above `/* boot */`.

**One test-harness false alarm, not a product bug**: an early version of the
integration script added all 4 activity kinds to a single session, which
correctly hit the free-tier `FREE_MAX_ACTIVITIES=3` gate on the 4th — the
gate silently (and correctly) refused to create it, so the script then
clicked a stale, already-active "Start" button and hung. Fixed the *test* to
simulate an unlocked Pro license before the walkthrough; the free-tier gate
itself is working as designed and gets its own dedicated test in Phase 4.

**Known v1 rough edges, carried forward rather than fixed now** (none block
Phase 2):
- A guest's previous reveal chart (canvas) stays visible underneath the new
  activity's controls until the *next* reveal repaints it, since the reveal
  canvas lives outside the `#gvOptions` container that gets cleared on each
  activity switch. Cosmetic only.
- Reconnect issues a brand-new PeerJS peer id for the guest, so the hub's
  "one vote per guest" dedupe (keyed by peer id) does not carry across a
  true reconnect — acceptable for v1 per the build prompt's host-refresh-
  ends-session stance, but noted here since it's the same class of gap.
- Firefox/iOS Safari still untested (inherited from Phase 0 — this sandbox
  cannot run them at all, real or simulated).

### Phase 2 — Instant Recap — **done**

Added to `popvote/index.html`: `barLayoutToSVG` / `wordCloudLayoutToSVG` /
`qnaListToHTML` / `timelineToSVG` as SVG/HTML-string siblings to the
existing `computeBarLayout` / `computeWordCloudLayout` pure layout functions,
a `session.responseLog` per-minute counter (`recordResponse()`, called from
`handleVote`/`handleQuestion`), and `buildRecapHTML()` which assembles a
single self-contained document: header (title/date/peak guests/total
responses), one section per activity in session order (chart + response
count, winning option highlighted for polls/ratings via the same
`isWinner` flag the live canvas uses), a participation sparkline, and a
"Made with popvote" footer link.

**Design decision, deviating from the Phase 0 spike**: the spike serialized
the render functions into the recap via `Function.prototype.toString()` so
the *output file* could regenerate its own charts. The real feature doesn't
need that: `buildRecapHTML()` runs synchronously inside the already-loaded
host tab, so it can just *call* `computeBarLayout`/`computeWordCloudLayout`
directly and bake the resulting SVG into the output as static markup. The
shared-code requirement ("recap must reuse the same layout code as the live
view") is satisfied by construction — same function objects, same call —
without shipping any JS in the recap at all. Net effect: the recap file has
**zero `<script>` tags**, which is strictly more robust for "opens offline
forever" than the spike's approach (works even somewhere that blocks script
execution, e.g. an email client's HTML preview).

**Free vs Pro** (`endSession()` / `$("recapBtn")` handler in `index.html`):
host clicks "End session" → guests get `{t:"end"}` and see their `ended`
screen; the **host stays on its own dashboard** (deviates from the Phase-1
placeholder that sent the host to the shared `ended` screen too — that
screen has nothing for a host to do) with the activities panel replaced by
the recap card. Pro calls `downloadRecap()` (Blob → `<a download>` →
`popvote-recap-<date>-<code>.html`). Free calls `showRecapPreview()`: the
exact same generated HTML rendered live inside a `sandbox=""` iframe (no
scripts, no same-origin, no downloads/navigation) with the download button
hidden and an upgrade note — "show, don't tell" per the build prompt's own
recommendation, resolving that open question.

**Verified** via `popvote/dev/manual-integration-check.js` (extended) and a
one-off free-tier script: recap filename pattern, no external
`src=`/`href=` refs, no `<script>` tags, ≥3 embedded SVGs, the actual Q&A
question and footer attribution present in the output, and — the strongest
check — the downloaded file reopened in a **second, offline** browser
context still renders its `<h1>` and every SVG. Separately confirmed the
free path never fires a `download` event, shows the sandboxed preview, and
hides the download button. A screenshot of a generated recap was reviewed
for typographic/layout quality (paper/ink palette matching the live app,
card-per-activity layout, print-friendly `@media print` rule); the only
issue found — a single-bucket participation timeline rendering as an
invisible zero-length polyline — was fixed by drawing per-point dots and a
baseline gridline so a short/sparse session still shows *something* rather
than an apparently-broken blank chart.

### Phase 3 — Monetization — **done**

`popvote/keygen/` (local-only, never runs in the browser or CI):
`generate-keypair.js` (Node's built-in Ed25519 support — refuses to
overwrite an existing key, since rotating it invalidates every license
already sold), `generate-license.js` (mints
`base64url(JSON payload) + "." + base64url(signature)` strings for a given
`--holder` and optional `--exp`), and a `README.md` documenting the flow:
Lemon Squeezy is the merchant of record for payment; popvote's own Ed25519
signature is the license mechanism, verified fully offline. Generated the
real project keypair this session — `popvote/keys/{private,public}.pem`
exist locally (confirmed gitignored via `git check-ignore -v`) and the
printed raw public key is baked into `index.html` as
`LICENSE_PUBLIC_KEY_B64`.

In `index.html`: `verifyLicenseString()` uses WebCrypto
(`crypto.subtle.importKey("raw", ..., {name:"Ed25519"})` /
`crypto.subtle.verify`) to check a license string's signature and expiry
with zero network calls. Confirmed this is genuinely cross-compatible —
Node-signed payloads verify correctly in Chromium's WebCrypto and vice
versa — by hand-testing both directions before wiring it into the app.
Because WebCrypto is async but `isPro()`/`guestCap()`/`activityCap()` are
called synchronously all over the UI, `refreshLicenseCache()` does the one
async check ("validate once at session creation", per the build prompt)
and caches the outcome in an in-memory variable; `startHost()` is now
`async` and awaits it before creating the Peer. A "Pro license" panel
(click the `Free`/`Pro` badge in the host top bar) lets a host paste a key;
`activateLicense()` verifies it, and on success persists the *raw* string
via `Store.set("license", raw)` — re-verified for real on every future
`startHost()`, not just trusted from cache forever. Free-tier gates (3
activities / 30 guests / locked recap preview) already existed from Phase
1/2 behind the `isPro()` seam and needed no changes now that it's real.

**Verified** with `popvote/dev/license-flow-check.js`, which mints fresh
test licenses on every run via the real keygen scripts (never a hardcoded
license string, per the build prompt's own commit-hygiene rule): a forged
key (corrupted signature tail) is rejected with the friendly
"isn't valid" message and stays on Free; an expired key is rejected; a
valid key unlocks Pro immediately (guest cap flips to 100, the free
activity-count gate note clears); the raw license persists to
`localStorage.pv.license` and is re-verified successfully after a full page
reload/new session. `popvote/dev/manual-integration-check.js` was updated
the same way — it used to fake Pro with a bogus localStorage blob, which
silently stopped working the moment real verification landed (correctly:
`refreshLicenseCache()` rejected it and cleared the bad value). It now
mints a real license via `execFileSync` at test-run time instead.

### Phase 4 — Polish + tests — **done**

**jsdom test suite** (`popvote/test/`, `npm test` — Node's built-in test
runner + `node --test`, no test framework dependency beyond `jsdom` itself):

- `test/helpers/load-app.js` loads the **real, unmodified** `popvote/index.html`
  into a jsdom window — the two CDN `<script src>` tags (PeerJS,
  qrcode-generator) are swapped for minimal inline stubs via string
  replacement so no test needs real network access; every other line is the
  shipped code, not a reimplementation of it.
- `test/pure-functions.test.js` — `mulberry32` determinism, `computeWordCloudLayout`
  determinism (same words+seed ⇒ identical positions — the property that
  keeps the live view and the recap visually identical), `computeBarLayout`
  winner-highlighting including the all-zero edge case.
- `test/store.test.js` — `Store` round-trips through real `localStorage`,
  falls back to the default for a missing key, and degrades to an in-memory
  store when `localStorage` itself throws (artifact previews, locked-down
  privacy modes).
- `test/xss.test.js` — a payload like `<img src=x onerror=...>` in a
  question or name never becomes a real DOM element (checked via
  `renderGuestQnaList` and the host's `renderQnaModeration`); separately
  confirms the *recap's* markup-string builders (`qnaListToHTML`) escape the
  same payload instead, since that's a genuinely different code path
  (building an HTML string vs. `textContent`).
- `test/reconnect-guard.test.js` — `scheduleGuestRetry()` increments and
  keeps retrying under `RECONNECT_MAX_ATTEMPTS`, surfaces a manual retry
  button once the cap is exceeded (never fails silently), and the retry
  button's own click handler resets state and re-attempts.
- `test/hub-dedupe-and-caps.test.js` — one vote per guest per activity
  (re-vote replaces), votes rejected for a non-active or closed activity,
  out-of-range poll options rejected, one upvote per guest per question,
  Q&A text over the 500-char hub hard cap rejected outright vs. truncated
  to 240 if under it, the 200-entry Q&A cap, an oversize (>2KB) frame
  dropped before it even reaches the rate limiter, and the 5-msg/sec/guest
  hub-side rate limit itself (8 rapid messages ⇒ exactly 5 processed).
- `test/license.test.js` — valid/forged/wrong-keypair/expired/garbage
  license strings against `verifyLicensePayload()` using an **ephemeral**
  test keypair generated the same way `popvote/keygen/generate-keypair.js`
  does (never the real project key, so this runs identically in CI, which
  has no `popvote/keys/private.pem`), plus `activateLicense()`'s persistence
  and `isPro()` cache update on success/failure.

**Bugs the test suite itself needed fixing, worth recording**: jsdom doesn't
implement `SubtleCrypto` or `TextEncoder`/`TextDecoder` on its `window` —
license tests first failed with everything silently swallowed by
`verifyLicensePayload`'s try/catch (returning `null` for a *correctly*
signed, unexpired license) until `load-app.js` polyfilled those three with
Node's own globals. This is a test-environment gap only; every real browser
implements all three natively, and `popvote/dev/license-flow-check.js`
(real Chromium) already proved the actual app code path works.

**A real design change made for testability**: `Store`, `session`,
`responses`, `qnaStore`, `roster`, `guestState`, `hostPeer`, `guestPeer`/
`guestConn`, `cachedLicensePayload`, and the whole config-constants block
(`FREE_MAX_ACTIVITIES`, `RATE_LIMIT_PER_SEC`, `RECONNECT_MAX_ATTEMPTS`,
`LICENSE_PUBLIC_KEY_B64`, etc.) were changed from `const`/`let` to `var`.
In a classic (non-module) `<script>`, only `var` and function declarations
become properties of `window` — `const`/`let` stay in a separate lexical
record invisible from outside. The jsdom suite needs to seed/inspect this
state directly (e.g. pre-populate `session.activities` before calling
`handleVote`), so `var` was necessary, not just convenient. Also factored
`verifyLicenseString(raw)` into a thin wrapper over a new
`verifyLicensePayload(raw, pubKeyRawBytes)` — the latter takes the public
key as a parameter, which is what makes testing against an ephemeral key
possible without ever touching the real embedded constant.

**CI**: `.github/workflows/popvote-ci.yml`, path-filtered to `popvote/**`
so it doesn't fire on this repo's other, unrelated demos. Runs `npm ci`,
`npm run check-syntax` (extracts the inline `<script>` from `index.html`
and parses it with `vm.Script` — a real parse, not a regex; verified it
actually catches a deliberately-introduced syntax error before restoring
the file), then `npm test`.

**Manual two-machine checklist** (for a human, before a real launch —
this sandbox cannot drive two physical devices or a real PeerJS Cloud
connection; see the Phase 0/1 network-constraint notes above):

- [ ] Host on a laptop, guest on a phone, over the actual internet (not
      loopback) — confirm the QR code scans and the join link works from a
      cold link (e.g. shared over text message).
- [ ] Run a full 4-activity session end to end with 2+ real guests
      simultaneously — this repo's testing never exercised more than one
      simulated guest at a time; multi-guest fan-in only got a synthetic
      (loopback) burst test in Phase 0, never a real multi-peer session.
- [ ] Kill the guest's WiFi mid-session and confirm the reconnect banner
      appears and recovers when connectivity returns.
- [ ] Refresh the host tab mid-session and confirm guests see the session
      end (host-refresh-ends-session is the documented v1 behavior, not a
      bug — but it's never been watched happen against a real guest).
- [ ] Generate a real Instant Recap from a real multi-guest session and
      open it later, offline, on a different device.
- [ ] Firefox and iOS Safari, both roles — genuinely untested anywhere in
      this build (carried from Phase 0; this sandbox only has Chromium).
- [ ] A real Lemon Squeezy purchase → `generate-license.js` → paste into
      the app, end to end with a real buyer email.

**Explicitly untested / known gaps, not silently assumed to work**:
Firefox/iOS Safari (no runtime available in this sandbox at all); real
multi-guest (>1 simultaneous real connection) reconnect storms; a guest's
vote-dedupe identity resets on a true reconnect (new PeerJS peer id) —
documented as an acceptable v1 limitation in the Phase 1 notes above, but
worth another look before a real launch; the host beforeunload guard's
exact wording is never seen by a real user navigating away mid-session
(only unit-testable indirectly).

## Open questions (from build prompt, unresolved)

- [ ] Final name — `popvote` kept as working name; no domain/collision check
      performed (out of scope for this session — no live web search of
      trademark/domain registries was run).
- [ ] Free guest cap: 30 vs 25 — **decision: 30**, matches the free-tier table
      in the build prompt. Documented here so gating copy stays consistent.
- [ ] Recap in free tier: **decision: locked with a rendered preview
      thumbnail** (show, don't tell), per the build prompt's own
      recommendation.

## Exact next step

All 4 build phases are complete and every automated check (Playwright
integration/license-flow scripts under `popvote/dev/`, the 31-test jsdom
suite under `popvote/test/`, the syntax check, CI config) passes. What's
left is the human-only work no sandbox can do: the manual two-machine
checklist above (real devices, real PeerJS Cloud/WebRTC, Firefox/iOS
Safari, a real Lemon Squeezy purchase). Also still open: the two
build-prompt questions this session couldn't resolve on its own — the
final product name (no domain/trademark search was run) and pointing
`LEMON_SQUEEZY_URL` in `index.html` at a real store URL before advertising
Pro anywhere.

## Post-Phase-4 fix: a real CSS bug caught by eyeballing a screenshot

None of the automated checks above caught this — worth being honest about.
After all 4 phases were "done," a manual screenshot of a live session
showed the Q&A "Ask a question…" input visible during a *poll* activity,
where it should be hidden. Root cause: `#gvQnaWrap`, `#reactBar`, and
`#liveCanvas` are shown/hidden by toggling the `hidden` IDL property, but
each also had an author CSS rule setting `display` on that same selector
(e.g. `#reactBar{display:flex}`, plus an inline `style="display:flex"` on
`#gvQnaWrap`). Per the CSS cascade, author-origin rules (and inline styles
even more so) beat the user-agent stylesheet's `[hidden]{display:none}`
regardless of selector specificity — confirmed empirically in Chromium, not
just reasoned about. Fixed by scoping each such rule to `:not([hidden])`.
Added `popvote/dev/hidden-display-check.js` to lock this in via computed
styles. Lesson carried forward: automated assertions on `.hidden`/`hidden`
as a JS property don't verify the element is actually *invisible* — only a
computed-style check (or a human eye) catches this class of bug, and none
of Phases 1–4's tests happened to assert on computed `display` anywhere
until this was added.

## Final acceptance criteria (from the build prompt)

- [x] Single `index.html`, no build step, works from `file://` for host-only
      demo and HTTPS for real sessions (real guests need clipboard/share
      APIs and a real WebRTC connection, both of which need a secure context)
- [x] Phase 0 spike results recorded in `HANDOFF.md` with numbers
- [x] 100-guest burst fan-in: zero vote loss, main thread never blocked
      > 50ms (16.8ms worst frame across 5 settled trials — Chromium only,
      loopback-simulated per the spike's own design, not a real 100-peer
      WebRTC mesh, which this sandbox cannot form at all)
- [x] Instant Recap: self-contained, offline, crisp SVG, deterministic
      layout, footer link
- [x] Free gates visible and friendly; Pro unlock via Ed25519 offline key;
      forged keys rejected
- [x] No `*.pem` anywhere in git history (gitignored from the first commit,
      before any keypair existed; confirmed via `git check-ignore -v` and
      `git ls-files` showing nothing under `popvote/keys/`)
- [x] All jsdom tests pass (31/31); untested paths named above (Firefox/iOS
      Safari; real multi-guest reconnect storms; real two-device sessions)
