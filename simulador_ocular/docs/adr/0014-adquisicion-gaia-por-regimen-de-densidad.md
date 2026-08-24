# 0014 — Adquisición de Gaia por régimen de densidad

Fecha: 2026-08-19 · Estado: aceptada

## Contexto

La consulta de producción del proxy (`gaia_proxy.php`) era única para todo el
cielo: `ORDER BY Gmag + TOP 40000`. El estudio preregistrado (ADR 0012, informes
`informe_gaia_e{1,2_e3,4}.md`) midió que:

- el coste dominante del TAP es el `ORDER BY`, no el área ni las filas devueltas;
- ~200 000 filas sin `ORDER BY` llegan en ~2-4 s;
- el `TOP 40000` es una **salvaguarda computacional**, no física: el límite
  físico de adquisición ya es el `mag` que manda el cliente (`magConsultaGaia`:
  equipo + aumentos + cielo + cola de glow + margen);
- en campos densos el `TOP 40000` amputa luz físicamente relevante: en M7
  elimina ~1,45 M de estrellas entre G≈15,2 y G≈19,3 con SB media ~21,1
  mag/arcsec², más brillante que un cielo oscuro (~21,9).

## Decisión

1. **`TOP 40000` deja de ser constante física.** Solo sobrevive en la consulta
   segura de campos densos, como truncamiento ordenado (cae lo más débil).
2. **Estrategia por régimen de densidad, autodecisoria** (sin conocimiento
   previo del campo; vale para cualquier posición del firmamento y cualquier
   catálogo de objetos):
   - **Sonda** sin `ORDER BY`, con `TOP = GAIA_TECHO_FILAS` (200 000) y
     `MAXREC` igual al techo. Si la respuesta no toca el techo, es el conjunto
     **completo** hasta el `mag` físico: se sirve tal cual, sin truncamiento y
     sin pagar la ordenación.
   - **Repliegue seguro** solo si la sonda toca techo (campo denso) o es
     ilegible: la consulta histórica `ORDER BY + TOP 40000`. Adquirir sin
     `ORDER BY` un campo que excede el techo del servidor sería un truncamiento
     arbitrario que puede perder estrellas brillantes; por eso el `TOP` no se
     elimina globalmente.
3. **El techo (200 000) es criterio de adquisición, no parámetro físico.** Es la
   referencia de la medición existente, no un valor definitivo; no debe migrar
   al modelo de observación. No hay frontera geográfica («bulbo»): decide el
   volumen real de cada campo.
4. **Tres poblaciones** (modelo conceptual, ver CONTEXT.md): individual
   (filas Gaia, pipeline actual), mezclada/truncada (existe solo en campos
   densos: hoy la sigue cortando el `TOP 40000`), y por debajo de `mag` físico
   (descartada por el `WHERE`). En campos no densos la población truncada es
   **vacía** por construcción: la sonda trae todo.

## Fondo agregado (fase 2 — implementada 2026-08-19)

Para campos densos, la solución no es transportar millones de filas sino los
**momentos** de la banda truncada, con el mismo principio de flujo
agregado/velo ya usado en cúmulos:

- El proxy, tras la consulta segura, pide al TAP los momentos de la banda
  `(corte, mag]` — `COUNT`, `SUM(POWER(10,-0.4*Gmag))` y el segundo momento
  `SUM(POWER(10,-0.8*Gmag))` para SBF — sin `ORDER BY` (medido en M7: 39 s,
  una vez por región, caché inmutable). Si el agregado falla, se sirve sin
  fondo: degradación, nunca bloqueo.
- Contrato: clave `fondo: {corte, n, flujo, m2, rad}` hermana de `data`,
  ausente cuando la población truncada es vacía — el cliente que solo lee
  `data` no se rompe.
- El cliente convierte el flujo en la SB media del velo (`veloSB`, en M7:
  21,0 mag/arcsec², que clava la estimación previa de 21,1) y la incorpora
  como **cielo extra** (`veloSB` en el objeto cielo): `ctxFotometrico` y
  `magLimite` suman su flujo al del sqm y TODO lo derivado (SBe, Cmin, nivel
  de fondo, magnitud límite) lo hereda sin ley nueva. El pipeline de
  estrellas individuales no se toca.
- Aproximaciones asumidas: velo uniforme sobre el campo (estadístico, sin
  estructura espacial) y G ≈ V frente a la escala del sqm.
- La placa del DSS NO lleva velo: la foto ya contiene ese resplandor y sería
  doble conteo.

Lo que este ADR fija es que ninguna solución puede simplemente ignorar la
población truncada (su pérdida es físicamente relevante, ver Contexto).

## Consecuencias

- Campos no densos (la mayoría del cielo): desaparece el coste del `ORDER BY`
  y desaparece el truncamiento; el cliente recibe la lista completa, sin
  cambios de contrato (mismas columnas; el cliente no asume ni orden ni tamaño,
  verificado).
- Campos densos: sobrecoste de la sonda (~2-4 s medidos) sobre una consulta
  ordenada de ~23-37 s que igualmente había que pagar; comportamiento final
  idéntico al actual.
- Caché del proxy: misma clave y misma inmutabilidad; solo cambia qué JSON se
  cachea la primera vez.
- Equivalencia verificada en vivo (Polo N): sonda y consulta segura devuelven
  el mismo conjunto estrella a estrella cuando no hay truncamiento; rama densa
  verificada en M7 (la sonda toca techo y repliega).
