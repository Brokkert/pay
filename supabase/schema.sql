-- ============================================================================
-- Pay — database schema
-- ----------------------------------------------------------------------------
-- Plak dit hele bestand in de Supabase SQL Editor en druk op Run. Het is
-- idempotent: je kunt het opnieuw draaien na een update zonder data te
-- verliezen.
--
-- Uitgangspunt van het beveiligingsmodel:
--
--   1. Alles hangt aan een huishouden. Wie geen lid is van dat huishouden ziet
--      er niets van — geen posten, geen personen, geen bedragen.
--   2. Lid worden kan alleen met een geldige uitnodiging. Dat wordt afgedwongen
--      door een trigger op auth.users, niet door het formulier: iemand die de
--      auth-endpoint rechtstreeks aanroept komt er net zo goed niet in.
--   3. Van uitnodigingscodes staat alleen een SHA-256-hash in de database. Wie
--      de database leest, kan er geen werkende uitnodiging uit terugrekenen.
--   4. Je kunt jezelf alleen aan een persoon koppelen, nooit aan iemand anders:
--      gekoppeld_aan mag je uitsluitend op je eigen auth.uid() zetten.
-- ============================================================================

-- Supabase heeft pgcrypto meestal al staan in het schema "extensions". Een
-- kale "create extension" is dan een no-op en digest() staat dus NIET in het
-- standaard zoekpad. Daarom hieronder overal expliciet
-- "search_path = public, extensions, pg_temp".
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Huishoudens en hun leden
-- ---------------------------------------------------------------------------
create table if not exists public.pay_huishoudens (
  id         uuid primary key default gen_random_uuid(),
  naam       text not null default 'Ons huishouden',
  created_at timestamptz not null default now()
);

create table if not exists public.pay_leden (
  huishouden_id uuid not null references public.pay_huishoudens on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  rol           text not null default 'lid' check (rol in ('eigenaar', 'lid')),
  created_at    timestamptz not null default now(),
  primary key (huishouden_id, user_id)
);
create index if not exists pay_leden_user_idx on public.pay_leden (user_id);

-- Twee hulpfuncties als SECURITY DEFINER. Dat is hier geen gemak maar
-- noodzaak: het beleid óp pay_leden zou anders zichzelf aanroepen om te
-- bepalen of je pay_leden mag lezen.
create or replace function public.pay_mijn_huishouden()
returns uuid
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select huishouden_id from public.pay_leden
   where user_id = auth.uid()
   order by created_at
   limit 1;
$$;

create or replace function public.pay_lid_van(p_huishouden uuid)
returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.pay_leden
     where huishouden_id = p_huishouden and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Personen
