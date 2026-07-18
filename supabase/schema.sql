-- ============================================================================
-- Événement Nancy — schéma Supabase pour les events soumis par les utilisateurs
-- (pros / assos / particuliers). À exécuter dans Supabase → SQL Editor.
-- Modération par IA : un event soumis part en `pending`, l'Edge Function
-- `moderate-event` (qui appelle Claude) le passe en `approved` ou `rejected`.
-- ============================================================================

-- 1) TABLE -------------------------------------------------------------------
create table if not exists public.user_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Type d'entrée : 'event' (agenda public) ou 'sport' (clubs amateurs) — une
  -- seule table partagée entre les deux features, filtrer par `kind`.
  kind          text not null default 'event' check (kind in ('event','sport')),
  -- Champs alignés sur le schéma EVENTS du site (cf. data.js / NOTES.md)
  title         text not null,
  category      text not null,              -- clé de CATEGORIES (activite, spectacle…)
  description   text not null,
  date          date not null,              -- début
  end_date      date,                       -- fin (null = mono-jour)
  schedule      text,                       -- horaire libre ("20h30", "14h-18h")
  place         text,
  city          text,
  free          boolean not null default false,
  reservation   boolean not null default false,
  url           text,                       -- "Plus d'infos" (optionnel)
  image         text not null,              -- URL publique Storage (obligatoire)
  -- Modération + stats
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  moderation_reason text,
  click_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists user_events_kind_status_date_idx
  on public.user_events (kind, status, date);
create index if not exists user_events_user_idx
  on public.user_events (user_id);

-- 2) GARDE-FOU (trigger) -----------------------------------------------------
-- Empêche un utilisateur de : se faire passer pour un autre, écrire son propre
-- statut/compteur de clics, contourner la re-modération après édition.
-- L'Edge Function (service_role) a tous les droits.
create or replace function public.guard_user_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;                              -- modération IA : libre
  end if;

  if tg_op = 'INSERT' then
    new.user_id          := auth.uid();
    new.status           := 'pending';
    new.moderation_reason := null;
    new.click_count      := 0;
    new.created_at       := now();
    new.updated_at       := now();
  elsif tg_op = 'UPDATE' then
    new.user_id     := old.user_id;         -- propriété figée
    new.click_count := old.click_count;     -- clics non falsifiables
    new.created_at  := old.created_at;
    new.updated_at  := now();
    new.status      := 'pending';           -- toute édition => re-modération
    new.moderation_reason := null;
  end if;
  return new;
end; $$;

drop trigger if exists guard_user_events_trg on public.user_events;
create trigger guard_user_events_trg
  before insert or update on public.user_events
  for each row execute function public.guard_user_events();

-- 3) COMPTEUR DE CLICS (RPC) -------------------------------------------------
-- Incrément contrôlé (security definer) : seuls les events approuvés comptent.
create or replace function public.increment_event_click(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.user_events
     set click_count = click_count + 1
   where id = p_id and status = 'approved';
$$;
grant execute on function public.increment_event_click(uuid) to anon, authenticated;

-- 4) RLS ---------------------------------------------------------------------
alter table public.user_events enable row level security;

-- Lecture publique : uniquement les events approuvés (anon + connectés)
drop policy if exists "read approved" on public.user_events;
create policy "read approved" on public.user_events
  for select using (status = 'approved');

-- Lecture de SES events (tous statuts) par leur propriétaire
drop policy if exists "read own" on public.user_events;
create policy "read own" on public.user_events
  for select to authenticated using (auth.uid() = user_id);

-- Création : connecté, pour soi
drop policy if exists "insert own" on public.user_events;
create policy "insert own" on public.user_events
  for insert to authenticated with check (auth.uid() = user_id);

-- Édition / suppression : son propre contenu
drop policy if exists "update own" on public.user_events;
create policy "update own" on public.user_events
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own" on public.user_events;
create policy "delete own" on public.user_events
  for delete to authenticated using (auth.uid() = user_id);

-- 5) STORAGE (affiches) ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

-- Lecture publique des images
drop policy if exists "images public read" on storage.objects;
create policy "images public read" on storage.objects
  for select using (bucket_id = 'event-images');

-- Upload réservé aux connectés, dans leur propre dossier <uid>/...
drop policy if exists "images insert own" on storage.objects;
create policy "images insert own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "images delete own" on storage.objects;
create policy "images delete own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'event-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6) VALIDATION + ANTI-DOUBLON ----------------------------------------------
-- (Section ajoutée après coup : ré-exécutable telle quelle sur une base déjà
-- créée, tout est idempotent.)

-- Cohérence des dates : fin >= début.
alter table public.user_events drop constraint if exists user_events_dates_chk;
alter table public.user_events add constraint user_events_dates_chk
  check (end_date is null or end_date >= date);

-- Titre normalisé côté SQL : minuscules, accents usuels retirés, ponctuation
-- remplacée par des espaces réduits. Miroir de normTitle() dans compte.js.
create or replace function public.norm_title(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(t, '')),
      'àâäáãéèêëíìîïóòôöõúùûüçñÿœæ',
      'aaaaaeeeeiiiiooooouuuucnyoa'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Garde-fou serveur : refuse un event du même kind dont le titre normalisé est
-- identique et dont la période chevauche celle d'un event non rejeté existant.
-- (Le front fait le même test pour un message précoce; ici c'est incontournable.)
create or replace function public.reject_duplicate_user_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;                              -- modération / admin : libre
  end if;
  if exists (
    select 1 from public.user_events e
     where e.id <> new.id
       and e.kind = new.kind
       and e.status <> 'rejected'
       and norm_title(e.title) = norm_title(new.title)
       and daterange(e.date, coalesce(e.end_date, e.date), '[]')
           && daterange(new.date, coalesce(new.end_date, new.date), '[]')
  ) then
    raise exception 'Doublon : un événement au même titre existe déjà sur ces dates.';
  end if;
  return new;
end; $$;

drop trigger if exists reject_duplicate_user_event_trg on public.user_events;
create trigger reject_duplicate_user_event_trg
  before insert or update on public.user_events
  for each row execute function public.reject_duplicate_user_event();
