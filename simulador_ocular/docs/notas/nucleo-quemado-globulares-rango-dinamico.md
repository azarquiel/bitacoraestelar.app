# Núcleo «quemado» de los globulares brillantes: rango dinámico del ojo y del display

Fecha: 2026-11-10. Estado: investigación y medida, sin cambios en producción.

> **CONCLUSIONES PENDIENTES DE REVISIÓN (2026-11-11).** No están validadas y el
> usuario no está convencido de la solución aplicada en el PR #533. Revisarlas
> antes de usarlas para decidir nada.
>
> Lo medido después en el canvas real de producción (406 mm, 52×, pupila
> 7,8 mm, `getImageData`, % de píxeles ≥ 250 dentro de r_c) contradice el
> diagnóstico del arnés de §0–§3:
>
> | | sin ficha de cúmulo («Cualquier objeto») | con ficha (pestaña de globulares) |
> |---|---|---|
> | M22 | 26,5 % | 1,5 % |
> | M13 | 83,9 % | 0 % |
>
> El recorte grave venía de que el objeto llegaba sin ficha de Harris. Con ficha
> el núcleo apenas satura, aunque la meseta de M13 sale plana (mediana 130,
> p90 141 DN). Los bloques y el arco alrededor de M22 eran el velo espacial
> (ADR 0029) contando dos veces la luz del cúmulo. Las dos cosas se corrigen en
> el PR #533. Queda abierto si el aspecto resultante es el correcto.

**Queja.** M22 con 406 mm (16″) a 50× pinta el núcleo quemado. En el ocular el
núcleo se ve brillante pero con textura, no como una mancha saturada. Lo mismo
pasa con M13.

Convención de la carpeta: `fichero:línea` verificado contra `main` (18ed2c5),
`resources/js/bitacora-gaia-render.js` salvo que se diga otra cosa. Lo
**MEDIDO** va separado de lo **RAZONADO**, y lo que no se ha podido comprobar en
la fuente primaria lleva **[sin verificar]**.

---

## 0. Conclusión en cinco líneas

Todas las cifras de esta sección salen de un **arnés aproximado** en node: disco plano como techo, `adaptacionLocal` imitada con una gaussiana. **La causa no queda confirmada hasta medir el canvas real** (candidata 0, §6).

1. **MEDIDO (arnés):** la capa difusa del núcleo no satura, ni sola ni con `adaptacionLocal`. La meseta de M22 queda en 103–123 DN de 255 y la de M13 en 125–158 DN.
2. **MEDIDO (arnés):** lo que se recorta son los solapes de los discos de estrella.
   - En M22 a 406/50×, un 11 % del núcleo llega a 255 antes de `adaptacionLocal`, y un 15 % después.
   - Dentro de r_c solo hay 27 estrellas (todas con G ≤ 12,45), pero cada una se pinta con 17″ de radio de cielo, unas 16 veces el radio físico de 1,06″, y tapan el 77 % del núcleo.
   - **M13, que también está en la queja, sale al 0 % sin `adaptacionLocal` y al 2,9 % con ella.** El arnés no reproduce una quemadura fuerte de M13 a 50×: o la causa es otra (origen de placa, canvas real) o el CSV local de M13 se queda corto.
3. **RAZONADO:** la escena del núcleo no es HDR. Núcleo y cielo difieren 1,6–2 dex, y la escena entera, contando la estrella más brillante por elemento de resolución del ojo, se queda en unos 4 dex. El mapeo logarítmico actual ya trabaja en contraste de Weber, así que el problema no se arregla con un operador global.
4. Hay tres etapas que empujan hacia 255:
   - la suma `lighter` en 8 bits de la capa de estrellas, con `hdrRescate: false` (`:1007`);
   - `adaptacionLocal`, con un desenfoque más ancho que r_c que trata el núcleo entero como «detalle» y le suma +0,5·(dif − 12) (`:441-449`);
   - el `clamp` final de `pintarFot` (`:698`, `:710-712`).

   **El que manda es el `clamp` final.** Con la capa de estrellas en float y nada más, el recorte sigue en el 11,1 % (§3.3).
5. **Recomendación principal:** capa de estrellas en float (que ya existe como `hdrRescate`) y un hombro compresivo tipo Naka-Rushton / Reinhard ec. 3 **en el sitio del `clamp`, después de `adaptacionLocal`**, con la rodilla en 230.
   - En el arnés deja M22 en 0 % de píxeles ≥ 250, y el contraste mediano de estrella sobre la meseta pasa de 135 a 132 DN (§3.3).
   - Precio: cambian los píxeles que hoy están entre 230 y 255, estrellas brillantes incluidas.

---

## 1. Cómo se mapea hoy el núcleo a píxeles

Cadena del Canvas-2D (`vistaGaia`, `:2902`):

1. `pintarCumulo` (`:2460`) → `capaEstrellas` (`:3001`) → `pintarFot` (`:3002`).

Capa difusa (campo no resuelto del cúmulo):

- `pintarCumulo` deposita `I = Im·sHalo + dI·sGrano` (`:2615`) en `difuso`.
- En la máscara escribe `sHalo` como t del realce (`:2628`).
- En el núcleo `sHalo = 1,00`, medido en M22 y M13 a 406 mm/50×.
- `realzarPerceptual` (`:607-619`) usa `gammaEfectiva = 1 + (GAMMA_PERCEPTUAL − 1)·(1 − t)` (`:615`). Con t = 1 la gamma es 1, así que **en el núcleo no hay realce**. Es la misma mecánica que [[halo-m13-es-la-gamma-no-el-grano]]: el realce se retira donde el velo ya se ve y entra entero en el halo.

