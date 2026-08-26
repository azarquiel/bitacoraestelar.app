# -*- coding: utf-8 -*-
"""Genera el catálogo de estrellas que Gaia DR3 no trae (tickets #130, #131, #132).

Gaia DR3 satura por arriba: Vega, Arturo, Rigel... no aparecen. El agujero es
instrumental (saturación/gating), no algo que DR4 vaya a cerrar solo.

Método (issue #130):
  1. Baja Hipparcos (Hp<9) y Gaia (G<10,5) del TAP de Gaia.
  2. Propaga la posición de Hipparcos de su época (J1991.25) a la de Gaia
     (2016.0) con su movimiento propio.
  3. Cruza EN LOCAL con un árbol KD sobre coordenadas cartesianas de la esfera
     unidad, radio 2″. Una estrella «falta» cuando no hay ninguna fuente Gaia
     dentro de ese radio — binario, sin umbral de magnitud.

El cruce NO se hace por TAP: un NOT EXISTS correlacionado no termina ni en el
endpoint async (medido: >50 min contra un tope de servidor de 2 h). En local
tarda segundos. Tampoco se usa la tabla de vecinos precalculada de Gaia: su
incompletitud hace creer que falta el 16 % cuando la ausencia real es el 0,2 %.

Magnitud y color (issue #131): cada fila lleva magnitud en banda G y color
BP-RP, ambos derivados de la fotometria V y V-I de Hipparcos con las
relaciones fotometricas PUBLICADAS de Gaia EDR3 (pivote V-I):

  Gaia EDR3 documentation, cap. 5.5.1 'Photometric relationships with other
  photometric systems', tabla 5.7 (polinomios Johnson-Kron-Cousins) y tabla
  5.8 (rangos de validez); Riello et al. 2021, A&A 649, A3.
  https://gea.esac.esa.int/archive/documentation/GEDR3/Data_processing/chap_cu5pho/cu5pho_sec_photSystem/cu5pho_ssec_photRelations.html

    G - V   = -0.01597 - 0.02809x - 0.2483x^2 + 0.03656x^3 - 0.002939x^4
    BP - RP = -0.03298 + 1.259x - 0.1279x^2 + 0.01631x^3      (x = V-I)
  validas ambas en -0.4 < V-I < 5.0.

Residuo conocido de la conversion, medido sobre los pares de calibracion
Hipparcos x Gaia (test_hipparcos.py lo fija): G con mediana +0.007 y
sigma 0.023; el color arrastra un sesgo de -0.037 que se deja SIN corregir
a proposito: corregirlo seria ajustar a ojo justo lo que se decidio tomar
publicado (issue #131).

Sin fotometria para derivar (V o V-I ausentes, o V-I fuera de rango): la
magnitud cae a Hp tal cual -mejor que reabrir el agujero- y el color se
omite. El generador NO inventa color.

Expansión de sistemas (issue #132; ADR 0018 «Las estrellas que Gaia DR3 no trae
son un catálogo aparte», simulador_ocular/docs/adr/ — se escribió como 0017 en
una rama sin fusionar y se renumeró al traerlo, porque el 0017 ya lo ocupaba el
de la máscara): Hipparcos publica una fila por sistema cerrado; el render dibuja
estrellas, no sistemas. El generador abre
esos sistemas en componentes, con estas reglas:

  - La componente B solo se sintetiza cuando el par, mirando Gaia MÁS las
    filas de ausencia de este fichero, no reúne sus dos componentes. El
    recuento usa un círculo de máx(3″, 1,5·sep, 25″) y un límite de
    máx(mag1, mag2)+1: el suelo de 25″ cubre que las posiciones del catálogo
    de dobles son J2000 y con la AR redondeada a segundos enteros de tiempo
    (±7,5″·cos δ), mientras que Gaia y este fichero están en 2016.0. Es lo
    que sostiene el invariante: ninguna doble gana una componente de más.
  - El ancla de un par del catálogo de dobles es la fila de Hipparcos más
    cercana dentro de 40″ (posición ya propagada a 2016.0). Es el radio que
    reproduce el prerregistro de ese ADR: 68 pares comparables, 45 en
    banda y 23 fuera (con 25″ salen 67 y con 60″, 71).
  - En la separación manda la del catálogo de dobles. La rho de Hipparcos
    solo se acepta si |rho − sep| ≤ máx(0,3″, 15 %·sep); fuera de esa banda
    está describiendo OTRO par (ζ UMa: 715,5″ contra 14,43″) y se descarta
    junto con su theta y su dhp.
  - El ángulo de posición: el pa del WDS por encima del theta de Hipparcos
    (época J1991.25); sin ninguno, se asume uno oblicuo (55°), que no deja
    el par alineado con los ejes.
  - El campo `origen` lo decide el ángulo: 'medida' para las filas con
    astrometría propia de Hipparcos, 'derivada' para las compañeras
    colocadas con un ángulo medido (WDS o Hipparcos), 'asumida' para las
    colocadas a 55°.
  - Los sistemas cerrados del anexo de dobles de Hipparcos que faltan de
    Gaia y no tienen par en el catálogo de dobles también se abren, con
    rho/theta/dhp tal cual.
  - Ninguna compañera se escribe si ya hay una fuente Gaia o una fila de
    Hipparcos a menos de 2″ de su posición: el fichero solo contiene
    ausencias.

Deliberadamente fuera (D4 — sistemas múltiples): la componente interna que
Hipparcos conoce en ζ UMa o ε Lyr se descarta a propósito por la banda. Y los
ángulos de los pares de órbita rápida (Cástor, σ Ori, δ Gem, Mekbuda) son de
época 1991,25 y siguen caducos: mejores que 55° inventados, no verdad.

Salida:
  simulador_ocular/resources/js/estrellas-brillantes-datos.js
  (window.BITACORA_ESTRELLAS_BRILLANTES = [[ra, dec, mag, bp_rp, origen], ...])

Uso:  python3 scripts/gen_hipparcos.py
"""
import io
import math
import os
import urllib.parse
import urllib.request

