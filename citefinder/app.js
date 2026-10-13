/* citefinder — static, local-first citation finder for GitHub repositories.
 * AIDEV-NOTE: No third-party code. API data is rendered with textContent only (never innerHTML).
 * AIDEV-NOTE: Credential invariant — tokens live in sessionStorage (tab-scoped), never in URLs, exports, logs or errors,
 *             and each token is sent only to its own provider host.
 */
'use strict';

/* ------------------------------------------------------------------ constants */

const TOKEN_KEY = 'citefinder:tokens';
const SETTINGS_KEY = 'citefinder:settings';
const TIMEOUT_MS = 10000;
const WEAK_THRESHOLD = 0.3;

const PROVIDERS = [
  { id: 'github', label: 'GitHub', token: 'optional', always: true,
    hint: 'Fine-grained token with public read-only access. Raises the limit of 60 requests per hour.' },
  { id: 'ads', label: 'ADS (Astrophysics Data System)', token: 'required',
    hint: 'Free. Get it at ui.adsabs.harvard.edu, under Account, Settings, API Token.' },
  { id: 'datacite', label: 'DataCite (includes Zenodo DOIs)', token: 'none' },
  { id: 'doi', label: 'doi.org (resolves DOIs listed in the repo)', token: 'none' },
  { id: 'crossref', label: 'Crossref', token: 'none' },
  { id: 'semanticscholar', label: 'Semantic Scholar', token: 'optional', defaultOff: true,
    hint: 'Works without a key at a low shared rate limit.' },
];

const SIGNAL_TEXT = {
  DECLARED_FILE: 'Repo has its own CITATION.cff',
  DECLARED_DOI: 'DOI is listed in the repo',
  DECLARED_BIBCODE: 'ADS link is in the repo',
  REPO_URL_IN_METADATA: 'Record links to this repo',
  REPO_URL_MENTIONED: 'Mentions this repo URL',
  TITLE_MATCH: 'Title matches repo name',
  TITLE_SIMILAR: 'Title contains repo name',
  AUTHOR_OVERLAP: 'Authors match',
  RELEASE_MATCH: 'Version matches a release',
};

const KIND_TEXT = {
  software: 'Software', dataset: 'Dataset', article: 'Article', 'conference-paper': 'Conference paper',
  report: 'Report', book: 'Book', generic: 'Other', declared: 'Repo file', repo: 'Repo metadata',
};

/* ------------------------------------------------------------------ small utils */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v) => (Array.isArray(v) ? v[0] : v) == null ? '' : String(Array.isArray(v) ? v[0] : v).trim();
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normText = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

class CFError extends Error {
  constructor(code, provider, message) { super(message); this.code = code; this.provider = provider; }
}

function normOrcid(v) {
  const m = String(v || '').match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
  return m ? 'https://orcid.org/' + m[1].toUpperCase() : '';
}

function normDoi(v) {
  let d = String(v || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  d = d.replace(/[.,;:)\]]+$/, '').replace(/\.(svg|png)$/i, '').replace(/[.,;:)\]]+$/, '');
  return /^10\.\d{4,9}\//.test(d) ? d : '';
}

function parseRepoInput(input) {
  const s = String(input || '').trim().replace(/\.git$/i, '');
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (!m) m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

// AIDEV-NOTE: matches github.com/owner/repo but not github.com/owner/repo-helpers or .../repo.js
function repoUrlRegex(owner, name) {
  return new RegExp('github\\.com/' + escRe(owner) + '/' + escRe(name) + '(?:\\.git)?(?![\\w-]|\\.[\\w-])', 'i');
}

function splitName(full) {
  const s = String(full || '').trim();
  if (!s) return {};
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    return { family: family.trim(), given: rest.join(',').trim() || undefined };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { family: parts[0] };
  return { family: parts.pop(), given: parts.join(' ') };
}

function extractDois(text) {
  const out = [];
  const re = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/g;
  let m;
  while ((m = re.exec(String(text || '')))) { const d = normDoi(m[1]); if (d) out.push(d.toLowerCase()); }
  return uniq(out);
}

function extractBibcodes(text) {
  const out = [];
  const re = /adsabs\.harvard\.edu\/(?:#)?abs\/([^\s/)"'>\]]+)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    try { const b = decodeURIComponent(m[1]); if (b.length === 19) out.push(b); } catch { /* bad escape */ }
  }
  return uniq(out);
}

/* ------------------------------------------------------------------ storage (tab-scoped tokens) */

const store = {
  tokens() {
    try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || '{}') || {}; } catch { return {}; }
  },
  setToken(id, value) {
    const t = store.tokens();
    if (value) t[id] = value; else delete t[id];
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* storage unavailable */ }
  },
  forgetTokens() { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
  settings() {
    const defaults = { mailto: '', doiKind: 'concept', enabled: {} };
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}) }; } catch { return defaults; }
  },
  saveSettings(s) {
    // AIDEV-NOTE: non-secret settings only. Never add tokens here.
    const clean = { mailto: s.mailto || '', doiKind: s.doiKind, enabled: s.enabled || {} };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  },
};

function isEnabled(p, settings) {
  if (p.always) return true;
  const v = settings.enabled[p.id];
  return v === undefined ? !p.defaultOff : !!v;
}

/* ------------------------------------------------------------------ http */

async function http(provider, url, { headers = {}, as = 'json', timeout = TIMEOUT_MS } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(url, { headers, signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        if (attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
        throw new CFError('NetworkError', provider, 'timed out');
      }
      throw new CFError('CorsBlockedError', provider, 'blocked or unreachable from the browser');
    }
    clearTimeout(timer);
    if (res.status === 404) return null;
    if (res.status === 401) throw new CFError('AuthError', provider, 'token rejected');
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
        const when = reset ? new Date(reset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'later';
        throw new CFError('RateLimitError', provider, `rate limit reached, resets at ${when}`);
      }
      throw new CFError('AuthError', provider, 'access denied');
    }
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('retry-after') || '0', 10);
      if (attempt === 0 && ra <= 10) { await sleep((ra || 2) * 1000); continue; }
      throw new CFError('RateLimitError', provider, 'rate limit reached');
    }
    if (res.status >= 500) {
      if (attempt < 2) { await sleep(600 * 2 ** attempt); continue; }
      throw new CFError('NetworkError', provider, `service error (${res.status})`);
    }
    if (!res.ok) throw new CFError('ProviderError', provider, `request failed (${res.status})`);
    return as === 'text' ? res.text() : res.json();
  }
  throw new CFError('NetworkError', provider, 'gave up after retries');
}

/* ------------------------------------------------------------------ GitHub repo metadata */

