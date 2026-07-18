#!/bin/bash
#
# publier.sh — commit de la branche test, fusion dans main, push et déploiement prod.
#
# Lance :  bash publier.sh
#
# Étapes : (1) nettoie les verrous git obsolètes, (2) commits logiques sur test,
# (3) fusion test → main (les fichiers générés de test gagnent en cas de conflit
# avec les commits quotidiens du bot), (4) push, (5) déploiement Cloudflare prod.
# L'espace organisateur sera VISIBLE sur agenda-grandnancy.fr (gate retiré).

set -e
PROJ="/Users/tristan/Documents/Événement Nancy"
cd "$PROJ"
export PATH="/Users/tristan/.nvm/versions/node/v24.14.0/bin:$PATH"

echo "── 1/5 Nettoyage des verrous git obsolètes"
rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/*.lock .git/index.lock.stale-*

echo "── 2/5 Commits sur la branche test"
git checkout test
git fetch origin
git add compte.html compte.css compte.js supabase/SETUP.md supabase/schema.sql 2>/dev/null || true
git commit -m "feat(compte): espace organisateur (validations, anti-doublon, autocomplétion BAN, horaires, design)" || true
git add index.html nouveautes.html sport.html style.css 2>/dev/null || true
git commit -m "feat(nav): icône compte + menu burger, retrait onglet Sport, textes hero" || true
git add update-events.js .github/workflows/refresh.yml commune-coords.json 2>/dev/null || true
git commit -m "feat(data): filtre 30 km autour de Nancy (géocodage BAN + cache) et ping anti-pause Supabase" || true
git add mentions-legales.html deploy-cloudflare.sh deploy-staging.sh test-local.sh publier.sh 2>/dev/null || true
git commit -m "feat: mentions légales + activation de l'espace organisateur dans le build prod" || true
git add data.js events-*.json NOTES.md images/fb 2>/dev/null || true
git commit -m "chore: maj agenda $(date +%F) (données filtrées 30 km) + notes" || true
git add -A
git commit -m "chore: divers" || true

echo "── 3/5 Fusion test → main"
git checkout main
# Rattrape les commits quotidiens du bot (ff attendu, le local ne diverge pas).
git merge --ff-only origin/main || git merge origin/main -m "merge: rattrapage agenda bot"
# En cas de conflit (data.js, events-*.json), la version de TEST gagne (locale,
# plus complète : le Mac lance les 16 sources, cf. NOTES.md).
git merge -X theirs test -m "merge: branche test → main (espace organisateur en prod)"

echo "── 4/5 Push"
git push origin main test

echo "── 5/5 Déploiement Cloudflare (prod)"
bash deploy-cloudflare.sh

echo ""
echo "✅ Terminé : https://agenda-grandnancy.fr"
echo "   Pense à vérifier sur Supabase : Redirect URL https://agenda-grandnancy.fr/**"
