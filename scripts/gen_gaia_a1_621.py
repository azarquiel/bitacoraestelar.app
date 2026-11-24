#!/usr/bin/env python3
"""#621 · Gaia DR3 de los globulares del control fuera de M13 (ADR 0039, «`c` y
el catálogo cuentan lo mismo», AC4).

Cono de 2,5' alrededor del centro de Harris (el de globulares-datos.js),
G <= 18,5, de gaiadr3.gaia_source: ra, dec, G, BP-RP, ruwe y las dos ipd_* del
filtro de fuente única de Fabricius et al. 2021 §3.3 (control del ajuste G-V).

Salida: simulador_ocular/docs/validacion/<ngc>_gaia_dr3_621.csv

python3 scripts/gen_gaia_a1_621.py [ngc6752|ngc7099 ...]
"""
import os
import sys
import urllib.parse
import urllib.request

TAP = 'https://gea.esac.esa.int/tap-server/tap/sync'
VAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'simulador_ocular', 'docs', 'validacion')
CENTROS = {'ngc6752': (287.71713, -59.98456), 'ngc7099': (325.09217, -23.17986)}   # Harris, globulares-datos.js
RADIO_GRADOS = 2.5 / 60
COLS = 'ra, dec, phot_g_mean_mag, bp_rp, ruwe, ipd_frac_multi_peak, ipd_gof_harmonic_amplitude'


def main():
    for ngc in sys.argv[1:] or sorted(CENTROS):
        ra, dec = CENTROS[ngc]
        adql = ("SELECT %s FROM gaiadr3.gaia_source WHERE phot_g_mean_mag <= 18.5 AND "
                "1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', %.5f, %.5f, %.6f))" % (COLS, ra, dec, RADIO_GRADOS))
        datos = urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'QUERY': adql}).encode()
        with urllib.request.urlopen(TAP, datos, timeout=600) as r:
            texto = r.read().decode()
        if not texto.startswith('ra,dec,'):
            raise SystemExit('respuesta inesperada del TAP para %s: %s' % (ngc, texto[:200]))
        salida = os.path.join(VAL, ngc + '_gaia_dr3_621.csv')
        open(salida, 'w').write(texto.replace('\r\n', '\n'))
        print('%s: %d filas -> %s' % (ngc, texto.count('\n') - 1, salida))


if __name__ == '__main__':
    main()
