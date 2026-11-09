-- Database tests for 0004_resident_charges.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- The rule under test (see the top of 0004): a resident sees charge lines only for a CURRENT residency
-- of an ACTIVE account. An owner sees every line of the unit. A tenant sees only "kiracıya yansıt"
-- lines whose due date is on or after the tenant's own start date. Cancelled lines are hidden.

begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

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

create schema tt;
grant usage on schema tt to anon, authenticated;
create function tt.today() returns date language sql as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

-- What a person sees, in one line each (amounts in due date order).
create function tt.amounts() returns text language sql as $$
  select coalesce(string_agg(amount::text, ',' order by due_date, created_at), '') from public.charge_status;
$$;
create function tt.seen() returns text language sql as $$
  select (select count(*) from public.charges) || '/' || (select count(*) from public.charge_status) || '/'
      || (select count(*) from public.unit_balances) || '/' || (select count(*) from public.charge_types) || '/'
      || (select count(*) from public.charge_batches) || '/' || (select count(*) from public.recurring_plans) || '/'
      || (select count(*) from public.charge_batch_summary);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   Firma 1 / Site X: unit u1 (A-1) and u2 (A-2). Firma 2 / Site Y: unit u3.
--   People on u1: owner O, tenant T3 (since 90 days), NEW tenant T2 (since 30 days), former tenant FT,
--   a tenant who moves out today MT, a future tenant FUT, a deactivated owner D, and P who is both
--   owner and tenant. u2: owner O2. u3: owner R (other company).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{}'),
  ('b1000000-0000-0000-0000-000000000001', 'owner@test.local', '{}'),
  ('b2000000-0000-0000-0000-000000000002', 'tenant3@test.local', '{}'),
  ('b3000000-0000-0000-0000-000000000003', 'tenant2@test.local', '{}'),
  ('b4000000-0000-0000-0000-000000000004', 'former@test.local', '{}'),
  ('b5000000-0000-0000-0000-000000000005', 'deactivated@test.local', '{}'),
  ('b6000000-0000-0000-0000-000000000006', 'owner2@test.local', '{}'),
  ('b7000000-0000-0000-0000-000000000007', 'othercompany@test.local', '{}'),
  ('b8000000-0000-0000-0000-000000000008', 'future@test.local', '{}'),
  ('b9000000-0000-0000-0000-000000000009', 'both@test.local', '{}'),
  ('ba000000-0000-0000-0000-00000000000a', 'movedout@test.local', '{}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2');
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
  ('a2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'admin');
update public.profiles set is_active = false where id = 'b5000000-0000-0000-0000-000000000005';

insert into public.unit_residents (unit_id, profile_id, relation, start_date, end_date) values
  ('40000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'tenant', tt.today() - 90,  null),
  ('40000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', 'tenant', tt.today() - 30,  null),
  ('40000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000004', 'tenant', tt.today() - 200, tt.today() - 31),
  ('40000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000005', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000008', 'tenant', tt.today() + 5,   null),
  ('40000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000009', 'owner',  tt.today() - 100, null),
  ('40000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000009', 'tenant', tt.today() - 100, null),
  ('40000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-00000000000a', 'tenant', tt.today() - 10,  tt.today()),
  ('40000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000006', 'owner',  tt.today() - 400, null),
  ('40000000-0000-0000-0000-000000000003', 'b7000000-0000-0000-0000-000000000007', 'owner',  tt.today() - 400, null);

-- Known ids for three charge types (the company trigger already created them).
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000001'
 where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'aidat';
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000002'
 where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'demirbas';
update public.charge_types set id = 'cccccccc-0000-0000-0000-00000000000b'
 where company_id = '10000000-0000-0000-0000-0000000000c2' and code = 'aidat';

insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible) values
  ('d0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001',
   '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true),
  ('d0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-00000000000b',
   '{"scope":"site"}', 'per_unit', 1, 1, 1, tt.today(), true);
insert into public.recurring_plans (site_id, name, charge_type_id, amount, split_method, day_of_month, target)
values ('20000000-0000-0000-0000-0000000000a1', 'Plan', 'cccccccc-0000-0000-0000-000000000001', 100, 'per_unit', 5, '{"scope":"site"}');

-- id, unit, type, amount, due offset (days from today), tenant_visible, voided, created_at
create function pg_temp.line(p_id text, p_unit text, p_type text, p_amount numeric, p_due integer, p_visible boolean, p_voided boolean, p_created timestamptz)
returns void language sql as $$
  insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, voided_at, void_reason, created_at)
  values (('e1000000-0000-0000-0000-0000000000' || p_id)::uuid, ('40000000-0000-0000-0000-00000000000' || p_unit)::uuid, p_type::uuid,
          case when p_unit = '3' then 'd0000000-0000-0000-0000-000000000002' else 'd0000000-0000-0000-0000-000000000001' end::uuid,
          p_amount, tt.today() + p_due, p_visible,
          case when p_voided then now() end, case when p_voided then 'iptal edildi' end, p_created);
$$;
select pg_temp.line('01', '1', 'cccccccc-0000-0000-0000-000000000001', 100, -60, true,  false, now());                      -- L1  before the new tenant moved in
select pg_temp.line('02', '1', 'cccccccc-0000-0000-0000-000000000001', 200,  10, true,  false, timestamptz '2026-01-01');    -- L2
select pg_temp.line('03', '1', 'cccccccc-0000-0000-0000-000000000002', 300,  10, false, false, timestamptz '2026-01-02');    -- L3  NOT shown to tenants
select pg_temp.line('04', '1', 'cccccccc-0000-0000-0000-000000000001', 400,   5, true,  true,  now());                      -- L4  cancelled
select pg_temp.line('05', '1', 'cccccccc-0000-0000-0000-000000000001', 500,  -1, true,  false, now());                      -- L5  overdue
select pg_temp.line('08', '1', 'cccccccc-0000-0000-0000-000000000001',  50, -30, true,  false, now());                      -- L8  due exactly on T2's start date
select pg_temp.line('09', '1', 'cccccccc-0000-0000-0000-000000000001',  25, -31, true,  false, now());                      -- L9  the day before T2's start date
select pg_temp.line('10', '1', 'cccccccc-0000-0000-0000-000000000001',  70,   0, true,  false, now());                      -- L10 due today
select pg_temp.line('06', '2', 'cccccccc-0000-0000-0000-000000000001',  60,   3, true,  false, now());                      -- L6  other unit
select pg_temp.line('07', '2', 'cccccccc-0000-0000-0000-000000000002',  80,   3, false, false, now());                      -- L7  other unit
select pg_temp.line('11', '3', 'cccccccc-0000-0000-0000-00000000000b', 999,   3, true,  false, now());                      -- L11 other company

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'private.resident_sees_charge(uuid, boolean, date)', 'execute')
      and has_function_privilege('authenticated', 'private.is_company_resident(uuid)', 'execute'),
  'logged-in users can run the two policy helpers (a policy runs them as the user)');
