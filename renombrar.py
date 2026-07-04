#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
renombrar.py
-------------------------------------------------------------------
Renombra archivos (en una carpeta y TODAS sus subcarpetas) aplicando:
  1) el nombre pasa a minúsculas,
  2) estos reemplazos sobre el nombre:
        70min          -> 70x
        50min          -> 98x
        28min_72º      -> 154x
        28min_100º     -> 216x
        21min_100º     -> 270x
        9min           -> 480x

USO:
    python3 renombrar.py [carpeta]

    Sin carpeta, usa la carpeta actual (.).
    Ejemplos:
        python3 renombrar.py
        python3 renombrar.py resources/images

MODO PRUEBA:
    Añade  --simular  para ver los cambios SIN renombrar nada:
        python3 renombrar.py resources/images --simular
-------------------------------------------------------------------
"""

import os
import sys

# ---------------------------------------------------------------------------
# REEMPLAZOS
# El ORDEN importa: los más específicos/largos van primero para que
# "28min_100º" no sea alterado antes por una regla más corta como "28min".
# Nota: la minúscula ya se aplica ANTES, por eso aquí las claves van en
# minúsculas. La "º" es el carácter ordinal masculino (U+00BA).
# ---------------------------------------------------------------------------
REEMPLAZOS = [
    ("28min_72º",  "154x"),
    ("28min_100º", "216x"),
    ("21min_100º", "270x"),
    ("70min",      "70x"),
    ("50min",      "98x"),
    ("9min",       "480x"),
]


def nuevo_nombre(nombre):
    """Devuelve el nombre transformado (minúsculas + reemplazos)."""
    n = nombre.lower()
    for viejo, nuevo in REEMPLAZOS:
        n = n.replace(viejo, nuevo)
    return n


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    simular = "--simular" in sys.argv

    carpeta = args[0] if args else "."
    if not os.path.isdir(carpeta):
        print("ERROR: la carpeta '%s' no existe." % carpeta)
        sys.exit(1)

    print("Carpeta: %s%s\n" % (carpeta, "   [MODO PRUEBA]" if simular else ""))

    cambios = 0
    # topdown=False: procesa primero el contenido y luego las carpetas, así
    # renombrar un archivo no interfiere con el recorrido.
    for raiz, _dirs, ficheros in os.walk(carpeta, topdown=False):
        for f in ficheros:
            nuevo = nuevo_nombre(f)
            if nuevo == f:
                continue  # no cambia

            origen = os.path.join(raiz, f)
            destino = os.path.join(raiz, nuevo)

            if os.path.exists(destino):
                print("  OMITIDO (ya existe): %s" % destino)
                continue

            print("  %s\n    -> %s" % (f, nuevo))
            if not simular:
                os.rename(origen, destino)
            cambios += 1

    print("\n%s %d archivo(s)." % (
        "Se renombrarían" if simular else "Renombrados", cambios))


if __name__ == "__main__":
    main()
