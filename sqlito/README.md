# SQLite Atlas

A static, local-first SQLite database explorer that runs SQLite in the browser through WebAssembly.

## Features

- Drag/drop a `.sqlite`, `.sqlite3`, `.db`, or `.db3` file.
- Pick a single file or import a folder.
- Load a remote SQLite file by URL when the host permits CORS.
- Browse tables/views, columns, primary keys, nullability, row counts and sample rows.
- Run arbitrary SQLite queries in-browser.
- Export the currently previewed table rows to CSV.
- Built-in demo database for instant exploration.
- No backend. Local files are not uploaded anywhere.

## Run locally

Browsers generally block WebAssembly when opened directly with `file://`, so serve the directory:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy

This directory is static and can be deployed directly to GitHub Pages, Cloudflare Pages, Netlify, Vercel static hosting, S3, or any ordinary web server.

## Remote database URLs

The remote server must permit browser cross-origin requests (CORS). This implementation downloads the full SQLite file before opening it. For multi-gigabyte databases, add an HTTP Range-request virtual filesystem such as `sql.js-httpvfs` instead.

## Runtime

The page loads the `sql.js` JavaScript/WebAssembly runtime from the official `sql.js.org` distribution. To make the app fully offline, vendor `sql-wasm.js` and `sql-wasm.wasm` beside the app and update the two paths in `index.html` and `app.js`.
