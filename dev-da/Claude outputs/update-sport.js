#!/usr/bin/env node
/**
 * update-sport.js — fabrique `data-sport.js` (et les affiches) à partir de
 * `events-sport.json` (produit par sport-scrape.js) et de `sport-manuel.json`
 * (rencontres saisies à la main, qui complètent l'automatique champ par champ).
 *
 * Usage :  node update-sport.js
 *
 * Sortie :
 *   data-sport.js         CATEGORIES (les sports) + EVENTS, même schéma que
 *                         data.js → la page sport réutilise galerie.js tel quel.
 *   affiches-sport/*.svg  une affiche générée par rencontre (pas d'affiche
 *                         officielle côté clubs : on compose club / adversaire
 *                         aux couleurs du club).
 *   events-sport-firstseen.json  date de première apparition de chaque match,
 *                         pour le ruban « Nouveau » (même principe que la culture).
 */

const fs = require("fs");
const path = require("path");
const { SPORTS, byKey, norm } = require("./sport-clubs");

const DIR = __dirname;
const IN_AUTO = path.join(DIR, "events-sport.json");
const IN_MANUAL = path.join(DIR, "sport-manuel.json");
const FIRSTSEEN = path.join(DIR, "events-sport-firstseen.json");
const AFFICHES = path.join(DIR, "affiches-sport");
const OUT = path.join(DIR, "data-sport.js");

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const todayISO = new Date().toISOString().slice(0, 10);

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return fallback; }
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// ── Affiche générée ─────────────────────────────────────────────────────────
// Format 2/3 comme les affiches culture (800×1200), lisible en vignette comme
// en plein écran. Pas de police externe : piles système, rendues partout.

function shade(hex, pct) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v : 255 - v) * pct)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

// Coupe un nom d'adversaire trop long en deux lignes équilibrées.
function wrap(name, max) {
  const words = String(name || "").split(/\s+/).filter(Boolean);
  if (words.join(" ").length <= max) return [words.join(" ")];
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + " " + w).length <= max) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

// Taille de police qui tient dans la largeur utile (680 px) pour la ligne la
// plus longue. Facteur .62 : largeur moyenne d'une capitale en gras.
function fit(lines, max, min) {
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 1);
  return Math.max(min, Math.min(max, Math.floor(680 / (longest * 0.62))));
}


// Motif de fond propre au sport : à la taille d'une vignette, la forme se lit
// avant le texte et distingue le football du basket ou du volley d'un coup
// d'œil. Tracé très discret pour ne pas gêner la lecture du nom des équipes.
function motifSport(sport, accent) {
  // Un seul attribut par propriété : un stroke-width en double rendrait le SVG
  // invalide, et l'affiche ne s'afficherait pas du tout.
  const t = (d, w = 6) =>
    `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${w}" opacity=".13"/>`;
  if (sport === "foot") {
    // Rond central, ligne médiane et surface de réparation.
    return [
      t("M0 600 H800"),
      t("M400 460 a140 140 0 1 0 .1 0"),
      t("M170 1200 V1010 H630 V1200"),
      t("M300 1200 V1120 H500 V1200"),
      t("M400 1010 a95 95 0 0 1 0 0 M305 1010 a95 95 0 0 0 190 0"),
    ].join("\n  ");
  }
  if (sport === "basket") {
    // La raquette, le cercle de lancer franc et l'arc à trois points.
    return [
      t("M285 1200 V930 H515 V1200"),
      t("M400 930 a75 75 0 1 0 .1 0"),
      t("M90 1200 V1060 a310 310 0 0 1 620 0 V1200"),
      t("M330 1200 V1178 H470 V1200"),
    ].join("\n  ");
  }
  // Volley : le filet et ses deux antennes.
  const maille = [];
  for (let x = 60; x <= 740; x += 56) maille.push(`M${x} 520 V760`);
  for (let y = 520; y <= 760; y += 48) maille.push(`M60 ${y} H740`);
  return [
    t(maille.join(" "), 3),
    t("M60 500 V780 M740 500 V780", 10),
  ].join("\n  ");
}