async function fetchRepo(owner, name, token) {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const repo = await http('github', `https://api.github.com/repos/${owner}/${name}`, { headers: h });
  if (!repo) throw new CFError('ConfigError', 'github', `Repository ${owner}/${name} not found. Check the spelling, or add a GitHub token if it is private.`);
  const [o, n] = repo.full_name.split('/');
  const base = `https://api.github.com/repos/${o}/${n}`;
  const raw = { ...h, Accept: 'application/vnd.github.raw+json' };
  const soft = (p) => p.catch((e) => { if (e.code === 'RateLimitError') throw e; return null; });

  const [release, contents, contribs, readme] = await Promise.all([
    soft(http('github', base + '/releases/latest', { headers: h })),
    soft(http('github', base + '/contents', { headers: h })),
    soft(http('github', base + '/contributors?per_page=10', { headers: h })),
    soft(http('github', base + '/readme', { headers: raw, as: 'text' })),
  ]);

  const files = Array.isArray(contents) ? contents : [];
  const find = (fname) => files.find((f) => f.type === 'file' && f.name.toLowerCase() === fname);
  const getFile = (f) => (f ? soft(http('github', base + '/contents/' + encodeURIComponent(f.path), { headers: raw, as: 'text' })) : Promise.resolve(null));
  const [cffText, codemetaText, zenodoText] = await Promise.all([find('citation.cff'), find('codemeta.json'), find('.zenodo.json')].map(getFile));

  const humans = (Array.isArray(contribs) ? contribs : []).filter((c) => c.type !== 'Bot' && !/\[bot\]$/.test(c.login));
  const named = await Promise.all(humans.slice(0, 3).map((c) =>
    soft(http('github', 'https://api.github.com/users/' + encodeURIComponent(c.login), { headers: h })).then((u) => ({ login: c.login, name: u && u.name ? u.name : '' }))));
  const contributors = named.concat(humans.slice(3).map((c) => ({ login: c.login, name: '' })));

  let codemeta = null, zenodo = null;
  try { codemeta = codemetaText ? JSON.parse(codemetaText) : null; } catch { /* invalid json */ }
  try { zenodo = zenodoText ? JSON.parse(zenodoText) : null; } catch { /* invalid json */ }

  const declaredAuthors = authorsFromCodemeta(codemeta).concat(authorsFromZenodoJson(zenodo));
  const declaredText = [readme, repo.description, repo.homepage, cffText, codemetaText, zenodoText].join('\n');

  return {
    owner: o, name: n, url: repo.html_url, description: repo.description || '', homepage: repo.homepage || '',
    license: repo.license && repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : '',
    created: repo.created_at,
    release: release ? { tag: release.tag_name, date: (release.published_at || '').slice(0, 10) } : null,
    contributors,
    declared: {
      cff: cffText || '', codemeta, zenodo,
      dois: extractDois(declaredText),
      bibcodes: extractBibcodes(declaredText),
      authors: dedupeAuthors(declaredAuthors),
      name: (codemeta && codemeta.name) || (zenodo && zenodo.title) || '',
    },
  };
}

function authorsFromCodemeta(cm) {
  if (!cm || !cm.author) return [];
  const list = Array.isArray(cm.author) ? cm.author : [cm.author];
  return list.map((a) => {
    if (!a || typeof a !== 'object') return null;
    if (a['@type'] === 'Organization') return { name: str(a.name) };
    const out = { family: str(a.familyName), given: str(a.givenName), orcid: normOrcid(a['@id'] || a.identifier) };
    if (!out.family && a.name) Object.assign(out, splitName(a.name));
    return out.family || out.name ? out : null;
  }).filter(Boolean);
}

function authorsFromZenodoJson(z) {
  if (!z || !Array.isArray(z.creators)) return [];
  return z.creators.map((c) => ({ ...splitName(c.name), orcid: normOrcid(c.orcid) })).filter((a) => a.family);
}

