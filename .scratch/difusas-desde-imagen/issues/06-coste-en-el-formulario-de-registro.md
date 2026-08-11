# 06 — Coste en el generador de imagen del formulario de registro

**Type:** grilling
**Status:** closed (11-ago-2026)
**Blocked by:** 03

## Question

`resources/js/bitacora-gaia-render.js` es **compartido**: su `render(canvas, o)`
lo usa el generador de imagen del formulario de registro
(`registro/resources/js/bitacora-formulario.js:934`, *«Generar con el
simulador»*). Cuando se borraron las capas difusas hubo que corregir **dos**
puntos de llamada, no uno, y el segundo no estaba en la ficha original.

El riesgo 3 de las notas viejas ya avisaba de esto para los mapas all-sky: peso
descargado siempre, también en el formulario, en un simulador que presume de
funcionar en móvil. Con recortes en vivo el peso es menor pero la **latencia**
es nueva: una petición de red por cada imagen generada al registrar una
observación.

Cerrar:

- ¿La capa difusa entra también en el formulario, o solo en el simulador?
- Si entra: ¿bloquea la generación de la imagen hasta que llegue el recorte, o
  se genera sin difuso y ya está?
- Si no entra: ¿por qué bandera se distingue, y cómo se evita que la próxima
  sesión vuelva a olvidar el segundo punto de llamada?

## Answer

**Entra en los dos**, con interruptor en el simulador y encendida por defecto.

Motivo: justo en una observación de galaxia es donde la imagen generada hoy
miente más —el objeto que motivó la observación es lo único que no sale—. Y el
coste real es una petición por galaxia del campo, cacheada en servidor por la
ficha 11, que además suele ser **la misma** que el usuario acaba de mirar en el
simulador: casi siempre acierto de caché.

- **¿Bloquea la generación de la imagen?** No. La imagen se genera con lo que
  haya llegado; si el parche no está a tiempo o falla, sale sin difuso, que es
  la imagen de hoy. Nunca se queda esperando a un tercero.
- **Peso.** El riesgo 3 de las notas viejas (~2–4 MB descargados siempre) no
  aplica: no hay asset all-sky. Lo que se descarga es un parche por galaxia
  presente en el campo, y solo si hay alguna: en la inmensa mayoría de campos,
  cero bytes.
- **Los dos puntos de llamada.** El error de la vez anterior fue corregir uno y
  olvidar el otro (`bitacora-ocular.js` y `bitacora-formulario.js:934`). Esta vez
  la capa vive **dentro** del módulo compartido y se gobierna por una opción del
  render, no por código duplicado en cada llamador: el formulario la hereda sin
  tocar nada. El assert de los interruptores en `scripts/test_difuso.js` —que ya
  existía y comprobaba que apagan de verdad— cubre esa opción.
