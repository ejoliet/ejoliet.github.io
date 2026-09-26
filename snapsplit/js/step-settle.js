// SnapSplit — Step 5: Settle. Compute, display, export, share.
'use strict';

function computeCurrentSplit() {
  return CalcEngine.computeSplit(state.receipt, state.participants, state.assignments, {
    taxMode: state.taxMode, tipMode: state.tipMode,
  });
}

function renderSettleStep() {
  const wrap = el('div');
  const r = state.receipt;
  const result = computeCurrentSplit();

  const header = el('div', { class: 'panel' });
  header.appendChild(el('h2', {}, r.merchant || 'Receipt split'));
  header.appendChild(el('p', { class: 'muted small' }, [r.date, r.currency].filter(Boolean).join(' · ')));
  const modeRow = el('div', { class: 'row' });
  modeRow.appendChild(allocModeField('Tax allocation', state.taxMode, v => { state.taxMode = v; renderStep(); }));
  modeRow.appendChild(allocModeField('Tip allocation', state.tipMode, v => { state.tipMode = v; renderStep(); }));
  header.appendChild(modeRow);
  if (!result.reconciles) {
    header.appendChild(el('div', { class: 'discrepancy-banner bad', style: 'margin-top:10px' },
      `⚠ Allocated total (${Money.format(result.grandTotal, r.currency)}) differs from receipt total (${Money.format(result.receiptTotalCents, r.currency)}) — this reflects the unresolved discrepancy acknowledged in Review.`));
  }
  if (result.unclaimedCents) {
    header.appendChild(el('div', { class: 'discrepancy-banner bad', style: 'margin-top:10px' },
      `${Money.format(result.unclaimedCents, r.currency)} in items are unclaimed and excluded from everyone's total.`));
  }
  wrap.appendChild(header);

  const resultsPanel = el('div', { class: 'panel' });
  resultsPanel.appendChild(el('h2', {}, 'Who owes what'));
  state.participants.forEach(p => resultsPanel.appendChild(renderResultCard(p, result, r)));
  wrap.appendChild(resultsPanel);

  const settlePanel = el('div', { class: 'panel' });
  settlePanel.appendChild(el('h2', {}, 'Settlement'));
  settlePanel.appendChild(el('p', { class: 'small muted' }, 'Minimizing the number of payments is a greedy heuristic — not guaranteed mathematically optimal, but always exact in amount.'));
  settlePanel.appendChild(renderSettlementInstructions(result, r, state.participants));
  wrap.appendChild(settlePanel);

  wrap.appendChild(renderAuditTrail(result, r));
  wrap.appendChild(renderExportPanel(result, r));

  return wrap;
}

function allocModeField(label, value, onChange) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, label));
  const sel = el('select');
  [['proportional', 'By item share'], ['equal', 'Equally']].forEach(([v, l]) => sel.appendChild(el('option', { value: v, selected: v === value }, l)));
  sel.addEventListener('change', () => onChange(sel.value));
  f.appendChild(sel);
  return f;
}

function renderResultCard(p, result, r) {
  const pr = result.perPerson[p.id];
  const card = el('div', { class: 'result-card' });
  const nameRow = el('div', { class: 'name-row' });
  nameRow.appendChild(el('span', {}, [
    el('span', { class: 'avatar', style: `background:${colorForName(p.name)}; margin-right:8px` }, initialsForName(p.name)),
    p.name, p.isPayer ? ' (paid)' : '',
  ]));
  nameRow.appendChild(el('span', { class: 'owed' }, Money.format(pr.totalCents, r.currency)));
  card.appendChild(nameRow);

  const details = el('details');
  details.appendChild(el('summary', {}, 'Breakdown'));
  const table = el('table');
  const addRow = (label, val) => table.appendChild(el('tr', {}, [el('td', {}, label), el('td', {}, Money.format(val, r.currency))]));
  addRow('Items', pr.itemSubtotalCents);
  addRow('Discount', -pr.discountShareCents);
  addRow('Tax', pr.taxShareCents);
  addRow('Tip', pr.tipShareCents);
  details.appendChild(table);
  card.appendChild(details);

  const actions = el('div', { class: 'row', style: 'margin-top:8px' });
  actions.appendChild(el('button', { class: 'btn sm ghost', onclick: () => copyText(individualSummaryText(p, pr, r), `Copied ${p.name}'s summary`) }, 'Copy'));
  actions.appendChild(el('button', {
    class: 'btn sm ghost', onclick: () => shareText(individualSummaryText(p, pr, r), `${p.name}'s share`),
  }, 'Share'));
  card.appendChild(actions);
  return card;
}

