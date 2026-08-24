# Informe de autocrítica · iteración v7 (corrección del halo)

Entrada de la iteración v8. Escrito tras cerrar E0-E5 y pasar el code review.

**Resultado en una línea:** de los tres defectos, **uno era real y se ha
corregido** (D3, los anillos), **uno era un error de medida mío** (D2) y **uno
no tiene la causa que se le atribuía** (D1). El único cambio en producción de
toda la iteración son 26 líneas en `resources/js/bitacora-cumulos.js`.

| Etapa | Cierre | Cambio en producción |
|---|---|---|
| E0 · arnés | hecho, con un falso positivo propio | no |
| E1 · cadena fotométrica unificada | cerrada, D2 refutado | **no** |
| E2 · orden muestrear→anclar→atenuar | cerrada, sin re-anclaje | **no** |
| E3 · truncamiento y normalización de King | cerrada, ya estaba | **no** |
| E4 · anillos de 47 Tuc | **corregido** | **sí** (`cola()`) |
| E5 · matriz y fenomenología | cerrada, 18 corridas archivadas | no |

---

## 1. Incongruencias detectadas

### 1.1 Resueltas sobre la marcha

**(a) E0 dio un falso positivo en D2, y lo dio con dos cifras decimales.**
El arnés midió «Δμ_cielo = 2,733 mag contra Δμ_halo = 0,026» y concluyó que el
halo no se atenuaba. Estaba comparando **marcos distintos**: el cielo por `SBe`
(que ya lleva `dim`) y el halo por flujo crudo (que no). El render trabaja en el
marco del cielo —`pintarFot` pinta el objeto como incremento de contraste sobre
`Fcielo` y `dim` entra una sola vez, en `SBe` y en `Cmin`—, así que el halo
**no debe** atenuarse por su cuenta. E1 lo refutó midiendo el contraste:
partir la pupila del ojo de 7 a 3,5 mm (dim de 0,038 a 0,153) mueve el
contraste **0,00000 mag**. Un número con tres decimales pareciendo un
diagnóstico es exactamente el error contra el que el propio documento avisa.

**(b) El primer test de E1 era vacuo y no lo parecía.** Comparaba «anillos con
la misma m_res» a distintos aumentos: no hay ninguno, m_res difiere en todos los
radios. La segunda versión restaba `S1(m_res)` al radio medio y dejaba 0,09-0,13
mag de residuo que era **artefacto del promediado radial**, no física. La
tercera —la que quedó— compara la razón pintado/modelo entre aumentos, que es
adimensional y no depende del radio: 0,9962 → 0,9979, es decir 0,0019 mag.

**(c) El test del grano medía el estimador, no la ley.** El campo es lognormal
y con cola pesada la desviación muestral de un anillo se mueve un ±35 % con
unos cientos de píxeles. Medido en lineal fallaba por 11-38 %. Se pasó a medir
**en logaritmo** (donde el campo es normal y el error del estimador es
1/√2n) y a normalizar píxel a píxel por la anchura que la tabla pidió en ESE
píxel; el residuo bajó a 0,3-1,6 %.

**(d) El guardián de E2 no fijaba lo que creía fijar.** Se fijaba `m_res` a su
propio valor de referencia, pero a 200 mm/100× el corte lo pone `m_lim,sky` en
todos los radios (`m_crowd` va 1,5 mag por encima), así que el pin no ataba
nada y quedaba una deriva de 2,8e-3. Con el pin 0,5 mag por debajo, el guardián
cierra a **desvío 0,0e+0**.

**(e) El eje del seeing estaba muerto en la rejilla de conservación.** Con 512
px sobre 51′ el píxel mide 6″ y tapa el beam: como Ω = max(beam, píxel), el
seeing no entraba en ningún sitio y el test lo habría dado por bueno igual.
Se pasó a campo verdadero (68°/M) y 1024 px.

