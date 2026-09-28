#!/usr/bin/env node
/**
 * Affiches générées pour les événements SANS image (Est Républicain surtout,
 * quelques Facebook). Même principe que les affiches de l'onglet Sport
 * (update-sport.js) : un SVG par événement dans affiches-auto/, aux couleurs de
 * sa catégorie, avec pictogramme, titre, date et commune.
 *
 * Appelé par update-events.js juste avant l'écriture de data.js :
 *   const { applyAutoPosters } = require("./affiches-auto");
 *   applyAutoPosters(merged);   // pose e.image = "affiches-auto/<clé>.svg" + e.autoPoster = true
 *
 * En ligne de commande (sans relancer toute la collecte) :
 *   node affiches-auto.js          → génère les SVG pour le data.js actuel et le met à jour
 *   node affiches-auto.js --dry    → génère les SVG sans toucher à data.js
 *
 * La galerie masque son bandeau titre sur ces affiches (classe .poster--auto),
 * puisque le titre et la commune sont déjà dessinés dedans.
 */

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "affiches-auto");

// [fond haut, fond bas, accent, pictogramme]
const THEMES = {
  "festival":           ["#9a3412", "#431407", "#fbbf24", "🎪"],
  "musiques-actuelles": ["#3b0764", "#0f0a1e", "#f472b6", "🎸"],
  "musique-classique":  ["#1c1917", "#0c0a09", "#e7c46a", "🎻"],
  "spectacle":          ["#991b1b", "#3b0a0a", "#fecaca", "🎭"],
  "exposition":         ["#115e59", "#042f2e", "#99f6e4", "🖼️"],
  "jeune-public":       ["#1d4ed8", "#172554", "#fde047", "🧸"],
  "activite":           ["#3f6212", "#1a2e05", "#d9f99d", "🎨"],
  "conference":         ["#3730a3", "#1e1b4b", "#c7d2fe", "🎓"],
  "citoyennete":        ["#0f766e", "#042f2e", "#a7f3d0", "🤝"],
  "autre":              ["#57534e", "#1c1917", "#fdba74", "📌"],
};
const CAT_LABEL = {
  "festival": "Festival", "musiques-actuelles": "Musiques actuelles", "musique-classique": "Musique classique",
  "spectacle": "Spectacle", "exposition": "Exposition", "jeune-public": "Jeune public",
  "activite": "Activité", "conference": "Rencontre", "citoyennete": "Citoyenneté", "autre": "Sortie",
};
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Découpe en lignes d'au plus `max` caractères, sans couper les mots.
function wrap(text, max) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Titre : on cherche la plus grande taille qui tient en 5 lignes max.
function layoutTitle(title) {
  for (const [size, chars] of [[100, 12], [88, 14], [76, 16], [66, 19], [58, 22], [50, 25]]) {
    const lines = wrap(title, chars);
    if (lines.length <= 4 || (size === 50 && lines.length <= 5)) return { size, lines };
  }
  const lines = wrap(title, 25).slice(0, 5);
  lines[4] = (lines[4] || "").replace(/\s*\S*$/, "…");
  return { size: 50, lines };
}

function dateLine(ev) {
  const fmt = (iso, withDay) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${withDay ? DAYS[dt.getDay()] + " " : ""}${d} ${MONTHS[m - 1]}`;
  };
  if (!ev.date) return "";
  if (ev.endDate && ev.endDate > ev.date) return `jusqu'au ${fmt(ev.endDate, false)}`;
  return fmt(ev.date, true);
}

