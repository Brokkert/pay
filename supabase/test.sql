-- ============================================================================
-- Pay — testscript voor het beveiligingsmodel
-- ----------------------------------------------------------------------------
-- Draait tegen een kale PostgreSQL met een nagebootst Supabase-laagje
-- (auth.users, auth.uid()), zodat je kunt controleren dat:
--
--   * de eerste gebruiker een huishouden krijgt en de rest een uitnodiging
--     nodig heeft — ook als iemand het formulier overslaat;
--   * een ingetrokken, verlopen of opgebruikte uitnodiging echt dichtgaat;
--   * een ander huishouden je posten niet ziet, en anon helemaal niets;
--   * je jezelf wel aan een persoon kunt koppelen en iemand anders niet.
--
-- Gebruik:  ./supabase/run-tests.sh
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '### 1. Een leeg project herkent zichzelf als leeg'
do $$
begin
  if not public.pay_needs_bootstrap() then
    raise exception 'Leeg project meldt zich niet als leeg; de eerste gebruiker komt er dan nooit in';
  end if;
  raise notice 'Leeg project: eerste aanmelding wordt aangeboden';
end;
$$;

\echo ''
\echo '### 2. De eerste gebruiker krijgt een huishouden en een eigen persoon'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'laurens@voorbeeld.nl');

do $$
declare
  hh uuid;
  n  int;
begin
  select huishouden_id into hh from public.pay_leden
   where user_id = '11111111-1111-1111-1111-111111111111';
  if hh is null then raise exception 'Eerste gebruiker kreeg geen huishouden'; end if;

  select count(*) into n from public.pay_personen
   where huishouden_id = hh
     and gekoppeld_aan = '11111111-1111-1111-1111-111111111111'
     and is_mij;
  if n <> 1 then raise exception 'Eerste gebruiker kreeg geen gekoppelde persoon'; end if;
  raise notice 'Huishouden aangemaakt, persoon gekoppeld';
end;
$$;

do $$
begin
  if public.pay_needs_bootstrap() then
    raise exception 'Na de eerste gebruiker staat de deur nog open';
  end if;
  raise notice 'De deur voor de eerste gebruiker is dicht';
end;
$$;

\echo ''
\echo '### 3. Zonder uitnodiging kom je er niet in — ook niet buiten het formulier om'
do $$
begin
  begin
    insert into auth.users (id, email)
    values ('22222222-2222-2222-2222-222222222222', 'vreemde@example.com');
    raise exception 'Aanmelden zonder uitnodiging werd toegestaan';
  exception when others then
    if sqlerrm like '%uitnodiging nodig%' then
      raise notice 'Zonder uitnodiging: geweigerd';
    else
      raise;
    end if;
  end;
end;
$$;

