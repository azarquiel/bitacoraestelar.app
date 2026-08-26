# Las estrellas que Gaia DR3 no trae son un catálogo aparte, no un parche del dibujo

> **Numeración.** Este ADR se escribió como 0017 en la rama
> `worktree-adr-estrellas-que-gaia-no-trae`, que nunca se fusionó. Mientras
> tanto entró en `main` otro 0017 —«la ausencia manda cuando la máscara pisa un
> borde real»—, así que al traerlo pasa a ser **0018**. El contenido no cambia;
> lo que cambia es el número y los enlaces que lo citan.
>
> **Estado: implementado**, issues #130-#134, todos en `main`. Lo que salió
> medido al construirlo, y lo que hay que corregirle a este documento, está al
> final, en «Anotación posterior».

Gaia DR3 satura por arriba. El agujero es instrumental —saturación y *gating*
del detector—, no una cuestión de tiempo de integración: no hay que dar por
hecho que DR4 lo cierre. Hoy el simulador lo tapa donde más se nota, en las
dobles: `parDoble()` inventa la componente que falta con PA asumido de 55°
cuando el WDS no publica ángulo, usa la magnitud visual como si fuera G, y
pinta blanco si no hay tipo espectral. Es un parche en el dibujo de una
pantalla, y solo arregla las dobles: un campo con Vega o Arturo sigue con el
agujero.

Este ADR cierra el árbol de decisiones de
[[suplemento_hipparcos_objetivo]] (documento D3) con las medidas que faltaban.

## Comprobado en vivo

**El agujero es real, pero treinta veces más pequeño de lo que decía D3.**
El §1 de D3 atribuía a la saturación un suelo del 16 % de ausencias a Hp<9,
medido a través de `gaiadr3.hipparcos2_best_neighbour`. Ese 16 % no es un suelo
que restar: es *casi toda la señal*. Lo que falta no son las estrellas en Gaia,
es su fila en la tabla de cruce. Cruzando localmente por posición —Hipparcos
propagado de J1991.25 a 2016.0 con su movimiento propio, `cKDTree` sobre
coordenadas cartesianas en la esfera unidad, radio 2″, contra las 779 012
fuentes de `gaiadr3.gaia_source` con G<10,5 y las 78 395 de
`public.hipparcos` con Hp<9— la ausencia real a Hp<9 es del **0,2 %**.

El cruce por TAP con `NOT EXISTS` correlacionado no terminó ni en `async`:
más de 50 min contra un tope de servidor de 2 h. Se abandonó. El cruce local
tarda segundos y además es el prototipo de `gen_hipparcos.py`.

**El suplemento son 140 filas, ~10 KB.** Con eso desaparece el eje de coste
que D3 planteaba en T1, y con él la opción (b): no hay que elegir umbral de
magnitud, cabe entero.

**La saturación tiene un acantilado en G≈3.** De los 89 vacíos medidos, 72
están a Hp<3. Entre Hp 3 y Hp 4 no aparece ninguno nuevo. No es una pendiente
suave por magnitud: es un borde.

**El §2 de D3 confunde dos fallos distintos.** Dice que θ Aur, Zubenelgenubi,
Dabih, γ Cet, δ Gem, σ Ori y Mekbuda pierden su *primaria*. Falso: Gaia las
trae. θ Aur, por ejemplo, sale medida en G 3,97 contra 3,92 predicha. Lo que
les falta es la *secundaria*. La tabla hay que rehacerla.

**La conversión de color se decidió con medidas, no de oído.** Sobre 30 982
pares de calibración, las relaciones publicadas de Gaia EDR3 (documentación,
tablas 5.7/5.8) con pivote V−I dan G con mediana de residuo **+0,007 y σ
0,023**. Usar V como si fuera G —lo que hace hoy `parDoble`— da mediana
**+0,125, σ 0,208, y un 46,8 % de estrellas desviadas más de 0,2 mag**.

**La `rho` de Hipparcos no siempre describe el mismo par que la `sep` del
catálogo.** El reparto es bimodal, no ruidoso: 45 casos coinciden, 23
describen pares distintos. ζ UMa es el extremo: 715,5″ en el catálogo contra
14,43″ en Hipparcos, que mide la componente interna.

**Censo de procedencia de la componente B** sobre las 289 entradas del
catálogo de dobles: 198 vienen de Gaia, 16 de Hipparcos, 8 del WDS, **10
siguen inventadas**, y 57 no tienen `sep` publicada.

## Decidido

