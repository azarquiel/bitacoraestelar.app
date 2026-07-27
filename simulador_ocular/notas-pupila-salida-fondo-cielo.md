# Notas: pupila de salida, aclarado del fondo de cielo y nebulosas oscuras

Notas de investigación para el simulador de ocular. Responden a dos dudas concretas:
(1) si el simulador **aclara/oscurece bien el fondo de cielo** cuando la pupila de
salida `d_ep` y la del ojo `d_eye` divergen, y (2) por qué las **nebulosas oscuras
(Barnard)** no destacan ni siquiera en cielo prístino (SQM 22). Cada afirmación va
citada: `fichero:línea` para el código, obra/URL para la física. Misma convención que
[`notas-resolucion-dobles.md`](notas-resolucion-dobles.md).

---

## Resumen ejecutivo

1. **Aclarado del fondo (duda 1): el simulador YA lo hace bien.** El clamp
   `min(1, (d_ep/d_eye)²)` está presente y es consistente en las tres rutas
   (lectura, fondo del Canvas 2D y motor fotométrico). Cuando `d_ep > d_eye` el fondo
   **no** sigue aclarándose (se satura al brillo de ojo desnudo); cuando `d_ep < d_eye`
   se oscurece. Ambas direcciones son físicamente correctas y coinciden con la teoría
   estándar de brillo superficial. Solo faltan dos matices **menores**: no multiplica
   por la transmisión `T` en el brillo del fondo, y no recorta la apertura efectiva de
   las **estrellas** cuando `d_ep > d_eye`.

2. **Nebulosas oscuras (duda 2): es mitad limitación del simulador, mitad física real.**
   - *Limitación real*: el pipeline de imagen **solo suma luz** sobre un fondo gris
     uniforme (`salida = nivelFondo + incremento`, con incremento ≥ 0). No existe
     ninguna capa de **extinción**: nada puede pintarse más oscuro que el fondo. No hay
     ningún tratamiento de contraste para siluetas oscuras (confirmado por búsqueda: 0
     coincidencias de `barnard|oscura|extinc|silueta` en el render).
   - *Física real*: una nebulosa oscura se ve por **contraste con un fondo brillante**
     (nubes de la Vía Láctea o nebulosa en emisión que tiene detrás), **no** por lo
     oscuro que sea el cielo. Con SQM 22 el fondo en pantalla ya es casi negro
     (`nivelFondo ≈ 21/255`): si en el campo **no** hay un fondo brillante detrás, la
     nebulosa oscura **debe** ser casi invisible. Eso es correcto, no un bug.
   - El honesto: hay que **renderizar el fondo difuso brillante** (la Vía Láctea / la
     nebulosa de fondo) y pintar la nube oscura como **reducción** de esa luz, no como
     "luz negativa". Así aparecerá donde físicamente debe (contra fondo brillante) y
     seguirá lavándose con contaminación lumínica o a mucho aumento.

---

## Qué hace hoy el simulador (con líneas de código)

### 1. Brillo superficial y fondo de cielo en función de la pupila

El brillo relativo de una superficie extensa es `B_rel = (d_ep/d_eye)²` **acotado a 1**
mediante `pEf = min(pupila, pOjo)`. Aparece idéntico en cuatro sitios:

- **Lectura "Brillo superficial"** — `bitacora-ocular.js:395-397`:
  ```js
  var pEf = Math.min(d.pupila, pOjo);
  var brillo = Math.pow(pEf / pOjo, 2);   // = min(1, (d_ep/d_eye)²)
  ```
- **Lectura "Fondo en ocular"** (SBe, mag/arcsec²) — `bitacora-ocular.js:398`:
  `sqm + 5*log10(pOjo/pEf)`, que es exactamente `sqm − 2.5*log10(min(1,(d_ep/d_eye)²))`.
- **Fondo del Canvas 2D** — `nivelFondoCielo()`, `bitacora-ocular.js:464-471`:
  ```js
  var pEf = Math.min(pupila, pOjo);
  var dim = Math.pow(pEf / pOjo, 2);
  return Math.round(nivelCielo(sqm - 2.5 * Math.log10(dim)));
  ```
  (réplica en el módulo compartido `bitacora-gaia-render.js:78-83`, `nivelFondo()`.)
