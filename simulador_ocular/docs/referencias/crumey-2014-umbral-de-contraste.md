# Crumey 2014: ¿qué le dice al umbral de contraste del simulador?

**Pregunta.** Crumey (2014) publica un modelo de visibilidad para objetivos
uniformes de cualquier tamaño construido sobre los datos de Blackwell (1946).
El render usa la **ley H2c**, destilada de esos mismos datos y calibrada contra
12 observaciones reales. ¿Contradice Crumey lo que hacemos, lo reformula, o
cubre huecos que el repo tiene abiertos?

**Método.** Lectura del PDF primario completo (arXiv:1405.4209v1, 21 páginas,
extraído con `pdftotext -layout` y leído íntegro: §1 a §4, ecuaciones 1–91,
Tabla 1, Figuras 1–18). Todas las ecuaciones y constantes de la sección 1 están
transcritas del PDF, no de memoria ni de terceros. Las cifras de la sección 1.8
se obtuvieron implementando las ecuaciones del paper y **verificando la
implementación contra los propios valores que el paper publica** (m₀ = 6,93 y
6,18; µ∞ = 24,94; Tabla 1 sup = 17,90 y 18,06): reproducidos exactos. Las
comparaciones con el repo son cálculos propios sobre el código de producción,
marcados como tales. Nada secundario; si en algún punto se cita literatura
amateur, va marcado **[web/amateur]** (no hizo falta).

Referencia: Crumey, A. 2014, *Human Contrast Threshold and Astronomical
Visibility*, MNRAS 442, 2600–2619 (DOI 10.1093/mnras/stu992; preprint
arXiv:1405.4209).

## Respuesta corta

**Crumey no contradice a H2c: es, casi literalmente, la misma ley.** Las dos
tienen las mismas dos asíntotas (Riccò con pendiente −1 en área, meseta C∞ para
objetos grandes), la misma variable de fondo (la luminancia del cielo **tal como
llega al ojo**, ya atenuada por pupila de salida y transmisión) y el mismo
tratamiento del telescopio (comparar el tamaño aparente θ·M contra la escala de
Riccò del fondo del ocular). Las tres diferencias cuantitativas son pequeñas y
están medidas abajo: el codo (0,25 mag), la pendiente con la luminancia (−0,35
nuestra frente a −0,289 suya) y la deriva de θ_R por debajo de SBe ≈ 23.

Más notable: **el nivel absoluto coincide por dos caminos independientes.** El
anclaje del repo dice `K = 2,005` sobre Blackwell 50 % de laboratorio
(`simulador_ocular/docs/experimentos/ricco/anclaje/parametros_h2c.json`), fijado
después por 12 observaciones en ocular; Crumey llega a «un valor nocional F = 2»
desde los límites históricos a ojo desnudo (§3.1). Son el mismo número con
significados equivalentes: el factor de campo que separa el laboratorio de la
noche real.

**Lo que Crumey sí aporta y el repo no tiene son tres huecos, no tres
correcciones.** El corte de fondo cero (Ecs. 70–72), que es exactamente el
máximo de aumento útil que `maglimite_vs_schaefer.md` deja apuntado como
carencia; el techo de validez del modelo puntual (~10′ aparentes) con su
penalización por disco de seeing (Ec. 88); y la corrección escotópica por índice
de color (Ec. 18), que el repo no aplica en ningún sitio.

La recomendación final es **no tocar H2c** y usar a Crumey como banco externo
—como ya se hace con Schaefer 1990—, más un único cambio de producción
candidato, que además es en `magLimite` y no en la ley de umbral.

---

## 1. Qué dice Crumey exactamente

### 1.1 Definiciones y unidades

- Contraste (Ec. 1): `C = (Bt − B)/B ≡ ΔB/B`, con `Bt` la luminancia del objeto
  y `B` la del campo circundante, ambas en cd m⁻². Para un objeto visto a través
  de una pantalla transparente (o de la atmósfera) `ΔB = Bt`.
- Iluminancia incremental (Ec. 2): `ΔI = A·ΔB`, con `A` el **área angular en
  estereorradianes** y `ΔI` en lux.
- Conversiones fotométricas (§1.3, con `Z_V = 2,54 × 10⁻⁶ lx` de Cox 1999):
  `m_V = −2,5 log J − 13,99` y **`µ_V = −2,5 log B + 12,58`**. Esta última es la
  que traduce todo el paper a magnitudes por segundo de arco.
- El problema del modelo es, literalmente, «encontrar expresiones analíticas para
  ΔB o ΔI umbral como funciones de A y B».

### 1.2 La relación empírica «no reconocida previamente»

Es el núcleo del paper y está en §2.1 y §2.2. Crumey lo dice así: el enfoque
«se basa en el hallazgo sorprendente de que **R y C∞ son ambas funciones simples
de B^(−1/4)**, a lo largo de rangos apropiados de B».

- `R` es la constante de la ley de Riccò (Ec. 21: `C·A = R`), es decir la
  asíntota de objetos pequeños.
- `C∞` es el umbral de contraste para objetos grandes, la meseta.

Al representar **√R frente a B^(−1/4)** (Fig. 5) el gráfico sale en **dos tramos
rectos**, uno fotópico y otro escotópico:

```
R_scot = (r1·B^(−1/4) + r2)²          (Ec. 23)
R_phot = (r3·B^(−1/4) + r4)²          (Ec. 24)
```

con, para los datos de la tabla 8 de Blackwell (1946):

```
r1 = 6,505 × 10⁻⁴   r2 = −8,461 × 10⁻⁴          (Ec. 26)
r3 = 1,772 × 10⁻⁴   r4 =  7,167 × 10⁻⁵          (Ec. 27)
```
con punto de corte `B = 7,08 × 10⁻² cd m⁻²`. `R` sale en estereorradianes.

Lo mismo vale para la meseta (Fig. 8), ahora con `C∞` —no `√C∞`— frente a
`B^(−1/4)`:

```
C∞_scot = k1·B^(−1/4) + k2             (Ec. 35)
C∞_phot = k3·B^(−1/4) + k4             (Ec. 36)
k1 = 7,633 × 10⁻³   k2 = −7,174 × 10⁻³ (Ec. 37)
k3 = 0              k4 =  2,720 × 10⁻³ (Ec. 38)
```
con punto de corte `B = 3,54 × 10⁻¹ cd m⁻²`. Los datos de `C∞` no son de
Blackwell sino de **Taylor (1960b)**, cotas superiores, y Crumey avisa
explícitamente de que «los datos son menos robustos que los usados en la sección
anterior para obtener la función R».

Para el rango completo (fotópico + mesópico + escotópico) la discontinuidad se
sustituye por una hipérbola casi degenerada (Ecs. 25 y 39, con coeficientes `a_i`
de la Ec. 28 y `b_i` de la Ec. 40). Crumey concluye que **no hace falta** para
astronomía: «para la visibilidad astronómica basta con usar el modelo
escotópico».

**El significado físico** lo da él mismo en las conclusiones (§4): la Ec. 23
implica `C ≈ (r1²/A)·B^(−1/2)`, que es **la ley de de Vries–Rose** (Rose 1948),
«así que la relación modela la desviación del sistema visual respecto de la
detección cuántica ideal». La constante `r2` (negativa) es lo que hace que la
pendiente real no sea exactamente −1/2.

### 1.3 El modelo para objetivos EXTENSOS uniformes de tamaño arbitrario

Lo que sustituye al «plateau de Blackwell» es una **combinación geométrica de las
dos asíntotas** con un solo parámetro libre `q`:

```
C = ((R/A)^q + C∞^q)^(1/q)             (Ec. 41)
```

