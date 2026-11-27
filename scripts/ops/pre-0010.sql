-- READ ONLY. Would the new shape check of migration 0010 accept the rows that are already there? (would_fail must be 0)
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profiles where notify_prefs <> '{}'::jsonb) as non_empty_prefs,
  (select count(*) from public.profiles where not (
      jsonb_typeof(notify_prefs) = 'object'
      and (notify_prefs - array['email_finance', 'email_announcements', 'email_requests']) = '{}'::jsonb
      and not jsonb_path_exists(notify_prefs, '$.* ? (@.type() <> "boolean")'))) as would_fail
