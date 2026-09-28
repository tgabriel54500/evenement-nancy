/**
 * Registre des réseaux d'affaires et des sources d'événements professionnels
 * suivis par l'onglet Pro (pro.html).
 *
 * Une seule source de vérité, partagée par pro-scrape.js (récupération),
 * update-pro.js (fabrication de data-pro.js) et la section « Réseaux » de
 * pro.html (via RESEAUX dans data-pro.js).
 *
 * Deux familles d'entrées :
 *   - scrape: true  → un adaptateur du même `key` existe dans pro-scrape.js et
 *                     lit l'agenda public du réseau.
 *   - scrape: false → le réseau n'a pas d'agenda public (événements réservés
 *                     aux membres, ou annoncés seulement sur les réseaux
 *                     sociaux). Il figure dans l'annuaire de pro.html, avec un
 *                     lien, et il est invité à publier lui-même via compte.html.
 *
 * Champs :
 *   key          identifiant court, préfixe des uuid ("audacieux-…")
 *   name         nom affiché
 *   short        nom court pour l'affiche générée
 *   site         page du réseau (lien de l'annuaire, repli du « Plus d'infos »)
 *   agenda       page de l'agenda public, si elle existe
 *   scrape       voir ci-dessus
 *   membersOnly  true si les événements sont par défaut réservés aux membres
 *   colors       [fond, accent] de l'affiche générée quand la source ne
 *                fournit pas d'image
 *   blurb        une phrase pour l'annuaire
 *   frequency    rythme annoncé par le réseau (texte libre, annuaire)
 */

const RESEAUX = [
  {
    key: "audacieux",
    name: "Les Audacieux Nancy",
    short: "Les Audacieux",
    site: "https://les-audacieux.fr/",
    agenda: "https://les-audacieux.fr/afterworks/",
    scrape: true,
    membersOnly: false,
    colors: ["#1f2937", "#fbbf24"],
    blurb: "Club d'entrepreneurs et de commerciaux de la métropole : afterworks et petits-déjeuners ouverts à tous, membres ou curieux.",
    frequency: "Un rendez-vous par mois environ",
  },
  {
    key: "cafesbusiness",
    name: "Les Cafés Business",
    short: "Cafés Business",
    site: "https://lescafesbusiness.fr/",
    agenda: "https://lescafesbusiness.fr/nos-evenements-meurthe-moselle/",
    scrape: true,
    membersOnly: false,
    colors: ["#7c2d12", "#fed7aa"],
    blurb: "Petits-déjeuners de réseautage accueillis chaque fois par une entreprise différente, sur inscription (places limitées).",
    frequency: "Deux mardis par mois environ, à 9h",
  },
  {
    key: "adjan",
    name: "Le 8/9 d'ADJAN",
    short: "8/9 ADJAN",
    site: "https://adjan.fr/le-8-9-adjan/",
    agenda: "https://adjan.fr/le-8-9-adjan/",
    scrape: true,
    membersOnly: false,
    colors: ["#0c4a6e", "#7dd3fc"],
    blurb: "Petits-déjeuners de dirigeants autour d'un intervenant du monde du sport (8h à 9h), sur inscription.",
    frequency: "Un par mois environ",
  },
  {
    key: "medef54",
    name: "MEDEF Meurthe-et-Moselle",
    short: "MEDEF 54",
    site: "https://www.medef-meurthe-moselle.fr/",
    agenda: "https://www.medef-meurthe-moselle.fr/fr/agenda",
    scrape: true,
    membersOnly: false,       // décidé fiche par fiche (mention « réservé aux adhérents »)
    colors: ["#1e3a8a", "#bfdbfe"],
    blurb: "Soirées Décryptages, Comex40, petits-déjeuners thématiques et formations. Certaines dates sont réservées aux adhérents.",
    frequency: "Plusieurs rendez-vous par mois",
  },
  {
    key: "cci",
    name: "CCI Grand Nancy Métropole",
    short: "CCI Nancy",
    site: "https://www.nancy.cci.fr/",
    agenda: "https://www.nancy.cci.fr/evenements",
    scrape: true,
    membersOnly: false,
    colors: ["#0f766e", "#99f6e4"],
    blurb: "Réunions d'information, ateliers, Repreneuriales, Nuit de la Création : l'agenda de la chambre de commerce.",
    frequency: "Plusieurs rendez-vous par mois",
  },
  {
    key: "prouve",
    name: "Centre Prouvé & Parc Expo",
    short: "Centre Prouvé",
    site: "https://www.destination-nancy.com/organiser-un-evenement-a-nancy/",
    agenda: "https://www.destination-nancy.com/organiser-un-evenement-a-nancy/agenda-et-actualites/",
    scrape: true,
    membersOnly: false,
    colors: ["#4c1d95", "#ddd6fe"],
    blurb: "Congrès, journées professionnelles et salons accueillis au centre de congrès et au parc des expositions.",
    frequency: "Selon le calendrier des congrès",
  },
  // ── Réseaux sans agenda public : annuaire seulement ─────────────────────
  {
    key: "sluc-business",
    name: "SLUC Business Club",
    short: "SLUC Business",
    site: "https://sluc-basket.fr/sluc-family/qui-sommes-nous-business-club",
    agenda: "https://www.facebook.com/p/SLUC-Business-Club-100064875120666/",
    scrape: false,
    membersOnly: true,
    colors: ["#991b1b", "#fecaca"],
    blurb: "Le club des partenaires du SLUC Nancy Basket : plus de vingt rendez-vous par saison (afterworks, déjeuners, visites d'entreprise), réservés aux membres.",
    frequency: "Plus de 20 événements par saison",
  },
  {
    key: "vnvb-business",
    name: "VNVB Business Club",
    short: "VNVB Business",
    site: "https://www.vnvb.fr/partenaires/",
    agenda: "",
    scrape: false,
    membersOnly: true,
    colors: ["#9d174d", "#fbcfe8"],
    blurb: "Le réseau des partenaires du Vandœuvre Nancy Volley-Ball : déjeuners mensuels, soirées partenaires, afterworks.",
    frequency: "Un déjeuner par mois et des soirées",
  },
  {
    key: "gnvb-business",
    name: "GNVB, partenaires",
    short: "GNVB",
    site: "https://www.nancy-volley.fr/nos-partenaires/",
    agenda: "",
    scrape: false,
    membersOnly: true,
    colors: ["#166534", "#bbf7d0"],
    blurb: "Le club des partenaires du Grand Nancy Volley-Ball, autour des matchs à domicile.",
    frequency: "",
  },
  {
    key: "vhb-family-business",
    name: "Villers Handball, Family Business",
    short: "VHB Family Business",
    site: "https://villers-handball.com/accueil/family-business/les-evenements/",
    agenda: "",
    scrape: false,
    membersOnly: true,
    colors: ["#b45309", "#fde68a"],
    blurb: "Le réseau d'entreprises du Villers Handball : petits-déjeuners, déjeuners business, afterworks et soirées de gala, une vingtaine par saison.",
    frequency: "Une vingtaine d'événements par saison",
  },
];

