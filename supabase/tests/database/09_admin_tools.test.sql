-- Database tests for 0009_admin_tools.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- Who is who (Firma 1 = Site X, Firma 2 = Site Y):
--   AA admin of Site X   A2 second admin of Site X   AB admin of Site Y
--   Unit A1 (Blok A): owner OA, co-owner OC, tenant TA, former tenant FT      Unit A2 (Blok A): owner OA2
--   Unit A3 (Blok A): nobody, no arsa payı      Unit B1 (Blok B): owner B1O      Unit A9: archived      Unit Y1 (Site Y): owner Y1O
--   S stranger (no unit)
--
-- The lines, in TL (due dates are relative to today so the buckets stay the same every day; M0 = this month, M1 = last month ...):
--   A1:  L1 10 (due today, M0)   L2 20 (+5, M0)   Lnull 200 (due today, NO period -> counts in M0)
--        L3 1 (-1, M1)   L4 2 (-30, M1)   L5 4 (-31, M2)   L6 8 (-60, M2)   L7 16 (-61, M3)   L8 32 (-90, M3)   L9 64 (-91, M3)
--        L10 1000 cancelled (M0: counts nowhere)
--   A2:  L11 5 (+3, M0)   L12 7 (+1, M0)        Y1: LY 999 (-5, M0)
-- The payments:
--   P_a    10  havale, last month (M1 + 10 days), closes L1
--   P_mid   5  cash, 00:30 Istanbul on the 1st of this month (that is still LAST month in UTC), closes L11
--   P_void  7  card, CANCELLED (its allocation row stays: it must count nowhere), L12
--   P_man  24  cash, today, typed by AA: the engine puts it on the oldest line L9 (a part payment)
--
-- Expected today:  A1 owes 323 = not due 220 (L2 + Lnull) + 1-30: 3 + 31-60: 12 + 61-90: 48 + over 90: 40 (L9 rest);  A2 owes 7.

begin;
create extension if not exists pgtap with schema extensions;
select plan(213);

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
-- the first day of the month, n months ago
create function tt.m(n integer) returns date language sql as $$ select (date_trunc('month', now() at time zone 'Europe/Istanbul') - make_interval(months => n))::date $$;
create function tt.u(p text) returns uuid language sql as $$
  select case p
    when 'AA' then 'a1000000-0000-0000-0000-000000000001' when 'AB' then 'a2000000-0000-0000-0000-000000000002' when 'A2' then 'a3000000-0000-0000-0000-000000000003'
    when 'OA' then 'b1000000-0000-0000-0000-000000000001' when 'OC' then 'b2000000-0000-0000-0000-000000000002' when 'TA' then 'b3000000-0000-0000-0000-000000000003'
    when 'FT' then 'b4000000-0000-0000-0000-000000000004' when 'OA2' then 'b5000000-0000-0000-0000-000000000005' when 'B1O' then 'b6000000-0000-0000-0000-000000000006'
    when 'Y1O' then 'b7000000-0000-0000-0000-000000000007' when 'S' then 'c1000000-0000-0000-0000-000000000001' end::uuid
$$;
create function tt.site(p text default 'X') returns uuid language sql as $$ select case p when 'X' then '20000000-0000-0000-0000-0000000000a1' else '20000000-0000-0000-0000-0000000000a2' end::uuid $$;
create function tt.company(p text default '1') returns uuid language sql as $$ select ('10000000-0000-0000-0000-0000000000c' || p)::uuid $$;
create function tt.unit(p text) returns uuid language sql as $$ select ('40000000-0000-0000-0000-0000000000' || p)::uuid $$;
create function tt.cid(n integer) returns uuid language sql as $$ select ('e1000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
-- one number from the KPI row of Site X (as the current user)
create function tt.kpi(p_col text) returns numeric language sql as $$ select (to_jsonb(k) ->> p_col)::numeric from public.dashboard_kpis(tt.site('X')) k $$;
-- the latest audit row of a table / action as json, WITHOUT the caller's row security
create function tt.last_audit(p_table text, p_action text) returns jsonb language sql security definer as $$
  select to_jsonb(a) from public.audit_log a where a.table_name = p_table and a.action = p_action order by a.id desc limit 1
$$;
create function tt.audit_n(p_table text, p_row text default null, p_action text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.audit_log a where a.table_name = p_table and (p_row is null or a.row_id = p_row) and (p_action is null or a.action = p_action)
$$;
-- the highest audit id right now: "rows after this mark" = rows made by the next statements
create function tt.mark() returns bigint language sql security definer as $$ select coalesce(max(id), 0) from public.audit_log $$;
create function tt.audit_since(p_mark bigint, p_table text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.audit_log a where a.id > p_mark and (p_table is null or a.table_name = p_table)
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{"full_name":"Admin A"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{"full_name":"Admin B"}'),
  ('a3000000-0000-0000-0000-000000000003', 'admin-x2@test.local', '{"full_name":"Admin X2"}'),
  ('b1000000-0000-0000-0000-000000000001', 'oa@test.local', '{"full_name":"Mehmet Malik"}'),
  ('b2000000-0000-0000-0000-000000000002', 'oc@test.local', '{"full_name":"Ortak Malik"}'),
  ('b3000000-0000-0000-0000-000000000003', 'ta@test.local', '{"full_name":"Kemal Kiracı"}'),
  ('b4000000-0000-0000-0000-000000000004', 'ft@test.local', '{"full_name":"Eski Kiracı"}'),
  ('b5000000-0000-0000-0000-000000000005', 'oa2@test.local', '{"full_name":"Dilek Diğer"}'),
  ('b6000000-0000-0000-0000-000000000006', 'b1o@test.local', '{"full_name":"Bora Malik"}'),
  ('b7000000-0000-0000-0000-000000000007', 'y1o@test.local', '{"full_name":"Başka Site"}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');
update public.profiles set phone = '0532 111 22 33' where id = tt.u('OA');
update public.profiles set phone = '0532 999 99 99' where id = tt.u('OC');

insert into public.companies (id, name, settings) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1', '{"payment_mode":"mock","future_key":"keep me","payment":{"extra":"keep me too"},"bank_accounts":[{"bank":"B","holder":"H","iban":"TR330006100519786457841326"}]}'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2', '{}');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site X'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site Y');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'A Blok'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a1', 'B Blok'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a2', 'Y Blok');
insert into public.units (id, block_id, door_no, land_share, archived_at) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '1', 100, null),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '2', 150, null),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '3', null, null),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '1', 50, null),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '9', 999, now()),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003', '1', 10, null);
insert into public.site_members (profile_id, site_id, role) values
  (tt.u('AA'), tt.site('X'), 'admin'), (tt.u('A2'), tt.site('X'), 'admin'), (tt.u('AB'), tt.site('Y'), 'admin');
