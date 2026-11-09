-- 0003_charges.sql
-- Slice 4: charges (Borçlandırma). Plan sections 8, 9, 14 and 18.
--
-- What is added
--   1. charge_types       Aidat, Yakıt, Demirbaş ... (default rows are created for every company)
--   2. recurring_plans    a monthly template ("every month 1.500 TL aidat per daire")
--   3. charge_batches     one bulk operation (for undo and audit)
--   4. charges            each debt line (tahakkuk) of one unit
--   5. RPCs               the ONLY way to create, void or delete charges (see below)
--   6. charge_batch_summary (a view with live counts and totals)
--   7. the archive guard from 0002 now also looks at charges
--
-- Safety rules used here (same as 0001 and 0002)
--   * RLS is ON for every table, in this file. Grants are explicit.
--   * MONEY IS COMPUTED IN SQL. The browser never sends a computed per-unit amount. It sends
--     "how much" and "how to split", and the database splits it. The preview and the real
--     creation call the SAME function (private.split_charge), so they always agree.
--   * Amounts travel as integer kuruş (1 TL = 100 kuruş). No floating point anywhere.
--   * Nobody gets INSERT or DELETE on charges, charge_batches or recurring_plans. Admins call
--     the functions below. Each function checks WHO is calling inside its own body (public
--     functions are reachable through /rest/v1/rpc), and access is granted to "authenticated" only.
--   * Errors are short machine codes (for example 'preview_outdated'). The app turns them into
--     Turkish sentences. Permission problems use SQLSTATE 42501.
--   * Dates use Istanbul time.
--
-- Left for later slices (on purpose):
--   * Residents cannot read charges yet. Default-deny is safe. Slice 5 adds and tests the
--     owner / tenant rules (and a NEW tenant must not see the previous tenant's charges).
--   * Slice 6 (payments) must extend: "amount and due date can change only while NO payment
--     allocation exists" (trigger private.guard_charge_update), and "a charge or batch with
--     allocations cannot be voided" (void_charge, void_charge_batch). Deleting a batch is
--     already blocked by a foreign key once allocations point at its charges.
--   * Notifications to residents (slice 8) and the audit log (slice 10).
--   * Automatic late fees (Gecikme Tazminatı): they need payment data to know what is overdue.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.charge_types (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies (id) on delete restrict,
  code                    text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name                    text not null check (char_length(btrim(name)) between 1 and 100),
  tenant_visible_default  boolean not null default true,
  -- The split method the wizard pre-selects. The admin can always pick another one.
  default_split           text not null default 'land_share'
                          check (default_split in ('equal', 'land_share', 'gross_m2', 'per_unit')),
  active                  boolean not null default true,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now(),
  unique (company_id, code)
);

-- A monthly template. "Bu ayı oluştur" turns a plan into one batch for the current month.
create table public.recurring_plans (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete restrict,
  name            text not null check (char_length(btrim(name)) between 1 and 100),
  charge_type_id  uuid not null references public.charge_types (id) on delete restrict,
  -- With split_method 'per_unit' this is the amount of EACH unit. With the other methods it is
  -- the TOTAL that is shared between the units.
  amount          numeric(12, 2) not null check (amount > 0 and amount <= 9999999.99),
  split_method    text not null check (split_method in ('equal', 'land_share', 'gross_m2', 'per_unit')),
  -- The due day of every month. 1-28 so that every month has that day.
  day_of_month    integer not null check (day_of_month between 1 and 28),
  -- {"scope":"site"} | {"scope":"block","block_id":"..."} | {"scope":"units","unit_ids":["..."]}
  target          jsonb not null,
  tenant_visible  boolean not null default true,
  description     text check (description is null or char_length(description) <= 200),
  active          boolean not null default true,
  -- Kat malikleri kurulu decision. Required when the amount rises above the YDO (see save_recurring_plan).
  karar_no        text check (karar_no is null or char_length(karar_no) between 1 and 60),
  karar_date      date,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((karar_no is null) = (karar_date is null))
);
create index recurring_plans_site_id_idx on public.recurring_plans (site_id);

-- One bulk operation. Also used for a single charge (a batch of one unit).
create table public.charge_batches (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites (id) on delete restrict,
  charge_type_id     uuid not null references public.charge_types (id) on delete restrict,
  recurring_plan_id  uuid references public.recurring_plans (id) on delete restrict,
  -- A random id made by the browser for each "confirm" screen. A double click or a network retry
  -- sends the same id, and the second call returns the first batch instead of charging twice.
  request_id         uuid unique,
  target             jsonb not null,
  split_method       text not null check (split_method in ('equal', 'land_share', 'gross_m2', 'per_unit')),
  -- What the admin typed (per unit, or the total to share, depending on split_method).
  amount             numeric(12, 2) not null check (amount > 0 and amount <= 9999999.99),
  unit_count         integer not null check (unit_count >= 1),
  -- The sum of all lines when the batch was created. Always equals the sum of its charges at that moment.
  total              numeric(14, 2) not null check (total > 0),
  period             date check (period is null or extract(day from period) = 1),
  due_date           date not null,
  description        text check (description is null or char_length(description) <= 200),
  tenant_visible     boolean not null,
  karar_no           text check (karar_no is null or char_length(karar_no) between 1 and 60),
  karar_date         date,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  voided_at          timestamptz,
  voided_by          uuid references public.profiles (id) on delete set null,
  void_reason        text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 300),
  check ((karar_no is null) = (karar_date is null)),
  check ((voided_at is null) = (void_reason is null))
);
create index charge_batches_site_id_idx on public.charge_batches (site_id, created_at desc);
-- "Bu ayı oluştur" twice for the same plan and month must not charge twice.
-- A voided batch frees the month again.
create unique index charge_batches_plan_period_unique
  on public.charge_batches (recurring_plan_id, period)
  where recurring_plan_id is not null and voided_at is null;