Capa de estrellas:

- `dibujar` (`:2700`) suma sprites con `globalCompositeOperation = 'lighter'` (`:2755`) sobre un lienzo de **8 bits**.
- El alpha del disco es `rampaEstrella(mlim − g)` (`:1921`), igual a `(mlim − g)/magBlanco`, con `magBlanco = 9,5` (`:926`) y `alfaBeta = 0` (`:937`).
  - Ojo: la memoria [[alfa-estrella-anclada-a-mlim]] dice 11,5; el código dice 9,5.
- El radio del disco es `radioEstrella` (`:1871`): físico (Airy ⊕ seeing) en cuadratura con el suelo de visibilidad `radioSuelo · escalaEstrellas` (`:858`, `:1763`). Es una convención de atlas, no física (CONTEXT.md, «Escala aparente del dibujo»).
- `capaEstrellas` (`:2844`) tiene un rescate HDR de dos pasadas, `TONO` (`:2828`), apagado por coste: `CFG.hdrRescate: false` (`:1007`). **El recorte de la suma `lighter` a 255 ocurre aquí**, antes de cualquier tono.

Píxel final (`pintarFot`, `:628`):

- La estrella se relee como flujo contra el cielo de referencia: `F += flujoDeValor(v, Fref, rango)` (`:689`).
- Nivel: `salida = nivelFondo + valorDeFlujo(F, FcieloPintado, rango)` (`:691`), con `valorDeFlujo = 255·2,5·log10(1 + F/Fcielo)/rango` (`:539`). El rango es `SB_NEGRO − SB_BLANCO = 25,5 − 14,0 = 11,5 mag` (`:118`, `:379`).
  - **Es una curva logarítmica (Fechner) sobre el cielo: 22,2 DN por magnitud de contraste.**
- `adaptacionLocal` (`:441-449`): desenfoque de radio `SIZE/60` (`:442`), realce `0,5·(|dif| − 12)` con rodilla suave (`:433-438`), simétrico (`REALCE_OSCURO = 1`, `:228`).
- **Recorte duro** a [0, 255]: `:698` (gris) y `:710-712` (RGB).

Cielo y pupila:

- `ctxFotometrico` (`:333`) recorta la pupila de salida a la del ojo: `pEf = min(pupilaSalida, pupilaOjo)` (`:334`). Con 406/50× (8,1 mm) entran 7 mm, así que `dim = 1` (`:339`).
- El fondo sale de `nivelCielo` (`:298`), luminancia codificada en sRGB anclada en `SB_CIELO_BLANCO = 16,5` (`:209`, ADR 0009).
- Ojo: el objeto **no** pasa por `codigoSRGB`. Su incremento en DN se suma como código, no como luminancia (`:691`).

Placas (otro camino, origen DSS/HiPS): `flujoDePlaca` (`:517`) lee la luma como brillo superficial entre `SB_OBJ_MIN = 24` y `SB_OBJ_MAX = 14` (`:118`). Una placa con el núcleo saturado fotográficamente da una meseta plana a μ = 14, más brillante que cualquier núcleo real (M13 = 16,59). **Si la queja se observó con origen DSS o HiPS, la causa es la placa y nada de lo de abajo aplica.**

---

## 2. Luminancias reales en el ocular (406 mm, 50×, SQM 21,5)

Punto cero del repo: 10⁻⁵ cd/m² ↔ 25,08 mag/arcsec² (`:219-225`, ADR 0030). Equivale a L = 1,08·10⁵·10^(−0,4·μ) cd/m².

- Bará et al. (2020) dan 1,11–1,43·10⁵ según el espectro, así que la conversión vale a ±0,1 dex.
- Las magnitudes en V de Harris y Trager no son fotometría escotópica: según la misma fuente, el cociente S/P va de 0,8 a 2,5.

Brillos centrales:

- Harris (1996, rev. 2010, `mapa/datos/harris_mwgc.dat` parte III, col. 10): μ_V(0) = 16,59 (M13) y 17,42 (M22).
- Trager, King & Djorgovski (1995): M13 de 16,45 a 16,79 en log r < 1 (`simulador_ocular/docs/validacion/trager1995.tsv`). El fichero local no trae M22 (`grep -c ngc6656` = 0).
- El catálogo de Harris no dice si μ_V está corregido de extinción. Con E(B−V) = 0,34 la diferencia en M22 sería de ~1 mag **[sin verificar]**. El render usa 17,42 tal cual, y el perfil medido en la tabla (`I0 mu 17,46`) lo confirma.

Con T = 0,9 y `dim = 1` (pupila recortada a 7 mm), el brillo superficial en el ocular es el intrínseco + 0,11:

| | μ en el ocular | L (cd/m²) | régimen CIE 191:2010 |
|---|---|---|---|
| cielo, SQM 21,5 | 21,61 | 2,5·10⁻⁴ | escotópico (< 0,005) |
| núcleo de M22 | 17,53 | 1,0·10⁻² | mesópico bajo (0,005–5) |
| núcleo de M13 | 16,70 | 2,2·10⁻² | mesópico bajo |

Cocientes (**RAZONADO**):

- Núcleo/cielo: **43×** en M22 (1,63 dex) y **92×** en M13 (1,96 dex).
- Estrella frente a núcleo en un elemento de resolución del ojo:
  - A 50×, ~1′ aparente son 1,2″ de cielo **[sin verificar: la agudeza mesópica es peor que 1′]**.
  - La luz de núcleo por elemento equivale a m ≈ 17,0. Una gigante de G = 11 está unas 6 mag por encima, ~250×.
