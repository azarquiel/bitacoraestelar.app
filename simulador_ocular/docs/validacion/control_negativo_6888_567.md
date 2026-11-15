# El control negativo de NGC 6888, medido versión a versión (#567)

2026-11-15. El listón 4 de #274 (razón interior/exterior de píxeles >3σ en
NGC 6888, sin el anillo 0–0,5 `r_e`, ≤ 1,80) pasaba con el PNG de #274 y ya no
pasa con el banco publicado: **1,85 → 2,10 → 2,36** con la ley L0. Aquí se
atribuye cada salto con una medida. La conclusión es que la razón no mide lo que
el listón decía medir, y se retira (ADR 0038).

## Cómo reproducirlo

Las cuatro versiones del PNG de NGC 6888 que ha habido están en la historia de
`scripts/fixtures/dso/`. Cada una va a un directorio con su sidecar, su PNG y
un `manifiesto.js` de una fila (`[["NGC6888","imagen","<versión>"]]`). Sin ese
manifiesto, `--dir` caía en silencio en la fixture del árbol y medía v3 creyendo
medir v2. Desde #567, `lib_parche_publicado.js` lee el manifiesto del directorio
(`scripts/test_parche_publicado.js`).

```
git show <commit>:scripts/fixtures/dso/NGC6888.<versión>.{json,png} > <dir>/…
node scripts/harness_suelo_cielo.js --opciones --solo NGC6888 --dir <dir>
node scripts/harness_suelo_cielo.js --opciones --solo NGC6888 --dir <dir> --recorte 12.728
node scripts/harness_suelo_cielo.js --opciones --solo NGC6888 --dir <dir> --quitar-todas
```

