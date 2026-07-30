# 02 — Eliminar las capas difusas (telón + halo no resuelto) del render

**What to build:** la vista Canvas-2D de Gaia del simulador deja de mostrar
el telón difuso y el halo no resuelto de los núcleos densos (cúmulos
globulares, etc.); el fondo cae al relleno plano de nivel de cielo que ya
existe como respaldo. El resultado no convenció al usuario tal y como está
hoy — se rehará más adelante desde cero, así que esta ficha SOLO quita lo
que hay, no propone un reemplazo.

**Blocked by:** Ninguno — puede empezar ya.

**Status:** done

- [x] Se borra la función `capasDifusas` (y las funciones que solo ella usa,
      p.ej. el telón difuso y el halo no resuelto) del módulo compartido de
      render — no se deja detrás de una bandera ni comentada, se quita.
      Comprobado que no la usa ningún otro consumidor del módulo compartido
      además del simulador (solo hay tres ficheros en todo el repo que
      mencionan estos nombres: el módulo de render, su llamador en el
      simulador, y su test).
- [x] Se quita la llamada a `capasDifusas` desde el render del simulador; el
      fondo usa el relleno plano de nivel de cielo (el mismo que ya se usa
      hoy cuando `capasDifusas` no está disponible).
- [x] Se retira el test que ejercitaba `capasDifusas` directamente, ya que
      prueba una función que deja de existir.
- [x] La suite restante de tests (`scripts/test_*.js`) sigue en verde.

**Cambio de alcance, confirmado por el usuario ("b"):** al leer el cuerpo de
`capasDifusas` antes de borrar apareció que también componía **galaxias**
(`capaGalaxias`) y **nebulosas** (la misma función con el catálogo de
`window.BITACORA_NEBULOSAS`), no solo el telón/halo de saturación que motivó
el pedido. Se preguntó A (borrar solo telón/halo, conservar galaxias y
nebulosas) vs B (borrar la función entera). El usuario eligió B.

**Resumen de lo hecho:**
- `resources/js/bitacora-gaia-render.js`: borrada toda la subsección de
  capas difusas (telón, halo de King, galaxias vía Sérsic, nebulosas —
  reutilizaba `capaGalaxias`) y sus 19 exports en `window.BitacoraGaiaRender`.
  Se encontró un SEGUNDO punto de llamada no cubierto por el ticket original:
  la propia función `render(canvas, o)` de este módulo (la usa el generador
  de imagen del formulario de registro, `registro/resources/js/
  bitacora-formulario.js:934`) también llamaba a `capasDifusas`. Se corrigió
  igual: fondo difuso plano (`new Float32Array(SIZE*SIZE)`). De paso se
  quitó un campo `telon: !!telon` en el `return` de `render()` que
  referenciaba una variable fuera de alcance (bug preexistente, nunca
  disparado porque ningún consumidor externo lee ese campo del resultado).
  También se reescribió un comentario en `GAIA_RADIO_MAX` que mencionaba
  `telonDifuso` como mecanismo de aviso de corte de catálogo (esa función ya
  no existe; el aviso real que sigue en pie vive en `bitacora-ocular.js`, es
  independiente).
- `simulador_ocular/resources/js/bitacora-ocular.js`: quitada la llamada a
  `capasDifusas`, fondo plano. Se borraron también `capasActivas()` y
  `sincronizarCapas()` (quedaban muertas sin la barra de casillas) y los
  listeners de las casillas `sim-capa-*`.
- `simulador_ocular/ocular-wordpress.html`: quitada la barra de casillas
  "Capas difusas" (Vía Láctea difusa / Halo de cúmulos / Galaxias /
  Nebulosas) del bloque `#sim-capas`; se conserva el selector "Origen". Las
  casillas ya no controlaban nada, así que dejarlas habría sido una UI
  muerta y engañosa.
- `scripts/test_difuso.js`: quitadas las secciones 5–9 (telón, halo de
  King) y 12, 15 (galaxias, nebulosas, interruptores de `capasDifusas`).
  Se conservan las secciones de la cadena fotométrica compartida (pupila de
  salida, transmisión, magnitud límite, curva de tono de estrellas, rodilla
  del realce de detalle, realce perceptual, apertura/umbral de contraste),
  que no dependen de las capas difusas.
- Suite completa (`scripts/test_*.js`, 16 ficheros) en verde tras el cambio.
