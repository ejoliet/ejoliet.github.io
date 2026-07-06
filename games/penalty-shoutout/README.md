# P2P Penalty

A GitHub Pages-ready, no-backend, two-player WebRTC penalty-kick micro game.

## Play

- Host / Goalkeeper clicks **Host / Goalkeeper** and sends the generated offer to the kicker.
- Kicker clicks **Join / Kicker**, pastes the offer, clicks **Accept pasted**, then sends the answer back.
- Host pastes the answer and clicks **Accept pasted**.
- Kicker drags to aim and releases to shoot. Goalkeeper drags or uses arrow keys.
- Score is stored in `localStorage`.
- **Practice** runs local kicker mode against a random AI keeper.

## Deploy to GitHub Pages

1. Create a repository.
2. Commit `index.html` and `README.md`.
3. Settings → Pages → Deploy from branch → `main` / root.

## Size

The playable game is a single `index.html`. The packaged game ZIP is checked with `zip -9`.

## Notes

This uses a tiny custom canvas loop rather than an external engine so the WebRTC pairing UI and gameplay stay close to js13k-style constraints.
