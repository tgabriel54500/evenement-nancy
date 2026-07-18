#!/usr/bin/env node
/**
 * Récupère les vrais événements de la Ville de Nancy depuis l'agenda officiel
 * (API publique du Grand Nancy) et régénère `data.js`.
 *
 * Usage :  node update-events.js
 *
 * Source : https://agenda-integration.grandnancy.eu/api/vdn/events
 *   - entité "vdn" = Ville de Nancy (utilisée par https://www.nancy.fr/agenda)
 *   - l'API ne renvoie pas d'en-tête CORS, donc on ne peut pas l'appeler
 *     directement depuis le navigateur : ce script fait un instantané local.
 */

const fs = require("fs");
const path = require("path");
const { cleanupMerged } = require("./normalize");

const API = "https://agenda-integration.grandnancy.eu/api/vdn/events";
const DETAIL_URL = "https://www.nancy.fr/agenda/details-agenda?uuid=";

// mainCategory.code -> { key, label, emoji } pour notre site.
const CATEGORY_MAP = {
  "6399da840d9ab": { key: "activite",          label: "Activités & ateliers",     emoji: "🎨" },
  "musiques-actuelles":                                                                          // fallback par nom (voir resolveCategory)
    { key: "musiques-actuelles", label: "Musiques actuelles", emoji: "🎸" },
};

// Résolution robuste par NOM (les codes peuvent changer), avec repli.
function resolveCategory(mainCategory) {
  const name = (mainCategory && mainCategory.name) || "Autre";
  const table = {
    "Activité - Animation":      { key: "activite",           label: "Activités & ateliers",     emoji: "🎨" },
    "Musiques actuelles":        { key: "musiques-actuelles", label: "Musiques actuelles",       emoji: "🎸" },
    "Jeune public":              { key: "jeune-public",       label: "Jeune public",             emoji: "🧸" },
    "Spectacle":                 { key: "spectacle",          label: "Spectacles",               emoji: "🎭" },
    "Exposition":                { key: "exposition",         label: "Expositions",              emoji: "🖼️" },
    "Musique classique":         { key: "musique-classique",  label: "Musique classique",        emoji: "🎻" },
    "Manifestation - Festival":  { key: "festival",           label: "Festivals",                emoji: "🎪" },
    "Conférence - Rencontre":    { key: "conference",         label: "Conférences & rencontres", emoji: "🎓" },
    "Citoyenneté":               { key: "citoyennete",        label: "Citoyenneté",              emoji: "🤝" },
  };
  return table[name] || { key: "autre", label: name, emoji: "📌" };
}

function httpsPrefix(u) {
  if (!u) return null;
  return u.startsWith("http") ? u : "https://" + u;
}

function pickImage(mediaUrl) {
  if (!mediaUrl) return null;
  const c = mediaUrl.crop || {};
  const o = mediaUrl.originale || {};
  // Tous les événements n'ont pas de version recadrée : on retombe sur l'originale.
  return httpsPrefix(c.medium || c.large || c.small || o.medium || o.large || o.small);
}

// startDate/endDate font foi pour le tri (le dateList de la source contient
// parfois une date erronée). On clampe les événements en cours à aujourd'hui
// pour qu'ils remontent dans la liste. Le dateList ne sert qu'à enrichir
// l'horaire, et seulement si l'une de ses dates correspond à la période réelle.
function pickWhen(ev, todayISO) {
  const start = (ev.startDate || "").slice(0, 10);
  const end = (ev.endDate || ev.startDate || "").slice(0, 10);
  const sortDate = start >= todayISO ? start : (end >= todayISO ? todayISO : start);

  const list = Array.isArray(ev.dateList) ? ev.dateList.filter(d => d.date && d.schedule) : [];
  // Horaire fiable : une occurrence dans [start, end] et à venir si possible.
  const inRange = list.filter(d => d.date >= start && d.date <= end);
  const upcoming = inRange.filter(d => d.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date));
  const chosen = upcoming[0] || inRange[0];
  return { sortDate, schedule: chosen ? cleanSchedule(chosen.schedule) : "" };
}

