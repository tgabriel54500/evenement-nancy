// ============================================================================
// Edge Function : moderate-event
// Appelée par le front juste après une soumission/édition. Lit l'event (service
// role), demande à Claude s'il est valide pour un agenda public local, puis
// passe le statut en 'approved' ou 'rejected' avec une raison.
//
// Secrets requis (Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY   = clé API Anthropic (console.anthropic.com)
// Fournis automatiquement par Supabase :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Déploiement : supabase functions deploy moderate-event --no-verify-jwt
//   (--no-verify-jwt : on l'appelle aussi en re-modération ; l'autorisation
//    réelle vient du fait qu'on ne révèle rien et qu'on agit en service role.)
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "claude-opus-4-8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Schéma de sortie structurée : la réponse de Claude EST cet objet.
const SCHEMA = {
  type: "object",
  properties: {
    valid: { type: "boolean", description: "true si l'événement est publiable" },
    reason: { type: "string", description: "Raison courte, en français, lisible par l'organisateur" },
  },
  required: ["valid", "reason"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { id } = await req.json();
    if (!id) return json({ error: "id manquant" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ev, error } = await admin
      .from("user_events").select("*").eq("id", id).single();
    if (error || !ev) return json({ error: "event introuvable" }, 404);

    // --- Appel Claude (raw HTTP — environnement Deno) ---
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      // Pas de clé IA configurée → modération désactivée : on approuve directement.
      // (Mettre ANTHROPIC_API_KEY plus tard active la vraie modération.)
      await admin.from("user_events")
        .update({ status: "approved", moderation_reason: "Modération IA désactivée" })
        .eq("id", id);
      return json({ status: "approved", reason: "Modération IA désactivée" });
    }

    const system =
      "Tu es modérateur d'un agenda d'événements publics de la métropole de Nancy. " +
      "On te donne un événement soumis par un organisateur (pro, association ou particulier). " +
      "Décide s'il est PUBLIABLE. Refuse uniquement si : contenu manifestement faux/incohérent, " +
      "spam ou publicité déguisée sans événement réel, propos haineux/discriminatoires, contenu " +
      "illégal, à caractère sexuel explicite, arnaque, ou image sans rapport / choquante. " +
      "Sois tolérant pour les petits événements associatifs et amateurs : un manque de détails " +
      "n'est PAS un motif de refus tant que titre, date et lieu sont cohérents. " +
      "Réponds en français, raison courte et utile à l'organisateur.";

    const content: unknown[] = [];
    if (ev.image) {
      content.push({ type: "image", source: { type: "url", url: ev.image } });
    }
    content.push({
      type: "text",
      text:
        `Type: ${ev.kind}\nTitre: ${ev.title}\nCatégorie: ${ev.category}\n` +
        `Date: ${ev.date}${ev.end_date ? " → " + ev.end_date : ""}\n` +
        `Horaire: ${ev.schedule || "—"}\nLieu: ${ev.place || "—"} ${ev.city || ""}\n` +
        `Gratuit: ${ev.free ? "oui" : "non"} | Réservation: ${ev.reservation ? "oui" : "non"}\n` +
        `Lien: ${ev.url || "—"}\n\nDescription:\n${ev.description}`,
    });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: "anthropic", detail: t }, 502);
    }
    const data = await resp.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const verdict = JSON.parse(textBlock.text) as { valid: boolean; reason: string };

    const status = verdict.valid ? "approved" : "rejected";
    await admin.from("user_events")
      .update({ status, moderation_reason: verdict.reason })
      .eq("id", id);

    return json({ status, reason: verdict.reason });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
