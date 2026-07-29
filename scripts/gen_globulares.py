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

Salidas:
  mapa/datos/globulares.csv
  simulador_ocular/resources/js/globulares-datos.js   (window.BITACORA_GLOBULARES)

Uso:  python3 scripts/gen_globulares.py
"""
import csv
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, 'mapa', 'datos', 'harris_mwgc.dat')
OUT_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'globulares.csv')
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'globulares-datos.js')

FUENTE = ('W. E. Harris (1996), revisión 2010 · McMaster University · '
          'https://physics.mcmaster.ca/~harris/mwgc.dat')

# Anchos fijos de la Parte III, derivados de su cabecera. NO vale partir por
# espacios: hay filas con campos vacíos (NGC 1261 no trae sig_v) que desplazarían
# las columnas, y el indicador de núcleo colapsado ('c' o 'c:') se cuela entre la
# concentración y r_c.
COLS_P3 = {'id': (0, 13), 'c': (48, 58), 'r_c': (58, 64), 'r_h': (64, 70), 'mu_V': (70, 78)}
# Parte I: identificación y posición.
COLS_P1 = {'id': (0, 12), 'nombre': (12, 24), 'ra': (24, 37), 'dec': (37, 51)}


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
        filas.append({
            'id': ident,
            'nombre': pos['nombre'],
            'ra_grados': round(pos['ra'], 5),
            'dec_grados': round(pos['dec'], 5),
            'rc_arcmin': r_c,
            'rh_arcmin': numero(campo(linea, COLS_P3, 'r_h')),
            'concentracion': c,
            'mu_v_central': mu_v,
        })

    filas.sort(key=lambda f: f['ra_grados'])

    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as fh:
        escritor = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        escritor.writeheader()
        escritor.writerows(filas)

    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Cúmulos globulares — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_globulares.py\n')
        fh.write('   Fuente: %s\n' % FUENTE)
        fh.write('   Campos: [id, nombre, RA°, Dec°, r_c(\'), r_h(\'), c=log(r_t/r_c), mu_V(0)]\n')
        fh.write('   mu_V(0) es el brillo superficial central en V, mag/arcsec². */\n')
        fh.write('window.BITACORA_GLOBULARES = [\n')
        for f in filas:
            fh.write('  ["%s","%s",%s,%s,%s,%s,%s,%s],\n' % (
                f['id'], f['nombre'].replace('"', ''), f['ra_grados'], f['dec_grados'],
                f['rc_arcmin'], f['rh_arcmin'] if f['rh_arcmin'] is not None else 'null',
                f['concentracion'], f['mu_v_central']))
        fh.write('];\n')

    print('globulares con perfil completo: %d  (descartados por falta de datos: %d)'
          % (len(filas), sin_estructura))
    print('->', OUT_CSV)
    print('->', OUT_JS)


if __name__ == '__main__':
    main()
