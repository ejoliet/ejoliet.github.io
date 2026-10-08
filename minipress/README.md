# minipress

> Turn a Discourse forum into a Minitel-style front page: one static HTML file, no backend, data arrives by drag-and-drop or a bookmarklet.

Live: `https://ejoliet.github.io/minipress/` (later `https://minipress.626733.xyz`).
Status: **RDD spec, v1 not built.**

---

## Purpose

**Problem**: a Discourse forum is a wall of threads. There is no "what happened this week" page you can glance at, print, or share, and the forum's JSON API is blocked cross-origin so a static page cannot fetch it.

**Solution**: a single `index.html` that renders Discourse JSON as a teletext newspaper. The JSON comes from the user (drop a file) or from a bookmarklet that runs inside the forum tab, where same-origin fetch is allowed.

**Scope**: v1 = inputs 1 (drop `latest.json` / `t/<id>.json` / `issue.json`) and 3 (bookmarklet). v2 = Cloudflare Worker proxy so `#https://forum` works live.

> 💡 The forum never sees the page. Nothing is republished in a repo. Works offline once loaded.

---

## Architecture

```
v1
  Browser tab on forum ──bookmarklet──▶ fetch /latest.json, /t/<id>.json (same-origin)
                                        build issue.json
                                        window.open(minipress) + postMessage ─┐
                                                                               ▼
  Saved *.json file ──drag/drop or <input type=file>──────────────▶  index.html
                                                                      detect shape → normalize → rank → render
                                                                      themes: minitel | mono
v2
  index.html#https://forum ──fetch──▶ forum (fails: CORS)
                            └─fetch──▶ worker.626733.xyz/?u=https://forum/latest.json  (allowlist, CORS, 60 s cache)
                            └─fallback──▶ drop zone (v1 path)
```

**Data flow**: raw Discourse JSON → `normalize()` → `Issue` → `rank()` → `render(theme)`.

| Component | Responsibility |
|-----------|---------------|
| `index.html` | Everything: CSS, drop zone, normalizer, ranker, renderer, bookmarklet installer |
| `bookmarklet.js` | Runs on the forum origin. Fetches JSON, builds `Issue`, hands it to `index.html` via `postMessage` |
| `worker/` (v2) | Cloudflare Worker: GET-only allowlisted proxy adding CORS headers |

---

## Recommended Stack

No build step, no framework, no dependencies. All choices are browser baseline features, not libraries, so no popularity research applies.

| Layer | Chosen | Why | Rejected |
|-------|--------|-----|---------|
| UI | Vanilla HTML/CSS/JS in one file | Matches the rest of the `ejoliet.github.io` tool pages; nothing to update | Preact/Lit (adds a CDN dep for ~300 lines of JS) |
| HTML stripping | `DOMParser` + `textContent` | Native, safe, no regex-on-HTML | `html2text`-style libs |
| Compression (share link, optional) | `CompressionStream('gzip')` | Native in all evergreen browsers | pako / fflate |
| Font | System monospace stack | No external fonts, works offline | Google Fonts (blocked offline, slower) |
| Bookmarklet delivery | `index.html` fetches `bookmarklet.js` at load and sets `href="javascript:…"` | Zero build; source stays readable in the repo | Pre-minified inline string (needs a build script) |
| Proxy (v2) | Cloudflare Worker | Free tier, edge cache, rate-limit rules in dashboard | Vercel/Netlify function, own VPS |

---

## Repository Layout

```
minipress/
├── index.html            # the whole app (target < 40 KB)
├── bookmarklet.js        # readable source; installed via drag link on index.html
├── fixtures/
│   ├── latest.json       # real sample from community.openastronomy.org (strip nothing, it is public)
│   ├── topic-123.json    # one /t/<id>.json sample
│   └── issue.json        # canonical bundle produced by the bookmarklet
├── worker/               # v2 only
│   ├── wrangler.toml
│   └── src/index.js
├── CNAME                 # minipress.626733.xyz (when moved to its own repo)
├── LICENSE               # MIT
└── README.md
```

---

## Quick Start (user)

