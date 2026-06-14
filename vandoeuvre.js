#!/usr/bin/env node
/**
 * Source « Ville de Vandœuvre-lès-Nancy » (agenda municipal) pour le pipeline
 * d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js agrège l'agenda de la Ville de Nancy (update-events.js) et de
 *   l'office de tourisme (destination-nancy.js). Ce module ajoute une 3e source :
 *   l'agenda de Vandœuvre-lès-Nancy (https://www.vandoeuvre.fr/agenda/), 2e ville
 *   de la métropole, absente des deux autres flux.
 *
 * Comment ça marche :
 *   Le site est un WordPress qui expose une API REST propre :
 *     - GET /wp-json/wp/v2/evenement  → tous les événements (type "event"),
 *       paginé (per_page=100). Donne titre, thèmes, lieu, image (yoast og_image).
 *     - GET /wp-json/wp/v2/place      → taxonomie des lieux (id → nom).
 *     - GET /wp-json/wp/v2/event_theme→ taxonomie des thèmes (id → nom).
 *   L'API NE renvoie PAS les dates de l'événement (ni en acf ni en meta). La date
 *   n'existe que dans le HTML de la fiche, dans un bloc `.article-date`
 *   (.date-from / .date-to, jour / mois / année). On récupère donc, pour chaque
 *   événement, sa fiche pour lire cette date faisant foi.
 *
 *   On normalise vers le schéma commun attendu par app.js :
 *     { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *       place, city, free, reservation, image, url, source }
 *
 * Comme les autres sources, le site n'envoie pas d'en-têtes CORS exploitables
 * pour notre besoin : on fait un instantané local en Node (fetch serveur).
 *
 * Usage :
 *   node vandoeuvre.js                  # crawl complet -> events-vandoeuvre.json
 *   node vandoeuvre.js --max=20         # s'arrête après ~20 événements (test)
 *   node vandoeuvre.js --concurrency=6  # fiches récupérées en parallèle (défaut 8)
 *
 * S'utilise aussi comme module :  const { collect } = require("./vandoeuvre");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.vandoeuvre.fr";
const REST = ORIGIN + "/wp-json/wp/v2";
const CITY = "Vandœuvre-lès-Nancy";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Catégories ────────────────────────────────────────────────────────────
// Vandœuvre classe ses événements par THÈME (public / domaine), pas par type
// d'événement comme la Ville de Nancy. On mappe chaque thème vers une clé de
// catégorie : on réutilise une clé existante quand le sens coïncide
// ("Ville" → citoyennete) et on en crée une sinon (sport, famille, nature…),
// pour que les filtres du site restent lisibles. Le 1er thème = catégorie
// principale, les autres tombent dans subcats.
const CAT_BY_THEME = {
  "Culture":  { key: "culture",     label: "Culture",       emoji: "🎭" },
  "Economie": { key: "economie",    label: "Économie",      emoji: "💼" },
  "Famille":  { key: "famille",     label: "Famille",       emoji: "👨‍👩‍👧" },
  "Jeunes":   { key: "jeunesse",    label: "Jeunesse",      emoji: "🧑" },
  "Mobilite": { key: "mobilite",    label: "Mobilité",      emoji: "🚲" },
  "Nature":   { key: "nature",      label: "Nature",        emoji: "🌳" },
  "Santé":    { key: "sante",       label: "Santé",         emoji: "🩺" },
  "Seniors":  { key: "seniors",     label: "Seniors",       emoji: "👵" },
  "Social":   { key: "social",      label: "Social",        emoji: "🫶" },
  "Sport":    { key: "sport",       label: "Sport",         emoji: "⚽" },
  "Ville":    { key: "citoyennete", label: "Citoyenneté",   emoji: "🤝" },
};
const FALLBACK_CAT = { key: "autre", label: "Autre", emoji: "📌" };

function resolveCategory(themeName) {
  return CAT_BY_THEME[(themeName || "").trim()] || FALLBACK_CAT;
}

// Mois français (avec/sans accent) → numéro.
const MONTHS = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11,
  decembre: 12, décembre: 12,
};

// ── HTTP avec retry léger ──────────────────────────────────────────────────
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
async function getJson(url, tries = 3) {
  const txt = await getText(url, tries);
  return txt == null ? null : JSON.parse(txt);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unescapeHtml = (s) =>
  (s || "")
    // Entités numériques (&#8220; &#8217; …) décodées génériquement.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

// ── 1. Taxonomies (id → nom) ───────────────────────────────────────────────
async function fetchTaxonomy(name) {
  const arr = await getJson(`${REST}/${name}?per_page=100&_fields=id,name`);
  const map = new Map();
  for (const t of arr || []) map.set(t.id, t.name);
  return map;
}

// ── 2. Liste des événements via l'API REST ─────────────────────────────────
async function fetchAllEvents(max) {
  const fields = "id,slug,link,title.rendered,event_theme,place,yoast_head_json.og_image";
  const out = [];
  for (let page = 1; ; page++) {
    const url = `${REST}/evenement?per_page=100&page=${page}&orderby=id&order=asc&_fields=${fields}`;
    let batch;
    try { batch = await getJson(url); }
    catch (err) { break; } // page au-delà de la fin -> 400/404
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    process.stderr.write(`  REST evenement p${page} : ${out.length} cumulés\n`);
    if (batch.length < 100) break;
    if (max && out.length >= max) break;
  }
  return max ? out.slice(0, max) : out;
}

// ── 3. Date faisant foi, lue dans la fiche HTML ────────────────────────────
// Le bloc .article-date contient .date-from (et .date-to pour une période),
// chacun portant .date-day / .date-month / .date-year, plus un .date-schedule.
function parseDateSpan(spanHtml) {
  const day = (spanHtml.match(/date-day">\s*(\d{1,2})/) || [])[1];
  const monthName = (spanHtml.match(/date-month">\s*([^<]+?)\s*</) || [])[1];
  const year = (spanHtml.match(/date-year">\s*(\d{4})/) || [])[1];
  if (!day || !monthName) return null;
  const month = MONTHS[monthName.trim().toLowerCase()];
  if (!month) return null;
  return { day: +day, month, year: year ? +year : null };
}

function iso(p) {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Libellé de période lisible à partir des dates ISO RÉELLES (non calées sur le
// tri). Renvoie "" pour un jour unique (dateLabel formatera alors `date`),
// sinon "Du J1 [mois1] au J2 mois2 année" pour un événement sur plusieurs jours.
function periodText(startISO, endISO) {
  if (!startISO || !endISO || endISO === startISO) return "";
  const [y1, m1, d1] = startISO.split("-").map(Number);
  const [y2, m2, d2] = endISO.split("-").map(Number);
  if (y1 !== y2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} ${y1} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  return `Du ${d1} au ${d2} ${MONTH_NAMES[m1 - 1]} ${y1}`;
}

function extractDate(html) {
  const i = html.indexOf("article-date");
  if (i < 0) return null;
  const block = html.slice(i, html.indexOf("</div>", i) + 6);
  const fromM = block.match(/date date-from">([\s\S]*?)<\/span>\s*<\/span>/) ||
                block.match(/date date-from">([\s\S]*?)<span class="date date-to/);
  const fromHtml = fromM ? fromM[1] : block;
  const from = parseDateSpan(fromHtml);
  if (!from || !from.year) return null; // sans année on ne sait pas trier de façon fiable

  const toM = block.match(/date date-to">([\s\S]*?)<\/span>\s*(?:<\/span>|<span class="date-schedule)/);
  let to = toM ? parseDateSpan(toM[1]) : null;
  if (to && !to.year) {
    // L'année de fin manque parfois : on l'infère (passage d'année si le mois recule).
    to.year = to.month < from.month ? from.year + 1 : from.year;
  }
  const schedule = ((block.match(/date-schedule">\s*([\s\S]*?)<\/span>/) || [])[1] || "")
    .replace(/<[^>]+>/g, "").replace(/^[\s\-–]+/, "").trim();

  return { start: iso(from), end: to ? iso(to) : iso(from), schedule };
}

// ── 4. Normalisation vers le schéma commun ─────────────────────────────────
async function toEvent(ev, places, themes, todayISO) {
  const html = await getText(ev.link);
  if (!html) return null;
  const dt = extractDate(html);
  if (!dt) return null; // pas de date exploitable -> on ignore

  const themeNames = (ev.event_theme || []).map((id) => themes.get(id)).filter(Boolean);
  const cat = resolveCategory(themeNames[0]);
  const placeName = (ev.place || []).map((id) => places.get(id)).filter(Boolean)[0] || "";

  // Date de tri : un événement DÉJÀ en cours est calé sur aujourd'hui pour qu'il
  // ne s'enterre pas en bas du tri chronologique — même logique que les autres sources.
  const sortDate = dt.start < todayISO && dt.end >= todayISO ? todayISO : dt.start;

  return {
    uuid: "vdv-" + ev.id,
    title: unescapeHtml((ev.title && ev.title.rendered) || ev.slug),
    category: cat.key,
    catLabel: cat.label, // retiré au rendu, sert à construire CATEGORIES
    catEmoji: cat.emoji,
    subcats: themeNames.slice(1),
    date: sortDate,
    endDate: dt.end,
    // Période RÉELLE pour l'affichage (dt.start, non calé sur le tri) afin de ne
    // pas perdre le vrai jour de début d'un événement en cours sur plusieurs jours.
    dateText: periodText(dt.start, dt.end),
    schedule: dt.schedule || "",
    place: placeName,
    city: CITY,
    free: false,
    reservation: false,
    image: (ev.yoast_head_json && ev.yoast_head_json.og_image &&
            ev.yoast_head_json.og_image[0] && ev.yoast_head_json.og_image[0].url) || null,
    url: ev.link,
    source: "vandoeuvre",
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
  process.stderr.write("→ Vandœuvre : taxonomies + liste des événements…\n");
  const [places, themes] = await Promise.all([
    fetchTaxonomy("place"),
    fetchTaxonomy("event_theme"),
  ]);
  const raw = await fetchAllEvents(max);
  process.stderr.write(`→ ${raw.length} fiches à lire (concurrence ${concurrency})…\n`);

  const todayISO = new Date().toISOString().slice(0, 10);
  const events = (await mapPool(raw, (ev) => toEvent(ev, places, themes, todayISO), concurrency))
    .filter(Boolean);

  // Dédoublonnage par uuid puis tri par date.
  const byId = new Map();
  for (const e of events) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  process.stderr.write(`✓ ${list.length} événements Vandœuvre avec date.\n`);
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
  const out = a.out || path.join(__dirname, "events-vandoeuvre.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, extractDate, parseDateSpan };
