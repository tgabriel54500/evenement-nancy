#!/usr/bin/env node
/**
 * Importateur des événements Facebook « Intéressé·e / Je participe » → schéma EVENTS.
 *
 * Pourquoi ce fichier existe :
 *   Facebook a supprimé l'export iCal (webcal upcoming/birthdays) sur les comptes
 *   récents. MAIS la page « Événements » (https://www.facebook.com/events/ et
 *   .../events/calendar/) embarque déjà TOUS les événements de l'utilisateur en
 *   JSON, dans des balises <script type="application/json" data-sjs>. Ce script
 *   lit le code source HTML enregistré À LA MAIN par l'utilisateur (aucune requête
 *   réseau, aucune authentification automatisée) et en extrait les événements.
 *
 * Flux d'utilisation :
 *   1. Connecté à Facebook (ordinateur), se marquer « Intéressé·e » sur un max
 *      d'événements de Nancy & environs.
 *   2. Ouvrir https://www.facebook.com/events/calendar/ , faire défiler jusqu'en
 *      bas pour charger toute la liste, puis Fichier → Enregistrer sous → « Page
 *      web, HTML seul » dans le dossier ./ics-facebook (ou copier le code source).
 *   3. node facebook.js            → écrit events-facebook.json (schéma EVENTS).
 *   4. node update-events.js       → fusionne dans data.js avec les autres sources.
 *
 * Périmètre :
 *   La page Facebook mélange l'onglet Découvrir (Metz, Luxembourg, Vosges...).
 *   On ne garde QUE les événements dont la commune est identifiée à 30 km max
 *   de Nancy (référentiel hors ligne communes-30km.json, 367 communes).
 *   Tout le reste, y compris les lieux non identifiables, est écarté.
 *
 * Usage :
 *   node facebook.js
 *   node facebook.js --dir=ics-facebook --out=events-facebook.json
 *   node facebook.js page1.html page2.html
 *   node facebook.js --uid=61590574870570        (filtre : exclut les events tiers)
 *   node facebook.js --nofilter                  (désactive le périmètre 30 km)
 */

const fs = require("fs");
const path = require("path");
const { resolveCategoryFrom } = require("./import-ics.js");
let cleanCity = (s) => s; // fallback si normalize.js bouge
let CITY_CANON = {};
try { ({ cleanCity, CITY_CANON } = require("./normalize.js")); } catch {}

// Cherche une commune connue (table CITY_CANON du Grand Nancy + anneau) dans un
// texte libre — utile quand la carte ne donne qu'un nom de lieu ou d'affiche.
// Tri par longueur décroissante : "Vandœuvre-lès-Nancy" doit être testé AVANT
// "Nancy" (qu'il contient), sinon toute commune en "…-lès-Nancy" deviendrait Nancy.
const CITY_NAMES = [...new Set(Object.values(CITY_CANON || {}))].sort((a, b) => b.length - a.length);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/\p{Mn}/gu, "").replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ");
function findCity(text) {
  const t = " " + norm(text) + " ";
  for (const c of CITY_NAMES) {
    if (t.includes(" " + norm(c) + " ")) return c;
  }
  return "";
}

// ── Filtre géographique : 30 km autour de Nancy ─────────────────────────────
// Pourquoi ici et pas seulement dans update-events.js : la page « Événements »
// de Facebook mélange l'onglet Découvrir (Metz, Luxembourg, Vosges, Bretagne).
// update-events.js filtre bien à 30 km (BAN + haversine) mais GARDE les villes
// vides au bénéfice du doute : or une carte FB n'a pas d'adresse structurée,
// donc la ville ressort vide 8 fois sur 10 et le Grand Est entier passait.
// On tranche donc à la source : commune non identifiée dans les 30 km =>
// événement écarté (`--nofilter` pour tout garder).
// Référentiel HORS LIGNE : communes-30km.json (367 communes, nom officiel +
// coords + codes postaux). Aucun appel réseau. Régénérer : node gen-communes.js.
let COMMUNES30 = {};
try { COMMUNES30 = require("./communes-30km.json"); } catch {}
// Clés normalisées triées par longueur DESC (même raison que CITY_NAMES).
const NEAR_KEYS = Object.values(COMMUNES30)
  .map((c) => [normKey(c.nom), c.nom])
  .filter(([k]) => k.length >= 4)
  .sort((a, b) => b[0].length - a[0].length);