insert into public.unit_residents (unit_id, profile_id, relation, start_date, end_date) values
  (tt.unit('01'), tt.u('OA'), 'owner',  tt.today() - 400, null),
  (tt.unit('01'), tt.u('OC'), 'owner',  tt.today() - 400, null),
  (tt.unit('01'), tt.u('TA'), 'tenant', tt.today() - 90,  null),
  (tt.unit('01'), tt.u('FT'), 'tenant', tt.today() - 300, tt.today() - 100),
  (tt.unit('02'), tt.u('OA2'), 'owner', tt.today() - 400, null),
  (tt.unit('04'), tt.u('B1O'), 'owner', tt.today() - 400, null),
  (tt.unit('05'), tt.u('OA2'), 'owner', tt.today() - 400, null),   -- the archived unit: must not appear in the lists
  (tt.unit('06'), tt.u('Y1O'), 'owner', tt.today() - 400, null);

insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible)
select 'd0000000-0000-0000-0000-000000000001', tt.site('X'), t.id, '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true
  from public.charge_types t where t.company_id = tt.company('1') and t.code = 'aidat';
insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible)
select 'd0000000-0000-0000-0000-000000000002', tt.site('Y'), t.id, '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true
  from public.charge_types t where t.company_id = tt.company('2') and t.code = 'aidat';

create function pg_temp.line(p_n integer, p_unit text, p_amount numeric, p_due integer, p_period date, p_batch text default '1') returns void language sql as $$
  insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period, created_at)
  select tt.cid(p_n), tt.unit(p_unit), t.id, ('d0000000-0000-0000-0000-00000000000' || p_batch)::uuid, p_amount, tt.today() + p_due, true, p_period, timestamptz '2026-01-01' + p_n * interval '1 minute'
    from public.charge_types t
   where t.code = 'aidat' and t.company_id = (case when p_batch = '1' then tt.company('1') else tt.company('2') end);
$$;
select pg_temp.line(1, '01', 10, 0, tt.m(0));
select pg_temp.line(2, '01', 20, 5, tt.m(0));
select pg_temp.line(3, '01', 1, -1, tt.m(1));
select pg_temp.line(4, '01', 2, -30, tt.m(1));
select pg_temp.line(5, '01', 4, -31, tt.m(2));
select pg_temp.line(6, '01', 8, -60, tt.m(2));
select pg_temp.line(7, '01', 16, -61, tt.m(3));
select pg_temp.line(8, '01', 32, -90, tt.m(3));
select pg_temp.line(9, '01', 64, -91, tt.m(3));
select pg_temp.line(11, '02', 5, 3, tt.m(0));
select pg_temp.line(12, '02', 7, 1, tt.m(0));
select pg_temp.line(13, '01', 200, 0, null);     -- Lnull: no period
select pg_temp.line(14, '06', 999, -5, tt.m(0), '2');
-- L10: a cancelled line
select pg_temp.line(10, '01', 1000, 0, tt.m(0));
update public.charges set voided_at = now(), void_reason = 'Yanlış girildi' where id = tt.cid(10);

-- payments (P_a, P_mid, P_void) written directly; P_man goes through the real function below
insert into public.payments (id, unit_id, payer_name, unit_label, amount, method, status, provider, paid_at, receipt_no, voided_at, void_reason)
values
  ('f1000000-0000-0000-0000-000000000001', tt.unit('01'), 'Mehmet Malik', 'Blok A · 1', 10, 'havale', 'approved', 'manual', ((tt.m(1) + 10)::timestamp + interval '12 hours') at time zone 'Europe/Istanbul', private.next_receipt_no(now()), null, null),
  ('f1000000-0000-0000-0000-000000000002', tt.unit('02'), 'Dilek Diğer', 'Blok A · 2', 5, 'cash', 'approved', 'manual', (tt.m(0)::timestamp + interval '30 minutes') at time zone 'Europe/Istanbul', private.next_receipt_no(now()), null, null),
  ('f1000000-0000-0000-0000-000000000003', tt.unit('02'), 'Dilek Diğer', 'Blok A · 2', 7, 'card', 'voided', 'mock', now(), private.next_receipt_no(now()), now(), 'İptal edildi');
insert into public.payment_allocations (payment_id, charge_id, amount) values
  ('f1000000-0000-0000-0000-000000000001', tt.cid(1), 10),
  ('f1000000-0000-0000-0000-000000000002', tt.cid(11), 5),
  ('f1000000-0000-0000-0000-000000000003', tt.cid(12), 7);
select pg_temp.act_as(tt.u('AA'));
select public.record_manual_payment('f2000000-0000-0000-0000-000000000001', tt.unit('01'), null, 'Mehmet Malik', 'cash', 2400, tt.today(), null, 'kısmi ödeme');
reset role; select set_config('request.jwt.claims', '', true);

-- a waiting and a rejected havale notice (unit A1), three requests (two open, one closed)
insert into public.transfer_notices (unit_id, profile_id, amount, sent_on, sender_name, file_path, status, request_id, reviewed_at, reject_reason) values
  (tt.unit('01'), tt.u('TA'), 100, tt.today(), 'Kemal Kiracı', tt.unit('01') || '/aaaaaaaa-aaaa-aaaa-aaaa-000000000001.pdf', 'pending', 'f3000000-0000-0000-0000-000000000001', null, null),
  (tt.unit('01'), tt.u('TA'), 50, tt.today(), 'Kemal Kiracı', tt.unit('01') || '/aaaaaaaa-aaaa-aaaa-aaaa-000000000002.pdf', 'rejected', 'f3000000-0000-0000-0000-000000000002', now(), 'Tutar geçmedi');
insert into public.requests (site_id, unit_id, requester_id, created_by, category, title, description, status, token) values
  (tt.site('X'), tt.unit('01'), tt.u('TA'), tt.u('TA'), 'asansor', 'Açık talep', 'Metin', 'acik', 'f4000000-0000-0000-0000-000000000001'),
  (tt.site('X'), tt.unit('02'), tt.u('OA2'), tt.u('OA2'), 'elektrik', 'İşlemdeki talep', 'Metin', 'islemde', 'f4000000-0000-0000-0000-000000000002'),
  (tt.site('X'), tt.unit('01'), tt.u('TA'), tt.u('TA'), 'temizlik', 'Kapanmış talep', 'Metin', 'kapandi', 'f4000000-0000-0000-0000-000000000003');

-- ---------------------------------------------------------------------------
-- 1. Structure and permissions
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'audit_log has row security');
select ok(not has_any_column_privilege('authenticated', 'public.audit_log', 'insert') and not has_any_column_privilege('authenticated', 'public.audit_log', 'update')
      and not has_table_privilege('authenticated', 'public.audit_log', 'delete') and not has_table_privilege('authenticated', 'public.audit_log', 'truncate'),
  'nobody writes, changes or deletes the log from a browser (column grants checked too)');
select ok(not has_any_column_privilege('anon', 'public.audit_log', 'select') and not has_any_column_privilege('anon', 'public.audit_log', 'insert'), 'a visitor reads and writes nothing');
select ok(not has_function_privilege('authenticated', 'private.audit_row()', 'execute') and not has_function_privilege('authenticated', 'private.audit_clean(jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'private.audit_log_frozen()', 'execute') and not has_function_privilege('authenticated', 'private.site_lines(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'private.protected_charge_code(text)', 'execute') and not has_function_privilege('authenticated', 'private.new_charge_code(uuid, text)', 'execute'),
  'the internal functions cannot be called from a browser');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                       and p.proname in ('dashboard_kpis', 'report_monthly', 'report_debts', 'report_collections', 'report_collections_summary', 'report_residents', 'report_attendance',
                                         'save_company_settings', 'save_charge_type', 'delete_charge_type')
                       and has_function_privilege('anon', p.oid, 'execute')),
  'a visitor can execute none of the ten new functions');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
            and p.proname in ('dashboard_kpis', 'report_monthly', 'report_debts', 'report_collections', 'report_collections_summary', 'report_residents', 'report_attendance',
                              'save_company_settings', 'save_charge_type', 'delete_charge_type')
            and p.prosecdef and p.proconfig::text = '{"search_path=\"\""}' and has_function_privilege('authenticated', p.oid, 'execute')), 10,
  'all ten are security definer with an empty search_path and open to logged-in people');