`R/A` es la rama de Riccò (Ec. 21, objetos pequeños) y `C∞` la meseta (objetos
grandes). Crumey subraya que «por construcción, la Ec. 41 tiene el comportamiento
asintótico correcto para A grande y pequeña, con q controlando el codo
intermedio». `q` depende de la luminancia:

```
q = 1,146 − 0,0885·log B     B ≥ 3,40 cd m⁻²        (Ec. 42)
q = 0,8861 + 0,4·log B       0,193 ≤ B < 3,40       (Ec. 43)
q = 0,6                      B < 0,193 cd m⁻²       (Ec. 44)
```

**Para astronomía, `q = 0,6` y el modelo se reduce a una sola expresión cerrada**
(Ec. 47), que es la que él declara definitiva:

```
C = [ ((r1·B^(−1/4) + r2)² / A)^(3/5) + (k1·B^(−1/4) + k2)^(3/5) ]^(5/3)   (Ec. 47)

r1 = 6,505 × 10⁻⁴   r2 = −8,461 × 10⁻⁴   (Ec. 48)
k1 = 7,633 × 10⁻³   k2 = −7,174 × 10⁻³   (Ec. 49)

válida para 10⁻⁵ ≤ B ≤ 3,426 × 10⁻² cd m⁻²
```

Por debajo de `B = 10⁻⁵ cd m⁻²` (fondo efectivamente nulo) la forma es distinta
y sin dependencia del fondo (Ecs. 50–52):

```
C = [ (ξ1/A)^(3/5) + ξ2^(3/5) ]^(5/3)
ξ1 = (10^(5/4)·r1 + r2)² = 1,150 × 10⁻⁴
ξ2 = (10^(5/4)·k1 + k2) = 1,286 × 10⁻¹
```

**El área de Riccò**, que es la escala donde las dos asíntotas se cruzan, es
(Ec. 22 y Ec. 59):

```
A_R = R/C∞ = (r1·B^(−1/4) + r2)² / (k1·B^(−1/4) + k2)   [sr]
```

y su **radio** tiene aproximación lineal en unidades astronómicas (Ec. 63):

```
r_R = 5,21·µsky − 76,2   [arcmin]   para 21 ≤ µsky ≤ 22 (error máx. 0,05′)
```

A `µsky = 21,83` da `r_R = 37,6′`, es decir un **diámetro de Riccò de ~75′ a ojo
desnudo bajo cielo oscuro**. Crumey lo contrasta con el «radio visual crítico»
de Blackwell, que a ese mismo fondo vale ~4,5′: son definiciones distintas del
mismo codo y difieren por un factor 8.

Consecuencia que él destaca: desde la Ec. 60, el brillo superficial umbral de un
objeto **de área exactamente igual al área de Riccò** es
`−4,167·log(2) = 1,25 mag arcsec⁻²` más brillante que µ∞, y su magnitud es
igualmente 1,25 mag más brillante que m₀. «Esto refleja el hecho familiar de que
las fuentes extensas deben ser suficientemente más brillantes que el límite de
fuente puntual para verse como no estelares, aunque el criterio no es
estricto.»

En astronómicas, la Ec. 41 se reescribe (Ecs. 60–62) como:

```
µlim = µ∞ − (2,5/q)·log( (A_R/A)^q + 1 )                  (Ec. 60)
mlim = m0 − (2,5/q)·log( (α/α_R)^q + 1 )                  (Ec. 62)
```

con α, α_R en arcmin². Y la asíntota de objeto infinito (Ecs. 56, 57):

```
ΔB∞ = F·(7,633×10⁻³·B^(3/4) − 7,174×10⁻³·B)              (Ec. 56)
µ∞ = 0,6864·µsky + 9,9325 − 2,5·log F                     (Ec. 57)
        para 18 < µsky < 22 (error máx. 0,02 mag arcsec⁻²)
```

**El factor de campo F.** Es la pieza conceptual clave: «la función de umbral
debe considerarse en general relativa y no absoluta, pero invariante en forma»
(§1.2). `F` es el producto de todos los factores de campo (edad, motivación,
forma no circular, no uniformidad, deslumbramiento) más el escalado de
laboratorio; **mueve toda la curva arriba o abajo en ejes log sin deformarla**.
Crumey estima para observación real `F` entre 2,4 y 1,4, y adopta **F = 2 como
valor nocional típico** (§3.1), que da un límite a ojo desnudo de 6,18 mag bajo
µsky = 21,83.

### 1.4 El modelo de fuentes puntuales, y Hecht (1947) / Schaefer (1990)

La rama de fuente puntual es el límite `A → 0` de lo anterior. En iluminancia
(Ec. 32, y con el factor de campo en la Ec. 53):

```
ΔI = F·(6,505×10⁻⁴·B^(1/4) − 8,461×10⁻⁴·B^(1/2))²   [lx]   (Ec. 53)
```

Aproximaciones lineales para la magnitud límite a ojo desnudo (Ecs. 54, 55, 90,
91):

```
m0 = 0,3834·µsky − 1,4400 − 2,5·log F   (20 < µsky < 22, err. 0,01)
m0 = 0,4260·µsky − 2,3650 − 2,5·log F   (21 < µsky < 25, err. 0,04)
m0 = 0,27 ·µsky + 0,8    − 2,5·log F    (18 ≤ µsky ≤ 20)
m0 = 0,383·µsky − 1,44   − 2,5·log F    (19,5 ≤ µsky ≤ 22)
```

**Frente a Hecht (1947).** Hecht da `ΔI = c(1 + (KB)^(1/2))²` (Ec. 20) con dos
ramas discontinuas: `(c,K) = (1,706×10⁻⁹ , 1,259×10³)` para
`B ≤ 1,645×10⁻² cd m⁻²`, y `(4,808×10⁻⁸ , 1,259×10⁻¹)` por encima. Crumey no es
ambiguo: «lo que no se ha advertido es que, **para el rango de luminancia
relevante para la observación astronómica, la fórmula de Hecht era en realidad
inferior a la de Knoll et al** a la que se suponía que reemplazaba» (§1.5). La
razón es geométrica y está en la Fig. 2: para `log B` entre −1,5 y −4 (16,33 a
22,58 mag arcsec⁻²) **los datos forman una curva compresiva mientras la de Hecht
es acelerante**, o sea con la curvatura del signo equivocado. La fórmula de Knoll
et al. (Ec. 19: `ΔI = c(1+KB)^(1/2)`, con `c = 1,076×10⁻⁹` y `K = 10⁵`), una
recta, es mejor que Hecht en ese tramo.

Como la Ec. 20 es la base de Garstang (1986), de Schaefer (1990) y —dice Crumey—
de las calculadoras de magnitud límite que usan los aficionados (Unihedron), el
defecto de curvatura se propaga a todas.

**Frente a Schaefer (1990), punto por punto.** El paper lo hace a lo largo de §1
y §3:

- *Probabilidad de detección.* Schaefer interpretó el 50 % de Blackwell como
  «confianza del 50 % del observador»; Crumey dice que eso es un error: es una
  normalización estadística fija, y el factor personal es lo que varía.
  Matemáticamente irrelevante «ya que el umbral se multiplica por el producto de
  esos factores», pero conceptualmente distinto.
- *Edad.* Schaefer la atribuyó a reducción del tamaño pupilar; Crumey, siguiendo
  a Adrian (1989), a pérdida de transparencia de los medios oculares, y en todo
  caso es «un multiplicador global más», no un cambio de forma.
