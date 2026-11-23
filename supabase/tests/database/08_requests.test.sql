-- Database tests for 0008_requests.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who:
--   AA admin of Site X    A2 second admin of Site X    AB admin of Site Y
--   Unit A1 (Blok A):  OA owner, TA tenant since 90 days, TB tenant since 30 days, FT former tenant (moved out)
--   Unit A2 (Blok A):  OA2 owner, D owner whose account is deactivated
--   Unit B1 (Blok B):  B1O owner, B1T tenant        Unit A3 (Blok A): empty        Unit Y1 (Site Y): Y1O owner
--   S stranger (no unit)

begin;
create extension if not exists pgtap with schema extensions;
select plan(287);

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
create function tt.today() returns date language sql as $$ select (now() at time zone 'Europe/Istanbul')::date $$;
create function tt.unit(p text) returns uuid language sql as $$ select ('40000000-0000-0000-0000-00000000000' || p)::uuid $$;
-- people by short name
create function tt.u(p text) returns uuid language sql as $$
  select case p
    when 'AA' then 'a1000000-0000-0000-0000-000000000001' when 'AB' then 'a2000000-0000-0000-0000-000000000002' when 'A2' then 'a3000000-0000-0000-0000-000000000003'
    when 'OA' then 'b1000000-0000-0000-0000-000000000001' when 'TA' then 'b2000000-0000-0000-0000-000000000002' when 'TB' then 'b3000000-0000-0000-0000-000000000003'
    when 'FT' then 'b4000000-0000-0000-0000-000000000004' when 'D'  then 'b5000000-0000-0000-0000-000000000005' when 'OA2' then 'b6000000-0000-0000-0000-000000000006'
    when 'B1O' then 'b7000000-0000-0000-0000-000000000007' when 'B1T' then 'b8000000-0000-0000-0000-000000000008' when 'Y1O' then 'b9000000-0000-0000-0000-000000000009'
    when 'S' then 'c1000000-0000-0000-0000-000000000001' end::uuid
$$;
create function tt.tok(n integer) returns uuid language sql as $$ select ('f2000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
-- the id of the request made with token n, WITHOUT the caller's row security
create function tt.rid(n integer) returns uuid language sql security definer as $$ select id from public.requests where token = tt.tok(n) $$;
create function tt.status(n integer) returns text language sql security definer as $$ select status from public.requests where token = tt.tok(n) $$;
-- a photo path in the folder of a unit
create function tt.ph(p_unit text, n integer, p_ext text default 'jpg') returns text language sql as $$
  select '40000000-0000-0000-0000-00000000000' || p_unit || '/bbbbbbbb-bbbb-bbbb-bbbb-' || lpad(n::text, 12, '0') || '.' || p_ext
$$;
-- open a request (as the current user)
create function tt.mk(n integer, p_unit text, p_title text default 'Asansör çalışmıyor', p_photos text[] default null, p_requester uuid default null,
                      p_category text default 'asansor', p_priority text default 'normal', p_location text default null)
returns uuid language sql as $$
  select public.create_request(tt.tok(n), tt.unit(p_unit), p_category, p_title, 'Açıklama metni', p_priority, p_location, p_photos, p_requester)
$$;
-- notification counts WITHOUT the caller's row security
create function tt.nots(p_profile text, p_kind text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where profile_id = tt.u(p_profile) and (p_kind is null or kind = p_kind)
$$;
create function tt.unread(p_profile text, p_kind text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where profile_id = tt.u(p_profile) and kind = p_kind and read_at is null
$$;
-- the texts of all notifications of a person, joined
create function tt.notes(p_profile text) returns text language sql security definer as $$
  select coalesce(string_agg(kind || '|' || title || '|' || coalesce(body, '') || '|' || coalesce(link, ''), ' ## ' order by kind, title, body), '') from public.notifications where profile_id = tt.u(p_profile)
$$;
-- the timeline of a request as text, kinds sorted (all rows of one test share one transaction time)
create function tt.events(n integer) returns text language sql security definer as $$
  select coalesce(string_agg(kind || ':' || coalesce(from_status, '') || '>' || coalesce(to_status, '') || ':' || coalesce(rating::text, ''), ' ' order by kind, to_status, from_status, rating), '')
    from public.request_events where request_id = tt.rid(n)
$$;
-- Try to rename a photo as the CURRENT user: returns how many rows the user was allowed to touch
create function tt.try_rename_object(p_name text, p_new text) returns integer language plpgsql as $$
declare n integer;
begin
  update storage.objects set name = p_new where bucket_id = 'talep-fotolari' and name = p_name;
  get diagnostics n = row_count;
  return n;
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{"full_name":"Admin A"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{"full_name":"Admin B"}'),
  ('a3000000-0000-0000-0000-000000000003', 'admin-x2@test.local', '{"full_name":"Admin X2"}'),
  ('b1000000-0000-0000-0000-000000000001', 'oa@test.local', '{"full_name":"Mehmet Malik"}'),
  ('b2000000-0000-0000-0000-000000000002', 'ta@test.local', '{"full_name":"Kemal Kiracı"}'),
  ('b3000000-0000-0000-0000-000000000003', 'tb@test.local', '{"full_name":"Yeni Kiracı"}'),
  ('b4000000-0000-0000-0000-000000000004', 'ft@test.local', '{"full_name":"Eski Kiracı"}'),
  ('b5000000-0000-0000-0000-000000000005', 'd@test.local', '{"full_name":"Pasif Kişi"}'),
  ('b6000000-0000-0000-0000-000000000006', 'oa2@test.local', '{"full_name":"Dilek Diğer"}'),
  ('b7000000-0000-0000-0000-000000000007', 'b1o@test.local', '{"full_name":"Bora Malik"}'),
  ('b8000000-0000-0000-0000-000000000008', 'b1t@test.local', '{"full_name":"Berna Kiracı"}'),
  ('b9000000-0000-0000-0000-000000000009', 'y1o@test.local', '{"full_name":"Başka Site"}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');

insert into public.companies (id, name, settings) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1', '{}'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2', '{}');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site X'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site Y');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'A Blok'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a1', 'B Blok'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a2', 'Y Blok');
insert into public.units (id, block_id, door_no) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '1'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '1'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '3'),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000003', '1');
insert into public.site_members (profile_id, site_id, role) values
  ('a1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('a3000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('a2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'admin');
update public.profiles set is_active = false where id = 'b5000000-0000-0000-0000-000000000005';
insert into public.unit_residents (unit_id, profile_id, relation, start_date, end_date) values
  ('40000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'tenant', tt.today() - 90,  null),
  ('40000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', 'tenant', tt.today() - 30,  null),
  ('40000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000004', 'tenant', tt.today() - 200, tt.today() - 31),
  ('40000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000006', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000005', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000007', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000008', 'tenant', tt.today() - 60,  null),
  ('40000000-0000-0000-0000-000000000005', 'b9000000-0000-0000-0000-000000000009', 'owner',  tt.today() - 400, null);

-- Photo files (storage objects) that tests will attach. owner_id is who uploaded it.
insert into storage.objects (bucket_id, name, owner_id) values
  ('talep-fotolari', tt.ph('1', 1), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 2), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 3), tt.u('TA')::text),     -- uploaded by the tenant, in unit 1
  ('talep-fotolari', tt.ph('1', 4), tt.u('AA')::text),     -- uploaded by the admin (a request opened by phone)
  ('talep-fotolari', tt.ph('1', 5), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 6), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 7), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 8), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 9), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('2', 10), tt.u('OA')::text),    -- OA uploaded into the folder of unit 2 (he does not live there)
  ('talep-fotolari', tt.ph('2', 11), tt.u('OA2')::text),
  ('talep-fotolari', tt.ph('1', 12, 'png'), tt.u('OA')::text),
  ('talep-fotolari', tt.ph('1', 13, 'webp'), tt.u('OA')::text);

