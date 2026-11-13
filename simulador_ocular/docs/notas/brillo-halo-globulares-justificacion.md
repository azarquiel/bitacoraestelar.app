# Brillo del halo de los globulares: en qué se apoya y si está justificado

Fecha: 2026-11-11. Estado: investigación y medida, sin cambios en producción.
Destino previsto: `simulador_ocular/docs/notas/brillo-halo-globulares-justificacion.md`
(la escritura en el checkout compartido estaba bloqueada).

**Pregunta del usuario.** ¿En qué nos basamos para fijar el brillo del halo de los
cúmulos globulares? Parece demasiado brillante. ¿Es una impresión o lo dicen los datos?

Convenciones de la carpeta:

- `fichero:línea` verificado contra `main` (a17c594, con el PR #533 ya
  mergeado). Si no se indica fichero, es `resources/js/bitacora-gaia-render.js`.
- Las etiquetas:
  - **MEDIDO**: cifra sacada en node con el código de producción (§7).
  - **DOCUMENTADO**: decisión respaldada por un ADR o una nota del repo.
  - **SIN JUSTIFICACIÓN**: constante sin fuente ni medida que la ancle.
  - **[sin verificar]**: no comprobado en la fuente primaria.

Alcance de las medidas: **solo la capa difusa** (`pintarCumulo` → tono de `pintarFot`).
No incluyen sprites de estrella, `adaptacionLocal`, el canvas real ni el monitor.

---

## 0. Veredicto en cinco líneas

1. **El usuario tiene razón en el halo exterior, no en el núcleo.** Por dentro de
   ~2 r_h, el velo sale del perfil de Harris normalizado a V_t, y el nivel en pantalla
   es el lineal (sin realce). Desde ~4′ hacia fuera en M13, la producción pinta **más**
   que la cadena lineal sin ningún desvanecido: 15,7 frente a 7,8 DN a 6′ (200 mm, 100×).
2. **Culpable principal: `GAMMA_PERCEPTUAL = 0,45` (`:246`) aplicada con `t = s_halo`
   (`:620`, `:2858`).**
   - La gamma está a pleno justo donde el halo roza el umbral, así que el
     desvanecido por umbral queda **invertido** en vez de suavizado. Con la gamma,
     el velo en el radio del umbral pasa de 1–2 DN a 11–17 DN, entre ×8 y ×12.
   - **No tiene fuente ni medida.** Sale del commit 7a985db, calibrado a ojo con
     NGC 891, y el ADR 0022 la llama «el eslabón sospechoso».
3. **Cómplice: `UMBRAL_MARGEN = 0,4` / `UMBRAL_ANCHURA = 1,4` (`:254`).** El halo se
   pinta desde 1 mag **por debajo** del umbral, y por eso el borde pintado se alarga
   unos 2′ (+35 % en radio) más allá del umbral local. Tampoco tiene fuente.
4. **Tercer factor, en la física de entrada.** El perfil de King 1962 con los
   parámetros de Harris es **0,9–1,1 mag más brillante que Trager et al. (1995)**
   entre 5′ y 17′ de M13. Solo el velo, a 7′, ya supera la luz **total** medida ahí.
   El test E3.2 solo valida entre 0,5 y 3 r_c, así que esto no lo vigila nadie.
5. **Qué valor respalda la fuente.** Para la gamma, ninguno: ningún número suyo
   tiene base (ADR 0004 y 0022). Lo único que las fuentes sí respaldan:
   - un halo que **se acabe en el umbral** (Blackwell, Crumey), y que con estos
     datos queda en un radio de ~5,8′ con 200 mm a 100×, no en 7,8′;
   - un perfil exterior que siga a Trager, no al King analítico.

---

## 1. La cadena, de catálogo a píxel

### 1.1 Qué entra del catálogo

Ficha de Harris (1996, rev. 2010), en `simulador_ocular/resources/js/globulares-datos.js:62`
para M13: `r_c` = 0,62′, `r_h` = 1,69′, `c` = 1,53, `μ_V(0)` = 16,59, `V_t` = 5,78,
`d` = 7,1 kpc, `E(B−V)` = 0,02, `[Fe/H]` = −1,53.

