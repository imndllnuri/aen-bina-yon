#!/usr/bin/env python3
"""Deliberate breaks of ONE migration (the "break it on purpose" test).

For each break: change ONE thing in the migration, rebuild the local database, run the pgTAP tests, and expect a failure.
A break that is NOT caught means a weak test (or a redundant rule): fix the test and run that break again.

  python3 scripts/dev/break-db.py scripts/dev/breaks/s11-db.py          # all breaks (about 40 s each)
  ONLY=B01,B02 python3 scripts/dev/break-db.py scripts/dev/breaks/s11-db.py
  DRY=1 python3 scripts/dev/break-db.py scripts/dev/breaks/s11-db.py     # only check that every text can be found

The list file defines MIGRATION (path in the repo) and BREAKS = [(id, what is broken, find, replace)] (find must occur once).
The migration is always restored (the sha256 is checked) and the local database is rebuilt at the end.
"""
import hashlib, importlib.util, os, re, shutil, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('breaks', sys.argv[1])
lst = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lst)
MIG = os.path.join(ROOT, lst.MIGRATION)
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
DRY = os.environ.get('DRY') == '1'

def sh(cmd, timeout=900):
    return subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True, timeout=timeout)

orig = open(MIG, encoding='utf-8').read()
orig_hash = hashlib.sha256(orig.encode('utf-8')).hexdigest()
backup = os.path.join(tempfile.mkdtemp(prefix='break-db-'), 'migration.original.sql')
shutil.copyfile(MIG, backup)
results = []
try:
    for mid, desc, find, repl in lst.BREAKS:
        if ONLY and mid not in ONLY:
            continue
        count = orig.count(find)
        if count != 1:
            results.append((mid, 'FIND_FAILED')); print(mid, 'FIND_FAILED', f'count={count}', flush=True); continue
        if DRY:
            print(mid, 'ok'); continue
        t0 = time.time()
        open(MIG, 'w', encoding='utf-8').write(orig.replace(find, repl))
        r = sh('npx supabase db reset 2>&1 | tail -4')
        if 'Finished supabase db reset' not in r.stdout:
            results.append((mid, 'RESET_FAILED')); print(mid, 'RESET_FAILED', r.stdout[-200:].replace('\n', ' | '), flush=True); continue
        t = sh('npx supabase test db 2>&1')
        failed = re.findall(r'^# Failed test (\d+): "(.*)"', t.stdout, re.M)
        status = 'CAUGHT' if (t.returncode != 0 or failed) else 'MISSED'
        results.append((mid, status))
        print(mid, status, desc, '|', len(failed), 'failed', f'{time.time() - t0:.0f}s', flush=True)
finally:
    shutil.copyfile(backup, MIG)
    same = hashlib.sha256(open(MIG, encoding='utf-8').read().encode('utf-8')).hexdigest() == orig_hash
    print('RESTORED', same, flush=True)
    if not DRY:
        sh('npx supabase db reset 2>&1 | tail -2')
        t = sh('npx supabase test db 2>&1 | grep -E "^Result|^Files="')
        print('FINAL TESTS:', t.stdout.strip().replace('\n', ' | '), flush=True)
    print('SUMMARY: caught', sum(1 for x in results if x[1] == 'CAUGHT'), 'of', len(results), '| not caught:', [x for x in results if x[1] != 'CAUGHT'], flush=True)
