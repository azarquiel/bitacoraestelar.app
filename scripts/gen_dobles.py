# -*- coding: utf-8 -*-
"""
Fusiona los catálogos de estrellas DOBLES en un único CSV unificado + módulo JS.

Entradas (fuente de verdad, en mapa/datos/):
  - AL_DoubleStarClub.csv           (Double Star Club, Astronomical League)
  - cambridge_double_star_atlas.csv (Cambridge Double Star Atlas)
  - RASC_Double_Star_Program.csv    (Royal Astronomical Society of Canada)

Salidas:
  - mapa/datos/estrellas_dobles.csv       catálogo unificado (Id;Name;Type;RA;Dec;Mag 1;Mag 2;Sep;Catalogue)
  - mapa/datos/catalogos_dobles.csv       tabla de catálogos (Code;Name)
  - simulador_ocular/resources/js/estrellas-dobles-datos.js   (window.BITACORA_DOBLES)

Reglas (decididas en sesión de grilling):
  - Match por ALIAS normalizado. Claves fuertes (únicas): HD, SAO, HR, Flamsteed
    (Nº+constelación), STF/Struve. Bayer griego = clave DÉBIL: solo une si NO colisiona
    (dos dobles distintas pueden compartir Bayer, p.ej. θ¹/θ² Ori). Nombres propios: solo
    display/búsqueda, nunca clave.
  - Desempate campo a campo, primer no-vacío, prioridad AL > RASC > Cambridge.
  - Se descarta de RASC lo que no es doble: sin RA (malformado/blanco), o sin Mag 2 NI Sep
    y sin match con otra doble. (AL y Cambridge listan solo dobles → siempre se conservan.)
  - Id = clave sintética estable DBL#### asignada en orden de RA (se persiste en el CSV).

Para añadir un catálogo futuro: añade su entrada a FUENTES con el mapeo de columnas.
"""
import csv, io, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def ruta(*p): return os.path.join(RAIZ, *p)

# Prioridad de desempate = orden de esta lista. Añadir catálogo = añadir entrada.
#   alias_cols: columnas de las que extraer nombres/aliases
#   tiene_mag2sep: si trae Mag 2 y Sep
FUENTES = [
    dict(code='AL',   nombre='Double Star Club (Astronomical League)',
         archivo='AL_DoubleStarClub.csv',        alias_cols=['Name'],       tiene_mag2sep=True),
    dict(code='RASC', nombre='Royal Astronomical Society of Canada Double Star Program',
         archivo='RASC_Double_Star_Program.csv', alias_cols=['ID', 'Name'], tiene_mag2sep=True),
    dict(code='CDSA', nombre='Cambridge Double Star Atlas',
         archivo='cambridge_double_star_atlas.csv', alias_cols=['ID', 'Name'], tiene_mag2sep=False),
]

CSV_OUT   = ruta('mapa', 'datos', 'estrellas_dobles.csv')
CAT_OUT   = ruta('mapa', 'datos', 'catalogos_dobles.csv')
JS_OUT    = ruta('simulador_ocular', 'resources', 'js', 'estrellas-dobles-datos.js')