select ok(not has_function_privilege('anon', 'private.resident_sees_charge(uuid, boolean, date)', 'execute')
      and not has_function_privilege('anon', 'private.is_company_resident(uuid)', 'execute'),
  'visitors cannot');
select ok(not has_table_privilege('anon', 'public.charge_status', 'select') and not has_table_privilege('anon', 'public.unit_balances', 'select')
      and has_table_privilege('authenticated', 'public.charge_status', 'select') and has_table_privilege('authenticated', 'public.unit_balances', 'select'),
  'the two views are for logged-in users only');
select is((select array_agg(reloptions::text order by relname) from pg_class where relname in ('charge_status', 'unit_balances') and relkind = 'v'),
  array['{security_invoker=true}', '{security_invoker=true}'], 'both views run with the caller''s rights (RLS applies)');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'charge_status' and column_name = 'tenant_visible'),
  'the view does not show the tenant_visible flag (residents never see it)');
select ok(not has_table_privilege('authenticated', 'public.charges', 'insert') and not has_table_privilege('authenticated', 'public.charges', 'delete'),
  'residents (like everybody) cannot insert or delete charges');

-- ---------------------------------------------------------------------------
-- 2. A visitor
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select count(*) from public.charge_status$$, '42501', null, 'a visitor cannot read charge_status');
select throws_ok($$select count(*) from public.unit_balances$$, '42501', null, 'a visitor cannot read unit_balances');
select throws_ok($$select count(*) from public.charges$$, '42501', null, 'a visitor cannot read charges');

-- ---------------------------------------------------------------------------
-- 3. The admin still reads everything (the helper grant must not break admins)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.charges), 10, 'admin A still reads all 10 lines of Firma 1 (8 on u1 incl. one cancelled, 2 on u2) and none of Firma 2');
select is((select count(*)::int from public.charge_status where status = 'voided'), 1, '...the cancelled line is visible to the admin, with status "voided"');
select is((select remaining::text from public.charge_status where charge_id = 'e1000000-0000-0000-0000-000000000004'), '0.00', '...and it owes nothing');
select is((select line_count || '/' || charged::text || '/' || balance::text || '/' || overdue_amount::text || '/' || overdue_count || '/' || (next_due_date = tt.today())::text
             from public.unit_balances where unit_id = '40000000-0000-0000-0000-000000000001'),
  '7/1245.00/1245.00/675.00/4/true', 'u1 for the admin: 7 live lines, 1245.00 owed, 675.00 overdue in 4 lines, next due today (cancelled line ignored)');
