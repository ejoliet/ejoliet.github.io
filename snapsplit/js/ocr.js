// SnapSplit — Tesseract.js wrapper. Tesseract.js manages its own Web Worker
// internally, so the actual OCR recognition (the expensive part) never runs
// on the main thread even though this call site looks synchronous.
'use strict';

let tesseractWorkerPromise = null;

async function getTesseractWorker(onProgress) {
  if (tesseractWorkerPromise) return tesseractWorkerPromise;
  tesseractWorkerPromise = Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (!onProgress) return;
      const label = {
        'loading tesseract core': 'Loading OCR engine…',
        'initializing tesseract': 'Initializing OCR engine…',
        'loading language traineddata': 'Downloading language model…',
        'initializing api': 'Preparing recognizer…',
        'recognizing text': 'Reading text…',
      }[m.status] || m.status;
      onProgress(label, m.progress || 0);
    },
  });
  return tesseractWorkerPromise;
}

async function runTesseractOcr(blob, onProgress) {
  const worker = await getTesseractWorker(onProgress);
  const { data } = await worker.recognize(blob);
  return data.text;
}
