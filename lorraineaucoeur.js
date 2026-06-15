#!/usr/bin/env node
/**
 * Source « LorraineAUcoeur » (agenda loisirs/sorties de Lorraine) pour le
 * pipeline d'agrégation.
 *
 * Pourquoi ce fichier existe :
 *   data.js agrège déjà plusieurs agendas Nancy/métropole. Ce module ajoute
 *   l'agenda du portail régional https://www.lorraineaucoeur.com, FILTRÉ sur la
 *   zone de Nancy (le site couvre toute la Lorraine : on ne garde que les
 *   communes du Grand Nancy + anneau ~30 km, cf. NANCY_AREA).
 *
 * Comment ça marche :
 *   Vieux CMS (XOOPS, charset ISO-8859-1). Le home et les fiches ont leurs liens
 *   injectés en JS, MAIS le listing server-side `/modules/compte/evenements.php`
 *   est un TABLEAU complet (~53 événements à venir) où tout est présent :
 *     - URL canonique /evt-<id>/<slug>/<dept-ville>/<categorie>  (id + dept + ville + cat)
 *     - colonne « Genre » (Fête animation, Concert, Exposition…)
 *     - titre, code postal + commune, période « du JJ-MM-AAAA au JJ-MM-AAAA »
 *     - vignette /uploads/compte/images/.../event<id>_min.jpg
 *   → AUCUNE fiche détail à charger. Pas de pagination (set figé sur l'agenda
 *   courant). robots.txt autorise (Crawl-delay 1s ; on ne fait qu'1 requête).
 *
 *   On normalise vers le schéma commun attendu par app.js :
 *     { uuid, title, category, subcats[], date, endDate, dateText, schedule,
 *       place, city, free, reservation, image, url, source }
 *
 * Usage :
 *   node lorraineaucoeur.js          # -> events-lorraineaucoeur.json
 *
 * S'utilise aussi comme module :  const { collect } = require("./lorraineaucoeur");
 */

const fs = require("fs");
const path = require("path");

const ORIGIN = "https://www.lorraineaucoeur.com";
const LISTING = ORIGIN + "/modules/compte/evenements.php";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── Périmètre géographique : Grand Nancy + anneau ~30 km ────────────────────
// Le site est régional ; on ne retient que ces communes (slug sans accents).
// Aligné sur la zone couverte par les autres sources (Grand Nancy + ring).
const NANCY_AREA = new Set([
  "nancy", "vandoeuvre-les-nancy", "villers-les-nancy", "laxou", "maxeville",
  "saint-max", "malzeville", "tomblaine", "jarville-la-malgrange",
  "essey-les-nancy", "heillecourt", "houdemont", "ludres",
  "fleville-devant-nancy", "seichamps", "pulnoy", "dommartemont",
  "art-sur-meurthe", "saulxures-les-nancy", "champigneulles", "frouard",
  "pompey", "liverdun", "neuves-maisons", "saint-nicolas-de-port",
  "dombasle-sur-meurthe", "toul", "pont-a-mousson", "luneville", "vezelise",
]);

