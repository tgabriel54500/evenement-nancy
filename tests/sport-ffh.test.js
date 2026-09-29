#!/usr/bin/env node
/**
 * Test hors ligne de l'adaptateur FFHandball de sport-scrape.js. Le fixture
 * reproduit l'encodage réel relevé le 2026-09-29 sur ffhandball.fr : des
 * <smartfire-component> dont l'attribut `attributes` contient du JSON avec les
 * guillemets en &quot; (et le JSON des rencontres/journées encore encodé en
 * chaîne à l'intérieur).
 *
 *   node tests/sport-ffh.test.js
 */
const assert = require("assert");
const S = require("../sport-scrape");
const { byKey, isClub } = require("../sport-clubs");

const attr = (o) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const comp = (name, o) => `<smartfire-component name='${name}' attributes="${attr(o)}"></smartfire-component>`;

const journees = [{ journee_numero: 1, date_debut: "2026-09-05" }, { journee_numero: 2, date_debut: "2026-09-12" }, { journee_numero: 3, date_debut: "2026-09-19" }];
const poule = { id: "244699", ext_pouleId: "191246", libelle: "POULE 6", journees: JSON.stringify(journees) };
const rencontres = [
  { id: "3015621", ext_rencontreId: "2649419", journeeNumero: "4", date: "2026-10-03T21:00:00+02:00", equipe1Libelle: "VILLERS HANDBALL", equipe2Libelle: "DAMBACH LA VILLE", equipementId: "1604" },
  { id: "3015622", ext_rencontreId: "2649420", journeeNumero: "4", date: "2026-10-03T20:45:00+02:00", equipe1Libelle: "CHEVIGNY ST SAUVEUR HANDBALL", equipe2Libelle: "VILLERS HANDBALL", equipementId: "172" },
  { id: "3015623", ext_rencontreId: "2649421", journeeNumero: "4", date: "2026-10-03T20:00:00+02:00", equipe1Libelle: "ELITE VAL-D'OISE", equipe2Libelle: "ENTENTE WITTENHEIM-ENSISHEIM / THANN (N2)", equipementId: "6225" },
];
const html = "<html><body>" + comp("competitions---journee-selector", { poule, selected_numero_journee: "4" })
  + comp("competitions---rencontre-list", { poule, rencontres: JSON.stringify(rencontres) })
  + comp("competitions---rencontre-salle", { equipement: { id: "1604", libelle: "MARIE MARVINGT", rue: "BOULEVARD DES ESSARTS", codePostal: "54600", ville: "VILLERS LES NANCY" } })
  + "</body></html>";

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
console.log("sport-scrape.js (FFHandball)");

test("composants : JSON décodé, journées, rencontres", () => {
  assert.deepStrictEqual(S.ffhJournees(html), [1, 2, 3]);
  const rs = S.ffhRencontres(html);
  assert.strictEqual(rs.length, 3);
  assert.strictEqual(rs[2].equipe1Libelle, "ELITE VAL-D'OISE", "apostrophe décodée");
  const salle = S.ffhComponent(html, "competitions---rencontre-salle").equipement;
  assert.strictEqual(salle.libelle, "MARIE MARVINGT");
});

test("date locale avec décalage → date + heure locales", () => {
  assert.deepStrictEqual(S.ffhWhen("2026-10-03T21:00:00+02:00"), { date: "2026-10-03", time: "21h00" });
  assert.deepStrictEqual(S.ffhWhen("2026-10-03 19:00:00.000"), { date: "2026-10-03", time: "19h00" });
  assert.deepStrictEqual(S.ffhWhen(""), { date: "", time: "" });
});

test("domicile / extérieur par alias des clubs", () => {
  const vf = byKey("villers-f"), nv = byKey("nancy-villers");
  assert.ok(isClub(vf, "VILLERS HANDBALL"));
  assert.ok(!isClub(vf, "HBC LURE VILLERS"));
  assert.ok(isClub(nv, "ENT. NANCY / VILLERS"));
  assert.ok(!isClub(nv, "ELITE VAL-D'OISE"));
});

console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
