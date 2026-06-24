// Logique de l'agenda : rendu des cartes, filtres par activité, recherche.
// Les données (CATEGORIES, EVENTS, GENERATED_AT) viennent de data.js,
// régénéré depuis l'agenda officiel de Nancy via `node update-events.js`.

const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN",
  "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

// state.cats = ensemble des catégories cochées (multi-sélection, logique OU).
// Vide = « Tout » (aucun filtre catégorie).
const state = { cats: new Set(), query: "", when: "all", customFrom: "", customTo: "", price: "all", resa: "all", favOnly: false };

const els = {
  filters: document.getElementById("filters"),
  dateFilters: document.getElementById("dateFilters"),
  toolbar: document.getElementById("toolbar"),
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  count: document.getElementById("resultsCount"),
  search: document.getElementById("search"),
};

function normKey(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

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

// La source contient quelques doublons exacts (même titre, même date, même
// lieu, uuid différents). On identifie un événement par titre + date + lieu :
// ces doublons sont fusionnés, mais les occurrences d'un événement récurrent
// (dates différentes) restent des fiches distinctes, chacune à sa date.
// Un lieu manquant sur un doublon ne le distingue pas : il est rattaché à
// l'entrée renseignée du même jour. Si un même intitulé se tient le même jour
// dans deux lieux réels distincts, on conserve une fiche par lieu.
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

// Aujourd'hui (heure du navigateur) au format ISO, calculé une fois au chargement.
const TODAY_ISO = (() => { const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
// Un événement est PASSÉ si sa date de fin (ou sa date) est < aujourd'hui. On les
// retire de l'affichage : le site se nettoie ainsi tout seul chaque jour, même
// sans régénération de data.js.
const notPast = (ev) => ((ev.endDate || ev.date || "") >= TODAY_ISO);

// Ruban « Nouveau » : événement ajouté il y a ≤ 3 jours (champ addedAt posé par
// update-events.js). Cohérent avec la galerie et la page Nouveautés.
const NEW_SINCE_ISO = (() => { const d = new Date(); d.setDate(d.getDate() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
const isNew = (ev) => !!(ev.addedAt && ev.addedAt >= NEW_SINCE_ISO);

// Un événement est « multi-jours » si sa date de fin tombe un jour APRÈS son
// début (comparaison sur la partie date seule, pas l'horaire).
const isMulti = (ev) => { const s = (ev.date || "").slice(0, 10), e = (ev.endDate || "").slice(0, 10); return !!e && e > s; };
// Tri : d'abord TOUS les mono-jour (par date croissante), puis TOUS les
// multi-jours (par date croissante). render() insère un titre à la bascule.
const sortEvents = (a, b) => (isMulti(a) - isMulti(b)) || (a.date || "").localeCompare(b.date || "");
// `extra` = events approuvés soumis par les utilisateurs (Supabase, via
// user-events.js), fusionnés aux events statiques ; re-calculé après chargement.
const buildSorted = (extra) => dedupEvents(EVENTS.concat(extra || [])).filter(notPast).sort(sortEvents);
let sortedEvents = buildSorted();

// ---------- Favoris (persistés via localStorage, partagés avec la vue Galerie) ----------
// Clé stable = titre + date (data.js de prod minifié SANS uuid). On stocke
// {clé: endDate} et on PURGE au chargement les favoris dont l'événement est passé.
const FAV_KEY = "agenda-nancy:favoris";
const HEART = '<svg viewBox="0 0 24 24" class="heart" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
function favLoad() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch (e) { return {}; } }
function favSave() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {} }
let favs = favLoad();
(function prunePast() { let ch = false; for (const k of Object.keys(favs)) if ((favs[k] || "") < TODAY_ISO) { delete favs[k]; ch = true; } if (ch) favSave(); })();
// Clé stable = titre + date + lieu + ville (cf. galerie.js) : distingue les
// fiches homonymes du même jour dans deux communes, sinon un favori les marque toutes.
function favKey(ev) { return normKey(ev.title) + "|" + (ev.date || "") + "|" + normKey(ev.place) + "|" + normKey(ev.city); }
function isFav(ev) { return favKey(ev) in favs; }
function toggleFav(ev) {
  const k = favKey(ev);
  if (k in favs) delete favs[k]; else favs[k] = ev.endDate || ev.date || "";
  favSave();
}

function dateParts(iso) {
  if (!iso) return { day: "?", month: "" };
  const [, m, d] = iso.split("-").map(Number);
  return { day: d, month: MONTHS_SHORT[m - 1] || "" };
}

function fmtLong(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

// Date d'ancrage à AFFICHER (pastille de la carte) : jamais une date passée pour
// un événement encore en cours. Si un filtre de période est actif, on cale sur le
// début de cette période → un événement multi-jours apparaît à sa première date
// réellement concernée par le filtre, et non à sa date de début (parfois passée).
function displayDate(ev) {
  const start = ev.date || "";
  const end = ev.endDate || start;
  let lower = isoOf(new Date());                       // aujourd'hui (navigateur)
  const r = state.when !== "all" ? whenRange(state.when) : null;
  if (r && r[0] && r[0] > lower) lower = r[0];         // début du filtre de période
  return (start < lower && end >= lower) ? lower : start;
}

// Texte de date lisible. Pour un événement multi-jours, on affiche une PÉRIODE
// (« Du X au Y » s'il est à venir, « Jusqu'au Y » s'il est déjà en cours) plutôt
// que sa seule date de début, qui peut être passée. On ajoute l'horaire si dispo.
function dateLabel(ev) {
  const start = ev.date || "";
  const end = ev.endDate || start;
  const today = isoOf(new Date());
  let base;
  if (end && end !== start) {
    base = start > today ? `Du ${fmtLong(start)} au ${fmtLong(end)}` : `Jusqu'au ${fmtLong(end)}`;
  } else {
    base = ev.dateText || fmtLong(start);
  }
  if (ev.schedule) base += (base ? " · " : "") + ev.schedule;
  return base || "Date à venir";
}

function buildFilters() {
  const counts = {};
  for (const ev of sortedEvents) counts[ev.category] = (counts[ev.category] || 0) + 1;

  const buttons = [
    { key: "all", label: "Tout", emoji: "✨", n: sortedEvents.length },
    ...Object.entries(CATEGORIES)
      .filter(([key]) => counts[key])
      .map(([key, c]) => ({ key, label: c.label, emoji: c.emoji, n: counts[key] })),
  ];

  const isActive = (key) => key === "all" ? state.cats.size === 0 : state.cats.has(key);

  els.filters.innerHTML = buttons.map(b => `
    <button class="filter ${isActive(b.key) ? "is-active" : ""}" data-key="${b.key}">
      <span>${b.emoji}</span>${escapeHtml(b.label)}
      <span class="count">${b.n}</span>
    </button>`).join("");

  els.filters.querySelectorAll(".filter").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      // « Tout » remet à zéro ; une catégorie se coche / décoche (multi-sélection).
      if (key === "all") state.cats.clear();
      else state.cats.has(key) ? state.cats.delete(key) : state.cats.add(key);
      els.filters.querySelectorAll(".filter").forEach(b =>
        b.classList.toggle("is-active", isActive(b.dataset.key)));
      render();
    });
  });
}

// Filtres tarif (gratuit/payant) et réservation (accès libre / sur réservation).
// L'info est fiabilisée à la source par enrich-pricing.js (cf. data.js).
// ---------- Barre d'outils : « Recherche avancée » (tarif + réservation) + « Mes favoris » ----------
// Tarif et réservation sont des filtres secondaires : rangés dans un popover
// « Recherche avancée », à côté de « Mes favoris ». Les catégories restent visibles.
const SLIDERS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tool-ico"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="tool-chev"><path d="M6 9l6 6 6-6"/></svg>';

const ADV_GROUPS = [
  { key: "price", label: "Tarif", opts: [{ v: "all", t: "Tous" }, { v: "free", t: "🆓 Gratuit" }, { v: "paid", t: "💶 Payant" }] },
  { key: "resa", label: "Réservation", opts: [{ v: "all", t: "Toutes" }, { v: "no", t: "Accès libre" }, { v: "yes", t: "🎟️ Sur réservation" }] },
];
function advCount() { return (state.price !== "all" ? 1 : 0) + (state.resa !== "all" ? 1 : 0); }

let advOpen = false;
function openAdvPop() {
  const p = document.getElementById("advPop"); if (!p) return;
  p.hidden = false; advOpen = true;
  document.getElementById("advTrigger").setAttribute("aria-expanded", "true");
}
function closeAdvPop() {
  const p = document.getElementById("advPop"); if (p) p.hidden = true;
  advOpen = false;
  const t = document.getElementById("advTrigger"); if (t) t.setAttribute("aria-expanded", "false");
}

function syncToolbar() {
  const n = advCount();
  const badge = document.getElementById("advBadge");
  if (badge) { badge.textContent = n; badge.hidden = n === 0; }
  const trig = document.getElementById("advTrigger");
  if (trig) trig.classList.toggle("is-active", n > 0);
  document.querySelectorAll("#advPop .seg__btn").forEach(b =>
    b.classList.toggle("is-active", state[b.dataset.group] === b.dataset.val));
  const reset = document.getElementById("advReset");
  if (reset) reset.disabled = n === 0;
  const fav = document.getElementById("favToggle");
  if (fav) {
    const c = favCount();
    fav.classList.toggle("is-active", state.favOnly);
    fav.setAttribute("aria-pressed", String(state.favOnly));
    const cnt = fav.querySelector(".count");
    if (cnt) { cnt.textContent = c; cnt.hidden = c === 0; }
  }
}

function buildToolbar() {
  if (!els.toolbar) return;
  els.toolbar.innerHTML = `
    <div class="tool-group" id="advWrap">
      <button type="button" class="tool-btn" id="advTrigger" aria-haspopup="dialog" aria-expanded="false">
        ${SLIDERS_ICON}<span>Recherche avancée</span><span class="tool-badge" id="advBadge" hidden>0</span>${CHEVRON_ICON}
      </button>
      <div class="cal adv-pop" id="advPop" role="dialog" aria-label="Recherche avancée" hidden>
        ${ADV_GROUPS.map(g => `
          <div class="adv-group">
            <span class="adv-label">${g.label}</span>
            <div class="seg" role="group" aria-label="${g.label}">
              ${g.opts.map(o => `<button type="button" class="seg__btn ${state[g.key] === o.v ? "is-active" : ""}" data-group="${g.key}" data-val="${o.v}">${o.t}</button>`).join("")}
            </div>
          </div>`).join("")}
        <button type="button" class="adv-reset" id="advReset">Réinitialiser</button>
      </div>
    </div>
    <button type="button" class="tool-btn favtoggle" id="favToggle" aria-pressed="false">
      ${HEART}<span>Mes favoris</span><span class="count" hidden>0</span>
    </button>`;

  els.toolbar.querySelector("#advTrigger")
    .addEventListener("click", (e) => { e.stopPropagation(); advOpen ? closeAdvPop() : openAdvPop(); });
  els.toolbar.querySelectorAll("#advPop .seg__btn").forEach(btn => btn.addEventListener("click", () => {
    state[btn.dataset.group] = btn.dataset.val;
    syncToolbar();
    render();
  }));
  els.toolbar.querySelector("#advReset").addEventListener("click", () => {
    state.price = "all"; state.resa = "all";
    syncToolbar(); render();
  });
  els.toolbar.querySelector("#favToggle").addEventListener("click", () => {
    state.favOnly = !state.favOnly;
    syncToolbar(); render();
  });
  syncToolbar();
}

document.addEventListener("click", (e) => { if (advOpen && !e.target.closest("#advWrap")) closeAdvPop(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && advOpen) closeAdvPop(); });

// État transitoire du calendrier (mois affiché + ouvert/fermé). La vérité sur la
// plage choisie reste state.customFrom / state.customTo (ISO "AAAA-MM-JJ").
const cal = { view: null, open: false };
const CAL_DOW = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cal-ico"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

const frDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS_LONG[m - 1]}`; };
function dateRangeLabel() {
  const f = state.customFrom, t = state.customTo;
  if (f && t) return f === t ? frDay(f) : `${frDay(f)} – ${frDay(t)}`;
  if (f) return `Dès le ${frDay(f)}`;
  if (t) return `Jusqu'au ${frDay(t)}`;
  return "Choisir des dates";
}

