# -*- coding: utf-8 -*-
"""Genera el catálogo de galaxias del simulador a partir del RC3.

Fuente: G. de Vaucouleurs et al. (1991), «Third Reference Catalogue of Bright
Galaxies», vía VizieR VII/155/rc3. El fichero de partida
(mapa/datos/rc3_brillantes.tsv) es la consulta ya filtrada a BT < 13,5.

Para qué: el simulador pinta las galaxias como PERFIL DE SÉRSIC sintético. Por el
ocular una galaxia es un óvalo difuso con el núcleo más brillante —brazos y
bandas de polvo exigen apertura grande y cielo oscuro—, así que un perfil
sintético no es una aproximación barata: es más honesto que una foto profunda, y
no cuesta ningún asset de imagen.

De RC3 salen los cuatro parámetros que definen el perfil:
  · r_e  — radio efectivo (semieje mayor que encierra la mitad de la luz).
           De 'Ae' (apertura efectiva) cuando está; si no, se RESUELVE para que
           la isofota de 25 mag/arcsec² caiga en D25/2, que es la definición
           misma de D25. Así se rescatan objetos sin Ae como Centaurus A.
  · b/a  — razón de ejes, de log R25.
  · PA   — ángulo de posición del eje mayor.
  · n    — índice de Sérsic, del tipo morfológico T: 4 (de Vaucouleurs) para
           elípticas y lenticulares, 1 (exponencial) para espirales e irregulares.
La normalización usa la magnitud TOTAL (BT), así que el perfil integra la luz
que el catálogo mide, no una constante inventada.

Salidas:
  mapa/datos/galaxias.csv
  simulador_ocular/resources/js/galaxias-datos.js   (window.BITACORA_GALAXIAS)

Uso:  python3 scripts/gen_galaxias.py
"""
import csv
import math
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, 'mapa', 'datos', 'rc3_brillantes.tsv')
OUT_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'galaxias.csv')
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js')

FUENTE = ('de Vaucouleurs+ (1991) RC3, vía VizieR VII/155/rc3 · '
          'https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/155')

MU_ISOFOTA = 25.0        # mag/arcsec² en B: la isofota que define D25
BT_MAX = 13.0            # tope de magnitud; más débil no se ve por un ocular

# Color B−V típico por tipo morfológico, para pasar de la magnitud B del RC3 a
# la banda visual. Aproximación deliberada: RC3 no trae V para todas.
def color_bv(t):
    if t is None:
        return 0.8
    if t <= 0:
        return 0.90     # elípticas y lenticulares, población vieja y roja
    if t <= 4:
        return 0.75     # espirales tempranas
    return 0.55         # espirales tardías e irregulares, con formación estelar


def indice_sersic(t):
    return 4.0 if (t is not None and t <= -0.5) else 1.0


def b_n(n):
    """Constante de Sérsic: b_n tal que r_e encierra la mitad de la luz.
    Aproximación de Ciotti & Bertin (1999), buena para n > 0,36."""
    return 2 * n - 1.0 / 3.0 + 0.009876 / n


def factor_luz(n):
    """Integral del perfil: L_total = I_e · r_e² · factor · (b/a)."""
    b = b_n(n)
    return 2 * math.pi * n * math.exp(b) * math.gamma(2 * n) / (b ** (2 * n))


def mu_en(r, r_e, n, mag_total, q):
    """Brillo superficial (mag/arcsec²) a lo largo del semieje mayor."""
    f_total = 10 ** (-0.4 * mag_total)
    i_e = f_total / (r_e * r_e * factor_luz(n) * q)
    i = i_e * math.exp(-b_n(n) * ((r / r_e) ** (1.0 / n) - 1))
    return -2.5 * math.log10(i) if i > 0 else 99.0


def resolver_re(a25, n, mag_total, q):
    """r_e tal que la isofota de 25 mag/arcsec² caiga en el semieje a25.

    Bisección en log r_e. Ojo al sentido: a luz total fija, un r_e mayor reparte
    la luz más lejos, así que el brillo EN a25 sube y mu(a25) BAJA. La función es
    monótona decreciente en r_e, no creciente."""
    lo, hi = a25 * 1e-3, a25 * 2.0
    for _ in range(80):
        med = math.sqrt(lo * hi)
        if mu_en(a25, med, n, mag_total, q) > MU_ISOFOTA:
            lo = med          # demasiado tenue en a25: hace falta un r_e mayor
        else:
            hi = med
    return math.sqrt(lo * hi)


