# Recaptura R5 — el cielo del parche sale del campo vecino

> Causa · la republicación del banco (#288) publica sidecars con `vecino`, así
> que `ps1AnclarACatalogo` deja de medir el marco del 6 % y usa los dos números
> del campo vecino (ADR 0028, implementado en #286).
> Fecha · 2026-09-13 · `node v26.3.1` · MacBook de isra (Darwin 25.6.0, x86_64).
> Procedimiento · `simulador_ocular/docs/notas/recaptura-golden-difusas.md`.

R5 **no estaba prevista** en la tabla de recapturas de la nota: allí figuran R1
(WCS), R2 (la fuente pasa a ser la textura), R3 (resolución por objeto) y R4
(máscara offline), y R3 y R4 siguen pendientes. Esta es la que faltaba porque
cuando se escribió la nota el cielo del campo vecino todavía no era una ley. Se
tramita como recaptura y no como `--capturar` a ciegas: causa declarada, deltas
medidos antes de capturar, tabla y commit propio.

## 0 · Verde antes de tocar nada

`node scripts/test_golden_difusas.js` sobre `main` (2e88ff2), en esta máquina y
con este Node: **«GOLDEN: todo bit a bit»**. La línea base que se sustituye es la
de R2 y es la de aquí.

## 1 · Qué mueve los bits

Un solo número por objeto, y no es el brillo: es el **corte de ausencia** de
`ps1AnclarACatalogo`, `corte = cielo − kAusencia·σ` con `kAusencia = 2`. Por
debajo de ese corte el píxel está sobresustraído y se conserva como NaN, para
que el pintado lo rellene con el perfil. Cambiar de dónde salen `cielo` y `σ`
mueve el corte, y con él la frontera entre «imagen» y «ausencia».

La ley vieja mide el marco del 6 % sobre `limpio` (post quitar-estrellas); la
nueva lee los dos números que el sidecar trae del campo vecino.

| Objeto | marco: cielo / σ | vecino: cielo / σ | corte antes → después | NaN antes → después |
|---|---|---|---|---|
| M51 | −0,680 / 27,574 | +1,363 / 24,762 | −55,83 → −48,16 | 105 348 → 130 679 |
| M101 | −3,700 / 31,024 | +1,082 / 20,550 | −65,75 → −40,02 | 91 243 → 197 819 |
| M104 | −4,120 / 35,759 | +2,455 / 37,843 | −75,64 → −73,23 | 42 523 → 47 300 |
| M81 | −0,514 / 24,971 | +1,596 / 26,145 | −50,46 → −50,69 | 81 035 → 80 145 |

Las cuentas de NaN de la columna derecha se reprodujeron **exactas** contando a
mano los píxeles de `limpio` por debajo de cada corte, así que la atribución no
es una hipótesis: el golden y la cuenta directa dan el mismo número.

Los cuatro marcos dan un cielo **negativo** y los cuatro campos vecinos uno
positivo. Es lo que dice el ADR 0028: alrededor de un objeto grande el stack de
PS1 está sobresustraído, y ese pedestal negativo es justo lo que el marco toma
por cielo. M81 es el único cuyo corte **baja** (su σ de campo vecino es mayor
que la del marco), y por eso es el único que pierde NaN.

## 2 · La tabla de deltas

| Objeto | sha256 antes → después | Δsuma / suma | NaN antes → después | max\|Δ\|/σ | Umbral | Veredicto |
|---|---|---|---|---|---|---|
| M51 `parche.datos` | `45d2f1c7f520…` → `42d9733ad0a1…` | 0,000 % | 105 348 → 130 679 | — | invariante propio | ok |
| M101 `parche.datos` | `278bedf031fe…` → `3435b16d8377…` | 0,000 % | 91 243 → 197 819 | — | invariante propio | ok |
| M104 `parche.datos` | `032678baff92…` → `765489cc7d3e…` | 0,000 % | 42 523 → 47 300 | — | invariante propio | ok |
| M81 `parche.datos` | `4ffe9e3c20a5…` → `667f5bab4cec…` | 0,000 % | 81 035 → 80 145 | — | invariante propio | ok |
| M51 · 457,2 mm 190× SQM 21,2 | `ca761c8640cb…` → `cd298c455480…` | −0,30 % | | — | invariante propio | ok |
| M51 · 203 mm 100× SQM 20,5 | `2b3685facd28…` → `cfd28faaf66b…` | −0,37 % | | — | invariante propio | ok |
| M101 · 457,2 mm 190× SQM 21,2 | `d85b3706d2fe…` → `68fe7a3fa141…` | −3,65 % | | — | invariante propio | ok |
| M101 · 203 mm 100× SQM 20,5 | `a04930bf66b3…` → `defc35ed4cb5…` | −4,48 % | | — | invariante propio | ok |
| M104 · 457,2 mm 190× SQM 21,2 | `848fcb1a380e…` → `a20b526bc1bb…` | +0,47 % | | — | invariante propio | ok |
| M104 · 203 mm 100× SQM 20,5 | `5bdc6f53950f…` → `31b3f7d12f6c…` | +0,56 % | | — | invariante propio | ok |
| M81 · 457,2 mm 190× SQM 21,2 | `969aff5296d3…` → `677c0c2d0878…` | +0,38 % | | — | invariante propio | ok |
| M81 · 203 mm 100× SQM 20,5 | `476bb4f03991…` → `63a11f6a5a9f…` | +0,46 % | | — | invariante propio | ok |

La columna `max|Δ|/σ` va vacía **a propósito**, y la nota lo prevé: el listón de
0,05 σ es el de equivalencia, y vale cuando los dos caminos deben pintar lo
mismo (R2, R4). Aquí no deben. El ADR 0028 dice que el suelo del marco está mal
y lo cambia; exigirle que pinte igual que la ley que sustituye sería medir
parecido en vez de corrección.

## 3 · El invariante propio de R5

Lo que **no** puede moverse, y no se movió:

1. **`thetaIntArcmin`**, en los cuatro. Sale de la fila de catálogo, no del
   parche: si se moviera, el cambio no sería el que creemos.
2. **La suma de `parche.datos`**, en los cuatro, a los siete dígitos que imprime
   el golden (M51 4,474552e-4; M101 4,258961e-4; M104 8,137104e-4; M81
   8,115419e-4). No es casualidad ni es que no haya cambiado nada: el anclaje
   reparte el flujo del catálogo entre los píxeles que sobreviven, así que el
   total lo fija la fila de catálogo y no el corte. Es la prueba de que R5 mueve
   el **reparto** de la luz, no su cantidad.
3. **Los píxeles del PNG.** Las texturas republicadas salen byte a byte iguales
   a las de la tirada anterior: R5 no toca la imagen, toca el suelo con el que
   se lee.

## 4 · Lo que sí se mueve, y por qué es lo esperado

El tamaño del delta va con el tamaño del cambio de corte, objeto a objeto:

| Objeto | Δcorte (DN) | ΔNaN | Δ difuso (457 mm) |
|---|---|---|---|
| M101 | +25,73 | +106 576 | −3,65 % |
| M51 | +7,67 | +25 331 | −0,30 % |
| M104 | +2,41 | +4 777 | +0,47 % |
| M81 | −0,23 | −890 | +0,38 % |

M101 es el caso extremo y el que mejor explica la ley: su marco daba σ = 31,0
contra los 20,6 del campo vecino, un 50 % de más, porque a 10′ del centro el
marco todavía tiene disco. Con la σ real el corte sube 25,7 DN y aparecen
106 576 píxeles sobresustraídos que antes pasaban por imagen; el perfil los
rellena, y el reparto de la luz se va un 3,7 % respecto al de antes.

Los dos objetos cuyo campo vecino confirma el marco —M104 (σv/σm = 0,97) y M81
(0,97)— se mueven menos del 0,6 %. Esa correlación es el argumento: el delta no
es ruido de recaptura, es la corrección del suelo, y donde no había nada que
corregir no corrige nada.

## 5 · El arnés de #274 como testigo: L0 no se ha movido (#289)

La recaptura cambia la ley de producción, no la medida de #274. Para que se vea,
se vuelve a correr el arnés sobre el banco republicado y se comprueba que las
cifras de **L0 —la ley vieja, la del marco del 6 %—** salen las mismas que
publica `suelo_cielo_parche.md`. Si se hubieran movido, el arnés habría dejado de
medir lo publicado y ya no serviría de testigo de nada.

```
node scripts/harness_suelo_cielo.js --opciones --dir <banco>
```

`scripts/salida_suelo_patron.json` —el patrón contra el que se juzga— está
commiteado desde #274, así que la comparación es contra el mismo patrón y no
contra uno nuevo.

**El banco con el que se corrió.** Los PNG no entran en git y la tirada de #288
los dejó bajo nombres nuevos, así que se montó un directorio pareando cada
sidecar republicado con el PNG de la tirada anterior. Eso vale porque los píxeles
no cambiaron, y aquí está comprobado y no supuesto: de los once objetos que
llevan fixture en `scripts/fixtures/dso/` —recapturados con el nombre nuevo—
**los diez que tienen pareja en el banco viejo dan el mismo sha256**. El
undécimo, NGC 5194, no está en la copia vieja y se leyó directamente de su
fixture.

| magnitud (los nueve afectados con patrón) | publicado en #274 | re-corrido hoy |
|---|---|---|
| L0 · mediana \|log₂(σ/σ_patrón)\| | 0,42 | 0,42 |
| L0 · máx \|log₂\| | 2,46 (NGC 1788) | 2,46 (NGC 1788) |
| L0 · máx \|Δcielo\|/σ_patrón | 5,22 (NGC 1788) | 5,22 (NGC 1788) |
| E2 / E3 · mediana \|log₂\| | 0,40 / 0,28 | 0,40 / 0,28 |
| Listón 3 · suelo L0 de los cuatro controles | 37 / 29 / 97 / 178 DN/as² | 37 / 29 / 97 / 178 |
| Listón 3 · apagados L0 | 25,0 / 23,5 / 0,8 / 0,1 % | 25,0 / 23,5 / 0,8 / 0,1 % |
| Listón 4 · anillos de NGC 6888 con L0 | 13 / 12 / 18 / 13 / 10 % → 1,80 | 13 / 12 / 18 / 13 / 10 % → 1,80 |

Objeto a objeto, la columna L0 de `log₂(σ/σ_patrón)` sale idéntica en los nueve
(+0,12 · +0,29 · −0,20 · +2,46 · +0,42 · −0,25 · +0,60 · +0,76 · −0,69), y la de
Δcielo también. **El veredicto de #274 no se toca**: L0, E2 y E3 siguen sin pasar
los listones 1 y 2, y E4 —la opción que se implementó— sigue pasándolos por
construcción.

Dos filas nuevas aparecen y no estaban en el informe: NGC 5194 y NGC 3031 ahora
sí tienen patrón (L0 +0,16 y +0,04), porque el fichero de patrón commiteado trae
sus medidas. No cambian ningún veredicto: los dos son controles de parche
holgado, y ahí la ley vieja ya acertaba.

## 6 · Quién sigue pintándose con el cielo del marco (#287)

Cuatro texturas buenas del banco no tienen campo vecino utilizable y se quedan
con la ley del marco, que es lo único que les queda. El runtime las marca y el
informe del generador las lista por nombre:

| objeto | motivo | dirección | difusa que lo invalida |
|---|---|---|---|
| NGC 205 | `vecina-dentro` | O | NGC 224 (dentro del campo) |
| IC0131 | `vecina-dentro` | O | NGC 598 (dentro) |
| IC0143 | `vecina-dentro` | N | NGC 598 (dentro) |
| NGC2023 | `vecina-dentro` | N | IC0434 (dentro) |

Ninguno de los cuatro es de los cuatro objetos del golden, así que **la recaptura
no los cubre**: lo que se sabe de ellos es que siguen con la ley vieja y que se
dice, no que su suelo sea correcto.

Un caso aparte, que conviene no leer como resuelto: **NGC 1788 sí tiene campo
vecino** —a 2,7′ al E, una celda cosida— y su sidecar trae cielo 163,8 DN y
σ 144,7. La σ coincide con la del patrón de #274 (144,7), pero el cielo sigue muy
por encima del −1,5 DN del anillo lejano: a 2,7′ la nebulosa todavía llega. El
objeto deja de leerse con los 754 DN del marco, que era lo que lo apagaba entero,
pero su pedestal no es cero y esto no lo mide esta recaptura.

## 7 · La batería, antes y después (#289)

La línea base se mide antes de culpar al diff, y aquí existe fechada porque se
fijó a propósito para esta épica.

**Antes** (#295, mergeado en `2e88ff2`, o sea antes de que entrara el banco
republicado): batería completa, **104 tests, un solo rojo**, y ese rojo
**declarado con ticket** en el mapa `ESPERADOS` de `scripts/bateria.js` —
`test_halo_v7_e5.js` (#294), que no mide el código sino que lee `matriz_v7.json`,
archivada el 2026-08-17. Los otros tres rojos de fondo que había se arreglaron
allí, no se taparon.

**Después** (esta rama, sobre `1d737f7`, con el banco republicado y el golden ya
recapturado):

```
node scripts/bateria.js
```

> 104 tests en 61 min 23 s · 1 fallo esperado, con ticket: `test_halo_v7_e5.js`
> (#294) · **«Sin fallos nuevos»**

**El delta de la batería es cero.** Ni un guardián de imagen nuevo en rojo:
`test_golden_difusas`, `test_dso_texturas`, `test_consumidores_dso`,
`test_fuente_parche`, `test_sin_red_dso`, `test_ps1_nan_ausencia`,
`test_psf_produccion`, `test_psf_parche`, `test_nebulosa_planetaria`,
`test_nebulosas_emision_reflexion`, `test_resto_supernova`, `test_umbral_textura`
y `test_bilineal_parche` salen todos verdes. La razón es que la rotura que esta
épica causaba **ya se cobró dentro de #288**: el golden se recapturó allí con su
tabla de deltas (§2 de este mismo documento) y los demás guardianes leen las
fixtures de `scripts/fixtures/dso/`, que se republicaron con el banco. Lo que
queda escrito aquí es que después de todo eso la batería vuelve a su línea base
conocida, y no a una nueva.

El golden, además, se corrió suelto en esta máquina y salió **«GOLDEN: todo bit a
bit»**: la línea base capturada en R5 se reproduce aquí, así que la comparación
de la §2 es entre dos ejecuciones de la misma máquina y no entre máquinas.

**Dos salvedades sobre el reloj, que no afectan al veredicto.** Los 61 min de
esta corrida contra los 13 de la de #295 no dicen nada del código: la batería
compartió la máquina —8 GB con el swap lleno— con otra sesión que corría su
propia batería `--rapida`, y en este equipo el mismo test verde ya se ha medido
en 251 s y en 444 s. Ninguna afirmación de este documento se apoya en un tiempo.
