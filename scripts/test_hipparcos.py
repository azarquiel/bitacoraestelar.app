# -*- coding: utf-8 -*-
"""Self-check del catálogo de estrellas que Gaia DR3 no trae (scripts/gen_hipparcos.py).
   Sin framework. Requiere red (baja Hipparcos/Gaia del TAP).
   Ejecutar:  python3 scripts/test_hipparcos.py"""
import numpy as np
from scipy.spatial import cKDTree

import gen_hipparcos as G

filas = G.construir()

# 1) Del orden de 140 filas (un valor muy distinto significa que la
#    regeneración salió mal: ver ADR 0017).
assert 50 <= len(filas) <= 250, "orden de magnitud roto: %d filas" % len(filas)

# 2) Ninguna fila tiene contrapartida Gaia dentro del radio de cruce: es la
#    definición del fichero. Se re-verifica aquí, independiente de construir().
gaia_rows = G._consulta(
    'SELECT ra, dec FROM gaiadr3.gaia_source WHERE phot_g_mean_mag < 10.5',
    maxrec=1000000)
gaia_ra = np.array([G._f(r[0]) for r in gaia_rows])
gaia_dec = np.array([G._f(r[1]) for r in gaia_rows])
arbol = cKDTree(G._unit(gaia_ra, gaia_dec))
cuerda = 2 * np.sin(np.radians(G.RADIO_CRUCE_ARCSEC / 3600.0) / 2)
pos = G._unit(np.array([f['ra'] for f in filas]), np.array([f['dec'] for f in filas]))
dist, _ = arbol.query(pos, k=1)
assert (dist >= cuerda).all(), "hay filas con contrapartida Gaia dentro de 2\""

# 3) El acantilado en Hp≈3: la mayoría de los huecos caen por debajo de Hp 3,
#    y no aparece ninguno nuevo entre Hp 3 y Hp 4 (no es una pendiente).
bajo_3 = sum(1 for f in filas if f['mag'] < 3)
entre_3_4 = sum(1 for f in filas if 3 <= f['mag'] < 4)
assert bajo_3 > len(filas) * 0.6, "el acantilado no está por debajo de Hp 3 (%d/%d)" % (bajo_3, len(filas))
assert entre_3_4 == 0, "hueco nuevo entre Hp 3 y Hp 4 (%d): no debería haberlo" % entre_3_4

# 4) Vega, Arturo y Rigel -los ejemplos citados en el ticket- están dentro.
ids = set(f['hip'] for f in filas)
for nombre, hip in [('Vega', '91262'), ('Arcturus', '69673'), ('Rigel', '24436')]:
    assert hip in ids, "%s (HIP %s) no está en el catálogo" % (nombre, hip)

# 5) Integridad de cada fila: sin color ni campo origen (fuera de este ticket).
for f in filas:
    assert set(f.keys()) == {'hip', 'ra', 'dec', 'mag'}, f
    assert 0 <= f['ra'] < 360 and -90 <= f['dec'] <= 90, f

print("OK · %d estrellas · todas las comprobaciones pasan" % len(filas))
print("   Hp<3: %d · Hp[3,4): %d · Hp[4,9): %d" % (
    bajo_3, entre_3_4, len(filas) - bajo_3 - entre_3_4))
