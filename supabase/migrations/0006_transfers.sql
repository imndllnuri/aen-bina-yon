-- 0006_transfers.sql
-- Slice 7: the offline payment channels. Plan sections 7, 8, 9, 12.
--
-- What is added
--   1. transfer_notices          a resident says "I sent a havale/EFT" and uploads the dekont (bank slip)
--   2. storage bucket dekontlar  private, 5 MB, PDF / JPG / PNG, one folder per unit
--   3. submit / cancel / approve / reject   the only ways to change a notice (no direct writes)
--   4. record_manual_payment     an admin records cash, office card (POS) or havale money
--   5. preview_allocation        which lines would be closed, before the admin confirms
--   6. bank accounts             the IBANs residents see (stored in companies.settings, saved by a checked function)
--   7. a payer may only close lines the payer can SEE (private.profile_sees_charge, one rule in one place)
--   8. payments.note, payments.created_at; get_receipt shows the note
--   9. companies.settings can no longer be written from the browser (it holds the payment safety switch)
--
-- How money is spread over lines (the allocation rule)
--   Oldest due date first (FIFO), in integer kuruş. The last line may be paid only in part.
--   An admin may pick the lines; the money then goes over the picked lines in the same order.
--   The amount may NOT be bigger than what is open ('amount_exceeds_debt'): overpayment credit (alacak)
--   and refunds are NOT built yet. A prepayment that is bigger than the debt must be rejected with a reason.
--
-- OBLIGATIONS for later slices
--   Slice 8 (notifications): "Yeni havale bildirimi" to admins when a notice is submitted; "Havale onaylandı /
--     reddedildi" to the resident; a receipt notification for manual payments. Until then the resident sees the
--     status and the reject reason inside the app (Havale Bildir, Ödemelerim).
--   Slice 10 (Ayarlar / audit log): a settings screen for bank accounts moves there; approve / reject / manual
--     entry must be written to the audit log. Old files of rejected or cancelled notices are not deleted yet.
--   Real provider (iyzico): refunds, overpayment credit, pending / failed payment statuses.
--
-- The manual and havale paths do NOT depend on companies.settings.payment_mode: they record real money
-- that already arrived. Only the fake card checkout (pay_charges_mock) needs that switch.
--
-- Same safety rules as before: explicit grants, search_path = '' on security-definer functions, public functions
-- check the caller inside, errors are short machine codes, helpers live in the private schema.

-- ---------------------------------------------------------------------------
-- 1. One visibility rule for charges: "may THIS person see this line?"
-- ---------------------------------------------------------------------------
-- resident_sees_charge (0004) answered it for the logged-in user only. A payment made by someone else (an admin
-- approving a tenant's havale) must close only the lines the PAYER could see, or the tenant's receipt would
-- show an owner-only line (for example a Demirbaş charge). So the rule now takes the person as an argument,
-- and resident_sees_charge simply asks it for auth.uid(): the rule exists once.
create or replace function private.profile_sees_charge(p_profile uuid, p_unit uuid, p_tenant_visible boolean, p_due_date date)
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
       and r.profile_id = p_profile
       and p.is_active
       and r.start_date <= (now() at time zone 'Europe/Istanbul')::date
       and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
       and (r.relation = 'owner' or (p_tenant_visible and p_due_date >= r.start_date))
  );
$$;

create or replace function private.resident_sees_charge(p_unit uuid, p_tenant_visible boolean, p_due_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.profile_sees_charge((select auth.uid()), p_unit, p_tenant_visible, p_due_date);
$$;

-- Does this person live in this unit today (and is the account active)?
create or replace function private.is_current_resident(p_profile uuid, p_unit uuid)
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
       and r.profile_id = p_profile
       and p.is_active
       and r.start_date <= (now() at time zone 'Europe/Istanbul')::date
       and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
  );
$$;

