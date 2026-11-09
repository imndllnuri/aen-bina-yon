-- Database tests for 0003_charges.sql (pgTAP). Run with:  npx supabase test db
-- Everything is rolled back at the end.
--
-- The expected split numbers were calculated with an independent Python script (exact fractions,
-- largest remainder), not copied from the SQL, so they check the rule and not the code.

begin;
create extension if not exists pgtap with schema extensions;
select plan(169);

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

-- Test helpers that may be called while acting as another role (schema "tt", rolled back at the end).
create schema tt;
grant usage on schema tt to anon, authenticated;

-- Runs one statement and returns the DETAIL text of the error it raises (null when it works).
create function tt.err_detail(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end; $$;

create function tt.preview(p_target jsonb, p_split text, p_kurus bigint,
                           p_site uuid default '20000000-0000-0000-0000-0000000000a1')
returns table (unit_id uuid, block_name text, door_no text, weight numeric, amount_kurus bigint)
language sql as $$
  select * from public.preview_charge_batch(p_site, p_target, p_split, p_kurus);
$$;

create function tt.create_b(p_req uuid, p_target jsonb, p_split text, p_kurus bigint, p_exp_units integer, p_exp_kurus bigint,
                            p_period date default date '2026-11-01', p_due date default date '2026-11-30',
                            p_desc text default null, p_visible boolean default true,
                            p_karar_no text default null, p_karar_date date default null,
                            p_site uuid default '20000000-0000-0000-0000-0000000000a1',
                            p_type uuid default 'cccccccc-0000-0000-0000-000000000001')
returns uuid language sql as $$
  select public.create_charge_batch(p_req, p_site, p_target, p_split, p_kurus, p_type, p_period, p_due,
                                    p_desc, p_visible, p_karar_no, p_karar_date, p_exp_units, p_exp_kurus);
$$;

create function tt.save_plan(p_id uuid, p_kurus bigint, p_split text default 'per_unit', p_day integer default 5,
                             p_target jsonb default '{"scope":"site"}', p_karar_no text default null,
                             p_karar_date date default null, p_name text default 'Aylık aidat',
                             p_site uuid default '20000000-0000-0000-0000-0000000000a1',
                             p_type uuid default 'cccccccc-0000-0000-0000-000000000001')
returns uuid language sql as $$
  select public.save_recurring_plan(p_id, p_site, p_name, p_type, p_kurus, p_split, p_day, p_target, true, null,
                                    p_karar_no, p_karar_date);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
--   Firma 1 runs Site X: A Blok (doors 1-8), B Blok (doors 9-16), C Blok (empty).
--   Arsa payı is 100 for odd doors of a block and 126 for even ones (like the demo seed).
--   Firma 2 runs Site Y. Admin D administers Site X but is deactivated.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a@test.local', '{"full_name":"Admin A"}'),
  ('a2000000-0000-0000-0000-000000000002', 'admin-b@test.local', '{"full_name":"Admin B"}'),
  ('d1000000-0000-0000-0000-000000000001', 'admin-d@test.local', '{"full_name":"Admin D"}'),
  ('b1000000-0000-0000-0000-000000000001', 'owner@test.local',   '{"full_name":"Malik"}'),
  ('b2000000-0000-0000-0000-000000000002', 'tenant@test.local',  '{"full_name":"Kiraci"}'),
  ('c1000000-0000-0000-0000-000000000001', 'stranger@test.local', '{}');

insert into public.companies (id, name) values
  ('10000000-0000-0000-0000-0000000000c1', 'Firma 1'),
  ('10000000-0000-0000-0000-0000000000c2', 'Firma 2');
insert into public.sites (id, company_id, name) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', 'Site X'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000c2', 'Site Y');
insert into public.blocks (id, site_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'A Blok'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-0000000000a1', 'B Blok'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-0000000000a1', 'C Blok'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'A Blok');
insert into public.units (id, block_id, door_no, floor, land_share)
select ('40000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       case when n <= 8 then '30000000-0000-0000-0000-000000000001' else '30000000-0000-0000-0000-000000000003' end::uuid,
       n::text, ((n - 1) / 2) + 1,
       case when ((n - 1) % 8 + 1) % 2 = 1 then 100.0000 else 126.0000 end
  from generate_series(1, 16) as n;
insert into public.units (id, block_id, door_no, land_share) values
  ('40000000-0000-0000-0000-0000000000f1', '30000000-0000-0000-0000-000000000002', '1', 100);
insert into public.site_members (profile_id, site_id, role) values
  ('a1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('d1000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'admin'),
  ('a2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a2', 'admin');
update public.profiles set is_active = false where id = 'd1000000-0000-0000-0000-000000000001';
insert into public.unit_residents (unit_id, profile_id, relation) values
  ('40000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'owner'),
  ('40000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'tenant');

-- The company trigger already created the charge types. Give three of them a known id.
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000001'
 where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'aidat';
update public.charge_types set id = 'cccccccc-0000-0000-0000-000000000002'
 where company_id = '10000000-0000-0000-0000-0000000000c1' and code = 'demirbas';
update public.charge_types set id = 'cccccccc-0000-0000-0000-00000000000b'
 where company_id = '10000000-0000-0000-0000-0000000000c2' and code = 'aidat';

-- ---------------------------------------------------------------------------
-- 1. Charge types and structure (as postgres)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c1'), 6,
  'a new company automatically gets the 6 default charge types');
select is((select count(*)::int from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c2'), 6,
  '...every company');
select is((select default_split || '/' || tenant_visible_default from public.charge_types where id = 'cccccccc-0000-0000-0000-000000000001'),
  'per_unit/true', 'Aidat: per unit, shown to tenants');
select is((select default_split || '/' || tenant_visible_default from public.charge_types where id = 'cccccccc-0000-0000-0000-000000000002'),
  'land_share/false', 'Demirbaş: by arsa payı, not shown to tenants');
select private.seed_charge_types('10000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c1'), 6,
  'seeding again adds no duplicates');
select is((select reloptions from pg_class where oid = 'public.charge_batch_summary'::regclass), array['security_invoker=true'],
  'the summary view runs with the caller''s rights (RLS applies)');
select ok(not has_column_privilege('authenticated', 'public.charges', 'unit_id', 'update')
      and not has_column_privilege('authenticated', 'public.charges', 'void_reason', 'update')
      and not has_column_privilege('authenticated', 'public.charges', 'voided_at', 'update')
      and not has_column_privilege('authenticated', 'public.charges', 'created_by', 'update')
      and has_column_privilege('authenticated', 'public.charges', 'amount', 'update'),
  'a browser can edit only amount, due date, description and tenant visibility of a charge');
select ok(not has_table_privilege('authenticated', 'public.charges', 'insert')
      and not has_table_privilege('authenticated', 'public.charges', 'delete')
      and not has_table_privilege('authenticated', 'public.charge_batches', 'insert')
      and not has_table_privilege('authenticated', 'public.charge_batches', 'update')
      and not has_table_privilege('authenticated', 'public.recurring_plans', 'insert')
      and not has_table_privilege('authenticated', 'public.charge_types', 'insert'),
  'nobody can insert or delete charges, batches, plans or types directly');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 0,
  'a visitor can execute no function in public');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('preview_charge_batch', 'create_charge_batch', 'generate_recurring_batch', 'save_recurring_plan',
                                'set_recurring_plan_active', 'void_charge', 'void_charge_batch', 'delete_charge_batch')
              and has_function_privilege('authenticated', p.oid, 'execute')), 8,
  'a logged-in user can execute the 8 charge functions (each checks the caller inside)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and p.proname in ('split_charge', 'create_batch_core', 'resolve_target', 'company_ydo', 'istanbul_month')
              and has_function_privilege('authenticated', p.oid, 'execute')), 0,
  'the internal split and create functions cannot be called by a browser');

