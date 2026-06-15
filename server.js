#!/usr/bin/env node
/**
 * Serveur « temps réel » de l'agenda Nancy — zéro dépendance (node:http).
 *
 * Pourquoi ce serveur existe :
 *   Le front charge `data.js` (const CATEGORIES / GENERATED_AT / EVENTS). En
 *   statique, c'est un instantané figé. Les API sources n'envoient pas d'en-tête
 *   CORS : impossible de les appeler depuis le navigateur. Ce serveur joue le
 *   rôle de proxy même-origine et **génère `data.js` à la volée** à partir des
 *   sources live. Résultat : le front actuel devient temps réel SANS qu'on
 *   modifie index.html / app.js / data.js (le fichier disque reste le repli
 *   hors-ligne).
 *
 * Deux cadences (compromis honnête) :
 *   • Ville de Nancy  — 1 appel API JSON rapide → fetch live à chaque requête,
 *     mémoïsé 10 min. C'est du quasi temps réel.
 *   • Les 7 autres sources (Destination Nancy, Nancy Curieux, Vandœuvre, Villers,
 *     Alentoor, ICI-C-Nancy, Zénith) — crawls lourds (jusqu'à des milliers de
 *     fiches) : on sert leur snapshot events-*.json (produit par le scraper
 *     homonyme) et on les recrawle en tâche de fond, échelonnés, toutes les
 *     SNAP_TTL si AUTO_REFRESH=1. Toutes les sources sont déclarées dans SNAPSHOTS.
 *
 * Endpoints :
 *   GET /data.js        → JS live (même forme que le fichier) consommé par le front
 *   GET /api/events     → { generatedAt, categories, events } en JSON (CORS ouvert)
 *   GET /api/refresh    → relance le recrawl des 7 sources en tâche de fond
 *   GET /*              → fichiers statiques du dossier
 *
 * Usage :  node server.js                    # http://localhost:5173
 *          PORT=8080 AUTO_REFRESH=1 node server.js   # recrawl périodique des sources
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { collect: collectDN } = require("./destination-nancy");
const { collect: collectCX } = require("./curieux-net");
const { collect: collectVDV } = require("./vandoeuvre");
const { collect: collectVLN } = require("./villers-les-nancy");
const { collect: collectAL } = require("./alentoor");
const { collect: collectICN } = require("./ici-c-nancy");
const { collect: collectZEN } = require("./zenith-nancy");
const { collect: collectPoirel } = require("./poirel");
const { cleanupMerged } = require("./normalize");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;

const VILLE_API = "https://agenda-integration.grandnancy.eu/api/vdn/events";
const VILLE_DETAIL = "https://www.nancy.fr/agenda/details-agenda?uuid=";
const VILLE_TTL = 10 * 60 * 1000;        // 10 min : source légère ≈ temps réel
const SNAP_TTL = 6 * 60 * 60 * 1000;     // 6 h : crawls lourds, rafraîchis en fond
// AUTO_REFRESH=1 (ou l'ancien DN_AUTO_REFRESH=1) active le recrawl périodique.
const AUTO_REFRESH = process.env.AUTO_REFRESH === "1" || process.env.DN_AUTO_REFRESH === "1";

// Les 7 sources « lourdes » : servies depuis leur snapshot events-*.json (produit
// par le scraper homonyme `collect()`) et recrawlées en tâche de fond si
// AUTO_REFRESH. La Ville de Nancy, elle, est récupérée en direct (cf. fetchVille).
const SNAPSHOTS = [
  { name: "Destination Nancy", file: "events-destination-nancy.json", collect: collectDN,  opts: { concurrency: 8 } },
  { name: "Nancy Curieux",     file: "events-curieux-net.json",        collect: collectCX,  opts: { concurrency: 8 } },
  { name: "Vandœuvre",         file: "events-vandoeuvre.json",         collect: collectVDV, opts: { concurrency: 8 } },
  { name: "Villers-lès-Nancy", file: "events-villers-les-nancy.json",  collect: collectVLN, opts: {} },
  { name: "Alentoor",          file: "events-alentoor.json",           collect: collectAL,  opts: { concurrency: 12 } },
  { name: "ICI-C-Nancy",       file: "events-ici-c-nancy.json",        collect: collectICN, opts: {} },
  { name: "Zénith de Nancy",   file: "events-zenith-nancy.json",       collect: collectZEN, opts: {} },
  { name: "Salle Poirel",      file: "events-poirel.json",             collect: collectPoirel, opts: {} },
].map((s) => ({ ...s, path: path.join(ROOT, s.file), refreshing: false }));

// ── Mapping Ville de Nancy (miroir compact de update-events.js) ────────────
function villeCategory(mainCategory) {
  const name = (mainCategory && mainCategory.name) || "Autre";
  const table = {
    "Activité - Animation":     { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
    "Musiques actuelles":       { key: "musiques-actuelles", label: "Musiques actuelles",       emoji: "🎸" },
    "Jeune public":             { key: "jeune-public",       label: "Jeune public",             emoji: "🧸" },
    "Spectacle":                { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
    "Exposition":               { key: "exposition",         label: "Expositions",              emoji: "🖼️" },
    "Musique classique":        { key: "musique-classique",  label: "Musique classique",        emoji: "🎻" },
    "Manifestation - Festival": { key: "festival",           label: "Festivals",                emoji: "🎪" },
    "Conférence - Rencontre":   { key: "conference",         label: "Conférences & rencontres", emoji: "🎓" },
    "Citoyenneté":              { key: "citoyennete",        label: "Citoyenneté",              emoji: "🤝" },
  };
  return table[name] || { key: "autre", label: name, emoji: "📌" };
}

function pickWhen(ev, todayISO) {
  const list = Array.isArray(ev.dateList) ? ev.dateList.filter((d) => d.date) : [];
  const upcoming = list.filter((d) => d.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date));
  const chosen = upcoming[0] || list.sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    sortDate: (chosen && chosen.date) || (ev.startDate || "").slice(0, 10),
    schedule: (chosen && chosen.schedule) || "",
  };
}

const httpsPrefix = (u) => (!u ? null : u.startsWith("http") ? u : "https://" + u);
function pickImage(mediaUrl) {
  if (!mediaUrl) return null;
  const c = mediaUrl.crop || {};
  return httpsPrefix(c.medium || c.large || c.small);
}

async function fetchVille(todayISO) {
  const res = await fetch(VILLE_API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Ville API HTTP " + res.status);
  const raw = await res.json();
  return raw
    .map((ev) => {
      const cat = villeCategory(ev.mainCategory);
      const when = pickWhen(ev, todayISO);
      const place = ev.place || {};
      const lastDate = (ev.endDate || ev.startDate || "").slice(0, 10);
      return {
        uuid: ev.uuid,
        title: ev.name,
        category: cat.key,
        catLabel: cat.label,
        catEmoji: cat.emoji,
        subcats: (ev.subCategories || []).map((s) => s.name).filter(Boolean),
        date: when.sortDate,
        endDate: lastDate,
        dateText: ev.beforeDateText || ev.duringDateText || "",
        schedule: when.schedule,
        place: place.name || "",
        city: (place.city && place.city.name) || "",
        free: !!ev.free,
        reservation: !!ev.reservation,
        image: pickImage(ev.mediaUrl),
        url: VILLE_DETAIL + ev.uuid,
        source: "ville-de-nancy",
      };
    })
    .filter((e) => e.endDate >= todayISO || e.date >= todayISO);
}

// ── Caches & snapshots ──────────────────────────────────────────────────────
const villeCache = { at: 0, data: null };

function readSnapshot(file, todayISO) {
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return list.filter((e) => e.endDate >= todayISO || e.date >= todayISO);
  } catch {
    return [];
  }
}

// Recrawl générique d'une source en tâche de fond (réécrit son snapshot). No-op
// si un recrawl de cette source est déjà en cours. Piloté par SNAPSHOTS.
function refreshSource(src) {
  if (src.refreshing) return;
  src.refreshing = true;
  log(`${src.name} : rafraîchissement du snapshot en tâche de fond…`);
  Promise.resolve(src.collect(src.opts))
    .then((list) => {
      fs.writeFileSync(src.path, JSON.stringify(list, null, 2), "utf8");
      log(`${src.name} : snapshot mis à jour (${list.length} événements).`);
    })
    .catch((err) => log(`${src.name} : échec rafraîchissement — ${err.message}`))
    .finally(() => { src.refreshing = false; });
}
const refreshAll = () => SNAPSHOTS.forEach(refreshSource);

async function getVille(todayISO) {
  if (villeCache.data && Date.now() - villeCache.at < VILLE_TTL) return villeCache.data;
  try {
    villeCache.data = await fetchVille(todayISO);
    villeCache.at = Date.now();
  } catch (err) {
    log("Ville de Nancy : échec fetch live — " + err.message);
    if (!villeCache.data) villeCache.data = []; // pas de cache encore : liste vide
  }
  return villeCache.data;
}

// ── Construction du payload fusionné ───────────────────────────────────────
const ORDER = ["festival", "musiques-actuelles", "musique-classique", "spectacle",
  "exposition", "jeune-public", "activite", "conference", "citoyennete", "autre"];

async function buildPayload() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const ville = await getVille(todayISO);                                   // Ville de Nancy en direct
  const snaps = SNAPSHOTS.flatMap((s) => readSnapshot(s.path, todayISO));   // 7 sources depuis snapshots

  // Dédoublonnage par uuid, puis nettoyage commun (communes normalisées,
  // catégories remappées, fusion du même événement vu par plusieurs sources) —
  // cf. normalize.js, identique au pipeline statique update-events.js.
  const byId = new Map();
  for (const e of [...ville, ...snaps]) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const merged = cleanupMerged([...byId.values()]);

  // CATEGORIES présentes, dans l'ordre lisible.
  const cats = {};
  for (const e of merged) if (!cats[e.category]) cats[e.category] = { label: e.catLabel, emoji: e.catEmoji };
  const orderedCats = {};
  for (const k of ORDER) if (cats[k]) orderedCats[k] = cats[k];
  for (const k of Object.keys(cats)) if (!orderedCats[k]) orderedCats[k] = cats[k];

  // On retire les champs de service (catLabel/catEmoji) des cartes.
  const events = merged.map(({ catLabel, catEmoji, ...rest }) => rest);
  return { generatedAt: todayISO, categories: orderedCats, events };
}

// ── Serveur HTTP ─────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end("Forbidden"); return; }   // anti path-traversal
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      // Toujours revalider : les fichiers (app.js/style.css…) changent en dev et
      // un cache navigateur figé fait tourner du vieux code (badges non recalculés).
      "Cache-Control": "no-cache, must-revalidate",
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (url === "/data.js") {
      const p = await buildPayload();
      const body =
        "// ⚡ Généré en direct par server.js — Ville de Nancy (live) + 7 sources métropole/anneau (snapshots).\n" +
        `const CATEGORIES = ${JSON.stringify(p.categories, null, 2)};\n\n` +
        `const GENERATED_AT = ${JSON.stringify(p.generatedAt)};\n\n` +
        `const EVENTS = ${JSON.stringify(p.events, null, 2)};\n`;
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(body);
      return;
    }
    if (url === "/api/events") {
      const p = await buildPayload();
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(p));
      return;
    }
    if (url === "/api/refresh") {
      refreshAll();
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, refreshing: SNAPSHOTS.filter((s) => s.refreshing).map((s) => s.name) }));
      return;
    }
    serveStatic(req, res);
  } catch (err) {
    log("Erreur requête " + url + " — " + err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  log(`Agenda Nancy en ligne : http://localhost:${PORT}`);
  log(`  /data.js (front)   /api/events (JSON)   /api/refresh (recrawl)`);
  for (const s of SNAPSHOTS) if (!fs.existsSync(s.path)) log(`⚠ ${s.file} absent — lance le scraper correspondant.`);
  if (AUTO_REFRESH) {
    log(`AUTO_REFRESH actif : recrawl des ${SNAPSHOTS.length} sources toutes les ${SNAP_TTL / 3600000} h (échelonné).`);
    // Échelonnage : on décale le 1er recrawl de chaque source de quelques minutes
    // pour ne pas lancer 7 crawls réseau simultanés, puis on répète tous les SNAP_TTL.
    SNAPSHOTS.forEach((s, i) => {
      setTimeout(() => {
        refreshSource(s);
        setInterval(() => refreshSource(s), SNAP_TTL).unref();
      }, (i + 1) * 2 * 60 * 1000).unref();
    });
  }
});
