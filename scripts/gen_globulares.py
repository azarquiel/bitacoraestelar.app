# -*- coding: utf-8 -*-
"""Genera el catálogo de cúmulos globulares a partir del de Harris.

Fuente: W. E. Harris, «A Catalog of Parameters for Milky Way Globular Clusters»
(1996, revisión de diciembre de 2010), McMaster University.
https://physics.mcmaster.ca/~harris/mwgc.dat

El catálogo se distribuye libre de cargo; quien lo redistribuya debe citar la
fuente original y no cobrar por él. De ahí la atribución en la cabecera de los
dos ficheros generados.

Qué se usa y para qué: el simulador ancla el halo no resuelto de un globular a
su BRILLO SUPERFICIAL CENTRAL medido (mu_V) y a su geometría de King (radio de
core r_c y concentración c = log(r_t/r_c)), en vez de deducirlo de los conteos
de Gaia, que en el núcleo están sesgados por aglomeración.

Forma radial (ADR 0035): los globulares con curva de Trager, King &
Djorgovski (1995) llevan su perfil muVf medido, remuestreado en log r. Fuente:
VizieR J/AJ/109/218/tables, guardada en mapa/datos/trager1995.tsv. Solo va al
.js: globulares.csv no cambia.

Salidas:
  mapa/datos/globulares.csv
  simulador_ocular/resources/js/globulares-datos.js   (window.BITACORA_GLOBULARES)

Uso:  python3 scripts/gen_globulares.py
"""
import csv
import math
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, 'mapa', 'datos', 'harris_mwgc.dat')
SRC_TRAGER = os.path.join(RAIZ, 'mapa', 'datos', 'trager1995.tsv')
OUT_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'globulares.csv')
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'globulares-datos.js')

FUENTE = ('W. E. Harris (1996), revisión 2010 · McMaster University · '
          'https://physics.mcmaster.ca/~harris/mwgc.dat')

# Anchos fijos de la Parte III, derivados de su cabecera. NO vale partir por
# espacios: hay filas con campos vacíos (NGC 1261 no trae sig_v) que desplazarían
# las columnas, y el indicador de núcleo colapsado ('c' o 'c:') se cuela entre la
# concentración y r_c.
COLS_P3 = {'id': (0, 13), 'c': (48, 58), 'r_c': (58, 64), 'r_h': (64, 70), 'mu_V': (70, 78)}
# Parte I: identificación, posición y distancia al Sol.
COLS_P1 = {'id': (0, 12), 'nombre': (12, 24), 'ra': (24, 37), 'dec': (37, 51),
           'd_kpc': (67, 74)}
# Parte II: metalicidad, enrojecimiento, magnitud integrada y elipticidad. La
# elipticidad viene de White & Shawl (1987), recogida por Harris; el ÁNGULO DE
# POSICIÓN no está en este catálogo, así que el perfil se evalúa en radio
# circular hasta que haya de dónde sacarlo (queda como campo nulo, no inventado).
COLS_P2 = {'id': (0, 12), 'feh': (12, 19), 'ebv': (22, 29), 'V_t': (41, 47),
           'ellip': (84, 91)}


def bloque(lineas, arranque):
    """Filas de datos de una de las tres partes, hasta el separador."""
    i = next(k for k, l in enumerate(lineas) if l.strip().startswith(arranque))
    filas = []
    for linea in lineas[i + 1:]:
        if not linea.strip():
            continue
        if set(linea.strip()) <= set('_-*'):
            break
        filas.append(linea)
    return filas


def campo(linea, cols, clave):
    ini, fin = cols[clave]
    return linea[ini:fin].strip()


def numero(texto):
    """Float o None. Limpia el indicador de núcleo colapsado ('c', 'c:')."""
    texto = re.sub(r'\s*c:?\s*$', '', texto).strip()
    if not texto:
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def sex_a_grados(texto, es_ra):
    partes = texto.replace(':', ' ').split()
    if len(partes) < 3:
        return None
    signo = -1.0 if partes[0].lstrip().startswith('-') else 1.0
    grados = abs(float(partes[0])) + float(partes[1]) / 60 + float(partes[2]) / 3600
    return signo * grados * (15.0 if es_ra else 1.0)


