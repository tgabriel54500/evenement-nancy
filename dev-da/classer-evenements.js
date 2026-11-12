#!/usr/bin/env node
/**
 * Classement « magique » des événements par IA (API Claude).
 *
 * Étiquettes (un événement peut en avoir 0, 1 ou plusieurs, la plupart n'en ont aucune) :
 *   incontournable  grand rendez-vous attendu : grosse salle, édition ancienne, festival
 *                   phare, tête d'affiche, événement dont on parle en ville
 *   atypique        insolite, rare, lieu habituellement fermé, concept original
 *   fun             ambiance festive, ludique, décalée, on y va pour s'amuser
 *   famille         vraiment adapté aux enfants / sortie en famille
 *   etudiant        pensé pour les 18-25 ans : soirées, rentrée étudiante, bons plans
 *
 * Clé API : fichier `.anthropic-key` à la racine (une ligne), ou variable ANTHROPIC_API_KEY.
 * Sans clé, le script ne fait rien (le site marche sans étiquettes).
 *
 * Cache : events-tags.json { cléÉvénement: { t: [étiquettes], v: version } }. Seuls les
 * événements JAMAIS classés partent à l'API : le coût quotidien reste de quelques centimes.
 * Clé = titre normalisé + commune (stable malgré le recalage quotidien des dates d'expo).
 *
 * Utilisation :
 *   Automatique : update-events.js appelle applyTags(events) avant d'écrire data.js.
 *   À la main   : node classer-evenements.js              classe le data.js actuel et le met à jour
 *                 node classer-evenements.js --max=40     essai sur 40 événements seulement
 *                 node classer-evenements.js --dry        montre la requête, n'appelle pas l'API
 *                 node classer-evenements.js --reset      oublie le cache et reclasse tout
 */

const fs = require("fs");
const path = require("path");

