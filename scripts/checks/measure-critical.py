#!/usr/bin/env python3
"""Deterministic critical-inbox-JS measurement from the RR7 client manifest.

Critical inbox JS = union of the static modulepreload closure that RR7 itself
emits (<link rel=modulepreload>) for the routes matched at URL /mail/inbox:
  entry.client + root + (routes)/layout + (routes)/mail/layout + (routes)/mail/[folder]/page
Sum the gzip size of the unique chunk set. Also flags any single chunk >900 KiB raw.
"""
import re, json, gzip, glob, os, sys

BASE = sys.argv[1] if len(sys.argv) > 1 else '.'
CLIENT = os.path.join(BASE, 'build/client')
ASSETS = os.path.join(CLIENT, 'assets')

# locate RR7 client manifest chunk
mf = glob.glob(os.path.join(ASSETS, 'manifest-*.js'))
if not mf:
    print('NO RR7 manifest found'); sys.exit(1)
src = open(mf[0]).read()
m = re.search(r'=\s*(\{.*\})\s*;?\s*$', src.strip(), re.S) or re.search(r'(\{.*\})', src, re.S)
data = json.loads(m.group(1))

routes = data['routes']
entry = data['entry']  # {module, imports}

def chunk_name(p): return p.split('/')[-1]

# Route ids matched for /mail/inbox
MATCHED = ['root', '(routes)/layout', '(routes)/mail/layout', '(routes)/mail/[folder]/page']

crit = set()
crit.add(chunk_name(entry['module']))
for i in entry.get('imports', []): crit.add(chunk_name(i))
for rid in MATCHED:
    info = routes[rid]
    crit.add(chunk_name(info['module']))
    for i in info.get('imports', []): crit.add(chunk_name(i))
    for i in info.get('css', []): pass  # css tracked separately below

def gz(path):
    with open(path,'rb') as f: return len(gzip.compress(f.read(), 9))
def raw(path): return os.path.getsize(path)

total_gz = 0; total_raw = 0; rows=[]; over900=[]
for name in sorted(crit):
    p = os.path.join(ASSETS, name)
    if not os.path.exists(p):
        rows.append((name,'MISSING',0,0)); continue
    r=raw(p); g=gz(p); total_gz+=g; total_raw+=r
    rows.append((name,'',r,g))
    if r > 900*1024: over900.append((name,r))

print(f"=== CRITICAL INBOX JS (URL /mail/inbox) — {len(crit)} chunks ===")
for name,flag,r,g in sorted(rows, key=lambda x:-x[3])[:25]:
    print(f"  {g:8d} gz  {r:9d} raw  {name} {flag}")
print(f"... ({len(rows)} chunks total, showing top 25 by gz)")
print(f"TOTAL CRITICAL INBOX JS: {total_raw} raw  |  {total_gz} gz  =  {total_gz/1024:.1f} KiB gz")
print(f"GATE: <= 420 KiB gz  ->  {'PASS' if total_gz/1024 <= 420 else 'FAIL'} (margin {420 - total_gz/1024:.1f} KiB)")

# any >900KiB chunk across the WHOLE client build (gate: no >900KiB JS chunk)
allbig=[]
for p in glob.glob(os.path.join(ASSETS,'*.js')):
    if raw(p) > 900*1024: allbig.append((chunk_name(p), raw(p)))
print(f"CHUNKS >900 KiB raw (whole build): {allbig if allbig else 'NONE (PASS)'}")
