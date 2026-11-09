# -*- coding: utf-8 -*-
"""Genera el Avance de Gaia: Gaia DR3 con G < 15, un fichero por celda HEALPix
nested de nivel 6 (#516, ADR 0033 «Avance de Gaia y complemento débil»,
simulador_ocular/docs/adr/0033-avance-de-gaia-y-complemento-debil.md).

Glosario (simulador_ocular/CONTEXT.md): Avance de Gaia, celda, histograma de
profundidad, pista de densidad.

Tres pasadas, todas reanudables (si se corta, se relanza igual y sigue):

  1. HISTOGRAMAS. Un job asíncrono por región de nivel NIVEL_HIST (192 jobs):
       SELECT source_id/2^47, FLOOR(G*2), COUNT(*) … GROUP BY
     da el histograma de profundidad de cada celda (tramos de 0,5 mag, G 0-21)
     asignado por source_id. Es la pista de densidad y, además, el ORÁCULO de
     completitud de la pasada 2.
  2. LOTES. Un job por lote = celda de nivel NIVEL_LOTE (3072 jobs, 16 celdas
     de nivel 6 cada uno), por rango de source_id (indexado), G < 15. Un lote
     solo se da por bueno si sus filas, agrupadas por la celda de su source_id
     y por tramo, coinciden EXACTAMENTE con los histogramas de la pasada 1. El
     CSV no avisa si MAXREC recorta: filas == MAXREC es un fallo.
  3. CELDAS (local, sin red). Junta todos los lotes y reparte cada estrella en
     la celda de su POSICIÓN —la ra/dec float32 que se guarda—, no la de su
     source_id: el source_id se calculó con una posición de otra época de la
     reducción y en los bordes cae en la celda vecina (E4 del ADR 0012: 2 de
     3871). Escribe las 49 152 celdas, también las vacías (0 filas, con
     histograma): un 404 significa siempre «Avance no disponible».

Histograma de la cabecera: los tramos de G < 15 salen de las filas del propio
fichero (por posición), así que su suma es exactamente el nº de filas. Los de
G ≥ 15 salen del GROUP BY (por source_id): para una pista de densidad, la
diferencia en los bordes es irrelevante.

Formato de una celda (little-endian), avance/n6/<ipix>.bin:
  cabecera (188 B):
    firma   4s  b'BAVG'
    versión u16 VERSION_FORMATO
    nivel   u8  6
    (cero)  u8
    ipix    u32
    filas   u32
    tramos  u16 42
    paso    u16 500 (milésimas de mag por tramo; el tramo k es [k/2, (k+1)/2))
    hist    42 × u32
  filas (12 B cada una, ordenadas por G ascendente):
    ra   f32 (°, ICRS, época 2016.0)    dec f32 (°)
    G    u16 = floor(G·1000)            — floor y no round: 14,9996 no puede
                                          cruzar la frontera G = 15.
    BP−RP i16 = round(BP−RP·1000), CENTINELA_BPRP (−32768) si es nulo.

GAVO es un servicio universitario: nunca más de MAX_JOBS_GAVO (2) jobs a la vez,
espera bloqueante de UWS (WAIT) en vez de sondear, y cada job se borra al
recoger su resultado.

Uso:
  python3 scripts/gen_avance_gaia.py                    # generación completa
  python3 scripts/gen_avance_gaia.py --medir 7          # mide 7 lotes (112 celdas), incl. densos
  python3 scripts/gen_avance_gaia.py --campos m7,m13,polo   # solo lo que cubre esos campos
  python3 scripts/gen_avance_gaia.py --verificar        # AC 1 y 3 sobre lo generado
  python3 scripts/gen_avance_gaia.py --verificar-campos m7,m13,polo   # AC 4 contra GAVO
Opciones: --salida DIR (simulador_ocular/avance) · --trabajo DIR (.scratch/avance_gaia)

Publicar (ver simulador_ocular/README.md): primero avance/n6/ por FTP a
wp-content/uploads/bitacora/avance/n6/, y el manifiesto el ÚLTIMO.
"""
import argparse
import concurrent.futures
import csv
import datetime
import io
import json
import math
import os
import ssl
import struct
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'simulador_ocular', 'avance')
TRABAJO = os.path.join(RAIZ, '.scratch', 'avance_gaia')

TAP = 'https://dc.zah.uni-heidelberg.de/tap'
TABLA = 'gaia.dr3lite'
CATALOGO = 'Gaia DR3'

NIVEL = 6
NIVEL_LOTE = 4
NIVEL_HIST = 2
FRONTERA = 15.0
PASO_MIL = 500                       # 0,5 mag
NTRAMOS = 42                         # G 0 … 21
TRAMOS_AVANCE = int(FRONTERA * 1000) // PASO_MIL   # 30: tramos de G < 15
P235 = 2 ** 35
FIRMA = b'BAVG'
VERSION_FORMATO = 1
CENTINELA_BPRP = -32768
CABECERA = struct.Struct('<4sHBBIIHH')
TAM_CABECERA = CABECERA.size + 4 * NTRAMOS        # 188
DTYPE_FILA = np.dtype([('ra', '<f4'), ('dec', '<f4'), ('g', '<u2'), ('bprp', '<i2')])
assert DTYPE_FILA.itemsize == 12

