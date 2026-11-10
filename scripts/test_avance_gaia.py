# -*- coding: utf-8 -*-
"""Test del generador del Avance de Gaia (scripts/gen_avance_gaia.py, #516,
ADR 0033). Sin red y sin framework: los jobs TAP se sustituyen por un falso.

Lo que fija, por criterio de aceptación:
  AC 1  la suma de los histogramas G < 15 de la cabecera es el nº de filas, y
        la generación escribe TODAS las celdas del nivel.
  AC 2  cada estrella va a la celda de su (ra, dec) guardada, no a la de su
        source_id; HEALPix contrastado con ivo_healpix_index de GAVO.
  AC 3  una celda sin estrellas tiene fichero, 0 filas y su histograma.
  AC 5  reanudar salta lo verificado y rebaja lo corrupto; nunca > 2 jobs.
  AC 6  el .htaccess de avance/ sirve los .bin inmutables y octet-stream, y
        el manifiesto no.
Ejecutar:  python3 scripts/test_avance_gaia.py"""
import json
import os
import random
import shutil
import sys
import tempfile
import threading
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_avance_gaia as G  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
fallos = 0


def ok(cond, etiqueta):
    global fallos
    print(('  ok    ' if cond else '  FALLA ') + etiqueta)
    if not cond:
        fallos += 1


def tmpdir():
    d = tempfile.mkdtemp(prefix='avance_test_')
    return d


# ─── HEALPix: oráculo independiente (GAVO) ───
print('HEALPix nested contra ivo_healpix_index de GAVO:')
with open(os.path.join(AQUI, 'fixtures', 'gaia', 'avance_healpix_oraculo.json')) as fh:
    pts = np.array(json.load(fh)['puntos'], dtype=object)
