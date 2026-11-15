# ¿Es cielo el campo vecino? (#320)

2026-11-14. Mide los dos cabos que dejó `cierre_284_cielo_publicado.md` y decide
qué hacer con ellos. No toca producción: `resources/js/bitacora-ps1.js` no cambia.

```
node scripts/harness_suelo_cielo.js --vecino --sin-red   # geometría, sin red
node scripts/harness_suelo_cielo.js --vecino             # + cielo de V0/V1/V2, con red
node scripts/harness_suelo_cielo.js --patron --solo NGC7293
```

## Antes de medir: el arnés leía sidecars viejos

`lib_parche_publicado.js` buscaba el sidecar de un objeto por prefijo de nombre.
Sin el PNG en disco (no entra en git), se quedaba con **el primero alfabético**,
que en **31 de 66** objetos no era la versión del manifiesto. NGC 1788 se leía
como `014ecee0` (lado 1,8′) en vez de `9c4a3f42` (4,05′), y NGC 7293 como
`3608971d` (1,172″/px) en vez de `d94a2055` (0,586″/px).

Arreglo: con fila en el manifiesto solo vale el fichero de su versión. El
manifiesto se lee en un contexto `vm` aparte y no en `window`: ahí
`ps1LadoDeFila` lo usaría y cambiaría el lado de quien solo buscaba un fichero.

## Criterio 1: la cifra que faltaba

Borde interior del campo vecino (`offset − lado/2`) en unidades de la extensión
real: `r_obj` de catálogo o, si el ADR 0034 midió más, el medio lado publicado.

- **66 texturas de imagen, no 68.** El manifiesto de hoy tiene 74 filas, de
  las que 66 son `imagen`; el 68 del ticket es de un banco anterior. Las filas
  sin imagen no tienen campo vecino.
- Mínimo **0,18**, p25 1,60, mediana **1,69**, máximo 10,71.
- **10 de 66 tienen el vecino dentro de su propia extensión, y son todas de
  lado medido** (ADR 0034): NGC 2327 0,18 · NGC 2261 0,26 · NGC 2245, IC 0466 y
  NGC 2068 0,40 · NGC 2170 0,59 · NGC 1788, NGC 1999, NGC 2247 y NGC 2182 0,89.
- Ninguna con lado de catálogo. El problema nace del ADR 0034: el lado creció,
  pero el vecino se dejó en el lado de catálogo.

Dentro geométricamente no implica contaminado: solo NGC 1788 lleva pedestal
medible (tabla de abajo).

## Las opciones, medidas

Sobre las 12 difusas de lado medido, el cielo del vecino con tres geometrías,
todas puestas por `ps1CampoVecino`. El recorte es siempre del lado de catálogo y
a la escala del parche, porque σ es por píxel.

- **V0**, la de hoy: el desplazamiento sale del lado de catálogo.
- **V1**: el desplazamiento sale del **lado medido**.
- **V2**: factor 3 en vez de 1,5.

La comprobación de que el arnés coloca V0 donde lo colocó el generador: los 12
pares V0 son los publicados, y la escalera vuelta a juzgar con ellos da **el
mismo lado publicado en los 12**.