| paso | qué hace | dónde | estado |
|---|---|---|---|
| Flujo total | `F_tot = 10^(−0,4·V_t)` | `bitacora-cumulos.js:195` | **DOCUMENTADO** (Harris) |
| Nº de estrellas | `N_tot = F_tot / Σ φ·f`, sale de exigir que la LF sume V_t | `bitacora-cumulos.js:205-207` | **DOCUMENTADO** |
| Módulo de distancia aparente | `5·log(100·d) + 3,1·E(B−V)` | `bitacora-cumulos.js:194` | **DOCUMENTADO** (R_V estándar) |
| Forma radial | King 1962 analítico, `r_t = r_c·10^c` | `:2259-2265`, `bitacora-cumulos.js:282-290` | **DOCUMENTADO**, con el sesgo de §3 |

`μ_V(0)` de Harris **no se usa**: el centro sale de V_t y la forma. Medido (§7, `halo.js`):

| cúmulo | μ(0) del render | μ_V(0) de Harris | diferencia |
|---|---|---|---|
| M13 | 16,49 | 16,59 | −0,10 |
| M3 | 16,09 | 16,64 | −0,55 |
| M5 | 15,80 | 16,09 | −0,29 |

El render sale más brillante en el centro en los tres casos. Es el mismo sesgo
de King de un parámetro que ya apunta `simulador_ocular/docs/iteraciones/v7_autocritica.md:160`.

### 1.2 Qué se resta: las estrellas resueltas

- Velo: `⟨I⟩(r) = Σ(r)·S1campo(m_res, r)` (`:2619`). `S1campo` es la cola de la LF por
  debajo de `m_res`, pesada por `1 − w·a(m, r)` (`bitacora-cumulos.js:270-280`).
- `m_res(r)` es `magLimite` contra el cielo **más el propio velo**, iterado hasta el
  punto fijo con 5 pasadas (`:2609-2617`, ADR 0012, `0012-crowding/punto_fijo.md`).
- El crowding es probabilidad por estrella: `a = exp(−Σ·N(≥ m + Δm)·π·θ_sep²)`
  (`bitacora-cumulos.js:332-338`, ADR 0012).
  - `θ_sep` = 1 radio de imagen: Rayleigh, **DOCUMENTADO** en `0012-crowding/ancla_thetasep.md`.
  - `dmagCrowd = 0,75` (`bitacora-cumulos.js:51-54`): **SIN JUSTIFICACIÓN**, y el propio código lo declara «sin ancla propia».
- Conservación: velo + estrellas dibujadas = F_tot. Es una identidad
  (memoria «el halo ya es luz no resuelta»; ADR 0003, ADR 0011). **El velo no
  inventa luz respecto al perfil de entrada.** Si sobra luz, sobra en el perfil (§3)
  o en el tono (§2).

### 1.3 Ley visual: qué parte del velo se ve

- El umbral es `F_u = F_cielo·C_min`, con `C_min` de la ley H2c (`:338-370`) y juzgado con
  el tamaño del cúmulo entero, `θ = 2·r_h·√(1−e)` (`:2726-2727`).
  - Blackwell (1946) y el ajuste H2c están **DOCUMENTADOS**: ADR 0001 y 12 observaciones de campo.
  - `C_EXP = 0,35` es un anclaje empírico que no coincide con la pendiente de
    Crumey (`:125-135`). Es deuda documentada.
- El desvanecido es `s_halo = suave((log10(I/F_u) + 0,4)/1,4)` (`:554-558`, `:2621`).
  Arranca en `I = 0,40·F_u` (1 mag por debajo del umbral), vale 0,20 en el umbral, 0,5 a
  2·F_u y 1 a 10·F_u. **SIN JUSTIFICACIÓN**:
  - el comentario (`:247-253`) solo dice que «barre ~5 magnitudes» para no dejar cuñas negras en las bandas de polvo de las galaxias de canto, que es un criterio de aspecto;
  - Crumey lo describe sin anclarlo (`simulador_ocular/docs/referencias/crumey-2014-umbral-de-contraste.md:490`);
  - la función psicométrica de Blackwell pasa de casi 0 a casi 1 en un factor ~2 de contraste alrededor del 50 % **[sin verificar la cifra exacta en Blackwell 1946]**. La rampa del repo abarca un factor 25.

