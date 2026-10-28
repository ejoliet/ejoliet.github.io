# Redact

> A single-file web page that scrubs tokens, keys, passwords and other secrets from text, entirely in your browser.

## Overview

Paste text, drop files, or fetch a URL. Redact replaces anything that looks like a secret with a placeholder. You copy or download the result.

Nothing is uploaded. There is no backend, no analytics, no dependencies.

## Quick Start

1. Copy `index.html` into your Pages repo:

   ```bash
   cd ejoliet.github.io
   mkdir -p redact && cp /path/to/index.html redact/
   git add redact && git commit -m "Add redact page" && git push
   ```

2. Open `https://ejoliet.github.io/redact/`.

To test locally first:

```bash
cd ejoliet.github.io
python3 -m http.server 8000   # then open http://localhost:8000/redact/
```

The page also works from `file://`, except URL fetch may be blocked by the browser.

## Usage

| Action | How |
|--------|-----|
| Paste text | Click the input box and paste, or paste anywhere on the page |
| Load files | **Open file**, or drag files onto the Input pane. Multiple files are joined with `===== name =====` headers. Limit: 50 MB per file |
| Fetch URL | Enter a raw file URL and press **Fetch** or Enter |
| Redact | Automatic while typing (150 ms delay). Untick **redact as I type** and use **Redact** for big inputs |
| Copy | **Copy** puts the redacted text on the clipboard |
| Download | **Download** saves `<name>.redacted.<ext>` |
| Reset | **Clear** empties input, output and findings |

Redacted values are highlighted in the output. The **What was redacted** table shows each rule, its count, and a masked preview (first 3 and last 3 characters).

> 💡 For GitHub files, use the `raw.githubusercontent.com` link. Fetch only works when the server sends CORS headers. Otherwise download the file and drop it in.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| Replace with | `[REDACTED:TYPE]` | Placeholder style. See below |
| Keep last 4 characters | off | Appends the last 4 characters of the secret. Skipped for values of 8 characters or fewer and for private keys |
| Redact as I type | on | Re-run on every edit |
| Rules | see below | Per-rule toggles. Saved in `localStorage` under `redact.rules.v1` |

### Placeholder styles

| Style | Example | Use when |
|-------|---------|----------|
| `[REDACTED:TYPE]` | `[REDACTED:GITHUB]` | General sharing |
| Numbered | `[GITHUB_1]` | You need to tell secrets apart. Same value gets the same number |
| Short hash | `[GITHUB:ab12cd]` | You need to match values across separate runs. SHA-256, first 6 hex chars |
| Stars | `********` | You want no type information |

> ⚠️ The short hash is stable and unsalted. Do not use it for low-entropy secrets (short passwords can be guessed from the hash).

## Rules

Earlier rules win when matches overlap.

| Rule | Catches | Default |
|------|---------|---------|
| Private key blocks | PEM, OpenSSH, PGP | on |
| AWS access key ID | `AKIA…`, `ASIA…` and related prefixes | on |
| AWS secret access key | 40 characters after `aws_secret_access_key` | on |
| GitHub / GitLab | `ghp_`, `gho_`, `github_pat_`, `glpat-` | on |
| Slack | `xoxb-`, `xoxp-`, webhook URLs | on |
| Google API keys | `AIza…` | on |
| OpenAI / Anthropic | `sk-…`, `sk-ant-…` | on |
| Stripe | `sk_live_`, `pk_live_`, `rk_live_` and test variants | on |
| SendGrid / Twilio / Mailgun | `SG.…`, `SK…`, `AC…`, `key-…` | on |
| npm / PyPI / Hugging Face | `npm_`, `pypi-`, `hf_` | on |
| JWT | `eyJ….eyJ….sig` | on |
| Authorization headers | `Bearer`, `Basic`, `Token` values | on |
| Credentials in URLs | `scheme://user:PASSWORD@host` | on |
| Connection strings | `Password=…;` | on |
| key = value secrets | `password`, `secret`, `token`, `api_key`, `client_secret`, etc. followed by `=`, `:` or `=>` | on |
| AWS account IDs | 12 digits inside an ARN or after `account_id` | on |
| High-entropy strings | 20+ characters, 3+ character classes, high Shannon entropy | on |
| IPv4 addresses | Any dotted quad | off |
| Email addresses | Any `a@b.c` | off |

## Privacy model

- Input and output exist only in tab memory. They are never written to `localStorage` or `sessionStorage`.
- Only the rule toggles are saved to `localStorage`.
- A Content-Security-Policy meta tag blocks scripts, styles, images and frames from other origins. `connect-src` is open only so the URL fetch can work.
- Fetches use `credentials: omit` and `referrer: no-referrer`.
- The only network request the page makes is the URL you ask it to fetch.

> ✅ To verify: open DevTools, go to the Network tab, paste a secret. You should see no requests.

## Limitations

- **Pattern-based.** It misses secrets that look like ordinary words, for example "the admin password is bananasplit".
- **No structure parsing.** A secret split across YAML lines or embedded in a binary file is not caught.
- **False positives.** Long base64 blobs and some IDs can trip the entropy rule. Untick **High-entropy strings**, or raise the thresholds in `looksRandom()` in `index.html`.
- **Preview in the findings table** still shows 6 characters of each secret. Do not screenshot it.

> ⚠️ Always read the output before sharing. This tool reduces leaks. It does not guarantee none.

## Development

Everything is in `index.html`. To add a rule, append an object to the `RULES` array:

```js
// AIDEV-NOTE: order matters. Specific formats first, generic last.
{ id:'myservice', name:'MyService tokens', hint:'msv_…', on:true,
  re:/\bmsv_[A-Za-z0-9]{32}\b/g },
```

Optional fields: `group` (capture group that holds the secret, default 0) and `skip(value)` (return `true` to ignore a match). Regexes must have the `g` flag.

Quick rule test from a terminal, no browser needed:

```bash
node -e '
const src=require("fs").readFileSync("index.html","utf8");
const code=src.slice(src.indexOf("function looksRandom"), src.indexOf("// ---- rule UI"));
const rules=src.slice(src.indexOf("const RULES = ["), src.indexOf("// Shannon"));
const RULES=(0,eval)("(function(){"+code+rules+" return RULES;})()");
const text=require("fs").readFileSync("sample.txt","utf8");
for (const r of RULES){ r.re.lastIndex=0; let m;
  while((m=r.re.exec(text))){ console.log(r.id, JSON.stringify(m[r.group||0]).slice(0,60)); if(!m[0].length) r.re.lastIndex++; } }'
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Could not fetch" | Server has no CORS headers | Use a raw GitHub link, or download the file and drop it in |
| Copy says "Clipboard blocked" | Page not served over HTTPS or localhost, or no user gesture | Use the Pages URL, or select the output and copy manually |
| Secret not redacted | Doesn't match any pattern | Add a rule, or lower the entropy threshold |
| Normal text redacted | Entropy or key=value rule too eager | Untick that rule |
| Slow on a huge file | Live mode re-runs on each edit | Untick **redact as I type**, press **Redact** once |

## Next Steps

- [ ] Optional: add an in-browser model pass (transformers.js token classification, or WebLLM on WebGPU) that proposes extra spans. Regex stays as the first pass. Costs a 50 MB to 2 GB model download, so make it opt-in.
- [ ] Optional: sessionStorage draft of the input, if you want text to survive a refresh (cleared when the tab closes).
