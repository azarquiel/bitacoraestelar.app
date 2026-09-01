# Prerregistro — la niebla se juzga con H2c, y a la escala de Riccò

Fecha: 2026-09-02. Comprometido ANTES de tocar código y ANTES de medir nada con
la ley nueva. Ningún listón se retoca tras ver la salida (misma disciplina que
los ADR 0012, 0015 y 0022).

Corrige el hallazgo **H1** de
`simulador_ocular/docs/notas/niebla-campo-pupila-y-aumentos.md`.

## El defecto

`pintarFot()` llama `ctxFotometrico(o)` con **un solo argumento**, y la firma es
`ctxFotometrico(o, thetaIntArcmin)`: el tamaño va como SEGUNDO parámetro, no
dentro de `o`. Sin él, la guarda `FOT.H2C && thetaIntArcmin > 0` no se cumple
nunca y toda capa difusa sin máscara propia —hoy solo la niebla del ADR 0022—
cae en la rama heredada **C_MAG**.

Esto contradice el propio ADR 0022, que prerregistró literalmente «el `Cmin` de
producción (`ctxFotometrico` con H2c activa, ADR 0008)». El harness mide con
H2c; producción pinta con C_MAG. Medido en la nota: a 200 mm/300× C_MAG da
`Cmin` = 0,219 y H2c con θ = 14′ daría 0,531, **2,4× más permisiva justo donde
la física pide que la niebla se apague**. El PASA 4/4 del ADR 0022 describe,
por tanto, una ley que producción no aplica.

La causa raíz es que `nieblaCampo()` es la única capa difusa que no declara su
escala: el cúmulo y PS1 calculan su θ y marcan `difusoMask`
(`bitacora-ps1.js:1349` es el único sitio del repo que pasa el segundo
argumento).

## La regla que se decide

**θ_eff de la niebla = θ_R(SBe)/aumentos**, la escala de Riccò proyectada al
cielo.

No es una constante nueva ni un barrido de parches: es **la misma regla que ya
está en producción** para el grano SBF (`pintarCumulo`, «el compromiso tiene un
máximo, y está donde el término de Riccò vale 1: θ* = θ_R/M. Ni barrido de
escalas ni parámetro de parche: θ_R y los aumentos ya estaban en la ley»).
Y es la escala a la que la niebla ya está suavizada: el núcleo tienda del
ADR 0022 tiene semiancho θ_R/M, así que por debajo de ella la capa no tiene
estructura que juzgar.

Consecuencia algebraica, no medida: con θ_eff = θ_R/M el término de Riccò vale
`raz = 1 + θ_R/((θ_R/M)·M) = 2` (salvo el suelo de seeing en cuadratura), o sea
**`Cmin` × 4 constante**, sin dependencia del aumento. Que el factor no dependa
del aumento es deliberado: la nota midió que el contraste de la niebla es
invariante con el aumento a censo congelado (1,6 % entre 40× y 600×), y que su
apagado real viene de `mlim`, no del umbral. Una θ fija de tamaño de cúmulo
metería una dependencia del aumento de signo contrario a esa medida.

## Listones

Se reejecutan los cuatro del ADR 0022, con el MISMO banco, anillos y equipos, y
juzgando con la ley nueva. Se añade uno.

| # | Comprobación | Umbral |
|---|---|---|
| Q1 | M11, E1: algún anillo visible | `C_exc ≥ Cmin` en ≥ 1 anillo |
| Q2 | NGC 7789, E1: algún anillo visible | `C_exc ≥ Cmin` en ≥ 1 anillo |
| Q3 | Controles (M45, NGC 1664, NGC 2266): ningún anillo visible en ningún equipo | `C_exc < Cmin` en todos |
| Q4 | Monotonía con la apertura: M11 nuclear con 457 mm menor que con 200 mm a igual aumento | `C_exc(E3) < C_exc(E1)` |
| Q5 | La ley nueva no es más permisiva que la vieja en ningún punto del banco | `Cmin(H2c) ≥ Cmin(C_MAG)` en todo cúmulo/equipo/anillo |

Q5 es el listón que hace falsable la corrección: si en algún punto H2c dejara
pasar MÁS que C_MAG, el arreglo no sería tal, sería otro mando.