**(f) Los perfiles de Trager 1995 no estaban en el repositorio.** La
especificación los daba por «activo rescatado de T5 de la rama antigua»; no
existen ni en el árbol ni en el historial (`git log --all -S"Trager"` solo
devuelve los .md). Se han rescatado de VizieR (J/AJ/109/218/tables) y
archivado en `docs/halo_v7/trager1995.tsv`, 1061 puntos de los cuatro cúmulos.
**Lección de proceso:** un activo que solo vive en una rama borrada no es un
activo.

**(g) `test_cumulos.js` §3 codificaba la semántica que E4 venía a cambiar.**
Comprobaba S1 contra «la suma de los bins con centro > m_lim», que ES la cola
escalonada. Se actualizó a un contrato más fuerte: exacto en los bordes de bin
y encajonado entre los dos bins enteros en medio.

**(h) Un assert de E3 estaba clavado al último decimal del float.** Exigía que
el tap perceptual pintase `0,0` exacto en las alas; `visibilidadDifusa` es una
sigmoide en log y deja una cola que tiende a cero sin llegar. El +0,5 % de
flujo de E4 lo sacó del cero y puso rojo un test que no medía nada roto. El
listón pasó a 1e-6 del cielo, que es cero a cualquier profundidad de bits.

### 1.1b Detectadas por el code review y corregidas después

El `/mattpocock-skills:code-review` se corrió sobre el punto fijo `f1c4e0d` con
los dos ejes en paralelo. Ninguno de sus hallazgos tocaba la corrección de D3;
todos eran deuda alrededor. Corregidos:

- **`primerDebil()` quedó sin llamadores** tras E4 —los tres usos pasaron a
  `cola()`— y se conservó «por si acaso». Es exactamente el código muerto que
  ADR-0001 prohíbe conservar como alternativa dormida. **Borrada.**
- **El volcado de referencia de E0 estaba caducado.** E1 arregló un fallo del
  arnés (pedía `res.thetaCumuloArcmin`, que no existe, y Cmin salía por la rama
  C_MAG) y nadie regeneró el archivo: los Cmin archivados eran los de otra ley.
  **Regenerado**; Cmin pasa de 2,02e-1 a 4,91e-1 en M13 a 146×, que es la
  diferencia entre el halo juzgado por la rama vieja y por H2c. Lección de
  proceso: una referencia archivada es un dato con fecha de caducidad, y quien
  arregla el medidor la regenera en el mismo commit.
- **CONTEXT.md describía `S1`/`S2` como sumas de cola sobre bins**, que es la
  ley que E4 acaba de cambiar. **Anotada** la continuidad en `m_lim`.
- **E4 no barría la configuración intermedia** que el documento pedía
  («146×, 514× y una configuración intermedia»): faltaba. **Añadido 300×**,
  verde.
- **Los documentos de trabajo estaban en la raíz**, donde CLAUDE.md reserva
  `CONTEXT.md` y `simulador_ocular/docs/adr/`. **Movidos** a `docs/halo_v7/`, junto a los datos.

Quedan sin tocar, por juicio: renombrar `cola(tabla, mlim)` (el nombre choca con
`cola1`/`cola2`, pero el módulo entero usa esa nomenclatura), el preámbulo
duplicado en los seis ficheros de test (no hay framework por diseño; extraerlo
crearía la dependencia que el repo evita) y `matriz_v7.json` bajo `docs/` (es
línea base de regresión, sí, pero está pensada para leerse dentro de un año).

### 1.2 Abiertas

