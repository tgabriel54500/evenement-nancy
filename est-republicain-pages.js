#!/usr/bin/env node
/**
 * Importateur des pages « Pour sortir » de l'Est Républicain ENREGISTRÉES À LA MAIN.
 *
 * Pourquoi ce fichier existe :
 *   Le portail déclare une réserve anti-fouille (tdm-reservation:1) : on ne le
 *   scrape PAS. L'utilisateur parcourt lui-même les pages de résultats et les
 *   enregistre (« Page web complète ») dans ./ics-est-republicain. Ce script ne
 *   fait que lire ces fichiers locaux : aucune requête réseau.
 *   Plus rapide que l'export iCal fiche par fiche (20 à 30 événements par page).
 *
 * Ce que donne une carte (microdonnées schema.org/Event) :
 *   titre (parfois tronqué « ... »), date de début, « Jusqu'au … » (date de fin),
 *   commune + GPS, thème, début de description, lien, vignette (dossier _files).
 *   PAS d'heure ni de nom de salle.
 *
 * Flux :
 *   1. Enregistrer les pages de résultats dans ics-est-republicain/ (Page web complète)
 *   2. node est-republicain-pages.js   → events-est-republicain-pages.json
 *   3. node update-events.js            → fusion + dédoublonnage dans data.js
 *
 * Périmètre : 30 km autour de Nancy (GPS de la carte, sinon commune reconnue
 * dans communes-30km.json). Le reste est écarté.
 *
 * Usage :
 *   node est-republicain-pages.js
 *   node est-republicain-pages.js --dir=ics-est-republicain --out=events-est-republicain-pages.json
 *   node est-republicain-pages.js --nofilter
 *   node est-republicain-pages.js --vignettes     (copie les miniatures 100 px dans images/er/)
 */

const fs = require("fs");
const path = require("path");
const { resolveCategoryFrom } = require("./import-ics.js");

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--"))
  .map((a) => { const [k, v] = a.slice(2).split("="); return [k, v === undefined ? true : v]; }));
const DIR = path.resolve(__dirname, args.dir || "ics-est-republicain");
const OUT = path.resolve(__dirname, args.out || "events-est-republicain-pages.json");
const IMG_DIR = path.join(__dirname, "images", "er");
const NOFILTER = !!args.nofilter;

const NANCY = { lat: 48.6921, lon: 6.1844 };
const RADIUS_KM = 30;

let COMMUNES30 = {};
try { COMMUNES30 = require("./communes-30km.json"); } catch {}

// ── Utilitaires ─────────────────────────────────────────────────────────────
const stripAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slugKey = (s) => stripAccents(String(s || "").toLowerCase().replace(/œ/g, "oe"))
  .replace(/[^a-z0-9]+/g, " ").trim();

function decode(s) {
  return String(s || "")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
const stripTags = (s) => decode(String(s || "").replace(/<[^>]+>/g, " "));

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const NEAR = new Set(Object.values(COMMUNES30).map((c) => slugKey(c.nom)));

const MONTHS = [["janv", 1], ["jan", 1], ["fevr", 2], ["fev", 2], ["mars", 3], ["avr", 4], ["mai", 5],
  ["juin", 6], ["juil", 7], ["aout", 8], ["sept", 9], ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12]];
