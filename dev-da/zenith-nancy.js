#!/usr/bin/env node
/**
 * Source « Zénith de Nancy » (grande salle de concerts/spectacles) pour le
 * pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js est régénéré par update-events.js à partir de plusieurs agendas
 *   (Ville de Nancy, Destination Nancy, Villers, Vandœuvre…). Ce module ajoute
 *   la programmation du Zénith (https://www.zenith-de-nancy.com/evenements/) :
 *   grands concerts, humour, comédies musicales, sport…
 *
 * Comment ça marche :
 *   Site WordPress, mais le custom post type « evenement » N'EST PAS exposé via
 *   l'API REST (/wp-json/wp/v2/evenement → 404). On parcourt donc les pages de
 *   listing server-side (/evenements/ puis /evenements/page/N/, 11 cartes/page).
 *   Chaque carte `.card-event` porte tout ce qu'il faut :
 *     - lien     : <a class="card-event__overlay-link" href="…/evenement/<slug>/">
 *     - type     : <span class="card-event__type">Concert</span>
 *     - titre    : <h3 class="card-event__title">…</h3>
 *     - date     : <p class="card-event__date">Vendredi 12 juin 2026</p>
 *     - image    : <img class="card-event__img" src="…">
 *   On normalise vers le schéma commun attendu par app.js / base.js.
 *
 * La date est en français long ("Vendredi 12 juin 2026"), parfois multi-jours
 * ("19 & 20 juin 2026", "12, 13 & 14 février 2027", mois parfois abrégé "avr.").
 *
 * Usage :
 *   node zenith-nancy.js                 # crawl complet -> events-zenith-nancy.json
 *   node zenith-nancy.js --max=10        # s'arrête après ~10 événements (test)
 *   node zenith-nancy.js --out=fichier.json
 *
 * S'utilise aussi comme module :  const { collect } = require("./zenith-nancy");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.zenith-de-nancy.com";
const LISTING = ORIGIN + "/evenements";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Le Zénith est implanté à Maxéville, dans l'agglomération de Nancy.
const PLACE = "Zénith de Nancy";
const CITY = "Maxéville";

// ── Catégories ─────────────────────────────────────────────────────────────
// On reste aligné sur les clés des autres sources pour que les filtres du site
// regroupent les origines. Le type est lu dans la pastille `card-event__type`.
function resolveCategory(type) {
  const t = (type || "").toLowerCase();
  if (/festival/.test(t))                                          return { key: "festival",            label: "Festivals",          emoji: "🎪" };
  if (/(concert|rap|urbain|ciné|cine)/.test(t))                    return { key: "musiques-actuelles",  label: "Musiques actuelles", emoji: "🎸" };
  if (/(humour|one man|one woman|spectacle|comédie|comedie|ballet|danse|théâtre|theatre)/.test(t)) return { key: "spectacle", label: "Spectacles", emoji: "🎭" };
  if (/(sport|mma)/.test(t))                                       return { key: "sport",               label: "Sport",              emoji: "🏆" };
  return { key: "autre", label: "Autre", emoji: "📌" };
}

// ── Dates françaises -> ISO ─────────────────────────────────────────────────
const MONTHS = {
  janvier: 1, "janv": 1, "févr": 2, fevr: 2, février: 2, fevrier: 2, mars: 3,
  avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, août: 8, aout: 8,
  septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11,
  décembre: 12, decembre: 12, "déc": 12, dec: 12,
};

// "Vendredi 12 juin 2026" / "19 & 20 juin 2026" / "12, 13 & 14 février 2027".
// Renvoie { start:"YYYY-MM-DD", end:"YYYY-MM-DD" } ou null.
function parseFrenchDate(raw) {
  const s = decode(raw).toLowerCase();
  const year = (s.match(/\b(20\d{2})\b/) || [])[1];
  const monKey = Object.keys(MONTHS).find((m) => new RegExp("\\b" + m + "\\b").test(s));
  if (!year || !monKey) return null;
  const month = MONTHS[monKey];
  // Jours = tous les nombres à 1-2 chiffres (le 1er = début, le dernier = fin).
  const days = (s.match(/\b\d{1,2}\b/g) || []).map(Number).filter((n) => n >= 1 && n <= 31);
  if (!days.length) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${year}-${pad(month)}-${pad(d)}`;
  return { start: iso(days[0]), end: iso(days[days.length - 1]) };
}

// ── Utilitaires HTML ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) =>
  (s || "")
    .replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&#8217;/g, "’")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»").replace(/&eacute;/g, "é").replace(/&egrave;/g, "è")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

async function getText(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      });
      if (res.status === 404) return null; // fin de pagination
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(400 * attempt);
    }
  }
}

// ── Parse d'une page de listing -> cartes brutes ────────────────────────────
function parseCards(html) {
  const cards = [];
  // On découpe sur le lien-overlay (un par carte) puis on borne au lien suivant.
  const re = /<a class="card-event__overlay-link"\s+href="([^"]+)"/g;
  let m;
  const starts = [];
  while ((m = re.exec(html))) starts.push({ url: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i].at, i + 1 < starts.length ? starts[i + 1].at : starts[i].at + 4000);
    const slug = (starts[i].url.match(/\/evenement\/([^/]+)\//) || [])[1] || String(i);
    const type = decode((block.match(/card-event__type[^>]*">([^<]+)</) || [])[1] || "");
    const title = decode((block.match(/card-event__title[^>]*">([^<]+)</) || [])[1] || "");
    const dateText = (block.match(/card-event__date[^>]*">([^<]+)</) || [])[1] || "";
    const image = (block.match(/card-event__img[^>]*\ssrc="([^"]+)"/) || [])[1] || null;
    const reservation = /data-action="modal-booking"|>\s*Réserver\s*</.test(block);
    if (title) cards.push({ slug, url: starts[i].url, type, title, dateText, image, reservation });
  }
  return cards;
}

// ── Normalisation -> schéma commun ──────────────────────────────────────────
function mapCard(c, todayISO) {
  const d = parseFrenchDate(c.dateText);
  if (!d) return null;
  // Un événement déjà en cours (rare ici) est calé sur aujourd'hui pour le tri.
  const sortDate = d.start >= todayISO ? d.start : (d.end >= todayISO ? todayISO : d.start);
  const cat = resolveCategory(c.type);
  return {
    uuid: "zen-" + c.slug,                 // préfixe pour éviter toute collision d'uuid
    title: c.title,
    category: cat.key,
    catLabel: cat.label,                   // retiré au rendu, sert à construire CATEGORIES
    catEmoji: cat.emoji,
    subcats: c.type ? [c.type] : [],
    date: sortDate,
    endDate: d.end,
    dateText: decode(c.dateText),
    schedule: "",
    place: PLACE,
    city: CITY,
    free: false,                           // le Zénith est une salle payante
    reservation: !!c.reservation,
    image: c.image,
    url: c.url,
    source: "zenith-nancy",
  };
}

// ── Orchestration ──────────────────────────────────────────────────────────
async function collect({ max = null } = {}) {
  process.stderr.write("→ Zénith de Nancy : lecture du listing…\n");
  const todayISO = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const events = [];
  for (let page = 1; page <= 50; page++) {
    const url = page === 1 ? LISTING + "/" : `${LISTING}/page/${page}/`;
    const html = await getText(url);
    if (!html) break;                       // 404 -> fin de pagination
    const cards = parseCards(html);
    if (!cards.length) break;
    for (const c of cards) {
      if (seen.has(c.slug)) continue;
      seen.add(c.slug);
      const ev = mapCard(c, todayISO);
      if (ev) events.push(ev);
    }
    process.stderr.write(`  page ${page} : ${seen.size} événements\n`);
    if (max && events.length >= max) break;
  }
  let list = events.sort((a, b) => a.date.localeCompare(b.date));
  if (max) list = list.slice(0, max);
  process.stderr.write(`✓ ${list.length} événements Zénith de Nancy avec date.\n`);
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
  const out = a.out || path.join(__dirname, "events-zenith-nancy.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseFrenchDate, parseCards, mapCard };
