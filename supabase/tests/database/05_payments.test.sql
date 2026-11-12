-- Database tests for 0005_payments.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (Firma 1 has payment_mode = mock, Firma 2 has not):
--   O  owner of u1          T  tenant of u1 since 90 days     T2 tenant of u1 since 30 days
--   O2 owner of u2          P  owner of u1 AND u2             AR admin of Site X who also owns u2
--   FT former tenant        D  deactivated owner of u1        R  resident of Firma 2 (no mock)
-- Lines (amount, due in days): L1 100 (-60)  L2 200 (+10)  L3 300 (+10, NOT for tenants)  L4 400 (voided)
--   L5 500 (-1)  on u1;  L6 60  L7 80 on u2;  L11 999 on Firma 2's unit.

begin;
create extension if not exists pgtap with schema extensions;
select plan(114);

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
-- line id and request id by number
create function tt.cid(n integer) returns uuid language sql as $$ select ('e1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.rid(n integer) returns uuid language sql as $$ select ('f1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.quote(p_ids integer[], p_inst integer default 1)
returns table (amount_kurus bigint, fee_kurus bigint, total_kurus bigint)
language sql as $$
  select q.amount_kurus, q.fee_kurus, q.total_kurus
    from public.quote_payment((select array_agg(tt.cid(x)) from unnest(p_ids) x), p_inst) q;
$$;
create function tt.pay(p_req integer, p_ids integer[], p_inst integer, p_total bigint) returns uuid language sql as $$
  select public.pay_charges_mock(tt.rid(p_req), (select array_agg(tt.cid(x)) from unnest(p_ids) x), p_inst, p_total);
$$;
-- run something and keep the receipt number number only
create function tt.recno_n(p_payment uuid) returns bigint language sql as $$
  select right(receipt_no, 6)::bigint from public.payments where id = p_payment;
$$;

-- The id of the payment made with request id n, WITHOUT the caller's row security: so a test can hand a real
-- payment id to somebody who must not read it (the access check inside the function is what is tested).
create function tt.pay_id(n integer) returns uuid language sql security definer as $$
  select id from public.payments where request_id = tt.rid(n);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{"full_name":"Admin A"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{"full_name":"Admin B"}'),
  ('ab000000-0000-0000-0000-00000000000b', 'adminres@test.local', '{"full_name":"Yonetici Sakin"}'),
  ('b1000000-0000-0000-0000-000000000001', 'owner@test.local', '{"full_name":"Mehmet Malik"}'),
  ('b2000000-0000-0000-0000-000000000002', 'tenant3@test.local', '{"full_name":"Kemal Kiracı"}'),
  ('b3000000-0000-0000-0000-000000000003', 'tenant2@test.local', '{"full_name":"Yeni Kiracı"}'),
  ('b4000000-0000-0000-0000-000000000004', 'former@test.local', '{"full_name":"Eski Kiracı"}'),
  ('b5000000-0000-0000-0000-000000000005', 'deactivated@test.local', '{"full_name":"Pasif"}'),
  ('b6000000-0000-0000-0000-000000000006', 'owner2@test.local', '{"full_name":"Dilek Diğer"}'),
  ('b7000000-0000-0000-0000-000000000007', 'othercompany@test.local', '{"full_name":"Başka Firma"}'),
  ('b9000000-0000-0000-0000-000000000009', 'both@test.local', '{"full_name":"İki Daire"}'),
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
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '1');
insert into public.site_members (profile_id, site_id, role) values
  ('a1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('ab000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('a2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'admin');
update public.profiles set is_active = false where id = 'b5000000-0000-0000-0000-000000000005';
insert into public.unit_residents (unit_id, profile_id, relation, start_date, end_date) values
  ('40000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'tenant', tt.today() - 90,  null),
  ('40000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', 'tenant', tt.today() - 30,  null),
  ('40000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000004', 'tenant', tt.today() - 200, tt.today() - 31),
  ('40000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000005', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000009', 'owner',  tt.today() - 100, null),
  ('40000000-0000-0000-0000-000000000002', 'b9000000-0000-0000-0000-000000000009', 'owner',  tt.today() - 100, null),
  ('40000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000006', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000002', 'ab000000-0000-0000-0000-00000000000b', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000007', 'owner',  tt.today() - 400, null);

update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000001' where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'aidat';
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000002' where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'demirbas';
update public.charge_types set id = 'cccccccc-0000-0000-0000-00000000000b' where company_id = '10000000-0000-0000-0000-0000000000c2' and code = 'aidat';
insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible) values
  ('d0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001', '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true),
  ('d0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-00000000000b', '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true);
create function pg_temp.line(p_n integer, p_unit text, p_type text, p_amount numeric, p_due integer, p_visible boolean, p_voided boolean, p_desc text default null)
returns void language sql as $$
  insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, voided_at, void_reason, created_at, description)
  values (tt.cid(p_n), ('40000000-0000-0000-0000-00000000000' || p_unit)::uuid, p_type::uuid,
          case when p_unit = '3' then 'd0000000-0000-0000-0000-000000000002' else 'd0000000-0000-0000-0000-000000000001' end::uuid,
          p_amount, tt.today() + p_due, p_visible, case when p_voided then now() end, case when p_voided then 'iptal edildi' end,
          timestamptz '2026-01-01' + p_n * interval '1 minute', p_desc);
$$;
select pg_temp.line(1,  '1', 'cccccccc-0000-0000-0000-000000000001', 100, -60, true,  false, 'Eylül aidatı');
select pg_temp.line(2,  '1', 'cccccccc-0000-0000-0000-000000000001', 200,  10, true,  false);
select pg_temp.line(3,  '1', 'cccccccc-0000-0000-0000-000000000002', 300,  10, false, false);
select pg_temp.line(4,  '1', 'cccccccc-0000-0000-0000-000000000001', 400,   5, true,  true);
select pg_temp.line(5,  '1', 'cccccccc-0000-0000-0000-000000000001', 500,  -1, true,  false);
select pg_temp.line(6,  '2', 'cccccccc-0000-0000-0000-000000000001',  60,   3, true,  false);
select pg_temp.line(7,  '2', 'cccccccc-0000-0000-0000-000000000002',  80,   3, false, false);
select pg_temp.line(11, '3', 'cccccccc-0000-0000-0000-00000000000b', 999,   3, true,  false);

-- ---------------------------------------------------------------------------
-- 1. Structure and permissions
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.payments', 'insert') and not has_table_privilege('authenticated', 'public.payments', 'update')
      and not has_table_privilege('authenticated', 'public.payments', 'delete') and not has_table_privilege('authenticated', 'public.payment_allocations', 'insert')
      and not has_table_privilege('authenticated', 'public.payment_allocations', 'update') and not has_table_privilege('authenticated', 'public.payment_allocations', 'delete'),
  'nobody can write payments or allocations directly');
select ok(not has_table_privilege('anon', 'public.payments', 'select') and not has_table_privilege('anon', 'public.payment_allocations', 'select')
      and not has_table_privilege('anon', 'public.charge_status', 'select') and not has_table_privilege('anon', 'public.unit_balances', 'select')
      and has_table_privilege('authenticated', 'public.charge_status', 'select') and has_table_privilege('authenticated', 'public.unit_balances', 'select'),
  'visitors read nothing; the recreated views have their grants again');
select ok(has_function_privilege('authenticated', 'private.charge_paid(uuid)', 'execute') and has_function_privilege('authenticated', 'private.resident_sees_payment(uuid, uuid)', 'execute')
      and not has_function_privilege('anon', 'private.charge_paid(uuid)', 'execute'),
  'the helpers that a view and a policy call as the user are executable by logged-in users only');
select ok(not has_function_privilege('authenticated', 'private.payment_lines(uuid[])', 'execute') and not has_function_privilege('authenticated', 'private.next_receipt_no(timestamptz)', 'execute')
      and not has_function_privilege('authenticated', 'private.payment_fee(uuid, bigint, integer)', 'execute') and not has_function_privilege('authenticated', 'private.charge_has_payment(uuid)', 'execute'),
  'the internal payment functions cannot be called from a browser');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                       and p.proname in ('quote_payment', 'pay_charges_mock', 'get_receipt', 'void_payment') and has_function_privilege('anon', p.oid, 'execute')),
  'a visitor can execute none of the payment functions');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'charges' and cmd = 'SELECT'), 1, 'charges has ONE read policy (admin and resident merged)');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'charge_types' and cmd = 'SELECT'), 1, 'charge_types has ONE read policy');
