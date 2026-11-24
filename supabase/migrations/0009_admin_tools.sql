-- 0009_admin_tools.sql
-- Slice 10: dashboard (Genel Bakış), reports (Raporlar), settings (Ayarlar), audit log (İşlem Geçmişi), quote requests.
-- Plan sections 7, 8, 9, 13.
--
-- What is added
--   1. quote_requests      the five statuses of the plan, and a note for the admin
--   2. companies           length checks on the company information
--   3. charge types        save / delete functions (the default types are protected)
--   4. company settings    one checked function: the rules, the YDO rate, the commission. payment_mode stays untouchable.
--   5. dashboard + reports six functions that only READ. All the money maths is here, not in the browser.
--   6. audit_log           who changed what, when, before / after. Written ONLY by triggers, never changed, never deleted.
--
-- The words (the same words are written on the screens)
--   Tahakkuk (accrued)   the live (not cancelled) charge lines of a month. The month of a line is its `period`;
--                        a line without a period counts in the month of its due date.
--   Tahsilat (collected) money that closed lines. Two ways to count it, and the screens name which one they show:
--                          "bu ay tahsil edilen" = allocations of APPROVED payments whose payment date (Istanbul) is in the month
--                          "bu ayın borçlarından ödenen" = allocations (any date) to the lines of that month
--                        The fee of a card payment is never part of it. Cancelled (voided) payments never count: they keep their
--                        allocation rows, so EVERY sum below goes through payments.status = 'approved'.
--   Oran (rate)          "bu ayın borçlarından ödenen" divided by that month's tahakkuk. Empty when nothing was accrued.
--   Yaşlandırma (aging)  works on what is LEFT of each line (a part-paid line counts only for its rest), as of TODAY (Istanbul):
--                        not yet due (due date today or later), 1-30, 31-60, 61-90, over 90 days late. Only "as of today" exists:
--                        the books do not keep the state of an earlier day.
--   Hazirun cetveli      ONE row per unit (the owners of a unit are joined in one cell), so the land share (arsa payı) is counted once.
--
-- The audit log
--   * One generic row trigger, security definer. An update stores only the columns that changed (never updated_at; long texts are cut),
--     and an update that changes nothing else writes nothing.
--   * FAIL-CLOSED: if the log row cannot be written, the change fails too (an audit trail with holes is worse than a failed change).
--     Every statement of the existing tests runs through the triggers, and the lookup of the site never raises: a row whose unit is
--     already gone (the residents that a deleted unit takes with it) is simply not logged, the deleted unit itself is.
--   * Nobody can write, change or delete a row from the browser (no grants), and a trigger refuses update, delete and truncate for
--     everybody, the table owner included. No foreign keys: a deleted site or company must not delete or block its history.
--   * Reads: the admins of the site see its rows; rows of the company itself (settings, charge types) go to the company's admins.
--   * Audited: charges, charge batches, recurring plans, charge types, payments, havale notices, units, residents, announcements,
--     requests, company and its settings, who administers a site. Not audited (noise or derived): notifications, reads, recipients,
--     comments, timeline rows, allocations (they follow their payment).
--   * Nothing is written for what existed before this migration (no backfill), and this file changes no data, so the log starts clean.
--   * No clean-up of old rows yet: the log keeps names and amounts (KVKK: a retention time must be decided).
--
-- Same safety rules as before: explicit grants, search_path = '' on security-definer functions, public functions check the caller
-- inside, errors are short machine codes, helpers live in the private schema.

-- ---------------------------------------------------------------------------
-- 1. Quote requests (the public "Teklif Al" form): statuses of the plan and a note
-- ---------------------------------------------------------------------------
-- The old values stay valid ('new', 'contacted', 'closed'): nothing has to be converted.
alter table public.quote_requests drop constraint quote_requests_status_check;
alter table public.quote_requests add constraint quote_requests_status_check
  check (status in ('new', 'contacted', 'offered', 'won', 'lost', 'closed'));
alter table public.quote_requests add column admin_note text check (admin_note is null or char_length(admin_note) <= 1000);
grant update (status, admin_note) on public.quote_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The company information: length checks (the screen checks too, these are the real guard)
-- ---------------------------------------------------------------------------
alter table public.companies add constraint companies_phone_len check (phone is null or char_length(phone) <= 30);
alter table public.companies add constraint companies_email_len check (email is null or (char_length(email) <= 200 and email like '%_@_%'));
alter table public.companies add constraint companies_address_len check (address is null or char_length(address) <= 500);
alter table public.companies add constraint companies_tax_no_len check (tax_no is null or char_length(tax_no) <= 30);

