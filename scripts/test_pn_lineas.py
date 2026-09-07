# -*- coding: utf-8 -*-
"""Self-check de las cuatro columnas de líneas de V/84 en la fila PN (#220).

Vigila que la fotometría de líneas —log F(Hβ), I5007, I6563, I4686— llegue
íntegra desde la fuente hasta las dos salidas de gen_nebulosas.py, que solo la
lleven las PN y que el objeto sin dato lleve null y NO cero.

La cardinalidad no está escrita a mano (ADR 0005): cada recuento se calcula
cruzando mapa/datos/pn_lineas_v84.csv —el volcado de V/84— con los nombres del
catálogo, y se compara contra lo que hay en el fichero generado. Los guardianes
de no-vacuidad exigen que cada columna tenga a la vez filas CON dato y filas SIN
dato: si el cruce se rompiera y saliera todo a null, el test se pondría rojo en
vez de pasar sobre un conjunto vacío.

Mutaciones documentadas que lo ponen rojo (ejecutadas el 2026-09-07):
  1. En gen_nebulosas.py, emitir 0 en vez de null:
       js = lambda v: '%g' % (0 if v is None else v)
     -> rojo en el bloque «null-no-es-cero»: NGC0650 sale con log F(Hβ) = 0.
  2. En gen_nebulosas.py, tapar el hueco con cero antes de escribir la fila:
       'i4686': med.get('i4686') or 0,
     -> rojo en el bloque «cuenta-i4686»: la fila deja de coincidir con la
     fuente en las 50 PN sin HeII medido (Abell 12, Abell 21, ...).

Lo que este test NO demuestra (ADR 0005): quitar el filtro de clase en el
generador —`med = lineas.get(nombre, {})` sin `if c['Type'] in CLASES_LINEAS`—
lo deja verde, porque hoy ningún nombre no-PN del catálogo existe en V/84. La
comprobación «solo-PN» es por eso un guardián de regresión, no evidencia
positiva; se ejecuta sobre un conjunto vacío y aquí se dice así. El día que un
nombre coincida, empezará a medir de verdad.

Ejecutar:  python3 scripts/test_pn_lineas.py
"""
import csv
import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = os.path.join(RAIZ, 'mapa', 'datos', 'pn_lineas_v84.csv')
CSV_GEN = os.path.join(RAIZ, 'mapa', 'datos', 'nebulosas.csv')
JS_GEN = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js')

COLS = ('log_fhb', 'i5007', 'i6563', 'i4686')
I_CLASE = 12                       # la clase cierra el bloque que lee capaGalaxias
comprobaciones = 0


def ok(etiqueta):
    global comprobaciones
    comprobaciones += 1
    print('ok', etiqueta)


def num(s):
    s = (s or '').strip()
    return float(s) if s else None


def filas_js():
    """Las filas del array generado, tal cual las leerá el navegador."""
    filas = []
    with open(JS_GEN, encoding='utf-8') as fh:
        for linea in fh:
            linea = linea.strip()
            if linea.startswith('["'):
                filas.append(json.loads(linea.rstrip(',')))
    return filas


fuente = {f['nombre']: {c: num(f[c]) for c in COLS}
          for f in csv.DictReader(open(FUENTE, encoding='utf-8'))}
gen = list(csv.DictReader(open(CSV_GEN, encoding='utf-8')))
js = filas_js()

pn = [f for f in gen if f['clase'] == 'PN']
otras = [f for f in gen if f['clase'] != 'PN']
assert pn and otras, 'catálogo sin PN o sin otras clases: el test no compara nada'
assert len(js) == len(gen), (len(js), len(gen))
ok('las dos salidas traen las mismas %d filas' % len(gen))

# 1) Cada columna, valor a valor contra la fuente. La cardinalidad la pone el
#    cruce fuente × catálogo, no un número escrito aquí.
for col in COLS:
    esperados = {f['nombre']: fuente[f['nombre']][col] for f in pn
                 if f['nombre'] in fuente and fuente[f['nombre']][col] is not None}
    obtenidos = {f['nombre']: num(f[col]) for f in pn if f[col].strip()}
    assert obtenidos == esperados, (col, sorted(set(esperados) ^ set(obtenidos))[:5])
    # No vacuo por los dos lados: hay filas con dato y filas sin él.
    assert 0 < len(esperados) < len(pn), (col, len(esperados), len(pn))
    ok('cuenta-%s: %d de %d PN con dato, las %d restantes a null'
       % (col, len(esperados), len(pn), len(pn) - len(esperados)))

# 2) Ninguna otra clase gana las columnas. Guardián de regresión, no evidencia:
#    hoy ningún nombre no-PN del catálogo está en V/84 (ADR 0005, ver cabecera).
con_dato = [f['nombre'] for f in otras if any(f[c].strip() for c in COLS)]
assert not con_dato, con_dato[:5]
ok('solo-PN: ninguna de las %d filas no-PN trae líneas' % len(otras))

# 3) null NO es cero, y se comprueba columna por columna en el JS, que es lo que
#    consume el render. Un 0 donde falta el dato haría creer que la línea se
#    midió y salió nula: NGC 40 pasaría de «sin razón de líneas» a «sin [OIII]».
por_nombre = {f[0]: f for f in js}
for i, col in enumerate(COLS):
    sin_dato = [f['nombre'] for f in pn if not f[col].strip()]
    assert sin_dato, col
    for nombre in sin_dato:
        v = por_nombre[nombre][I_CLASE + 1 + i]
        assert v is None, (nombre, col, v)
    ok('null-no-es-cero-%s: %d PN sin dato, todas a null en el JS'
       % (col, len(sin_dato)))

# 4) Los dos casos que el ticket nombra, cada uno por su motivo.
m57 = dict(zip(COLS, por_nombre['NGC6720'][I_CLASE + 1:]))
assert m57['log_fhb'] is not None and m57['i5007'] is None and m57['i6563'] is None, m57
ok('M57 tiene Hβ pero no fila en intens: I5007 e I6563 a null')
ngc40 = dict(zip(COLS, por_nombre['NGC0040'][I_CLASE + 1:]))
assert ngc40['i5007'] is None and ngc40['i6563'] == 287.0, ngc40
ok('NGC 40 trae Hα 287 con el I5007 en blanco')

# 5) El bloque que lee capaGalaxias no se ha movido: las cuatro columnas van
#    DETRÁS de la clase (decisión del #220), no en medio.
for f in js:
    assert len(f) == I_CLASE + 1 + len(COLS), f
    assert isinstance(f[I_CLASE], str) and f[I_CLASE] in (
        'Neb', 'HII', 'Cl+N', 'RfN', 'EmN', 'PN', 'SNR'), f
ok('la clase sigue en el índice %d y las líneas van detrás' % I_CLASE)

# 6) La cabecera del generado documenta la procedencia y el enrojecimiento.
cabecera = open(JS_GEN, encoding='utf-8').read(4000)
for aviso in ('V/84', 'hbeta', 'intens', 'LineRef', 'enrojecimiento', 'null'):
    assert aviso in cabecera, aviso
ok('la cabecera cita tabla de origen, LineRef y que no hay corrección de enrojecimiento')

assert comprobaciones >= 12, comprobaciones
print('\nOK: %d comprobaciones' % comprobaciones)