-- The Istanbul month: from 00:00 to 03:00 on the 1st it is still the previous month in UTC.
select is(private.istanbul_month(timestamptz '2026-11-30 21:30:00+00'), date '2026-12-01', '00:30 on 1 December in Istanbul is December');
select is(private.istanbul_month(timestamptz '2026-11-30 20:59:59+00'), date '2026-11-01', '23:59 on 30 November in Istanbul is November');
select is(private.istanbul_month(timestamptz '2026-12-31 21:00:00+00'), date '2027-01-01', '...and at New Year');

-- ---------------------------------------------------------------------------
-- 2. A visitor
-- ---------------------------------------------------------------------------
select pg_temp.act_as_visitor();
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000)$$, '42501', null, 'a visitor cannot preview');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-0000000000f0', '{"scope":"site"}', 'equal', 160000, 16, 160000)$$,
  '42501', null, 'a visitor cannot create charges');
select throws_ok($$select count(*) from public.charges$$, '42501', null, 'a visitor cannot read charges');

-- ---------------------------------------------------------------------------
-- 3. Admin A: the split (preview writes nothing)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

select is((select array_agg(amount_kurus order by block_name, door_no::int) from tt.preview('{"scope":"site"}', 'land_share', 1000000)),
  array[55310, 69690, 55310, 69690, 55310, 69690, 55310, 69690, 55310, 69690, 55310, 69690, 55310, 69690, 55310, 69690]::bigint[],
  '10.000 TL by arsa payı over 16 units: the 8 leftover kuruş go to the 8 units with the biggest remainder');
select is((select sum(amount_kurus) from tt.preview('{"scope":"site"}', 'land_share', 1000000)), 1000000::numeric,
  '...and the lines add up to the total');
select is((select array_agg(amount_kurus order by block_name, door_no::int) from tt.preview('{"scope":"site"}', 'land_share', 100001)),
  array[5531, 6970, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969]::bigint[],
  '1.000,01 TL by arsa payı: the one leftover kuruş goes to door 2');