# --- Constelaciones (abrev IAU -> latín). Solo para la ficha. ---
CONST = {
 'And':'Andromeda','Ant':'Antlia','Aps':'Apus','Aql':'Aquila','Aqr':'Aquarius','Ara':'Ara',
 'Ari':'Aries','Aur':'Auriga','Boo':'Bootes','Cae':'Caelum','Cam':'Camelopardalis','Cnc':'Cancer',
 'CVn':'Canes Venatici','CMa':'Canis Major','CMi':'Canis Minor','Cap':'Capricornus','Car':'Carina',
 'Cas':'Cassiopeia','Cen':'Centaurus','Cep':'Cepheus','Cet':'Cetus','Cha':'Chamaeleon','Cir':'Circinus',
 'Col':'Columba','Com':'Coma Berenices','CrA':'Corona Australis','CrB':'Corona Borealis','Crv':'Corvus',
 'Crt':'Crater','Cru':'Crux','Cyg':'Cygnus','Del':'Delphinus','Dor':'Dorado','Dra':'Draco',
 'Equ':'Equuleus','Eri':'Eridanus','For':'Fornax','Gem':'Gemini','Gru':'Grus','Her':'Hercules',
 'Hor':'Horologium','Hya':'Hydra','Hyi':'Hydrus','Ind':'Indus','Lac':'Lacerta','Leo':'Leo',
 'LMi':'Leo Minor','Lep':'Lepus','Lib':'Libra','Lup':'Lupus','Lyn':'Lynx','Lyr':'Lyra','Men':'Mensa',
 'Mic':'Microscopium','Mon':'Monoceros','Mus':'Musca','Nor':'Norma','Oct':'Octans','Oph':'Ophiuchus',
 'Ori':'Orion','Pav':'Pavo','Peg':'Pegasus','Per':'Perseus','Phe':'Phoenix','Pic':'Pictor','Psc':'Pisces',
 'PsA':'Piscis Austrinus','Pup':'Puppis','Pyx':'Pyxis','Ret':'Reticulum','Sge':'Sagitta','Sgr':'Sagittarius',
 'Sco':'Scorpius','Scl':'Sculptor','Sct':'Scutum','Ser':'Serpens','Sex':'Sextans','Tau':'Taurus',
 'Tel':'Telescopium','Tri':'Triangulum','TrA':'Triangulum Australe','Tuc':'Tucana','UMa':'Ursa Major',
 'UMi':'Ursa Minor','Vel':'Vela','Vir':'Virgo','Vol':'Volans','Vul':'Vulpecula',
}
# Lookup case-insensitive de abrev de constelación
CONST_CI = {k.lower(): k for k in CONST}

# Bayer: nombre griego completo o abreviatura de 3 letras -> token canónico
GRIEGO = {
 'alpha':'alp','alp':'alp','beta':'bet','bet':'bet','gamma':'gam','gam':'gam','delta':'del','del':'del',
 'epsilon':'eps','eps':'eps','zeta':'zet','zet':'zet','eta':'eta','theta':'the','the':'the',
 'iota':'iot','iot':'iot','kappa':'kap','kap':'kap','lambda':'lam','lam':'lam','mu':'mu','nu':'nu',
 'xi':'xi','omicron':'omi','omi':'omi','pi':'pi','rho':'rho','sigma':'sig','sig':'sig','tau':'tau',
 'upsilon':'ups','ups':'ups','phi':'phi','chi':'chi','psi':'psi','omega':'ome','ome':'ome',
}

# ---------------------------------------------------------------------------
# Extracción de claves de match desde un alias suelto
# ---------------------------------------------------------------------------
def claves_de(alias):
    """Devuelve (fuertes, bayer) de un alias. fuertes = set; bayer = str|None."""
    a = alias.strip()
    if not a:
        return set(), None
    up = a.upper()
    fuertes = set()

    # Catálogos numéricos únicos
    for pref in ('HD', 'SAO', 'HR'):
        m = re.match(r'^%s\s*0*([0-9]+)$' % pref, up)
        if m:
            fuertes.add('%s%s' % (pref, m.group(1)))
            return fuertes, None
    # STF / Struve (Wilhelm Struve). "Otto Struve" = STT, distinto.
    m = re.match(r'^OTTO\s+STRUVE\s*0*([0-9]+)$', up)
    if m:
        return {'STT%s' % m.group(1)}, None
    m = re.match(r'^(?:STF|STRUVE)\s*0*([0-9]+)$', up)
    if m:
        return {'STF%s' % m.group(1)}, None

    toks = a.split()
    # Flamsteed: "24 Cas" (número + constelación)
    if len(toks) == 2 and toks[0].isdigit() and toks[1].lower() in CONST_CI:
        return {'FL%d%s' % (int(toks[0]), CONST_CI[toks[1].lower()])}, None
    # Bayer: griego [+número] + constelación
    if len(toks) >= 2 and toks[0].lower() in GRIEGO and toks[-1].lower() in CONST_CI:
        g = GRIEGO[toks[0].lower()]
        const = CONST_CI[toks[-1].lower()]
        num = ''
        if len(toks) >= 3 and toks[1].isdigit():   # superíndice: α¹ vs α² son distintas
            num = toks[1]
        return set(), 'BY%s%s%s' % (g, num, const)
    return set(), None


