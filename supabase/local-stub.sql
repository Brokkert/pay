-- Minimale nabootsing van wat Supabase zelf al meelevert (auth, rollen), zodat
-- schema.sql en test.sql op een kale PostgreSQL draaien.
-- Dit bestand hoort NIET in je Supabase-project — daar bestaat dit al.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  -- Hier zet Supabase mee wat de client bij het aanmelden meegeeft via
  -- options.data. Pay gebruikt dat voor de uitnodigingscode.
  raw_user_meta_data jsonb
);

-- In Supabase leest auth.uid() de JWT; hier lezen we een sessie-variabele.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('pay.test_uid', true), '')::uuid;
$$;

grant usage on schema public, auth to anon, authenticated;

-- Belangrijk voor een eerlijke test: Supabase zet standaardrechten zo dat ELKE
-- nieuwe tabel in "public" automatisch volledig toegankelijk wordt voor anon en
-- authenticated. Als we dat hier niet nabootsen, kan anon er lokaal toch al niet
-- bij en bewijst een test dat anon niets ziet helemaal niets. Met deze regel
-- moet schema.sql die rechten actief weer afpakken — net als in het echt.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
