-- Database tests for 0007_announcements.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (Firma 1 has payment_mode = mock):
--   AA admin of Site X    A2 second admin of Site X    AB admin of Site Y (Firma 2)
--   Unit A1 (Blok A):  OA owner, TA tenant since 90 days, TB tenant since 30 days, FT former tenant (moved out)
--   Unit A2 (Blok A):  OA2 owner, D owner whose account is deactivated
--   Unit B1 (Blok B):  B1O owner, B1T tenant since 60 days          Unit A3 (Blok A): empty
--   S stranger (no unit)   Y1O owner of Y1 (Site Y)
-- Lines (amount, due in days):  L1 A1 100 (-60)  L2 A1 200 (+10)  L3 A1 300 (+10, owner only)  L6 A2 60 (+3)

begin;
create extension if not exists pgtap with schema extensions;
select plan(236);

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
create function tt.cid(n integer) returns uuid language sql as $$ select ('e1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.rid(n integer) returns uuid language sql as $$ select ('f1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.site() returns uuid language sql as $$ select '20000000-0000-0000-0000-0000000000a1'::uuid $$;
create function tt.fp(p_unit text, n integer) returns text language sql as $$
  select '40000000-0000-0000-0000-00000000000' || p_unit || '/aaaaaaaa-aaaa-aaaa-aaaa-' || lpad(n::text, 12, '0') || '.pdf'
$$;
-- target builders
create function tt.t_site(p_aud text default 'all') returns jsonb language sql as $$ select jsonb_build_object('scope', 'site', 'audience', p_aud) $$;
create function tt.t_blocks(p_ids text[], p_aud text default 'all') returns jsonb language sql as $$ select jsonb_build_object('scope', 'blocks', 'audience', p_aud, 'block_ids', to_jsonb(p_ids)) $$;
create function tt.t_units(p_ids text[], p_aud text default 'all') returns jsonb language sql as $$ select jsonb_build_object('scope', 'units', 'audience', p_aud, 'unit_ids', to_jsonb(p_ids)) $$;
create function tt.t_persons(p_ids text[]) returns jsonb language sql as $$ select jsonb_build_object('scope', 'persons', 'audience', 'all', 'profile_ids', to_jsonb(p_ids)) $$;
-- "people/units" of a preview
create function tt.prev(p_target jsonb) returns text language sql as $$
  select p.recipients || '/' || p.units from public.preview_announcement_audience(tt.site(), p_target) p
$$;
-- the id of the notice made with request id n, WITHOUT the caller's row security
create function tt.nid(n integer) returns uuid language sql security definer as $$ select id from public.transfer_notices where request_id = tt.rid(n) $$;
-- announcements are found by their (unique) title
create function tt.aid(p_title text) returns uuid language sql security definer as $$ select id from public.announcements where title = p_title $$;
create function tt.save(p_title text, p_target jsonb, p_publish_at timestamptz default null, p_expire_at timestamptz default null, p_type text default 'genel', p_pinned boolean default false)
returns uuid language sql as $$
  select public.save_announcement(null, tt.site(), p_title, 'Metin: ' || p_title, p_type, p_pinned, p_target, p_publish_at, p_expire_at)
$$;
-- notification counts WITHOUT the caller's row security (so tests can look at rows a person may not read yet)
create function tt.nots(p_profile text, p_kind text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where profile_id = p_profile::uuid and (p_kind is null or kind = p_kind)
$$;
create function tt.unread(p_profile text, p_kind text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where profile_id = p_profile::uuid and kind = p_kind and read_at is null
$$;

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
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1', '{"payment_mode":"mock"}'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2', '{}');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site X'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site Y');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'A Blok'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a1', repeat('B', 100)),
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
update public.profiles set full_name = repeat('Ö', 200) where id = 'b9000000-0000-0000-0000-000000000009';
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

update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000001' where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'aidat';
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000002' where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'demirbas';
insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible) values
  ('d0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001', '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true);
create function pg_temp.line(p_n integer, p_unit text, p_type text, p_amount numeric, p_due integer, p_visible boolean, p_desc text default null)
returns void language sql as $$
  insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period, created_at, description)
  values (tt.cid(p_n), tt.unit(p_unit), p_type::uuid, 'd0000000-0000-0000-0000-000000000001', p_amount, tt.today() + p_due, p_visible,
          date_trunc('month', tt.today() + p_due)::date, timestamptz '2026-01-01' + p_n * interval '1 minute', p_desc);
$$;
select pg_temp.line(1, '1', 'cccccccc-0000-0000-0000-000000000001', 100, -60, true);
select pg_temp.line(2, '1', 'cccccccc-0000-0000-0000-000000000001', 200,  10, true);
select pg_temp.line(3, '1', 'cccccccc-0000-0000-0000-000000000002', 300,  10, false);
select pg_temp.line(6, '2', 'cccccccc-0000-0000-0000-000000000001',  60,   3, true);

delete from public.notifications; -- the fixture lines above created some: every count below starts from nothing

-- ---------------------------------------------------------------------------
-- 1. Structure, permissions and the text helpers
-- ---------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.notifications'::regclass, 'public.announcements'::regclass, 'public.announcement_recipients'::regclass, 'public.announcement_reads'::regclass)),
  'all four new tables have row security');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert') and not has_table_privilege('authenticated', 'public.announcements', 'insert')
      and not has_table_privilege('authenticated', 'public.announcements', 'update') and not has_table_privilege('authenticated', 'public.announcements', 'delete')
      and not has_table_privilege('authenticated', 'public.announcement_reads', 'insert') and not has_table_privilege('authenticated', 'public.announcement_recipients', 'select'),
  'nobody writes notifications, announcements or reads from a browser, and nobody reads the recipient list directly');
select ok(not has_table_privilege('anon', 'public.notifications', 'select') and not has_table_privilege('anon', 'public.announcements', 'select') and not has_table_privilege('anon', 'public.announcement_reads', 'select'),
  'a visitor reads none of them');
select ok(has_column_privilege('authenticated', 'public.announcements', 'title', 'select') and not has_column_privilege('authenticated', 'public.announcements', 'target', 'select')
      and not has_column_privilege('authenticated', 'public.announcements', 'created_by', 'select') and not has_column_privilege('authenticated', 'public.announcements', 'resend_count', 'select'),
  'a resident can read the text of an announcement, but never its target, author or counters');
