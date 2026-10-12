#!/usr/bin/env bash
# Local RLS test: throwaway Postgres with a Supabase-like auth shim. Usage: bash tests/policies.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); PORT=55432
"$BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
trap '"$BIN/pg_ctl" -D "$DIR" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
P="psql -X -q -v ON_ERROR_STOP=1 -h $DIR -p $PORT -U postgres -d postgres -o /dev/null"
$P <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
SQL
$P -f supabase_schema.sql -f stripe_supabase_update.sql
# legacy row with public contact columns, to test the data move
$P -c "insert into auth.users values ('00000000-0000-0000-0000-00000000000a','owner@x.com');
insert into profiles(id,email) values ('00000000-0000-0000-0000-00000000000a','owner@x.com');
insert into truck_listings(id,owner_id,title,rate,phone,email) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Legacy truck',100,'555-0100','owner@x.com');"
$P -f supabase_security.sql
$P -f supabase_security.sql   # idempotency
$P -f tests/policies.sql
echo "POLICY TESTS PASSED"
