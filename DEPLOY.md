# Mettre le site en ligne (accessible partout, gratuit)

Le site est **statique** : il suffit de l'héberger. On utilise **GitHub Pages**
(hébergement gratuit + URL HTTPS permanente partageable) et **GitHub Actions**
(robot qui relance les scrapers chaque nuit, dans le cloud, même Mac éteint).

## Une seule fois : publier le dépôt

1. **Crée un compte** sur https://github.com (si tu n'en as pas).
2. **Crée un dépôt** : bouton « New » → nom `evenement-nancy` → **Public** →
   *ne coche rien* (pas de README) → « Create repository ».
3. **Relie et envoie le projet** (dans le terminal, préfixe `!` pour exécuter ici) :
   ```bash
   git remote add origin https://github.com/TON-PSEUDO/evenement-nancy.git
   git branch -M main
   git push -u origin main
   ```
   *(remplace `TON-PSEUDO`)*. GitHub demandera ton identifiant + un **token**
   (Settings → Developer settings → Personal access tokens → « Generate », coche
   `repo`). Colle le token comme mot de passe.
4. **Active GitHub Pages** : dépôt → **Settings → Pages** →
   *Source* = « Deploy from a branch » → branche **main**, dossier **/ (root)** →
   *Save*. Au bout d'~1 min, ton site est à :
   ```
   https://TON-PSEUDO.github.io/evenement-nancy/
   ```
   👉 **C'est cette adresse que tu partages.**
5. **Autorise le robot à publier** : Settings → **Actions → General** →
   *Workflow permissions* → coche **« Read and write permissions »** → Save.
   (Sans ça, le cron ne peut pas committer le nouveau data.js.)

## Ensuite : c'est automatique

- Le workflow **« Rafraîchir l'agenda »** tourne **chaque nuit** (04:00 UTC) :
  il relance les scrapers, régénère `data.js`, et le republie tout seul.
- Pour forcer une mise à jour : onglet **Actions** → « Rafraîchir l'agenda » →
  **Run workflow**.
- Toute modif que tu fais en local et que tu `git push` est mise en ligne en ~1 min.

## Mettre à jour à la main (optionnel)

```bash
bash refresh-all.sh        # relance scrapers + update-events.js en local
git add -A && git commit -m "maj" && git push   # publie
```

## Notes

- **Est Républicain** : volontairement **non scrapé** (réserve `tdm-reservation:1`).
  Pour l'inclure, exporte les fiches en iCal à la main dans `ics-est-republicain/`,
  commit + push : le robot les intègre via `import-ics.js`.
- L'automatisation **locale** macOS (LaunchAgent `com.evenement-nancy.refresh`)
  fait double emploi avec le cron cloud. Tu peux la garder (refresh local) ou la
  désactiver : `launchctl unload ~/Library/LaunchAgents/com.evenement-nancy.refresh.plist`.
- `server.js` n'est utile que pour les données **temps réel** ; il faudrait alors
  un hébergeur Node (Render/Railway/VPS). Pour un agenda local, le cron nocturne suffit.
