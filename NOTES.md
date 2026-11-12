# Shared notes — Événement Nancy

> Common memory for all capybavibe sessions of this repo.
> Auto-seeded once, **never regenerated**: whatever you write stays.
> Edit via the Edit tool (the per-file lock applies). Keep it concise.

## Structure & conventions
<!-- how things are arranged, naming, patterns to follow -->
- Site statique pur (HTML/CSS/JS, sans build), s'ouvre par double-clic sur index.html ; style.css partagé.
- Vues : GALERIE (défaut, `index.html`+`galerie.js`, mur de posters → lightbox) ; NOUVEAUTÉS `nouveautes.html` (galerie.js) ; CARTES `cartes.html`+`app.js` (masquée, locale seulement, non déployée) ; BASE `base.html/js/css` (outil de dev, URL directe).
- data.js est GÉNÉRÉ (CATEGORIES, GENERATED_AT, EVENTS) : ne jamais l'éditer à la main.
- `events-core.js` (chargé après data.js, avant galerie.js/app.js) est la source unique de normKey, mergeOcc, dedupEvents, TODAY_ISO, notPast, isNew, isMulti, sortEvents, buildSorted, `let sortedEvents`, `let favs`, FAV_KEY, HEART, favLoad/Save, favKey, isFav, toggleFav, termineCeSoir. ⚠️ Ne pas les redéclarer dans galerie.js/app.js (scope global partagé → SyntaxError).

