#!/usr/bin/env node
/**
 * Tests hors ligne de fiche-extract.js (lecture des pages événement des
 * sources) et des parties pures de gen-pages.js. Les extraits HTML reprennent
 * la structure réelle relevée le 2026-10-18 sur chaque site, réduite à
 * l'essentiel.
 *
 *   node tests/fiche-extract.test.js
 */
const assert = require("assert");
const { extractFiche } = require("../fiche-extract");

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const page = (body, head = "") => `<!doctype html><html lang="fr"><head><title>Événement</title>${head}</head><body>${body}</body></html>`;
console.log("fiche-extract.js");

test("Ville de Nancy : description en deux blocs, tarifs, public, adresse, billetterie", () => {
  const html = page(`
    <div class="row"><div class="description-text"><div>Après deux Olympia complets, Zamdane repart en tournée.</div></div>
      <div id="more-description" class="row mt-2 description-text"><div>Porté par le succès de SOLSAD, l'artiste ouvre un nouveau chapitre.</div></div></div>
    <p class="mb-1"><i class="bi bi-tag"></i>Cat 1  33,00€ | Cat 2  28,00€<meta itemprop="price" content="Cat 1  33,00€ | Cat 2  28,00€"></p>
    <p class="mb-1"><i class="bi bi-people me-2"></i>Tout public</p>
    <a href="https://billetterie.lautrecanalnancy.fr/">Voir
        la fiche des informations tarifaires</a>
    <div id="place"><h3>Lieu</h3><a class="place-link" href="#">L'Autre Canal</a><p>45 boulevard d'Austrasie</p><p>54000 Nancy</p><a href="#">Voir
        la fiche du lieu</a></div>`);
  const f = extractFiche(html, "https://www.nancy.fr/agenda/details-agenda?uuid=x");
  assert.match(f.description, /Olympia[\s\S]*SOLSAD/);
  assert.ok(f.description.includes("\n\n"), "deux paragraphes");
  assert.deepStrictEqual(f.priceLines, ["Cat 1 33,00€", "Cat 2 28,00€"]);
  assert.strictEqual(f.audience, "Tout public");
  assert.strictEqual(f.venue, "L'Autre Canal");
  assert.strictEqual(f.street, "45 boulevard d'Austrasie");
  assert.strictEqual(f.postalCode, "54000");
  assert.strictEqual(f.tickets[0].url, "https://billetterie.lautrecanalnancy.fr/");
});