- *Visión monocular.* Lythgoe & Phillips (1938) dan `1,4·C = 0,5(C_L + C_R)`, con
  lo que el umbral monocular es `√2` el binocular. Schaefer usa el mismo `√2`
  (su `F_b`) pero **«lo incluyó incorrectamente como modificación de estímulo en
  su ec. 15 (es decir, como multiplicador de B)»**, error repetido por Garstang
  (2000).
- *Stiles-Crawford.* Schaefer propuso una expresión (su ec. 9) que «da
  incorrectamente un valor no nulo para todos los tamaños de pupila». Los bastones
  apenas tienen sensibilidad direccional (Flamant & Stiles 1948; Van Loo & Enoch
  1975), así que Crumey lo considera despreciable.
- *Disco de seeing.* Schaefer (su ec. 7) supuso que el diámetro del disco es igual
  al seeing citado; Crumey argumenta que la anchura real es `2,55·θ` (para el
  97 % de la luz) o `2,80·θ` (100 %), siendo θ la FWHM.
- *Precisión.* Sobre los datos telescópicos de Bowen (1947): excluyendo los dos
  puntos dudosos, **«el modelo de Schaefer tiene error r.m.s. de 0,37 mag, frente
  a 0,09 mag del presente modelo»**.

### 1.5 La corrección escotópica por índice de color

Es §1.3, y es un tratamiento completo. La luminancia se define (Ec. 3) como
`B_v = K_v ∫ E(λ)v(λ)dλ`. El objeto clave es la razón S/P (Ec. 5):

```
ρ_E = [K_sc ∫E(λ)V_sc(λ)dλ] / [K_ph ∫E(λ)V_ph(λ)dλ]
K_ph = 683 lm/W (CIE 1924 fotópica)   K_sc = 1700 lm/W (CIE 1951 escotópica)
```

Resultados numéricos, todos literales del paper:

- `ρ_2850 = 1,408` (lámparas de Blackwell, 2850 K). `ρ_2360 / ρ_2850` = 1,220
  (Knoll et al. usaron 2360 K).
- Para cuerpos negros de 2000 a 50 000 K, con exactitud del 1 % (Ec. 7):
  `ρ_T = (5,738×10⁶)/T² − (8,152×10³)/T + 3,564`.
- Del índice de color `c = m_B − m_V`, vía Flower (1996), sale un polinomio de
  grado 6 (Ec. 12) cuya aproximación lineal (Ec. 13) es
  `log ρ_c = −0,1094·c + 0,4378`, **exacta al 5 % para −0,17 ≤ c ≤ 1,65**.
- De ahí (Ecs. 8, 10, 14): `m_sc − m_ph = 0,27·(m_B − m_V) − 0,10`, consistente
  con la estimación independiente `≈ 0,25·(m_B − m_V)` de la Ec. 11.
- Y la forma **utilizable** del resultado, relativa entre dos colores (Ec. 18):

```
m1 − m2 = 0,27·(c2 − c1)          (Ec. 18)
```

es decir, dos estrellas cuyos índices de color difieran en 1,0 mag tienen umbrales
escotópicos separados **0,27 mag**. Las Ecs. 16 y 17 dan la corrección absoluta
frente a las lámparas de laboratorio: `m∗ − m_2850 = 0,72 − 0,27(m_B − m_V)` y
`m∗ − m_2360 = 0,94 − 0,27(m_B − m_V)`.

Crumey señala dos errores de Schaefer aquí: (a) Schaefer calculó la Ec. 17 pero
dio el resultado aproximado `1 − (m_B − m_V)/2`, «que el presente análisis
contradice (un cociente 4 sería aceptable)», y en la práctica solo lo usó fijando
`ρ_2360/ρ_c = 0,5` uniforme para todas las estrellas; (b) Schaefer dijo que la
corrección debe aplicarse también al fondo, **lo cual solo vale si el fondo es
aproximadamente cuerpo negro, y el cielo nocturno no lo es** por culpa del
airglow.

Dato utilizable para nosotros: «el cielo del cénit sin luna y sin contaminación
lumínica puede aproximarse razonablemente por un cuerpo negro de 5500 K más
líneas de airglow»; `ρ_sky` va de 0,79 (100 % airglow) a 2,26 (0 %), con
**1,38 como cifra típica (60 % airglow)**, «muy próxima a la razón S/P de las
fuentes de Blackwell (1,41, equivalente a 58 % de airglow)». Por eso el fondo de
Blackwell sirve como cielo nocturno sin corrección.

### 1.6 Rango de validez

Recogido de §1.2, §1.3, §2.2, §2.3 y §3.2:

| Magnitud | Rango declarado | Dónde lo dice |
|---|---|---|
| Datos de Blackwell: tamaños | 0,595′ a 6° de diámetro, discos uniformes acromáticos | §1.2 |
| Datos de Blackwell: fondos | 3426 cd m⁻² a cero | §1.2 |
| Ec. 47 (modelo escotópico) | `10⁻⁵ ≤ B ≤ 3,426×10⁻² cd m⁻²` | tras la Ec. 49 |
| Límite superior del modelo escotópico | «aproximadamente 0,1 cd m⁻² (15 mag arcsec⁻²) para fuentes acromáticas» | §2.3 |
| Aplicaciones astronómicas | objetos dentro de ~1 mag del umbral, fondo no más brillante que ~3×10⁻³ cd m⁻² (18,9 mag arcsec⁻²), observador plenamente adaptado | §1.3 |
| Fondo «efectivamente cero» | `B ≲ 10⁻⁵ cd m⁻²` = **25,08 mag arcsec⁻²** | §2.1, Fig. 3 |
| Validez del modelo puntual | hasta ~1′ de diámetro en condiciones diurnas; **«a niveles de luz bajos el modelo puntual sigue siendo muy preciso para diámetros de hasta unos 10 minutos de arco»** | §2.2 |
| Forma elíptica | Lamar et al. (1948): el área basta hasta razón de ejes ≈ 7 | §1.6.3 |
| Visión mesópica | 0,005 a 5 cd m⁻² (CIE 2010); escotópico por debajo de ~18,3 mag arcsec⁻² | §1.3 |

Advertencias explícitas del propio autor:

- El modelo **no se espera aplicable a imagen CCD**: «dado que el sistema visual
  es bastante distinto de un detector limitado solo por eficiencia cuántica, no
  se espera que los resultados presentados aquí sean aplicables a imagen CCD»
  (§4). Sí a placas fotográficas inspeccionadas visualmente (Hubble 1932).
- Objetos **no uniformes** (galaxias) se tratan «aproximadamente», y el propio
  ejercicio con M33 lleva la coletilla: «hace falta cierta cautela porque el
  objetivo no es ni uniforme ni circular, y el borde se ve en realidad contra el
  resto (invisible) de la galaxia, no contra el cielo».
- Objetos con radiancia espectral muy distinta de un cuerpo negro (**nebulosas de
  emisión**) «requerirían tratamiento especial con las técnicas de la sección
  1.3». No lo hace.
- «La modelización de situaciones como estas requeriría nuevos conjuntos de datos
  experimentales, distintos de los acromáticos usados aquí» (§4), refiriéndose a
  fotópico con cromaticidad y a mesópico.

### 1.7 Uso telescópico

Lo trata en §1.6.4, §3.2, §3.3 y §3.4, y es más detallado de lo que suele citarse.

**Transformación del estímulo.** Con `d` la pupila de salida, `p` la del ojo,
`δ_min = min(d,p)`, `δ_max = max(d,p)`, `F_t⁻¹` la transmitancia y `D` la pupila
de entrada:

```
B_a = (δ_min/p)² · B/F_t                                   (Ec. 66)
ΔI_a = (D/δ_max)² · ΔI/F_t                                 (Ec. 67)
```

