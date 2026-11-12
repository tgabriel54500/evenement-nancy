#!/usr/bin/env node
/**
 * Source « Ville d'Essey-lès-Nancy » (agenda municipal) pour le pipeline.
 *
 * Site Drupal (plateforme Stratis). On combine deux flux publics :
 *   1. La PAGE /agenda (rendue côté serveur, paginée ?page=0,1,2…) : chaque carte
 *      `<article class="event-item">` porte la date EXACTE (attribut
 *      `datetime="AAAA-MM-JJ"`, deux pour un multi-jours), la catégorie
 *      (`.event-item__category`), le titre + lien `/agenda/<slug>`, l'image
 *      (srcset, dont une version 2x) et l'id de nœud Drupal.
 *   2. Le flux iCal (…stratis.pro/feed/events/list/ical.ics) : pour les
 *      prochains événements, il fournit le LIEU (LOCATION) et l'HORAIRE
 *      (DTSTART/DTEND) absents de la liste HTML. On l'indexe par URL.
 *
 * Schéma de sortie commun à app.js / galerie.js (events-essey.json).
 * free/reservation : non exposés ici → laissés à enrich-pricing.js (règle
 * « rien d'indiqué = gratuit », municipal). Essey y est inclus.
 *
 * Usage : node essey.js [--max=N]
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.esseylesnancy.fr";
const LISTING = ORIGIN + "/agenda";
const ICAL = "https://esseylesnancy.fr.stratis.pro/feed/events/list/ical.ics";
const CITY = "Essey-lès-Nancy";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Catégorie : on devine d'abord au TITRE (plus précis), puis on retombe sur le
// thème éditorial Drupal, sinon « autre ». Clés alignées sur les autres sources.
const BY_TITLE = [
  [/expo/i,                                                  { key: "exposition",        label: "Expositions",              emoji: "🖼️" }],
  [/(festival|fête|fete|kermesse|guinguette|marché de noël)/i, { key: "festival",        label: "Festivals",                emoji: "🎪" }],
  [/(concert|récital|recital|chorale|fanfare|musique sacrée)/i, { key: "musiques-actuelles", label: "Musiques actuelles",   emoji: "🎸" }],
  [/(théâtre|theatre|spectacle|danse|humour|one man|one woman|conte|cirque)/i, { key: "spectacle", label: "Spectacles",     emoji: "🎭" }],
  [/(conférence|conference|rencontre|débat|debat|lecture|café|cine|ciné|projection)/i, { key: "conference", label: "Conférences & rencontres", emoji: "🎓" }],
  [/(conseil municipal|conseil de quartier|conseils de quartier|tirage au sort|élection|election|citoyen)/i, { key: "citoyennete", label: "Citoyenneté", emoji: "🤝" }],
  [/(atelier|stage|porte ouverte|portes ouvertes|inscription|club|initiation|repair)/i, { key: "activite", label: "Activités & ateliers", emoji: "🎨" }],
];
const BY_THEME = {
  "Petite enfance":          { key: "jeune-public", label: "Jeune public",           emoji: "🧸" },
  "Jeunesse":                { key: "jeune-public", label: "Jeune public",           emoji: "🧸" },
  "Vie municipale":          { key: "citoyennete",  label: "Citoyenneté",            emoji: "🤝" },
  "Conseil municipal":       { key: "citoyennete",  label: "Citoyenneté",            emoji: "🤝" },
  "Conseils de quartier":    { key: "citoyennete",  label: "Citoyenneté",            emoji: "🤝" },
  "Vie sociale":             { key: "citoyennete",  label: "Citoyenneté",            emoji: "🤝" },
  "Vie associative":         { key: "activite",     label: "Activités & ateliers",   emoji: "🎨" },
  "Manifestation culturelle":{ key: "spectacle",    label: "Spectacles",             emoji: "🎭" },
  "Jeudis de la culture":    { key: "spectacle",    label: "Spectacles",             emoji: "🎭" },
};
function resolveCategory(title, theme) {
  for (const [re, c] of BY_TITLE) if (re.test(title || "")) return c;
  if (theme && BY_THEME[theme]) return BY_THEME[theme];
  return { key: "autre", label: "Autre", emoji: "📌" };
}

const decode = (s) => (s || "")
  .replace(/&amp;/g, "&").replace(/&#0?39;|&#x27;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, " ").replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à")
  .replace(/&ecirc;/g, "ê").replace(/&ccedil;/g, "ç").replace(/&deg;/g, "°").replace(/\s+/g, " ").trim();

async function getText(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

// ── iCal : URL -> { place, schedule } (lieu + horaire des prochains events) ──
function hm(stamp) {                                  // "20260615T140000" -> "14h" / "14h30"
  const m = String(stamp || "").match(/T(\d{2})(\d{2})/);
  if (!m) return null;
  return m[2] === "00" ? `${+m[1]}h` : `${+m[1]}h${m[2]}`;
}
async function fetchIcalIndex() {
  const idx = {};
  let ics; try { ics = await getText(ICAL); } catch { return idx; }
  if (!ics) return idx;
  for (const block of ics.split("BEGIN:VEVENT").slice(1)) {
    const url = (block.match(/URL[^:]*:(\S+)/) || [])[1];
    if (!url) continue;
    const loc = decode((block.match(/LOCATION:(.+)/) || [])[1] || "");
    const s = hm((block.match(/DTSTART[^:]*:(\S+)/) || [])[1]);
    const e = hm((block.match(/DTEND[^:]*:(\S+)/) || [])[1]);
    const schedule = s ? (e && e !== s ? `${s} à ${e}` : s) : "";
    idx[url.replace(/\/$/, "")] = { place: loc, schedule };
  }
  return idx;
}

// ── Parse d'une page de listing -> cartes ───────────────────────────────────
function biggestSrc(srcset) {                          // "u1 1x, u2 2x" -> u2
  if (!srcset) return null;
  const parts = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
function parseCards(html, ical, todayISO) {
  const out = [];
  for (const b of html.split("<article data-history-node-id=").slice(1)) {
    const nid = (b.match(/^="?(\d+)"?/) || b.match(/^(\d+)/) || [])[1];
    const slug = (b.match(/href="\/agenda\/([^"#?]+)"/) || [])[1];
    if (!slug) continue;
    const dts = [...b.matchAll(/datetime="(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
    if (!dts.length) continue;
    const date = dts[0], endDate = dts[dts.length - 1];
    const title = decode((b.match(/event-item__title[^>]*>\s*<a[^>]*>([^<]+)</) || [])[1] || "");
    if (!title) continue;
    const theme = decode((b.match(/event-item__category[^>]*>([^<]+)</) || [])[1] || "");
    const image = biggestSrc((b.match(/data-srcset="([^"]+)"/) || [])[1] || (b.match(/srcset="([^"]+)"/) || [])[1])
               || (b.match(/data-src="([^"]+)"/) || [])[1] || null;
    const url = ORIGIN + "/agenda/" + slug;
    const extra = ical[url.replace(/\/$/, "")] || {};
    const cat = resolveCategory(title, theme);
    out.push({
      uuid: "essey-" + (nid || slug),
      title,
      category: cat.key,
      catLabel: cat.label,
      catEmoji: cat.emoji,
      subcats: theme ? [theme] : [],
      date,
      endDate,
      dateText: "",
      schedule: extra.schedule || "",
      place: extra.place || "",
      city: CITY,
      free: true,            // municipal : par défaut gratuit (affiné par enrich-pricing.js)
      reservation: false,
      image,
      url,
      source: "essey",
    });
  }
  return out;
}

async function collect({ max = null } = {}) {
  process.stderr.write("→ Essey-lès-Nancy : lecture de l'agenda…\n");
  const todayISO = new Date().toISOString().slice(0, 10);
  const ical = await fetchIcalIndex();
  const seen = new Set();
  let events = [];
  for (let page = 0; page < 30; page++) {
    const html = await getText(`${LISTING}?page=${page}`);
    if (!html) break;
    const cards = parseCards(html, ical, todayISO);
    if (!cards.length) break;
    let fresh = 0;
    for (const c of cards) { if (seen.has(c.uuid)) continue; seen.add(c.uuid); events.push(c); fresh++; }
    process.stderr.write(`  page ${page} : ${seen.size} événements\n`);
    if (cards.length < 12 || fresh === 0) break;
    if (max && events.length >= max) break;
  }
  events = events
    .filter((e) => e.endDate >= todayISO || e.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (max) events = events.slice(0, max);
  process.stderr.write(`✓ ${events.length} événements Essey-lès-Nancy avec date.\n`);
  return events;
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) { const m = a.match(/^--([a-z]+)(?:=(.*))?$/); if (m) o[m[1]] = m[2] === undefined ? true : m[2]; }
  return o;
}
async function main() {
  const a = parseArgs(process.argv.slice(2));
  const list = await collect({ max: a.max ? Number(a.max) : null });
  const out = a.out || path.join(__dirname, "events-essey.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}
if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}
module.exports = { collect, resolveCategory, parseCards, fetchIcalIndex };
