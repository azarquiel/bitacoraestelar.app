# Prerregistro — validación a ciegas de H2c con observaciones de compañeros (#379)

Fecha: 2026-09-24. Se comprometió **antes** de calcular ningún margen sobre
las observaciones nuevas y antes de la búsqueda dirigida de «no visto». El
historial de git lo verifica. Ningún umbral se retoca tras ver la salida. Un
resultado que no convenza se registra igual, con su veredicto (ADR 0005 y
disciplina de los ADR 0022 y 0031).

Las decisiones de este documento las aceptó el usuario el 2026-09-24. Dos
cifras las fijó el asistente para concretar una regla aceptada: el 60 % del
acuerdo por clase y el tratamiento de los submuestreos sin mínimos. Se señalan
en su sitio.

## Qué se valida y qué no

Se contrasta la ley H2c (`K = 2,0`) con observaciones de campo que no se usaron
para calibrarla. **No se ajusta nada.** El ADR 0001:37 congela H2c y este
documento no toca ninguno de sus parámetros. Si la validación falla, la
decisión de recalibrar es de #380, con prerregistro propio.

## Datos

### Origen

- **Criba.** Reportes del mbox de correos procesados con
  `scripts/criba_correos.py` y extraídos con `registro/protocolo-llm-oal.md`.
  La tabla de clasificación ciega del 2026-09-24 tiene 119 filas: 85 visto,
  19 lateral, 10 no_visto y 5 sin dato. Las filas que falten por el fallo del
  anonimizador (corregido en 1f7269c) entran también como «criba» si se
  recuperan antes del corte.
- **Búsqueda dirigida de «no visto».** El usuario buscará observaciones
  «no visto» que sabe que existen. Reglas:
  - **Fuentes y método fijados ya:**
    - el mbox, revisando **todas** las filas con `no_visto = 1` del fichero
      privado, no solo las que recuerde;
    - las fichas y cuadernos propios y de compañeros que tenga a mano.
  - **Entra todo lo que la búsqueda encuentre y cumpla las reglas de datos**,
    no una selección.
  - **Entra la crónica entera.** Las demás galaxias observadas esa noche, vistas
    o no, entran con ella.
  - Cada fila lleva `origen = dirigida`. La referencia a la fuente vive solo en
    el fichero privado del usuario.
  - **El usuario no mira esas galaxias en el simulador** con el equipo de la
    observación antes de la ejecución.
- **Fecha de corte: 2026-10-15.** Lo que aparezca después va a otra validación.

### Circuito de cada fila

1. Extracción de datos, nunca de prosa, con el protocolo del ADR 0004 de
   `registro/`.
2. Clasificación a ciegas del usuario desde la cita literal: `visto`,
   `lateral`, `no_visto` o `sin dato`.
3. Compleción según las reglas D1–D5, sin mirar ningún margen.

Ninguna fila entra en la ejecución sin haber pasado por los tres pasos.

### Reglas de compleción (decididas antes de calcular)

- **D1 · Aumentos.**
  - Valen los escritos para esa observación.
  - Si no los hay, vale la correspondencia ocular → aumentos que escriba el
    observador **en la misma crónica** (por ejemplo «E8 230x» en una tabla
    inicial).
  - Si no hay ninguna de las dos cosas, la fila se excluye.
  - No se calculan aumentos a partir de focales.
- **D2 · SQM.**
  - Vale la lectura ligada al objeto o a su zona del cielo.
  - Si no la hay, la de la noche. Con una sola lectura, esa. Con varias, la
    mediana.
  - La fila se excluye si entre la lectura más alta y la más baja de la noche
    hay más de 0,5 mag/arcsec².
  - Sin ninguna lectura, la fila se excluye.
- **D3 · Apertura.**
  - Vale la del telescopio que la crónica nombra para esa observación.
  - Si esa noche se usaron dos y el texto no dice cuál, la fila se excluye.
  - Las pulgadas se pasan a mm (×25,4) por código.
- **D4 · Transmisión y seeing.** Los valores por defecto de
  `scripts/campo_h2c.js` (campo vacío): transmisión del render y seeing 2″.
- **D5 · Objeto.**
  - Solo galaxias de `BITACORA_GALAXIAS` para las que `margenDe` devuelve
    margen (θint y μ media definidos).
  - Se excluyen las observaciones a ojo desnudo y los grupos sin miembro
    individual (por ejemplo «Quinteto de Stephan»).

Toda exclusión se cuenta y se informa por motivo.

### Conjunto congelado

