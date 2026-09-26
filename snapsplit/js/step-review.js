// SnapSplit — Step 2: Review & correct extracted receipt data.
'use strict';

function renderReviewStep() {
  const wrap = el('div');
  const r = state.receipt;

  const header = el('div', { class: 'panel' });
  const hrow = el('div', { style: 'display:flex; justify-content:space-between; align-items:flex-start; gap:10px' });
  const left = el('div', { style: 'flex:1' });
  left.appendChild(labeledInput('Merchant', r.merchant, v => { pushHistory(); r.merchant = v; }));
  left.appendChild(labeledInput('Date', r.date, v => { pushHistory(); r.date = v; }));
  hrow.appendChild(left);
  const right = el('div', { style: 'width:110px' });
  right.appendChild(currencySelect(r));
  hrow.appendChild(right);
  header.appendChild(hrow);
  const undoRow = el('div', { class: 'row', style: 'margin-top:10px' });
  undoRow.appendChild(el('button', { class: 'btn sm', disabled: state.history.length === 0, onclick: undo }, '↶ Undo'));
  undoRow.appendChild(el('button', { class: 'btn sm', disabled: state.future.length === 0, onclick: redo }, '↷ Redo'));
  header.appendChild(undoRow);
  wrap.appendChild(header);

  const itemsPanel = el('div', { class: 'panel' });
  itemsPanel.appendChild(el('h2', {}, 'Items'));
  itemsPanel.appendChild(renderItemsTable(r));

  const addRow = el('div', { class: 'row', style: 'margin-top:10px' });
  addRow.appendChild(el('button', {
    class: 'btn sm', onclick: () => {
      pushHistory();
      r.items.push({ id: uid('it'), name: 'New item', quantity: 1, unitPriceCents: 0, totalPriceCents: 0, taxable: true, splittable: true, confidence: 1, sourceText: '' });
      renderStep();
    }
  }, '+ Add item'));
  addRow.appendChild(el('button', { class: 'btn sm ghost', onclick: mergeDuplicateLines }, '⇄ Merge duplicates'));
  itemsPanel.appendChild(addRow);
  wrap.appendChild(itemsPanel);

  const totalsPanel = el('div', { class: 'panel' });
  totalsPanel.appendChild(el('h2', {}, 'Totals'));
  totalsPanel.appendChild(renderTotalsFields(r));
  totalsPanel.appendChild(renderTotalsGrid(r));
  wrap.appendChild(totalsPanel);

  return wrap;
}

function labeledInput(label, value, onChange, type) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, label));
  const inp = el('input', { type: type || 'text', value: value || '' });
  inp.addEventListener('change', () => onChange(inp.value));
  f.appendChild(inp);
  return f;
}

function currencySelect(r) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, 'Currency'));
  const sel = el('select');
  ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].forEach(c => sel.appendChild(el('option', { value: c, selected: r.currency === c }, c)));
  sel.addEventListener('change', () => { pushHistory(); r.currency = sel.value; renderStep(); });
  f.appendChild(sel);
  return f;
}

function renderItemsTable(r) {
  const table = el('table', { class: 'items-table' });
  const thead = el('thead', {}, el('tr', {}, [
    el('th', {}, 'Item'), el('th', { style: 'width:52px' }, 'Qty'), el('th', { style: 'width:88px' }, 'Total'),
    el('th', { style: 'width:120px' }, ''),
  ]));
  table.appendChild(thead);
  const tbody = el('tbody');
  r.items.forEach(item => tbody.appendChild(renderItemRow(item, r)));
  table.appendChild(tbody);
  return table;
}

function renderItemRow(item, r) {
  const lowConf = (item.confidence ?? 1) < 0.6;
  const tr = el('tr', { class: 'item-row' + (item.splittable === false ? ' non-splittable' : '') });

  const nameTd = el('td');
  const nameInput = el('input', { type: 'text', value: item.name, class: lowConf ? 'low-conf' : '' });
  nameInput.addEventListener('change', () => { pushHistory(); item.name = nameInput.value; });
  nameTd.appendChild(nameInput);
  if (lowConf) nameTd.appendChild(el('div', { class: 'chip warn', style: 'margin-top:4px' }, 'low confidence'));
  tr.appendChild(nameTd);

  const qtyTd = el('td');
  const qtyInput = el('input', { type: 'number', min: '0', step: '1', value: item.quantity, class: 'qty-input' });
  qtyInput.addEventListener('change', () => {
    pushHistory();
    const q = Math.max(0, parseInt(qtyInput.value, 10) || 0);
    item.quantity = q;
  });
  qtyTd.appendChild(qtyInput);
  tr.appendChild(qtyTd);

  const priceTd = el('td');
  const priceInput = el('input', {
    type: 'number', step: '0.01', value: Money.fromCents(item.totalPriceCents).toFixed(2), class: 'price-input',
  });
  priceInput.addEventListener('change', () => {
    pushHistory();
    item.totalPriceCents = Money.toCents(priceInput.value);
    item.unitPriceCents = item.quantity ? Math.round(item.totalPriceCents / item.quantity) : item.totalPriceCents;
  });
  priceTd.appendChild(priceInput);
  tr.appendChild(priceTd);

  const actionsTd = el('td', { style: 'white-space:nowrap' });
  const mkBtn = (label, title, fn) => el('button', { class: 'btn sm ghost', title, 'aria-label': title, style: 'padding:6px 8px' }, label);
  const dupBtn = mkBtn('⧉', 'Duplicate', null);
  dupBtn.addEventListener('click', () => { pushHistory(); r.items.push({ ...item, id: uid('it') }); renderStep(); });
  const nonSplitBtn = mkBtn(item.splittable === false ? '☑' : '☐', 'Toggle non-splittable (e.g. subtotal line)', null);
  nonSplitBtn.addEventListener('click', () => { pushHistory(); item.splittable = item.splittable === false ? true : false; renderStep(); });
  const delBtn = mkBtn('✕', 'Delete', null);
  delBtn.addEventListener('click', () => { pushHistory(); r.items = r.items.filter(i => i.id !== item.id); renderStep(); });
  actionsTd.append(dupBtn, nonSplitBtn, delBtn);
  tr.appendChild(actionsTd);

  return tr;
}