function posterKey(ev) {
  const base = String((ev.uuid || ev.title) + "|" + ev.date);   // jour par jour : une série étalée a des dates différentes
  // Clé lisible et sûre pour un nom de fichier + petit hash anti-collision.
  let h = 0;
  for (const ch of base) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const slug = base.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug}-${h.toString(36)}`;
}

function posterSVG(ev, opts = {}) {
  const themes = opts.themes || THEMES, labels = opts.labels || CAT_LABEL;
  const [top, bottom, accent, picto] = themes[ev.category] || themes.autre || THEMES.autre;
  // Bandeau au-dessus du titre : la catégorie, ou ce que l'appelant décide
  // (l'onglet Pro y met le nom du réseau organisateur).
  const label = String((opts.labelOf && opts.labelOf(ev)) || labels[ev.category] || "Sortie").toUpperCase();
  const { size, lines } = layoutTitle(ev.title);
  const lineH = Math.round(size * 1.12);
  // Bloc titre centré verticalement autour de y=700 (zone sûre 220–1000 : la
  // galerie pose ruban et pastille de date en haut, le cœur en bas à droite).
  const titleTop = Math.max(700 - ((lines.length - 1) * lineH) / 2, 548 + size * 0.8);   // jamais sous le filet de catégorie
  const titleSVG = lines.map((l, i) =>
    `<text x="400" y="${Math.round(titleTop + i * lineH)}" font-size="${size}">${esc(l)}</text>`).join("\n      ");
  const date = dateLine(ev);
  const city = ev.city || "";
  const bottomY = Math.max(titleTop + (lines.length - 1) * lineH + 120, 960);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" role="img" aria-label="${esc(ev.title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${top}"/>
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1200" fill="url(#g)"/>
  <g fill="none" stroke="${accent}" opacity=".13">
    <circle cx="690" cy="170" r="230" stroke-width="3"/>
    <circle cx="690" cy="170" r="330" stroke-width="2"/>
    <circle cx="90" cy="1120" r="260" stroke-width="3"/>
  </g>
  <text x="400" y="420" text-anchor="middle" font-size="110">${picto}</text>
  <text x="400" y="500" text-anchor="middle" font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="700" letter-spacing="8" fill="${accent}">${esc(label)}</text>
  <rect x="360" y="526" width="80" height="4" rx="2" fill="${accent}" opacity=".8"/>
  <g text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" fill="#ffffff">
      ${titleSVG}
  </g>
  <g text-anchor="middle" font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif">
    ${date ? `<text x="400" y="${Math.round(bottomY)}" font-size="50" font-weight="700" fill="${accent}">${esc(date.charAt(0).toUpperCase() + date.slice(1))}</text>` : ""}
    ${city ? `<text x="400" y="${Math.round(bottomY + 62)}" font-size="42" font-weight="600" fill="#ffffff" opacity=".78">${esc(city)}</text>` : ""}
  </g>
</svg>
`;
}

// Pose une affiche générée sur chaque événement sans image. Les fichiers
// d'événements disparus sont supprimés.
//
// `opts` permet à un autre onglet de réutiliser le moteur avec SON dossier et
// SES couleurs (update-pro.js : { dir: "affiches-pro", themes, labels }) sans
// toucher aux affiches de la culture : chaque dossier fait son propre ménage.
function applyAutoPosters(events, opts = {}) {
  const dirName = opts.dir || "affiches-auto";
  const dir = path.join(__dirname, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const kept = new Set();
  let n = 0;
  for (const ev of events) {
    if (ev.image && !ev.autoPoster) continue;
    const file = `${posterKey(ev)}.svg`;
    const svg = posterSVG(ev, opts);
    const full = path.join(dir, file);
    if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== svg) fs.writeFileSync(full, svg, "utf8");
    ev.image = `${dirName}/${file}`;
    ev.autoPoster = true;
    kept.add(file);
    n++;
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".svg") && !kept.has(f)) fs.unlinkSync(path.join(dir, f));
  console.log(`  🖼  ${n} affiche(s) générée(s) pour les événements sans image (${dirName}/).`);
  return n;
}

module.exports = { applyAutoPosters, posterSVG };

if (require.main === module) {
  const dataPath = path.join(__dirname, "data.js");
  const src = fs.readFileSync(dataPath, "utf8");
  const mod = { exports: {} };
  new Function("module", src + ";module.exports={CATEGORIES,EVENTS,GENERATED_AT}")(mod);
  const { EVENTS } = mod.exports;
  applyAutoPosters(EVENTS);
  if (process.argv.includes("--dry")) process.exit(0);
  // Réécrit uniquement le tableau EVENTS, en gardant l'en-tête et CATEGORIES.
  const i = src.indexOf("const EVENTS = ");
  fs.writeFileSync(dataPath, src.slice(0, i) + `const EVENTS = ${JSON.stringify(EVENTS, null, 2)};\n`, "utf8");
  console.log("✓ data.js mis à jour.");
}