### 1.4 Transferencia a pantalla

- El incremento sobre el cielo es `DN = 255·2,5·log10(1 + F/F_cielo)/11,5`
  (`:544-546`): 22,2 DN por magnitud de contraste.
  - El rango 11,5 sale de `SB_NEGRO − SB_BLANCO = 25,5 − 14,0` (`:123`).
  - **SIN JUSTIFICACIÓN** propia: es la escala del display, igual que `SB_CIELO_BLANCO = 16,5` (`:214`), que el código llama «la perilla artística» (`:211`).
- **Realce perceptual** (`:612-624`):
  - `γ_ef = 1 + (0,45 − 1)·(1 − t)` (`:620`), con `t = s_halo`, que escribe la máscara (`:2858`) y lee `pintarFot` (`:656-669`).
  - En el núcleo t = 1 y no hay realce. En el borde, t → 0 y γ = 0,45 entera.
- El suelo de pintado es `SB_SUELO_PINTADO = 25,08` (`:224`), igual que
  `SB_FONDO_NULO` (`:230`).
  - Son cantidades distintas que comparten valor, y el ADR 0030 las enmienda.
  - Solo actúan con `SBe > 25,08`. En los casos de §2 el SBe es 21,6–24,3, así que
    aquí **ni el 27 ni el 25,08 intervienen**.
- Después vienen `adaptacionLocal` (`:446-454`, realce de 0,5, umbral de 12 DN) y el
  `clamp`. Están fuera de esta medida.
  - Su efecto en el núcleo está en `nucleo-quemado-globulares-rango-dinamico.md`.

---

## 2. Medidas sobre la capa difusa (MEDIDO)

Condiciones: AFOV y lienzo de `scripts/matriz_m13.js`, T = 0,9, pupila del ojo 7 mm,
sin estrellas de Gaia. Las columnas son:

- `I/F_u`: el velo sobre el umbral.
- `DNlin`: el velo sin desvanecido y sin gamma, o sea la física a secas.
- `DN(s)`: con el desvanecido y sin gamma.
- `DNprod`: producción.

### 2.1 M13, 200 mm, 100× (pupila de 2,0 mm), SQM 21,5. SBe 24,33, `μ_umbral` 22,44

| r | μ total (King) | μ velo | I/F_u | s_halo | DNlin | DN(s) | **DNprod** | ×gamma |
|---|---|---|---|---|---|---|---|---|
| 0 | 16,49 | 16,55 | 228 | 1,00 | 110,1 | 110,1 | 110,1 | 1,0 |
| r_c 0,62′ | 17,27 | 17,40 | 104 | 1,00 | 91,4 | 91,4 | 91,4 | 1,0 |
| r_h 1,69′ | 18,93 | 19,21 | 19,5 | 1,00 | 53,4 | 53,4 | 53,4 | 1,0 |
| 3′ | 20,24 | 20,59 | 5,5 | 0,91 | 28,8 | 27,2 | 30,5 | 1,1 |
| 4′ | 20,96 | 21,35 | 2,7 | 0,64 | 18,4 | 13,3 | **23,7** | 1,8 |
| 5′ | 21,57 | 21,99 | 1,5 | 0,38 | 11,9 | 5,2 | **19,8** | 3,8 |
| 6′ | 22,10 | 22,54 | 0,91 | 0,16 | 7,8 | 1,5 | **15,7** | 10,7 |
| 8′ | 23,03 | 23,50 | 0,38 | 0 | 3,6 | 0 | 0 | — |

Radios de referencia:

- el velo baja del umbral a **5,79′**;
- pintado (≥ 1 DN) sin gamma hasta 6,24′;
- **pintado en producción hasta 7,80′**, donde cae de golpe de ~10 DN a 0, en el corte de `s_halo`.

