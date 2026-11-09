-- 0004_resident_charges.sql
-- Slice 5: residents read their own charges (Ana Sayfa, Borçlarım, ekstre). Plan sections 5, 7, 9.
--
-- What is added
--   1. private.resident_sees_charge()   the ONE rule for "may this resident see this charge line?"
--   2. RLS policies                     residents read charges, and the names of charge types
--   3. charge_status (view)             one row per line: status, remaining amount, running balance
--   4. unit_balances (view)             one row per unit: total debt, overdue, next due date
--
-- THE RULE (written once, in resident_sees_charge):
--   A resident sees charge lines only for a CURRENT residency of an ACTIVE account
--   (started, and not moved out: end_date is the day they moved out). Cancelled lines are hidden.
--     - An OWNER sees every line of the unit. The debt belongs to the unit (KMK m. 22).
--     - A TENANT sees only lines the admin marked "kiracıya yansıt" (tenant_visible) AND whose
--       due date is on or after the tenant's own start date. So a NEW tenant never sees the lines of
--       the previous tenant. Because of this, an admin who enters an EXISTING tenant today with
--       start date = today hides that tenant's older lines. The start date must be the real move-in date.
--     - A person who moved out sees nothing.
--
-- Same safety rules as before: explicit grants, search_path = '' on security-definer functions.
--
-- Left for slice 6 (payments): charge_status.paid_amount is 0 for now. Slice 6 REPLACES the two views
-- (create or replace view) so that paid and remaining come from payment_allocations. The guards
-- listed at the top of 0003_charges.sql still apply.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
-- IMPORTANT: policies call these helpers AS THE LOGGED-IN USER, so "authenticated" needs EXECUTE.
-- (The helpers in 0003 were only called by security-definer functions, so they had no grant.
-- Without the grant below, every select on charges would fail, admins included.)
create or replace function private.resident_sees_charge(p_unit uuid, p_tenant_visible boolean, p_due_date date)
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
       and (r.relation = 'owner' or (p_tenant_visible and p_due_date >= r.start_date))
  );
$$;

-- Does the current user live (today) in a unit of a site that belongs to this company?
create or replace function private.is_company_resident(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.my_units() mu
      join public.units u on u.id = mu.unit_id
      join public.blocks b on b.id = u.block_id
      join public.sites s on s.id = b.site_id
     where s.company_id = p_company
  );
$$;

revoke all on function private.resident_sees_charge(uuid, boolean, date) from public, anon;
revoke all on function private.is_company_resident(uuid) from public, anon;
grant execute on function private.resident_sees_charge(uuid, boolean, date) to authenticated;
grant execute on function private.is_company_resident(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policies (added next to the admin policies of 0003; policies are OR-ed)
-- ---------------------------------------------------------------------------
create policy "charges: resident read" on public.charges for select to authenticated
  using (voided_at is null and private.resident_sees_charge(unit_id, tenant_visible, due_date));

-- A resident needs the NAME of a charge type ("Aidat") to read their lines.
create policy "charge_types: resident read" on public.charge_types for select to authenticated
  using (private.is_company_resident(company_id));

-- Residents still cannot read batches or plans, and cannot write anything: no policy, no grant.

-- ---------------------------------------------------------------------------
-- 3. charge_status: one row per charge line
-- ---------------------------------------------------------------------------
-- security_invoker: the view reads charges with the CALLER's rights, so the rule above decides which
-- lines exist for a resident. A tenant's balance therefore counts only the lines the tenant can see.
--   status    'voided' | 'overdue' (due before today, Istanbul) | 'open'   (slice 6 adds partial / paid)
--   remaining what is still owed on the line (0 for a cancelled line)
--   running_balance  the debt after this line, in due date order (ties: creation time, then id).
--                    It is the ledger a statement (ekstre) shows. It is computed here, not in the browser.
-- The tenant_visible flag is deliberately NOT in the view: residents are never shown that flag.
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
        ))::numeric(14, 2) as running_balance
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
           -- Slice 6 replaces this with the sum of payment_allocations.
           0::numeric(12, 2) as paid_amount,
           case when c.voided_at is not null then 0::numeric(12, 2) else c.amount end as remaining,
           c.due_date,
           case when c.voided_at is not null then 'voided'
                when c.due_date < (now() at time zone 'Europe/Istanbul')::date then 'overdue'
                else 'open' end as status,
           c.created_at
      from public.charges c
      left join public.charge_types t on t.id = c.charge_type_id
      left join public.units u on u.id = c.unit_id
      left join public.blocks b on b.id = u.block_id
  ) l;

-- ---------------------------------------------------------------------------
-- 4. unit_balances: one row per unit (only units that have lines the caller can see)
-- ---------------------------------------------------------------------------
create view public.unit_balances with (security_invoker = true) as
select s.unit_id,
       (count(*) filter (where s.status <> 'voided'))::integer as line_count,
       (coalesce(sum(s.amount) filter (where s.status <> 'voided'), 0))::numeric(14, 2) as charged,
       (coalesce(sum(s.paid_amount) filter (where s.status <> 'voided'), 0))::numeric(14, 2) as paid,
       (coalesce(sum(s.remaining), 0))::numeric(14, 2) as balance,
       (coalesce(sum(s.remaining) filter (where s.status = 'overdue'), 0))::numeric(14, 2) as overdue_amount,
       (count(*) filter (where s.status = 'overdue'))::integer as overdue_count,
       -- the earliest due date that is still ahead (today counts)
       min(s.due_date) filter (where s.status = 'open' and s.remaining > 0) as next_due_date
  from public.charge_status s
 group by s.unit_id;

revoke all on public.charge_status, public.unit_balances from anon, authenticated;
grant select on public.charge_status, public.unit_balances to authenticated;
