#!/usr/bin/env node
/**
 * 3e source « Nancy Curieux » (agenda culturel et participatif local,
 * https://nancy.curieux.net/agenda/) pour le pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js fusionne déjà l'agenda de la VILLE de Nancy (update-events.js) et
 *   l'office de tourisme (destination-nancy.js). Ce module ajoute l'agenda
 *   associatif/culturel de Nancy Curieux, riche en concerts, scènes ouvertes,
 *   expositions et sorties que les deux autres sources ne listent pas.
 *
 * Comment ça marche :
 *   1. La page d'accueil de l'agenda n'expose que ~21 événements à venir et la
 *      pseudo-pagination /agenda/N renvoie un bloc figé : on ne peut pas paginer.
 *      En revanche chaque RUBRIQUE (/agenda/rubrique/<rb>) liste TOUS les
 *      événements à venir de la rubrique, server-side, en microdata schema.org.
 *      Les 7 rubriques (concert, spectacle, exposition, cinema, stage,
 *      action-citoyenne, autre) partitionnent le catalogue sans recouvrement.
 *      → On parcourt les 7 rubriques et on collecte les slugs uniques.
 *   2. Pour chaque fiche /agenda/evenement/<slug>, on lit le bloc JSON-LD
 *      <script type="application/ld+json"> (schema.org/Event) : nom, startDate,
 *      endDate, lieu, image, description, prix (offers).
 *   3. On normalise vers le schéma commun attendu par app.js :
 *        { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *          place, city, free, reservation, image, url, source }
 *
 * ⚠️ Encodage : les pages déclarent <meta charset="ISO-8859-1"> mais les octets
 *   sont en réalité de l'UTF-8. On décode donc TOUJOURS en UTF-8 (arrayBuffer),
 *   sinon les accents ressortent en mojibake ("mémoires" -> "mÃ©moires").
 *
 * Le site n'envoie pas d'en-têtes CORS : comme les autres sources, instantané
 * local en Node.
 *
 * Usage :
 *   node curieux-net.js                  # crawl complet -> events-curieux-net.json
 *   node curieux-net.js --max=30         # s'arrête après ~30 événements (test)
 *   node curieux-net.js --concurrency=6  # fiches récupérées en parallèle (défaut 8)
 *
 * S'utilise aussi comme module :  const { collect } = require("./curieux-net");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://nancy.curieux.net";
const RUBRICS = ["concert", "spectacle", "exposition", "cinema", "stage", "action-citoyenne", "autre"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Catégories ────────────────────────────────────────────────────────────
// On reste aligné sur les clés des autres sources pour que les filtres du site
// regroupent les trois origines. La rubrique Curieux donne la catégorie ; on
// affine seulement les concerts (classique vs actuel) au mot-clé du titre.
const CATEGORY_BY_RUBRIC = {
  concert:            { key: "musiques-actuelles", label: "Musiques actuelles",       emoji: "🎸" },
  spectacle:          { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
  exposition:         { key: "exposition",         label: "Expositions",              emoji: "🖼️" },
  cinema:             { key: "autre",              label: "Autre",                    emoji: "📌" },
  stage:              { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
  "action-citoyenne": { key: "citoyennete",        label: "Citoyenneté",              emoji: "🤝" },
  autre:              { key: "autre",              label: "Autre",                    emoji: "📌" },
};
const CLASSICAL = /classiqu|opéra|opera|récital|recital|symphoni|orchestr|philharmon|philharmoni|quatuor|baroqu|lyriqu|requiem|sonate/i;

function resolveCategory(rubric, title) {
  const base = CATEGORY_BY_RUBRIC[rubric] || CATEGORY_BY_RUBRIC.autre;
  if (rubric === "concert" && CLASSICAL.test(title || ""))
    return { key: "musique-classique", label: "Musique classique", emoji: "🎻" };
  return base;
}

// ── HTTP (décodage UTF-8 forcé) avec retry léger ───────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("HTTP " + res.status);
      // Les pages mentent sur leur charset (ISO-8859-1) : octets réels en UTF-8.
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("utf8");
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(400 * attempt);
    }
  }
}

const unescapeHtml = (s) =>
  (s || "")
    .replace(/&#8211;/g, "–").replace(/&#8217;/g, "’").replace(/&#8230;/g, "…")
    .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

// ── 1. Listing : slugs des fiches d'une rubrique ───────────────────────────
// Chaque carte référence son slug deux fois (image + titre) : on déduplique.
function parseRubricSlugs(html) {
  const slugs = [];
  const seen = new Set();
  const re = /\/agenda\/evenement\/([a-z0-9-]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (!seen.has(m[1])) { seen.add(m[1]); slugs.push(m[1]); }
  }
  return slugs;
}

async function fetchAllStubs() {
  const stubs = [];
  const seen = new Set();
  for (const rubric of RUBRICS) {
    const html = await getText(`${ORIGIN}/agenda/rubrique/${rubric}`).catch(() => null);
    if (!html) { process.stderr.write(`  rubrique/${rubric} : illisible, ignorée\n`); continue; }
    const found = parseRubricSlugs(html);
    let added = 0;
    for (const slug of found) {
      if (!seen.has(slug)) { seen.add(slug); stubs.push({ slug, rubric }); added++; }
    }
    process.stderr.write(`  rubrique/${rubric} : ${found.length} cartes (+${added} nouveaux) -> ${stubs.length} uniques\n`);
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
      const isEvent = type === "Event" ||
        (Array.isArray(type) && type.includes("Event")) || /Event$/.test(String(type || ""));
      if (isEvent) return it;
    }
  }
  return null;
}

// L'image du JSON-LD pointe sur le host nu `curieux.net` qui ne répond PAS.
// og:image utilise `www.curieux.net` (HTTP 200) : on le préfère, et en repli on
// réécrit le host du JSON-LD vers www.curieux.net.
function fixHost(u) {
  return typeof u === "string" ? u.replace(/^https?:\/\/curieux\.net\//, "https://www.curieux.net/") : u;
}
function firstImage(ev, html) {
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (og) return og[1];
  const img = ev.image;
  if (typeof img === "string" && img) return fixHost(img);
  if (Array.isArray(img) && img.length) { const s = img.find((x) => typeof x === "string"); return s ? fixHost(s) : null; }
  if (img && typeof img.url === "string") return fixHost(img.url);
  return null;
}

// Texte de date humain en français reconstruit depuis les dates ISO du JSON-LD.
// On NE lit PAS le ".block-date" de la fiche : les pages détail embarquent des
// cartes d'événements liés, dont le bloc-date pollue l'extraction (mauvais event).
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];
function frDate(iso) {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d)) return iso;
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function buildDateText(start, end) {
  if (!start) return "";
  return start === end ? `Le ${frDate(start)}` : `Du ${frDate(start)} au ${frDate(end)}`;
}

async function fetchDetail(stub) {
  const url = `${ORIGIN}/agenda/evenement/${stub.slug}`;
  const html = await getText(url);
  if (!html) return null;
  const ev = extractEvent(html);
  if (!ev || !ev.startDate) return null; // pas de date exploitable -> ignoré

  // location peut être un objet ou un tableau de Place.
  const locRaw = Array.isArray(ev.location) ? ev.location[0] : ev.location;
  const loc = locRaw || {};
  const addr = loc.address || {};
  const offers = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
  const title = unescapeHtml(ev.name || stub.slug);
  const cat = resolveCategory(stub.rubric, title);

  const start = String(ev.startDate).slice(0, 10);
  const end = String(ev.endDate || ev.startDate).slice(0, 10);
  // Date de tri : un événement déjà en cours (expo qui court depuis des mois)
  // est calé sur aujourd'hui pour ne pas s'enterrer en bas du tri — même
  // logique que destination-nancy.js et update-events.js.
  const todayISO = new Date().toISOString().slice(0, 10);
  const sortDate = start < todayISO && end >= todayISO ? todayISO : start;

  const priceStr = offers && offers.price != null ? String(offers.price).trim() : null;
  const free = priceStr === "0" || priceStr === "0.0" || priceStr === "0.00";

  return {
    uuid: "cx-" + stub.slug,                  // préfixe pour éviter toute collision d'uuid
    title,
    category: cat.key,
    catLabel: cat.label,                      // retiré au rendu, sert à construire CATEGORIES
    catEmoji: cat.emoji,
    subcats: [],
    date: sortDate,
    endDate: end,
    dateText: buildDateText(start, end),
    schedule: "",
    place: unescapeHtml((typeof loc.name === "string" && loc.name) || addr.streetAddress || ""),
    city: unescapeHtml(addr.addressLocality || ""),
    free: !!free,
    reservation: false,
    image: firstImage(ev, html),
    url,
    source: "curieux-net",
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
async function collect({ max = null, concurrency = 8 } = {}) {
  process.stderr.write("→ Nancy Curieux : exploration des rubriques…\n");
  let stubs = await fetchAllStubs();
  if (max) stubs = stubs.slice(0, max);
  process.stderr.write(`→ ${stubs.length} fiches à lire (concurrence ${concurrency})…\n`);
  const events = (await mapPool(stubs, fetchDetail, concurrency)).filter(Boolean);

  const byId = new Map();
  for (const e of events) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  process.stderr.write(`✓ ${list.length} événements Nancy Curieux avec date.\n`);
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
    max: a.max ? Number(a.max) : null,
    concurrency: a.concurrency ? Number(a.concurrency) : 8,
  });
  const out = a.out || path.join(__dirname, "events-curieux-net.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseRubricSlugs, extractEvent };
