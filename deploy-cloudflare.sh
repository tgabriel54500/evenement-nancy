#!/bin/bash
# Déploie le SITE STATIQUE (front public) sur CLOUDFLARE (Workers “Static Assets”).
#
# C'est le déploiement LIVE de agenda-grandnancy.fr. On assemble un dossier dist/
# ne contenant QUE les fichiers réellement chargés par index.html / cartes.html /
# nouveautes.html (cf. leurs <script>/<link>) — surtout PAS les scrapers, snapshots
# events-*.json ni NOTES.md — puis on publie via `wrangler deploy`.
#
# Pré-requis (configuration unique, interactive) :
#     npx wrangler login          # autorise le CLI (OAuth, stocké pour le cron)
# Ensuite ce script déploie tout seul (appelé en fin de refresh-all.sh, ou à la main).
#
# wrangler.jsonc pointe `assets.directory` sur "dist" → on déploie le build durci,
# jamais les sources brutes. (Remplace l'ancien deploy-site.sh → Netlify, abandonné.)

set -u
PROJ="/Users/tristan/Documents/Événement Nancy"
# launchd n'hérite pas du PATH interactif : on code en dur le bin de node/npm/npx.
export PATH="/Users/tristan/.nvm/versions/node/v24.14.0/bin:$PATH"
cd "$PROJ" || exit 1

DIST="$PROJ/dist"
mkdir -p "$DIST"

# Version PUBLIQUE = Galerie (défaut) + Cartes + Nouveautés. PAS de Base de données.
#   index.html → galerie.js ; cartes.html → app.js ; nouveautes.html → galerie.js
#   (mode data-view) ; toutes → data.js + style.css. On NE publie PAS
#   base.html/base.js/base.css ni details.js ni server.js (réservés au local).
# NOTE : la feature "Sport / Publier" (clubs amateurs, Supabase) est EN COURS et
# ne vit que sur STAGING (deploy-staging.sh). On NE l'inclut PAS dans le build
# prod : ni sport.html/sport.js/config-supabase.js, ni les liens de nav (strippés
# plus bas). Le working tree garde la feature — seul le build prod la masque.
FILES="index.html cartes.html nouveautes.html galerie.js app.js style.css data.js _headers robots.txt sitemap.xml site.webmanifest apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png favicon-32.png favicon-16.png"
# On repart d'un dist/ propre pour ne rien laisser traîner (HTML/JS/CSS ET autres).
rm -rf "$DIST"
mkdir -p "$DIST"
for f in $FILES; do
  if [ -f "$PROJ/$f" ]; then
    cp "$PROJ/$f" "$DIST/$f"
  else
    echo "⚠ fichier front manquant, ignoré : $f"
  fi
done

# Affiches des événements Facebook, réhébergées en local (cf. fb-posters.js). data.js
# référence images/fb/<id>.jpg → on copie tout le dossier dans le build public.
if [ -d "$PROJ/images/fb" ]; then
  mkdir -p "$DIST/images/fb"
  cp "$PROJ"/images/fb/*.jpg "$DIST/images/fb/" 2>/dev/null
  echo "  affiches FB copiées : $(ls -1 "$DIST/images/fb" 2>/dev/null | wc -l | tr -d ' ')"
fi

# GATE PROD : retire les liens de nav de la feature en cours (Sport / Publier) du
# build prod uniquement. agenda-grandnancy.fr ne doit PAS exposer ces onglets tant
# que la feature clubs/Supabase n'est pas validée (elle est testable sur staging).
for page in index.html cartes.html nouveautes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    let h = fs.readFileSync(p, "utf8");
    h = h.replace(/^[ \t]*<a class="view-switch" href="(?:sport|compte)\.html">.*<\/a>[ \t]*\r?\n/gm, "");
    fs.writeFileSync(p, h);
  ' "$DIST/$page"
done

# Sur chaque page publiée on injecte le compteur de visites GoatCounter (privé, sans
# cookie). Ces ajouts ne concernent QUE le build public dist/ : la version locale
# reste propre. GoatCounter ignore localhost/file:// → seules les vraies visites comptent.
for page in index.html cartes.html nouveautes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    let h = fs.readFileSync(p, "utf8");
    if (!/goatcounter/i.test(h)) {
      const gc = "  <script data-goatcounter=\"https://gabz.goatcounter.com/count\" async src=\"//gc.zgo.at/count.js\"></script>\n";
      h = h.replace(/<\/body>/i, gc + "</body>");
    }
    fs.writeFileSync(p, h);
  ' "$DIST/$page"
done

# ANTI-CACHE : suffixe ?v=<horodatage> sur les assets (css/js/data) dans le HTML
# publié → les visiteurs (mobiles surtout, cache agressif) reçoivent chaque mise à
# jour sans vider leur cache.
VER="$(date +%Y%m%d%H%M)"
for page in index.html cartes.html nouveautes.html; do
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
# on minifie (JSON compact). app.js/galerie.js n'utilisent ni source ni uuid → 0
# impact rendu. Le champ `addedAt` (page Nouveautés) est CONSERVÉ.
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

echo "dist/ assemblé ($(ls -1A "$DIST" | wc -l | tr -d ' ') fichiers, Galerie + Cartes + Nouveautés, data.js durci)."

# Publication sur Cloudflare. wrangler.jsonc → assets.directory = "dist".
# OAuth déjà configuré (npx wrangler login) → non interactif en cron.
echo "→ wrangler deploy…"
if npx --yes wrangler deploy; then
  echo "✓ déployé sur Cloudflare (agenda-grandnancy.fr)."
  exit 0
else
  echo "✗ échec wrangler deploy (auth ? réseau ?). data.js a tout de même été régénéré."
  exit 1
fi
