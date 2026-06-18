// Vue « Galerie des affiches » : mur de posters filtrable, clic → affiche en
// grand (lightbox). Réutilise les données (CATEGORIES, EVENTS) de data.js et la
// même logique de filtres que la vue Cartes (catégorie, date, tarif, réservation).

const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN",
  "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

const state = { query: "", filter: "all", when: "all", customFrom: "", customTo: "", price: "all", resa: "all", favOnly: false };

const els = {
  filters: document.getElementById("filters"),
  dateFilters: document.getElementById("dateFilters"),
  toolbar: document.getElementById("toolbar"),
  gallery: document.getElementById("gallery"),
  empty: document.getElementById("empty"),
  count: document.getElementById("resultsCount"),
  search: document.getElementById("search"),
  lightbox: document.getElementById("lightbox"),
  lightboxInner: document.getElementById("lightboxInner"),
  lightboxClose: document.getElementById("lightboxClose"),
};

// ---------- Dédoublonnage (même logique que la vue Cartes) ----------
function normKey(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }

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
    if (venues.length <= 1) merged.push(mergeOcc(occ));
    else venues.forEach((v, i) => merged.push(mergeOcc(occ.filter(e =>
      normKey(e.place) === v || (i === 0 && !normKey(e.place))))));
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

// ── Nouveautés ──────────────────────────────────────────────────────────────
// Un événement est « nouveau » pendant 7 JOURS à compter de son AJOUT sur une
// source (champ addedAt posé par update-events.js, indexé sur l'uuid stable).
// Le ruban 🆕 apparaît partout (galerie + cartes) et la page Nouveautés
// (body[data-view="nouveautes"]) liste ces ajouts des 7 derniers jours.
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const NEW_SINCE_ISO = daysAgoISO(7);
const isNew = (ev) => !!(ev.addedAt && ev.addedAt >= NEW_SINCE_ISO);
const NOUVEAUTES = document.body.dataset.view === "nouveautes";

// Un événement est « multi-jours » si sa date de fin tombe un jour APRÈS son
// début (comparaison sur la partie date seule, pas l'horaire).
const isMulti = (ev) => { const s = (ev.date || "").slice(0, 10), e = (ev.endDate || "").slice(0, 10); return !!e && e > s; };
// Tri : d'abord TOUS les mono-jour (par date croissante), puis TOUS les
// multi-jours (par date croissante). render() insère un titre à la bascule.
const sortedEvents = dedupEvents(EVENTS).filter(notPast).sort((a, b) =>
  (isMulti(a) - isMulti(b)) || (a.date || "").localeCompare(b.date || ""));

// ---------- Favoris (persistés dans le navigateur via localStorage) ----------
// Clé stable = titre + date (le data.js de prod est minifié SANS uuid). On stocke
// {clé: endDate} : au chargement on PURGE les favoris dont l'événement est passé.
const FAV_KEY = "agenda-nancy:favoris";
const HEART = '<svg viewBox="0 0 24 24" class="heart" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
function favLoad() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch (e) { return {}; } }
function favSave() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {} }
let favs = favLoad();
(function prunePast() { let ch = false; for (const k of Object.keys(favs)) if ((favs[k] || "") < TODAY_ISO) { delete favs[k]; ch = true; } if (ch) favSave(); })();
function favKey(ev) { return normKey(ev.title) + "|" + (ev.date || ""); }
function isFav(ev) { return favKey(ev) in favs; }
function toggleFav(ev) {
  const k = favKey(ev);
  if (k in favs) delete favs[k]; else favs[k] = ev.endDate || ev.date || "";
  favSave();
}

// ---------- Dates ----------
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
function displayDate(ev) {
  const start = ev.date || "", end = ev.endDate || start;
  let lower = isoOf(new Date());
  const r = state.when !== "all" ? whenRange(state.when) : null;
  if (r && r[0] && r[0] > lower) lower = r[0];
  return (start < lower && end >= lower) ? lower : start;
}
function dateLabel(ev) {
  const start = ev.date || "", end = ev.endDate || start, today = isoOf(new Date());
  let base;
  if (end && end !== start) base = start > today ? `Du ${fmtLong(start)} au ${fmtLong(end)}` : `Jusqu'au ${fmtLong(end)}`;
  else base = ev.dateText || fmtLong(start);
  if (ev.schedule) base += (base ? " · " : "") + ev.schedule;
  return base || "Date à venir";
}

