#!/usr/bin/env node
/**
 * Source « ICI-C-NANCY.FR » (agenda des sorties à Nancy et en Lorraine) pour le
 * pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js agrège déjà plusieurs agendas institutionnels (Ville de Nancy,
 *   Destination Nancy, Nancy Curieux, Vandœuvre…). Ce module ajoute l'agenda du
 *   média local ICI-C-NANCY (https://www.ici-c-nancy.fr/agenda.html), qui couvre
 *   concerts, spectacles, salons… de toute la métropole / Lorraine.
 *
 * Comment ça marche :
 *   Le site est un Joomla + composant iCagenda, protégé par un « challenge »
 *   anti-bot (nginx) : une 1re requête sur /challenge pose un cookie, sans lequel
 *   toutes les pages bouclent en 302. On récupère donc ce cookie puis on lit la
 *   page /agenda.html. Tout y est server-side : chaque carte `.ic-list-event`
 *   porte le titre, la catégorie, le lieu, l'image et — dans l'URL de la fiche
 *   (/agenda/<id>-<ville>-<slug>/<AAAA-MM-JJ-HH-MM>.html) — la date ET l'heure de
 *   l'occurrence. Aucune fiche détail n'est donc nécessaire.
 *
 *   On normalise vers le schéma commun attendu par app.js :
 *     { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *       place, city, free, reservation, image, url, source }
 *
 * Usage :
 *   node ici-c-nancy.js              # -> events-ici-c-nancy.json
 *
 * S'utilise aussi comme module :  const { collect } = require("./ici-c-nancy");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.ici-c-nancy.fr";
const LISTING = ORIGIN + "/agenda.html";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Catégories ────────────────────────────────────────────────────────────
// iCagenda classe par catégorie libre (Humour, Salon, Musique…). On les mappe
// vers les clés du site, en réutilisant celles déjà définies par les autres
// sources (mêmes label/emoji pour que CATEGORIES reste cohérent : la 1re source
// qui définit une clé gagne dans update-events.js).
const KEY_META = {
  "spectacle":          { label: "Spectacles",               emoji: "🎭" },
  "musiques-actuelles": { label: "Musiques actuelles",       emoji: "🎸" },
  "musique-classique":  { label: "Musique classique",        emoji: "🎻" },
  "festival":           { label: "Festivals",                emoji: "🎪" },
  "exposition":         { label: "Expositions",              emoji: "🖼️" },
  "jeune-public":       { label: "Jeune public",             emoji: "🧸" },
  "famille":            { label: "Famille",                  emoji: "👨‍👩‍👧" },
  "conference":         { label: "Conférences & rencontres", emoji: "🎓" },
  "nature":             { label: "Nature",                   emoji: "🌳" },
  "sport":              { label: "Sport",                    emoji: "⚽" },
  "autre":              { label: "Autre",                    emoji: "📌" },
};
const CAT_BY_NAME = {
  "humour": "spectacle", "théâtre": "spectacle", "theatre": "spectacle",
  "spectacle": "spectacle", "danse": "spectacle", "cirque": "spectacle",
  "one man show": "spectacle", "café-théâtre": "spectacle", "cinéma": "spectacle",
  "musique": "musiques-actuelles", "concert": "musiques-actuelles",
  "musique classique": "musique-classique", "classique": "musique-classique", "opéra": "musique-classique",
  "salon": "festival", "foire": "festival", "marché": "festival", "brocante": "festival",
  "festival": "festival", "fête": "festival", "fete": "festival",
  "exposition": "exposition", "expo": "exposition",
  "plein air": "nature", "nature": "nature", "balade": "nature", "randonnée": "nature",
  "sport": "sport",
  "jeune public": "jeune-public", "enfants": "jeune-public",
  "famille": "famille",
  "conférence": "conference", "conference": "conference", "rencontre": "conference",
};
function resolveCategory(name) {
  const key = CAT_BY_NAME[(name || "").trim().toLowerCase()] || "autre";
  const meta = KEY_META[key];
  return { key, label: meta.label, emoji: meta.emoji };
}

// ── HTTP : challenge anti-bot puis pages, en réutilisant le cookie ──────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let COOKIE = "";

async function ensureCookie() {
  if (COOKIE) return COOKIE;
  // 1re requête : /challenge pose le cookie nginx (sinon tout boucle en 302).
  const res = await fetch(ORIGIN + "/challenge", {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "fr-FR,fr;q=0.9" },
    redirect: "manual",
  });
  const sc = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  COOKIE = sc.map((s) => s.split(";")[0]).join("; ");
  return COOKIE;
}

async function getText(url, tries = 3) {
  const cookie = await ensureCookie();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA, Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9", Cookie: cookie,
        },
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

const decodeEntities = (s) =>
  (s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    // iCagenda émet parfois des entités EN MAJUSCULES (&QUOT; &AMP;).
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ");
const stripTags = (s) => decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Libellé de période lisible (jours multiples) à partir des dates ISO réelles.
// "" pour un jour unique → dateLabel() formatera alors `date` côté front.
function periodText(startISO, endISO) {
  if (!startISO || !endISO || endISO === startISO) return "";
  const [y1, m1, d1] = startISO.split("-").map(Number);
  const [y2, m2, d2] = endISO.split("-").map(Number);
  if (y1 !== y2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} ${y1} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  return `Du ${d1} au ${d2} ${MONTH_NAMES[m1 - 1]} ${y1}`;
}

// ── Parsing du listing ─────────────────────────────────────────────────────
function parseListing(html) {
  const occ = [];
  // Chaque carte = un bloc .ic-list-event ... jusqu'au prochain (ou fin de liste).
  const re = /<div class="ic-list-event ic-clearfix ic-event-id-(\d+)">([\s\S]*?)(?=<div class="ic-list-event ic-clearfix ic-event-id-\d+">|<div class="ic-pagination|<\/form>)/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const block = m[2];
    // URL de la fiche : porte l'id et la date+heure de l'occurrence.
    const href = (block.match(/href="(\/agenda\/\d+-[^"]+\/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.html)"/) || []);
    if (!href[1]) continue;
    const [, url, Y, Mo, D, H, Mi] = href;
    const dateISO = `${Y}-${Mo}-${D}`;
    const time = `${H}:${Mi}`;
    const title = stripTags((block.match(/<div class="ic-event-title">[\s\S]*?<h2>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "");
    const catName = stripTags((block.match(/ic-title-cat-btn[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "");
    const img = (block.match(/ic-box-date"[^>]*background-image:\s*url\(([^)]+)\)/) || [])[1] || null;
    // .ic-place : "Espace Chaudeau - Ludres, France"
    const placeRaw = stripTags((block.match(/<div class="place ic-place">([\s\S]*?)<\/div>/) || [])[1] || "");
    let place = placeRaw, city = "";
    const dash = placeRaw.split(/\s-\s/);
    if (dash.length >= 2) {
      place = dash[0].trim();
      city = dash[1].replace(/,\s*France\s*$/i, "").trim();
    }
    occ.push({ id, url: ORIGIN + url, dateISO, time, title, catName, img, place, city });
  }
  return occ;
}

// ── Normalisation : regroupe les occurrences d'un même événement ────────────
function buildEvents(occ, todayISO) {
  const byId = new Map();
  for (const o of occ) {
    if (!byId.has(o.id)) byId.set(o.id, []);
    byId.get(o.id).push(o);
  }
  const out = [];
  for (const [id, list] of byId) {
    list.sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time));
    // Prochaine occurrence à venir (sinon la 1re) pour le tri et l'horaire.
    const next = list.find((o) => o.dateISO >= todayISO) || list[0];
    const first = list[0], last = list[list.length - 1];
    const cat = resolveCategory(next.catName);
    out.push({
      uuid: "icn-" + id,
      title: next.title,
      category: cat.key,
      catLabel: cat.label, // retiré au rendu, sert à construire CATEGORIES
      catEmoji: cat.emoji,
      subcats: [],
      date: next.dateISO,
      endDate: last.dateISO,
      // Période RÉELLE (1re → dernière occurrence) pour l'affichage des
      // événements sur plusieurs jours, indépendamment du jour retenu au tri.
      dateText: periodText(first.dateISO, last.dateISO),
      schedule: next.time || "",
      place: next.place || "",
      city: next.city || "",
      free: false,
      reservation: false,
      image: next.img ? (next.img.startsWith("http") ? next.img : ORIGIN + next.img) : null,
      url: next.url,
      source: "ici-c-nancy",
    });
  }
  return out;
}

// ── Orchestration ──────────────────────────────────────────────────────────
async function collect() {
  process.stderr.write("→ ICI-C-NANCY : challenge anti-bot + agenda…\n");
  const html = await getText(LISTING);
  if (!html) throw new Error("agenda inaccessible");
  const occ = parseListing(html);
  const todayISO = new Date().toISOString().slice(0, 10);
  const list = buildEvents(occ, todayISO).sort((a, b) => a.date.localeCompare(b.date));
  process.stderr.write(`✓ ${list.length} événements ICI-C-NANCY (${occ.length} occurrences).\n`);
  return list;
}

async function main() {
  const list = await collect();
  const out = path.join(__dirname, "events-ici-c-nancy.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseListing, buildEvents };
