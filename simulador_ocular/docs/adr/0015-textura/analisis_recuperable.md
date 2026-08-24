# Análisis post-mortem: qué falló en la ley de textura (#94→#99) y qué es recuperable

Fecha: 2026-08-24. Fuentes primarias: issues #94–#99 y PR #100
(`azarquiel/bitacoraestelar.app`), ADR 0015
(`simulador_ocular/docs/adr/0015-umbral-de-textura-para-el-grano-sbf.md`),
`simulador_ocular/docs/adr/0015-textura/prerregistro.md`,
`simulador_ocular/docs/adr/0015-textura/veredicto.md`,
`simulador_ocular/docs/experimentos/velo_granularidad.md`, `simulador_ocular/docs/experimentos/escala_grano.md`,
`simulador_ocular/docs/iteraciones/v8_bugfix_grano_sbf.md`,
`simulador_ocular/docs/referencias/deteccion_textura_bibliografia.md`, y el código de producción
(`resources/js/bitacora-gaia-render.js:1574-1758`, `scripts/calibrar_k_textura.js`,
`scripts/listones_umbral_textura.js`, `scripts/test_calibracion_k_veredicto.js`).
Ninguna afirmación nueva sin medida: la única medida nueva de este análisis es
la verificación numérica del §2.2 (reproducible con las funciones exportadas).

## Veredicto de este análisis, por delante

- **La ley de Quick tal como está escrita es irrecuperable en cualquier
  régimen de aumento**: no falla "por poco" en un extremo, falla con el signo
  invertido en todo el rango (§2). No hay ventana de aumentos donde cumpla los
  listones, ni a bajos ni a altos (§4).
- **La causa raíz es un defecto matemático de la CSF implementada, no del
  prerregistro ni del estadístico**: con la forma elegida, d′ ∝ 1/M
  exactamente — verificado numéricamente contra las funciones de producción
  (§2.2). La ganancia por frecuencia y la pérdida por pupila se cancelan
  algebraicamente y solo sobrevive la pérdida.
- **La transición nebuloso→moteado→resuelto que se quería reproducir no vive
  en el canal de textura SBF**: los propios datos del repo dicen desde v8 que
  «el halo granular que reportan los observadores son las estrellas
  resueltas» (`v8_bugfix_grano_sbf.md` §3, `simulador_ocular/CONTEXT.md:102`). La vía
  con respaldo de datos es el canal de estrellas resueltas
  (m_crowd/sumación espacial), no la textura (§5).
- **Sí hay piezas recuperables**, y dos de ellas ya rinden servicio sin
  encender nada (§3).

## 1. Qué se construyó y qué se midió (cifras exactas)

### 1.1 La cadena #94→#99

- **#94** (spec, ADR 0015): reproducir la transición nebuloso→moteado→resuelto
  del núcleo de globulares con una ley de umbral de textura: d′ de filtro
  adaptado con CSF escotópica (marco Rovamo/Van Nes & Bouman), salida
  psicométrica de Quick 1974 `P(ver) = 1 − exp(−(d′/K)^β)`, β = 3,5 fijo, K
  único parámetro libre.
- **#95** (prerregistro, `prerregistro.md`): ancla única
  (M13, 200 mm, SQM 21, primera rotura del núcleo a 120×) y listones P1
  (61× liso: P < 0,05 en los 4 anillos), P2 (núcleo creciente
  120× < 173× < 250×), P3 (halo N_ef ≈ 0,07 a 250×: P < 0,10), banco del 18″
  (M55, M22, M30 rompen; M62 NO rompe a ningún aumento). Vía de escape única:
  estadístico Minkowski.
- **#96**: generador de grano sin estructura de malla (test de autocorrelación,
  media ~0 y RMS por anillo conservados, determinista por semilla).
- **#97**: ley enchufada en la tabla radial (`tablaCumulo`,
  `bitacora-gaia-render.js:1745-1752`), producción apagada
  (`TEXTURA.ACTIVO = false`, render bit a bit idéntico).
