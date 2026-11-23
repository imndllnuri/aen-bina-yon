-- 0007_announcements.sql
-- Slice 8: announcements (Duyurular), notifications (the bell) and read receipts. Plan sections 7, 8, 9, 13.
--
-- What is added
--   1. notifications              the bell feed. ONLY the database writes it (triggers and checked functions).
--   2. announcements              plain text (no HTML), type, pinned, optional start and end time, a target
--   3. announcement_recipients    WHO gets an announcement, fixed when it is published. The same rows decide who may
--                                 read it, who is notified, and who appears in the read report: one source.
--   4. announcement_reads         who opened it
--   5. admin functions            save / publish / unpublish / delete / resend to the unread / list / report / audience preview
--   6. notification triggers      new charge, payment received, payment cancelled, new havale notice (admins),
--                                 havale approved or rejected (the sender)
--
-- Who gets an announcement (the target) = a SCOPE and an AUDIENCE:
--   scope     site (everybody of the site) | blocks | units | persons (people who live there today)
--   audience  all | owners | tenants | debtors   ("debtors": the person has a line they can SEE with money left to pay;
--             the same visibility rule as everywhere, so a tenant is never picked because of an owner-only line)
--   Only current, active residents are picked. Moved-out people and deactivated accounts get nothing.
--
-- Notifications must NEVER make money fail. They are written inside the same transaction as a payment or a charge batch.
-- So every notification write cuts its texts to length, uses fixed internal links, ignores duplicates, and is wrapped so
-- that an error only raises a WARNING (the notification is lost, the payment is not).
-- Notifications must not lie later: a deleted or cancelled charge, an unpublished or deleted announcement, a finished
-- havale notice take their still-unread notifications away. A cancelled payment keeps "payment received" and adds
-- "payment cancelled".
--
-- No backfill: the charges and payments that exist today create no notifications.
--
-- DEFERRED (named in the README): rich text, attachments, templates, e-mail / SMS / push, reminders ("3 days left",
-- "overdue": they need a scheduler), Realtime (the bell polls), notification preferences (Profilim), request events (slice 9).
--
-- Same safety rules as before: explicit grants, search_path = '' on security-definer functions, public functions check the
-- caller inside, errors are short machine codes, helpers live in the private schema.

