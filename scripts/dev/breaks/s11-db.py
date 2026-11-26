# Breaks of supabase/migrations/0010_profile.sql (slice 11)
MIGRATION = 'supabase/migrations/0010_profile.sql'
CHECK_KEYS = "and (notify_prefs - array['email_finance', 'email_announcements', 'email_requests']) = '{}'::jsonb"
CHECK_TYPE = "and not jsonb_path_exists(notify_prefs, '$.* ? (@.type() <> \"boolean\")')"
BREAKS = [
 ('B01', 'the shape check lets unknown keys in', CHECK_KEYS, "and true"),
 ('B02', 'the shape check lets non-boolean values in', CHECK_TYPE, "and true"),
 ('B03', 'the shape check refuses real booleans', "(@.type() <> \"boolean\")", "(@.type() = \"boolean\")"),
 ('B04', 'the shape check is never added', "alter table public.profiles add constraint profiles_notify_prefs_shape check (", "alter table public.profiles add constraint profiles_notify_prefs_shape check (true or "),
 ('B05', 'an admin can write a resident\'s choices (column update not revoked)', "revoke update (notify_prefs) on public.profiles from authenticated;", "-- not revoked"),
 ('B06', 'a deactivated person can save', "   where p.id = v_uid\n     and p.is_active\n", "   where p.id = v_uid\n"),
 ('B07', 'the function does not check the keys itself', "    if v_key not in ('email_finance', 'email_announcements', 'email_requests')\n       or jsonb_typeof(p_prefs -> v_key) <> 'boolean' then", "    if false then"),
 ('B08', 'the function accepts any value type', "\n       or jsonb_typeof(p_prefs -> v_key) <> 'boolean' then", " then"),
 ('B09', 'the function accepts any key', "    if v_key not in ('email_finance', 'email_announcements', 'email_requests')\n       or", "    if"),
 ('B10', 'the function accepts a list or a missing value', "  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then", "  if false then"),
 ('B11', 'a save overwrites the choices that were not sent', "set notify_prefs = p.notify_prefs || p_prefs", "set notify_prefs = p_prefs"),
 ('B12', 'a save changes everybody\'s choices', "   where p.id = v_uid\n     and p.is_active", "   where p.is_active"),
 ('B13', 'a save changes the row of another person (null id never matches)', "  v_uid    uuid := (select auth.uid());", "  v_uid    uuid := 'b1000000-0000-0000-0000-000000000001'::uuid;"),
 ('B14', 'the function does not check that a person is logged in', "  if v_uid is null then\n    raise exception 'not authenticated' using errcode = '28000';\n  end if;\n", ""),
 ('B15', 'a visitor may call the function', "revoke all on function public.save_my_notification_prefs(jsonb) from public, anon;", "-- not revoked"),
 ('B16', 'the function runs with the caller\'s rights (not security definer)', "language plpgsql\nsecurity definer\nset search_path = ''", "language plpgsql\nset search_path = ''"),
 ('B17', 'the function has no fixed search_path', "security definer\nset search_path = ''\nas $$\ndeclare\n  v_uid", "security definer\nas $$\ndeclare\n  v_uid"),
 ('B18', 'the function returns what was sent, not what is stored', "  return v_stored;", "  return p_prefs;"),
 ('B19', 'a missing person gives no error', "  if not found then\n    raise exception 'not allowed' using errcode = '42501';\n  end if;\n", ""),
]
