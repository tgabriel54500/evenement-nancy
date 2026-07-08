#!/bin/bash
# Déploie le SITE STATIQUE (front public) sur CLOUDFLARE (Workers “Static Assets”).
#
# C'est le déploiement LIVE de agenda-grandnancy.fr. On assemble un dossier dist/
# ne contenant QUE les fichiers réellement chargés par index.html /
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

# AUTH NON-INTERACTIVE (cron) : si un token API Cloudflare est présent dans
# .cloudflare-token (gitignored, JAMAIS commité), on l'exporte → wrangler déploie
# sans OAuth. C'est le fix durable : l'OAuth `wrangler login` expire et casse le
# cron (« auth token has expired … non-interactive »). À défaut de token, on
# retombe sur l'éventuel login OAuth encore valide.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$PROJ/.cloudflare-token" ]; then
  CLOUDFLARE_API_TOKEN="$(tr -d ' \t\r\n' < "$PROJ/.cloudflare-token")"
  export CLOUDFLARE_API_TOKEN
fi

DIST="$PROJ/dist"
mkdir -p "$DIST"

# Version PUBLIQUE = Galerie (défaut) + Nouveautés. PAS de Base de données NI de
# vue Cartes.
#   index.html → galerie.js ; nouveautes.html → galerie.js (mode data-view) ;
#   toutes → data.js + events-core.js (cœur commun) + style.css. On NE publie PAS
#   la vue Cartes (cartes.html/app.js, retirée de la nav, réservée au local), ni
#   base.html/base.js/base.css ni details.js ni server.js (réservés au local).
# NOTE : la feature "Sport / Publier" (clubs amateurs, Supabase) est EN COURS et
# ne vit que sur STAGING (deploy-staging.sh). On NE l'inclut PAS dans le build
# prod : ni sport.html/sport.js/config-supabase.js, ni les liens de nav (strippés
# plus bas). Le working tree garde la feature — seul le build prod la masque.
FILES="index.html nouveautes.html galerie.js events-core.js style.css data.js _headers robots.txt sitemap.xml site.webmanifest apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png favicon-32.png favicon-16.png"
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
for page in index.html nouveautes.html; do
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
for page in index.html nouveautes.html; do
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
for page in index.html nouveautes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const [p, v] = process.argv.slice(1);
    let h = fs.readFileSync(p, "utf8");
    h = h.replace(/(href|src)="(style\.css|events-core\.js|galerie\.js|data\.js)"/g, (m, a, f) => `${a}="${f}?v=${v}"`);
    fs.writeFileSync(p, h);
  ' "$DIST/$page" "$VER"
done

# ─────────────────────────────────────────────────────────────────────────────
# SEO (build uniquement, sources intactes) : 3 ajouts auto-maintenus chaque nuit.
#   1) og:image + twitter (aperçu visuel des partages WhatsApp/FB/LinkedIn/SMS)
#   2) JSON-LD schema.org/Event (résultats enrichis Google : dates, lieux, carrousel)
#   3) sitemap.xml régénéré (lastmod du jour, seulement les pages réellement publiées)
TODAY="$(date +%F)"
SITE="https://agenda-grandnancy.fr"

# 1) og:image (partages) — injecté dans le <head> si absent. Image carrée 512 en v1
#    (pas d'outil de génération 1200×630 sur la machine ; suffisant pour un aperçu).
for page in index.html nouveautes.html; do
  [ -f "$DIST/$page" ] || continue
  node -e '
    const fs = require("fs");
    const [p, site] = process.argv.slice(1);
    let h = fs.readFileSync(p, "utf8");
    const img = site + "/icon-512.png";
    if (!/property="og:image"/i.test(h)) {
      const tags =
        "  <meta property=\"og:image\" content=\"" + img + "\">\n" +
        "  <meta property=\"og:image:width\" content=\"512\">\n" +
        "  <meta property=\"og:image:height\" content=\"512\">\n" +
        "  <meta property=\"og:image:alt\" content=\"Agenda Grand Nancy\">\n" +
        "  <meta name=\"twitter:image\" content=\"" + img + "\">\n";
      h = h.replace(/<\/head>/i, tags + "</head>");
    }
    fs.writeFileSync(p, h);
  ' "$DIST/$page" "$SITE"
done