# Paso del remuestreo del perfil de Trager, en dex de r. Fijo para que el
# fichero no crezca con la densidad de nodos de cada cúmulo (M15 trae 464
# puntos). MEDIDO contra el spike #537, que interpola sobre los nodos crudos:
# con 0,02 dex el radio pintado (≥ 1 DN) de los 13 del seed en los cuatro
# equipos del spike sale idéntico; con 0,03 y 0,05 dex, M5 y M62 se mueven un
# paso de la tabla radial (0,04'). El .js pasa de 13 a 124 KB.
PASO_DEX = 0.02
# Trager escribe HP 1 sin número; Terzan 11 es otro nombre de Terzan 5 (Harris
# solo trae Terzan 5, que Trager también tiene), así que se queda fuera.
TRAGER_A_HARRIS = {'hp': 'hp1'}


def clave_nombre(nombre):
    """'NGC 104' y 'ngc104', 'Pal 1' y 'pal_1' dan la misma clave."""
    return re.sub(r'[\s_]', '', nombre).lower()


def perfiles_trager():
    """{clave Harris: [log r0, log r1, [muVf...]]} remuestreado en log r.

    Solo nodos con peso > 0 y uno por radio (media de muVf si se repite). Entre
    nodos, lineal en log r: la interpolación del spike #537. Necesita al menos
    dos radios distintos; si no, el globular se queda sin curva (King 1962)."""
    nodos = {}
    with open(SRC_TRAGER, encoding='utf-8') as fh:
        for linea in fh:
            if not linea.strip() or linea.startswith('#'):
                continue
            c = linea.rstrip('\n').split('\t')
            if float(c[4]) <= 0:
                continue
            nombre = c[0].strip()
            nombre = TRAGER_A_HARRIS.get(nombre, nombre)
            nodos.setdefault(clave_nombre(nombre), {}).setdefault(float(c[1]), []).append(float(c[3]))
    perfiles = {}
    for clave, por_radio in nodos.items():
        lr = sorted(por_radio)
        if len(lr) < 2:
            continue
        mf = [sum(por_radio[x]) / len(por_radio[x]) for x in lr]
        n = max(1, int(math.ceil((lr[-1] - lr[0]) / PASO_DEX - 1e-9)))
        mus = []
        for k in range(n + 1):
            x = lr[0] + (lr[-1] - lr[0]) * k / n
            j = 1
            while j < len(lr) - 1 and lr[j] < x:
                j += 1
            u = (x - lr[j - 1]) / (lr[j] - lr[j - 1])
            mus.append(round(mf[j - 1] + u * (mf[j] - mf[j - 1]), 3))
        perfiles[clave] = [lr[0], lr[-1], mus]
    return perfiles


