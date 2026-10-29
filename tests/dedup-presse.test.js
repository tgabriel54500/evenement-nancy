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
  assert.strictEqual(cleanupMerged([erp({ title: "Emile Gallé lecteur de la Bible par le frère Jean" }), ev({ title: "Émile Gallé. Portrait d'une vie", endDate: "2031-01-31", image: img })]).length, 2);
});
test("mot rare commun le même jour (Chevreuil), pas un mot partagé par d'autres sorties (Halloween)", () => {
  const a = ev({ title: "Chevreuil (rock expérimental) + Tony Geranno", source: "ville-de-nancy" });
  const b = ev({ title: "Concert - Chevreuil et Tony Geranno - Association", source: "destination-nancy" });
  assert.strictEqual(cleanupMerged([a, b]).length, 1);
  const h1 = ev({ title: "Club Dancing Kids d'Halloween", source: "autre-canal" });
  const h2 = ev({ title: "Marché Halloween et flashs tattoo", source: "facebook" });
  const h3 = ev({ title: "Après-midi Halloween au musée", source: "curieux-net" });
  assert.strictEqual(cleanupMerged([h1, h2, h3]).length, 3);
});
test("heures différentes = deux séances", () => {
  const a = ev({ title: "Linh", schedule: "15h", source: "curieux-net" });
  const b = ev({ title: "Linh - la Tournée", schedule: "20h30", source: "alentoor" });
  assert.strictEqual(cleanupMerged([a, b]).length, 2);
  assert.strictEqual(cleanupMerged([{ ...a, schedule: "20h30" }, b]).length, 1);
});
test("une lettre changée n'est pas une coquille (centre / contre)", () => {
  assert.strictEqual(cleanupMerged([ev({ title: "Visite guidée du centre", source: "alentoor" }), ev({ title: "Atelier contre le patriarcat", source: "curieux-net" })]).length, 2);
});
test("revue du 29/10 : Candide et 5 Rosies fusionnés, pas Murder party ni les entrées gratuites", () => {
  assert.strictEqual(cleanupMerged([ev({ title: "Candide de Bernstein", endDate: "2030-10-26", schedule: "20h", source: "ville-de-nancy" }), ev({ title: "Opéra - Candide", source: "destination-nancy" })]).length, 1);
  assert.strictEqual(cleanupMerged([ev({ title: "THE 5 ROSIES - TRIBUTE TO AC/DC", source: "curieux-net" }), ev({ title: "The 5 Rosies • Chaudeau", source: "facebook" })]).length, 1);
  assert.strictEqual(cleanupMerged([ev({ title: "Murder party", source: "destination-nancy" }), ev({ title: "Road To Invasion : Halloween Party • L'Autre Canal Nancy", source: "facebook" })]).length, 2);
  assert.strictEqual(cleanupMerged([ev({ title: "Entrée gratuite dans les musées", source: "ville-de-nancy" }), ev({ title: "Visites gratuites de la Cathédrale", source: "destination-nancy" })]).length, 2);
  // Plusieurs « Saint-Nicolas » publiés par la même source le même jour : rien ne fusionne.
  assert.strictEqual(cleanupMerged([ev({ title: "Les légendes de Saint Nicolas", source: "ville-de-nancy" }), ev({ title: "Saint-Nicolas dans les quartiers : le génie de la grande horloge", source: "ville-de-nancy" }), ev({ title: "Lecture - Fêtes de Saint Nicolas - Conte", source: "destination-nancy" })]).length, 3);
});
console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
