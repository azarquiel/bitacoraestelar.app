# -*- coding: utf-8 -*-
"""Test del generador del banco del globular (scripts/gen_banco_globulares.py,
#583, ADR 0041). Sin red: los jobs TAP y el zip de VB21 son de mentira.

Fija:
  · la marca de campo es la regla de la nota (y la de gen_m13_pertenencia.py);
    una fuente sin fila en VB21 es miembro;
  · el fichero va ordenado por G, con la marca en el bit alto, y su
    histograma suma las filas (el cliente pide por Range con él);
  · la descarga por celdas de source_id: una celda que toca MAXREC o que
    GAVO corta por tiempo se parte en sus 4 hijas, sin duplicados ni huecos;
  · el total tiene que ser el COUNT del oráculo, o no se escribe nada;
  · reanudar no repite celdas ya bajadas;
  · --validar (criterio 6): filas = COUNT del oráculo, radio de VB21 escrito,
    densidad de campo plana; el caso malo (campo sin exigir astrometría
    limpia, ~47× en M13) no pasa.
Ejecutar:  python3 scripts/test_banco_globulares.py"""
import os
import shutil
import sys
import tempfile
import zipfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_banco_globulares as B  # noqa: E402

fallos = 0


def ok(cond, etiqueta):
    global fallos
    print(('  ok    ' if cond else '  FALLA ') + etiqueta)
    if not cond:
        fallos += 1


print('Regla de pertenencia:')
p = np.array([0.1, 0.1, 0.1, 0.9, 0.49])
q = np.array([2, 0, 0, 2, 3])
g = np.array([15.0, 15.0, 12.0, 15.0, 18.0])
ok(B.es_campo(p, q, g).tolist() == [True, False, True, False, True],
   'p < 0,5 y (limpia o G < 13); limpia = bit 2 de qflag')

# ── Un globular de mentira: 2000 estrellas hasta 1° ──
rng = np.random.default_rng(1)
G = {'id': 'NGC 9999', 'ra': 250.0, 'dec': 30.0, 'rh': 5.0, 'vb21': 'NGC_9999'}
N = 2000
r = 1.0 * np.sqrt(rng.random(N))
th = 2 * np.pi * rng.random(N)
ra = G['ra'] + r * np.cos(th) / np.cos(np.radians(G['dec']))
dec = G['dec'] + r * np.sin(th)
# source_id como el de Gaia: celda HEALPix 12 de la posición × 2^35 + contador.
sid = B.av.ang2pix_nest(12, ra, dec).astype(np.int64) * B.av.P235 + np.arange(N)
gm = np.round(10 + 9.9 * rng.random(N), 4)
bprp = np.where(rng.random(N) < 0.1, np.nan, np.round(rng.random(N) * 2, 3))
# astrometric_params_solved (#623): 3 = 2p, 31 = 5p, 95 = 6p; un tercio de 2p.
sol = rng.choice([3, 31, 95], N)
# VB21 solo cubre 0,9°; de campo: una de cada 10 de las que cubre.
cubre = r < 0.9
campo_vb = np.zeros(N, bool)
campo_vb[np.flatnonzero(cubre)[::10]] = True


def zip_vb21(d):
    ruta = os.path.join(d, 'clusters.zip')
    lineas = ['# source_id ra dec x y plx pmra pmdec plxe pmrae pmdece pmcorr g_mag bp_rp Sigma qflag memberprob']
    for k in np.flatnonzero(cubre):
        x = (ra[k] - G['ra']) * np.cos(np.radians(G['dec']))
        y = dec[k] - G['dec']
        lineas.append('%d %f %f %f %f 0 0 0 0 0 0 0 %f 0 0 %d %f'
                      % (sid[k], ra[k], dec[k], x, y, gm[k], 2, 0.1 if campo_vb[k] else 0.9))
    with zipfile.ZipFile(ruta, 'w') as z:
        z.writestr('catalogues/NGC_9999.txt', '\n'.join(lineas) + '\n')
    return ruta


LLAMADAS = []
CONSULTAS = []


