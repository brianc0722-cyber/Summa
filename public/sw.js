/* Summa service worker — cache-first for same-origin GETs so the
   installed app opens instantly and works offline. */
var CACHE = "summa-v1";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
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