| objeto | V0 cielo/σ | V1 cielo/σ | V2 cielo/σ | V0−V1 | V0−V2 | escalera V0 / V1 / V2 |
|---|---|---|---|---|---|---|
| **NGC1788** | **165,6 / 136,7** | −20,8 / 38,8 | −15,6 / 42,3 | **4,80σ** | **4,29σ** | 4,05′ / crece / crece |
| NGC1999 | −16,0 / 38,3 | 0,8 / 35,7 | 8,5 / 38,2 | −0,47 | −0,64 | igual |
| IC0435 | −7,0 / 99,1 | 4,1 / 96,4 | 1,7 / 88,1 | −0,11 | −0,10 | 4,68′ / 4,68′ / crece |
| NGC2068 | −7,4 / 51,1 | 1,1 / 42,3 | 0,6 / 43,0 | −0,20 | −0,18 | igual |
| NGC2170 | −18,9 / 66,2 | 8,0 / 57,6 | 4,0 / 58,3 | −0,47 | −0,39 | igual |
| NGC2182 | 28,6 / 95,1 | 20,1 / 81,9 | 16,6 / 82,2 | 0,10 | 0,15 | igual |
| NGC2245 | 0,8 / 66,3 | −4,5 / 50,2 | −6,3 / 45,9 | 0,11 | 0,15 | igual |
| NGC2247 | 10,6 / 43,8 | −4,2 / 39,1 | −2,9 / 40,8 | 0,38 | 0,33 | 4,05′ / crece / crece |
| NGC2261 | −24,9 / 71,9 | 5,0 / 69,9 | −3,7 / 75,5 | −0,43 | −0,28 | igual |
| NGC2327 | 23,7 / 78,9 | −5,0 / 47,0 | 10,1 / 61,5 | 0,61 | 0,22 | igual |
| IC0466 | −0,2 / 100,9 | 7,5 / 60,8 | −6,7 / 53,7 | −0,13 | 0,12 | 7,59′ / 7,59′ / crece |
| NGC6590 | −21,7 / 162,9 | 71,3 / 235,3 | −5,6 / 185,3 | −0,40 | −0,09 | igual |

Δ en σ **del campo de referencia**: la de V0 la infla el propio pedestal (×3,4
en NGC 1788). «Crece»: con ese cielo, ningún peldaño ya juzgado llega, así que
la escalera seguiría subiendo, y eso solo se sabe bajando los peldaños nuevos.

Contra el **patrón de cielo lejano** (criterio 2), solo NGC 1788 lo tiene entre
estas 12: −1,5 DN. Se compara solo el cielo, que no depende del píxel; la σ del
anillo es de otra escala, así que se divide por la del campo alejado.

- V0 queda a **4,31σ**.
- V1 queda a **−0,496σ**: pasa el listón 1 del ADR 0027 (0,50), pero por muy
  poco.
- V2 queda a **−0,332σ**: también pasa, con más margen.

Las dos opciones quitan el pedestal. V1 cae un poco por debajo del cielo
lejano: puede ser gradiente del campo, y con 3 milésimas de margen no se puede
decir más.

### La dirección limpia: descartada

Los 4 `vecina-dentro` (NGC 205, IC 0131, IC 0143 y NGC 2023) se probaron con el
catálogo reducido a su intrusa. Incluso la dirección más lejana de ella la
pisa: **en ninguno había otra dirección limpia**. Preferir la limpia no
arreglaría ni uno.

## Cabo 2, NGC 7293: no era el vecino, era el arnés

La «σ patrón» de 41,1 no venía del anillo lejano. Era la σ de **otro campo
vecino**, colocado a 32,66′ en vez de 30′, porque el arnés calculaba `r_obj`
sobre el sidecar viejo.

- **El campo de 32,66′, medido hoy:** σ **30,4**, no 41,1. El 41,1 del
  2026-09-12 no se reproduce.
- **Por cuadrantes** (script suelto, no un modo del arnés): 23,5 / 27,9 / 32,4 / 32,7 en el campo de 30′, y
  26,3 / 30,4 / 33,1 / 32,5 en el de 32,66′. Cada skycell tiene su
  profundidad, ±17 %.
- **Con la lib arreglada,** `--patron --solo NGC7293` coloca el vecino del patrón
  a 30′, como el generador, y da σ **28,79**, la publicada.

Resultado: log₂ = **0,00**. `scripts/salida_suelo_patron.json` queda
actualizado. No es un problema de la ley.

## Lo que cuesta cada opción

| | objetos cuyo vecino se mueve | escaleras que cambian | NGC 6888 | ¿republica? |
|---|---|---|---|---|
| V0 (hoy) | 0 | 0 | 1,41 (`cierre_284`, criterio 3) | no |
| **V1** | **12**, las de lado medido. Los otros 54, el mismo vecino | 2: NGC 1788 y NGC 2247 | 1,41: su vecino no se mueve | sí |
| V2 | 66 | 4 de las 12 medidas; las otras 54, sin medir | su vecino se mueve: razón **sin medir** | sí |

