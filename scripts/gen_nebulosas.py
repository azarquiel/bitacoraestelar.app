# -*- coding: utf-8 -*-
"""Genera el catálogo de nebulosas del simulador a partir del OpenNGC.

Fuente: Mattia Verga, «OpenNGC» (NGC.csv + IC.csv), revisión de NGC/IC con
tamaños, magnitudes y tipos. El fichero de partida (mapa/datos/ongc_nebulosas.csv)
es la unión de ambos ya filtrada a los tipos nebulares.

Por qué sintético y no un mapa all-sky: la alternativa era muestrear el mapa Hα
de Finkbeiner a 6'/px. A esa resolución un campo de 30' recibe 5×5 píxeles —un
degradado, no estructura— y el ojo es casi ciego a 656 nm (la visión escotópica
pica en 507 nm), así que un mapa Hα crudo pone brillo donde el ojo ve poco.
Mismo argumento que llevó a las galaxias a un perfil sintético: por el ocular
una nebulosa es una mancha difusa de bordes suaves, y eso se dibuja desde el
catálogo sin descargar un solo megabyte.

Las nebulosas comparten la tubería de las galaxias: se emiten con el MISMO
esquema de fila, y el render las pinta con `capaGalaxias`. El perfil es
exponencial (n = 1, el mismo del disco de una espiral): núcleo marcado y alas que
se desvanecen. Una gaussiana (n = 0,5) se probó antes y salía plana como una
tortita —el pico queda a solo 0,75 mag de μ_e—, sin el núcleo que se ve por el
ocular. Sin bulbo (B/T = 0) y sin banda de polvo.

Decisiones que cuestan precisión a cambio de honestidad:
  · Sin PA en el catálogo -> se pinta REDONDA, con el radio medio geométrico.
    Solo 81 de 431 filas traen ángulo de posición. Inventar una orientación es
    un error visible (M16 saldría como un trazo norte-sur); un óvalo sin
    orientación conocida pintado redondo conserva el tamaño y la luz total.
  · La magnitud de los tipos Cl+N mezcla cúmulo y nebulosa, y esas estrellas ya
    las pinta Gaia. Se acepta el doble conteo: excluir Cl+N dejaría fuera M42.

Salidas:
  mapa/datos/nebulosas.csv
  simulador_ocular/resources/js/nebulosas-datos.js   (window.BITACORA_NEBULOSAS)

Uso:  python3 scripts/gen_nebulosas.py
"""
import csv
import math
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, 'mapa', 'datos', 'ongc_nebulosas.csv')
SRC_ABELL = os.path.join(RAIZ, 'mapa', 'datos', 'abell_pn.csv')
OUT_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'nebulosas.csv')
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js')

FUENTE = ('Verga, OpenNGC (NGC + IC) · '
          'https://github.com/mattiaverga/OpenNGC · '
          '+ suplemento Abell (gen_abell_pn.py: SIMBAD + Acker V/84)')

TIPOS = ('Neb', 'HII', 'Cl+N', 'RfN', 'EmN', 'PN', 'SNR')

MAG_MAX = 14.0      # más débil no se ve por un ocular (14: alcance de un dobson grande)
SERSIC_N = 1.0      # exponencial: núcleo marcado y alas que se desvanecen

# Del semieje de catálogo al radio efectivo. Es el mando de calibración de esta
# capa: subirlo agranda y apaga, bajarlo encoge y aviva. Hay dos, porque el
# tamaño de catálogo no significa lo mismo en los dos casos:
#   · Difusas (HII, reflexión, Cl+N) — el eje mayor llega a una isofota tenue.
#     Para un exponencial la isofota al 10 % del pico cae en 2,4·r_e y la del 1 %
#     en 3,7·r_e; 0,30 deja el tamaño aparente entre ambas.
#   · Compactas (planetarias, restos de supernova) — el tamaño de catálogo ES el
#     objeto, con borde definido. La mitad de la luz de un disco casi uniforme
#     cae en 0,7·R. Con 0,30 M57 salía a μ_e = 16,8 contra los ~18,6 reales.
RE_SOBRE_SEMIEJE = 0.30
RE_SOBRE_SEMIEJE_COMPACTA = 0.60
COMPACTAS = ('PN', 'SNR')

# Suelo de brillo superficial en r_e, en mag/arcsec². Muchas filas traen la
# magnitud de la ESTRELLA que ilumina la nebulosa, no la de la nebulosa: NGC 1980
# aparece con V = 2,5, que es ι Orionis. Sin tope sale a μ_e = 14,5 —más brillante
# que el núcleo de M42— y encima duplica luz, porque esa estrella ya la pinta
# Gaia. El tope se pone por encima de M42, que con μ_e = 20,8 y pico en 19,0 es
# la región HII más brillante del cielo: nada recortado debe superarla mucho. Las
# compactas llevan otro suelo, porque su brillo superficial alto sí es real.
# El recorte baja la luz total y deja el tamaño intacto: lo que sobra es estelar.
MU_MIN = 20.0
MU_MIN_COMPACTA = 17.5