# 2) JSON-LD schema.org/Event — ItemList des événements À VENIR (date >= aujourd'hui),
#    injecté seulement dans index.html (page d'accueil = la liste). Cap à 80 pour ne
#    pas alourdir le HTML ; Google lit dates + lieux → résultats enrichis "Événements".
if [ -f "$DIST/index.html" ] && [ -f "$DIST/data.js" ]; then
  node -e '
    const fs = require("fs");
    const [pHtml, pData, today, site] = process.argv.slice(1);
    const code = fs.readFileSync(pData, "utf8");
    const { EVENTS } = new Function(code + "; return { EVENTS };")();
    const esc = s => String(s == null ? "" : s);
    const items = EVENTS
      .filter(e => e && e.date && e.date >= today && e.title && e.place)
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      .slice(0, 80)
      .map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Event",
          name: esc(e.title),
          startDate: esc(e.date),
          endDate: esc(e.endDate || e.date),
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: {
            "@type": "Place",
            name: esc(e.place),
            address: {
              "@type": "PostalAddress",
              addressLocality: esc(e.city || "Nancy"),
              addressRegion: "Grand Est",
              addressCountry: "FR"
            }
          },
          ...(e.image ? { image: [esc(e.image)] } : {}),
          ...(e.url ? { url: esc(e.url) } : {}),
          isAccessibleForFree: !!e.free,
          organizer: { "@type": "Organization", name: "Agenda Grand Nancy", url: site + "/" }
        }
      }));
    const ld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Événements à venir dans le Grand Nancy",
      itemListElement: items
    };
    // </ dans le JSON casserait la balise <script> → on échappe le slash.
    const json = JSON.stringify(ld).replace(/<\//g, "<\\/");
    let h = fs.readFileSync(pHtml, "utf8");
    h = h.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/i, "");
    const tag = "  <script type=\"application/ld+json\">" + json + "</script>\n";
    h = h.replace(/<\/head>/i, tag + "</head>");
    fs.writeFileSync(pHtml, h);
    console.log("  JSON-LD Event injecté : " + items.length + " événements à venir");
  ' "$DIST/index.html" "$DIST/data.js" "$TODAY" "$SITE"
fi

# 3) sitemap.xml régénéré : lastmod du jour + SEULEMENT les pages publiées (index +
#    nouveautes). L'ancien listait sport.html (masqué en prod → 404 pour Google) et
#    avait des dates figées ; on écrase la copie du build (source inchangée).
if [ -f "$DIST/sitemap.xml" ]; then
  node -e '
    const fs = require("fs");
    const [p, today, site] = process.argv.slice(1);
    const xml =
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" +
      "  <url>\n    <loc>" + site + "/</loc>\n    <lastmod>" + today +
      "</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n" +
      "  <url>\n    <loc>" + site + "/nouveautes.html</loc>\n    <lastmod>" + today +
      "</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n" +
      "</urlset>\n";
    fs.writeFileSync(p, xml);
  ' "$DIST/sitemap.xml" "$TODAY" "$SITE"
  echo "  sitemap.xml régénéré (lastmod $TODAY, sport.html retiré)"
fi

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

echo "dist/ assemblé ($(ls -1A "$DIST" | wc -l | tr -d ' ') fichiers, Galerie + Nouveautés, data.js durci)."

# Publication sur Cloudflare. wrangler.jsonc → assets.directory = "dist".
# OAuth déjà configuré (npx wrangler login) → non interactif en cron.
# MODE APERÇU LOCAL : `deploy-cloudflare.sh --build-only` (ou BUILD_ONLY=1) construit
# le dossier dist/ EXACTEMENT comme la version publiée (Sport/Publier masqués, data.js
# durci) mais NE déploie RIEN. Sert à tester sur le Mac avant de publier pour de vrai.
if [ "${1:-}" = "--build-only" ] || [ "${BUILD_ONLY:-}" = "1" ]; then
  echo "✓ build dist/ prêt (APERÇU LOCAL — rien n'a été publié)."
  echo "  Fichier à ouvrir : $DIST/index.html"
  exit 0
fi

echo "→ wrangler deploy…"
# --env="" cible l'environnement top-level (wrangler.jsonc définit plusieurs envs →
# sinon avertissement « no target environment specified »).
if npx --yes wrangler deploy --env=""; then
  echo "✓ déployé sur Cloudflare (agenda-grandnancy.fr)."
  exit 0
else
  echo "✗ échec wrangler deploy (auth ? réseau ?). data.js a tout de même été régénéré."
  exit 1
fi