function dedupeAuthors(list) {
  const seen = new Set();
  return list.filter((a) => {
    const k = normText((a.family || a.name || '') + ' ' + (a.given || '').charAt(0));
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/* ------------------------------------------------------------------ providers */

function cslKind(t) {
  return ({ 'article-journal': 'article', article: 'article', 'paper-conference': 'conference-paper', software: 'software',
    dataset: 'dataset', report: 'report', book: 'book', 'posted-content': 'article', 'journal-article': 'article',
    'proceedings-article': 'conference-paper' })[t] || 'generic';
}

function fromCsl(csl, provider) {
  const dp = csl.issued && csl.issued['date-parts'] && csl.issued['date-parts'][0];
  const page = str(csl.page).split(/[-\u2013]/);
  return {
    provider, kind: cslKind(csl.type), title: str(csl.title), doi: normDoi(csl.DOI),
    authors: (csl.author || []).map((a) => (a.family ? { family: a.family, given: a.given, orcid: normOrcid(a.ORCID) } : { name: a.literal || a.name })).filter((a) => a.family || a.name),
    year: dp ? Number(dp[0]) : undefined,
    date: dp && dp.length === 3 ? `${dp[0]}-${String(dp[1]).padStart(2, '0')}-${String(dp[2]).padStart(2, '0')}` : '',
    version: str(csl.version), url: str(csl.URL), journal: str(csl['container-title']),
    volume: str(csl.volume), issue: str(csl.issue), start: page[0] || '', end: page[1] || '',
    raw: csl,
  };
}

const providerImpl = {
  // AIDEV-QUESTION: ADS CORS from github.io is unverified (Gate-0). A CorsBlockedError here surfaces as a badge, not a failure.
  async ads(repo, ctx) {
    const h = { Authorization: 'Bearer ' + ctx.tokens.ads };
    const fl = 'bibcode,title,author,orcid_pub,year,doi,doctype,pub,volume,issue,page,abstract,identifier,citation_count,date';
    const queries = [];
    const ids = [];
    if (repo.declared.bibcodes.length) ids.push('bibcode:(' + repo.declared.bibcodes.map((b) => `"${b}"`).join(' OR ') + ')');
    if (repo.declared.dois.length) ids.push('doi:(' + repo.declared.dois.slice(0, 10).map((d) => `"${d}"`).join(' OR ') + ')');
    if (ids.length) queries.push(ids.join(' OR '));
    queries.push(`abs:"github.com/${repo.owner}/${repo.name}"`);
    queries.push(`doctype:software title:"${repo.name}"`);
    const results = await Promise.all(queries.map((q) =>
      http('ads', `https://api.adsabs.harvard.edu/v1/search/query?q=${encodeURIComponent(q)}&fl=${fl}&rows=10`, { headers: h })));
    const docs = results.flatMap((r) => (r && r.response && r.response.docs) || []);
    const kindMap = { article: 'article', eprint: 'article', software: 'software', inproceedings: 'conference-paper',
      abstract: 'conference-paper', techreport: 'report', book: 'book', inbook: 'book', proceedings: 'conference-paper' };
    return docs.map((d) => {
      const orcids = d.orcid_pub || [];
      const page = str(d.page).split(/[-\u2013]/);
      return {
        provider: 'ads', kind: kindMap[d.doctype] || 'generic', title: str(d.title), bibcode: d.bibcode,
        doi: normDoi(str(d.doi)),
        // AIDEV-NOTE: ADS writes people as "Last, First"; no comma means a collaboration or organization.
        authors: (d.author || []).map((a, i) => (a.includes(',') ? { ...splitName(a), orcid: normOrcid(orcids[i]) } : { name: a })),
        year: Number(d.year) || undefined, journal: str(d.pub), volume: str(d.volume), issue: str(d.issue),
        start: page[0] || '', end: page[1] || '', citations: d.citation_count,
        url: `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(d.bibcode)}`,
        raw: d,
      };
    });
  },

  // AIDEV-NOTE: Zenodo DOIs are registered with DataCite, so DataCite covers Zenodo without a second provider.
  async datacite(repo) {
    const queries = [
      `"github.com/${repo.owner}/${repo.name}"`,
      `titles.title:"${repo.name}" AND types.resourceTypeGeneral:Software`,
    ];
    const results = await Promise.all(queries.map((q) =>
      http('datacite', `https://api.datacite.org/dois?query=${encodeURIComponent(q)}&page%5Bsize%5D=25`)));
    const recs = results.flatMap((r) => (r && r.data) || []).map((r) => r.attributes);
    const kindMap = { Software: 'software', Dataset: 'dataset', JournalArticle: 'article', Preprint: 'article',
      ConferencePaper: 'conference-paper', Report: 'report', Book: 'book' };
    const cands = recs.map((a) => {
      const rel = a.relatedIdentifiers || [];
      const parent = rel.find((r) => r.relationType === 'IsVersionOf' && r.relatedIdentifierType === 'DOI');
      const isConcept = rel.some((r) => r.relationType === 'HasVersion');
      const issued = (a.dates || []).find((d) => d.dateType === 'Issued');
      return {
        provider: 'datacite', kind: kindMap[a.types && a.types.resourceTypeGeneral] || 'generic',
        title: str(a.titles && a.titles[0] && a.titles[0].title), doi: normDoi(a.doi),
        conceptDoi: parent ? normDoi(parent.relatedIdentifier) : (isConcept ? normDoi(a.doi) : ''),
        authors: (a.creators || []).map((c) => {
          const orcid = normOrcid(((c.nameIdentifiers || []).find((n) => /orcid/i.test(n.nameIdentifierScheme || '')) || {}).nameIdentifier);
          if (c.nameType === 'Organizational' || (!c.familyName && !String(c.name || '').includes(','))) return { name: c.name, orcid };
          return c.familyName ? { family: c.familyName, given: c.givenName, orcid } : { ...splitName(c.name), orcid };
        }),
        year: Number(a.publicationYear) || undefined, date: issued ? String(issued.date).slice(0, 10) : '',
        version: str(a.version), url: str(a.url), journal: str(a.publisher && (a.publisher.name || a.publisher)),
        structured: true, raw: a,
      };
    });
    return collapseVersions(cands);
  },

  async doi(repo) {
    const dois = repo.declared.dois.slice(0, 5);
    const out = await Promise.all(dois.map((d) =>
      http('doi', 'https://doi.org/' + encodeURI(d), { headers: { Accept: 'application/vnd.citationstyles.csl+json' } })
        .then((csl) => (csl ? { ...fromCsl(csl, 'doi'), structured: true } : null))
        .catch((e) => { if (e.code === 'CorsBlockedError' || e.code === 'RateLimitError') throw e; return null; })));
    return out.filter(Boolean);
  },

  async crossref(repo, ctx) {
    const terms = [repo.declared.name || repo.name, repo.description].filter(Boolean).join(' ').slice(0, 200);
    const mail = ctx.settings.mailto ? '&mailto=' + encodeURIComponent(ctx.settings.mailto) : '';
    const r = await http('crossref', `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(terms)}&rows=5${mail}`);
    return ((r && r.message && r.message.items) || []).map((it) => fromCsl({
      ...it, title: str(it.title), 'container-title': str(it['container-title']), DOI: it.DOI, URL: it.URL,
    }, 'crossref'));
  },

  async semanticscholar(repo, ctx) {
    const h = ctx.tokens.semanticscholar ? { 'x-api-key': ctx.tokens.semanticscholar } : {};
    const q = encodeURIComponent(`${repo.declared.name || repo.name} ${repo.description}`.slice(0, 200));
    const r = await http('semanticscholar', `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=5&fields=title,authors,year,externalIds,venue,url,abstract`, { headers: h });
    return ((r && r.data) || []).map((p) => ({
      provider: 'semanticscholar', kind: 'article', title: str(p.title), doi: normDoi(p.externalIds && p.externalIds.DOI),
      authors: (p.authors || []).map((a) => splitName(a.name)), year: p.year || undefined, journal: str(p.venue),
      url: str(p.url), raw: p,
    }));
  },
};

// Group DataCite version records under their concept DOI; keep the newest version as representative.
function collapseVersions(cands) {
  const groups = new Map();
  for (const c of cands) {
    const key = (c.conceptDoi || c.doi || c.title).toLowerCase();
    const g = groups.get(key);
    if (!g) { groups.set(key, { ...c, allDois: uniq([c.doi, c.conceptDoi]), versions: 1, raw: [c.raw] }); continue; }
    g.allDois = uniq(g.allDois.concat([c.doi, c.conceptDoi]));
    g.versions += 1;
    g.raw.push(c.raw);
    const isNewer = (c.date || String(c.year || '')) > (g.date || String(g.year || '')) && c.doi !== g.conceptDoi;
    const gIsConceptOnly = g.doi === g.conceptDoi;
    if (isNewer || gIsConceptOnly) Object.assign(g, { title: c.title, doi: c.doi, version: c.version, date: c.date, year: c.year, authors: c.authors.length ? c.authors : g.authors, url: c.url });
    if (!g.conceptDoi && c.conceptDoi) g.conceptDoi = c.conceptDoi;
  }
  return [...groups.values()];
}

/* ------------------------------------------------------------------ merge + score */

function mergeCandidates(list) {
  const byKey = new Map();
  for (const c of list) {
    const key = (c.conceptDoi || c.doi || (c.bibcode ? 'bib:' + c.bibcode : '') || c.provider + ':' + normText(c.title)).toLowerCase();
    const prev = byKey.get(key);
    const raws = Array.isArray(c.raw) ? c.raw : [c.raw];
    if (!prev) {
      byKey.set(key, { ...c, id: key, providers: [c.provider], raws: raws.map((r) => ({ provider: c.provider, structured: !!c.structured, r })), allDois: uniq([...(c.allDois || []), c.doi, c.conceptDoi].map((d) => d && d.toLowerCase())) });
      continue;
    }
    prev.providers = uniq(prev.providers.concat(c.provider));
    prev.raws.push(...raws.map((r) => ({ provider: c.provider, structured: !!c.structured, r })));
    prev.allDois = uniq(prev.allDois.concat([...(c.allDois || []), c.doi, c.conceptDoi].map((d) => d && d.toLowerCase())));
    for (const f of ['doi', 'conceptDoi', 'bibcode', 'version', 'date', 'year', 'journal', 'volume', 'issue', 'start', 'end', 'url', 'citations']) {
      if (!prev[f] && c[f]) prev[f] = c[f];
    }
    const orc = (a) => a.filter((x) => x.orcid).length;
    if (orc(c.authors) > orc(prev.authors) || (!prev.authors.length && c.authors.length)) prev.authors = c.authors;
    if (prev.kind === 'generic' && c.kind !== 'generic') prev.kind = c.kind;
  }
  return [...byKey.values()];
}

function scoreCandidate(c, repo) {
  const signals = [];
  const add = (code, weight, detail) => signals.push({ code, weight, detail: detail || SIGNAL_TEXT[code] });
  const declaredDois = repo.declared.dois;
  if (c.allDois && c.allDois.some((d) => declaredDois.includes(d))) add('DECLARED_DOI', 0.6);
  if (c.bibcode && repo.declared.bibcodes.includes(c.bibcode)) add('DECLARED_BIBCODE', 0.6);

  const re = repoUrlRegex(repo.owner, repo.name);
  const hitStructured = c.raws.some((x) => x.structured && re.test(JSON.stringify(x.r)));
  const hitText = !hitStructured && c.raws.some((x) => re.test(JSON.stringify(x.r)));
  if (hitStructured) add('REPO_URL_IN_METADATA', 0.6);
  else if (hitText) add('REPO_URL_MENTIONED', 0.35);

  const names = uniq([normText(repo.name), normText(repo.declared.name)]);
  const t = normText(c.title);
  const head = normText(String(c.title || '').split(/:|\s[-\u2013\u2014]\s/)[0]);
  const zen = normText(String(c.title || '').split(':')[0]) === normText(repo.owner + ' ' + repo.name);
  if (zen || names.some((n) => n && (t === n || head === n))) add('TITLE_MATCH', 0.2);
  else if (names.some((n) => n && (' ' + t + ' ').includes(' ' + n + ' '))) add('TITLE_SIMILAR', 0.1);

  const known = dedupeAuthors(repo.declared.authors.concat(repo.contributors.filter((x) => x.name).map((x) => splitName(x.name))));
  if (known.length && c.authors.length) {
    const fam = new Set(c.authors.map((a) => normText(a.family || a.name)));
    const matched = known.filter((k) => fam.has(normText(k.family || k.name))).length;
    if (matched) add('AUTHOR_OVERLAP', Math.round(0.15 * (matched / known.length) * 100) / 100, `${matched} of ${known.length} known authors match`);
  }

  if (repo.release && c.version && c.version.replace(/^v/i, '') === repo.release.tag.replace(/^v/i, '')) add('RELEASE_MATCH', 0.05);

  const total = signals.reduce((s, x) => s + x.weight, 0);
  return { candidate: c, score: Math.round(Math.min(1, total) * 100) / 100, total, signals };
}

function declaredCandidate(repo) {
  if (!repo.declared.cff) return null;
  const title = (repo.declared.cff.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || repo.name;
  const doi = normDoi((repo.declared.cff.match(/^doi:\s*["']?([^"'\s#]+)/m) || [])[1]);
  return {
    candidate: { id: 'declared', kind: 'declared', providers: ['github'], title, doi, authors: [], raws: [] },
    score: 1, signals: [{ code: 'DECLARED_FILE', weight: 1, detail: SIGNAL_TEXT.DECLARED_FILE }],
  };
}

function repoCandidate(repo) {
  return {
    candidate: { id: 'repo', kind: 'repo', providers: ['github'], title: repo.declared.name || repo.name, authors: repo.declared.authors, raws: [] },
    score: null, signals: [],
  };
}

/* ------------------------------------------------------------------ draft + CFF */

function authorsForRepo(repo) {
  if (repo.declared.authors.length) return repo.declared.authors.map((a) => ({ ...a }));
  return repo.contributors.slice(0, 5).map((c) => (c.name ? splitName(c.name) : { family: c.login, unverified: true }));
}

// Zenodo GitHub-release records are titled "owner/repo: v1.2.3"; that is not a good citation title.
const zenodoTitle = (t) => /^[\w.-]+\/[\w.-]+:\s*v?\d/i.test(String(t || ''));

function draftFrom(scored, repo, settings) {
  const c = scored.candidate;
  const base = {
    citeType: 'software', kindTop: 'software', title: repo.declared.name || repo.name,
    version: repo.release ? repo.release.tag.replace(/^v(?=\d)/, '') : '', dateReleased: repo.release ? repo.release.date : '',
    doi: '', url: repo.homepage || '', repoCode: repo.url, license: repo.license,
    authors: authorsForRepo(repo), pref: null,
  };
  if (c.kind === 'repo') return base;
  if (c.kind === 'software' || c.kind === 'dataset') {
    const doi = settings.doiKind === 'concept' && c.conceptDoi ? c.conceptDoi : c.doi;
    return {
      ...base, kindTop: c.kind, title: zenodoTitle(c.title) ? base.title : c.title || base.title,
      version: settings.doiKind === 'concept' && c.conceptDoi ? base.version || c.version || '' : c.version || base.version,
      dateReleased: c.date || base.dateReleased, doi: doi || '',
      authors: c.authors.length ? c.authors.map((a) => ({ ...a })) : base.authors,
    };
  }
  return {
    ...base, citeType: 'preferred',
    authors: repo.declared.authors.length ? base.authors : c.authors.map((a) => ({ ...a })),
    pref: {
      type: c.kind === 'generic' ? 'generic' : c.kind, title: c.title, authors: c.authors.map((a) => ({ ...a })),
      doi: c.doi || '', journal: c.journal || '', year: c.year ? String(c.year) : '', volume: c.volume || '',
      issue: c.issue || '', start: c.start || '', end: c.end || '', url: c.doi ? '' : c.url || '',
    },
  };
}

function yq(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"'; }

function emitAuthors(list, pad) {
  const out = [];
  for (const a of list) {
    const lines = [];
    if (a.family) {
      lines.push(`family-names: ${yq(a.family)}`);
      if (a.given) lines.push(`given-names: ${yq(a.given)}`);
    } else if (a.name) lines.push(`name: ${yq(a.name)}`);
    else continue;
    if (a.orcid) lines.push(`orcid: ${yq(a.orcid)}`);
    out.push(pad + '- ' + lines[0], ...lines.slice(1).map((l) => pad + '  ' + l));
  }
  return out;
}

const isNum = (v) => /^\d+$/.test(String(v || ''));

function buildCff(d) {
  const L = ['cff-version: 1.2.0'];
  L.push('message: ' + yq(d.kindTop === 'dataset' ? 'If you use this dataset, please cite it as below.' : 'If you use this software, please cite it as below.'));
  L.push('type: ' + (d.kindTop === 'dataset' ? 'dataset' : 'software'));
  L.push('title: ' + yq(d.title || ''));
  L.push('authors:', ...emitAuthors(d.authors, '  '));
  if (d.version) L.push('version: ' + yq(d.version));
  if (d.doi) L.push('doi: ' + yq(d.doi));
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.dateReleased || '')) L.push('date-released: ' + d.dateReleased);
  if (d.url) L.push('url: ' + yq(d.url));
  if (d.repoCode) L.push('repository-code: ' + yq(d.repoCode));
  if (d.license) L.push('license: ' + d.license);
  if (d.citeType === 'preferred' && d.pref) {
    const p = d.pref;
    const typeMap = { dataset: 'data' };
    L.push('preferred-citation:');
    L.push('  type: ' + (typeMap[p.type] || p.type || 'article'));
    L.push('  title: ' + yq(p.title || ''));
    L.push('  authors:', ...emitAuthors(p.authors, '    '));
    if (p.doi) L.push('  doi: ' + yq(p.doi));
    if (p.journal) L.push('  journal: ' + yq(p.journal));
    if (isNum(p.year)) L.push('  year: ' + p.year);
    if (p.volume) L.push('  volume: ' + (isNum(p.volume) ? p.volume : yq(p.volume)));
    if (p.issue) L.push('  issue: ' + (isNum(p.issue) ? p.issue : yq(p.issue)));
    if (p.start) L.push('  start: ' + (isNum(p.start) ? p.start : yq(p.start)));
    if (p.end) L.push('  end: ' + (isNum(p.end) ? p.end : yq(p.end)));
    if (p.url) L.push('  url: ' + yq(p.url));
  }
  return L.join('\n') + '\n';
}

const DOI_RE = /^10\.\d{4,9}(\.\d+)?\/[A-Za-z0-9:/_;\-.()[\]\\]+$/;
const ORCID_RE = /^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

// AIDEV-NOTE: subset of the CFF 1.2.0 schema rules that matter in practice; not a full JSON-schema validation.
function validateDraft(d) {
  const errs = [], warns = [];
  const checkAuthors = (list, where) => {
    const real = list.filter((a) => a.family || a.name);
    if (!real.length) errs.push(`${where}: add at least one author`);
    list.forEach((a, i) => {
      if (a.orcid && !ORCID_RE.test(a.orcid)) errs.push(`${where}: author ${i + 1} has an invalid ORCID`);
      if (a.unverified) warns.push(`${where}: author ${i + 1} is a GitHub username; replace with a real name`);
    });
    if (real.length && !real.some((a) => a.orcid)) warns.push(`${where}: no ORCIDs (optional, recommended)`);
  };
  if (!String(d.title || '').trim()) errs.push('Title is required');
  checkAuthors(d.authors, 'Authors');
  if (d.doi && !DOI_RE.test(d.doi)) errs.push('DOI format is invalid');
  if (d.dateReleased && !(/^\d{4}-\d{2}-\d{2}$/.test(d.dateReleased) && !isNaN(Date.parse(d.dateReleased)))) errs.push('Release date must be YYYY-MM-DD');
  for (const [k, v] of [['URL', d.url], ['Repository URL', d.repoCode]]) if (v && !/^https?:\/\/\S+$/.test(v)) errs.push(`${k} must start with http:// or https://`);
  if (!d.version) warns.push('No version set');
  if (d.citeType === 'preferred') {
    const p = d.pref || {};
    if (!String(p.title || '').trim()) errs.push('Paper title is required');
    checkAuthors(p.authors || [], 'Paper authors');
    if (p.doi && !DOI_RE.test(p.doi)) errs.push('Paper DOI format is invalid');
    if (p.year && !/^\d{4}$/.test(p.year)) errs.push('Paper year must be four digits');
  }
  return { errs, warns };
}

/* ------------------------------------------------------------------ APA + BibTeX (approximate GitHub output) */

function apaName(a) {
  if (!a.family) return a.name || '';
  const ini = String(a.given || '').split(/[\s]+/).filter(Boolean)
    .map((p) => p.split('-').map((q) => (q ? q[0].toUpperCase() + '.' : '')).join('-')).join(' ');
  return ini ? `${a.family}, ${ini}` : a.family;
}
function apaAuthors(list) {
  const n = list.filter((a) => a.family || a.name).map(apaName);
  if (n.length <= 1) return n[0] || '';
  if (n.length <= 20) return n.slice(0, -1).join(', ') + ', & ' + n[n.length - 1];
  return n.slice(0, 19).join(', ') + ', . . . ' + n[n.length - 1];
}
const endDot = (s) => (/[.?!]$/.test(s) ? s : s + '.');

function renderApa(d) {
  if (d.citeType === 'preferred' && d.pref) {
    const p = d.pref;
    let s = `${endDot(apaAuthors(p.authors))} (${p.year || 'n.d.'}). ${endDot(p.title)}`;
    if (p.journal) {
      s += ` ${p.journal}`;
      if (p.volume) s += `, ${p.volume}${p.issue ? `(${p.issue})` : ''}`;
      if (p.start) s += `, ${p.start}${p.end ? '\u2013' + p.end : ''}`;
      s += '.';
    }
    if (p.doi) s += ` https://doi.org/${p.doi}`; else if (p.url) s += ` ${p.url}`;
    return s;
  }
  const year = (d.dateReleased || '').slice(0, 4) || 'n.d.';
  const tag = d.kindTop === 'dataset' ? '[Data set]' : '[Computer software]';
  let s = `${endDot(apaAuthors(d.authors))} (${year}). ${d.title}${d.version ? ` (Version ${d.version})` : ''} ${tag}.`;
  if (d.doi) s += ` https://doi.org/${d.doi}`; else if (d.url || d.repoCode) s += ` ${d.url || d.repoCode}`;
  return s;
}

function bibEsc(s) { return String(s).replace(/([&%$#_])/g, '\\$1'); }
function bibAuthors(list) {
  return list.filter((a) => a.family || a.name).map((a) => (a.family ? `${bibEsc(a.family)}${a.given ? ', ' + bibEsc(a.given) : ''}` : `{${bibEsc(a.name)}}`)).join(' and ');
}
function bibKey(authors, title, year) {
  const first = authors.find((a) => a.family || a.name) || {};
  const ascii = (s) => String(s || '').normalize('NFKD').replace(/[^\w\s]/g, '').trim();
  const words = ascii(title).split(/\s+/).filter(Boolean).slice(0, 3);
  return [ascii(first.family || first.name).replace(/\s+/g, '_') || 'Anonymous', ...words, year || ''].filter(Boolean).join('_');
}
function renderBibtex(d) {
  const f = [];
  const push = (k, v) => { if (v !== '' && v != null) f.push(`  ${k} = {${v}}`); };
  if (d.citeType === 'preferred' && d.pref) {
    const p = d.pref;
    const type = ({ article: 'article', 'conference-paper': 'inproceedings', report: 'techreport', book: 'book', dataset: 'misc', software: 'software' })[p.type] || 'misc';
    push('author', bibAuthors(p.authors)); push('doi', p.doi);
    push(type === 'inproceedings' ? 'booktitle' : 'journal', p.journal && bibEsc(p.journal));
    push('number', p.issue); push('pages', p.start ? p.start + (p.end ? '--' + p.end : '') : '');
    push('title', `{${bibEsc(p.title)}}`); push('url', p.url); push('volume', p.volume); push('year', p.year);
    return `@${type}{${bibKey(p.authors, p.title, p.year)},\n${f.join(',\n')}\n}`;
  }
  const year = (d.dateReleased || '').slice(0, 4);
  const month = d.dateReleased ? String(Number(d.dateReleased.slice(5, 7))) : '';
  push('author', bibAuthors(d.authors)); push('doi', d.doi); push('license', d.license); push('month', month);
  push('title', `{${bibEsc(d.title)}}`); push('url', d.url || d.repoCode); push('version', d.version); push('year', year);
  return `@${d.kindTop === 'dataset' ? 'misc' : 'software'}{${bibKey(d.authors, d.title, year)},\n${f.join(',\n')}\n}`;
}

/* ------------------------------------------------------------------ export for tests (Node) */

if (typeof module !== 'undefined') {
  module.exports = { parseRepoInput, normDoi, normOrcid, extractDois, extractBibcodes, repoUrlRegex, splitName,
    collapseVersions, mergeCandidates, scoreCandidate, draftFrom, buildCff, validateDraft, renderApa, renderBibtex,
    fromCsl, providerImpl, fetchRepo, store, http };
}

/* ------------------------------------------------------------------ UI */

if (typeof document !== 'undefined') {
  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const state = { settings: store.settings(), repo: null, scored: [], showWeak: false, selected: null, draft: null, asIs: false, tab: 'cff' };

  /* -- settings panel -- */
  function renderSettings() {
    const tokens = store.tokens();
    const box = $('provider-settings');
    box.replaceChildren();
    for (const p of PROVIDERS) {
      const enabledId = 'en-' + p.id, tokId = 'tok-' + p.id;
      const head = h('div', { class: 'prov-head' },
        p.always ? null : h('input', { type: 'checkbox', id: enabledId, checked: isEnabled(p, state.settings),
          onchange: (e) => { state.settings.enabled[p.id] = e.target.checked; store.saveSettings(state.settings); updateTokenSummary(); } }),
        h('label', { for: p.always ? tokId : enabledId, text: p.label }),
        h('span', { class: 'prov-req', text: p.token === 'required' ? 'token required' : p.token === 'optional' ? 'token optional' : 'no token' }),
        p.token !== 'none' && tokens[p.id] ? h('span', { class: 'prov-stored', text: 'token stored in this tab' }) : null);
      const parts = [head];
      if (p.token !== 'none') {
        const input = h('input', { type: 'password', id: tokId, autocomplete: 'off', spellcheck: 'false',
          placeholder: tokens[p.id] ? '••••••••  (stored)' : 'Paste token', 'aria-label': p.label + ' token' });
        const save = h('button', { type: 'button', text: 'Save', onclick: () => {
          const v = input.value.trim();
          if (v) { store.setToken(p.id, v); input.value = ''; renderSettings(); }
        } });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
        parts.push(h('div', { class: 'token-row' }, input, save));
      }
      if (p.hint) parts.push(h('p', { class: 'prov-hint', text: p.hint }));
      box.append(h('div', { class: 'prov' }, parts));
    }
    $('mailto').value = state.settings.mailto || '';
    $('doi-kind').value = state.settings.doiKind || 'concept';
    updateTokenSummary();
  }

  function updateTokenSummary() {
    const t = store.tokens();
    const missing = PROVIDERS.filter((p) => p.token === 'required' && isEnabled(p, state.settings) && !t[p.id]);
    $('token-summary').textContent = missing.length ? `(${missing.map((p) => p.id.toUpperCase()).join(', ')} token missing)` : '';
  }

  /* -- provider status badges -- */
  const statusEls = {};
  function setStatus(id, s, text) {
    let el = statusEls[id];
    if (!el) { el = statusEls[id] = h('li', { class: 'pstat' }); $('provider-status').append(el); }
    el.dataset.state = s;
    const label = (PROVIDERS.find((p) => p.id === id) || {}).label || id;
    el.textContent = `${label.split(' (')[0]}: ${text}`;
    el.title = text;
  }
  function clearStatus() { $('provider-status').replaceChildren(); for (const k of Object.keys(statusEls)) delete statusEls[k]; }

  /* -- search -- */
  async function runSearch(e) {
    if (e) e.preventDefault();
    const parsed = parseRepoInput($('repo').value);
    const err = $('repo-error');
    if (!parsed) { err.textContent = 'Enter a repository as owner/repo or a github.com URL.'; err.hidden = false; return; }
    err.hidden = true;
    const btn = $('search-btn');
    btn.disabled = true; btn.textContent = 'Searching';
    clearStatus();
    $('step-pick').hidden = true; $('step-confirm').hidden = true;
    resetPreview();
    const tokens = store.tokens();
    try {
      setStatus('github', 'running', 'reading repo');
      const repo = await fetchRepo(parsed.owner, parsed.name, tokens.github);
      state.repo = repo;
      setStatus('github', 'ok', 'repo read');
      try { history.replaceState(null, '', '?repo=' + encodeURIComponent(repo.owner + '/' + repo.name)); } catch { /* file:// */ }

      const ctx = { tokens, settings: state.settings };
      const active = PROVIDERS.filter((p) => p.id !== 'github' && isEnabled(p, state.settings));
      const results = await Promise.all(active.map(async (p) => {
        if (p.token === 'required' && !tokens[p.id]) { setStatus(p.id, 'skipped', 'add a token in Tokens and sources'); return []; }
        if (p.id === 'doi' && !repo.declared.dois.length) { setStatus(p.id, 'skipped', 'no DOIs listed in the repo'); return []; }
        setStatus(p.id, 'running', 'searching');
        try {
          const r = await providerImpl[p.id](repo, ctx);
          setStatus(p.id, 'ok', `${r.length} found`);
          return r;
        } catch (ex) {
          const msg = ex instanceof CFError ? ex.message : 'unexpected error';
          setStatus(p.id, ex.code === 'CorsBlockedError' ? 'skipped' : 'error', ex.code === 'CorsBlockedError' ? msg + '; try the terminal version' : msg);
          return [];
        }
      }));
      const merged = mergeCandidates(results.flat()).filter((c) => c.title);
      const scored = merged.map((c) => scoreCandidate(c, repo)).sort((a, b) => b.score - a.score || b.total - a.total || (b.candidate.citations || 0) - (a.candidate.citations || 0));
      const decl = declaredCandidate(repo);
      state.scored = [decl, ...scored, repoCandidate(repo)].filter(Boolean);
      state.showWeak = false;
      renderCandidates();
    } catch (ex) {
      const msg = ex instanceof CFError ? ex.message : 'Something went wrong reading the repository.';
      setStatus('github', 'error', msg);
      err.textContent = ex.code === 'ConfigError' ? msg : `GitHub: ${msg}`;
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Find citations';
    }
  }

  /* -- candidates -- */
  function shortAuthors(list) {
    const n = list.filter((a) => a.family || a.name).map((a) => a.family || a.name);
    if (!n.length) return '';
    return n.length > 3 ? `${n.slice(0, 3).join(', ')} et al. (${n.length})` : n.join(', ');
  }

  function renderCandidates(keep) {
    const list = $('candidates');
    list.replaceChildren();
    const strong = state.scored.filter((s) => s.score === null || s.score >= WEAK_THRESHOLD);
    const weak = state.scored.filter((s) => s.score !== null && s.score < WEAK_THRESHOLD);
    const shown = state.showWeak ? state.scored : strong;
    const real = strong.filter((s) => s.score !== null);
    $('pick-lede').textContent = real.length
      ? `${real.length} likely match${real.length === 1 ? '' : 'es'} for ${state.repo.owner}/${state.repo.name}. The score adds up the evidence listed under each one.`
      : `No strong match for ${state.repo.owner}/${state.repo.name}. You can build a citation from the repository itself.`;
    shown.forEach((s, i) => list.append(candidateItem(s, i)));
    const tw = $('toggle-weak');
    tw.hidden = !weak.length;
    tw.textContent = state.showWeak ? 'Hide weak matches' : `Show ${weak.length} weak match${weak.length === 1 ? '' : 'es'}`;
    $('step-pick').hidden = false;
    if (keep && shown.includes(state.selected)) { select(state.selected, true); return; }
    const first = shown.find((s) => s.score !== null) || shown[0];
    if (first) select(first);
  }

  function candidateItem(s) {
    const c = s.candidate;
    const checked = state.selected === s;
    const ids = [];
    if (c.doi) ids.push(h('code', { text: c.doi }));
    if (c.conceptDoi && c.conceptDoi !== c.doi) ids.push(' all versions ', h('code', { text: c.conceptDoi }));
    if (c.bibcode) ids.push(' ', h('code', { text: c.bibcode }));
    const meta = [KIND_TEXT[c.kind] || c.kind, c.year, c.version ? 'v' + c.version.replace(/^v/i, '') : '',
      c.versions > 1 ? `${c.versions} versions` : '', c.providers.join(', '), c.citations ? `${c.citations} citations` : ''].filter(Boolean).join(', ');
    let desc = '';
    if (c.kind === 'declared') desc = 'Use the repository\'s existing file as is.';
    if (c.kind === 'repo') desc = 'Build a software citation from the repository name, release and authors.';
    const radio = h('input', { type: 'radio', name: 'cand', checked, tabindex: '-1', 'aria-hidden': 'true' });
    const li = h('li', { class: 'cand', role: 'radio', tabindex: '0', 'aria-checked': String(checked),
      onclick: () => select(s), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s); } } },
      radio,
      h('div', {},
        h('div', { class: 'cand-title', text: c.title }),
        c.authors.length ? h('div', { class: 'cand-authors', text: shortAuthors(c.authors) }) : null,
        desc ? h('div', { class: 'cand-authors', text: desc }) : null,
        c.kind !== 'repo' && c.kind !== 'declared' ? h('div', { class: 'cand-meta' }, meta, ids.length ? h('br') : null, ...ids) : null,
        s.signals.length ? h('ul', { class: 'signals' }, s.signals.map((g) => h('li', { text: g.detail }))) : null),
      h('div', { class: 'score' }, s.score === null ? '' : s.score.toFixed(2), s.score === null ? null : h('small', { text: 'score' })));
    li._scored = s;
    return li;
  }

  function select(s, keepDraft) {
    const same = keepDraft && state.selected === s && (state.draft || state.asIs);
    state.selected = s;
    for (const li of $('candidates').children) {
      const on = li._scored === s;
      li.setAttribute('aria-checked', String(on));
      li.querySelector('input').checked = on;
    }
    if (!same) {
      state.asIs = s.candidate.kind === 'declared';
      state.draft = state.asIs ? null : draftFrom(s, state.repo, state.settings);
    }
    renderEditor();
    renderPreview();
  }

  /* -- editor -- */
  function field(label, value, onInput, opts = {}) {
    const id = 'f-' + Math.random().toString(36).slice(2, 8);
    return h('div', { class: 'field-row' + (opts.wide ? ' wide' : '') },
      h('label', { for: id, text: label }),
      h('input', { id, type: opts.type || 'text', value: value || '', placeholder: opts.placeholder || '', spellcheck: 'false',
        oninput: (e) => { onInput(e.target.value.trim()); renderPreview(); } }));
  }

  function authorsEditor(list, title) {
    const wrap = h('div', { class: 'authors' });
    const draw = () => {
      wrap.replaceChildren();
      list.forEach((a, i) => {
        const results = h('ul', { class: 'orcid-results' });
        const set = (k) => (v) => { a[k] = v; if (k !== 'orcid') delete a.unverified; renderPreview(); };
        const inp = (lab, k, ph) => h('label', {}, lab, h('input', { type: 'text', value: a[k] || '', placeholder: ph, spellcheck: 'false',
          oninput: (e) => set(k)(k === 'orcid' ? (normOrcid(e.target.value) || e.target.value.trim()) : e.target.value.trim()) }));
        const findBtn = h('button', { type: 'button', class: 'small', text: 'Find ORCID', onclick: () => findOrcid(a, results, draw) });
        wrap.append(h('div', { class: 'author' },
          a.name && !a.family ? inp('Organization', 'name', 'Name') : [inp('Family name', 'family', 'Family'), inp('Given names', 'given', 'Given')],
          inp('ORCID', 'orcid', '0000-0000-0000-0000'),
          h('div', { class: 'actions' },
            a.family ? findBtn : null,
            i > 0 ? h('button', { type: 'button', class: 'small', 'aria-label': `Move author ${i + 1} up`, text: '\u2191', onclick: () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); draw(); renderPreview(); } }) : null,
            h('button', { type: 'button', class: 'small', 'aria-label': `Remove author ${i + 1}`, text: 'Remove', onclick: () => { list.splice(i, 1); draw(); renderPreview(); } })),
          results));
      });
    };
    draw();
    return h('fieldset', {}, h('legend', { text: title }), wrap,
      h('div', { class: 'add-author' },
        h('button', { type: 'button', class: 'small', text: 'Add person', onclick: () => { list.push({ family: '', given: '' }); draw(); } }), ' ',
        h('button', { type: 'button', class: 'small', text: 'Add organization', onclick: () => { list.push({ name: '' }); draw(); } })));
  }

  async function findOrcid(a, box, redraw) {
    box.replaceChildren(h('li', { class: 'note', text: 'Searching ORCID' }));
    const qv = (v) => '"' + String(v).replace(/["\\]/g, '') + '"';
    const q = `family-name:${qv(a.family)}` + (a.given ? ` AND given-names:${qv(a.given.split(/\s+/)[0])}` : '');
    try {
      const r = await http('orcid', `https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(q)}&rows=5`, { headers: { Accept: 'application/json' } });
      const rows = (r && r['expanded-result']) || [];
      box.replaceChildren();
      if (!rows.length) { box.append(h('li', { class: 'note', text: 'No ORCID found for this name.' })); return; }
      for (const x of rows) {
        const inst = (x['institution-name'] || []).slice(0, 2).join('; ');
        box.append(h('li', {}, h('button', { type: 'button', onclick: () => { a.orcid = normOrcid(x['orcid-id']); redraw(); renderPreview(); } },
          `${x['given-names'] || ''} ${x['family-names'] || ''}`.trim(), h('br'), h('span', { class: 'muted', text: `${x['orcid-id']}${inst ? ', ' + inst : ''}` }))));
      }
    } catch (ex) {
      box.replaceChildren(h('li', { class: 'note', text: `ORCID: ${ex instanceof CFError ? ex.message : 'lookup failed'}` }));
    }
  }

  function renderEditor() {
    const ed = $('editor');
    ed.replaceChildren();
    $('step-confirm').hidden = false;
    if (state.asIs) {
      $('confirm-lede').textContent = 'You are exporting the repository\'s own CITATION.cff unchanged. To edit or rebuild it, pick another match.';
      return;
    }
    const d = state.draft;
    $('confirm-lede').textContent = 'Check names and identifiers. The preview updates as you type.';
    const typeChoice = h('div', { class: 'choice', role: 'radiogroup', 'aria-label': 'Cite as' },
      h('label', {}, h('input', { type: 'radio', name: 'citeType', checked: d.citeType === 'software', onchange: () => { d.citeType = 'software'; renderEditor(); renderPreview(); } }), d.kindTop === 'dataset' ? 'The dataset itself' : 'The software itself'),
      h('label', {}, h('input', { type: 'radio', name: 'citeType', checked: d.citeType === 'preferred', disabled: !d.pref,
        onchange: () => { d.citeType = 'preferred'; renderEditor(); renderPreview(); } }), 'A paper, with the software listed'));
    ed.append(h('fieldset', {}, h('legend', { text: 'Cite as' }), typeChoice,
      !d.pref ? h('p', { class: 'note', text: 'Pick a paper in step 2 to enable the paper option.' }) : null));

    ed.append(h('fieldset', {}, h('legend', { text: d.kindTop === 'dataset' ? 'Dataset' : 'Software' }),
      h('div', { class: 'editor-grid' },
        field('Title', d.title, (v) => { d.title = v; }, { wide: true }),
        field('Version', d.version, (v) => { d.version = v; }, { placeholder: '1.2.0' }),
        field('Release date', d.dateReleased, (v) => { d.dateReleased = v; }, { type: 'date' }),
        field('DOI', d.doi, (v) => { d.doi = normDoi(v) || v; }, { placeholder: '10.5281/zenodo.1234' }),
        field('License (SPDX)', d.license, (v) => { d.license = v; }, { placeholder: 'MIT' }),
        field('Repository URL', d.repoCode, (v) => { d.repoCode = v; }, { wide: true }),
        field('Homepage URL', d.url, (v) => { d.url = v; }, { wide: true }))));
    ed.append(authorsEditor(d.authors, 'Authors'));

    if (d.citeType === 'preferred' && d.pref) {
      const p = d.pref;
      ed.append(h('fieldset', {}, h('legend', { text: 'Paper' }),
        h('div', { class: 'editor-grid' },
          field('Title', p.title, (v) => { p.title = v; }, { wide: true }),
          field('Journal or venue', p.journal, (v) => { p.journal = v; }, { wide: true }),
          field('Year', p.year, (v) => { p.year = v; }, { placeholder: '2024' }),
          field('Volume', p.volume, (v) => { p.volume = v; }),
          field('Issue', p.issue, (v) => { p.issue = v; }),
          field('First page', p.start, (v) => { p.start = v; }),
          field('Last page', p.end, (v) => { p.end = v; }),
          field('DOI', p.doi, (v) => { p.doi = normDoi(v) || v; }))));
      ed.append(authorsEditor(p.authors, 'Paper authors'));
    }
  }

  /* -- preview + export -- */
  function resetPreview() {
    state.selected = null; state.draft = null; state.asIs = false;
    $('preview').textContent = '# Your CITATION.cff appears here.\n# Enter a repository to start.';
    $('checks').replaceChildren(); $('download').disabled = true; $('copy').disabled = true; $('preview-note').hidden = true;
  }

  function currentCff() { return state.asIs ? state.repo.declared.cff : buildCff(state.draft); }

  function renderPreview() {
    if (!state.selected) return;
    const checks = $('checks');
    checks.replaceChildren();
    let ok = true;
    if (state.asIs) {
      checks.append(h('li', { class: 'warn', text: 'Repository file, exported unchanged and not re-checked here' }));
      $('preview').textContent = state.tab === 'cff' ? state.repo.declared.cff : 'Preview of APA and BibTeX is available when citefinder builds the file. Pick another match to rebuild.';
    } else {
      const v = validateDraft(state.draft);
      ok = !v.errs.length;
      v.errs.forEach((m) => checks.append(h('li', { class: 'err', text: m })));
      v.warns.forEach((m) => checks.append(h('li', { class: 'warn', text: m })));
      if (ok) checks.append(h('li', { text: 'Required fields and formats look valid' }));
      const out = { cff: buildCff, apa: renderApa, bibtex: renderBibtex }[state.tab](state.draft);
      $('preview').textContent = out;
    }
    $('preview-note').hidden = state.tab === 'cff' || state.asIs;
    $('download').disabled = !ok;
    $('copy').disabled = false;
  }

  function setTab(tab) {
    state.tab = tab;
    for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    if (state.selected) renderPreview();
  }

  async function copyText(text, btn) {
    const orig = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch { btn.textContent = 'Copy failed'; }
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }

  function download() {
    const blob = new Blob([currentCff()], { type: 'text/yaml;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'CITATION.cff' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    const btn = $('download'); const orig = btn.textContent; btn.textContent = 'Downloaded';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }

  /* -- wiring -- */
  $('repo-form').addEventListener('submit', runSearch);
  $('toggle-weak').addEventListener('click', () => { state.showWeak = !state.showWeak; renderCandidates(true); });
  $('mailto').addEventListener('change', (e) => { state.settings.mailto = e.target.value.trim(); store.saveSettings(state.settings); });
  $('doi-kind').addEventListener('change', (e) => { state.settings.doiKind = e.target.value; store.saveSettings(state.settings); if (state.selected) select(state.selected); });
  $('forget-tokens').addEventListener('click', () => { store.forgetTokens(); renderSettings(); });
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => setTab(b.dataset.tab));
  $('download').addEventListener('click', download);
  $('copy').addEventListener('click', (e) => copyText(state.tab === 'cff' || state.asIs ? currentCff() : $('preview').textContent, e.currentTarget));
  $('copy-npx').addEventListener('click', (e) => copyText($('npx-cmd').textContent, e.currentTarget));

  renderSettings();
  const pre = new URLSearchParams(location.search).get('repo');
  if (pre && parseRepoInput(pre)) $('repo').value = pre;
  if (!store.tokens().ads && isEnabled(PROVIDERS[1], state.settings)) $('settings').open = true;
}