function afficheSVG(club, m) {
  const [bg, accent] = club.colors;
  const dark = shade(bg, -0.3);
  const d = new Date(m.date + "T12:00:00");
  const dateTxt = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

  // Zone sûre verticale : la galerie superpose un ruban et une pastille de date
  // en haut, le titre de l'événement en bas. Tout le contenu de l'affiche tient
  // donc entre y=220 et y=1000.
  const clubTxt = club.short.toUpperCase();
  const clubSize = fit([clubTxt], 132, 64);
  const advLines = wrap(m.opponent, 18).map(l => l.toUpperCase());
  const advSize = fit(advLines, 104, 44);
  const advTop = advLines.length > 1 ? 700 : 726;

  const adv = advLines.map((l, i) =>
    `<text x="400" y="${advTop + i * (advSize + 14)}" text-anchor="middle" font-size="${advSize}" font-weight="800" fill="#ffffff">${esc(l)}</text>`
  ).join("\n    ");

  const lieu = `${m.place}, ${m.city}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" role="img" aria-label="${esc(club.short)} reçoit ${esc(m.opponent)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <!-- Voile sombre au centre : le motif de fond reste visible sur les bords,
         le nom des équipes garde son contraste. -->
    <radialGradient id="v" cx="50%" cy="52%" r="62%">
      <stop offset="0" stop-color="${dark}" stop-opacity=".72"/>
      <stop offset="1" stop-color="${dark}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="1200" fill="url(#g)"/>
  ${motifSport(club.sport, accent)}
  <path d="M0 1010 L800 890 L800 1200 L0 1200 Z" fill="${accent}" opacity=".14"/>
  <rect width="800" height="1200" fill="url(#v)"/>
  <g font-family="Inter, Helvetica Neue, Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="400" y="322" font-size="34" font-weight="600" fill="${accent}" letter-spacing="3">${esc((m.competition || club.league).toUpperCase())}</text>
    ${m.round ? `<text x="400" y="370" font-size="27" font-weight="500" fill="#ffffff" opacity=".65">${esc(m.round)}</text>` : ""}

    <text x="400" y="530" font-size="${clubSize}" font-weight="800" fill="#ffffff">${esc(clubTxt)}</text>
    <text x="400" y="612" font-size="36" font-weight="600" fill="${accent}" letter-spacing="8">REÇOIT</text>
    ${adv}

    <rect x="160" y="866" width="480" height="2" fill="#ffffff" opacity=".22"/>
    <text x="400" y="${m.time ? 932 : 920}" font-size="40" font-weight="700" fill="#ffffff">${esc(dateTxt)}${m.time ? " · " + esc(m.time) : ""}</text>
    ${m.time ? "" : `<text x="400" y="958" font-size="25" font-weight="600" fill="${accent}">horaire à confirmer</text>`}
    <text x="400" y="${m.time ? 978 : 996}" font-size="${fit([lieu], 27, 18)}" font-weight="500" fill="#ffffff" opacity=".7">${esc(lieu)}</text>
  </g>
</svg>
`;
}

// ── Construction des événements ─────────────────────────────────────────────

function toEvent(m, firstseen) {
  const club = byKey(m.club);
  if (!club) return null;
  const uuid = `sport-${m.id}`;
  const d = new Date(m.date + "T12:00:00");
  const dateText = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!firstseen[uuid]) firstseen[uuid] = todayISO;
  return {
    uuid,
    title: `${club.short} - ${m.opponent}`,
    category: club.sport,
    subcats: [club.name, m.opponent, m.competition || club.league].filter(Boolean),
    date: m.date,
    endDate: m.date,
    dateText: dateText.charAt(0).toUpperCase() + dateText.slice(1),
    schedule: m.time || "",
    place: m.place,
    city: m.city,
    free: false,
    reservation: Boolean(m.tickets),
    image: `affiches-sport/${uuid}.svg`,
    // Tant que l'horaire n'est pas annoncé, « Plus d'infos » renvoie vers le
    // calendrier officiel, qui se remplira ; une fois l'heure connue, vers la
    // billetterie, qui est ce que le visiteur cherche à ce moment-là.
    url: (m.time ? (m.tickets || m.url) : (m.calendar || m.url)) || club.site,
    addedAt: firstseen[uuid],
  };
}

