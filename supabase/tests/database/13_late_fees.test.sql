-- Database tests for 0013_late_fees.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- People:  AD admin of Site X   AY admin of Site Y   ST staff of Site X (no admin)   S stranger
--          RS owner of unit 1 (A-1)   TN1 tenant of unit 1   O2 owner of unit 2 (A-2)   TN2 tenant of unit 2   O3 owner of unit 3 (B-3)
-- Lines (amount, due in days; T = today in Istanbul), all in batch B1 unless said:
--   L1  1000 (-40)  u1 aidat           L2  500 (-10)  u1 aidat        L3  700 (-100) u1 DEVIR (never gets a fee)
--   L4   300 (+5)   u1 aidat, not late L5  200 (-50)  u1 voided
--   L6   400 (-20)  u2 aidat, NOT shown to tenants
--   L7   600 (-30)  u3 aidat, 200 paid on T-10
--   L8   150 (-20)  u4, a hand-written "Gecikme Tazminatı" (never gets a fee)
--   L9   999 (-40)  Site Y
-- Rules: the defaults (5 % per month, daily, no grace) unless a test changes them.
-- With the defaults the fees on day T are: L1 66.67, L2 8.33, L6 13.33, L7 26.67 (= 115.00).

begin;
create extension if not exists pgtap with schema extensions;
select plan(170);

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
create function tt.u(p text) returns uuid language sql as $$
  select (case p when 'AD' then 'a1000000-0000-0000-0000-000000000001' when 'AY' then 'a2000000-0000-0000-0000-000000000002'
                 when 'ST' then 'a3000000-0000-0000-0000-000000000003' when 'S' then 'c1000000-0000-0000-0000-000000000001'
                 when 'RS' then 'b1000000-0000-0000-0000-000000000001' when 'TN1' then 'b2000000-0000-0000-0000-000000000002'
                 when 'O2' then 'b3000000-0000-0000-0000-000000000003' when 'TN2' then 'b4000000-0000-0000-0000-000000000004'
                 when 'O3' then 'b5000000-0000-0000-0000-000000000005' end)::uuid
