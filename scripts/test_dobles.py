# -*- coding: utf-8 -*-
"""Self-check de la fusión de dobles (scripts/gen_dobles.py). Sin framework.
   Ejecutar:  python3 scripts/test_dobles.py"""
import gen_dobles as G

filas = G.construir()
por_alias = lambda sub: [f for f in filas if any(sub.lower() in a.lower() for a in f['aliases'])]
def fila_con(clave):
    r = [f for f in filas if any(clave.upper() == a.upper().replace(' ', '') for a in f['aliases'])]
    return r

# 1) Match transitivo por alias: Albireo (β Cyg) = 1 fila, AL+CDSA, sep 34,7
alb = por_alias('Bet Cyg')
assert len(alb) == 1, "Albireo duplicado: %d filas" % len(alb)
assert alb[0]['catalogue'] == 'AL|CDSA', alb[0]['catalogue']
assert alb[0]['sep'] == '34,7', alb[0]['sep']

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

print("OK · %d dobles · todas las comprobaciones pasan" % len(filas))
