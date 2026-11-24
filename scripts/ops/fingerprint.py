# Compares the database STRUCTURE of the local stack and the hosted project (read-only on both sides).
# Usage: python3 -I scripts/ops/fingerprint.py (run it from anywhere; needs the local stack and a linked project)            -> prints one line per category: IDENTICAL or DIFFERENT (+ the differences)
import json, subprocess, sys, hashlib

import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CATEGORIES = {
 'tables (rls on/off)': """select n.nspname||'.'||c.relname as k, c.relkind::text||'|'||c.relrowsecurity::text||'|'||c.relforcerowsecurity::text as v
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','S','m','p') order by 1""",
 'columns': """select c.relname||'.'||a.attname as k, format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'') as v
   from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
   where n.nspname='public' and c.relkind in ('r','v') and a.attnum>0 and not a.attisdropped order by 1""",
 'constraints': """select c.relname||'.'||co.conname as k, pg_get_constraintdef(co.oid) as v
   from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') order by 1""",
 'indexes': """select schemaname||'.'||indexname as k, indexdef as v from pg_indexes where schemaname in ('public','private') order by 1""",
 'policies (public + storage objects)': """select schemaname||'.'||tablename||'.'||policyname as k, cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') as v
   from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects') order by 1""",
 'functions (body, security, acl)': """select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as k,
   p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||md5(p.prosrc)||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_function_result(p.oid) as v
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1""",
 'view definitions': """select c.relname as k, md5(pg_get_viewdef(c.oid))||'|'||coalesce(c.reloptions::text,'') as v
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' order by 1""",
 'table and view grants': """select c.relname||'.'||coalesce(r.rolname,'public') as k, string_agg(a.privilege_type, ',' order by a.privilege_type) as v
   from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) a left join pg_roles r on r.oid=a.grantee
   where n.nspname='public' and c.relkind in ('r','v') and coalesce(r.rolname,'public') in ('anon','authenticated','public') group by 1 order by 1""",
 'column grants': """select c.relname||'.'||a.attname as k, a.attacl::text as v from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and a.attnum>0 and not a.attisdropped and a.attacl is not null order by 1""",
 'triggers': """select c.relname||'.'||t.tgname as k, md5(pg_get_triggerdef(t.oid)) as v from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where not t.tgisinternal and n.nspname in ('public','private') order by 1""",
 'storage bucket dekontlar': """select id as k, public::text||'|'||coalesce(file_size_limit::text,'')||'|'||coalesce(allowed_mime_types::text,'') as v from storage.buckets order by 1""",
 'companies column grants': """select 'companies.settings.update' as k, has_column_privilege('authenticated','public.companies','settings','update')::text as v""",
}

def query(sql, remote):
    cmd = ['npx', 'supabase', 'db', 'query'] + (['--remote', '--read-only'] if remote else []) + [sql]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=300)
    text = out.stdout
    start = text.find('{')
    if start < 0:
        raise SystemExit(f'no JSON from {"remote" if remote else "local"}: {text[:300]} {out.stderr[:300]}')
    data = json.JSONDecoder().raw_decode(text[start:])[0]
    return {row['k']: row['v'] for row in data['rows']}

bad = False
for name, sql in CATEGORIES.items():
    local = query(sql, False)
    remote = query(sql, True)
    if not local or not remote:
        print(f'EMPTY   {name}: local={len(local)} remote={len(remote)}  <- an empty comparison proves nothing')
        bad = True
        continue
    if local == remote:
        print(f'IDENTICAL  {name} ({len(local)} entries)')
    else:
        bad = True
        print(f'DIFFERENT  {name}: local={len(local)} remote={len(remote)}')
        for k in sorted(set(local) | set(remote)):
            if local.get(k) != remote.get(k):
                print('    ', k, '\n        local :', str(local.get(k))[:160], '\n        remote:', str(remote.get(k))[:160])
sys.exit(1 if bad else 0)