select ok(has_column_privilege('authenticated', 'public.notifications', 'read_at', 'update') and not has_column_privilege('authenticated', 'public.notifications', 'title', 'update')
      and not has_column_privilege('authenticated', 'public.notifications', 'profile_id', 'update') and has_table_privilege('authenticated', 'public.notifications', 'delete'),
  'on a notification a person may change only read_at, and delete it');
select ok(not has_function_privilege('authenticated', 'private.notify(uuid, text, text, text, text, text, timestamptz)', 'execute')
      and not has_function_privilege('authenticated', 'private.audience(uuid, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'private.normalize_target(uuid, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'private.notify_payment()', 'execute')
      and has_function_privilege('authenticated', 'private.can_read_announcement(uuid)', 'execute'),
  'the internal functions cannot be called from a browser; the policy helper still can');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                       and p.proname in ('preview_announcement_audience', 'save_announcement', 'publish_announcement', 'unpublish_announcement', 'delete_announcement',
                                         'resend_announcement_unread', 'list_announcements', 'announcement_target', 'announcement_report', 'mark_announcement_read')
                       and has_function_privilege('anon', p.oid, 'execute')),
  'a visitor can execute none of the announcement functions');
select is(private.format_try(0.33), '₺0,33', 'money text: 33 kuruş');
select is(private.format_try(1000), '₺1.000,00', '...one thousand');
select is(private.format_try(1000000), '₺1.000.000,00', '...one million');
select is(private.format_try(12.5) || ' ' || private.format_try(0) || ' ' || private.format_try(999.99) || ' ' || private.format_try(1234567.89), '₺12,50 ₺0,00 ₺999,99 ₺1.234.567,89', '...and a few more');
select is(private.format_try(1500), '₺1.500,00', '...the same text as the app writes (₺1.500,00)');
select is(private.tr_month(date '2026-11-15') || ' / ' || private.tr_month(date '2026-01-01') || ' / ' || private.tr_month(date '2026-08-31'), 'Kasım 2026 / Ocak 2026 / Ağustos 2026', 'month names in Turkish');
select throws_ok($$insert into public.notifications (profile_id, kind, title, event_key, link) values ('b1000000-0000-0000-0000-000000000001', 'charge', 'x', 'k1', 'https://evil.example')$$,
  '23514', null, 'a notification link must be an internal page, not an address');
select throws_ok($$insert into public.notifications (profile_id, kind, title, event_key, link) values ('b1000000-0000-0000-0000-000000000001', 'charge', 'x', 'k2', 'javascript:alert(1)')$$,
  '23514', null, '...and never a script');

