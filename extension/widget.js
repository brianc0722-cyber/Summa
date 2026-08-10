// Summa page scanner — injected by the extension (or run as a bookmarklet).
// Scans the current page and shows 5 main points + a full non-redundant
// summary in an isolated floating panel. Runs entirely locally.
//
// Content-type profiles tune the scanner to what it's reading:
//   article  — classic news/blog weighting (lead paragraphs matter most)
//   email    — shorter sentences, action/request words boosted, ending weighted
//   visual   — sparse text tolerated, image alt text and captions pulled in
//   docs     — reference material: more supporting sentences kept
//   thread   — fragmented social posts, weak lead bias
(function () {
  "use strict";
  try {
    var ROOT_ID = "psum-root";
    var host = document.getElementById(ROOT_ID);
    if (host) {
      var prev = host.__psumPanel;
      if (prev) {
        prev.style.display = prev.style.display === "none" ? "flex" : "none";
        if (prev.style.display === "flex" && host.__psumRender) host.__psumRender();
      }
      return;
    }
    if (!document.body) {
      alert("Summa: page not ready yet — try again in a second.");
      return;
    }

    var STOP = "a an and are as at be but by for from has have had he her his i if in into is it its of on or that the their there these they this to was we were what when which while who will with you your our us not no can could would should may might about over under after before between during".split(" ");
    var stopSet = {};
    for (var s = 0; s < STOP.length; s++) stopSet[STOP[s]] = true;

    function tokenize(text) {
      return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(function (w) {
        return w.length > 2 && !stopSet[w];
      });
    }

    function sentences(text, minWords) {
      var t = text.replace(/\s+/g, " ").trim();
      var parts = t.match(/[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var one = parts[i].trim();
        if (one.split(" ").length >= minWords) out.push(one);
      }
      return out;
    }

    function toSet(words) {
      var s = {};
      for (var x = 0; x < words.length; x++) s[words[x]] = 1;
      return s;
    }

    function overlapRatio(a, bSet, bLen) {
      var shared = 0;
      for (var x = 0; x < a.length; x++) if (bSet[a[x]]) shared++;
      return shared / (Math.min(a.length, bLen) || 1);
    }

    var PROFILES = {
      article: { minWords: 6, minBlock: 20, lead: 0.5, end: 0, action: 1, alt: false, maxSupport: 14 },
      email:   { minWords: 4, minBlock: 10, lead: 0.25, end: 0.35, action: 1.2, alt: false, maxSupport: 8 },
      visual:  { minWords: 4, minBlock: 8, lead: 0.2, end: 0, action: 1, alt: true, maxSupport: 10 },
      docs:    { minWords: 6, minBlock: 16, lead: 0.45, end: 0, action: 1, alt: false, maxSupport: 16 },
      thread:  { minWords: 4, minBlock: 10, lead: 0.15, end: 0.1, action: 1, alt: false, maxSupport: 12 }
    };
    var TYPE_LABEL = {
      article: "Article", email: "Email", visual: "Image-heavy page",
      docs: "Documentation", thread: "Social / thread"
    };
    var ACTION_RE = /(please|kindly|attached|attachment|let me know|deadline|asap|regards|thank you|thanks|schedule|confirm|review|approve|reply|respond|by (monday|tuesday|wednesday|thursday|friday|tomorrow|eod|cob))/i;

    function guessType() {
      try {
        var h = location.hostname || "";
        if (/mail\.google\.com|outlook\.live\.com|mail\.yahoo\.com|fastmail\.com/.test(h)) return "email";
        var frames = document.querySelectorAll("iframe");
        for (var i = 0; i < frames.length; i++) {
          if (/mail|messageview/i.test(frames[i].src || "")) return "email";
        }
        var textLen = (document.body.innerText || "").length;
        var imgs = document.images ? document.images.length : 0;
        if (textLen < 1200 && imgs >= 4) return "visual";
        if (imgs >= 8 && textLen / Math.max(1, imgs) < 400) return "visual";
        if (/docs\.|documentation|developer\.|wiki|support\./.test(h)) return "docs";
        if (/twitter\.com|x\.com|reddit\.com|threads\.net|news\.ycombinator\.com/.test(h)) return "thread";
      } catch (e) {}
      return "article";
    }

    // Two-layer scan: the n main points, then every other informative,
    // non-redundant sentence as the full summary.
    function scan(text, n, title, pr) {
      var list = sentences(text, pr.minWords);
      if (!list.length) return { points: ["No readable text found on this page."], details: [], folded: 0 };
      if (list.length <= n) return { points: list, details: [], folded: 0 };

      var freq = {};
      tokenize(text).forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
      var titleWords = toSet(tokenize(title || ""));
      var total = list.length;

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
        if (pr.lead) score *= 1 + pr.lead * Math.max(0, 1 - i / 10);
        if (pr.end) score *= 1 + pr.end * Math.max(0, 1 - (total - 1 - i) / 6);
        if (/\d/.test(sent)) score *= 1.12;
        if (/^(however|therefore|overall|in short|in conclusion|as a result|the study|researchers|scientists|the report)/i.test(sent)) score *= 1.08;
        if (pr.action !== 1 && ACTION_RE.test(sent)) score *= pr.action;
        score *= 1 + Math.min(0.4, titleHits * 0.1);
        if (score > maxScore) maxScore = score;
        return { sent: sent, i: i, score: score, words: uniq, set: toSet(uniq) };
      });

      var byScore = scored.slice().sort(function (a, b) { return b.score - a.score; });

      var points = [];
      for (var p = 0; p < byScore.length && points.length < n; p++) {
        var cand = byScore[p];
        var dup = false;
        for (var q = 0; q < points.length; q++) {
          if (overlapRatio(cand.words, points[q].set, points[q].words.length) > 0.55) { dup = true; break; }
        }
        if (!dup) points.push(cand);
      }
      if (!points.length) points = byScore.slice(0, n);

      var pickedIdx = {};
      for (var m = 0; m < points.length; m++) pickedIdx[points[m].i] = 1;

      var rest = [];
      for (var r = 0; r < byScore.length; r++) {
        var c = byScore[r];
        if (pickedIdx[c.i]) continue;
        if (c.words.length < 3 || c.score < maxScore * 0.28) continue;
        var redundant = false;
        for (var pp = 0; pp < points.length; pp++) {
          if (overlapRatio(c.words, points[pp].set, points[pp].words.length) > 0.55) { redundant = true; break; }
        }
        if (redundant) continue;
        for (var d = 0; d < rest.length; d++) {
          if (overlapRatio(c.words, rest[d].set, rest[d].words.length) > 0.6) { redundant = true; break; }
        }
        if (!redundant) rest.push(c);
      }

      var folded = 0;
      if (rest.length > pr.maxSupport) { folded = rest.length - pr.maxSupport; rest = rest.slice(0, pr.maxSupport); }
      rest.sort(function (a, b) { return a.i - b.i; });
      points.sort(function (a, b) { return a.i - b.i; });

      return {
        points: points.map(function (o) { return o.sent; }),
        details: rest.map(function (o) { return o.sent; }),
        folded: folded
      };
    }

    // Scope "article": focused behavior — article/main region only.
    function collectArticle(doc, minBlock) {
      var out = [];
      var root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      if (!root) return out;
      var nodes = root.querySelectorAll("h1, h2, h3, p, li, blockquote, td");
      for (var n = 0; n < nodes.length; n++) {
        var t = (nodes[n].textContent || "").trim();
        if (t.length > minBlock) out.push(t);
      }
      if (out.join(" ").length < 200) {
        var divs = root.querySelectorAll("div");
        for (var d = 0; d < divs.length; d++) {
          var el = divs[d];
          if (el.querySelectorAll("div").length > 2) continue;
          var txt = (el.innerText || el.textContent || "").trim();
          if (txt.length > minBlock * 4 && txt.length < 3000) out.push(txt);
        }
      }
      return out;
    }

    // Scope "page": whole document minus chrome.
    function collectWhole(doc, minBlock) {
      var out = [];
      var seen = {};
      var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, NAV: 1, FOOTER: 1, ASIDE: 1, FORM: 1, BUTTON: 1, SELECT: 1, INPUT: 1, TEXTAREA: 1, DIALOG: 1, TEMPLATE: 1, OBJECT: 1, EMBED: 1 };
      var HEAD = { H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };
      var SEM = { P: 1, LI: 1, BLOCKQUOTE: 1, TD: 1, TH: 1, DD: 1, DT: 1, FIGCAPTION: 1 };
      function push(t, min) {
        t = (t || "").replace(/\s+/g, " ").trim();
        if (t.length >= min && !seen[t]) { seen[t] = 1; out.push(t); }
      }
      function walk(el) {
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
          var tag = c.tagName;
          if (SKIP[tag]) continue;
          if (c.getAttribute && c.getAttribute("aria-hidden") === "true") continue;
          if (HEAD[tag]) { push(c.innerText || c.textContent, 8); continue; }
          if (SEM[tag]) { push(c.innerText || c.textContent, minBlock); continue; }
          if (!c.querySelector("p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th")) {
            push(c.innerText || c.textContent, Math.max(40, minBlock * 3));
            continue;
          }
          walk(c);
        }
      }
      if (doc.body) walk(doc.body);
      return out;
    }

    function extract(scope, pr) {
      var out = scope === "article" ? collectArticle(document, pr.minBlock) : collectWhole(document, pr.minBlock);
      if (pr.alt) {
        var alts = document.querySelectorAll("img[alt], figcaption");
        for (var a = 0; a < alts.length; a++) {
          var el = alts[a];
          var t = (el.tagName === "IMG" ? "Image: " : "") + (el.alt || el.textContent || "").trim();
          if (t.length > 15) out.push(t);
        }
      }
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
      "#psum-btn{position:fixed;bottom:24px;right:24px;z-index:2147483646;width:60px;height:60px;border-radius:999px;background:#0f8a6d;color:#fff;border:3px solid #fff;cursor:pointer;box-shadow:0 10px 30px rgba(15,138,109,.55),0 0 0 6px rgba(15,138,109,.18);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;font-family:system-ui,sans-serif;animation:psum-bounce .55s cubic-bezier(.2,1.6,.4,1)}",
      "@keyframes psum-bounce{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}",
      "#psum-btn svg{width:26px;height:26px}",
      "#psum-panel{position:fixed;bottom:96px;right:24px;z-index:2147483646;width:370px;max-width:calc(100vw - 32px);max-height:78vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 24px 64px rgba(12,26,22,.28);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;animation:psum-in .32s cubic-bezier(.2,.9,.3,1.15)}",
      "#psum-head{background:#0c1a16;color:#f1f3ee;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none}",
      "#psum-head b{font-size:13px;letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      "#psum-body{padding:14px 16px;overflow:auto}",
      "#psum-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}",
      "#psum-scope{display:flex;gap:6px}",
      "#psum-scope button{font-size:11px;font-weight:700;padding:4px 11px;border-radius:999px;border:1px solid #dbe2da;background:#f7f9f5;color:#6b7a74;cursor:pointer;transition:all .15s}",
      "#psum-scope button:hover{border-color:#0f8a6d;color:#0f8a6d}",
      "#psum-scope button.on{background:#0c1a16;color:#fff;border-color:#0c1a16}",
      "#psum-sel{margin-left:auto;font-size:11px;font-weight:700;padding:4px 8px;border-radius:8px;border:1px solid #dbe2da;background:#f7f9f5;color:#0c1a16;cursor:pointer;max-width:160px}",
      "#psum-sel:hover{border-color:#0f8a6d}",
      "#psum-urlrow{display:none;gap:6px;margin-bottom:10px}",
      "#psum-urlrow.open{display:flex}",
      "#psum-url{flex:1;min-width:0;font-size:12px;padding:6px 9px;border-radius:8px;border:1px solid #dbe2da;background:#fff;color:#0c1a16;outline:none;font-family:inherit}",
      "#psum-url:focus{border-color:#0f8a6d}",
      "#psum-go{font-size:11px;font-weight:800;padding:6px 12px;border-radius:8px;border:none;background:#0f8a6d;color:#fff;cursor:pointer;flex:none}",
      "#psum-go:hover{background:#0a5c49}",
      "#psum-labelrow{display:flex;align-items:center;gap:8px;margin-bottom:10px}",
      "#psum-labelrow #psum-label{margin:0;flex:1}",
      "#psum-urlback{font-size:10px;font-weight:800;border:none;background:none;color:#0f8a6d;cursor:pointer;padding:2px 4px;flex:none}",
      "#psum-urlback:hover{text-decoration:underline}",
      "#psum-meta{font-size:11px;color:#6b7a74;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap}",
      "#psum-meta span{background:#eef1ea;border-radius:999px;padding:2px 9px}",
      "#psum-meta span.type{background:#0f8a6d;color:#fff;font-weight:700}",
      "#psum-label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f8a6d;margin:0 0 10px}",
      "#psum-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}",
      "#psum-list li{display:flex;gap:9px;align-items:flex-start}",
      "#psum-list li span{flex:none;width:20px;height:20px;border-radius:6px;background:#0c1a16;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}",
      "#psum-list li p{margin:0;font-size:13px;line-height:1.55;color:#25322d}",
      "#psum-label2{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a86f1a;margin:16px 0 8px;border-top:1px solid #eef1ea;padding-top:14px}",
      "#psum-detail p{margin:0;font-size:13px;line-height:1.7;color:#3a4a44}",
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

    function hostLabel(href) {
      try { return new URL(href).hostname.replace(/^www\./, ""); } catch (e) { return href; }
    }

    // Fetch any URL (extension host permissions exempt us from page CSP),
    // parse it in a detached document, and scan that instead of the page.
    function startFetch() {
      var inp = panel.querySelector("#psum-url");
      var url = ((inp && inp.value) || "").trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      host.__psumUrlDraft = url;
      var body = panel.querySelector("#psum-body");
      if (body) body.innerHTML = '<p style="color:#6b7a74;font-size:13px;margin:0">Fetching ' + esc(hostLabel(url)) + "…</p>";
      var t = host.__psumType || "auto";
      var pr = PROFILES[t === "auto" ? guessType() : t] || PROFILES.article;
      fetch(url, { credentials: "omit" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        host.__psumUrl = {
          text: collectWhole(doc, pr.minBlock).join(" "),
          title: doc.title || url,
          href: url
        };
        host.__psumUrlRowOpen = false;
        render();
      }).catch(function (err) {
        if (body) body.innerHTML = '<p style="color:#b3402f;font-size:13px;line-height:1.5;margin:0">Couldn’t fetch that page (' +
          esc((err && err.message) || "blocked") + "). Some sites refuse cross-site requests or need a login — open the page itself and scan it normally instead.</p>";
      });
    }

    var TYPE_OPTIONS = [
      ["auto", "Auto (guess)"],
      ["article", "Article / blog post"],
      ["email", "Email / message"],
      ["visual", "Image-heavy page"],
      ["docs", "Documentation / reference"],
      ["thread", "Social post / thread"]
    ];

    function render() {
      var scope = host.__psumScope || "page";
      var chosen = host.__psumType || "auto";
      var resolved = chosen === "auto" ? guessType() : chosen;
      var pr = PROFILES[resolved] || PROFILES.article;

      var text, scanTitle;
      if (host.__psumUrl) {
        text = host.__psumUrl.text;
        scanTitle = host.__psumUrl.title;
      } else {
        text = extract(scope, pr);
        scanTitle = document.title;
      }
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      var result = scan(text, 5, scanTitle, pr);
      var pts = result.points;
      var details = result.details;

      var opts = "";
      for (var oi = 0; oi < TYPE_OPTIONS.length; oi++) {
        opts += '<option value="' + TYPE_OPTIONS[oi][0] + '"' +
          (chosen === TYPE_OPTIONS[oi][0] ? " selected" : "") + ">" +
          TYPE_OPTIONS[oi][1] + "</option>";
      }

      var listHtml = "";
      for (var li = 0; li < pts.length; li++) {
        listHtml += "<li><span>" + (li + 1) + "</span><p>" + esc(pts[li]) + "</p></li>";
      }
      var detailHtml = "";
      if (details.length) {
        detailHtml = '<p id="psum-label2">Full summary — the rest that matters</p>' +
          '<div id="psum-detail"><p>' + details.map(esc).join(" ") + "</p>" +
          (result.folded ? '<p id="psum-folded">+' + result.folded + " more supporting sentences folded in.</p>" : "") +
          "</div>";
      }
      panel.innerHTML =
        '<div id="psum-head"><b>SUMMA · ' + esc((document.title || "Untitled page").slice(0, 42)) + '</b>' +
        '<button id="psum-close" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
        '<div id="psum-body">' +
        '<div id="psum-controls">' +
        '<div id="psum-scope" role="group" aria-label="Scan scope">' +
        '<button data-s="page" class="' + (scope === "page" && !host.__psumUrl ? "on" : "") + '" title="Scan the entire page">Entire page</button>' +
        '<button data-s="article" class="' + (scope === "article" && !host.__psumUrl ? "on" : "") + '" title="Scan only the main article region">Article only</button>' +
        '<button id="psum-urltoggle" class="' + (host.__psumUrl ? "on" : "") + '" title="Summarize any URL">From URL</button></div>' +
        '<select id="psum-sel" title="Content type">' + opts + "</select></div>" +
        '<div id="psum-urlrow' + (host.__psumUrlRowOpen ? " open" : "") + '"><input id="psum-url" type="url" placeholder="Paste any https:// link and press Fetch" value="' + esc(host.__psumUrlDraft || "") + '"><button id="psum-go">Fetch</button></div>' +
        '<div id="psum-meta"><span class="type">' + TYPE_LABEL[resolved] + (chosen === "auto" ? " · auto" : "") + "</span><span>" + pts.length + " main points</span>" +
        (details.length ? '<span>' + details.length + (result.folded ? "+" : "") + " supporting</span>" : "") +
        '<span>' + words + ' words</span><span>' + Math.max(1, Math.round(words / 220)) + ' min read</span></div>' +
        '<div id="psum-labelrow"><p id="psum-label">' +
        (host.__psumUrl ? "Summary of " + esc(hostLabel(host.__psumUrl.href)) : (scope === "page" ? "Whole page scanned — here is what matters" : "Article scanned — here is what matters")) +
        "</p>" + (host.__psumUrl ? '<button id="psum-urlback">← back to this page</button>' : "") + "</div>" +
        '<ol id="psum-list">' + listHtml + "</ol>" + detailHtml + "</div>" +
        '<div id="psum-foot"><button id="psum-copy">Copy</button><button id="psum-again">Rescan</button></div>';

      var scopeBtns = panel.querySelectorAll("#psum-scope button");
      for (var sb = 0; sb < scopeBtns.length; sb++) {
        scopeBtns[sb].onclick = function () {
          host.__psumScope = this.getAttribute("data-s");
          render();
        };
      }
      panel.querySelector("#psum-sel").onchange = function () {
        host.__psumType = this.value;
        render();
      };

      panel.querySelector("#psum-urltoggle").onclick = function () {
        host.__psumUrlRowOpen = !host.__psumUrlRowOpen;
        render();
        var inp = panel.querySelector("#psum-url");
        if (inp) inp.focus();
      };
      panel.querySelector("#psum-go").onclick = startFetch;
      var urlInp = panel.querySelector("#psum-url");
      if (urlInp) urlInp.onkeydown = function (e) { if (e.key === "Enter") startFetch(); };
      var backBtn = panel.querySelector("#psum-urlback");
      if (backBtn) backBtn.onclick = function () {
        host.__psumUrl = null;
        host.__psumUrlRowOpen = false;
        render();
      };

      panel.querySelector("#psum-close").onclick = function () { panel.style.display = "none"; };
      panel.querySelector("#psum-again").onclick = render;
      panel.querySelector("#psum-copy").onclick = function () {
        var b = panel.querySelector("#psum-copy");
        var copied = "MAIN POINTS — " + TYPE_LABEL[resolved] + (host.__psumUrl ? " · " + host.__psumUrl.href : "") + "\n";
        for (var ci = 0; ci < pts.length; ci++) copied += (ci + 1) + ". " + pts[ci] + "\n";
        if (details.length) {
          copied += "\nFULL SUMMARY\n";
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

    function open() {
      panel.style.display = "flex";
      panel.innerHTML = '<div id="psum-head"><b>SUMMA</b></div><div id="psum-body"><p style="color:#6b7a74;font-size:13px;margin:0">Reading page…</p></div>';
      setTimeout(render, 300);
    }

    btn.onclick = function () {
      if (panel.style.display === "flex") { panel.style.display = "none"; return; }
      open();
    };

    host.__psumRender = render;

    mount.appendChild(panel);
    mount.appendChild(btn);
    document.body.appendChild(host);

    // Content-script injection (every page load) shows the button quietly;
    // toolbar clicks and bookmarklets open the panel right away.
    if (!window.__psumNoAutoOpen) setTimeout(open, 250);
  } catch (err) {
    if (window.console && console.warn) console.warn("Summa:", err);
  }
})();
