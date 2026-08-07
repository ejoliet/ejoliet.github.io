# MeshDrop

Zero-backend image replication over a WebRTC mesh.

MeshDrop is designed for friction-free onboarding: open a link in a browser, paste one small connection blob, and images replicate to every connected peer. Browser peers store data locally. Terminal peers store images in a default folder.

## What this prototype supports

- Static browser app: `web/index.html`
- No login, no database, no relay server
- Manual WebRTC signaling through copy/paste text blobs
- Browser-to-browser image replication
- Browser local persistence using `localStorage`
- Terminal client scaffold using Node.js and `werift`
- Terminal default storage folder: `~/MeshDropImages`
- Deduplication by SHA-256 hash
- Mesh gossip: every peer forwards images it receives to other connected peers

## Browser quick start

From this folder:

```bash
cd web
python3 -m http.server 8080
```

Open `http://localhost:8080` in two browser windows or two devices.

On device A:

1. Enter an alias.
2. Click `Create host offer`.
3. Copy the offer text.

On device B:

1. Paste the offer text into `Remote signal`.
2. Click `Join with offer`.
3. Copy the generated answer text.

Back on device A:

1. Paste the answer into `Remote signal`.
2. Click `Accept answer`.
3. Drop or select images. They replicate to connected peers.

## GitHub Pages

You can publish the `web/` folder directly with GitHub Pages. No backend is required.

## Terminal quick start

The terminal client is included as a practical bridge, but it requires Node dependencies because Node does not ship WebRTC natively.

```bash
cd terminal
npm install
node meshdrop-cli.js
```

The CLI stores images in `~/MeshDropImages` unless `MESHDROP_DIR` is set.

## Design notes

WebRTC is peer-to-peer for data transfer, but peers still need signaling. This prototype uses manual copy/paste signaling. A production version can add optional signaling transports such as QR code, email link, Bluetooth, LAN mDNS, or a tiny stateless relay. That relay would not store images.

Browser storage note: images are stored in `localStorage` as base64 for simplicity. This is intentional for the prototype but constrained by browser quota. For larger image sets, replace the storage layer with IndexedDB while keeping `localStorage` for settings and manifests.
