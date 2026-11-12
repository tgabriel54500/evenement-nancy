#!/usr/bin/env node
/**
 * Test hors ligne de l'autorité tarifaire au dédoublonnage (normalize.js) :
 * « gratuit » ne vient que de la source la mieux placée pour le savoir.
 * Cas réel du 2026-10-08 : BD-concert NJP à L'Autre Canal, 15 € sur nancy.fr
 * et sur le site de la salle, affiché « Gratuit » parce qu'Alentoor le disait.
 *
 *   node tests/normalize-pricing.test.js
 */
const assert = require("assert");
const { pickFree, dedupeCrossSource } = require("../normalize");

const ev = (o) => Object.assign({
  title: "Emile Londonien x Pierre Henry Gomont", category: "musiques-actuelles",
  date: "2026-10-08", endDate: "2026-10-08", place: "L'Autre Canal", city: "Nancy",
  free: false, reservation: false, subcats: [],
}, o);
const ville = ev({ uuid: "a1", title: "NJP 2026 : Création NJP - Bd-Concert Émile Londonien x Pierre-Henry Gomont", dateText: "Jeudi 8 octobre 2026", image: "x", reservation: true });
const alentoor = ev({ uuid: "al-1", source: "alentoor", free: true });
const salle = ev({ uuid: "lcn-1", source: "autre-canal", image: "y", reservation: true });

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
console.log("normalize.js (tarif)");

test("Alentoor « gratuit » ne l'emporte ni sur la Ville ni sur la salle", () => {
  assert.strictEqual(pickFree([ville, alentoor]), false);
  assert.strictEqual(pickFree([ville, alentoor, salle]), false);
  assert.strictEqual(pickFree([alentoor, salle]), false);
});

test("la salle prime sur la Ville ; sans source d'autorité, un « gratuit » suffit (ancien comportement)", () => {
  assert.strictEqual(pickFree([ev({ free: false }), ev({ source: "autre-canal", free: true })]), true);
  assert.strictEqual(pickFree([ev({ free: true }), ev({ source: "poirel", free: false })]), false);
  assert.strictEqual(pickFree([alentoor]), true);
  assert.strictEqual(pickFree([ev({ source: "destination-nancy", free: true }), ev({ source: "alentoor", free: false })]), true);
  assert.strictEqual(pickFree([ev({ source: "destination-nancy", free: false }), ev({ source: "alentoor", free: true })]), true, "Destination Nancy ne sait pas (false = inconnu)");
  assert.strictEqual(pickFree([ev({ source: "vandoeuvre", free: false }), ev({ source: "facebook", free: false })]), false);
});

test("au dédoublonnage : une fiche, payante, sur réservation", () => {
  const merged = dedupeCrossSource([ville, alentoor, salle]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].free, false);
  assert.strictEqual(merged[0].reservation, true);
  assert.strictEqual(merged[0].uuid, "a1", "la Ville reste la fiche de référence");
});

console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
