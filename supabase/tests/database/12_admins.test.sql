-- Database tests for 0012_admins.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (Firma 1 = Site X, Firma 2 = Site Y):
--   AA admin of Site X (finished onboarding)   A2 admin of Site X (has NOT finished onboarding yet)   AB admin of Site Y
--   OA owner on Site X          DD deactivated owner on Site X          YR owner on Site Y (another company)
--   S  a brand-new account with no link anywhere (what the invite function creates)

begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end; $$;
create function pg_temp.act_as_visitor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end; $$;

create schema tt;
grant usage on schema tt to anon, authenticated;
create function tt.u(p text) returns uuid language sql as $$
  select case p
    when 'AA' then 'a1000000-0000-0000-0000-000000000001' when 'A2' then 'a3000000-0000-0000-0000-000000000003' when 'AB' then 'a2000000-0000-0000-0000-000000000002'
    when 'OA' then 'b1000000-0000-0000-0000-000000000001' when 'DD' then 'b5000000-0000-0000-0000-000000000005' when 'YR' then 'b9000000-0000-0000-0000-000000000009'
    when 'AX' then 'a4000000-0000-0000-0000-000000000004' when 'S'  then 'c1000000-0000-0000-0000-000000000001' end::uuid
$$;
create function tt.siteX() returns uuid language sql as $$ select '20000000-0000-0000-0000-0000000000a1'::uuid $$;
create function tt.siteY() returns uuid language sql as $$ select '20000000-0000-0000-0000-0000000000a2'::uuid $$;
create function tt.siteX2() returns uuid language sql as $$ select '20000000-0000-0000-0000-0000000000a3'::uuid $$;
-- the admins of a site, as text "AA,A2", WITHOUT row security
create function tt.admins(p_site uuid) returns text language sql security definer set search_path = '' as $$
  select string_agg(case m.profile_id
      when 'a1000000-0000-0000-0000-000000000001' then 'AA' when 'a3000000-0000-0000-0000-000000000003' then 'A2' when 'a2000000-0000-0000-0000-000000000002' then 'AB'
      when 'b1000000-0000-0000-0000-000000000001' then 'OA' when 'a4000000-0000-0000-0000-000000000004' then 'AX' when 'c1000000-0000-0000-0000-000000000001' then 'S' else m.profile_id::text end, ',' order by m.created_at, m.profile_id)
    from public.site_members m where m.site_id = p_site and m.role = 'admin'
$$;
grant execute on function tt.admins(uuid) to authenticated;
create function tt.audits(p_table text, p_action text, p_row uuid, p_actor uuid) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.audit_log where table_name = p_table and action = p_action and row_id = p_row::text and actor_id = p_actor
$$;
grant execute on function tt.audits(text, text, uuid, uuid) to authenticated;
-- one text value out of the newest audit row of a person's site_members change
create function tt.audit_value(p_action text, p_row uuid, p_side text, p_key text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I ->> $1 from public.audit_log where table_name = ''site_members'' and action = $2 and row_id = $3 order by id desc limit 1', p_side) into v using p_key, p_action, p_row::text;
  return v;
end; $$;
grant execute on function tt.audit_value(text, uuid, text, text) to authenticated;

insert into public.companies (id, name) values ('10000000-0000-0000-0000-0000000000c1', 'Firma 1'), ('10000000-0000-0000-0000-0000000000c2', 'Firma 2');
insert into public.sites (id, company_id, name) values (tt.siteX(), '10000000-0000-0000-0000-0000000000c1', 'Site X'), (tt.siteY(), '10000000-0000-0000-0000-0000000000c2', 'Site Y'), (tt.siteX2(), '10000000-0000-0000-0000-0000000000c1', 'Site X2');
insert into public.blocks (id, site_id, name) values ('30000000-0000-0000-0000-000000000001', tt.siteX(), 'Blok A'), ('30000000-0000-0000-0000-000000000002', tt.siteY(), 'Blok Y');
insert into public.units (id, block_id, door_no) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '1'), ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2'), ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '1');
insert into auth.users (id, email, raw_user_meta_data) values
  (tt.u('AA'), 'aa@test.local', '{"full_name":"Ayşe Admin"}'), (tt.u('A2'), 'a2@test.local', '{"full_name":"Berk Admin"}'), (tt.u('AB'), 'ab@test.local', '{"full_name":"Can Admin"}'),
  (tt.u('OA'), 'oa@test.local', '{"full_name":"Mehmet Malik"}'), (tt.u('DD'), 'dd@test.local', '{"full_name":"Pasif Kişi"}'), (tt.u('YR'), 'yr@test.local', '{"full_name":"Yeni Sakin"}'),
  (tt.u('S'), 's@test.local', '{"full_name":"Sıfırdan Gelen"}'), (tt.u('AX'), 'ax@test.local', '{"full_name":"Deniz Admin"}'), ('a5000000-0000-0000-0000-000000000005', 'staff@test.local', '{"full_name":"Görevli Kişi"}');