function buildDateFilters() {
  if (!els.dateFilters) return;
  const chips = [
    { key: "all", label: "Tout" },
    { key: "today", label: "Aujourd'hui" },
    { key: "weekend", label: "Ce week-end" },
  ];
  const chipsHTML = chips.map(c => `
    <button class="datefilter ${c.key === state.when ? "is-active" : ""}" data-when="${c.key}">
      ${escapeHtml(c.label)}
    </button>`).join("");

  // Plage personnalisée : un bouton qui ouvre un CALENDRIER (popover), au lieu de
  // saisir les dates au clavier. La sélection alimente state.customFrom/customTo.
  els.dateFilters.innerHTML = chipsHTML + `
    <span class="daterange ${state.when === "custom" ? "is-active" : ""}" id="dateRangeWrap">
      <button type="button" class="daterange__trigger" id="dateTrigger" aria-haspopup="dialog" aria-expanded="false">
        ${CAL_ICON}<span id="dateTriggerLabel">${escapeHtml(dateRangeLabel())}</span>
      </button>
      <button type="button" class="daterange__clear" id="dateClear" aria-label="Effacer les dates" title="Effacer">×</button>
      <div class="cal" id="calPopover" role="dialog" aria-label="Choisir une plage de dates" hidden></div>
    </span>`;

  els.dateFilters.querySelectorAll(".datefilter").forEach(btn => {
    btn.addEventListener("click", () => {
      state.when = btn.dataset.when;
      state.customFrom = "";
      state.customTo = "";
      closeCal();
      buildDateFilters();          // reconstruit (maj is-active des chips)
      render();
    });
  });

  els.dateFilters.querySelector("#dateTrigger")
    .addEventListener("click", (e) => { e.stopPropagation(); toggleCal(); });
  els.dateFilters.querySelector("#dateClear").addEventListener("click", (e) => {
    e.stopPropagation();
    state.customFrom = ""; state.customTo = ""; state.when = "all";
    closeCal();
    buildDateFilters();
    render();
  });
}