- **Motor fotométrico píxel a píxel** — `procesarFotometrico()`, `bitacora-ocular.js:532,539`:
  ```js
  var pEf = Math.min(p, pOjo); var dim = Math.pow(pEf / pOjo, 2);
  var nivelFondo = nivelCielo(sqm - 2.5 * Math.log10(dim));
  ```

La curva gris del fondo es lineal en magnitudes entre `SB_CIELO_NEGRO=22.5` (negro) y
`SB_CIELO_BLANCO=16.5` (blanco) — `FOT`, `bitacora-ocular.js:165`; `nivelCielo()`,
`bitacora-ocular.js:169-172`.

**Consecuencia del clamp** (lo que responde la duda 1):
- `d_ep < d_eye` (más aumento): `dim<1` → `SBe>sqm` → fondo más **oscuro**. ✔
- `d_ep > d_eye` (poco aumento): `pEf=pOjo` → `dim=1` → `SBe=sqm` → fondo al **máximo**
  brillo (el de ojo desnudo) y **constante**; no sigue aclarándose. ✔

### 2. Transmisión T

`TRANSMISION_TELE=0.8` por defecto y `TRANSMISION_OPTICA` por tipo óptico
(`bitacora-ocular.js:90,103-114`). **Solo entra en la magnitud límite**
(`magLimiteTelescopio()`, vía `D·√t` y `2.5*log10(D²·t)`, `bitacora-ocular.js:354-356`).
**No** interviene en el brillo del fondo ni en la lectura de brillo superficial.

### 3. Magnitud límite

Método del umbral de Torres Lapasió — `magLimiteTelescopio()`, `bitacora-ocular.js:341-357`
(réplica `bitacora-gaia-render.js:86-94`):
```
SB0T = SQM + 5*log10(7.5*MAG / (D*√t))     acotado a [SQM, 27]
TLM  = −22.81 + 1.792*SB0T − 0.02949*SB0T² + 2.5*log10(D²*t)
```
Usa **siempre la apertura completa `D²`**. Cuando `d_ep > d_eye` el ojo recorta el haz y
la apertura *efectiva* baja, pero el código no lo refleja (ver diagnóstico).

### 4. Nebulosas oscuras / contraste

**No existe.** El pipeline de imagen (`procesarFotometrico`, `bitacora-ocular.js:529-551`)
compone así cada píxel (`:545`):
```js
salida[i] = nivelFondo + 255 * 2.5 * Math.log10(1 + (Fobj*s)/Fcielo) / rango;
```
Con `Fobj ≥ 0` y `s ≥ 0`, el término logarítmico es **siempre ≥ 0**: `salida[i] ≥ nivelFondo`.
Ningún píxel puede quedar **más oscuro que el fondo**. En el Canvas 2D es aún más
tajante: se rellena todo con un gris uniforme y solo se dibujan estrellas de Gaia encima
(`renderGaia2D`, `bitacora-ocular.js:485-500`); no hay ninguna capa difusa. Búsqueda
`grep -niE 'barnard|oscura|dark neb|extinc|silueta'` en el render → 0 coincidencias.

---

## Modelo físico validado (fuentes primarias)

### A. Pupila de salida ↔ brillo superficial (BIEN establecido)

El brillo superficial de un objeto extenso a través del telescopio, relativo a ojo
desnudo, es `(d_ep/d_eye)²`, y **alcanza su máximo —el de ojo desnudo— cuando
`d_ep = d_eye`, sin poder superarlo nunca**. Es el modelo del usuario, y es correcto:

- *Telescope Equations — Surface Brightness* (derivación limpia, hospedada en
  milwaukeeastro.org): "the very brightest image I can get with the scope is exactly the
  same brightness that I see with the naked eye"; "the surface brightness never exceeds
  what you can see with your eye alone"; el SB escala con el **cuadrado** de la pupila de
  salida. → https://milwaukeeastro.org/Stargazing/Telescope/SurfaceBrightness.html
- *Astronomics — Exit Pupils*: "The brightness of extended objects … is proportional to
  the square of the exit pupil"; dos telescopios con la misma pupila de salida dan el
  mismo brillo superficial de cielo y objeto. → https://astronomics.com/pages/exit-pupils
- *Wikipedia — Exit pupil* (conversión y tope al ojo). →
  https://en.wikipedia.org/wiki/Exit_pupil
- V. Sacek, *telescope-optics.net* (fuente que el proyecto ya cita en dobles vía el
  espejo optics.udjat.nl): a igual f/ratio los objetos extensos dan el mismo brillo en
  la retina; el ojo recorta el haz cuando `d_ep > d_eye`.

