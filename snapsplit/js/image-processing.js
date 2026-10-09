// SnapSplit — canvas-based image preprocessing before OCR: orientation fix,
// downscale, grayscale, contrast stretch, optional threshold. Runs on the
// main thread (Canvas2D isn't available in a worker without OffscreenCanvas
// support everywhere we target); OCR itself — the expensive part — runs in
// Tesseract.js's own Web Worker.
'use strict';

const ImageProcessing = (() => {
  const MAX_DIM = 2000;

  async function loadBitmapWithOrientation(file) {
    // createImageBitmap with imageOrientation:'from-image' respects EXIF
    // rotation on browsers that support it; falls back gracefully otherwise.
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      return await createImageBitmap(file);
    }
  }

  function bitmapToCanvas(bitmap, maxDim) {
    let { width, height } = bitmap;
    const scale = Math.min(1, (maxDim || MAX_DIM) / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas;
  }

  function rotateCanvas(canvas, degrees) {
    const rad = (degrees * Math.PI) / 180;
    const swap = Math.abs(degrees % 180) === 90;
    const out = document.createElement('canvas');
    out.width = swap ? canvas.height : canvas.width;
    out.height = swap ? canvas.width : canvas.height;
    const ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  function cropCanvas(canvas, rectNorm) {
    // rectNorm: {x,y,w,h} in 0..1 fractions of canvas size
    const sx = Math.round(rectNorm.x * canvas.width);
    const sy = Math.round(rectNorm.y * canvas.height);
    const sw = Math.round(rectNorm.w * canvas.width);
    const sh = Math.round(rectNorm.h * canvas.height);
    const out = document.createElement('canvas');
    out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  }

  function toGrayscaleContrastThreshold(canvas, opts) {
    opts = opts || {};
    const grayscale = opts.grayscale !== false;
    const contrast = opts.contrast ?? 1.25; // >1 boosts contrast
    const threshold = opts.threshold; // 0-255, or null/undefined to skip
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    // pass 1: grayscale + contrast, tracking min/max for auto-stretch
    let min = 255, max = 0;
    const grayVals = new Float32Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let g = grayscale ? (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) : (d[i] + d[i + 1] + d[i + 2]) / 3;
      grayVals[j] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let g = ((grayVals[j] - min) / range) * 255;
      g = 128 + (g - 128) * contrast;
      g = Math.max(0, Math.min(255, g));
      if (threshold != null) g = g >= threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  async function preprocess(file, opts) {
    opts = opts || {};
    const bitmap = await loadBitmapWithOrientation(file);
    let canvas = bitmapToCanvas(bitmap, opts.maxDim);
    if (opts.rotateDegrees) canvas = rotateCanvas(canvas, opts.rotateDegrees);
    if (opts.cropRect) canvas = cropCanvas(canvas, opts.cropRect);
    if (opts.enhance !== false) {
      canvas = toGrayscaleContrastThreshold(canvas, {
        grayscale: opts.grayscale,
        contrast: opts.contrast,
        threshold: opts.threshold,
      });
    }
    return canvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type || 'image/png', quality));
  }

  return { loadBitmapWithOrientation, bitmapToCanvas, rotateCanvas, cropCanvas, toGrayscaleContrastThreshold, preprocess, canvasToBlob };
})();
