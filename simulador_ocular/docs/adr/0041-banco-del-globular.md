Fecha: 2026-11-21
Estado: aceptada

# Banco del globular: qué pasa fuera de r_t

Spike #601 (épica #598), que bloquea #583. El banco del globular (glosario de
`simulador_ocular/CONTEXT.md`) guarda las estrellas de Gaia DR3 con G ≤ 20 de
un globular con su marca de estrella de campo de VB21. Quedaba por decidir qué
se hace con la parte del ocular que cae fuera de r_t:

- **(A)** cono completo a Gaia, como hoy; dentro de r_t, las filas del banco
  sustituyen a las de Gaia;
- **(B)** banco dentro de r_t y a Gaia solo el anillo `ocular ∖ r_t`;
- **(C)** banco ampliado hasta R_MAX, el radio del campo más ancho, sin Gaia.

## Regla prerregistrada (issue #601, fijada antes de medir)

1. Gana (C) si el banco ampliado de toda la población cabe en ≤ 1 GB.
2. Si no, gana (B) si en los campos de 60-90′ baja las filas de Gaia ≥ 50 %
   (mediana) en ≥ 2/3 de los cúmulos de la muestra.
3. Si no, (A).

## Medida

Script: `scripts/spike_601_banco_globular.py`. Tablas:
`simulador_ocular/docs/validacion/banco_globular_601.tsv` (A y B por cúmulo,
campo y centrado/desplazado) y `banco_globular_601_c.tsv` (C por globular).

- **Población: 143, no 138.** Los 143 globulares de `globulares-datos.js` están
  en VB21. 142 casan a menos de 2′; Terzan 10 casa a 8,6′, porque Harris trae
  una posición vieja. La cifra de 138 de `pertenencia-vb21.md` no se reproduce.
  Contar 5 más solo juega en contra de (C).
- **Equipo de referencia:** reflector de 200 mm y ocular de 52°.
  `magConsultaGaia` y `radioConsulta` reales, cuantizados como el proxy:
  30′ → 0,36°, G ≤ 17,5; 60′ → 0,72°, G ≤ 17,0; 90′ → 1,08°, G ≤ 17,0.
  R_MAX = 1,08°.
- **Muestra de 30.** Estratificada en |b| < 10°, 10-30° y > 30°, y en cada
  franja por mitad de r_t: 5 por casilla, a paso fijo, sin azar. M13 y M22 se
  midieron de contraste, fuera de la regla.
- **(A) y (B):** filas de un histograma de GAVO por píxel de 1′ y tramo de
  0,5 mag. Los bytes son una estimación: filas × 63,3 B, el JSON del TAP
  medido en una muestra de 2000 filas de M13.
