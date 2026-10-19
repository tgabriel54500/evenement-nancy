#!/usr/bin/env node
/**
 * Dédoublonnage des annonces de l'Est Républicain (sans image) face à la même
 * sortie publiée avec son affiche par une autre source (normalize.js).
 *   node tests/dedup-presse.test.js
 */
const assert = require("assert");
const { cleanupMerged } = require("../normalize");
let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const ev = (o) => ({ category: "activite", date: "2030-10-19", endDate: "2030-10-19", city: "Nancy", place: "", image: null, ...o });
const erp = (o) => ev({ source: "est-republicain", uuid: "erp-" + o.title, ...o });
const img = "https://exemple.fr/a.jpg";
console.log("dédoublonnage presse");

test("titre d'un mot repris par la Ville, période plus longue", () => {
  const out = cleanupMerged([erp({ title: "Sorcière" }), ev({ title: "\"Sorcière\" - Atelier d’arts plastiques", endDate: "2030-10-23", image: img })]);
  assert.strictEqual(out.filter((e) => /Sorci/.test(e.title)).length, 1);
});
test("coquille d'une lettre et pluriel", () => {
  assert.strictEqual(cleanupMerged([erp({ title: "Nature obscrure" }), ev({ title: "Nature obscure", image: img })]).length, 1);
  assert.strictEqual(cleanupMerged([erp({ title: "Randonnées roller" }), ev({ title: "Randonnées à Rollers", image: img, source: "curieux-net" })]).length, 1);
});
test("pas de fusion : autre commune, mot générique, ou moins de la moitié des mots", () => {
  assert.strictEqual(cleanupMerged([erp({ title: "Sorcière" }), ev({ title: "Atelier : la sorcière", city: "Laxou", image: img })]).length, 2);
  assert.strictEqual(cleanupMerged([erp({ title: "Encore une histoire" }), ev({ title: "Musée en famille : histoire de s'amuser", image: img })]).length, 2);
  assert.strictEqual(cleanupMerged([erp({ title: "Emile Gallé lecteur de la Bible par le frère Jean" }), ev({ title: "Émile Gallé. Portrait d'une vie", image: img })]).length, 2);
});
console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