function mergeDuplicateLines() {
  const r = state.receipt;
  pushHistory();
  const byName = new Map();
  const merged = [];
  for (const item of r.items) {
    const key = item.name.trim().toLowerCase();
    if (byName.has(key)) {
      const existing = byName.get(key);
      existing.quantity += item.quantity;
      existing.totalPriceCents += item.totalPriceCents;
      existing.unitPriceCents = existing.quantity ? Math.round(existing.totalPriceCents / existing.quantity) : existing.totalPriceCents;
    } else {
      byName.set(key, item);
      merged.push(item);
    }
  }
  r.items = merged;
  renderStep();
  toast('Duplicate lines merged.', 'success');
}

function renderTotalsFields(r) {
  const grid = el('div');
  const row = el('div', { class: 'row' });
  row.appendChild(moneyField('Subtotal (printed)', r.subtotalCents, v => { pushHistory(); r.subtotalCents = v; }));
  row.appendChild(moneyField('Discounts', r.discountsCents, v => { pushHistory(); r.discountsCents = v; }));
  grid.appendChild(row);
  const row2 = el('div', { class: 'row' });
  row2.appendChild(moneyField('Tax', r.taxCents, v => { pushHistory(); r.taxCents = v; }));
  row2.appendChild(moneyField('Tip / gratuity', r.tipCents, v => { pushHistory(); r.tipCents = v; }));
  grid.appendChild(row2);
  grid.appendChild(moneyField('Total (printed)', r.totalCents, v => { pushHistory(); r.totalCents = v; }));
  return grid;
}

function moneyField(label, cents, onChange) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, label));
  const inp = el('input', { type: 'number', step: '0.01', value: Money.fromCents(cents || 0).toFixed(2) });
  inp.addEventListener('change', () => { onChange(Money.toCents(inp.value)); renderStep(); });
  f.appendChild(inp);
  return f;
}

function renderTotalsGrid(r) {
  const rec = CalcEngine.reconcileReceipt(r);
  const box = el('div');
  const grid = el('div', { class: 'totals-grid' });
  const addRow = (label, cents) => {
    grid.appendChild(el('div', { class: 'label' }, label));
    grid.appendChild(el('div', { class: 'val' }, Money.format(cents, r.currency)));
  };
  addRow('Computed item subtotal', rec.itemSum);
  addRow('Printed subtotal', rec.subtotalCents);
  addRow('Item vs subtotal difference', rec.itemVsSubtotal);
  addRow('Expected total (subtotal − discount + tax + tip)', rec.expectedTotal);
  addRow('Printed total', r.totalCents);
  addRow('Total discrepancy', rec.totalVsExpected);
  box.appendChild(grid);

  const banner = el('div', { class: 'discrepancy-banner ' + (rec.balanced ? 'good' : 'bad') });
  if (rec.balanced) {
    banner.appendChild(el('strong', {}, '✓ Receipt reconciles exactly.'));
    state.discrepancyAcknowledged = true;
  } else {
    banner.appendChild(el('strong', {}, `⚠ This receipt does not reconcile (off by ${Money.format(Math.abs(rec.itemVsSubtotal) + Math.abs(rec.totalVsExpected), r.currency)}).`));
    banner.appendChild(el('p', { class: 'small', style: 'margin:6px 0 0' }, 'Fix the item prices/totals above, or acknowledge and continue anyway — the split will still be computed exactly from whatever numbers you leave here.'));
    const ackLabel = el('label', { style: 'display:flex; gap:8px; align-items:flex-start; margin-top:8px; font-weight:600' }, [
      el('input', { type: 'checkbox', checked: state.discrepancyAcknowledged || false }),
      'I understand this receipt has an unresolved discrepancy and want to continue anyway.',
    ]);
    ackLabel.querySelector('input').addEventListener('change', e => { state.discrepancyAcknowledged = e.target.checked; });
    banner.appendChild(ackLabel);
  }
  box.appendChild(banner);
  return box;
}
