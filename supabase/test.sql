-- ============================================================================
-- Pay — test script for the security model
-- ----------------------------------------------------------------------------
-- Runs against a bare PostgreSQL with a stand-in for the Supabase layer
-- (auth.users, auth.uid()), so you can check that:
--
--   * nothing readable is stored — no name, no amount;
--   * the first user gets a household and everyone after that needs an invite,
--     also when someone skips the form;
--   * a revoked, expired or used-up invite really closes;
--   * another household cannot see your data, and anon cannot see anything;
--   * you can link yourself to a person but not someone else;
--   * your own key packages stay private, even from your housemates;
--   * passing the key on only works inside your own household.
--
-- Usage:  ./supabase/run-tests.sh
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '### 1. An empty project recognises itself as empty'
do $$
begin
  if not public.pay_needs_bootstrap() then
    raise exception 'Empty project does not report itself empty; the first user could never get in';
  end if;
  raise notice 'Empty project: first sign-up is offered';
end;
$$;

\echo ''
\echo '### 2. There is no readable field anywhere'
-- This is the heart of the promise. If anyone ever puts a "name" or "amount"
-- column back because it was convenient, the build falls over right here.
do $$
declare
  found text;
begin
  select string_agg(table_name || '.' || column_name, ', ')
    into found
    from information_schema.columns
   where table_schema = 'public'
     and table_name in ('pay_people', 'pay_accounts', 'pay_expenses', 'pay_households')
     and column_name not in ('id', 'household_id', 'linked_user', 'secret',
                             'created_at', 'updated_at');
  if found is not null then
    raise exception 'These columns sit outside the encryption: %', found;
  end if;
  raise notice 'Only id, household, link and the encrypted blob';
end;
$$;

\echo ''
\echo '### 3. The first user gets a household'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'first@example.com');

do $$
declare
  hh uuid;
begin
  select household_id into hh from public.pay_members
   where user_id = '11111111-1111-1111-1111-111111111111';
  if hh is null then raise exception 'First user got no household'; end if;

  -- And no person: a person has a name, and a name belongs encrypted. The
  -- trigger does not have the key, so the app does that.
  if exists (select 1 from public.pay_people) then
    raise exception 'The trigger created a person; that cannot have been encrypted';
  end if;
  raise notice 'Household created, no readable person alongside it';
end;
$$;

do $$
begin
  if public.pay_needs_bootstrap() then
    raise exception 'After the first user the door is still open';
  end if;
  raise notice 'The door for the first user is shut';
end;
$$;

\echo ''
\echo '### 4. Without an invite you do not get in — not even around the form'
do $$
begin
  begin
    insert into auth.users (id, email)
    values ('22222222-2222-2222-2222-222222222222', 'stranger@example.com');
    raise exception 'Signing up without an invite was allowed';
  exception when others then
    if sqlerrm like '%uitnodiging nodig%' then
      raise notice 'Without an invite: refused';
    else
      raise;
    end if;
  end;
end;
$$;

\echo ''
\echo '### 5. A revoked, expired or used-up code closes'
set pay.test_uid = '11111111-1111-1111-1111-111111111111';

