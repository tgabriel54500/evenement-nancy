#!/usr/bin/env node
/**
 * pro-scrape.js — récupère les événements professionnels (réseaux d'affaires,
 * CCI, MEDEF, congrès du Centre Prouvé) et écrit `events-pro.json`.
 *
 * Usage :
 *   node pro-scrape.js                 # toutes les sources
 *   node pro-scrape.js --only=cci,adjan
 *   node pro-scrape.js --debug         # + dump des pages brutes dans .debug-pro/
 *
 * Chaque réseau publie sur son propre site, sans flux ni API : un adaptateur
 * par source (voir pro-sources.js pour le registre). Les adaptateurs sont
 * séparés en deux : une fonction `parseX(html)` pure, testable hors ligne
 * (tests/pro-scrape.test.js), et la partie réseau.
 *
 * Robustesse : une source en échec ne fait pas perdre les autres. Ses
 * événements précédents (events-pro.json du passage d'avant) sont repris tels
 * quels, et signalés dans le rapport (report.<source>.reprise = true).
 *
 * Le filtre géographique (Nancy + RAYON_KM) et le filtre « à venir » sont
 * appliqués par update-pro.js, pas ici : ce fichier garde tout ce que les
 * sources annoncent, pour pouvoir changer le rayon sans re-scraper.
 */

const fs = require("fs");
const path = require("path");
const { RESEAUX, byKey } = require("./pro-sources");

const OUT = path.join(__dirname, "events-pro.json");
const DEBUG_DIR = path.join(__dirname, ".debug-pro");

const args = process.argv.slice(2);
const DEBUG = args.includes("--debug");
const ONLY = (args.find(a => a.startsWith("--only=")) || "").replace("--only=", "")
  .split(",").map(s => s.trim()).filter(Boolean);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const todayISO = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log("[pro]", ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function dump(name, body) {
  if (!DEBUG) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEBUG_DIR, name), body);
  } catch (_) {}
}

async function get(url, { name = "", tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
        redirect: "follow",
      });
      if (r.status === 429 || r.status === 503) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
      const body = await r.text();
      if (name) dump(name, body);
      return body;
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw lastErr;
}

