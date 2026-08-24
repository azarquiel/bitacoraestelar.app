## Objetivo

Quiero que replantees la optimización de Gaia desde cero con una premisa fundamental:

**El simulador no debe diseñarse alrededor del catálogo actual de ~661 objetos.**

Ese catálogo es solo el contenido actual de la aplicación. En el futuro el simulador debe poder mostrar cualquier objeto del firmamento y, eventualmente, cualquier coordenada arbitraria. Por tanto, no quiero una solución optimizada para M7, M13, NGC, ni para ningún conjunto finito de objetos.

El problema que queremos resolver es:

> Diseñar una estrategia genérica y escalable para consultar y cachear Gaia DR3 para cualquier campo del firmamento, independientemente del telescopio, ocular, aumento u objeto que esté observando el usuario.

### Datos ya medidos

La consulta actual al TAP de VizieR tiene aproximadamente este coste para M7:

* Tiempo total: 8,95 s
* Conexión: 0,18 s
* TTFB: 8,03 s
* Transferencia: 0,74 s
* Respuesta: ~0,85 MB
* Parseo: 0,02 s
* El `ORDER BY` representa aproximadamente el 90 % del coste.

Por tanto:

**No quiero propuestas centradas en transporte, parseo, compresión o JavaScript. El cuello de botella demostrado es el trabajo que VizieR realiza para ordenar las estrellas antes de aplicar `TOP 40000`.**

### Restricciones

No modificar la física del render.

No modificar todavía la lógica de observación, crowding, PSF, magnitud límite ni glow.

La optimización debe estar en la adquisición/cacheado de Gaia y en el contrato entre cliente y proxy.

No asumir que el número de objetos futuros será pequeño. Debe funcionar aunque el simulador llegue a manejar miles, decenas de miles o cualquier número de objetos.

No asumir que existe un catálogo cerrado de objetos.

No utilizar el catálogo actual para justificar el tamaño, estructura o granularidad de la caché.

No aceptar una solución cuyo espacio de caché crezca proporcionalmente al número de combinaciones:

`objeto × telescopio × ocular × aumento`.

La unidad de caché debe ser independiente del instrumento.

---

# Hipótesis que quiero investigar

La dirección que considero más prometedora es desacoplar la unidad de caché del campo ocular.

En lugar de:

`una consulta Gaia = campo que ve este telescopio con este ocular`

estudiar:

`una entrada de caché = región fija del cielo + profundidad Gaia`

El cliente/proxy reconstruiría posteriormente el campo solicitado a partir de las regiones que lo cubren.

Puede utilizarse HEALPix, una rejilla angular u otra estructura espacial. **No doy por decidido HEALPix**: quiero que compares alternativas y elijas la que tenga mejores propiedades para este problema.

La propiedad que sí considero obligatoria es:

> La clave de caché no debe depender del telescopio, ocular, aumento ni objeto observado.

---

# Pero no quiero que implementes esto todavía

Antes de cambiar código, quiero un estudio cuantitativo que pueda falsar esta hipótesis.

Quiero que investigues al menos:

### 1. Granularidad espacial

Evalúa varias escalas de celda razonables.

Para cada una determina:

* área angular;
* número esperado de estrellas;
* comportamiento en campos densos y pobres;
* tamaño de respuesta;
* coste estimado de `ORDER BY`;
* número de celdas necesarias para reconstruir campos de diferentes tamaños.

No utilices únicamente M7/M13. Selecciona campos representativos de distintas densidades estelares y, si es posible, zonas cercanas al plano galáctico y zonas de alta latitud galáctica.

### 2. Profundidad

Analiza cómo debería definirse la profundidad de una entrada:

`(celda, profundidad)`

y si tiene sentido una profundidad fija global o una jerarquía de profundidades.

Quiero evitar crear una explosión combinatoria del tipo:

`celda × magnitud1 × magnitud2 × ...`

Si propones cuantización de magnitud, justifica sus escalones.

### 3. Reutilización

No midas solamente cuántas celdas necesita el catálogo actual.

Quiero saber qué propiedades tiene el sistema para **campos arbitrarios**:

* porcentaje de solapamiento entre campos;
* número de celdas necesarias para campos de distintos tamaños;
* reutilización esperada cuando diferentes observadores miran zonas próximas;
* comportamiento en un explorador libre del firmamento.

El objetivo es que la cardinalidad de la caché dependa fundamentalmente de:

`cielo cubierto × granularidad espacial × profundidad`

y no de:

`número de objetos × número de instrumentos`.

### 4. TOP 40000 y ORDER BY

