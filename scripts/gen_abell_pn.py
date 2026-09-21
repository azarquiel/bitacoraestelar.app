# -*- coding: utf-8 -*-
"""Genera el suplemento no-NGC/IC de planetarias (mapa/datos/abell_pn.csv).

Por qué existe: el catálogo de nebulosas sale del OpenNGC (NGC + IC) y hay
planetarias que no son objetos NGC/IC, así que no tienen fila y la capa
difusa no las pinta (PN A66 12 fue el caso que lo destapó; PN M 1-79
—Minkowski— el que sumó el segundo catálogo).

Cubre cuatro catálogos (tabla CATALOGOS), cada uno con su propio identificador
en SIMBAD y en V/84:
  · Abell          — "PN A66 NN"    en SIMBAD, "A NN"    en V/84/main.
  · Minkowski      — "PN M  N-NN"   en SIMBAD, "M N-NN"  en V/84/main.
  · Jones          — "PN Jn    N"   en SIMBAD, "Jn N"    en V/84/main.
  · Jones-Emberson — "PN JnEr    N" en SIMBAD, "JnEr N"  en V/84/main.
Añadir un catálogo nuevo es una entrada más en CATALOGOS, no un script nuevo:
el nombre del fichero se quedó en "abell_pn" por no mover SRC_ABELL de
gen_nebulosas.py para dos filas de docstring.

Fuentes, consultadas en vivo:
  · SIMBAD TAP — identificación, coordenadas J2000 y tamaño (galdim, arcmin),
    más V/B integradas cuando las tiene.
  · VizieR V/84 (Acker+, Strasbourg-ESO) — qué identificadores son planetarias
    de verdad para Acker, el diámetro óptico de respaldo y, sobre todo, el
    flujo Hβ con las intensidades de línea.

Magnitud: V/84 NO trae magnitud integrada de la nebulosa (las UBV que tiene son
de la estrella central: usarlas pintaría la cáscara con el brillo de una
enana de mag 19). Se deriva la magnitud [OIII] de Jacoby (1989):

    m5007 = -2.5·log10(F5007) - 13.74,   F5007 = F(Hβ) · I(5007)/100

y se usa como V. Es la aproximación estándar del trabajo visual de planetarias:
en una PN evolucionada casi toda la luz que el ojo ve es [OIII] 5007/4959, y la
respuesta escotópica pica en 507 nm, encima de la línea. Solo se usan
observaciones con Hβ como línea de referencia (LineRef = 'b'), mediana entre
observaciones. Si no hay flujo, cae a la V de SIMBAD y después a la B (la
conversión B→V la hace gen_nebulosas.py); sin nada, la fila sale sin magnitud
y el generador la descarta contándola.

Salida: mapa/datos/abell_pn.csv con el MISMO esquema del ongc_nebulosas.csv,
para que gen_nebulosas.py lo lea con el mismo parser. Name = "Abell NN" o
"M N-NN"; Common names = "PN A66 NN" o "PN M N-NN" (el buscador filtra por los
dos). Los identificadores que ya son NGC/IC (p. ej. Abell 50 = NGC 6742) se
saltan: ya tienen fila del OpenNGC.

Uso:  python3 scripts/gen_abell_pn.py   (necesita red; después, gen_nebulosas.py)
"""
import csv
import json
import math
import os
import re
import statistics
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(RAIZ, 'mapa', 'datos', 'abell_pn.csv')

SIMBAD_TAP = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync'
VIZIER_ASU = 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv'

# Mismo encabezado que ongc_nebulosas.csv: gen_nebulosas.py usa DictReader y
# solo lee Name, Type, RA, Dec, MajAx, MinAx, PosAng, B-Mag, V-Mag y Common names.
CABECERA = ('Name;Type;RA;Dec;Const;MajAx;MinAx;PosAng;B-Mag;V-Mag;J-Mag;'
            'H-Mag;K-Mag;SurfBr;Hubble;Pax;Pm-RA;Pm-Dec;RadVel;Redshift;'
            'Cstar U-Mag;Cstar B-Mag;Cstar V-Mag;M;NGC;IC;Cstar Names;'
            'Identifiers;Common names;NED notes;OpenNGC notes;Sources')

M5007_CERO = -13.74   # punto cero de Jacoby (1989) para el flujo [OIII] 5007