-- Each debt line (tahakkuk) of one unit.
create table public.charges (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete restrict,
  charge_type_id  uuid not null references public.charge_types (id) on delete restrict,
  -- cascade: deleting a batch (allowed for 15 minutes) removes its lines. Slice 6 adds a
  -- foreign key from payment allocations with "restrict", which then protects paid lines.
  batch_id        uuid not null references public.charge_batches (id) on delete cascade,
  period          date check (period is null or extract(day from period) = 1),
  description     text check (description is null or char_length(description) <= 200),
  amount          numeric(12, 2) not null check (amount > 0 and amount <= 9999999.99),
  due_date        date not null,
  tenant_visible  boolean not null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references public.profiles (id) on delete set null,
  void_reason     text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 300),
  check ((voided_at is null) = (void_reason is null))
);
create index charges_unit_id_idx on public.charges (unit_id);
create index charges_batch_id_idx on public.charges (batch_id);
create index charges_period_idx on public.charges (period);

create trigger recurring_plans_touch_updated_at before update on public.recurring_plans
  for each row execute function private.touch_updated_at();
create trigger charges_touch_updated_at before update on public.charges
  for each row execute function private.touch_updated_at();

-- A voided line is history: its amount, due date and visibility are frozen. (The description
-- may still be fixed.) Slice 6 adds: and no payment allocation exists.
create or replace function private.guard_charge_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.voided_at is not null
     and (new.amount, new.due_date, new.tenant_visible) is distinct from (old.amount, old.due_date, old.tenant_visible)
  then
    raise exception 'charge_voided' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger charges_guard_update before update on public.charges
  for each row execute function private.guard_charge_update();

