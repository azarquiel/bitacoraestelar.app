# La niebla de campo, la pupila de salida y los aumentos

Fecha: 2026-09-02. Estado: investigación con medida, sin cambios en producción.

Nota técnica del repo. Responde a una pregunta concreta sobre la capa de niebla
sub-`mlim` de los cúmulos abiertos (`nieblaCampo()`, ADR 0022, commit `35e607c`):

> ¿Debe la niebla de campo verse influida por la **pupila de salida** y por los
> **aumentos**? Y si es que sí, ¿lo está hoy correctamente, o falta o sobra
> alguna dependencia?

Convención de las notas de esta carpeta (ver
[`pupila-salida-fondo-cielo.md`](pupila-salida-fondo-cielo.md) y
[`nubosidad-cumulos-abiertos-gaia.md`](nubosidad-cumulos-abiertos-gaia.md)):
cada afirmación va citada — `fichero:línea` para el código, obra/DOI/arXiv para
la física — y lo **MEDIDO** (números de arnés) se separa de lo **RAZONADO**.

Las medidas se hicieron con scripts temporales fuera del repo, importando el
módulo de producción sin copiarlo (ADR 0008), y con las fixtures de Gaia del
arnés del ADR 0022 (`scripts/fixtures/gaia/niebla_*.csv`). El arnés
prerregistrado (`scripts/harness_niebla_abiertos.js`) sigue dando **PASA (4/4)**
sobre `89ceecc`.

---

## Resumen ejecutivo

1. **Sí: la niebla debe depender de las dos cosas, y hoy depende.** Entra por
   tres vías, y las tres son legítimas y distintas: `mlim` decide **qué**
   estrellas caen en la niebla; θ_R(SBe)/M decide **sobre qué área** se integra;
   y `Cmin` decide **contra qué umbral** se juzga.
2. **No hay doble contabilidad de la pupila de salida.** MEDIDO: a aumentos
   fijos (150×) y con `mlim` congelado, el contraste de la niebla es invariante
   frente a la pupila de salida entre 0,40 mm y 7,00 mm (C = 0,984 → 1,001 →
   0,991; §5.3). La pupila entra **una sola vez** en el signo que importa: en el
   umbral. Es exactamente lo que exige la física de fuentes extensas.
3. **El modelo predice que la niebla se apaga al subir el aumento**, y lo hace
   por el motivo correcto: `mlim` se hace más profundo, el corte sube y las
   estrellas se van de la niebla al canal de estrellas. MEDIDO en M11 nuclear
   (sqm 21,5): 200 mm de 40× a 300× → 20,5 a 14,9 DN; 457 mm de 40× a 400× →
   18,8 a 8,6 DN (§5.1). Respuesta a la pregunta (b), no (a) ni (c).
4. **Con el mismo censo de estrellas, el contraste de la niebla es invariante
   con el aumento**, como manda la física de fuentes extensas. MEDIDO con `mlim`
   congelado en M11: C = 0,982 / 0,985 / 0,992 / 0,998 / 0,987 entre 40× y 600×
   (§5.2). Lo único que crece es el **grumo** (C_p99,9/C_med de 1,06 a 1,46), y
   eso es la resolución del cúmulo asomando: correcto.
5. **Dos hallazgos con sitio en el código**, ninguno de ellos «la pupila entra
   dos veces»:
   - **H1 (importante).** `pintarFot()` juzga la niebla con la ley
     **C_MAG heredada**, no con **H2c**, porque llama a `ctxFotometrico(o)` sin
     `thetaIntArcmin` (`resources/js/bitacora-gaia-render.js:597`) y
     `nieblaCampo()` no marca `difusoMask`. El ADR 0022 prerregistró
     explícitamente «el `Cmin` de producción (`ctxFotometrico` con H2c activa)».
     MEDIDO: a 300× sobre un 200 mm, C_MAG da Cmin = 0,219 y H2c (θ_int = 14′)
     daría 0,531 — la ley heredada es **2,4× más permisiva** justo donde la
     física pide que la niebla se apague (§5.5).
   - **H2 (menor, de coherencia).** La luz de la niebla no se realimenta al
     cielo: no entra por `sumaSB`/`veloSB` y por tanto no degrada `mlim`, cosa
     que el ADR 0014 sí hace para la banda truncada. MEDIDO: en M11 nuclear a
     200 mm/61× la niebla sale a μ ≈ 21,5, o sea tan brillante como el propio
     cielo; realimentarla bajaría `mlim` 0,32 mag (§5.6).
6. **No es bug** el margen frente a estrellas individuales, pero está **fino**:
   la niebla nunca llega a pintar una estrella sub-`mlim` aislada como mancha
   visible, con un margen de 1,29 a 3,18 mag en todo el espacio barrido — del
   que el desvanecido de `visibilidadDifusa` se come 1,0 mag y el parche
   estético 0,44 mag más (§5.4).

---

## 1. Qué hace hoy `nieblaCampo()` (con líneas)

`resources/js/bitacora-gaia-render.js:999-1040`, llamada desde `vistaGaia()` en
`:2432` **solo en campo ordinario** (con globular manda `S1campo`, ADR 0012).

```
corte      = o.mlim + colaGlowMag()                        (:1007)
thSky      = thetaRiccoArcmin(c.SBe) / o.cielo.aumentos    (:1002)   arcmin de cielo
hPx        = (thSky/60) · px_por_grado                     (:1006)
para cada estrella con g > corte:
    f      = 10^(-0,4·g)
    total += f                                             (:1020)   flujo REAL
    f     *= FOT.NIEBLA_GANANCIA_ESTETICA                  (:1021)   parche del ADR 0022
    reparto en tienda separable de semiancho hPx, pesos normalizados por eje,
    depositado como flujo por arcsec² de cielo             (:1027-1039)
```