import numpy as np
from scipy.spatial import cKDTree

import gen_dobles

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'estrellas-brillantes-datos.js')
DOBLES_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'estrellas_dobles.csv')

TAP = 'https://gea.esac.esa.int/tap-server/tap/sync'
EPOCA_HIP = 1991.25
EPOCA_GAIA = 2016.0
RADIO_CRUCE_ARCSEC = 2.0

# Ancla de un par del catálogo de dobles a su fila de Hipparcos. 40″ es el
# radio que reproduce el prerregistro del ADR de las estrellas que Gaia no
# trae (68 comparables, 45/23).
RADIO_ANCLA_ARCSEC = 40.0

# Recuento de «el par ya está completo», y con ello el invariante de no añadir
# una tercera estrella donde hay dos. El suelo de época es por el catálogo de
# dobles (J2000, AR redondeada a segundos enteros de tiempo), que este
# generador no propaga; las filas de Hipparcos sí van ya en 2016.0.
PAR_ANGULO_ASUMIDO = 55.0   # ° de PA, desde el Norte hacia el Este
PAR_MARGEN_MAG = 1.0        # la componente puede venir hasta 1 mag más débil
PAR_RADIO_MIN = 3.0         # ″ suelo del círculo de búsqueda
PAR_RADIO_EPOCA = 25.0      # ″ suelo por desajuste de época J2000/2016.0

# Relaciones fotometricas publicadas de Gaia EDR3 (tablas 5.7/5.8, ver
# cabecera). Pivote x = V-I (Kron-Cousins), validez -0.4 < x < 5.0.
VI_MIN, VI_MAX = -0.4, 5.0
COEF_G_MENOS_V = (-0.01597, -0.02809, -0.2483, 0.03656, -0.002939)
COEF_BP_RP = (-0.03298, 1.259, -0.1279, 0.01631)


def _poli(coefs, x):
    return sum(c * x ** i for i, c in enumerate(coefs))


