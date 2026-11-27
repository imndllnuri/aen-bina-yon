-- 0013_late_fees.sql: the late-fee engine (slice 14)
--
-- What this adds
--   * Two columns on charges: late_fee_source_id (which debt this fee belongs to) and late_fee_through (the day it was calculated to).
--   * private.late_fee_amount(...)   the formula, as one small pure function (simple interest, no interest on interest)
--   * public.preview_late_fees(site) the list of fees that are due now. WRITES NOTHING.
--   * public.apply_late_fees(...)    writes the lines the admin approved, as ONE batch of type "Gecikme Tazminatı"
--   * void_charge / void_charge_batch / delete_charge_batch refuse to remove a debt that already has late-fee lines
--
-- The rule (settings: companies.settings.rules.late_fee_rate (% per month), late_fee_method, grace_days)
--   * A line is late from its due date + grace days + 1. "T" is today (Istanbul time, set by the server, never by the browser).
--   * The fee is worked out on the money that was STILL UNPAID on each late day, from the real payment dates:
--     a payment made on day d still counts as late for day d (the money was not there at the start of that day).
--       daily   : the sum over the late days of (unpaid amount) x rate / 100 / 30
--       monthly : every STARTED 30-day block counts in full: (unpaid amount on the first day of the block) x rate / 100
--   * Simple interest only: lines of the type Gecikme Tazminatı never earn a fee, and Devir Bakiyesi (old carried debt) is skipped.
--   * Only approved payments count: cancelling a payment makes the fee grow again at the next calculation.
--
-- Never twice
--   * "Billed so far" for a debt = the sum of ALL its late-fee lines, including the cancelled ones. A cancelled fee line means
--     "forgiven": the same period is never charged again. A deleted batch (allowed for 15 minutes) leaves nothing behind, so the
--     run can be done again. That is the undo.
--   * Each run only charges the NEW part: (fee calculated up to today) - (billed so far). Running it twice in a row bills 0.
--   * apply_late_fees locks the site first, then works the amounts out again under the lock and compares them with what the admin
--     saw. Two admins at the same moment can never bill the same fee twice.
--   * A fee that was billed too high (for example a payment dated in the past was entered later) is never taken back automatically:
--     the preview shows it ("fazla yazılmış") and the admin cancels that line by hand.
--
-- Same rules as always: checked security-definer functions with search_path = '', explicit grants, short error codes.

-- ---------------------------------------------------------------------------
-- 1. Columns and the batch kind
-- ---------------------------------------------------------------------------
alter table public.charges
  add column late_fee_source_id uuid references public.charges (id) on delete restrict,
  add column late_fee_through   date,
  add constraint charges_late_fee_pair check ((late_fee_source_id is null) = (late_fee_through is null)),
  add constraint charges_late_fee_not_self check (late_fee_source_id is distinct from id);
create index charges_late_fee_source_id_idx on public.charges (late_fee_source_id) where late_fee_source_id is not null;

-- The browser can never write these two columns (update is granted per column on charges, and they are not in the list).
revoke insert (late_fee_source_id, late_fee_through), update (late_fee_source_id, late_fee_through) on public.charges from authenticated;

-- A late-fee run is a batch of its own kind. For this kind: amount = total, unit_count = number of lines.
alter table public.charge_batches drop constraint charge_batches_split_method_check;
alter table public.charge_batches add constraint charge_batches_split_method_check
  check (split_method in ('equal', 'land_share', 'gross_m2', 'per_unit', 'late_fee'));