$$;
create function tt.sx() returns uuid language sql as $$ select '20000000-0000-0000-0000-0000000000a1'::uuid $$;
create function tt.sy() returns uuid language sql as $$ select '20000000-0000-0000-0000-0000000000a2'::uuid $$;
create function tt.cid(n integer) returns uuid language sql as $$ select ('e1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.rq(n integer) returns uuid language sql as $$ select ('f1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create function tt.b1() returns uuid language sql as $$ select 'd0000000-0000-0000-0000-000000000001'::uuid $$;
create function tt.b2() returns uuid language sql as $$ select 'd0000000-0000-0000-0000-000000000002'::uuid $$;
create function tt.by() returns uuid language sql as $$ select 'd0000000-0000-0000-0000-000000000009'::uuid $$;
create function tt.ty(p_code text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c1' and code = p_code
$$;

-- what the preview says (as the caller)
create function tt.pv(p_site uuid default '20000000-0000-0000-0000-0000000000a1') returns jsonb language sql as $$ select public.preview_late_fees(p_site) $$;
create function tt.pv_n() returns integer language sql as $$ select jsonb_array_length(tt.pv() -> 'lines') $$;
create function tt.pv_sum() returns bigint language sql as $$ select coalesce(sum((e ->> 'amount_kurus')::bigint), 0)::bigint from jsonb_array_elements(tt.pv() -> 'lines') e $$;
create function tt.pv_line(n integer) returns bigint language sql as $$
  select (e ->> 'amount_kurus')::bigint from jsonb_array_elements(tt.pv() -> 'lines') e where e ->> 'charge_id' = tt.cid(n)::text $$;
create function tt.pv_over(n integer) returns bigint language sql as $$
  select (e ->> 'amount_kurus')::bigint from jsonb_array_elements(tt.pv() -> 'over') e where e ->> 'charge_id' = tt.cid(n)::text $$;
-- the fee lines written for source line n (all of them, cancelled ones too), without the caller's row security
create function tt.fee_sum(n integer) returns numeric language sql security definer set search_path = '' as $$
  select coalesce(sum(amount), 0) from public.charges where late_fee_source_id = tt.cid(n) $$;
create function tt.fee_cnt(n integer) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.charges where late_fee_source_id = tt.cid(n) $$;
create function tt.n_charges() returns integer language sql security definer set search_path = '' as $$ select count(*)::integer from public.charges $$;
-- apply for the lines ticked (null = all)
create function tt.apply(p_req integer, p_ids integer[], p_count integer, p_kurus bigint, p_site uuid default '20000000-0000-0000-0000-0000000000a1')
returns uuid language sql as $$
  select public.apply_late_fees(tt.rq(p_req), p_site, tt.today(), (select array_agg(tt.cid(x)) from unnest(p_ids) x), p_count, p_kurus) $$;

-- The formula, the slow way: look at every late day (daily) or at the first day of every 30-day block (monthly).
create function tt.ref(p_amount numeric, p_due date, p_grace integer, p_rate numeric, p_method text, p_as_of date, p_dates date[], p_amts numeric[])
returns numeric language plpgsql as $$
declare d date := p_due + p_grace + 1; unpaid numeric; total numeric := 0; i integer;
begin
  while d <= p_as_of loop
    unpaid := p_amount;
    for i in 1 .. coalesce(array_length(p_dates, 1), 0) loop
      if p_dates[i] < d then unpaid := unpaid - p_amts[i]; end if;     -- paid BEFORE this day: the day is not late for that money
    end loop;
    total := total + unpaid;
    d := d + case when p_method = 'daily' then 1 else 30 end;
  end loop;
  return round(case when p_method = 'daily' then total * p_rate / 3000 else total * p_rate / 100 end, 2);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (tt.u('AD'), 'ad@test.local', '{"full_name":"Admin X"}'), (tt.u('AY'), 'ay@test.local', '{"full_name":"Admin Y"}'),
  (tt.u('ST'), 'st@test.local', '{"full_name":"Görevli"}'), (tt.u('S'), 's@test.local', '{}'),
  (tt.u('RS'), 'rs@test.local', '{"full_name":"Malik Bir"}'), (tt.u('TN1'), 'tn1@test.local', '{"full_name":"Kiracı Bir"}'),
  (tt.u('O2'), 'o2@test.local', '{"full_name":"Malik İki"}'), (tt.u('TN2'), 'tn2@test.local', '{"full_name":"Kiracı İki"}'),
  (tt.u('O3'), 'o3@test.local', '{"full_name":"Malik Üç"}');
insert into public.companies (id, name, settings) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1', '{}'), ('10000000-0000-0000-0000-0000000000c2', 'Firma 2', '{}');
insert into public.sites (id, company_id, name) values (tt.sx(), '10000000-0000-0000-0000-0000000000c1', 'Site X'), (tt.sy(), '10000000-0000-0000-0000-0000000000c2', 'Site Y');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', tt.sx(), 'A Blok'), ('30000000-0000-0000-0000-000000000002', tt.sx(), 'B Blok'), ('30000000-0000-0000-0000-000000000003', tt.sy(), 'A Blok');
insert into public.units (id, block_id, door_no) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '1'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '3'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '4'),
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000003', '1');
insert into public.site_members (profile_id, site_id, role) values (tt.u('AD'), tt.sx(), 'admin'), (tt.u('AY'), tt.sy(), 'admin'), (tt.u('ST'), tt.sx(), 'staff');
insert into public.unit_residents (unit_id, profile_id, relation, start_date, end_date) values
  ('40000000-0000-0000-0000-000000000001', tt.u('RS'),  'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000001', tt.u('TN1'), 'tenant', tt.today() - 200, null),
  ('40000000-0000-0000-0000-000000000002', tt.u('O2'),  'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000002', tt.u('TN2'), 'tenant', tt.today() - 200, null),
  ('40000000-0000-0000-0000-000000000003', tt.u('O3'),  'owner',  tt.today() - 400, null);

insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible) values
  (tt.b1(), tt.sx(), tt.ty('aidat'), '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true),
  (tt.b2(), tt.sx(), tt.ty('aidat'), '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true),
  (tt.by(), tt.sy(), (select id from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c2' and code = 'aidat'), '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true);
create function pg_temp.line(p_n integer, p_unit integer, p_type text, p_amount numeric, p_due integer, p_visible boolean, p_voided boolean default false, p_batch uuid default tt.b1())
returns void language sql as $$
  insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, voided_at, void_reason, period)
  values (tt.cid(p_n), ('40000000-0000-0000-0000-00000000000' || p_unit)::uuid, tt.ty(p_type), p_batch, p_amount, tt.today() + p_due, p_visible,
          case when p_voided then now() end, case when p_voided then 'iptal edildi' end, date_trunc('month', tt.today() + p_due)::date);
$$;
select pg_temp.line(1, 1, 'aidat', 1000, -40, true);
select pg_temp.line(2, 1, 'aidat',  500, -10, true);
select pg_temp.line(3, 1, 'devir',  700, -100, true);
select pg_temp.line(4, 1, 'aidat',  300,   5, true);
select pg_temp.line(5, 1, 'aidat',  200, -50, true, true);
select pg_temp.line(6, 2, 'aidat',  400, -20, false);
select pg_temp.line(7, 3, 'aidat',  600, -30, true);
select pg_temp.line(8, 4, 'gecikme_tazminati', 150, -20, true);
insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible)
values (tt.cid(9), '40000000-0000-0000-0000-000000000009', (select id from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c2' and code = 'aidat'),
        tt.by(), 999, tt.today() - 40, true);
-- 200 of L7 was paid on T-10
insert into public.payments (id, unit_id, unit_label, amount, method, provider, receipt_no, paid_at)
values ('90000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 'B Blok 3', 200, 'cash', 'manual', 'MKB-2026-900001',
        ((tt.today() - 10) + time '12:00') at time zone 'Europe/Istanbul');
insert into public.payment_allocations (payment_id, charge_id, amount) values ('90000000-0000-0000-0000-000000000001', tt.cid(7), 200);

-- ---------------------------------------------------------------------------
-- 1. Structure and permissions
-- ---------------------------------------------------------------------------
select ok(not has_column_privilege('authenticated', 'public.charges', 'late_fee_source_id', 'insert')
      and not has_column_privilege('authenticated', 'public.charges', 'late_fee_source_id', 'update')
      and not has_column_privilege('authenticated', 'public.charges', 'late_fee_through', 'insert')
      and not has_column_privilege('authenticated', 'public.charges', 'late_fee_through', 'update'),
  'nobody can write the two late-fee columns of charges from a browser');
select ok(has_column_privilege('authenticated', 'public.charges', 'late_fee_source_id', 'select'), 'but they can be read (the rows are read through row security)');
select ok(has_function_privilege('authenticated', 'public.preview_late_fees(uuid)', 'execute') and has_function_privilege('authenticated', 'public.apply_late_fees(uuid, uuid, date, uuid[], integer, bigint)', 'execute')
      and not has_function_privilege('anon', 'public.preview_late_fees(uuid)', 'execute') and not has_function_privilege('anon', 'public.apply_late_fees(uuid, uuid, date, uuid[], integer, bigint)', 'execute'),
  'preview and apply: logged-in users only');
select ok(not has_function_privilege('authenticated', 'private.late_fee_amount(numeric, date, integer, numeric, text, date, date[], numeric[])', 'execute')
      and not has_function_privilege('authenticated', 'private.late_fee_rows(uuid, date)', 'execute')
      and not has_function_privilege('authenticated', 'private.late_fee_rules(uuid)', 'execute'),
  'the formula, the rows and the rules cannot be called from a browser');
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('preview_late_fees', 'apply_late_fees')
                    and p.prosecdef and p.proconfig @> array['search_path=""'] ),
  'both are security definer with an empty search_path');
