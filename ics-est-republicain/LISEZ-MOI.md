# Exports iCal — Est Républicain « Pour sortir »

Dépose ici les fichiers `.ics` que tu exportes **à la main** depuis l'agenda.

## Pourquoi à la main ?
Le portail `estrepublicain.fr/pour-sortir/` déclare une réserve d'opposition à la
fouille de données (en-tête `tdm-reservation: 1`). On ne le scrape donc **pas**
automatiquement. L'export iCal, lui, est un usage **manuel** prévu par le site.

## Comment exporter
1. Va sur https://www.estrepublicain.fr/pour-sortir/ (avec le `/` final).
2. Choisis une catégorie (Concert-musique, Exposition, Cinéma, Spectacle…).
3. Ouvre un événement Nancy / Meurthe-et-Moselle qui t'intéresse.
4. Clique sur l'export **iCal** (« Ajouter à mon agenda ») → un `.ics` se télécharge.
5. Glisse le `.ics` dans **ce dossier**.

## Convertir + intégrer
```bash
node import-ics.js          # lit ce dossier -> events-est-republicain.json
node update-events.js       # fusionne dans data.js avec les autres sources
```

`import-ics.js` accepte aussi des fichiers en argument et fonctionne avec
n'importe quelle source iCal :
```bash
node import-ics.js fichier1.ics fichier2.ics
node import-ics.js --dir=autre-dossier --source=ma-source --prefix=ms
```
