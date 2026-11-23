#!/usr/bin/env python3
"""#611 · Indicadores de fuente no única del fixture de M13 (Gaia DR3).

Criterio de fuente única de Fabricius et al. 2021 (A&A 649, A5, §3.3), la
misma fuente que ancla la completitud del núcleo (#595):

    ruwe < 1,4  y  ipd_frac_multi_peak ≤ 2  y  ipd_gof_harmonic_amplitude < 0,1

Una fila que no lo cumple es MEZCLA (ADR 0039, «Filas mezcladas del núcleo»).
Sin astrometría de 5/6 parámetros (ruwe nulo) tampoco lo cumple: más de la
mitad de esas soluciones a G < 19 se deben a una vecina (Fabricius et al.
2021, §2.6).

Cruce por posición con m13_gaia_dr3.csv (la misma tabla, gaiadr3.gaia_source,
y el mismo corte G ≤ 18,5): se casa la fila de Gaia más cercana a < 0,05″.

Salida: simulador_ocular/docs/validacion/m13_gaia_dr3_mezcla.csv con ra,dec
tal cual están en el fixture (para cruzar por texto) y las tres columnas.

python3 scripts/gen_m13_mezcla.py [ruta/respuesta_tap.csv]
(sin ruta, consulta el TAP de ESA; con ruta, lee una respuesta ya bajada de
esa misma consulta, con las columnas ra, dec y las tres de arriba)
"""
import csv
import io
import math
import os
import sys
import urllib.parse
import urllib.request

TAP = 'https://gea.esac.esa.int/tap-server/tap/sync'
AQUI = os.path.dirname(os.path.abspath(__file__))
VAL = os.path.join(AQUI, '..', 'simulador_ocular', 'docs', 'validacion')
FIXTURE = os.path.join(VAL, 'm13_gaia_dr3.csv')
SALIDA = os.path.join(VAL, 'm13_gaia_dr3_mezcla.csv')
COLS = ['ruwe', 'ipd_frac_multi_peak', 'ipd_gof_harmonic_amplitude']
TOL_AS = 0.05


def main():
    filas = [l.split(',') for l in open(FIXTURE).read().strip().split('\n')[1:]]
    ras = [float(c[0]) for c in filas]
    decs = [float(c[1]) for c in filas]
    adql = ('SELECT ra, dec, ' + ', '.join(COLS) + ' FROM gaiadr3.gaia_source'
            ' WHERE ra BETWEEN %.4f AND %.4f AND dec BETWEEN %.4f AND %.4f'
            ' AND phot_g_mean_mag <= 18.5' % (min(ras) - 1e-3, max(ras) + 1e-3,
                                              min(decs) - 1e-3, max(decs) + 1e-3))
    if len(sys.argv) > 1:
        texto = open(sys.argv[1]).read()
    else:
        datos = urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL',
                                        'FORMAT': 'csv', 'QUERY': adql}).encode()
        with urllib.request.urlopen(TAP, datos, timeout=600) as r:
            texto = r.read().decode()
    gaia = list(csv.DictReader(io.StringIO(texto)))
    rejilla = {}
    for g in gaia:
        rejilla.setdefault((round(float(g['ra']) * 1000), round(float(g['dec']) * 1000)), []).append(g)

    out = ['ra,dec,' + ','.join(COLS)]
    for c, ra, dec in zip(filas, ras, decs):
        mejor, dmin = None, TOL_AS
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for g in rejilla.get((round(ra * 1000) + di, round(dec * 1000) + dj), []):
                    d = math.hypot((float(g['ra']) - ra) * math.cos(math.radians(dec)),
                                   float(g['dec']) - dec) * 3600
                    if d < dmin:
                        mejor, dmin = g, d
        if mejor is None:
            raise SystemExit('sin pareja en Gaia DR3: %s,%s' % (c[0], c[1]))
        out.append(','.join([c[0], c[1]] + [mejor[k] for k in COLS]))
    open(SALIDA, 'w').write('\n'.join(out) + '\n')
    print('%d filas -> %s' % (len(out) - 1, SALIDA))


if __name__ == '__main__':
    main()
