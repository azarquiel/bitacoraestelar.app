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

# Los dos finales del clasificador: 'estrella' (el otype es estelar) y
# 'desconocido' (no se pudo clasificar). Son hechos DISTINTOS, así que tienen tipo
# y color propios: antes compartían el cajón 'otro' y quien los separaba era un
# regex de prefijos de catálogo en la capa del vecindario del mapa.
def color_final(tipo):
    m = re.search(r"'tipo'\s*=>\s*'" + tipo + r"',\s*'color'\s*=>\s*'(#[0-9a-fA-F]{6})'", cuerpo)
    return m.group(1).lower() if m else None

color_estrella    = color_final("estrella")
color_desconocido = color_final("desconocido")
check(color_estrella is not None, f"color 'estrella' parseado ({color_estrella})")
check(color_desconocido is not None, f"color 'desconocido' parseado ({color_desconocido})")
check(color_estrella != color_desconocido,
      "'estrella' y 'desconocido' NO comparten color (si no, el cajón sigue existiendo para el observador)")

# La regla estelar del PHP, sin tabla de códigos: el otype lleva '*' (salvo 'As*',
# un asterismo, que son varias estrellas y no una). Se comprueba que siga siendo esa.
check("strpos( $codigo, '*' )" in cuerpo and "'AS*'" in cuerpo,
      "la regla estelar es «el otype lleva '*', menos As*»")

# ── Galaxias: lista de otypes extragalácticos y colores por clase, del PHP ───
# «¿es una galaxia?» lo contesta el otype y «¿de qué clase?» la morfología: son
# dos preguntas, y mezclarlas era el bug (una galaxia con la morfología en etapa
# numérica de de Vaucouleurs acababa en 'desconocido').
galax = PHP[PHP.index("function bitacora_es_otype_galaxia"):]
galax = galax[:galax.index("\n}\n")]
OTYPES_GALAXIA = set(re.findall(r"'([A-Z0-9?*]+)'", galax))
check(len(OTYPES_GALAXIA) >= 8, f"otypes de galaxia parseados ({len(OTYPES_GALAXIA)})")

clases = PHP[PHP.index("function bitacora_color_por_clase"):]
clases = clases[:clases.index("\n}\n")]
COLOR_CLASE = {m.group(1): m.group(2).lower()
               for m in re.finditer(r"'?([A-Za-z0-9]+)'?\s*=>\s*'(#[0-9a-fA-F]{6})'", clases)}
check(set(COLOR_CLASE) >= {"E", "S0", "S", "SB", "Irr", "galaxia"},
      f"colores por clase de Hubble parseados ({sorted(COLOR_CLASE)})")

# Réplica de bitacora_clase_hubble: letras de Hubble o etapa T de de Vaucouleurs.
def clase_hubble(morph):
    m = (morph or "").strip()
    if not m:
        return ""
    if re.fullmatch(r"[+-]?\d+(\.\d+)?", m):
        t = float(m)
        if t <= -4: return "E"
        if t <= 0:  return "S0"
        if t <= 8:  return "S"
        return "Irr"
    if re.match(r"S0|L[^y]?", m, re.I): return "S0"
    if re.match(r"E", m, re.I):  return "E"
    if re.match(r"SB", m, re.I): return "SB"
    if re.match(r"(SA|S)", m, re.I): return "S"
    if re.match(r"I", m, re.I) or re.search(r"Irr", m, re.I): return "Irr"
    return ""

# ── Réplica del match (misma prioridad que el PHP) ───────────────────────────
def clasificar_mw(otype, tipo_obs="", morph=""):
    cod = otype.strip().upper()
    tob = tipo_obs.strip().lower()
    for tipo, codes, color in reglas:
        if tob == tipo or cod in codes:
            return tipo, color
    clase = clase_hubble(morph)
    if clase:
        return clase, COLOR_CLASE[clase]
    if cod in OTYPES_GALAXIA:
        return "galaxia", COLOR_CLASE["galaxia"]
    if "*" in cod and cod != "AS*":
        return "estrella", color_estrella
    return "desconocido", color_desconocido

