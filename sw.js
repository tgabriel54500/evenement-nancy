/* Service worker du site agenda-grandnancy.fr (appli installée et navigateur).
   Révision du 2026-10-25 : l'appli était lente parce que TOUT passait par le
   réseau d'abord, y compris les feuilles de style, scripts et affiches qui ne
   changent pas. Sur une connexion mobile moyenne, chaque ouverture attendait
   donc le réseau pour chaque fichier.

   Stratégies :
   - pages (navigation) et data*.js : réseau d'abord, mais si le réseau ne
     répond pas en 4 s, la dernière version gardée s'affiche (données fraîches
     quand ça va, appli utilisable quand ça rame) ;
   - css, js, polices, icônes : la version gardée tout de suite, mise à jour en
     arrière-plan pour la fois suivante (les fichiers portent un ?v= qui change
     à chaque publication) ;
   - affiches (images/, affiches-*) : gardées, au plus 400, les plus anciennes
     sont retirées. */

const VERSION = 'v3';
const STATIC = 'agenda-gn-static-' + VERSION;
const PAGES = 'agenda-gn-pages-' + VERSION;
const IMAGES = 'agenda-gn-images-' + VERSION;
const MAX_IMAGES = 400;
const SHELL = ['/', '/index.html', '/style.css', '/da/logo.svg', '/icon-192.png', '/site.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(PAGES)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  const keep = new Set([STATIC, PAGES, IMAGES]);
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(cacheName, req, res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return;
  const copy = res.clone();
  caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
}

// Réseau d'abord, avec un délai : au-delà, la copie gardée (si elle existe).
// `key` : adresse sous laquelle on range la copie (data.js sans son ?v=, pour
// n'en garder qu'une et la retrouver quelle que soit la version demandée).
function networkFirst(req, cacheName, timeoutMs, key) {
  key = key || req;
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(async () => {
      const hit = await caches.match(key);
      if (hit && !done) { done = true; resolve(hit); }
    }, timeoutMs);
    fetch(req)
      .then((res) => {
        put(cacheName, key, res);
        clearTimeout(timer);
        if (!done) { done = true; resolve(res); }
      })
      .catch(async () => {
        clearTimeout(timer);
        if (done) return;
        done = true;
        const hit = (await caches.match(key)) || (req.mode === 'navigate' ? await caches.match('/index.html') : null);
        resolve(hit || Response.error());
      });
  });
}

// Copie gardée tout de suite, rafraîchie en arrière-plan. Les fichiers portent
// un ?v= propre à chaque publication : une nouvelle version est une nouvelle
// adresse (pas de mélange ancienne page / nouveau script), et l'on retire les
// anciennes versions du même fichier pour ne pas remplir le téléphone.
function staleWhileRevalidate(req, cacheName) {
  return caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(cacheName).then(async (c) => {
          const path = new URL(req.url).pathname;
          for (const k of await c.keys()) if (new URL(k.url).pathname === path && k.url !== req.url) await c.delete(k);
          await c.put(req, copy);
        }).catch(() => {});
      }
      return res;
    }).catch(() => hit);
    return hit || net;
  });
}

async function trimImages() {
  const c = await caches.open(IMAGES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // On ne touche à rien d'externe (Supabase, CDN, polices, affiches distantes).
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, PAGES, 4000));
    return;
  }
  const p = url.pathname;
  if (/^\/data(-[a-z]+)?\.js$/.test(p)) {
    e.respondWith(networkFirst(req, PAGES, 4000, url.origin + p));
    return;
  }
  if (/^\/(images|affiches-auto|affiches-sport|affiches-pro)\//.test(p)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      put(IMAGES, req, res);
      trimImages().catch(() => {});
      return res;
    })));
    return;
  }
  if (/\.(css|js|svg|png|ico|webmanifest|woff2?)$/.test(p)) {
    e.respondWith(staleWhileRevalidate(req, STATIC));
    return;
  }
  e.respondWith(networkFirst(req, PAGES, 4000));
});