def main():
    with open(SRC, encoding='latin-1') as fh:
        lineas = fh.read().splitlines()

    posiciones = {}
    for linea in bloque(lineas, 'ID        Name'):
        ident = campo(linea, COLS_P1, 'id')
        if not ident:
            continue
        posiciones[ident] = {
            'nombre': campo(linea, COLS_P1, 'nombre'),
            'ra': sex_a_grados(campo(linea, COLS_P1, 'ra'), True),
            'dec': sex_a_grados(campo(linea, COLS_P1, 'dec'), False),
            'd_kpc': numero(campo(linea, COLS_P1, 'd_kpc')),
        }

    fotometria = {}
    for linea in bloque(lineas, 'ID       [Fe/H]'):
        ident = campo(linea, COLS_P2, 'id')
        if not ident:
            continue
        fotometria[ident] = {
            'feh': numero(campo(linea, COLS_P2, 'feh')),
            'ebv': numero(campo(linea, COLS_P2, 'ebv')),
            'V_t': numero(campo(linea, COLS_P2, 'V_t')),
            'ellip': numero(campo(linea, COLS_P2, 'ellip')),
        }

    filas = []
    sin_estructura = 0
    for linea in bloque(lineas, 'ID         v_r'):
        ident = campo(linea, COLS_P3, 'id')
        pos = posiciones.get(ident)
        if not pos or pos['ra'] is None:
            continue
        c = numero(campo(linea, COLS_P3, 'c'))
        r_c = numero(campo(linea, COLS_P3, 'r_c'))
        mu_v = numero(campo(linea, COLS_P3, 'mu_V'))
        # Sin los tres no se puede anclar el perfil: el simulador cae a los
        # conteos de Gaia para ese objeto, así que mejor no incluirlo.
        if c is None or r_c is None or mu_v is None or r_c <= 0:
            sin_estructura += 1
            continue
        fot = fotometria.get(ident, {})
        filas.append({
            'id': ident,
            'nombre': pos['nombre'],
            'ra_grados': round(pos['ra'], 5),
            'dec_grados': round(pos['dec'], 5),
            'rc_arcmin': r_c,
            'rh_arcmin': numero(campo(linea, COLS_P3, 'r_h')),
            'concentracion': c,
            'mu_v_central': mu_v,
            # Los cinco de la población (Capa 1): sin V_t no hay flujo total que
            # repartir, así que el módulo se abstiene y el cúmulo se queda solo
            # con sus estrellas de Gaia.
            'v_total': fot.get('V_t'),
            'd_kpc': pos['d_kpc'],
            'ebv': fot.get('ebv'),
            'feh': fot.get('feh'),
            'elipticidad': fot.get('ellip'),
        })

    filas.sort(key=lambda f: f['ra_grados'])

    perfiles = perfiles_trager()
    sin_casar = set(perfiles) - {clave_nombre(f['id']) for f in filas}

    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as fh:
        escritor = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        escritor.writeheader()
        escritor.writerows(filas)

    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Cúmulos globulares — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_globulares.py\n')
        fh.write('   Fuente: %s\n' % FUENTE)
        fh.write('   Campos: [id, nombre, RA°, Dec°, r_c(\'), r_h(\'), c=log(r_t/r_c), mu_V(0),\n')
        fh.write('            V_t, d(kpc), E(B-V), [Fe/H], elipticidad]\n')
        fh.write('   mu_V(0) es el brillo superficial central en V, mag/arcsec².\n')
        fh.write('   V_t, d, E(B-V) y [Fe/H] son la entrada de la población (Capa 1):\n')
        fh.write('   V_t fija el flujo total, d y E(B-V) el módulo de distancia aparente y\n')
        fh.write('   [Fe/H] cuál de las tres funciones de luminosidad se interpola.\n')
        fh.write('   La elipticidad es de White & Shawl (1987); Harris no trae su ángulo de\n')
        fh.write('   posición, así que el perfil se evalúa en radio circular. */\n')
        fh.write('window.BITACORA_GLOBULARES = [\n')

        def num(v):
            return 'null' if v is None else ('%g' % v)

        for f in filas:
            perfil = perfiles.get(clave_nombre(f['id']))
            fh.write('  ["%s","%s",%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s],\n' % (
                f['id'], f['nombre'].replace('"', ''), f['ra_grados'], f['dec_grados'],
                f['rc_arcmin'], num(f['rh_arcmin']),
                f['concentracion'], f['mu_v_central'],
                num(f['v_total']), num(f['d_kpc']), num(f['ebv']), num(f['feh']),
                num(f['elipticidad']),
                'null' if perfil is None else '[%g,%g,[%s]]' % (
                    perfil[0], perfil[1], ','.join('%g' % m for m in perfil[2]))))
        fh.write('];\n')

    print('globulares con perfil completo: %d  (descartados por falta de datos: %d)'
          % (len(filas), sin_estructura))
    print('con curva de Trager: %d  (de Trager sin globular en el catálogo: %s)'
          % (sum(1 for f in filas if clave_nombre(f['id']) in perfiles),
             ', '.join(sorted(sin_casar)) or 'ninguno'))
    print('->', OUT_CSV)
    print('->', OUT_JS)


if __name__ == '__main__':
    main()
