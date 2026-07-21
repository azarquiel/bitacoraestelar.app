# -*- coding: utf-8 -*-
import csv, io, re

SRC = "/Users/isra/Proyectos/bitacoraestelar/mapa/datos/AL_Carbon_Stars.csv"
OUT = "/Users/isra/Proyectos/bitacoraestelar/simulador_ocular/resources/js/estrellas-carbono-datos.js"

CONST = {
 'Oph':'Ophiuchus','Her':'Hercules','Sgr':'Sagittarius','Dra':'Draco','Ser':'Serpens',
 'Lyr':'Lyra','Sct':'Scutum','Aql':'Aquila','Sge':'Sagitta','Cyg':'Cygnus','Cap':'Capricornus',
 'Del':'Delphinus','Vul':'Vulpecula','Cep':'Cepheus','Peg':'Pegasus','Aqr':'Aquarius',
 'And':'Andromeda','Psc':'Pisces','Cas':'Cassiopeia','Ari':'Aries','Cet':'Cetus','Per':'Perseus',
 'Cam':'Camelopardalis','Tau':'Taurus','Lep':'Lepus','Aur':'Auriga','Ori':'Orion','Eri':'Eridanus',
 'Gem':'Gemini','Mon':'Monoceros','CMa':'Canis Major','Pup':'Puppis','Cnc':'Cancer','Hya':'Hydra',
 'UMa':'Ursa Major','Vir':'Virgo','CVn':'Canes Venatici','CrB':'Corona Borealis',
}

def ra_fmt(s):
    m = re.match(r'\s*(\d+)h\s*(\d+)m\s*(\d+)s', s)
    return "%02d %02d %02d" % (int(m[1]), int(m[2]), int(m[3]))

def dec_fmt(s):
    m = re.match(r"\s*([+-]?)(\d+)°\s*(\d+),(\d+)'", s)
    sign = '-' if m[1] == '-' else '+'
    deg = int(m[2]); amin = int(m[3]); frac = int(m[4])
    asec = round(frac / (10 ** len(m[4])) * 60)
    if asec == 60: asec = 0; amin += 1
    return "%s%02d %02d %02d" % (sign, deg, amin, asec)

def nombre_disp(name, const):
    toks = name.split()
    if len(toks) >= 2 and toks[-1].isalpha():
        return " ".join(toks[:-1]) + " " + const
    return name

def tipo_leg(t, const_abbr):
    partes = [p for p in t.split('+')]
    etiquetas = []
    if 'Carbon' in partes: etiquetas.append('carbono')
    if 'Var Star' in partes: etiquetas.append('variable')
    if 'Dbl' in partes or 'SpecBin' in partes or 'EclBin' in partes: etiquetas.append('doble')
    if not etiquetas: etiquetas.append('estrella')
    return ' · '.join(etiquetas)

rows = []
with io.open(SRC, encoding='utf-8-sig') as f:
    r = csv.DictReader(f, delimiter=';')
    for row in r:
        name = row['Name'].strip()
        cabbr = row['Const'].strip()
        cfull = CONST.get(cabbr, cabbr)
        ra = ra_fmt(row['RA'])
        dec = dec_fmt(row['Dec'])
        mag = float(row['Mag'].strip().replace(',', '.'))
        disp = nombre_disp(name, cabbr)
        tipo = tipo_leg(row['Type'], cabbr)
        rows.append(dict(id=name, nombre=disp, const_abbr=cabbr, constelacion=cfull,
                         ra=ra, dec=dec, mag=mag, tipo=tipo, tipo_raw=row['Type'].strip()))

# Orden por AR para recorrer el cielo de forma natural (como el CSV)
def js_str(s): return '"' + s.replace('\\','\\\\').replace('"','\\"') + '"'

lines = []
for r in rows:
    lines.append(
      "  { id: %s, nombre: %s, constelacion: %s, abrev: %s, ra: %s, dec: %s, mag: %s, tipo: %s }"
      % (js_str(r['id']), js_str(r['nombre']), js_str(r['constelacion']), js_str(r['const_abbr']),
         js_str(r['ra']), js_str(r['dec']), repr(r['mag']), js_str(r['tipo']))
    )

header = '''/* ===========================================================================
 * BITÁCORA ESTELAR · Catálogo de ESTRELLAS DE CARBONO
 * ---------------------------------------------------------------------------
 * Base de datos de las estrellas de carbono del programa de observación de la
 * Astronomical League (AL Carbon Star Observing Program). Es la versión
 * "consultable" (JavaScript) de la fuente de verdad en
 *   mapa/datos/AL_Carbon_Stars.csv
 * generada con scripts/gen_carbono.py. NO editar a mano: regenerar desde el CSV.
 *
 * Cada objeto:
 *   id           identificador único (designación original del catálogo)
 *   nombre       nombre para mostrar (designación + constelación)
 *   constelacion nombre completo de la constelación (latín)
 *   abrev        abreviatura de la constelación (3 letras)
 *   ra, dec      coordenadas J2000 en "HH MM SS" / "±DD MM SS" (formato del simulador)
 *   mag          magnitud visual aproximada (muchas son variables)
 *   tipo         etiquetas legibles: carbono · variable · doble
 *
 * Las estrellas de carbono destacan por su intensísimo color rojo-anaranjado
 * (hollín de carbono en su atmósfera que filtra el azul); se aprecian mejor en
 * la vista de "Estrellas de Gaia (color real)" del simulador de ocular.
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/. Incrementa ?v=N al actualizar.
 * =========================================================================== */
(function () {
  'use strict';
  window.BITACORA_CARBONO = [
'''
footer = '''
  ];
})();
'''

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(header)
    f.write(",\n".join(lines))
    f.write(footer)

print("Escritas %d estrellas de carbono en %s" % (len(rows), OUT))
# Sanity samples
for r in rows[:3] + rows[-2:]:
    print(" ", r['id'], '->', r['nombre'], '|', r['ra'], r['dec'], '| mag', r['mag'], '|', r['tipo'])
