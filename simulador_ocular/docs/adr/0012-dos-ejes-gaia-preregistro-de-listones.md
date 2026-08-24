# Dos ejes ortogonales para Gaia, con listones preregistrados

La optimización de la adquisición de Gaia DR3 se estudia como **dos ejes independientes**, y los
umbrales de decisión quedan fijados **antes** de ver los datos de los experimentos. Cambiar los
listones después de medir invalidaría el estudio: cualquier resultado encontraría un umbral que
lo justificara.

## Premisa medida (no se re-mide)

El coste de una consulta al TAP de VizieR lo fija cuántas filas hay que **ordenar**
(`ORDER BY Gmag` sobre el `WHERE`), no el área ni las filas devueltas. Medido 2026-08-17: M7 con
Gmag≤20 = 28 s frente a Gmag≤15,5 = 4,7 s, devolviendo ambas las mismas 40 000 filas. Trocear
por área con `ORDER BY + TOP` por trozo está descartado con medidas (cuadrante = 4,2 s, y VizieR
serializa por IP: paralelo ahorra ~15 %).

Por tanto:

> El troceado espacial **no reduce el coste del primer acceso**; su única justificación posible
> es la reutilización posterior.

## Decisión

**Eje 1 — profundidad adaptativa (ataca el frío).** Histograma `COUNT` por escalones de 0,5 mag
sin `ORDER BY`; se pide el primer escalón cuya cuenta acumulada ≥ 40 000, que es superconjunto
de las 40 000 más brillantes por construcción: semántica del render idéntica sin margen que
calibrar. Se despliega dentro del proxy, contrato intacto (Fase 1).

**Eje 2 — teselado HEALPix (ataca la reutilización).** Celdas HEALPix nested expresadas como
rangos de `source_id` (sus bits altos codifican el ipix de nivel 12), consultadas **sin
`ORDER BY`**; clave `(DR3, nivel, ipix)`, Gmax monotónico como estado. Si pasa sus listones,
contrato por celdas con el cliente reconstruyendo (Fase 2).

Ningún experimento mezcla los dos ejes. La comparación del frío espacial es contra el diseño
actual **ya optimizado con el eje 1**, no contra los 28 s de hoy.

## Listones preregistrados

Eje 1 (todos):

- Equivalencia por `source_id` en el 100 % de los campos.
- Speedup neto ≥ **3×** en cada campo saturante (5× = claramente bueno).
- Sobrecoste medio del histograma ≤ **1 s** en campos no saturantes.
- El `COUNT` solo se acepta si su coste es pequeño frente al ahorro del `ORDER BY`, no por ser
  meramente menor.

Eje 2 / Fase 2 (todos simultáneos):

- Equivalencia por `source_id` en el 100 % de los campos reconstruidos.
- Reutilización ≥ **70 %** en 2 de 3 cargas sintéticas, ≥ **70 %** específicamente en la carga
  de cambio de instrumento, ninguna < **30 %**.
- Frío espacial ≤ **1,5×** el frío del diseño actual optimizado en mediana sobre los 6 campos,
  ≤ **2×** en el peor.
- Reconstrucción completamente caliente en cliente ≤ **100 ms** mediana, ≤ **250 ms** peor campo
  de bulbo, en máquina modesta.
- Tamaño por celda: distribución con los 10 MB comprimidos como diagnóstico estadístico del
  nivel, no veto por celda única.
- ≤ **9** celdas por campo típico, ≤ **16** en el peor caso geométrico.

Ambas conclusiones son válidas: si el teselado no llega, se descarta y queda el eje 1, que ya es
una optimización con garantía de equivalencia.

## Por qué ADR

Es el resultado de un trade-off real (reutilización frente a complejidad, con la alternativa
«no teselar» como salida legítima), sorprendería sin contexto (¿por qué el teselado no intenta
abaratar el frío? porque está medido que no puede) y es caro de revertir: los listones son el
contrato del estudio, y moverlos a posteriori convierte las medidas en retórica.
