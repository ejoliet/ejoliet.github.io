// SnapSplit — centralized entitlement gate. Every premium check in the app
// goes through this module so swapping in a real license provider later
// (Lemon Squeezy, Paddle, Stripe, ...) means editing ONE function.
'use strict';

const Entitlements = (() => {
  const FREE_LIMITS = {
    maxReceiptsPerSplit: 1,
    maxParticipants: 8,
    maxSavedSplits: 5,
  };

  const PREMIUM_FEATURES = [
    'unlimitedSavedSplits',
    'unlimitedParticipants',
    'batchReceiptImport',
    'longReceiptStitching',
    'customAllocationRules',
    'recurringGroups',
    'csvExport',
    'polishedPrintReport',
    'encryptedBackup',
    'removeBranding',
    'tripLedger',
    'debtSimplification',
  ];

  let cached = { valid: false, plan: 'free', checkedAt: 0 };

  // AIDEV: connect to Lemon Squeezy, Paddle, or another license provider.
  // Replace the body of this function only — nothing else in the app should
  // ever need to change to swap providers. Must not throw; return a safe
  // { valid:false, plan:'free' } on any network/parsing failure.
  async function validateLicense(key) {
    return {
      valid: false,
      plan: 'free',
    };
  }

  async function getPlan() {
    const saved = await SnapDB.get('settings', 'license').catch(() => null);
    if (!saved || !saved.licenseKey) return { valid: false, plan: 'free' };
    if (Date.now() - cached.checkedAt < 5 * 60 * 1000 && cached.key === saved.licenseKey) return cached;
    const result = await validateLicense(saved.licenseKey);
    cached = { ...result, checkedAt: Date.now(), key: saved.licenseKey };
    return result;
  }

  async function isPremium() {
    const plan = await getPlan();
    return !!plan.valid && plan.plan !== 'free';
  }

  async function has(feature) {
    if (!PREMIUM_FEATURES.includes(feature)) return true; // not a gated feature
    return await isPremium();
  }

  function limits() {
    return { ...FREE_LIMITS };
  }

  return { validateLicense, getPlan, isPremium, has, limits, PREMIUM_FEATURES };
})();
