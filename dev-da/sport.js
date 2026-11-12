// ============================================================================
// sport.js — page « Sport amateur » (sport.html).
// Lit les événements sportifs soumis par les clubs (table Supabase user_events,
// kind='sport', status='approved') et offre des filtres dédiés : sport, lieu,
// division, catégorie d'âge, date. Réutilise les classes CSS du site (poster,
// filter, datefilter, toolbar, lightbox) pour rester cohérent avec galerie.js.
//
// Loader autonome : toEvent() de user-events.js n'expose PAS les colonnes sport
// (sport/division/age_category/opponent), donc on requête Supabase directement.
// ============================================================================

const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN",
  "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

// Émoji par sport (libellé canonique = valeur stockée). « Autre » = secours.
const SPORT_EMOJI = {
  "Football": "⚽", "Basketball": "🏀", "Handball": "🤾", "Volleyball": "🏐",
  "Rugby": "🏉", "Tennis": "🎾", "Hockey sur glace": "🏒", "Natation": "🏊",
  "Athlétisme": "🏃", "Judo": "🥋", "Boxe": "🥊", "Gymnastique": "🤸",
  "Badminton": "🏸", "Tennis de table": "🏓", "Cyclisme": "🚴", "Autre": "🏅",
};
const sportEmoji = (s) => SPORT_EMOJI[s] || "🏅";

const state = { query: "", sport: "all", when: "all", ville: "all", division: "all", age: "all" };

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

// ---------- Dates ----------
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY_ISO = isoOf(new Date());
const notPast = (ev) => ((ev.endDate || ev.date || "") >= TODAY_ISO);
const isMulti = (ev) => { const s = (ev.date || "").slice(0, 10), e = (ev.endDate || "").slice(0, 10); return !!e && e > s; };

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
function dateLabel(ev) {
  const start = ev.date || "", end = ev.endDate || start;
  let base;
  if (end && end !== start) base = start > TODAY_ISO ? `Du ${fmtLong(start)} au ${fmtLong(end)}` : `Jusqu'au ${fmtLong(end)}`;
  else base = fmtLong(start);
  if (ev.schedule) base += (base ? " · " : "") + ev.schedule;
  return base || "Date à venir";
}

// Plages des chips de période (sans calendrier : chips simples).
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
  if (when === "week") { const e = new Date(now); e.setDate(now.getDate() + 7); return [today, isoOf(e)]; }
  if (when === "month") { const e = new Date(now); e.setDate(now.getDate() + 30); return [today, isoOf(e)]; }
  return null;
}
function matchesWhen(ev, range) {
  if (!range) return true;
  const [from, to] = range, start = ev.date || "", end = ev.endDate || start;
  return start <= to && end >= from;
}

// ---------- Filtres ----------
function matchesNonSport(ev) {
  if (state.when !== "all" && !matchesWhen(ev, whenRange(state.when))) return false;
  if (state.ville !== "all" && (ev.city || "") !== state.ville) return false;
  if (state.division !== "all" && (ev.division || "") !== state.division) return false;
  if (state.age !== "all" && (ev.age_category || "") !== state.age) return false;
  if (state.query) {
    const hay = `${ev.title} ${ev.sport} ${ev.place} ${ev.city} ${ev.division || ""} ${ev.age_category || ""} ${ev.opponent || ""}`.toLowerCase();
    if (!hay.includes(state.query)) return false;
  }
  return true;
}
function matches(ev) {
  if (state.sport !== "all" && ev.sport !== state.sport) return false;
  return matchesNonSport(ev);
}

