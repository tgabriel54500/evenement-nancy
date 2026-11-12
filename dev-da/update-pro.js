#!/usr/bin/env node
/**
 * update-pro.js — fabrique `data-pro.js` (et les affiches) à partir de
 * `events-pro.json` (produit par pro-scrape.js) et de `pro-manuel.json`
 * (événements saisis à la main, même schéma, qui s'ajoutent ou complètent).
 *
 * Usage :  node update-pro.js
 *
 * Sortie :
 *   data-pro.js              CATEGORIES (types de rendez-vous) + EVENTS, même
 *                            schéma que data.js → pro.html réutilise galerie.js
 *                            tel quel. Plus RESEAUX (annuaire des réseaux
 *                            d'affaires affiché sous la galerie).
 *   affiches-pro/*.svg       une affiche générée par événement sans image,
 *                            aux couleurs du réseau (moteur affiches-auto.js).
 *   events-pro-firstseen.json  date de première apparition, pour le ruban
 *                            « Nouveau » (même principe que la culture).
 *
 * Filtres appliqués ici (et pas dans pro-scrape.js, pour pouvoir changer le
 * rayon sans re-scraper) :
 *   - à venir uniquement (date de fin >= aujourd'hui) ;
 *   - Nancy + communes à RAYON_KM (pro-sources.js) ; une commune inconnue du
 *     référentiel est refusée et signalée dans la console ;
 *   - webinaires et visios écartés (le site répond « que faire à Nancy »).
 *
 * Champs propres à l'onglet Pro, en plus du schéma EVENTS :
 *   network      clé du réseau (pro-sources.js)
 *   organizer    nom affiché du réseau (lightbox)
 *   membersOnly  true → badge « Réservé aux membres » sur la vignette
 *   price        tarif en clair (« 20€ », « Gratuit »), lightbox
 */

const fs = require("fs");
const path = require("path");
const { RESEAUX, byKey, communeDansRayon, RAYON_KM } = require("./pro-sources");
const PRO_CATEGORIES = require("./pro-categories");
const { applyAutoPosters } = require("./affiches-auto");

const DIR = __dirname;
const IN_AUTO = path.join(DIR, "events-pro.json");
const IN_MANUAL = path.join(DIR, "pro-manuel.json");
const FIRSTSEEN = path.join(DIR, "events-pro-firstseen.json");
const OUT = path.join(DIR, "data-pro.js");

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const todayISO = new Date().toISOString().slice(0, 10);

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return fallback; }
}

// Thèmes d'affiche par réseau : [fond haut, fond bas, accent, pictogramme].
// Le moteur cherche par `category` : on lui passe des thèmes indexés par
// réseau et on lui fait lire ev.network via un objet intermédiaire.
const PICTO = { afterwork: "🥂", "petit-dej": "☕", conference: "🎤", salon: "🏛️", formation: "🛠️", emploi: "💼", autre: "📌" };
function themesParReseau() {
  const t = {};
  for (const r of RESEAUX) t[r.key] = [r.colors[0], shade(r.colors[0], -0.55), r.colors[1], ""];
  t.autre = ["#374151", "#111827", "#d1d5db", ""];
  return t;
}
function shade(hex, pct) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v : 255 - v) * pct)));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, "0")).join("");
}

