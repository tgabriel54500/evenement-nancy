#!/usr/bin/env node
/**
 * Importateur de fichiers iCalendar (.ics) → schéma EVENTS du projet.
 *
 * Pourquoi ce fichier existe :
 *   L'agenda « Pour sortir » de l'Est Républicain (et d'autres sites) déclare une
 *   réserve d'opposition à la fouille de données (en-tête `tdm-reservation: 1`) :
 *   on ne le scrape donc PAS automatiquement. En revanche, chaque fiche propose
 *   un export iCal (« Ajouter à mon agenda ») que l'utilisateur télécharge À LA
 *   MAIN. Ce script ne fait que CONVERTIR ces fichiers .ics déjà exportés vers le
 *   schéma commun — aucune requête réseau, aucune extraction automatisée.
 *
 * Flux d'utilisation :
 *   1. Sur https://www.estrepublicain.fr/pour-sortir/ , parcourir par catégorie,
 *      ouvrir les événements Nancy / Meurthe-et-Moselle voulus, cliquer « iCal ».
 *   2. Déposer les .ics téléchargés dans un dossier (défaut ./ics-est-republicain).
 *   3. node import-ics.js  →  écrit events-est-republicain.json (schéma EVENTS).
 *   4. node update-events.js  →  fusionne dans data.js avec les autres sources.
 *
 * Usage :
 *   node import-ics.js
 *   node import-ics.js --dir=ics-est-republicain --source=est-republicain --prefix=er
 *   node import-ics.js --dir=mon-dossier --out=events-est-republicain.json
 *
 * Accepte aussi un dossier OU des fichiers .ics passés en arguments positionnels.
 */

const fs = require("fs");
const path = require("path");

// ── Catégories (devinées au titre, alignées sur les autres sources) ─────────
const CATEGORY_BY_PREFIX = [
  [/(expo|peinture|sculpture|photographie)/i,                              { key: "exposition",        label: "Expositions",              emoji: "🖼️" }],
  [/(classique|récital|recital|opéra|opera|lyrique|symphoni|philharmoni|chant choral)/i, { key: "musique-classique", label: "Musique classique", emoji: "🎻" }],
  [/(concert|musique|rock|jazz|blues|rap|pop|électro|electro|metal|chanson|variété|variete)/i, { key: "musiques-actuelles", label: "Musiques actuelles", emoji: "🎸" }],
  [/(festival|fête|fete|carnaval|kermesse|foire|salon|brocante|vide.?grenier|marché|marche)/i, { key: "festival", label: "Festivals", emoji: "🎪" }],
  [/(spectacle|théâtre|theatre|danse|cirque|humour|one man|stand.?up|cabaret)/i, { key: "spectacle", label: "Spectacles", emoji: "🎭" }],
  [/(cinéma|cinema|projection|film|court.?métrage|court.?metrage)/i,        { key: "conference",        label: "Conférences & rencontres", emoji: "🎓" }],
  [/(conférence|conference|rencontre|colloque|table ronde|débat|debat)/i,   { key: "conference",        label: "Conférences & rencontres", emoji: "🎓" }],
  [/(visite|balade|randonnée|randonnee|parcours|circuit|atelier|stage|initiation|découverte|decouverte)/i, { key: "activite", label: "Activités & ateliers", emoji: "🎨" }],
  [/(bal|repas|thé dansant|the dansant|banquet|soirée|soiree)/i,           { key: "festival",          label: "Festivals",                emoji: "🎪" }],
];

function resolveCategory(text) {
  const t = (text || "").trim();
  for (const [re, cat] of CATEGORY_BY_PREFIX) if (re.test(t)) return cat;
  return { key: "autre", label: "Autre", emoji: "📌" };
}

// ── Parsing iCalendar (RFC 5545) ────────────────────────────────────────────

// Déplie les lignes repliées : une ligne de continuation commence par un espace
// ou une tabulation et se rattache à la précédente.
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
}