MAX_JOBS_GAVO = 2
MAXREC_LOTE = 3_000_000
MAXREC_HIST = 1_000_000
PLAZO_JOB_S = 7200
REINTENTOS = 4

# Campos de control del AC 4 (mismos centros que el E4 del ADR 0012).
RADIO_CONTROL = 0.89
CAMPOS = {
    'm7': (268.447, -34.841),
    'm13': (250.423, 36.460),
    'polo': (192.86, 27.13),
    'm6': (265.069, -32.242),
}


def nceldas(nivel):
    return 12 * 4 ** nivel


# ───────────────────────── HEALPix nested ─────────────────────────

def ang2pix_nest(nivel, ra, dec):
    """ipix HEALPix NESTED de (ra, dec) en grados, vectorizado (Górski et al.
    2005; misma construcción que ang2pixNest de harness_gaia_e4_barrido.js,
    contrastada con ivo_healpix_index de GAVO en test_avance_gaia.py)."""
    ra = np.asarray(ra, dtype=np.float64)
    dec = np.asarray(dec, dtype=np.float64)
    nside = 1 << nivel
    z = np.sin(np.radians(dec))
    za = np.abs(z)
    tt = np.mod(np.mod(ra, 360.0) / 90.0, 4.0)          # 2φ/π en [0, 4)

    # Zona ecuatorial.
    t1 = nside * (0.5 + tt)
    t2 = nside * (z * 0.75)
    jp = np.floor(t1 - t2).astype(np.int64)
    jm = np.floor(t1 + t2).astype(np.int64)
    ifp = jp >> nivel
    ifm = jm >> nivel
    face_e = np.where(ifp == ifm, (ifp & 3) + 4, np.where(ifp < ifm, ifp & 3, (ifm & 3) + 8))
    ix_e = jm & (nside - 1)
    iy_e = nside - 1 - (jp & (nside - 1))

    # Casquetes polares.
    ntt = np.minimum(np.floor(tt).astype(np.int64), 3)
    tp = tt - ntt
    tmp = nside * np.sqrt(3.0 * (1.0 - za))
    jp_p = np.minimum(np.floor(tp * tmp).astype(np.int64), nside - 1)
    jm_p = np.minimum(np.floor((1.0 - tp) * tmp).astype(np.int64), nside - 1)
    norte = z >= 0
    face_p = np.where(norte, ntt, ntt + 8)
    ix_p = np.where(norte, nside - jm_p - 1, jp_p)
    iy_p = np.where(norte, nside - jp_p - 1, jm_p)

    ecu = za <= 2.0 / 3.0
    face = np.where(ecu, face_e, face_p)
    ix = np.where(ecu, ix_e, ix_p)
    iy = np.where(ecu, iy_e, iy_p)
    pix = np.zeros_like(ix)
    for b in range(nivel):
        pix |= ((ix >> b) & 1) << (2 * b)
        pix |= ((iy >> b) & 1) << (2 * b + 1)
    return face * nside * nside + pix


def rango_source_id(nivel, ipix):
    """[lo, hi] de source_id de las fuentes cuya celda de nivel `nivel` es ipix."""
    d = 4 ** (12 - nivel) * P235
    return ipix * d, (ipix + 1) * d - 1


def celda_de_source_id(source_id, nivel=NIVEL):
    return np.asarray(source_id, dtype=np.int64) // (4 ** (12 - nivel) * P235)


def distancia_angular(ra1, dec1, ra2, dec2):
    r = np.pi / 180
    s = (np.sin((dec2 - dec1) * r / 2) ** 2
         + np.cos(dec1 * r) * np.cos(dec2 * r) * np.sin((ra2 - ra1) * r / 2) ** 2)
    return 2 * np.degrees(np.arcsin(np.sqrt(np.clip(s, 0, 1))))


def celdas_del_cono(ra, dec, radio, nivel=NIVEL):
    """Celdas de `nivel` que tocan el cono. Muestreo denso (paso lado/32 sobre una
    rejilla tangente), como celdasDelCampo del E4: deja solo tangencias de
    centésimas de grado, que el margen del llamador absorbe."""
    lado = math.sqrt(41253.0 / nceldas(nivel))
    paso = lado / 32
    n = int(math.ceil(radio / paso))
    d = np.arange(-n, n + 1) * paso
    dx, dy = np.meshgrid(d, d)
    dentro = dx * dx + dy * dy <= radio * radio
    # Más el anillo del borde, a paso de 1/256 de lado: una celda que solo roza
    # el cono entre dos puntos de la rejilla no se escapa.
    ang = np.linspace(0, 2 * np.pi, max(64, int(2 * np.pi * radio / (lado / 256))), endpoint=False)
    dx = np.r_[dx[dentro], radio * np.cos(ang)]
    dy = np.r_[dy[dentro], radio * np.sin(ang)]
    decs = np.clip(dec + dy, -90.0, 90.0)
    ras = ra + dx / max(math.cos(math.radians(dec)), 1e-6)
    pts = ang2pix_nest(nivel, ras, decs)
    # El centro siempre, aunque el muestreo no lo pise (radio < paso).
    return sorted(set(pts.tolist()) | {int(ang2pix_nest(nivel, ra, dec))})