-- ---------------------------------------------------------------------------
-- 2. Who is meant: the audience resolver (preview = publish)
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select tt.prev(tt.t_site())$$, '42501', null, 'a visitor cannot preview');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.prev(tt.t_site())$$, '42501', 'not allowed', 'a resident cannot preview');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.prev(tt.t_site())$$, '42501', 'not allowed', 'the admin of ANOTHER site cannot preview this site');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(tt.prev(tt.t_site()), '6/3', 'whole site: 6 people in 3 units (a moved-out person and a deactivated account are not counted)');
select is(tt.prev(tt.t_site('owners')), '3/3', 'only owners: 3');
select is(tt.prev(tt.t_site('tenants')), '3/2', 'only tenants: 3 in 2 units');
select is(tt.prev(tt.t_blocks(array['30000000-0000-0000-0000-000000000001'])), '4/2', 'Blok A: 4 people in 2 units');
select is(tt.prev(tt.t_blocks(array['30000000-0000-0000-0000-000000000002'])), '2/1', 'Blok B: 2 people');
select is(tt.prev(tt.t_blocks(array['30000000-0000-0000-0000-000000000001'], 'owners')), '2/2', 'owners of Blok A: 2');
select is(tt.prev(tt.t_units(array[tt.unit('1')::text])), '3/1', 'unit A1: its owner and its two current tenants');
select is(tt.prev(tt.t_persons(array['b2000000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-000000000007'])), '2/2', 'two named persons');
select is(tt.prev(tt.t_units(array[tt.unit('4')::text])), '0/0', 'an empty unit has nobody');
-- "debtors" = the person SEES a line with money left. OA sees L1, L2, L3; TA sees L1, L2; TB sees only L2 (L1 is older than his move-in, L3 is owner-only); OA2 sees L6.
select is(tt.prev(tt.t_site('debtors')), '4/2', 'debtors: OA, TA, TB and OA2 each see an open line');
reset role;
update public.charges set tenant_visible = false where id = tt.cid(2);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(tt.prev(tt.t_site('debtors')), '3/2', 'when L2 is owner-only, TB sees NO open line: he is not picked although the owner owes money. OA, TA (L1) and OA2 stay');
select is(tt.prev(tt.t_site('tenants')), '3/2', '...while "tenants" still means all three tenants');
reset role;
update public.charges set tenant_visible = true where id = tt.cid(2);
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(tt.prev(tt.t_blocks(array['30000000-0000-0000-0000-000000000002'], 'debtors')), '0/0', 'nobody in Blok B owes anything');
select throws_ok($$select tt.prev('{"scope":"galaxy","audience":"all"}')$$, 'P0001', 'target_invalid', 'an unknown scope is refused');
select throws_ok($$select tt.prev('{"scope":"site","audience":"everyone"}')$$, 'P0001', 'target_invalid', 'an unknown audience is refused');
select throws_ok($$select tt.prev('{"scope":"blocks","audience":"all","block_ids":[]}')$$, 'P0001', 'target_invalid', 'an empty list of blocks is refused');
select throws_ok($$select tt.prev('{"scope":"blocks","audience":"all"}')$$, 'P0001', 'target_invalid', 'blocks without a list are refused');
select throws_ok($$select tt.prev('{"scope":"blocks","audience":"all","block_ids":"x"}')$$, 'P0001', 'target_invalid', 'a list that is not a list is refused');
select throws_ok($$select tt.prev('{"scope":"blocks","audience":"all","block_ids":["not-a-uuid"]}')$$, 'P0001', 'target_invalid', 'a strange id is refused cleanly');
select throws_ok($$select tt.prev(tt.t_blocks(array['30000000-0000-0000-0000-000000000003']))$$, 'P0001', 'target_invalid', 'a block of ANOTHER site is refused');
select throws_ok($$select tt.prev(tt.t_units(array[tt.unit('5')::text]))$$, 'P0001', 'target_invalid', 'a unit of another site is refused');
select throws_ok($$select tt.prev(tt.t_persons(array['b4000000-0000-0000-0000-000000000004']))$$, 'P0001', 'target_invalid', 'a person who moved out cannot be named');
select throws_ok($$select tt.prev(tt.t_persons(array['b9000000-0000-0000-0000-000000000009']))$$, 'P0001', 'target_invalid', 'a person of another site cannot be named');
select throws_ok($$select tt.prev('{"scope":"persons","audience":"owners","profile_ids":["b1000000-0000-0000-0000-000000000001"]}')$$, 'P0001', 'target_invalid', 'named persons cannot be narrowed further');
select throws_ok($$select tt.prev(tt.t_units((select array_agg(gen_random_uuid()::text) from generate_series(1, 201))))$$, 'P0001', 'target_invalid', 'more than 200 ids are refused');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Saving
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.save('Deneme', tt.t_site())$$, '42501', 'not allowed', 'a resident cannot write an announcement');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.save('Deneme', tt.t_site())$$, '42501', 'not allowed', 'the admin of another site cannot');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.save_announcement(null, tt.site(), 'ab', 'Metin', 'genel', false, tt.t_site(), null, null)$$, 'P0001', 'title_invalid', 'a title of 2 letters is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', '   ', 'genel', false, tt.t_site(), null, null)$$, 'P0001', 'body_invalid', 'an empty text is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', repeat('x', 5001), 'genel', false, tt.t_site(), null, null)$$, 'P0001', 'body_invalid', 'a text over 5000 characters is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', 'Metin', 'reklam', false, tt.t_site(), null, null)$$, 'P0001', 'type_invalid', 'an unknown type is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', 'Metin', 'genel', false, tt.t_site(), null, now() - interval '1 hour')$$, 'P0001', 'date_invalid', 'an end time in the past is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', 'Metin', 'genel', false, tt.t_site(), now() + interval '2 days', now() + interval '1 day')$$, 'P0001', 'date_invalid', 'an end time before the start time is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', 'Metin', 'genel', false, tt.t_site(), now() + interval '2 years', null)$$, 'P0001', 'date_invalid', 'a start time more than a year away is refused');
select throws_ok($$select public.save_announcement(null, tt.site(), 'Başlık', 'Metin', 'genel', false, '{"scope":"x"}', null, null)$$, 'P0001', 'target_invalid', 'a bad target is refused');
select lives_ok($$select tt.save('Taslak duyuru', tt.t_site())$$, 'a draft is saved');
select is((select status || '/' || (published_at is null) || '/' || type from public.list_announcements(tt.site()) where title = 'Taslak duyuru'), 'draft/true/genel', '...it is a draft, not published');
select is((select recipient_count from public.list_announcements(tt.site()) where title = 'Taslak duyuru'), 0, '...with no recipients yet');
select is(public.save_announcement(tt.aid('Taslak duyuru'), tt.site(), 'Taslak duyuru', 'Yeni metin', 'bakim', true, tt.t_site('owners'), null, null), tt.aid('Taslak duyuru'), 'a draft can be changed');
select is((select type || '/' || pinned::text || '/' || body from public.list_announcements(tt.site()) where title = 'Taslak duyuru'), 'bakim/true/Yeni metin', '...the changes are saved');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.save_announcement((select tt.aid('Taslak duyuru')), tt.site(), 'Taslak duyuru', 'Hack', 'genel', false, tt.t_site(), null, null)$$, '42501', 'not allowed', 'the admin of another site cannot change it');
select throws_ok($$select public.publish_announcement(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...nor publish it');
select throws_ok($$select public.announcement_target(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...nor read its target');
select throws_ok($$select * from public.announcement_report(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...nor its report');
select is((select count(*)::integer from public.list_announcements('20000000-0000-0000-0000-0000000000a2')), 0, '...and the list of Site Y is empty');
select throws_ok($$select public.save_announcement(tt.aid('Taslak duyuru'), '20000000-0000-0000-0000-0000000000a2', 'Hack', 'Hack', 'genel', false, '{"scope":"site","audience":"all"}', null, null)$$, '42501', 'not allowed',
  '...and cannot change an announcement of Site X by naming his OWN site (Y)');
select throws_ok($$select public.unpublish_announcement(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...nor unpublish it');
select throws_ok($$select public.delete_announcement(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...nor delete it');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.unpublish_announcement(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', 'a resident cannot unpublish');
select throws_ok($$select public.delete_announcement(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...or delete');
select throws_ok($$select public.publish_announcement(tt.aid('Taslak duyuru'))$$, '42501', 'not allowed', '...or publish');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select * from public.list_announcements(tt.site())$$, '42501', 'not allowed', 'a resident cannot list the admin view');
select is((select count(*)::integer from public.announcements), 0, 'a draft is invisible to a resident');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Publishing to Blok A: who gets it, who may read it
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select tt.save('Blok A toplantısı', tt.t_blocks(array['30000000-0000-0000-0000-000000000001']), null, null, 'toplanti', true)$$, 'an announcement for Blok A is saved');
select lives_ok($$select tt.save('Boş daire', tt.t_units(array[tt.unit('4')::text]))$$, 'a draft for an empty unit is saved');
select throws_ok($$select public.publish_announcement(tt.aid('Boş daire'))$$, 'P0001', 'no_recipients', '...publishing it to nobody is refused');
select is((select status from public.list_announcements(tt.site()) where title = 'Boş daire'), 'draft', '...and it stays a draft');
select is(public.publish_announcement(tt.aid('Blok A toplantısı')), 4, 'publish: 4 recipients (OA, TA, TB, OA2)');
select is((select recipient_count::text || '/' || read_count::text from public.list_announcements(tt.site()) where title = 'Blok A toplantısı'), '4/0', 'the list says 4 recipients, 0 read');
select is(public.announcement_target(tt.aid('Blok A toplantısı')) ->> 'scope', 'blocks', 'the admin can read the target');
reset role;
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'announcement') + tt.nots('b2000000-0000-0000-0000-000000000002', 'announcement') + tt.nots('b3000000-0000-0000-0000-000000000003', 'announcement') + tt.nots('b6000000-0000-0000-0000-000000000006', 'announcement'), 4,
  'exactly one notification for each of the 4 recipients');
select is(tt.nots('b7000000-0000-0000-0000-000000000007', 'announcement') + tt.nots('b8000000-0000-0000-0000-000000000008', 'announcement') + tt.nots('b4000000-0000-0000-0000-000000000004', 'announcement')
        + tt.nots('b5000000-0000-0000-0000-000000000005', 'announcement') + tt.nots('c1000000-0000-0000-0000-000000000001', 'announcement') + tt.nots('a1000000-0000-0000-0000-000000000001', 'announcement'), 0,
  'nobody in Blok B, no moved-out person, no deactivated account, no stranger and no admin got one');
select is((select title || '|' || link || '|' || kind from public.notifications where profile_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'announcement'), 'Blok A toplantısı|/duyurular|announcement', 'the notification names the announcement and points to /duyurular');

select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select string_agg(title, ',') from public.announcements), 'Blok A toplantısı', 'a resident of Blok A reads it');
select is((select title || '/' || type || '/' || pinned::text from public.announcements), 'Blok A toplantısı/toplanti/true', '...with its type and pin');
select throws_ok($$select target from public.announcements$$, '42501', null, 'a resident cannot read the target (it could list other people)');
select throws_ok($$select created_by from public.announcements$$, '42501', null, '...nor who wrote it');
select throws_ok($$select resend_count from public.announcements$$, '42501', null, '...nor the counters');
select throws_ok($$select count(*) from public.announcement_recipients$$, '42501', null, '...nor the list of recipients');
select throws_ok($$insert into public.announcements (site_id, title, body, target) values (tt.site(), 'Hack', 'x', '{}')$$, '42501', null, '...and cannot write an announcement');
reset role;
select pg_temp.act_as('b7000000-0000-0000-0000-000000000007');
select is((select count(*)::integer from public.announcements), 0, 'a resident of Blok B does not see it');
select throws_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, '42501', 'not allowed', '...and cannot mark it read');
reset role;
select pg_temp.act_as('b4000000-0000-0000-0000-000000000004');
select is((select count(*)::integer from public.announcements), 0, 'a person who moved out does not see it');
reset role;
select pg_temp.act_as('b5000000-0000-0000-0000-000000000005');
select is((select count(*)::integer from public.announcements), 0, 'a deactivated account does not see it');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.announcements), 0, 'a stranger does not see it');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is((select count(*)::integer from public.announcements), 0, 'the admin of another site does not see it');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.announcements), 0, 'an admin who does not live there reads announcements only through the admin list');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select count(*) from public.announcements$$, '42501', null, 'a visitor reads nothing');
reset role;

