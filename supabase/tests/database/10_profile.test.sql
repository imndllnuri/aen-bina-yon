-- Database tests for 0010_profile.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (the demo site of seed.sql):
--   AD admin of the demo site     R1 owner of A Blok 1     R2 owner of A Blok 2
--   DD owner whose account is deactivated                  S  stranger (no unit)

begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

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
    when 'AD' then 'a1000000-0000-0000-0000-000000000001' when 'R1' then 'b1000000-0000-0000-0000-000000000001'
    when 'R2' then 'b2000000-0000-0000-0000-000000000002' when 'DD' then 'b3000000-0000-0000-0000-000000000003'
    when 'S'  then 'c1000000-0000-0000-0000-000000000001' end::uuid
$$;
-- what is stored for a person, WITHOUT row security
create function tt.prefs(p text) returns jsonb language sql security definer set search_path = '' as $$
  select notify_prefs from public.profiles where id = tt.u(p)
$$;
grant execute on function tt.prefs(text) to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (tt.u('AD'), 'admin@test.local', '{"full_name":"Admin A"}'),
  (tt.u('R1'), 'r1@test.local', '{"full_name":"Mehmet Malik"}'),
  (tt.u('R2'), 'r2@test.local', '{"full_name":"Ayşe Malik"}'),
  (tt.u('DD'), 'dd@test.local', '{"full_name":"Pasif Kişi"}'),
  (tt.u('S'),  's@test.local',  '{"full_name":"Yabancı"}');
insert into public.site_members (profile_id, site_id, role) values (tt.u('AD'), '00000000-0000-0000-0000-000000000010', 'admin');
insert into public.unit_residents (unit_id, profile_id, relation, start_date)
select (select u.id from public.units u where u.block_id = '00000000-0000-0000-0000-000000000101' and u.door_no = '1'), tt.u('R1'), 'owner', current_date - 30;
insert into public.unit_residents (unit_id, profile_id, relation, start_date)
select (select u.id from public.units u where u.block_id = '00000000-0000-0000-0000-000000000101' and u.door_no = '2'), tt.u('R2'), 'owner', current_date - 30;
insert into public.unit_residents (unit_id, profile_id, relation, start_date)
select (select u.id from public.units u where u.block_id = '00000000-0000-0000-0000-000000000101' and u.door_no = '3'), tt.u('DD'), 'owner', current_date - 30;
update public.profiles set is_active = false where id = tt.u('DD');

-- ---------------------------------------------------------------------------
-- 1. structure
-- ---------------------------------------------------------------------------
select has_function('public', 'save_my_notification_prefs', array['jsonb'], 'the function exists');
select is((select prosecdef from pg_proc where oid = 'public.save_my_notification_prefs(jsonb)'::regprocedure), true, 'it is a security-definer function');
select ok((select 'search_path=""' = any (proconfig) from pg_proc where oid = 'public.save_my_notification_prefs(jsonb)'::regprocedure), '...with an empty search_path');
select is(has_function_privilege('anon', 'public.save_my_notification_prefs(jsonb)', 'execute'), false, 'a visitor has no right to call it');
select is(has_function_privilege('authenticated', 'public.save_my_notification_prefs(jsonb)', 'execute'), true, 'a logged-in person has');
select is(has_column_privilege('authenticated', 'public.profiles', 'notify_prefs', 'update'), false, 'nobody can write notify_prefs directly any more');
select is(has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update'), true, 'name can still be corrected directly');
select is(has_column_privilege('authenticated', 'public.profiles', 'phone', 'update'), true, '...and phone');
select is(has_any_column_privilege('authenticated', 'public.profiles', 'update') and not has_column_privilege('authenticated', 'public.profiles', 'is_active', 'update'), true, 'is_active is still protected');
select is(has_column_privilege('authenticated', 'public.profiles', 'email', 'update'), false, 'e-mail is still protected');
select ok(exists (select 1 from pg_constraint where conname = 'profiles_notify_prefs_shape' and conrelid = 'public.profiles'::regclass), 'the shape check exists');
select is(tt.prefs('R1'), '{}'::jsonb, 'a new person starts with no choices');

-- ---------------------------------------------------------------------------
-- 2. a person saves their own preferences
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('R1'));
select is(public.save_my_notification_prefs('{"email_finance": false}'), '{"email_finance": false}'::jsonb, 'saving one choice returns what is stored');
select is(tt.prefs('R1'), '{"email_finance": false}'::jsonb, '...and it is stored');
select is(public.save_my_notification_prefs('{"email_announcements": true}'), '{"email_announcements": true, "email_finance": false}'::jsonb, 'a second save keeps the choices not sent');
select is(public.save_my_notification_prefs('{"email_finance": true, "email_requests": false}'), '{"email_announcements": true, "email_finance": true, "email_requests": false}'::jsonb, 'a choice can be changed back');
select is(public.save_my_notification_prefs('{}'), '{"email_announcements": true, "email_finance": true, "email_requests": false}'::jsonb, 'an empty object changes nothing');

