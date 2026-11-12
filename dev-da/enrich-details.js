#!/usr/bin/env node
/**
 * Enrichissement "max d'infos" — session 854c84c8.
 *
 * data.js (généré par update-events.js) ne contient PAS de description ni
 * d'adresse complète ni de lien billetterie : la liste de l'API officielle
 * ne les expose pas. Ces infos vivent sur la page de détail de chaque
 * événement. Ce script récupère, pour chaque uuid :
 *   - description  (l'« explication », depuis og:description)
 *   - image HD     (og:image, pleine résolution)
 *   - ticketUrl    (le vrai lien « BILLETTERIE EN LIGNE », souvent externe)
 *   - venue/street/postal  (bloc Lieu : nom + adresse + code postal/ville)
 *   - placeUrl     (fiche lieu de l'agenda)
 * + des extras tirés de la liste de l'API (audiences, mots-clés lieu, entité,
 *   crédits photo, texte de période détaillé).
 *
 * Résultat : `details.js` -> global `EVENT_DETAILS = { uuid: {...} }`.
 * Ce fichier est inclus en LECTURE SEULE par base.html (vue base de données)
 * et fusionné par uuid. update-events.js / data.js ne sont jamais modifiés.
 *
 * Usage :  node enrich-details.js [--limit N] [--concurrency N]
 *   (l'API n'a pas de CORS -> snapshot local, à relancer pour rafraîchir.)
 */

const fs = require("fs");
const path = require("path");

const LIST_API = "https://agenda-integration.grandnancy.eu/api/vdn/events";
const DETAIL = "https://www.nancy.fr/agenda/details-agenda?uuid=";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(getArg("--limit", "0"), 10) || 0;        // 0 = tous
const CONCURRENCY = parseInt(getArg("--concurrency", "8"), 10);

// ---------- Extraction depuis le HTML de la page de détail ----------
function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? decode(m[1].trim()) : null;
}
function decode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&rsquo;/g, "’")
    .replace(/&nbsp;/g, " ").replace(/&eacute;/g, "é").replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à").replace(/&ccedil;/g, "ç").replace(/&ocirc;/g, "ô")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
}

function extractTicket(html) {
  // Ancre dont le texte ou l'URL évoque billetterie/réservation, hors agenda nancy.fr.
  const anchors = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const a of anchors) {
    const href = a[1];
    const txt = a[2].replace(/<[^>]+>/g, " ");
    if (/billet|réserv|reserv|ticket/i.test(txt) || /billet|reserv|ticket|weezevent|bigcartel|fnac|ticketmaster/i.test(href)) {
      if (!/details-agenda|details-lieu|\/agenda\b/i.test(href)) return href;
    }
  }
  return null;
}

function extractPlace(html) {
  const name = html.match(/<p[^>]*class=["'][^"']*place-name[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const addr = [...html.matchAll(/<p[^>]*class=["'][^"']*place-address[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => decode(m[1].replace(/<[^>]+>/g, " "))).filter(Boolean);
  const link = html.match(/<a[^>]*class=["'][^"']*place-link[^"']*["'][^>]*href=["']([^"']+)["']/i);
  let street = null, postalCity = null;
  if (addr.length) {
    postalCity = addr.find(a => /\b\d{5}\b/.test(a)) || null;
    street = addr.find(a => a !== postalCity) || null;
  }
  return {
    venue: name ? decode(name[1].replace(/<[^>]+>/g, " ")) : null,
    street,
    postalCity,
    placeUrl: link ? link[1] : null,
  };
}

function blockText(html, cls) {
  const m = html.match(new RegExp(`<div[^>]*class=["'][^"']*${cls}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, "i"));
  return m ? decode(m[1].replace(/<[^>]+>/g, " ")) : null;
}
function extractDescription(html) {
  // L'agenda municipal a des blurbs courts. On prend la plus longue version
  // disponible : bloc « description-text » du corps, sinon og:description.
  const cands = [blockText(html, "description-text"), blockText(html, "short-description-text"), meta(html, "og:description")]
    .filter(Boolean);
  return cands.sort((a, b) => b.length - a.length)[0] || null;
}

async function fetchDetail(uuid) {
  const r = await fetch(DETAIL + uuid, { headers: { "User-Agent": "Mozilla/5.0 (enrich)" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const html = await r.text();
  const place = extractPlace(html);
  return {
    description: extractDescription(html),
    image: meta(html, "og:image"),
    ticketUrl: extractTicket(html),
    venue: place.venue,
    street: place.street,
    postalCity: place.postalCity,
    placeUrl: place.placeUrl,
  };
}

// ---------- Pool de concurrence ----------
async function pool(items, n, worker) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); }
      catch (e) { out[idx] = { __error: e.message }; }
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`\r  ${done}/${items.length} pages…`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  process.stdout.write("\n");
  return out;
}

async function main() {
  console.log("→ Liste des événements (extras API)…");
  const res = await fetch(LIST_API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("API HTTP " + res.status);
  let list = await res.json();
  console.log(`  ${list.length} événements.`);

  if (LIMIT) list = list.slice(0, LIMIT);

  // Extras directement disponibles dans la liste (aucune requête en plus).
  const extras = {};
  for (const ev of list) {
    extras[ev.uuid] = {
      audiences: (ev.audiences || []).map(a => a.name).filter(Boolean),
      placeKeywords: ev.placeKeywords || null,
      entity: (ev.entity && ev.entity.name) || null,
      credits: (ev.mediaUrl && ev.mediaUrl.credits) || null,
      duringDateText: ev.duringDateText || null,
      updatedAt: (ev.updatedAt || "").slice(0, 10) || null,
    };
  }

  console.log(`→ Pages de détail (concurrence ${CONCURRENCY})…`);
  const pages = await pool(list, CONCURRENCY, ev => fetchDetail(ev.uuid));

  const DETAILS = {};
  let ok = 0, withDesc = 0, withTicket = 0, withAddr = 0, errs = 0;
  list.forEach((ev, idx) => {
    const p = pages[idx] || {};
    if (p.__error) { errs++; }
    const rec = { ...extras[ev.uuid] };
    if (!p.__error) {
      ok++;
      if (p.description) { rec.description = p.description; withDesc++; }
      if (p.image) rec.image = p.image;
      if (p.ticketUrl) { rec.ticketUrl = p.ticketUrl; withTicket++; }
      if (p.venue) rec.venue = p.venue;
      if (p.street || p.postalCity) {
        rec.address = [p.street, p.postalCity].filter(Boolean).join(", ");
        withAddr++;
      }
      if (p.placeUrl) rec.placeUrl = p.placeUrl;
    }
    DETAILS[ev.uuid] = rec;
  });

  const todayISO = new Date().toISOString().slice(0, 10);
  const header =
`// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.  (enrich-details.js)
// Détails enrichis par événement (description, billetterie, adresse, public…).
// Source : pages de détail de l'agenda officiel de Nancy + extras API.
// Régénérer : node enrich-details.js
// Généré le : ${todayISO} — ${Object.keys(DETAILS).length} fiches.
// Fusionné par uuid avec EVENTS (data.js), en lecture seule.
`;
  const body = `const EVENT_DETAILS = ${JSON.stringify(DETAILS, null, 1)};\n`;
  fs.writeFileSync(path.join(__dirname, "details.js"), header + "\n" + body, "utf8");

  console.log(`✓ details.js : ${ok} pages OK, ${errs} erreurs.`);
  console.log(`  descriptions: ${withDesc} · billetteries: ${withTicket} · adresses: ${withAddr}`);
}

main().catch(err => { console.error("\n✗ Échec :", err.message); process.exit(1); });
