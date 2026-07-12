# SnapSplit

SnapSplit is a static, local-first receipt splitting app built with vanilla HTML, CSS, and JavaScript.

## Files

- `index.html` — main application shell
- `styles.css` — app styling
- `app.js` — OCR, parsing, split engine, IndexedDB, exports, Trip Ledger, debug tests
- `sw.js` — offline shell caching
- `fixtures/*.txt` — sample receipt text fixtures

## Run locally

```bash
python3 -m http.server 8080
# then open http://localhost:8080/snapsplit/
```

## GitHub Pages deployment

1. Push the repository.
2. Enable GitHub Pages for the repository root.
3. Open `/snapsplit/` on the published site.
4. The service worker caches the app shell and fixture files after first load.

## Manual acceptance checklist

- [ ] Load a receipt with file picker, camera capture, drag and drop, or paste.
- [ ] Adjust crop, rotation, contrast, and threshold; confirm the preview updates.
- [ ] Run local OCR or load fixture text and confirm parsed items appear in Review.
- [ ] Correct receipt fields and acknowledge discrepancies before continuing.
- [ ] Add participants, weights, payer, and optional payment handles.
- [ ] Assign items with single, equal, weighted, percentage, and fixed splits.
- [ ] Verify tax, tip, discounts, and totals reconcile exactly in Settle.
- [ ] Copy or download Markdown and JSON output.
- [ ] Refresh and confirm the draft restores from IndexedDB.
- [ ] Add a completed split to Trip Ledger and confirm settlement suggestions appear.
- [ ] Open `?debug=1` and run the built-in engine assertions.

## Privacy and security notes

- Receipt images stay in IndexedDB on the current device unless the user explicitly enables the cloud adapter.
- The cloud adapter is disabled by default and currently throws until a real provider is configured.
- OCR runs locally in a Web Worker via Tesseract.js loaded from CDN.
- The experimental P2P room shares split state only, never the original receipt image, and encrypts messages with AES-GCM.
- Encrypted backup and restore are implemented behind the local entitlement interface.

## Known limitations

- First-use OCR, QR generation, and P2P room setup need network access to fetch CDN libraries.
- Automatic orientation is browser-decoder dependent; manual rotation is provided.
- Receipt parsing is heuristic and optimized for quick correction over perfect extraction.
- Trip Ledger debt simplification is heuristic and may not globally minimize transactions.
- `validateLicense()` is intentionally a stub until a real provider is wired in.

## Attribution

- Tesseract.js for local OCR
- PeerJS for experimental P2P state sharing
- qrcode for QR summary generation
- Browser APIs: IndexedDB, Service Worker, Web Crypto, Web Share, Clipboard, Canvas