`B_a` es la luminancia aparente del cielo en el ocular. La ley telescópica
completa para objetos de cualquier tamaño (Ecs. 77–81):

```
C = φ·[ (R_a/A_a)^q + C_a^q ]^(1/q) ,   φ ≡ F_T·F_M·F      (Ec. 77)
R_a = (r1/B_a^(1/4) + r2)²                                 (Ec. 78)
A_a = M²·A                                                 (Ec. 79)
C_a = k1/B_a^(1/4) + k2                                    (Ec. 80)
A_TR = R_a / (M²·C_a)        ← «área de Riccò telescópica»  (Ec. 81)
mlim = m0 − (2,5/q)·log( (α/α_TR)^q + 1 )                  (Ec. 88)
```

**Es exactamente la estructura de H2c:** el tamaño entra como `A·M²` frente a un
área de Riccò evaluada en el **cielo del ocular** `B_a`, no en el del cénit.

**Factores de campo telescópicos.** `F_T` (independiente del aumento) y `F_M`
(dependiente). Crumey recomienda `F_T = √2` —solo la corrección monocular— y
`F_M = 1` «hasta algún aumento más allá del cual no hay mejora adicional del
umbral». Advierte de que a mucho aumento la PSF del ojo cuenta (Watson 2013) y
de que «una pupila de salida de 0,5 mm suele considerarse el límite por debajo
del cual la difracción en el ojo empieza a dominar» (Jacobs et al. 1992), lo que
impone un máximo de aumento útil aparte del seeing.

**El corte de fondo cero: es donde el aumento deja de pagar.** Esta es la pieza
que el repo no tiene. La Ec. 65 «deja de ser válida si el aumento hace que las
imágenes estelares dejen de ser puntuales, o si oscurece el cielo por debajo de
unos 10⁻⁵ cd m⁻²». La segunda condición se alcanza en la pupila de salida:

```
d0 = p·√(10⁻⁵·F_t / B)                                     (Ec. 70)
ΔI_cut = ζ·(p/D)²·F_t·F_M·F_T·F ,  ζ = (10^(−5/4)·r1 + 10^(−5/2)·r2)² = 1,150×10⁻⁹ lx   (Ec. 71)
mcut = 5·log D − 2,5·log( Z⁻¹·ζ·p²·F_t·F_M·F_T·F )         (Ec. 72)
mcut = 5·log D + 8,45 − 2,5·log F   [D en cm]              (Ec. 73)
```

La Ec. 73 usa `F_M = 1`, `F_T = √2`, `p = 7 mm`, `F_t = 1,33` (75 % de
transmitancia). Con `F = 2` da `N = 7,69` en la forma clásica `m = N + 5 log D`
(Ec. 64), «que concuerda con la cifra de Sinnott 7,7 citada por Garstang (2000)
como el mejor valor de uso general».

Y la afirmación estructural (§3.2): «las Ecs. 69 y 72 implican que **el gráfico
de m0 frente a −log d consta de tres tramos rectos con pendientes 5 (d ≥ p),
2,131 (p ≥ d ≥ d0) y 0 (d ≤ d0)**». Verificado contra Bowen (1947) en tres
telescopios (Fig. 14) con r.m.s. 0,09 mag.

El equivalente para fondo cero en objetos extensos: el área de Riccò en el ocular
vale `R_a/C_a = (10^(5/4)·r1 + r2)²/(10^(5/4)·k1 + k2) = 8,941×10⁻⁴ sr = 10 567
arcmin²`, y `α_TR0 = 10567/M0² arcmin²`, con `M0² = 10⁵·B·D²/(p²·F_t)`.

**El caso del disco de seeing no puntual.** Bowen obtuvo 18,0 mag con el 60 pulgadas
a M = 1500, frente a un límite puntual predicho de 18,7. Crumey resuelve la Ec. 88
para α con `m0 − mlim = 0,7`, interpreta el resultado como el área del disco
gaussiano y obtiene **3,0 arcsec de diámetro**, de donde la FWHM del seeing es
`3,0/2,8 = 1,1″`, «enteramente consistente con la observación de Bowen de que era
“aproximadamente medio”». Es decir: la penalización de las estrellas gordas no es
un término aparte, **sale de la misma ley de tamaño**.

**Aumento óptimo (§3.4).** «El contraste de un objeto extenso visto en un
telescopio es independiente del aumento, pero el umbral depende del tamaño de la
imagen y del fondo, ambos cambiantes con el aumento. De ahí que un objeto pueda
ser invisible a baja o alta potencia y visible en algún rango intermedio.»
Gráficamente (Fig. 17): subir la potencia **desplaza la asíntota de Riccò a la
izquierda** (empeora el límite puntual) y **baja la asíntota horizontal**
(mejora el límite de brillo superficial). Añade una nota experimental: Leibowitz
(1952) halló que a bajos niveles de luz la agudeza es máxima con pupila de ~3 mm,
que es la pupila de salida que Herschel eligió por tanteo para sus barridos.

Comparación de instrumentos (Fig. 18): un 16 pulgadas en cielo de 20 mag arcsec⁻²
es superado por un 6 pulgadas en cielo de 21,5 para cualquier objetivo mayor de
1 arcmin²; «la contaminación lumínica lo vuelve inefectivo para ver galaxias».

### 1.8 Tabla 1: los invariantes libres de F

Tabla 1 del paper. `pen = m22 − m0` (penalización de magnitud respecto a
condiciones ideales, µsky = 22) y `sup = µ∞ − m0` (suplemento de brillo
superficial). Crumey subraya que **ambos son independientes de F y por tanto del
observador**, lo que los hace utilizables como patrón externo sin conocer el
factor de campo.

| µsky | 22,00 | 21,75 | 21,50 | 21,25 | 21,00 | 20,75 | 20,50 | 20,25 | 20,00 | 19,75 | 19,50 | 19,25 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pen | 0,00 | 0,10 | 0,20 | 0,30 | 0,40 | 0,49 | 0,59 | 0,68 | 0,77 | 0,85 | 0,93 | 1,01 |
| sup | 18,06 | 17,98 | 17,90 | 17,82 | 17,74 | 17,66 | 17,58 | 17,49 | 17,40 | 17,32 | 17,22 | 17,13 |

Bandeado de cielo propuesto: pristine 21,75–22,00; black 21,25–21,74; grey
20,25–21,24; bright 18,25–20,24; white < 18,25.

---

## 2. Qué hace hoy el render

Todo citado por `file:line` del árbol actual.

### 2.1 La cadena fotométrica

`resources/js/bitacora-gaia-render.js:313` — `ctxFotometrico(o, thetaIntArcmin)`.
Es la fuente única del umbral. Dentro:

- `:322` `var Cmin = FOT.C_MIN * Math.pow(Fref / (Fcielo * dim), FOT.C_EXP);`
  con `FOT.C_MIN = 0.08` y `FOT.C_EXP = 0.35` (`:119`), y `Fref` el flujo de un
  cielo de referencia de 21 mag arcsec⁻².
- `:328` `var SBe = sqm - 2.5*log10(dim) - 2.5*log10(T);` — el brillo del cielo
  **tal como llega al ojo**, atenuado por pupila de salida y transmisión.
- `:332-341` la ley H2c:
  ```js
  var thEff = Math.sqrt(thetaIntArcmin² + (FOT.H2C.SEEING_AS/60)²);
  var thR   = thetaRiccoArcmin(SBe);
  var raz   = 1 + thR / (thEff * o.aumentos);
  Cmin *= raz * raz;
  ```
