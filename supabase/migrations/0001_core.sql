-- 0001_core.sql
-- Core tables: companies, sites, blocks, units, profiles, site_members, unit_residents,
-- quote_requests. Plan sections 5, 9 and 14. Postgres 17 on Supabase.
--
-- Safety rules used in this file:
--  1. Row Level Security (RLS) is ON for every table, in the same migration that creates it.
--  2. Grants are explicit. We never rely on Supabase's default privileges.
--  3. Helper functions live in the schema "private". The Data API only exposes "public",
--     so the browser can never call them directly through /rest/v1/rpc.
--  4. Security-definer functions use `set search_path = ''` and fully qualified names.
--  5. Policies write (select auth.uid()) so Postgres evaluates it once per query, not per row.
--  6. Dates use Istanbul time. current_date would be UTC on Supabase.

-- ---------------------------------------------------------------------------
-- 0. Secure defaults
-- ---------------------------------------------------------------------------
-- New tables, functions and sequences that "postgres" creates in public are NOT reachable by
-- the browser roles until a migration grants access on purpose.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- The management company. Holds the values shown in "Ayarlar".
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  logo_url    text,
  phone       text,
  email       text,
  address     text,
  tax_no      text,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A site (many buildings) or a single apartment building.
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete restrict,
  name        text not null check (char_length(name) between 1 and 200),
  address     text,
  il          text,
  ilce        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index sites_company_id_idx on public.sites (company_id);

-- A, B, C ... A single building has one block.
create table public.blocks (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete restrict,
  name        text not null check (char_length(name) between 1 and 100),
  created_at  timestamptz not null default now(),
  unique (site_id, name)
);

