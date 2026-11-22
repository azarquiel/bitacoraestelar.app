# -*- coding: utf-8 -*-
"""Genera el banco del globular (#583, ADR 0041): todas las estrellas de Gaia
DR3 con G ≤ 20 hasta R_MAX = 1,08° del centro de cada uno de los 143
globulares de globulares-datos.js, con la marca de estrella de campo de
Vasiliev & Baumgardt 2021 (simulador_ocular/docs/notas/pertenencia-vb21.md).

Glosario (simulador_ocular/CONTEXT.md): banco del globular, estrella de campo.

Descarga reanudable (si se corta, se relanza igual y sigue):

  1. CELDAS: el cono se parte en celdas HEALPix de nivel NIVEL_TROZO por
     rango de source_id (indexado en GAVO: cada consulta recorre solo su
     celda). Cada celda va en una consulta SÍNCRONA con MAXREC; si lo toca o
     GAVO la corta por tiempo, se parte en sus 4 hijas. Nada de cola
     asíncrona: el 2026-11-22 estaba a ~9 h por job.
  2. COMPLETITUD: la suma tiene que ser el COUNT exacto del oráculo de #601
     (banco_globular_601_c.tsv), o el globular falla y no se escribe.
  3. FICHERO (local): cruce con VB21 por source_id, marca de campo, filas
     ordenadas por G y cabecera con el histograma (el cliente pide por Range
     solo hasta su magnitud).

Marca de campo (regla REGLA, la de la nota):
    campo ⇔ memberprob < 0,5 y (qflag & 2 o G_VB21 < 13)
Sin fila en VB21 (fuera de su radio, solución de 2 parámetros…) = miembro.

Criterio 6 de #583, decidido en la historia: el radio del catálogo de VB21 es
menor que r_t en 102 de los 143. Más allá de ese radio no hay memberprob y la
estrella cuenta como miembro, como antes. Por eso la cabecera lleva el radio
de VB21 y --validar exige que esté escrito (> 0), no que sea ≥ r_t.

Formato (little-endian), banco_globular/r<REGLA>/<id con _>.bin:
  cabecera (212 B):
    firma   4s  b'BGLO'
    versión u16 VERSION_FORMATO
    regla   u16 REGLA (versión de la regla de pertenencia)
    ra, dec f64 centro (Harris, el mismo de globulares-datos.js)
    rmax    f32 R_MAX (°)
    rvb21   f32 radio del catálogo de VB21 (°)
    filas   u32
    campo   u32 filas con la marca
    tramos  u16 42
    paso    u16 500 (milésimas de mag; tramo k = [k/2, (k+1)/2))
    hist    42 × u32 filas por tramo (las filas van ordenadas por G: el
            tramo k empieza en la fila Σ hist[0..k-1])
  filas (12 B, las del Avance):
    ra f32 · dec f32 · G u16 = floor(G·1000) | 0x8000 si es de campo ·
    BP−RP i16 = round(BP−RP·1000), −32768 si es nulo.

Uso:
  python3 scripts/gen_banco_globulares.py --zip clusters.zip            # los 143
  python3 scripts/gen_banco_globulares.py --zip clusters.zip --solo 'NGC 6205,NGC 6656'
  python3 scripts/gen_banco_globulares.py --validar [--solo …]          # antes del FTP
Opciones: --salida DIR (simulador_ocular/banco_globular) · --trabajo DIR (.scratch/banco_globular)

Publicar: primero r<REGLA>/*.bin por FTP a wp-content/uploads/bitacora/banco_globular/,
luego .htaccess y el manifiesto el ÚLTIMO, y solo si --validar sale limpio.
"""
import argparse
import csv
import datetime
import io
import json
import math
import os
import struct
import sys
import time
import urllib.error
import urllib.parse
import zipfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_avance_gaia as av  # noqa: E402  (_http, en_paralelo, escribir_atomico, celdas, HEALPix)
import spike_601_banco_globular as spike  # noqa: E402  (población Harris ∩ VB21)

