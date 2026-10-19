#!/usr/bin/env node
/**
 * gen-pages.js : une page HTML par événement à venir, dans le build publié.
 *
 *   node gen-pages.js <dossier dist>
 *
 * Appelé par deploy-cloudflare.sh APRÈS la copie des fichiers dans dist/ et
 * AVANT le « durcissement » de dist/data.js (qui retire uuid et source) :
 *   - lit data.js (racine du projet, avec uuid/altUrls), fiches.json
 *     (enrich-fiches.js) et, en secours, details.js (ancienne fiche Ville de
 *     Nancy) ;
 *   - écrit dist/evenement/<slug>/index.html pour chaque événement à venir,
 *     plus dist/evenement.css et dist/evenement.js (communs à toutes les pages) ;
 *   - ajoute à chaque événement de dist/data.js le champ `page` (« Plus
 *     d'infos » de la galerie y mène) ;
 *   - ajoute les pages au sitemap de dist/.
 *
 * Contenu d'une page (trame validée le 2026-10-18) : affiche d'origine, infos
 * clés (quand, où, tarif, public), bouton de réservation, description complète
 * dans un cadre qui défile, infos pratiques, liens officiels, autres
 * événements du même lieu. SEO : title/description, Open Graph, JSON-LD Event.
 *
 * L'adresse d'une page est stable d'un jour à l'autre : titre + date de fin (ou
 * date du jour unique) + empreinte de l'identifiant source.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROJ = __dirname;
const DIST = path.resolve(process.argv[2] || path.join(PROJ, "dist"));
const SITE = "https://agenda-grandnancy.fr";
const TODAY = new Date().toISOString().slice(0, 10);
// Version des fichiers communs : empreinte de leur contenu (calculée plus bas),
// pas l'heure. Une page dont rien n'a changé reste identique d'une publication à
// l'autre, et Cloudflare ne renvoie que les pages réellement modifiées.
let VER = "";
// « À propos » : nombre de caractères au-delà duquel le texte défile dans un
// cadre (décision du 2026-10-19 : pas de défilement tant que ce n'est pas long).
const ABOUT_SCROLL = 2500;

// ── Données ──────────────────────────────────────────────────────────────────

function loadJs(file, names) {
  const p = path.join(PROJ, file);
  if (!fs.existsSync(p)) return {};
  const code = fs.readFileSync(p, "utf8");
  return new Function(code + `; return { ${names.map((n) => `${n}: typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ")} };`)();
}
const { CATEGORIES = {}, EVENTS = [] } = loadJs("data.js", ["CATEGORIES", "EVENTS"]);
const { EVENT_DETAILS = {} } = loadJs("details.js", ["EVENT_DETAILS"]);
let FICHES = {};
try { FICHES = JSON.parse(fs.readFileSync(path.join(PROJ, "fiches.json"), "utf8")); } catch (_) { /* première fois */ }

