// ===================================================================
// Vue "Base de données" — tableau filtrable / triable / exportable.
// Lit les globals EVENTS, CATEGORIES (et GENERATED_AT si présent)
// fournis par data.js. Aucune écriture : data.js est inclus en lecture
// seule, cette vue n'altère jamais les données partagées.
// ===================================================================

const MONTHS_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN",
  "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

// ---- Définition des colonnes (l'ensemble des "infos regroupées") --
// type : pilote l'affichage cellule + le tri. nosort : non triable.
const COLUMNS = [
  { key: "date",        label: "Date",            type: "date",     on: true  },
  { key: "title",       label: "Titre",           type: "title",    on: true  },
  { key: "description", label: "Description",     type: "desc",     on: true  },
  { key: "category",    label: "Catégorie",       type: "category", on: true  },
  { key: "subcats",     label: "Sous-catégories", type: "list",     on: true  },
  { key: "audiences",   label: "Public",          type: "list",     on: true  },
  { key: "place",       label: "Lieu",            type: "place",    on: true  },
  { key: "address",     label: "Adresse",         type: "text",     on: false },
  { key: "city",        label: "Ville",           type: "city",     on: true  },
  { key: "schedule",    label: "Horaire",         type: "text",     on: true  },
  { key: "dateText",    label: "Période",         type: "text",     on: false },
  { key: "endDate",     label: "Fin",             type: "date",     on: false },
  { key: "free",        label: "Tarif",           type: "free",     on: true  },
  { key: "reservation", label: "Réservation",     type: "bool",     on: true  },
  { key: "entity",      label: "Organisateur",    type: "text",     on: false },
  { key: "updatedAt",   label: "Mis à jour",      type: "date",     on: false },
  { key: "uuid",        label: "ID",              type: "id",       on: false },
  { key: "ticketUrl",   label: "Billetterie",     type: "ticket",   on: true, nosort: true },
  { key: "url",         label: "Fiche",           type: "link",     on: true, nosort: true },
];

const state = {
  q: "", cat: "all", sub: "all", city: "all", aud: "all", price: "all", resa: "all",
  from: "", to: "",
  sortKey: "date", sortDir: 1,            // 1 = asc, -1 = desc
  cols: new Set(COLUMNS.filter(c => c.on).map(c => c.key)),
};

const el = id => document.getElementById(id);
const els = {
  q: el("q"), cat: el("fCat"), sub: el("fSub"), city: el("fCity"), aud: el("fAud"),
  price: el("fPrice"), resa: el("fResa"), from: el("fFrom"), to: el("fTo"),
  thead: el("thead"), tbody: el("tbody"), empty: el("empty"),
  count: el("count"), stats: el("stats"), colpick: el("colpick"),
  reset: el("reset"), export: el("export"), foot: el("foot"),
};

// Données de base (data.js) fusionnées avec les détails enrichis (details.js),
// par uuid, en lecture seule. details.js peut être absent (fallback gracieux).
const DETAILS = (typeof EVENT_DETAILS !== "undefined" && EVENT_DETAILS) ? EVENT_DETAILS : {};
const BASE = Array.isArray(typeof EVENTS !== "undefined" ? EVENTS : null) ? EVENTS : [];
const ALL = BASE.map(e => {
  const d = DETAILS[e.uuid] || {};
  // l'enrichissement complète sans écraser les champs déjà présents de data.js
  return {
    ...e,
    description: d.description || "",
    audiences: d.audiences || [],
    address: d.address || null,
    entity: d.entity || null,
    ticketUrl: d.ticketUrl || null,
    updatedAt: d.updatedAt || null,
    placeKeywords: d.placeKeywords || "",
    image: e.image || d.image || null,
  };
});

// ---------- Helpers ----------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function catOf(ev) { return CATEGORIES[ev.category] || { label: ev.category || "Autre", emoji: "📌" }; }
function dayMonth(iso) {
  if (!iso) return null;
  const p = iso.split("-").map(Number);
  return { day: p[2], month: MONTHS_SHORT[p[1] - 1] || "", year: p[0] };
}
function uniqSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
}

// ---------- Build filter dropdowns ----------
function fillSelect(node, items, allLabel) {
  node.innerHTML = `<option value="all">${esc(allLabel)}</option>` +
    items.map(it => `<option value="${esc(it.value)}">${esc(it.label)}</option>`).join("");
}
function buildFilters() {
  const catCounts = {};
  ALL.forEach(e => { catCounts[e.category] = (catCounts[e.category] || 0) + 1; });
  const cats = Object.keys(CATEGORIES)
    .filter(k => catCounts[k])
    .map(k => ({ value: k, label: `${CATEGORIES[k].emoji} ${CATEGORIES[k].label} (${catCounts[k]})` }));
  fillSelect(els.cat, cats, `Toutes (${ALL.length})`);

  const subs = uniqSorted(ALL.flatMap(e => e.subcats || [])).map(s => ({ value: s, label: s }));
  fillSelect(els.sub, subs, "Toutes");

  const cities = uniqSorted(ALL.map(e => e.city)).map(c => ({ value: c, label: c }));
  fillSelect(els.city, cities, "Toutes");

  const auds = uniqSorted(ALL.flatMap(e => e.audiences || [])).map(a => ({ value: a, label: a }));
  fillSelect(els.aud, auds, "Tous publics");
}

