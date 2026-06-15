#!/usr/bin/env node
/**
 * 14e source — Ville de Ludres (commune du Grand Nancy).
 *   Agenda : https://www.ludres.com/liste-evenements/  (WordPress + JetEngine/Elementor)
 *
 * Particularité : le CPT `evenements` est exposé en REST
 * (https://www.ludres.com/wp-json/wp/v2/evenements) avec titre / image (featured)
 * / taxonomie `categorie` / description — MAIS les dates JetEngine ne sont PAS
 * enregistrées dans le `meta` REST. Elles ne sont visibles que dans la PAGE LISTE,
 * où chaque carte affiche, dans l'ordre du DOM : jour (nombre) · mois · lieu.
 * On croise donc les deux : liste (slug→{jour,mois,lieu}) + REST (slug→{titre,image,
 * catégorie}). Pas d'horaire ni d'année dans la liste → horaire vide, année inférée.
 *
 * Sortie : events-ludres.json (schéma EVENTS, source:"ludres", uuid `lud-<id>`).
 * Régénérer : node ludres.js   |   Fusionné par update-events.js s'il est présent.
 */

const fs = require("fs");
const path = require("path");
const { resolveCategoryFrom } = require("./import-ics.js");
let cleanCity = (s) => s;
try { ({ cleanCity } = require("./normalize.js")); } catch {}

const LIST_URL = "https://www.ludres.com/liste-evenements/";
const REST_URL = "https://www.ludres.com/wp-json/wp/v2/evenements?per_page=100&_embed=1";
const UA = { "User-Agent": "Mozilla/5.0 (agenda-nancy bot)" };

const MONTHS = { janvier: 1, "février": 2, fevrier: 2, mars: 3, avril: 4, mai: 5,
  juin: 6, juillet: 7, "août": 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  "décembre": 12, decembre: 12 };

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#8211;|&#x2013;/g, "–").replace(/&#8217;|&#x2019;/g, "’")
    .replace(/&#8230;/g, "…").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}

// Mappe la taxonomie `categorie` de Ludres vers nos clés (repli sur le titre).
function resolveLudresCategory(title, terms, description) {
  const t = terms.join(" ").toLowerCase();
  if (/spectacle|théâtre|theatre/.test(t)) return { key: "spectacle", label: "Spectacles", emoji: "🎭" };
  if (/expo/.test(t)) return { key: "exposition", label: "Expositions", emoji: "🖼️" };
  if (/musique|concert/.test(t)) return { key: "musiques-actuelles", label: "Musiques actuelles", emoji: "🎸" };
  if (/sport|loisir/.test(t)) return { key: "activite", label: "Activités & ateliers", emoji: "🎨" };
  // Repli : on devine au titre + termes + description (catégorisation multi-champs).
  return resolveCategoryFrom({ title, description: `${terms.join(" ")} ${description}` });
}

// Page liste -> [{slug, day, month, place}] dans l'ordre du DOM.
function parseListing(html) {
  // slugs dans l'ordre (dédupliqués)
  const slugs = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="https:\/\/www\.ludres\.com\/liste-evenements\/([a-z0-9][a-z0-9-]+)\/"/g)) {
    if (m[1] !== "feed" && !seen.has(m[1])) { seen.add(m[1]); slugs.push(m[1]); }
  }
  // valeurs des champs dynamiques dans l'ordre : [jour, mois, lieu] répété
  const vals = [...html.matchAll(/jet-listing-dynamic-field__content[^>]*>([^<]{1,80})</g)]
    .map((m) => decodeEntities(m[1])).filter(Boolean);
  const out = [];
  for (let i = 0, k = 0; i + 2 < vals.length && k < slugs.length; i += 3, k++) {
    out.push({ slug: slugs[k], day: vals[i], month: vals[i + 1], place: vals[i + 2] });
  }
  return out;
}

