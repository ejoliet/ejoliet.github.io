// SnapSplit — optional cloud OCR adapter. Isolated on purpose: nothing else
// in the app calls a network receipt-parsing endpoint. This function must
// only ever be invoked after explicit, per-use user confirmation (see the
// consent dialog in app.js `confirmCloudParsing`).
'use strict';

async function parseReceiptWithCloud(imageBlob, config) {
  throw new Error('Cloud parsing is not configured.');
}
