/**
 * Catégories des événements professionnels (onglet Pro).
 *
 * Une seule source de vérité, chargée à la fois par Node (pro-scrape.js,
 * update-pro.js) et par le navigateur (compte.html, pour le sélecteur de
 * catégorie quand le type « Pro / Réseaux » est choisi). Le fichier ne
 * dépend de rien : en Node il exporte l'objet, dans une page il pose
 * window.PRO_CATEGORIES.
 *
 * Même forme que CATEGORIES dans data.js (label + emoji), pour que galerie.js
 * les traite comme n'importe quelle autre catégorie.
 */
(function (root) {
  const PRO_CATEGORIES = {
    "afterwork":  { label: "Afterworks & networking",     emoji: "🥂" },
    "petit-dej":  { label: "Petits-déjeuners & déjeuners", emoji: "☕" },
    "conference": { label: "Conférences & tables rondes", emoji: "🎤" },
    "salon":      { label: "Salons & congrès",            emoji: "🏛️" },
    "formation":  { label: "Ateliers & formations",       emoji: "🛠️" },
    "emploi":     { label: "Emploi & recrutement",        emoji: "💼" },
    "autre":      { label: "Autre rendez-vous pro",       emoji: "📌" },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = PRO_CATEGORIES;
  else root.PRO_CATEGORIES = PRO_CATEGORIES;
})(typeof window !== "undefined" ? window : this);
