/**
 * fiche-extract.js : lit la page d'un événement chez sa source et en sort une
 * fiche complète (description longue, tarifs, billetterie, lieu, affiche).
 *
 * Fonction pure, sans réseau : extractFiche(html, url) → objet. Le réseau, le
 * cache et le débit sont gérés par enrich-fiches.js.
 *
 * Stratégie, du plus précis au plus général :
 *   1. règles propres au site (le bloc exact qui porte la description, le
 *      tableau des tarifs, le bouton de réservation) ;
 *   2. données structurées schema.org/Event (JSON-LD) quand le site en publie ;
 *   3. lecteur « mode lecture » (Readability, comme Firefox) sur la page ;
 *   4. balises de partage (og:description, og:image).
 * On garde le texte le plus complet qui reste propre à l'événement.
 *
 * Le lecteur (linkedom + @mozilla/readability) est embarqué dans
 * vendor/lecteur-pages.js : un seul fichier, aucun npm install nécessaire.
 */
"use strict";
const path = require("path");
const { parseHTML, Readability } = require(path.join(__dirname, "vendor", "lecteur-pages.js"));

// ── Texte lisible depuis un nœud HTML (paragraphes et sauts de ligne gardés) ──

const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
  "TABLE", "TR", "BLOCKQUOTE", "HEADER", "FOOTER", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "PRE", "ASIDE", "MAIN", "NAV"]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "BUTTON", "FORM", "IFRAME", "TEMPLATE", "SELECT", "INPUT", "IMG", "VIDEO", "AUDIO"]);

function nodeText(root) {
  let out = "";
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, " "); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (SKIP.has(tag)) return;
    if (tag === "BR") { out += "\n"; return; }
    const block = BLOCK.has(tag);
    if (block) out += "\n\n";
    if (tag === "LI") out += "• ";
    if (tag === "TD" || tag === "TH") out += " ";
    for (const c of n.childNodes) walk(c);
    if (block) out += "\n\n";
  };
  walk(root);
  return tidy(out);
}

function tidy(s) {
  return String(s || "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Texte venu d'un champ « plat » (JSON-LD, meta) : HTML éventuel retiré, et
// les phrases collées par la source (« névroses.Après ») séparées.
function flatText(s) {
  if (!s) return "";
  let t = String(s);
  if (/<[a-z][^>]*>/i.test(t)) {
    const { document } = parseHTML(`<html><body><div id="x">${t}</div></body></html>`);
    t = nodeText(document.getElementById("x"));
  } else {
    t = decodeEntities(t);
  }
  return tidy(t.replace(/([a-zà-ÿ0-9»)!?…][.!?…])(?=[A-ZÀ-Ý«])/g, "$1\n"));
}

function decodeEntities(s) {
  const { document } = parseHTML(`<html><body><textarea id="t">${String(s).replace(/</g, "&lt;")}</textarea></body></html>`);
  return document.getElementById("t").textContent;
}

// ── JSON-LD schema.org ───────────────────────────────────────────────────────

function ldEvents(document) {
  const out = [];
  const flat = (x) => Array.isArray(x) ? x.flatMap(flat) : (x && x["@graph"]) ? flat(x["@graph"]) : [x];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let j;
    try { j = JSON.parse(s.textContent.replace(/[\u0000-\u001f]+/g, " ")); } catch (_) { continue; }
    for (const o of flat(j)) {
      const t = o && o["@type"];
      if (t && /Event|Festival|TheaterEvent|MusicEvent|Exhibition/i.test(Array.isArray(t) ? t.join(" ") : t)) out.push(o);
    }
  }
  return out;
}

function ldPlace(loc) {
  if (!loc) return {};
  if (Array.isArray(loc)) loc = loc[0];
  if (typeof loc === "string") return { venue: loc };
  const a = loc.address || {};
  if (typeof a === "string") return { venue: loc.name || "", address: a };
  return {
    venue: loc.name || "",
    street: a.streetAddress || "",
    postalCode: a.postalCode || "",
    city: a.addressLocality || "",
  };
}