insert into public.site_members (profile_id, site_id, role) values (tt.u('AA'), tt.siteX(), 'admin'), (tt.u('A2'), tt.siteX(), 'admin'), (tt.u('AB'), tt.siteY(), 'admin'), (tt.u('AX'), tt.siteX2(), 'admin'), ('a5000000-0000-0000-0000-000000000005', tt.siteX(), 'staff');
insert into public.unit_residents (unit_id, profile_id, relation, start_date) values
  ('40000000-0000-0000-0000-000000000001', tt.u('OA'), 'owner', current_date - 30),
  ('40000000-0000-0000-0000-000000000002', tt.u('DD'), 'owner', current_date - 30),
  ('40000000-0000-0000-0000-000000000003', tt.u('YR'), 'owner', current_date - 30);
update public.profiles set is_active = false where id = tt.u('DD');
update public.profiles set kvkk_consent_at = now() - interval '5 days', phone = '0532 000 00 00' where id = tt.u('AA');
-- the admins were made a moment apart (the list is oldest first)
update public.site_members set created_at = now() - interval '10 days' where profile_id = tt.u('AA');
update public.site_members set created_at = now() - interval '2 days' where profile_id = tt.u('A2');

-- ---------------------------------------------------------------------------
-- 1. structure and rights
-- ---------------------------------------------------------------------------
select has_function('public', 'list_site_admins', array['uuid'], 'list_site_admins exists');
select has_function('public', 'add_site_admin', array['uuid', 'uuid'], 'add_site_admin exists');
select has_function('public', 'remove_site_admin', array['uuid', 'uuid'], 'remove_site_admin exists');
select is((select bool_and(prosecdef) from pg_proc where oid in ('public.list_site_admins(uuid)'::regprocedure, 'public.add_site_admin(uuid,uuid)'::regprocedure, 'public.remove_site_admin(uuid,uuid)'::regprocedure)), true, 'all three are security-definer functions');
select is((select bool_and('search_path=""' = any (proconfig)) from pg_proc where oid in ('public.list_site_admins(uuid)'::regprocedure, 'public.add_site_admin(uuid,uuid)'::regprocedure, 'public.remove_site_admin(uuid,uuid)'::regprocedure)), true, '...with an empty search_path');
select is(has_function_privilege('anon', 'public.add_site_admin(uuid,uuid)', 'execute') or has_function_privilege('anon', 'public.remove_site_admin(uuid,uuid)', 'execute') or has_function_privilege('anon', 'public.list_site_admins(uuid)', 'execute'), false, 'a visitor may call none of them');
select is(has_function_privilege('authenticated', 'public.add_site_admin(uuid,uuid)', 'execute') and has_function_privilege('authenticated', 'public.remove_site_admin(uuid,uuid)', 'execute') and has_function_privilege('authenticated', 'public.list_site_admins(uuid)', 'execute'), true, 'a logged-in person may (the functions check who inside)');
select is(has_table_privilege('authenticated', 'public.site_members', 'insert') or has_any_column_privilege('authenticated', 'public.site_members', 'insert'), false, 'site_members: nobody logged in can insert directly any more');
select is(has_table_privilege('authenticated', 'public.site_members', 'delete'), false, '...or delete');
select is(has_table_privilege('authenticated', 'public.site_members', 'update') or has_any_column_privilege('authenticated', 'public.site_members', 'update'), false, '...or update (not even the role)');
select is(has_table_privilege('authenticated', 'public.site_members', 'select'), true, '...but reading is as before (own memberships, and the admins of the own site)');

