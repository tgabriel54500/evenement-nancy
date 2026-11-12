#!/usr/bin/env node
/**
 * Source « Ville de Laxou » (laxou.fr) pour le pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   Laxou est une commune de la métropole du Grand Nancy. Son agenda municipal
 *   (CMS Flexit) complète les autres sources avec des événements locaux.
 *
 * Comment ça marche :
 *   1. Listing /fr/agenda.html?page_actualites=N : chaque carte porte
 *      data-goto-url="/fr/agenda/<slug>_-d.html" (fiche) + data-first-day="AAAA-MM-JJ".
 *      La pagination reboucle en fin de liste → on s'arrête dès qu'une page répète
 *      la précédente ou ne renvoie aucune carte.
 *   2. Chaque fiche détail porte un <script type="application/ld+json"> schema.org/Event
 *      (name, startDate au format "AAAA/MM/JJThh:mm:ss", location.name, image, description).
 *   3. Normalisation vers le schéma commun :
 *        { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *          place, city, free, reservation, image, url, source }
 *
 * Pas d'en-têtes CORS : instantané local en Node (comme les autres sources).
 * Sortie : events-laxou.json, fusionné par update-events.js s'il est présent.
 *
 * Usage :
 *   node laxou.js                 # crawl complet -> events-laxou.json
 *   node laxou.js --max=10        # s'arrête après ~10 fiches (test)
 *   node laxou.js --concurrency=6 # fiches récupérées en parallèle (défaut 8)
 *
 * S'utilise aussi comme module :  const { collect } = require("./laxou");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.laxou.fr";
const LISTING = ORIGIN + "/fr/agenda.html";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ── Catégories (devinées au titre/description, alignées sur les autres sources) ──
const CATEGORY_BY_PREFIX = [
  [/(expo|peinture|sculpture|photographie|vernissage)/i,                    { key: "exposition",         label: "Expositions",              emoji: "🖼️" }],
  [/(musique classique|récital|recital|opéra|opera|lyrique|symphoni|philharmoni|chant choral|orchestre)/i, { key: "musique-classique", label: "Musique classique", emoji: "🎻" }],
  [/(concert|jazz|rock|blues|rap|pop|électro|electro|metal|chanson|variété|variete|fête de la musique|fete de la musique)/i, { key: "musiques-actuelles", label: "Musiques actuelles", emoji: "🎸" }],
  [/(festival|carnaval|kermesse|foire|salon|brocante|vide.?grenier|marché|marche|fête|fete)/i, { key: "festival", label: "Festivals", emoji: "🎪" }],
  [/(spectacle|théâtre|theatre|danse|cirque|humour|one man|stand.?up|cabaret|mentalisme)/i, { key: "spectacle", label: "Spectacles", emoji: "🎭" }],
  [/(cinéma|cinema|projection|film|court.?métrage|court.?metrage)/i,        { key: "conference",         label: "Conférences & rencontres", emoji: "🎓" }],
  [/(conférence|conference|rencontre|colloque|table ronde|débat|debat|réunion|reunion|paroles)/i, { key: "conference", label: "Conférences & rencontres", emoji: "🎓" }],
  [/(sport|course|marche nordique|randonnée|randonnee|tournoi|fête du sport|fete du sport)/i, { key: "sport", label: "Sport", emoji: "🤸" }],
  [/(nature|jardin|temps nature|club nature|découverte|decouverte|balade|sortie|cpie|mare)/i, { key: "activite", label: "Activités & ateliers", emoji: "🎨" }],
  [/(atelier|stage|initiation|visite|parcours|circuit)/i,                   { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" }],
];

function resolveCategory(text) {
  const t = (text || "").trim();
  for (const [re, cat] of CATEGORY_BY_PREFIX) if (re.test(t)) return cat;
  return { key: "autre", label: "Autre", emoji: "📌" };
}

// ── Déduction de la ville ───────────────────────────────────────────────────
// Le JSON-LD Laxou ne fournit que le NOM du lieu (+ parfois des coordonnées
// `geo`), jamais la commune. On la déduit : 1) si le nom du lieu contient une
// commune connue, on la prend (gère les events HORS Laxou, ex. Lunéville) ;
// 2) sinon, si la géo est clairement hors agglo nancéienne, on laisse vide
// (mieux que de tagger Laxou à tort) ; 3) sinon défaut « Laxou » (agenda
// municipal : la grande majorité des events s'y tiennent).
const norm = (s) => (s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");

// Communes les plus spécifiques d'abord ; « nancy » EN DERNIER (sous-chaîne de
// "villers-lès-nancy", "vandœuvre-lès-nancy"…).
const CITIES = [
  ["laxou", "Laxou"],
  ["vandoeuvre", "Vandœuvre-lès-Nancy"],
  ["villers-les-nancy", "Villers-lès-Nancy"], ["villers les nancy", "Villers-lès-Nancy"],
  ["maxeville", "Maxéville"],
  ["saint-nicolas-de-port", "Saint-Nicolas-de-Port"], ["saint nicolas de port", "Saint-Nicolas-de-Port"],
  ["luneville", "Lunéville"],
  ["pont-a-mousson", "Pont-à-Mousson"], ["pont a mousson", "Pont-à-Mousson"],
  ["toul", "Toul"],
  ["essey", "Essey-lès-Nancy"],
  ["malzeville", "Malzéville"],
  ["tomblaine", "Tomblaine"],
  ["jarville", "Jarville-la-Malgrange"],
  ["ludres", "Ludres"],
  ["houdemont", "Houdemont"],
  ["heillecourt", "Heillecourt"],
  ["fleville", "Fléville-devant-Nancy"],
  ["champigneulles", "Champigneulles"],
  ["frouard", "Frouard"],
  ["pompey", "Pompey"],
  ["dombasle", "Dombasle-sur-Meurthe"],
  ["saint-max", "Saint-Max"], ["saint max", "Saint-Max"],
  ["seichamps", "Seichamps"],
  ["nancy", "Nancy"],
];

function deduceCity(place, geo) {
  const hay = norm(place);
  if (hay) for (const [needle, name] of CITIES) if (hay.includes(needle)) return name;
  if (geo && geo.latitude && geo.longitude) {
    const la = parseFloat(geo.latitude), lo = parseFloat(geo.longitude);
    // Laxou ≈ 48.684 N, 6.145 E. Hors d'une large boîte autour de l'agglo →
    // commune inconnue (on ne devine pas Laxou à tort).
    if (Math.abs(la - 48.684) > 0.15 || Math.abs(lo - 6.145) > 0.22) return "";
  }
  return "Laxou";
}

// ── HTTP avec retry léger ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const decode = (s) =>
  (s || "")
    .replace(/&nbsp;/g, " ").replace(/&#8211;/g, "–").replace(/&#8217;/g, "’")
    .replace(/&#8230;/g, "…").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ── 1. Listing : URLs des fiches (dédup, arrêt sur répétition) ──────────────
function parseListing(html) {
  const out = [];
  const re = /data-goto-url="(\/fr\/agenda\/[^"]+)"(?:\s+data-first-day="([^"]*)")?/g;
  let m;
  while ((m = re.exec(html))) out.push({ url: ORIGIN + m[1], firstDay: m[2] || "" });
  return out;
}

// Le CMS Flexit sert les pages 2+ du listing avec un statut HTTP 404 TROMPEUR
// alors que le corps contient bien les cartes. On lit donc le corps quel que soit
// le statut (sauf erreur réseau), et on s'arrête quand une page répète la
// précédente (la pagination reboucle au-delà de la dernière page).
async function getListing(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
      return await res.text();                 // 200 comme 404 : le corps porte les cartes
    } catch (err) {
      if (attempt >= tries) return null;
      await sleep(400 * attempt);
    }
  }
}

async function fetchAllStubs(maxPages = 30) {
  const byUrl = new Map();
  let prevSig = "";
  for (let p = 1; p <= maxPages; p++) {
    const html = await getListing(`${LISTING}?page_actualites=${p}`);
    if (!html) break;
    const cards = parseListing(html);
    const sig = cards.map((c) => c.url).join(",");
    if (!cards.length || sig === prevSig) break; // fin / la pagination reboucle
    prevSig = sig;
    for (const c of cards) if (!byUrl.has(c.url)) byUrl.set(c.url, c);
    process.stderr.write(`  listing p${p} : ${byUrl.size} fiches uniques\n`);
  }
  return [...byUrl.values()];
}

// ── 2. Fiche détail : JSON-LD Event ────────────────────────────────────────
function extractEvent(html) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g) || [];
  for (const raw of blocks) {
    const json = raw.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    let data;
    try { data = JSON.parse(json); } catch { continue; }
    const items = Array.isArray(data) ? data : [data];
    for (const it of items) {
      const type = it && it["@type"];
      if (type === "Event" || (Array.isArray(type) && type.includes("Event"))) return it;
    }
  }
  return null;
}

function ogImage(html) {
  const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
        || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  return m ? m[1] : null;
}

// "2025/06/01T00:00:00" (slashes) ou ISO -> { date:"2025-06-01", time:"" }
function parseDt(raw) {
  if (!raw) return { date: "", time: "" };
  const s = String(raw).replace(/\//g, "-");
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return { date: "", time: "" };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = m[4] && (m[4] !== "00" || m[5] !== "00") ? `${m[4]}:${m[5]}` : "";
  return { date, time };
}

function hhmm(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

async function fetchDetail(stub) {
  const html = await getText(stub.url);
  if (!html) return null;
  const ev = extractEvent(html);
  // Date : JSON-LD en priorité, repli sur le data-first-day du listing.
  const start = parseDt((ev && ev.startDate) || stub.firstDay);
  if (!start.date) return null;
  const end = parseDt((ev && ev.endDate) || (ev && ev.startDate) || stub.firstDay);
  const loc = (ev && ev.location) || {};
  // Titre : JSON-LD name (propre quand présent), sinon og:title nettoyé du suffixe
  // « - <doublon> ville de laxou », sinon le <h1>.
  const cleanTitle = (s) => decode(s)
    .replace(/\s*[-–]\s*.*\bville de laxou\s*$/i, "")
    .replace(/\s+ville de laxou\s*$/i, "").trim();
  const ogTitle = (html.match(/og:title"[^>]+content="([^"]+)/) || [])[1];
  const h1 = decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  // h1 = titre propre et complet ; le JSON-LD name est souvent absent et l'og:title
  // est verbeux/tronqué (« … ville de laxou »). Priorité : name → h1 → og nettoyé.
  const name = (ev && decode(ev.name)) || h1 || cleanTitle(ogTitle) || "";
  if (!name) return null;
  const cat = resolveCategory(`${name} ${decode(ev && ev.description)}`);
  const startDate = start.date;
  const endDate = end.date && end.date >= startDate ? end.date : startDate;
  const todayISO = new Date().toISOString().slice(0, 10);
  const sortDate = startDate < todayISO && endDate >= todayISO ? todayISO : startDate;
  const imgObj = ev && ev.image;
  const image = ogImage(html)
    || (typeof imgObj === "string" ? imgObj : imgObj && imgObj.url) || null;
  const slug = (stub.url.match(/\/agenda\/([^/]+?)_-d\.html$/) || [])[1] || stub.url;
  return {
    uuid: "lx-" + slug,
    title: name,
    category: cat.key,
    catLabel: cat.label,
    catEmoji: cat.emoji,
    subcats: [],
    date: sortDate,
    endDate,
    dateText: "",
    schedule: hhmm(start.time),
    place: (typeof loc.name === "string" && loc.name) || "",
    city: deduceCity(typeof loc.name === "string" ? loc.name : "", loc.geo),
    free: false,
    reservation: false,
    image,
    url: stub.url,
    source: "laxou",
  };
}

// ── Pool de concurrence simple ─────────────────────────────────────────────
async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx]); } catch { out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

// ── Orchestration ──────────────────────────────────────────────────────────
async function collect({ max = null, concurrency = 8 } = {}) {
  process.stderr.write("→ Laxou : exploration du listing…\n");
  let stubs = await fetchAllStubs();
  if (max) stubs = stubs.slice(0, max);
  process.stderr.write(`→ ${stubs.length} fiches à lire (concurrence ${concurrency})…\n`);
  const events = (await mapPool(stubs, fetchDetail, concurrency)).filter(Boolean);

  const byId = new Map();
  for (const e of events) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  process.stderr.write(`✓ ${list.length} événements Laxou avec date.\n`);
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
  const out = a.out || path.join(__dirname, "events-laxou.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, resolveCategory, parseListing, extractEvent };