select throws_ok($$insert into public.charges (unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, late_fee_source_id)
                   values ('40000000-0000-0000-0000-000000000001', tt.ty('gecikme_tazminati'), tt.b1(), 5, tt.today(), true, tt.cid(1))$$,
  '23514', null, 'a late-fee line must say up to which day it was calculated (the two columns go together)');
select throws_ok($$insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, late_fee_source_id, late_fee_through)
                   values (tt.cid(50), '40000000-0000-0000-0000-000000000001', tt.ty('gecikme_tazminati'), tt.b1(), 5, tt.today(), true, tt.cid(50), tt.today())$$,
  '23514', null, 'a late-fee line cannot belong to itself');

-- ---------------------------------------------------------------------------
-- 2. The formula: hand-made cases (A = 1000, due D, rate 5)
-- ---------------------------------------------------------------------------
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), '{}', '{}'), 50.00, 'daily: 30 late days of 1000 at 5 % a month = 50.00');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'monthly', tt.today(), '{}', '{}'), 50.00, 'monthly: 30 late days = one started month = 50.00');
select is(private.late_fee_amount(1000, tt.today() - 31, 0, 5, 'monthly', tt.today(), '{}', '{}'), 100.00, 'monthly: day 31 starts a second month = 100.00');
select is(private.late_fee_amount(1000, tt.today() - 31, 0, 5, 'daily', tt.today(), '{}', '{}'), 51.67, 'daily: 31 days = 51.67');
select is(private.late_fee_amount(1000, tt.today(), 0, 5, 'daily', tt.today(), '{}', '{}'), 0.00, 'not late on the due date itself');
select is(private.late_fee_amount(1000, tt.today() + 3, 0, 5, 'monthly', tt.today(), '{}', '{}'), 0.00, 'not late before the due date');
select is(private.late_fee_amount(1000, tt.today() - 5, 5, 5, 'daily', tt.today(), '{}', '{}'), 0.00, 'grace 5: still nothing on day 5 after the due date');
select is(private.late_fee_amount(1000, tt.today() - 6, 5, 5, 'daily', tt.today(), '{}', '{}'), 1.67, 'grace 5: the first late day is day 6 (1 day = 1.67)');
select is(private.late_fee_amount(1000, tt.today() - 6, 5, 5, 'monthly', tt.today(), '{}', '{}'), 50.00, 'grace 5, monthly: one late day = a whole month');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 0, 'daily', tt.today(), '{}', '{}'), 0.00, 'rate 0 = no fee');
select is(private.late_fee_amount(3, tt.today() - 1, 0, 5, 'daily', tt.today(), '{}', '{}'), 0.01, '0.005 is rounded up to 0.01 (exact, half away from zero)');
-- payments (due D, today D+30, daily, N = 30 late days)
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), array[tt.today() - 20], array[400.00]), 36.67, 'daily: 400 paid on day 10 lowers the base for the 20 days after it (30000 - 8000 = 22000 x 5 / 3000)');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), array[tt.today() - 30], array[1000.00]), 0.00, 'paid in full on the due date = no fee');
select is(private.late_fee_amount(1000, tt.today() - 30, 5, 5, 'daily', tt.today(), array[tt.today() - 25], array[1000.00]), 0.00, 'paid in full on the last grace day = no fee');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), array[tt.today() - 29], array[1000.00]), 1.67, 'paid in full on the FIRST late day: that day was still late (1.67)');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), array[tt.today()], array[1000.00]), 50.00, 'paid today: today was still late, so the fee is the full 50.00');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), array[tt.today() + 3], array[1000.00]), 50.00, 'a payment dated after the as-of day changes nothing');
-- monthly: blocks start on D+1, D+31, D+61 (today = D+61: three started blocks)
select is(private.late_fee_amount(1000, tt.today() - 61, 0, 5, 'monthly', tt.today(), '{}', '{}'), 150.00, 'monthly: three blocks = 150.00');
select is(private.late_fee_amount(1000, tt.today() - 61, 0, 5, 'monthly', tt.today(), array[tt.today() - 30], array[400.00]), 130.00, 'monthly: 400 paid on D+31 helps only block 3 (1000 + 1000 + 600) x 5 %');
select is(private.late_fee_amount(1000, tt.today() - 61, 0, 5, 'monthly', tt.today(), array[tt.today() - 31], array[400.00]), 110.00, 'monthly: 400 paid on D+30 helps blocks 2 and 3');
select is(private.late_fee_amount(1000, tt.today() - 61, 0, 5, 'monthly', tt.today(), array[tt.today() - 61], array[400.00]), 90.00, 'monthly: 400 paid on the due date helps every block');
select is(private.late_fee_amount(1000, tt.today() - 30, 0, 5, 'daily', tt.today(), array[tt.today() - 20], array[1600.00]), 0.00, 'payments above the debt never give a negative fee');
-- bad input
select throws_ok($$select private.late_fee_amount(1000, tt.today() - 3, 0, 5, 'weekly', tt.today(), '{}', '{}')$$, 'P0001', 'late_fee_method_invalid', 'an unknown method is refused');
select throws_ok($$select private.late_fee_amount(null, tt.today() - 3, 0, 5, 'daily', tt.today(), '{}', '{}')$$, 'P0001', 'invalid_request', 'a missing number is refused');
select throws_ok($$select private.late_fee_amount(1000, tt.today() - 3, 0, 5, 'daily', tt.today(), array[tt.today()], '{}')$$, 'P0001', 'invalid_request', 'payment dates and amounts must pair up');