function ldPrice(offers, declaredFree) {
  if (!offers) return null;
  const list = (Array.isArray(offers) ? offers : [offers]).filter(Boolean);
  const lines = [];
  let ticketUrl = "";
  for (const o of list) {
    if (o.url && !ticketUrl) ticketUrl = o.url;
    const cur = (o.priceCurrency || "EUR") === "EUR" ? "€" : (o.priceCurrency || "");
    const lo = o.lowPrice ?? o.price, hi = o.highPrice;
    if (lo === undefined || lo === null || lo === "") continue;
    const n = Number(String(lo).replace(",", "."));
    // Un prix à 0 sans « isAccessibleForFree » est souvent un champ non rempli
    // (Zénith) : on ne le prend pas pour un événement gratuit.
    if (Number.isFinite(n) && n === 0) { if (declaredFree) lines.push("Gratuit"); continue; }
    const label = o.name ? `${o.name} : ` : "";
    lines.push(hi && hi !== lo ? `${label}de ${fmtEuro(lo)} à ${fmtEuro(hi)} ${cur}`.trim() : `${label}${fmtEuro(lo)} ${cur}`.trim());
  }
  return { lines: [...new Set(lines)], ticketUrl };
}

function fmtEuro(v) {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

// ── Liens de réservation ─────────────────────────────────────────────────────

const TICKET_HOSTS = /billetterie|ticket|fnac|francebillet|weezevent|helloasso|digitick|seetickets|placeminute|shotgun|yurplan|billetweb|eventbrite|festik|tickandlive|mapado|infoconcert|ticketmaster|dice\.fm|carrefourspectacles|leclercbilletterie/i;
const TICKET_WORDS = /billet|r[ée]serv|ticket|acheter|prendre (ma|une|vos|des) place|inscri/i;
const NAV_JUNK = /^(billetterie|accueil et billetterie|infos pratiques)$/i;

function ticketLinks(scope, pageUrl) {
  const out = [];
  const seen = new Set();
  for (const a of scope.querySelectorAll("a[href]")) {
    let href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try { href = new URL(href, pageUrl).href; } catch (_) { continue; }
    const label = tidy(a.textContent).replace(/\s+/g, " ");
    const hit = TICKET_HOSTS.test(href) || TICKET_WORDS.test(label);
    if (!hit || label.length > 60) continue;
    if (/facebook\.com\/sharer|twitter\.com|x\.com\/intent|whatsapp|linkedin/.test(href)) continue;
    if (href.split("#")[0] === pageUrl.split("#")[0]) continue;
    if (/\.pdf($|\?)|cgv|conditions-generales|mentions-legales/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ label: TICKET_WORDS.test(label) ? label : "Billetterie", url: href, raw: label });
  }
  return out;
}

// ── Règles propres à chaque site ─────────────────────────────────────────────
// desc : sélecteurs dont le texte (concaténé) est la description.
// drop : lignes à retirer (bandeaux, mentions de partage…).
// extra(document, fiche) : compléments (tarifs, public, billetterie…).

