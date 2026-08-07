#!/usr/bin/env python3
"""Test de la CLASIFICACIÓN DE OBJETO DEL MAPA.

Parsea la tabla de reglas REAL de bitacora_clasificar_objeto() en el plugin PHP
(no duplica la tabla) y la leyenda del mapa en mapa/mapa.html, y verifica:
  1. Mapeos dorados: otype de SIMBAD -> (tipo, color) esperados.
  2. Sincronía: todo color que asigna el clasificador a un objeto MW existe como
     data-color en la leyenda #mw-legend (si no, un objeto se pintaría con un color
     que la leyenda no sabe nombrar/toggle).

Sin dependencias:  python3 scripts/test_clasificacion_objeto.py
"""
import re, sys, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PHP = (RAIZ / "resources/plugins/bitacora-registro/bitacora-registro.php").read_text(encoding="utf-8")
HTML = (RAIZ / "mapa/mapa.html").read_text(encoding="utf-8")

fallos = []
def check(cond, etiqueta):
    print(("  ok   " if cond else "  FALLA ") + etiqueta)
    if not cond: fallos.append(etiqueta)

# ── Parsear la tabla de categorías (compartida clasificador/semilla) ─────────
# array( 'carbono', array( 'C*' ), '#ff9d5a' ),
tabla = PHP[PHP.index("function bitacora_categorias_mapa"):]
tabla = tabla[:tabla.index("\n}\n")]
cuerpo = PHP[PHP.index("function bitacora_clasificar_objeto"):]
cuerpo = cuerpo[:cuerpo.index("\n}\n")]
reglas = []  # (tipo, [codigos_mayus], color)
for m in re.finditer(r"array\(\s*'([a-z]+)',\s*array\(([^)]*)\),\s*'(#[0-9a-fA-F]{6})'\s*\)", tabla):
    tipo, codes_raw, color = m.group(1), m.group(2), m.group(3).lower()
    codes = [c.strip().strip("'").upper() for c in codes_raw.split(",") if c.strip()]
    reglas.append((tipo, codes, color))
check(len(reglas) >= 6, f"tabla de reglas parseada ({len(reglas)} categorías MW)")

# Color por defecto ('otro') del propio clasificador.
m_otro = re.search(r"'tipo'\s*=>\s*'otro',\s*'color'\s*=>\s*'(#[0-9a-fA-F]{6})'", cuerpo)
color_otro = m_otro.group(1).lower() if m_otro else None
check(color_otro is not None, f"color 'otro' parseado ({color_otro})")

# ── Réplica del match (misma prioridad que el PHP; sin rama galaxia/Hubble) ───
def clasificar_mw(otype, tipo_obs=""):
    cod = otype.strip().upper()
    tob = tipo_obs.strip().lower()
    for tipo, codes, color in reglas:
        if tob == tipo or cod in codes:
            return tipo, color
    return "otro", color_otro

# ── 1) Mapeos dorados (otype real de SIMBAD, ver consulta en vivo) ────────────
DORADOS = [
    ("GlC", "", "globular"),      # M13
    ("OpC", "", "abierto"),       # M45
    ("PN",  "", "planetaria"),    # M57
    ("HII", "", "emision"),       # M42
    ("SNR", "", "snr"),           # M1 (Crab)
    ("C*",  "", "carbono"),       # Y CVn
    ("glc", "", "globular"),      # case-insensitive
    ("*",   "", "otro"),          # estrella normal -> neutro (NO snr)
    ("G",   "", "otro"),          # galaxia sin morph -> neutro (Hubble lo cubre aparte)
    ("PN",  "carbono", "carbono"),# override del registro gana sobre otype
]
print("Mapeos otype -> tipo:")
for otype, tob, esperado in DORADOS:
    tipo, _ = clasificar_mw(otype, tob)
    check(tipo == esperado, f"otype={otype!r} tipo_obs={tob!r} -> {tipo!r} (esperado {esperado!r})")

# Regla clave del bug: un objeto MW NO debe caer en el azul de 'Resto de supernova'
# salvo que SEA un SNR.
for otype in ("GlC", "OpC", "PN", "HII", "C*", "*"):
    _, color = clasificar_mw(otype)
    check(color != "#7ec8ff", f"otype={otype!r} NO se pinta de #7ec8ff (SNR)")

# ── 2) Sincronía con la leyenda #mw-legend ───────────────────────────────────
# Colores data-color de los mw-legend-item (leyenda del mapa MW).
leyenda = set(c.lower() for c in re.findall(r'class="mw-legend-item"\s+data-color="(#[0-9a-fA-F]{6})"', HTML))
check(len(leyenda) >= 6, f"leyenda #mw-legend parseada ({len(leyenda)} colores)")
print("Sincronía clasificador -> leyenda:")
for tipo, codes, color in reglas:
    check(color in leyenda, f"color de '{tipo}' ({color}) presente en la leyenda")
check(color_otro in leyenda, f"color 'otro' ({color_otro}) presente en la leyenda")

# ── 3) El nombre del tipo cabe en la columna `tipo` de la tabla de objetos ────
# NGC 2022 (PN) no llegó nunca al mapa: 'planetaria' son 10 caracteres y la
# columna era varchar(8), así que MySQL en modo estricto rechazaba el INSERT.
m_col = re.search(r"CREATE TABLE \$tabla_objetos.*?\n\s*tipo varchar\((\d+)\)", PHP, re.S)
ancho = int(m_col.group(1)) if m_col else None
check(ancho is not None, f"ancho de la columna `tipo` parseado ({ancho})")
print("Cada tipo del clasificador cabe en la columna:")
for tipo, _codes, _color in reglas + [("otro", [], "")]:
    check(ancho is not None and len(tipo) <= ancho, f"'{tipo}' ({len(tipo)} car.) cabe en varchar({ancho})")

# ── 4) Todo objeto de la semilla acaba con tipo ──────────────────────────────
# La semilla solo declara el color, así que el importador deriva el tipo con
# bitacora_tipo_por_color(). Si un color de la semilla no está en la tabla, ese
# objeto entra al mapa con el tipo vacío (le pasaba a las cinco planetarias).
import json
importador = PHP[PHP.index("function bitacora_importar_objetos_seed"):]
importador = importador[:importador.index("\n}\n")]
check("bitacora_tipo_por_color" in importador, "el importador de la semilla deriva el tipo del color")
por_color = {color: tipo for tipo, _c, color in reglas}
semilla = json.loads((RAIZ / "resources/plugins/bitacora-registro/datos/objetos-seed.json").read_text(encoding="utf-8"))
check(len(semilla) > 0, f"semilla parseada ({len(semilla)} objetos)")
sin_tipo = [o["id"] for o in semilla
            if not o.get("tipo") and not por_color.get(str(o.get("color", "")).lower())]
check(not sin_tipo, f"ningún objeto de la semilla se queda sin tipo (sin: {sin_tipo})")
PLANETARIAS = ("ngc40", "ngc6826", "ngc6905", "m27", "m57")
for slug in PLANETARIAS:
    o = next((x for x in semilla if x.get("id") == slug), None)
    tipo = o and (o.get("tipo") or por_color.get(str(o.get("color", "")).lower()))
    check(tipo == "planetaria", f"{slug} -> {tipo!r} (esperado 'planetaria')")

if fallos:
    print(f"\n{len(fallos)} fallo(s).")
    sys.exit(1)
print("\nTodo verde.")
