# Family Video Call (mesh, 2–4 people)

One HTML file. Browser-to-browser group video call over WebRTC. No install, no account, no server code of your own.

## How it works

- First person opens the page → **Start** → gets a room link → sends it.
- Everyone else taps the link → **Join the call** → connected. Same link works for all.
- Media is a **full P2P mesh**: everyone streams directly to everyone else (WebRTC, encrypted with DTLS-SRTP).
- One participant (the "anchor") holds the room ID on the free [PeerJS Cloud](https://peerjs.com/peerserver) signaling server and shares the member list over data channels. **No video/audio passes through any server.**
- If the anchor leaves, remaining members automatically elect a new anchor by re-claiming the room ID. Ongoing video is not interrupted — only new joins depend on the anchor.

## Reconnection rules

| Failure | Behavior |
|---|---|
| One peer's video drops | The lower-ID side of the pair re-calls: 5 attempts, 3 s apart |
| Lost the room (signaling) | Rejoin: 8 attempts, 3 s apart, then a big **Try again** button |
| Anchor leaves | Automatic re-election, staggered to avoid races; call continues |

## Bandwidth (why 4 is the ceiling)

Each person uploads their stream to every other person. Streams are capped at 640×480 @ 24 fps to keep a 4-way call viable on ordinary home upload speeds. Do not raise the cap and the head count at the same time.

## Deploy (one time, ~2 minutes)

Must be served over **HTTPS** (browser camera requirement):

1. **Netlify Drop**: rename to `index.html`, drag onto https://app.netlify.com/drop
2. **GitHub Pages**: commit as `index.html`, enable Pages.

## Limitations (accepted trade-offs)

- **No TURN server**: works on most home networks (STUN only). Strict/symmetric NATs (some mobile carriers, corporate networks) may fail. Fix: fill in the `ICE` constant at the top of the script (see `AIDEV-NOTE`).
- **Free PeerJS Cloud**: fine for personal use, not high traffic.
- **4 people max** by design. Beyond that you need a media server — use Jitsi instead.
- No recording, no chat, no accounts — on purpose.

## Config knobs (top of the script)

| Constant | Default | Meaning |
|---|---|---|
| `MAX_JOIN_RETRIES` | 8 | Room rejoin attempts before giving up |
| `MAX_CALL_RETRIES` | 5 | Per-peer media reconnect attempts |
| `RETRY_DELAY_MS` | 3000 | Delay between attempts |
| `MEDIA` | 640×480 @ 24 | Outgoing stream cap (mesh bandwidth) |
| `ICE` | `null` (PeerJS default STUN) | Add TURN here if needed |
