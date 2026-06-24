// ============================================================================
// user-events.js — pont entre Supabase et le site public.
// Charge les événements approuvés soumis par les utilisateurs et les mappe vers
// le schéma EVENTS du site (galerie.js / app.js), puis fournit le comptage de
// clics (ouverture de fiche).
//
// Inclure AVANT galerie.js / app.js, après config-supabase.js et le client
// Supabase CDN. Tout est optionnel : si Supabase n'est pas configuré, les
// fonctions renvoient [] / ne font rien (le site statique marche sans).
// ============================================================================
(function () {
  let _client = null;
  function client() {
    if (_client) return _client;
    if (!window.supabase || !window.SUPABASE_URL || /TON-PROJET/.test(window.SUPABASE_URL)) return null;
    _client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return _client;
  }

  // Mappe une ligne user_events vers une carte EVENTS du site.
  function toEvent(r) {
    const iso = (d) => (d ? String(d).slice(0, 10) : "");
    return {
      uuid: "ue-" + r.id,
      title: r.title,
      category: r.category,
      subcats: [],
      date: iso(r.date),
      endDate: r.end_date ? iso(r.end_date) : "",
      dateText: "",
      schedule: r.schedule || "",
      place: r.place || "",
      city: r.city || "",
      free: !!r.free,
      reservation: !!r.reservation,
      image: r.image || null,
      url: r.url || "",
      source: "user",
      addedAt: iso(r.created_at),
      _userEventId: r.id,   // sert au comptage de clics
    };
  }

  // Renvoie les events approuvés (kind 'event' par défaut) prêts à fusionner.
  window.loadApprovedUserEvents = async function (kind = "event") {
    const c = client();
    if (!c) return [];
    try {
      const { data, error } = await c
        .from("user_events")
        .select("*")
        .eq("status", "approved")
        .eq("kind", kind);
      if (error) { console.warn("user-events:", error.message); return []; }
      return (data || []).map(toEvent);
    } catch (e) { console.warn("user-events:", e); return []; }
  };

  // Incrémente le compteur de clics (ouverture de fiche). Silencieux.
  window.trackUserEventClick = function (ev) {
    const c = client();
    if (!c || !ev || !ev._userEventId) return;
    c.rpc("increment_event_click", { p_id: ev._userEventId }).then(() => {}, () => {});
  };
})();