select is((select array_agg(amount_kurus order by block_name, door_no::int) from tt.preview('{"scope":"site"}', 'land_share', 1234567)),
  array[68284, 86037, 68284, 86037, 68284, 86037, 68284, 86037, 68284, 86037, 68284, 86037, 68284, 86037, 68283, 86037]::bigint[],
  '12.345,67 TL by arsa payı matches the independent calculation');
select is((select array_agg(amount_kurus order by block_name, door_no::int) from tt.preview('{"scope":"site"}', 'land_share', 99999)),
  array[5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5531, 6969, 5530, 6969]::bigint[],
  '999,99 TL by arsa payı: 15 leftover kuruş, ties go in door order');
select is((select array_agg(amount_kurus order by block_name, door_no::int)
             from tt.preview('{"scope":"block","block_id":"30000000-0000-0000-0000-000000000003"}', 'equal', 100005)),
  array[12501, 12501, 12501, 12501, 12501, 12500, 12500, 12500]::bigint[],
  'equal split of 1.000,05 TL over block B: 5 leftover kuruş go to doors 9-13 (door 9 comes before door 10)');
select is((select array_agg(amount_kurus) from tt.preview('{"scope":"site"}', 'equal', 1000000)), array_fill(62500::bigint, array[16]),
  '10.000 TL equal over 16 units: 625,00 TL each');
select is((select array_agg(amount_kurus order by door_no::int) from tt.preview(
    '{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002","40000000-0000-0000-0000-000000000003"]}',
    'equal', 100)),
  array[34, 33, 33]::bigint[], '1 TL over 3 units: 0,34 + 0,33 + 0,33');
select is((select array_agg(amount_kurus) from tt.preview('{"scope":"site"}', 'per_unit', 150000)), array_fill(150000::bigint, array[16]),
  'per unit: every unit pays the amount (1.500,00 TL)');
select is((select count(*)::int from tt.preview('{"scope":"site"}', 'per_unit', 150000)), 16, '...16 lines for the site');

-- m² as the weight (only two units have a size)
reset role;
update public.units set gross_m2 = 95 where id = '40000000-0000-0000-0000-000000000001';
update public.units set gross_m2 = 120 where id = '40000000-0000-0000-0000-000000000002';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select array_agg(amount_kurus order by door_no::int) from tt.preview(
    '{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002"]}',
    'gross_m2', 100000)),
  array[44186, 55814]::bigint[], 'split by m²: 95 and 120 m² share 1.000,00 TL as 441,86 and 558,14');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'gross_m2', 100000)$$, 'P0001', 'missing_weight',
  'splitting by m² is refused while some units have no m²');
select is(tt.err_detail($$select * from tt.preview('{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000003","40000000-0000-0000-0000-000000000001"]}', 'gross_m2', 100000)$$),
  'A Blok 3', '...and the error names the unit that has no m²');

reset role;
update public.units set land_share = null where id = '40000000-0000-0000-0000-000000000003';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'land_share', 1000000)$$, 'P0001', 'missing_weight',
  'splitting by arsa payı is refused while a unit has no arsa payı (it is never treated as 0)');
select lives_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000000)$$, '...but an equal split still works');
reset role;
update public.units set land_share = 100 where id = '40000000-0000-0000-0000-000000000003';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

-- input rules
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 5)$$, 'P0001', 'amount_too_small',
  '5 kuruş cannot be shared between 16 units (a line would be 0,00 TL)');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 0)$$, 'P0001', 'amount_invalid', 'zero is refused');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', -100)$$, 'P0001', 'amount_invalid', 'a negative amount is refused');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000000000)$$, 'P0001', 'amount_invalid', 'more than 9.999.999,99 TL is refused');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'bogus', 1000)$$, 'P0001', 'split_invalid', 'an unknown split method is refused');

-- targets
select throws_ok($$select * from tt.preview('{"scope":"block","block_id":"30000000-0000-0000-0000-000000000002"}', 'equal', 1000)$$,
  'P0001', 'target_invalid', 'a block of another site is refused');
select throws_ok($$select * from tt.preview('{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-0000000000f1"]}', 'equal', 1000)$$,
  'P0001', 'target_invalid', 'one unit of another site in the list refuses the whole list');
select throws_ok($$select * from tt.preview('{"scope":"units","unit_ids":["not-a-uuid"]}', 'equal', 1000)$$, 'P0001', 'target_invalid', 'a malformed unit id is refused');
select throws_ok($$select * from tt.preview('{"scope":"units","unit_ids":[]}', 'equal', 1000)$$, 'P0001', 'target_invalid', 'an empty list is refused');
select throws_ok($$select * from tt.preview('{"scope":"everything"}', 'equal', 1000)$$, 'P0001', 'target_invalid', 'an unknown scope is refused');
select throws_ok($$select * from tt.preview(null, 'equal', 1000)$$, 'P0001', 'target_invalid', 'no target is refused');
select throws_ok($$select * from tt.preview('{"scope":"block","block_id":"30000000-0000-0000-0000-000000000004"}', 'equal', 1000)$$,
  'P0001', 'no_units', 'a block without units is refused');

