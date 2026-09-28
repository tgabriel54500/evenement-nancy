// Vue « Galerie des affiches » : mur de posters filtrable, clic → affiche en
// grand (lightbox). Réutilise les données (CATEGORIES, EVENTS) de data.js et la
// même logique de filtres que la vue Cartes (catégorie, date, tarif, réservation).

// Cœur commun (MONTHS, dédoublonnage, dates, ruban Nouveautés, favoris) : events-core.js.
const state = { query: "", filter: "all", sel: "all", when: "all", customFrom: "", customTo: "", price: "all", resa: "all", favOnly: false };

const els = {
  filters: document.getElementById("filters"),
  dateFilters: document.getElementById("dateFilters"),
  toolbar: document.getElementById("toolbar"),
  gallery: document.getElementById("gallery"),
  selections: document.getElementById("selections"),
  empty: document.getElementById("empty"),
  count: document.getElementById("resultsCount"),
  search: document.getElementById("search"),
  lightbox: document.getElementById("lightbox"),
  lightboxInner: document.getElementById("lightboxInner"),
  lightboxClose: document.getElementById("lightboxClose"),
};

// normKey / mergeOcc / dedupEvents / TODAY_ISO / notPast / isNew / isMulti /
// sortEvents / buildSorted / sortedEvents / favoris → definis dans events-core.js.
const NOUVEAUTES = document.body.dataset.view === "nouveautes";