- Escena total: cielo → estrella más brillante por elemento ≈ 43 × 250 ≈ **10⁴ (4 dex)**.

Kunkel & Reinhard (2010) midieron el rango simultáneo del sistema visual con adaptación fija. El valor que se cita es ~3,7 log, pero no he podido leerlo en la fuente: el abstract está cerrado, y las citas secundarias dan entre «más de 4 órdenes» y «~14 stops» **[sin verificar]**. Lo que importa de verdad:

- **La capa difusa (1,6–2 dex) cabe de sobra en una sola fijación.** El ojo no necesita adaptación local para ver el núcleo sin quemar.
- Solo las estrellas puntuales sobre el núcleo empujan hacia el borde del rango simultáneo.

El display reparte 11,5 mag (4,6 dex) en 255 códigos. El núcleo de M22, a 4,1 mag sobre el cielo, cae en ~92 DN sobre el fondo. Sobra sitio: **el problema no es de compresión global del difuso.**

---

## 3. Medidas

### 3.1 Método (MEDIDO, node, sin canvas)

- Se llama a `pintarCumulo` con producción tal cual, `perceptual: true`, AFOV 82°, SQM 21,5, T 0,9, pupila del ojo 7 mm.
- `mlim` sale de `R.magLimite`. Las estrellas son las de Gaia DR3 reales:
  - M22: archivo de la ESA, `gaiadr3.gaia_source`, r < 0,35°, G < 15,5, 5820 filas.
  - M13: `simulador_ocular/docs/validacion/m13_gaia_dr3.csv`.
- Filtro de estrellas: el de producción, `estrellasCumulo` (`:2659`, `m ≤ m_res(r)` + sorteo de crowding).
- La capa de estrellas se aproxima con un disco PLANO de radio `radioEstrella` y alpha `alfaEstrella`, sumado sin tope. Recortado a 255 reproduce `lighter`. Es un **techo**: el sprite real tiene perfil radial y reparte menos.
- El píxel se forma como en `pintarFot:651-691`.
- `adaptacionLocal` se imita en node:
  - recorte a 0–255 como `desenfocar` (`:408`);
  - gaussiana separable de σ = `round(SIZE/60)` px, porque `blur(Npx)` del canvas es una gaussiana de desviación N;
  - redondeo a 8 bits;
  - `realceDetalle` copiado (`:433-438`).

  σ = SIZE/60 son 98″ de cielo a 50×, más que r_c en M22 (80″) y en M13 (37″).
- Zona medida: r < r_c (Harris: 1,33′ en M22, 0,62′ en M13).

### 3.2 Resultados

| caso | lienzo | estrellas en r_c | meseta difusa (media) | final (media / máx) | píxeles con estrella | ΔDN estrella sobre meseta | alpha ≥ 1 en `lighter` | final ≥ 255 |
|---|---|---|---|---|---|---|---|---|
| M22, 406 mm, 50× | 720 | — | 103 | 154 / 290 | 77 % | 65 | 8 % | 11,3 % |
| M22, 406 mm, 50× | 1440 | 27 (G ≤ 12,45) | 103 | 155 / 290 | 77 % | 68 | 7 % | 11,1 % |
| M22, 406 mm, 100× | 1440 | | 83 | 131 / 276 | 69 % | 70 | 7 % | 8,1 % |
| M22, 406 mm, 150× | 1440 | | 73 | 107 / 271 | 61 % | 56 | 3 % | 3,5 % |
| M22, 200 mm, 50× | 1440 | | 90 | 118 / 276 | 60 % | 47 | 3 % | 3,5 % |
| M13, 406 mm, 50× | 1440 | | 125 | 131 / 211 | 23 % | 25 | 0 % | 0,0 % |

Notas a la tabla:

- Solo la capa difusa (sin estrellas): M22 en 103 de media y 114 de máximo, M13 en 125 y 135. **0 píxeles ≥ 255** en todos los casos.
- M22 a 406/50×:
  - `m_res` en el núcleo vale 12,08 → 12,26 → 12,66 (r = 0 → r_c). Solo se dibujan 27 estrellas dentro de r_c.
  - Su radio dibujado es 17,1″ de cielo con G = 11 y 15,2″ con G = 13, es decir 4,2 y 3,7 px a 1440. El radio de imagen física (`radioImagenEstelar`) es 1,06″.
  - **Los discos pesan 16 veces su radio físico y 260 veces su área, y es el suelo de atlas el que los fija** (`radioEstrella` ≈ `sueloEstrella` a 50×).
- M13 sale casi limpio porque a 50× `m_res` en el núcleo es 11,32 y casi no quedan estrellas dibujadas dentro de r_c: una sola con el CSV local. No sé explicar por qué el usuario lo ve quemado: el arnés no lo reproduce (§0).

### 3.3 `adaptacionLocal` y el hombro (MEDIDO, arnés)

Primero, una medida aislada: con la suma de la capa de estrellas en float y sin hombro (lo que haría `hdrRescate`), M22 a 406/50×/1440 sigue con un **11,1 %** de píxeles a 255 y el máximo sube de 290 a **573**. El solape no se queda a 255: se va muy arriba y lo corta el `clamp` de `:698`/`:710`. **Quitar solo el recorte de 8 bits no basta; hace falta también el hombro del final.**

Definiciones para la tabla:

