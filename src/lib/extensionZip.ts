import JSZip from "jszip";
import { WIDGET_SOURCE } from "./bookmarkletSource";

export const EXTENSION_MANIFEST = {
  manifest_version: 3,
  name: "Summa - Summarize any page",
  version: "1.1.0",
  description:
    "Adds a Summarize button to every webpage. Runs entirely in your browser; nothing leaves your machine.",
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
};

export const MANIFEST_JSON = JSON.stringify(EXTENSION_MANIFEST, null, 2);

const README = `SUMMA EXTENSION — load it once, the button is everywhere
========================================================

Chrome / Edge / Brave / Opera:
  1. Unzip this folder somewhere you'll keep it (don't delete it after loading).
  2. Open  chrome://extensions   (Edge: edge://extensions)
  3. Turn ON "Developer mode" (toggle in the top-right corner).
  4. Click "Load unpacked" and choose this unzipped folder.
  Done — the teal Summarize button now appears on every page.

Firefox:
  1. Open  about:debugging#/runtime/this-firefox
  2. Click "Load Temporary Add-on" and pick manifest.json from this folder.
  (Firefox keeps temporary add-ons until you restart the browser.)

Notes
-----
- The button is injected by content.js and renders in a Shadow DOM, so the
  page's own styles can't break it.
- Summaries are computed locally from the page text; no network requests.
- To remove: go back to the extensions page and hit Remove.
`;

/** Builds a complete, loadable browser extension as a zip Blob. */
export async function buildExtensionZip(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", MANIFEST_JSON);
  zip.file("content.js", WIDGET_SOURCE);
  zip.file("README.txt", README);
  return zip.generateAsync({ type: "blob" });
}