// Alias « nom court » : sur les affiches et les noms de salles, on écrit
// "Vandoeuvre" ou "Jarville", pas "Vandœuvre-lès-Nancy". On indexe donc le
// préfixe avant lès/devant/sur/sous/en/de… quand il est UNIQUE dans les 30 km
// (sinon "Villers" désignerait 3 communes différentes : on l'ignore).
// Seuil à 7 caractères + liste noire : un alias trop court ou trop courant
// ferait des faux positifs ("Centre Pierre Janet" -> Pierre-la-Treiche).
const SEP = /\s(?:les|le|la|devant|sous|sur|en|aux|derriere|et|de|du|des|d)\s/;
const ALIAS_STOP = new Set(["charmes", "fresnes", "serres", "maisons", "moulins"]);
const aliasOf = (k) => {
  const m = k.split(SEP)[0];
  return m !== k && m.length >= 7 && !ALIAS_STOP.has(m) ? m : "";
};
const aliasCount = new Map();
for (const [k] of NEAR_KEYS) {
  const m = aliasOf(k);
  if (m) aliasCount.set(m, (aliasCount.get(m) || 0) + 1);
}
for (const [k, nom] of [...NEAR_KEYS]) {
  const m = aliasOf(k);
  if (m && aliasCount.get(m) === 1 && !NEAR_KEYS.some(([kk]) => kk === m)) NEAR_KEYS.push([m, nom]);
}
NEAR_KEYS.sort((a, b) => b[0].length - a[0].length);

const NEAR_CP = new Map();
for (const c of Object.values(COMMUNES30)) for (const cp of c.cp || []) if (!NEAR_CP.has(cp)) NEAR_CP.set(cp, c.nom);
// Clé normalisée -> nom officiel (accents, casse), pour uniformiser la ville
// écrite dans events-facebook.json ("PAGNEY DERRIERE BARINE" -> "Pagney-derrière-Barine").
const NEAR_BY_KEY = new Map(Object.values(COMMUNES30).map((c) => [normKey(c.nom), c.nom]));

// "ST MAX", "Saint-Max", "SAINT MAX" doivent tomber sur la même clé.
function normKey(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "")
    .replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, " ")
    .replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte").trim();
}

// Noms de communes qui sont aussi des mots courants ou des prénoms : on les
// accepte dans une ADRESSE mais pas dans un titre ou un texte d'affiche
// ("Fête paysanne dans les serres" n'est pas la commune de Serres).
const TEXT_STOP = new Set(["serres", "romain", "viviers", "lucy", "oron", "praye", "bures", "maron", "crion"]);
function findNearCity(text, strict) {
  const t = " " + normKey(text) + " ";
  for (const [k, nom] of NEAR_KEYS) {
    if (strict && (k.length < 5 || TEXT_STOP.has(k))) continue;
    if (t.includes(" " + k + " ")) return nom;
  }
  return "";
}

function findNearCp(text) {
  const re = /\b(\d{5})\b/g;
  let m;
  while ((m = re.exec(String(text || "")))) if (NEAR_CP.has(m[1])) return NEAR_CP.get(m[1]);
  return "";
}

