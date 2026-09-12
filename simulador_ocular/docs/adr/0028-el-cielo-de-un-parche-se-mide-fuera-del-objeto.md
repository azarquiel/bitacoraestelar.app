# El cielo de un parche se mide fuera del objeto, no en su marco

Decidido el 2026-09-12 con las medidas de #274 delante
(`simulador_ocular/docs/validacion/suelo_cielo_parche.md`), contra los listones
comprometidos antes de medir en el ADR 0027 y su enmienda.

Este ADR **decide la ley; no la implementa**. El código sigue como está hasta
que se haga el ticket de implementación, que arrastra la recaptura de golden y
una republicación del banco.

## El problema, en una línea

`ps1Cielo` y `ps1SigmaCielo` leen el marco exterior del 6 % del parche y dan por
supuesto que es cielo. En **43 de las 68 texturas del banco** ese marco cae
dentro del objeto en más del 20 % de sus píxeles, así que el suelo de
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

- **E1, agrandar el parche.** Tiene un techo que no se arregla pagando: 5 de los
  68 piden un lado por encima de `ladoMax` = 20′. Y en NGC 1788 el lado que pide
  la fórmula —calculado sobre el semieje de catálogo— sigue dejando nebulosa en
  el marco, porque el objeto real es mayor que su fila: el perfil del parche de
  12′ da 205 DN de mediana entre 72 y 108″.
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
