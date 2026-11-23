-- Database tests for 0006_transfers.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (Firma 1 has payment_mode = mock, Firma 2 has not):
--   AA admin of Site X    A2 second admin of Site X    AB admin of Site Y (Firma 2)
--   O  owner of u1        T  tenant of u1 since 90 days   T2 tenant of u1 since 30 days
--   FT former tenant of u1   D deactivated owner of u1    S stranger (no unit)
--   O2 owner of u2        TT tenant of u2 since 30 days   O4 owner of u4     R3 owner of u3 (Firma 2)
-- Lines (amount, due in days):
--   u1: L1 100 (-60)  L2 200 (+10)  L3 300 (+10, NOT for tenants)  L4 400 (voided)  L5 500 (-1)
--   u2: L6 60 (+3)  L7 80 (+3, NOT for tenants)  L8 40 (-5)
--   u3: L11 999 (+3)      u4: L21 100 (-20)  L22 200 (-10)  L23 300 (+5)

begin;
create extension if not exists pgtap with schema extensions;
select plan(221);

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
create function tt.cid(n integer) returns uuid language sql as $$ select ('e1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.rid(n integer) returns uuid language sql as $$ select ('f1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.ids(p_ids integer[]) returns uuid[] language sql as $$ select array_agg(tt.cid(x)) from unnest(p_ids) x $$;
-- Path of a dekont in the bucket: <unit>/<uuid>.pdf   (n makes the file name different)
create function tt.fp(p_unit text, n integer) returns text language sql as $$
  select '40000000-0000-0000-0000-00000000000' || p_unit || '/aaaaaaaa-aaaa-aaaa-aaaa-' || lpad(n::text, 12, '0') || '.pdf'
$$;
create function tt.unit(p_unit text) returns uuid language sql as $$ select ('40000000-0000-0000-0000-00000000000' || p_unit)::uuid $$;
create function tt.submit(p_req integer, p_unit text, p_amount bigint, p_days_ago integer, p_file integer, p_name text default 'Gönderen Kişi', p_note text default null)
returns uuid language sql as $$
  select public.submit_transfer_notice(tt.rid(p_req), tt.unit(p_unit), p_amount, tt.today() - p_days_ago, p_name, p_note, tt.fp(p_unit, p_file));
$$;
-- The id of the notice made with request id n, WITHOUT the caller's row security (so a test can hand a real id to
-- somebody who must not read it).
create function tt.nid(n integer) returns uuid language sql security definer as $$
  select id from public.transfer_notices where request_id = tt.rid(n);
$$;
create function tt.pid(n integer) returns uuid language sql security definer as $$
  select id from public.payments where request_id = tt.rid(n);
$$;
create function tt.pid_of_notice(p_req integer) returns uuid language sql security definer as $$
  select payment_id from public.transfer_notices where request_id = tt.rid(p_req);
$$;
-- Try to rename a dekont as the CURRENT user: returns how many rows the user was allowed to touch
-- (Deleting cannot be tested here: Supabase blocks direct deletes on storage tables for everybody; the catalog test shows there is no delete policy.)
create function tt.try_rename_object(p_name text, p_new text) returns integer language plpgsql as $$
declare n integer;
begin
  update storage.objects set name = p_new where bucket_id = 'dekontlar' and name = p_name;
  get diagnostics n = row_count;
  return n;
end; $$;
create function tt.approve(p_req integer, p_ids integer[] default null) returns uuid language sql as $$
  select public.approve_transfer_notice(tt.nid(p_req), tt.ids(p_ids));
$$;
create function tt.reject(p_req integer, p_reason text) returns void language sql as $$
  select public.reject_transfer_notice(tt.nid(p_req), p_reason);
$$;
-- "number:apply" for every line of a preview, oldest due date first
create function tt.prev(p_unit text, p_payer uuid, p_amount bigint, p_ids integer[] default null) returns text language sql as $$
  select coalesce(string_agg(right(charge_id::text, 2) || ':' || apply_kurus, ' ' order by due_date, right(charge_id::text, 2)), 'none')
    from public.preview_allocation(tt.unit(p_unit), p_payer, p_amount, tt.ids(p_ids));
$$;
create function tt.manual(p_req integer, p_unit text, p_payer uuid, p_name text, p_method text, p_amount bigint, p_days_ago integer,
                          p_ids integer[] default null, p_note text default null)
returns uuid language sql as $$
  select public.record_manual_payment(tt.rid(p_req), tt.unit(p_unit), p_payer, p_name, p_method, p_amount, tt.today() - p_days_ago, tt.ids(p_ids), p_note);