// ── Petits outils ────────────────────────────────────────────────────────────

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const normKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/gi, "oe").replace(/æ/gi, "ae")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const hash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 5);
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS_SHORT = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];
const DAYS_SHORT = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const d0 = (iso) => new Date(iso + "T12:00:00");
const fmtLong = (iso) => { const d = d0(iso); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function dateLabel(ev) {
  const start = ev.date || "", end = ev.endDate || start;
  let base;
  if (end && end !== start) base = start > TODAY ? `Du ${fmtLong(start)} au ${fmtLong(end)}` : `Jusqu'au ${fmtLong(end)}`;
  else base = ev.dateText || fmtLong(start);
  return cap(base);
}

// Première heure lisible dans « de 20h à 22h », « 20h30 », « 14:00 ».
function firstTime(s) {
  const m = String(s || "").match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!m) return "";
  const h = Number(m[1]); if (h > 23) return "";
  return `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
}

const SOURCE_NAMES = [
  // Ancrés sur le domaine : « lautrecanalnancy.fr » se termine aussi par « nancy.fr ».
  [/^poirel\.nancy\.fr$/, "Salle Poirel"], [/(^|\.)nancy\.fr$/, "Ville de Nancy"], [/(^|\.)destination-nancy\.com$/, "Destination Nancy"],
  [/(^|\.)alentoor\.fr$/, "Alentoor"], [/(^|\.)curieux\.(net|app)$/, "Nancy Curieux"], [/(^|\.)lautrecanalnancy\.fr$/, "L'Autre Canal"],
  [/(^|\.)zenith-de-nancy\.com$/, "Zénith de Nancy"], [/(^|\.)vandoeuvre\.fr$/, "Ville de Vandœuvre"], [/(^|\.)villerslesnancy\.fr$/, "Ville de Villers-lès-Nancy"],
  [/(^|\.)esseylesnancy\.fr$/, "Ville d'Essey-lès-Nancy"], [/(^|\.)laxou\.fr$/, "Ville de Laxou"], [/(^|\.)ludres\.com$/, "Ville de Ludres"],
  [/(^|\.)lorraineaucoeur\.com$/, "Lorraine au cœur"], [/(^|\.)ici-c-nancy\.fr$/, "Ici c'est Nancy"], [/(^|\.)estrepublicain\.fr$/, "L'Est Républicain"],
  [/(^|\.)facebook\.com$/, "Facebook"], [/(^|\.)themisweb\.fr$/, "Salle Poirel"], [/(^|\.)opera-nancy\.fr$/, "Opéra national de Nancy-Lorraine"],
  [/(^|\.)theatre-manufacture\.fr$/, "Théâtre de la Manufacture"],
];
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|c)\./, ""); } catch (_) { return ""; } };
function sourceName(u) {
  const h = hostOf(u);
  if (h === "poirel.nancy.fr") return "Salle Poirel";
  const hit = SOURCE_NAMES.find(([re]) => re.test(h));
  return hit ? hit[1] : h;
}
const isFacebookUrl = (u) => hostOf(u) === "facebook.com";

// ── Assemblage de la fiche d'un événement (toutes sources réunies) ───────────

function ficheFor(ev) {
  const urls = [ev.url, ...(ev.altUrls || [])].filter(Boolean);
  const fiches = urls.map((u) => ({ url: u, f: FICHES[u] })).filter((x) => x.f && x.f.status === "ok");
  const notFound = urls.filter((u) => FICHES[u] && FICHES[u].status === "notfound");
  const det = EVENT_DETAILS[ev.uuid] || null;

  // Description : la source principale si elle est consistante, sinon la plus
  // complète. L'ancienne fiche Ville de Nancy sert de secours.
  const withDesc = fiches.filter((x) => (x.f.description || "").length >= 60);
  let descFrom = withDesc.find((x) => x.url === ev.url && x.f.description.length >= 250)
    || withDesc.slice().sort((a, b) => b.f.description.length - a.f.description.length)[0] || null;
  let description = descFrom ? descFrom.f.description : "";
  if (!description && det && det.description) { description = det.description; descFrom = { url: ev.url }; }

  const first = (k) => { for (const x of fiches) { const v = x.f[k]; if (v && (!Array.isArray(v) || v.length)) return v; } return undefined; };
  const tickets = [];
  for (const x of [...fiches.filter((y) => y.url === ev.url), ...fiches.filter((y) => y.url !== ev.url)]) {
    for (const t of x.f.tickets || []) if (t && t.url && !tickets.some((z) => z.url === t.url)) tickets.push(t);
  }
  if (det && det.ticketUrl && !tickets.some((z) => z.url === det.ticketUrl)) tickets.push({ label: "Billetterie", url: det.ticketUrl });

  const venue = first("venue") || (det && det.venue) || "";
  let street = first("street") || "";
  let postalCode = first("postalCode") || "";
  if (!street && det && det.address) {
    const m = det.address.match(/^(.*?),\s*(\d{5})\s/);
    if (m) { street = m[1]; postalCode = m[2]; }
  }
  return {
    description,
    descFrom: descFrom ? descFrom.url : "",
    priceLines: first("priceLines") || [],
    hoursLines: first("hoursLines") || [],
    free: ev.free || fiches.some((x) => x.f.free),
    tickets: tickets.slice(0, 3),
    venue, street, postalCode,
    audience: first("audience") || (det && det.audiences && det.audiences.join(", ")) || "",
    practical: first("practical") || "",
    eventStatus: first("eventStatus") || "",
    image: first("image") || (det && det.image) || "",
    checkedAt: fiches.map((x) => x.f.fetchedAt).filter(Boolean).sort().pop() || "",
    sources: urls.filter((u) => !notFound.includes(u)),
  };
}

// ── Adresse stable de chaque page ────────────────────────────────────────────

function pageSlug(ev) {
  const stableDate = ev.endDate && ev.endDate !== ev.date ? ev.endDate : ev.date;
  const id = ev.serieUuid || ev.uuid || ev.url || ev.title;
  const base = slugify(ev.title).slice(0, 70).replace(/-+$/, "") || "evenement";
  return `${base}-${stableDate || "date"}-${hash(id + "|" + (ev.date === ev.endDate ? ev.date : ""))}`;
}

// ── Gabarit ──────────────────────────────────────────────────────────────────

const ICON = {
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  pin: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  ticket: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9a2 2 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 11v2M13 17v2"/></svg>',
  people: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  out: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  calAdd: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>',
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
};

// Paragraphes de la description : texte brut échappé, liens et e-mails rendus
// cliquables, sauts de ligne conservés.
function descHtml(text) {
  const linkify = (s) => esc(s)
    .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)»]/g, (u) => `<a href="${u}" rel="nofollow noopener" target="_blank">${u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a>`)
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, (m) => `<a href="mailto:${m}">${m}</a>`);
  return text.split(/\n{2,}/).map((p) => `<p>${linkify(p.trim()).replace(/\n/g, "<br>")}</p>`).join("\n");
}

function mapsUrl(q) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q); }

// « le site de la Ville de Nancy », « le site de L'Autre Canal », « Facebook ».
function onSite(name) {
  if (!name) return "le site officiel";
  if (/^Facebook$/.test(name)) return "Facebook";
  if (/^Ville /.test(name)) return "le site de la " + name;
  if (/^(L'|Le |La |Les )/.test(name)) return "le site de " + name;
  if (/^[\w.-]+\.\w{2,}$/.test(name)) return name;
  if (/^Salle /.test(name)) return "le site de la " + name;
  if (/^(Théâtre|Zénith) /.test(name)) return "le site du " + name;
  if (/^(Opéra|Office|École|Église|Espace|Orchestre) /.test(name)) return "le site de l'" + name;
  return "le site " + name;
}

function ticketLabel(t) {
  const h = sourceName(t.url);
  if (/r[ée]server pour \d/i.test(t.label)) return t.label;
  return h && !/^[\w.-]+\.\w+$/.test(h) ? `Réserver sur ${onSite(h)}` : "Réserver";
}

function card(ev) {
  const d = d0(ev.date);
  const img = ev.image && !/^affiches-auto\//.test(ev.image) ? (ev.image.startsWith("http") ? ev.image : "/" + ev.image) : (ev.image ? "/" + ev.image : "");
  const cat = CATEGORIES[ev.category] || {};
  return `<a class="ev-card" href="/evenement/${ev._slug}/">
        <div class="ev-card__media">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${ev.fallbackImage ? ` onerror="if(!this.dataset.u){this.dataset.u=1;this.src='/${esc(ev.fallbackImage)}'}"` : ""}>` : ""}<span class="ev-card__date">${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}</span></div>
        <div class="ev-card__body"><div class="ev-card__title">${esc(ev.title)}</div><div class="ev-card__meta">${esc([cat.label, ev.schedule].filter(Boolean).join(" · "))}</div></div>
      </a>`;
}

function render(ev, fiche, related, relatedTitle) {
  const cat = CATEGORIES[ev.category] || { label: "Événement" };
  const title = ev.title;
  const when = dateLabel(ev);
  // Horaires par jour (Destination Nancy) : seulement celui du jour de
  // l'événement quand il dure un jour, sinon la liste complète.
  const single = !ev.endDate || ev.endDate === ev.date;
  const wd = DAYS[d0(ev.date).getDay()];
  const dayHours = fiche.hoursLines.filter((l) => l.toLowerCase().startsWith(wd));
  const hoursShown = single ? [] : fiche.hoursLines;
  const schedule = ev.schedule || (single && dayHours[0] ? dayHours[0].replace(/^\S+\s*:\s*/, "") : "");
  const placeName = fiche.venue && fiche.venue.length < 80 ? fiche.venue : (ev.place || "");
  const city = ev.city || "";
  const streetLine = [fiche.street, [fiche.postalCode, fiche.postalCode ? city : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const addressLine = streetLine || (city && city !== placeName ? city : "");
  const mapsQ = [placeName, fiche.street, fiche.postalCode, city].filter(Boolean).join(", ");
  const priceLines = fiche.priceLines.filter((l) => !/^gratuit$/i.test(l));
  const priceHtml = fiche.free && !priceLines.length ? "Gratuit" : priceLines.map(esc).join("<br>");
  const status = /complet|annul|report/i.test(fiche.eventStatus) ? fiche.eventStatus : "";

  // Image : l'affiche d'origine de la galerie ; l'affiche générée par nous
  // seulement si aucune source n'en fournit.
  let image = ev.image || "";
  if ((!image || /^affiches-auto\//.test(image)) && fiche.image && /^https?:/.test(fiche.image)) image = fiche.image;
  const imageAbs = !image ? "" : image.startsWith("http") ? image : `${SITE}/${image}`;
  const imageSrc = !image ? "" : image.startsWith("http") ? image : `/${image}`;
  const generatedPoster = /^affiches-(auto|sport)\//.test(image);
  const imgCredit = !generatedPoster && image.startsWith("http") ? sourceName(fiche.sources.find((u) => !isFacebookUrl(u)) || ev.url) : "";

  const chips = [`<span class="chip chip--cat">${esc(cat.label)}</span>`]
    .concat((ev.subcats || []).filter((s) => normKey(s) !== normKey(cat.label)).slice(0, 2).map((s) => `<span class="chip">${esc(s)}</span>`))
    .concat(fiche.free ? ['<span class="chip chip--free">Gratuit</span>'] : [])
    .concat(ev.reservation && !fiche.free ? ['<span class="chip">Sur réservation</span>'] : [])
    .concat(status ? [`<span class="chip chip--alert">${esc(status)}</span>`] : []);

  const mainTicket = fiche.tickets[0];
  const officialUrl = fiche.sources[0] || "";
  const cta = mainTicket
    ? `<a class="btn btn--primary" href="${esc(mainTicket.url)}" target="_blank" rel="noopener">${esc(ticketLabel(mainTicket))} ${ICON.out}</a>`
    : officialUrl
      ? `<a class="btn btn--primary" href="${esc(officialUrl)}" target="_blank" rel="noopener">Voir sur ${esc(onSite(sourceName(officialUrl)))} ${ICON.out}</a>`
      : "";
  const seenLabels = new Set([mainTicket ? ticketLabel(mainTicket) : ""]);
  const otherTickets = fiche.tickets.slice(1).filter((t) => !seenLabels.has(t.label) && seenLabels.add(t.label)).map((t) => `<a class="link-out" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.label)} ${ICON.out}</a>`).join("");

  const descSource = fiche.descFrom ? sourceName(fiche.descFrom) : "";
  // Texte affiché en entier jusqu'à ABOUT_SCROLL caractères ; au-delà (une
  // quinzaine de pages), cadre à hauteur fixe qui défile à l'intérieur.
  const aboutLong = String(fiche.description || "").length > ABOUT_SCROLL;
  const about = fiche.description
    ? `<div class="about${aboutLong ? " about--long" : ""}"${aboutLong ? ' tabindex="0"' : ""} aria-label="Description complète">${descHtml(fiche.description)}</div>
        <p class="about__credit">Texte : ${esc(descSource)}${fiche.descFrom ? ` · <a href="${esc(fiche.descFrom)}" target="_blank" rel="noopener">page d'origine</a>` : ""}</p>`
    : `<p class="about__empty">L'organisateur n'a pas encore publié de description détaillée.${officialUrl ? ` Les dernières informations sont sur <a href="${esc(officialUrl)}" target="_blank" rel="noopener">${esc(sourceName(officialUrl))}</a>.` : ""}</p>`;

  const practical = fiche.practical && fiche.practical.length < 1200 && !fiche.description.includes(fiche.practical.slice(0, 40))
    ? `<h3 class="practical__title">Infos pratiques</h3><div class="practical">${descHtml(fiche.practical)}</div>` : "";

  const sourcesList = fiche.sources.slice(0, 4).map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${isFacebookUrl(u) ? "Événement Facebook" : "Page officielle : " + esc(sourceName(u))}</a></li>`).join("");
  const checked = fiche.checkedAt ? `Infos vérifiées le ${fmtLong(fiche.checkedAt).replace(/^\w+ /, "")}.` : "";

  const favKey = normKey(ev.title) + "|" + (ev.date || "") + "|" + normKey(ev.place) + "|" + normKey(ev.city);
  const startTime = firstTime(schedule);
  const endTime = (() => { const m = String(schedule).match(/à\s*(\d{1,2})\s*h\s*(\d{2})?/i); return m ? `${String(m[1]).padStart(2, "0")}:${m[2] || "00"}` : ""; })();

  // Résumé pour Google et les aperçus de partage (≈155 caractères).
  const lead = (fiche.description || "").replace(/\s+/g, " ").trim();
  const metaDesc = (`${when}${schedule ? ", " + schedule : ""}, ${placeName || city}${placeName && city && placeName !== city ? " (" + city + ")" : ""}. ` + lead).slice(0, 158).replace(/\s+\S*$/, "") + (lead ? "…" : "");
  const canonical = `${SITE}/evenement/${ev._slug}/`;
  const pageTitle = `${title}, ${when.replace(/^(\w+) /, "")}${placeName ? " · " + placeName : ""} | Agenda du Grand-Nancy`;

  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    startDate: ev.date + (startTime ? `T${startTime}` : ""),
    endDate: (ev.endDate || ev.date) + (endTime && (!ev.endDate || ev.endDate === ev.date) ? `T${endTime}` : ""),
    eventStatus: /annul/i.test(status) ? "https://schema.org/EventCancelled" : /report/i.test(status) ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: placeName || city,
      address: { "@type": "PostalAddress", ...(fiche.street ? { streetAddress: fiche.street } : {}), ...(fiche.postalCode ? { postalCode: fiche.postalCode } : {}), addressLocality: city || "Nancy", addressRegion: "Grand Est", addressCountry: "FR" },
    },
    ...(imageAbs ? { image: [imageAbs] } : {}),
    ...(lead ? { description: lead.slice(0, 500) } : {}),
    ...(fiche.free ? { isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", url: canonical, availability: "https://schema.org/InStock" } }
      : mainTicket ? { offers: { "@type": "Offer", url: mainTicket.url, priceCurrency: "EUR", ...(priceFrom(priceLines) ? { price: priceFrom(priceLines) } : {}), availability: /complet/i.test(status) ? "https://schema.org/SoldOut" : "https://schema.org/InStock" } } : {}),
    url: canonical,
  };
  const ldJson = JSON.stringify(ld).replace(/<\//g, "<\\/");

  const dataAttrs = `data-fav-key="${esc(favKey)}" data-fav-end="${esc(ev.endDate || ev.date)}" data-title="${esc(title)}" data-start="${esc(ev.date)}" data-end="${esc(ev.endDate || ev.date)}" data-time="${esc(startTime)}" data-time-end="${esc(endTime)}" data-place="${esc([placeName, fiche.street, fiche.postalCode, city].filter(Boolean).join(", "))}" data-url="${esc(canonical)}"`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Agenda du Grand-Nancy">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${imageAbs ? `<meta property="og:image" content="${esc(imageAbs)}">\n  <meta name="twitter:card" content="summary_large_image">` : ""}
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>if(window.top!==window.self)document.documentElement.className+=" embedded";</script>
  <link rel="stylesheet" href="/evenement.css?v=${VER}">
  <script type="application/ld+json">${ldJson}</script>
</head>
<body>
  <header class="top">
    <div class="wrap top__inner">
      <a class="brand" href="/">Agenda du <span>Grand-Nancy</span></a>
      <a class="btn btn--ghost" href="/">${ICON.back} Tout l'agenda</a>
    </div>
  </header>

  <main class="wrap" ${dataAttrs}>
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="/">Agenda</a><span aria-hidden="true">/</span><a href="/?cat=${esc(ev.category || "")}">${esc(cat.label)}</a><span aria-hidden="true">/</span><span>${esc(title)}</span></nav>

    <div class="layout">
      <figure class="poster">
        ${imageSrc ? `<div class="poster__frame"><img src="${esc(imageSrc)}" alt="Affiche : ${esc(title)}" decoding="async" fetchpriority="high" referrerpolicy="no-referrer"${ev.fallbackImage ? ` data-fallback="/${esc(ev.fallbackImage)}" onerror="if(!this.dataset.u){this.dataset.u=1;this.src=this.dataset.fallback}"` : ""}></div>` : ""}
        ${imgCredit ? `<figcaption>Affiche : ${esc(imgCredit)}</figcaption>` : ""}
      </figure>

      <div class="facts">
        <div class="chips">${chips.join("")}</div>
        <h1>${esc(title)}</h1>
        <dl class="infos">
          <div><span class="infos__icon">${ICON.cal}</span><div><dt>Quand</dt><dd><strong>${esc(when)}</strong>${schedule ? `<br>${esc(schedule)}` : ""}${hoursShown.length > 1 ? `<br><span class="muted">${hoursShown.map(esc).join(" · ")}</span>` : ""}</dd></div></div>
          ${placeName || city ? `<div><span class="infos__icon">${ICON.pin}</span><div><dt>Où</dt><dd><strong>${esc(placeName || city)}</strong>${addressLine ? `<br>${esc(addressLine)}` : ""}<br><a href="${esc(mapsUrl(mapsQ || city))}" target="_blank" rel="noopener">Itinéraire</a></dd></div></div>` : ""}
          ${priceHtml ? `<div><span class="infos__icon">${ICON.ticket}</span><div><dt>Tarif</dt><dd>${priceHtml}</dd></div></div>` : ""}
          ${fiche.audience ? `<div><span class="infos__icon">${ICON.people}</span><div><dt>Public</dt><dd>${esc(fiche.audience)}</dd></div></div>` : ""}
        </dl>
        <div class="actions">
          ${cta}
          ${otherTickets ? `<div class="links-out">${otherTickets}</div>` : ""}
          <div class="actions__row">
            <button type="button" class="btn btn--ghost js-fav" aria-pressed="false">${ICON.heart}<span>Favori</span></button>
            <button type="button" class="btn btn--ghost js-ics">${ICON.calAdd}<span>Mon agenda</span></button>
            <button type="button" class="btn btn--ghost js-share">${ICON.share}<span>Partager</span></button>
          </div>
        </div>
        ${sourcesList ? `<div class="box box--desk"><h2 class="box__title">Infos officielles</h2><ul>${sourcesList}</ul>${checked ? `<p class="muted">${esc(checked)} Un changement ? <a href="https://wa.me/33749326481?text=${encodeURIComponent("Bonjour, une info à corriger sur " + canonical)}" target="_blank" rel="noopener">Signalez-le</a></p>` : ""}</div>` : ""}
      </div>

      <section class="about-wrap">
        <h2>À propos</h2>
        ${about}
        ${practical}
        ${sourcesList ? `<div class="box box--mob"><h2 class="box__title">Infos officielles</h2><ul>${sourcesList}</ul>${checked ? `<p class="muted">${esc(checked)} Un changement ? <a href="https://wa.me/33749326481?text=${encodeURIComponent("Bonjour, une info à corriger sur " + canonical)}" target="_blank" rel="noopener">Signalez-le</a></p>` : ""}</div>` : ""}
      </section>
    </div>

    ${related.length ? `<section class="block related">
      <h2>${esc(relatedTitle)}</h2>
      <div class="cards">
      ${related.map(card).join("\n      ")}
      </div>
    </section>` : ""}
  </main>

  <footer class="foot"><div class="wrap foot__inner"><a href="/">agenda-grandnancy.fr : tous les événements du Grand Nancy</a><a href="/mentions-legales.html">Mentions légales</a></div></footer>
  ${cta ? `<div class="sticky-cta">${cta}</div>` : ""}
  <script src="/evenement.js?v=${VER}" defer></script>
  <script data-goatcounter="https://gabz.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

function priceFrom(lines) {
  const nums = lines.join(" ").match(/\d+(?:[,.]\d{1,2})?(?=\s?€)/g);
  if (!nums) return "";
  return String(Math.min(...nums.map((n) => Number(n.replace(",", ".")))));
}

// ── CSS et JS communs ────────────────────────────────────────────────────────

const CSS = `:root{--bg:#faf7f2;--ink:#1c1a17;--soft:#6b6358;--accent:#c4452f;--accent-deep:#9c2d1c;--card:#fff;--line:#e8e1d6;--tint:#f6e3de;--radius:16px;--shadow:0 1px 2px rgba(28,26,23,.04),0 12px 32px -16px rgba(28,26,23,.18)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent-deep)}a:hover{color:#7a2214}
.wrap{max-width:1160px;margin:0 auto;padding:0 24px}
.top{background:#fffdf9;border-bottom:1px solid var(--line)}
.top__inner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;padding-bottom:12px;flex-wrap:wrap}
.brand{font-family:Fraunces,Georgia,serif;font-weight:900;font-size:22px;color:var(--ink);text-decoration:none;letter-spacing:-.01em}.brand span{color:var(--accent);font-style:italic}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border-radius:999px;font:inherit;font-weight:500;text-decoration:none;cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink)}
.btn:hover{border-color:#d6cbbb;color:var(--ink)}.btn--primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600;font-size:16px;min-height:54px;width:100%;text-align:center;line-height:1.25;padding:8px 20px}
.btn--primary:hover{background:var(--accent-deep);border-color:var(--accent-deep);color:#fff}.btn[aria-pressed=true]{background:var(--tint);border-color:#e9c3b9;color:var(--accent-deep)}
.btn[aria-pressed=true] svg{fill:currentColor}
.crumbs{font-size:14px;color:var(--soft);display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}.crumbs a{color:var(--soft)}
.crumbs span:last-child{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60ch}
.layout{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(320px,1fr);grid-template-areas:"poster facts" "about facts";grid-template-rows:auto 1fr;column-gap:44px;row-gap:40px;align-items:start}
.poster{grid-area:poster;margin:0;min-width:0}.about-wrap{grid-area:about;min-width:0}
.about-wrap h2{margin:0 0 14px;font-family:Fraunces,Georgia,serif;font-weight:900;font-size:28px;letter-spacing:-.01em}
.practical__title{font-size:17px;margin:24px 0 8px}
.poster__frame{background:#141210;border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);display:flex;justify-content:center}
.poster__frame img{display:block;max-width:100%;max-height:78vh;width:auto;height:auto;object-fit:contain}
.poster figcaption{font-size:13px;color:var(--soft);margin-top:8px}
.facts{grid-area:facts;min-width:0;display:flex;flex-direction:column;gap:20px;position:sticky;top:16px}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{display:inline-flex;align-items:center;padding:5px 12px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:13px;font-weight:500}
.chip--cat{background:var(--tint);border-color:var(--tint);color:var(--accent-deep);font-weight:600}.chip--free{background:#e3f1e6;border-color:#e3f1e6;color:#1f5a2e;font-weight:600}.chip--alert{background:#1c1a17;border-color:#1c1a17;color:#fff;font-weight:600}
h1{margin:0;font-family:Fraunces,Georgia,serif;font-weight:900;font-size:clamp(34px,5vw,54px);line-height:1.04;letter-spacing:-.02em;overflow-wrap:anywhere}
.infos{margin:0;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:4px 20px}
.infos>div{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #efe9df}.infos>div:last-child{border-bottom:0}
.infos__icon{color:var(--accent);flex-shrink:0;margin-top:2px}dt{font-size:13px;color:var(--soft)}dd{margin:0}
.muted{color:var(--soft);font-size:14px}
.actions{display:flex;flex-direction:column;gap:10px}.actions__row{display:flex;gap:10px;flex-wrap:wrap}.actions__row .btn{flex:1 1 0;padding:0 10px;font-size:15px;white-space:nowrap}
.links-out{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:15px}.link-out{display:inline-flex;align-items:center;gap:4px}
.block h2,.related h2{margin:0 0 14px;font-family:Fraunces,Georgia,serif;font-weight:900;font-size:28px;letter-spacing:-.01em}
.about{padding:4px 0;font-size:17px}
.about--long{max-height:40rem;overflow-y:auto;padding:4px 18px 4px 0;overscroll-behavior:contain;
  background:linear-gradient(var(--bg) 30%,rgba(250,247,242,0)) center top,linear-gradient(rgba(250,247,242,0),var(--bg) 70%) center bottom,radial-gradient(farthest-side at 50% 0,rgba(28,26,23,.14),transparent) center top,radial-gradient(farthest-side at 50% 100%,rgba(28,26,23,.14),transparent) center bottom;
  background-repeat:no-repeat;background-size:100% 40px,100% 40px,100% 12px,100% 12px;background-attachment:local,local,scroll,scroll}
.about p{margin:0 0 14px;max-width:70ch}.about:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:8px}
.about__credit{font-size:13px;color:var(--soft);margin:10px 0 0}.about__empty{color:var(--soft)}
.practical p{margin:0 0 10px}
.box{background:#fffdf9;border:1px solid var(--line);border-radius:var(--radius);padding:20px 22px}
.box__title{margin:0 0 10px!important;font-family:Inter,system-ui,sans-serif!important;font-size:13px!important;font-weight:700!important;text-transform:uppercase;letter-spacing:.08em;color:var(--soft)}
.box--mob{display:none;margin-top:28px}.box ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}.box .muted{margin:14px 0 0;font-size:13px}
.block{margin-top:52px}.cols .block{margin-top:0}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
.ev-card{text-decoration:none;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .2s}
.ev-card:hover{box-shadow:var(--shadow);color:var(--ink)}
.ev-card__media{aspect-ratio:3/2;background:#2a2f4a;position:relative;overflow:hidden}.ev-card__media img{width:100%;height:100%;object-fit:cover;display:block}
.ev-card__date{position:absolute;left:12px;bottom:12px;background:#fff;border-radius:10px;padding:3px 10px;font-size:13px;font-weight:700}
.ev-card__body{padding:12px 14px 16px}.ev-card__title{font-weight:700;line-height:1.3}.ev-card__meta{font-size:14px;color:var(--soft)}
.foot{border-top:1px solid var(--line);background:#fffdf9;margin-top:64px}.foot__inner{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:26px;padding-bottom:26px;font-size:14px}.foot a{color:var(--soft)}
.sticky-cta{display:none}
/* Ouverte en panneau depuis la galerie : la barre du panneau remplace l'en-tête. */
html.embedded .top,html.embedded .crumbs,html.embedded .foot{display:none}html.embedded main{padding-top:24px}
@media (min-width:721px){html.embedded .facts{padding-right:52px}}
.top .btn--close{width:46px;padding:0;font-size:0}
.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;z-index:20}
@media (max-width:720px){
  .wrap{padding:0 16px}.brand{font-size:18px}.top .btn{min-height:40px;padding:0 12px;font-size:14px}
  .layout{grid-template-columns:minmax(0,1fr);grid-template-areas:"poster" "facts" "about";row-gap:24px}.facts{position:static}
  .poster{margin:0 -16px}.poster__frame{border-radius:0}.poster figcaption{padding:0 16px}
  .poster__frame img{max-height:none;width:100%}
  .about{font-size:16px}.about--long{max-height:70vh}
  .box--desk{display:none}.box--mob{display:block}
  .actions__row{flex-wrap:nowrap;gap:8px}.actions__row .btn{font-size:14px;padding:0 8px;gap:6px}
  .cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ev-card__body{padding:10px 10px 12px}.ev-card__title{font-size:15px}
  .actions .btn--primary{display:none}
  .sticky-cta{display:block;position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(12px + env(safe-area-inset-bottom));background:#fffdf9;border-top:1px solid var(--line);box-shadow:0 -8px 24px -12px rgba(28,26,23,.25);z-index:10}
  .sticky-cta .btn--primary{display:flex}
  body{padding-bottom:84px}
}
@media (prefers-color-scheme:dark){
  :root{--bg:#171513;--ink:#f1ece4;--soft:#b3a99b;--card:#221f1c;--line:#3a352f;--tint:#3b2620;--accent:#e0654d;--accent-deep:#f08a74}
  .top,.box,.foot,.sticky-cta{background:#1d1a17}.btn,.infos,.ev-card,.chip{background:#221f1c;color:var(--ink)}
  .chip--cat{background:var(--tint);border-color:var(--tint);color:#f3b3a4}.chip--free{background:#1e3324;border-color:#1e3324;color:#9fd6ab}
  .ev-card__date{background:#221f1c;color:var(--ink)}a:hover{color:#f8a996}.infos>div{border-color:var(--line)}
  .about--long{background:linear-gradient(var(--bg) 30%,rgba(23,21,19,0)) center top,linear-gradient(rgba(23,21,19,0),var(--bg) 70%) center bottom,radial-gradient(farthest-side at 50% 0,rgba(0,0,0,.5),transparent) center top,radial-gradient(farthest-side at 50% 100%,rgba(0,0,0,.5),transparent) center bottom;background-repeat:no-repeat;background-size:100% 40px,100% 40px,100% 12px,100% 12px;background-attachment:local,local,scroll,scroll}
}
`;

const JS = `(function(){
var inSheet=window.top!==window.self;
// Dans le panneau de la galerie : tout lien vers l'agenda ferme le panneau, et
// la galerie suit les changements de page (adresse affichée).
if(inSheet){try{parent.postMessage({evsheet:"page",path:location.pathname},location.origin)}catch(_){}}
document.querySelectorAll('a[href="/"]').forEach(function(a){a.addEventListener("click",function(e){
  if(inSheet){e.preventDefault();parent.postMessage({evsheet:"close"},location.origin);return}
  // Page ouverte seule : retour à la galerie telle qu'on l'a laissée si on en vient.
  try{var r=document.referrer&&new URL(document.referrer);if(r&&r.origin===location.origin&&history.length>1){e.preventDefault();history.back()}}catch(_){}})});
var m=document.querySelector("main[data-fav-key]");if(!m)return;var d=m.dataset;
function toast(t){var e=document.createElement("div");e.className="toast";e.textContent=t;document.body.appendChild(e);setTimeout(function(){e.remove()},2200)}
// Favoris : même stockage que la galerie (events-core.js, clé agenda-nancy:favoris).
var KEY="agenda-nancy:favoris";function load(){try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return{}}}
function save(f){try{localStorage.setItem(KEY,JSON.stringify(f))}catch(e){}}
var fav=document.querySelector(".js-fav");function paint(){var on=d.favKey in load();fav.setAttribute("aria-pressed",on);fav.querySelector("span").textContent=on?"Dans vos favoris":"Favori"}
if(fav){paint();fav.addEventListener("click",function(){var f=load();if(d.favKey in f)delete f[d.favKey];else f[d.favKey]=d.favEnd;save(f);paint()})}
// Ajouter à mon agenda : fichier .ics (Apple, Google, Outlook l'ouvrent tous).
var ics=document.querySelector(".js-ics");if(ics)ics.addEventListener("click",function(){
  function dt(day,t){return day.replace(/-/g,"")+(t?"T"+t.replace(":","")+"00":"")}
  var allDay=!d.time,end=d.end;if(allDay){var x=new Date(d.end+"T12:00:00");x.setDate(x.getDate()+1);end=x.toISOString().slice(0,10)}
  var endT=d.timeEnd||(d.time?String((parseInt(d.time,10)+2)%24).padStart(2,"0")+d.time.slice(2):"");
  var e=function(s){return String(s).replace(/([,;\\\\])/g,"\\\\$1")};
  var lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//agenda-grandnancy.fr//FR","BEGIN:VEVENT","UID:"+d.url,"DTSTAMP:"+new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z",
    (allDay?"DTSTART;VALUE=DATE:":"DTSTART:")+dt(d.start,d.time),(allDay?"DTEND;VALUE=DATE:":"DTEND:")+dt(d.time?d.start:end,d.time?endT:""),
    "SUMMARY:"+e(d.title),"LOCATION:"+e(d.place),"URL:"+d.url,"END:VEVENT","END:VCALENDAR"];
  var b=new Blob([lines.join("\\r\\n")],{type:"text/calendar"});var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="evenement.ics";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500)});
// Partager : feuille de partage du téléphone, sinon copie du lien.
var sh=document.querySelector(".js-share");if(sh)sh.addEventListener("click",function(){
  if(navigator.share){navigator.share({title:d.title,url:d.url}).catch(function(){})}
  else if(navigator.clipboard){navigator.clipboard.writeText(d.url).then(function(){toast("Lien copié")})}
  else{prompt("Lien de la page",d.url)}});
})();
`;

// ── Construction ─────────────────────────────────────────────────────────────

// Mots significatifs d'un titre, pour écarter les doublons d'un même événement
// (« Opéra - Voyage en Italie » et « Voyage en Italie - Berlioz… »).
const STOP = new Set("le la les de des du un une et en au aux a à pour par sur avec dans the of and".split(" "));
const words = (t) => new Set(slugify(t).split("-").filter((w) => w.length > 2 && !STOP.has(w)));
function sameShow(a, b) {
  const A = words(a.title), B = words(b.title);
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n >= Math.min(2, A.size, B.size) && n > 0;
}

function main() {
  VER = crypto.createHash("sha1").update(CSS + JS).digest("hex").slice(0, 8);
  if (!fs.existsSync(DIST)) { console.error(`gen-pages : dossier ${DIST} introuvable`); process.exit(1); }
  const upcoming = EVENTS.filter((e) => e && e.title && e.date && (e.endDate || e.date) >= TODAY);
  const used = new Set();
  for (const ev of upcoming) {
    let s = pageSlug(ev);
    while (used.has(s)) s += "-b";
    used.add(s);
    ev._slug = s;
  }
  // Index par lieu pour « Prochainement au même endroit ».
  const byPlace = new Map();
  for (const ev of upcoming) {
    const k = normKey(ev.place) + "|" + normKey(ev.city);
    if (!normKey(ev.place)) continue;
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(ev);
  }
  for (const list of byPlace.values()) list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const byDay = new Map();
  for (const ev of upcoming) { if (!byDay.has(ev.date)) byDay.set(ev.date, []); byDay.get(ev.date).push(ev); }

  const outDir = path.join(DIST, "evenement");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(DIST, "evenement.css"), CSS);
  fs.writeFileSync(path.join(DIST, "evenement.js"), JS);

  let withDesc = 0, withTicket = 0;
  for (const ev of upcoming) {
    const fiche = ficheFor(ev);
    if (fiche.description.length >= 200) withDesc++;
    if (fiche.tickets.length) withTicket++;
    const k = normKey(ev.place) + "|" + normKey(ev.city);
    const seenShows = [ev];
    const keep = (x) => { if (x === ev || seenShows.some((y) => sameShow(x, y))) return false; seenShows.push(x); return true; };
    let related = (byPlace.get(k) || []).filter(keep).slice(0, 4);
    let relatedTitle = related.length ? `Prochainement : ${ev.place}` : "";
    if (related.length < 2) {
      seenShows.length = 1;
      related = (byDay.get(ev.date) || []).filter(keep)
        .sort((a, b) => (normKey(b.city) === normKey(ev.city)) - (normKey(a.city) === normKey(ev.city)) || (b.image ? 1 : 0) - (a.image ? 1 : 0))
        .slice(0, 4);
      relatedTitle = related.length ? `Le même jour dans le Grand Nancy` : "";
    }
    const dir = path.join(outDir, ev._slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), render(ev, fiche, related, relatedTitle));
  }

  // Champ `page` dans dist/data.js (même ordre que data.js : simple copie).
  const pData = path.join(DIST, "data.js");
  if (fs.existsSync(pData)) {
    const code = fs.readFileSync(pData, "utf8");
    const d = new Function(code + "; return { CATEGORIES, GENERATED_AT: typeof GENERATED_AT !== 'undefined' ? GENERATED_AT : null, EVENTS };")();
    // Clé sans uuid : dist/data.js peut déjà être « durci » (uuid retiré).
    const keyOf = (e) => [e.title, e.date, e.endDate || e.date, e.place, e.city, e.url].join("|");
    const slugOf = new Map(upcoming.map((e) => [keyOf(e), e._slug]));
    let n = 0;
    for (const e of d.EVENTS) {
      const s = slugOf.get(keyOf(e));
      if (s) { e.page = `/evenement/${s}/`; n++; }
    }
    fs.writeFileSync(pData, "const CATEGORIES=" + JSON.stringify(d.CATEGORIES) + ";const GENERATED_AT=" + JSON.stringify(d.GENERATED_AT) + ";const EVENTS=" + JSON.stringify(d.EVENTS) + ";");
    console.log(`  data.js : lien vers la page posé sur ${n} événements`);
  }

  // Sitemap : une entrée par page.
  const pMap = path.join(DIST, "sitemap.xml");
  if (fs.existsSync(pMap)) {
    const urls = upcoming.map((e) => `  <url>\n    <loc>${SITE}/evenement/${e._slug}/</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`).join("\n");
    const xml = fs.readFileSync(pMap, "utf8").replace(/<\/urlset>\s*$/, urls + "\n</urlset>\n");
    fs.writeFileSync(pMap, xml);
  }
  console.log(`  pages événement : ${upcoming.length} écrites dans evenement/ (${withDesc} avec description complète, ${withTicket} avec billetterie)`);
}

if (require.main === module) main();
module.exports = { pageSlug, ficheFor, dateLabel, descHtml };