// Salles connues : data.js (généré par update-events.js, déjà filtré à 30 km)
// donne ~870 couples lieu -> ville des 15 autres sources. Ça rattrape les
// cartes FB qui n'affichent QUE le nom de la salle ("Poirel", "L'Autre Canal").
// Prudence : on ignore les libellés génériques et les lieux ambigus (même nom
// dans deux villes), et on n'utilise PAS la source facebook (circulaire).
const GENERIC_PLACE = /^(salle|salle des fetes|salle polyvalente|mairie|eglise|gymnase|stade|stade municipal|centre culturel|maison des associations|place|parc|chapiteau|complexe sportif|espace|foyer|salle communale|salle des sports|hotel de ville|mediatheque|bibliotheque|cinema|theatre|centre ville|halle|jardin|lac|plage|ferme|chateau|abbaye|musee|centre social|dojo|piscine|camping)$/;
function loadVenues() {
  const map = new Map();
  const p = path.join(__dirname, "data.js");
  if (!fs.existsSync(p)) return map;
  let events = [];
  try {
    const src = fs.readFileSync(p, "utf8");
    events = new Function(`${src}; return typeof EVENTS !== "undefined" ? EVENTS : [];`)();
  } catch { return map; }
  const tmp = new Map();
  for (const e of events) {
    if (!e || e.source === "facebook") continue;
    const key = normKey(e.place);
    const city = String(e.city || "").trim();
    if (key.length < 6 || GENERIC_PLACE.test(key) || !city) continue;
    if (!NEAR_BY_KEY.has(normKey(city))) continue;
    if (!tmp.has(key)) tmp.set(key, new Set());
    tmp.get(key).add(city);
  }
  for (const [k, set] of tmp) if (set.size === 1) map.set(k, [...set][0]);
  return map;
}
const VENUES = loadVenues();

function findVenueCity(place) {
  const k = normKey(place);
  if (k.length < 6) return "";
  if (VENUES.has(k)) return VENUES.get(k);
  for (const [vk, city] of VENUES) if (vk.length >= 8 && (k.includes(vk) || vk.includes(k))) return city;
  return "";
}

// Ordre : adresse (le plus fiable) -> code postal -> affiche/titre -> salle connue.
function resolveNearCity(place0, title, caption) {
  return findNearCity(place0) || findNearCp(place0) || findNearCity(caption, true)
    || findNearCity(title, true) || findVenueCity(place0);
}

// ── Extraction des événements depuis le HTML ────────────────────────────────
// Le code source contient des <script type="application/json" ... data-sjs>{…}</script>.
// On parse chaque blob et on parcourt récursivement à la recherche des nœuds
// d'événement (un objet qui possède à la fois `name` et `eventUrl`).
function extractEventNodes(html) {
  const nodes = [];
  const seen = new Set();
  const re = /<script type="application\/json"[^>]*data-sjs>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    walk(data, nodes, seen);
  }
  // Certaines pages exposent aussi le JSON hors balise (copier-coller brut) :
  if (!nodes.length) {
    try { walk(JSON.parse(html), nodes, seen); } catch {}
  }
  return nodes;
}

function walk(value, out, seen) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) walk(v, out, seen);
    return;
  }
  if (typeof value.name === "string" && typeof value.eventUrl === "string") {
    const id = String(value.id || value.eventUrl);
    if (!seen.has(id)) { seen.add(id); out.push(value); }
  }
  for (const k in value) walk(value[k], out, seen);
}

// ── Fallback : extraction depuis les CARTES HTML rendues ─────────────────────
// Quand on capture le DOM affiché (events défilés), ils ne sont PAS en JSON mais
// en cartes <a href="/events/ID/…">. On reconstruit un pseudo-nœud par carte.
// Mois FR -> numéro. "juin" et "juil" partagent le préfixe "jui" : on les
// distingue donc sur 4 lettres, sinon tout juin/juillet retombait à 0.
function monthNum(word) {
  const w = String(word || "").toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").replace(/\.$/, "");
  if (w.startsWith("jan")) return 1;
  if (w.startsWith("fev")) return 2;
  if (w.startsWith("mar")) return 3;
  if (w.startsWith("avr")) return 4;
  if (w === "mai") return 5;
  if (w.startsWith("juin")) return 6;
  if (w.startsWith("juil")) return 7;
  if (w.startsWith("aou")) return 8;
  if (w.startsWith("sep")) return 9;
  if (w.startsWith("oct")) return 10;
  if (w.startsWith("nov")) return 11;
  if (w.startsWith("dec")) return 12;
  return 0;
}

const stripTags = (h) => h.replace(/<[^>]+>/g, " ")
  .replace(/<[^>]*$/, " ").replace(/[<>]/g, " ")
  .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;| /g, " ")
  .replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

