#!/usr/bin/env node
/**
 * Source « Destination Nancy » (office de tourisme, agenda touristique du SIT
 * Lorraine) pour le pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js est régénéré par update-events.js à partir de l'agenda de la VILLE
 *   de Nancy (agenda-integration.grandnancy.eu). Ce module ajoute une 2e source :
 *   l'agenda de l'office de tourisme (https://www.destination-nancy.com/.../agenda…),
 *   qui couvre toute la métropole (expos, visites, festivals…).
 *
 * Comment ça marche :
 *   1. On parcourt les pages de listing de l'agenda (…/page/N/). Chaque page
 *      contient 12 cartes server-side pointant vers /fete-manifestation/<slug>/.
 *   2. Pour chaque fiche, on lit le bloc JSON-LD <script type="application/ld+json">
 *      (schema.org/Event) : nom, startDate, endDate, adresse, ville.
 *   3. On normalise vers le schéma commun attendu par app.js :
 *        { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *          place, city, free, reservation, image, url }
 *
 * Ni l'API Ville de Nancy ni ce site n'envoient d'en-têtes CORS : comme
 * update-events.js, on fait un instantané local en Node (fetch serveur).
 *
 * Usage :
 *   node destination-nancy.js                 # crawl complet -> events-destination-nancy.json
 *   node destination-nancy.js --pages=3       # n'explore que 3 pages de listing (test)
 *   node destination-nancy.js --max=50        # s'arrête après ~50 événements
 *   node destination-nancy.js --concurrency=6 # fiches récupérées en parallèle (défaut 8)
 *
 * S'utilise aussi comme module :  const { collect } = require("./destination-nancy");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.destination-nancy.com";
const LISTING = ORIGIN + "/tourisme/quoi-faire-a-nancy/agenda-et-grands-evenements";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Catégories ────────────────────────────────────────────────────────────
// On reste aligné sur les clés utilisées par la source Ville de Nancy pour que
// les filtres du site regroupent les deux origines. La catégorie est devinée à
// partir du préfixe du titre SIT ("Exposition – …", "Concert – …") puis du type
// JSON-LD. Tout le reste tombe dans "autre".
const CATEGORY_BY_PREFIX = [
  [/^expo/i,                                  { key: "exposition",         label: "Expositions",              emoji: "🖼️" }],
  [/^(concert|musique classique|récital|recital|opéra|opera)/i, { key: "musique-classique", label: "Musique classique", emoji: "🎻" }],
  [/^(festival|fête|fete)/i,                  { key: "festival",           label: "Festivals",                emoji: "🎪" }],
  [/^(spectacle|théâtre|theatre|danse|cirque|humour|one man|stand)/i, { key: "spectacle", label: "Spectacles", emoji: "🎭" }],
  [/^(visite|balade|randonnée|randonnee|parcours|circuit|découverte|decouverte)/i, { key: "activite", label: "Activités & ateliers", emoji: "🎨" }],
  [/^(atelier|stage|initiation)/i,            { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" }],
  [/^(conférence|conference|rencontre|colloque|table ronde|projection|ciné|cine)/i, { key: "conference", label: "Conférences & rencontres", emoji: "🎓" }],
  [/^(marché|marche|salon|foire|brocante|vide.grenier|dégustation|degustation)/i, { key: "festival", label: "Festivals", emoji: "🎪" }],
];

function resolveCategory(title) {
  const t = (title || "").trim();
  for (const [re, cat] of CATEGORY_BY_PREFIX) if (re.test(t)) return cat;
  return { key: "autre", label: "Autre", emoji: "📌" };
}

// ── HTTP avec retry léger ──────────────────────────────────────────────────
async function getText(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      });
      if (res.status === 404) return null; // page de listing au-delà de la fin
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(400 * attempt);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) =>
  (s || "")
    .replace(/&#8211;/g, "–").replace(/&#8217;/g, "’").replace(/&#8230;/g, "…")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

// ── 1. Listing : URLs des fiches d'une page ────────────────────────────────
// Retourne [] si la page n'existe pas (fin de pagination).
function parseListing(html) {
  const stubs = [];
  const re = /<li class="wpet-block-list__offer"[^>]*data-wpet-offer="(\d+)">([\s\S]*?)<\/li>\s*(?=<li class="wpet-block-list__offer"|<\/ul>)/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[2];
    const sit = (block.match(/data-layer-wpet-offer-id="(\d+)"/) || [])[1] || null;
    const title = unescapeHtml((block.match(/data-layer-wpet-offer-title="([^"]*)"/) || [])[1] || "");
    const city = (block.match(/data-layer-wpet-offer-location="([^"]*)"/) || [])[1] || "";
    let url = (block.match(/<a class="stretched-link[^"]*"\s+href="([^"]+)"/) || [])[1] || null;
    // L'agenda liste une CARTE PAR OCCURRENCE : un même événement récurrent
    // apparaît avec un suffixe /occ/N/ sur des dizaines de pages. Seule la fiche
    // canonique (sans /occ/) porte le JSON-LD Event. On normalise vers cette
    // fiche pour dédupliquer les occurrences et ne lire chaque événement qu'une fois.
    if (url) url = url.replace(/occ\/\d+\/?$/, "");
    if (url) stubs.push({ offer: m[1], sit, title, city, url });
  }
  return stubs;
}

async function fetchAllStubs(maxPages, concurrency = 8) {
  const stubs = [];
  const seen = new Set();
  const pageUrl = (p) => (p === 1 ? LISTING + "/" : `${LISTING}/page/${p}/`);
  // On parcourt les pages par fenêtres concurrentes (le serveur répond lentement,
  // ~9s/page : en séquentiel les 267 pages prenaient ~40 min). On s'arrête dès
  // qu'une page renvoie 404 ou aucune carte — la fin de la pagination.
  // L'ordre n'importe pas : on déduplique par URL canonique de toute façon.
  let page = 1, stop = false;
  while (!stop && (!maxPages || page <= maxPages)) {
    const batch = [];
    for (let k = 0; k < concurrency && (!maxPages || page <= maxPages); k++, page++) batch.push(page);
    const results = await Promise.all(
      batch.map(async (p) => ({ p, html: await getText(pageUrl(p)).catch(() => null) }))
    );
    for (const { html } of results) {
      if (!html) { stop = true; continue; }     // 404 -> fin de pagination
      const found = parseListing(html);
      if (!found.length) { stop = true; continue; }
      for (const s of found) if (!seen.has(s.url)) { seen.add(s.url); stubs.push(s); }
    }
    process.stderr.write(`  listing ≤p${page - 1} : ${stubs.length} événements uniques\n`);
  }
  return stubs;
}

// ── 2. Fiche détail : JSON-LD Event ────────────────────────────────────────
function extractEvent(html) {
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const raw of blocks) {
    const json = raw.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    let data;
    try { data = JSON.parse(json); } catch { continue; }
    const items = Array.isArray(data) ? data : [data];
    for (const it of items) {
      const type = it && it["@type"];
      const isEvent = type === "Event" || (Array.isArray(type) && type.includes("Event")) ||
        /Event$/.test(String(type || ""));
      if (isEvent) return it;
    }
  }
  return null;
}

function ogImage(html) {
  const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
        || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  return m ? m[1] : null;
}

async function fetchDetail(stub) {
  const html = await getText(stub.url);
  if (!html) return null;
  const ev = extractEvent(html);
  if (!ev || !ev.startDate) return null; // pas de date exploitable -> on ignore
  const loc = ev.location || {};
  const addr = loc.address || {};
  const cat = resolveCategory(stub.title || ev.name);
  const start = String(ev.startDate).slice(0, 10);
  const end = String(ev.endDate || ev.startDate).slice(0, 10);
  // Date de tri = prochaine occurrence pertinente. Pour un événement DÉJÀ en
  // cours (expo qui court depuis des mois), on cale sur aujourd'hui pour qu'il
  // ne s'enterre pas tout en bas du tri chronologique — même logique que
  // update-events.js (pickWhen) côté Ville de Nancy.
  const todayISO = new Date().toISOString().slice(0, 10);
  const sortDate = start < todayISO && end >= todayISO ? todayISO : start;
  return {
    uuid: "dn-" + stub.offer,                 // préfixe pour éviter toute collision d'uuid
    title: unescapeHtml(ev.name || stub.title),
    category: cat.key,
    catLabel: cat.label,                      // retiré dans le rendu, sert à construire CATEGORIES
    catEmoji: cat.emoji,
    subcats: [],
    date: sortDate,
    endDate: end,
    dateText: "",
    schedule: "",
    place: (typeof loc.name === "string" && loc.name) || addr.streetAddress || "",
    city: addr.addressLocality || stub.city || "",
    free: false,
    reservation: false,
    image: ogImage(html),
    url: ev.url || stub.url,
    source: "destination-nancy",
  };
}

// ── Pool de concurrence simple ─────────────────────────────────────────────
async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); }
      catch { out[idx] = null; }
      done++;
      if (done % 25 === 0) process.stderr.write(`  fiches: ${done}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

// ── Orchestration ──────────────────────────────────────────────────────────
async function collect({ maxPages = null, max = null, concurrency = 8 } = {}) {
  process.stderr.write("→ Destination Nancy : exploration du listing…\n");
  let stubs = await fetchAllStubs(maxPages, concurrency);
  if (max) stubs = stubs.slice(0, max);
  process.stderr.write(`→ ${stubs.length} fiches à lire (concurrence ${concurrency})…\n`);
  const events = (await mapPool(stubs, fetchDetail, concurrency)).filter(Boolean);

  // Dédoublonnage par uuid (une fiche listée deux fois) puis tri par date.
  const byId = new Map();
  for (const e of events) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  process.stderr.write(`✓ ${list.length} événements Destination Nancy avec date.\n`);
  return list;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
  }
  return o;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const list = await collect({
    maxPages: a.pages ? Number(a.pages) : null,
    max: a.max ? Number(a.max) : null,
    concurrency: a.concurrency ? Number(a.concurrency) : 8,
  });
  const out = a.out || path.join(__dirname, "events-destination-nancy.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseListing, extractEvent };