- Hombro: `h(v) = v` si v ≤ k; si no, `k + (255 − k)·x/(1 + x)`, con `x = (v − k)/(255 − k)`. Es la ec. 3 de Reinhard et al. 2002 aplicada al exceso sobre la rodilla.
- «float»: la capa de estrellas sumada sin tope.
- «→ hombro»: `h` en el sitio del `clamp` final, después de `adaptacionLocal`.
- ΔDN de estrella: nivel en el píxel central de cada estrella de r_c, después del `clamp`, menos el nivel de la capa difusa sola en ese píxel. Mediana sobre las n estrellas.

M22, 406 mm, 50×, r < r_c:

| variante | lienzo 720: ≥ 255 / ≥ 250 / máx / ΔDN mediano | lienzo 1440: ≥ 255 / ≥ 250 / máx / ΔDN mediano |
|---|---|---|
| hoy, sin `adaptacionLocal` | 11,3 % / 12,3 % / 290 / 69 | 11,1 % / 11,9 % / 290 / 100 |
| **hoy, con `adaptacionLocal`** | **14,7 % / 14,7 % / 371 / 89** | **15,2 % / 15,8 % / 371 / 135** |
| solo difuso + `adaptacionLocal` | 0 / 0 / 123 / — | 0 / 0 / 123 / — |
| float + hombro k = 135, sin `adaptacionLocal` | 0 / 0 / 229 / 58 | 0 / 0 / 229 / 74 |
| float + `adaptacionLocal` → hombro k = 135 | 0 / 0 / 201 / 61 | 0 / 0 / 201 / 74 |
| float + `adaptacionLocal` → hombro k = 200 | 0 / 0 / 236 / 90 | 0 / 0 / 236 / 118 |
| float + hombro k = 230, sin `adaptacionLocal` | 0 / 4,4 % / 253 / 69 | 0 / 4,7 % / 253 / 100 |
| **float + `adaptacionLocal` → hombro k = 230** | **0 / 0 / 249 / 89** | **0 / 0 / 249 / 132** |

M13, 406 mm, 50×, lienzo 720 (una sola estrella dentro de r_c):

- hoy sin `adaptacionLocal`: 0 %; con ella, **2,9 %** a 255 y máximo 266;
- solo difuso + `adaptacionLocal`: media 144, frente a 130 sin ella. El núcleo entero sube +14 DN porque es más pequeño que el desenfoque;
- float + `adaptacionLocal` → hombro k = 230: 0 % y máximo 245.

Qué se lee:

- **`adaptacionLocal` empeora la quemadura.** Suma +4 puntos de recorte en M22 y es la única causa del 2,9 % de M13. Pero no la crea: sin estrellas no recorta nada.
- **Con la rodilla en 230, el hombro en el sitio del `clamp` cumple C1 sin perder contraste de estrella** (132 frente a 135 DN a 1440).
- **Con la rodilla en 135** desaparece el recorte, pero el contraste de estrella cae a 74 DN: comprime estrellas que hoy no están saturadas.

### 3.4 Lo que no se ha medido

- **El canvas real.** `getImageData` sobre r < r_c en el navegador, con el sprite radial, el blur, la aureola ×(D/200)² (`:2801-2805`) y el filtro `blur` de verdad. El arnés es un techo con disco plano y una gaussiana que imita el filtro, así que el canvas real puede quedarse por debajo o por encima.
- **No se intentó** medir en el navegador: no encontré una URL local servida del simulador (`ocular-wordpress.html` necesita WordPress y los proxies).
- **El origen** que usaba el usuario (Canvas-2D frente a DSS/HiPS).
- El A/B de consola de la memoria: `BitacoraGaiaRender.fot.GAMMA_PERCEPTUAL = 1`, `fot.REALCE_OSCURO = 0`.

---

## 4. Qué dice la literatura, operador por operador

Para cada fuente interesa:

1. en qué régimen de luminancia está medida;
2. si es global o local;
3. qué predice para una fuente compacta brillante sobre fondo oscuro.

### 4.1 Respuesta del fotorreceptor y ley de brillo

- **Naka & Rushton (1966)**, «S-potentials from luminosity units in the retina of fish (Cyprinidae)», *J. Physiol.* 185, 587-599, doi:10.1113/jphysiol.1966.sp008003.
  - Origen de la forma V/Vmax = Iⁿ/(Iⁿ + σⁿ).
  - Es registro de células horizontales de pez, no psicofísica humana. No he leído el texto primario **[sin verificar el detalle]**.
  - Hay dos artículos de 1966 en el mismo volumen. Este, el de las «luminosity units», es el que citan Reinhard & Devlin 2005 (ref. [25]) para la función hiperbólica. `simulador_ocular/README.md:1211` cita el otro, el de las «colour units» (pp. 536-555). Los dos DOI existen; no he comprobado cuál de los dos trae la forma original.
- **Valeton & van Norren (1983)**, «Light adaptation of primate cones: an analysis based on extracellular data», *Vision Res.* 23(12), 1539-1547, doi:10.1016/0042-6989(83)90167-0.
  - Según el abstract (PubMed 6666056): todas las respuestas se describen con V/Vm = Iⁿ/(Iⁿ + σⁿ), **n = 0,74**. Al subir el fondo, la función se desplaza en intensidad (adaptación de σ).
  - **Régimen: conos de macaco, fondos de hasta 10⁶ td. Es fotópico, no la luminancia del ocular (10⁻²–10⁻⁴ cd/m²).** Sirve para la forma, no para los números.