1. **Un catálogo hermano de Gaia, no un caso especial de las dobles.** La
   fuente se funde para *cualquier* campo, sea doble o no. Vega y Arturo
   entran por la misma puerta que Almaak.

2. **Complemento, no fusión en caliente.** El cruce se hace *offline*, en el
   generador; el fichero contiene solo lo que Gaia no trae. El render
   concatena las dos listas y ya está. No hay regla de precedencia en el
   render porque no hay solapamiento que arbitrar: el problema de precedencia
   de T2 se disuelve al moverlo al generador.

3. **El generador expande sistemas en filas de estrella.** Hipparcos da una
   fila por sistema cerrado, no una por componente; el generador la abre.
   Cuando el WDS y Hipparcos discrepan en el ángulo de posición, **manda el
   `pa` del WDS** sobre el `theta` de Hipparcos.

4. **El color por las relaciones publicadas de Gaia EDR3, tabla 5.7, con
   pivote V−I.** Citadas, no ajustadas a ojo.

5. **«Falta» significa vacío, no débil.** El criterio es binario y sin
   perilla: cero fuentes de Gaia dentro de 2″ de la posición propagada. No hay
   umbral de magnitud que calibrar ni que discutir.

6. **El aviso de fidelidad en la interfaz cubre un solo caso: el PA
   inventado.** No los derivados ni los medidos. Va en la ficha del objeto,
   como un `<span class="obj-fidelidad">` junto a los que ya componen
   `obj-tags` / `obj-cats` / `obj-resol`, no en la línea `sim-aviso`, que ya
   está disputada por varios mensajes. Precedente: las 57 dobles sin `sep` ya
   avisan ahí. **El texto lo escribe el usuario, no se genera.**

7. **La `sep` del catálogo manda.** La `rho` de Hipparcos solo se usa si
   `|rho − sep| ≤ máx(0,3″, 15 %·sep)`. Fuera de esa banda se descarta por
   describir otro par.

8. **Un solo fichero, con campo `origen`.** Valores: **`'medida'`** (89),
   **`'derivada'`** (40), **`'asumida'`** (11).

9. **`parDoble()` se borra**, y con él `scripts/test_par_doble.js`; sus
   invariantes migran al test del generador en Python. **`test_almaak_doble.js`
   se conserva**: prueba el render —dos núcleos, separación en píxeles—, no
   `parDoble`.

10. **La costura es `dibujar()`**, no `consultar()`. `consultar()` alimenta
    también la capa difusa, de donde sale su función de luminosidad, y meterle
    estrellas de otro catálogo rompería esa ley
    ([[Solo el dibujo de estrellas]]). Coser en `dibujar()` arregla de paso
    `renderPlaca()`, el render del formulario de registro, que hoy tiene el
    mismo agujero.

11. **El concepto se llama «Estrellas que Gaia DR3 no trae»**, no «suplemento
    de Hipparcos»: 14 de las 140 filas vienen del WDS. La sección
    [[Estrellas que Gaia DR3 no trae]] de `CONTEXT.md` —que se llamaba «Par de
    una doble»— **se reescribe**, no se le añade una
    sección al lado.

## Consecuencia aceptada

- **`theta` es de época 1991,25** y está caduco para los pares de órbita
  rápida: Cástor, σ Ori, δ Gem, Mekbuda. Se acepta; sigue siendo mejor que 55°
  inventados.
- **El criterio de vacío (decisión 5) deja fuera ≤27 casos** de «Gaia solo
  trae la compañera» en todo Hp<9. Ninguno por debajo de Hp 5. Se acepta a
  cambio de no tener perilla de magnitud.
- **La decisión 7 descarta la componente interna** que Hipparcos sí conoce en
  ζ UMa y ε Lyr. Eso siembra un trabajo futuro, «D4 — sistemas múltiples», que
  este ADR no aborda.
- **El sesgo residual de −0,037 en BP−RP se deja sin corregir**: corregirlo
  sería ajustar a ojo lo que la decisión 4 dice tomar publicado.
- **El §2 de `suplemento_hipparcos_objetivo.md` queda marcado como erróneo** y
  hay que rehacerlo; y su §1, con el falso suelo del 16 %, queda derogado por
  este ADR.
- **17 pares que hoy no se dibujan ganan segunda componente real.** No es
  coste, es la ganancia que se cobra sin trabajo extra.

## Anotación posterior (2026-08-26, issue #135)

El ADR se implementó entero en los issues #130-#134. **Las decisiones se
sostienen todas**; lo que no se sostiene son varias de sus cifras. Lo que sigue
las corrige con lo medido sobre el catálogo publicado
(`simulador_ocular/resources/js/estrellas-brillantes-datos.js`, 108 filas) y la
misma consulta TAP de `gen_hipparcos.py`.