const SITES = [
  {
    host: /(^|\.)nancy\.fr$/,             // Ville de Nancy et salle Poirel
    desc: (d) => {
      const more = d.querySelector("#more-description");
      const box = more ? more.parentElement : null;
      return box ? [box] : [...d.querySelectorAll(".description-text")];
    },
    extra(d, f) {
      const p = d.querySelector('[itemprop="price"]');
      if (p && p.getAttribute("content")) f.priceLines = splitPrices(p.getAttribute("content"));
      for (const i of d.querySelectorAll("i.bi-people")) { const t = tidy(i.parentElement.textContent); if (t) { f.audience = t; break; } }
      // « Billetterie en ligne » (lien direct vers la séance) avant tout autre lien.
      const links = [...d.querySelectorAll("a[href]")].filter((a) => /^https?:/.test(a.getAttribute("href") || "") && !/nancy\.fr\/agenda/.test(a.getAttribute("href")));
      const best = links.find((a) => /EventId=|seance|s%C3%A9ance|product\//i.test(a.getAttribute("href"))) || links.find((a) => /billetterie\s+en\s+ligne/i.test(a.textContent)) || links.find((a) => /billetterie|r[ée]server/i.test(a.textContent));
      if (best) f.tickets.unshift({ label: "Billetterie", url: best.getAttribute("href") });
      const place = d.querySelector("#place");
      if (place) {
        const okName = (e) => !/voir\s+la\s+fiche|^\s*lieu\s*$/i.test(e.textContent);
        const name = [...place.querySelectorAll("a.place-link")].find(okName) || [...place.querySelectorAll("h3, h4, strong")].find(okName);
        const txt = nodeText(place).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
          .filter((l) => !/^(lieu|voir la fiche du lieu|partager|facebook|copier le lien)$/i.test(l) && !/voir\s+la\s+fiche/i.test(l));
        if (name) f.venue = f.venue || tidy(name.textContent).replace(/\s+/g, " ");
        if (!f.venue) f.venue = txt.find((l) => !/voir\s+la\s+fiche/i.test(l)) || "";
        const cp = txt.find((l) => /^\d{5}\s/.test(l));
        if (cp) { f.postalCode = cp.slice(0, 5); f.city = cp.slice(6).trim(); }
        const street = txt.find((l) => l !== f.venue && /\d|rue|avenue|boulevard|place|quai|allée|chemin/i.test(l) && l !== cp);
        if (street) f.street = street;
      }
    },
  },
  {
    host: /destination-nancy\.com$/,
    desc: (d) => [...d.querySelectorAll("#a-propos .wp-block-wp-etourisme-v3-text")].slice(0, 1),
    extra(d, f) {
      const rows = [...d.querySelectorAll(".wpet-table__line")];
      const lines = [];
      for (const r of rows) {
        const th = r.querySelector("th"), td = r.querySelector("td");
        if (!th || !td) continue;
        const label = tidy(th.textContent).replace(/^Tarifs de base\s*:\s*/i, "");
        const val = tidy(td.textContent).replace(/Non communiqu[ée]/i, "").trim();
        if (!val || /^[–-]$/.test(val)) continue;
        if (/€|gratuit/i.test(val)) lines.push(`${label} : ${val}`);
        else if (/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/i.test(label) && !/00h$/.test(val)) {
          (f.hoursLines = f.hoursLines || []).push(`${label} : ${val.replace(/^Ouvert /i, "")}`);
        }
      }
      if (lines.length) f.priceLines = lines;
      if (f.street && /^\d+$/.test(f.street)) {
        // JSON-LD tronqué (« 3 ») : l'adresse complète est dans le bloc Adresse.
        const blk = [...d.querySelectorAll("p, div")].find((e) => /^Adresse$/i.test(tidy(e.textContent)));
        const next = blk && blk.nextElementSibling ? nodeText(blk.nextElementSibling).split("\n")[0] : "";
        f.street = next && !/^\d{5}/.test(next) ? next : "";
      }
      for (const a of d.querySelectorAll(".iris-bottom-bar a.generic-button, a[title='Site internet']")) {
        const href = a.getAttribute("href");
        if (href && /^https?:/.test(href)) {
          const label = /site internet/i.test(a.textContent) ? "Site officiel" : "Réserver";
          if (!f.tickets.some((t) => t.url === href)) f.tickets.push({ label, url: href });
        }
      }
    },
  },
  {
    host: /curieux\.(net|app)$/,
    desc: (d) => [...d.querySelectorAll(".block-description")].slice(0, 1),
    extra(d, f, pageUrl) {
      const t = d.querySelector(".data-tickets");
      if (t) f.tickets = ticketLinks(t, pageUrl).concat(f.tickets);
      const info = [...d.querySelectorAll(".bg-light")].map((e) => nodeText(e)).find((s) => /billetterie|horaires|tarif/i.test(s));
      if (info) f.practical = info;
    },
  },
  {
    host: /lautrecanalnancy\.fr$/,
    desc: (d) => [d.querySelector("#node-evt-texte")].filter(Boolean),
    extra(d, f) {
      const infos = d.querySelector(".node-evt-infos, .evt-infos");
      if (infos) f.practical = nodeText(infos);
      const status = [...d.querySelectorAll("span, div")].find((e) => /^(complet|annulé|reporté)$/i.test(tidy(e.textContent)));
      if (status) f.eventStatus = tidy(status.textContent);
      for (const a of d.querySelectorAll("a[href]")) {
        const h = a.getAttribute("href") || "";
        if (/billetterie\.lautrecanalnancy\.fr\/./.test(h) && !/\.pdf|cgv/i.test(h)) { f.tickets.unshift({ label: "Billetterie de L'Autre Canal", url: h }); break; }
      }
    },
    noGenericTickets: true,
  },
  { host: /zenith-de-nancy\.com$/, desc: (d) => [...d.querySelectorAll(".about-us__container__content")].slice(0, 1) },
  {
    host: /vandoeuvre\.fr$/,
    desc: (d) => [...d.querySelectorAll(".article-content")].slice(0, 1),
    drop: [/^>$/],
    tail: true,                           // le bloc finit par « Lieu \n Lieu, rue, ville, France »
    extra(d, f) {
      const all = nodeText(d.body);
      if (/Événement gratuit|Entrée libre|Gratuit/i.test(all)) f.free = true;
    },
  },
  {
    host: /villerslesnancy\.fr$/,
    desc: (d) => [...d.querySelectorAll("#col_left .ce-bodytext, .col_left .ce-bodytext")],
  },
  {
    host: /esseylesnancy\.fr$/,
    desc: (d) => [...d.querySelectorAll(".heading__teaser, .site-content__main .rte")],
  },
  { host: /laxou\.fr$/, desc: (d) => [...d.querySelectorAll(".inner > .mb-4")].slice(0, 1) },
  { host: /ici-c-nancy\.fr$/, desc: (d) => [...d.querySelectorAll(".ic-full-description")].slice(0, 1) },
  {
    host: /lorraineaucoeur\.com$/,
    desc: (d) => [d.querySelector(".itemText")].filter(Boolean),
    drop: [/^(partager|imprimer|envoyer)/i],
  },
  { host: /ludres\.com$/, desc: (d) => [...d.querySelectorAll(".elementor-widget-theme-post-content, .entry-content")].slice(0, 1) },
  { host: /alentoor\.fr$/, desc: () => [] },          // JSON-LD complet
  { host: /facebook\.com$/, desc: () => [] },         // og:description seulement
];

function splitPrices(s) {
  return String(s).split(/\s*[|;]\s*/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Lignes qui ne sont jamais de la description (bandeaux génériques).
const GENERIC_JUNK = [
  /^(partager( sur.*)?|imprimer|retour|voir (plus|moins)|lire la suite|plus d'info(s)?|en savoir plus)$/i,
  /^(facebook|twitter|x|whatsapp|linkedin|copier le lien)$/i,
  /cookies?/i,
];

function cleanDesc(text, drops = []) {
  const lines = tidy(text).split("\n");
  const kept = lines.filter((l) => {
    const t = l.trim();
    if (!t) return true;
    if (GENERIC_JUNK.some((re) => re.test(t))) return false;
    if (drops.some((re) => re.test(t))) return false;
    return true;
  });
  // Paragraphes identiques répétés (versions mobile et bureau d'un même bloc).
  const seen = new Set();
  const paras = tidy(kept.join("\n")).split("\n\n").filter((p) => {
    const k = p.replace(/\s+/g, " ").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return paras.join("\n\n").replace(/([a-zà-ÿ0-9»)!?…][.!?…])(?=[A-ZÀ-Ý«][a-zà-ÿ])/g, "$1\n").trim();
}

function meta(document, name) {
  const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  return el ? (el.getAttribute("content") || "").trim() : "";
}

// Page « introuvable » servie avec un code 200 (cas de ludres.com).
function looksLikeNotFound(document) {
  const title = (document.title || "").toLowerCase();
  const h1 = tidy((document.querySelector("h1") || {}).textContent || "").toLowerCase();
  return /page introuvable|page non trouv|404|not found|n'existe plus|n’existe plus/.test(title + " " + h1);
}

/**
 * @param {string} html  page source complète
 * @param {string} url   adresse de la page (pour résoudre les liens relatifs)
 * @returns {object}     fiche : { description, priceLines, free, tickets[],
 *                         venue, street, postalCode, city, image, audience,
 *                         practical, eventStatus, notFound, method }
 */
function extractFiche(html, url) {
  const { document } = parseHTML(html);
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; } })();
  const site = SITES.find((s) => s.host.test(host)) || null;
  const f = { tickets: [], priceLines: [], method: "" };

  if (looksLikeNotFound(document)) return { ...f, notFound: true };

  // 1. JSON-LD
  const ev = ldEvents(document)[0];
  let ldDesc = "";
  if (ev) {
    ldDesc = flatText(ev.description);
    Object.assign(f, Object.fromEntries(Object.entries(ldPlace(ev.location)).filter(([, v]) => v)));
    const pr = ldPrice(ev.offers, ev.isAccessibleForFree === true || ev.isAccessibleForFree === "True");
    if (pr) {
      if (pr.lines.length) f.priceLines = pr.lines;
      if (pr.ticketUrl && pr.ticketUrl.split("#")[0] !== url.split("#")[0]) f.tickets.push({ label: "Billetterie", url: pr.ticketUrl });
    }
    const img = Array.isArray(ev.image) ? ev.image[0] : (ev.image && ev.image.url) || ev.image;
    if (typeof img === "string") f.image = img;
    if (ev.organizer) f.organizer = typeof ev.organizer === "string" ? ev.organizer : (ev.organizer.name || "");
    if (ev.eventStatus && /Cancelled|Postponed/.test(ev.eventStatus)) f.eventStatus = /Cancelled/.test(ev.eventStatus) ? "Annulé" : "Reporté";
  }

  // 2. Règles du site
  let siteDesc = "";
  if (site) {
    const nodes = site.desc(document) || [];
    siteDesc = cleanDesc(nodes.map(nodeText).join("\n\n"), site.drop);
    if (site.tail) {
      const paras = siteDesc.split("\n\n");
      while (paras.length > 1 && /, France$/.test(paras[paras.length - 1].split("\n").pop())) {
        const last = paras.pop().split("\n");
        const addr = last.pop().replace(/, France$/, "");
        if (!f.street) f.street = addr;
      }
      siteDesc = paras.join("\n\n");
    }
    if (site.extra) site.extra(document, f, url);
  }

  // 3. Mode lecture (seulement s'il manque une vraie description)
  let readerDesc = "";
  if (siteDesc.length < 40 && ldDesc.length < 200) {
    try {
      const r = new Readability(parseHTML(html).document, { charThreshold: 200, keepClasses: false }).parse();
      if (r && r.content) {
        const { document: rd } = parseHTML(`<html><body>${r.content}</body></html>`);
        readerDesc = cleanDesc(nodeText(rd.body), site && site.drop);
      }
    } catch (_) { /* page atypique : on s'en passe */ }
  }

  // 4. Balises de partage
  let ogDesc = flatText(meta(document, "og:description") || meta(document, "description"));
  if (/^en savoir plus sur /i.test(ogDesc)) ogDesc = "";   // phrase type de l'Est Républicain
  if (!f.image) f.image = meta(document, "og:image") || "";

  // Choix : la règle du site d'abord (le bloc exact), sinon le plus complet.
  const candidates = [
    ["site", siteDesc],
    ["jsonld", ldDesc],
    ["lecture", readerDesc],
    ["og", ogDesc],
  ].filter(([, t]) => t && t.length >= 40);
  let pick = candidates.find(([m]) => m === "site")
    || candidates.sort((a, b) => b[1].length - a[1].length)[0];
  // Le texte JSON-LD est parfois plus complet que le bloc visible : on le
  // préfère quand il contient nettement plus.
  if (pick && pick[0] === "site" && ldDesc.length > siteDesc.length * 1.4) pick = ["jsonld", ldDesc];
  if (pick) { f.description = pick[1]; f.method = pick[0]; }

  // Billetterie trouvée dans le corps (hors en-tête et pied de page).
  if (!site || !site.noGenericTickets) {
    const main = document.querySelector("main, article, #content, .content") || document.body;
    for (const t of ticketLinks(main, url)) {
      if (NAV_JUNK.test(t.raw)) continue;
      if (!f.tickets.some((x) => x.url === t.url)) f.tickets.push({ label: t.label, url: t.url });
    }
  }
  f.tickets = f.tickets.slice(0, 4);

  // Tarif dans le texte quand rien de structuré (« Tarif : 12 € », « Entrée libre »).
  if (!f.priceLines.length) {
    const txt = (f.description || "") + "\n" + (f.practical || "");
    if (/entr[ée]e (libre|gratuite)|gratuit/i.test(txt)) f.free = true;
    const m = txt.match(/(tarifs?|prix|entr[ée]e)\s*:?\s*([^\n]{0,80}\d+[,.]?\d*\s?€[^\n]{0,60})/i);
    if (m) f.priceLines = [tidy(m[2])];
  }
  if (f.priceLines.length === 1 && /^gratuit$/i.test(f.priceLines[0])) f.free = true;

  return f;
}

module.exports = { extractFiche, nodeText, tidy, flatText };