// ---------- Column chooser ----------
function buildColPicker() {
  els.colpick.innerHTML = COLUMNS.map(c => `
    <label><input type="checkbox" data-col="${c.key}" ${state.cols.has(c.key) ? "checked" : ""}>${esc(c.label)}</label>
  `).join("");
  els.colpick.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("change", () => {
      if (inp.checked) state.cols.add(inp.dataset.col);
      else state.cols.delete(inp.dataset.col);
      render();
    });
  });
}

// ---------- Filtering ----------
function matches(ev) {
  if (state.cat !== "all" && ev.category !== state.cat) return false;
  if (state.sub !== "all" && !(ev.subcats || []).includes(state.sub)) return false;
  if (state.city !== "all" && ev.city !== state.city) return false;
  if (state.aud !== "all" && !(ev.audiences || []).includes(state.aud)) return false;
  if (state.price === "free" && !ev.free) return false;
  if (state.price === "paid" && ev.free) return false;
  if (state.resa === "yes" && !ev.reservation) return false;
  if (state.resa === "no" && ev.reservation) return false;
  // Plage de dates : on garde l'événement s'il chevauche [from, to].
  if (state.from && (ev.endDate || ev.date || "") < state.from) return false;
  if (state.to && (ev.date || ev.endDate || "9999") > state.to) return false;
  if (state.q) {
    const hay = `${ev.title} ${ev.description || ""} ${ev.place} ${ev.address || ""} ${ev.city} ${(ev.subcats || []).join(" ")} ${(ev.audiences || []).join(" ")} ${catOf(ev).label} ${ev.dateText || ""} ${ev.placeKeywords || ""} ${ev.entity || ""}`.toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

// ---------- Sorting ----------
function sortVal(ev, key) {
  if (key === "subcats") return (ev.subcats || []).join(", ");
  if (key === "audiences") return (ev.audiences || []).join(", ");
  if (key === "category") return catOf(ev).label;
  if (key === "free") return ev.free ? 0 : 1;
  if (key === "reservation") return ev.reservation ? 0 : 1;
  return ev[key] == null ? "" : ev[key];
}
function sortRows(rows) {
  const k = state.sortKey, dir = state.sortDir;
  return rows.slice().sort((a, b) => {
    const va = sortVal(a, k), vb = sortVal(b, k);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "fr", { numeric: true }) * dir;
  });
}

// ---------- Cell rendering ----------
function cell(col, ev) {
  const v = ev[col.key];
  switch (col.type) {
    case "date": {
      const dm = dayMonth(v);
      return dm
        ? `<span class="c-date"><b>${dm.day}</b> <small>${dm.month} ${dm.year}</small></span>`
        : "—";
    }
    case "title": return `<span class="c-title">${esc(v)}</span>`;
    case "desc": {
      if (!v) return "—";
      // Texte tronqué (clamp CSS) ; survol = texte complet.
      return `<span class="c-desc" title="${esc(v)}">${esc(v)}</span>`;
    }
    case "category": {
      const c = catOf(ev);
      return `<span class="c-cat"><span class="chip">${c.emoji} ${esc(c.label)}</span></span>`;
    }
    case "list": {
      const arr = (v || []);
      if (!arr.length) return "—";
      return `<span class="c-subcats"><span class="tag-list">${arr.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</span></span>`;
    }
    case "place": return v ? `<span class="c-place">${esc(v)}</span>` : "—";
    case "city": return v ? `<span class="c-city">${esc(v)}</span>` : "—";
    case "free":
      return ev.free
        ? `<span class="chip chip--free">Gratuit</span>`
        : `<span class="chip">Payant</span>`;
    case "bool":
      return v
        ? `<span class="chip chip--yes">Oui</span>`
        : `<span class="chip chip--no">Non</span>`;
    case "id": return `<span class="c-id">${esc(String(v || "").slice(0, 8))}</span>`;
    case "ticket":
      // Lien de billetterie/réservation en ligne (souvent externe). Absent
      // pour beaucoup d'événements gratuits ou sans résa en ligne.
      if (!v) return ev.reservation ? `<span class="chip chip--yes">Sur résa</span>` : "—";
      return `<a class="go" href="${esc(v)}" target="_blank" rel="noopener">Billetterie ↗</a>`;
    case "link":
      if (!v) return "—";
      // Fiche officielle : description complète + infos pratiques.
      return `<a class="go go--ghost" href="${esc(v)}" target="_blank" rel="noopener">Fiche ↗</a>`;
    default:
      return v ? esc(v) : "—";
  }
}

// ---------- Render ----------
function visibleCols() { return COLUMNS.filter(c => state.cols.has(c.key)); }

function renderHead() {
  const cols = visibleCols();
  els.thead.innerHTML = `<tr>${cols.map(c => {
    const sortable = !c.nosort;
    const sorted = state.sortKey === c.key;
    const arrow = sorted ? (state.sortDir === 1 ? "▲" : "▼") : "↕";
    return `<th class="${sortable ? "sortable" : ""} ${sorted ? "sorted" : ""}" data-key="${c.key}">${esc(c.label)}${sortable ? `<span class="arrow">${arrow}</span>` : ""}</th>`;
  }).join("")}</tr>`;

  els.thead.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDir *= -1;
      else { state.sortKey = k; state.sortDir = 1; }
      render();
    });
  });
}