-- publishing again: nobody twice; a person who joined the target meanwhile is added and told
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(public.publish_announcement(tt.aid('Blok A toplantısı')), 4, 'publishing again keeps 4 recipients');
reset role;
select is((select count(*)::integer from public.notifications where kind = 'announcement' and title = 'Blok A toplantısı'), 4, '...and sends no second notification');
insert into auth.users (id, email, raw_user_meta_data) values ('b0000000-0000-0000-0000-00000000000a', 'new@test.local', '{"full_name":"Yeni Gelen"}');
insert into public.unit_residents (unit_id, profile_id, relation, start_date) values (tt.unit('2'), 'b0000000-0000-0000-0000-00000000000a', 'tenant', tt.today());
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(public.publish_announcement(tt.aid('Blok A toplantısı')), 5, 'a person who moved into Blok A meanwhile is added on the next publish');
reset role;
select is(tt.nots('b0000000-0000-0000-0000-00000000000a', 'announcement'), 1, '...and gets one notification');
select is((select count(*)::integer from public.notifications where kind = 'announcement' and title = 'Blok A toplantısı'), 5, '...and nobody else got another');
delete from public.unit_residents where profile_id = 'b0000000-0000-0000-0000-00000000000a';
delete from public.announcement_recipients where profile_id = 'b0000000-0000-0000-0000-00000000000a';
delete from public.notifications where profile_id = 'b0000000-0000-0000-0000-00000000000a';

-- locked after publishing
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.save_announcement(tt.aid('Blok A toplantısı'), tt.site(), 'Blok A toplantısı', 'Metin', 'toplanti', true, tt.t_site(), null, null)$$, 'P0001', 'locked_after_publish', 'after publishing the target cannot change');
select throws_ok($$select public.save_announcement(tt.aid('Blok A toplantısı'), tt.site(), 'Blok A toplantısı', 'Metin', 'toplanti', true, public.announcement_target(tt.aid('Blok A toplantısı')), now() + interval '1 day', null)$$, 'P0001', 'locked_after_publish', '...nor the start time');
select lives_ok($$select public.save_announcement(tt.aid('Blok A toplantısı'), tt.site(), 'Blok A toplantısı', 'Düzeltilmiş metin', 'toplanti', false, public.announcement_target(tt.aid('Blok A toplantısı')), null, null)$$, 'but the text and the pin can');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Reading: marking read, the report, the counts
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select lives_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, 'the tenant TA opens it');
select lives_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, '...twice is fine');
select is((select count(*)::integer from public.announcement_reads), 1, '...one read');
select is((select count(*)::integer from public.notifications where read_at is not null and kind = 'announcement'), 1, '...and its notification is marked read');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.announcement_reads), 0, 'the owner does not see the tenant''s read (only their own)');
select is((select count(*)::integer from public.notifications), 1, '...and the owner sees only their own notification');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select recipient_count::text || '/' || read_count::text from public.list_announcements(tt.site()) where title = 'Blok A toplantısı'), '4/1', 'the list: 4 recipients, 1 read');
select is((select count(*)::integer || '/' || count(read_at)::integer from public.announcement_report(tt.aid('Blok A toplantısı'))), '4/1', 'the report has the SAME numbers: 4 people, 1 read');
select is((select string_agg(full_name, ',' order by full_name) from public.announcement_report(tt.aid('Blok A toplantısı')) where read_at is null), 'Dilek Diğer,Mehmet Malik,Yeni Kiracı', 'the report names who did not read');
select is((select units || '|' || relations from public.announcement_report(tt.aid('Blok A toplantısı')) where full_name = 'Kemal Kiracı'), 'A Blok · 1|tenant', '...with unit and relation');
select is((select full_name from public.announcement_report(tt.aid('Blok A toplantısı')) limit 1), 'Dilek Diğer', '...the people who did not read come first');
reset role;