**(i) El grano no se pinta nunca.** Lo pintado es
`I = ⟨I⟩·s_halo + dI·s_grano`, y **`s_grano` vale 0 en las 18 corridas de la
matriz** y también con un cielo irreal de 25 mag/arcsec². σ_grano queda entre
**3,9 y 7,2 mag por debajo de su umbral**, porque el umbral de contraste del
grano se evalúa a un tamaño angular del orden del beam y ahí Cmin vale 10²-10³.
Hoy **S1 pone el velo y S2 no pinta nada**, mientras la cabecera del módulo dice
que «S1 y S2 son toda la textura del halo». No es un defecto de v7 —D1/D2/D3 no
van de esto— y tocarlo sería mover la ley perceptual sin cuantificar antes, que
es justo lo que esta iteración prohíbe. Está asertado en `test_halo_v7_e5.js`
para que deje de ser un silencio y sea un hecho registrado. **Es lo primero que
debe mirar v8.** Efecto secundario que conviene decir: el criterio de
aceptación de E5 «el grano desaparece antes que la mancha al empeorar el cielo»
**se cumple sobre un conjunto vacío**, así que no está verificado de verdad; lo
estará cuando el grano se pinte alguna vez.

**(j) D1 sigue sin causa.** E3 midió que las alas se apagan solas a 2,8·r_h y
que a más de 4·r_h el contraste máximo es 0,150 contra un Cmin de 0,491: el
halo **no** es demasiado extenso por el perfil. Con lo cerrado en E1, E2 y E3,
si el halo de la captura original se veía grande y brillante, la causa está en
la ley de visibilidad o en el realce perceptual, no en la fotometría ni en la
morfología. Falta una captura reproducible del defecto para atacarlo.

**(k) `magLimite` no tiene término de seeing.** Una imagen estelar más gorda no
degrada la magnitud límite puntual en el modelo; el seeing solo entra por Ω. Es
físicamente discutible y no se ha tocado por estar fuera del alcance.

**(l) Con lienzo grueso el seeing no entra en ningún sitio.** Consecuencia de
Ω = max(beam, píxel): a 100 mm/50× la matriz sale píxel-limitada en las tres
pasadas. La regla es correcta (un píxel integra lo que cae dentro), pero
conviene saber que en esa esquina el seeing es decorativo.

**(m) `test_difuso.js` falla 12 asserts, y ya fallaba.** Verificado
sustituyendo `bitacora-cumulos.js` por el de HEAD: los mismos 12, idénticos. Es
la capa de galaxias PS1, ajena a esta iteración. No se ha tocado, pero una
batería con rojos permanentes envenena la señal de todas las demás.

**(n) `m_crowd` manda solo en el núcleo.** Medido: 0/511 nodos a 100 mm/50×,
48/511 a 200/100, 112/511 a 400/200, 120/511 en 47 Tuc, 187/511 en ω Cen. El
resto del cúmulo lo decide `m_lim,sky`. No es un error, pero explica por qué
varios experimentos «sobre la aglomeración» no movían nada.

---

## 2. Mejoras encontradas y NO implementadas

| # | Mejora | Beneficio | Coste | Recomendación |
|---|---|---|---|---|
| 1 | **Revisar el umbral del grano** (incongruencia (i)): hoy el grano se juzga a escala de beam y nunca supera Cmin. Lo razonable es juzgar la textura por la escala del *parche* que el ojo integra, no por el beam. | Alto: devuelve al modelo la mitad de su física (S2, SBF) y es probablemente lo que hace que los globulares se vean lechosos. | Medio-alto: toca la ley perceptual; exige cuantificar antes y una referencia visual real. | **v8, prioridad 1.** |
| 2 | **Perfil de King de dos parámetros o Chebyshev de Trager** para los cúmulos de concentración alta. El King de un parámetro sale sistemáticamente más brillante que el cúmulo real: sesgo −0,43 mag en M15, −0,40 en 47 Tuc, −0,31 en M4, +0,03 en M13. | Medio: quita un sesgo sistemático de 0,3-0,4 mag en los cúmulos más vistosos. | Alto: cambia la normalización y toca la conservación fotométrica. | v9, o nunca: dentro de tolerancia. |
| 3 | **Cola de la LF C1** (hoy es C0): interpolar φ entre centros de bin dejaría la derivada continua y quitaría el codo residual de 0,03-0,04 mag. | Bajo: el codo ya no se ve. | Medio: la integral trapezoidal deja medio bin fuera en cada extremo y **movería la fotometría**. | Descartado, ver §3. |
| 4 | **Término de seeing en `magLimite`** (incongruencia (k)). | Medio: hoy el seeing solo afecta al grano, no a qué estrellas se resuelven. | Medio: es una ley nueva, con su constante. | v8, prioridad 2. |
| 5 | **Arreglar o retirar los 12 rojos de `test_difuso.js`**. | Alto para el proceso: una batería con rojos crónicos deja de ser una señal. | Desconocido (capa PS1). | v8, prioridad 3. |
| 6 | **Guardar el volcado de E0 como referencia versionada** además de la matriz de E5, para poder comparar iteraciones enteras. | Bajo-medio. | Bajo. | Cuando haya una segunda iteración que comparar. |

