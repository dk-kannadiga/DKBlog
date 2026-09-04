/* Network-only service worker: installed app updates always use live content. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") event.respondWith(fetch(event.request));
});
