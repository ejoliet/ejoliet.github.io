# popvote — HANDOFF

Living log of build state, spike results, burned items, open questions, and
the exact next step. Updated at every phase boundary.

## State: Phase 0 complete — GO

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

### Phase 1 — Core loop
_Not started._

### Phase 2 — Instant Recap
_Not started._

### Phase 3 — Monetization
_Not started._

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

Build Phase 1 (`popvote/index.html`): host/guest onboarding, the 4 activity
types, live canvas viz, reactions, wire protocol, inbound caps, and
resilience. Lift the render functions from the spike verbatim so Phase 2's
recap stays byte-for-byte consistent with the live view.