-- A Turkish IBAN: TR + 24 digits, with the ISO 7064 check (mod 97 must be 1).
create or replace function private.valid_tr_iban(p_iban text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_text text;
  v_rem  integer := 0;
  i      integer;
begin
  if v_iban !~ '^TR[0-9]{24}$' then
    return false;
  end if;
  -- Move the first four characters to the end; the letters T and R become 29 and 27.
  v_text := replace(replace(substr(v_iban, 5) || substr(v_iban, 1, 4), 'T', '29'), 'R', '27');
  for i in 1 .. char_length(v_text) loop
    v_rem := (v_rem * 10 + substr(v_text, i, 1)::integer) % 97;
  end loop;
  return v_rem = 1;
end;
$$;

revoke all on function private.profile_sees_charge(uuid, uuid, boolean, date) from public, anon, authenticated;
revoke all on function private.is_current_resident(uuid, uuid) from public, anon, authenticated;
revoke all on function private.valid_tr_iban(text) from public, anon, authenticated;
-- Still called by policies as the logged-in user (granted in 0004, unchanged):
revoke all on function private.resident_sees_charge(uuid, boolean, date) from public, anon;
grant execute on function private.resident_sees_charge(uuid, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. payments: a note that is printed on the receipt, and the time the row was made
-- ---------------------------------------------------------------------------
-- paid_at is the MONEY date (the transfer date, or the day the cash arrived). created_at is when someone typed it in.
-- The receipt NUMBER takes its year from the issue time (now), so numbers keep growing with the calendar.
alter table public.payments add column note text check (note is null or char_length(btrim(note)) between 1 and 300);
alter table public.payments add column created_at timestamptz not null default now();
update public.payments set created_at = paid_at;

-- ---------------------------------------------------------------------------
-- 3. transfer_notices
-- ---------------------------------------------------------------------------
create table public.transfer_notices (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units (id) on delete restrict,
  profile_id   uuid references public.profiles (id) on delete set null,
  amount       numeric(12, 2) not null check (amount >= 1),
  -- The date written on the bank slip (not in the future, at most 90 days back: checked by submit).
  sent_on      date not null,
  sender_name  text not null check (char_length(btrim(sender_name)) between 2 and 100),
  note         text check (note is null or char_length(btrim(note)) between 1 and 300),
  -- Path in the private bucket dekontlar: <unit id>/<uuid>.<pdf|jpg|png>. One file belongs to one notice.
  file_path    text not null unique,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  -- A random id from the browser: a double click returns the same notice.
  request_id   uuid not null unique,
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  reject_reason text check (reject_reason is null or char_length(btrim(reject_reason)) between 3 and 300),
  -- RESTRICT + UNIQUE: a payment belongs to one notice, and a payment that came from a notice cannot be deleted.
  payment_id   uuid unique references public.payments (id) on delete restrict,
  check ((status = 'approved') = (payment_id is not null)),
  check ((status = 'rejected') = (reject_reason is not null)),
  check ((status in ('approved', 'rejected')) = (reviewed_at is not null))
);
create index transfer_notices_unit_idx on public.transfer_notices (unit_id, created_at desc);
create index transfer_notices_profile_idx on public.transfer_notices (profile_id, created_at desc);
create index transfer_notices_pending_idx on public.transfer_notices (created_at) where status = 'pending';

alter table public.transfer_notices enable row level security;

-- Nobody writes this table directly: the functions below do. Reads: the sender and the admins of the unit's site.
-- reviewed_by is not readable (who clicked is for the audit log of slice 10).
revoke all on public.transfer_notices from anon, authenticated;
grant select (id, unit_id, profile_id, amount, sent_on, sender_name, note, file_path, status, created_at, reviewed_at, reject_reason, payment_id)
  on public.transfer_notices to authenticated;

create policy "transfer_notices: read" on public.transfer_notices for select to authenticated
  using (private.is_site_admin(private.unit_site_id(unit_id)) or profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. The dekont bucket (private) and its policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dekontlar', 'dekontlar', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

-- Upload: only into the folder of a unit the person lives in today, with a name of the exact shape
-- <unit uuid>/<uuid>.<pdf|jpg|png>. Folder and unit are compared as TEXT (a ::uuid cast of a strange folder name
-- would raise an error inside a policy).
create policy "dekontlar: resident upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dekontlar'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|png)$'
    and (storage.foldername(name))[1] in (select m.unit_id::text from private.my_units() m)
  );

-- Read: the person who uploaded it, and the admins of the unit's site. Nobody can update or delete from the browser.
create policy "dekontlar: uploader or admin read" on storage.objects for select to authenticated
  using (
    bucket_id = 'dekontlar'
    and (
      owner_id = (select auth.uid())::text
      or exists (
        select 1 from public.units u
         where u.id::text = (storage.foldername(name))[1]
           and private.is_site_admin(private.unit_site_id(u.id))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. The allocation engine (admin side)
-- ---------------------------------------------------------------------------
-- Which lines would an amount close? Used by the preview, by "record a manual payment" and by "approve a notice".
--   p_payer       the person who pays (a current resident), or null (then every line of the unit may be closed)
--   p_charge_ids  the lines the admin picked, or null for "oldest first over every open line the payer can see"
--   p_lock        true when the payment will be written (locks the lines, in id order, like payment_lines)
-- One row per line that is still open: what is left, and how much of the amount goes to it. excess_kurus (the same on
-- every row) is the part of the amount that no open line can take.
create or replace function private.allocate_for_admin(
  p_unit         uuid,
  p_payer        uuid,
  p_amount_kurus bigint,
  p_charge_ids   uuid[],
  p_lock         boolean
)
returns table (
  charge_id uuid, type_name text, description text, period date, due_date date,
  remaining_kurus bigint, apply_kurus bigint, excess_kurus bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seen integer;
  v_open integer;
begin
  if (select auth.uid()) is null or not private.is_site_admin(private.unit_site_id(p_unit)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_amount_kurus is null or p_amount_kurus < 1 or p_amount_kurus > 100000000 then
    raise exception 'amount_invalid';
  end if;
  if p_charge_ids is not null
     and (cardinality(p_charge_ids) not between 1 and 100
          or (select count(distinct x) from unnest(p_charge_ids) as x) <> cardinality(p_charge_ids)) then
    raise exception 'charges_invalid';
  end if;

  if p_lock then
    if p_charge_ids is null then
      perform 1 from public.charges c where c.unit_id = p_unit and c.voided_at is null order by c.id for update;
    else
      perform 1 from public.charges c where c.id = any (p_charge_ids) order by c.id for update;
    end if;
  end if;

  if p_charge_ids is not null then
    -- Every picked line must belong to this unit, be alive and be visible to the payer. A wrong, hidden or cancelled
    -- id all give the same answer.
    select count(*), count(*) filter (where c.amount - private.charge_paid(c.id) > 0) into v_seen, v_open
      from public.charges c
     where c.id = any (p_charge_ids)
       and c.unit_id = p_unit
       and c.voided_at is null
       and (p_payer is null or private.profile_sees_charge(p_payer, c.unit_id, c.tenant_visible, c.due_date));
    if v_seen <> cardinality(p_charge_ids) then
      raise exception 'charge_not_payable';
    end if;
    if v_open <> cardinality(p_charge_ids) then
      raise exception 'already_paid';
    end if;
  end if;

  return query
    with cand as (
      select c.id as cid, c.due_date as cdue, c.created_at as ccreated, t.name as tname, c.description as cdesc, c.period as cper,
             ((c.amount - private.charge_paid(c.id)) * 100)::bigint as rem
        from public.charges c
        left join public.charge_types t on t.id = c.charge_type_id
       where c.unit_id = p_unit
         and c.voided_at is null
         and (p_charge_ids is null or c.id = any (p_charge_ids))
         and (p_payer is null or private.profile_sees_charge(p_payer, c.unit_id, c.tenant_visible, c.due_date))
    ),
    open_lines as (
      select * from cand where cand.rem > 0
    ),
    running as (
      select o.*,
             coalesce(sum(o.rem) over (order by o.cdue, o.ccreated, o.cid rows between unbounded preceding and 1 preceding), 0)::bigint as before_kurus
        from open_lines o
    )
    select r.cid, r.tname, r.cdesc, r.cper, r.cdue, r.rem,
           greatest(0, least(r.rem, p_amount_kurus - r.before_kurus))::bigint,
           greatest(0, p_amount_kurus - (select sum(o.rem) from open_lines o))::bigint
      from running r
     order by r.cdue, r.ccreated, r.cid;
end;
$$;

-- Writes ONE approved payment with its allocations. Used by record_manual_payment and approve_transfer_notice.
-- The caller must be an admin of the unit's site (checked again inside allocate_for_admin).
create or replace function private.issue_payment(
  p_actor        uuid,
  p_unit         uuid,
  p_payer        uuid,
  p_payer_name   text,
  p_method       text,
  p_amount_kurus bigint,
  p_paid_on      date,
  p_charge_ids   uuid[],
  p_note         text,
  p_provider_ref text,
  p_request_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := (now() at time zone 'Europe/Istanbul')::date;
  v_rows    integer;
  v_excess  bigint;
  v_paid_at timestamptz;
  v_name    text := nullif(btrim(p_payer_name), '');
  v_payment uuid;
  v_sum     bigint;
begin
  if p_method not in ('cash', 'pos', 'havale') then
    raise exception 'method_invalid';
  end if;
  if p_paid_on is null or p_paid_on > v_today or p_paid_on < v_today - 365 then
    raise exception 'date_invalid';
  end if;
  if p_note is not null and char_length(btrim(p_note)) not between 1 and 300 then
    raise exception 'note_invalid';
  end if;
  if p_payer is not null then
    if not private.is_current_resident(p_payer, p_unit) then
      raise exception 'payer_invalid';
    end if;
    select coalesce(nullif(btrim(pr.full_name), ''), v_name) into v_name from public.profiles pr where pr.id = p_payer;
  elsif v_name is null or char_length(v_name) not between 2 and 100 then
    raise exception 'payer_name_invalid';
  end if;

  select count(*), max(a.excess_kurus) into v_rows, v_excess
    from private.allocate_for_admin(p_unit, p_payer, p_amount_kurus, p_charge_ids, true) a;
  if v_rows = 0 then
    raise exception 'no_open_lines';
  end if;
  if v_excess > 0 then
    raise exception 'amount_exceeds_debt';
  end if;

  -- Today: the real time. An earlier day: noon in Istanbul (the money date; the exact time is not known).
  v_paid_at := case when p_paid_on = v_today then now() else (p_paid_on + time '12:00') at time zone 'Europe/Istanbul' end;

  insert into public.payments (
    unit_id, payer_id, payer_name, unit_label, amount, fee, method, status, provider, provider_ref, installments,
    request_id, paid_at, receipt_no, created_by, note
  )
  select p_unit, p_payer, v_name, b.name || ' · ' || u.door_no, p_amount_kurus::numeric / 100, 0, p_method, 'approved', 'manual',
         p_provider_ref, 1, p_request_id, v_paid_at, private.next_receipt_no(now()), p_actor, nullif(btrim(p_note), '')
    from public.units u
    join public.blocks b on b.id = u.block_id
   where u.id = p_unit
  returning id into v_payment;

  insert into public.payment_allocations (payment_id, charge_id, amount)
  select v_payment, a.charge_id, a.apply_kurus::numeric / 100
    from private.allocate_for_admin(p_unit, p_payer, p_amount_kurus, p_charge_ids, true) a
   where a.apply_kurus > 0;

  select (coalesce(sum(al.amount), 0) * 100)::bigint into v_sum from public.payment_allocations al where al.payment_id = v_payment;
  if v_sum <> p_amount_kurus then
    raise exception 'allocation_mismatch';
  end if;
  return v_payment;
end;
$$;

revoke all on function private.allocate_for_admin(uuid, uuid, bigint, uuid[], boolean) from public, anon, authenticated;
revoke all on function private.issue_payment(uuid, uuid, uuid, text, text, bigint, date, uuid[], text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Public functions: notices (resident side)
-- ---------------------------------------------------------------------------
-- "I sent a havale." The file must already be in the bucket (the browser uploads first), uploaded by this person,
-- in the folder of this unit.
create or replace function public.submit_transfer_notice(
  p_request_id   uuid,
  p_unit         uuid,
  p_amount_kurus bigint,
  p_sent_on      date,
  p_sender_name  text,
  p_note         text,
  p_file_path    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_today    date := (now() at time zone 'Europe/Istanbul')::date;
  v_existing public.transfer_notices;
  v_name     text := btrim(p_sender_name);
  v_note     text := nullif(btrim(p_note), '');
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_request_id is null or p_unit is null then
    raise exception 'invalid_request';
  end if;
  if not exists (select 1 from private.my_units() m where m.unit_id = p_unit) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- A second call with the same request id returns the first notice (double click, retry).
  select * into v_existing from public.transfer_notices n where n.request_id = p_request_id;
  if found then
    if v_existing.profile_id is distinct from v_uid then
      raise exception 'request_id_used';
    end if;
    return v_existing.id;
  end if;

  if p_amount_kurus is null or p_amount_kurus < 100 or p_amount_kurus > 100000000 then
    raise exception 'amount_invalid';
  end if;
  if p_sent_on is null or p_sent_on > v_today or p_sent_on < v_today - 90 then
    raise exception 'date_invalid';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 100 then
    raise exception 'sender_invalid';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'note_invalid';
  end if;
  if p_file_path is null
     or p_file_path !~ ('^' || p_unit::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|png)$')
     or not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'dekontlar' and o.name = p_file_path and o.owner_id = v_uid::text
     ) then
    raise exception 'file_invalid';
  end if;
  if exists (select 1 from public.transfer_notices n where n.file_path = p_file_path) then
    raise exception 'file_used';
  end if;
  -- Not a flood: at most 5 notices wait for the admin at the same time for one unit.
  if (select count(*) from public.transfer_notices n where n.unit_id = p_unit and n.status = 'pending') >= 5 then
    raise exception 'too_many_pending';
  end if;

  insert into public.transfer_notices (unit_id, profile_id, amount, sent_on, sender_name, note, file_path, request_id)
  values (p_unit, v_uid, p_amount_kurus::numeric / 100, p_sent_on, v_name, v_note, p_file_path, p_request_id)
  on conflict (request_id) do nothing
  returning id into v_id;

  if v_id is null then
    select n.id into v_id from public.transfer_notices n where n.request_id = p_request_id and n.profile_id = v_uid;
    if v_id is null then
      raise exception 'request_id_used';
    end if;
  end if;
  return v_id;
end;
$$;

-- The sender takes the notice back while it still waits.
create or replace function public.cancel_transfer_notice(p_notice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notice public.transfer_notices;
begin
  select * into v_notice from public.transfer_notices n where n.id = p_notice for update;
  if not found or (select auth.uid()) is null or v_notice.profile_id is distinct from (select auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_notice.status <> 'pending' then
    raise exception 'not_pending';
  end if;
  update public.transfer_notices set status = 'cancelled' where id = p_notice;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Public functions: the admin side
-- ---------------------------------------------------------------------------
-- What would this amount close? Writes nothing. The same engine as the real thing.
create or replace function public.preview_allocation(p_unit uuid, p_payer uuid, p_amount_kurus bigint, p_charge_ids uuid[])
returns table (
  charge_id uuid, type_name text, description text, period date, due_date date,
  remaining_kurus bigint, apply_kurus bigint, excess_kurus bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from private.allocate_for_admin(p_unit, p_payer, p_amount_kurus, p_charge_ids, false);
end;
$$;

-- Approve: the payment, its allocations and the receipt are made in ONE transaction. The money counts from the date
-- on the bank slip. A second click returns the same payment.
create or replace function public.approve_transfer_notice(p_notice uuid, p_charge_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notice  public.transfer_notices;
  v_payment uuid;
begin
  select * into v_notice from public.transfer_notices n where n.id = p_notice for update;
  if not found or (select auth.uid()) is null or not private.is_site_admin(private.unit_site_id(v_notice.unit_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_notice.status = 'approved' then
    return v_notice.payment_id;
  end if;
  if v_notice.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  v_payment := private.issue_payment(
    (select auth.uid()), v_notice.unit_id, v_notice.profile_id, v_notice.sender_name, 'havale', (v_notice.amount * 100)::bigint,
    v_notice.sent_on, p_charge_ids, null, 'notice:' || v_notice.id::text, null
  );

  update public.transfer_notices
     set status = 'approved', payment_id = v_payment, reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_notice;
  return v_payment;
end;
$$;

create or replace function public.reject_transfer_notice(p_notice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notice public.transfer_notices;
  v_reason text := btrim(p_reason);
begin
  select * into v_notice from public.transfer_notices n where n.id = p_notice for update;
  if not found or (select auth.uid()) is null or not private.is_site_admin(private.unit_site_id(v_notice.unit_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'reason_invalid';
  end if;
  if v_notice.status <> 'pending' then
    raise exception 'not_pending';
  end if;
  update public.transfer_notices
     set status = 'rejected', reject_reason = v_reason, reviewed_by = (select auth.uid()), reviewed_at = now()
   where id = p_notice;
end;
$$;

-- An admin records money that arrived outside the portal: cash, the office card machine, a bank transfer.
-- p_payer: a current resident of the unit (they can then see the receipt), or null with p_payer_name.
create or replace function public.record_manual_payment(
  p_request_id   uuid,
  p_unit         uuid,
  p_payer        uuid,
  p_payer_name   text,
  p_method       text,
  p_amount_kurus bigint,
  p_paid_on      date,
  p_charge_ids   uuid[],
  p_note         text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_existing public.payments;
  v_payment  uuid;
begin
  if v_uid is null or p_unit is null or not private.is_site_admin(private.unit_site_id(p_unit)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'invalid_request';
  end if;

  select * into v_existing from public.payments p where p.request_id = p_request_id;
  if found then
    if v_existing.created_by is distinct from v_uid then
      raise exception 'request_id_used';
    end if;
    return v_existing.id;
  end if;

  v_payment := private.issue_payment(v_uid, p_unit, p_payer, p_payer_name, p_method, p_amount_kurus, p_paid_on, p_charge_ids, p_note, null, p_request_id);
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Bank accounts (the IBAN cards residents see). Stored in companies.settings.bank_accounts.
-- ---------------------------------------------------------------------------
-- Readable by the residents and the admins of the company. Written only by save_bank_accounts.
create or replace function public.get_bank_accounts()
returns table (company_id uuid, bank text, holder text, iban text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, a.item ->> 'bank', a.item ->> 'holder', a.item ->> 'iban'
    from public.companies c
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(c.settings -> 'bank_accounts') = 'array' then c.settings -> 'bank_accounts' else '[]'::jsonb end
    ) with ordinality as a (item, pos)
   where (select auth.uid()) is not null
     and (private.is_company_resident(c.id) or private.is_company_admin(c.id))
   order by c.id, a.pos;
$$;

-- Saves the WHOLE list (at most 5). Every IBAN is checked and stored without spaces, in capitals.
create or replace function public.save_bank_accounts(p_company uuid, p_accounts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_ibans text[] := '{}';
  v_iban  text;
begin
  if (select auth.uid()) is null or p_company is null or not private.is_company_admin(p_company) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_accounts is null or jsonb_typeof(p_accounts) <> 'array' or jsonb_array_length(p_accounts) > 5 then
    raise exception 'accounts_invalid';
  end if;

  for v_item in select e from jsonb_array_elements(p_accounts) as e loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'bank') is distinct from 'string'
       or jsonb_typeof(v_item -> 'holder') is distinct from 'string'
       or jsonb_typeof(v_item -> 'iban') is distinct from 'string'
       or char_length(btrim(v_item ->> 'bank')) not between 2 and 60
       or char_length(btrim(v_item ->> 'holder')) not between 2 and 100 then
      raise exception 'accounts_invalid';
    end if;
    v_iban := upper(regexp_replace(v_item ->> 'iban', '\s', '', 'g'));
    if not private.valid_tr_iban(v_iban) then
      raise exception 'iban_invalid';
    end if;
    if v_iban = any (v_ibans) then
      raise exception 'accounts_invalid';
    end if;
    v_ibans := v_ibans || v_iban;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('bank', btrim(v_item ->> 'bank'), 'holder', btrim(v_item ->> 'holder'), 'iban', v_iban));
  end loop;

  update public.companies
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{bank_accounts}', v_clean)
   where id = p_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. get_receipt: now also returns the note
-- ---------------------------------------------------------------------------
drop function public.get_receipt(uuid);
create function public.get_receipt(p_payment uuid)
returns table (
  receipt_no text, paid_at timestamptz, status text, void_reason text, method text, provider text, installments integer,
  amount_kurus bigint, fee_kurus bigint, total_kurus bigint, payer_name text, unit_label text,
  site_name text, company_name text, lines jsonb, note text
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
           ), '[]'::jsonb),
           v_pay.note
      from public.units u
      join public.blocks b on b.id = u.block_id
      join public.sites s on s.id = b.site_id
      join public.companies co on co.id = s.company_id
     where u.id = v_pay.unit_id;
end;
$$;

revoke all on function public.submit_transfer_notice(uuid, uuid, bigint, date, text, text, text) from public, anon;
revoke all on function public.cancel_transfer_notice(uuid) from public, anon;
revoke all on function public.preview_allocation(uuid, uuid, bigint, uuid[]) from public, anon;
revoke all on function public.approve_transfer_notice(uuid, uuid[]) from public, anon;
revoke all on function public.reject_transfer_notice(uuid, text) from public, anon;
revoke all on function public.record_manual_payment(uuid, uuid, uuid, text, text, bigint, date, uuid[], text) from public, anon;
revoke all on function public.get_bank_accounts() from public, anon;
revoke all on function public.save_bank_accounts(uuid, jsonb) from public, anon;
revoke all on function public.get_receipt(uuid) from public, anon;
grant execute on function public.submit_transfer_notice(uuid, uuid, bigint, date, text, text, text) to authenticated;
grant execute on function public.cancel_transfer_notice(uuid) to authenticated;
grant execute on function public.preview_allocation(uuid, uuid, bigint, uuid[]) to authenticated;
grant execute on function public.approve_transfer_notice(uuid, uuid[]) to authenticated;
grant execute on function public.reject_transfer_notice(uuid, text) to authenticated;
grant execute on function public.record_manual_payment(uuid, uuid, uuid, text, text, bigint, date, uuid[], text) to authenticated;
grant execute on function public.get_bank_accounts() to authenticated;
grant execute on function public.save_bank_accounts(uuid, jsonb) to authenticated;
grant execute on function public.get_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. companies.settings is not writable from the browser any more
-- ---------------------------------------------------------------------------
-- Since 0001 an admin could update the whole settings column directly. It holds the PAYMENT SAFETY SWITCH
-- (payment_mode) and, now, the bank accounts. The app never wrote it directly; settings are changed by checked
-- functions (save_bank_accounts here, the Ayarlar screen of slice 10 later). The other company columns stay as they were.
revoke update (settings) on public.companies from authenticated;
