// SnapSplit — Settings: license, payment handles, cloud toggle, encrypted backup.
'use strict';

$('#btnSettings').addEventListener('click', () => openSettingsDialog());

async function openSettingsDialog(focusSection) {
  const wrap = el('div', { style: 'min-width:min(85vw,460px)' });
  wrap.appendChild(el('h3', {}, '⚙️ Settings'));

  const tabbar = el('div', { class: 'tabbar' });
  const sections = { general: 'General', license: 'License', payment: 'Payment handles', backup: 'Backup' };
  const body = el('div');
  let active = focusSection && sections[focusSection] ? focusSection : 'general';

  function draw() {
    tabbar.innerHTML = '';
    Object.entries(sections).forEach(([key, label]) => {
      const b = el('button', { class: key === active ? 'active' : '' }, label);
      b.addEventListener('click', () => { active = key; draw(); });
      tabbar.appendChild(b);
    });
    body.innerHTML = '';
    body.appendChild(
      active === 'general' ? renderGeneralSection() :
      active === 'license' ? renderLicenseSection() :
      active === 'payment' ? renderPaymentSection() :
      renderBackupSection()
    );
  }
  draw();
  wrap.append(tabbar, body);
  wrap.appendChild(el('button', { class: 'btn ghost block', style: 'margin-top:14px', onclick: closeDialog }, 'Close'));
  openDialog(wrap);
}

function renderGeneralSection() {
  const box = el('div');
  box.appendChild(el('p', { class: 'small muted' }, 'SnapSplit runs entirely in this browser. No account, no server, no tracking.'));
  const themeRow = el('div', { class: 'row' });
  ['light', 'dark', 'system'].forEach(mode => {
    const btn = el('button', { class: 'btn sm' }, mode);
    btn.addEventListener('click', () => {
      if (mode === 'system') { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('snapsplit-theme'); }
      else { document.documentElement.setAttribute('data-theme', mode); localStorage.setItem('snapsplit-theme', mode); }
    });
    themeRow.appendChild(btn);
  });
  box.appendChild(labeledField('Theme', themeRow));
  return box;
}

function renderLicenseSection() {
  const box = el('div');
  box.appendChild(el('p', { class: 'small muted' }, 'Premium unlocks unlimited participants & saved splits, batch import, Trip Ledger, encrypted backup, CSV export, and branding removal.'));
  const input = el('input', { type: 'text', placeholder: 'License key' });
  box.appendChild(labeledField('License key', input));
  const status = el('p', { class: 'small' });
  box.appendChild(status);
  const btn = el('button', {
    class: 'btn primary', onclick: async () => {
      status.textContent = 'Checking…';
      const result = await Entitlements.validateLicense(input.value.trim());
      await SnapDB.put('settings', { key: 'license', licenseKey: input.value.trim() });
      status.textContent = result.valid ? `Licensed: ${result.plan}` : 'No active license — running in free mode. (Cloud license validation is not yet connected; see js/entitlements.js.)';
    }
  }, 'Validate');
  box.appendChild(btn);
  return box;
}

function renderPaymentSection() {
  const box = el('div');
  box.appendChild(el('p', { class: 'small muted' }, 'Stored only on this device. Used to build payment deep links on the Settle screen.'));
  const venmo = el('input', { type: 'text', placeholder: '@your-venmo' });
  const paypal = el('input', { type: 'text', placeholder: 'your-paypal-me' });
  const cashapp = el('input', { type: 'text', placeholder: 'yourcashtag' });
  SnapDB.get('settings', 'paymentHandles').then(saved => {
    const v = (saved && saved.value) || {};
    venmo.value = v.venmo || ''; paypal.value = v.paypal || ''; cashapp.value = v.cashapp || '';
  });
  box.appendChild(labeledField('Venmo', venmo));
  box.appendChild(labeledField('PayPal.me', paypal));
  box.appendChild(labeledField('Cash App', cashapp));
  box.appendChild(el('button', {
    class: 'btn primary', onclick: async () => {
      await SnapDB.put('settings', { key: 'paymentHandles', value: { venmo: venmo.value.trim(), paypal: paypal.value.trim(), cashapp: cashapp.value.trim() } });
      toast('Saved.', 'success');
    }
  }, 'Save handles'));
  return box;
}

function renderBackupSection() {
  const box = el('div');
  box.appendChild(el('p', { class: 'small muted' }, 'Encrypted with AES-GCM using a passphrase only you know. Premium feature — export/import works here for evaluation even without a license so you can verify it end-to-end.'));
  const pass = el('input', { type: 'password', placeholder: 'Backup passphrase' });
  box.appendChild(labeledField('Passphrase', pass));

  box.appendChild(el('button', {
    class: 'btn primary block', onclick: async () => {
      if (!pass.value) { toast('Enter a passphrase.', 'error'); return; }
      const payload = {
        splits: await SnapDB.getAll('splits'),
        participants: await SnapDB.getAll('participants'),
        trips: await SnapDB.getAll('trips'),
        exportedAt: Date.now(),
      };
      const envelope = await CryptoBackup.encrypt(pass.value, payload);
      downloadFile('snapsplit-backup.json', JSON.stringify(envelope), 'application/json');
      toast('Encrypted backup downloaded.', 'success');
    }
  }, '⬇️ Export encrypted backup'));

  const fileInput = el('input', { type: 'file', accept: 'application/json', class: 'visually-hidden' });
  fileInput.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!pass.value) { toast('Enter the passphrase used to create this backup.', 'error'); return; }
    try {
      const envelope = JSON.parse(await f.text());
      const data = await CryptoBackup.decrypt(pass.value, envelope);
      for (const s of data.splits || []) await SnapDB.put('splits', s);
      for (const p of data.participants || []) await SnapDB.put('participants', p);
      for (const t of data.trips || []) await SnapDB.put('trips', t);
      toast('Backup restored.', 'success');
    } catch (err) {
      toast('Could not decrypt — wrong passphrase or corrupted file.', 'error');
    }
  });
  box.appendChild(el('button', { class: 'btn block', style: 'margin-top:8px', onclick: () => fileInput.click() }, '⬆️ Import encrypted backup'));
  box.appendChild(fileInput);
  return box;
}

function labeledField(label, inputEl) {
  const f = el('div', { class: 'field' });
  f.appendChild(el('label', {}, label));
  f.appendChild(inputEl);
  return f;
}
