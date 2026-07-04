# Family Video Call

One HTML file. Browser-to-browser video call over WebRTC. No install, no account, no server code of your own.

## How it works

- **You** open the page → press **Start** → get a link.
- **Dad** taps the link → presses **Start the call** → connected.
- Video and audio go **direct peer-to-peer** (WebRTC, encrypted by default with DTLS-SRTP).
- Only the initial handshake uses the free public [PeerJS Cloud](https://peerjs.com/peerserver) signaling server. No media passes through it.
- If the call drops, Dad's side retries automatically: **8 attempts, 3 seconds apart**, then shows one big **Try again** button. Your side keeps waiting on the same link.

## Deploy (one time, ~2 minutes)

The page must be served over **HTTPS** (browsers require it for camera access). Pick one:

1. **Netlify Drop** (easiest): go to https://app.netlify.com/drop and drag `video-call.html` in. Rename it `index.html` first for a cleaner URL.
2. **GitHub Pages**: put the file in a repo as `index.html`, enable Pages.

Then bookmark your URL. Send `https://your-site/?call=...` links from the app itself (Copy or Share button).

## Limitations (accepted trade-offs)

- **No TURN server**: works on most home networks (STUN only). If both sides are behind strict/symmetric NAT (some mobile carriers, corporate networks), the call may fail. Fix: add a TURN server in the `ICE` constant at the top of the script (see `AIDEV-NOTE` there).
- **Free PeerJS Cloud**: fine for personal use; not for high traffic.
- **New link per session**: the host gets a fresh room ID each time it starts. If you (host) reload, send a new link.
- **2 people only**. No recording, no chat, no accounts — on purpose.

## Config knobs (top of the script)

| Constant | Default | Meaning |
|---|---|---|
| `MAX_RETRIES` | 8 | Guest reconnect attempts before giving up |
| `RETRY_DELAY_MS` | 3000 | Delay between attempts |
| `ICE` | `null` (PeerJS default STUN) | Add TURN here if needed |