// --- Calendrier (popover de sélection de plage) ---------------------------
function toggleCal() { cal.open ? closeCal() : openCal(); }

function openCal() {
  const pop = document.getElementById("calPopover");
  if (!pop) return;
  cal.open = true;
  const base = state.customFrom ? new Date(state.customFrom + "T00:00:00") : new Date();
  cal.view = new Date(base.getFullYear(), base.getMonth(), 1);
  pop.hidden = false;
  const t = document.getElementById("dateTrigger");
  if (t) t.setAttribute("aria-expanded", "true");
  renderCal();
  // Fermer au clic extérieur / Échap (différé pour ne pas capter le clic courant).
  setTimeout(() => document.addEventListener("click", onCalDocClick), 0);
  document.addEventListener("keydown", onCalKey);
}

function closeCal() {
  cal.open = false;
  const pop = document.getElementById("calPopover");
  if (pop) pop.hidden = true;
  const t = document.getElementById("dateTrigger");
  if (t) t.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onCalDocClick);
  document.removeEventListener("keydown", onCalKey);
}
function onCalDocClick(e) {
  const wrap = document.getElementById("dateRangeWrap");
  if (wrap && !wrap.contains(e.target)) closeCal();
}
function onCalKey(e) { if (e.key === "Escape") closeCal(); }

