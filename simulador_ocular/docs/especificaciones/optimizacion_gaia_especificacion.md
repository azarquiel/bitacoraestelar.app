# Especificación del estudio: adquisición y caché de Gaia para cielo abierto

Responde a `optimizacion_gaia.md`. Decisiones de diseño y listones en ADR 0012; vocabulario en
`CONTEXT.md` («Adquisición de Gaia por celdas»). **Nada de esto se implementa hasta que los
experimentos pasen sus listones.**

## Premisas (fijadas, no se re-miden)

1. El coste del TAP es el `ORDER BY`: las filas que se ordenan, no el área ni las filas
   devueltas (medido 2026-08-17, ver memoria del proyecto y ADR 0012).
2. El troceado espacial no reduce el coste del primer acceso. Su única justificación es la
   reutilización.
3. VizieR serializa por IP: el paralelismo no salva ninguna estrategia.
4. Gaia DR3 es estático: no hay TTL; DR4 será un catálogo nuevo en la clave.

## Los dos ejes

### Eje 1 — profundidad adaptativa (frío). PRIORITARIO

Mecanismo: histograma `COUNT ... GROUP BY` por escalones de 0,5 mag sobre el campo, sin
`ORDER BY`. Se elige el primer escalón cuya cuenta acumulada ≥ 40 000 y se lanza la consulta de
siempre recortada a ese Gmax. Superconjunto por construcción → el `TOP 40000 ORDER BY` final
devuelve exactamente las mismas estrellas que hoy.

En campos que no saturan (acumulado < 40 000 a profundidad completa) el histograma es sobrecoste
puro: por eso tiene listón propio (≤ 1 s).

### Eje 2 — teselado HEALPix (reutilización)

- Esquema: HEALPix **nested**, celda expresada en ADQL como `WHERE source_id BETWEEN a AND b`
  (los bits altos del `source_id` codifican el ipix de nivel 12). Sin geometría esférica en el
  servidor. Niveles candidatos: 5, 6, 7 (celdas ≈ 1,8°, 0,92°, 0,46°).
- Consulta de celda **sin `ORDER BY`**: la celda contiene «todo hasta Gmax»; ordenar y recortar
  es del campo y lo hace el cliente.
- RA/Dec queda como contraste solo si el rango de `source_id` resulta no estar indexado.
- Caché (hipótesis de diseño, ADR 0012): L1 `window` → L2 `{prefix}bitacora_gaia_celdas` → TAP.
  Clave `(DR3, nivel, ipix)`; Gmax monotónico como estado; sin TTL; LRU por bytes; compartida;
  single-flight; precalentado opcional, nunca requisito.

Los ejes no se mezclan en ningún experimento. El frío espacial se compara contra el diseño
actual **ya optimizado con el eje 1**.

## Campos de medida (los 6)

| Régimen | Campo |
|---|---|
| Bulbo, satura fuerte | M7 (corte medido G=15,18) |
| Plano, satura moderado | M6 (corte G=17,42) |
| Plano galáctico sin cúmulo | campo en Cygnus/Escudo |
| Densidad media, no satura | M13 |
| Alta latitud galáctica | campo en Coma/Virgo |
| Polo galáctico, casi vacío | b ≈ ±85° |

Protocolo común: 3 repeticiones por consulta, **intercaladas** (candidata y control alternadas,
no en bloque, para no confundir caché del servidor con ahorro real); TTFB y tiempo total;
misma franja horaria; equivalencia siempre por conjunto de `source_id`, nunca byte a byte.

## Experimentos, en orden

1. **E1 — histograma (eje 1).** En los 6 campos: coste del histograma, Gmax elegido, consulta
   recortada frente a control completo, equivalencia por `source_id`. Decide Fase 1 con los
   listones del ADR 0012. Verificar de paso que el TAP acepta `GROUP BY` sobre expresión binned
   y que su coste es el de un `COUNT`.
2. **E2 — semántica source_id.** Verificar la conversión ipix(nivel) → intervalo de `source_id`
   contra una consulta de cono de control: mismas estrellas dentro de la celda.
3. **E3 — rango frente a cono.** Coste de `source_id BETWEEN` frente al cono equivalente. Si el
   rango no gana, RA/Dec entra como candidato y se repite E2/E3 con él.
4. **E4 — barrido de niveles 5/6/7.** Por nivel y campo: filas y bytes por celda (distribución,
   con 10 MB como diagnóstico), celdas por campo, frío absoluto de celda, y los tres regímenes
   (frío absoluto / parcialmente caliente / completamente caliente) del campo reconstruido.
5. **E5 — cargas sintéticas.** Tres cargas preregistradas: ① observador de objetos (mismo
   centro, distintos radios: cambio de instrumento), ② explorador libre (paseo continuo con
   solape), ③ multiusuario (N usuarios sobre el cielo popular). Métrica: reutilización de filas
   por carga y nivel. Contraste de realismo con logs del proxy de producción, que NO deciden.
6. **E6 — reconstrucción en cliente.** Unir celdas + recorte + `TOP 40000` en JS sobre el peor
   campo de bulbo, en máquina modesta. Decide B (contrato por celdas) frente a A
   (reconstrucción en proxy).

## Decisión

- **Fase 1** (proxy, contrato intacto) se implementa si E1 pasa sus listones. No espera al eje 2.
- **Fase 2** (endpoint de celdas, cliente reconstruye, L1 y L2 cachean la misma unidad) solo si
  E2–E6 pasan **todos** los listones del ADR 0012 simultáneamente. El endpoint de campo convive
  hasta quedarse sin llamadores.
- Si el teselado no llega, se descarta sin duelo: el eje 1 ya es una optimización con garantía
  de equivalencia y sin tocar una línea de la física del render.

## Entregable del estudio

Informe generado por el arnés (`scripts/harness_gaia_*.js`, patrón del arnés de Ricco) con cada
listón evaluado a PASA/NO PASA numérico, de forma que la decisión implementar/descartar no
requiera interpretación subjetiva.

## Riesgos

- El `GROUP BY` binned podría costar como un `ORDER BY` en VizieR → E1 lo mide antes que nada;
  caída prevista: escalera iterativa (consulta conservadora + segunda más honda si falta).
- El rango de `source_id` podría no estar indexado → E3; caída: RA/Dec.
- Celdas de bulbo demasiado gordas al nivel grueso → diagnóstico de 10 MB en E4 empuja a nivel
  más fino, a costa de más celdas por campo (listón de ≤ 9/16).
- La reconstrucción en cliente podría no ser interactiva → E6 decide A frente a B con número.
- La reutilización medida depende de las cargas sintéticas: por eso están preregistradas y los
  logs reales solo contrastan.