**Input 1 — drop a file**
1. Open `https://community.openastronomy.org/latest.json` in a tab, Save As `latest.json`.
2. Open `https://ejoliet.github.io/minipress/`, drop the file on the page.
3. Optional: also save a few `https://community.openastronomy.org/t/<id>.json` and drop them too; stories gain a lead paragraph.

**Input 3 — bookmarklet**

Desktop (Chrome, Firefox, Safari on Mac):
1. On `https://ejoliet.github.io/minipress/`, drag the **"minipress it"** link to the bookmarks bar.
2. On any page of the forum, click it. A new tab opens with the front page.

iPhone (Safari), unverified; forums with strict CSP may block it:
1. On minipress, tap **Copy bookmark URL**.
2. In Safari on the forum, Share, Add Bookmark. Open Bookmarks, Edit, open the new bookmark, replace its URL with the pasted text, save.
3. On the forum, open the bookmark.

Fallback that always works on iPhone: save `latest.json` to Files and use **Load JSON**.

**Local dev**
```bash
git clone https://github.com/ejoliet/minipress && cd minipress
python3 -m http.server 8000
# open http://localhost:8000/?fixture=issue.json   (loads fixtures/issue.json automatically)
```

---

## Interface Contract

### Accepted inputs (detected by shape, any number of files, merged)

| Shape | Detect by | Gives |
|-------|-----------|-------|
| `latest.json` (also `top.json`, `c/<slug>/<id>.json`) | top-level `topic_list.topics[]` | headlines, authors, categories, counts. **No bodies** |
| `t/<id>.json` | top-level `post_stream.posts[]` | lead paragraph for that topic (first post `cooked`) |
| `issue.json` | top-level `"minipress": 1` | everything, already normalized |

### `issue.json` v1 schema

```json
{
  "minipress": 1,
  "source": { "url": "https://community.openastronomy.org", "title": "OpenAstronomy", "fetched_at": "2026-10-08T14:02:11Z" },
  "categories": { "5": { "name": "Astropy", "color": "0088CC" } },
  "items": [
    {
      "id": 1234,
      "title": "FITS header parsing regression in 7.1",
      "url": "https://community.openastronomy.org/t/1234",
      "author": "jdoe",
      "created_at": "2026-10-01T09:00:00Z",
      "bumped_at": "2026-10-07T20:15:00Z",
      "category_id": 5,
      "tags": ["astropy", "fits"],
      "reply_count": 14,
      "views": 420,
      "like_count": 9,
      "pinned": false,
      "lead": "First post, HTML stripped, max 600 chars…"
    }
  ]
}
```

`lead` is optional. Everything else is required. Unknown keys are ignored.

### Ranking (the only real logic)

1. Drop pinned/banner topics into a "Notices" box, not the lead.
2. Score = `reply_count + like_count/2 + views/200`, ×2 if `bumped_at` within 7 days.
3. Highest score = lead story (full width, lead paragraph if available).
4. Next 4 = "second page" column.
5. Remaining grouped by category, sorted by `bumped_at` desc, as index lines: `  TITLE ............ 14 rep`.

### Themes

| Theme | Rules |
|-------|-------|
| `minitel` (default) | 40 character grid (`width: 40ch`, scales with `font-size`), black bg, 8-colour palette (`#fff #ff0 #0ff #0f0 #f0f #f00 #00f`), uppercase headlines, block rules `▀▄█`, page footer `3615 MINIPRESS  P.1/3`, no lowercase accents in headlines (strip diacritics) |
| `mono` | light bg, monospace, thin `1px` rules, CSS `columns: 3` on desktop, 1 on mobile, small-caps section labels |

Theme chosen via `?theme=mono` or a toggle; persisted in `localStorage` (try/catch, cosmetic only).

### Bookmarklet contract

