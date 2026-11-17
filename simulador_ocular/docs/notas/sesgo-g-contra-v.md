# Sesgo de comparar la G de Gaia con una magnitud límite visual (#545)

Fecha: 2026-11-17. Medido con `node scripts/harness_sesgo_g_v.js` sobre el Avance de Gaia (DR3, G < 15, cielo completo, 36 909 335 filas, generado 2026-11-10). Ningún cambio de producción.

## Pregunta

`mlim` (Torres Lapasió) es una magnitud **visual**. `planEstrellas` (`resources/js/bitacora-gaia-render.js`) la compara con la **G** de Gaia. ¿Cuánto se equivoca en el brillo y la visibilidad de una estrella por eso?

## Listón (fijado antes de medir)

«Parte apreciable del catálogo» = **al menos el 10 %** de las estrellas con color tiene |G − V| > 0,1 mag.

Caso malo que el listón tiene que rechazar: un catálogo sin sesgo (todo en BP−RP ≈ 0,5, |G − V| = 0,07) da 0 % y sale «no hace falta». El arnés lo comprueba con filas sintéticas antes de medir.

## Conversión

G − V de Gaia EDR3, doc. CU5, tabla 5.7 (Riello et al. 2021), σ = 0,03 mag, válida en −0,5 < BP−RP < 5. Es la que ya usa `magVGaia` desde #574 y la que usa `gen_hipparcos.py` en sentido contrario.

| BP−RP | G − V (mag) |
|------:|------------:|
| −0,2 | −0,039 |
| 0,5 | −0,072 |
| 1,0 | −0,214 |
| 2,0 | −0,747 |
| 3,0 | −1,540 |

|G − V| pasa de 0,1 mag a partir de **BP−RP > 0,63**. G − V es negativo en todo el rango: V es más débil que G, así que comparar G con `mlim` pinta las estrellas **más brillantes** de lo que se ven, y deja pasar estrellas que en V quedarían por debajo de `mlim`.

## Resultado

| Tramo | Estrellas | Sin color | Fuera de rango | Con \|G−V\| > 0,1 | Media G − V |
|---|---:|---:|---:|---:|---:|
| G < 15 (todo) | 36 909 335 | 0,4 % | 0,4 % | **95,8 %** | −0,399 |
| G < 6 | 6 764 | 0,0 % | 0,1 % | 63,8 % | −0,386 |
| G 6–9 | 170 662 | 0,0 % | 0,2 % | 70,7 % | −0,377 |
| G 9–12 | 2 910 395 | 0,1 % | 0,3 % | 84,3 % | −0,363 |
| G 12–15 | 33 821 514 | 0,4 % | 0,4 % | 96,9 % | −0,402 |

Percentiles de G − V (todo G < 15, con color; resolución 0,05 mag): p5 −1,10 · p25 −0,45 · **p50 −0,25** · p75 −0,15 · p95 −0,10.

La estrella mediana del catálogo aparece **0,25 mag** más brillante de lo que es en V. Una de cada cuatro, 0,45 mag o más. La fracción crece hacia las débiles, que son justo las que deciden si una estrella cruza `mlim`. Por encima de G = 15 (la consulta de cono) no está medido, pero la tendencia de 9–12 a 12–15 no da motivos para pensar que baje.

## Veredicto

**Hace falta corrección.** El 95,8 % está muy por encima del listón del 10 %, en todos los tramos de G. La historia de corrección ya existe: **#579** (el pintor decide la visibilidad en V). Las filas sin color o fuera de rango (0,8 % entre las dos) se quedan en G, igual que en #574.

`BITACORA_ESTRELLAS_BRILLANTES` (Hipparcos, Hp < 9) también está en G (`gen_hipparcos.py` convierte V a G) y trae BP−RP, así que #579 lo cubre con la misma conversión.

## Cómo se combina con #344 (Crumey Ec. 18)

Son dos correcciones distintas, y **se suman sin solaparse** si se aplican en este orden:

1. **G → V (#579).** Cambio de banda fotométrica: lleva la magnitud del catálogo a la banda en la que está definida `mlim`. No dice nada del ojo.
2. **Ec. 18 sobre V (#344).** `Δm = 0,27·(c_ref − c)` con `c` = B−V. Es la sensibilidad escotópica del ojo **respecto a V**: Crumey la define partiendo de una magnitud V. Aplicada a G, mezclaría el desfase de banda con el del ojo.

Las dos empujan en el mismo sentido para las estrellas rojas (más débiles de lo que dice G). #344 tiene que actuar sobre la V que deja #579, nunca sobre G, y necesita su propia conversión BP−RP → B−V citada (criterio 1 de #344). Orden: #579 antes que #344.