-- The slow reference over a grid: 131 as-of days x grace 0/5 x rate 5/2.5 x 2 methods x 11 payment stories (11 528 cases)
select is((
  with stories(id, d, a) as (values
    (1, '{}'::integer[], '{}'::numeric[]), (2, '{-3}', '{300}'), (3, '{0}', '{400}'), (4, '{5}', '{400}'), (5, '{6}', '{400}'),
    (6, '{1}', '{400}'), (7, '{29,30}', '{250,250}'), (8, '{31}', '{500}'), (9, '{10,40,75}', '{100,200,300}'), (10, '{130}', '{500}'), (11, '{60}', '{1000}')),
  grid as (
    select s.id, g.grace, r.rate, m.method, o.n as offs, s.d, s.a
      from stories s, (values (0), (5)) g(grace), (values (5::numeric), (2.5)) r(rate), (values ('daily'), ('monthly')) m(method), generate_series(0, 130) o(n))
  select count(*)::integer from grid
   where private.late_fee_amount(1000, date '2026-01-01', grace, rate, method, date '2026-01-01' + offs,
           (select coalesce(array_agg(date '2026-01-01' + x order by ord), '{}') from unnest(d) with ordinality u(x, ord)), a)
         is distinct from
         tt.ref(1000, date '2026-01-01', grace, rate, method, date '2026-01-01' + offs,
           (select coalesce(array_agg(date '2026-01-01' + x order by ord), '{}') from unnest(d) with ordinality u(x, ord)), a)
), 0, 'the formula equals the day-by-day reference in all 11 528 cases');
select is((select count(*)::integer from (
  select 1 from generate_series(0, 130) o(n)
   where private.late_fee_amount(1000, date '2026-01-01', 0, 5, 'daily', date '2026-01-01' + n, '{}', '{}') > 0) z), 130,
  'sanity: the grid really has late days (130 of 131 as-of days have a fee)');

-- ---------------------------------------------------------------------------
-- 3. Preview (as the admin of Site X)
-- ---------------------------------------------------------------------------
reset role;
select is((select count(*)::integer from public.charge_batches where split_method = 'late_fee'), 0, 'nothing is billed yet');
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv() ->> 'as_of', tt.today()::text, 'the preview is for today (Istanbul), a day the server sets');
select is((tt.pv() ->> 'rate')::numeric, 5::numeric, 'default rate 5 (% a month)');
select is(tt.pv() ->> 'method', 'daily', 'default method daily');
select is((tt.pv() ->> 'grace_days')::integer, 0, 'default grace 0');
select is((tt.pv() ->> 'type_ready')::boolean, true, 'the Gecikme Tazminatı type is ready');
select is(tt.pv_n(), 4, 'four lines have a fee: L1, L2, L6, L7');
select is(tt.pv_line(1), 6667::bigint, 'L1: 1000 x 40 days = 66.67');
select is(tt.pv_line(2), 833::bigint,  'L2: 500 x 10 days = 8.33');
select is(tt.pv_line(6), 1333::bigint, 'L6: 400 x 20 days = 13.33');
select is(tt.pv_line(7), 2667::bigint, 'L7: 600 over 30 days, 200 paid 10 days ago = 26.67');
select is(tt.pv_sum(), 11500::bigint, 'together 115.00');
select ok(tt.pv_line(3) is null and tt.pv_line(4) is null and tt.pv_line(5) is null and tt.pv_line(8) is null and tt.pv_line(9) is null,
  'not listed: old carried debt (L3), a line not late yet (L4), a cancelled line (L5), a hand-written late fee (L8), another site (L9)');
select is((select e ->> 'remaining_kurus' from jsonb_array_elements(tt.pv() -> 'lines') e where e ->> 'charge_id' = tt.cid(7)::text), '40000', 'L7 shows what is still unpaid (400.00)');
select is((select e ->> 'days' from jsonb_array_elements(tt.pv() -> 'lines') e where e ->> 'charge_id' = tt.cid(1)::text), '40', 'L1 shows 40 late days');
select is((select (e ->> 'tenant_visible')::boolean from jsonb_array_elements(tt.pv() -> 'lines') e where e ->> 'charge_id' = tt.cid(6)::text), false, 'L6 is marked as owner-only');
select is(jsonb_array_length(tt.pv() -> 'over'), 0, 'nothing is billed too high');
select is(tt.n_charges(), 9, 'the preview writes nothing (still the 9 lines of the fixture)');
reset role;
select is((select count(*)::integer from public.charges where late_fee_source_id is not null), 0, '...still no fee line after the preview');