-- every bad shape is refused with the same short code, and nothing changes
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": "yes"}')$$, 'P0001', 'prefs_invalid', 'a text instead of true / false is refused');
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": null}')$$, 'P0001', 'prefs_invalid', 'null is refused');
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": 1}')$$, 'P0001', 'prefs_invalid', 'a number is refused');
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": {"a": true}}')$$, 'P0001', 'prefs_invalid', 'an object is refused');
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": true, "sms": true}')$$, 'P0001', 'prefs_invalid', 'a key we do not know is refused (even next to a good one)');
select throws_ok($$select public.save_my_notification_prefs('[true]')$$, 'P0001', 'prefs_invalid', 'a list is refused');
select throws_ok($$select public.save_my_notification_prefs('"x"')$$, 'P0001', 'prefs_invalid', 'a text is refused');
select throws_ok($$select public.save_my_notification_prefs('null'::jsonb)$$, 'P0001', 'prefs_invalid', 'a JSON null is refused');
select throws_ok($$select public.save_my_notification_prefs(null)$$, 'P0001', 'prefs_invalid', 'a missing value is refused');
select is(tt.prefs('R1'), '{"email_announcements": true, "email_finance": true, "email_requests": false}'::jsonb, 'after all the refusals the stored choices are as they were');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 3. nobody else can change them
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AD'));
select lives_ok($$select public.save_my_notification_prefs('{"email_requests": true}')$$, 'an admin saves HER OWN choices');
select throws_ok($$update public.profiles set notify_prefs = '{"email_finance": false}' where id = 'b1000000-0000-0000-0000-000000000001'$$, '42501', null, 'an admin cannot write the choices of a resident directly');
select throws_ok($$update public.profiles set notify_prefs = '{}' where id = 'a1000000-0000-0000-0000-000000000001'$$, '42501', null, '...nor her own, directly (the function is the only way)');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.prefs('R1'), '{"email_announcements": true, "email_finance": true, "email_requests": false}'::jsonb, 'the resident''s choices did not move');
select is(tt.prefs('AD'), '{"email_requests": true}'::jsonb, 'the admin''s own row has the admin''s choice');

select pg_temp.act_as(tt.u('R2'));
select throws_ok($$update public.profiles set notify_prefs = '{"email_finance": true}' where id = 'b2000000-0000-0000-0000-000000000002'$$, '42501', null, 'a resident cannot write the column directly either');
select public.save_my_notification_prefs('{"email_finance": false}');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.prefs('R1') ->> 'email_finance', 'true', 'R2 saving "false" does not touch R1, who has "true"');
select is(tt.prefs('R2'), '{"email_finance": false}'::jsonb, 'R2 has exactly their own choice');

select pg_temp.act_as_visitor();
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": true}')$$, '42501', null, 'a visitor cannot call the function');
reset role; select set_config('request.jwt.claims', '', true);

-- a token that has a role but no person id
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": true}')$$, '28000', 'not authenticated', 'a login without a person id is refused');
reset role; select set_config('request.jwt.claims', '', true);

select pg_temp.act_as(tt.u('DD'));
select throws_ok($$select public.save_my_notification_prefs('{"email_finance": true}')$$, '42501', 'not allowed', 'a deactivated person gets "not allowed"');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.prefs('DD'), '{}'::jsonb, '...and nothing was written');

-- ---------------------------------------------------------------------------
-- 4. name and phone: as before
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('R1'));
select isnt_empty($$update public.profiles set full_name = 'Mehmet M. Malik', phone = '0532 000 00 00' where id = 'b1000000-0000-0000-0000-000000000001' returning 1$$, 'a person changes their own name and phone');
select is_empty($$update public.profiles set full_name = 'Hack' where id = 'b2000000-0000-0000-0000-000000000002' returning 1$$, 'but not the name of another resident (no row found)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AD'));
select isnt_empty($$update public.profiles set phone = '0533 111 22 33' where id = 'b1000000-0000-0000-0000-000000000001' returning 1$$, 'the admin still corrects a resident''s phone (Sakinler)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('S'));
select is_empty($$update public.profiles set phone = '0599' where id = 'b1000000-0000-0000-0000-000000000001' returning 1$$, 'a stranger finds no row to change');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 5. the shape check is the last guard (even the table owner cannot store a bad shape)
-- ---------------------------------------------------------------------------
select throws_ok($$update public.profiles set notify_prefs = '{"other": true}' where id = 'b1000000-0000-0000-0000-000000000001'$$, '23514', null, 'a key we do not know cannot be stored');
select throws_ok($$update public.profiles set notify_prefs = '[]' where id = 'b1000000-0000-0000-0000-000000000001'$$, '23514', null, 'a list cannot be stored');
select throws_ok($$update public.profiles set notify_prefs = '{"email_finance": "true"}' where id = 'b1000000-0000-0000-0000-000000000001'$$, '23514', null, 'a text "true" cannot be stored');
select throws_ok($$update public.profiles set notify_prefs = '{"email_finance": true, "email_requests": null}' where id = 'b1000000-0000-0000-0000-000000000001'$$, '23514', null, 'a null value cannot be stored');
select lives_ok($$update public.profiles set notify_prefs = '{"email_finance": true, "email_announcements": false, "email_requests": true}' where id = 'b1000000-0000-0000-0000-000000000001'$$, 'all three keys are fine');
select lives_ok($$update public.profiles set notify_prefs = '{}' where id = 'b1000000-0000-0000-0000-000000000001'$$, 'and so is the empty object');

select * from finish();
rollback;
