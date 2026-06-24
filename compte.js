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
  const cats = (typeof CATEGORIES !== "undefined") ? CATEGORIES : {};
  const sel = $("ev-category");
  for (const [key, c] of Object.entries(cats)) {
    const o = document.createElement("option");
    o.value = key; o.textContent = `${c.emoji || ""} ${c.label || key}`.trim();
    sel.appendChild(o);
  }

  // ---- Sport (clubs amateurs) : liste + bascule de mode ----
  const SPORTS = ["Football", "Basketball", "Handball", "Volleyball", "Rugby", "Tennis",
    "Hockey sur glace", "Natation", "Athlétisme", "Judo", "Boxe", "Gymnastique",
    "Badminton", "Tennis de table", "Cyclisme", "Autre"];
  for (const s of SPORTS) {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; $("ev-sport").appendChild(o);
  }
  function isSport() { return $("ev-kind").value === "sport"; }
  function applyKind() {
    const sport = isSport();
    show($("row-category"), !sport); $("ev-category").required = !sport;
    show($("row-sport"), sport);     $("ev-sport").required = sport;
    show($("row-sportextra"), sport);
    $("ev-desc").required = !sport;
    $("row-image").firstChild.textContent = sport ? "Affiche / image " : "Affiche / image * ";
  }
  $("ev-kind").addEventListener("change", applyKind);
  applyKind();

  // ---- Auth ----
  async function refresh() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      $("who").textContent = session.user.email;
      show($("auth"), false); show($("app"), true);
      loadMine();
    } else {
      show($("auth"), true); show($("app"), false);
    }
  }
  sb.auth.onAuthStateChange(() => refresh());

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.href },
    });
    msg($("auth-msg"), error ? "Erreur : " + error.message : "Lien envoyé ! Vérifiez votre boîte mail.", error ? "err" : "ok");
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

  // ---- Soumission (création ou édition) ----
  $("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("ev-submit"); btn.disabled = true;
    msg($("ev-msg"), "Envoi…");
    try {
      const { data: { user } } = await sb.auth.getUser();
      const id = $("ev-id").value;

      const sport = isSport();

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
        kind: sport ? "sport" : "event",
        title: $("ev-title").value.trim(),
        // category est NOT NULL : 'sport' pour les entrées sportives.
        category: sport ? "sport" : $("ev-category").value,
        description: $("ev-desc").value.trim(),   // peut être vide en sport
        date: $("ev-date").value,
        end_date: $("ev-end").value || null,
        schedule: $("ev-schedule").value.trim() || null,
        place: $("ev-place").value.trim(),
        city: $("ev-city").value.trim(),
        free: $("ev-free").checked,
        reservation: $("ev-resa").checked,
        url: $("ev-url").value.trim() || null,
        sport: sport ? $("ev-sport").value : null,
        division: sport ? ($("ev-division").value.trim() || null) : null,
        age_category: sport ? ($("ev-age").value.trim() || null) : null,
        opponent: sport ? ($("ev-opponent").value.trim() || null) : null,
      };
      if (imageUrl) row.image = imageUrl;
      else if (!id && sport) row.image = "";   // sport sans affiche (image NOT NULL)

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
          <div class="mine-meta">${escapeHtml(r.date)}${r.end_date ? " → " + escapeHtml(r.end_date) : ""} · ${escapeHtml(r.place || "")} ${escapeHtml(r.city || "")}</div>
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
    $("ev-kind").value = r.kind || "event";
    applyKind();
    if (r.kind === "sport") {
      $("ev-sport").value = r.sport || "Autre";
      $("ev-division").value = r.division || "";
      $("ev-age").value = r.age_category || "";
      $("ev-opponent").value = r.opponent || "";
    } else {
      $("ev-category").value = r.category;
    }
    $("ev-title").value = r.title;
    $("ev-desc").value = r.description;
    $("ev-date").value = (r.date || "").slice(0, 10);
    $("ev-end").value = r.end_date ? r.end_date.slice(0, 10) : "";
    $("ev-schedule").value = r.schedule || "";
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
