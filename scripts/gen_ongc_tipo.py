# -*- coding: utf-8 -*-
"""Genera el mapa «designación NGC/IC -> tipo DSO» a partir del OpenNGC.

Fuente: Mattia Verga, «OpenNGC» (https://github.com/mattiaverga/OpenNGC),
fichero maestro database_files/NGC.csv (contiene NGC e IC juntos, ordenados por
AR). Es el MISMO catálogo del que ya beben gen_nebulosas.py y gen_abell_pn.py;
aquí se extrae solo la columna que le falta al clasificador del mapa: el tipo
del objeto por su número NGC/IC, sin pasar por SIMBAD.

Por qué hace falta: el clasificador del mapa (bitacora_clasificar_objeto en el
plugin) decide `tipo`+`color` a partir del otype de SIMBAD. SIMBAD a veces
resuelve un número NGC/IC a la ESTRELLA central (NGC 6888 -> HD 192163, otype
WR*) o a un código genérico (NGC 6960 -> ISM, NGC 6992 -> sh), y el OpenNGC sí
tiene el tipo DSO correcto (HII, SNR). Ver ADR 0002 del contexto mapa.

Salida:
  resources/plugins/bitacora-registro/datos/ongc-tipo.json

  Un objeto JSON { "NGC0040": "PN", "NGC6888": "HII", ... } con SOLO las
  entradas de designación canónica (Name que case con `^(NGC|IC)\\d{4}$`);
  los componentes con sufijo (IC0186A, IC0080 NED01) se descartan. El tipo se
  guarda TAL CUAL lo publica el OpenNGC (G, OCl, GCl, PN, HII, SNR, RfN, EmN,
  Neb, Cl+N, Dup, NonEx, Other, *, **, *Ass, GPair, GTrpl, GGroup, Nova). La
  decisión de qué tipos PISAN a SIMBAD vive en el plugin
  (bitacora_categorias_ongc), no en este fichero: así el dato es el catálogo
  completo y la política está en el código.

Uso:
  python3 scripts/gen_ongc_tipo.py                 # descarga el OpenNGC
  python3 scripts/gen_ongc_tipo.py --fuente NGC.csv  # usa un CSV local
"""
import csv
import json
import os
import re
import sys
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv'
OUT = os.path.join(RAIZ, 'resources', 'plugins', 'bitacora-registro', 'datos', 'ongc-tipo.json')

# Designaciones canónicas: el número NGC/IC a secas, con sus ceros a la
# izquierda tal y como los escribe el OpenNGC. Fuera quedan los componentes con
# sufijo (IC0186A, IC0080 NED01): son trozos del mismo objeto o galaxias sueltas
# de un par, no la designación que escribe un observador.
RE_CANONICA = re.compile(r'^(NGC|IC)\d{4}$')

# Los cuatro que motivan el cambio, para que el generador falle en voz alta si
# el OpenNGC cambia su tipo y deja de servir de ancla (ADR 0002).
ANCLAS = {
    'NGC6888': 'HII',   # Crescent Nebula (SIMBAD la resuelve a la WR central)
    'NGC6960': 'SNR',   # Velo oeste, Bucle de Cygnus
    'NGC6992': 'SNR',   # Velo este, Bucle de Cygnus
    'IC5146':  'Cl+N',  # Cocoon Nebula (SIMBAD la tipa como el cúmulo OpC)
}


def descargar(url):
    """Baja el fichero maestro del OpenNGC y devuelve su texto decodificado."""
    with urllib.request.urlopen(url, timeout=120) as fh:
        return fh.read().decode('utf-8', 'replace')


def parsear(texto):
    """{nombre canónico: Type} desde el CSV del OpenNGC. Avisa y gana la última
    fila si un mismo número aparece dos veces con tipos distintos."""
    filas = csv.DictReader(texto.splitlines(), delimiter=';')
    mapa = {}
    conflictos = 0
    for f in filas:
        nombre = (f.get('Name') or '').strip()
        if not RE_CANONICA.match(nombre):
            continue
        tipo = (f.get('Type') or '').strip()
        if nombre in mapa and mapa[nombre] != tipo:
            conflictos += 1
            print('  conflicto %s: %s vs %s (gana la última)' % (nombre, mapa[nombre], tipo))
        mapa[nombre] = tipo
    return mapa, conflictos


def autocomprobacion(mapa):
    for nombre, esperado in ANCLAS.items():
        assert mapa.get(nombre) == esperado, '%s -> %r (esperado %r)' % (
            nombre, mapa.get(nombre), esperado)


def main():
    fuente = None
    if '--fuente' in sys.argv:
        fuente = sys.argv[sys.argv.index('--fuente') + 1]
    texto = open(fuente, encoding='utf-8').read() if fuente else descargar(URL)
    mapa, conflictos = parsear(texto)
    autocomprobacion(mapa)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Compacto: es dato de máquina, no para leer a mano. El dif de git importa
    # menos que no cargar 13k entradas con indentación al pedir la página.
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(mapa, fh, ensure_ascii=True, separators=(',', ':'))

    print('OpenNGC: %d designaciones canónicas (conflictos %d) -> %s'
          % (len(mapa), conflictos, OUT))
    print('anclas:', ', '.join('%s=%s' % (n, mapa[n]) for n in sorted(ANCLAS)))


if __name__ == '__main__':
    main()