-- a recipient who moved out can no longer read it
update public.unit_residents set end_date = tt.today() where profile_id = 'b3000000-0000-0000-0000-000000000003' and unit_id = tt.unit('1');
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is((select count(*)::integer from public.announcements), 0, 'a recipient who moved out today no longer reads the building''s announcements');
select throws_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, '42501', 'not allowed', '...and cannot mark it read');
reset role;
update public.unit_residents set end_date = null where profile_id = 'b3000000-0000-0000-0000-000000000003' and unit_id = tt.unit('1');

-- ---------------------------------------------------------------------------
-- 6. Resend to the unread
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.resend_announcement_unread(tt.aid('Blok A toplantısı'))$$, '42501', 'not allowed', 'a resident cannot resend');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.resend_announcement_unread(tt.aid('Blok A toplantısı'))$$, '42501', 'not allowed', 'the admin of another site cannot resend');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(public.resend_announcement_unread(tt.aid('Blok A toplantısı')), 3, 'resend reaches the 3 who did not read');
select throws_ok($$select public.resend_announcement_unread(tt.aid('Blok A toplantısı'))$$, 'P0001', 'resend_too_soon', 'a second resend within the hour is refused');
reset role;
select is((select count(*)::integer from public.notifications where kind = 'announcement' and read_at is null), 3, 'each of the 3 has ONE unread notification (the old one was replaced)');
select is((select count(*)::integer from public.notifications where kind = 'announcement' and title like 'Hatırlatma:%'), 3, '...a reminder');
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'announcement'), 1, 'the person who read it keeps just their one (read) notification: no reminder');
select is((select resend_count from public.announcements where id = tt.aid('Blok A toplantısı')), 1, 'the resend is counted');
update public.announcements set last_resent_at = now() - interval '2 hours' where id = tt.aid('Blok A toplantısı');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, 'the owner opens it now');
reset role;
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select lives_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, '...and the new tenant');
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select lives_ok($$select public.mark_announcement_read(tt.aid('Blok A toplantısı'))$$, '...and the last one');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(public.resend_announcement_unread(tt.aid('Blok A toplantısı')), 0, 'resend when everybody read it reaches nobody');
select is((select resend_count from public.list_announcements(tt.site()) where title = 'Blok A toplantısı'), 1, '...and is not counted');
select is((select recipient_count::text || '/' || read_count::text from public.list_announcements(tt.site()) where title = 'Blok A toplantısı'), '4/4', 'the list says 4 of 4 read');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Scheduling, expiry, unpublish, delete
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.publish_announcement(tt.save('Yarının duyurusu', tt.t_units(array[tt.unit('2')::text]), now() + interval '1 day', null, 'genel'))$$, 'an announcement that starts tomorrow is published');
reset role;
select is((select count(*)::integer from public.notifications where title = 'Yarının duyurusu'), 1, 'its notification exists already (for OA2; the deactivated co-owner is not a recipient)');
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is((select count(*)::integer from public.announcements where title = 'Yarının duyurusu'), 0, 'the resident does not see it before its start time');
select is((select count(*)::integer from public.notifications where title = 'Yarının duyurusu'), 0, '...the bell does not show it either');
select throws_ok($$select public.mark_announcement_read(tt.aid('Yarının duyurusu'))$$, '42501', 'not allowed', '...and it cannot be marked read yet');
reset role;
update public.announcements set publish_at = now() - interval '1 minute' where id = tt.aid('Yarının duyurusu');
update public.notifications set visible_at = now() - interval '1 minute' where title = 'Yarının duyurusu';
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is((select count(*)::integer from public.announcements where title = 'Yarının duyurusu'), 1, 'once the time has come the resident sees it');
select is((select count(*)::integer from public.notifications where title = 'Yarının duyurusu'), 1, '...and the bell shows it');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.publish_announcement(tt.save('Süreli duyuru', tt.t_units(array[tt.unit('2')::text]), null, now() + interval '1 day'))$$, 'an announcement with an end time is published');
reset role;
update public.announcements set expire_at = now() - interval '1 minute' where id = tt.aid('Süreli duyuru');
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is((select count(*)::integer from public.announcements where title = 'Süreli duyuru'), 1, 'an expired announcement can still be read (the archive); the screen shows the end time');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.resend_announcement_unread(tt.aid('Süreli duyuru'))$$, 'P0001', 'not_active', 'an expired announcement cannot be resent');
-- a typo in an announcement that has expired must be fixable: the unchanged end time stays valid, a NEW end time in the past does not
select lives_ok($$select public.save_announcement(tt.aid('Süreli duyuru'), tt.site(), 'Süreli duyuru', 'Düzeltilmiş metin', 'genel', false, public.announcement_target(tt.aid('Süreli duyuru')), null,
  (select expire_at from public.list_announcements(tt.site()) where title = 'Süreli duyuru'))$$, 'the text of an EXPIRED announcement can be corrected (its end time is sent back unchanged)');
select is((select body from public.list_announcements(tt.site()) where title = 'Süreli duyuru'), 'Düzeltilmiş metin', '...and is saved');
select throws_ok($$select public.save_announcement(tt.aid('Süreli duyuru'), tt.site(), 'Süreli duyuru', 'x', 'genel', false, public.announcement_target(tt.aid('Süreli duyuru')), null, now() - interval '2 days')$$, 'P0001', 'date_invalid',
  'but a NEW end time in the past is still refused');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.publish_announcement(tt.save('Geri alınacak', tt.t_units(array[tt.unit('2')::text])))$$, 'an announcement to take back is published');