$$;
-- A line as the person sees it: "paid/remaining/status"
create function tt.line(p_n integer) returns text language sql as $$
  select (paid_amount * 100)::bigint || '/' || (remaining * 100)::bigint || '/' || status from public.charge_status where charge_id = tt.cid(p_n);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{"full_name":"Admin A"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{"full_name":"Admin B"}'),
  ('a3000000-0000-0000-0000-000000000003', 'admin-x2@test.local', '{"full_name":"Admin X2"}'),
  ('b1000000-0000-0000-0000-000000000001', 'owner@test.local', '{"full_name":"Mehmet Malik"}'),
  ('b2000000-0000-0000-0000-000000000002', 'tenant@test.local', '{"full_name":"Kemal Kiracı"}'),
  ('b3000000-0000-0000-0000-000000000003', 'tenant2@test.local', '{"full_name":"Yeni Kiracı"}'),
  ('b4000000-0000-0000-0000-000000000004', 'former@test.local', '{"full_name":"Eski Kiracı"}'),
  ('b5000000-0000-0000-0000-000000000005', 'deactivated@test.local', '{"full_name":"Pasif"}'),
  ('b6000000-0000-0000-0000-000000000006', 'owner2@test.local', '{"full_name":"Dilek Diğer"}'),
  ('b7000000-0000-0000-0000-000000000007', 'othercompany@test.local', '{"full_name":"Başka Firma"}'),
  ('b8000000-0000-0000-0000-000000000008', 'tenant-u2@test.local', '{"full_name":"Tuna Kiracı"}'),
  ('b9000000-0000-0000-0000-000000000009', 'owner4@test.local', '{"full_name":"Dört Malik"}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');

insert into public.companies (id, name, settings) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1', '{"payment_mode":"mock"}'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2', '{}');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site X'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site Y');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'A Blok'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'A Blok');
insert into public.units (id, block_id, door_no) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '1'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '1'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '4');
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
  ('40000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000005', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000006', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000008', 'tenant', tt.today() - 30,  null),
  ('40000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000007', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000004', 'b9000000-0000-0000-0000-000000000009', 'owner',  tt.today() - 400, null);

update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000001' where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'aidat';
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000002' where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'demirbas';
update public.charge_types set id = 'cccccccc-0000-0000-0000-00000000000b' where company_id = '10000000-0000-0000-0000-0000000000c2' and code = 'aidat';
insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible) values
  ('d0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001', '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true),
  ('d0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-00000000000b', '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true);
create function pg_temp.line(p_n integer, p_unit text, p_type text, p_amount numeric, p_due integer, p_visible boolean, p_voided boolean)
returns void language sql as $$
  insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, voided_at, void_reason, created_at)
  values (tt.cid(p_n), tt.unit(p_unit), p_type::uuid,
          case when p_unit = '3' then 'd0000000-0000-0000-0000-000000000002' else 'd0000000-0000-0000-0000-000000000001' end::uuid,
          p_amount, tt.today() + p_due, p_visible, case when p_voided then now() end, case when p_voided then 'iptal edildi' end,
          timestamptz '2026-01-01' + p_n * interval '1 minute');
$$;
select pg_temp.line(1,  '1', 'cccccccc-0000-0000-0000-000000000001', 100, -60, true,  false);
select pg_temp.line(2,  '1', 'cccccccc-0000-0000-0000-000000000001', 200,  10, true,  false);
select pg_temp.line(3,  '1', 'cccccccc-0000-0000-0000-000000000002', 300,  10, false, false);
select pg_temp.line(4,  '1', 'cccccccc-0000-0000-0000-000000000001', 400,   5, true,  true);
select pg_temp.line(5,  '1', 'cccccccc-0000-0000-0000-000000000001', 500,  -1, true,  false);
select pg_temp.line(6,  '2', 'cccccccc-0000-0000-0000-000000000001',  60,   3, true,  false);
select pg_temp.line(7,  '2', 'cccccccc-0000-0000-0000-000000000002',  80,   3, false, false);
select pg_temp.line(8,  '2', 'cccccccc-0000-0000-0000-000000000001',  40,  -5, true,  false);
select pg_temp.line(11, '3', 'cccccccc-0000-0000-0000-00000000000b', 999,   3, true,  false);
select pg_temp.line(21, '4', 'cccccccc-0000-0000-0000-000000000001', 100, -20, true,  false);
select pg_temp.line(22, '4', 'cccccccc-0000-0000-0000-000000000001', 200, -10, true,  false);
select pg_temp.line(23, '4', 'cccccccc-0000-0000-0000-000000000001', 300,   5, true,  false);

-- Dekont files (storage objects) that tests will attach. owner_id is who uploaded it.
insert into storage.objects (bucket_id, name, owner_id) values
  ('dekontlar', tt.fp('1', 1), 'b2000000-0000-0000-0000-000000000002'),   -- tenant T, unit 1
  ('dekontlar', tt.fp('1', 2), 'b1000000-0000-0000-0000-000000000001'),   -- owner O, unit 1
  ('dekontlar', tt.fp('1', 3), 'b1000000-0000-0000-0000-000000000001'),
  ('dekontlar', tt.fp('1', 4), 'b2000000-0000-0000-0000-000000000002'),
  ('dekontlar', tt.fp('2', 5), 'b8000000-0000-0000-0000-000000000008'),   -- tenant TT, unit 2
  ('dekontlar', tt.fp('2', 6), 'b8000000-0000-0000-0000-000000000008'),
  ('dekontlar', tt.fp('2', 7), 'b8000000-0000-0000-0000-000000000008'),
  ('dekontlar', tt.fp('2', 8), 'b8000000-0000-0000-0000-000000000008'),
  ('dekontlar', tt.fp('2', 9), 'b6000000-0000-0000-0000-000000000006'),
  ('dekontlar', tt.fp('2', 50), 'b2000000-0000-0000-0000-000000000002');   -- tenant T, but in the folder of unit 2 (T lives in unit 1)
-- Files for the "too many pending" test (owner O, unit 1)
insert into storage.objects (bucket_id, name, owner_id)
select 'dekontlar', tt.fp('1', 100 + g), 'b1000000-0000-0000-0000-000000000001' from generate_series(1, 6) g;

-- ---------------------------------------------------------------------------
-- 1. Structure and permissions
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.transfer_notices'::regclass), 'transfer_notices has row security');
select ok(not has_table_privilege('authenticated', 'public.transfer_notices', 'insert') and not has_table_privilege('authenticated', 'public.transfer_notices', 'update')
      and not has_table_privilege('authenticated', 'public.transfer_notices', 'delete') and not has_table_privilege('anon', 'public.transfer_notices', 'select'),
  'nobody writes notices directly and a visitor reads none');
select ok(has_column_privilege('authenticated', 'public.transfer_notices', 'status', 'select')
      and not has_column_privilege('authenticated', 'public.transfer_notices', 'reviewed_by', 'select'),
  'who reviewed a notice is not readable (the audit log of slice 10 will hold it)');
select is((select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'dekontlar'),
  '(f,5242880,"{application/pdf,image/jpeg,image/png}")', 'the dekont bucket is private, 5 MB, PDF / JPG / PNG only');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'dekontlar:%'), 2,
  'two storage policies: upload (insert) and read (select); no update or delete policy');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'dekontlar:%' and cmd in ('UPDATE', 'DELETE', 'ALL')),
  '...so a resident can never change or delete a file');
select ok(not has_function_privilege('authenticated', 'private.allocate_for_admin(uuid, uuid, bigint, uuid[], boolean)', 'execute')
      and not has_function_privilege('authenticated', 'private.issue_payment(uuid, uuid, uuid, text, text, bigint, date, uuid[], text, text, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.profile_sees_charge(uuid, uuid, boolean, date)', 'execute')
      and not has_function_privilege('authenticated', 'private.is_current_resident(uuid, uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.valid_tr_iban(text)', 'execute')
      and has_function_privilege('authenticated', 'private.resident_sees_charge(uuid, boolean, date)', 'execute'),
  'the internal functions cannot be called from a browser; the policy helper still can');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                       and p.proname in ('submit_transfer_notice', 'cancel_transfer_notice', 'preview_allocation', 'approve_transfer_notice', 'reject_transfer_notice',
                                         'record_manual_payment', 'get_bank_accounts', 'save_bank_accounts', 'get_receipt') and has_function_privilege('anon', p.oid, 'execute')),
  'a visitor can execute none of the new functions');
