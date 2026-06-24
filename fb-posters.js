/**
 * fb-posters.js — Récupère l'AFFICHE de chaque événement Facebook et la
 * réhéberge en local (les events FB n'ont pas d'image sinon).
 *
 * Pourquoi rehéberger : l'URL publique stable d'une affiche FB est
 *   https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=<EVENT_ID>
 * mais elle n'est servie en image/jpeg QU'À un user-agent crawler
 * (facebookexternalhit). Un navigateur normal reçoit une page HTML de
 * redirection → <img src> cassé. On télécharge donc côté serveur avec ce
 * UA, on stocke dans images/fb/<id>.jpg, et on pointe le champ `image`
 * vers ce chemin local (servi par wrangler, voir .assetsignore).
 *
 *   node fb-posters.js                 # télécharge les manquantes
 *   node fb-posters.js --force         # re-télécharge tout
 *
 * Puis : node update-events.js  (propage `image` dans data.js)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const JSON_FILE = path.join(__dirname, "events-facebook.json");
const IMG_DIR = path.join(__dirname, "images", "fb");
const REL_PREFIX = "images/fb"; // chemin référencé dans data.js (servi en prod)
const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const CONCURRENCY = 6;
const MIN_BYTES = 2000; // en-deçà = placeholder/erreur, pas une vraie affiche
const force = process.argv.includes("--force");

function idOf(ev) {
  const m = String(ev.uuid || "").match(/^fb-(\d+)$/);
  return m ? m[1] : null;
}

// Télécharge l'affiche d'un event. Résout { ok, bytes } ; n'écrit le fichier
// que si la réponse est bien une image de taille plausible.
function fetchPoster(id, dest) {
  return new Promise((resolve) => {
    const url = `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=${id}`;
    const req = https.get(url, { headers: { "User-Agent": UA } }, (res) => {
      const ct = res.headers["content-type"] || "";
      if (res.statusCode !== 200 || !/^image\//.test(ct)) {
        res.resume();
        return resolve({ ok: false, reason: `HTTP ${res.statusCode} ${ct}` });
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < MIN_BYTES) return resolve({ ok: false, reason: `${buf.length}o` });
        fs.writeFileSync(dest, buf);
        resolve({ ok: true, bytes: buf.length });
      });
    });
    req.on("error", (e) => resolve({ ok: false, reason: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ ok: false, reason: "timeout" }); });
  });
}

async function main() {
  const events = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const jobs = [];
  for (const ev of events) {
    const id = idOf(ev);
    if (!id) continue;
    const file = path.join(IMG_DIR, `${id}.jpg`);
    const rel = `${REL_PREFIX}/${id}.jpg`;
    if (fs.existsSync(file) && !force) {
      ev.image = rel; // déjà rehébergée
      continue;
    }
    jobs.push({ ev, id, file, rel });
  }

  console.log(`${jobs.length} affiche(s) à télécharger (sur ${events.length} events).`);
  let ok = 0, ko = 0, done = 0;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (j) => {
      const r = await fetchPoster(j.id, j.file);
      done++;
      if (r.ok) { j.ev.image = j.rel; ok++; }
      else { ko++; if (ko <= 15) console.log(`  ✗ ${j.id} (${r.reason})`); }
      if (done % 25 === 0) console.log(`  …${done}/${jobs.length}`);
    }));
  }

  fs.writeFileSync(JSON_FILE, JSON.stringify(events, null, 2) + "\n");
  const withImg = events.filter((e) => e.image).length;
  console.log(`✓ ${ok} téléchargées, ${ko} sans affiche. ${withImg}/${events.length} events avec image.`);
  console.log("  Puis : node update-events.js");
}

main();
