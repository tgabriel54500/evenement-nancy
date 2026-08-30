#!/usr/bin/env node
/**
 * Génère communes-30km.json : toutes les communes situées à 30 km ou moins de
 * Nancy (haversine sur le centre de la commune), avec nom officiel, coordonnées
 * et codes postaux.
 *
 * Pourquoi ce fichier existe :
 *   facebook.js doit décider tout seul, SANS réseau, si un événement est dans
 *   le périmètre (les cartes FB n'ont pas d'adresse structurée, donc pas de
 *   ville à géocoder). Le référentiel est donc figé dans le dépôt, ~40 Ko.
 *   update-events.js, lui, garde son géocodage BAN à la volée.
 *
 * Sources (téléchargées UNIQUEMENT à la régénération) :
 *   - contours IGN par département (gregoiredavid/france-geojson) : le centre
 *     est calculé sur le contour. ⚠️ NE PAS utiliser les "coordonnees_gps" du
 *     dataset La Poste (high54/Communes-France-JSON) : vérifié, elles sont
 *     fausses de 5 à 10 km sur beaucoup de communes (Seichamps donné à 14 km
 *     de Nancy au lieu de 7). Les centres IGN, eux, collent à la BAN (< 1 km).
 *   - noms officiels + codes postaux : @etalab/decoupage-administratif (npm,
 *     optionnel : sans lui on garde le nom du contour et aucun code postal).
 *
 * Départements couverts : 54, 55, 57, 88 (les seuls à moins de 30 km).
 *
 * Usage : node gen-communes.js [--km=30]
 */

const fs = require("fs");
const path = require("path");

const BASE = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements";
const DEPTS = ["54-meurthe-et-moselle", "55-meuse", "57-moselle", "88-vosges"];
const NANCY = { lat: 48.6921, lon: 6.1844 };   // même point que update-events.js
const OUT = path.join(__dirname, "communes-30km.json");

function haversineKm(a, b) {
  const R = 6371, rad = (x) => x * Math.PI / 180;
  const s = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Moyenne des sommets du contour : suffisant ici (communes petites, on ne
// cherche qu'une distance au kilomètre près).
function centre(geometry) {
  let sx = 0, sy = 0, n = 0;
  const walk = (c) => {
    if (typeof c[0] === "number") { sx += c[0]; sy += c[1]; n++; }
    else c.forEach(walk);
  };
  walk(geometry.coordinates);
  return { lat: sy / n, lon: sx / n };
}

async function main() {
  const maxKm = Number((process.argv.find((a) => a.startsWith("--km=")) || "").split("=")[1]) || 30;

  let meta = new Map();
  try {
    const etalab = require("@etalab/decoupage-administratif/data/communes.json");
    meta = new Map(etalab.map((c) => [String(c.code), c]));
  } catch { console.warn("  ⚠ @etalab/decoupage-administratif absent : pas de codes postaux."); }

  const out = {};
  for (const dep of DEPTS) {
    const url = `${BASE}/${dep}/communes-${dep}.geojson`;
    const r = await fetch(url);
    if (!r.ok) { console.error(`✗ ${dep} : HTTP ${r.status}`); process.exit(1); }
    const geo = await r.json();
    let n = 0;
    for (const f of geo.features) {
      const c = centre(f.geometry);
      const km = haversineKm(NANCY, c);
      if (km > maxKm) continue;
      const insee = String(f.properties.code);
      const m = meta.get(insee);
      out[insee] = {
        nom: (m && m.nom) || f.properties.nom,
        lat: +c.lat.toFixed(5), lon: +c.lon.toFixed(5),
        km: +km.toFixed(1),
        cp: (m && m.codesPostaux) || [],
      };
      n++;
    }
    console.log(`  ${dep} : ${n} commune(s) retenue(s)`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
  console.log(`✓ ${Object.keys(out).length} communes à ${maxKm} km max de Nancy → ${path.basename(OUT)}`);
}

main();