RAIZ = av.RAIZ
SALIDA = os.path.join(RAIZ, 'simulador_ocular', 'banco_globular')
TRABAJO = os.path.join(RAIZ, '.scratch', 'banco_globular')
ORACULO = spike.SALIDA_C

R_MAX = 1.08                 # ° (ADR 0041): radioConsulta(90′) cuantizado
G_MAX = 20.0
FIRMA = b'BGLO'
VERSION_FORMATO = 1
REGLA = 1                    # pertenencia-vb21.md; #596 la cambiará → REGLA 2, otra carpeta
CABECERA = struct.Struct('<4sHHddffIIHH')
NTRAMOS, PASO_MIL = av.NTRAMOS, av.PASO_MIL
TAM_CABECERA = CABECERA.size + 4 * NTRAMOS          # 212
BIT_CAMPO = 0x8000
# Descarga en síncrono por celdas de source_id (medido 2026-11-22 en GAVO: una
# celda de nivel 6 con 124 k filas, 6 s; la cola asíncrona estaba a ~9 h).
NIVEL_TROZO = 6
MAX_FILAS_TROZO = 200_000      # MAXREC: tocarlo = partir la celda
MARGEN_CELDAS = 0.05           # °: celdas_del_cono muestrea; sobran celdas, no faltan
PLAZO_SYNC_S = 90


def nombre_fichero(ident):
    return ident.replace(' ', '_') + '.bin'


def ruta_banco(salida, ident):
    return os.path.join(salida, 'r%d' % REGLA, nombre_fichero(ident))


# ───────────────────────── Población ─────────────────────────

def leer_harris():
    """Los de spike.leer_harris con r_h (′), para la densidad de --validar."""
    rh = {}
    for l in open(spike.DATOS, encoding='utf-8'):
        l = l.strip().rstrip(',')
        if l.startswith('["'):
            f = json.loads(l)
            rh[f[0]] = f[5]
    out = spike.leer_harris()
    for g in out:
        g['rh'] = rh[g['id']]
    return out


def poblacion(zip_path):
    """Los 143 con el fichero de VB21 que les toca (el más cercano, < 10′)."""
    vb = spike.centros_vb21(zip_path)
    out = []
    for g in leer_harris():
        cerca = [(spike.sep(g['ra'], g['dec'], ra, dec), n) for n, (ra, dec) in vb.items()]
        d, n = min(cerca)
        if d < spike.TOL_CRUCE:
            g['vb21'] = n
            out.append(g)
    assert len(out) == spike.N_POBLACION, len(out)
    return out


def es_campo(p, qflag, g):
    """La regla de la nota (y de gen_m13_pertenencia.py), vectorizada."""
    return (p < 0.5) & (((qflag & 2) != 0) | (g < 13))


def leer_vb21(zip_path, nombre):
    """source_id de campo y radio del catálogo (°) de un fichero de VB21."""
    sid, x, y, g, q, p = [], [], [], [], [], []
    with zipfile.ZipFile(zip_path) as z:
        for l in z.open('catalogues/%s.txt' % nombre):
            if l.startswith(b'#'):
                continue
            c = l.split()
            sid.append(int(c[0])); x.append(float(c[3])); y.append(float(c[4]))
            g.append(float(c[12])); q.append(int(c[15])); p.append(float(c[16]))
    campo = es_campo(np.array(p), np.array(q), np.array(g))
    radio = float(np.sqrt(np.max(np.square(x) + np.square(y)))) if sid else 0.0
    return set(np.array(sid, dtype=np.int64)[campo].tolist()), radio


# ───────────────────────── TAP ─────────────────────────

def cono(g):
    return "1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',%r,%r,%r))" % (g['ra'], g['dec'], R_MAX)