# Un catálogo = un identificador en SIMBAD (tras "PN ") + su forma en V/84/main.
# 'clave' ordena la salida (numérica, no lexicográfica: "Abell 9" antes que
# "Abell 10"); 'nombre'/'common' son los que ve gen_nebulosas.py.
CATALOGOS = (
    dict(like='A66', v84=re.compile(r'^A\s*(\d+)$'),
         nombre=lambda i: 'Abell %s' % i, common=lambda i: 'PN A66 %s' % i,
         clave=lambda i: int(i)),
    dict(like='M ', v84=re.compile(r'^M\s*([\d-]+)$'),
         nombre=lambda i: 'M %s' % i, common=lambda i: 'PN M %s' % i,
         clave=lambda i: tuple(int(x) for x in i.split('-'))),
    # Jones (Jn) y Jones-Emberson (JnEr) son catálogos distintos que comparten
    # prefijo: 'JnEr' empieza por 'Jn', así que 'like' lleva el espacio literal
    # que solo sigue a "Jn" en solitario, no a "JnEr". Sin ese espacio, 'PN Jn%'
    # también engancharía JnEr 1. Solo 2 objetos en total (V/84), ambos fuera
    # de NGC/IC.
    dict(like='Jn ', v84=re.compile(r'^Jn\s+(\d+)$'),
         nombre=lambda i: 'Jn %s' % i, common=lambda i: 'PN Jn %s' % i,
         clave=lambda i: int(i)),
    dict(like='JnEr', v84=re.compile(r'^JnEr\s+(\d+)$'),
         nombre=lambda i: 'JnEr %s' % i, common=lambda i: 'PN JnEr %s' % i,
         clave=lambda i: int(i)),
)


def tap(query):
    url = SIMBAD_TAP + '?' + urllib.parse.urlencode(
        {'request': 'doQuery', 'lang': 'adql', 'format': 'json', 'query': query})
    with urllib.request.urlopen(url, timeout=60) as fh:
        return json.load(fh)['data']


def vizier(tabla):
    """Tabla completa de VizieR en TSV -> lista de dicts por nombre de columna."""
    url = VIZIER_ASU + '?' + urllib.parse.urlencode(
        {'-source': tabla, '-out.max': 2000, '-out.all': ''})
    with urllib.request.urlopen(url, timeout=120) as fh:
        crudo = fh.read().decode('utf-8', 'replace')
    lineas = [l for l in crudo.split('\n') if l and not l.startswith('#')]
    cols = lineas[0].split('\t')
    filas = []
    for l in lineas[2:]:                       # [1] es la regla de guiones
        v = l.split('\t')
        if len(v) == len(cols):
            filas.append({c: x.strip() for c, x in zip(cols, v)})
    return filas


