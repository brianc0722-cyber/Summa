// Summa — background service worker (Manifest V3).
// Clicking the toolbar icon injects the scanner into the active tab.
// Runs in the default ISOLATED world, so page CSP cannot block it —
// that is why this works on Gmail, GitHub, X, banks, etc.
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !tab.id) return;
  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ["widget.js"],
    })
    .catch(function (err) {
      console.warn("Summa: injection failed —", err && err.message);
    });
});