```js
// bookmarklet.js — runs on the FORUM origin
// AIDEV-NOTE: must stay dependency-free and under ~2 KB after encodeURIComponent
const N_TOPICS = 30, N_LEADS = 12, LEAD_CHARS = 600;
const MINIPRESS = 'https://ejoliet.github.io/minipress/';
// 1. fetch('/latest.json?page=0', {headers:{Accept:'application/json'}})
// 2. for the top N_LEADS by score: fetch(`/t/${id}.json`), take post_stream.posts[0].cooked,
//    DOMParser → textContent → collapse whitespace → slice(LEAD_CHARS)
// 3. build issue.json (schema above); source.url = location.origin; source.title = document.title
// 4. w = window.open('about:blank') before any await (Safari popup rule); after build, w.location.href = MINIPRESS + '#await'; every 300 ms postMessage({type:'minipress/issue', issue}, MINIPRESS origin)
//    until a {type:'minipress/ack'} message comes back or 10 s elapse, then alert on failure
```

`index.html` side: on `#await`, listen for `message`; accept only `data.type === 'minipress/issue'` with `data.issue.minipress === 1`; reply `ack` to `event.source`; ignore `event.origin` (any forum may send) but **never** insert data via `innerHTML`, text nodes only.

### URL parameters

| Param | Effect |
|-------|--------|
| `#await` | wait for a postMessage (bookmarklet) |
| `?theme=minitel\|mono` | theme |
| `?fixture=<name>` | load `fixtures/<name>` (dev only, same-origin) |
| `#https://forum` | v1: try `fetch`, on failure show drop zone with instructions. v2: fall through to proxy |

---

## v2 — Cloudflare Worker proxy (design only, do not build in v1)

| Rule | Value |
|------|-------|
| Method | GET only |
| Target allowlist | path matches `^/(latest|top|c/[^/]+/\d+|t/\d+)\.json$` and host responds to a one-time probe of `/site.json` with `default_locale` (= it is a Discourse) |
| Origin allowlist | `https://ejoliet.github.io`, `https://minipress.626733.xyz` |
| Cache | `caches.default`, 60 s, key = target URL |
| Rate limit | Cloudflare rate-limiting rule, 60 req/min per IP |
| Response | pass body, set `Access-Control-Allow-Origin: <matched origin>`, strip `Set-Cookie` |

`index.html` v2 order: direct `fetch` → worker → drop zone. Worker URL in one `const PROXY = ''` (empty = disabled) so v1 ships with the slot present.

> ⚠️ An open proxy is an abuse surface. The Discourse probe and path regex are the mitigation; without them, do not deploy.

---

## Error Handling

| Case | Behaviour |
|------|-----------|
| Dropped file is not JSON or unknown shape | Inline red line in the masthead: `UNKNOWN FILE: <name>`; other files still render |
| `latest.json` only, no topic JSON | Render headline-only index; lead story shows `[see online]` link instead of a paragraph |
| Bookmarklet: `/latest.json` returns 403/429 | `alert('minipress: forum refused (HTTP n). Log in or wait a minute.')` |
| Bookmarklet: popup blocked | `alert` with the instruction to allow popups for the forum |
| Bookmarklet: no `ack` in 10 s | `alert` with "open minipress first, then click again" |
| `#https://forum` fetch fails (CORS) | Show drop zone, Save-As instructions and the bookmarklet link. No console-only failures |

---

## Testing

No test framework in v1. Verification is done by Emmanuel in the browser; the agent provides fixtures and the commands below.

```bash
# fetch real fixtures (public forum)
curl -s 'https://community.openastronomy.org/latest.json' -H 'Accept: application/json' > fixtures/latest.json
ID=$(python3 -c "import json;print(json.load(open('fixtures/latest.json'))['topic_list']['topics'][0]['id'])")
curl -s "https://community.openastronomy.org/t/$ID.json" -H 'Accept: application/json' > fixtures/topic-$ID.json

# serve and check
python3 -m http.server 8000
# http://localhost:8000/?fixture=latest.json       → index page, no leads
# http://localhost:8000/?fixture=issue.json        → full front page with leads
# http://localhost:8000/?fixture=issue.json&theme=mono
# drag fixtures/latest.json + fixtures/topic-*.json onto the page → merged
# confirm CORS is really blocked (expect no access-control line):
curl -sI -H 'Origin: https://ejoliet.github.io' https://community.openastronomy.org/latest.json | grep -i access-control
```

