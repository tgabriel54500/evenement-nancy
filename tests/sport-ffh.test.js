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
  const n3 = byKey("nancy-villers-2");
  assert.ok(n3 && n3.ffh.poule !== nv.ffh.poule, "N2 et N3 : deux poules distinctes");
  assert.ok(isClub(n3, "ENT. NANCY / VILLERS"));
  assert.ok(!isClub(n3, "HBC LURE VILLERS"), "Lure Villers (adversaire en N3) n'est pas l'entente");
});

test("week-end de chaque journée lu dans le sélecteur", () => {
  const sel = comp("competitions---journee-selector", { poule: { journees: JSON.stringify([
    { journee_numero: 10, date_debut: "2027-01-09", date_fin: "2027-01-10" },
    { journee_numero: 14, date_debut: "2027-02-27", date_fin: "2027-02-27" },
  ]) } });
  assert.deepStrictEqual(S.ffhJourneeDates(sel), {
    10: { debut: "2027-01-09", fin: "2027-01-10" },
    14: { debut: "2027-02-27", fin: "2027-02-27" },
  });
});

// Asynchrone : rencontre sans date fixée (date null, cas de toute la phase
// retour en octobre) → gardée sur le week-end de sa journée, « à confirmer ».
(async () => {
  const club = byKey("villers-f");
  const poule2 = { journees: JSON.stringify([{ journee_numero: 11, date_debut: "2027-01-16", date_fin: "2027-01-17" }]) };
  const rs = [
    { id: "1", ext_rencontreId: "9001", date: null, equipe1Libelle: "VILLERS HANDBALL", equipe2Libelle: "COLMAR CENTRE ALSACE", equipementId: "1604" },
    { id: "2", ext_rencontreId: "9002", date: null, equipe1Libelle: "REICHSTETT", equipe2Libelle: "VILLERS HANDBALL", equipementId: "77" },
  ];
  const page = "<html>" + comp("competitions---journee-selector", { poule: poule2 })
    + comp("competitions---rencontre-list", { poule: poule2, rencontres: JSON.stringify(rs) }) + "</html>";
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => page });
  try {
    const out = await S.scrapeFFH(club, { ffhSalles: { 1604: "MARIE MARVINGT VILLERS LES NANCY" } });
    assert.strictEqual(out.length, 1, "seul le match à domicile");
    assert.strictEqual(out[0].date, "2027-01-16");
    assert.strictEqual(out[0].dateEnd, "2027-01-17");
    assert.strictEqual(out[0].dateTbc, true);
    assert.strictEqual(out[0].time, "");
    n++; console.log("  ✓ rencontre sans date → week-end de la journée, à confirmer");
  } catch (e) { console.error("  ✗ rencontre sans date\n   ", e.message); process.exitCode = 1; }
  finally { global.fetch = realFetch; }
  console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
})();