-- ---------------------------------------------------------------------------
-- 2. The rules of a company (with the same defaults as the settings screen)
-- ---------------------------------------------------------------------------
create or replace function private.late_fee_rules(p_company uuid)
returns table (rate numeric, method text, grace_days integer)
language sql
stable
security definer
set search_path = ''
as $$
  select least(greatest(coalesce(case when jsonb_typeof(c.settings #> '{rules,late_fee_rate}') = 'number' then (c.settings #>> '{rules,late_fee_rate}')::numeric end, 5), 0), 10),
         case when c.settings #>> '{rules,late_fee_method}' = 'monthly' then 'monthly' else 'daily' end,
         least(greatest(coalesce(case when jsonb_typeof(c.settings #> '{rules,grace_days}') = 'number' then (c.settings #>> '{rules,grace_days}')::numeric::integer end, 0), 0), 60)
    from public.companies c
   where c.id = p_company;
$$;

-- ---------------------------------------------------------------------------
-- 3. The formula (pure: the same input always gives the same answer, it reads no table)
-- ---------------------------------------------------------------------------
--   p_pay_dates / p_pay_amounts: the approved payments on this line (Istanbul date and the part that closed THIS line).
-- Rather than looping over the days, it counts how many late days each payment covered:
--   daily  : principal-days = A x N - sum(payment x days after the payment day)             N = number of late days
--   monthly: principal-months = A x M - sum(payment x month blocks that start after the payment day)   M = started 30-day blocks
create or replace function private.late_fee_amount(
  p_amount      numeric,
  p_due         date,
  p_grace       integer,
  p_rate        numeric,
  p_method      text,
  p_as_of       date,
  p_pay_dates   date[],
  p_pay_amounts numeric[]
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n     integer := coalesce(array_length(p_pay_dates, 1), 0);
  v_start date;
  v_days  integer;
  v_blocks integer;
  v_sum   numeric;
  v_fee   numeric;
  i       integer;
begin
  if p_method is null or p_method not in ('daily', 'monthly') then
    raise exception 'late_fee_method_invalid';
  end if;
  if p_amount is null or p_due is null or p_grace is null or p_rate is null or p_as_of is null
     or v_n <> coalesce(array_length(p_pay_amounts, 1), 0) then
    raise exception 'invalid_request';
  end if;

  v_start := p_due + p_grace + 1;               -- the first late day
  if p_as_of < v_start then
    return 0;
  end if;
  v_days := p_as_of - v_start + 1;              -- late days, both ends included

  if p_method = 'daily' then
    v_sum := p_amount * v_days;
    for i in 1 .. v_n loop
      -- the payment lowers the unpaid amount for every late day AFTER the payment day
      v_sum := v_sum - p_pay_amounts[i] * greatest(0, p_as_of - greatest(p_pay_dates[i], v_start - 1));
    end loop;
    v_fee := v_sum * p_rate / 3000;             -- rate / 100 / 30, divided once so that .xx5 is exact
  else
    v_blocks := (p_as_of - v_start) / 30 + 1;   -- started 30-day blocks (integer division)
    v_sum := p_amount * v_blocks;
    for i in 1 .. v_n loop
      -- a block counts the payment only if the block starts AFTER the payment day
      v_sum := v_sum - p_pay_amounts[i]
               * greatest(0, v_blocks - 1 - case when p_pay_dates[i] < v_start then -1 else (p_pay_dates[i] - v_start) / 30 end);
    end loop;
    v_fee := v_sum * p_rate / 100;
  end if;

  return round(greatest(v_fee, 0), 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The debts that have a fee to bill (or a fee that was billed too high)
-- ---------------------------------------------------------------------------
create or replace function private.late_fee_rows(p_site uuid, p_as_of date)
returns table (
  charge_id      uuid,
  unit_id        uuid,
  block_name     text,
  door_no        text,
  type_name      text,
  period         date,
  due_date       date,
  tenant_visible boolean,
  principal      numeric,
  remaining      numeric,
  late_days      integer,
  fee_total      numeric,
  billed         numeric,
  due_fee        numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select * from private.late_fee_rules((select s.company_id from public.sites s where s.id = p_site))
  ),
  src as (
    select c.id, c.unit_id, c.period, c.due_date, c.tenant_visible, c.amount,
           t.name as type_name, b.name as block_name, u.door_no, pay.dates, pay.amts, pay.paid, r.rate, r.method, r.grace_days
      from public.charges c
      join public.units u on u.id = c.unit_id
      join public.blocks b on b.id = u.block_id
      join public.charge_types t on t.id = c.charge_type_id
      cross join r
      cross join lateral (
        select coalesce(array_agg((p.paid_at at time zone 'Europe/Istanbul')::date order by p.paid_at, a.payment_id), '{}'::date[]) as dates,
               coalesce(array_agg(a.amount order by p.paid_at, a.payment_id), '{}'::numeric[]) as amts,
               coalesce(sum(a.amount), 0) as paid
          from public.payment_allocations a
          join public.payments p on p.id = a.payment_id
         where a.charge_id = c.id and p.status = 'approved'
      ) pay
     where b.site_id = p_site
       and c.voided_at is null
       and c.late_fee_source_id is null                       -- a late-fee line never earns a fee
       and t.code not in ('gecikme_tazminati', 'devir')       -- ...and neither does old carried debt
       and c.due_date + r.grace_days < p_as_of                -- at least one late day
  )
  select s.id, s.unit_id, s.block_name, s.door_no, s.type_name, s.period, s.due_date, s.tenant_visible,
         s.amount, (s.amount - s.paid), (p_as_of - (s.due_date + s.grace_days)),
         f.fee, coalesce(bl.billed, 0), (f.fee - coalesce(bl.billed, 0))
    from src s
    cross join lateral (
      select private.late_fee_amount(s.amount, s.due_date, s.grace_days, s.rate, s.method, p_as_of, s.dates, s.amts) as fee
    ) f
    left join lateral (
      select sum(x.amount) as billed from public.charges x where x.late_fee_source_id = s.id   -- cancelled lines count: forgiven
    ) bl on true
   where abs(f.fee - coalesce(bl.billed, 0)) >= 0.01
   order by s.block_name, s.door_no, s.due_date, s.id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Preview (writes nothing)
-- ---------------------------------------------------------------------------
create or replace function public.preview_late_fees(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today   date := (now() at time zone 'Europe/Istanbul')::date;
  v_company uuid;
  v_rules   record;
  v_lines   jsonb;
  v_over    jsonb;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select s.company_id into v_company from public.sites s where s.id = p_site;
  select * into v_rules from private.late_fee_rules(v_company);

  -- Money is sent in kuruş (whole numbers), so the browser never rounds.
  select coalesce(jsonb_agg(y.j order by y.block_name, y.door_no, y.due_date, y.charge_id) filter (where y.due_fee >= 0.01), '[]'::jsonb),
         coalesce(jsonb_agg(y.j order by y.block_name, y.door_no, y.due_date, y.charge_id) filter (where y.due_fee <= -0.01), '[]'::jsonb)
    into v_lines, v_over
    from (
      select x.block_name, x.door_no, x.due_date, x.charge_id, x.due_fee,
             jsonb_build_object(
               'charge_id', x.charge_id,
               'unit_id', x.unit_id,
               'block', x.block_name,
               'door', x.door_no,
               'type', x.type_name,
               'period', x.period,
               'due_date', x.due_date,
               'tenant_visible', x.tenant_visible,
               'principal_kurus', round(x.principal * 100)::bigint,
               'remaining_kurus', round(x.remaining * 100)::bigint,
               'days', x.late_days,
               'fee_kurus', round(x.fee_total * 100)::bigint,
               'billed_kurus', round(x.billed * 100)::bigint,
               'amount_kurus', round(x.due_fee * 100)::bigint
             ) as j
        from private.late_fee_rows(p_site, v_today) x
    ) y;

  return jsonb_build_object(
    'as_of', v_today,
    'rate', v_rules.rate,
    'method', v_rules.method,
    'grace_days', v_rules.grace_days,
    'type_ready', exists (select 1 from public.charge_types t where t.company_id = v_company and t.code = 'gecikme_tazminati' and t.active),
    'lines', v_lines,
    'over', v_over
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Apply: write the approved lines as one batch
-- ---------------------------------------------------------------------------
--   p_as_of            must be today (Istanbul): the day the admin saw on the preview. After midnight: preview_outdated.
--   p_charge_ids       the debts the admin left ticked; null = all of them
--   p_expected_count / p_expected_kurus   what the admin saw for exactly those debts
create or replace function public.apply_late_fees(
  p_request_id     uuid,
  p_site           uuid,
  p_as_of          date,
  p_charge_ids     uuid[],
  p_expected_count integer,
  p_expected_kurus bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_today   date := (now() at time zone 'Europe/Istanbul')::date;
  v_company uuid;
  v_type    uuid;
  v_batch   uuid;
  v_rows    jsonb;
  v_count   integer;
  v_kurus   bigint;
begin
  if v_uid is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_request_id is null or p_as_of is null or p_expected_count is null or p_expected_kurus is null then
    raise exception 'invalid_request';
  end if;

  -- One run per site at a time. Everything below is worked out AFTER the lock, so a second admin sees what the first one billed.
  select s.company_id into v_company from public.sites s where s.id = p_site for update;

  -- A second call with the same request id (double click, retry) returns the first batch.
  select b.id into v_batch from public.charge_batches b where b.request_id = p_request_id and b.site_id = p_site;
  if v_batch is not null then
    return v_batch;
  end if;
  if exists (select 1 from public.charge_batches b where b.request_id = p_request_id) then
    raise exception 'request_id_used';
  end if;

  if p_as_of <> v_today then
    raise exception 'preview_outdated';
  end if;
  select t.id into v_type from public.charge_types t where t.company_id = v_company and t.code = 'gecikme_tazminati' and t.active;
  if v_type is null then
    raise exception 'late_fee_type_missing';
  end if;

  -- The lines, worked out ONCE: what is checked is what is written.
  select coalesce(jsonb_agg(jsonb_build_object(
           'charge_id', x.charge_id, 'unit_id', x.unit_id, 'type', x.type_name, 'period', x.period, 'due_date', x.due_date,
           'visible', x.tenant_visible, 'kurus', round(x.due_fee * 100)::bigint) order by x.block_name, x.door_no, x.due_date, x.charge_id), '[]'::jsonb)
    into v_rows
    from private.late_fee_rows(p_site, v_today) x
   where x.due_fee >= 0.01
     and (p_charge_ids is null or x.charge_id = any (p_charge_ids));
  v_count := jsonb_array_length(v_rows);
  select coalesce(sum((e ->> 'kurus')::bigint), 0) into v_kurus from jsonb_array_elements(v_rows) e;

  if v_count = 0 then
    raise exception 'nothing_to_charge';
  end if;
  if v_count <> p_expected_count or v_kurus <> p_expected_kurus then
    raise exception 'preview_outdated';
  end if;
  if v_kurus > 999999999 then
    raise exception 'amount_too_large';
  end if;

  insert into public.charge_batches (
    site_id, charge_type_id, request_id, target, split_method, amount, unit_count, total,
    period, due_date, description, tenant_visible, created_by
  )
  values (
    p_site, v_type, p_request_id, '{"scope":"site"}', 'late_fee', v_kurus::numeric / 100, v_count, v_kurus::numeric / 100,
    null, v_today, 'Gecikme tazminatı hesabı · ' || to_char(v_today, 'DD.MM.YYYY') || ' itibarıyla',
    not exists (select 1 from jsonb_array_elements(v_rows) e where not (e ->> 'visible')::boolean), v_uid
  )
  returning id into v_batch;

  -- Each fee line sits next to its debt: same due date, same period, same visibility (a tenant sees it only if he sees the debt).
  insert into public.charges (unit_id, charge_type_id, batch_id, period, description, amount, due_date, tenant_visible, created_by,
                              late_fee_source_id, late_fee_through)
  select (e ->> 'unit_id')::uuid, v_type, v_batch, nullif(e ->> 'period', '')::date,
         left('Gecikme tazminatı · ' || (e ->> 'type')
              || case when nullif(e ->> 'period', '') is not null then ' · ' || private.tr_month((e ->> 'period')::date) else '' end
              || ' · ' || to_char(v_today, 'DD.MM.YYYY') || ' itibarıyla', 200),
         ((e ->> 'kurus')::bigint)::numeric / 100, (e ->> 'due_date')::date, (e ->> 'visible')::boolean, v_uid,
         (e ->> 'charge_id')::uuid, v_today
    from jsonb_array_elements(v_rows) e;

  return v_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. A debt that has late-fee lines cannot simply disappear
-- ---------------------------------------------------------------------------
-- (the three functions of 0005, with one more check each)
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
  if private.charge_has_payment(p_charge) then
    raise exception 'charge_paid';   -- cancel the payment first
  end if;
  if exists (select 1 from public.charges f where f.late_fee_source_id = p_charge and f.voided_at is null) then
    raise exception 'has_late_fees';   -- cancel its late-fee lines first
  end if;
  update public.charges
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_charge;
end;
$$;

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
  if exists (select 1 from public.charges c where c.batch_id = p_batch and c.voided_at is null and private.charge_has_payment(c.id)) then
    raise exception 'batch_has_payments';
  end if;
  if exists (select 1 from public.charges c join public.charges f on f.late_fee_source_id = c.id
              where c.batch_id = p_batch and c.voided_at is null and f.voided_at is null) then
    raise exception 'has_late_fees';
  end if;
  update public.charges
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where batch_id = p_batch and voided_at is null;
  update public.charge_batches
     set voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_batch;
end;
$$;

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
  -- Any payment (even a cancelled one) keeps its allocation rows, and a foreign key forbids deleting those lines.
  if exists (select 1 from public.charges c join public.payment_allocations a on a.charge_id = c.id where c.batch_id = p_batch) then
    raise exception 'batch_has_payments';
  end if;
  -- Late-fee lines (even cancelled ones) point at these lines: the foreign key would stop the delete with a raw error.
  if exists (select 1 from public.charges c join public.charges f on f.late_fee_source_id = c.id where c.batch_id = p_batch) then
    raise exception 'batch_has_late_fees';
  end if;
  delete from public.charge_batches where id = p_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The bell: a late-fee line says what it is (it has no "son ödeme" worth showing: its date is the debt's old due date)
-- ---------------------------------------------------------------------------
create or replace function private.notify_new_charges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.notifications (profile_id, kind, title, body, link, event_key)
    select r.profile_id, 'charge', 'Yeni borç',
           left(case when n.late_fee_source_id is not null
                     then coalesce(n.description, 'Gecikme tazminatı') || ': ' || private.format_try(n.amount)
                     else coalesce(t.name, 'Borç') || case when n.period is not null then ' · ' || private.tr_month(n.period) else '' end
                          || ': ' || private.format_try(n.amount) || ' · son ödeme ' || to_char(n.due_date, 'DD.MM.YYYY') end, 500),
           '/borclarim', 'charge:' || n.id::text
      from new_rows n
      join public.unit_residents r on r.unit_id = n.unit_id
      join public.profiles pr on pr.id = r.profile_id and pr.is_active
      left join public.charge_types t on t.id = n.charge_type_id
     where n.voided_at is null
       and r.start_date <= (now() at time zone 'Europe/Istanbul')::date
       and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
       and private.profile_sees_charge(r.profile_id, n.unit_id, n.tenant_visible, n.due_date)
    on conflict (profile_id, event_key) do nothing;
  exception when others then
    raise warning 'charge notifications not written: %', sqlerrm;
  end;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
revoke all on function private.late_fee_rules(uuid) from public, anon, authenticated;
revoke all on function private.late_fee_amount(numeric, date, integer, numeric, text, date, date[], numeric[]) from public, anon, authenticated;
revoke all on function private.late_fee_rows(uuid, date) from public, anon, authenticated;
revoke all on function public.preview_late_fees(uuid) from public, anon;
revoke all on function public.apply_late_fees(uuid, uuid, date, uuid[], integer, bigint) from public, anon;
grant execute on function public.preview_late_fees(uuid) to authenticated;
grant execute on function public.apply_late_fees(uuid, uuid, date, uuid[], integer, bigint) to authenticated;
