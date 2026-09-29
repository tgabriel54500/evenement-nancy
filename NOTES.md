# Shared notes — Événement Nancy

> Common memory for all capybavibe sessions of this repo.
> Auto-seeded once, **never regenerated**: whatever you write stays.
> Edit via the Edit tool (the per-file lock applies). Keep it concise.

## Structure & conventions
<!-- how things are arranged, naming, patterns to follow -->
- Site statique pur (HTML/CSS/JS, aucun build), s'ouvre par double-clic sur index.html ; style.css partagé.
- VUES : GALERIE (défaut) = `index.html` + `galerie.js` (mur de posters, clic → lightbox) ; NOUVEAUTÉS = `nouveautes.html` (réutilise galerie.js) ; CARTES = `cartes.html` + `app.js`, MASQUÉE (hors nav, NON déployée, locale seulement) ; BASE DE DONNÉES = `base.html`/`base.js`/`base.css`, hors nav prod (URL directe, outil de dev). galerie.html SUPPRIMÉ.
- data.js est GÉNÉRÉ (ne pas l'éditer à la main) : il définit CATEGORIES, GENERATED_AT, EVENTS.
- CŒUR COMMUN `events-core.js` (chargé APRÈS data.js, AVANT galerie.js/app.js), source de vérité unique : normKey, mergeOcc, dedupEvents, TODAY_ISO, notPast, isNew, isMulti, sortEvents, buildSorted, `let sortedEvents`, `let favs`, FAV_KEY, HEART, favLoad/Save, favKey, isFav, toggleFav, termineCeSoir. ⚠️ galerie.js/app.js ne doivent PAS redéclarer ces symboles (scope global partagé → SyntaxError).

## DRY — where things live
<!-- components, pages, utils, hooks: paths + what they do -->
- SOURCE 1 Ville de Nancy : API `https://agenda-integration.grandnancy.eu/api/vdn/events` (entité vdn). ⚠️ PAS de CORS → snapshot seulement. `node update-events.js` récupère l'API, fusionne tous les `events-*.json` présents et écrit data.js. Fiche : `https://www.nancy.fr/agenda/details-agenda?uuid=<uuid>`.
- Schéma EVENTS : {uuid,title,category,subcats[],date(ISO),endDate,dateText,schedule,place,city,free,reservation,image,url} + `source` + `addedAt`/`tags`/`autoPoster` selon le cas. CATEGORIES = {key:{label,emoji}}, 10 clés canoniques (activite, musiques-actuelles, jeune-public, spectacle, exposition, musique-classique, festival, conference, citoyennete, sport).
- Chaque source a un script `node <script>.js` qui écrit `events-<source>.json` (schéma identique + `source`, uuid préfixé), fusionné par update-events.js s'il est présent.
- ENRICHISSEMENT : `enrich-details.js` → `details.js` = `EVENT_DETAILS {uuid:{description, image HD, ticketUrl, venue, address, placeUrl, audiences[], placeKeywords, entity, credits, duringDateText, updatedAt}}`, à fusionner par uuid en LECTURE SEULE.
- DESTINATION NANCY (`destination-nancy.js`, `dn-`, ~173 events) : agenda du SIT, options --pages/--max/--concurrency ; catégorie devinée au préfixe du titre (voir Pitfalls DN).
- CURIEUX (`curieux-net.js`, `cx-`, ~93) : on crawle les 7 RUBRIQUES (concert, spectacle, exposition, cinema, stage, action-citoyenne, autre), car /agenda/N est figé et n'a pas de pagination. JSON-LD Event par fiche. ⚠️ Les pages déclarent ISO-8859-1 mais sont en UTF-8. ⚠️ Ne pas lire `.block-date` (pollué) : dateText reconstruit depuis l'ISO. ⚠️ L'image JSON-LD pointe sur le host nu `curieux.net`, MORT → prendre og:image.
- VANDŒUVRE (`vandoeuvre.js`, `vdv-`) : REST WP `/wp-json/wp/v2/evenement`. ⚠️ Pas de dates dans l'API : lues dans le HTML `.article-date` (.date-from/.date-to/.date-year, année de fin inférée). Catégorie = `event_theme` (1er thème, le reste en subcats), lieu = taxo `place`, image = yoast og_image.
- VILLERS (`villers-les-nancy.js`, `vln-`) : TYPO3, endpoint JSON dans `data-url-scroll`. ⚠️ RETIRER `&cHash=…` avant d'ajouter `tx_cimsearchelastic_displaysearch[page]=N` (sinon 404) ; 12 par page, `nb_results` = total. Champs cimNewsStartDate/EndDate et schedule ; categories[].title = thèmes → subcats. Image = ORIGIN+`/fileadmin`+identifier ; url = ORIGIN+`/agenda/evenement`+pathSegment.
- ALENTOOR (`alentoor.js`, `al-`, ~350) : 18 COMMUNES-ANCRES (nancy, toul, liverdun, pompey, pont-a-mousson, dieulouard, nomeny, champenoux, einville-au-jard, luneville, saint-nicolas-de-port, dombasle-sur-meurthe, bayon, neuves-maisons, vezelise, haroue, pont-saint-vincent, colombey-les-belles), dédup par id ; options --horizon=60 --cities --concurrency=12.
  - ⚠️ Le JSON-LD du <head> est un set « à la une » FIXE : lister via les liens /{ville}/agenda/<id>-slug.
  - ⚠️ ?page=N ne pagine pas : itérer sur /{ville}/agenda/AAAA-MM-JJ.
  - ⚠️ robots.txt INTERDIT */ajax/, *location=, *date[start]=, *q= → pas d'/api/agenda.
  - Fiche = JSON-LD Event.
- ICI-C-NANCY (`ici-c-nancy.js`, `icn-`) : ⚠️ challenge anti-bot : GET `/challenge` (redirect:'manual', getSetCookie) pose un cookie à renvoyer, sinon boucle 302. Tout est dans la liste `.ic-list-event` ; l'URL `/agenda/<id>-<ville>-<slug>/AAAA-MM-JJ-HH-MM.html` donne date+heure. Occurrences regroupées (date = prochaine, endDate = dernière).
- ZÉNITH (`zenith-nancy.js`, `zen-<slug>`, ~46) : CPT non exposé en REST (404) → parser /evenements/page/N/ jusqu'au 404 ; tout est dans `.card-event`. ⚠️ Dates en français multi-jours (« 19 & 20 juin 2026 », « avr. ») → parseFrenchDate (1er jour = début, dernier = fin). place="Zénith de Nancy", city="Maxéville", free=false.
- EST RÉPUBLICAIN : ⚠️ tdm-reservation:1 (opposition à la fouille, dir. UE 2019/790) → NE JAMAIS SCRAPER.
  - Import manuel iCal : .ics dans `ics-est-republicain/` → `import-ics.js` (générique : --dir/--source/--prefix) → `events-est-republicain.json` (`er-<UID>`).
  - Pages enregistrées à la main : `est-republicain-pages.js` lit les pages « Pour sortir » enregistrées (Page web complète, microdonnées schema.org/Event) → `events-est-republicain-pages.json` (`erp-AAAA-MM-JJ-slug`) ; titres tronqués complétés par le slug, filtre 30 km par GPS, pas d'image par défaut (`--vignettes` → images/er/, non déployé). Lancé par refresh-all.sh si des .html sont présents.
  - Portail : `/pour-sortir/` (l'ancienne URL géo renvoie 404).
- `import-ics.js` exporte `resolveCategoryFrom({categories,title,description,location})` : CATEGORIES, puis titre, puis titre+description+lieu.
- LORRAINEAUCOEUR (`lorraineaucoeur.js`, `lac-<id>`) : XOOPS en latin1 ; le tableau complet `/modules/compte/evenements.php` suffit (pas de fiche à lire). ⚠️ Couvre toute la Lorraine → filtré sur le set NANCY_AREA. Crawl-delay 1 s. Le RSS ne donne que 7 events.
- POIREL (`poirel.js`, `po-`) : même API, entité `sgp` (`/api/sgp/events`). Redondant avec vdn (absorbé par la dédup), gardé par sécurité.
- FACEBOOK (`facebook.js`, `fb-<id>`, import manuel, pas dans refresh-all.sh).
  - ⚠️ Plus d'export iCal FB, et « Enregistrer la page » simple ne capture rien. Méthode : scroller `facebook.com/events/` jusqu'en bas → « Page web COMPLÈTE » dans `ics-facebook/` → `node facebook.js`.
  - Deux voies : `extractEventNodes` (JSON data-sjs) et `extractEventCards` (cartes `<a href="/events/ID/">`, voie principale).
  - ⚠️ parseFrenchDate : juin/juil se distinguent sur 4 lettres. Titres en fausses polices normalisés par NFKC.
  - FILTRE 30 KM À LA SOURCE via `communes-30km.json` (331 communes, généré hors ligne par `node gen-communes.js`) ; commune non identifiée = écartée (`--nofilter` pour désactiver).
  - Détection de commune en cascade : adresse → CP → texte de l'affiche → titre → salles connues de data.js (source facebook exclue). CITY_CANON trié par longueur DESC. Alias courts seulement s'ils font ≥7 car. et sont uniques ; TEXT_STOP pour les communes-mots (serres, romain, viviers…).
  - ⚠️ gen-communes.js prend les centres sur les contours IGN (gregoiredavid/france-geojson). Ne PAS utiliser les coordonnées La Poste high54 (fausses de 5 à 10 km).
  - AFFICHES : `fb-posters.js` télécharge `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=<id>` avec l'UA `facebookexternalhit/1.1` (un navigateur reçoit du HTML) → `images/fb/<id>.jpg` (`sips -Z 900 -s formatOptions 68`) ; `--force` pour tout retélécharger, puis update-events.js.
- L'AUTRE CANAL (`autre-canal.js`, `lcn-<slug>`, ~95) : Drupal, /agenda en une requête. ⚠️ Pas d'année et liste non triée → année par « prochaine occurrence ». free (`term-gratuit`) et reservation sont fiables → source EXCLUE d'enrich-pricing.js.
- ESSEY (`essey.js`, `essey-<slug>`) : page /agenda?page=N (`datetime=`, `.event-item__category`) + flux iCal stratis (lieu, horaire) indexé par URL. free=true par défaut, affiné par enrich-pricing.
- LAXOU (`laxou.js`, `lx-<slug>`) : `?page_actualites=N`, `data-first-day`, JSON-LD de fiche (startDate « AAAA/MM/JJThh:mm:ss »).
  - ⚠️ Les pages 2+ renvoient un 404 TROMPEUR avec le vrai contenu → lire le corps quel que soit le statut et s'arrêter quand une page se répète.
  - Titre = <h1>. city laissée vide.
- LUDRES (`ludres.js`, `lud-<slug>`, city="Ludres") : REST `/wp-json/wp/v2/evenements?per_page=100&_embed=1`, sans les dates.
  - Dates dans la page liste (3 `.jet-listing-dynamic-field__content` = jour·mois·lieu), croisées par slug ; repli par slug de base (sans `-?\d+$`) pour les récurrents.
  - Mois abrégés (« Sep ») → monthNum() (préfixes fr+en).
  - ⚠️ Pas la description dans resolveCategoryFrom (« Population » ⊃ « pop »).
  - À ajouter au workflow GitHub Actions.
- NETTOYAGE `normalize.js` (appliqué à la FUSION par update-events.js et server.js, jamais aux snapshots). `cleanupMerged` enchaîne :
  - (1) `cleanCity` via CITY_CANON (indispensable au géo).
  - (1b) `cleanPlace` : vide les lieux réduits à un numéro de rue, retire « 54xxx Commune » en fin.
  - (2) `remapCategory` → 10 clés canoniques.
  - (3) `dedupeCrossSource`, clustering glouton : `overlap` des dates ET `placeCompat` ET (`titleSimilar` OU `sameShortEvent`). Garde la fiche la plus riche (SRC_RANK) ; mergeCluster conserve l'image de n'importe quelle fiche.
    - Pas de préfiltre par titre exact.
    - `titleSimilar` = clés égales, ou mots distinctifs (hors TITLE_STOP) de l'un ⊆ l'autre (≥2 mots), ou Jaccard ≥0.6 avec ≥2 mots communs.
    - `sameShortEvent` = titre à UN mot distinctif (≥5 lettres, hors MOTS_GENERIQUES) contenu dans le titre d'une autre source, même jour, ≤4 jours, même commune si connue. sigTokens ignore les entités HTML.
    - Les récurrences à dates disjointes restent séparées.
  - (4) `fillPeriod` : dateText « Du … au … » pour les multi-jours, SEULEMENT si date > aujourd'hui (pour un event en cours, date est calée sur aujourd'hui → c'est le scraper qui pose le vrai dateText).
- TARIF/RÉSERVATION : `enrich-pricing.js` (--source --sample --concurrency=12) → overlay `events-pricing.json` {uuid:{free?,reservation?}}, appliqué après la dédup (n'écrase que ce qui est déterminé), puis relancer update-events.js.
  - Signaux par source : zenith = payant+résa ; alentoor = `isAccessibleForFree` ; curieux = `offers.price` ; autres = texte SCOPÉ (sans nav/footer/aside/form/commentaires ; DN = HTML rendu).
  - Un prix € l'emporte sur « gratuit ». Réservation = formulations explicites seulement (pas « billetterie »/« réserver » seuls).
  - ⚠️ RÈGLE USER : free INDÉTERMINÉ ⇒ GRATUIT.
- FILTRE 30 KM dans update-events.js : haversine depuis Nancy, cache commité `commune-coords.json` (pré-rempli avec les 331 communes, BAN type=municipality en repli ; null = introuvable). Ville vide/inconnue → gardée. Même contrôle dans compte.js (cityWithin30km, bloquant).
- NOUVEAUTÉS : `body[data-view="nouveautes"]` (flag NOUVEAUTES), recherche + lightbox seulement. `renderNouveautes()` affiche `addedAt >= J-7`, trié DESC, groupé aujourd'hui / 7 derniers jours. Ruban 🆕 `.poster__new`/`.card__new` (#16a34a) via isNew.
  - ⚠️ `addedAt` vient de `events-firstseen.json` avec CLÉ = **uuid** (surtout PAS titre|date : la date des events en cours bouge chaque jour).
  - Premier remplissage = pré-datage à J-45. Si la clé change, SUPPRIMER le fichier avant de relancer.
  - Purge des clés absentes vues il y a plus de 60 j. Fichier commité.
- FAVORIS : localStorage `agenda-nancy:favoris` = {favKey: endDate}, favKey = titre|date|lieu|ville (PAS l'uuid, absent du data.js de prod) ; purge des endDate passées au chargement ; store partagé entre les vues.
  - UI : cœur `.fav-btn` frère de la tuile dans `.poster-wrap` (pas de bouton imbriqué, stopPropagation), bouton dans la lightbox, filtre state.favOnly.
- FILTRES DATE : Tout · Aujourd'hui · Ce week-end · Cette semaine (7 j) · Ce mois (30 j) · dates personnalisées (galerie : state.customFrom/customTo, when="custom" ; cartes : calendrier popover). Garder les vues alignées.
- BARRE DE FILTRES (galerie.js buildBar/syncBar, vaut aussi pour sport.html) : rangée sticky Quand · Sélections · Catégories · Filtres · ♥ · Effacer.
  - #dateFilters/#selections/#filters sont déplacés dans le panneau `.fsheet` (feuille du bas ≤640px) ; tarif/résa dans #advSheet ; #toolbar retiré.
  - Choix unique = fermeture auto. Eyebrow du hero masqué sur mobile.
- server.js (`node server.js`, port 5173, zéro dépendance) : `GET /data.js` live (snapshots SNAPSHOTS + vdn en direct, cache 10 min, cleanupMerged), `/api/events` (JSON+CORS), `/api/refresh`. `AUTO_REFRESH=1` OFF par défaut (le cron suffit). ⚠️ Ne couvre PAS lorraineaucoeur, autre-canal, essey (ni les sources plus récentes).
- PRODUCTION = CLOUDFLARE Workers Static Assets (Netlify est mort : ne plus utiliser deploy-site.sh, à supprimer un jour). Domaine https://agenda-grandnancy.fr, worker `evenement-nancy`, `wrangler.jsonc` avec `assets.directory` = `dist`.
  - `deploy-cloudflare.sh` : lit `.cloudflare-token` (gitignored, exporté en CLOUDFLARE_API_TOKEN ; l'OAuth `wrangler login` EXPIRE et casse le cron) ; assemble dist/ ; minifie data.js SANS `source`/`uuid` (GARDE `addedAt`) ; injecte GoatCounter + `?v=` ; lance `wrangler deploy --env=""`.
  - Retente 3× à 60 s (`DEPLOY_TRIES`/`DEPLOY_WAIT`) ; un échec d'auth sort en code 1.
  - ⚠️ Tout nouveau fichier PUBLIC doit être ajouté à `FILES` dans deploy-cloudflare.sh. `.assetsignore` n'est plus utilisé.
- AUTOMATISATION : `refresh-all.sh` (launchd `com.evenement-nancy.refresh`, 05h00, PATH codé en dur) lance les scrapers, update-events.js, puis deploy-cloudflare.sh. GitHub Actions `refresh.yml` commite data.js et commune-coords.json et pingue Supabase user_events chaque jour, mais NE déploie PAS (il faudrait le secret CLOUDFLARE_API_TOKEN).
- SEO/DURCISSEMENT : pages en `robots index,follow`, robots.txt `Allow: /` + Sitemap, sitemap.xml, OG/Twitter/canonical.
  - `_headers` : X-Robots-Tag sur `/data.js` seulement, X-Frame-Options DENY, CSP frame-ancestors 'none', Referrer-Policy no-referrer, nosniff, Permissions-Policy, `/sw.js` en no-cache.
  - 🔑 NE PAS réactiver noindex/Disallow : l'anti-scraping passe par Cloudflare (rate-limit 50/10 s, Bot Fight, blocage des bots IA).
  - Limite assumée : data.js reste extractible, et `url` pointe vers les domaines sources.
- STATS : GoatCounter `gabz` (https://gabz.goatcounter.com), injecté seulement dans le build dist/. no-referrer limite le rapport de provenance.
- PWA : `pwa.js` (bandeau + entrée #navMenu + feuille d'instructions iOS) et `sw.js` (réseau d'abord ; ne rien mettre en cache-first, data.js doit rester frais), CSS `.a2hs*`. ⚠️ Bandeau et menu réservés au mobile/tablette (isMobile()) : rien sur ordinateur. Le SW est enregistré partout.
- ICÔNES : apple-touch 180, icon-192/512 + maskable, favicon-16/32, `site.webmanifest` (dans FILES).

## Pitfalls / gotchas (Destination Nancy)
- Une carte PAR OCCURRENCE (suffixe `/occ/N/`, ~3194 cartes pour ~173 events) : retirer /occ/N/ et dédupliquer ; seule la fiche canonique porte le JSON-LD. NE PAS couper la pagination sur une page sans nouveauté : aller jusqu'au 404.
- Dates/adresse lues dans le JSON-LD de la fiche ; event en cours → date = aujourd'hui. Serveur lent (~9 s/page) → listing parallélisé.

## Pitfalls / gotchas
<!-- non-obvious things, debt, traps that already cost time -->
- GIT : les commits « chore: maj agenda » sont faits par GitHub Actions (agenda-bot) sur origin/main ; le repo local ne pull jamais et dérive. `git fetch` avant de conclure quoi que ce soit, pull/rebase régulièrement. ⚠️ Sur conflit des fichiers générés (data.js, events-*.json, events-firstseen.json), garder la version LOCALE (celle de la prod).
- API vdn : `dateList` contient parfois une date erronée → trier sur startDate/endDate (dateList ne sert qu'à l'horaire). `mediaUrl.crop` souvent absent → repli sur `.originale`. Images sans schéma → préfixer https:// ; `referrerpolicy="no-referrer"` sur <img>.
- API vdn : chaque date d'un récurrent est un event distinct (+ doublons) → dédup au RENDU (dates[], occurrences).
- IMAGES EN PROD : les affiches hébergées (images/fb, affiches-auto) prennent des 429 du rate-limit Cloudflare au défilement → posterImgError() réessaie à 4 s puis 12 s. À FAIRE par l'user : exclure /images/, /affiches-auto/, /affiches-sport/ de la règle.
- PANNES SILENCIEUSES : ALENTOOR gardait 0 fiche (blocage anti-robot probable) → alentoor.js logge les causes et patiente 5 s×n sur 429/403, à vérifier dans refresh.log. Curieux à 0 le 2026-09-16 (panne passagère probable).
- SPORT : sport-scrape.js ne doit pas perdre un club sur une erreur de source. Une journée injoignable retombe sur `.cache-lsi.json` ; un club en échec complet reprend ses rencontres depuis events-sport.json (report.<club>.reprises). Rattrapage : `node sport-scrape.js --only=asnl,vnvb && node update-sport.js` (depuis le Mac, réseau requis).

- SPORT / SLUC coupe d'Europe (2026-09-29) : `scrapeFIBA()` dans sport-scrape.js lit la page « Games » de fiba.basketball (Next.js : toutes les rencontres en JSON dans `self.__next_f.push`), garde teamA = SLUC (domicile), ids `sluc-fec-<gameId>`, compétition « FIBA Europe Cup », tour/groupe/match dans `round`. Les tours suivants apparaissent dans la même page quand ils sont tirés. Test : `node tests/sport-fiba.test.js`. Registre FIBA (page, codes) dans `FIBA` en tête de l'adaptateur : à changer si le SLUC change de compétition ou de saison (`fiba-europe-cup-26-27`).

## User preferences (do NOT do)
<!-- X forbidden, Y to avoid, explicit constraints -->
- Ne JAMAIS remettre noindex/Disallow : le site doit être référencé sur Google.
- Ne jamais scraper l'Est Républicain (import manuel uniquement).
- Aucune promo PWA sur ordinateur.
- free indéterminé = gratuit.
- Pas de nom de salle ni de commune sur les vignettes de sport.html.

## Onglet Pro (branche feature/evenements-pro, worktree dev-pro/)
- Chaîne : pro-sources.js (registre + rayon 5 km) → pro-scrape.js → events-pro.json → update-pro.js → data-pro.js + affiches-pro/. pro.html = sport.html adapté (data-view="pro", data-kind="pro"), zéro JS spécifique hormis l'annuaire RESEAUX. Doc : README-PRO.md.
- Les parsers sont des fonctions pures testées hors ligne : `node tests/pro-scrape.test.js` (fixtures HTML réels). Quand une source change de maquette : refaire le fixture AVANT de corriger le parser.
- galerie.js lit des champs optionnels (membersOnly, organizer, price, description, network) et fusionne les user_events du `kind` donné par `<body data-kind>` (défaut 'event').
- affiches-auto.js accepte `applyAutoPosters(events, { dir, themes, labels, labelOf })` : chaque dossier fait SON ménage, ne jamais appeler le moteur sur un dossier partagé.
- compte.html : sélecteur Type de retour (event / pro), sport toujours absent. Base : schema.sql §7 à ré-exécuter, Edge Function moderate-event à redéployer.
- Aucun réseau depuis les shells Claude (conteneur et VM du pont) : `node pro-scrape.js` ne tourne QUE depuis le Terminal du Mac.

## In-progress decisions
<!-- recent architecture choices so other sessions don't undo them -->
- NAV : lien 🏅 Sport retiré (sport.html accessible par URL). Icône compte `.nav-account` en haut à droite (👤 sur ordi, ☰ ≤640px) ; menu = S'inscrire / Se connecter + Publier (+ Déconnexion si connecté, #logout conservé).
  - Onglets Galerie/Nouveautés = rangée `.hero__views` toujours visible. `style.css?v=navN` versionné.
  - ⚠️ Le gate prod de deploy-cloudflare.sh matche `class="(?:view-switch|nav-menu__link)[^"]*"` ; menu vidé → `.nav-account--navonly`.
- COMPTES ORGANISATEURS (compte.html/compte.js, Supabase, `compte.css?v=N`) : autocomplétion du lieu via BAN. Sport en PAUSE (option masquée, code intact).
  - Anti-doublon bloquant : JS normTitle + chevauchement contre EVENTS et user_events, et trigger SQL `reject_duplicate_user_event_trg` (schema.sql §6, norm_title(), end_date >= date). Re-exécuter schema.sql (idempotent) sur une base existante.
  - Dates passées interdites.
- VIGNETTES GALERIE : pastille avec jour de semaine (`.wd`, date locale, jours simples seulement), commune seule sous le titre (`.poster__city`) ; la salle reste dans la lightbox.
- AFFICHES GÉNÉRÉES : `affiches-auto.js` fait un SVG par event sans image → `affiches-auto/<slug>-<hash>.svg`, `autoPoster:true`, clé uuid|date. Appelé par update-events.js ; `node affiches-auto.js` patche le data.js courant. `.poster--auto` masque le bandeau titre. Choisi à la place des images de l'Est Républicain.
- ÉTIQUETTES IA : `classer-evenements.js` (claude-haiku-4-5, clé `.anthropic-key` gitignored ; sans clé = ignoré) pose `tags` ∈ incontournable/atypique/fun/famille/etudiant.
  - Cache `events-tags.json` clé = titre normalisé|commune ; incrémenter PROMPT_VERSION si la consigne change. NO_TAG_RE, 2 étiquettes max.
  - « famille » = ENFANTS uniquement (garde-fou gardeFamille(), aussi à la lecture du cache).
  - UI : `#selections` (buildSelections, state.sel) ; une sélection cliquée avec la date sur « Tout » bascule sur « Cette semaine ».
- MASQUAGE APRÈS 20H30 (termineCeSoir) : un event d'un seul jour d'aujourd'hui est retiré si sa fin est passée, ou si seul son début est connu et < 20h, ou s'il n'a pas d'heure hors musiques/spectacle/festival. Multi-jours jamais masqués. sport.js garde son propre notPast.
- SÉRIES : regrouperSeries() (galerie.js) regroupe les fiches de même serieUuid en une affiche « 17 → 19 SEPT », sauf sur Aujourd'hui/Ce week-end. Plage = jours qui passent les filtres ; place chronologique, pas dans « Sur plusieurs jours ».