select ok(not has_column_privilege('authenticated', 'public.companies', 'settings', 'update') and has_column_privilege('authenticated', 'public.companies', 'name', 'update'),
  'the browser cannot write companies.settings any more (it holds the payment safety switch); other company columns are unchanged');
select ok(private.valid_tr_iban('TR330006100519786457841326') and private.valid_tr_iban('tr33 0006 1005 1978 6457 8413 26')
      and private.valid_tr_iban('TR820006200000012345678901') and private.valid_tr_iban('TR850001000000000012345678'),
  'valid Turkish IBANs pass (also lower case and with spaces)');
select ok(not private.valid_tr_iban('TR340006100519786457841326') and not private.valid_tr_iban('TR33000610051978645784132')
      and not private.valid_tr_iban('DE89370400440532013000') and not private.valid_tr_iban('') and not private.valid_tr_iban(null)
      and not private.valid_tr_iban('TR33000610051978645784132A'),
  'a wrong check digit, a wrong length, another country, empty, null and letters are all refused');

-- ---------------------------------------------------------------------------
-- 2. One visibility rule: profile_sees_charge, and resident_sees_charge asks it for the logged-in user
-- ---------------------------------------------------------------------------
select ok(private.profile_sees_charge('b1000000-0000-0000-0000-000000000001', tt.unit('1'), false, tt.today() + 10), 'an owner sees an owner-only line');
select ok(not private.profile_sees_charge('b2000000-0000-0000-0000-000000000002', tt.unit('1'), false, tt.today() + 10), 'a tenant does not see an owner-only line');
select ok(private.profile_sees_charge('b2000000-0000-0000-0000-000000000002', tt.unit('1'), true, tt.today() - 60), 'a tenant sees a tenant line due after the move-in date');
select ok(not private.profile_sees_charge('b3000000-0000-0000-0000-000000000003', tt.unit('1'), true, tt.today() - 60), 'a newer tenant does not see a line due before the move-in date');
select ok(not private.profile_sees_charge('b4000000-0000-0000-0000-000000000004', tt.unit('1'), true, tt.today()), 'a former tenant sees nothing');
select ok(not private.profile_sees_charge('b5000000-0000-0000-0000-000000000005', tt.unit('1'), true, tt.today()), 'a deactivated owner sees nothing');
select ok(not private.profile_sees_charge('c1000000-0000-0000-0000-000000000001', tt.unit('1'), true, tt.today()) and not private.profile_sees_charge(null, tt.unit('1'), true, tt.today()),
  'a stranger and a null person see nothing');

select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select string_agg(right(charge_id::text, 2), ',' order by charge_id) from public.charge_status where unit_id = tt.unit('1')), '01,02,05',
  'the wrapper still decides row security: the tenant reads lines 1, 2 and 5 (not the owner-only 3)');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select string_agg(right(charge_id::text, 2), ',' order by charge_id) from public.charge_status where unit_id = tt.unit('1')), '01,02,03,05',
  '...and the owner reads 1, 2, 3 and 5 (not the cancelled 4)');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Preview: which lines would an amount close?
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select tt.prev('1', null, 100)$$, '42501', null, 'a visitor cannot preview');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.prev('1', null, 100)$$, '42501', 'not allowed', 'a resident cannot preview');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.prev('1', null, 100)$$, '42501', 'not allowed', 'the admin of ANOTHER site cannot preview this unit');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(tt.prev('1', null, 25000), '01:10000 05:15000 02:0 03:0', 'oldest first: 100 TL closes line 1, 150 TL goes to line 5 (partly paid)');
select is((select max(excess_kurus) from public.preview_allocation(tt.unit('1'), null, 25000, null)), 0::bigint, '...nothing is left over');
select is(tt.prev('1', 'b1000000-0000-0000-0000-000000000001', 25000), '01:10000 05:15000 02:0 03:0', 'the owner as payer sees every line, the same result');
select is(tt.prev('1', 'b2000000-0000-0000-0000-000000000002', 100000), '01:10000 05:50000 02:20000', 'a TENANT payer: the owner-only line 3 is not in the list at all');
select is((select max(excess_kurus) from public.preview_allocation(tt.unit('1'), 'b2000000-0000-0000-0000-000000000002', 100000, null)), 20000::bigint,
  '...so 1.000 TL leaves 200 TL over (100 + 500 + 200 are open for the tenant)');
select is(tt.prev('1', 'b3000000-0000-0000-0000-000000000003', 100000), '05:50000 02:20000', 'a newer tenant: the line due before the move-in date is not for them either');
select is(tt.prev('1', null, 25000, array[2, 1]), '01:10000 02:15000', 'picked lines [2, 1]: the money still goes oldest first');
select is(tt.prev('1', null, 30000, array[3]), '03:30000', 'the admin may pick the owner-only line (no resident payer)');
select throws_ok($$select tt.prev('1', 'b2000000-0000-0000-0000-000000000002', 100, array[3])$$, 'P0001', 'charge_not_payable', 'a tenant payer cannot be given a hidden line');
select throws_ok($$select tt.prev('1', null, 100, array[4])$$, 'P0001', 'charge_not_payable', 'a cancelled line cannot be picked');
select throws_ok($$select tt.prev('1', null, 100, array[6])$$, 'P0001', 'charge_not_payable', 'a line of another unit cannot be picked');
select throws_ok($$select tt.prev('1', null, 100, array[1, 1])$$, 'P0001', 'charges_invalid', 'the same line twice is refused');
select throws_ok($$select * from public.preview_allocation(tt.unit('1'), null, 100, array[]::uuid[])$$, 'P0001', 'charges_invalid', 'an empty pick is refused');
select throws_ok($$select * from public.preview_allocation(tt.unit('1'), null, 100, (select array_agg(('e1000000-0000-0000-0001-' || lpad(x::text, 12, '0'))::uuid) from generate_series(1, 101) x))$$,
  'P0001', 'charges_invalid', 'more than 100 picked lines are refused');