def numero(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def sexa(deg, horas):
    v = (deg / 15.0) if horas else abs(deg)
    d = int(v); m = (v - d) * 60; mm = int(m); ss = (m - mm) * 60
    signo = '' if horas else ('-' if deg < 0 else '+')
    return '%s%02d:%02d:%05.2f' % (signo, d, mm, ss)


def main():
    # V/84 se descarga una vez: el namespace de PNG es común a los dos catálogos.
    v84_main = vizier('V/84/main')
    odiam = {f['PNG']: numero(f.get('oDiam')) for f in vizier('V/84/diam')}
    hbeta = {f['PNG']: numero(f.get('log(Fbeta)')) for f in vizier('V/84/hbeta')}
    i5007 = {}
    for f in vizier('V/84/intens'):
        v = numero(f.get('I5007'))
        if f.get('LineRef') == 'b' and v and v > 0:
            i5007.setdefault(f['PNG'], []).append(v)

    filas, saltados_ngc = [], 0
    for cat in CATALOGOS:
        # SIMBAD: identificadores de este catálogo con coordenadas, tamaño y
        # fotometría integrada.
        simbad = tap(
            "SELECT id, ra, dec, galdim_majaxis, galdim_minaxis, galdim_angle, V, B"
            " FROM ident JOIN basic ON ident.oidref = oid"
            " LEFT JOIN allfluxes ON allfluxes.oidref = oid"
            " WHERE id LIKE 'PN %s%%'" % cat['like'])
        # Los que además son NGC/IC ya vienen del OpenNGC: fuera.
        en_ngc = set()
        for (i2,) in tap(
                "SELECT i1.id FROM ident i1 JOIN ident i2 ON i1.oidref = i2.oidref"
                " WHERE i1.id LIKE 'PN %s%%' AND"
                " (i2.id LIKE 'NGC %%' OR i2.id LIKE 'IC %%')" % cat['like']):
            en_ngc.add(i2.split()[-1])

        # Qué identificadores son planetarias de verdad para Acker, y su PNG.
        png_de = {}
        for f in v84_main:
            m = cat['v84'].match(f.get('Name', '').strip())
            if m:
                png_de[m.group(1)] = f['PNG']

        for id_, ra, dec, maj, mnr, ang, v_mag, b_mag in sorted(
                simbad, key=lambda f: cat['clave'](f[0].split()[-1])):
            i = id_.split()[-1]
            if i not in png_de:
                continue                     # no-PN para Acker
            if i in en_ngc:
                saltados_ngc += 1
                continue                     # ya está por NGC/IC
            png = png_de[i]
            if maj is None and odiam.get(png):
                maj = odiam[png] / 60.0      # respaldo: diámetro óptico V/84, arcsec
                mnr = None
            if maj is None:
                continue                     # sin tamaño no hay perfil que pintar

            mag_v, mag_b = None, None
            if hbeta.get(png) is not None and i5007.get(png):
                f5007 = 10 ** hbeta[png] * statistics.median(i5007[png]) / 100.0
                mag_v = round(-2.5 * math.log10(f5007) + M5007_CERO, 2)
            elif v_mag is not None:
                mag_v = round(v_mag, 2)
            elif b_mag is not None:
                mag_b = round(b_mag, 2)

            pa = '' if (mnr is None or ang is None or maj == mnr) else '%d' % ang
            filas.append({'Name': cat['nombre'](i), 'Type': 'PN',
                          'RA': sexa(ra, True), 'Dec': sexa(dec, False),
                          'MajAx': '%.2f' % maj,
                          'MinAx': ('%.2f' % mnr) if mnr is not None else '',
                          'PosAng': pa,
                          'B-Mag': ('%.2f' % mag_b) if mag_b is not None else '',
                          'V-Mag': ('%.2f' % mag_v) if mag_v is not None else '',
                          'Common names': cat['common'](i),
                          'Sources': 'SIMBAD+V/84'})

    campos = CABECERA.split(';')
    with open(OUT, 'w', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=campos, delimiter=';')
        w.writeheader()
        for c in filas:
            w.writerow({k: c.get(k, '') for k in campos})

    # Autocomprobación: lo que puede salir mal en silencio.
    a12 = [c for c in filas if c['Name'] == 'Abell 12'][0]
    assert a12['V-Mag'] and 11.5 < float(a12['V-Mag']) < 13.5, a12   # ~12.5
    assert abs(numero(a12['MajAx']) - 0.62) < 0.1, a12               # 37"
    # M 1-79 sale por el flujo Acker (I5007 = 699, muy por encima de Hβ = 100),
    # no por la V cruda de SIMBAD (19,11): la línea manda cuando está medida,
    # como en Abell 21/35, donde la V cruda y la m5007 ya difieren 4 mag.
    m179 = [c for c in filas if c['Name'] == 'M 1-79'][0]
    assert m179['V-Mag'] and 8.0 < float(m179['V-Mag']) < 20.0, m179
    # Jn 1 y JnEr 1: el prefijo compartido no debe cruzar los dos catálogos.
    # Igual que M 1-79, si hay flujo Acker manda sobre la V cruda de SIMBAD
    # (aquí Jn 1 sale 13,24 contra los 15,62 de SIMBAD): no se fija la
    # aserción a la V cruda, solo a que exista y sea de PN, no de estelar.
    jn1 = [c for c in filas if c['Name'] == 'Jn 1'][0]
    assert jn1['V-Mag'] and 8.0 < float(jn1['V-Mag']) < 20.0, jn1
    jner1 = [c for c in filas if c['Name'] == 'JnEr 1'][0]
    assert jner1['V-Mag'] and 8.0 < float(jner1['V-Mag']) < 20.0, jner1
    con_mag = sum(1 for c in filas if c['V-Mag'] or c['B-Mag'])
    print('suplemento PN: %d filas (%d con magnitud, %d ya en NGC/IC saltadas)'
          % (len(filas), con_mag, saltados_ngc))
    print('->', OUT)


if __name__ == '__main__':
    main()