Luego `pintarFot()` (`:595-680`) juzga cada píxel:

```
c   = ctxFotometrico(o)                                    (:597)   ← SIN thetaIntArcmin
s   = visibilidadDifusa(Fobj[i], c.Fcielo·c.Cmin, true)    (:620)
DN  = c.nivelFondo + valorDeFlujo(realzar(Fobj·s), c.FcieloPintado, c.rango)
```

Y `ctxFotometrico()` (`:312-362`) concentra el equipo y el cielo:

```
dim   = (min(d_ep, d_ojo)/d_ojo)²
Fcielo= 10^(-0,4·sqm)                       ← unidades "antes de la pupila"
Cmin  = C_MIN · (Fref/(Fcielo·dim))^0,35
SBe   = sqm − 2,5·log10(dim) − 2,5·log10(T)
si H2C y thetaIntArcmin > 0:  Cmin *= (1 + θ_R(SBe)/(θ_eff·M))²      ← rama H2c
si no, y aumentos > 0:        Cmin *= clamp(100/M, 0,45, 2,0)        ← rama C_MAG
```

**Detalle que decide medio informe:** `pintarFot` no pasa `thetaIntArcmin`, así
que la niebla cae siempre por la **rama C_MAG**. Las otras capas difusas evitan
el problema marcando `difusoMask` con su propio desvanecido —
`bitacora-gaia-render.js:2023` (cúmulo) y `bitacora-ps1.js:1408` (galaxia) —, y
esas sí calculan su `ctxFotometrico(o.cielo, θ_int)` a mano (`:1983`, `:2018`,
`bitacora-ps1.js:1349`). `nieblaCampo()` es hoy **el único consumidor del umbral
genérico de `pintarFot`** (verificado: `grep difusoMaskDe(` da solo esos dos
sitios).

---

## 2. La física de una fuente EXTENSA a través del telescopio

Bien establecido, y ya recogido en [`pupila-salida-fondo-cielo.md`](pupila-salida-fondo-cielo.md) §A/§B.
Lo que aporta esta nota es la formalización primaria de Crumey (2014), que
coincide símbolo a símbolo con la estructura del código.

- **El brillo superficial escala con el cuadrado de la pupila de salida y nunca
  supera el de ojo desnudo.** En Crumey (2014, MNRAS 442, 2600; arXiv:1405.4209)
  la luminancia de fondo aparente en el ocular es su Ec. 66, escrita siguiendo a
  Tousey & Hulburt (1948), con el factor **(δ_min/p)²** donde
  `δ_min = min(d_ep, d_ojo)` y `p` es la pupila del ojo. Ese `min` **es**
  literalmente el `pEf = Math.min(o.pupilaSalida, pOjo)` del código
  (`bitacora-gaia-render.js:313`): la fuente primaria confirma el clamp, no solo
  la potencia cuadrática.
