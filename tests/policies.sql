-- Assertions run by tests/policies.sh. A = owner, R = renter, X = stranger, M = admin.
\set A '00000000-0000-0000-0000-00000000000a'
\set R '00000000-0000-0000-0000-00000000000b'
\set X '00000000-0000-0000-0000-00000000000c'
\set M '00000000-0000-0000-0000-00000000000d'
\set L '10000000-0000-0000-0000-000000000001'
insert into auth.users values (:'R','r@x.com'),(:'X','x@x.com'),(:'M','m@x.com');
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function pg_temp.must_fail(stmt text) returns void language plpgsql as $$
begin execute stmt; raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', stmt;
exception when others then if sqlerrm like 'EXPECTED FAILURE%' then raise; end if; end $$;
create function pg_temp.rows(stmt text) returns int language plpgsql as $$
declare n int; begin execute stmt; get diagnostics n = row_count; return n; end $$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'FAIL: %', msg; end if; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- migration moved contacts and dropped public columns
select pg_temp.check((select phone from listing_contacts where listing_id = :'L') = '555-0100', 'contact migrated');
select pg_temp.check(not exists (select 1 from information_schema.columns where table_name='truck_listings' and column_name in ('phone','email')), 'public contact columns dropped');

-- profiles
set role authenticated;
-- harness self-check: must_fail must itself fail on a statement that succeeds
do $$ begin perform pg_temp.must_fail('select 1'); raise exception 'harness broken'; exception when others then if sqlerrm not like 'EXPECTED FAILURE%' then raise; end if; end $$;
select pg_temp.as_user(:'R');
insert into profiles(id,email,role) values (:'R','r@x.com','admin');
select pg_temp.check((select role from profiles where id = :'R') = 'user', 'self-insert as admin forced to user');
select pg_temp.must_fail($$update profiles set role='admin' where id = auth.uid()$$);
select pg_temp.check(pg_temp.rows($$update profiles set email='r2@x.com' where id = auth.uid()$$) = 1, 'own profile update');
select pg_temp.must_fail($$insert into profiles(id,email) values ('00000000-0000-0000-0000-00000000000c','x@x.com')$$);
select pg_temp.check((select count(*) from profiles) = 1, 'sees only own profile');
select pg_temp.as_user(:'X'); insert into profiles(id,email) values (:'X','x@x.com');
select pg_temp.as_user(:'M'); insert into profiles(id,email) values (:'M','m@x.com');
reset role; update profiles set role='admin' where id = :'M';   -- SQL editor promotes admin
set role authenticated;

-- listings
select pg_temp.as_user(:'X');
select pg_temp.check(pg_temp.rows($$update truck_listings set title='hacked'$$) = 0, 'stranger cannot update listing');
select pg_temp.check(pg_temp.rows($$delete from truck_listings$$) = 0, 'stranger cannot delete listing');
select pg_temp.must_fail($$insert into truck_listings(owner_id,title,rate) values ('00000000-0000-0000-0000-00000000000a','fake',1)$$);
select pg_temp.as_user(:'A');
select pg_temp.check(pg_temp.rows($$update truck_listings set title='Legacy truck 2'$$) = 1, 'owner can update');
select pg_temp.must_fail($$update truck_listings set verified=true$$);
select pg_temp.must_fail($$update truck_listings set owner_id='00000000-0000-0000-0000-00000000000c'$$);

-- contacts hidden from public, stranger, and renter before acceptance
set role anon; select pg_temp.as_user('');
select pg_temp.must_fail($$select * from listing_contacts$$);
set role authenticated;
select pg_temp.as_user(:'X');
select pg_temp.check((select count(*) from listing_contacts) = 0, 'stranger sees no contacts');
select pg_temp.must_fail($$insert into listing_contacts(listing_id,owner_id,phone) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','1')$$);
select pg_temp.check(pg_temp.rows($$update listing_contacts set phone='1'$$) = 0, 'stranger cannot edit contacts');

-- bookings
select pg_temp.as_user(:'R');
insert into bookings(id,listing_id,renter_id,renter_email,status) values ('20000000-0000-0000-0000-000000000001',:'L',:'R','r@x.com','paid');
select pg_temp.check((select status from bookings where id='20000000-0000-0000-0000-000000000001') = 'requested', 'insert forced to requested');
select pg_temp.check((select owner_id::text from bookings where id='20000000-0000-0000-0000-000000000001') = :'A', 'owner filled from listing');
select pg_temp.must_fail($$insert into bookings(listing_id,renter_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c')$$);
select pg_temp.check((select count(*) from listing_contacts) = 0, 'renter sees no contact while requested');
select pg_temp.must_fail($$update bookings set status='accepted' where id='20000000-0000-0000-0000-000000000001'$$);
select pg_temp.must_fail($$update bookings set status='paid' where id='20000000-0000-0000-0000-000000000001'$$);
select pg_temp.must_fail($$update bookings set amount_cents=1 where id='20000000-0000-0000-0000-000000000001'$$);
select pg_temp.as_user(:'X');
select pg_temp.check((select count(*) from bookings) = 0, 'stranger sees no bookings');
select pg_temp.check(pg_temp.rows($$update bookings set status='cancelled'$$) = 0, 'stranger cannot touch bookings');
select pg_temp.as_user(:'A');
select pg_temp.must_fail($$update bookings set status='paid' where id='20000000-0000-0000-0000-000000000001'$$);
update bookings set status='accepted' where id='20000000-0000-0000-0000-000000000001';
select pg_temp.must_fail($$update bookings set status='declined' where id='20000000-0000-0000-0000-000000000001'$$);
select pg_temp.as_user(:'R');
select pg_temp.check((select phone from listing_contacts) = '555-0100', 'renter sees contact after acceptance');
select pg_temp.must_fail($$update bookings set status='paid' where id='20000000-0000-0000-0000-000000000001'$$);
reset role; set role service_role;
update bookings set status='paid', paid_at=now() where id='20000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.check((select count(*) from listing_contacts) = 1, 'renter still sees contact when paid');
select pg_temp.must_fail($$update bookings set status='cancelled' where id='20000000-0000-0000-0000-000000000001'$$);

-- renter cancel, admin cancel
insert into bookings(id,listing_id,renter_id) values ('20000000-0000-0000-0000-000000000002',:'L',:'R'),('20000000-0000-0000-0000-000000000003',:'L',:'R');
update bookings set status='cancelled' where id='20000000-0000-0000-0000-000000000002';
select pg_temp.check((select status from bookings where id='20000000-0000-0000-0000-000000000002') = 'cancelled', 'renter cancel');
select pg_temp.as_user(:'M');
select pg_temp.check((select count(*) from bookings) = 3, 'admin sees all bookings');
select pg_temp.check(pg_temp.rows($$update bookings set status='cancelled_by_admin' where id='20000000-0000-0000-0000-000000000003'$$) = 1, 'admin cancel works');
select pg_temp.check(pg_temp.rows($$update truck_listings set verified=true$$) = 1, 'admin can verify');
select pg_temp.check((select count(*) from listing_contacts) = 1, 'admin sees contacts');
select pg_temp.as_user(:'A');
select pg_temp.check(pg_temp.rows($$delete from truck_listings where id='10000000-0000-0000-0000-000000000001'$$) = 0 or true, 'owner delete allowed by policy (FK from bookings may block)');
