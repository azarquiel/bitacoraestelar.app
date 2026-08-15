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
SRC_N = os.path.join(RAIZ, 'mapa', 'datos', 'sersic_s4g.tsv')
OUT_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'galaxias.csv')
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js')

FUENTE = ('de Vaucouleurs+ (1991) RC3, vía VizieR VII/155/rc3 · '
          'https://vizier.cds.unistra.fr/viz-bin/VizieR-3?-source=VII/155')
FUENTE_N = ('Salo+ (2015) S4G, ajuste de Sérsic único a 3,6 µm, vía VizieR '
            'J/ApJS/219/4 · descarga: -out=Name,_RA,_DE,n,Re,q')

# Radio de cruce con S4G. Los centros de los dos catálogos no coinciden al
# segundo: 20″ recoge los emparejamientos buenos sin colar vecinas.
CRUCE_ARCSEC = 20.0

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


def lee_sersic_medido():
    """[(RA°, Dec°, n)] del ajuste de Sérsic único de S4G.

    Es un índice MEDIDO, no el del tipo de Hubble. Va a una columna aparte
    (n_medido) y solo lo usa la PUERTA del halo del simulador: el perfil que se
    pinta sigue saliendo de sersic_n, porque r_e se resolvió con ESE n y
    cambiarlo movería el tamaño de todas las galaxias."""
    if not os.path.exists(SRC_N):
        return []
    out = []
    for linea in open(SRC_N, encoding='utf-8'):
        if linea.startswith('#'):
            continue
        c = linea.rstrip('\n').split('\t')
        if len(c) < 4:
            continue
        ra, dec, n = numero(c[1]), numero(c[2]), numero(c[3])
        if ra is None or dec is None or n is None or not (0.1 < n < 20):
            continue
        out.append((ra, dec, n))
    return out


def sersic_medido(medidos, ra, dec):
    """n medido de la fuente más cercana dentro de CRUCE_ARCSEC, o 0 si no hay."""
    cos_d = math.cos(math.radians(dec))
    tope = CRUCE_ARCSEC / 3600.0
    mejor, mejor_d = 0.0, tope
    for m_ra, m_dec, n in medidos:
        d_dec = m_dec - dec
        if abs(d_dec) > tope:
            continue
        d = math.hypot((m_ra - ra) * cos_d, d_dec)
        if d < mejor_d:
            mejor, mejor_d = n, d
    return mejor


def fraccion_bulbo(t):
    """Fracción de la luz total que aporta el BULBO, por tipo de Hubble.

    Un Sérsic único con n=1 es un disco exponencial puro: no tiene núcleo
    destacado, y por el ocular una espiral SÍ enseña el bulbo antes que nada. El
    reparto bulbo/disco por tipo morfológico es la aproximación estándar; los
    valores son los típicos de las descomposiciones fotométricas."""
    if t is None:
        return 0.3
    if t <= -3:
        return 1.0      # elíptica: todo bulbo
    if t <= 0:
        return 0.6      # lenticular
    if t <= 1:
        return 0.5      # Sa
    if t <= 3:
        return 0.3      # Sab-Sb
    if t <= 5:
        return 0.15     # Sbc-Sc
    if t <= 7:
        return 0.08     # Scd-Sd
    return 0.03         # Sm e irregulares


# Radio efectivo del bulbo, como fracción del del disco. Los bulbos son mucho
# más compactos que su disco; 0,2 es el orden de magnitud habitual.
RE_BULBO_REL = 0.2
# Razón de ejes mínima del bulbo: por muy de canto que esté el disco, el bulbo
# se ve casi redondo.
Q_BULBO_MIN = 0.6


def perfil_total(r, re_disco, n_disco, frac_bulbo, mag_total, q):
    """Flujo del modelo bulbo+disco a lo largo del semieje mayor."""
    f_total = 10 ** (-0.4 * mag_total)
    i = 0.0
    if frac_bulbo < 1:
        f_d = f_total * (1 - frac_bulbo)
        i_e = f_d / (re_disco * re_disco * factor_luz(n_disco) * q)
        i += i_e * math.exp(-b_n(n_disco) * ((r / re_disco) ** (1.0 / n_disco) - 1))
    if frac_bulbo > 0:
        re_b = re_disco * RE_BULBO_REL
        q_b = max(q, Q_BULBO_MIN)
        f_b = f_total * frac_bulbo
        i_e = f_b / (re_b * re_b * factor_luz(4.0) * q_b)
        i += i_e * math.exp(-b_n(4.0) * ((r / re_b) ** 0.25 - 1))
    return i


