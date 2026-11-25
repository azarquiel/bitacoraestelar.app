"""Respaldo de Gaia mientras el TAP de CDS esté caído (#628).

Lanza la misma consulta de la sonda del proxy (sin ORDER BY, TOP = techo) a
varios TAP de Gaia DR3 y anota, por campo y proveedor: código HTTP, segundos,
filas y si la respuesta es de verdad TAP (una página HTML con 200 no cuenta:
el Gaia Archive de la ESA sirve así su aviso de mantenimiento).

Uso:
  python3 -I scripts/sonda_respaldo_gaia_628.py latencia [prov,prov] [salida.json]
  python3 -I scripts/sonda_respaldo_gaia_628.py equivalencia prov [salida.json]
  python3 -I scripts/sonda_respaldo_gaia_628.py json prov
  python3 -I scripts/sonda_respaldo_gaia_628.py test

`equivalencia` compara `prov` con GAVO (referencia del proxy) en tres campos:
mismas estrellas a < 0,1″ y misma G a < 0,001 mag.
`json` comprueba que FORMAT=json trae `data` como lista de filas posicionales,
que es lo único que lee `simulador_ocular/gaia_proxy.php`.
"""
import csv
import io
import json
import math
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CTX = ssl.create_default_context(cafile='/etc/ssl/cert.pem') if sys.platform == 'darwin' else None
TIMEOUT = 60          # s: el proxy corta a los 55
TECHO = 200000        # GAIA_TECHO_FILAS del proxy
UA = 'simulador-ocular/1.0'

# id: (url sync, tabla, ra, dec, G, BP-RP)
PROV = {
    'cds': ('https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync', '"I/355/gaiadr3"',
            'RA_ICRS', 'DE_ICRS', 'Gmag', '"BP-RP"'),
    'gavo': ('https://dc.zah.uni-heidelberg.de/tap/sync', 'gaia.dr3lite',
             'ra', 'dec', 'phot_g_mean_mag', 'phot_bp_mean_mag-phot_rp_mean_mag'),
    'esa': ('https://gea.esac.esa.int/tap-server/tap/sync', 'gaiadr3.gaia_source',
            'ra', 'dec', 'phot_g_mean_mag', 'bp_rp'),
    'irsa': ('https://irsa.ipac.caltech.edu/TAP/sync', 'gaia_dr3_source',
             'ra', 'dec', 'phot_g_mean_mag', 'bp_rp'),
    'datalab': ('https://datalab.noirlab.edu/tap/sync', 'gaia_dr3.gaia_source',
                'ra', 'dec', 'phot_g_mean_mag', 'bp_rp'),
    'ari': ('https://gaia.ari.uni-heidelberg.de/tap/sync', 'gaiadr3.gaia_source',
            'ra', 'dec', 'phot_g_mean_mag', 'bp_rp'),
}

# id: (ra, dec, radio °, mag). Dispersos de harness_gaia_e4; densos de la tabla de #517.
CAMPOS = {
    'polo': (192.86, 27.13, 0.89, 20.0),
    'virgo': (187.7, 12.4, 0.89, 20.0),
    'm13': (250.423, 36.460, 0.89, 20.0),
    'cas': (11.0, 61.0, 0.60, 20.0),
    'cygnus': (305.5, 40.2, 0.36, 19.0),
    'carina': (161.0, -59.9, 0.36, 20.0),
    'm11': (282.77, -6.27, 0.36, 19.0),
    'm6': (265.08, -32.25, 0.89, 18.0),
    'm7_036': (268.447, -34.841, 0.36, 18.0),
    'm7_089': (268.447, -34.841, 0.89, 16.0),
}
DENSOS = ('carina', 'm11', 'm6', 'm7_036', 'm7_089')
EQUIV = ('polo', 'm13', 'cygnus')