reset role;
select is(tt.unread('b6000000-0000-0000-0000-000000000006', 'announcement'), 3, 'OA2 has 3 unread announcement notifications now (scheduled one, expiring one, this one)');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.unpublish_announcement(tt.aid('Geri alınacak'))$$, 'an admin unpublishes it');
select throws_ok($$select public.unpublish_announcement(tt.aid('Geri alınacak'))$$, 'P0001', 'not_published', '...twice is refused');
reset role;
select is(tt.unread('b6000000-0000-0000-0000-000000000006', 'announcement'), 2, 'its unread notification is gone (the bell does not lie)');
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is((select count(*)::integer from public.announcements where title = 'Geri alınacak'), 0, 'the resident no longer sees it');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.delete_announcement(tt.aid('Süreli duyuru'))$$, 'an admin deletes one');
select throws_ok($$select public.delete_announcement(tt.aid('Süreli duyuru'))$$, '42501', 'not allowed', '...twice is refused');
select is((select count(*)::integer from public.list_announcements(tt.site()) where title = 'Süreli duyuru'), 0, '...it leaves the admin list');
reset role;
select is((select count(*)::integer from public.announcements where title = 'Süreli duyuru' and deleted_at is not null), 1, '...but is only marked deleted (nothing is removed)');
select is(tt.unread('b6000000-0000-0000-0000-000000000006', 'announcement'), 1, 'its unread notification is gone too');
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is((select count(*)::integer from public.announcements where title = 'Süreli duyuru'), 0, 'the resident no longer sees a deleted announcement');
reset role;

-- editing a PUBLISHED announcement that has a start time: the form sends the stored start time back, the lock must accept it
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.publish_announcement(tt.save('Planlı düzenleme', tt.t_units(array[tt.unit('3')::text]), date_trunc('minute', now() + interval '2 days')))$$, 'a scheduled announcement (start time in two days) is published');
select lives_ok($$select public.save_announcement(tt.aid('Planlı düzenleme'), tt.site(), 'Planlı düzenleme', 'Yeni metin', 'genel', false, public.announcement_target(tt.aid('Planlı düzenleme')),
  (to_char((select publish_at from public.list_announcements(tt.site()) where title = 'Planlı düzenleme') at time zone 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI:SS') || '+03:00')::timestamptz, null)$$,
  'its text can be edited when the start time comes back written in Istanbul time (+03:00): the same moment');
select is((select body from public.list_announcements(tt.site()) where title = 'Planlı düzenleme'), 'Yeni metin', '...and is saved');
select lives_ok($$select public.save_announcement(tt.aid('Planlı düzenleme'), tt.site(), 'Planlı düzenleme', 'Yine yeni', 'genel', false, public.announcement_target(tt.aid('Planlı düzenleme')),
  (select publish_at + interval '20 seconds' from public.list_announcements(tt.site()) where title = 'Planlı düzenleme'), null)$$,
  '...and 20 seconds later in the same minute is the same start time (the form works in minutes)');
select throws_ok($$select public.save_announcement(tt.aid('Planlı düzenleme'), tt.site(), 'Planlı düzenleme', 'x', 'genel', false, public.announcement_target(tt.aid('Planlı düzenleme')),
  (select publish_at + interval '1 hour' from public.list_announcements(tt.site()) where title = 'Planlı düzenleme'), null)$$, 'P0001', 'locked_after_publish', 'but a different start time is locked');
reset role;

-- ---------------------------------------------------------------------------
-- 8. Notifications of events (start from a clean bell)
-- ---------------------------------------------------------------------------
delete from public.notifications;
-- A new charge. A1: owner OA, tenants TA (since 90 days) and TB (since 30 days), FT moved out. The date of the line decides what a tenant sees.
insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period, description) values
  (tt.cid(11), tt.unit('1'), 'cccccccc-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1500, tt.today() + 20, true,  date_trunc('month', tt.today() + 20)::date, null),
  (tt.cid(12), tt.unit('1'), 'cccccccc-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 2500, tt.today() + 25, false, date_trunc('month', tt.today() + 25)::date, 'Asansör payı'),
  (tt.cid(13), tt.unit('1'), 'cccccccc-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',  100, tt.today() - 60, true,  date_trunc('month', tt.today() - 60)::date, null),
  (tt.cid(14), tt.unit('2'), 'cccccccc-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',   60, tt.today() + 20, true,  date_trunc('month', tt.today() + 20)::date, null);
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'charge'), 3, 'a new charge: the OWNER is told about all 3 lines of their unit');
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'charge'), 2, '...the tenant TA about the 2 lines that are shown to tenants (not the owner-only one)');
select is(tt.nots('b3000000-0000-0000-0000-000000000003', 'charge'), 1, '...the newer tenant TB only about the line due after he moved in (not the old line, not the owner-only one)');
select is(tt.nots('b4000000-0000-0000-0000-000000000004', 'charge') + tt.nots('b5000000-0000-0000-0000-000000000005', 'charge') + tt.nots('b7000000-0000-0000-0000-000000000007', 'charge') + tt.nots('c1000000-0000-0000-0000-000000000001', 'charge'), 0,
  '...nobody who moved out, no deactivated account, no other unit, no stranger');
select is(tt.nots('b6000000-0000-0000-0000-000000000006', 'charge'), 1, 'the owner of A2 is told about the A2 line (the deactivated co-owner is not)');
select is((select title || '|' || body || '|' || link from public.notifications where profile_id = 'b2000000-0000-0000-0000-000000000002' and event_key = 'charge:' || tt.cid(11)::text),
  'Yeni borç|Aidat · ' || private.tr_month(tt.today() + 20) || ': ₺1.500,00 · son ödeme ' || to_char(tt.today() + 20, 'DD.MM.YYYY') || '|/borclarim', '...in plain words: type, month, amount and due date');
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select count(*)::integer from public.notifications), 2, 'the tenant reads their own 2 notifications through the bell');
select throws_ok($$update public.notifications set title = 'x'$$, '42501', null, '...cannot change the text of a notification');
select lives_ok($$update public.notifications set read_at = now() where event_key = 'charge:' || tt.cid(11)::text$$, '...can mark one read');
select is((select count(*)::integer from public.notifications where read_at is not null), 1, '...exactly one');
select throws_ok($$insert into public.notifications (profile_id, kind, title, event_key) values ('b2000000-0000-0000-0000-000000000002', 'charge', 'x', 'mine')$$, '42501', null, '...and cannot write a notification of their own');
reset role;
-- cancelling a charge removes its UNREAD notifications and keeps the read ones
update public.charges set voided_at = now(), void_reason = 'yanlış' where id = tt.cid(11);
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'charge'), 2, 'a cancelled charge: the owner''s unread notification for it is gone');
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'charge'), 2, '...the tenant who had already read it keeps it (history), the other one of the tenant stays');
select is(tt.nots('b3000000-0000-0000-0000-000000000003', 'charge'), 0, '...and the newer tenant''s unread one is gone');
-- a deleted batch (the 15 minute window) too
delete from public.charges where id in (tt.cid(12), tt.cid(13));
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'charge'), 0, 'deleted charges: their unread notifications are gone');
select is(tt.nots('b6000000-0000-0000-0000-000000000006', 'charge'), 1, '...and the notification of another unit''s line is untouched');