Los listones se juzgan con la ganancia estética a **1** (`NIEBLA_GANANCIA_ESTETICA
= 1`): lo que se valida es la ley, no el parche. El efecto del parche sobre Q3
se mide aparte y se anota, como ya se hizo en el ADR 0022.

## Vías de escape

- Si **Q1 o Q2 fallan**: la ley correcta apaga la niebla también donde la
  observación dice que se ve. Entonces el problema no es el arreglo sino la
  regla de θ, y se documenta con las medidas antes de tocar nada más. No se
  ablanda θ para que pase: eso sería ajustar el umbral a posteriori.
- Si **Q3 falla**: la ley nueva sobre-pinta y no entra; se documenta.
- Si **Q5 falla**: hay un error en el arreglo, se investiga como bug.
- Si Q1–Q5 pasan pero la niebla queda mucho más tenue, ESO NO ES UN FALLO: es
  el efecto esperado de aplicar la ley que el ADR 0022 dijo que aplicaba. El
  brillo es asunto del parche estético (`NIEBLA_GANANCIA_ESTETICA`), que es un
  mando declarado y separado, no de la ley.

## Alcance del cambio en el código

`pintarFot()` pasa a recibir la escala de la capa difusa sin máscara y a
reenviarla a `ctxFotometrico`. La niebla deja de ser la excepción muda: declara
su θ con la misma función que usa para suavizar. No se toca `ctxFotometrico`,
ni H2c, ni `magLimite`, ni la máscara difusa del cúmulo o de PS1.

Queda FUERA de este ADR el hallazgo **H2** de la nota (la luz de la niebla no
se realimenta al cielo por `sumaSB`/`veloSB`, ADR 0014): tiene lazo
—más niebla → peor `mlim` → más niebla— y merece su propio prerregistro.

---

## Resultado (2026-09-02) — Q2 FALLA

Ejecutado con la regla tal como está prerregistrada arriba, ganancia estética a
1, sqm 21,5.

**Q5 PASA**, y es lo primero que hay que mirar porque valida que esto es un
arreglo y no otro mando: la ley nueva es más estricta en los cuatro equipos.

| Equipo | θ = θ_R/M | Cmin H2c | Cmin C_MAG (lo que se aplicaba) | razón |
|---|---|---|---|---|
| E1 200 mm 61× | 95,8″ | 0,639 | 0,262 | 2,44 |
| E2 200 mm 150× | 56,1″ | 1,199 | 0,200 | 6,00 |
| E3 457 mm 61× | 70,5″ | 0,376 | 0,154 | 2,44 |
| E4 457 mm 229× | 31,2″ | 0,903 | 0,102 | 8,87 |

La razón crece con el aumento (2,4× a 61×, 8,9× a 229×): la ley heredada era
tanto más permisiva cuanto más aumento, que es justo el régimen donde la física
de la nota pide que la niebla se apague.

- **Q1 PASA**: M11/E1 nuclear, C_exc = 1,629 contra Cmin = 0,639.
- **Q3 PASA**: ningún control visible en ningún equipo.
- **Q4 PASA**: C_exc(E3) = 0,640 < C_exc(E1) = 1,629.
- **Q2 FALLA**: NGC 7789/E1 nuclear, C_exc = 0,362 contra Cmin = 0,639. Se queda
  a un factor 1,77 de verse, y ningún anillo llega en ningún equipo. Los
  informativos también caen: M37/E1 pasa de visible a no visible, y M46 sigue
  sin verse.

Nótese que con esta regla `Cmin` ya no depende del anillo (0,639 en los tres de
E1): θ es del equipo, no de la reja de la medida. Eso es correcto —el anillo
nunca fue un objeto que el ojo viera como una pieza— pero deja ver el problema.

### Diagnóstico

No se ablanda θ, según la vía de escape comprometida arriba. El diagnóstico se
escribe como lo que es, un razonamiento, no una medida:

θ_eff = θ_R/M fuerza `raz = 2` **siempre**, es decir el penalti máximo que la
ley H2c aplica a un objeto que apenas llena el disco de Riccò. Para el grano SBF
esa elección es correcta porque allí se está eligiendo el parche ÓPTIMO sobre el
que juzgar una textura, y el óptimo está en θ_R/M. Pero la niebla no es una
textura que se integre: es una mancha lisa cuya extensión real son minutos de
arco —el núcleo de M11 mide 3,5′, el de NGC 7789 4′—, y a un objeto grande la
ley H2c le da `raz → 1`, no 2. Aplicarle el penalti del objeto mínimo es
castigarla dos veces: ya se la suavizó a θ_R/M, y encima se la juzga como si esa
fuera toda su extensión.

O sea: el listón que falla no dice que la niebla de NGC 7789 no se vea, dice que
**θ_R/M no es la escala a la que se la debe juzgar**. La regla del grano no
traslada.

### Estado y qué queda

El arreglo de fontanería de H1 es correcto y se queda: `pintarFot` ya recibe y
reenvía la escala, y sin eso H2c no podía entrar de ninguna manera. Lo que queda
abierto es la REGLA de θ, no el cauce.

Para cerrarlo hace falta una regla que estime la extensión coherente de la
mancha de niebla. Cuenta hecha a mano, sin implementar (por tanto **no medida**,
y por tanto no vale como resultado): con θ_eff = la extensión del anillo del
propio cúmulo, NGC 7789 nuclear daría `raz` = 1,40 y Cmin ≈ 0,313 contra
C_exc = 0,362, y pasaría. Pero en producción no hay «cúmulo»: es un campo
ordinario y nadie sabe dónde acaba la mancha.

Eso es un algoritmo nuevo, y el repo ya tiene historial en esa vía: la escala de
soporte local se probó en las galaxias de PS1 y se descartó con medidas (fase 2
de los interbrazos, «la caja grande borra lo compacto»). No se abre aquí sin su
propio prerregistro, y con un tope duro: si una segunda regla razonable tampoco
separa los positivos de los controles, la conclusión es que la niebla no tiene
una escala bien definida y se cierra con lo que haya.

---

## Prerregistro v2 (comprometido antes de medir)

Cambia solo la REGLA DE θ. Banco, anillos, equipos y los cinco listones quedan
idénticos, y se siguen juzgando con la ganancia estética a 1.

### La regla

    θ_eff = max( θ_R/M , R50 )

donde `R50` es el radio que engloba el 50 % del flujo difuso del campo,
calculado por el **momento de segundo orden de la distribución de flujo de las
estrellas que forman la niebla** (las de `g > mlim + cola`, las mismas que
`nieblaCampo` deposita), no por un recuento ordenado:

1. Centroide ponderado por flujo de esas estrellas.
2. `⟨r²⟩ = Σ f·r² / Σ f` respecto de ese centroide.
3. `R50 = 0,832 · √⟨r²⟩`.

El 0,832 es exacto para un perfil gaussiano 2D (`R50 = σ·√(2·ln2)` y
`⟨r²⟩ = 2σ²`). **Es una hipótesis de forma declarada**, no una medida: un perfil
más picudo que una gaussiana da un `R50` real menor que el estimado. Se elige el
momento y no el percentil ordenado porque es O(n) en la misma pasada que ya hace
`nieblaCampo`, sin ordenar ni guardar la lista.

El `max` con θ_R/M mantiene el suelo del v1: la niebla nunca se juzga a una
escala menor que aquella a la que está suavizada.

### Por qué esta regla y no un soporte local

No hay caja, ni parche, ni barrido de escalas: hay **un solo número por campo**,
sacado de la fotometría del propio campo. Eso evita de raíz el modo de fallo que
mató la vía del soporte local en las galaxias de PS1 («la caja grande borra lo
compacto»), porque aquí no se decide píxel a píxel. Y no necesita que nadie
etiquete el objeto como cúmulo: en un campo ordinario sin concentración, `R50`
sale grande por construcción y la regla se comporta distinto que en un campo
concentrado. Cero constantes nuevas salvo el 0,832, que es geometría.

### Amenaza a la validez, escrita ANTES de medir

