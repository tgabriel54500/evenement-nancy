# Onglet Sport : les rencontres des clubs du Grand Nancy

Objectif : le même mur d'affiches que la culture, mais pour les matchs À DOMICILE
des clubs de haut niveau du Grand Nancy. Une affiche par rencontre, filtrable par
sport et par date, cliquable pour les détails et la billetterie.

Ne pas confondre avec le chantier « sport amateur » (publication par les clubs via
Supabase, `user_events` kind='sport') : c'est un autre sujet, mis en pause.

## Clubs suivis

| Club | Sport | Compétition | Salle / stade |
|---|---|---|---|
| AS Nancy-Lorraine | Football | Ligue 2 BKT | Stade Marcel-Picot, Tomblaine |
| SLUC Nancy Basket | Basket | Betclic ÉLITE | Palais des Sports Jean Weille |
| Vandœuvre Nancy Volley-Ball | Volley | Saforelle Power 6 | Parc des Sports des Nations |
| Grand Nancy Volley-Ball | Volley | Ligue B Masculine | Parc des Sports des Nations |


Ajouter un club : une entrée dans `sport-clubs.js`, et un adaptateur dans
`sport-scrape.js` si sa source n'est pas déjà couverte.

## Chaîne de traitement

```
node sport-scrape.js     →  events-sport.json      (rencontres brutes, domicile)
node update-sport.js     →  data-sport.js          (CATEGORIES + EVENTS)
                         →  affiches-sport/*.svg   (une affiche par match)
```

`sport.html` charge `data-sport.js`, `events-core.js` et `galerie.js` : c'est
exactement le moteur de la galerie culture, sans une ligne de JS en plus. Les
sports jouent le rôle des catégories, les affiches celui des visuels.

### Les sources

| Club | Source | Pourquoi celle-là |
|---|---|---|
| GNVB | `nancy-volley.fr/wp-json/gnvb/v1/all` | Le club publie lui-même un JSON complet et propre. Quand un club fait ce cadeau, on le prend. |
| SLUC | `coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy` | La fédération publie le calendrier complet du club en HTML rendu côté serveur, avec le numéro de journée et un marqueur `vs` (domicile) ou `@` (extérieur). Les horaires y sont ajoutés au fil de la saison. |
| ASNL, VNVB | `les-sports.info` | Aucune source officielle exploitable (voir ci-dessous). Ce site publie ces compétitions dans un format régulier, journée par journée. |

Ce qui a été essayé et écarté, pour ne pas refaire le tour deux fois :

- **asnl.net** ne liste que les matchs DÉJÀ JOUÉS. Au 5 septembre, 4 lignes.
- **sluc-basket.fr** : la route `wp-json/kbasketstats/v1/next-match-home` renvoie
  une réponse vide, la page « Calendrier » du site ne contient aucun calendrier
  (deux boutons), et le calendrier officiel du club est publié en IMAGE.
- **les-sports.info pour le basket** : la page Betclic ÉLITE 2026/2027 existe mais
  ne listait aucune journée au 6 septembre. La FFBB, elle, avait déjà tout.
- **Sofascore** : 403 sur les quatre jeux d'en-têtes et les trois domaines testés.
- **lnb.fr**, **lnv.fr** : calendriers chargés en JavaScript, sans URL stable.
- **lnv.fr/xml/calendrier-vandoeuvre-nancy.xml** : 403, flux abandonné.

Comment marche l'adaptateur les-sports.info : la page « résultats détaillés » de
la compétition contient la liste des journées sous forme d'identifiants
(`mancheid`). Chaque journée se charge ensuite par
`ajax_php.php?majajax=resultats_manche_collectif&langage=fr&mancheid=<id>`.
Rien n'est codé en dur : les identifiants sont relus à chaque passage, seule
l'URL de la compétition est en configuration (constante `COMPETITIONS` dans
`sport-scrape.js`), à mettre à jour une fois par saison.

Une compétition dont le calendrier n'est pas encore publié (la source ne liste
alors aucune journée) n'est pas une panne : le scraper l'annonce
« calendrier pas encore publié par la source » et repassera au prochain
passage. C'était le cas de la Betclic ÉLITE au 5 septembre 2026, pour une
saison qui démarre le 26.