// ---------- Dates ----------
const WEEKDAYS_SHORT = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dateParts(iso) {
  if (!iso) return { day: "?", month: "" };
  const [y, m, d] = iso.split("-").map(Number);
  // Jour de la semaine en date LOCALE (new Date(y, m-1, d)), pas en UTC : un
  // new Date("2026-09-16") serait minuit UTC et pourrait basculer la veille.
  const wd = WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()] || "";
  return { day: d, month: MONTHS_SHORT[m - 1] || "", wd };
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
  if (when === "week" || when === "month") {
    const end = new Date(now); end.setDate(now.getDate() + (when === "week" ? 6 : 29));
    return [today, isoOf(end)];
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
  if (state.sel !== "all" && !(ev.tags || []).includes(state.sel)) return false;
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
    { key: "week", label: "Cette semaine" },
    { key: "month", label: "Ce mois-ci" },
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

// ---------- Barre de filtres compacte + panneau (demande user 2026-09-16) ----------
// L'accueil empilait 5 blocs (dates, sélections, catégories, recherche avancée,
// favoris) avant la première affiche, surtout sur téléphone. On les range dans UNE
// rangée de pastilles (Quand · Sélections · Catégories · Filtres · ♥) ; chaque
// pastille ouvre un panneau (feuille du bas sur mobile, fenêtre centrée sur ordi)
// qui contient les blocs d'origine, déplacés tels quels (mêmes gestionnaires).
const SLIDERS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tool-ico"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="tool-chev"><path d="M6 9l6 6 6-6"/></svg>';
const IS_SPORT = document.body.dataset.view === "sport";

const ADV_GROUPS = [
  { key: "price", label: "Tarif", opts: [{ v: "all", t: "Tous" }, { v: "free", t: "🆓 Gratuit" }, { v: "paid", t: "💶 Payant" }] },
  { key: "resa", label: "Réservation", opts: [{ v: "all", t: "Toutes" }, { v: "no", t: "Accès libre" }, { v: "yes", t: "🎟️ Sur réservation" }] },
];
function advCount() { return (state.price !== "all" ? 1 : 0) + (state.resa !== "all" ? 1 : 0); }

const SHEETS = {
  when: { title: "Quand ?" },
  sel:  { title: "Sélections" },
  cat:  { title: IS_SPORT ? "Sports" : "Catégories" },
  more: { title: "Filtres" },
};
const bar = { el: null, sheet: null, open: null };

function buildBar() {
  const main = els.dateFilters.parentNode;
  bar.el = document.createElement("div");
  bar.el.className = "fbar";
  bar.el.innerHTML = `
    <div class="fbar__row" role="toolbar" aria-label="Filtres">
      <button type="button" class="fpill" data-sheet="when" aria-haspopup="dialog">${CAL_ICON}<span class="fpill__txt"></span>${CHEVRON_ICON}</button>
      <button type="button" class="fpill" data-sheet="cat" aria-haspopup="dialog"><span class="fpill__txt"></span>${CHEVRON_ICON}</button>
      <button type="button" class="fpill" data-sheet="sel" aria-haspopup="dialog"><span class="fpill__txt"></span>${CHEVRON_ICON}</button>
      <button type="button" class="fpill" data-sheet="more" id="advTrigger" aria-haspopup="dialog">${SLIDERS_ICON}<span class="fpill__txt">Filtres</span><span class="tool-badge" id="advBadge" hidden>0</span></button>
      <button type="button" class="fpill fpill--fav favtoggle" id="favToggle" aria-pressed="false" aria-label="Mes favoris">${HEART}<span class="fpill__lbl">Favoris</span><span class="count" hidden>0</span></button>
      <button type="button" class="fpill fpill--reset" id="barReset" hidden>✕ Effacer</button>
    </div>`;
  main.insertBefore(bar.el, els.dateFilters);

  bar.sheet = document.createElement("div");
  bar.sheet.className = "fsheet";
  bar.sheet.hidden = true;
  bar.sheet.innerHTML = `
    <div class="fsheet__backdrop" data-close></div>
    <div class="fsheet__panel" role="dialog" aria-modal="true" aria-labelledby="fsheetTitle">
      <div class="fsheet__head">
        <span class="fsheet__grip" aria-hidden="true"></span>
        <h2 class="fsheet__title" id="fsheetTitle"></h2>
        <button type="button" class="fsheet__close" data-close aria-label="Fermer">&times;</button>
      </div>
      <div class="fsheet__body">
        <section class="fsheet__sec" data-sec="when"></section>
        <section class="fsheet__sec" data-sec="sel"></section>
        <section class="fsheet__sec" data-sec="cat"></section>
        <section class="fsheet__sec" data-sec="more"><div class="adv-sheet" id="advSheet"></div></section>
      </div>
      <div class="fsheet__foot">
        <button type="button" class="fsheet__clear" id="sheetClear">Effacer</button>
        <button type="button" class="fsheet__go" data-close id="sheetGo">Voir les affiches</button>
      </div>
    </div>`;
  document.body.appendChild(bar.sheet);
  const sec = (k) => bar.sheet.querySelector(`[data-sec="${k}"]`);
  sec("when").appendChild(els.dateFilters);
  if (els.selections) sec("sel").appendChild(els.selections);
  sec("cat").appendChild(els.filters);

  bar.el.querySelectorAll(".fpill[data-sheet]").forEach(b =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openSheet(b.dataset.sheet); }));
  bar.sheet.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeSheet));
  bar.el.querySelector("#barReset").addEventListener("click", () => resetFilters(null));
  bar.sheet.querySelector("#sheetClear").addEventListener("click", () => resetFilters(bar.open));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && bar.open && !dpOpen) closeSheet(); });

  // Choix unique (catégorie, sélection, raccourci de date) → on referme aussitôt :
  // le visiteur voit directement le résultat. Le calendrier et « Filtres » restent ouverts.
  const autoClose = (sel) => (e) => { if (e.target.closest(sel)) setTimeout(closeSheet, 160); };
  els.filters.addEventListener("click", autoClose(".filter"));
  els.dateFilters.addEventListener("click", autoClose(".datefilter"));
  if (els.selections) els.selections.addEventListener("click", autoClose(".selection"));
}

function openSheet(key) {
  if (!bar.sheet) return;
  bar.open = key;
  bar.sheet.querySelectorAll(".fsheet__sec").forEach(s => { s.hidden = s.dataset.sec !== key; });
  bar.sheet.querySelector("#fsheetTitle").textContent = SHEETS[key].title;
  bar.sheet.hidden = false;
  document.body.classList.add("has-sheet");
  bar.el.querySelectorAll(".fpill[data-sheet]").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.sheet === key)));
  syncBar();
  const first = bar.sheet.querySelector(`[data-sec="${key}"] .is-active, [data-sec="${key}"] button`);
  if (first) first.focus({ preventScroll: true });
}
function closeSheet() {
  if (!bar.sheet || bar.sheet.hidden) return;
  if (typeof closeDatePop === "function") closeDatePop();
  bar.sheet.hidden = true;
  document.body.classList.remove("has-sheet");
  const trig = bar.el.querySelector(`.fpill[data-sheet="${bar.open}"]`);
  bar.el.querySelectorAll(".fpill[data-sheet]").forEach(b => b.setAttribute("aria-expanded", "false"));
  bar.open = null;
  if (trig) trig.focus({ preventScroll: true });
}