// Met à jour l'UI dépendante de la plage SANS reconstruire (sinon on détruirait le
// popover ouvert) : état actif des chips, du bouton, et libellé de la plage.
function syncDateUI() {
  els.dateFilters.querySelectorAll(".datefilter").forEach(b =>
    b.classList.toggle("is-active", b.dataset.when === state.when));
  const wrap = document.getElementById("dateRangeWrap");
  if (wrap) wrap.classList.toggle("is-active", state.when === "custom");
  const lbl = document.getElementById("dateTriggerLabel");
  if (lbl) lbl.textContent = dateRangeLabel();
}

function pickDay(iso) {
  const f = state.customFrom, t = state.customTo;
  if (!f || (f && t)) {            // (re)commence une sélection
    state.customFrom = iso; state.customTo = "";
  } else if (iso < f) {            // fin avant début → on inverse
    state.customTo = f; state.customFrom = iso;
  } else {
    state.customTo = iso;
  }
  state.when = "custom";
  syncDateUI();
  renderCal();
  render();
  if (state.customFrom && state.customTo) setTimeout(closeCal, 200); // plage complète → on referme
}

// Construit le bloc d'un mois (titre + jours de semaine + grille). Les classes de
// sélection/plage ne sont PAS posées ici : c'est paintSelection() qui le fait, pour
// pouvoir les rafraîchir au survol sans reconstruire tout le calendrier.
function monthBlock(year, month, todayISO) {
  const d = new Date(year, month, 1);
  const y = d.getFullYear(), m = d.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;     // lundi = 1ère colonne
  const nbDays = new Date(y, m + 1, 0).getDate();
  let cells = "";
  for (let i = 0; i < offset; i++) cells += `<span class="cal__day cal__day--blank"></span>`;
  for (let dd = 1; dd <= nbDays; dd++) {
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const past = iso < todayISO;
    const cls = ["cal__day", past ? "is-past" : "", iso === todayISO ? "is-today" : ""].filter(Boolean).join(" ");
    cells += `<button type="button" class="${cls}" data-iso="${iso}"${past ? " disabled" : ""}>${dd}</button>`;
  }
  return `<div class="cal__month">
      <div class="cal__title">${MONTHS_LONG[m]} ${y}</div>
      <div class="cal__dow">${CAL_DOW.map(x => `<span>${x}</span>`).join("")}</div>
      <div class="cal__days">${cells}</div>
    </div>`;
}