function renderSettlementInstructions(result, r, participants) {
  const box = el('div');
  const totalPaidByPayers = {};
  participants.forEach(p => { if (p.isPayer) totalPaidByPayers[p.id] = result.grandTotal; });
  const numPayers = participants.filter(p => p.isPayer).length || 1;
  const balances = participants.map(p => {
    const pr = result.perPerson[p.id];
    const paid = p.isPayer ? Math.round(result.grandTotal / numPayers) : 0;
    return { id: p.id, name: p.name, net: paid - pr.totalCents };
  });
  const txns = CalcEngine.simplifyDebts(balances);
  if (!txns.length) {
    box.appendChild(el('p', { class: 'muted' }, 'Everyone is square — nothing to settle.'));
    return box;
  }
  txns.forEach(t => {
    box.appendChild(el('div', { class: 'result-card', style: 'display:flex; justify-content:space-between; align-items:center' }, [
      el('span', {}, `${t.fromName} → ${t.toName}`),
      el('strong', {}, Money.format(t.amountCents, r.currency)),
    ]));
  });
  return box;
}

function renderAuditTrail(result, r) {
  const panel = el('div', { class: 'panel' });
  const details = el('details');
  details.appendChild(el('summary', {}, el('h3', { style: 'display:inline' }, 'Calculation audit trail')));
  const ul = el('ul', { class: 'small' });
  result.audit.forEach(line => ul.appendChild(el('li', {}, line)));
  details.appendChild(ul);
  panel.appendChild(details);
  return panel;
}

function summaryMarkdown(result, r, participants) {
  let md = `# ${r.merchant || 'Receipt split'}\n\n`;
  if (r.date) md += `Date: ${r.date}\n\n`;
  md += `Total: ${Money.format(r.totalCents, r.currency)}\n\n`;
  md += `| Person | Items | Tax | Tip | Discount | Total |\n|---|---|---|---|---|---|\n`;
  participants.forEach(p => {
    const pr = result.perPerson[p.id];
    md += `| ${p.name} | ${Money.format(pr.itemSubtotalCents, r.currency)} | ${Money.format(pr.taxShareCents, r.currency)} | ${Money.format(pr.tipShareCents, r.currency)} | ${Money.format(-pr.discountShareCents, r.currency)} | **${Money.format(pr.totalCents, r.currency)}** |\n`;
  });
  md += `\n## Settlement\n`;
  const box = document.createElement('div');
  return md + settlementMarkdown(result, r, participants);
}

function settlementMarkdown(result, r, participants) {
  const numPayers = participants.filter(p => p.isPayer).length || 1;
  const balances = participants.map(p => {
    const pr = result.perPerson[p.id];
    const paid = p.isPayer ? Math.round(result.grandTotal / numPayers) : 0;
    return { id: p.id, name: p.name, net: paid - pr.totalCents };
  });
  const txns = CalcEngine.simplifyDebts(balances);
  if (!txns.length) return '\nEveryone is square.\n';
  return txns.map(t => `- ${t.fromName} pays ${t.toName} ${Money.format(t.amountCents, r.currency)}`).join('\n') + '\n';
}

function individualSummaryText(p, pr, r) {
  return `${p.name} owes ${Money.format(pr.totalCents, r.currency)} for ${r.merchant || 'the receipt'}` +
    `\n(items ${Money.format(pr.itemSubtotalCents, r.currency)}, tax ${Money.format(pr.taxShareCents, r.currency)}, tip ${Money.format(pr.tipShareCents, r.currency)}, discount -${Money.format(pr.discountShareCents, r.currency)})`;
}

function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => toast(msg || 'Copied.', 'success')).catch(() => toast('Copy failed.', 'error'));
}

