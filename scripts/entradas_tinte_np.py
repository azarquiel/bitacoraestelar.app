"""Entradas del prerregistro del tinte de las planetarias (ADR 0025).

Tabula, a partir de fotometría de líneas publicada, lo que la ley F1 recibiría
por objeto y por equipo: luminancia fotópica del disco, iluminancia retinal,
tamaño aparente y pureza cromática. NO es la ley ni toca el render: es la tabla
sobre la que se escribieron los listones ANTES de implementar nada.

Fuentes por objeto (todas citadas en el ADR):
  · diámetro           OpenNGC MajAx (mapa/datos/ongc_nebulosas.csv)
  · log F(Hβ)          Acker+ 1992, V/84/hbeta, columna log(Fbeta) (erg cm⁻² s⁻¹)
  · I5007, I6563, I4686  V/84/intens, LineRef b, relativas a Hβ = 100, sin
                       corregir de enrojecimiento (lo que llega al ojo)
  · [O III] 4959       fijada a I5007 / 2,98 (razón atómica)
Conversión μ ↔ cd/m²: μ_V = 12,6 − 2,5·log10(L) (Crumey 2014, MNRAS 442, 2600).

Uso: python3 scripts/entradas_tinte_np.py
"""
import math

# CIE 1931 2° (x̄, ȳ, z̄) interpoladas a la longitud de onda de cada línea.
CMF = {
    '4686': (0.211, 0.086, 1.354),
    '4861': (0.0523, 0.178, 0.583),
    '4959': (0.0125, 0.271, 0.338),
    '5007': (0.00455, 0.335, 0.2636),
    '6563': (0.205, 0.0763, 0.0),
}
D65 = (0.3127, 0.3290)
SR_POR_ARCSEC2 = 2.3504e-11

# nombre: (diámetro ″, log F(Hβ), I4686, I5007, I6563)   — V/84 LineRef b, OpenNGC
OBJETOS = {
    'NGC 6905': (40.2, -10.92, 91, 958, 319),
    'NGC 6826': (25.2, -9.98, 4, 242, 344),
    'NGC 7662': (16.8, -9.99, 17, 425, 282),
    'NGC 3242': (25.2, -9.79, 17, 698, 352),
    'NGC 6572': (10.8, -9.82, 0, 399, 297),
    'NGC 2392': (51.6, -10.39, 29, 1406, 395),
    'NGC 6210': (30.0, -10.09, 2.3, 365, 254),
    'NGC 1535': (51.0, -10.42, 17, 1253, 285),
    'NGC 6818': (46.2, -10.48, 72, 1495, 298),
    'NGC 6853': (402.0, -9.46, 70, 1106, 262),
    'NGC 7293': (979.8, -9.37, 0, 592, 189),
}


def luminancia_y_pureza(diam_as, log_fhb, i4686, i5007, i6563):
    """L fotópica del disco (cd/m²), cromaticidad xy y pureza Δxy respecto a D65."""
    omega = math.pi * (diam_as / 2.0) ** 2 * SR_POR_ARCSEC2
    fhb = 10 ** log_fhb * 1e-3                         # W/m²
    lineas = {'4686': i4686, '4861': 100.0, '4959': i5007 / 2.98, '5007': i5007, '6563': i6563}
    X = Y = Z = 0.0
    for k, rel in lineas.items():
        f = fhb * rel / 100.0
        X += CMF[k][0] * f; Y += CMF[k][1] * f; Z += CMF[k][2] * f
    L = 683.0 * Y / omega
    s = X + Y + Z
    x, y = X / s, Y / s
    return L, x, y, math.hypot(x - D65[0], y - D65[1])


def luminancia_cielo(sqm):
    return 10 ** (-0.4 * (sqm - 12.6))


def trolands(L, pupila_salida_mm, pupila_ojo_mm=7.0):
    d = min(pupila_salida_mm, pupila_ojo_mm)
    return L * math.pi * (d / 2.0) ** 2


def entradas(nombre, aumentos, pupila_salida, sqm, ancho_as=None):
    """Lo que F1 recibe: E_ret (objeto + cielo), θ aparente de la estructura y pureza efectiva."""
    diam, lf, a, b, c = OBJETOS[nombre]
    L, x, y, p = luminancia_y_pureza(diam, lf, a, b, c)
    Lc = luminancia_cielo(sqm)
    E = trolands(L + Lc, pupila_salida)
    theta = (ancho_as or diam) * aumentos / 3600.0     # grados
    p_ef = p * L / (L + Lc)
    return L, E, theta, p_ef


# ---- F1, tal como queda declarada en el prerregistro (solo para tabular) ----
E_C = 0.017     # td; leído del ancla NGC 6905 (98× tinte, 154× gris), media geométrica
THETA_C = 1.0   # grados; fijado por literatura, no se ajusta


def f1(nombre, aumentos, pupila_salida, sqm, ancho_as=None):
    L, E, theta, p_ef = entradas(nombre, aumentos, pupila_salida, sqm, ancho_as)
    return 0.0 if E < E_C else p_ef * min(1.0, (theta / THETA_C) ** 2)


def veredicto(d):
    return 'tinte' if d >= 0.10 else ('gris' if d <= 0.05 else 'zona gris')


# ---- anclas de la bitácora (Stargate 457 mm, fichas PDF con SQM-L) ----
ANCLAS = [
    ('NGC 6905', 70, 6.6, 21.40, 'turquesa'),
    ('NGC 6905', 98, 4.7, 21.40, 'turquesa'),
    ('NGC 6905', 154, 3.0, 21.40, 'gris'),
    ('NGC 6905', 270, 1.7, 21.40, 'gris'),
    ('NGC 6826', 70, 6.6, 21.30, 'gris plata'),
]

# ---- predicciones fuera de muestra (objeto, aumentos, pupila, SQM, ancho estructura) ----
PREDICCIONES = [
    ('NGC 7662', 100, 2.0, 21.0, None), ('NGC 7662', 200, 1.0, 21.0, None), ('NGC 7662', 300, 0.67, 21.0, None),
    ('NGC 7662', 98, 4.7, 21.4, None), ('NGC 7662', 270, 1.7, 21.4, None),
    ('NGC 3242', 100, 2.0, 21.0, None), ('NGC 3242', 200, 1.0, 21.0, None), ('NGC 3242', 300, 0.67, 21.0, None),
    ('NGC 6572', 200, 1.0, 21.0, None), ('NGC 6572', 300, 0.67, 21.0, None), ('NGC 6572', 400, 0.5, 21.0, None),
    ('NGC 2392', 100, 2.0, 21.0, None), ('NGC 2392', 98, 4.7, 21.4, None), ('NGC 2392', 270, 1.7, 21.4, None),
    ('NGC 6853', 70, 6.6, 21.45, None), ('NGC 6853', 154, 3.0, 21.45, None),
    ('NGC 6853', 30, 6.7, 21.0, None),
]


def main():
    print('%-9s %7s %9s %6s %6s %6s %6s' % ('objeto', 'diám″', 'L_fot', 'x', 'y', 'Δxy', 'μ_fot'))
    for n, (d, lf, a, b, c) in OBJETOS.items():
        L, x, y, p = luminancia_y_pureza(d, lf, a, b, c)
        print('%-9s %7.1f %9.2e %6.3f %6.3f %6.3f %6.2f' % (n, d, L, x, y, p, 12.6 - 2.5 * math.log10(L)))

    print('\nAnclas (457 mm, ojo 7 mm) — E_ret objeto+cielo, θ aparente, pureza efectiva, F1:')
    for n, aum, pup, sqm, dicho in ANCLAS:
        L, E, th, p = entradas(n, aum, pup, sqm)
        d = f1(n, aum, pup, sqm)
        print('  %-9s %4d× %4.1f mm SQM %5.2f  E=%.4f td  θ=%.2f°  p_ef=%.3f  F1=%.3f %-9s  bitácora: %s'
              % (n, aum, pup, sqm, E, th, p, d, veredicto(d), dicho))

    print('\nPredicciones (200 mm f/6 con SQM 21,0; 457 mm con la SQM de la ficha):')
    for n, aum, pup, sqm, ancho in PREDICCIONES:
        L, E, th, p = entradas(n, aum, pup, sqm, ancho)
        d = f1(n, aum, pup, sqm, ancho)
        print('  %-9s %4d× %4.2f mm SQM %5.2f  E=%.4f td  θ=%.2f°  p_ef=%.3f  F1=%.3f %s'
              % (n, aum, pup, sqm, E, th, p, d, veredicto(d)))

    # Comprobación: las anclas ordenan como dice la bitácora y E_c cae donde se leyó.
    E98 = entradas('NGC 6905', 98, 4.7, 21.4)[1]
    E154 = entradas('NGC 6905', 154, 3.0, 21.4)[1]
    assert E154 < E_C <= E98, (E154, E_C, E98)
    assert luminancia_y_pureza(*OBJETOS['NGC 6826'])[0] > luminancia_y_pureza(*OBJETOS['NGC 6905'])[0], \
        'NGC 6826 es más brillante en superficie que NGC 6905: el brillo solo no explica el ancla'
    assert luminancia_y_pureza(*OBJETOS['NGC 6905'])[3] > luminancia_y_pureza(*OBJETOS['NGC 6826'])[3]
    for n, aum, pup, sqm, dicho in ANCLAS:
        d = f1(n, aum, pup, sqm)
        assert veredicto(d) == ('tinte' if dicho == 'turquesa' else 'gris'), (n, aum, d, dicho)
    print('\nOK: las cinco anclas caen del lado que dice la bitácora con E_c = %.3f td, θ_c = %.1f°' % (E_C, THETA_C))


if __name__ == '__main__':
    main()