// Valeurs distinctes présentes pour une dimension (pour bâtir les sélecteurs).
function distinct(key) {
  return [...new Set(sportEvents.map(e => e[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
}

function buildSportFilters() {
  const counts = {};
  for (const ev of sportEvents) counts[ev.sport] = (counts[ev.sport] || 0) + 1;
  const buttons = [
    { key: "all", label: "Tous", emoji: "✨", n: sportEvents.length },
    ...Object.keys(counts).sort((a, b) => a.localeCompare(b, "fr"))
      .map(s => ({ key: s, label: s, emoji: sportEmoji(s), n: counts[s] })),
  ];
  els.filters.innerHTML = buttons.map(b => `
    <button class="filter ${b.key === state.sport ? "is-active" : ""}" data-key="${escapeHtml(b.key)}">
      <span>${b.emoji}</span>${escapeHtml(b.label)} <span class="count">${b.n}</span>
    </button>`).join("");
  els.filters.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click", () => {
    state.sport = btn.dataset.key;
    els.filters.querySelectorAll(".filter").forEach(b => b.classList.toggle("is-active", b === btn));
    render();
  }));
}

function buildDateFilters() {
  const chips = [
    { key: "all", label: "Tout" },
    { key: "today", label: "Aujourd'hui" },
    { key: "weekend", label: "Ce week-end" },
    { key: "week", label: "7 jours" },
    { key: "month", label: "30 jours" },
  ];
  els.dateFilters.innerHTML = chips.map(c =>
    `<button class="datefilter ${c.key === state.when ? "is-active" : ""}" data-when="${c.key}">${c.label}</button>`).join("");
  els.dateFilters.querySelectorAll(".datefilter").forEach(btn => btn.addEventListener("click", () => {
    state.when = btn.dataset.when;
    els.dateFilters.querySelectorAll(".datefilter").forEach(b => b.classList.toggle("is-active", b === btn));
    render();
  }));
}

// ---------- Barre d'outils : filtres secondaires (lieu, division, âge) ----------
const SLIDERS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tool-ico"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="tool-chev"><path d="M6 9l6 6 6-6"/></svg>';

// Groupes construits dynamiquement : un groupe n'apparaît que s'il a des valeurs.
function advGroups() {
  const g = [
    { key: "ville", label: "Lieu", values: distinct("city") },
    { key: "division", label: "Division", values: distinct("division") },
    { key: "age", label: "Catégorie d'âge", values: distinct("age_category") },
  ];
  return g.filter(x => x.values.length);
}
function advCount() { return ["ville", "division", "age"].filter(k => state[k] !== "all").length; }

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
}

