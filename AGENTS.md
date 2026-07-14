# AGENTS.md

## Cursor Cloud specific instructions

This repo (`ejoliet.github.io`) is a **static GitHub Pages site** plus one small self-hostable backend. Almost everything here has **no build/lint/test tooling** (no `package.json`, `Makefile`, CI, or test framework) — front-end libraries are CDN-loaded and there is no build step. The one exception is `popvote/`, which has its own dev-only `package.json`/jsdom test suite and GitHub Action (see below) purely for testing; the shipped app itself is still a single, buildless `index.html`.

### Services

**1. Static site (all HTML demos + landing page).** The root `index.html` links to demos under `demo/`, `sofia/`, `radar/`, `nexsci-neid/`, `firefly-help/`, `mosaic/`, `ics/`, `family-p2p/`, `family-multi-chat/`, `arrow/`, `popvote/`. Serve with any static server from the repo root:

```bash
python3 -m http.server 8080   # then open http://localhost:8080/
```

- Fully client-side tools that work offline: `ics/webcal.html` (generates a 1-hr `.ics` event) and the landing page.
- Firefly demos (`sofia`, `radar`, `nexsci-neid`, `firefly-help`) fetch data from external Caltech/IRSA servers (`irsa*.ipac.caltech.edu`); `mosaic` pulls external HLS video streams. These degrade to empty viewers without internet and cannot be self-hosted.
- `family-p2p/`, `family-multi-chat/`, `arrow/`, and `popvote/` are WebRTC (PeerJS) apps and need a **secure/HTTPS context** — `family-*`/`arrow` for camera access, `popvote` for the clipboard/share APIs and for guests to actually connect (it'll still run `file://` for a host-only demo with no guests).
- `popvote/` (zero-backend live audience polling — polls, word clouds, Q&A, an "Instant Recap" export) has dev-only tooling worth knowing about: `popvote/HANDOFF.md` tracks build state in detail; `popvote/keygen/` generates the Ed25519 keypair/license strings for the Pro tier (local-only, gitignored keys, never commit a `.pem` or a real license string); `popvote/dev/*.js` are Playwright scripts that drive the real `index.html` against a network test double (`fake-peerjs.js`) since PeerJS/WebRTC need real signaling+UDP that many sandboxed environments can't carry; `popvote/test/` is the jsdom unit suite (`cd popvote && npm ci && npm test`).

**2. MFA OTP microservice (`mfa/`).** A Flask + pyotp service exposing `POST /validate_otp`. The only self-hosted backend.

- `mfa/app.py` **hardcodes `host=0.0.0.0, port=8000`** (no port env var). If you run the static server on 8000 too, Flask fails with "Address already in use" — run them on **different ports** (e.g. static on 8080, MFA on 8000).
- Requires the `OTP_SECRET` env var (the TOTP base32 secret). Generate one with `mfa/generate_mfa.py` (prints a `Secret Key` + writes `mfa_qr.png`). Get the current OTP for testing with `mfa/check_mfa.py <secret>`.
- Run and test:

```bash
cd mfa
OTP_SECRET=<secret> ../.venv/bin/python app.py            # serves on :8000
OTP=$(../.venv/bin/python check_mfa.py <secret>)
curl -s -X POST http://localhost:8000/validate_otp \
  -H "Content-Type: application/json" -d "{\"otp\":\"$OTP\"}"   # -> {"status":"success"}
```

### Python environment

Python deps live only in `mfa/requirements.txt` and are installed into a repo-local `.venv` (gitignored) by the startup update script. Use `.venv/bin/python` to run the MFA scripts/app. The `Dockerfile` pins Python 3.9, but the deps also run fine on the system Python 3.12 used here.
