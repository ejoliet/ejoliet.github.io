// SnapSplit — Step 4: Assign items to people.
'use strict';

const SPLIT_MODES = [
  { key: 'equal', label: 'Equal' },
  { key: 'weighted', label: 'Weighted' },
  { key: 'percentage', label: '%' },
  { key: 'amount', label: '$' },
  { key: 'quantity', label: 'Qty' },
];

function getOrCreateAssignment(itemId) {
  if (!state.assignments[itemId]) state.assignments[itemId] = { mode: 'equal', shares: [] };
  return state.assignments[itemId];
}

function renderAssignStep() {
  const wrap = el('div');
  const r = state.receipt;
  const splittableItems = r.items.filter(i => i.splittable !== false);

  const toolbar = el('div', { class: 'panel' });
  const trow = el('div', { style: 'display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap' });
  trow.appendChild(el('h2', { style: 'margin:0' }, 'Assign items'));
  const claimToggle = el('label', { style: 'display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px' }, [
    el('input', { type: 'checkbox', checked: state.claimMode }),
    'Claim mode (pass the phone)',
  ]);
  claimToggle.querySelector('input').addEventListener('change', e => { state.claimMode = e.target.checked; renderStep(); });
  trow.appendChild(claimToggle);
  toolbar.appendChild(trow);

  const unclaimed = splittableItems.filter(i => !hasAnyAssignment(i.id));
  if (unclaimed.length) {
    const bulk = el('div', { style: 'margin-top:10px' });
    bulk.appendChild(el('p', { class: 'muted small' }, `${unclaimed.length} item(s) unclaimed.`));
    const selectRow = el('div', { class: 'person-toggle-grid' });
    const selectedIds = new Set();
    state.participants.forEach(p => {
      const t = el('button', { type: 'button', class: 'person-toggle' }, p.name);
      t.addEventListener('click', () => {
        t.classList.toggle('selected');
        if (selectedIds.has(p.id)) selectedIds.delete(p.id); else selectedIds.add(p.id);
      });
      selectRow.appendChild(t);
    });
    bulk.appendChild(selectRow);
    const assignAllBtn = el('button', {
      class: 'btn sm primary', style: 'margin-top:8px', onclick: () => {
        if (!selectedIds.size) { toast('Select at least one person first.', 'error'); return; }
        unclaimed.forEach(item => {
          state.assignments[item.id] = { mode: 'equal', shares: [...selectedIds].map(participantId => ({ participantId })) };
        });
        renderStep();
      }
    }, 'Assign all unclaimed to selected');
    bulk.appendChild(assignAllBtn);
    toolbar.appendChild(bulk);
  }
  wrap.appendChild(toolbar);

  if (state.claimMode) {
    wrap.appendChild(renderClaimModeView(splittableItems));
  } else {
    splittableItems.forEach(item => wrap.appendChild(renderAssignItemCard(item)));
  }

  return wrap;
}

function renderAssignItemCard(item) {
  const assignment = getOrCreateAssignment(item.id);
  const card = el('div', { class: 'assign-item-card' });
  const head = el('div', { class: 'assign-item-head' });
  head.appendChild(el('span', { class: 'name' }, `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`));
  head.appendChild(el('span', { class: 'price' }, Money.format(item.totalPriceCents, state.receipt.currency)));
  card.appendChild(head);

  const tabs = el('div', { class: 'mode-tabs' });
  SPLIT_MODES.forEach(m => {
    const btn = el('button', { type: 'button', class: m.key === assignment.mode ? 'active' : '' }, m.label);
    btn.addEventListener('click', () => { assignment.mode = m.key; normalizeShares(item, assignment); renderStep(); });
    tabs.appendChild(btn);
  });
  card.appendChild(tabs);

  const grid = el('div', { class: 'person-toggle-grid' });
  state.participants.forEach(p => {
    const share = assignment.shares.find(s => s.participantId === p.id);
    const toggle = el('button', { type: 'button', class: 'person-toggle' + (share ? ' selected' : '') }, [
      el('span', { class: 'avatar', style: `background:${colorForName(p.name)}; width:20px;height:20px;font-size:9px` }, initialsForName(p.name)),
      ' ' + p.name,
    ]);
    toggle.addEventListener('click', () => {
      if (share) assignment.shares = assignment.shares.filter(s => s.participantId !== p.id);
      else assignment.shares.push({ participantId: p.id, value: defaultValueForMode(assignment.mode, p) });
      normalizeShares(item, assignment);
      renderStep();
    });
    grid.appendChild(toggle);
  });
  card.appendChild(grid);

  if (['weighted', 'percentage', 'amount', 'quantity'].includes(assignment.mode) && assignment.shares.length) {
    assignment.shares.forEach(s => {
      const p = state.participants.find(x => x.id === s.participantId);
      if (!p) return;
      const row = el('div', { class: 'share-row' });
      row.appendChild(el('span', {}, p.name));
      const input = el('input', {
        type: 'number', step: assignment.mode === 'amount' ? '0.01' : '0.1',
        value: assignment.mode === 'amount' ? Money.fromCents(s.value || 0).toFixed(2) : (s.value ?? ''),
      });
      input.addEventListener('change', () => {
        s.value = assignment.mode === 'amount' ? Money.toCents(input.value) : parseFloat(input.value) || 0;
        renderStep();
      });
      row.appendChild(input);
      row.appendChild(el('span', { class: 'muted small' }, assignment.mode === 'percentage' ? '%' : assignment.mode === 'quantity' ? `of ${item.quantity}` : ''));
      card.appendChild(row);
    });
    card.appendChild(renderShareSummary(item, assignment));
  }

  return card;
}