-- ---------------------------------------------------------------------------
-- Niet iedere persoon is een gebruiker. Je vriendin logt in en heeft een
-- account; de vriend met wie je een abonnement deelt staat er gewoon in zonder
-- ooit iets te hoeven aanmaken. gekoppeld_aan legt het verband als het er is.
create table if not exists public.pay_personen (
  id            uuid primary key default gen_random_uuid(),
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  naam          text not null,

  kleur         text not null default '#1f6f5c',
  is_mij        boolean not null default false,
  gekoppeld_aan uuid references auth.users on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists pay_personen_hh_idx on public.pay_personen (huishouden_id);
-- Eén gebruiker kan maar aan één persoon in een huishouden hangen.
create unique index if not exists pay_personen_koppeling_idx
  on public.pay_personen (huishouden_id, gekoppeld_aan)
  where gekoppeld_aan is not null;

-- ---------------------------------------------------------------------------
-- Rekeningen
-- ---------------------------------------------------------------------------
-- soort = 'gezamenlijk' → een pot; deelnemers storten erop, gedeelde lasten
--                          gaan eraf. In de boeken een eigen partij.
-- soort = 'prive'/'zakelijk' → van één persoon. Wat anderen ervan meegebruiken,
--                          staat bij die persoon in het krijt.
create table if not exists public.pay_rekeningen (
  id            uuid primary key default gen_random_uuid(),
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  naam          text not null,
  soort         text not null default 'gezamenlijk'
                check (soort in ('gezamenlijk', 'prive', 'zakelijk')),
  eigenaar_id   uuid references public.pay_personen on delete set null,
  deelnemers    uuid[] not null default '{}',
  stortingen    jsonb not null default '{}'::jsonb,
  iban          text not null default '',

  created_at    timestamptz not null default now(),
  -- Een pot zonder deelnemers of een eigen rekening zonder eigenaar levert
  -- posten op die nergens terechtkomen. Dat vangen we hier af en niet pas in
  -- het formulier.
  check (
    (soort = 'gezamenlijk' and array_length(deelnemers, 1) is not null)
    or (soort <> 'gezamenlijk' and eigenaar_id is not null)
  )
);
create index if not exists pay_rekeningen_hh_idx on public.pay_rekeningen (huishouden_id);

-- ---------------------------------------------------------------------------
-- Posten
-- ---------------------------------------------------------------------------
-- Bedragen staan in hele centen. Nooit in een kommagetal: een boekhouding die
-- een halve cent kan verliezen is geen boekhouding.
--
-- betaler   = {"soort": "rekening"|"persoon", "id": "..."}
-- verdeling = {"soort": "gelijk"|"delen"|"procent"|"bedrag",
--              "deelnemers": [...], "gewichten": {"persoon-id": getal}}
create table if not exists public.pay_posten (
  id            uuid primary key default gen_random_uuid(),
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  naam          text not null,
  bedrag        bigint not null default 0,
  ritme         text not null default 'maand'
                check (ritme in ('maand', 'kwartaal', 'halfjaar', 'jaar', 'week', 'eenmalig')),
  categorie     text not null default 'overig',
  betaler       jsonb not null default '{}'::jsonb,
  verdeling     jsonb not null default '{}'::jsonb,
  vanaf         date,
  tot           date,
  gepauzeerd    boolean not null default false,
  zakelijk      boolean not null default false,
  afgerekend    boolean not null default false,
  notitie       text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pay_posten_hh_idx on public.pay_posten (huishouden_id);

-- ---------------------------------------------------------------------------
-- Uitnodigingen
-- ---------------------------------------------------------------------------
create table if not exists public.pay_uitnodigingen (
  id              uuid primary key default gen_random_uuid(),
  huishouden_id   uuid not null default public.pay_mijn_huishouden()
                  references public.pay_huishoudens on delete cascade,
  code_hash       text unique not null,
  aangemaakt_door uuid not null default auth.uid() references auth.users on delete cascade,
  label           text not null default '',
  max_keer        int,
  gebruikt        int not null default 0,
  verloopt_op     timestamptz,
  ingetrokken_op  timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists pay_uitnodigingen_hh_idx on public.pay_uitnodigingen (huishouden_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.pay_huishoudens    enable row level security;
alter table public.pay_leden          enable row level security;
alter table public.pay_personen       enable row level security;
alter table public.pay_rekeningen     enable row level security;
alter table public.pay_posten         enable row level security;
alter table public.pay_uitnodigingen  enable row level security;

drop policy if exists pay_huishoudens_lid on public.pay_huishoudens;
create policy pay_huishoudens_lid on public.pay_huishoudens
  for select to authenticated using (public.pay_lid_van(id));

drop policy if exists pay_huishoudens_naam on public.pay_huishoudens;
create policy pay_huishoudens_naam on public.pay_huishoudens
  for update to authenticated using (public.pay_lid_van(id)) with check (public.pay_lid_van(id));

-- Leden zien elkaar binnen hetzelfde huishouden. Erbij zetten doet de trigger
-- bij het aanmelden; met de hand kan het niet, anders is de uitnodiging een
-- formaliteit. Eruit stappen mag je altijd zelf.
drop policy if exists pay_leden_lezen on public.pay_leden;
create policy pay_leden_lezen on public.pay_leden
  for select to authenticated using (public.pay_lid_van(huishouden_id));

drop policy if exists pay_leden_vertrek on public.pay_leden;
create policy pay_leden_vertrek on public.pay_leden
  for delete to authenticated using (user_id = auth.uid());

-- Personen, rekeningen en posten: gedeeld bezit van het huishouden. Iedereen
-- die erbij hoort mag alles lezen en wijzigen — het gaat tenslotte over geld
-- dat jullie samen uitgeven, en een half overzicht is geen overzicht.
drop policy if exists pay_personen_lid on public.pay_personen;
create policy pay_personen_lid on public.pay_personen
  for all to authenticated
  using (public.pay_lid_van(huishouden_id))
  with check (
    public.pay_lid_van(huishouden_id)
    -- Jezelf aan een persoon koppelen mag; iemand anders eraan koppelen niet.
    and (gekoppeld_aan is null or gekoppeld_aan = auth.uid())
  );

drop policy if exists pay_rekeningen_lid on public.pay_rekeningen;
create policy pay_rekeningen_lid on public.pay_rekeningen
  for all to authenticated
  using (public.pay_lid_van(huishouden_id))
  with check (public.pay_lid_van(huishouden_id));

drop policy if exists pay_posten_lid on public.pay_posten;
create policy pay_posten_lid on public.pay_posten
  for all to authenticated
  using (public.pay_lid_van(huishouden_id))
  with check (public.pay_lid_van(huishouden_id));

drop policy if exists pay_uitnodigingen_lid on public.pay_uitnodigingen;
create policy pay_uitnodigingen_lid on public.pay_uitnodigingen
  for all to authenticated
  using (public.pay_lid_van(huishouden_id))
  with check (public.pay_lid_van(huishouden_id) and aangemaakt_door = auth.uid());

-- ============================================================================
-- Rechten
-- ============================================================================
-- Supabase geeft anon/authenticated standaard rechten op alles in "public".
-- We zetten het hier expliciet neer in plaats van op die default te vertrouwen:
-- anon heeft op geen enkele tabel iets te zoeken, en authenticated komt sowieso
-- niet langs RLS heen.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  public.pay_personen, public.pay_rekeningen, public.pay_posten,
  public.pay_uitnodigingen
  to authenticated;
grant select, update on public.pay_huishoudens to authenticated;
grant select, delete on public.pay_leden to authenticated;

revoke all on function public.pay_mijn_huishouden() from public;
revoke all on function public.pay_lid_van(uuid) from public;
grant execute on function public.pay_mijn_huishouden() to authenticated;
grant execute on function public.pay_lid_van(uuid) to authenticated;

-- ============================================================================
-- Is dit project nog leeg?
-- ============================================================================
-- Zolang er niemand is, biedt het inlogscherm aanmelden zonder uitnodiging aan.
-- Daarna verdwijnt die deur.
create or replace function public.pay_needs_bootstrap()
returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select not exists (select 1 from public.pay_leden);
$$;

revoke all on function public.pay_needs_bootstrap() from public;
grant execute on function public.pay_needs_bootstrap() to anon, authenticated;

-- ============================================================================
-- Wat er gebeurt als iemand zich aanmeldt
-- ============================================================================
-- De allereerste gebruiker krijgt een vers huishouden. Iedereen daarna heeft
-- een geldige uitnodigingscode nodig en komt in het huishouden waar die code
-- bij hoort. Dit is de laag die het écht afdwingt: het formulier verstoppen
-- houdt alleen bots tegen, dit houdt ook iemand tegen die de auth-endpoint
-- rechtstreeks aanroept.
create or replace function public.pay_nieuwe_gebruiker()
returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  eerste  boolean;
  code    text;
  uitn    public.pay_uitnodigingen;
  hh      uuid;
  roepnaam text;
begin
  select not exists (select 1 from public.pay_leden) into eerste;
  roepnaam := initcap(split_part(coalesce(new.email, 'iemand'), '@', 1));

  if eerste then
    insert into public.pay_huishoudens (naam) values ('Ons huishouden') returning id into hh;
    insert into public.pay_leden (huishouden_id, user_id, rol) values (hh, new.id, 'eigenaar');
    insert into public.pay_personen (huishouden_id, naam, is_mij, gekoppeld_aan)
    values (hh, roepnaam, true, new.id);
    return new;
  end if;

  code := new.raw_user_meta_data ->> 'invite';
  if code is null or code = '' then
    raise exception 'Voor Pay heb je een uitnodiging nodig.';
  end if;

  select * into uitn from public.pay_uitnodigingen
   where code_hash = encode(digest(code, 'sha256'), 'hex');

  if not found
     or uitn.ingetrokken_op is not null
     or (uitn.verloopt_op is not null and uitn.verloopt_op < now())
     or (uitn.max_keer is not null and uitn.gebruikt >= uitn.max_keer) then
    raise exception 'Deze uitnodiging is niet (meer) geldig.';
  end if;

  insert into public.pay_leden (huishouden_id, user_id, rol)
  values (uitn.huishouden_id, new.id, 'lid')
  on conflict do nothing;

  update public.pay_uitnodigingen set gebruikt = gebruikt + 1 where id = uitn.id;

  -- Bestaat er al een persoon met deze naam en zonder account, dan pakken we
  -- die op in plaats van er een tweede naast te zetten. Anders had je zowel
  -- "Anne" als "Anne" in je lijst staan zodra ze inlogt.
  update public.pay_personen
     set gekoppeld_aan = new.id
   where huishouden_id = uitn.huishouden_id
     and gekoppeld_aan is null
     and lower(naam) = lower(roepnaam)
     and id = (
       select id from public.pay_personen
        where huishouden_id = uitn.huishouden_id
          and gekoppeld_aan is null
          and lower(naam) = lower(roepnaam)
        order by created_at
        limit 1
     );

  if not found then
    insert into public.pay_personen (huishouden_id, naam, gekoppeld_aan)
    values (uitn.huishouden_id, roepnaam, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists pay_op_nieuwe_gebruiker on auth.users;
create trigger pay_op_nieuwe_gebruiker
  after insert on auth.users
  for each row execute function public.pay_nieuwe_gebruiker();

-- ============================================================================
-- updated_at bijhouden
-- ============================================================================
create or replace function public.pay_stempel()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pay_posten_stempel on public.pay_posten;
create trigger pay_posten_stempel
  before update on public.pay_posten
  for each row execute function public.pay_stempel();