function citySlug(name) {
  return String(name || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe").replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Catégories ──────────────────────────────────────────────────────────────
// On mappe le « Genre » du site (à défaut le slug de catégorie de l'URL) vers
// les clés canoniques du site (normalize.js repliera de toute façon le reste).
const KEY_META = {
  "festival":           { label: "Festivals",                emoji: "🎪" },
  "musiques-actuelles": { label: "Musiques actuelles",       emoji: "🎸" },
  "musique-classique":  { label: "Musique classique",        emoji: "🎻" },
  "spectacle":          { label: "Spectacles",               emoji: "🎭" },
  "exposition":         { label: "Expositions",              emoji: "🖼️" },
  "jeune-public":       { label: "Jeune public",             emoji: "🧸" },
  "activite":           { label: "Activités & ateliers",     emoji: "🎨" },
  "conference":         { label: "Conférences & rencontres", emoji: "🎓" },
  "citoyennete":        { label: "Citoyenneté",              emoji: "🤝" },
  "autre":              { label: "Autre",                    emoji: "📌" },
};
// Règles appliquées dans l'ordre sur le texte « genre + slug ».
const CAT_RULES = [
  [/concert|musiques?\s*actuelles?|chanson/i, "musiques-actuelles"],
  [/classique|op[ée]ra|r[ée]cital|symphoni|philharmoni/i, "musique-classique"],
  [/exposition|expo\b|vernissage/i, "exposition"],
  [/conf[ée]rence|d[ée]bat|rencontre|colloque/i, "conference"],
  [/th[ée][âa]tre|danse|humour|cirque|one\s*man|spectacle/i, "spectacle"],
  [/festival/i, "festival"],
  [/foire|salon|march[ée]|brocante|vide.?grenier/i, "festival"],
  [/randonn[ée]e|balade|visite|atelier|stage|nature/i, "activite"],
  [/jeune|enfant|famille/i, "jeune-public"],
  [/citoyen|solidaire|solidarit/i, "citoyennete"],
  [/f[êe]te|animation|feu d|guinguette|carnaval|bal\b|kermesse/i, "festival"],
];
function resolveCategory(genre, catSlug) {
  const hay = `${genre || ""} ${(catSlug || "").replace(/-/g, " ")}`;
  let key = "autre";
  for (const [re, k] of CAT_RULES) if (re.test(hay)) { key = k; break; }
  return { key, label: KEY_META[key].label, emoji: KEY_META[key].emoji };
}

// Catégories d'URL qui ne sont PAS des événements datés (encarts promo/pub).
const NON_EVENT = /^(promo|idee-cadeaux|bons-plans|hebergement|restauration)/;

// ── HTTP (ISO-8859-1) ─────────────────────────────────────────────────────
async function getLatin1(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("latin1"); // le site déclare ISO-8859-1
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

const decodeEntities = (s) =>
  String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à")
    .replace(/&ccedil;/g, "ç").replace(/&ecirc;/g, "ê").replace(/&ocirc;/g, "ô");
const stripTags = (s) => decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// ── Dates ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const toISO = (jj, mm, aaaa) => `${aaaa}-${mm}-${jj}`;

// Libellé de période RÉELLE (jours multiples) ; "" pour un jour unique.
function periodText(startISO, endISO) {
  if (!startISO || !endISO || endISO === startISO) return "";
  const [y1, m1, d1] = startISO.split("-").map(Number);
  const [y2, m2, d2] = endISO.split("-").map(Number);
  if (y1 !== y2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} ${y1} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  return `Du ${d1} au ${d2} ${MONTH_NAMES[m1 - 1]} ${y1}`;
}

// ── Parsing du tableau ──────────────────────────────────────────────────────
function parseListing(html) {
  const rows = html.split(/<tr class="(?:even|odd)">/).slice(1);
  const out = [];
  for (const r of rows) {
    const u = r.match(/href="(https:\/\/www\.lorraineaucoeur\.com\/evt-(\d+)\/[^"]+)"/);
    if (!u) continue;
    const url = u[1], id = u[2];
    const seg = url.replace(ORIGIN + "/", "").split("/").filter(Boolean); // [evt-id, slug, dept-ville, cat]
    const catSlug = seg[3] || "";
    if (NON_EVENT.test(catSlug)) continue; // encart promo, pas un événement

    // Dates : « du JJ-MM-AAAA … au JJ-MM-AAAA » ou « le JJ-MM-AAAA ».
    const dts = [...r.matchAll(/(\d{2})-(\d{2})-(\d{4})/g)].map((m) => toISO(m[1], m[2], m[3]));
    if (!dts.length) continue;
    const start = dts[0], end = dts[dts.length - 1];

    const genre = stripTags((r.match(/<td>([^<]*?)<\/td>\s*<td><a href="https/) || [])[1] || "");
    const title = stripTags((r.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || "");
    const city = stripTags((r.match(/item\.php[^"]*">([^<]+)<\/a>/) || [])[1] || "");
    const img = (r.match(/event\.php\?eventid=\d+"><img[^>]+src="([^"]+)"/) || [])[1] || null;

    out.push({ id, url, catSlug, genre, title, city, img, start, end });
  }
  return out;
}

// ── Normalisation ────────────────────────────────────────────────────────────
function buildEvents(rows, todayISO) {
  const out = [];
  const seen = new Set();
  for (const e of rows) {
    if (!NANCY_AREA.has(citySlug(e.city))) continue; // hors zone de Nancy
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const cat = resolveCategory(e.genre, e.catSlug);
    // Tri : un événement DÉJÀ en cours est calé sur aujourd'hui pour remonter.
    const sortDate = e.start < todayISO && e.end >= todayISO ? todayISO : e.start;
    out.push({
      uuid: "lac-" + e.id,
      title: e.title,
      category: cat.key,
      catLabel: cat.label, // retiré au rendu, sert à construire CATEGORIES
      catEmoji: cat.emoji,
      subcats: [],
      date: sortDate,
      endDate: e.end,
      // Période RÉELLE (vrai début) pour l'affichage des événements multi-jours.
      dateText: periodText(e.start, e.end),
      schedule: "",
      place: "",
      city: e.city,
      free: false,
      reservation: false,
      image: e.img,
      url: e.url,
      source: "lorraineaucoeur",
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Orchestration ────────────────────────────────────────────────────────────
async function collect() {
  process.stderr.write("→ LorraineAUcoeur : listing agenda (zone Nancy)…\n");
  const html = await getLatin1(LISTING);
  const rows = parseListing(html);
  const todayISO = new Date().toISOString().slice(0, 10);
  const list = buildEvents(rows, todayISO).filter((e) => e.endDate >= todayISO || e.date >= todayISO);
  process.stderr.write(`✓ ${list.length} événements LorraineAUcoeur (zone Nancy) sur ${rows.length} lus.\n`);
  return list;
}

async function main() {
  const list = await collect();
  const out = path.join(__dirname, "events-lorraineaucoeur.json");
  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  process.stderr.write(`✓ écrit : ${out} (${list.length} événements)\n`);
}

if (require.main === module) {
  main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
}

module.exports = { collect, parseListing, buildEvents, resolveCategory };