select is((select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'zz_audit' and not t.tgisinternal and c.relnamespace = 'public'::regnamespace), 12,
  'twelve tables have the audit trigger');
select is((select string_agg(c.relname, ',' order by c.relname collate "C") from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'zz_audit' and not t.tgisinternal),
  'announcements,charge_batches,charge_types,charges,companies,payments,recurring_plans,requests,site_members,transfer_notices,unit_residents,units', '...exactly these');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'audit_log'), 1, 'one read policy on the log and nothing else');
select is((select string_agg(conname || ':' || pg_get_constraintdef(oid), ' ') from pg_constraint where conrelid = 'public.quote_requests'::regclass and conname = 'quote_requests_status_check'),
  'quote_requests_status_check:CHECK ((status = ANY (ARRAY[''new''::text, ''contacted''::text, ''offered''::text, ''won''::text, ''lost''::text, ''closed''::text])))', 'the quote request statuses: the five of the plan, and the old ones stay valid');

-- ---------------------------------------------------------------------------
-- 2. Who may call the reports and the dashboard
-- ---------------------------------------------------------------------------
create function tt.denied_all() returns text language plpgsql as $$
declare
  r text := '';
  calls text[] := array[
    'select * from public.dashboard_kpis(tt.site())',
    'select * from public.report_monthly(tt.site(), tt.m(1), tt.m(0))',
    'select * from public.report_debts(tt.site(), null)',
    'select * from public.report_collections(tt.site(), tt.m(1), tt.today(), null)',
    'select * from public.report_collections_summary(tt.site(), tt.m(1), tt.today())',
    'select * from public.report_residents(tt.site())',
    'select * from public.report_attendance(tt.site())'];
  c text;
begin
  foreach c in array calls loop
    begin
      execute c;
      r := r || 'OPEN:' || left(c, 40) || ' ';
    exception when others then
      if sqlstate not in ('42501') then r := r || 'WRONG(' || sqlstate || '):' || left(c, 40) || ' '; end if;
    end;
  end loop;
  return r;
end; $$;
select pg_temp.act_as_visitor();
select is(tt.denied_all(), '', 'a visitor is refused by all seven reports');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('OA'));
select is(tt.denied_all(), '', 'a resident (even an owner) is refused by all seven');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('S'));
select is(tt.denied_all(), '', 'a stranger is refused by all seven');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select is(tt.denied_all(), '', 'the admin of ANOTHER site is refused by all seven');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select * from public.dashboard_kpis(null)$$, '42501', 'not allowed', 'no site is refused');
select throws_ok($$select * from public.report_debts('99999999-9999-9999-9999-999999999999', null)$$, '42501', 'not allowed', 'an unknown site is refused (the same answer)');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 3. The dashboard numbers
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is(tt.kpi('accrued'), 242::numeric, 'tahakkuk of this month: L1 10 + L2 20 + Lnull 200 (no period: month of its due date) + L11 5 + L12 7 = 242; the cancelled L10 (1000) is not in it');
select is(tt.kpi('collected'), 29::numeric, 'tahsil edilen this month (cash): P_man 24 + P_mid 5 (00:30 Istanbul on the 1st, last month in UTC) = 29; P_a is last month, P_void is cancelled');
select is(tt.kpi('collected_for_month'), 15::numeric, 'paid of this month''s lines: L1 10 + L11 5 = 15 (L12''s payment was cancelled)');
select is(tt.kpi('rate_pct'), 6.2::numeric, 'the rate: 15 / 242 = 6.2 %');
select is(tt.kpi('receivable'), 330::numeric, 'toplam alacak: 323 (A1) + 7 (A2) = 330. The cancelled line and Site Y''s line are not in it');
select is(tt.kpi('overdue_units'), 1::numeric, 'gecikmiş daire: only A1 (A2''s lines are not due yet)');
select is(tt.kpi('overdue_amount'), 103::numeric, 'overdue amount: 3 + 12 + 48 + 40 = 103');
select is(tt.kpi('pending_notices'), 1::numeric, 'bekleyen havale: one waiting (the rejected one is not counted)');
select is(tt.kpi('open_requests'), 2::numeric, 'açık talep: two (the closed one is not counted)');
select is((select k.month from public.dashboard_kpis(tt.site('X')) k), tt.m(0), 'the month is this month (Istanbul)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select is((select (k.accrued, k.collected, k.receivable, k.overdue_units, k.pending_notices, k.open_requests)::text from public.dashboard_kpis(tt.site('Y')) k), '(999.00,0,999.00,1,0,0)', 'Site Y has its own numbers (nothing of Site X leaks in)');
reset role; select set_config('request.jwt.claims', '', true);
-- a site with nothing: no division by zero, an empty rate
insert into public.sites (id, company_id, name) values ('20000000-0000-0000-0000-0000000000a3', tt.company('1'), 'Site Z');
insert into public.site_members (profile_id, site_id, role) values (tt.u('AA'), '20000000-0000-0000-0000-0000000000a3', 'admin');
select pg_temp.act_as(tt.u('AA'));
select is((select (k.accrued, k.collected, k.rate_pct is null, k.receivable, k.overdue_units, k.pending_notices, k.open_requests)::text from public.dashboard_kpis('20000000-0000-0000-0000-0000000000a3') k), '(0,0,t,0,0,0,0)', 'an empty site: zeros, and no rate (not an error)');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 4. Month by month
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is((select string_agg(r.month::text || '|' || r.accrued::numeric(14,2) || '|' || r.collected::numeric(14,2) || '|' || r.collected_for_month::numeric(14,2) || '|' || coalesce(r.rate_pct::text, '-'), ' ' order by r.month)
             from public.report_monthly(tt.site('X'), tt.m(3), tt.m(0)) r),
  tt.m(3)::text || '|112.00|0.00|24.00|21.4 ' || tt.m(2)::text || '|12.00|0.00|0.00|0.0 ' || tt.m(1)::text || '|3.00|10.00|0.00|0.0 ' || tt.m(0)::text || '|242.00|29.00|15.00|6.2',
  'four months: M3 accrued 112 (24 paid on L9: rate 21.4), M2 12, M1 3 (cash 10: P_a), M0 242 (cash 29, 15 paid, 6.2 %)');
select is((select count(*)::int from public.report_monthly(tt.site('X'), tt.m(0) + 10, tt.m(0) + 12)), 1, 'any day of the month is taken as that month');
select is((select count(*)::int from public.report_monthly(tt.site('X'), tt.m(2), tt.m(0)) r where r.accrued = 0 and r.collected = 0), 0, 'months with data have no empty rows (control)');
select is((select r.accrued from public.report_monthly(tt.site('X'), tt.m(8), tt.m(8)) r), 0::numeric, 'a month with nothing is a row of zeros, not a missing row');
select throws_ok($$select * from public.report_monthly(tt.site('X'), tt.m(0), tt.m(1))$$, 'P0001', 'range_invalid', 'the end before the start is refused');
select throws_ok($$select * from public.report_monthly(tt.site('X'), null, tt.m(1))$$, 'P0001', 'range_invalid', 'no start is refused');
select throws_ok($$select * from public.report_monthly(tt.site('X'), tt.m(60), tt.m(0))$$, 'P0001', 'range_invalid', 'more than 60 months is refused');
select lives_ok($$select * from public.report_monthly(tt.site('X'), tt.m(59), tt.m(0))$$, '...exactly 60 months is fine');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 5. Debts with aging
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::int from public.report_debts(tt.site('X'), null)), 2, 'two units owe money (A1 and A2); B1, A3 and the archived unit do not');
select is((select (d.unit_label, d.owners, d.phone, d.balance, d.not_due, d.d1_30, d.d31_60, d.d61_90, d.d90_plus)::text from public.report_debts(tt.site('X'), null) d where d.door_no = '1' and d.block_name = 'A Blok'),
  '("A Blok · 1","Mehmet Malik, Ortak Malik","0532 111 22 33",323.00,220.00,3.00,12.00,48.00,40.00)',
  'A1: 323 = not yet due 220 + 1-30: 3 + 31-60: 12 + 61-90: 48 + over 90: 40 (L9 64 minus the 24 part payment); co-owners joined, the first owner''s phone');