reset role;
update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000016';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from tt.preview('{"scope":"site"}', 'equal', 1000000)), 15, 'an archived unit is not charged');
select throws_ok($$select * from tt.preview('{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000016"]}', 'equal', 1000)$$,
  'P0001', 'target_invalid', 'an archived unit cannot be picked by id');
reset role;
update public.units set archived_at = null where id = '40000000-0000-0000-0000-000000000016';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.charges), 0, 'previews wrote nothing');

-- ---------------------------------------------------------------------------
-- 4. Admin A: creating (batch B1 = 10.000 TL by arsa payı over the whole site)
-- ---------------------------------------------------------------------------
select isnt(tt.create_b('e0000000-0000-0000-0000-000000000001', '{"scope":"site"}', 'land_share', 1000000, 16, 1000000,
                        date '2026-11-01', date '2026-11-30', '  Kasım 2026 aidatı  ', true, null, null),
  null, 'a bulk charge is created and its batch id returned');
select is((select total::text || '/' || unit_count || '/' || amount::text || '/' || split_method from public.charge_batches
            where request_id = 'e0000000-0000-0000-0000-000000000001'),
  '10000.00/16/10000.00/land_share', 'the batch records total, unit count and what the admin typed');
select is((select count(*)::int from public.charges c join public.charge_batches b on b.id = c.batch_id
            where b.request_id = 'e0000000-0000-0000-0000-000000000001'), 16, '16 charge lines were created');
select is((select sum(c.amount) from public.charges c join public.charge_batches b on b.id = c.batch_id
            where b.request_id = 'e0000000-0000-0000-0000-000000000001'),
  (select total from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001'),
  'the sum of the lines equals the batch total (plan: preview total equals database total)');
select is((select count(*)::int from public.charges c
             join tt.preview('{"scope":"site"}', 'land_share', 1000000) p on p.unit_id = c.unit_id and c.amount * 100 = p.amount_kurus), 16,
  'every created line has exactly the amount the preview showed');
select is((select description || '/' || to_char(period, 'YYYY-MM-DD') || '/' || to_char(due_date, 'YYYY-MM-DD') || '/' || tenant_visible
             from public.charges where unit_id = '40000000-0000-0000-0000-000000000001'),
  'Kasım 2026 aidatı/2026-11-01/2026-11-30/true', 'description (trimmed), period, due date and tenant visibility are stored');
select is((select created_by from public.charges where unit_id = '40000000-0000-0000-0000-000000000001'),
  'a1000000-0000-0000-0000-000000000001'::uuid, 'the creator is the logged-in admin (not something the browser sends)');
select is((select active_count || '/' || active_total::text from public.charge_batch_summary
            where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001')),
  '16/10000.00', 'the summary view shows 16 active lines and 10000.00');
select is((select count(*)::int from public.charge_batch_summary where site_id = '20000000-0000-0000-0000-0000000000a1'), 1,
  'the summary view can be filtered by site');

-- double click / retry
select is(tt.create_b('e0000000-0000-0000-0000-000000000001', '{"scope":"site"}', 'land_share', 1000000, 16, 1000000),
  (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001'),
  'sending the same request id again returns the same batch');
select is((select count(*)::int from public.charge_batches) || '/' || (select count(*)::int from public.charges), '1/16',
  '...and charges nothing twice');

-- refused creations leave nothing behind
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'land_share', 1000000, 15, 1000000)$$,
  'P0001', 'preview_outdated', 'a different unit count than the preview is refused');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'land_share', 1000000, 16, 999999)$$,
  'P0001', 'preview_outdated', 'a different total than the preview is refused');
select throws_ok($$select public.create_charge_batch(null, '20000000-0000-0000-0000-0000000000a1', '{"scope":"site"}', 'equal', 1000000,
    'cccccccc-0000-0000-0000-000000000001', date '2026-11-01', date '2026-11-30', null, true, null, null, 16, 1000000)$$,
  'P0001', 'invalid_request', 'a request id is required');
select throws_ok($$select public.create_charge_batch('e0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-0000000000a1', '{"scope":"site"}', 'equal', 1000000,
    'cccccccc-0000-0000-0000-000000000001', date '2026-11-01', date '2026-11-30', null, true, null, null, null, null)$$,
  'P0001', 'invalid_request', 'the preview numbers are required');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'equal', 1000000, 16, 1000000,
    p_type => 'cccccccc-0000-0000-0000-00000000000b')$$, 'P0001', 'charge_type_invalid', 'a charge type of another company is refused');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'equal', 1000000, 16, 1000000,
    p_karar_no => '2026/5')$$, 'P0001', 'karar_invalid', 'a decision number without a decision date is refused');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'equal', 1000000, 16, 1000000,
    p_period => date '2026-11-15')$$, 'P0001', 'period_invalid', 'a period that is not the first of a month is refused');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'equal', 1000000, 16, 1000000,
    p_due => null)$$, 'P0001', 'due_date_invalid', 'a due date is required');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'equal', 1000000, 16, 1000000,
    p_desc => repeat('x', 201))$$, 'P0001', 'description_invalid', 'a description over 200 characters is refused');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'equal', 1000000, 16, 1000000,
    p_visible => null)$$, 'P0001', 'invalid_request', 'tenant visibility must be chosen');