function buildToolbar() {
  const groups = advGroups();
  if (!groups.length) { els.toolbar.innerHTML = ""; return; }   // rien à filtrer pour l'instant
  els.toolbar.innerHTML = `
    <div class="tool-group" id="advWrap">
      <button type="button" class="tool-btn" id="advTrigger" aria-haspopup="dialog" aria-expanded="false">
        ${SLIDERS_ICON}<span>Filtres</span><span class="tool-badge" id="advBadge" hidden>0</span>${CHEVRON_ICON}
      </button>
      <div class="cal adv-pop" id="advPop" role="dialog" aria-label="Filtres" hidden>
        ${groups.map(g => `
          <div class="adv-group">
            <span class="adv-label">${escapeHtml(g.label)}</span>
            <div class="seg" role="group" aria-label="${escapeHtml(g.label)}">
              <button type="button" class="seg__btn ${state[g.key] === "all" ? "is-active" : ""}" data-group="${g.key}" data-val="all">Tous</button>
              ${g.values.map(v => `<button type="button" class="seg__btn ${state[g.key] === v ? "is-active" : ""}" data-group="${g.key}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("")}
            </div>
          </div>`).join("")}
        <button type="button" class="adv-reset" id="advReset">Réinitialiser</button>
      </div>
    </div>`;

  els.toolbar.querySelector("#advTrigger")
    .addEventListener("click", (e) => { e.stopPropagation(); advOpen ? closeAdvPop() : openAdvPop(); });
  els.toolbar.querySelectorAll("#advPop .seg__btn").forEach(btn => btn.addEventListener("click", () => {
    state[btn.dataset.group] = btn.dataset.val;
    syncToolbar();
    render();
  }));
  els.toolbar.querySelector("#advReset").addEventListener("click", () => {
    state.ville = "all"; state.division = "all"; state.age = "all";
    syncToolbar(); render();
  });
  syncToolbar();
}

document.addEventListener("click", (e) => { if (advOpen && !e.target.closest("#advWrap")) closeAdvPop(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && advOpen && !lbOpen) closeAdvPop(); });

// ---------- Rendu ----------
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let visible = [];

function tileHTML(ev, i) {
  const dp = dateParts(ev.date);
  const ep = isMulti(ev) ? dateParts((ev.endDate || "").slice(0, 10)) : null;
  const dateHTML = ep
    ? `<span class="poster__date poster__date--range"><span class="day">${dp.day}</span><span class="month">${dp.month}</span><span class="poster__dateend">→ ${ep.day} ${ep.month}</span></span>`
    : `<span class="poster__date"><span class="day">${dp.day}</span><span class="month">${dp.month}</span></span>`;
  const media = ev.image
    ? `<img class="poster__img" src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"
         onerror="this.closest('.poster').classList.add('poster--noimg');this.remove();">`
    : "";
  const sub = [ev.division, ev.age_category].filter(Boolean).join(" · ");
  return `
    <div class="poster-wrap">
      <button class="poster ${ev.image ? "" : "poster--noimg"}" data-i="${i}" style="animation-delay:${Math.min(i * 20, 300)}ms" aria-label="${escapeHtml(ev.title)}">
        ${media}
        <span class="poster__cat">${sportEmoji(ev.sport)} ${escapeHtml(ev.sport)}</span>
        ${dateHTML}
        <span class="poster__fallback">${escapeHtml(ev.title)}${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span>
        <span class="poster__overlay"><span class="poster__title">${escapeHtml(ev.title)}</span></span>
      </button>
    </div>`;
}

function render() {
  visible = sportEvents.filter(matches).sort((a, b) =>
    (isMulti(a) - isMulti(b)) || (a.date || "").localeCompare(b.date || ""));
  els.gallery.innerHTML = visible.map((ev, i) => tileHTML(ev, i)).join("");
  els.empty.hidden = visible.length > 0;
  if (!visible.length && sportEvents.length) {
    els.empty.textContent = "Aucun événement sportif ne correspond à votre recherche. Essayez un autre filtre.";
  }
  els.count.textContent = visible.length ? `${visible.length} événement${visible.length > 1 ? "s" : ""} sportif${visible.length > 1 ? "s" : ""}` : "";
  updateSportCounts();
  els.gallery.querySelectorAll(".poster").forEach(btn =>
    btn.addEventListener("click", () => openLightbox(visible[Number(btn.dataset.i)])));
}

// Recalcule les compteurs des boutons de sport selon les AUTRES filtres actifs.
function updateSportCounts() {
  const counts = {};
  let total = 0;
  for (const ev of sportEvents) {
    if (!matchesNonSport(ev)) continue;
    total++;
    counts[ev.sport] = (counts[ev.sport] || 0) + 1;
  }
  els.filters.querySelectorAll(".filter").forEach(btn => {
    const key = btn.dataset.key;
    const n = key === "all" ? total : (counts[key] || 0);
    const span = btn.querySelector(".count");
    if (span) span.textContent = n;
    btn.classList.toggle("is-empty", n === 0 && key !== "all");
  });
}

// ---------- Lightbox ----------
const lbIcon = {
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2 2 2 0 000 6 2 2 0 01-2 2H5a2 2 0 01-2-2 2 2 0 000-6z"/><path d="M9 7v10"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  vs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16M20 4L4 20"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM5 4H3v2a3 3 0 003 3M19 4h2v2a3 3 0 01-3 3"/></svg>',
};

function openLightbox(ev) {
  trackClick(ev);
  const place = [ev.place, ev.city].filter(Boolean).join(" — ");
  const badges =
    (ev.free ? `<span class="badge badge--free">Gratuit</span>` : "") +
    (ev.reservation ? `<span class="badge">${lbIcon.ticket} Réservation</span>` : "");
  const media = ev.image
    ? `<div class="lightbox__media"><img src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.title)}" decoding="async" fetchpriority="high" referrerpolicy="no-referrer"></div>`
    : "";
  const meta = [
    `<div>${lbIcon.clock}<span>${escapeHtml(dateLabel(ev))}</span></div>`,
    place ? `<div>${lbIcon.pin}<span>${escapeHtml(place)}</span></div>` : "",
    ev.opponent ? `<div>${lbIcon.vs}<span>Contre ${escapeHtml(ev.opponent)}</span></div>` : "",
    (ev.division || ev.age_category) ? `<div>${lbIcon.trophy}<span>${escapeHtml([ev.division, ev.age_category].filter(Boolean).join(" · "))}</span></div>` : "",
  ].filter(Boolean).join("");
  els.lightboxInner.innerHTML = `
    ${media}
    <div class="lightbox__info">
      <span class="lightbox__cat">${sportEmoji(ev.sport)} ${escapeHtml(ev.sport)}</span>
      <h2>${escapeHtml(ev.title)}</h2>
      ${badges ? `<div class="card__badges">${badges}</div>` : ""}
      ${ev.description ? `<p class="lightbox__desc">${escapeHtml(ev.description)}</p>` : ""}
      <div class="card__meta">${meta}</div>
      ${ev.url ? `<div class="lightbox__actions"><a class="lightbox__cta" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener">Plus d'infos ${lbIcon.arrow}</a></div>` : ""}
    </div>`;
  els.lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  lbOpen = true;
  history.pushState({ lb: true }, "");
  els.lightboxClose.focus();
}

let lbOpen = false;
function hideLightbox() {
  lbOpen = false;
  els.lightbox.hidden = true;
  els.lightboxInner.innerHTML = "";
  document.body.style.overflow = "";
}
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

// ---------- Données (Supabase) ----------
let sportEvents = [];
let _sb = null;
function supa() {
  if (_sb) return _sb;
  if (!window.supabase || !window.SUPABASE_URL || /TON-PROJET/.test(window.SUPABASE_URL)) return null;
  _sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  return _sb;
}
// Comptage de clics (réutilise la RPC du backend ; silencieux).
function trackClick(ev) {
  const c = supa();
  if (!c || !ev || !ev._id) return;
  c.rpc("increment_event_click", { p_id: ev._id }).then(() => {}, () => {});
}
function toSport(r) {
  const iso = (d) => (d ? String(d).slice(0, 10) : "");
  return {
    _id: r.id,
    title: r.title,
    sport: r.sport || "Autre",
    division: r.division || "",
    age_category: r.age_category || "",
    opponent: r.opponent || "",
    description: r.description || "",
    date: iso(r.date),
    endDate: r.end_date ? iso(r.end_date) : "",
    schedule: r.schedule || "",
    place: r.place || "",
    city: r.city || "",
    free: !!r.free,
    reservation: !!r.reservation,
    image: r.image || null,
    url: r.url || "",
  };
}
async function loadSport() {
  const c = supa();
  if (!c) return [];
  try {
    const { data, error } = await c
      .from("user_events")
      .select("*")
      .eq("status", "approved")
      .eq("kind", "sport");
    if (error) { console.warn("sport:", error.message); return []; }
    return (data || []).map(toSport).filter(notPast);
  } catch (e) { console.warn("sport:", e); return []; }
}

// ---------- Init ----------
buildDateFilters();
buildSportFilters();
buildToolbar();
render();

loadSport().then((rows) => {
  sportEvents = rows;
  buildSportFilters();
  buildToolbar();
  render();
});
