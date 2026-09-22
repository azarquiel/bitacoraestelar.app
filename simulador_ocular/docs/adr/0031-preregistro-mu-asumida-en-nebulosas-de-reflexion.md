# Prerregistro — μ asumida en las nebulosas de reflexión sin fotometría

Fecha: 2026-09-03. Comprometido ANTES de mirar ningún render de las filas nuevas.
Ningún listón se retoca tras ver la salida: si un listón falla, las filas sin
magnitud se quedan fuera del catálogo, nunca se ajusta el umbral a posteriori
(disciplina de los ADR 0012, 0015 y 0022).

Amplía el ADR 0013 (el modelo intrínseco vive en la fila de catálogo), que abrió
la clase `RfN` con M78. Lo que 0013 no dijo es de dónde sale la magnitud de esa
fila cuando el catálogo no la trae.

## El hecho que lo motiva

De las 38 filas `RfN` del OpenNGC, **25 no traen magnitud** ni en V ni en B, así
que `gen_nebulosas.py` las descarta. Entre ellas hay objetos observados —NGC 2023—
y otros conocidos —IC 2118, NGC 2170, NGC 6726/6727—. De esas 25, **16 tienen
imagen de Pan-STARRS disponible** (Dec > −30° y lado sin recorte); las otras 9
quedan fuera por el sur o por tamaño y no las toca este prerregistro.

Medido el 2026-09-03, y es lo que cambia el planteamiento: **en esta clase la
magnitud del catálogo tampoco es fotometría de la nebulosa**. Muchas filas traen
la magnitud de la estrella que la ilumina, y el suelo `MU_MIN` ya existe por eso.
De las 13 `RfN` con magnitud, **12 caen bajo el suelo y el generador las sube a
μ_e = 20,0 exactos**:

| μ_e crudo | filas |
|---|---|
| 14,47 | NGC 1788 |
| 17,17–18,73 | NGC 2247, IC 0444, NGC 2182, NGC 1555, NGC 1999, NGC 2068 |
| 19,02–19,67 | IC 1287, NGC 1985, IC 4592, NGC 6590, NGC 2245 |
| 20,07 | NGC 2261 (la única que no toca el suelo) |

σ robusta (MAD) = 1,14 mag/arcsec². No hay ley que extraer de esas magnitudes: la
dispersión es de las estrellas iluminadoras, no de las nebulosas. **M78, que validó
la ampliación de 0013, está entre las 12 ancladas por el suelo.**

## Lo que se decide

En ausencia de fotometría nebular utilizable, la implementación actual representa
las RfN con μ asumida = 20,0, coincidente con el suelo actual de la tubería. Este
valor no se interpreta como una medición física.

De ahí se deriva la magnitud de la fila por el tamaño de catálogo, con la misma
`mu_efectivo` que ya usa el generador. La consecuencia buscada es que las 16 filas
entren por la puerta que ya existe (`PS1_CLASES_DIFUSAS`) y reciban el mismo
tratamiento que las 12 que hoy acaban en ese mismo valor por otro camino.

Lo que **no** se decide aquí: nada sobre `Neb`, `HII`, `Cl+N`, `EmN` ni `SNR`, que
también tienen filas sin magnitud (56, 42, 26, 4 y 5). Cada clase exige su
validación.

## Qué pinta realmente esto

La fila no dibuja: `ps1CatalogoDifuso` es su único consumidor de render y lo que
se pinta es un **parche real de Pan-STARRS**. La fila aporta geometría, escena
protegida (isofota μ25) y ancla fotométrica. Sin parche no hay respaldo de modelo
—`if (!parche) return;`— así que la μ asumida no inventa una mancha: fija a qué
brillo total se ancla una imagen que existe.

No es por eso un parámetro inocuo. Medido sobre el parche real de NGC 2023, la
extensión visible en el lienzo va de 19.439 px con μ_e = 20 a 4.806 px con μ_e = 23.

## Riesgo específico de la clase, ya medido

Una nebulosa de reflexión tiene por definición una estrella brillante dentro: la
que la ilumina. El precedente de NGC 7008 (ADR 0021) es que una máscara ancha
puede mandar el 100 % del parche a ausencia.

Medido sobre NGC 2023 con su parche real, antes de este prerregistro:

- HD 37903, G = 7,76, radio de máscara **60,0″** (el tope `mascaraMaxAs`).
- `ps1CoberturaMordida` = **0,0 %** (umbral 60 %), `ps1MascaraMuerdeEscena` = `false`.
- NaN tras quitar estrellas y anclar: 1,9 %. Al lienzo no llega ningún NaN.
- Robusto a la hipótesis: mordida 0,0 % con μ_e de 20 a 23.