- **#98**: conservación de flujo con grano forzado (renormalización por
  anillo; sin ella el recorte a cero regalaba +2–7 % de luz, 50–70 % de
  píxeles a negro — `experimento_sgrano.md`).
- **#99** (cerrado, PR #100): calibración de K y veredicto negativo.

### 1.2 Las medidas del veredicto (`veredicto.md`)

K anclado haciendo que el exponente de Quick valga 1 en el ancla
(P(ancla) = 1 − e⁻¹ = 0,632 por construcción):

| Estadístico | K | P1 (61×, 4 anillos; listón < 0,05) | P2 núcleo 120/173/250× (listón creciente) | P3 halo 250× (< 0,10) | Banco 18″ |
|---|---|---|---|---|---|
| Energía | 8,245813·10⁻² | [0,9995; 0,9965; 0,8886; 0,6514] **FALLA** | [0,632; 0,252; 0,091] **decrece, FALLA** | 0,012 ok | solo M22 pasa, **FALLA** |
| Minkowski | 2,547573·10⁻¹ | [1; 1; 1; 1] **FALLA** | [0,632; 0,215; 0,069] **decrece, FALLA** | 0,544 **FALLA** | solo M22 pasa, **FALLA** |

Banco del 18″ con energía: M55/70× = 1,00 (esperado 0,3–0,7);
M55/480× = 0,059 (esperado > 0,7); M30/98× = 1,00 (esperado 0,3–0,7);
M62/70–270× ≈ 1,00 (esperado < 0,3, el caso "no rompe"). Es decir: **la ley
predice todo roto a bajo aumento y todo liso a alto** — la observación exacta
al revés.

### 1.3 El contexto de medidas previas que la ley heredaba

- El grano existe y es grande: N_ef = 0,41 estrellas/beam en el núcleo de M13
  a 61×, RMS δI/fondo del 88 % al 340 %, p99 hasta +800 %
  (`velo_granularidad.md`).
- Juzgado como mancha (Cmin/Riccò), el grano queda ×24–×34 bajo umbral y
  ninguna escala de integración entre 0,6″ y 100″ pasa de razón 0,042; el
  máximo del barrido además **baja** con el aumento (0,042 a 61× → 0,030 a
  250×) (`escala_grano.md`).
- Para el catálogo entero (143 globulares × 40 equipos): mejor caso 0,154
  contra el 0,398 que necesita `visibilidadDifusa` — falta un factor 2,6, y
  plano entre cúmulos (0,11–0,15): lo fija la ley, no el objeto
  (`v8_bugfix_grano_sbf.md` §3). Nota: ese barrido es de
  **globulares** (mejor caso NGC 6121/M4); la memoria del proyecto lo archivó
  como "grano SBF de galaxias", pero el veredicto "invisible como mancha" es
  del canal de cúmulos.

## 2. Diagnóstico: por qué la ley invierte el sentido con el aumento

### 2.1 Lo que dice el veredicto oficial

`veredicto.md` §4: dos fallos de naturaleza distinta.
(a) P1/banco saturan cerca de 1 a 61–98× porque la amplitud (RMS 88–340 %)
tras la ganancia CSF dispara el exponente de Quick con cualquier estadístico;
(b) P2 invertido porque en d′ compiten frecuencia retiniana (baja con M,
favorable) e iluminancia retiniana (baja con M por pupila de salida D/M,
desfavorable), y gana la segunda. Diagnóstico oficial: fallo estructural del
acoplamiento CSF–pupila, no del estadístico — Minkowski multiplica la misma
ganancia CSF y no puede invertir el signo (lo confirma la medida: P2 sigue
decreciente y P1/P3 empeoran).

### 2.2 La causa raíz exacta: la cancelación es algebraica, no un balance de efectos

El veredicto lo describe como "el segundo efecto domina". Es más fuerte que
eso: **con la forma implementada, la dependencia favorable desaparece
exactamente y d′ ∝ 1/M por construcción**. En
`bitacora-gaia-render.js:1614-1639`:

```
f  = 1800/(θ_grano·M)                    (frecuenciaGranoCdeg)
I  = fondo · pupila²,  pupila = D/M  →  √I ∝ D/M
fc = FC0·√(I/I0)                     →  fc ∝ 1/M
d′ = rms · S0·√(I/I0) · exp(−f/fc)
```

Como f y fc escalan ambos como 1/M, **f/fc es independiente de M**: el término
exponencial —el único por el que "el grano entra en banda al subir el aumento"
(la predicción de la bibliografía §1.3: 30 c/deg a 61× → 7 c/deg a 250×)— es
constante con el aumento. Queda solo el prefactor √I ∝ 1/M. Verificado
numéricamente contra las funciones exportadas de producción
(`R.dPrimeTextura`, rms y fondo fijos, pupila = 200/M): d′·M =
1,0832·10⁻⁸ idéntico a 61×, 120×, 173× y 250× — constante hasta el último
dígito. La medida real de P2 lo confirma: entre 120× y 250× el cociente de d′
implicado por Quick es 0,511, contra 120/250 = 0,48 (el resto lo pone la
atenuación de parche, que crece suavemente con M).

Es decir: la inversión no depende de K, ni del estadístico, ni del ancla, ni
del cúmulo. Está en la elección de que la frecuencia de corte de la CSF escale
como √I (De Vries–Rose puro, Van Nes & Bouman) **con la iluminancia acoplada a
la pupila de salida** — al meter las dos leyes con el mismo exponente en M, el
mecanismo que debía producir la transición se autoanula. Ninguna calibración
de un escalar K puede arreglar una derivada de signo equivocado.

### 2.3 ¿Y era evitable? El aviso estaba en la propia bibliografía

