# Notas: resolución de estrellas dobles (límite de Dawes y afines)

Notas de investigación para el simulador ocular de dobles: dada una separación
angular conocida (arcsec), decidir si es resolvable con una apertura y un aumento
dados. Cada afirmación va citada a la fuente que la "posee". Constantes primero,
matices después.

## Resumen de constantes (para la implementación)

| Criterio | Fórmula (D en mm) | Fórmula (D en pulgadas) | Naturaleza |
|---|---|---|---|
| **Dawes** | `116 / D` arcsec (a veces `115.8/D`) | `4.56 / D` arcsec | empírico, pares iguales ~6ª mag |
| **Rayleigh** | `138 / D` arcsec (λ=550 nm) | `5.45 / D` arcsec | teórico, difracción `1.22 λ/D` |
| **Sparrow** | `~107 / D` arcsec | `~4.2 / D` arcsec | teórico, desaparece la depresión central |

Dawes < Rayleigh: Dawes es **más optimista** (número menor = separación menor
resolvible). Sparrow es el más agresivo de los tres.

---

## 1. Límite de Dawes

**Origen.** William Rutter Dawes (1799–1868), astrónomo amateur inglés. Resultado
**empírico**, no derivado de teoría de difracción. Publicado en 1867: la
determinación de la "separating power" aparece en la introducción de su catálogo,
*Catalogue of Micrometrical Measurements of Double Stars*, Memoirs of the Royal
Astronomical Society, **Vol. 35, p. 137 (1867)** — el mismo trabajo apareció
también en MNRAS 27(6), 217 (abril 1867).
Fuentes: [ADS 1867MmRAS..35..137D](https://ui.adsabs.harvard.edu/abs/1867MmRAS..35..137D/abstract),
[MNRAS 27/6/217](https://academic.oup.com/mnras/article/27/6/217/975923),
[Wikipedia: Dawes' limit](https://en.wikipedia.org/wiki/Dawes'_limit).

**Constante.** `R = 4.56 / D` con R en arcsec y D en **pulgadas**. Forma métrica
`R = 116 / D` (D en mm); algunas referencias usan `115.8/D` (conversión exacta de
4.56″/pulgada: 4.56 × 25.4 = 115.8). Wikipedia y la mayoría de fuentes redondean a
`116/D`. Verificado: sí, es `4.56/pulgada` y `≈116/mm`.
Fuentes: [Wikipedia](https://en.wikipedia.org/wiki/Dawes'_limit),
[optics.udjat.nl (mirror de telescope-optics.net, V. Sacek)](https://optics.udjat.nl/telescope_resolution.html).

**Supuestos exactos de Dawes (importante para el simulador).** Dawes calibró sobre
**pares de brillo casi igual** de estrellas de **~6ª magnitud**. La formulación
estándar de su hallazgo: una apertura de 1 pulgada "just separates" un par de dos
estrellas de sexta magnitud si su separación es 4″.56, y el poder separador varía
inversamente con la apertura. Redacción original (según el trabajo de 1867):
> "I examined with a great variety of apertures a vast number of double stars,
> whose distances seemed to be well determined, and not liable to rapid change, in
> order to ascertain the separating power of those apertures, as expressed in
> inches of aperture and seconds of distance."

(cita reproducida en secundarias que remiten al original;
[thefreelibrary / Sky&Telescope "Find your Dawes limit"](https://www.thefreelibrary.com/Find+your+Dawes+limit.-a0459634295)).

Matiz técnico útil: la condición no es "6ª mag" en abstracto, sino **pares casi
iguales, unas ~3 magnitudes más brillantes que la estrella más débil detectable con
esa apertura** (es decir, brillo moderado, ni saturado ni al límite). Cita textual:
"near equally bright pairs about three magnitude brighter than the faintest star
detectable with the aperture tested".
Fuente: [optics.udjat.nl](https://optics.udjat.nl/telescope_resolution.html).

**Qué se ve en el límite de Dawes.** No hay hueco oscuro entre los discos; el par
solo se detecta como desviación de la forma circular (figura alargada / "en 8"),
no como dos discos separados. Fuente: [optics.udjat.nl](https://optics.udjat.nl/telescope_resolution.html).

---

## 2. Criterio de Rayleigh

**Origen.** Lord Rayleigh (J. W. Strutt), *"Investigations in optics, with special
reference to the spectroscope"*, Philosophical Magazine, Series 5, **Vol. 8,
pp. 261–274 (1879)** (y continuación en el mismo volumen). Es el límite **teórico**
de difracción.
Fuente: cita bibliográfica del trabajo de Rayleigh 1879 (Phil. Mag. 5th ser., 8).

**Definición.** Dos fuentes puntuales son "apenas resolvibles" cuando el máximo
central del patrón de difracción (disco de Airy) de una cae sobre el primer mínimo
del de la otra.

**Fórmula.** `θ = 1.22 λ / D` (radianes). El 1.22 sale del primer cero de la
función de Bessel J₁ para apertura circular. En arcsec, para luz visible
λ = 0.55 µm y D en mm: **`θ = 138 / D`** arcsec. En el límite de Rayleigh la
depresión entre los dos picos baja a ~3/4 del pico (hueco poco marcado).
Fuente: [optics.udjat.nl](https://optics.udjat.nl/telescope_resolution.html).

**Por qué difiere de Dawes.** Rayleigh es teórico y **conservador**; Dawes es
empírico y **más optimista** (el ojo/observador experto detecta la elongación antes
de que aparezca un hueco de Rayleigh). Numéricamente `116/D` (Dawes) coincide con
`1.22 λ/D` para λ ≈ 460 nm, más azul que los 550 nm de Rayleigh — de ahí que Dawes
salga "más apretado".
Fuente: [Wikipedia: Dawes' limit](https://en.wikipedia.org/wiki/Dawes'_limit).

---

## 3. Límite de Sparrow

Sí, es el tercer criterio habitual. C. M. Sparrow (1916), derivado de experimentos
fotográficos con líneas espectrales. Su condición ("undulation condition"): la
separación a la que la **depresión central del patrón combinado justo desaparece**
(la segunda derivada de la intensidad en el centro se anula → la cima del PSF
combinado se aplana). Es el más agresivo: **`~107/D` mm (`~4.2/D` pulgadas)**,
~20% por debajo de Rayleigh y por debajo también de Dawes. Por debajo de Sparrow ya
no hay ninguna señal de dualidad en el perfil de intensidad.
Fuentes: [Wikipedia: Sparrow's resolution limit](https://en.wikipedia.org/wiki/Sparrow's_resolution_limit),
[optics.udjat.nl](https://optics.udjat.nl/telescope_resolution.html).

Para el simulador: Dawes es el criterio estándar para "¿es resolvible?". Sparrow
sería el "límite físico absoluto optimista"; Rayleigh, el "hueco visible limpio".

---

## 4. Dependencia con la magnitud (pares desiguales)

**Honestidad primero: NO existe una fórmula limpia y universalmente aceptada.** La
constante de Dawes (4.56) vale para pares **casi iguales de brillo moderado**. Para
un primario brillante con secundario débil (Sirio A/B, Antares A/B) la separación
resolvible **empeora** (número mayor), porque el compañero se pierde en el
resplandor y los anillos de difracción del primario. La regla base solo dice
"mucho más difícil". Cita: "Resolution limit for star pairs of unequal brightness
... is lower [peor]". Fuente: [optics.udjat.nl](https://optics.udjat.nl/telescope_resolution.html).

**Existen modelos empíricos** (competidores, ninguno canónico), en función de la
diferencia de magnitud Δm y de las condiciones (apertura, obstrucción, seeing):

- **Peterson (1954)** — visión escotópica, secundario más débil que ~mag 8.5:
  `sep_objetivo = 10^[ (5/8)(m2 − TLM + 2.4) ] × sep_límite_seeing`
  (TLM = magnitud límite del telescopio).
- **Lord, Contrast Index (1979)** — modificación de Rayleigh:
  `sep(arcsec) = 100^(0.1·Δm) × 1.01 × ρ′ × λ × 206265 / D_mm`
- **Lord, Performance Index (1994)** — usa la ley de potencia de Stevens:
  `S = 1.033 × 10^[ (1/n)(|Δm| − 0.1) ] × ρ`, con n∈[4.0, 12.0] combinando apertura,
  obstrucción y seeing.
- **Haas (2006)** — tabla de consulta por Δm y apertura (no fórmula).

Advertencia de la propia fuente: "modern models do not provide practical
predictions for about one-half of the double stars that beginners are likely to
encounter" (sobre todo secundarios más débiles que ~mag 9, donde la visión
escotópica del ojo no está bien modelada).
Fuente: [fisherka: Limits for splitting unequal binaries](https://fisherka.csolutionshosting.net/astronote/astromath/ueb/Unequalbinaries.html).

**Recomendación para el simulador:** usar Dawes como criterio base y, si se quiere
tratar Δm, aplicar como máximo un factor de penalización empírico (p.ej. estilo
Lord Contrast Index, `10^(0.1·Δm)` ≈ multiplicar la separación exigida por ese
factor) marcándolo explícitamente como heurístico, no como física exacta. No
prometer precisión para Δm grande / secundarios muy débiles.

---

## 5. Aumento necesario para percibir el split

**Es un problema aparte del límite de apertura.** Aunque la óptica resuelva el par,
el ojo necesita que la separación **aparente** (tras el aumento) supere su propia
resolución angular, que en la práctica es de varios **arcminutos**, no arcsec.

Relación básica (campo aparente = campo real × aumento):
> **aumento × separación(arcsec) = separación aparente(arcsec)**

Umbrales del ojo (empíricos): ~**8′ cómodo**, 6′ desafiante, 4′ difícil. Con 8′ =
480″ como objetivo cómodo:
> **aumento ≈ 480 / separación(arcsec)** (cómodo) … hasta ~300/sep para "empezar a
> resolver" y ~600–750/sep para split fácil.

Ejemplo (fuente): Mizar, sep 14″, a 43× → 43 × 14″ = 602″ ≈ 10′ aparente (cómodo).
Fuentes: [milwaukeeastro: Beginner's Guide Double Stars](https://milwaukeeastro.org/beginners/double_stars.asp),
[Cloudy Nights: On Magnification for Resolving Double Stars](https://www.cloudynights.com/topic/496262-on-magnification-for-resolving-double-stars/).

Reglas de bolsillo relacionadas (no confundir con lo anterior):
- Aumento **máximo útil** ≈ 50×/pulgada ≈ 2×/mm de apertura (límite por difracción,
  no por el ojo).
- Para explotar la resolución límite de la óptica se suele citar un aumento mínimo
  ~30×/pulgada (≈1300×D en metros). Fuente: búsqueda agregada de guías de aumento.

**Para el simulador:** dos comprobaciones independientes:
1. ¿Resolvible por apertura? `sep ≥ 116/D_mm` (Dawes).
2. ¿Visible al ojo con este aumento? `aumento × sep ≥ ~480″` (≈8′ aparente), con
   ~300″ como mínimo marginal.
Ambas deben cumplirse para "se ve el split".

---

## Fuentes primarias vs. secundarias

- **Primarias:** Dawes 1867 (MmRAS 35, 137 / MNRAS 27, 217); Rayleigh 1879
  (Phil. Mag. 5th ser., 8, 261). Citadas por la constante y el criterio.
- **Técnicas de referencia (secundarias fiables que remiten al original):**
  telescope-optics.net (V. Sacek) vía mirror optics.udjat.nl — constantes de Dawes,
  Rayleigh, Sparrow y la condición de brillo. Wikipedia para la conversión métrica
  y la relación Dawes↔Rayleigh.
- **Modelos de pares desiguales:** Peterson 1954, Lord 1979/1994, Haas 2006,
  recopilados en fisherka (Unequalbinaries). Empíricos, no canónicos.
