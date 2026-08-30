/* "Ajouter a l'ecran d'accueil" (PWA).
   - Enregistre sw.js (indispensable pour que Chrome/Android propose l'install).
   - Ajoute une entree dans le menu burger (#navMenu).
   - Affiche un bandeau discret en bas, refermable et memorise.
   - Android / Chrome / Edge : vrai bouton en 1 clic (beforeinstallprompt).
   - iOS Safari : pas d'API possible, on affiche la marche a suivre (Partager
     puis "Sur l'ecran d'accueil").
   Ne s'affiche jamais si le site est deja lance depuis l'ecran d'accueil. */

(function () {
  'use strict';

  var HIDE_KEY = 'a2hs-hidden-until';
  var LABEL = "Ajouter à l'écran d'accueil";
  var deferred = null;
  var banner = null;

  function installed() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Sur iOS, seul Safari sait installer (Chrome/Firefox iOS ne proposent rien).
  var isIOSSafari = isIOS && !/crios|fxios|edgios|opt\//i.test(ua);

  function snoozed() {
    try {
      var t = parseInt(localStorage.getItem(HIDE_KEY) || '0', 10);
      return t > Date.now();
    } catch (e) { return false; }
  }
  function snooze(days) {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + days * 864e5)); } catch (e) {}
  }

  /* ---------- 1. service worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  /* ---------- 2. feuille iOS (marche a suivre) ---------- */
  function iosSheet() {
    var w = document.createElement('div');
    w.className = 'a2hs-sheet';
    w.innerHTML =
      '<div class="a2hs-sheet__box" role="dialog" aria-modal="true" aria-label="' + LABEL + '">' +
        '<button class="a2hs-sheet__x" aria-label="Fermer">&times;</button>' +
        '<p class="a2hs-sheet__title">Ajouter l’agenda à votre écran d’accueil</p>' +
        '<ol class="a2hs-sheet__steps">' +
          '<li>Touchez <span class="a2hs-sheet__ico">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 3l-4 4M12 3l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
          '</span> Partager, en bas de Safari.</li>' +
          '<li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li>' +
          '<li>Validez avec <strong>Ajouter</strong>.</li>' +
        '</ol>' +
        (isIOSSafari ? '' : '<p class="a2hs-sheet__note">Ouvrez d’abord agenda-grandnancy.fr dans <strong>Safari</strong> : les autres navigateurs iPhone ne savent pas créer ce raccourci.</p>') +
      '</div>';
    function close() { w.remove(); }
    w.addEventListener('click', function (ev) {
      if (ev.target === w || ev.target.classList.contains('a2hs-sheet__x')) close();
    });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(w);
  }

  /* ---------- 3. action commune ---------- */
  function addToHome() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') { snooze(3650); hideBanner(); }
        else { snooze(30); hideBanner(); }
        deferred = null;
      });
      return;
    }
    iosSheet();
  }

  /* ---------- 4. entree dans le menu burger ---------- */
  function addMenuEntry() {
    var menu = document.getElementById('navMenu');
    if (!menu || document.getElementById('menu-a2hs')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'menu-a2hs';
    b.className = 'nav-menu__link nav-menu__btn';
    b.textContent = '📲 ' + LABEL;
    b.addEventListener('click', function () {
      menu.hidden = true;
      var btn = document.getElementById('navMenuBtn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      addToHome();
    });
    menu.insertBefore(b, menu.firstChild);
  }

  /* ---------- 5. bandeau bas de page ---------- */
  function showBanner() {
    if (banner || snoozed()) return;
    banner = document.createElement('div');
    banner.className = 'a2hs';
    banner.innerHTML =
      '<img class="a2hs__icon" src="logo.svg" alt="" width="40" height="40">' +
      '<div class="a2hs__txt">' +
        '<strong>L’agenda sur votre écran d’accueil</strong>' +
        '<span>Toutes les sorties du Grand Nancy en un tap.</span>' +
      '</div>' +
      '<button type="button" class="a2hs__cta">Ajouter</button>' +
      '<button type="button" class="a2hs__x" aria-label="Fermer">&times;</button>';
    banner.querySelector('.a2hs__cta').addEventListener('click', addToHome);
    banner.querySelector('.a2hs__x').addEventListener('click', function () {
      snooze(45); hideBanner();
    });
    document.body.appendChild(banner);
    document.body.classList.add('has-a2hs');
    requestAnimationFrame(function () {
      banner.classList.add('is-in');
      // hauteur reelle du bandeau : le bouton WhatsApp flottant s'en sert pour remonter.
      document.body.style.setProperty('--a2hs-h', banner.offsetHeight + 'px');
    });
  }
  function hideBanner() {
    if (!banner) return;
    banner.remove();
    banner = null;
    document.body.classList.remove('has-a2hs');
    document.body.style.removeProperty('--a2hs-h');
  }

  /* ---------- 6. orchestration ---------- */
  function start() {
    if (installed()) return;
    if (deferred || isIOS) {
      addMenuEntry();
      setTimeout(showBanner, 4000);
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (!installed()) { addMenuEntry(); setTimeout(showBanner, 4000); }
  });

  window.addEventListener('appinstalled', function () {
    snooze(3650);
    hideBanner();
    var m = document.getElementById('menu-a2hs');
    if (m) m.remove();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
