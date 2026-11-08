-- Database tests for 0002_residents.sql (pgTAP). Run with:  npx supabase test db
-- Same helpers and fixtures idea as 01_core.test.sql. Everything is rolled back at the end.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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
-- Fixtures (as postgres). Two companies: admin A runs site 1, admin B runs site 2.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{"full_name":"Admin A"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{"full_name":"Admin B"}'),
  ('b1000000-0000-0000-0000-000000000001', 'res-a@test.local',   '{"full_name":"Sakin A"}'),
  ('b2000000-0000-0000-0000-000000000002', 'res-b@test.local',   '{"full_name":"Sakin B"}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site 1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site 2');
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
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'tenant');

-- ---------------------------------------------------------------------------
-- The only functions in public are the two we meant to add (nothing else is exposed as an RPC)
-- ---------------------------------------------------------------------------
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'), array['accept_kvkk', 'set_profile_active'],
  'the public schema holds exactly accept_kvkk and set_profile_active');

-- ---------------------------------------------------------------------------
-- accept_kvkk
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select public.accept_kvkk('v1')$$, '42501', null, 'a visitor cannot call accept_kvkk');
select throws_ok($$select public.set_profile_active('b1000000-0000-0000-0000-000000000001', false)$$, '42501', null,
  'a visitor cannot call set_profile_active');

reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.accept_kvkk('2026-11-taslak-1')$$, 'a resident can record their own KVKK consent');
reset role;
select is((select kvkk_consent_version from public.profiles where id = 'b1000000-0000-0000-0000-000000000001'),
  '2026-11-taslak-1', '...the version is stored');
select isnt((select kvkk_consent_at from public.profiles where id = 'b1000000-0000-0000-0000-000000000001'), null,
  '...and the time');
select is((select kvkk_consent_at from public.profiles where id = 'b2000000-0000-0000-0000-000000000002'), null,
  'nobody else was touched');

select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.accept_kvkk('')$$, '22023', null, 'an empty version is rejected');
select throws_ok($$select public.accept_kvkk(repeat('x', 51))$$, '22023', null, 'a very long version is rejected');
select throws_ok($$select public.accept_kvkk(null)$$, '22023', null, 'a null version is rejected');
select throws_ok($$update public.profiles set kvkk_consent_version = 'fake' where id = 'b1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'the version column cannot be written directly');

reset role;
update public.profiles set is_active = false where id = 'b2000000-0000-0000-0000-000000000002';
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.accept_kvkk('v1')$$, '42501', null, 'a deactivated person cannot record consent');
reset role;
update public.profiles set is_active = true where id = 'b2000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- set_profile_active
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.set_profile_active('b1000000-0000-0000-0000-000000000001', true)$$, '42501', null,
  'a resident cannot change a status, not even their own');

reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.set_profile_active('b1000000-0000-0000-0000-000000000001', false)$$, '42501', null,
  'a stranger cannot deactivate anyone');

reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.set_profile_active('b1000000-0000-0000-0000-000000000001', false)$$, '42501', null,
  'an admin of another site cannot deactivate this site''s resident');

reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.set_profile_active('a1000000-0000-0000-0000-000000000001', false)$$, '42501', null,
  'an admin cannot deactivate themselves');
select throws_ok($$select public.set_profile_active('b2000000-0000-0000-0000-000000000002', false)$$, '42501', null,
  'an admin cannot deactivate a resident of another site');
select throws_ok($$select public.set_profile_active('00000000-0000-0000-0000-00000000dead', false)$$, '42501', null,
  'an unknown profile is refused the same way');
select lives_ok($$select public.set_profile_active('b1000000-0000-0000-0000-000000000001', false)$$,
  'the right admin can deactivate a resident of their site');
reset role;
select is((select is_active from public.profiles where id = 'b1000000-0000-0000-0000-000000000001'), false, '...it took effect');

select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.units), 0, '...and the deactivated resident now sees nothing');

reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_profile_active('b1000000-0000-0000-0000-000000000001', true)$$, 'the admin can reactivate them');
reset role;
select is((select is_active from public.profiles where id = 'b1000000-0000-0000-0000-000000000001'), true, '...it took effect');

-- ---------------------------------------------------------------------------
-- Archiving units
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a unit with a current resident cannot be archived');
select lives_ok($$update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000002'$$,
  'an empty unit can be archived');

reset role;
update public.unit_residents set end_date = (now() at time zone 'Europe/Istanbul')::date + 1,
                                 start_date = (now() at time zone 'Europe/Istanbul')::date - 30
  where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a unit whose resident moves out tomorrow still counts as occupied');

reset role;
update public.unit_residents set end_date = (now() at time zone 'Europe/Istanbul')::date
  where id = '50000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000001'$$,
  'a unit whose resident moved out today can be archived');

reset role;
select * from finish();
rollback;