`deteccion_textura_bibliografia.md` §1.2 (Rovamo et al. 1993, DOI
10.1016/0042-6989(93)90246-s): **cuando el ruido espacial externo domina, la
sensibilidad se vuelve independiente de la iluminancia retiniana** (SNR
constante en el umbral). Con RMS del grano al 88–340 % del fondo, este
estímulo está de lleno en régimen dominado por ruido externo — y la ley
implementada usó la rama contraria (sensibilidad ∝ √I, régimen de ruido
interno/cuantal). La misma fuente (§1.3) avisa de la otra cara: con ruido
externo dominante la detectabilidad es invariante con la distancia/aumento —
que es exactamente lo que ya había medido el experimento sGrano ("textura
invariante con el aumento", ADR 0015, preámbulo). En otras palabras: la
literatura elegida predecía que, para ESTE estímulo, ni la CSF-√I ni el
aumento vía iluminancia eran el mecanismo; la transición observada tenía que
venir de otro canal. La medida de #99 no descubrió un fallo raro: confirmó la
rama de la literatura que el diseño no tomó.

### 2.4 ¿Y el fallo de P1 (todo roto a bajo aumento)?

Consecuencia del mismo d′ ∝ 1/M más la amplitud enorme: si el ancla fija
d′/K = 1 a 120×, a 61× d′ es ~2× mayor y además el RMS del anillo es más alto
(143 % contra 114 % en el núcleo, `velo_granularidad.md`), así que
(d′/K)^3,5 ≈ 8–30 y P satura. Con β = 3,5 la psicométrica es tan empinada que
cualquier ley monótona-decreciente en M anclada en el centro del barrido
satura por abajo y muere por arriba. No es un problema de K: es la misma
derivada invertida vista desde el otro extremo.

### 2.5 ¿Es además físicamente genuino que el grano no se vea?

Sí, en el sentido de mancha/energía: el barrido exhaustivo de
`escala_grano.md` (ley Cmin a todas las escalas) deja el grano a ×24–×34 del
umbral en TODO el rango 61–250×, y con máximo decreciente con M. Y
`v8_bugfix_grano_sbf.md` §3 da la explicación estructural: el modelo
resuelve precisamente las estrellas que producirían el grano
(`m_res = min(m_crowd, m_lim,sky)`); solo ~1 de cada 600 beams contiene una
estrella no resuelta cerca del límite. La percepción real de "moteado" del
observador no es la fluctuación SBF del campo no resuelto: son las estrellas
resueltas (f_res sube del 3 % al 28 % del centro al borde ya con 100 mm). La
ley de textura buscaba el fenómeno en el canal equivocado.

## 3. Qué es recuperable (independiente del veredicto)

Todo lo siguiente está en `main` (PR #100 mergeada) y no depende de que
`TEXTURA.ACTIVO` vuelva a encenderse jamás:

1. **Generador de grano sin malla (#96).** Es el generador con el que se pinta
   el campo SBF cuando `sGrano > 0` por el camino de producción
   (`visibilidadGrano`), y el que usan los arneses. Independiente de la ley de
   umbral. Si algún día el canal de estrellas resueltas pinta "moteado"
   sub-resuelto (§5), este generador es la pieza de dibujo ya validada
   (autocorrelación sin estructura direccional/anular, momentos conservados,
   determinista).
2. **Conservación de flujo por anillo (#98).** Invariante duro bajo ADR 0003,
   probado con grano forzado a 61–250× y con anti-vacuidad (el test falla si
   se desactiva y reaparece el +2–7 %). Vale para CUALQUIER textura futura
   sobre el perfil, venga de la ley que venga. Es además el mismo patrón
   (recorte a cero → renormalización) que reaparecería si el render de
   difusas PS1 añadiera ruido sobre perfil.
3. **El arnés de listones + calibración (#95, #99).**
   `listones_umbral_textura.js` evalúa listones para un K dado importando la
   ley de producción (ADR 0008) y `calibrar_k_textura.js` ancla K sin segunda
   elección. El banco de casos (M13 propio + 18″: M55/M22/M30/M62 con el caso
   "no rompe") es un banco de **resolubilidad observada de globulares** que no
   depende de la ley de Quick: sirve tal cual como banco de aceptación para la
   vía del §5 (m_crowd/sumación), que es donde de verdad hará falta.
4. **El test-candado (`test_calibracion_k_veredicto.js`).** Fija K de energía
   y Minkowski a 4 cifras y que ambos siguen falsando; reabrir exige romperlo
   con medida. Mismo patrón que ADR 0012 (ejes de Gaia): el patrón en sí es
   reutilizable para cualquier veredicto negativo futuro.
5. **La bibliografía (`deteccion_textura_bibliografia.md`).** Contiene ya
   identificada la pieza para la vía alternativa: la sumación de probabilidad
   espacial (Robson & Graham 1981) que `v8_bugfix_grano_sbf.md` §3
   señala como candidato no implementado con el factor exacto que falta.
6. **`pVerTexturaMinkowski` y `TEXTURA.ESTADISTICO`** quedan como registro
   reproducible exigido por el §5 del prerregistro; no tienen otro uso. No
   borrar (los referencia el candado), pero tampoco contar con ellos.

Lo NO recuperable: `csfTextura`/`dPrimeTextura`/`pVerTextura` como modelo de
la transición. La forma es la rama equivocada de la literatura para este
estímulo (§2.3) y su derivada en M es estructuralmente la contraria (§2.2).

## 4. Regímenes parciales: no viables, con las cifras

- **¿Textura solo a bajos aumentos?** Es lo único que la ley "predice" (P≈1 a
  61×), pero es exactamente lo que la observación niega: el listón P1 existe
  porque M13 a 61× se ve liso (observación propia del prerregistro), y el
  banco 18″ da M62 ≈ 1,00 donde el observador nunca lo vio romper. Encender la
  ley a bajos aumentos pintaría moteado justo donde no lo hay. Un P alto que
  contradice la observación no es un régimen válido: es el fallo mismo.
- **¿Textura solo a altos aumentos?** Ahí la ley da P → 0 (0,091 a 250× en el
  núcleo; M55/480× = 0,059 donde el observador ve el núcleo "con muchísimo
  detalle"). No hay nada que encender: el canal está apagado por sí solo
  donde debería estar vivo.
- **¿Alguna ventana intermedia?** P(ver) es monótona decreciente con M en
  todo el barrido (d′ ∝ 1/M, §2.2) y la observación pide monótona creciente.
  Dos monótonas de signo contrario solo se cruzan en el punto de anclaje
  (120×, P = 0,632 por construcción): la "ventana" donde la ley acierta es un
  punto de medida cero, y acierta ahí porque se le obligó.
- **¿Bajar el listón y encender "un poco"?** Prohibido por diseño (ADR 0004:
  ningún parámetro estético; prerregistro §5: no se retocan listones), y
  además inútil: cualquier ganancia visual con la derivada invertida se
  comporta al revés al cambiar de ocular, que es la interacción central del
  simulador.

Conclusión: **callejón sin salida para la ley tal cual, en todo el rango**.
No es un problema de dónde cortar sino de que la función corta al revés.

## 5. La vía alternativa que señalan los propios datos

Los datos del repo apuntan todos al mismo sitio, y no es la textura:

1. **El fenómeno es resolución, no detección de ruido.**
   `v8_bugfix_grano_sbf.md` §3 y `simulador_ocular/CONTEXT.md:102`: el halo granular
   reportado son las estrellas resueltas; la frontera de resolución responde a
   la apertura (1,86 → 0,99 r_h de 200 a 400 mm) pero dentro manda `m_crowd`.
2. **m_crowd es hoy ciego al aumento.** Memoria del proyecto
   ("el crowding está inerte: manda el velo": P_solo = m_lim,sky salvo 6 de
   554 casos). La transición 61×→120×→250× que el observador reporta es, en el
   modelo actual, invisible porque el canal que debería producirla no depende
   de M.
3. **El candidato ya está identificado, con el factor que falta medido.**
   `v8_bugfix_grano_sbf.md` §3, último párrafo: la sumación de
   probabilidad espacial (umbral de patrón repetido ∝ N_ind^(−1/4), Robson &
   Graham 1981) "daría de sobra el factor 2,6 que falta" (0,154 → 0,398). Se
   dejó sin implementar a propósito por ser iteración aparte con su medida
   delante — no porque estuviera descartado.
4. **El banco de aceptación para esa iteración ya existe** y es reutilizable
   sin tocar nada: los listones del 18″ + M13 (§3 de este informe), que son
   veredictos de resolubilidad, no de textura.

Propuesta concreta (si se abre esa iteración, con su propio prerregistro):
hacer que la rotura del núcleo salga del canal de estrellas
resueltas/casi-resueltas —m_crowd sensible al aumento vía la escala
`fwhmAs·M` en retina (el modelo de resolución de dobles ya existe y su ancla
es 0,50, memoria "fwhmAs no es una FWHM"), más la sumación espacial
N^(1/4) como única constante nueva de literatura— y usar el generador #96 +
conservación #98 solo como forma de PINTAR las estrellas de la banda de
transición, no como canal perceptual propio. Eso ataca el fenómeno donde las
medidas dicen que vive, con las piezas ya construidas.

## 6. Recomendación final

1. **No reabrir la ley de Quick/CSF-√I en ninguna variante de régimen
   parcial.** El candado (`test_calibracion_k_veredicto.js`) está bien puesto;
   este análisis añade que la causa es una cancelación algebraica (d′ ∝ 1/M,
   §2.2), así que tampoco merece la pena una "recalibración" futura de FC0/I0
   dentro de la misma forma: cualquier fc ∝ √I reproduce la cancelación.
2. **Conservar sin tocar** generador (#96), conservación (#98), arnés de
   listones y candado: coste cero, ya en la suite (291 asserts, 0 vacuos).
3. **La siguiente iteración con expectativa real es la del §5**: crowding
   sensible al aumento + sumación espacial N^(1/4), prerregistrada contra el
   mismo banco M13 + 18″. Es la única vía que (a) los datos del repo señalan,
   (b) tiene el factor que falta ya medido (2,6) y (c) reutiliza lo
   construido en #94→#98.
4. Si alguna vez se retoma una ley de textura perceptual, el punto de partida
   obligado es la rama de ruido-externo-dominante de Rovamo 1993 (SNR física
   constante, sin dependencia de iluminancia) — que predice invariancia con M
   y por tanto, por sí sola, tampoco produce la transición. Razón de más para
   el punto 3.