# ───────────────────────── Codificación ─────────────────────────

def codificar_filas(ra, dec, g, bprp):
    """Filas → array estructurado de 12 B. G con floor (frontera G = 15 intacta),
    BP−RP con round y centinela para el nulo."""
    ra = np.asarray(ra, dtype=np.float64)
    g = np.asarray(g, dtype=np.float64)
    bprp = np.asarray(bprp, dtype=np.float64)
    if np.any(~np.isfinite(g)) or np.any(g < 0) or np.any(g >= FRONTERA):
        raise ValueError('G fuera de [0, 15) en el Avance')
    filas = np.empty(len(ra), dtype=DTYPE_FILA)
    filas['ra'] = np.mod(ra, 360.0)
    filas['dec'] = dec
    gm = np.floor(g * 1000.0).astype(np.int64)
    if gm.size and gm.max() >= FRONTERA * 1000:
        raise ValueError('G codificada ≥ 15000')
    filas['g'] = gm
    nulo = ~np.isfinite(bprp)
    c = np.clip(np.round(np.where(nulo, 0.0, bprp) * 1000.0), -32767, 32767).astype(np.int16)
    c[nulo] = CENTINELA_BPRP
    filas['bprp'] = c
    # float32 de ra puede redondear 359,99999… a 360,0: se pliega a 0.
    filas['ra'][filas['ra'] >= np.float32(360.0)] = 0.0
    return filas


def decodificar_filas(filas):
    """Array estructurado → dict de floats (G en mag, BP−RP NaN si nulo)."""
    bprp = filas['bprp'].astype(np.float64) / 1000.0
    bprp[filas['bprp'] == CENTINELA_BPRP] = np.nan
    return {
        'ra': filas['ra'].astype(np.float64),
        'dec': filas['dec'].astype(np.float64),
        'g': filas['g'].astype(np.float64) / 1000.0,
        'bprp': bprp,
    }


def celda_de_filas(filas, nivel=NIVEL):
    """Celda por POSICIÓN, calculada sobre la ra/dec float32 que se guarda: así
    leer el fichero y volver a calcular la celda da siempre la misma."""
    return ang2pix_nest(nivel, filas['ra'].astype(np.float64), filas['dec'].astype(np.float64))


def tramos_de_g(g_mil):
    """Tramo de 0,5 mag de una G en milésimas (floor(G·1000) // 500 = floor(2G))."""
    return np.asarray(g_mil, dtype=np.int64) // PASO_MIL


def histograma_celda(filas, hist_source_id):
    """Cabecera: tramos < 15 de las filas del fichero, tramos ≥ 15 del GROUP BY."""
    h = np.zeros(NTRAMOS, dtype=np.int64)
    if hist_source_id is not None:
        h[TRAMOS_AVANCE:] = np.asarray(hist_source_id, dtype=np.int64)[TRAMOS_AVANCE:]
    h[:TRAMOS_AVANCE] = np.bincount(tramos_de_g(filas['g']), minlength=TRAMOS_AVANCE)[:TRAMOS_AVANCE]
    return h


def bytes_celda(nivel, ipix, filas, hist):
    filas = np.sort(filas, order=['g', 'ra', 'dec'], kind='stable')
    cab = CABECERA.pack(FIRMA, VERSION_FORMATO, nivel, 0, ipix, len(filas), NTRAMOS, PASO_MIL)
    return cab + np.asarray(hist, dtype='<u4').tobytes() + filas.tobytes()


def leer_celda(datos):
    """bytes → dict; ValueError si no es una celda íntegra."""
    if len(datos) < TAM_CABECERA:
        raise ValueError('celda truncada')
    firma, ver, nivel, _, ipix, n, ntramos, paso = CABECERA.unpack_from(datos)
    if firma != FIRMA or ver != VERSION_FORMATO or ntramos != NTRAMOS or paso != PASO_MIL:
        raise ValueError('cabecera desconocida')
    if len(datos) != TAM_CABECERA + DTYPE_FILA.itemsize * n:
        raise ValueError('tamaño incoherente con el nº de filas')
    hist = np.frombuffer(datos, dtype='<u4', count=NTRAMOS, offset=CABECERA.size).astype(np.int64)
    filas = np.frombuffer(datos, dtype=DTYPE_FILA, count=n, offset=TAM_CABECERA)
    return {'nivel': nivel, 'ipix': ipix, 'n': n, 'hist': hist, 'filas': filas}


