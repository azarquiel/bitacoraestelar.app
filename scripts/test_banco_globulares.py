# -*- coding: utf-8 -*-
"""Test del generador del banco del globular (scripts/gen_banco_globulares.py,
#583, ADR 0041). Sin red: los jobs TAP y el zip de VB21 son de mentira.

Fija:
  · la marca de campo es la regla de la nota (y la de gen_m13_pertenencia.py);
    una fuente sin fila en VB21 es miembro;
  · el fichero va ordenado por G, con la marca en el bit alto, y su
    histograma suma las filas (el cliente pide por Range con él);
  · un lote que no trae lo que contó el histograma (MAXREC) hace fallar;
  · los lotes parten los tramos sin solaparse;
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

print('Lotes:')
h = [0] * B.NTRAMOS
h[10], h[30], h[31], h[39] = 5, 1_000_000, 900_000, 7
L = B.lotes(h)
ok(L == [(10, 30, 1_000_005), (31, 39, 900_007)], 'tramos contiguos que caben en un lote: %s' % L)
ok(sum(n for _, _, n in L) == sum(h), 'la suma de los lotes es la del histograma')

# ── Un globular de mentira: 2000 estrellas hasta 1° ──
rng = np.random.default_rng(1)
G = {'id': 'NGC 9999', 'ra': 250.0, 'dec': 30.0, 'rh': 5.0, 'vb21': 'NGC_9999'}
N = 2000
r = 1.0 * np.sqrt(rng.random(N))
th = 2 * np.pi * rng.random(N)
sid = np.arange(1000, 1000 + N, dtype=np.int64)
ra = G['ra'] + r * np.cos(th) / np.cos(np.radians(G['dec']))
dec = G['dec'] + r * np.sin(th)
gm = np.round(10 + 9.9 * rng.random(N), 4)
bprp = np.where(rng.random(N) < 0.1, np.nan, np.round(rng.random(N) * 2, 3))
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


def tap_falso(trucar=0):
    def tap(adql, maxrec):
        if 'COUNT(*)' in adql:
            t = np.floor(gm * 2).astype(int)
            return [['t', 'n']] + [[str(k), str(int((t == k).sum()))] for k in np.unique(t)]
        t0, t1 = [int(x) for x in adql.split('BETWEEN ')[1].split(' AND ')[:2]]
        sel = np.flatnonzero((np.floor(gm * 2) >= t0) & (np.floor(gm * 2) <= t1))
        sel = sel[:len(sel) - trucar]
        return [['source_id', 'ra', 'dec', 'g', 'bprp']] + [
            [str(sid[k]), str(float(ra[k])), str(float(dec[k])), str(float(gm[k])), '' if np.isnan(bprp[k]) else str(float(bprp[k]))] for k in sel]
    return tap


d = tempfile.mkdtemp(prefix='banco_test_')
try:
    zp = zip_vb21(d)
    print('Fichero:')
    e = B.generar_uno(G, zp, os.path.join(d, 'out'), os.path.join(d, 'trabajo'), tap=tap_falso())
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

    print('MAXREC:')
    shutil.rmtree(os.path.join(d, 'trabajo'))
    try:
        B.generar_uno(G, zp, os.path.join(d, 'out2'), os.path.join(d, 'trabajo'), tap=tap_falso(trucar=1))
        ok(False, 'un lote recortado tendría que fallar')
    except RuntimeError as ex:
        ok('histograma' in str(ex), 'un lote con una fila menos falla en voz alta')

    print('--validar:')
    out = os.path.join(d, 'out')
    ok(B.validar_uno(G, out, {G['id']: N}) == [], 'pasa con el COUNT del oráculo')
    f = B.validar_uno(G, out, {G['id']: N + 1})
    ok(len(f) == 1 and 'COUNT' in f[0], 'filas ≠ COUNT → falla (%s)' % f)
    # Caso malo: todo el núcleo marcado de campo (p < 0,5 sin exigir limpia).
    malo = bytearray(open(B.ruta_banco(out, G['id']), 'rb').read())
    filas = np.frombuffer(malo, dtype=B.av.DTYPE_FILA, offset=B.TAM_CABECERA).copy()
    rr = np.hypot((filas['ra'] - G['ra']) * np.cos(np.radians(G['dec'])), filas['dec'] - G['dec']) * 60
    filas['g'][rr < 2 * G['rh']] |= B.BIT_CAMPO
    malo[B.TAM_CABECERA:] = filas.tobytes()
    open(B.ruta_banco(out, G['id']), 'wb').write(bytes(malo))
    f = B.validar_uno(G, out, {G['id']: N})
    ok(any('densidad' in x for x in f), 'núcleo lleno de «campo» → densidad no plana, falla')
finally:
    shutil.rmtree(d)

print('\n' + ('✓ Todo correcto.' if not fallos else '✗ %d fallo(s).' % fallos))
sys.exit(1 if fallos else 0)