Lo de «cuántos mueve» lo imprime `--vecino --sin-red`, no es un argumento. Un
vecino que no se mueve baja el mismo recorte y da el mismo par (cielo, σ), así
que en V1 los objetos que hoy clavan el patrón no se mueven.
| dirección limpia | 0 útiles | — | — | — |

Republicar es el banco entero en V1 y en V2. El cielo y la σ viven en el
sidecar, y cambiar la geometría del vecino obliga a subir `GENERADOR`
(`gen_dso_texturas.js:66`) como en #288. Eso renombra todas las texturas, aunque
en V1 los píxeles de 54 no cambien.

## Decisión

ADR 0036 (`simulador_ocular/docs/adr/0036-el-campo-vecino-se-aleja-del-lado-medido.md`):
gana **V1**. La implementación y la republicación son otro ticket.

## Lo que esto NO cierra

- **Las escaleras que «crecen»** (NGC 1788 y NGC 2247 con V1) no se saben sin
  bajar sus peldaños nuevos.
- **Punto fijo.** Si el lado crece, V1 vuelve a alejar el vecino. Como solo
  aleja, converge, pero la implementación tiene que iterar o declararlo.
- **La opción μ25 del ticket** (desplazamiento sacado del radio de la escena
  en vez del lado) no se midió. En las 12 el lado medido ya es mayor que
  `2·r_obj`, así que no cambiaría a quién se mueve, pero la distancia no es la
  misma.
- **El 41,1 de septiembre no se explica:** el mismo campo da hoy 30,4. Las
  skycells varían ±17 % por cuadrante, pero eso no basta para pasar de 30 a 41.
- **NGC 2327:** 0,61σ contra V1 y 0,22σ contra V2. V1 cae a 25′, en otro campo:
  puede ser gradiente y no pedestal. No supera el listón contra V2.

## La implementación, medida (2026-11-15)

Tirada de las 12 de lado medido con el generador nuevo, en un directorio
aparte (`--solo … --dir <scratch>`), sin tocar el banco publicado.

- **El punto fijo es monótono por regla:** primera ronda con el vecino de
  catálogo; si el lado crece, el vecino se aleja a ese lado y la escalera se
  vuelve a juzgar desde ahí. No se vuelven a juzgar los peldaños de debajo.
- **10 de 12 quedan en su lado publicado**, ahora juzgado con el vecino
  alejado: llegan todos.
- **NGC 2247 crece de 4,05′ a 6,08′**, como predijo el ADR.
- **NGC 1788 crece hasta el tope (20′) y no llega** (`marco.llega = false`,
  7,7 MB). Su cielo nuevo queda a **−0,134σ** del patrón (−7,6 / 45,3 contra
  −1,5): pasa el listón 1 con margen. Comprobado aparte: con el vecino de su
  propio lado, 6,08′, 9,11′ y 13,67′ tampoco llegan (suelos 60,6 / 56,9 / 55,4
  frente a peores 298 / 61 / 438), así que no hay un lado menor coherente que
  la regla monótona se salte.
- **El suelo nuevo no siempre es más bajo:** subió en 7 de las 12 (NGC 1788
  37,1 → 60,3 en el tope; NGC 6590 222,7 → 424,2). Alejar quita pedestal, pero
  la σ del campo nuevo puede ser mayor.
- **El cuadrado de la vecina:** con el recorte de catálogo y con el del lado
  publicado, el veredicto `difusaDentro` es el mismo en las 12 (ninguna
  vecina dentro).

### Lo que la implementación NO cierra

- **6 objetos con el lado publicado igual al de catálogo y dirección distinta a la publicada**
  (NGC 3310, NGC 4125, NGC 4565, IC 4684, NGC 6720, NGC 7331): mismo
  desplazamiento, otra dirección, porque la «difusa más cerca» publicada es
  mucho mayor que la de hoy. No lo causa el ADR 0036 (sin lado publicado el
  vecino es bit a bit el de antes): es deriva entre el catálogo de hoy y el del
  día que se generaron. La republicación los moverá igualmente, así que los
  «54 sin cambios» son 48.
- **El retroceso cuando el vecino alejado falla** (`vecino-alejado-*`, vale la
  ronda anterior) no se ejercitó: las 12 midieron bien.
