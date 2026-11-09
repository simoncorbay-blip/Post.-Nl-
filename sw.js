// Service worker : l'appli fonctionne hors connexion après la 1re ouverture
const VERSION = "secteur-v1";
const COQUILLE = ["./", "index.html", "data.js", "match.js", "manifest.json", "icons/icon-180.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Fichiers de l'appli : réseau d'abord (mises à jour), cache si hors ligne
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((r) => {
      const copie = r.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match("index.html"))));
    return;
  }
  // Moteur de lecture (Tesseract, données de langue) : cache d'abord
  if (/jsdelivr\.net|unpkg\.com|tessdata/.test(url.host + url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      const copie = r.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); return r;
    })));
  }
});
