-- 0005_payments.sql
-- Slice 6: payments (mock checkout now, iyzico later) and receipts (makbuz). Plan sections 9, 12, 18.
--
-- What is added
--   1. payments, payment_allocations     each collection (tahsilat) and which lines it closed
--   2. receipt numbers                   MKB-2026-000123, from a sequence (Istanbul year)
--   3. quote_payment(), pay_charges_mock()   what residents call. THE DATABASE computes every amount.
--   4. get_receipt()                     the receipt data, checked for access (never built from the browser)
--   5. void_payment()                    an admin cancels a payment, with a reason. Nothing is deleted.
--   6. charge_status / unit_balances     now show the REAL paid amount (these views were placeholders)
--   7. the slice 4 guards                a line with a payment cannot be edited in amount/date, voided or deleted
--   8. one read policy per table         the admin and resident read policies of 0003/0004 are merged
--
-- SAFETY SWITCH: pay_charges_mock lets a resident mark their OWN debt "paid" without any money moving.
-- That is only acceptable on a demo. So it works only for companies whose settings say
--     {"payment_mode": "mock"}
-- (set below for the demo company). BEFORE REAL RESIDENTS AND REAL MONEY EXIST, remove that setting:
--     update public.companies set settings = settings - 'payment_mode';
-- Real payments (iyzico, slice later) will use another path.
--
-- Same safety rules as before: explicit grants, search_path = '' on security-definer functions,
-- public functions check the caller inside, errors are short machine codes.
-- Money travels as integer kuruş. A payment always pays WHOLE lines (no partial payment yet), so
-- overpayment credit (alacak) cannot happen yet. Refunds and manual cash entry: slice 7.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create sequence private.receipt_seq;

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.units (id) on delete restrict,
  payer_id      uuid references public.profiles (id) on delete set null,
  -- Snapshots: a receipt must not change when a person renames themselves or a unit is renamed.
  payer_name    text,
  unit_label    text not null,
  -- The money that closed charge lines (= the sum of the allocations). The fee is on top of it.
  amount        numeric(12, 2) not null check (amount > 0),
  fee           numeric(12, 2) not null default 0 check (fee >= 0),
  method        text not null check (method in ('card', 'havale', 'cash', 'pos')),
  status        text not null default 'approved' check (status in ('approved', 'voided')),
  provider      text not null check (provider in ('mock', 'iyzico', 'manual')),
  provider_ref  text,
  installments  integer not null default 1 check (installments in (1, 2, 3, 6, 9)),
  -- A random id made by the browser per confirm screen: a double click returns the same payment.
  request_id    uuid unique,
  paid_at       timestamptz not null default now(),
  -- Never reused, even after a void.
  receipt_no    text not null unique check (receipt_no ~ '^MKB-[0-9]{4}-[0-9]{6,}$'),
  created_by    uuid references public.profiles (id) on delete set null,
  voided_at     timestamptz,
  voided_by     uuid references public.profiles (id) on delete set null,
  void_reason   text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 300),
  check ((status = 'voided') = (voided_at is not null)),
  check ((voided_at is null) = (void_reason is null))
);
create index payments_unit_id_idx on public.payments (unit_id, paid_at desc);
create index payments_payer_id_idx on public.payments (payer_id);

create table public.payment_allocations (
  payment_id  uuid not null references public.payments (id) on delete restrict,
  -- RESTRICT: a charge that has been paid can never be deleted (this is what keeps delete_charge_batch safe).
  charge_id   uuid not null references public.charges (id) on delete restrict,
  amount      numeric(12, 2) not null check (amount > 0),
  primary key (payment_id, charge_id)
);
create index payment_allocations_charge_id_idx on public.payment_allocations (charge_id);

-- ---------------------------------------------------------------------------
-- 2. Helpers (private schema)
-- ---------------------------------------------------------------------------
-- The receipt number: MKB-<Istanbul year>-<6 digits>. "MKB" is a placeholder prefix (company setting later).
create or replace function private.next_receipt_no(p_at timestamptz)
returns text
language sql
volatile
set search_path = ''
as $$
  select 'MKB-' || to_char(p_at at time zone 'Europe/Istanbul', 'YYYY') || '-' || lpad(nextval('private.receipt_seq')::text, 6, '0');
$$;

