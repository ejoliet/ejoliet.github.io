(() => {
  'use strict';

  const PREVIEW_LIMIT = 200;
  const state = {
    SQL: null,
    db: null,
    fileName: '',
    fileSize: 0,
    tables: [],
    selectedTable: null,
    currentPreview: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    welcome: $('welcome'), explorer: $('explorer'), dropZone: $('dropZone'),
    fileBtn: $('fileBtn'), folderBtn: $('folderBtn'), fileInput: $('fileInput'), folderInput: $('folderInput'),
    urlForm: $('urlForm'), urlInput: $('urlInput'), demoBtn: $('demoBtn'), openAnotherBtn: $('openAnotherBtn'),
    dbName: $('dbName'), dbMeta: $('dbMeta'), tableSearch: $('tableSearch'), tableList: $('tableList'),
    metricTables: $('metricTables'), metricColumns: $('metricColumns'), metricRows: $('metricRows'), metricSize: $('metricSize'),
    browseTitle: $('browseTitle'), browseCount: $('browseCount'), dataGrid: $('dataGrid'), exportCsvBtn: $('exportCsvBtn'),
    schemaCards: $('schemaCards'), sqlEditor: $('sqlEditor'), runQueryBtn: $('runQueryBtn'), queryStatus: $('queryStatus'),
    resultsTitle: $('resultsTitle'), queryResults: $('queryResults'), loading: $('loading'), loadingText: $('loadingText'), toast: $('toast'),
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindEvents();
    setLoading(true, 'Loading SQLite WebAssembly…');
    try {
      state.SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
      setLoading(false);
    } catch (error) {
      setLoading(false);
      showToast(`Could not load SQLite WASM: ${error.message}`, true);
    }
  }

  function bindEvents() {
    els.fileBtn.addEventListener('click', () => els.fileInput.click());
    els.folderBtn.addEventListener('click', () => els.folderInput.click());
    els.openAnotherBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', e => e.target.files[0] && openFile(e.target.files[0]));
    els.folderInput.addEventListener('change', e => openFolderFiles([...e.target.files]));
    els.demoBtn.addEventListener('click', loadDemo);
    els.urlForm.addEventListener('submit', openUrl);
    els.tableSearch.addEventListener('input', renderTableList);
    els.exportCsvBtn.addEventListener('click', exportCurrentCsv);
    els.runQueryBtn.addEventListener('click', runEditorQuery);
    els.sqlEditor.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runEditorQuery();
      }
    });

    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

    ['dragenter', 'dragover'].forEach(name => els.dropZone.addEventListener(name, e => {
      e.preventDefault();
      els.dropZone.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(name => els.dropZone.addEventListener(name, e => {
      e.preventDefault();
      els.dropZone.classList.remove('dragging');
    }));
    els.dropZone.addEventListener('drop', e => {
      const files = [...e.dataTransfer.files];
      if (files.length) openFolderFiles(files);
    });
    els.dropZone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput.click();
      }
    });
  }

  async function openFile(file) {
    setLoading(true, `Opening ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      openDatabase(bytes, file.name, file.size);
    } catch (error) {
      showToast(`Could not open file: ${error.message}`, true);
    } finally {
      setLoading(false);
      els.fileInput.value = '';
    }
  }

  function openFolderFiles(files) {
    const candidates = files.filter(file => /\.(sqlite|sqlite3|db|db3)$/i.test(file.name));
    const chosen = candidates[0] || files[0];
    if (!chosen) return;
    if (candidates.length > 1) showToast(`Found ${candidates.length} SQLite-looking files. Opening ${chosen.name}.`);
    openFile(chosen);
    els.folderInput.value = '';
  }

  async function openUrl(event) {
    event.preventDefault();
    const url = els.urlInput.value.trim();
    if (!url) return;
    setLoading(true, 'Downloading remote database…');
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'remote.sqlite');
      openDatabase(new Uint8Array(buffer), name, buffer.byteLength);
    } catch (error) {
      showToast(`Could not fetch database. Check the URL and CORS policy. ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  }

  function openDatabase(bytes, name, size) {
    if (!state.SQL) throw new Error('SQLite engine is still loading');
    if (state.db) state.db.close();
    state.db = new state.SQL.Database(bytes);
    state.fileName = name;
    state.fileSize = size || bytes.byteLength;
    inspectDatabase();
    els.welcome.classList.add('hidden');
    els.explorer.classList.remove('hidden');
    showToast(`Opened ${name}`);
  }

  function loadDemo() {
    if (!state.SQL) return showToast('SQLite engine is still loading.', true);
    setLoading(true, 'Creating example database…');
    try {
      const db = new state.SQL.Database();
      db.run(`
        CREATE TABLE customers (
          customer_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          segment TEXT NOT NULL,
          joined_at TEXT NOT NULL
        );
        CREATE TABLE products (
          product_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL
        );
        CREATE TABLE orders (
          order_id INTEGER PRIMARY KEY,
          customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
          ordered_at TEXT NOT NULL,
          status TEXT NOT NULL,
          total REAL NOT NULL
        );
        CREATE INDEX idx_orders_customer ON orders(customer_id);
      `);
      db.run(`INSERT INTO customers VALUES
        (1,'Ada Lovelace','ada@example.test','Research','2025-01-12'),
        (2,'Grace Hopper','grace@example.test','Enterprise','2025-02-03'),
        (3,'Katherine Johnson','katherine@example.test','Research','2025-02-20'),
        (4,'Margaret Hamilton','margaret@example.test','Enterprise','2025-03-05'),
        (5,'Edsger Dijkstra','edsger@example.test','Developer','2025-03-18'),
        (6,'Barbara Liskov','barbara@example.test','Developer','2025-04-02');`);
      db.run(`INSERT INTO products VALUES
        (1,'Orbit Notebook','Productivity',14.00),
        (2,'Dataset Pro','Analytics',49.00),
        (3,'Atlas API','Developer',29.00),
        (4,'Signal Studio','Analytics',79.00);`);
      db.run(`INSERT INTO orders VALUES
        (1001,1,'2026-08-02','paid',63.00),
        (1002,2,'2026-08-05','paid',79.00),
        (1003,1,'2026-08-21','paid',29.00),
        (1004,4,'2026-09-02','refunded',49.00),
        (1005,3,'2026-09-10','paid',128.00),
        (1006,6,'2026-09-14','paid',29.00),
        (1007,5,'2026-09-22','pending',14.00),
        (1008,2,'2026-09-24','paid',98.00),
        (1009,3,'2026-09-26','paid',49.00);`);
      const bytes = db.export();
      db.close();
      openDatabase(bytes, 'atlas-demo.sqlite', bytes.byteLength);
      els.sqlEditor.value = `SELECT\n  c.name,\n  c.segment,\n  COUNT(o.order_id) AS orders,\n  ROUND(SUM(o.total), 2) AS revenue\nFROM customers c\nJOIN orders o USING (customer_id)\nGROUP BY c.customer_id\nORDER BY revenue DESC;`;
    } finally {
      setLoading(false);
    }
  }

  function inspectDatabase() {
    const tableRows = execRows(`
      SELECT name, type, sql
      FROM sqlite_master
      WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `);

    state.tables = tableRows.map(row => {
      const columns = execRows(`PRAGMA table_info(${quoteIdentifier(row.name)})`);
      let count = null;
      try { count = scalar(`SELECT COUNT(*) FROM ${quoteIdentifier(row.name)}`); } catch (_) {}
      return { ...row, columns, count };
    });
    state.selectedTable = null;
    state.currentPreview = null;

    const totalColumns = state.tables.reduce((sum, table) => sum + table.columns.length, 0);
    const totalRows = state.tables.every(t => Number.isFinite(Number(t.count)))
      ? state.tables.reduce((sum, table) => sum + Number(table.count), 0)
      : null;

    els.dbName.textContent = state.fileName;
    els.dbMeta.textContent = `${state.tables.length} ${state.tables.length === 1 ? 'table/view' : 'tables/views'}`;
    els.metricTables.textContent = formatNumber(state.tables.length);
    els.metricColumns.textContent = formatNumber(totalColumns);
    els.metricRows.textContent = totalRows === null ? '—' : formatNumber(totalRows);
    els.metricSize.textContent = formatBytes(state.fileSize);
    els.tableSearch.value = '';
    renderTableList();
    renderSchema();

    const first = state.tables[0];
    if (first) selectTable(first.name);
    else {
      els.browseTitle.textContent = 'No user tables found';
      els.dataGrid.className = 'data-grid empty-state';
      els.dataGrid.innerHTML = '<div><strong>Empty schema</strong><span>This database has no user tables or views.</span></div>';
    }
  }

  function renderTableList() {
    const filter = els.tableSearch.value.trim().toLowerCase();
    const tables = state.tables.filter(t => t.name.toLowerCase().includes(filter));
    els.tableList.innerHTML = tables.map(table => `
      <button class="table-item ${table.name === state.selectedTable ? 'active' : ''}" data-table="${escapeHtml(table.name)}">
        <span>${escapeHtml(table.name)}</span>
        <small>${table.count == null ? table.type : formatNumber(table.count)}</small>
      </button>
    `).join('') || '<div class="muted" style="padding:14px">No matching tables</div>';
    els.tableList.querySelectorAll('.table-item').forEach(btn => btn.addEventListener('click', () => selectTable(btn.dataset.table)));
  }

  function selectTable(name) {
    state.selectedTable = name;
    renderTableList();
    const table = state.tables.find(t => t.name === name);
    if (!table) return;
    els.browseTitle.textContent = name;
    const rows = execResult(`SELECT * FROM ${quoteIdentifier(name)} LIMIT ${PREVIEW_LIMIT}`);
    state.currentPreview = rows;
    els.browseCount.textContent = table.count == null ? `Showing up to ${PREVIEW_LIMIT}` : `${formatNumber(Math.min(table.count, PREVIEW_LIMIT))} of ${formatNumber(table.count)} rows`;
    els.exportCsvBtn.disabled = !rows;
    renderResultGrid(els.dataGrid, rows, `Table ${name} has no rows.`);
  }

  function renderSchema() {
    els.schemaCards.innerHTML = state.tables.map(table => `
      <article class="schema-card">
        <div class="schema-card-head">
          <strong>${escapeHtml(table.name)}</strong>
          <span>${escapeHtml(table.type)} · ${table.columns.length} cols${table.count == null ? '' : ` · ${formatNumber(table.count)} rows`}</span>
        </div>
        <div>
          ${table.columns.map(col => `
            <div class="column-row">
              <span class="col-name">${escapeHtml(col.name)}</span>
              <span class="col-type">${escapeHtml(col.type || '—')}</span>
              <span class="col-key">${col.pk ? 'PK' : col.notnull ? 'NN' : ''}</span>
            </div>`).join('')}
        </div>
      </article>`).join('') || '<div class="empty-state" style="min-height:240px"><div><strong>No schema</strong><span>No user tables found.</span></div></div>';
  }

  function runEditorQuery() {
    if (!state.db) return;
    const sql = els.sqlEditor.value.trim();
    if (!sql) return;
    const started = performance.now();
    els.queryStatus.textContent = 'Running…';
    try {
      const results = state.db.exec(sql);
      const elapsed = performance.now() - started;
      els.queryStatus.textContent = `${elapsed.toFixed(1)} ms`;
      els.resultsTitle.textContent = results.length ? `${results[0].values.length} rows returned` : 'Statement completed';
      renderResultGrid(els.queryResults, results[0] || null, 'Statement completed successfully. No rows returned.');
      if (/\b(create|drop|alter|insert|update|delete|replace)\b/i.test(sql)) inspectDatabase();
    } catch (error) {
      els.queryStatus.textContent = 'Error';
      els.resultsTitle.textContent = 'Query error';
      els.queryResults.className = 'data-grid empty-state';
      els.queryResults.innerHTML = `<div><strong>SQLite error</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function renderResultGrid(container, result, emptyMessage) {
    if (!result || !result.columns || !result.values || result.values.length === 0) {
      container.className = 'data-grid empty-state';
      container.innerHTML = `<div><strong>No rows</strong><span>${escapeHtml(emptyMessage)}</span></div>`;
      return;
    }
    container.className = 'data-grid';
    const head = `<thead><tr>${result.columns.map(c => `<th title="${escapeHtml(c)}">${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${result.values.map(row => `<tr>${row.map(value => {
      const isNull = value === null;
      const text = isNull ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `<td class="${isNull ? 'null' : ''}" title="${escapeHtml(text)}">${escapeHtml(text)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;
    container.innerHTML = `<table>${head}${body}</table>`;
  }

  function exportCurrentCsv() {
    const result = state.currentPreview;
    if (!result) return;
    const escapeCsv = value => {
      if (value === null) return '';
      const text = String(value).replace(/"/g, '""');
      return /[",\n]/.test(text) ? `"${text}"` : text;
    };
    const csv = [result.columns.map(escapeCsv).join(','), ...result.values.map(row => row.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${state.selectedTable || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function activateTab(name) {
    document.querySelectorAll('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    $(`${name}Tab`).classList.add('active');
  }

  function execRows(sql) {
    const result = state.db.exec(sql)[0];
    if (!result) return [];
    return result.values.map(values => Object.fromEntries(result.columns.map((col, i) => [col, values[i]])));
  }

  function execResult(sql) { return state.db.exec(sql)[0] || null; }
  function scalar(sql) { const r = state.db.exec(sql)[0]; return r?.values?.[0]?.[0]; }
  function quoteIdentifier(name) { return `"${String(name).replace(/"/g, '""')}"`; }

  function setLoading(show, text = '') {
    els.loading.classList.toggle('hidden', !show);
    if (text) els.loadingText.textContent = text;
  }

  function showToast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 3500);
  }

  function formatNumber(value) { return new Intl.NumberFormat().format(value); }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    const units = ['B','KB','MB','GB'];
    let value = bytes, unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value < 10 && unit ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
  }
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
})();