reset role;
update public.units set land_share = null where id = '40000000-0000-0000-0000-000000000003';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000002', '{"scope":"site"}', 'land_share', 1000000, 16, 1000000)$$,
  'P0001', 'missing_weight', 'creating by arsa payı is refused while a unit has none');
reset role;
update public.units set land_share = 100 where id = '40000000-0000-0000-0000-000000000003';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.charge_batches) || '/' || (select count(*)::int from public.charges), '1/16',
  'none of the refused attempts left a batch or a charge behind');

-- a single charge = a batch of one unit (B2: 123,45 TL on door 5)
select lives_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000003',
    '{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000005"]}', 'per_unit', 12345, 1, 12345,
    p_desc => 'Anahtar bedeli')$$, 'a single charge works as a batch of one unit');
select is((select amount::text from public.charges where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000003')), '123.45', '...of 123,45 TL');
select is((select amount::text || '/' || total::text || '/' || unit_count from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000003'),
  '123.45/123.45/1', '...and the batch keeps the kuruş too (typed amount, total, count)');

-- ---------------------------------------------------------------------------
-- 5. Admin A: direct writes and edits
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.charges (unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible)
    select unit_id, charge_type_id, batch_id, 1, due_date, true from public.charges limit 1$$, '42501', null,
  'an admin cannot insert a charge directly');
select throws_ok($$delete from public.charges$$, '42501', null, 'an admin cannot delete charges directly');
select throws_ok($$update public.charges set unit_id = '40000000-0000-0000-0000-000000000009'$$, '42501', null, 'the unit of a charge cannot be changed');
select throws_ok($$update public.charges set voided_at = now(), void_reason = 'x'$$, '42501', null, 'a charge cannot be voided by a plain update');
select throws_ok($$update public.charge_batches set total = 1$$, '42501', null, 'a batch cannot be edited');
select lives_ok($$update public.charges set amount = 650.00, description = 'Düzeltildi', tenant_visible = false
    where unit_id = '40000000-0000-0000-0000-000000000001'$$, 'an admin can edit amount, description and tenant visibility');
select is((select amount::text || '/' || description || '/' || tenant_visible from public.charges where unit_id = '40000000-0000-0000-0000-000000000001'),
  '650.00/Düzeltildi/false', '...and they changed');
select throws_ok($$update public.charges set amount = 0 where unit_id = '40000000-0000-0000-0000-000000000001'$$, '23514', null, 'an amount of 0 is refused');
select throws_ok($$update public.charges set amount = 10000000 where unit_id = '40000000-0000-0000-0000-000000000001'$$, '23514', null,
  'an amount above 9.999.999,99 TL is refused');

-- ---------------------------------------------------------------------------
-- 6. Everybody else sees and can do nothing
-- ---------------------------------------------------------------------------
reset role;
insert into public.recurring_plans (id, site_id, name, charge_type_id, amount, split_method, day_of_month, target)
values ('f0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000a1', 'Test planı',
        'cccccccc-0000-0000-0000-000000000001', 100, 'per_unit', 5, '{"scope":"site"}');

create function pg_temp.seen() returns text language sql as $$
  select (select count(*) from public.charges) || '/' || (select count(*) from public.charge_batches) || '/'
      || (select count(*) from public.recurring_plans) || '/' || (select count(*) from public.charge_batch_summary);
$$;
create function pg_temp.types_of_firma1() returns bigint language sql as $$
  select count(*) from public.charge_types where company_id = '10000000-0000-0000-0000-0000000000c1';
$$;

-- admin A sees the ledger
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is(pg_temp.seen(), '17/2/1/2', 'admin A sees 17 charges, 2 batches, 1 plan and 2 summaries');
select is(pg_temp.types_of_firma1(), 6::bigint, '...and the 6 charge types of the company');

-- the owner and the tenant: nothing yet (resident rules arrive with slice 5)
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is(pg_temp.seen(), '0/0/0/0', 'an owner sees no charge data yet (default deny until slice 5)');
select is(pg_temp.types_of_firma1(), 0::bigint, '...and no charge types');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000)$$, '42501', 'not allowed', 'an owner cannot preview');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-0000000000f1', '{"scope":"site"}', 'equal', 1000000, 16, 1000000)$$,
  '42501', 'not allowed', 'an owner cannot create charges');
select throws_ok($$select public.void_charge((select id from public.charges limit 1), 'deneme deneme')$$, '42501', null, 'an owner cannot void a charge');
reset role;
select pg_temp.act_as('b2000000-0000-0000-0000-000000000002');
select is(pg_temp.seen(), '0/0/0/0', 'a tenant sees no charge data yet');

