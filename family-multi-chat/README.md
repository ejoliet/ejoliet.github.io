# Family Video Call (mesh, 2–4 people)

One HTML file. Browser-to-browser group video call over WebRTC. No install, no account, no server code of your own.

## In-call features

- **Send photo/file** — pictures and documents go directly peer-to-peer over the same encrypted data channels (never through a server). Images show as tappable thumbnails, documents as download links, in a tray above the buttons. Files up to 25 MB; the sender uploads one copy per participant (mesh).
- **Big files (over 25 MB)** — the app guides you to [Wormhole](https://wormhole.app) (end-to-end encrypted, no account, up to 10 GB): upload there once, paste the link back, and it lands in everyone's tray — including people who join the call later. Downloads work even after the call ends; the link expires after 24 h. Only the link travels through the call's data channels, and the decryption key stays in the URL fragment.
- **Share screen** — desktop browsers only (Chrome, Edge, Firefox, Safari on macOS); phones/tablets can watch but not share (platform limitation, the button is hidden there). Sent sharp but at low frame rate so text stays readable without extra bandwidth.
- **Flip camera** — switch between front and back camera mid-call (shown only when the device has more than one camera). Uses `replaceTrack`, so the call is never interrupted.

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
- No recording, no text chat, no accounts — on purpose.
- Directly shared files are not stored anywhere: only people in the call when a file is sent receive it, and it lives only in their browser tab. Big files handed off to Wormhole are stored there encrypted until the link expires (24 h).

## Config knobs (top of the script)

| Constant | Default | Meaning |
|---|---|---|
| `MAX_JOIN_RETRIES` | 8 | Room rejoin attempts before giving up |
| `MAX_CALL_RETRIES` | 5 | Per-peer media reconnect attempts |
| `RETRY_DELAY_MS` | 3000 | Delay between attempts |
| `MEDIA` | 640×480 @ 24 | Outgoing camera stream cap (mesh bandwidth) |
| `SCREEN_MEDIA` | ≤1920 wide @ 5 fps | Screen-share cap: sharp but slow, similar bandwidth to camera |
| `MAX_FILE_MB` | 25 | Per-file size cap for direct photo/document sharing |
| `BIG_FILE_URL` | `https://wormhole.app` | E2EE expiring-link service offered for bigger files |
| `ICE` | `null` (PeerJS default STUN) | Add TURN here if needed |
