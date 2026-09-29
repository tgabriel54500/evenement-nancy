#!/usr/bin/env node
/**
 * sport-scrape.js — récupère les rencontres à domicile des clubs de haut niveau
 * du Grand Nancy et écrit `events-sport.json`.
 *
 * Usage :
 *   node sport-scrape.js            # tout
 *   node sport-scrape.js --debug    # + dump des réponses brutes dans .debug-sport/
 *   node sport-scrape.js --only=gnvb,asnl
 *   node sport-scrape.js --no-cache # ignore le cache des journées déjà connues
 *
 * DEUX SOURCES, et c'est volontaire :
 *
 * 1. Le GNVB publie lui-même un JSON complet et propre
 *    (nancy-volley.fr/wp-json/gnvb/v1/all). Quand un club fait ce cadeau, on le
 *    prend : c'est la source la plus fiable qui soit.
 *
 * 2. Pour l'ASNL et le VNVB, aucune source officielle exploitable :
 *    le calendrier de l'ASNL ne liste que les matchs déjà joués et le site de
 *    la LNV charge son calendrier derrière du JavaScript sans URL stable. On
 *    passe donc par les-sports.info, qui publie ces compétitions dans un
 *    format régulier et lisible, journée par journée.
 *
 * 3. Pour le SLUC : la FFBB (calendrier complet, HTML) complétée par l'API de
 *    la LNB (horaires et reports) ; la coupe d'Europe vient de fiba.basketball.
 *    Les handballeurs (Nancy/Villers) viennent de ffhandball.fr.
 *
 * Seuls les matchs À DOMICILE sont conservés : l'agenda répond à « que faire
 * dans le Grand Nancy ce week-end ».
 *
 * Un cache (.cache-lsi.json) évite de redemander les journées déjà passées :
 * après le premier passage, une exécution ne recharge que les journées à venir.
 */

const fs = require("fs");
const path = require("path");
const { CLUBS, byKey, isClub, resolveVenue } = require("./sport-clubs");

const OUT = path.join(__dirname, "events-sport.json");
const CACHE = path.join(__dirname, ".cache-lsi.json");
const DEBUG_DIR = path.join(__dirname, ".debug-sport");

const args = process.argv.slice(2);
const DEBUG = args.includes("--debug");
const NO_CACHE = args.includes("--no-cache");
const ONLY = (args.find(a => a.startsWith("--only=")) || "").replace("--only=", "")
  .split(",").map(s => s.trim()).filter(Boolean);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const todayISO = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log("[sport]", ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function dump(name, body) {
  if (!DEBUG) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    fs.writeFileSync(path.join(DEBUG_DIR, name), body);
  } catch (_) {}
}