-- Notifications must never make a charge or a payment fail
delete from public.notifications;
alter table public.notifications add constraint zz_always_fails check (false) not valid;
select lives_ok($$insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period, description)
                   values (tt.cid(15), tt.unit('1'), 'cccccccc-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 50, tt.today() + 5, true, date_trunc('month', tt.today())::date, repeat('ç', 200))$$,
  'a charge is still created when its notification cannot be written');
select is((select count(*)::integer from public.charges where id = tt.cid(15)), 1, '...it exists');
select is((select count(*)::integer from public.notifications), 0, '...and no notification was written');
select lives_ok($$select private.notify('b1000000-0000-0000-0000-000000000001', 'charge', 'x', 'y', '/borclarim', 'direct-1')$$, 'the notify function itself never raises: a failing write is only a warning');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.record_manual_payment(tt.rid(1), tt.unit('1'), 'b1000000-0000-0000-0000-000000000001', null, 'cash', 1000, tt.today(), array[tt.cid(15)], null)$$,
  'a payment is still recorded when its notifications cannot be written');
reset role;
select is((select count(*)::integer from public.payments where request_id = tt.rid(1)), 1, '...the payment and its receipt exist');
alter table public.notifications drop constraint zz_always_fails;

-- ---------------------------------------------------------------------------
-- 9. Payments, havale notices
-- ---------------------------------------------------------------------------
delete from public.notifications;
-- the owner OA pays by hand: the owner is told, a tenant never is
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.record_manual_payment(tt.rid(2), tt.unit('1'), 'b1000000-0000-0000-0000-000000000001', null, 'cash', 10000, tt.today(), array[tt.cid(1)], null)$$, 'a payment of the owner is recorded');
reset role;
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'payment'), 1, 'the owner who paid is told: one notification');
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'payment') + tt.nots('b3000000-0000-0000-0000-000000000003', 'payment'), 0, '...a tenant is NEVER told about the owner''s payment');
select ok((select body like '₺100,00 ödemeniz alındı. Makbuz no: MKB-%' from public.notifications where profile_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'payment'), '...with the amount and the receipt number');
select is((select link from public.notifications where profile_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'payment'), '/odemelerim', '...pointing to Ödemelerim');
-- a deactivated co-owner is never told (OA2 and the deactivated D own A2 together)
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.record_manual_payment(tt.rid(5), tt.unit('2'), 'b6000000-0000-0000-0000-000000000006', null, 'cash', 1000, tt.today(), null, null)$$, 'a payment of the owner of A2 is recorded');
reset role;
select is(tt.nots('b6000000-0000-0000-0000-000000000006', 'payment'), 1, 'the owner who paid is told');
select is(tt.nots('b5000000-0000-0000-0000-000000000005'), 0, '...and the DEACTIVATED co-owner of the same unit is told nothing');
-- the tenant TA pays: the tenant and the owner are told
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.record_manual_payment(tt.rid(3), tt.unit('1'), 'b2000000-0000-0000-0000-000000000002', null, 'pos', 3000, tt.today(), array[tt.cid(15)], null)$$, 'a payment of the tenant is recorded');
reset role;
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'payment'), 1, 'the tenant who paid is told');
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'payment'), 2, '...and the owner is told about it too (2 in total now)');
select is((select count(*)::integer from public.notifications where profile_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'payment' and body like 'A Blok · 1 için ₺30,00 ödeme alındı (Ödeyen: Kemal Kiracı). Makbuz no: MKB-%'), 1, '...the owner''s text names the unit and the payer');
select is(tt.nots('b3000000-0000-0000-0000-000000000003', 'payment'), 0, '...the other tenant is not told');
-- havale notices
insert into storage.objects (bucket_id, name, owner_id) values
  ('dekontlar', tt.fp('1', 1), 'b2000000-0000-0000-0000-000000000002'),
  ('dekontlar', tt.fp('1', 2), 'b2000000-0000-0000-0000-000000000002'),
  ('dekontlar', tt.fp('1', 3), 'b2000000-0000-0000-0000-000000000002');
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select lives_ok($$select public.submit_transfer_notice(tt.rid(10), tt.unit('1'), 7500, tt.today() - 1, 'Kemal Kiracı', null, tt.fp('1', 1))$$, 'the tenant sends a havale notice');
select lives_ok($$select public.submit_transfer_notice(tt.rid(11), tt.unit('1'), 2000, tt.today() - 1, 'Kemal Kiracı', null, tt.fp('1', 2))$$, '...and a second one');
select lives_ok($$select public.submit_transfer_notice(tt.rid(12), tt.unit('1'), 3000, tt.today() - 1, 'Kemal Kiracı', null, tt.fp('1', 3))$$, '...and a third one');
reset role;
select is(tt.nots('a1000000-0000-0000-0000-000000000001', 'havale_new') + tt.nots('a3000000-0000-0000-0000-000000000003', 'havale_new'), 6, 'each of the 2 admins of the site is told about each of the 3 notices');
select is(tt.nots('a2000000-0000-0000-0000-000000000002', 'havale_new') + tt.nots('b1000000-0000-0000-0000-000000000001', 'havale_new') + tt.nots('b2000000-0000-0000-0000-000000000002', 'havale_new'), 0, '...the admin of another site, the owner and the sender are not');
select ok((select body = 'A Blok · 1 · ₺75,00 · Kemal Kiracı' and link = '/yonetim/havale-onaylari' from public.notifications where profile_id = 'a1000000-0000-0000-0000-000000000001' and event_key = 'notice:' || tt.nid(10)::text), '...with unit, amount and sender, pointing to Havale Onayları');
delete from public.notifications where kind = 'payment' and profile_id = 'b2000000-0000-0000-0000-000000000002'; -- the tenant's own, so that only the havale answer is counted for him below
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.approve_transfer_notice(tt.nid(10), null)$$, 'the admin approves the first notice (75 TL)');
reset role;
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'havale_approved'), 1, 'the sender gets exactly one "Havale onaylandı"');
select is(tt.nots('b2000000-0000-0000-0000-000000000002'), 1, '...and no extra "payment received" for the same money');
select ok((select body like '₺75,00 tutarındaki havale bildiriminiz onaylandı. Makbuz no: MKB-%' from public.notifications where profile_id = 'b2000000-0000-0000-0000-000000000002' and kind = 'havale_approved'), '...with the amount and the receipt number');
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'payment'), 3, 'the OWNER is told about the approved money too (3 in total: own payment, the tenant''s payment, this one)');
select is(tt.nots('a1000000-0000-0000-0000-000000000001', 'havale_new') + tt.nots('a3000000-0000-0000-0000-000000000003', 'havale_new'), 4, 'the admins'' unread "new notice" for the decided notice is gone (2 notices are still waiting, 2 admins)');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.reject_transfer_notice(tt.nid(11), 'Tutar hesabımıza geçmedi')$$, 'the admin rejects the second notice');
reset role;
select ok((select body = '₺20,00 tutarındaki havale bildiriminiz reddedildi. Neden: Tutar hesabımıza geçmedi' and link = '/havale-bildirimi' from public.notifications where profile_id = 'b2000000-0000-0000-0000-000000000002' and kind = 'havale_rejected'), 'the sender is told, with the reason');
select is(tt.nots('a1000000-0000-0000-0000-000000000001', 'havale_new'), 1, '...and the notice that is left is the only "new notice" of the admin');
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select lives_ok($$select public.cancel_transfer_notice(tt.nid(12))$$, 'the sender withdraws the third notice');
reset role;
select is(tt.nots('a1000000-0000-0000-0000-000000000001', 'havale_new') + tt.nots('a3000000-0000-0000-0000-000000000003', 'havale_new'), 0, 'the admins no longer have an unread "new notice"');
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'havale_approved') + tt.nots('b2000000-0000-0000-0000-000000000002', 'havale_rejected'), 2, '...and a withdrawal sends the sender nothing new');