def ruta_celda(salida, ipix, nivel=NIVEL):
    return os.path.join(salida, 'n%d' % nivel, '%d.bin' % ipix)


def escribir_atomico(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + '.tmp%d' % os.getpid()
    with open(tmp, 'wb') as fh:
        fh.write(datos)
    os.replace(tmp, ruta)


def escribir_celdas(salida, filas, hists, nivel=NIVEL, solo=None):
    """Pasada 3. Reparte `filas` por posición y escribe cada celda de `nivel`
    (todas, o las de `solo`). Una celda cuyo fichero ya es byte a byte el que
    tocaría escribir se salta. Devuelve (escritas, saltadas, total_filas)."""
    ip = celda_de_filas(filas, nivel)
    orden = np.argsort(ip, kind='stable')
    ip_ord = ip[orden]
    celdas = range(nceldas(nivel)) if solo is None else sorted(solo)
    escritas = saltadas = total = 0
    for c in celdas:
        a, b = np.searchsorted(ip_ord, [c, c + 1])
        sub = filas[orden[a:b]]
        datos = bytes_celda(nivel, c, sub, histograma_celda(sub, hists.get(c)))
        ruta = ruta_celda(salida, c, nivel)
        total += len(sub)
        try:
            with open(ruta, 'rb') as fh:
                if fh.read() == datos:
                    saltadas += 1
                    continue
        except FileNotFoundError:
            pass
        escribir_atomico(ruta, datos)
        escritas += 1
    return escritas, saltadas, total


# ───────────────────────── Verificación de lotes ─────────────────────────

def comprobar_lote(source_id, hists, celdas_lote, nfilas_maxrec=MAXREC_LOTE):
    """El lote es completo si cada celda de source_id trae exactamente las filas
    G < 15 que cuenta el GROUP BY. Se compara el total de la celda y no tramo a
    tramo: el CSV redondea G y una estrella en G = k/2 exacto podría cambiar de
    tramo; el filtro G < 15 lo aplica el servidor igual en las dos consultas.
    Devuelve None o el motivo."""
    if len(source_id) >= nfilas_maxrec:
        return 'filas == MAXREC: el servidor puede haber recortado'
    cs = celda_de_source_id(source_id)
    celdas_lote = list(celdas_lote)
    base = celdas_lote[0]
    rel = cs - base
    if len(cs) and (rel.min() < 0 or rel.max() >= len(celdas_lote)):
        return 'filas fuera del rango de source_id del lote'
    obt = np.bincount(rel, minlength=len(celdas_lote))
    for i, c in enumerate(celdas_lote):
        esp = int(np.sum(hists.get(c, [0] * NTRAMOS)[:TRAMOS_AVANCE]))
        if obt[i] != esp:
            return 'celda %d: %d filas, el histograma dice %d' % (c, obt[i], esp)
    return None


def celdas_hijas(nivel_padre, ipix, nivel=NIVEL):
    k = 4 ** (nivel - nivel_padre)
    return range(ipix * k, (ipix + 1) * k)


# ───────────────────────── Concurrencia ─────────────────────────

def en_paralelo(fn, tareas, max_jobs=MAX_JOBS_GAVO):
    """Ejecuta fn(t) para cada tarea con a lo sumo max_jobs a la vez (≤ 2 por
    GAVO). Devuelve [(tarea, resultado | excepción)] en orden de llegada."""
    if not 1 <= max_jobs <= MAX_JOBS_GAVO:
        raise ValueError('GAVO: como mucho %d jobs simultáneos' % MAX_JOBS_GAVO)
    out = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_jobs) as ex:
        futs = {ex.submit(fn, t): t for t in tareas}
        for f in concurrent.futures.as_completed(futs):
            try:
                out.append((futs[f], f.result()))
            except Exception as e:  # noqa: BLE001 — se informa y se sigue
                out.append((futs[f], e))
    return out


# ───────────────────────── TAP asíncrono (red) ─────────────────────────

def _contexto_ssl():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


_SSL = _contexto_ssl()


class _SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_abrir_sin_redir = urllib.request.build_opener(
    _SinRedireccion, urllib.request.HTTPSHandler(context=_SSL)).open


def _http(url, datos=None, metodo=None, timeout=300):
    req = urllib.request.Request(url, data=datos, method=metodo,
                                 headers={'User-Agent': 'bitacoraestelar-gen-avance/1'})
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as r:
        return r.read()


class JobFallido(RuntimeError):
    """El job UWS terminó en ERROR o ABORTED (no un fallo de red)."""