- `:343` la vía histórica `C_MAG`, que solo corre con `FOT.H2C = null` (vía
  muerta declarada en el comentario de `:120`).

`:309` — `thetaRiccoArcmin(SBe) = 10^(0.094 + 0.081·SBe)`, en **minutos de arco
de cielo**, con las constantes en `:176`
(`H2C_DEFECTO: { THETA_R_A: 0.094, THETA_R_B: 0.081, SEEING_AS: 2.0 }`).

`:550` — `sbUmbralContraste(c) = -2.5·log10(c.Fcielo · c.Cmin)`: el brillo
superficial al que un objeto extenso llega al umbral.

`:529` — `visibilidadDifusa(F, Fumbral, perceptual)`: rampa suave entre invisible
y visible; en capas calibradas barre ~5 mag (`FOT.UMBRAL_MARGEN = 0.4`,
`FOT.UMBRAL_ANCHURA = 1.4`).

### 2.2 Los dos usos de la escala de Riccò como escala de juicio

- `:2362-2365` — el grano SBF de los globulares se juzga a
  `θ* = max(θ_beam, θ_R(SBe)/M)`: «el compromiso tiene un máximo, y está donde el
  término de Ricco vale 1».
- `:1041-1044` — `thetaNieblaArcmin(cielo) = thetaRiccoArcmin(SBe)/aumentos`, y
  `:1113` `thetaJuicioNiebla` la eleva a `max(θ_R/M, R50)` (ADR 0023 v2).

### 2.3 La magnitud límite puntual

`:741-765` — `magLimite(o)`: ajuste parabólico de Torres Lapasió sobre `SB0T`,
con `:757` `SB0T = Math.min(27, Math.max(sqm, SB0T));` — el techo de 27
mag arcsec⁻² del ADR 0010. `:205` `SB_SUELO_PINTADO: 27` es el mismo suelo
aplicado al `Fcielo` del pintado.

Nótese que **`magLimite` no está construida sobre `Cmin`**: es un ajuste
independiente. `Cmin` gobierna lo extenso; `magLimite` gobierna lo puntual. La
unión entre ambas no existe como ley (en Crumey sí: son las dos asíntotas de la
misma curva).

### 2.4 PS1: el umbral como opacidad

`resources/js/bitacora-ps1.js:1390` — `var umbral = R().sbUmbralContraste(c);`,
constante en todo el parche, con `c = ctxFotometrico(o.cielo,
parche.thetaIntArcmin)` (`:1389`).

`:1090-1095` — `ps1Opacidad(sbPixel, sbUmbral)`: `d = sbUmbral − sbPixel`, cero
por debajo de `deltaMin`, uno por encima de `deltaPlena`, potencia `deltaExp` en
medio. `:119` `deltaMin: 0.0, deltaPlena: 2.5, deltaExp: 1.0`. El comentario de
`:92-118` documenta que el Δ se mide contra el umbral y no contra `SBe`, y por
qué 2,5 («10× el contraste umbral, que es donde Blackwell deja de ver el objeto
al límite y lo ve de forma franca»).

`:91` `muHalo: 28.5` — hasta dónde se extrapola el perfil.

### 2.5 El modelo de color

`resources/js/bitacora-gaia-color.js` es **puramente cromático**: tabla
`GAIA_COLOR` (`:35`) de nodos BP−RP → RGB anclados a Harre & Heller (2021),
más saturación y gamma (`:54`, `:69`, `:84`) y clasificación espectral (`:105`).
No hay ninguna corrección del **umbral** por índice de color en todo el repo; lo
único relacionado es `CFG.margenColorMag = 4.5` (`bitacora-gaia-render.js:787`),
que decide a cuántas magnitudes por debajo de `mlim` aparece el color, no cuánto
cuesta detectar una estrella roja frente a una azul.

### 2.6 Lo ya decidido sobre Crumey

`simulador_ocular/docs/adr/0001-h2c-es-la-capa-perceptual-del-modelo-de-cumulos.md:10`
— **«Decidido: la Capa 4 es H2c. No se implementa la tabla Crumey, ni siquiera
como modo apagado por defecto.»** El criterio de escape está en `:26-29`: «Si
algún día la validación de Nivel 4 muestra discrepancias atribuibles
específicamente a la ley de detección, se abre un experimento comparativo como
rama efímera.»

`:37` — «H2c queda congelada. Sus constantes las fijaron las 12 observaciones.»

El anclaje absoluto está en
`simulador_ocular/docs/experimentos/ricco/anclaje/parametros_h2c.json`:
`"anclaje": "conserva C_MIN=0.08 (K=2.005 sobre Blackwell 50% lab, fondo 21)"`,
y las 12 observaciones en `simulador_ocular/docs/experimentos/ricco/campo/observaciones.csv`
(M101, NGC 6946, M33, NGC 891 con 200/300/450 mm a 158×).

---

## 3. Diferencias reales

### 3.1 Dónde Crumey solo REFORMULA lo que ya hacemos

**a) La estructura de la ley es la misma.** H2c es
`Cmin·(1 + θ_R/θ_app)²`; Crumey es `C∞·[1 + (A_R/A_a)^q]^(1/q)` con `q = 0,6`
(Ecs. 47, 77). Con `A ∝ θ²` la expresión de Crumey se reescribe
`C∞·(1 + u^1,2)^(5/3)` con `u = θ_R/θ_app`. Las **asíntotas coinciden
exactamente**: `u → 0` da la meseta en ambas; `u → ∞` da `C ∝ u²`, o sea Riccò
(pendiente −1 en área), en ambas. Lo único que difiere es la suavidad del codo.

**b) El codo difiere 0,25 mag y nada más.** Cálculo propio: en `θ = θ_R` la ley
del repo multiplica la meseta por `(1+1)² = 4`; Crumey por `2^(1/0,6) = 3,175`.
La diferencia es `2,5·log10(4/3,175) = 0,25 mag`, y solo en el entorno del codo:
a `u = 0,1` o `u = 10` las dos coinciden a menos del 2 %.

**c) θ_R reproduce el área de Riccò de Crumey.** Cálculo propio implementando
las Ecs. 22/23/35 con las constantes 26 y 37, contra
`thetaRiccoArcmin(SBe) = 10^(0.094+0.081·SBe)`:

| SBe (mag arcsec⁻²) | diámetro Riccò Crumey (′) | θ_R del repo (′) | razón |
|---|---|---|---|
| 18 | 39,5 | 35,7 | 0,90 |
| 20 | 57,0 | 51,8 | 0,91 |
| 21 | 66,6 | 62,4 | 0,94 |
| 21,83 | 75,2 | 72,8 | **0,97** |
| 22 | 77,0 | 75,2 | 0,98 |
| 23 | 88,4 | 90,6 | 1,03 |
| 25 | 114,8 | 131,5 | 1,15 |
| 27 | 147,3 | 191,0 | 1,30 |

(La columna de Crumey reproduce su propia Ec. 63 —`2·(5,21µ−76,2)` da 66,4′ y
76,8′ a µ 21 y 22— dentro de 0,2 %, lo que valida la implementación.)

Dos leyes ajustadas por separado a los mismos datos, una en `10^(a+b·SBe)` y la
otra como cociente de dos rectas en `B^(−1/4)`, coinciden al 3 % en el cielo
oscuro típico y a ≤10 % en todo el rango realista de cielo a ojo desnudo. **No es
casualidad: es que las dos codifican la misma medida de Blackwell.**

**d) El nivel absoluto coincide.** Cálculo propio: `Cmin` base del repo frente a
`C∞` de Crumey (Ec. 35+37), ambos sin factor de campo en Crumey:

| SBe | C∞ Crumey | Cmin repo | razón |
|---|---|---|---|
| 19 | 0,0263 | 0,0420 | 1,60 |
| 21 | 0,0459 | 0,0800 | **1,74** |
| 23 | 0,0769 | 0,1524 | 1,98 |
| 25 | 0,1261 | 0,2905 | 2,30 |

La razón **es** el factor de campo `F` de Crumey. En el cielo de referencia del
repo (21) vale 1,74, dentro del rango que Crumey declara para observación real
(1,4–2,4) y cerca de su valor nocional 2. Y el anclaje propio del repo dice
`K = 2,005` sobre la misma tabla de Blackwell. **Dos derivaciones independientes
del mismo factor.**

**e) El tratamiento del telescopio es el mismo.** La `B_a` de Crumey (Ec. 66,
`(δ_min/p)²·B/F_t`) es **idéntica en magnitudes** a nuestro `SBe`
(`:328`, `sqm − 2,5log(dim) − 2,5log(T)`, con `dim = (pEf/pOjo)²`). Y su
`A_a = M²·A` contra `A_TR = R_a/(M²C_a)` (Ecs. 79, 81) es literalmente nuestro
`θ_int·M` contra `θ_R(SBe)`. El comentario de `bitacora-ps1.js:96-102` —«el
objeto se apaga igual que el cielo y el Δ real no cambia; lo que cambia es el
UMBRAL, por luminancia retinal y por tamaño aparente»— es la misma frase que
Crumey escribe en §3.4.

**f) La escala de juicio θ_R/M también está en Crumey.** `A_TR = R_a/(M²C_a)`
es el área de cielo cuyo tamaño aparente iguala el área de Riccò; el
`θ* = θ_R/M` de `:2362` y de `thetaNieblaArcmin` (`:1041`) es su raíz. Nada que
importar.

### 3.2 Dónde Crumey CONTRADICE lo que hacemos

**a) La pendiente con la luminancia.** `FOT.C_EXP = 0.35` (`:119`) fija
`Cmin ∝ B^(−0,35)`. La `C∞` de Crumey tiene pendiente log-log **−0,289** en el
entorno de µ21 (cálculo propio sobre la Ec. 35), no constante porque `k2 ≠ 0`.
Su rama puntual, en cambio, tiene pendiente **−0,616** (ídem, Ec. 23), próxima
al −0,5 de de Vries–Rose. Nuestro 0,35 no es ninguno de los dos: está entre la
meseta y el punto, aplicado a la meseta.

Efecto medible: es lo que hace que la razón `Cmin/C∞` de la tabla de §3.1d
derive de 1,60 a 2,30 en lugar de quedarse fija. En Crumey el factor de campo
**es constante por construcción** («tiene el efecto de desplazar toda la curva
arriba o abajo en ejes log», §1.2). Una razón que deriva significa que una de
las dos pendientes está mal, y la evidencia primaria (Blackwell + Taylor)
apoya la de Crumey.

Tamaño del desacuerdo: `2,5·log10(2,30/1,60) = 0,39 mag` acumuladas entre SBe 19
y SBe 25. Dentro del rango donde se calibró H2c (SBe efectivos de esas 12
observaciones, cielos 21,0–21,6 a 158×) la deriva es de centésimas y **no puede
haberse detectado en campo**.

**b) Dónde el cielo deja de contar: 25,08 frente a 27.** Crumey (§2.1, Fig. 3)
sitúa el fondo efectivamente nulo en `10⁻⁵ cd m⁻² = 25,08 mag arcsec⁻²`, dato de
Blackwell corroborado por Crawford (1937), y construye todo el corte telescópico
sobre él (Ecs. 70–72). El repo usa **27** en dos sitios (`:757` y `:205`,
ADR 0010). Son 1,92 mag de diferencia en la misma cantidad física.

Consecuencia calculada: para D = 200 mm, cielo 21,5, transmisión 0,9, la Ec. 70
de Crumey pone el corte en pupila de salida `d0 = 1,42 mm`, o sea **M ≈ 141**.
El techo de 27 del repo se alcanza en `M ≈ 318`. Crumey dice que el aumento deja
de pagar **2,25× antes** de lo que dice el render.

**c) El máximo de aumento útil: Crumey lo tiene, nosotros no.**
`simulador_ocular/docs/experimentos/maglimite_vs_schaefer.md:50-58` ya lo declara
como carencia conocida: «Schaefer tiene un máximo en 250× y a partir de ahí baja.
`magLimite` no baja nunca; se aplana en 15,47». Crumey lo da en forma cerrada y
por **dos mecanismos distintos**, y esto es la aportación real del paper para
nosotros:

1. El corte de fondo cero: `mcut = 5·log D + 8,45 − 2,5·log F` (Ec. 73, D en cm).
   Cálculo propio: D = 200 mm con F = 2 da `mcut = 14,20`; con F = 2,74 (el valor
   que Crumey deduce para Bowen) da 13,86. Nuestro aplanamiento está en **15,47**
   y el máximo de Schaefer en 14,66.
2. La penalización por disco de seeing no puntual, vía la misma ley de tamaño
   (Ec. 88 con `α_TR0`), que en el caso de Bowen a M = 1500 valía 0,7 mag.

Nótese que el mecanismo 1 **ya existe estructuralmente en el repo** (el clamp de
`:757` produce exactamente el aplanamiento); lo que difiere es la constante
(27 vs 25,08) y que nuestro aplanamiento no se deriva de la misma ley que el
resto de la curva.

**d) La curvatura de Hecht/Schaefer.** Crumey demuestra (§1.5, Fig. 2) que la
base de Schaefer 1990 tiene la **curvatura del signo equivocado** en 16,3–22,6
mag arcsec⁻², y mide 0,37 mag r.m.s. frente a sus 0,09 sobre Bowen. Esto no es
una crítica a nuestro código, pero **degrada nuestro banco de comparación**:
`maglimite_vs_schaefer.md` mide contra un patrón que el paper primario refuta
justo en el rango que nos importa. La conclusión de aquel documento («nuestra ley
es más generosa que el banco empírico») sigue en pie —Crumey con F = 2 da 14,20
contra nuestros 15,47, y es aún más estricto que Schaefer— pero la cifra del
desacuerdo cambia.

**e) Corrección escotópica por color: el repo no la tiene.** Crumey Ec. 18:
`m1 − m2 = 0,27·(c2 − c1)`. Entre una M roja (BP−RP ≈ 2,5, B−V ≈ 1,6) y una B
azul (B−V ≈ −0,2) hay **0,49 mag de umbral**. El repo no aplica nada de esto:
`bitacora-gaia-color.js` es render cromático y `magLimite` no ve el color. Es una
contradicción real con la fuente primaria, aunque pequeña frente a los 0,21–0,70
mag que ya nos separan de Schaefer.

### 3.3 Dónde Crumey NO aplica

**a) El grano SBF y cualquier textura.** Crumey modela **discos uniformes
acromáticos sobre fondo uniforme**: esa es toda la base de datos (§1.2). No hay
un solo estímulo estructurado en Blackwell 1946, cosa que
`deteccion_textura_bibliografia.md:148-151` ya había establecido. El ADR 0015
decidió construir la ley de textura sobre el marco Rovamo–Mustonen–Näsänen
precisamente porque Blackwell —y por tanto Crumey— es ciego al problema. **Crumey
no cambia nada de eso**, y su propia conclusión («los resultados no se esperan
aplicables a imagen CCD… el sistema visual es bastante distinto de un detector
limitado por eficiencia cuántica») refuerza que su ley es de mancha.