select throws_ok($$select tt.prev('1', null, 0)$$, 'P0001', 'amount_invalid', 'amount 0 is refused');
select throws_ok($$select tt.prev('1', null, 100000001)$$, 'P0001', 'amount_invalid', 'more than 1.000.000 TL is refused');
select throws_ok($$select tt.prev('1', null, null)$$, 'P0001', 'amount_invalid', 'no amount is refused');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Storage policies (real inserts and reads as the user)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000001.pdf')$$,
  'a tenant can upload into the folder of the unit they live in');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000002/bbbbbbbb-bbbb-bbbb-bbbb-000000000002.pdf')$$,
  '42501', null, '...but not into another unit''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000003.exe')$$,
  '42501', null, 'a wrong file type in the name is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', 'not-a-uuid/file.pdf')$$,
  '42501', null, 'a strange folder name is refused cleanly (no cast error)');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/sub/bbbbbbbb-bbbb-bbbb-bbbb-000000000004.pdf')$$,
  '42501', null, 'a deeper path is refused');
reset role;
select pg_temp.act_as('b4000000-0000-0000-0000-000000000004');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000005.pdf')$$,
  '42501', null, 'a former tenant cannot upload');
reset role;
select pg_temp.act_as('b5000000-0000-0000-0000-000000000005');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000006.pdf')$$,
  '42501', null, 'a deactivated owner cannot upload');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000007.pdf')$$,
  '42501', null, 'a stranger cannot upload');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000008.pdf')$$,
  '42501', null, 'an admin who does not live there cannot upload either');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$insert into storage.objects (bucket_id, name) values ('dekontlar', '40000000-0000-0000-0000-000000000001/bbbbbbbb-bbbb-bbbb-bbbb-000000000009.pdf')$$,
  '42501', null, 'a visitor cannot upload');
reset role;

-- Reading: the uploader (tenant T uploaded fp 1 and fp 4 and the file just inserted), the admins of the site
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar' and name = tt.fp('1', 1)), 1, 'the uploader reads their own file');
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar' and name = tt.fp('1', 2)), 0, '...but not a file of the owner of the same unit');
select is(tt.try_rename_object(tt.fp('1', 1), tt.fp('1', 99)), 0, 'a resident cannot rename or move a file');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar' and name = tt.fp('1', 1)), 1, '...the file is still there (checked as postgres)');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar' and name in (tt.fp('1', 1), tt.fp('1', 2), tt.fp('2', 5))), 3, 'the admin of the site reads files of its units');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar'), 0, 'the admin of another site reads no dekont');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar'), 0, 'a stranger reads no dekont');
reset role;
select pg_temp.act_as_visitor();
select is((select count(*)::int from storage.objects where bucket_id = 'dekontlar'), 0, 'a visitor reads no dekont');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Submitting a notice
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select tt.submit(1, '1', 15000, 1, 1)$$, '42501', null, 'a visitor cannot submit');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.submit(1, '1', 15000, 1, 1)$$, '42501', 'not allowed', 'a stranger cannot submit for a unit');
reset role;
select pg_temp.act_as('b4000000-0000-0000-0000-000000000004');
select throws_ok($$select tt.submit(1, '1', 15000, 1, 1)$$, '42501', 'not allowed', 'a former tenant cannot submit');
reset role;
select pg_temp.act_as('b5000000-0000-0000-0000-000000000005');
select throws_ok($$select tt.submit(1, '1', 15000, 1, 1)$$, '42501', 'not allowed', 'a deactivated owner cannot submit');
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select throws_ok($$select tt.submit(1, '1', 15000, 1, 1)$$, '42501', 'not allowed', 'the owner of ANOTHER unit cannot submit for unit 1');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.submit(1, '1', 15000, 1, 1)$$, '42501', 'not allowed', 'an admin who does not live in the unit cannot submit');
reset role;

select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.submit_transfer_notice(tt.rid(9), tt.unit('1'), 15000, tt.today() - 1, 'Kemal Kiracı', null, tt.fp('2', 50))$$, 'P0001', 'file_invalid',
  'a file that the person uploaded themselves, but into ANOTHER unit''s folder, cannot be attached to this unit');
select lives_ok($$select tt.submit(1, '1', 15000, 1, 1, 'Kemal Kiracı', 'Ocak aidatı')$$, 'a tenant submits a notice (150,00 TL, sent yesterday)');
select is((select status || '/' || (amount * 100)::bigint || '/' || sender_name || '/' || note from public.transfer_notices where id = tt.nid(1)), 'pending/15000/Kemal Kiracı/Ocak aidatı',
  '...it waits for the admin, with the amount in kuruş exact');
select is((select profile_id from public.transfer_notices where id = tt.nid(1)), 'b2000000-0000-0000-0000-000000000002'::uuid, '...and remembers who sent it');
select is(tt.submit(1, '1', 15000, 1, 1, 'Kemal Kiracı', 'Ocak aidatı'), tt.nid(1), 'the same request id again returns the same notice (double click)');
select is((select count(*)::int from public.transfer_notices where id = tt.nid(1)), 1, '...and makes no second row');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.submit(1, '1', 15000, 1, 2)$$, 'P0001', 'request_id_used', 'somebody else cannot use that request id');
select throws_ok($$select tt.submit(2, '1', 15000, 1, 1)$$, 'P0001', 'file_invalid', 'a file uploaded by somebody else cannot be attached');
select throws_ok($$select tt.submit(2, '1', 15000, 1, 55)$$, 'P0001', 'file_invalid', 'a file that was never uploaded cannot be attached');
select throws_ok($$select public.submit_transfer_notice(tt.rid(2), tt.unit('1'), 15000, tt.today() - 1, 'Mehmet', null, tt.fp('2', 9))$$, 'P0001', 'file_invalid',
  'a file from another unit''s folder cannot be attached');