function render() {
  const cols = visibleCols();
  const rows = sortRows(ALL.filter(matches));

  renderHead();
  els.tbody.innerHTML = rows.map(ev =>
    // data-label : utilisé en CSS mobile (≤760px) pour afficher l'intitulé de
    // colonne devant chaque valeur quand le tableau passe en mode « cartes ».
    `<tr>${cols.map(c => `<td data-label="${esc(c.label)}">${cell(c, ev)}</td>`).join("")}</tr>`
  ).join("");

  els.empty.hidden = rows.length > 0;
  els.count.innerHTML = `<b>${rows.length}</b> / ${ALL.length} événement${ALL.length > 1 ? "s" : ""}`;
  lastRows = rows;
}

let lastRows = [];

// ---------- Stats bar ----------
function renderStats() {
  const free = ALL.filter(e => e.free).length;
  const cities = new Set(ALL.map(e => e.city).filter(Boolean)).size;
  const cats = new Set(ALL.map(e => e.category)).size;
  const tickets = ALL.filter(e => e.ticketUrl).length;
  const descs = ALL.filter(e => e.description).length;
  const gen = (typeof GENERATED_AT !== "undefined" && GENERATED_AT) ? GENERATED_AT : null;
  els.stats.innerHTML = [
    `<span class="stat"><b>${ALL.length}</b> événements</span>`,
    `<span class="stat"><b>${cats}</b> catégories</span>`,
    `<span class="stat"><b>${cities}</b> communes</span>`,
    `<span class="stat"><b>${free}</b> gratuits</span>`,
    `<span class="stat"><b>${descs}</b> avec description</span>`,
    `<span class="stat"><b>${tickets}</b> avec billetterie</span>`,
    `<span class="stat"><b>${COLUMNS.length}</b> colonnes</span>`,
  ].join("");
  els.foot.innerHTML = `Base de données des événements de Nancy & du Grand Nancy.${gen ? ` Données générées le ${esc(gen)}.` : ""} Descriptions, adresses et billetteries enrichies depuis les fiches officielles (enrich-details.js). Données indicatives — vérifiez sur la fiche de chaque événement.`;
}

// ---------- CSV export ----------
function csvEscape(v) {
  const s = String(v == null ? "" : v).replace(/"/g, '""');
  return /[";\n]/.test(s) ? `"${s}"` : s;
}
function exportCSV() {
  const cols = visibleCols();
  const header = cols.map(c => csvEscape(c.label)).join(";");
  const lines = lastRows.map(ev => cols.map(c => {
    let v = ev[c.key];
    if (c.key === "subcats" || c.key === "audiences") v = (v || []).join(", ");
    else if (c.type === "free") v = ev.free ? "Gratuit" : "Payant";
    else if (c.type === "bool") v = v ? "Oui" : "Non";
    else if (c.type === "category") v = catOf(ev).label;
    return csvEscape(v);
  }).join(";"));
  // BOM pour qu'Excel reconnaisse l'UTF-8 ; séparateur ; (locale FR).
  const blob = new Blob(["﻿" + [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `evenements-nancy-${lastRows.length}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

// ---------- Wiring ----------
let qTimer;
els.q.addEventListener("input", e => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 120);
});
els.cat.addEventListener("change", e => { state.cat = e.target.value; render(); });
els.sub.addEventListener("change", e => { state.sub = e.target.value; render(); });
els.city.addEventListener("change", e => { state.city = e.target.value; render(); });
els.aud.addEventListener("change", e => { state.aud = e.target.value; render(); });
els.price.addEventListener("change", e => { state.price = e.target.value; render(); });
els.resa.addEventListener("change", e => { state.resa = e.target.value; render(); });
els.from.addEventListener("change", e => { state.from = e.target.value; render(); });
els.to.addEventListener("change", e => { state.to = e.target.value; render(); });
els.export.addEventListener("click", exportCSV);
els.reset.addEventListener("click", () => {
  Object.assign(state, { q: "", cat: "all", sub: "all", city: "all", aud: "all", price: "all", resa: "all", from: "", to: "" });
  els.q.value = ""; els.cat.value = "all"; els.sub.value = "all"; els.city.value = "all"; els.aud.value = "all";
  els.price.value = "all"; els.resa.value = "all"; els.from.value = ""; els.to.value = "";
  render();
});

// ---------- Init ----------
buildFilters();
buildColPicker();
renderStats();
render();
