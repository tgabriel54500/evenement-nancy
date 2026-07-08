// Cœur COMMUN aux vues Galerie (galerie.js) et Cartes (app.js) : dédoublonnage,
// dates, ruban « Nouveautés », favoris (localStorage). Une seule source de vérité :
// avant, ces fonctions étaient copiées dans galerie.js ET app.js (le bug de clé de
// favori a d'ailleurs dû être corrigé en double). Les vues n'en gardent que le DOM.
//
// ⚠️ Chargé en <script> classique APRÈS data.js (a besoin de EVENTS) et AVANT
// galerie.js / app.js. En script classique, ces déclarations top-level vivent dans
// le scope lexical global PARTAGÉ entre les <script> de la page → visibles par les
// vues sans export. Corollaire : les vues ne doivent PLUS redéclarer ces symboles
// (sinon « Identifier already declared »).

const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN",
  "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

// ---------- Dédoublonnage ----------
function normKey(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }

// Fusionne plusieurs entrées d'un même événement en gardant les infos les plus
// complètes (lieu/image renseignés, badges cumulés, sous-catégories réunies).
function mergeOcc(occ) {
  const rep = occ[0];
  return {
    ...rep,
    place: rep.place || occ.map(e => e.place).find(Boolean) || "",
    city: rep.city || occ.map(e => e.city).find(Boolean) || "",
    image: rep.image || occ.map(e => e.image).find(Boolean) || null,
    free: occ.some(e => e.free),
    reservation: occ.some(e => e.reservation),
    subcats: [...new Set(occ.flatMap(e => e.subcats || []))],
    addedAt: occ.map(e => e.addedAt).filter(Boolean).sort().pop(),
  };
}

// La source contient quelques doublons exacts (même titre, même date, même lieu,
// uuid différents). On identifie un événement par titre + date + lieu : ces
// doublons sont fusionnés, mais les occurrences d'un récurrent (dates différentes)
// restent des fiches distinctes. Un lieu manquant ne distingue pas : il est
// rattaché à l'entrée renseignée du même jour. Même intitulé le même jour dans
// deux lieux réels distincts → une fiche par lieu.
function dedupEvents(events) {
  const days = new Map();
  for (const ev of events) {
    const k = normKey(ev.title) + "|" + (ev.date || "");
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(ev);
  }
  const merged = [];
  for (const occ of days.values()) {
    const venues = [...new Set(occ.map(e => normKey(e.place)).filter(Boolean))];
    if (venues.length <= 1) {
      merged.push(mergeOcc(occ));
    } else {
      // Lieux réels multiples : une fiche par lieu (les entrées sans lieu
      // sont rattachées au premier).
      venues.forEach((v, i) => {
        merged.push(mergeOcc(occ.filter(e =>
          normKey(e.place) === v || (i === 0 && !normKey(e.place)))));
      });
    }
  }
  return merged;
}

// ---------- Dates ----------
// Aujourd'hui (heure du navigateur) au format ISO, calculé une fois au chargement.
const TODAY_ISO = (() => { const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
// Un événement est PASSÉ si sa date de fin (ou sa date) est < aujourd'hui. On les
// retire de l'affichage : le site se nettoie ainsi tout seul chaque jour, même
// sans régénération de data.js.
const notPast = (ev) => ((ev.endDate || ev.date || "") >= TODAY_ISO);

// ── Nouveautés ──────────────────────────────────────────────────────────────
// Un événement est « nouveau » pendant 3 JOURS à compter de son AJOUT sur une
// source (champ addedAt posé par update-events.js, indexé sur l'uuid stable).
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const NEW_SINCE_ISO = daysAgoISO(3);
const isNew = (ev) => !!(ev.addedAt && ev.addedAt >= NEW_SINCE_ISO);

// Un événement est « multi-jours » si sa date de fin tombe un jour APRÈS son
// début (comparaison sur la partie date seule, pas l'horaire).
const isMulti = (ev) => { const s = (ev.date || "").slice(0, 10), e = (ev.endDate || "").slice(0, 10); return !!e && e > s; };
// Tri : d'abord TOUS les mono-jour (par date croissante), puis TOUS les
// multi-jours (par date croissante). render() insère un titre à la bascule.
const sortEvents = (a, b) => (isMulti(a) - isMulti(b)) || (a.date || "").localeCompare(b.date || "");
// `extra` = événements approuvés soumis par les utilisateurs (Supabase, via
// user-events.js), fusionnés aux events statiques. `sortedEvents` est `let` car
// recalculé par la vue après le chargement asynchrone des events utilisateurs.
const buildSorted = (extra) => dedupEvents(EVENTS.concat(extra || [])).filter(notPast).sort(sortEvents);
let sortedEvents = buildSorted();

// ---------- Favoris (persistés dans le navigateur via localStorage) ----------
// Clé stable = titre + date + lieu + ville. Le lieu/ville distingue les fiches
// homonymes du même jour dans deux communes (dedupEvents en garde une par lieu) :
// sans eux, un seul favori marquerait toutes ces fiches et fausserait le compteur.
// On stocke {clé: endDate} et on PURGE au chargement les favoris déjà passés.
const FAV_KEY = "agenda-nancy:favoris";
const HEART = '<svg viewBox="0 0 24 24" class="heart" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
function favLoad() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch (e) { return {}; } }
function favSave() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {} }
let favs = favLoad();
(function prunePast() { let ch = false; for (const k of Object.keys(favs)) if ((favs[k] || "") < TODAY_ISO) { delete favs[k]; ch = true; } if (ch) favSave(); })();
function favKey(ev) { return normKey(ev.title) + "|" + (ev.date || "") + "|" + normKey(ev.place) + "|" + normKey(ev.city); }
function isFav(ev) { return favKey(ev) in favs; }
function toggleFav(ev) {
  const k = favKey(ev);
  if (k in favs) delete favs[k]; else favs[k] = ev.endDate || ev.date || "";
  favSave();
}