| versión | commit | generador | lado | ″/px |
|---|---|---|---|---|
| `1aa86769` (la de #274) | `b27f17c` | 1 | 12,73′ | 0,746 |
| `d7461359` | `c7c2f51` | 2 | 12,73′ | 0,746 |
| `cd7efc1f` (v2, producción) | `dd02bfa` | 2 | 12,73′ | 0,500 |
| `e3a2d488` (v3, #320) | `c7762eb` | 3 | 19,09′ | 0,559 |

`d7461359` es el mismo PNG que `1aa86769` (sidecar nuevo, PNG renombrado) y da
las mismas cifras. Las opciones son las de siempre: L0 es el marco del 6 % del
propio PNG (**no lee el sidecar**), E4 es el par fijo del patrón
(−11,9 / 57,9 DN, el mismo en todas las filas) y SC es el par que publica el
sidecar.

## Primer salto, 1,85 → 2,10: la σ de L0, no el lado

Mismo lado y mismo campo. Lo que cambia es el ruido por píxel del PNG:

| versión | σ de L0 | σ ciega a la estructura (E3) | razón L0 | razón E4 |
|---|---|---|---|---|
| `1aa86769` | 98,4 | 62,9 | 1,85 | 1,39 |
| `cd7efc1f` | 127,4 | 102,9 | **2,10** | 1,34 |
| `e3a2d488` recortado a 12,73′ | 93,7 | 61,1 | 1,76 | 1,39 |

Con el par fijo (E4), la razón no se mueve: 1,39 → 1,34. Lo que sube la de L0 es
su σ, un 30 % más alta, y con ella el umbral. La σ no va con la escala del
píxel: v3 tiene píxeles de 0,559″ y menos ruido por píxel que v2, con 0,500″.
Depende de cómo se cosió y remuestreó cada descarga, y eso no se ha separado
más.

Que la razón suba con el umbral está medido aparte, cambiando el 3σ por kσ sobre
el mismo PNG:

| k | v2 L0 | v2 E4 | v3 L0 | v3 E4 |
|---|---|---|---|---|
| 2 | 1,68 | 1,21 | 2,03 | 2,25 |
| 3 | 2,10 | 1,34 | 2,36 | 2,62 |
| 4 | 2,48 | 1,50 | 2,66 | 2,96 |
| 5 | 2,70 | 1,68 | 2,95 | 3,29 |

**Es monótona.** Una σ más estricta sube la razón, y una que amplifique el ruido
la baja hacia 1. Es lo contrario de lo que decía el comentario del arnés («una σ
que la saque está amplificando ruido»). (El barrido se hizo con una copia del
arnés que cambiaba el 3 de `anillos3sigma`; no está en el árbol.)

## Segundo salto, 2,10 → 2,36: el lado

Recortando el parche v3 al lado de v2, con los mismos píxeles, la misma escala y
las estrellas ya quitadas (`--recorte`), solo cambia dónde caen el marco del 6 %
y el anillo exterior:

| lado | L0 | E4 | SC |
|---|---|---|---|
| 12,73′ | 1,76 | 1,39 | 1,44 |
| 15′ | 1,81 | 2,09 | 2,17 |
| 17′ | 2,00 | 2,62 | 2,72 |
| 19,09′ (publicado) | 2,36 | 2,62 | 2,72 |

Con el par fijo, los anillos interiores no cambian ni una décima (21,4 / 20,5 /
24,7 / 20,5 %). Solo cambia el 3–4 `r_e`: a 12,73′ el parche llega a 3,00 `r_e`
y de ese anillo solo caben las **esquinas** (17,8 %). A 17′ ya cabe entero
(9,5 %). De 17′ a 19,09′ E4 y SC no se mueven, y L0 sube solo porque su marco se
aleja: 2,00 → 2,36. Recortar v2 a su propio lado da las mismas cifras que sin
recortar (comprobación de `--recorte`).

El cielo y la σ del sidecar (ADR 0028/0036) **no entran en L0**. En SC sí, y
dan 1,41 (`d7461359`) → 1,64 (v2) → 2,72 (v3).

## Lo que de verdad mide la razón

El anillo 3–4 `r_e`, partido con el par fijo E4:

| trozo del anillo 3–4 | v2 | v3 |
|---|---|---|
| dentro de la escena (μ25, radio 451″ = 3,54 `r_e`) | 21,3 % | 14,6 % |
| fuera de la escena | 14,2 % | **4,0 %** |
| dentro del cuadrado de 12,73′ (esquinas) | 19,6 % | 17,8 % |
| fuera de ese cuadrado | — | 5,2 % |
| esquina NE sola | 35,4 % | 34,4 % |

`ps1QuitarEstrellas` conserva las estrellas que caen dentro de la escena, como
hace en producción. La escena de NGC 6888 llega a 3,54 `r_e`. Los anillos
interiores llevan, por tanto, **todas sus estrellas de Gaia**, y el exterior las
lleva solo en parte. Si se quitan todas (`--quitar-todas`):

| | 0–0,5 | 0,5–1 | 1–1,5 | 1,5–2 | 2–3 | 3–4 | razón L0 / E4 / SC |
|---|---|---|---|---|---|---|---|
| v3, con la escena | 58,7 | 21,4 | 20,5 | 24,7 | 20,5 | 9,5 | 2,36 / 2,62 / 2,72 |
| v3, sin estrellas | 0,6 | 7,7 | 4,7 | 8,1 | 3,4 | 3,4 | 2,14 / 2,40 / 2,55 |
| v3 a 12,73′, sin estrellas | 0,6 | 7,7 | 4,7 | 8,1 | 3,4 | 6,6 | 1,10 / 1,22 / 1,27 |
| v2, sin estrellas | 0,8 | 9,2 | 5,7 | 9,0 | 4,5 | 7,6 | 1,17 / 1,21 / 1,57 |
| `1aa86769`, sin estrellas | 0,6 | 7,7 | 4,6 | 8,1 | 3,4 | 6,6 | 1,15 / 1,22 / — |

(% de píxeles >3σ con E4.) El 43–59 % del anillo central, que #274 achacó a la
Wolf-Rayet, son **las estrellas conservadas**: sin ellas baja al 0,6 %. Los
anillos interiores bajan a un tercio.

Además, el anillo «exterior» no está fuera del objeto. El semieje del catálogo
es 3,33 `r_e` (`emision_banda_o_ley.md`), así que el anillo 3–4 parte la cáscara
por su borde.

## Veredicto

La razón sigue a cuatro cosas, y ninguna es «estructura donde no la hay»:

1. la máscara de estrellas (cuántas conserva la escena en cada anillo);
2. la profundidad del umbral (σ por píxel del PNG, que cambia con cada descarga);
3. qué trozo del anillo 3–4 cabe en el parche (esquinas a 12,73′, entero desde 17′);
4. un anillo exterior que está dentro del objeto.

Con el mismo PNG da de 1,10 a 2,72 según opción, lado y máscara. Un 1,80 fijo no
puede viajar de una tirada a otra. **El listón 4 se retira (ADR 0038).** El
veredicto de #263 («la estructura no está en los datos») no dependía de él:
descansa en que r, con el Hα dentro, da lo mismo que g (30,0 contra 31,1 %).

## Criterios de #567

- **Atribución:** 1,85 → 2,10 viene de la σ por píxel del PNG v2 (E4 fijo:
  1,39 → 1,34). 2,10 → 2,36 viene del lado (v3 recortado a 12,73′: 1,76). Los
  números están arriba.
- **Listón:** reformulado en el ADR 0038 (retirado como veredicto). Un listón que
  la referencia no pasa no discrimina (ADR 0005), y este además mide la máscara.
- **Núcleo de los otros 65:** no cambia, porque ninguna textura cambia un byte.
  #567 toca el arnés y su cargador, no el generador ni el banco.

## Lo que no se cerró

- Por qué el PNG v2 tiene un 60 % más de ruido por píxel que el de #274 y que v3.
  Afecta a cualquier listón por píxel medido sobre v2.
- La esquina NE de NGC 6888 tiene el doble de píxeles >3σ que las otras tres.
  Puede ser emisión del complejo de Cygnus o un resto de estrellas. No se ha
  mirado.
- `harness_emision_banda.js` dice «el parche llega a r/r_obj = 3.00 (lado 12.7′)»
  también con v3 (19,09′): calcula el lado con el catálogo y no con el sidecar.