-- a stranger
reset role;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is(pg_temp.seen(), '0/0/0/0', 'a stranger sees nothing');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000)$$, '42501', 'not allowed', 'a stranger cannot preview');

-- the deactivated admin of the same site
reset role;
select pg_temp.act_as('d1000000-0000-0000-0000-000000000001');
select is(pg_temp.seen(), '0/0/0/0', 'a deactivated admin sees nothing');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000)$$, '42501', 'not allowed', 'a deactivated admin cannot preview');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-0000000000f1', '{"scope":"site"}', 'equal', 1000000, 16, 1000000)$$,
  '42501', 'not allowed', 'a deactivated admin cannot create charges');

-- the admin of another company
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is(pg_temp.seen(), '0/0/0/0', 'the admin of another company sees nothing of this site');
select is(pg_temp.types_of_firma1(), 0::bigint, '...not even its charge types');
select is((select count(*)::int from public.charge_types), 6, '...only the 6 types of its own company');
select throws_ok($$select * from tt.preview('{"scope":"site"}', 'equal', 1000)$$, '42501', 'not allowed', 'it cannot preview this site');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-0000000000f2', '{"scope":"site"}', 'equal', 1000000, 16, 1000000)$$,
  '42501', 'not allowed', 'it cannot create charges for this site');
select throws_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000001', '{"scope":"site"}', 'equal', 160000, 1, 160000,
    p_site => '20000000-0000-0000-0000-0000000000a2', p_type => 'cccccccc-0000-0000-0000-00000000000b')$$,
  'P0001', 'request_id_used', 'it cannot use a request id that belongs to another site''s batch');
select throws_ok($$select public.void_charge((select id from public.charges where unit_id = '40000000-0000-0000-0000-000000000001'), 'deneme deneme')$$,
  '42501', null, 'it cannot void this site''s charges (it cannot even see them)');