// "Jeu, 27 août - 29 août" / "Dim, 27 sept. à 07:30" -> {date ISO, schedule}
function parseFrenchDate(sentence, todayISO) {
  const s = String(sentence || "");
  const md = s.match(/(\d{1,2})\s*([a-zà-ÿ.]{3,9})/i);
  if (!md) return { date: "", schedule: "" };
  const day = parseInt(md[1], 10);
  const mon = monthNum(md[2]);
  if (!mon) return { date: "", schedule: "" };
  const [ty, tm, td] = todayISO.split("-").map(Number);
  let year = ty;
  if (mon < tm || (mon === tm && day < td)) year += 1; // mois déjà passé -> année prochaine
  const date = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const tt = s.match(/(\d{1,2})\s*[h:]\s*(\d{2})/);
  const schedule = tt ? (tt[2] === "00" ? `${+tt[1]}h` : `${+tt[1]}h${tt[2]}`) : "";
  return { date, schedule };
}

const MONTH_RE = "janv|févr|fev|fév|mars|avril|avr|mai|juin|juil|août|aout|aou|sept|sep|oct|nov|déc|dec";

function extractEventCards(html) {
  const cards = [];
  const seen = new Set();
  // positions de chaque lien d'événement
  const linkRe = /href="(?:https:\/\/www\.facebook\.com)?\/events\/(\d{6,})\/[^"]*"/g;
  const hits = [];
  let m;
  while ((m = linkRe.exec(html))) hits.push({ id: m[1], idx: m.index });
  for (let i = 0; i < hits.length; i++) {
    const { id, idx } = hits[i];
    if (seen.has(id)) continue;
    seen.add(id);
    // tranche de la carte : du lien jusqu'au prochain event différent (ou +6000)
    let end = html.length;
    for (let j = i + 1; j < hits.length; j++) { if (hits[j].id !== id) { end = hits[j].idx; break; } }
    const slice = html.slice(idx, Math.min(end, idx + 6000));
    // titre = texte brut du lien imbriqué vers /events/ID/
    const tm = slice.match(new RegExp('href="[^"]*\\/events\\/' + id + '\\/[^"]*"[^>]*>([^<>]{2,160})<\\/a>'));
    const name = tm ? stripTags(tm[1]).trim() : "";
    // texte visible : on saute le 1er '>' pour ne pas inclure l'URL de l'attribut href
    const text = stripTags(slice.slice(slice.indexOf(">") + 1));
    const alt = (slice.match(/alt="([^"]{2,300})"/) || [])[1] || "";  // OCR de l'affiche
    // date : ancrée sur "<jour> <mois>" (évite le faux "ven" de évèVENements)
    const dateSent = (text.match(new RegExp(
      `\\b\\d{1,2}\\s+(?:${MONTH_RE})[a-zà-ÿ.]*(?:\\s*[-–]\\s*\\d{1,2}\\s+(?:${MONTH_RE})[a-zà-ÿ.]*)?(?:[^0-9]{0,6}\\d{1,2}\\s*[h:]\\s*\\d{2})?`, "i"
    )) || [])[0] || "";
    const pop = (text.match(/[\d  .,KM]+intéress[^·•]*(?:[·•][^•]*particip\w*)?/i) || [])[0] || "";
    // lieu : entre le titre et la popularité (FR "intéressés" / EN "participant"),
    // en retirant la date et le titre.
    let head = text.split(/\d[\d  .,KM]*\s*(?:intéress|participant|going|interested)/i)[0] || "";
    if (name) head = head.split(name).join(" ");
    if (dateSent) head = head.split(dateSent).join(" ");
    let place = head
      .replace(/\b(lun|mar|mer|jeu|ven|sam|dim)(di|credi|credi|redi|nche|edi)?\.?,?/gi, " ")
      .replace(/\b(en cours|demain|aujourd\W*hui|participant\(s\)|à \d{1,2}\s*[h:]\s*\d{0,2})\b/gi, " ")
      .replace(/\s+/g, " ").trim().slice(0, 80);
    if (place.length < 3) place = "";
    cards.push({
      id, name,
      eventUrl: `https://www.facebook.com/events/${id}/`,
      _card: true, _alt: alt, _dateSent: dateSent.trim(), _pop: pop.trim(), _place: place,
    });
  }
  return cards;
}

