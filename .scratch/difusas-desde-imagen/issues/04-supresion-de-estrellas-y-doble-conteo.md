# 04 — Supresión de estrellas y doble conteo con la capa de Gaia

**Type:** grilling
**Status:** closed (12-ago-2026): la revisión se resolvió en **máscara total**
**Blocked by:** 03, 09

## Question

Con la vía de formato ya elegida (03), el registro entre rejillas resuelto (09)
y las opciones **ya medidas** en la 02, decidir **cómo queda solo el difuso**.

La 02 dejó el método casi elegido: máscara en las posiciones del catálogo +
relleno desde el entorno (1,3 ms, núcleo al 100 %, estrella al 1 %), con la
apertura morfológica 7×7 sobre imagen estirada como alternativa viable (98 % del
flujo, estrella a 0 %). Lo que queda no es *qué* método, es lo demás:

- ¿Se queda la máscara sola, o hace falta la apertura como red de seguridad
  donde el catálogo no llega?
- ¿Hasta qué magnitud se restan estrellas? Gaia trae muchas más de las que el
  ocular llega a ver; la imagen del cartografiado es más profunda que el ocular
  simulado. Las estrellas de la placa **por debajo** de la magnitud límite del
  instrumento no son doble conteo: son luz integrada legítima del fondo, y
  quitarlas empobrecería el campo.
- ¿Qué se hace donde Gaia está incompleto por aglomeración (núcleos de
  globulares)? Ahí la resta por catálogo deja las estrellas que el catálogo no
  trae, y el filtro morfológico se come el cúmulo entero.
- ¿Se hace en vivo por fotograma, o una vez por campo y se cachea?
- Comprobación que guarda esto: la suma de flujo de la capa difusa no puede
  crecer al bajar la magnitud límite del instrumento.

## Answer

**Máscara en las posiciones de Gaia, con el corte de magnitud que el render está
usando.** Es el método ganador de la 02 más un filtro en la lista de posiciones,
que ya viene con la consulta: coste cero sobre la 02.

- **¿Hasta qué magnitud?** Hasta `magLimite` del equipo simulado, no más. Lo que
  PS1 ve por debajo (llega a g ≈ 23) y el ocular no resuelve **no es doble
  conteo**: es luz difusa no resuelta, que es exactamente lo que se está
  intentando pintar. Quitarla empobrecería el campo por celo.
- **¿Máscara sola o con apertura de red de seguridad?** Sola. La apertura
  morfológica sobre imagen lineal se lleva medio objeto (ficha 02), y el formato
  elegido en la 03 es lineal.
- **Núcleos de globulares.** Ya no aplica: el alcance quedó en **galaxias**, y
  los globulares están fuera (ficha 08 y mapa).
- **¿En vivo o cacheado?** El **parche se cachea en crudo**, sin máscara: no
  depende del ocular. La **máscara se aplica al pintar**, porque su corte de
  magnitud sí cambia con el equipo y la pupila. Son 1,3 ms en 720².
- **Comprobación**, la que ya pedía la ficha: la suma de flujo de la capa difusa
  no puede crecer al bajar la magnitud límite del instrumento. Va a
  `scripts/test_difuso.js`.

### Revisión pendiente (decisión del usuario, 11-ago-2026)

> «si se ven estrellas de más, pasaremos a máscara total; lo decidiré tras ver
> el resultado»

O sea: esto se cierra **provisionalmente**. Si en la fase 1 de la ficha 10 el
parche sale granulado de estrellas débiles de PS1, la alternativa es quitar todo
lo puntiforme, sabiendo lo que cuesta sobre imagen lineal (ficha 02: medio
objeto con apertura 7×7) — y entonces habría que buscar otro método, no
simplemente subir el corte.

### Resuelta (12-ago-2026): máscara total, por catálogo

> «sí que se ven estrellas de más, hay que eliminarlas, ensucia la imagen»

Visto el resultado en el simulador, el argumento de «luz difusa no resuelta» no
se sostiene en la práctica: lo que PS1 registra entre la magnitud límite del
equipo y la profundidad de Gaia **se ve como estrellas**, no como fondo, y
ensucia más de lo que aporta. Cambios:

- **`ps1EstrellasEnPixeles` ya no filtra por `mlim`**: se enmascaran todas las
  estrellas de la muestra de Gaia del campo. La muestra la fija
  `magConsultaGaia()` (límite teórico del equipo + cola de glow, tope 20).
- **`ps1RadioMascaraAs(g)` pierde el parámetro `mlim`**: el radio crece con lo
  brillante que sea la estrella contra una referencia fija
  (`PS1.mascaraMagRef = 20`), entre `seeingAs` (1,1″) y `mascaraMaxAs` (8″).
  Antes se medía contra el equipo, lo que hacía que el mismo parche se limpiara
  distinto según el ocular.
- Consecuencia: **`ps1ParcheDeGalaxia(gal, estrellas)` ya no recibe `mlim`** y la
  limpieza es independiente del equipo. (Cachear el parche ya limpio es ahora
  posible; no se hace: YAGNI hasta que se note.)

**No es máscara morfológica.** Sigue siendo por catálogo, así que no se lleva
medio objeto (el riesgo de la ficha 02) y el núcleo sigue protegido por
`PS1.nucleoPx`.

**Lo que queda fuera:** lo que PS1 ve por debajo de la profundidad de Gaia
(llega a g ≈ 23) sigue en el parche. Si eso todavía granula, el siguiente paso
sería una consulta aparte a profundidad fija para la máscara, como hace el halo
de globulares — más tráfico, y solo si se ve.

La comprobación de la ficha (el flujo no crece al bajar `mlim`) ya no aplica: el
flujo del parche no depende de `mlim`. En su sitio, `scripts/test_difuso.js`
comprueba que una estrella más débil que cualquier equipo también se enmascara,
que más estrellas limpian más parche, que el radio crece con el brillo y tiene
suelo y tope, y que la luz total no se mueve ni un 2 %.
