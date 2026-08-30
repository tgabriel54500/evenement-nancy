/* Service worker minimal du site agenda-grandnancy.fr.
   But : rendre le site "installable" (bouton "Ajouter a l'ecran d'accueil"
   sur Android/Chrome, qui exige un SW capable de repondre hors ligne) et
   afficher une page utilisable quand le reseau tombe.
   Strategie : RESEAU D'ABORD partout (les donnees restent fraiches, data.js
   est regenere chaque nuit), le cache ne sert que de filet de secours. */

const CACHE = 'agenda-gn-v1';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/logo.svg',
  '/icon-192.png',
  '/site.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // On ne touche a rien d'externe (Supabase, CDN, polices, affiches distantes).
  if (url.origin !== self.location.origin) return;

  // Navigation (ouverture d'une page) : reseau d'abord, repli sur la derniere
  // version en cache, puis sur l'accueil. C'est ce repli qui rend le site
  // installable aux yeux de Chrome.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Ressources du site (css, js, icones) : reseau d'abord, cache en secours.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