select is((select reloptions::text from pg_class where oid = 'public.charge_status'::regclass), '{security_invoker=true}', 'charge_status still runs with the caller''s rights');

-- ---------------------------------------------------------------------------
-- 2. Quote: who may pay what
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select * from tt.quote(array[1])$$, '42501', null, 'a visitor cannot ask for a quote');

reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select sum(amount_kurus) || '/' || max(fee_kurus) || '/' || max(total_kurus) from tt.quote(array[1, 5])), '60000/0/60000',
  'the owner''s quote for two lines is 600,00 TL and no fee (the management pays the commission by default)');
select is((select count(*)::int from tt.quote(array[1, 5])), 2, '...one row per line');
select is((select amount_kurus from tt.quote(array[3])), 30000::bigint, 'the owner can pay a line that is hidden from tenants');
select throws_ok($$select * from tt.quote(array[1], 4)$$, 'P0001', 'installments_invalid', 'installments other than 1, 2, 3, 6, 9 are refused');
select throws_ok($$select * from tt.quote(array[1], null)$$, 'P0001', 'installments_invalid', '...and no value');
select throws_ok($$select * from tt.quote(array[]::integer[])$$, 'P0001', 'charges_invalid', 'no line at all is refused');
select throws_ok($$select * from tt.quote(array[1, 1])$$, 'P0001', 'charges_invalid', 'the same line twice is refused');
select throws_ok($$select * from public.quote_payment((select array_agg(('e1000000-0000-0000-0001-' || lpad(x::text, 12, '0'))::uuid) from generate_series(1, 101) x), 1)$$,
  'P0001', 'charges_invalid', 'more than 100 lines are refused');
