// SnapSplit — receipt text parser. Turns raw OCR (or pasted) text into a
// structured receipt object. Heuristic by nature: always paired with the
// reconciliation check in calc.js and a manual-edit UI, never trusted blindly.
'use strict';

const ReceiptParser = (() => {

  const MONEY_RE = /-?\$?\s?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b|-?\$?\s?\d+[.,]\d{2}\b/;
  const MONEY_RE_G = new RegExp(MONEY_RE.source, 'g');
  const QTY_PREFIX_RE = /^\s*(\d+)\s*[xX*]\s*(.+)$/;             // "2 x Latte"
  const QTY_AT_RE = /^(.*?)\s+(\d+)\s*[xX@]\s*\$?(\d+[.,]\d{2})\s*$/; // "Latte 2 x 4.50"
  const LEADING_QTY_RE = /^\s*(\d+)\s+(?=[A-Za-z])/;             // "2 Garlic Bread"

  const SUBTOTAL_WORDS = /^(sub\s?total|subtotal|item(s)?\s*total|net\s*amount)\b/i;
  const TAX_WORDS = /\b(tax|vat|gst|hst|sales\s*tax)\b/i;
  const TIP_WORDS = /\b(tip|gratuity|service\s*charge)\b/i;
  const DISCOUNT_WORDS = /\b(discount|coupon|promo|comp\b|savings)\b/i;
  const TOTAL_WORDS = /^(grand\s*total|total\s*due|balance\s*due|amount\s*due|total)\b/i;
  const NOISE_WORDS = /\b(visa|mastercard|amex|discover|card|auth|approval|terminal|order\s*#|order\s*number|table|server|phone|tel|invoice|receipt\s*#|ref\s*#|id\s*:|cashier|change\s*due|cash\s*tendered)\b/i;
  const PHONE_RE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
  const CARD_MASK_RE = /\*{2,}\d{2,6}/;
  const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{4})\b/;

  function parseMoneyToken(tok) {
    if (!tok) return null;
    let neg = /^-/.test(tok.trim()) || /^\(.*\)$/.test(tok.trim());
    let cleaned = tok.replace(/[()$\s]/g, '').replace(/^-/, '');
    // normalize thousands/decimal: assume last separator (. or ,) before 2 digits is decimal
    const m = cleaned.match(/^(\d[\d.,]*\d)$/);
    if (!m) return null;
    let s = m[1];
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decIdx = Math.max(lastDot, lastComma);
    if (decIdx === -1) return null;
    const intPart = s.slice(0, decIdx).replace(/[.,]/g, '');
    const fracPart = s.slice(decIdx + 1);
    if (fracPart.length !== 2) return null;
    const cents = parseInt(intPart || '0', 10) * 100 + parseInt(fracPart, 10) * (neg ? -1 : 1);
    return neg ? -Math.abs(parseInt(intPart || '0', 10) * 100 + parseInt(fracPart, 10)) : cents;
  }

  function looksLikeNoise(line) {
    if (NOISE_WORDS.test(line)) return true;
    if (PHONE_RE.test(line)) return true;
    if (CARD_MASK_RE.test(line)) return true;
    if (/^\d{4,}$/.test(line.trim())) return true; // bare long numeric IDs
    if (/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i.test(line)) return true; // timestamps
    return false;
  }

  function extractAllMoney(line) {
    const matches = line.match(MONEY_RE_G) || [];
    return matches.map(parseMoneyToken).filter(v => v !== null);
  }

  function lastMoneyOnLine(line) {
    const all = extractAllMoney(line);
    return all.length ? all[all.length - 1] : null;
  }

  function parseReceiptText(rawText) {
    const lines = rawText
      .split(/\r?\n/)
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l.length > 0);

    const result = {
      merchant: '',
      date: '',
      currency: 'USD',
      items: [],
      subtotalCents: null,
      discountsCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: null,
      lowConfidenceFields: [],
    };

    if (lines.length) result.merchant = lines[0].slice(0, 60);
    for (const l of lines.slice(0, 6)) {
      const dm = l.match(DATE_RE);
      if (dm) { result.date = dm[0]; break; }
    }

    let pendingName = null;

    const HEADER_NOISE_RE = /^(date|time|order\s*date)\s*:/i;
    const ADDRESS_RE = /\d+\s+\w+.*\b(st|street|ave|avenue|rd|road|blvd|drive|dr|way|ln|lane)\b\.?,?/i;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      if (idx === 0) continue; // already captured as merchant name
      if (HEADER_NOISE_RE.test(line) || ADDRESS_RE.test(line) || DATE_RE.test(line)) continue;

      if (SUBTOTAL_WORDS.test(line)) {
        const v = lastMoneyOnLine(line);
        if (v !== null) result.subtotalCents = v;
        pendingName = null;
        continue;
      }
      if (TOTAL_WORDS.test(line) && !SUBTOTAL_WORDS.test(line)) {
        const v = lastMoneyOnLine(line);
        if (v !== null) result.totalCents = v;
        pendingName = null;
        continue;
      }
      if (TAX_WORDS.test(line)) {
        const v = lastMoneyOnLine(line);
        if (v !== null) result.taxCents += v;
        pendingName = null;
        continue;
      }
      if (TIP_WORDS.test(line)) {
        const v = lastMoneyOnLine(line);
        if (v !== null) result.tipCents += v;
        pendingName = null;
        continue;
      }
      if (DISCOUNT_WORDS.test(line)) {
        const v = lastMoneyOnLine(line);
        if (v !== null) result.discountsCents += Math.abs(v);
        pendingName = null;
        continue;
      }
      if (looksLikeNoise(line)) { continue; }

      const money = extractAllMoney(line);
      if (money.length === 0) {
        // Could be a wrapped item name continuation, or plain header noise.
        if (line.length < 40 && !/^\d+$/.test(line)) {
          pendingName = pendingName ? pendingName + ' ' + line : line.replace(LEADING_QTY_RE, '').trim();
        }
        continue;
      }

      // Line has at least one money value -> treat as an item line.
      let name = line;
      let quantity = 1;
      let unitPriceCents, totalPriceCents;

      const qtyAt = line.match(QTY_AT_RE);
      const qtyPrefix = line.match(QTY_PREFIX_RE);

      if (money.length >= 2 && qtyAt) {
        quantity = parseInt(qtyAt[2], 10);
        unitPriceCents = parseMoneyToken(qtyAt[3]);
        totalPriceCents = money[money.length - 1];
        name = qtyAt[1];
      } else if (qtyPrefix) {
        quantity = parseInt(qtyPrefix[1], 10);
        name = qtyPrefix[2].replace(MONEY_RE_G, '').trim();
        totalPriceCents = money[money.length - 1];
        unitPriceCents = quantity > 0 ? Math.round(totalPriceCents / quantity) : totalPriceCents;
      } else {
        const leadQty = line.match(LEADING_QTY_RE);
        if (leadQty) quantity = parseInt(leadQty[1], 10) || 1;
        name = line.replace(MONEY_RE_G, '').replace(LEADING_QTY_RE, '').trim();
        totalPriceCents = money[money.length - 1];
        unitPriceCents = quantity > 0 ? Math.round(totalPriceCents / quantity) : totalPriceCents;
      }

      name = name.replace(/@\s*$/, '').replace(/[-–—.\s]{2,}$/, '').trim();
      if (pendingName) { name = `${pendingName} ${name}`.trim(); }
      if (!name) name = `Item ${result.items.length + 1}`;

      const confidence = estimateConfidence(line, name, totalPriceCents);
      const item = {
        id: 'it_' + Math.random().toString(36).slice(2, 10),
        name,
        quantity: quantity || 1,
        unitPriceCents: unitPriceCents ?? totalPriceCents,
        totalPriceCents,
        taxable: true,
        splittable: true,
        confidence,
        sourceText: line,
      };
      result.items.push(item);
      pendingName = null;
    }

    if (result.totalCents === null) {
      const itemSum = result.items.reduce((a, b) => a + b.totalPriceCents, 0);
      result.totalCents = (result.subtotalCents ?? itemSum) - result.discountsCents + result.taxCents + result.tipCents;
      result.lowConfidenceFields.push('totalCents');
    }
    if (result.subtotalCents === null) {
      result.subtotalCents = result.items.reduce((a, b) => a + b.totalPriceCents, 0);
      result.lowConfidenceFields.push('subtotalCents');
    }

    return result;
  }

  function estimateConfidence(line, name, price) {
    let score = 0.9;
    if (!price) score -= 0.5;
    if (name.length < 2) score -= 0.3;
    if (/\d{4,}/.test(name)) score -= 0.2;
    if (/[^\x00-\x7F]/.test(line)) score -= 0.05;
    return Math.max(0.05, Math.min(1, score));
  }

  return { parseReceiptText, parseMoneyToken, extractAllMoney };
})();

if (typeof module !== 'undefined') module.exports = ReceiptParser;