def const_de(aliases):
    """Abrev de constelación a partir de cualquier Bayer/Flamsteed de la lista."""
    for a in aliases:
        toks = a.split()
        if len(toks) >= 2 and toks[-1].lower() in CONST_CI:
            t0 = toks[0].lower()
            if t0 in GRIEGO or toks[0].isdigit():
                return CONST_CI[toks[-1].lower()]
    return None


# ---------------------------------------------------------------------------
# Parseo de fuentes
# ---------------------------------------------------------------------------
def num(s):
    s = (s or '').strip()
    return s if s else ''   # se conserva como texto (coma decimal) en el CSV

def leer_fuente(src):
    """Lista de registros crudos: dict(code, aliases[], type, ra, dec, mag1, mag2, sep)."""
    regs = []
    with io.open(ruta('mapa', 'datos', src['archivo']), encoding='utf-8-sig') as f:
        r = csv.DictReader(f, delimiter=';')
        for row in r:
            ra = (row.get('RA') or '').strip()
            if not ra:
                continue                     # blanco / malformado -> fuera
            aliases = []
            for col in src['alias_cols']:
                for a in (row.get(col) or '').split(','):
                    a = a.strip()
                    if a and a not in aliases:
                        aliases.append(a)
            if not aliases:
                continue
            mag2 = num(row.get('Mag 2')) if src['tiene_mag2sep'] else ''
            sep  = num(row.get('Sep'))   if src['tiene_mag2sep'] else ''
            # Basura de RASC: filas que no son dobles (single/blanco, sin Mag 2 ni Sep).
            # Se quitan ANTES de agrupar para que no envenenen el match por alias
            # (p.ej. RASC "Zeta Psc"=89 Psc, single, colisiona el Bayer de ζ Psc=86 Psc).
            # No afecta a AL (siempre trae Mag 2) ni a CDSA (no tiene esas columnas).
            if src['tiene_mag2sep'] and mag2 == '' and sep == '':
                continue
            regs.append(dict(
                code=src['code'], aliases=aliases,
                type=(row.get('Type') or '').strip(),
                ra=ra, dec=(row.get('Dec') or '').strip(),
                mag1=num(row.get('Mag')),
                mag2=mag2, sep=sep,
            ))
    return regs


# ---------------------------------------------------------------------------
# Union-Find
# ---------------------------------------------------------------------------
class UF:
    def __init__(self, n): self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.p[rb] = ra


def sep_arcsec(ra1, dec1, ra2, dec2):
    import math
    dra = (ra_grados(ra1) - ra_grados(ra2)) * math.cos(math.radians(dec_grados(dec1)))
    ddec = dec_grados(dec1) - dec_grados(dec2)
    return math.hypot(dra, ddec) * 3600.0