select is((select running_balance::text from public.charge_status where charge_id = 'e1000000-0000-0000-0000-000000000004'), '745.00',
  'the running balance does not move on a cancelled line');
select is((select count(*)::int from public.charge_batches), 1, 'admin A reads the batch of Firma 1');
select is((select count(*)::int from public.recurring_plans), 1, '...and the plan');

-- ---------------------------------------------------------------------------
-- 4. The OWNER sees every live line of the unit, even those hidden from tenants
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.charges), 7, 'the owner sees 7 lines (all live lines of u1)');
select is(tt.amounts(), '100.00,25.00,50.00,500.00,70.00,200.00,300.00',
  '...including the Demirbaş line that is not for tenants, but not the cancelled one, and nothing of other units');
select is((select count(*)::int from public.charges where unit_id <> '40000000-0000-0000-0000-000000000001'), 0, 'the owner sees nothing of another unit');
select is((select count(*)::int from public.charges where voided_at is not null), 0, 'the owner does not see cancelled lines');
select is((select type_name from public.charge_status where charge_id = 'e1000000-0000-0000-0000-000000000003'), 'Demirbaş',
  'the type name comes with the line (the resident may read the types of the company)');
select is((select block_name || ' ' || door_no from public.charge_status where charge_id = 'e1000000-0000-0000-0000-000000000003'), 'A Blok 1', '...and the unit label');
select is((select line_count || '/' || charged::text || '/' || paid::text || '/' || balance::text || '/' || overdue_amount::text || '/' || overdue_count || '/' || (next_due_date = tt.today())::text
             from public.unit_balances),
  '7/1245.00/0.00/1245.00/675.00/4/true', 'the owner''s balance: 1245.00 owed (nothing paid yet), 675.00 overdue in 4 lines, next due today');
select is((select running_balance::text from public.charge_status order by due_date desc, created_at desc, charge_id desc limit 1), '1245.00',
  'the running balance ends at the balance');
select is((select string_agg(running_balance::text, ',' order by due_date, created_at, charge_id) from public.charge_status),
  '100.00,125.00,175.00,675.00,745.00,945.00,1245.00', 'the running balance (the ekstre) is correct line by line, ties by creation time');
