-- Database tests for 0001_core.sql (pgTAP). Run with:  npx supabase test db
-- Everything runs inside one transaction that is rolled back at the end, so no data is kept.
--
-- How a person is simulated: Supabase decides "who is calling" from two settings.
--   role                   -> which Postgres role runs the query (anon / authenticated)
--   request.jwt.claims     -> the login token content; auth.uid() reads "sub" from it
-- act_as(uuid) sets both. Always `reset role` first to go back to the admin (postgres).

begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;

create function pg_temp.act_as_visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end; $$;

-- ---------------------------------------------------------------------------
-- Guards that need no fixtures
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'every table in public has RLS enabled');

-- Every function in public can be called through /rest/v1/rpc. So the list is fixed:
-- add a name here ONLY when a migration adds a public function on purpose (and checks the caller inside).
select is((select coalesce(array_agg(p.proname::text order by p.proname), array[]::text[]) from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
  array['accept_kvkk', 'set_profile_active'],
  'public holds exactly the expected functions (0002 added accept_kvkk and set_profile_active)');

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as postgres, which bypasses RLS)
-- ---------------------------------------------------------------------------
-- Users. The auth.users trigger must create a profile for each one.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin1@test.local',   '{"full_name":"Admin Bir"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin2@test.local',   '{"full_name":"Admin Iki"}'),
  ('b1000000-0000-0000-0000-000000000001', 'owner1@test.local',   '{"full_name":"Malik Bir"}'),
  ('b2000000-0000-0000-0000-000000000002', 'tenant1@test.local',  '{"full_name":"Kiraci Bir"}'),
  ('b3000000-0000-0000-0000-000000000003', 'owner2@test.local',   '{"full_name":"Malik Iki"}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');

select is((select count(*)::int from public.profiles where id in (
  'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001')), 6,
  'trigger creates a profile for every new auth user (only this test''s own users are counted)');
select is((select full_name from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'), 'Admin Bir',
  'full_name is copied from the user metadata');

-- The trigger must never block an invite, even for odd input.
select lives_ok($$insert into auth.users (id, email, raw_user_meta_data)
  values ('d1000000-0000-0000-0000-000000000001', 'long@test.local', jsonb_build_object('full_name', repeat('x', 500)))$$,
  'a 500-character name does not block user creation');
select is((select char_length(full_name) from public.profiles where id = 'd1000000-0000-0000-0000-000000000001'), 200,
  '...the name is cut to 200 characters');
select lives_ok($$insert into auth.users (id, email) values ('d2000000-0000-0000-0000-000000000002', null)$$,
  'a user without an e-mail (phone login) does not block user creation');

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-0000000000c1', 'Test Firma 1'),
  ('10000000-0000-0000-0000-0000000000c2', 'Test Firma 2');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site A1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site A2');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'A'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'A');
insert into public.units (id, block_id, door_no) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '1'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '1');
insert into public.site_members (profile_id, site_id, role) values
  ('a1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('a2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'admin');
insert into public.unit_residents (id, unit_id, profile_id, relation) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'owner'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'tenant'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000003', 'owner');

-- ---------------------------------------------------------------------------
-- A visitor (not logged in)
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();

select lives_ok($$insert into public.quote_requests (name, phone) values ('Ahmet Yılmaz', '05320000000')$$,
  'visitor can send a quote request');
select throws_ok($$select * from public.quote_requests$$, '42501', null,
  'visitor cannot read quote requests');
select throws_ok($$insert into public.quote_requests (name, phone, status) values ('Ali Veli', '05320000000', 'closed')$$,
  '42501', null, 'visitor cannot choose the status of a quote request');
select throws_ok($$insert into public.quote_requests (name, phone) values ('A', '05320000000')$$,
  '23514', null, 'a one-letter name is rejected');
select throws_ok($$insert into public.quote_requests (name) values ('Ali Veli')$$,
  '23514', null, 'a quote request needs a phone or an e-mail');
select throws_ok($$insert into public.quote_requests (name, phone, message) values ('Ali Veli', '05320000000', repeat('x', 2001))$$,
  '23514', null, 'a message over 2000 characters is rejected');
select throws_ok($$select * from public.units$$, '42501', null, 'visitor cannot read units');
select throws_ok($$select * from public.profiles$$, '42501', null, 'visitor cannot read profiles');
select throws_ok($$select private.is_any_admin()$$, '42501', null, 'visitor cannot call private helper functions');

-- ---------------------------------------------------------------------------
-- A logged-in stranger (no memberships)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');

select is((select count(*)::int from public.units), 0, 'stranger sees no units');
select is((select count(*)::int from public.sites), 0, 'stranger sees no sites');
select is((select count(*)::int from public.quote_requests), 0, 'stranger cannot see quote requests');
select is((select count(*)::int from public.profiles), 1, 'stranger sees only their own profile');
select throws_ok($$insert into public.sites (company_id, name) values ('10000000-0000-0000-0000-0000000000c1', 'Sneaky')$$,
  '42501', null, 'stranger cannot create a site');

-- ---------------------------------------------------------------------------
-- An owner (Kat Maliki)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');

select is((select count(*)::int from public.units), 1, 'owner sees only their own unit');
select is((select count(*)::int from public.units where id in
  ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003')), 0,
  '...another unit of the same block and a unit of another site are hidden');
select is((select array_agg(name order by name) from public.sites), array['Site A1'],
  'owner sees their own site only');
select is((select relation from private.my_units()), 'owner', 'my_units() reports the owner relation');
select throws_ok($$insert into public.units (block_id, door_no) values ('30000000-0000-0000-0000-000000000001', '99')$$,
  '42501', null, 'owner cannot create a unit');
select is_empty($$update public.units set floor = 9 where id = '40000000-0000-0000-0000-000000000001' returning 1$$,
  'owner cannot edit a unit (0 rows touched)');
select isnt_empty($$update public.profiles set full_name = 'Yeni Ad' where id = 'b1000000-0000-0000-0000-000000000001' returning 1$$,
  'owner can edit their own name');
select throws_ok($$update public.profiles set is_active = false where id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner cannot change is_active');
select throws_ok($$update public.profiles set kvkk_consent_at = now() where id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner cannot write kvkk_consent_at directly');
select is((select count(*)::int from public.profiles where id = 'b2000000-0000-0000-0000-000000000002'), 0,
  'owner cannot read the tenant profile');
select is_empty($$update public.profiles set full_name = 'Hack' where id = 'b2000000-0000-0000-0000-000000000002' returning 1$$,
  'owner cannot edit someone else (0 rows touched)');
select throws_ok($$insert into public.site_members (profile_id, site_id, role)
  values ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin')$$,
  '42501', null, 'owner cannot make themselves admin');
select is((select count(*)::int from public.unit_residents), 1, 'owner sees only their own residency row');
select is((select count(*)::int from public.quote_requests), 0, 'owner cannot see quote requests');

-- ---------------------------------------------------------------------------
-- A tenant (Kiracı)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');

select is((select relation from private.my_units()), 'tenant', 'my_units() reports the tenant relation');
select is((select count(*)::int from public.units), 1, 'tenant sees the unit they live in');

-- ---------------------------------------------------------------------------
-- An admin (Yönetici) of site A1
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

select is((select count(*)::int from public.units), 2, 'admin sees all units of their site, not other sites');
select lives_ok($$insert into public.units (block_id, door_no) values ('30000000-0000-0000-0000-000000000001', '3')$$,
  'admin can create a unit in their own block');
select throws_ok($$insert into public.units (block_id, door_no) values ('30000000-0000-0000-0000-000000000002', '9')$$,
  '42501', null, 'admin cannot create a unit in another site');
select isnt_empty($$update public.units set floor = 3 where id = '40000000-0000-0000-0000-000000000001' returning 1$$,
  'admin can edit a unit of their site');
select throws_ok($$update public.units set block_id = '30000000-0000-0000-0000-000000000002'
  where id = '40000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'admin cannot move a unit into another site');
select is((select count(*)::int from public.profiles where id in
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
   'b2000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000003')), 4,
  'admin sees themselves and the residents of their site');
select is((select count(*)::int from public.profiles where id in
  ('a2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001')), 0,
  '...but not an admin of another site or a stranger');
select isnt_empty($$update public.profiles set phone = '05001112233' where id = 'b1000000-0000-0000-0000-000000000001' returning 1$$,
  'admin can edit a resident phone number');
select is((select count(*)::int from public.quote_requests where name = 'Ahmet Yılmaz'), 1,
  'admin can read quote requests');
select isnt_empty($$insert into public.sites (company_id, name) values ('10000000-0000-0000-0000-0000000000c1', 'Site Yeni') returning id$$,
  'admin can create a site in their company and get the new row back (insert ... returning)');
select is((select count(*)::int from public.site_members m join public.sites s on s.id = m.site_id
           where s.name = 'Site Yeni' and m.profile_id = 'a1000000-0000-0000-0000-000000000001' and m.role = 'admin'), 1,
  '...and becomes admin of the new site');
select throws_ok($$insert into public.sites (company_id, name) values ('10000000-0000-0000-0000-0000000000c2', 'Foreign')$$,
  '42501', null, 'admin cannot create a site in another company');
select lives_ok($$insert into public.site_members (profile_id, site_id, role)
  values ('b3000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a1', 'staff')$$,
  'admin can add a member to their site');
select lives_ok($$insert into public.unit_residents (unit_id, profile_id, relation)
  values ('40000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'tenant')$$,
  'admin can link a resident to a unit of their site');
select throws_ok($$insert into public.unit_residents (unit_id, profile_id, relation)
  values ('40000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'tenant')$$,
  '42501', null, 'admin cannot link a resident to a unit of another site');

-- ---------------------------------------------------------------------------
-- An admin of another company (isolation)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');

select is((select array_agg(name order by name) from public.sites), array['Site A2'],
  'admin of company 2 sees only company 2 sites');
select is((select count(*)::int from public.units where id = '40000000-0000-0000-0000-000000000001'), 0,
  'admin of company 2 cannot see units of company 1');

-- ---------------------------------------------------------------------------
-- Deactivated people and dates
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set is_active = false where id = 'b1000000-0000-0000-0000-000000000001';
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.units), 0, 'a deactivated resident sees no units');

reset role;
update public.profiles set is_active = false where id = 'a1000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.units), 0, 'a deactivated admin sees no units');

-- Owner2 lives in unit 2. Test the date rules with Istanbul "today".
reset role;
update public.unit_residents
  set start_date = (now() at time zone 'Europe/Istanbul')::date - 10,
      end_date   = (now() at time zone 'Europe/Istanbul')::date
  where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.units), 0, 'a residency that ends today (moved out today) gives no access from now on');

reset role;
update public.unit_residents
  set end_date = (now() at time zone 'Europe/Istanbul')::date + 1
  where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.units), 1, 'a residency that ends tomorrow still gives access today');

reset role;
update public.unit_residents
  set end_date = (now() at time zone 'Europe/Istanbul')::date - 1
  where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.units), 0, 'a residency that ended yesterday gives no access');

reset role;
update public.unit_residents
  set start_date = (now() at time zone 'Europe/Istanbul')::date + 1, end_date = null
  where id = '50000000-0000-0000-0000-000000000003';
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.units), 0, 'a residency that starts tomorrow gives no access yet');

reset role;
select * from finish();
rollback;