// Pose les classes de bornes/plage sur les jours déjà rendus. Si une date de début
// est posée mais pas la fin, `hoverISO` permet de PRÉVISUALISER la plage au survol.
function paintSelection(hoverISO) {
  const f = state.customFrom, t = state.customTo;
  let lo = f, hi = t;
  if (f && !t && hoverISO) { lo = hoverISO < f ? hoverISO : f; hi = hoverISO < f ? f : hoverISO; }
  document.querySelectorAll("#calPopover .cal__day[data-iso]").forEach(el => {
    const iso = el.dataset.iso;
    el.classList.remove("is-start", "is-end", "is-sel", "is-range");
    if (lo && hi) {
      if (iso === lo) el.classList.add("is-start", "is-sel");
      if (iso === hi) el.classList.add("is-end", "is-sel");
      if (iso > lo && iso < hi) el.classList.add("is-range");
    } else if (f && iso === f) {
      el.classList.add("is-start", "is-end", "is-sel");
    }
  });
}

function renderCal() {
  const pop = document.getElementById("calPopover");
  if (!pop || !cal.open) return;
  const y = cal.view.getFullYear(), m = cal.view.getMonth();
  const todayISO = isoOf(new Date());
  const f = state.customFrom, t = state.customTo;

  pop.innerHTML = `
    <div class="cal__bar">
      <button type="button" class="cal__nav" data-nav="-1" aria-label="Mois précédent">‹</button>
      <button type="button" class="cal__nav" data-nav="1" aria-label="Mois suivant">›</button>
    </div>
    <div class="cal__months">
      ${monthBlock(y, m, todayISO)}
      ${monthBlock(y, m + 1, todayISO)}
    </div>
    <div class="cal__foot">
      <span class="cal__hint">${f && t ? "Plage sélectionnée" : f ? "Choisissez la date de fin" : "Choisissez la date de début"}</span>
      <button type="button" class="cal__clear"${f || t ? "" : " disabled"}>Effacer</button>
    </div>`;

  pop.querySelectorAll(".cal__nav").forEach(b => b.addEventListener("click", (e) => {
    e.stopPropagation();
    cal.view = new Date(y, m + Number(b.dataset.nav), 1);
    renderCal();
  }));

  const grid = pop.querySelector(".cal__months");
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".cal__day[data-iso]");
    if (!b || b.disabled) return;
    e.stopPropagation();
    pickDay(b.dataset.iso);
  });
  grid.addEventListener("mouseover", (e) => {
    const b = e.target.closest(".cal__day[data-iso]");
    if (b && !b.disabled && state.customFrom && !state.customTo) paintSelection(b.dataset.iso);
  });
  grid.addEventListener("mouseleave", () => paintSelection(null));

  pop.querySelector(".cal__clear").addEventListener("click", (e) => {
    e.stopPropagation();
    state.customFrom = ""; state.customTo = ""; state.when = "all";
    syncDateUI(); renderCal(); render();
  });

  paintSelection(null);
}

