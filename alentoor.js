#!/usr/bin/env node
/**
 * Source « Alentoor » (alentoor.fr) pour le pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   Les autres sources (Ville de Nancy, Destination Nancy, Curieux, Vandœuvre,
 *   Villers) couvrent surtout Nancy et sa métropole. Alentoor.fr (« alentour »)
 *   liste, pour chaque commune, les événements dans un RAYON autour d'elle.
 *   En crawlant Nancy + un anneau de communes (Toul, Pont-à-Mousson, Lunéville,
 *   Saint-Nicolas-de-Port), on récupère Nancy + la métropole + les événements
 *   intéressants à 20–30 km — ce que demandait l'objectif initial (l'agenda
 *   « Pour sortir » de l'Est Républicain, désormais hors-ligne, ne renvoie plus
 *   que des 404).
 *
 * Comment ça marche :
 *   1. Le JSON-LD du <head> d'une page-liste est un set « à la une » FIXE
 *      (~33 events identiques quelle que soit la page/date) : on ne s'en sert PAS
 *      pour lister. La vraie liste est dans les cartes HTML du corps, dont les
 *      liens ont la forme /{ville}/agenda/<id>-<slug>.
 *   2. La pagination ?page=N ne change rien (rendu JS), MAIS l'URL par date
 *      /{ville}/agenda/AAAA-MM-JJ filtre bien la liste côté serveur. On itère donc
 *      sur les DATES (aujourd'hui → +horizon jours) pour chaque commune-ancre, et
 *      on collecte tous les liens de fiches, dédupliqués par id d'événement.
 *   3. Pour chaque fiche unique, on lit le bloc JSON-LD <script type="application/
 *      ld+json"> (schema.org/Event) : name, description, image[], location/address,
 *      startDate/endDate (avec horaire), offers/isAccessibleForFree. Le fil
 *      d'Ariane (…/agenda/<categorie>) donne la catégorie.
 *   4. On normalise vers le schéma commun attendu par app.js :
 *        { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *          place, city, free, reservation, image, url, source }
 *
 * Le site ne renvoie pas d'en-têtes CORS : comme les autres sources, on fait un
 * instantané local en Node (fetch serveur). Sortie : events-alentoor.json,
 * fusionné par update-events.js s'il est présent.
 *
 * Usage :
 *   node alentoor.js                       # crawl complet -> events-alentoor.json
 *   node alentoor.js --horizon=30          # n'explore que les 30 prochains jours
 *   node alentoor.js --cities=nancy,toul   # restreint les communes-ancres
 *   node alentoor.js --max=50              # s'arrête après ~50 fiches (test)
 *   node alentoor.js --concurrency=6       # fiches/listes en parallèle (défaut 8)
 *
 * S'utilise aussi comme module :  const { collect } = require("./alentoor");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.alentoor.fr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Communes-ancres : chacune ramène les événements dans son rayon (~30 km). On
// répartit les ancres dans toutes les directions pour couvrir Nancy + métropole
// + l'anneau 20–30 km sans trou (les recouvrements sont dédupliqués par id).
// Distances approx. depuis Nancy entre parenthèses.
const DEFAULT_CITIES = [
  "nancy",                  // centre (ville + métropole)
  // Ouest / nord-ouest
  "toul",                   // O  ~22 km
  "liverdun",               // NO ~15 km
  // Nord
  "pompey",                 // N  ~12 km
  "pont-a-mousson",         // N  ~30 km
  "dieulouard",             // N  ~25 km
  "nomeny",                 // NE ~25 km
  // Est / nord-est
  "champenoux",             // NE ~15 km
  "einville-au-jard",       // E  ~25 km
  "luneville",              // SE ~28 km
  // Sud-est
  "saint-nicolas-de-port",  // SE ~12 km
  "dombasle-sur-meurthe",   // SE ~15 km
  "bayon",                  // SE ~28 km
  // Sud
  "neuves-maisons",         // S  ~13 km
  "vezelise",               // S  ~25 km
  "haroue",                 // S  ~30 km
  // Sud-ouest
  "pont-saint-vincent",     // SO ~15 km
  "colombey-les-belles",    // SO ~28 km
];

// Horizon par défaut : on balaie les dates d'aujourd'hui à +N jours. Un événement
// d'un seul jour n'apparaît que sur la page de SA date, d'où le balayage jour par
// jour ; les events longs (expos) ressortent sur chaque date et sont dédupliqués.
const DEFAULT_HORIZON = 60;

// ── Catégories ────────────────────────────────────────────────────────────
// 1) On essaie d'abord le slug du fil d'Ariane (…/agenda/<slug>), fiable.
// 2) Repli sur le préfixe du titre ("Exposition – …", "Concert – …").
// Les clés restent alignées sur celles des autres sources pour que les filtres
// du site regroupent toutes les origines.
const CATEGORY_BY_SLUG = {
  exposition:   { key: "exposition",         label: "Expositions",              emoji: "🖼️" },
  concert:      { key: "musiques-actuelles", label: "Musiques actuelles",       emoji: "🎸" },
  musique:      { key: "musiques-actuelles", label: "Musiques actuelles",       emoji: "🎸" },
  spectacle:    { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
  theatre:      { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
  danse:        { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
  cirque:       { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
  humour:       { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
  festival:     { key: "festival",           label: "Festivals",                emoji: "🎪" },
  brocante:     { key: "festival",           label: "Festivals",                emoji: "🎪" },
  foire:        { key: "festival",           label: "Festivals",                emoji: "🎪" },
  salon:        { key: "festival",           label: "Festivals",                emoji: "🎪" },
  fete:         { key: "festival",           label: "Festivals",                emoji: "🎪" },
  visite:       { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
  loisirs:      { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
  atelier:      { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
  conference:   { key: "conference",         label: "Conférences & rencontres", emoji: "🎓" },
  cinema:       { key: "conference",         label: "Conférences & rencontres", emoji: "🎓" },
  sport:        { key: "sport",              label: "Sport",                    emoji: "🤸" },
  "jeune-public":{ key: "jeune-public",      label: "Jeune public",             emoji: "🧸" },
};
const KNOWN_SLUGS = Object.keys(CATEGORY_BY_SLUG);

const CATEGORY_BY_PREFIX = [
  [/^expo/i,                                                          CATEGORY_BY_SLUG.exposition],
  [/^(concert|musiques?\s+actuelles?|rock|jazz|rap|électro|electro)/i, CATEGORY_BY_SLUG.concert],
  [/^(musique classique|récital|recital|opéra|opera|symphoni|philharmoni)/i, { key: "musique-classique", label: "Musique classique", emoji: "🎻" }],
  [/^(festival|fête|fete|marché|marche|salon|foire|brocante|vide.?grenier)/i, CATEGORY_BY_SLUG.festival],
  [/^(spectacle|théâtre|theatre|danse|cirque|humour|one man|stand)/i, CATEGORY_BY_SLUG.spectacle],
  [/^(visite|balade|randonnée|randonnee|parcours|circuit|découverte|decouverte|atelier|stage|initiation)/i, CATEGORY_BY_SLUG.visite],
  [/^(conférence|conference|rencontre|colloque|table ronde|projection|ciné|cine)/i, CATEGORY_BY_SLUG.conference],
];

function resolveCategory(slug, title) {
  if (slug && CATEGORY_BY_SLUG[slug]) return CATEGORY_BY_SLUG[slug];
  const t = (title || "").trim();
  for (const [re, cat] of CATEGORY_BY_PREFIX) if (re.test(t)) return cat;
  return { key: "autre", label: "Autre", emoji: "📌" };
}

// ── HTTP avec retry léger ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(400 * attempt);
    }
  }
}

const unescapeHtml = (s) =>
  (s || "")
    .replace(/&#8211;/g, "–").replace(/&#8217;/g, "’").replace(/&#8230;/g, "…")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

// ── 1. Listing : liens des fiches d'une page-date ──────────────────────────
// On extrait les liens de cartes /{ville}/agenda/<id>-<slug>. On renvoie une map
// id -> url canonique (la fiche est la même quel que soit le préfixe ville).
function parseListing(html) {
  const out = new Map();
  const re = /href="(\/[a-z0-9-]+\/agenda\/(\d+)-[a-z0-9-]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[2];
    if (!out.has(id)) out.set(id, ORIGIN + m[1]);
  }
  return out;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Balaie, pour chaque commune-ancre, les pages-date d'aujourd'hui à +horizon
// jours, en fenêtres concurrentes. Déduplique les fiches par id d'événement.
async function fetchAllStubs({ cities, horizon, concurrency }) {
  const byId = new Map(); // id -> url
  const today = new Date();
  // Liste des (ville, date) à interroger.
  const jobs = [];
  for (const city of cities) {
    for (let i = 0; i <= horizon; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      jobs.push(`${ORIGIN}/${city}/agenda/${isoDate(d)}`);
    }
  }
  let done = 0;
  for (let start = 0; start < jobs.length; start += concurrency) {
    const batch = jobs.slice(start, start + concurrency);
    const pages = await Promise.all(batch.map((u) => getText(u).catch(() => null)));
    for (const html of pages) {
      if (!html) continue;
      for (const [id, url] of parseListing(html)) if (!byId.has(id)) byId.set(id, url);
    }
    done += batch.length;
    process.stderr.write(`  listing : ${done}/${jobs.length} pages-date, ${byId.size} fiches uniques\n`);
  }
  return [...byId.entries()].map(([id, url]) => ({ id, url }));
}

// ── 2. Fiche détail : JSON-LD Event ────────────────────────────────────────
function extractEvent(html) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g) || [];
  for (const raw of blocks) {
    const json = raw.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    let data;
    try { data = JSON.parse(json); } catch { continue; }
    const items = Array.isArray(data) ? data : [data];
    for (const it of items) {
      const type = it && it["@type"];
      const isEvent = type === "Event" ||
        (Array.isArray(type) && type.includes("Event")) || /Event$/.test(String(type || ""));
      if (isEvent) return it;
    }
  }
  return null;
}

// Catégorie depuis le fil d'Ariane : un lien /{ville}/agenda/<slug> où <slug>
// n'est pas numérique et appartient à nos catégories connues.
function breadcrumbCategory(html) {
  const re = /\/[a-z0-9-]+\/agenda\/([a-z][a-z-]+)(?=["/?])/gi;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1].toLowerCase();
    if (KNOWN_SLUGS.includes(slug)) return slug;
  }
  return null;
}

// Horaire lisible à partir d'un startDate ISO avec heure ("…T19:00:00+02:00").
function scheduleFrom(startISO, endISO) {
  const t = (iso) => {
    const m = String(iso || "").match(/T(\d{2}):(\d{2})/);
    if (!m) return null;
    const hh = m[1], mm = m[2];
    return mm === "00" ? `${Number(hh)}h` : `${Number(hh)}h${mm}`;
  };
  const s = t(startISO), e = t(endISO);
  if (s && e && e !== s) return `de ${s} à ${e}`;
  if (s) return s;
  return "";
}

async function fetchDetail(stub) {
  const html = await getText(stub.url);
  if (!html) return null;
  const ev = extractEvent(html);
  if (!ev || !ev.startDate) return null;
  const loc = ev.location || {};
  const addr = loc.address || {};
  const cat = resolveCategory(breadcrumbCategory(html), ev.name);
  const start = String(ev.startDate).slice(0, 10);
  const end = String(ev.endDate || ev.startDate).slice(0, 10);
  // Date de tri = aujourd'hui si l'événement est DÉJÀ en cours, sinon le début
  // (même logique que les autres sources : les expos en cours ne s'enterrent pas).
  const todayISO = new Date().toISOString().slice(0, 10);
  const sortDate = start < todayISO && end >= todayISO ? todayISO : start;
  // Gratuité : isAccessibleForFree, ou une offre à prix 0.
  const offers = Array.isArray(ev.offers) ? ev.offers : ev.offers ? [ev.offers] : [];
  const free = ev.isAccessibleForFree === true ||
    offers.some((o) => o && (o.price === 0 || o.price === "0" || /gratuit/i.test(String(o.price || ""))));
  const image = Array.isArray(ev.image) ? ev.image[0] : ev.image || null;
  return {
    uuid: "al-" + stub.id,                    // préfixe pour éviter toute collision d'uuid
    title: unescapeHtml(ev.name || ""),
    category: cat.key,
    catLabel: cat.label,                      // retiré au rendu, sert à construire CATEGORIES
    catEmoji: cat.emoji,
    subcats: [],
    date: sortDate,
    endDate: end,
    dateText: "",
    schedule: scheduleFrom(ev.startDate, ev.endDate),
    place: (typeof loc.name === "string" && loc.name) || addr.streetAddress || "",
    city: addr.addressLocality || "",
    free: !!free,
    reservation: false,
    image,
    url: ev.url || stub.url,
    source: "alentoor",
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
      if (done % 25 === 0) process.stderr.write(`  fiches : ${done}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

// ── Orchestration ──────────────────────────────────────────────────────────
async function collect({ cities = DEFAULT_CITIES, horizon = DEFAULT_HORIZON, max = null, concurrency = 8 } = {}) {
  process.stderr.write(`→ Alentoor : balayage de ${cities.length} communes sur ${horizon} jours…\n`);
  let stubs = await fetchAllStubs({ cities, horizon, concurrency });
  if (max) stubs = stubs.slice(0, max);
  process.stderr.write(`→ ${stubs.length} fiches à lire (concurrence ${concurrency})…\n`);
  const events = (await mapPool(stubs, fetchDetail, concurrency)).filter(Boolean);

  const byId = new Map();
  for (const e of events) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  process.stderr.write(`✓ ${list.length} événements Alentoor avec date.\n`);
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
    cities: a.cities ? String(a.cities).split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_CITIES,
    horizon: a.horizon ? Number(a.horizon) : DEFAULT_HORIZON,
    max: a.max ? Number(a.max) : null,
    concurrency: a.concurrency ? Number(a.concurrency) : 8,
  });
  const out = a.out || path.join(__dirname, "events-alentoor.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseListing, extractEvent };