-- ---------------------------------------------------------------------------
-- 2. the list
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::integer from public.list_site_admins(tt.siteX())), 2, 'an admin sees the two admins of the site');
select is((select array_agg(full_name) from public.list_site_admins(tt.siteX())), array['Ayşe Admin', 'Berk Admin'], '...oldest first, in the order the function answers (a staff member of the site is not listed)');
select is((select is_self from public.list_site_admins(tt.siteX()) where profile_id = tt.u('AA')), true, 'the list marks the caller');
select is((select is_self from public.list_site_admins(tt.siteX()) where profile_id = tt.u('A2')), false, '...and nobody else');
select is((select kvkk_consent_at is null from public.list_site_admins(tt.siteX()) where profile_id = tt.u('A2')), true, 'an admin who has not finished onboarding shows no consent date');
select is((select email || '|' || phone from public.list_site_admins(tt.siteX()) where profile_id = tt.u('AA')), 'aa@test.local|0532 000 00 00', 'the list has e-mail and phone');
select is((select count(*)::integer from public.list_site_admins(tt.siteX()) where profile_id = tt.u('OA')), 0, 'a resident is not in the list of admins');
select throws_ok($$select * from public.list_site_admins(tt.siteY())$$, '42501', null, 'an admin of ANOTHER site gets "not allowed"');
select throws_ok($$select * from public.list_site_admins(null)$$, '42501', null, 'no site gets "not allowed"');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select * from public.list_site_admins(tt.siteX())$$, '42501', null, 'a resident gets "not allowed"');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('S'));
select throws_ok($$select * from public.list_site_admins(tt.siteX())$$, '42501', null, 'a stranger gets "not allowed"');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as_visitor();
select throws_ok($$select * from public.list_site_admins(tt.siteX())$$, '42501', null, 'a visitor gets "not allowed"');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 3. nobody writes site_members directly
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$insert into public.site_members (profile_id, site_id, role) values ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin')$$, '42501', null, 'an admin cannot add a member directly');
select throws_ok($$delete from public.site_members where profile_id = 'a3000000-0000-0000-0000-000000000003'$$, '42501', null, '...or delete one');
select throws_ok($$update public.site_members set role = 'staff' where profile_id = 'a3000000-0000-0000-0000-000000000003'$$, '42501', null, '...or change a role');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.admins(tt.siteX()), 'AA,A2', 'both admins are still there');
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$insert into public.site_members (profile_id, site_id, role) values ('b1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin')$$, '42501', null, 'a resident cannot make themselves admin');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 4. adding an admin
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.add_site_admin(tt.siteX(), tt.u('OA'))$$, 'an admin makes a resident of the site an admin');
select lives_ok($$select public.add_site_admin(tt.siteX(), tt.u('S'))$$, '...and a brand-new account with no link anywhere');
select lives_ok($$select public.add_site_admin(tt.siteX(), tt.u('AX'))$$, '...and an admin of ANOTHER site of the same company');
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('OA'))$$, 'P0001', 'already_member', 'the same person again is "already_member"');
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('AA'))$$, 'P0001', 'already_member', '...and so is the caller');
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('YR'))$$, 'P0001', 'person_not_found', 'a resident of ANOTHER company cannot be made admin');
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('AB'))$$, 'P0001', 'person_not_found', '...nor an admin of another company');
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('DD'))$$, 'P0001', 'person_not_found', 'a deactivated person cannot be made admin');
select throws_ok($$select public.add_site_admin(tt.siteX(), '99999999-9999-9999-9999-999999999999')$$, 'P0001', 'person_not_found', 'a person that does not exist gives the same answer');
select throws_ok($$select public.add_site_admin(tt.siteY(), tt.u('OA'))$$, '42501', null, 'an admin of site X cannot add admins to site Y');
select throws_ok($$select public.add_site_admin(null, tt.u('OA'))$$, '42501', null, 'no site is refused');
select throws_ok($$select public.add_site_admin(tt.siteX(), null)$$, '42501', null, 'no person is refused');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.admins(tt.siteX()), 'AA,A2,AX,OA,S', 'the site now has five admins');
select is(tt.audits('site_members', 'insert', tt.u('OA'), tt.u('AA')), 1, 'the change is in the audit log and names the CALLER (not "nobody")');
select is((select count(*)::integer from public.unit_residents where profile_id = tt.u('OA')), 1, 'the new admin is still a resident too');
select is(tt.audit_value('insert', tt.u('OA'), 'new_data', 'person'), 'Mehmet Malik', 'the audit row of an added admin carries the NAME of the person');
select is(tt.audit_value('insert', tt.u('S'), 'new_data', 'role'), 'admin', '...next to the role it always had');
select is((select count(*)::integer from public.audit_log where table_name <> 'site_members' and (new_data ? 'person' or old_data ? 'person')), 0, 'rows of other tables never get a "person"');

select pg_temp.act_as(tt.u('OA'));
select is((select count(*)::integer from public.list_site_admins(tt.siteX())), 5, 'the new admin can use the admin functions at once');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('YR'));
select throws_ok($$select public.add_site_admin(tt.siteY(), tt.u('YR'))$$, '42501', null, 'a resident cannot make themselves admin through the function');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AX'));
select lives_ok($$select public.add_site_admin(tt.siteX2(), tt.u('OA'))$$, 'an admin of the SECOND site of a company adds a person to that second site');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.admins(tt.siteX2()), 'AX,OA', '...and the person lands in THAT site (not in the first site of the company)');
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('S'))$$, '42501', null, 'an admin of another site cannot add to site X');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as_visitor();
select throws_ok($$select public.add_site_admin(tt.siteX(), tt.u('S'))$$, '42501', null, 'a visitor cannot add');
reset role; select set_config('request.jwt.claims', '', true);

