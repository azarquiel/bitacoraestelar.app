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

## Campos densos por TAP asíncrono (#505, 2026-10-24)

Medido del 11-10 al 23-10: en las densas había 1 éxito de 33. GAVO corta a
~20 s con un 500 («Query timed out… use TAP's async mode») y CDS se cuelga
hasta los 55 s. Bajar `mag` no lo arregla.

Medido en vivo el 2026-10-24 sobre M7 (0,89°, mag 19,5):

- La segura (`ORDER BY + TOP 40000`) como job UWS en GAVO **no termina**: ERROR
  a las 7200 s exactas, el `executionDuration` del servidor.
- En síncrono, todo el cono pasa de 20 s, incluso un `COUNT(*)`. M7 a 0,2° y
  el polo a 0,89° responden en 2-3 s, así que lo caro es el cono.
- Un agregado del cono entero en asíncrono sí termina: el histograma de G, en
  280 s (1 735 376 estrellas, corte de 40 000 en G ≈ 15,2).

Decisión:

- **Primero la vía síncrona de siempre**, ahora GAVO primero también en la
  segura: sonda, y si toca techo o falla, segura, fondo y espacial. Con el
  servidor sano es lo más rápido (la única densa que terminó en producción
  tardó 38 s). Si GAVO responde con el 500 de su límite síncrono, no se pasa a
  CDS: el campo es denso y CDS tampoco terminaría. El primer 202 llega a ~45 s
  (sonda + segura); el AC1 original de < 25 s se cambia por eso, a sabiendas.
- **Si la segura tampoco termina, una cadena de tres jobs** en
  `https://dc.zah.uni-heidelberg.de/tap/async`, ninguno con `ORDER BY`:
  1. **histograma** por centésima de G (`FLOOR(G·100)`), con `COUNT`, flujo y
     segundo momento por celda. Da la celda de corte `b` (la más alta tal que lo
     de debajo cabe en 40 000) y los momentos del fondo, exactos.
  2. **espacial**: el velo por celdas del cielo de la banda `FLOOR(G·100) ≥ b`.
     Si falla, se sigue sin él (velo uniforme, como en la vía síncrona).
  3. **datos**: las filas con `FLOOR(G·100) < b`, `TOP` y `MAXREC` 40 000. Tienen
     que ser exactamente las que contó el histograma; si no, es un error, no un
     truncado silencioso.

  Los tres usan la misma celda en el mismo servidor, así que la partición
  filas/fondo es exacta. El JSON final es el de siempre (mismas columnas, mismo
  orden, `fondo` y `fondo.espacial`). La única diferencia: `fondo.corte` cae en
  un borde de centésima (`b/100`), no en la estrella 40 000. Si el campo cabe
  entero en el TOP, se salta el espacial y no hay fondo. Esto autoriza el
  histograma previo en la vía asíncrona, que el ticket dejaba fuera de alcance
  como «COUNT previo»; el ADR 0012 lo descartó por coste en síncrono, no aquí.
- **Un job por clave.** El estado de la cadena (paso, URL del job —la del
  `Location` del 303—, corte, momentos y celdas) se guarda como JSON en
  `<clave>.job`, junto a la entrada, con tmp + rename. Se lanza y se avanza con
  el `flock` de la entrada tomado. Mientras exista el `.job`, una petición que
  encuentra el lock ocupado responde 202 sin esperar.
  - GAVO ignora `PHASE=RUN` al crear el job, así que el RUN va en un segundo
    POST. Si se pierde, la fase `PENDING` lo reenvía.
- **Contrato 202.** Mientras la cadena no acaba, el proxy responde `202` con
  `{"pendiente": true, "reintentar_en": 15, "paso": N, "pasos": 3}` y repite
  `reintentar_en` en `Retry-After`. La respuesta lleva `Cache-Control: no-store`
  y no lleva ETag.
  - Un fallo de red o un 5xx al preguntar la fase también da 202 y conserva el
    `.job`, para que un tropiezo de GAVO no relance la cadena.
  - Cuando un paso acaba, esa misma petición lanza el siguiente y responde 202.
- **Fin.** Al acabar el paso de datos se monta el JSON, se escribe la entrada y
  se responde 200. El `.job` se borra **después** de escribir la entrada.
- **ERROR, ABORTED, ARCHIVED, 404 o caducado.** Responde 502 y borra el `.job`;
  la siguiente petición puede lanzar otra cadena. Un paso caduca si sigue sin
  acabar pasados 7200 s + 10 min desde que se lanzó. Un paso COMPLETED se
  recoge aunque nadie preguntara en horas: GAVO guarda el resultado ~48 h.
- **Cliente.** `fetchGaia` reconoce el 202 y espera `reintentar_en` con un
  `setTimeout` cancelable. Luego vuelve a preguntar, sin gastar el único
  reintento de los fallos. Lo cancelado no se reintenta. En cada 202 avisa a
  quien espere la entrada (`alPendiente`), también a quien se une tarde. El
  simulador y el formulario pintan `textoPendiente(info)`: el paso, y que hay
  que dejar la página abierta, porque la cadena solo avanza mientras alguien
  vuelve a preguntar (no hay cron en el hosting).
- **Log.** Estado nuevo `pendiente` y etapa nueva `async` (la cadena: jobs,
  fases y resultados). `?stats=1` cuenta los pendientes.
- Abierto: la duración de cada paso está medida solo en M7 y con GAVO
  degradado. Hay que medir M6, M8 y la ventana de Baade antes de afinar
  `reintentar_en`.

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
