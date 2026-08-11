# 09 — La proyección del render no es TAN, y la imagen sí

**Type:** grilling
**Status:** closed (11-ago-2026) — sin tocar la proyección
**Blocked by:** —

## Question

Hallazgo de la ficha 02, medido en `bench/bench_proyeccion.js`. `dibujar()`
coloca las estrellas de Gaia con una proyección **lineal**
(`resources/js/bitacora-gaia-render.js:1286`):

```js
var x = SIZE / 2 - deltaRA(ra) * cos0 * escv;
```

`hips2fits` entrega **TAN** (`CTYPE1 = 'RA---TAN'`, confirmado en la ficha 01).
Son dos rejillas distintas. Desvío máximo en la esquina del lienzo, en píxeles:

| dec0 | 10′ | 30′ | 60′ | 120′ |
|---|---|---|---|---|
| 0° | 0,00 | 0,01 | 0,02 | 0,10 |
| 40° | 0,49 | 1,47 | 2,95 | 5,90 |
| 70° | 1,61 | 4,83 | 9,66 | 19,36 |

Cerca del ecuador no importa. A δ = 70° y 30′ de campo son casi 5 px, y la
ficha 02 midió que 0,5 px de desalineación ya deja un 28 % de residuo en una
resta de PSF. O sea: **a declinación alta, hoy, el difuso y las estrellas no
casan.** Y no es solo la resta: el difuso entero saldría corrido respecto de las
estrellas que se pintan encima, que es un error que se ve.

Ojo, esto **no es un fallo de hoy**: sin capa difusa, una proyección lineal es
perfectamente válida —no hay nada con qué desalinearse—. Solo se vuelve un
problema al mezclar rejillas.

Cerrar, eligiendo una:

- **Pasar `dibujar()` a TAN.** Es lo correcto, y son pocas líneas. Pero toca el
  render de estrellas que ya está en producción y **es compartido con el
  formulario de registro** (ficha 06): cambia la posición de cada estrella en
  cada imagen ya generada. ¿Se acepta ese cambio en la vista que hoy funciona?
- **Deformar la imagen a la rejilla lineal** al pintarla. Más caro por fotograma
  y encima al revés: adapta lo correcto a lo aproximado.
- **Limitar el difuso a campos pequeños o a declinaciones bajas**, donde el
  desvío quede por debajo de un umbral dicho (¿0,5 px? ¿1 px?). Es la vía
  perezosa, pero deja el simulador con un difuso que aparece y desaparece según
  a dónde se apunte, que es peor de explicar que arreglarlo.

La respuesta dice **cuál**, y si es la primera, si el cambio de proyección va en
un commit aparte y antes que el difuso —que es lo suyo: es un arreglo con
sentido propio, verificable solo, y así el difuso no carga con su regresión.

## Answer

**Ninguna de las tres: la pregunta se disolvió con el parche por objeto.** La
tabla de arriba mide el desvío en la **esquina de un lienzo de campo entero**.
Con la capa hecha de parches de 6′ (ficha 10) esa esquina ya no existe, y quedan
dos cosas, ambas pequeñas:

- **Dentro del parche**, la diferencia TAN–lineal va como θ²/3: para 10′ de
  radio son ~3·10⁻⁶ en escala, milisegundos de arco. Invisible.
- **Entre el parche y el render**, el punto de tangencia no coincide —el del
  parche es la galaxia, el del render el centro del campo—, y la diferencia es
  un **giro** del marco local ≈ Δα·sin δ. Peor caso realista (galaxia a 15′ del
  centro, δ = 70°): ~0,7°, que en el borde de un parche de 6′ son **~1 px** a la
  escala del render.

Se pega **directo**: escala constante desde `CDELT`, centro colocado por la misma
proyección que ya sitúa las estrellas, sin giro y sin remuestreo. Un difuso de
baja frecuencia, con el borde perdiéndose en el umbral de visibilidad, no enseña
un error de 1 px; y las estrellas —que sí son puntuales, donde el desvío se
vería— siguen colocadas como siempre, así que la galaxia no se desalinea
respecto de ellas más que eso.

**`dibujar()` no se toca**, y con ello se evita la regresión que preocupaba a
esta ficha: cambiar la proyección movía cada estrella de cada imagen ya generada
por el formulario de registro.

Si algún día vuelve el difuso **de campo entero** (nebulosidad, telón), esta
ficha revive tal cual: entonces la tabla sí manda.

`bench/bench_proyeccion.js` se queda: es el que produjo la tabla y el que habría
que volver a correr en ese caso.