**Veredicto:** el modelo del usuario para el fondo (`B_rel = min(1,(d_ep/d_eye)²)·T`) es
correcto y coincide con lo que ya calcula el simulador (salvo el factor `T`).

### B. El aumento NO cambia el contraste objeto↔cielo (matiz IMPORTANTE)

Aquí hay que corregir la intuición de que "con `d_ep` grande el **contraste** de la
nebulosa oscura es máximo". Según Roger N. Clark (*Visual Astronomy of the Deep Sky*,
Cambridge Univ. Press / Sky Publishing, 1990), el capítulo del OMVA:

> "As one magnifies an object in a telescope, the object appears larger, but its surface
> brightness … decreases." … "magnification does not change the contrast with the
> background, because both the sky's and the object's surface brightnesses are affected
> equally." → https://clarkvision.com/visastro/omva1/

Es decir, el **contraste (ratio)** objeto↔cielo es **invariante** al aumento: al subir
aumentos, objeto y fondo se oscurecen **a la vez**. Lo que sí cambia es el **umbral de
detección del ojo**, que depende del **tamaño aparente** (datos de contraste umbral de
**Blackwell**, en los que Clark basa su método): un objeto grande se detecta con mucho
menos contraste. → https://clarkvision.com/visastro/omva1/ ,
https://clarkvision.com/visastro/contents.html

Reconciliación con la práctica ("para nebulosas oscuras, pupila de salida grande"):
- La nebulosa oscura ya es **grande** → no necesita aumento para ganar tamaño aparente.
- Con `d_ep` grande, objeto y fondo están a su **máximo brillo absoluto** (el de ojo
  desnudo), bien por encima del suelo de sensibilidad del ojo; a más aumento ambos caen
  y se hunden bajo ese suelo.
- Por eso conviene `d_ep ≈ d_eye` (baja potencia, campo rico) — pero el mecanismo NO es
  "más contraste", sino "mantener el par objeto+fondo en el régimen sensible del ojo,
  con el objeto ya suficientemente grande". El **ratio** de contraste se conserva.

### C. Cómo se ven las nebulosas oscuras (contraste contra fondo brillante)

