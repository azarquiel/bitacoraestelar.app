# Mapa — Capas difusas desde imagen real en el Canvas-2D de Gaia

**Label:** `wayfinder:map`

## Destination

Una spec confirmada de cómo la vista **Canvas-2D de Gaia** obtiene su componente
difusa (galaxias y nebulosas) de **imágenes reales de cartografiado**, entrando
por la cadena fotométrica que ya existe (`ctxFotometrico` → `Fobj` → `pintarFot`).
Lista para implementar, no implementada: el mapa acaba cuando no quede nada que
decidir.

## Notes

- **Dominio:** simulador de ocular astronómico. JS de navegador + proxies PHP.
  Sin build, sin framework de test (`scripts/test_*.js` con asserts a pelo).
- **Skills a consultar en cada sesión:** `/grilling`, `/domain-modeling`,
  `/prototype` para las fichas de tipo prototipo.
- **Idioma:** todo el repo escribe en español, comentarios incluidos.

### Punto de partida (no volver a investigar)

- **Ya se intentó y se borró.** Commits `b744d65`…`afd4474` construyeron galaxias
  por Sérsic sintético (bulbo, banda de polvo, disco de canto), nebulosas NGC/IC
  por la misma tubería, telón de conteos y halo de King. `d0a3641` (31-jul-2026)
  borró `capasDifusas` entera: *"el resultado no convenció"*.
  **Por qué no convenció** (dicho por el usuario, 07-ago-2026): el Sérsic parecía
  falso, había errores de bulto —galaxias con formas erróneas— y el resultado era
  una mancha uniforme. Decisión suya: **reconstruir de cero**, no revertir.
  Código viejo recuperable en `d0a3641^` si alguna vez hace falta mirarlo.
- **El árbol de decisiones viejo** vive en
  `simulador_ocular/notas-render-difuso-gaia.md`. Sus decisiones 3, 5, 7, 13, 17,
  21 caen con este cambio de rumbo; sus justificaciones de 6 (el cielo se suma
  **detrás** del polvo, no delante) y del **signo de la atenuación**
  (`−2,5·log10(B_rel)`, la spec traía `+`) siguen en pie.
- **La infraestructura de imagen ya está en producción.** `bitacora-ocular.js:661`
  pide recortes a `hips2fits` del CDS (`CDS/P/PanSTARRS/DR1/color-z-zg-g`,
  proyección TAN, `format=jpg`, `width=height=PROC`), sin proxy propio.
  `flujoDePlaca(v, esHips)` ya convierte luma de placa a `Fobj` con una rama de
  gamma para PanSTARRS, y `repararNucleos` ya arregla el núcleo hundido de sus
  mosaicos. **La §5 de la spec (biblioteca de plantillas FITS + StarNet++) no
  hace falta: el campo entero llega en una petición.**
- **La cadena fotométrica sobrevivió al borrado**: `ctxFotometrico`, `pintarFot`,
  `valorDeFlujo`/`flujoDeValor`, `visibilidadDifusa`, `realzarPerceptual`,
  `adaptacionLocal` siguen en `resources/js/bitacora-gaia-render.js`. La pupila y
  la transmisión se aplican **una sola vez**, ahí.
- **El módulo de render es compartido** con el generador de imagen del formulario
  de registro (`registro/resources/js/bitacora-formulario.js:934`). Todo lo que se
  añada al render se lo come también el formulario.

## Decisions so far

<!-- una línea por ficha cerrada; el detalle vive en la ficha -->

_(ninguna todavía)_

## Not yet specified

- **Caché y rendimiento de los recortes.** Hoy `hips2fits` se pide directo desde
  el navegador. Existe `bitacora-cache-lru.php`, compartido por los dos proxies,
  por si hiciera falta uno tercero. Depende de qué formato salga de la ficha 03.
- **Comprobación.** `scripts/test_difuso.js` sigue vivo con las secciones de la
  cadena fotométrica (las de capas difusas se borraron en `d0a3641`). Qué assert
  guarda este camino se verá cuando la tubería esté decidida.
- **UI.** La barra de casillas «Capas difusas» se retiró en `d0a3641`. Si vuelve
  un interruptor, y con qué etiqueta, depende de 05 y 06.
- **Color del difuso.** El Canvas-2D pinta las estrellas con color de B−P; el
  HiPS que se pide hoy es `color-z-zg-g`. Qué color lleva la componente difusa
  queda por decidir, y depende de si 03 elige banda única o color.
- **Interacción con el realce perceptual.** `GAMMA_PERCEPTUAL`,
  `visibilidadDifusa` y `realzarPerceptual` se calibraron contra difuso
  *sintético*. Con difuso de imagen real puede sobrar o cambiar de valor.

## Out of scope

- **Telón difuso de conteos de Gaia y halo de King de globulares** — borrados en
  `d0a3641` junto a lo demás, pero no son imágenes de cartografiado y el encargo
  nombra galaxias y nebulosas. Vuelven, si vuelven, como otro esfuerzo.
- **Reconstrucción de núcleos saturados por perfil de Sérsic (§3 entera de la
  spec)** — es justo la vía que se descarta. `repararNucleos` ya trata el núcleo
  hundido de los mosaicos de PanSTARRS. Solo volvería si la ficha 03 eligiera
  FITS lineal *y* la saturación apareciera de verdad; entonces sería esfuerzo
  nuevo, no una reanudación.
- **Mapas all-sky de Hα (Finkbeiner) y de polvo (SFD / Bayestar19)** — descartados
  el 29-jul-2026 y las razones siguen en pie: a 6′/px dan un degradado y no
  estructura, el ojo es casi ciego a 656 nm, y son ~2–4 MB descargados siempre,
  también en el formulario de registro.
- **Biblioteca de plantillas FITS por objeto + StarNet++ (§4.2 y §5 de la spec)**
  — el campo entero llega en una petición a `hips2fits`; una plantilla por objeto
  añade preproceso, assets y un catálogo que hay que mantener, a cambio de nada.
- **Extinción aplicada a las estrellas de Gaia (§7 de la spec)** — el catálogo ya
  viene con el agujero: Gaia no detecta lo que el polvo extingue, así que la
  máscara contaría el polvo dos veces.