select throws_ok($$select * from tt.quote(array[4])$$, 'P0001', 'charge_not_payable', 'a cancelled line cannot be paid');
select throws_ok($$select * from tt.quote(array[6])$$, 'P0001', 'charge_not_payable', 'a line of another unit cannot be paid');
select throws_ok($$select * from public.quote_payment(array['00000000-0000-0000-0000-00000000dead']::uuid[], 1)$$, 'P0001', 'charge_not_payable',
  'an unknown id gets the same answer as a hidden one (ids cannot be probed)');

reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select sum(amount_kurus)::int from tt.quote(array[1, 2])), 30000, 'a tenant can pay tenant-visible lines (100 + 200)');
select throws_ok($$select * from tt.quote(array[3])$$, 'P0001', 'charge_not_payable', 'a tenant who guesses the id of a hidden line is refused by the same rule that hides it');
select throws_ok($$select * from tt.quote(array[1, 3])$$, 'P0001', 'charge_not_payable', '...also when it is mixed with a payable one');

reset role;
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select throws_ok($$select * from tt.quote(array[1])$$, 'P0001', 'charge_not_payable', 'a NEW tenant cannot pay the previous tenant''s line (due before they moved in)');
select is((select amount_kurus from tt.quote(array[2])), 20000::bigint, '...but can pay a line due after they moved in');

reset role;
select pg_temp.act_as('b4000000-0000-0000-0000-000000000004');
select throws_ok($$select * from tt.quote(array[1])$$, 'P0001', 'charge_not_payable', 'a former tenant cannot pay');
reset role;
select pg_temp.act_as('b5000000-0000-0000-0000-000000000005');
select throws_ok($$select * from tt.quote(array[1])$$, 'P0001', 'charge_not_payable', 'a deactivated account cannot pay');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok($$select * from tt.quote(array[1])$$, 'P0001', 'charge_not_payable', 'a stranger cannot pay');
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select throws_ok($$select * from tt.quote(array[1])$$, 'P0001', 'charge_not_payable', 'the owner of ANOTHER unit cannot pay this unit''s lines');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select * from tt.quote(array[1])$$, 'P0001', 'charge_not_payable', 'an admin cannot use the mock checkout');
reset role;
select pg_temp.act_as('ab000000-0000-0000-0000-00000000000b');
select throws_ok($$select * from tt.quote(array[6])$$, 'P0001', 'charge_not_payable', '...not even an admin who also lives in a unit of the site');
reset role;
select pg_temp.act_as('b9000000-0000-0000-0000-000000000009');
select throws_ok($$select * from tt.quote(array[1, 6])$$, 'P0001', 'one_unit_only', 'one payment is for ONE unit (even for a person who owns two)');
select is((select amount_kurus from tt.quote(array[6])), 6000::bigint, '...but each unit can be paid on its own');
reset role;
select pg_temp.act_as('b7000000-0000-0000-0000-000000000007');
select throws_ok($$select * from public.quote_payment(array[tt.cid(11)], 1)$$, 'P0001', 'payment_disabled', 'a company without payment_mode "mock" cannot use the mock checkout');