# ── 1) Mapeos dorados (otype real de SIMBAD, ver consulta en vivo) ────────────
DORADOS = [
    ("GlC", "", "globular"),      # M13
    ("OpC", "", "abierto"),       # M45
    ("PN",  "", "planetaria"),    # M57
    ("HII", "", "emision"),       # M42
    ("SNR", "", "snr"),           # M1 (Crab)
    ("C*",  "", "carbono"),       # Y CVn
    ("glc", "", "globular"),      # case-insensitive
    ("*",   "", "estrella"),      # estrella normal (NO snr, NO 'desconocido')
    ("**",  "", "estrella"),      # doble: Gamma And, Gamma Del
    ("V*",  "", "estrella"),      # variable
    ("PM*", "", "estrella"),      # movimiento propio alto: la estrella de Barnard
    ("WD*", "", "estrella"),      # enana blanca: Sirio B
    ("As*", "", "desconocido"),   # asterismo: lleva '*' pero son VARIAS estrellas
    ("G",   "", "galaxia"),       # galaxia sin morph: galaxia, NO 'desconocido'
    ("pA*", "", "protoplanetaria"),  # Frosty Leo: lleva '*' pero es objeto extenso
    ("PN?", "", "protoplanetaria"),  # planetaria dudosa: casi siempre es esto
    ("GrG", "", "desconocido"),   # grupo de galaxias: son VARIAS, fuera a propósito
    ("DNe", "", "oscura"),        # nebulosa oscura: Barnard 33
    ("glb", "", "oscura"),        # glóbulo de Bok (B68), case-insensitive
    ("CGb", "", "oscura"),        # glóbulo cometario
    ("MoC", "", "desconocido"),   # nube molecular: a propósito FUERA de 'oscura'
    ("RNe", "", "reflexion"),     # nebulosa de reflexión: M78, NGC 1788/1999/2023
    ("ISM", "", "desconocido"),   # NGC 1435 (Mérope): SIMBAD no la llama 'RNe'
    ("",    "", "desconocido"),   # SIMBAD no respondió: no se adivina que sea estrella
    ("PN",  "carbono", "carbono"),# override del registro gana sobre otype
]
print("Mapeos otype -> tipo:")
for otype, tob, esperado in DORADOS:
    tipo, _ = clasificar_mw(otype, tob)
    check(tipo == esperado, f"otype={otype!r} tipo_obs={tob!r} -> {tipo!r} (esperado {esperado!r})")

# Regla clave del bug: un objeto MW NO debe caer en el azul de 'Resto de supernova'
# salvo que SEA un SNR.
for otype in ("GlC", "OpC", "PN", "HII", "C*", "*", "RNe"):
    _, color = clasificar_mw(otype)
    check(color != "#7ec8ff", f"otype={otype!r} NO se pinta de #7ec8ff (SNR)")

# Emisión y reflexión son categorías DISTINTAS: gas ionizado frente a polvo que
# dispersa la luz de una estrella vecina. Si compartieran color, la leyenda no
# podría apagar una sin apagar la otra.
check(clasificar_mw("RNe")[1] != clasificar_mw("HII")[1],
      "'reflexion' y 'emision' NO comparten color")

# ── 1 bis) Galaxias: otype + morfología (las dos escalas de SIMBAD) ──────────
# La morfología viene tanto en letras de Hubble ("SB(s)bc") como en etapa T de de
# Vaucouleurs ("5", "-1"), y el otype extragaláctico ('GiG', 'Sy2', 'AGN') no está
# en ninguna tabla ni lleva '*': sin la rama de galaxia caían todas en gris.
DORADOS_GALAXIA = [
    ("Sy2", "5",    "S"),        # NGC 593: espiral por etapa T=5
    ("GiG", "-1",   "S0"),       # NGC 3115: lenticular por etapa T=-1
    ("G",   "-5",   "E"),        # elíptica por etapa T=-5
    ("G",   "10",   "Irr"),      # irregular por etapa T=10
    ("G",   "SB(s)bc", "SB"),    # letras de Hubble: sigue igual que antes
    ("G",   "",     "galaxia"),  # sin morfología: galaxia, no 'desconocido'
    ("AGN", "???",  "galaxia"),  # morfología ilegible: galaxia igual
    ("LSB", "",     "galaxia"),
    ("*",   "",     "estrella"), # una estrella con morph vacío sigue siendo estrella
]
print("Galaxias otype+morph -> tipo:")
for otype, morph, esperado in DORADOS_GALAXIA:
    tipo, color = clasificar_mw(otype, "", morph)
    check(tipo == esperado, f"otype={otype!r} morph={morph!r} -> {tipo!r} (esperado {esperado!r})")
    check(color != color_desconocido or esperado == "desconocido",
          f"otype={otype!r} morph={morph!r} NO se pinta del gris de 'sin clasificar'")