delete from public.notifications;

-- ---------------------------------------------------------------------------
-- 1. Structure and permissions
-- ---------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.requests'::regclass, 'public.request_events'::regclass, 'public.request_comments'::regclass, 'public.request_photos'::regclass)),
  'all four new tables have row security');
select ok(not has_table_privilege('authenticated', 'public.requests', 'insert') and not has_table_privilege('authenticated', 'public.requests', 'update') and not has_table_privilege('authenticated', 'public.requests', 'delete')
      and not has_table_privilege('authenticated', 'public.request_events', 'insert') and not has_table_privilege('authenticated', 'public.request_events', 'update') and not has_table_privilege('authenticated', 'public.request_events', 'delete')
      and not has_table_privilege('authenticated', 'public.request_comments', 'insert') and not has_table_privilege('authenticated', 'public.request_comments', 'update') and not has_table_privilege('authenticated', 'public.request_comments', 'delete')
      and not has_table_privilege('authenticated', 'public.request_photos', 'insert') and not has_table_privilege('authenticated', 'public.request_photos', 'update') and not has_table_privilege('authenticated', 'public.request_photos', 'delete'),
  'nobody writes any of the four tables from a browser');
select ok(not has_table_privilege('anon', 'public.requests', 'select') and not has_table_privilege('anon', 'public.request_events', 'select')
      and not has_table_privilege('anon', 'public.request_comments', 'select') and not has_table_privilege('anon', 'public.request_photos', 'select'),
  'a visitor reads none of them');
select ok(has_column_privilege('authenticated', 'public.requests', 'title', 'select') and not has_column_privilege('authenticated', 'public.requests', 'token', 'select'),
  'the double-tap token of a request is not readable');
select ok(not has_function_privilege('authenticated', 'private.request_changed()', 'execute')
      and not has_function_privilege('authenticated', 'private.request_comment_added()', 'execute')
      and not has_function_privilege('authenticated', 'private.request_status_label(text)', 'execute')
      and not has_function_privilege('authenticated', 'private.unit_label(uuid)', 'execute')
      and has_function_privilege('authenticated', 'private.request_access(uuid)', 'execute')
      and has_function_privilege('authenticated', 'private.can_read_request_photo(text)', 'execute')
      and not has_function_privilege('anon', 'private.request_access(uuid)', 'execute')
      and not has_function_privilege('anon', 'private.can_read_request_photo(text)', 'execute'),
  'the trigger functions cannot be called from a browser; the two policy helpers can be called by a logged-in person only');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                       and p.proname in ('create_request', 'update_request', 'cancel_request', 'set_request_status', 'set_request_triage', 'add_request_comment', 'rate_request')
                       and has_function_privilege('anon', p.oid, 'execute')),
  'a visitor can execute none of the request functions');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
            and p.proname in ('create_request', 'update_request', 'cancel_request', 'set_request_status', 'set_request_triage', 'add_request_comment', 'rate_request')
            and p.prosecdef and p.proconfig::text = '{"search_path=\"\""}' and has_function_privilege('authenticated', p.oid, 'execute')), 7,
  'all seven request functions are security definer with an empty search_path and are open to logged-in people');
select is((select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'talep-fotolari'),
  '(f,5242880,"{image/jpeg,image/png,image/webp}")', 'the photo bucket is private, 5 MB, JPG / PNG / WEBP only');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'talep-fotolari:%'), 2,
  'two storage policies: upload (insert) and read (select)');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'talep-fotolari:%' and cmd in ('UPDATE', 'DELETE', 'ALL')),
  '...so nobody can change or delete a photo from a browser');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('requests', 'request_events', 'request_comments', 'request_photos')), 4,
  'one read policy per table, nothing else (no write policy exists)');
select is((select count(*)::int from pg_trigger where tgrelid in ('public.requests'::regclass, 'public.request_comments'::regclass) and not tgisinternal), 4,
  'four triggers: touch, request insert / update, comment insert');
select lives_ok($$insert into public.notifications (profile_id, kind, title, event_key) values ('b1000000-0000-0000-0000-000000000001', 'request_new', 'x', 'k-a'),
                  ('b1000000-0000-0000-0000-000000000001', 'request_status', 'x', 'k-b'), ('b1000000-0000-0000-0000-000000000001', 'request_comment', 'x', 'k-c')$$,
  'the bell accepts the three new kinds');
select throws_ok($$insert into public.notifications (profile_id, kind, title, event_key) values ('b1000000-0000-0000-0000-000000000001', 'request_other', 'x', 'k-d')$$,
  '23514', null, '...and still refuses an unknown kind');
delete from public.notifications;

-- ---------------------------------------------------------------------------
-- 2. Opening a request: who may
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select tt.mk(1, '1')$$, '42501', null, 'a visitor cannot open a request');
reset role;
select pg_temp.act_as(tt.u('S'));
select throws_ok($$select tt.mk(1, '1')$$, '42501', 'not allowed', 'a stranger cannot open a request');
reset role;
select pg_temp.act_as(tt.u('OA2'));
select throws_ok($$select tt.mk(1, '1')$$, '42501', 'not allowed', 'a resident of ANOTHER unit cannot open a request for unit A1');
reset role;
select pg_temp.act_as(tt.u('FT'));
select throws_ok($$select tt.mk(1, '1')$$, '42501', 'not allowed', 'a former tenant (moved out) cannot');
reset role;
select pg_temp.act_as(tt.u('D'));
select throws_ok($$select tt.mk(1, '2')$$, '42501', 'not allowed', 'a deactivated owner cannot');
reset role;
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select tt.mk(1, '1', p_requester => tt.u('OA'))$$, '42501', 'not allowed', 'the admin of ANOTHER site cannot open one for a unit of this site');
reset role;
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.create_request(null, tt.unit('1'), 'asansor', 'Başlık', 'Açıklama', 'normal', null, null, null)$$, 'P0001', 'invalid_request', 'no token is refused');
select throws_ok($$select public.create_request(tt.tok(1), null, 'asansor', 'Başlık', 'Açıklama', 'normal', null, null, null)$$, 'P0001', 'invalid_request', 'no unit is refused');
select throws_ok($$select public.create_request(tt.tok(1), '99999999-9999-9999-9999-999999999999', 'asansor', 'Başlık', 'Açıklama', 'normal', null, null, null)$$, '42501', 'not allowed', 'an unknown unit is refused (the same answer as "not yours")');
reset role;
select is((select count(*)::int from public.requests), 0, 'nothing was written by any of the refusals');