- **Stevens & Stevens (1963)**, «Brightness function: effects of adaptation», *JOSA* 53(3), 375-385, doi:10.1364/JOSA.53.000375.
  - El brillo sigue una potencia de la luminancia, con exponente y umbral que dependen de la adaptación.
  - Los valores (≈ 0,33 para campo extenso en oscuridad) no los he leído en la fuente **[sin verificar]**. El repo ya cita a Stevens en ADR 0019 para la rampa de estrella.
- **Hood, Finkelstein & Buckingham (1979)**, *Vision Res.* 19, 401-406.
  - Es la forma que usan Reinhard & Devlin: V = I/(I + σ(Ia)), con σ = (f·Ia)^m y m entre 0,2 y 0,9.
  - Cita tomada de Reinhard & Devlin 2005, ref. [30]; no he leído el original **[sin verificar el original]**.

**Consecuencia (RAZONADO).** En log I, la función de Naka-Rushton es una sigmoide:

- es casi lineal en log I alrededor de σ, que es lo que ya hace `valorDeFlujo` (Weber/Fechner);
- satura de forma suave por arriba, que es lo que el código no hace: tiene un `clamp`.

La pieza que falta es el hombro, no una curva nueva.

### 4.2 Operadores de tono

| operador | global/local | qué predice para un núcleo compacto brillante sobre negro |
|---|---|---|
| Ferwerda et al. 1996 | **global**, escala lineal `Ld = m·Lw` | Satura el núcleo: es un factor de escala que iguala umbrales y no comprime. |
| Ward Larson et al. 1997 | **global**, sobre la población de adaptaciones locales de ~1° | Comprime los huecos del histograma sin invertir el orden. Con velo, el núcleo baja el contraste alrededor si se mira fuera. |
| Pattanaik et al. 1998 | **local** multiescala | Conserva detalle en el núcleo. Caro, y con halos si las escalas no se controlan. |
| Reinhard et al. 2002 | global (ec. 3-4) + local (dodging-and-burning) | La ec. 4 deja quemar por encima de `Lwhite`. Con `Lwhite = Lmax` no se quema nada. |
| Durand & Dorsey 2002 | **local**, base/detalle | Comprime solo la base. Las estrellas del núcleo conservan su contraste local. |
| Reinhard & Devlin 2005 | global por defecto, ampliable a local | Hombro de Naka-Rushton sin recorte. Con `a = 1` se adapta al propio píxel. |
| Mantiuk, Daly & Kerofsky 2008 | global, adaptado al display | Curva óptima para un display y unas condiciones dados. |

Detalle por fuente:

- **Ferwerda, Pattanaik, Shirley & Greenberg (1996)**, «A model of visual adaptation for realistic image synthesis», SIGGRAPH 96, 249-258, doi:10.1145/237170.237262. PDF leído (copia del autor en UCF).
  - Los bastones trabajan de 10⁻⁶ a 10 cd/m² y los conos de 0,01 a 10⁸. El mesópico, con los dos sistemas activos, va de 0,01 a 10 cd/m². La mezcla mesópica es `Ld = Ldp + k(La)·Lds`.
  - La adaptación del mundo es **«half the highest visible luminance»**.
  - Es global y lineal. En este caso, adaptarse al núcleo apagaría el halo, y adaptarse al cielo quemaría el núcleo.
  - **Descartado como solución.** Lo útil es la tabla de regímenes: el cielo es escotópico y el núcleo, mesópico bajo.
- **Ward Larson, Rushmeier & Piatko (1997)**, «A visibility matching tone reproduction operator for high dynamic range scenes», *IEEE TVCG* 3(4), 291-306, doi:10.1109/2945.646233. PDF leído (LBNL-39882).
  - «the eye rapidly adapts to the level of a relatively small angle in the visual field (i.e., about 1°) around the current fixation point» [Moon & Spencer 1945].
  - Velo: `La = 0,913·Lf + K∫…`, con K = 0,0096 (Holladay).
  - **Dato aprovechable:** la escala de adaptación local es un campo de ~1° aparente, con semiángulo foveal de 0,5° en su ec. 8. Con AFOV 82°, 1° son unos `SIZE/82` px.
  - `adaptacionLocal` desenfoca con σ = `SIZE/60` (`:442`), es decir σ ≈ 1,4° aparentes, una FWHM de ≈ 3,2°. **Es unas tres veces más ancho que el campo de Ward Larson et al.**
  - Por eso el núcleo entero de un globular cabe dentro del desenfoque y se realza como si fuera un detalle (§3.3).
- **Pattanaik, Ferwerda, Fairchild & Greenberg (1998)**, «A multiscale model of adaptation and spatial vision for realistic image display», SIGGRAPH 98, 287-298, doi:10.1145/280814.280922. PDF leído (§2.4, adaptación local por bandas). Demasiado para este problema: el difuso no es HDR (§2).
- **Reinhard, Stark, Shirley & Ferwerda (2002)**, «Photographic tone reproduction for digital images», *ACM TOG* 21(3), 267-276, doi:10.1145/566654.566575. PDF leído (UUCS-02-001).
  - Ec. 3: `Ld = L/(1 + L)`.
  - Ec. 4: `Ld = L(1 + L/L²white)/(1 + L)`. Con `Lwhite ≥ Lmax`, «no burn-out will occur».
- **Durand & Dorsey (2002)**, «Fast bilateral filtering for the display of high-dynamic-range images», *ACM TOG* 21(3), 257-266, doi:10.1145/566654.566574. PDF leído, §6.
  - Base con filtro bilateral en log, comprimida con un factor de escala; la capa de detalle no se toca.
  - «a base contrast of 5 worked well». Los autores advierten que «does not attempt to imitate human vision».
