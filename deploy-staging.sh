#!/bin/bash
# Déploie le SITE sur l'environnement de STAGING (bac à sable) Cloudflare.
#
# But : essayer des changements sur une URL séparée AVANT de toucher la prod.
#   - Worker distinct : evenement-nancy-staging (cf. env.staging dans wrangler.jsonc)
#   - URL gratuite : https://evenement-nancy-staging.<ton-sous-domaine>.workers.dev
#     (affichée à la fin du déploiement ; aucun DNS à configurer)
#   - noindex + robots Disallow : Google n'indexe JAMAIS le staging
#   - PAS de GoatCounter : les visites de test ne polluent pas les stats prod
#
# Usage : bash deploy-staging.sh   (depuis n'importe quelle branche git)
# La prod (agenda-grandnancy.fr) n'est PAS touchée — voir deploy-cloudflare.sh.

set -u
PROJ="/Users/tristan/Documents/Événement Nancy"
export PATH="/Users/tristan/.nvm/versions/node/v24.14.0/bin:$PATH"
cd "$PROJ" || exit 1

DIST="$PROJ/dist-staging"
FILES="index.html cartes.html nouveautes.html compte.html sport.html galerie.js app.js events-core.js compte.js sport.js compte.css user-events.js config-supabase.js style.css data.js _headers sitemap.xml site.webmanifest apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png favicon-32.png favicon-16.png"

rm -rf "$DIST"
mkdir -p "$DIST"
for f in $FILES; do
  if [ -f "$PROJ/$f" ]; then cp "$PROJ/$f" "$DIST/$f"; else echo "⚠ manquant, ignoré : $f"; fi
done

# Affiches des événements Facebook, réhébergées en local (cf. fb-posters.js).
if [ -d "$PROJ/images/fb" ]; then
  mkdir -p "$DIST/images/fb"
  cp "$PROJ"/images/fb/*.jpg "$DIST/images/fb/" 2>/dev/null
fi

# robots.txt STAGING : tout interdire (jamais indexé, contrairement à la prod).
printf 'User-agent: *\nDisallow: /\n' > "$DIST/robots.txt"

# noindex sur chaque page (ceinture + bretelles avec robots.txt).
for page in index.html cartes.html nouveautes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    let h = fs.readFileSync(p, "utf8");
    if (/<meta[^>]*name="robots"[^>]*>/i.test(h)) {
      // Remplace le robots existant (la prod déclare index,follow) par noindex.
      h = h.replace(/<meta[^>]*name="robots"[^>]*>/i, "<meta name=\"robots\" content=\"noindex,nofollow\">");
    } else {
      h = h.replace(/<\/head>/i, "  <meta name=\"robots\" content=\"noindex,nofollow\">\n</head>");
    }
    fs.writeFileSync(p, h);
  ' "$DIST/$page"
done

# ANTI-CACHE : ?v=<horodatage> sur les assets (comme la prod) → on voit ses
# changements sans vider le cache du navigateur.
VER="staging-$(date +%Y%m%d%H%M)"
for page in index.html cartes.html nouveautes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const [p, v] = process.argv.slice(1);
    let h = fs.readFileSync(p, "utf8");
    h = h.replace(/(href|src)="(style\.css|app\.js|galerie\.js|events-core\.js|data\.js)"/g, (m, a, f) => `${a}="${f}?v=${v}"`);
    fs.writeFileSync(p, h);
  ' "$DIST/$page" "$VER"
done

echo "dist-staging/ assemblé ($(ls -1A "$DIST" | wc -l | tr -d ' ') fichiers, noindex, sans GoatCounter)."

echo "→ wrangler deploy --env staging…"
if npx --yes wrangler deploy --env staging; then
  echo "✓ staging déployé. URL *.workers.dev affichée ci-dessus."
  exit 0
else
  echo "✗ échec (auth ? workers.dev activé sur le compte ?)."
  exit 1
fi
