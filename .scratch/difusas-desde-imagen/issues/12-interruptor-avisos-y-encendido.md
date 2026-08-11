# 12 — Interruptor, avisos y encendido por defecto (fase 3)

**Type:** implementation
**Status:** open
**Blocked by:** 10, 11

## Question

Rematar la capa: hacerla gobernable, explicar cuándo no está, y encenderla por
defecto en el simulador y en el formulario de registro.

## Spec

### Interruptor

- Una casilla en el simulador, **encendida por defecto** al terminar esta fase
  (durante las fases 1 y 2 va apagada). La barra de casillas «Capas difusas» se
  retiró en `d0a3641`; vuelve con **una sola** casilla, no la barra entera.
- Se gobierna por una **opción del render**, dentro del módulo compartido, no
  por código duplicado en cada llamador. Los dos puntos de llamada son
  `bitacora-ocular.js` y `registro/resources/js/bitacora-formulario.js:934`, y el
  error de la vez anterior fue tocar uno y olvidar el otro.
- El assert de los interruptores que ya vive en `scripts/test_difuso.js` —que
  apaguen de verdad— cubre esta opción.

### Formulario de registro

Hereda la capa **encendida**, sin casilla propia (ficha 06). Nunca bloquea la
generación de la imagen: si el parche no llega o falla, la imagen sale sin
difuso, que es la de hoy.

### Avisos

Por `$('sim-aviso')`, y **solo cuando el objeto apuntado** es una galaxia que se
queda sin parche (las compañeras del campo, en silencio):

- δ < −30°: *«sin imagen de cartografiado: PanSTARRS no cubre por debajo de −30°
  de declinación»*
- servicio caído: *«el servicio de imágenes no responde; se muestra el campo sin
  la galaxia»*

Objeto fuera del RC3: sin aviso, porque no hay nada que prometer.

La causa importa porque cambia lo que el usuario puede hacer: por el sur no hay
nada que esperar; por caída, sí.

## Answer

_(pendiente)_
