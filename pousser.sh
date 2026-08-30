#!/bin/bash
#
# pousser.sh — commit de l'état local, rattrapage du bot, push et déploiement prod.
#
# Lance :  bash pousser.sh
#
# Pourquoi ce script existe (2026-08-20) :
#   publier.sh commence par `git checkout test`, ce qui échoue quand data.js a été
#   régénéré localement ET diffère entre les deux branches :
#   « Your local changes to the following files would be overwritten by checkout ».
#   Ici le travail est déjà sur main (main est en avance sur test), donc on commit
#   SUR PLACE, on rattrape les commits du bot GitHub, on réaligne test sur main,
#   puis on déploie. Aucun changement de branche, donc plus de blocage possible.
#
# Politique de conflit : en cas de conflit avec le bot (data.js, events-*.json,
# commune-coords.json), la version LOCALE gagne (le Mac lance les 16 sources,
# le bot n'en a qu'une partie). Cf. NOTES.md.

set -euo pipefail
PROJ="/Users/tristan/Documents/Événement Nancy"
export PATH="/Users/tristan/.nvm/versions/node/v24.14.0/bin:$PATH"
cd "$PROJ"

echo "── 1/5 Nettoyage des verrous git obsolètes"
rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/*.lock .git/index.lock.stale-*

echo "── 2/5 Commit de l'état local sur $(git branch --show-current)"
git add -A
git commit -m "chore: agenda $(date +%F) — import Facebook filtré 30 km (communes-30km.json, gen-communes.js) + reprise sur échec du deploy" || echo "  (rien à commiter)"

echo "── 3/5 Rattrapage des commits du bot GitHub"
git fetch origin
if git merge --ff-only origin/main 2>/dev/null; then
  echo "  fast-forward OK"
else
  git merge -X ours origin/main -m "merge: rattrapage agenda bot (données locales prioritaires)" || {
    echo "  ⚠ conflit non résolu automatiquement, à traiter à la main (git status)"; exit 1; }
fi

echo "── 4/5 Réalignement de test sur main + push"
# test n'a aucun commit propre (vérifié) : on le recale sans rien perdre.
if [ "$(git rev-list --count main..test)" = "0" ]; then
  git branch -f test main
  git push origin main test
else
  echo "  ⚠ test a des commits propres, on ne le touche pas."
  git push origin main
fi

echo "── 5/5 Déploiement Cloudflare (prod)"
bash deploy-cloudflare.sh

echo ""
echo "✅ Terminé : https://agenda-grandnancy.fr"