**El censo del fichero no se reproduce: 108 filas, no 140.** La decisión 8 fijaba
140 filas —89 `'medida'`, 40 `'derivada'`, 11 `'asumida'`—. La regla de
producción da **108: 88 `'medida'`, 18 `'derivada'`, 2 `'asumida'`**. El
prototipo que midió los 140 no está en el repo, en ninguna rama ni comentario, y
al reconstruirlo aparece por qué: solo se llega a ~51 compañeras si **no** se
comprueba que la B prevista ya existe en Gaia, y unas 13 la tienen a menos de 2″
(σ Ori, Mekbuda, δ Gem…). Es decir, los dos criterios del prerregistro eran
incompatibles entre sí: el censo de 140 contaba duplicados, y contarlos habría
roto la decisión de que ninguna doble gane una componente de más. Manda el
invariante. El 88 y no 89 sale de 70 Oph, un artefacto de fotocentro: Hipparcos
publica el fotocentro del sistema cerrado, la órbita lo ha movido a más de 2″ de
las dos componentes, y Gaia sí las trae.

**La ganancia son 24 pares, no 17** —el ADR se quedó corto, no largo—. Es el
recuento que fija `scripts/test_hipparcos.py`, con la regla del generador
(círculo `máx(3″, 1,5·sep, 25″)`, límite `máx(mag1,mag2)+1`) e incluyendo los
pares sin `sep` publicada, a los que la compañera les llega por el anexo de
dobles de Hipparcos. Restringido a los 232 pares que sí publican `sep`, son
**15**: 197 ya estaban completos solo con Gaia y 20 siguen sin par. Y el
invariante aguanta medido: de esos 197 ya completos, **ninguno** recibe una fila
de este catálogo dentro de su círculo, ni siquiera sin límite de magnitud. Cero
terceras estrellas.

**La ausencia real es del 0,1 %, no del 0,2 %.** El cruce local sobre las 78 348
filas de `public.hipparcos` con Hp<9 y astrometría, contra las 779 012 de
`gaiadr3.gaia_source` con G<10,5, da **89 ausentes = 0,11 %**. Lo demás de
«Comprobado en vivo» se confirma tal cual: el acantilado en G≈3 es real —72 de
las 89 están a Hp<3, y entre Hp 3 y Hp 4 no aparece ninguna nueva—, y el 16 % de
la tabla de vecinos sigue siendo el falso suelo que este ADR derogó.

**La corrección del §2 de D3 estaba a medias, y en un caso al revés.** Este ADR
decía que θ Aur, Zubenelgenubi, Dabih, γ Cet, δ Gem, σ Ori y Mekbuda conservan su
primaria en Gaia y lo que les falta es la secundaria. Medido componente a
componente, sin límite de magnitud:

- **θ Aur es al revés: Gaia NO trae su primaria.** La única fuente Gaia del par
  es la compañera, G 7,28 a 4,2″; la primaria la pone este catálogo, fila
  `'medida'` G 2,63. El «G 3,97 contra 3,92 predicha» que cita este ADR no
  corresponde a ninguna componente de θ Aur, que es V 2,6 / 7,1.
- **Zubenelgenubi y Dabih están completas en Gaia**, con las dos componentes.
  Parecían incompletas porque el `Mag 2` del catálogo de dobles no es el de la
  componente que Gaia mide: Zubenelgenubi se publica como 3,2 y Gaia la mide en
  **G 5,03**, de modo que caía fuera del límite de magnitud del recuento.
- **γ Cet, δ Gem, σ Ori y Mekbuda sí:** Gaia trae la primaria y no la
  secundaria. De esas cuatro, solo γ Cet se cierra —fila `'derivada'`—; las otras
  tres son pares de sep ≤ 0,2″ que Gaia no resuelve y donde la posición prevista
  de la B ya tiene una fuente encima.

La tabla rehecha, con las 18 dobles de `mag1 < 4` que Gaia deja incompletas y
quién cierra cada una, está en el §2 de
[[suplemento_hipparcos_objetivo]], ya corregido.

**Lo que sigue pendiente:** «D4 — sistemas múltiples», el trabajo que siembra la
consecuencia aceptada de la decisión 7 al descartar la componente interna de
ζ UMa y ε Lyr, y que tendría que decidir también qué hacer con los `theta` de
época 1991,25 caducos de los pares de órbita rápida. No está escrito.