-- How much of a line has been paid (approved payments only: a voided payment frees the line again).
-- Called by the views as the logged-in user, so "authenticated" needs EXECUTE. It reveals nothing
-- beyond the line the caller can already see: residents never read payments or allocations.
create or replace function private.charge_paid(p_charge uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(a.amount), 0)::numeric(12, 2)
    from public.payment_allocations a
    join public.payments p on p.id = a.payment_id
   where a.charge_id = p_charge and p.status = 'approved';
$$;

create or replace function private.charge_has_payment(p_charge uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
     where a.charge_id = p_charge and p.status = 'approved'
  );
$$;

create or replace function private.company_of_unit(p_unit uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.company_id
    from public.units u
    join public.blocks b on b.id = u.block_id
    join public.sites s on s.id = b.site_id
   where u.id = p_unit;
$$;

-- Who may read a payment: the payer (while they live there), and the OWNERS of the unit.
-- A tenant never sees what the owner paid. Admins are covered by their own policy.
create or replace function private.resident_sees_payment(p_unit uuid, p_payer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.unit_residents r
      join public.profiles p on p.id = r.profile_id
     where r.unit_id = p_unit
       and r.profile_id = (select auth.uid())
       and p.is_active
       and r.start_date <= (now() at time zone 'Europe/Istanbul')::date
       and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
       and (r.relation = 'owner' or p_payer = (select auth.uid()))
  );
$$;

-- The fee on top of a payment. Default: the management pays the commission, so the resident pays 0.
-- Settings (Ayarlar, later): {"payment": {"commission_payer": "resident", "fee_pct": {"2": 2.5, "3": 3.5}}}
-- fee_pct is the percentage for that number of installments. Rounded to the kuruş.
create or replace function private.payment_fee(p_company uuid, p_principal_kurus bigint, p_installments integer)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payment jsonb;
  v_pct     numeric := 0;
  v_text    text;
begin
  select c.settings -> 'payment' into v_payment from public.companies c where c.id = p_company;
  if coalesce(v_payment ->> 'commission_payer', 'management') <> 'resident' then
    return 0;
  end if;
  v_text := v_payment -> 'fee_pct' ->> p_installments::text;
  if v_text ~ '^[0-9]{1,2}([.][0-9]{1,2})?$' then
    v_pct := v_text::numeric;
  end if;
  return round(p_principal_kurus * v_pct / 100)::bigint;
end;
$$;

-- THE one place that decides which lines a resident may pay now. It locks the lines (in a fixed order, so two
-- payments cannot both close the same line), then checks them again.
--   - the caller is a current, active resident who may SEE every line (the rule of 0004, so a tenant who
--     guesses the id of a hidden line is refused by the very same rule), and is not an admin of the site
--   - 1 to 100 different lines, none cancelled, all in ONE unit, none already paid
-- A hidden, unknown or cancelled id all give the same answer ('charge_not_payable'), so ids cannot be probed.
create or replace function private.payment_lines(p_charge_ids uuid[])
returns table (charge_id uuid, unit_id uuid, remaining_kurus bigint, type_name text, description text, period date, due_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found integer;
  v_units integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_charge_ids is null or cardinality(p_charge_ids) not between 1 and 100
     or (select count(distinct x) from unnest(p_charge_ids) as x) <> cardinality(p_charge_ids) then
    raise exception 'charges_invalid';
  end if;

  perform 1 from public.charges c where c.id = any (p_charge_ids) order by c.id for update;

  select count(*), count(distinct c.unit_id) into v_found, v_units
    from public.charges c
   where c.id = any (p_charge_ids)
     and c.voided_at is null
     and private.resident_sees_charge(c.unit_id, c.tenant_visible, c.due_date)
     and not private.is_site_admin(private.unit_site_id(c.unit_id));
  if v_found <> cardinality(p_charge_ids) then
    raise exception 'charge_not_payable';
  end if;
  if v_units <> 1 then
    raise exception 'one_unit_only';
  end if;
  if exists (select 1 from public.charges c where c.id = any (p_charge_ids) and c.amount - private.charge_paid(c.id) <= 0) then
    raise exception 'already_paid';
  end if;

  return query
    select c.id, c.unit_id, ((c.amount - private.charge_paid(c.id)) * 100)::bigint, t.name, c.description, c.period, c.due_date
      from public.charges c
      left join public.charge_types t on t.id = c.charge_type_id
     where c.id = any (p_charge_ids)
     order by c.due_date, c.created_at, c.id;
end;
$$;

revoke all on function private.next_receipt_no(timestamptz) from public, anon, authenticated;
revoke all on function private.charge_has_payment(uuid) from public, anon, authenticated;
revoke all on function private.company_of_unit(uuid) from public, anon, authenticated;
revoke all on function private.payment_fee(uuid, bigint, integer) from public, anon, authenticated;
revoke all on function private.payment_lines(uuid[]) from public, anon, authenticated;
revoke all on function private.charge_paid(uuid) from public, anon;
revoke all on function private.resident_sees_payment(uuid, uuid) from public, anon;
-- Called by a view and by a policy, as the logged-in user:
grant execute on function private.charge_paid(uuid) to authenticated;
grant execute on function private.resident_sees_payment(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Public functions
-- ---------------------------------------------------------------------------
-- What would be paid? One row per line; the fee and the total repeat on every row. Writes nothing.
create or replace function public.quote_payment(p_charge_ids uuid[], p_installments integer)
returns table (
  charge_id uuid, unit_id uuid, type_name text, description text, period date, due_date date,
  amount_kurus bigint, fee_kurus bigint, total_kurus bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_principal bigint;
  v_unit      uuid;
  v_company   uuid;
  v_fee       bigint;
begin
  if p_installments is null or p_installments not in (1, 2, 3, 6, 9) then
    raise exception 'installments_invalid';
  end if;
  select sum(l.remaining_kurus), (array_agg(l.unit_id))[1] into v_principal, v_unit
    from private.payment_lines(p_charge_ids) l;
  v_company := private.company_of_unit(v_unit);
  if (select c.settings ->> 'payment_mode' from public.companies c where c.id = v_company) is distinct from 'mock' then
    raise exception 'payment_disabled';
  end if;
  v_fee := private.payment_fee(v_company, v_principal, p_installments);

  return query
    select l.charge_id, l.unit_id, l.type_name, l.description, l.period, l.due_date, l.remaining_kurus, v_fee, v_principal + v_fee
      from private.payment_lines(p_charge_ids) l;
end;
$$;

-- "Onayla" on the fake 3D Secure screen. In ONE transaction: the payment, its allocations and the receipt number.
-- p_expected_total_kurus is the total of the quote the resident saw; if anything changed, nothing is paid.
create or replace function public.pay_charges_mock(
  p_request_id           uuid,
  p_charge_ids           uuid[],
  p_installments         integer,
  p_expected_total_kurus bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_existing  public.payments;
  v_principal bigint;
  v_unit      uuid;
  v_company   uuid;
  v_fee       bigint;
  v_payment   uuid;
  v_paid_at   timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_request_id is null or p_expected_total_kurus is null then
    raise exception 'invalid_request';
  end if;
  if p_installments is null or p_installments not in (1, 2, 3, 6, 9) then
    raise exception 'installments_invalid';
  end if;

  -- A second call with the same request id returns the first payment (double click, retry).
  select * into v_existing from public.payments p where p.request_id = p_request_id;
  if found then
    if v_existing.payer_id is distinct from v_uid then
      raise exception 'request_id_used';
    end if;
    return v_existing.id;
  end if;

  select sum(l.remaining_kurus), (array_agg(l.unit_id))[1] into v_principal, v_unit
    from private.payment_lines(p_charge_ids) l;
  v_company := private.company_of_unit(v_unit);
  if (select c.settings ->> 'payment_mode' from public.companies c where c.id = v_company) is distinct from 'mock' then
    raise exception 'payment_disabled';
  end if;
  v_fee := private.payment_fee(v_company, v_principal, p_installments);
  if v_principal + v_fee <> p_expected_total_kurus then
    raise exception 'quote_outdated';
  end if;

  insert into public.payments (
    unit_id, payer_id, payer_name, unit_label, amount, fee, method, status, provider, installments,
    request_id, paid_at, receipt_no, created_by
  )
  select v_unit, v_uid, p.full_name, b.name || ' · ' || u.door_no, v_principal::numeric / 100, v_fee::numeric / 100,
         'card', 'approved', 'mock', p_installments, p_request_id, v_paid_at, private.next_receipt_no(v_paid_at), v_uid
    from public.units u
    join public.blocks b on b.id = u.block_id
    left join public.profiles p on p.id = v_uid
   where u.id = v_unit
  on conflict (request_id) do nothing
  returning id into v_payment;

  if v_payment is null then
    -- Lost a race with the same request id: return the payment the other call made.
    select p.id into v_payment from public.payments p where p.request_id = p_request_id and p.payer_id = v_uid;
    if v_payment is null then
      raise exception 'request_id_used';
    end if;
    return v_payment;
  end if;

  insert into public.payment_allocations (payment_id, charge_id, amount)
  select v_payment, l.charge_id, l.remaining_kurus::numeric / 100
    from private.payment_lines(p_charge_ids) l;

  return v_payment;
end;
$$;

-- The data of one receipt, straight from the database. Admins, the payer and the owners of the unit may read it.
create or replace function public.get_receipt(p_payment uuid)
returns table (
  receipt_no text, paid_at timestamptz, status text, void_reason text, method text, provider text, installments integer,
  amount_kurus bigint, fee_kurus bigint, total_kurus bigint, payer_name text, unit_label text,
  site_name text, company_name text, lines jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments p where p.id = p_payment;
  if not found or (select auth.uid()) is null
     or not (private.is_site_admin(private.unit_site_id(v_pay.unit_id)) or private.resident_sees_payment(v_pay.unit_id, v_pay.payer_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
    select v_pay.receipt_no, v_pay.paid_at, v_pay.status, v_pay.void_reason, v_pay.method, v_pay.provider, v_pay.installments,
           (v_pay.amount * 100)::bigint, (v_pay.fee * 100)::bigint, ((v_pay.amount + v_pay.fee) * 100)::bigint,
           v_pay.payer_name, v_pay.unit_label, s.name, co.name,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'type_name', t.name, 'description', c.description, 'period', c.period,
                      'due_date', c.due_date, 'amount_kurus', (a.amount * 100)::bigint
                    ) order by c.due_date, c.created_at, c.id)
               from public.payment_allocations a
               join public.charges c on c.id = a.charge_id
               left join public.charge_types t on t.id = c.charge_type_id
              where a.payment_id = v_pay.id
           ), '[]'::jsonb)
      from public.units u
      join public.blocks b on b.id = u.block_id
      join public.sites s on s.id = b.site_id
      join public.companies co on co.id = s.company_id
     where u.id = v_pay.unit_id;
end;
$$;

-- An admin cancels a payment (a mistake, a test). The payment and its receipt stay, marked as cancelled; the
-- lines become unpaid again. Refunds and manual entries come with slice 7.
create or replace function public.void_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay    public.payments;
  v_reason text := btrim(p_reason);
begin
  select * into v_pay from public.payments p where p.id = p_payment;
  if not found or (select auth.uid()) is null or not private.is_site_admin(private.unit_site_id(v_pay.unit_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'reason_invalid';
  end if;
  if v_pay.status = 'voided' then
    raise exception 'already_voided';
  end if;
  update public.payments
     set status = 'voided', voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_payment;
end;
$$;

revoke all on function public.quote_payment(uuid[], integer) from public, anon;
revoke all on function public.pay_charges_mock(uuid, uuid[], integer, bigint) from public, anon;
revoke all on function public.get_receipt(uuid) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.quote_payment(uuid[], integer) to authenticated;
grant execute on function public.pay_charges_mock(uuid, uuid[], integer, bigint) to authenticated;
grant execute on function public.get_receipt(uuid) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security + grants
-- ---------------------------------------------------------------------------
alter table public.payments            enable row level security;
alter table public.payment_allocations enable row level security;

revoke all on public.payments, public.payment_allocations from anon, authenticated;
grant select on public.payments, public.payment_allocations to authenticated;

create policy "payments: read" on public.payments for select to authenticated
  using (private.is_site_admin(private.unit_site_id(unit_id)) or private.resident_sees_payment(unit_id, payer_id));
-- Allocations: admins only. Residents see paid amounts through the views, never the allocations.
create policy "payment_allocations: admin read" on public.payment_allocations for select to authenticated
  using (private.is_site_admin(private.unit_site_id((select c.unit_id from public.charges c where c.id = charge_id))));

-- ---------------------------------------------------------------------------
-- 5. One read policy per table (the admin and resident policies of 0003 / 0004 are merged)
-- ---------------------------------------------------------------------------
drop policy "charges: admin read" on public.charges;
drop policy "charges: resident read" on public.charges;
create policy "charges: read" on public.charges for select to authenticated
  using (
    private.is_site_admin(private.unit_site_id(unit_id))
    or (voided_at is null and private.resident_sees_charge(unit_id, tenant_visible, due_date))
  );

drop policy "charge_types: admin read" on public.charge_types;
drop policy "charge_types: resident read" on public.charge_types;
create policy "charge_types: read" on public.charge_types for select to authenticated
  using (private.is_company_admin(company_id) or private.is_company_resident(company_id));

-- ---------------------------------------------------------------------------
-- 6. The views show the real paid amount
-- ---------------------------------------------------------------------------
-- Dropped and made again (a view cannot change a column's meaning in place). Grants disappear with a drop,
-- so they are given again below.
--   status order: voided, paid, partial (something paid, something left), overdue, open
drop view public.unit_balances;
drop view public.charge_status;

create view public.charge_status with (security_invoker = true) as
select l.charge_id,
       l.unit_id,
       l.charge_type_id,
       l.type_name,
       l.block_name,
       l.door_no,
       l.period,
       l.description,
       l.amount,
       l.paid_amount,
       l.remaining,
       l.due_date,
       l.status,
       l.created_at,
       (sum(l.remaining) over (
          partition by l.unit_id
          order by l.due_date, l.created_at, l.charge_id
          rows between unbounded preceding and current row
        ))::numeric(14, 2) as running_balance,
       l.site_id,
       l.block_id
  from (
    select c.id as charge_id,
           c.unit_id,
           c.charge_type_id,
           t.name as type_name,
           b.name as block_name,
           u.door_no,
           c.period,
           c.description,
           c.amount,
           pd.paid as paid_amount,
           case when c.voided_at is not null then 0::numeric(12, 2) else (c.amount - pd.paid)::numeric(12, 2) end as remaining,
           c.due_date,
           case when c.voided_at is not null then 'voided'
                when c.amount - pd.paid <= 0 then 'paid'
                when pd.paid > 0 then 'partial'
                when c.due_date < (now() at time zone 'Europe/Istanbul')::date then 'overdue'
                else 'open' end as status,
           c.created_at,
           b.site_id,
           u.block_id
      from public.charges c
      cross join lateral (select private.charge_paid(c.id) as paid) pd
      left join public.charge_types t on t.id = c.charge_type_id
      left join public.units u on u.id = c.unit_id
      left join public.blocks b on b.id = u.block_id
  ) l;

create view public.unit_balances with (security_invoker = true) as
select s.unit_id,
       (count(*) filter (where s.status <> 'voided'))::integer as line_count,
       (coalesce(sum(s.amount) filter (where s.status <> 'voided'), 0))::numeric(14, 2) as charged,
       (coalesce(sum(s.paid_amount) filter (where s.status <> 'voided'), 0))::numeric(14, 2) as paid,
       (coalesce(sum(s.remaining), 0))::numeric(14, 2) as balance,
       -- overdue = something is still owed and the due date has passed (a partly paid line counts for what is left)
       (coalesce(sum(s.remaining) filter (where s.remaining > 0 and s.due_date < (now() at time zone 'Europe/Istanbul')::date), 0))::numeric(14, 2) as overdue_amount,
       (count(*) filter (where s.remaining > 0 and s.due_date < (now() at time zone 'Europe/Istanbul')::date))::integer as overdue_count,
       min(s.due_date) filter (where s.remaining > 0 and s.due_date >= (now() at time zone 'Europe/Istanbul')::date) as next_due_date
  from public.charge_status s
 group by s.unit_id;

revoke all on public.charge_status, public.unit_balances from anon, authenticated;
grant select on public.charge_status, public.unit_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The slice 4 guards (a paid line is part of the books)
-- ---------------------------------------------------------------------------
-- Security definer now: it asks charge_has_payment, which an admin cannot call directly.
create or replace function private.guard_charge_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.voided_at is not null
     and (new.amount, new.due_date, new.tenant_visible) is distinct from (old.amount, old.due_date, old.tenant_visible)
  then
    raise exception 'charge_voided' using errcode = '23514';
  end if;
  if (new.amount, new.due_date) is distinct from (old.amount, old.due_date) and private.charge_has_payment(old.id) then
    raise exception 'charge_paid' using errcode = '23514';
  end if;
  return new;
end;
$$;

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
  delete from public.charge_batches where id = p_batch;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The demo company may use the mock (see the SAFETY SWITCH at the top)
-- ---------------------------------------------------------------------------
update public.companies
   set settings = settings || '{"payment_mode": "mock"}'::jsonb
 where id = '00000000-0000-0000-0000-000000000001';
