#!/usr/bin/env python3
"""#575 · Estrellas de CAMPO del fixture de M13, según Vasiliev & Baumgardt 2021.

Fuente: Vasiliev & Baumgardt 2021, MNRAS 505, 5978 (arXiv:2102.09568), §2;
catálogo en Zenodo 4891252 (v2, «updated to match the published paper»;
el artículo cita 4549397, que resuelve a esta versión). Criterio y corte en
simulador_ocular/docs/notas/pertenencia-vb21.md.

Corte: campo  <=>  memberprob < 0,5  y  (astrometría limpia (bit 2 de qflag)  o  G < 13).
  · memberprob < 0,5: la clase más probable del modelo de mezcla.
  · Limpia: en las 2 r_h interiores, las p < 0,5 sin astrometría limpia dan
    80 estrellas/arcmin² contra ~1,3 del campo real (medido en la nota): ahí
    la p no sirve.
  · G < 13: el filtro (a) de VB21 las saca de «limpia» por calibración, no por
    aglomeración; en el halo 16 de 17 son de campo, con PM lejos del cúmulo.

Cruce por posición (< 0,05″; Gaia DR3 hereda la astrometría de EDR3, así que
la posición es la misma). Las filas sin pareja (sin astrometría de 5/6
parámetros, sobre todo en el núcleo) no tienen pertenencia: se quedan como
miembros, que es lo que ya suponía producción.

Salida: simulador_ocular/docs/validacion/m13_vb21_campo.csv con ra,dec tal
cual están en m13_gaia_dr3.csv (para cruzar por texto), memberprob y qflag.

python3 scripts/gen_m13_pertenencia.py [ruta/clusters.zip]
(sin ruta, descarga el zip de Zenodo, 119 MB, a un directorio temporal)
"""
import io
import math
import os
import sys
import tempfile
import urllib.request
import zipfile

URL = 'https://zenodo.org/api/records/4891252/files/clusters.zip/content'
MIEMBRO = 'catalogues/NGC_6205_M_13.txt'
AQUI = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(AQUI, '..', 'simulador_ocular', 'docs', 'validacion', 'm13_gaia_dr3.csv')
SALIDA = os.path.join(AQUI, '..', 'simulador_ocular', 'docs', 'validacion', 'm13_vb21_campo.csv')
TOL_AS = 0.05


def es_campo(p, qflag, g):
    return p < 0.5 and (qflag & 2 or g < 13)


def leer_vb21(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        texto = z.read(MIEMBRO).decode()
    filas = []
    for l in io.StringIO(texto):
        if l.startswith('#'):
            continue
        c = l.split()
        filas.append((float(c[1]), float(c[2]), float(c[12]), int(c[15]), float(c[16])))
    return filas


def main():
    zip_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not zip_path:
        zip_path = os.path.join(tempfile.mkdtemp(), 'clusters.zip')
        urllib.request.urlretrieve(URL, zip_path)
    vb = leer_vb21(zip_path)
    rejilla = {}
    for i, v in enumerate(vb):
        rejilla.setdefault((round(v[0] * 1000), round(v[1] * 1000)), []).append(i)

    lineas = open(FIXTURE).read().strip().split('\n')[1:]
    casadas = campo = 0
    out = ['ra,dec,memberprob,qflag']
    for l in lineas:
        c = l.split(',')
        ra, dec = float(c[0]), float(c[1])
        mejor = None
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for i in rejilla.get((round(ra * 1000) + di, round(dec * 1000) + dj), []):
                    v = vb[i]
                    d = math.hypot((v[0] - ra) * math.cos(math.radians(dec)), v[1] - dec) * 3600
                    if d < TOL_AS and (mejor is None or d < mejor[0]):
                        mejor = (d, v)
        if not mejor:
            continue
        casadas += 1
        _, _, g, q, p = mejor[1]
        if es_campo(p, q, g):
            campo += 1
            out.append('%s,%s,%.5f,%d' % (c[0], c[1], p, q))
    open(SALIDA, 'w').write('\n'.join(out) + '\n')
    print('fixture %d filas, con pareja en VB21 %d, de campo %d -> %s'
          % (len(lineas), casadas, campo, os.path.relpath(SALIDA)))


if __name__ == '__main__':
    main()