**b) Nebulosas de emisión.** El propio autor las excluye: «objetivos con
radiancia espectral muy distinta de cuerpo negro (p. ej. nebulosas de emisión)
requerirían tratamiento especial». El repo tiene ADR 0025 y el tinte de las
planetarias justamente ahí, sin respaldo de Crumey.

**c) Galaxias reales.** Crumey las trata «aproximadamente» y con cautela
explícita por no uniformidad y no circularidad. El render de PS1 pinta la
galaxia **píxel a píxel** contra un umbral constante en todo el parche
(`bitacora-ps1.js:1390`); Crumey solo sabe decir si el objeto entero está por
encima o por debajo de una curva (su Fig. 12 para M33). Su modelo **no tiene nada
que decir** sobre la rampa `ps1Opacidad` ni sobre la estructura interna, que es
donde están casi todas las investigaciones abiertas del repo (interbrazos,
depresiones, costura del parche).

**d) Régimen de validez.** Nuestros `SBe` telescópicos se salen del rango de
Crumey por el lado oscuro con frecuencia: la Ec. 47 se declara válida hasta
`B = 10⁻⁵ cd m⁻²` (SBe 25,08), y un 457 mm a 300× con cielo 21,5 da SBe ≈ 26,1.
Ahí **Crumey ya no aplica su modelo de fondo**: usa las Ecs. 50–52, sin
dependencia del fondo, y avisa de que «la elección de exponentes es algo
arbitraria por falta de datos para 0 < B < 3,426×10⁻⁵». El repo, en ese mismo
régimen, sigue evaluando `Cmin ∝ B^(−0,35)` sin corte. Importar la ley de Crumey
no resolvería esto: **ninguna de las dos está respaldada por datos ahí**.

**e) Objetos supra-umbral.** Crumey es explícito: «este artículo se ocupa del
umbral, no de la percepción del brillo». `GAMMA_PERCEPTUAL`, `realzarPerceptual`
y toda la codificación sRGB del display (Capa 5, ADR 0009) quedan fuera de su
alcance. La `asinh` retirada en ADR 0001 y el `β≈0,5` de Stevens apuntado en
ADR 0018 pertenecen a otra literatura.

### 3.4 Un test que Crumey regala, y su resultado

Los invariantes `pen` y `sup` de la Tabla 1 son **independientes de F**, o sea
del observador y del factor de campo. Eso los convierte en un oráculo externo que
se puede aplicar al repo **sin conocer ni tocar nuestro K**. Cálculo propio,
comparando Crumey (Ecs. 53 y 56, F = 2) contra el repo a ojo desnudo aproximado
(`apertura: 7, aumentos: 1, transmision: 1, pupilaOjo: 7`), con `m0 = magLimite`
y `µ∞ = sbUmbralContraste` evaluado con θ enorme:

| µsky | sup Crumey (Tabla 1) | m0 repo | µ∞ repo | sup repo | Δ |
|---|---|---|---|---|---|
| 22,00 | 18,06 | 6,64 | 24,39 | 17,75 | −0,31 |
| 21,50 | 17,90 | 6,39 | 24,07 | 17,68 | −0,22 |
| 21,00 | 17,74 | 6,12 | 23,74 | 17,62 | −0,12 |
| 20,00 | 17,40 | 5,55 | 23,09 | 17,54 | +0,14 |

| µsky | pen Crumey | pen repo |
|---|---|---|
| 21,50 | 0,20 | 0,25 |
| 21,00 | 0,40 | 0,52 |
| 20,00 | 0,77 | 1,09 |

**Lectura.** El suplemento concuerda dentro de 0,31 mag en todo el rango, lo que
es notable dado que `magLimite` (Torres Lapasió) y `Cmin` son ajustes
completamente independientes entre sí y de Crumey. Pero **las pendientes no
concuerdan**: el suplemento del repo varía 0,21 mag entre µsky 20 y 22, el de
Crumey 0,66; y la penalización del repo crece ~1,4× más rápido con la
contaminación lumínica. Es la misma discrepancia de pendiente de §3.2a vista
desde otro ángulo.

**Caveat importante:** `magLimite` está ajustada para telescopios y aquí se la
evalúa con D = 7 mm y M = 1, fuera de su dominio de calibración. La cifra de m0
(6,12 a sqm 21) es razonable —implica F ≈ 1,6 en el lenguaje de Crumey— pero el
test de `pen` mide tanto la ley como la extrapolación. El test de `sup` es más
limpio porque `µ∞` sí sale de la ley de producción.

---

## 4. Cambios propuestos, por relación valor/coste

### P1 · Banco externo Crumey junto al de Schaefer — ALTO valor, coste bajo, riesgo CERO

