#!/usr/bin/env python3
"""Deliberate breaks of the front end: change ONE thing in one file, run the matching test file, expect a failure.
A break that is NOT caught means a weak test: fix the test and run that break again.

  python3 scripts/dev/break-ui.py scripts/dev/breaks/s11-ui.py        # all breaks (a few seconds each)
  ONLY=A01,A02 python3 scripts/dev/break-ui.py scripts/dev/breaks/s11-ui.py
  DRY=1 python3 scripts/dev/break-ui.py scripts/dev/breaks/s11-ui.py   # only check that every text can be found

The list file defines BREAKS = [(id, what is broken, file, find, replace, tests to run)] (find must occur once).
Every changed file is restored at the end.
"""
import importlib.util, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location('breaks', sys.argv[1])
lst = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lst)
ONLY = [x for x in os.environ.get('ONLY', '').split(',') if x]
DRY = os.environ.get('DRY') == '1'

originals = {}
results = []
try:
    for mid, desc, path, find, repl, tests in lst.BREAKS:
        if ONLY and mid not in ONLY:
            continue
        full = os.path.join(ROOT, path)
        if path not in originals:
            originals[path] = open(full, encoding='utf-8').read()
        src = originals[path]
        count = src.count(find)
        if count != 1:
            results.append((mid, 'FIND_FAILED')); print(mid, 'FIND_FAILED', f'count={count}', flush=True); continue
        if DRY:
            print(mid, 'ok'); continue
        t0 = time.time()
        open(full, 'w', encoding='utf-8').write(src.replace(find, repl))
        r = subprocess.run(f'npx vitest run {tests} 2>&1', shell=True, cwd=ROOT, capture_output=True, text=True, timeout=900)
        open(full, 'w', encoding='utf-8').write(src)
        status = 'CAUGHT' if r.returncode != 0 else 'MISSED'
        m = re.search(r'Tests\s+(.*)', r.stdout)
        results.append((mid, status))
        print(mid, status, desc, '|', (m.group(1) if m else '').strip()[:50], f'{time.time() - t0:.0f}s', flush=True)
finally:
    for path, src in originals.items():
        open(os.path.join(ROOT, path), 'w', encoding='utf-8').write(src)
    print('SUMMARY: caught', sum(1 for x in results if x[1] == 'CAUGHT'), 'of', len(results), '| not caught:', [x for x in results if x[1] != 'CAUGHT'], flush=True)
