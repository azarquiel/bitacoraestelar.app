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