- **El aumento oscurece objeto extenso y cielo por igual, así que el contraste
  (el cociente) es invariante con el aumento.** Roger N. Clark, *Visual Astronomy
  of the Deep Sky* (Cambridge Univ. Press / Sky Publishing, 1990), capítulo del
  método OMVA: «magnification does not change the contrast with the background,
  because both the sky's and the object's surface brightnesses are affected
  equally» (https://clarkvision.com/visastro/omva1/). *No verificado contra el
  libro impreso*: la cita se toma del material del propio autor en la web, que es
  el que ya usaba la nota anterior del repo.
- **Lo que sí cambia con el aumento es el umbral**, porque el objeto crece en la
  retina. Crumey Ec. 82-85: para un blanco de área angular α en el cielo visto a
  aumento M, `μ_lim = μ∞ − (2,5/q)·log[(α_TR/α)^q + 1]`, con `μ∞ = μ_sky −
  2,5·log(φ·C_a)` (el límite de blanco grande, la meseta) y `α_TR` el área de
  Riccò telescópica. Es la misma familia funcional que la ley H2c del repo
  (`Cmin ∝ (1 + θ_R/(θ_eff·M))²`, ADR 0001): meseta para objetos grandes,
  pendiente ∝ 1/α para objetos pequeños.
- **Conservación de radiancia (étendue).** La imposibilidad de superar el brillo
  de ojo desnudo es el teorema de invariancia de radiancia de un sistema óptico
  pasivo; su expresión práctica en visual es el factor (δ_min/p)² de arriba. *No
  verificado en una fuente primaria de óptica en esta sesión*; se apoya en Crumey
  Ec. 66 y en la bibliografía ya citada por la nota anterior (Clark 1990; V.
  Sacek, telescope-optics.net).

---

## 3. Pero la niebla no es una fuente extensa cualquiera

Esta es la parte que la pregunta señala bien y que hay que separar del §2.

### 3.1 Una fuente puntual sí gana con el aumento

- Bowen (1947, PASP 59, 253, doi:10.1086/125960) midió el límite estelar en
  Mount Wilson con tres aperturas (0,33″, 6″, 60″) y un rango de aumentos: el
  aumento reparte el fondo sobre más área aparente mientras la estrella sigue
  siendo un punto, así que la relación estrella/fondo mejora hasta que la pupila
  de salida cae por debajo de la del ojo.
- Schaefer (1990, PASP 102, 212, doi:10.1086/132629) lo formaliza: el brillo
  superficial del cielo se reduce por un factor **M²** con el aumento, y ese
  factor «should only be applied to the background brightness, because a point
  source under magnification still appears as a point». Es la razón física de que
  `magLimite()` (`bitacora-gaia-render.js:710-731`) dependa de los aumentos.
- Crumey Ec. 87 da el mismo resultado explícito: el límite puntual
  `m_0 = μ_sky + 2,5·log(M²/(φ·R_a·B)) + …` crece como **5·log M**.

### 3.2 Un conjunto de puntuales no resueltas: el caso intermedio

El resultado clave es de Crumey (2014), §2 (comentario a Riccò, Ec. 21-22):

> «threshold targets subtending less than the Ricco area are indistinguishable
> from point sources, hence faint stars can be mistaken for nebulous objects and
> vice versa»

y, en la misma página:

> «Both the Ricco area and the constant, R, become larger as the background
> luminance B decreases.»

Esas dos frases son, juntas, la ley que el código implementa:

- El área de Riccò **crece cuando el fondo se oscurece** → `θ_R = 10^(0,094 +
  0,081·SBe)` (`thetaRiccoArcmin`, `:308-310`), con `SBe` ya atenuado por pupila
  y transmisión. Es física, no un parámetro libre.
- El área de Riccò **proyectada al cielo** es `A_TR = R_a/(M²·C_a)` (Crumey Ec.
  81) → en el código, `thSky = θ_R/M` (`:1002`), que es la misma cantidad
  expresada en diámetro angular.

RAZONADO, con esa ley: dentro de un parche de Riccò de área Ω_cielo = (θ_R/M)²
el ojo suma el flujo de las N ≈ n·Ω estrellas que caen dentro y lo compara con el
flujo del cielo en la misma área. Entonces

```
C = (n·Ω·⟨f⟩) / (B·Ω) = n·⟨f⟩/B        ← invariante en Ω, luego invariante en M
```

**mientras N ≫ 1**. Cuando N ≲ 1 el cociente pasa a `C = f/(B·Ω) ∝ M²`: el
parche contiene una estrella o ninguna, y lo que queda ya no es niebla sino la
detección de una puntual, que se rige por `mlim`. Es decir: **la niebla no se
apaga por resolverse, se convierte en estrellas** — y como esas estrellas están
por construcción por debajo de `mlim`, lo correcto es que **no** aparezcan.

Precedente en el repo, coherente con esto: la textura/grano de esa transición
quedó **falsada con medida** (ADR 0015 y `0015-textura/veredicto.md`), y el
crowding resultó inerte frente al velo del cielo (ADR 0012,
`0015-textura/analisis_recuperable.md` §5). La formulación estadística de la
varianza por elemento de resolución es Tonry & Schneider (1988, AJ 96, 807,
doi:10.1086/114847): la media del brillo superficial es independiente de la
distancia y lo que escala es la **varianza** — o sea, la mancha es robusta y el
grano no. Esta capa pinta la mancha, como decidió el ADR 0022.

*No verificado*: la observación clásica de que M11/NGC 7789 «se resuelven» al
subir aumento y pierden el aspecto nebuloso no tiene, hasta donde llega esta
búsqueda, fuente primaria cuantitativa; se apoya en los reportes visuales
recogidos en `nubosidad-cumulos-abiertos-gaia.md` §3b.

---

## 4. Método de medida

Scripts temporales en `/Users/isra/.claude/jobs/4febc410/tmp/` (fuera del repo,
producción intacta). Importan `resources/js/bitacora-gaia-render.js` con
`global.window = {}` y llaman a `nieblaCampo()`, `ctxFotometrico()`,
`visibilidadDifusa()`, `realzarPerceptual()` y `valorDeFlujo()` **de producción**.

- Datos: fixtures del ADR 0022, Gaia DR3 hasta G = 20 (`niebla_m11.csv`, etc.).
- Escena: `SIZE = 720`, ocular de campo aparente 68°, luego campo real =
  68·60/M arcmin — así el aumento se aísla del ocular.
- `sqm = 21,5`, `T = 0,8`, `pupilaOjo = 7 mm`, `NIEBLA_GANANCIA_ESTETICA = 1,5`
  (el valor de producción) salvo donde se diga.
- Estadísticos sobre un disco de 1,75′ de radio de cielo centrado en el cúmulo
  (el anillo nuclear del prerregistro), para no salir de la cobertura del fixture.
- `C = F/Fcielo` por píxel; `DN` = incremento sobre el nivel de fondo tras la
  cadena completa de `pintarFot` (desvanecido + gamma perceptual).
- «`m_niebla`» = magnitud de la estrella **aislada** cuyo pico de tienda cae justo
  en `Fcielo·Cmin`; se compara contra `corte = mlim + 2,30`.

---

## 5. MEDIDO

### 5.1 Barrido de aumentos con la cadena real (M11 nuclear, sqm 21,5)

`Cmin` es el de producción (rama C_MAG, la que usa `pintarFot`); `Cmin H2c` es
lo que daría la rama H2c con θ_int = 14′ (diámetro visible de M11).

| Equipo | p. salida | campo | `mlim` | corte | SBe | θ_R ap. | θ_R/M | hPx | Cmin | Cmin H2c | C_med | s_med | **DN_med** | m_niebla | margen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 200/40×  | 5,00 mm | 102,0′ | 13,90 | 16,20 | 22,47 | 82,1′ | 123,1″ | 14,5 | 0,238 | 0,156 | 1,175 | 0,877 | **20,5** | 13,05 | 3,15 |
| 200/61×  | 3,28 mm | 66,9′  | 14,29 | 16,60 | 23,39 | 97,4′ | 95,8″  | 17,2 | 0,262 | 0,198 | 0,984 | 0,779 | **19,5** | 13,49 | 3,11 |
| 200/100× | 2,00 mm | 40,8′  | 14,69 | 17,00 | 24,46 | 119,0′ | 71,4″ | 21,0 | 0,226 | 0,266 | 0,791 | 0,751 | **17,2** | 14,29 | 2,71 |
| 200/150× | 1,33 mm | 27,2′  | 14,97 | 17,27 | 25,34 | 140,2′ | 56,1″ | 24,7 | 0,200 | 0,341 | 0,657 | 0,724 | **15,5** | 14,94 | 2,33 |
| 200/229× | 0,87 mm | 17,8′  | 15,21 | 17,51 | 26,26 | 166,4′ | 43,6″ | 29,4 | 0,182 | 0,446 | 0,562 | 0,699 | **14,2** | 15,60 | 1,92 |
| 200/300× | 0,67 mm | 13,6′  | 15,34 | 17,64 | 26,85 | 185,7′ | 37,1″ | 32,8 | 0,219 | 0,531 | 0,518 | 0,578 | **14,9** | 15,74 | 1,90 |
| 457/61×  | 7,49 mm | 66,9′  | 15,12 | 17,42 | 21,74 | 71,6′ | 70,5″  | 12,6 | 0,154 | 0,110 | 0,592 | 0,788 | **13,6** | 14,73 | 2,69 |
| 457/150× | 3,05 mm | 27,2′  | 16,15 | 18,45 | 23,55 | 100,3′ | 40,1″ | 17,7 | 0,112 | 0,185 | 0,282 | 0,607 | **9,4**  | 16,30 | 2,16 |
| 457/229× | 2,00 mm | 17,8′  | 16,49 | 18,79 | 24,47 | 119,1′ | 31,2″ | 21,0 | 0,102 | 0,243 | 0,205 | 0,505 | **8,5**  | 16,95 | 1,84 |
| 457/400× | 1,14 mm | 10,2′  | 16,86 | 19,16 | 25,68 | 149,3′ | 22,4″ | 26,3 | 0,150 | 0,352 | 0,124 | 0,131 | **8,6**  | 17,25 | 1,91 |

Lecturas:

- **La niebla se apaga al subir aumento**, monótonamente en las dos aperturas.
  Y se apaga también al subir apertura a igual aumento (61×: 19,5 → 13,6 DN de
  200 a 457 mm), que es el listón P4 del ADR 0022 visto desde el render.
- **`hPx` es constante-ish y no baja con M**: la tienda mide θ_R en **grados
  aparentes**, y como el campo también encoge con M, en píxeles crece
  suavemente (14,5 → 32,8). Es correcto: el área de Riccò es un ángulo aparente.
- θ_R/M sí encoge (123″ → 37″ en 200 mm), pero solo ×3,3 para ×7,5 de aumento,
  porque θ_R **crece** al oscurecerse SBe. La concentración ∝ M² de §3.2 sale
  amortiguada a ≈ M^1,1 por la propia fisiología. Esto no estaba escrito en el
  ADR 0022 y es la razón de que el modelo no explote a mucho aumento.

### 5.2 `mlim` congelado: aísla la tienda de Riccò

`mlim` fijado a mano en 14,29 (el de 200 mm/61×) para que el **censo de estrellas
sea idéntico** en todas las filas. Solo cambia el aumento.

| Equipo | θ_R/M | hPx | C_med | C_p99,9 | grumo (p99,9/med) |
|---|---|---|---|---|---|
| M11 200/40×  | 123,1″ | 14,5 | 0,982 | 1,038 | 1,06 |
| M11 200/61×  | 95,8″  | 17,2 | 0,985 | 1,067 | 1,08 |
| M11 200/150× | 56,1″  | 24,7 | 0,992 | 1,179 | 1,19 |
| M11 200/300× | 37,1″  | 32,8 | 0,998 | 1,263 | 1,27 |
| M11 200/600× | 24,6″  | 43,4 | 0,987 | 1,438 | 1,46 |
| NGC 2266 200/40×  | 123,1″ | 14,5 | 0,085 | 0,118 | 1,39 |
| NGC 2266 200/61×  | 95,8″  | 17,2 | 0,086 | 0,125 | 1,45 |
| NGC 2266 200/150× | 56,1″  | 24,7 | 0,086 | 0,151 | 1,76 |
| NGC 2266 200/300× | 37,1″  | 32,8 | 0,077 | 0,225 | 2,92 |
| NGC 2266 200/600× | 24,6″  | 43,4 | 0,070 | 0,306 | 4,37 |

**Este es el resultado central de la nota.** Con el mismo censo:

- En M11 (denso, N ≫ 1 por parche de Riccò) el contraste **medio** es invariante
  con el aumento dentro del 1,6 % entre 40× y 600×. Es exactamente la
  invariancia de Clark 1990 / Crumey Ec. 84 para fuentes extensas, reproducida
  por un modelo que **no la tiene escrita en ningún sitio**: emerge de sumar
  puntuales sobre el área de Riccò. Buena señal de que la cadena es correcta.
- El **grumo** crece con el aumento (1,06 → 1,46 en M11; 1,39 → 4,37 en el
  cúmulo pobre), y crece mucho más rápido donde hay menos estrellas por parche.
  Eso es la transición niebla→puntos de §3.2 apareciendo sola, sin ley nueva.

### 5.3 Barrido de pupila de salida a aumento fijo (150×, `mlim` congelado)

La pregunta 4 del encargo: ¿entra la pupila dos veces, una en `SBe`/`dim` y otra
en `Cmin`?

| Equipo | p. salida | SBe | θ_R/M | Cmin | Cmin H2c | **C_med** | s_med | DN_med |
|---|---|---|---|---|---|---|---|---|
| 60/150×   | 0,40 mm | 27,96 | 91,3″ | 0,465 | 0,857 | **0,984** | 0,528 | 12,4 |
| 100/150×  | 0,67 mm | 26,85 | 74,3″ | 0,325 | 0,577 | **0,988** | 0,692 | 20,9 |
| 200/150×  | 1,33 mm | 25,34 | 56,1″ | 0,200 | 0,341 | **0,992** | 0,879 | 18,2 |
| 300/150×  | 2,00 mm | 24,46 | 47,6″ | 0,151 | 0,252 | **0,996** | 0,955 | 17,2 |
| 457/150×  | 3,05 mm | 23,55 | 40,1″ | 0,112 | 0,185 | **1,001** | 0,996 | 16,7 |
| 700/150×  | 4,67 mm | 22,62 | 33,8″ | 0,083 | 0,135 | **0,996** | 1,000 | 16,6 |
| 1050/150× | 7,00 mm | 21,74 | 28,7″ | 0,063 | 0,101 | **0,991** | 1,000 | 16,6 |

**No hay doble contabilidad.** El contraste `C = F/Fcielo` es invariante a la
pupila de salida dentro del ±1,7 % en un rango de 17× de pupila (0,40 a 7,00 mm).
La razón está en el código y es limpia: `nieblaCampo` deposita flujo de catálogo
y `Fcielo = 10^(-0,4·sqm)` está en las **mismas unidades «antes de la pupila»**
(`bitacora-gaia-render.js:317`), así que `dim` se cancela en el cociente. Cielo y
niebla se atenúan igual, como debe ser. La pupila entra **solo** en `Cmin`
(`:319`) y en `SBe`→θ_R (`:326`), y esas dos son cosas distintas: la primera es
el umbral de contraste, la segunda es el tamaño del campo receptivo. Que las dos
crezcan al oscurecerse el campo no es contar dos veces lo mismo — es lo que dicen
Crumey Ec. 77-80 (`R_a` y `C_a` son **ambas** función de `B_a`).

El ±1,7 % residual es real y tiene explicación: θ_R depende de SBe, luego el
ancho de la tienda cambia con la pupila y el muestreo del disco de 1,75′ cambia un
pelo. No es una dependencia física de la niebla; es ruido de medida.

### 5.4 ¿Pinta la niebla estrellas sub-`mlim` como manchas visibles?

`m_niebla` = magnitud de la estrella aislada cuyo pico de tienda toca
`Fcielo·Cmin`; `margen` = `corte − m_niebla` (positivo = seguro).

| sqm | 200/61× | 200/150× | 200/300× | 457/61× | 457/229× | 457/500× |
|---|---|---|---|---|---|---|
| 18,5 | 2,37 | 1,93 | 1,77 | 1,63 | **1,29** | 1,67 |
| 20,0 | 2,80 | 2,20 | 1,90 | 2,23 | 1,63 | 1,86 |
| 21,5 | 3,11 | 2,33 | 1,90 | 2,69 | 1,84 | 1,92 |
| 22,0 | 3,18 | 2,34 | 1,78 | 2,82 | 1,88 | 1,91 |

**No es bug hoy, pero el margen está fino.** El peor caso medido es 1,29 mag
(457 mm/229×, sqm 18,5). Y ese margen no es todo aprovechable:

- `visibilidadDifusa` en modo perceptual empieza a levantar `s` en
  `log10(F/Fumbral) = −FOT.UMBRAL_MARGEN = −0,4` (`:525`), o sea **1,0 mag** por
  debajo de `m_niebla`. Quedan 0,29 mag de aire en el peor caso.
- El parche estético (`NIEBLA_GANANCIA_ESTETICA = 1,5`) se come otros
  **0,44 mag** (= 2,5·log₁₀ 1,5) del margen, porque multiplica antes del umbral
  (documentado ya en el propio ADR 0022).

RAZONADO: si alguien sube la ganancia a 2,5-3 o baja `UMBRAL_MARGEN`, la capa
empezará a pintar como mancha visible estrellas que `dibujar()` descarta por
`aGlow < glowCorte` (`:2245`) — dos criterios contradictorios sobre la misma
estrella. Merece una guarda o, como mínimo, una nota en el ADR.

### 5.5 H1: la niebla se juzga con la ley heredada, no con H2c

MEDIDO (M11, θ_int = 14′, sqm 21,5), cociente C_MAG/H2c:

| Equipo | Cmin producción (C_MAG) | Cmin H2c | cociente |
|---|---|---|---|
| 200/40×  | 0,238 | 0,156 | 1,53 (permisiva H2c) |
| 200/61×  | 0,262 | 0,198 | 1,32 |
| 200/100× | 0,226 | 0,266 | 0,85 |
| 200/150× | 0,200 | 0,341 | 0,59 |
| 200/300× | 0,219 | 0,531 | **0,41** |
| 457/61×  | 0,154 | 0,110 | 1,40 |
| 457/229× | 0,102 | 0,243 | 0,42 |
| 457/400× | 0,150 | 0,352 | **0,43** |

La rama C_MAG multiplica por `clamp(100/M, 0,45, 2,0)` (`:344-345`): satura en
2,0 por debajo de 50× y en 0,45 por encima de 222×, o sea deja de depender del
aumento en los dos extremos. La rama H2c no satura: sube como `M^0,7` vía `dim`
(la meseta de Crumey Ec. 86) porque el término de tamaño ya vale ≈ 1 para un
objeto de 14′ a 300×.

RAZONADO de la consecuencia: con H2c, a 457 mm/400× sería `C_med = 0,124` contra
`Cmin = 0,352` → `visibilidadDifusa` daría **s = 0** y la niebla desaparecería,
en vez de los 8,6 DN que pinta hoy. A 200 mm/300× daría s ≈ 0,21 en vez de 0,578.
O sea: **la ley preregistrada apagaría la niebla a mucho aumento más rápido de lo
que lo hace la ley que corre.** Y esa es la dirección que pide la física del §3.2
y la práctica observacional (poca potencia para el aspecto nebuloso).

Esto no invalida los listones del ADR 0022 en la dirección peligrosa: el arnés
juzgó M11/E1 con Cmin = 0,339 (H2c con θ = diámetro del anillo) frente a los
0,262 de producción, es decir **más estricto**, así que P1/P2 son conservadores.
Pero P3 (los controles) se midió en algunos anillos con un Cmin **más permisivo**
que el de producción, y en cualquier caso el ADR dice literalmente «el `Cmin` de
producción (`ctxFotometrico` con H2c activa, ADR 0008: la ley se importa, no se
copia)» — y eso hoy no es lo que ocurre.

### 5.6 H2: la niebla no se realimenta al cielo

MEDIDO. Convirtiendo el contraste medido a brillo superficial y sumándolo al
cielo con `sumaSB()` de producción (M11 nuclear, sqm 21,5):

| Equipo | C_med | μ_niebla | sqm efectivo | `mlim` sin/con realimentación | Δ |
|---|---|---|---|---|---|
| 200/61×  | 0,984 | 21,52 | 20,76 | 14,29 → 13,98 | **−0,32** |
| 200/150× | 0,657 | 21,96 | 20,95 | 14,97 → 14,80 | −0,17 |
| 457/61×  | 0,592 | 22,07 | 21,00 | 15,12 → 14,86 | −0,26 |
| 457/229× | 0,205 | 23,22 | 21,30 | 16,49 → 16,42 | −0,07 |

RAZONADO: la niebla de M11 sale a **μ ≈ 21,5 mag/arcsec²**, igual de brillante
que el cielo — cifra que confirma la estimación previa de la nota de
investigación (μ ≈ 21-22, `nubosidad-cumulos-abiertos-gaia.md` §3b) y que es del
mismo orden que el velo medido de M7 (21,0, ADR 0014). El ADR 0014 **sí**
realimenta su velo: `cielo.veloSB` entra en `ctxFotometrico` por `sumaSB` (`:315`)
y en `magLimite` (`:715`), con el argumento explícito de que «un fondo más
brillante también quita estrellas del límite» (`:2394-2397`). La niebla del ADR
0022 es la misma luz, del mismo campo, y no lo hace. Es una asimetría entre dos
casos del mismo invariante de conservación.

Es de segundo orden (0,07-0,32 mag) y tiene un lazo: más niebla → peor `mlim` →
más estrellas caen en la niebla → más niebla. Habría que cerrarlo con una
iteración o con un punto fijo, no con una suma directa. **No propongo tocarlo**
sin prerregistro; se documenta.

### 5.7 Controles y borde: dos verificaciones en negativo

**Controles con la cadena de producción completa** (sin la resta de línea base
que usa el arnés — producción pinta el flujo total, incluido el campo galáctico):

| Objeto | 200/61× | 200/150× | 457/61× | 457/229× |
|---|---|---|---|---|
| NGC 2266 | DN_med 0,0 | 0,0 | 0,0 | 0,0 |
| M45 | 0,0 | 0,0 | 0,0 | 0,0 |
| NGC 7789 | 9,8 | 4,0 | 5,2 | 0,0 |
| M11 | 19,5 | 15,5 | 13,6 | 8,5 |

El fallo de P3 de la v1 del prerregistro (el campo galáctico plano cruzando el
umbral) **no se materializa en el render**: la mediana de los controles queda a
0 DN en los cuatro equipos, y solo aparecen píxeles sueltos de 4-6 DN en
NGC 2266. La componente plana del campo sí se pinta, pero cae bajo `Cmin`.

**Artefacto de borde: no existe.** `nieblaCampo` descarta las estrellas cuyo
centro cae fuera del lienzo (`:1015`) pero renormaliza las tiendas que sobresalen
hacia dentro (`:1032-1033`), lo que en principio son dos sesgos opuestos.
MEDIDO con un campo sintético uniforme de 300 000 estrellas G = 18 y perfil
horizontal en 24 franjas: 0,99 / 0,95 / 1,01 … 1,02 / 1,02 respecto al centro.
Los dos sesgos se cancelan exactamente para un campo uniforme. Sin hallazgo.

---

## 6. Respuestas, una por una

**(1) ¿Debe influir la pupila de salida?** Sí, y solo por una vía: el **umbral**.
El brillo superficial de la niebla relativo al cielo es invariante a la pupila
(§5.3, medido), porque cielo y niebla se atenúan igual — Clark 1990, Crumey Ec.
66. El código lo hace bien y lo hace por construcción, no por casualidad:
`Fcielo` y el flujo depositado están ambos en unidades pre-pupila.

**(2) ¿Debe influir el aumento?** Sí, por dos vías reales y una espuria que el
modelo no tiene:
- *Real, y presente*: `mlim` se hace más profundo, el corte sube y menos luz
  queda en la niebla (`:1007`). Es el efecto dominante (§5.1).
- *Real, y presente*: el área de integración del ojo proyectada al cielo encoge
  como θ_R(SBe)/M (`:1002`), lo que en régimen disperso concentra el flujo y
  vuelve grumosa la niebla (§5.2, grumo 1,39 → 4,37 en NGC 2266).
- *Espuria, y ausente — bien*: no hay ningún realce del contraste **medio** con
  el aumento. Medido invariante al 1,6 % (§5.2). Es lo que exige Clark 1990.

**(3) Al subir aumento con la misma apertura, ¿(a) igual, (b) se apaga, (c) más
visible, (d) máximo intermedio?** **(b), y el modelo lo predice.** MEDIDO: 200 mm
de 40× a 300× → 20,5 a 14,9 DN; 457 mm de 40× a 400× → 18,8 a 8,6 DN, monótono.
No hay máximo intermedio en el rango barrido. El mecanismo del modelo es el
correcto (las estrellas se van al canal de estrellas al bajar `mlim`), no un
apagado por umbral. RAZONADO: la física dice además que **el contraste medio no
debe cambiar** con el aumento a censo fijo — y a censo fijo el modelo da
exactamente eso (§5.2). Las dos cosas son compatibles y las dos se cumplen.

**(4) ¿Falta alguna dependencia? ¿Entra la pupila dos veces?**
- **No entra dos veces.** Medido (§5.3).
- **Falta la realimentación al cielo** (H2, §5.6): la luz de la niebla no
  degrada `mlim` ni `Cmin`, cosa que el ADR 0014 sí hace para su velo. 0,07-0,32
  mag en `mlim`.
- **Sobra permisividad a mucho aumento** (H1, §5.5): la ley que juzga la niebla
  no es la que se prerregistró.
- **No falta** nada del lado del grano/textura: está descartado con medida (ADR
  0015) y el ADR 0022 lo excluyó a propósito.
- **No falta** el seeing en la tienda: θ_R/M va de 123″ a 22″ en todo el barrido,
  siempre ≫ los 2″ de `FOT.H2C.SEEING_AS`, así que su omisión en `:1002` es
  inocua. (Sí entra en `θ_eff` cuando se usa la rama H2c, `:334`.)

**(5) ¿Es correcto el modelo actual?** En lo que la pregunta apunta —pupila y
aumentos—, **sí, y se demuestra con dos invariancias medidas que el modelo no
tiene escritas y sin embargo reproduce** (§5.2 y §5.3). Los dos hallazgos H1 y H2
no son errores de esta capa: H1 es una propiedad de `pintarFot` que la niebla
hereda por ser la única capa difusa sin máscara propia, y H2 es una asimetría
entre el ADR 0014 y el ADR 0022.

---

## 7. Veredicto

**La niebla de campo debe depender de la pupila de salida y de los aumentos, y
hoy depende de las dos correctamente.** La pupila entra una sola vez, en el
umbral, y el contraste medido es invariante a ella en un rango de 17× (§5.3). El
aumento entra por `mlim` y por el área de Riccò proyectada, y a censo de estrellas
congelado el contraste medio sale invariante con el aumento dentro del 1,6 %
entre 40× y 600× (§5.2) — que es justo lo que la física de fuentes extensas
exige, reproducido por una cadena que no lo tiene programado. Con `mlim` real la
niebla se apaga monótonamente al subir aumento, respuesta **(b)**, y el grumo
crece: la transición niebla→estrellas emerge sola.

**Dos deudas, ninguna de ellas la pupila.** (H1) `pintarFot` juzga la niebla con
la ley C_MAG heredada y no con H2c, que es la que el ADR 0022 prerregistró; a
mucho aumento la ley que corre es hasta 2,4× más permisiva que la
prerregistrada, y con H2c la niebla se apagaría del todo a 400× sobre el 457 mm.
(H2) La luz de la niebla —μ ≈ 21,5 en M11, tan brillante como el cielo— no se
realimenta a `sumaSB`/`mlim` como el ADR 0014 sí hace con su velo: 0,32 mag de
`mlim` en el caso nominal.

**Y un margen que conviene vigilar**: la niebla no llega a pintar estrellas
sub-`mlim` aisladas como manchas visibles, pero el peor caso medido deja 1,29
mag de margen, del que el desvanecido se come 1,0 y el parche estético 0,44.

Ninguna de las tres cosas justifica tocar producción sin prerregistro (ADR 0004,
0005, 0007). Se documentan aquí para que la decisión se tome con números.

---

## Referencias

### Fuentes primarias externas

- **Crumey, A. 2014**, *Human contrast threshold and astronomical visibility*,
  MNRAS 442, 2600, doi:10.1093/mnras/stu992, arXiv:1405.4209. La fuente central
  de esta nota. Ec. 21-22 (ley de Riccò, área de Riccò como intersección de
  asíntotas, y «both the Ricco area and the constant, R, become larger as the
  background luminance B decreases»); el comentario de que «threshold targets
  subtending less than the Ricco area are indistinguishable from point sources,
  hence faint stars can be mistaken for nebulous objects and vice versa»; Ec. 66
  (luminancia de fondo aparente con el factor **(δ_min/p)²**, siguiendo Tousey &
  Hulburt 1948); Ec. 77-83 (umbral telescópico `C = φ[(R_a/A_a)^q + C_a^q]^{1/q}`,
  con `A_a = M²A`); Ec. 81 (área de Riccò telescópica `A_TR = R_a/(M²C_a)`);
  Ec. 84-88 (μ_lim de un blanco de área α; `m_0 ∝ M²`, o sea 5·log M para
  puntuales). Texto verificado directamente sobre el PDF de arXiv en esta sesión.
- **Bowen, I. S. 1947**, *Limiting Visual Magnitude*, PASP 59, 253,
  doi:10.1086/125960. Medidas de límite estelar con 0,33″, 6″ y 60″ a varios
  aumentos en Mount Wilson; base empírica de que el límite **puntual** mejora con
  el aumento hasta que la pupila de salida baja de la del ojo. Reanalizado por
  Crumey 2014 §3.2. *Consultado a través del resumen del reanálisis y de la ficha
  ADS; no leído íntegro en esta sesión.*
- **Schaefer, B. E. 1990**, *Telescopic limiting magnitudes*, PASP 102, 212,
  doi:10.1086/132629. El brillo superficial del cielo se reduce por un factor
  **M²** con el aumento, y ese factor «should only be applied to the background
  brightness, because a point source under magnification still appears as a
  point». Primera formulación moderna que incluye el aumento en el límite
  estelar. *Contenido verificado vía la ficha de IOPscience/ADS; no leído íntegro
  en esta sesión.*
- **Clark, R. N. 1990**, *Visual Astronomy of the Deep Sky*, Cambridge Univ.
  Press / Sky Publishing. Método OMVA; invariancia del contraste objeto↔cielo con
  el aumento («magnification does not change the contrast with the background,
  because both the sky's and the object's surface brightnesses are affected
  equally»), y umbral de detección dependiente del tamaño aparente (datos de
  Blackwell). https://clarkvision.com/visastro/omva1/ — *cita tomada del material
  del autor en la web; no verificada contra el libro impreso.*
- **Blackwell, H. R. 1946**, *Contrast thresholds of the human eye*, JOSA 36,
  624. Datos de umbral de contraste por tamaño y luminancia de fondo; base de
  Clark 1990 y de la ley H2c del repo (ADR 0001). *No consultado directamente en
  esta sesión; citado a través de Crumey 2014 y de los ADR del repo.*
- **Riccò, A. 1877**, Ann. Ottalmol. 6, 373. La ley `C·A = R`. *Citado a través
  de Crumey 2014 Ec. 21.*
- **Tonry, J. & Schneider, D. 1988**, *A new technique for measuring
  extragalactic distances*, AJ 96, 807, doi:10.1086/114847. Fluctuaciones de
  brillo superficial: la **media** del brillo superficial de una población no
  resuelta es robusta y lo que escala con la distancia (aquí, con el número de
  estrellas por elemento de resolución) es la **varianza**. Sostiene la decisión
  del ADR 0022 de pintar la mancha y no el grano.
- **Tousey, R. & Hulburt, E. O. 1948**, JOSA 38, 886. Origen del tratamiento de
  la luminancia de fondo aparente que Crumey formaliza en su Ec. 66. *Citado a
  través de Crumey 2014.*

### Fuentes internas (rutas desde la raíz del repo)

- `resources/js/bitacora-gaia-render.js` — `thetaRiccoArcmin` (308-310),
  `ctxFotometrico` (312-362), `valorDeFlujo`/`flujoDeValor` (513-518),
  `visibilidadDifusa` (523-527), `pintarFot` (595-680, clave `:597` y `:620`),
  `veloSB`/`sumaSB` (698-708), `magLimite` (710-731), `nieblaCampo` (999-1040),
  `dibujar` corte de glow (`:2245`), llamada en `vistaGaia` (`:2432`),
  `FOT.NIEBLA_GANANCIA_ESTETICA` (`:243`).
- `resources/js/bitacora-ps1.js:1349,1408` — la capa de galaxias sí calcula su
  `ctxFotometrico` con θ_int y marca `difusoMask`.
- `simulador_ocular/docs/adr/0022-preregistro-niebla-sub-mlim-en-cumulos-abiertos.md`
  — prerregistro, v1/v2 y el parche estético.
- `simulador_ocular/docs/adr/0001-h2c-es-la-capa-perceptual-del-modelo-de-cumulos.md`
  — H2c, la ley de umbral por tamaño y su calibración en campo.
- `simulador_ocular/docs/adr/0009-fondo-cielo-luminancia.md`,
  `0010-suelo-27-deteccion-ojo.md`, `0012-el-crowding-es-una-probabilidad-por-estrella.md`,
  `0014-adquisicion-gaia-por-regimen-de-densidad.md`,
  `0015-umbral-de-textura-para-el-grano-sbf.md` y `0015-textura/veredicto.md`,
  `0018-el-brillo-de-una-estrella-es-umbral-no-contraste.md`.
- `simulador_ocular/docs/notas/pupila-salida-fondo-cielo.md` — el clamp
  `min(1,(d_ep/d_ojo)²)` y la invariancia del contraste con el aumento.
- `simulador_ocular/docs/notas/nubosidad-cumulos-abiertos-gaia.md` — la
  investigación que originó la capa; estimación previa de μ ≈ 21-22 para M11.
- `scripts/harness_niebla_abiertos.js` y `scripts/fixtures/gaia/niebla_*.csv` —
  arnés prerregistrado y datos; **PASA (4/4)** sobre `89ceecc`.

### Qué está bien establecido y qué es aproximado

- *Bien establecido:* `SB ∝ (d_ep/d_ojo)²` con tope en ojo desnudo (Crumey Ec.
  66); invariancia del contraste objeto↔cielo con el aumento (Clark 1990);
  ganancia del límite puntual como 5·log M (Bowen 1947, Schaefer 1990, Crumey
  Ec. 87); crecimiento del área de Riccò al oscurecerse el fondo y su proyección
  al cielo como 1/M² (Crumey Ec. 22 y 81).
- *Aproximado / calibrado en el repo:* las constantes `FOT.C_MIN`, `C_EXP = 0,35`
  y los coeficientes `THETA_R_A/B` de H2c son ajustes propios (ADR 0001);
  `GAMMA_PERCEPTUAL = 0,45` está calibrada contra perfiles sintéticos y el propio
  ADR 0022 la señala como el eslabón sospechoso detrás del parche estético;
  `NIEBLA_GANANCIA_ESTETICA = 1,5` no tiene medida detrás y el ADR 0022 lo dice.
- *No verificado:* que M11/NGC 7789 pierdan el aspecto nebuloso al subir aumento
  no tiene fuente primaria cuantitativa localizada; la invariancia de radiancia
  no se verificó en una fuente de óptica primaria en esta sesión.