// Nettoie les horaires bruts ("de 15h00 à 18h00", "19h", parfois avec un ';').
function cleanSchedule(s) {
  return String(s || "").replace(/;+\s*$/, "").trim();
}

// ── Filtre géographique : on écarte tout événement à plus de 30 km de Nancy ──
// Les villes sont géocodées via la Base Adresse Nationale (gratuite, sans clé),
// UNE seule requête par ville inconnue : le résultat est mis en cache dans
// commune-coords.json (commité). Ville vide, introuvable ou API injoignable →
// on GARDE l'événement (bénéfice du doute, jamais de casse si le réseau tombe).
const NANCY_COORDS = { lat: 48.6921, lon: 6.1844 };
const MAX_KM = 30;
const COORDS_PATH = path.join(__dirname, "commune-coords.json");

function haversineKm(a, b) {
  const R = 6371, rad = (x) => x * Math.PI / 180;
  const s = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const normCityKey = (s) => String(s || "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function geocodeCity(name) {
  // Biais lat/lon : en cas d'homonymie (Essey, Champigneulles…), la BAN
  // privilégie la commune proche de Nancy → filtre conservateur.
  const url = "https://api-adresse.data.gouv.fr/search/?type=municipality&limit=1" +
    `&lat=${NANCY_COORDS.lat}&lon=${NANCY_COORDS.lon}&q=` + encodeURIComponent(name);
  const r = await fetch(url);
  if (!r.ok) return null;
  const f = ((await r.json()).features || [])[0];
  if (!f || !f.geometry) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, city: (f.properties && f.properties.city) || name };
}

async function filterByDistance(events) {
  let cache = {};
  if (fs.existsSync(COORDS_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(COORDS_PATH, "utf8")) || {}; } catch (_) { cache = {}; }
  }
  const unknown = [...new Set(events.map(e => normCityKey(e.city)).filter(k => k && !(k in cache)))];
  for (const key of unknown) {
    try {
      cache[key] = await geocodeCity(key.replace(/-/g, " "));   // null (mémorisé) si introuvable
      await new Promise(res => setTimeout(res, 80));            // politesse API
    } catch (_) { /* réseau KO : clé non cachée → événement gardé */ }
  }
  try { fs.writeFileSync(COORDS_PATH, JSON.stringify(cache, null, 1), "utf8"); } catch (_) {}
  const kept = [], byCity = {};
  for (const e of events) {
    const c = cache[normCityKey(e.city)];
    if (c && haversineKm(NANCY_COORDS, c) > MAX_KM) byCity[e.city] = (byCity[e.city] || 0) + 1;
    else kept.push(e);
  }
  const nDropped = events.length - kept.length;
  if (nDropped) console.log(`  📍 ${nDropped} événement(s) à plus de ${MAX_KM} km de Nancy écartés : ` +
    Object.entries(byCity).map(([c, n]) => `${c} (${n})`).join(", "));
  return kept;
}