La razón es que la iluminadora cae **dentro** de la escena μ25 y la ampara
`ps1FuentesEnEscena`. No es el caso de NGC 7008, donde la compacta no tenía escena
que amparase a μ Orionis. Este riesgo queda descartado, no pendiente.

## Banco (fijado antes de medir)

| Objeto | Papel | Por qué |
|---|---|---|
| NGC 2023 | positivo (listón duro) | observada; con mag asumida, misma región del cielo que el control |
| M78 (NGC 2068) | control (listón duro) | misma clase, mag de catálogo, render ya validado por 0013 |
| NGC 2064 / NGC 2067 | informativo | vecinas de M78 sin mag, entran en el mismo campo |
| IC 2177 | informativo | la mayor de las 16 (lado 18,0′), roza la puerta de tamaño |

## Listones

1. **L1 — el parche llega entero.** Para las 16, ninguna con `ps1MascaraMuerdeEscena`
   = `true` ni con NaN al lienzo. Falla ⇒ las que fallen quedan fuera, no se
   toca la máscara.
2. **L2 — la luz integrada devuelve la magnitud asumida** con su fracción de
   parche, dentro de 0,3 mag; el mismo listón que ya aplica
   `test_nebulosas_emision_reflexion.js` a M78. Falla ⇒ la derivación de la
   magnitud está mal planteada y se descarta.
3. **L3 — escala comparable con el control.** El brillo superficial medio de
   NGC 2023 en el lienzo no se aparta más de **1,0 mag/arcsec²** del de M78 a
   igual equipo. Falla ⇒ μ = 20,0 no vale como ancla para las filas sin
   fotometría y las 16 se quedan fuera.
4. **L4 — no se degrada lo que ya estaba.** M78, NGC 7635 y NGC 6888 conservan
   sus veredictos actuales. Falla ⇒ se revierte entero.

L3 es el listón real de esta decisión y el único que puede fallar por la
hipótesis en sí: L1 ya está medido y L2 es aritmética de la propia tubería.

## Vía de escape única

Si L3 falla, la salida NO es mover μ hasta que pase. Es dejar las 16 fuera y
anotar el fallo aquí, con el número medido. Mover el valor sería ajustar el
umbral a posteriori sobre el único listón que juzga la hipótesis.

## Lo que hay que decir aunque todo pase

Que en la clase `RfN` el brillo lo pone el suelo de la tubería y no el catálogo
vale **también para las 13 que sí traen magnitud**, M78 incluida. No es una
propiedad de las filas nuevas: es una propiedad de la clase, y hasta hoy no
estaba escrita en ningún sitio.

## Resultado (2026-09-03) — PASA 4/4

Ejecutado tras fijar todo lo anterior. Catálogo regenerado: 290 filas (antes 265),
**25 con μ asumida**, las 38 `RfN` del OpenNGC dentro.

**L1 — el parche llega entero. PASA.** NGC 2023 con su parche real:
`ps1MascaraMuerdeEscena` = `false`, cobertura de la mordida 0,0 %, NaN al lienzo 0,
19.439 px encendidos. La iluminadora queda amparada por la escena μ25, como se
había medido.

**L2 — la luz integrada devuelve la magnitud. PASA.** 7,82 medida contra 7,82
esperada con su fracción de parche (listón 0,3 mag). Fijado en
`scripts/test_nebulosas_emision_reflexion.js`.

**L3 — escala comparable con el control. PASA.** Flujo por píxel de NGC 2023
contra M78, mismo lienzo, 457 mm a 190×:

| estadístico | NGC 2023 | M78 | Δμ (mag/arcsec²) |
|---|---|---|---|
| media de los px encendidos | 1,057e−8 | 6,800e−9 | −0,479 |
| mediana | 2,096e−9 | 1,986e−9 | −0,059 |
| percentil 90 | 2,252e−8 | 1,127e−8 | −0,752 |

Peor desviación **0,752** contra el listón de 1,0. NGC 2023 sale algo más brillante
que M78, que es lo que cabía esperar de las dos por separado; no hace falta escape.

**L4 — no se degrada lo que estaba. PASA.** M78, NGC 7635 y NGC 6888 conservan sus
cinco veredictos cada uno. `test_golden_difusas.js` sigue bit a bit, y
`test_nebulosa_planetaria.js`, `test_resto_supernova.js`, `test_difuso.js`,
`test_alias_messier.js` y `test_capa_difusa_defecto.js` en verde.

Nota de método, por si vuelve a hacer falta el harness: una RA sexagesimal puesta a
ojo (85,160° donde eran 85,410°) apunta a cielo vacío a 15′ del objeto y devuelve
números **plausibles** —estrella más brillante G = 12, mordida 0 %— que no delatan
el error. La primera corrida de la medida de la máscara se perdió así.
