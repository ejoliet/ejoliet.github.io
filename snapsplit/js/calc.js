// SnapSplit — pure calculation engine. No DOM. Unit-testable in isolation.
// All money in integer cents. Depends on Money (money.js).
'use strict';

const CalcEngine = (() => {

  // item: { id, name, quantity, unitPriceCents, totalPriceCents, taxable, splittable }
  // participants: [{ id, name, weight }]
  // assignment: { mode: 'equal'|'weighted'|'percentage'|'amount'|'quantity', shares: [{participantId, value}] }
  //   equal      -> shares just list participantIds (value ignored)
  //   weighted   -> value = weight override for this item (defaults to participant.weight)
  //   percentage -> value = percentage (0-100), normalized against total selected
  //   amount     -> value = cents (must be non-negative; scaled to match item total if it doesn't sum exactly)
  //   quantity   -> value = quantity units assigned (out of item.quantity)
  // assignments: Map/object itemId -> assignment
  // options: { taxMode: 'proportional'|'equal', tipMode: 'proportional'|'equal' }

  function splitItemAmongParticipants(item, assignment, participants) {
    const totalCents = item.totalPriceCents;
    if (!assignment || !assignment.shares || assignment.shares.length === 0) {
      return { perParticipant: {}, unclaimedCents: totalCents };
    }
    const ids = assignment.shares.map(s => s.participantId);
    const pMap = Object.fromEntries(participants.map(p => [p.id, p]));

    let weights;
    if (assignment.mode === 'equal') {
      weights = ids.map(() => 1);
    } else if (assignment.mode === 'weighted') {
      weights = assignment.shares.map(s => (s.value != null ? s.value : (pMap[s.participantId]?.weight ?? 1)));
    } else if (assignment.mode === 'percentage') {
      weights = assignment.shares.map(s => Math.max(0, s.value || 0));
    } else if (assignment.mode === 'quantity') {
      weights = assignment.shares.map(s => Math.max(0, s.value || 0));
    } else if (assignment.mode === 'amount') {
      // Fixed cents per person. If they don't sum to the item total, we
      // proportionally scale them so the item still reconciles exactly.
      const given = assignment.shares.map(s => Math.max(0, Math.round(s.value || 0)));
      const givenSum = Money.sum(given);
      if (givenSum === totalCents) {
        const perParticipant = {};
        ids.forEach((id, i) => { perParticipant[id] = (perParticipant[id] || 0) + given[i]; });
        return { perParticipant, unclaimedCents: 0, scaled: false };
      }
      weights = given.length && givenSum > 0 ? given : ids.map(() => 1);
      const allocated = Money.allocateProportional(totalCents, weights);
      const perParticipant = {};
      ids.forEach((id, i) => { perParticipant[id] = (perParticipant[id] || 0) + allocated[i]; });
      return { perParticipant, unclaimedCents: 0, scaled: true };
    } else {
      weights = ids.map(() => 1);
    }

    const allocated = Money.allocateProportional(totalCents, weights);
    const perParticipant = {};
    ids.forEach((id, i) => { perParticipant[id] = (perParticipant[id] || 0) + allocated[i]; });
    return { perParticipant, unclaimedCents: 0 };
  }

  function computeSplit(receipt, participants, assignments, options) {
    options = options || {};
    const taxMode = options.taxMode || 'proportional';
    const tipMode = options.tipMode || 'proportional';
    const audit = [];
    const pIds = participants.map(p => p.id);
    const itemSubtotal = Object.fromEntries(pIds.map(id => [id, 0]));
    const taxableSubtotal = Object.fromEntries(pIds.map(id => [id, 0]));
    let unclaimedCents = 0;

    const splittableItems = receipt.items.filter(it => it.splittable !== false);

    for (const item of splittableItems) {
      const assignment = assignments[item.id];
      const { perParticipant, unclaimedCents: uc } = splitItemAmongParticipants(item, assignment, participants);
      unclaimedCents += uc || 0;
      for (const [pid, cents] of Object.entries(perParticipant)) {
        if (!(pid in itemSubtotal)) continue;
        itemSubtotal[pid] += cents;
        if (item.taxable !== false) taxableSubtotal[pid] += cents;
      }
      audit.push(`Item "${item.name}" (${Money.format(item.totalPriceCents, receipt.currency)}) → ` +
        Object.entries(perParticipant).map(([pid, c]) => `${nameOf(participants, pid)}: ${Money.format(c, receipt.currency)}`).join(', ') +
        (uc ? ` [unclaimed: ${Money.format(uc, receipt.currency)}]` : ''));
    }

    const totalItemSubtotal = Money.sum(pIds.map(id => itemSubtotal[id]));
    const totalTaxable = Money.sum(pIds.map(id => taxableSubtotal[id]));

    // Discounts allocated proportional to each person's item subtotal.
    const discountWeights = pIds.map(id => itemSubtotal[id]);
    const discountShares = totalItemSubtotal > 0
      ? Money.allocateProportional(receipt.discountsCents || 0, discountWeights)
      : Money.allocateEqual(receipt.discountsCents || 0, pIds.length);
    const discountShare = Object.fromEntries(pIds.map((id, i) => [id, discountShares[i]]));
    audit.push(`Discount ${Money.format(receipt.discountsCents || 0, receipt.currency)} allocated by item-subtotal share.`);

    // Tax allocated proportional to taxable subtotal (or equally).
    let taxShares;
    if (taxMode === 'equal') {
      const weights = participants.map(p => p.weight ?? 1);
      taxShares = Money.allocateProportional(receipt.taxCents || 0, weights);
    } else {
      taxShares = totalTaxable > 0
        ? Money.allocateProportional(receipt.taxCents || 0, pIds.map(id => taxableSubtotal[id]))
        : Money.allocateEqual(receipt.taxCents || 0, pIds.length);
    }
    const taxShare = Object.fromEntries(pIds.map((id, i) => [id, taxShares[i]]));
    audit.push(`Tax ${Money.format(receipt.taxCents || 0, receipt.currency)} allocated ${taxMode === 'equal' ? 'equally (by weight)' : 'by taxable item share'}.`);

    // Tip allocated proportional to item subtotal (or equally).
    let tipShares;
    if (tipMode === 'equal') {
      const weights = participants.map(p => p.weight ?? 1);
      tipShares = Money.allocateProportional(receipt.tipCents || 0, weights);
    } else {
      tipShares = totalItemSubtotal > 0
        ? Money.allocateProportional(receipt.tipCents || 0, pIds.map(id => itemSubtotal[id]))
        : Money.allocateEqual(receipt.tipCents || 0, pIds.length);
    }
    const tipShare = Object.fromEntries(pIds.map((id, i) => [id, tipShares[i]]));
    audit.push(`Tip ${Money.format(receipt.tipCents || 0, receipt.currency)} allocated ${tipMode === 'equal' ? 'equally (by weight)' : 'by item-subtotal share'}.`);

    const perPerson = {};
    for (const id of pIds) {
      perPerson[id] = {
        itemSubtotalCents: itemSubtotal[id],
        taxableSubtotalCents: taxableSubtotal[id],
        discountShareCents: discountShare[id],
        taxShareCents: taxShare[id],
        tipShareCents: tipShare[id],
        totalCents: itemSubtotal[id] - discountShare[id] + taxShare[id] + tipShare[id],
      };
    }

    const grandTotal = Money.sum(Object.values(perPerson).map(p => p.totalCents));
    const reconciles = grandTotal === (receipt.totalCents || 0);

    return { perPerson, unclaimedCents, audit, grandTotal, reconciles, receiptTotalCents: receipt.totalCents || 0 };
  }

  function nameOf(participants, id) {
    const p = participants.find(x => x.id === id);
    return p ? p.name : '?';
  }

  // Reconciliation check for the raw receipt (before splitting).
  // Returns { itemSum, expectedTotal, discrepancyCents, balanced }
  function reconcileReceipt(receipt) {
    const itemSum = Money.sum(receipt.items.filter(i => i.splittable !== false).map(i => i.totalPriceCents || 0));
    const subtotalCents = receipt.subtotalCents != null ? receipt.subtotalCents : itemSum;
    const expectedTotal = subtotalCents - (receipt.discountsCents || 0) + (receipt.taxCents || 0) + (receipt.tipCents || 0);
    const itemVsSubtotal = itemSum - subtotalCents;
    const totalVsExpected = (receipt.totalCents || 0) - expectedTotal;
    const balanced = itemVsSubtotal === 0 && totalVsExpected === 0;
    return { itemSum, subtotalCents, expectedTotal, itemVsSubtotal, totalVsExpected, balanced };
  }

  // Debt simplification: greedy min-cash-flow. Heuristic — minimizes
  // transactions well in common cases but is not proven globally optimal.
  // balances: [{id, name, net}] where net>0 = owed money, net<0 = owes money (cents)
  function simplifyDebts(balances) {
    const eps = 0; // integer cents, exact
    const creditors = balances.filter(b => b.net > eps).map(b => ({ ...b })).sort((a, b) => b.net - a.net);
    const debtors = balances.filter(b => b.net < -eps).map(b => ({ ...b, net: -b.net })).sort((a, b) => b.net - a.net);
    const transactions = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const c = creditors[ci], d = debtors[di];
      const amount = Math.min(c.net, d.net);
      if (amount > 0) {
        transactions.push({ from: d.id, fromName: d.name, to: c.id, toName: c.name, amountCents: amount });
        c.net -= amount;
        d.net -= amount;
      }
      if (c.net === 0) ci++;
      if (d.net === 0) di++;
    }
    return transactions;
  }

  return { splitItemAmongParticipants, computeSplit, reconcileReceipt, simplifyDebts };
})();

if (typeof module !== 'undefined') module.exports = CalcEngine;
