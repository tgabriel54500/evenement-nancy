/**
 * Nettoyage des données fusionnées, partagé par update-events.js (statique) et
 * server.js (live) pour que les deux restent cohérents. Trois opérations :
 *
 *   1. cleanCity(raw)        — normalise les noms de commune (casse/accents/tirets)
 *                              ex. "NANCY" et "Nancy" → "Nancy" ; "VANDOEUVRE LES
 *                              NANCY" → "Vandœuvre-lès-Nancy". Indispensable pour
 *                              tout filtre/regroupement géographique.
 *   2. remapCategory(ev)     — replie les thèmes éditoriaux parasites (culture,
 *                              famille, sport, nature…) hérités des agendas
 *                              communaux sur le jeu de catégories canonique.
 *   3. dedupeCrossSource(ev) — fusionne le MÊME événement listé par plusieurs
 *                              sources (titre normalisé + chevauchement de dates +
 *                              lieu compatible), en gardant la fiche la plus riche.
 *
 * On ne touche PAS aux snapshots events-*.json (lecture seule) : tout se fait à la
 * fusion, sur le tableau en mémoire.
 */

// ── Helpers accents/clés ────────────────────────────────────────────────────
const stripAccents = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// Clé canonique d'un libellé (commune ou lieu) : minuscules, sans accents, œ→oe,
// ponctuation/espaces réduits. Sert de clé de comparaison, pas d'affichage.
function slugKey(raw) {
  return stripAccents(String(raw || "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae"))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ── 1. Normalisation des communes ───────────────────────────────────────────
// Table des communes du Grand Nancy + anneau 20–30 km (clé slugKey → affichage).
// Couvre les variantes vues dans les sources (majuscules, sans accents/tirets).
const CITY_CANON = {
  "nancy": "Nancy",
  "nancy cedex": "Nancy",
  "vandoeuvre les nancy": "Vandœuvre-lès-Nancy",
  "vandoeuvre": "Vandœuvre-lès-Nancy",
  "villers les nancy": "Villers-lès-Nancy",
  "villers": "Villers-lès-Nancy",
  "laxou": "Laxou",
  "maxeville": "Maxéville",
  "saint max": "Saint-Max",
  "st max": "Saint-Max",
  "malzeville": "Malzéville",
  "tomblaine": "Tomblaine",
  "jarville la malgrange": "Jarville-la-Malgrange",
  "jarville": "Jarville-la-Malgrange",
  "essey les nancy": "Essey-lès-Nancy",
  "heillecourt": "Heillecourt",
  "houdemont": "Houdemont",
  "ludres": "Ludres",
  "fleville devant nancy": "Fléville-devant-Nancy",
  "seichamps": "Seichamps",
  "pulnoy": "Pulnoy",
  "dommartemont": "Dommartemont",
  "art sur meurthe": "Art-sur-Meurthe",
  "saulxures les nancy": "Saulxures-lès-Nancy",
  "champigneulles": "Champigneulles",
  "toul": "Toul",
  "pont a mousson": "Pont-à-Mousson",
  "luneville": "Lunéville",
  "liverdun": "Liverdun",
  "bayon": "Bayon",
  "saint nicolas de port": "Saint-Nicolas-de-Port",
  "st nicolas de port": "Saint-Nicolas-de-Port",
  "dombasle sur meurthe": "Dombasle-sur-Meurthe",
  "dombasle": "Dombasle-sur-Meurthe",
  "frouard": "Frouard",
  "pompey": "Pompey",
  "neuves maisons": "Neuves-Maisons",
  "vezelise": "Vézelise",
  "haroue": "Haroué",
};

// Particules françaises laissées en minuscules dans le repli de mise en forme.
const PARTICLES = new Set(["les", "la", "le", "sur", "sous", "aux", "au", "de", "des", "du", "en", "et", "d", "l", "lez"]);

// Repli quand la commune n'est pas dans la table : mise en forme « titre » qui
// garde les particules en minuscules. Ne restaure pas les accents manquants
// (les communes fréquentes sont toutes dans CITY_CANON, donc accentuées).
function titleCaseCity(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, " ")
    .replace(/[a-zà-ÿ0-9]+/g, (w) => (PARTICLES.has(stripAccents(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
}

function cleanCity(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return CITY_CANON[slugKey(s)] || titleCaseCity(s);
}

// ── 2. Remappage des catégories ─────────────────────────────────────────────
// Jeu canonique (clé → libellé/emoji) ; on s'aligne sur la source Ville de Nancy.
const CANON_CAT = {
  festival: { label: "Festivals", emoji: "🎪" },
  "musiques-actuelles": { label: "Musiques actuelles", emoji: "🎸" },
  "musique-classique": { label: "Musique classique", emoji: "🎻" },
  spectacle: { label: "Spectacles", emoji: "🎭" },
  exposition: { label: "Expositions", emoji: "🖼️" },
  "jeune-public": { label: "Jeune public", emoji: "🧸" },
  activite: { label: "Activités & ateliers", emoji: "🎨" },
  conference: { label: "Conférences & rencontres", emoji: "🎓" },
  citoyennete: { label: "Citoyenneté", emoji: "🤝" },
  autre: { label: "Autre", emoji: "📌" },
};
// Thèmes éditoriaux parasites (Villers/Vandœuvre…) → catégorie canonique.
const CATEGORY_REMAP = {
  culture: "autre",
  famille: "jeune-public",
  jeunesse: "jeune-public",
  sport: "activite",
  nature: "activite",
  sante: "autre",
  seniors: "autre",
  social: "citoyennete",
  mobilite: "autre",
  economie: "autre",
};

function remapCategory(ev) {
  const target = CATEGORY_REMAP[ev.category];
  if (!target) return ev; // déjà canonique
  const c = CANON_CAT[target];
  return { ...ev, category: target, catLabel: c.label, catEmoji: c.emoji };
}

// ── 3. Dédoublonnage inter-sources ──────────────────────────────────────────
// Titre normalisé : sans accents, sans préfixe de type ("Exposition - …"), sans
// ponctuation. Sert à regrouper le même événement listé par plusieurs sources.
const TYPE_PREFIX = /^(expositions?|expo|concert|spectacles?|visites? guidees?|visite|festival|conferences?|ateliers?|stage|theatre|danse|cinema|projection|rencontres?|lecture|balade|sortie)\s*[-–—:]\s*/;
function titleKey(title) {
  return stripAccents(String(title || "").toLowerCase())
    .replace(TYPE_PREFIX, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Deux intervalles [date, endDate] se chevauchent-ils ?
function overlap(a, b) {
  const as = a.date || "", ae = a.endDate || a.date || "";
  const bs = b.date || "", be = b.endDate || b.date || "";
  return as <= be && bs <= ae;
}

// Lieux compatibles : l'un vide, identiques, même ville, ou l'un contenu dans
// l'autre. Évite de fusionner deux événements homonymes dans des lieux distincts.
function placeCompat(a, b) {
  const pa = slugKey(a.place), pb = slugKey(b.place);
  if (!pa || !pb) return true;
  if (pa === pb || pa.includes(pb) || pb.includes(pa)) return true;
  const ca = slugKey(a.city), cb = slugKey(b.city);
  return !!ca && ca === cb;
}

// Priorité de source pour choisir la fiche « de référence » (plus c'est petit,
// plus c'est prioritaire). La Ville de Nancy n'a pas de champ source (→ officiel).
const SRC_RANK = {
  "ville-de-nancy": 0, "destination-nancy": 1, "zenith-nancy": 2, "curieux-net": 3,
  "ici-c-nancy": 4, "vandoeuvre": 5, "villers-les-nancy": 6, "est-republicain": 7,
  "alentoor": 8,
};
const srcRank = (e) => SRC_RANK[e.source || "ville-de-nancy"] ?? 9;
const richness = (e) => (e.dateText ? 2 : 0) + (e.image ? 1 : 0) + (e.place ? 0.5 : 0);

function pickBase(cluster) {
  return cluster.slice().sort((a, b) => (richness(b) - richness(a)) || (srcRank(a) - srcRank(b)))[0];
}

function mergeCluster(cluster) {
  const base = pickBase(cluster);
  const starts = cluster.map((e) => e.date).filter(Boolean).sort();
  const ends = cluster.map((e) => e.endDate || e.date).filter(Boolean).sort();
  return {
    ...base,
    date: starts[0] || base.date,
    endDate: ends[ends.length - 1] || base.endDate,
    place: base.place || cluster.map((e) => e.place).find(Boolean) || "",
    city: base.city || cluster.map((e) => e.city).find(Boolean) || "",
    image: base.image || cluster.map((e) => e.image).find(Boolean) || null,
    dateText: base.dateText || cluster.map((e) => e.dateText).find(Boolean) || "",
    free: cluster.some((e) => e.free),
    reservation: cluster.some((e) => e.reservation),
    subcats: [...new Set(cluster.flatMap((e) => e.subcats || []))],
  };
}

// Regroupe par titre, puis fusionne au sein d'un groupe les fiches dont les dates
// se chevauchent ET le lieu est compatible. Retourne la liste dédoublonnée triée.
function dedupeCrossSource(events) {
  const byTitle = new Map();
  for (const e of events) {
    const k = titleKey(e.title);
    if (!k) { byTitle.set("∅" + (byTitle.size), [e]); continue; } // titre vide : jamais fusionné
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(e);
  }
  const out = [];
  for (const group of byTitle.values()) {
    const clusters = [];
    for (const e of group) {
      const c = clusters.find((cl) => cl.some((x) => overlap(x, e) && placeCompat(x, e)));
      if (c) c.push(e); else clusters.push([e]);
    }
    for (const cl of clusters) out.push(cl.length > 1 ? mergeCluster(cl) : cl[0]);
  }
  return out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

// ── 4. Période d'affichage pour les événements sur plusieurs jours ───────────
// dateLabel() (front) privilégie `dateText` ; sinon il n'affiche que `date`
// (un seul jour). Pour qu'un événement multi-jours montre sa PÉRIODE, on
// renseigne dateText quand il est vide.
//
// ⚠️ `date` est calé sur aujourd'hui au tri pour les événements DÉJÀ en cours
// (le vrai début est alors perdu ici). Le clampage ne touche QUE les débuts
// passés : un événement strictement futur (date > aujourd'hui) a donc forcément
// `date` = vrai début. On ne génère la période QUE dans ce cas sûr ; pour les
// événements en cours on s'appuie sur le dateText (vraie période) déjà posé par
// les scrapers à la collecte.
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function periodText(startISO, endISO) {
  const [y1, m1, d1] = startISO.split("-").map(Number);
  const [y2, m2, d2] = endISO.split("-").map(Number);
  if (y1 !== y2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} ${y1} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `Du ${d1} ${MONTH_NAMES[m1 - 1]} au ${d2} ${MONTH_NAMES[m2 - 1]} ${y2}`;
  return `Du ${d1} au ${d2} ${MONTH_NAMES[m1 - 1]} ${y1}`;
}

function fillPeriod(ev, todayISO) {
  if (ev.dateText) return ev;                              // libellé déjà fourni
  const start = ev.date, end = ev.endDate;
  if (!start || !end || end <= start) return ev;           // jour unique
  if (start <= todayISO) return ev;                        // en cours/passé : début peut-être calé → on ne devine pas
  return { ...ev, dateText: periodText(start, end) };
}

// Applique les nettoyages d'un coup sur un tableau d'événements fusionnés.
function cleanupMerged(events) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const normalized = events.map((e) => remapCategory({ ...e, city: cleanCity(e.city) }));
  // La période est calculée APRÈS dédoublonnage, sur les date/endDate finales
  // (mergeCluster pouvant élargir l'intervalle en fusionnant plusieurs sources).
  return dedupeCrossSource(normalized).map((e) => fillPeriod(e, todayISO));
}

module.exports = { cleanCity, remapCategory, dedupeCrossSource, cleanupMerged, CANON_CAT, CITY_CANON };
