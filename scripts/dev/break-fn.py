#!/usr/bin/env python3
"""Deliberate breaks of the Edge Function code (index.ts): change ONE thing, restart the local function runtime, run the real
function test (npm run test:functions), expect a failure. index.ts is restored with git at the end (it must be committed first).

  python3 scripts/dev/break-fn.py scripts/dev/breaks/s13-fn.py
The list file defines BREAKS = [(id, what is broken, find, replace)] for supabase/functions/invite-resident/index.ts.
"""
import importlib.util, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('breaks', sys.argv[1]); lst = importlib.util.module_from_spec(spec); spec.loader.exec_module(lst)
TARGET = os.path.join(ROOT, 'supabase/functions/invite-resident/index.ts')
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
sh = lambda cmd, t=900: subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True, timeout=t)
orig = open(TARGET, encoding='utf-8').read()
results = []
try:
    for mid, desc, find, repl in lst.BREAKS:
        if ONLY and mid not in ONLY: continue
        if orig.count(find) != 1:
            print(mid, 'FIND_FAILED', orig.count(find), flush=True); results.append((mid, 'FIND_FAILED')); continue
        t0 = time.time()
        open(TARGET, 'w', encoding='utf-8').write(orig.replace(find, repl))
        sh('docker restart supabase_edge_runtime_aen-bina-yon'); time.sleep(12)
        r = sh('npm run test:functions 2>&1')
        failed = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
        status = 'CAUGHT' if (r.returncode != 0 or failed) else 'MISSED'
        results.append((mid, status)); print(mid, status, desc, '|', len(failed), 'failed', f'{time.time() - t0:.0f}s', flush=True)
finally:
    open(TARGET, 'w', encoding='utf-8').write(orig)
    sh('docker restart supabase_edge_runtime_aen-bina-yon')
    print('RESTORED', open(TARGET, encoding='utf-8').read() == orig, flush=True)
    print('SUMMARY: caught', sum(1 for x in results if x[1] == 'CAUGHT'), 'of', len(results), '| not caught:', [x for x in results if x[1] != 'CAUGHT'], flush=True)