---

## 3. Desviaciones conscientes respecto a la letra del documento

**(a) El test de suavidad de E4 no es «segunda diferencia acotada».** El
documento pedía acotar la segunda diferencia de μ(r). Se comprobó que esa
métrica no distingue un escalón de una pendiente: en el borde del cúmulo μ
cambia deprisa por razones legítimas. El test mide el **cociente entre el salto
de S1 y el movimiento de m_res** entre nodos vecinos, que es adimensional y sí
los separa: 0,84 con la cola interpolada contra 4,3 con la escalonada. Manda el
criterio de aceptación («ningún cúmulo muestra estructura anular»), no la letra.

**(b) La causa de D3 no era ninguna de las dos que el documento nombraba.** El
documento apostaba por «muestreo radial en Capa 3 vs cuantización en Capa 5».
Era una tercera: **la cola de la LF devolvía el bin entero**, y `S1`/`S2` eran
funciones escalón de m_lim mientras `m_res(r)` era continua. La instrucción
«solo la rama que E0 señale» se siguió en espíritu —se corrigió una sola rama, la
que el arnés señaló— y no en la letra, porque la letra apuntaba a otro sitio.

**(c) Se descartó suavizar más la cola.** Interpolar φ linealmente entre centros
de bin daría C1, pero la integral trapezoidal deja medio bin fuera en cada
extremo: movería la fotometría. La interpolación lineal de la cola conserva el
flujo **exactamente** (verificado a 1e-15 en los bordes de bin) y esa
conservación pesa más que un codo de segunda derivada que no se ve.

**(d) En E1, E2 y E3 los tests no pudieron escribirse «en rojo».** El documento
manda tests antes del código, y así se hizo en E4 (el rojo está medido: saltos
de 0,18-0,19 mag antes, 0,024-0,044 después). Pero E1, E2 y E3 **no llevaron
cambio en producción**: sus tests nacieron verdes porque el código ya cumplía.
Un test que nace verde demuestra menos que uno que se pone verde, y conviene
decirlo en vez de presumir de TDD: lo que garantizan es que el comportamiento
no se pierda, no que se haya conseguido.

**(e) El rojo de E4 no queda en el historial.** El fix, su test y la
reescritura de `test_cumulos.js` §3 entraron en el **mismo commit** (`74712ca`),
así que el rojo previo está medido pero no es reproducible haciendo checkout de
un padre. Lo mitiga E4.2b, que reconstruye la cola escalonada **dentro del
test** y compara: el guardián no depende de acordarse de cómo era el código
viejo. Aun así, lo correcto habría sido un commit con el test en rojo.

**(f) E5 congela un defecto como contrato, a sabiendas.** `sinGrano ===
filas.length` afirma que el grano no se pinta en ninguna corrida. Nadie lo
pidió, y **hará fallar el test el día que v8 arregle la ley del grano** — que
es el efecto buscado: un silencio que nadie mide se olvida, un assert rojo
obliga a pasar por aquí. Está rotulado «HALLAZGO, no regresión».

