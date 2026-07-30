# -*- coding: utf-8 -*-
"""Self-check de la fusión de dobles (scripts/gen_dobles.py). Sin framework.
   Ejecutar:  python3 scripts/test_dobles.py"""
import gen_dobles as G

filas = G.construir()
por_alias = lambda sub: [f for f in filas if any(sub.lower() in a.lower() for a in f['aliases'])]
def fila_con(clave):
    r = [f for f in filas if any(clave.upper() == a.upper().replace(' ', '') for a in f['aliases'])]
    return r

# 1) Match transitivo por alias: Albireo (β Cyg) = 1 fila, AL+CDSA+WDS, sep 34,7
alb = por_alias('Bet Cyg')
assert len(alb) == 1, "Albireo duplicado: %d filas" % len(alb)
assert alb[0]['catalogue'] == 'AL|CDSA|WDS', alb[0]['catalogue']
assert alb[0]['sep'] == '34,7', alb[0]['sep']

# 1.bis) El WDS COMPLETA: aporta ángulo de posición y tipo espectral...
assert alb[0]['pa'] == '53', alb[0]['pa']
assert (alb[0]['spect1'], alb[0]['spect2']) == ('K3II', 'B9.5'), alb[0]
#        ...pero NO pisa lo que ya había, porque va último en la prioridad. 56 And
#        estaba en RASC con 190,4" y el WDS la trae con 202,5": manda la de RASC, y
#        el ángulo, que solo tiene el WDS, sí entra.
and56 = por_alias('56 And')
assert len(and56) == 1 and and56[0]['sep'] == '190,4', and56
assert 'WDS' in and56[0]['catalogue'] and and56[0]['pa'] == '298', and56
# Y el ángulo solo puede venir del WDS: nadie más lo trae.
sin_wds_con_pa = [f for f in filas if f['pa'] and 'WDS' not in f['catalogue']]
assert not sin_wds_con_pa, sin_wds_con_pa[:3]

# 2) Fusión en los 3 catálogos: Eta Cas (Achird) = 1 fila AL|RASC|CDSA
eta = por_alias('Eta Cas')
assert len(eta) == 1 and eta[0]['catalogue'] == 'AL|RASC|CDSA', eta

# 3) Colisión Bayer NO fusiona estrellas distintas: θ¹ Ori (HD37022=41 Ori) y
#    θ² Ori (HD37041=43 Ori) en filas DISTINTAS
t1 = por_alias('HD37022'); t2 = por_alias('HD37041')
assert len(t1) == 1 and len(t2) == 1 and t1[0]['id'] != t2[0]['id'], "θ¹/θ² Ori fusionadas"

# 4) Superíndice Bayer separa α¹ Cap (HD192876) de α² Cap (HD192947)
a1 = por_alias('HD192876'); a2 = por_alias('HD192947')
assert a1 and a2 and a1[0]['id'] != a2[0]['id'], "α¹/α² Cap fusionadas"

# 5) Single de RASC (Alpha Lyn, Type Star, sin Sep) descartada
assert not por_alias('Alp Lyn') and not por_alias('Alpha Lyn'), "single de RASC colada"

# 6) Integridad: todas con Id único y campos mínimos
ids = [f['id'] for f in filas]
assert len(ids) == len(set(ids)), "Ids duplicados"
for f in filas:
    assert f['aliases'] and f['ra'] and f['dec'] and f['mag1'] != '', f

# 7) El ángulo, en grados y dentro de rango; el tipo espectral, reconocible por el
#    modelo de color (si no, la componente sintética saldría blanca sin avisar).
for f in filas:
    if f['pa']:
        assert 0 <= float(f['pa'].replace(',', '.')) <= 360, f
    for campo in ('spect1', 'spect2'):
        if f[campo]:
            assert f[campo][0] in 'OBAFGKMWCSRNdgs', (campo, f[campo], f['aliases'][0])

# 8) Las dobles nuevas del WDS entran de verdad (16 Cyg no estaba antes).
assert por_alias('16 Cyg'), "no ha entrado ninguna doble nueva del WDS"

print("OK · %d dobles · todas las comprobaciones pasan" % len(filas))
print("   con ángulo de posición: %d · con tipo espectral: %d"
      % (sum(1 for f in filas if f['pa']), sum(1 for f in filas if f['spect1'])))
