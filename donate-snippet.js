/*!
 * donate-snippet.js — zero-backend donation button via Stripe Payment Link.
 *
 * Works anywhere, including inside iframes: it opens the Stripe-hosted
 * checkout page in a NEW TAB. Apple Pay / Google Pay / cards are shown
 * automatically by Stripe on that page — no app, no SDK, no Apple Pay
 * domain verification, no server.
 *
 * Setup (once, in Stripe Dashboard):
 *   Payment Links → New → "Customers choose what to pay"
 *   → set Minimum = $10 (preset $10 suggested)
 *   → Advanced options → call to action = "Donate"
 *   → copy the https://buy.stripe.com/... URL below or into data-link.
 *
 * Usage:
 *   <script src="donate-snippet.js"
 *           data-link="https://buy.stripe.com/XXXX"
 *           data-label="♥ Support this tool"
 *           data-position="bottom-right"></script>
 *
 * Or inline the whole file in a <script> tag and edit DEFAULTS.
 * If the host iframe is sandboxed, it needs: sandbox="allow-popups
 * allow-popups-to-escape-sandbox" (plus allow-scripts, obviously).
 */
(function () {
  "use strict";

  var DEFAULTS = {
    link: "https://donate.stripe.com/6oU00j9Ta2V5fXC35d2VG00", // AIDEV-CONFIG: Payment Link
    label: "\u2665 Donate \u2013 support development",
    position: "bottom-right", // bottom-right | bottom-left | inline
    id: "donate-snippet-btn"
  };

  // Read config from this <script> tag's data-* attributes, if present.
  var cfg = Object.assign({}, DEFAULTS);
  var me = document.currentScript;
  if (me && me.dataset) {
    if (me.dataset.link) cfg.link = me.dataset.link;
    if (me.dataset.label) cfg.label = me.dataset.label;
    if (me.dataset.position) cfg.position = me.dataset.position;
  }

  function init() {
    if (document.getElementById(cfg.id)) return; // idempotent

    // Use a real <a>, not window.open(): survives popup blockers and
    // sandboxed iframes better, and needs no JS click handler at all.
    var a = document.createElement("a");
    a.id = cfg.id;
    a.href = cfg.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = cfg.label;
    a.setAttribute("aria-label", "Donate via Stripe (minimum $10)");

    var base =
      "display:inline-block;padding:10px 16px;border-radius:999px;" +
      "background:#635bff;color:#fff;font:600 14px/1 system-ui,sans-serif;" +
      "text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.25);" +
      "cursor:pointer;z-index:2147483647;";

    if (cfg.position === "inline") {
      a.style.cssText = base;
      (me && me.parentNode ? me.parentNode : document.body)
        .insertBefore(a, me ? me.nextSibling : null);
    } else {
      var side = cfg.position === "bottom-left" ? "left:16px;" : "right:16px;";
      a.style.cssText = base + "position:fixed;bottom:16px;" + side;
      document.body.appendChild(a);
    }

    a.addEventListener("mouseenter", function () { a.style.opacity = "0.85"; });
    a.addEventListener("mouseleave", function () { a.style.opacity = "1"; });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
