# MotoTilt 13k

Mobile-first MotoGP-style micro racer for js13k-style constraints.

## Run

Open `index.html` directly, or serve it from GitHub Pages.

## Controls

- Hold/touch screen: accelerate
- Tilt phone left/right: steer
- Drag left/right: fallback steering
- `enable tilt`: requests iOS/Android motion permission where required
- `p2p`: opens manual WebRTC signaling

## P2P flow

1. Player A taps `p2p`, then `host`.
2. Player A sends the generated host code to Player B.
3. Player B taps `p2p`, pastes host code, taps `join`.
4. Player B sends the generated answer code to Player A.
5. Player A pastes answer code and taps `accept`.

No server is used. The code exchange is the signaling layer.

## Size

- `index.html`: ~7.3 KB uncompressed
- `mototilt13k.zip`: ~3.5 KB compressed

## Design notes

- Native Canvas 2D instead of a bundled engine to preserve bytes.
- Procedural pseudo-3D road, no image assets.
- Smooth floating opponent labels and rank tags rather than sticky edge markers.
- WebRTC DataChannel shares compact rider state only.
