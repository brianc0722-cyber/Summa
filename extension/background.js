// Summa — background service worker (Manifest V3).
// The button itself is injected on every page by content_scripts
// (see manifest.json). Clicking the toolbar icon summarizes immediately:
// we clear the "stay quiet" flag, then (re)run the widget, which opens
// the panel — or toggles it if the button was already there.
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !tab.id) return;
  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: function () {
        window.__psumNoAutoOpen = false;
      },
    })
    .then(function () {
      return chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["widget.js"],
      });
    })
    .catch(function (err) {
      console.warn("Summa: injection failed —", err && err.message);
    });
});