Un cache (`.cache-lsi.json`) garde les journées déjà jouées : après le premier
passage, une exécution ne recharge que les journées à venir, avec 350 ms entre
deux requêtes.

### Saisie manuelle

`sport-manuel.json` est un tableau de rencontres qui COMPLÈTENT l'automatique :
seuls les champs réellement renseignés à la main l'emportent. Une rencontre
saisie sans `time` récupérera donc l'horaire dès que la source automatique le
publiera, au lieu de le masquer. Le rattachement se fait par adversaire d'abord
(une équipe ne vient qu'une fois par saison à domicile), par date ensuite : un
match reporté reste un seul match. Format :

```json
[
  {
    "club": "sluc",
    "id": "cdf-2026-11-04",
    "date": "2026-11-04",
    "time": "20h00",
    "opponent": "Cholet Basket",
    "competition": "Coupe de France",
    "round": "16e de finale",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "tickets": "https://billetterie.sluc-basket.fr/"
  }
]
```

`club` doit être une clé de `sport-clubs.js` (`asnl`, `sluc`, `vnvb`, `gnvb`).

## Mise au point des scrapers

Le pont Claude vers le Mac n'a pas d'accès réseau : les scrapers ne peuvent être
exécutés que depuis un Terminal sur le Mac.

```bash
cd "/Users/tristan/Documents/Événement Nancy/dev-sport"
node sport-scrape.js --debug     # dump des réponses brutes dans .debug-sport/
node update-sport.js
open sport.html                  # ou bash apercu-local.sh
```

`--only=sluc` ne réécrit que le club demandé : les autres sont repris du
fichier existant, un passage ciblé ne vide donc pas l'agenda.

`--debug` écrit chaque réponse brute dans `.debug-sport/` : c'est ce qu'il faut
regarder (ou me montrer) quand un adaptateur rend zéro match.

## Publication

Fait le 6 septembre 2026. Ce qui a été branché, pour mémoire :

- `deploy-cloudflare.sh` : `sport.html` et `data-sport.js` ajoutés à `FILES`,
  copie du dossier `affiches-sport/` dans `dist/`, `sport.html` ajouté aux deux
  boucles (GoatCounter et anti-cache) et `data-sport.js` à la liste des assets
  horodatés.
- `index.html` et `nouveautes.html` : onglet « 🏅 Sport » dans `hero__views`.
- `sitemap.xml` : `sport.html` y figurait déjà.
- `refresh-all.sh` : `sport-scrape.js` puis `update-sport.js`, après
  `update-events.js`.

Les fichiers de la chaîne sport vivent désormais à la racine du projet, à côté
de ceux de la culture. Le worktree `dev-sport/` a servi à la mise au point.

## Choix assumés

- **« Plus d'infos » suit ce que le visiteur cherche.** Tant que l'horaire n'est
  pas annoncé, le lien mène au calendrier officiel du club, qui se remplira, et
  l'affiche porte la mention « horaire à confirmer ». Dès que l'heure est connue,
  le lien bascule vers la billetterie.
- **Matchs à domicile uniquement.** L'agenda répond à « que faire dans le Grand
  Nancy ce week-end » : un déplacement à Ajaccio n'y a pas sa place.
- **Affiches générées.** Les clubs ne publient pas d'affiche par match sous une
  forme récupérable. On compose donc une affiche aux couleurs du club
  (club, adversaire, compétition, date, salle), au format 2/3 comme la culture.
  Les logos des clubs adverses ne sont pas repris : droits incertains, et le
  rendu resterait hétérogène.
- **Nancy Handball n'y est pas.** La LNH répond « équipe non présente en LNH
  cette saison » : le club a perdu son statut professionnel. Il reste à
  réintégrer dans `sport-clubs.js` (avec le sport `hand`) s'il remonte.
- **Un seul fichier de données.** `data-sport.js` est séparé de `data.js` : la
  galerie culture ne bouge pas, et la page sport se charge sans les 1000
  événements culturels.
