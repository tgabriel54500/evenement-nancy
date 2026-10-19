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

// Polices de la DA. Une affiche SVG affichée en <img> ne charge aucune police
// web : la pile se rabat sur la grotesque du système (Helvetica Neue sur Mac
// et iPhone, Arial ailleurs), proche de Sets Grotesk.
const FONT_TITLE = "'Sets Grotesk', 'Inter Tight', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_BODY = "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif";
// Statue de Stanislas au trait (da/stanislas.svg, viewBox 480.54 x 454.15).
const STANISLAS = "M292.25,126.44l17.12-3.41,8.63,8.93-2.74,17.02,8.64,9.02-3.62,9.53,16.79,16.81,5.43.2,2.33-2.21c.28-.84.38-2.98.05-3.81l-2.72-2.64c-1.97.45-3.37.93-5.58,1.93l-3.59-7.57,5.04-1.66,6.88-1.56,8.64,8.03.03,10.22-8.09,7.71-11.78-.29-4.05-3.83-36.44,21.73,7.46,11.94-32.27,36.22-9.06,26.29,7.22-1.24-24.8,40.97-7.93-3.38,18.92-26.4-14.79,2.79-28.22,5.21-65.33-24.3-1.92,11.71-22.81-14.07-.33-15.31-11.73.09-4.28,5.81-23.67,1.67-13.35-20.67,5.95-7.37-18.74-1.87-8.9-8.43-8.23-7.97,60.4-4.85,21.81,7.83-.13-11.71,30.2,16.23,54.46,13.14,37.86-9.7,48.4-12.51-8.16-12.98,9.43-5.78-13.02-5.1-1.35-8.33,2.02-4.53-1.32-5.48c-.23-.94-.02-2.31.11-3.62l-5.73-.59-3.7-7.15,9.54-15.74-1.63-4.4,8.67-16.88-1.36-5.61,9.24-12.11,27.71-5.76,30.54,6.4,18.73,25.17-.89,30.67,1.94,2.48,6.79-.74,9.64,7.99,2.27,12.5-5.21,8.69,36.67,35.27,27.01,109.69-8.38,2.29-26.34-107.34-12.2-11.9-5.35-5.11h-40.89s-18.35,15.74-18.35,15.74l-3.35,3.12-22.07,51.63c-.07.8-.27.79-.39-.01l14.47-56.57,26.76-22.56,34.59-.08-9.2-8.86-39.22.05-32.96,33.01-23.82,88.09,24.19-17.43,24.22-38.62,23.74-37.6,34.8-.03,12.51,12.92,10.36,11.53,1.27,7.92-7.08-5.47,21.14,85.67-8.32,2.3-23.97-96.41-9.52-9.81h-26.47s-34.78,54.69-34.78,54.69l9.13-6.34,43.7-4.68-20.48,6.8-20.2,6.35-68.3,49.08c-.52.45-.66.41-.53-.11l13.3-49.37,17.33-63.81,37.37-37.32,41.74-.03,4.31-7.12-1.3-6.34-4.99-3.96-.05,8.89-5.58,7.32-6.5-5.09,3.47-4.81.02-6.81-3.32-3.77-4.54.51-3.05-8.25,5.5-.72.66-25.62-14.92-19.75-25.58-5.43-22.99,4.76-4.68,6.15ZM285.22,190.55c5.1,1.76,9.34,3.84,13.93,6.49l24.06-14.4-12.91-12.99,3.6-9.92-7.86-7.9,2.77-16.96c-.62-.92-1.6-1.9-2.44-2.53l-14.97,3.08-6.33,12.06,1.89,4.64-8.72,14.18,8.48,1.3c-.33,3.34-1.12,6.47-.93,9.54l1.62,7.35-2.18,6.06ZM94.72,252.46l-8.44,2.33-2.29-8.13,12.95-3.62,11.01,9.5,11.33.03-.4-18.03-23.09-8.32-39.29,3.08c.45.87,1.26,1.27,2.19,1.37l30.33,3-12.12,14.91,7.39,11.16,14.51-1.05,1.13-1.87-5.21-4.36ZM136.09,276.33l6.15-40.14-14.89-8.18.91,43.44,7.83,4.88ZM145.81,269.99l64.66,24.03,39.16-7.21,11.12-32.31,19.76-22.42-69.75,17.9,8.05,20.71-20.7-20.12-47.51-11.44-4.79,30.85Z";