\echo ''
\echo '### 4. Een ingetrokken, verlopen of opgebruikte code gaat dicht'
set pay.test_uid = '11111111-1111-1111-1111-111111111111';

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, label, max_keer, ingetrokken_op)
select public.pay_mijn_huishouden(), encode(extensions.digest('ingetrokken', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 'ingetrokken', 1, now();

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, label, max_keer, verloopt_op)
select public.pay_mijn_huishouden(), encode(extensions.digest('verlopen', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 'verlopen', 1, now() - interval '1 day';

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, label, max_keer, gebruikt)
select public.pay_mijn_huishouden(), encode(extensions.digest('op', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 'op', 1, 1;

do $$
declare
  code text;
begin
  foreach code in array array['ingetrokken', 'verlopen', 'op', 'verzonnen'] loop
    begin
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), code || '@example.com',
              jsonb_build_object('invite', code));
      raise exception 'Code "%" werd geaccepteerd terwijl dat niet mocht', code;
    exception when others then
      if sqlerrm like '%niet (meer) geldig%' then
        raise notice 'Code "%": geweigerd', code;
      else
        raise;
      end if;
    end;
  end loop;
end;
$$;

\echo ''
\echo '### 5. Een geldige uitnodiging laat iemand toe in hetzelfde huishouden'
-- We maken vast een persoon "Anne" zonder account aan, zoals je die zou
-- aanmaken voordat je vriendin zelf inlogt.
insert into public.pay_personen (huishouden_id, naam)
select public.pay_mijn_huishouden(), 'Anne';

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, max_keer)
select public.pay_mijn_huishouden(), encode(extensions.digest('welkom', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1;

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'anne@voorbeeld.nl', '{"invite":"welkom"}'::jsonb);

do $$
declare
  mijn   uuid;
  hare   uuid;
  aantal int;
begin
  select huishouden_id into mijn from public.pay_leden
   where user_id = '11111111-1111-1111-1111-111111111111';
  select huishouden_id into hare from public.pay_leden
   where user_id = '33333333-3333-3333-3333-333333333333';
  if hare is distinct from mijn then
    raise exception 'De uitgenodigde belandde niet in hetzelfde huishouden';
  end if;

  -- Geen tweede "Anne": de bestaande persoon is opgepakt.
  select count(*) into aantal from public.pay_personen
   where huishouden_id = mijn and lower(naam) = 'anne';
  if aantal <> 1 then
    raise exception 'Er staan nu % personen met de naam Anne in plaats van 1', aantal;
  end if;

  select count(*) into aantal from public.pay_personen
   where huishouden_id = mijn
     and lower(naam) = 'anne'
     and gekoppeld_aan = '33333333-3333-3333-3333-333333333333';
  if aantal <> 1 then raise exception 'De bestaande persoon Anne is niet gekoppeld'; end if;

  raise notice 'Uitgenodigde toegevoegd en aan de bestaande persoon gekoppeld';
end;
$$;

do $$
declare
  n int;
begin
  select gebruikt into n from public.pay_uitnodigingen
   where code_hash = encode(extensions.digest('welkom', 'sha256'), 'hex');
  if n <> 1 then raise exception 'De teller van de uitnodiging liep niet op'; end if;

  -- En daarmee is hij op.
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (gen_random_uuid(), 'nog.iemand@example.com', '{"invite":"welkom"}'::jsonb);
    raise exception 'Een uitnodiging voor één keer werkte een tweede keer';
  exception when others then
    if sqlerrm like '%niet (meer) geldig%' then
      raise notice 'Eenmalige uitnodiging is na gebruik dicht';
    else
      raise;
    end if;
  end;
end;
$$;

\echo ''
\echo '### 6. Wat er in het huishouden staat, blijft binnen het huishouden'
-- Een tweede huishouden opzetten kan alleen door de trigger even opzij te
-- zetten — die laat immers niemand zonder uitnodiging binnen. Dat is precies
-- wat we hier willen bewijzen: dit huishouden is er buiten Pay om, en mag
-- daarom niets van het onze zien.
alter table auth.users disable trigger pay_op_nieuwe_gebruiker;
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'buurman@example.com')
  on conflict do nothing;
alter table auth.users enable trigger pay_op_nieuwe_gebruiker;

do $$
declare
  ander uuid;
begin
  insert into public.pay_huishoudens (naam) values ('Hiernaast') returning id into ander;
  insert into public.pay_leden (huishouden_id, user_id, rol)
  values (ander, '44444444-4444-4444-4444-444444444444', 'eigenaar');
end;
$$;

-- Het id van ons huishouden vastleggen nu we het nog kunnen lezen. Straks
-- proberen we er als vreemde in te schrijven, en dan moet dat id van buiten
-- komen: een select op pay_leden geeft een vreemde immers netjes nul rijen, en
-- een insert van nul rijen slaagt altijd — daarmee zou de test zichzelf voor de
-- gek houden en niets bewijzen.
do $$
begin
  perform set_config('pay.test_hh', huishouden_id::text, false)
     from public.pay_leden where user_id = '11111111-1111-1111-1111-111111111111';
end;
$$;

-- Mijn eigen post, met RLS aan.
set role authenticated;
set pay.test_uid = '11111111-1111-1111-1111-111111111111';

insert into public.pay_rekeningen (naam, soort, deelnemers)
select 'Gezamenlijk', 'gezamenlijk', array[id]
  from public.pay_personen
 where gekoppeld_aan = '11111111-1111-1111-1111-111111111111';

insert into public.pay_posten (naam, bedrag, ritme, betaler)
select 'Huur', 140000, 'maand',
       jsonb_build_object('soort', 'rekening', 'id', id)
  from public.pay_rekeningen limit 1;

do $$
declare
  n int;
begin
  select count(*) into n from public.pay_posten;
  if n <> 1 then raise exception 'De eigenaar ziet zijn eigen post niet (% gevonden)', n; end if;
  raise notice 'Eigenaar ziet zijn eigen post';
end;
$$;

set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  n int;
begin
  select count(*) into n from public.pay_posten;
  if n <> 1 then raise exception 'De huisgenoot ziet de gedeelde post niet (% gevonden)', n; end if;
  raise notice 'Huisgenoot ziet dezelfde post';
end;
$$;

set pay.test_uid = '44444444-4444-4444-4444-444444444444';
do $$
declare
  n int;
begin
  select count(*) into n from public.pay_posten;
  if n <> 0 then raise exception 'Het andere huishouden ziet % posten', n; end if;
  select count(*) into n from public.pay_personen;
  if n <> 0 then raise exception 'Het andere huishouden ziet % personen', n; end if;
  select count(*) into n from public.pay_rekeningen;
  if n <> 0 then raise exception 'Het andere huishouden ziet % rekeningen', n; end if;
  raise notice 'Het huishouden hiernaast ziet niets van ons';
end;
$$;

do $$
declare
  ons uuid := current_setting('pay.test_hh')::uuid;
begin
  begin
    insert into public.pay_posten (huishouden_id, naam, bedrag)
    values (ons, 'Ingeslopen', 1);
    raise exception 'Een vreemde kon een post in ons huishouden schrijven';
  exception when insufficient_privilege then
    raise notice 'Schrijven in een vreemd huishouden: geweigerd';
  end;

  begin
    insert into public.pay_personen (huishouden_id, naam) values (ons, 'Ingeslopen');
    raise exception 'Een vreemde kon een persoon in ons huishouden schrijven';
  exception when insufficient_privilege then
    raise notice 'Persoon toevoegen aan een vreemd huishouden: geweigerd';
  end;

  begin
    update public.pay_posten set bedrag = 1;
    if found then raise exception 'Een vreemde kon onze posten wijzigen'; end if;
    raise notice 'Wijzigen levert een vreemde nul rijen op';
  end;
end;
$$;

\echo ''
\echo '### 7. Zonder account zie je helemaal niets'
set role anon;
set pay.test_uid = '';
do $$
begin
  begin
    perform count(*) from public.pay_posten;
    raise exception 'anon kon de postentabel bevragen';
  exception when insufficient_privilege then
    raise notice 'anon komt niet bij de tabellen';
  end;
end;
$$;

\echo ''
\echo '### 8. Je kunt jezelf koppelen, en niemand anders'
set role authenticated;
set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  vreemde uuid;
  los     uuid;
begin
  select id into vreemde from public.pay_personen
   where gekoppeld_aan = '11111111-1111-1111-1111-111111111111';

  begin
    update public.pay_personen
       set gekoppeld_aan = '44444444-4444-4444-4444-444444444444'
     where id = vreemde;
    raise exception 'Een lid kon een persoon aan een vreemd account koppelen';
  exception when insufficient_privilege then
    raise notice 'Koppelen aan andermans account: geweigerd';
  end;

  -- Wat wél moet kunnen: jezelf op een persoon zonder account zetten. Zo werkt
  -- de knop "dit ben ik" als de trigger de verkeerde naam had opgepakt.
  insert into public.pay_personen (naam) values ('Naamloos') returning id into los;
  update public.pay_personen
     set gekoppeld_aan = null
   where gekoppeld_aan = '33333333-3333-3333-3333-333333333333';
  update public.pay_personen
     set gekoppeld_aan = '33333333-3333-3333-3333-333333333333'
   where id = los;
  if not found then raise exception 'Jezelf koppelen werd geweigerd'; end if;
  raise notice 'Jezelf aan een losse persoon koppelen: toegestaan';
end;
$$;

\echo ''
\echo '### 9. Een rekening zonder eigenaar of zonder deelnemers komt er niet in'
do $$
begin
  begin
    insert into public.pay_rekeningen (naam, soort) values ('Zwevend', 'prive');
    raise exception 'Een privérekening zonder eigenaar werd geaccepteerd';
  exception when check_violation then
    raise notice 'Privérekening zonder eigenaar: geweigerd';
  end;

  begin
    insert into public.pay_rekeningen (naam, soort, deelnemers) values ('Lege pot', 'gezamenlijk', '{}');
    raise exception 'Een pot zonder deelnemers werd geaccepteerd';
  exception when check_violation then
    raise notice 'Pot zonder deelnemers: geweigerd';
  end;
end;
$$;

reset role;