async function get(url, { json = false, name = "", referer = "" } = {}) {
  const headers = {
    "User-Agent": UA,
    "Accept": json ? "application/json,*/*" : "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9",
  };
  if (referer) headers.Referer = referer;
  const r = await fetch(url, { headers, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  const body = await r.text();
  if (name) dump(name, body);
  return json ? JSON.parse(body) : body;
}

// ── Petits utilitaires HTML ─────────────────────────────────────────────────

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", Eacute: "É", Egrave: "È",
  agrave: "à", acirc: "â", Agrave: "À", ccedil: "ç", Ccedil: "Ç",
  ocirc: "ô", ouml: "ö", Ocirc: "Ô", ugrave: "ù", ucirc: "û", uuml: "ü",
  icirc: "î", iuml: "ï", oelig: "œ", OElig: "Œ", deg: "°", rsquo: "’",
};
function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}
// Version « texte courant » : espaces normalisés. Ne pas l'utiliser sur du
// tableau converti en colonnes, elle avalerait les tabulations séparatrices.
function decode(s) {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── Adaptateur GNVB (JSON du club) ──────────────────────────────────────────

function splitWhen(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}h${m[5]}` };
  const d = String(v || "").match(/^(\d{4}-\d{2}-\d{2})$/);
  return d ? { date: d[1], time: "" } : { date: "", time: "" };
}

function makeMatch(club, { id, date, time, opponent, competition, round, salle, url, source }) {
  const v = resolveVenue(club, salle);
  return {
    id: `${club.key}-${id}`,
    club: club.key,
    sport: club.sport,
    date,
    time: time || "",
    opponent: String(opponent || "").trim(),
    competition: competition || club.league,
    round: round || "",
    place: v.place,
    city: v.city,
    url: url || club.site,
    tickets: club.tickets || "",
    calendar: club.calendar || "",
    source,
  };
}

async function scrapeGNVB() {
  const club = byKey("gnvb");
  const data = await get("https://www.nancy-volley.fr/wp-json/gnvb/v1/all",
    { json: true, name: "gnvb.json" });
  const out = [];
  for (const m of (data.matchs || [])) {
    if (!isClub(club, m.home)) continue;
    const { date, time } = splitWhen(m.dt);
    if (!date) continue;                      // rencontre pas encore programmée
    out.push(makeMatch(club, {
      id: m.id, date, time,
      opponent: m.away,
      round: m.round ? `${m.round}e journée` : "",
      salle: m.salle,
      url: "https://www.nancy-volley.fr/calendrier/",
      source: "nancy-volley.fr",
    }));
  }
  return out;
}

// ── Adaptateur les-sports.info (ASNL, SLUC, VNVB) ───────────────────────────
//
// Le site charge chaque journée par un appel du type :
//   ajax_php.php?majajax=resultats_manche_collectif&langage=fr&mancheid=<id>
// Les identifiants de journée sont listés dans la page « résultats détaillés »
// de la compétition, qu'on relit à chaque fois : rien n'est codé en dur, une
// nouvelle saison ne casse donc que si l'URL de la compétition change.

const LSI = "https://www.les-sports.info/";

const COMPETITIONS = {
  asnl: {
    page: LSI + "football-championnat-de-france-ligue-2-saison-reguliere-2026-2027-resultats-eprd138832.html",
    competition: "Ligue 2 BKT",
  },
  vnvb: {
    page: LSI + "volleyball-ligue-a-feminine-saforelle-power-6-2026-2027-resultats-eprd139101.html",
    competition: "Saforelle Power 6",
  },
};

// Journées de la compétition, dans l'ordre : [{ mancheid, label }]
function extraitJournees(html) {
  const bloc = html.match(/<select[^>]*id="select_manche"[\s\S]*?<\/select>/i);
  const src = bloc ? bloc[0] : html;
  const out = [];
  const re = /<option[^>]*value="mancheid=(\d+)"[^>]*>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = re.exec(src))) {
    // « 1ère journée » / « 6ème journée » → « 1re » / « 6e », l'abréviation
    // correcte en français, et celle qu'utilise déjà le reste du site.
    const label = decode(m[2].replace(/<[^>]+>/g, ""))
      .replace(/(\d+)\s*ère\b/gi, "$1re")
      .replace(/(\d+)\s*(?:ème|eme)\b/gi, "$1e");
    out.push({ mancheid: m[1], label });
  }
  return out;
}

// Rencontres d'une journée. Le fragment renvoyé mêle des intertitres de date
// et des lignes de match ; on rattache chaque ligne à la dernière date vue.
function parseJournee(frag) {
  const dates = [];
  const reDate = /(\d{1,2})\s*(?:&nbsp;|\s)*([A-Za-zÀ-ÿ&;]+)\s*(?:&nbsp;|\s)*(\d{4})/g;
  let d;
  while ((d = reDate.exec(frag))) {
    const mois = MOIS[sansAccent(decode(d[2]))];
    if (!mois) continue;
    const jour = Number(d[1]);
    if (jour < 1 || jour > 31) continue;
    dates.push({
      at: d.index,
      iso: `${d[3]}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`,
    });
  }

  const out = [];
  const reRow = /<tr[\s>][\s\S]*?<\/tr>/gi;
  let r;
  while ((r = reRow.exec(frag))) {
    const row = r[0];
    // Les équipes sont les liens vers leur fiche : title = nom complet.
    const teams = [...row.matchAll(/href="[^"]*identite-equ\d+\.html"[^>]*title="([^"]+)"/gi)]
      .map(x => decode(x[1]));
    if (teams.length < 2) continue;
    const t = row.match(/(\d{1,2})h(\d{2})/);
    let iso = "";
    for (const dt of dates) if (dt.at < r.index) iso = dt.iso; else break;
    if (!iso) continue;
    out.push({
      date: iso,
      time: t ? `${t[1].padStart(2, "0")}h${t[2]}` : "",
      home: teams[0],
      away: teams[1],
    });
  }
  return out;
}

function chargeCache() {
  if (NO_CACHE) return {};
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (_) { return {}; }
}

// Une journée entièrement passée ne bougera plus : on la garde en cache. Les
// autres sont rechargées, parce qu'un horaire ou une date peut encore changer.
function cacheUtilisable(entry) {
  if (!entry || !Array.isArray(entry.matchs)) return false;
  const derniere = entry.matchs.reduce((a, m) => (m.date > a ? m.date : a), "");
  return Boolean(derniere) && derniere < todayISO;
}

async function scrapeLSI(club, cache) {
  const conf = COMPETITIONS[club.key];
  if (!conf) return [];
  const page = await get(conf.page, { name: `lsi-${club.key}.html` });
  const journees = extraitJournees(page);
  // Pas de journées = la source n'a pas encore publié le calendrier de la
  // saison (c'est le cas jusqu'à quelques semaines avant le coup d'envoi).
  // Ce n'est pas une panne : on le dit et on repassera demain.
  if (!journees.length) {
    log(`${club.key} : calendrier pas encore publié par la source, rien à récupérer`);
    return { rows: [], enAttente: true };
  }

  const out = [];
  let charges = 0;
  for (let i = 0; i < journees.length; i++) {
    const { mancheid, label } = journees[i];
    let matchs;
    if (cacheUtilisable(cache[mancheid])) {
      matchs = cache[mancheid].matchs;
    } else {
      const url = `${LSI}ajax_php.php?majajax=resultats_manche_collectif&langage=fr&mancheid=${mancheid}`;
      try {
        const frag = await get(url, { referer: conf.page, name: i === 0 ? `lsi-${club.key}-j1.html` : "" });
        matchs = parseJournee(frag);
        cache[mancheid] = { matchs, vuLe: todayISO };
        charges++;
        await sleep(350);                      // on reste poli avec le site
      } catch (e) {
        // Un HTTP 500 passager sur UNE journée vidait tout le club de l'agenda
        // (constaté le 2026-09-18 : plus un seul match ASNL ni VNVB en ligne).
        // On se rabat sur la dernière version connue de cette journée, et à
        // défaut on passe à la suivante au lieu d'abandonner le club.
        if (cache[mancheid] && Array.isArray(cache[mancheid].matchs)) {
          matchs = cache[mancheid].matchs;
          log(`${club.key} : journée ${label || mancheid} injoignable (${e.message}), version en cache conservée`);
        } else {
          log(`${club.key} : journée ${label || mancheid} injoignable (${e.message}), ignorée`);
          continue;
        }
      }
    }
    for (const m of matchs) {
      if (!isClub(club, m.home)) continue;
      out.push(makeMatch(club, {
        id: `${mancheid}`,
        date: m.date,
        time: m.time,
        opponent: m.away,
        competition: conf.competition,
        round: label || "",
        salle: club.venue,
        url: club.site,
        source: "les-sports.info",
      }));
    }
  }
  log(`${club.key} : ${journees.length} journée(s), ${charges} rechargée(s)`);
  return { rows: out, enAttente: false };
}


// ── Adaptateur FFBB (SLUC) ──────────────────────────────────────────────────
//
// La fédération publie le calendrier complet de chaque club, en HTML rendu côté
// serveur, avec le numéro de journée et un marqueur « vs » (domicile) ou « @ »
// (extérieur). C'est la source la plus propre trouvée pour le basket, et la
// seule qui donne les 30 journées avant même le début de la saison. Les
// horaires y sont ajoutés au fil de l'eau : tant qu'ils manquent, la rencontre
// s'affiche sans heure et renvoie vers cette page.

const FFBB_MOIS = {
  janv: 1, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6,
  juil: 7, aout: 8, sept: 9, oct: 10, nov: 11, dec: 12,
};

// Le tableau est converti en texte à colonnes (une ligne par rencontre) plutôt
// que parcouru balise par balise : la FFBB peut refondre son HTML, l'ordre des
// colonnes, lui, ne bouge pas.
function texteTableau(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    // Le HTML est indenté : on l'aplatit AVANT de poser nos propres
    // séparateurs, sinon une ligne de tableau se retrouve éclatée en dix.
    .replace(/\s+/g, " ")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map(l => decodeEntities(l).replace(/[ \t\u00a0]*\t[ \u00a0]*/g, "\t").replace(/[ \u00a0]+/g, " ").trim())
    .filter(Boolean);
}

async function scrapeFFBB(club) {
  const html = await get(club.calendar, { name: `ffbb-${club.key}.html` });
  const out = [];
  for (const ligne of texteTableau(html)) {
    // 27 sept. 2026 | 1 | vs Paris Basketball
    const d = ligne.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{4})\b/);
    if (!d) continue;
    const mois = FFBB_MOIS[sansAccent(d[2]).slice(0, 4).replace(/\.$/, "")]
              || FFBB_MOIS[sansAccent(d[2])];
    if (!mois) continue;

    // Une journée de championnat est numérotée 1 à 40 ; les matchs amicaux et
    // de présaison portent une date en guise de numéro (20260918) : on les saute.
    const j = ligne.match(/\t\s*(\d{1,6})\s*\t/);
    const journee = j ? Number(j[1]) : 0;
    if (!journee || journee > 40) continue;

    const vs = ligne.match(/(?:^|\t)\s*(vs|@)\s+([^\t]+?)\s*(?:\t|$)/i);
    if (!vs) continue;
    if (vs[1].toLowerCase() !== "vs") continue;      // domicile uniquement

    const t = ligne.match(/\b(\d{1,2})[h:](\d{2})\b/);
    out.push(makeMatch(club, {
      id: `j${journee}`,
      date: `${d[3]}-${String(mois).padStart(2, "0")}-${d[1].padStart(2, "0")}`,
      time: t ? `${t[1].padStart(2, "0")}h${t[2]}` : "",
      opponent: vs[2].trim(),
      competition: club.league,
      round: `${journee}${journee === 1 ? "re" : "e"} journée`,
      salle: club.venue,
      url: club.calendar,
      source: "ffbb.com",
    }));
  }
  return out;
}

// ── Adaptateur LNB (horaires du championnat du SLUC) ────────────────────────
//
// Le site lnb.fr rend son calendrier en JavaScript, mais il lit une API
// publique, api-prod.lnb.fr, avec un jeton anonyme fourni par lnb.fr/api/token
// (JWT « client: website », valable 15 minutes, aucune inscription). C'est la
// ligue elle-même : les horaires et les reports y sont à jour avant partout
// ailleurs, alors que la page FFBB reste sans heure des semaines durant.
//
// Relevé le 2026-09-29 dans le code du site (chunk 1k6r_umzs4c7c.js) :
//   POST match/v3/getCalendar
//   { competition_abbrev, division_external_id: 0, year (année de début de
//     saison), team_external_id, round_number: 0, phase_id: 0, limit }
//   → data: [{ date, data: [ { match_date, match_time_utc, match_status,
//     round_number, display_round, teams: [domicile, extérieur] } ] }]
// Sans `limit`, l'API tronque à 22 rencontres : on demande 100.
// L'équipe 0 est celle qui reçoit (vérifié J1 2026-27 : « Nancy - Paris »,
// que la FFBB donne « vs Paris Basketball »).
//
// La FFBB reste la source de base (elle donne aussi la présaison, le nom
// complet des adversaires) : la LNB vient COMPLÉTER date et heure, journée par
// journée (fusionSluc). Si l'une des deux tombe, l'autre suffit.

const LNB = {
  sluc: {
    abbrev: "PROA",             // Betclic ÉLITE
    teamExternalId: 1868,       // « Nancy » dans competition/getCompetitionTeams
    url: "https://lnb.fr/fr/calendar?did=1&abbrev=PROA",
  },
};
const LNB_TOKEN_URL = "https://lnb.fr/api/token";
const LNB_API = "https://api-prod.lnb.fr/";

// 2026-27 se demande avec year=2026 : la saison change en juillet.
function saisonLNB(d = new Date()) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

// « 2026-10-03T16:00:00.000Z » → { date: "2026-10-03", time: "18h00" } (Paris).
function heureParis(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const g = (t) => (parts.find(p => p.type === t) || {}).value || "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}h${g("minute")}` };
}

