#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""#601 · Spike: coste de Gaia en los globulares. Cono (A), anillo (B) o banco
ampliado (C). Regla de decisión prerregistrada en la issue y en el ADR 0041
(simulador_ocular/docs/adr/0041-banco-del-globular.md).

  (A) cono completo a Gaia, como hoy;
  (B) banco dentro de r_t y a Gaia solo el anillo ocular ∖ r_t;
  (C) banco ampliado hasta R_MAX, sin Gaia.

Qué mide (todo determinista: el tiempo del TAP público no lo es):
  · Población: los globulares de globulares-datos.js (Harris) que están en
    VB21 (Zenodo 4891252), cruzados por posición (< 10′). Son los 143: la cifra
    de 138 de pertenencia-vb21.md no se reproduce, y contar 5 más solo pesa en
    contra de (C).
  · Muestra: 30, estratificada por |b| (<10°, 10-30°, >30°) y por r_t (mitad
    pequeña / mitad grande de cada franja), 5 por casilla, a paso fijo en el
    orden de r_t (ver `muestra`). Sin azar.
  · Campos: 30′, 60′ y 90′ con un equipo de referencia (reflector de 200 mm,
    ocular de 52°), su magConsultaGaia (bitacora-gaia-render.js) cuantizada
    como el proxy, y su radio de consulta radioConsulta(). Centrado y
    desplazado medio radio de consulta al norte.
  · (A) y (B): filas del cono y del anillo, de un histograma de GAVO por
    píxel de 1′ (plano tangente) y tramo de 0,5 mag; cada píxel cuenta entero
    donde cae su centro. Bytes = filas × BYTES_FILA_TAP (JSON del TAP, medido).
  · (C): filas con G ≤ 20 dentro de R_MAX para los 143, COUNT exacto de GAVO.
    De contraste, el estimador de las cabeceras del Avance (histograma de cada
    celda ponderado por la fracción de su área en el cono, como la pista de
    densidad del proxy, ×0,86-1,04).
    Peso = filas × 12 B (formato de fila del Avance) + 188 B de cabecera.

Uso:
  python3 scripts/spike_601_banco_globular.py --zip clusters.zip --avance DIR
         [--tiempo]   # además: (B) en frío, síncrono en GAVO, 5 cúmulos