- **Reinhard & Devlin (2005)**, «Dynamic range reduction inspired by photoreceptor physiology», *IEEE TVCG* 11(1), 13-24, doi:10.1109/TVCG.2005.9. PDF leído.
  - Ec. 1 con σ(Ia); `Ia = a·I + (1 − a)·I_av` (ec. 7).
  - «the operator is global because m is computed from globally derived quantities».
  - Sobre el promedio local advierten que, «if σ is based on a local average, … ringing artifacts may occur» [Chiu et al. 1993].
  - Su versión local con bilateral mejora poco sobre la global («relatively modest»).
- **Mantiuk, Daly & Kerofsky (2008)**, «Display adaptive tone mapping», *ACM TOG* 27(3), art. 68, doi:10.1145/1360612.1360667. Solo metadatos; no he leído el texto **[sin verificar el contenido]**. Útil si algún día el anclaje `SB_CIELO_BLANCO` se hace por display (ADR 0009 lo deja como perilla de luz ambiente).

### 4.3 Glare, bloom e irradiación

- **Spencer, Shirley, Zimmerman & Greenberg (1995)**, «Physically-based glare effects for digital images», SIGGRAPH 95, 325-334, doi:10.1145/218380.218466.
  - Abstract: la dispersión y la difracción en el ojo producen el *bloom* y las líneas de *flare* alrededor de objetos muy brillantes. Añadirlos sube el brillo aparente de las fuentes.
  - Régimen: fuentes de luz en escenas fotópicas.
- Ward Larson et al. (1997, §5.1): el velo de una fuente brillante en la periferia baja el contraste, y el efecto «is less noticeable when looking directly at a source, since the eye adapts to the high light level».

**RAZONADO:**

- La irradiación existe, pero **va en contra de la queja**: un bloom del ojo haría el núcleo más grande y más lavado, no más texturado.
- Con el núcleo a 10⁻² cd/m², lejos de las fuentes deslumbrantes de Spencer, el bloom físico debe ser pequeño **[sin verificar cuantitativamente a esta luminancia]**.
- **No añadir bloom al núcleo.** La aureola por estrella (`dibujarAureola`, `:2682`; `alfaAureola`, techo 0,35) se mantiene: es de estrellas brillantes, no del núcleo. Comprobar con el arnés que no suma en el solape.

---

## 5. Encaje con lo que ya está decidido

- **[[halo-m13-es-la-gamma-no-el-grano]].** El realce perceptual se retira en el núcleo (t = sHalo = 1) y es el culpable del halo de M13 a 514×. **Medido aquí: en el núcleo la gamma no hace nada**, así que tampoco es la causa de la quemadura. No tocar `GAMMA_PERCEPTUAL` por esto: arreglaría el núcleo moviendo el halo.
- **[[alfa-estrella-anclada-a-mlim]] / ADR 0018-0019.**
  - El alpha de estrella es umbral, no contraste, y está anclado a `mlim` a propósito. Un remedio de tono no debe reanclar el alpha a flujo (rama B falsada).
  - El hombro va **después** de la relectura a flujo (`:689`) y afecta igual a estrella y a difuso, así que no cambia qué estrella se ve: solo cuánto se aplana el solape.
  - `test_alfa_apertura.js` (I1) debe seguir verde.
- **[[apertura-fuente-extensa-ley]].** El contraste núcleo/cielo no depende de D a igual aumento. El tono no puede meter D.
- **[[deteccion-vs-estructura-no-mezclar]].** La «textura» que ve el observador en el núcleo es estructura (resolución, crowding), no detección. Lo que la decide es `m_res(r)` (ADR 0012) y el veredicto Φ (ADR 0016), no el tono. El tono solo puede **no destruir** la estructura que la cadena ya dibuja.
- **[[adr-0015-ley-textura-grano]].** El grano SBF está falsado como canal visible (ADR 0016). Ninguna recomendación de aquí lo resucita.
- **ADR 0004.** Un factor de compresión ajustado «hasta que se vea bien» está prohibido. Cada constante de abajo lleva su anclaje.
- **ADR 0003 / 0006.** El tono es la capa de display: no toca flujo, así que no puede romper la conservación. Las métricas de aceptación de abajo son perceptuales/de display y se declaran así.

---

## 6. Soluciones candidatas, ordenadas

### 0. Medir en el navegador antes de tocar nada (bloqueante)

Simulador, M22, 406 mm, 50×, origen Canvas-2D, lienzo real (dpr). Con `getImageData` sobre r < r_c:

- fracción de píxeles ≥ 250;
- media;
- ΔDN de las 27 estrellas frente a la meseta local;
- lo mismo con origen DSS y HiPS;
- y el A/B de consola `fot.GAMMA_PERCEPTUAL = 1`, `fot.REALCE_OSCURO = 0`.

Si el recorte real del Canvas-2D sale ≈ 0 y la queja venía de la placa, la vía es `flujoDePlaca` (`SB_OBJ_MAX = 14`), no esta nota.

### 1. Acumular la capa de estrellas sin el tope de 8 bits + hombro compresivo final (recomendada)

Las dos piezas juntas (§3.3).

**(a) Suma en float de la capa de estrellas.** Hoy existe `CFG.hdrRescate` (`:1007`, `:2855-2867`): una segunda pasada con ganancia 1/16 empalmada entre 230 y 252. Activarla es la vía sin código nuevo. Su coste es un render de estrellas más. La alternativa con más rango es acumular el alpha en un `Float32Array` en vez de en el canvas.

**(b) Hombro de Reinhard / Naka-Rushton en el sitio del `clamp`** de `:698`/`:710-712`, **después de `adaptacionLocal`**:

- Es `h(v)` de §3.3: identidad hasta la rodilla k y, por encima, la ec. 3 de Reinhard et al. 2002 sobre el exceso (Naka-Rushton con n = 1). Es monótona y nunca llega a 255.
- Por debajo de k nada cambia. **Por encima sí cambia todo.** Eso incluye las estrellas brillantes que hoy caen entre k y 255 o recortadas a 255, y por esa vía la lectura de la rampa de `magBlanco` (ADR 0019). No es «bit a bit salvo lo saturado».

**La rodilla, con medida (§3.3):**

- **k = 135** (el difuso más brillante del arnés): quita el recorte, pero el contraste mediano de estrella cae de 100–135 a 74 DN. Una sola estrella de G = 11 sobre la meseta de M22 ya da ~171, así que esta rodilla comprime estrellas que hoy no saturan. **Descartada.**
- **k = 230**: 0 % ≥ 250 con `adaptacionLocal` delante, y el contraste se queda en 132 de 135. Solo comprime la franja 230–255 y lo que hoy se recorta. **Candidata.**
- Sin `adaptacionLocal` delante, k = 230 deja un 4,4–4,7 % ≥ 250, porque x/(1 + x) solo llega a 250 cuando la entrada pasa de ~330. Que el hombro vaya en el sitio del `clamp`, después de `adaptacionLocal`, es parte de la propuesta.
- Antes de fijar k (ADR 0004), medir sobre el catálogo y el golden qué fracción de píxeles cae hoy en 230–255. Si es despreciable, k = 230 tiene su anclaje en «tocar solo lo que hoy se recorta».

Elegir el exponente n entre 0,74 (Valeton & van Norren) y 1 (Reinhard): n < 1 comprime más despacio. Valeton & van Norren es de conos fotópicos, así que su n es forma, no calibración. Si se adopta n ≠ 1, que sea con prerregistro.

Por qué esta primero:

- es la única medida en el arnés que deja C1 en 0 % sin perder contraste de estrella;
- no cambia la ley de detección ni la de estructura;
- se puede escribir en ~10 líneas;
- se puede probar sin canvas (la parte b, en node).

**Criterios de aceptación (display):**