const byKey = (k) => RESEAUX.find((r) => r.key === k) || null;

// ── Périmètre géographique ────────────────────────────────────────────────
// L'onglet Pro se limite à Nancy et aux communes à RAYON_KM de son centre
// (demande Tristan : « Nancy et environ mais max 5 km »). Les coordonnées
// viennent de commune-coords.json (déjà produit par update-events.js) ; les
// communes absentes du fichier sont acceptées si elles figurent dans
// COMMUNES_TOUJOURS, refusées sinon.
const RAYON_KM = 5;
const NANCY = { lat: 48.6921, lon: 6.1844 };   // place Stanislas
const COMMUNES_TOUJOURS = ["nancy"];
const COMMUNES_JAMAIS = [];                     // pour exclure une commune malgré la distance

function slug(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function haversineKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let _coords = null;
function loadCoords() {
  if (_coords) return _coords;
  try {
    _coords = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "commune-coords.json"), "utf8"));
  } catch (_) { _coords = {}; }
  return _coords;
}

// true / false, ou null si la commune est inconnue du référentiel.
function communeDansRayon(city) {
  const k = slug(city);
  if (!k) return null;
  if (COMMUNES_JAMAIS.includes(k)) return false;
  if (COMMUNES_TOUJOURS.includes(k)) return true;
  // commune-coords.json a ses propres clés (« vand-uvre-les-nancy » : le œ y est
  // perdu) : on tente les deux graphies.
  const coords = loadCoords();
  const c = coords[k] || coords[k.replace(/oe/g, "-")] || coords[slug(String(city).replace(/œ/g, "oe"))];
  if (!c) return null;
  return haversineKm(NANCY, c) <= RAYON_KM;
}

module.exports = { RESEAUX, byKey, RAYON_KM, communeDansRayon, haversineKm, slug };