def adql(prov, campo):
    _, tabla, ra, dec, g, bprp = PROV[prov]
    c_ra, c_dec, rad, mag = CAMPOS[campo]
    return ('SELECT TOP %d %s, %s, %s, %s FROM %s WHERE %s<=%s AND 1=CONTAINS(POINT(\'ICRS\',%s,%s),'
            ' CIRCLE(\'ICRS\',%s,%s,%s))' % (TECHO, ra, dec, g, bprp, tabla, g, mag, ra, dec, c_ra, c_dec, rad))


def pedir(prov, query, fmt):
    """(http, segundos, content-type, cuerpo|None, error|None). Nunca lanza."""
    datos = urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': fmt,
                                    'MAXREC': TECHO, 'QUERY': query}).encode()
    req = urllib.request.Request(PROV[prov][0], datos, headers={'User-Agent': UA})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX) as r:
            return r.status, time.monotonic() - t0, r.headers.get('Content-Type', ''), r.read(), None
    except urllib.error.HTTPError as e:
        return e.code, time.monotonic() - t0, e.headers.get('Content-Type', ''), None, e.read()[:200].decode('utf-8', 'replace')
    except Exception as e:  # timeout, DNS, TLS: todos son «no respondió»
        return 0, time.monotonic() - t0, '', None, type(e).__name__ + ': ' + str(e)[:150]


def filas_csv(cuerpo):
    """Filas (ra, dec, g, bprp|None) de un CSV TAP con cabecera."""
    out = []
    for f in list(csv.reader(io.StringIO(cuerpo.decode('utf-8', 'replace'))))[1:]:
        if len(f) >= 4 and f[0] and f[2]:
            out.append((float(f[0]), float(f[1]), float(f[2]), float(f[3]) if f[3] else None))
    return out


def sonda(prov, campo):
    http, s, ctype, cuerpo, err = pedir(prov, adql(prov, campo), 'csv')
    r = {'prov': prov, 'campo': campo, 'http': http, 's': round(s, 2)}
    if cuerpo is not None and 'html' in ctype.lower():
        r['err'] = 'html (no es TAP)'
    elif cuerpo is not None:
        r['filas'] = len(filas_csv(cuerpo))
    else:
        r['err'] = err
    return r


def casar(a, b, tol_as=0.1):
    """Compara dos listas de filas. Devuelve (solo_a, solo_b, max_dpos″, max_dG)."""
    tol = tol_as / 3600.0
    idx = {}
    for q in b:
        idx.setdefault((math.floor(q[0] / tol), math.floor(q[1] / tol)), []).append(q)
    usados, solo_a, dpos, dg = set(), 0, 0.0, 0.0
    for p in a:
        kx, ky = math.floor(p[0] / tol), math.floor(p[1] / tol)
        mejor = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in idx.get((kx + dx, ky + dy), ()):
                    d = math.hypot((p[0] - q[0]) * math.cos(math.radians(p[1])), p[1] - q[1])
                    if id(q) not in usados and d < tol and (mejor is None or d < mejor[0]):
                        mejor = (d, q)
        if mejor is None:
            solo_a += 1
            continue
        usados.add(id(mejor[1]))
        dpos = max(dpos, mejor[0] * 3600)
        dg = max(dg, abs(p[2] - mejor[1][2]))
    return solo_a, len(b) - len(usados), dpos, dg


def equivalencia(prov):
    out = []
    for campo in EQUIV:
        res = {}
        for p in ('gavo', prov):
            http, s, ctype, cuerpo, err = pedir(p, adql(p, campo), 'csv')
            res[p] = filas_csv(cuerpo) if cuerpo is not None and 'html' not in ctype.lower() else None
            if res[p] is None:
                print('  %s %s: sin datos (%s %s)' % (campo, p, http, err or ctype))
        if res['gavo'] is None or res[prov] is None:
            out.append({'campo': campo, 'err': 'sin datos'})
            continue
        sa, sb, dpos, dg = casar(res[prov], res['gavo'])
        r = {'campo': campo, 'n_' + prov: len(res[prov]), 'n_gavo': len(res['gavo']),
             'solo_' + prov: sa, 'solo_gavo': sb, 'max_dpos_as': round(dpos, 4), 'max_dG': round(dg, 5),
             'casa': sa == 0 and sb == 0 and dg < 0.001}
        print('  ', r)
        out.append(r)
    return out