// ── Utilitaires HTML / texte ───────────────────────────────────────────────

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", Eacute: "É", Egrave: "È",
  agrave: "à", acirc: "â", Agrave: "À", ccedil: "ç", Ccedil: "Ç",
  ocirc: "ô", ouml: "ö", Ocirc: "Ô", ugrave: "ù", ucirc: "û", uuml: "ü",
  icirc: "î", iuml: "ï", oelig: "œ", OElig: "Œ", deg: "°", rsquo: "’", hellip: "…",
  ndash: "–", mdash: "—", laquo: "«", raquo: "»", euro: "€",
};
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, " ");
// Texte courant : balises retirées, entités décodées, espaces normalisés.
const text = (s) => decodeEntities(stripTags(s)).replace(/\s+/g, " ").trim();
// Texte ligne par ligne : les balises de bloc et <br> deviennent des sauts.
function lines(html) {
  const h = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n");
  return decodeEntities(stripTags(h)).split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const attr = (tag, name) => {
  const m = String(tag || "").match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? decodeEntities(m[1]) : "";
};
const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const absolute = (href, base) => { try { return new URL(href, base).href; } catch (_) { return href || ""; } };

const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  jan: 1, fev: 2, mar: 3, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MOIS_RE = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|jan|fev|avr|juil|sept|oct|nov|dec";
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// « 1 octobre 2026 », « mardi 6 octobre 2026 », « 22 oct. 2026 » → ISO.
function parseDateFR(s) {
  const m = sansAccent(s).match(new RegExp(`(\\d{1,2})(?:er)?\\s*(${MOIS_RE})\\.?\\s*(\\d{4})`));
  if (!m) return "";
  return iso(m[3], MOIS[m[2]], m[1]);
}
// « 08h30 », « 8h », « 09:00 » → « 8h30 » (format du site).
function normTime(s) {
  const m = String(s || "").match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return "";
  return `${Number(m[1])}h${m[2] || "00"}`;
}
// « 09:00 - 10:00 », « de 9h à 10h30 », « dès 18h » → « 9h00–10h00 » / « 18h00 ».
function parseSchedule(s) {
  const t = String(s || "").match(/\d{1,2}\s*[h:]\s*(\d{2})?/gi) || [];
  const a = normTime(t[0]), b = normTime(t[1]);
  return a ? (b ? `${a}–${b}` : a) : "";
}

// Catégorie devinée sur le titre (et la description), à défaut celle du réseau.
function classify(title, desc, fallback) {
  const t = sansAccent(`${title} ${desc || ""}`);
  if (/job ?dating|recrut|emploi|forum des metiers|carriere/.test(t)) return "emploi";
  if (/formation|atelier|workshop|masterclass/.test(t)) return "formation";
  if (/petit[ -]?dej|dejeuner|breakfast|8\/9|cafe business|cafes business/.test(t)) return "petit-dej";
  if (/conference|decryptage|table ronde|colloque|debat|rencontre avec|keynote|seminaire|webinaire/.test(t)) return "conference";
  if (/afterwork|after-work|apero|soiree|networking|business connect|cocktail/.test(t)) return "afterwork";
  if (/salon|congres|convention|assises|symposium|journees? |rencontres du reseau|forum/.test(t)) return "salon";
  return fallback || "autre";
}

// Ville lue dans une adresse ou un libellé de lieu : code postal + nom, ou un
// nom de commune connu. Renvoie "" si rien de sûr.
const COMMUNES = ["Nancy", "Vandœuvre-lès-Nancy", "Laxou", "Villers-lès-Nancy", "Maxéville", "Malzéville",
  "Saint-Max", "Essey-lès-Nancy", "Jarville-la-Malgrange", "Tomblaine", "Heillecourt", "Houdemont",
  "Dommartemont", "Saulxures-lès-Nancy", "Pulnoy", "Seichamps", "Laneuveville-devant-Nancy", "Ludres",
  "Fléville-devant-Nancy", "Art-sur-Meurthe", "Champigneulles", "Metz", "Toul", "Lunéville", "Pont-à-Mousson",
  "Heudicourt-sous-les-Côtes", "Épinal", "Reims"];
const COMMUNE_KEYS = COMMUNES.map(c => [sansAccent(c).replace(/œ/g, "oe").replace(/[^a-z]+/g, " ").trim(), c]);
function guessCity(s) {
  const t = sansAccent(s).replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ");
  // Code postal 54xxx suivi du nom.
  const cp = t.match(/\b54\d{3}\s+([a-z][a-z ]{2,40})/);
  if (cp) {
    const after = cp[1].trim();
    for (const [k, c] of COMMUNE_KEYS) if (after.startsWith(k)) return c;
  }
  // Le nom d'une commune, en privilégiant les plus longs (« Villers-lès-Nancy » avant « Nancy »).
  const found = COMMUNE_KEYS.filter(([k]) => new RegExp(`\\b${k}\\b`).test(t)).sort((a, b) => b[0].length - a[0].length);
  return found.length ? found[0][1] : "";
}

function price(desc) {
  const t = String(desc || "");
  const m = t.match(/(\d{1,4})(?:[,.]\d{2})?\s*€/);
  if (/gratuit/i.test(t) && !m) return { free: true, price: "Gratuit" };
  if (m) return { free: false, price: m[0].replace(/\s+/g, " ") };
  return { free: false, price: "" };
}

const membersMention = (s) => /r[ée]serv[ée]e?s? aux (adh[ée]rents|membres|partenaires)|adh[ée]rents (uniquement|seulement)|sur invitation/i.test(String(s || ""));

function makeEvent(network, e) {
  const r = byKey(network);
  return {
    id: `${network}-${e.id}`,
    network,
    source: r ? r.name : network,
    title: String(e.title || "").trim(),
    category: e.category || classify(e.title, e.description, "autre"),
    date: e.date || "",
    endDate: e.endDate || e.date || "",
    time: e.time || "",
    place: String(e.place || "").trim(),
    city: String(e.city || "").trim(),
    url: e.url || (r && (r.agenda || r.site)) || "",
    image: e.image || "",
    description: String(e.description || "").trim().slice(0, 600),
    free: !!e.free,
    price: e.price || "",
    membersOnly: e.membersOnly != null ? !!e.membersOnly : !!(r && r.membersOnly),
    online: !!e.online,          // webinaire / visio : écarté par update-pro.js
  };
}

// ── Les Audacieux (WordPress, cartes <article class="afterwork_card">) ─────

function parseAudacieux(html) {
  const out = [];
  const re = /<article class="afterwork_card([^"]*)">([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/event_past/.test(m[1])) continue;
    const card = m[2];
    const pick = (cls) => { const x = card.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)<\\/(?:h2|span|p|div)>`)); return x ? text(x[1]) : ""; };
    const title = pick("afterwork_card_title");
    const dateTxt = pick("afterwork_card_date");
    const place = pick("afterwork_card_location");
    const descM = card.match(/class="afterwork_card_description">([\s\S]*?)<\/div>/);
    const description = descM ? lines(descM[1]).join(" ") : "";
    const link = card.match(/<a[^>]*class="btn_afterwork_signup"[^>]*>/);
    const date = parseDateFR(dateTxt);
    if (!title || !date) continue;
    const p = price(description);
    out.push(makeEvent("audacieux", {
      id: sansAccent(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) + "-" + date,
      title, date, time: normTime((dateTxt.match(/à\s*(\d{1,2}h\d{0,2})/) || [])[1]),
      place, city: guessCity(place) || guessCity(description) || "Nancy",
      url: link ? attr(link[0], "href") : "", description,
      free: p.free, price: p.price,
      category: classify(title, "", "afterwork"),
    }));
  }
  return out;
}
async function scrapeAudacieux() {
  const r = byKey("audacieux");
  return parseAudacieux(await get(r.agenda, { name: "audacieux.html" }));
}

// ── Les Cafés Business (liste « Hôte - JJ/MM/AAAA » vers businessapp.fr) ──
// Les fiches détaillées (adresse exacte) sont derrière un compte : on garde le
// nom de l'entreprise hôte comme lieu. Les cafés ont lieu à 9h.

function parseCafesBusiness(html) {
  const out = [];
  const re = /<a[^>]*href="(https?:\/\/lescafesbusiness\.businessapp\.fr\/meetings\/view\/(\d+))"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    const label = text(m[3]);
    const d = label.match(/^(.*?)\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/);
    if (!d || seen.has(m[2])) continue;
    seen.add(m[2]);
    const host = d[1].trim();
    const date = iso(d[4], Number(d[3]), Number(d[2]));
    out.push(makeEvent("cafesbusiness", {
      id: m[2], title: `Café Business chez ${host}`, date, time: "9h00",
      place: host, city: guessCity(host) || "Nancy",
      url: m[1], category: "petit-dej",
      description: `Petit-déjeuner de réseautage des Cafés Business, accueilli par ${host}. Inscription en ligne, places limitées.`,
    }));
  }
  return out;
}
async function scrapeCafesBusiness() {
  const r = byKey("cafesbusiness");
  return parseCafesBusiness(await get(r.agenda, { name: "cafesbusiness.html" }));
}

// ── Le 8/9 d'ADJAN (Elementor : blocs « Nos prochains 8/9 à Nancy ») ──────

function parseAdjan(html) {
  const ls = lines(html);
  const start = ls.findIndex(l => /prochains 8\/9 à Nancy/i.test(l));
  if (start < 0) return [];
  const end = ls.findIndex((l, i) => i > start && /(derniers 8\/9|adh[ée]rents|prochains 8\/9 à (?!Nancy))/i.test(l));
  const block = ls.slice(start + 1, end > 0 ? end : start + 40);
  // Photos des intervenants, dans l'ordre du bloc Nancy.
  const secStart = html.search(/prochains 8\/9 à Nancy/i);
  const secEnd = html.search(/derniers 8\/9 en vid/i);
  const sec = secStart >= 0 ? html.slice(secStart, secEnd > secStart ? secEnd : undefined) : "";
  const imgs = [...sec.matchAll(/<img[^>]*class="[^"]*wp-image-[^"]*"[^>]*>/g)].map(x => attr(x[0], "src"));
  const out = [];
  for (let i = 0; i < block.length; i++) {
    const d = parseDateFR(block[i]);
    if (!d) continue;
    const name = block[i - 1] || "";
    const place = (block[i + 1] && !/inscris/i.test(block[i + 1])) ? block[i + 1] : "Nancy";
    if (!name || /inscris/i.test(name)) continue;
    const link = sec.match(/<a[^>]*href="(https?:\/\/[^"]*hsforms[^"]*)"/);
    out.push(makeEvent("adjan", {
      id: `${d}-${sansAccent(name).replace(/[^a-z0-9]+/g, "-")}`,
      title: `8/9 ADJAN avec ${name.replace(/\b([A-ZÉÈ]{2,})\b/g, w => w.charAt(0) + w.slice(1).toLowerCase())}`,
      date: d, time: "8h00–9h00",
      place: place === "Nancy" ? "Nancy (lieu précisé à l'inscription)" : place,
      city: guessCity(place) || "Nancy",
      url: link ? link[1].replace(/\?.*$/, "") : "",
      image: imgs[out.length] || "",
      category: "petit-dej",
      description: `Petit-déjeuner de dirigeants du réseau 8/9 d'ADJAN, de 8h à 9h, avec ${name} comme intervenant.`,
    }));
  }
  return out;
}
async function scrapeAdjan() {
  const r = byKey("adjan");
  return parseAdjan(await get(r.agenda, { name: "adjan.html" }));
}

