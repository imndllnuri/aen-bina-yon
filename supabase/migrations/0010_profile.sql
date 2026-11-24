-- 0010_profile.sql: the Profil page (slice 11)
--
-- What this adds:
--   1. profiles.notify_prefs gets a SHAPE CHECK: a JSON object with only three known keys, each true or false.
--      (Before, it could hold anything of any size.)
--   2. Only the person themself can change their preferences. Until now the column grant also let a site admin
--      change the preferences of a resident ("people the site manages" may update full_name, phone, notify_prefs).
--      A preference is the person's own choice, so the column update is taken away and one checked function
--      writes it instead: save_my_notification_prefs(). Name and phone stay as they were (admins correct them in
--      Sakinler).
--
-- The three keys (for the e-mail channel; the bell inside the site is always on):
--   email_finance        charges, payments, havale results
--   email_announcements  announcements from the management
--   email_requests       news about the person's own requests
-- A key that is missing means "not chosen yet". Nothing sends e-mail yet: the values are only stored (slice 15 uses them).
--
-- Same rules as before: explicit grants, search_path = '' on the security-definer function, short error codes
-- ('prefs_invalid') that the app turns into Turkish.

-- ---------------------------------------------------------------------------
-- 1. the shape of notify_prefs
-- ---------------------------------------------------------------------------
-- (Written inline, not as a function: a CHECK that calls a function would need EXECUTE rights for every role that
--  updates a profile.)
alter table public.profiles add constraint profiles_notify_prefs_shape check (
  jsonb_typeof(notify_prefs) = 'object'
  and (notify_prefs - array['email_finance', 'email_announcements', 'email_requests']) = '{}'::jsonb
  and not jsonb_path_exists(notify_prefs, '$.* ? (@.type() <> "boolean")')
);

-- ---------------------------------------------------------------------------
-- 2. only the person changes their own preferences
-- ---------------------------------------------------------------------------
revoke update (notify_prefs) on public.profiles from authenticated;

-- Keys that are not sent keep their old value (so the page can send just what changed).
-- Returns the preferences as stored. A deactivated person gets "not allowed".
create or replace function public.save_my_notification_prefs(p_prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_key    text;
  v_stored jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    raise exception 'prefs_invalid';
  end if;
  for v_key in select jsonb_object_keys(p_prefs) loop
    if v_key not in ('email_finance', 'email_announcements', 'email_requests')
       or jsonb_typeof(p_prefs -> v_key) <> 'boolean' then
      raise exception 'prefs_invalid';
    end if;
  end loop;

  update public.profiles p
     set notify_prefs = p.notify_prefs || p_prefs
   where p.id = v_uid
     and p.is_active
  returning p.notify_prefs into v_stored;

  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return v_stored;
end;
$$;

revoke all on function public.save_my_notification_prefs(jsonb) from public, anon;
grant execute on function public.save_my_notification_prefs(jsonb) to authenticated;
