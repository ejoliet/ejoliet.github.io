# popvote — HANDOFF

Living log of build state, spike results, burned items, open questions, and
the exact next step. Updated at every phase boundary.

## State: Phase 3 complete

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

### Phase 4 — Polish + tests
_Not started._

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

Build Phase 4 (Polish + tests): a jsdom test suite under `popvote/test/`
covering seeded word-cloud determinism, `Store` localStorage-roundtrip +
in-memory fallback, XSS handling (textContent-only rendering of peer names/
questions/words), reconnect guard bookkeeping, one-vote-per-guest and
one-upvote-per-guest dedupe, the 2KB message-size cap, and license signature
verification (valid/forged/expired) — most of this logic already has
browser-level coverage via `popvote/dev/*.js`, so the jsdom suite should
target the pure functions directly rather than re-deriving the same
end-to-end scenarios. Add a `package.json` + a single GitHub Action for a
Node syntax check (and running the jsdom suite), and write the final
manual two-machine checklist into this file, explicitly naming untested
paths (Firefox/iOS Safari — carried since Phase 0; multi-guest reconnect
storms — never exercised with more than one guest at a time).
