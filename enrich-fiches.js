#!/usr/bin/env node
/**
 * enrich-fiches.js : complète chaque événement à venir avec SA fiche détaillée,
 * lue sur la page de l'événement chez la source (description complète, tarifs,
 * billetterie, adresse, public, affiche HD).
 *
 * Pourquoi : les scrapers ne gardent que l'essentiel (titre, date, lieu) pour
 * la galerie. Les pages événement d'agenda-grandnancy.fr (gen-pages.js) doivent
 * donner TOUTES les infos sans renvoyer le visiteur ailleurs.
 *
 * Entrées : data.js (EVENTS, avec `altUrls` = les autres sources du même
 *           événement, posé par normalize.js au dédoublonnage).
 * Sortie  : fiches.json  { "<url>": { fiche…, fetchedAt, status } }
 *           (lu par gen-pages.js au moment de la publication).
 *
 * Politesse envers les sources :
 *   - une seule requête à la fois par site, avec une pause entre deux ;
 *   - cache : une page n'est relue que si sa fiche a plus de REFRESH_DAYS jours
 *     (2 jours quand l'événement est dans moins d'une semaine) ;
 *   - un site qui répond « interdit » (403/429) est laissé tranquille pour le
 *     reste du passage ;
 *   - plafond de requêtes par passage (--max, 1500 par défaut) : le premier
 *     passage lit tout (une demi-heure environ, les sites en parallèle), les
 *     suivants seulement les fiches nouvelles ou anciennes.
 *   - Facebook : lu comme le fait l'aperçu de lien de Facebook lui-même
 *     (en-têtes publics og:description / og:image), jamais avec un compte.
 *
 * Usage :
 *   node enrich-fiches.js                 passage normal (incrémental)
 *   node enrich-fiches.js --max=50        plafond de requêtes (1500 par défaut)
 *   node enrich-fiches.js --only=nancy.fr ne traite que ce site
 *   node enrich-fiches.js --force         relit tout, cache ignoré
 *   node enrich-fiches.js --no-facebook   sans les pages Facebook
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { extractFiche } = require("./fiche-extract.js");

const DIR = __dirname;
const OUT = path.join(DIR, "fiches.json");
const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const MAX = parseInt(arg("max", "1500"), 10);
const ONLY = arg("only", "");
const FORCE = args.includes("--force");
const NO_FB = args.includes("--no-facebook");
const REFRESH_DAYS = 7;
const SOON_REFRESH_DAYS = 2;
const TIMEOUT_MS = 20000;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const UA_FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

// Pause entre deux requêtes vers le même site (ms).
const DELAY = { default: 1500, "alentoor.fr": 4000, "facebook.com": 3000, "estrepublicain.fr": 3000 };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|c)\./, ""); } catch (_) { return ""; } };
const delayFor = (h) => DELAY[h] ?? DELAY.default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayISO = new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function loadEvents() {
  const code = fs.readFileSync(path.join(DIR, "data.js"), "utf8");
  return new Function(code + "; return EVENTS;")();
}
function loadCache() {
  try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (_) { return {}; }
}

// Lecture d'une page avec le bon jeu de caractères (lorraineaucoeur.com est en
// ISO-8859-1 : décodée en UTF-8, tous ses accents deviennent des « � »).
async function fetchPage(url, ua) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "fr-FR,fr;q=0.9" },
    });
    const buf = Buffer.from(await r.arrayBuffer());
    let cs = ((r.headers.get("content-type") || "").match(/charset=([\w-]+)/i) || [])[1];
    if (!cs) {
      const head = buf.subarray(0, 4096).toString("latin1");
      cs = ((head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]) || "utf-8";
    }
    let html;
    try { html = new TextDecoder(cs.toLowerCase()).decode(buf); } catch (_) { html = buf.toString("utf8"); }
    return { status: r.status, url: r.url || url, html };
  } finally { clearTimeout(t); }
}

function needsFetch(entry, ev) {
  if (FORCE || !entry) return true;
  if (entry.status === "notfound") return daysBetween(entry.fetchedAt, todayISO) >= 14;
  const soon = ev && ev.date && daysBetween(todayISO, ev.date) <= 7;
  const max = soon ? SOON_REFRESH_DAYS : REFRESH_DAYS;
  return daysBetween(entry.fetchedAt || "2000-01-01", todayISO) >= max;
}

async function main() {
  const events = loadEvents().filter((e) => (e.endDate || e.date || "") >= todayISO);
  const cache = loadCache();

  // Toutes les pages à lire : celle de la galerie, puis les autres sources du
  // même événement (complément quand la première est maigre).
  const jobs = new Map();      // url → événement (le plus proche en date)
  for (const e of events) {
    for (const u of [e.url, ...(e.altUrls || [])].filter(Boolean)) {
      if (!/^https?:/.test(u)) continue;
      const h = hostOf(u);
      if (NO_FB && h === "facebook.com") continue;
      if (ONLY && !h.includes(ONLY)) continue;
      const prev = jobs.get(u);
      if (!prev || (e.date || "") < (prev.date || "")) jobs.set(u, e);
    }
  }
  const todo = [...jobs.entries()].filter(([u, e]) => needsFetch(cache[u], e))
    // Les événements les plus proches d'abord : ce sont ceux qu'on consulte.
    .sort((a, b) => (a[1].date || "").localeCompare(b[1].date || ""));

  console.log(`fiches : ${jobs.size} pages suivies, ${todo.length} à lire (plafond ${MAX}).`);

  // Une file par site, les sites en parallèle.
  const byHost = new Map();
  for (const [u, e] of todo.slice(0, MAX)) {
    const h = hostOf(u);
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push([u, e]);
  }
  const stats = { ok: 0, notfound: 0, blocked: 0, error: 0 };
  let saved = Date.now();
  const save = () => fs.writeFileSync(OUT, JSON.stringify(cache, null, 0));

  await Promise.all([...byHost.entries()].map(async ([host, list]) => {
    let refusals = 0;
    for (const [url] of list) {
      if (refusals >= 3) { stats.blocked++; continue; }
      const isFb = host === "facebook.com";
      let entry;
      try {
        const r = await fetchPage(url, isFb ? UA_FB : UA);
        if (r.status === 404 || r.status === 410) entry = { status: "notfound" };
        else if (r.status === 403 || r.status === 429 || r.status === 503) { entry = { status: "blocked", http: r.status }; refusals++; }
        else if (r.status >= 400) entry = { status: "error", http: r.status };
        else {
          const f = extractFiche(r.html, r.url);
          if (f.notFound) entry = { status: "notfound" };
          else {
            entry = { status: "ok", ...f };
            if (isFb) delete entry.tickets;   // liens Facebook internes, sans intérêt
          }
        }
      } catch (e) {
        entry = { status: "error", error: String(e && e.message || e).slice(0, 120) };
      }
      // Un refus ou une panne n'efface jamais une bonne fiche déjà en cache.
      const prev = cache[url];
      if (entry.status !== "ok" && entry.status !== "notfound" && prev && prev.status === "ok") {
        prev.lastError = entry.status;
      } else {
        cache[url] = { ...entry, fetchedAt: todayISO };
      }
      stats[entry.status] = (stats[entry.status] || 0) + 1;
      if (Date.now() - saved > 30000) { save(); saved = Date.now(); }
      await sleep(delayFor(host));
    }
  }));

  // Ménage : fiches d'événements passés depuis plus de 30 jours.
  const live = new Set(jobs.keys());
  for (const [u, v] of Object.entries(cache)) {
    if (!live.has(u) && daysBetween(v.fetchedAt || "2000-01-01", todayISO) > 30) delete cache[u];
  }
  save();
  const withDesc = Object.values(cache).filter((v) => v.status === "ok" && (v.description || "").length >= 200).length;
  console.log(`✓ fiches.json : ${Object.keys(cache).length} fiches (${withDesc} avec une vraie description). ` +
    `Ce passage : ${stats.ok} lues, ${stats.notfound} introuvables, ${stats.blocked} refusées, ${stats.error} en erreur.`);
}

main().catch((e) => { console.error("enrich-fiches :", e); process.exit(1); });
