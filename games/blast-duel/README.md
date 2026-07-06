# BLAST DUEL

> Instant 2-player Quake-style arena shooter in the browser. One HTML file, zero backend, share a 4-letter code and duel.

## Overview

Family onboarding is the design constraint: host clicks **HOST GAME**, sends a `?j=CODE` link, guest opens it and plays. No install, no account, no server beyond the free PeerJS signaling relay. Same proven stack as Pop Rumble / STARLEAP: vanilla Canvas 2D, PeerJS 1.5.5 (pinned CDN), hand-rolled WebAudio synth, `bd.*` localStorage namespace with in-memory fallback.

## Game design

| Element | Spec |
|---------|------|
| Mode | 1v1 top-down arena duel, first to 10 frags |
| Weapons | Blaster (default, ∞), Rockets ×5 (splash + knockback, self-splash 50% → rocket-jump friendly), Railgun ×3 (hitscan, wall-blocked) |
| Pickups | 2× health +50 (10 s respawn), rockets pad, railgun pad (15 s respawn) |
| Map | 1600×1000, point-symmetric walls (fair), 4 spawn points, respawn at point farthest from enemy, 1.5 s spawn protection |
| Controls | Desktop: WASD + mouse aim + click/space. Mobile: dual virtual sticks (right stick past 45% = fire) |
| Persistence | `bd.name`, `bd.sfx`, `bd.stats` (W/L, frags, deaths, best streak) |

## Architecture

- **Host-authoritative**: host runs the fixed-step sim at 60 Hz. Guest is a dumb terminal.
- **Guest → host**: input `{ux,uy,ax,ay,f}` at 30 Hz.
- **Host → guest**: snapshots at 20 Hz + immediate event messages (`boom`, `rail`, `frag`, `pickup`, …) for sfx/particles.
- **Guest rendering**: interpolates between snapshots 120 ms behind receive time. No client-side prediction in v1 — target is same-wifi family play where this is imperceptible.
- **Rooms**: PeerJS id `blastduel-v1-<CODE>`, 4 chars from an ambiguity-free alphabet; collision retries with a fresh code.
- Bullet collision checks player before wall (point-blank shots must land); player separation re-resolves bounds/walls.

> 💡 Rejected alternatives: full mesh (pointless for 2 players), lockstep (input latency feels bad for a shooter), client prediction (complexity not justified at LAN latency — v2 item for internet play).

## Quick Start

1. Serve or open `index.html` (any static host: GitHub Pages, `gisthost.github.io`, or `python3 -m http.server`).
2. Player 1: enter name → **HOST GAME** → **COPY LINK**.
3. Player 2: open link → name → **JOIN**. Countdown starts automatically.

> ⚠️ `file://` works for solo menu testing but P2P needs `https://` (or `http://localhost`) for PeerJS + clipboard.

## Testing

Headless suite (no browser needed), extracts the inline script from `index.html`:

```bash
npm install jsdom
node tests/sim.test.js    # sim: frags accrue, frag limit fires, wall containment
node tests/host.test.js   # host: join handshake, countdown, snapshot stream, disconnect → lobby
node tests/guest.test.js  # guest: ?j= autofill, interpolation, over screen
```

## Tuning knobs

All constants at the top of the inline script: `FRAG_LIMIT`, `SPEED`, `WPN[]` damage/cooldowns, `SPLASH_*`, `WALLS`, `PADS`, `INTERP_MS`.

## Non-Goals (v1)

- >2 players, spectators, matchmaking
- Client-side prediction / lag compensation
- Multiple maps, bots, voice

## Next Steps

1. Playtest on real phones over wifi; tune stick dead-zones and rocket knockback.
2. If internet play matters: add client prediction for the guest's own ship (`AIDEV-TODO` in code).
3. Viral hooks: end-screen share card (canvas → PNG), daily map seed, win-streak badge.