// ── Mapping nœud Facebook -> schéma EVENTS ──────────────────────────────────
function ts2date(ts) {
  if (!ts) return "";
  // start_timestamp en secondes (epoch). On garde la date locale FR (UTC+1/+2).
  const d = new Date((Number(ts) + 3600) * 1000); // +1h : approx fuseau, évite de
  return d.toISOString().slice(0, 10);             // basculer la veille en soirée.
}

function hhmmFromTs(ts) {
  if (!ts) return "";
  const d = new Date((Number(ts) + 3600) * 1000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  if (h === 0 && m === 0) return "";
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function imageOf(node) {
  const p = node.cover_photo && node.cover_photo.photo;
  return (p && ((p.eventImage && p.eventImage.uri) || (p.image && p.image.uri))) || null;
}

// L'« accessibility_caption » de l'affiche = texte OCR de l'image : très riche
// pour deviner la catégorie (CONCERTS, EXPOSITION, RANDO, SPECTACLE…).
function captionOf(node) {
  const p = node.cover_photo && node.cover_photo.photo;
  return (p && p.accessibility_caption) || "";
}

function rsvpOf(node) {
  const r = node.rsvp_button_renderer && node.rsvp_button_renderer.event;
  return (r && r.connection_style) || "";   // INTERESTED / GOING / ""
}

// NFKC convertit les fausses polices Facebook (𝐒𝐚𝐥𝐬𝐚, 𝑖𝑡𝑎𝑙𝑖𝑐…) en texte normal.
const unstyle = (s) => String(s || "").normalize("NFKC");

function toEvent(node, todayISO) {
  const title = unstyle(node.name).trim();
  if (!title) return null;

  // Carte HTML (DOM rendu) : pas de timestamp, on parse la phrase de date FR.
  let startDate, schedule, place0, caption;
  if (node._card) {
    const d = parseFrenchDate(node._dateSent, todayISO);
    startDate = d.date; schedule = d.schedule;
    place0 = node._place || ""; caption = node._alt || "";
  } else {
    startDate = ts2date(node.start_timestamp);
    schedule = hhmmFromTs(node.start_timestamp);
    place0 = (node.event_place && node.event_place.contextual_name) || "";
    caption = captionOf(node);
  }
  if (!startDate) return null;

  // "MJC Lillebonne - 14 rue ..., 54000 Nancy, France" -> lieu + ville
  const parts = place0.split(",").map((s) => s.trim()).filter(Boolean);
  let place = unstyle((parts[0] || "").split(" - ")[0]).trim();
  let cityRaw = parts.length > 1
    ? parts[parts.length - 1].replace(/^France$/i, parts[parts.length - 2] || "")
    : "";
  cityRaw = cityRaw.replace(/^\d{5}\s*/, "").replace(/,?\s*France$/i, "").trim();
  let city = cleanCity(cityRaw) || cityRaw;
  // Carte HTML : pas d'adresse structurée -> on cherche une commune connue dans
  // le lieu + le titre + le texte de l'affiche.
  if (node._card) city = findCity(`${place0} ${title} ${caption}`); // sinon vide (pas de bruit)

  // Périmètre 30 km : on rejoue la détection sur le référentiel complet des
  // communes proches (367, pas seulement le Grand Nancy de CITY_CANON), ce qui
  // sert À LA FOIS à remplir la ville et à décider si l'événement est gardé.
  const nearCity = NEAR_KEYS.length
    ? (NEAR_BY_KEY.get(normKey(city)) || resolveNearCity(place0, title, caption))
    : city;
  if (nearCity) city = NEAR_BY_KEY.get(normKey(nearCity)) || nearCity;

  const cat = resolveCategoryFrom({ title, description: caption, location: place0 });
  const rawId = String(node.id || title).replace(/[^A-Za-z0-9]+/g, "").slice(0, 40);
  const sortDate = startDate < todayISO ? todayISO : startDate;

  return {
    uuid: `fb-${rawId}`,
    title,
    category: cat.key,
    catLabel: cat.label,
    catEmoji: cat.emoji,
    subcats: [],
    date: sortDate,
    endDate: startDate,
    dateText: node._card ? (node._dateSent || "") : String(node.day_time_sentence || "").trim(),
    schedule,
    place,
    city,
    free: false,
    reservation: false,
    image: node._card ? null : imageOf(node),
    url: String(node.eventUrl || "").split("?")[0],
    source: "facebook",
    rsvp: node._card ? "" : rsvpOf(node),       // info Facebook : INTERESTED/GOING
    online: !!node.is_online,
    _fromCard: !!node._card,                     // interne (retiré à l'écriture)
    _near: !!nearCity,                           // interne : commune <= 30 km identifiée
  };
}

// ── Collecte des fichiers ───────────────────────────────────────────────────
function gather(inputs, dir) {
  const files = [];
  const add = (p) => {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) if (/\.(html?|json)$/i.test(f)) files.push(path.join(p, f));
    } else if (/\.(html?|json)$/i.test(p)) files.push(p);
  };
  if (inputs.length) inputs.forEach(add); else add(dir);
  return [...new Set(files)];
}