-- ---------------------------------------------------------------------------
-- 3. Opening a request: the checks on the content
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select tt.mk(1, '1', p_category => 'uzay')$$, 'P0001', 'category_invalid', 'an unknown category is refused');
select throws_ok($$select tt.mk(1, '1', p_category => null)$$, 'P0001', 'category_invalid', 'no category is refused');
select throws_ok($$select tt.mk(1, '1', p_title => 'ab')$$, 'P0001', 'title_invalid', 'a title of 2 letters is refused');
select throws_ok($$select tt.mk(1, '1', p_title => '   ab   ')$$, 'P0001', 'title_invalid', '...spaces do not count');
select throws_ok($$select tt.mk(1, '1', p_title => repeat('a', 121))$$, 'P0001', 'title_invalid', 'a title of 121 letters is refused');
select throws_ok($$select tt.mk(1, '1', p_title => null)$$, 'P0001', 'title_invalid', 'no title is refused');
select throws_ok($$select public.create_request(tt.tok(1), tt.unit('1'), 'asansor', 'Başlık', 'ab', 'normal', null, null, null)$$, 'P0001', 'description_invalid', 'a description of 2 letters is refused');
select throws_ok($$select public.create_request(tt.tok(1), tt.unit('1'), 'asansor', 'Başlık', repeat('a', 2001), 'normal', null, null, null)$$, 'P0001', 'description_invalid', 'a description of 2001 letters is refused');
select throws_ok($$select public.create_request(tt.tok(1), tt.unit('1'), 'asansor', 'Başlık', null, 'normal', null, null, null)$$, 'P0001', 'description_invalid', 'no description is refused');
select throws_ok($$select tt.mk(1, '1', p_priority => 'hemen')$$, 'P0001', 'priority_invalid', 'an unknown priority is refused');
select throws_ok($$select tt.mk(1, '1', p_priority => null)$$, 'P0001', 'priority_invalid', 'no priority is refused');
select throws_ok($$select tt.mk(1, '1', p_location => repeat('a', 121))$$, 'P0001', 'location_invalid', 'a place of 121 letters is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[tt.ph('1', 1), tt.ph('1', 2), tt.ph('1', 5), tt.ph('1', 6)])$$, 'P0001', 'too_many_photos', 'four photos are refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[tt.ph('1', 99)])$$, 'P0001', 'photo_invalid', 'a photo that was never uploaded is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[tt.ph('1', 3)])$$, 'P0001', 'photo_invalid', 'a photo uploaded by SOMEONE ELSE (the tenant) is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[tt.ph('2', 10)])$$, 'P0001', 'photo_invalid', 'a photo from the folder of ANOTHER unit is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array['not-a-path'])$$, 'P0001', 'photo_invalid', 'a strange path is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[null]::text[])$$, 'P0001', 'photo_invalid', 'an empty entry is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[tt.ph('1', 1), tt.ph('1', 1)])$$, 'P0001', 'photo_used', 'the same photo twice in one request is refused');
select throws_ok($$select tt.mk(1, '1', p_photos => array[replace(tt.ph('1', 1), '.jpg', '.gif')])$$, 'P0001', 'photo_invalid', 'a wrong file type in the name is refused');
reset role;
select is((select count(*)::int from public.requests), 0, 'still nothing written');

-- ---------------------------------------------------------------------------
-- 4. Opening a request: the real thing
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('OA'));
select isnt(tt.mk(1, '1', p_photos => array[tt.ph('1', 1), tt.ph('1', 2)], p_location => 'Zemin kat asansör'), null, 'the owner opens request 1 with two photos');
select is(tt.mk(1, '1', p_photos => array[tt.ph('1', 1), tt.ph('1', 2)], p_location => 'Zemin kat asansör'), tt.rid(1), 'the same token again returns the same request (double tap)');
reset role;
select is((select count(*)::int from public.requests where token = tt.tok(1)), 1, '...and no second request exists');
select is((select count(*)::int from public.request_photos where request_id = tt.rid(1)), 2, '...and no second set of photos');
select is((select row(site_id, unit_id, requester_id, created_by, category, title, priority, location, status, rating)::text from public.requests where id = tt.rid(1)),
  '(20000000-0000-0000-0000-0000000000a1,40000000-0000-0000-0000-000000000001,b1000000-0000-0000-0000-000000000001,b1000000-0000-0000-0000-000000000001,asansor,"Asansör çalışmıyor",normal,"Zemin kat asansör",acik,)',
  'the row: site, unit, requester and creator are the owner, status Açık, no rating');
select is((select string_agg(position::text || ':' || right(file_path, 5), ',' order by position) from public.request_photos where request_id = tt.rid(1)), '1:1.jpg,2:2.jpg', 'the photos keep their order (1, 2)');
select is(tt.events(1), 'created:>acik:', 'the timeline starts with one "opened" row');
select pg_temp.act_as(tt.u('TA'));
select throws_ok($$select tt.mk(1, '1')$$, 'P0001', 'token_used', 'another person using the same token gets "token_used", not the first request');
select throws_ok($$select tt.mk(2, '1', p_photos => array[tt.ph('1', 1)])$$, 'P0001', 'photo_invalid', 'a photo that belongs to another request is refused (it was uploaded by the owner, not by TA)');
reset role;
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select tt.mk(2, '1', p_photos => array[tt.ph('1', 1)])$$, 'P0001', 'photo_used', 'a photo already attached to request 1 cannot be attached again');
select isnt(tt.mk(2, '1', 'Kapı zili bozuk', array[tt.ph('1', 12, 'png'), tt.ph('1', 13, 'webp')]), null, 'png and webp photos are accepted');
select isnt(tt.mk(3, '1', 'Üç fotoğraf', array[tt.ph('1', 5), tt.ph('1', 6), tt.ph('1', 7)]), null, 'three photos are accepted');
select isnt(tt.mk(4, '1', 'Fotoğrafsız', null), null, 'a request without photos works (null)');
select isnt(tt.mk(5, '1', 'Boş liste', array[]::text[]), null, '...and with an empty list');
select is(tt.mk(6, '1', p_requester => tt.u('OA')) is not null, true, 'a resident may pass their OWN id as the requester');
select throws_ok($$select tt.mk(7, '1', p_requester => tt.u('TA'))$$, 'P0001', 'requester_invalid', 'a resident cannot open a request for ANOTHER person');
reset role;
select is((select count(*)::int from public.request_events where request_id in (tt.rid(1), tt.rid(2), tt.rid(3), tt.rid(4), tt.rid(5), tt.rid(6))), 6, 'each request has exactly one "opened" row');
select is((select count(*)::int from public.requests where status = 'acik' and unit_id = tt.unit('1')), 6, 'six open requests in unit A1 so far');