// Affiche aux couleurs de la DA (Rouge Lorraine, Anthracite, Blanc Cassé) :
// la statue en filigrane, la catégorie en rouge, le titre en blanc.
function posterDA(ev, labels) {
  const label = String(labels[ev.category] || "Sortie").toUpperCase();
  const { size, lines } = layoutTitle(ev.title);
  const lineH = Math.round(size * 1.08);
  const titleTop = Math.max(640 - ((lines.length - 1) * lineH) / 2, 470 + size * 0.85);
  const titleSVG = lines.map((l, i) =>
    `<text x="400" y="${Math.round(titleTop + i * lineH)}" font-size="${size}">${esc(l)}</text>`).join("\n      ");
  const date = dateLine(ev);
  const city = ev.city || "";
  const bottomY = Math.max(titleTop + (lines.length - 1) * lineH + 115, 900);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" role="img" aria-label="${esc(ev.title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#1C1C1C"/>
      <stop offset="1" stop-color="#121212"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1200" fill="url(#g)"/>
  <path d="${STANISLAS}" fill="#F2F2F0" opacity=".06" transform="translate(150 610) scale(1.45)"/>
  <rect x="0" y="0" width="800" height="10" fill="#E63226"/>
  <text x="400" y="400" text-anchor="middle" font-family="${FONT_BODY}"
        font-size="28" font-weight="700" letter-spacing="9" fill="#E63226">${esc(label)}</text>
  <rect x="360" y="426" width="80" height="6" rx="3" fill="#E63226"/>
  <g text-anchor="middle" font-family="${FONT_TITLE}" font-weight="800" letter-spacing="-1" fill="#F2F2F0">
      ${titleSVG}
  </g>
  <g text-anchor="middle" font-family="${FONT_BODY}">
    ${date ? `<text x="400" y="${Math.round(bottomY)}" font-size="46" font-weight="700" fill="#E63226">${esc(date.charAt(0).toUpperCase() + date.slice(1))}</text>` : ""}
    ${city ? `<text x="400" y="${Math.round(bottomY + 58)}" font-size="38" font-weight="600" fill="#ABABA6">${esc(city)}</text>` : ""}
    <text x="400" y="1150" font-size="22" font-weight="700" letter-spacing="6" fill="#F2F2F0" opacity=".45">AGENDA GRAND-NANCY</text>
  </g>
</svg>
`;
}

function posterSVG(ev, opts = {}) {
  if (!opts.themes) return posterDA(ev, opts.labels || CAT_LABEL);
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
  <text x="400" y="500" text-anchor="middle" font-family="${FONT_BODY}"
        font-size="30" font-weight="700" letter-spacing="8" fill="${accent}">${esc(label)}</text>
  <rect x="360" y="526" width="80" height="4" rx="2" fill="${accent}" opacity=".8"/>
  <g text-anchor="middle" font-family="${FONT_TITLE}" font-weight="800" letter-spacing="-1" fill="#ffffff">
      ${titleSVG}
  </g>
  <g text-anchor="middle" font-family="${FONT_BODY}">
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
  // Images hébergées chez une source qui peut les refuser (Alentoor) : on garde
  // l'image d'origine et on prépare une affiche de secours (`fallbackImage`),
  // affichée par la galerie et les pages si l'image ne se charge pas.
  const FRAGILE = /^https?:\/\/(www\.)?alentoor\.fr\//;
  for (const ev of events) {
    if (ev.image && !ev.autoPoster && FRAGILE.test(ev.image)) {
      const file = `${posterKey(ev)}.svg`;
      const svg = posterSVG(ev, opts);
      const full = path.join(dir, file);
      if (!fs.existsSync(full) || fs.readFileSync(full, "utf8") !== svg) fs.writeFileSync(full, svg, "utf8");
      ev.fallbackImage = `${dirName}/${file}`;
      kept.add(file);
      continue;
    }
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
