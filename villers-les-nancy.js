#!/usr/bin/env node
/**
 * Source « Ville de Villers-lès-Nancy » (agenda municipal) pour le pipeline
 * d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js est régénéré par update-events.js à partir de l'agenda de la VILLE
 *   de Nancy, complété par Destination Nancy (office de tourisme). Ce module
 *   ajoute une 3e source : l'agenda de la commune de Villers-lès-Nancy
 *   (https://www.villerslesnancy.fr/agenda), commune limitrophe de la métropole.
 *
 * Comment ça marche :
 *   1. Le site tourne sous TYPO3 + extension cim_search_elastic. L'agenda est
 *      rendu côté serveur mais paginé en « infinite scroll » : la page /agenda
 *      expose un endpoint AJAX (attribut data-url-scroll) qui renvoie du JSON
 *      Elasticsearch — bien plus propre à parser que le HTML des cartes.
 *   2. Cet endpoint porte un cHash (jeton anti-cache TYPO3). On le RETIRE :
 *      avec le cHash, ajouter le paramètre de page renvoie un 404 (le cHash ne
 *      couvre pas ce paramètre) ; sans cHash, la pagination fonctionne via
 *      `tx_cimsearchelastic_displaysearch[page]=N` (pages 0,1,2…).
 *   3. Chaque hit JSON (documents.events[]) est normalisé vers le schéma commun
 *      attendu par app.js / base.js :
 *        { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *          place, city, free, reservation, image, url }
 *
 * Comme l'API Ville de Nancy et Destination Nancy, le site n'envoie pas d'en-tête
 * CORS : on fait un instantané local en Node (fetch serveur).
 *
 * Usage :
 *   node villers-les-nancy.js                 # crawl complet -> events-villers-les-nancy.json
 *   node villers-les-nancy.js --max=10        # s'arrête après ~10 événements (test)
 *   node villers-les-nancy.js --out=fichier.json
 *
 * S'utilise aussi comme module :  const { collect } = require("./villers-les-nancy");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.villerslesnancy.fr";
const AGENDA = ORIGIN + "/agenda";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Catégories ─────────────────────────────────────────────────────────────
// On reste aligné sur les clés de la source Ville de Nancy pour que les filtres
// du site regroupent les trois origines. Les catégories de Villers sont des
// THÈMES éditoriaux (Culture, Sport, Solidarité…), pas des types d'événement :
// on devine d'abord le type au préfixe/mot-clé du titre, puis on retombe sur le
// thème, et enfin sur "autre".
const CATEGORY_BY_TITLE = [
  [/expo/i,                                                    { key: "exposition",        label: "Expositions",              emoji: "🖼️" }],
  [/(festival|fête|fete|kermesse)/i,                           { key: "festival",          label: "Festivals",                emoji: "🎪" }],
  [/(concert|musique|musical|chœur|choeur|récital|recital|opéra|opera|quatuor)/i, { key: "musique-classique", label: "Musique classique", emoji: "🎻" }],
  [/(spectacle|théâtre|theatre|danse|cirque|gala|humour|conte)/i, { key: "spectacle",      label: "Spectacles",               emoji: "🎭" }],
  [/(conférence|conference|débat|debat|rencontre|colloque|table ronde|ciné|cine|projection|lecture|littéraire|litteraire)/i, { key: "conference", label: "Conférences & rencontres", emoji: "🎓" }],
  [/(atelier|stage|initiation|repair|gratiferia|découverte|decouverte|balade|marche|randonnée|randonnee|visite|transhumance|nettoyage|compost)/i, { key: "activite", label: "Activités & ateliers", emoji: "🎨" }],
];

// Thème éditorial Villers -> clé commune (repli quand le titre ne tranche pas).
const CATEGORY_BY_THEME = {
  "Culture":        { key: "activite",    label: "Activités & ateliers",     emoji: "🎨" },
  "Sport":          { key: "activite",    label: "Activités & ateliers",     emoji: "🎨" },
  "Environnement":  { key: "activite",    label: "Activités & ateliers",     emoji: "🎨" },
  "Solidarité":     { key: "citoyennete", label: "Citoyenneté",              emoji: "🤝" },
  "Citoyenneté":    { key: "citoyennete", label: "Citoyenneté",              emoji: "🤝" },
  "Sénior":         { key: "citoyennete", label: "Citoyenneté",              emoji: "🤝" },
  "Education":      { key: "jeune-public", label: "Jeune public",            emoji: "🧸" },
  "Petite enfance": { key: "jeune-public", label: "Jeune public",            emoji: "🧸" },
};

function resolveCategory(title, themes) {
  const t = (title || "").trim();
  for (const [re, cat] of CATEGORY_BY_TITLE) if (re.test(t)) return cat;
  for (const th of themes || []) if (CATEGORY_BY_THEME[th]) return CATEGORY_BY_THEME[th];
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
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(400 * attempt);
    }
  }
}

// ── Normalisation d'un hit Elasticsearch -> schéma commun ──────────────────
function httpsImage(identifier) {
  // L'identifiant FAL ("/mediatheque/agendas/2026/xxx.png") est relatif au
  // stockage fileadmin -> URL publique = ORIGIN + /fileadmin + identifier.
  if (!identifier) return null;
  return ORIGIN + "/fileadmin" + (identifier.startsWith("/") ? "" : "/") + identifier;
}

function pickImage(ev) {
  const pools = [ev.cimNewsPictureList, ev.cimNewsPictureTop, ev.cimNewsPicturesSlide];
  for (const pool of pools) {
    const id = pool && pool[0] && pool[0].originalResource &&
      pool[0].originalResource.originalFile &&
      pool[0].originalResource.originalFile.properties &&
      pool[0].originalResource.originalFile.properties.identifier;
    if (id) return httpsImage(id);
  }
  return null;
}

// Horaire : champ `schedule` direct (événement à date unique) ou première
// session datée qui en porte un. Valeurs telles que "18h45", "9h30 à 19h30",
// "15h30 > 18h", "À partir de 14h".
function pickSchedule(ev) {
  if (typeof ev.schedule === "string" && ev.schedule.trim()) return ev.schedule.trim();
  const list = Array.isArray(ev.cimNewsScheduleDates) ? ev.cimNewsScheduleDates : [];
  for (const d of list) if (d && typeof d.schedule === "string" && d.schedule.trim()) return d.schedule.trim();
  return "";
}

// Ville réelle depuis l'adresse du lieu ("… 54600 VILLERS-LES-NANCY"), remise en
// casse lisible. Repli sur Villers-lès-Nancy (toutes les fiches sont municipales).
// L'agenda est municipal : la ville est toujours Villers-lès-Nancy (même si un
// événement évoque une autre commune, le lieu de la fiche reste Villers).
const CITY = "Villers-lès-Nancy";

function mapEvent(ev, todayISO) {
  const start = String(ev.cimNewsStartDate || "").slice(0, 10);
  const end = String(ev.cimNewsEndDate || ev.cimNewsStartDate || "").slice(0, 10);
  if (!start) return null;
  // Date de tri = prochaine occurrence pertinente. Un événement DÉJÀ en cours
  // (expo de plusieurs mois) est calé sur aujourd'hui pour ne pas s'enterrer en
  // bas du tri chronologique — même logique que les deux autres sources.
  const sortDate = start >= todayISO ? start : (end >= todayISO ? todayISO : start);

  const themes = (ev.categories || []).map((c) => c && c.title).filter(Boolean);
  const cat = resolveCategory(ev.title, themes);
  const place = ev.place || {};
  return {
    uuid: "vln-" + ev.uid,                 // préfixe pour éviter toute collision d'uuid
    title: ev.title,
    category: cat.key,
    catLabel: cat.label,                   // retiré au rendu, sert à construire CATEGORIES
    catEmoji: cat.emoji,
    subcats: themes,
    date: sortDate,
    endDate: end,
    dateText: "",
    schedule: pickSchedule(ev),
    place: (typeof place.title === "string" && place.title) || "",
    city: CITY,
    free: false,
    reservation: false,
    image: pickImage(ev),
    url: ORIGIN + "/agenda/evenement" + (ev.pathSegment || "/" + ev.uid),
    source: "villers-les-nancy",
  };
}

// ── Endpoint de pagination (data-url-scroll, JSON Elasticsearch) ────────────
async function scrollBaseUrl() {
  const html = await getText(AGENDA);
  const raw = (html.match(/data-url-scroll="([^"]+)"/) || [])[1];
  if (!raw) throw new Error("data-url-scroll introuvable sur /agenda (le site a changé ?)");
  // On décode les entités HTML et on retire le cHash (cf. en-tête du fichier).
  const url = raw.replace(/&amp;/g, "&").replace(/&cHash=[a-f0-9]+/i, "");
  return ORIGIN + url;
}

// ── Orchestration ──────────────────────────────────────────────────────────
async function collect({ max = null } = {}) {
  process.stderr.write("→ Villers-lès-Nancy : lecture de l'agenda…\n");
  const base = await scrollBaseUrl();
  const todayISO = new Date().toISOString().slice(0, 10);

  const seen = new Set();
  const events = [];
  for (let page = 0; page < 50; page++) {
    const url = base + "&tx_cimsearchelastic_displaysearch%5Bpage%5D=" + page;
    let data;
    try { data = JSON.parse(await getText(url)); }
    catch (e) { process.stderr.write("  ⚠ page " + page + " illisible : " + e.message + "\n"); break; }
    const hits = (data.documents && data.documents.events) || [];
    if (!hits.length) break;
    for (const ev of hits) {
      if (seen.has(ev.uid)) continue;       // garde-fou anti-doublon inter-pages
      seen.add(ev.uid);
      const mapped = mapEvent(ev, todayISO);
      if (mapped) events.push(mapped);
    }
    const total = data.nb_results || 0;
    process.stderr.write(`  page ${page} : ${seen.size}/${total || "?"} événements\n`);
    if (total && seen.size >= total) break;
    if (max && events.length >= max) break;
  }

  let list = events.sort((a, b) => a.date.localeCompare(b.date));
  if (max) list = list.slice(0, max);
  process.stderr.write(`✓ ${list.length} événements Villers-lès-Nancy avec date.\n`);
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
  const list = await collect({ max: a.max ? Number(a.max) : null });
  const out = a.out || path.join(__dirname, "events-villers-les-nancy.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, mapEvent, scrollBaseUrl };
