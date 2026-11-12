#!/usr/bin/env node
/**
 * 9e source « Salle / Galerie Poirel » (Nancy) — concerts, musique classique,
 * spectacles et expositions de l'équipement culturel municipal Poirel.
 *
 * Bonne surprise : poirel.nancy.fr/agenda tourne sur le MÊME socle que l'agenda
 * de la Ville de Nancy (intégration Grand Nancy `agenda-integration.grandnancy.eu`),
 * avec sa propre ENTITÉ `sgp`. L'endpoint JSON est donc identique en forme à celui
 * de la Ville (`/api/vdn/events`) : `/api/sgp/events`. Pas de scraping HTML, pas de
 * CORS exploitable côté navigateur → instantané local comme les autres sources.
 *
 * Le mapping est volontairement identique à celui de la source Ville de Nancy
 * (cf. update-events.js / server.js) pour que les filtres regroupent les origines.
 *
 * Usage :
 *   node poirel.js                 # -> events-poirel.json
 *   node poirel.js --out=chemin    # fichier de sortie alternatif
 *
 * Module :  const { collect } = require("./poirel");
 */

const fs = require("fs");
const path = require("path");

const ENTITY = "sgp";
const API = `https://agenda-integration.grandnancy.eu/api/${ENTITY}/events`;
const DETAIL_URL = "https://poirel.nancy.fr/agenda/details-agenda?uuid=";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Résolution de catégorie par NOM (mêmes clés que la Ville de Nancy), avec repli.
function resolveCategory(mainCategory) {
  const name = (mainCategory && mainCategory.name) || "Autre";
  const table = {
    "Activité - Animation":      { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
    "Musiques actuelles":        { key: "musiques-actuelles", label: "Musiques actuelles",       emoji: "🎸" },
    "Jeune public":              { key: "jeune-public",       label: "Jeune public",             emoji: "🧸" },
    "Spectacle":                 { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
    "Exposition":                { key: "exposition",         label: "Expositions",              emoji: "🖼️" },
    "Musique classique":         { key: "musique-classique",  label: "Musique classique",        emoji: "🎻" },
    "Manifestation - Festival":  { key: "festival",           label: "Festivals",                emoji: "🎪" },
    "Conférence - Rencontre":    { key: "conference",         label: "Conférences & rencontres", emoji: "🎓" },
    "Citoyenneté":               { key: "citoyennete",        label: "Citoyenneté",              emoji: "🤝" },
  };
  return table[name] || { key: "autre", label: name, emoji: "📌" };
}

const httpsPrefix = (u) => (!u ? null : u.startsWith("http") ? u : "https://" + u);

function pickImage(mediaUrl) {
  if (!mediaUrl) return null;
  const c = mediaUrl.crop || {};
  const o = mediaUrl.originale || {};
  // Tous les événements n'ont pas de version recadrée : on retombe sur l'originale.
  return httpsPrefix(c.medium || c.large || c.small || o.medium || o.large || o.small);
}

// startDate/endDate font foi pour le tri ; un événement en cours est calé sur
// aujourd'hui pour remonter dans la liste. dateList n'enrichit que l'horaire.
function cleanSchedule(s) { return String(s || "").replace(/;+\s*$/, "").trim(); }
function pickWhen(ev, todayISO) {
  const start = (ev.startDate || "").slice(0, 10);
  const end = (ev.endDate || ev.startDate || "").slice(0, 10);
  const sortDate = start >= todayISO ? start : (end >= todayISO ? todayISO : start);
  const list = Array.isArray(ev.dateList) ? ev.dateList.filter(d => d.date && d.schedule) : [];
  const inRange = list.filter(d => d.date >= start && d.date <= end);
  const upcoming = inRange.filter(d => d.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date));
  const chosen = upcoming[0] || inRange[0];
  return { sortDate, schedule: chosen ? cleanSchedule(chosen.schedule) : "" };
}

async function collect() {
  process.stderr.write(`→ Salle Poirel (entité ${ENTITY}) : récupération de l'agenda…\n`);
  const res = await fetch(API, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) throw new Error("Poirel API HTTP " + res.status);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error("réponse Poirel inattendue (pas un tableau)");
  const todayISO = new Date().toISOString().slice(0, 10);

  const list = raw
    .map((ev) => {
      const cat = resolveCategory(ev.mainCategory);
      const when = pickWhen(ev, todayISO);
      const place = ev.place || {};
      const lastDate = (ev.endDate || ev.startDate || "").slice(0, 10);
      return {
        uuid: "po-" + ev.uuid,                  // préfixe pour éviter toute collision d'uuid
        title: ev.name,
        category: cat.key,
        catLabel: cat.label,                    // retiré au rendu, sert à construire CATEGORIES
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
        url: DETAIL_URL + ev.uuid,
        source: "poirel",
      };
    })
    .filter((e) => e.endDate >= todayISO || e.date >= todayISO)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  process.stderr.write(`✓ ${list.length} événements Salle Poirel.\n`);
  return list;
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = (args.find((a) => a.startsWith("--out=")) || "").split("=")[1];
  const list = await collect();
  const out = outArg || path.join(__dirname, "events-poirel.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory };
