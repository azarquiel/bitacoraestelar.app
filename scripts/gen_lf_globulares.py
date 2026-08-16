# -*- coding: utf-8 -*-
"""Genera las funciones de luminosidad de cúmulos globulares (Capa 1).

Fuente: isócronas PARSEC v1.2S + COLIBRI, servidas por CMD 3.9
(http://stev.oapd.inaf.it/cmd), Bressan et al. (2012) MNRAS 427, 127 y
referencias de la cabecera del fichero generado. IMF de Kroupa (2001, 2002).

Se piden TRES funciones de luminosidad, una por metalicidad —pobre, intermedia
y rica—, porque 47 Tuc ([Fe/H] = -0.72) y M92 (-2.31) están en los extremos del
catálogo de Harris, tienen ramas gigantes distintas, y la LF es exactamente lo
que fija el contraste del grano (S2) del campo estadístico.

Dos conversiones que conviene tener a la vista:

  - PARSEC se parametriza por [M/H], y Harris tabula [Fe/H]. Para el
    enriquecimiento alfa típico de un globular ([alpha/Fe] = +0.4) se usa la
    equivalencia de Salaris et al. (1993), [M/H] = [Fe/H] + 0.29.
  - Edad 12 Gyr (log t = 10.079) para las tres, que es la edad típica del
    sistema; la LF de un globular es mucho más sensible a la metalicidad que a
    un par de Gyr de edad.

El rango va de la punta de la rama gigante al final de la isócrona (M_V ~ +13),
sin cortar en M_V = +9: los bins débiles casi no aportan flujo, pero cortarlos
sería tirar flujo que la conservación fotométrica luego echa de menos. El
script imprime qué fracción del flujo vive más allá de M_V = +9 para que ese
"casi" sea un número y no una creencia.

Salida:
  resources/js/lf-globulares-datos.js   (window.BITACORA_LF_GLOBULARES)

Uso:  python3 scripts/gen_lf_globulares.py
"""
import os
import re
import subprocess

# La descarga va por curl y no por urllib a propósito: urllib usa el almacén de
# certificados de su propio python (el de Homebrew no ve el llavero del sistema)
# y se cae con CERTIFICATE_VERIFY_FAILED contra CMD. curl usa el del sistema.

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JS = os.path.join(RAIZ, 'resources', 'js', 'lf-globulares-datos.js')

CMD = 'https://stev.oapd.inaf.it/cgi-bin/cmd_3.9'
TMP = 'https://stev.oapd.inaf.it/tmp/'

LOG_EDAD = 10.079          # 12 Gyr
DELTA_ALFA = 0.29          # [M/H] - [Fe/H] para [alpha/Fe] = +0.4 (Salaris+93)
PASO_MAG = 0.25
MAG_INF, MAG_SUP = -6.0, 16.0

# [Fe/H] de las tres tablas: los dos extremos del catálogo de Harris y el medio.
FEH = [-2.0, -1.5, -0.7]

# La versión entra en la clave de caché de la realización: cambiarla invalida
# las estrellas sintéticas ya generadas, que es justo lo que debe pasar.
VERSION = 'parsec12s-kroupa-12gyr-1'


def peticion(feh):
    """Campos del formulario de CMD 3.9 para la LF de una metalicidad."""
    mh = feh + DELTA_ALFA
    return {
        'submit_form': 'Submit', 'cmd_version': '3.9',
        'track_parsec': 'parsec_CAF09_v1.2S', 'track_omegai': '0.00',
        'track_colibri': 'parsec_CAF09_v1.2S_S_LMC_08_web', 'track_postagb': 'no',
        'n_inTPC': '10', 'eta_reimers': '0.2', 'kind_interp': '1', 'kind_postagb': '-1',
        'photsys_file': 'YBC_tab_mag_odfnew/tab_mag_ubvrijhk.dat',
        'photsys_version': 'YBCnewVega',
        'dust_sourceM': 'dpmod60alox40', 'dust_sourceC': 'AMCSIC15',
        'kind_mag': '2', 'kind_dust': '0', 'extinction_av': '0.0',
        'extinction_coeff': 'constant', 'extinction_curve': 'cardelli', 'kind_LPV': '4',
        'imf_file': 'tab_imf/imf_kroupa_orig.dat',
        'isoc_isagelog': '1', 'isoc_lagelow': str(LOG_EDAD),
        'isoc_lageupp': str(LOG_EDAD), 'isoc_dlage': '0.0',
        'isoc_ismetlog': '1', 'isoc_metlow': '%.3f' % mh,
        'isoc_metupp': '%.3f' % mh, 'isoc_dmet': '0.0',
        'isoc_zlow': '0.0152', 'isoc_zupp': '0.03', 'isoc_dz': '0.0',
        'output_kind': '1', 'output_evstage': '1',
        'lf_maginf': str(MAG_INF), 'lf_magsup': str(MAG_SUP), 'lf_deltamag': str(PASO_MAG),
        'sim_mtot': '1.0e4', 'output_gzip': '0',
    }