-- ---------------------------------------------------------------------------
-- 3. Charge types: add, change, switch off, delete
-- ---------------------------------------------------------------------------
-- The six types every company starts with are protected: they can be switched off but never deleted (other screens and the
-- recurring plans are built around them).
create or replace function private.protected_charge_code(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_code in ('aidat', 'yakit', 'demirbas', 'ek_toplama', 'gecikme_tazminati', 'devir');
$$;

-- "Çatı Tamiri" -> "cati_tamiri": the code of a new type (letters and digits only), unique inside the company.
create or replace function private.new_charge_code(p_company uuid, p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_base text := regexp_replace(lower(translate(btrim(p_name), 'ğüşıöçĞÜŞİÖÇ', 'gusiocgusioc')), '[^a-z0-9]+', '_', 'g');
  v_code text;
  n      integer := 1;
begin
  v_base := btrim(v_base, '_');
  if v_base = '' or v_base !~ '^[a-z]' then
    v_base := 'tur_' || v_base;
  end if;
  v_base := btrim(left(v_base, 30), '_');
  v_code := v_base;
  while exists (select 1 from public.charge_types t where t.company_id = p_company and t.code = v_code) loop
    n := n + 1;
    v_code := left(v_base, 30) || '_' || n::text;
  end loop;
  return v_code;
end;
$$;

-- p_id null = a new type. Switching a type off is refused while an ACTIVE monthly plan uses it (the plan would fail every month).
create or replace function public.save_charge_type(
  p_company        uuid,
  p_id             uuid,
  p_name           text,
  p_tenant_visible boolean,
  p_split          text,
  p_active         boolean,
  p_sort           integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_old  public.charge_types;
  v_id   uuid;
begin
  if (select auth.uid()) is null or p_company is null or not private.is_company_admin(p_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100 then
    raise exception 'name_invalid';
  end if;
  if p_split is null or p_split not in ('equal', 'land_share', 'gross_m2', 'per_unit') then
    raise exception 'split_invalid';
  end if;
  if p_sort is null or p_sort not between 0 and 999 or p_tenant_visible is null or p_active is null then
    raise exception 'invalid_request';
  end if;
  if exists (select 1 from public.charge_types t where t.company_id = p_company and lower(t.name) = lower(v_name) and t.id is distinct from p_id) then
    raise exception 'name_used';
  end if;

  if p_id is null then
    insert into public.charge_types (company_id, code, name, tenant_visible_default, default_split, active, sort_order)
    values (p_company, private.new_charge_code(p_company, v_name), v_name, p_tenant_visible, p_split, p_active, p_sort)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.charge_types t where t.id = p_id and t.company_id = p_company for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_old.active and not p_active
     and exists (select 1 from public.recurring_plans r where r.charge_type_id = p_id and r.active) then
    raise exception 'type_in_active_plan';
  end if;
  update public.charge_types
     set name = v_name, tenant_visible_default = p_tenant_visible, default_split = p_split, active = p_active, sort_order = p_sort
   where id = p_id;
  return p_id;
end;
$$;

-- Only a type that was never used (no line, no batch, no plan) and is not one of the six defaults can go.
create or replace function public.delete_charge_type(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.charge_types;
begin
  select * into v_type from public.charge_types t where t.id = p_id for update;
  if not found or (select auth.uid()) is null or not private.is_company_admin(v_type.company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if private.protected_charge_code(v_type.code) then
    raise exception 'type_protected';
  end if;
  if exists (select 1 from public.charges c where c.charge_type_id = p_id)
     or exists (select 1 from public.charge_batches b where b.charge_type_id = p_id)
     or exists (select 1 from public.recurring_plans r where r.charge_type_id = p_id) then
    raise exception 'type_in_use';
  end if;
  delete from public.charge_types where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Company settings (the rules). The browser cannot write companies.settings: this checked function can.
-- ---------------------------------------------------------------------------
-- What is LIVE today and what is only STORED:
--   ydo_rate                        live: the warning of the aidat increase (private.company_ydo)
--   payment.commission_payer / fee_pct   live: the fee on card payments (private.payment_fee). Saving changes the checkout of residents at once.
--   rules.due_day                   live: the pre-filled due date of new charges
--   rules.late_fee_rate / method / grace_days   STORED only: no job computes late fees yet (the screen says so)
-- payment_mode (the safety switch of the fake checkout) and bank_accounts (its own function) are never touched here: the new values are
-- MERGED into the old settings.
create or replace function public.save_company_settings(
  p_company          uuid,
  p_ydo_rate         numeric,
  p_commission_payer text,
  p_fee_pct          jsonb,
  p_due_day          integer,
  p_late_fee_rate    numeric,
  p_late_fee_method  text,
  p_grace_days       integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee  jsonb := '{}'::jsonb;
  k      text;
  v_val  numeric;
begin
  if (select auth.uid()) is null or p_company is null or not private.is_company_admin(p_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_ydo_rate is null or p_ydo_rate < 0 or p_ydo_rate > 100 then
    raise exception 'ydo_invalid';
  end if;
  if p_commission_payer is null or p_commission_payer not in ('management', 'resident') then
    raise exception 'commission_invalid';
  end if;
  if p_fee_pct is null or jsonb_typeof(p_fee_pct) <> 'object' then
    raise exception 'fee_invalid';
  end if;
  for k in select jsonb_object_keys(p_fee_pct) loop
    if k not in ('2', '3', '6', '9') or jsonb_typeof(p_fee_pct -> k) <> 'number' then
      raise exception 'fee_invalid';
    end if;
    v_val := (p_fee_pct ->> k)::numeric;
    if v_val < 0 or v_val > 10 then
      raise exception 'fee_invalid';
    end if;
    v_fee := v_fee || jsonb_build_object(k, round(v_val, 2));
  end loop;
  if p_due_day is null or p_due_day not between 1 and 28 then
    raise exception 'due_day_invalid';
  end if;
  if p_late_fee_rate is null or p_late_fee_rate < 0 or p_late_fee_rate > 10 then
    raise exception 'late_fee_invalid';
  end if;
  if p_late_fee_method is null or p_late_fee_method not in ('daily', 'monthly') then
    raise exception 'late_fee_method_invalid';
  end if;
  if p_grace_days is null or p_grace_days not between 0 and 60 then
    raise exception 'grace_invalid';
  end if;

  update public.companies c
     set settings = c.settings
       || jsonb_build_object('ydo_rate', round(p_ydo_rate, 2))
       || jsonb_build_object('payment', coalesce(case when jsonb_typeof(c.settings -> 'payment') = 'object' then c.settings -> 'payment' end, '{}'::jsonb)
                                         || jsonb_build_object('commission_payer', p_commission_payer, 'fee_pct', v_fee))
       || jsonb_build_object('rules', jsonb_build_object('due_day', p_due_day, 'late_fee_rate', round(p_late_fee_rate, 2),
                                                          'late_fee_method', p_late_fee_method, 'grace_days', p_grace_days))
   where c.id = p_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Dashboard and reports. They only read. Every one of them checks that the caller administers the site.
-- ---------------------------------------------------------------------------
-- The live lines of a site with what is paid and what is left. THE ONE place the sums start from.
create or replace function private.site_lines(p_site uuid)
returns table (charge_id uuid, unit_id uuid, amount numeric, paid numeric, remaining numeric, due_date date, period date)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         c.unit_id,
         c.amount,
         private.charge_paid(c.id),
         (c.amount - private.charge_paid(c.id))::numeric(12, 2),
         c.due_date,
         coalesce(c.period, date_trunc('month', c.due_date)::date)
    from public.charges c
    join public.units u on u.id = c.unit_id
    join public.blocks b on b.id = u.block_id
   where b.site_id = p_site
     and c.voided_at is null;
$$;

-- The numbers of the first screen.
create or replace function public.dashboard_kpis(p_site uuid)
returns table (
  month               date,
  accrued             numeric,
  collected           numeric,
  collected_for_month numeric,
  rate_pct            numeric,
  receivable          numeric,
  overdue_units       integer,
  overdue_amount      numeric,
  pending_notices     integer,
  open_requests       integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_month date := date_trunc('month', now() at time zone 'Europe/Istanbul')::date;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with ln as (select * from private.site_lines(p_site)),
       cash as (
         select coalesce(sum(a.amount), 0) as total
           from public.payment_allocations a
           join public.payments pm on pm.id = a.payment_id
           join public.units u on u.id = pm.unit_id
           join public.blocks b on b.id = u.block_id
          where b.site_id = p_site
            and pm.status = 'approved'
            and date_trunc('month', pm.paid_at at time zone 'Europe/Istanbul')::date = v_month
       )
  select v_month,
         coalesce(sum(ln.amount) filter (where ln.period = v_month), 0)::numeric,
         (select cash.total from cash)::numeric,
         coalesce(sum(ln.paid) filter (where ln.period = v_month), 0)::numeric,
         case when coalesce(sum(ln.amount) filter (where ln.period = v_month), 0) > 0
              then round(100 * sum(ln.paid) filter (where ln.period = v_month) / sum(ln.amount) filter (where ln.period = v_month), 1) end,
         coalesce(sum(ln.remaining), 0)::numeric,
         (select count(distinct l2.unit_id) from ln l2 where l2.remaining > 0 and l2.due_date < v_today)::integer,
         coalesce(sum(ln.remaining) filter (where ln.remaining > 0 and ln.due_date < v_today), 0)::numeric,
         (select count(*) from public.transfer_notices n join public.units u on u.id = n.unit_id join public.blocks b on b.id = u.block_id
           where b.site_id = p_site and n.status = 'pending')::integer,
         (select count(*) from public.requests r where r.site_id = p_site and r.status in ('acik', 'inceleniyor', 'islemde'))::integer
    from ln;
end;
$$;

-- Month by month: tahakkuk, tahsil edilen (cash), ayın borçlarından ödenen, oran. At most 60 months.
create or replace function public.report_monthly(p_site uuid, p_from date, p_to date)
returns table (month date, accrued numeric, collected numeric, collected_for_month numeric, rate_pct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date;
  v_to   date;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null then
    raise exception 'range_invalid';
  end if;
  v_from := date_trunc('month', p_from)::date;
  v_to := date_trunc('month', p_to)::date;
  if v_to < v_from or (extract(year from age(v_to, v_from)) * 12 + extract(month from age(v_to, v_from))) > 59 then
    raise exception 'range_invalid';
  end if;
  return query
  with months as (select g::date as m from generate_series(v_from, v_to, interval '1 month') g),
       ln as (select * from private.site_lines(p_site)),
       acc as (select ln.period as m, sum(ln.amount) as accrued, sum(ln.paid) as paid_for from ln group by ln.period),
       cash as (
         select date_trunc('month', pm.paid_at at time zone 'Europe/Istanbul')::date as m, sum(a.amount) as collected
           from public.payment_allocations a
           join public.payments pm on pm.id = a.payment_id
           join public.units u on u.id = pm.unit_id
           join public.blocks b on b.id = u.block_id
          where b.site_id = p_site and pm.status = 'approved'
          group by 1
       )
  select months.m,
         coalesce(acc.accrued, 0)::numeric,
         coalesce(cash.collected, 0)::numeric,
         coalesce(acc.paid_for, 0)::numeric,
         case when coalesce(acc.accrued, 0) > 0 then round(100 * acc.paid_for / acc.accrued, 1) end
    from months
    left join acc on acc.m = months.m
    left join cash on cash.m = months.m
   order by months.m;
end;
$$;

-- Borç listesi with aging, one row per unit that owes something, the biggest debt first. p_limit null = all (at most 5000).
create or replace function public.report_debts(p_site uuid, p_limit integer)
returns table (
  unit_id    uuid,
  block_name text,
  door_no    text,
  unit_label text,
  owners     text,
  phone      text,
  balance    numeric,
  not_due    numeric,
  d1_30      numeric,
  d31_60     numeric,
  d61_90     numeric,
  d90_plus   numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with ln as (select * from private.site_lines(p_site) s where s.remaining > 0),
       per as (
         select ln.unit_id,
                sum(ln.remaining) as balance,
                sum(ln.remaining) filter (where ln.due_date >= v_today) as not_due,
                sum(ln.remaining) filter (where v_today - ln.due_date between 1 and 30) as d1_30,
                sum(ln.remaining) filter (where v_today - ln.due_date between 31 and 60) as d31_60,
                sum(ln.remaining) filter (where v_today - ln.due_date between 61 and 90) as d61_90,
                sum(ln.remaining) filter (where v_today - ln.due_date > 90) as d90_plus
           from ln
          group by ln.unit_id
       )
  select u.id,
         b.name,
         u.door_no,
         b.name || ' · ' || u.door_no,
         (select string_agg(coalesce(pr.full_name, '—'), ', ' order by pr.full_name)
            from public.unit_residents r join public.profiles pr on pr.id = r.profile_id
           where r.unit_id = u.id and r.relation = 'owner' and r.start_date <= v_today and (r.end_date is null or r.end_date > v_today)),
         (select pr.phone
            from public.unit_residents r join public.profiles pr on pr.id = r.profile_id
           where r.unit_id = u.id and r.relation = 'owner' and r.start_date <= v_today and (r.end_date is null or r.end_date > v_today) and pr.phone is not null
           order by pr.full_name, pr.id limit 1),
         per.balance::numeric,
         coalesce(per.not_due, 0)::numeric,
         coalesce(per.d1_30, 0)::numeric,
         coalesce(per.d31_60, 0)::numeric,
         coalesce(per.d61_90, 0)::numeric,
         coalesce(per.d90_plus, 0)::numeric
    from per
    join public.units u on u.id = per.unit_id
    join public.blocks b on b.id = u.block_id
   order by per.balance desc, b.name, u.door_no
   limit least(coalesce(p_limit, 5000), 5000);
end;
$$;

-- Tahsilat raporu: the approved payments of a period (Istanbul days, both ends included), newest first. Cancelled payments are not listed.
create or replace function public.report_collections(p_site uuid, p_from date, p_to date, p_limit integer)
returns table (
  payment_id uuid,
  paid_at    timestamptz,
  receipt_no text,
  unit_label text,
  payer_name text,
  method     text,
  amount     numeric,
  fee        numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'range_invalid';
  end if;
  return query
  select pm.id, pm.paid_at, pm.receipt_no, pm.unit_label, pm.payer_name, pm.method, pm.amount, pm.fee
    from public.payments pm
    join public.units u on u.id = pm.unit_id
    join public.blocks b on b.id = u.block_id
   where b.site_id = p_site
     and pm.status = 'approved'
     and (pm.paid_at at time zone 'Europe/Istanbul')::date between p_from and p_to
   order by pm.paid_at desc, pm.id
   limit least(coalesce(p_limit, 5000), 5000);
end;
$$;

-- The same period, added up by method. The last row (method null) is the total.
create or replace function public.report_collections_summary(p_site uuid, p_from date, p_to date)
returns table (method text, payment_count integer, amount numeric, fee numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'range_invalid';
  end if;
  return query
  select pm.method, count(*)::integer, sum(pm.amount)::numeric, sum(pm.fee)::numeric
    from public.payments pm
    join public.units u on u.id = pm.unit_id
    join public.blocks b on b.id = u.block_id
   where b.site_id = p_site
     and pm.status = 'approved'
     and (pm.paid_at at time zone 'Europe/Istanbul')::date between p_from and p_to
   group by rollup (pm.method)
   order by pm.method nulls last;
end;
$$;

-- Sakin listesi: everybody who lives in a unit today.
create or replace function public.report_residents(p_site uuid)
returns table (
  unit_id    uuid,
  block_name text,
  door_no    text,
  floor      integer,
  gross_m2   numeric,
  land_share numeric,
  relation   text,
  full_name  text,
  phone      text,
  email      text,
  start_date date,
  is_active  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select u.id, b.name, u.door_no, u.floor, u.gross_m2, u.land_share, r.relation, pr.full_name, pr.phone, pr.email, r.start_date, pr.is_active
    from public.unit_residents r
    join public.units u on u.id = r.unit_id and u.archived_at is null
    join public.blocks b on b.id = u.block_id
    join public.profiles pr on pr.id = r.profile_id
   where b.site_id = p_site
     and r.start_date <= v_today and (r.end_date is null or r.end_date > v_today)
   order by b.name, case when u.door_no ~ '^[0-9]+$' then lpad(u.door_no, 10, '0') else u.door_no end, r.relation desc, pr.full_name;
end;
$$;

-- Hazirun cetveli: the attendance sheet of the kat malikleri kurulu. ONE ROW PER UNIT (co-owners joined), so the land share is counted
-- once. A unit without a recorded owner is still listed (the sheet must be complete). The shares are added up here, not in the browser.
create or replace function public.report_attendance(p_site uuid)
returns table (
  unit_id           uuid,
  block_name        text,
  door_no           text,
  owners            text,
  land_share        numeric,
  share_pct         numeric,
  total_land_share  numeric,
  unit_count        integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with us as (
    select u.id, b.name as block_name, u.door_no, coalesce(u.land_share, 0) as land_share,
           (select string_agg(coalesce(pr.full_name, '—'), ', ' order by pr.full_name)
              from public.unit_residents r join public.profiles pr on pr.id = r.profile_id
             where r.unit_id = u.id and r.relation = 'owner' and r.start_date <= v_today and (r.end_date is null or r.end_date > v_today)) as owners
      from public.units u
      join public.blocks b on b.id = u.block_id
     where b.site_id = p_site and u.archived_at is null
  )
  select us.id, us.block_name, us.door_no, us.owners, us.land_share::numeric,
         case when sum(us.land_share) over () > 0 then round(100 * us.land_share / sum(us.land_share) over (), 4) end,
         (sum(us.land_share) over ())::numeric,
         (count(*) over ())::integer
    from us
   order by us.block_name, case when us.door_no ~ '^[0-9]+$' then lpad(us.door_no, 10, '0') else us.door_no end;
end;
$$;

revoke all on function private.protected_charge_code(text) from public, anon, authenticated;
revoke all on function private.new_charge_code(uuid, text) from public, anon, authenticated;
revoke all on function private.site_lines(uuid) from public, anon, authenticated;

revoke all on function public.save_charge_type(uuid, uuid, text, boolean, text, boolean, integer) from public, anon;
revoke all on function public.delete_charge_type(uuid) from public, anon;
revoke all on function public.save_company_settings(uuid, numeric, text, jsonb, integer, numeric, text, integer) from public, anon;
revoke all on function public.dashboard_kpis(uuid) from public, anon;
revoke all on function public.report_monthly(uuid, date, date) from public, anon;
revoke all on function public.report_debts(uuid, integer) from public, anon;
revoke all on function public.report_collections(uuid, date, date, integer) from public, anon;
revoke all on function public.report_collections_summary(uuid, date, date) from public, anon;
revoke all on function public.report_residents(uuid) from public, anon;
revoke all on function public.report_attendance(uuid) from public, anon;
grant execute on function public.save_charge_type(uuid, uuid, text, boolean, text, boolean, integer) to authenticated;
grant execute on function public.delete_charge_type(uuid) to authenticated;
grant execute on function public.save_company_settings(uuid, numeric, text, jsonb, integer, numeric, text, integer) to authenticated;
grant execute on function public.dashboard_kpis(uuid) to authenticated;
grant execute on function public.report_monthly(uuid, date, date) to authenticated;
grant execute on function public.report_debts(uuid, integer) to authenticated;
grant execute on function public.report_collections(uuid, date, date, integer) to authenticated;
grant execute on function public.report_collections_summary(uuid, date, date) to authenticated;
grant execute on function public.report_residents(uuid) to authenticated;
grant execute on function public.report_attendance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The audit log (LAST: after every change above, so the log of a real database starts clean)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  -- The order of the rows. (All rows of one transaction share the same time.)
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  -- Who: the logged-in person, or null for the system (a migration, the dashboard of Supabase). The name is a snapshot.
  actor_id    uuid,
  actor_name  text,
  table_name  text not null,
  row_id      text,
  action      text not null check (action in ('insert', 'update', 'delete')),
  -- Where it belongs. No foreign keys on purpose (see the header).
  site_id     uuid,
  company_id  uuid,
  -- insert: the new row. update: ONLY the changed columns, before and after. delete: the old row.
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_site_idx on public.audit_log (site_id, id desc);
create index audit_log_company_idx on public.audit_log (company_id, id desc) where site_id is null;
create index audit_log_row_idx on public.audit_log (table_name, row_id, id desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select (id, at, actor_id, actor_name, table_name, row_id, action, site_id, company_id, old_data, new_data) on public.audit_log to authenticated;

create policy "audit_log: admin read" on public.audit_log for select to authenticated
  using (
    (site_id is not null and private.is_site_admin(site_id))
    or (site_id is null and company_id is not null and private.is_company_admin(company_id))
  );

-- Nobody changes the past: not even the owner of the table.
create or replace function private.audit_log_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_is_append_only' using errcode = '42501';
end;
$$;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function private.audit_log_frozen();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_frozen();

-- A copy of a row for the log: without the noise, and with long texts cut.
create or replace function private.audit_clean(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  r jsonb := '{}'::jsonb;
begin
  if p_data is null then
    return null;
  end if;
  for k, v in select * from jsonb_each(p_data) loop
    if k in ('updated_at', 'token', 'request_id') then
      continue;
    end if;
    if jsonb_typeof(v) = 'string' and char_length(v #>> '{}') > 300 then
      v := to_jsonb(left(v #>> '{}', 300) || '…');
    end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  return r;
end;
$$;

-- The one trigger function for every audited table. The argument says how to find the site:
--   site | unit | block (the row has site_id / unit_id / block_id)   company (the row has company_id)   company_self (the row IS the company)
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_how     text := tg_argv[0];
  v_old     jsonb;
  v_new     jsonb;
  v_base    jsonb;
  v_o       jsonb := '{}'::jsonb;
  v_n       jsonb := '{}'::jsonb;
  k         text;
  v_site    uuid;
  v_company uuid;
  v_actor   uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_base := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_base := v_old;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_base := v_new;
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (v_new -> k) is distinct from (v_old -> k) then
        v_o := v_o || jsonb_build_object(k, v_old -> k);
        v_n := v_n || jsonb_build_object(k, v_new -> k);
      end if;
    end loop;
    if v_n = '{}'::jsonb then
      return null;
    end if;
    v_old := v_o;
    v_new := v_n;
  end if;

  -- Where it belongs. These lookups return null when the thing is gone (they never raise).
  if v_how = 'site' then
    v_site := (v_base ->> 'site_id')::uuid;
  elsif v_how = 'unit' then
    v_site := private.unit_site_id((v_base ->> 'unit_id')::uuid);
    if v_site is null then
      return null; -- the unit is gone (a deleted unit takes its residents with it): the unit's own delete is in the log
    end if;
  elsif v_how = 'block' then
    v_site := private.block_site_id((v_base ->> 'block_id')::uuid);
    if v_site is null then
      return null;
    end if;
  elsif v_how = 'company' then
    v_company := (v_base ->> 'company_id')::uuid;
  elsif v_how = 'company_self' then
    v_company := (v_base ->> 'id')::uuid;
  end if;
  if v_company is null and v_site is not null then
    select s.company_id into v_company from public.sites s where s.id = v_site;
  end if;

  insert into public.audit_log (actor_id, actor_name, table_name, row_id, action, site_id, company_id, old_data, new_data)
  values (
    v_actor,
    (select p.full_name from public.profiles p where p.id = v_actor),
    tg_table_name,
    coalesce(v_base ->> 'id', v_base ->> 'profile_id'),  -- site_members has no id: its key is the person
    lower(tg_op),
    v_site,
    v_company,
    private.audit_clean(v_old),
    private.audit_clean(v_new)
  );
  return null;
end;
$$;

revoke all on function private.audit_log_frozen() from public, anon, authenticated;
revoke all on function private.audit_clean(jsonb) from public, anon, authenticated;
revoke all on function private.audit_row() from public, anon, authenticated;

create trigger zz_audit after insert or update or delete on public.charges          for each row execute function private.audit_row('unit');
create trigger zz_audit after insert or update or delete on public.charge_batches   for each row execute function private.audit_row('site');
create trigger zz_audit after insert or update or delete on public.recurring_plans  for each row execute function private.audit_row('site');
create trigger zz_audit after insert or update or delete on public.charge_types     for each row execute function private.audit_row('company');
create trigger zz_audit after insert or update or delete on public.payments         for each row execute function private.audit_row('unit');
create trigger zz_audit after insert or update or delete on public.transfer_notices for each row execute function private.audit_row('unit');
create trigger zz_audit after insert or update or delete on public.units            for each row execute function private.audit_row('block');
create trigger zz_audit after insert or update or delete on public.unit_residents   for each row execute function private.audit_row('unit');
create trigger zz_audit after insert or update or delete on public.announcements    for each row execute function private.audit_row('site');
create trigger zz_audit after insert or update or delete on public.requests         for each row execute function private.audit_row('site');
create trigger zz_audit after insert or update or delete on public.site_members     for each row execute function private.audit_row('site');
create trigger zz_audit after insert or update or delete on public.companies        for each row execute function private.audit_row('company_self');