-- who may look
select pg_temp.act_as(tt.u('AY'));
select throws_ok($$select tt.pv('20000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'the admin of another site cannot preview');
select is(jsonb_array_length(tt.pv(tt.sy()) -> 'lines'), 1, 'the admin of Site Y sees only Site Y: L9');
select is((select (e ->> 'amount_kurus')::bigint from jsonb_array_elements(tt.pv(tt.sy()) -> 'lines') e), 6660::bigint, 'L9: 999 x 40 days x 5 / 3000 = 66.60');
reset role;
select pg_temp.act_as(tt.u('ST'));
select throws_ok($$select tt.pv()$$, '42501', null, 'staff (not admin) cannot preview');
reset role;
select pg_temp.act_as(tt.u('RS'));
select throws_ok($$select tt.pv()$$, '42501', null, 'a resident cannot preview');
reset role;
select pg_temp.act_as(tt.u('S'));
select throws_ok($$select tt.pv()$$, '42501', null, 'a stranger cannot preview');
reset role;
select pg_temp.act_as_visitor();
select throws_ok($$select tt.pv()$$, '42501', null, 'a visitor cannot preview');
select throws_ok($$select tt.apply(1, null, 4, 11500)$$, '42501', null, 'a visitor cannot apply');
reset role;
select pg_temp.act_as(tt.u('ST'));
select throws_ok($$select tt.apply(1, null, 4, 11500)$$, '42501', null, 'staff cannot apply');
reset role;
select pg_temp.act_as(tt.u('AY'));
select throws_ok($$select tt.apply(1, null, 4, 11500)$$, '42501', null, 'the admin of another site cannot apply');
select throws_ok($$select public.preview_late_fees(null)$$, '42501', null, 'no site = refused');
reset role;
select is((select count(*)::integer from public.charge_batches where split_method = 'late_fee'), 0, 'all those refusals billed nothing');

-- ---------------------------------------------------------------------------
-- 4. Apply: only what is checked, only what was seen
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AD'));
select throws_ok($$select public.apply_late_fees(null, tt.sx(), tt.today(), null, 4, 11500)$$, 'P0001', 'invalid_request', 'a request id is needed');
select throws_ok($$select public.apply_late_fees(tt.rq(1), tt.sx(), null, null, 4, 11500)$$, 'P0001', 'invalid_request', 'a day is needed');
select throws_ok($$select public.apply_late_fees(tt.rq(1), tt.sx(), tt.today(), null, null, 11500)$$, 'P0001', 'invalid_request', 'the expected count is needed');
select throws_ok($$select public.apply_late_fees(tt.rq(1), tt.sx(), tt.today() - 1, null, 4, 11500)$$, 'P0001', 'preview_outdated', 'yesterday: the preview is outdated (the server decides the day)');
select throws_ok($$select public.apply_late_fees(tt.rq(1), tt.sx(), tt.today() + 1, null, 4, 11500)$$, 'P0001', 'preview_outdated', 'tomorrow: refused too');
select throws_ok($$select tt.apply(1, null, 4, 11501)$$, 'P0001', 'preview_outdated', 'the total is one kuruş different: outdated');
select throws_ok($$select tt.apply(1, null, 3, 11500)$$, 'P0001', 'preview_outdated', 'the count is different: outdated');
select throws_ok($$select tt.apply(1, array[3, 1], 2, 6667)$$, 'P0001', 'preview_outdated', 'a ticked debt that has no fee (the old carried debt) makes the numbers differ');
select throws_ok($$select public.apply_late_fees(tt.rq(1), tt.sx(), tt.today(), array[]::uuid[], 0, 0)$$, 'P0001', 'nothing_to_charge', 'nothing ticked (an empty list, not "all"): nothing to charge');
select is(tt.n_charges(), 9, 'no refusal wrote anything');
reset role;
select is((select count(*)::integer from public.charges where late_fee_source_id is not null), 0, '...no fee line yet');

-- the real run: L1 and L2 only
select pg_temp.act_as(tt.u('AD'));
select lives_ok($$select tt.apply(1, array[1, 2], 2, 7500)$$, 'the admin bills the two ticked lines (L1 + L2 = 75.00)');
reset role;
select is((select count(*)::integer from public.charge_batches where split_method = 'late_fee'), 1, 'one batch of the kind late_fee');
select is((select total from public.charge_batches where split_method = 'late_fee'), 75.00, '...its total is 75.00');
select is((select unit_count from public.charge_batches where split_method = 'late_fee'), 2, '...unit_count is the number of lines');
select is((select tenant_visible from public.charge_batches where request_id = tt.rq(1)), true, '...tenant_visible is true when every line is shown to tenants');
select ok((select b.due_date = tt.today() and b.site_id = tt.sx() and b.request_id = tt.rq(1) and b.created_by = tt.u('AD') and b.charge_type_id = tt.ty('gecikme_tazminati')
                  and b.description like 'Gecikme tazminatı hesabı · %' from public.charge_batches b where b.split_method = 'late_fee'),
  '...with today as its day, this site, the request id, the admin and the right type');
select is((select count(*)::integer from public.charges where late_fee_source_id is not null), 2, 'two fee lines');
select is((select amount from public.charges where late_fee_source_id = tt.cid(1)), 66.67, 'the fee line of L1 is 66.67');
select is((select amount from public.charges where late_fee_source_id = tt.cid(2)), 8.33, 'the fee line of L2 is 8.33');
select ok((select f.due_date = c.due_date and f.period is not distinct from c.period and f.tenant_visible = c.tenant_visible and f.unit_id = c.unit_id
                  and f.late_fee_through = tt.today() and f.created_by = tt.u('AD') and f.voided_at is null and f.charge_type_id = tt.ty('gecikme_tazminati')
             from public.charges f join public.charges c on c.id = f.late_fee_source_id where c.id = tt.cid(1)),
  'a fee line copies the due date, month, unit and visibility of its debt, and says up to which day it was calculated');
select ok((select description from public.charges where late_fee_source_id = tt.cid(1) order by created_at limit 1) like 'Gecikme tazminatı · Aidat · % · ' || to_char(tt.today(), 'DD.MM.YYYY') || ' itibarıyla', 'the description says what it is for and up to which day');
select is((select active_count from public.charge_batch_summary where batch_id = (select id from public.charge_batches where split_method = 'late_fee')), 2, 'the batch summary counts its two lines (so the screen shows no "changed" mark)');
select is((select amount from public.charges where id = tt.cid(1)), 1000.00, 'the debt itself is unchanged');
select pg_temp.act_as(tt.u('AD'));
select is(tt.apply(1, array[1, 2], 2, 7500), (select id from public.charge_batches where split_method = 'late_fee'), 'the same request id returns the same batch (double click)');
reset role;
select is((select count(*)::integer from public.charges where late_fee_source_id is not null), 2, '...and writes nothing more');
select pg_temp.act_as(tt.u('AY'));
select throws_ok($$select public.apply_late_fees(tt.rq(1), tt.sy(), tt.today(), null, 1, 6660)$$, 'P0001', 'request_id_used', 'a request id already used for another site is refused');
reset role;

-- what is left to bill, and "never twice"
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_n(), 2, 'now only L6 and L7 are left');
select is(tt.pv_sum(), 4000::bigint, '...13.33 + 26.67 = 40.00');
select ok(tt.pv_line(1) is null and tt.pv_line(2) is null, 'what was billed is not offered again');
select lives_ok($$select tt.apply(2, null, 2, 4000)$$, 'bill the rest (all lines: ids = null)');
select is((select tenant_visible from public.charge_batches where request_id = tt.rq(2)), false, '...and false when one of the lines (L6) is owner-only');
select is(tt.pv_n(), 0, 'nothing is left');
select throws_ok($$select tt.apply(3, null, 0, 0)$$, 'P0001', 'nothing_to_charge', 'a second run on the same day (new request id) bills nothing: no double billing');
select throws_ok($$select tt.apply(3, array[1, 2, 6, 7], 4, 11500)$$, 'P0001', 'nothing_to_charge', 'and a stale screen (the same lines ticked again) bills nothing either');
reset role;
select is((select count(*)::integer from public.charges where late_fee_source_id is not null), 4, 'four fee lines in all');
select is((select coalesce(sum(amount), 0) from public.charges where late_fee_source_id is not null), 115.00, 'together 115.00 = exactly what the preview showed');

-- ---------------------------------------------------------------------------
-- 5. Later runs, forgiving, undo, too-high fees, rules
-- ---------------------------------------------------------------------------
-- (a) time passes: L1 is now 50 days late (fee 83.33), 66.67 is billed: only the new 16.66 is due
update public.charges set due_date = tt.today() - 50 where id = tt.cid(1);
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_n(), 1, 'a later run lists only the debt that grew');
select is(tt.pv_line(1), 1666::bigint, '...and only its NEW part: 83.33 - 66.67 = 16.66');
select lives_ok($$select tt.apply(4, array[1], 1, 1666)$$, 'bill the new part');
reset role;
select is(tt.fee_sum(1), 83.33, 'L1 now has 83.33 in fee lines in all');
select is(tt.fee_cnt(1), 2, '...in two lines (one per run)');
-- (b) forgiven: a cancelled fee line is not charged again
select pg_temp.act_as(tt.u('AD'));
select lives_ok($$select public.void_charge((select id from public.charges where late_fee_source_id = tt.cid(2)), 'affedildi')$$, 'the admin cancels (forgives) the fee line of L2');
reset role;
update public.charges set due_date = tt.today() - 20 where id = tt.cid(2);   -- L2 is now 20 days late: fee 16.67, billed 8.33 (cancelled but counted)
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_line(2), 834::bigint, 'a cancelled fee line still counts as billed (forgiven): the new part is 16.67 - 8.33 = 8.34, not 16.67');
reset role;
update public.charges set due_date = tt.today() - 10 where id = tt.cid(2);
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_n(), 0, 'and with the old date the forgiven fee is not charged again');
-- (c) undo: deleting the batch (15 minutes) frees the lines again
select lives_ok($$select public.delete_charge_batch((select b.id from public.charge_batches b where b.request_id = tt.rq(2)))$$, 'the admin deletes the second batch (L6 + L7) within 15 minutes');
select is(tt.pv_n(), 2, 'the two lines are offered again');
select is(tt.pv_sum(), 4000::bigint, '...for the same 40.00');
reset role;
select is(tt.fee_cnt(6) + tt.fee_cnt(7), 0, 'no trace of the deleted run is left');
-- (d) a fee that was billed too high is shown, never taken back
insert into public.payments (id, unit_id, unit_label, amount, method, provider, receipt_no, paid_at)
values ('90000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'A Blok 1', 1000, 'cash', 'manual', 'MKB-2026-900002',
        ((tt.today() - 45) + time '12:00') at time zone 'Europe/Istanbul');