- **(C):** `COUNT(*)` exacto en GAVO, G ≤ 20, en el cono de R_MAX de los 143.
  Peso = filas × 12 B + 188 B de cabecera. R_MAX sale de `radioConsulta`
  (exportada para esto) y `gaia_cuantizar`, leídas de producción (ADR 0008). Los 12 B son la fila del Avance;
  la marca de campo va en el bit alto de G (formato de #583), así que no
  añade bytes.
  1 GB = 2³⁰ B, lo más favorable a (C). Contraste: el estimador de las
  cabeceras del Avance da ×0,994.

### Resultado

| Paso | Medido | Listón | Pasa |
|---|---|---|---|
| 1 · (C) | 100 473 781 filas, **1,123 GiB** (1,206 GB) | ≤ 1 GB | no |
| 2 · (B) | **2/30** cúmulos con bajada mediana ≥ 50 % | ≥ 20/30 | no |
| 3 · (A) | — | — | **gana** |

- **(C)** lo pesa el bulbo: los 62 globulares con |b| < 10° son 0,980 GiB del
  total. NGC 6528, 6522 y 6540 superan los 3,7 M de filas cada uno.
- **(B)** no ahorra porque r_t es pequeño frente al ocular. La bajada mediana
  es del 9 % a 60′ y del 4 % a 90′. Solo pasan ω Cen (86 %, r_t = 48′) y
  M3 (76 %). Fuera de la regla, M13 baja un 59 % y M22 un 39 %. Es el caso
  malo que preveía el prerregistro.
- **(A)** sigue pidiendo a Gaia el cono entero. En la muestra, a 90′, son
  1,9 MB de mediana y 19,5 MB como máximo. Su tiempo es el de producción:
  39,5 s de mediana en frío en las consultas densas (`?stats=1`, 2026-11-21).
- **(B) en frío, de contraste: sin tiempo.** Los 5 cúmulos con más anillo a
  90′ (NGC 6558, 6441, 6626, 6304 y 6440), a 2 jobs, en síncrono en GAVO: los
  5 dan HTTP 500 a los ~21 s, el corte síncrono de GAVO. Ninguno termina en
  síncrono, así que el anillo del bulbo también iría a la cadena asíncrona.
  No se midió su tiempo en esa cadena.

**La regla da (A).**

## Decisión del dueño, tomada después de medir

Con la medida delante, el dueño del producto amplía el presupuesto de disco
del banco a **1,25 GB** y **elige (C)**. El banco ampliado cabe en cualquiera
de las dos lecturas de GB: 1,123 GiB o 1,206 GB (10⁹ B).

- **Esto no es la regla.** El listón de 1 GB (2³⁰ B) no pasó. La ampliación es una
  decisión de producto, posterior a la medida, y queda escrita aquí como tal.
- **Por qué:** (A) no resuelve el problema de la historia. M13 o M22 a 60-90′
  siguen pidiendo el cono denso a Gaia en cada desplazamiento del campo. Con (C)
  y la franja, el núcleo no se pide nunca: dentro de R_MAX todo sale del
  banco. El disco medido entra en el margen elegido.
- **Lo que (C) no cubre.** R_MAX es el radio del campo de 90′ centrado. Un
  campo de 60′ cabe hasta medio radio de desplazamiento (0,36 + 0,72 =
  1,08°). Uno de 90′ deja de caber en cuanto se desplaza: con medio radio
  llega a 1,62°. Cubrir el 90′ desplazado pediría R_MAX ≈ 1,62°, unas 2,25
  veces el área, que no cabe en 1,25 GB.
- **Fuera de R_MAX, a Gaia solo la franja** (decisión del dueño, 2026-11-22).
  Los datos del cúmulo no se piden nunca a Gaia. Si el cono del ocular se sale
  de R_MAX, el proxy pide solo lo de fuera:
  `CONTAINS(ocular) = 1 AND CONTAINS(R_MAX) = 0`, donde el círculo de R_MAX
  está centrado en el cúmulo. Es la consulta de (B) con R_MAX en lugar de r_t.
  Si el ocular cabe entero en R_MAX, no hay consulta.
- **Qué cambia en el proxy.**
  - Un parámetro nuevo con el círculo excluido: centro del cúmulo y R_MAX.
  - Ese parámetro entra en la clave de caché. Una franja y un cono con el
    mismo centro no son la misma entrada.
  - El Avance (G < 15) se recorta igual: fuera de R_MAX y dentro del ocular.
- **Lo que cuesta.** La franja está siempre a más de 1,08° del cúmulo: es
  campo, sin núcleo denso. Hacia el bulbo puede seguir siendo densa. Los 5
  anillos de (B) en el bulbo no terminaron en síncrono (HTTP 500 a ~21 s),
  y la franja de un campo del bulbo irá también a la cadena asíncrona, como
  hoy cualquier campo denso. No se ha medido su tiempo. Lo que sí se quita
  siempre es el núcleo del globular.

## Por qué va aparte del Avance

- El Avance (ADR 0033) es por celda HEALPix, llega hasta G < 15 y no depende
  de ninguna regla.
- El banco es por objeto, llega hasta G ≤ 20 y lleva la marca de campo de una
  regla de pertenencia que puede cambiar (#596).
- Mezclarlos obligaría a regenerar 49 152 celdas por un cambio de regla.
  Aparte, se regeneran 143 ficheros.

## Consecuencias para #583

- El banco se genera hasta R_MAX = 1,08°, no hasta r_t. Son unos 100 M de
  filas, 2,7 veces el Avance (36,9 M): la descarga es la parte grande de #583.
- **Aviso para #583 (fuera del alcance de este spike).** El criterio 6 no se cumple tal cual. En 102 de los 143
  globulares, el radio del catálogo de VB21 es menor que r_t: VB21 corta en
  2-40′. Con «radio de VB21 ≥ r_t o falla», fallarían 102. Más allá del radio
  de VB21 no hay `memberprob`: esas estrellas cuentan como miembros, como
  hoy. Propuesta, que se decide en #583: que el criterio diga eso en vez de
  fallar.
- Los `COUNT` de `banco_globular_601_c.tsv` son el oráculo de «filas = COUNT
  de Gaia» del `--validar`, mientras R_MAX siga en 1,08°.
- **Estimación de #583: 13 pts.** Repartidos así:
  - generador con descarga reanudable de ~100 M filas y cruce con VB21;
  - formato `BGLO`;
  - cliente que sirve el banco dentro de R_MAX y pide la franja fuera;
  - proxy con el círculo excluido en la consulta, en la clave de caché y en
    el recorte del Avance, con sus tests PHP;
  - `--validar`.
  La franja es lo que sube la estimación de los 8 pts sin ella a 13.

## Implementación (#583, 2026-11-22)

Lo que #583 decidió al construirlo, donde el texto de arriba no llegaba:

- **Criterio 6.** Se adopta la propuesta: la cabecera lleva el radio de VB21
  de cada globular y `--validar` exige que esté escrito (> 0), no que sea ≥ r_t.
  Más allá de ese radio no hay `memberprob` y la estrella es miembro, como antes.
  La densidad plana lleva margen de Poisson (3σ sobre el doble): en el test, el
  caso malo (todo el núcleo marcado) da 52 contra un techo de 20.
- **El Avance no se recorta en los campos con banco.** Arriba se decía que el
  Avance se recortaría a la franja. No hace falta: las filas del banco salen al
  instante y hasta G ≤ 20, así que **ellas** son la vista provisional mientras
  llega la franja, y la franja va sin `desde`. Una pieza menos (no hay
  `desde` + `excl` combinados en el cliente; el proxy los admite igual).
- **El círculo excluido es R_MAX − 0,01°** con el centro al 0,001°: el proxy
  redondea `r` hacia abajo, así que la franja siempre solapa el banco y nunca
  deja un hueco; el cliente recorta el banco al mismo círculo, sin duplicados.
  Si el cono cabe en el círculo, el proxy responde `{"data":[]}` sin caché ni TAP.
- **Un banco por vista** (el más cercano). En las parejas del bulbo (NGC 6522 y
  6528, a 0,27°) el segundo llega por la franja sin marca. Anotado como
  `shortcut:` en `bancoDelCono`.
- **Banco por encima del techo.** Si en el cono hay más de 200 000 filas, el
  cliente hace lo mismo que la segura del proxy: las 40 000 más brillantes y el
  resto como `fondo` (momentos y velo espacial N = 8), sobre el área del cono.
- **Límites aceptados** (revisión de #583):
  - El banco corta en G < mag y el proxy en G ≤ mag: solo difiere una estrella
    con G exactamente igual a la mag cuantizada.
  - El techo se aplica por mitades (banco y franja, 40 000 cada una) y el
    `fondo` unido toma el corte menor. Solo pasa con un núcleo de más de
    200 000 filas en el cono y además una franja densa.
  - Por encima del techo, las estrellas de campo más débiles que las 40 000
    primeras pasan al velo con las demás, como en la segura del proxy: no
    cuentan como luz del cúmulo, pero dejan de pintarse una a una.
  - El cliente recorta la franja al círculo: un proxy viejo que ignore
    `excl` no duplica el núcleo. La regla de la cabecera tiene que ser la del
    manifiesto, o el banco no se usa.
  - `--validar` mide el campo de referencia en 4-8 r_h, o en 2-4 r_h si VB21
    recorta el anillo a menos de la mitad (Terzan 3: 4,0008 r_h, 0,02′²; el
    caso malo sigue fuera: 8,4× en M13). Con VB21 < 3 r_h o sin r_h en Harris
    no mide: no falla, pero lista esos globulares (21 de 143).
- **Range.** Las filas van ordenadas por G y la cabecera trae el histograma: el
  cliente pide la cabecera y después solo hasta su magnitud. A G ≤ 17 se baja
  una fracción del fichero (M22: 19,7 MB enteros).

### La caché, revisada al tocarla (nota `eliminar-cache-proxy.md`)

- **La clave por vista sí se repite.** El desplazamiento del campo va en pasos
  discretos del 10 % (`centroDesplazado`), así que dos observadores en el mismo
  objeto, ocular y paso piden la misma clave. Una rejilla más gruesa del centro
  no aporta: se descarta. El ratio bajo es diversidad de objetos y equipos.
- **Lección 5 aplicada:** el cliente pide al proxy ya cuantizado (centro al
  0,001°, radio al 0,01° ↑, mag al 0,5 ↑). La URL es la clave del disco y la
  caché del navegador acierta lo mismo que la del servidor.
- **Lo grande no es la caché:** el núcleo de los globulares, lo que costaba
  ~40 s en cada desplazamiento, ya no pasa por el proxy. Es un fichero
  estático inmutable con caché HTTP de un año.
- **Queda fuera** (lección 7): separar el almacén del resultado asíncrono de la
  caché de aciertos. No lo necesita #583.

## Formato 2: la marca de astrometría (#623, 2026-11-24)

El cliente solo dibuja como catálogo de un globular las filas que la
completitud `c` cuenta: astrometría 5/6p y BP−RP (ADR 0039). La fila del banco
necesita esa marca, y no cabe en los 12 B: los 15 bits bajos de G van llenos
hasta G = 20 y el alto es la marca de campo.

- **Fila de 13 B.** Los 12 de siempre y 1 B más: 1 si
  `astrometric_params_solved > 3` (5p o 6p), 0 si es 2p. +8 % de peso.
- **Otra carpeta, `r1v2/`.** El manifiesto la anuncia en `ruta`. Los `.bin` del
  formato 1 en las cachés de un año no se mezclan con los nuevos.
- **El formato 1 sigue valiendo.** El cliente lee sus filas sin marca: «se
  desconoce», y el criterio no se aplica. Nunca como «no cumple»: eso borraría
  el catálogo entero de los bancos viejos (AC3 de #623).
- **Publicar** el formato 2 es regenerar los 143 (la descarga empieza de cero:
  los `.npy` del formato 1 no traen la columna) y subir `r1v2/*.bin` antes del
  manifiesto, como siempre.
- **El Avance no lleva la marca.** Con banco, el Avance no se usa en el
  globular. Sin banco (manifiesto o fichero caído), sus filas G < 15 llegan sin
  marca y no se filtran; el complemento del proxy (G ≥ 15) sí la trae. Son las
  gigantes brillantes, casi todas 5/6p con color: regenerar el Avance entero
  (todo el cielo) no compensa.
- **El proxy** trae la marca como 5ª columna solo desde GAVO
  (`astrometric_params_solved`). La caché de disco no cambia de clave: sus
  entradas viejas, de 4 columnas, llegan sin marca.
- **Cuándo se nota.** Dentro del círculo del banco las filas salen del fichero.
  Hasta que se publique el formato 2, el filtro no actúa en ningún globular con
  banco. La clave de la caché del proxy no se versiona: costaría vaciar 1,5 GB
  de caché (campos densos de minutos) para filas que, en los globulares, ya da
  el banco.
- **La cola del glow (#570) también se filtra.** Una fila miembro 2p o sin
  color con m > mlim dentro de r_t ya no sale como cola: su luz está en el
  velo por (1 − c), como la del resto de las filas que `c` no cuenta.
- **CDS va sin marca.** En VizieR la columna se llama `Solved` por ASU
  (espejo CfA, 3/31/95), pero su nombre en el TAP no se pudo comprobar: el CDS
  apagó sus TAP por un incidente de ciberseguridad (aviso del 2026-11-09 en
  la portada de VizieR), y ninguno de los cuatro espejos de VizieR (CfA, IDIA,
  NAO, China-VO) sirve TAP. Una columna desconocida tumbaría la consulta
  entera y con ella el respaldo de GAVO, así que CDS pide las 4 columnas de
  siempre y sus filas llegan «sin marca»: el cliente no les aplica el
  criterio (AC1 de #623). Solo se nota con GAVO caído y fuera del banco.
  Cuando el TAP vuelva, añadir `Solved` es una línea en `gaia_consultas` y su
  test, tras comprobarlo con una consulta real.