select is((select (d.balance, d.not_due, d.d1_30, d.d31_60, d.d61_90, d.d90_plus)::text from public.report_debts(tt.site('X'), null) d where d.door_no = '2'), '(7.00,7.00,0,0,0,0)', 'A2: 7, not yet due (the cancelled payment closed nothing)');
select is((select string_agg(d.unit_label, ',' order by d.balance desc) from public.report_debts(tt.site('X'), null) d), 'A Blok · 1,A Blok · 2', 'the biggest debt first');
select is((select count(*)::int from public.report_debts(tt.site('X'), 1)), 1, 'the limit cuts the list');
select is((select d.unit_label from public.report_debts(tt.site('X'), 1) d), 'A Blok · 1', '...and keeps the biggest');
select is((select count(*)::int from public.report_debts(tt.site('X'), 100000)), 2, 'a huge limit is capped (no error)');
select is((select (d.balance = d.not_due + d.d1_30 + d.d31_60 + d.d61_90 + d.d90_plus)::text from public.report_debts(tt.site('X'), null) d where d.door_no = '1' and d.block_name = 'A Blok'), 'true', 'the buckets add up to the balance');
reset role; select set_config('request.jwt.claims', '', true);
-- bucket boundaries, one line each, in a fresh unit: 0 (today) -> not due, 1 and 30 -> 1-30, 31 and 60 -> 31-60, 61 and 90 -> 61-90, 91 -> over 90
insert into public.units (id, block_id, door_no) values ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000002', '77');
insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period)
select ('e2000000-0000-0000-0000-0000000000' || lpad(g.n::text, 2, '0'))::uuid, tt.unit('07'), t.id, 'd0000000-0000-0000-0000-000000000001', 1, tt.today() - g.d, true, tt.m(0)
  from (values (1, -3), (2, 0), (3, 1), (4, 30), (5, 31), (6, 60), (7, 61), (8, 90), (9, 91)) g(n, d)
  cross join (select id from public.charge_types where company_id = tt.company('1') and code = 'aidat') t;
select pg_temp.act_as(tt.u('AA'));
select is((select (d.balance, d.not_due, d.d1_30, d.d31_60, d.d61_90, d.d90_plus)::text from public.report_debts(tt.site('X'), null) d where d.door_no = '77'),
  '(9.00,2.00,2.00,2.00,2.00,1.00)', 'boundary days: -3 and 0 -> not due (2), 1 and 30 -> 1-30 (2), 31 and 60 -> 31-60 (2), 61 and 90 -> 61-90 (2), 91 -> over 90 (1)');
select is((select d.owners is null from public.report_debts(tt.site('X'), null) d where d.door_no = '77'), true, 'a unit without a recorded owner is still listed (owners empty)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select is((select string_agg(d.unit_label || '=' || d.balance, ',') from public.report_debts(tt.site('Y'), null) d), 'Y Blok · 1=999.00', 'Site Y sees only its own debt');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 6. Collections
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::int from public.report_collections(tt.site('X'), tt.m(1), tt.today(), null)), 3, 'three approved payments since the start of last month (P_a, P_mid, P_man); the cancelled one is not listed');
select is((select string_agg(r.method || '=' || r.amount, ',' order by r.paid_at) from public.report_collections(tt.site('X'), tt.m(1), tt.today(), null) r), 'havale=10.00,cash=5.00,cash=24.00', 'in time order: P_a, P_mid, P_man');
select is((select count(*)::int from public.report_collections(tt.site('X'), tt.m(1), tt.m(0) - 1, null)), 1, 'the last day of last month ends BEFORE the 00:30 payment of the 1st (Istanbul days, not UTC)');
select is((select r.method from public.report_collections(tt.site('X'), tt.m(1), tt.m(0) - 1, null) r), 'havale', '...it is P_a');
select is((select count(*)::int from public.report_collections(tt.site('X'), tt.m(0), tt.m(0), null) r where r.amount = 5), 1, 'the first day of this month includes the 00:30 payment (it is the 1st in Istanbul although it is the 31st in UTC)');
select is((select count(*)::int from public.report_collections(tt.site('X'), tt.m(1), tt.today(), 2)), 2, 'the limit cuts the list');
select is((select r.receipt_no ~ '^MKB-[0-9]{4}-[0-9]{6}$' and r.unit_label = 'A Blok · 1' and r.payer_name = 'Mehmet Malik' and r.fee = 0 from public.report_collections(tt.site('X'), tt.today(), tt.today(), null) r where r.amount = 24), true, 'a row carries the receipt number, the unit, the payer and the fee');
select is((select string_agg(coalesce(s.method, 'TOTAL') || ':' || s.payment_count || ':' || s.amount || ':' || s.fee, ',' order by s.method nulls last) from public.report_collections_summary(tt.site('X'), tt.m(1), tt.today()) s),
  'cash:2:29.00:0.00,havale:1:10.00:0.00,TOTAL:3:39.00:0.00', 'the summary by method with the total last: cash 2 / 29, havale 1 / 10, total 3 / 39');
