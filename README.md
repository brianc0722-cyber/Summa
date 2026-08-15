# Summa — summarize any page on the internet

One click returns **5 main points** plus a **full non-redundant summary** of whatever
you're reading. Everything runs locally in the browser: no account, no API key,
no server, nothing sent anywhere.

Live site: **https://www.contentsummarize.com**

---

## The two halves

| | What it is | Where it lives |
|---|---|---|
| **The extension** | A teal Summarize button that appears automatically on every page you visit. Works on Gmail, GitHub, X and other CSP-locked sites. | `extension/` |
| **The website** | Explains + installs the extension, and hosts the **Workbench** — paste text, fetch a URL, or upload a document for analysis with derived insights. | `src/` |

They are deliberately independent. The extension imports nothing from the site,
so website changes cannot break the button.

---

## Install the extension (no store account needed)

1. `chrome://extensions` → turn on **Developer mode** (top right)
2. **Load unpacked** → select the **`extension`** folder (the one containing `manifest.json`)
3. Pin Summa from the puzzle-piece menu

Works in Chrome, Edge, Brave, Opera and Arc.

---

## Develop locally

```bash
npm install     # once — requires Node 18+
npm run dev     # http://localhost:5173, hot reloads on save
npm run build   # production bundle → dist/
```

## File map

```
src/App.tsx                  the entire website: proof scanner, Workbench,
                             install paths, deploy guide, insight engine
src/lib/summarize.ts         scan engine — 5 points + full summary
src/lib/bookmarkletSource.ts the widget, as a bookmarklet / ZIP payload
src/lib/extensionBundle.ts   builds the downloadable extension ZIP
extension/widget.js          the widget, as the Chrome extension copy
extension/manifest.json      MV3 permissions + auto-inject on every page
public/sw.js                 offline cache, network-first for pages
```

> **One rule when editing:** `extension/widget.js` and `src/lib/bookmarkletSource.ts`
> are two copies of the same scanner. Change them together or they drift.

---

## How the scanner works

1. **Extract** — walks the DOM for real content, skipping nav/footer/forms, reading
   same-origin iframes, and following a content-type profile
   (article · email · image-heavy · docs · thread).
2. **Score** — term frequency with stopwords removed, normalized for length, with
   bonuses for lead position, title overlap, concrete figures and conclusion phrases.
3. **De-duplicate** — greedy selection rejects any sentence sharing >55% of its words
   with one already chosen, so the 5 points are genuinely distinct.
4. **Layer two** — every remaining informative, non-redundant sentence becomes the
   full summary, restored to reading order.

Analysis is capped at 4,000 sentences per document to keep the tab responsive.

---

## Deploy

Vercel, Framework Preset **Vite**, build `npm run build`, output `dist`.
Any push to `main` redeploys automatically.

## License

MIT — do what you like with it.
