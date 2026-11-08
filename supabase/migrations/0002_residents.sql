-- 0002_residents.sql
-- Slice 3 (units, residents, invites). Adds:
--   1. profiles.kvkk_consent_version + accept_kvkk()   : a resident records their own KVKK consent
--   2. set_profile_active()                             : an admin deactivates / reactivates a person
--   3. a guard that stops archiving a unit that still has current residents
--   4. a clearer meaning of residents.end_date (see below)
--
-- 4. The end date of a residency now means "moved out on this date": from that day on the person
--    no longer lives there. (0001 counted the end date as the last day. That made "Taşındı" look as
--    if nothing happened until the next day.)
--
-- Same rules as 0001: explicit grants, search_path = '' on security-definer functions.
-- NOTE: public functions are callable through /rest/v1/rpc. So each one below checks WHO is
-- calling inside its own body, and access is granted to "authenticated" only.

-- ---------------------------------------------------------------------------
-- 1. KVKK consent
-- ---------------------------------------------------------------------------
-- Which version of the KVKK notice a person accepted, so it can be proven later.
-- (kvkk_consent_at already exists from 0001.) Residents cannot write these two columns
-- directly (no column grant); they can only call accept_kvkk(), and only for themselves.
alter table public.profiles
  add column kvkk_consent_version text
  check (kvkk_consent_version is null or char_length(kvkk_consent_version) between 1 and 50);

create or replace function public.accept_kvkk(p_version text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_version is null or char_length(btrim(p_version)) not between 1 and 50 then
    raise exception 'invalid version' using errcode = '22023';
  end if;

  update public.profiles
     set kvkk_consent_at = now(),
         kvkk_consent_version = btrim(p_version)
   where id = (select auth.uid())
     and is_active;

  if not found then
    raise exception 'profile not found or not active' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.accept_kvkk(text) from public, anon;
grant execute on function public.accept_kvkk(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deactivate / reactivate a person
-- ---------------------------------------------------------------------------
-- A deactivated person keeps their history but loses all access (every policy checks
-- profiles.is_active). RLS cannot let admins edit one column of someone else's row, and a
-- column grant would also let residents switch themselves back on, so this is a function.
create or replace function public.set_profile_active(p_profile uuid, p_active boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_profile = (select auth.uid()) then
    raise exception 'you cannot change your own status' using errcode = '42501';
  end if;
  if not private.can_manage_profile(p_profile) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.profiles set is_active = p_active where id = p_profile;
end;
$$;

revoke all on function public.set_profile_active(uuid, boolean) from public, anon;
grant execute on function public.set_profile_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Do not archive a unit that still has current residents
-- ---------------------------------------------------------------------------
-- Security definer so the check sees every residency row, whatever RLS would show the caller.
create or replace function private.block_archive_with_residents()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null
     and old.archived_at is null
     and exists (
       select 1
       from public.unit_residents r
       where r.unit_id = new.id
         and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
     )
  then
    raise exception 'unit still has current residents' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger units_block_archive_with_residents
  before update of archived_at on public.units
  for each row execute function private.block_archive_with_residents();

revoke all on function private.block_archive_with_residents() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Moved out on this date" (end_date is the first day the person no longer lives there)
-- ---------------------------------------------------------------------------
-- So marking someone as moved out TODAY takes effect immediately. A residency with
-- start_date = end_date is allowed (a mistake corrected on the same day) and is never current.
create or replace function private.my_units()
returns table (unit_id uuid, relation text)
language sql stable security definer
set search_path = ''
as $$
  select r.unit_id, r.relation
  from public.unit_residents r
  join public.profiles p on p.id = r.profile_id
  where r.profile_id = (select auth.uid())
    and p.is_active
    and r.start_date <= (now() at time zone 'Europe/Istanbul')::date
    and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date);
$$;
