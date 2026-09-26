// SnapSplit — Step 1: Scan. Capture, preprocess, OCR, parse.
'use strict';

function renderScanStep() {
  const wrap = el('div');

  wrap.appendChild(el('div', { class: 'privacy-note' }, [
    el('span', {}, '🔒'),
    el('span', {}, 'Receipt images stay on this device unless you explicitly enable cloud processing.'),
  ]));

  if (state.imagePreviewUrl && !state.receipt) {
    wrap.appendChild(renderPreprocessPanel());
    return wrap;
  }

  if (state.ocrBusy) {
    wrap.appendChild(renderOcrProgressPanel());
    return wrap;
  }

  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Scan a receipt'));
  panel.appendChild(el('p', { class: 'muted small' }, 'Photograph, upload, drag in, or paste a receipt image. OCR runs entirely in your browser.'));

  const dz = el('div', { class: 'dropzone anim', tabindex: '0', role: 'button', 'aria-label': 'Upload or drop a receipt image' }, [
    el('div', { class: 'big-emoji' }, '🧾'),
    el('p', {}, el('strong', {}, 'Drop a receipt image here')),
    el('p', { class: 'muted small' }, 'or use a button below'),
  ]);
  dz.addEventListener('click', () => $('#fileInputGeneric').click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFileSelected(f);
  });
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') $('#fileInputGeneric').click(); });
  panel.appendChild(dz);

  const grid = el('div', { class: 'capture-grid' });
  const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', id: 'fileInputCamera' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'fileInputGeneric' });
  [cameraInput, fileInput].forEach(inp => inp.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFileSelected(f);
    e.target.value = '';
  }));
  grid.appendChild(el('button', { class: 'btn primary', onclick: () => cameraInput.click() }, ['📷 ', 'Take photo']));
  grid.appendChild(el('button', { class: 'btn', onclick: () => fileInput.click() }, ['🖼️ ', 'Choose file']));
  panel.appendChild(grid);
  panel.appendChild(cameraInput);
  panel.appendChild(fileInput);

  panel.appendChild(el('p', { class: 'muted small', style: 'margin-top:10px' },
    'Tip: you can also press Ctrl/Cmd+V to paste a copied receipt image.'));

  wrap.appendChild(panel);

  const cloudPanel = el('div', { class: 'panel' });
  cloudPanel.appendChild(el('h3', {}, 'Optional cloud OCR'));
  cloudPanel.appendChild(el('p', { class: 'muted small' },
    'Off by default. If enabled, you will be asked to confirm before any image ever leaves this device.'));
  const cloudBtn = el('button', { class: 'btn sm ghost' }, 'Manage cloud processing…');
  cloudBtn.addEventListener('click', openCloudSettingsDialog);
  cloudPanel.appendChild(cloudBtn);
  wrap.appendChild(cloudPanel);

  setupPasteListener();
  return wrap;
}

let pasteBound = false;
function setupPasteListener() {
  if (pasteBound) return;
  pasteBound = true;
  document.addEventListener('paste', e => {
    if (state.step !== 'scan') return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) { handleFileSelected(f); break; }
      }
    }
  });
}

async function handleFileSelected(file) {
  try {
    state.rawFile = file;
    state.rotateDegrees = 0;
    state.cropRect = null;
    const canvas = await ImageProcessing.preprocess(file, { enhance: false });
    state.previewCanvas = canvas;
    const blob = await ImageProcessing.canvasToBlob(canvas, 'image/jpeg', 0.9);
    state.imageBlob = blob;
    state.imagePreviewUrl = URL.createObjectURL(blob);
    state.imageHash = await SnapDB.hashImageBlob(blob).catch(() => null);
    await checkDuplicate(state.imageHash);
    renderStep();
  } catch (err) {
    toast('Could not read that image: ' + err.message, 'error');
  }
}

async function checkDuplicate(hash) {
  if (!hash) return;
  const splits = await SnapDB.getAll('splits');
  const dupe = splits.find(s => s.imageHash && SnapDB.hammingDistanceHex(s.imageHash, hash) <= 4);
  if (dupe) {
    toast(`Heads up: this looks like a receipt you already split (${dupe.merchant || 'unnamed'}).`, 'error');
  }
}

