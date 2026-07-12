// SnapSplit — money & allocation primitives. All amounts are integer minor units (cents).
// Never do currency arithmetic in floating point beyond this file's controlled rounding points.
'use strict';

const Money = (() => {

  function toCents(amount) {
    if (amount === '' || amount === null || amount === undefined) return 0;
    const n = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function fromCents(cents) {
    return cents / 100;
  }

  function format(cents, currency) {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    const whole = Math.floor(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');
    const symbol = currencySymbol(currency);
    return `${sign}${symbol}${whole.toLocaleString('en-US')}.${frac}`;
  }

  function currencySymbol(code) {
    switch ((code || 'USD').toUpperCase()) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'CAD': return 'CA$';
      case 'AUD': return 'A$';
      default: return (code || '') + ' ';
    }
  }

  // Distributes `totalCents` across `weights` proportionally, using the
  // largest-remainder method so the parts always sum EXACTLY to totalCents.
  // Works for totalCents of either sign; weights must be >= 0.
  function allocateProportional(totalCents, weights) {
    const n = weights.length;
    if (n === 0) return [];
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    if (sumWeights <= 0) {
      return allocateProportional(totalCents, weights.map(() => 1));
    }
    const sign = totalCents < 0 ? -1 : 1;
    const absTotal = Math.abs(totalCents);

    const raw = weights.map(w => (absTotal * w) / sumWeights);
    const floors = raw.map(Math.floor);
    const allocated = floors.reduce((a, b) => a + b, 0);
    let remainder = Math.round(absTotal - allocated);

    const order = raw
      .map((r, i) => ({ i, frac: r - floors[i] }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);

    const result = floors.slice();
    for (let k = 0; k < remainder; k++) {
      result[order[k % n].i] += 1;
    }
    return result.map(c => c * sign);
  }

  // Splits totalCents equally among n shares, largest-remainder deterministic
  // (earlier indices get the extra cent first).
  function allocateEqual(totalCents, n) {
    return allocateProportional(totalCents, new Array(n).fill(1));
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  return { toCents, fromCents, format, currencySymbol, allocateProportional, allocateEqual, sum, round2 };
})();

if (typeof module !== 'undefined') module.exports = Money;
