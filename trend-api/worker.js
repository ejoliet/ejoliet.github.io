// trend-api — Cloudflare Worker
// Fetches GitHub Trending (repos + developers) server-side (no CORS limit),
// parses the HTML, and returns JSON with CORS headers so the static page at
// https://ejoliet.github.io/trend/ can refresh live in any visitor's browser.
//
// Endpoints:
//   GET /            -> { fetchedAt, repos: [...], developers: [...] }
//   GET /repos       -> { fetchedAt, repos: [...] }
//   GET /developers  -> { fetchedAt, developers: [...] }
// Responses are edge-cached for 5 minutes so a burst of visitors does not
// hammer github.com.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function clean(s) {
  if (!s) return "";
  return decodeEntities(s.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function toInt(s) {
  if (!s) return null;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

export function parseRepos(html) {
  const articles = html.split('<article class="Box-row"').slice(1);
  const repos = [];
  for (const a of articles) {
    const h2 = a.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!h2) continue;
    // Repo full name lives in the h2 link text: "owner / repo"
    const full = clean(h2[1]).replace(/\s+/g, "");
    const slash = full.indexOf("/");
    if (slash < 1) continue;
    const owner = full.slice(0, slash);
    const name = full.slice(slash + 1);
    if (!owner || !name || owner === "sponsors") continue;
    const descM = a.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const langM = a.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
    const starsM = a.match(/\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/);
    const forksM = a.match(/\/forks"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/);
    const todayM = a.match(/([\d,]+) stars today/);
    repos.push({
      owner,
      name,
      fullName: `${owner}/${name}`,
      url: `https://github.com/${owner}/${name}`,
      description: descM ? clean(descM[1]) : "",
      language: langM ? langM[1].trim() : null,
      stars: toInt(starsM && starsM[1]),
      forks: toInt(forksM && forksM[1]),
      starsToday: toInt(todayM && todayM[1]),
    });
  }
  return repos;
}

export function parseDevelopers(html) {
  const articles = html.split('<article class="Box-row d-flex"').slice(1);
  const devs = [];
  for (const a of articles) {
    const idM = a.match(/id="pa-([^"]+)"/);
    if (!idM) continue;
    const username = idM[1];
    const nameM = a.match(/<h1 class="h3[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const avatarM = a.match(/<img[^>]+src="([^"]+)"/);
    // Popular repo: nested <article> block
    const repoLinkM = a.match(/<h1 class="h4[^"]*"[^>]*>\s*<a[^>]+href="\/[^"]+\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const repoDescM = a.match(/<h1 class="h4[\s\S]*?<\/h1>\s*<div class="f6[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    devs.push({
      username,
      name: nameM ? clean(nameM[1]) : username,
      url: `https://github.com/${username}`,
      avatar: avatarM ? decodeEntities(avatarM[1]) : null,
      popularRepo: repoLinkM
        ? {
            name: clean(repoLinkM[2]),
            url: `https://github.com/${username}/${repoLinkM[1]}`,
            description: repoDescM ? clean(repoDescM[1]) : "",
          }
        : null,
    });
  }
  return devs;
}

async function fetchTrending(path) {
  const res = await fetch(`https://github.com${path}`, {
    headers: { "User-Agent": "trend-api-worker (https://ejoliet.github.io/trend/)" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`github.com${path} returned ${res.status}`);
  return res.text();
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      const fetchedAt = new Date().toISOString();
      let body;
      if (path === "/repos") {
        body = { fetchedAt, repos: parseRepos(await fetchTrending("/trending")) };
      } else if (path === "/developers") {
        body = { fetchedAt, developers: parseDevelopers(await fetchTrending("/trending/developers")) };
      } else if (path === "/") {
        const [reposHtml, devsHtml] = await Promise.all([
          fetchTrending("/trending"),
          fetchTrending("/trending/developers"),
        ]);
        body = {
          fetchedAt,
          repos: parseRepos(reposHtml),
          developers: parseDevelopers(devsHtml),
        };
      } else {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      if ((!body.repos || body.repos.length === 0) && (!body.developers || body.developers.length === 0)) {
        throw new Error("parsed 0 items — GitHub markup may have changed");
      }
      return new Response(JSON.stringify(body), {
        headers: {
          ...CORS,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err && err.message || err) }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  },
};
