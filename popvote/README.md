# popvote

Zero-backend live audience polling (polls, word clouds, Q&A, rating scales) that
runs entirely in the presenter's browser tab. One HTML file. Audience joins via
QR/link. No accounts, no server, no monthly meter.

**Killer feature: Instant Recap** — one click at session end generates a
self-contained HTML report of the whole session (every poll chart, word cloud,
Q&A ranked by upvotes, participation timeline), 100% client-side, opens offline
forever.

## Status

Under active development. See `HANDOFF.md` for phase-by-phase progress, spike
results, and what's still untested.

## Run it

No build step. Serve the repo root with any static file server and open
`popvote/index.html` over HTTPS (WebRTC/clipboard APIs require a secure
context; `file://` only works for a host-only demo with no guests).

```bash
python3 -m http.server 8080   # from the repo root
# open https://<your-tunnel>/popvote/index.html
```

## How it works

- Star topology: the host's tab is the hub, guests connect directly to it via
  [PeerJS](https://peerjs.com/) (WebRTC data channels, free PeerJS Cloud
  signaling). Host holds all authoritative state; guests hold nothing durable.
- Host creates a session, picks activities (multiple choice poll, word cloud,
  open Q&A, 1–5 rating scale), and reveals results live.
- At session end, "Generate Recap" produces
  `popvote-recap-<date>-<code>.html` — a standalone file with inline SVG
  charts, downloadable via a Blob URL.
- Free vs Pro gates the **host seat only** (activity count, guest cap, Instant
  Recap); participation is never gated.

## Self-hosting signaling (Pro)

By default popvote uses the free PeerJS Cloud broker. To point at your own
signaling server, set before the app script runs:

```html
<script>window.POPVOTE_PEER_OPTIONS = { host: "your-peerjs-server.example.com", port: 443, secure: true };</script>
```

## Licensing (Pro)

Free vs Pro gates the host seat only (3 activities / 30 guests / locked
recap preview vs. unlimited / 100 guests / downloadable recap) — guests
never see a gate. Pro unlocks with an Ed25519-signed license key, verified
entirely offline in the browser against the public key baked into
`index.html`; there is no license server and no network call involved in
checking a key. Lemon Squeezy is the merchant of record for the actual
purchase. See `popvote/keygen/README.md` for how to generate the signing
keypair and mint license keys for buyers — that tooling is local-only and
never ships to guests or presenters.

## Security

Private license-signing keys (`*.pem`, `popvote/keys/`) must never be
committed — see `.gitignore` at the repo root. `popvote/keygen/` contains the
(local-only) key generation script; it never runs in CI or ships to guests.
