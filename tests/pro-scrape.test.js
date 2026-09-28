#!/usr/bin/env node
/**
 * Tests hors ligne des parsers de pro-scrape.js, sur des extraits HTML réels
 * (tests/fixtures-pro/, relevés le 2026-09-28). Aucune requête réseau.
 *
 *   node tests/pro-scrape.test.js
 *
 * Quand une source change de maquette : relever le nouveau HTML, mettre à jour
 * le fixture, faire passer le test, puis seulement corriger le parser.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const S = require("../pro-scrape");

const fx = (n) => fs.readFileSync(path.join(__dirname, "fixtures-pro", n), "utf8");
let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };

console.log("pro-scrape.js");

test("Les Audacieux : cartes à venir seulement, date, heure, lieu, tarif", () => {
  const evs = S.parseAudacieux(fx("audacieux.html"));
  assert.strictEqual(evs.length, 2, "les cartes event_past sont ignorées");
  const [a, b] = evs;
  assert.strictEqual(a.title, "Petit déj Audacieux – B’CoWorker Nancy");
  assert.strictEqual(a.date, "2026-10-01");
  assert.strictEqual(a.time, "8h30");
  assert.strictEqual(a.city, "Nancy");
  assert.strictEqual(a.category, "petit-dej");
  assert.strictEqual(a.url, "https://adsum.social/e/petit-dej-audacieux-b-coworker-nancy");
  assert.strictEqual(a.membersOnly, false);
  assert.strictEqual(b.city, "Vandœuvre-lès-Nancy");
  assert.strictEqual(b.time, "19h00");
  assert.strictEqual(b.price, "20€");
  assert.strictEqual(b.category, "afterwork");
});

test("Cafés Business : hôte + date, 9h, lien businessapp", () => {
  const evs = S.parseCafesBusiness(fx("cafesbusiness.html"));
  assert.strictEqual(evs.length, 3);
  assert.strictEqual(evs[0].title, "Café Business chez Combi Events");
  assert.strictEqual(evs[0].date, "2026-09-29");
  assert.strictEqual(evs[0].time, "9h00");
  assert.strictEqual(evs[0].place, "Combi Events");
  assert.strictEqual(evs[0].url, "https://lescafesbusiness.businessapp.fr/meetings/view/3374");
  assert.strictEqual(evs[0].logo, "https://lescafesbusiness.fr/wp-content/uploads/2026/07/Combi-events.png", "logo de l'hôte");
  assert.strictEqual(evs[1].logo, "");
  assert.strictEqual(evs[2].date, "2026-12-08");
  assert.strictEqual(evs[0].category, "petit-dej");
});

test("ADJAN : seulement le bloc Nancy, intervenant, date, lieu, photo", () => {
  const evs = S.parseAdjan(fx("adjan.html"));
  assert.strictEqual(evs.length, 3, "les dates de Reims sont exclues");
  assert.deepStrictEqual(evs.map(e => e.date), ["2026-10-06", "2026-11-03", "2026-11-17"]);
  assert.strictEqual(evs[0].title, "8/9 ADJAN avec Marc Madiot");
  assert.strictEqual(evs[0].place, "Campanile Nancy Gare");
  assert.strictEqual(evs[0].image, "https://adjan.fr/wp-content/uploads/2026/09/Marc-MADIOT-nancy.png");
  assert.strictEqual(evs[1].image, "https://adjan.fr/wp-content/uploads/2026/09/Luc-ALPHAND.png");
  assert.strictEqual(evs[1].city, "Nancy");
  assert.strictEqual(evs[0].time, "8h00–9h00");
  assert.ok(/hsforms/.test(evs[0].url) && !/\?/.test(evs[0].url));
});

test("MEDEF 54 : liste (dates abrégées, couverture par défaut ignorée) + fiche (heure, lieu, adhérents)", () => {
  const items = S.parseMedefListe(fx("medef-liste.html"));
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].date, "2026-10-22");
  assert.strictEqual(items[0].image, "");
  assert.strictEqual(items[1].date, "2026-09-09");
  assert.ok(/cover\.jpeg$/.test(items[1].image));
  assert.strictEqual(items[2].date, "2026-06-24");
  const ev = S.parseMedefFiche(fx("medef-fiche.html"), items[1]);
  assert.strictEqual(ev.time, "18h00");
  assert.strictEqual(ev.city, "Nancy");
  assert.ok(/ICN Business School/.test(ev.place), ev.place);
  assert.strictEqual(ev.membersOnly, true);
  assert.ok(/inscription\/84$/.test(ev.url));
  assert.strictEqual(ev.category, "conference");
  assert.strictEqual(ev.online, false);
});

test("CCI : plages de dates, matchs exclus, ville après « à », tarifs", () => {
  const evs = S.parseCCI(fx("cci.html"));
  assert.strictEqual(evs.length, 4, "VNVB vs Bordeaux est exclu");
  const gaz = evs.find(e => /gaz verts/.test(e.title));
  assert.strictEqual(gaz.online, true, "sans lieu = webinaire");
  assert.strictEqual(gaz.date, "2026-10-02");
  assert.strictEqual(gaz.time, "9h00–10h00");
  assert.strictEqual(gaz.free, true);
  assert.ok(/^https:\/\/www\.nancy\.cci\.fr\/sites\//.test(gaz.image));
  const form = evs.find(e => /Création entreprise/.test(e.title));
  assert.strictEqual(form.date, "2026-09-28");
  assert.strictEqual(form.endDate, "2026-10-02");
  assert.strictEqual(form.free, false);
  assert.strictEqual(form.price, "750,00 €");
  assert.strictEqual(form.category, "formation");
  assert.strictEqual(form.city, "Nancy");
  const nuit = evs.find(e => /NUIT/.test(e.title));
  assert.strictEqual(nuit.online, false);
  assert.strictEqual(nuit.city, "Laxou");
  assert.strictEqual(nuit.place, "Pala V - 5 rue du Mouzon");
  assert.strictEqual(nuit.time, "16h00–21h00");
  assert.strictEqual(nuit.url, "https://www.nancy.cci.fr/evenement/nuit-de-la-creation-2026");
});

test("Centre Prouvé / Parc Expo : congrès gardés, grand public écarté, plages", () => {
  const evs = S.parseProuve(fx("prouve.html"));
  const titles = evs.map(e => e.title);
  assert.ok(titles.includes("2èmes Rencontres du Réseau vélo et marche"));
  assert.ok(titles.includes("Congrès et Salon des Epl"));
  assert.ok(titles.includes("Solutions CSE"));
  assert.ok(!titles.some(t => /Studyrama|Fête des Bières/.test(t)), "grand public écarté : " + titles.join(", "));
  assert.ok(titles.includes("Salon du Brasseur & de la Boisson"), "salon de filière gardé");
  const velo = evs[0];
  assert.strictEqual(velo.date, "2026-09-30");
  assert.strictEqual(velo.endDate, "2026-10-02");
  assert.strictEqual(velo.place, "Centre Prouvé");
  assert.strictEqual(velo.city, "Nancy");
  assert.ok(/rencontres-velo-2026/.test(velo.image));
  const cse = evs.find(e => e.title === "Solutions CSE");
  assert.strictEqual(cse.city, "Vandœuvre-lès-Nancy");
  assert.strictEqual(cse.place, "Parc des Expositions");
  assert.strictEqual(cse.category, "salon");
});

test("Utilitaires : dates FR, horaires, classification, villes", () => {
  assert.strictEqual(S.parseDateFR("mardi 6 octobre 2026"), "2026-10-06");
  assert.strictEqual(S.parseDateFR("22 oct. 2026"), "2026-10-22");
  assert.strictEqual(S.parseDateFR("1er janvier 2027"), "2027-01-01");
  assert.strictEqual(S.parseSchedule("de 9h à 10h30"), "9h00–10h30");
  assert.strictEqual(S.parseSchedule("dès 18h"), "18h00");
  assert.strictEqual(S.classify("Job dating industrie", "", "autre"), "emploi");
  assert.strictEqual(S.classify("Afterwork de rentrée", "", "autre"), "afterwork");
  assert.strictEqual(S.guessCity("7 All. de la Forêt de la Reine, 54500 Vandœuvre-lès-Nancy"), "Vandœuvre-lès-Nancy");
  assert.strictEqual(S.guessCity("Campanile Nancy Gare"), "Nancy");
  assert.strictEqual(S.guessCity("Lac de Madine, Heudicourt-sous-les-Côtes"), "Heudicourt-sous-les-Côtes");
  assert.strictEqual(S.guessCity("Salle des fêtes"), "");
});

console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