// Remise à zéro : d'un seul panneau (bouton du bas) ou de tout (pastille « Effacer »).
function resetFilters(only) {
  const all = !only;
  if (all || only === "when") { state.when = "all"; state.customFrom = ""; state.customTo = ""; if (typeof closeDatePop === "function") closeDatePop(); syncDateUI(); }
  if (all || only === "sel") {
    state.sel = "all";
    if (els.selections) els.selections.querySelectorAll(".selection").forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-pressed", "false"); });
  }
  if (all || only === "cat") {
    state.filter = "all";
    els.filters.querySelectorAll(".filter").forEach(b => b.classList.toggle("is-active", b.dataset.key === "all"));
  }
  if (all || only === "more") { state.price = "all"; state.resa = "all"; }
  syncToolbar();
  render();
}

// Libellés des pastilles = valeur choisie (« Ce week-end », « 🎸 Musiques »…).
function syncBar() {
  if (!bar.el) return;
  const pill = (k) => bar.el.querySelector(`.fpill[data-sheet="${k}"]`);
  const setPill = (k, txt, on) => { const p = pill(k); p.querySelector(".fpill__txt").textContent = txt; p.classList.toggle("is-active", on); };

  const WHEN = { all: "Quand ?", today: "Aujourd'hui", weekend: "Ce week-end", week: "Cette semaine", month: "Ce mois-ci" };
  setPill("when", state.when === "custom" ? dateRangeLabel() : WHEN[state.when] || "Quand ?", state.when !== "all");

  const hasSel = els.selections && !els.selections.hidden;
  pill("sel").hidden = !hasSel;
  const s = SELECTIONS.find(x => x.key === state.sel);
  setPill("sel", s ? `${s.emoji} ${s.label}` : "✨ Sélections", !!s);

  const c = CATEGORIES[state.filter];
  setPill("cat", c ? `${c.emoji} ${c.label}` : (IS_SPORT ? "🏅 Sports" : "🎭 Catégories"), !!c);

  const any = state.when !== "all" || state.sel !== "all" || state.filter !== "all" || advCount() > 0;
  bar.el.querySelector("#barReset").hidden = !any;

  if (bar.open) {
    const n = visible.length;
    bar.sheet.querySelector("#sheetGo").textContent = n ? `Voir ${n} affiche${n > 1 ? "s" : ""}` : "Aucun résultat";
    const dirty = { when: state.when !== "all", sel: state.sel !== "all", cat: state.filter !== "all", more: advCount() > 0 }[bar.open];
    bar.sheet.querySelector("#sheetClear").disabled = !dirty;
  }
}

// Maj de l'état visuel (badge, segments, favoris) sans reconstruire.
function syncToolbar() {
  const n = advCount();
  const badge = document.getElementById("advBadge");
  if (badge) { badge.textContent = n; badge.hidden = n === 0; }
  const trig = document.getElementById("advTrigger");
  if (trig) trig.classList.toggle("is-active", n > 0);
  document.querySelectorAll("#advSheet .seg__btn").forEach(b =>
    b.classList.toggle("is-active", state[b.dataset.group] === b.dataset.val));
  const fav = document.getElementById("favToggle");
  if (fav) {
    const c = favCount();
    fav.classList.toggle("is-active", state.favOnly);
    fav.setAttribute("aria-pressed", String(state.favOnly));
    const cnt = fav.querySelector(".count");
    if (cnt) { cnt.textContent = c; cnt.hidden = c === 0; }
  }
  syncBar();
}

