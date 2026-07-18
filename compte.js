// ============================================================================
// compte.js — espace organisateur : connexion (lien magique), publication,
// édition, suppression et stats de clics. S'appuie sur Supabase (auth + DB +
// storage) et l'Edge Function moderate-event.
// ============================================================================
(function () {
  const cfgOK = window.SUPABASE_URL && !/TON-PROJET/.test(window.SUPABASE_URL);
  const sb = cfgOK ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => { el.hidden = !on; };
  const msg = (el, text, kind) => { el.textContent = text; el.className = "msg" + (kind ? " " + kind : ""); show(el, !!text); };

  if (!sb) {
    document.querySelector(".compte-main").innerHTML =
      '<section class="card-pane"><h2>Configuration requise</h2><p>Renseignez ' +
      '<code>config-supabase.js</code> (URL + anon key) pour activer les comptes.</p></section>';
    return;
  }

  // ---- Catégories (depuis data.js) ----
  // 'sport' est masquée : la feature sport est en pause (réactiver plus tard).
  const cats = (typeof CATEGORIES !== "undefined") ? CATEGORIES : {};
  const sel = $("ev-category");
  for (const [key, c] of Object.entries(cats)) {
    if (key === "sport") continue;
    const o = document.createElement("option");
    o.value = key; o.textContent = `${c.emoji || ""} ${c.label || key}`.trim();
    sel.appendChild(o);
  }

  // ---- Type d'entrée : feature sport EN PAUSE → tout est 'event' (culturel).
  // Le sélecteur Type a été retiré du formulaire. Pour réactiver le sport,
  // restaurer le <select id="ev-kind"> + la liste SPORTS + applyKind()
  // (voir l'historique git de compte.html / compte.js).
  function isSport() { return false; }
  function applyKind() {}

  // ---- Menu compte (icône en haut à droite, contient la déconnexion) ----
  (function () {
    const w = $("navAccount"), b = $("navMenuBtn"), m = $("navMenu");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      m.hidden = !m.hidden;
      b.setAttribute("aria-expanded", String(!m.hidden));
    });
    document.addEventListener("click", (e) => {
      if (!w.contains(e.target)) { m.hidden = true; b.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { m.hidden = true; b.setAttribute("aria-expanded", "false"); }
    });
  })();

  // ---- Auth ----
  async function refresh() {
    const { data: { session } } = await sb.auth.getSession();
    show($("navAccount"), !!session);
    $("menu-who").textContent = session ? session.user.email : "";
    if (session) {
      $("who").textContent = session.user.email;
      show($("auth"), false); show($("app"), true);
      loadMine();
    } else {
      show($("auth"), true); show($("app"), false);
      $("navMenu").hidden = true;
    }
  }
  sb.auth.onAuthStateChange(() => refresh());

  // Confort : l'email de connexion est mémorisé sur l'appareil (localStorage)
  // et pré-rempli aux visites suivantes.
  const EMAIL_KEY = "en-auth-email";
  try {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) $("auth-email").value = saved;
  } catch (_) { /* stockage indisponible (navigation privée) : tant pis */ }

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.href },
    });
    if (!error) { try { localStorage.setItem(EMAIL_KEY, email); } catch (_) {} }
    let text = "Lien envoyé ! Vérifiez votre boîte mail (et les spams).";
    if (error) {
      // "Failed to fetch" = serveur injoignable (projet Supabase en pause,
      // URL erronée ou pas de réseau) → message actionnable plutôt que cryptique.
      text = /fetch/i.test(error.message || "")
        ? "Serveur injoignable. Le projet Supabase est probablement en pause : ouvrez supabase.com/dashboard et cliquez « Restore project », puis réessayez."
        : "Erreur : " + error.message;
    }
    msg($("auth-msg"), text, error ? "err" : "ok");
  });

  $("logout").addEventListener("click", async () => { await sb.auth.signOut(); refresh(); });

  // ---- Onglets ----
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("is-active", x === t));
    show($("tab-publish"), t.dataset.tab === "publish");
    show($("tab-mine"), t.dataset.tab === "mine");
    if (t.dataset.tab === "mine") loadMine();
  }));

  // ---- Aperçu image ----
  let imageFile = null;
  $("ev-image").addEventListener("change", (e) => {
    imageFile = e.target.files[0] || null;
    if (imageFile) { $("ev-preview").src = URL.createObjectURL(imageFile); show($("ev-preview"), true); }
    else show($("ev-preview"), false);
  });

  // ---- Autocomplétion d'adresse (Base Adresse Nationale, gratuite, sans clé) ----
  // Suggestions dès 3 caractères, biaisées autour de Nancy. Choisir une
  // proposition remplit le lieu (numéro + voie) et la ville → vraies adresses.
  (function () {
    const input = $("ev-place"), box = $("ac-place");
    let timer = null, ctrl = null;
    function hide() { box.hidden = true; box.innerHTML = ""; }
    async function search(q) {
      try {
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        const url = "https://api-adresse.data.gouv.fr/search/?limit=6&lat=48.6921&lon=6.1844&q=" + encodeURIComponent(q);
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) return hide();
        const feats = ((await r.json()).features || []);
        if (!feats.length) return hide();
        box.innerHTML = "";
        for (const f of feats) {
          const p = f.properties || {};
          const it = document.createElement("button");
          it.type = "button";
          it.className = "ac-item";
          it.innerHTML = "<strong></strong><span></span>";
          it.querySelector("strong").textContent = p.name || p.label || "";
          it.querySelector("span").textContent = [p.postcode, p.city].filter(Boolean).join(" ");
          it.addEventListener("mousedown", (e) => {   // mousedown : passe avant le blur
            e.preventDefault();
            input.value = p.name || p.label || "";
            if (p.city) $("ev-city").value = p.city;
            hide();
          });
          box.appendChild(it);
        }
        box.hidden = false;
      } catch (_) { /* réseau coupé ou requête annulée : silencieux */ }
    }
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) return hide();
      timer = setTimeout(() => search(q), 250);
    });
    input.addEventListener("blur", () => setTimeout(hide, 150));
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  })();

  // ---- Zone couverte : la ville doit être à moins de 30 km de Nancy ----
  // Géocodage BAN (biais Nancy pour les homonymes). true/false, ou null si
  // ville introuvable / API injoignable → on laisse passer (bénéfice du doute,
  // le filtre géographique de update-events.js et la modération veillent).
  async function cityWithin30km(city) {
    if (!city) return null;
    try {
      const r = await fetch("https://api-adresse.data.gouv.fr/search/?type=municipality&limit=1&lat=48.6921&lon=6.1844&q=" + encodeURIComponent(city));
      if (!r.ok) return null;
      const f = ((await r.json()).features || [])[0];
      if (!f || !f.geometry) return null;
      const [lon, lat] = f.geometry.coordinates;
      const rad = (x) => x * Math.PI / 180;
      const s = Math.sin(rad(lat - 48.6921) / 2) ** 2 +
        Math.cos(rad(48.6921)) * Math.cos(rad(lat)) * Math.sin(rad(lon - 6.1844) / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(s)) <= 30;
    } catch (_) { return null; }
  }

  // ---- Validation + anti-doublon ----
  // Aujourd'hui en ISO local (pour interdire les dates passées).
  const TODAY = (() => { const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  $("ev-date").min = TODAY;

  // Titre normalisé : minuscules, sans accents ni ponctuation, espaces réduits.
  const normTitle = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  // Deux périodes [aStart,aEnd] et [bStart,bEnd] se chevauchent (ISO comparables).
  const overlaps = (aS, aE, bS, bE) => aS <= (bE || bS) && bS <= (aE || aS);

  // Cherche un doublon (même titre + dates qui se chevauchent) dans :
  // 1) l'agenda du site (EVENTS de data.js), 2) les events soumis (approuvés
  // pour tous + les siens en attente, via RLS). Renvoie null ou une description.
  async function findDuplicate(title, date, endDate, excludeId) {
    const key = normTitle(title);
    if (!key || !date) return null;
    const site = (typeof EVENTS !== "undefined" ? EVENTS : []).find((ev) =>
      normTitle(ev.title) === key && overlaps(date, endDate, ev.date, ev.endDate));
    if (site) return { title: site.title, date: site.date, where: "l'agenda du site" };
    const { data, error } = await sb.from("user_events")
      .select("id,title,date,end_date,status").eq("kind", "event").neq("status", "rejected");
    if (error) return null; // le garde-fou SQL prendra le relais
    const dup = (data || []).find((r) => r.id !== excludeId
      && normTitle(r.title) === key
      && overlaps(date, endDate, String(r.date).slice(0, 10), r.end_date ? String(r.end_date).slice(0, 10) : null));
    if (dup) return { title: dup.title, date: String(dup.date).slice(0, 10),
      where: dup.status === "approved" ? "l'agenda" : "les soumissions en cours de vérification" };
    return null;
  }

  // ---- Soumission (création ou édition) ----
  $("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("ev-submit"); btn.disabled = true;
    msg($("ev-msg"), "Envoi…");
    try {
      const { data: { user } } = await sb.auth.getUser();
      const id = $("ev-id").value;

      const sport = isSport();

      // Champs obligatoires + cohérence (en plus des `required` HTML).
      const title = $("ev-title").value.trim();
      const date = $("ev-date").value;
      const endDate = $("ev-end").value || null;
      if (!title) throw new Error("Le titre est obligatoire.");
      if (!date) throw new Error("La date de début est obligatoire.");
      if (date < TODAY) throw new Error("La date de début est déjà passée.");
      if (endDate && endDate < date) throw new Error("La date de fin est antérieure à la date de début.");
      if (!$("ev-place").value.trim()) throw new Error("Le lieu est obligatoire.");
      if (!$("ev-city").value.trim()) throw new Error("La ville est obligatoire.");
      if (!sport && !$("ev-desc").value.trim()) throw new Error("La description est obligatoire.");
      if (imageFile) {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(imageFile.type)) throw new Error("Image JPG, PNG, WebP ou GIF uniquement.");
        if (imageFile.size > 5 * 1024 * 1024) throw new Error("Image trop lourde (5 Mo max).");
      }

      // Lien « Plus d'infos » : le https:// est optionnel à la saisie.
      let url = $("ev-url").value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      if (url && !/^https?:\/\/[^\s]+\.[^\s]{2,}$/i.test(url)) {
        throw new Error("Lien invalide. Exemple attendu : votre-site.fr");
      }

      // Horaire : construit depuis les sélecteurs d'heure ("20h30" ou "14h00–18h00").
      const t2fr = (t) => (t ? t.replace(":", "h") : "");
      const schedule = t2fr($("ev-time-start").value) +
        ($("ev-time-end").value ? "–" + t2fr($("ev-time-end").value) : "");
      if (!$("ev-time-start").value && $("ev-time-end").value) {
        throw new Error("Heure de fin renseignée sans heure de début.");
      }

      // Zone couverte : agenda limité à ~30 km autour de Nancy.
      if (await cityWithin30km($("ev-city").value.trim()) === false) {
        throw new Error("Zone non couverte : cet agenda liste les événements à moins de 30 km de Nancy.");
      }

      // Anti-doublon : bloque si un événement au même titre existe déjà sur
      // des dates qui se chevauchent (agenda du site ou soumissions).
      const dup = await findDuplicate(title, date, endDate, id || null);
      if (dup) throw new Error(`Doublon : « ${dup.title} » figure déjà dans ${dup.where} le ${dup.date}. Publication refusée.`);

      let imageUrl = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop().toLowerCase();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const up = await sb.storage.from("event-images").upload(path, imageFile, { upsert: false });
        if (up.error) throw up.error;
        imageUrl = sb.storage.from("event-images").getPublicUrl(path).data.publicUrl;
      } else if (!id && !sport) {
        throw new Error("Une image est requise.");
      }

      const row = {
        kind: "event",                            // feature sport en pause
        title,
        category: $("ev-category").value,
        description: $("ev-desc").value.trim(),
        date,
        end_date: endDate,
        schedule: schedule || null,
        place: $("ev-place").value.trim(),
        city: $("ev-city").value.trim(),
        free: $("ev-free").checked,
        reservation: $("ev-resa").checked,
        url: url || null,
      };
      if (imageUrl) row.image = imageUrl;

      let savedId = id;
      if (id) {
        const { error } = await sb.from("user_events").update(row).eq("id", id);
        if (error) throw error;
      } else {
        row.user_id = user.id;
        const { data, error } = await sb.from("user_events").insert(row).select("id").single();
        if (error) throw error;
        savedId = data.id;
      }

      // Lance la modération IA (asynchrone côté serveur).
      await sb.functions.invoke("moderate-event", { body: { id: savedId } });

      msg($("ev-msg"), "Envoyé ! Vérification en cours, voir « Mes événements ».", "ok");
      resetForm();
      loadMine();
    } catch (err) {
      msg($("ev-msg"), "Erreur : " + (err.message || err), "err");
    } finally {
      btn.disabled = false;
    }
  });

  $("ev-cancel").addEventListener("click", resetForm);

  function resetForm() {
    $("event-form").reset();
    $("ev-id").value = ""; imageFile = null;
    show($("ev-preview"), false);
    $("ev-submit").textContent = "Publier";
    show($("ev-cancel"), false);
    applyKind();
  }

  // ---- Mes événements ----
  // Date ISO → format français lisible ("12 août 2026").
  const frDate = (d) => {
    if (!d) return "";
    const dt = new Date(String(d).slice(0, 10) + "T12:00:00");
    return isNaN(dt) ? String(d) : dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  };

  const STATUS = {
    pending:  { label: "⏳ En vérification", cls: "st-pending" },
    approved: { label: "✅ En ligne",        cls: "st-ok" },
    rejected: { label: "⛔ Refusé",          cls: "st-no" },
  };

  async function loadMine() {
    const { data, error } = await sb.from("user_events")
      .select("*").order("created_at", { ascending: false });
    const list = $("mine-list"); list.innerHTML = "";
    if (error) { msg($("mine-empty"), "Erreur : " + error.message, "err"); return; }
    show($("mine-empty"), !data.length);
    if (!data.length) { $("mine-empty").textContent = "Aucun événement pour l'instant."; return; }

    for (const r of data) {
      const st = STATUS[r.status] || STATUS.pending;
      const li = document.createElement("li");
      li.className = "mine-item";
      li.innerHTML = `
        <img src="${r.image}" alt="" class="mine-thumb" loading="lazy">
        <div class="mine-body">
          <strong>${escapeHtml(r.title)}</strong>
          <span class="badge ${st.cls}">${st.label}</span>
          <div class="mine-meta">${escapeHtml(frDate(r.date))}${r.end_date ? " → " + escapeHtml(frDate(r.end_date)) : ""} · ${escapeHtml(r.place || "")} ${escapeHtml(r.city || "")}</div>
          ${r.status === "rejected" && r.moderation_reason ? `<div class="mine-reason">Motif : ${escapeHtml(r.moderation_reason)}</div>` : ""}
          <div class="mine-stats">👁️ ${r.click_count} ouverture${r.click_count > 1 ? "s" : ""} de fiche</div>
          <div class="mine-actions">
            <button class="btn-ghost" data-edit="${r.id}">Éditer</button>
            <button class="btn-ghost danger" data-del="${r.id}">Supprimer</button>
          </div>
        </div>`;
      list.appendChild(li);
    }

    list.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => edit(data.find((x) => x.id === b.dataset.edit))));
    list.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => del(b.dataset.del)));
  }

  function edit(r) {
    $("ev-id").value = r.id;
    $("ev-category").value = r.category;
    $("ev-title").value = r.title;
    $("ev-desc").value = r.description;
    $("ev-date").value = (r.date || "").slice(0, 10);
    $("ev-end").value = r.end_date ? r.end_date.slice(0, 10) : "";
    // Horaire "20h30" ou "14h–18h00" → sélecteurs d'heure.
    const fr2t = (s) => { const m = String(s).match(/(\d{1,2})h(\d{2})?/);
      return m ? m[1].padStart(2, "0") + ":" + (m[2] || "00") : ""; };
    const times = String(r.schedule || "").match(/\d{1,2}h\d{0,2}/g) || [];
    $("ev-time-start").value = times[0] ? fr2t(times[0]) : "";
    $("ev-time-end").value = times[1] ? fr2t(times[1]) : "";
    $("ev-place").value = r.place || "";
    $("ev-city").value = r.city || "";
    $("ev-url").value = r.url || "";
    $("ev-free").checked = !!r.free;
    $("ev-resa").checked = !!r.reservation;
    $("ev-preview").src = r.image; show($("ev-preview"), true);
    imageFile = null;
    $("ev-submit").textContent = "Enregistrer (re-vérification)";
    show($("ev-cancel"), true);
    document.querySelector('.tab[data-tab="publish"]').click();
    msg($("ev-msg"), "Édition — laissez l'image vide pour garder l'actuelle.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function del(id) {
    if (!confirm("Supprimer cet événement ? Action définitive.")) return;
    const { error } = await sb.from("user_events").delete().eq("id", id);
    if (error) alert("Erreur : " + error.message); else loadMine();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  refresh();
})();
