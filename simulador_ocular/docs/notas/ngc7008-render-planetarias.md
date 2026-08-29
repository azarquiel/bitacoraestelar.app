# NGC 7008 en el simulador: por qué sale una mancha

Fecha: 2026-08-29. Estado: **cerrada — implementada**, ver el apartado 6 y el
ADR 0021.

Pregunta de partida del usuario: «la nebulosa NGC 7008 no se está generando como
es, sino que se está simulando una mancha que no se parece a la realidad».

La respuesta corta, y es medible: NGC 7008 **sí tiene parche de Pan-STARRS y sí
entra en la capa difusa por imagen**, pero el parche se descarta entero —el 100 %
de sus píxeles pasan a NaN— antes de pintarse, por la regla de la mordida
(`ps1MascaraMuerdeEscena` / el bloque `compactas` de `ps1QuitarEstrellas`). Lo que
llega a pantalla es únicamente el modelo Sérsic exponencial circular de la fila de
catálogo, que es exactamente eso: una mancha redonda con el centro brillante.
La causa es una estrella de Gaia G = 9,21 a 54,5″ del centro —la doble del borde
sur— cuya máscara extrapolada de 55,9″ toca la elipse del objeto.

---

## 1. Qué se hace hoy

### 1.1 La fila de catálogo

`simulador_ocular/resources/js/nebulosas-datos.js:256`

    ["NGC7008","",315.13667,54.54319,25.74,1.0,0,10.7,1.0,0,0,0,"PN"]

La cabecera del fichero (`nebulosas-datos.js:1-11`) da la semántica: `[nombre,
alt, RA°, Dec°, r_e″, b/a, PA°, mag V, n, B/T, polvo, n de S4G, clase]`, y avisa
de que «b/a = 1 significa que el catálogo no trae ángulo de posición, no que el
objeto sea redondo».

De dónde salen los números, en `scripts/gen_nebulosas.py`:

- La fuente es OpenNGC (`mapa/datos/ongc_nebulosas.csv:415`), fila
  `NGC7008;PN;21:00:32.80;+54:32:35.5;Cyg;1.43;;;13.30;10.70;…`. **`MajAx` = 1,43′
  y `MinAx` y `PosAng` vienen vacíos.**
- Sin eje menor ni PA, el generador entra en la rama «sin orientación conocida»
  (`gen_nebulosas.py:172-177`): `semieje = maj/2 = 0,715′ = 42,9″`, `q = 1`,
  `pa = 0`.
- Por ser clase compacta (`COMPACTAS = ('PN','SNR')`, `gen_nebulosas.py:67`) usa
  `RE_SOBRE_SEMIEJE_COMPACTA = 0,60` (`gen_nebulosas.py:66`):
  `r_e = 0,60 × 42,9 = 25,74″`. Cuadra al céntimo con la fila.
- La mag V es la 10,70 de OpenNGC, sin recorte (el suelo `MU_MIN_COMPACTA = 17,5`
  de `gen_nebulosas.py:78` no llega a morder aquí).

O sea: **el 25,74″ no es un tamaño inventado**, es el semieje mayor real de
OpenNGC multiplicado por la escala compacta, y el render lo deshace exacto
(`ps1RadioBordeAs`, `resources/js/bitacora-gaia-render.js:3557`, con
`PS1_RE_SOBRE_BORDE = 0.60`) para recuperar el borde de 42,9″. Lo que sí es una
pérdida real de información es `b/a = 1` y `PA = 0`: OpenNGC no trae la elipse y
el generador prefiere redondo antes que inventarlo.

### 1.2 El pipeline: imagen o modelo

La capa difusa por imagen **no es solo de galaxias**. `ps1CatalogoDifuso`
(`bitacora-gaia-render.js:3571`) concatena las galaxias con las nebulosas cuya
clase está abierta, y `PS1_CLASES_DIFUSAS = ['PN','HII','EmN','RfN','SNR']`
(`:3544`) incluye `PN` desde el ADR 0013. El simulador la llama en
`simulador_ocular/resources/js/bitacora-ocular.js:616-617`, y la capa está
encendida por defecto (`GALAXIAS_IMAGEN = true`, `bitacora-gaia-render.js:2170`).

Las puertas que deciden si un objeto tiene parche:

- **Declinación**: `g[3] > PS1.decMin` con `decMin = -30`
  (`:2061`, `:3583`). NGC 7008 está a +54,54°: pasa.
- **Tamaño**: `ps1CabeEnParche` (`:3518`). Las clases extensas exigen lado sin
  recorte, pero **las planetarias están exentas por construcción** (`:3527-3529`);
  luego el corte de fracción de luz con `fracMin = 0,4`. Con `r_e = 25,74″` el
  lado es `6 × 25,74/60 = 2,574′` (`ps1LadoArcmin`, `:2175`) y la fracción de luz
  de un exponencial a 3·r_e es ≈ 0,94: pasa de sobra.
- **Cobertura real de Pan-STARRS**: comprobada contra el servicio, no supuesta.
  `https://ps1images.stsci.edu/cgi-bin/ps1filenames.py?ra=315.13667&dec=54.54319&filters=g`
  devuelve una única skycell, `rings.v3.skycell.2397.063.stk.g.unconv.fits`, con
  `badflag = 0`. Hay imagen, y encima cabe en una sola celda.

Confirmado ejecutando el montaje de producción
(`scripts/lib_parche_produccion.js` + `scripts/lib_bajar_parche.js`, que es la
composición de `ps1ParcheDeGalaxia`, `:3808`) sobre el parche real de 1024 px
(0,151″/px) y las 320 estrellas de Gaia DR3 del campo hasta G = 20:

    gal:  reArcsec 25.74  ba 1  pa 0  magV 10.7  clase PN  ladoArcmin 2.574
    radioBordeAs: 42.9    thetaInt: 1.43'
    mordida: true | NaN: 100.0 % | pixeles > 0: 0.0 %
    peso medio de imagen w: 0.0000

**El 100 % del parche sale como ausencia.** Con `w = 0` en todas partes, el
pintado (`ps1PintarParche`, `:3329`) deja `f = (1−w)·perfil`: el objeto es, píxel
a píxel, el exponencial n = 1 circular. Además `ps1HaloActivo` (`:3042`) devuelve
`true` porque `gal.mordida` está activa, así que encima se extrapola el ala hasta
μ = 28,5.

### 1.3 Por qué se anula el parche

La cadena, toda en `ps1QuitarEstrellas` (`:2413`) y `ps1MascaraMuerdeEscena`
(`:3698`):

1. `ps1RadioMascaraAs` (`:2351`) da el radio de máscara de una estrella:
   `r = seeing · 10^(0,4·(22 − G)/3)`, acotado a `mascaraMaxAs = 60″` (`:2064`).
   Para la estrella brillante del borde sur, G = 9,21 → **55,9″**.
2. Una máscara mayor que `rellenoPlanoMaxAs = 40″` (`:2067`) es «ancha»: su disco
   se deja al nivel del cielo confiando en que el perfil lo rellene.
3. Si una máscara ancha, cuya estrella **no** está dentro de la escena, toca la
   elipse de un componente **compacto** (borde real: PN y SNR), ese componente
   queda `pisada` (`:2482-2490`); y si *todos* los componentes de la escena están
   pisados, **la imagen entera pasa a NaN** (`:2534-2540`).

Para NGC 7008 la escena tiene un solo componente (él mismo, r = 42,9″, circular);
la estrella está a 54,5″ del centro, o sea **fuera** de la escena, y
`54,5 ≤ 42,9 + 55,9`: pisada, y `pisadas === escena.length`. Adiós parche.