-- ---------------------------------------------------------------------------
-- 1. Small text helpers (the same look as the app: ₺1.000,00 and "Kasım 2026")
-- ---------------------------------------------------------------------------
create or replace function private.format_try(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_amount < 0 then '-' else '' end || '₺'
         || regexp_replace((k / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
         || ',' || lpad((k % 100)::text, 2, '0')
    from (select round(abs(p_amount) * 100)::bigint as k) s;
$$;

create or replace function private.tr_month(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'])[extract(month from p_date)::integer]
         || ' ' || extract(year from p_date)::integer;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('charge', 'payment', 'payment_void', 'havale_new', 'havale_approved', 'havale_rejected', 'announcement')),
  title       text not null check (char_length(title) between 1 and 120),
  body        text check (body is null or char_length(body) <= 500),
  -- An internal page of the app ("/borclarim"). Never a full address.
  link        text check (link is null or link ~ '^/[A-Za-z0-9/_-]{0,80}$'),
  -- One notification per person and event: the same event twice changes nothing.
  event_key   text not null check (char_length(event_key) between 1 and 200),
  created_at  timestamptz not null default now(),
  -- A notification of an announcement with a start time in the future exists already but shows only from then on.
  visible_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique (profile_id, event_key)
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
create index notifications_unread_idx on public.notifications (profile_id) where read_at is null;

create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null references public.sites (id) on delete restrict,
  title            text not null check (char_length(btrim(title)) between 3 and 120),
  -- Plain text only. The screens print it as text (line breaks kept); nothing is ever interpreted as HTML.
  body             text not null check (char_length(btrim(body)) between 1 and 5000),
  type             text not null default 'genel' check (type in ('genel', 'acil', 'bakim', 'toplanti')),
  pinned           boolean not null default false,
  -- {"scope": "site|blocks|units|persons", "audience": "all|owners|tenants|debtors", "block_ids"|"unit_ids"|"profile_ids": [...]}
  -- Never readable by residents (a persons target lists other people).
  target           jsonb not null,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  -- Visible from this time (null = as soon as it is published), and until expire_at (then it is in the archive).
  publish_at       timestamptz,
  expire_at        timestamptz,
  published_at     timestamptz,
  resend_count     integer not null default 0,
  last_resent_at   timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  check ((status = 'published') = (published_at is not null)),
  check (expire_at is null or publish_at is null or expire_at > publish_at)
);
create index announcements_site_idx on public.announcements (site_id, created_at desc);

create table public.announcement_recipients (
  announcement_id  uuid not null references public.announcements (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  added_at         timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);
create index announcement_recipients_profile_idx on public.announcement_recipients (profile_id);

create table public.announcement_reads (
  announcement_id  uuid not null references public.announcements (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- 3. Helpers (private schema)
-- ---------------------------------------------------------------------------
-- One notification. Cannot fail: texts are cut, a duplicate is ignored, any error becomes a warning.
create or replace function private.notify(
  p_profile    uuid,
  p_kind       text,
  p_title      text,
  p_body       text,
  p_link       text,
  p_key        text,
  p_visible_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (profile_id, kind, title, body, link, event_key, visible_at)
  select p_profile, p_kind, left(coalesce(nullif(btrim(p_title), ''), 'Bildirim'), 120), left(p_body, 500), p_link, left(p_key, 200), coalesce(p_visible_at, now())
   where exists (select 1 from public.profiles pr where pr.id = p_profile and pr.is_active)
  on conflict (profile_id, event_key) do nothing;
exception when others then
  raise warning 'notification not written (%): %', p_key, sqlerrm;
end;
$$;

-- Does the logged-in person receive this announcement AND still live on the site? (A person who moved out can no
-- longer read the building's announcements.) Called by the read policy as the user, so "authenticated" needs EXECUTE.
create or replace function private.can_read_announcement(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.announcement_recipients r
      join public.announcements a on a.id = r.announcement_id
     where r.announcement_id = p_announcement
       and r.profile_id = (select auth.uid())
       and private.is_site_resident(a.site_id)
  );
$$;

-- Checks a target and returns it in its clean form, or raises 'target_invalid'.
create or replace function private.normalize_target(p_site uuid, p_target jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text;
  v_aud   text;
  v_key   text;
  v_ids   uuid[];
  v_found integer;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if p_target is null or jsonb_typeof(p_target) <> 'object' then
    raise exception 'target_invalid';
  end if;
  v_scope := p_target ->> 'scope';
  v_aud := coalesce(p_target ->> 'audience', 'all');
  if v_scope is null or v_scope not in ('site', 'blocks', 'units', 'persons') or v_aud not in ('all', 'owners', 'tenants', 'debtors') then
    raise exception 'target_invalid';
  end if;
  if v_scope = 'persons' and v_aud <> 'all' then
    raise exception 'target_invalid';
  end if;
  if v_scope = 'site' then
    return jsonb_build_object('scope', 'site', 'audience', v_aud);
  end if;

  v_key := case v_scope when 'blocks' then 'block_ids' when 'units' then 'unit_ids' else 'profile_ids' end;
  begin
    select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_target -> v_key) as x;
  exception when others then
    raise exception 'target_invalid';
  end;
  if v_ids is null or cardinality(v_ids) not between 1 and 200 then
    raise exception 'target_invalid';
  end if;

  if v_scope = 'blocks' then
    select count(*) into v_found from public.blocks b where b.id = any (v_ids) and b.site_id = p_site;
  elsif v_scope = 'units' then
    select count(*) into v_found
      from public.units u join public.blocks b on b.id = u.block_id
     where u.id = any (v_ids) and b.site_id = p_site and u.archived_at is null;
  else
    select count(distinct r.profile_id) into v_found
      from public.unit_residents r
      join public.units u on u.id = r.unit_id
      join public.blocks b on b.id = u.block_id
     where r.profile_id = any (v_ids) and b.site_id = p_site and u.archived_at is null
       and r.start_date <= v_today and (r.end_date is null or r.end_date > v_today);
  end if;
  if v_found <> cardinality(v_ids) then
    raise exception 'target_invalid';
  end if;
  return jsonb_build_object('scope', v_scope, 'audience', v_aud, v_key, to_jsonb(v_ids));
end;
$$;

-- THE resolver: who is meant by a (clean) target. One row per person and unit. Used by the preview AND by publish.
create or replace function private.audience(p_site uuid, p_target jsonb)
returns table (profile_id uuid, unit_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.profile_id, r.unit_id
    from public.unit_residents r
    join public.profiles pr on pr.id = r.profile_id and pr.is_active
    join public.units u on u.id = r.unit_id and u.archived_at is null
    join public.blocks b on b.id = u.block_id
   where b.site_id = p_site
     and r.start_date <= (now() at time zone 'Europe/Istanbul')::date
     and (r.end_date is null or r.end_date > (now() at time zone 'Europe/Istanbul')::date)
     and (
          p_target ->> 'scope' = 'site'
       or (p_target ->> 'scope' = 'blocks'  and u.block_id::text in (select jsonb_array_elements_text(p_target -> 'block_ids')))
       or (p_target ->> 'scope' = 'units'   and u.id::text in (select jsonb_array_elements_text(p_target -> 'unit_ids')))
       or (p_target ->> 'scope' = 'persons' and r.profile_id::text in (select jsonb_array_elements_text(p_target -> 'profile_ids')))
     )
     and (
          p_target ->> 'audience' = 'all'
       or (p_target ->> 'audience' = 'owners'  and r.relation = 'owner')
       or (p_target ->> 'audience' = 'tenants' and r.relation = 'tenant')
       or (p_target ->> 'audience' = 'debtors' and exists (
             select 1 from public.charges c
              where c.unit_id = r.unit_id and c.voided_at is null
                and c.amount - private.charge_paid(c.id) > 0
                and private.profile_sees_charge(r.profile_id, c.unit_id, c.tenant_visible, c.due_date)))
     );
$$;

revoke all on function private.format_try(numeric) from public, anon, authenticated;
revoke all on function private.tr_month(date) from public, anon, authenticated;
revoke all on function private.notify(uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.normalize_target(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.audience(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.can_read_announcement(uuid) from public, anon;
grant execute on function private.can_read_announcement(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security + grants
-- ---------------------------------------------------------------------------
alter table public.notifications            enable row level security;
alter table public.announcements            enable row level security;
alter table public.announcement_recipients  enable row level security;
alter table public.announcement_reads       enable row level security;

revoke all on public.notifications, public.announcements, public.announcement_recipients, public.announcement_reads from anon, authenticated;

-- The bell: a person reads, marks read and deletes THEIR OWN notifications that are due. Nobody inserts from the browser.
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "notifications: own read" on public.notifications for select to authenticated
  using (profile_id = (select auth.uid()) and visible_at <= now());
create policy "notifications: own update" on public.notifications for update to authenticated
  using (profile_id = (select auth.uid()) and visible_at <= now())
  with check (profile_id = (select auth.uid()));
create policy "notifications: own delete" on public.notifications for delete to authenticated
  using (profile_id = (select auth.uid()) and visible_at <= now());

-- Announcements: a resident reads only what was sent to them, once it is published and started. Only the columns a resident
-- needs (not the target, not the counters). Admins use list_announcements() and the other functions below.
grant select (id, title, body, type, pinned, publish_at, expire_at, published_at) on public.announcements to authenticated;
create policy "announcements: recipient read" on public.announcements for select to authenticated
  using (status = 'published' and deleted_at is null and (publish_at is null or publish_at <= now()) and private.can_read_announcement(id));

-- A person knows which announcements they opened (for the unread dot). Inserting goes through mark_announcement_read().
grant select on public.announcement_reads to authenticated;
create policy "announcement_reads: own read" on public.announcement_reads for select to authenticated
  using (profile_id = (select auth.uid()));
-- announcement_recipients: no grant and no policy at all (only the functions below touch it).

-- ---------------------------------------------------------------------------
-- 5. Admin functions
-- ---------------------------------------------------------------------------
-- How many people (and units) would receive this? Same resolver as publish.
create or replace function public.preview_announcement_audience(p_site uuid, p_target jsonb)
returns table (recipients integer, units integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target jsonb;
begin
  if (select auth.uid()) is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_target := private.normalize_target(p_site, p_target);
  return query
    select count(distinct a.profile_id)::integer, count(distinct a.unit_id)::integer from private.audience(p_site, v_target) a;
end;
$$;

-- A draft, or the changes of a draft. After publishing, only title, text, type, pinned and the end time can change.
create or replace function public.save_announcement(
  p_id         uuid,
  p_site       uuid,
  p_title      text,
  p_body       text,
  p_type       text,
  p_pinned     boolean,
  p_target     jsonb,
  p_publish_at timestamptz,
  p_expire_at  timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_title  text := btrim(p_title);
  v_body   text := btrim(p_body);
  v_target jsonb;
  v_old    public.announcements;
  v_id     uuid;
begin
  if v_uid is null or p_site is null or not private.is_site_admin(p_site) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) not between 3 and 120 then
    raise exception 'title_invalid';
  end if;
  if v_body is null or char_length(v_body) not between 1 and 5000 then
    raise exception 'body_invalid';
  end if;
  if p_type is null or p_type not in ('genel', 'acil', 'bakim', 'toplanti') then
    raise exception 'type_invalid';
  end if;
  if p_id is not null then
    select * into v_old from public.announcements a where a.id = p_id and a.site_id = p_site and a.deleted_at is null for update;
    if not found then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  if p_publish_at is not null and p_publish_at > now() + interval '1 year' then
    raise exception 'date_invalid';
  end if;
  -- An end time in the past is refused when it is NEW. An unchanged one stays valid: otherwise a typo in an announcement that
  -- has already expired (or a draft whose end time has passed meanwhile) could never be corrected. Compared to the minute,
  -- because the form works in minutes.
  if p_expire_at is not null and (
       (p_expire_at <= now() and case when p_id is null then true else date_trunc('minute', p_expire_at) is distinct from date_trunc('minute', v_old.expire_at) end)
       or (p_publish_at is not null and p_expire_at <= p_publish_at)) then
    raise exception 'date_invalid';
  end if;
  v_target := private.normalize_target(p_site, p_target);

  if p_id is null then
    insert into public.announcements (site_id, title, body, type, pinned, target, publish_at, expire_at, created_by)
    values (p_site, v_title, v_body, p_type, coalesce(p_pinned, false), v_target, p_publish_at, p_expire_at, v_uid)
    returning id into v_id;
    return v_id;
  end if;

  if v_old.status = 'published' and (v_target is distinct from v_old.target or date_trunc('minute', p_publish_at) is distinct from date_trunc('minute', v_old.publish_at)) then
    raise exception 'locked_after_publish';
  end if;
  update public.announcements
     set title = v_title, body = v_body, type = p_type, pinned = coalesce(p_pinned, false), target = v_target,
         publish_at = p_publish_at, expire_at = p_expire_at, updated_at = now()
   where id = p_id;
  return p_id;
end;
$$;

-- Publish: fixes the recipients and writes their notifications. Running it again only adds people who joined the target
-- meanwhile (nobody is notified twice). A start time in the future: visible, and notified, from that time on.
create or replace function public.publish_announcement(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a       public.announcements;
  v_target  jsonb;
  v_total   integer;
  v_visible timestamptz;
begin
  select * into v_a from public.announcements a where a.id = p_id and a.deleted_at is null for update;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_a.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_target := private.normalize_target(v_a.site_id, v_a.target);
  if v_a.expire_at is not null and v_a.expire_at <= now() then
    raise exception 'date_invalid';
  end if;

  insert into public.announcement_recipients (announcement_id, profile_id)
  select distinct p_id, a.profile_id from private.audience(v_a.site_id, v_target) a
  on conflict do nothing;
  select count(*)::integer into v_total from public.announcement_recipients r where r.announcement_id = p_id;
  if v_total = 0 then
    raise exception 'no_recipients';
  end if;

  update public.announcements set status = 'published', published_at = coalesce(published_at, now()), updated_at = now() where id = p_id;
  v_visible := coalesce(v_a.publish_at, now());

  -- everybody who has no notification yet (a person who read it before an unpublish is not bothered again)
  insert into public.notifications (profile_id, kind, title, body, link, event_key, visible_at)
  select r.profile_id, 'announcement', left(case when v_a.type = 'acil' then 'ACİL: ' else '' end || v_a.title, 120), left(v_a.body, 140), '/duyurular',
         'announcement:' || p_id::text, v_visible
    from public.announcement_recipients r
    join public.profiles pr on pr.id = r.profile_id and pr.is_active
   where r.announcement_id = p_id
     and not exists (select 1 from public.announcement_reads rd where rd.announcement_id = p_id and rd.profile_id = r.profile_id)
  on conflict (profile_id, event_key) do nothing;
  return v_total;
end;
$$;

-- Take it down: residents no longer see it, and its unread notifications disappear. Recipients and reads are kept.
create or replace function public.unpublish_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.announcements;
begin
  select * into v_a from public.announcements a where a.id = p_id and a.deleted_at is null for update;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_a.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_a.status <> 'published' then
    raise exception 'not_published';
  end if;
  update public.announcements set status = 'draft', published_at = null, updated_at = now() where id = p_id;
  delete from public.notifications n where n.kind = 'announcement' and n.event_key like 'announcement:' || p_id::text || '%' and n.read_at is null;
end;
$$;

-- Soft delete: it disappears for residents and admins, its unread notifications go too. Nothing is physically removed.
create or replace function public.delete_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.announcements;
begin
  select * into v_a from public.announcements a where a.id = p_id and a.deleted_at is null for update;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_a.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.announcements set deleted_at = now(), updated_at = now() where id = p_id;
  delete from public.notifications n where n.kind = 'announcement' and n.event_key like 'announcement:' || p_id::text || '%' and n.read_at is null;
end;
$$;

-- "Okumayanlara tekrar gönder": a fresh notification for the recipients who did not open it yet (their old unread one is
-- replaced). Once per hour at most. Returns how many people were reminded.
create or replace function public.resend_announcement_unread(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a   public.announcements;
  v_n   integer;
  v_key text;
begin
  select * into v_a from public.announcements a where a.id = p_id and a.deleted_at is null for update;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_a.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_a.status <> 'published' or (v_a.publish_at is not null and v_a.publish_at > now()) or (v_a.expire_at is not null and v_a.expire_at <= now()) then
    raise exception 'not_active';
  end if;
  if v_a.last_resent_at is not null and v_a.last_resent_at > now() - interval '1 hour' then
    raise exception 'resend_too_soon';
  end if;

  v_key := 'announcement:' || p_id::text || ':r' || (v_a.resend_count + 1)::text;
  delete from public.notifications n
   where n.kind = 'announcement' and n.event_key like 'announcement:' || p_id::text || '%' and n.read_at is null
     and not exists (select 1 from public.announcement_reads rd where rd.announcement_id = p_id and rd.profile_id = n.profile_id);
  insert into public.notifications (profile_id, kind, title, body, link, event_key, visible_at)
  select r.profile_id, 'announcement', left('Hatırlatma: ' || v_a.title, 120), left(v_a.body, 140), '/duyurular', v_key, now()
    from public.announcement_recipients r
    join public.profiles pr on pr.id = r.profile_id and pr.is_active
   where r.announcement_id = p_id
     and exists (select 1 from public.unit_residents ur join public.units u on u.id = ur.unit_id join public.blocks b on b.id = u.block_id
                  where ur.profile_id = r.profile_id and b.site_id = v_a.site_id
                    and ur.start_date <= (now() at time zone 'Europe/Istanbul')::date
                    and (ur.end_date is null or ur.end_date > (now() at time zone 'Europe/Istanbul')::date))
     and not exists (select 1 from public.announcement_reads rd where rd.announcement_id = p_id and rd.profile_id = r.profile_id)
  on conflict (profile_id, event_key) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    update public.announcements set resend_count = resend_count + 1, last_resent_at = now() where id = p_id;
  end if;
  return v_n;
end;
$$;

-- The admin's list: counts come from the SAME rows as the report (recipients, reads).
create or replace function public.list_announcements(p_site uuid)
returns table (
  id uuid, title text, body text, type text, pinned boolean, status text, publish_at timestamptz, expire_at timestamptz,
  published_at timestamptz, recipient_count integer, read_count integer, resend_count integer, last_resent_at timestamptz,
  created_at timestamptz, updated_at timestamptz
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
    select a.id, a.title, a.body, a.type, a.pinned, a.status, a.publish_at, a.expire_at, a.published_at,
           (select count(*)::integer from public.announcement_recipients r where r.announcement_id = a.id),
           (select count(*)::integer from public.announcement_recipients r join public.announcement_reads rd on rd.announcement_id = r.announcement_id and rd.profile_id = r.profile_id where r.announcement_id = a.id),
           a.resend_count, a.last_resent_at, a.created_at, a.updated_at
      from public.announcements a
     where a.site_id = p_site and a.deleted_at is null
     order by a.created_at desc, a.id
     limit 300;
end;
$$;

-- The target of one announcement (for the edit form). Only an admin of the site.
create or replace function public.announcement_target(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_a public.announcements;
begin
  select * into v_a from public.announcements a where a.id = p_id and a.deleted_at is null;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_a.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return v_a.target;
end;
$$;

-- Who got it and who opened it (read first the ones who did not).
create or replace function public.announcement_report(p_id uuid)
returns table (profile_id uuid, full_name text, units text, relations text, read_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_a public.announcements;
begin
  select * into v_a from public.announcements a where a.id = p_id and a.deleted_at is null;
  if not found or (select auth.uid()) is null or not private.is_site_admin(v_a.site_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select r.profile_id, pr.full_name,
           coalesce((select string_agg(distinct b.name || ' · ' || u.door_no, ', ')
                       from public.unit_residents ur join public.units u on u.id = ur.unit_id join public.blocks b on b.id = u.block_id
                      where ur.profile_id = r.profile_id and b.site_id = v_a.site_id
                        and ur.start_date <= (now() at time zone 'Europe/Istanbul')::date
                        and (ur.end_date is null or ur.end_date > (now() at time zone 'Europe/Istanbul')::date)), '—'),
           coalesce((select string_agg(distinct ur.relation, ', ')
                       from public.unit_residents ur join public.units u on u.id = ur.unit_id join public.blocks b on b.id = u.block_id
                      where ur.profile_id = r.profile_id and b.site_id = v_a.site_id
                        and ur.start_date <= (now() at time zone 'Europe/Istanbul')::date
                        and (ur.end_date is null or ur.end_date > (now() at time zone 'Europe/Istanbul')::date)), '—'),
           rd.read_at
      from public.announcement_recipients r
      join public.profiles pr on pr.id = r.profile_id
      left join public.announcement_reads rd on rd.announcement_id = r.announcement_id and rd.profile_id = r.profile_id
     where r.announcement_id = p_id
     order by (rd.read_at is not null), pr.full_name nulls last, r.profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Resident function: opening an announcement
-- ---------------------------------------------------------------------------
create or replace function public.mark_announcement_read(p_announcement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null
     or not exists (
       select 1 from public.announcements a
        where a.id = p_announcement and a.status = 'published' and a.deleted_at is null and (a.publish_at is null or a.publish_at <= now())
     )
     or not private.can_read_announcement(p_announcement) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.announcement_reads (announcement_id, profile_id) values (p_announcement, v_uid) on conflict do nothing;
  update public.notifications n set read_at = now()
   where n.profile_id = v_uid and n.kind = 'announcement' and n.event_key like 'announcement:' || p_announcement::text || '%' and n.read_at is null;
end;
$$;

revoke all on function public.preview_announcement_audience(uuid, jsonb) from public, anon;
revoke all on function public.save_announcement(uuid, uuid, text, text, text, boolean, jsonb, timestamptz, timestamptz) from public, anon;
revoke all on function public.publish_announcement(uuid) from public, anon;
revoke all on function public.unpublish_announcement(uuid) from public, anon;
revoke all on function public.delete_announcement(uuid) from public, anon;
revoke all on function public.resend_announcement_unread(uuid) from public, anon;
revoke all on function public.list_announcements(uuid) from public, anon;
revoke all on function public.announcement_target(uuid) from public, anon;
revoke all on function public.announcement_report(uuid) from public, anon;
revoke all on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function public.preview_announcement_audience(uuid, jsonb) to authenticated;
grant execute on function public.save_announcement(uuid, uuid, text, text, text, boolean, jsonb, timestamptz, timestamptz) to authenticated;
grant execute on function public.publish_announcement(uuid) to authenticated;
grant execute on function public.unpublish_announcement(uuid) to authenticated;
grant execute on function public.delete_announcement(uuid) to authenticated;
grant execute on function public.resend_announcement_unread(uuid) to authenticated;
grant execute on function public.list_announcements(uuid) to authenticated;
grant execute on function public.announcement_target(uuid) to authenticated;
grant execute on function public.announcement_report(uuid) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Notification triggers (none of them can make the real work fail)
-- ---------------------------------------------------------------------------
-- A new charge: the residents of the unit who may SEE the line (a tenant only if it is shown to tenants and due after he moved in).
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
           left(coalesce(t.name, 'Borç') || case when n.period is not null then ' · ' || private.tr_month(n.period) else '' end
                || ': ' || private.format_try(n.amount) || ' · son ödeme ' || to_char(n.due_date, 'DD.MM.YYYY'), 500),
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
create trigger charges_notify after insert on public.charges
  referencing new table as new_rows for each statement execute function private.notify_new_charges();

-- A charge batch that is deleted within its 15 minutes takes the (unread) notifications of those charges with it.
create or replace function private.unnotify_deleted_charges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from public.notifications n where n.kind = 'charge' and n.read_at is null and n.event_key in (select 'charge:' || o.id::text from old_rows o);
  exception when others then
    raise warning 'charge notifications not removed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger charges_unnotify after delete on public.charges
  referencing old table as old_rows for each statement execute function private.unnotify_deleted_charges();

-- A cancelled charge: its unread notification goes.
create or replace function private.unnotify_voided_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from public.notifications n where n.kind = 'charge' and n.read_at is null and n.event_key = 'charge:' || new.id::text;
  exception when others then
    raise warning 'charge notification not removed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger charges_void_unnotify after update of voided_at on public.charges
  for each row when (old.voided_at is null and new.voided_at is not null) execute function private.unnotify_voided_charge();

-- A payment: the payer ("Ödeme alındı") and the owners of the unit. Never a tenant for an owner's payment.
-- A payment that comes from a havale notice tells the sender with "Havale onaylandı" instead (below), once.
create or replace function private.notify_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total text := private.format_try(new.amount + new.fee);
  r       record;
begin
  begin
    if new.payer_id is not null and coalesce(new.provider_ref, '') not like 'notice:%' then
      perform private.notify(new.payer_id, 'payment', 'Ödeme alındı', v_total || ' ödemeniz alındı. Makbuz no: ' || new.receipt_no, '/odemelerim', 'payment:' || new.id::text);
    end if;
    for r in
      select distinct ur.profile_id
        from public.unit_residents ur
       where ur.unit_id = new.unit_id and ur.relation = 'owner'
         and ur.start_date <= (now() at time zone 'Europe/Istanbul')::date
         and (ur.end_date is null or ur.end_date > (now() at time zone 'Europe/Istanbul')::date)
         and ur.profile_id is distinct from new.payer_id
    loop
      perform private.notify(r.profile_id, 'payment', 'Ödeme alındı',
        new.unit_label || ' için ' || v_total || ' ödeme alındı' || coalesce(' (Ödeyen: ' || new.payer_name || ')', '') || '. Makbuz no: ' || new.receipt_no,
        '/odemelerim', 'payment:' || new.id::text);
    end loop;
  exception when others then
    raise warning 'payment notifications not written: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger payments_notify after insert on public.payments for each row execute function private.notify_payment();

-- A cancelled payment: "payment received" stays, "payment cancelled" is added for the payer and the owners.
create or replace function private.notify_payment_voided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  begin
    for r in
      select new.payer_id as profile_id where new.payer_id is not null
      union
      select ur.profile_id from public.unit_residents ur
       where ur.unit_id = new.unit_id and ur.relation = 'owner'
         and ur.start_date <= (now() at time zone 'Europe/Istanbul')::date
         and (ur.end_date is null or ur.end_date > (now() at time zone 'Europe/Istanbul')::date)
    loop
      perform private.notify(r.profile_id, 'payment_void', 'Ödeme iptal edildi',
        new.receipt_no || ' numaralı makbuz iptal edildi' || coalesce('. Neden: ' || new.void_reason, '') || '. İlgili borçlar yeniden ödenmemiş görünür.',
        '/odemelerim', 'payment-void:' || new.id::text);
    end loop;
  exception when others then
    raise warning 'payment cancel notifications not written: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger payments_void_notify after update of status on public.payments
  for each row when (old.status = 'approved' and new.status = 'voided') execute function private.notify_payment_voided();

-- A new havale notice: the admins of that site.
create or replace function private.notify_notice_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
  r       record;
begin
  begin
    select b.name || ' · ' || u.door_no into v_label from public.units u join public.blocks b on b.id = u.block_id where u.id = new.unit_id;
    for r in select m.profile_id from public.site_members m where m.site_id = private.unit_site_id(new.unit_id) and m.role = 'admin' loop
      perform private.notify(r.profile_id, 'havale_new', 'Yeni havale bildirimi', coalesce(v_label, 'Daire') || ' · ' || private.format_try(new.amount) || ' · ' || new.sender_name,
        '/yonetim/havale-onaylari', 'notice:' || new.id::text);
    end loop;
  exception when others then
    raise warning 'havale notifications not written: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger transfer_notices_notify after insert on public.transfer_notices for each row execute function private.notify_notice_created();

-- A notice that is no longer waiting: the admins' unread "new notice" notifications go; the sender hears the result.
create or replace function private.notify_notice_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt text;
begin
  begin
    delete from public.notifications n where n.kind = 'havale_new' and n.read_at is null and n.event_key = 'notice:' || new.id::text;
    if new.profile_id is not null and new.status = 'approved' then
      select p.receipt_no into v_receipt from public.payments p where p.id = new.payment_id;
      perform private.notify(new.profile_id, 'havale_approved', 'Havale onaylandı',
        private.format_try(new.amount) || ' tutarındaki havale bildiriminiz onaylandı' || coalesce('. Makbuz no: ' || v_receipt, ''), '/odemelerim', 'notice-result:' || new.id::text);
    elsif new.profile_id is not null and new.status = 'rejected' then
      perform private.notify(new.profile_id, 'havale_rejected', 'Havale bildirimi reddedildi',
        private.format_try(new.amount) || ' tutarındaki havale bildiriminiz reddedildi. Neden: ' || coalesce(new.reject_reason, '—'), '/havale-bildirimi', 'notice-result:' || new.id::text);
    end if;
  exception when others then
    raise warning 'havale result notifications not written: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger transfer_notices_reviewed after update of status on public.transfer_notices
  for each row when (old.status = 'pending' and new.status <> 'pending') execute function private.notify_notice_reviewed();

revoke all on function private.notify_new_charges() from public, anon, authenticated;
revoke all on function private.unnotify_deleted_charges() from public, anon, authenticated;
revoke all on function private.unnotify_voided_charge() from public, anon, authenticated;
revoke all on function private.notify_payment() from public, anon, authenticated;
revoke all on function private.notify_payment_voided() from public, anon, authenticated;
revoke all on function private.notify_notice_created() from public, anon, authenticated;
revoke all on function private.notify_notice_reviewed() from public, anon, authenticated;