def comprobar_json(prov):
    http, s, ctype, cuerpo, err = pedir(prov, adql(prov, 'polo').replace('TOP %d' % TECHO, 'TOP 3'), 'json')
    if cuerpo is None or 'html' in ctype.lower():
        return {'prov': prov, 'http': http, 'ok': False, 'motivo': err or ctype}
    try:
        j = json.loads(cuerpo)
    except ValueError:
        return {'prov': prov, 'http': http, 'ok': False, 'motivo': 'no es JSON: ' + cuerpo[:80].decode('utf-8', 'replace')}
    d = j.get('data') if isinstance(j, dict) else None
    ok = isinstance(d, list) and all(isinstance(f, list) and len(f) == 4 for f in d)
    return {'prov': prov, 'http': http, 'ok': ok, 'claves': sorted(j) if isinstance(j, dict) else type(j).__name__,
            'primera': d[0] if ok and d else None}


def mediana_p90(xs):
    xs = sorted(xs)
    if not xs:
        return None, None
    return xs[len(xs) // 2], xs[min(len(xs) - 1, math.ceil(0.9 * len(xs)) - 1)]


def latencia(provs):
    res = []
    for campo in CAMPOS:
        for p in provs:
            r = sonda(p, campo)
            print('  ', json.dumps(r, ensure_ascii=False), flush=True)
            res.append(r)
    for p in provs:
        for grupo, nombres in (('dispersos', [c for c in CAMPOS if c not in DENSOS]), ('densos', DENSOS)):
            rs = [r for r in res if r['prov'] == p and r['campo'] in nombres]
            ok = [r['s'] for r in rs if 'filas' in r and 200 <= r['http'] < 300]
            med, p90 = mediana_p90(ok)
            print('%-8s %-9s ok %d/%d  mediana %s s  p90 %s s' % (p, grupo, len(ok), len(rs), med, p90))
    return res


def test():
    a = [(10.0, 20.0, 15.0, 1.0), (10.001, 20.0, 16.0, None)]
    b = [(10.0 + 0.05 / 3600, 20.0, 15.0004, 1.0), (10.001, 20.0, 16.0, None)]
    assert casar(a, b)[:2] == (0, 0)
    assert 0.04 < casar(a, b)[2] < 0.06 and abs(casar(a, b)[3] - 0.0004) < 1e-9
    assert casar(a, b[:1])[:2] == (1, 0)
    c = [(10.0 + 0.2 / 3600, 20.0, 15.0, 1.0)]          # a 0,2″: no casa
    assert casar(c, b[:1])[:2] == (1, 1)
    assert filas_csv(b'ra,dec,g,bprp\n1.5,2.5,15.1,\n') == [(1.5, 2.5, 15.1, None)]
    assert mediana_p90([3, 1, 2]) == (2, 3)
    print('ok')


if __name__ == '__main__':
    modo = sys.argv[1] if len(sys.argv) > 1 else 'test'
    if modo == 'test':
        test()
        sys.exit(0)
    salida = None
    if modo == 'latencia':
        provs = sys.argv[2].split(',') if len(sys.argv) > 2 else list(PROV)
        res = {'fecha': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'sondas': latencia(provs)}
        salida = sys.argv[3] if len(sys.argv) > 3 else None
    elif modo == 'equivalencia':
        res = {'fecha': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'campos': equivalencia(sys.argv[2])}
        salida = sys.argv[3] if len(sys.argv) > 3 else None
    elif modo == 'json':
        res = comprobar_json(sys.argv[2])
        print(res)
    else:
        sys.exit(__doc__)
    if salida:
        with open(salida, 'w') as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
