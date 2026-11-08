"""#429 AC2 y AC5: sondas y GAVO como primario, desde el volcado FTP del log.
Uso: python3 -I analiza_sonda_429.py DIR [AAAA-MM-DD desde la subida]"""
import json, os, sys
from datetime import datetime

D = sys.argv[1]
desde = datetime.strptime(sys.argv[2] if len(sys.argv) > 2 else '2026-10-24', '%Y-%m-%d').timestamp()
log = []
for f in ('.hits.log.1', '.hits.log'):
    p = os.path.join(D, f)
    if os.path.exists(p):
        for l in open(p):
            try:
                e = json.loads(l)
            except ValueError:
                continue
            if isinstance(e, dict) and e.get('t', 0) >= desde:
                log.append(e)

def p90(v):
    v = sorted(v)
    return v[min(len(v) - 1, int(0.9 * len(v)))] if v else None

sondas = [e['ms'] for e in log if e.get('estado') == 'miss' and e.get('etapa') == 'sonda']
banda = [m for m in sondas if 55000 <= m <= 75000]
print('ventana: %s → %s, %d líneas' % (datetime.fromtimestamp(desde).date(),
      datetime.fromtimestamp(max((e['t'] for e in log), default=desde)).date(), len(log)))
print('AC2 sondas: %d, en banda 55-75 s: %d, p90: %s ms (objetivo < 5000, antes 17900)'
      % (len(sondas), len(banda), p90(sondas)))

# AC5: intentos de sonda contra GAVO (primario) y cuántos no dieron 200.
intentos = [t for e in log for t in (e.get('traza') or []) if t[0] == 'sonda' and t[1] == 'gavo']
fallos = [t for t in intentos if t[2] != 200]
print('AC5 GAVO sonda: %d intentos, %d fallos (%.1f %%), http: %s' % (
    len(intentos), len(fallos), 100 * len(fallos) / len(intentos) if intentos else 0,
    sorted({t[2] for t in fallos})))
cds = sum(1 for e in log for t in (e.get('traza') or []) if t[0] == 'sonda' and t[1] == 'cds')
print('     failover a CDS en sonda: %d' % cds)
