#!/usr/bin/env node
/**
 * Source « L'Autre Canal » (SMAC — scène de musiques actuelles de Nancy) pour
 * le pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   update-events.js fusionne plusieurs agendas. Ce module ajoute la
 *   programmation de L'Autre Canal (https://lautrecanalnancy.fr/agenda) :
 *   concerts (rock, rap, électro, jazz…), rendez-vous, événements jeune public.
 *
 * Comment ça marche :
 *   Site Drupal. La page /agenda rend TOUTE la liste côté serveur (mosaïque
 *   `lac_liste_evenements`, ~95 fiches sur 6 mois) → une seule requête suffit,
 *   pas de pagination à suivre. Chaque carte `<article>` porte :
 *     - lien     : <a href="/agenda/<slug>">                       (→ url + uuid)
 *     - catégorie: classes `term-concert` / `term-scolaires` …     (type)
 *     - genres   : <span class="evt-tags-item">Rock</span> …       (→ subcats)
 *     - gratuité : classe `term-gratuit` sur l'<article>           (→ free !)
 *     - statut   : <span class="liste-evenement-statut">tickets</span> (billetterie)
 *     - date     : jour + /MM (SANS année) dans `.mosaique-evt-date`
 *     - titre    : <span class="lien-hover">…</span>
 *     - image    : data-srcset (poster A4)
 *
 *   ⚠️ La carte ne donne PAS l'année. La liste n'est pas strictement triée par
 *   date → on déduit l'année par « prochaine occurrence » : pour un agenda qui
 *   ne liste que des dates à venir, jour/mois ≥ aujourd'hui ⇒ année courante,
 *   sinon année+1 (vérifié contre le JSON-LD des fiches : 17/06 → 2026).
 *
 *   free/reservation sont FIABLES dès la liste (classe `term-gratuit` + statut
 *   billetterie) → cette source n'a PAS besoin de enrich-pricing.js et en est
 *   exclue (sinon la règle « indéterminé = gratuit » brade des concerts payants).
 *
 * Usage :
 *   node autre-canal.js                 # -> events-autre-canal.json
 *   node autre-canal.js --max=10        # test
 *
 * Module :  const { collect } = require("./autre-canal");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://lautrecanalnancy.fr";
const AGENDA = ORIGIN + "/agenda";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const PLACE = "L'Autre Canal";
const CITY = "Nancy";

// Type Drupal (classe `term-…` de l'<article>) -> clé commune. Salle de
// musiques actuelles : le concert domine ; les séances scolaires -> jeune public.
function resolveCategory(termType) {
  switch (termType) {
    case "concert":
    case "etudiantes":   return { key: "musiques-actuelles", label: "Musiques actuelles",     emoji: "🎸" };
    case "scolaires":    return { key: "jeune-public",       label: "Jeune public",           emoji: "🧸" };
    default:             return { key: "activite",           label: "Activités & ateliers",   emoji: "🎨" };
  }
}

const decode = (s) =>
  (s || "")
    .replace(/&amp;/g, "&").replace(/&#0?39;|&#x27;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ecirc;/g, "ê")
    .replace(/&ccedil;/g, "ç").replace(/&deg;/g, "°").replace(/\s+/g, " ").trim();

async function getText(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

// Année par « prochaine occurrence » : jour/mois ≥ aujourd'hui ⇒ année courante.
function inferISO(day, month, today) {
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  const year = (month > tm || (month === tm && day >= td)) ? ty : ty + 1;
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Plus grande image d'un data-srcset ("url 360w, url 480w, …" -> dernière url).
function biggestSrc(srcset) {
  if (!srcset) return null;
  const parts = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function parseCards(html, today) {
  const out = [];
  const blocks = html.split("<article ").slice(1);
  for (const b of blocks) {
    const slug = (b.match(/href="\/agenda\/([^"#?]+)"/) || [])[1];
    if (!slug || slug === "archives") continue;
    const day = Number((b.match(/evt-date-num">\s*(\d{1,2})/) || [])[1]);
    const mon = Number((b.match(/evt-date-mois">\s*\/(\d{2})/) || [])[1]);
    if (!day || !mon) continue;                       // pas une carte d'événement datée

    const termType = (b.match(/^[^>]*\bterm-(concert|scolaires|etudiantes|rendez-vous|evenement|grande-halle|halle-ouverte)\b/) || [])[1] || "";
    const free = /\bterm-gratuit\b/.test(b.slice(0, 400));   // classe sur l'<article>
    const tickets = /liste-evenement-statut[^>]*>\s*tickets/i.test(b);
    const title = decode((b.match(/class="lien-hover">([^<]+)</) || [])[1]
      || (b.match(/aria-label="([^"]+)"/) || [])[1] || "");
    const image = biggestSrc((b.match(/data-srcset="([^"]+)"/) || [])[1]);
    const genres = [...b.matchAll(/evt-tags-item[^>]*>([^<]+)</g)].map((m) => decode(m[1])).filter(Boolean);

    if (!title) continue;
    const date = inferISO(day, mon, today);
    const cat = resolveCategory(termType);
    out.push({
      uuid: "lcn-" + slug,
      title,
      category: cat.key,
      catLabel: cat.label,
      catEmoji: cat.emoji,
      subcats: [...new Set(genres)],
      date,
      endDate: date,
      dateText: "",
      schedule: "",
      place: PLACE,
      city: CITY,
      // term-gratuit = entrée gratuite ; sinon salle billetterie (payant + résa).
      free,
      reservation: !free && tickets ? true : !free,
      image,
      url: ORIGIN + "/agenda/" + slug,
      source: "autre-canal",
    });
  }
  return out;
}

async function collect({ max = null } = {}) {
  process.stderr.write("→ L'Autre Canal : lecture de l'agenda…\n");
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const html = await getText(AGENDA);
  let list = parseCards(html, today)
    .filter((e) => e.endDate >= todayISO || e.date >= todayISO);
  // Dédoublonnage par uuid puis tri par date.
  const byId = new Map();
  for (const e of list) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (max) list = list.slice(0, max);
  process.stderr.write(`✓ ${list.length} événements L'Autre Canal avec date.\n`);
  return list;
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) { const m = a.match(/^--([a-z]+)(?:=(.*))?$/); if (m) o[m[1]] = m[2] === undefined ? true : m[2]; }
  return o;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const list = await collect({ max: a.max ? Number(a.max) : null });
  const out = a.out || path.join(__dirname, "events-autre-canal.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseCards, inferISO };