revoke all on function private.guard_charge_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Default charge types for every company (existing and future)
-- ---------------------------------------------------------------------------
-- seed.sql does NOT run on the hosted project, so the migration itself creates the rows.
create or replace function private.seed_charge_types(p_company uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.charge_types (company_id, code, name, tenant_visible_default, default_split, sort_order)
  values
    (p_company, 'aidat',             'Aidat',              true,  'per_unit',   1),
    (p_company, 'yakit',             'Yakıt',              true,  'land_share', 2),
    (p_company, 'demirbas',          'Demirbaş',           false, 'land_share', 3),
    (p_company, 'ek_toplama',        'Ek Toplama',         false, 'land_share', 4),
    (p_company, 'gecikme_tazminati', 'Gecikme Tazminatı',  true,  'per_unit',   5),
    (p_company, 'devir',             'Devir Bakiyesi',     false, 'per_unit',   6)
  on conflict (company_id, code) do nothing;
$$;

create or replace function private.companies_seed_charge_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_charge_types(new.id);
  return new;
end;
$$;

create trigger companies_seed_charge_types after insert on public.companies
  for each row execute function private.companies_seed_charge_types();

select private.seed_charge_types(c.id) from public.companies c;

revoke all on function private.seed_charge_types(uuid) from public, anon, authenticated;
revoke all on function private.companies_seed_charge_types() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers (private schema: the browser cannot call these)
-- ---------------------------------------------------------------------------

-- The first day of the month that contains this moment, in Istanbul. From 00:00 to 03:00 on the
-- 1st it is still the PREVIOUS month in UTC, so a plain date_trunc(now()) would be wrong then.
create or replace function private.istanbul_month(p_at timestamptz default now())
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Europe/Istanbul')::date;
$$;

-- Yıllık yeniden değerleme oranı (YDO), percent. The admin sets it in Ayarlar (companies.settings
-- -> 'ydo_rate'). Default 25.49 = the 2026 rate named in the plan (KMK amendment of 22 May 2026).
create or replace function private.company_ydo(p_company uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when c.settings ->> 'ydo_rate' ~ '^[0-9]{1,3}([.][0-9]{1,4})?$'
                 then (c.settings ->> 'ydo_rate')::numeric end
       from public.companies c where c.id = p_company),
    25.49);
$$;