## DRY — where things live
<!-- components, pages, utils, hooks: paths + what they do -->
- Schéma EVENTS : {uuid,title,category,subcats[],date(ISO),endDate,dateText,schedule,place,city,free,reservation,image,url} + `source` (+ `addedAt`/`tags`/`autoPoster` selon le cas). CATEGORIES = {key:{label,emoji}}, 10 clés : activite, musiques-actuelles, jeune-public, spectacle, exposition, musique-classique, festival, conference, citoyennete, sport.
- Chaque source = `node <script>.js` → `events-<source>.json` (même schéma, uuid préfixé) ; `node update-events.js` récupère vdn et fusionne tous les `events-*.json` présents dans data.js.
- VDN (Ville de Nancy) : `https://agenda-integration.grandnancy.eu/api/vdn/events`, ⚠️ sans CORS → snapshot seulement ; fiche `https://www.nancy.fr/agenda/details-agenda?uuid=<uuid>`. POIREL (`poirel.js`, `po-`) = même API, entité `sgp`, redondante (absorbée par la dédup) mais conservée.
- `enrich-details.js` → `details.js` = `EVENT_DETAILS {uuid:{description, image HD, ticketUrl, venue, address, placeUrl, audiences[], placeKeywords, entity, credits, duringDateText, updatedAt}}`, fusionné par uuid en lecture seule.
- DESTINATION NANCY (`destination-nancy.js`, `dn-`, ~173) : options --pages/--max/--concurrency ; catégorie devinée au préfixe du titre (voir Pitfalls DN).
- CURIEUX (`curieux-net.js`, `cx-`) : crawler les 7 rubriques (concert, spectacle, exposition, cinema, stage, action-citoyenne, autre), /agenda/N étant figé ; JSON-LD Event par fiche. ⚠️ Annoncé ISO-8859-1 mais réellement UTF-8 ; ne pas lire `.block-date` (dateText reconstruit depuis l'ISO) ; image JSON-LD sur `curieux.net` nu (mort) → prendre og:image.
- VANDŒUVRE (`vandoeuvre.js`, `vdv-`) : REST WP `/wp-json/wp/v2/evenement` sans dates → lues dans `.article-date` du HTML (.date-from/.date-to/.date-year, année de fin inférée) ; catégorie = 1er `event_theme` (les autres en subcats), lieu = taxo `place`, image = yoast og_image.
- VILLERS (`villers-les-nancy.js`, `vln-`) : TYPO3, JSON dans `data-url-scroll`. ⚠️ Retirer `&cHash=…` avant d'ajouter `tx_cimsearchelastic_displaysearch[page]=N` (sinon 404) ; 12/page, `nb_results` = total. Dates cimNewsStartDate/EndDate, categories[].title → subcats ; image = ORIGIN+`/fileadmin`+identifier ; url = ORIGIN+`/agenda/evenement`+pathSegment.
- ALENTOOR (`alentoor.js`, `al-`, ~350) : 18 communes-ancres (nancy, toul, liverdun, pompey, pont-a-mousson, dieulouard, nomeny, champenoux, einville-au-jard, luneville, saint-nicolas-de-port, dombasle-sur-meurthe, bayon, neuves-maisons, vezelise, haroue, pont-saint-vincent, colombey-les-belles), dédup par id ; --horizon=60 --cities --concurrency=12 ; fiche = JSON-LD Event.
  - ⚠️ Le JSON-LD du <head> est un set « à la une » fixe → lister via les liens /{ville}/agenda/<id>-slug ; ?page=N ne pagine pas → itérer /{ville}/agenda/AAAA-MM-JJ.
  - ⚠️ robots.txt interdit */ajax/, *location=, *date[start]=, *q= → pas d'/api/agenda.
- ICI-C-NANCY (`ici-c-nancy.js`, `icn-`) : ⚠️ anti-bot : GET `/challenge` (redirect:'manual', getSetCookie) pour un cookie à renvoyer, sinon boucle 302. Tout est dans `.ic-list-event` ; l'URL `/agenda/<id>-<ville>-<slug>/AAAA-MM-JJ-HH-MM.html` donne date+heure ; occurrences regroupées (date = prochaine, endDate = dernière).
- ZÉNITH (`zenith-nancy.js`, `zen-<slug>`) : pas de REST (404) → parser /evenements/page/N/ jusqu'au 404, `.card-event`. ⚠️ Dates françaises multi-jours (« 19 & 20 juin 2026 », « avr. ») → parseFrenchDate (1er jour = début, dernier = fin). place="Zénith de Nancy", city="Maxéville", free=false.
- EST RÉPUBLICAIN : ⚠️ tdm-reservation:1 (dir. UE 2019/790) → NE JAMAIS SCRAPER. Portail `/pour-sortir/`.
  - iCal manuel : .ics dans `ics-est-republicain/` → `import-ics.js` (générique --dir/--source/--prefix) → `events-est-republicain.json` (`er-<UID>`). Exporte `resolveCategoryFrom({categories,title,description,location})` (CATEGORIES → titre → titre+description+lieu).
  - Pages « Pour sortir » enregistrées à la main (Page web complète, microdonnées schema.org/Event) → `est-republicain-pages.js` → `events-est-republicain-pages.json` (`erp-AAAA-MM-JJ-slug`) ; titres tronqués complétés par le slug, filtre 30 km GPS, pas d'image (`--vignettes` → images/er/, non déployé). Lancé par refresh-all.sh si des .html sont présents.
- LORRAINEAUCOEUR (`lorraineaucoeur.js`, `lac-<id>`) : XOOPS latin1, tableau complet `/modules/compte/evenements.php` suffisant ; ⚠️ couvre toute la Lorraine → filtré sur NANCY_AREA ; crawl-delay 1 s (le RSS ne donne que 7 events).
- FACEBOOK (`facebook.js`, `fb-<id>`, import manuel, hors refresh-all.sh) :
  - ⚠️ Plus d'iCal FB et l'enregistrement simple ne capture rien : scroller `facebook.com/events/` jusqu'en bas → « Page web COMPLÈTE » dans `ics-facebook/` → `node facebook.js`.
  - Voie principale `extractEventCards` (`<a href="/events/ID/">`), secondaire `extractEventNodes` (JSON data-sjs). ⚠️ parseFrenchDate : juin/juil distingués sur 4 lettres ; titres en fausses polices → NFKC.
  - Filtre 30 km à la source via `communes-30km.json` (331 communes, `node gen-communes.js`) ; commune non identifiée = écartée (`--nofilter`). Détection : adresse → CP → texte de l'affiche → titre → salles connues de data.js (hors source facebook). CITY_CANON trié par longueur DESC ; alias courts seulement si ≥7 car. et uniques ; TEXT_STOP pour communes-mots (serres, romain, viviers…).
  - ⚠️ gen-communes.js : centres pris sur les contours IGN (gregoiredavid/france-geojson), PAS les coordonnées La Poste high54 (fausses de 5-10 km).
  - Affiches : `fb-posters.js` télécharge `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=<id>` avec UA `facebookexternalhit/1.1` (un navigateur reçoit du HTML) → `images/fb/<id>.jpg` (`sips -Z 900 -s formatOptions 68`) ; `--force` pour tout refaire, puis update-events.js.
- L'AUTRE CANAL (`autre-canal.js`, `lcn-<slug>`) : Drupal, /agenda en une requête ; ⚠️ ni année ni tri → année par « prochaine occurrence ». free (`term-gratuit`) et reservation fiables → exclue d'enrich-pricing.js.
- ESSEY (`essey.js`, `essey-<slug>`) : /agenda?page=N (`datetime=`, `.event-item__category`) + flux iCal stratis (lieu, horaire) indexé par URL ; free=true par défaut, affiné par enrich-pricing.
- LAXOU (`laxou.js`, `lx-<slug>`) : `?page_actualites=N`, `data-first-day`, JSON-LD de fiche (startDate « AAAA/MM/JJThh:mm:ss »), titre = <h1>, city vide. ⚠️ Pages 2+ en 404 TROMPEUR avec le vrai contenu → lire le corps quel que soit le statut, arrêter quand une page se répète.
- LUDRES (`ludres.js`, `lud-<slug>`, city="Ludres") : REST `/wp-json/wp/v2/evenements?per_page=100&_embed=1` sans dates → dates de la page liste (3 `.jet-listing-dynamic-field__content` = jour·mois·lieu) croisées par slug, repli slug de base (sans `-?\d+$`) pour les récurrents ; mois abrégés via monthNum() (fr+en). ⚠️ Pas de description dans resolveCategoryFrom (« Population » ⊃ « pop »). À ajouter au workflow GitHub Actions.
- `normalize.js` (à la FUSION par update-events.js et server.js, jamais sur les snapshots) — `cleanupMerged` :
  - (1) `cleanCity` via CITY_CANON (indispensable au géo) ; (1b) `cleanPlace` vide les lieux réduits à un n° de rue, retire « 54xxx Commune » final ; (2) `remapCategory` → 10 clés.
  - (3) `dedupeCrossSource` glouton : `overlap` dates ET `placeCompat` ET (`titleSimilar` OU `sameShortEvent`), sans préfiltre par titre exact ; garde la fiche la plus riche (SRC_RANK), mergeCluster garde l'image de n'importe quelle fiche ; récurrences à dates disjointes séparées.
    - `titleSimilar` = clés égales, ou mots distinctifs (hors TITLE_STOP) de l'un ⊆ l'autre (≥2 mots), ou Jaccard ≥0.6 avec ≥2 mots communs.
    - `sameShortEvent` = titre à UN mot distinctif (≥5 lettres, hors MOTS_GENERIQUES) contenu dans un titre d'une autre source, même jour, ≤4 jours, même commune si connue. sigTokens ignore les entités HTML.
  - (4) `fillPeriod` : dateText « Du … au … » pour multi-jours SEULEMENT si date > aujourd'hui (event en cours : date calée sur aujourd'hui, le scraper pose le vrai dateText).
