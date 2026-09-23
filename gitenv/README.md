# gitenv

> Replace `hub` with `env` in any GitHub URL to get the `.env.example` nobody wrote, plus ports, services, flags and runtimes the repo needs.

## Overview

Onboarding onto a repo usually fails on "which env var did I miss". gitenv fetches the repo's source through jsDelivr's GitHub mirror, runs ~40 language-specific regex detectors in the browser, and produces a grouped `.env.example` with defaults found in code, a documented/undocumented check, secret flagging, and a Markdown report. No AI, no server, no execution of the scanned code.

Single `index.html`. No build step. Hosts on GitHub Pages.

## What it detects

| Category | Sources |
|----------|---------|
| Env vars | `process.env`, `import.meta.env`, `os.environ`, `os.getenv`, `os.Getenv`, `env::var`, `System.getenv`, `ENV[]`, `getenv`, `$_ENV`, `Environment.GetEnvironmentVariable`, Spring `${X:default}`, shell `${X:-default}`, Dockerfile `ENV`/`ARG`, Compose `environment:`, GitHub Actions `env:`/`secrets.X`, Terraform `variable`, Laravel `env()`, django-environ |
| Defaults | Second argument or `||` / `??` / `:-` fallback |
| Documented | Name appears in `.env.example`, README, `docs/`, CONTRIBUTING |
| Secret | Name matches `SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|…` or came from `secrets.X` |
| Ports | `EXPOSE`, Compose `ports:`, `.listen(N)`, `port=N`, `--port`, uvicorn/flask, `ListenAndServe`, `containerPort` |
| Services | SDK imports, drivers, connection-string schemes (AWS, S3, Postgres, Redis, Kafka, Stripe, OpenAI, Sentry, …) |
| CLI flags | argparse, click, typer, commander/yargs, Go `flag`, cobra, clap, picocli |
| Runtime | `pyproject` `requires-python`, `engines.node`, `.nvmrc`, `go.mod`, `Cargo.toml`, Gradle/Maven, Dockerfile `FROM`/`CMD`, Compose services, Makefile/Justfile targets, Procfile, workflows |

Skipped: `node_modules`, `vendor`, `dist`, `build`, lockfiles, minified files, binaries, fixtures, migrations, locales.

## Quick Start

1. Copy `index.html` and `404.html` into a repo named `gitenv`.
2. Settings → Pages → Deploy from branch `main`, folder `/`.
3. Open `https://<user>.github.io/gitenv/#apache/airflow`.

Local test:

```bash
python3 -m http.server 8081
# open http://localhost:8081/#cyclotruc/gitingest
```

## URL forms

| URL | Behaviour |
|-----|-----------|
| `/gitenv/#owner/repo` | Scan default branch |
| `/gitenv/#owner/repo/tree/v1.2` | Scan a ref |
| `/gitenv/owner/repo` | `404.html` rewrites to the hash form |

## Configuration

Options under "Scan options" in the UI:

| Option | Default | Note |
|--------|---------|------|
| Max files to read | 600 | Config-like files are read first, then source, tests last |
| Max file size | 200 KB | |
| Branch or tag | default branch | |
| GitHub token | none | Only used for the 2 API calls (repo, tree). File fetches go through jsDelivr / raw and are not rate limited the same way |

## Development

- Detectors are plain arrays in `index.html`: `ENV_PATTERNS`, `PORT_PATTERNS`, `SERVICE_SIGNS`, `FLAG_PATTERNS`, `CONFIG_FILE_PATTERNS`. Each entry has a `re` (global) and an optional `lang` path filter.
- The scanner is pure (`scan(files) → result`) so it can be unit-tested in Node without a DOM:

```bash
node -e "const s=require('fs').readFileSync('index.html','utf8');require('fs').writeFileSync('/tmp/e.js',s.match(/<script>([\s\S]*)<\/script>/)[1])" && node --check /tmp/e.js
```

See `test/scan.test.js` for a synthetic-repo test that exercises every detector family.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| A var is missing | Its access pattern is not in `ENV_PATTERNS`; add one (or open an issue with the snippet) |
| Shell noise like `$DIR` shows up | Extend `LIKELY_SHELL_NOISE` or `IGNORE_NAMES` |
| Very few files scanned | Raise "Max files"; huge monorepos hit the cap |
| jsDelivr 404 on a file | Path has unusual characters; raw.githubusercontent fallback usually works |

## References

- jsDelivr GitHub CDN: https://www.jsdelivr.com/documentation#id-github
- Sibling tool: gitsql (replace `hub` with `sql`)