// ── MEDEF 54 (agenda paginé, trié du plus récent au plus ancien) ───────────

function parseMedefListe(html, base = "https://www.medef-meurthe-moselle.fr") {
  const out = [];
  const re = /<div class="Grid-item">([\s\S]*?)<\/a>\s*<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const item = m[1];
    const href = attr(item.match(/<a[^>]*class="globalLink"[^>]*>/)?.[0] || "", "href");
    const day = text((item.match(/<time[^>]*>\s*<span>([^<]*)<\/span>/) || [])[1]);
    const my = text((item.match(/<span class="date">([\s\S]*?)<\/span>/) || [])[1]);   // « oct. 2026 »
    const title = text((item.match(/class="Box-info-title"[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
    const cover = (item.match(/background-image:\s*url\(['"]?([^'")]+)/) || [])[1] || "";
    const date = parseDateFR(`${day} ${my}`);
    if (!href || !title || !date) continue;
    out.push({ href: absolute(href, base), title, date, image: /default\.svg/.test(cover) ? "" : absolute(cover, base) });
  }
  return out;
}
function parseMedefFiche(html, item) {
  const body = (html.match(/class="Wysiwyg">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) || [, html])[1];
  const ls = lines(body);
  const full = ls.join(" ");
  const online = /webinaire|visio|en ligne|teams|zoom/i.test(item.title) && !guessCity(full);
  // Le paragraphe « Rendez-vous le …, dès 18h, à ICN …, 2 place …, Nancy. » est
  // coupé par des <br> : on recolle les lignes qui suivent.
  const iRdv = ls.findIndex(l => /rendez-vous|rdv\b|lieu\s*:|adresse/i.test(l));
  const rdv = iRdv >= 0 ? ls.slice(iRdv, iRdv + 5).join(" ") : "";
  const city = guessCity(rdv) || guessCity(full);
  const place = (rdv.match(/(?:^|[\s,])(?:à|chez|au|aux)\s+([^,.]{4,80})/i) || [])[1] || "";
  const img = attr((body.match(/<img[^>]*>/) || [])[0] || "", "src");
  const insc = (body.match(/<a[^>]*href="([^"]*inscription[^"]*)"/i) || [])[1] || "";
  const p = price(full);
  return makeEvent("medef54", {
    id: item.href.split("/").pop(),
    title: item.title, date: item.date, time: parseSchedule(rdv || full),
    place: place.trim(), city, url: insc || item.href, image: item.image || img,
    description: ls.filter(l => l.length > 40).slice(0, 2).join(" "),
    free: p.free, price: p.price,
    membersOnly: membersMention(full),
    category: classify(item.title, "", "conference"),
    online,
  });
}
async function scrapeMedef() {
  const r = byKey("medef54");
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const html = await get(`${r.agenda}${page > 1 ? "?page=" + page : ""}`, { name: `medef-${page}.html` });
    const items = parseMedefListe(html);
    if (!items.length) break;
    const upcoming = items.filter(i => i.date >= todayISO);
    for (const it of upcoming) {
      await sleep(400);
      const ev = parseMedefFiche(await get(it.href, { name: `medef-${it.href.split("/").pop()}.html` }), it);
      if (!ev.online) out.push(ev);
    }
    if (upcoming.length < items.length) break;   // la page contient déjà du passé
  }
  return out;
}

// ── CCI Grand Nancy (Drupal, vues « .views-row », 2 pages) ─────────────────

function parseCCI(html, base = "https://www.nancy.cci.fr") {
  const out = [];
  const rows = html.split(/<div class="views-row">/).slice(1);
  for (const row of rows) {
    const g = (cls, tag = "div") => text((row.match(new RegExp(`class="${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1]);
    const dateTxt = g("band__date");
    const title = g("band__title", "h2");
    const info = g("band__info");
    const body = g("band__body", "h3");
    const pay = g("band__payment");
    const href = attr((row.match(/<a[^>]*class="btn[^"]*"[^>]*>/) || [])[0] || "", "href");
    const img = attr((row.match(/<img[^>]*>/) || [])[0] || "", "src");
    // « Lundi 28 Septembre au Vendredi 02 Octobre 2026 » : le premier jour n'a
    // pas d'année, il prend celle de la fin.
    const ds = [...sansAccent(dateTxt).matchAll(new RegExp(`(\\d{1,2})\\s*(${MOIS_RE})(?:\\s*(\\d{4}))?`, "g"))];
    if (!ds.length || !title) continue;
    const year = ds[ds.length - 1][3] || todayISO.slice(0, 4);
    const date = iso(ds[0][3] || year, MOIS[ds[0][2]], ds[0][1]);
    const endDate = ds.length > 1 ? iso(year, MOIS[ds[1][2]], ds[1][1]) : date;
    if (/\bvs\b/i.test(title)) continue;                       // matchs des clubs partenaires
    const [timePart, placePart = ""] = info.split("•").map(s => s.trim());
    // Sans lieu, c'est un webinaire (la CCI n'indique pas de ville pour eux).
    const online = !placePart || /webinaire|en ligne|visio/i.test(title);
    const city = guessCity(placePart) || (placePart ? placePart.replace(/^.*\bà\s+/i, "") : "");
    const place = /\s+à\s+/.test(placePart) ? placePart.replace(/\s+à\s+[^,]+$/i, "") : (placePart && placePart !== city ? placePart : "");
    const paid = /€/.test(pay);
    out.push(makeEvent("cci", {
      id: href.split("/").pop(),
      title, date, endDate, time: parseSchedule(timePart),
      place, city, url: absolute(href, base), image: img ? absolute(img, base) : "",
      description: body, free: !paid, price: paid ? pay : (pay || ""),
      category: classify(title, body, "conference"),
      online,
    }));
  }
  return out;
}
async function scrapeCCI() {
  const r = byKey("cci");
  const out = [];
  for (let page = 0; page < 4; page++) {
    const html = await get(`${r.agenda}?page=${page}`, { name: `cci-${page}.html` });
    const items = parseCCI(html);
    if (!items.length) break;
    out.push(...items);
    if (!/page=\d+[^>]*>[^<]*(?:Suivant|›)/i.test(html) || !new RegExp(`page=${page + 1}`).test(html)) break;
  }
  return out;
}

// ── Centre Prouvé & Parc Expo (Destination Nancy, cartes .iris-card) ───────
// La page mélange congrès professionnels et salons grand public sans les
// distinguer : on garde ce qui ressemble à un rendez-vous professionnel.

const PRO_RE = /congr[eè]s|journ[ée]es?\b|rencontres|forum|colloque|assises|symposium|s[ée]minaire|convention|professionnel|\bCSE\b|executive|entreprises|r[ée]seau/i;
const PUBLIC_RE = /studyrama|foire|festival|f[êe]te|paranormal|bien-[êe]tre|divinatoire|randos|rallye|puces|brasseur|bi[èe]res?|habitat|d[îi]ners?|soir[ée]e 80|pas d.[âa]ge|d[ée]lices|remise des dipl[ôo]mes/i;

function parseProuve(html, base = "https://www.destination-nancy.com") {
  const out = [];
  const seen = new Set();
  const cards = html.split(/<div class="iris-card\b/).slice(1);
  for (const card of cards) {
    const titleM = card.match(/class="iris-card__content__title"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;
    const href = absolute(decodeEntities(titleM[1]), base), title = text(titleM[2]);
    if (seen.has(href)) continue;
    seen.add(href);
    const venue = text((card.match(/iris-card__content__categories[^>]*>([\s\S]*?)<\/ul>/) || [])[1]);
    const days = [...card.matchAll(/iris-card__period__day"[^>]*>\s*([^<]+?)\s*</g)].map(x => x[1]);
    const months = [...card.matchAll(/iris-card__period__monthName"[^>]*>\s*([^<]+?)\s*</g)].map(x => x[1]);
    const year = ((card.match(/iris-card__period__year"[^>]*>\s*([^<]+?)\s*</) || [])[1] || "").trim();
    const cityLabel = text((card.match(/iris-card__label"[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
    const excerpt = text((card.match(/iris-card__content__excerpt"[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
    const img = attr((card.match(/<img[^>]*>/) || [])[0] || "", "src");
    if (!days.length || !year) continue;
    const date = iso(year, MOIS[sansAccent(months[0])], days[0]);
    const endDate = days[1] ? iso(year, MOIS[sansAccent(months[1] || months[0])], days[1]) : date;
    const isPro = PRO_RE.test(`${title} ${excerpt}`) && !PUBLIC_RE.test(title);
    if (!isPro) continue;
    const parc = /parc/i.test(venue);
    const free = /gratuit/i.test(card.slice(card.indexOf("iris-card__content__excerpt")));
    out.push(makeEvent("prouve", {
      id: href.replace(/\/$/, "").split("/").pop(),
      title, date, endDate,
      place: parc ? "Parc des Expositions" : "Centre Prouvé",
      city: guessCity(cityLabel) || (parc ? "Vandœuvre-lès-Nancy" : "Nancy"),
      url: href, image: img ? absolute(img, base) : "", description: excerpt,
      free, price: free ? "Gratuit" : "",
      category: classify(title, excerpt, "salon"),
    }));
  }
  return out;
}
async function scrapeProuve() {
  const r = byKey("prouve");
  return parseProuve(await get(r.agenda, { name: "prouve.html" }));
}

// ── Orchestration ──────────────────────────────────────────────────────────

const SCRAPERS = {
  audacieux: scrapeAudacieux,
  cafesbusiness: scrapeCafesBusiness,
  adjan: scrapeAdjan,
  medef54: scrapeMedef,
  cci: scrapeCCI,
  prouve: scrapeProuve,
};

async function main() {
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (_) {}

  const keys = RESEAUX.filter(r => r.scrape && SCRAPERS[r.key] && (!ONLY.length || ONLY.includes(r.key))).map(r => r.key);
  const all = [];
  const report = {};
  for (const key of keys) {
    const t0 = Date.now();
    try {
      const evs = await SCRAPERS[key]();
      all.push(...evs);
      report[key] = { count: evs.length, ms: Date.now() - t0 };
      log(`${key}: ${evs.length} événement(s)`);
    } catch (e) {
      const reprise = previous.filter(ev => ev.network === key);
      all.push(...reprise);
      report[key] = { count: reprise.length, reprise: true, error: String(e.message || e) };
      log(`${key}: ÉCHEC (${e.message || e}) → ${reprise.length} événement(s) repris du passage précédent`);
    }
  }
  // Les sources non demandées (--only) gardent leurs événements précédents.
  for (const r of RESEAUX) {
    if (r.scrape && !keys.includes(r.key)) all.push(...previous.filter(ev => ev.network === r.key));
  }
  all.sort((a, b) => (a.date + a.title).localeCompare(b.date + b.title));
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2) + "\n");
  fs.writeFileSync(path.join(__dirname, "events-pro-report.json"), JSON.stringify({ date: todayISO, report }, null, 2) + "\n");
  log(`events-pro.json écrit : ${all.length} événement(s)`);
}

module.exports = {
  parseAudacieux, parseCafesBusiness, parseAdjan, parseMedefListe, parseMedefFiche, parseCCI, parseProuve,
  classify, guessCity, parseDateFR, parseSchedule, lines,
};

if (require.main === module) {
  main().catch(e => { console.error("[pro] erreur fatale :", e); process.exit(1); });
}
