# Onglet Pro (pro.html) : rendez-vous professionnels à Nancy

Branche `feature/evenements-pro`, worktree `dev-pro/`. Même principe que l'onglet
Sport : une page jumelle de la galerie qui réutilise `galerie.js` tel quel avec
un `data-pro.js` au schéma de `data.js`.

## Chaîne de données

```
pro-sources.js      registre des réseaux (scrapés ou annuaire) + rayon 5 km
pro-categories.js   catégories (Node + navigateur)
pro-scrape.js  →  events-pro.json (+ events-pro-report.json)
update-pro.js  →  data-pro.js + affiches-pro/*.svg + events-pro-firstseen.json
pro.html            data-pro.js + events-core.js + user-events.js + galerie.js
```

Régénérer : `node pro-scrape.js && node update-pro.js` (réseau requis, donc
depuis le Mac). `refresh-all.sh` enchaîne les deux après le sport.

Tests hors ligne des parsers : `node tests/pro-scrape.test.js` (fixtures HTML
réels dans `tests/fixtures-pro/`, relevés le 2026-09-28).

## Sources scrapées

| Réseau | Page | Ce qu'on en tire | Pièges |
|---|---|---|---|
| Les Audacieux | les-audacieux.fr/afterworks/ | cartes `article.afterwork_card` : titre, date+heure, lieu, description, lien adsum.social | les cartes `event_past` sont ignorées ; page 2 = passé |
| Cafés Business | lescafesbusiness.fr/nos-evenements-meurthe-moselle/ | liens `businessapp.fr/meetings/view/N` libellés « Hôte - JJ/MM/AAAA » | fiche derrière login → lieu = entreprise hôte, ville « Nancy » par défaut, 9h |
| ADJAN 8/9 | adjan.fr/le-8-9-adjan/ | bloc texte « Nos prochains 8/9 à Nancy » : intervenant, date, lieu, photo | Reims est sur la même page (exclu) ; lien d'inscription = formulaire HubSpot commun |
| MEDEF 54 | medef-meurthe-moselle.fr/fr/agenda | liste paginée (du plus récent au plus ancien) puis chaque fiche : heure, lieu, « réservé aux adhérents », image, lien ERP | le lieu n'est que dans le texte libre (« Rendez-vous le …, à ICN … ») ; webinaires écartés |
| CCI Grand Nancy | nancy.cci.fr/evenements?page=N | `.views-row` : date ou plage, heure, ville, tarif, image | matchs « X vs Y » exclus ; sans lieu = webinaire ; formations payantes gardées (catégorie formation) |
| Centre Prouvé / Parc Expo | destination-nancy.com/…/agenda-et-actualites/ | `.iris-card` : titre, plage, salle, ville, extrait, image | la page ne distingue pas pro et grand public : filtre par mots-clés (`PRO_RE` / `PUBLIC_RE` dans pro-scrape.js) |

Réseaux sans agenda public, présents dans l'annuaire seulement : SLUC Business
Club, VNVB Business Club, GNVB partenaires, Villers Handball Family Business.
Ils sont invités à publier via compte.html.

## Visuels

- Quand la source publie une image (photo de l'intervenant ADJAN, visuel CCI,
  couverture MEDEF, image Destination Nancy), elle est reprise telle quelle
  (lien distant, comme la culture).
- Sinon, affiche générée aux couleurs du réseau (moteur `affiches-auto.js`),
  avec le logo du réseau en filigrane et, en médaillon, le logo de l'hôte
  (Cafés Business : logo de l'entreprise qui reçoit) ou celui du réseau.
- Les logos sont téléchargés une fois par `pro-scrape.js` dans
  `affiches-pro/logos/` (URL dans `pro-sources.js`, champ `logo`, relevées à la
  main le 2026-09-28 ; `--logos` pour forcer). Ils sont INCRUSTÉS en data URI
  dans les SVG : un SVG chargé en `<img>` ne peut rien charger d'externe.
  `logoOnDark: true` = logo blanc posé directement sur le fond, sinon plaque
  blanche. L'annuaire de pro.html affiche aussi ces logos.

## Filtres (update-pro.js)

- À venir seulement (date de fin >= aujourd'hui).
- Nancy + communes à `RAYON_KM` = 5 km du centre (haversine sur
  `commune-coords.json`). Une commune inconnue est écartée ET listée dans la
  console : l'ajouter à `COMMUNES_TOUJOURS` si elle doit passer.
- Webinaires et visios écartés (`online: true`).

## Champs ajoutés au schéma EVENTS

`network`, `organizer`, `membersOnly` (badge 🔒 Membres sur la vignette, badge
dans la lightbox), `price` (badge), `description` (paragraphe dans la lightbox).
`galerie.js` les lit s'ils existent, sans effet sur la culture ni le sport.

## Publication par les pros (compte.html)

- Sélecteur Type réactivé : « Sortie, culture » (`kind='event'`) ou
  « Rendez-vous professionnel » (`kind='pro'`). Le sport reste en pause.
- Pour `pro` : catégories de `pro-categories.js`, champ Organisateur, case
  « Réservé aux membres », image facultative, rayon 5 km (BAN), anti-doublon
  limité aux user_events de même kind.
- Base : section 7 de `supabase/schema.sql` (kind 'pro', colonnes `organizer`
  et `members_only`, `image` nullable sauf hors pro). À ré-exécuter sur la base.
- Edge Function `moderate-event` : prompt complété (type pro, image absente
  normale, réservé aux membres publiable). À redéployer :
  `supabase functions deploy moderate-event --no-verify-jwt`.
- `pro.html` charge `user-events.js` et fusionne `loadApprovedUserEvents("pro")`
  (`data-kind="pro"` sur `<body>`).

## Déploiement (branche)

`deploy-cloudflare.sh` : FILES += pro.html, data-pro.js, pro-categories.js ;
copie de `affiches-pro/` ; GoatCounter et anti-cache sur pro.html ; sitemap
avec pro.html. Onglet « 💼 Pro » ajouté à index, nouveautes et sport.
Rien de tout cela n'est en prod tant que la branche n'est pas fusionnée dans
`main` et le dossier de prod mis à jour.
