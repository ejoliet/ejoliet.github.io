# gitsql

> Replace `hub` with `sql` in any GitHub URL and query the repo with SQL, in your browser, with no backend.

## Overview

Every GitHub repo is already a database: commits, files, contributors, issues, releases. gitsql pulls that data from GitHub's REST API, loads it into DuckDB-WASM in the browser tab, and gives you a SQL editor with presets (bus factor, churn by month, largest files, time-to-close). Nothing leaves your machine except calls to `api.github.com`.

Single `index.html`. No build step. Hosts on GitHub Pages.

## Tables

| Table | Rows | Source |
|-------|------|--------|
| `repo` | 1 | `GET /repos/{o}/{r}` |
| `files` | every blob at the loaded ref | `GET /git/trees/{ref}?recursive=1` |
| `commits` | latest N×100 (default 500) | `GET /commits` paged |
| `contributors` | up to 100 | `GET /contributors` |
| `issues` | issues + PRs, latest N×100 | `GET /issues?state=all` paged |
| `releases` | up to 100 | `GET /releases` |
| `languages` | one per language | `GET /languages` |

> ⚠️ `commits` has no per-file paths. GitHub's commit list endpoint does not include them and per-commit fetches would burn the rate limit.

## Quick Start

1. Copy `index.html` and `404.html` into a repo named `gitsql`.
2. Settings → Pages → Deploy from branch `main`, folder `/`.
3. Open `https://<user>.github.io/gitsql/#duckdb/duckdb`.

Local test:

```bash
python3 -m http.server 8080
# open http://localhost:8080/#astropy/astropy
```

DuckDB-WASM loads from jsDelivr, so you need internet even locally.

## URL forms

| URL | Behaviour |
|-----|-----------|
| `/gitsql/#owner/repo` | Load repo on default branch |
| `/gitsql/#owner/repo/tree/v1.2` | Load a specific ref |
| `/gitsql/#owner/repo?q=<base64url SQL>` | Load and run a shared query |
| `/gitsql/owner/repo` | `404.html` rewrites to the hash form |

For the real `gitsql.com/owner/repo` swap you need a custom domain plus the same `404.html`.

## Configuration

No config file. Runtime options live under "Load options" in the UI:

| Option | Default | Note |
|--------|---------|------|
| Commit pages | 5 | 100 commits per page, max 50 |
| Issue/PR pages | 3 | 0 disables |
| Branch or tag | default branch | |
| GitHub token | none | Stored in `localStorage` only. Raises limit 60 → 5000 req/hour and enables private repos |

## Development

- All code is in `index.html` between `<script type="module">` tags. Sections are marked `// ----------`.
- Presets are the `PRESETS` array. Add a `{label, sql}` entry.
- Pinned dependency: `@duckdb/duckdb-wasm@1.29.0` from jsDelivr. Bump the version string in the import.
- Syntax check without a browser:

```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');require('fs').writeFileSync('/tmp/g.mjs',s.match(/<script type=\"module\">([\s\S]*)<\/script>/)[1])" && node --check /tmp/g.mjs
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "GitHub rate limit hit" | Add a token, or wait for the reset time shown |
| Tree truncated warning | Repo has >100k files; `files` is partial |
| Blank results, console shows WASM error | Browser blocked jsDelivr or is too old for WASM; try Chrome/Firefox current |
| Query error on `labels` | It is a `VARCHAR[]`; use `unnest(labels)` |

## References

- DuckDB-WASM: https://github.com/duckdb/duckdb-wasm
- GitHub REST API: https://docs.github.com/en/rest
- Sibling tool: gitenv (replace `hub` with `env`)
