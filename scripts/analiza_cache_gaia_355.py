"""#355: cifras de la caché de Gaia a partir del volcado FTP. Uso: python3 -I analiza355.py DIR"""
import gzip, hashlib, json, math, os, statistics, sys
from collections import Counter, defaultdict

D = sys.argv[1]
log = [json.loads(l) for l in open(os.path.join(D, '.hits.log')) if l.strip()]
ficheros = {f[:-8]: os.path.getsize(os.path.join(D, f)) for f in os.listdir(D) if f.endswith('.json.gz')}

def clave(ra, dec, rad, mag):
    return hashlib.sha1(('%.3f_%.3f_%.2f_%.2f' % (ra, dec, rad, mag)).encode()).hexdigest()

def sep(ra1, de1, ra2, de2):
    r = math.radians
    c = math.sin(r(de1)) * math.sin(r(de2)) + math.cos(r(de1)) * math.cos(r(de2)) * math.cos(r(ra1 - ra2))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))

def reconstruir(k, j):
    filas = [f for f in j['data'] if f[0] is not None]
    ras = [f[0] for f in filas]; des = [f[1] for f in filas]
    if max(ras) - min(ras) > 180:
        ras = [x if x > 180 else x + 360 for x in ras]
    ra0 = (max(ras) + min(ras)) / 2 % 360; de0 = (max(des) + min(des)) / 2
    gmax = max((f[2] for f in filas if f[2] is not None), default=0)
    rmax = max(sep(ra0, de0, f[0], f[1]) for f in filas)
    rads = [j['fondo']['rad']] if 'fondo' in j else [round(math.ceil(rmax / 0.01) * 0.01 + i * 0.01, 2) for i in range(-3, 8)]
    if 'fondo' in j:
        mags = [m / 2 for m in range(int(j['fondo']['corte'] * 2), 41)]
    else:
        mags = [m / 2 for m in range(max(1, int(gmax * 2) - 1), 41)]
    for paso in (8, 25, 60):
        for di in range(-paso, paso + 1):
            for dj in range(-paso, paso + 1):
                ra = round(ra0 + di * 0.001, 3) % 360; de = round(de0 + dj * 0.001, 3)
                for rad in rads:
                    for mag in mags:
                        if clave(ra, de, rad, mag) == k:
                            return (round(ra, 3), round(de, 3), rad, mag)
    return None

# ── entradas en disco ──
reg, params = {}, {}
for k in ficheros:
    j = json.load(gzip.open(os.path.join(D, k + '.json.gz')))
    reg[k] = 'densa' if 'fondo' in j else 'sonda'
    params[k] = reconstruir(k, j)

# ── punto 1 ──
total = sum(ficheros.values()); tope = 500 * 1024 * 1024
miss = [e for e in log if e['estado'] == 'miss']
claves_miss = {e['clave'] for e in miss}
perdidas = sorted(claves_miss - set(ficheros))
print('P1 bytes en disco', total, 'tope', tope, 'ocupacion %.4f' % (total / tope), 'entradas', len(ficheros))
print('P1 claves con miss en el log que ya no estan en disco:', len(perdidas), Counter(next(e['etapa'] for e in miss if e['clave'] == k) for k in perdidas))
print('P1 304:', [(e['clave'][:8], e['etapa'], e['clave'] in ficheros) for e in log if e['estado'] == '304'])
# ── punto 2 ──
t0, t1 = log[0]['t'], log[-1]['t']
print('P2 ventana dias %.1f' % ((t1 - t0) / 86400), 'estados', Counter(e['estado'] for e in log), 'miss por etapa', Counter(e['etapa'] for e in miss))
print('P2 claves distintas pedidas', len({e['clave'] for e in log}), 'claves miss distintas', len(claves_miss), 'miss repetidos', len(miss) - len(claves_miss))
porDia = Counter(int((e['t'] - t0) // 86400) for e in miss); print('P2 miss por dia', sorted(porDia.items()))
for et in ('sonda', 'densa'):
    v = [e['ms'] for e in miss if e['etapa'] == et]
    if v: print('P2 %s n=%d ms mediana %.0f p90 %.0f suma s %.0f' % (et, len(v), statistics.median(v), sorted(v)[int(.9 * len(v))], sum(v) / 1000))
# ── punto 3 ──
for r in ('sonda', 'densa'):
    t = [ficheros[k] for k in ficheros if reg[k] == r]
    print('P3 %s n=%d mediana %d B, media %d B, total %d B (%.1f %%)' % (r, len(t), statistics.median(t), statistics.mean(t), sum(t), 100 * sum(t) / total))
logk = {e['clave'] for e in log}
print('P3 entradas en disco sin linea en el log (anteriores al 2026-09-21):', sum(1 for k in ficheros if k not in logk))
crec = sum(ficheros.get(k, 0) for k in claves_miss)
print('P3 bytes en disco de las claves fallidas en la ventana: %d (%.1f MB/dia)' % (crec, crec / 1048576 / ((t1 - t0) / 86400)))
# ── punto 4 ──
ok = {k: p for k, p in params.items() if p}
print('P4 parametros reconstruidos y validados por sha1:', len(ok), 'de', len(params))
grupos = defaultdict(list)
for k, (ra, de, rad, mag) in ok.items():
    grupos[(ra, de, rad)].append((mag, k))
red = {g: v for g, v in grupos.items() if len(v) > 1}
print('P4 campos (ra,dec,rad) distintos', len(grupos), 'con >1 bucket de mag', len(red), 'claves sobrantes', sum(len(v) - 1 for v in red.values()))
print('P4 bytes sobrantes (todas menos la mas honda por campo)', sum(ficheros[k] for v in red.values() for _, k in sorted(v)[:-1]))
print('P4 por regimen', Counter(reg[k] for v in red.values() for _, k in v))
for g, v in sorted(red.items(), key=lambda x: -len(x[1]))[:10]:
    print('   ', g, sorted((m, reg[k], ficheros[k]) for m, k in v))
json.dump({k: [reg[k], ficheros[k], params[k]] for k in ficheros}, open(os.path.join(os.path.dirname(__file__), 'entradas.json'), 'w'))