-- ---------------------------------------------------------------------------
-- 3. The owner pays two lines
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.payments), 0, 'before paying: no payments');
select throws_ok($$select tt.pay(1, array[1, 5], 1, 59999)$$, 'P0001', 'quote_outdated', 'a total that differs from the quote by one kuruş is refused');
select throws_ok($$select tt.pay(1, array[1, 5], 1, 60001)$$, 'P0001', 'quote_outdated', '...in either direction');
select throws_ok($$select public.pay_charges_mock(null, array[tt.cid(1)], 1, 10000)$$, 'P0001', 'invalid_request', 'a request id is required');
select throws_ok($$select tt.pay(1, array[1, 5], 5, 60000)$$, 'P0001', 'installments_invalid', 'a wrong installment count is refused');
select throws_ok($$select tt.pay(1, array[4], 1, 40000)$$, 'P0001', 'charge_not_payable', 'a cancelled line is refused');
reset role;
select is((select count(*)::int from public.payments), 0, 'none of the refused attempts created a payment');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select isnt(tt.pay(1, array[1, 5], 1, 60000), null, 'the owner pays lines 1 and 5 (600,00 TL)');
select is((select amount::text || '/' || fee::text || '/' || status || '/' || provider || '/' || method || '/' || installments || '/' || unit_label || '/' || payer_name
             from public.payments), '600.00/0.00/approved/mock/card/1/A Blok · 1/Mehmet Malik', 'the payment is stored with snapshots of the unit label and the payer name');
select is((select count(*)::int from public.payment_allocations), 0, 'the owner cannot read allocations');
reset role;
select is((select count(*)::int || '/' || sum(amount)::text from public.payment_allocations), '2/600.00', 'two allocations exist and add up to the payment amount');
select is((select p.amount = (select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id) from public.payments p), true, 'payment amount = sum of allocations');
select matches((select receipt_no from public.payments), '^MKB-' || to_char(now() at time zone 'Europe/Istanbul', 'YYYY') || '-[0-9]{6}$', 'the receipt number looks like MKB-<Istanbul year>-000123');
select throws_ok($$delete from public.charges where id = tt.cid(1)$$, '23503', null, 'a paid line cannot be deleted: the allocation foreign key restricts');

-- the owner's view
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select status || '/' || paid_amount::text || '/' || remaining::text from public.charge_status where charge_id = tt.cid(1)), 'paid/100.00/0.00', 'the paid line flips to "paid" with nothing remaining');
select is((select status from public.charge_status where charge_id = tt.cid(2)), 'open', 'an unpaid future line stays open');
select is((select line_count || '/' || charged::text || '/' || paid::text || '/' || balance::text || '/' || overdue_amount::text || '/' || overdue_count || '/' || (next_due_date = tt.today() + 10)::text
             from public.unit_balances), '4/1100.00/600.00/500.00/0.00/0/true', 'the owner''s balance: 1100 charged, 600 paid, 500 left, nothing overdue (the overdue lines were paid)');
select is((select string_agg(running_balance::text, ',' order by due_date, created_at, charge_id) from public.charge_status),
  '0.00,0.00,200.00,500.00', 'the running balance follows the remaining amounts');

-- a tenant sees the line as paid even though the owner paid it, but not the payment
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select status from public.charge_status where charge_id = tt.cid(1)), 'paid', 'the tenant sees the line the owner paid as paid');
select is((select balance::text from public.unit_balances), '200.00', '...and a balance of 200 (their visible lines only)');
select is((select count(*)::int from public.payments) || '/' || (select count(*)::int from public.payment_allocations), '0/0', '...but cannot read the owner''s payment or any allocation');
reset role;
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.payments), 0, 'another tenant cannot read it either');

-- paying twice, and the double click
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is(tt.pay(1, array[1, 5], 1, 60000), (select id from public.payments), 'the same request id returns the same payment (double click)...');
reset role;
select is((select count(*)::int from public.payments) || '/' || (select count(*)::int from public.payment_allocations), '1/2', '...and nothing is charged twice');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.pay(2, array[1], 1, 10000)$$, 'P0001', 'already_paid', 'a line that is already paid cannot be paid again (new request id)');
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select throws_ok($$select tt.pay(1, array[2], 1, 20000)$$, 'P0001', 'request_id_used', 'somebody else cannot use the request id of another person''s payment');

