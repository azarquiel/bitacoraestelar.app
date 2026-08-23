# ¿Existe una ley de detección de TEXTURA distinta de la ley de mancha?

**Pregunta.** El grano de M13 (N_ef = 0,41 por beam, RMS 88–340 % del fondo) queda
24–34× bajo el umbral cuando se le aplica la ley de mancha uniforme (Cmin +
Riccò), con cualquier escala de integración entre 0,6″ y 100″. ¿Publica la
literatura primaria un umbral para «¿este campo está moteado o es liso?» distinto
del umbral de parche uniforme sobre fondo? ¿En qué forma, y qué predice a
luminancias escotópicas?

**Método.** Investigación bibliográfica pura: búsqueda web + verificación de
abstracts (PubMed E-utilities para los papers de visión; páginas primarias para
el resto). Ningún código, ninguna re-derivación del contexto medido. Cada
afirmación lleva su fuente; lo no revisado por pares va marcado **[web/amateur]**.

## Respuesta corta

**NO existe una «ley de textura» cerrada y tabulada con nuestras entradas**
(RMS del grano, escala angular en cielo, aumentos, brillo de fondo, pupila de
salida) a luminancias escotópicas. Nadie ha medido umbrales de moteado para
campos granulares a niveles de cielo nocturno.

**SÍ existe el marco que la sustituye**, y es cuantitativo: la detección de
estructura no uniforme no se modela con UNA escala de integración tipo Riccò,
sino con **filtrado por la CSF (banco de canales de frecuencia espacial) +
detector tipo filtro adaptado + regla de suma sobre canales/posiciones**. Ese
marco (Rovamo–Näsänen–Barten) tiene forma cerrada, sus entradas son mapeables a
las nuestras, y **predice dependencia del aumento**: el grano clavado al cielo a
~1″ cambia de frecuencia retiniana con M, y solo entra en la banda visible de la
CSF escotópica a aumentos altos. La ley de mancha es ciega a eso por
construcción.

---

## 1. Detección de ruido/textura vs detección de parche

### 1.1 El detector no es una escala de integración: es un filtro adaptado tras la CSF

Rovamo, Luntinen & Näsänen (1993), *Modelling the dependence of contrast
sensitivity on grating area and spatial frequency*, Vision Research 33,
2773–2788 (DOI 10.1016/0042-6989(93)90235-o). Modelo verificado sobre el 95 %
de la varianza de sus datos: (i) filtro paso-bajo óptico (MTF del ojo),
(ii) filtro paso-alto neural (inhibición lateral), (iii) ruido neural interno,
(iv) **detección por filtro adaptado local** cuya eficiencia cae con el área.
La sumación espacial que emerge es Piper (∝√A) hasta un área crítica que
**depende de la frecuencia espacial** (constante a bajas f, ∝1/f² a medias y
altas): no hay UN θ_R, hay uno por canal. Esto ya rompe el supuesto de nuestra
ley: aplicar un único θ_R a un estímulo de banda ancha (grano) es usar el canal
equivocado para casi toda la energía.

### 1.2 Con ruido/grano dominante, el umbral es una razón señal/ruido física, no un Cmin

Rovamo, Kukkonen, Tiippana & Näsänen (1993), *Effects of luminance and exposure
time on contrast sensitivity in spatial noise*, Vision Research 33, 1123–1129
(DOI 10.1016/0042-6989(93)90246-s). Resultado central (abstract verificado):
cuando el ruido espacial externo domina, la sensibilidad **se vuelve
independiente de la iluminancia retiniana y del tiempo de exposición**, y los
datos «prueban la hipótesis de que en el mecanismo de detección humano la razón
señal/ruido es constante en el umbral». Es decir: en régimen limitado por grano
(nuestro caso, si el grano supera el ruido interno) la variable correcta es
d′ = energía de señal / densidad espectral de ruido, no un contraste umbral de
mancha.

### 1.3 La invariancia con la distancia de observación (= con el aumento)

Rovamo, Franssila & Näsänen (1992), *Contrast sensitivity as a function of
spatial frequency, viewing distance and eccentricity with and without spatial
noise*, Vision Research 32, 631–637 (DOI 10.1016/0042-6989(92)90179-m).
Abstract verificado: **en ruido espacial la sensibilidad es independiente de la
distancia de observación** mientras el ruido externo domine; sin ruido externo
no lo es (manda la CSF a la frecuencia retiniana). Traducción directa al ocular:

- Mientras el grano proyectado sea **sub-umbral para la CSF retiniana** (ruido
  interno domina), la visibilidad depende del aumento vía la CSF.
- Cuando el grano ya domina, más aumento no cambia la detectabilidad (la SNR
  física está clavada al cielo).

**Predicción para nuestro campo de grano fijo a ~1″:** a M aumentos el grano
mide M·1″ en retina; su frecuencia característica es f ≈ 1800/M ciclos/grado
(medio ciclo por grano). A 61× → ~30 c/deg; a 250× → ~7 c/deg. Contra la CSF
escotópica (§2, corte a pocos c/deg) el grano a 61× está **fuera de la banda
visible** y va entrando en ella al subir M. El marco de canales predice, pues,
exactamente lo que reportan los observadores y lo que nuestra textura invariante
con aumento contradice. (Esta traducción es nuestra; los números de CSF y la
invariancia son de las fuentes citadas.)

### 1.4 Detección DEL ruido mismo

No hay paper de psicofísica escotópica con «umbral de moteado» como tal. Lo más
cercano, tres familias:

- **Rose (1948)**, *The sensitivity performance of the human eye on an absolute
  scale*, JOSA 38, 196–208 (DOI 10.1364/josa.38.000196): el ojo como detector
  limitado por fluctuaciones de fotones, con **SNR umbral k ≈ 5** y tiempo de
  integración ~0,2 s. Es literalmente un umbral sobre fluctuaciones granulares
  a baja luz, y la raíz de todo lo demás.
- **Burgess (1999)**, *The Rose model, revisited*, JOSA A 16, 633–646 (DOI
  10.1364/josaa.16.000633). Abstract verificado: el modelo de Rose es una buena
  aproximación al observador ideal bayesiano **solo en su rango estrecho de
  validez**, y «la SNR de píxel NO es una figura de mérito válida» — aviso
  directo contra comparar RMS por beam contra un umbral escalar, que es lo que
  hace hoy el harness.
- **Barten (1999)**, *Contrast Sensitivity of the Human Eye and Its Effects on
  Image Quality*, SPIE PM72 (DOI 10.1117/3.353254; formalización accesible en
  DICOM PS3.14 §A.2, dicom.nema.org). Cap. 2 «Modulation Threshold and Noise» y
  cap. sobre ruido espacial no blanco: la visibilidad del ruido se calcula
  integrando su densidad espectral **a través de la CSF** y comparándola con el
  ruido interno; el umbral del ruido de imagen (mottle de TV/radiología) sale de
  ahí en forma cerrada. Es la única «ley de visibilidad de ruido» publicada con
  fórmula, pero **calibrada a luminancias fotópicas de display**; su propia CSF
  lleva la dependencia de luminancia, no validada en escotópico profundo.

### 1.5 Discriminación de textura (Julesz, FRF)

La literatura de segregación de texturas (Julesz, textones; el modelo estándar
filtro-rectificación-filtro de Graham/Landy — revisión: Landy & Graham 2004,
*Visual perception of texture*, en *The Visual Neurosciences*, MIT Press) trata
la **discriminación entre dos texturas supraumbrales**, no la detección de
textura contra liso, y sus datos son fotópicos. **Cualitativa para nosotros**:
aporta la arquitectura (canales + no-linealidad + segunda etapa) pero ninguna
tabla utilizable con nuestras entradas.

## 2. CSF escotópica/mesópica

**Van Nes & Bouman (1967)**, *Spatial modulation transfer in the human eye*,
JOSA 57, 401–406 (DOI 10.1364/josa.57.000401). El banco clásico: umbral de
modulación vs frecuencia espacial a iluminancias retinianas desde escotópico
hasta 5900 td. Por debajo de ~300 td el umbral sigue **De Vries–Rose**
(∝1/√I); por encima, Weber. Al bajar la luminancia la CSF (i) pierde el pico
paso-banda y se hace paso-bajo, (ii) el pico se desplaza a frecuencias bajas
(~1–2 c/deg), (iii) el corte cae a pocos c/deg. La sensibilidad de pico varía
~8× por cada ~100× de iluminancia.

