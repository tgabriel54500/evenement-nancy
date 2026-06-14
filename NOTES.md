# Shared notes — Événement Nancy

> Common memory for all capybavibe sessions of this repo.
> Auto-seeded once, **never regenerated**: whatever you write stays.
> Edit via the Edit tool (the per-file lock applies). Keep it concise.

## Structure & conventions
<!-- how things are arranged, naming, patterns to follow -->
- Site statique pur (HTML/CSS/JS, aucun build). S'ouvre par double-clic sur index.html.
- Vue "Cartes": index.html + app.js + style.css. Vue "Base de données": base.html/base.js/base.css (session 854c84c8).
- data.js est GÉNÉRÉ (ne pas éditer à la main) — il définit CATEGORIES, GENERATED_AT, EVENTS.

## DRY — where things live
<!-- components, pages, utils, hooks: paths + what they do -->
- Données réelles: API publique agenda Grand Nancy `https://agenda-integration.grandnancy.eu/api/vdn/events`
  (entité "vdn" = Ville de Nancy). ⚠️ PAS de CORS → injoignable depuis le navigateur, snapshot only.
- Régénérer les données: `node update-events.js` (récupère l'API, mappe, écrit data.js).
- Détail d'un event: `https://www.nancy.fr/agenda/details-agenda?uuid=<uuid>`.
- Schéma EVENTS (par carte): {uuid,title,category,subcats[],date(ISO),endDate,dateText,schedule,place,city,free,reservation,image,url}.
  CATEGORIES = {key:{label,emoji}}. 9 catégories réelles (activite, musiques-actuelles, jeune-public, spectacle,
  exposition, musique-classique, festival, conference, citoyennete).
- ENRICHISSEMENT (session 854c84c8): `enrich-details.js` scrape les fiches détail + extras API et écrit
  `details.js` → global `EVENT_DETAILS = {uuid:{description, image(HD), ticketUrl, venue, address, placeUrl,
  audiences[], placeKeywords, entity, credits, duringDateText, updatedAt}}`. 397 descriptions, 137 billetteries,
  340 adresses. À fusionner par uuid en LECTURE SEULE (ne modifie pas data.js). Régénérer: `node enrich-details.js`.
  → Dispo aussi pour la vue Cartes si besoin de description/billetterie/adresse (inclure <script src="details.js">).
- 2e SOURCE — Destination Nancy / office de tourisme (session 7895fa7d): `destination-nancy.js` crawle l'agenda
  touristique du SIT (https://www.destination-nancy.com/.../agenda-et-grands-evenements/) → `events-destination-nancy.json`
  (173 événements uniques métropole, schéma identique + champ `source:"destination-nancy"`, uuid préfixés `dn-`).
  Régénérer: `node destination-nancy.js` (options --pages=N --max=N --concurrency=N). update-events.js fusionne
  ce JSON s'il est présent (patch session 95838c9a). Catégorie devinée au préfixe du titre ("Exposition –"…).
- 3e SOURCE — Nancy Curieux (agenda culturel/associatif): `curieux-net.js` → `events-curieux-net.json`
  (93 events, schéma identique + `source:"curieux-net"`, uuid préfixés `cx-`). La home n'expose que ~21 events et
  /agenda/N est un bloc figé (PAS de pagination) → on crawle les 7 RUBRIQUES (concert, spectacle, exposition, cinema,
  stage, action-citoyenne, autre) qui partitionnent le catalogue sans recouvrement; chaque fiche /agenda/evenement/<slug>
  porte un JSON-LD Event (dates fiables par slug). ⚠️ Pages déclarent ISO-8859-1 mais octets = UTF-8 → décoder en utf8.
  ⚠️ NE PAS lire le .block-date des fiches (pollué par les events liés) → dateText reconstruit depuis les dates ISO.
  ⚠️ image JSON-LD = host nu `curieux.net` MORT → préférer og:image (www.curieux.net, 200). Régénérer: `node curieux-net.js`.
  update-events.js et server.js fusionnent ce JSON s'il est présent (3 sources → 663 events au total).
- 4e SOURCE — Ville de Vandœuvre-lès-Nancy (session c15b829b): `vandoeuvre.js` lit l'API REST WordPress
  (`/wp-json/wp/v2/evenement`, 131 events) → `events-vandoeuvre.json` (schéma identique + `source:"vandoeuvre"`,
  uuid préfixés `vdv-`, 39 à venir). ⚠️ L'API ne donne PAS les dates: lues dans le HTML de chaque fiche
  (bloc `.article-date`, .date-from/.date-to/.date-year ; année de fin inférée si absente). Catégorie = thème WP
  (`event_theme`, 1er = catégorie, reste en subcats) → NOUVELLES clés culture/famille/jeunesse/sport/nature/sante/
  seniors/social/mobilite/economie (Ville→citoyennete). Lieu via taxonomie `place`, image via yoast og_image.
  Régénérer: `node vandoeuvre.js` (--max=N --concurrency=N). update-events.js fusionne ce JSON s'il existe.
- 5e SOURCE — Ville de Villers-lès-Nancy (agenda municipal TYPO3): `villers-les-nancy.js` → `events-villers-les-nancy.json`
  (27 events, schéma identique + `source:"villers-les-nancy"`, uuid préfixés `vln-`). Site TYPO3+cim_search_elastic:
  /agenda paginé en infinite-scroll. On lit l'attribut `data-url-scroll` (endpoint JSON Elasticsearch), on RETIRE le
  `&cHash=…` (sinon ajouter `tx_cimsearchelastic_displaysearch[page]=N` → 404, le cHash ne couvre pas ce param) puis on
  pagine page=0,1,2… (12/page, `nb_results` donne le total). Champs: cimNewsStartDate/EndDate (ISO), `schedule` ou
  cimNewsScheduleDates[].schedule (horaire), categories[].title = THÈMES éditoriaux (Culture/Sport/Solidarité…) → mis
  en subcats; catégorie devinée au titre puis repli sur le thème. Image = ORIGIN+`/fileadmin`+identifier FAL; url =
  ORIGIN+`/agenda/evenement`+pathSegment. Régénérer: `node villers-les-nancy.js`. update-events.js fusionne ce JSON s'il existe.
- 6e SOURCE — Alentoor (alentoor.fr): `alentoor.js` → `events-alentoor.json` (~350 events sur ~100 communes, schéma
  identique + `source:"alentoor"`, uuid préfixés `al-`). Couvre Nancy + métropole + ANNEAU 20–30 km : on crawle 18
  COMMUNES-ANCRES réparties dans toutes les directions (nancy, toul, liverdun, pompey, pont-a-mousson, dieulouard,
  nomeny, champenoux, einville-au-jard, luneville, saint-nicolas-de-port, dombasle-sur-meurthe, bayon, neuves-maisons,
  vezelise, haroue, pont-saint-vincent, colombey-les-belles) car chaque page-commune liste son RAYON (dédup par id).
  update-events.js le fusionne s'il est présent. Régénérer: `node alentoor.js` (--horizon=60 --cities=… --concurrency=12).
  ⚠️ Pitfalls:
  (1) le JSON-LD du <head> est un set "à la une" FIXE (~33, identique quelle que soit page/date) → NE PAS l'utiliser
  pour lister; la vraie liste = liens de cartes /{ville}/agenda/<id>-slug dans le corps. (2) ?page=N ne pagine pas
  (rendu JS); seul le chemin /{ville}/agenda/AAAA-MM-JJ filtre côté serveur → on itère sur les DATES. (3) L'API
  /api/agenda (AJAX/recherche) donnerait plus MAIS robots.txt INTERDIT */ajax/ et *location=/*date[start]=/*q= →
  on s'en tient aux pages publiques (conforme). Détail event = JSON-LD Event (date+horaire, adresse, offers/gratuité).
- 7e SOURCE — ICI-C-NANCY.FR (média local, Joomla + iCagenda): `ici-c-nancy.js` → `events-ici-c-nancy.json`
  (~7 events « à venir », schéma identique + `source:"ici-c-nancy"`, uuid préfixés `icn-`). ⚠️ CHALLENGE anti-bot
  nginx: 1 GET sur `/challenge` pose un cookie (nom aléatoire) SANS lequel tout boucle en 302 → on le récupère
  (redirect:'manual', getSetCookie) et on le renvoie sur /agenda.html. TOUT est server-side dans la liste (aucune
  fiche détail à lire): cartes `.ic-list-event`, et l'URL `/agenda/<id>-<ville>-<slug>/AAAA-MM-JJ-HH-MM.html` porte
  la DATE+HEURE de l'occurrence. Catégorie iCagenda (Humour/Salon/Musique…) mappée vers les clés existantes. Plusieurs
  occurrences d'un même id regroupées (date=prochaine, endDate=dernière). Régénérer: `node ici-c-nancy.js`.
- 8e SOURCE — Zénith de Nancy (grande salle, concerts/spectacles): `zenith-nancy.js` → `events-zenith-nancy.json`
  (~46 events, schéma identique + `source:"zenith-nancy"`, uuid préfixés `zen-<slug>`). WordPress mais le CPT
  « evenement » n'est PAS exposé en REST (/wp-json/wp/v2/evenement → 404) → on parse le listing server-side
  (/evenements/ puis /evenements/page/N/, 11 cartes/page, jusqu'au 404). Tout est dans la carte `.card-event`
  (overlay-link=url, `.card-event__type`=catégorie, `__title`, `__date`, `__img`) → AUCUNE fiche détail à lire.
  ⚠️ Date en français long, parfois multi-jours ("19 & 20 juin 2026", "12, 13 & 14 février 2027", mois abrégé "avr.")
  → parseFrenchDate prend 1er jour=start, dernier=end. Type→clé: Concert/rap/ciné→musiques-actuelles, humour/one-(wo)man/
  comédie/ballet/danse/spectacle→spectacle, sport/mma→sport, festival→festival. place="Zénith de Nancy", city="Maxéville",
  free=false, reservation si CTA "Réserver". Régénérer: `node zenith-nancy.js`. update-events.js fusionne ce JSON s'il existe.
- 9e SOURCE — Est Républicain "Pour sortir" via IMPORT MANUEL iCal: `import-ics.js` → `events-est-republicain.json`
  (schéma identique + `source:"est-republicain"`, uuid `er-<UID>`). ⚠️ Le portail déclare tdm-reservation:1 (opposition
  formelle à la fouille de données, dir. UE 2019/790 art.4) → on NE le SCRAPE PAS. L'utilisateur exporte les fiches à la
  main (bouton iCal sur chaque event) et dépose les .ics dans `ics-est-republicain/`; import-ics.js les convertit (parse
  RFC5545: VEVENT, DTSTART/DTEND, SUMMARY, LOCATION, URL, CATEGORIES; catégorie devinée au titre). update-events.js
  fusionne ce JSON s'il existe. import-ics.js est générique (--dir/--source/--prefix, ou fichiers en args).
  ⚠️ NB sur le portail: l'ANCIENNE URL géo /pour-sortir/Loisir/Lorraine/.../Nancy est MORTE (404); le portail vit
  désormais à /pour-sortir/ (slash final) organisé par CATÉGORIE; fiches = /pour-sortir/loisirs/<Cat>/<SousCat>/<Région>/
  <Dept>/<Ville>/AAAA/MM/JJ/<slug>. Pas de JSON-LD. Mêmes events publics (non exclusifs) que Alentoor/Destination Nancy.
- NETTOYAGE COMMUN — `normalize.js` (module partagé par update-events.js ET server.js, appliqué à la FUSION, jamais
  sur les snapshots events-*.json). `cleanupMerged(events)` enchaîne 3 passes: (1) `cleanCity` normalise les communes
  (casse/accents/tirets via table CITY_CANON Grand Nancy + anneau; ex "NANCY"→"Nancy", "VANDOEUVRE LES NANCY"→
  "Vandœuvre-lès-Nancy") — INDISPENSABLE pour tout filtre/regroupement géo; (2) `remapCategory` replie les thèmes
  parasites (culture/famille/sport/nature/sante/social/…→canonique) → on RESTE à 10 catégories canoniques; (3)
  `dedupeCrossSource` fusionne le même event listé par ≥2 sources (titre normalisé sans préfixe de type "Exposition –"
  + CHEVAUCHEMENT de dates + lieu compatible), garde la fiche la plus riche (priorité source SRC_RANK). Effet mesuré:
  1132→989 events (143 doublons fusionnés), 16→10 catégories. ⚠️ Les occurrences récurrentes à dates DISJOINTES restent
  séparées (ce n'est PAS un doublon). (4) `fillPeriod` (session c15b829b): renseigne `dateText` des events MULTI-JOURS
  qui en manquent → "Du J1 [mois] au J2 mois année", pour que la carte affiche la PÉRIODE et pas un jour unique
  (dateLabel front privilégie dateText). ⚠️ GARDE: seulement si `date > aujourd'hui` (futur), car `date` est calé sur
  aujourd'hui au tri pour les events EN COURS (vrai début perdu ici) → pour ceux-là on s'appuie sur le dateText posé
  par le scraper à la collecte (vandoeuvre.js/ici-c-nancy.js le font avec le vrai début).
- TEMPS RÉEL — `server.js` (zéro dépendance, `node server.js`, port 5173): proxy même-origine qui contourne le CORS.
  `GET /data.js` régénéré LIVE → le front existant devient temps réel SANS modifier index.html/app.js (data.js disque =
  repli hors-ligne). Architecture: tableau `SNAPSHOTS` listant les 7 sources « lourdes » (DN, Curieux, Vandœuvre,
  Villers, Alentoor, ICI-C-Nancy, Zénith) servies depuis leur snapshot events-*.json + Ville de Nancy en direct (fetch,
  cache 10min) par-dessus; le tout passé à `cleanupMerged` (normalize.js). `GET /api/events` = JSON+CORS (~917 events).
  `GET /api/refresh` = recrawl des 7 sources en fond. `AUTO_REFRESH=1` (ex-`DN_AUTO_REFRESH`) = recrawl périodique
  échelonné toutes les SNAP_TTL (6h). ⚠️ Par défaut AUTO_REFRESH OFF: c'est le cron quotidien (refresh-all.sh +
  launchd, cf. plus bas) qui rafraîchit les snapshots sur disque — pas besoin de double-crawler dans le serveur.

## Pitfalls / gotchas (Destination Nancy)
- L'agenda DN liste une CARTE PAR OCCURRENCE: un récurrent apparaît avec suffixe `/occ/N/` sur des dizaines de pages
  (267 pages = ~3194 cartes pour ~173 events uniques). Seule la fiche canonique (sans /occ/) porte le JSON-LD Event.
  → destination-nancy.js normalise l'URL (retire /occ/N/) et déduplique. NE PAS couper la pagination sur une page
  "sans nouveauté": des events uniques inédits apparaissent jusqu'au bout (triés par date). On va jusqu'au 404.
- Dates DN viennent du JSON-LD <script application/ld+json> de chaque fiche (startDate/endDate/address). Pour un event
  DÉJÀ en cours, `date`=aujourd'hui (cale le tri). Serveur DN lent (~9s/page) → listing parallélisé par fenêtres.

## Pitfalls / gotchas
<!-- non-obvious things, debt, traps that already cost time -->
- L'API renvoie 397 events bruts; `dateList` contient parfois une date ERRONÉE (ex: Gala startDate 2026-06-13
  mais dateList 2026-03-13). → On trie sur startDate/endDate, pas sur dateList. dateList ne sert qu'à l'horaire.
- Tous les events ont une image mais seulement ~147/397 ont `mediaUrl.crop` → fallback sur `mediaUrl.originale`.
- Images servies sans schéma ("agenda-static.grandnancy.eu/...") → préfixer "https://". referrerpolicy="no-referrer" sur <img>.
- L'API liste chaque date d'un récurrent comme un event distinct + ~3 doublons exacts. app.js dédoublonne au RENDU
  (groupEvents par titre): 397 → 381 fiches, récurrents = 1 carte avec champ `dates[]` + `occurrences`. Non dédupliqué à la source.
- Vue Cartes: filtre par date (#dateFilters, state.when) = chevauchement [date,endDate] ou une des `dates[]` dans la plage.

## User preferences (do NOT do)
<!-- X forbidden, Y to avoid, explicit constraints -->

## In-progress decisions
<!-- recent architecture choices so other sessions don't undo them -->
