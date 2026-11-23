-- 0008_requests.sql
-- Slice 9: requests / faults (Talepler). Plan sections 7, 8, 9, 13.
--
-- What is added
--   1. requests          one request of a resident for a unit (category, title, text, priority, place, status, rating)
--   2. request_events    the TIMELINE: opened, every status change, the rating. Written by a trigger, so it can never
--                        differ from the real status.
--   3. request_comments  the thread. Admins can write INTERNAL notes: residents never read them (see below).
--   4. request_photos    up to 3 photos per request, in the private bucket "talep-fotolari"
--   5. seven checked functions: create / update / cancel (resident), set status / set triage (admin),
--      add comment (both), rate (resident)
--   6. notification triggers: new request -> the admins, status change and answer -> the person the request belongs to
--
-- Who sees a request: the person it belongs to (requester_id) while they still live in the unit, and the admins of the
-- site. Other people of the same unit do NOT see it ("Taleplerim" = my requests). Nobody writes the tables directly.
--
-- Internal notes (is_internal) stay inside the admin side in four places, each one is tested:
--   a) the comments policy hides them from the requester, b) add_request_comment refuses an internal note from a
--   resident, c) an internal note never creates a notification, d) nothing else (no counter, no preview) reads them.
--
-- DEFERRED (named in the README): assignee (needs the Görevli role of Faz 2), merge of duplicates, request numbers,
-- adding photos after the request exists, comments with photos, e-mail / SMS, SLA reports (the badge is computed in the
-- browser), cleanup of photos of cancelled requests, editing the category list from the settings screen (slice 10).
--
-- Same safety rules as before: explicit grants (column by column), search_path = '' on security-definer functions,
-- public functions check the caller inside, errors are short machine codes, helpers live in the private schema.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.requests (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete restrict,
  unit_id       uuid not null references public.units (id) on delete restrict,
  -- The person the request belongs to (reads it, is told about it, rates it). Normally the one who typed it.
  requester_id  uuid references public.profiles (id) on delete set null,
  -- Who typed it. An admin can open a request for a resident (a phone call): then created_by is the admin.
  created_by    uuid references public.profiles (id) on delete set null,
  category      text not null check (category in ('elektrik', 'su_tesisati', 'asansor', 'isinma', 'temizlik', 'guvenlik', 'otopark', 'bahce', 'oneri', 'sikayet', 'diger')),
  title         text not null check (char_length(btrim(title)) between 3 and 120),
  -- Plain text only. The screens print it as text; nothing is ever interpreted as HTML.
  description   text not null check (char_length(btrim(description)) between 3 and 2000),
  priority      text not null default 'normal' check (priority in ('dusuk', 'normal', 'yuksek', 'acil')),
  location      text check (location is null or char_length(btrim(location)) between 1 and 120),
  status        text not null default 'acik' check (status in ('acik', 'inceleniyor', 'islemde', 'cozuldu', 'kapandi', 'iptal')),
  rating        smallint check (rating is null or rating between 1 and 5),
  rated_at      timestamptz,
  resolved_at   timestamptz,
  -- A random id from the browser: a double tap returns the same request. Never readable.
  token         uuid not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((rating is null) = (rated_at is null)),
  check (rating is null or status in ('cozuldu', 'kapandi'))
);
create index requests_site_idx on public.requests (site_id, status, created_at desc);
create index requests_requester_idx on public.requests (requester_id, created_at desc);
create index requests_unit_idx on public.requests (unit_id);

create trigger requests_touch_updated_at before update on public.requests
  for each row execute function private.touch_updated_at();

create table public.request_events (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.requests (id) on delete cascade,
  kind         text not null check (kind in ('created', 'status', 'rated')),
  from_status  text,
  to_status    text,
  rating       smallint check (rating is null or rating between 1 and 5),
  actor_id     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_id, created_at);

create table public.request_comments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.requests (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  by_admin     boolean not null,
  -- An internal note: only admins read it. Only admins can write one.
  is_internal  boolean not null default false,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  check (not is_internal or by_admin)
);
create index request_comments_request_idx on public.request_comments (request_id, created_at);