function renderPreprocessPanel() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Review the photo'));
  panel.appendChild(el('p', { class: 'muted small' }, 'Rotate or crop for a cleaner scan, then run OCR.'));

  const canvasWrap = el('div', { class: 'canvas-wrap' });
  const img = el('img', { src: state.imagePreviewUrl, alt: 'Receipt preview' });
  canvasWrap.appendChild(img);
  panel.appendChild(canvasWrap);

  const toolbar = el('div', { class: 'crop-toolbar' });
  toolbar.appendChild(el('button', { class: 'btn sm', onclick: () => rotatePreview(-90) }, '⟲ Rotate left'));
  toolbar.appendChild(el('button', { class: 'btn sm', onclick: () => rotatePreview(90) }, '⟳ Rotate right'));
  toolbar.appendChild(el('button', {
    class: 'btn sm ghost', onclick: () => {
      state.imagePreviewUrl = null; state.imageBlob = null; state.rawFile = null; renderStep();
    }
  }, '✕ Discard'));
  panel.appendChild(toolbar);

  const grayLabel = el('label', { style: 'display:flex;align-items:center;gap:8px;margin-top:10px' }, [
    el('input', { type: 'checkbox', id: 'chkEnhance', checked: true }),
    'Enhance contrast & threshold for OCR (recommended)',
  ]);
  panel.appendChild(grayLabel);

  panel.appendChild(el('button', {
    class: 'btn primary block', style: 'margin-top:14px', onclick: () => runOcrFlow($('#chkEnhance').checked),
  }, '✨ Extract items'));

  return panel;
}

async function rotatePreview(delta) {
  state.rotateDegrees = ((state.rotateDegrees || 0) + delta + 360) % 360;
  const canvas = await ImageProcessing.preprocess(state.rawFile, { enhance: false, rotateDegrees: state.rotateDegrees });
  const blob = await ImageProcessing.canvasToBlob(canvas, 'image/jpeg', 0.92);
  URL.revokeObjectURL(state.imagePreviewUrl);
  state.imageBlob = blob;
  state.imagePreviewUrl = URL.createObjectURL(blob);
  renderStep();
}

function renderOcrProgressPanel() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Reading your receipt…'));
  panel.appendChild(el('p', { class: 'muted small', id: 'ocrStatusText' }, 'Starting local OCR engine…'));
  const bar = el('div', { class: 'progress-bar' }, el('div', { id: 'ocrProgressFill' }));
  panel.appendChild(bar);
  panel.appendChild(el('p', { class: 'muted small' }, 'The OCR model downloads once and is cached for offline reuse.'));
  return panel;
}

async function runOcrFlow(enhance) {
  state.ocrBusy = true;
  renderStep();
  try {
    const canvas = await ImageProcessing.preprocess(state.rawFile, {
      rotateDegrees: state.rotateDegrees, cropRect: state.cropRect, enhance,
      contrast: 1.3, threshold: enhance ? 150 : null,
    });
    const blob = await ImageProcessing.canvasToBlob(canvas, 'image/png');
    const text = await runTesseractOcr(blob, (status, progress) => {
      const t = $('#ocrStatusText'); const f = $('#ocrProgressFill');
      if (t) t.textContent = status;
      if (f) f.style.width = Math.round(progress * 100) + '%';
      announce(`${status} ${Math.round(progress * 100)}%`);
    });
    const parsed = ReceiptParser.parseReceiptText(text);
    parsed.items.forEach(i => { i.splittable = true; });
    state.receipt = parsed;
    state.history = []; state.future = [];
    state.discrepancyAcknowledged = false;
    state.assignments = {};
    state.ocrBusy = false;
    toast('Extraction complete — please review.', 'success');
    setStep('review');
  } catch (err) {
    state.ocrBusy = false;
    toast('OCR failed: ' + err.message + '. You can still enter items manually.', 'error');
    state.receipt = { merchant: '', date: '', currency: 'USD', items: [], subtotalCents: 0, discountsCents: 0, taxCents: 0, tipCents: 0, totalCents: 0, lowConfidenceFields: [] };
    setStep('review');
  }
}

/* ------------------------------ cloud opt-in dialog ------------------------------ */

function openCloudSettingsDialog() {
  const wrap = el('div');
  wrap.appendChild(el('h3', {}, 'Cloud receipt processing'));
  wrap.appendChild(el('p', { class: 'small' },
    'Disabled by default. SnapSplit ships with no cloud OCR backend configured — enabling this only matters if you or your organization connect one.'));
  wrap.appendChild(el('p', { class: 'small' }, 'If you enable it, before every use SnapSplit will: (1) tell you the receipt image is about to be uploaded, (2) name the destination, (3) require you to confirm, and (4) let you cancel.'));
  const row = el('div', { class: 'row', style: 'margin-top:14px' });
  row.appendChild(el('button', { class: 'btn ghost', onclick: closeDialog }, 'Close'));
  row.appendChild(el('button', {
    class: 'btn danger', onclick: async () => {
      try {
        await parseReceiptWithCloud(new Blob(), {});
      } catch (err) {
        toast(err.message, 'error');
      }
      closeDialog();
    }
  }, 'Try cloud parsing now'));
  wrap.appendChild(row);
  openDialog(wrap);
}
