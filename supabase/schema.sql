-- ============================================================================
-- Pay — database schema
-- ----------------------------------------------------------------------------
-- Plak dit hele bestand in de Supabase SQL Editor en druk op Run. Het is
-- idempotent: je kunt het opnieuw draaien na een update zonder data te
-- verliezen.
--
-- Uitgangspunt van het beveiligingsmodel, in twee lagen:
--
--   1. **De database kan niets lezen.** Elke naam, elk bedrag en elke notitie
--      staat als één versleutelde blob in de kolom `geheim`. De sleutel wordt
--      in de browser gemaakt en komt hier nooit langs. Wie deze database
--      openmaakt — wij, Supabase, of iemand die er ooit inbreekt — ziet ruis.
--      Wat wél zichtbaar is: hoeveel rijen er zijn en wanneer ze zijn gemaakt.
--
--   2. **Row Level Security bepaalt wie welke blob mag ophalen.** Ook al is het
--      onleesbaar, het hoort niet rond te slingeren. Wie geen lid is van een
--      huishouden komt er niet bij, en `anon` komt bij geen enkele tabel.
--
-- Verder:
--
--   * Lid worden kan alleen met een geldige uitnodiging, afgedwongen door een
--     trigger op auth.users — dus ook als iemand het formulier overslaat en de
--     auth-endpoint rechtstreeks aanroept.
--   * Van uitnodigingscodes staat alleen een SHA-256-hash in de database.
--   * Je kunt jezelf alleen aan een persoon koppelen, nooit aan iemand anders.
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
-- Een huishouden heeft geen naam in de database. Dat zou het enige leesbare
-- stukje tekst zijn, en daarmee het enige wat je zonder sleutel over iemand te
-- weten komt.
create table if not exists public.pay_huishoudens (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.pay_huishoudens drop column if exists naam;

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
-- Sleutels
-- ---------------------------------------------------------------------------
-- Twee tabellen, want ze hebben verschillende lezers.
--
-- pay_sleutels is leesbaar voor alle leden van het huishouden. Daar staat je
-- publieke sleutel in — die hóórt openbaar te zijn — en het pakketje met de
-- huishoudsleutel dat een ander lid speciaal voor jou heeft ingepakt. Dat
-- laatste is met jouw publieke sleutel versleuteld, dus alleen jij kunt het
-- openen; anderen zien er een blob.
create table if not exists public.pay_sleutels (
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  user_id       uuid primary key references auth.users on delete cascade,
  publiek       jsonb,
  voor_mij      jsonb,
  gedeeld_op    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists pay_sleutels_hh_idx on public.pay_sleutels (huishouden_id);

-- pay_geheimen is van jou alleen. Hier staan twee pakketjes die met je
-- wachtwoordzin zijn ingepakt: je private sleutel, en de huishoudsleutel.
-- Zonder die zin is het allebei onbruikbaar, ook voor ons.
create table if not exists public.pay_geheimen (
  user_id       uuid primary key references auth.users on delete cascade,
  prive_gewrapt jsonb,
  huis_gewrapt  jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- De gegevens zelf
-- ---------------------------------------------------------------------------
-- Alles wat inhoud is, zit in `geheim`. Wat daarbuiten staat is het minimum dat
-- de database nodig heeft om te weten wie erbij mag: het huishouden, en bij een
-- persoon de koppeling aan een account.
create table if not exists public.pay_personen (
  id            uuid primary key default gen_random_uuid(),
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  gekoppeld_aan uuid references auth.users on delete set null,
  geheim        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists pay_personen_hh_idx on public.pay_personen (huishouden_id);
-- Eén gebruiker kan maar aan één persoon in een huishouden hangen.
create unique index if not exists pay_personen_koppeling_idx
  on public.pay_personen (huishouden_id, gekoppeld_aan)
  where gekoppeld_aan is not null;

create table if not exists public.pay_rekeningen (
  id            uuid primary key default gen_random_uuid(),
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  geheim        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists pay_rekeningen_hh_idx on public.pay_rekeningen (huishouden_id);

create table if not exists public.pay_posten (
  id            uuid primary key default gen_random_uuid(),
  huishouden_id uuid not null default public.pay_mijn_huishouden()
                references public.pay_huishoudens on delete cascade,
  geheim        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pay_posten_hh_idx on public.pay_posten (huishouden_id);

-- Voor projecten die een eerdere, leesbare versie van dit schema draaiden. Deze
-- kolommen stonden er in gewone tekst in; ze horen weg, niet mee te reizen.
do $$
declare
  kolom text;
begin
  alter table public.pay_personen   add column if not exists geheim jsonb not null default '{}'::jsonb;
  alter table public.pay_rekeningen add column if not exists geheim jsonb not null default '{}'::jsonb;
  alter table public.pay_posten     add column if not exists geheim jsonb not null default '{}'::jsonb;

  foreach kolom in array array['naam', 'kleur', 'is_mij', 'emoji'] loop
    execute format('alter table public.pay_personen drop column if exists %I', kolom);
  end loop;

  foreach kolom in array array['naam', 'soort', 'eigenaar_id', 'deelnemers', 'stortingen',
                               'iban', 'emoji', 'afrekenpot'] loop
    execute format('alter table public.pay_rekeningen drop column if exists %I', kolom);
  end loop;

  foreach kolom in array array['naam', 'bedrag', 'ritme', 'categorie', 'bundel', 'betaler',
                               'verdeling', 'vanaf', 'tot', 'gepauzeerd', 'zakelijk',
                               'afgerekend', 'notitie'] loop
    execute format('alter table public.pay_posten drop column if exists %I', kolom);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uitnodigingen
-- ---------------------------------------------------------------------------
-- Geen label: dat zou weer leesbare tekst zijn. Wie wie heeft uitgenodigd zie
-- je aan `aangemaakt_door`, en dat is een id.
create table if not exists public.pay_uitnodigingen (
  id              uuid primary key default gen_random_uuid(),
  huishouden_id   uuid not null default public.pay_mijn_huishouden()
                  references public.pay_huishoudens on delete cascade,
  code_hash       text unique not null,
  aangemaakt_door uuid not null default auth.uid() references auth.users on delete cascade,
  max_keer        int,
  gebruikt        int not null default 0,
  verloopt_op     timestamptz,
  ingetrokken_op  timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists pay_uitnodigingen_hh_idx on public.pay_uitnodigingen (huishouden_id);
alter table public.pay_uitnodigingen drop column if exists label;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.pay_huishoudens    enable row level security;
alter table public.pay_leden          enable row level security;
alter table public.pay_sleutels       enable row level security;
alter table public.pay_geheimen       enable row level security;
alter table public.pay_personen       enable row level security;
alter table public.pay_rekeningen     enable row level security;
alter table public.pay_posten         enable row level security;
alter table public.pay_uitnodigingen  enable row level security;

drop policy if exists pay_huishoudens_lid on public.pay_huishoudens;
create policy pay_huishoudens_lid on public.pay_huishoudens
  for select to authenticated using (public.pay_lid_van(id));

-- Leden zien elkaar binnen hetzelfde huishouden. Erbij zetten doet de trigger
-- bij het aanmelden; met de hand kan het niet, anders is de uitnodiging een
-- formaliteit. Eruit stappen mag je altijd zelf.
drop policy if exists pay_leden_lezen on public.pay_leden;
create policy pay_leden_lezen on public.pay_leden
  for select to authenticated using (public.pay_lid_van(huishouden_id));

drop policy if exists pay_leden_vertrek on public.pay_leden;
create policy pay_leden_vertrek on public.pay_leden
  for delete to authenticated using (user_id = auth.uid());

-- Sleutels: iedereen in het huishouden mag ze lezen (je moet elkaars publieke
-- sleutel kunnen zien om iemand toegang te kunnen geven), maar alleen je eigen
-- rij schrijven. Het pakketje `voor_mij` zet een ander lid neer, en dat gaat
-- via pay_deel_sleutel() verderop — niet via een update, want dan zou iemand
-- ook jouw publieke sleutel kunnen omwisselen voor de zijne.
drop policy if exists pay_sleutels_lezen on public.pay_sleutels;
create policy pay_sleutels_lezen on public.pay_sleutels
  for select to authenticated using (public.pay_lid_van(huishouden_id));

drop policy if exists pay_sleutels_eigen on public.pay_sleutels;
create policy pay_sleutels_eigen on public.pay_sleutels
  for insert to authenticated
  with check (user_id = auth.uid() and public.pay_lid_van(huishouden_id));

drop policy if exists pay_sleutels_bijwerken on public.pay_sleutels;
create policy pay_sleutels_bijwerken on public.pay_sleutels
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pay_geheimen_eigen on public.pay_geheimen;
create policy pay_geheimen_eigen on public.pay_geheimen
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- De gegevens: gedeeld bezit van het huishouden. Iedereen die erbij hoort mag
-- alles lezen en wijzigen — het gaat over geld dat je samen uitgeeft, en een
-- half overzicht is geen overzicht.
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
  public.pay_uitnodigingen, public.pay_geheimen
  to authenticated;
grant select, insert, update on public.pay_sleutels to authenticated;
grant select on public.pay_huishoudens to authenticated;
grant select, delete on public.pay_leden to authenticated;

revoke all on function public.pay_mijn_huishouden() from public;
revoke all on function public.pay_lid_van(uuid) from public;
grant execute on function public.pay_mijn_huishouden() to authenticated;
grant execute on function public.pay_lid_van(uuid) to authenticated;

-- ============================================================================
-- RPC: iemand toegang geven tot de huishoudsleutel
-- ============================================================================
-- Een lid pakt de huishoudsleutel in met de publieke sleutel van de nieuwkomer
-- en zet dat pakketje hier neer. De functie draait als SECURITY DEFINER omdat
-- ze in andermans rij schrijft — vandaar de twee controles: de aanroeper moet
-- lid zijn van hetzelfde huishouden, en de ontvanger ook. Meer mag ze niet: de
-- publieke sleutel blijft ongemoeid, dus je kunt iemands sleutel niet omruilen
-- voor de jouwe om zo mee te kunnen kijken.
create or replace function public.pay_deel_sleutel(p_user uuid, p_pakket jsonb)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  hh uuid;
begin
  select huishouden_id into hh from public.pay_leden where user_id = auth.uid() limit 1;
  if hh is null then
    raise exception 'Je hoort bij geen enkel huishouden.';
  end if;

  if not exists (select 1 from public.pay_leden where user_id = p_user and huishouden_id = hh) then
    raise exception 'Die persoon hoort niet bij jouw huishouden.';
  end if;

  update public.pay_sleutels
     set voor_mij = p_pakket, gedeeld_op = now()
   where user_id = p_user and huishouden_id = hh;

  if not found then
    raise exception 'Die persoon heeft nog geen sleutel klaargezet.';
  end if;
end;
$$;

revoke all on function public.pay_deel_sleutel(uuid, jsonb) from public;
grant execute on function public.pay_deel_sleutel(uuid, jsonb) to authenticated;

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
--
-- Anders dan in de leesbare versie maakt deze trigger geen persoon meer aan.
-- Dat kan ook niet: een naam hoort versleuteld te zijn, en de sleutel bestaat
-- hier niet. De app doet het na het inloggen.
create or replace function public.pay_nieuwe_gebruiker()
returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  eerste boolean;
  code   text;
  uitn   public.pay_uitnodigingen;
  hh     uuid;
begin
  select not exists (select 1 from public.pay_leden) into eerste;

  if eerste then
    insert into public.pay_huishoudens default values returning id into hh;
    insert into public.pay_leden (huishouden_id, user_id, rol) values (hh, new.id, 'eigenaar');
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

drop trigger if exists pay_geheimen_stempel on public.pay_geheimen;
create trigger pay_geheimen_stempel
  before update on public.pay_geheimen
  for each row execute function public.pay_stempel();
