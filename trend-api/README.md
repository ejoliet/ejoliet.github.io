# trend-api — Cloudflare Worker for HN & GitHub Trending

The static page at https://ejoliet.github.io/trend/ cannot fetch
github.com/trending directly from a visitor's browser: GitHub sends no CORS
headers for that page and offers no trending API. This tiny Worker does the
fetch server-side, parses the trending HTML, and returns JSON with
`Access-Control-Allow-Origin: *`.

Endpoints: `/` (repos + developers), `/repos`, `/developers`.
Responses are edge-cached for 5 minutes.

## Deploy (one time, ~3 minutes, free tier)

Option A — dashboard (no installs):

1. Cloudflare dashboard → Workers & Pages → Create → Worker → name it `trend-api` → Deploy.
2. Edit code: delete the starter code, paste in `worker.js` from this folder → Deploy.
3. Settings → Domains & Routes → Add → Custom Domain → `trend-api.626733.xyz`.

Option B — wrangler:

```sh
npx wrangler login
npx wrangler deploy   # from this folder, using wrangler.toml
# then attach the custom domain as in A3
```

The page calls `https://trend-api.626733.xyz/` by default. A different
endpoint can be supplied without editing the page: `?api=<worker-url>`
(it is then remembered in localStorage).

## Verified

2026-11-26: the parsing code in `worker.js` was run live against
github.com/trending and github.com/trending/developers — 16/16 repositories
with stars/forks/stars-today, 25/25 developers with popular repos
(2 developers legitimately show no popular-repo block on GitHub itself).
