/**
 * Registre des clubs de haut niveau du Grand Nancy suivis par l'onglet Sport.
 *
 * Une seule source de vérité, partagée par sport-scrape.js (récupération) et
 * update-sport.js (fabrication de data-sport.js). Ajouter un club = ajouter une
 * entrée ici + l'adaptateur correspondant dans sport-scrape.js.
 *
 * Champs :
 *   key        identifiant court, sert de préfixe d'uuid ("gnvb-9952")
 *   name       nom affiché du club
 *   short      nom court pour l'affiche (2 lignes max)
 *   sport      clé de catégorie (doit exister dans SPORTS ci-dessous)
 *   league     compétition affichée sous le titre
 *   venue      salle/stade des matchs à domicile
 *   city       commune (sert au filtre géographique et à la carte)
 *   colors     [fond, accent] de l'affiche générée. Les quatre fonds sont
 *              choisis sur des teintes franchement distinctes (bleu, rouge,
 *              rose, vert) : à la taille d'une vignette, c'est la couleur qui
 *              dit quel club joue, avant même qu'on lise le nom.
 *   site       page du club (lien "En savoir plus" de la lightbox)
 *   tickets    billetterie, si distincte du site
 *   calendar   page officielle du calendrier, tenue à jour par le club ou la
 *              ligue. C'est le lien « Plus d'infos » des rencontres dont
 *              l'horaire n'est pas encore connu.
 *   aliases    formes du nom telles qu'elles apparaissent dans les sources,
 *              utilisées pour reconnaître les matchs À DOMICILE
 */

const SPORTS = {
  foot:    { label: "Football",  emoji: "⚽" },
  basket:  { label: "Basket",    emoji: "🏀" },
  volley:  { label: "Volley",    emoji: "🏐" },
  hand:    { label: "Handball",  emoji: "🤾" },
};

