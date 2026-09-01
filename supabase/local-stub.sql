-- A minimal stand-in for what Supabase ships itself (auth, roles), so that
-- schema.sql and test.sql run on a bare PostgreSQL.
-- This file does NOT belong in your Supabase project — there it already exists.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  -- This is where Supabase puts whatever the client passes at sign-up through
  -- options.data. Pay uses it for the invite code.
  raw_user_meta_data jsonb
);

-- In Supabase auth.uid() reads the JWT; here we read a session variable.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('pay.test_uid', true), '')::uuid;
$$;

grant usage on schema public, auth to anon, authenticated;

-- Important for a fair test: Supabase sets default privileges so that EVERY new
-- table in "public" automatically becomes fully accessible to anon and
-- authenticated. Without mimicking that here, anon could not reach them locally
-- anyway, and a test proving anon sees nothing would prove nothing. With this
-- line, schema.sql has to actively take those rights away again — just like in
-- the real thing.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
