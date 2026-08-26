# -*- coding: utf-8 -*-
"""Genera el suplemento Abell de planetarias (mapa/datos/abell_pn.csv).

Por qué existe: el catálogo de nebulosas sale del OpenNGC (NGC + IC) y las
planetarias de Abell (PN A66 NN) no son objetos NGC/IC, así que no tienen fila
y la capa difusa no las pinta (PN A66 12 fue el caso que lo destapó).

Fuentes, consultadas en vivo:
  · SIMBAD TAP — identificación, coordenadas J2000 y tamaño (galdim, arcmin),
    más V/B integradas cuando las tiene.
  · VizieR V/84 (Acker+, Strasbourg-ESO) — qué Abell son planetarias de verdad
    (la lista se filtra a las que Acker cataloga como "A NN"), el diámetro
    óptico de respaldo y, sobre todo, el flujo Hβ con las intensidades de línea.

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
para que gen_nebulosas.py lo lea con el mismo parser. Name = "Abell NN",
Common names = "PN A66 NN" (el buscador filtra por los dos). Los Abell que ya
son NGC/IC (p. ej. Abell 50 = NGC 6742) se saltan: ya tienen fila del OpenNGC.

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
    # SIMBAD: los 86 con coordenadas, tamaño y fotometría integrada.
    simbad = tap(
        "SELECT id, ra, dec, galdim_majaxis, galdim_minaxis, galdim_angle, V, B"
        " FROM ident JOIN basic ON ident.oidref = oid"
        " LEFT JOIN allfluxes ON allfluxes.oidref = oid"
        " WHERE id LIKE 'PN A66%'")
    # Los que además son NGC/IC ya vienen del OpenNGC: fuera.
    en_ngc = set()
    for (i2,) in tap(
            "SELECT i1.id FROM ident i1 JOIN ident i2 ON i1.oidref = i2.oidref"
            " WHERE i1.id LIKE 'PN A66%' AND"
            " (i2.id LIKE 'NGC %' OR i2.id LIKE 'IC %')"):
        en_ngc.add(int(i2.split()[-1]))

    # V/84: qué Abell son planetarias para Acker, y su PNG para los flujos.
    png_de = {}
    for f in vizier('V/84/main'):
        m = re.match(r'^A (\d+)$', f.get('Name', ''))
        if m:
            png_de[int(m.group(1))] = f['PNG']
    odiam = {f['PNG']: numero(f.get('oDiam')) for f in vizier('V/84/diam')}
    hbeta = {f['PNG']: numero(f.get('log(Fbeta)')) for f in vizier('V/84/hbeta')}
    i5007 = {}
    for f in vizier('V/84/intens'):
        v = numero(f.get('I5007'))
        if f.get('LineRef') == 'b' and v and v > 0:
            i5007.setdefault(f['PNG'], []).append(v)

    filas = []
    for id_, ra, dec, maj, mnr, ang, v_mag, b_mag in sorted(
            simbad, key=lambda f: int(f[0].split()[-1])):
        n = int(id_.split()[-1])
        if n not in png_de or n in en_ngc:
            continue                     # no-PN para Acker, o ya está por NGC/IC
        png = png_de[n]
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
        c = {'Name': 'Abell %d' % n, 'Type': 'PN',
             'RA': sexa(ra, True), 'Dec': sexa(dec, False),
             'MajAx': '%.2f' % maj,
             'MinAx': ('%.2f' % mnr) if mnr is not None else '',
             'PosAng': pa,
             'B-Mag': ('%.2f' % mag_b) if mag_b is not None else '',
             'V-Mag': ('%.2f' % mag_v) if mag_v is not None else '',
             'Common names': 'PN A66 %d' % n,
             'Sources': 'SIMBAD+V/84'}
        filas.append(c)

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
    assert not any(int(c['Name'].split()[1]) in en_ngc for c in filas)
    con_mag = sum(1 for c in filas if c['V-Mag'] or c['B-Mag'])
    print('abell: %d filas (%d con magnitud, %d ya en NGC/IC saltadas)'
          % (len(filas), con_mag, len(en_ngc)))
    print('->', OUT)


if __name__ == '__main__':
    main()