select throws_ok($$select public.submit_transfer_notice(tt.rid(2), tt.unit('1'), 15000, tt.today() - 1, 'Mehmet', null, '../x.pdf')$$, 'P0001', 'file_invalid', 'a strange path is refused');
select throws_ok($$select public.submit_transfer_notice(tt.rid(2), tt.unit('1'), 15000, tt.today() - 1, 'Mehmet', null, null)$$, 'P0001', 'file_invalid', 'no file is refused (the dekont is required)');
select throws_ok($$select tt.submit(2, '1', 99, 1, 2)$$, 'P0001', 'amount_invalid', 'less than 1 TL is refused');
select throws_ok($$select tt.submit(2, '1', 100000001, 1, 2)$$, 'P0001', 'amount_invalid', 'more than 1.000.000 TL is refused');
select throws_ok($$select tt.submit(2, '1', null, 1, 2)$$, 'P0001', 'amount_invalid', 'no amount is refused');
select throws_ok($$select tt.submit(2, '1', 15000, -1, 2)$$, 'P0001', 'date_invalid', 'a date in the future is refused');
select throws_ok($$select tt.submit(2, '1', 15000, 91, 2)$$, 'P0001', 'date_invalid', 'a date older than 90 days is refused');
select throws_ok($$select public.submit_transfer_notice(tt.rid(2), tt.unit('1'), 15000, null, 'Mehmet', null, tt.fp('1', 2))$$, 'P0001', 'date_invalid', 'no date is refused');
select throws_ok($$select tt.submit(2, '1', 15000, 1, 2, 'M')$$, 'P0001', 'sender_invalid', 'a sender name of one letter is refused');
select throws_ok($$select tt.submit(2, '1', 15000, 1, 2, 'Mehmet', repeat('x', 301))$$, 'P0001', 'note_invalid', 'a note of 301 characters is refused');
select lives_ok($$select tt.submit(2, '1', 15000, 90, 2, 'Mehmet Malik')$$, 'a slip dated exactly 90 days ago is fine (notice 2, owner)');
select throws_ok($$select tt.submit(3, '1', 15000, 1, 2, 'Mehmet Malik')$$, 'P0001', 'file_used', 'one file cannot belong to two notices');
reset role;

-- too many pending: the limit is per UNIT. Unit 1 has 2 waiting notices (1 by the tenant, 2 by the owner); 3 more are fine, the 6th is refused
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select lives_ok($$select tt.submit(20 + g, '1', 10000, 1, 100 + g) from generate_series(1, 3) g$$, 'three more notices (5 waiting for the unit)');
select throws_ok($$select tt.submit(30, '1', 10000, 1, 105)$$, 'P0001', 'too_many_pending', 'a sixth waiting notice for one unit is refused');
reset role;

-- Who reads notices
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.transfer_notices), 1, 'the tenant reads only the notice they sent');
select throws_ok($$select reviewed_by from public.transfer_notices$$, '42501', null, '...and cannot read who reviewed it');
select throws_ok($$update public.transfer_notices set amount = 1$$, '42501', null, '...cannot change a notice');
select throws_ok($$delete from public.transfer_notices$$, '42501', null, '...cannot delete a notice');
select throws_ok($$insert into public.transfer_notices (unit_id, amount, sent_on, sender_name, file_path, request_id) values (tt.unit('1'), 1000, tt.today(), 'Xx', 'p', tt.rid(90))$$, '42501', null,
  '...and cannot insert one directly');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.transfer_notices where id = tt.nid(1)), 0, 'the owner of the unit does not read a notice sent by the tenant');
select is((select count(*)::int from public.transfer_notices), 4, '...only their own four');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.transfer_notices), 5, 'the admin reads all five notices of the site');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.transfer_notices), 0, 'the admin of another site reads none');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.transfer_notices), 0, 'a stranger reads none');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Cancel
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.cancel_transfer_notice(tt.nid(1))$$, '42501', 'not allowed', 'the owner cannot cancel the tenant''s notice');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.cancel_transfer_notice(tt.nid(1))$$, '42501', 'not allowed', 'an admin cannot cancel it either (admins reject, with a reason)');
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select lives_ok($$select public.cancel_transfer_notice(tt.nid(1))$$, 'the sender cancels while it waits');
select throws_ok($$select public.cancel_transfer_notice(tt.nid(1))$$, 'P0001', 'not_pending', '...a second cancel is refused');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.approve(1)$$, 'P0001', 'not_pending', 'a cancelled notice cannot be approved');
select throws_ok($$select tt.reject(1, 'Neden olsun')$$, 'P0001', 'not_pending', '...or rejected');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Approve, reject (unit 2: owner O2, tenant TT; the owner-only line L7)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select lives_ok($$select tt.submit(41, '2', 10001, 1, 5, 'Tuna Kiracı')$$, 'tenant TT sends 100,01 TL (notice 41)');
select lives_ok($$select tt.submit(42, '2', 10000, 3, 6, 'Tuna Kiracı')$$, '...and 100,00 TL (notice 42)');
select lives_ok($$select tt.submit(43, '2', 6000, 3, 7, 'Tuna Kiracı')$$, '...and 60,00 TL (notice 43)');
select lives_ok($$select tt.submit(44, '2', 5000, 3, 8, 'Tuna Kiracı')$$, '...and 50,00 TL (notice 44)');
reset role;