// --- Filtre par date ------------------------------------------------------
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Renvoie [débutISO, finISO] pour une période, ou null pour « Tout ».
// Semaine = du jour à dimanche inclus ; week-end = samedi+dimanche à venir.
function whenRange(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = now.getDay(); // 0 = dimanche … 6 = samedi
  if (key === "today") return [isoOf(now), isoOf(now)];
  if (key === "weekend") {
    if (dow === 0) { // dimanche : on couvre samedi → dimanche
      const sat = new Date(now); sat.setDate(now.getDate() - 1);
      return [isoOf(sat), isoOf(now)];
    }
    const sat = new Date(now); sat.setDate(now.getDate() + (6 - dow)); // samedi à venir (ou aujourd'hui si on est samedi)
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    return [isoOf(sat), isoOf(sun)];
  }
  if (key === "week") {
    const sun = new Date(now); sun.setDate(now.getDate() + ((7 - dow) % 7)); // dimanche de cette semaine
    return [isoOf(now), isoOf(sun)];
  }
  if (key === "month") {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // dernier jour du mois
    return [isoOf(now), isoOf(end)];
  }
  // Plage personnalisée : bornes ouvertes si l'une des deux dates manque.
  if (key === "custom") {
    return [state.customFrom || "0000-01-01", state.customTo || "9999-12-31"];
  }
  return null;
}

// Un événement matche la plage si son intervalle [date → endDate] la chevauche
// (couvre aussi bien les dates ponctuelles que les expos qui s'étalent).
function matchesWhen(ev, range) {
  if (!range) return true;
  const [rs, re] = range;
  const start = ev.date || "";
  const end = ev.endDate || ev.date || "";
  return start <= re && end >= rs;
}

// Filtres « date » + « recherche » seulement (on ignore la catégorie). Sert à la
// fois au filtrage des cartes et au comptage par catégorie : les badges des
// boutons doivent montrer combien d'événements chaque catégorie contiendrait
// compte tenu des autres filtres actifs, indépendamment de la catégorie choisie.
function matchesNonCategory(ev) {
  if (state.when !== "all" && !matchesWhen(ev, whenRange(state.when))) return false;
  if (state.price === "free" && !ev.free) return false;
  if (state.price === "paid" && ev.free) return false;
  if (state.resa === "yes" && !ev.reservation) return false;
  if (state.resa === "no" && ev.reservation) return false;
  if (state.query) {
    const cat = CATEGORIES[ev.category] ? CATEGORIES[ev.category].label : "";
    const hay = `${ev.title} ${ev.place} ${ev.city} ${(ev.subcats || []).join(" ")} ${cat}`.toLowerCase();
    if (!hay.includes(state.query)) return false;
  }
  return true;
}

function matches(ev) {
  if (state.favOnly && !isFav(ev)) return false;
  if (state.cats.size && !state.cats.has(ev.category)) return false;
  return matchesNonCategory(ev);
}

