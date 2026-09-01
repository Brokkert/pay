-- ============================================================================
-- Pay — testscript voor het beveiligingsmodel
-- ----------------------------------------------------------------------------
-- Draait tegen een kale PostgreSQL met een nagebootst Supabase-laagje
-- (auth.users, auth.uid()), zodat je kunt controleren dat:
--
--   * er niets leesbaars in de database staat — geen naam, geen bedrag;
--   * de eerste gebruiker een huishouden krijgt en de rest een uitnodiging
--     nodig heeft, ook als iemand het formulier overslaat;
--   * een ingetrokken, verlopen of opgebruikte uitnodiging echt dichtgaat;
--   * een ander huishouden je gegevens niet ziet, en anon helemaal niets;
--   * je jezelf wel aan een persoon kunt koppelen en iemand anders niet;
--   * je eigen sleutelpakketjes privé zijn, ook voor je huisgenoten;
--   * de sleutel doorgeven alleen binnen je eigen huishouden kan.
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
\echo '### 2. Er staat nergens een leesbaar veld'
-- Dit is de kern van de belofte. Als iemand ooit een kolom "naam" of "bedrag"
-- terugzet omdat het even handig was, valt de build hier om.
do $$
declare
  gevonden text;
begin
  select string_agg(table_name || '.' || column_name, ', ')
    into gevonden
    from information_schema.columns
   where table_schema = 'public'
     and table_name in ('pay_personen', 'pay_rekeningen', 'pay_posten', 'pay_huishoudens')
     and column_name not in ('id', 'huishouden_id', 'gekoppeld_aan', 'geheim',
                             'created_at', 'updated_at');
  if gevonden is not null then
    raise exception 'Deze kolommen staan buiten de versleuteling: %', gevonden;
  end if;
  raise notice 'Alleen id, huishouden, koppeling en de versleutelde blob';
end;
$$;

\echo ''
\echo '### 3. De eerste gebruiker krijgt een huishouden'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'eerste@voorbeeld.nl');

do $$
declare
  hh uuid;