- C1. M22, 406/50×, r < r_c: píxeles ≥ 255 = 0 % y ≥ 250 por debajo del 1 %, medidos en el canvas real. Hoy es un 11 % con techo de disco plano.
- C2. ΔDN de cada estrella dibujada en r_c sobre su meseta local ≥ 0,8 × el ΔDN sin recorte del arnés, o sea que la estrella no se funde con su vecina. Medir el par más apretado.
- C3. Orden conservado: si F₁ > F₂ entonces v₁ > v₂ en todo el núcleo. Cumplir el hombro estricto lo garantiza; el test lo comprueba.
- C4. Bit a bit en los píxeles que hoy quedan por debajo de k, en el golden DSO y en `test_cumulo_render.js`. Fracción de píxeles movidos registrada. Guardianes verdes: `test_alfa_apertura.js`, `test_alfa_estrella.js`, conservación ADR 0003.
- C5. M13 a 514× (caso #329): el halo no cambia, porque la rodilla está por encima de él.

### 2. Base/detalle en log en lugar del unsharp aditivo de `adaptacionLocal`

Sustituir `out = v + 0,5·(v − blur − 12)` (`:441-449`) por el esquema de Durand & Dorsey (2002):

- base = desenfoque en log (bilateral, o el gaussiano de `SIZE/60` que ya existe, que equivale a ~1,4° aparentes y es coherente con el ~1° de Ward Larson et al. 1997);
- comprimir solo la base cuando su rango supere el disponible;
- sumar el detalle intacto.

Ventaja: el contraste local de la estrella sobre el núcleo se conserva por construcción.

Riesgos:

- Reinhard & Devlin (2005) advierten de anillos con el promedio local [Chiu 1993].
- La memoria del halo de M13 ya sospecha de `adaptacionLocal` por el grumo, y `REALCE_OSCURO = 1` oscurece las calles.

Además, por §2 la base del núcleo **no necesita compresión** (1,6–2 dex en 4,6 dex disponibles). Sin escena HDR, el factor de base sería 1 y el operador se reduce a «no amplificar».

Lo que sí sale medido (§3.3):

- `adaptacionLocal` suma +4 puntos de recorte en M22 y es la única causa del 2,9 % de M13.
- Su σ (≈ 1,4° aparentes) es unas tres veces el campo de ~1° de Ward Larson et al., y eso hace que el núcleo entero cuente como detalle.

Una variante pequeña dentro de esta línea es bajar σ hacia `SIZE/82` (~1°). Habría que medirla con el arnés, y cuidado con el grumo de la memoria del halo, que apunta a `adaptacionLocal`. **Si la medida 0 confirma que el recorte de M13 viene de aquí, esta candidata sube junto a la 1.** Con lo que hay, el orden entre la 1 y la 2 no está decidido para M13.

Criterio: C1–C5, más la amplitud de anillo alrededor de una estrella de G = 10 en el núcleo por debajo de 3 DN.

### 3. Adaptación global por fotorreceptor (Reinhard & Devlin 2005) o por TVI (Ferwerda 1996)

No recomendada:

- Es un operador global que sustituye la curva logarítmica entera, así que mueve el cielo, el halo y todos los golden.
- §2 dice que el problema no es de rango global.
- Ferwerda, con la adaptación a «half the highest visible luminance», quemaría o apagaría por construcción.

### 4. Reducir el suelo de atlas de los discos en campo aglomerado

Es la causa de fondo de que el núcleo salga como manchas solapadas: discos de 17″ frente a 1,06″ físicos (§3.2). Pero **no es tono**: es la convención de CONTEXT.md, «Escala aparente del dibujo» (un píxel ≈ 7–10′ aparentes, por debajo de lo que resuelve el ojo), y toca la resolución de dobles (#134, `test_estrella_fisica.js` §11). Fuera de esta nota; anotarlo como dato para quien revise el suelo.

### Descartado

- **Bloom/glare en el núcleo** (§4.3): empeora la queja.
- **Bajar `GAMMA_PERCEPTUAL`** o tocar el alpha de estrella: no actúan en el núcleo, o están cerrados por ADR 0018/0019 y por la memoria del halo.

---

## 7. Reproducir las cifras de §3

Gaia de M22 (archivo de la ESA, TAP síncrono):

```
SELECT ra,dec,phot_g_mean_mag,bp_rp FROM gaiadr3.gaia_source
WHERE phot_g_mean_mag<15.5
  AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',279.09975,-23.90475,0.35))
```

En GAVO, `gaia.dr3lite` no tiene `bp_rp` y la consulta agotó el tiempo síncrono.

Arnés (node, efímero; no está en `scripts/`): los mismos `require` que `scripts/matriz_m13.js`. Luego:

- `R.pintarCumulo(difuso, K, {…, estrellas: gaia})`;
- sobre `res.estrellas` con `g ≤ mlim`, acumular en un `Float64Array` `alfaEstrella(g, mlim, Rt·arcmin·60/SIZE, factorDilucion(sueloEstrella, Rt))` en un disco de radio `Rt = radioEstrella(...)`;
- por píxel, `v = nivelFondo + valorDeFlujo(realzarPerceptual(dif, Fcielo, rango, mask) + flujoDeValor(min(255, 255·Σα), Fref, rango), FcieloPintado, rango)`. En la variante float se quita el `min`;
- `adaptacionLocal`: gaussiana separable de σ = `round(SIZE/60)` sobre v recortado a 0–255 y redondeado, y luego `realceDetalle` con ganancia 0,5;
- hombro `h(v)` de §3.3 en lugar del `clamp`;
- contar dentro de r < r_c.

Coste: 14 s a 1440 px con las nueve variantes.

Si se adopta la solución 1, este arnés debería pasar a `scripts/` como guardián de C1–C3.

---

## Fuentes

- Bará, S., Aubé, M., Barentine, J., Zamorano, J. (2020). «Magnitude to luminance conversions and visual brightness of the night sky». *MNRAS* 493, 2429 **[revista sin verificar; leído el abstract de arXiv]**. arXiv:2002.01494.
- CIE 191:2010. *Recommended system for mesopic photometry based on visual performance*. Rangos de la entrada 17-21-035 del e-ILV: https://cie.co.at/eilvterm/17-21-035
- Durand, F., Dorsey, J. (2002). *ACM TOG* 21(3), 257-266. doi:10.1145/566654.566574
- Ferwerda, J. A., Pattanaik, S. N., Shirley, P., Greenberg, D. P. (1996). SIGGRAPH 96, 249-258. doi:10.1145/237170.237262
- Harris, W. E. (1996). *AJ* 112, 1487. doi:10.1086/118116. Edición 2010: arXiv:1012.3224 y `mapa/datos/harris_mwgc.dat`.
- Hood, D. C., Finkelstein, M. A., Buckingham, E. (1979). *Vision Res.* 19, 401-406 **[sin verificar el original]**.
- Kunkel, T., Reinhard, E. (2010). APGV '10, 17-24. doi:10.1145/1836248.1836251 **[cifra sin verificar]**.
- Mantiuk, R., Daly, S., Kerofsky, L. (2008). *ACM TOG* 27(3), 68. doi:10.1145/1360612.1360667 **[contenido sin verificar]**.
- Naka, K. I., Rushton, W. A. H. (1966). *J. Physiol.* 185, 587-599. doi:10.1113/jphysiol.1966.sp008003
- Pattanaik, S. N., Ferwerda, J. A., Fairchild, M. D., Greenberg, D. P. (1998). SIGGRAPH 98, 287-298. doi:10.1145/280814.280922
- Reinhard, E., Stark, M., Shirley, P., Ferwerda, J. (2002). *ACM TOG* 21(3), 267-276. doi:10.1145/566654.566575
- Reinhard, E., Devlin, K. (2005). *IEEE TVCG* 11(1), 13-24. doi:10.1109/TVCG.2005.9
- Spencer, G., Shirley, P., Zimmerman, K., Greenberg, D. P. (1995). SIGGRAPH 95, 325-334. doi:10.1145/218380.218466 (solo el abstract).
- Stevens, J. C., Stevens, S. S. (1963). *JOSA* 53(3), 375-385. doi:10.1364/JOSA.53.000375 **[exponentes sin verificar]**.
- Trager, S. C., King, I. R., Djorgovski, S. (1995). *AJ* 109, 218. doi:10.1086/117268. Tabla local `simulador_ocular/docs/validacion/trager1995.tsv`.
- Valeton, J. M., van Norren, D. (1983). *Vision Res.* 23(12), 1539-1547. doi:10.1016/0042-6989(83)90167-0 (abstract, PubMed 6666056).
- Ward Larson, G., Rushmeier, H., Piatko, C. (1997). *IEEE TVCG* 3(4), 291-306. doi:10.1109/2945.646233
- Barlow: no consultado.