**Rovamo, Mustonen & Näsänen (1994)**, *Modelling contrast sensitivity as a
function of retinal illuminance and grating area*, Vision Research 34,
1301–1314 (DOI 10.1016/0042-6989(94)90204-6). Abstract verificado: extiende el
modelo de filtro adaptado a baja luz con **ruido cuantal dependiente de la
luz**; sensibilidad ∝√I bajo una iluminancia crítica que crece ∝f². Explica
91–99 % de la varianza. **Esta es la pieza que une CSF escotópica + grano +
detector en una sola forma cerrada**: nuestras entradas encajan (fondo → I vía
pupila de salida; escala del grano × aumento → f retiniana; RMS → densidad
espectral externa).

**Barten (1999)** (op. cit.) da la misma dependencia en fórmula analítica única
(la de DICOM); práctica pero, de nuevo, validada sobre todo en fotópico/mesópico.

## 3. Riccò/Blackwell para estímulos NO uniformes

**Blackwell (1946)**, *Contrast thresholds of the human eye*, JOSA 36, 624–643
(DOI 10.1364/josa.36.000624): TODOS los estímulos son discos uniformes sobre
fondo uniforme. La tabla no contiene ni un estímulo estructurado; aplicarla a
textura es extrapolación sin respaldo en la fuente.

**Barlow (1958)**, *Temporal and spatial summation in human vision at different
background intensities*, J. Physiol. 141, 337–350 (DOI
10.1113/jphysiol.1958.sp005978): el área de Riccò crece al bajar el fondo, y la
sumación completa solo vale **dentro** del área crítica; fuera, sumación
incompleta (Piper/Piéron). Riccò es la ley del canal más grande ante un estímulo
compacto, no una ley universal de integración.

**Rovamo et al. 1993/1994** (§1.1, §2) es donde la literatura dice explícitamente
por qué deja de aplicar: el área crítica depende de la frecuencia (∝1/f² a
frecuencias medias/altas). Un estímulo de banda ancha (grano) reparte su energía
entre canales con áreas críticas distintas; un único θ_R solo describe el canal
de continua — la mancha. **Medidas de umbral para estímulos texturados a
luminancia escotópica: no encontradas.** Ese hueco es real y hay que decirlo.

## 4. ¿RMS, pico, percentil o d′?

- **Quick (1974)**, *A vector-magnitude model of contrast detection*, Kybernetik
  16, 65–67 (DOI 10.1007/BF00271628): la respuesta del sistema es la norma
  Minkowski de las respuestas de los canales, R = (Σ|r_i|^β)^{1/β}.
- **Robson & Graham (1981)**, *Probability summation and regional variation in
  contrast sensitivity across the visual field*, Vision Research 21, 409–418
  (DOI 10.1016/0042-6989(81)90169-3): β ≈ 3,5–4 ajusta la sumación sobre
  posiciones y frecuencias. **Watson (1979)**, *Probability summation over
  time*, Vision Research 19, 515–522 (DOI 10.1016/0042-6989(79)90136-6): lo
  mismo en el tiempo.
- **Legge, Kersten & Burgess (1987)**, *Contrast discrimination in noise*,
  JOSA A 4, 391–404 (DOI 10.1364/josaa.4.000391): marco ruido
  interno/eficiencia de muestreo verificado también para discriminación.
- Observador ideal: **Geisler (1989)**, *Sequential ideal-observer analysis of
  visual discriminations*, Psychological Review 96, 267–314 (DOI
  10.1037/0033-295X.96.2.267).

**Consecuencia para nuestra distribución sesgada** (mediana −23…−50 %, p99
+800 %): con β ≈ 3,5–4 la suma Minkowski está **dominada por los picos**, no por
la mediana ni por el RMS simétrico. La literatura no usa «RMS contra umbral de
mancha»: usa energía filtrada por CSF → d′ del observador (Rose/Burgess), o suma
probabilística de canales (Quick/Robson-Graham), y ambas pesan la cola positiva.
Que la mediana sea negativa es irrelevante para la detección; los 10–12 % de
beams brillantes son los que suman. Burgess 1999 (§1.4) desaconseja
explícitamente el estadístico escalar por píxel.

## 5. Resolución visual de cúmulos globulares en el ocular

Peer-reviewed directo sobre «umbral de resolubilidad de globulares a ojo»:
**no existe**. Lo que hay:

- **Schaefer (1990)**, *Telescopic limiting magnitudes*, PASP 102, 212 (DOI
  10.1086/132629): magnitud límite estelar vs apertura/aumento/cielo; ya es
  nuestro banco (`maglimite_vs_schaefer.md`). Cubre la componente RESUELTA, no
  la textura.