# μ ASUMIDA de las nebulosas de reflexión sin magnitud de catálogo (ADR 0024).
# En la clase RfN la magnitud del OpenNGC tampoco es fotometría de la nebulosa:
# muchas filas traen la de la estrella que la ilumina, y de las 13 que sí la
# traen, 12 caen bajo MU_MIN y acaban en ese mismo valor por el recorte de
# arriba. Otras 25 no traen ninguna y se perdían enteras, NGC 2023 incluida.
#
#   En ausencia de fotometría nebular utilizable, la implementación actual
#   representa las RfN con μ asumida = 20,0, coincidente con el suelo actual de
#   la tubería. Este valor no se interpreta como una medición física.
#
# De ahí se deriva la magnitud invirtiendo mu_efectivo() con el tamaño de
# catálogo. Solo RfN: las otras clases también tienen filas sin magnitud (56
# 'Neb', 42 'HII', 26 'Cl+N', 4 'EmN', 5 'SNR') y cada una exige su validación.
MU_ASUMIDA = MU_MIN
CLASES_MU_ASUMIDA = ('RfN',)

# B−V típico para pasar la magnitud azul a visual cuando falta V. La emisión
# nebular reparte luz entre Hβ/[OIII] (verde-azul) y Hα, así que sale casi neutra.
BV_NEBULAR = 0.30


def numero(s):
    s = (s or '').strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def sexagesimal(s, horas):
    """'00:57:28.61' -> grados. horas=True multiplica por 15."""
    partes = (s or '').strip().replace('+', '').split(':')
    if len(partes) != 3:
        return None
    try:
        d, m, sg = float(partes[0]), float(partes[1]), float(partes[2])
    except ValueError:
        return None
    signo = -1.0 if (s or '').strip().startswith('-') else 1.0
    valor = abs(d) + m / 60.0 + sg / 3600.0
    return signo * valor * (15.0 if horas else 1.0)


def limpia_nombre(s):
    return (s or '').strip().replace('"', "'").replace('\\', '')


def factor_luz(n):
    """L_total = I_e · r_e² · factor_luz(n) · (b/a). Espejo exacto del render."""
    b = 2 * n - 1 / 3.0 + 0.009876 / n
    return 2 * math.pi * n * math.exp(b) * math.gamma(2 * n) / b ** (2 * n)


def mu_efectivo(mag, re_arcsec, q, n):
    """Brillo superficial en r_e, mag/arcsec²."""
    return mag + 2.5 * math.log10(re_arcsec ** 2 * factor_luz(n) * q)


def mag_desde_mu(mu, re_arcsec, q, n):
    """Inversa de mu_efectivo: qué magnitud da ese brillo superficial."""
    return mu - 2.5 * math.log10(re_arcsec ** 2 * factor_luz(n) * q)


def autocomprobacion():
    """Lo que puede salir mal en silencio: el signo de una declinación sur, y que
    `factor_luz` deje de coincidir con el `factorLuz` del render —si divergen, las
    nebulosas salen todas del brillo equivocado sin deformarse, que a ojo no se
    distingue de una calibración distinta."""
    assert abs(sexagesimal('05:35:16.48', True) - 83.81867) < 1e-4
    assert abs(sexagesimal('-05:23:22.8', False) + 5.38967) < 1e-4
    assert abs(sexagesimal('+61:08:37.2', False) - 61.14367) < 1e-4
    assert abs(factor_luz(1.0) - 11.95264) < 1e-4       # mismos valores que en JS
    assert abs(factor_luz(4.0) - 22.66534) < 1e-4
    # El recorte deja el objeto justo en el suelo, ni por encima ni por debajo.
    mag = 2.5
    mu = mu_efectivo(mag, 83.7, 1.0, SERSIC_N)
    assert mu < MU_MIN, mu
    assert abs(mu_efectivo(mag + (MU_MIN - mu), 83.7, 1.0, SERSIC_N) - MU_MIN) < 1e-9
    # La mu asumida entra por la puerta de atras: mag_desde_mu debe devolver
    # EXACTAMENTE el suelo al pasar por mu_efectivo, o la fila entraria con un
    # brillo que nadie ha decidido (ADR 0024).
    m_as = mag_desde_mu(MU_ASUMIDA, 80.5, 1.0, SERSIC_N)
    assert abs(mu_efectivo(m_as, 80.5, 1.0, SERSIC_N) - MU_ASUMIDA) < 1e-9


