# Pop Rumble

One HTML file. Multiplayer emoji-pop battle over WebRTC data channels. Companion to `video-call.html` — same onboarding: host shares a link, family taps it, done.

## How it works

- **Host** opens the page → enters name → **Start a game** → gets a `?room=...` link.
- **Guests** tap the link → enter name → **Join the game**.
- Host presses **Start round**: 3-2-1 countdown, then 45 seconds of popping.
- Everyone sees the **exact same emoji field** (seeded PRNG shared at round start) — fair race.
- Scoring: emoji +1, 🌟 +5, 💀 −3 and resets streak. Every 5-pop streak adds a bonus.
- Live scoreboard syncs ~3×/s; results screen shows winner, confetti, best streaks.
- Signaling via free [PeerJS Cloud](https://peerjs.com/peerserver); gameplay messages are tiny JSON over direct P2P data channels.

## Stack (per js13kgames.com/resources)

| Layer | Chosen | Why | Rejected |
|-------|--------|-----|----------|
| Rendering | Vanilla Canvas 2D | Zero deps, one file, no build | LittleJS (great, but needs build step / extra file) |
| Sound | ZzFX v1.3.2 (embedded, MIT) | ~1.2 KB, no audio assets, the js13k standard | mp3/ogg assets, TinyMusic |
| Networking | PeerJS 1.5.5 data channels | Reuses the video tool's proven pattern | WebSocket server (breaks no-server constraint) |
| Persistence | localStorage | Requested; survives reloads per device | IndexedDB (overkill) |

Topology is a **star** (host relays scores). Unlike video mesh, data is a few bytes per message — comfortably handles ~8 players.

## localStorage keys

| Key | What |
|-----|------|
| `pr.name` | Player name (prefills join screen) |
| `pr.best` | Personal best score |
| `pr.games` | Rounds played |
| `pr.wins` | Rounds won |
| `pr.sound` | Sound on/off |

## Message protocol (JSON over data channel)

| Msg | Direction | Payload |
|-----|-----------|---------|
| `hi` | guest → host | `{name}` |
| `lobby` | host → all | `{p:[names]}` |
| `start` | host → all | `{seed, dur}` |
| `sc` | guest → host | `{s:score, c:maxStreak}` every 400 ms |
| `board` | host → all | `{b:[{n,s}]}` every 350 ms |
| `end` | host → all | `{b:[{n,s,c}]}` final results |

## Deploy

Must be HTTPS. Same as the video tool:

1. **Netlify Drop**: rename to `index.html`, drag into https://app.netlify.com/drop
2. **GitHub Pages**: commit as `index.html`, enable Pages.

## Config knobs (top of script)

- `ROUND_S = 45` — round length
- `MAX_RETRIES = 6`, `RETRY_MS = 2500` — guest reconnect
- `EMOJI` array — swap the cast
- Spawn odds in `spawn()`: 10% skull, 14% gold

## Limitations (accepted)

- No TURN server: symmetric-NAT guests may fail to connect (same trade-off as the video tool).
- Host leaving ends the room; guests must get a fresh link.
- Round timer is per-device from `start` receipt; skew is typically <100 ms — fine for a family game.
- Scores are self-reported by each client. Trusted-family threat model; do not use for money.

## Next steps

1. Deploy to Netlify Drop, test on two phones over cellular + Wi-Fi.
2. Tune spawn odds / round length after first family play-test.
3. Optional: rematch counter ("best of 3") and per-room win tally over the data channel.
