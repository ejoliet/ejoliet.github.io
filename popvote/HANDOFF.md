# popvote — HANDOFF

Living log of build state, spike results, burned items, open questions, and
the exact next step. Updated at every phase boundary.

## State: Phase 0 not started

## Phase log

### Phase 0 — Spike
_Not started._

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

Run the Phase 0 spike (`popvote/dev/spike.html`): burst fan-in aggregation
under simulated 100-guest load, and recap SVG generation determinism across
two runs. Record numbers below before writing any product code.
