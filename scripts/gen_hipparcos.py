# -*- coding: utf-8 -*-
"""Genera el catálogo de estrellas que Gaia DR3 no trae (bala trazadora, ticket #130).

Gaia DR3 satura por arriba: Vega, Arturo, Rigel... no aparecen. El agujero es
instrumental (saturación/gating), no algo que DR4 vaya a cerrar solo.

Método (issue #130):
  1. Baja Hipparcos (Hp<9) y Gaia (G<10,5) del TAP de Gaia.
  2. Propaga la posición de Hipparcos de su época (J1991.25) a la de Gaia
     (2016.0) con su movimiento propio.
  3. Cruza EN LOCAL con un árbol KD sobre coordenadas cartesianas de la esfera
     unidad, radio 2″. Una estrella «falta» cuando no hay ninguna fuente Gaia
     dentro de ese radio — binario, sin umbral de magnitud.

El cruce NO se hace por TAP: un NOT EXISTS correlacionado no termina ni en el
endpoint async (medido: >50 min contra un tope de servidor de 2 h). En local
tarda segundos. Tampoco se usa la tabla de vecinos precalculada de Gaia: su
incompletitud hace creer que falta el 16 % cuando la ausencia real es el 0,2 %.

Deliberadamente fuera de este ticket (#131 lo recoge):
  - la magnitud entra tal cual como Hp (sin convertir a G);
  - sin color;
  - sin expandir sistemas cerrados en sus componentes;
  - sin campo `origen`.

Nota sobre el tamaño: con este alcance (sin expandir sistemas cerrados en
componentes del WDS) el catálogo sale en 89 filas, no en las ~140 que se citan
como orden de magnitud del proyecto completo (#129) — esas 140 son 89
medidas + las derivadas/asumidas de expandir sistemas dobles, que es trabajo
de un ticket posterior. 89 es del mismo orden de magnitud y reproduce el
acantilado de Hp≈3 (ver test_hipparcos.py), que es lo que este ticket pide
comprobar.

Salida:
  simulador_ocular/resources/js/estrellas-brillantes-datos.js
  (window.BITACORA_ESTRELLAS_BRILLANTES = [[ra, dec, mag], ...])

Uso:  python3 scripts/gen_hipparcos.py
"""
import io
import os
import urllib.parse
import urllib.request

import numpy as np
from scipy.spatial import cKDTree

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'estrellas-brillantes-datos.js')

TAP = 'https://gea.esac.esa.int/tap-server/tap/sync'
EPOCA_HIP = 1991.25
EPOCA_GAIA = 2016.0
RADIO_CRUCE_ARCSEC = 2.0


def _consulta(adql, maxrec):
    data = urllib.parse.urlencode({
        'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv',
        'QUERY': adql, 'MAXREC': str(maxrec),
    }).encode()
    with urllib.request.urlopen(TAP, data=data, timeout=180) as r:
        texto = r.read().decode('utf-8')
    filas = texto.splitlines()[1:]
    return [f.split(',') for f in filas if f]


def _f(v):
    return float(v) if v != '' else 0.0


def _unit(ra_deg, dec_deg):
    ra = np.radians(ra_deg)
    de = np.radians(dec_deg)
    return np.column_stack([np.cos(de) * np.cos(ra), np.cos(de) * np.sin(ra), np.sin(de)])


def construir():
    hip_rows = _consulta(
        'SELECT hip, ra, de, pmra, pmde, hpmag FROM public.hipparcos WHERE hpmag < 9',
        maxrec=200000)
    gaia_rows = _consulta(
        'SELECT source_id, ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source '
        'WHERE phot_g_mean_mag < 10.5',
        maxrec=1000000)

    # Sin solución astrométrica (ra/de en blanco) no se puede propagar ni cruzar.
    hip_rows = [r for r in hip_rows if r[1] != '' and r[2] != '']

    dt = EPOCA_GAIA - EPOCA_HIP
    hip_ra = np.array([_f(r[1]) for r in hip_rows])
    hip_de = np.array([_f(r[2]) for r in hip_rows])
    hip_pmra = np.array([_f(r[3]) for r in hip_rows])
    hip_pmde = np.array([_f(r[4]) for r in hip_rows])
    hip_mag = np.array([_f(r[5]) for r in hip_rows])
    cosd = np.cos(np.radians(hip_de))
    hip_ra_2016 = hip_ra + (hip_pmra / 1000.0 / 3600.0) * dt / cosd
    hip_de_2016 = hip_de + (hip_pmde / 1000.0 / 3600.0) * dt

    gaia_ra = np.array([_f(r[1]) for r in gaia_rows])
    gaia_de = np.array([_f(r[2]) for r in gaia_rows])

    arbol = cKDTree(_unit(gaia_ra, gaia_de))
    cuerda = 2 * np.sin(np.radians(RADIO_CRUCE_ARCSEC / 3600.0) / 2)
    dist, _ = arbol.query(_unit(hip_ra_2016, hip_de_2016), k=1)
    falta = dist >= cuerda

    filas = []
    for i in np.where(falta)[0]:
        filas.append({
            'hip': hip_rows[i][0],
            'ra': hip_ra_2016[i],
            'dec': hip_de_2016[i],
            'mag': hip_mag[i],
        })
    filas.sort(key=lambda f: f['mag'])
    return filas


def js_num(x):
    return ('%.6f' % x).rstrip('0').rstrip('.')


def escribir_js(filas):
    with io.open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Estrellas que Gaia DR3 no trae — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_hipparcos.py\n')
        fh.write('   Fuente: public.hipparcos (Hp<9) cruzado en local contra\n')
        fh.write('   gaiadr3.gaia_source (G<10,5), TAP de Gaia. Posición propagada de\n')
        fh.write('   J1991.25 a 2016.0 con movimiento propio; "falta" = cero fuentes\n')
        fh.write('   Gaia dentro de 2″. Ver issue #130 (azarquiel/bitacoraestelar.app).\n')
        fh.write('   Magnitud = Hp de Hipparcos, sin convertir a G (ticket #131).\n')
        fh.write('   Campos: [RA°, Dec°, Hp]. Se concatena tal cual a la muestra de\n')
        fh.write('   Gaia en dibujar() de bitacora-gaia-render.js. */\n')
        fh.write('window.BITACORA_ESTRELLAS_BRILLANTES = [\n')
        for f in filas:
            fh.write('  [%s, %s, %s],\n' % (js_num(f['ra']), js_num(f['dec']), js_num(f['mag'])))
        fh.write('];\n')
    print('->', OUT_JS)


if __name__ == '__main__':
    filas = construir()
    escribir_js(filas)
    print('%d filas · fuente: Hipparcos 100%%' % len(filas))
    for lo, hi in [(None, 3), (3, 4), (4, 9)]:
        n = sum(1 for f in filas if f['mag'] < hi and (lo is None or f['mag'] >= lo))
        print('  Hp [%s,%d): %d' % (lo if lo is not None else '-inf', hi, n))