insert into public.pay_invites (household_id, code_hash, created_by, max_uses, revoked_at)
select public.pay_my_household(), encode(extensions.digest('revoked', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1, now();

insert into public.pay_invites (household_id, code_hash, created_by, max_uses, expires_at)
select public.pay_my_household(), encode(extensions.digest('expired', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1, now() - interval '1 day';

insert into public.pay_invites (household_id, code_hash, created_by, max_uses, uses)
select public.pay_my_household(), encode(extensions.digest('spent', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1, 1;

do $$
declare
  code text;
begin
  foreach code in array array['revoked', 'expired', 'spent', 'invented'] loop
    begin
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), code || '@example.com', jsonb_build_object('invite', code));
      raise exception 'Code "%" was accepted when it should not have been', code;
    exception when others then
      if sqlerrm like '%niet (meer) geldig%' then
        raise notice 'Code "%": refused', code;
      else
        raise;
      end if;
    end;
  end loop;
end;
$$;

\echo ''
\echo '### 6. A valid invite lets someone into the same household'
insert into public.pay_invites (household_id, code_hash, created_by, max_uses)
select public.pay_my_household(), encode(extensions.digest('welcome', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1;

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'second@example.com', '{"invite":"welcome"}'::jsonb);

do $$
declare
  mine   uuid;
  theirs uuid;
  n      int;
begin
  select household_id into mine from public.pay_members
   where user_id = '11111111-1111-1111-1111-111111111111';
  select household_id into theirs from public.pay_members
   where user_id = '33333333-3333-3333-3333-333333333333';
  if theirs is distinct from mine then
    raise exception 'The invitee did not land in the same household';
  end if;

  select uses into n from public.pay_invites
   where code_hash = encode(extensions.digest('welcome', 'sha256'), 'hex');
  if n <> 1 then raise exception 'The invite counter did not go up'; end if;
  raise notice 'Invitee added, counter at 1';

  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'someone.else@example.com', '{"invite":"welcome"}'::jsonb);
    raise exception 'A single-use invite worked a second time';
  exception when others then
    if sqlerrm like '%niet (meer) geldig%' then
      raise notice 'Single-use invite is shut after use';
    else
      raise;
    end if;
  end;
end;
$$;

\echo ''
\echo '### 7. What is in the household stays in the household'
-- Capture our household id while we can still read it. In a moment we try to
-- write into it as a stranger, and then that id has to come from outside: a
-- select on pay_members gives a stranger zero rows, and an insert of zero rows
-- always succeeds — which would have the test fooling itself and proving
-- nothing.
do $$
begin
  perform set_config('pay.test_hh', household_id::text, false)
     from public.pay_members where user_id = '11111111-1111-1111-1111-111111111111';
end;
$$;

-- Setting up a second household is only possible by putting the trigger aside
-- for a moment — it lets nobody in without an invite, after all. That is exactly
-- what we want to prove here: this household exists outside Pay, and must
-- therefore see nothing of ours.
alter table auth.users disable trigger pay_on_new_user;
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'neighbour@example.com')
  on conflict do nothing;
alter table auth.users enable trigger pay_on_new_user;

do $$
declare
  other uuid;
begin
  insert into public.pay_households default values returning id into other;
  insert into public.pay_members (household_id, user_id, role)
  values (other, '44444444-4444-4444-4444-444444444444', 'owner');
end;
$$;

set role authenticated;
set pay.test_uid = '11111111-1111-1111-1111-111111111111';

insert into public.pay_people (secret) values ('{"iv":"aa","ct":"bb"}'::jsonb);
insert into public.pay_accounts (secret) values ('{"iv":"cc","ct":"dd"}'::jsonb);
insert into public.pay_expenses (secret) values ('{"iv":"ee","ct":"ff"}'::jsonb);

do $$
declare
  n int;
begin
  select count(*) into n from public.pay_expenses;
  if n <> 1 then raise exception 'The owner cannot see their own expense (% found)', n; end if;
  raise notice 'Owner sees their own expense';
end;
$$;

set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  n int;
begin
  select count(*) into n from public.pay_expenses;
  if n <> 1 then raise exception 'The housemate cannot see the shared expense (% found)', n; end if;
  raise notice 'Housemate sees the same expense';
end;
$$;

set pay.test_uid = '44444444-4444-4444-4444-444444444444';
do $$
declare
  n    int;
  ours uuid := current_setting('pay.test_hh')::uuid;
begin
  select count(*) into n from public.pay_expenses;
  if n <> 0 then raise exception 'The other household sees % expenses', n; end if;
  select count(*) into n from public.pay_people;
  if n <> 0 then raise exception 'The other household sees % people', n; end if;
  select count(*) into n from public.pay_accounts;
  if n <> 0 then raise exception 'The other household sees % accounts', n; end if;
  raise notice 'The household next door sees nothing of ours';

  begin
    insert into public.pay_expenses (household_id, secret) values (ours, '{"ct":"x"}'::jsonb);
    raise exception 'A stranger could write an expense into our household';
  exception when insufficient_privilege then
    raise notice 'Writing into a strange household: refused';
  end;

  update public.pay_expenses set secret = '{"ct":"x"}'::jsonb;
  if found then raise exception 'A stranger could change our expenses'; end if;
  raise notice 'Updating gives a stranger zero rows';
end;
$$;

\echo ''
\echo '### 8. Without an account you see nothing at all'
set role anon;
set pay.test_uid = '';
do $$
begin
  begin
    perform count(*) from public.pay_expenses;
    raise exception 'anon could query the expenses table';
  exception when insufficient_privilege then
    raise notice 'anon cannot reach the tables';
  end;
end;
$$;

\echo ''
\echo '### 9. Your key packages are yours alone'
set role authenticated;
set pay.test_uid = '11111111-1111-1111-1111-111111111111';
insert into public.pay_secrets (user_id, wrapped_key)
values ('11111111-1111-1111-1111-111111111111', '{"ct":"my-package"}'::jsonb);

set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  n int;
begin
  select count(*) into n from public.pay_secrets;
  if n <> 0 then raise exception 'A housemate can see your key package'; end if;
  raise notice 'Key packages stay private, even inside the household';
end;
$$;

\echo ''
\echo '### 10. Passing the key on only works inside your own household'
-- The newcomer puts her public key out there.
insert into public.pay_keys (user_id, public_key)
values ('33333333-3333-3333-3333-333333333333', '{"kty":"RSA","n":"fake"}'::jsonb);

set pay.test_uid = '11111111-1111-1111-1111-111111111111';
do $$
declare
  n int;
begin
  perform public.pay_share_key('33333333-3333-3333-3333-333333333333', '{"ct":"for-her"}'::jsonb);
  select count(*) into n from public.pay_keys
   where user_id = '33333333-3333-3333-3333-333333333333' and for_me is not null;
  if n <> 1 then raise exception 'The package did not arrive'; end if;
  raise notice 'Key passed on inside the household';

  begin
    perform public.pay_share_key('44444444-4444-4444-4444-444444444444',
                                 '{"ct":"for-the-neighbour"}'::jsonb);
    raise exception 'You could send the key to a stranger';
  exception when others then
    if sqlerrm like '%niet bij jouw huishouden%' then
      raise notice 'Key to a stranger: refused';
    else
      raise;
    end if;
  end;
end;
$$;

-- And the recipient cannot have her public key quietly swapped for someone
-- else's: only she can do that, because the update policy is
-- user_id = auth.uid().
do $$
begin
  update public.pay_keys set public_key = '{"kty":"RSA","n":"mine"}'::jsonb
   where user_id = '33333333-3333-3333-3333-333333333333';
  if found then
    raise exception 'A housemate could swap someone else''s public key';
  end if;
  raise notice 'Swapping someone else''s public key: zero rows';
end;
$$;

\echo ''
\echo '### 11. You can link yourself, and nobody else'
set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  loose uuid;
begin
  select id into loose from public.pay_people limit 1;

  begin
    update public.pay_people
       set linked_user = '44444444-4444-4444-4444-444444444444'
     where id = loose;
    raise exception 'A member could link a person to a strange account';
  exception when insufficient_privilege then
    raise notice 'Linking to someone else''s account: refused';
  end;

  update public.pay_people
     set linked_user = '33333333-3333-3333-3333-333333333333'
   where id = loose;
  if not found then raise exception 'Linking yourself was refused'; end if;
  raise notice 'Linking yourself to a person: allowed';
end;
$$;

reset role;