-- cancelling a payment: "payment received" stays, "payment cancelled" is added
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.void_payment((select id from public.payments where request_id = tt.rid(2)), 'Yanlış kayıt')$$, 'the admin cancels the owner''s payment');
reset role;
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'payment'), 3, 'the owner still has all 3 "payment received" notifications: a cancel does not remove them');
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'payment_void'), 1, '...and a "payment cancelled"');
select ok((select body like 'MKB-%numaralı makbuz iptal edildi. Neden: Yanlış kayıt. İlgili borçlar yeniden ödenmemiş görünür.' from public.notifications where profile_id = 'b1000000-0000-0000-0000-000000000001' and kind = 'payment_void'), '...with the reason');
select is(tt.nots('b2000000-0000-0000-0000-000000000002', 'payment_void') + tt.nots('b3000000-0000-0000-0000-000000000003', 'payment_void'), 0, 'a tenant is not told about the cancellation of an OWNER''s payment');

-- very long names (a block named with 100 letters, a payer name of 100 letters, a 200 letter description) never break money
insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period, description)
  values (tt.cid(21), tt.unit('3'), 'cccccccc-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 50, tt.today() + 5, true, date_trunc('month', tt.today())::date, repeat('ç', 200));
select is(tt.nots('b7000000-0000-0000-0000-000000000007', 'charge'), 1, 'a charge with a 200 letter description still notifies the owner');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.record_manual_payment(tt.rid(4), tt.unit('3'), null, repeat('Ü', 100), 'cash', 1000, tt.today(), null, null)$$, 'a payment with a 100 letter payer name on a unit of a block with a 100 letter name');
reset role;
select is(tt.nots('b7000000-0000-0000-0000-000000000007', 'payment'), 1, '...is recorded and the owner is told');
insert into storage.objects (bucket_id, name, owner_id) values ('dekontlar', tt.fp('3', 1), 'b8000000-0000-0000-0000-000000000008');
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select lives_ok($$select public.submit_transfer_notice(tt.rid(13), tt.unit('3'), 1000, tt.today() - 1, repeat('Ş', 100), repeat('n', 300), tt.fp('3', 1))$$, 'a havale notice from a unit of that block, with a 100 letter name and a 300 letter note');
reset role;
select is(tt.nots('a1000000-0000-0000-0000-000000000001', 'havale_new'), 1, '...and the admin is told');
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select lives_ok($$select public.cancel_transfer_notice(tt.nid(13))$$, '...withdrawn again');
reset role;

-- ---------------------------------------------------------------------------
-- 10. The bell: row security
-- ---------------------------------------------------------------------------
insert into public.notifications (profile_id, kind, title, event_key, visible_at) values ('b1000000-0000-0000-0000-000000000001', 'announcement', 'Gelecek bildirim', 'future-1', now() + interval '1 day');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.notifications where title = 'Gelecek bildirim'), 0, 'a notification that is not due yet is not shown');
select is((select count(*)::integer from public.notifications where profile_id <> 'b1000000-0000-0000-0000-000000000001'), 0, 'a person never reads somebody else''s notifications');
select is((select count(*)::integer from public.notifications where read_at is null), (select tt.unread('b1000000-0000-0000-0000-000000000001', 'payment') + tt.unread('b1000000-0000-0000-0000-000000000001', 'payment_void')), 'the unread count of the bell is the person''s own');
select lives_ok($$update public.notifications set read_at = now() where read_at is null$$, '"mark all read" works for the person''s own');
select is((select count(*)::integer from public.notifications where read_at is null), 0, '...and leaves none unread');
select lives_ok($$delete from public.notifications$$, 'a person can delete their notifications');
select is((select count(*)::integer from public.notifications), 0, '...all their own');
reset role;
select is(tt.nots('b2000000-0000-0000-0000-000000000002'), 2, 'the notifications of the others are still there');
select is(tt.nots('b1000000-0000-0000-0000-000000000001', 'announcement'), 1, '...and the one that is not due yet is not deleted by "delete all"');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.notifications), 0, 'an admin''s bell shows only the admin''s own notifications');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select count(*) from public.notifications$$, '42501', null, 'a visitor reads no notification');
reset role;

select * from finish();
rollback;
