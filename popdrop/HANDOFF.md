# popdrop — Handoff Document

**Author**: Claude session with Emmanuel Joliet (`ejoliet`)
**Date**: 2026-07-07
**Status**: Spike delivered, two-machine test pending. No repo yet. No README yet (gated on spike).

## What popdrop is

P2P file-receive room. Host opens a page, gets a 4-char room code + link. Clients open the link and drop files. Files stream browser-to-browser over WebRTC DataChannel — never touch a server. Target buyers: orgs collecting paperwork live (lawyers, banks, HR, clubs) and media intake (artists, agencies). Pitch: "your documents never touch a server."

Differentiator vs ShareDrop/FilePizza (1:1 send toys): **intake workflow** — document checklists, auto-rename, SHA-256 receipts, manifest export.

## Decisions already made — do not reopen

| Decision | Choice | Why |
|---|---|---|
| Scope v1 | Live sessions only | Pure P2P; async needs a relay. Relay seams left in (`window.POPDROP_PEER_OPTIONS`, protocol relay-impersonatable) |
| Host browser | Chromium first | `showDirectoryPicker` streaming disk writes. OPFS fallback covers Firefox host. Safari host = Worker `createSyncAccessHandle`, deferred |
| Positioning | Standalone repo `ejoliet/popdrop` | Not a RoomLink vertical |
| Stack | Emmanuel's locked P2P stack | Vanilla JS, single HTML file, no build step, PeerJS 1.5.5 cdnjs-pinned, star topology (host = hub), Canvas not needed here, `pd.*` localStorage with in-memory fallback, `AIDEV-` comments |
| Payer | Host seat only | Ed25519 offline license keys (public key baked in, private PEM gitignored BEFORE keygen), Lemon Squeezy or Polar MoR. Never gate participation |
| Free tier | 1 concurrent uploader, 100 MB/file | Visible feedback on blocks — silent gating looks like a bug |
| Premium | Unlimited uploaders, checklist templates, auto-rename `{client}_{slot}_{date}`, SHA-256 receipts UI, ZIP + CSV manifest export, branding, per-slot file rules | Checklist + receipts = the moat |
| Paid infra | Self-hosted peerjs-server + TURN via config seam | Free PeerJS Cloud has no SLA — free tier only |

## Current state

| Artifact | Location | Status |
|---|---|---|
| `popdrop-spike.html` | Delivered to Emmanuel (Claude outputs, this session) | Syntax + helper tests pass headless. Two-machine test NOT run |
| `SPIKE-NOTES.md` | Same | GO/NO-GO checklist inside |
| RDD spec | Does not exist | Blocked on spike GO |
| Repo | Does not exist | Create as `ejoliet/popdrop` after GO |

### Spike GO/NO-GO (Emmanuel runs manually, two machines)

- [ ] 2 GiB file host↔guest, hash receipts match both ends
- [ ] Host JS heap flat (< ~300 MB delta) with disk sink
- [ ] `max recv-side queued` stat bounded (≈ ≤ 2 MiB)
- [ ] ≥ 10 MB/s LAN over free PeerJS Cloud
- [ ] Safari/Firefox guest → Chromium host works

## Protocol contract (implemented in spike — keep wire-compatible)

JSON control + raw binary chunks on one reliable/ordered PeerJS connection:

| Msg | Direction | Fields | Meaning |
|---|---|---|---|
| `hi` | host→guest | — | Connection accepted |
| `meta` | guest→host | `id, name, size, mime` | Request to send one file |
| `go` / `no` | host→guest | `id`, (`reason`) | Accept / reject (reject reasons: busy, size cap, no sink) |
| binary | guest→host | 64 KiB ArrayBuffer chunks, sequential | File data; ordered channel, chunks counted not indexed |
| `fin` | guest→host | `id, hash` | All chunks sent; hash = SHA-256 of concatenated per-chunk SHA-256 digests |
| `rcpt` | host→guest | `id, ok, hash` | Host verified size + hash chain |