// Plages des chips de période.
function whenRange(when) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const today = isoOf(now);
  if (when === "today") return [today, today];
  if (when === "weekend") {
    const d = now.getDay();                       // 0=dim … 6=sam
    const toSat = (6 - d + 7) % 7;
    const sat = new Date(now); sat.setDate(now.getDate() + (d === 0 ? -1 : toSat));
    const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
    return [isoOf(sat), isoOf(sun)];
  }
  if (when === "custom") return [state.customFrom || "0000-01-01", state.customTo || "9999-12-31"];
  return null;
}
function matchesWhen(ev, range) {
  if (!range) return true;
  const [from, to] = range, start = ev.date || "", end = ev.endDate || start;
  return start <= to && end >= from;
}

// ---------- Filtres ----------
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
  if (state.filter !== "all" && ev.category !== state.filter) return false;
  return matchesNonCategory(ev);
}

function buildFilters() {
  const counts = {};
  for (const ev of sortedEvents) counts[ev.category] = (counts[ev.category] || 0) + 1;
  const buttons = [
    { key: "all", label: "Tout", emoji: "✨", n: sortedEvents.length },
    ...Object.entries(CATEGORIES).filter(([k]) => counts[k])
      .map(([k, c]) => ({ key: k, label: c.label, emoji: c.emoji, n: counts[k] })),
  ];
  els.filters.innerHTML = buttons.map(b => `
    <button class="filter ${b.key === state.filter ? "is-active" : ""}" data-key="${b.key}">
      <span>${b.emoji}</span>${escapeHtml(b.label)} <span class="count">${b.n}</span>
    </button>`).join("");
  els.filters.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click", () => {
    state.filter = btn.dataset.key;
    els.filters.querySelectorAll(".filter").forEach(b => b.classList.toggle("is-active", b === btn));
    render();
  }));
}

// Bouton « Choisir des dates » identique à la vue Cartes (cohérence visuelle),
// ouvrant un petit popover propre avec deux champs Du/au.
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cal-ico"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const CAL_DOW = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const cal = { view: null };                       // mois affiché (1er du mois)
const frDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS_LONG[m - 1]}`; };
function dateRangeLabel() {
  const f = state.customFrom, t = state.customTo;
  if (f && t) return f === t ? frDay(f) : `${frDay(f)} – ${frDay(t)}`;
  if (f) return `Dès le ${frDay(f)}`;
  if (t) return `Jusqu'au ${frDay(t)}`;
  return "Choisir des dates";
}

let dpOpen = false;
function openDatePop() {
  const p = document.getElementById("datePop"); if (!p) return;
  const base = state.customFrom ? new Date(state.customFrom + "T00:00:00") : new Date();
  cal.view = new Date(base.getFullYear(), base.getMonth(), 1);
  p.hidden = false; dpOpen = true;
  document.getElementById("dateTrigger").setAttribute("aria-expanded", "true");
  renderCal();
}

// Construit le bloc d'un mois (titre + jours). Les classes de sélection/plage sont
// posées par paintSelection (pour les rafraîchir au survol sans tout reconstruire).
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