-- A daire (independent section).
create table public.units (
  id           uuid primary key default gen_random_uuid(),
  block_id     uuid not null references public.blocks (id) on delete restrict,
  door_no      text not null check (char_length(door_no) between 1 and 20),
  floor        integer,
  type         text not null default 'konut'
               check (type in ('konut', 'dukkan', 'ofis', 'depo', 'otopark', 'diger')),
  gross_m2     numeric(8, 2) check (gross_m2 is null or gross_m2 > 0),
  -- Arsa payı as a relative weight. Share of a unit = land_share / sum(land_share of all units).
  land_share   numeric(12, 4) check (land_share is null or land_share > 0),
  status       text not null default 'occupied' check (status in ('occupied', 'vacant')),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index units_block_id_idx on public.units (block_id);
-- One active door number per block. Archived units free the number again.
create unique index units_block_door_unique on public.units (block_id, door_no) where archived_at is null;

-- One row per person. The id is the same as auth.users.id.
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text check (full_name is null or char_length(full_name) <= 200),
  phone            text check (phone is null or char_length(phone) <= 30),
  email            text,
  is_active        boolean not null default true,
  kvkk_consent_at  timestamptz,
  notify_prefs     jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Which people manage which sites. Role is text + check (not an enum) so values can be
-- added later with a simple migration. Auditor and staff are modelled but switched off.
create table public.site_members (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  site_id     uuid not null references public.sites (id) on delete cascade,
  role        text not null default 'admin' check (role in ('admin', 'auditor', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, site_id)
);
create index site_members_site_id_idx on public.site_members (site_id);

-- Who lives where, with history. A person can be owner, later tenant, of the same unit.
create table public.unit_residents (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.units (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete restrict,
  relation    text not null check (relation in ('owner', 'tenant')),
  start_date  date not null default ((now() at time zone 'Europe/Istanbul')::date),
  end_date    date,
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index unit_residents_unit_id_idx on public.unit_residents (unit_id);
create index unit_residents_profile_id_idx on public.unit_residents (profile_id);
create unique index unit_residents_active_unique
  on public.unit_residents (unit_id, profile_id, relation) where end_date is null;

-- The public "Teklif Al" form. Visitors can only INSERT. Only admins can read.
create table public.quote_requests (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 120),
  phone          text check (phone is null or char_length(phone) between 7 and 30),
  email          text check (email is null or (char_length(email) <= 200 and email like '%_@_%')),
  building_type  text check (building_type is null or char_length(building_type) <= 50),
  unit_count     integer check (unit_count is null or unit_count between 1 and 100000),
  il             text check (il is null or char_length(il) <= 80),
  ilce           text check (ilce is null or char_length(ilce) <= 80),
  message        text check (message is null or char_length(message) <= 2000),
  status         text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at     timestamptz not null default now(),
  check (phone is not null or email is not null)
);

create trigger companies_touch_updated_at before update on public.companies
  for each row execute function private.touch_updated_at();
create trigger sites_touch_updated_at before update on public.sites
  for each row execute function private.touch_updated_at();
create trigger units_touch_updated_at before update on public.units
  for each row execute function private.touch_updated_at();
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Helper functions (private schema, security definer)
-- ---------------------------------------------------------------------------
-- "security definer" = the function runs with its owner's rights, so it can read the
-- membership tables without being blocked by RLS. This also avoids infinite recursion
-- when a policy on a table needs to look at that same table.
-- Deactivated people (profiles.is_active = false) lose all access here.

create or replace function private.is_site_admin(p_site uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_members m
    join public.profiles p on p.id = m.profile_id
    where m.site_id = p_site
      and m.profile_id = (select auth.uid())
      and m.role = 'admin'
      and p.is_active
  );
$$;

-- Admin of at least one site (used for company-wide things such as quote requests).
create or replace function private.is_any_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_members m
    join public.profiles p on p.id = m.profile_id
    where m.profile_id = (select auth.uid())
      and m.role = 'admin'
      and p.is_active
  );
$$;

-- Admin of at least one site that belongs to this company.
create or replace function private.is_company_admin(p_company uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sites s
    join public.site_members m on m.site_id = s.id
    join public.profiles p on p.id = m.profile_id
    where s.company_id = p_company
      and m.profile_id = (select auth.uid())
      and m.role = 'admin'
      and p.is_active
  );
$$;

-- Units the current user lives in TODAY (Istanbul date), with the relation.
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
    and (r.end_date is null or r.end_date >= (now() at time zone 'Europe/Istanbul')::date);
$$;

create or replace function private.block_site_id(p_block uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select b.site_id from public.blocks b where b.id = p_block;
$$;

create or replace function private.unit_site_id(p_unit uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select b.site_id
  from public.units u
  join public.blocks b on b.id = u.block_id
  where u.id = p_unit;
$$;

-- Does the current user live in any unit of this site (today)?
create or replace function private.is_site_resident(p_site uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.my_units() mu
    join public.units u on u.id = mu.unit_id
    join public.blocks b on b.id = u.block_id
    where b.site_id = p_site
  );
$$;

-- Can the current user (as admin) manage this person? True when the person lives in, or
-- administers, a site that the current user administers. Past residents count too.
create or replace function private.can_manage_profile(p_profile uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.unit_residents r
      join public.units u on u.id = r.unit_id
      join public.blocks b on b.id = u.block_id
      where r.profile_id = p_profile
        and private.is_site_admin(b.site_id)
    )
    or exists (
      select 1
      from public.site_members m
      where m.profile_id = p_profile
        and private.is_site_admin(m.site_id)
    );
$$;

-- Runs when a user is created in auth.users (invite, dashboard "Add user").
-- It must NEVER fail: a failing trigger would block the invite. So: truncate long names,
-- and ignore duplicates.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 200)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- A person who creates a site becomes its admin (multi-site: an admin can add another site).
-- Inserts made without a logged-in user (seed files, SQL editor) are left alone.
create or replace function private.add_creator_as_site_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    insert into public.site_members (profile_id, site_id, role)
    values ((select auth.uid()), new.id, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger sites_add_creator_as_admin
  after insert on public.sites
  for each row execute function private.add_creator_as_site_admin();

-- Function permissions: nobody by default, then only what is needed.
-- (Trigger functions are not called by users, so they get no grant at all.)
revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.add_creator_as_site_admin() from public, anon, authenticated;

revoke all on function private.is_site_admin(uuid) from public, anon;
revoke all on function private.is_any_admin() from public, anon;
revoke all on function private.is_company_admin(uuid) from public, anon;
revoke all on function private.my_units() from public, anon;
revoke all on function private.block_site_id(uuid) from public, anon;
revoke all on function private.unit_site_id(uuid) from public, anon;
revoke all on function private.is_site_resident(uuid) from public, anon;
revoke all on function private.can_manage_profile(uuid) from public, anon;

-- Policies call these helpers as the logged-in user, so "authenticated" needs EXECUTE.
grant execute on function private.is_site_admin(uuid) to authenticated;
grant execute on function private.is_any_admin() to authenticated;
grant execute on function private.is_company_admin(uuid) to authenticated;
grant execute on function private.my_units() to authenticated;
grant execute on function private.block_site_id(uuid) to authenticated;
grant execute on function private.unit_site_id(uuid) to authenticated;
grant execute on function private.is_site_resident(uuid) to authenticated;
grant execute on function private.can_manage_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security + grants
-- ---------------------------------------------------------------------------
-- Two layers protect a table:
--   GRANT  = which columns and commands a role may even try.
--   POLICY = which rows the role may touch.
-- RLS cannot limit columns, so column grants do that (for example residents can never
-- change profiles.is_active, and nobody can move a block to another site).

alter table public.companies       enable row level security;
alter table public.sites           enable row level security;
alter table public.blocks          enable row level security;
alter table public.units           enable row level security;
alter table public.profiles        enable row level security;
alter table public.site_members    enable row level security;
alter table public.unit_residents  enable row level security;
alter table public.quote_requests  enable row level security;

revoke all on public.companies, public.sites, public.blocks, public.units, public.profiles,
              public.site_members, public.unit_residents, public.quote_requests
  from anon, authenticated;

-- companies: only admins of the company's sites. No insert or delete from the browser
-- (the first company is created by hand in Supabase).
grant select on public.companies to authenticated;
grant update (name, logo_url, phone, email, address, tax_no, settings) on public.companies to authenticated;
create policy "companies: admin read" on public.companies for select to authenticated
  using (private.is_company_admin(id));
create policy "companies: admin update" on public.companies for update to authenticated
  using (private.is_company_admin(id))
  with check (private.is_company_admin(id));

-- sites: admins see and edit; residents of the site can read its name.
-- Admins can also READ every site of their own company. This is needed because
-- `insert ... returning` checks the read rule BEFORE the "creator becomes admin" trigger runs.
-- Editing and deleting still need admin rights on that exact site.
grant select, delete on public.sites to authenticated;
grant insert (company_id, name, address, il, ilce) on public.sites to authenticated;
grant update (name, address, il, ilce) on public.sites to authenticated;
create policy "sites: admin or resident read" on public.sites for select to authenticated
  using (
    private.is_site_admin(id)
    or private.is_company_admin(company_id)
    or private.is_site_resident(id)
  );
create policy "sites: admin creates in own company" on public.sites for insert to authenticated
  with check (private.is_company_admin(company_id));
create policy "sites: admin update" on public.sites for update to authenticated
  using (private.is_site_admin(id))
  with check (private.is_site_admin(id));
create policy "sites: admin delete" on public.sites for delete to authenticated
  using (private.is_site_admin(id));

-- blocks
grant select, delete on public.blocks to authenticated;
grant insert (site_id, name) on public.blocks to authenticated;
grant update (name) on public.blocks to authenticated;
create policy "blocks: admin or resident read" on public.blocks for select to authenticated
  using (private.is_site_admin(site_id) or private.is_site_resident(site_id));
create policy "blocks: admin insert" on public.blocks for insert to authenticated
  with check (private.is_site_admin(site_id));
create policy "blocks: admin update" on public.blocks for update to authenticated
  using (private.is_site_admin(site_id))
  with check (private.is_site_admin(site_id));
create policy "blocks: admin delete" on public.blocks for delete to authenticated
  using (private.is_site_admin(site_id));

-- units: admins of the site; residents see only the units they live in.
grant select, delete on public.units to authenticated;
grant insert (block_id, door_no, floor, type, gross_m2, land_share, status) on public.units to authenticated;
grant update (block_id, door_no, floor, type, gross_m2, land_share, status, archived_at) on public.units to authenticated;
create policy "units: admin or own read" on public.units for select to authenticated
  using (
    private.is_site_admin(private.block_site_id(block_id))
    or id in (select mu.unit_id from private.my_units() mu)
  );
create policy "units: admin insert" on public.units for insert to authenticated
  with check (private.is_site_admin(private.block_site_id(block_id)));
create policy "units: admin update" on public.units for update to authenticated
  using (private.is_site_admin(private.block_site_id(block_id)))
  with check (private.is_site_admin(private.block_site_id(block_id)));
create policy "units: admin delete" on public.units for delete to authenticated
  using (private.is_site_admin(private.block_site_id(block_id)));

-- profiles: see yourself, and the people your sites manage.
-- Rows are created by the auth.users trigger and removed by cascade: no insert, no delete.
-- Only full_name, phone and notify_prefs can be edited from the browser. is_active and
-- kvkk_consent_at will get their own protected functions in a later migration, because a
-- resident must never be able to switch themselves back on, and an admin must never be able
-- to fake a resident's consent.
grant select on public.profiles to authenticated;
grant update (full_name, phone, notify_prefs) on public.profiles to authenticated;
create policy "profiles: self or managed read" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.can_manage_profile(id));
create policy "profiles: self or managed update" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.can_manage_profile(id))
  with check (id = (select auth.uid()) or private.can_manage_profile(id));

-- site_members: you see your own memberships; admins manage the members of their site.
grant select, delete on public.site_members to authenticated;
grant insert (profile_id, site_id, role) on public.site_members to authenticated;
grant update (role) on public.site_members to authenticated;
create policy "site_members: own or admin read" on public.site_members for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_site_admin(site_id));
create policy "site_members: admin insert" on public.site_members for insert to authenticated
  with check (private.is_site_admin(site_id));
create policy "site_members: admin update" on public.site_members for update to authenticated
  using (private.is_site_admin(site_id))
  with check (private.is_site_admin(site_id));
create policy "site_members: admin delete" on public.site_members for delete to authenticated
  using (private.is_site_admin(site_id));

-- unit_residents: you see your own rows; admins manage rows of units in their site.
grant select, delete on public.unit_residents to authenticated;
grant insert (unit_id, profile_id, relation, start_date, end_date) on public.unit_residents to authenticated;
grant update (relation, start_date, end_date) on public.unit_residents to authenticated;
create policy "unit_residents: own or admin read" on public.unit_residents for select to authenticated
  using (profile_id = (select auth.uid()) or private.is_site_admin(private.unit_site_id(unit_id)));
create policy "unit_residents: admin insert" on public.unit_residents for insert to authenticated
  with check (private.is_site_admin(private.unit_site_id(unit_id)));
create policy "unit_residents: admin update" on public.unit_residents for update to authenticated
  using (private.is_site_admin(private.unit_site_id(unit_id)))
  with check (private.is_site_admin(private.unit_site_id(unit_id)));
create policy "unit_residents: admin delete" on public.unit_residents for delete to authenticated
  using (private.is_site_admin(private.unit_site_id(unit_id)));

-- quote_requests: anyone (even logged out) may INSERT, nobody but admins may read.
-- anon gets no SELECT grant at all, so even `insert ... returning` fails for visitors:
-- the web form must not chain .select() after .insert().
grant insert (name, phone, email, building_type, unit_count, il, ilce, message)
  on public.quote_requests to anon, authenticated;
grant select, delete on public.quote_requests to authenticated;
grant update (status) on public.quote_requests to authenticated;
create policy "quote_requests: anyone inserts" on public.quote_requests for insert to anon, authenticated
  with check (status = 'new');
create policy "quote_requests: admin read" on public.quote_requests for select to authenticated
  using (private.is_any_admin());
create policy "quote_requests: admin update" on public.quote_requests for update to authenticated
  using (private.is_any_admin())
  with check (private.is_any_admin());
create policy "quote_requests: admin delete" on public.quote_requests for delete to authenticated
  using (private.is_any_admin());