select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select throws_ok($$select tt.approve(42)$$, '42501', 'not allowed', 'a resident (even the owner) cannot approve');
select throws_ok($$select tt.reject(42, 'Neden olsun')$$, '42501', 'not allowed', '...or reject');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.approve(42)$$, '42501', 'not allowed', 'the admin of another site cannot approve');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select tt.approve(42)$$, '42501', null, 'a visitor cannot approve');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.approve(41)$$, 'P0001', 'amount_exceeds_debt', '100,01 TL cannot be approved: the tenant can see only 100,00 TL of debt (line 7 is owner-only)');
select is((select status from public.transfer_notices where id = tt.nid(41)), 'pending', '...the notice is still waiting (nothing was half done)');
select is((select count(*)::int from public.payments where unit_id = tt.unit('2')), 0, '...and no payment exists');
select throws_ok($$select tt.reject(41, 'ab')$$, 'P0001', 'reason_invalid', 'a reject reason of two letters is refused');
select throws_ok($$select tt.reject(41, null)$$, 'P0001', 'reason_invalid', '...and no reason');
select throws_ok($$select tt.reject(41, repeat('x', 301))$$, 'P0001', 'reason_invalid', '...and a very long one');
select lives_ok($$select tt.reject(41, 'Tutar borçtan fazla')$$, 'the admin rejects it with a reason');
select throws_ok($$select tt.reject(41, 'Tekrar')$$, 'P0001', 'not_pending', 'a rejected notice cannot be rejected again');
select throws_ok($$select tt.approve(41)$$, 'P0001', 'not_pending', '...or approved');
reset role;
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select is((select status || '/' || reject_reason from public.transfer_notices where id = tt.nid(41)), 'rejected/Tutar borçtan fazla', 'the sender reads the status and the reason');
select throws_ok($$select public.cancel_transfer_notice(tt.nid(41))$$, 'P0001', 'not_pending', '...and cannot cancel a rejected notice');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.approve(42, array[7])$$, 'P0001', 'charge_not_payable', 'picking the owner-only line 7 for a tenant''s notice is refused');
select throws_ok($$select tt.approve(42, array[6])$$, 'P0001', 'amount_exceeds_debt', 'picking only line 6 (60 TL) cannot take 100 TL');
select lives_ok($$select tt.approve(42)$$, 'approve (oldest first) works');
select is((select method || '/' || provider || '/' || status || '/' || (amount * 100)::bigint || '/' || fee || '/' || installments from public.payments where id = (select payment_id from public.transfer_notices where id = tt.nid(42))),
  'havale/manual/approved/10000/0.00/1', 'the payment: havale, manual, approved, exact amount, no fee');
select is((select payer_id from public.payments where id = (select payment_id from public.transfer_notices where id = tt.nid(42))), 'b8000000-0000-0000-0000-000000000008'::uuid, '...the payer is the person who sent the notice');
select is((select payer_name || '/' || unit_label || '/' || created_by from public.payments where id = (select payment_id from public.transfer_notices where id = tt.nid(42))),
  'Tuna Kiracı/A Blok · 2/a1000000-0000-0000-0000-000000000001', '...with the name and unit as they were, and who entered it');
select ok((select receipt_no ~ ('^MKB-' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY') || '-[0-9]{6}$') from public.payments where id = (select payment_id from public.transfer_notices where id = tt.nid(42))),
  '...a receipt number of the current year');
select is((select (paid_at at time zone 'Europe/Istanbul')::date from public.payments where id = (select payment_id from public.transfer_notices where id = tt.nid(42))), tt.today() - 3,
  '...the money date is the date on the bank slip');
select is((select provider_ref from public.payments where id = (select payment_id from public.transfer_notices where id = tt.nid(42))), 'notice:' || tt.nid(42)::text, '...and it points back to the notice');
select is((select string_agg(right(charge_id::text, 2) || ':' || (amount * 100)::bigint, ' ' order by charge_id) from public.payment_allocations
            where payment_id = (select payment_id from public.transfer_notices where id = tt.nid(42))), '06:6000 08:4000',
  '...it closed the tenant''s two lines (8 and 6) and left the owner-only line 7 alone');
select is(tt.line(8) || ' ' || tt.line(6) || ' ' || tt.line(7), '4000/0/paid 6000/0/paid 0/8000/open', 'the lines now read paid, paid and still open');
select is((select status || '/' || (payment_id is not null) || '/' || (reviewed_at is not null) from public.transfer_notices where id = tt.nid(42)), 'approved/true/true', 'the notice is approved with its payment and time');
select is(tt.approve(42), (select payment_id from public.transfer_notices where id = tt.nid(42)), 'a second approve (double click) returns the same payment');
select is((select count(*)::int from public.payments where unit_id = tt.unit('2')), 1, '...and made no second payment');
select throws_ok($$select tt.reject(42, 'Geç kaldı')$$, 'P0001', 'not_pending', 'an approved notice cannot be rejected');
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select throws_ok($$select tt.approve(42)$$, '42501', 'not allowed', 'a resident cannot learn the payment id of an approved notice by approving it "again"');
reset role;
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select throws_ok($$select tt.approve(42)$$, '42501', 'not allowed', 'not even the sender of the notice can');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.approve(42)$$, '42501', 'not allowed', 'and the admin of another site cannot either');
reset role;
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select is((select jsonb_array_length(lines) from public.get_receipt(tt.pid_of_notice(42))), 2, 'the tenant''s receipt lists two lines...');
select is((select count(*)::int from public.get_receipt(tt.pid_of_notice(42)) r, jsonb_array_elements(r.lines) l where l ->> 'amount_kurus' = '8000'), 0,
  '...and NOT the owner-only line of 80 TL');
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is((select receipt_no from public.get_receipt(tt.pid_of_notice(42))), (select receipt_no from public.payments where id = tt.pid_of_notice(42)),
  'the OWNER of the unit can read the tenant''s receipt');
reset role;

-- ---------------------------------------------------------------------------
-- 8. The owner's notice on unit 1: a PARTLY paid line, the card checkout after it, and a void
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select tt.approve(2)$$, 'the admin approves the owner''s 150 TL notice (oldest first)');
select is(tt.line(1) || ' ' || tt.line(5), '10000/0/paid 5000/45000/partial', 'line 1 is paid; line 5 (500 TL) is PARTLY paid: 50 TL paid, 450 TL left');
select is((select (paid_at at time zone 'Europe/Istanbul')::date from public.payments where id = tt.pid_of_notice(2)), tt.today() - 90, 'the money date is the date on the slip (90 days ago)');
select ok((select receipt_no like 'MKB-' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY') || '-%' from public.payments where id = tt.pid_of_notice(2)),
  'the receipt number takes its year from the day it was issued, not from the money date');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is(tt.line(5), '5000/45000/partial', 'the owner sees the same: a partly paid line');
select is((select string_agg(amount_kurus::text, ',') from public.quote_payment(tt.ids(array[5]), 1)), '45000', 'the card checkout asks for what is LEFT of the line: 450 TL');
select lives_ok($$select public.pay_charges_mock(tt.rid(60), tt.ids(array[5]), 1, 45000)$$, '...and pays it');
select is(tt.line(5), '50000/0/paid', 'line 5 is now fully paid (50 TL by havale + 450 TL by card)');
select is((select string_agg(l ->> 'amount_kurus', ',') from public.get_receipt(tt.pid(60)) r, jsonb_array_elements(r.lines) l), '45000',
  'the card receipt shows the 450 TL (45000 kuruş) that this payment closed, not the whole 500 TL line');
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.get_receipt(tt.pid_of_notice(2))$$, '42501', 'not allowed', 'a tenant cannot read the owner''s receipt (a real id, refused by the access check)');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.void_payment(tt.pid_of_notice(2), 'Dekont yanlış çıktı')$$, 'the admin cancels the havale payment');
select is(tt.line(1) || ' ' || tt.line(5), '0/10000/overdue 45000/5000/partial', 'the lines are open again; only the card part still counts on line 5');
select is((select n.status || '/' || p.status from public.transfer_notices n join public.payments p on p.id = n.payment_id where n.id = tt.nid(2)), 'approved/voided',
  'the notice still says approved, its payment says voided (the screens show both)');
