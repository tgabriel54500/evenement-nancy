#!/bin/bash
#
# refresh-all.sh — régénération quotidienne du data.js (mode hors-ligne).
# Lancé par le LaunchAgent com.evenement-nancy.refresh (tous les jours à 05h00)
# OU manuellement: bash refresh-all.sh
#
# Lance séquentiellement les scrapers (un échec n'arrête pas les autres),
# l'import iCal si des .ics sont présents, puis update-events.js qui fusionne
# tout et réécrit data.js. Chaque étape est journalisée dans refresh.log.

# --- Chemins absolus (launchd n'hérite PAS du PATH du shell interactif) ---
PROJECT_DIR="/Users/tristan/Documents/Événement Nancy"
NODE_BIN="/Users/tristan/.nvm/versions/node/v24.14.0/bin/node"
NODE_DIR="/Users/tristan/.nvm/versions/node/v24.14.0/bin"
export PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG="$PROJECT_DIR/refresh.log"
ICS_DIR="$PROJECT_DIR/ics-est-republicain"

cd "$PROJECT_DIR" || { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERREUR: cd vers $PROJECT_DIR impossible" >> "$LOG"; exit 1; }

# --- Rotation simple du log: si > 500 Ko, on repart d'un fichier neuf ---
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 512000 ]; then
  tail -n 200 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Exécute une commande node sur un script donné, tolère l'échec.
# $1 = fichier script
run_step() {
  local script="$1"
  if [ ! -f "$PROJECT_DIR/$script" ]; then
    log "SKIP  $script (fichier absent)"
    return 0
  fi
  log "START $script"
  if "$NODE_BIN" "$script" >> "$LOG" 2>&1; then
    log "OK    $script"
  else
    log "FAIL  $script (code $?) — on continue"
  fi
}

log "===== DEBUT refresh-all (node $("$NODE_BIN" --version 2>/dev/null)) ====="

# --- 1. Les 7 scrapers, séquentiels, chacun protégé ---
for s in \
  destination-nancy.js \
  curieux-net.js \
  vandoeuvre.js \
  villers-les-nancy.js \
  alentoor.js \
  ici-c-nancy.js \
  zenith-nancy.js \
  poirel.js
do
  run_step "$s"
done

# --- 2. Import iCal: seulement si des .ics sont réellement présents ---
if [ -d "$ICS_DIR" ] && ls "$ICS_DIR"/*.ics >/dev/null 2>&1; then
  run_step "import-ics.js"
else
  log "SKIP  import-ics.js (aucun .ics dans ics-est-republicain/)"
fi

# --- 3. Fusion + réécriture de data.js (TOUJOURS, même si des scrapers ont échoué) ---
run_step "update-events.js"

# --- 4. Publication du site statique sur Netlify (sauté proprement si non configuré) ---
if [ -f "$PROJECT_DIR/deploy-site.sh" ]; then
  log "START deploy-site.sh"
  if bash "$PROJECT_DIR/deploy-site.sh" >> "$LOG" 2>&1; then
    log "OK    deploy-site.sh"
  else
    log "FAIL  deploy-site.sh (code $?) — data.js a tout de même été régénéré"
  fi
fi

log "===== FIN refresh-all ====="
log ""