// Recalcule les compteurs des boutons de catégorie selon les filtres date+recherche
// en cours, et les réécrit dans le DOM (sans reconstruire la barre, pour préserver
// l'état actif et les écouteurs). Une catégorie tombée à 0 est grisée.
function updateFilterCounts() {
  const counts = {};
  let total = 0;
  for (const ev of sortedEvents) {
    if (!matchesNonCategory(ev)) continue;
    total++;
    counts[ev.category] = (counts[ev.category] || 0) + 1;
  }
  els.filters.querySelectorAll(".filter").forEach(btn => {
    const key = btn.dataset.key;
    const n = key === "all" ? total : (counts[key] || 0);
    const span = btn.querySelector(".count");
    if (span) span.textContent = n;
    btn.classList.toggle("is-empty", n === 0 && key !== "all");
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const icon = {
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 6 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-6z"/><path d="M9 7v10"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

function cardHTML(ev, i) {
  const dp = dateParts(displayDate(ev));
  const cat = CATEGORIES[ev.category] || { label: "Événement", emoji: "📌" };
  const place = [ev.place, ev.city].filter(Boolean).join(" — ");
  const badges =
    (ev.free ? `<span class="badge badge--free">Gratuit</span>` : "") +
    (ev.reservation ? `<span class="badge">${icon.ticket} Réservation</span>` : "");

  const media = ev.image
    ? `<img class="card__img" src="${escapeHtml(ev.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
          onerror="this.parentNode.classList.add('card__media--noimg');this.remove();">`
    : "";

  const fav = isFav(ev);
  return `
    <article class="card" style="animation-delay:${Math.min(i * 28, 360)}ms">
      <div class="card__media">
        ${media}
        ${isNew(ev) ? '<span class="card__new">🆕 Nouveau</span>' : ""}
        <span class="card__cat">${cat.emoji} ${escapeHtml(cat.label)}</span>
        <span class="card__date"><span class="day">${dp.day}</span><span class="month">${dp.month}</span></span>
        <button class="fav-btn ${fav ? "is-fav" : ""}" data-i="${i}" aria-pressed="${fav}"
          aria-label="${fav ? "Retirer des favoris" : "Ajouter aux favoris"}" title="${fav ? "Retirer des favoris" : "Ajouter aux favoris"}">${HEART}</button>
      </div>
      <div class="card__body">
        <h2>${escapeHtml(ev.title)}</h2>
        ${badges ? `<div class="card__badges">${badges}</div>` : ""}
        <div class="card__meta">
          <div>${icon.clock}<span>${escapeHtml(dateLabel(ev))}</span></div>
          ${place ? `<div>${icon.pin}<span>${escapeHtml(place)}</span></div>` : ""}
        </div>
        ${ev.url ? `<a class="card__cta" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener" data-i="${i}">
          Plus d'infos ${icon.arrow}
        </a>` : ""}
      </div>
    </article>`;
}

let renderList = [];
function render() {
  renderList = sortedEvents.filter(matches);
  // Titre de bascule mono-jour → multi-jours (1er multi-jours de la liste triée).
  const firstMulti = renderList.findIndex(isMulti);
  els.grid.innerHTML = renderList.map((ev, i) =>
    (i === firstMulti ? `<h2 class="nouv-group">📆 Sur plusieurs jours<span>${renderList.length - firstMulti}</span></h2>` : "")
    + cardHTML(ev, i)).join("");
  els.empty.hidden = renderList.length > 0;
  if (renderList.length === 0 && state.favOnly) {
    els.empty.textContent = "Aucun favori. Cliquez sur le ♥ d'une carte pour l'ajouter ici.";
  }
  const n = renderList.length;
  els.count.textContent = n === 0 ? "" : `${n} événement${n > 1 ? "s" : ""} à venir`;
  els.grid.querySelectorAll(".fav-btn").forEach(btn =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); onToggleFav(renderList[Number(btn.dataset.i)], btn); }));
  // Compteur de clics (events utilisateurs) : ouverture de fiche = clic "Plus d'infos".
  els.grid.querySelectorAll(".card__cta").forEach(a =>
    a.addEventListener("click", () => { if (window.trackUserEventClick) trackUserEventClick(renderList[Number(a.dataset.i)]); }));
  updateFilterCounts();
}

// Bascule un favori : maj du cœur en place ; re-rendu seulement en mode favoris.
function onToggleFav(ev, btn) {
  if (!ev) return;
  toggleFav(ev);
  syncToolbar();
  if (state.favOnly) { render(); return; }
  const f = isFav(ev);
  btn.classList.toggle("is-fav", f);
  btn.setAttribute("aria-pressed", String(f));
  btn.setAttribute("aria-label", f ? "Retirer des favoris" : "Ajouter aux favoris");
  btn.title = f ? "Retirer des favoris" : "Ajouter aux favoris";
}

// Favoris : compteur (le bouton vit dans la barre d'outils).
function favCount() { return sortedEvents.filter(isFav).length; }

let searchTimer;
els.search.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  }, 120);
});

// Date de mise à jour dans le pied de page.
if (typeof GENERATED_AT === "string") {
  const note = document.getElementById("footerNote");
  if (note) {
    const [y, m, d] = GENERATED_AT.split("-").map(Number);
    note.insertAdjacentHTML("beforeend",
      ` · Mis à jour le ${d} ${MONTHS_LONG[m - 1]} ${y}`);
  }
}

buildDateFilters();
buildFilters();
buildToolbar();
render();

// Fusion asynchrone des événements approuvés soumis par les utilisateurs (Supabase).
if (window.loadApprovedUserEvents) {
  loadApprovedUserEvents().then((extra) => {
    if (!extra || !extra.length) return;
    sortedEvents = buildSorted(extra);
    buildFilters();
    render();
  });
}