def adql_trozo(g, nivel, ipix):
    """Las filas de una celda HEALPix de `nivel` (por source_id, indexado: la
    consulta recorre solo su celda, no el cono entero) dentro del cono."""
    lo, hi = av.rango_source_id(nivel, ipix)
    return ('SELECT source_id, ra, dec, phot_g_mean_mag AS g, phot_bp_mean_mag-phot_rp_mean_mag AS bprp'
            ' FROM %s WHERE source_id BETWEEN %d AND %d AND phot_g_mean_mag<=%r AND %s'
            % (av.TABLA, lo, hi, G_MAX, cono(g)))


class Plazo(RuntimeError):
    """GAVO cortó la consulta síncrona (~20 s): el trozo es demasiado grande."""


def tap_sync(adql, maxrec):
    """Una consulta síncrona en GAVO → filas CSV (con cabecera). Plazo si GAVO
    corta por tiempo; reintenta lo que es red."""
    datos = urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv',
                                    'MAXREC': str(maxrec), 'QUERY': adql}).encode()
    for intento in range(av.REINTENTOS + 1):
        try:
            return list(csv.reader(io.StringIO(av._http(av.TAP + '/sync', datos, timeout=PLAZO_SYNC_S).decode())))
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode('utf-8', 'replace')
            if e.code >= 500 and 'timed out' in cuerpo.lower():
                raise Plazo(cuerpo[:120])
            error = e
        except (urllib.error.URLError, OSError) as e:   # incluye el timeout del socket
            error = e
        if intento < av.REINTENTOS:
            time.sleep(10 * 2 ** intento)
    raise error


def dir_trabajo(trabajo, g):
    return os.path.join(trabajo, g['id'].replace(' ', '_'))


DTYPE_LOTE = np.dtype([('sid', '<i8'), ('ra', '<f8'), ('dec', '<f8'), ('g', '<f8'), ('bprp', '<f8')])


def bajar_trozo(trabajo, g, nivel, ipix, tap=tap_sync):
    """Filas de una celda, o None si hay que partirla: tocó MAXREC (un recorte
    se ve: filas == MAXREC) o GAVO cortó por tiempo. Reanudable: cada celda
    terminada queda en su .npy."""
    ruta = os.path.join(dir_trabajo(trabajo, g), 't%02d_%d.npy' % (nivel, ipix))
    partida = ruta[:-4] + '.partida'      # reanudar baja directo a las hijas
    if os.path.exists(ruta):
        return np.load(ruta)
    if os.path.exists(partida):
        return None
    try:
        filas = tap(adql_trozo(g, nivel, ipix), MAX_FILAS_TROZO)[1:]
    except Plazo:
        filas = None
    if filas is None or len(filas) >= MAX_FILAS_TROZO:
        av.escribir_atomico(partida, b'')
        return None
    a = np.empty(len(filas), dtype=DTYPE_LOTE)
    for k, (sid, ra, dec, gm, bprp) in enumerate(filas):
        a[k] = (int(sid), float(ra), float(dec), float(gm), av._num(bprp))
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + '.tmp%d.npy' % os.getpid()
    np.save(tmp, a)
    os.replace(tmp, ruta)
    return a


def bajar_cono(trabajo, g, tap=tap_sync):
    """Todas las filas del cono, celda a celda. Empieza en NIVEL_TROZO; una
    celda que no cabe se parte en sus 4 hijas. Las celdas son rangos
    disjuntos de source_id: la unión es exacta, sin duplicados."""
    pendientes = [(NIVEL_TROZO, ip) for ip in av.celdas_del_cono(g['ra'], g['dec'], R_MAX + MARGEN_CELDAS, NIVEL_TROZO)]
    partes = []
    while pendientes:
        nivel, ip = pendientes.pop()
        a = bajar_trozo(trabajo, g, nivel, ip, tap)
        if a is not None:
            partes.append(a)
        elif nivel >= 12:
            raise RuntimeError('%s: la celda %d de nivel 12 no cabe en una consulta' % (g['id'], ip))
        else:
            pendientes += [(nivel + 1, int(h)) for h in av.celdas_hijas(nivel, ip, nivel + 1)]
    return np.concatenate(partes) if partes else np.empty(0, dtype=DTYPE_LOTE)