// ── Logos incrustés ───────────────────────────────────────────────────────
// Un SVG affiché en <img> ne peut charger aucune ressource externe : le logo
// est incrusté en data URI. Les fichiers viennent de pro-scrape.js
// (affiches-pro/logos/). Un logo manquant n'est jamais bloquant.
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" };
function dataURI(rel) {
  if (!rel) return "";
  const f = path.join(DIR, rel);
  if (!fs.existsSync(f)) return "";
  const ext = rel.split(".").pop().toLowerCase();
  return `data:${MIME[ext] || "image/png"};base64,${fs.readFileSync(f).toString("base64")}`;
}
function logoDuReseau(key) {
  const r = byKey(key);
  if (!r || !r.logo) return null;
  const dir = path.join(DIR, "affiches-pro", "logos");
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir).find(n => n.replace(/\.[a-z]+$/, "") === key);
  return file ? { uri: dataURI(path.posix.join("affiches-pro", "logos", file)), onDark: !!r.logoOnDark } : null;
}
function habiller(svg, ev, raw) {
  const reseau = logoDuReseau(ev.network);
  const hote = raw && raw.logoFile ? { uri: dataURI(raw.logoFile), onDark: false } : null;
  const medaillon = (hote && hote.uri) ? hote : reseau;
  let out = svg;
  // Filigrane : grand logo du réseau, très discret, derrière le titre.
  if (reseau && reseau.uri) {
    out = out.replace(/(<rect width="800" height="1200" fill="url\(#g\)"\/>)/,
      `$1\n  <image href="${reseau.uri}" x="60" y="300" width="680" height="680" preserveAspectRatio="xMidYMid meet" opacity="${reseau.onDark ? ".07" : ".10"}"/>`);
  }
  // Médaillon à la place du pictogramme (zone sûre : y 270 à 470).
  const picto = /<text x="400" y="420" text-anchor="middle" font-size="110">[^<]*<\/text>/;
  if (medaillon && medaillon.uri) {
    const plaque = medaillon.onDark ? "" : `<rect x="230" y="272" width="340" height="180" rx="26" fill="#ffffff" opacity=".96"/>`;
    const pad = medaillon.onDark ? 0 : 18;
    out = out.replace(picto,
      `${plaque}<image href="${medaillon.uri}" x="${230 + pad}" y="${272 + pad}" width="${340 - 2 * pad}" height="${180 - 2 * pad}" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    out = out.replace(picto, `<text x="400" y="420" text-anchor="middle" font-size="110">${PICTO[ev.category] || "📌"}</text>`);
  }
  return { out, logo: !!(medaillon && medaillon.uri) };
}

function toEvent(e, firstseen) {
  const r = byKey(e.network) || { name: e.source || "Réseau", short: e.source || "" };
  const uuid = `pro-${e.id}`;
  const d = new Date(e.date + "T12:00:00");
  const dateText = e.endDate && e.endDate > e.date
    ? `Du ${d.getDate()} au ${new Date(e.endDate + "T12:00:00").getDate()} ${MONTHS[new Date(e.endDate + "T12:00:00").getMonth()]} ${d.getFullYear()}`
    : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!firstseen[uuid]) firstseen[uuid] = todayISO;
  return {
    uuid,
    title: e.title,
    category: PRO_CATEGORIES[e.category] ? e.category : "autre",
    subcats: [r.name, e.price, e.membersOnly ? "réservé aux membres" : "ouvert à tous"].filter(Boolean),
    date: e.date,
    endDate: e.endDate || e.date,
    dateText: dateText.charAt(0).toUpperCase() + dateText.slice(1),
    schedule: e.time || "",
    place: e.place || "",
    city: e.city || "",
    free: !!e.free,
    reservation: true,                 // tous ces rendez-vous se font sur inscription
    image: e.image || null,
    url: e.url || r.agenda || r.site || "",
    source: e.network,
    addedAt: firstseen[uuid],
    network: e.network,
    organizer: r.name,
    membersOnly: !!e.membersOnly,
    price: e.price || "",
    description: e.description || "",
  };
}

function main() {
  const auto = readJSON(IN_AUTO, []);
  const manuel = readJSON(IN_MANUAL, []);
  const firstseen = readJSON(FIRSTSEEN, {});

  // Fusion : une entrée manuelle de même id COMPLÈTE l'automatique champ par
  // champ (seuls les champs renseignés l'emportent) ; sinon elle s'ajoute.
  const byId = new Map(auto.map(e => [e.id, e]));
  for (const m of manuel) {
    if (!m.id) continue;
    const base = byId.get(m.id);
    if (!base) { byId.set(m.id, { network: "manuel", ...m }); continue; }
    const fusion = { ...base };
    for (const [k, v] of Object.entries(m)) if (v !== "" && v !== null && v !== undefined) fusion[k] = v;
    byId.set(m.id, fusion);
  }

  const ecartes = { passes: 0, horsRayon: [], villeInconnue: [], enLigne: 0 };
  const kept = [];
  for (const e of byId.values()) {
    if (!e.date) continue;
    if ((e.endDate || e.date) < todayISO) { ecartes.passes++; continue; }
    if (e.online) { ecartes.enLigne++; continue; }
    const ok = communeDansRayon(e.city);
    if (ok === false) { ecartes.horsRayon.push(`${e.title} (${e.city})`); continue; }
    if (ok === null) { ecartes.villeInconnue.push(`${e.title} (${e.city || "?"})`); continue; }
    kept.push(e);
  }
  kept.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  const events = kept.map(e => toEvent(e, firstseen));

  // Affiches générées pour les événements sans image, aux couleurs du réseau.
  const themes = themesParReseau();
  const proxy = events.map(ev => ({ ...ev, category: themes[ev.network] ? ev.network : "autre" }));
  applyAutoPosters(proxy, {
    dir: "affiches-pro",
    themes,
    labels: {},
    labelOf: (ev) => (byKey(ev.network) || {}).short || (byKey(ev.network) || {}).name || "Rendez-vous pro",
  });
  // Le moteur a posé image/autoPoster sur les copies : on les reporte.
  proxy.forEach((p, i) => { events[i].image = p.image; if (p.autoPoster) events[i].autoPoster = true; });
  // Habillage : logo du réseau en filigrane derrière le titre et, en médaillon
  // à la place du pictogramme, le logo de l'hôte (Cafés Business) ou celui du
  // réseau. Sans logo disponible, le pictogramme de la catégorie.
  let avecLogo = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.autoPoster) continue;
    const f = path.join(DIR, ev.image);
    const svg = habiller(fs.readFileSync(f, "utf8"), ev, kept[i]);
    if (svg.logo) avecLogo++;
    fs.writeFileSync(f, svg.out);
  }
  if (avecLogo) console.log(`  🏷  ${avecLogo} affiche(s) avec logo incrusté (affiches-pro/logos/).`);

  // firstseen : seulement ce qui est encore à l'affiche.
  const fsClean = {};
  for (const ev of events) fsClean[ev.uuid] = firstseen[ev.uuid];
  fs.writeFileSync(FIRSTSEEN, JSON.stringify(fsClean, null, 2) + "\n");

  // Seules les catégories réellement présentes deviennent des filtres.
  const used = {};
  for (const ev of events) used[ev.category] = PRO_CATEGORIES[ev.category];

  // Annuaire des réseaux (section « Réseaux d'affaires » de pro.html).
  const logosDir = path.join(DIR, "affiches-pro", "logos");
  const logoFileOf = (key) => {
    if (!fs.existsSync(logosDir)) return "";
    const f = fs.readdirSync(logosDir).find(n => n.replace(/\.[a-z]+$/, "") === key);
    return f ? `affiches-pro/logos/${f}` : "";
  };
  const reseaux = RESEAUX.map(r => ({
    key: r.key, name: r.name, site: r.site, agenda: r.agenda || "", blurb: r.blurb,
    logo: logoFileOf(r.key), logoOnDark: !!r.logoOnDark,
    frequency: r.frequency || "", membersOnly: !!r.membersOnly, scrape: !!r.scrape,
    count: events.filter(ev => ev.network === r.key).length,
  }));

  const header =
`// ⚠️ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
// Événements professionnels de Nancy et de ses communes voisines (rayon ${RAYON_KM} km).
// Sources : agendas publics des réseaux d'affaires, de la CCI, du MEDEF 54 et
// du Centre Prouvé (voir pro-sources.js / pro-scrape.js).
// Régénérer : node pro-scrape.js && node update-pro.js
// Généré le : ${todayISO} — ${events.length} événement(s) à venir.

`;
  const body =
    "const CATEGORIES = " + JSON.stringify(used, null, 2) + ";\n\n" +
    `const GENERATED_AT = ${JSON.stringify(todayISO)};\n\n` +
    "const RESEAUX = " + JSON.stringify(reseaux, null, 2) + ";\n\n" +
    "const EVENTS = " + JSON.stringify(events, null, 2) + ";\n";
  fs.writeFileSync(OUT, header + body);

  const parReseau = {};
  for (const ev of events) parReseau[ev.network] = (parReseau[ev.network] || 0) + 1;
  console.log(`data-pro.js écrit : ${events.length} événement(s)`);
  console.log("  par réseau :", Object.entries(parReseau).map(([k, n]) => `${k}=${n}`).join("  ") || "(aucun)");
  console.log(`  écartés : ${ecartes.passes} passé(s), ${ecartes.enLigne} en ligne, ${ecartes.horsRayon.length} hors rayon, ${ecartes.villeInconnue.length} ville inconnue`);
  for (const t of ecartes.horsRayon) console.log("    hors rayon :", t);
  for (const t of ecartes.villeInconnue) console.log("    ville inconnue :", t);
}

if (require.main === module) main();
module.exports = { toEvent };