async function lnbToken() {
  const r = await fetch(LNB_TOKEN_URL, {
    headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://lnb.fr/fr/calendar" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${LNB_TOKEN_URL}`);
  const j = await r.json();
  if (!j || !j.token) throw new Error("jeton LNB absent de la réponse");
  return j.token;
}

async function lnbCalendar(cfg, year, token) {
  const body = {
    competition_abbrev: cfg.abbrev, division_external_id: 0, year,
    team_external_id: cfg.teamExternalId, round_number: 0, phase_id: 0, limit: 100,
  };
  const r = await fetch(LNB_API + "match/v3/getCalendar", {
    method: "POST",
    headers: {
      "User-Agent": UA, "Accept": "application/json", "Content-Type": "application/json",
      "Authorization": "Bearer " + token, "language_code": "fr",
      "Origin": "https://lnb.fr", "Referer": "https://lnb.fr/",
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  dump(`lnb-${cfg.abbrev}-${year}.json`, txt);
  if (!r.ok) throw new Error(`HTTP ${r.status} sur getCalendar`);
  const j = JSON.parse(txt);
  if (!j || j.status !== true || !Array.isArray(j.data)) throw new Error("réponse getCalendar inattendue : " + txt.slice(0, 120));
  return j.data;
}

// Rencontres à domicile d'après la réponse getCalendar (pure, testable).
function lnbHomeMatches(club, days, cfg) {
  const out = [];
  for (const day of days || []) {
    for (const g of (day && day.data) || []) {
      const teams = Array.isArray(g.teams) ? g.teams : [];
      if (!teams[0] || Number(teams[0].external_id) !== Number(cfg.teamExternalId)) continue;
      const journee = Number(g.round_number) || 0;
      if (!journee) continue;
      const { date, time } = heureParis(g.match_time_utc);
      out.push(makeMatch(club, {
        id: `j${journee}`,
        date: date || String(g.match_date || ""),
        time,
        opponent: (teams[1] && teams[1].team_name) || "Adversaire à déterminer",
        competition: club.league,
        round: `${journee}${journee === 1 ? "re" : "e"} journée`,
        salle: club.venue,
        url: cfg.url || club.calendar,
        source: "lnb.fr",
      }));
    }
  }
  return out;
}

async function scrapeLNB(club) {
  const cfg = LNB[club.key];
  if (!cfg) return [];
  const token = await lnbToken();
  const days = await lnbCalendar(cfg, saisonLNB(), token);
  return lnbHomeMatches(club, days, cfg);
}

// Fusion FFBB + LNB par journée (même id « sluc-jN ») : la ligne FFBB sert de
// base (nom complet de l'adversaire), la LNB impose date et heure (reports,
// horaires). Une journée connue d'une seule source est gardée telle quelle.
function fusionSluc(ffbb, lnb) {
  const parId = new Map();
  for (const m of ffbb) parId.set(m.id, Object.assign({}, m));
  for (const l of lnb) {
    const base = parId.get(l.id);
    if (!base) { parId.set(l.id, l); continue; }
    base.date = l.date || base.date;
    base.time = l.time || base.time;
    base.source = base.source === l.source ? base.source : `${base.source} + ${l.source}`;
  }
  return [...parId.values()];
}

// ── Adaptateur FIBA (coupe d'Europe du SLUC) ────────────────────────────────
//
// Le site officiel fiba.basketball est une application Next.js : la page
// « Games » de la compétition embarque TOUTES les rencontres de la saison en
// JSON dans ses balises <script> (self.__next_f.push). On lit ce JSON, on
// garde les matchs où le SLUC est l'équipe A (= à domicile). Les tours suivants
// (Second Round, Play-Offs) apparaissent dans la même page quand ils sont
// tirés : relue chaque nuit, la source suit donc l'évolution de la compétition.
// Un adversaire encore inconnu (équipe B nulle) donne « adversaire à
// déterminer » ; l'horaire manquant (hasTimeGameDateTime=false) reste vide.

const FIBA = {
  sluc: {
    page: "https://www.fiba.basketball/en/events/fiba-europe-cup-26-27/games",
    competition: "FIBA Europe Cup",
    codes: ["SLUC"],                       // teamA.code
    url: "https://www.fiba.basketball/en/events/fiba-europe-cup-26-27/games",
  },
};

// Extrait les objets { "gameId": … } du HTML brut (chaînes JS échappées).
function parseFibaGames(html) {
  const games = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    let s;
    try { s = JSON.parse('"' + m[1] + '"'); } catch (_) { continue; }
    let idx = 0;
    while ((idx = s.indexOf('{"gameId":', idx)) >= 0) {
      let depth = 0, j = idx, inStr = false, esc = false;
      for (; j < s.length; j++) {
        const c = s[j];
        if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; }
        else if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { j++; break; } }
      }
      try { games.push(JSON.parse(s.slice(idx, j))); } catch (_) {}
      idx = j;
    }
  }
  // La même rencontre peut apparaître plusieurs fois (blocs différents de la page).
  const seen = new Set();
  return games.filter(g => g && g.gameId && !seen.has(g.gameId) && seen.add(g.gameId));
}

const FIBA_ROUNDS = { "Regular Season": "Saison régulière", "Second Round": "2e tour", "Play-Offs": "Play-offs", "Qualifiers": "Qualifications", "Final": "Finale" };

function fibaHomeMatches(club, games, cfg) {
  const out = [];
  for (const g of games) {
    const a = g.teamA || {};
    if (!cfg.codes.includes(a.code) && !isClub(club, a.shortName || a.officialName || "")) continue;
    const dt = String(g.gameDateTime || "");
    const date = dt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const time = g.hasTimeGameDateTime ? dt.slice(11, 16).replace(":", "h") : "";
    const roundName = (g.round && (g.round.roundName || g.round.name)) || "";
    const groupCode = g.groupPairingCode || (g.gameName || "").split("-")[1] || "";
    const round = [FIBA_ROUNDS[roundName] || roundName,
      /regular/i.test(roundName) && groupCode ? `groupe ${groupCode}` : "",
      g.gameNumber ? `match ${g.gameNumber}` : ""].filter(Boolean).join(" · ");
    const b = g.teamB || {};
    out.push(makeMatch(club, {
      id: `fec-${g.gameId}`,
      date, time,
      opponent: b.shortName || b.officialName || "Adversaire à déterminer",
      competition: cfg.competition,
      round,
      salle: g.venueName || club.venue,
      url: cfg.url,
      source: "fiba.basketball",
    }));
  }
  return out;
}

async function scrapeFIBA(club) {
  const cfg = FIBA[club.key];
  const html = await get(cfg.page, { name: `fiba-${club.key}.html` });
  const games = parseFibaGames(html);
  if (!games.length) throw new Error("aucune rencontre lue dans la page FIBA (maquette changée ?)");
  return fibaHomeMatches(club, games, cfg);
}

// ── Adaptateur FFHandball (Entente Nancy / Villers, Villers féminines) ──────
//
// Les pages de poule de ffhandball.fr sont composées de « web components »
// <smartfire-component name='…' attributes="{json}"> dont les données sont
// dans l'attribut (entités HTML). La page d'une journée
// (…/poule-<id>/journee-<n>/) porte le composant competitions---rencontre-list
// avec les rencontres de la journée : date locale avec décalage, équipes,
// identifiant de salle. La salle elle-même (nom, commune) est sur la page de la
// rencontre (composant competitions---rencontre-salle) : lue une fois par
// identifiant et mise en cache (.cache-lsi.json, clé ffhSalles).
// Le nombre de journées vient du composant journee-selector de la poule.

const FFH = "https://www.ffhandball.fr/competitions/";

function ffhComponent(html, name) {
  const m = html.match(new RegExp("<smartfire-component name='" + name + "'[^>]*attributes=\"([^\"]*)\""));
  if (!m) return null;
  try { return JSON.parse(decodeEntities(m[1])); } catch (_) { return null; }
}
function ffhRencontres(html) {
  const rl = ffhComponent(html, "competitions---rencontre-list");
  if (!rl || !rl.rencontres) return [];
  const rs = typeof rl.rencontres === "string" ? JSON.parse(rl.rencontres) : rl.rencontres;
  return Array.isArray(rs) ? rs : [];
}
function ffhJournees(html) {
  const js = ffhComponent(html, "competitions---journee-selector") || ffhComponent(html, "competitions---rencontre-list");
  const p = js && js.poule;
  if (!p || !p.journees) return [];
  const list = typeof p.journees === "string" ? JSON.parse(p.journees) : p.journees;
  return Array.isArray(list) ? list.map(j => Number(j.journee_numero)).filter(Boolean) : [];
}
// « 2026-10-03T21:00:00+02:00 » → date locale et heure locale (l'offset est
// celui de la salle, pas besoin de convertir).
function ffhWhen(v) {
  const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return { date: "", time: "" };
  return { date: m[1], time: m[2] + "h" + m[3] };
}

async function scrapeFFH(club, cache) {
  const cfg = club.ffh;
  const base = `${FFH}saison-2026-2027-${cfg.saison}/national/${cfg.competition}/poule-${cfg.poule}/`;
  const first = await get(base, { name: `ffh-${club.key}.html` });
  const journees = ffhJournees(first);
  if (!journees.length) throw new Error("aucune journée lue dans la page de poule (maquette changée ?)");
  cache.ffhSalles = cache.ffhSalles || {};
  const out = [];
  for (const j of journees) {
    let html;
    try { html = await get(`${base}journee-${j}/`, { name: `ffh-${club.key}-j${j}.html` }); }
    catch (e) { log(`${club.key} : journée ${j} injoignable (${e.message})`); continue; }
    for (const r of ffhRencontres(html)) {
      const home = decodeEntities(r.equipe1Libelle || ""), away = decodeEntities(r.equipe2Libelle || "");
      if (!isClub(club, home)) continue;
      const { date, time } = ffhWhen(r.date);
      if (!date) continue;
      // Salle : cache par identifiant, sinon page de la rencontre, sinon salle du club.
      let salle = cache.ffhSalles[r.equipementId];
      if (!salle && r.equipementId && r.ext_rencontreId) {
        try {
          const rh = await get(`${base}rencontre-${r.ext_rencontreId}/`);
          const eq = (ffhComponent(rh, "competitions---rencontre-salle") || {}).equipement;
          if (eq && eq.libelle) salle = cache.ffhSalles[r.equipementId] = `${eq.libelle} ${eq.ville || ""}`.trim();
        } catch (_) {}
        await sleep(300);
      }
      out.push(makeMatch(club, {
        id: `ffh-${r.ext_rencontreId || r.id}`,
        date, time,
        opponent: away.replace(/\s+\(N\d\)$/i, ""),
        competition: club.league,
        round: `${j}${j === 1 ? "re" : "e"} journée`,
        salle: salle || club.venue,
        url: base,
        source: "ffhandball.fr",
      }));
    }
    await sleep(300);
  }
  return out;
}

module.exports = {
  parseFibaGames, fibaHomeMatches, ffhComponent, ffhRencontres, ffhJournees, ffhWhen,
  lnbHomeMatches, fusionSluc, heureParis, saisonLNB,
};

// ── Orchestration ───────────────────────────────────────────────────────────

if (require.main === module) (async () => {
  const wanted = (k) => !ONLY.length || ONLY.includes(k);
  const all = [];
  const report = {};
  const cache = chargeCache();

  if (wanted("gnvb")) {
    try {
      const rows = await scrapeGNVB();
      all.push(...rows);
      report.gnvb = { source: "nancy-volley.fr", matchs: rows.length };
      log(`gnvb : ${rows.length} match(s) à domicile`);
    } catch (e) {
      report.gnvb = { source: "nancy-volley.fr", matchs: 0, erreur: e.message };
      log(`gnvb : ÉCHEC — ${e.message}`);
    }
  }

  if (wanted("sluc")) {
    const club = byKey("sluc");
    // Championnat : FFBB (calendrier) + LNB (horaires), fusionnés par journée.
    // Chaque source échoue indépendamment ; si les deux tombent, les
    // rencontres de championnat déjà connues (id « sluc-jN ») sont reprises.
    report.sluc = { source: "ffbb.com + lnb.fr", matchs: 0 };
    let ffbb = [], lnb = [];
    try {
      ffbb = await scrapeFFBB(club);
      log(`sluc (FFBB) : ${ffbb.length} match(s) à domicile`);
    } catch (e) {
      report.sluc.erreurFFBB = e.message;
      log(`sluc (FFBB) : ÉCHEC — ${e.message}`);
    }
    try {
      lnb = await scrapeLNB(club);
      log(`sluc (LNB) : ${lnb.length} match(s) à domicile, ${lnb.filter(r => r.time).length} avec horaire`);
    } catch (e) {
      report.sluc.erreurLNB = e.message;
      log(`sluc (LNB) : ÉCHEC — ${e.message}`);
    }
    let rows = fusionSluc(ffbb, lnb);
    if (!rows.length) {
      try {
        rows = JSON.parse(fs.readFileSync(OUT, "utf8")).filter(m => m.club === "sluc" && /^sluc-j\d+$/.test(m.id));
        report.sluc.reprises = rows.length;
        log(`sluc : ${rows.length} rencontre(s) de championnat reprise(s) de la version précédente`);
      } catch (_) {}
    }
    all.push(...rows);
    report.sluc.matchs = rows.length;
    const sansHeure = rows.filter(r => !r.time).length;
    log(`sluc : ${rows.length} match(s) à domicile` +
        (sansHeure ? ` (dont ${sansHeure} sans horaire annoncé)` : ""));
    // Coupe d'Europe (FIBA Europe Cup) : source distincte, échec indépendant.
    // En cas de panne, les rencontres européennes déjà connues sont reprises
    // du fichier précédent (elles sont reconnaissables à leur id « fec- »).
    try {
      const rows = await scrapeFIBA(club);
      all.push(...rows);
      report["sluc-europe"] = { source: "fiba.basketball", matchs: rows.length };
      log(`sluc (coupe d'Europe) : ${rows.length} match(s) à domicile`);
    } catch (e) {
      report["sluc-europe"] = { source: "fiba.basketball", matchs: 0, erreur: e.message };
      log(`sluc (coupe d'Europe) : ÉCHEC — ${e.message}`);
      try {
        const repris = JSON.parse(fs.readFileSync(OUT, "utf8")).filter(m => m.club === "sluc" && /^sluc-fec-/.test(m.id));
        all.push(...repris);
        report["sluc-europe"].reprises = repris.length;
      } catch (_) {}
    }
  }

  const enEchec = [];
  // Handball (FFHandball) : un club par équipe suivie (voir sport-clubs.js).
  for (const club of CLUBS) {
    if (!club.ffh || !wanted(club.key)) continue;
    try {
      const rows = await scrapeFFH(club, cache);
      all.push(...rows);
      report[club.key] = { source: "ffhandball.fr", matchs: rows.length };
      log(`${club.key} : ${rows.length} match(s) à domicile`);
    } catch (e) {
      report[club.key] = { source: "ffhandball.fr", matchs: 0, erreur: e.message };
      enEchec.push(club.key);
      log(`${club.key} : ÉCHEC — ${e.message}`);
    }
  }

  for (const club of CLUBS) {
    if (!COMPETITIONS[club.key] || !wanted(club.key)) continue;
    try {
      const { rows, enAttente } = await scrapeLSI(club, cache);
      all.push(...rows);
      report[club.key] = { source: "les-sports.info", matchs: rows.length };
      if (enAttente) report[club.key].note = "calendrier pas encore publié par la source";
      else log(`${club.key} : ${rows.length} match(s) à domicile`);
    } catch (e) {
      report[club.key] = { source: "les-sports.info", matchs: 0, erreur: e.message };
      enEchec.push(club.key);
      log(`${club.key} : ÉCHEC — ${e.message}`);
    }
  }

  // Source en panne = on REPREND les rencontres déjà connues de ce club. Sans
  // cela, une panne d'une nuit efface le club du site jusqu'au retour de la
  // source (vécu le 2026-09-18). Les matchs passés sont filtrés plus bas.
  if (enEchec.length) {
    try {
      const precedent = JSON.parse(fs.readFileSync(OUT, "utf8"));
      const repris = precedent.filter(m => enEchec.includes(m.club));
      all.push(...repris);
      for (const k of enEchec) {
        const n = repris.filter(m => m.club === k).length;
        report[k].reprises = n;
        log(`${k} : ${n} rencontre(s) reprise(s) de la version précédente`);
      }
    } catch (_) {}
  }

  try { fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + "\n"); } catch (_) {}

  // Avec --only, on ne réécrit que les clubs demandés : les autres sont repris
  // du fichier existant, pour qu'un passage ciblé ne vide pas l'agenda.
  if (ONLY.length) {
    try {
      const precedent = JSON.parse(fs.readFileSync(OUT, "utf8"));
      for (const m of precedent) if (!ONLY.includes(m.club)) all.push(m);
    } catch (_) {}
  }

  const seen = new Set();
  const clean = all
    .filter(m => m.date && m.date >= todayISO)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .filter(m => {
      const k = m.club + "|" + m.date;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  fs.writeFileSync(OUT, JSON.stringify(clean, null, 2) + "\n");
  log(`écrit ${path.basename(OUT)} — ${clean.length} rencontre(s) à venir`);
  console.log(JSON.stringify(report, null, 2));
})();