select throws_ok($$select public.void_charge_batch((select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001'), 'deneme deneme')$$,
  '42501', null, 'it cannot void this site''s batch');
select throws_ok($$select public.delete_charge_batch((select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001'))$$,
  '42501', null, 'it cannot delete this site''s batch');
select throws_ok($$select public.generate_recurring_batch('f0000000-0000-0000-0000-000000000001')$$, '42501', null, 'it cannot generate from this site''s plan');
select throws_ok($$select tt.save_plan('f0000000-0000-0000-0000-000000000001', 100, p_site => '20000000-0000-0000-0000-0000000000a2',
    p_type => 'cccccccc-0000-0000-0000-00000000000b', p_target => '{"scope":"site"}')$$,
  '42501', 'not allowed', 'it cannot edit this site''s plan by naming its own site');
select throws_ok($$select public.set_recurring_plan_active('f0000000-0000-0000-0000-000000000001', false)$$, '42501', null, 'it cannot switch this site''s plan off');
update public.charges set amount = 1 where unit_id = '40000000-0000-0000-0000-000000000002';
reset role;
select is((select amount::text from public.charges where unit_id = '40000000-0000-0000-0000-000000000002'
            and batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001')), '696.90',
  'an update from the other company changed nothing (the row is invisible to it)');

-- ---------------------------------------------------------------------------
-- 7. Void (nothing is deleted)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select public.void_charge((select id from public.charges where unit_id = '40000000-0000-0000-0000-000000000003'), 'Yanlış daireye yazıldı')$$,
  'an admin can void one line with a reason');
select is((select (voided_at is not null)::text || '/' || void_reason || '/' || (voided_by = 'a1000000-0000-0000-0000-000000000001')::text
             from public.charges where unit_id = '40000000-0000-0000-0000-000000000003'),
  'true/Yanlış daireye yazıldı/true', '...the line stays, with the reason and who voided it');
select is((select active_count || '/' || active_total::text from public.charge_batch_summary
            where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001')),
  '15/9543.80', '...and the summary no longer counts it (10.000,00 + 96,90 for the edited door 1 - 553,10 = 9.543,80)');
select throws_ok($$select public.void_charge((select id from public.charges where unit_id = '40000000-0000-0000-0000-000000000003'), 'tekrar tekrar')$$,
  'P0001', 'already_voided', 'a voided line cannot be voided again');
select throws_ok($$select public.void_charge((select id from public.charges where unit_id = '40000000-0000-0000-0000-000000000004'), 'ab')$$,
  'P0001', 'reason_invalid', 'a reason of fewer than 3 characters is refused');
select throws_ok($$select public.void_charge((select id from public.charges where unit_id = '40000000-0000-0000-0000-000000000004'), null)$$,
  'P0001', 'reason_invalid', 'a reason is required');
select throws_ok($$update public.charges set amount = 5 where unit_id = '40000000-0000-0000-0000-000000000003'$$, '23514', 'charge_voided',
  'the amount of a voided line is frozen');
select throws_ok($$update public.charges set tenant_visible = false where unit_id = '40000000-0000-0000-0000-000000000003'$$, '23514', 'charge_voided',
  'so is its tenant visibility');
select lives_ok($$update public.charges set description = 'Not eklendi' where unit_id = '40000000-0000-0000-0000-000000000003'$$,
  'but its description can still be corrected');

-- ---------------------------------------------------------------------------
-- 8a. Undo a whole batch
-- ---------------------------------------------------------------------------
select lives_ok($$select public.void_charge_batch((select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001'), 'Yanlış dönem')$$,
  'an admin can undo a whole batch');
select is((select count(*)::int from public.charges where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001')
            and voided_at is null), 0, '...every line of it is now voided');
select is((select void_reason from public.charges where unit_id = '40000000-0000-0000-0000-000000000003'), 'Yanlış daireye yazıldı',
  '...a line voided earlier keeps its own reason');
select is((select void_reason from public.charges where unit_id = '40000000-0000-0000-0000-000000000004'), 'Yanlış dönem', '...the others get the batch reason');
select is((select active_count || '/' || active_total::text from public.charge_batch_summary
            where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001')), '0/0.00',
  '...the summary shows 0 active lines');
select throws_ok($$select public.void_charge_batch((select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000001'), 'tekrar tekrar')$$,
  'P0001', 'already_voided', 'a voided batch cannot be voided again');

-- ---------------------------------------------------------------------------
-- 8b. A unit with an active charge cannot be archived (ledger exists)
-- ---------------------------------------------------------------------------
select throws_ok($$update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000005'$$, '23514', 'unit has charges',
  'a unit with an active charge cannot be archived');
select lives_ok($$select public.void_charge((select id from public.charges where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000003')), 'Yanlışlıkla girildi')$$,
  'void that charge');
select lives_ok($$update public.units set archived_at = now() where id = '40000000-0000-0000-0000-000000000005'$$,
  '...and the unit can be archived (only voided lines are left)');
select is((select count(*)::int from public.charges where batch_id = (select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000003') and voided_at is not null), 1, '...and the voided line is still in the ledger');
reset role;
update public.units set archived_at = null where id = '40000000-0000-0000-0000-000000000005';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 9. Hard delete only inside 15 minutes
-- ---------------------------------------------------------------------------
select lives_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000004',
    '{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000006"]}', 'per_unit', 5000, 1, 5000)$$, 'create a fresh batch');
select lives_ok($$select public.delete_charge_batch((select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000004'))$$,
  'a batch can be deleted right after it was made');
select is((select count(*)::int from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000004')
        + (select count(*)::int from public.charges where unit_id = '40000000-0000-0000-0000-000000000006' and amount = 50.00), 0,
  '...with its lines');
select lives_ok($$select tt.create_b('e0000000-0000-0000-0000-000000000005',
    '{"scope":"units","unit_ids":["40000000-0000-0000-0000-000000000006"]}', 'per_unit', 5000, 1, 5000)$$, 'create another batch');
reset role;
update public.charge_batches set created_at = now() - interval '16 minutes' where request_id = 'e0000000-0000-0000-0000-000000000005';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.delete_charge_batch((select id from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000005'))$$,
  'P0001', 'delete_window_closed', 'after 15 minutes a batch can no longer be deleted (void it instead)');
select is((select count(*)::int from public.charge_batches where request_id = 'e0000000-0000-0000-0000-000000000005'), 1, '...it is still there');

-- ---------------------------------------------------------------------------
-- 10. Monthly plans and "Bu ayı oluştur"
-- ---------------------------------------------------------------------------
reset role;
delete from public.recurring_plans where id = 'f0000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

select lives_ok($$select tt.save_plan(null, 150000, p_target => '{"scope":"site","evil":"x"}')$$,
  'create a plan (1.500,00 TL per unit, due on the 5th)');
reset role;
-- the id was chosen by the database, not by us: find it
create temp table plan_ids as select id from public.recurring_plans;
grant select on plan_ids to authenticated;
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from plan_ids), 1, 'one plan exists');
select is((select target::text from public.recurring_plans), '{"scope": "site"}', 'unknown keys in the target are dropped');
select is((select amount::text || '/' || day_of_month || '/' || active from public.recurring_plans), '1500.00/5/true', 'the plan is stored');

select throws_ok($$select tt.save_plan(null, 150000, p_day => 29)$$, 'P0001', 'day_invalid', 'a due day above 28 is refused');
select throws_ok($$select tt.save_plan(null, 150000, p_day => 0)$$, 'P0001', 'day_invalid', 'a due day of 0 is refused');
select throws_ok($$select tt.save_plan(null, 150000, p_name => '   ')$$, 'P0001', 'name_invalid', 'a plan needs a name');
select throws_ok($$select tt.save_plan(null, 150000, 'gross_m2')$$, 'P0001', 'missing_weight', 'a plan by m² is refused at save time while units have no m²');
select throws_ok($$select tt.save_plan(null, 150000, p_karar_no => '2026/5')$$, 'P0001', 'karar_invalid', 'a decision number without a date is refused');
select lives_ok($$select tt.save_plan(null, 99999999, p_name => 'Büyük ama yeni')$$, 'a NEW plan never needs a decision (nothing to compare with)');
reset role;
delete from public.recurring_plans where name = 'Büyük ama yeni';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

-- generate this month
select lives_ok($$select public.generate_recurring_batch((select id from plan_ids))$$, '"Bu ayı oluştur" creates this month''s batch');
select is((select (period = date_trunc('month', now() at time zone 'Europe/Istanbul')::date)::text || '/' || (due_date = period + 4)::text
             || '/' || unit_count || '/' || total::text || '/' || (recurring_plan_id = (select id from plan_ids))::text
             from public.charge_batches where recurring_plan_id is not null),
  'true/true/16/24000.00/true', '...for the current Istanbul month, due on the 5th, 16 units, 24.000,00 TL');
select is((select count(*)::int from public.charges where amount = 1500.00 and batch_id in (select id from public.charge_batches where recurring_plan_id is not null)), 16,
  '...with 16 lines of 1.500,00 TL');
select throws_ok($$select public.generate_recurring_batch((select id from plan_ids))$$, 'P0001', 'already_generated',
  'pressing it a second time for the same month is refused');
select is((select count(*)::int from public.charge_batches where recurring_plan_id is not null), 1, '...and no second batch exists');
select lives_ok($$select public.void_charge_batch((select id from public.charge_batches where recurring_plan_id is not null), 'Yanlış tutar')$$, 'undo it');
select lives_ok($$select public.generate_recurring_batch((select id from plan_ids))$$, '...then the month can be generated again');
select is((select count(*)::int || '/' || count(*) filter (where voided_at is null) from public.charge_batches where recurring_plan_id is not null), '2/1',
  '...two batches exist, one of them voided');
select lives_ok($$select public.set_recurring_plan_active((select id from plan_ids), false)$$, 'a plan can be switched off');
select throws_ok($$select public.generate_recurring_batch((select id from plan_ids))$$, 'P0001', 'plan_inactive', '...then it cannot generate');
select lives_ok($$select public.set_recurring_plan_active((select id from plan_ids), true)$$, '...and switched on again');

-- the aidat increase rule (YDO 25,49 % by default). Plan: 1.500,00 TL per unit.
select throws_ok($$select tt.save_plan((select id from plan_ids), 188236)$$, 'P0001', 'karar_required',
  'a rise of more than 25,49 % (1.882,36 TL) needs a decision number and date');
select lives_ok($$select tt.save_plan((select id from plan_ids), 188235)$$, 'exactly 25,49 % (1.882,35 TL) is allowed');
select lives_ok($$select tt.save_plan((select id from plan_ids), 300000, p_karar_no => '2026/7', p_karar_date => date '2026-11-02')$$,
  'a big rise is allowed with a decision number and date');
select is((select karar_no || '/' || karar_date::text || '/' || amount::text from public.recurring_plans), '2026/7/2026-11-02/3000.00',
  '...and the decision is stored on the plan');
select lives_ok($$select tt.save_plan((select id from plan_ids), 100000)$$, 'a decrease never needs a decision');
reset role;
update public.companies set settings = '{"ydo_rate":"10"}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$select tt.save_plan((select id from plan_ids), 110000)$$, 'with a YDO of 10 in Ayarlar, +10 % (1.100,00 TL) is allowed');
select throws_ok($$select tt.save_plan((select id from plan_ids), 121001)$$, 'P0001', 'karar_required', '...and 1.210,01 TL (a little over +10 %) is not');
reset role;
update public.companies set settings = '{}' where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');

-- changing the method cannot dodge the rule (the average per unit is compared)
select lives_ok($$select tt.save_plan((select id from plan_ids), 1600000, 'equal')$$, 'switching to "equal, 16.000,00 TL in total" (average 1.000,00 TL) is a decrease: allowed');
select throws_ok($$select tt.save_plan((select id from plan_ids), 125491, 'per_unit')$$, 'P0001', 'karar_required',
  'switching to 1.254,91 TL per unit is +25,491 % of the old average: needs a decision');
select lives_ok($$select tt.save_plan((select id from plan_ids), 125490, 'per_unit')$$, '...1.254,90 TL per unit is exactly the limit: allowed');

-- plans and the other roles
reset role;
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.recurring_plans), 0, 'the other company''s admin sees no plan');
select throws_ok($$select public.generate_recurring_batch((select id from plan_ids))$$, '42501', null, '...and cannot generate it');
select throws_ok($$select public.set_recurring_plan_active((select id from plan_ids), false)$$, '42501', null, '...or switch it off');
reset role;
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$select public.generate_recurring_batch((select id from plan_ids))$$, '42501', null, 'a resident cannot generate charges');
select throws_ok($$select tt.save_plan(null, 100)$$, '42501', 'not allowed', 'a resident cannot make a plan');

reset role;
select * from finish();
rollback;