Este es el punto crítico.

Quiero comprobar experimentalmente si dividir espacialmente el campo reduce realmente el coste del TAP.

Para varias escalas de celda mide:

* TTFB;
* tiempo total;
* número de filas;
* tamaño de respuesta;
* comportamiento cuando la consulta devuelve menos de 40.000 filas;
* comportamiento cuando alcanza `TOP 40000`.

La pregunta esencial es:

> ¿Existe una escala espacial a partir de la cual el conjunto que VizieR tiene que ordenar sea suficientemente pequeño como para que el `ORDER BY` deje de ser el cuello de botella?

No quiero asumir que la respuesta sea sí: quiero medirla.

### 5. Solapamiento y reconstrucción

Calcula cuántas celdas hacen falta para reconstruir campos de distintos tamaños.

Considera específicamente:

* campos pequeños;
* campos grandes;
* campos que atraviesan límites de celda;
* campos situados en zonas muy densas;
* campos situados en zonas pobres.

Analiza también si las celdas parcialmente cubiertas generan demasiado tráfico o CPU.

### 6. Caché

Diseña una estrategia de caché que pueda crecer de forma razonable.

Analiza:

* clave;
* TTL o ausencia de TTL;
* LRU;
* tamaño aproximado de cada entrada;
* reutilización;
* política de expulsión;
* posibilidad de precalentado futuro;
* posibilidad de almacenamiento persistente.

No quiero que el diseño dependa de que podamos precalentar todos los objetos existentes.

Debe ser válido para un firmamento abierto.

### 7. Caso frío

El caso frío es importante.

Un usuario puede solicitar una coordenada que nunca haya sido consultada.

Quiero comparar:

**A. Diseño actual**

`campo ocular → consulta TAP → respuesta`

frente a

**B. Diseño espacial**

`campo ocular → identificar celdas → consultar celdas inexistentes → unir → recortar`

Quiero saber cuál es el coste real del primer acceso y si el diseño espacial empeora el peor caso.

---

# Una cuestión especialmente importante

No quiero que presupongas que dividir en muchas consultas es necesariamente mejor.

VizieR serializa las consultas por IP: ya hemos comprobado que lanzar varias consultas simultáneamente no elimina el coste.

Por tanto, compara explícitamente:

1. una consulta grande;
2. varias consultas pequeñas secuenciales;
3. una consulta espacialmente más eficiente, si el TAP permite expresarla;
4. cualquier otra estrategia que reduzca el trabajo del `ORDER BY`.

La métrica principal debe ser:

**trabajo total que hacemos pagar al TAP para obtener los datos necesarios.**

---

# Posible alternativa que también debes investigar

No te limites al teselado.

Quiero que consideres si existe una solución mejor basada en:

* consultas espaciales;
* índices disponibles en Gaia/VizieR;
* particionado espacial;
* `COUNT` previo sin `ORDER BY`;
* consultas por magnitud sin ordenar;
* paginación;
* diferentes formas de expresar el límite;
* tablas o servicios Gaia alternativos;
* precálculo;
* almacenamiento local de regiones;
* o cualquier mecanismo que evite ordenar un conjunto enorme cuando solo necesitamos las estrellas observables.

Si una solución mejor elimina la necesidad del teselado, prefiero esa solución.

---

# Criterio de éxito

No quiero como resultado "podríamos usar HEALPix".

Quiero una conclusión cuantitativa:

> **Para cualquier campo arbitrario del firmamento, esta estrategia reduce X el coste de consulta / Y el tamaño medio de respuesta / Z el coste de construcción de caché, manteniendo intacta la semántica del render.**

O, si los datos no lo respaldan:

> **La estrategia de caché espacial no merece la pena y debemos mantener el diseño actual.**

Ambas conclusiones son válidas.

---

# Entregable

Antes de modificar código, entrega:

1. diagnóstico del problema actual;
2. alternativas consideradas;
3. experimentos necesarios;
4. resultados cuantitativos;
5. propuesta arquitectónica únicamente si los resultados la justifican;
6. impacto sobre el contrato proxy-cliente;
7. riesgos;
8. estrategia de migración;
9. criterio claro para decidir si implementar o descartar.

**No implementes nada todavía.**

La prioridad es encontrar una arquitectura que siga siendo válida si mañana el simulador pasa de 661 objetos a 6.000, 60.000 o a coordenadas arbitrarias de todo el firmamento.

El objetivo no es acelerar el catálogo actual.

**El objetivo es diseñar correctamente la capa de adquisición y caché de Gaia para un simulador de cielo abierto.**