test("JSON-LD : un prix à 0 sans isAccessibleForFree n'est pas « gratuit » (Zénith)", () => {
  const ld = { "@context": "https://schema.org", "@type": "Event", name: "Patrick Bruel", description: "Court.",
    offers: { "@type": "Offer", url: "https://billetterie.zenith-de-nancy.com/fr/product/4310", price: "0", priceCurrency: "EUR" },
    location: { "@type": "Place", name: "ZÉNITH DU GRAND NANCY", address: { "@type": "PostalAddress", streetAddress: "Rue du Zénith", postalCode: "54320", addressLocality: "MAXEVILLE" } } };
  const html = page(`<div class="about-us__container__content"><p>L'album ALORS REGARDE vient de fêter ses 35 ans. Patrick Bruel nous donne rendez-vous.</p></div>`,
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  const f = extractFiche(html, "https://www.zenith-de-nancy.com/evenement/patrick-bruel/");
  assert.ok(!f.free, "pas gratuit");
  assert.deepStrictEqual(f.priceLines, []);
  assert.strictEqual(f.tickets[0].url, "https://billetterie.zenith-de-nancy.com/fr/product/4310");
  assert.strictEqual(f.venue, "ZÉNITH DU GRAND NANCY");
  assert.match(f.description, /ALORS REGARDE/);
});

test("Destination Nancy : tarifs séparés des horaires, bouton Site internet", () => {
  const html = page(`
    <div id="a-propos"><div class="wp-block-wp-etourisme-v3-text"><p>Orchestre de l'Opéra<br/>Alto : Lise Berthaud<br/><br/>L'Italie rêvée irrigue toute cette soirée.</p></div></div>
    <table><tr class="wpet-table__line"><th>Jeudi</th><td>Ouvert de 20h à 21h55</td></tr></table>
    <table><tr class="wpet-table__line"><th>Tarifs de base : Adulte<br></th><td>38&nbsp;&euro;</td><td>–</td></tr>
      <tr class="wpet-table__line"><th>Tarifs de base : Enfant</th><td>5 €</td></tr></table>
    <a href="https://opera-nancy.fr/la-saison/voyage-en-italie" title="Site internet">Site internet</a>`);
  const f = extractFiche(html, "https://www.destination-nancy.com/fete-manifestation/opera/");
  assert.deepStrictEqual(f.priceLines, ["Adulte : 38 €", "Enfant : 5 €"]);
  assert.deepStrictEqual(f.hoursLines, ["Jeudi : de 20h à 21h55"]);
  assert.match(f.description, /^Orchestre de l'Opéra\nAlto : Lise Berthaud\n\nL'Italie/);
  assert.deepStrictEqual(f.tickets[0], { label: "Site officiel", url: "https://opera-nancy.fr/la-saison/voyage-en-italie" });
});

test("phrases collées par la source séparées (Curieux), liens PDF/CGV écartés", () => {
  const html = page(`<main><div class="block-description">Un spectacle drôle et réconfortant sur ses névroses.Après 15 ans de triomphe au théâtre, voici son premier seul en scène.</div>
    <a href="https://billetterie.example.fr/cgv.pdf">Billetterie</a><a href="https://www.fnac.com/x">Réserver ma place</a></main>`);
  const f = extractFiche(html, "https://nancy.curieux.net/agenda/evenement/x");
  assert.match(f.description, /névroses\.\nAprès 15 ans/);
  assert.deepStrictEqual(f.tickets.map((t) => t.url), ["https://www.fnac.com/x"]);
});

test("page « introuvable » servie en 200 (Ludres) → notFound", () => {
  const f = extractFiche(page(`<h1>404</h1><p>Page introuvable</p>`).replace("<title>Événement</title>", "<title>Page non trouvée - Ludres</title>"),
    "https://www.ludres.com/liste-evenements/x/");
  assert.strictEqual(f.notFound, true);
});

test("Vandœuvre : l'adresse en fin de texte part dans le champ adresse", () => {
  const html = page(`<div class="article-content"><p>Mise en lumière des entrepreneurs, avec dégustations et animations.</p><p>Parc Richard Pouille<br>Parc Richard Pouille, Rue d'Amsterdam, Vandœuvre-lès-Nancy, France</p></div>`);
  const f = extractFiche(html, "https://www.vandoeuvre.fr/evenement/marche/");
  assert.ok(!/France/.test(f.description), f.description);
  assert.strictEqual(f.street, "Parc Richard Pouille, Rue d'Amsterdam, Vandœuvre-lès-Nancy");
});

// ── gen-pages.js : adresse stable et rendu du texte ─────────────────────────
const { pageSlug, descHtml } = require("../gen-pages");
console.log("gen-pages.js");

test("adresse de page stable et lisible", () => {
  const ev = { title: "Opéra – Voyage en Italie !", date: "2027-06-03", endDate: "2027-06-03", uuid: "abc" };
  const s1 = pageSlug(ev), s2 = pageSlug({ ...ev });
  assert.strictEqual(s1, s2);
  assert.match(s1, /^opera-voyage-en-italie-2027-06-03-[0-9a-f]{5}$/);
  // Événement en cours : `date` est calée sur aujourd'hui chaque jour, l'adresse ne doit pas bouger.
  const long = { title: "Expo", date: "2026-10-18", endDate: "2026-12-31", uuid: "x" };
  assert.strictEqual(pageSlug(long), pageSlug({ ...long, date: "2026-10-19" }));
});

test("description : paragraphes, retours à la ligne, liens et e-mails, HTML neutralisé", () => {
  const h = descHtml("Ligne 1\nLigne 2\n\nInfos : billetterie@theatre.fr ou https://www.theatre.fr/agenda.\n\n<script>x</script>");
  assert.match(h, /<p>Ligne 1<br>Ligne 2<\/p>/);
  assert.match(h, /href="mailto:billetterie@theatre\.fr"/);
  assert.match(h, /href="https:\/\/www\.theatre\.fr\/agenda"/);
  assert.ok(!h.includes("<script>"));
});

console.log(process.exitCode ? "ÉCHEC" : `OK (${n} tests)`);