insert into public.payment_allocations (payment_id, charge_id, amount) values ('90000000-0000-0000-0000-000000000002', tt.cid(1), 1000);
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_over(1), -7500::bigint, 'L1 was paid in full 45 days ago (late days: 5): the right fee is 8.33, 83.33 is billed: 75.00 too high');
select ok(tt.pv_line(1) is null, 'a too-high fee is not in the list to bill');
select is(tt.pv_n(), 2, '...so the list still has L6 and L7');
select lives_ok($$select tt.apply(5, null, 2, 4000)$$, 'billing everything never touches the too-high line (and bills L6 + L7 again)');
reset role;
select is(tt.fee_sum(1), 83.33, 'L1 still has 83.33: nothing is taken back by itself');
update public.payments set status = 'voided', voided_at = now(), void_reason = 'iptal' where id = '90000000-0000-0000-0000-000000000002';
select pg_temp.act_as(tt.u('AD'));
select ok(tt.pv_over(1) is null and tt.pv_line(1) is null, 'a cancelled payment: the fee is right again (83.33), nothing too high');
reset role;
-- (e) the rules are read from the settings
update public.companies set settings = '{"rules":{"late_fee_rate":2,"late_fee_method":"monthly","grace_days":5}}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.line(12, 4, 'aidat', 100, -5, true, false, tt.b2());    -- 5 days late with grace 5: not late
select pg_temp.line(13, 4, 'aidat', 100, -6, true, false, tt.b2());    -- the first late day
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv() ->> 'method', 'monthly', 'the preview shows the saved method');
select is((tt.pv() ->> 'rate')::numeric, 2::numeric, '...rate');
select is((tt.pv() ->> 'grace_days')::integer, 5, '...and grace');
select ok(tt.pv_line(12) is null, 'grace 5: a line 5 days late is not late yet');
select is(tt.pv_line(13), 200::bigint, 'grace 5: a line 6 days late = one started month: 100 x 2 % = 2.00');
select is((select e ->> 'days' from jsonb_array_elements(tt.pv() -> 'lines') e where e ->> 'charge_id' = tt.cid(13)::text), '1', 'grace 5: the days shown start after the grace (1 late day, not 6)');
select is(jsonb_array_length(tt.pv() -> 'lines'), 2, 'under the new rules two lines have something to bill: L2 and L13');
select is(tt.pv_line(2), 167::bigint, 'L2 (monthly, 2 %): 500 x 2 % = 10.00, 8.33 is billed (the cancelled one counts): 1.67');
select is(tt.pv_over(1), -4333::bigint, 'L1: two started months of 1000 x 2 % = 40.00, but 83.33 is billed: 43.33 too high');
select is(tt.pv_over(6), -533::bigint, 'L6: 400 x 2 % = 8.00 against 13.33 billed: 5.33 too high');
select is(tt.pv_over(7), -1467::bigint, 'L7: the payment came after the second block, so 600 x 2 % = 12.00 against 26.67: 14.67 too high');
select is(jsonb_array_length(tt.pv() -> 'over'), 3, 'a lower rate shows the old fees as too high; nothing is changed by itself');
reset role;
delete from public.charges where id in (tt.cid(12), tt.cid(13));
update public.companies set settings = '{}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_n(), 0, 'back to the default rules: everything is billed, nothing is left');
reset role;
-- settings written by hand (SQL editor) cannot break the calculation: the same limits as the settings screen
update public.companies set settings = '{"rules":{"late_fee_rate":50,"late_fee_method":"weekly","grace_days":99}}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as(tt.u('AD'));
select is((tt.pv() ->> 'rate')::numeric, 10::numeric, 'a saved rate above 10 is read as 10');
select is(tt.pv() ->> 'method', 'daily', 'an unknown saved method is read as daily');
select is((tt.pv() ->> 'grace_days')::integer, 60, 'a saved grace above 60 is read as 60');
reset role;
update public.companies set settings = '{"rules":{"late_fee_rate":-3,"grace_days":-5}}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as(tt.u('AD'));
select is((tt.pv() ->> 'rate')::numeric, 0::numeric, 'a negative saved rate is read as 0');
select is((tt.pv() ->> 'grace_days')::integer, 0, 'a negative saved grace is read as 0');
reset role;
update public.companies set settings = '{"rules":{"late_fee_rate":"abc","grace_days":"x"}}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as(tt.u('AD'));
select is((tt.pv() ->> 'rate')::numeric, 5::numeric, 'a saved rate that is not a number is read as the default 5');
select is((tt.pv() ->> 'grace_days')::integer, 0, 'a saved grace that is not a number is read as 0');
reset role;
update public.companies set settings = '{}' where id = '10000000-0000-0000-0000-0000000000c1';

