# Cómo se recaptura el golden de la capa difusa

`scripts/test_golden_difusas.js` es un SHA-256 bit a bit de `parche.datos` y del
`difuso` pintado, para M51, M101, M104 y M81 en dos configuraciones. Cualquier bit
distinto es un fallo, y eso es lo que se quiere: es el guardián que avisa de que
la ley cambió sin que nadie lo dijera.

El catálogo de texturas DSO lo va a romper **a propósito** varias veces. Esta nota
es el procedimiento para que cada rotura sea auditable en vez de un `--capturar` a
ciegas. Vale para cualquier recaptura futura, no solo para las texturas.

## La regla

**Una causa por recaptura, un commit por recaptura.** Si dos cambios entran a la
vez, el hash nuevo no dice cuál movió qué y la tabla de deltas deja de ser prueba
de nada. Es la única regla que no admite prisa: recapturar es barato, atribuir
después de haber mezclado dos causas no lo es.

## Las recapturas previstas del catálogo de texturas

En este orden, cada una con su commit, su tabla y su invariante propio:

| # | Causa | Qué debe cambiar | Qué NO debe cambiar |
|---|---|---|---|
| R1 | **WCS del recorte** (`lib_bajar_parche.js` con `conWcs`): el afín pasa a llevar el giro de la skycell | `parche.datos` y los dos `difuso` de los cuatro objetos | `thetaIntArcmin` (sale de la fila de catálogo, no del parche). La cuenta de NaN puede moverse: el giro recoloca la costura |
| R2 | **La fuente pasa a ser la textura** (fase 1, `asinh16` a `salida = 1024`) | `parche.datos` y los `difuso`, dentro de L1.1 | `thetaIntArcmin`; los **NaN heredados del stack** (0 píxeles de diferencia); la cuenta total de NaN solo puede moverse por la frontera de ausencia y dentro del tope de L1.1 |
| R3 | **Resolución por objeto** (fase 2, regla C) | todo, incluidos `ancho`/`alto` | `thetaIntArcmin`; el flujo total por objeto, dentro del ±2e-3 de L2.3 |
| R4 | **Máscara offline** (fase 3) | nada, si la ley se movió de sitio sin cambiar | L3.1 pide **bit a bit idéntico**: si el hash cambia, la fase 3 falló, y no se recaptura |

R1 no estaba prevista en el objetivo: apareció al medir la fase 0
(`docs/validacion/dso_texturas_fase0.md`, discrepancia 6). Va **antes** que R2 y
en su propio commit, porque si entran juntas no hay forma de saber si un delta lo
puso el giro o la codificación.

## El procedimiento

**0 · La máquina.** Los hashes dependen de `libm` (`Math.exp`, `Math.pow`) y de la
versión de Node: el golden garantiza no-regresión en **una misma máquina**, no es
un contrato entre máquinas. Anota `node --version` y la máquina en la tabla. Si
recapturas en otra, la comparación con la línea base anterior no significa nada y
hay que decirlo en el informe en vez de presentarla como delta.

**1 · Verde antes de tocar nada.**

```
node scripts/test_golden_difusas.js
```

Tiene que salir «todo bit a bit» **antes** del cambio. Si ya falla, para: la línea
base no es la tuya y lo que estás a punto de capturar arrastra una regresión de
otro. Investiga primero; la foto de fallos previos que sirva de referencia va
fechada, porque la lista cambia.

**2 · Aplica el cambio. Uno solo.** Nada de aprovechar el commit para otra cosa.

**3 · Mide los deltas agregados**, sin capturar todavía:

```
node scripts/test_golden_difusas.js > /tmp/golden_delta.txt; echo $?
```

La salida trae, por objeto, la suma de `parche.datos`, la cuenta de NaN y la suma
de cada `difuso`. Eso es lo que el golden sabe decir.

**4 · Mide los deltas que el golden no puede dar.** El fichero de línea base
guarda hashes y agregados, **no píxeles**, así que `max|Δ| ≤ 0,05·σ` no sale de
ahí: hace falta un comparador que tenga los dos caminos vivos en el mismo proceso.
Para R2 ese comparador es el propio listón L1.1 de la fase 1. Para R1 basta con
montar el mismo objeto con `conWcs` apagado y encendido y restar.

**5 · Juzga antes de capturar.** Compara contra los umbrales de la fase (L1.1 para
R2, L2.3 para R3, L3.1 para R4). **Si algo se sale, no se captura**: se documenta
el fallo y se decide, que para eso el ADR 0024 tiene vías de escape y topes duros.
Capturar primero y justificar después convierte el guardián en un sello de goma.

**6 · Captura.**

```
node scripts/test_golden_difusas.js --capturar
git diff --stat scripts/fixtures/golden_difusas.json
```

Comprueba que solo cambió lo que esperabas: si R1 mueve `thetaIntArcmin` o R2
mueve los NaN heredados, el cambio no era el que creías.

**7 · Escribe la tabla** en el informe de la fase, en `docs/validacion/`. Una fila
por objeto y magnitud, con la plantilla de abajo.

**8 · Un commit**, con la línea base nueva, la tabla y el cambio que la causó.
El mensaje dice **qué causa** la movió y **cuál era el umbral**.

## Plantilla de la tabla de deltas

> Recaptura R_ · causa · fecha · `node vX.Y.Z` · máquina
>
> | Objeto | sha256 antes → después | Δsuma / suma | NaN antes → después | max\|Δ\|/σ | Umbral | Veredicto |
> |---|---|---|---|---|---|---|
> | M51 | `a1b2c3…` → `d4e5f6…` | | | | 0,05 σ | |
> | M101 | | | | | | |
> | M104 | | | | | | |
> | M81 | | | | | | |
>
> Y una fila por cada `difuso` (457,2 mm · 190× · SQM 21,2 y 203 mm · 100× ·
> SQM 20,5), donde el umbral es el mismo que el de su `parche.datos`.

## Qué invalida una recaptura

- **Dos causas en el mismo commit.** No hay tabla que lo arregle.
- **Capturar sin haber corrido antes la comparación.** El delta no existe si nadie
  lo midió: el fichero viejo ya no está y `git show HEAD~1` da hashes, no píxeles.
- **Capturar en una máquina distinta** de la que fijó la línea base anterior, sin
  decirlo.
- **Capturar con el golden ya rojo** por otra cosa.
- **Regenerar la línea base de otro guardián «de paso».** Algunas líneas base son
  irrecuperables una vez sobrescritas —el guardián de la semántica NaN
  (`test_ps1_nan_ausencia.js`) tiene un modo `actual` que fija la línea base del
  módulo *previo* y no se puede volver a fabricar—. Si un guardián que no es el
  golden se pone rojo durante una recaptura, se investiga; no se recaptura.

## Si el golden falla y no había recaptura prevista

Entonces no es una recaptura: es una **regresión**. No se captura. Se busca qué la
causó, y si resulta que el cambio era deliberado, se convierte en una recaptura
con este mismo procedimiento —causa declarada, tabla y commit propio—, no en un
`--capturar` para poner la suite en verde.