# Los colores de galaxia son los de la leyenda del Grupo Local, y esa leyenda es
# otra: #mw-legend-hubble en el HTML y HUBBLE_COLORS en grupo-local.js.
GL_JS = (RAIZ / "mapa/js/grupo-local.js").read_text(encoding="utf-8")
bloque_gl = GL_JS[GL_JS.index("var HUBBLE_COLORS"):]
bloque_gl = bloque_gl[:bloque_gl.index("};")]
hubble_js = {m.group(1): m.group(2).lower()
             for m in re.finditer(r"([A-Za-z0-9]+):\s*'(#[0-9a-fA-F]{6})'", bloque_gl)}
leyenda_gl = set(c.lower() for c in re.findall(
    r'class="gl-legend-item"[^>]*data-tipo="[^"]+"[^>]*>\s*<span[^>]*background:(#[0-9a-fA-F]{6})', HTML))
print("Sincronía clases de galaxia -> grupo-local.js y #mw-legend-hubble:")
for clase, color in COLOR_CLASE.items():
    check(hubble_js.get(clase) == color, f"HUBBLE_COLORS.{clase} = {hubble_js.get(clase)} (PHP: {color})")
    check(color in leyenda_gl, f"color de '{clase}' ({color}) presente en #mw-legend-hubble")

# ── 2) Sincronía con la leyenda #mw-legend ───────────────────────────────────
# Colores data-color de los mw-legend-item (leyenda del mapa MW).
# [^>]* y no \s+: entre `class` y `data-color` hay hoy un `aria-pressed`, y con la
# regex pegada el test leía 0 colores y daba por sincronizada una leyenda que no
# estaba mirando. Un guardián que no ve nada pasa siempre.
leyenda = set(c.lower() for c in re.findall(r'class="mw-legend-item"[^>]*data-color="(#[0-9a-fA-F]{6})"', HTML))
check(len(leyenda) >= 6, f"leyenda #mw-legend parseada ({len(leyenda)} colores)")
print("Sincronía clasificador -> leyenda:")
for tipo, codes, color in reglas:
    check(color in leyenda, f"color de '{tipo}' ({color}) presente en la leyenda")
check(color_estrella in leyenda, f"color 'estrella' ({color_estrella}) presente en la leyenda")
check(color_desconocido in leyenda, f"color 'desconocido' ({color_desconocido}) presente en la leyenda")

# Dos entradas de leyenda, no una: el rótulo «Estrella / otro» era el cajón mezclado
# llegando impreso hasta el usuario.
rotulos = re.findall(r'<span class="mw-legend-text">([^<]+)</span>', HTML)
check("Estrella" in rotulos, f"la leyenda rotula «Estrella» ({rotulos})")
check("Sin clasificar" in rotulos, f"la leyenda rotula «Sin clasificar» ({rotulos})")
check(not any("/" in r for r in rotulos), f"ningún rótulo de la leyenda mezcla dos categorías con «/» ({rotulos})")

# ── 3) El nombre del tipo cabe en la columna `tipo` de la tabla de objetos ────
# NGC 2022 (PN) no llegó nunca al mapa: 'planetaria' son 10 caracteres y la
# columna era varchar(8), así que MySQL en modo estricto rechazaba el INSERT.
m_col = re.search(r"CREATE TABLE \$tabla_objetos.*?\n\s*tipo varchar\((\d+)\)", PHP, re.S)
ancho = int(m_col.group(1)) if m_col else None
check(ancho is not None, f"ancho de la columna `tipo` parseado ({ancho})")
print("Cada tipo del clasificador cabe en la columna:")
for tipo, _codes, _color in reglas + [("estrella", [], ""), ("desconocido", [], "")]:
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
