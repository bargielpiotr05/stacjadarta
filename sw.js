self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).origin !== self.location.origin) return;

  // Przekazywanie żądań sieciowych
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});