Consulta Gaia DR3 usada (TAP de ESA, `gea.esac.esa.int/tap-server/tap/sync`),
estrellas con G < 14 dentro de 0,045° del centro:

    ra           dec          G       d(")
    315.147293   54.529368     9.208   54.5    <- la que anula el parche
    315.146611   54.524180    11.325   71.5
    315.136871   54.543169    13.741    0.4    <- estrella central del PN
    315.148411   54.546611    13.696   27.4

Es la doble visual del borde sur que citan las observaciones: G = 9,21 y G = 11,33
separadas ~19″. La segunda no llega a máscara ancha (29,2″).

Nota sobre la estrella central: **no es el problema**. G = 13,74, máscara de
13,9″, y está dentro de la escena, así que `ps1QuitarEstrellas` la conserva entera
(`:2420`) y `ps1RellenoHuecosLocal` se ocupa de su núcleo si estaba saturado.

### 1.4 Cuánto de esto es NGC 7008 y cuánto es general

Repetido el criterio sobre las 100 filas `PN` con Dec > −30° del catálogo, contra
una única consulta Gaia DR3 (G < 10,3, que es el umbral exacto a partir del cual
la máscara supera los 40″: `22 − 3·log10(40/1,1)/0,4 = 10,295`), **ocho
planetarias pierden el parche entero**. Cobertura real de la elipse del objeto por
esa máscara (lente circular exacta, elipses circulares en los ocho casos):

    NGC 7026    100,0 %   G=9,24  d=28,8"  rmask=55,3"
    IC 5117     100,0 %   G=9,56  d=23,3"  rmask=50,2"
    Abell 12     79,8 %   G=4,67  d=50,1"  rmask=60,0"
    NGC 7008     43,6 %   G=9,21  d=54,5"  rmask=55,9"
    NGC 7048     33,9 %   G=10,13 d=46,5"  rmask=42,1"
    Abell 33      8,9 %   G=7,20  d=134,9" rmask=60,0"
    Abell 72      3,9 %   G=7,85  d=110,5" rmask=60,0"
    NGC 6578      2,1 %   G=8,78  d=63,7"  rmask=60,0"

Abell 12 bajo μ Orionis es el caso que motivó la regla, y está documentado en el
comentario de `:3689-3694`. Los cinco de abajo pierden el parche por un roce.

Y midiendo sobre el propio parche de NGC 7008: los píxeles que caen bajo esa
máscara **son nebulosa buena**, no ala saturada de estrella. En el anillo 15–40″
del centro, mediana de 1967 DN sobre cielo bajo la máscara contra 2258 DN fuera
de ella (−13 %, del orden de la asimetría real del objeto). El `mascaraMaxAs = 60`
está descrito en el propio código como «extrapolación cortada, no el fin del ala»
(`:2526`): aquí la extrapolación se come medio objeto que la imagen sí trae.

---

## 2. Qué es NGC 7008 de verdad

Lo que he podido verificar con fuente primaria:

- **Posición y tipo.** SIMBAD (`https://simbad.u-strasbg.fr/simbad/sim-tap/sync`,
  consulta ADQL sobre `basic`): `NGC 7008`, otype `PN`, α = 315,13674°,
  δ = +54,54316°.
- **Tamaño.** SIMBAD da `galdim_majaxis = galdim_minaxis = 1,427′`, PA 90, con
  bibcode `2008ApJ...689..194S` (Stanghellini, Shaw & Villaver 2008). La fila
  original está en VizieR `J/ApJ/689/194/table1`: `NGC 7008, rad = 42,80″,
  Dist = 869 pc`. Es un **radio único**, es decir, la fuente que usa SIMBAD
  **asume el objeto circular**; no es una medida de elongación.
- **OpenNGC**, que es la fuente del repo
  (`https://github.com/mattiaverga/OpenNGC`): `MajAx = 1,43′`, `MinAx` y `PosAng`
  **vacíos**, `V-Mag = 10,70`, magnitudes de la estrella central U/B/V =
  12,99 / 13,75 / 13,23, identificadores `PN G093.4+05.4`, `PK 93+05 2`.
- **Acker et al. 1992** (Strasbourg-ESO, VizieR `V/84A/main`): la fila existe
  (`PNG 093.4+05.4`, descubridor Pease 1917) pero las tablas accesibles por ASU
  no traen diámetro óptico mayor/menor; el `Major/Minor` que devuelven es el de la
  elipse IRAS, no el de la nebulosa.
- **Tylenda et al. 2003**, «Angular dimensions of 312 planetary nebulae» (VizieR
  `J/A+A/405/627`): consultado con radio de 60″ sobre la posición, **NGC 7008 no
  está en el catálogo**.
- **HASH PN database**: no he conseguido leer su ficha por API ni por web sin
  registro. **No puedo citar sus valores de MajDiam/MinDiam; queda sin
  verificar.**

Los «86″ × 69″» que circulan en fuentes divulgativas (Wikipedia, In-The-Sky) no he
podido rastrearlos hasta una publicación primaria. **No los uso como número.**

Lo que sí puedo medir yo, y es reproducible: **sobre el propio parche PS1 g de
1024 px**, con las estrellas de G < 16 enmascaradas y el cielo restado
(`ps1Cielo`):

- **Elongación.** Momentos de segundo orden pesados por flujo dentro de r < 48″:
  **b/a = 0,63, PA ≈ 17°** (medido N→E). Con máscaras estelares más generosas
  (G < 12 a 30″) el resultado apenas se mueve: b/a = 0,61, PA = 18,5°. Aviso
  honesto: el segundo momento de una cáscara con reborde desigual **no** es el
  cociente de ejes del contorno exterior; la elongación del borde es más suave que
  0,63. Lo que la medida sí demuestra sin ambigüedad es que **el objeto no es
  circular**, contra el `b/a = 1,0` de la fila.
- **Perfil radial.** Mediana azimutal del flujo sobre cielo, en DN, por anillos de
  1,5″ (extracto):

        r(")     6,8    12,8    21,8    27,8    33,8    42,8    48,8    51,8    57,8
        imagen   2883    2698    3011    2134    1740     643     141      65      23

  El máximo **no está en el centro**: está en r ≈ 22″, y el centro va ligeramente
  por debajo. El brillo cae luego a plomo y a 52″ ya es el 2 % del reborde. Eso es
  una **cáscara limbo-brillante**, no un perfil exponencial.

  El modelo que hoy pinta el simulador, `I(r) ∝ exp(−1,678·r/25,74)`, dice lo
  contrario. Normalizando ambos en r = 21,8″:

        r(")            6,8     21,8     42,8     51,8
        imagen real     0,96     1,00     0,21     0,022
        modelo n=1      2,66     1,00     0,25     0,139

  El modelo pone el centro **2,8 veces más brillante** de lo que la imagen dice, y
  a 52″ —ya fuera del objeto— deja **6,4 veces** más luz de la que hay. Es
  literalmente la mancha con núcleo que describe el usuario, y encima con el ala
  extendida por el halo que activa la mordida.

Lo que no he verificado con fuente primaria y por tanto no afirmo: la
clasificación morfológica formal (bipolar contra elíptica), las dimensiones del
asa noroeste, y la naturaleza física (óptica o real) de la doble del borde sur.

---

## 3. En qué difiere

Tres discrepancias, por orden de peso medido:

1. **El objeto se pinta sin imagen aunque la imagen exista y sea buena.** 100 % del
   parche a NaN por una regla de protección que aquí dispara de más. Este solo
   punto explica el «no se parece a la realidad».
2. **El perfil es el equivocado.** Un exponencial no puede representar una cáscara:
   centro 2,8× de más, borde 6,4× de más. Esto lo tapa la imagen cuando la hay,
   pero manda cuando no la hay.
3. **La forma es redonda por falta de dato.** `b/a = 1`, `PA = 0` porque OpenNGC no
   trae `MinAx` ni `PosAng`; medido sobre la imagen, b/a ≈ 0,6 y PA ≈ 17°. Afecta
   a la elipse de escena y a θ intrínseco (`ps1ThetaIntDeGal`, `:3564`), no solo al
   dibujo.

---

## 4. Alternativas

Medidas hechas sobre el parche real, contando qué fracción del interior del borde
(r < 42,9″) acaba pintada con imagen (`w > 0,5`) en vez de con perfil:

    producción hoy (mordida ON)               imagen   0,0 %   NaN 100,0 %
    A: la mordida deja de anular la elipse    imagen  67,9 %   NaN   0,1 %
    B: la máscara ancha se recorta al borde   imagen 100,0 %   NaN   0,1 %

### (1) Corregir la fila del catálogo

Poner `b/a` y `PA` reales en `nebulosas-datos.js`. **Gana** poco por sí solo:
mientras el parche se anule, cambia la forma de la mancha, no la deja de ser
mancha. **Cuesta** además una fuente: OpenNGC no tiene el dato, HASH no he podido
leerlo, y meter el b/a que yo he medido sobre PS1 sería introducir en un catálogo
generado (`nebulosas-datos.js:1`, «GENERADO, no editar a mano») un número que no
viene de su fuente. **Riesgo**: choca de frente con el ADR 0013 punto 1 si se
edita a mano; habría que darle una fuente a `gen_nebulosas.py`, no un parche.
Sí es honesto medir b/a y PA **si algún día HASH u otro catálogo primario los
publica** y el generador los consume como consume OpenNGC.

### (2) Perfil analítico de cáscara para la clase PN

Sustituir el exponencial por un perfil anular (cáscara proyectada, o Sérsic con un
hueco) para `PN`/`SNR`. **Gana** el caso sin imagen, que es el que de verdad
necesita el modelo. **Cuesta** un modelo nuevo, su normalización fotométrica, su
espejo en `gen_nebulosas.py` (`factor_luz` tiene que seguir coincidiendo bit a
bit con `factorLuz` del render: la autocomprobación de `gen_nebulosas.py:130-140`
lo vigila), y revalidar M57 y M1. **Riesgo alto**: el ADR 0013 punto 3 exige que
cada divergencia por clase se demuestre, y el punto final avisa de que «si alguna
clase necesita algo que una fila Sérsic no puede decir…, la conversación es sobre
el esquema del catálogo, no sobre añadir ramas al render». Un perfil de cáscara
necesita un parámetro más (el radio interior) que la fila no tiene hoy: es un
cambio de esquema, no un cambio de render. Es la alternativa correcta a medio
plazo y la peor como primer paso.

### (3) Usar la imagen real, que ya está usándose (destrabar la mordida)

Aquí no hay que añadir la capa: **está construida, validada y encendida**. Hay que
arreglar por qué se apaga. Dos formas, ambas de pocas líneas:

- **A. Hacer cuantitativa la mordida.** Hoy `ps1MascaraMuerdeEscena` (`:3698`) y el
  bloque `compactas` (`:2482`) son un test binario de contacto: `radioEje ≤ r25 +
  rAs`. Sustituirlo por la fracción de la elipse realmente cubierta separa los
  casos medidos: NGC 7026 100 %, IC 5117 100 %, Abell 12 79,8 % **contra** NGC 7008
  43,6 %, NGC 7048 33,9 %, Abell 33 8,9 %, Abell 72 3,9 %, NGC 6578 2,1 %.
  Cualquier umbral entre 0,5 y 0,8 **conserva Abell 12**, que es el caso para el
  que se escribió la regla, y **devuelve la imagen a cinco planetarias**.
  Gana: 67,9 % del objeto pasa a ser imagen real. Cuesta: contar píxeles cubiertos
  en vez de comparar radios (el bucle ya recorre la máscara) y un umbral nuevo en
  `PS1`. Riesgo: el 32 % restante de NGC 7008 sigue siendo perfil bajo el disco
  ancho, o sea una costura entre medio objeto real y medio objeto liso —justo lo
  que el comentario de `:2467-2470` llama «pintar un objeto partido».
- **B. Recortar la máscara ancha en el borde real del componente compacto.**
  Regla: una máscara que nace **fuera** de la escena no borra píxeles que están
  **dentro** de ella. Es el mismo principio que ya rige para las fuentes
  conservadas (`:2420`, «dentro de la escena: se conserva entera»), aplicado al
  disco en vez de al centro. Gana: **100 % del objeto pintado con imagen**, sin
  costura y sin halo extrapolado. Cuesta: una condición en el bucle que pinta
  `mascara`. Riesgo: en Abell 12 la estrella sí satura de verdad la cáscara, y con
  esta regla se conservarían píxeles quemados; habría que medirlo antes (yo no lo
  he hecho) y, si sale mal, B se queda como complemento de A y no como sustituto.

Ninguna de las dos toca la fotometría: el anclaje a la mag V del catálogo
(`ps1AnclarACatalogo`) sigue siendo el mismo presupuesto de luz, y no se introduce
ningún mando de brillo, contraste ni opacidad. Respeta el ADR 0004.

### (4) Plantillas o máscaras por objeto

Una imagen o máscara curada por objeto en el repo. **Gana** control total.
**Cuesta** datos versionados, licencias, escala, WCS y un camino de render
paralelo. **Riesgo**: contradice el ADR 0013 entero (el modelo intrínseco es la
fila, no un recurso por objeto) y reabre la puerta que `PS1_PROTECCION_SIN_MODELO`
(`:3727`) deja explícitamente entornada solo para astrometría real. Descartada.

---

## 5. Recomendación

**Ir por (3), empezando por A y midiendo B en el mismo movimiento.**

Razones, en el orden en que pesan:

1. Es el arreglo de la causa, no del síntoma. El objeto no sale mal porque le
   falte un modelo mejor: sale mal porque el modelo, que es el respaldo, está
   haciendo de titular. Con la imagen puesta, la asimetría del reborde, el asa del
   noroeste y la doble del borde sur salen solas, sin que el catálogo tenga que
   describirlas.
2. Es el diff más pequeño que funciona: una función de veredicto que ya existe
   pasa de booleana a cuantitativa. No hay clase nueva, ni esquema nuevo, ni
   parámetro estético.
3. Arregla **cinco** planetarias, no una. NGC 7008, NGC 7048, Abell 33, Abell 72 y
   NGC 6578 comparten exactamente el mismo fallo.
4. No contradice ningún ADR. El ADR 0013 sigue intacto —la fila sigue siendo el
   modelo y la clase sigue decidiendo qué filas entran, no qué código corre—; lo
   que cambia es el criterio de una regla ya existente y ya reconocida como
   heurística. El ADR 0004 se respeta porque no se introduce ningún mando de
   apariencia.

Después de eso, y solo si el usuario sigue viendo mal las planetarias **sin
cobertura de imagen** (las del sur de −30°, o las que no caben), tiene sentido
abrir la conversación de (2), que por el ADR 0013 es una conversación sobre el
esquema del catálogo: una fila de cáscara necesita un radio interior que hoy nadie
guarda.

La alternativa (1) queda pendiente de fuente. Si aparece un catálogo primario con
`MinAx`/`PosAng` para NGC 7008, entra por `gen_nebulosas.py` y por regeneración,
nunca a mano.

---

## 6. Lo que se implementó

Se hizo (3), con A y B a la vez: la cobertura de A decide, y donde no llega el
umbral actúa B en vez del NaN. Ver el ADR 0021.

- `ps1CoberturaMordida` mide la fracción de la elipse de cada componente compacto
  tapada por los discos anchos; `PS1.mordidaCobMin = 0,6`.
- Por encima del umbral, el ADR 0017 sigue igual (elipse a NaN, halo obligatorio).
- Por debajo, la máscara ancha se recorta en el borde real: la imagen se conserva.

Medido sobre los ocho parches reales de PS1 con las estrellas reales de Gaia DR3,
NaN dentro del borde real, antes → después:

    NGC 7026   cob 100,0 %   100 % → 100 %   (sin cambio, mordida de verdad)
    IC 5117    cob 100,0 %   100 % → 100 %   (sin cambio)
    Abell 12   cob  79,8 %   100 % → 100 %   (sin cambio: el caso que motivó la regla)
    NGC 7008   cob  43,6 %   100 % →   0 %
    NGC 7048   cob  34,0 %   100 % →   0 %
    Abell 33   cob   8,9 %   100 % →   0,1 % (ese 0,1 % es sobresustracción del stack, no máscara)
    Abell 72   cob   3,9 %   100 % →   0 %
    NGC 6578   cob   2,0 %   100 % →   0 %

`test_golden_difusas.js` sigue bit a bit en M51, M101, M104 y M81: las galaxias
no se enteran, como pedía el ADR 0017 punto 4.

Lo que **no** se tocó, y sigue abierto: el `b/a = 1` / `PA = 0` de la fila (falta
la fuente) y el perfil exponencial para una cáscara (cambio de esquema por el
ADR 0013). Ambos solo mandan donde no hay imagen.

## Reproducir las medidas

Todo lo numérico de esta nota sale de:

- Cobertura Pan-STARRS: `ps1filenames.py` con `ra=315.13667&dec=54.54319&filters=g`.
- Estrellas: TAP de Gaia DR3 en `https://gea.esac.esa.int/tap-server/tap/sync`,
  `gaiadr3.gaia_source`, círculo de 0,04° y G < 20 (320 estrellas).
- Parche y montaje: `scripts/lib_bajar_parche.js` + `scripts/lib_parche_produccion.js`
  con la fila de `ps1CatalogoDifuso`, salida 1024 px, banda g — es decir, la misma
  composición que `ps1ParcheDeGalaxia` (`bitacora-gaia-render.js:3808`).
- Los guiones de medida fueron temporales (`/tmp`), no están en el repo. Se
  rehacen en veinte líneas a partir de `scripts/harness_vistas_np.js`, que ya
  monta exactamente esto para M57, M78, NGC 7635, NGC 6888 y M1 — **y al que
  convendría añadir NGC 7008 como vista, sea cual sea la alternativa elegida.**
