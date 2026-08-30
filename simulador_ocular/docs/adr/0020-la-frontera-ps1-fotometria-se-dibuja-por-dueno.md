# La frontera entre PS1 y fotometría se dibuja por dueño, no por ancho de interfaz

## Contexto

`resources/js/bitacora-gaia-render.js` tiene 4.468 líneas y exporta 111 nombres.
Una revisión de arquitectura los contó y propuso partir el módulo con este argumento:
sólo 26 de esos exports los usa producción, 73 existen únicamente para la batería de
`scripts/`, y 12 no los usa nadie. «Interfaz casi tan ancha como la implementación.»

La cuenta es correcta y el argumento no. En JS sin empaquetador no hay otra forma de que
node vea una función interna, y la ADR 0008 **obliga** a exponer desde producción lo que un
arnés necesita, en vez de que el arnés lo recalcule. Los 73 exports de test no son
disciplina perdida: son la ADR 0008 cumplida 73 veces. Partir el fichero no baja ese número,
lo reparte: tras el corte, `GaiaRender` se queda con 63 exports, de los que 33 siguen siendo
sólo de tests.

Lo que sí es real es otra cosa que la revisión no midió. Las 58 funciones `ps1*` (:2175-3902)
llaman a 11 símbolos de la cadena fotométrica del padre —`FOT`, `ctxFotometrico`,
`valorDeFlujo`, `flujoDeValor`, `flujoDePlaca`, `pintarFot`, `realzarPerceptual`,
`difusoMaskDe`, `radioImagenEstelar`, `dibujar`, `nueva`— y en sentido contrario sólo hay dos
llamadas, las dos dentro de `vistaGaia`: `ps1MagConsulta` (:4206) y `ps1CapaGalaxias` (:4255).
Dos leyes con dueños distintos, sin nada que impida a una tocar las tripas de la otra.

## Decisión

El bloque PS1 sale a `resources/js/bitacora-ps1.js`, global `window.BitacoraPS1`. La frontera
la justifica el **dueño de la ley**, no el ancho de la interfaz:

- Los prefijos `ps1*` no se renombran. La constante de calibración pasa de `R.ps1` a
  `BitacoraPS1.cfg`.
- **El ciclo se acepta, en tiempo de llamada.** PS1 lee `window.BitacoraGaiaRender.*` cuando lo
  necesita y `vistaGaia` lee `window.BitacoraPS1.*`, con la forma que ya usa
  `bitacora-cumulos.js:92-93`. No hay ciclo de carga; sí de llamada.
- **Un guardián en el punto de uso**, con el mensaje de `bitacora-cumulos.js:93`: sin
  `BitacoraPS1` cargado, `ps1MagConsulta` se llama antes que nada y la vista Gaia entera cae al
  respaldo DSS — un fallo disfrazado de modo de funcionamiento normal.
- **Los 52 ficheros de `scripts/` que tocan nombres `ps1*` migran en el mismo commit.** Sin
  puente de compatibilidad.
- El número de exports deja de ser una métrica de salud de este módulo.

## Motivo

Sin fichero propio no hay dueño: cualquiera de las 4.468 líneas puede llamar a cualquier otra,
y las dos leyes llevan meses tocándose por dentro sin que nadie lo decida. Con dos ficheros,
cambiar la fusión imagen/modelo de PS1 no roza la cadena fotométrica, y el `grep` responde a
quién pertenece cada cosa.

Las tres alternativas se descartaron por lo que cuestan:

- **Inyectar los 11 símbolos como fachada** compra un grafo acíclico creando interfaz nueva
  justo cuando el objetivo declarado era tener menos nombres públicos.
- **Poner PS1 encima** (que `ps1CapaGalaxias` salga de `vistaGaia` hacia el llamador) también
  rompe el ciclo, pero deshace el seam de PR #148: el orden del pipeline volvería a vivir
  duplicado en `renderGaia2D` y en `render()`.
- **Un puente de compatibilidad** que dejara los 47 nombres en `GaiaRender` es exactamente la
  deuda que este cambio arregla: nombres públicos que nadie decidió publicar y que sobreviven
  porque quitarlos cuesta una tarde.

## Consecuencias

- El ciclo sigue existiendo. El orden de los `<script>` pasa a importar, y el guardián es lo
  único que lo dice en voz alta.
- Un fichero `.js` nuevo es un paso manual nuevo de FTP a `/wp-content/uploads/bitacora/`.
  `scripts/dev_servidor_ocular.php` sirve cualquier fichero del repo por regex, así que en
  local no se nota que falta.
- El nombre es el del proveedor y la frontera es la de la ley. Mientras Pan-STARRS 1 sea el
  único proveedor de la capa difusa desde imagen, el nombre no miente; el día que entre un
  segundo sondeo habrá que renombrar un fichero de ~1.700 líneas, que es barato comparado con
  hacerlo dentro del monolito.
- La **cadena de la placa** (DSS/HiPS) se queda al otro lado del muro y PS1 la sigue llamando
  (`flujoDePlaca`, :3110). Son dos tuberías de imagen de sondeo separadas por esta frontera; si
  algún día molesta, es otro corte y otra decisión.

## Regla

En este módulo, «export que sólo usan los tests» no es un defecto que haya que corregir: es el
seam que node permite, y la ADR 0008 lo exige. Una propuesta de partir un módulo del simulador
se justifica nombrando **qué dos leyes separa y quién es el dueño de cada una**. Contar
exports no vale como argumento.