def tap_async(adql, maxrec):
    """Un job UWS en GAVO: crea, lanza, espera (WAIT bloqueante), recoge el CSV
    y borra el job. Reintenta con espera exponencial."""
    for intento in range(REINTENTOS + 1):
        job = None
        try:
            datos = urllib.parse.urlencode({
                'REQUEST': 'doQuery', 'LANG': 'ADQL', 'QUERY': adql,
                'RESPONSEFORMAT': 'csv', 'MAXREC': str(maxrec),
                'EXECUTIONDURATION': str(PLAZO_JOB_S)}).encode()
            try:
                _abrir_sin_redir(urllib.request.Request(TAP + '/async', data=datos), timeout=120)
                raise RuntimeError('UWS: el POST no devolvió 303')
            except urllib.error.HTTPError as e:
                if e.code not in (301, 302, 303):
                    raise
                job = e.headers['Location']
            _http(job + '/phase', b'PHASE=RUN')
            t0 = time.time()
            while True:
                if time.time() - t0 > PLAZO_JOB_S + 600:
                    # Como un ERROR del servidor: repetirlo igual no cabría
                    # tampoco; el llamador lo parte.
                    raise JobFallido('job sin terminar tras el plazo')
                try:
                    fase = _http(job + '/phase', timeout=60).decode().strip()
                except urllib.error.HTTPError as e:
                    if e.code == 404:          # job borrado o caducado: no esperar más
                        raise RuntimeError('el job ya no existe (404)')
                    time.sleep(30)
                    continue
                except (urllib.error.URLError, OSError):
                    time.sleep(30)
                    continue
                if fase in ('COMPLETED', 'ERROR', 'ABORTED'):
                    break
                antes = time.time()
                # Un plazo agotado aquí NO es un fallo del job: se vuelve a
                # esperar. Reintentar desde fuera borraría el job y lo
                # relanzaría desde cero (medido: un histograma denso no
                # terminaba nunca por eso).
                try:
                    _http(job + '?WAIT=60', timeout=90)
                except (urllib.error.URLError, OSError):
                    pass
                if time.time() - antes < 2:      # el servidor no bloquea: no machacarlo
                    time.sleep(5)
            if fase != 'COMPLETED':
                raise JobFallido('job %s: %s' % (fase, _http(job + '/error')[:300]))
            cuerpo = _http(job + '/results/result', timeout=1800).decode()
            return list(csv.reader(io.StringIO(cuerpo)))
        except Exception as e:  # noqa: BLE001
            # Un job que el servidor da por fallido (plazo, error de la
            # consulta) no se repite igual: lo decide el llamador.
            if intento >= REINTENTOS or isinstance(e, JobFallido):
                raise
            espera = 30 * 2 ** intento
            print('    %s — reintento en %ds' % (str(e)[:100], espera), flush=True)
            time.sleep(espera)
        finally:
            if job:
                try:
                    _http(job, metodo='DELETE')
                except Exception:  # noqa: BLE001 — un job sin borrar caduca solo
                    pass