-- On behalf of a resident (a phone call)
select pg_temp.act_as(tt.u('AA'));
select isnt(tt.mk(10, '1', 'Telefonla bildirildi', array[tt.ph('1', 4)], tt.u('TA')), null, 'the admin opens a request for the tenant and attaches the photo the admin uploaded');
select throws_ok($$select tt.mk(11, '1', p_requester => null)$$, 'P0001', 'requester_invalid', 'an admin must say for whom');
select throws_ok($$select tt.mk(11, '1', p_requester => tt.u('FT'))$$, 'P0001', 'requester_invalid', '...not for a person who moved out');
select throws_ok($$select tt.mk(11, '1', p_requester => tt.u('S'))$$, 'P0001', 'requester_invalid', '...not for a stranger');
select throws_ok($$select tt.mk(11, '1', p_requester => tt.u('OA2'))$$, 'P0001', 'requester_invalid', '...not for a resident of another unit');
select throws_ok($$select tt.mk(11, '1', p_requester => tt.u('AA'))$$, 'P0001', 'requester_invalid', '...and not for themself');
reset role;
select is((select row(requester_id, created_by)::text from public.requests where id = tt.rid(10)), '(b2000000-0000-0000-0000-000000000002,a1000000-0000-0000-0000-000000000001)', 'the request belongs to the tenant; the admin typed it');
select is((select actor_id::text from public.request_events where request_id = tt.rid(10)), tt.u('AA')::text, 'the first timeline row names the admin');

-- 10 open requests per unit
select pg_temp.act_as(tt.u('OA2'));
select lives_ok($$select tt.mk(20 + g, '2', 'Sınır ' || g) from generate_series(1, 10) g$$, 'ten open requests in unit A2');
select throws_ok($$select tt.mk(31, '2', 'Bir fazla')$$, 'P0001', 'too_many_open', 'the eleventh open request of a unit is refused');
select lives_ok($$select public.cancel_request(tt.rid(21))$$, 'cancelling one frees a place');
select lives_ok($$select tt.mk(31, '2', 'Şimdi olur')$$, '...and now it works');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Who reads what (row security)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('OA'));
select is((select count(*)::int from public.requests where id in (tt.rid(1), tt.rid(2), tt.rid(3), tt.rid(4), tt.rid(5), tt.rid(6))), 6, 'the owner reads his own six requests');
select is((select count(*)::int from public.requests where id = tt.rid(10)), 0, '...not the one that belongs to the tenant of the same unit');
select is((select count(*)::int from public.requests where id = tt.rid(21)), 0, '...and nothing of another unit');
select is((select count(*)::int from public.request_events where request_id = tt.rid(1)), 1, 'he reads the timeline of his request');
select is((select count(*)::int from public.request_events where request_id = tt.rid(10)), 0, '...not the timeline of the tenant''s');
select is((select count(*)::int from public.request_photos where request_id = tt.rid(1)), 2, 'he reads the photo list of his request');
select is((select count(*)::int from public.request_photos where request_id = tt.rid(10)), 0, '...not that of the tenant''s');
select throws_ok($$select token from public.requests$$, '42501', null, 'the token column is closed ("permission denied")');
select is(private.request_access(tt.rid(1)), 'requester', 'the policy helper says "requester" for him');
select is(private.request_access(tt.rid(10)), null, '...and nothing for the tenant''s request');
reset role;
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from public.requests where id = tt.rid(10)), 1, 'the tenant reads the request the admin opened for them');
select is((select count(*)::int from public.requests where id in (tt.rid(1), tt.rid(2), tt.rid(3))), 0, '...and none of the owner''s');
select is((select count(*)::int from public.request_photos where request_id = tt.rid(10)), 1, '...with its photo row');
reset role;
select pg_temp.act_as(tt.u('TB'));
select is((select count(*)::int from public.requests), 0, 'another tenant of the same unit reads none');
reset role;
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::int from public.requests), 18, 'the admin of the site reads all 18 requests (6 of the owner, 1 of the tenant, 11 of unit A2)');
select is((select count(*)::int from public.request_events), 19, '...and every timeline row (opened x18, cancelled x1)');
select is((select count(*)::int from public.request_photos), 8, '...and every photo row (2 + 2 + 3 + 1)');
select is(private.request_access(tt.rid(1)), 'admin', 'the policy helper says "admin"');
reset role;
select pg_temp.act_as(tt.u('A2'));
select is((select count(*)::int from public.requests), 18, 'a second admin of the same site reads them all too');
reset role;
select pg_temp.act_as(tt.u('AB'));
select is((select count(*)::int from public.requests) + (select count(*)::int from public.request_events) + (select count(*)::int from public.request_comments) + (select count(*)::int from public.request_photos), 0,
  'the admin of ANOTHER site reads nothing from the four tables');
reset role;
select pg_temp.act_as(tt.u('S'));
select is((select count(*)::int from public.requests), 0, 'a stranger reads none');
reset role;
select pg_temp.act_as(tt.u('OA2'));
select is((select count(*)::int from public.requests where unit_id = tt.unit('1')), 0, 'a resident of another unit reads none of unit A1''s');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select count(*) from public.requests$$, '42501', null, 'a visitor gets "permission denied"');
select throws_ok($$select count(*) from public.request_comments$$, '42501', null, '...on every table');
reset role;

-- A person who moves out, or whose account is switched off, reads nothing any more
update public.unit_residents set end_date = tt.today() where profile_id = tt.u('TA') and unit_id = tt.unit('1');
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from public.requests), 0, 'a tenant who moved out today reads none of their own requests');
select is((select count(*)::int from public.request_events) + (select count(*)::int from public.request_photos), 0, '...nor the timeline or photos');
select throws_ok($$select public.add_request_comment(tt.rid(10), 'Merhaba', false)$$, '42501', 'not allowed', '...and cannot comment');
select throws_ok($$select public.cancel_request(tt.rid(10))$$, '42501', 'not allowed', '...cancel');
select throws_ok($$select public.update_request(tt.rid(10), 'asansor', 'Yeni başlık', 'Yeni açıklama', 'normal', null)$$, '42501', 'not allowed', '...or edit');
reset role;
update public.unit_residents set end_date = null where profile_id = tt.u('TA') and unit_id = tt.unit('1');
update public.profiles set is_active = false where id = tt.u('TA');
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from public.requests), 0, 'a deactivated account reads none');
reset role;
update public.profiles set is_active = true where id = tt.u('TA');
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from public.requests), 1, 'and the request is back when the account is back');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Photo files: upload and read
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('TA'));
select lives_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-000000000001.jpg')$$, 'a tenant can upload a photo into the folder of the unit they live in');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000002/cccccccc-cccc-cccc-cccc-000000000002.jpg')$$, '42501', null, '...but not into another unit''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-000000000003.pdf')$$, '42501', null, 'a PDF name is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-000000000004.exe')$$, '42501', null, 'an .exe name is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', 'not-a-uuid/file.jpg')$$, '42501', null, 'a strange folder name is refused cleanly');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/sub/cccccccc-cccc-cccc-cccc-000000000005.jpg')$$, '42501', null, 'a deeper path is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/CCCCCCCC-CCCC-CCCC-CCCC-000000000006.jpg')$$, '42501', null, 'a name with capital letters is refused (one exact shape)');
reset role;
select pg_temp.act_as(tt.u('FT'));
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-000000000007.jpg')$$, '42501', null, 'a former tenant cannot upload');
reset role;
select pg_temp.act_as(tt.u('D'));
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000002/cccccccc-cccc-cccc-cccc-000000000008.jpg')$$, '42501', null, 'a deactivated owner cannot upload');
reset role;
select pg_temp.act_as(tt.u('S'));
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-000000000009.jpg')$$, '42501', null, 'a stranger cannot upload');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-00000000000a.jpg')$$, '42501', null, 'a visitor cannot upload');
reset role;
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-00000000000b.jpg')$$, '42501', null, 'the admin of ANOTHER site cannot upload into this site''s unit');
reset role;
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000001/cccccccc-cccc-cccc-cccc-00000000000c.jpg')$$, 'the admin of the site can upload into a unit of the site (a request opened by phone)');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000004/cccccccc-cccc-cccc-cccc-00000000000d.jpg')$$, '...even into an EMPTY unit of the site');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('talep-fotolari', '40000000-0000-0000-0000-000000000005/cccccccc-cccc-cccc-cccc-00000000000e.jpg')$$, '42501', null, '...but not into a unit of another site');
reset role;