Clark: la observación visual depende no solo de captar luz débil sino de **discriminar
contraste**, y eso interviene "in seeing spiral arms of galaxies and **dark rifts in
nebulae**, and in perceiving any object against the sky background"
(https://clarkvision.com/visastro/omva1/). Una nebulosa **oscura** no emite: se ve
porque **extingue** la luz de lo que tiene detrás. Su visibilidad depende del **brillo
absoluto del fondo brillante** contra el que se recorta (nubes estelares de la Vía
Láctea, o una nebulosa en emisión como IC 434 tras Barnard 33), no de que el cielo esté
oscuro. El cielo oscuro ayuda **solo** porque deja ver la Vía Láctea a pleno contraste;
la contaminación lumínica añade un velo aditivo que **reduce** el contraste. (La página
de fotometría de Clark trata objetos en emisión, no siluetas oscuras, pero el principio
de "restar el fondo para revelar estructura de bajo brillo" es el mismo:
https://clarkvision.com/astro/surface-brightness-profiles/introduction.html.)

---

## Diagnóstico de las dos dudas

### Duda 1 — Aclarado del fondo cuando `d_ep` y `d_eye` divergen

**El simulador lo hace correctamente.** El clamp `min(1,(d_ep/d_eye)²)` está en las
cuatro rutas y es coherente (`:395`, `:398`, `:464-471`, `:532-539`; y
`bitacora-gaia-render.js:78-83`). Divergencia por arriba (`d_ep>d_eye`) → fondo saturado
al brillo de ojo desnudo, constante (no sigue aclarando). Divergencia por abajo
(`d_ep<d_eye`) → fondo más oscuro. Ambas correctas (§A). No es un bug.

Dos matices **menores** (no explican ninguna queja, pero acercan el modelo al del usuario):
1. **Falta `·T` en el fondo.** El brillo del fondo y la lectura de brillo superficial no
   multiplican por la transmisión (`:395`, `:398`, `:464-471`, `:532`). Efecto real
   pequeño: `T≈0.7–0.9` ⇒ 0.1–0.4 mag/arcsec² de sobrestimación del brillo del fondo.
   (`T` sí entra ya en la magnitud límite.)
2. **Estrellas con `d_ep>d_eye`: no se recorta la apertura efectiva.** La `magLimiteTelescopio()`
   usa `D²` completo (`:356`) aunque a pupila de salida grande el ojo recorte el haz y la
   apertura efectiva sea `D·(d_eye/d_ep)=MAG·d_eye`. Resultado: a **muy poca potencia** el
   simulador es optimista con la magnitud límite estelar. Efecto pequeño salvo pupilas de
   salida claramente > `d_eye`.

### Duda 2 — Nebulosas oscuras que no destacan ni con SQM 22

**Causa raíz (tres capas):**

1. **No hay capa de extinción.** El pipeline solo **suma** luz sobre `nivelFondo`
   (`:545`, `salida ≥ nivelFondo`). Una nube oscura debería pintarse **más oscura** que
   su entorno; hoy es imposible por construcción.
2. **No se renderiza el fondo difuso brillante.** El fondo es un gris **uniforme** salido
   del SQM (`:485-487`, `:499`, `:539`). La Vía Láctea difusa (luz integrada de estrellas
   no resueltas) contra la que se recorta una Barnard **no** se modela como capa luminosa
   extensa; solo hay estrellas discretas de Gaia + la placa DSS/HiPS.
3. **Con SQM 22 el fondo en pantalla ya es casi negro** (`(22.5−22)/(22.5−16.5)·255 ≈ 21`
   de 255). Aunque se pudiera "restar", **no hay contra qué**: sin un fondo brillante en
   el campo, la silueta oscura tiene contraste casi nulo.

**¿Bug o física?** Las dos cosas, y conviene separarlas para el usuario:
- Que una nebulosa oscura **no** destaque contra cielo vacío y oscuro es **física
  correcta**: el contraste lo da el **fondo brillante** (Vía Láctea / emisión), no el SQM.
  Un simulador honesto debe representarlo así: la Barnard aparece **donde hay algo
  brillante detrás**, y es sutil o invisible donde no lo hay.
- Que **nunca** destaque —ni contra IC 434, ni en la vista de placa donde la nube sí
  bloquea luz— **sí** es limitación del simulador: el aplanado a `nivelFondo` borra el
  gradiente difuso de la placa (capa 1+2). En el caso Barnard 33 la placa DSS/HiPS
  *contiene* IC 434 brillante y la silueta oscura, pero `procesarFotometrico` la vuelve a
  aplanar contra el gris uniforme.

---

## Recomendaciones (fórmulas + dónde encajan; sin implementar)

### R1 — Añadir `·T` al fondo (opcional, menor)

Usar `B_rel = min(1,(d_ep/d_eye)²)·T` en el brillo del fondo y en la lectura de brillo
superficial. Sitio: `nivelFondoCielo()` (`:464-471`), `procesarFotometrico` (`:532-539`),
lecturas (`:395-398`), y espejo `bitacora-gaia-render.js:78-83`. Efecto 0.1–0.4 mag; sube
un pelín el contraste a pupila grande. Prioridad baja.

### R2 — Recorte de apertura efectiva de estrellas con `d_ep>d_eye` (opcional, menor)

En `magLimiteTelescopio()` (`:341-357`) sustituir `D` por `D_ef = min(D, MAG·d_eye)` en el
término `2.5*log10(D²·t)` (y coherentemente en `SB0T`). Refleja que con pupila de salida
grande el ojo desperdicia apertura (el aviso ya se muestra en `:413-415`). Espejo en
`bitacora-gaia-render.js:86-94`. Prioridad baja.

### R3 — Nebulosas oscuras: capa difusa + extinción (la de verdad)

Idea clave: **no pintar "luz negativa"**, sino modelar la nube oscura como **reducción de
un fondo brillante extenso** que sí se renderiza. Dos piezas:

1. **Fondo difuso como "luz que escala con la pupila".** Separar la componente de **baja
   frecuencia espacial** de la placa (DSS/HiPS) —la Vía Láctea difusa y las nebulosas de
   fondo— y tratarla como brillo de fondo que se atenúa con `min(1,(d_ep/d_eye)²)`, igual
   que el cielo. Así una región con polvo (menos señal difusa) queda **más oscura que su
   entorno brillante** automáticamente, sin restar. Encaje: en `procesarFotometrico`
   (`:529-551`), antes del bucle, extraer `difuso = desenfocar(v, R_grande)` (ya existe
   `desenfocar()`, `:525`) y sumar `difuso·B_rel` al `nivelFondo` local en vez de un
   escalar uniforme.
2. **Máscara de extinción opcional** para objetos catalogados como oscuros (Barnard):
   multiplicar el fondo difuso local por `10^(−0.4·A)` (A = extinción en mag) dentro de la
   silueta. Marcar el objeto con `oscura:true` en su ficha de catálogo, análogo a
   `carbono`/`doble`. En el Canvas 2D (solo Gaia, sin difuso) la vía natural es **suprimir
   el glow de estrellas no resueltas** (`glowIntensidad`, `bitacora-gaia-render.js`) dentro
   de la máscara: la mancha difusa de fondo baja donde está la nube.

**Comportamiento esperado tras R3 (y coherente con la física §B/§C):**
- La Barnard destaca **contra fondo brillante** (Vía Láctea / IC 434) y es sutil contra
  cielo vacío — correcto.
- A **poca potencia / pupila grande** (fondo brillante a tope) se ve mejor; a mucho
  aumento el fondo cae y la silueta se apaga — correcto.
- Con **contaminación lumínica** el velo aditivo lava el contraste — correcto.

**Mensaje honesto para el usuario:** parte de su queja es un límite físico real, no un
fallo. Una nube oscura **no** se ve "porque el cielo esté oscuro", sino porque hay algo
**brillante detrás**; con SQM 22 y sin fondo brillante en el campo, debe verse poco. El
simulador debería (a) dejar de aplanar el fondo difuso de la placa para que la silueta
aparezca donde físicamente corresponde, y (b) comunicar que sin backdrop brillante el
contraste es intrínsecamente bajo.

---

## Fuentes

**Código (repo):**
- `simulador_ocular/resources/js/bitacora-ocular.js` — `FOT`/`nivelCielo` (165-172),
  lecturas brillo/fondo (395-398), `magLimiteTelescopio` (341-357), `nivelFondoCielo`
  (464-471), `renderGaia2D` (479-509), `procesarFotometrico` (529-551, clave `:545`).
- `resources/js/bitacora-gaia-render.js` — `nivelFondo` (78-83), `magLimite` (86-94).
- `simulador_ocular/ocular-wordpress.html` (141-145), `.../css/bitacora-ocular.css`.

**Física (primarias / de referencia que remiten al original):**
- Roger N. Clark, *Visual Astronomy of the Deep Sky* (Cambridge UP / Sky Publishing,
  1990) — método OMVA, contraste umbral (datos de **Blackwell**), invariancia del
  contraste con el aumento, discriminación de contraste para "dark rifts in nebulae":
  https://clarkvision.com/visastro/omva1/ · https://clarkvision.com/visastro/contents.html
  · https://clarkvision.com/astro/surface-brightness-profiles/introduction.html
- *Telescope Equations — Surface Brightness* (SB ∝ pupila de salida², tope al brillo de
  ojo desnudo): https://milwaukeeastro.org/Stargazing/Telescope/SurfaceBrightness.html
- *Astronomics — Exit Pupils* (brillo ∝ pupila²; misma pupila = mismo brillo superficial):
  https://astronomics.com/pages/exit-pupils
- *Wikipedia — Exit pupil*: https://en.wikipedia.org/wiki/Exit_pupil
- V. Sacek, *telescope-optics.net* (brillo en retina a igual f/ratio; recorte del haz por
  el ojo con `d_ep>d_eye`); espejo usado en el repo: https://optics.udjat.nl/
- J. R. Torres Lapasió, *«On the Prediction of Visibility for Deep-Sky Objects»* (método
  del umbral usado en la magnitud límite): https://www.uv.es/jrtorres/visib.pdf

**Bien establecido vs. aproximado:**
- *Bien establecido:* `SB ∝ (d_ep/d_eye)²` con tope en ojo desnudo; invariancia del
  contraste objeto↔cielo con el aumento (Clark); visibilidad de nebulosa oscura por
  contraste contra fondo brillante.
- *Aproximado / empírico:* la curva gris del fondo (`SB_CIELO_NEGRO/BLANCO`) y las
  constantes fotométricas (`FOT`) son de calibración visual, no físicas exactas; el
  método de Torres Lapasió es "optimista" (de ahí `MARGEN_MAGLIM`); el recorte de
  apertura efectiva y el factor `T` en el fondo son correcciones de segundo orden.