def luz_dentro(a, re_disco, n_disco, frac_bulbo, mag_total, q, pasos=400):
    """Luz encerrada dentro del semieje mayor a (integración en anillos)."""
    total, paso = 0.0, a / pasos
    for k in range(pasos):
        r = (k + 0.5) * paso
        total += perfil_total(r, re_disco, n_disco, frac_bulbo, mag_total, q) * 2 * math.pi * r * q * paso
    return total


def ajustar_re_disco(re_objetivo, n_disco, frac_bulbo, mag_total, q):
    """Escala el r_e del DISCO para que el modelo bulbo+disco siga encerrando la
    mitad de su luz dentro del r_e del catálogo.

    Sin esto, añadir un bulbo compacto concentra la luz y el objeto saldría más
    pequeño de lo que el catálogo mide."""
    if frac_bulbo >= 1:
        return re_objetivo
    mitad = 0.5 * 10 ** (-0.4 * mag_total)
    lo, hi = re_objetivo * 0.5, re_objetivo * 4.0
    for _ in range(50):
        med = math.sqrt(lo * hi)
        if luz_dentro(re_objetivo, med, n_disco, frac_bulbo, mag_total, q) > mitad:
            lo = med      # demasiada luz dentro: hay que estirar el disco
        else:
            hi = med
    return math.sqrt(lo * hi)


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

    medidos = lee_sersic_medido()
    filas, sin_datos, de_d25, con_n = [], 0, 0, 0
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

        frac_bulbo = fraccion_bulbo(t)
        # El r_e del catálogo es el del OBJETO ENTERO. Al partirlo en bulbo+disco
        # hay que estirar el disco para que el conjunto siga encerrando la mitad
        # de su luz donde el catálogo dice.
        re_disco = ajustar_re_disco(r_e, n, frac_bulbo, mag_v, q) if frac_bulbo < 1 else r_e
        # Banda de polvo: solo en espirales vistas suficientemente de canto. Es lo
        # que parte en dos a NGC 891, y no aparece si la galaxia se ve de frente.
        polvo = 1 if (t is not None and t >= 1 and q <= 0.35) else 0
        n_medido = sersic_medido(medidos, ra, dec)
        if n_medido:
            con_n += 1

        filas.append({
            'nombre': limpia_nombre(c[0]),
            'alt': limpia_nombre(c[1]),
            'ra_grados': round(ra, 5),
            'dec_grados': round(dec, 5),
            're_arcsec': round(re_disco, 2),
            'razon_ejes': round(q, 3),
            'pa_grados': int(numero(c[7]) or 0),
            'mag_v': round(mag_v, 2),
            'sersic_n': n,
            'frac_bulbo': round(frac_bulbo, 2),
            'polvo': polvo,
            'n_medido': round(n_medido, 2),
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
        fh.write('   n medido: %s\n' % FUENTE_N)
        fh.write('   Campos: [nombre, alt, RA°, Dec°, r_e("), b/a, PA°, mag V, n, B/T, polvo,\n')
        fh.write('            n medido]\n')
        fh.write('   r_e es el semieje mayor efectivo DEL DISCO; n el índice de Sérsic del\n')
        fh.write('   disco; B/T la fracción de luz del bulbo; polvo=1 marca espiral de canto\n')
        fh.write('   con banda de polvo. «n medido» es el Sérsic AJUSTADO de S4G (0 = no hay):\n')
        fh.write('   no lo usa el perfil —ese va con n, con el que se resolvió r_e—, solo la\n')
        fh.write('   puerta del halo extrapolado del simulador. */\n')
        fh.write('window.BITACORA_GALAXIAS = [\n')
        for f in filas:
            fh.write('  ["%s","%s",%s,%s,%s,%s,%s,%s,%s,%s,%s,%s],\n' % (
                f['nombre'], f['alt'], f['ra_grados'], f['dec_grados'],
                f['re_arcsec'], f['razon_ejes'], f['pa_grados'], f['mag_v'],
                int(f['sersic_n']), f['frac_bulbo'], f['polvo'], f['n_medido']))
        fh.write('];\n')

    print('galaxias: %d  (r_e resuelto desde D25 en %d; descartadas %d; n medido en %d)'
          % (len(filas), de_d25, sin_datos, con_n))
    print('->', OUT_CSV)
    print('->', OUT_JS)


if __name__ == '__main__':
    main()
