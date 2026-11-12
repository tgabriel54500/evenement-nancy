#!/usr/bin/env node
/**
 * Fiabilise `free` (gratuit / payant) et `reservation` (inscription requise ou
 * non) pour TOUS les événements, en revérifiant chaque fiche à la source.
 *
 * Pourquoi ce fichier existe :
 *   update-events.js fusionne 8 sources, mais seules la Ville de Nancy (API) et
 *   le Zénith portent une info tarif/réservation fiable ; les autres sources la
 *   laissaient à `false` par défaut. Ce module re-télécharge chaque fiche de
 *   détail et en extrait l'info, puis écrit un OVERLAY `events-pricing.json`
 *   = { uuid: { free?, reservation? } } que update-events.js applique APRÈS
 *   fusion (il n'écrase une valeur que lorsqu'il a pu la déterminer).
 *
 * Stratégie (du plus fiable au moins fiable), par source :
 *   - nancy   : API déjà fiable -> NON revérifié (overlay ne le touche pas).
 *   - zenith  : salle billetterie -> free=false, reservation=true (statique).
 *   - alentoor: JSON-LD schema.org `isAccessibleForFree` (true=gratuit).
 *   - curieux : JSON-LD `offers.price` (0 = gratuit, >0 = payant).
 *   - DN / villers / vandoeuvre / ici-c-nancy : texte de la fiche, SCOPÉ au
 *     contenu (on retire nav/footer/aside/form) avec priorité PRIX :
 *       un vrai montant en € => payant, même si "gratuit pour les -26 ans" ;
 *       sinon "entrée libre / gratuit" => gratuit.
 *   - reservation (toutes sources non-API) : formulations explicites
 *     ("sur réservation", "réservation obligatoire", "billetterie",
 *     "inscription obligatoire/requise"…), scopées au contenu.
 *
 * Usage :
 *   node enrich-pricing.js                  # tout -> events-pricing.json
 *   node enrich-pricing.js --source=villers-les-nancy --sample=5   # test ciblé
 *   node enrich-pricing.js --concurrency=10
 *
 * À lancer APRÈS les crawlers et AVANT (ou suivi de) `node update-events.js`.
 */

const fs = require("fs");
const path = require("path");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Fichiers source (sauf Nancy : pas de JSON, API fiable). uuid -> url dedans.
const SOURCE_FILES = {
  "destination-nancy": "events-destination-nancy.json",
  "curieux-net":       "events-curieux-net.json",
  "vandoeuvre":        "events-vandoeuvre.json",
  "villers-les-nancy": "events-villers-les-nancy.json",
  "alentoor":          "events-alentoor.json",
  "ici-c-nancy":       "events-ici-c-nancy.json",
  "zenith-nancy":      "events-zenith-nancy.json",
  "essey":             "events-essey.json",
};

// ── HTTP ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, extraHeaders = {}, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9", ...extraHeaders },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("utf8");
    } catch (err) {
      if (attempt >= tries) throw err;
      await sleep(400 * attempt);
    }
  }
}

// ICI-C-NANCY : challenge anti-bot nginx -> 1 GET sur /challenge pose un cookie
// (nom aléatoire) sans lequel tout boucle en 302. On le récupère une fois.
let icnCookie = null;
async function getIcnCookie() {
  if (icnCookie !== null) return icnCookie;
  try {
    const res = await fetch("https://www.ici-c-nancy.fr/challenge", {
      headers: { "User-Agent": UA }, redirect: "manual",
    });
    const set = (res.headers.getSetCookie && res.headers.getSetCookie()) || [];
    icnCookie = set.map((c) => c.split(";")[0]).join("; ");
  } catch { icnCookie = ""; }
  return icnCookie;
}

