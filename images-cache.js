#!/usr/bin/env node
/**
 * images-cache.js : copie locale et allégée des affiches hébergées chez les sources.
 *
 * Pourquoi (constaté le 2026-10-21) : la galerie chargeait chaque affiche
 * directement chez sa source. Le serveur d'images du Grand Nancy
 * (agenda-static.grandnancy.eu, ~370 affiches) a répondu « Maintenance de
 * sécurité en cours » (503) : toutes ces affiches ont disparu du site. Et
 * beaucoup d'originaux sont énormes (2 500 px, 800 Ko), d'où la lenteur.
 *
 * Principe : à chaque mise à jour, chaque image distante est téléchargée UNE
 * fois depuis le Mac, réduite à 900 px de côté en JPEG (outil `sips` de macOS),
 * et rangée dans images/c/<empreinte>.jpg, servi par notre site. Une affiche
 * déjà copiée ne dépend plus de sa source : une panne chez elle ne se voit pas.
 * Si le téléchargement échoue, l'événement garde l'adresse d'origine (et son
 * affiche de secours, cf. affiches-auto.js) et on réessaie au passage suivant.
 *
 * Appelé par update-events.js juste avant l'écriture de data.js :
 *   await require("./images-cache").cacheImages(merged);
 * En ligne de commande, sur le data.js actuel :
 *   node images-cache.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const { execFileSync } = require("child_process");

const DIR = path.join(__dirname, "images", "c");
const REL = "images/c";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const CONCURRENCY = 8;
const MIN_BYTES = 1500;          // en dessous : page d'erreur ou pixel de suivi
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 900;            // tuile ≈ 380 px en haute définition, page ≈ 680 px
const MAX_NEW = Number(process.env.IMAGES_CACHE_MAX || 1500);   // par passage
const BUDGET_MS = 6 * 60 * 1000;                                 // pour ne pas bloquer la mise à jour

let SIPS = null;
try { execFileSync("/usr/bin/sips", ["--help"], { stdio: "ignore" }); SIPS = "/usr/bin/sips"; } catch { /* hors Mac */ }

const keyOf = (url) => crypto.createHash("sha1").update(url).digest("hex").slice(0, 20);

function download(url, redirects = 0) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, reason: "adresse invalide" }); }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.get(u, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume();
        return resolve(download(new URL(res.headers.location, u).href, redirects + 1));
      }
      const ct = res.headers["content-type"] || "";
      if (res.statusCode !== 200 || !/^image\/(jpe?g|png|webp|gif|avif|heic)/i.test(ct)) {
        res.resume();
        return resolve({ ok: false, reason: `HTTP ${res.statusCode} ${ct.split(";")[0]}` });
      }
      const chunks = []; let n = 0;
      res.on("data", (c) => { n += c.length; if (n > MAX_BYTES) req.destroy(); else chunks.push(c); });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < MIN_BYTES) return resolve({ ok: false, reason: `${buf.length} o` });
        resolve({ ok: true, buf });
      });
      res.on("error", (e) => resolve({ ok: false, reason: e.message }));
    });
    req.on("error", (e) => resolve({ ok: false, reason: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ ok: false, reason: "délai dépassé" }); });
  });
}

// Réduit et convertit en JPEG. Sans sips (hors Mac), on garde l'original.
function shrink(buf, dest) {
  const tmp = dest + ".src";
  fs.writeFileSync(tmp, buf);
  try {
    if (SIPS) {
      execFileSync(SIPS, ["-Z", String(MAX_SIDE), "-s", "format", "jpeg", "-s", "formatOptions", "72", tmp, "--out", dest], { stdio: "ignore", timeout: 30000 });
      if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_BYTES) return true;
    }
    fs.renameSync(tmp, dest);
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* déjà déplacé */ }
  }
}

async function cacheImages(events) {
  fs.mkdirSync(DIR, { recursive: true });
  const t0 = Date.now();
  const todo = new Map();   // url -> [events]
  const used = new Set();
  let reused = 0;
  for (const ev of events) {
    const url = ev.image;
    if (!url || !/^https?:\/\//.test(url) || /\.svg(\?|$)/i.test(url)) continue;
    const file = `${keyOf(url)}.jpg`;
    if (fs.existsSync(path.join(DIR, file))) {
      ev.imageSource = url; ev.image = `${REL}/${file}`; used.add(file); reused++;
      continue;
    }
    if (!todo.has(url)) todo.set(url, []);
    todo.get(url).push(ev);
  }
  const jobs = [...todo.entries()].slice(0, MAX_NEW);
  let ok = 0, ko = 0, i = 0;
  const fails = {};
  async function worker() {
    while (i < jobs.length && Date.now() - t0 < BUDGET_MS) {
      const [url, evs] = jobs[i++];
      const file = `${keyOf(url)}.jpg`;
      const r = await download(url);
      if (r.ok && shrink(r.buf, path.join(DIR, file))) {
        for (const ev of evs) { ev.imageSource = url; ev.image = `${REL}/${file}`; }
        used.add(file); ok++;
      } else {
        ko++;
        const host = url.split("/")[2];
        fails[host] = (fails[host] || 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // Ménage : on retire les copies que plus aucun événement n'utilise.
  let removed = 0;
  for (const f of fs.readdirSync(DIR)) {
    if (f.endsWith(".jpg") && !used.has(f)) { try { fs.unlinkSync(path.join(DIR, f)); removed++; } catch { /* suppression refusée */ } }
  }
  const left = todo.size - ok;
  console.log(`  🖼  images en local : ${reused} déjà copiées, ${ok} nouvelles, ${ko} en échec` +
    `${left > ko ? `, ${left - ko} remises au prochain passage` : ""}, ${removed} retirées (images/c/, ${SIPS ? "réduites à " + MAX_SIDE + " px" : "sans réduction : sips absent"}).`);
  if (ko) console.log("     échecs par site : " + Object.entries(fails).map(([h, n]) => `${h} ${n}`).join(", "));
  return { reused, ok, ko };
}

module.exports = { cacheImages };

if (require.main === module) {
  (async () => {
    const dataPath = path.join(__dirname, "data.js");
    const src = fs.readFileSync(dataPath, "utf8");
    const mod = { exports: {} };
    new Function("module", src + ";module.exports={EVENTS}")(mod);
    const { EVENTS } = mod.exports;
    await cacheImages(EVENTS);
    if (process.argv.includes("--dry")) return;
    const i = src.indexOf("const EVENTS = ");
    fs.writeFileSync(dataPath, src.slice(0, i) + `const EVENTS = ${JSON.stringify(EVENTS, null, 2)};\n`, "utf8");
    console.log("✓ data.js mis à jour.");
  })();
}