### 2.2 M13, 406 mm, 50× (pupila de 8,1 mm, recortada a 7), SQM 21,5. SBe 21,61, `μ_umbral` 23,28

| r | I/F_u | s_halo | DNlin | DN(s) | **DNprod** | ×gamma |
|---|---|---|---|---|---|---|
| 4′ | 6,1 | 0,94 | 18,9 | 18,0 | 19,7 | 1,1 |
| 6′ | 2,1 | 0,51 | 8,1 | 4,5 | **13,2** | 2,9 |
| 8′ | 0,85 | 0,14 | 3,7 | 0,6 | **10,0** | 18,2 |

Radios de referencia:

- umbral a **7,59′**;
- pintado sin gamma hasta 7,51′;
- **pintado en producción hasta 9,77′**.

### 2.3 Otros casos: el mismo patrón

| caso | r umbral local | r pintado ≥ 1 DN | DNprod en el umbral (sin gamma) | C físico en el umbral | C de pantalla en el umbral* |
|---|---|---|---|---|---|
| M13 200/100× SQM 21,5 | 5,79′ | 7,80′ | 16,7 (2,0) | 0,43 | 7,96 |
| M13 406/50× SQM 21,5 | 7,59′ | 9,77′ | 11,0 (0,9) | 0,20 | 0,84 |
| M13 406/200× SQM 21,5 | 5,66′ | 7,63′ | 14,2 (1,5) | 0,31 | 6,21 |
| M13 200/100× SQM 20 | 4,47′ | 6,24′ | 12,0 (1,1) | 0,23 | 1,67 |
| M13 200/50× SQM 21,5 | 6,52′ | 8,66′ | 14,7 (1,6) | 0,34 | 2,19 |
| M3 200/100× SQM 21,5 | 5,33′ | 7,52′ | 15,3 (1,7) | 0,36 | 7,04 |
| M5 200/100× SQM 21,5 | 6,00′ | 8,21′ | 16,7 (2,0) | 0,42 | 7,92 |

\* Contraste de Weber en **luminancia de pantalla**, decodificando sRGB nominal:
`L(fondo + DN)/L(fondo) − 1`.

- Con el fondo en 2,4 DN (pupila de 2 mm) es una **cota superior**: el negro real
  de un panel domina ahí. Hay que fiarse más de las filas con fondo ≥ 9 DN.
- Incluso en la de 406/50× (fondo 23,8 DN) la pantalla enseña el halo en el umbral
  con un contraste ×4 el físico (0,84 frente a 0,20).
- **Qué significa:** algo que en el ocular está *justo* en el umbral, con un 50 %
  de probabilidad de detección, sale en pantalla con 11–17 DN sobre el fondo. Eso
  es claramente visible, no «en el límite».

### 2.4 Ablación: qué parámetro mueve más el halo (M13, DN a 4′/6′/8′ y radio pintado)

| variante | 200/100× | 406/50× |
|---|---|---|
| producción | 23,8 / 15,8 / 0 → 7,80′ | 19,9 / 13,3 / 10,0 → 9,77′ |
| sin gamma (columna DN(s) de §2.1–2.2, desvanecido intacto) | 13,3 / 1,5 / 0 → 6,24′ | 18,0 / 4,5 / 0,6 → 7,51′ |
| `UMBRAL_MARGEN = 0` | 28,5 / 0 / 0 → 5,74′ | 25,2 / 15,7 / 0 → 7,51′ |
| velo atenuado por el residuo King−Trager (§3) | 22,1 / 6,2 / 0 → 6,32′ | 17,7 / 11,4 / 0 → 7,71′ |

Ojo con el A/B de consola `fot.GAMMA_PERCEPTUAL = 1` (memoria
«halo-m13-es-la-gamma-no-el-grano»). **No es una ablación pura.**

- Con gamma 1, `perceptual` pasa a `false` (`:2712`, `:637`) y `visibilidadDifusa`
  cambia también a la rampa lineal vieja (`:555`).
- Lo medido así es 18,5 / 0 / 0 → 5,33′ y 19,0 / 6,7 / 0 → 6,85′. Mezcla dos cambios.