-- (f) the fee type must be there and in use
select pg_temp.line(14, 4, 'aidat', 100, -10, true, false, tt.b2());                 -- 10 days late: 100 x 10 x 5 / 3000 = 1.67
update public.charge_types set active = false where id = tt.ty('gecikme_tazminati');
select pg_temp.act_as(tt.u('AD'));
select is((tt.pv() ->> 'type_ready')::boolean, false, 'the preview says the fee type is switched off');
select throws_ok($$select tt.apply(6, array[14], 1, 167)$$, 'P0001', 'late_fee_type_missing', 'nothing can be billed while the type is switched off');
reset role;
update public.charge_types set active = true where id = tt.ty('gecikme_tazminati');
-- (g) an absurd amount is refused with a clear code, not with a database overflow
select pg_temp.line(20, 4, 'aidat', 9999999.99, -3000, true, false, tt.b2());
select pg_temp.act_as(tt.u('AD'));
select throws_ok($$select tt.apply(8, array[20], 1, (select tt.pv_line(20)))$$, 'P0001', 'amount_too_large', 'a run above 10 million is refused');
reset role;
delete from public.charges where id = tt.cid(20);

-- ---------------------------------------------------------------------------
-- 6. Who sees a fee line, and the bell
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('O2'));
select is((select count(*)::integer from public.charges where late_fee_source_id = tt.cid(6)), 1, 'the owner sees the fee for the owner-only debt');
reset role;
select pg_temp.act_as(tt.u('TN2'));
select is((select count(*)::integer from public.charges where late_fee_source_id = tt.cid(6)), 0, 'the tenant does not (the fee follows the debt)');
select is((select count(*)::integer from public.charges where id = tt.cid(6)), 0, '...he does not see the debt either');
reset role;
select pg_temp.act_as(tt.u('RS'));
select is((select count(*)::integer from public.charges where late_fee_source_id = tt.cid(1)), 2, 'the owner of unit 1 sees both fee lines of L1');
reset role;
select pg_temp.act_as(tt.u('TN1'));
select is((select count(*)::integer from public.charges where late_fee_source_id = tt.cid(1)), 2, 'the tenant of unit 1 sees them too (the debt is shown to tenants)');
reset role;
select pg_temp.act_as(tt.u('O3'));
select is((select count(*)::integer from public.charges where late_fee_source_id is not null and unit_id <> '40000000-0000-0000-0000-000000000003'), 0, 'a resident sees no fee line of another unit');
reset role;
select is((select count(*)::integer from public.notifications where profile_id = tt.u('O2') and kind = 'charge' and body like 'Gecikme tazminatı%'), 1, 'the owner of unit 2 got a bell for the fee');
select is((select count(*)::integer from public.notifications where profile_id = tt.u('TN2') and kind = 'charge' and body like 'Gecikme tazminatı%'), 0, 'the tenant got none');
select ok((select bool_and(body not like '%son ödeme%') from public.notifications where profile_id = tt.u('O2') and kind = 'charge' and body like 'Gecikme tazminatı%'),
  'the fee bell does not show an old "son ödeme" date');
