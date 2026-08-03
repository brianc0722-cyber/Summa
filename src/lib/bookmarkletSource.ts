/**
 * The complete Summa widget as a plain, dependency-free script.
 * This exact source becomes the draggable bookmarklet, the copy-paste
 * snippet, and the downloadable summarize.js file.
 *
 * Hardened to run on both parts of the product reliably:
 *  - Shadow DOM isolates the UI from any host page's CSS or JS.
 *  - No lookbehind regexes, so older Safari/Chrome still parse it.
 *  - Wrapped in try/catch: it can never break a host page or die silently.
 * NOTE: written without backticks so it can be minified into a javascript: URL.
 */
export const WIDGET_SOURCE = `(function () {
  "use strict";
  try {
    var ROOT_ID = "psum-root";
    var host = document.getElementById(ROOT_ID);
    if (host) {
      var prev = host.__psumPanel;
      if (prev) prev.style.display = prev.style.display === "none" ? "flex" : "none";
      return;
    }
    if (!document.body) return;

    var STOP = "a an and are as at be but by for from has have had he her his i if in into is it its of on or that the their there these they this to was we were what when which while who will with you your our us not no can could would should may might about over under after before between during".split(" ");
    var stopSet = {};
    for (var s = 0; s < STOP.length; s++) stopSet[STOP[s]] = true;

    function tokenize(text) {
      return text.toLowerCase().replace(/[^a-z0-9\\s]/g, " ").split(/\\s+/).filter(function (w) {
        return w.length > 2 && !stopSet[w];
      });
    }

    function sentences(text) {
      var t = text.replace(/\\s+/g, " ").trim();
      var parts = t.match(/[^.!?]*[.!?]+(?:\\s|$)|[^.!?]+$/g) || [];
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var one = parts[i].trim();
        if (one.split(" ").length >= 6) out.push(one);
      }
      return out;
    }

    function overlapRatio(a, bSet, bLen) {
      var shared = 0;
      for (var x = 0; x < a.length; x++) if (bSet[a[x]]) shared++;
      return shared / (Math.min(a.length, bLen) || 1);
    }

    function toSet(words) {
      var s = {};
      for (var x = 0; x < words.length; x++) s[words[x]] = 1;
      return s;
    }

    // Two-layer scan: the n main points, plus a full summary of every other
    // informative sentence that isn't redundant with them.
    function scan(text, n, title) {
      var list = sentences(text);
      if (!list.length) return { points: ["No readable text found on this page."], details: [], folded: 0 };
      if (list.length <= n) return { points: list, details: [], folded: 0 };

      var freq = {};
      tokenize(text).forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
      var titleWords = toSet(tokenize(title || ""));

      var maxScore = 1;
      var scored = list.map(function (sent, i) {
        var words = tokenize(sent);
        var uniq = [];
        var seen = {};
        for (var k = 0; k < words.length; k++) {
          if (!seen[words[k]]) { seen[words[k]] = 1; uniq.push(words[k]); }
        }
        var sum = 0;
        var titleHits = 0;
        for (var u = 0; u < uniq.length; u++) {
          sum += freq[uniq[u]] || 0;
          if (titleWords[uniq[u]]) titleHits++;
        }
        var score = sum / Math.sqrt(Math.max(uniq.length, 1));
        score *= 1 + 0.5 * Math.max(0, 1 - i / 10);
        if (/\d/.test(sent)) score *= 1.12;
        if (/^(however|therefore|overall|in short|in conclusion|as a result|the study|researchers|scientists|the report)/i.test(sent)) score *= 1.08;
        score *= 1 + Math.min(0.4, titleHits * 0.1);
        if (score > maxScore) maxScore = score;
        return { sent: sent, i: i, score: score, words: uniq };
      });

      var byScore = scored.slice().sort(function (a, b) { return b.score - a.score; });

      // Layer 1 — main points: greedy pick, skip near-duplicates.
      var points = [];
      for (var p = 0; p < byScore.length && points.length < n; p++) {
        var cand = byScore[p];
        var dup = false;
        for (var q = 0; q < points.length; q++) {
          if (overlapRatio(cand.words, points[q].set, points[q].words.length) > 0.55) { dup = true; break; }
        }
        if (!dup) { cand.set = toSet(cand.words); points.push(cand); }
      }
      if (!points.length) { points = byScore.slice(0, n); for (var s2 = 0; s2 < points.length; s2++) points[s2].set = toSet(points[s2].words); }

      // Layer 2 — full summary: everything else that is informative and
      // non-redundant with the points and with itself.
      var pickedIdx = {};
      for (var m = 0; m < points.length; m++) pickedIdx[points[m].i] = 1;

      var rest = [];
      for (var r = 0; r < byScore.length; r++) {
        var c = byScore[r];
        if (pickedIdx[c.i]) continue;
        if (c.words.length < 3 || c.score < maxScore * 0.28) continue; // filler
        var redundant = false;
        for (var pp = 0; pp < points.length; pp++) {
          if (overlapRatio(c.words, points[pp].set, points[pp].words.length) > 0.55) { redundant = true; break; }
        }
        if (redundant) continue;
        for (var d = 0; d < rest.length; d++) {
          if (overlapRatio(c.words, rest[d].set, rest[d].words.length) > 0.6) { redundant = true; break; }
        }
        if (!redundant) { c.set = toSet(c.words); rest.push(c); }
      }

      var folded = 0;
      if (rest.length > 14) { folded = rest.length - 14; rest = rest.slice(0, 14); }
      rest.sort(function (a, b) { return a.i - b.i; });
      points.sort(function (a, b) { return a.i - b.i; });

      return {
        points: points.map(function (o) { return o.sent; }),
        details: rest.map(function (o) { return o.sent; }),
        folded: folded
      };
    }

    function collect(doc) {
      var out = [];
      var root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      if (!root) return out;
      var nodes = root.querySelectorAll("h1, h2, h3, p, li, blockquote, td");
      for (var n = 0; n < nodes.length; n++) {
        var t = (nodes[n].textContent || "").trim();
        if (t.length > 20) out.push(t);
      }
      // SPA fallback: sites like Gmail/X have no semantic tags, so grab
      // leaf-ish text blocks when the semantic pass came up thin.
      if (out.join(" ").length < 200) {
        var divs = root.querySelectorAll("div");
        for (var d = 0; d < divs.length; d++) {
          var el = divs[d];
          if (el.querySelectorAll("div").length > 2) continue;
          var txt = (el.innerText || el.textContent || "").trim();
          if (txt.length > 120 && txt.length < 3000) out.push(txt);
        }
      }
      return out;
    }

    function extract() {
      var out = collect(document);
      // Gmail and other apps render content inside same-origin iframes;
      // cross-origin frames throw on access and are skipped safely.
      var frames = document.querySelectorAll("iframe");
      for (var f = 0; f < frames.length && f < 8; f++) {
        try {
          var fd = frames[f].contentDocument;
          if (fd && fd.body) {
            var ft = (fd.body.innerText || fd.body.textContent || "").trim();
            if (ft.length > 40) out.push(ft);
          }
        } catch (e) {}
      }
      return out.join(" ");
    }

    host = document.createElement("div");
    host.id = ROOT_ID;
    var mount = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;

    var style = document.createElement("style");
    style.textContent = [
      ":host{all:initial}",
      "#psum-btn{position:fixed;bottom:24px;right:24px;z-index:2147483646;width:56px;height:56px;border-radius:999px;background:#0f8a6d;color:#fff;border:none;cursor:pointer;box-shadow:0 10px 30px rgba(15,138,109,.4);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;font-family:system-ui,sans-serif}",
      "#psum-btn:hover{transform:scale(1.08);box-shadow:0 14px 38px rgba(15,138,109,.5)}",
      "#psum-btn svg{width:26px;height:26px}",
      "#psum-panel{position:fixed;bottom:96px;right:24px;z-index:2147483646;width:350px;max-width:calc(100vw - 32px);max-height:72vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 24px 64px rgba(12,26,22,.28);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;animation:psum-in .32s cubic-bezier(.2,.9,.3,1.15)}",
      "#psum-head{background:#0c1a16;color:#f1f3ee;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none}",
      "#psum-head b{font-size:13px;letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      "#psum-body{padding:14px 16px;overflow:auto}",
      "#psum-meta{font-size:11px;color:#6b7a74;margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap}",
      "#psum-meta span{background:#eef1ea;border-radius:999px;padding:2px 9px}",
      "#psum-text{font-size:14px;line-height:1.6;color:#25322d;margin:0}",
      "#psum-label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f8a6d;margin:0 0 10px}",
      "#psum-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}",
      "#psum-list li{display:flex;gap:9px;align-items:flex-start}",
      "#psum-list li span{flex:none;width:20px;height:20px;border-radius:6px;background:#0c1a16;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}",
      "#psum-list li p{margin:0;font-size:13px;line-height:1.55;color:#25322d}",
      "#psum-label2{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a86f1a;margin:16px 0 8px;border-top:1px solid #eef1ea;padding-top:14px}",
      "#psum-detail p{margin:0;font-size:13px;line-height:1.7;color:#3a4a44;text-align:justify}",
      "#psum-folded{margin:8px 0 0;font-size:11px;color:#6b7a74;font-style:italic}",
      "#psum-foot{display:flex;gap:8px;padding:10px 16px 14px;border-top:1px solid #eef1ea}",
      "#psum-foot button{flex:1;font-size:12px;font-weight:600;padding:8px 0;border-radius:9px;border:1px solid #dbe2da;background:#f7f9f5;color:#0c1a16;cursor:pointer;transition:background .15s}",
      "#psum-foot button:hover{background:#eef1ea}",
      "#psum-close{background:none;border:none;color:#f1f3ee;cursor:pointer;padding:2px;display:flex;flex:none}",
      "@keyframes psum-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}"
    ].join("");
    mount.appendChild(style);

    var btn = document.createElement("button");
    btn.id = "psum-btn";
    btn.title = "Summarize this page";
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="10" y2="17"/></svg>';

    var panel = document.createElement("div");
    panel.id = "psum-panel";
    panel.style.display = "none";
    host.__psumPanel = panel;

    function esc(str) { return String(str).replace(/</g, "&lt;"); }

    function render() {
      var text = extract();
      var words = text.trim() ? text.trim().split(/\\s+/).length : 0;
      var result = scan(text, 5, document.title);
      var pts = result.points;
      var details = result.details;
      var listHtml = "";
      for (var li = 0; li < pts.length; li++) {
        listHtml += "<li><span>" + (li + 1) + "</span><p>" + esc(pts[li]) + "</p></li>";
      }
      var detailHtml = "";
      if (details.length) {
        detailHtml = '<p id="psum-label2">Full summary \\u2014 the rest that matters</p>' +
          '<div id="psum-detail"><p>' + details.map(esc).join(" ") + "</p>" +
          (result.folded ? '<p id="psum-folded">+' + result.folded + " more supporting sentences folded in.</p>" : "") +
          "</div>";
      }
      panel.innerHTML =
        '<div id="psum-head"><b>SUMMA \\u00b7 ' + esc((document.title || "Untitled page").slice(0, 42)) + '</b>' +
        '<button id="psum-close" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
        '<div id="psum-body"><div id="psum-meta"><span>' + pts.length + ' main points</span><span>' + (details.length ? details.length + (result.folded ? "+" : "") + ' supporting' : '') + '</span><span>' + words + ' words</span><span>' + Math.max(1, Math.round(words / 220)) + ' min read</span></div>' +
        '<p id="psum-label">Scanned the page \\u2014 here is what matters</p>' +
        '<ol id="psum-list">' + listHtml + "</ol>" + detailHtml + "</div>" +
        '<div id="psum-foot"><button id="psum-copy">Copy</button><button id="psum-again">Rescan</button></div>';

      panel.querySelector("#psum-close").onclick = function () { panel.style.display = "none"; };
      panel.querySelector("#psum-again").onclick = render;
      panel.querySelector("#psum-copy").onclick = function () {
        var b = panel.querySelector("#psum-copy");
        var copied = "MAIN POINTS\\n";
        for (var ci = 0; ci < pts.length; ci++) copied += (ci + 1) + ". " + pts[ci] + "\\n";
        if (details.length) {
          copied += "\\nFULL SUMMARY\\n";
          for (var di = 0; di < details.length; di++) copied += details[di] + " ";
        }
        try { if (navigator.clipboard) navigator.clipboard.writeText(copied.trim()); } catch (e) {}
        b.textContent = "Copied!";
        setTimeout(function () { b.textContent = "Copy"; }, 1400);
      };

      var head = panel.querySelector("#psum-head");
      head.onmousedown = function (e) {
        if (e.target.closest && e.target.closest("#psum-close")) return;
        var sx = e.clientX, sy = e.clientY;
        var rect = panel.getBoundingClientRect();
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        function move(ev) {
          panel.style.left = Math.max(8, Math.min(window.innerWidth - 80, rect.left + ev.clientX - sx)) + "px";
          panel.style.top = Math.max(8, Math.min(window.innerHeight - 80, rect.top + ev.clientY - sy)) + "px";
        }
        function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      };
    }

    btn.onclick = function () {
      if (panel.style.display === "flex") { panel.style.display = "none"; return; }
      panel.style.display = "flex";
      panel.innerHTML = '<div id="psum-head"><b>SUMMA</b></div><div id="psum-body"><p id="psum-text" style="color:#6b7a74">Reading page\\u2026</p></div>';
      setTimeout(render, 350);
    };

    mount.appendChild(panel);
    mount.appendChild(btn);
    document.body.appendChild(host);
  } catch (err) {
    if (window.console && console.warn) console.warn("Summa:", err);
  }
})();`;

/**
 * Compact the source and encode it as a draggable javascript: bookmarklet URL.
 * The script is wrapped in void(...) so it ALWAYS evaluates to undefined —
 * otherwise browsers replace the host page with the script's return value,
 * blanking the article the user was trying to summarize.
 */
export function buildBookmarkletHref(): string {
  const compact = WIDGET_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return "javascript:" + encodeURIComponent("void " + compact);
}