select is((select status from public.charge_status where charge_id = 'e1000000-0000-0000-0000-000000000005'), 'overdue', 'a line due yesterday is overdue');
select is((select status from public.charge_status where charge_id = 'e1000000-0000-0000-0000-000000000010'), 'open', 'a line due today is not yet overdue');
select is((select count(*)::int from public.charge_types), 6, 'the owner reads the 6 charge types of the company');
select is((select count(*)::int from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c2'), 0, '...and none of another company');
select is((select count(*)::int from public.charge_batches) || '/' || (select count(*)::int from public.recurring_plans) || '/' || (select count(*)::int from public.charge_batch_summary), '0/0/0',
  'the owner cannot read batches or plans');

-- ---------------------------------------------------------------------------
-- 5. A TENANT sees only "kiracıya yansıt" lines from their own move-in date on
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is(tt.amounts(), '100.00,25.00,50.00,500.00,70.00,200.00',
  'a tenant (since 90 days) sees the tenant-visible lines, NOT the 300.00 Demirbaş line');
select is((select count(*)::int from public.charges where amount = 300), 0, '...also not through the charges table');
select is((select line_count || '/' || charged::text || '/' || balance::text || '/' || overdue_amount::text || '/' || overdue_count
             from public.unit_balances), '6/945.00/945.00/675.00/4', 'the tenant''s balance counts only the lines the tenant can see (945.00, not 1245.00)');
select is((select running_balance::text from public.charge_status order by due_date desc, created_at desc, charge_id desc limit 1), '945.00',
  '...and so does the running balance');

reset role;
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is(tt.amounts(), '50.00,500.00,70.00,200.00',
  'the NEW tenant (since 30 days) does not see the previous tenant''s lines (due 60 and 31 days ago)...');
select is((select count(*)::int from public.charges where amount = 50), 1, '...but sees a line due exactly on the day they moved in');
select is((select count(*)::int from public.charges where amount = 25), 0, '...and not a line due the day before');
select is((select count(*)::int from public.charges where amount = 100), 0, '...nor the one due 60 days ago');
select is((select balance::text from public.unit_balances), '820.00', 'the new tenant''s balance is 820.00');

-- ---------------------------------------------------------------------------
-- 6. People who must see nothing
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b4000000-0000-0000-0000-000000000004');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a former tenant (moved out 31 days ago) sees nothing at all, not even the charge types');

reset role;
select pg_temp.act_as('ba000000-0000-0000-0000-00000000000a');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a tenant who moves out TODAY already sees nothing');

reset role;
select pg_temp.act_as('b8000000-0000-0000-0000-000000000008');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a tenant who moves in in 5 days sees nothing yet');

reset role;
select pg_temp.act_as('b5000000-0000-0000-0000-000000000005');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a deactivated owner sees nothing');

reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a stranger sees nothing');

-- ---------------------------------------------------------------------------
-- 7. Other units, other companies, both relations at once
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-000000000006');
select is(tt.amounts(), '60.00,80.00', 'the owner of u2 sees exactly the 2 lines of u2');
select is((select count(*)::int from public.charges where unit_id = '40000000-0000-0000-0000-000000000001'), 0, '...and 0 lines of u1 (another unit returns 0 rows)');
select is((select count(*)::int from public.unit_balances), 1, '...and one balance');
select is((select next_due_date = tt.today() + 3 from public.unit_balances), true, 'next due date is the earliest line still ahead (3 days)');

reset role;
select pg_temp.act_as('b9000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.charges), 7, 'a person who is owner AND tenant of the unit sees everything (the owner right wins)');

reset role;
select pg_temp.act_as('b7000000-0000-0000-0000-000000000007');
select is(tt.amounts(), '999.00', 'the owner in another company sees only their own unit');
select is((select count(*)::int from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c1'), 0, '...and cannot read the charge types of Firma 1');
select is((select count(*)::int from public.charge_types), 6, '...only those of their own company');

reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is(tt.amounts(), '999.00', 'the admin of Firma 2 sees only the line of Firma 2');
select is((select count(*)::int from public.unit_balances), 1, '...and one balance');

-- ---------------------------------------------------------------------------
-- 8. Residents cannot change anything
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
update public.charges set amount = 1 where unit_id = '40000000-0000-0000-0000-000000000001';
select throws_ok($$delete from public.charges$$, '42501', null, 'an owner cannot delete a charge');
select throws_ok($$insert into public.charges (unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible)
    values ('40000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1, current_date, true)$$,
  '42501', null, 'an owner cannot insert a charge');
select throws_ok($$select * from public.preview_charge_batch('20000000-0000-0000-0000-0000000000a1', '{"scope":"site"}', 'equal', 1000)$$,
  '42501', 'not allowed', 'an owner cannot call the admin functions');
select throws_ok($$select public.void_charge('e1000000-0000-0000-0000-000000000001', 'deneme deneme')$$, '42501', null, 'an owner cannot cancel a line');
reset role;
select is((select sum(amount)::text from public.charges where unit_id = '40000000-0000-0000-0000-000000000001' and voided_at is null), '1245.00',
  'the owner''s update changed nothing (the policy only lets admins update)');

reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
update public.charges set tenant_visible = false where unit_id = '40000000-0000-0000-0000-000000000001';
reset role;
-- (only this test's own lines: leftover data in a local database must not matter)
select is((select count(*)::int from public.charges where tenant_visible and id::text like 'e1000000-%'), 9, 'a tenant cannot change anything (all 9 tenant-visible lines are still tenant-visible)');

-- ---------------------------------------------------------------------------
-- 9. The rule follows the data (today's changes show at once)
-- ---------------------------------------------------------------------------
reset role;
update public.unit_residents set end_date = tt.today() where profile_id = 'b3000000-0000-0000-0000-000000000003';
select pg_temp.act_as('b3000000-0000-0000-0000-000000000003');
select is(tt.seen(), '0/0/0/0/0/0/0', 'after "Taşındı" with today''s date the tenant sees nothing at once');
reset role;
update public.unit_residents set end_date = null where profile_id = 'b3000000-0000-0000-0000-000000000003';
update public.profiles set is_active = false where id = 'b1000000-0000-0000-0000-000000000001';
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a deactivated owner loses the view at once');
reset role;
update public.profiles set is_active = true where id = 'b1000000-0000-0000-0000-000000000001';
update public.unit_residents set start_date = tt.today() + 1 where profile_id = 'b2000000-0000-0000-0000-000000000002';
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is(tt.seen(), '0/0/0/0/0/0/0', 'a tenant whose start date is tomorrow sees nothing today');
reset role;
update public.unit_residents set start_date = tt.today() where profile_id = 'b2000000-0000-0000-0000-000000000002';
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is(tt.amounts(), '70.00,200.00',
  'an EXISTING tenant entered with today''s start date does not see the older lines (the start date must be the real move-in date)');
reset role;
select * from finish();
rollback;
