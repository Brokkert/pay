-- ============================================================================
-- Pay — database schema
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL Editor and press Run. It is
-- idempotent: you can run it again after an update without losing data.
--
-- The security model, in two layers:
--
--   1. **The database cannot read anything.** Every name, amount and note sits
--      as a single encrypted blob in the `secret` column. The key is made in the
--      browser and never passes through here. Whoever opens this database — us,
--      Supabase, or someone who ever breaks in — sees noise. What *is* visible:
--      how many rows there are and when they were created.
--
--   2. **Row Level Security decides who may fetch which blob.** Unreadable or
--      not, it has no business lying around. Someone who is not a member of a
--      household cannot get at it, and `anon` cannot get at any table.
--
-- Beyond that:
--
--   * Joining is only possible with a valid invite, enforced by a trigger on
--     auth.users — so also when someone skips the form and calls the auth
--     endpoint directly.
--   * Only a SHA-256 hash of an invite code is stored.
--   * You can only link yourself to a person, never someone else.
-- ============================================================================

-- Supabase usually already has pgcrypto in the "extensions" schema. A bare
-- "create extension" is then a no-op, and digest() is NOT on the default search
-- path. Hence the explicit "search_path = public, extensions, pg_temp" below.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Households and their members
-- ---------------------------------------------------------------------------
-- A household has no name in the database. That would be the only readable
-- piece of text, and therefore the only thing you could learn about someone
-- without a key.
create table if not exists public.pay_households (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.pay_members (
  household_id uuid not null references public.pay_households on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists pay_members_user_idx on public.pay_members (user_id);

-- Two helpers as SECURITY DEFINER. That is not convenience but necessity: the
-- policy *on* pay_members would otherwise call itself to decide whether you may
-- read pay_members.
create or replace function public.pay_my_household()
returns uuid
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select household_id from public.pay_members
   where user_id = auth.uid()
   order by created_at
   limit 1;
$$;

create or replace function public.pay_is_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.pay_members
     where household_id = p_household and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------
-- Two tables, because they have different readers.
--
-- pay_keys is readable by every member of the household. It holds your public
-- key — which is meant to be public — and the package with the household key
-- that another member wrapped specifically for you. That last one is encrypted
-- with your public key, so only you can open it; others see a blob.
create table if not exists public.pay_keys (
  household_id uuid not null default public.pay_my_household()
               references public.pay_households on delete cascade,
  user_id      uuid primary key references auth.users on delete cascade,
  public_key   jsonb,
  for_me       jsonb,
  shared_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists pay_keys_household_idx on public.pay_keys (household_id);

-- pay_secrets is yours alone. Two packages, both sealed with your passphrase:
-- your private key, and the household key. Without that passphrase both are
-- useless, to us as well.
create table if not exists public.pay_secrets (
  user_id         uuid primary key references auth.users on delete cascade,
  private_wrapped jsonb,
  wrapped_key     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The data itself
-- ---------------------------------------------------------------------------
-- Everything that is content lives in `secret`. What sits outside it is the
-- minimum the database needs to know who may see it: the household, and for a
-- person the link to an account.
create table if not exists public.pay_people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.pay_my_household()
               references public.pay_households on delete cascade,
  linked_user  uuid references auth.users on delete set null,
  secret       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists pay_people_household_idx on public.pay_people (household_id);
-- One user can hang off only one person within a household.
create unique index if not exists pay_people_link_idx
  on public.pay_people (household_id, linked_user)
  where linked_user is not null;

create table if not exists public.pay_accounts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.pay_my_household()
               references public.pay_households on delete cascade,
  secret       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists pay_accounts_household_idx on public.pay_accounts (household_id);

create table if not exists public.pay_expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.pay_my_household()
               references public.pay_households on delete cascade,
  secret       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pay_expenses_household_idx on public.pay_expenses (household_id);

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
-- No label: that would be readable text again. Who invited whom shows up in
-- `created_by`, and that is an id.
create table if not exists public.pay_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.pay_my_household()
               references public.pay_households on delete cascade,
  code_hash    text unique not null,
  created_by   uuid not null default auth.uid() references auth.users on delete cascade,
  max_uses     int,
  uses         int not null default 0,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists pay_invites_household_idx on public.pay_invites (household_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.pay_households enable row level security;
alter table public.pay_members    enable row level security;
alter table public.pay_keys       enable row level security;
alter table public.pay_secrets    enable row level security;
alter table public.pay_people     enable row level security;
alter table public.pay_accounts   enable row level security;
alter table public.pay_expenses   enable row level security;
alter table public.pay_invites    enable row level security;

drop policy if exists pay_households_member on public.pay_households;
create policy pay_households_member on public.pay_households
  for select to authenticated using (public.pay_is_member(id));

-- Members see each other within the same household. Adding one is done by the
-- trigger at sign-up; it cannot be done by hand, or the invite would be a
-- formality. Leaving is always up to you.
drop policy if exists pay_members_read on public.pay_members;
create policy pay_members_read on public.pay_members
  for select to authenticated using (public.pay_is_member(household_id));

drop policy if exists pay_members_leave on public.pay_members;
create policy pay_members_leave on public.pay_members
  for delete to authenticated using (user_id = auth.uid());

-- Keys: everyone in the household may read them (you have to be able to see
-- someone's public key in order to let them in), but only write your own row.
-- The `for_me` package is placed by another member, and that goes through
-- pay_share_key() further down — not through an update, because then someone
-- could swap your public key for theirs and read along.
drop policy if exists pay_keys_read on public.pay_keys;
create policy pay_keys_read on public.pay_keys
  for select to authenticated using (public.pay_is_member(household_id));

drop policy if exists pay_keys_insert on public.pay_keys;
create policy pay_keys_insert on public.pay_keys
  for insert to authenticated
  with check (user_id = auth.uid() and public.pay_is_member(household_id));

drop policy if exists pay_keys_update on public.pay_keys;
create policy pay_keys_update on public.pay_keys
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pay_secrets_own on public.pay_secrets;
create policy pay_secrets_own on public.pay_secrets
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The data: shared property of the household. Everyone who belongs to it may
-- read and change everything — it is about money you spend together, and half an
-- overview is no overview.
drop policy if exists pay_people_member on public.pay_people;
create policy pay_people_member on public.pay_people
  for all to authenticated
  using (public.pay_is_member(household_id))
  with check (
    public.pay_is_member(household_id)
    -- Linking yourself to a person is fine; linking someone else is not.
    and (linked_user is null or linked_user = auth.uid())
  );

drop policy if exists pay_accounts_member on public.pay_accounts;
create policy pay_accounts_member on public.pay_accounts
  for all to authenticated
  using (public.pay_is_member(household_id))
  with check (public.pay_is_member(household_id));

drop policy if exists pay_expenses_member on public.pay_expenses;
create policy pay_expenses_member on public.pay_expenses
  for all to authenticated
  using (public.pay_is_member(household_id))
  with check (public.pay_is_member(household_id));

drop policy if exists pay_invites_member on public.pay_invites;
create policy pay_invites_member on public.pay_invites
  for all to authenticated
  using (public.pay_is_member(household_id))
  with check (public.pay_is_member(household_id) and created_by = auth.uid());

-- ============================================================================
-- Grants
-- ============================================================================
-- Supabase grants anon/authenticated rights on everything in "public" by
-- default. We set it out explicitly here rather than relying on that default:
-- anon has no business on any table, and authenticated does not get past RLS
-- anyway.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  public.pay_people, public.pay_accounts, public.pay_expenses,
  public.pay_invites, public.pay_secrets
  to authenticated;
grant select, insert, update on public.pay_keys to authenticated;
grant select on public.pay_households to authenticated;
grant select, delete on public.pay_members to authenticated;

revoke all on function public.pay_my_household() from public;
revoke all on function public.pay_is_member(uuid) from public;
grant execute on function public.pay_my_household() to authenticated;
grant execute on function public.pay_is_member(uuid) to authenticated;

-- ============================================================================
-- RPC: giving someone access to the household key
-- ============================================================================
-- A member wraps the household key with the newcomer's public key and puts that
-- package here. The function runs as SECURITY DEFINER because it writes into
-- someone else's row — hence the two checks: the caller must be a member of the
-- same household, and so must the recipient. It may do no more than that: the
-- public key is left untouched, so you cannot swap someone's key for your own
-- in order to read along.
create or replace function public.pay_share_key(p_user uuid, p_package jsonb)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.pay_members where user_id = auth.uid() limit 1;
  if hh is null then
    raise exception 'Je hoort bij geen enkel huishouden.';
  end if;

  if not exists (select 1 from public.pay_members where user_id = p_user and household_id = hh) then
    raise exception 'Die persoon hoort niet bij jouw huishouden.';
  end if;

  update public.pay_keys
     set for_me = p_package, shared_at = now()
   where user_id = p_user and household_id = hh;

  if not found then
    raise exception 'Die persoon heeft nog geen sleutel klaargezet.';
  end if;
end;
$$;

revoke all on function public.pay_share_key(uuid, jsonb) from public;
grant execute on function public.pay_share_key(uuid, jsonb) to authenticated;

-- ============================================================================
-- Is this project still empty?
-- ============================================================================
-- While there is nobody, the sign-in screen offers signing up without an invite.
-- After that, the door closes.
create or replace function public.pay_needs_bootstrap()
returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select not exists (select 1 from public.pay_members);
$$;

revoke all on function public.pay_needs_bootstrap() from public;
grant execute on function public.pay_needs_bootstrap() to anon, authenticated;

-- ============================================================================
-- What happens when someone signs up
-- ============================================================================
-- The very first user gets a fresh household. Everyone after that needs a valid
-- invite code and lands in the household that code belongs to. This is the layer
-- that actually enforces it: hiding the form only stops bots, this also stops
-- someone calling the auth endpoint directly.
--
-- Unlike the readable version, this trigger no longer creates a person. It
-- cannot: a name belongs encrypted, and the key does not exist here. The app
-- does it after signing in.
create or replace function public.pay_new_user()
returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  first_one boolean;
  code      text;
  invite    public.pay_invites;
  hh        uuid;
begin
  select not exists (select 1 from public.pay_members) into first_one;

  if first_one then
    insert into public.pay_households default values returning id into hh;
    insert into public.pay_members (household_id, user_id, role) values (hh, new.id, 'owner');
    return new;
  end if;

  code := new.raw_user_meta_data ->> 'invite';
  if code is null or code = '' then
    raise exception 'Voor Pay heb je een uitnodiging nodig.';
  end if;

  select * into invite from public.pay_invites
   where code_hash = encode(digest(code, 'sha256'), 'hex');

  if not found
     or invite.revoked_at is not null
     or (invite.expires_at is not null and invite.expires_at < now())
     or (invite.max_uses is not null and invite.uses >= invite.max_uses) then
    raise exception 'Deze uitnodiging is niet (meer) geldig.';
  end if;

  insert into public.pay_members (household_id, user_id, role)
  values (invite.household_id, new.id, 'member')
  on conflict do nothing;

  update public.pay_invites set uses = uses + 1 where id = invite.id;
  return new;
end;
$$;

drop trigger if exists pay_on_new_user on auth.users;
create trigger pay_on_new_user
  after insert on auth.users
  for each row execute function public.pay_new_user();

-- ============================================================================
-- Keeping updated_at
-- ============================================================================
create or replace function public.pay_touch()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pay_expenses_touch on public.pay_expenses;
create trigger pay_expenses_touch
  before update on public.pay_expenses
  for each row execute function public.pay_touch();

drop trigger if exists pay_secrets_touch on public.pay_secrets;
create trigger pay_secrets_touch
  before update on public.pay_secrets
  for each row execute function public.pay_touch();