- TARIF/RÉSA : `enrich-pricing.js` (--source --sample --concurrency=12) → overlay `events-pricing.json` {uuid:{free?,reservation?}}, appliqué après la dédup (n'écrase que le déterminé), puis relancer update-events.js.
  - Signaux : zenith = payant+résa ; alentoor = `isAccessibleForFree` ; curieux = `offers.price` ; autres = texte scopé (sans nav/footer/aside/form/commentaires ; DN = HTML rendu). Un prix € l'emporte sur « gratuit » ; réservation = formulations explicites (pas « billetterie »/« réserver » seuls).
  - ⚠️ RÈGLE USER : free indéterminé ⇒ gratuit.
- FILTRE 30 KM (update-events.js) : haversine depuis Nancy, cache commité `commune-coords.json` (331 communes, repli BAN type=municipality, null = introuvable) ; ville vide/inconnue gardée. Même contrôle bloquant dans compte.js (cityWithin30km).
- NOUVEAUTÉS : `body[data-view="nouveautes"]` (flag NOUVEAUTES), recherche + lightbox ; `renderNouveautes()` = `addedAt >= J-7`, DESC, groupé aujourd'hui / 7 derniers jours ; ruban 🆕 `.poster__new`/`.card__new` (#16a34a) via isNew.
  - ⚠️ `addedAt` vient de `events-firstseen.json` avec CLÉ = uuid (surtout PAS titre|date, qui bouge pour les events en cours). Premier remplissage pré-daté à J-45 ; si la clé change, SUPPRIMER le fichier avant de relancer. Purge des clés absentes depuis >60 j. Fichier commité.
- FAVORIS : localStorage `agenda-nancy:favoris` = {favKey: endDate}, favKey = titre|date|lieu|ville (PAS l'uuid, absent du data.js prod) ; endDate passées purgées au chargement ; partagé entre vues. Cœur `.fav-btn` frère de la tuile dans `.poster-wrap` (pas de bouton imbriqué, stopPropagation), bouton dans la lightbox, filtre state.favOnly.
- FILTRES DATE : Tout · Aujourd'hui · Ce week-end · Cette semaine (7 j) · Ce mois (30 j) · personnalisé (galerie : state.customFrom/customTo, when="custom" ; cartes : popover calendrier). Garder les vues alignées.
- BARRE DE FILTRES (galerie.js buildBar/syncBar, aussi sport.html) : rangée sticky Quand · Sélections · Catégories · Filtres · ♥ · Effacer ; #dateFilters/#selections/#filters dans `.fsheet` (feuille du bas ≤640px), tarif/résa dans #advSheet, #toolbar retiré ; choix unique = fermeture auto ; eyebrow du hero masqué sur mobile.
- server.js (`node server.js`, port 5173, sans dépendance) : `GET /data.js` live (SNAPSHOTS + vdn direct, cache 10 min, cleanupMerged), `/api/events` (JSON+CORS), `/api/refresh` ; `AUTO_REFRESH=1` off par défaut. ⚠️ Ne couvre PAS lorraineaucoeur, autre-canal, essey ni les sources plus récentes.
- PRODUCTION = Cloudflare Workers Static Assets (Netlify mort : ne plus utiliser deploy-site.sh). https://agenda-grandnancy.fr, worker `evenement-nancy`, `wrangler.jsonc` `assets.directory` = `dist`.
  - `deploy-cloudflare.sh` : lit `.cloudflare-token` (gitignored → CLOUDFLARE_API_TOKEN ; l'OAuth `wrangler login` expire et casse le cron), assemble dist/, minifie data.js sans `source`/`uuid` (GARDE `addedAt`), injecte GoatCounter + `?v=`, `wrangler deploy --env=""` ; 3 essais à 60 s (`DEPLOY_TRIES`/`DEPLOY_WAIT`), échec d'auth → code 1.
  - ⚠️ Tout nouveau fichier PUBLIC doit être ajouté à `FILES` ; `.assetsignore` n'est plus utilisé.
- AUTOMATISATION : `refresh-all.sh` (launchd `com.evenement-nancy.refresh`, 05h00, PATH codé en dur) = scrapers → update-events.js → deploy-cloudflare.sh. GitHub Actions `refresh.yml` commite data.js + commune-coords.json et pingue Supabase user_events chaque jour, mais NE déploie PAS (manque CLOUDFLARE_API_TOKEN).
- SEO : `robots index,follow`, robots.txt `Allow: /` + Sitemap, sitemap.xml, OG/Twitter/canonical. `_headers` : X-Robots-Tag sur `/data.js` seulement, X-Frame-Options DENY, CSP frame-ancestors 'none', Referrer-Policy no-referrer, nosniff, Permissions-Policy, `/sw.js` no-cache.
  - 🔑 NE PAS réactiver noindex/Disallow : l'anti-scraping passe par Cloudflare (rate-limit 50/10 s, Bot Fight, blocage bots IA). Limite assumée : data.js extractible, `url` pointe vers les sources.
- STATS : GoatCounter `gabz` (https://gabz.goatcounter.com), injecté seulement dans dist/ ; no-referrer limite la provenance.
- PWA : `pwa.js` (bandeau + entrée #navMenu + feuille iOS), `sw.js` réseau d'abord (rien en cache-first, data.js doit rester frais), CSS `.a2hs*`. ⚠️ Bandeau/menu réservés au mobile/tablette (isMobile()) ; SW enregistré partout.
- ICÔNES : apple-touch 180, icon-192/512 + maskable, favicon-16/32, `site.webmanifest` (dans FILES).

## Pitfalls / gotchas (Destination Nancy)
- Une carte PAR OCCURRENCE (`/occ/N/`, ~3194 cartes pour ~173 events) : retirer /occ/N/ et dédupliquer ; seule la fiche canonique porte le JSON-LD. Paginer jusqu'au 404, même si une page n'apporte rien de nouveau.
- Dates/adresse lues dans le JSON-LD de la fiche ; event en cours → date = aujourd'hui. Serveur lent (~9 s/page) → listing parallélisé.

## Pitfalls / gotchas
<!-- non-obvious things, debt, traps that already cost time -->
- GIT : les commits « chore: maj agenda » viennent de GitHub Actions (agenda-bot) sur origin/main ; le local dérive → `git fetch` avant toute conclusion, pull/rebase régulier. ⚠️ Conflit sur fichiers générés (data.js, events-*.json, events-firstseen.json) : garder la version LOCALE (prod).
- API vdn : `dateList` parfois erronée → trier sur startDate/endDate (dateList = horaire seulement) ; `mediaUrl.crop` souvent absent → `.originale` ; images sans schéma → préfixer https:// ; `referrerpolicy="no-referrer"` sur <img>. Chaque date d'un récurrent = event distinct (+ doublons) → dédup au rendu (dates[], occurrences).
- IMAGES PROD : affiches hébergées (images/fb, affiches-auto) en 429 du rate-limit Cloudflare au défilement → posterImgError() réessaie à 4 s puis 12 s. À FAIRE par l'user : exclure /images/, /affiches-auto/, /affiches-sport/ de la règle.
- PANNES SILENCIEUSES : Alentoor tombé à 0 (anti-robot probable) → alentoor.js logge les causes et patiente 5 s×n sur 429/403 (voir refresh.log). Curieux à 0 le 2026-09-16 (passager probable).
- SPORT : sport-scrape.js ne doit pas perdre un club sur erreur : journée injoignable → `.cache-lsi.json` ; club en échec complet → rencontres reprises d'events-sport.json (report.<club>.reprises). Rattrapage depuis le Mac : `node sport-scrape.js --only=asnl,vnvb && node update-sport.js`.
- SPORT / handball : DEUX équipes « ENT. NANCY / VILLERS » sur ffhandball.fr : N2 poule 4 (`nancy-villers`, Provençal) et N3 poule 6 (`nancy-villers-2`, Marie Marvingt, = « Seniors masculins 1 » de Villers). Ce ne sont pas des doublons ; `HBC LURE VILLERS` (adversaire N3) n'est pas l'entente.
- SPORT / SLUC horaires : FFBB sans horaire pendant des semaines → `scrapeLNB()` : GET `lnb.fr/api/token` (JWT anonyme 15 min) puis POST `api-prod.lnb.fr/match/v3/getCalendar` {`competition_abbrev: "PROA"`, `year`: année de début de saison, `team_external_id: 1868`, `limit: 100`} (sans limit : tronqué à 22). `teams[0]` = reçoit ; `match_time_utc` → `heureParis`. `fusionSluc(ffbb, lnb)` par id `sluc-jN` : FFBB = adversaire, LNB = date/heure ; double échec → reprise des `sluc-jN` précédents. Test `node tests/sport-lnb.test.js`. Registre `LNB` (abbrev, teamExternalId) à revoir si changement de division.
- SPORT / SLUC Europe : `scrapeFIBA()` lit la page « Games » fiba.basketball (Next.js, JSON dans `self.__next_f.push`), garde teamA = SLUC (domicile), ids `sluc-fec-<gameId>`, compétition « FIBA Europe Cup », tour/groupe/match dans `round` ; tours suivants ajoutés à la même page après tirage. Test `node tests/sport-fiba.test.js`. Registre `FIBA` (page, codes, `fiba-europe-cup-26-27`) à changer si compétition/saison change.

## User preferences (do NOT do)
<!-- X forbidden, Y to avoid, explicit constraints -->
- Ne JAMAIS remettre noindex/Disallow : le site doit être référencé sur Google.
- Ne jamais scraper l'Est Républicain (import manuel uniquement).
- Aucune promo PWA sur ordinateur.
- free indéterminé = gratuit.
- Pas de nom de salle ni de commune sur les vignettes de sport.html.

## Onglet Pro (branche feature/evenements-pro, worktree dev-pro/)
- Chaîne : pro-sources.js (registre + rayon 5 km) → pro-scrape.js → events-pro.json → update-pro.js → data-pro.js + affiches-pro/. pro.html = sport.html adapté (data-view="pro", data-kind="pro"), seul JS spécifique : annuaire RESEAUX. Doc README-PRO.md.
- Parsers = fonctions pures testées hors ligne (`node tests/pro-scrape.test.js`, fixtures HTML réels) ; si une maquette change, refaire le fixture AVANT de corriger le parser.
- galerie.js lit des champs optionnels (membersOnly, organizer, price, description, network) et fusionne les user_events du `kind` de `<body data-kind>` (défaut 'event').
- `applyAutoPosters(events, { dir, themes, labels, labelOf })` : chaque dossier fait son ménage, jamais de dossier partagé.
- compte.html : sélecteur Type (event / pro), sport toujours absent. Ré-exécuter schema.sql §7 et redéployer l'Edge Function moderate-event.
- Pas de réseau depuis les shells Claude (conteneur, VM du pont) : `node pro-scrape.js` uniquement depuis le Terminal du Mac.
- Accès (pro-gate.js) : `anyAccount: true` = tout organisateur connecté voit l'onglet, le sélecteur Type et pro.html ; non-connectés → #pro-lock (« réservé aux organisateurs », lien compte.html). `open: true` = public (remettre alors pro.html dans le sitemap). Organisation demandée à l'inscription → `user_metadata.organization`, pré-remplit « Organisateur / réseau ».

## In-progress decisions
<!-- recent architecture choices so other sessions don't undo them -->
- NAV : lien 🏅 Sport retiré (sport.html par URL). `.nav-account` en haut à droite (👤 ordi, ☰ ≤640px), menu S'inscrire / Se connecter + Publier (+ Déconnexion, #logout conservé). Onglets Galerie/Nouveautés = `.hero__views` toujours visible ; `style.css?v=navN`. ⚠️ Le gate prod de deploy-cloudflare.sh matche `class="(?:view-switch|nav-menu__link)[^"]*"` ; menu vidé → `.nav-account--navonly`.
- COMPTES ORGANISATEURS (compte.html/compte.js, Supabase, `compte.css?v=N`) : lieu autocomplété via BAN ; sport en pause (option masquée, code intact) ; dates passées interdites. Anti-doublon bloquant : JS normTitle + chevauchement vs EVENTS et user_events, et trigger SQL `reject_duplicate_user_event_trg` (schema.sql §6, norm_title(), end_date >= date) ; schema.sql idempotent, à ré-exécuter sur base existante.
- VIGNETTES GALERIE : pastille avec jour de semaine (`.wd`, date locale, jours simples), commune seule sous le titre (`.poster__city`), salle dans la lightbox seulement.
- AFFICHES GÉNÉRÉES (choisies au lieu des images Est Républicain) : `affiches-auto.js` → SVG `affiches-auto/<slug>-<hash>.svg` pour les events sans image, `autoPoster:true`, clé uuid|date ; appelé par update-events.js, `node affiches-auto.js` patche le data.js courant ; `.poster--auto` masque le bandeau titre.
- ÉTIQUETTES IA : `classer-evenements.js` (claude-haiku-4-5, clé `.anthropic-key` gitignored, ignoré sans clé) → `tags` ∈ incontournable/atypique/fun/famille/etudiant, 2 max, NO_TAG_RE. Cache `events-tags.json` clé = titre normalisé|commune ; incrémenter PROMPT_VERSION si la consigne change. « famille » = ENFANTS uniquement (gardeFamille(), aussi à la lecture du cache). UI `#selections` (buildSelections, state.sel) ; sélection cliquée avec date « Tout » → bascule sur « Cette semaine ».
- MASQUAGE APRÈS 20H30 (termineCeSoir) : event d'un seul jour d'aujourd'hui retiré si fin passée, ou début seul connu < 20h, ou sans heure hors musiques/spectacle/festival. Multi-jours jamais masqués ; sport.js garde son propre notPast.
- SÉRIES : regrouperSeries() (galerie.js) fusionne les fiches de même serieUuid en une affiche « 17 → 19 SEPT », sauf sur Aujourd'hui/Ce week-end ; plage = jours passant les filtres ; placée chronologiquement, pas dans « Sur plusieurs jours ».

## Liens courts traqués (2026-09-30)
- `_redirects` (copié dans dist/) : `agenda-grandnancy.fr/fb` → `/?ref=fb-amandine` (groupe FB d'Amandine), visible dans GoatCounter > Referrers. Nouveau canal : ligne `/xx /?ref=nom-du-canal 302`.
- deploy-cloudflare.sh injecte un script : URL avec ?ref=xxx → événement GoatCounter « lien-xxx » en plus de la visite /, ligne à part dans les pages (ex. lien-fb-amandine).
