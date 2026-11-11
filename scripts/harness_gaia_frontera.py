"""Frontera G = 15 entre proveedores (#518, AC3 de ADR 0033).

El Avance sale de GAVO `gaia.dr3lite` con phot_g_mean_mag < 15 y el proxy pide el
complemento con G >= 15 a GAVO o a CDS (`I/355/gaiadr3`, columna Gmag). Si CDS
redondea Gmag distinto, una estrella pegada a 15 podría caer a la vez en el
Avance y en el complemento de CDS (duplicado) o en ninguno (hueco).

Compara la PERTENENCIA que decide cada servidor, no los valores impresos: por
proveedor pide el lado bajo (14,99 <= G < 15) y el alto (15 <= G <= 15,01) del
mismo cono y empareja por posición. Una estrella baja en GAVO y alta en CDS es
un duplicado; alta en GAVO y baja en CDS, un hueco.

Uso:  python3 -I scripts/harness_gaia_frontera.py [ra dec rad]
      (por defecto Cygnus, 305 +40, r = 1,2°: ~15 estrellas en 14,999-15,001)
Salida 0 si la frontera casa, 1 si cruza alguna, 2 si un proveedor no responde.
"""
import json
import math
import ssl
import sys
import urllib.parse
import urllib.request

RA, DEC, RAD = (float(x) for x in sys.argv[1:4]) if len(sys.argv) >= 4 else (305.0, 40.0, 1.2)
CTX = ssl.create_default_context(cafile='/etc/ssl/cert.pem') if sys.platform == 'darwin' else None
TOL = 0.05 / 3600   # 0,05″

PROV = {
    'gavo': ('https://dc.zah.uni-heidelberg.de/tap/sync', 'REQUEST', 'LANG', 'FORMAT', 'QUERY',
             'ra, dec', 'gaia.dr3lite', 'phot_g_mean_mag', 'ra', 'dec'),
    'cds': ('https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync', 'request', 'lang', 'format', 'query',
            'RA_ICRS, DE_ICRS', '"I/355/gaiadr3"', 'Gmag', 'RA_ICRS', 'DE_ICRS'),
}


def consulta(p, lado):
    url, kreq, klang, kfmt, kq, cols, tabla, g, cra, cdec = PROV[p]
    cond = '%s>=14.99 AND %s<15' % (g, g) if lado == 'bajo' else '%s>=15 AND %s<=15.01' % (g, g)
    q = ("SELECT %s, %s FROM %s WHERE %s AND 1=CONTAINS(POINT('ICRS',%s,%s), CIRCLE('ICRS',%s,%s,%s))"
         % (cols, g, tabla, cond, cra, cdec, RA, DEC, RAD))
    datos = urllib.parse.urlencode({kreq: 'doQuery', klang: 'ADQL', kfmt: 'json', kq: q}).encode()
    req = urllib.request.Request(url, datos, headers={'User-Agent': 'simulador-ocular/1.0'})
    with urllib.request.urlopen(req, timeout=170, context=CTX) as r:
        return json.load(r)['data']


def celda(p):
    return (math.floor(p[0] * 1e4), math.floor(p[1] * 1e4))


def comunes(a, b):
    """Estrellas de `a` que también están en `b` (por posición)."""
    idx = {}
    for q in b:
        idx.setdefault(celda(q), []).append(q)
    out = []
    for p in a:
        k = celda(p)
        for dr in (-1, 0, 1):
            for dd in (-1, 0, 1):
                for q in idx.get((k[0] + dr, k[1] + dd), []):
                    if abs(q[0] - p[0]) * math.cos(math.radians(p[1])) < TOL and abs(q[1] - p[1]) < TOL:
                        out.append((p, q))
    return out


def main():
    r = {}
    for p in PROV:
        for lado in ('bajo', 'alto'):
            try:
                r[p, lado] = consulta(p, lado)
            except Exception as e:  # noqa: BLE001 — un proveedor caído es un resultado, no un fallo del arnés
                print('%s no responde (%s): no se puede medir la frontera.' % (p, e))
                return 2
            print('%-4s %-4s %5d estrellas' % (p, lado, len(r[p, lado])))
    dup = comunes(r['gavo', 'bajo'], r['cds', 'alto'])
    hueco = comunes(r['gavo', 'alto'], r['cds', 'bajo'])
    casan = len(comunes(r['gavo', 'bajo'], r['cds', 'bajo'])) + len(comunes(r['gavo', 'alto'], r['cds', 'alto']))
    print('casan en el mismo lado: %d' % casan)
    print('duplicados (Avance y complemento CDS): %d %s' % (len(dup), dup[:5]))
    print('huecos (ni Avance ni complemento CDS): %d %s' % (len(hueco), hueco[:5]))
    if dup or hueco:
        print('La frontera CRUZA: filtrar el Avance en el cliente con el criterio de CDS (AC3 de #518).')
        return 1
    print('Frontera exacta entre GAVO y CDS.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
