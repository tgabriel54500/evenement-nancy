// Chargement DIFFÉRÉ du client Supabase (2026-10-25).
// Avant, la bibliothèque (≈ 120 Ko, servie par cdn.jsdelivr.net) était chargée
// en bloquant : la galerie attendait ce téléchargement avant de s'afficher, ce
// qui rendait l'appli lente sur téléphone. Elle n'est utile qu'aux événements
// proposés par les organisateurs et au menu « compte » : on la charge une fois
// la page affichée. Les scripts qui s'en servent attendent window.supabaseReady.
(function () {
  if (window.supabaseReady) return;
  window.supabaseReady = new Promise(function (resolve) {
    function load() {
      if (window.supabase) return resolve(window.supabase);
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.async = true;
      s.onload = function () { resolve(window.supabase || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
      setTimeout(function () { resolve(window.supabase || null); }, 20000);
    }
    if (document.readyState === "complete") setTimeout(load, 0);
    else window.addEventListener("load", function () { setTimeout(load, 0); });
  });
})();