// Déséchappe les valeurs texte iCal : \n \, \; \\ etc.
function unescapeText(v) {
  return String(v || "")
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// "20260611" ou "20260611T200000Z" / "...T200000" -> { date:"2026-06-11", time:"20:00" }
function parseDt(raw) {
  if (!raw) return { date: "", time: "" };
  const m = String(raw).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return { date: "", time: "" };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = m[4] ? `${m[4]}:${m[5]}` : "";
  return { date, time };
}

function hhmm(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

// Extrait les VEVENT d'un texte .ics et renvoie une map propriété->valeur (brute).
function parseVEvents(icsText) {
  const text = unfold(icsText);
  const events = [];
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m;
  while ((m = re.exec(text))) {
    const props = {};
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const left = line.slice(0, idx);       // ex: DTSTART;VALUE=DATE
      const value = line.slice(idx + 1);
      const name = left.split(";")[0].toUpperCase();
      if (!name) continue;
      // On garde la première occurrence significative.
      if (props[name] === undefined) props[name] = value;
    }
    events.push(props);
  }
  return events;
}

// VEVENT brut -> objet au schéma EVENTS du projet.
function toEvent(props, { prefix, source }, todayISO) {
  const title = unescapeText(props.SUMMARY);
  if (!title) return null;
  const start = parseDt(props.DTSTART);
  if (!start.date) return null;
  const end = parseDt(props.DTEND || props.DTSTART);
  const cat = resolveCategory(`${title} ${unescapeText(props.CATEGORIES) || ""}`);

  const location = unescapeText(props.LOCATION);
  // LOCATION iCal = souvent "Lieu, Adresse, Ville" -> on isole lieu / ville.
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  const place = parts[0] || "";
  const city = (parts.length > 1 ? parts[parts.length - 1] : "").replace(/^\d{5}\s*/, "");

  const startDate = start.date;
  const endDate = end.date && end.date >= startDate ? end.date : startDate;
  const sortDate = startDate < todayISO && endDate >= todayISO ? todayISO : startDate;

  // UID stable -> uuid déterministe (pas de doublon à chaque réimport).
  const rawUid = (props.UID || `${title}-${startDate}`).replace(/[^A-Za-z0-9]+/g, "").slice(0, 40);

  return {
    uuid: `${prefix}-${rawUid}`,
    title,
    category: cat.key,
    catLabel: cat.label,
    catEmoji: cat.emoji,
    subcats: [],
    date: sortDate,
    endDate,
    dateText: "",
    schedule: hhmm(start.time) + (end.time && end.time !== start.time ? `–${hhmm(end.time)}` : ""),
    place,
    city,
    free: false,
    reservation: false,
    image: null,
    url: unescapeText(props.URL) || "",
    source,
  };
}

// ── Collecte des fichiers .ics ──────────────────────────────────────────────
function gatherIcsFiles(inputs, dir) {
  const files = [];
  const add = (p) => {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(p)) if (/\.ics$/i.test(f)) files.push(path.join(p, f));
    } else if (/\.ics$/i.test(p)) {
      files.push(p);
    }
  };
  if (inputs.length) inputs.forEach(add);
  else add(dir);
  return [...new Set(files)];
}

// ── CLI ─────────────────────────────────────────────────────────────────────
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
  const dir = a.dir || path.join(__dirname, "ics-est-republicain");
  const source = a.source || "est-republicain";
  const prefix = a.prefix || "er";
  const out = a.out || path.join(__dirname, `events-${source}.json`);

  const files = gatherIcsFiles(a._, dir);
  if (!files.length) {
    console.error(`✗ Aucun .ics trouvé. Dépose tes exports iCal dans « ${path.relative(__dirname, dir) || dir} »`);
    console.error(`  (ou : node import-ics.js fichier1.ics fichier2.ics …)`);
    process.exit(1);
  }
  const todayISO = new Date().toISOString().slice(0, 10);

  const all = [];
  for (const f of files) {
    let raw;
    try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const props of parseVEvents(raw)) {
      const ev = toEvent(props, { prefix, source }, todayISO);
      if (ev) all.push(ev);
    }
  }

  // Déduplication par uuid, tri chronologique.
  const byId = new Map();
  for (const e of all) if (!byId.has(e.uuid)) byId.set(e.uuid, e);
  const list = [...byId.values()].sort((x, y) => x.date.localeCompare(y.date));

  fs.writeFileSync(out, JSON.stringify(list, null, 2), "utf8");
  console.log(`✓ ${files.length} fichier(s) .ics → ${list.length} événement(s) → ${path.relative(__dirname, out) || out}`);
  console.log(`  Puis : node update-events.js  (fusionne dans data.js)`);
}

if (require.main === module) main();

module.exports = { parseVEvents, toEvent, resolveCategory };
