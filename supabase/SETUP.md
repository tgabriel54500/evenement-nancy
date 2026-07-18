# Comptes organisateurs — mise en place (à faire 1 fois)

Feature : un organisateur (pro / asso / particulier) crée un compte, publie un
événement (infos mini + image), peut l'éditer / le supprimer, et voit combien de
personnes ont ouvert sa fiche. Modération **automatique par IA** (Claude) avant
publication.

Tout est testé sur le **bac à sable** d'abord (`deploy-staging.sh`).

## 1. Créer le projet Supabase
1. https://supabase.com → New project (région Europe, ex : `eu-west-3`).
2. Project Settings → **API** : copie **Project URL** et **anon public key**.
3. Colle-les dans `config-supabase.js` (à la racine du repo).

## 2. Base de données + storage
- SQL Editor → colle tout `supabase/schema.sql` → **Run**.
- Crée : table `user_events`, RLS, trigger garde-fou, RPC compteur de clics,
  bucket `event-images` (public), contrainte de dates et trigger anti-doublon.
- ⚠️ Si la base a été créée AVANT l'ajout de la section 6 (anti-doublon) :
  re-exécuter le fichier entier (tout est idempotent) ou juste la section 6.

## 3. Auth (lien magique)
- Authentication → Providers → **Email** activé, "Confirm email" ON suffit.
- Authentication → URL Configuration → **Site URL** = l'URL où tu testes
  (bac à sable `https://evenement-nancy-staging.tgabriel.workers.dev`, puis la prod).
  Ajoute aussi cette URL dans **Redirect URLs**.
- (Le mail par défaut de Supabase suffit pour tester. Pour la prod, configure un
  SMTP perso, sinon quota d'emails limité.)

## 4. Clé IA + Edge Function de modération
1. console.anthropic.com → crée une **API key**.
2. Installe le CLI : `npm i -g supabase`, puis `supabase login`.
3. Lie le projet : `supabase link --project-ref <ref>` (ref = sous-domaine du Project URL).
4. Pose le secret : `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
5. Déploie : `supabase functions deploy moderate-event --no-verify-jwt`
   (`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement.)

## 5. Tester
1. `bash deploy-staging.sh` → ouvre `/compte.html` sur l'URL staging.
2. Connexion par email → publie un event avec image.
3. Va dans « Mes événements » : statut passe de ⏳ à ✅ ou ⛔ en quelques sec.
4. Un event ✅ apparaît dans la galerie / les cartes (via `user-events.js`).
5. Ouvre sa fiche → le compteur 👁️ s'incrémente.

## Notes
- L'anon key est **publique** par design : la sécurité vient des règles RLS.
- Modèle de modération : `claude-opus-4-8` (cf. `functions/moderate-event/index.ts`).
- Table partagée avec la feature « sport » via la colonne `kind` ('event' | 'sport').
- Coût IA : ~1 appel Claude par soumission/édition (texte + image), négligeable.