reset role;
select throws_ok($$delete from public.payments where id = tt.pid_of_notice(2)$$, '23503', null, 'a payment that came from a notice cannot be deleted');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select p.status from public.transfer_notices n left join public.payments p on p.id = n.payment_id where n.id = tt.nid(2)), 'voided',
  'the sender reads the voided state of their own payment');
reset role;

-- ---------------------------------------------------------------------------
-- 9. Manual payments (unit 4: owner O4; L21 100, L22 200, L23 300). Unit 3 belongs to Firma 2, which has no mock switch.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b9000000-0000-0000-0000-000000000009');
select throws_ok($$select tt.manual(70, '4', null, 'Ali Veli', 'cash', 15000, 0)$$, '42501', 'not allowed', 'a resident cannot record a payment');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.manual(70, '4', null, 'Ali Veli', 'cash', 15000, 0)$$, '42501', 'not allowed', 'the admin of another site cannot');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select tt.manual(70, '4', null, 'Ali Veli', 'cash', 15000, 0)$$, '42501', null, 'a visitor cannot');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'bitcoin', 15000, 0)$$, 'P0001', 'method_invalid', 'an unknown method is refused');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'cash', 15000, -1)$$, 'P0001', 'date_invalid', 'a date in the future is refused');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'cash', 15000, 366)$$, 'P0001', 'date_invalid', '...and one older than a year');
select throws_ok($$select tt.manual(71, '4', null, null, 'cash', 15000, 0)$$, 'P0001', 'payer_name_invalid', 'without a resident payer the name is required');
select throws_ok($$select tt.manual(71, '4', null, 'A', 'cash', 15000, 0)$$, 'P0001', 'payer_name_invalid', '...and at least two letters');
select throws_ok($$select tt.manual(71, '4', 'c1000000-0000-0000-0000-000000000001', 'Ali Veli', 'cash', 15000, 0)$$, 'P0001', 'payer_invalid', 'a payer who does not live in the unit is refused');
select throws_ok($$select tt.manual(71, '1', 'b4000000-0000-0000-0000-000000000004', 'Ali Veli', 'cash', 100, 0)$$, 'P0001', 'payer_invalid', '...also a tenant of THIS unit who has moved out');
select throws_ok($$select tt.manual(71, '1', 'b5000000-0000-0000-0000-000000000005', 'Ali Veli', 'cash', 100, 0)$$, 'P0001', 'payer_invalid', '...and a deactivated owner');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'cash', 0, 0)$$, 'P0001', 'amount_invalid', 'amount 0 is refused');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'cash', 15000, 0, null, repeat('x', 301))$$, 'P0001', 'note_invalid', 'a note of 301 characters is refused');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'cash', 60001, 0)$$, 'P0001', 'amount_exceeds_debt', '600,01 TL is more than the 600,00 TL that is open: refused (no credit yet)');
select throws_ok($$select tt.manual(71, '4', null, 'Ali Veli', 'cash', 100, 0, array[6])$$, 'P0001', 'charge_not_payable', 'a line of another unit cannot be picked');
select is((select count(*)::int from public.payments where unit_id = tt.unit('4')), 0, 'none of the refused entries wrote anything');

select lives_ok($$select tt.manual(72, '4', null, 'Ali Veli', 'cash', 15000, 0)$$, 'cash 150 TL, payer typed by hand, oldest first');
select is(tt.line(21) || ' ' || tt.line(22) || ' ' || tt.line(23), '10000/0/paid 5000/15000/partial 0/30000/open', '...line 21 paid, line 22 half paid, line 23 untouched');
select is((select method || '/' || provider || '/' || status || '/' || coalesce(payer_id::text, 'none') || '/' || payer_name || '/' || created_by || '/' || (amount * 100)::bigint
             from public.payments where request_id = tt.rid(72)),
  'cash/manual/approved/none/Ali Veli/a1000000-0000-0000-0000-000000000001/15000', 'the payment row says who typed it and who paid');
select is((select (paid_at at time zone 'Europe/Istanbul')::date from public.payments where request_id = tt.rid(72)), tt.today(), 'paid today: the real date');
select is(tt.manual(72, '4', null, 'Ali Veli', 'cash', 15000, 0), tt.pid(72), 'the same request id returns the same payment');
select is((select count(*)::int from public.payments where unit_id = tt.unit('4')), 1, '...and no second payment');
reset role;
select pg_temp.act_as('a3000000-0000-0000-0000-000000000003');
select throws_ok($$select tt.manual(72, '4', null, 'Ali Veli', 'cash', 15000, 0)$$, 'P0001', 'request_id_used', 'a different admin cannot reuse that request id');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.manual(73, '4', null, 'Ali Veli', 'cash', 15001, 0, array[22])$$, 'P0001', 'amount_exceeds_debt', 'the amount cannot be more than the picked line has left (150 TL)');
select lives_ok($$select tt.manual(74, '4', 'b9000000-0000-0000-0000-000000000009', null, 'pos', 5000, 10, array[22], 'POS fişi 123')$$,
  'office card (POS) 50 TL by the owner, 10 days ago, picked line 22, with a note');
select is(tt.line(22), '10000/10000/partial', '...line 22 now has 100 TL paid and 100 TL left');
select is((select (paid_at at time zone 'Europe/Istanbul')::date || '/' || to_char(paid_at at time zone 'Europe/Istanbul', 'HH24:MI') from public.payments where request_id = tt.rid(74)),
  (tt.today() - 10)::text || '/12:00', 'a back-dated entry counts at noon of that day');
