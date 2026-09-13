# Los criterios de #284, medidos con el cielo que se publicó (#308)

2026-09-13. La épica #284 cerró sus cinco historias sin medir sus cinco criterios
de éxito. Esto los mide, y los mide **contra la ley que se sirve**: el par
(cielo, σ) que cada sidecar publica desde #286, no el patrón de cielo lejano de
#274. Reproducir con:

```
node scripts/harness_suelo_cielo.js --opciones [--dir <banco>]
```

La columna nueva es **SC**. No es una opción a elegir entre E1–E4: es lo que ve
el usuario en pantalla.

## Por qué hacía falta, y qué estaba mal medido

La columna «producción» del arnés llamaba a `ps1AnclarACatalogo` **sin** pasarle
`cielo` ni `sigma`. Esa función cae a la ley del marco cuando no recibe el par
(es su comportamiento correcto: el proxy en caliente y las texturas anteriores a
la republicación llegan sin él), así que la columna medía **la ley vieja
creyendo medir la nueva**. Ahora recibe el par que lee `ps1CieloDeSidecar`, que
es la misma función que mira el runtime, así que no se define ninguna ley aquí
(ADR 0008).

## Criterio 1 — NGC 1788: del 100 % apagado al 0 %

**Pasa en lo esencial, pero el número no es cero: es 1,4 %.**

| ley | cielo / σ (DN) | extensión apagada |
|---|---|---|
| L0, la del marco del 6 % | 754,0 / 796,9 | **100,0 %** |
| E4, el patrón de cielo lejano | −1,5 / 144,7 | **0,0 %** |
| **SC, lo que se publica** | **163,8 / 144,7** | **1,4 %** |

El anclaje de producción, ya alimentado con el par del sidecar, da también
**1,4 %**: la cuenta del arnés y la de producción coinciden en este objeto.

La σ publicada es **exactamente la del patrón** (144,7). Lo que no llega a cero
es el cielo: el campo vecino de NGC 1788 está a **2,7′** y ahí la nebulosa
todavía llega, así que su cielo sale a 163,8 DN contra los −1,5 del anillo
lejano. Es 1,14 σ de pedestal residual, frente a los 5,22 σ que tenía con el
marco.

Dicho sin adornos: **el objeto pasa de borrarse entero a perder el 1,4 % de su
extensión**, que es lo que la épica venía a conseguir; y el 0 % exacto solo sale
con un cielo que el generador no puede medir sin alejar más el campo vecino. Eso
último no es de este ticket, pero queda escrito.

## Criterio 2 — los cuatro controles de parche holgado no se mueven

**Pasa, con margen.** Listón: Δ suelo efectivo ≤ 0,20 mag y Δ apagados ≤ 5
puntos, contra L0.

| control | suelo L0 | apagados L0 | SC |
|---|---|---|---|
| NGC 5194 | 37 DN/as² | 25,0 % | Δ0,12 mag / 0,1 pt · ok |
| NGC 3031 | 29 | 23,5 % | Δ0,03 mag / 0,2 pt · ok |
| NGC 4594 | 97 | 0,8 % | Δ0,03 mag / 0,0 pt · ok |
| NGC 4486 | 178 | 0,1 % | Δ0,03 mag / 0,0 pt · ok |

Donde el marco ya era cielo, la ley nueva no cambia nada. Y **cubre más que E4**:
NGC 4594 y NGC 4486 no tienen patrón —STScI no sirvió sus parches grandes— pero
sí tienen campo vecino publicado, así que SC los mide y E4 no.

## Criterio 3 — NGC 6888 sigue sin estructura

**Pasa: 1,41, contra el 1,80 del listón.**

| ley | anillos 0–0,5 / 0,5–1 / 1–1,5 / 1,5–2 / 2–3 / 3–4 `r_e` | razón sin el anillo interior |
|---|---|---|
| L0 | 42,9 / 12,9 / 12,4 / 17,8 / 13,1 / 9,7 % | **1,85** |
| E4 | 58,6 / 21,4 / 20,4 / 24,7 / 20,5 / 17,8 % | 1,39 |
| **SC** | 57,5 / 20,8 / 19,8 / 24,2 / 20,0 / 17,1 % | **1,41** |