Tras el corte y la clasificación, las filas completas y anonimizadas (objeto,
apertura, aumentos, SQM, resultado, seudónimo del observador, origen) se
guardan en `simulador_ocular/docs/experimentos/ricco/campo/validacion_379.csv`.
Ese commit es **anterior** a la ejecución. No lleva nombres, correos ni
fechas de correo. Las 12 filas de `observaciones.csv` no entran: son las que
anclaron K.

## Medida

Una sola ejecución de `scripts/campo_h2c.js` sobre `validacion_379.csv`. El
único cambio admitido en el script es poder leer otro CSV y la columna
`origen`. El cálculo del margen y la regla de acuerdo no se tocan.

### Acuerdo por fila (el de `campo_h2c.js`, sin cambios)

- `visto` está de acuerdo si el margen es mayor que 0.
- `no_visto` está de acuerdo si el margen es menor que 0.
- `lateral` está de acuerdo si |margen| < 0,3 dex.

### Mínimos

Hacen falta **20 filas utilizables** y **6 `no_visto`** como mínimo. Si no se
llega a alguno de los dos, el veredicto es NO CONCLUYENTE y no se amplía la
búsqueda para llegar.

### Dirección de un desacuerdo

Es el sentido en que habría que mover K para que la fila quedara de acuerdo:

- **K baja:** `visto` con margen ≤ 0, o `lateral` con margen ≤ −0,3.
- **K sube:** `no_visto` con margen ≥ 0, o `lateral` con margen ≥ +0,3.

### Veredicto

Se evalúa en este orden:

1. **Mínimos.** Si no se cumplen, NO CONCLUYENTE.
2. **VALIDADA** si se cumplen las dos condiciones:
   - el acuerdo global es de al menos el 75 %;
   - cada clase con 3 filas o más tiene un acuerdo de al menos el 60 %.
     *(Cifra fijada por el asistente para la regla «acuerdo por clase».)*

   Con este veredicto, #380 se cierra sin ejecutarse.
3. Si no queda validada, se miran los desacuerdos. ρ es la correlación de
   Spearman del margen de los desacuerdos con el SBe (cielo en el ojo) y con
   θint (tamaño de la galaxia):
   - **DERIVA CON EL FONDO** si |ρ(margen, SBe)| ≥ 0,4. Se documenta y va a
     #343. No es un cambio de K.
   - **DEPENDENCIA DEL TAMAÑO** si |ρ(margen, θint)| ≥ 0,4. Se documenta como
     bloqueo, igual que en `campo_h2c.js`. No es un cambio de K.
   - Si se dan las dos, se documentan las dos.
   - **SESGO DE NIVEL** si ninguna de las dos se da y al menos el 70 % de los
     desacuerdos van en la misma dirección. #380 se ejecuta.
   - En cualquier otro caso, NO CONCLUYENTE.

### Robustez: el veredicto tiene que sobrevivir a dos pruebas

- **Quitar un observador cada vez.** Se repite el veredicto sin cada uno de
  los observadores.
- **Con y sin búsqueda dirigida.** Se repite el veredicto solo con las filas de
  `origen = criba`.

En estos submuestreos no se vuelven a exigir los mínimos, y el acuerdo por
clase solo se exige a las clases con 3 filas o más. *(Tratamiento fijado por el
asistente: sin él, cualquier submuestreo pequeño daría NO CONCLUYENTE por
construcción.)*

Si el veredicto cambia en alguno de los submuestreos, el veredicto final es NO
CONCLUYENTE.

### Informe

El informe se escribe en `simulador_ocular/docs/experimentos/` con fecha y
commit. Da:

- el acuerdo global y por clase;
- los desacuerdos con su dirección;
- los dos ρ;
- las exclusiones por motivo;
- el desglose por observador y por intervalo de SBe (para #343 y #380);
- los submuestreos de robustez.

## Criterio de parada

- Cuenta una sola ejecución: la primera que produzca las cifras de arriba.
- Una ejecución que aborte antes de dar cifras (excepción o CSV mal formado) no
  cuenta. Se arregla la causa, se anota y se repite (ADR 0005).
- NO CONCLUYENTE cierra #380 sin ejecutarse. No se repite con otros umbrales,
  otras reglas de compleción ni otra fecha de corte.
- Reabrir exige datos nuevos, recogidos después del corte y con prerregistro
  propio.

## Lo que este prerregistro no decide

- Ningún valor nuevo de K. Eso es #380.
- Ningún cambio de `C_EXP`. Eso es #343.
- Las observaciones de cúmulos. Su validación es la de #113.