select is((select payer_name || '/' || note from public.payments where request_id = tt.rid(74)), 'Dört Malik/POS fişi 123', 'the payer name comes from the profile; the note is kept');
select ok((select right(a.receipt_no, 6)::int > right(b.receipt_no, 6)::int from public.payments a, public.payments b where a.request_id = tt.rid(74) and b.request_id = tt.rid(72)),
  'receipt numbers keep growing, even for a back-dated entry');
reset role;
select pg_temp.act_as('b9000000-0000-0000-0000-000000000009');
select is((select note from public.get_receipt(tt.pid(74))), 'POS fişi 123', 'the owner reads the note on the receipt');
select is((select method from public.get_receipt(tt.pid(74))), 'pos', '...with the method');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select tt.manual(75, '4', null, 'Banka Havalesi', 'havale', 30000, 0, array[23])$$, 'a bank transfer of 300 TL entered by hand, for line 23');
select lives_ok($$select tt.manual(76, '4', null, 'Ali Veli', 'cash', 10000, 0)$$, 'the last 100 TL in cash');
select is(tt.line(21) || ' ' || tt.line(22) || ' ' || tt.line(23), '10000/0/paid 20000/0/paid 30000/0/paid', 'everything on unit 4 is paid');
select throws_ok($$select tt.manual(77, '4', null, 'Ali Veli', 'cash', 100, 0)$$, 'P0001', 'no_open_lines', 'another payment on a fully paid unit is refused');
select is((select (balance * 100)::bigint from public.unit_balances where unit_id = tt.unit('4')), 0::bigint, 'the unit balance is 0');
reset role;

-- Firma 2 has no payment_mode: offline money still works, the fake card checkout still does not
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select lives_ok($$select tt.manual(80, '3', null, 'Nakit Ödeyen', 'cash', 50000, 0)$$, 'cash works in a company without the mock switch');
select is(tt.line(11), '50000/49900/partial', '...and the line is partly paid');
reset role;
select pg_temp.act_as('b7000000-0000-0000-0000-000000000007');
select throws_ok($$select * from public.quote_payment(tt.ids(array[11]), 1)$$, 'P0001', 'payment_disabled', 'but the resident of that company still cannot use the fake card checkout');
reset role;

-- ---------------------------------------------------------------------------
-- 10. Bank accounts and the settings column
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select * from public.get_bank_accounts()$$, '42501', null, 'a visitor cannot read bank accounts');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.get_bank_accounts()), 0, 'no account saved yet');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[{"bank":"Banka","holder":"Site Yönetimi","iban":"TR340006100519786457841326"}]'::jsonb)$$,
  'P0001', 'iban_invalid', 'an IBAN with a wrong check digit is refused');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '{"bank":"Banka"}'::jsonb)$$, 'P0001', 'accounts_invalid', 'not a list: refused');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[{"bank":"Banka","iban":"TR330006100519786457841326"}]'::jsonb)$$, 'P0001', 'accounts_invalid', 'a missing holder is refused');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[{"bank":"B","holder":"Site Yönetimi","iban":"TR330006100519786457841326"}]'::jsonb)$$, 'P0001', 'accounts_invalid', 'a bank name of one letter is refused');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[{"bank":"Banka","holder":"Site Yönetimi","iban":330006100519786457841326}]'::jsonb)$$, 'P0001', 'accounts_invalid', 'an IBAN that is not text is refused');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1',
  '[{"bank":"Banka","holder":"Site Yönetimi","iban":"TR330006100519786457841326"},{"bank":"Banka 2","holder":"Site Yönetimi","iban":"tr33 0006 1005 1978 6457 8413 26"}]'::jsonb)$$,
  'P0001', 'accounts_invalid', 'the same IBAN twice is refused');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', (select jsonb_agg(jsonb_build_object('bank', 'Banka ' || g, 'holder', 'Site Yönetimi', 'iban', 'TR330006100519786457841326')) from generate_series(1, 6) g))$$,
  'P0001', 'accounts_invalid', 'more than five accounts are refused');
select lives_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1',
  '[{"bank":" Örnek Banka ","holder":"Site Yönetimi","iban":"tr33 0006 1005 1978 6457 8413 26"},{"bank":"İkinci Banka","holder":"Site Yönetimi","iban":"TR820006200000012345678901"}]'::jsonb)$$,
  'the admin saves two accounts');
select is((select string_agg(bank || '|' || iban, ' ; ') from public.get_bank_accounts()), 'Örnek Banka|TR330006100519786457841326 ; İkinci Banka|TR820006200000012345678901',
  '...stored without spaces and in capitals, in the order given');
reset role;
select is((select settings ->> 'payment_mode' from public.companies where id = '10000000-0000-0000-0000-0000000000c1'), 'mock', 'saving accounts did not touch the other settings (the safety switch)');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.get_bank_accounts()), 2, 'a resident of the company reads the two accounts');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[]'::jsonb)$$, '42501', 'not allowed', '...but cannot save');
reset role;
select pg_temp.act_as('b7000000-0000-0000-0000-000000000007');
select is((select count(*)::int from public.get_bank_accounts()), 0, 'a resident of ANOTHER company reads none');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.get_bank_accounts()), 0, 'the admin of another company reads none');
select throws_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[]'::jsonb)$$, '42501', 'not allowed', '...and cannot save for this company');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.get_bank_accounts()), 0, 'a stranger reads none');
reset role;
select pg_temp.act_as('b4000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.get_bank_accounts()), 0, 'a former tenant reads none');
reset role;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$update public.companies set settings = '{"payment_mode":"mock"}' where id = '10000000-0000-0000-0000-0000000000c2'$$, '42501', null,
  'an admin can no longer write companies.settings directly (the safety switch cannot be flipped from the browser)');
select lives_ok($$update public.companies set name = 'Firma 1 Yeni' where id = '10000000-0000-0000-0000-0000000000c1'$$, '...but can still change the company name');
select lives_ok($$select public.save_bank_accounts('10000000-0000-0000-0000-0000000000c1', '[]'::jsonb)$$, 'saving an empty list clears the accounts');
select is((select count(*)::int from public.get_bank_accounts()), 0, '...and none are shown');
reset role;

select * from finish();
rollback;