function buildToolbar() {
  if (els.toolbar) els.toolbar.remove();          // remplacé par la barre compacte
  const adv = document.getElementById("advSheet");
  adv.innerHTML = ADV_GROUPS.map(g => `
    <div class="adv-group">
      <span class="adv-label">${g.label}</span>
      <div class="seg" role="group" aria-label="${g.label}">
        ${g.opts.map(o => `<button type="button" class="seg__btn ${state[g.key] === o.v ? "is-active" : ""}" data-group="${g.key}" data-val="${o.v}">${o.t}</button>`).join("")}
      </div>
    </div>`).join("");
  adv.querySelectorAll(".seg__btn").forEach(btn => btn.addEventListener("click", () => {
    state[btn.dataset.group] = btn.dataset.val;
    syncToolbar();
    render();
  }));
  document.getElementById("favToggle").addEventListener("click", () => {
    state.favOnly = !state.favOnly;
    syncToolbar(); render();
  });
  syncToolbar();
}

// ---------- Rendu galerie ----------
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let visible = [];

// Image en échec : on RÉESSAIE avant d'abandonner. Les affiches hébergées sur le
// site (images/fb, affiches-auto) peuvent recevoir un 429 de la limitation de débit
// Cloudflare quand on fait défiler vite ; avant, l'image était retirée pour de bon.
function posterImgError(img) {
  const n = Number(img.dataset.retry || 0);
  if (n < 2) {
    img.dataset.retry = n + 1;
    const base = img.getAttribute("src").replace(/[?&]r=\d+$/, "");
    setTimeout(() => { img.src = base + (base.includes("?") ? "&" : "?") + "r=" + (n + 1); }, n === 0 ? 4000 : 12000);
    return;
  }
  const tile = img.closest(".poster");
  if (tile) tile.classList.add("poster--noimg");
  img.remove();
}

