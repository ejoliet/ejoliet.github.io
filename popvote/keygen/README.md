# popvote licensing (local-only tooling)

Everything in this folder runs on the seller's machine. None of it ships to
guests or presenters, and none of it runs in CI.

## One-time setup

```bash
node popvote/keygen/generate-keypair.js
```

Writes `popvote/keys/private.pem` and `popvote/keys/public.pem` (both
gitignored — see the root `.gitignore`). Paste the printed base64 public key
into the `LICENSE_PUBLIC_KEY_B64` constant near the top of `popvote/index.html`.
Do this once per deployment; regenerating the keypair invalidates every
license already sold against the old public key.

## Selling a license

Lemon Squeezy is the merchant of record — it handles the actual payment and
checkout. After a sale notification (email, dashboard, or a webhook you wire
up later), mint that buyer a license:

```bash
node popvote/keygen/generate-license.js --holder "buyer@example.com"
# optional expiry:
node popvote/keygen/generate-license.js --holder "buyer@example.com" --exp 2027-07-14
```

This prints a license string. Send it to the buyer (email, order
confirmation, etc.). They paste it into popvote's "Enter license key" field,
which verifies the Ed25519 signature entirely offline in the browser using
the public key baked into `index.html` — no server round trip, no license
server to keep running.

## Format

A license string is `base64url(JSON payload) + "." + base64url(signature)`.
The payload is `{"holder": "...", "issued": <ms>, "exp"?: <ms>}`. The
signature is a raw 64-byte Ed25519 signature over the UTF-8 JSON payload
bytes, produced with `crypto.sign(null, payloadBytes, privateKey)` (Node's
built-in Ed25519 support — no digest algorithm parameter, per Node's API for
this curve).

## Never commit

- `popvote/keys/private.pem` (or any `.pem`) — gitignored at the repo root.
- Any license string you generate for testing or for a real buyer — it's a
  live, usable key. Keep test licenses in your shell history or a scratch
  file outside the repo, never in a commit.