function parseArgs(argv) {
  const o = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
    else o._.push(a);
  }
  return o;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const dir = a.dir || path.join(__dirname, "ics-facebook");
  const out = a.out || path.join(__dirname, "events-facebook.json");
  const files = gather(a._, dir);
  if (!files.length) {
    console.error(`✗ Aucun .html/.json trouvé dans « ${path.relative(__dirname, dir) || dir} ».`);
    console.error(`  Enregistre la page https://www.facebook.com/events/calendar/ (HTML seul) dedans.`);
    process.exit(1);
  }
  const todayISO = new Date().toISOString().slice(0, 10);
  const all = [];
  let nJson = 0, nCard = 0;
  for (const f of files) {
    let raw;
    try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
    // Une page « view-source » échappe le HTML (&lt; &gt; &amp; &quot;) : on déséchappe.
    if (/view-source/i.test(path.basename(f)) || /&lt;script/.test(raw)) {
      raw = raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    }
    for (const node of extractEventNodes(raw)) { const ev = toEvent(node, todayISO); if (ev) { all.push(ev); nJson++; } }
    for (const node of extractEventCards(raw)) { const ev = toEvent(node, todayISO); if (ev) { all.push(ev); nCard++; } }
  }
  // Dédup par id : on PRÉFÈRE la version JSON (date exacte) à la carte HTML.
  const byId = new Map();
  for (const e of all) {
    const prev = byId.get(e.uuid);
    if (!prev) byId.set(e.uuid, e);
    else if (prev._fromCard && !e._fromCard) byId.set(e.uuid, e);
  }
  const merged = [...byId.values()].sort((x, y) => (x.date || "").localeCompare(y.date || ""));

  // Périmètre : on ne traite QUE les événements à 30 km max de Nancy.
  const list = a.nofilter ? merged : merged.filter((e) => e._near);
  const dropped = merged.length - list.length;

  const clean = list.map(({ _fromCard, _near, ...e }) => e);
  fs.writeFileSync(out, JSON.stringify(clean, null, 2), "utf8");
  console.log(`✓ ${files.length} fichier(s) → ${list.length} événement(s) Facebook (JSON:${nJson} cartes:${nCard}) → ${path.relative(__dirname, out) || out}`);
  if (!a.nofilter) {
    console.log(`  Périmètre 30 km : ${dropped} événement(s) écarté(s) sur ${merged.length} (commune hors zone ou non identifiée).`);
    if (!NEAR_KEYS.length) console.warn("  ⚠ communes-30km.json introuvable : AUCUN filtre appliqué.");
  }
  const byCat = {};
  for (const e of list) byCat[e.catLabel] = (byCat[e.catLabel] || 0) + 1;
  console.log("  Catégories :", Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(", ") || "—");
  console.log(`  Puis : node update-events.js  (fusionne dans data.js)`);
}

if (require.main === module) main();

module.exports = { extractEventNodes, extractEventCards, toEvent };