def unir_por_coordenadas(grupos, regs, tol_as=50.0, mag_tol=0.6):
    """Pasada final quirúrgica (P3-C acotado): fusiona grupos que NO comparten alias
    pero son la misma doble (misma posición <tol_as y Mag 1 compatible). Los residuos
    reales están a <=45" (coords gruesas de AL, que redondea a 00s); las estrellas
    distintas (ν¹/ν² Dra 60", 16/17 Dra 86", θ¹/θ² Ori...) a >=60", así que el umbral
    no las toca. El match por alias sigue mandando; esto solo barre dobles catalogadas
    bajo designaciones sin ningún alias común (p.ej. HR8281 = STF2816, Keid = O2 Eri)."""
    def rep(grupo):
        ms = sorted((regs[i] for i in grupo), key=lambda r: PRIO[r['code']])
        ra   = next((m['ra']   for m in ms if m['ra']),   '')
        dec  = next((m['dec']  for m in ms if m['dec']),  '')
        mag1 = next((m['mag1'] for m in ms if m['mag1'] != ''), '')
        return ra, dec, mag1
    reps = [rep(g) for g in grupos]
    uf = UF(len(grupos))
    for i in range(len(grupos)):
        for j in range(i + 1, len(grupos)):
            (ra1, de1, m1), (ra2, de2, m2) = reps[i], reps[j]
            if m1 == '' or m2 == '':
                continue
            if abs(float(m1.replace(',', '.')) - float(m2.replace(',', '.'))) > mag_tol:
                continue
            if sep_arcsec(ra1, de1, ra2, de2) <= tol_as:
                uf.union(i, j)
    fusion = {}
    for i in range(len(grupos)):
        fusion.setdefault(uf.find(i), []).extend(grupos[i])
    return list(fusion.values())


def agrupar(regs):
    """Devuelve lista de grupos (cada grupo = lista de índices en regs)."""
    n = len(regs)
    fuertes = [set() for _ in range(n)]
    bayer   = [None] * n
    for i, rg in enumerate(regs):
        for a in rg['aliases']:
            fs, by = claves_de(a)
            fuertes[i] |= fs
            if by and bayer[i] is None:
                bayer[i] = by

    uf = UF(n)
    # 1) unir por clave fuerte compartida
    porFuerte = {}
    for i in range(n):
        for k in fuertes[i]:
            porFuerte.setdefault(k, []).append(i)
    for idxs in porFuerte.values():
        for j in idxs[1:]:
            uf.union(idxs[0], j)

    # 2) Bayer (clave débil): une los que comparten Bayer, SALVO colisión real.
    #    Colisión = el mismo Bayer recae sobre ≥2 estrellas distintas, revelado por
    #    ≥2 grupos con ANCLA de identidad diferente (Flamsteed/HD/SAO/HR; STF NO es
    #    ancla: es por-doble, no por-estrella). θ¹/θ² Ori: anclas 41 y 43 -> no une.
    #    Eta Cas (AL: HD/SAO) vs Eta Cas (CDSA: solo STF) -> 1 ancla -> une.
    def es_ancla(k): return not k.startswith(('STF', 'STT'))
    porBayer = {}
    for i in range(n):
        if bayer[i]:
            porBayer.setdefault(bayer[i], []).append(i)
    for idxs in porBayer.values():
        raices_ancladas = {uf.find(i) for i in idxs if any(es_ancla(k) for k in fuertes[i])}
        if len(raices_ancladas) <= 1:
            for j in idxs[1:]:
                uf.union(idxs[0], j)
        # si ≥2 anclas distintas -> Bayer colisionante, no se toca

    grupos = {}
    for i in range(n):
        grupos.setdefault(uf.find(i), []).append(i)
    return list(grupos.values())


# ---------------------------------------------------------------------------
# Fusión de un grupo -> fila unificada
# ---------------------------------------------------------------------------
PRIO = {s['code']: i for i, s in enumerate(FUENTES)}   # AL=0, RASC=1, CDSA=2