// Pose bornes/plage sur les jours rendus ; hoverISO = prévisualisation au survol.
function paintSelection(hoverISO) {
  const f = state.customFrom, t = state.customTo;
  let lo = f, hi = t;
  if (f && !t && hoverISO) { lo = hoverISO < f ? hoverISO : f; hi = hoverISO < f ? f : hoverISO; }
  document.querySelectorAll("#datePop .cal__day[data-iso]").forEach(el => {
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

function pickDay(iso) {
  const f = state.customFrom, t = state.customTo;
  if (!f || (f && t)) { state.customFrom = iso; state.customTo = ""; }
  else if (iso < f) { state.customTo = f; state.customFrom = iso; }
  else { state.customTo = iso; }
  state.when = "custom";
  syncDateUI(); renderCal(); render();
  if (state.customFrom && state.customTo) setTimeout(closeDatePop, 200);   // plage complète → on referme
}

// Rend les DEUX mois côte à côte (le 2e est masqué par CSS sous 600px).
function renderCal() {
  const pop = document.getElementById("datePop");
  if (!pop || !dpOpen) return;
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
function closeDatePop() {
  const p = document.getElementById("datePop"); if (p) p.hidden = true;
  dpOpen = false;
  const t = document.getElementById("dateTrigger"); if (t) t.setAttribute("aria-expanded", "false");
}

// Met à jour l'état visuel (chips actives, libellé + actif du bouton dates) sans
// reconstruire la barre → le popover reste ouvert pendant qu'on règle les dates.
function syncDateUI() {
  els.dateFilters.querySelectorAll(".datefilter").forEach(b =>
    b.classList.toggle("is-active", state.when === b.dataset.when));
  const wrap = els.dateFilters.querySelector("#dateRangeWrap");
  if (wrap) wrap.classList.toggle("is-active", !!(state.customFrom || state.customTo));
  const lbl = document.getElementById("dateTriggerLabel");
  if (lbl) lbl.textContent = dateRangeLabel();
}

function buildDateFilters() {
  const chips = [
    { key: "all", label: "Tout" },
    { key: "today", label: "Aujourd'hui" },
    { key: "weekend", label: "Ce week-end" },
  ];
  const chipsHTML = chips.map(c =>
    `<button class="datefilter ${c.key === state.when ? "is-active" : ""}" data-when="${c.key}">${c.label}</button>`).join("");

  els.dateFilters.innerHTML = chipsHTML + `
    <span class="daterange ${state.customFrom || state.customTo ? "is-active" : ""}" id="dateRangeWrap">
      <button type="button" class="daterange__trigger" id="dateTrigger" aria-haspopup="dialog" aria-expanded="false">
        ${CAL_ICON}<span id="dateTriggerLabel">${escapeHtml(dateRangeLabel())}</span>
      </button>
      <button type="button" class="daterange__clear" id="dateClear" aria-label="Effacer les dates" title="Effacer">×</button>
      <div class="cal" id="datePop" role="dialog" aria-label="Choisir une plage de dates" hidden></div>
    </span>`;

  els.dateFilters.querySelectorAll(".datefilter").forEach(btn => btn.addEventListener("click", () => {
    state.when = btn.dataset.when;
    state.customFrom = ""; state.customTo = "";
    closeDatePop();
    syncDateUI();
    render();
  }));

  els.dateFilters.querySelector("#dateTrigger")
    .addEventListener("click", (e) => { e.stopPropagation(); dpOpen ? closeDatePop() : openDatePop(); });
  els.dateFilters.querySelector("#dateClear").addEventListener("click", (e) => {
    e.stopPropagation();
    state.customFrom = ""; state.customTo = ""; state.when = "all";
    closeDatePop(); syncDateUI(); render();
  });
  // Le calendrier (deux mois) câble lui-même ses jours/navigation dans renderCal().
}

// Fermeture du popover dates : clic à l'extérieur ou Échap (ajouté une seule fois).
document.addEventListener("click", (e) => { if (dpOpen && !e.target.closest("#dateRangeWrap")) closeDatePop(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && dpOpen) closeDatePop(); });

// ---------- Barre d'outils : « Recherche avancée » (tarif + réservation) + « Mes favoris » ----------
// Le tarif et la réservation sont des filtres secondaires : on les range dans un
// popover « Recherche avancée », à côté du bouton « Mes favoris ». Les catégories,
// elles, restent toujours visibles (filtre principal).
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

// Maj de l'état visuel de la barre (badge filtres actifs, segments, favoris) sans
// reconstruire → le popover reste ouvert pendant le réglage.
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

// Fermeture du popover « Recherche avancée » : clic extérieur ou Échap.
document.addEventListener("click", (e) => { if (advOpen && !e.target.closest("#advWrap")) closeAdvPop(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && advOpen) closeAdvPop(); });

// ---------- Rendu galerie ----------
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let visible = [];

function tileHTML(ev, i) {
  const dp = dateParts(displayDate(ev));
  // Multi-jours : la pastille affiche la plage (jour de début → jour/mois de fin).
  const ep = isMulti(ev) ? dateParts((ev.endDate || "").slice(0, 10)) : null;
  const dateHTML = ep
    ? `<span class="poster__date poster__date--range"><span class="day">${dp.day}</span><span class="month">${dp.month}</span><span class="poster__dateend">→ ${ep.day} ${ep.month}</span></span>`
    : `<span class="poster__date"><span class="day">${dp.day}</span><span class="month">${dp.month}</span></span>`;
  const cat = CATEGORIES[ev.category] || { label: "Événement", emoji: "📌" };
  const media = ev.image
    ? `<img class="poster__img" src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
         onerror="this.closest('.poster').classList.add('poster--noimg');this.remove();">`
    : "";
  const fav = isFav(ev);
  return `
    <div class="poster-wrap">
      <button class="poster ${ev.image ? "" : "poster--noimg"} ${isNew(ev) ? "poster--new" : ""}" data-i="${i}" style="animation-delay:${Math.min(i * 20, 300)}ms" aria-label="${escapeHtml(ev.title)}">
        ${media}
        ${isNew(ev) ? '<span class="poster__new">🆕 Nouveau</span>' : ""}
        <span class="poster__cat">${cat.emoji} ${escapeHtml(cat.label)}</span>
        ${dateHTML}
        <span class="poster__fallback">${escapeHtml(ev.title)}</span>
        <span class="poster__overlay"><span class="poster__title">${escapeHtml(ev.title)}</span></span>
      </button>
      <button class="fav-btn ${fav ? "is-fav" : ""}" data-i="${i}" aria-pressed="${fav}"
        aria-label="${fav ? "Retirer des favoris" : "Ajouter aux favoris"}" title="${fav ? "Retirer des favoris" : "Ajouter aux favoris"}">${HEART}</button>
    </div>`;
}

// Bascule un favori depuis une carte : maj du cœur en place (pas de re-rendu
// complet, sauf en mode « favoris seuls » où la carte doit disparaître).
function onToggleFav(ev, btn) {
  toggleFav(ev);
  syncToolbar();
  if (state.favOnly) { render(); return; }
  const f = isFav(ev);
  btn.classList.toggle("is-fav", f);
  btn.setAttribute("aria-pressed", String(f));
  btn.setAttribute("aria-label", f ? "Retirer des favoris" : "Ajouter aux favoris");
  btn.title = f ? "Retirer des favoris" : "Ajouter aux favoris";
}

// Recalcule les compteurs des boutons de catégorie selon les filtres ACTIFS
// (date, recherche, tarif, réservation, favoris) — tout sauf la catégorie
// elle-même —, puis les réécrit sans reconstruire la barre (préserve l'état actif).
function updateFilterCounts() {
  const counts = {};
  let total = 0;
  for (const ev of sortedEvents) {
    if (state.favOnly && !isFav(ev)) continue;
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

// Page « Nouveautés » : ajouts des 7 derniers jours (nouvel événement apparu sur
// une source), groupés par récence et triés du plus récent au plus ancien.
// Réutilise tileHTML + la lightbox.
function renderNouveautes() {
  const base = sortedEvents
    .filter(ev => ev.addedAt && ev.addedAt >= NEW_SINCE_ISO)
    .filter(matchesNonCategory)
    .sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || (a.date || "").localeCompare(b.date || ""));
  const groups = [
    { label: "Ajoutés aujourd'hui", test: e => e.addedAt === TODAY_ISO },
    { label: "Ajoutés ces 7 derniers jours", test: e => e.addedAt < TODAY_ISO && e.addedAt >= NEW_SINCE_ISO },
  ];
  visible = [];
  let html = "";
  for (const g of groups) {
    const items = base.filter(g.test);
    if (!items.length) continue;
    html += `<h2 class="nouv-group">${g.label}<span>${items.length}</span></h2>`;
    for (const ev of items) html += tileHTML(ev, visible.push(ev) - 1);
  }
  els.gallery.innerHTML = html;
  els.empty.hidden = visible.length > 0;
  if (!visible.length) els.empty.textContent =
    "Aucune nouveauté ces 7 derniers jours pour le moment. Revenez bientôt : de nouveaux événements sont ajoutés régulièrement !";
  els.count.textContent = visible.length ? `${visible.length} nouveauté${visible.length > 1 ? "s" : ""}` : "";
  els.gallery.querySelectorAll(".poster").forEach(btn =>
    btn.addEventListener("click", () => openLightbox(visible[Number(btn.dataset.i)])));
  els.gallery.querySelectorAll(".fav-btn").forEach(btn =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); onToggleFav(visible[Number(btn.dataset.i)], btn); }));
}

function render() {
  if (NOUVEAUTES) return renderNouveautes();
  visible = sortedEvents.filter(matches);
  // Titre de bascule mono-jour → multi-jours (1er multi-jours de la liste triée).
  const firstMulti = visible.findIndex(isMulti);
  els.gallery.innerHTML = visible.map((ev, i) =>
    (i === firstMulti ? `<h2 class="nouv-group">📆 Sur plusieurs jours<span>${visible.length - firstMulti}</span></h2>` : "")
    + tileHTML(ev, i)).join("");
  els.empty.hidden = visible.length > 0;
  if (visible.length === 0) {
    els.empty.textContent = state.favOnly
      ? "Aucun favori. Cliquez sur le ♥ d'une affiche pour l'ajouter ici."
      : "Aucun événement ne correspond à votre recherche. Essayez un autre filtre ou un autre mot-clé.";
  }
  els.count.textContent = visible.length ? `${visible.length} affiche${visible.length > 1 ? "s" : ""}` : "";
  updateFilterCounts();
  els.gallery.querySelectorAll(".poster").forEach(btn =>
    btn.addEventListener("click", () => openLightbox(visible[Number(btn.dataset.i)])));
  els.gallery.querySelectorAll(".fav-btn").forEach(btn =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); onToggleFav(visible[Number(btn.dataset.i)], btn); }));
}

