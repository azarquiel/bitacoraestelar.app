#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════
 generar_niveles.py — pipeline de generación de placas para el
 simulador de oculares.

 Descarga los recortes FITS de Pan-STARRS DR2 (imagen + máscara) desde
 MAST, mosaica los skycells necesarios, reconstruye los núcleos
 estelares saturados con la PSF medida del propio campo y el flujo de
 Gaia DR3, y exporta una pirámide de PNG de 16 bits LINEALES más un
 JSON con la calibración.

 El PNG NO está tonemapeado: lleva flujo calibrado. El navegador hace
 la fotometría (pupila de salida, Blackwell, adaptación retiniana) en
 vivo a partir del punto cero del JSON.

 Uso:
     python3 generar_niveles.py                 # todo el catálogo
     python3 generar_niveles.py M13 M8          # solo esos objetos
     python3 generar_niveles.py --listar        # ver catálogo y salir

 Requiere:
     pip install astropy numpy scipy requests reproject photutils pillow
═══════════════════════════════════════════════════════════════════════
"""

import argparse
import io
import json
import sys
import time
import warnings
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import requests

from astropy.io import fits
from astropy.table import Table
from astropy.wcs import WCS, FITSFixedWarning
from astropy.coordinates import SkyCoord
from astropy.nddata import block_reduce
import astropy.units as u

# PS1 usa la convención antigua PC001001 y no pone DATE-OBS: astropy
# lo arregla solo y avisa de ello. Son avisos cosméticos.
warnings.simplefilter("ignore", FITSFixedWarning)

from reproject import reproject_interp
from reproject.mosaicking import find_optimal_celestial_wcs, reproject_and_coadd

from scipy.ndimage import label, binary_dilation, center_of_mass

from PIL import Image


# ═══════════════════════════════════════════════════════════════════
#  CONFIGURACIÓN — todo lo ajustable vive aquí
# ═══════════════════════════════════════════════════════════════════

# ── Pirámide de niveles ────────────────────────────────────────────
# Cada nivel se DESCARGA de MAST ya al tamaño que necesita (hips2fits /
# fitscut aceptan el tamaño de salida), así no bajamos 2° a resolución
# nativa —que serían decenas de skycells y horas— para luego reducir.
#
# Solo el nivel fino reconstruye núcleos con PSF: a bajo aumento los
# núcleos saturados son puntos que la reducción disuelve sola, y
# reconstruirlos ahí cuesta mucho y no se ve. Los niveles anchos se
# bajan limpios y rápidos.
#
# Campos elegidos para cubrir tus oculares (tel. 1200 mm):
#   5 mm  → 0.14°   ┐
#   8 mm  → 0.22°   ├ nivel fino 0.25°
#  17.5   → 1.06°   ┐ niveles anchos
#  31 mm  → 1.9°    ┘

@dataclass
class Nivel:
    campo_deg: float
    px: int              # lado del PNG (= tamaño de descarga)
    reconstruir: bool    # PSF sobre núcleos saturados

NIVELES = [
    Nivel(2.00, 3000, reconstruir=False),   # 2.4"/px — vista de conjunto
    Nivel(0.70, 3000, reconstruir=False),   # 0.84"/px — intermedio
    Nivel(0.25, 3600, reconstruir=True),    # 0.25"/px NATIVO, con PSF
]
# El nivel fino a 3600 px = 0.25°/0.25"px: resolución nativa exacta de
# PS1, sin reescalado. Los anchos a 3000 px se piden ya reducidos.

BANDA = "i"           # banda PS1: i es buena para visual (r también vale)
SALIDA = Path("placas")

# ── Rango de magnitudes del PNG ────────────────────────────────────
# El PNG guarda magnitud por píxel cuantizada entre estos límites.
# MAG_MIN debe cubrir los picos estelares más brillantes y MAG_MAX
# llegar bastante por debajo del fondo de cielo más oscuro.
# Referencia medida en PS1 banda i (ZP=25): pico M13 ≈ mag 9.0,
# fondo de M13 ≈ mag 14.7 por píxel a escala nativa.
MAG_MIN = 6.0      # más brillante representable
MAG_MAX = 24.0     # más tenue representable (por debajo: sin señal)

# ── Máscara PS1: especificación OFICIAL ────────────────────────────
# Leída de las claves MSKNAMnn de la cabecera del propio fichero
# stack.mask (MSKNAMnn documenta el bit nn → valor 2^nn):
#
#   bit  valor  nombre        significado
#   ──────────────────────────────────────────────────────────────
#    0       1  DETECTOR      defecto del detector
#    1       2  FLAT          problema en el flat
#    2       4  DARK          problema en el dark
#    3       8  BLANK         sin dato
#    4      16  CTE           mala transferencia de carga
#    5      32  SAT           SATURADO  ← el que buscábamos
#    6      64  LOW           señal anómalamente baja
#    7     128  SUSPECT       píxel dudoso
#    8     256  CR            rayo cósmico
#    9     512  SPIKE         púa de difracción
#   10    1024  GHOST         reflejo fantasma
#   11    2048  STREAK        traza (satélite, asteroide)
#   12    4096  STARCORE      núcleo de estrella
#   13    8192  CONV.BAD      convolución mala
#   14   16384  CONV.POOR     convolución pobre
#   15   32768  BURNTOOL      residuo de "burntool"
#
# Nota empírica clave: en M8 los 2.404 píxeles del bit 32 (SAT) son
# 100% NaN. Es decir, PS1 ANULA el pico saturado en vez de cliparlo,
# y de ahí los agujeros negros de las rosquillas en el JPEG de HiPS.
# STARCORE (4096) acompaña a SAT marcando el núcleo entero: se
# reconstruye también, pues el halo inmediato queda contaminado.

BIT_SAT      = 32      # SAT: saturado (anulado a NaN)
BIT_STARCORE = 4096    # STARCORE: núcleo estelar
BIT_BURNTOOL = 32768   # BURNTOOL: residuo del corrector de sangrado

# Núcleos a reconstruir con PSF + flujo de Gaia
BITS_SATURADO = BIT_SAT | BIT_STARCORE | BIT_BURNTOOL

# Píxeles sin dato fiable: se dejan como están (el nivel los promedia)
BITS_INVALIDO = (1 | 2 | 4 | 8 | 16 | 64 | 256 | 2048 | 8192)
#                DETECTOR FLAT DARK BLANK CTE LOW  CR  STREAK CONV.BAD

# Bits que NO se tocan: SUSPECT (128), SPIKE (512), GHOST (1024) y
# CONV.POOR (16384) marcan píxeles imperfectos pero con señal real;
# reconstruirlos sería inventar. SPIKE en particular es la púa de
# difracción, que el ojo SÍ ve en el ocular.

# ── Calibración (confirmada en la cabecera de skycell.0776.097, banda i) ──
#   HIERARCH FPA.ZP = 25.0        → punto cero de la stack
#   CELL.SATURATION = 1656713     → saturación NOMINAL de una exposición
#   sin BSOFTEN/BOFFSET           → datos lineales, no asinh
# Con eso:  mag = FPA.ZP - 2.5*log10(cuentas)
# y el brillo superficial sale dividiendo por (arcsec/px)².
#
# OJO: la stack suma 30 exposiciones, así que su máximo puede SUPERAR
# CELL.SATURATION legítimamente (en M13 se midió 2.601.729 > 1.656.713).
# Por eso NO se usa ese nivel para detectar saturación: mandaría la
# máscara, y solo ella.

# ── Reconstrucción ─────────────────────────────────────────────────
GAIA_MAG_MAX = 17.0    # no vale la pena reconstruir por debajo de esto
PSF_MIN_ESTRELLAS = 5  # menos que esto → PSF poco fiable, se avisa
PSF_TAMANO = 25        # lado en px de la ventana de ajuste de PSF

# ── Halos estelares ────────────────────────────────────────────────
# Las estrellas brillantes de PS1 arrastran halos extensos: las alas
# del Moffat del instrumento (luz dispersada), que el ojo en el ocular
# NO ve. Con QUITAR_HALOS, a cada estrella con G < HALO_G_MAX se le
# mide la amplitud EN LA PROPIA IMAGEN (anillo con fondo local), se le
# resta su Moffat y se le devuelve el mismo flujo total en una
# gaussiana compacta del mismo FWHM: puntual, sin alas, flujo intacto.
QUITAR_HALOS = True
HALO_G_MAX = 12.0

# ── Servicios ──────────────────────────────────────────────────────
PS1_FILENAMES = "https://ps1images.stsci.edu/cgi-bin/ps1filenames.py"
PS1_CUTOUT    = "https://ps1images.stsci.edu/cgi-bin/fitscut.cgi"
HIPS2FITS     = "https://alasky.cds.unistra.fr/hips-image-services/hips2fits"
VIZIER_TAP    = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"
GAIA_TAP      = "https://gea.esac.esa.int/tap-server/tap/sync"   # espejo oficial ESA
PS1_PX        = 0.25   # escala nativa de PS1, arcsec/px
TIMEOUT       = 180


# ── Catálogo de objetos ────────────────────────────────────────────
@dataclass
class Objeto:
    id: str
    nombre: str
    ra: float       # grados J2000
    dec: float

CATALOGO = [
    Objeto("M8",    "M8 · Nebulosa de la Laguna",    270.9042, -24.3867),
    Objeto("M13",   "M13 · Cúmulo de Hércules",      250.4235,  36.4613),
    Objeto("M27",   "M27 · Nebulosa Dumbbell",       299.9015,  22.7212),
    Objeto("M42",   "M42 · Nebulosa de Orión",        83.8221,  -5.3911),
    Objeto("M45",   "M45 · Las Pléyades",             56.7500,  24.1167),
    Objeto("M51",   "M51 · Galaxia Remolino",        202.4696,  47.1952),
    Objeto("M57",   "M57 · Nebulosa del Anillo",     283.3963,  33.0292),
    Objeto("M81",   "M81 · Galaxia de Bode",         148.8882,  69.0653),
    Objeto("M101",  "M101 · Galaxia del Molinete",   210.8025,  54.3488),
    Objeto("NGC869","NGC 869/884 · Doble Cúmulo",     35.0000,  57.1333),
]


# ═══════════════════════════════════════════════════════════════════
#  DESCARGA DE PAN-STARRS
# ═══════════════════════════════════════════════════════════════════

def skycells(ra, dec, campo_deg, banda):
    """
    Skycells de PS1 que cubren el campo pedido, con imagen y máscara.

    Los skycells miden ~0.4°, así que un campo grande cae sobre varios
    y el objeto rara vez está en el centro de uno. Se muestrea una
    rejilla que cubra el campo con paso menor que el skycell, porque
    ps1filenames.py devuelve SOLO el skycell que contiene cada punto:
    preguntar por el centro y las esquinas no basta si el campo es
    mayor que un skycell o si cae a caballo de varios.
    """
    r = campo_deg / 2
    cosd = max(np.cos(np.radians(dec)), 1e-6)

    # paso ≈ 0.2° (medio skycell) para no dejar huecos
    n = max(3, int(np.ceil(campo_deg / 0.2)) + 1)
    offs = np.linspace(-r, r, n)

    puntos = [(ra + dr / cosd, dec + dd) for dr in offs for dd in offs]

    filas = {}
    for pra, pdec in puntos:
        params = {
            "ra": pra, "dec": pdec, "filters": banda,
            "type": "stack,stack.mask",
        }
        try:
            txt = requests.get(PS1_FILENAMES, params=params, timeout=TIMEOUT).text
            t = Table.read(txt, format="ascii")
        except Exception:
            continue
        for f in t:
            filas[str(f["filename"])] = {k: f[k] for k in t.colnames}

    n_img = sum(1 for f in filas.values() if "mask" not in str(f.get("type", "")))
    print(f"║    {len(puntos)} sondeos → {n_img} skycells distintos")
    return list(filas.values())


def cutout(filename, ra, dec, size_px, out_px=None):
    """
    Recorte FITS de un skycell centrado en (ra, dec).

    size_px  = tamaño del recorte en píxeles nativos (campo cubierto).
    out_px   = tamaño de salida; si es menor, fitscut reduce en el
               servidor y bajamos muchísimos menos datos. Es lo que
               hace rápidos los niveles anchos: pedir 2° pero recibir
               solo 3000 px en vez de 28800.
    """
    params = {"ra": ra, "dec": dec, "size": int(size_px),
              "format": "fits", "red": filename}
    if out_px and out_px < size_px:
        params["output_size"] = int(out_px)
    r = requests.get(PS1_CUTOUT, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    if len(r.content) < 2880:
        raise RuntimeError("recorte vacío")
    return fits.open(io.BytesIO(r.content))[0]


def descargar_hips(obj, campo_deg, px, banda):
    """
    Descarga un campo ya MOSAICADO desde hips2fits (CDS), en una sola
    petición. Usa el HiPS científico de PS1 por banda (bitpix entero,
    valores en cuentas), no el HiPS de color estirado.

    Es la vía correcta para los niveles anchos: en vez de bajar y
    mosaicar decenas de skycells nativos (lento y con timeouts), el
    servidor entrega el mosaico completo del tamaño pedido en una sola
    imagen. Devuelve (img, wcs, hdr).
    """
    params = {
        "hips": f"CDS/P/PanSTARRS/DR1/{banda}",
        "ra": f"{obj.ra:.6f}", "dec": f"{obj.dec:.6f}",
        "fov": f"{campo_deg:.6f}",
        "width": int(px), "height": int(px),
        "projection": "TAN", "format": "fits", "coordsys": "icrs",
    }
    r = requests.get(HIPS2FITS, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    hdu = fits.open(io.BytesIO(r.content))[0]
    img = np.asarray(hdu.data, float)
    # los píxeles sin cobertura llegan como NaN (o BLANK, que astropy
    # ya convierte a NaN). NO se tocan los ceros: un HiPS con el cielo
    # restado tiene fondo legítimo alrededor de cero.
    return img, WCS(hdu.header), hdu.header


def descargar_mosaico(obj, campo_deg, banda, out_px=None, con_mascara=True):
    """
    Baja imagen (y máscara si con_mascara) del campo y mosaica los
    skycells. Si out_px reduce respecto al tamaño nativo, MAST entrega
    ya reducido: menos datos, más rápido.

    Devuelve (imagen, mascara|None, wcs, hdr, hdr_mask|None).
    La escala del resultado es campo_deg*3600 / lado_real px.
    """
    size_px = int(np.ceil(campo_deg * 3600 / PS1_PX))
    filas = skycells(obj.ra, obj.dec, campo_deg, banda)
    if not filas:
        raise RuntimeError(f"MAST no devuelve skycells para {obj.id}")

    # si un solo skycell cubre el campo, pedimos el tamaño reducido
    # directamente; si hay varios, se reduce tras mosaicar (reproject
    # necesita la resolución común, y bajar cada skycell reducido y
    # remuestrear daría bordes)
    imgs, masks = [], []
    quiere = [f for f in filas
              if con_mascara or "mask" not in str(f.get("type", ""))]
    for f in quiere:
        tipo = f.get("type", "")
        es_mask = "mask" in tipo
        if es_mask and not con_mascara:
            continue
        # la máscara NO se reduce en servidor (mezclaría bits): siempre nativa
        op = None if es_mask else out_px
        try:
            hdu = cutout(f["filename"], obj.ra, obj.dec, size_px, op)
        except Exception as e:
            print(f"║      · fallo en {str(f['filename'])[:40]}…: {e}")
            continue
        (masks if es_mask else imgs).append(hdu)
        time.sleep(0.3)

    if not imgs:
        raise RuntimeError("sin imágenes utilizables")

    if len(imgs) == 1:
        img, wcs = np.asarray(imgs[0].data, float), WCS(imgs[0].header)
    else:
        entradas = [(np.asarray(h.data, float), WCS(h.header)) for h in imgs]
        wcs_opt, shape = find_optimal_celestial_wcs(entradas)
        img, _ = reproject_and_coadd(entradas, wcs_opt, shape_out=shape,
                                     reproject_function=reproject_interp,
                                     match_background=True)
        wcs = wcs_opt
        # match_background iguala fondos RESTÁNDOLOS y deja el cielo en
        # ~0, con la mitad del fondo en negativo por ruido. Se restaura
        # el pedestal al cielo mediano de las entradas originales.
        objetivo = np.nanmedian([np.nanmedian(e[0]) for e in entradas])
        actual = np.nanmedian(img)
        if np.isfinite(objetivo) and np.isfinite(actual):
            img += objetivo - actual
            print(f"║    pedestal de cielo restaurado: {objetivo:,.0f} cuentas")

    # La máscara viene SIEMPRE a resolución nativa (no se reduce en
    # servidor para no mezclar bits). Si la imagen se pidió reducida,
    # sus tamaños difieren: se reproyecta la máscara al grid exacto de
    # la imagen con vecino más próximo, que preserva el valor entero.
    if masks and con_mascara:
        mask = np.zeros(img.shape, np.int64)
        for hm in masks:
            mraw = np.nan_to_num(np.asarray(hm.data, float), nan=0.0)
            rep, huella = reproject_interp(
                (mraw, WCS(hm.header)), wcs, shape_out=img.shape,
                order="nearest-neighbor")
            valido = np.nan_to_num(huella) > 0.5
            mask[valido] |= np.nan_to_num(rep)[valido].astype(np.int64)
    else:
        mask = np.zeros(img.shape, np.int64)

    hdr = imgs[0].header
    hdr_mask = masks[0].header if masks else None
    return img, mask, wcs, hdr, hdr_mask


# ═══════════════════════════════════════════════════════════════════
#  CALIBRACIÓN FOTOMÉTRICA
# ═══════════════════════════════════════════════════════════════════

def tabla_flags(hdr):
    """
    Lee la convención de bits desde las claves MSKNAMnn de la cabecera
    del fichero stack.mask. MSKNAMnn documenta el bit nn (valor 2^nn).
    Devuelve {nombre: valor}, p.ej. {'SAT': 32, 'STARCORE': 4096, …}
    """
    tabla = {}
    for k in hdr:
        ks = str(k)
        if ks.startswith("MSKNAM"):
            try:
                n = int(ks[6:])
                tabla[str(hdr[k]).strip()] = 1 << n
            except (ValueError, TypeError):
                continue
    return tabla


def bits_desde_cabecera(hdr):
    """
    Deriva BITS_SATURADO de la cabecera si trae la tabla MSKNAM;
    si no, cae a las constantes del módulo. Devuelve (bits, origen).
    """
    t = tabla_flags(hdr)
    if not t:
        return BITS_SATURADO, "constantes del módulo (cabecera sin MSKNAM)"
    bits = 0
    usados = []
    for nombre in ("SAT", "STARCORE", "BURNTOOL"):
        if nombre in t:
            bits |= t[nombre]
            usados.append(f"{nombre}={t[nombre]}")
    if not bits:
        return BITS_SATURADO, "constantes del módulo (sin SAT en la tabla)"
    return bits, "cabecera MSKNAM: " + ", ".join(usados)


def punto_cero(hdr):
    """
    Punto cero de la stack de PS1, leído de la cabecera.

    Confirmado en las stack DR2 (skycell.0776.097, banda i):
      HIERARCH FPA.ZP = 25.0   ← el de la STACK, es el que vale
      ZPT_0000..NNNN  ≈ 24.5   ← el de cada imagen de ENTRADA (NO usar)
      EXPTIME = 1350           ← suma de las 30 entradas de 45 s

    La stack ya viene escalada a su propio punto cero, así que NO hay
    que corregir por EXPTIME: mag = ZP - 2.5*log10(cuentas).
    Tampoco hay compresión asinh (no existen BSOFTEN/BOFFSET), luego
    los datos son lineales en cuentas.
    """
    for k in ("FPA.ZP", "HIERARCH FPA.ZP", "MAGZP", "MAGZERO"):
        if k in hdr:
            try:
                return float(hdr[k]), k
            except (TypeError, ValueError):
                continue
    # Sin punto cero explícito no se puede hacer fotometría honesta.
    # 25.0 es el valor estándar de las stack PS1, pero se avisa.
    return 25.0, "AUSENTE en cabecera — se asume 25.0 (estándar PS1 stack)"


def nivel_saturacion(hdr):
    """
    Nivel de saturación en cuentas (CELL.SATURATION en las stack PS1).
    Sirve para detectar núcleos clipados que la máscara no marcara.
    """
    for k in ("CELL.SATURATION", "HIERARCH CELL.SATURATION", "SATURATE"):
        if k in hdr:
            try:
                return float(hdr[k])
            except (TypeError, ValueError):
                continue
    return None


# ═══════════════════════════════════════════════════════════════════
#  GAIA DR3
# ═══════════════════════════════════════════════════════════════════

def _tap_query(url, adql, timeout=TIMEOUT):
    """Lanza una consulta ADQL a un servidor TAP y devuelve las filas."""
    r = requests.get(url, params={
        "request": "doQuery", "lang": "adql",
        "format": "json", "query": adql}, timeout=timeout)
    r.raise_for_status()
    return r.json().get("data", [])


def gaia(ra, dec, radio_deg, mag_max=GAIA_MAG_MAX, intentos=4):
    """
    Estrellas Gaia DR3 del campo: (ra, dec, Gmag).

    Los servidores TAP devuelven 503 con cierta frecuencia (sobrecarga
    momentánea). Se reintenta con espera creciente y, si el principal
    no responde, se prueba el espejo del ESAC.

    Lanza RuntimeError si ningún servidor responde: sin Gaia NO hay
    flujo con el que reconstruir, y generar el PNG igualmente daría
    una imagen degradada sin avisar.
    """
    consultas = [
        (VIZIER_TAP,
         f'SELECT RA_ICRS, DE_ICRS, Gmag FROM "I/355/gaiadr3" '
         f"WHERE 1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS),"
         f"CIRCLE('ICRS',{ra:.6f},{dec:.6f},{radio_deg:.6f})) "
         f"AND Gmag < {mag_max} ORDER BY Gmag"),
        (GAIA_TAP,
         f"SELECT ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source "
         f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),"
         f"CIRCLE('ICRS',{ra:.6f},{dec:.6f},{radio_deg:.6f})) "
         f"AND phot_g_mean_mag < {mag_max} ORDER BY phot_g_mean_mag"),
    ]

    ultimo = None
    for intento in range(intentos):
        for i, (url, adql) in enumerate(consultas):
            servidor = "VizieR" if i == 0 else "ESAC"
            try:
                datos = _tap_query(url, adql)
                estrellas = [(f[0], f[1], f[2]) for f in datos if f[2] is not None]
                if estrellas:
                    if intento or i:
                        print(f"║    (Gaia respondió desde {servidor} "
                              f"en el intento {intento + 1})")
                    return estrellas
            except Exception as e:
                ultimo = f"{servidor}: {e}"
        if intento < intentos - 1:
            espera = 5 * (intento + 1)
            print(f"║    ⚠ Gaia no responde ({ultimo}); "
                  f"reintento {intento + 2}/{intentos} en {espera}s…")
            time.sleep(espera)

    raise RuntimeError(
        f"Gaia no disponible tras {intentos} intentos en dos servidores "
        f"({ultimo}). Sin catálogo no se puede reconstruir: reintenta más "
        f"tarde en vez de generar un PNG degradado.")


# ═══════════════════════════════════════════════════════════════════
#  PSF Y RECONSTRUCCIÓN
# ═══════════════════════════════════════════════════════════════════

def gaia_cacheada(ra, dec, radio_deg, mag_max=GAIA_MAG_MAX, cache_dir=None):
    """
    Como gaia(), pero guarda el resultado en disco. Evita repetir la
    consulta al relanzar el pipeline y da margen si el TAP está caído.
    """
    cache_dir = Path(cache_dir or "cache_gaia")
    cache_dir.mkdir(parents=True, exist_ok=True)
    f = cache_dir / f"gaia_{ra:.4f}_{dec:+.4f}_{radio_deg:.4f}_{mag_max:g}.json"
    if f.exists():
        try:
            datos = json.loads(f.read_text())
            print(f"║    (Gaia desde caché local: {len(datos)} estrellas)")
            return [tuple(e) for e in datos]
        except Exception:
            pass
    estrellas = gaia(ra, dec, radio_deg, mag_max)
    try:
        f.write_text(json.dumps(estrellas))
    except Exception:
        pass
    return estrellas


def medir_psf(img, mask, wcs, estrellas, bits_sat=None):
    """
    Ajusta un perfil de Moffat a estrellas NO saturadas del campo.
    Devuelve (gamma, alpha, n_estrellas) o None si no hay suficientes.
    """
    from photutils.profiles import RadialProfile
    from astropy.modeling import models, fitting

    if bits_sat is None:
        bits_sat = BITS_SATURADO
    h, w = img.shape
    malo = (mask & (bits_sat | BITS_INVALIDO)) != 0
    perfiles = []

    for ra, dec, g in estrellas:
        if g < 13.0 or g > 15.5:          # ni saturadas ni ruidosas
            continue
        try:
            x, y = wcs.world_to_pixel(SkyCoord(ra * u.deg, dec * u.deg))
        except Exception:
            continue
        x, y = float(x), float(y)
        m = PSF_TAMANO // 2
        if not (m < x < w - m and m < y < h - m):
            continue
        sub = img[int(y) - m:int(y) + m + 1, int(x) - m:int(x) + m + 1]
        subm = malo[int(y) - m:int(y) + m + 1, int(x) - m:int(x) + m + 1]
        if subm.any() or not np.isfinite(sub).all():
            continue
        try:
            rp = RadialProfile(sub, (m, m), np.arange(0, m, 1.0))
            perfiles.append(rp.profile / max(rp.profile[0], 1e-9))
        except Exception:
            continue
        if len(perfiles) >= 40:
            break

    if len(perfiles) < PSF_MIN_ESTRELLAS:
        return None

    perfil = np.median(np.vstack(perfiles), axis=0)
    r = np.arange(len(perfil), dtype=float)
    mof = models.Moffat1D(amplitude=1.0, x_0=0.0, gamma=2.0, alpha=2.5)
    mof.x_0.fixed = True
    try:
        aj = fitting.LevMarLSQFitter()(mof, r, perfil)
        return float(aj.gamma.value), float(aj.alpha.value), len(perfiles)
    except Exception:
        return None


def reconstruir(img, mask, wcs, hdr, estrellas, hdr_mask=None):
    """
    Sustituye los núcleos saturados por una PSF de Moffat ajustada al
    campo, con el flujo derivado de Gmag. Devuelve (img, informe).

    Los bits se leen de la tabla MSKNAM de la cabecera de la máscara
    (especificación oficial en el propio fichero), no de constantes.
    """
    bits_sat, origen_bits = bits_desde_cabecera(hdr_mask if hdr_mask else hdr)

    info = {
        "reconstruido": False,
        "estrellas_reconstruidas": 0,
        "grupos_saturados": 0,
        "px_saturados": 0,
        "px_invalidos": int(((mask & BITS_INVALIDO) != 0).sum()),
        "bits_saturado": bits_sat,
        "bits_origen": origen_bits,
        "psf": None,
        "psf_n_estrellas": 0,
        "aviso": None,
    }

    sat = (mask & bits_sat) != 0

    if not estrellas:
        raise RuntimeError(
            "sin catálogo Gaia: los núcleos solo podrían rellenarse de "
            "forma cosmética y el PNG saldría degradado sin avisar")

    # Red de seguridad: SOLO núcleos anulados (NaN rodeado de halo muy
    # brillante), que son las "rosquillas" que el JPEG de HiPS pinta
    # como agujeros negros. NO se usa CELL.SATURATION como umbral: la
    # stack suma 30 exposiciones y su máximo legítimo puede superarlo
    # (M13: 2.601.729 cuentas > CELL.SATURATION 1.656.713), así que
    # ese criterio marcaría estrellas brillantes perfectamente válidas.
    satur = nivel_saturacion(hdr)
    if satur:
        info["nivel_saturacion_nominal"] = satur
    p99 = np.nanpercentile(img, 99)
    hueco = ~np.isfinite(img)
    if hueco.any():
        vecino_brillante = binary_dilation(
            np.isfinite(img) & (img > p99), np.ones((5, 5)))
        nucleo_anulado = hueco & vecino_brillante
        if nucleo_anulado.any():
            sat |= nucleo_anulado
            info["px_anulados"] = int(nucleo_anulado.sum())

    info["px_saturados"] = int(sat.sum())
    if not sat.any():
        info["aviso"] = "sin píxeles saturados marcados"
        return img, info

    etiq, ngr = label(sat)
    info["grupos_saturados"] = int(ngr)

    psf = medir_psf(img, mask, wcs, estrellas, bits_sat)
    if psf is None:
        info["aviso"] = ("PSF no ajustable (pocas estrellas limpias): "
                         "núcleos rellenados por interpolación del halo")
        return rellenar_cosmetico(img, sat), info

    gamma, alpha, n = psf
    info["psf"] = {"modelo": "Moffat", "gamma": gamma, "alpha": alpha}
    info["psf_n_estrellas"] = n

    zp, _ = punto_cero(hdr)
    h, w = img.shape
    out = img.copy()

    # normalización del Moffat 2D: ∫∫ (1+(r/γ)²)^-α dA = πγ²/(α-1)
    if alpha <= 1.05:
        alpha = 1.05
    norm = np.pi * gamma ** 2 / (alpha - 1.0)

    # centro de cada grupo saturado → estrella Gaia más próxima
    cens = center_of_mass(sat, etiq, range(1, ngr + 1))
    coords = SkyCoord([e[0] for e in estrellas] * u.deg,
                      [e[1] for e in estrellas] * u.deg) if estrellas else None

    for (cy, cx) in cens:
        if not np.isfinite(cy) or not np.isfinite(cx):
            continue
        if coords is None:
            continue
        try:
            sk = wcs.pixel_to_world(cx, cy)
            i = int(sk.separation(coords).argmin())
            sep = sk.separation(coords[i]).arcsec
        except Exception:
            continue
        if sep > 2.0:            # ningún Gaia cerca: no es una estrella
            continue

        gmag = estrellas[i][2]
        flujo = 10 ** (-0.4 * (gmag - zp))     # cuentas totales
        amp = flujo / norm

        # pintamos la PSF en una ventana proporcional al brillo
        rad = int(np.clip(4 * gamma * (1 + (18 - gmag) / 6), 6, 80))
        y0, y1 = max(0, int(cy) - rad), min(h, int(cy) + rad + 1)
        x0, x1 = max(0, int(cx) - rad), min(w, int(cx) + rad + 1)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        rr2 = (yy - cy) ** 2 + (xx - cx) ** 2
        modelo = amp * (1 + rr2 / gamma ** 2) ** (-alpha)

        # solo se sustituye dentro de lo saturado; el halo real se respeta
        zona = sat[y0:y1, x0:x1]
        out[y0:y1, x0:x1] = np.where(zona, modelo, out[y0:y1, x0:x1])
        info["estrellas_reconstruidas"] += 1

    # lo saturado sin contrapartida Gaia: relleno cosmético
    resto = sat & (out == img) & sat
    if resto.any():
        out = rellenar_cosmetico(out, resto)

    info["reconstruido"] = info["estrellas_reconstruidas"] > 0
    if info["psf_n_estrellas"] < PSF_MIN_ESTRELLAS * 2:
        info["aviso"] = (f"PSF ajustada con solo {info['psf_n_estrellas']} "
                         f"estrellas: fidelidad limitada")
    return out, info


def rellenar_cosmetico(img, sel):
    """Fallback: rellena los huecos con la mediana de su anillo exterior."""
    out = img.copy()
    etiq, n = label(sel)
    for i in range(1, n + 1):
        z = etiq == i
        anillo = binary_dilation(z, np.ones((7, 7))) & ~z & np.isfinite(img)
        if anillo.any():
            out[z] = np.nanmedian(img[anillo]) * 1.3
    return out


# ═══════════════════════════════════════════════════════════════════
#  EXPORTACIÓN
# ═══════════════════════════════════════════════════════════════════

def compactar_estrellas(img, wcs, estrellas, gamma_px, alpha, g_max=None):
    """
    Sustituye las alas del Moffat de cada estrella brillante por una
    gaussiana compacta del mismo FWHM y el MISMO flujo total.

    La amplitud se mide en la propia imagen: mediana en un anillo de
    3-5γ menos el fondo local (anillo de 9-12γ). Así no dependemos de
    convertir Gmag de Gaia al sistema de PS1, y funciona igual sobre
    estrellas reconstruidas. El flujo total del Moffat medido
    (amp·πγ²/(α−1)) se reinyecta íntegro en la gaussiana: la fotometría
    integrada no cambia, solo la forma.

    Devuelve (img, nº de estrellas compactadas).
    """
    if g_max is None:
        g_max = HALO_G_MAX
    if gamma_px < 0.8:
        return img, 0     # a esta escala el halo del modelo es subpíxel
    h, w = img.shape
    fwhm = 2.0 * gamma_px * np.sqrt(2.0 ** (1.0 / alpha) - 1.0)
    sigma = fwhm / 2.3548
    norm_mof = np.pi * gamma_px ** 2 / (alpha - 1.0)

    brillantes = [e for e in estrellas if e[2] is not None and e[2] < g_max]
    if not brillantes:
        return img, 0
    coords = SkyCoord([e[0] for e in brillantes] * u.deg,
                      [e[1] for e in brillantes] * u.deg)
    xs, ys = wcs.world_to_pixel(coords)

    n_hechas = 0
    for x, y in zip(np.atleast_1d(xs), np.atleast_1d(ys)):
        if not (np.isfinite(x) and np.isfinite(y)):
            continue
        if not (0 <= x < w and 0 <= y < h):
            continue
        r_in, r_out = 3 * gamma_px, 5 * gamma_px
        r_b1, r_b2 = 9 * gamma_px, 12 * gamma_px
        rad = int(np.clip(r_b2 + 2, 8, 250))
        y0, y1 = max(0, int(y) - rad), min(h, int(y) + rad + 1)
        x0, x1 = max(0, int(x) - rad), min(w, int(x) + rad + 1)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        rr = np.sqrt((yy - y) ** 2 + (xx - x) ** 2)
        vent = img[y0:y1, x0:x1]
        fin = np.isfinite(vent)
        anillo = fin & (rr >= r_in) & (rr <= r_out)
        fondo_z = fin & (rr >= r_b1) & (rr <= r_b2)
        if anillo.sum() < 8 or fondo_z.sum() < 8:
            continue
        fondo = float(np.median(vent[fondo_z]))
        obs = float(np.median(vent[anillo])) - fondo
        mod_unit = float(np.median(
            (1.0 + (rr[anillo] / gamma_px) ** 2) ** (-alpha)))
        if obs <= 0 or mod_unit <= 0:
            continue
        amp = obs / mod_unit
        flujo = amp * norm_mof
        moffat = amp * (1.0 + (rr / gamma_px) ** 2) ** (-alpha)
        gauss = flujo / (2 * np.pi * sigma ** 2) * np.exp(-rr ** 2 / (2 * sigma ** 2))
        nuevo = vent - moffat + gauss
        img[y0:y1, x0:x1] = np.where(fin, np.maximum(nuevo, 0.0), vent)
        n_hechas += 1
    return img, n_hechas


def rellenar_sin_cobertura(img):
    """
    Rellena los NaN de zonas sin cobertura con el fondo local, para que
    no queden manchas grises/negras. Usa la mediana global del cielo
    como valor de relleno (suave, se funde con el fondo). Devuelve
    (img_rellena, mascara_sin_dato) — la máscara marca qué era NaN, por
    si el JSON quiere declararlo.
    """
    sin_dato = ~np.isfinite(img)
    if not sin_dato.any():
        return img, sin_dato
    # fondo = mediana de la mitad más oscura de los píxeles válidos
    val = img[np.isfinite(img)]
    fondo = np.median(val[val <= np.median(val)]) if val.size else 0.0
    out = np.where(sin_dato, fondo, img)
    return out, sin_dato


def exportar_nivel(img, campo_deg, px_lado, ruta, PC, factor):
    """
    Guarda PNG de 16 bits en escala de MAGNITUDES.

    'img' ya viene al tamaño correcto (descargado así o reducido por
    block_reduce de factor entero ANTES de llamar aquí). No se hace
    ningún resize destructivo: el nivel fino es nativo, y los anchos
    llegan ya reducidos de MAST. 'factor' es informativo para el JSON.

    Recuperación en el navegador:
        valor == 0 → sin dato
        mag     = MAG_MAX - (valor-1)/65534 * (MAG_MAX-MAG_MIN)
        cuentas = 10^(-0.4*(mag - punto_cero))
        mag/arcsec² = mag + 2.5*log10(arcsec_px²)
    """
    finito = np.isfinite(img)
    positivo = finito & (img > 0)
    # negativos o cero (ruido alrededor del cielo): extremo tenue de la
    # escala, NO "sin dato". El 0 del PNG queda solo para NaN reales.
    with np.errstate(divide="ignore", invalid="ignore"):
        mag = np.where(positivo,
                       PC - 2.5 * np.log10(np.where(positivo, img, 1)),
                       MAG_MAX)
    mag = np.clip(mag, MAG_MIN, MAG_MAX)
    q = 1 + (MAG_MAX - mag) / (MAG_MAX - MAG_MIN) * 65534
    datos = np.where(finito, q, 0).astype(np.uint16)

    imagen = Image.frombuffer("I;16", (img.shape[1], img.shape[0]),
                              datos.tobytes(), "raw", "I;16", 0, 1)
    imagen.save(ruta, optimize=True)
    return campo_deg * 3600 / img.shape[1], factor, int((~finito).sum())


def verificar(dir_obj, niveles, zp):
    """
    Autocomprobación fotométrica. El dato viene con el cielo restado
    por el survey, así que comparar "el cielo" entre niveles no dice
    nada (es ~0 en todos por construcción). Lo que SÍ debe coincidir
    es el flujo del objeto: se recorta la misma región central de 0.1°
    en cada nivel, se suman las cuentas y la magnitud integrada tiene
    que salir igual. En 0.1° el objeto domina sobre el ruido.
    """
    print("║  ── verificación: magnitud integrada del centro (0.1°) ──")
    resultados = []
    for n in niveles:
        arr = np.array(Image.open(dir_obj / n["fichero"])).astype(float)
        lado = arr.shape[0]
        semi = max(4, int(lado * 0.1 / n["campo_deg"] / 2))
        c = lado // 2
        sub = arr[c - semi:c + semi, c - semi:c + semi]
        v = sub[sub > 0]
        if v.size == 0:
            print(f"║    ✗ {n['fichero']}: sin datos en el centro")
            resultados.append({"fichero": n["fichero"], "error": "sin datos"})
            continue
        mag_px = MAG_MAX - (v - 1) / 65534 * (MAG_MAX - MAG_MIN)
        cuentas = float(np.sum(10.0 ** (-0.4 * (mag_px - zp))))
        mag_int = zp - 2.5 * np.log10(max(cuentas, 1e-9))
        resultados.append({
            "fichero": n["fichero"],
            "mag_integrada_01deg": round(mag_int, 2),
            "pct_sin_dato": round(100 * (1 - (arr > 0).mean()), 1),
        })
        print(f"║    {n['fichero']:<24} mag integrada {mag_int:6.2f}  "
              f"({resultados[-1]['pct_sin_dato']}% sin dato)")

    mags = [r["mag_integrada_01deg"] for r in resultados
            if "mag_integrada_01deg" in r]
    if len(mags) >= 2:
        rango = max(mags) - min(mags)
        if rango > 0.5:
            print(f"║    ⚠ INCOHERENCIA: el flujo integrado varía "
                  f"{rango:.2f} mag entre niveles (debería ser <0.5)")
        else:
            print(f"║    ✓ flujo coherente entre niveles (Δ={rango:.2f} mag)")
    return resultados


def procesar(obj, banda=BANDA, salida=SALIDA):
    print(f"\n╔══ {obj.nombre}")
    zp = None
    dir_obj = salida / obj.id
    dir_obj.mkdir(parents=True, exist_ok=True)
    meta_niveles = []
    info = {}
    estrellas = gaia_cacheada(obj.ra, obj.dec,
                              max(n.campo_deg for n in NIVELES) * 0.72)
    print(f"║  Gaia: {len(estrellas)} estrellas")
    psf_gamma, psf_alpha = 4.3, 2.2   # se afinan al medir la PSF del fino
    # el nivel que reconstruye se procesa primero (fija punto cero y PSF)
    orden = sorted(NIVELES, key=lambda n: not n.reconstruir)

    for niv in orden:
        campo, px = niv.campo_deg, niv.px
        print(f"║  ── nivel {campo:g}° → {px}px "
              f"({'con' if niv.reconstruir else 'sin'} reconstrucción) ──")

        if niv.reconstruir:
            # nivel fino: skycells nativos + máscara, para la PSF
            img, mask, wcs, hdr, hdr_mask = descargar_mosaico(
                obj, campo, banda, out_px=None, con_mascara=True)
            print(f"║    recibido: {img.shape[0]}×{img.shape[1]} px (nativo)")

            if zp is None:
                zp, zp_origen = punto_cero(hdr)
                print(f"║    punto cero: {zp:.3f}  [{zp_origen}]")

            if hdr_mask:
                t = tabla_flags(hdr_mask)
                marc = ", ".join(f"{n}={v}" for n, v in sorted(t.items(), key=lambda x: x[1])
                                 if n in ("SAT", "STARCORE", "BURNTOOL"))
                if marc:
                    print(f"║    flags: {marc}")
            img, info = reconstruir(img, mask, wcs, hdr, estrellas, hdr_mask)
            print(f"║    grupos {info['grupos_saturados']} → "
                  f"reconstruidos {info['estrellas_reconstruidas']}")
            if info.get("psf"):
                psf_gamma = info["psf"]["gamma"]
                psf_alpha = info["psf"]["alpha"]
                print(f"║    PSF Moffat γ={psf_gamma:.2f} "
                      f"α={psf_alpha:.2f} ({info['psf_n_estrellas']} est.)")
            if QUITAR_HALOS:
                img, nh = compactar_estrellas(img, wcs, estrellas,
                                              psf_gamma, psf_alpha)
                print(f"║    halos compactados: {nh} estrellas (G<{HALO_G_MAX:g})")
            # (el dato de PS1 viene con el cielo YA RESTADO por el
            #  survey: la imagen contiene solo flujo de objeto, que es
            #  lo ideal — el navegador añade el cielo del observador)
        else:
            # niveles anchos: hips2fits en una sola petición, sin máscara
            img, wcs, hdr_h = descargar_hips(obj, campo, px, banda)
            print(f"║    recibido de hips2fits: {img.shape[0]}×{img.shape[1]} px")
            # El dato viene con el cielo restado por el survey (~0):
            # solo hay que anclar el cero del HiPS a su propio cielo
            # residual y aplicar el factor de área para conservar el
            # flujo en la convención de suma. NADA de trasplantar
            # fondos de otro nivel: no hay cielo que trasplantar.
            val = img[np.isfinite(img)]
            fondo_h = (np.median(val[val <= np.median(val)])
                       if val.size else 0.0)
            area = (campo * 3600 / px / PS1_PX) ** 2
            img = (img - fondo_h) * area
            print(f"║    anclado a su cero ({fondo_h:+,.0f}) y área ×{area:.1f}")
            if QUITAR_HALOS:
                # PSF escalada al tamaño de píxel de este nivel
                g_px = psf_gamma * PS1_PX / (campo * 3600 / px)
                img, nh = compactar_estrellas(img, wcs, estrellas,
                                              g_px, psf_alpha)
                if nh:
                    print(f"║    halos compactados: {nh} estrellas")

        # recorte cuadrado exacto al campo (por si llegó algo mayor)
        h, w = img.shape
        lado = min(h, w)
        y0, x0 = (h - lado) // 2, (w - lado) // 2
        img = img[y0:y0 + lado, x0:x0 + lado]

        # reducción por bloques SOLO si sigue habiendo exceso (nunca resize)
        factor = 1
        if lado > px:
            factor = max(1, int(round(lado / px)))
            recorte = (lado // factor) * factor
            img = block_reduce(img[:recorte, :recorte], factor, func=np.nansum)

        # rellenar zonas sin cobertura con fondo local
        img, sin_cob = rellenar_sin_cobertura(img)

        nombre = f"{obj.id}_{campo:g}deg.png"
        arcsec_px, factor, sin_dato = exportar_nivel(
            img, campo, px, dir_obj / nombre, zp, factor)
        mb = (dir_obj / nombre).stat().st_size / 1e6
        pct_cob = 100 * int(sin_cob.sum()) / sin_cob.size
        aviso = f"  ⚠ {pct_cob:.0f}% rellenado" if pct_cob > 3 else ""
        print(f"║  ✓ {nombre}  {img.shape[1]}px  {arcsec_px:.2f}\"/px  {mb:.1f} MB{aviso}")

        meta_niveles.append({
            "fichero": nombre,
            "campo_deg": campo,
            "px": img.shape[1],
            "arcsec_px": round(arcsec_px, 4),
            "reconstruido": niv.reconstruir,
            "pct_rellenado_sin_cobertura": round(pct_cob, 2),
        })

    # el fino se procesó primero; ordenar 2° → 0.7° → 0.25° para el JSON
    meta_niveles.sort(key=lambda m: -m["campo_deg"])

    verificacion = verificar(dir_obj, meta_niveles, zp)

    meta = {
        "id": obj.id,
        "nombre": obj.nombre,
        "ra": obj.ra,
        "dec": obj.dec,
        "banda": banda,
        "survey": "PS1 stack (fino) + hips2fits (anchos)",
        "punto_cero": zp,
        "punto_cero_origen": zp_origen,
        "formato": "PNG 16-bit; el valor codifica MAGNITUD, no cuentas",
        "codificacion": {
            "mag_min": MAG_MIN,
            "mag_max": MAG_MAX,
            "sin_dato": 0,
            "mag": f"{MAG_MAX} - (valor - 1)/65534 * ({MAG_MAX} - {MAG_MIN})",
            "cuentas": "10^(-0.4 * (mag - punto_cero))",
            "mag_por_arcsec2": "mag + 2.5*log10(arcsec_px^2)",
            "nota": ("valor 0 = sin cobertura. El PNG contiene flujo del "
                     "OBJETO: el survey resta el cielo, y el navegador "
                     "añade el cielo del observador según su SQM. El "
                     "flujo se conserva entre niveles (convención suma)."),
        },
        "nivel_saturacion_nominal_cuentas": info.get("nivel_saturacion_nominal"),
        "niveles": meta_niveles,
        "verificacion": verificacion,
        "reconstruccion": info if info else {"reconstruido": False,
                                             "nota": "ningún nivel reconstruye"},
        "generado": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    (dir_obj / f"{obj.id}.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"╚══ {obj.id}.json escrito")
    return meta


def main():
    ap = argparse.ArgumentParser(description="Genera las placas del simulador de oculares")
    ap.add_argument("objetos", nargs="*", help="IDs a generar (vacío = todos)")
    ap.add_argument("--listar", action="store_true", help="lista el catálogo y sale")
    ap.add_argument("--banda", default=BANDA, choices=list("grizy"))
    ap.add_argument("--salida", default=str(SALIDA), type=Path)
    ap.add_argument("--px", type=int, default=None,
                    help="píxeles por lado de los niveles anchos (el fino "
                         "se queda a resolución nativa)")
    args = ap.parse_args()

    if args.listar:
        for o in CATALOGO:
            print(f"  {o.id:8s} {o.nombre:34s} {o.ra:9.4f} {o.dec:+8.4f}")
        return

    if args.px:
        global NIVELES
        # solo se cambia el tamaño de los niveles que NO reconstruyen;
        # el fino conserva su resolución nativa
        NIVELES = [Nivel(n.campo_deg, n.px if n.reconstruir else args.px,
                         n.reconstruir) for n in NIVELES]
        print(f"niveles anchos a {args.px} px por lado")

    objs = CATALOGO
    if args.objetos:
        ids = {o.upper() for o in args.objetos}
        objs = [o for o in CATALOGO if o.id.upper() in ids]
        if not objs:
            print(f"Sin coincidencias. Usa --listar para ver el catálogo.")
            sys.exit(1)

    indice = []
    for o in objs:
        try:
            m = procesar(o, banda=args.banda, salida=args.salida)
            indice.append({k: m[k] for k in ("id", "nombre", "ra", "dec")})
        except Exception as e:
            print(f"╚══ ✗ {o.id}: {e}")

    if indice:
        args.salida.mkdir(parents=True, exist_ok=True)
        (args.salida / "indice.json").write_text(
            json.dumps(indice, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n✓ {len(indice)} objetos → {args.salida}/indice.json")


if __name__ == "__main__":
    main()