select throws_ok($$select * from public.report_collections(tt.site('X'), tt.today(), tt.today() - 1, null)$$, 'P0001', 'range_invalid', 'the end before the start is refused');
select throws_ok($$select * from public.report_collections(tt.site('X'), tt.today() - 1101, tt.today(), null)$$, 'P0001', 'range_invalid', 'more than 1100 days is refused');
select throws_ok($$select * from public.report_collections_summary(tt.site('X'), null, tt.today())$$, 'P0001', 'range_invalid', '...and no start date');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select is((select count(*)::int from public.report_collections(tt.site('Y'), tt.m(1), tt.today(), null)), 0, 'Site Y has no payment and sees none of Site X''s');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 7. Residents
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::int from public.report_residents(tt.site('X'))), 5, 'five people live in the units today: OA, OC, TA (A1), OA2 (A2), B1O (B1)');
select is((select string_agg(r.full_name, ',' order by r.full_name collate "C") from public.report_residents(tt.site('X')) r), 'Bora Malik,Dilek Diğer,Kemal Kiracı,Mehmet Malik,Ortak Malik', 'the former tenant, the archived unit and Site Y are not in it');
select is((select (r.relation, r.phone, r.land_share)::text from public.report_residents(tt.site('X')) r where r.full_name = 'Mehmet Malik'), '(owner,"0532 111 22 33",100.0000)', 'a row has the relation, phone and arsa payı');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 8. Hazirun cetveli
-- ---------------------------------------------------------------------------
select pg_temp.act_as(tt.u('AA'));
select is((select count(*)::int from public.report_attendance(tt.site('X'))), 5, 'ONE row per unit: A1, A2, A3, B1 and the unit 77 of the boundary test (the archived unit is not listed)');
select is((select string_agg(a.block_name || ' ' || a.door_no, ',' order by a.block_name collate "C", a.door_no collate "C") from public.report_attendance(tt.site('X')) a), 'A Blok 1,A Blok 2,A Blok 3,B Blok 1,B Blok 77', 'in order, co-owners do not make a second row');
select is((select a.owners from public.report_attendance(tt.site('X')) a where a.door_no = '1' and a.block_name = 'A Blok'), 'Mehmet Malik, Ortak Malik', 'the two owners of A1 are joined in one cell');
select is((select (a.land_share, a.share_pct, a.total_land_share, a.unit_count)::text from public.report_attendance(tt.site('X')) a where a.door_no = '1' and a.block_name = 'A Blok'), '(100.0000,33.3333,300.0000,5)', 'the land share is counted ONCE (100 of 300 = 33.3333 %), not twice for two owners');
select is((select (a.owners is null, a.land_share, a.share_pct)::text from public.report_attendance(tt.site('X')) a where a.door_no = '3'), '(t,0,0.0000)', 'a unit without an owner and without a share is still on the sheet');
select is((select round(sum(a.share_pct), 4) from public.report_attendance(tt.site('X')) a), 100.0000, 'the shares add up to 100 %');
reset role; select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 9. Company settings
-- ---------------------------------------------------------------------------
create function tt.save(p_company text default '1', p_ydo numeric default 25.49, p_payer text default 'management', p_fee jsonb default '{}', p_day integer default 15,
                        p_rate numeric default 5, p_method text default 'daily', p_grace integer default 0) returns void language sql as $$
  select public.save_company_settings(tt.company(p_company), p_ydo, p_payer, p_fee, p_day, p_rate, p_method, p_grace)
$$;
select pg_temp.act_as_visitor();
select throws_ok($$select tt.save()$$, '42501', null, 'a visitor cannot save settings');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select tt.save()$$, '42501', 'not allowed', 'a resident cannot');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select tt.save('1')$$, '42501', 'not allowed', 'the admin of ANOTHER company cannot change this company''s settings');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select tt.save(p_ydo => -1)$$, 'P0001', 'ydo_invalid', 'YDO below 0 is refused');
select throws_ok($$select tt.save(p_ydo => 100.01)$$, 'P0001', 'ydo_invalid', '...above 100');
select throws_ok($$select tt.save(p_ydo => null)$$, 'P0001', 'ydo_invalid', '...and none');
select throws_ok($$select tt.save(p_payer => 'nobody')$$, 'P0001', 'commission_invalid', 'a strange commission payer is refused');
select throws_ok($$select tt.save(p_fee => '[1,2]')$$, 'P0001', 'fee_invalid', 'fees must be an object');
select throws_ok($$select tt.save(p_fee => '{"4": 2}')$$, 'P0001', 'fee_invalid', 'a fee for 4 installments is refused (only 2, 3, 6, 9)');
select throws_ok($$select tt.save(p_fee => '{"2": "2.5"}')$$, 'P0001', 'fee_invalid', 'a fee as text is refused');
select throws_ok($$select tt.save(p_fee => '{"2": 10.01}')$$, 'P0001', 'fee_invalid', 'a fee above 10 % is refused');
select throws_ok($$select tt.save(p_fee => '{"3": -1}')$$, 'P0001', 'fee_invalid', '...or below 0');
select throws_ok($$select tt.save(p_day => 0)$$, 'P0001', 'due_day_invalid', 'a due day of 0 is refused');
select throws_ok($$select tt.save(p_day => 29)$$, 'P0001', 'due_day_invalid', '...and 29 (not every month has it)');
select throws_ok($$select tt.save(p_rate => 10.5)$$, 'P0001', 'late_fee_invalid', 'a late fee above 10 % is refused');
select throws_ok($$select tt.save(p_method => 'weekly')$$, 'P0001', 'late_fee_method_invalid', 'a strange late fee method is refused');
select throws_ok($$select tt.save(p_grace => 61)$$, 'P0001', 'grace_invalid', 'more than 60 grace days are refused');
select throws_ok($$select tt.save(p_grace => -1)$$, 'P0001', 'grace_invalid', '...or negative');
reset role; select set_config('request.jwt.claims', '', true);
select is((select settings ->> 'ydo_rate' from public.companies where id = tt.company('1')), null, 'nothing was saved by any refusal');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select tt.save(p_ydo => 12.345, p_payer => 'resident', p_fee => '{"2": 2.5, "3": 3.456, "9": 0}', p_day => 20, p_rate => 5, p_method => 'monthly', p_grace => 7)$$, 'a good save works');
reset role; select set_config('request.jwt.claims', '', true);
select is((select settings -> 'rules' from public.companies where id = tt.company('1')), '{"due_day": 20, "grace_days": 7, "late_fee_rate": 5.00, "late_fee_method": "monthly"}'::jsonb, 'the rules are stored');
select is((select settings ->> 'ydo_rate' from public.companies where id = tt.company('1')), '12.35', 'YDO is rounded to two decimals');
select is((select settings -> 'payment' -> 'fee_pct' from public.companies where id = tt.company('1')), '{"2": 2.50, "3": 3.46, "9": 0.00}'::jsonb, 'fees are rounded to two decimals');
select is((select settings ->> 'payment_mode' from public.companies where id = tt.company('1')), 'mock', 'payment_mode (the safety switch) is untouched');
select is((select settings ->> 'future_key' from public.companies where id = tt.company('1')), 'keep me', 'a key this version does not know is kept');
select is((select settings -> 'payment' ->> 'extra' from public.companies where id = tt.company('1')), 'keep me too', '...also inside "payment"');
select is((select settings -> 'bank_accounts' -> 0 ->> 'iban' from public.companies where id = tt.company('1')), 'TR330006100519786457841326', 'the bank accounts are untouched');
select is(private.company_ydo(tt.company('1')), 12.35, 'the aidat warning now uses the new YDO (live)');
select is(private.payment_fee(tt.company('1'), 100000, 2), 2500::bigint, 'the card fee now follows the settings: 2.5 % of 1000 TL for 2 installments = 25 TL (live)');
select is(private.payment_fee(tt.company('1'), 100000, 3), 3460::bigint, '...3.46 % for 3');
select is(private.payment_fee(tt.company('1'), 100000, 6), 0::bigint, '...nothing for an installment count with no fee');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select tt.save(p_payer => 'management')$$, 'saving again with "management" pays the fee itself');
reset role; select set_config('request.jwt.claims', '', true);
select is(private.payment_fee(tt.company('1'), 100000, 2), 0::bigint, '...the resident pays nothing');
select is((select settings ->> 'payment_mode' from public.companies where id = tt.company('1')), 'mock', 'payment_mode is still untouched');

