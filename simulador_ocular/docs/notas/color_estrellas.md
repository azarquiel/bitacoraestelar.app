# Color de las estrellas — principios

## 1. Fuente única

El color de una estrella se decide en un solo módulo. Simulador de oculares, mapa (vecindario solar), catálogo de vecindario y formulario de registro consumen el mismo módulo desde la misma URL. Ninguna vista define color propio.

- `resources/js/bitacora-gaia-color.js` → `window.BitacoraGaiaColor`
- Consumidores: `resources/js/bitacora-gaia-render.js`, `mapa/js/vecindario-solar.js`, `mapa/js/via-lactea-vecindario-catalogo.js`

## 2. El color lo fija el índice BP–RP

Única variable de entrada del color: el índice fotométrico BP–RP de Gaia. Sin temperatura, sin tipo espectral, sin brillo.

- `BitacoraGaiaColor.colorPorBpRp(bprp, sat)`

## 3. Los nodos de la tabla son códigos de color físicos

La correspondencia BP–RP → RGB es una tabla interpolada linealmente por tramos. Sus nodos proceden de Harre & Heller (2021), *Digital color codes of stars* (spec2col): espectro real → funciones CIE del ojo → XYZ → sRGB.

- Tabla `GAIA_COLOR` en `bitacora-gaia-color.js`

## 4. El extremo rojo se ancla a un espectro de carbono

El tramo frío (BP–RP ≳ 2,7) se ancla a un espectro de estrella de carbono (cuerpo negro × bandas C₂ Swan + CN), más rojo que un cuerpo negro de su temperatura. Impide que todo lo frío sature en el mismo naranja.

## 5. Sin fotometría BP/RP se pinta neutro

Estrella sin BP–RP: se le asigna un índice neutro (amarillo), no blanco ni un color arbitrario.

- `colorPorBpRp(null, …)` en `bitacora-gaia-color.js`

## 6. El tipo espectral solo estima el BP–RP, nunca el color

Cuando el catálogo trae tipo espectral pero no fotometría de Gaia (componentes de dobles del WDS), se estima el BP–RP y se pregunta al mismo modelo de color: una K3 se pinta igual que una estrella de Gaia con ese BP–RP. Sin tipo espectral, blanca.

La estimación usa anclas de secuencia principal por clase y subclase, más un enrojecimiento por clase de luminosidad aplicado solo de G en adelante.

- `BitacoraGaiaColor.bpRpPorTipo(tipo)`, consumido en `parDoble()` de `bitacora-gaia-render.js`

## 7. Gamma sRGB parcial

Los códigos del paper son RGB lineal. Se codifica a gamma sRGB del azul al blanco, con desvanecimiento en una banda de BP–RP, dejando crudo el extremo rojo para conservar el rojo del carbono. Existe opción de gamma en toda la tabla.

- `aplicarGamma()`, `sRGBenc()`, `config.gammaGlobal` / `gammaHasta` / `gammaDesvanece`

## 8. La saturación depende del brillo absoluto de la estrella (Purkinje)

La saturación no es constante. Escala con la misma fracción de flujo absoluto que gobierna el halo y la aureola: estrella brillante → saturación completa; estrella al límite de detección → neutro, deslavada hacia blanco. Modela que los conos necesitan señal mínima para dar color.

- `colorEstrella()` y `fraccionFlujo()` en `bitacora-gaia-render.js`
- `config.saturacion` y `saturar()` en `bitacora-gaia-color.js`

## 9. El umbral al que aparece el color es relativo al equipo

El color aparece por debajo del límite de detección de ese equipo y ese cielo, no de una magnitud fija. Por encima de ese umbral la estrella se pinta blanca.

- `magColorEfectivo = mlim − CFG.margenColorMag` en `bitacora-gaia-render.js`

## 10. El objeto de carbono se realza sobre su BP–RP

Para la estrella de carbono del campo se desplaza el BP–RP efectivo hacia el rojo, con un suelo, antes de pedir el color. El realce es capa del simulador; el módulo de color es agnóstico al carbono.

- `CFG.carbono.bprpOffset` / `bprpMin`, aplicados en `colorEstrella()`

## 11. Todo lo que emite la estrella lleva su color

Núcleo, aureola de dispersión y spikes de difracción se tiñen con el color de la propia estrella. Un elemento blanco superpuesto en modo aditivo lavaría el color a blanco justo en las estrellas donde más se aprecia.

- `dibujarEstrellaColor()`, `dibujarAureola()`, `dibujarSpikes()`

## 12. El núcleo se aclara de forma controlada

El disco central mezcla color con blanco en proporción fija; el objeto de carbono usa una proporción distinta para no perder el rojo a aumentos altos.

- `CFG.tinteNucleo`, `CFG.tinteNucleoCarbono`

## 13. Las leyendas usan la misma función de color

La clasificación O·B·A·F·G·K·M por umbrales de BP–RP sirve solo para etiquetar; los puntos de leyenda se pintan con `colorPorBpRp` sobre un BP–RP representativo por clase.

- `claseEspectral()`; `CLASE_BPRP` y `hexDe()` / `rgbaDe()` en `vecindario-solar.js`

## 14. Palancas compartidas y valores fijados por test

Gamma y saturación viven en un único objeto de configuración: cambiarlas afecta a todas las vistas a la vez. Los valores de color están fijados por test de valores dorados.

- `BitacoraGaiaColor.config`; `scripts/test_gaia_color.js`, `scripts/test_blur_color_absoluto.js`
