#!/bin/bash
#
# test-local.sh — tester la branche git COURANTE en local, telle quelle.
#
# Lance :  bash test-local.sh    (Ctrl+C pour arrêter)
#
# Sert le dossier du projet sur http://localhost:8000 et l'ouvre dans le
# navigateur. Rien n'est construit ni publié : tu vois exactement les fichiers
# de la branche en cours (y compris l'onglet « S'inscrire / Publier », masqué
# par le build prod). Différence avec apercu-local.sh : lui montre la version
# PROD (dist/), ici c'est la version DEV brute.
#
# ⚠️ Pour que la connexion par lien magique fonctionne en local, ajoute une
# fois http://localhost:8000 dans Supabase → Authentication → URL
# Configuration → Redirect URLs.

PROJ="/Users/tristan/Documents/Événement Nancy"
PORT=8000
cd "$PROJ" || { echo "Dossier projet introuvable."; exit 1; }

echo "Branche courante : $(git branch --show-current 2>/dev/null || echo '?')"
echo "Aperçu sur http://localhost:$PORT — Ctrl+C pour arrêter."

# Ouvre le navigateur une fois le serveur prêt.
( sleep 1; open "http://localhost:$PORT/index.html" ) &

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
else
  npx --yes serve -l "$PORT" .
fi
