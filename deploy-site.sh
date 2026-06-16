#!/bin/bash
# Déploie le SITE STATIQUE (front uniquement) sur Netlify.
#
# Assemble un dossier dist/ ne contenant que les fichiers réellement chargés par
# index.html / base.html (cf. leurs <script>/<link>) — surtout PAS les scrapers,
# snapshots events-*.json ni NOTES.md — puis publie en production.
#
# Pré-requis (configuration unique, interactive) :
#     netlify login          # autorise le CLI dans le navigateur
#     netlify link            # (ou: netlify sites:create) → crée .netlify/state.json
# Ensuite ce script déploie tout seul (appelé en fin de refresh-all.sh, ou à la main).
#
# Tant que le site n'est pas lié, le script construit dist/ et saute proprement le
# déploiement (pour ne jamais faire échouer le cron quotidien).

set -u
PROJ="/Users/tristan/Documents/Événement Nancy"
# launchd n'hérite pas du PATH interactif : on code en dur le bin de node/npm/netlify.
export PATH="/Users/tristan/.nvm/versions/node/v24.14.0/bin:$PATH"
cd "$PROJ" || exit 1

DIST="$PROJ/dist"
mkdir -p "$DIST"

# Version PUBLIQUE = Galerie (défaut) + Cartes. PAS de Base de données.
# On publie les fichiers chargés par index.html (galerie) ET cartes.html :
#   index.html → galerie.js ; cartes.html → app.js ; les deux → data.js + style.css.
# On NE publie PAS base.html/base.js/base.css ni details.js (réservés au local).
FILES="index.html cartes.html galerie.js app.js style.css data.js"
# On repart d'un dist/ propre pour ne pas laisser traîner d'anciens fichiers Base.
rm -f "$DIST"/*.html "$DIST"/*.js "$DIST"/*.css 2>/dev/null
for f in $FILES; do
  if [ -f "$PROJ/$f" ]; then
    cp "$PROJ/$f" "$DIST/$f"
  else
    echo "⚠ fichier front manquant, ignoré : $f"
  fi
done

# Le sélecteur de vue (Galerie/Cartes) est CONSERVÉ — la Base de données reste
# exclue (ni base.html ni lien vers elle dans index/cartes). Sur chaque page publiée
# on injecte (a) une balise robots noindex, (b) le compteur de visites GoatCounter
# (privé, sans cookie). Ces ajouts ne concernent QUE le build public dist/ : la
# version locale reste propre et n'est pas comptabilisée.
# GoatCounter ignore de toute façon localhost/file:// → seules les vraies visites comptent.
for page in index.html cartes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    let h = fs.readFileSync(p, "utf8");
    if (!/name="robots"/.test(h)) {
      h = h.replace(/<head>/i, "<head>\n  <meta name=\"robots\" content=\"noindex, nofollow\">");
    }
    if (!/goatcounter/i.test(h)) {
      const gc = "  <script data-goatcounter=\"https://gabz.goatcounter.com/count\" async src=\"//gc.zgo.at/count.js\"></script>\n";
      h = h.replace(/<\/body>/i, gc + "</body>");
    }
    fs.writeFileSync(p, h);
  ' "$DIST/$page"
done

# ANTI-CACHE : suffixe ?v=<horodatage> sur les assets (css/js/data) dans le HTML
# publié → les visiteurs (mobiles surtout, cache agressif) reçoivent bien chaque
# mise à jour sans avoir à vider leur cache.
VER="$(date +%Y%m%d%H%M)"
for page in index.html cartes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const [p, v] = process.argv.slice(1);
    let h = fs.readFileSync(p, "utf8");
    h = h.replace(/(href|src)="(style\.css|app\.js|galerie\.js|data\.js)"/g, (m, a, f) => `${a}="${f}?v=${v}"`);
    fs.writeFileSync(p, h);
  ' "$DIST/$page" "$VER"
done

# DURCISSEMENT data.js : on retire les métadonnées internes qui révèlent la MÉTHODE
# d'agrégation (champ `source` qui nomme chaque site, `uuid` préfixé par source) et
# on minifie (JSON compact) → plus dur à lire/aspirer, ne révèle plus les sources.
# app.js n'utilise ni source ni uuid (vérifié) : aucun impact sur le rendu.
node -e '
  const fs = require("fs");
  const p = process.argv[1];
  const code = fs.readFileSync(p, "utf8");
  const { CATEGORIES, GENERATED_AT, EVENTS } =
    new Function(code + "; return { CATEGORIES, GENERATED_AT, EVENTS };")();
  const slim = EVENTS.map(({ source, uuid, ...rest }) => rest);
  const out =
    "const CATEGORIES=" + JSON.stringify(CATEGORIES) + ";" +
    "const GENERATED_AT=" + JSON.stringify(GENERATED_AT) + ";" +
    "const EVENTS=" + JSON.stringify(slim) + ";";
  fs.writeFileSync(p, out);
' "$DIST/data.js"

# Fichiers de protection servis par Netlify (en-têtes de sécurité + anti-crawl).
cp "$PROJ/robots.txt" "$DIST/robots.txt" 2>/dev/null
cp "$PROJ/_headers"   "$DIST/_headers"   2>/dev/null

echo "dist/ assemblé ($(ls -1A "$DIST" | wc -l | tr -d ' ') fichiers, vues Galerie + Cartes, data.js durci)."

# Déploiement seulement si le site Netlify est déjà lié.
if [ ! -f "$PROJ/.netlify/state.json" ]; then
  echo "Netlify non configuré (.netlify/state.json absent) — déploiement sauté."
  echo "Setup unique : netlify login puis netlify link (ou netlify sites:create)."
  exit 0
fi

netlify deploy --prod --dir="$DIST" --message "refresh auto $(date '+%Y-%m-%d %H:%M')"