select ok((select count(*) >= 1 from public.notifications where profile_id = tt.u('O2') and kind = 'charge' and body like 'Aidat%son ödeme%'),
  'an ordinary new debt still says "son ödeme" (the bell for normal debts did not change)');

-- ---------------------------------------------------------------------------
-- 7. A debt that has fee lines cannot just disappear
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AD'));
select throws_ok($$select public.void_charge(tt.cid(1), 'hatalı borç')$$, 'P0001', 'has_late_fees', 'a debt with live fee lines cannot be cancelled');
select lives_ok($$select tt.apply(7, array[14], 1, 167)$$, 'bill L14 (in batch 2)');
select throws_ok($$select public.void_charge_batch(tt.b2(), 'hatalı toplu borç')$$, 'P0001', 'has_late_fees', 'the batch it is in cannot be cancelled either');
select throws_ok($$select public.delete_charge_batch(tt.b2())$$, 'P0001', 'batch_has_late_fees', 'a batch whose debts have fee lines cannot be deleted (a clear code, not a database error)');
select throws_ok($$select public.void_charge(tt.cid(14), 'hatalı borç')$$, 'P0001', 'has_late_fees', 'L14 cannot be cancelled while its fee line is live');
select lives_ok($$select public.void_charge((select id from public.charges where late_fee_source_id = tt.cid(14)), 'affedildi')$$, 'the admin cancels (forgives) the fee line of L14');
select lives_ok($$select public.void_charge(tt.cid(14), 'hatalı borç')$$, 'now the debt itself can be cancelled');
select throws_ok($$select public.delete_charge_batch(tt.b2())$$, 'P0001', 'batch_has_late_fees', 'the batch still cannot be deleted: the cancelled fee line still points at its debt');
-- cancelling a whole fee batch = forgiving all of it
select lives_ok($$select public.void_charge_batch((select b.id from public.charge_batches b where b.request_id = tt.rq(1)), 'affedildi')$$, 'the admin cancels the first fee batch (L1 + L2)');
select is(tt.pv_n(), 0, '...and its fees are not charged again');
select is((select count(*)::integer from public.charges where late_fee_source_id = tt.cid(1) and voided_at is null), 1, 'L1 keeps its other (later) fee line');
reset role;
-- a batch whose debts only have FORGIVEN fee lines can be cancelled
insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible)
values ('d0000000-0000-0000-0000-000000000003', tt.sx(), tt.ty('aidat'), '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true);
select pg_temp.line(15, 4, 'aidat', 100, -10, true, false, 'd0000000-0000-0000-0000-000000000003');
select pg_temp.act_as(tt.u('AD'));
select lives_ok($$select tt.apply(9, array[15], 1, 167)$$, 'bill L15 (alone in batch 3)');
select lives_ok($$select public.void_charge((select id from public.charges where late_fee_source_id = tt.cid(15)), 'affedildi')$$, '...and forgive it');
select lives_ok($$select public.void_charge_batch('d0000000-0000-0000-0000-000000000003', 'hatalı toplu borç')$$, 'now the batch of that debt can be cancelled (forgiven fees do not block it)');
reset role;
-- the day of a payment is the ISTANBUL day: a payment at 00:30 local time is still that day (in UTC it would be the day before)
select pg_temp.line(16, 4, 'aidat', 100, -10, true, false, tt.b2());
insert into public.payments (id, unit_id, unit_label, amount, method, provider, receipt_no, paid_at)
values ('90000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'A Blok 4', 100, 'cash', 'manual', 'MKB-2026-900003',
        ((tt.today() - 3) + time '00:30') at time zone 'Europe/Istanbul');
insert into public.payment_allocations (payment_id, charge_id, amount) values ('90000000-0000-0000-0000-000000000003', tt.cid(16), 100);
select pg_temp.act_as(tt.u('AD'));
select is(tt.pv_line(16), 117::bigint, 'a payment at 00:30 Istanbul time counts for that day: 7 late days of 100 = 1.17 (not 6 days = 1.00)');
reset role;
-- a debt that has fee lines cannot be removed behind the functions' back either (the foreign key is the last guard)
select throws_ok($$delete from public.charges where id = tt.cid(1)$$, '23503', null, 'deleting a debt that has fee lines is stopped by the foreign key');
select ok(exists (select 1 from public.audit_log a where a.table_name = 'charges' and a.new_data ->> 'late_fee_source_id' is not null), 'the fee lines are in the audit log');

select * from finish();
rollback;
