(async () => {
  // AIDEV-NOTE: runs on the FORUM origin, so same-origin fetch and no CORS.
  // Dependency-free. index.html replaces __MINIPRESS_URL__ and wraps this in void(...).
  // AIDEV-NOTE: window.open must run synchronously during the click (Safari popup rule).
  // We open about:blank first, then point it at minipress once the data is ready.
  const MINIPRESS = '__MINIPRESS_URL__';
  const TARGET = new URL(MINIPRESS).origin;
  const N_TOPICS = 30, N_LEADS = 12, LEAD_CHARS = 600;
  const WEEK = 7 * 864e5;

  const w = window.open('about:blank', '_blank');
  if (!w) return alert('minipress: popup blocked. Allow popups for this forum, then click again.');

  const fail = (msg) => { try { w.close(); } catch (_) {} alert('minipress: ' + msg); };
  const ts = (s) => { const t = Date.parse(s); return Number.isNaN(t) ? 0 : t; };
  const plain = (h) => {
    const d = new DOMParser().parseFromString(String(h || ''), 'text/html');
    return ((d.body && d.body.textContent) || '').replace(/\s+/g, ' ').trim();
  };
  const get = async (path) => {
    const r = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path);
    return r.json();
  };

  let latest;
  try {
    latest = await get('/latest.json');
  } catch (e) {
    return fail('forum refused or unreachable (' + e.message + '). Log in or wait a minute.');
  }

  const users = new Map((latest.users || []).map((u) => [u.id, u.username]));
  const items = (latest.topic_list.topics || []).slice(0, N_TOPICS).map((t) => ({
    id: t.id,
    title: plain(t.fancy_title || t.title),
    url: location.origin + '/t/' + t.id,
    author: users.get(t.posters && t.posters[0] && t.posters[0].user_id) || t.last_poster_username || 'unknown',
    created_at: t.created_at,
    bumped_at: t.bumped_at,
    category_id: t.category_id,
    tags: t.tags || [],
    reply_count: t.reply_count || 0,
    like_count: t.like_count || 0,
    views: t.views || 0,
    pinned: !!(t.pinned || t.pinned_globally),
    lead: '',
  }));

  const score = (i) => {
    const s = i.reply_count + i.like_count / 2 + i.views / 200;
    return Date.now() - ts(i.bumped_at) < WEEK ? s * 2 : s;
  };
  const top = items.filter((i) => !i.pinned).sort((a, b) => score(b) - score(a)).slice(0, N_LEADS);

  // Sequential, not parallel: gentler on the forum's rate limits.
  for (const it of top) {
    try {
      const t = await get('/t/' + it.id + '.json');
      const first = ((t.post_stream && t.post_stream.posts) || [])[0];
      if (first) it.lead = plain(first.cooked).slice(0, LEAD_CHARS);
    } catch (_) { /* no lead for this story */ }
  }

  const categories = {};
  for (const c of latest.categories || []) categories[c.id] = { name: c.name, color: c.color || '' };

  const issue = {
    minipress: 1,
    source: { url: location.origin, title: document.title || location.host, fetched_at: new Date().toISOString() },
    categories,
    items,
  };

  // Point the already-open window at minipress. Its origin is TARGET, so postMessage uses it.
  try { w.location.href = MINIPRESS + '#await'; } catch (_) { return fail('could not open minipress.'); }

  let acked = false;
  const onMsg = (e) => {
    if (e.source === w && e.data && e.data.type === 'minipress/ack') acked = true;
  };
  window.addEventListener('message', onMsg);

  // Retry until acked. The new page's listener may not be attached on the first send.
  const started = Date.now();
  const timer = setInterval(() => {
    if (acked) { clearInterval(timer); window.removeEventListener('message', onMsg); return; }
    if (w.closed || Date.now() - started > 10000) {
      clearInterval(timer);
      window.removeEventListener('message', onMsg);
      if (!acked) alert('minipress: no answer. Open minipress first, then click again.');
      return;
    }
    w.postMessage({ type: 'minipress/issue', issue }, TARGET);
  }, 300);
})();
