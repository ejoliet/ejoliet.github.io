// SnapSplit — application shell & UI controller. Vanilla JS, no build step.
'use strict';

/* ----------------------------- utilities ------------------------------ */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const el = (tag, attrs, children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children || [])) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
};
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

function toast(msg, kind) {
  const stack = $('#toastStack');
  const t = el('div', { class: 'toast anim' + (kind ? ' ' + kind : '') }, msg);
  stack.appendChild(t);
  announce(msg);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 3600);
}
function announce(msg) { $('#srAnnounce').textContent = msg; }

function openDialog(contentEl, opts) {
  const d = $('#dialogRoot');
  d.innerHTML = '';
  const body = el('div', { class: 'dialog-body' });
  body.appendChild(contentEl);
  d.appendChild(body);
  d.showModal();
  if (opts && opts.onClose) d.addEventListener('close', opts.onClose, { once: true });
  return d;
}
function closeDialog() { const d = $('#dialogRoot'); if (d.open) d.close(); }

const AVATAR_COLORS = ['#e0575b', '#e08e3e', '#c9a227', '#3f9142', '#1f8a8a', '#2a6fdb', '#6b4fce', '#c94f9d'];
function colorForName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initialsForName(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

/* -------------------------------- state -------------------------------- */

const STEPS = ['scan', 'review', 'people', 'assign', 'settle'];

const state = {
  step: 'scan',
  splitId: uid('split'),
  receipt: null,
  imageBlob: null,
  imagePreviewUrl: null,
  imageHash: null,
  participants: [],
  assignments: {},
  taxMode: 'proportional',
  tipMode: 'proportional',
  claimMode: false,
  discrepancyAcknowledged: false,
  history: [],
  future: [],
  ocrBusy: false,
  cropRect: null,
  rotateDegrees: 0,
};

function pushHistory() {
  state.history.push(deepClone(state.receipt));
  if (state.history.length > 40) state.history.shift();
  state.future = [];
}
function undo() {
  if (!state.history.length) return;
  state.future.push(deepClone(state.receipt));
  state.receipt = state.history.pop();
  renderStep();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(deepClone(state.receipt));
  state.receipt = state.future.pop();
  renderStep();
}

/* ------------------------------ navigation ------------------------------ */

function setStep(step) {
  state.step = step;
  renderStep();
  updateStepsNav();
  window.scrollTo(0, 0);
}

function updateStepsNav() {
  $$('.step-pill').forEach(p => {
    const step = p.dataset.step;
    p.classList.toggle('active', step === state.step);
    p.classList.toggle('done', STEPS.indexOf(step) < STEPS.indexOf(state.step));
  });
  const bar = $('#bottomBar');
  bar.style.display = state.step === 'scan' && !state.receipt ? 'none' : 'flex';
  $('#btnBack').disabled = STEPS.indexOf(state.step) === 0;
  const nextBtn = $('#btnNext');
  nextBtn.textContent = state.step === 'settle' ? 'Done' : 'Next';
}

function canProceedFrom(step) {
  if (step === 'review') {
    const rec = CalcEngine.reconcileReceipt(state.receipt);
    if (!rec.balanced && !state.discrepancyAcknowledged) {
      toast('Please acknowledge the discrepancy before continuing.', 'error');
      return false;
    }
    if (!state.receipt.items.some(i => i.splittable !== false)) {
      toast('Add at least one item.', 'error');
      return false;
    }
  }
  if (step === 'people') {
    if (state.participants.length < 1) { toast('Add at least one person.', 'error'); return false; }
  }
  if (step === 'assign') {
    const unassigned = state.receipt.items.filter(i => i.splittable !== false && !hasAnyAssignment(i.id));
    if (unassigned.length) {
      toast(`${unassigned.length} item(s) still unclaimed — you can settle anyway, unclaimed cost is excluded.`, 'error');
    }
  }
  return true;
}
function hasAnyAssignment(itemId) {
  const a = state.assignments[itemId];
  return a && a.shares && a.shares.length > 0;
}

$('#btnNext').addEventListener('click', async () => {
  if (!canProceedFrom(state.step)) return;
  const i = STEPS.indexOf(state.step);
  if (state.step === 'settle') { await saveSplitSnapshot(); toast('Saved to history.', 'success'); return; }
  if (i < STEPS.length - 1) { await saveSplitSnapshot(); setStep(STEPS[i + 1]); }
});
$('#btnBack').addEventListener('click', () => {
  const i = STEPS.indexOf(state.step);
  if (i > 0) setStep(STEPS[i - 1]);
});
$$('.step-pill button').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.closest('.step-pill').dataset.step;
    const targetIdx = STEPS.indexOf(target);
    const curIdx = STEPS.indexOf(state.step);
    if (targetIdx <= curIdx) { setStep(target); return; }
    if (!state.receipt) { toast('Scan a receipt first.', 'error'); return; }
    setStep(target);
  });
});

