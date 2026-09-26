// SnapSplit — Trip Ledger: combine multiple saved splits, net balances, debt simplification.
'use strict';

$('#btnLedger').addEventListener('click', openLedgerDialog);

async function openLedgerDialog() {
  const premium = await Entitlements.has('tripLedger');
  const trips = await SnapDB.getAll('trips');
  const wrap = el('div', { style: 'min-width:min(85vw,460px)' });
  wrap.appendChild(el('h3', {}, '🧮 Trip Ledger'));
  if (!premium) {
    wrap.appendChild(el('div', { class: 'discrepancy-banner bad' }, 'Trip Ledger is a premium feature. You can preview it below with a demo trip; enter a license key in Settings to unlock real trips.'));
  }
  wrap.appendChild(el('p', { class: 'small muted' }, 'Combine several completed splits into one trip and settle everyone at once with as few payments as possible.'));

  const list = el('div');
  trips.forEach(t => list.appendChild(renderTripRow(t)));
  wrap.appendChild(list);

  const newBtn = el('button', { class: 'btn primary block', style: 'margin-top:10px' }, '+ New trip');
  newBtn.addEventListener('click', () => openTripEditor(null));
  wrap.appendChild(newBtn);

  const demoBtn = el('button', { class: 'btn ghost block', style: 'margin-top:6px' }, 'Load debt-simplification demo');
  demoBtn.addEventListener('click', () => {
    const balances = [{ id: 'a', name: 'Alice', net: 5000 }, { id: 'b', name: 'Bob', net: -2000 }, { id: 'c', name: 'Carla', net: -3000 }];
    const txns = CalcEngine.simplifyDebts(balances);
    showTripSettlement({ name: 'Demo trip', currency: 'USD' }, balances, txns);
  });
  wrap.appendChild(demoBtn);

  wrap.appendChild(el('button', { class: 'btn ghost block', style: 'margin-top:6px', onclick: closeDialog }, 'Close'));
  openDialog(wrap);
}

function renderTripRow(trip) {
  const row = el('div', { class: 'history-item' });
  row.appendChild(el('div', {}, [el('strong', {}, trip.name), el('div', { class: 'muted small' }, `${(trip.splitIds || []).length} receipts · ${trip.currency}`)]));
  const openBtn = el('button', { class: 'btn sm' }, 'Open');
  openBtn.addEventListener('click', () => openTripEditor(trip));
  row.appendChild(openBtn);
  return row;
}

async function openTripEditor(trip) {
  const isNew = !trip;
  trip = trip || { id: uid('trip'), name: 'New Trip', currency: 'USD', splitIds: [], payers: {} };
  const allSplits = await SnapDB.getAll('splits');

  const wrap = el('div', { style: 'min-width:min(85vw,460px)' });
  wrap.appendChild(el('h3', {}, isNew ? 'New trip' : trip.name));
  const nameInput = el('input', { type: 'text', value: trip.name });
  nameInput.addEventListener('change', () => trip.name = nameInput.value);
  wrap.appendChild(labeledField('Trip name', nameInput));

  wrap.appendChild(el('h3', { style: 'margin-top:12px' }, 'Include receipts'));
  const list = el('div', { style: 'max-height:35vh; overflow:auto' });
  allSplits.forEach(s => {
    const checked = trip.splitIds.includes(s.id);
    const row = el('label', { style: 'display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border)' });
    const cb = el('input', { type: 'checkbox', checked });
    cb.addEventListener('change', () => {
      if (cb.checked) trip.splitIds.push(s.id); else trip.splitIds = trip.splitIds.filter(id => id !== s.id);
    });
    row.append(cb, el('span', {}, `${s.merchant || 'Unnamed'} — ${Money.format(s.receipt.totalCents, s.receipt.currency)}`));
    list.appendChild(row);
  });
  wrap.appendChild(list);

  const row = el('div', { class: 'row', style: 'margin-top:12px' });
  row.appendChild(el('button', { class: 'btn ghost', onclick: closeDialog }, 'Cancel'));
  row.appendChild(el('button', {
    class: 'btn primary', onclick: async () => {
      await SnapDB.put('trips', trip);
      closeDialog();
      computeAndShowTrip(trip, allSplits);
    }
  }, 'Save & settle'));
  wrap.appendChild(row);
  openDialog(wrap);
}

function labeledField(label, inputEl) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, label));
  f.appendChild(inputEl);
  return f;
}

function computeAndShowTrip(trip, allSplits) {
  const included = allSplits.filter(s => trip.splitIds.includes(s.id));
  if (!included.length) { toast('Add at least one receipt to the trip.', 'error'); return; }
  const balanceMap = new Map();
  included.forEach(s => {
    const result = CalcEngine.computeSplit(s.receipt, s.participants, s.assignments, { taxMode: s.taxMode, tipMode: s.tipMode });
    const numPayers = s.participants.filter(p => p.isPayer).length || 1;
    s.participants.forEach(p => {
      const key = p.name.trim().toLowerCase();
      const pr = result.perPerson[p.id];
      const paid = p.isPayer ? Math.round(result.grandTotal / numPayers) : 0;
      const net = paid - pr.totalCents;
      balanceMap.set(key, (balanceMap.get(key) || { id: key, name: p.name, net: 0 }));
      balanceMap.get(key).net += net;
    });
  });
  const balances = [...balanceMap.values()];
  const txns = CalcEngine.simplifyDebts(balances);
  showTripSettlement(trip, balances, txns);
}

function showTripSettlement(trip, balances, txns) {
  const wrap = el('div', { style: 'min-width:min(85vw,460px)' });
  wrap.appendChild(el('h3', {}, `${trip.name} — settlement`));
  wrap.appendChild(el('p', { class: 'small muted' }, 'Debt simplification is a greedy heuristic (minimizes transactions in common cases, not proven globally optimal).'));
  balances.forEach(b => {
    wrap.appendChild(el('div', { class: 'totals-grid' }, [
      el('div', { class: 'label' }, b.name),
      el('div', { class: 'val' }, (b.net >= 0 ? '+' : '') + Money.format(b.net, trip.currency || 'USD')),
    ]));
  });
  wrap.appendChild(el('h3', { style: 'margin-top:12px' }, 'Pay up'));
  if (!txns.length) wrap.appendChild(el('p', { class: 'muted' }, 'Everyone is already square.'));
  txns.forEach(t => {
    wrap.appendChild(el('div', { class: 'result-card', style: 'display:flex; justify-content:space-between' }, [
      el('span', {}, `${t.fromName} → ${t.toName}`), el('strong', {}, Money.format(t.amountCents, trip.currency || 'USD')),
    ]));
  });
  wrap.appendChild(el('button', { class: 'btn block', style: 'margin-top:10px', onclick: closeDialog }, 'Close'));
  openDialog(wrap);
}
