// SnapSplit — History browser (topbar).
'use strict';

$('#btnHistory').addEventListener('click', openHistoryDialog);

async function openHistoryDialog() {
  const wrap = el('div', { style: 'min-width:min(80vw,420px)' });
  wrap.appendChild(el('h3', {}, 'History'));
  const search = el('input', { type: 'search', placeholder: 'Search merchant or date…', 'aria-label': 'Search history' });
  wrap.appendChild(search);
  const list = el('div', { style: 'margin-top:10px; max-height:50vh; overflow:auto' });
  wrap.appendChild(list);

  const all = await SnapDB.getAll('splits');
  const limits = Entitlements.limits();
  const isPremium = await Entitlements.has('unlimitedSavedSplits');

  function draw(filter) {
    list.innerHTML = '';
    const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
    const filtered = filter ? sorted.filter(s => (s.merchant || '').toLowerCase().includes(filter.toLowerCase()) || (s.date || '').includes(filter)) : sorted;
    if (!filtered.length) { list.appendChild(el('p', { class: 'muted small' }, 'No saved splits yet.')); return; }
    filtered.forEach((s, i) => {
      const locked = !isPremium && i >= limits.maxSavedSplits;
      const row = el('div', { class: 'history-item' });
      row.appendChild(el('div', {}, [
        el('strong', {}, s.merchant || 'Unnamed'), locked ? el('span', { class: 'badge-lock' }, 'LOCKED') : '',
        el('div', { class: 'muted small' }, [s.date, new Date(s.createdAt).toLocaleString()].filter(Boolean).join(' · ')),
      ]));
      const actions = el('div', { class: 'row', style: 'flex:0 0 auto; gap:6px' });
      const openBtn = el('button', { class: 'btn sm', disabled: locked }, 'Open');
      openBtn.addEventListener('click', () => { loadSplitRecord(s); closeDialog(); setStep('settle'); });
      const delBtn = el('button', { class: 'btn sm danger' }, 'Delete');
      delBtn.addEventListener('click', async () => { await SnapDB.del('splits', s.id); row.remove(); });
      actions.append(openBtn, delBtn);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }
  draw('');
  search.addEventListener('input', () => draw(search.value));

  const footer = el('div', { class: 'row', style: 'margin-top:12px' });
  footer.appendChild(el('button', { class: 'btn ghost', onclick: closeDialog }, 'Close'));
  footer.appendChild(el('button', {
    class: 'btn danger', onclick: async () => {
      if (!confirm('Delete ALL local SnapSplit data? This cannot be undone.')) return;
      await SnapDB.deleteAllData();
      toast('All local data deleted.', 'success');
      closeDialog();
    }
  }, 'Delete all local data'));
  wrap.appendChild(footer);

  openDialog(wrap);
}