def fusionar(grupo, regs):
    miembros = sorted((regs[i] for i in grupo), key=lambda r: PRIO[r['code']])
    def primero(campo):
        for m in miembros:
            if m[campo] != '':
                return m[campo]
        return ''
    # aliases: unión preservando orden, dedup case-insensitive
    aliases, vistos = [], set()
    for m in miembros:
        for a in m['aliases']:
            if a.lower() not in vistos:
                vistos.add(a.lower()); aliases.append(a)
    codes = [s['code'] for s in FUENTES if any(m['code'] == s['code'] for m in miembros)]
    return dict(
        aliases=aliases, type=primero('type'),
        ra=primero('ra'), dec=primero('dec'),
        mag1=primero('mag1'), mag2=primero('mag2'), sep=primero('sep'),
        catalogue='|'.join(codes),
        es_doble_dura=any(m['code'] in ('AL', 'CDSA') for m in miembros),
    )


def es_doble(fila):
    # AL/Cambridge = siempre doble; RASC-solo requiere Mag 2 o Sep
    return fila['es_doble_dura'] or fila['mag2'] != '' or fila['sep'] != ''


# ---------------------------------------------------------------------------
# Orden por RA, Dec  (para Id estable y recorrido natural del cielo)
# ---------------------------------------------------------------------------
def ra_grados(s):
    m = re.match(r'\s*(\d+)h\s*(\d+)m\s*([\d.]+)s', s)
    if not m: return 0.0
    return (int(m[1]) + int(m[2]) / 60.0 + float(m[3]) / 3600.0) * 15.0

def dec_grados(s):
    m = re.match(r"\s*([+-]?)(\d+)°\s*(\d+),(\d+)'", s)
    if not m: return 0.0
    sign = -1 if m[1] == '-' else 1
    return sign * (int(m[2]) + (int(m[3]) + int(m[4]) / 10.0**len(m[4])) / 60.0)


# ---------------------------------------------------------------------------
# Formato para el JS (igual que carbono: "HH MM SS" / "±DD MM SS")
# ---------------------------------------------------------------------------
def ra_js(s):
    m = re.match(r'\s*(\d+)h\s*(\d+)m\s*([\d.]+)s', s)
    return "%02d %02d %02d" % (int(m[1]), int(m[2]), round(float(m[3])))

def dec_js(s):
    m = re.match(r"\s*([+-]?)(\d+)°\s*(\d+),(\d+)'", s)
    sign = '-' if m[1] == '-' else '+'
    deg = int(m[2]); amin = int(m[3])
    asec = round(int(m[4]) / 10.0**len(m[4]) * 60)
    if asec == 60: asec = 0; amin += 1
    return "%s%02d %02d %02d" % (sign, deg, amin, asec)

TIPO_LEG = {'dbl': 'doble', 'triple': 'triple', 'mult': 'múltiple'}
def tipo_leg(t):
    base = t.lower().split('+')[0].strip()
    return TIPO_LEG.get(base, 'doble')

def nombre_disp(aliases, const_abbr):
    """Titular: primer nombre propio si lo hay; si no, el primer alias 'legible'."""
    def es_desig(a):
        u = a.upper()
        return bool(re.match(r'^(HD|SAO|HR|STF|STRUVE|TYC|ADS|WDS|ALDS|H\s|SH\s|BU\s)', u)) \
            or bool(re.match(r'^[A-Z ]*\d[\d ]*$', u))
    propios = [a for a in aliases if not es_desig(a)
               and a.split()[0].lower() not in GRIEGO
               and not (len(a.split()) == 2 and a.split()[0].isdigit())]
    if propios:
        return propios[0]
    # si no hay nombre propio, usa el primer alias tal cual
    return aliases[0]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def construir():
    regs = []
    for src in FUENTES:
        regs.extend(leer_fuente(src))
    grupos = agrupar(regs)
    grupos = unir_por_coordenadas(grupos, regs)
    filas = [fusionar(g, regs) for g in grupos]
    filas = [f for f in filas if es_doble(f)]
    filas.sort(key=lambda f: (ra_grados(f['ra']), dec_grados(f['dec'])))
    for n, f in enumerate(filas, 1):
        f['id'] = 'DBL%04d' % n
        f['const_abbr'] = const_de(f['aliases'])
    return filas


