# SnapSplit 🧾

Photograph or upload a restaurant receipt, split it fairly, settle up exactly
— no account, no server, no build step. Everything runs in your browser.

## Quick start

```bash
cd snapsplit
python3 -m http.server 8080
# open http://localhost:8080/
```

Or deploy the `snapsplit/` folder as-is to GitHub Pages / Cloudflare Pages —
it's a static site with zero build step.

Developer test panel: append `?debug=1` to the URL to run the pure-JS
calculation-engine assertions in-browser (`js/debug.js`).

## How it works

1. **Scan** — camera capture, file picker, drag-and-drop, or clipboard paste.
   Images are downscaled, auto-oriented, and can be rotated/enhanced
   (grayscale, contrast stretch, threshold) before OCR.
2. **Review** — [Tesseract.js](https://github.com/naptha/tesseract.js) runs
   OCR entirely client-side (in its own Web Worker). A regex-based parser
   (`js/parser.js`) turns the raw text into structured items, subtotal, tax,
   tip, and discounts, then reconciles item sum vs. printed subtotal/total
   and flags any discrepancy. You can edit every field, add/delete/duplicate/
   merge lines, mark non-splittable lines (e.g. a mis-OCR'd "Subtotal" row),
   and undo/redo. Continuing past an unresolved discrepancy requires an
   explicit checkbox acknowledgement — SnapSplit never silently pretends an
   unbalanced receipt is fine.
3. **People** — add participants with generated initials/avatar colors,
   reuse recent names, mark who paid, set a per-person weight (e.g. 0.5 for
   a child).
4. **Assign** — each item can be split equally, by weight, by custom
   percentage, by custom dollar amount, or by quantity units, across any
   subset of participants (including "unclaimed"). A "claim mode" walks
   participants through one item at a time for passing the phone around.
5. **Settle** — exact per-person totals (items + tax share + tip share −
   discount share), a calculation audit trail, and settlement instructions
   (who pays whom) computed via a greedy debt-simplification heuristic.
   Export as Markdown/JSON/CSV(premium)/print, copy, native Web Share, or a
   QR code containing only names & amounts (never the receipt image).

All money math happens in **integer cents** (`js/money.js`) using a
largest-remainder allocation method, so splits always sum to the exact
receipt total — never floating-point drift.

## Architecture

Vanilla HTML/CSS/JS, no framework, no bundler, no `npm install` step. Two
CDN scripts (Tesseract.js for OCR, `qrcode` for QR rendering) are the only
external dependencies; everything else is hand-written and lives in `js/`:

| File | Responsibility |
|---|---|
| `js/money.js` | Integer-cent arithmetic, largest-remainder proportional allocation |
| `js/calc.js` | Pure, unit-testable split/tax/tip/discount/settlement engine |
| `js/parser.js` | Receipt text → structured JSON, with reconciliation |
| `js/db.js` | IndexedDB wrapper (receipts, splits, participants, trips, settings) + perceptual image-hash dedup |
| `js/entitlements.js` | Centralized free/premium gate — the only file a real license backend needs to touch |
| `js/cloud-adapter.js` | Isolated, disabled-by-default cloud OCR adapter |
| `js/crypto-backup.js` | AES-GCM (PBKDF2-derived key) encrypted backup export/import |
| `js/image-processing.js` | Canvas orientation/resize/grayscale/contrast/threshold/crop |
| `js/ocr.js` | Tesseract.js worker wrapper with progress callback |
| `js/app.js` | App shell, router, state, undo/redo, autosave |
| `js/step-*.js` | One renderer per workflow step (Scan/Review/People/Assign/Settle) |
| `js/history.js`, `js/ledger.js`, `js/settings.js` | History browser, Trip Ledger, Settings/backup dialogs |
| `js/debug.js` | `?debug=1` assertion panel |

Data model (see `js/parser.js` output / `js/calc.js` input):

```json
{
  "merchant": "", "date": "", "currency": "USD",
  "items": [{"id":"","name":"","quantity":1,"unitPriceCents":0,"totalPriceCents":0,"confidence":0,"sourceText":""}],
  "subtotalCents": 0, "discountsCents": 0, "taxCents": 0, "tipCents": 0, "totalCents": 0
}
```

## Free vs. premium

Free mode is fully functional: 1 receipt per split, up to 8 participants, 5
saved splits, Markdown/JSON export. Premium features (unlimited
participants/splits, batch import, long-receipt stitching, custom
allocation rules, recurring groups, CSV export, polished print report,
encrypted backup, no branding, Trip Ledger, debt simplification) are fully
implemented in the code but gated behind `js/entitlements.js`:

```js
async function validateLicense(key) {
  // AIDEV: connect to Lemon Squeezy, Paddle, or another license provider.
  return { valid: false, plan: "free" };
}
```

No fake payment processor is implemented — every entitlement check funnels
through `Entitlements.has(feature)`, so wiring up a real license backend
later means editing this one function.

## Trip Ledger & debt simplification

A Trip Ledger (`js/ledger.js`) combines multiple saved splits into one net
balance per person, then runs a greedy min-cash-flow algorithm
(`CalcEngine.simplifyDebts`) to produce a short settlement list (e.g. "Bob
pays Alice $20; Carla pays Alice $30"). This **minimizes transactions well
in common cases but is a heuristic, not a proven globally-optimal
solution** — the UI states this explicitly.

## Privacy & security

- **Receipt images never leave this device** unless you explicitly enable
  and confirm cloud processing (off by default; `js/cloud-adapter.js`
  throws until a real endpoint is configured).
- All persistence is local `IndexedDB` (`js/db.js`) — no server, no
  account, no telemetry.
- Encrypted backups use `crypto.subtle` AES-GCM with a PBKDF2-derived key
  (210,000 iterations, SHA-256) from a passphrase you choose; the
  passphrase is never stored.
- Payment handles (Venmo/PayPal/Cash App) are optional, user-entered, and
  stored only in local settings — nothing is hard-coded.
- Duplicate-receipt detection uses a coarse on-device perceptual hash
  (16×16 grayscale average) — it never uploads images anywhere.

## Known limitations

- OCR accuracy depends on photo quality; the parser is heuristic and is
  always paired with an editable review step and an explicit discrepancy
  acknowledgement — it never silently "fixes" a receipt.
- The optional P2P live-room and cloud-OCR paths described in the product
  brief are intentionally left as clearly isolated, disabled-by-default
  seams (`js/cloud-adapter.js`) rather than fully built real-time features,
  to avoid depending on always-online third-party infrastructure for the
  core product.
- Debt simplification is a greedy heuristic, not a proven-optimal solver.
- HEIC decoding depends on the browser (Safari decodes HEIC natively via
  `createImageBitmap`; some Chromium builds do not).
- CSV/print "polished report" premium features are implemented but gated
  off until a real license is validated — there is a settings-panel path to
  exercise them for evaluation without payment, clearly separate from the
  entitlement check other premium gates use.

## Attribution

- OCR: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0),
  running the `eng` trained model, entirely client-side via its own Web
  Worker.
- QR rendering: [`qrcode`](https://github.com/soldair/node-qrcode) (MIT).
- No other third-party runtime code.

## Deployment (GitHub Pages)

This folder is part of the `ejoliet.github.io` static site. Either:

- push to the `main`/`master` branch and it's served at
  `https://ejoliet.github.io/snapsplit/`, or
- enable Pages on any fork pointed at this repo root.

No build step, no secrets, no server config needed.