function main() {
  const auto = readJSON(IN_AUTO, []);
  const manuel = readJSON(IN_MANUAL, []);
  const firstseen = readJSON(FIRSTSEEN, {});

  // Fusion : le manuel COMPLÈTE l'automatique au lieu de l'écraser en bloc.
  // Seuls les champs réellement renseignés à la main l'emportent, si bien
  // qu'une rencontre saisie sans horaire récupérera l'heure dès que la source
  // automatique la publiera. Une entrée manuelle est rattachée à une rencontre
  // automatique par l'adversaire d'abord (une équipe ne vient qu'une fois par
  // saison), par la date ensuite : un match reporté reste donc un seul match.
  const byIdent = new Map();
  const parAdversaire = new Map();
  for (const m of auto) {
    const k = `${m.club}|${m.date}`;
    byIdent.set(k, m);
    if (m.opponent) parAdversaire.set(`${m.club}|${norm(m.opponent)}`, k);
  }
  for (const m of manuel) {
    const kAdv = m.opponent ? parAdversaire.get(`${m.club}|${norm(m.opponent)}`) : null;
    const cle = kAdv || `${m.club}|${m.date}`;
    const base = byIdent.get(cle);
    if (!base) {
      byIdent.set(cle, { ...m, source: m.source || "saisie manuelle" });
      continue;
    }
    const fusion = { ...base };
    for (const [champ, valeur] of Object.entries(m)) {
      if (valeur !== "" && valeur !== null && valeur !== undefined) fusion[champ] = valeur;
    }
    fusion.source = `${base.source} + saisie manuelle`;
    byIdent.delete(cle);
    byIdent.set(`${fusion.club}|${fusion.date}`, fusion);
  }

  const matches = [...byIdent.values()]
    .filter(m => m.date && m.date >= todayISO && byKey(m.club))
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  fs.mkdirSync(AFFICHES, { recursive: true });
  const events = [];
  const gardees = new Set();
  for (const m of matches) {
    const ev = toEvent(m, firstseen);
    if (!ev) continue;
    const file = path.join(AFFICHES, `${ev.uuid}.svg`);
    fs.writeFileSync(file, afficheSVG(byKey(m.club), m));
    gardees.add(`${ev.uuid}.svg`);
    events.push(ev);
  }

  // Ménage : on supprime les affiches des matchs passés ou disparus.
  for (const f of fs.readdirSync(AFFICHES)) {
    if (f.endsWith(".svg") && !gardees.has(f)) fs.unlinkSync(path.join(AFFICHES, f));
  }

  // On ne garde dans firstseen que ce qui est encore à l'affiche.
  const fsClean = {};
  for (const ev of events) fsClean[ev.uuid] = firstseen[ev.uuid];
  fs.writeFileSync(FIRSTSEEN, JSON.stringify(fsClean, null, 2) + "\n");

  // Seuls les sports réellement présents deviennent des filtres.
  const used = {};
  for (const ev of events) if (SPORTS[ev.category]) used[ev.category] = SPORTS[ev.category];

  const header =
`// ⚠️ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
// Rencontres des clubs de haut niveau du Grand Nancy, à domicile uniquement.
// Sources : sites officiels des clubs et des ligues (voir sport-scrape.js).
// Régénérer : node sport-scrape.js && node update-sport.js
// Généré le : ${todayISO} — ${events.length} rencontre(s) à venir.

`;
  const body =
    "const CATEGORIES = " + JSON.stringify(used, null, 2) + ";\n\n" +
    `const GENERATED_AT = ${JSON.stringify(todayISO)};\n\n` +
    "const EVENTS = " + JSON.stringify(events, null, 2) + ";\n";

  fs.writeFileSync(OUT, header + body);

  const parClub = {};
  for (const m of matches) parClub[m.club] = (parClub[m.club] || 0) + 1;
  console.log(`data-sport.js écrit : ${events.length} rencontre(s)`);
  console.log("  par club :", Object.entries(parClub).map(([k, n]) => `${k}=${n}`).join("  ") || "(aucune)");
  console.log(`  affiches : ${gardees.size} fichier(s) dans affiches-sport/`);
}

main();
