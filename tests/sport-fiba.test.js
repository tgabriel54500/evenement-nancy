#!/usr/bin/env node
/**
 * Test hors ligne de l'adaptateur FIBA de sport-scrape.js (coupe d'Europe du
 * SLUC). Le fixture reproduit la forme réelle relevée le 2026-09-29 sur
 * fiba.basketball : les rencontres en JSON, dans une chaîne JS échappée passée
 * à self.__next_f.push.
 *
 *   node tests/sport-fiba.test.js
 */
const assert = require("assert");
const { parseFibaGames, fibaHomeMatches } = require("../sport-scrape");
const { byKey } = require("../sport-clubs");

const game = (o) => Object.assign({
  gameId: 0, gameName: "31174-D-1", gameNumber: "1", statusCode: "INIT",
  teamA: { teamId: 285078, code: "SLUC", officialName: "SASP SLUC Nancy Basket", shortName: "SLUC Nancy Basket" },
  teamB: { teamId: 285341, code: "BCV", officialName: "BC Vienna", shortName: "BC Vienna" },
  teamAScore: 0, teamBScore: 0, hostCity: "Nancy", hostCountry: "France",
  venueName: 'Palais des Sports "Jean Weille"', gameDateTime: "2026-10-06T20:00:00", hasTimeGameDateTime: true,
  groupPairingCode: "D", round: { roundName: "Regular Season", roundKind: "Standard Round" },
  competition: { officialName: "FIBA Europe Cup", season: 2027 },
}, o);
const games = [
  game({ gameId: 135754 }),
  game({ gameId: 135765, gameName: "31174-D-12", gameNumber: "12", teamA: { code: "KSZ", shortName: "King Szczecin" }, teamB: { code: "SLUC", shortName: "SLUC Nancy Basket" }, hostCity: "Szczecin", venueName: "Enea Arena", gameDateTime: "2026-10-28T19:00:00" }),
  game({ gameId: 135773, gameName: "31174-D-20", gameNumber: "20", teamB: null, gameDateTime: "2026-11-17T20:00:00" }),
  game({ gameId: 140001, gameName: "31174-SR-3", gameNumber: "3", groupPairingCode: "K", round: { roundName: "Second Round" }, teamB: { code: "XYZ", shortName: "Futur adversaire" }, gameDateTime: "2027-01-13T00:00:00", hasTimeGameDateTime: false }),
  game({ gameId: 135754 }),   // doublon (la page répète certains blocs)
];
const payload = 'a:["$","div",null,{"games":' + JSON.stringify(games) + ',"x":1}]';
const html = '<html><body><script>self.__next_f.push([1,' + JSON.stringify(payload) + '])</script>'
  + '<script>self.__next_f.push([1,"autre chunk sans match"])</script></body></html>';

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
console.log("sport-scrape.js (FIBA)");

test("lecture des rencontres dans le HTML brut, dédoublonnées", () => {
  const g = parseFibaGames(html);
  assert.strictEqual(g.length, 4);
  assert.strictEqual(g[0].venueName, 'Palais des Sports "Jean Weille"');
});

test("matchs à domicile du SLUC : adversaire, date, heure, tour, groupe", () => {
  const club = byKey("sluc");
  const rows = fibaHomeMatches(club, parseFibaGames(html), { competition: "FIBA Europe Cup", codes: ["SLUC"], url: "https://www.fiba.basketball/x" });
  assert.deepStrictEqual(rows.map(r => r.id), ["sluc-fec-135754", "sluc-fec-135773", "sluc-fec-140001"], "Szczecin (extérieur) exclu");
  const [a, b, c] = rows;
  assert.strictEqual(a.date, "2026-10-06"); assert.strictEqual(a.time, "20h00");
  assert.strictEqual(a.opponent, "BC Vienna");
  assert.strictEqual(a.competition, "FIBA Europe Cup");
  assert.strictEqual(a.round, "Saison régulière · groupe D · match 1");
  assert.strictEqual(a.place, "Palais des Sports Jean Weille"); assert.strictEqual(a.city, "Nancy");
  assert.strictEqual(b.opponent, "Adversaire à déterminer");
  assert.strictEqual(c.time, "", "horaire inconnu = vide");
  assert.strictEqual(c.round, "2e tour · match 3");
  assert.strictEqual(c.date, "2027-01-13");
});

console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
