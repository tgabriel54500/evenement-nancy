// ============================================================================
// pro-gate.js — accès à l'onglet Pro.
//
// Trois paliers, du plus fermé au plus ouvert (PRO_PREVIEW ci-dessous) :
//   1. emails      : seuls les comptes listés voient l'onglet (aperçu privé) ;
//   2. anyAccount  : tout visiteur CONNECTÉ à un compte organisateur (compte.html)
//                    le voit, les autres tombent sur le message #pro-lock ;
//   3. open        : tout le monde, sans compte.
// Ce que le verrou fait :
//   - index / nouveautes / sport : l'onglet « 💼 Pro » (classe .pro-only, attribut
//     hidden) est révélé ;
//   - pro.html : la page reste masquée (<body class="pro-locked">, message
//     #pro-lock) tant que le visiteur n'est pas autorisé ;
//   - compte.html : le sélecteur Type (event / pro), #row-kind, n'apparaît que
//     pour les comptes autorisés, les autres publient en 'event'.
//
// Pour OUVRIR l'onglet à tout le monde : passer `open: true`, puis remettre
// pro.html dans le sitemap (deploy-cloudflare.sh). Rien d'autre.
//
// C'est un verrou d'affichage, pas une sécurité : data-pro.js reste téléchargeable
// par qui connaît l'adresse. Il sert à ne pas montrer l'onglet avant qu'il soit
// prêt, pas à protéger des données.
//
// À inclure APRÈS le client Supabase (CDN) et config-supabase.js, sur chaque
// page qui porte un lien ou un contenu Pro. Sans Supabase configuré : tout
// reste masqué.
// ============================================================================
window.PRO_PREVIEW = {
  open: false,                          // true = public, sans compte
  anyAccount: true,                     // true = tout compte organisateur connecté (depuis le 2026-09-30)
  emails: ["tristan@mirai-tech.fr"],    // toujours autorisés, même avec anyAccount: false
};

(function () {
  const P = window.PRO_PREVIEW;
  const allowedEmail = (email) => !!email && P.emails.map(e => e.toLowerCase()).includes(String(email).toLowerCase());

  function reveal() {
    document.querySelectorAll(".pro-only").forEach(el => { el.hidden = false; });
    document.body.classList.remove("pro-locked");
    const lock = document.getElementById("pro-lock");
    if (lock) lock.hidden = true;
    document.dispatchEvent(new CustomEvent("pro-gate:open"));
  }

  async function check() {
    if (P.open) return reveal();
    try {
      if (!window.supabase || !window.SUPABASE_URL || /TON-PROJET/.test(window.SUPABASE_URL)) return;
      const c = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const s = (await c.auth.getSession()).data.session;
      if (s && (P.anyAccount || allowedEmail(s.user && s.user.email))) reveal();
    } catch (_) { /* hors-ligne / non configuré : reste masqué */ }
  }

  if (document.readyState === "complete") check();
  else window.addEventListener("load", check);
})();