-- the tenant pays a visible line; hidden ones stay unpayable
select throws_ok($$select tt.pay(3, array[3], 1, 30000)$$, 'P0001', 'charge_not_payable', 'the tenant cannot pay the hidden line');
select isnt(tt.pay(4, array[2], 1, 20000), null, 'the tenant pays line 2 (200,00 TL)');
reset role;
select is((select count(*)::int from public.payments where payer_id = 'b2000000-0000-0000-0000-000000000002'), 1, 'the payer is the tenant');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.payments), 2, 'the OWNER sees every payment of the unit, including the tenant''s');
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.payments), 1, 'the tenant sees only their own payment');
select is((select balance::text from public.unit_balances), '0.00', '...and their balance is 0 now');

-- other roles pay nothing
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.pay(5, array[3], 1, 30000)$$, 'P0001', 'charge_not_payable', 'an admin cannot pay');
reset role;
select pg_temp.act_as('b7000000-0000-0000-0000-000000000007');
select throws_ok($$select public.pay_charges_mock(tt.rid(6), array[tt.cid(11)], 1, 99900)$$, 'P0001', 'payment_disabled', 'a company with the switch off cannot pay');
reset role;
select is((select count(*)::int from public.payments), 2, 'still only the 2 payments');

-- ---------------------------------------------------------------------------
-- 4. Receipts
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select receipt_no from public.get_receipt((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001')))
        , (select receipt_no from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'), 'the payer reads the receipt');
select is((select total_kurus || '/' || fee_kurus || '/' || payer_name || '/' || unit_label || '/' || company_name || '/' || site_name
             from public.get_receipt((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'))),
  '60000/0/Mehmet Malik/A Blok · 1/Firma 1/Site X', '...with the amounts and names from the database');
select is((select jsonb_array_length(lines)::text || '/' || (lines -> 0 ->> 'description') || '/' || (lines -> 0 ->> 'amount_kurus') || '/' || (lines -> 1 ->> 'amount_kurus')
             from public.get_receipt((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'))),
  '2/Eylül aidatı/10000/50000', '...and the paid lines in due date order');
select is((select jsonb_array_length(lines)::int from public.get_receipt((select id from public.payments where payer_id = 'b2000000-0000-0000-0000-000000000002'))), 1,
  'the owner can read the tenant''s receipt');
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.get_receipt(tt.pay_id(1))$$, '42501', null,
  'the tenant cannot read the owner''s receipt, even when given its real id');
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok($$select * from public.get_receipt(gen_random_uuid())$$, '42501', null, 'a stranger gets "not allowed" for any id');
select throws_ok($$select * from public.get_receipt(tt.pay_id(1))$$, '42501', null, '...and for the real id of a payment');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.get_receipt(tt.pay_id(1))$$, '42501', null,
  'the admin of another company cannot read it, even when given its real id');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.payments), 2, 'the admin of the site sees both payments');
select is((select count(*)::int from public.payment_allocations), 3, '...and the 3 allocations');
select isnt((select receipt_no from public.get_receipt((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'))), null, '...and can read a receipt');
reset role;
update public.profiles set full_name = 'Yeni Ad' where id = 'b1000000-0000-0000-0000-000000000001';
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select payer_name from public.get_receipt((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'))), 'Mehmet Malik',
  'renaming a person does not change an old receipt');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select * from public.get_receipt(gen_random_uuid())$$, '42501', null, 'a visitor cannot read receipts');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.payments (unit_id, unit_label, amount, method, provider, receipt_no) values ('40000000-0000-0000-0000-000000000001', 'x', 1, 'card', 'mock', 'MKB-2026-000999')$$,
  '42501', null, 'an owner cannot write a payment directly');
select throws_ok($$update public.payments set amount = 1$$, '42501', null, '...or change one');

-- ---------------------------------------------------------------------------
-- 5. A paid line is part of the books (the slice 4 guards)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$update public.charges set amount = 150 where id = tt.cid(1)$$, '23514', 'charge_paid', 'the amount of a paid line cannot be changed');
select throws_ok($$update public.charges set due_date = due_date + 1 where id = tt.cid(1)$$, '23514', 'charge_paid', '...nor its due date');
select lives_ok($$update public.charges set description = 'Düzeltilmiş açıklama' where id = tt.cid(1)$$, 'but its description can still be corrected');
select lives_ok($$update public.charges set amount = 350 where id = tt.cid(3)$$, 'an unpaid line can still be edited');
select throws_ok($$select public.void_charge(tt.cid(1), 'iptal etmek istiyorum')$$, 'P0001', 'charge_paid', 'a paid line cannot be cancelled: cancel the payment first');
select throws_ok($$select public.void_charge_batch('d0000000-0000-0000-0000-000000000001', 'toplu iptal')$$, 'P0001', 'batch_has_payments', 'a batch with a paid line cannot be undone');
select throws_ok($$select public.delete_charge_batch('d0000000-0000-0000-0000-000000000001')$$, 'P0001', 'batch_has_payments', 'nor deleted (even inside the 15 minutes)');
select lives_ok($$update public.charges set amount = 300 where id = tt.cid(3)$$, 'put line 3 back');

-- ---------------------------------------------------------------------------
-- 6. Cancelling a payment (admin)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.void_payment((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'), 'yanlışlıkla ödendi')$$, '42501', null, 'a resident cannot cancel a payment');
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.void_payment(tt.pay_id(1), 'yanlışlıkla ödendi')$$, '42501', null, 'the admin of another company cannot cancel it (real id)');
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.void_payment((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'), 'ab')$$, 'P0001', 'reason_invalid', 'a reason of fewer than 3 characters is refused');
select lives_ok($$select public.void_payment((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'), 'yanlışlıkla ödendi')$$, 'the admin cancels the owner''s payment');
select throws_ok($$select public.void_payment((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'), 'tekrar iptal')$$, 'P0001', 'already_voided', 'a cancelled payment cannot be cancelled again');
select is((select status || '/' || void_reason from public.get_receipt((select id from public.payments where payer_id = 'b1000000-0000-0000-0000-000000000001'))), 'voided/yanlışlıkla ödendi',
  'the receipt stays and says it was cancelled');
select is((select status from public.charge_status where charge_id = tt.cid(1)), 'overdue', 'the line is unpaid again (and overdue, its due date has passed)');
select is((select balance::text from public.unit_balances where unit_id = '40000000-0000-0000-0000-000000000001'), '900.00', 'the unit balance is back up: 1100 charged, only the tenant''s 200 is paid, 900 left');
select lives_ok($$update public.charges set amount = 120 where id = tt.cid(1)$$, 'an edit is possible again after the payment was cancelled');
select lives_ok($$update public.charges set amount = 100 where id = tt.cid(1)$$, 'back to 100');
select is((select count(*)::int from public.payment_allocations), 3, 'the allocations of a cancelled payment are kept (history)');

-- paying again after a cancel: a new receipt, a higher number
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select isnt(tt.pay(7, array[1, 5], 1, 60000), null, 'the owner can pay the same lines again after the cancel');
select ok(tt.recno_n((select id from public.payments where request_id = tt.rid(7))) > tt.recno_n((select id from public.payments where request_id = tt.rid(1))),
  '...with a NEW, higher receipt number (a cancelled number is never reused)');
reset role;
select is((select count(distinct receipt_no)::int from public.payments), 3, 'all 3 receipt numbers are different');

-- ---------------------------------------------------------------------------
-- 7. The fee (off by default, switchable per company)
-- ---------------------------------------------------------------------------
reset role;
update public.companies set settings = settings || '{"payment": {"commission_payer": "resident", "fee_pct": {"3": 2.5, "9": 8}}}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select amount_kurus || '/' || fee_kurus || '/' || total_kurus from tt.quote(array[3], 3)), '30000/750/30750', 'when the resident pays the commission: 3 installments of 300,00 TL add 2,5 % = 7,50 TL');
select is((select fee_kurus from tt.quote(array[3], 1)), 0::bigint, '...a payment in one go has no fee (no percentage set for 1)');
select is((select fee_kurus from tt.quote(array[3], 9)), 2400::bigint, '...9 installments add 8 %');
select throws_ok($$select tt.pay(8, array[3], 3, 30000)$$, 'P0001', 'quote_outdated', 'paying without the fee is refused');
select isnt(tt.pay(8, array[3], 3, 30750), null, 'paying with the fee works');
select is((select amount::text || '/' || fee::text from public.payments where request_id = tt.rid(8)), '300.00/7.50', 'the fee is stored separately from the amount');
reset role;
select is((select sum(a.amount)::text from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.request_id = tt.rid(8)), '300.00', 'the allocations add up to the amount WITHOUT the fee');
update public.companies set settings = settings || '{"payment": {"commission_payer": "management", "fee_pct": {"3": 2.5}}}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as('b9000000-0000-0000-0000-000000000009');
select is((select fee_kurus from tt.quote(array[6], 3)), 0::bigint, 'when the management pays the commission the fee is 0 whatever the percentages say');

reset role;
select * from finish();
rollback;