def curl(argumentos):
    salida = subprocess.run(['curl', '-sS', '-m', '180'] + argumentos,
                            capture_output=True)
    if salida.returncode != 0:
        raise RuntimeError('curl falló: %s' % salida.stderr.decode('utf-8', 'replace'))
    return salida.stdout.decode('utf-8', 'replace')


def pedir_lf(feh):
    """Lanza el trabajo en CMD y devuelve [(M_V, dN), ...] en el bin de 0.25."""
    campos = []
    for k, v in peticion(feh).items():
        campos += ['-F', '%s=%s' % (k, v)]
    html = curl(campos + [CMD])
    salida = re.search(r'(output\d+\.dat)', html)
    if not salida:
        raise RuntimeError('CMD no devolvió fichero de salida para [Fe/H]=%s' % feh)
    dat = curl([TMP + salida.group(1)])

    filas = []
    for linea in dat.splitlines():
        if linea.startswith('#') or not linea.strip():
            continue
        col = linea.split()
        # age Z magbinc mbol U B V R I J H K
        filas.append((float(col[2]), float(col[6])))
    if not filas:
        raise RuntimeError('LF vacía para [Fe/H]=%s' % feh)
    return filas


def recortar(filas):
    """Quita los bins vacíos de los extremos (la isócrona no llega a M_V=-6)."""
    vivos = [i for i, (_, n) in enumerate(filas) if n > 0]
    return filas[vivos[0]:vivos[-1] + 1]


def main():
    tablas = []
    for feh in FEH:
        filas = recortar(pedir_lf(feh))
        total = sum(n for _, n in filas)
        # Normalizada en NÚMERO: el módulo deriva N_tot del flujo integrado del
        # cúmulo (V_t), así que aquí solo importa la forma.
        filas = [(m, n / total) for m, n in filas]
        flujo = sum(n * 10 ** (-0.4 * m) for m, n in filas)
        cola = sum(n * 10 ** (-0.4 * m) for m, n in filas if m > 9.0) / flujo
        print('[Fe/H]=%+.2f  bins=%d  M_V de %.2f a %.2f  flujo más allá de M_V=+9: %.4f %%'
              % (feh, len(filas), filas[0][0], filas[-1][0], 100 * cola))
        tablas.append((feh, filas))

    # Las tres comparten rejilla (mismo lf_maginf/deltamag), pero no el primer
    # bin vivo: se escribe el M_V de cada bin por tabla, sin suponer nada.
    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Funciones de luminosidad de cúmulos globulares — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_lf_globulares.py\n')
        fh.write('   Isócronas PARSEC v1.2S + COLIBRI (CMD 3.9, http://stev.oapd.inaf.it/cmd),\n')
        fh.write('   Bressan et al. (2012) MNRAS 427, 127; IMF de Kroupa (2001, 2002).\n')
        fh.write('   Edad 12 Gyr; [M/H] = [Fe/H] + %.2f (Salaris et al. 1993, [alpha/Fe]=+0.4).\n' % DELTA_ALFA)
        fh.write('   Cada tabla: { feh, m0, paso, phi[] }, con phi normalizada en NÚMERO\n')
        fh.write('   (suma 1) y m0/paso dando el M_V del centro de cada bin. */\n')
        fh.write('window.BITACORA_LF_GLOBULARES = {\n')
        fh.write('  version: "%s",\n' % VERSION)
        fh.write('  tablas: [\n')
        for feh, filas in tablas:
            fh.write('    { feh: %.2f, m0: %.4f, paso: %.4f, phi: [\n' % (feh, filas[0][0], PASO_MAG))
            for i in range(0, len(filas), 8):
                fh.write('      ' + ', '.join('%.6e' % n for _, n in filas[i:i + 8]) + ',\n')
            fh.write('    ] },\n')
        fh.write('  ]\n};\n')

    print('->', OUT_JS)


if __name__ == '__main__':
    main()