Qué se lee:

- **La gamma es lo que más extiende y aclara el halo exterior.**
  - A 6′: de 1,5 a 15,8 DN con 200/100×.
  - A 8′: de 0,6 a 10,0 DN con 406/50×.
  - Con 200/100× es además la única que hace que el halo pintado **supere** al lineal.
- Bajar `UMBRAL_MARGEN` recorta el borde pero **aclara** el interior a 4′. Al bajar
  s_halo, la gamma entra con más fuerza. Por sí solo no arregla el aspecto.
- El residuo de Trager recorta el radio pintado 1,5′ en 200/100×. Es el único de los
  tres con fuente primaria detrás.

---

## 3. El perfil de entrada contra Trager, King & Djorgovski (1995) (MEDIDO)

`simulador_ocular/docs/validacion/trager1995.tsv` (VizieR J/AJ/109/218), M13, puntos
con peso > 0. Se da la mediana punto a punto de `μ_King(Harris) − μ_Trager`:

| tramo de r | n | residuo |
|---|---|---|
| 0,09–0,17′ | 5 | −0,22 |
| 0,17–0,30′ | 8 | −0,13 |
| 0,30–0,94′ | 23 | −0,04 / −0,05 |
| 0,94–2,96′ | 20 | +0,14 / +0,10 |
| 2,96–5,27′ | 13 | **−0,33** |
| 5,27–9,37′ | 20 | **−0,93** |
| 9,37–16,7′ | 31 | **−1,08** |
| 16,7–29,6′ | 7 | −0,40 |

El signo negativo indica que el render es más brillante.

- **Integrando la curva suavizada de Trager (`muVf`) hasta 21′ sale V = 5,87**,
  frente a V_t = 5,78 de Harris. El punto cero cuadra a 0,09 mag. **El fallo es de
  forma**: el King analítico de 1962 con `c` de Harris pone 2,4–2,7 veces de más
  en flujo entre 5′ y 17′.
- M15 (NGC 7078), mismo método por tramos: −0,69 a 6,7′ y −1,09 a 11,5′. No es
  algo propio de M13.
- A 7,2′ Trager mide 23,64 de luz **total**. El velo del render solo, sin las
  estrellas resueltas, ya está en ~23,1 con 200/100×.
- El test que lo vigila, E3.2 (`scripts/test_halo_v7_e3.js:72`), solo compara
  **entre 0,5·r_c y 3·r_c** (0,3′–1,9′ en M13). El sesgo del halo queda fuera de su ventana.
- Por qué pasa (RAZONADO, **[sin verificar]**):
  - Las `c` y `r_c` de Harris proceden de ajustes de modelos dinámicos (King 1966 /
    Wilson; McLaughlin & van der Marel 2005 ajustan sobre los datos de Trager).
  - El código las mete en la fórmula **empírica** de King (1962), cuya forma
    exterior no es la del modelo con el que se ajustaron.
  - No he leído la sección de Harris 2010 que dice de dónde sale cada `c`.

Sobre el diámetro visual de M13 a ojo, solo encontré cifras de divulgación: unos 8–10′
con 80–100 mm y unos 12–13′ en general, frente a 20–23′ fotográficos. **Son
anecdóticas y no entran en el veredicto.** Por coincidencia caen cerca del
diámetro de umbral de §2.1 (2 × 5,8′ = 11,6′), y bastante por debajo del pintado (15,6′).

---

## 4. La regla de Crumey del brillo encerrado no discrimina aquí (MEDIDO + RAZONADO)

`simulador_ocular/docs/referencias/crumey-2014-halo-dso.md` §2.1 propone el borde
visible como el cruce entre el brillo medio encerrado y el umbral del área encerrada
(Crumey 2014, Fig. 12).

Aplicado con la ley H2c del propio repo, con θ igual al diámetro encerrado, el
cruce cae en r ≈ r_t (15–24′) en **todos** los casos. Es un perfil muy concentrado:
el núcleo sostiene la media encerrada hasta la marea.

