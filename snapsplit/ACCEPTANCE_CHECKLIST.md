# SnapSplit — manual acceptance checklist

Run through this on both iPhone Safari and desktop Chrome/Edge/Safari.

## Scan
- [ ] Camera capture opens the device camera on mobile (`capture=environment`)
- [ ] File picker accepts JPEG/PNG/WebP (and HEIC where the browser supports it)
- [ ] Drag-and-drop a receipt image onto the dropzone works
- [ ] Ctrl/Cmd+V pastes a copied receipt image
- [ ] A long (tall) receipt photo is accepted and downscaled sensibly
- [ ] Rotate left/right updates the preview
- [ ] "Enhance contrast & threshold" toggle visibly changes the processed preview
- [ ] OCR progress bar and status text update during recognition
- [ ] Privacy note ("Receipt images stay on this device…") is visible before capture

## Review
- [ ] Extracted items, quantities, and prices are shown and are all editable
- [ ] Add item / delete item / duplicate item work
- [ ] "Merge duplicates" collapses repeated line names and sums quantity+price
- [ ] Marking a line "non-splittable" excludes it from Assign/Settle
- [ ] Undo/Redo revert edits correctly, including after multiple edits
- [ ] Computed item subtotal vs. printed subtotal difference is shown
- [ ] A balanced receipt shows a green reconciliation banner
- [ ] An unbalanced receipt shows a red banner with the exact discrepancy amount
- [ ] Next is blocked on an unbalanced receipt until the acknowledgement checkbox is checked
- [ ] Low-confidence fields are visually flagged

## People
- [ ] Add participant by name; avatar shows generated initials + color
- [ ] Recent participants (from a prior split) are offered for one-tap reuse
- [ ] Marking a different person "Paid" moves the payer badge
- [ ] Changing a participant's weight (e.g. 0.5 for a child) is retained
- [ ] Adding a 9th participant on the free plan shows the premium upsell dialog

## Assign
- [ ] Equal split across N selected people divides evenly (remainder cents assigned deterministically)
- [ ] Weighted split respects each participant's weight
- [ ] Percentage split normalizes to the item total even if inputs don't sum to 100
- [ ] Fixed-amount split scales to match the item total if inputs don't sum exactly, and warns
- [ ] Quantity split divides a multi-quantity item by units assigned
- [ ] An item with nobody assigned is flagged "unclaimed" and excluded from totals
- [ ] "Assign all unclaimed to selected" bulk-assigns correctly
- [ ] Claim mode walks one item at a time and requires at least one person before advancing

## Settle
- [ ] Every participant's item subtotal, tax share, tip share, discount share, and final total are shown
- [ ] Sum of all participants' totals equals the receipt total when the receipt reconciled
- [ ] Switching tax/tip allocation between "by item share" and "equally" recomputes correctly
- [ ] Settlement instructions correctly identify who pays whom and the exact amount
- [ ] Copy summary / Copy individual result copy to clipboard
- [ ] Download Markdown and Download JSON produce valid files
- [ ] Print view hides chrome (topbar, bottom bar, steps) via `@media print`
- [ ] Web Share API is used where available; falls back to copy otherwise
- [ ] QR code renders and contains only names/amounts (verify by scanning — no image data)
- [ ] Payment deep links only appear after a handle is entered in Settings

## Persistence
- [ ] Refreshing mid-flow offers to restore the in-progress draft
- [ ] A completed split appears in History afterward
- [ ] History search filters by merchant name and date
- [ ] Deleting one split removes only that split
- [ ] "Delete all local data" clears everything (confirm via a fresh History view)
- [ ] Encrypted backup export produces a file that Import can restore with the correct passphrase, and rejects the wrong passphrase

## Trip Ledger
- [ ] Creating a trip and selecting 2+ saved splits computes a net balance per person
- [ ] The demo (Alice owed $50, Bob owes $20, Carla owes $30) yields exactly "Bob→Alice $20" and "Carla→Alice $30"
- [ ] The heuristic disclaimer is visible

## Cross-cutting
- [ ] Dark mode toggle works and persists across reload
- [ ] Reduced-motion is respected (check `prefers-reduced-motion`)
- [ ] Keyboard-only navigation can reach and operate every control on desktop
- [ ] Screen reader announces OCR progress and validation errors (`aria-live` region)
- [ ] App works after the Service Worker has cached it once, with network disabled (excluding first-time OCR model download)
- [ ] `?debug=1` shows the test panel with all assertions passing

## Cloud fallback (opt-in only)
- [ ] Cloud processing is off by default
- [ ] Enabling it requires an explicit confirmation dialog explaining what will be sent
- [ ] Cancel leaves the app in local-only mode
- [ ] Attempting to use it without a configured backend fails loudly with a clear error (never silently uploads)