function tileHTML(ev, i) {
  const dp = dateParts(displayDate(ev));
  // Multi-jours : la pastille affiche la plage (jour de début → jour/mois de fin).
  const ep = isMulti(ev) ? dateParts((ev.endDate || "").slice(0, 10)) : null;
  const dateHTML = ep
    ? `<span class="poster__date poster__date--range"><span class="day">${dp.day}</span><span class="month">${dp.month}</span><span class="poster__dateend">→ ${ep.day} ${ep.month}</span></span>`
    : `<span class="poster__date">${dp.wd ? `<span class="wd">${dp.wd}</span>` : ""}<span class="day">${dp.day}</span><span class="month">${dp.month}</span></span>`;
  const cat = CATEGORIES[ev.category] || { label: "Événement", emoji: "📌" };
  // Commune seule sur la vignette (le nom de salle, trop long ou peu fiable selon
  // les sources, reste dans la lightbox). Rien si la commune est inconnue.
  // Pas de commune sur l'onglet Sport (demande user) : le lieu y est implicite.
  const cityHTML = ev.city && document.body.dataset.view !== "sport" ? `<span class="poster__city">📍 ${escapeHtml(ev.city)}</span>` : "";
  const media = ev.image
    ? `<img class="poster__img" src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
         onerror="posterImgError(this)">`
    : "";
  const fav = isFav(ev);
  return `
    <div class="poster-wrap">
      <button class="poster ${ev.image ? "" : "poster--noimg"} ${ev.autoPoster ? "poster--auto" : ""} ${isNew(ev) ? "poster--new" : ""}" data-i="${i}" style="animation-delay:${Math.min(i * 20, 300)}ms" aria-label="${escapeHtml(ev.title)}">
        ${media}
        ${isNew(ev) ? '<span class="poster__new">🆕 Nouveau</span>' : ""}
        <span class="poster__cat">${cat.emoji} ${escapeHtml(cat.label)}</span>
        ${dateHTML}
        <span class="poster__fallback">${escapeHtml(ev.title)}${cityHTML}</span>
        <span class="poster__overlay"><span class="poster__title">${escapeHtml(ev.title)}</span>${cityHTML}</span>
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
// ---------- Sélections « magiques » (étiquettes IA, cf. classer-evenements.js) ----------
const SELECTIONS = [
  { key: "incontournable", label: "Incontournables", emoji: "⭐" },
  { key: "atypique", label: "Atypiques", emoji: "🦄" },
  { key: "fun", label: "Fun", emoji: "🎉" },
  { key: "famille", label: "En famille", emoji: "🧸" },
  { key: "etudiant", label: "Étudiants", emoji: "🎓" },
];
function buildSelections() {
  if (!els.selections) return;
  const has = new Set(sortedEvents.flatMap(ev => ev.tags || []));
  const list = SELECTIONS.filter(s => has.has(s.key));
  if (!list.length) { els.selections.hidden = true; return; }     // pas encore d'étiquettes
  els.selections.hidden = false;
  els.selections.innerHTML = `<span class="selections__label">✨ Sélections</span>` + list.map(s => `
    <button class="selection ${state.sel === s.key ? "is-active" : ""}" data-sel="${s.key}" aria-pressed="${state.sel === s.key}">
      <span>${s.emoji}</span>${escapeHtml(s.label)} <span class="count"></span>
    </button>`).join("");
  els.selections.querySelectorAll(".selection").forEach(btn => btn.addEventListener("click", () => {
    const k = btn.dataset.sel;
    state.sel = state.sel === k ? "all" : k;                        // re-clic = désactive
    // Une sélection sur « Tout » mélangerait ce soir et l'an prochain : on cadre sur la semaine.
    if (state.sel !== "all" && state.when === "all") { state.when = "week"; syncDateUI(); }
    els.selections.querySelectorAll(".selection").forEach(b => {
      const on = b.dataset.sel === state.sel;
      b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on));
    });
    render();
  }));
}

function updateFilterCounts() {
  if (els.selections && !els.selections.hidden) {
    const selCounts = {};
    const saved = state.sel; state.sel = "all";                     // compte chaque sélection sans elle-même
    for (const ev of sortedEvents) {
      if (!ev.tags || (state.favOnly && !isFav(ev))) continue;
      if (state.filter !== "all" && ev.category !== state.filter) continue;
      if (!matchesNonCategory(ev)) continue;
      for (const t of ev.tags) selCounts[t] = (selCounts[t] || 0) + 1;
    }
    state.sel = saved;
    els.selections.querySelectorAll(".selection").forEach(b => {
      const n = selCounts[b.dataset.sel] || 0;
      b.querySelector(".count").textContent = n;
      b.classList.toggle("is-empty", n === 0);
    });
  }
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

// Page « Nouveautés » : ajouts des 3 derniers jours (nouvel événement apparu sur
// une source), groupés par récence et triés du plus récent au plus ancien.
// Réutilise tileHTML + la lightbox.
function renderNouveautes() {
  const base = sortedEvents
    .filter(ev => ev.addedAt && ev.addedAt >= NEW_SINCE_ISO)
    .filter(ev => !state.favOnly || isFav(ev))   // bouton « Mes favoris » actif aussi ici
    .filter(matchesNonCategory)
    // Même esprit que la galerie/cartes : à récence égale, mono-jour AVANT multi-jours.
    .sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || (isMulti(a) - isMulti(b)) || (a.date || "").localeCompare(b.date || ""));
  const groups = [
    { label: "Ajoutés aujourd'hui", test: e => e.addedAt === TODAY_ISO },
    { label: "Ajoutés ces 3 derniers jours", test: e => e.addedAt < TODAY_ISO && e.addedAt >= NEW_SINCE_ISO },
  ];
  visible = [];
  let html = "";
  for (const g of groups) {
    const items = base.filter(g.test);
    if (!items.length) continue;
    html += `<h2 class="nouv-group">${g.label}<span>${items.length}</span></h2>`;
    const firstMulti = items.findIndex(isMulti);   // titre de bascule dans le groupe
    items.forEach((ev, k) => {
      if (k === firstMulti) html += `<h2 class="nouv-group">📆 Sur plusieurs jours<span>${items.length - firstMulti}</span></h2>`;
      html += tileHTML(ev, visible.push(ev) - 1);
    });
  }
  els.gallery.innerHTML = html;
  els.empty.hidden = visible.length > 0;
  if (!visible.length) els.empty.textContent = state.favOnly
    ? "Aucun favori parmi les nouveautés. Cliquez sur le ♥ d'une affiche pour l'ajouter ici."
    : "Aucune nouveauté ces 3 derniers jours pour le moment. Revenez bientôt : de nouveaux événements sont ajoutés régulièrement !";
  els.count.textContent = visible.length ? `${visible.length} nouveauté${visible.length > 1 ? "s" : ""}` : "";
  els.gallery.querySelectorAll(".poster").forEach(btn =>
    btn.addEventListener("click", () => openLightbox(visible[Number(btn.dataset.i)])));
  els.gallery.querySelectorAll(".fav-btn").forEach(btn =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); onToggleFav(visible[Number(btn.dataset.i)], btn); }));
}

// Séries étalées (normalize.js : une fiche par jour pour les événements de 2 à 4
// jours, même serieUuid). Utile sur « Aujourd'hui » / « Ce week-end », mais sur une
// vue plus longue ça répète la même affiche : on la regroupe en UNE affiche avec la
// plage des jours qui passent les filtres (décision user 2026-09-16).
function regrouperSeries(list) {
  if (state.when === "today" || state.when === "weekend") return list;
  const bySerie = new Map();
  const out = [];
  for (const ev of list) {
    const k = ev.serieUuid;
    if (!k || isMulti(ev)) { out.push(ev); continue; }
    const g = bySerie.get(k);
    if (!g) { const copy = { ...ev }; bySerie.set(k, copy); out.push(copy); continue; }
    if ((ev.date || "") < g.date) g.date = ev.date;
    if ((ev.date || "") > (g.endDate || g.date)) g.endDate = ev.date;
    g._serie = true;
  }
  return out;
}

function render() {
  if (NOUVEAUTES) return renderNouveautes();
  visible = regrouperSeries(sortedEvents.filter(matches));
  // Titre de bascule mono-jour → multi-jours (1er multi-jours de la liste triée).
  // Une série regroupée (_serie) reste à sa place parmi les mono-jour.
  const firstMulti = visible.findIndex(ev => isMulti(ev) && !ev._serie);
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
  syncBar();
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
  if (window.trackUserEventClick) trackUserEventClick(ev);   // compteur de clics (events utilisateurs)
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

// Remet à jour l'état visuel des petits cœurs des affiches selon les favoris
// courants, SANS reconstruire la grille. Indispensable après un toggle depuis la
// lightbox : sinon le cœur de l'affiche reste gris alors que l'event est en favori.
function syncHearts() {
  els.gallery.querySelectorAll(".fav-btn").forEach(btn => {
    const ev = visible[Number(btn.dataset.i)];
    if (!ev) return;
    const f = isFav(ev);
    btn.classList.toggle("is-fav", f);
    btn.setAttribute("aria-pressed", String(f));
    btn.setAttribute("aria-label", f ? "Retirer des favoris" : "Ajouter aux favoris");
    btn.title = f ? "Retirer des favoris" : "Ajouter aux favoris";
  });
}

// Masquage réel (DOM + scroll). Appelé via popstate, donc unique point de sortie.
function hideLightbox() {
  lbOpen = false;
  els.lightbox.hidden = true;
  els.lightboxInner.innerHTML = "";
  document.body.style.overflow = "";
  // En mode « favoris seuls », un favori retiré depuis la lightbox doit
  // disparaître de la grille à la fermeture (re-render complet). Sinon, on
  // resynchronise juste les cœurs pour refléter un ajout/retrait fait dans la lightbox.
  if (state.favOnly) render();
  else syncHearts();
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
  buildSelections();
  buildFilters();
  buildBar();
  buildToolbar();
  render();
}

// Fusion asynchrone des événements approuvés soumis par les utilisateurs
// (Supabase). Le site statique s'affiche d'abord ; on ré-injecte ensuite.
if (window.loadApprovedUserEvents) {
  loadApprovedUserEvents().then((extra) => {
    if (!extra || !extra.length) return;
    sortedEvents = buildSorted(extra);
    if (!NOUVEAUTES) { buildSelections(); buildFilters(); }   // recalcule les compteurs
    render();
  });
}