// « Jusqu'au 13 oct. 2026 » / « Le 16 sept. 2026 » → ISO
function frDate(text) {
  const m = stripAccents(String(text || "").toLowerCase()).match(/(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})/);
  if (!m) return "";
  const hit = MONTHS.find(([p]) => m[2].startsWith(p));
  if (!hit) return "";
  return `${m[3]}-${String(hit[1]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}

// Thème de l'URL (/pour-sortir/loisirs/<Theme>/<SousTheme>/…) → texte pour resolveCategoryFrom.
const URL_THEME = {
  "Concert-musique": "concert", "Exposition": "exposition", "Spectacle-theatre-conte": "spectacle",
  "Rencontre-conference": "conférence", "Randonnee-balade-visite-guidee-orientation": "visite",
  "Fete-festival": "festival", "Cinema": "cinéma", "Atelier-stage": "atelier",
};

// ── Parsing d'une page ──────────────────────────────────────────────────────
function parsePage(html, file) {
  const out = [];
  const chunks = html.split(/<li\s+class="media\b/).slice(1);
  for (const raw of chunks) {
    const li = raw.slice(0, raw.indexOf("</li>") >= 0 ? raw.indexOf("</li>") : raw.length);
    if (!/schema\.org\/Event/.test(li)) continue;          // ignore l'autopromo « Votre événement »
    const url = (li.match(/href="(https:\/\/[^"]*\/pour-sortir\/[^"]+)"/) || [])[1];
    if (!url) continue;
    const start = ((li.match(/itemprop="startDate"\s+content="([^"]+)"/) || [])[1] || "").slice(0, 10);
    const dateLabel = stripTags((li.match(/class="media-date">([^<]*)/) || [])[1]);
    let title = stripTags((li.match(/itemprop="name"[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
    const alt = decode(((li.match(/alt="Illustration ([^"]*)"/) || [])[1]) || "");
    if (alt.length > title.length) title = alt;
    const truncated = /(\.\.\.|…)$/.test(title);
    const parts = url.split("/");                           // …/loisirs/Theme/Sous/Region/Dept/Ville/AAAA/MM/JJ/slug
    const slug = parts[parts.length - 1] || "";
    if (truncated && slug) {
      // Le slug de l'URL, lui, est complet (mais sans accents ni casse) : on garde
      // le début du titre tel quel et on complète avec les mots manquants du slug.
      const head = title.replace(/(\.\.\.|…)$/, "").trim();
      const headWords = slugKey(head).split(" ").filter(Boolean);
      const slugWords = slugKey(slug.replace(/-/g, " ")).split(" ").filter(Boolean);
      let k = 0;
      while (k < headWords.length && slugWords[k] === headWords[k]) k++;
      const lastPartial = k < headWords.length ? 1 : 0;   // dernier mot du titre coupé en plein milieu
      const headKept = lastPartial ? head.split(/\s+/).slice(0, -1).join(" ") : head;
      const rest = slugWords.slice(k).join(" ");
      title = k >= headWords.length - lastPartial && rest ? `${headKept} ${rest}`.trim() : head;
    }
    // Guillemets englobants seulement s'ils ouvrent ET ferment le titre.
    title = title.replace(/^\s*(["“«])\s*([\s\S]*?)\s*(["”»])\s*$/, "$2").trim();
    if (/^["“«]/.test(title) && !/["”»]/.test(title.slice(1))) title = title.slice(1).trim();  // guillemet orphelin (titre tronqué)
    const city = stripTags((li.match(/itemprop="addressLocality">([^<]*)/) || [])[1]);
    const lat = parseFloat((li.match(/itemprop="latitude"\s+content="([^"]+)"/) || [])[1]);
    const lon = parseFloat((li.match(/itemprop="longitude"\s+content="([^"]+)"/) || [])[1]);
    const theme = stripTags((li.match(/class="theme">([^<]*)/) || [])[1]);
    const desc = stripTags((li.match(/itemprop="description">([\s\S]*?)<\/span>/) || [])[1]).replace(/\.\.\.$/, "…");
    const imgSrc = decode((li.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "");
    const iLoisirs = parts.indexOf("loisirs");
    const urlTheme = iLoisirs >= 0 ? parts[iLoisirs + 1] : "";
    const until = /jusqu/i.test(dateLabel) ? frDate(dateLabel) : "";
    const date = start || frDate(dateLabel);
    if (!date || !title) continue;
    out.push({ url, date, endDate: until && until > date ? until : date, title, city, lat, lon,
      theme, urlTheme, desc, imgSrc, file, slug, datePath: parts.slice(-4, -1).join("-") });
  }
  return out;
}

function inZone(ev) {
  if (Number.isFinite(ev.lat) && Number.isFinite(ev.lon)) return km(NANCY, ev) <= RADIUS_KM;
  return NEAR.has(slugKey(ev.city));
}

// Copie la vignette locale (dossier _files) vers images/er/<slug>.jpg.
function copyImage(ev, pageFile) {
  if (!ev.imgSrc || /^https?:|^data:/.test(ev.imgSrc)) return /^https?:/.test(ev.imgSrc) ? ev.imgSrc : null;
  const src = path.resolve(path.dirname(pageFile), decodeURIComponent(ev.imgSrc));
  if (!fs.existsSync(src)) return null;
  const ext = (path.extname(src) || ".jpg").toLowerCase();
  const name = `${ev.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 70)}-${ev.datePath}${ext}`;
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const dest = path.join(IMG_DIR, name);
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  return `images/er/${name}`;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(DIR)) { console.error(`✗ Dossier introuvable : ${DIR}`); process.exit(1); }
  const files = fs.readdirSync(DIR).filter((f) => /\.html?$/i.test(f)).map((f) => path.join(DIR, f));
  console.log(`→ Est Républicain (pages enregistrées) : ${files.length} fichier(s) HTML dans ${path.basename(DIR)}/`);
  const todayISO = new Date().toISOString().slice(0, 10);
  const byUrl = new Map();
  let raw = 0, out = 0, past = 0;
  const outCities = {};
  for (const f of files) {
    const cards = parsePage(fs.readFileSync(f, "utf8"), f);
    raw += cards.length;
    console.log(`  ${path.basename(f)} : ${cards.length} cartes`);
    for (const c of cards) {
      if (c.endDate < todayISO) { past++; continue; }
      if (!NOFILTER && !inZone(c)) { out++; outCities[c.city] = (outCities[c.city] || 0) + 1; continue; }
      if (byUrl.has(c.url)) continue;
      const cat = /choral|classique|lyrique|orgue|baroque/i.test(c.theme)
        ? { key: "musique-classique", label: "Musique classique", emoji: "🎻" }
        : resolveCategoryFrom({
        categories: [c.theme, URL_THEME[c.urlTheme]].filter(Boolean).join(" "),
        title: c.title, description: c.desc,
      });
      const sortDate = c.date < todayISO && c.endDate >= todayISO ? todayISO : c.date;
      byUrl.set(c.url, {
        uuid: `erp-${c.datePath}-${c.slug.toLowerCase()}`.slice(0, 120),
        title: c.title,
        category: cat.key,
        catLabel: cat.label,
        catEmoji: cat.emoji,
        subcats: c.theme ? [c.theme] : [],
        date: sortDate,
        endDate: c.endDate,
        dateText: "",
        schedule: "",
        place: "",
        city: c.city,
        free: false,
        reservation: false,
        // Vignettes des pages = 100×107 px, floues sur le mur d'affiches : pas d'image
        // par défaut (tuile titre + commune). --vignettes pour les copier quand même.
        image: args.vignettes ? copyImage(c, c.file) : null,
        url: c.url,
        source: "est-republicain",
      });
    }
  }
  const list = [...byUrl.values()].sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 2) + "\n");
  console.log(`✓ ${raw} cartes lues, ${byUrl.size} gardées (${past} passées, ${out} hors 30 km, ${raw - past - out - byUrl.size} doublons entre pages).`);
  const far = Object.entries(outCities).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(", ");
  if (far) console.log(`  Hors zone (top) : ${far}`);
  console.log(`  Avec vignette : ${list.filter((e) => e.image).length}/${list.length}`);
  console.log(`✓ écrit : ${OUT} (${list.length} événements)`);
  console.log("  Puis : node update-events.js");
}

if (require.main === module) main();
module.exports = { parsePage, frDate };