Los histogramas de GAVO se guardan en .scratch/601/ y se reutilizan.
Salida: simulador_ocular/docs/validacion/banco_globular_601.tsv (A y B por cúmulo
y campo) y banco_globular_601_c.tsv (C por globular).
1 GB = 2^30 B (lo más favorable a C).
"""
import argparse
import csv
import json
import math
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import zipfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_avance_gaia as av  # noqa: E402  (ang2pix_nest, tap_async, en_paralelo)

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'globulares-datos.js')
SALIDA = os.path.join(RAIZ, 'simulador_ocular', 'docs', 'validacion', 'banco_globular_601.tsv')
SALIDA_C = os.path.join(RAIZ, 'simulador_ocular', 'docs', 'validacion', 'banco_globular_601_c.tsv')
TRABAJO = os.path.join(RAIZ, '.scratch', '601')

CAMPOS = (30, 60, 90)            # arcmin de campo real
APERTURA, OPTICA, AFOV = 200, 'reflector', 52
BYTES_FILA_TAP = 63.3            # B/fila del JSON de GAVO, medido 2026-11-21 (2000 filas de M13)
BYTES_FILA_BANCO = 12            # fila del Avance: ra f32, dec f32, G u16, BP-RP i16
CABECERA_BANCO = 188
PIXEL = 1 / 60                   # ° (1′)
TOL_CRUCE = 10 / 60              # ° Harris-VB21: Terzan 10 está a 8,6′ (posición vieja de Harris); el resto, < 2′
N_POBLACION = 143                # todo globulares-datos.js está en VB21 (la nota de #575 decía 138)
N_MUESTRA = 30
CONTRASTE = ('NGC 6205', 'NGC 6656')   # M13 y M22, los de la historia: se miden, no entran en la regla

# Regla prerregistrada (#601). No se toca después de medir.
TECHO_C_BYTES = 1 << 30          # 1 GB
BAJADA_B = 0.50
FRACCION_CUMULOS_B = 2 / 3


# ───────────────────────── Población y muestra ─────────────────────────

def leer_harris():
    out = []
    for l in open(DATOS, encoding='utf-8'):
        l = l.strip().rstrip(',')
        if l.startswith('["'):
            f = json.loads(l)
            ident, ra, dec, rc, c = f[0], f[2], f[3], f[4], f[6]
            if rc is None or c is None:
                continue
            out.append({'id': ident, 'ra': ra, 'dec': dec, 'rt': rc * 10 ** c})   # r_t en arcmin
    return out


def centros_vb21(zip_path):
    """Centro de cada catálogo de VB21: la fuente con menor x²+y² (coordenadas
    respecto al centro del cúmulo), a < 1″ del centro en los 170."""
    out = {}
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            if not (n.startswith('catalogues/') and n.endswith('.txt')):
                continue
            mejor = None
            for l in z.open(n):
                if l.startswith(b'#'):
                    continue
                c = l.split()
                r2 = float(c[3]) ** 2 + float(c[4]) ** 2
                if mejor is None or r2 < mejor[0]:
                    mejor = (r2, float(c[1]), float(c[2]))
            if mejor:
                out[n[11:-4]] = (mejor[1], mejor[2])
    return out


def sep(ra1, dec1, ra2, dec2):
    return float(av.distancia_angular(ra1, dec1, ra2, dec2))


def latitud_galactica(ra, dec):
    """b en grados (polo norte galáctico J2000: 192,85948°, 27,12825°)."""
    r = math.radians
    s = (math.sin(r(dec)) * math.sin(r(27.12825))
         + math.cos(r(dec)) * math.cos(r(27.12825)) * math.cos(r(ra - 192.85948)))
    return math.degrees(math.asin(s))


def poblacion(zip_path):
    vb = centros_vb21(zip_path)
    out = []
    for g in leer_harris():
        if any(sep(g['ra'], g['dec'], ra, dec) < TOL_CRUCE for ra, dec in vb.values()):
            g['b'] = latitud_galactica(g['ra'], g['dec'])
            out.append(g)
    return out


def muestra(pobl):
    """3 franjas de |b| × 2 mitades de r_t = 6 casillas de 5. En cada casilla,
    ordenada por r_t, se toman 5 a paso fijo (índices round((i+0,5)·n/5))."""
    out = []
    for lo, hi in ((0, 10), (10, 30), (30, 91)):
        franja = sorted((g for g in pobl if lo <= abs(g['b']) < hi), key=lambda g: g['rt'])
        mitad = len(franja) // 2
        for casilla in (franja[:mitad], franja[mitad:]):
            n = len(casilla)
            out += [casilla[int((i + 0.5) * n / 5)] for i in range(min(5, n))]
    return out


# ───────────────────────── Campos de referencia ─────────────────────────

def campos_referencia():
    """[{campo, rad, mag}] leídos de producción (ADR 0008): radioConsulta y
    magConsultaGaia de bitacora-gaia-render.js, cuantizados por gaia_cuantizar
    de gaia_proxy.php."""
    js = ("global.window={};require('./resources/js/bitacora-gaia-render.js');"
          "var R=window.BitacoraGaiaRender,t=R.transmisionOptica(%r);"
          "console.log(JSON.stringify(%s.map(function(f){"
          "return [f,R.radioConsulta(f),R.magConsultaGaia(%d,t,%d*60/f)];})));"
          % (OPTICA, list(CAMPOS), APERTURA, AFOV))
    ternas = json.loads(subprocess.check_output(['node', '-e', js], cwd=RAIZ))
    php = ("require 'simulador_ocular/gaia_proxy.php'; $o = [];"
           "foreach (json_decode($argv[1]) as [$f, $rad, $mag]) {"
           " [, , $r, $m] = gaia_cuantizar(0.0, 0.0, $rad, $mag); $o[] = [$f, $r, $m]; }"
           "echo json_encode($o);")
    cuant = json.loads(subprocess.check_output(['php', '-r', php, json.dumps(ternas)], cwd=RAIZ))
    return [{'campo': f, 'rad': float(r), 'mag': float(m)} for f, r, m in cuant]


# ───────────────────────── (A) y (B): histograma por píxel ─────────────────────────

def adql_pixeles(g, radio, mag_lo, mag_hi):
    """G < mag_lo va junto en el tramo 2·mag_lo − 1, que cuenta en todos los campos."""
    c = math.cos(math.radians(g['dec']))
    # GAVO no tiene MOD(double): el cono no puede cruzar RA = 0.
    assert radio / c < g['ra'] < 360 - radio / c, g['id']
    return ('SELECT FLOOR((ra-(%r))*%r*60) AS ix, FLOOR((dec-(%r))*60) AS iy,'
            ' CASE WHEN phot_g_mean_mag<%r THEN %d ELSE FLOOR(phot_g_mean_mag*2) END AS t,'
            ' COUNT(*) AS n FROM gaia.dr3lite WHERE phot_g_mean_mag<=%r'
            " AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%r,%r,%r)) GROUP BY ix, iy, t"
            % (g['ra'], c, g['dec'], mag_lo, int(mag_lo * 2) - 1, mag_hi, g['ra'], g['dec'], radio))


def ruta_trabajo(sub, g):
    return os.path.join(TRABAJO, sub, g['id'].replace(' ', '_') + '.json')


def ruta_pixeles(g):
    return ruta_trabajo('pix', g)


def bajar_pixeles(g, radio, mag_lo, mag_hi):
    ruta = ruta_pixeles(g)
    if os.path.exists(ruta):
        return 'saltado'
    filas = av.tap_async(adql_pixeles(g, radio, mag_lo, mag_hi), 2_000_000)
    datos = [[int(float(a)), int(float(b)), int(float(t)), int(n)] for a, b, t, n in filas[1:] if t != '']
    av.escribir_atomico(ruta, json.dumps({'radio': radio, 'mag_hi': mag_hi, 'pix': datos}).encode())
    return 'bajado'


def contar_campo(g, pix, campo, desplazado):
    """Filas de (A) y (B) para un campo. El centro del ocular se desplaza al
    norte medio radio de consulta. Cada píxel va entero donde cae su centro."""
    dec_c = g['dec'] + (campo['rad'] / 2 if desplazado else 0)
    ix, iy, t, n = pix.T
    c = math.cos(math.radians(g['dec']))
    dec = g['dec'] + (iy + 0.5) * PIXEL
    ra = g['ra'] + (ix + 0.5) * PIXEL / c
    profundo = (t + 1) / 2 <= campo['mag'] + 1e-9        # tramo entero dentro de G ≤ mag
    en_ocular = av.distancia_angular(g['ra'], dec_c, ra, dec) <= campo['rad']
    en_rt = av.distancia_angular(g['ra'], g['dec'], ra, dec) <= g['rt'] / 60
    a = int(n[profundo & en_ocular].sum())
    b = int(n[profundo & en_ocular & ~en_rt].sum())
    return a, b


# ───────────────────────── (C): banco ampliado ─────────────────────────

def filas_banco(avance, ra, dec, radio, g_max=20.0, paso=None):
    """Filas G < g_max en el cono, de las cabeceras del Avance ponderadas por
    la fracción del área de cada celda dentro del cono (rejilla tangente)."""
    paso = paso or radio / 40
    k = int(math.ceil(radio / paso))
    d = (np.arange(-k, k + 1) + 0.0) * paso
    dx, dy = np.meshgrid(d, d)
    dentro = dx * dx + dy * dy <= radio * radio
    dx, dy = dx[dentro], dy[dentro]
    decs = np.clip(dec + dy, -90, 90)
    ras = ra + dx / max(math.cos(math.radians(dec)), 1e-6)
    pix = av.ang2pix_nest(av.NIVEL, ras, decs)
    area_cono = 2 * math.pi * (1 - math.cos(math.radians(radio))) * (180 / math.pi) ** 2
    area_celda = 41252.96 / av.nceldas(av.NIVEL)
    tramos = int(g_max * 2)
    total = 0.0
    for ip, cuenta in zip(*np.unique(pix, return_counts=True)):
        with open(av.ruta_celda(avance, int(ip)), 'rb') as fh:
            cab = fh.read(av.TAM_CABECERA)
        hist = np.frombuffer(cab, dtype='<u4', count=av.NTRAMOS, offset=av.CABECERA.size)
        total += hist[:tramos].sum() * min(1.0, area_cono * cuenta / len(pix) / area_celda)
    return total


def ruta_cuenta(g):
    return ruta_trabajo('c', g)


def contar_banco(g, radio):
    """COUNT exacto de GAVO, G ≤ 20 en el cono de R_MAX (cacheado)."""
    ruta = ruta_cuenta(g)
    if not os.path.exists(ruta):
        f = av.tap_async("SELECT COUNT(*) AS n FROM gaia.dr3lite WHERE phot_g_mean_mag<=20"
                         " AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%r,%r,%r))"
                         % (g['ra'], g['dec'], radio), 10)
        av.escribir_atomico(ruta, json.dumps({'radio': radio, 'n': int(f[1][0])}).encode())
    d = json.load(open(ruta))
    assert abs(d['radio'] - radio) < 1e-9, (g['id'], d['radio'])
    return d['n']


# ───────────────────────── (B) en frío ─────────────────────────

def tiempo_anillo(g, campo):
    """Una consulta síncrona del anillo en GAVO, como la sonda del proxy."""
    adql = ('SELECT TOP 200000 ra,dec,phot_g_mean_mag,phot_bp_mean_mag-phot_rp_mean_mag AS bprp'
            ' FROM gaia.dr3lite WHERE phot_g_mean_mag<=%r'
            " AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%r,%r,%r))"
            " AND 0=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%r,%r,%r))"
            % (campo['mag'], g['ra'], g['dec'], campo['rad'], g['ra'], g['dec'], g['rt'] / 60))
    url = av.TAP + '/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=' + urllib.parse.quote(adql)
    t0 = time.time()
    try:
        cuerpo = av._http(url, timeout=60)
        return time.time() - t0, len(json.loads(cuerpo)['data']), len(cuerpo), 'ok'
    except (urllib.error.URLError, OSError, ValueError) as e:
        return time.time() - t0, None, None, str(e)[:60]


# ───────────────────────── Principal ─────────────────────────

def autocomprobar(pobl):
    m13 = next(g for g in pobl if g['id'] == 'NGC 6205')
    assert abs(m13['rt'] - 21.2) < 0.5, m13['rt']                    # Harris: r_t de M13 ≈ 21′
    assert abs(latitud_galactica(266.405, -28.936) - (-0.05)) < 0.1   # Sgr A*
    assert len(pobl) == N_POBLACION, len(pobl)


def main():
    ap = argparse.ArgumentParser(description='#601 · coste de Gaia en globulares')
    ap.add_argument('--zip', required=True, help='clusters.zip de Zenodo 4891252')
    ap.add_argument('--avance', required=True, help='directorio del Avance (con n6/)')
    ap.add_argument('--tiempo', action='store_true', help='mide (B) en frío en 5 cúmulos')
    a = ap.parse_args()

    pobl = poblacion(a.zip)
    autocomprobar(pobl)
    mues = muestra(pobl)
    assert len(mues) == N_MUESTRA and len({g['id'] for g in mues}) == N_MUESTRA
    campos = campos_referencia()
    print('campos:', campos)
    medidos = mues + [g for g in pobl if g['id'] in CONTRASTE and g not in mues]
    rmax = max(c['rad'] for c in campos)

    # (C) para toda la población.
    # Exacto de GAVO; el estimador del Avance queda como contraste.
    estim = {g['id']: filas_banco(a.avance, g['ra'], g['dec'], rmax) for g in pobl}
    peso = {}
    for g, r in av.en_paralelo(lambda g: contar_banco(g, rmax), pobl):
        if isinstance(r, Exception):
            raise r
        peso[g['id']] = (r, r * BYTES_FILA_BANCO + CABECERA_BANCO)
    total_c = sum(p[1] for p in peso.values())
    with open(SALIDA_C, 'w', newline='') as fh:
        fh.write('# #601 · (C) banco ampliado a R_MAX=%.2f°, G ≤ 20. filas = COUNT de GAVO; '
                 'filas_avance = estimador de cabeceras del Avance (contraste)\n' % rmax)
        w = csv.writer(fh, delimiter='\t')
        w.writerow(['id', 'b', 'rt_arcmin', 'filas', 'bytes_disco', 'filas_avance'])
        for g in sorted(pobl, key=lambda g: -peso[g['id']][0]):
            w.writerow([g['id'], round(g['b'], 1), round(g['rt'], 1), peso[g['id']][0],
                        peso[g['id']][1], round(estim[g['id']])])

    # (A) y (B) para la muestra: un job por cúmulo, a lo sumo 2 a la vez.
    radio = rmax * 1.5
    mag_lo, mag_hi = min(c['mag'] for c in campos), max(c['mag'] for c in campos)
    for g, r in av.en_paralelo(lambda g: bajar_pixeles(g, radio, mag_lo, mag_hi), medidos):
        print('  %-10s %s' % (g['id'], r), flush=True)
        if isinstance(r, Exception):
            raise r

    filas = []
    for g in medidos:
        pix = np.array(json.load(open(ruta_pixeles(g)))['pix'], dtype=np.int64).reshape(-1, 4)
        for campo in campos:
            for desp in (False, True):
                fa, fb = contar_campo(g, pix, campo, desp)
                filas.append({'id': g['id'], 'regla': int(g in mues), 'b': round(g['b'], 1), 'rt_arcmin': round(g['rt'], 1),
                              'campo': campo['campo'], 'rad': campo['rad'], 'mag': campo['mag'],
                              'desplazado': int(desp), 'filas_A': fa, 'filas_B': fb,
                              'bytes_A': round(fa * BYTES_FILA_TAP), 'bytes_B': round(fb * BYTES_FILA_TAP),
                              'bajada_B': round(1 - fb / fa, 4) if fa else 0.0,
                              'filas_C': round(peso[g['id']][0]), 'bytes_disco_C': round(peso[g['id']][1])})

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, 'w', newline='') as fh:
        fh.write('# #601 · generado por scripts/spike_601_banco_globular.py; R_MAX=%.2f°, '
                 'equipo %d mm %s, ocular %d°. (C) total %d globulares = %d B\n'
                 % (rmax, APERTURA, OPTICA, AFOV, len(pobl), total_c))
        w = csv.DictWriter(fh, fieldnames=list(filas[0]), delimiter='\t')
        w.writeheader()
        w.writerows(filas)

    # Regla.
    medianas = {}
    for g in mues:
        v = [f['bajada_B'] for f in filas if f['id'] == g['id'] and f['campo'] >= 60]
        medianas[g['id']] = float(np.median(v))
    gana_b = sum(m >= BAJADA_B for m in medianas.values())
    print('\n(C) %d globulares, R_MAX %.2f°: %.0f filas, %.2f GB (techo 1 GB)'
          % (len(pobl), rmax, sum(p[0] for p in peso.values()), total_c / 2 ** 30))
    for gid, (n, b) in sorted(peso.items(), key=lambda x: -x[1][1])[:8]:
        print('    %-10s %9.0f filas %7.1f MB' % (gid, n, b / 2 ** 20))
    print('(B) cúmulos con bajada mediana ≥ 50 %% en 60-90′: %d/%d (hace falta ≥ %d)'
          % (gana_b, N_MUESTRA, math.ceil(FRACCION_CUMULOS_B * N_MUESTRA)))
    for gid, m in sorted(medianas.items(), key=lambda x: x[1]):
        print('    %-10s %5.1f %%' % (gid, 100 * m))
    if total_c <= TECHO_C_BYTES:
        gana = 'C'
    elif gana_b >= FRACCION_CUMULOS_B * N_MUESTRA:
        gana = 'B'
    else:
        gana = 'A'
    print('GANA (%s)' % gana)

    if a.tiempo:
        campo90 = next(c for c in campos if c['campo'] == 90)
        densos = sorted(mues, key=lambda g: -next(f['filas_B'] for f in filas
                                                  if f['id'] == g['id'] and f['campo'] == 90 and not f['desplazado']))[:5]
        print('\n(B) en frío, GAVO síncrono, 90′ centrado:')
        for g, (s, n, nb, estado) in av.en_paralelo(lambda g: tiempo_anillo(g, campo90), densos):
            print('    %-10s %5.1f s  filas %s  bytes %s  %s' % (g['id'], s, n, nb, estado))


if __name__ == '__main__':
    main()