**Hecho (#339):** `node scripts/harness_crumey.js`. Resultados y veredicto en
[`../experimentos/maglimite_vs_crumey.md`](../experimentos/maglimite_vs_crumey.md):
los tres tramos existen, pero el plano empieza en 316× y no en 141×, y el
tramo intermedio es curvo.

**Qué tocar.** Un `scripts/harness_crumey.js` nuevo, hermano de
`scripts/harness_maglimite_schaefer.js`, más un documento en
`simulador_ocular/docs/experimentos/`. **Ni una línea de producción.**

**Qué mide.** Los tres invariantes libres de factor de campo:
`sup = µ∞ − m0` y `pen = m22 − m0` (Tabla 1), y la curva telescópica de tres
tramos de pendientes 5 / 2,131 / 0 en `m0` frente a `−log d` (§3.2 del paper).
Los dos primeros ya están calculados en §3.4 de este documento y dan
−0,31 ≤ Δ ≤ +0,14; el tercero es el que de verdad falta.

**Qué falsaría.** Si nuestra curva de `magLimite` frente a pupila de salida no
tiene los tres tramos —y hoy sabemos que no los tiene: le falta el tramo de
pendiente 0 en el sitio correcto—, queda medido contra un patrón que **no es
Schaefer**, cuya curvatura Crumey refuta (§3.2d). Tener dos bancos que discrepan
entre sí es más informativo que tener uno solo.

**Riesgo contra lo validado en campo.** Ninguno: no toca `Cmin`, ni H2c, ni
`magLimite`, ni el pintado. Es medida.

**Por qué es el primero.** Todo lo demás de esta lista depende de saber, con
números del repo, cuánto discrepamos. Hoy solo tenemos los cuatro números de la
§3.4, calculados aquí.

### P2 · El máximo de aumento útil — valor ALTO, coste medio, riesgo ACOTADO

**Qué tocar.** `resources/js/bitacora-gaia-render.js:757`
(`SB0T = Math.min(27, Math.max(sqm, SB0T));`) y/o `magLimite` entera.

**El problema es real y ya está documentado en el repo**, no lo trae Crumey:
`maglimite_vs_schaefer.md:50-58` dice que «subir aumentos siempre paga, y en el
ocular real no». Crumey aporta la forma cerrada (Ecs. 70–73) y el dato primario
de que el corte está en 25,08 y no en 27.

**Dos variantes, y hay que elegir una sola.**

- **P2a (mínima):** mover la constante de `:757` de 27 a 25,08. Un carácter. Con
  D = 200 mm y cielo 21,5 el aplanamiento pasaría de M ≈ 318 a M ≈ 141.
- **P2b (completa):** añadir el corte como una ley derivada de la Ec. 70, no como
  un clamp.

**Qué mediría/falsaría.** Que la curva `magLimite(M)` tenga máximo, y dónde. Y
la consecuencia contable: cuántas estrellas pierde M13 a 250× y 350×, que es el
número que puso en marcha `maglimite_vs_schaefer.md`.

**Riesgo contra lo validado en campo: ESTE ES EL PUNTO DELICADO.** `magLimite`
alimenta el censo de estrellas de los globulares, `m_lim,sky`, la frontera
resuelta/no-resuelta, el corte de la niebla (`:1060`, `corte = o.mlim +
colaGlowMag()`), la realimentación H2 y toda la validación de M13. Cambiar 27 por
25,08 **mueve el censo de todo cúmulo observado a pupila de salida pequeña**, y
las 12 observaciones de campo de H2c se tomaron todas a 158× con 200–450 mm
(pupilas de 1,27 a 2,85 mm), es decir **justo en la banda que este cambio
tocaría**. Antes de mover nada hay que comprobar si el corte de Crumey cae dentro
o fuera de esa banda para cada una de las 12 filas. Con 450 mm a 158× la pupila
es 2,85 mm y `d0 ≈ 1,4 mm`: queda fuera, no afectaría. Con equipos de más
aumento, sí.

**Recomendación honesta:** P2a **no se aplica sin prerregistro y sin P1 antes**.
El ADR 0010 fijó el 27 con su propio razonamiento (el suelo de detección del ojo),
y aunque Crumey documenta 25,08 con fuente primaria, son dos cantidades que el
repo usa como si fueran una: el suelo de detección del ojo y el fondo
efectivamente nulo **no tienen por qué ser el mismo número**. Esa confusión hay
que resolverla antes de mover la constante, y puede que la respuesta sea que
`:205` (pintado) y `:757` (límite) deben llevar valores distintos.

### P3 · Documentar la deriva de pendiente, no corregirla — valor MEDIO, coste bajo, riesgo CERO

**Qué tocar.** El comentario de `FOT.C_EXP` en
`resources/js/bitacora-gaia-render.js:119`, más este documento como referencia.
**No el valor.**

**Qué dice.** Que 0,35 no es la pendiente de la meseta según la fuente primaria
(−0,289) ni la de la rama puntual (−0,616), y que la consecuencia medida es que
el factor de campo implícito deriva de 1,60 a 2,30 entre SBe 19 y 25 cuando por
construcción debería ser constante.

**Por qué NO corregirlo.** Tres razones, y las tres son duras:

1. `C_MIN` y `C_EXP` forman un par: fijaron `C_MIN = 0,08` **como anclaje a
   SBe 21** (`K = 2,005`). Cambiar `C_EXP` sin re-anclar `C_MIN` mueve el nivel
   en todos los cielos, y re-anclar es re-calibrar, que es lo que el ADR 0001:37
   prohíbe («H2c queda congelada»).
2. La deriva es **invisible en el rango calibrado**: las 12 observaciones caben
   en menos de 1 mag de SBe. Corregir ahí es cambiar algo que el campo no puede
   arbitrar.
3. La nota de memoria *«Listón contra la ley vieja: solo veredictos»* aplica al
   revés aquí: ajustar `C_EXP` para parecerse a Crumey sería medir parecido con
   una ley de laboratorio, no corrección contra el cielo. El anclaje del repo es
   observación real en ocular; el de Crumey es Taylor 1960b, del que el propio
   Crumey dice que «los datos son menos robustos».

**Lo que sí queda falsable, para el futuro:** si alguna vez hay observaciones de
campo con un rango amplio de SBe (equipos muy distintos, o cielos de 19 a 22), la
predicción de Crumey es que el desajuste de H2c crecerá sistemáticamente con el
fondo, en el sentido de que el repo será **demasiado estricto en cielo malo y
demasiado laxo en cielo bueno**. Esa es la medida que decidiría.

### P4 · Corrección de umbral por índice de color — valor BAJO-MEDIO, coste bajo, riesgo bajo

**Qué tocar.** `magLimite` (`:741`) aceptaría un `bprp` opcional y aplicaría
Crumey Ec. 18: `Δm = 0,27·(c_ref − c)`, con `c` el B−V. Como el catálogo trae
BP−RP y no B−V, haría falta la conversión, que no está en Crumey.

**Qué mediría/falsaría.** Que una carbonada roja y una B azul de la misma G no
se detecten igual. Efecto máximo real ~0,5 mag entre extremos del catálogo.

**Riesgo.** Bajo en magnitud, pero toca `magLimite`, o sea el censo, o sea todo.
Y hay un riesgo conceptual que Crumey señala: la corrección se aplica al objeto,
**no al fondo**, porque el cielo no es cuerpo negro. Si alguien la aplicara a
`sqm` estaría repitiendo el error que Crumey le atribuye a Schaefer.

**Por qué no es urgente.** El repo ya está +0,21 a +0,70 mag por encima de
Schaefer y ~1,3 mag por encima de Crumey; meter una corrección de ±0,25 mag
dentro de un sesgo de 1,3 mag es pulir un número que está mal por otra razón. Si
se hace algo aquí, se hace después de P1 y P2.

### P5 · Lo que NO hay que hacer

**No implementar la tabla de Crumey ni la Ec. 47 como ley de producción, ni como
modo apagado.** El ADR 0001:10 ya lo decidió y este análisis lo **confirma con
números** en vez de con argumento: la Ec. 47 y H2c tienen las mismas asíntotas,
su θ_R coincide al 3 % en el cielo oscuro típico y su nivel absoluto coincide en
F ≈ 2 por dos caminos independientes. Sustituir una por otra cambiaría 0,25 mag
en el codo y rompería el anclaje de 12 observaciones a cambio de nada.

**No usar los valores de Crumey como listón de corrección para H2c**, solo como
banco de veredictos. Es la regla general que dejó el ADR 0023 en su cierre: «un
listón que compara la ley nueva contra la ley que se está sustituyendo solo puede
vigilar VEREDICTOS (regresión), nunca VALORES (corrección)». Aquí la asimetría es
la contraria —Crumey no es la ley vieja, es literatura— pero el criterio de
`ADR 0001:16` decide igual: «una ley calibrada en campo con el instrumento de
medida real domina a una ley trasplantada de la literatura».

**No tocar la rampa de `ps1Opacidad`** (`bitacora-ps1.js:1090`) apoyándose en
Crumey. Su modelo dice si un objeto uniforme se ve o no; no dice cómo se
desvanece un píxel de un brazo espiral. El `deltaPlena = 2,5` está medido en
`barrido_deltaplena.js` y Crumey no ofrece nada mejor.

**No tocar nada del grano SBF ni de la textura.** §3.3a: Crumey es ley de mancha,
el ADR 0015 ya eligió Rovamo para lo otro, y este paper no aporta ni un dato.

---

## Conclusión

Crumey 2014 es, para este repo, **una corroboración externa mucho más que una
corrección**. La ley H2c —forma, escala de Riccò, tratamiento del telescopio y
nivel absoluto— coincide con el modelo primario dentro de 0,25 mag en el codo,
3 % en θ_R y un factor de campo idéntico. Dos derivaciones independientes de los
datos de Blackwell que convergen es la mejor evidencia disponible de que la
decisión del ADR 0001 fue correcta.

Lo que el paper sí aporta es **el hueco que el repo ya tenía apuntado**: no hay
máximo de aumento útil en `magLimite`, y Crumey lo da en forma cerrada con dos
mecanismos (corte de fondo cero, Ecs. 70–73; penalización por disco no puntual,
Ec. 88). Ese es el único cambio de producción que vale la pena considerar, y no
está en la ley de umbral sino en la magnitud límite.

El orden es: **P1 (medir) → decidir si P2 (aumento útil) merece prerregistro →
P3 (documentar, no corregir) → P4 solo si sobra tiempo.** Y P5 es la lista de lo
que no se toca.