def adql_hist(region, nivel=NIVEL_HIST):
    lo, hi = rango_source_id(nivel, region)
    return ('SELECT source_id/%d AS ipix, FLOOR(phot_g_mean_mag*2) AS t, COUNT(*) AS n'
            ' FROM %s WHERE source_id BETWEEN %d AND %d AND phot_g_mean_mag < %d'
            ' GROUP BY ipix, t' % (4 ** (12 - NIVEL) * P235, TABLA, lo, hi, NTRAMOS // 2))


def adql_lote(lote):
    lo, hi = rango_source_id(NIVEL_LOTE, lote)
    return ('SELECT source_id, ra, dec, phot_g_mean_mag AS g,'
            ' phot_bp_mean_mag-phot_rp_mean_mag AS bprp FROM %s'
            ' WHERE source_id BETWEEN %d AND %d AND phot_g_mean_mag < %s'
            % (TABLA, lo, hi, repr(FRONTERA)))


def adql_cono(ra, dec, radio):
    return ('SELECT ra, dec, phot_g_mean_mag AS g FROM %s WHERE phot_g_mean_mag < %s'
            " AND 1=CONTAINS(POINT('ICRS',ra,dec), CIRCLE('ICRS',%r,%r,%r))"
            % (TABLA, repr(FRONTERA), ra, dec, radio))


def _num(v):
    return float(v) if v not in ('', None) else np.nan


# ───────────────────────── Pasadas 1 y 2 (reanudables) ─────────────────────────

def ruta_hist(trabajo, region):
    return os.path.join(trabajo, 'hist', '%d.json' % region)


def ruta_lote(trabajo, lote):
    return os.path.join(trabajo, 'lotes', '%d.npz' % lote)


def leer_hist(trabajo, region):
    """{ipix: [42]} de una región, o None si no está (o está corrupta)."""
    try:
        with open(ruta_hist(trabajo, region)) as fh:
            d = json.load(fh)
        if d.get('completo') is not True or d.get('region') != region:
            return None
        return {int(k): v for k, v in d['hist'].items()}
    except (OSError, ValueError, KeyError):
        return None


def bajar_hist(trabajo, region, tap=tap_async):
    if leer_hist(trabajo, region) is not None:
        return 'saltada'
    try:
        partes = [tap(adql_hist(region), MAXREC_HIST)]
    except JobFallido:
        # El plano galáctico: si el GROUP BY de la región no cabe en un job
        # (límite de 7200 s), se parte en sus 4 hijas de nivel NIVEL_HIST+1,
        # una detrás de otra (sigue siendo un solo job de este hilo).
        print('    región %d no cabe en un job: se parte en 4' % region, flush=True)
        partes = [tap(adql_hist(h, NIVEL_HIST + 1), MAXREC_HIST)
                  for h in celdas_hijas(NIVEL_HIST, region, NIVEL_HIST + 1)]
    if any(len(p) - 1 >= MAXREC_HIST for p in partes):
        raise RuntimeError('histograma recortado por MAXREC')
    hist = {}
    for ip, t, n in (f for p in partes for f in p[1:]):
        if t == '':
            continue
        t = int(float(t))
        if 0 <= t < NTRAMOS:
            hist.setdefault(int(ip), [0] * NTRAMOS)[t] += int(n)
    validas = set(celdas_hijas(NIVEL_HIST, region))
    if not set(hist) <= validas:
        raise RuntimeError('histograma con celdas fuera de la región')
    escribir_atomico(ruta_hist(trabajo, region), json.dumps(
        {'region': region, 'completo': True, 'hist': {str(k): v for k, v in sorted(hist.items())}}).encode())
    return 'bajada'


def leer_lote(trabajo, lote, hists):
    """Filas codificadas + source_id de un lote ya bajado y que sigue cuadrando
    con los histogramas; None si falta o no cuadra (se vuelve a bajar)."""
    try:
        with np.load(ruta_lote(trabajo, lote)) as z:
            filas, sid = z['filas'], z['source_id']
    except (OSError, ValueError, KeyError, EOFError, zipfile.BadZipFile):
        return None
    if filas.dtype != DTYPE_FILA:
        return None
    if len(filas) != len(sid):
        return None
    if comprobar_lote(sid, hists, celdas_hijas(NIVEL_LOTE, lote)) is not None:
        return None
    return filas


def bajar_lote(trabajo, lote, hists, tap=tap_async):
    if leer_lote(trabajo, lote, hists) is not None:
        return 'saltado'
    filas_csv = tap(adql_lote(lote), MAXREC_LOTE)[1:]
    sid = np.array([int(f[0]) for f in filas_csv], dtype=np.int64)
    filas = codificar_filas([float(f[1]) for f in filas_csv], [float(f[2]) for f in filas_csv],
                            [float(f[3]) for f in filas_csv], [_num(f[4]) for f in filas_csv])
    motivo = comprobar_lote(sid, hists, celdas_hijas(NIVEL_LOTE, lote))
    if motivo:
        raise RuntimeError('lote %d incompleto: %s' % (lote, motivo))
    buf = io.BytesIO()
    np.savez(buf, filas=filas, source_id=sid)
    escribir_atomico(ruta_lote(trabajo, lote), buf.getvalue())
    return 'bajado (%d filas)' % len(filas)


def _correr(nombre, fn, tareas):
    tareas = list(tareas)
    t0 = time.time()
    hechas = [0]
    cerrojo = threading.Lock()

    def uno(t):
        r = fn(t)
        with cerrojo:
            hechas[0] += 1
            if r not in ('saltada', 'saltado') or hechas[0] % 200 == 0:
                print('  %s %d: %s  [%d/%d, %.0fs]' % (nombre, t, r, hechas[0], len(tareas),
                                                     time.time() - t0), flush=True)
        return r

    res = en_paralelo(uno, tareas)
    fallos = [(t, e) for t, e in res if isinstance(e, Exception)]
    for t, e in fallos:
        print('  %s %d: FALLO %s' % (nombre, t, str(e)[:160]), flush=True)
    return fallos, time.time() - t0


def cargar_hists(trabajo, regiones):
    hists = {}
    for r in regiones:
        h = leer_hist(trabajo, r)
        if h is None:
            raise RuntimeError('falta el histograma de la región %d' % r)
        hists.update(h)
    return hists


def generar(salida, trabajo, lotes, solo_celdas=None):
    """Pasadas 1-3 sobre `lotes` (nivel NIVEL_LOTE). Con `solo_celdas` escribe
    solo esas celdas y no publica manifiesto (generación parcial)."""
    lotes = sorted(set(lotes))
    k = 4 ** (NIVEL_LOTE - NIVEL_HIST)
    regiones = sorted({l // k for l in lotes})
    print('Pasada 1: %d histogramas (nivel %d)' % (len(regiones), NIVEL_HIST), flush=True)
    fallos, s1 = _correr('hist', lambda r: bajar_hist(trabajo, r), regiones)
    if fallos:
        raise SystemExit('Pasada 1 incompleta: relanza para reintentar (%d fallos)' % len(fallos))
    hists = cargar_hists(trabajo, regiones)

    print('Pasada 2: %d lotes (nivel %d)' % (len(lotes), NIVEL_LOTE), flush=True)
    fallos, s2 = _correr('lote', lambda l: bajar_lote(trabajo, l, hists), lotes)
    if fallos:
        raise SystemExit('Pasada 2 incompleta: relanza para reintentar (%d fallos)' % len(fallos))

    print('Pasada 3: celdas por posición', flush=True)
    partes = [leer_lote(trabajo, l, hists) for l in lotes]
    filas = np.concatenate(partes) if partes else np.empty(0, DTYPE_FILA)
    escritas, saltadas, total = escribir_celdas(salida, filas, hists, solo=solo_celdas)
    print('  %d celdas escritas, %d ya estaban, %d filas' % (escritas, saltadas, total), flush=True)
    if solo_celdas is None:
        escribir_manifiesto(salida, total)
    return {'s_hist': s1, 's_lotes': s2, 'filas': total, 'escritas': escritas, 'saltadas': saltadas}


def manifiesto(total):
    return {
        'version': VERSION_FORMATO,
        'catalogo': CATALOGO,
        'tabla': TABLA + ' (GAVO)',
        'nivel': NIVEL,
        'esquema': 'HEALPix nested',
        'celdas': nceldas(NIVEL),
        'frontera': FRONTERA,
        'filas': int(total),
        'tramos': {'n': NTRAMOS, 'paso': PASO_MIL / 1000.0, 'desde': 0.0},
        'ruta': 'n%d/{ipix}.bin' % NIVEL,
        'fecha': datetime.date.today().isoformat(),
    }


def escribir_manifiesto(salida, total):
    escribir_atomico(os.path.join(salida, 'manifiesto.json'),
                     (json.dumps(manifiesto(total), ensure_ascii=False, indent=1) + '\n').encode())


# ───────────────────────── Verificación (AC 1, 3 y 4) ─────────────────────────

ESPERADO_G15 = 36_897_335      # GAVO dr3lite, 2026-11-08 (#516)


def recuento_group_by(trabajo, nivel=NIVEL):
    """Suma de los tramos G < 15 de los histogramas que devolvió GAVO (pasada 1),
    por source_id. Es la cifra independiente para el AC 1: la cabecera de cada
    celda la recalcula de sus propias filas, así que compararla con las filas
    sería tautológico. None si falta alguna región."""
    total = 0
    for r in range(nceldas(NIVEL_HIST)):
        h = leer_hist(trabajo, r)
        if h is None:
            return None
        total += sum(sum(v[:TRAMOS_AVANCE]) for v in h.values())
    return total


def verificar_salida(salida, nivel=NIVEL):
    """AC 1 y 3: todas las celdas existen e íntegras y suma de filas ≈ esperado.
    (El cruce con el GROUP BY lo hace recuento_group_by.)"""
    faltan, malas, filas, hist15, vacias = [], [], 0, 0, 0
    for c in range(nceldas(nivel)):
        try:
            with open(ruta_celda(salida, c, nivel), 'rb') as fh:
                d = leer_celda(fh.read())
        except FileNotFoundError:
            faltan.append(c)
            continue
        except ValueError as e:
            malas.append((c, str(e)))
            continue
        if d['ipix'] != c or d['nivel'] != nivel:
            malas.append((c, 'ipix/nivel de la cabecera'))
            continue
        filas += d['n']
        hist15 += int(d['hist'][:TRAMOS_AVANCE].sum())
        vacias += d['n'] == 0
    return {'faltan': faltan, 'malas': malas, 'filas': filas, 'hist15': hist15, 'vacias': vacias,
            'desvio': (filas - ESPERADO_G15) / ESPERADO_G15}


def leer_cono(salida, ra, dec, radio):
    """Lo que hará el cliente: leer las celdas del cono y recortar al cono."""
    partes = []
    for c in celdas_del_cono(ra, dec, radio + 0.05):
        try:
            with open(ruta_celda(salida, c), 'rb') as fh:
                partes.append(leer_celda(fh.read())['filas'])
        except FileNotFoundError:
            raise SystemExit('falta la celda %d: genera antes con --campos' % c)
    filas = np.concatenate(partes)
    d = decodificar_filas(filas)
    dentro = distancia_angular(d['ra'], d['dec'], ra, dec) <= radio
    return {k: v[dentro] for k, v in d.items()}


def emparejar(a_ra, a_dec, b_ra, b_dec, tol_arcsec=0.3):
    """Cuántas de A no tienen pareja en B a < tol, y viceversa (por posición)."""
    from scipy.spatial import cKDTree

    def unit(ra, dec):
        ra, dec = np.radians(ra), np.radians(dec)
        return np.c_[np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)]
    cuerda = 2 * math.sin(math.radians(tol_arcsec / 3600) / 2)
    ua, ub = unit(a_ra, a_dec), unit(b_ra, b_dec)
    sin_a = (cKDTree(ub).query(ua, k=1)[0] > cuerda).sum() if len(ub) else len(ua)
    sin_b = (cKDTree(ua).query(ub, k=1)[0] > cuerda).sum() if len(ua) else len(ub)
    return int(sin_a), int(sin_b)


def lotes_de_campos(campos, margen=0.1):
    """Lotes que cubren las celdas de los campos más un margen: una estrella
    dentro del cono tiene su source_id a segundos de arco de su posición, así
    que su lote está entre estos."""
    celdas, lotes = set(), set()
    for nombre in campos:
        ra, dec = CAMPOS[nombre]
        celdas |= set(celdas_del_cono(ra, dec, RADIO_CONTROL + 0.05))
        lotes |= {c >> (2 * (NIVEL - NIVEL_LOTE)) for c in celdas_del_cono(ra, dec, RADIO_CONTROL + margen)}
    return sorted(lotes), sorted(celdas)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--salida', default=SALIDA)
    ap.add_argument('--trabajo', default=TRABAJO)
    ap.add_argument('--campos', help='genera solo lo que cubre estos campos (%s)' % ','.join(CAMPOS))
    ap.add_argument('--medir', type=int, metavar='N', help='mide N lotes (densos incluidos) y estima el total')
    ap.add_argument('--verificar', action='store_true', help='AC 1 y 3 sobre la salida')
    ap.add_argument('--verificar-campos', metavar='CAMPOS', help='AC 4: compara con GAVO')
    a = ap.parse_args()

    if a.verificar:
        v = verificar_salida(a.salida)
        print('celdas que faltan: %d · corruptas: %d · vacías: %d' % (len(v['faltan']), len(v['malas']), v['vacias']))
        print('filas: %d (esperado %d, desvío %+.4f %%) · histogramas G<15: %d'
              % (v['filas'], ESPERADO_G15, 100 * v['desvio'], v['hist15']))
        gb = recuento_group_by(a.trabajo)
        print('GROUP BY de GAVO, G<15: %s' % ('sin histogramas en ' + a.trabajo if gb is None else gb))
        ok = (not v['faltan'] and not v['malas'] and abs(v['desvio']) <= 0.001
              and v['hist15'] == v['filas'] and gb == v['filas'])
        print('AC 1 y 3:', 'PASA' if ok else 'NO PASA')
        sys.exit(0 if ok else 1)

    if a.verificar_campos:
        ok = True
        for nombre in a.verificar_campos.split(','):
            ra, dec = CAMPOS[nombre]
            av = leer_cono(a.salida, ra, dec, RADIO_CONTROL)
            ctl = tap_async(adql_cono(ra, dec, RADIO_CONTROL), MAXREC_LOTE)[1:]
            c_ra = np.array([float(f[0]) for f in ctl])
            c_dec = np.array([float(f[1]) for f in ctl])
            # Franja de 0,2″ en el borde del cono: el float32 mueve hasta ~0,05″
            # y una estrella rozando el borde puede quedar dentro en un lado y
            # fuera en el otro sin que falte nada.
            franja = 0.2 / 3600
            av_in = distancia_angular(av['ra'], av['dec'], ra, dec) <= RADIO_CONTROL - franja
            ctl_in = distancia_angular(c_ra, c_dec, ra, dec) <= RADIO_CONTROL - franja
            sin_av, sin_ctl = emparejar(c_ra[ctl_in], c_dec[ctl_in], av['ra'][av_in], av['dec'][av_in])
            print('%s: Avance %d · GAVO %d · de GAVO sin pareja %d · del Avance sin pareja %d'
                  % (nombre, av_in.sum(), ctl_in.sum(), sin_av, sin_ctl), flush=True)
            ok &= sin_av == 0 and sin_ctl == 0 and av_in.sum() == ctl_in.sum()
        print('AC 4:', 'PASA' if ok else 'NO PASA')
        sys.exit(0 if ok else 1)

    if a.campos:
        lotes, celdas = lotes_de_campos(a.campos.split(','))
        print('Campos %s: %d lotes, %d celdas' % (a.campos, len(lotes), len(celdas)))
        generar(a.salida, a.trabajo, lotes, solo_celdas=celdas)
        return

    if a.medir is not None:
        if a.medir < 1:
            raise SystemExit('--medir necesita al menos 1 lote')
        # Los densos (M7, M6) primero: estimar con cielo vacío engaña.
        densos = [ang2pix_nest(NIVEL_LOTE, *CAMPOS[c]).item() for c in ('m7', 'm6')]
        resto = np.linspace(0, nceldas(NIVEL_LOTE) - 1, max(a.medir - len(densos), 0)).astype(int).tolist()
        lotes = sorted(set(densos + resto))[:a.medir]
        t0 = time.time()
        r = generar(a.salida, a.trabajo, lotes, solo_celdas=[])
        s = time.time() - t0
        print('Medida: %d lotes (%d celdas) en %.0fs → estimación de los %d lotes: %.1f h a %d jobs'
              % (len(lotes), 16 * len(lotes), s, nceldas(NIVEL_LOTE),
                 r['s_lotes'] * nceldas(NIVEL_LOTE) / len(lotes) / 3600, MAX_JOBS_GAVO))
        return

    generar(a.salida, a.trabajo, range(nceldas(NIVEL_LOTE)))


if __name__ == '__main__':
    main()