-- ---------------------------------------------------------------------------
-- 10. Charge types
-- ---------------------------------------------------------------------------
create function tt.type_id(p_code text) returns uuid language sql security definer as $$ select id from public.charge_types where company_id = tt.company('1') and code = p_code $$;
create function tt.newtype(p_name text, p_id uuid default null, p_active boolean default true) returns uuid language sql as $$
  select public.save_charge_type(tt.company('1'), p_id, p_name, true, 'equal', p_active, 7)
$$;
select pg_temp.act_as_visitor();
select throws_ok($$select tt.newtype('Deneme')$$, '42501', null, 'a visitor cannot add a charge type');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('OA'));
select throws_ok($$select tt.newtype('Deneme')$$, '42501', 'not allowed', 'a resident cannot');
select throws_ok($$select public.delete_charge_type(tt.type_id('aidat'))$$, '42501', 'not allowed', '...or delete one');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select tt.newtype('Deneme')$$, '42501', 'not allowed', 'the admin of ANOTHER company cannot add a type to this company');
select throws_ok($$select public.delete_charge_type(tt.type_id('aidat'))$$, '42501', 'not allowed', '...or delete one');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select tt.newtype('  ')$$, 'P0001', 'name_invalid', 'an empty name is refused');
select throws_ok($$select tt.newtype(repeat('a', 101))$$, 'P0001', 'name_invalid', '...and 101 letters');
select throws_ok($$select public.save_charge_type(tt.company('1'), null, 'Deneme', true, 'weekly', true, 1)$$, 'P0001', 'split_invalid', 'a strange split is refused');
select throws_ok($$select public.save_charge_type(tt.company('1'), null, 'Deneme', true, 'equal', true, 1000)$$, 'P0001', 'invalid_request', 'a sort number above 999 is refused');
select throws_ok($$select tt.newtype('aidat')$$, 'P0001', 'name_used', 'a name that exists (any case) is refused');
select throws_ok($$select tt.newtype('AIDAT')$$, 'P0001', 'name_used', '...also with a different case');
select isnt(tt.newtype('Çatı Tamiri'), null, 'a new type is made');
reset role; select set_config('request.jwt.claims', '', true);
select is((select code from public.charge_types where company_id = tt.company('1') and name = 'Çatı Tamiri'), 'cati_tamiri', 'its code is made from the name (Turkish letters turned into plain ones)');
select pg_temp.act_as(tt.u('AA'));
select isnt(tt.newtype('Cati Tamiri!'), null, 'another type whose code would be the same ...');
reset role; select set_config('request.jwt.claims', '', true);
select is((select code from public.charge_types where company_id = tt.company('1') and name = 'Cati Tamiri!'), 'cati_tamiri_2', '...gets a number');
select pg_temp.act_as(tt.u('AA'));
select isnt(tt.newtype('123'), null, 'a name that starts with a digit');
reset role; select set_config('request.jwt.claims', '', true);
select is((select code from public.charge_types where company_id = tt.company('1') and name = '123'), 'tur_123', '...gets a letter first (the code rule needs one)');
select is((select (tenant_visible_default, default_split, active, sort_order)::text from public.charge_types where company_id = tt.company('1') and code = 'cati_tamiri'), '(t,equal,t,7)', 'the options are stored');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('cati_tamiri'), 'Çatı Onarımı', false, 'gross_m2', true, 3)$$, 'a type can be renamed and changed');
reset role; select set_config('request.jwt.claims', '', true);
select is((select (name, code, tenant_visible_default, default_split, sort_order)::text from public.charge_types where id = tt.type_id('cati_tamiri')), '("Çatı Onarımı",cati_tamiri,f,gross_m2,3)', '...the code stays');
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('cati_tamiri'), 'Aidat', false, 'gross_m2', true, 3)$$, 'P0001', 'name_used', 'renaming onto another type''s name is refused');
select lives_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('cati_tamiri'), 'çatı onarımı', false, 'gross_m2', true, 3)$$, '...but a change of case of its OWN name is fine');
select throws_ok($$select public.save_charge_type(tt.company('2'), tt.type_id('cati_tamiri'), 'Başka', true, 'equal', true, 1)$$, '42501', 'not allowed', 'a type id is only valid with ITS company (AA is no admin of company 2)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select throws_ok($$select public.save_charge_type(tt.company('2'), tt.type_id('cati_tamiri'), 'Ele geçirme', true, 'equal', true, 1)$$, '42501', 'not allowed', 'the admin of company 2 cannot change a type of company 1 by naming his own company');
reset role; select set_config('request.jwt.claims', '', true);
-- switching off, a monthly plan, deleting
insert into public.recurring_plans (id, site_id, name, charge_type_id, amount, split_method, day_of_month, target)
values ('d1000000-0000-0000-0000-000000000001', tt.site('X'), 'Çatı planı', tt.type_id('cati_tamiri'), 100, 'per_unit', 5, '{"scope":"site"}');
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('cati_tamiri'), 'Çatı Onarımı', false, 'gross_m2', false, 3)$$, 'P0001', 'type_in_active_plan', 'a type used by an ACTIVE monthly plan cannot be switched off');
reset role; select set_config('request.jwt.claims', '', true);
update public.recurring_plans set active = false where id = 'd1000000-0000-0000-0000-000000000001';
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('cati_tamiri'), 'Çatı Onarımı', false, 'gross_m2', false, 3)$$, '...but it can when the plan is switched off');
select throws_ok($$select public.delete_charge_type(tt.type_id('cati_tamiri'))$$, 'P0001', 'type_in_use', 'a type that a plan uses (even a switched-off one) cannot be deleted');
select lives_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('cati_tamiri'), 'Çatı Onarımı', false, 'gross_m2', true, 3)$$, 'a type can be switched on again');
reset role; select set_config('request.jwt.claims', '', true);
select is((select active from public.charge_types where id = tt.type_id('cati_tamiri')), true, '...and it is on');
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.delete_charge_type(tt.type_id('aidat'))$$, 'P0001', 'type_protected', 'a default type cannot be deleted (aidat)');
select throws_ok($$select public.delete_charge_type(tt.type_id('devir'))$$, 'P0001', 'type_protected', '...nor the others (devir)');
select lives_ok($$select public.save_charge_type(tt.company('1'), tt.type_id('demirbas'), 'Demirbaş', false, 'land_share', false, 3)$$, 'a default type CAN be switched off');
select lives_ok($$select public.delete_charge_type(tt.type_id('tur_123'))$$, 'a type that was never used can be deleted');
select throws_ok($$select public.delete_charge_type('99999999-9999-9999-9999-999999999999')$$, '42501', 'not allowed', 'an unknown type is refused as "not allowed"');
reset role; select set_config('request.jwt.claims', '', true);
insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period)
values (tt.cid(90), tt.unit('04'), tt.type_id('cati_tamiri_2'), 'd0000000-0000-0000-0000-000000000001', 1, tt.today(), true, tt.m(0));
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$select public.delete_charge_type(tt.type_id('cati_tamiri_2'))$$, 'P0001', 'type_in_use', 'a type with a charge line cannot be deleted');
reset role; select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.charge_types where company_id = tt.company('1') and code = 'tur_123'), 0, 'the unused type is gone');