// ── Extraction de texte SCOPÉ au contenu (retire nav/footer/aside/form…) ─────
function decodeEntities(s) {
  return (s || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;|&#x27;/g, "'").replace(/&quot;|&#34;/g, '"')
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à")
    .replace(/&ecirc;/g, "ê").replace(/&ccedil;/g, "ç").replace(/&ocirc;/g, "ô")
    .replace(/&euro;/g, "€").replace(/&#8230;|&hellip;/g, "…").replace(/&deg;/g, "°")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function stripBoilerplate(html) {
  let h = html;
  h = h.replace(/<!--[\s\S]*?-->/g, " ");        // commentaires (gabarits eTourisme DN, etc.)
  h = h.replace(/<script[\s\S]*?<\/script>/gi, " ");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, " ");
  h = h.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  // Blocs structurels qui polluent (menus, pied de page, encarts, formulaires
  // newsletter, contenus latéraux type pub immobilière…).
  h = h.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  return h;
}

function textOf(html) {
  return decodeEntities(stripBoilerplate(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

// Concatène les régions d'un conteneur donné (pour scoper finement, ex. Villers
// `.contenu_bloc`, sinon on prend tout le contenu nettoyé).
function scopedText(html, containerClass) {
  if (!containerClass) return textOf(html);
  const re = new RegExp(`class="[^"]*${containerClass}[^"]*"[^>]*>`, "gi");
  let m, out = "";
  while ((m = re.exec(html))) out += " " + html.slice(m.index, m.index + 4000);
  return out ? textOf(out) : textOf(html);
}

// Description event-scopée (JSON-LD + og/meta), toujours propre.
function metaCorpus(html) {
  let out = "";
  const og = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i)
          || html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
  if (og) out += " " + og[1];
  for (const b of [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1])) {
    try {
      const d = JSON.parse(b); const arr = Array.isArray(d) ? d : [d];
      for (const it of arr) if (it && it.description && /Event/.test(JSON.stringify(it["@type"] || ""))) out += " " + it.description;
    } catch {}
  }
  return decodeEntities(out).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ── JSON-LD Event (offers / isAccessibleForFree) ────────────────────────────
function jsonLdEvent(html) {
  for (const b of [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1])) {
    try {
      const d = JSON.parse(b); const arr = Array.isArray(d) ? d : [d];
      for (const it of arr) if (it && /Event/.test(JSON.stringify(it["@type"] || ""))) return it;
    } catch {}
  }
  return null;
}

// ── Règles texte ─────────────────────────────────────────────────────────────
const RE_PRICE   = /(\d+([.,]\d{1,2})?)\s*€|€\s*\d|tarif[s]?\s*:?\s*\d|plein tarif|tarif réduit|tarif normal|à partir de\s*\d+\s*€/i;
const RE_FREE    = /\b(gratuit|gratuite|gratuitement|entrée libre|entree libre|accès libre|acces libre|entrée gratuite|entree gratuite)\b/i;
// Réservation : on n'accepte que des formulations EXPLICITES (haute précision).
// On évite "billetterie"/"réserver" nus : présents dans les menus de tous les
// sites (ex. DN affiche un bouton "Réserver" sur chaque fiche) -> faux positifs.
// La preuve structurée (lien billetterie dans les offers JSON-LD) est gérée à part.
const RE_RESA    = /(sur réservation|sur reservation|réservation (?:obligatoire|conseillée|conseillee|recommandée|recommandee|souhaitée|souhaitee|fortement conseillée|nécessaire|necessaire|requise|au |par |en ligne|:)|sur inscription|inscription (?:obligatoire|requise|nécessaire|necessaire|préalable|prealable|en ligne|au |:)|réserve[zr] (?:votre place|vos places|dès|des)|places limitées|places limitees|nombre de places limité|réservation indispensable)/i;

// free : true=gratuit, false=payant, null=indéterminé. Priorité au PRIX.
function decideFree(corpus) {
  if (RE_PRICE.test(corpus)) return false;        // un montant € => payant
  if (RE_FREE.test(corpus)) return true;          // sinon mention d'accès gratuit
  return null;
}
function decideResa(corpus) {
  return RE_RESA.test(corpus) ? true : null;      // pas de preuve => on n'affirme rien
}

// ── Extraction par source ────────────────────────────────────────────────────
async function extract(source, ev) {
  // Sources statiques : pas de fetch.
  if (source === "zenith-nancy") return { free: false, reservation: true };

  let html;
  if (source === "ici-c-nancy") {
    const ck = await getIcnCookie();
    html = await getText(ev.url, ck ? { Cookie: ck } : {});
  } else {
    html = await getText(ev.url);
  }
  if (!html) return {};

  const out = {};

  // FREE
  if (source === "alentoor") {
    const ld = jsonLdEvent(html);
    if (ld && typeof ld.isAccessibleForFree === "boolean") out.free = ld.isAccessibleForFree;
    else if (ld && ld.offers) {
      const price = [].concat(ld.offers).map((o) => o && o.price).find((p) => p != null);
      if (price != null) out.free = Number(price) === 0;
    }
  } else if (source === "curieux-net") {
    const ld = jsonLdEvent(html);
    const price = ld && ld.offers ? [].concat(ld.offers).map((o) => o && o.price).find((p) => p != null) : null;
    if (price != null) out.free = Number(price) === 0;
    else { const f = decideFree(metaCorpus(html)); if (f != null) out.free = f; }
  } else {
    // DN / villers / vandoeuvre / ici-c-nancy : texte scopé.
    const container = source === "villers-les-nancy" ? "contenu_bloc"
                    : source === "vandoeuvre" ? "entry-content"
                    : null;
    const corpus = metaCorpus(html) + " " + scopedText(html, container);
    const f = decideFree(corpus);
    if (f != null) out.free = f;
  }

  // RESERVATION (toutes sources non-API) : formulations explicites + JSON-LD.
  {
    const ld = jsonLdEvent(html);
    const container = source === "villers-les-nancy" ? "contenu_bloc"
                    : source === "vandoeuvre" ? "entry-content" : null;
    const corpus = metaCorpus(html) + " " + scopedText(html, container);
    let resa = decideResa(corpus);
    // Lien billetterie externe dans les offers JSON-LD = réservation.
    if (resa == null && ld && ld.offers) {
      const url = [].concat(ld.offers).map((o) => o && o.url).find(Boolean);
      if (url && /billet|reserv|ticket|fnac|weezevent|helloasso|shotgun/i.test(url)) resa = true;
    }
    if (resa != null) out.reservation = resa;
  }

  // Règle métier : si la fiche n'indique AUCUN tarif, on considère l'événement
  // GRATUIT — un organisateur qui fait payer le précise presque toujours.
  // (Zénith est déjà sorti plus haut avec free=false : billetterie explicite.)
  if (out.free === undefined) out.free = true;

  return out;
}

// ── Pool de concurrence ──────────────────────────────────────────────────────
async function mapPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); }
      catch { out[idx] = null; }
      if (++done % 50 === 0) process.stderr.write(`  ${done}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {};
  for (const a of argv) { const m = a.match(/^--([a-z]+)(?:=(.*))?$/); if (m) o[m[1]] = m[2] === undefined ? true : m[2]; }
  return o;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const concurrency = a.concurrency ? Number(a.concurrency) : 10;
  const todayISO = new Date().toISOString().slice(0, 10);

  // Construit la liste {source, ev} à vérifier depuis les fichiers source.
  const jobs = [];
  for (const [source, file] of Object.entries(SOURCE_FILES)) {
    if (a.source && source !== a.source) continue;
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) continue;
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    arr = arr.filter((e) => e && e.url && (e.endDate >= todayISO || e.date >= todayISO));
    if (a.sample) arr = arr.slice(0, Number(a.sample));
    for (const ev of arr) jobs.push({ source, ev });
  }
  process.stderr.write(`→ ${jobs.length} fiches à revérifier (concurrence ${concurrency})…\n`);

  const results = await mapPool(jobs, ({ source, ev }) => extract(source, ev), concurrency);

  const overlay = {};
  const stats = {};
  jobs.forEach((j, i) => {
    const r = results[i] || {};
    const s = (stats[j.source] = stats[j.source] || { n: 0, free: 0, paid: 0, freeUnknown: 0, resa: 0 });
    s.n++;
    if (r.free === true) s.free++; else if (r.free === false) s.paid++; else s.freeUnknown++;
    if (r.reservation === true) s.resa++;
    if (r.free !== undefined || r.reservation !== undefined) overlay[j.ev.uuid] = r;
  });

  if (a.sample) {
    // Mode test : on affiche, on n'écrit pas.
    jobs.forEach((j, i) => process.stderr.write(
      `  [${j.source}] free=${JSON.stringify((results[i]||{}).free)} resa=${JSON.stringify((results[i]||{}).reservation)}  ${j.ev.title.slice(0,45)}\n`));
  } else {
    const out = path.join(__dirname, "events-pricing.json");
    fs.writeFileSync(out, JSON.stringify(overlay, null, 0), "utf8");
    process.stderr.write(`✓ écrit : ${out} (${Object.keys(overlay).length} entrées)\n`);
  }
  process.stderr.write("\nRécap par source (gratuit / payant / indéterminé / résa) :\n");
  for (const [s, v] of Object.entries(stats))
    process.stderr.write(`  ${s.padEnd(20)} n=${String(v.n).padStart(4)}  gratuit=${v.free}  payant=${v.paid}  indét=${v.freeUnknown}  résa=${v.resa}\n`);
}

main().catch((err) => { console.error("✗ Échec :", err.message); process.exit(1); });
