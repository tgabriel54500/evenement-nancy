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

  // ---- Catégories : celles de data.js pour la culture, PRO_CATEGORIES
  // (pro-categories.js) pour les rendez-vous pro. 'sport' reste masquée : la
  // feature sport est en pause (réactiver plus tard).
  const CATS = {
    event: (typeof CATEGORIES !== "undefined") ? CATEGORIES : {},
    pro: (typeof PRO_CATEGORIES !== "undefined") ? PRO_CATEGORIES : {},
  };
  const sel = $("ev-category");
  function fillCategories(kind) {
    const keep = sel.value;
    sel.innerHTML = "";
    for (const [key, c] of Object.entries(CATS[kind] || {})) {
      if (key === "sport") continue;
      const o = document.createElement("option");
      o.value = key; o.textContent = `${c.emoji || ""} ${c.label || key}`.trim();
      sel.appendChild(o);
    }
    if (keep && CATS[kind] && CATS[kind][keep]) sel.value = keep;
  }

  // ---- Type d'entrée : 'event' (culture) ou 'pro' (onglet Pro). La feature
  // sport (kind='sport') est EN PAUSE : pas d'option, isSport() reste faux.
  function isSport() { return false; }
  function kind() { return $("ev-kind").value === "pro" ? "pro" : "event"; }
  function isPro() { return kind() === "pro"; }
  function applyKind() {
    const pro = isPro();
    fillCategories(kind());
    show($("row-pro"), pro);
    // Image facultative pour un rendez-vous pro : sans image, la vignette
    // affiche le titre sur un fond uni (comme sur l'onglet Pro).
    $("image-req").hidden = pro;
    $("image-hint").textContent = pro ? ", facultatif" : "";
    if (typeof renderApercu === "function") renderApercu();
  }
  $("ev-kind").addEventListener("change", applyKind);
  applyKind();

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
  // Trois façons d'entrer : email + mot de passe (par défaut, le téléphone
  // enregistre et pré-remplit), lien magique (ancienne méthode, conservée) et
  // réinitialisation du mot de passe. La session est conservée sur l'appareil
  // par supabase-js : on reste connecté d'une visite à l'autre.
  let recovering = false;   // arrivée par un lien « mot de passe oublié »

  async function refresh() {
    const { data: { session } } = await sb.auth.getSession();
    show($("navAccount"), !!session);
    $("menu-who").textContent = session ? session.user.email : "";
    if (session && recovering) {
      show($("auth"), false); show($("app"), false); show($("reset"), true);
      return;
    }
    show($("reset"), false);
    if (session) {
      $("who").textContent = session.user.email;
      show($("auth"), false); show($("app"), true);
      loadMine();
    } else {
      show($("auth"), true); show($("app"), false);
      $("navMenu").hidden = true;
    }
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recovering = true;
    refresh();
  });

  // Confort : l'email est mémorisé sur l'appareil (localStorage) et pré-rempli
  // dans tous les formulaires aux visites suivantes.
  const EMAIL_KEY = "en-auth-email";
  const EMAIL_FIELDS = ["signin-email", "signup-email", "auth-email", "forgot-email"];
  try {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) EMAIL_FIELDS.forEach((id) => { if (!$(id).value) $(id).value = saved; });
  } catch (_) { /* stockage indisponible (navigation privée) : tant pis */ }
  const rememberEmail = (email) => { try { localStorage.setItem(EMAIL_KEY, email); } catch (_) {} };
  // L'email tapé dans un formulaire suit dans les autres.
  EMAIL_FIELDS.forEach((id) => $(id).addEventListener("input", () => {
    EMAIL_FIELDS.forEach((o) => { if (o !== id) $(o).value = $(id).value; });
  }));

  // Message d'erreur lisible (Supabase répond en anglais).
  function authError(error) {
    const m = String(error && error.message || "");
    if (/fetch/i.test(m)) return "Serveur injoignable. Le projet Supabase est probablement en pause : ouvrez supabase.com/dashboard et cliquez « Restore project », puis réessayez.";
    if (/invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
    if (/email not confirmed/i.test(m)) return "Votre email n'est pas encore confirmé : ouvrez le message reçu à l'inscription (vérifiez les spams).";
    if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet email : connectez-vous, ou utilisez « Mot de passe oublié ».";
    if (/password should be at least|weak password|password/i.test(m)) return "Mot de passe trop faible : 8 caractères minimum.";
    if (/rate limit|too many/i.test(m)) return "Trop de tentatives, réessayez dans quelques minutes.";
    return "Erreur : " + m;
  }

  // Panneaux : signin / signup / magic / forgot.
  const PANES = { signin: "signin-form", signup: "signup-form", magic: "auth-form", forgot: "forgot-form" };
  function showPane(key) {
    Object.entries(PANES).forEach(([k, id]) => show($(id), k === key));
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.auth === key));
    show($("auth-msg"), false);
  }
  document.querySelectorAll(".auth-tab").forEach((t) => t.addEventListener("click", () => showPane(t.dataset.auth)));
  $("to-signin").addEventListener("click", (e) => { e.preventDefault(); showPane("signin"); });
  $("to-signin-2").addEventListener("click", (e) => { e.preventDefault(); showPane("signin"); });
  $("to-signin-3").addEventListener("click", (e) => { e.preventDefault(); showPane("signin"); });
  $("magic-link").addEventListener("click", (e) => { e.preventDefault(); showPane("magic"); });
  $("forgot-link").addEventListener("click", (e) => { e.preventDefault(); showPane("forgot"); });

  // Connexion par mot de passe.
  $("signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    const email = $("signin-email").value.trim(), password = $("signin-password").value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) return msg($("auth-msg"), authError(error), "err");
    rememberEmail(email);
    msg($("auth-msg"), "Connecté.", "ok");
  });

  // Création de compte : mot de passe + confirmation. Selon le réglage Supabase
  // (« Confirm email »), soit la session s'ouvre tout de suite, soit un email de
  // confirmation part et il faut cliquer dedans avant de pouvoir se connecter.
  $("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("signup-email").value.trim();
    const p1 = $("signup-password").value, p2 = $("signup-password2").value;
    if (p1.length < 8) return msg($("auth-msg"), "Mot de passe trop court : 8 caractères minimum.", "err");
    if (p1 !== p2) return msg($("auth-msg"), "Les deux mots de passe ne sont pas identiques.", "err");
    const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    const { data, error } = await sb.auth.signUp({ email, password: p1, options: { emailRedirectTo: location.href } });
    btn.disabled = false;
    if (error) return msg($("auth-msg"), authError(error), "err");
    rememberEmail(email);
    // Email déjà inscrit : Supabase renvoie un utilisateur « fantôme » sans identité
    // (pour ne pas révéler qui est inscrit). On oriente vers la connexion.
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      showPane("signin");
      return msg($("auth-msg"), "Un compte existe déjà avec cet email : connectez-vous, ou utilisez « Mot de passe oublié ».", "err");
    }
    if (data && data.session) return msg($("auth-msg"), "Compte créé, vous êtes connecté.", "ok");
    showPane("signin");
    msg($("auth-msg"), "Compte créé ! Un email de confirmation vient de partir : cliquez sur le lien qu'il contient, puis connectez-vous ici avec votre mot de passe.", "ok");
  });

  // Lien magique (sans mot de passe).
  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.href },
    });
    if (!error) rememberEmail(email);
    msg($("auth-msg"), error ? authError(error) : "Lien envoyé ! Vérifiez votre boîte mail (et les spams).", error ? "err" : "ok");
  });

  // Mot de passe oublié : Supabase envoie un lien qui ramène ici avec un jeton de
  // récupération ; onAuthStateChange reçoit PASSWORD_RECOVERY et refresh()
  // affiche le formulaire « Nouveau mot de passe ».
  $("forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("forgot-email").value.trim();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (!error) rememberEmail(email);
    msg($("auth-msg"), error ? authError(error) : "Email envoyé : ouvrez le lien qu'il contient pour choisir un nouveau mot de passe.", error ? "err" : "ok");
  });

  $("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = $("reset-password").value, p2 = $("reset-password2").value;
    if (p1.length < 8) return msg($("reset-msg"), "Mot de passe trop court : 8 caractères minimum.", "err");
    if (p1 !== p2) return msg($("reset-msg"), "Les deux mots de passe ne sont pas identiques.", "err");
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) return msg($("reset-msg"), authError(error), "err");
    recovering = false;
    msg($("reset-msg"), "Mot de passe enregistré.", "ok");
    setTimeout(refresh, 600);
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
    apercuImageURL = imageFile ? $("ev-preview").src : "";
    renderApercu();
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
  async function cityWithinKm(city, km) {
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
      return 2 * 6371 * Math.asin(Math.sqrt(s)) <= km;
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
    // L'agenda du site (data.js) ne concerne que la culture : un événement pro
    // n'y est jamais comparé (les doublons pro sont cherchés dans user_events).
    const site = isPro() ? null : (typeof EVENTS !== "undefined" ? EVENTS : []).find((ev) =>
      normTitle(ev.title) === key && overlaps(date, endDate, ev.date, ev.endDate));
    if (site) return { title: site.title, date: site.date, where: "l'agenda du site" };
    const { data, error } = await sb.from("user_events")
      .select("id,title,date,end_date,status").eq("kind", kind()).neq("status", "rejected");
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
      // Rendez-vous pro : Nancy et ses communes voisines seulement (5 km).
      const rayon = isPro() ? 5 : 30;
      if (await cityWithinKm($("ev-city").value.trim(), rayon) === false) {
        throw new Error(`Zone non couverte : ${isPro() ? "l'onglet Pro liste les rendez-vous à moins de 5 km de Nancy" : "cet agenda liste les événements à moins de 30 km de Nancy"}.`);
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
      } else if (!id && !sport && !isPro()) {
        throw new Error("Une image est requise.");
      }

      const row = {
        kind: kind(),                             // 'event' ou 'pro' (sport en pause)
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
        organizer: isPro() ? ($("ev-organizer").value.trim() || null) : null,
        members_only: isPro() ? $("ev-members").checked : false,
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

  // ---- Aperçu de l'annonce ----
  // Reproduit la vignette de la galerie (mêmes classes que galerie.js, style.css)
  // et sa fiche, à partir des champs du formulaire, à chaque saisie. L'organisateur
  // voit ce qu'il publie avant de cliquer.
  const APERCU_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const APERCU_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const APERCU_MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const dParts = (iso) => { const d = new Date(iso + "T12:00:00"); return isNaN(d) ? null : { wd: APERCU_DAYS[d.getDay()], day: d.getDate(), month: APERCU_MONTHS[d.getMonth()], long: `${d.getDate()} ${APERCU_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}` }; };
  var apercuImageURL = "";   // (var : lu par applyKind() avant cette ligne) image choisie (URL d'objet) ou image existante en édition

  function renderApercu() {
    const tile = $("apercu-tile"), fiche = $("apercu-fiche");
    if (!tile || !fiche) return;
    const pro = isPro();
    const title = $("ev-title").value.trim();
    const date = $("ev-date").value, end = $("ev-end").value;
    const dp = date ? dParts(date) : null, ep = end && end > date ? dParts(end) : null;
    const cat = (CATS[kind()] || {})[$("ev-category").value] || { emoji: "📌", label: "Catégorie" };
    const city = $("ev-city").value.trim(), place = $("ev-place").value.trim();
    const t2fr = (t) => (t ? t.replace(":", "h") : "");
    const horaire = t2fr($("ev-time-start").value) + ($("ev-time-end").value ? "–" + t2fr($("ev-time-end").value) : "");
    const desc = $("ev-desc").value.trim();
    const url = $("ev-url").value.trim();
    const organizer = pro ? $("ev-organizer").value.trim() : "";
    const members = pro && $("ev-members").checked;
    const img = apercuImageURL;

    if (!title && !date) {
      tile.innerHTML = "";
      fiche.innerHTML = '<p class="apercu__empty">Remplissez le titre et la date : l\'aperçu se met à jour au fur et à mesure.</p>';
      return;
    }
    const dateHTML = dp
      ? (ep
        ? `<span class="poster__date poster__date--range"><span class="day">${dp.day}</span><span class="month">${escapeHtml(dp.month)}</span><span class="poster__dateend">→ ${ep.day} ${escapeHtml(ep.month)}</span></span>`
        : `<span class="poster__date"><span class="wd">${escapeHtml(dp.wd)}</span><span class="day">${dp.day}</span><span class="month">${escapeHtml(dp.month)}</span></span>`)
      : "";
    const cityHTML = city ? `<span class="poster__city">📍 ${escapeHtml(city)}</span>` : "";
    tile.innerHTML = `
      <div class="poster ${img ? "" : "poster--noimg"}" aria-hidden="true">
        ${img ? `<img class="poster__img" src="${escapeHtml(img)}" alt="">` : ""}
        <span class="poster__cat">${cat.emoji} ${escapeHtml(cat.label)}</span>
        ${dateHTML}
        ${members ? '<span class="poster__members">🔒 Membres</span>' : ""}
        <span class="poster__fallback">${escapeHtml(title || "Titre de l'événement")}${cityHTML}</span>
        <span class="poster__overlay"><span class="poster__title">${escapeHtml(title || "Titre de l'événement")}</span>${cityHTML}</span>
      </div>`;

    const badges =
      ($("ev-free").checked ? '<span class="badge badge--free">Gratuit</span>' : "") +
      ($("ev-resa").checked ? `<span class="badge">🎟️ ${pro ? "Sur inscription" : "Réservation"}</span>` : "") +
      (members ? '<span class="badge badge--members">🔒 Réservé aux membres</span>' : "");
    const quand = dp ? (ep ? `Du ${dp.long} au ${ep.long}` : dp.long) + (horaire ? ` · ${horaire}` : "") : "Date à renseigner";
    const lieu = [place, city].filter(Boolean).join(" — ");
    fiche.innerHTML = `
      <div class="apercu__cat">${cat.emoji} ${escapeHtml(cat.label)}</div>
      <h4>${escapeHtml(title || "Titre de l'événement")}</h4>
      ${badges ? `<div class="apercu__badges">${badges}</div>` : ""}
      <ul class="apercu__meta">
        <li>🕒 ${escapeHtml(quand)}</li>
        ${lieu ? `<li>📍 ${escapeHtml(lieu)}</li>` : ""}
        ${organizer ? `<li>👥 Organisé par ${escapeHtml(organizer)}</li>` : ""}
      </ul>
      ${desc ? `<p class="apercu__desc">${escapeHtml(desc)}</p>` : ""}
      ${url ? '<span class="apercu__cta">Plus d\'infos →</span>' : ""}`;
  }
  ["ev-kind", "ev-title", "ev-category", "ev-date", "ev-end", "ev-time-start", "ev-time-end", "ev-place", "ev-city",
   "ev-desc", "ev-url", "ev-free", "ev-resa", "ev-organizer", "ev-members"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", renderApercu);
    el.addEventListener("change", renderApercu);
  });
  renderApercu();

  function resetForm() {
    $("event-form").reset();
    $("ev-id").value = ""; imageFile = null;
    show($("ev-preview"), false);
    $("ev-submit").textContent = "Publier";
    show($("ev-cancel"), false);
    applyKind();
    apercuImageURL = "";
    renderApercu();
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
        ${r.image ? `<img src="${r.image}" alt="" class="mine-thumb" loading="lazy">` : `<div class="mine-thumb mine-thumb--empty" aria-hidden="true">${r.kind === "pro" ? "💼" : "🖼️"}</div>`}
        <div class="mine-body">
          <strong>${escapeHtml(r.title)}</strong>
          <span class="badge ${st.cls}">${st.label}</span>${r.kind === "pro" ? ' <span class="badge">💼 Pro</span>' : ""}
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
    $("ev-kind").value = r.kind === "pro" ? "pro" : "event";
    applyKind();
    $("ev-category").value = r.category;
    $("ev-organizer").value = r.organizer || "";
    $("ev-members").checked = !!r.members_only;
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
    if (r.image) { $("ev-preview").src = r.image; show($("ev-preview"), true); } else show($("ev-preview"), false);
    apercuImageURL = r.image || "";
    renderApercu();
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