def numero(texto):
    texto = (texto or '').strip()
    if not texto:
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def sex_a_grados(texto, es_ra):
    partes = (texto or '').split()
    if len(partes) < 3:
        return None
    signo = -1.0 if partes[0].lstrip().startswith('-') else 1.0
    valor = abs(float(partes[0])) + float(partes[1]) / 60 + float(partes[2]) / 3600
    return signo * valor * (15.0 if es_ra else 1.0)


def limpia_nombre(texto):
    """'NGC   224' → 'NGC 224'."""
    return ' '.join((texto or '').split())


def main():
    with open(SRC, encoding='latin-1') as fh:
        lineas = fh.read().splitlines()
    inicio = next(k for k, l in enumerate(lineas) if l.startswith('---'))

    filas, sin_datos, de_d25 = [], 0, 0
    for linea in lineas[inicio + 1:]:
        if not linea.strip():
            continue
        c = linea.split('\t')
        if len(c) < 11:
            continue
        bt = numero(c[8])
        ra = sex_a_grados(c[2], True)
        dec = sex_a_grados(c[3], False)
        log_d25 = numero(c[5])
        if bt is None or bt > BT_MAX or ra is None or dec is None or log_d25 is None:
            sin_datos += 1
            continue

        t = numero(c[4])
        n = indice_sersic(t)
        # log D25 y log Ae vienen en unidades de 0,1 arcmin (convenio del RC3).
        d25_arcsec = (10 ** log_d25) * 0.1 * 60
        log_r25 = numero(c[6]) or 0.0
        q = min(1.0, max(0.1, 10 ** (-log_r25)))    # b/a
        mag_v = bt - color_bv(t)

        log_ae = numero(c[9])
        if log_ae is not None:
            # Ae es un DIÁMETRO de apertura efectiva: r_e es su mitad, y se toma
            # sobre el semieje mayor, así que se corrige por la razón de ejes.
            r_e = (10 ** log_ae) * 0.1 * 60 / 2 / math.sqrt(q)
        else:
            r_e = resolver_re(d25_arcsec / 2, n, mag_v, q)
            de_d25 += 1
        if not (r_e > 0) or r_e > d25_arcsec:
            sin_datos += 1
            continue

        filas.append({
            'nombre': limpia_nombre(c[0]),
            'alt': limpia_nombre(c[1]),
            'ra_grados': round(ra, 5),
            'dec_grados': round(dec, 5),
            're_arcsec': round(r_e, 2),
            'razon_ejes': round(q, 3),
            'pa_grados': int(numero(c[7]) or 0),
            'mag_v': round(mag_v, 2),
            'sersic_n': n,
        })

    filas.sort(key=lambda f: f['ra_grados'])

    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as fh:
        escritor = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        escritor.writeheader()
        escritor.writerows(filas)

    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Galaxias — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_galaxias.py\n')
        fh.write('   Fuente: %s\n' % FUENTE)
        fh.write('   Campos: [nombre, alt, RA°, Dec°, r_e("), b/a, PA°, mag V, n]\n')
        fh.write('   r_e es el semieje mayor efectivo; n el índice de Sérsic. */\n')
        fh.write('window.BITACORA_GALAXIAS = [\n')
        for f in filas:
            fh.write('  ["%s","%s",%s,%s,%s,%s,%s,%s,%s],\n' % (
                f['nombre'], f['alt'], f['ra_grados'], f['dec_grados'],
                f['re_arcsec'], f['razon_ejes'], f['pa_grados'], f['mag_v'],
                int(f['sersic_n'])))
        fh.write('];\n')

    print('galaxias: %d  (r_e resuelto desde D25 en %d; descartadas %d)'
          % (len(filas), de_d25, sin_datos))
    print('->', OUT_CSV)
    print('->', OUT_JS)


if __name__ == '__main__':
    main()