- La regla responde a «¿se detecta el objeto?», no a «¿hasta dónde llega el halo?».
- Crumey la valida en M33, con un perfil exponencial suave.
- **No sirve ni para acortar ni para alargar el halo**, y queda dicho para que nadie
  la use como argumento en ninguno de los dos sentidos.

---

## 5. Inventario: qué parámetro tiene respaldo

| parámetro | valor | dónde | respaldo |
|---|---|---|---|
| Perfil de King 1962 + r_c, c de Harris | — | `:2259`, `bitacora-cumulos.js:282` | **DOCUMENTADO**, con un sesgo de −0,9 a −1,1 mag en el halo frente a Trager (§3) |
| V_t, d, E(B−V) y LF | Harris; tablas de LF | `bitacora-cumulos.js:185-210` | **DOCUMENTADO** |
| m_lim,sky (Torres Lapasió) y punto fijo | — | `:766`, `:2609` | **DOCUMENTADO** (ADR 0010, 0012, 0030) |
| `thetaSepRadios` | 1,0 | `bitacora-cumulos.js:50` | **DOCUMENTADO** (Rayleigh) |
| `dmagCrowd` | 0,75 | `bitacora-cumulos.js:54` | **SIN JUSTIFICACIÓN** (lo declara el código) |
| `C_MIN`, `C_EXP`, H2c | 0,08; 0,35; θ_R | `:124`, `:192` | **DOCUMENTADO** (ADR 0001, 12 obs.); `C_EXP` es deuda conocida |
| θ de juicio del halo = 2·r_h | — | `:2726` | razonado en el comentario, sin medida que lo ancle |
| `UMBRAL_MARGEN` / `UMBRAL_ANCHURA` | 0,4 / 1,4 dex | `:254` | **SIN JUSTIFICACIÓN** (criterio de aspecto, motivado por las galaxias de canto) |
| `GAMMA_PERCEPTUAL` | 0,45 | `:246` | **SIN JUSTIFICACIÓN** (commit 7a985db, calibrado con NGC 891; ADR 0022:194 y :294-311 la señalan) |
| `t = s_halo` para la gamma | — | `:620`, `:2858` | decisión de diseño (retirar el realce donde ya se ve), **sin fuente** |
| `SB_NEGRO`/`SB_BLANCO` (11,5 mag) y `SB_CIELO_BLANCO` 16,5 | — | `:123`, `:214` | display, «perilla artística» (ADR 0009) |
| `SB_SUELO_PINTADO` / `SB_FONDO_NULO` | 25,08 | `:224`, `:230` | **DOCUMENTADO** (Crumey 2014 §2.1, ADR 0030); **no actúan** en estos casos |
| `REALCE`, `UMBRAL_DETALLE` | 0,5; 12 DN | `:438` | **SIN JUSTIFICACIÓN**; fuera de esta medida |

---

## 6. Qué haría falta para decidir (sin aplicar)

- **Gamma.** No hay valor bueno que proponer: depende del monitor y del ambiente
  (ADR 0022:300-306), y Crumey excluye explícitamente lo supra-umbral. Lo que sí se
  puede afirmar con fuente es una **restricción**, no un número:
  - un realce de display no debería hacer que un píxel con `I < F_u` (bajo el umbral
    de Blackwell/H2c) salga más brillante que su nivel lineal, y menos aún ×10–×18;
  - hoy la gamma, con `t = s_halo`, hace justo eso.
  Cualquier cambio necesita prerregistro (ADR 0004) y toca a la vez las galaxias de
  PS1, las planetarias y la niebla (ADR 0022:308-311).
- **Rampa.** Si el halo tiene que acabar en el umbral, `s_halo` debería valer ~0 en
  `I ≈ F_u`, o ser la función psicométrica de Blackwell centrada en `F_u`.
  - Con `UMBRAL_MARGEN = 0` el borde pintado coincide con el radio del umbral
    (5,74′ frente a 5,79′), pero aclara el interior si la gamma sigue igual (§2.4).
  - Las dos piezas van juntas.
