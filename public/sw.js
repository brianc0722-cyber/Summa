/* Summa service worker — lets the installed app work offline while
   always picking up fresh deploys: navigations go to the network first,
   static assets are cache-first. */
var CACHE = "summa-v2";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // Pages: network first, so a redeploy shows up right away.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req);
        })
    );
    return;
  }

  // Assets: cache first, offline-friendly.
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req)
          .then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(function () { return hit; });
      });
    })
  );
});
