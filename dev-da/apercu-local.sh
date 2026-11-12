#!/bin/bash
#
# apercu-local.sh — VOIR le site comme il sera publié, SANS rien mettre en ligne.
#
# Lance simplement :  bash apercu-local.sh
#
# Construit le build public (onglets Sport/Publier masqués, data.js durci, comme la
# vraie prod) dans dist/, puis l'ouvre dans ton navigateur. Aucune publication, aucun
# risque : agenda-grandnancy.fr n'est PAS touché. Pour publier pour de vrai, c'est un
# autre script (deploy-cloudflare.sh) que je lance pour toi quand tu valides.

PROJ="/Users/tristan/Documents/Événement Nancy"
cd "$PROJ" || { echo "Dossier projet introuvable."; exit 1; }

echo "Construction de l'aperçu (version identique au site public)…"
if bash "$PROJ/deploy-cloudflare.sh" --build-only; then
  echo ""
  echo "Ouverture dans le navigateur…"
  open "$PROJ/dist/index.html"
  echo "→ Onglet ouvert. C'est EXACTEMENT ce qui partira en ligne (rien n'est publié)."
else
  echo "Échec de la construction de l'aperçu."
  exit 1
fi