-- Reading. Photo 1 and 2 (unit 1): uploaded by OA, attached to request 1 (OA). Photo 4: uploaded by AA, attached to request 10 (TA).
select pg_temp.act_as(tt.u('OA'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name in (tt.ph('1', 1), tt.ph('1', 2))), 2, 'the owner reads the photos of his request');
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 8)), 1, '...and a photo he uploaded but did not attach (to see the preview)');
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 4)), 0, '...but not the photo of the tenant''s request');
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 3)), 0, '...nor a file the tenant uploaded');
select is(tt.try_rename_object(tt.ph('1', 1), tt.ph('1', 99)), 0, 'a resident cannot rename or move a photo');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 1)), 1, '...the file is still there (checked as postgres)');
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 4)), 1, 'the tenant reads the photo that the ADMIN uploaded for their request (not through owner_id)');
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name in (tt.ph('1', 1), tt.ph('1', 2))), 0, '...and not the photos of the owner''s request');
reset role;
select pg_temp.act_as(tt.u('TB'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari'), 0, 'another tenant of the same unit reads no photo');
reset role;
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name in (tt.ph('1', 1), tt.ph('1', 2), tt.ph('1', 4), tt.ph('1', 5), tt.ph('1', 6), tt.ph('1', 7))), 6, 'the admin of the site reads every attached photo');
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 8)), 0, '...but not a file that no request uses (a resident''s unsent upload)');
reset role;
select pg_temp.act_as(tt.u('AB'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari'), 0, 'the admin of another site reads no photo');
reset role;
select pg_temp.act_as(tt.u('S'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari'), 0, 'a stranger reads no photo');
reset role;
select pg_temp.act_as_visitor();
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari'), 0, 'a visitor reads no photo');
reset role;
-- A tenant who moved out can no longer read a photo that somebody ELSE uploaded for them
update public.unit_residents set end_date = tt.today() where profile_id = tt.u('TA') and unit_id = tt.unit('1');
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from storage.objects where bucket_id = 'talep-fotolari' and name = tt.ph('1', 4)), 0, 'a tenant who moved out no longer reads the photo the admin uploaded for them');
reset role;
update public.unit_residents set end_date = null where profile_id = tt.u('TA') and unit_id = tt.unit('1');

-- ---------------------------------------------------------------------------
-- 7. Notifications of a new request
-- ---------------------------------------------------------------------------
select is(tt.nots('AA', 'request_new'), 16, 'the admin who typed request 10 himself was told about the other 16, not about his own');
select is(tt.nots('A2', 'request_new'), 17, 'the second admin was told about all 17');
select is(tt.nots('AB'), 0, 'the admin of another site was told nothing');
select is(tt.nots('S') + tt.nots('FT') + tt.nots('D'), 0, 'strangers and moved-out people were told nothing');
select is(tt.nots('OA') + tt.nots('OA2'), 0, 'residents are not told about their own new requests');
select is(tt.nots('TA', 'request_status'), 1, 'the tenant was told that the admin opened a request for them');
select is((select title || ' | ' || body || ' | ' || link from public.notifications where profile_id = tt.u('TA') and kind = 'request_status'), 'Sizin için bir talep açıldı | Telefonla bildirildi | /taleplerim/' || tt.rid(10)::text, '...with the title and an internal link');
select is((select link from public.notifications where profile_id = tt.u('A2') and kind = 'request_new' and link = '/yonetim/talepler/' || tt.rid(1)::text), '/yonetim/talepler/' || tt.rid(1)::text, 'an admin''s notification links to the admin page of the request');
select is((select title || ' | ' || body from public.notifications where profile_id = tt.u('A2') and kind = 'request_new' and link = '/yonetim/talepler/' || tt.rid(1)::text), 'Yeni talep | A Blok · 1 · Asansör çalışmıyor', '...and says which unit and what');
select ok((select bool_and(link ~ '^/[A-Za-z0-9/_-]{0,80}$') from public.notifications where kind like 'request%'), 'every link is an internal path');

-- ---------------------------------------------------------------------------
-- 8. The status steps (admin)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.set_request_status(tt.rid(1), 'inceleniyor')$$, '42501', 'not allowed', 'a resident cannot change a status (not even of his own request)');
reset role;
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select public.set_request_status(tt.rid(1), 'inceleniyor')$$, '42501', 'not allowed', 'the admin of ANOTHER site cannot');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select public.set_request_status(tt.rid(1), 'inceleniyor')$$, '42501', null, 'a visitor cannot');
reset role;
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.set_request_status('99999999-9999-9999-9999-999999999999', 'inceleniyor')$$, '42501', 'not allowed', 'an unknown request is refused as "not allowed"');
select throws_ok($$select public.set_request_status(tt.rid(1), 'bitti')$$, 'P0001', 'status_invalid', 'an unknown status is refused');
select throws_ok($$select public.set_request_status(tt.rid(1), null)$$, 'P0001', 'status_invalid', 'no status is refused');
select throws_ok($$select public.set_request_status(tt.rid(1), 'iptal')$$, 'P0001', 'status_invalid', 'an admin cannot cancel (only the resident can)');
select throws_ok($$select public.set_request_status(tt.rid(1), 'acik')$$, 'P0001', 'status_same', 'the same status again is refused');
select lives_ok($$select public.set_request_status(tt.rid(1), 'inceleniyor')$$, 'the admin moves request 1 to İnceleniyor');
select lives_ok($$select public.set_request_status(tt.rid(1), 'islemde')$$, '...then İşlemde');
reset role;
select is(tt.status(1), 'islemde', 'the status is İşlemde');
select is(tt.events(1), 'created:>acik: status:acik>inceleniyor: status:inceleniyor>islemde:', 'the timeline has every step in it');
select is((select resolved_at is null from public.requests where id = tt.rid(1)), true, 'no solution time yet');
select is(tt.nots('OA', 'request_status'), 2, 'the owner was told twice (a second change is NOT swallowed by the first)');
select is(tt.notes('OA'), 'request_status|Talebinizin durumu değişti|Asansör çalışmıyor · İnceleniyor|/taleplerim/' || tt.rid(1)::text || ' ## request_status|Talebinizin durumu değişti|Asansör çalışmıyor · İşlemde|/taleplerim/' || tt.rid(1)::text, '...with the new step in the text');
select is(tt.unread('AA', 'request_new') + tt.unread('A2', 'request_new'), 16 + 17 - 1 - 1, 'the admins'' unread "new request" for request 1 went away (somebody handled it); the others stay');
select is(tt.nots('AA', 'request_status') + tt.nots('A2', 'request_status') + tt.nots('TA', 'request_comment'), 0, 'the admin who changed it is not told about it');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.set_request_status(tt.rid(1), 'cozuldu')$$, 'Çözüldü');
reset role;
select is((select resolved_at is not null from public.requests where id = tt.rid(1)), true, 'the time of the solution is set');
select is(tt.nots('OA', 'request_status'), 3, 'a third notification');
-- rating
select pg_temp.act_as(tt.u('TA'));
select throws_ok($$select public.rate_request(tt.rid(1), 5)$$, '42501', 'not allowed', 'another person of the unit cannot rate the owner''s request');
reset role;
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.rate_request(tt.rid(1), 5)$$, '42501', 'not allowed', 'an admin cannot rate');
reset role;
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.rate_request(tt.rid(1), 0)$$, 'P0001', 'rating_invalid', 'rating 0 is refused');
select throws_ok($$select public.rate_request(tt.rid(1), 6)$$, 'P0001', 'rating_invalid', 'rating 6 is refused');
select throws_ok($$select public.rate_request(tt.rid(1), null)$$, 'P0001', 'rating_invalid', 'no rating is refused');
select throws_ok($$select public.rate_request(tt.rid(4), 5)$$, 'P0001', 'not_resolved', 'a request that is not solved yet cannot be rated');
select lives_ok($$select public.rate_request(tt.rid(1), 4)$$, 'the owner rates the solved request with 4');
select throws_ok($$select public.rate_request(tt.rid(1), 5)$$, 'P0001', 'already_rated', 'a second rating is refused');
select is((select rating::int from public.requests where id = tt.rid(1)), 4, 'the rating stays 4');
reset role;
select is(tt.events(1), 'created:>acik: rated:>:4 status:islemde>cozuldu: status:acik>inceleniyor: status:inceleniyor>islemde:', 'the rating is in the timeline');
select is(tt.nots('OA'), 3, 'rating by himself notifies nobody');
-- close, then comment rules, then reopen
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.set_request_status(tt.rid(1), 'kapandi')$$, 'the admin closes it (Kapandı)');
select is((select rating::int from public.requests where id = tt.rid(1)), 4, 'between the two solved steps the rating stays');
reset role;
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.add_request_comment(tt.rid(1), 'Teşekkürler', false)$$, 'P0001', 'request_closed', 'a resident cannot comment on a closed request');
reset role;
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.add_request_comment(tt.rid(1), 'Not: kapatıldı', true)$$, 'an admin can still write an internal note on a closed request');
select lives_ok($$select public.set_request_status(tt.rid(1), 'islemde')$$, 'reopen: back to İşlemde');
reset role;
select is((select row(status, rating, rated_at, resolved_at)::text from public.requests where id = tt.rid(1)), '(islemde,,,)', 'reopening clears the rating and the time of the solution (they belong to the old solution)');
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.rate_request(tt.rid(1), 3)$$, 'P0001', 'not_resolved', '...and it cannot be rated until it is solved again');
reset role;
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.set_request_status(tt.rid(1), 'cozuldu')$$, 'solved again');
reset role;
select pg_temp.act_as(tt.u('OA'));
select lives_ok($$select public.rate_request(tt.rid(1), 2)$$, 'the new solution can be rated (2)');
reset role;
select is((select count(*)::int from public.request_events where request_id = tt.rid(1) and kind = 'rated'), 2, 'the timeline keeps both ratings');
-- direct table checks
select throws_ok($$update public.requests set status = 'bitti' where id = tt.rid(2)$$, '23514', null, 'the table itself refuses an unknown status');
select throws_ok($$update public.requests set rating = 3, rated_at = now() where id = tt.rid(2)$$, '23514', null, '...and a rating on a request that is not solved');
select throws_ok($$update public.requests set rated_at = null where id = tt.rid(1)$$, '23514', null, '...and a rating without its time');
select throws_ok($$update public.requests set rating = 9, rated_at = now() where id = tt.rid(1)$$, '23514', null, '...and a rating of 9');
select throws_ok($$insert into public.request_comments (request_id, by_admin, is_internal, body) values (tt.rid(2), false, true, 'x')$$, '23514', null, '...and an internal comment that is not from an admin');
select throws_ok($$insert into public.request_photos (request_id, file_path, position) values (tt.rid(4), tt.ph('1', 99), 4)$$, '23514', null, '...and a fourth photo (position 4)');
select throws_ok($$insert into public.request_photos (request_id, file_path, position) values (tt.rid(3), tt.ph('1', 99), 1)$$, '23505', null, '...and two photos at the same position');
select throws_ok($$insert into public.request_photos (request_id, file_path, position) values (tt.rid(4), tt.ph('1', 1), 1)$$, '23505', null, '...and one file used twice');