Constants: CHUNK 64 KiB, HIGH_WATER 1 MiB, LOW_WATER 256 KiB, MAX_FILE 4 GiB, 1 in-flight transfer per guest, 8-guest spike cap (product: free=1 uploader, star ceiling ~50–150).

## Known soft spots / deferrals (AIDEV-TODO in spike)

1. **Receiver-side flow control**: host write queue has no ack-based throttle; sender `bufferedAmount` backpressure bounds it in theory. If `max recv-side queued` grows on slow disks in the test, ack-based flow control becomes spec requirement #1.
2. Safari host disk path (Worker + `createSyncAccessHandle`).
3. No transfer resume after disconnect.
4. QR code onboarding not in spike.
5. `showDirectoryPicker` requires user gesture — solved by "Choose save folder" button at session start; keep that pattern.

## Burned items already applied (do not regress)

- Backpressure via `bufferedAmount`/`bufferedamountlow`, never timers
- Single peer instance, `once('open')`, `retryPending` guard, capped backoff
- Stale own-ID `unavailable-id` retry after fast host refresh
- Normalize incoming binary (ArrayBuffer vs typed array)
- `textContent` for peer strings — no double-escaping
- Cap ALL inbound data (size, in-flight, guest count)
- `.gitignore` `*.pem` BEFORE generating license keypair

---

## Prompt for the next agent — paste as-is

```
You are picking up popdrop, a P2P file-receive room (browser-only, zero backend).
Owner: Emmanuel Joliet (ejoliet). Read HANDOFF.md in full first — all product and
stack decisions there are final; do not reopen them.

Before writing any code or spec, read these skills if available in your environment:
- p2p-tool-builder (locked stack, security preflight, burned log)
- readme-driven-dev (RDD spec format)
- emmanuel-markdown (doc layout)
If unavailable, the HANDOFF.md tables are your constraints.

State: a working spike (popdrop-spike.html) exists. Ask Emmanuel for the
two-machine GO/NO-GO results (checklist in HANDOFF.md) before proceeding.

Workflow, strictly in order:
1. If GO/NO-GO not yet run: help Emmanuel run it. If "max recv-side queued" grew
   unbounded, add ack-based receiver flow control to the protocol before anything else.
2. On GO: write the RDD Type A spec (README.md) using the protocol contract in
   HANDOFF.md verbatim as the wire schema. Phase-gated build order, Phase 0 = docs
   only, explicit acceptance criteria. No code in the spec.
3. Get Emmanuel's approval on the spec. Then scaffold repo ejoliet/popdrop:
   single index.html, no build step, MIT license, .gitignore with *.pem BEFORE
   any keygen.
4. Implement phases: core transfer (port spike) -> intake features (checklists,
   auto-rename, receipts UI) -> free/premium gating (Ed25519 offline keys,
   host-seat only, visible block feedback) -> export (ZIP + CSV manifest).

Hard constraints (violations = rejected PR):
- Vanilla JS, single HTML file, PeerJS 1.5.5 pinned from cdnjs, no framework,
  no bundler, no third-party scripts beyond pinned CDN libs.
- Backpressure on dataChannel.bufferedAmount only; ordered:true always.
- Cap all inbound P2P data; sanitize filenames; textContent for peer strings.
- localStorage namespaced pd.* with in-memory fallback.
- Config seam window.POPDROP_PEER_OPTIONS untouched.
- Never commit secrets or private keys. Free PeerJS Cloud for free tier only.
- AIDEV- comments for non-obvious mechanisms; AIDEV-TODO for deferrals.
- Tests before presenting: Node syntax check minimum; jsdom for hash chain,
  sanitization, localStorage fallback, reconnect guard. Call out host-reclaim
  paths for manual two-machine testing explicitly.

Communication: terse, direct, no preamble. Confirm a short plan before large
changes. Update HANDOFF.md burned-items table when you get burned.
```

## Next Steps

1. Emmanuel: run two-machine GO/NO-GO, record results in this file.
2. Commit this file as `HANDOFF.md` at repo root when `ejoliet/popdrop` is created.
3. Next agent: follow the embedded prompt, step 1.