create table public.request_photos (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests (id) on delete cascade,
  -- Path in the private bucket talep-fotolari: <unit id>/<uuid>.<jpg|png|webp>. One file belongs to one request.
  file_path   text not null unique,
  -- 1, 2 or 3: at most three photos, enforced here and not only in the screen.
  position    smallint not null check (position between 1 and 3),
  created_at  timestamptz not null default now(),
  unique (request_id, position)
);

-- ---------------------------------------------------------------------------
-- 2. Helpers (private schema)
-- ---------------------------------------------------------------------------
-- How may the logged-in person see this request? 'admin' | 'requester' | null (not at all).
-- The requester must still live in the unit today (a person who moved out sees nothing any more).
create or replace function private.request_access(p_request uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_site_admin(r.site_id) then 'admin'
    when r.requester_id = (select auth.uid())
         and exists (select 1 from private.my_units() m where m.unit_id = r.unit_id) then 'requester'
  end
    from public.requests r
   where r.id = p_request;
$$;

-- May the logged-in person read this photo file? Only when the file is attached to a request they may see.
create or replace function private.can_read_request_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.request_photos ph
     where ph.file_path = p_name
       and private.request_access(ph.request_id) is not null
  );
$$;

create or replace function private.request_status_label(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'acik' then 'Açık'
    when 'inceleniyor' then 'İnceleniyor'
    when 'islemde' then 'İşlemde'
    when 'cozuldu' then 'Çözüldü'
    when 'kapandi' then 'Kapandı'
    when 'iptal' then 'İptal edildi'
    else p_status
  end;
$$;

-- "A Blok · 3" for notification texts.
create or replace function private.unit_label(p_unit uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.name || ' · ' || u.door_no from public.units u join public.blocks b on b.id = u.block_id where u.id = p_unit;
$$;

-- ---------------------------------------------------------------------------
-- 3. Row security and grants. Nobody writes these tables from a browser.
-- ---------------------------------------------------------------------------
alter table public.requests         enable row level security;
alter table public.request_events   enable row level security;
alter table public.request_comments enable row level security;
alter table public.request_photos   enable row level security;

revoke all on public.requests, public.request_events, public.request_comments, public.request_photos from anon, authenticated;
-- "token" (the double-tap id) is not readable.
grant select (id, site_id, unit_id, requester_id, created_by, category, title, description, priority, location, status, rating, rated_at, resolved_at, created_at, updated_at)
  on public.requests to authenticated;
grant select (id, request_id, kind, from_status, to_status, rating, actor_id, created_at) on public.request_events to authenticated;
grant select (id, request_id, author_id, by_admin, is_internal, body, created_at) on public.request_comments to authenticated;
grant select (id, request_id, file_path, position, created_at) on public.request_photos to authenticated;

-- One read policy per table (two policies on the same table would be slower: the advisor warns about it).
create policy "requests: read" on public.requests for select to authenticated
  using (
    private.is_site_admin(site_id)
    or (requester_id = (select auth.uid()) and unit_id in (select m.unit_id from private.my_units() m))
  );
create policy "request_events: read" on public.request_events for select to authenticated
  using (private.request_access(request_id) is not null);
-- The line that keeps internal notes secret: the requester reads only comments that are NOT internal.
create policy "request_comments: read" on public.request_comments for select to authenticated
  using (
    private.request_access(request_id) = 'admin'
    or (private.request_access(request_id) = 'requester' and not is_internal)
  );
create policy "request_photos: read" on public.request_photos for select to authenticated
  using (private.request_access(request_id) is not null);

-- Policies call these as the logged-in user, so "authenticated" needs EXECUTE (the private schema is closed by default).
revoke all on function private.request_access(uuid) from public, anon;
revoke all on function private.can_read_request_photo(text) from public, anon;
revoke all on function private.request_status_label(text) from public, anon, authenticated;
revoke all on function private.unit_label(uuid) from public, anon, authenticated;
grant execute on function private.request_access(uuid) to authenticated;
grant execute on function private.can_read_request_photo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The photo bucket (private) and its policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('talep-fotolari', 'talep-fotolari', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Upload: into the folder of a unit the person lives in today, or (admins, for a request opened by phone) into a unit of
-- a site they administer. The name must have the exact shape <unit uuid>/<uuid>.<jpg|png|webp>. Folder and unit are
-- compared as TEXT (a ::uuid cast of a strange folder name would raise an error inside a policy).
create policy "talep-fotolari: upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'talep-fotolari'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
    and (
      (storage.foldername(name))[1] in (select m.unit_id::text from private.my_units() m)
      or exists (
        select 1 from public.units u
         where u.id::text = (storage.foldername(name))[1]
           and private.is_site_admin(private.unit_site_id(u.id))
      )
    )
  );

-- Read: the person who uploaded it (to see the preview before sending), and everybody who may read the request the photo
-- belongs to (so the resident sees a photo that an admin uploaded for them). Nobody can update or delete from a browser.
create policy "talep-fotolari: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'talep-fotolari'
    and (owner_id = (select auth.uid())::text or private.can_read_request_photo(name))
  );

-- ---------------------------------------------------------------------------
-- 5. Functions: resident and admin
-- ---------------------------------------------------------------------------
-- Open a request. A resident opens it for themself. An admin opens it for a resident of a unit of the site (p_requester).
-- The photos were uploaded to the bucket first: each path must exist there, uploaded by the caller, in the unit's folder.
create or replace function public.create_request(
  p_token       uuid,
  p_unit        uuid,
  p_category    text,
  p_title       text,
  p_description text,
  p_priority    text,
  p_location    text,
  p_photos      text[],
  p_requester   uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_site      uuid;
  v_requester uuid;
  v_existing  public.requests;
  v_title     text := btrim(p_title);
  v_desc      text := btrim(p_description);
  v_loc       text := nullif(btrim(p_location), '');
  v_photos    text[] := coalesce(p_photos, '{}');
  v_id        uuid;
  i           integer;
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_token is null or p_unit is null then
    raise exception 'invalid_request';
  end if;
  v_site := private.unit_site_id(p_unit);
  if v_site is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if private.is_site_admin(v_site) then
    -- On behalf of a resident: the person must live in this unit today.
    if p_requester is null or not private.is_current_resident(p_requester, p_unit) then
      raise exception 'requester_invalid';
    end if;
    v_requester := p_requester;
  else
    if not exists (select 1 from private.my_units() m where m.unit_id = p_unit) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if p_requester is not null and p_requester <> v_uid then
      raise exception 'requester_invalid';
    end if;
    v_requester := v_uid;
  end if;

  -- A second call with the same token returns the first request (double tap, retry).
  select * into v_existing from public.requests r where r.token = p_token;
  if found then
    if v_existing.created_by is distinct from v_uid then
      raise exception 'token_used';
    end if;
    return v_existing.id;
  end if;

  if p_category is null or p_category not in ('elektrik', 'su_tesisati', 'asansor', 'isinma', 'temizlik', 'guvenlik', 'otopark', 'bahce', 'oneri', 'sikayet', 'diger') then
    raise exception 'category_invalid';
  end if;
  if v_title is null or char_length(v_title) not between 3 and 120 then
    raise exception 'title_invalid';
  end if;
  if v_desc is null or char_length(v_desc) not between 3 and 2000 then
    raise exception 'description_invalid';
  end if;
  if p_priority is null or p_priority not in ('dusuk', 'normal', 'yuksek', 'acil') then
    raise exception 'priority_invalid';
  end if;
  if v_loc is not null and char_length(v_loc) > 120 then
    raise exception 'location_invalid';
  end if;
  if coalesce(array_length(v_photos, 1), 0) > 3 then
    raise exception 'too_many_photos';
  end if;
  for i in 1 .. coalesce(array_length(v_photos, 1), 0) loop
    if v_photos[i] is null
       or v_photos[i] !~ ('^' || p_unit::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
       or not exists (
         select 1 from storage.objects o
          where o.bucket_id = 'talep-fotolari' and o.name = v_photos[i] and o.owner_id = v_uid::text
       ) then
      raise exception 'photo_invalid';
    end if;
    if exists (select 1 from unnest(v_photos) with ordinality t(path, n) where t.path = v_photos[i] and t.n <> i)
       or exists (select 1 from public.request_photos ph where ph.file_path = v_photos[i]) then
      raise exception 'photo_used';
    end if;
  end loop;
  -- Not a flood: at most 10 requests of one unit are open at the same time.
  if (select count(*) from public.requests r where r.unit_id = p_unit and r.status in ('acik', 'inceleniyor', 'islemde')) >= 10 then
    raise exception 'too_many_open';
  end if;

  insert into public.requests (site_id, unit_id, requester_id, created_by, category, title, description, priority, location, token)
  values (v_site, p_unit, v_requester, v_uid, p_category, v_title, v_desc, p_priority, v_loc, p_token)
  on conflict (token) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id from public.requests r where r.token = p_token and r.created_by = v_uid;
    if v_id is null then
      raise exception 'token_used';
    end if;
    return v_id;
  end if;

  for i in 1 .. coalesce(array_length(v_photos, 1), 0) loop
    insert into public.request_photos (request_id, file_path, position) values (v_id, v_photos[i], i);
  end loop;
  return v_id;
end;
$$;

-- The person the request belongs to corrects it. Only while it is still "Açık" (nobody has started yet).
create or replace function public.update_request(
  p_id          uuid,
  p_category    text,
  p_title       text,
  p_description text,
  p_priority    text,
  p_location    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_req   public.requests;
  v_title text := btrim(p_title);
  v_desc  text := btrim(p_description);
  v_loc   text := nullif(btrim(p_location), '');
begin
  select * into v_req from public.requests r where r.id = p_id for update;
  if not found or v_uid is null or v_req.requester_id is distinct from v_uid or not private.is_current_resident(v_uid, v_req.unit_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'acik' then
    raise exception 'not_open';
  end if;
  if p_category is null or p_category not in ('elektrik', 'su_tesisati', 'asansor', 'isinma', 'temizlik', 'guvenlik', 'otopark', 'bahce', 'oneri', 'sikayet', 'diger') then
    raise exception 'category_invalid';
  end if;
  if v_title is null or char_length(v_title) not between 3 and 120 then
    raise exception 'title_invalid';
  end if;
  if v_desc is null or char_length(v_desc) not between 3 and 2000 then
    raise exception 'description_invalid';
  end if;
  if p_priority is null or p_priority not in ('dusuk', 'normal', 'yuksek', 'acil') then
    raise exception 'priority_invalid';
  end if;
  if v_loc is not null and char_length(v_loc) > 120 then
    raise exception 'location_invalid';
  end if;
  update public.requests
     set category = p_category, title = v_title, description = v_desc, priority = p_priority, location = v_loc
   where id = p_id;
end;
$$;

-- The person the request belongs to takes it back. Only while it is still "Açık".
create or replace function public.cancel_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests;
begin
  select * into v_req from public.requests r where r.id = p_id for update;
  if not found or v_uid is null or v_req.requester_id is distinct from v_uid or not private.is_current_resident(v_uid, v_req.unit_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'acik' then
    raise exception 'not_open';
  end if;
  update public.requests set status = 'iptal' where id = p_id;
end;
$$;

-- Admin: move a request to another step. Any step to any other step except the cancelled ones ("reopen" = from
-- Çözüldü or Kapandı back to an open step: the time of the solution and the rating belong to the old solution and go).
create or replace function public.set_request_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests;
  v_done boolean := p_status in ('cozuldu', 'kapandi');
begin
  select * into v_req from public.requests r where r.id = p_id for update;
  if not found or v_uid is null or not private.is_site_admin(v_req.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('acik', 'inceleniyor', 'islemde', 'cozuldu', 'kapandi') then
    raise exception 'status_invalid';
  end if;
  if v_req.status = 'iptal' then
    raise exception 'request_cancelled';
  end if;
  if v_req.status = p_status then
    raise exception 'status_same';
  end if;
  update public.requests
     set status = p_status,
         resolved_at = case when v_done then coalesce(resolved_at, now()) else null end,
         rating = case when v_done then rating else null end,
         rated_at = case when v_done then rated_at else null end
   where id = p_id;
end;
$$;

-- Admin: category and priority (the sorting of the requests). Not shown in the timeline.
create or replace function public.set_request_triage(p_id uuid, p_category text, p_priority text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests;
begin
  select * into v_req from public.requests r where r.id = p_id for update;
  if not found or v_uid is null or not private.is_site_admin(v_req.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status = 'iptal' then
    raise exception 'request_cancelled';
  end if;
  if p_category is null or p_category not in ('elektrik', 'su_tesisati', 'asansor', 'isinma', 'temizlik', 'guvenlik', 'otopark', 'bahce', 'oneri', 'sikayet', 'diger') then
    raise exception 'category_invalid';
  end if;
  if p_priority is null or p_priority not in ('dusuk', 'normal', 'yuksek', 'acil') then
    raise exception 'priority_invalid';
  end if;
  update public.requests set category = p_category, priority = p_priority where id = p_id;
end;
$$;

-- A comment. The requester writes an ordinary comment (never an internal one: asking for one is refused). An admin
-- writes an ordinary comment or an INTERNAL note (p_internal = true) that only admins read.
create or replace function public.add_request_comment(p_request uuid, p_body text, p_internal boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_req    public.requests;
  v_access text;
  v_body   text := btrim(p_body);
  v_id     uuid;
begin
  select * into v_req from public.requests r where r.id = p_request;
  v_access := case when not found or v_uid is null then null else private.request_access(p_request) end;
  if v_access is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_access = 'requester' and coalesce(p_internal, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'body_invalid';
  end if;
  -- A closed or cancelled request takes no new comment from the resident (an admin can reopen it first).
  if v_access = 'requester' and v_req.status in ('kapandi', 'iptal') then
    raise exception 'request_closed';
  end if;
  insert into public.request_comments (request_id, author_id, by_admin, is_internal, body)
  values (p_request, v_uid, v_access = 'admin', v_access = 'admin' and coalesce(p_internal, false), v_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- The person the request belongs to rates the solution, once, from 1 to 5. Only after Çözüldü (or Kapandı).
create or replace function public.rate_request(p_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests;
begin
  select * into v_req from public.requests r where r.id = p_id for update;
  if not found or v_uid is null or v_req.requester_id is distinct from v_uid or not private.is_current_resident(v_uid, v_req.unit_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status not in ('cozuldu', 'kapandi') then
    raise exception 'not_resolved';
  end if;
  if v_req.rating is not null then
    raise exception 'already_rated';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'rating_invalid';
  end if;
  update public.requests set rating = p_rating, rated_at = now() where id = p_id;
end;
$$;

revoke all on function public.create_request(uuid, uuid, text, text, text, text, text, text[], uuid) from public, anon;
revoke all on function public.update_request(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.cancel_request(uuid) from public, anon;
revoke all on function public.set_request_status(uuid, text) from public, anon;
revoke all on function public.set_request_triage(uuid, text, text) from public, anon;
revoke all on function public.add_request_comment(uuid, text, boolean) from public, anon;
revoke all on function public.rate_request(uuid, integer) from public, anon;
grant execute on function public.create_request(uuid, uuid, text, text, text, text, text, text[], uuid) to authenticated;
grant execute on function public.update_request(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.set_request_status(uuid, text) to authenticated;
grant execute on function public.set_request_triage(uuid, text, text) to authenticated;
grant execute on function public.add_request_comment(uuid, text, boolean) to authenticated;
grant execute on function public.rate_request(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notification kinds
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('charge', 'payment', 'payment_void', 'havale_new', 'havale_approved', 'havale_rejected', 'announcement', 'request_new', 'request_status', 'request_comment'));

-- ---------------------------------------------------------------------------
-- 7. Triggers: the timeline and the notifications. Neither can make the real work fail.
-- ---------------------------------------------------------------------------
-- Keys: one notification per EVENT (the timeline row or the comment), never per request, or the second status change
-- would be swallowed by the unique (profile, key) rule.
create or replace function private.request_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_event uuid;
  v_label text;
  r       record;
begin
  if tg_op = 'INSERT' then
    v_actor := new.created_by;
    insert into public.request_events (request_id, kind, to_status, actor_id) values (new.id, 'created', 'acik', v_actor) returning id into v_event;
    begin
      v_label := coalesce(private.unit_label(new.unit_id), 'Daire');
      -- The admins of the site (not the one who typed it).
      for r in select m.profile_id from public.site_members m where m.site_id = new.site_id and m.role = 'admin' and m.profile_id is distinct from v_actor loop
        perform private.notify(r.profile_id, 'request_new', 'Yeni talep', v_label || ' · ' || new.title, '/yonetim/talepler/' || new.id::text, 'request-new:' || new.id::text || ':' || r.profile_id::text);
      end loop;
      -- An admin opened it by phone: the resident hears about it.
      if new.requester_id is not null and new.requester_id is distinct from v_actor then
        perform private.notify(new.requester_id, 'request_status', 'Sizin için bir talep açıldı', new.title, '/taleplerim/' || new.id::text, 'request-event:' || v_event::text);
      end if;
    exception when others then
      raise warning 'request notifications not written: %', sqlerrm;
    end;
    return null;
  end if;

  v_actor := (select auth.uid());
  if new.status is distinct from old.status then
    insert into public.request_events (request_id, kind, from_status, to_status, actor_id) values (new.id, 'status', old.status, new.status, v_actor) returning id into v_event;
    begin
      -- Somebody handled it: the admins' unread "new request" is no longer true.
      delete from public.notifications n where n.kind = 'request_new' and n.read_at is null and n.link = '/yonetim/talepler/' || new.id::text;
      if new.status = 'iptal' then
        delete from public.notifications n where n.kind = 'request_comment' and n.read_at is null and n.link = '/yonetim/talepler/' || new.id::text;
      end if;
      -- The person it belongs to hears the new step (not when they did it themself: the cancel).
      if new.requester_id is not null and new.requester_id is distinct from v_actor then
        perform private.notify(new.requester_id, 'request_status', 'Talebinizin durumu değişti',
          new.title || ' · ' || private.request_status_label(new.status), '/taleplerim/' || new.id::text, 'request-event:' || v_event::text);
      end if;
    exception when others then
      raise warning 'request notifications not written: %', sqlerrm;
    end;
  end if;
  if old.rating is null and new.rating is not null then
    insert into public.request_events (request_id, kind, rating, actor_id) values (new.id, 'rated', new.rating, v_actor);
  end if;
  return null;
end;
$$;
create trigger requests_changed_ins after insert on public.requests
  for each row execute function private.request_changed();
create trigger requests_changed_upd after update of status, rating on public.requests
  for each row execute function private.request_changed();

-- A new comment: an answer of the admin -> the person it belongs to; a comment of the resident -> the admins.
-- An INTERNAL note notifies nobody (and no text of it is copied anywhere).
create or replace function private.request_comment_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.requests;
  r     record;
begin
  if new.is_internal then
    return null;
  end if;
  begin
    select * into v_req from public.requests q where q.id = new.request_id;
    if new.by_admin then
      if v_req.requester_id is not null and v_req.requester_id is distinct from new.author_id then
        perform private.notify(v_req.requester_id, 'request_comment', 'Talebinize yanıt var', v_req.title || ': ' || left(new.body, 120),
          '/taleplerim/' || v_req.id::text, 'request-comment:' || new.id::text);
      end if;
    else
      for r in select m.profile_id from public.site_members m where m.site_id = v_req.site_id and m.role = 'admin' and m.profile_id is distinct from new.author_id loop
        perform private.notify(r.profile_id, 'request_comment', 'Talebe yeni yorum', coalesce(private.unit_label(v_req.unit_id), 'Daire') || ' · ' || v_req.title || ': ' || left(new.body, 120),
          '/yonetim/talepler/' || v_req.id::text, 'request-comment:' || new.id::text || ':' || r.profile_id::text);
      end loop;
    end if;
  exception when others then
    raise warning 'comment notifications not written: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger request_comments_added after insert on public.request_comments
  for each row execute function private.request_comment_added();

revoke all on function private.request_changed() from public, anon, authenticated;
revoke all on function private.request_comment_added() from public, anon, authenticated;