begin
  select huishouden_id into hh from public.pay_leden
   where user_id = '11111111-1111-1111-1111-111111111111';
  if hh is null then raise exception 'Eerste gebruiker kreeg geen huishouden'; end if;

  -- En géén persoon: die heeft een naam, en een naam hoort versleuteld te zijn.
  -- De trigger heeft de sleutel niet, dus dat doet de app.
  if exists (select 1 from public.pay_personen) then
    raise exception 'De trigger maakte een persoon aan; die kan niet versleuteld zijn';
  end if;
  raise notice 'Huishouden aangemaakt, geen leesbare persoon erbij';
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
\echo '### 4. Zonder uitnodiging kom je er niet in — ook niet buiten het formulier om'
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
\echo '### 5. Een ingetrokken, verlopen of opgebruikte code gaat dicht'
set pay.test_uid = '11111111-1111-1111-1111-111111111111';

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, max_keer, ingetrokken_op)
select public.pay_mijn_huishouden(), encode(extensions.digest('ingetrokken', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1, now();

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, max_keer, verloopt_op)
select public.pay_mijn_huishouden(), encode(extensions.digest('verlopen', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1, now() - interval '1 day';

insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, max_keer, gebruikt)
select public.pay_mijn_huishouden(), encode(extensions.digest('op', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1, 1;

do $$
declare
  code text;
begin
  foreach code in array array['ingetrokken', 'verlopen', 'op', 'verzonnen'] loop
    begin
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), code || '@example.com', jsonb_build_object('invite', code));
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
\echo '### 6. Een geldige uitnodiging laat iemand toe in hetzelfde huishouden'
insert into public.pay_uitnodigingen (huishouden_id, code_hash, aangemaakt_door, max_keer)
select public.pay_mijn_huishouden(), encode(extensions.digest('welkom', 'sha256'), 'hex'),
       '11111111-1111-1111-1111-111111111111', 1;

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'tweede@voorbeeld.nl', '{"invite":"welkom"}'::jsonb);

do $$
declare
  mijn uuid;
  hare uuid;
  n    int;
begin
  select huishouden_id into mijn from public.pay_leden
   where user_id = '11111111-1111-1111-1111-111111111111';
  select huishouden_id into hare from public.pay_leden
   where user_id = '33333333-3333-3333-3333-333333333333';
  if hare is distinct from mijn then
    raise exception 'De uitgenodigde belandde niet in hetzelfde huishouden';
  end if;

  select gebruikt into n from public.pay_uitnodigingen
   where code_hash = encode(extensions.digest('welkom', 'sha256'), 'hex');
  if n <> 1 then raise exception 'De teller van de uitnodiging liep niet op'; end if;
  raise notice 'Uitgenodigde toegevoegd, teller op 1';

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
\echo '### 7. Wat in het huishouden staat, blijft in het huishouden'
-- Het id van ons huishouden vastleggen nu we het nog kunnen lezen. Straks
-- proberen we er als vreemde in te schrijven, en dan moet dat id van buiten
-- komen: een select op pay_leden geeft een vreemde netjes nul rijen, en een
-- insert van nul rijen slaagt altijd — daarmee zou de test zichzelf voor de gek
-- houden en niets bewijzen.
do $$
begin
  perform set_config('pay.test_hh', huishouden_id::text, false)
     from public.pay_leden where user_id = '11111111-1111-1111-1111-111111111111';
end;
$$;

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
  insert into public.pay_huishoudens default values returning id into ander;
  insert into public.pay_leden (huishouden_id, user_id, rol)
  values (ander, '44444444-4444-4444-4444-444444444444', 'eigenaar');
end;
$$;

set role authenticated;
set pay.test_uid = '11111111-1111-1111-1111-111111111111';

insert into public.pay_personen (geheim) values ('{"iv":"aa","ct":"bb"}'::jsonb);
insert into public.pay_rekeningen (geheim) values ('{"iv":"cc","ct":"dd"}'::jsonb);
insert into public.pay_posten (geheim) values ('{"iv":"ee","ct":"ff"}'::jsonb);

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
  n   int;
  ons uuid := current_setting('pay.test_hh')::uuid;
begin
  select count(*) into n from public.pay_posten;
  if n <> 0 then raise exception 'Het andere huishouden ziet % posten', n; end if;
  select count(*) into n from public.pay_personen;
  if n <> 0 then raise exception 'Het andere huishouden ziet % personen', n; end if;
  select count(*) into n from public.pay_rekeningen;
  if n <> 0 then raise exception 'Het andere huishouden ziet % rekeningen', n; end if;
  raise notice 'Het huishouden hiernaast ziet niets van ons';

  begin
    insert into public.pay_posten (huishouden_id, geheim) values (ons, '{"ct":"x"}'::jsonb);
    raise exception 'Een vreemde kon een post in ons huishouden schrijven';
  exception when insufficient_privilege then
    raise notice 'Schrijven in een vreemd huishouden: geweigerd';
  end;

  update public.pay_posten set geheim = '{"ct":"x"}'::jsonb;
  if found then raise exception 'Een vreemde kon onze posten wijzigen'; end if;
  raise notice 'Wijzigen levert een vreemde nul rijen op';
end;
$$;

\echo ''
\echo '### 8. Zonder account zie je helemaal niets'
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
\echo '### 9. Je sleutelpakketjes zijn van jou alleen'
set role authenticated;
set pay.test_uid = '11111111-1111-1111-1111-111111111111';
insert into public.pay_geheimen (user_id, huis_gewrapt)
values ('11111111-1111-1111-1111-111111111111', '{"ct":"mijn-pakketje"}'::jsonb);

set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  n int;
begin
  select count(*) into n from public.pay_geheimen;
  if n <> 0 then raise exception 'Een huisgenoot ziet jouw sleutelpakketje'; end if;
  raise notice 'Sleutelpakketjes blijven privé, ook binnen het huishouden';
end;
$$;

\echo ''
\echo '### 10. De sleutel doorgeven kan alleen binnen je eigen huishouden'
-- De nieuwkomer zet haar publieke sleutel klaar.
insert into public.pay_sleutels (user_id, publiek)
values ('33333333-3333-3333-3333-333333333333', '{"kty":"RSA","n":"nep"}'::jsonb);

set pay.test_uid = '11111111-1111-1111-1111-111111111111';
do $$
declare
  n int;
begin
  perform public.pay_deel_sleutel('33333333-3333-3333-3333-333333333333',
                                  '{"ct":"voor-haar"}'::jsonb);
  select count(*) into n from public.pay_sleutels
   where user_id = '33333333-3333-3333-3333-333333333333' and voor_mij is not null;
  if n <> 1 then raise exception 'Het pakketje kwam niet aan'; end if;
  raise notice 'Sleutel doorgegeven binnen het huishouden';

  begin
    perform public.pay_deel_sleutel('44444444-4444-4444-4444-444444444444',
                                    '{"ct":"voor-de-buurman"}'::jsonb);
    raise exception 'Je kon de sleutel naar een vreemde sturen';
  exception when others then
    if sqlerrm like '%niet bij jouw huishouden%' then
      raise notice 'Sleutel naar een vreemde: geweigerd';
    else
      raise;
    end if;
  end;
end;
$$;

-- En de ontvanger kan haar eigen publieke sleutel niet stiekem laten vervangen
-- door die van iemand anders: dat kan alleen zijzelf, want de update-policy
-- staat op user_id = auth.uid().
do $$
begin
  update public.pay_sleutels set publiek = '{"kty":"RSA","n":"die-van-mij"}'::jsonb
   where user_id = '33333333-3333-3333-3333-333333333333';
  if found then
    raise exception 'Een huisgenoot kon andermans publieke sleutel omruilen';
  end if;
  raise notice 'Andermans publieke sleutel omruilen: levert nul rijen op';
end;
$$;

\echo ''
\echo '### 11. Je kunt jezelf koppelen, en niemand anders'
set pay.test_uid = '33333333-3333-3333-3333-333333333333';
do $$
declare
  los uuid;
begin
  select id into los from public.pay_personen limit 1;

  begin
    update public.pay_personen
       set gekoppeld_aan = '44444444-4444-4444-4444-444444444444'
     where id = los;
    raise exception 'Een lid kon een persoon aan een vreemd account koppelen';
  exception when insufficient_privilege then
    raise notice 'Koppelen aan andermans account: geweigerd';
  end;

  update public.pay_personen
     set gekoppeld_aan = '33333333-3333-3333-3333-333333333333'
   where id = los;
  if not found then raise exception 'Jezelf koppelen werd geweigerd'; end if;
  raise notice 'Jezelf aan een persoon koppelen: toegestaan';
end;
$$;

reset role;
