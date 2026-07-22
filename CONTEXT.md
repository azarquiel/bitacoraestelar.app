# Contexto de dominio — Bitácora Estelar

Glosario de términos del proyecto (ubicuo). Los módulos y su vocabulario de
arquitectura se nombran con estos términos.

## Modelo de color Gaia

El mapeo canónico **índice BP–RP → color RGB** de una estrella, anclado a los
códigos físicos de Harre & Heller (2021) / spec2col (espectro → CIE → XYZ →
sRGB), con corrección gamma sRGB parcial y el extremo rojo anclado a un espectro
de estrella de carbono (bandas C2 "Swan").

- **Fuente única:** `resources/js/bitacora-gaia-color.js`, global `window.BitacoraGaiaColor`.
- **Interfaz:** `colorPorBpRp(bprp)` → `[r,g,b]`; `claseEspectral(bprp)` → letra
  espectral (O·B·A·F·G·K·M); `config` → palanca mutable de gamma y saturación
  compartida por todos los consumidores.
- **Consumidores:** el **simulador de oculares** (`bitacora-ocular.js`) y el
  **vecindario solar** del mapa (`vecindario-solar.js`), ambos desde la misma URL
  canónica `/wp-content/uploads/bitacora/bitacora-gaia-color.js`.
- **Invariante:** el color de una estrella debe ser EXACTAMENTE el mismo en el
  simulador y en el mapa. Garantizado estructuralmente (una sola fuente), no por
  copiar y pegar. El test dorado `scripts/test_gaia_color.js` fija el contrato.
- El realce de **estrella de carbono** NO pertenece al modelo: es una capa del
  simulador que ajusta el BP–RP efectivo antes de pedir el color canónico.

## Objeto del mapa

Una entrada en la tabla `{prefix}bitacora_objetos` que se pinta en el mapa de la
Vía Láctea (slug, etiqueta, color, tipo, morfología, coordenadas galácticas,
distancia). Los objetos cercanos aparecen en el mapa MW; los lejanos, en la vista
extragaláctica (grupo local).

## Clasificación de objeto del mapa

El seam que decide **`tipo` + `color`** de un objeto a partir de su `otype` de
SIMBAD, su morfología y el tipo declarado en la observación. Función única
`bitacora_clasificar_objeto($otype, $morph, $tipo_obs)` en `bitacora-registro.php`
(antes estaba repartida entre `clase_hubble` + `color_por_clase` + un `if` de
carbono incrustado, y el hueco entre «decidir tipo» y «decidir color» era el bug:
cúmulos y estrellas de carbono caían en el default `#7ec8ff`, que en la leyenda es
«Resto de supernova»).

Prioridad: tipo del registro → tabla de categorías MW por código otype (`C*`
carbono, `GlC` globular, `OpC`/`Cl*` abierto, `PN` planetaria, `HII`/`EmO` emisión,
`SNR` resto de supernova) → galaxia por clase de Hubble (para grupo local) →
`otro` neutro `#dfe7f5`.

- **Invariante:** los colores del clasificador coinciden con la leyenda `#mw-legend`
  (`data-color`) de `mapa/index.html`; los de galaxia, con `HUBBLE_COLORS` de
  `grupo-local.js` y la leyenda `#mw-legend-hubble`. El test
  `scripts/test_clasificacion_objeto.py` verifica mapeos y sincronía.
- **Default neutro:** un otype desconocido NO reutiliza un color de la leyenda, para
  no disfrazarse de otra categoría (era la raíz del bug).