// Handball : depuis 2026-27, Nancy Métropole Handball, Villers Handball et
// Neuves-Maisons forment l'Entente Élite 54. L'équipe masculine fanion joue en
// Nationale 2 sous le nom « ENT. NANCY / VILLERS » (Gymnase Provençal, Nancy),
// l'équipe féminine de Villers en Nationale 2 (salle Marie Marvingt, Villers).
// L'équipe réserve masculine (N3, même nom) n'est pas suivie. Source : site de
// la FFHandball (champ `ffh`, lu par scrapeFFH dans sport-scrape.js).
const CLUBS = [
  {
    key: "asnl",
    name: "AS Nancy-Lorraine",
    short: "ASNL",
    sport: "foot",
    league: "Ligue 2 BKT",
    venue: "Stade Marcel-Picot",
    city: "Tomblaine",
    colors: ["#123a86", "#ff5a5f"],
    site: "https://www.asnl.net/",
    tickets: "http://asnlbillets.net/Pages/Start.aspx",
    calendar: "https://www.asnl.net/86/calendrier/calendriers/liste/",
    aliases: ["as nancy lorraine", "as nancy-lorraine", "nancy lorraine", "asnl", "nancy"],
  },
  {
    key: "sluc",
    name: "SLUC Nancy Basket",
    short: "SLUC",
    sport: "basket",
    league: "Betclic ÉLITE",
    venue: "Palais des Sports Jean Weille",
    city: "Nancy",
    colors: ["#a4161a", "#ffb703"],
    site: "https://sluc-basket.fr/",
    tickets: "https://billetterie.sluc-basket.fr/",
    calendar: "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    aliases: ["sluc nancy", "sluc", "nancy"],
  },
  {
    key: "vnvb",
    name: "Vandœuvre Nancy Volley-Ball",
    short: "VNVB",
    sport: "volley",
    league: "Saforelle Power 6",
    venue: "Parc des Sports des Nations",
    city: "Vandœuvre-lès-Nancy",
    colors: ["#d6417f", "#ffe3f0"],
    site: "https://www.vnvb.fr/",
    tickets: "https://www.vnvb.fr/billetterie/",
    calendar: "https://www.vnvb.fr/",
    aliases: ["vandoeuvre nancy", "vandœuvre nancy", "vnvb", "vandoeuvre", "nancy vb"],
  },
  {
    key: "gnvb",
    name: "Grand Nancy Volley-Ball",
    short: "GNVB",
    sport: "volley",
    league: "Ligue B Masculine",
    venue: "Parc des Sports des Nations",
    city: "Vandœuvre-lès-Nancy",
    colors: ["#0f6248", "#7ef0b0"],
    site: "https://www.nancy-volley.fr/",
    tickets: "https://www.nancy-volley.fr/billetterie/",
    calendar: "https://www.nancy-volley.fr/calendrier/",
    aliases: ["grand nancy", "gnvb", "grand nancy volley"],
  },
  {
    key: "nancy-villers",
    name: "Entente Nancy / Villers Handball",
    short: "NANCY / VILLERS",
    sport: "hand",
    league: "Nationale 2 masculine",
    venue: "Gymnase Provençal",
    city: "Nancy",
    colors: ["#141414", "#fdd835"],
    site: "https://villers-handball.com/",
    tickets: "",
    calendar: "https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/nationale-2-masculine-2026-2027-32501/poule-190844/",
    aliases: ["ent. nancy / villers", "ent nancy villers", "nancy / villers", "nancy villers"],
    ffh: { competition: "nationale-2-masculine-2026-2027-32501", poule: "190844", saison: "22" },
  },
  {
    // Seconde équipe de l'entente, en Nationale 3 (poule 6). C'est celle que le
    // site de Villers appelle « Seniors masculins 1 » : inscrite sous ses
    // couleurs, elle reçoit surtout à Marie Marvingt (parfois à Provençal ;
    // la salle réelle est lue match par match sur ffhandball.fr). Même
    // libellé « ENT. NANCY / VILLERS » que la N2 sur le site fédéral.
    key: "nancy-villers-2",
    name: "Entente Nancy / Villers Handball (Nationale 3)",
    short: "NANCY / VILLERS 2",
    sport: "hand",
    league: "Nationale 3 masculine",
    venue: "Salle Marie Marvingt",
    city: "Villers-lès-Nancy",
    colors: ["#141414", "#fdd835"],
    site: "https://villers-handball.com/",
    tickets: "",
    calendar: "https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/nationale-3-masculine-2026-2027-32502/poule-190854/",
    aliases: ["ent. nancy / villers", "ent nancy villers", "nancy / villers", "nancy villers"],
    ffh: { competition: "nationale-3-masculine-2026-2027-32502", poule: "190854", saison: "22" },
  },
  {
    key: "villers-f",
    name: "Villers Handball (féminines)",
    short: "VILLERS HB",
    sport: "hand",
    league: "Nationale 2 féminine",
    venue: "Salle Marie Marvingt",
    city: "Villers-lès-Nancy",
    colors: ["#6d28d9", "#ddd6fe"],
    site: "https://villers-handball.com/",
    tickets: "",
    calendar: "https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/nationale-2-feminine-2026-2027-32609/poule-191246/",
    aliases: ["villers handball", "villers hb"],
    ffh: { competition: "nationale-2-feminine-2026-2027-32609", poule: "191246", saison: "22" },
  },
];

// Salles telles qu'elles sortent des sources → lieu + commune affichés.
const VENUES = {
  "nations":            { place: "Parc des Sports des Nations", city: "Vandœuvre-lès-Nancy" },
  "jean weille":        { place: "Palais des Sports Jean Weille", city: "Nancy" },
  "palais des sports":  { place: "Palais des Sports Jean Weille", city: "Nancy" },
  "gentilly":           { place: "Palais des Sports Jean Weille", city: "Nancy" },
  "marcel picot":       { place: "Stade Marcel-Picot", city: "Tomblaine" },
  "marcel-picot":       { place: "Stade Marcel-Picot", city: "Tomblaine" },
  "provencal":          { place: "Gymnase Provençal", city: "Nancy" },
  "marvingt":           { place: "Salle Marie Marvingt", city: "Villers-lès-Nancy" },
};

const byKey = (k) => CLUBS.find(c => c.key === k);

// Comparaison tolérante (accents, casse, ponctuation) utilisée pour reconnaître
// une équipe dans un libellé de source.
function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Le libellé désigne-t-il ce club ? (utilisé pour trancher domicile/extérieur)
function isClub(club, label) {
  const n = norm(label);
  if (!n) return false;
  return club.aliases.some(a => {
    const na = norm(a);
    return n === na || n.startsWith(na + " ") || n.endsWith(" " + na) || n.includes(" " + na + " ");
  });
}

function resolveVenue(club, salle) {
  const n = norm(salle);
  for (const [needle, v] of Object.entries(VENUES)) {
    if (n && n.includes(norm(needle))) return v;
  }
  return { place: club.venue, city: club.city };
}

module.exports = { SPORTS, CLUBS, VENUES, byKey, norm, isClub, resolveVenue };