def _num(v):
    """Valor numerico de una casilla del TAP/CSV, o None si viene en blanco."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def g_desde_v(vmag, v_i):
    """Magnitud G desde V y V-I (tabla 5.7 de EDR3). None si faltan datos
    o V-I cae fuera del rango publicado: no se extrapola."""
    if vmag is None or v_i is None or not VI_MIN < v_i < VI_MAX:
        return None
    return vmag + _poli(COEF_G_MENOS_V, v_i)


def bprp_desde_vi(v_i):
    """Color BP-RP desde V-I (tabla 5.7 de EDR3). None si falta el dato o
    cae fuera del rango publicado: el generador no inventa color."""
    if v_i is None or not VI_MIN < v_i < VI_MAX:
        return None
    return _poli(COEF_BP_RP, v_i)


def banda_aceptacion(sep):
    """|rho − sep| tolerable para aceptar que Hipparcos habla del MISMO par.
    La discrepancia es bimodal (45 coinciden, 23 describen otro par), así
    que esto es una banda de aceptación, no un promedio."""
    return max(0.3, 0.15 * sep)


def _consulta(adql, maxrec):
    data = urllib.parse.urlencode({
        'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv',
        'QUERY': adql, 'MAXREC': str(maxrec),
    }).encode()
    with urllib.request.urlopen(TAP, data=data, timeout=180) as r:
        texto = r.read().decode('utf-8')
    filas = texto.splitlines()[1:]
    return [f.split(',') for f in filas if f]


def _f(v):
    return float(v) if v != '' else 0.0


def _unit(ra_deg, dec_deg):
    ra = np.radians(ra_deg)
    de = np.radians(dec_deg)
    return np.column_stack([np.cos(de) * np.cos(ra), np.cos(de) * np.sin(ra), np.sin(de)])


def _cuerda(arcsec):
    return 2 * np.sin(np.radians(arcsec / 3600.0) / 2)


def _desplazar(ra0, dec0, sep_arcsec, pa_grados):
    """Posición a sep″ y pa° (N→E) de (ra0, dec0). Cielo plano local: la miga
    de cos δ es irrelevante para dibujar."""
    pa = math.radians(pa_grados)
    return (ra0 + sep_arcsec * math.sin(pa) / (3600.0 * math.cos(math.radians(dec0))),
            dec0 + sep_arcsec * math.cos(pa) / 3600.0)


def cargar_dobles():
    """Filas del catálogo unificado de dobles, con los números ya parseados."""
    import csv
    dobles = []
    with io.open(DOBLES_CSV, encoding='utf-8') as fh:
        for row in csv.DictReader(fh, delimiter=';'):
            dobles.append({
                'id': row['Id'],
                'nombre': row['Name'].split(',')[0],
                'ra': gen_dobles.ra_grados(row['RA']),
                'dec': gen_dobles.dec_grados(row['Dec']),
                'mag1': _num((row['Mag 1'] or '').replace(',', '.')),
                'mag2': _num((row['Mag 2'] or '').replace(',', '.')),
                'sep': _num((row['Sep'] or '').replace(',', '.')),
                'pa': _num((row['PosAngle'] or '').replace(',', '.')),
            })
    return dobles


def construir():
    hip_rows = _consulta(
        'SELECT hip, ra, de, pmra, pmde, hpmag, vmag, v_i, ncomp, theta, rho, dhp '
        'FROM public.hipparcos WHERE hpmag < 9',
        maxrec=200000)
    gaia_rows = _consulta(
        'SELECT source_id, ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source '
        'WHERE phot_g_mean_mag < 10.5',
        maxrec=1000000)

    # Sin solución astrométrica (ra/de en blanco) no se puede propagar ni cruzar.
    hip_rows = [r for r in hip_rows if r[1] != '' and r[2] != '']

    dt = EPOCA_GAIA - EPOCA_HIP
    hip_ra = np.array([_f(r[1]) for r in hip_rows])
    hip_de = np.array([_f(r[2]) for r in hip_rows])
    hip_pmra = np.array([_f(r[3]) for r in hip_rows])
    hip_pmde = np.array([_f(r[4]) for r in hip_rows])
    hip_mag = np.array([_f(r[5]) for r in hip_rows])
    cosd = np.cos(np.radians(hip_de))
    hip_ra_2016 = hip_ra + (hip_pmra / 1000.0 / 3600.0) * dt / cosd
    hip_de_2016 = hip_de + (hip_pmde / 1000.0 / 3600.0) * dt

    gaia_ra = np.array([_f(r[1]) for r in gaia_rows])
    gaia_de = np.array([_f(r[2]) for r in gaia_rows])
    gaia_g = np.array([_f(r[3]) for r in gaia_rows])

    arbol_gaia = cKDTree(_unit(gaia_ra, gaia_de))
    arbol_hip = cKDTree(_unit(hip_ra_2016, hip_de_2016))
    dist, idx_gaia = arbol_gaia.query(_unit(hip_ra_2016, hip_de_2016), k=1)
    falta = dist >= _cuerda(RADIO_CRUCE_ARCSEC)
    idx_falta = np.where(falta)[0]

    def anexo(i):
        r = hip_rows[i]
        return _num(r[8]), _num(r[9]), _num(r[10]), _num(r[11])   # ncomp, theta, rho, dhp

    # ── Las ausencias con astrometría propia: origen 'medida' (issue #130) ──
    filas = []
    fila_por_hip = {}
    for i in idx_falta:
        i = int(i)
        ncomp, theta, rho, dhp = anexo(i)
        if ncomp and ncomp > 1 and rho is not None:
            # Artefacto de fotocentro (70 Oph): Hipparcos publica el fotocentro
            # del sistema cerrado y la órbita lo ha movido a >2″ de las DOS
            # componentes, que Gaia SÍ trae. Si el par ya está resuelto en
            # Gaia dentro del círculo del par, la fila no es una ausencia
            # y escribirla pintaría una tercera estrella donde hay dos.
            radio = max(PAR_RADIO_MIN, 1.5 * rho, PAR_RADIO_EPOCA)
            u = _unit(np.array([hip_ra_2016[i]]), np.array([hip_de_2016[i]]))[0]
            limite = hip_mag[i] + (dhp or 0.0) + PAR_MARGEN_MAG
            if sum(1 for k in arbol_gaia.query_ball_point(u, _cuerda(radio))
                   if gaia_g[k] <= limite) >= 2:
                continue
        vmag = _num(hip_rows[i][6])
        v_i = _num(hip_rows[i][7])
        g = g_desde_v(vmag, v_i)
        fila = {
            'hip': hip_rows[i][0], 'doble': None,
            'ra': hip_ra_2016[i],
            'dec': hip_de_2016[i],
            # Sin V/V-I no hay conversion: Hp tal cual antes que reabrir el
            # agujero. El censo del __main__ delata cuantas caen ahi.
            'mag': g if g is not None else hip_mag[i],
            # Color solo si la magnitud tambien salio en G: una fila promete
            # [RA, Dec, G, BP-RP, origen] y mezclar Hp con color romperia el
            # contrato (revision issue #131).
            'bp_rp': bprp_desde_vi(v_i) if g is not None else None,
            'origen': 'medida', 'fuente': 'hipparcos',
        }
        filas.append(fila)
        fila_por_hip[i] = fila
    arbol_ausencias = cKDTree(_unit(
        np.array([f['ra'] for f in filas]), np.array([f['dec'] for f in filas])))

    def ya_existe(ra_b, dec_b, ancla, limite):
        """¿Ya hay una estrella a <2″ que pueda SER la componente? El fichero
        solo contiene ausencias: si la B existe, no se escribe. Una fuente
        Gaia más débil que `limite` es estrella de campo, no componente —el
        mismo criterio del recuento—; una fila de Hipparcos (≠ ancla) siempre
        cuenta, porque a Hp<9 nunca es una estrella de campo del par."""
        u = _unit(np.array([ra_b]), np.array([dec_b]))[0]
        if any(gaia_g[k] <= limite
               for k in arbol_gaia.query_ball_point(u, _cuerda(RADIO_CRUCE_ARCSEC))):
            return True
        dd, jj = arbol_hip.query(u, k=2)
        return any(jj[k] != ancla and dd[k] < _cuerda(RADIO_CRUCE_ARCSEC) for k in range(2))

    def par_completo(d, sep_ref):
        """Recuento de componentes con las constantes de arriba, mirando
        Gaia y las filas de ausencia de este mismo fichero."""
        radio = max(PAR_RADIO_MIN, 1.5 * (sep_ref or 0.0), PAR_RADIO_EPOCA)
        u = _unit(np.array([d['ra']]), np.array([d['dec']]))[0]
        m1 = d['mag1'] if d['mag1'] is not None else 99.0
        m2 = d['mag2'] if d['mag2'] is not None else -99.0
        limite = max(m1, m2) + PAR_MARGEN_MAG
        n = sum(1 for k in arbol_gaia.query_ball_point(u, _cuerda(radio))
                if gaia_g[k] <= limite)
        n += len(arbol_ausencias.query_ball_point(u, _cuerda(radio)))
        return n >= 2

    dobles = cargar_dobles()

    # ── Compañeras de los pares del catálogo de dobles (issue #132) ──
    hip_ancladas = set()
    for d in dobles:
        u = _unit(np.array([d['ra']]), np.array([d['dec']]))[0]
        dd, i = arbol_hip.query(u, k=1)
        if dd >= _cuerda(RADIO_ANCLA_ARCSEC):
            continue                  # sin ancla de Hipparcos no hay dónde colgar la B
        i = int(i)
        if i in hip_ancladas:
            continue                  # dos entradas del catálogo sobre el mismo
                                      # sistema son la misma doble: una B basta
        ncomp, theta, rho, dhp = anexo(i)
        sep_cat, pa_cat = d['sep'], d['pa']
        # La banda de aceptación: fuera de ella, rho/theta/dhp hablan de OTRO par.
        if sep_cat is not None and rho is not None:
            en_banda = abs(rho - sep_cat) <= banda_aceptacion(sep_cat)
        else:
            en_banda = rho is not None   # sin sep publicada, la de Hipparcos es la única
        sep_use = rho if en_banda else sep_cat
        if sep_use is None or not sep_use > 0:
            continue                  # sin separación por ningún lado no se inventa
        if par_completo(d, sep_use):
            continue                  # invariante: ninguna doble gana una de más
        # Magnitud de la B: dhp medido del anexo cuando pertenece a este par;
        # si no, la mag2 del catálogo convertida a G con el V-I del sistema.
        v_i = _num(hip_rows[i][7])
        if en_banda and dhp is not None:
            # El ancla puede faltar de Gaia y aun así no estar en el fichero
            # (artefacto de fotocentro suprimido): entonces la fuente Gaia más
            # cercana es una componente real del par y sirve de base.
            base = fila_por_hip[i]['mag'] if i in fila_por_hip else gaia_g[int(idx_gaia[i])]
            mag_b = base + dhp
        elif d['mag2'] is not None:
            g2 = g_desde_v(d['mag2'], v_i)
            mag_b = g2 if g2 is not None else d['mag2']
        else:
            continue                  # sin magnitud de la B no se inventa
        # El catálogo es Hp<9 y el cruce solo ve G<10,5: una compañera más
        # débil que el corte del catálogo ni pertenece a este fichero ni se
        # puede declarar ausente con esta muestra (27 Hya: la C de mag 10,9
        # SÍ está en Gaia, solo que fuera del corte).
        if mag_b >= 9:
            continue
        # Ángulo: el pa del WDS por encima del theta de Hipparcos (J1991.25).
        if pa_cat is not None:
            ang, origen, fuente = pa_cat, 'derivada', 'wds'
        elif en_banda and theta is not None:
            ang, origen, fuente = theta, 'derivada', 'hipparcos'
        else:
            ang, origen, fuente = PAR_ANGULO_ASUMIDO, 'asumida', 'asumido'
        ra_b, dec_b = _desplazar(hip_ra_2016[i], hip_de_2016[i], sep_use, ang)
        m1 = d['mag1'] if d['mag1'] is not None else 99.0
        m2 = d['mag2'] if d['mag2'] is not None else -99.0
        if ya_existe(ra_b, dec_b, i, max(m1, m2) + PAR_MARGEN_MAG):
            continue
        hip_ancladas.add(i)
        filas.append({
            'hip': None, 'doble': d['id'],
            'ra': ra_b, 'dec': dec_b, 'mag': mag_b,
            # El color de la B, del V-I del sistema al que pertenece (en banda);
            # fuera de banda la B es de otro sistema fotométrico: sin color.
            'bp_rp': bprp_desde_vi(v_i) if en_banda else None,
            'origen': origen, 'fuente': fuente,
        })

    # ── Sistemas cerrados del anexo que faltan de Gaia y no tienen par en el
    #    catálogo de dobles: también se abren, con rho/theta/dhp tal cual ──
    arbol_dobles = cKDTree(_unit(
        np.array([d['ra'] for d in dobles]), np.array([d['dec'] for d in dobles])))
    for i in idx_falta:
        i = int(i)
        if i in hip_ancladas:
            continue
        if i not in fila_por_hip:
            continue                  # artefacto de fotocentro suprimido: su par
                                      # ya está resuelto en Gaia, nada que abrir
        ncomp, theta, rho, dhp = anexo(i)
        if not (ncomp and ncomp > 1 and rho is not None and dhp is not None):
            continue
        if arbol_dobles.query(_unit(np.array([hip_ra_2016[i]]),
                                    np.array([hip_de_2016[i]]))[0],
                              k=1)[0] < _cuerda(RADIO_ANCLA_ARCSEC):
            continue                  # tratado (o descartado) por el bucle del catálogo
        if fila_por_hip[i]['mag'] + dhp >= 9:
            continue                  # mismo corte Hp<9 que el resto del fichero
        ang = theta if theta is not None else PAR_ANGULO_ASUMIDO
        ra_b, dec_b = _desplazar(hip_ra_2016[i], hip_de_2016[i], rho, ang)
        if ya_existe(ra_b, dec_b, i, fila_por_hip[i]['mag'] + dhp + PAR_MARGEN_MAG):
            continue
        filas.append({
            'hip': None, 'doble': None,
            'ra': ra_b, 'dec': dec_b,
            'mag': fila_por_hip[i]['mag'] + dhp,
            'bp_rp': fila_por_hip[i]['bp_rp'],
            'origen': 'derivada' if theta is not None else 'asumida',
            'fuente': 'hipparcos',
        })

    filas.sort(key=lambda f: f['mag'])
    return filas


def js_num(x):
    return ('%.6f' % x).rstrip('0').rstrip('.')


def escribir_js(filas):
    with io.open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Estrellas que Gaia DR3 no trae — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_hipparcos.py\n')
        fh.write('   Fuente: public.hipparcos (Hp<9) cruzado en local contra\n')
        fh.write('   gaiadr3.gaia_source (G<10,5), TAP de Gaia. Posición propagada de\n')
        fh.write('   J1991.25 a 2016.0 con movimiento propio; "falta" = cero fuentes\n')
        fh.write('   Gaia dentro de 2″. Los sistemas cerrados de Hipparcos vienen\n')
        fh.write('   abiertos en componentes (separación y ángulo medidos; el pa del\n')
        fh.write('   WDS por encima del theta de Hipparcos). Ver issues #130, #131 y\n')
        fh.write('   #132 (azarquiel/bitacoraestelar.app) y el ADR 0018 de\n')
        fh.write('   simulador_ocular/docs/adr/.\n')
        fh.write('   Magnitud en banda G y color BP−RP, derivados de V y V−I de\n')
        fh.write('   Hipparcos con las relaciones publicadas de Gaia EDR3 (tablas\n')
        fh.write('   5.7/5.8, pivote V−I; Riello et al. 2021). Residuo conocido:\n')
        fh.write('   G mediana +0,007 σ 0,023; color con sesgo −0,037 sin corregir.\n')
        fh.write('   Campos: [RA°, Dec°, G, BP−RP|null, null, origen]. La 5ª casilla\n')
        fh.write('   va a null A PROPÓSITO: dibujar() la reserva para la magnitud de\n')
        fh.write('   detección (gDet) de las estrellas sintéticas de un cúmulo, y un\n')
        fh.write('   texto ahí anularía el recorte por mlim. El origen (6ª) declara la\n')
        fh.write('   procedencia: "medida" (astrometría propia de Hipparcos),\n')
        fh.write('   "derivada" (compañera a ángulo medido) o "asumida" (compañera a\n')
        fh.write('   55°). Sin fotometría no hay color: null, nunca inventado. Se\n')
        fh.write('   concatena tal cual a la muestra de Gaia en dibujar() de\n')
        fh.write('   bitacora-gaia-render.js. */\n')
        fh.write('window.BITACORA_ESTRELLAS_BRILLANTES = [\n')
        for f in filas:
            bprp = js_num(f['bp_rp']) if f['bp_rp'] is not None else 'null'
            fh.write('  [%s, %s, %s, %s, null, "%s"],\n' % (
                js_num(f['ra']), js_num(f['dec']), js_num(f['mag']), bprp, f['origen']))
        fh.write('];\n')
    print('->', OUT_JS)


if __name__ == '__main__':
    filas = construir()
    escribir_js(filas)
    print('%d filas' % len(filas))
    for origen in ('medida', 'derivada', 'asumida'):
        print('  origen %-8s: %d' % (origen, sum(1 for f in filas if f['origen'] == origen)))
    for fuente in ('hipparcos', 'wds', 'asumido'):
        print('  fuente %-9s: %d' % (fuente, sum(1 for f in filas if f['fuente'] == fuente)))
    print('  sin color derivado: %d' % sum(1 for f in filas if f['bp_rp'] is None))
    for lo, hi in [(None, 3), (3, 4), (4, 9)]:
        n = sum(1 for f in filas if f['mag'] < hi and (lo is None or f['mag'] >= lo))
        print('  G [%s,%d): %d' % (lo if lo is not None else '-inf', hi, n))
