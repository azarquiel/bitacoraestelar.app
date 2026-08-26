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
    'SELECT ra, dec, phot_g_mean_mag, bp_rp FROM gaiadr3.gaia_source '
    'WHERE phot_g_mean_mag < 10.5',
    maxrec=1000000)
gaia_ra = np.array([G._f(r[0]) for r in gaia_rows])
gaia_dec = np.array([G._f(r[1]) for r in gaia_rows])
gaia_g = np.array([G._f(r[2]) for r in gaia_rows])
gaia_bprp = np.array([float(r[3]) if r[3] != '' else np.nan for r in gaia_rows])
arbol = cKDTree(G._unit(gaia_ra, gaia_dec))
cuerda = 2 * np.sin(np.radians(G.RADIO_CRUCE_ARCSEC / 3600.0) / 2)
pos = G._unit(np.array([f['ra'] for f in filas]), np.array([f['dec'] for f in filas]))
dist, _ = arbol.query(pos, k=1)
assert (dist >= cuerda).all(), "hay filas con contrapartida Gaia dentro de 2\""

# 3) El acantilado en Hp≈3: la mayoría de los huecos caen por debajo de Hp 3,
#    y no aparece ninguno nuevo entre Hp 3 y Hp 4 (no es una pendiente).
bajo_3 = sum(1 for f in filas if f['mag'] < 3)
entre_3_4 = sum(1 for f in filas if 3 <= f['mag'] < 4)
assert bajo_3 > len(filas) * 0.6, "el acantilado no está por debajo de mag 3 (%d/%d)" % (bajo_3, len(filas))
# El acantilado es en Hp; la conversion a G (issue #131) desplaza UNA estrella
# justo por encima de 3. Mas de una significaria un hueco nuevo de verdad.
assert entre_3_4 <= 1, "hueco nuevo entre mag 3 y 4 (%d): no debería haberlo" % entre_3_4

# 4) Vega, Arturo y Rigel -los ejemplos citados en el ticket- están dentro.
ids = set(f['hip'] for f in filas)
for nombre, hip in [('Vega', '91262'), ('Arcturus', '69673'), ('Rigel', '24436')]:
    assert hip in ids, "%s (HIP %s) no está en el catálogo" % (nombre, hip)

# 5) Integridad de cada fila: magnitud en banda G y color BP-RP derivados de
#    la fotometria de Hipparcos (issue #131). El campo origen sigue fuera.
for f in filas:
    assert set(f.keys()) == {'hip', 'ra', 'dec', 'mag', 'bp_rp'}, f
    assert 0 <= f['ra'] < 360 and -90 <= f['dec'] <= 90, f
    assert f['bp_rp'] is None or -1.0 < f['bp_rp'] < 7.0, f
# Dos filas de Hipparcos vienen sin V-I: quedan con mag=Hp y SIN color, que
# es el trato honesto (no se inventa). Mas que esas dos = regresion.
sin_color = sum(1 for f in filas if f['bp_rp'] is None)
assert sin_color <= 2, 'filas sin color derivado: %d (esperadas 2)' % sin_color
# Vega es azul-blanca: su color derivado tiene que salir en torno a 0, no el
# tinte por defecto (1,4) ni blanco.
vega = [f for f in filas if f['hip'] == '91262'][0]
assert -0.3 < vega['bp_rp'] < 0.15, vega

# 6) El generador NO inventa color ni magnitud cuando le faltan los datos para
#    derivarlos (invariante heredado de test_par_doble.js, issue #131): sin
#    V-I, o con V-I fuera del rango publicado, no hay extrapolacion.
assert G.bprp_desde_vi(None) is None
assert G.bprp_desde_vi(-0.5) is None and G.bprp_desde_vi(5.1) is None
assert G.g_desde_v(None, 0.5) is None and G.g_desde_v(0.0, None) is None
assert G.g_desde_v(0.0, 5.1) is None
assert G._num('') is None and G._num('1.5') == 1.5

# 7) La conversion fotometrica, fijada contra su residuo conocido sobre los
#    pares de calibracion Hipparcos x Gaia (estrellas Hp<9 CON contrapartida
#    Gaia): un cambio de formula no puede pasar inadvertido (issue #131).
#    La propagacion de epoca se re-implementa aqui A PROPOSITO, igual que en
#    la comprobacion 2: independiente de construir(), para que un error en la
#    del generador no se auto-valide.
hip_rows = G._consulta(
    'SELECT ra, de, pmra, pmde, hpmag, vmag, v_i FROM public.hipparcos '
    'WHERE hpmag < 9', maxrec=200000)
hip_rows = [r for r in hip_rows if r[0] != '' and r[1] != '']
dt = 2016.0 - 1991.25
h_ra = np.array([G._f(r[0]) for r in hip_rows])
h_de = np.array([G._f(r[1]) for r in hip_rows])
h_ra = h_ra + (np.array([G._f(r[2]) for r in hip_rows]) / 1000.0 / 3600.0) * dt \
    / np.cos(np.radians(h_de))
h_de = h_de + (np.array([G._f(r[3]) for r in hip_rows]) / 1000.0 / 3600.0) * dt
d2, idx2 = arbol.query(G._unit(h_ra, h_de), k=1)
par = d2 < cuerda
g_pred = np.array([v if v is not None else np.nan
                   for v in (G.g_desde_v(G._num(r[5]), G._num(r[6])) for r in hip_rows)])
c_pred = np.array([v if v is not None else np.nan
                   for v in (G.bprp_desde_vi(G._num(r[6])) for r in hip_rows)])
ok = par & ~np.isnan(g_pred)
res = g_pred[ok] - gaia_g[idx2[ok]]
assert ok.sum() > 20000, 'pocos pares de calibracion: %d' % ok.sum()
med = np.median(res)
# Sigma ROBUSTA (MAD): la std plana sobre todos los pares sale ~0.12 por
# los outliers (variables, dobles no resueltas); el 0.023 del ticket solo
# es reproducible con un estimador robusto.
sigma = 1.4826 * np.median(np.abs(res - med))
assert abs(med - 0.007) <= 0.005, 'mediana del residuo G: %+.4f (esperada +0.007)' % med
assert abs(sigma - 0.023) <= 0.008, 'sigma del residuo G: %.4f (esperada 0.023)' % sigma
okc = ok & ~np.isnan(c_pred) & ~np.isnan(gaia_bprp[idx2])
sesgo = np.median(c_pred[okc] - gaia_bprp[idx2[okc]])
# El sesgo de -0.037 en el color es CONOCIDO y se deja sin corregir a
# proposito (issue #131): corregirlo seria ajustar a ojo justo lo que se
# decidio tomar publicado. Este assert lo documenta como esperado.
assert -0.055 <= sesgo <= -0.020, 'sesgo del color: %+.4f (esperado -0.037)' % sesgo

print("OK · %d estrellas · todas las comprobaciones pasan" % len(filas))
print("   mag<3: %d · mag[3,4): %d · mag[4,9): %d" % (
    bajo_3, entre_3_4, len(filas) - bajo_3 - entre_3_4))