-- ---------------------------------------------------------------------------
-- 11. Quote requests (the public form)
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select lives_ok($$insert into public.quote_requests (name, email, message) values ('Ziyaretçi', 'z@example.com', 'Merhaba')$$, 'a visitor can still send a quote request');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$update public.quote_requests set status = 'offered', admin_note = 'Teklif gönderildi' where name = 'Ziyaretçi'$$, 'an admin sets the status and a note');
select lives_ok($$update public.quote_requests set status = 'won' where name = 'Ziyaretçi'$$, '...every new status works (won)');
select throws_ok($$update public.quote_requests set status = 'bitti' where name = 'Ziyaretçi'$$, '23514', null, 'an unknown status is refused');
select throws_ok($$update public.quote_requests set admin_note = repeat('a', 1001) where name = 'Ziyaretçi'$$, '23514', null, 'a note over 1000 letters is refused');
select throws_ok($$update public.quote_requests set name = 'Başka' where name = 'Ziyaretçi'$$, '42501', null, 'the admin cannot change what the visitor wrote (only status and note)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('OA'));
select is((select count(*)::int from public.quote_requests), 0, 'a resident reads no quote request');
select lives_ok($$update public.quote_requests set status = 'lost'$$, '...and an update from them changes nothing (row security finds no row)');
reset role; select set_config('request.jwt.claims', '', true);
select is((select status from public.quote_requests where name = 'Ziyaretçi'), 'won', '...the status is still "won"');
select pg_temp.act_as_visitor();
select throws_ok($$select count(*) from public.quote_requests$$, '42501', null, 'a visitor reads none');
select throws_ok($$update public.quote_requests set status = 'lost'$$, '42501', null, '...and cannot change one');
reset role; select set_config('request.jwt.claims', '', true);
select is((select admin_note from public.quote_requests where name = 'Ziyaretçi'), 'Teklif gönderildi', 'the note is saved');

-- ---------------------------------------------------------------------------
-- 12. The audit log
-- ---------------------------------------------------------------------------
-- 12a. what the fixture (as postgres) already wrote: the system, not a person
select is((select count(*)::int from public.audit_log where actor_id is null and table_name = 'charges' and action = 'insert'), (select count(*)::int from public.charges), 'every charge made by the fixture is in the log, with no actor ("Sistem")');
select is(tt.audit_n('payments', 'f1000000-0000-0000-0000-000000000003', 'insert'), 1, 'a payment row is logged');
-- 12b. a person's actions: the actor and the name
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.void_payment((select id from public.payments where amount = 24 and method = 'cash' and unit_id = tt.unit('01')), 'Yanlış tutar')$$, 'AA cancels the part payment');
reset role; select set_config('request.jwt.claims', '', true);
select is((tt.last_audit('payments', 'update') ->> 'actor_id'), tt.u('AA')::text, 'the log says WHO: Admin A');
select is((tt.last_audit('payments', 'update') ->> 'actor_name'), 'Admin A', '...with the name as it was');
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(tt.last_audit('payments', 'update') -> 'new_data') k), 'status,void_reason,voided_at,voided_by', 'an update stores ONLY the changed columns (no updated_at, nothing else)');
select is((tt.last_audit('payments', 'update') -> 'old_data' ->> 'status') || '>' || (tt.last_audit('payments', 'update') -> 'new_data' ->> 'status'), 'approved>voided', '...before and after');
select is((tt.last_audit('payments', 'update') ->> 'site_id'), tt.site('X')::text, 'the site is found through the unit');
select is((tt.last_audit('payments', 'update') ->> 'company_id'), tt.company('1')::text, '...and the company through the site');
-- 12c. insert, diff, no-op update, delete on a unit
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$insert into public.units (block_id, door_no, floor) values ('30000000-0000-0000-0000-000000000001', '88', 2)$$, 'AA adds a unit');
reset role; select set_config('request.jwt.claims', '', true);
create temp table ids (name text primary key, v uuid);
grant select on ids to authenticated;
insert into ids select 'u88', id from public.units where door_no = '88';
select is((tt.last_audit('units', 'insert') ->> 'row_id'), (select v::text from ids where name = 'u88'), 'an insert is logged with the row id');
select is((tt.last_audit('units', 'insert') -> 'new_data' ->> 'door_no'), '88', '...and the new row');
select is((tt.last_audit('units', 'insert') ->> 'old_data') is null, true, '...with no old data');
select is((tt.last_audit('units', 'insert') ->> 'site_id'), tt.site('X')::text, 'a unit finds its site through its block');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$update public.units set floor = 3 where id = (select v from ids where name = 'u88')$$, 'a change');
reset role; select set_config('request.jwt.claims', '', true);
select is((tt.last_audit('units', 'update') -> 'old_data')::text || '>' || (tt.last_audit('units', 'update') -> 'new_data')::text, '{"floor": 2}>{"floor": 3}', 'the update stores just {floor: 2} > {floor: 3}');
create temp table marks (name text primary key, v bigint);
insert into marks select 'm', tt.mark();
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$update public.units set floor = 3 where id = (select v from ids where name = 'u88')$$, 'the same value again');
reset role; select set_config('request.jwt.claims', '', true);
select is(tt.audit_since((select v from marks where name = 'm'), 'units'), 0, '...writes NO log row (nothing changed; updated_at alone is not a change)');
-- a unit with a resident is deleted: its residents go with it, and nothing raises
insert into public.unit_residents (unit_id, profile_id, relation, start_date) values ((select v from ids where name = 'u88'), tt.u('S'), 'owner', tt.today() - 5);
insert into marks select 'm2', tt.mark();
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$delete from public.units where id = (select v from ids where name = 'u88')$$, 'a unit WITH a resident can be deleted (the cascade must not trip the audit)');
reset role; select set_config('request.jwt.claims', '', true);
select is((tt.last_audit('units', 'delete') ->> 'row_id'), (select v::text from ids where name = 'u88'), 'the delete of the unit is in the log');
select is((tt.last_audit('units', 'delete') -> 'old_data' ->> 'door_no'), '88', '...with the old row');
select is(tt.audit_since((select v from marks where name = 'm2'), 'unit_residents'), 0, 'the residents the cascade took with it write no row (their unit is gone; the unit''s delete is the record)');
select is((select count(*)::int from public.unit_residents where unit_id = (select v from ids where name = 'u88')), 0, '...and they are really gone');
-- 12d. company level rows: charge types, company, settings
select is((select (l ->> 'site_id') is null and (l ->> 'company_id') = tt.company('1')::text from (select tt.last_audit('charge_types', 'insert') as l) x), true, 'a charge type belongs to the COMPANY (no site)');
select is((tt.last_audit('charge_types', 'insert') ->> 'actor_name'), 'Admin A', '...and AA made it');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$update public.companies set name = 'Firma 1 Yeni' where id = tt.company('1')$$, 'AA renames the company');
reset role; select set_config('request.jwt.claims', '', true);
select is((tt.last_audit('companies', 'update') ->> 'row_id') || '|' || (tt.last_audit('companies', 'update') ->> 'company_id'), tt.company('1')::text || '|' || tt.company('1')::text, 'the company row belongs to itself');
select is((tt.last_audit('companies', 'update') -> 'old_data' ->> 'name') || '>' || (tt.last_audit('companies', 'update') -> 'new_data' ->> 'name'), 'Firma 1>Firma 1 Yeni', '...name before and after');
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select tt.save(p_day => 10)$$, 'AA saves the settings');
reset role; select set_config('request.jwt.claims', '', true);
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(tt.last_audit('companies', 'update') -> 'new_data') k), 'settings', 'a settings change is one changed column: settings');
select is((tt.last_audit('companies', 'update') -> 'old_data' -> 'settings' -> 'rules' ->> 'due_day') || '>' || (tt.last_audit('companies', 'update') -> 'new_data' -> 'settings' -> 'rules' ->> 'due_day'), '15>10', '...with the due day before and after');
-- 12e. who administers a site (no id column: the key is the person)
insert into public.site_members (profile_id, site_id, role) values (tt.u('S'), tt.site('X'), 'auditor');
select is((tt.last_audit('site_members', 'insert') ->> 'row_id'), tt.u('S')::text, 'a new site member is logged with the person as the row id');
-- 12f. noise and long texts
insert into public.announcements (title, body, target, site_id) values ('Uzun duyuru', repeat('a', 500), '{"scope":"site","audience":"all"}', tt.site('X'));
select is(char_length(tt.last_audit('announcements', 'insert') -> 'new_data' ->> 'body'), 301, 'a long text is cut to 300 letters and a dot-dot-dot');
select is((tt.last_audit('announcements', 'insert') -> 'new_data' ->> 'body') like '%…', true, '...marked as cut');
select is((tt.last_audit('requests', 'insert') -> 'new_data') ? 'token', false, 'the double-tap token of a request is not copied into the log');
select is((tt.last_audit('transfer_notices', 'insert') -> 'new_data') ? 'request_id', false, 'nor the request id of a havale notice');
-- 12g. requests: a status change as the admin
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.set_request_status((select id from public.requests where title = 'Açık talep'), 'inceleniyor')$$, 'AA moves a request');
reset role; select set_config('request.jwt.claims', '', true);
select is((tt.last_audit('requests', 'update') -> 'new_data' ->> 'status'), 'inceleniyor', 'the request status change is logged');
select is((tt.last_audit('requests', 'update') ->> 'actor_name'), 'Admin A', '...by AA');
-- 12h. cancelling a charge
insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period)
select tt.cid(91), tt.unit('04'), t.id, 'd0000000-0000-0000-0000-000000000001', 3, tt.today() + 10, true, tt.m(0) from public.charge_types t where t.company_id = tt.company('1') and t.code = 'aidat';
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$select public.void_charge(tt.cid(91), 'Yanlış daire')$$, 'AA cancels a charge');
reset role; select set_config('request.jwt.claims', '', true);
select is((select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(tt.last_audit('charges', 'update') -> 'new_data') k), 'void_reason,voided_at,voided_by', 'a cancelled charge: the three void columns changed');
-- 12i. who sees what
select pg_temp.act_as(tt.u('AA'));
select ok((select count(*) from public.audit_log) > 20, 'AA reads the log');
select is((select count(*)::int from public.audit_log where site_id = tt.site('Y')), 0, '...and nothing of Site Y');
select ok((select count(*) from public.audit_log where table_name = 'charge_types' and company_id = tt.company('1')) > 0, '...the company rows of Firma 1 (charge types)');
select is((select count(*)::int from public.audit_log where company_id = tt.company('2')), 0, '...and none of Firma 2');
select ok((select count(*) from public.audit_log where table_name = 'companies' and company_id = tt.company('1')) > 0, '...and the company changes');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('A2'));
select is((select count(*)::int from public.audit_log), (select count(*)::int from public.audit_log where site_id = tt.site('X') or (site_id is null and company_id = tt.company('1'))), 'a second admin of Site X sees the same: its site and its company');
select ok((select count(*) from public.audit_log) > 20, '...and many rows');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AB'));
select is((select count(*)::int from public.audit_log where site_id = tt.site('X') or company_id = tt.company('1')), 0, 'the admin of Site Y sees NOTHING of Site X or Firma 1');
select ok((select count(*) from public.audit_log where site_id = tt.site('Y')) > 0, '...but its own rows (the Site Y charge)');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('OA'));
select is((select count(*)::int from public.audit_log), 0, 'a resident sees no log row');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('S'));
select is((select count(*)::int from public.audit_log), 0, 'a stranger sees none');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as_visitor();
select throws_ok($$select count(*) from public.audit_log$$, '42501', null, 'a visitor gets "permission denied"');
select throws_ok($$insert into public.audit_log (table_name, action) values ('units', 'insert')$$, '42501', null, '...and cannot write');
reset role; select set_config('request.jwt.claims', '', true);
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$insert into public.audit_log (table_name, action) values ('units', 'insert')$$, '42501', null, 'an admin cannot write a log row either');
select throws_ok($$update public.audit_log set table_name = 'x'$$, '42501', null, '...nor change');
select throws_ok($$delete from public.audit_log$$, '42501', null, '...nor delete');
reset role; select set_config('request.jwt.claims', '', true);
-- 12j. nobody changes the past: not even the owner
select throws_ok($$update public.audit_log set actor_name = 'Biri' where id = (select min(id) from public.audit_log)$$, '42501', 'audit_log_is_append_only', 'as the table owner an update is still refused');
select throws_ok($$delete from public.audit_log where id = (select min(id) from public.audit_log)$$, '42501', 'audit_log_is_append_only', '...a delete too');
select throws_ok($$truncate public.audit_log$$, '42501', 'audit_log_is_append_only', '...and a truncate');
-- 12k. fail-closed: when the log cannot be written, the change fails too
alter table public.audit_log add constraint zz_always_fails check (false) not valid;
select pg_temp.act_as(tt.u('AA'));
select throws_ok($$update public.units set floor = 9 where id = '40000000-0000-0000-0000-000000000001'$$, '23514', null, 'a change fails when its log row cannot be written (fail-closed)');
reset role; select set_config('request.jwt.claims', '', true);
select is((select floor from public.units where id = '40000000-0000-0000-0000-000000000001'), null, '...and the change did not happen');
alter table public.audit_log drop constraint zz_always_fails;
-- a no-change update needs no log row, so it still works while the log is broken: control for the test above
select pg_temp.act_as(tt.u('AA'));
select lives_ok($$update public.units set floor = 9 where id = '40000000-0000-0000-0000-000000000001'$$, 'with the log working again, the same change works');
reset role; select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