-- the cancelled request: no more changes
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.set_request_status(tt.rid(21), 'islemde')$$, 'P0001', 'request_cancelled', 'a cancelled request cannot be moved again');
select throws_ok($$select public.set_request_triage(tt.rid(21), 'asansor', 'acil')$$, 'P0001', 'request_cancelled', '...or sorted again');
reset role;

-- ---------------------------------------------------------------------------
-- 9. Triage (category and priority)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.set_request_triage(tt.rid(2), 'elektrik', 'acil')$$, '42501', 'not allowed', 'a resident cannot change the priority of a request');
reset role;
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select public.set_request_triage(tt.rid(2), 'elektrik', 'acil')$$, '42501', 'not allowed', 'the admin of another site cannot');
reset role;
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.set_request_triage(tt.rid(2), 'uzay', 'acil')$$, 'P0001', 'category_invalid', 'an unknown category is refused');
select throws_ok($$select public.set_request_triage(tt.rid(2), 'elektrik', 'hemen')$$, 'P0001', 'priority_invalid', 'an unknown priority is refused');
select lives_ok($$select public.set_request_triage(tt.rid(2), 'elektrik', 'acil')$$, 'the admin sets category and priority');
reset role;
select is((select category || '/' || priority from public.requests where id = tt.rid(2)), 'elektrik/acil', 'saved');
select is(tt.events(2), 'created:>acik:', '...with no timeline row');
select is(tt.nots('OA', 'request_status'), 6, '...and no notification (still the 6 of request 1)');