# ───────────────────────── Formato ─────────────────────────

def codificar(lote, campo_sids):
    """Filas de 12 B ordenadas por G, con la marca en el bit alto de G."""
    orden = np.lexsort((lote['dec'], lote['ra'], lote['g']))
    lote = lote[orden]
    filas = np.empty(len(lote), dtype=av.DTYPE_FILA)
    filas['ra'] = np.mod(lote['ra'], 360.0)
    filas['ra'][filas['ra'] >= np.float32(360.0)] = 0.0
    filas['dec'] = lote['dec']
    gm = np.floor(lote['g'] * 1000.0).astype(np.int64)
    if gm.size and (gm.min() < 0 or gm.max() > G_MAX * 1000):
        raise ValueError('G fuera de [0, 20]')
    campo = np.isin(lote['sid'], np.fromiter(campo_sids, dtype=np.int64, count=len(campo_sids)))
    filas['g'] = gm | np.where(campo, BIT_CAMPO, 0)
    nulo = ~np.isfinite(lote['bprp'])
    c = np.clip(np.round(np.where(nulo, 0.0, lote['bprp']) * 1000.0), -32767, 32767).astype(np.int16)
    c[nulo] = av.CENTINELA_BPRP
    filas['bprp'] = c
    return filas


def bytes_banco(g, filas, radio_vb21):
    gm = filas['g'] & 0x7FFF
    hist = np.bincount(gm // PASO_MIL, minlength=NTRAMOS)[:NTRAMOS]
    campo = int(np.count_nonzero(filas['g'] & BIT_CAMPO))
    cab = CABECERA.pack(FIRMA, VERSION_FORMATO, REGLA, g['ra'], g['dec'], R_MAX, radio_vb21,
                        len(filas), campo, NTRAMOS, PASO_MIL)
    return cab + hist.astype('<u4').tobytes() + filas.tobytes()


def leer_banco(datos):
    """bytes → dict; ValueError si no es un banco íntegro."""
    if len(datos) < TAM_CABECERA:
        raise ValueError('banco truncado')
    firma, ver, regla, ra, dec, rmax, rvb, n, campo, nt, paso = CABECERA.unpack_from(datos)
    if firma != FIRMA or ver != VERSION_FORMATO or nt != NTRAMOS or paso != PASO_MIL:
        raise ValueError('cabecera desconocida')
    if len(datos) != TAM_CABECERA + av.DTYPE_FILA.itemsize * n:
        raise ValueError('tamaño incoherente con el nº de filas')
    hist = np.frombuffer(datos, dtype='<u4', count=NTRAMOS, offset=CABECERA.size).astype(np.int64)
    filas = np.frombuffer(datos, dtype=av.DTYPE_FILA, count=n, offset=TAM_CABECERA)
    return {'regla': regla, 'ra': ra, 'dec': dec, 'rmax': rmax, 'radio_vb21': rvb, 'n': n,
            'campo': campo, 'hist': hist, 'filas': filas}


# ───────────────────────── Generación ─────────────────────────

def generar_uno(g, zip_path, salida, trabajo, cuentas, tap=tap_sync):
    lote = bajar_cono(trabajo, g, tap)
    # Completitud: el COUNT exacto de GAVO (#601). Un fallo aquí no escribe nada.
    if len(lote) != cuentas[g['id']]:
        raise RuntimeError('%s: %d filas, COUNT de Gaia %d' % (g['id'], len(lote), cuentas[g['id']]))
    campo, radio = leer_vb21(zip_path, g['vb21'])
    datos = bytes_banco(g, codificar(lote, campo), radio)
    av.escribir_atomico(ruta_banco(salida, g['id']), datos)
    b = leer_banco(datos)
    return {'id': g['id'], 'ra': g['ra'], 'dec': g['dec'], 'archivo': nombre_fichero(g['id']),
            'filas': b['n'], 'campo': b['campo'], 'radio_vb21': round(radio, 4), 'bytes': len(datos)}


def manifiesto(entradas):
    return {
        'version': VERSION_FORMATO,
        'formato': 'BGLO',
        'regla': REGLA,
        'regla_texto': 'VB21 2021: campo si memberprob < 0,5 y (qflag & 2 o G < 13)',
        'catalogo': av.CATALOGO,
        'tabla': av.TABLA + ' (GAVO)',
        'rmax': R_MAX,
        'gmax': G_MAX,
        'ruta': 'r%d/{archivo}' % REGLA,
        'filas': sum(e['filas'] for e in entradas),
        'globulares': sorted(entradas, key=lambda e: e['id']),
        'fecha': datetime.date.today().isoformat(),
    }


# ───────────────────────── --validar (criterio 6) ─────────────────────────

def oraculo():
    out = {}
    for l in open(ORACULO, encoding='utf-8'):
        if l.startswith('#') or l.startswith('id\t'):
            continue
        c = l.rstrip('\n').split('\t')
        out[c[0]] = int(c[3])
    return out


def densidad_plana(b, rh_arcmin):
    """Criterio 6, densidad de campo plana: en 0-2 r_h como mucho el doble que
    en 4-8 r_h, contando solo dentro del radio de VB21 (fuera no hay marca).
    El listón lleva margen de Poisson (3σ sobre el doble): el caso malo de la
    nota (p < 0,5 sin exigir astrometría limpia) da ~47× en M13 y no lo pasa.
    Devuelve (pasa, texto)."""
    f = b['filas']
    campo = (f['g'] & BIT_CAMPO) != 0
    c0 = math.cos(math.radians(b['dec']))
    dx = ((f['ra'].astype(np.float64) - b['ra'] + 540) % 360 - 180) * c0
    dy = f['dec'].astype(np.float64) - b['dec']
    r = np.hypot(dx, dy) * 60                       # ′ (plano tangente: r ≤ 8 r_h, pequeño)
    rv = b['radio_vb21'] * 60

    def anillo(a, z):
        z = min(z, rv)
        if z <= a:
            return None, 0.0
        return int(np.count_nonzero(campo & (r >= a) & (r < z))), math.pi * (z * z - a * a)

    n_in, a_in = anillo(0, 2 * rh_arcmin)
    n_out, a_out = anillo(4 * rh_arcmin, 8 * rh_arcmin)
    if n_in is None or n_out is None:
        return True, 'no medible (radio VB21 %.1f′ < 4 r_h)' % rv
    lam = 2 * (n_out / a_out) * a_in               # el doble de lo esperado dentro
    techo = lam + 3 * math.sqrt(max(lam, 1.0))
    texto = '0-2 r_h %d (%.3f/′²), 4-8 r_h %d (%.3f/′²), techo %.1f' % (n_in, n_in / a_in, n_out, n_out / a_out, techo)
    return n_in <= techo, texto


def validar_uno(g, salida, cuentas, sin_medir=None):
    """Lista de fallos (vacía si pasa)."""
    ruta = ruta_banco(salida, g['id'])
    try:
        b = leer_banco(open(ruta, 'rb').read())
    except (OSError, ValueError) as e:
        return ['%s: %s' % (g['id'], e)]
    fallos = []
    if g['id'] not in cuentas:
        fallos.append('%s: sin COUNT en el oráculo' % g['id'])
    elif b['n'] != cuentas[g['id']]:
        fallos.append('%s: %d filas, COUNT de Gaia %d' % (g['id'], b['n'], cuentas[g['id']]))
    if int(b['hist'].sum()) != b['n']:
        fallos.append('%s: el histograma suma %d y hay %d filas' % (g['id'], b['hist'].sum(), b['n']))
    if abs(b['rmax'] - R_MAX) > 1e-6 or b['regla'] != REGLA:
        fallos.append('%s: rmax %.3f / regla %d' % (g['id'], b['rmax'], b['regla']))
    if not b['radio_vb21'] > 0:
        fallos.append('%s: sin radio de VB21 en la cabecera' % g['id'])
    gm = b['filas']['g'] & 0x7FFF
    if len(gm) and np.any(np.diff(gm.astype(np.int64)) < 0):
        fallos.append('%s: filas sin ordenar por G' % g['id'])
    pasa, texto = densidad_plana(b, g['rh'])
    if sin_medir is not None and texto.startswith('no medible'):
        sin_medir.append(g['id'])
    print('  %-10s %8d filas, %6d campo, VB21 %.2f°: %s' % (g['id'], b['n'], b['campo'], b['radio_vb21'], texto))
    if not pasa:
        fallos.append('%s: densidad de campo no plana (%s)' % (g['id'], texto))
    return fallos


# ───────────────────────── Principal ─────────────────────────

def main():
    ap = argparse.ArgumentParser(description='#583 · banco del globular')
    ap.add_argument('--zip', help='clusters.zip de Zenodo 4891252 (VB21)')
    ap.add_argument('--solo', help='ids separados por comas')
    ap.add_argument('--validar', action='store_true')
    ap.add_argument('--salida', default=SALIDA)
    ap.add_argument('--trabajo', default=TRABAJO)
    a = ap.parse_args()

    if a.validar:
        cuentas = oraculo()
        harris = {g['id']: g for g in leer_harris()}
        ids = a.solo.split(',') if a.solo else sorted(cuentas)
        fallos, sin_medir = [], []
        for i in ids:
            fallos += validar_uno(harris[i], a.salida, cuentas, sin_medir)
        man = os.path.join(a.salida, 'manifiesto.json')
        if not a.solo and not os.path.exists(man):
            fallos.append('falta manifiesto.json')
        if sin_medir:
            # No es un fallo (criterio 6 decidido en #583), pero se dice en voz alta.
            print('\n⚠ %d sin densidad medible (radio de VB21 < 4 r_h): %s' % (len(sin_medir), ', '.join(sin_medir)))
        print('\n' + ('✗ %d fallo(s):\n  ' % len(fallos) + '\n  '.join(fallos) if fallos else '✓ banco válido'))
        sys.exit(1 if fallos else 0)

    if not a.zip:
        ap.error('--zip es obligatorio para generar')
    pobl = poblacion(a.zip)
    if a.solo:
        quiero = set(a.solo.split(','))
        pobl = [g for g in pobl if g['id'] in quiero]
        assert len(pobl) == len(quiero), 'ids desconocidos'
    entradas = []
    cuentas = oraculo()
    hechos = []                    # en_paralelo devuelve todo al final: se informa al terminar cada uno

    def uno(g):
        try:
            r = generar_uno(g, a.zip, a.salida, a.trabajo, cuentas)
            hechos.append(g)
            print('  ✓ %3d/%d %-10s %8d filas %6d campo' % (len(hechos), len(pobl), g['id'], r['filas'], r['campo']), flush=True)
            return r
        except Exception as e:     # noqa: BLE001 — se informa y se sigue con los demás
            print('  ✗ %-10s %s' % (g['id'], e), flush=True)
            raise
    for g, r in av.en_paralelo(uno, pobl):
        if not isinstance(r, Exception):
            entradas.append(r)
    if len(entradas) != len(pobl):
        sys.exit('faltan %d globulares: relanzar (es reanudable)' % (len(pobl) - len(entradas)))
    # El manifiesto solo con los 143: uno parcial publicaría un banco a medias.
    if not a.solo:
        av.escribir_atomico(os.path.join(a.salida, 'manifiesto.json'),
                            (json.dumps(manifiesto(entradas), ensure_ascii=False, indent=1) + '\n').encode())


if __name__ == '__main__':
    main()