Bookmarklet check: install from the local page, click it on the forum, expect a new tab with the front page. Test Chrome and Firefox (Discourse CSP; Chrome ignores it for bookmarklets, Firefox usually does).

---

## Non-Goals (v1)

- No live fetching, no proxy, no GitHub Actions snapshot.
- No pagination beyond the first `latest.json` page (30 topics).
- No thread view; every story links back to the forum.
- No non-Discourse sources (WordPress, RSS). The `issue.json` schema is the extension point; adapters come later.
- No share-link (`#data=gzip+base64`). Noted for v1.5; link length limits in Slack/mail make it a separate decision.
- No accounts, analytics, or storage beyond the theme toggle.

---

## Open Questions

1. Headline-only Minitel index vs always-with-leads: should the bookmarklet default `N_LEADS` be 12 or 30? 30 doubles requests on the forum.
2. Hosting: `ejoliet.github.io/minipress/` as a folder of the user-site repo, or its own repo with `CNAME`? Own repo if the worker lands in v2 (one repo, one `wrangler.toml`).
3. Licence of forum content: add a footer line `Content © its authors, <forum> — rendered by minipress` and link every item. Enough?
4. Discourse `latest.json` `excerpt` is present only for pinned topics by default. Confirm on the target forum; if present everywhere, headline-only mode gets free teasers.

---

## Agent Build Instructions

> Implement from this README only. Resolve Open Questions 1 and 4 by choosing the defaults stated here (12 leads; assume no excerpts). Do not open a browser, do not push, do not install packages. Emmanuel runs the Testing section himself.

### Build Order

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| 0 | `index.html` skeleton, drop zone, `?fixture=` loader, `normalize()` for all three shapes | `?fixture=latest.json` lists 30 titles as plain text |
| 1 | `rank()` + `minitel` theme | Lead, second page, category index render; 40ch grid holds on a 375 px phone |
| 2 | `mono` theme + toggle | `?theme=mono` renders 3 columns on desktop |
| 3 | `bookmarklet.js` + `#await` listener + installer link | Bookmarklet source < 2 KB encoded; `postMessage` round trip works between two local tabs |
| 4 | `#https://forum` attempt + graceful fallback, `PROXY` slot | CORS failure shows instructions, not a blank page |

### File Map

| File | Purpose | Key symbols |
|------|---------|-------------|
| `index.html` | app | `detectShape(obj)`, `normalize(objs) → Issue`, `rank(issue) → {lead, second[], sections{}}`, `render(ranked, theme)`, `installBookmarklet()`, `onMessage(e)` |
| `bookmarklet.js` | collector | IIFE, constants at top, no globals left behind |
| `fixtures/*.json` | samples | real data from the public forum |

### Constraints

- One HTML file, inline CSS and JS, no external requests except `bookmarklet.js` (same-origin) and the optional forum/proxy fetch.
- Text nodes only for any data-derived content. No `innerHTML` with forum data.
- Every `localStorage` access in try/catch.
- `AIDEV-NOTE` comments only where a non-obvious decision lives (shape detection, ranking weights, postMessage handshake).
- Works with JavaScript on a 375 px phone and a 1280 px desktop without horizontal scroll.

### Acceptance Criteria

- [ ] Dropping `fixtures/latest.json` renders a Minitel index page.
- [ ] Dropping `latest.json` + two `topic-*.json` renders leads for those two stories.
- [ ] Dropping `issue.json` renders the full front page.
- [ ] Bookmarklet on `community.openastronomy.org` opens the front page in Chrome.
- [ ] Unknown file shows an error line and does not break other files.
- [ ] `#https://community.openastronomy.org` shows the fallback instructions.
- [ ] `index.html` under 40 KB, no console errors.

---

## Next Steps

1. Answer Open Questions 2 and 3.
2. Agent builds Phases 0–4.
3. Emmanuel runs the Testing section, commits, enables GitHub Pages.
4. v1.5: share link (`#data=`) if the use case appears.
5. v2: worker in `worker/`, `PROXY` constant set, DNS `worker.626733.xyz`.