-- ---------------------------------------------------------------------------
-- 10. The resident edits and cancels
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('TA'));
select throws_ok($$select public.update_request(tt.rid(2), 'asansor', 'Başka başlık', 'Başka metin', 'normal', null)$$, '42501', 'not allowed', 'another person of the unit cannot edit the owner''s request');
select throws_ok($$select public.cancel_request(tt.rid(2))$$, '42501', 'not allowed', '...or cancel it');
reset role;
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.update_request(tt.rid(2), 'asansor', 'Başka başlık', 'Başka metin', 'normal', null)$$, '42501', 'not allowed', 'an admin cannot edit the text of a resident''s request');
select throws_ok($$select public.cancel_request(tt.rid(2))$$, '42501', 'not allowed', '...or cancel it');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select public.cancel_request(tt.rid(2))$$, '42501', null, 'a visitor cannot cancel');
reset role;
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.update_request(tt.rid(4), 'uzay', 'Başlık', 'Açıklama', 'normal', null)$$, 'P0001', 'category_invalid', 'edit: an unknown category is refused');
select throws_ok($$select public.update_request(tt.rid(4), 'asansor', 'x', 'Açıklama', 'normal', null)$$, 'P0001', 'title_invalid', '...a short title');
select throws_ok($$select public.update_request(tt.rid(4), 'asansor', 'Başlık', 'x', 'normal', null)$$, 'P0001', 'description_invalid', '...a short description');
select throws_ok($$select public.update_request(tt.rid(4), 'asansor', 'Başlık', 'Açıklama', 'hemen', null)$$, 'P0001', 'priority_invalid', '...a wrong priority');
select throws_ok($$select public.update_request(tt.rid(4), 'asansor', 'Başlık', 'Açıklama', 'normal', repeat('a', 121))$$, 'P0001', 'location_invalid', '...a long place');
select lives_ok($$select public.update_request(tt.rid(4), 'temizlik', 'Merdiven kirli', 'Yeni metin', 'yuksek', 'Merdiven')$$, 'the owner edits request 4 while it is Açık');
reset role;
select is((select row(category, title, description, priority, location, status)::text from public.requests where id = tt.rid(4)), '(temizlik,"Merdiven kirli","Yeni metin",yuksek,Merdiven,acik)', 'the edit is saved');
select is(tt.events(4), 'created:>acik:', '...and the timeline is unchanged');
select pg_temp.act_as(tt.u('OA'));
select lives_ok($$select public.cancel_request(tt.rid(5))$$, 'the owner cancels request 5');
select throws_ok($$select public.cancel_request(tt.rid(5))$$, 'P0001', 'not_open', 'cancelling twice is refused');
select throws_ok($$select public.update_request(tt.rid(5), 'asansor', 'Başlık', 'Açıklama', 'normal', null)$$, 'P0001', 'not_open', 'a cancelled request cannot be edited');
select throws_ok($$select public.add_request_comment(tt.rid(5), 'Merhaba', false)$$, 'P0001', 'request_closed', '...or commented');
select throws_ok($$select public.rate_request(tt.rid(5), 5)$$, 'P0001', 'not_resolved', '...or rated');
select throws_ok($$select public.cancel_request(tt.rid(1))$$, 'P0001', 'not_open', 'a request that is being worked on cannot be cancelled by the resident');
select throws_ok($$select public.update_request(tt.rid(1), 'asansor', 'Başlık', 'Açıklama', 'normal', null)$$, 'P0001', 'not_open', '...or edited');
reset role;
select is(tt.status(5), 'iptal', 'request 5 is Cancelled');
select is(tt.events(5), 'created:>acik: status:acik>iptal:', '...the timeline shows it');
select is(tt.nots('OA'), 6, 'the person who cancels is not told about it (still the 6 of request 1)');
select is((select count(*)::int from public.notifications where kind = 'request_new' and link = '/yonetim/talepler/' || tt.rid(5)::text), 0, 'the admins'' unread "new request" of the cancelled request is gone');
select is((select count(*)::int from public.notifications where kind = 'request_new' and link = '/yonetim/talepler/' || tt.rid(4)::text), 2, '...while the one of request 4 stays');
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.set_request_status(tt.rid(5), 'acik')$$, 'P0001', 'request_cancelled', 'an admin cannot bring a cancelled request back');
reset role;

-- ---------------------------------------------------------------------------
-- 11. Comments and the internal notes
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.add_request_comment(tt.rid(3), 'Gizli not', true)$$, '42501', 'not allowed', 'a resident who asks for an INTERNAL note is refused');
select throws_ok($$select public.add_request_comment(tt.rid(3), '   ', false)$$, 'P0001', 'body_invalid', 'an empty comment is refused');
select throws_ok($$select public.add_request_comment(tt.rid(3), repeat('a', 2001), false)$$, 'P0001', 'body_invalid', '...and one of 2001 letters');
select throws_ok($$select public.add_request_comment(tt.rid(3), null, false)$$, 'P0001', 'body_invalid', '...and none');
select lives_ok($$select public.add_request_comment(tt.rid(3), 'Sabah da denedim, hala bozuk', false)$$, 'the owner writes a comment');
select lives_ok($$select public.add_request_comment(tt.rid(3), 'Sabah da denedim, hala bozuk', null)$$, '...and null for "internal" means "not internal"');
reset role;
select is((select row(by_admin, is_internal, author_id)::text from public.request_comments where request_id = tt.rid(3) order by id limit 1), '(f,f,b1000000-0000-0000-0000-000000000001)', 'the row says: not by an admin, not internal, author OA');
select pg_temp.act_as(tt.u('TA'));
select throws_ok($$select public.add_request_comment(tt.rid(3), 'Ben de gördüm', false)$$, '42501', 'not allowed', 'another person of the unit cannot comment');
reset role;
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select public.add_request_comment(tt.rid(3), 'Merhaba', false)$$, '42501', 'not allowed', 'the admin of another site cannot comment');
reset role;
select pg_temp.act_as(tt.u('S'));
select throws_ok($$select public.add_request_comment(tt.rid(3), 'Merhaba', false)$$, '42501', 'not allowed', 'a stranger cannot comment');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select public.add_request_comment(tt.rid(3), 'Merhaba', false)$$, '42501', null, 'a visitor cannot comment');
reset role;
select is(tt.nots('AA', 'request_comment'), 2, 'both comments of the owner told the admin AA ...');
select is(tt.nots('A2', 'request_comment'), 2, '...and the second admin');
select is(tt.nots('OA', 'request_comment'), 0, '...but not the owner who wrote them');
select is((select title || ' | ' || body || ' | ' || link from public.notifications where profile_id = tt.u('AA') and kind = 'request_comment' limit 1),
  'Talebe yeni yorum | A Blok · 1 · Üç fotoğraf: Sabah da denedim, hala bozuk | /yonetim/talepler/' || tt.rid(3)::text, 'the text names the unit, the request and the comment');