def tap_falso(plazo_nivel=None, perder=0):
    """GAVO síncrono de mentira: filtra por el rango de source_id y respeta
    MAXREC. `plazo_nivel`: corta por tiempo las celdas de ese nivel.
    `perder`: se come filas (para el control del COUNT)."""
    def tap(adql, maxrec):
        lo, hi = [int(x) for x in adql.split('BETWEEN ')[1].split(' AND ')[:2]]
        nivel = 12 - int(round(np.log((hi - lo + 1) / B.av.P235) / np.log(4)))
        LLAMADAS.append(nivel)
        if nivel == plazo_nivel:
            raise B.Plazo('Query timed out')
        sel = np.flatnonzero((sid >= lo) & (sid <= hi))[perder:][:maxrec]
        CONSULTAS.append(adql)
        return [['source_id', 'ra', 'dec', 'g', 'bprp', 'astrometric_params_solved']] + [
            [str(sid[k]), str(float(ra[k])), str(float(dec[k])), str(float(gm[k])), '' if np.isnan(bprp[k]) else str(float(bprp[k])),
             str(sol[k])] for k in sel]
    return tap


d = tempfile.mkdtemp(prefix='banco_test_')
try:
    zp = zip_vb21(d)
    print('Fichero:')
    cuentas = {G['id']: N}
    B.MAX_FILAS_TROZO = 120          # fuerza a partir celdas en un cielo de 2000
    e = B.generar_uno(G, zp, os.path.join(d, 'out'), os.path.join(d, 'trabajo'), cuentas, tap=tap_falso(plazo_nivel=6))
    b = B.leer_banco(open(B.ruta_banco(os.path.join(d, 'out'), G['id']), 'rb').read())
    ok(b['n'] == N and e['filas'] == N, 'todas las filas (%d)' % b['n'])
    ok(int(b['hist'].sum()) == N, 'el histograma suma las filas')
    gq = b['filas']['g'] & 0x7FFF
    ok(bool(np.all(np.diff(gq.astype(int)) >= 0)), 'ordenado por G')
    marca = (b['filas']['g'] & B.BIT_CAMPO) != 0
    ok(int(marca.sum()) == int(campo_vb.sum()) == b['campo'], 'marca de campo en las de VB21 (%d)' % marca.sum())
    # Cada fila marcada es una de campo de VB21, por posición.
    pos = {(np.float32(ra[k]), np.float32(dec[k])) for k in np.flatnonzero(campo_vb)}
    ok(all((x['ra'], x['dec']) in pos for x in b['filas'][marca]), 'y son exactamente esas (cruce por source_id)')
    ok(0.85 < b['radio_vb21'] <= 0.9, 'radio de VB21 en la cabecera (%.3f°)' % b['radio_vb21'])
    sinb = b['filas']['bprp'] == -32768
    ok(int(sinb.sum()) == int(np.isnan(bprp).sum()), 'BP−RP nulo con centinela')
    ok(abs(b['rmax'] - B.R_MAX) < 1e-6 and b['regla'] == B.REGLA, 'R_MAX y regla en la cabecera')
    ok(CONSULTAS and all('astrometric_params_solved' in q for q in CONSULTAS), 'la consulta pide la marca de astrometría (#623)')
    # #623: formato 2, fila de 13 B con la marca 5/6p en el último byte.
    ok(B.VERSION_FORMATO == 2 and B.DTYPE_FILA.itemsize == 13, 'formato 2: fila de 13 B')
    por_pos = {(np.float32(ra[k]), np.float32(dec[k])): sol[k] > 3 for k in range(N)}
    ok(all(bool(x['astro']) == por_pos[(x['ra'], x['dec'])] for x in b['filas']),
       'marca 5/6p en las filas con astrometric_params_solved > 3 (%d de %d)' % (int(b['filas']['astro'].sum()), N))
    ok(int(b['filas']['astro'].sum()) == int((sol > 3).sum()), 'ni una 2p marcada como 5/6p')

    print('Celdas:')
    ok(6 in LLAMADAS and 7 in LLAMADAS and max(LLAMADAS) >= 8,
       'plazo en nivel 6 y MAXREC en 7 → se parte hasta nivel %d' % max(LLAMADAS))
    f = np.frombuffer(open(B.ruta_banco(os.path.join(d, 'out'), G['id']), 'rb').read(),
                      dtype=B.DTYPE_FILA, offset=B.TAM_CABECERA)
    ok(len({(x['ra'], x['dec']) for x in f}) == N, 'sin duplicados ni huecos al partir')
    del LLAMADAS[:]
    B.generar_uno(G, zp, os.path.join(d, 'out'), os.path.join(d, 'trabajo'), cuentas, tap=tap_falso())
    ok(LLAMADAS == [], 'reanudar no vuelve a preguntar por celdas ya bajadas')
    print('COUNT:')
    shutil.rmtree(os.path.join(d, 'trabajo'))
    try:
        B.generar_uno(G, zp, os.path.join(d, 'out2'), os.path.join(d, 'trabajo'), cuentas, tap=tap_falso(perder=1))
        ok(False, 'faltan filas y tendría que fallar')
    except RuntimeError as ex:
        ok('COUNT' in str(ex) and not os.path.exists(B.ruta_banco(os.path.join(d, 'out2'), G['id'])),
           'menos filas que el COUNT → falla en voz alta y no escribe')

    print('--validar:')
    out = os.path.join(d, 'out')
    ok(B.validar_uno(G, out, {G['id']: N}) == [], 'pasa con el COUNT del oráculo')
    # Terzan 3 real: radio de VB21 = 4,0008 r_h → anillo exterior de 0,02′² sobre 235′².
    corto = dict(B.leer_banco(open(B.ruta_banco(out, G['id']), 'rb').read()), radio_vb21=4.0008 * G['rh'] / 60)
    pasa, texto = B.densidad_plana(corto, G['rh'])
    ok(pasa and '2-4 r_h' in texto, 'anillo 4-8 r_h recortado por VB21 a una tira → referencia 2-4 r_h (%s)' % texto)
    pasa, texto = B.densidad_plana(dict(corto, radio_vb21=2.5 * G['rh'] / 60), G['rh'])
    ok(pasa and texto.startswith('no medible'), 'VB21 por debajo de 3 r_h → no medible (%s)' % texto)
    sin = []
    ok(B.validar_uno(dict(G, rh=None), out, {G['id']: N}, sin) == [] and sin == [G['id']],
       'sin r_h en Harris (Liller 1, UKS 1, NGC 6540): no medible, listado, sin romper')
    f = B.validar_uno(G, out, {G['id']: N + 1})
    ok(len(f) == 1 and 'COUNT' in f[0], 'filas ≠ COUNT → falla (%s)' % f)
    # Caso malo: todo el núcleo marcado de campo (p < 0,5 sin exigir limpia).
    malo = bytearray(open(B.ruta_banco(out, G['id']), 'rb').read())
    filas = np.frombuffer(malo, dtype=B.DTYPE_FILA, offset=B.TAM_CABECERA).copy()
    rr = np.hypot((filas['ra'] - G['ra']) * np.cos(np.radians(G['dec'])), filas['dec'] - G['dec']) * 60
    filas['g'][rr < 2 * G['rh']] |= B.BIT_CAMPO
    malo[B.TAM_CABECERA:] = filas.tobytes()
    open(B.ruta_banco(out, G['id']), 'wb').write(bytes(malo))
    f = B.validar_uno(G, out, {G['id']: N})
    ok(any('densidad' in x for x in f), 'núcleo lleno de «campo» → densidad no plana, falla')
    bm = dict(B.leer_banco(open(B.ruta_banco(out, G['id']), 'rb').read()), radio_vb21=4.0008 * G['rh'] / 60)
    pasa, texto = B.densidad_plana(bm, G['rh'])
    ok(not pasa and '2-4 r_h' in texto, 'y también con la referencia 2-4 r_h (%s)' % texto)
finally:
    shutil.rmtree(d)

print('\n' + ('✓ Todo correcto.' if not fallos else '✗ %d fallo(s).' % fallos))
sys.exit(1 if fallos else 0)