// ---------- Favoris : compteur (le bouton vit dans la barre d'outils) ----------
function favCount() { return sortedEvents.filter(isFav).length; }

// ---------- Lightbox ----------
const lbIcon = {
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 6 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-6z"/><path d="M9 7v10"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

function openLightbox(ev) {
  const cat = CATEGORIES[ev.category] || { label: "Événement", emoji: "📌" };
  const place = [ev.place, ev.city].filter(Boolean).join(" — ");
  const badges =
    (ev.free ? `<span class="badge badge--free">Gratuit</span>` : "") +
    (ev.reservation ? `<span class="badge">${lbIcon.ticket} Réservation</span>` : "");
  const media = ev.image
    ? `<div class="lightbox__media"><img src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.title)}" decoding="async" fetchpriority="high" referrerpolicy="no-referrer"></div>`
    : "";
  els.lightboxInner.innerHTML = `
    ${media}
    <div class="lightbox__info">
      <span class="lightbox__cat">${cat.emoji} ${escapeHtml(cat.label)}</span>
      <h2>${escapeHtml(ev.title)}</h2>
      ${badges ? `<div class="card__badges">${badges}</div>` : ""}
      <div class="card__meta">
        <div>${lbIcon.clock}<span>${escapeHtml(dateLabel(ev))}</span></div>
        ${place ? `<div>${lbIcon.pin}<span>${escapeHtml(place)}</span></div>` : ""}
      </div>
      <div class="lightbox__actions">
        ${ev.url ? `<a class="lightbox__cta" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener">Plus d'infos ${lbIcon.arrow}</a>` : ""}
        <button class="lightbox__fav ${isFav(ev) ? "is-fav" : ""}" id="lbFav" aria-pressed="${isFav(ev)}">${HEART}<span>${isFav(ev) ? "Dans vos favoris" : "Ajouter aux favoris"}</span></button>
      </div>
    </div>`;
  const lbFav = els.lightboxInner.querySelector("#lbFav");
  if (lbFav) lbFav.addEventListener("click", () => {
    toggleFav(ev);
    const f = isFav(ev);
    lbFav.classList.toggle("is-fav", f);
    lbFav.setAttribute("aria-pressed", String(f));
    lbFav.querySelector("span").textContent = f ? "Dans vos favoris" : "Ajouter aux favoris";
    syncToolbar();
  });
  els.lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  lbOpen = true;
  // Empile une entrée d'historique pour que le bouton « retour » (Android) ou
  // le geste de retour (iOS) FERME l'affiche au lieu de quitter le site.
  history.pushState({ lb: true }, "");
  els.lightboxClose.focus();
}

let lbOpen = false;

// Masquage réel (DOM + scroll). Appelé via popstate, donc unique point de sortie.
function hideLightbox() {
  lbOpen = false;
  els.lightbox.hidden = true;
  els.lightboxInner.innerHTML = "";
  document.body.style.overflow = "";
  // En mode « favoris seuls », un favori retiré depuis la lightbox doit
  // disparaître de la grille à la fermeture.
  if (state.favOnly) render();
}

// Fermeture demandée par l'utilisateur (croix, fond, Échap) : on « revient en
// arrière » → popstate déclenche hideLightbox (même chemin que le bouton retour).
function closeLightbox() {
  if (lbOpen && history.state && history.state.lb) history.back();
  else hideLightbox();
}

window.addEventListener("popstate", () => { if (lbOpen) hideLightbox(); });
els.lightboxClose.addEventListener("click", closeLightbox);
els.lightbox.addEventListener("click", e => { if (e.target === els.lightbox) closeLightbox(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && lbOpen) closeLightbox(); });

let searchTimer;
els.search.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); render(); }, 120);
});

// Sur la page Nouveautés : pas de filtres date/catégorie/avancés ni barre d'outils,
// juste la recherche + la liste groupée par récence.
if (NOUVEAUTES) {
  render();
} else {
  buildDateFilters();
  buildFilters();
  buildToolbar();
  render();
}