def main():
    autocomprobacion()
    filas = []
    sin_datos = 0
    redondas = 0
    recortadas = 0
    asumidas = 0

    registros = []
    for src in (SRC, SRC_ABELL):
        with open(src, encoding='utf-8') as fh:
            registros.extend(csv.DictReader(fh, delimiter=';'))
    for c in registros:
        if c['Type'] not in TIPOS:
            continue
        ra = sexagesimal(c['RA'], True)
        dec = sexagesimal(c['Dec'], False)
        maj = numero(c['MajAx'])          # arcmin, eje mayor completo
        mag_v = numero(c['V-Mag'])
        mag_b = numero(c['B-Mag'])
        if mag_v is None and mag_b is not None:
            mag_v = mag_b - BV_NEBULAR
        # Sin magnitud solo se salvan las clases con μ asumida (ADR 0024); la
        # magnitud se deriva más abajo, cuando ya hay r_e y b/a que invertir.
        mu_asumida = mag_v is None and c['Type'] in CLASES_MU_ASUMIDA
        if ra is None or dec is None or not maj or maj <= 0 or (mag_v is None and not mu_asumida):
            sin_datos += 1
            continue
        if mag_v is not None and mag_v > MAG_MAX:
            sin_datos += 1
            continue

        minor = numero(c['MinAx'])
        pa = numero(c['PosAng'])
        if pa is not None and minor and minor > 0:
            semieje = maj / 2.0
            q = max(0.05, min(1.0, minor / maj))
        else:
            # Sin orientación conocida: redonda de igual área.
            medio = math.sqrt(maj * minor) if (minor and minor > 0) else maj
            semieje = medio / 2.0
            q, pa = 1.0, 0.0
            redondas += 1

        compacta = c['Type'] in COMPACTAS
        escala = RE_SOBRE_SEMIEJE_COMPACTA if compacta else RE_SOBRE_SEMIEJE
        re_arcsec = escala * semieje * 60.0
        suelo = MU_MIN_COMPACTA if compacta else MU_MIN
        if mu_asumida:
            # No hay magnitud que recortar: se ENTRA por el brillo superficial.
            mag_v = mag_desde_mu(MU_ASUMIDA, re_arcsec, q, SERSIC_N)
            asumidas += 1
        mu = mu_efectivo(mag_v, re_arcsec, q, SERSIC_N)
        if mu < suelo:
            mag_v += suelo - mu
            recortadas += 1

        filas.append({
            'nombre': limpia_nombre(c['Name']),
            'alt': limpia_nombre((c['Common names'] or '').split(',')[0]),
            'ra_grados': round(ra, 5),
            'dec_grados': round(dec, 5),
            're_arcsec': round(re_arcsec, 2),
            'razon_ejes': round(q, 3),
            'pa_grados': int(pa),
            'mag_v': round(mag_v, 2),
            'sersic_n': SERSIC_N,
            'frac_bulbo': 0,
            'polvo': 0,
            'clase': c['Type'],
        })

    filas.sort(key=lambda f: f['ra_grados'])

    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as fh:
        escritor = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        escritor.writeheader()
        escritor.writerows(filas)

    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Nebulosas — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_nebulosas.py\n')
        fh.write('   Fuente: %s\n' % FUENTE)
        fh.write('   Campos: [nombre, alt, RA°, Dec°, r_e("), b/a, PA°, mag V, n, B/T, polvo,\n')
        fh.write('            0, clase]\n')
        fh.write('   Mismo esquema que las galaxias: las pinta la misma capa. n = 1 es un\n')
        fh.write('   exponencial; sin bulbo y sin banda de polvo. b/a = 1 significa que el\n')
        fh.write('   catálogo no trae ángulo de posición, no que el objeto sea redondo.\n')
        fh.write('   El 0 ocupa la columna del n de S4G de las galaxias (aquí no hay medida)\n')
        fh.write('   y la clase es el Type del OpenNGC (PN, HII, SNR, RfN, EmN, Neb, Cl+N):\n')
        fh.write('   decide qué filas entran en la capa difusa (ps1CatalogoDifuso).\n')
        fh.write('   OJO con las RfN: en esa clase la magnitud del OpenNGC es la de la\n')
        fh.write('   estrella que ilumina, no la de la nebulosa. Las que no traían ninguna\n')
        fh.write('   llevan mag DERIVADA de mu asumida = 20,0, que no es una medición\n')
        fh.write('   física (ADR 0024); y de las que sí la traían, 12 de 13 acaban en ese\n')
        fh.write('   mismo valor por el suelo MU_MIN. */\n')
        fh.write('window.BITACORA_NEBULOSAS = [\n')
        for f in filas:
            fh.write('  ["%s","%s",%s,%s,%s,%s,%s,%s,%s,%s,%s,0,"%s"],\n' % (
                f['nombre'], f['alt'], f['ra_grados'], f['dec_grados'],
                f['re_arcsec'], f['razon_ejes'], f['pa_grados'], f['mag_v'],
                f['sersic_n'], f['frac_bulbo'], f['polvo'], f['clase']))
        fh.write('];\n')

    print('nebulosas: %d  (redondas por falta de PA %d; recortadas por brillo %d; '
          'con mu asumida %d; descartadas %d)'
          % (len(filas), redondas, recortadas, asumidas, sin_datos))
    print('->', OUT_CSV)
    print('->', OUT_JS)


if __name__ == '__main__':
    main()