def escribir_csv(filas):
    with io.open(CSV_OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['Id', 'Name', 'Type', 'RA', 'Dec', 'Mag 1', 'Mag 2', 'Sep', 'Catalogue'])
        for r in filas:
            w.writerow([r['id'], ','.join(r['aliases']), r['type'], r['ra'], r['dec'],
                        r['mag1'], r['mag2'], r['sep'], r['catalogue']])
    with io.open(CAT_OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['Code', 'Name'])
        for s in FUENTES:
            w.writerow([s['code'], s['nombre']])


def escribir_js(filas):
    def js_str(s): return '"' + (s or '').replace('\\', '\\\\').replace('"', '\\"') + '"'
    def js_num(s): return s.replace(',', '.') if s else 'null'
    lineas = []
    for r in filas:
        abbr = r['const_abbr'] or ''
        cfull = CONST.get(abbr, abbr)
        lineas.append(
            "  { id: %s, nombre: %s, constelacion: %s, abrev: %s, ra: %s, dec: %s, "
            "mag1: %s, mag2: %s, sep: %s, tipo: %s, catalogos: %s, aliases: %s }" % (
                js_str(r['id']), js_str(nombre_disp(r['aliases'], abbr)),
                js_str(cfull), js_str(abbr), js_str(ra_js(r['ra'])), js_str(dec_js(r['dec'])),
                js_num(r['mag1']), js_num(r['mag2']), js_num(r['sep']),
                js_str(tipo_leg(r['type'])), js_str(r['catalogue']), js_str(','.join(r['aliases'])),
            ))
    header = '''/* ===========================================================================
 * BITÁCORA ESTELAR · Catálogo de ESTRELLAS DOBLES
 * ---------------------------------------------------------------------------
 * Versión consultable (JavaScript) del catálogo unificado de dobles. Fuente de
 * verdad: mapa/datos/estrellas_dobles.csv, fusión de tres catálogos
 * (Astronomical League, Cambridge Double Star Atlas, RASC). Generado con
 * scripts/gen_dobles.py. NO editar a mano: regenerar desde los CSV.
 *
 * Cada objeto:
 *   id           clave sintética estable (DBL####)
 *   nombre       nombre para mostrar (propio o designación)
 *   constelacion nombre completo (latín) / abrev  abreviatura (3 letras)
 *   ra, dec      J2000 "HH MM SS" / "±DD MM SS" (formato del simulador)
 *   mag1, mag2   magnitudes de las componentes A y B (mag2 puede ser null)
 *   sep          separación en segundos de arco (puede ser null)
 *   tipo         doble · triple · múltiple
 *   catalogos    en cuáles aparece: "AL|CDSA|RASC"
 *   aliases      todos los nombres (para búsqueda)
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/. Incrementa ?v=N al actualizar.
 * =========================================================================== */
(function () {
  'use strict';
  window.BITACORA_DOBLES = [
'''
    footer = '\n  ];\n})();\n'
    with io.open(JS_OUT, 'w', encoding='utf-8') as f:
        f.write(header); f.write(',\n'.join(lineas)); f.write(footer)


if __name__ == '__main__':
    filas = construir()
    escribir_csv(filas)
    escribir_js(filas)
    n_al   = sum('AL'   in f['catalogue'] for f in filas)
    n_cdsa = sum('CDSA' in f['catalogue'] for f in filas)
    n_rasc = sum('RASC' in f['catalogue'] for f in filas)
    n3     = sum(f['catalogue'].count('|') == 2 for f in filas)
    print("Dobles unificadas: %d" % len(filas))
    print("  en AL=%d  CDSA=%d  RASC=%d  |  en los 3=%d" % (n_al, n_cdsa, n_rasc, n3))
    print("  -> %s" % CSV_OUT)
    print("  -> %s" % JS_OUT)
