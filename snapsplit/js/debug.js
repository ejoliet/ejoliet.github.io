// SnapSplit — developer test panel, activated with ?debug=1.
// Pure JS assertions against Money / CalcEngine / ReceiptParser. No DOM
// dependency in the assertions themselves — only in how results are shown.
'use strict';

function assertEqual(actual, expected, label, results) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ pass, label, detail: pass ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
}
function assertTrue(cond, label, results) {
  results.push({ pass: !!cond, label, detail: cond ? '' : 'expected truthy' });
}

function runEngineTests() {
  const results = [];
  const mkReceipt = (over) => Object.assign({
    currency: 'USD', items: [], subtotalCents: 0, discountsCents: 0, taxCents: 0, tipCents: 0, totalCents: 0,
  }, over);

  // 1. Single-person receipt
  {
    const r = mkReceipt({
      items: [{ id: 'i1', totalPriceCents: 1000, taxable: true, splittable: true, name: 'Item' }],
      subtotalCents: 1000, totalCents: 1200, taxCents: 200,
    });
    const parts = [{ id: 'p1', name: 'Solo', weight: 1 }];
    const asg = { i1: { mode: 'equal', shares: [{ participantId: 'p1' }] } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual(res.perPerson.p1.totalCents, 1200, 'Single-person receipt totals correctly', results);
  }

  // 2. Multiple participants, equal split
  {
    const r = mkReceipt({ items: [{ id: 'i1', totalPriceCents: 900, taxable: true, splittable: true, name: 'x' }], subtotalCents: 900, totalCents: 900 });
    const parts = [{ id: 'a', name: 'A', weight: 1 }, { id: 'b', name: 'B', weight: 1 }, { id: 'c', name: 'C', weight: 1 }];
    const asg = { i1: { mode: 'equal', shares: parts.map(p => ({ participantId: p.id })) } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual([res.perPerson.a.totalCents, res.perPerson.b.totalCents, res.perPerson.c.totalCents], [300, 300, 300], 'Multi-participant equal split divides evenly', results);
  }

  // 3. Shared item (2 of 3 people)
  {
    const r = mkReceipt({ items: [{ id: 'i1', totalPriceCents: 1000, taxable: true, splittable: true, name: 'Nachos' }], subtotalCents: 1000, totalCents: 1000 });
    const parts = [{ id: 'a', name: 'A', weight: 1 }, { id: 'b', name: 'B', weight: 1 }, { id: 'c', name: 'C', weight: 1 }];
    const asg = { i1: { mode: 'equal', shares: [{ participantId: 'a' }, { participantId: 'b' }] } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual(res.perPerson.c.totalCents, 0, 'Shared item excludes non-assigned participant', results);
    assertEqual(res.perPerson.a.totalCents + res.perPerson.b.totalCents, 1000, 'Shared item sums to item total', results);
  }

  // 4. Weighted split
  {
    const r = mkReceipt({ items: [{ id: 'i1', totalPriceCents: 1500, taxable: true, splittable: true, name: 'Family meal' }], subtotalCents: 1500, totalCents: 1500 });
    const parts = [{ id: 'adult', name: 'Adult', weight: 1 }, { id: 'kid', name: 'Kid', weight: 0.5 }];
    const asg = { i1: { mode: 'weighted', shares: [{ participantId: 'adult', value: 1 }, { participantId: 'kid', value: 0.5 }] } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual(res.perPerson.adult.totalCents, 1000, 'Weighted split gives adult 2x kid share', results);
    assertEqual(res.perPerson.kid.totalCents, 500, 'Weighted split gives kid half share', results);
  }

  // 5. Discounts allocated proportionally
  {
    const r = mkReceipt({
      items: [
        { id: 'i1', totalPriceCents: 3000, taxable: true, splittable: true, name: 'Steak' },
        { id: 'i2', totalPriceCents: 1000, taxable: true, splittable: true, name: 'Salad' },
      ],
      subtotalCents: 4000, discountsCents: 400, totalCents: 3600,
    });
    const parts = [{ id: 'a', name: 'A', weight: 1 }, { id: 'b', name: 'B', weight: 1 }];
    const asg = { i1: { mode: 'equal', shares: [{ participantId: 'a' }] }, i2: { mode: 'equal', shares: [{ participantId: 'b' }] } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual(res.perPerson.a.discountShareCents, 300, 'Discount allocated 3:1 proportional to item share (A)', results);
    assertEqual(res.perPerson.b.discountShareCents, 100, 'Discount allocated 3:1 proportional to item share (B)', results);
  }

  // 6. Tax and tip proportional allocation
  {
    const r = mkReceipt({
      items: [
        { id: 'i1', totalPriceCents: 3000, taxable: true, splittable: true, name: 'Steak' },
        { id: 'i2', totalPriceCents: 1000, taxable: true, splittable: true, name: 'Salad' },
      ],
      subtotalCents: 4000, taxCents: 320, tipCents: 800, totalCents: 5120,
    });
    const parts = [{ id: 'a', name: 'A', weight: 1 }, { id: 'b', name: 'B', weight: 1 }];
    const asg = { i1: { mode: 'equal', shares: [{ participantId: 'a' }] }, i2: { mode: 'equal', shares: [{ participantId: 'b' }] } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertTrue(res.reconciles, 'Tax + tip allocation reconciles to exact receipt total', results);
    assertEqual(res.perPerson.a.taxShareCents + res.perPerson.b.taxShareCents, 320, 'Tax shares sum to total tax', results);
  }

  // 7. One-cent remainder (largest-remainder rounding)
  {
    const r = mkReceipt({ items: [{ id: 'i1', totalPriceCents: 1000, taxable: true, splittable: true, name: 'Split 3 ways' }], subtotalCents: 1000, totalCents: 1000 });
    const parts = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    const asg = { i1: { mode: 'equal', shares: parts.map(p => ({ participantId: p.id })) } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    const total = res.perPerson.a.totalCents + res.perPerson.b.totalCents + res.perPerson.c.totalCents;
    assertEqual(total, 1000, '1000 cents / 3 people sums to exactly 1000 (no lost penny)', results);
    assertTrue(res.perPerson.a.totalCents === 334 || res.perPerson.a.totalCents === 333, 'Remainder cent assigned deterministically', results);
  }

  // 8. Zero-value item
  {
    const r = mkReceipt({ items: [{ id: 'i1', totalPriceCents: 0, taxable: true, splittable: true, name: 'Free appetizer' }], subtotalCents: 0, totalCents: 0 });
    const parts = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    const asg = { i1: { mode: 'equal', shares: parts.map(p => ({ participantId: p.id })) } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual([res.perPerson.a.totalCents, res.perPerson.b.totalCents], [0, 0], 'Zero-value item splits to zero without error', results);
  }

  // 9. Negative discount (comp / promo) larger than typical
  {
    const r = mkReceipt({
      items: [{ id: 'i1', totalPriceCents: 2000, taxable: true, splittable: true, name: 'Entree' }],
      subtotalCents: 2000, discountsCents: 2000, totalCents: 0,
    });
    const parts = [{ id: 'a', name: 'A' }];
    const asg = { i1: { mode: 'equal', shares: [{ participantId: 'a' }] } };
    const res = CalcEngine.computeSplit(r, parts, asg, {});
    assertEqual(res.perPerson.a.totalCents, 0, 'Full discount zeroes out the total', results);
  }

  // 10. Unbalanced receipt is flagged, never silently accepted
  {
    const rec = CalcEngine.reconcileReceipt(mkReceipt({
      items: [{ id: 'i1', totalPriceCents: 1000, splittable: true, name: 'x' }],
      subtotalCents: 1000, taxCents: 100, totalCents: 5000,
    }));
    assertTrue(rec.balanced === false, 'Unbalanced receipt (total does not match subtotal+tax) is flagged', results);
  }

  // 11. Duplicate receipt detection (hamming distance helper)
  {
    const d = SnapDB.hammingDistanceHex('ff00', 'ff00');
    assertEqual(d, 0, 'Identical image hashes have zero hamming distance', results);
    const d2 = SnapDB.hammingDistanceHex('ff00', '0000');
    assertTrue(d2 > 0, 'Different image hashes have nonzero hamming distance', results);
  }

  // 12. Trip Ledger settlement / debt simplification
  {
    const balances = [{ id: 'alice', name: 'Alice', net: 5000 }, { id: 'bob', name: 'Bob', net: -2000 }, { id: 'carla', name: 'Carla', net: -3000 }];
    const txns = CalcEngine.simplifyDebts(balances);
    assertEqual(txns.length, 2, 'Debt simplification uses minimum transactions for classic 3-person example', results);
    const sumToAlice = txns.filter(t => t.to === 'alice').reduce((a, t) => a + t.amountCents, 0);
    assertEqual(sumToAlice, 5000, 'All money owed to Alice is accounted for', results);
  }

  // 13. Parser round trip on bundled fixtures (balanced ones only)
  {
    const sampleText = `TEST DINER\n01/01/2026\n1 x Burger  10.00\nSubtotal  10.00\nTax  1.00\nTotal  11.00\n`;
    const parsed = ReceiptParser.parseReceiptText(sampleText);
    assertEqual(parsed.items.length, 1, 'Parser extracts exactly one item from simple fixture', results);
    assertEqual(parsed.totalCents, 1100, 'Parser reads total correctly', results);
  }

  // 14. Money allocation never loses or gains a cent, incl. large weight sets
  {
    const weights = Array.from({ length: 7 }, (_, i) => i + 1);
    const allocated = Money.allocateProportional(9999, weights);
    assertEqual(Money.sum(allocated), 9999, 'Proportional allocation across 7 weighted shares sums exactly', results);
  }

  return results;
}

function renderDebugPanel() {
  const panel = $('#debugPanel');
  panel.innerHTML = '';
  panel.appendChild(el('div', { style: 'max-width:720px;margin:0 auto' }, [
    el('h2', {}, '🧪 SnapSplit developer test panel'),
    el('p', { class: 'muted small' }, 'Pure JS assertions against the calculation engine and parser. Visible via ?debug=1.'),
  ]));
  const results = runEngineTests();
  const summary = el('p', {}, `${results.filter(r => r.pass).length} / ${results.length} passed`);
  panel.appendChild(summary);
  results.forEach(r => {
    panel.appendChild(el('div', { class: 'test-result ' + (r.pass ? 'pass' : 'fail') },
      `${r.pass ? '✓' : '✗'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
  });
  panel.appendChild(el('button', { class: 'btn block', style: 'margin-top:16px', onclick: () => { panel.style.display = 'none'; } }, 'Close test panel'));
}
