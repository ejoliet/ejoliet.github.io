// SnapSplit — Step 3: People.
'use strict';

function renderPeopleStep() {
  const wrap = el('div');

  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h2', {}, 'Who’s splitting this?'));
  panel.appendChild(el('p', { class: 'muted small' }, 'Add each person. Mark who paid, and adjust weight for kids or lighter appetites.'));

  const list = el('div', { class: 'people-list' });
  state.participants.forEach(p => list.appendChild(renderPersonChip(p)));
  panel.appendChild(list);

  const limits = Entitlements.limits();
  const form = el('form', { class: 'row', style: 'margin-top:6px' });
  const nameInput = el('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Person name', autocomplete: 'off' });
  const addBtn = el('button', { class: 'btn primary', type: 'submit' }, '+ Add');
  form.append(nameInput, addBtn);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    if (state.participants.length >= limits.maxParticipants && !(await Entitlements.has('unlimitedParticipants'))) {
      showUpsell(`Free plan is limited to ${limits.maxParticipants} participants.`, 'unlimitedParticipants');
      return;
    }
    addParticipant(name);
    nameInput.value = '';
    renderStep();
  });
  panel.appendChild(form);
  wrap.appendChild(panel);

  wrap.appendChild(renderRecentParticipantsPanel());

  return wrap;
}

function addParticipant(name, weight) {
  state.participants.push({
    id: uid('p'), name, weight: weight ?? 1, isPayer: state.participants.length === 0,
  });
}

function renderPersonChip(p) {
  const chip = el('div', { class: 'person-chip' });
  chip.appendChild(el('div', { class: 'avatar', style: `background:${colorForName(p.name)}` }, initialsForName(p.name)));
  const nameSpan = el('span', {}, p.name);
  chip.appendChild(nameSpan);

  const weightSel = el('select', { 'aria-label': `${p.name} weight`, style: 'min-height:30px; padding:2px 6px; font-size:12px' });
  [[1, 'Full (1x)'], [0.5, 'Half (0.5x)'], [1.5, '1.5x']].forEach(([v, label]) => {
    weightSel.appendChild(el('option', { value: v, selected: p.weight === v }, label));
  });
  weightSel.addEventListener('change', () => { p.weight = parseFloat(weightSel.value); });
  chip.appendChild(weightSel);

  if (p.isPayer) chip.appendChild(el('span', { class: 'payer-badge' }, 'Paid'));
  else {
    const payBtn = el('button', { class: 'btn sm ghost', style: 'padding:3px 8px; font-size:11px' }, 'Mark paid');
    payBtn.addEventListener('click', () => { state.participants.forEach(x => x.isPayer = false); p.isPayer = true; renderStep(); });
    chip.appendChild(payBtn);
  }

  const rm = el('button', { class: 'remove', 'aria-label': `Remove ${p.name}` }, '✕');
  rm.addEventListener('click', () => {
    state.participants = state.participants.filter(x => x.id !== p.id);
    for (const a of Object.values(state.assignments)) {
      if (a && a.shares) a.shares = a.shares.filter(s => s.participantId !== p.id);
    }
    renderStep();
  });
  chip.appendChild(rm);
  return chip;
}

function renderRecentParticipantsPanel() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('h3', {}, 'Recent people'));
  const box = el('div', { class: 'people-list' });
  panel.appendChild(box);
  SnapDB.getAll('participants').then(all => {
    box.innerHTML = '';
    const known = new Set(state.participants.map(p => p.name.toLowerCase()));
    const recents = all.sort((a, b) => b.lastUsed - a.lastUsed).filter(p => !known.has(p.name.toLowerCase())).slice(0, 10);
    if (!recents.length) { box.appendChild(el('p', { class: 'muted small' }, 'No recent participants yet.')); return; }
    recents.forEach(p => {
      const btn = el('button', { class: 'btn sm ghost' }, `+ ${p.name}`);
      btn.addEventListener('click', () => { addParticipant(p.name, p.weight); renderStep(); });
      box.appendChild(btn);
    });
  });
  return panel;
}

function showUpsell(message, feature) {
  const wrap = el('div');
  wrap.appendChild(el('h3', {}, '✨ Premium'));
  wrap.appendChild(el('p', { class: 'small' }, message));
  wrap.appendChild(el('p', { class: 'small muted' }, `Feature key: ${feature}. Entitlements are centralized in js/entitlements.js — connect a real license provider there when ready.`));
  const row = el('div', { class: 'row', style: 'margin-top:14px' });
  row.appendChild(el('button', { class: 'btn ghost', onclick: closeDialog }, 'Close'));
  row.appendChild(el('button', { class: 'btn primary', onclick: () => { closeDialog(); openSettingsDialog('license'); } }, 'Enter a license key'));
  wrap.appendChild(row);
  openDialog(wrap);
}