**(g) E4 relajó un assert de E3, ya cerrada.** El listón «cero exacto» pasó a
1e-6 del cielo (incongruencia (h)). Aflojar un listón después de medir es un
patrón malo aunque esta vez el listón fuera el equivocado; queda dicho para que
se juzgue, no para que se dé por bueno.

**(h) Se añadieron dos cúmulos a las referencias de E3.** El documento pedía
cuatro (M13, M15, M4, 47 Tuc) para la comparación con Trager; el test de
normalización se corre además sobre ω Cen, porque el extremo de tamaño es
donde el truncamiento tiene más margen para fallar.

---

## 4. Lecciones nuevas de esta iteración

1. **Antes de comparar dos números de la cadena, declarar en qué marco está
   cada uno.** El falso D2 no fue un error de física sino de contabilidad: `SBe`
   lleva `dim` y el flujo del halo no. Todo panel y todo test que compare
   componentes debe decir si mide en el marco del cielo o en el del ojo. El
   render trabaja en el del cielo y `dim` entra **una sola vez**.

2. **Un test que no puede fallar no es un test.** Dos versiones del test de E1
   pasaban sin medir nada: una comparaba un conjunto vacío, la otra medía el
   artefacto del promediado radial. Antes de dar una etapa por cerrada, romper
   el código a propósito y comprobar que el test se entera.

3. **Con campos lognormales, medir en logaritmo.** En lineal el estimador de
   dispersión de un anillo se mueve ±35 % y cualquier tolerancia razonable mide
   el estimador, no la ley. En log el campo es normal, el error es 1/√2n y la
   conversión es exacta.

4. **Un eje del experimento puede estar muerto sin avisar.** El seeing no
   entraba en la rejilla porque el píxel tapaba el beam. Todo barrido debe
   incluir un assert de que el parámetro barrido **mueve algo**; si no, se está
   midiendo seis veces lo mismo.

5. **Distinguir escalón de pendiente exige una métrica adimensional.** El salto
   absoluto entre nodos no lo hace: mezcla la discontinuidad con la variación
   legítima. El cociente «cuánto salta la respuesta por cada unidad que se mueve
   la entrada» sí, y además sobrevive a cambios de paso de la tabla.

6. **Un término del modelo puede estar desconectado y nadie enterarse.** `s_grano`
   vale 0 en todas las configuraciones realistas, y la especificación describe
   S2 como «toda la textura del halo». Regla: cada término que se multiplica por
   una visibilidad merece un test que compruebe que **en alguna configuración
   plausible es distinto de cero**. Si no lo es, o sobra o la ley está mal.

7. **Un activo que solo vive en una rama borrada no existe.** La tabla de Trager
   se daba por rescatada y no estaba en ningún sitio. Los datos de referencia se
   archivan en el árbol, con su procedencia escrita al lado.

8. **Los asserts clavados al último decimal del float envejecen mal.** «Debe
   valer 0,0» donde la ley es una sigmoide es una trampa: un cambio legítimo del
   0,5 % en otro sitio pone el test rojo sin que haya nada roto. El listón se
   pone en la escala de lo observable (1e-6 del cielo), no en la del float.

9. **Una referencia archivada caduca.** El volcado de E0 se archivó «como
   referencia de la iteración» y a la etapa siguiente ya medía otra cosa, porque
   E1 arregló el propio medidor. Quien toca el arnés regenera sus volcados **en
   el mismo commit**, o el archivo pasa de evidencia a folclore.

10. **Cerrar una etapa sin tocar producción es un resultado, no un fracaso.**
   Tres de las cinco etapas se cerraron confirmando que el código ya estaba bien.
   Lo que dejan es una batería que impide que deje de estarlo, y la eliminación
   de tres hipótesis para no volver a pagarlas en v8.
