# El cielo de un parche se mide fuera del objeto, no en su marco

Decidido el 2026-09-12 con las medidas de #274 delante
(`simulador_ocular/docs/validacion/suelo_cielo_parche.md`), contra los listones
comprometidos antes de medir en el ADR 0027 y su enmienda.

Este ADR **decide la ley; no la implementa**. El código sigue como está hasta
que se haga el ticket de implementación, que arrastra la recaptura de golden y
una republicación del banco.

## El problema, en una línea

`ps1Cielo` y `ps1SigmaCielo` leen el marco exterior del 6 % del parche y dan por
supuesto que es cielo. En **35 de las 68 texturas del banco** ese marco cae
dentro del objeto en más del 20 % de sus píxeles —25 RfN, 5 HII y 5 galaxias;
ninguna PN ni SNR—, así que el suelo de
`cielo + 1,5·σ` sube con el propio objeto y lo apaga. En el caso extremo
—NGC 1788— el parche entero es nebulosa y no queda ni un píxel de cielo dentro.

## Decidido

1. **El cielo y la σ de un parche salen de una petición aparte, centrada fuera
   del objeto** (opción E4 del ticket). Es la única de las cuatro que puede
   acertar cuando el parche no contiene cielo, y ese es justo el caso que hoy
   rompe el banco.
2. **La σ se mide a la misma escala que el parche de producción.** σ es por
   píxel: medirla sobre un recorte más grande al mismo número de píxeles la
   subestima por el tamaño del píxel, no por la ley (medido: ×3,4 de diferencia
   en IC 0059). El cielo, que es una mediana, sí se puede medir en un recorte
   grande.
3. **Los dos números viajan en el sidecar** y el runtime los usa en vez de
   recalcularlos del marco.
4. **La implementación republica el banco.** El hash de `version()` no se mueve
   —ninguno de estos parámetros entra en la semilla— pero el sidecar se sirve
   como inmutable, así que escribir otro contenido bajo el mismo nombre no vale
   (ADR 0026, punto 3). La vía es subir `GENERADOR`.

## Lo que se descarta, y con qué medida

- **E1, agrandar el parche.** Medida bajando el parche con el lado que E1 pediría
  y aplicándole la ley de hoy: **acierta el cielo en 7 de los 8 objetos que se
  pudieron medir** (|Δ| ≤ 0,23 σ). No se descarta por inútil. Se descarta por
  dos cosas: falla justo en el caso que rompe el banco —NGC 1788, 2,27 σ de
  pedestal con el marco ya geométricamente fuera del objeto, porque la talla de
  catálogo se queda corta frente a la nebulosa real—, y 4 de los 68 piden un lado
  por encima de `ladoMax` = 20′. Y cuesta lo mismo que E4: republica el banco.
- **E2, medir fuera de la escena dentro del mismo parche.** No arregla el caso
  que importa: deja el cielo de NGC 1788 a 3,25 σ del verdadero, porque ahí
  dentro no hay cielo que medir. Sobre los nueve afectados: mediana
  \|log₂(σ/σ_patrón)\| = 0,40, máximo 2,61.
- **E3, σ ciega a la estructura.** No produce cielo, que es donde está el error
  grande, y en los parches sobremuestreados no produce ni σ: NGC 1788 se publica
  a 0,105″/px contra los 0,25″ nativos de PS1 y el 58 % de sus píxeles vecinos
  son idénticos, así que la MAD de sus diferencias vale 0.
- **La ley de hoy (L0)** tampoco pasa: mediana 0,42, máximo 2,46 y hasta 5,22 σ
  de error en el cielo.

## Lo que la medida no llegó a cerrar, y se dice

- **El listón 1/2 no discrimina a favor de E4: E4 *es* el patrón.** Ninguna
  opción independiente lo pasó. Lo que decide a favor de E4 no es ese empate
  trivial, sino dos medidas: que en NGC 1788 no hay cielo dentro del parche
  (§4 del informe) y que E1, que sí acierta en 7 de 8, falla justo ahí y además
  no alcanza a 4 objetos.
- **El listón 4 estaba mal escrito** y lo suspendía hasta la ley de referencia,
  porque el anillo interior de NGC 6888 contiene su estrella Wolf-Rayet. La
  versión corregida —sin ese anillo— la pasan todas las opciones, con razones de
  1,37 a 1,80 contra la de L0, 1,80. Corrección post hoc, marcada como tal.
- **El listón 3 se midió para E2 y E3 en los cuatro controles y para E4 solo en
  NGC 5194** (Δ 0,12 mag / 0,1 pt): los parches grandes de NGC 3031, NGC 4594 y
  NGC 4486 no se pudieron bajar. E1 no tiene columna de no regresión.
- **Los listones se evaluaron sobre los 9 objetos del banco del prerregistro**,
  no sobre los 35 que la regla de afectado señala. Es el banco fijado en el
  ADR 0027, pero cubre una cuarta parte de los afectados.

## Lo que este ADR NO decide

- **`kRuido` no se toca.** Es lo que discute #273, y depende de que este metro
  esté bien puesto.
- **La escala del parche no se toca aquí**, aunque la medida dejó claro que
  buena parte de los 9,65 mag de dispersión del suelo efectivo que midió #263 es
  la escala (13× entre objetos) y no la σ. Eso es otra decisión.
- **E3 al paso nativo** —agrupar hasta 0,25″/px antes de mirar vecinos— salió
  buena estimadora de σ en una medida **post hoc** (mediana 0,28, máximo 0,68).
  No entra como ley: si se quiere usar, necesita su propio prerregistro. Y en
  ningún caso sustituye a E4, porque el cielo lo sigue poniendo otro.

## Consecuencias

- El generador pasa a hacer **dos peticiones por objeto**: el parche y su campo
  vecino. La caché del proxy sirve las dos igual.
- Un objeto sin campo vecino utilizable —sin cobertura, o con otra difusa
  dentro— tiene que decirlo en el sidecar, no callarlo: sin cielo medido, la ley
  vieja es lo único que queda y el objeto queda marcado.
- El ticket de implementación decide qué hacer con los parches ya publicados
  mientras la republicación no esté hecha.
