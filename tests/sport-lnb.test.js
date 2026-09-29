#!/usr/bin/env node
/**
 * Test hors ligne de l'adaptateur LNB de sport-scrape.js (horaires du SLUC en
 * championnat) et de la fusion FFBB + LNB. Le fixture reproduit la forme réelle
 * de POST api-prod.lnb.fr/match/v3/getCalendar relevée le 2026-09-29
 * (champs inutiles retirés).
 *
 *   node tests/sport-lnb.test.js
 */
const assert = require("assert");
const { lnbHomeMatches, fusionSluc, heureParis, saisonLNB } = require("../sport-scrape");
const { byKey } = require("../sport-clubs");

const NANCY = { external_id: 1868, team_name: "Nancy", team_code: "NAN" };
const game = (o) => Object.assign({
  id: 0, match_id: "x", tournament_number: 0, match_status: "SCHEDULED", external_id: 0,
  division_external_id: 1, competition_abbrev: "PROA", phase_id: 1, phase_name: "", venue_name: "",
  teams: [NANCY, { external_id: 1870, team_name: "Paris", team_code: "PAB" }],
}, o);
const days = [
  { date: "2026-09-27", data: [game({ external_id: 30071, match_date: "2026-09-27", match_time_utc: "2026-09-27T14:30:00.000Z", match_status: "COMPLETE", round_number: 1, display_round: "J1" })] },
  { date: "2026-10-03", data: [game({ external_id: 30077, match_date: "2026-10-03", match_time_utc: "2026-10-03T16:00:00.000Z", round_number: 2, display_round: "J2", teams: [NANCY, { external_id: 1861, team_name: "Cholet" }] })] },
  { date: "2026-10-10", data: [game({ external_id: 30082, match_date: "2026-10-10", match_time_utc: "2026-10-10T16:30:00.000Z", round_number: 3, display_round: "J3", teams: [{ external_id: 1859, team_name: "Chalon/Saône" }, NANCY] })] },
  { date: "2026-12-22", data: [game({ external_id: 30166, match_date: "2026-12-22", match_time_utc: "2026-12-22T19:00:00.000Z", round_number: 13, display_round: "J13", teams: [NANCY, { external_id: 1858, team_name: "Bourg-en-Bresse" }] })] },
  { date: "2027-04-03", data: [game({ external_id: 30261, match_date: "2027-04-03", match_time_utc: "2027-04-03T18:00:00.000Z", round_number: 25, display_round: "J25", teams: [NANCY, { external_id: 1857, team_name: "Boulazac" }] })] },
];

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
console.log("sport-scrape.js (LNB)");

test("heure UTC → heure de Paris, été comme hiver", () => {
  assert.deepStrictEqual(heureParis("2026-10-03T16:00:00.000Z"), { date: "2026-10-03", time: "18h00" });
  assert.deepStrictEqual(heureParis("2026-12-22T19:00:00.000Z"), { date: "2026-12-22", time: "20h00" });
  assert.deepStrictEqual(heureParis("2026-12-22T23:30:00.000Z"), { date: "2026-12-23", time: "00h30" }, "passage de minuit");
  assert.deepStrictEqual(heureParis(""), { date: "", time: "" });
  assert.strictEqual(saisonLNB(new Date("2026-09-29")), 2026);
  assert.strictEqual(saisonLNB(new Date("2027-03-01")), 2026);
  assert.strictEqual(saisonLNB(new Date("2027-08-01")), 2027);
});

test("matchs à domicile du SLUC d'après getCalendar", () => {
  const club = byKey("sluc");
  const rows = lnbHomeMatches(club, days, { abbrev: "PROA", teamExternalId: 1868, url: "https://lnb.fr/x" });
  assert.deepStrictEqual(rows.map(r => r.id), ["sluc-j1", "sluc-j2", "sluc-j13", "sluc-j25"], "Chalon (extérieur) exclu");
  const j2 = rows[1];
  assert.strictEqual(j2.date, "2026-10-03"); assert.strictEqual(j2.time, "18h00");
  assert.strictEqual(j2.opponent, "Cholet");
  assert.strictEqual(j2.round, "2e journée");
  assert.strictEqual(j2.competition, "Betclic ÉLITE");
  assert.strictEqual(j2.place, "Palais des Sports Jean Weille"); assert.strictEqual(j2.city, "Nancy");
  assert.strictEqual(j2.source, "lnb.fr"); assert.strictEqual(j2.url, "https://lnb.fr/x");
  assert.strictEqual(rows[0].round, "1re journée");
  assert.strictEqual(rows[3].time, "20h00", "heure d'été");
});

test("fusion FFBB + LNB : la FFBB garde l'adversaire, la LNB impose date et heure", () => {
  const club = byKey("sluc");
  const lnb = lnbHomeMatches(club, days, { abbrev: "PROA", teamExternalId: 1868 });
  const ffbb = [
    { id: "sluc-j2", club: "sluc", date: "2026-10-03", time: "", opponent: "Cholet Basket", source: "ffbb.com" },
    { id: "sluc-j13", club: "sluc", date: "2026-12-23", time: "", opponent: "JL Bourg", source: "ffbb.com" },   // reportée par la ligue
    { id: "sluc-j7", club: "sluc", date: "2026-11-07", time: "", opponent: "Limoges CSP", source: "ffbb.com" },   // inconnue de la LNB
  ];
  const rows = fusionSluc(ffbb, lnb);
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.strictEqual(rows.length, 5);
  assert.strictEqual(by["sluc-j2"].opponent, "Cholet Basket");
  assert.strictEqual(by["sluc-j2"].time, "18h00");
  assert.strictEqual(by["sluc-j2"].source, "ffbb.com + lnb.fr");
  assert.strictEqual(by["sluc-j13"].date, "2026-12-22", "la date LNB prime");
  assert.strictEqual(by["sluc-j7"].time, "", "FFBB seule : inchangée");
  assert.strictEqual(by["sluc-j1"].source, "lnb.fr", "LNB seule : gardée");
  assert.strictEqual(ffbb[0].time, "", "l'entrée FFBB d'origine n'est pas modifiée");
  assert.deepStrictEqual(fusionSluc([], lnb).length, 4);
  assert.deepStrictEqual(fusionSluc(ffbb, []).length, 3);
});

console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