ra = pts[:, 0].astype(float)
dec = pts[:, 1].astype(float)
esperado = pts[:, 2].astype(np.int64)
sid = np.array([int(x) for x in pts[:, 3]], dtype=np.int64)
obt = G.ang2pix_nest(6, ra, dec)
ok(np.array_equal(obt, esperado), '%d puntos, todas las caras: %d discrepan' % (len(ra), (obt != esperado).sum()))
borde = G.celda_de_source_id(sid) != esperado
ok(borde.sum() >= 20, 'el oráculo trae estrellas de borde (source_id en la celda vecina): %d' % borde.sum())
ok(np.array_equal(obt[borde], esperado[borde]), 'las de borde también cuadran')
ok(set(np.unique(esperado // 4096).tolist()) == set(range(12)), 'el oráculo cubre las 12 caras')
# Coherencia de niveles: el padre de la celda de nivel 6 es la de nivel 4.
ok(np.array_equal(G.ang2pix_nest(4, ra, dec), obt >> 4), 'nivel 4 = nivel 6 >> 4')
# Polos y costura ra 0/360.
ok(G.ang2pix_nest(6, 0.0, 90.0) < 4 * 4096 and G.ang2pix_nest(6, 0.0, -90.0) >= 8 * 4096, 'polos en sus caras')
ok(G.ang2pix_nest(6, 360.0, 10.0) == G.ang2pix_nest(6, 0.0, 10.0), 'ra 360 ≡ ra 0')

print('Rango de source_id:')
lo, hi = G.rango_source_id(6, 12345)
ok(G.celda_de_source_id(lo) == 12345 and G.celda_de_source_id(hi) == 12345
   and G.celda_de_source_id(hi + 1) == 12346, 'los extremos del rango caen en su celda')
ok(G.rango_source_id(4, 7) == (G.rango_source_id(6, 7 * 16)[0], G.rango_source_id(6, 7 * 16 + 15)[1]),
   'un lote de nivel 4 son 16 celdas contiguas de nivel 6')

# ─── Codificación ───
print('Codificación de filas (12 B):')
rng = np.random.default_rng(516)
n = 5000
r_ra = rng.uniform(0, 360, n)
r_dec = np.degrees(np.arcsin(rng.uniform(-1, 1, n)))
r_g = rng.uniform(0, 15, n)
r_g[:3] = [14.9996, 14.99999, 0.0]
r_c = rng.uniform(-0.5, 5, n)
r_c[5] = np.nan
f = G.codificar_filas(r_ra, r_dec, r_g, r_c)
ok(f.itemsize == 12, 'una fila son 12 B')
d = G.decodificar_filas(f)
err = G.distancia_angular(r_ra, r_dec, d['ra'], d['dec']) * 3600
ok(err.max() < 0.08, 'error de posición < 0,08″ (máx %.3f″)' % err.max())
ok(f['g'].max() < 15000 and f['g'][0] == 14999 and f['g'][1] == 14999, 'G con floor: 14,9996 → 14999, nunca cruza G 15')
ok(np.all(np.abs(d['g'] - r_g) < 0.001) and np.all(d['g'] <= r_g + 1e-12), 'G con error < 0,001 y por debajo')
ok(f['bprp'][5] == G.CENTINELA_BPRP and np.isnan(d['bprp'][5]), 'BP−RP nulo → centinela → NaN')
m = np.isfinite(r_c)
ok(np.all(np.abs(d['bprp'][m] - r_c[m]) <= 0.0005 + 1e-9), 'BP−RP con error ≤ 0,0005')
try:
    G.codificar_filas([1.0], [1.0], [15.0], [0.0])
    ok(False, 'G = 15 se rechaza')
except ValueError:
    ok(True, 'G = 15 se rechaza (frontera: es del complemento débil)')
ok(G.codificar_filas([359.999999999], [0.0], [5.0], [0.0])['ra'][0] < 360, 'ra no se guarda como 360')

# ─── Cabecera, celdas vacías (AC 3) ───
print('Fichero de celda:')
hist_sid = list(range(G.NTRAMOS))
datos = G.bytes_celda(6, 777, f[:0], G.histograma_celda(f[:0], hist_sid))
c = G.leer_celda(datos)
ok(len(datos) == G.TAM_CABECERA == 188 and c['n'] == 0 and c['ipix'] == 777, 'AC 3: celda vacía = cabecera de 188 B y 0 filas')
ok(c['hist'][:30].sum() == 0 and list(c['hist'][30:]) == hist_sid[30:], 'AC 3: la vacía trae su histograma (tramos ≥ 15)')
datos = G.bytes_celda(6, 9, f, G.histograma_celda(f, hist_sid))
c = G.leer_celda(datos)
ok(c['n'] == n and c['hist'][:30].sum() == n, 'AC 1: tramos < 15 de la cabecera suman las filas')
ok(np.all(np.diff(c['filas']['g'].astype(int)) >= 0), 'filas ordenadas por G (las brillantes primero)')
for corte, et in ((datos[:-1], 'truncada'), (b'XXXX' + datos[4:], 'firma ajena')):
    try:
        G.leer_celda(corte)
        ok(False, 'rechaza celda ' + et)
    except ValueError:
        ok(True, 'rechaza celda ' + et)

# ─── AC 2: reparto por posición ───
print('Reparto por posición (AC 2):')
sal = tmpdir()
try:
    # Estrellas del oráculo de borde: source_id en una celda, posición en otra.
    fb = G.codificar_filas(ra[borde], dec[borde], np.full(borde.sum(), 10.0), np.zeros(borde.sum()))
    destino = G.celda_de_filas(fb)
    celdas = sorted(set(destino.tolist()) | set(G.celda_de_source_id(sid[borde]).tolist()))
    G.escribir_celdas(sal, fb, {}, solo=celdas)
    en_pos = sum(G.leer_celda(open(G.ruta_celda(sal, x), 'rb').read())['n'] for x in set(destino.tolist()))
    ok(en_pos == borde.sum(), 'las %d de borde están en la celda de su posición, no en la de su source_id' % borde.sum())
    # Muestra: cada fila leída de un fichero recalcula a ese fichero.
    G.escribir_celdas(sal, f, {}, solo=sorted(set(G.celda_de_filas(f).tolist())))
    mal = 0
    for x in sorted(set(G.celda_de_filas(f).tolist()))[:400]:
        cc = G.leer_celda(open(G.ruta_celda(sal, x), 'rb').read())
        mal += int(np.sum(G.celda_de_filas(cc['filas']) != x))
    ok(mal == 0, 'muestra de 400 celdas: toda fila recalcula a su fichero (%d no)' % mal)
finally:
    shutil.rmtree(sal)

# ─── AC 1 y 3: la escritura cubre TODAS las celdas (nivel 2 = 192 en el test) ───
print('Escritura completa (AC 1 y 3) en nivel 2:')
sal = tmpdir()
try:
    pocas = f[:50]
    esc, salt, total = G.escribir_celdas(sal, pocas, {}, nivel=2)
    v = G.verificar_salida(sal, nivel=2)
    ok(esc == 192 and not v['faltan'] and not v['malas'], 'escribe las 192 celdas, también las vacías')
    ok(v['filas'] == 50 and v['hist15'] == 50 and v['vacias'] == 192 - len(set(G.celda_de_filas(pocas, 2).tolist())),
       'suma de filas = suma de histogramas G < 15 = filas de entrada')
    esc, salt, _ = G.escribir_celdas(sal, pocas, {}, nivel=2)
    ok(esc == 0 and salt == 192, 'relanzar no reescribe celdas idénticas (%d escritas, %d saltadas)' % (esc, salt))
    os.remove(G.ruta_celda(sal, 5, 2))
    ok(G.verificar_salida(sal, nivel=2)['faltan'] == [5], 'verificar detecta una celda que falta')
finally:
    shutil.rmtree(sal)

# ─── Lotes: completitud contra el histograma ───
print('Verificación de lotes:')
celdas_lote = list(G.celdas_hijas(4, 3))
sids = np.array([G.rango_source_id(6, celdas_lote[0])[0] + 5, G.rango_source_id(6, celdas_lote[2])[0] + 9])
hists = {celdas_lote[0]: [0] * 20 + [1] + [0] * 21, celdas_lote[2]: [0] * 29 + [1] + [0] * 12}
ok(G.comprobar_lote(sids, hists, celdas_lote) is None, 'lote que cuadra con el GROUP BY')
ok(G.comprobar_lote(sids[:1], hists, celdas_lote) is not None, 'falta una fila → incompleto')
ok(G.comprobar_lote(sids, hists, celdas_lote, nfilas_maxrec=2) is not None, 'filas == MAXREC → posible recorte')
ok(G.comprobar_lote(np.array([0]), hists, celdas_lote) is not None, 'fila de otro lote → rechazo')
ok(G.comprobar_lote(sids, {**hists, celdas_lote[0]: [0] * 30 + [7] * 12}, celdas_lote) is not None,
   'los tramos ≥ 15 del histograma no cuentan como filas del Avance')

# ─── AC 5: reanudar y concurrencia ───
print('Reanudación y concurrencia (AC 5):')
trab = tmpdir()
try:
    lote = 3
    region = lote // 4 ** (G.NIVEL_LOTE - G.NIVEL_HIST)
    llamadas = []
    # Un lote falso: 3 estrellas en la primera celda de nivel 6 del lote.
    c0 = G.celdas_hijas(4, lote)[0]
    s0 = G.rango_source_id(6, c0)[0]
    p_ra, p_dec = 46.0, 3.0

    def tap_falso(adql, maxrec):
        llamadas.append(adql)
        if 'GROUP BY' in adql:
            return [['ipix', 't', 'n'], [str(c0), '20.0', '3'], [str(c0), '35.0', '100'], [str(c0), '', '4']]
        return [['source_id', 'ra', 'dec', 'g', 'bprp']] + [
            [str(s0 + i), str(p_ra + i * 1e-3), str(p_dec), '10.%d' % i, '' if i == 1 else '0.5'] for i in range(3)]

    ok(G.bajar_hist(trab, region, tap_falso) == 'bajada', 'histograma bajado')
    ok(G.bajar_hist(trab, region, tap_falso) == 'saltada', 'histograma ya verificado → se salta')
    h = G.cargar_hists(trab, [region])
    ok(h[c0][20] == 3 and h[c0][35] == 100 and sum(h[c0]) == 103, 'G nula fuera del histograma')
    ok(G.bajar_lote(trab, lote, h, tap_falso).startswith('bajado'), 'lote bajado y verificado')
    n_antes = len(llamadas)
    ok(G.bajar_lote(trab, lote, h, tap_falso) == 'saltado' and len(llamadas) == n_antes,
       'relanzar: el lote verificado se salta sin tocar GAVO')
    with open(G.ruta_lote(trab, lote), 'r+b') as fh:
        fh.truncate(40)
    ok(G.bajar_lote(trab, lote, h, tap_falso).startswith('bajado'), 'lote corrupto → se vuelve a bajar')
    os.remove(G.ruta_hist(trab, region))
    with open(G.ruta_hist(trab, region), 'w') as fh:
        fh.write('{"region": %d, "hist": {}}' % region)   # sin «completo»
    ok(G.leer_hist(trab, region) is None, 'histograma a medias no cuenta como verificado')

    # Región que no cabe en un job (plano galáctico): se parte en 4 de nivel 3.
    pedidas = []

    def tap_partido(adql, maxrec):
        pedidas.append(adql)
        if len(pedidas) == 1:
            raise G.JobFallido('job ERROR: execution time exceeded')
        return tap_falso(adql, maxrec) if len(pedidas) == 2 else [['ipix', 't', 'n']]
    os.remove(G.ruta_hist(trab, region))
    ok(G.bajar_hist(trab, region, tap_partido) == 'bajada' and len(pedidas) == 5,
       'job fallido → la región se parte en 4 hijas (5 jobs en serie)')
    lo3, hi3 = G.rango_source_id(3, region * 4)
    ok('BETWEEN %d AND %d' % (lo3, hi3) in pedidas[1], '… con el rango de source_id de la hija de nivel 3')
    ok(G.leer_hist(trab, region)[c0][20] == 3, '… y el histograma resultante es el mismo')

    def tap_corto(adql, maxrec):
        filas = tap_falso(adql, maxrec)
        return filas[:-1] if 'GROUP BY' not in adql else filas
    G.bajar_hist(trab, region, tap_falso)
    os.remove(G.ruta_lote(trab, lote))
    try:
        G.bajar_lote(trab, lote, h, tap_corto)
        ok(False, 'lote que no cuadra se rechaza')
    except RuntimeError:
        ok(True, 'lote que no cuadra se rechaza y no se guarda')
    ok(not os.path.exists(G.ruta_lote(trab, lote)), '… y no deja fichero')
finally:
    shutil.rmtree(trab)

activos, pico, cerrojo = [0], [0], threading.Lock()


def trabajo(t):
    with cerrojo:
        activos[0] += 1
        pico[0] = max(pico[0], activos[0])
    time.sleep(0.01 * random.random())
    with cerrojo:
        activos[0] -= 1
    return t


res = G.en_paralelo(trabajo, range(40))
ok(pico[0] <= 2 and len(res) == 40, 'nunca más de 2 jobs a la vez (pico %d)' % pico[0])
ok(G.MAX_JOBS_GAVO == 2, 'el tope es una constante: 2')
try:
    G.en_paralelo(trabajo, [1], max_jobs=3)
    ok(False, 'pedir 3 jobs se rechaza')
except ValueError:
    ok(True, 'pedir 3 jobs se rechaza')

# ─── Campos de control: geometría de lotes ───
print('Celdas de un cono:')
for nombre, (cra, cdec) in G.CAMPOS.items():
    cs = set(G.celdas_del_cono(cra, cdec, G.RADIO_CONTROL))
    # Puntos del borde del cono deben caer en celdas enumeradas.
    ang = np.linspace(0, 2 * np.pi, 720)
    bra = cra + G.RADIO_CONTROL * 0.999 * np.cos(ang) / np.cos(np.radians(cdec))
    bdec = cdec + G.RADIO_CONTROL * 0.999 * np.sin(ang)
    ok(set(G.ang2pix_nest(6, bra, bdec).tolist()) <= cs, '%s: el borde del cono cae en sus %d celdas' % (nombre, len(cs)))
lotes, celdas = G.lotes_de_campos(['polo'])
ok(set(x >> 4 for x in celdas) <= set(lotes), 'los lotes cubren las celdas del campo')

# ─── Manifiesto y .htaccess (AC 6) ───
print('Manifiesto y .htaccess:')
mf = G.manifiesto(36897335)
ok(mf['nivel'] == 6 and mf['frontera'] == 15.0 and mf['catalogo'] == 'Gaia DR3' and mf['filas'] == 36897335
   and mf['celdas'] == 49152 and 'fecha' in mf and 'version' in mf, 'manifiesto: versión, catálogo, nivel, frontera, filas, fecha')
hta = open(os.path.join(os.path.dirname(AQUI), 'simulador_ocular', 'avance', '.htaccess')).read()
ok('public, max-age=31536000, immutable' in hta and 'application/octet-stream' in hta, '.htaccess: immutable y octet-stream')
ok('\\.bin$' in hta and 'manifiesto' in hta, '.htaccess: immutable solo para *.bin; el manifiesto se revalida')
ok(os.path.basename(G.SALIDA) == 'avance' and 'cache_gaia' not in G.SALIDA, 'AC 6: el Avance vive fuera de cache_gaia/')
ok(not G.ruta_celda(G.SALIDA, 1).endswith('.json.gz'), 'AC 6: una celda no casa con *.json.gz')

print('\n%s' % ('TODO OK' if fallos == 0 else '%d FALLOS' % fallos))
sys.exit(1 if fallos else 0)