El anillo 0–0,5 `r_e` se excluye porque ahí está la Wolf-Rayet central: incluido,
la razón suspende a todas las opciones y también a la ley de referencia (L0 da
4,44), y un listón que suspende a su propia referencia no discrimina nada
(ADR 0005). Es la corrección que #263 ya había formulado.

**Un descuadre que hay que decir**: el informe de #274 publicaba 1,80 para L0, y
la cifra de verdad es **1,85**. El 1,80 era `18/10` con los porcentajes de la
tabla ya redondeados a entero; el código divide los crudos (17,8 / 9,7). No
cambia ningún veredicto —SC da 1,41 y pasa con cualquiera de los dos—, pero el
1,80 llegó a usarse como listón en el ticket de este cierre, así que:

- La tabla de `suelo_cielo_parche.md` §5 **queda enmendada** con las razones que
  calcula el arnés (1,85 · 1,36 · 1,49 · 1,39), con su nota fechada.
- El arnés pasa a imprimir los anillos **con un decimal**, para que nadie vuelva
  a rehacer la división a mano sobre enteros.

El listón sigue siendo el 1,80 publicado: bajarlo a 1,85 porque es lo que da la
ley vieja sería medir parecido con la ley que se sustituye, y eso ya se decidió
que no vale.

## Criterio 4 — ningún objeto con cielo inventado

**Pasa.** Sobre el banco entero, no sobre la muestra de trece:

- **64 objetos** con el cielo medido fuera del objeto.
- **4 objetos** con la ley del marco, que es lo único que les queda, cada uno con
  su motivo y **por su nombre**: NGC 205, IC0131, IC0143 y NGC2023, los cuatro
  `vecina-dentro`.

Ninguno se queda con un cielo inventado y ninguno se calla: es lo que #287 puso
y aquí se comprueba sobre los 68.

## Criterio 5 — banco republicado, golden recapturado, batería en su línea base

**Hecho**, en #288 y #289. La tabla de deltas del golden está en
`recaptura_r5_cielo_vecino.md` §2, y la línea base de la batería en su §7.

## Comprobado

Lo que se tocó es un arnés, no producción: `resources/js/bitacora-ps1.js` no
cambia ni una línea, y por eso ningún hash se mueve.

- `node scripts/bateria.js` — **104 tests en 13 min 27 s, un solo rojo, el
  declarado de #294, «sin fallos nuevos»**: la misma línea base que dejó #289.
- `node scripts/test_golden_difusas.js`, `test_dso_texturas.js`,
  `test_fuente_parche.js` y `test_consumidores_dso.js`, corridos aparte: verdes.

## Lo que estas medidas NO cierran

- **Los listones 1 y 2 del prerregistro, con SC, NO pasan**: mediana \|log₂(σ/σ_patrón)\|
  **0,00** —la σ publicada clava la del patrón—, pero el máximo de \|Δcielo\|/σ es
  **1,14**, y el listón era 0,50. El culpable es NGC 1788, otra vez y por lo
  mismo. Esos listones eran de #274, para elegir entre opciones, y no son
  criterios de esta épica; pero conviene no leerlos como aprobados.
- **NGC 7293 es el segundo objeto donde la ley publicada no clava el patrón**: σ
  28,8 contra 41,1 (log₂ −0,51). Su campo vecino mide menos ruido que el anillo
  lejano, y eso no se ha investigado aquí.
- **«Producción» y SC no coinciden en todos los objetos** —NGC 5194 da 7,1 %
  contra 24,9 %, NGC 5457 39,6 % contra 56,7 %—. No es una contradicción: el
  anclaje hace más cosas que la condición pelada (aparta los NaN de ausencia y
  reparte el flujo del catálogo), y la columna SC es la condición sola. Las dos
  se imprimen juntas a propósito.