- **Clark (1990)**, *Visual Astronomy of the Deep Sky*, Cambridge Univ. Press;
  método OMVA en clarkvision.com/visastro/omva1/ **[libro + web, no
  peer-reviewed]**: reinterpreta Blackwell 1946 como superficie umbral
  (contraste, tamaño, fondo) y define el «Optimum Magnified Visual Angle»; el
  óptimo es un mínimo poco profundo y recomienda llevar el objeto a ~100′
  aparentes. Es ley de mancha con aumento — útil para el velo, ciega al grano.
- **Nils Olof Carlin**, *About Blackwell's data on contrast detection
  thresholds* **[web amateur]**: misma base Blackwell, discusión de la
  «detección a contraste constante» al cambiar aumento; la polémica
  Clark/Carlin sobre el método quedó sin cierre (recogida en
  uv.es/jrtorres/visib.html, J. R. Torres, *On the Prediction of Visibility for
  Deep-Sky Objects* **[web amateur]**).
- **Mel Bartels**, bbastrodesigns.com (calculadora de visibilidad basada en
  Blackwell/Clark) **[web amateur]**: implementación, no datos nuevos.
- **Observadores (Cloudy Nights, Cosmic Pursuits, guías S&T)** **[foros/web
  amateur]**: consenso reiterado — la granulación de M13 con ~150–200 mm
  aparece «al borde de la resolución» y **mejora claramente al subir aumentos**,
  con regla práctica «~1× por mm de apertura» para el mejor cuadro
  (cosmicpursuits.com/2571/high-power-hercules/;
  cloudynights.com/topic/963903-resolving-globular-clusters/). El 90 % de las
  estrellas «solo intermitentes, con visión desviada». Cualitativo, pero es la
  evidencia observacional de la dependencia del aumento que el modelo actual no
  tiene.

## 6. SBF: el formalismo de la señal

**Tonry & Schneider (1988)**, *A new technique for measuring extragalactic
distances*, AJ 96, 807–815 (DOI 10.1086/114847): las fluctuaciones de brillo
superficial se cuantifican como **varianza/media de la luminosidad**; la
luminosidad de fluctuación L̄ es el cociente entre segundo y primer momento de
la función de luminosidad (L̄ = ⟨L²⟩/⟨L⟩). Nuestro N_ef = ⟨I⟩²/σ² es
exactamente el inverso normalizado de esa amplitud: señal SBF por beam =
1/N_ef. Revisión moderna del formalismo de medida: A&A 686, A81 (2024),
*Modelling of surface brightness fluctuation measurements* (DOI
10.1051/0004-6361/202347559). Todo esto es la SEÑAL; ningún paper SBF aporta
detector visual.

---

## Conclusión contra los criterios de utilidad

| Fuente | ¿Ley cerrada? | Entradas nuestras cubiertas | Luminancia |
|---|---|---|---|
| Rovamo/Mustonen/Näsänen 1994 + 1993×2 + 1992 | **Sí** (CSF+quantal+filtro adaptado) | RMS→densidad de ruido, escala×aumento→f, fondo→I, pupila vía I | **Escotópico–fotópico** |
| Barten 1999 (DICOM A.2) | Sí, analítica única | Las mismas, en una fórmula | Fotópico/mesópico (extrapola) |
| Rose 1948 / Burgess 1999 | Sí (d′, k≈5) | RMS y fondo; sin canales | Baja luz |
| Quick 1974 / Robson-Graham 1981 | Sí (regla de suma, β≈3,5) | El estadístico (picos, no RMS) | Fotópico |
| Blackwell 1946 / Clark / Carlin | Sí, pero **solo mancha** | Sin grano | Escotópico |
| Julesz / Landy-Graham | No (cualitativa) | Arquitectura | Fotópico |
| Cloudy Nights / S&T **[amateur]** | No | Dependencia del aumento (cualitativa) | Ocular real |

**La ley más utilizable** según los criterios es el modelo
Rovamo–Mustonen–Näsänen 1994 (con la invariancia de 1992 y la SNR constante de
1993): forma cerrada, todas nuestras entradas mapeables, validado hasta baja
iluminancia retiniana, y **predice la dependencia del aumento** que falta hoy.
Barten/DICOM es su formalización práctica si se acepta extrapolar la CSF. Lo que
NO da nadie: un umbral de moteado medido a cielo SQM 21 — cualquier ley que se
adopte quedará anclada en ese marco y deberá calibrarse contra observación,
como se hizo con H2c.
