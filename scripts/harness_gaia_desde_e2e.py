"""E2E del proxy de Gaia con desde=15 (#518) contra un `php -S` local.
Uso: python3 -I e2e.py BASE SRVDIR ra dec rad mag"""
import json, math, os, struct, sys, urllib.error, urllib.request

BASE, SRV = sys.argv[1], sys.argv[2]
ra, dec, rad, mag = map(float, sys.argv[3:7])
LOG = os.path.join(SRV, 'cache_gaia', '.hits.log')
fallos = 0


def ok(c, et):
    global fallos
    print(('  ok   ' if c else '  FALLA ') + et)
    fallos += 0 if c else 1


def get(q, etag=None):
    req = urllib.request.Request(BASE + '/gaia_proxy.php?' + q)
    if etag:
        req.add_header('If-None-Match', etag)
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def log_lines():
    try:
        return open(LOG).read().splitlines()
    except FileNotFoundError:
        return []


cono = 'ra=%s&dec=%s&rad=%s&mag=%s' % (ra, dec, rad, mag)

print('AC7: desde inválido → 400 sin TAP ni log')
n0 = len(log_lines())
for v in ('14', 'abc', '', '15abc', '16'):
    s, _, b = get(cono + '&desde=' + v)
    ok(s == 400, 'desde=%r → %d %s' % (v, s, b[:80]))
s, _, _ = get(cono + '&desde[]=15')
ok(s == 400, 'desde[]=15 → %d' % s)
ok(len(log_lines()) == n0, 'ninguna línea de log (no se consultó nada)')

print('Peticiones completo y complemento')
s0, h0, b0 = get(cono)
s1, h1, b1 = get(cono + '&desde=15')
ok(s0 == 200 and s1 == 200, 'status %d / %d' % (s0, s1))
full, comp = json.loads(b0), json.loads(b1)
print('  filas completo %d · complemento %d · fondo %s/%s' % (len(full['data']), len(comp['data']), 'fondo' in full, 'fondo' in comp))

print('AC2: ninguna fila G < 15')
ok(all(r[2] >= 15 for r in comp['data']), 'min G complemento = %s' % min((r[2] for r in comp['data']), default=None))

print('AC5: caché y ETag separados')
e0, e1 = h0.get('ETag'), h1.get('ETag')
ok(e0 and e1 and e0 != e1, 'ETag distintos %s / %s' % (e0, e1))
ok(get(cono + '&desde=15', e0)[0] == 200, 'ETag del completo no da 304 al complemento')
ok(get(cono, e1)[0] == 200, 'ETag del complemento no da 304 al completo')
ok(get(cono + '&desde=15', e1)[0] == 304, 'su propio ETag → 304')
ok(get(cono, e0)[0] == 304, 'su propio ETag → 304 (completo)')
ok(get(cono)[2] == b0, 'sin desde: hit de caché, mismo cuerpo byte a byte')

print('AC6: log con mag y desde')
ls = [json.loads(x) for x in log_lines()[-8:]]
ok(all('mag' in e and 'desde' in e for e in ls), 'todas las líneas llevan mag y desde')
ok({e['desde'] for e in ls} == {None, 15}, 'desde null y 15 presentes: %s' % sorted({str(e['desde']) for e in ls}))
print('  ejemplo:', json.dumps(ls[-1])[:300])

print('AC3: (Avance ∩ cono) ∪ complemento == completo, por posición')
man = json.load(open(os.path.join(SRV, 'avance', 'manifiesto.json')))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
php_pix = None
# celdas del cono: las que ya calcula el proxy (gaia_fracciones_cono) vía php CLI
import subprocess
out = subprocess.run(['php', '-r', 'require "%s/gaia_proxy.php"; echo json_encode(array_keys(gaia_fracciones_cono(%r,%r,%r)));'
                      % (SRV, ra, dec, rad + 0.3)], capture_output=True, text=True).stdout
celdas = json.loads(out)
CAB = struct.Struct('<4sHBBIIHH')
av = []
for ip in celdas:
    d = open(os.path.join(SRV, 'avance', man['ruta'].replace('{ipix}', str(ip))), 'rb').read()
    n = CAB.unpack_from(d)[5]
    off = CAB.size + 4 * 42
    for k in range(n):
        r, de, g, _ = struct.unpack_from('<ffHh', d, off + 12 * k)
        av.append((r, de, g / 1000.0))


def sep(a1, d1, a2, d2):
    a1, d1, a2, d2 = map(math.radians, (a1, d1, a2, d2))
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


# el proxy cuantiza: el cono servido es el cuantizado
qra, qdec = round(ra, 3), round(dec, 3)
qrad = math.ceil(rad / 0.01 - 1e-9) * 0.01
margen = 1e-6
av_cono = [p for p in av if sep(p[0], p[1], qra, qdec) <= qrad - margen and p[2] <= mag]
borde = [p for p in av if abs(sep(p[0], p[1], qra, qdec) - qrad) <= margen]
union = [(p[0], p[1]) for p in av_cono] + [(r[0], r[1]) for r in comp['data']]
completo = [(r[0], r[1]) for r in full['data'] if abs(sep(r[0], r[1], qra, qdec) - qrad) > margen]
union = [p for p in union if abs(sep(p[0], p[1], qra, qdec) - qrad) > margen]
print('  Avance ∩ cono %d · complemento %d · unión %d · completo %d · en el borde (ignoradas) %d'
      % (len(av_cono), len(comp['data']), len(union), len(completo), len(borde)))


def clave(p):
    return (math.floor(p[0] * 1e4), math.floor(p[1] * 1e4))


def emparejar(a, b, tol=0.05 / 3600):
    idx = {}
    for i, p in enumerate(b):
        idx.setdefault(clave(p), []).append(i)
    usado, sobra = set(), []
    for p in a:
        hallado = None
        k0 = clave(p)
        for dr in (-1, 0, 1):
            for dd in (-1, 0, 1):
                for i in idx.get((k0[0] + dr, k0[1] + dd), []):
                    if i not in usado and abs(b[i][0] - p[0]) * math.cos(math.radians(p[1])) < tol and abs(b[i][1] - p[1]) < tol:
                        hallado = i
                        break
                if hallado is not None:
                    break
            if hallado is not None:
                break
        if hallado is None:
            sobra.append(p)
        else:
            usado.add(hallado)
    return sobra, [b[i] for i in range(len(b)) if i not in usado]


sobra_u, falta_u = emparejar(union, completo)
ok(len(union) == len(completo), 'mismo nº de estrellas (%d / %d)' % (len(union), len(completo)))
ok(not sobra_u, 'sin duplicados ni sobrantes en la unión (%d) %s' % (len(sobra_u), sobra_u[:3]))
ok(not falta_u, 'sin huecos (%d) %s' % (len(falta_u), falta_u[:3]))
gs = sorted(r[2] for r in full['data'])
cerca = [g for g in gs if 14.999 <= g <= 15.001]
print('  estrellas del completo con 14,999 ≤ G ≤ 15,001: %d %s' % (len(cerca), cerca[:12]))

print('AC8: ?stats=1')
st = json.loads(get('stats=1')[2])
ok(st['cache']['max_bytes'] == 1536 * 1024 * 1024, 'max_bytes = %d' % st['cache']['max_bytes'])
ok(abs(st['cache']['ocupacion'] - round(st['cache']['bytes'] / (1536 * 1024 * 1024), 4)) < 1e-9, 'ocupacion sobre el tope nuevo: %s' % st['cache']['ocupacion'])

print('\n%s' % ('Todo verde.' if not fallos else '%d fallo(s).' % fallos))
sys.exit(1 if fallos else 0)