async function main() {
  console.log("→ Récupération de l'agenda officiel de Nancy…");
  const res = await fetch(API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("API HTTP " + res.status);
  const raw = await res.json();
  console.log(`  ${raw.length} événements reçus.`);

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  const events = raw
    .map(ev => {
      const cat = resolveCategory(ev.mainCategory);
      const when = pickWhen(ev, todayISO);
      const place = ev.place || {};
      const city = (place.city && place.city.name) || "";
      const subcats = (ev.subCategories || []).map(s => s.name).filter(Boolean);
      const lastDate = (ev.endDate || ev.startDate || "").slice(0, 10);
      return {
        uuid: ev.uuid,
        title: ev.name,
        category: cat.key,
        catLabel: cat.label,
        catEmoji: cat.emoji,
        subcats,
        date: when.sortDate,
        endDate: lastDate,
        dateText: ev.beforeDateText || ev.duringDateText || "",
        schedule: when.schedule,
        place: place.name || "",
        city,
        free: !!ev.free,
        reservation: !!ev.reservation,
        image: pickImage(ev.mediaUrl),
        url: DETAIL_URL + ev.uuid,
      };
    })
    // On garde les événements à venir ou en cours.
    .filter(e => e.endDate >= todayISO || e.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 2e source : Destination Nancy (office de tourisme / SIT), collectée à part
  // dans events-destination-nancy.json (même schéma + champ source). Optionnelle.
  const dnPath = path.join(__dirname, "events-destination-nancy.json");
  let dnEvents = [];
  if (fs.existsSync(dnPath)) {
    try {
      dnEvents = JSON.parse(fs.readFileSync(dnPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${dnEvents.length} événements Destination Nancy fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-destination-nancy.json illisible, ignoré :", e.message);
    }
  }
  // 3e source : Nancy Curieux (agenda culturel/associatif), collectée à part
  // dans events-curieux-net.json (même schéma + champ source). Optionnelle.
  const cxPath = path.join(__dirname, "events-curieux-net.json");
  let cxEvents = [];
  if (fs.existsSync(cxPath)) {
    try {
      cxEvents = JSON.parse(fs.readFileSync(cxPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${cxEvents.length} événements Nancy Curieux fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-curieux-net.json illisible, ignoré :", e.message);
    }
  }
  // 4e source : Ville de Vandœuvre-lès-Nancy (agenda municipal WordPress),
  // collectée à part dans events-vandoeuvre.json (même schéma + champ source).
  // Optionnelle. Régénérer : node vandoeuvre.js
  const vdvPath = path.join(__dirname, "events-vandoeuvre.json");
  let vdvEvents = [];
  if (fs.existsSync(vdvPath)) {
    try {
      vdvEvents = JSON.parse(fs.readFileSync(vdvPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${vdvEvents.length} événements Vandœuvre fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-vandoeuvre.json illisible, ignoré :", e.message);
    }
  }
  // 5e source : Ville de Villers-lès-Nancy (agenda municipal TYPO3), collectée à
  // part dans events-villers-les-nancy.json (même schéma + champ source).
  // Optionnelle. Régénérer : node villers-les-nancy.js
  const vlnPath = path.join(__dirname, "events-villers-les-nancy.json");
  let vlnEvents = [];
  if (fs.existsSync(vlnPath)) {
    try {
      vlnEvents = JSON.parse(fs.readFileSync(vlnPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${vlnEvents.length} événements Villers-lès-Nancy fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-villers-les-nancy.json illisible, ignoré :", e.message);
    }
  }
  // 6e source : Alentoor (alentoor.fr), collectée à part dans events-alentoor.json
  // (même schéma + champ source). Couvre Nancy + métropole + l'anneau 20–30 km
  // (Toul, Pont-à-Mousson, Lunéville, Saint-Nicolas-de-Port). Optionnelle.
  // Régénérer : node alentoor.js
  const alPath = path.join(__dirname, "events-alentoor.json");
  let alEvents = [];
  if (fs.existsSync(alPath)) {
    try {
      alEvents = JSON.parse(fs.readFileSync(alPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${alEvents.length} événements Alentoor fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-alentoor.json illisible, ignoré :", e.message);
    }
  }
  // 7e source : ICI-C-NANCY.FR (agenda du média local, Joomla/iCagenda), collectée
  // à part dans events-ici-c-nancy.json (même schéma + champ source). Couvre Nancy
  // + Lorraine. Optionnelle. Régénérer : node ici-c-nancy.js
  const icnPath = path.join(__dirname, "events-ici-c-nancy.json");
  let icnEvents = [];
  if (fs.existsSync(icnPath)) {
    try {
      icnEvents = JSON.parse(fs.readFileSync(icnPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${icnEvents.length} événements ICI-C-NANCY fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-ici-c-nancy.json illisible, ignoré :", e.message);
    }
  }
  // 8e source : Zénith de Nancy (grande salle, concerts/spectacles), collectée à
  // part dans events-zenith-nancy.json (même schéma + champ source).
  // Optionnelle. Régénérer : node zenith-nancy.js
  const zenPath = path.join(__dirname, "events-zenith-nancy.json");
  let zenEvents = [];
  if (fs.existsSync(zenPath)) {
    try {
      zenEvents = JSON.parse(fs.readFileSync(zenPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${zenEvents.length} événements Zénith de Nancy fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-zenith-nancy.json illisible, ignoré :", e.message);
    }
  }
  // 9e source : Est Républicain « Pour sortir » via IMPORT MANUEL iCal. Le portail
  // déclare une réserve anti-fouille (tdm-reservation:1) → on ne le scrape PAS ;
  // l'utilisateur exporte les fiches à la main (bouton iCal) et `import-ics.js` les
  // convertit dans events-est-republicain.json (même schéma + champ source).
  // Optionnelle. Régénérer : node import-ics.js (dossier ics-est-republicain/).
  const erPath = path.join(__dirname, "events-est-republicain.json");
  let erEvents = [];
  if (fs.existsSync(erPath)) {
    try {
      erEvents = JSON.parse(fs.readFileSync(erPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${erEvents.length} événements Est Républicain (import iCal) fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-est-republicain.json illisible, ignoré :", e.message);
    }
  }
  // 10e source : LorraineAUcoeur (portail régional, FILTRÉ zone Nancy), collectée
  // à part dans events-lorraineaucoeur.json (même schéma + champ source).
  // Optionnelle. Régénérer : node lorraineaucoeur.js
  const lacPath = path.join(__dirname, "events-lorraineaucoeur.json");
  let lacEvents = [];
  if (fs.existsSync(lacPath)) {
    try {
      lacEvents = JSON.parse(fs.readFileSync(lacPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${lacEvents.length} événements LorraineAUcoeur fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-lorraineaucoeur.json illisible, ignoré :", e.message);
    }
  }
  // 11e source : Salle / Galerie Poirel (équipement culturel municipal de Nancy),
  // collectée à part dans events-poirel.json (même schéma + champ source). Même
  // socle API Grand Nancy que la Ville (entité `sgp`). Régénérer : node poirel.js
  const poPath = path.join(__dirname, "events-poirel.json");
  let poEvents = [];
  if (fs.existsSync(poPath)) {
    try {
      poEvents = JSON.parse(fs.readFileSync(poPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${poEvents.length} événements Salle Poirel fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-poirel.json illisible, ignoré :", e.message);
    }
  }
  // 12e source : L'Autre Canal (SMAC — musiques actuelles), collectée à part dans
  // events-autre-canal.json (même schéma + champ source). free/reservation déjà
  // fiables (classe term-gratuit + billetterie) → EXCLUE de enrich-pricing.js.
  // Optionnelle. Régénérer : node autre-canal.js
  const acnPath = path.join(__dirname, "events-autre-canal.json");
  let acnEvents = [];
  if (fs.existsSync(acnPath)) {
    try {
      acnEvents = JSON.parse(fs.readFileSync(acnPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${acnEvents.length} événements L'Autre Canal fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-autre-canal.json illisible, ignoré :", e.message);
    }
  }
  // 13e source : événements Facebook « Intéressé·e/Je participe », import MANUEL
  // (Facebook a supprimé l'export iCal). L'utilisateur enregistre la page
  // facebook.com/events affichée, `node facebook.js` la convertit en
  // events-facebook.json (même schéma + champ source). Optionnelle.
  const fbPath = path.join(__dirname, "events-facebook.json");
  let fbEvents = [];
  if (fs.existsSync(fbPath)) {
    try {
      fbEvents = JSON.parse(fs.readFileSync(fbPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${fbEvents.length} événements Facebook fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-facebook.json illisible, ignoré :", e.message);
    }
  }
  // 15e source : Ville d'Essey-lès-Nancy (agenda municipal Drupal/Stratis),
  // collectée à part dans events-essey.json (même schéma + champ source).
  // Optionnelle. Régénérer : node essey.js
  const esPath = path.join(__dirname, "events-essey.json");
  let esEvents = [];
  if (fs.existsSync(esPath)) {
    try {
      esEvents = JSON.parse(fs.readFileSync(esPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${esEvents.length} événements Essey-lès-Nancy fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-essey.json illisible, ignoré :", e.message);
    }
  }
  // 16e source : Ville de Laxou (agenda municipal CMS Flexit), collectée à part
  // dans events-laxou.json (même schéma + champ source). Optionnelle.
  // Régénérer : node laxou.js
  const laxPath = path.join(__dirname, "events-laxou.json");
  let laxEvents = [];
  if (fs.existsSync(laxPath)) {
    try {
      laxEvents = JSON.parse(fs.readFileSync(laxPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${laxEvents.length} événements Laxou fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-laxou.json illisible, ignoré :", e.message);
    }
  }
  // 17e source : Ville de Ludres (WordPress + JetEngine), collectée à part dans
  // events-ludres.json (même schéma + champ source). Dates lues dans la page liste
  // (jour/mois), titre/image/catégorie via REST. Optionnelle. Régénérer : node ludres.js
  const ludPath = path.join(__dirname, "events-ludres.json");
  let ludEvents = [];
  if (fs.existsSync(ludPath)) {
    try {
      ludEvents = JSON.parse(fs.readFileSync(ludPath, "utf8"))
        .filter(e => e && (e.endDate >= todayISO || e.date >= todayISO));
      console.log(`  + ${ludEvents.length} événements Ludres fusionnés.`);
    } catch (e) {
      console.warn("  ⚠ events-ludres.json illisible, ignoré :", e.message);
    }
  }
  const rawMerged = [...events, ...dnEvents, ...cxEvents, ...vdvEvents, ...vlnEvents, ...alEvents, ...icnEvents, ...zenEvents, ...erEvents, ...lacEvents, ...poEvents, ...acnEvents, ...fbEvents, ...esEvents, ...laxEvents, ...ludEvents];

  // Nettoyage commun (cf. normalize.js) : normalisation des communes, remappage
  // des catégories parasites, et dédoublonnage du MÊME événement listé par
  // plusieurs sources (titre + chevauchement de dates + lieu compatible).
  const deduped = cleanupMerged(rawMerged);
  const removed = rawMerged.length - deduped.length;
  if (removed > 0) console.log(`  ⤷ ${removed} doublons inter-sources fusionnés (${deduped.length} événements uniques).`);

  // Filtre géographique : rien au-delà de 30 km de Nancy (cf. filterByDistance).
  const merged = await filterByDistance(deduped);

  // ── Suivi des NOUVEAUTÉS : date de première apparition de chaque événement ──
  // On mémorise dans events-firstseen.json { uuid -> date ISO } la première fois
  // qu'un événement est vu. Un événement déjà connu garde sa date ; un nouvel
  // ajout sur une source reçoit la date du jour.
  // ⚠️ CLÉ = `uuid` (identifiant STABLE de la source), surtout PAS `titre|date` :
  // le champ `date` est recalé sur « aujourd'hui » pour les événements EN COURS
  // (expos…), donc il change chaque jour → un événement déjà présent serait vu
  // comme « nouveau » chaque jour. L'uuid, lui, ne bouge pas tant que la source
  // garde l'événement. Au TOUT PREMIER remplissage, on PRÉ-DATE l'existant à J-45
  // pour ne pas afficher les ~1300 événements comme « nouveaux » le jour 1 : la
  // page Nouveautés démarre vide et se remplit avec les vrais ajouts dès demain.
  const fsPath = path.join(__dirname, "events-firstseen.json");
  const fsKey = (e) => e.uuid || (String(e.title || "").trim().toLowerCase().replace(/\s+/g, " ") + "|" + (e.date || ""));
  const daysAgoISO = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  let firstSeen = {};
  let fsExisting = false;
  if (fs.existsSync(fsPath)) {
    try {
      firstSeen = JSON.parse(fs.readFileSync(fsPath, "utf8")) || {};
      fsExisting = Object.keys(firstSeen).length > 0;
    } catch (e) {
      console.warn("  ⚠ events-firstseen.json illisible, réinitialisé :", e.message);
      firstSeen = {};
    }
  }
  const seedISO = daysAgoISO(45);
  let nNew = 0;
  for (const e of merged) {
    const k = fsKey(e);
    if (!firstSeen[k]) { firstSeen[k] = fsExisting ? todayISO : seedISO; if (fsExisting) nNew++; }
    e.addedAt = firstSeen[k];
  }
  // Purge : on ne garde que les clés encore présentes OU vues il y a moins de 60 j
  // (un événement qui disparaît puis revient n'est pas reclassé « nouveau » aussitôt).
  const liveKeys = new Set(merged.map(fsKey));
  const cutoff = daysAgoISO(60);
  for (const k of Object.keys(firstSeen)) {
    if (!liveKeys.has(k) && firstSeen[k] < cutoff) delete firstSeen[k];
  }
  fs.writeFileSync(fsPath, JSON.stringify(firstSeen), "utf8");
  console.log(fsExisting
    ? `  🆕 ${nNew} nouvel(le)s événement(s) depuis le dernier passage.`
    : `  🆕 suivi des nouveautés initialisé (${Object.keys(firstSeen).length} événements pré-datés à J-45).`);

  // Overlay tarif/réservation revérifié à la source (events-pricing.json, produit
  // par `node enrich-pricing.js`). La Ville de Nancy garde ses valeurs d'API
  // (fiables) ; pour les autres sources on n'écrase QUE ce qui a pu être
  // déterminé avec certitude (free=gratuit/payant, reservation=inscription requise).
  const pricingPath = path.join(__dirname, "events-pricing.json");
  if (fs.existsSync(pricingPath)) {
    try {
      const pricing = JSON.parse(fs.readFileSync(pricingPath, "utf8"));
      let nf = 0, nr = 0;
      for (const e of merged) {
        const p = pricing[e.uuid];
        if (!p) continue;
        if (typeof p.free === "boolean") { e.free = p.free; nf++; }
        if (typeof p.reservation === "boolean") { e.reservation = p.reservation; nr++; }
      }
      console.log(`  ⓘ overlay tarif/réservation appliqué : ${nf} tarifs + ${nr} réservations fiabilisés.`);
    } catch (e) {
      console.warn("  ⚠ events-pricing.json illisible, ignoré :", e.message);
    }
  }

  // Catégories réellement présentes, dans un ordre lisible. Les thèmes propres à
  // Vandœuvre (culture, famille, sport…) suivent les types d'événement de Nancy.
  const order = ["festival", "musiques-actuelles", "musique-classique", "spectacle",
    "exposition", "jeune-public", "activite", "conference", "citoyennete",
    "culture", "famille", "jeunesse", "sport", "nature", "sante", "seniors",
    "social", "mobilite", "economie", "autre"];
  const cats = {};
  for (const e of merged) {
    if (!cats[e.category]) cats[e.category] = { label: e.catLabel, emoji: e.catEmoji };
  }
  const orderedCats = {};
  for (const k of order) if (cats[k]) orderedCats[k] = cats[k];
  for (const k of Object.keys(cats)) if (!orderedCats[k]) orderedCats[k] = cats[k];

  // Allège : on retire les champs de service redondants des cartes.
  const slim = merged.map(({ catLabel, catEmoji, ...rest }) => rest);

  const header =
`// ⚠️ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
// Source : agenda officiel de la Ville de Nancy (https://www.nancy.fr/agenda)
// API    : ${API}
// Régénérer : node update-events.js
// Généré le : ${todayISO} — ${slim.length} événements à venir.
`;
  const body =
`const CATEGORIES = ${JSON.stringify(orderedCats, null, 2)};

const GENERATED_AT = ${JSON.stringify(todayISO)};

const EVENTS = ${JSON.stringify(slim, null, 2)};
`;

  fs.writeFileSync(path.join(__dirname, "data.js"), header + "\n" + body, "utf8");
  console.log(`✓ data.js régénéré : ${slim.length} événements, ${Object.keys(orderedCats).length} catégories.`);
}

main().catch(err => {
  console.error("✗ Échec :", err.message);
  process.exit(1);
});