/* ------------------------------ theming ------------------------------ */

function initTheme() {
  const saved = localStorage.getItem('snapsplit-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}
$('#btnTheme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('snapsplit-theme', next);
});
initTheme();

/* ------------------------------ persistence ------------------------------ */

async function saveSplitSnapshot() {
  if (!state.receipt) return;
  const record = {
    id: state.splitId,
    createdAt: Date.now(),
    merchant: state.receipt.merchant,
    date: state.receipt.date,
    currency: state.receipt.currency,
    receipt: state.receipt,
    participants: state.participants,
    assignments: state.assignments,
    taxMode: state.taxMode,
    tipMode: state.tipMode,
    imageHash: state.imageHash,
    step: state.step,
  };
  await SnapDB.put('splits', record);
  for (const p of state.participants) {
    await SnapDB.put('participants', { id: p.id, name: p.name, weight: p.weight, lastUsed: Date.now() });
  }
}

async function restoreDraftIfAny() {
  const all = await SnapDB.getAll('splits');
  const draft = all.find(s => s.id === state.splitId);
  if (!draft) {
    const mostRecent = all.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (mostRecent && Date.now() - mostRecent.createdAt < 1000 * 60 * 60 * 24 && mostRecent.step !== 'settle') {
      const wrap = el('div');
      wrap.appendChild(el('h3', {}, 'Restore your last receipt?'));
      wrap.appendChild(el('p', { class: 'muted small' }, `${mostRecent.merchant || 'Unnamed receipt'} — unsaved progress from your last visit.`));
      const row = el('div', { class: 'row', style: 'margin-top:14px' });
      row.appendChild(el('button', { class: 'btn ghost', onclick: () => closeDialog() }, 'Start fresh'));
      row.appendChild(el('button', {
        class: 'btn primary', onclick: () => {
          loadSplitRecord(mostRecent);
          closeDialog();
          setStep(mostRecent.step || 'review');
        }
      }, 'Restore'));
      wrap.appendChild(row);
      openDialog(wrap);
    }
  }
}

function loadSplitRecord(rec) {
  state.splitId = rec.id;
  state.receipt = rec.receipt;
  state.participants = rec.participants || [];
  state.assignments = rec.assignments || {};
  state.taxMode = rec.taxMode || 'proportional';
  state.tipMode = rec.tipMode || 'proportional';
  state.imageHash = rec.imageHash || null;
  state.discrepancyAcknowledged = true;
}

/* ------------------------------ boot ------------------------------ */

function main() {
  updateStepsNav();
  renderStep();
  restoreDraftIfAny();
  if (new URLSearchParams(location.search).get('debug') === '1') {
    $('#debugPanel').style.display = 'block';
    renderDebugPanel();
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function renderStep() {
  const main = $('#main');
  main.innerHTML = '';
  switch (state.step) {
    case 'scan': main.appendChild(renderScanStep()); break;
    case 'review': main.appendChild(renderReviewStep()); break;
    case 'people': main.appendChild(renderPeopleStep()); break;
    case 'assign': main.appendChild(renderAssignStep()); break;
    case 'settle': main.appendChild(renderSettleStep()); break;
  }
  updateStepsNav();
}

document.addEventListener('DOMContentLoaded', main);
if (document.readyState !== 'loading') main();
