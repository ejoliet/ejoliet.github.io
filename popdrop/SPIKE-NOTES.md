# popdrop — Spike Notes

> Validates the hardest primitive before RDD spec: chunked file transfer over PeerJS DataChannel with backpressure and streaming disk writes.

## Decisions locked (from scoping)

| Decision | Choice |
|---|---|
| v1 scope | Live sessions only; relay-ready seams for async later |
| Host browser | Chromium first (`showDirectoryPicker` streaming); OPFS fallback path present for Firefox; Safari worker path deferred |
| Positioning | Standalone repo (`ejoliet/popdrop`) |
| Stack | Locked per `p2p-tool-builder` — vanilla JS, single file, PeerJS 1.5.5 cdnjs-pinned, star topology, `pd.*` localStorage |
| Payer | Host seat (intake organizer). Ed25519 offline keys, Lemon Squeezy/Polar — post-spike |

## What the spike implements

- Host: 4-char room code, `?j=CODE` link, `showDirectoryPicker` → OPFS → memory (500 MB cap) sink ladder
- Guest: drag-drop / picker, sequential queue, 64 KiB chunks
- Backpressure: `bufferedAmount` high/low water (1 MiB / 256 KiB), `bufferedamountlow` event — no timers
- Integrity: SHA-256 chunk-digest chain, receipt compared both ends
- Security preflight: 4 GiB inbound cap, 1 in-flight transfer per guest, 8-guest cap, filename sanitization, `textContent` only
- Resilience: single peer instance, `once('open')`, `retryPending` reconnect guard, stale-ID retry, `beforeunload` guard
- Config seam: `window.POPDROP_PEER_OPTIONS`

## GO / NO-GO (two-machine test — manual, you)

- [ ] 2 GiB file transfers host↔guest across two machines; receipts match
- [ ] Host JS heap stays flat (< ~300 MB delta) with disk sink — watch `stats` line
- [ ] `max recv-side queued` stays bounded (≈ ≤ 2× HIGH_WATER)
- [ ] Throughput ≥ 10 MB/s on LAN via free PeerJS Cloud
- [ ] Guest on Safari/Firefox → Chromium host works (guest side needs no FS API)

## Known deferrals (AIDEV-TODO in code)

- Receiver→sender explicit flow control (acks); sender-side backpressure covers spike
- Safari host: OPFS `createSyncAccessHandle` in a Worker
- QR code, checklists, receipts UI, licensing — product, not spike
- No resume on disconnect — restart transfer

## Next Steps

1. Two-machine 2 GiB test; log results against GO/NO-GO
2. On GO: RDD Type A spec via `readme-driven-dev` (protocol contract from spike message schemas: `hi/meta/go/no/fin/rcpt`)
3. Log any new burned items into `p2p-tool-builder`
