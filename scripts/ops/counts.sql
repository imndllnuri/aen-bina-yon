-- READ ONLY. Row and structure counts to compare before and after a rollout (hosted: npx supabase db query --remote --read-only -o json "$(cat scripts/ops/counts.sql)").
select 'units' k, count(*) n from public.units union all select 'charges', count(*) from public.charges union all select 'payments', count(*) from public.payments
union all select 'allocations', count(*) from public.payment_allocations union all select 'profiles', count(*) from public.profiles union all select 'residencies', count(*) from public.unit_residents
union all select 'notices', count(*) from public.transfer_notices union all select 'notifications', count(*) from public.notifications union all select 'announcements', count(*) from public.announcements
union all select 'requests', count(*) from public.requests union all select 'quote_requests', count(*) from public.quote_requests union all select 'audit_log', count(*) from public.audit_log
union all select 'triggers', count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private')
union all select 'public functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'private functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
union all select 'tables', count(*) from pg_tables where schemaname='public'
union all select 'payment_mode mock', count(*) from public.companies where settings->>'payment_mode'='mock'