const MODEL = process.env.CLASSER_MODEL || "claude-haiku-4-5";
const PROMPT_VERSION = 3;   // v3 : « famille » = enfants (jeune public), pas les ados/adultes          // incrémenter si les consignes changent → reclassement
const BATCH = 40;                  // événements par appel
const CONCURRENCY = 3;
const TAGS = ["incontournable", "atypique", "fun", "famille", "etudiant"];
// Titres qui ne méritent jamais d'étiquette, quoi qu'en dise le modèle.
const NO_TAG_RE = /\b(pr[ée]vention|sensibilisation|ambassadeurs?|permanence|r[ée]union publique|collecte|don du sang|inscriptions?|conseil municipal|bulletins? d'inscription)\b/i;
// « famille » = enfants. Un titre qui vise les ados ou les adultes, sans parler
// d'enfants ni de famille, perd l'étiquette (constaté : « adultes et adolescents »).
const ADOS_ADULTES_RE = /\b(ados?|adolescents?|adultes?|13\s*[-à]\s*17|\+\s*1[2-8]\s*ans|lyc[ée]ens?|coll[ée]giens?)\b/i;
const ENFANTS_RE = /enfant|famil|b[ée]b[ée]|tout.petits|jeune public|\b[3-9]\s*[-à]\s*1[0-2]\s*ans\b/i;
function gardeFamille(ev, t) {
  if (!t.includes("famille")) return t;
  const txt = `${ev.title} ${(ev.subcats || []).join(" ")}`;
  return ADOS_ADULTES_RE.test(txt) && !ENFANTS_RE.test(txt) ? t.filter((x) => x !== "famille") : t;
}
const CACHE_PATH = path.join(__dirname, "events-tags.json");

const args = process.argv.slice(2);
const arg = (name) => { const a = args.find((x) => x.startsWith(`--${name}`)); return a ? (a.split("=")[1] ?? true) : null; };

function readKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try { return fs.readFileSync(path.join(__dirname, ".anthropic-key"), "utf8").trim(); } catch { return ""; }
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const tagKey = (ev) => `${norm(ev.title)}|${norm(ev.city)}`;

const DAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
function when(ev) {
  const d = (iso) => { const [y, m, j] = iso.split("-").map(Number); return `${DAYS[new Date(y, m - 1, j).getDay()]} ${j}/${m}`; };
  if (!ev.date) return "";
  return ev.endDate && ev.endDate > ev.date ? `jusqu'au ${d(ev.endDate)}` : d(ev.date);
}

const SYSTEM = `Tu es le rédacteur en chef d'un agenda culturel local du Grand Nancy (Meurthe-et-Moselle, France).
Tu reçois une liste d'événements. Pour chacun, attribue 0, 1 ou plusieurs étiquettes parmi :

- incontournable : LE grand rendez-vous qu'on ne veut pas manquer. Grande salle (Zénith, Opéra, L'Autre Canal pour une tête d'affiche), festival phare, édition ancienne (« 47e édition »), événement métropolitain majeur (Journées du patrimoine dans leur ensemble, Livre sur la Place, fête de la Saint-Nicolas…). Très sélectif : environ 5 % des événements au maximum. Une visite parmi cent visites des Journées du patrimoine n'est PAS incontournable.
- atypique : insolite ou rare. Lieu habituellement fermé au public (abri anti-aérien, salle des coffres, station d'épuration), concept original, pratique peu commune. Pas « atypique » simplement parce que c'est une petite association.
- fun : on y va d'abord pour s'amuser. Ambiance festive, ludique, décalée : guinguette, course de caisses à savon, blind test, soirée à thème, escape game, bal. PAS fun : brocante, vide-grenier, stand d'information, conférence, exposition, atelier pédagogique, collecte, randonnée ordinaire.
- famille : sortie pour les ENFANTS (moins de 12 ans environ), seuls ou avec leurs parents : spectacle jeune public, conte, atelier enfants, fête familiale, exposition ludique. PAS famille : activité pour ados (13-17 ans), pour « adultes et adolescents », pour adultes, ni un événement simplement « ouvert à tous ».
- etudiant : pensé pour les 18-25 ans / étudiants (rentrée étudiante, soirées étudiantes, événements campus, bons plans jeunes).

Règles :
- Objectif : environ 15 % des événements étiquetés au total. Au plus 2 étiquettes par événement, « incontournable » presque toujours seule.
- Stand d'information, sensibilisation, prévention, réunion publique, permanence, collecte : AUCUNE étiquette.
- Une animation ou un programme municipal générique (« une année de célébration », « les rendez-vous de l'automne ») n'est pas incontournable.
- famille : seulement si les enfants sont la cible principale (catégorie jeune-public, âge indiqué sous 12 ans, mots « enfants », « famille », « contes », « bébés »…).
- Dans le doute, n'attribue PAS l'étiquette. La majorité des événements (réunions, permanences, ateliers banals, visites ordinaires) n'ont AUCUNE étiquette.
- Juge sur le titre, la catégorie, le lieu et la date ; n'invente rien.
- Réponds UNIQUEMENT par un tableau JSON, sans texte autour : [{"id": 0, "t": ["fun"]}, {"id": 1, "t": []}, …], un objet par événement reçu.`;

function batchPrompt(items) {
  return items.map((ev, i) => {
    const parts = [`${i}. ${ev.title}`, `catégorie: ${ev.category}`];
    const lieu = [ev.place, ev.city].filter(Boolean).join(", ");
    if (lieu) parts.push(`lieu: ${lieu}`);
    const w = when(ev); if (w) parts.push(`quand: ${w}`);
    if (ev.schedule) parts.push(`horaire: ${ev.schedule}`);
    if (ev.subcats && ev.subcats.length) parts.push(`thèmes: ${ev.subcats.slice(0, 4).join(", ")}`);
    if (ev.free) parts.push("gratuit");
    return parts.join(" | ");
  }).join("\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callClaude(key, items, tries = 4) {
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Événements :\n${batchPrompt(items)}` }],
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) {
      const data = await res.json();
      const text = (data.content || []).map((c) => c.text || "").join("");
      const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
      const arr = JSON.parse(json);
      const usage = data.usage || {};
      return { arr, inTok: usage.input_tokens || 0, outTok: usage.output_tokens || 0 };
    }
    const msg = await res.text();
    // 401/403 = clé refusée, 400 = requête invalide (modèle inconnu…) : inutile d'insister.
    if ([400, 401, 403, 404].includes(res.status) || attempt >= tries) {
      throw new Error(`API ${res.status} : ${String(msg).slice(0, 200)}`);
    }
    await sleep(3000 * attempt);   // 429 / 529 / réseau : on patiente puis on réessaie
  }
}

function loadCache(reset) {
  if (reset) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) || {}; } catch { return {}; }
}

// Classe les événements non encore vus, puis pose ev.tags sur TOUS les événements.
async function applyTags(events, { max = null, dry = false, reset = false } = {}) {
  const key = readKey();
  const cache = loadCache(reset);
  const todo = [];
  const seen = new Set();
  for (const ev of events) {
    const k = tagKey(ev);
    const c = cache[k];
    if ((!c || c.v !== PROMPT_VERSION) && !seen.has(k)) { seen.add(k); todo.push(ev); }
  }
  const batchList = max ? todo.slice(0, Number(max)) : todo;

  if (!key && !dry) {
    console.log(`  ✨ classement IA ignoré (pas de clé .anthropic-key) : ${todo.length} événement(s) non classé(s).`);
  } else if (batchList.length) {
    console.log(`  ✨ classement IA : ${batchList.length} événement(s) à classer (${events.length - todo.length} déjà en cache), modèle ${MODEL}…`);
    const batches = [];
    for (let i = 0; i < batchList.length; i += BATCH) batches.push(batchList.slice(i, i + BATCH));
    if (dry) {
      console.log("----- consigne -----\n" + SYSTEM + "\n----- 1er lot -----\n" + batchPrompt(batches[0]));
      return;
    }
    let inTok = 0, outTok = 0, failed = 0, idx = 0;
    async function worker() {
      while (idx < batches.length) {
        const b = batches[idx++];
        try {
          const r = await callClaude(key, b);
          inTok += r.inTok; outTok += r.outTok;
          const byId = new Map(r.arr.map((o) => [Number(o.id), o.t]));
          b.forEach((ev, i) => {
            let t = (byId.get(i) || []).filter((x) => TAGS.includes(x)).slice(0, 2);
            // Garde-fou déterministe : l'IA étiquette parfois quand même ces formats-là.
            if (NO_TAG_RE.test(ev.title)) t = [];
            t = gardeFamille(ev, t);
            cache[tagKey(ev)] = { t, v: PROMPT_VERSION };
          });
        } catch (e) {
          failed += b.length;
          console.warn(`  ⚠ lot non classé (${b.length} événements) : ${e.message}`);
          if (/API 40[134]/.test(e.message)) { idx = batches.length; break; }   // clé/modèle KO : on arrête
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // Tarif Haiku 4.5 : 1 $ / M jetons en entrée, 5 $ / M en sortie (vérifié 2026-09).
    const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
    console.log(`  ✨ ${batchList.length - failed} classé(s), ${failed} en échec · ${inTok} + ${outTok} jetons ≈ ${cost.toFixed(3)} $`);
  }

  // Purge : on ne garde que les événements encore présents (le cache ne gonfle pas).
  const live = new Set(events.map(tagKey));
  for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
  if (!dry) fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf8");

  const counts = Object.fromEntries(TAGS.map((t) => [t, 0]));
  for (const ev of events) {
    const c = cache[tagKey(ev)];
    const tags = c ? gardeFamille(ev, c.t) : [];
    if (tags.length) { ev.tags = tags; tags.forEach((t) => counts[t]++); } else delete ev.tags;
  }
  console.log(`  ✨ étiquettes posées : ${TAGS.map((t) => `${t} ${counts[t]}`).join(", ")}`);
}

module.exports = { applyTags, TAGS };

if (require.main === module) {
  (async () => {
    const dataPath = path.join(__dirname, "data.js");
    const src = fs.readFileSync(dataPath, "utf8");
    const mod = { exports: {} };
    new Function("module", src + ";module.exports={EVENTS}")(mod);
    const { EVENTS } = mod.exports;
    const dry = !!arg("dry");
    await applyTags(EVENTS, { max: arg("max"), dry, reset: !!arg("reset") });
    if (dry) return;
    const i = src.indexOf("const EVENTS = ");
    fs.writeFileSync(dataPath, src.slice(0, i) + `const EVENTS = ${JSON.stringify(EVENTS, null, 2)};\n`, "utf8");
    console.log("✓ data.js mis à jour.");
    if (arg("max")) {
      const tagged = EVENTS.filter((e) => e.tags && e.tags.length);
      console.log("\nAperçu :\n" + tagged.slice(0, 40).map((e) => `  ${e.tags.join(",").padEnd(22)} ${e.date}  ${e.title}  (${e.city})`).join("\n"));
    }
  })().catch((e) => { console.error("✗", e.message); process.exit(1); });
}