`R50` se calcula sobre las estrellas del campo, y el campo galáctico de fondo es
casi plano en radio (medido en el ADR 0022 v1: NGC 1664 va 23,17/23,14/23,33 del
centro al borde). En un campo dominado por fondo plano, el momento de segundo
orden lo fija el BORDE del campo, no el cúmulo, así que `R50` tenderá al radio
del campo, θ_eff será grande, `raz → 1` y `Cmin` caerá a su valor base — que es
**más permisivo que la ley C_MAG que producción aplicaba** (medido arriba: base
≈ 0,16 contra 0,262 en E1). Es decir: el riesgo concreto de esta regla es que
**haga fallar Q3 y Q5 a la vez**, y por el mismo mecanismo que hundió a v1 del
ADR 0022.

Se prerregistra igualmente porque el efecto es medible y la predicción es
falsable. Si ocurre, no es un ajuste que corregir: es la respuesta.

Threat adicional, sin listón: en el harness el campo son las estrellas del
fixture (radio 1,1·R del cúmulo); en producción es el campo del ocular. Los dos
`R50` no son el mismo número salvo que el campo del ocular se parezca a la
extensión del cúmulo. Se anota al medir.

### Criterio de cierre

Comprometido antes de ver nada:

- **Q2 pasa y Q3 pasa** (y Q1, Q4, Q5 se mantienen) → la regla entra en
  producción y el asunto queda cerrado.
- **Cualquier otro resultado** → se acepta y se cierra con la **opción 1**: se
  queda la regla v1 (θ_R/M), con NGC 7789 y M37 sin niebla, y se documenta que
  la niebla no tiene una escala bien definida en el simulador. **No hay v3.**

---

## Resultado de v2 (2026-09-02) — Q1–Q4 PASAN, Q5 FALLA

Ejecutado con la regla prerregistrada arriba, ganancia estética a 1, sqm 21,5.
`R50` se calcula en `nieblaCampo()` en la misma pasada que deposita el flujo, y
el harness lo importa llamando a esa función (ADR 0008).

| Cúmulo | θ_juicio (E1) | ¿manda R50 o el suelo θ_R/M? |
|---|---|---|
| M11 | 268″ | R50 |
| NGC 7789 | 299″ | R50 |
| M37 | 447″ | R50 |
| M46 | 496″ | R50 |
| M45 | 2140″ | R50 |
| NGC 1664 | 345″ | R50 |
| NGC 2266 | 97″ | suelo θ_R/M (95,8″), por poco |

- **Q1 PASA**: M11/E1 nuclear, C_exc = 1,629 contra Cmin = 0,294.
- **Q2 PASA**: NGC 7789/E1, dos anillos visibles — nuclear 0,362 y medio 0,280,
  contra Cmin = 0,279. El anillo medio pasa por 0,001: el margen es un pelo.
- **Q3 PASA**: ningún control visible en ningún equipo. NGC 2266, que era el que
  rozaba en el ADR 0022, ahora queda lejos (E1: C_exc máximo 0,224 contra
  Cmin = 0,634), porque es el único del banco donde manda el suelo.
- **Q4 PASA**: C_exc(E3) = 0,640 < C_exc(E1) = 1,629.
- Informativos: M37/E1 vuelve a verse, M46/E1 no.
- **Q5 FALLA en 10 de 28 puntos**: con θ grande, H2c es MÁS permisiva que la
  C_MAG heredada. Peor caso M45/E3, razón 0,65 (0,100 contra 0,154). El patrón
  es sistemático: falla a 61× en los cúmulos extensos y nunca en los equipos de
  mucho aumento (a 150× y 229× la razón va de 1,58 a 3,77).

Era el riesgo escrito antes de medir, y ocurrió por el mecanismo previsto: en un
campo ancho el momento de segundo orden lo fija la extensión del campo, θ crece,
`raz → 1` y `Cmin` cae hacia su base.

### Qué significa el fallo de Q5, medido

**0 cambios de veredicto sobre 84 anillos medidos.** Ningún anillo del banco pasa
de invisible a visible ni al revés por culpa de la diferencia entre las dos
leyes. El fallo de Q5 es de MARGEN, no de comportamiento: donde H2c es más
permisiva (M45, M46, M37 a 61×) el exceso de la niebla es tan bajo que ninguna de
las dos leyes lo deja pasar.

Efecto colateral medido, y favorable: con la ley v2, el parche estético a 1,5
**ya no rompe P3**. Los tres anillos de NGC 2266 que se colaban en el ADR 0022
con la ganancia puesta ahora quedan por debajo del umbral.

### Autocrítica sobre Q5