function toISO(day, monthName, todayISO) {
  const d = parseInt(day, 10);
  const mon = MONTHS[String(monthName || "").toLowerCase().trim()];
  if (!d || !mon) return "";
  const [ty, tm, td] = todayISO.split("-").map(Number);
  let year = ty;
  if (mon < tm || (mon === tm && d < td)) year += 1;  // mois déjà passé -> année suivante
  return `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function featuredImage(e) {
  const m = e._embedded && e._embedded["wp:featuredmedia"] && e._embedded["wp:featuredmedia"][0];
  return (m && (m.source_url || (m.media_details && m.media_details.sizes &&
    (m.media_details.sizes.medium_large || m.media_details.sizes.large || {}).source_url))) || null;
}

function termNames(e) {
  return ((e._embedded && e._embedded["wp:term"]) || []).flat()
    .filter((t) => t && t.taxonomy === "categorie").map((t) => t.name);
}

async function main() {
  console.log("→ Ludres : agenda municipal (liste + REST)…");
  const [listRes, restRes] = await Promise.all([
    fetch(LIST_URL, { headers: UA }),
    fetch(REST_URL, { headers: UA }),
  ]);
  if (!listRes.ok) throw new Error("liste HTTP " + listRes.status);
  if (!restRes.ok) throw new Error("REST HTTP " + restRes.status);
  const html = await listRes.text();
  const rest = await restRes.json();

  // Index par slug exact ET par « slug de base » (sans suffixe numérique), car la
  // liste référence les occurrences récurrentes avec un n° (bebes-lecteurs-16) que
  // le REST n'a pas (il garde bebes-lecteurs-5). 1re occurrence gardée pour la base.
  const baseOf = (s) => s.replace(/-?\d+$/, "");
  const bySlug = new Map();
  const byBase = new Map();
  for (const e of rest) {
    bySlug.set(e.slug, e);
    const b = baseOf(e.slug);
    if (!byBase.has(b)) byBase.set(b, e);
  }
  const findRest = (slug) => bySlug.get(slug) || byBase.get(baseOf(slug)) || null;

  const cards = parseListing(html);
  console.log(`  ${cards.length} cartes dans la liste, ${rest.length} fiches en REST.`);

  const todayISO = new Date().toISOString().slice(0, 10);
  const events = [];
  for (const c of cards) {
    const e = bySlug.get(c.slug);
    const date = toISO(c.day, c.month, todayISO);
    if (!date) continue;
    const title = decodeEntities((e && e.title && e.title.rendered) || c.slug.replace(/-/g, " "));
    const terms = e ? termNames(e) : [];
    const desc = e && e.content ? decodeEntities(e.content.rendered).slice(0, 300) : "";
    const cat = resolveLudresCategory(title, terms, desc);
    events.push({
      uuid: `lud-${(e && e.id) || c.slug}`,
      title,
      category: cat.key,
      catLabel: cat.label,
      catEmoji: cat.emoji,
      subcats: terms,
      date,
      endDate: date,
      dateText: "",
      schedule: "",
      place: c.place || "",
      city: cleanCity("Ludres") || "Ludres",
      free: false,
      reservation: false,
      image: e ? featuredImage(e) : null,
      url: (e && e.link) || `https://www.ludres.com/liste-evenements/${c.slug}/`,
      source: "ludres",
    });
  }

  const byId = new Map();
  for (const e of events) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));

  const out = path.join(__dirname, "events-ludres.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  console.log(`✓ ${list.length} événement(s) Ludres → ${path.relative(__dirname, out)}`);
  const byCat = {};
  for (const e of list) byCat[e.catLabel] = (byCat[e.catLabel] || 0) + 1;
  console.log("  Catégories :", Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(", ") || "—");
  console.log("  Puis : node update-events.js");
}

if (require.main === module) main().catch((e) => { console.error("✗", e.message); process.exit(1); });

module.exports = { parseListing, toISO };