-- Which units does a target mean? Validates the target and returns the unit ids plus a clean
-- copy of the target (only the keys we know). Archived units are never part of a target.
--   {"scope":"site"}                              all active units of the site
--   {"scope":"block","block_id":"..."}            all active units of one block of the site
--   {"scope":"units","unit_ids":["...", ...]}     exactly these units (every one must be active and in the site)
create or replace function private.resolve_target(
  p_site uuid,
  p_target jsonb,
  p_allow_empty boolean default false,
  out o_units uuid[],
  out o_target jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope     text;
  v_block     uuid;
  v_requested uuid[];
begin
  if p_target is null or jsonb_typeof(p_target) <> 'object' then
    raise exception 'target_invalid';
  end if;
  v_scope := p_target ->> 'scope';

  if v_scope = 'site' then
    o_target := jsonb_build_object('scope', 'site');
    select array_agg(u.id) into o_units
      from public.units u join public.blocks b on b.id = u.block_id
     where b.site_id = p_site and u.archived_at is null;

  elsif v_scope = 'block' then
    begin
      v_block := (p_target ->> 'block_id')::uuid;
    exception when others then
      raise exception 'target_invalid';
    end;
    if v_block is null or not exists (select 1 from public.blocks b where b.id = v_block and b.site_id = p_site) then
      raise exception 'target_invalid';
    end if;
    o_target := jsonb_build_object('scope', 'block', 'block_id', v_block);
    select array_agg(u.id) into o_units
      from public.units u where u.block_id = v_block and u.archived_at is null;

  elsif v_scope = 'units' then
    if jsonb_typeof(p_target -> 'unit_ids') <> 'array' or jsonb_array_length(p_target -> 'unit_ids') not between 1 and 500 then
      raise exception 'target_invalid';
    end if;
    begin
      select array_agg(distinct x::uuid) into v_requested from jsonb_array_elements_text(p_target -> 'unit_ids') as x;
    exception when others then
      raise exception 'target_invalid';
    end;
    select array_agg(u.id) into o_units
      from public.units u join public.blocks b on b.id = u.block_id
     where u.id = any (v_requested) and b.site_id = p_site and u.archived_at is null;
    if coalesce(cardinality(o_units), 0) <> cardinality(v_requested) then
      raise exception 'target_invalid';   -- a unit of another site, archived, or unknown
    end if;
    o_target := jsonb_build_object('scope', 'units', 'unit_ids', to_jsonb(v_requested));

  else
    raise exception 'target_invalid';
  end if;

  if coalesce(cardinality(o_units), 0) = 0 then
    if p_allow_empty then
      o_units := array[]::uuid[];
    else
      raise exception 'no_units';
    end if;
  end if;
end;
$$;

-- THE split. Both the preview and the real creation use it.
--
-- Methods
--   per_unit    every unit pays the amount (p_amount_kurus is the amount of EACH unit)
--   equal       the amount is a TOTAL, shared equally
--   land_share  the amount is a TOTAL, shared by arsa payı (units.land_share)
--   gross_m2    the amount is a TOTAL, shared by brüt m² (units.gross_m2)
--
-- Rounding (largest remainder): every unit first gets the whole kuruş it is owed. The kuruş left
-- over (always fewer than the number of units) go one by one to the units with the biggest
-- fractional remainder. Ties are broken in this fixed order: block name, door number (numbers
-- sort as numbers: 2 before 10), unit id. So the lines always add up to the total, to the kuruş.
create or replace function private.split_charge(p_units uuid[], p_method text, p_amount_kurus bigint)
returns table (unit_id uuid, block_name text, door_no text, weight numeric, amount_kurus bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_missing text;
  v_row     record;
begin
  if p_method is null or p_method not in ('equal', 'land_share', 'gross_m2', 'per_unit') then
    raise exception 'split_invalid';
  end if;
  if p_amount_kurus is null or p_amount_kurus < 1 or p_amount_kurus > 999999999 then
    raise exception 'amount_invalid';   -- 0,01 TL up to 9.999.999,99 TL
  end if;
  if coalesce(cardinality(p_units), 0) = 0 then
    raise exception 'no_units';
  end if;

  -- Never treat a missing weight as 0 or 1: name the units so the admin can fix them.
  if p_method in ('land_share', 'gross_m2') then
    select string_agg(b.name || ' ' || u.door_no, ', ' order by b.name, u.door_no) into v_missing
      from public.units u join public.blocks b on b.id = u.block_id
     where u.id = any (p_units)
       and (case when p_method = 'land_share' then u.land_share else u.gross_m2 end) is null;
    if v_missing is not null then
      raise exception 'missing_weight' using detail = v_missing;
    end if;
  end if;

  for v_row in
    with base as (
      select u.id as uid, b.name as bname, u.door_no as door,
             case p_method
               when 'land_share' then u.land_share
               when 'gross_m2'   then u.gross_m2
               else 1::numeric
             end as w
        from public.units u join public.blocks b on b.id = u.block_id
       where u.id = any (p_units)
    ),
    sums as (
      select sum(base.w) as sw from base
    ),
    calc as (
      select base.uid, base.bname, base.door, base.w,
             case when p_method = 'per_unit' then p_amount_kurus
                  else div(p_amount_kurus * base.w, sums.sw)::bigint end as q,
             case when p_method = 'per_unit' then 0::numeric
                  else mod(p_amount_kurus * base.w, sums.sw) end as r
        from base cross join sums
    ),
    ranked as (
      select calc.*,
             row_number() over (
               order by calc.r desc, calc.bname,
                        (calc.door ~ '^[0-9]{1,18}$') desc,
                        case when calc.door ~ '^[0-9]{1,18}$' then calc.door::numeric end,
                        calc.door, calc.uid
             ) as rn,
             case when p_method = 'per_unit' then 0
                  else p_amount_kurus - sum(calc.q) over () end as leftover
        from calc
    )
    select ranked.uid, ranked.bname, ranked.door,
           case when p_method in ('land_share', 'gross_m2') then ranked.w end as wt,
           ranked.q + case when ranked.rn <= ranked.leftover then 1 else 0 end as amt
      from ranked
     order by ranked.bname,
              (ranked.door ~ '^[0-9]{1,18}$') desc,
              case when ranked.door ~ '^[0-9]{1,18}$' then ranked.door::numeric end,
              ranked.door, ranked.uid
  loop
    if v_row.amt < 1 then
      raise exception 'amount_too_small' using detail = v_row.bname || ' ' || v_row.door;
    end if;
    unit_id := v_row.uid;
    block_name := v_row.bname;
    door_no := v_row.door;
    weight := v_row.wt;
    amount_kurus := v_row.amt;
    return next;
  end loop;
end;
$$;

-- Does this charge type belong to the site's company (and is it switched on)?
create or replace function private.charge_type_ok(p_site uuid, p_type uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.charge_types t
      join public.sites s on s.company_id = t.company_id
     where t.id = p_type and s.id = p_site and t.active
  );
$$;

-- The one place where a batch and its charges are written. Callers have not checked
-- anything: every check is here.
create or replace function private.create_batch_core(
  p_request_id     uuid,
  p_site           uuid,
  p_target         jsonb,
  p_split          text,
  p_amount_kurus   bigint,
  p_charge_type    uuid,
  p_period         date,
  p_due_date       date,
  p_description    text,
  p_tenant_visible boolean,
  p_karar_no       text,
  p_karar_date     date,
  p_plan           uuid,
  p_expected_units integer,
  p_expected_kurus bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_units       uuid[];
  v_target      jsonb;
  v_desc        text := nullif(btrim(p_description), '');
  v_karar_no    text := nullif(btrim(p_karar_no), '');
  v_total_kurus bigint;
  v_count       integer;
  v_batch       uuid;
begin
  -- 1. Who is calling? An active admin of this exact site.
  if (select auth.uid()) is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- 2. A second call with the same request id returns the first batch (double click, retry).
  if p_request_id is not null then
    select b.id into v_batch from public.charge_batches b where b.request_id = p_request_id and b.site_id = p_site;
    if v_batch is not null then
      return v_batch;
    end if;
    if exists (select 1 from public.charge_batches b where b.request_id = p_request_id) then
      raise exception 'request_id_used';
    end if;
  end if;

  -- 3. Plain input checks.
  if p_tenant_visible is null then
    raise exception 'invalid_request';
  end if;
  if not private.charge_type_ok(p_site, p_charge_type) then
    raise exception 'charge_type_invalid';
  end if;
  if p_period is not null and (extract(day from p_period) <> 1 or p_period not between date '2000-01-01' and date '2100-01-01') then
    raise exception 'period_invalid';
  end if;
  if p_due_date is null or p_due_date not between date '2000-01-01' and date '2100-01-01' then
    raise exception 'due_date_invalid';
  end if;
  if v_desc is not null and char_length(v_desc) > 200 then
    raise exception 'description_invalid';
  end if;
  if (v_karar_no is null) <> (p_karar_date is null) or char_length(coalesce(v_karar_no, '')) > 60 then
    raise exception 'karar_invalid';
  end if;

  -- 4. Which units, and how much each.
  select r.o_units, r.o_target into v_units, v_target from private.resolve_target(p_site, p_target) r;
  select coalesce(sum(s.amount_kurus), 0), count(*)
    into v_total_kurus, v_count
    from private.split_charge(v_units, p_split, p_amount_kurus) s;

  -- 5. The numbers the admin saw on the preview must still be true (units may have been added
  --    or archived in between). Plan batches have no preview and skip this.
  if p_expected_units is not null and (p_expected_units <> v_count or p_expected_kurus is distinct from v_total_kurus) then
    raise exception 'preview_outdated';
  end if;

  -- 6. Write the batch, then its lines. Everything is one transaction: all or nothing.
  begin
    insert into public.charge_batches (
      site_id, charge_type_id, recurring_plan_id, request_id, target, split_method, amount, unit_count, total,
      period, due_date, description, tenant_visible, karar_no, karar_date, created_by
    )
    values (
      p_site, p_charge_type, p_plan, p_request_id, v_target, p_split, p_amount_kurus::numeric / 100, v_count,
      v_total_kurus::numeric / 100, p_period, p_due_date, v_desc, p_tenant_visible, v_karar_no, p_karar_date,
      (select auth.uid())
    )
    on conflict (request_id) do nothing
    returning id into v_batch;
  exception when unique_violation then
    raise exception 'already_generated';   -- the plan + month index
  end;

  if v_batch is null then
    -- Lost a race with the same request id: return the batch the other call made.
    select b.id into v_batch from public.charge_batches b where b.request_id = p_request_id and b.site_id = p_site;
    if v_batch is null then
      raise exception 'request_id_used';
    end if;
    return v_batch;
  end if;

  insert into public.charges (unit_id, charge_type_id, batch_id, period, description, amount, due_date, tenant_visible, created_by)
  select s.unit_id, p_charge_type, v_batch, p_period, v_desc, s.amount_kurus::numeric / 100, p_due_date,
         p_tenant_visible, (select auth.uid())
    from private.split_charge(v_units, p_split, p_amount_kurus) s;

  return v_batch;
end;
$$;

revoke all on function private.istanbul_month(timestamptz) from public, anon, authenticated;
revoke all on function private.company_ydo(uuid) from public, anon, authenticated;
revoke all on function private.resolve_target(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function private.split_charge(uuid[], text, bigint) from public, anon, authenticated;
revoke all on function private.charge_type_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function private.create_batch_core(uuid, uuid, jsonb, text, bigint, uuid, date, date, text, boolean, text, date, uuid, integer, bigint)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public functions (the app calls these through /rest/v1/rpc)
-- ---------------------------------------------------------------------------

-- Preview: the lines a bulk charge WOULD create. Writes nothing.
create or replace function public.preview_charge_batch(
  p_site          uuid,
  p_target        jsonb,
  p_split         text,
  p_amount_kurus  bigint
)
returns table (unit_id uuid, block_name text, door_no text, weight numeric, amount_kurus bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_units uuid[];
begin
  if (select auth.uid()) is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select r.o_units into v_units from private.resolve_target(p_site, p_target) r;
  return query select * from private.split_charge(v_units, p_split, p_amount_kurus);
end;
$$;

-- Create a bulk charge (or a single one: a batch of one unit with split 'per_unit').
-- p_expected_units and p_expected_kurus are the count and the total of the preview.
create or replace function public.create_charge_batch(
  p_request_id     uuid,
  p_site           uuid,
  p_target         jsonb,
  p_split          text,
  p_amount_kurus   bigint,
  p_charge_type    uuid,
  p_period         date,
  p_due_date       date,
  p_description    text,
  p_tenant_visible boolean,
  p_karar_no       text,
  p_karar_date     date,
  p_expected_units integer,
  p_expected_kurus bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null or p_expected_units is null or p_expected_kurus is null then
    raise exception 'invalid_request';
  end if;
  return private.create_batch_core(
    p_request_id, p_site, p_target, p_split, p_amount_kurus, p_charge_type, p_period, p_due_date,
    p_description, p_tenant_visible, p_karar_no, p_karar_date, null, p_expected_units, p_expected_kurus
  );
end;
$$;

-- "Bu ayı oluştur": turn a plan into this month's batch (Istanbul month). Twice = error.
create or replace function public.generate_recurring_batch(p_plan uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan   public.recurring_plans;
  v_period date;
begin
  select * into v_plan from public.recurring_plans p where p.id = p_plan;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_plan.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not v_plan.active then
    raise exception 'plan_inactive';
  end if;

  v_period := private.istanbul_month(now());
  return private.create_batch_core(
    null, v_plan.site_id, v_plan.target, v_plan.split_method, (v_plan.amount * 100)::bigint,
    v_plan.charge_type_id, v_period, v_period + (v_plan.day_of_month - 1), v_plan.description,
    v_plan.tenant_visible, v_plan.karar_no, v_plan.karar_date, v_plan.id, null, null
  );
end;
$$;

-- Create (p_id null) or change a recurring plan.
--
-- Aidat increase rule (plan, section 8; KMK m. 37 as amended on 22 May 2026): when the amount per
-- unit rises by MORE than the YDO compared to the plan before this change, the plan needs the kat
-- malikleri kurulu decision number and date. The check compares the average per unit, so changing
-- the split method or the target cannot be used to get around it. Exactly at the limit is allowed.
create or replace function public.save_recurring_plan(
  p_id             uuid,
  p_site           uuid,
  p_name           text,
  p_charge_type    uuid,
  p_amount_kurus   bigint,
  p_split          text,
  p_day            integer,
  p_target         jsonb,
  p_tenant_visible boolean,
  p_description    text,
  p_karar_no       text,
  p_karar_date     date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       public.recurring_plans;
  v_units     uuid[];
  v_target    jsonb;
  v_old_units uuid[];
  v_name      text := btrim(p_name);
  v_desc      text := nullif(btrim(p_description), '');
  v_karar_no  text := nullif(btrim(p_karar_no), '');
  v_company   uuid;
  v_ydo       numeric;
  v_new_n     integer;
  v_old_n     integer;
  v_id        uuid;
begin
  if (select auth.uid()) is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_id is not null then
    select * into v_old from public.recurring_plans p where p.id = p_id;
    if not found or v_old.site_id <> p_site then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;

  if v_name is null or char_length(v_name) not between 1 and 100 then
    raise exception 'name_invalid';
  end if;
  if p_day is null or p_day not between 1 and 28 then
    raise exception 'day_invalid';
  end if;
  if p_tenant_visible is null then
    raise exception 'invalid_request';
  end if;
  if not private.charge_type_ok(p_site, p_charge_type) then
    raise exception 'charge_type_invalid';
  end if;
  if v_desc is not null and char_length(v_desc) > 200 then
    raise exception 'description_invalid';
  end if;
  if (v_karar_no is null) <> (p_karar_date is null) or char_length(coalesce(v_karar_no, '')) > 60 then
    raise exception 'karar_invalid';
  end if;

  -- Validates the target, and also the split (missing arsa payı, amount too small ...) right now,
  -- not on the first of the month.
  select r.o_units, r.o_target into v_units, v_target from private.resolve_target(p_site, p_target) r;
  perform 1 from private.split_charge(v_units, p_split, p_amount_kurus) limit 1;
  v_new_n := case when p_split = 'per_unit' then 1 else cardinality(v_units) end;

  if p_id is not null then
    select r.o_units into v_old_units from private.resolve_target(v_old.site_id, v_old.target, true) r;
    v_old_n := case when v_old.split_method = 'per_unit' then 1 else greatest(cardinality(v_old_units), 1) end;
    select s.company_id into v_company from public.sites s where s.id = p_site;
    v_ydo := private.company_ydo(v_company);
    -- new average > old average * (1 + ydo/100), written without division so it is exact:
    if (p_amount_kurus::numeric / 100) * v_old_n * 100 > v_old.amount * v_new_n * (100 + v_ydo)
       and (v_karar_no is null or p_karar_date is null)
    then
      raise exception 'karar_required' using detail = v_ydo::text;
    end if;

    update public.recurring_plans set
      name = v_name, charge_type_id = p_charge_type, amount = p_amount_kurus::numeric / 100,
      split_method = p_split, day_of_month = p_day, target = v_target, tenant_visible = p_tenant_visible,
      description = v_desc, karar_no = v_karar_no, karar_date = p_karar_date
    where id = p_id;
    return p_id;
  end if;

  insert into public.recurring_plans (
    site_id, name, charge_type_id, amount, split_method, day_of_month, target, tenant_visible,
    description, karar_no, karar_date, created_by
  )
  values (
    p_site, v_name, p_charge_type, p_amount_kurus::numeric / 100, p_split, p_day, v_target, p_tenant_visible,
    v_desc, v_karar_no, p_karar_date, (select auth.uid())
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_recurring_plan_active(p_plan uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
begin
  select p.site_id into v_site from public.recurring_plans p where p.id = p_plan;
  if v_site is null or (select auth.uid()) is null or not private.is_site_admin(v_site) or p_active is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.recurring_plans set active = p_active where id = p_plan;
end;
$$;

-- Cancel one line. Nothing is deleted: the line stays in the ledger with the reason. No un-void.
create or replace function public.void_charge(p_charge uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.charges;
  v_reason text := btrim(p_reason);
begin
  select * into v_charge from public.charges c where c.id = p_charge;
  if not found or (select auth.uid()) is null or not private.is_site_admin(private.unit_site_id(v_charge.unit_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'reason_invalid';
  end if;
  if v_charge.voided_at is not null then
    raise exception 'already_voided';
  end if;
  -- Slice 6: refuse here when a payment allocation exists for this line.
  update public.charges
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_charge;
end;
$$;

-- Undo a whole batch: every line that is still active is voided with the same reason.
create or replace function public.void_charge_batch(p_batch uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch  public.charge_batches;
  v_reason text := btrim(p_reason);
begin
  select * into v_batch from public.charge_batches b where b.id = p_batch;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_batch.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'reason_invalid';
  end if;
  if v_batch.voided_at is not null then
    raise exception 'already_voided';
  end if;
  -- Slice 6: refuse here when any payment allocation exists for the lines of this batch.
  update public.charges
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where batch_id = p_batch and voided_at is null;
  update public.charge_batches
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_batch;
end;
$$;

-- Hard delete (a mistake noticed at once): only for 15 minutes after creation. Once payments exist
-- (slice 6) a foreign key stops the delete of paid lines, so "only if unpaid" holds by design.
create or replace function public.delete_charge_batch(p_batch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.charge_batches;
begin
  select * into v_batch from public.charge_batches b where b.id = p_batch;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_batch.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_batch.created_at < now() - interval '15 minutes' then
    raise exception 'delete_window_closed';
  end if;
  delete from public.charge_batches where id = p_batch;
end;
$$;

revoke all on function public.preview_charge_batch(uuid, jsonb, text, bigint) from public, anon;
revoke all on function public.create_charge_batch(uuid, uuid, jsonb, text, bigint, uuid, date, date, text, boolean, text, date, integer, bigint) from public, anon;
revoke all on function public.generate_recurring_batch(uuid) from public, anon;
revoke all on function public.save_recurring_plan(uuid, uuid, text, uuid, bigint, text, integer, jsonb, boolean, text, text, date) from public, anon;
revoke all on function public.set_recurring_plan_active(uuid, boolean) from public, anon;
revoke all on function public.void_charge(uuid, text) from public, anon;
revoke all on function public.void_charge_batch(uuid, text) from public, anon;
revoke all on function public.delete_charge_batch(uuid) from public, anon;

grant execute on function public.preview_charge_batch(uuid, jsonb, text, bigint) to authenticated;
grant execute on function public.create_charge_batch(uuid, uuid, jsonb, text, bigint, uuid, date, date, text, boolean, text, date, integer, bigint) to authenticated;
grant execute on function public.generate_recurring_batch(uuid) to authenticated;
grant execute on function public.save_recurring_plan(uuid, uuid, text, uuid, bigint, text, integer, jsonb, boolean, text, text, date) to authenticated;
grant execute on function public.set_recurring_plan_active(uuid, boolean) to authenticated;
grant execute on function public.void_charge(uuid, text) to authenticated;
grant execute on function public.void_charge_batch(uuid, text) to authenticated;
grant execute on function public.delete_charge_batch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security + grants
-- ---------------------------------------------------------------------------
alter table public.charge_types    enable row level security;
alter table public.recurring_plans enable row level security;
alter table public.charge_batches  enable row level security;
alter table public.charges         enable row level security;

revoke all on public.charge_types, public.recurring_plans, public.charge_batches, public.charges
  from anon, authenticated;

-- Admins read. Residents read nothing yet (slice 5).
grant select on public.charge_types, public.recurring_plans, public.charge_batches, public.charges to authenticated;
create policy "charge_types: admin read" on public.charge_types for select to authenticated
  using (private.is_company_admin(company_id));
create policy "recurring_plans: admin read" on public.recurring_plans for select to authenticated
  using (private.is_site_admin(site_id));
create policy "charge_batches: admin read" on public.charge_batches for select to authenticated
  using (private.is_site_admin(site_id));
create policy "charges: admin read" on public.charges for select to authenticated
  using (private.is_site_admin(private.unit_site_id(unit_id)));

-- The only direct edit: these four columns of a charge (the trigger above freezes voided lines).
-- unit, type, batch, period, void fields and "created by" can never be changed from the browser.
grant update (amount, due_date, description, tenant_visible) on public.charges to authenticated;
create policy "charges: admin update" on public.charges for update to authenticated
  using (private.is_site_admin(private.unit_site_id(unit_id)))
  with check (private.is_site_admin(private.unit_site_id(unit_id)));

-- ---------------------------------------------------------------------------
-- 6. A live summary per batch (counts and totals of the lines that are still active)
-- ---------------------------------------------------------------------------
-- security_invoker: the view reads charges with the caller's own rights, so RLS still applies.
create view public.charge_batch_summary with (security_invoker = true) as
select b.id as batch_id,
       b.site_id,
       count(c.id) filter (where c.voided_at is null)::integer as active_count,
       coalesce(sum(c.amount) filter (where c.voided_at is null), 0)::numeric(14, 2) as active_total
  from public.charge_batches b
  left join public.charges c on c.batch_id = b.id
 group by b.id;

revoke all on public.charge_batch_summary from anon, authenticated;
grant select on public.charge_batch_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The archive guard now also looks at charges (plan: "Archive: blocked if ledger exists")
-- ---------------------------------------------------------------------------
create or replace function private.block_archive_with_residents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    if exists (
      select 1
      from public.unit_residents r
      where r.unit_id = new.id
        and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
    ) then
      raise exception 'unit still has current residents' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.charges c where c.unit_id = new.id and c.voided_at is null
    ) then
      raise exception 'unit has charges' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