function defaultValueForMode(mode, participant) {
  if (mode === 'weighted') return participant.weight ?? 1;
  if (mode === 'percentage') return 0;
  if (mode === 'amount') return 0;
  if (mode === 'quantity') return 1;
  return undefined;
}

function normalizeShares(item, assignment) {
  if (assignment.mode === 'equal') assignment.shares.forEach(s => delete s.value);
}

function renderShareSummary(item, assignment) {
  const box = el('div', { class: 'small muted', style: 'margin-top:6px' });
  if (assignment.mode === 'percentage') {
    const total = assignment.shares.reduce((a, s) => a + (s.value || 0), 0);
    box.textContent = `Total: ${total}% ${total !== 100 ? '(will be normalized to 100%)' : ''}`;
  } else if (assignment.mode === 'amount') {
    const total = assignment.shares.reduce((a, s) => a + (s.value || 0), 0);
    box.textContent = `Total: ${Money.format(total, state.receipt.currency)} of ${Money.format(item.totalPriceCents, state.receipt.currency)} ${total !== item.totalPriceCents ? '(will be scaled to match item total)' : ''}`;
  } else if (assignment.mode === 'quantity') {
    const total = assignment.shares.reduce((a, s) => a + (s.value || 0), 0);
    box.textContent = `Total: ${total} of ${item.quantity} units`;
  }
  return box;
}

/* ------------------------------ claim mode ------------------------------ */

function renderClaimModeView(items) {
  const box = el('div', { class: 'panel' });
  let idx = items.findIndex(i => !hasAnyAssignment(i.id));
  if (idx === -1) idx = 0;
  if (!items.length) { box.appendChild(el('p', { class: 'muted' }, 'No items to claim.')); return box; }
  const item = items[idx];
  const assignment = getOrCreateAssignment(item.id);
  assignment.mode = 'equal';

  const card = el('div', { class: 'assign-item-card claim-mode' });
  card.appendChild(el('div', { class: 'muted small' }, `Item ${idx + 1} of ${items.length}`));
  card.appendChild(el('h2', { style: 'margin:6px 0' }, item.name));
  card.appendChild(el('div', { class: 'price', style: 'font-size:22px; margin-bottom:14px' }, Money.format(item.totalPriceCents, state.receipt.currency)));

  const grid = el('div', { class: 'person-toggle-grid', style: 'justify-content:center' });
  state.participants.forEach(p => {
    const selected = assignment.shares.some(s => s.participantId === p.id);
    const btn = el('button', { type: 'button', class: 'person-toggle' + (selected ? ' selected' : ''), style: 'font-size:16px; padding:12px 18px' }, [
      el('span', { class: 'avatar', style: `background:${colorForName(p.name)}` }, initialsForName(p.name)),
      ' ' + p.name,
    ]);
    btn.addEventListener('click', () => {
      if (selected) assignment.shares = assignment.shares.filter(s => s.participantId !== p.id);
      else assignment.shares.push({ participantId: p.id });
      renderStep();
    });
    grid.appendChild(btn);
  });
  card.appendChild(grid);

  const nav = el('div', { class: 'row', style: 'margin-top:16px' });
  nav.appendChild(el('button', { class: 'btn', disabled: idx === 0, onclick: () => { state._claimIdx = idx - 1; jumpClaim(items, idx - 1); } }, '← Previous'));
  nav.appendChild(el('button', { class: 'btn primary', disabled: !assignment.shares.length, onclick: () => jumpClaim(items, idx + 1) }, idx === items.length - 1 ? 'Finish' : 'Next item →'));
  card.appendChild(nav);
  box.appendChild(card);
  return box;
}

function jumpClaim(items, nextIdx) {
  if (nextIdx >= items.length) { state.claimMode = false; toast('All items claimed.', 'success'); }
  renderStep();
}