- **Perfil.** Usar la curva `muVf` de Trager donde exista, o un modelo de
  King 1966 / Wilson con los parámetros de McLaughlin & van der Marel (2005).
  - Ampliar E3.2 hasta ~r_t.
  - Cambia la normalización y toca la conservación (v7_autocritica:160).
- **Antes de nada:** medir en el canvas real (sprites + `adaptacionLocal`) el halo de
  M13 a 200/100× y a 406/50×, con y sin cada pieza. Esta nota solo mide la capa difusa.

Aparte: en campos densos donde el proxy trunca (M22, no M13), la media `cielo.veloSB`
de la banda truncada sigue entrando en el cielo aunque haya cúmulo (`:3246-3256`
solo apaga el exceso espacial). Esa media también contiene luz del cúmulo, pero sube
el umbral, así que **apaga** el halo, no lo aclara. **[sin medir]**

---

## 7. Reproducir

Los arneses son efímeros, en `/Users/isra/.claude/jobs/faa6acac/tmp/arnes/` y fuera
del repo. Usan los mismos `require` que `scripts/matriz_m13.js`:

```
node halo.js      <repo>   # tablas §2.1-2.3 (pintarCumulo + valorDeFlujo/realzarPerceptual)
node trager.js    <repo>   # King(Harris) contra Trager por tramos (M13, M15)
node ablacion.js  <repo>   # §2.4 y §3 punto a punto + V integrada de muVf
node crumey.js    <repo>   # §2.3 (C de pantalla) y §4 (cruce encerrado)
```

El nivel de cada radio se forma igual que en `pintarFot:656-696`:

```
DN = valorDeFlujo(realzarPerceptual(I·s_halo, Fcielo, rango, s_halo), FcieloPintado, rango)
```

Las cuatro corridas tardan unos 2 min en total, sin paralelizar.

Entrada pendiente para `simulador_ocular/docs/notas/README.md`:

```
12. `brillo-halo-globulares-justificacion.md` (2026-11-11) — de dónde sale el brillo del halo de los globulares: el exterior lo inflan la gamma perceptual con t = s_halo y la rampa que arranca 1 mag bajo el umbral (ninguna con fuente), más un King 1962 que va 0,9-1,1 mag por encima de Trager entre 5′ y 17′
```

---

## Fuentes

- Blackwell, H. R. (1946). «Contrast thresholds of the human eye». *JOSA* 36, 624. doi:10.1364/JOSA.36.000624 **[DOI de memoria; psicométrica sin verificar]**
- Crumey, A. (2014). «Human contrast threshold and astronomical visibility». *MNRAS* 442, 2600. doi:10.1093/mnras/stu992, arXiv:1405.4209. Notas del repo: `simulador_ocular/docs/referencias/crumey-2014-*.md`.
- Harris, W. E. (1996). *AJ* 112, 1487. doi:10.1086/118116. Edición 2010: arXiv:1012.3224 y `mapa/datos/harris_mwgc.dat` (col. 7-10, `:423-426`).
- King, I. (1962). *AJ* 67, 471. doi:10.1086/108756 **[DOI de memoria]**
- King, I. R. (1966). *AJ* 71, 64. doi:10.1086/109857 **[DOI de memoria]**
- McLaughlin, D. E., van der Marel, R. P. (2005). *ApJS* 161, 304. doi:10.1086/497429 **[DOI de memoria]**. Resultado consultado en resúmenes secundarios: los modelos de Wilson, con halos más extensos, ajustan igual o mejor que King 1966 cuando el perfil llega lejos **[sin leer el original]**.
- Trager, S. C., King, I. R., Djorgovski, S. (1995). *AJ* 109, 218. doi:10.1086/117268. Tabla local `simulador_ocular/docs/validacion/trager1995.tsv`.
- Repo: ADR 0001, 0002, 0003, 0004, 0009, 0010, 0012, 0022, 0029 y 0030 en `simulador_ocular/docs/adr/`. Notas `luz-sub-mlim-tres-canales.md` §4 ter y `nucleo-quemado-globulares-rango-dinamico.md`. Commit 7a985db (origen de la gamma).