-- the admin answers in public: the requester is told
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.add_request_comment(tt.rid(3), 'Teknisyen yarın gelecek', false)$$, 'the admin answers in public');
reset role;
select is(tt.nots('OA', 'request_comment'), 1, 'the owner was told');
select is((select title || ' | ' || body || ' | ' || link from public.notifications where profile_id = tt.u('OA') and kind = 'request_comment'), 'Talebinize yanıt var | Üç fotoğraf: Teknisyen yarın gelecek | /taleplerim/' || tt.rid(3)::text, '...with the text and the link');
select is(tt.nots('A2', 'request_comment'), 2, 'the other admin is not told about the admin''s own answer');
select is((select row(by_admin, is_internal)::text from public.request_comments where request_id = tt.rid(3) and body like 'Teknisyen%'), '(t,f)', 'the row says: by an admin, not internal');

-- THE INTERNAL NOTE: four ways it could leak
create temp table before_note as select (select count(*) from public.notifications) as n;
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.add_request_comment(tt.rid(3), 'GIZLI-NOT-XYZ: komşu şikayetçi', true)$$, 'the admin writes an INTERNAL note');
select is((select count(*)::int from public.request_comments where request_id = tt.rid(3) and is_internal), 1, 'the admin reads it back');
select is((select row(by_admin, is_internal)::text from public.request_comments where body like 'GIZLI-NOT-XYZ%'), '(t,t)', 'by an admin and internal');
reset role;
select is((select count(*) from public.notifications), (select n from before_note), 'LEAK 1: the internal note created NO notification at all');
select is((select count(*)::int from public.notifications where body like '%GIZLI-NOT-XYZ%' or title like '%GIZLI-NOT-XYZ%'), 0, '...and no text of it is in any notification');
select pg_temp.act_as(tt.u('OA'));
select is((select count(*)::int from public.request_comments where request_id = tt.rid(3) and is_internal), 0, 'LEAK 2: the owner does not read the internal note (direct select, filter on the flag)');
select is((select count(*)::int from public.request_comments where body like '%GIZLI-NOT-XYZ%'), 0, '...nor by searching for its text');
select is((select count(*)::int from public.request_comments where request_id = tt.rid(3)), 3, '...he reads the 3 normal comments (2 of his, 1 answer)');
select is((select count(*)::int from public.request_comments), 3, '...and no other comment of any request');
select throws_ok($$select token from public.requests$$, '42501', null, 'LEAK 3: no other column or helper hands out the note (the token stays closed too)');
reset role;
select pg_temp.act_as(tt.u('TA'));
select is((select count(*)::int from public.request_comments), 0, 'the other person of the unit reads no comment of the owner''s request');
reset role;
select pg_temp.act_as(tt.u('A2'));
select is((select count(*)::int from public.request_comments where request_id = tt.rid(3)), 4, 'a second admin reads all four, internal included');
reset role;
select pg_temp.act_as(tt.u('AB'));
select is((select count(*)::int from public.request_comments), 0, 'the admin of another site reads none');
reset role;
-- an admin note on a request opened by phone for TA: TA must not read it either
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.add_request_comment(tt.rid(10), 'GIZLI-NOT-ABC', true)$$, 'an internal note on the tenant''s request');
select lives_ok($$select public.add_request_comment(tt.rid(10), 'Merhaba, arayıp haber verin', false)$$, '...and a public answer');
reset role;
select pg_temp.act_as(tt.u('TA'));
select is((select string_agg(body, '|') from public.request_comments), 'Merhaba, arayıp haber verin', 'the tenant reads only the public answer');
reset role;
select is(tt.nots('TA', 'request_comment'), 1, 'the tenant was told about the public answer only');

-- Comments of a resident to an admin on the phone request; the requester can still comment while the request is open
select pg_temp.act_as(tt.u('TA'));
select lives_ok($$select public.add_request_comment(tt.rid(10), 'Teşekkürler', false)$$, 'the tenant answers');
reset role;
select is(tt.nots('AA', 'request_comment'), 3, 'the admin who wrote last is told of the tenant''s answer (2 earlier + 1)');

-- ---------------------------------------------------------------------------
-- 12. A request in a closed state, a different admin, ownership
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('A2'));
select lives_ok($$select public.set_request_status(tt.rid(10), 'cozuldu')$$, 'the second admin solves the tenant''s request');
reset role;
select is(tt.nots('TA', 'request_status'), 2, 'the tenant was told (the "opened for you" message + this one)');
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select public.rate_request(tt.rid(10), 5)$$, '42501', 'not allowed', 'the owner cannot rate the tenant''s request');
reset role;
select pg_temp.act_as(tt.u('TA'));
select lives_ok($$select public.rate_request(tt.rid(10), 5)$$, 'the tenant rates it');
select lives_ok($$select public.add_request_comment(tt.rid(10), 'Çözüldü, sağ olun', false)$$, 'a resident can still comment on a SOLVED request (it is not closed)');
reset role;

-- ---------------------------------------------------------------------------
-- 13. Notifications must never make a request fail
-- ---------------------------------------------------------------------------
alter table public.notifications add constraint zz_always_fails check (false) not valid;
select pg_temp.act_as(tt.u('OA'));
select lives_ok($$select tt.mk(40, '1', 'Bildirim bozuk olsa da')$$, 'a request is still saved when no notification can be written');
select lives_ok($$select public.add_request_comment(tt.rid(40), 'Yorum da yazılır', false)$$, '...and a comment');
reset role;
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.set_request_status(tt.rid(40), 'inceleniyor')$$, '...and a status change');
select lives_ok($$select public.add_request_comment(tt.rid(40), 'Yanıt', false)$$, '...and an answer');
reset role;
select is(tt.status(40), 'inceleniyor', 'the status really changed');
select is(tt.events(40), 'created:>acik: status:acik>inceleniyor:', '...and the timeline too');
alter table public.notifications drop constraint zz_always_fails;

-- ---------------------------------------------------------------------------
-- 14. Other rules
-- ---------------------------------------------------------------------------
select throws_ok($$delete from public.units where id = tt.unit('1')$$, '23503', null, 'a unit with requests cannot be deleted');
select throws_ok($$delete from public.sites where id = '20000000-0000-0000-0000-0000000000a1'$$, '23503', null, 'a site with requests cannot be deleted');
delete from public.requests where id = tt.rid(3);
select is((select count(*)::int from public.request_comments where request_id = tt.rid(3)) + (select count(*)::int from public.request_events where request_id = tt.rid(3)) + (select count(*)::int from public.request_photos where request_id = tt.rid(3)), 0, 'deleting a request (as postgres) takes its comments, timeline and photo rows with it');
select is((select count(*)::int from public.request_events where kind = 'created'), (select count(*)::int from public.requests), 'every request that exists has exactly one "opened" row');
select is((select count(*)::int from public.requests where status in ('cozuldu', 'kapandi') and resolved_at is null) + (select count(*)::int from public.requests where status not in ('cozuldu', 'kapandi') and resolved_at is not null), 0, 'a solution time exists exactly when the status is Çözüldü or Kapandı');
select is((select count(*)::int from public.requests where created_by is null or requester_id is null or site_id is distinct from private.unit_site_id(unit_id)), 0, 'every request has a creator, a requester and the site of its unit');

select * from finish();
rollback;
