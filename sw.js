self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener("fetch", (e) => {
  const requestUrl = new URL(e.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/")) return;

  // Przekazywanie żądań sieciowych
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});