async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ text, title }); } catch (e) { /* user cancelled */ }
  } else {
    copyText(text, 'Copied (share not supported on this browser).');
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function receiptToJson(result, r, participants) {
  return JSON.stringify({
    merchant: r.merchant, date: r.date, currency: r.currency,
    totals: { subtotal: r.subtotalCents, discounts: r.discountsCents, tax: r.taxCents, tip: r.tipCents, total: r.totalCents },
    participants: participants.map(p => ({ name: p.name, weight: p.weight, isPayer: !!p.isPayer, ...result.perPerson[p.id] })),
    reconciles: result.reconciles,
  }, null, 2);
}

function receiptToCsv(result, r, participants) {
  const rows = [['Name', 'Items', 'Discount', 'Tax', 'Tip', 'Total']];
  participants.forEach(p => {
    const pr = result.perPerson[p.id];
    rows.push([p.name, Money.fromCents(pr.itemSubtotalCents), Money.fromCents(-pr.discountShareCents), Money.fromCents(pr.taxShareCents), Money.fromCents(pr.tipShareCents), Money.fromCents(pr.totalCents)]);
  });
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function renderExportPanel(result, r) {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Export & share'));
  const grid = el('div', { class: 'capture-grid' });
  grid.appendChild(el('button', { class: 'btn', onclick: () => copyText(summaryMarkdown(result, r, state.participants), 'Summary copied.') }, '📋 Copy summary'));
  grid.appendChild(el('button', { class: 'btn', onclick: () => downloadFile(`${slug(r.merchant)}-split.md`, summaryMarkdown(result, r, state.participants), 'text/markdown') }, '⬇️ Download Markdown'));
  grid.appendChild(el('button', { class: 'btn', onclick: () => downloadFile(`${slug(r.merchant)}-split.json`, receiptToJson(result, r, state.participants), 'application/json') }, '⬇️ Download JSON'));
  grid.appendChild(el('button', { class: 'btn', onclick: () => window.print() }, '🖨️ Print view'));
  grid.appendChild(el('button', { class: 'btn', onclick: () => shareText(summaryMarkdown(result, r, state.participants), 'SnapSplit result') }, '📤 Share'));
  grid.appendChild(el('button', {
    class: 'btn', onclick: async () => {
      if (!(await Entitlements.has('csvExport'))) { showUpsell('CSV export is a premium feature.', 'csvExport'); return; }
      downloadFile(`${slug(r.merchant)}-split.csv`, receiptToCsv(result, r, state.participants), 'text/csv');
    }
  }, '⬇️ CSV (premium)'));
  panel.appendChild(grid);

  const qrBtn = el('button', { class: 'btn block', style: 'margin-top:10px' }, '▦ Show QR code');
  qrBtn.addEventListener('click', () => showQrDialog(result, r));
  panel.appendChild(qrBtn);

  panel.appendChild(renderPaymentLinksSection(result, r));

  return panel;
}

function slug(s) { return (s || 'receipt').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40); }

async function showQrDialog(result, r) {
  const compact = {
    m: r.merchant, t: Money.fromCents(r.totalCents),
    p: state.participants.map(p => [p.name, Money.fromCents(result.perPerson[p.id].totalCents)]),
  };
  const payload = JSON.stringify(compact);
  const wrap = el('div');
  wrap.appendChild(el('h3', {}, 'Scan to share result'));
  if (payload.length > 900) {
    wrap.appendChild(el('p', { class: 'small' }, 'This split has too many participants/items to fit in a QR code — use Copy or Share instead.'));
  } else {
    const canvas = el('canvas');
    wrap.appendChild(canvas);
    try {
      await QRCode.toCanvas(canvas, payload, { width: 260, margin: 1 });
    } catch (e) {
      wrap.appendChild(el('p', { class: 'small' }, 'Could not render QR code.'));
    }
    wrap.appendChild(el('p', { class: 'small muted' }, 'Contains only names & amounts — never the receipt image.'));
  }
  wrap.appendChild(el('button', { class: 'btn block', style: 'margin-top:10px', onclick: closeDialog }, 'Close'));
  openDialog(wrap);
}

function renderPaymentLinksSection(result, r) {
  const box = el('div', { style: 'margin-top:14px' });
  box.appendChild(el('h3', {}, 'Payment links'));
  box.appendChild(el('p', { class: 'small muted' }, 'Optional — enter your own handles in Settings. Nothing is hard-coded or shared.'));
  SnapDB.get('settings', 'paymentHandles').then(saved => {
    const handles = (saved && saved.value) || {};
    const payer = state.participants.find(p => p.isPayer);
    if (!payer) return;
    const amountEach = state.participants.filter(p => !p.isPayer).map(p => result.perPerson[p.id].totalCents);
    const links = el('div', { class: 'row' });
    if (handles.venmo) links.appendChild(linkBtn('Venmo', `https://venmo.com/${encodeURIComponent(handles.venmo)}`));
    if (handles.paypal) links.appendChild(linkBtn('PayPal.me', `https://paypal.me/${encodeURIComponent(handles.paypal)}`));
    if (handles.cashapp) links.appendChild(linkBtn('Cash App', `https://cash.app/$${encodeURIComponent(handles.cashapp)}`));
    if (!handles.venmo && !handles.paypal && !handles.cashapp) {
      links.appendChild(el('button', { class: 'btn sm ghost', onclick: () => openSettingsDialog('payment') }, 'Add a payment handle'));
    }
    box.appendChild(links);
  });
  return box;
}
function linkBtn(label, href) {
  const a = el('a', { href, target: '_blank', rel: 'noopener', class: 'btn sm' }, label);
  return a;
}
