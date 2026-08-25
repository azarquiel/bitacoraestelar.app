# 0003 · El dialecto OAL tiene un solo escritor

Fecha: 2026-08-25
Estado: aceptado

## Contexto

Exportar necesita escribir OAL. La plantilla ya lo escribe: `xmlDe(estado)`,
dentro del bloque `<script id="motor">` de `registro/plantilla-oal.html`.

Escribir un segundo escritor en PHP es lo convencional y es el camino a un fallo
que este repositorio ya sufrió. `registro/CONTEXT.md` lo cuenta en la
astrometría: hubo dos copias byte a byte, divergieron —el formulario refractaba
Sol y Luna y la ficha no— y abrir una ficha cambiaba el dato guardado. La regla
que quedó fue «fuente única, garantizado estructuralmente, no por copiar y
pegar».

Aquí tiene más filo, porque el dialecto no es estable: el orden de la secuencia
del esquema, el `rating` obligatorio, dónde vive el SQM (ADR 0001) y qué espacio
de nombres se emite son reglas que van a cambiar. Con dos escritores en dos
idiomas, cambiar una y olvidar la otra no rompe nada visible: rompe el ciclo
exportar → reimportar en silencio, que es el peor modo de fallo posible.

## Decisión

**El motor escribe todo el OAL que salga del proyecto.** El servidor no compone
XML: un endpoint devuelve el **estado en JSON** —la misma forma que la plantilla
ya maneja— y `xmlDe()` lo convierte en XML en el navegador.

El motor sigue viviendo en `plantilla-oal.html`, que es la fuente. Un script lo
extrae a `registro/resources/js/bitacora-oal-motor.js` para que el sitio pueda
servirlo, igual que `scripts/generar_ejemplos_oal.js` ya lo extrae para generar
los ejemplos. `scripts/test_oal_plantilla.js` afirma que el extraído y el
incrustado son idénticos.

## Alternativas descartadas

- **Exportador en PHP.** Dos escritores del mismo dialecto, en dos idiomas, sin
  nada que avise cuando solo se actualiza uno.
- **PHP para el volcado y motor para la salida suelta.** Dos escritores *y* dos
  caminos.
- **El `.js` como fuente, incrustado en la plantilla al generarla.** Más limpio
  en el papel, pero convierte el fichero que se reparte a los compañeros en un
  artefacto y depende de recordar no editar nunca el HTML: la clase de regla que
  se olvida.
- **Dos copias con un test que falle si difieren.** El test como única red, sin
  nada que las mantenga iguales.

## Consecuencias

- **Probar la exportación se reduce a probar la consulta.** El escritor ya lo
  cubre `test_oal_plantilla.js`.
- **El ciclo completo se puede verificar sin WordPress**: estado → `xmlDe` →
  `leer` → estado, todo en Node.
- **El panel del escritorio también exporta desde el navegador.** Es una página,
  así que no cuesta nada; pero significa que no hay exportación desde PHP puro
  —ni desde un cron ni desde WP-CLI— hasta que alguien la pida.
- **La regla de «sin bundlers» aguanta**: un script de extracción, ningún
  empaquetador, ningún paso de compilación para el fichero que se reparte.