-- a person without a name is named by the e-mail address
insert into auth.users (id, email, raw_user_meta_data) values ('c3000000-0000-0000-0000-000000000003', 'nameless@test.local', '{}');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.add_site_admin(tt.siteX(), 'c3000000-0000-0000-0000-000000000003')$$, 'a nameless brand-new account can be made admin');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.audit_value('insert', 'c3000000-0000-0000-0000-000000000003', 'new_data', 'person'), 'nameless@test.local', '...and the audit row names it by its e-mail address');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.remove_site_admin(tt.siteX(), 'c3000000-0000-0000-0000-000000000003')$$, '...and it can be removed again');
reset role; select set_config('request.jwt.claims', '', true);
-- a person that belongs to nobody yet cannot be taken after they got a residency elsewhere
insert into auth.users (id, email, raw_user_meta_data) values ('c2000000-0000-0000-0000-000000000002', 'late@test.local', '{"full_name":"Geç Gelen"}');
insert into public.unit_residents (unit_id, profile_id, relation, start_date) values ('40000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000002', 'tenant', current_date - 1);
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.add_site_admin(tt.siteX(), 'c2000000-0000-0000-0000-000000000002')$$, 'P0001', 'person_not_found', 'an account that already lives in another company is not "brand-new"');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 5. removing an admin
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.remove_site_admin(tt.siteX(), tt.u('AA'))$$, 'P0001', 'cannot_remove_self', 'you cannot remove yourself');
select throws_ok($$select public.remove_site_admin(tt.siteX(), tt.u('YR'))$$, 'P0001', 'not_admin', 'a person who is no admin of the site gives "not_admin"');
select throws_ok($$select public.remove_site_admin(tt.siteX(), '99999999-9999-9999-9999-999999999999')$$, 'P0001', 'not_admin', '...and so does a person that does not exist');
select throws_ok($$select public.remove_site_admin(tt.siteY(), tt.u('AB'))$$, '42501', null, 'an admin of site X cannot remove an admin of site Y');
select lives_ok($$select public.remove_site_admin(tt.siteX(), tt.u('S'))$$, 'an admin removes another admin');
select lives_ok($$select public.remove_site_admin(tt.siteX(), tt.u('OA'))$$, '...and another');
select lives_ok($$select public.remove_site_admin(tt.siteX(), tt.u('AX'))$$, '...and a person who is admin of two sites');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.admins(tt.siteX()), 'AA,A2', 'two admins are left');
select is(tt.admins(tt.siteX2()), 'AX,OA', 'a removal touches only the site it names: the other site of that person is unchanged');
select is(tt.audits('site_members', 'delete', tt.u('OA'), tt.u('AA')), 1, 'the removal is in the audit log and names the caller');
select is(tt.audit_value('delete', tt.u('OA'), 'old_data', 'person'), 'Mehmet Malik', 'the audit row of a removed admin carries the NAME of the person (they are gone from the list)');
select is((select count(*)::integer from public.profiles where id = tt.u('OA')) + (select count(*)::integer from public.unit_residents where profile_id = tt.u('OA')), 2, 'the removed person keeps their account and their residency');
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select * from public.list_site_admins(tt.siteX())$$, '42501', null, 'the removed person has no admin power any more, at once');
select throws_ok($$select public.remove_site_admin(tt.siteX(), tt.u('AA'))$$, '42501', null, '...and cannot remove anybody');
reset role; select set_config('request.jwt.claims', '', true);

-- two admins cannot empty the site: after one removed the other, the one who is left cannot be removed by the one who was removed
select pg_temp.act_as(tt.u('A2'));
select lives_ok($$select public.remove_site_admin(tt.siteX(), tt.u('AA'))$$, 'the second admin removes the first');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.remove_site_admin(tt.siteX(), tt.u('A2'))$$, '42501', null, 'the removed first admin can no longer remove the second');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.admins(tt.siteX()), 'A2', 'the site keeps one admin');
select pg_temp.act_as(tt.u('A2'));
select throws_ok($$select public.remove_site_admin(tt.siteX(), tt.u('A2'))$$, 'P0001', 'cannot_remove_self', 'the last admin cannot remove themselves');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.admins(tt.siteX()), 'A2', 'the site still has its admin');
select is(tt.admins(tt.siteY()), 'AB', 'the other site was never touched');

select * from finish();
rollback;
