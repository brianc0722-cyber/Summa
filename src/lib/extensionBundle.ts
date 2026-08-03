/**
 * Generates the same Chrome MV3 extension that ships as the static
 * /extension folder, packaged as a downloadable ZIP for people who are
 * hosting the site elsewhere. Mirrors extension/manifest.json exactly.
 */
import JSZip from "jszip";
import { WIDGET_SOURCE } from "./bookmarkletSource";

const MANIFEST = {
  manifest_version: 3,
  name: "Summa — Summarize any page",
  short_name: "Summa",
  version: "1.3.0",
  description:
    "A Summarize button on every page you visit: 5 main points plus a full non-redundant summary. Runs locally in your browser — no account, no tracking, works on Gmail and other CSP-locked sites.",
  action: { default_title: "Summarize this page" },
  background: { service_worker: "background.js" },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["prelude.js", "widget.js"],
      run_at: "document_idle",
    },
  ],
  permissions: ["activeTab", "scripting"],
  host_permissions: ["<all_urls>"],
};

const PRELUDE_JS = `window.__psumNoAutoOpen = true;
`;

const BACKGROUND_JS = `// Summa — background service worker (MV3).
// The button is injected on every page by content_scripts; the toolbar
// icon clears the quiet flag and opens (or toggles) the panel.
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !tab.id) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () { window.__psumNoAutoOpen = false; },
  }).then(function () {
    return chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["widget.js"],
    });
  }).catch(function (err) {
    console.warn("Summa: injection failed —", err && err.message);
  });
});
`;

const README = `SUMMA — CHROME EXTENSION
========================

1. Unzip this folder somewhere permanent.
2. Open chrome://extensions and turn ON "Developer mode".
3. Click "Load unpacked" and select the unzipped "extension" folder.
4. Pin the Summa icon, then click it on any page.

Everything runs locally. Nothing is sent anywhere.
`;

export async function buildExtensionZip(): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder("extension")!;
  root.file("manifest.json", JSON.stringify(MANIFEST, null, 2));
  root.file("background.js", BACKGROUND_JS);
  root.file("prelude.js", PRELUDE_JS);
  root.file("widget.js", WIDGET_SOURCE);
  root.file("README.txt", README);
  return zip.generateAsync({ type: "blob" });
}
