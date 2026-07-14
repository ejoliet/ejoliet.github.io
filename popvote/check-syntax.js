#!/usr/bin/env node
// Node syntax check for popvote/index.html's inline <script> — extracts the
// app script (same logic test/helpers/load-app.js uses to find it) and runs
// it through `node --check` via vm.Script, so a syntax error fails CI loudly
// instead of only surfacing when a browser tries to parse it.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const indexPath = path.join(__dirname, "index.html");
const html = fs.readFileSync(indexPath, "utf8");
const start = html.indexOf('<script>\n"use strict";');
const end = html.indexOf("</script>", start);
if (start === -1 || end === -1){
  console.error("check-syntax: could not locate the inline app <script> block in index.html");
  process.exit(1);
}
const script = html.slice(start + "<script>".length, end);

try{
  new vm.Script(script, { filename: "popvote/index.html (inline script)" });
  console.log("popvote/index.html inline script: syntax OK");
}catch(e){
  console.error("popvote/index.html inline script has a syntax error:");
  console.error(e.message);
  process.exit(1);
}