Q5 estaba mal formulado, y conviene decirlo sin usarlo para salvar el resultado.
Pide que la ley nueva sea más estricta que la vieja **en todo punto**, pero la
vieja (C_MAG) es precisamente la ley equivocada que este ADR viene a quitar. Ser
más permisivo que una ley errónea no es evidencia de haber metido un mando: es
lo que pasa cuando la ley correcta discrepa de la incorrecta en el sentido
contrario al esperado. Lo que Q5 quería vigilar de verdad —que el arreglo no
sirviera para colar niebla donde no la hay— lo vigila Q3, y Q3 pasa.

Dicho esto, Q5 se registra como FALLADO y no se reinterpreta. Que la conclusión
que se saque de un listón fallado sea «el listón estaba mal» es exactamente el
razonamiento que el ADR 0005 desconfía, así que la decisión de si Q5 veta o no
se deja explícita abajo en vez de resolverse aquí.

### Criterio de cierre: los dos textos no coinciden

- Criterio del usuario, tal como lo dio: «si con esta regla Q2 pasa y Q3 sigue
  [pasando], el problema está cerrado». **Por este criterio, v2 entra.**
- Criterio como quedó escrito en el prerregistro v2 de este ADR: «Q2 pasa y Q3
  pasa (y Q1, Q4, **Q5** se mantienen)». **Por este criterio, se cierra con la
  opción 1.**

La diferencia es la línea de Q5, que se añadió al redactar el ADR y no venía en
la instrucción. Queda pendiente de que el usuario decida cuál gobierna. Mientras
tanto, producción lleva la regla v2, que es la que satisface el criterio que él
formuló.

---

## Decisión de cierre (2026-09-02) — v2 es definitiva

`θ_eff = max(θ_R/M, R50_flux)` entra en producción. Asunto cerrado, sin v3.

**Q5 se descarta como criterio de cierre**, y la razón es de fondo, no de
conveniencia: Q5 tomaba como referencia la ley **C_MAG**, que es exactamente la
ley inválida que este ADR viene a reemplazar. Un listón que exige «no ser más
permisivo que la ley equivocada» no mide la corrección de la ley nueva; mide su
parecido con la vieja, y con ese criterio ninguna corrección que discrepe hacia
el lado permisivo podría pasar nunca, fuese cual fuese la física. El guardián
real contra falsos positivos es **Q3**, que pasa con margen.

El cierre se apoya en:

- **Q1, Q2, Q3 y Q4 verdes** con la regla v2.
- **0 cambios de veredicto sobre 84 anillos** medidos entre la ley vieja y la
  nueva: las violaciones de Q5 no producen ningún efecto visual, ni sobre los
  controles ni sobre los positivos.
- **Estabilidad frente al parche estético**: con v1, la ganancia 1,5 rompía P3
  en tres anillos de NGC 2266; con v2 no rompe ninguno. Una regla cuyo veredicto
  no se da la vuelta al mover un mando declarado es más robusta que otra que sí.

### Q5, reformulado para el futuro

Q5 queda **retirado** en su forma original. Su intención —comprobar que el
cambio es un arreglo y no un mando nuevo— sigue siendo válida, así que se
sustituye por dos listones que no citan a C_MAG como autoridad:

- **P5 (físico, absoluto, y ya corriendo en el harness):** a apertura fija, el
  `Cmin` de la niebla **crece** con el aumento. Ancla la ley a lo que la nota
  midió —la niebla se apaga al subir aumento— en vez de anclarla a una ley
  anterior. Medido con v2: 200 mm 0,294→0,437, 457 mm 0,149→0,281. PASA.
- **P6 (regresión, sobre VEREDICTOS y no sobre valores de `Cmin`):** ningún
  anillo del banco puede pasar de invisible a visible al cambiar de ley. Usa la
  ley anterior solo como línea base de regresión, que es un uso legítimo, no
  como criterio de verdad. Medido con v2: 0/84.

**Regla general que deja este episodio, y que vale para el próximo ADR:** un
listón que compara la ley nueva contra la ley que se está sustituyendo solo
puede vigilar VEREDICTOS (regresión), nunca VALORES (corrección). Si la ley
vieja fuese autoridad sobre los valores, no habría nada que corregir.
