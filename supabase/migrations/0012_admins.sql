-- 0012_admins.sql: managing the admins of a site (slice 13)
--
-- What this changes:
--   1. site_members can no longer be written from the browser. Since 0001 any admin could add, change or delete ANY row of
--      their site through the API, including their own and the last admin's. The rights are taken away; three checked
--      functions replace them.
--   2. list_site_admins(site)         the admins of a site, with the facts the Yöneticiler page shows
--      add_site_admin(site, person)   makes a person an admin of the site
--      remove_site_admin(site, person) takes the admin role away (the person, their login and their residency stay)
--
-- The rules written in the functions (not in the browser):
--   * the caller must be an ACTIVE admin of that site;
--   * you cannot remove yourself. Because only an active admin can call these functions, at least one active admin always stays;
--   * a person can be made admin only if they already belong to THIS company (a resident or a member of one of its sites) or are
--     a brand-new account with no link anywhere yet (that is what the invite function creates). Any other answer is the same
--     "person_not_found", so nobody can probe which accounts exist;
--   * a deactivated person cannot be made admin;
--   * the site row is locked while a change runs, so two admins cannot remove each other at the same moment.
-- Every change is audited by the trigger of 0009 and names the CALLER (auth.uid() is the caller inside these functions).
-- The log row of an admin change also carries the NAME of the person who was added or removed ("person"): the audit row itself only
-- holds the person's id, and a removed person would otherwise be a bare number.
--
-- The invite function (Edge Function) creates the new account with the secret key and then calls add_site_admin WITH THE
-- CALLER'S OWN TOKEN, so the audit log shows who invited, not "nobody".
--
-- Same rules as before: explicit grants, search_path = '' on security-definer functions, short error codes the app turns into Turkish.

-- ---------------------------------------------------------------------------
-- 1. no more direct writes
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.site_members from authenticated;
revoke insert (profile_id, site_id, role) on public.site_members from authenticated;
revoke update (role) on public.site_members from authenticated;

-- ---------------------------------------------------------------------------
-- 2. the admins of a site
-- ---------------------------------------------------------------------------
create or replace function public.list_site_admins(p_site uuid)
returns table (
  profile_id       uuid,
  full_name        text,
  email            text,
  phone            text,
  is_active        boolean,
  kvkk_consent_at  timestamptz,
  since            timestamptz,
  is_self          boolean
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
  return query
  select m.profile_id, p.full_name, p.email, p.phone, p.is_active, p.kvkk_consent_at, m.created_at,
         (m.profile_id = (select auth.uid()))
    from public.site_members m
    join public.profiles p on p.id = m.profile_id
   where m.site_id = p_site
     and m.role = 'admin'
   order by m.created_at, p.full_name nulls last, m.profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. make a person an admin
-- ---------------------------------------------------------------------------
create or replace function public.add_site_admin(p_site uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
begin
  if (select auth.uid()) is null or p_site is null or p_profile is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- one change per site at a time
  select s.company_id into v_company from public.sites s where s.id = p_site for update;

  -- active, and either known to this company or a brand-new account (no residency and no membership anywhere)
  if not exists (select 1 from public.profiles p where p.id = p_profile and p.is_active)
     or not (
       exists (
         select 1
           from public.unit_residents r
           join public.units u on u.id = r.unit_id
           join public.blocks b on b.id = u.block_id
           join public.sites s on s.id = b.site_id
          where r.profile_id = p_profile and s.company_id = v_company)
       or exists (
         select 1
           from public.site_members m
           join public.sites s on s.id = m.site_id
          where m.profile_id = p_profile and s.company_id = v_company)
       or not (
         exists (select 1 from public.unit_residents r where r.profile_id = p_profile)
         or exists (select 1 from public.site_members m where m.profile_id = p_profile))
     ) then
    raise exception 'person_not_found';
  end if;

  if exists (select 1 from public.site_members m where m.site_id = p_site and m.profile_id = p_profile) then
    raise exception 'already_member';
  end if;

  insert into public.site_members (profile_id, site_id, role) values (p_profile, p_site, 'admin');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. take the admin role away
-- ---------------------------------------------------------------------------
create or replace function public.remove_site_admin(p_site uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_site is null or p_profile is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- one change per site at a time (two admins cannot remove each other together)
  perform 1 from public.sites s where s.id = p_site for update;

  if p_profile = (select auth.uid()) then
    raise exception 'cannot_remove_self';
  end if;
  if not exists (select 1 from public.site_members m where m.site_id = p_site and m.profile_id = p_profile and m.role = 'admin') then
    raise exception 'not_admin';
  end if;

  delete from public.site_members m where m.site_id = p_site and m.profile_id = p_profile and m.role = 'admin';
end;
$$;

revoke all on function public.list_site_admins(uuid) from public, anon;
revoke all on function public.add_site_admin(uuid, uuid) from public, anon;
revoke all on function public.remove_site_admin(uuid, uuid) from public, anon;
grant execute on function public.list_site_admins(uuid) to authenticated;
grant execute on function public.add_site_admin(uuid, uuid) to authenticated;
grant execute on function public.remove_site_admin(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. the audit log names the PERSON of an admin change
-- ---------------------------------------------------------------------------
-- A BEFORE INSERT trigger on audit_log (so the generic audit trigger of 0009 stays as it is). It only touches rows of site_members
-- and never raises: if the person cannot be found the row is written without a name.
create or replace function private.audit_log_name_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.table_name = 'site_members'
     and new.row_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select left(coalesce(nullif(btrim(p.full_name), ''), p.email), 200) into v_name
      from public.profiles p
     where p.id = new.row_id::uuid;
    if v_name is not null then
      if new.new_data is not null then new.new_data := new.new_data || jsonb_build_object('person', v_name); end if;
      if new.old_data is not null then new.old_data := new.old_data || jsonb_build_object('person', v_name); end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.audit_log_name_person() from public, anon, authenticated;

create trigger audit_log_name_person before insert on public.audit_log
  for each row execute function private.audit_log_name_person();
