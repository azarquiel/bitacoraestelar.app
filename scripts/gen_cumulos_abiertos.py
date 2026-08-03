# -*- coding: utf-8 -*-
"""Genera el catálogo de cúmulos abiertos a partir de mapa/datos/cumulos_abiertos.xlsx
(listado aportado por el usuario: id, nombre/alias, RA, Dec, magnitud, constelación,
brillo superficial).

El simulador solo necesita posición y constelación para pintar el campo real de
Gaia sobre el objeto (no hay modelo de halo difuso para abiertos, a diferencia
de los globulares); la magnitud se lleva igualmente para mostrarla en la ficha.

Salidas:
  mapa/datos/cumulos_abiertos.csv
  simulador_ocular/resources/js/cumulos-abiertos-datos.js  (window.BITACORA_CUMULOS_ABIERTOS)

Uso:  python3 scripts/gen_cumulos_abiertos.py
"""
import csv
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, 'mapa', 'datos', 'cumulos_abiertos.xlsx')
OUT_CSV = os.path.join(RAIZ, 'mapa', 'datos', 'cumulos_abiertos.csv')
OUT_JS = os.path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'cumulos-abiertos-datos.js')

# Abreviatura IAU -> nombre latino de la constelación (mismo mapeo que gen_dobles.py).
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


def ra_a_grados(texto):
    # "00h 00m 13s" -> grados decimales.
    m = re.match(r'\s*(\d+)h\s*(\d+)m\s*([\d.]+)s\s*$', texto)
    if not m:
        return None
    h, mi, s = float(m.group(1)), float(m.group(2)), float(m.group(3))
    return (h + mi / 60 + s / 3600) * 15


def dec_a_grados(texto):
    # "+60°56,7'" (coma decimal, sin segundos) -> grados decimales.
    texto = texto.replace(',', '.')
    m = re.match(r"\s*([+-])(\d+)°\s*([\d.]+)'\s*$", texto)
    if not m:
        return None
    signo = -1.0 if m.group(1) == '-' else 1.0
    g, mi = float(m.group(2)), float(m.group(3))
    return signo * (g + mi / 60)


def numero_coma(texto):
    if texto is None:
        return None
    texto = str(texto).strip().replace(',', '.')
    if not texto or texto.lower() == 'n/a':
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def main():
    import openpyxl
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb['Sheet1']

    filas = []
    descartadas = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        ident, _nombre, ra_txt, dec_txt, mag_txt, const_abr, _sb_txt = row
        if not ident or not ra_txt or not dec_txt:
            descartadas += 1
            continue
        ra = ra_a_grados(ra_txt)
        dec = dec_a_grados(dec_txt)
        if ra is None or dec is None:
            descartadas += 1
            continue
        filas.append({
            'id': ident.strip(),
            'constelacion': CONST.get((const_abr or '').strip(), (const_abr or '').strip()),
            'ra_grados': round(ra, 5),
            'dec_grados': round(dec, 5),
            'mag': numero_coma(mag_txt),
        })

    filas.sort(key=lambda f: f['ra_grados'])

    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as fh:
        escritor = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        escritor.writeheader()
        escritor.writerows(filas)

    with open(OUT_JS, 'w', encoding='utf-8') as fh:
        fh.write('/* Cúmulos abiertos — GENERADO, no editar a mano.\n')
        fh.write('   Regenerar con: python3 scripts/gen_cumulos_abiertos.py\n')
        fh.write('   Fuente: mapa/datos/cumulos_abiertos.xlsx (listado aportado por el usuario)\n')
        fh.write('   Campos: [id, constelación, RA°, Dec°, mag] — mag puede ser null (sin dato). */\n')
        fh.write('window.BITACORA_CUMULOS_ABIERTOS = [\n')
        for f in filas:
            fh.write('  ["%s","%s",%s,%s,%s],\n' % (
                f['id'], f['constelacion'], f['ra_grados'], f['dec_grados'],
                f['mag'] if f['mag'] is not None else 'null'))
        fh.write('];\n')

    print('cúmulos abiertos: %d  (descartados por falta de datos: %d)' % (len(filas), descartadas))
    print('->', OUT_CSV)
    print('->', OUT_JS)


if __name__ == '__main__':
    main()
