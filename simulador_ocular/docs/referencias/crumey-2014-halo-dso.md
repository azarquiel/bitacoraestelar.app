# Crumey 2014: brillo de los DSO y el halo de las galaxias

**Pregunta.** Crumey (2014) modela el umbral de visibilidad para objetivos
uniformes de cualquier tamaño. ¿Qué dice en concreto sobre *cómo se observa el
brillo de un objeto extenso* (galaxia, nebulosa) y sobre *dónde termina
visualmente una galaxia* —el halo—, que es justo lo que el render de PS1 pinta
hoy píxel a píxel contra un umbral constante?

**Método.** PDF primario completo (arXiv:1405.4209v1) descargado y extraído con
`pdftotext -layout`; leídos §1.6.3 (forma/estructura), §2.3 (modelo completo),
§3.1 (M33/M31), §3.3 (curva telescópica), §3.4 (Herschel y aumento óptimo),
§4 (conclusiones) y Figuras 12, 15, 16, 17, 18. Las ecuaciones se transcriben
del PDF, no de memoria. Los cálculos propios van marcados como tales; lo literal
del paper se cita por ecuación o figura.

Compañero de `crumey-2014-umbral-de-contraste.md`, que compara Crumey contra la
ley H2c del repo. Aquí no se repite esa comparación: esto es lo que Crumey
aporta sobre **extensos no uniformes**, que el otro documento solo menciona de
pasada.

Referencia: Crumey, A. 2014, *Human Contrast Threshold and Astronomical
Visibility*, MNRAS 442, 2600–2619 (DOI 10.1093/mnras/stu992; preprint
arXiv:1405.4209).

## Respuesta corta

**Un DSO no se ve "por su magnitud" ni "por su brillo superficial" a secas: se
ve por su perfil de brillo *acumulado* contra una curva umbral que depende del
área.** La ley (Ec. 60) tiene dos asíntotas y el ojo usa una u otra según el
tamaño del objeto: abajo del área de Riccò manda la magnitud total (objeto
puntual), arriba manda el brillo superficial (objeto extenso). El halo visible
de una galaxia es el **cruce** entre su perfil de brillo medio encerrado y esa
curva, no un nivel fijo de SB contra cielo.

La frase del paper que lo resume (§3.1, sobre M33): *"the edge is actually seen
against the (invisible) remainder of the galaxy rather than the sky."* El borde
exterior del halo no contrasta contra el cielo: contrasta contra la propia luz
interior de la galaxia, que también está bajo el umbral. Por eso una galaxia
muere visualmente antes de su isótopa profunda del catálogo.

Crumey lo valida empíricamente con los 2136 objetos de Herschel (Fig. 15):
**91,7 % caen bajo su curva umbral** trazada en (brillo superficial vs área).
La curva acumulado-vs-área es el detector correcto de DSO, no una hipótesis.

## 1. Cómo se observa el brillo de un extenso

### 1.1 La ley vive en espacio (µ vs área)

La ley umbral de Crumey (Ec. 41, con `q = 0,6` escotópico) se reescribe en
unidades astronómicas como:

```
µlim = µ∞ − (2,5/q)·log((A_R/A)^q + 1)          (Ec. 60)
mlim = m0 − (2,5/q)·log((α/α_R)^q + 1)          (Ec. 62)
```

con `A_R` el área de Riccò y `µ∞` la meseta de objeto infinito. `µ∞` depende
del cielo y del factor de campo:

```
µ∞ = 0,6864·µsky + 9,9325 − 2,5·log F           (Ec. 57, 18 < µsky < 22)
```

Dos asíntotas, y cada una manda en un régimen:

- **`α → 0`** (objeto chico): `mlim → m0`. El ojo integra todo el flujo; lo que
  importa es la **magnitud total**.
- **`α → ∞`** (objeto grande): `µlim → µ∞`. El ojo ya no integra más; lo que
  importa es el **brillo superficial**.

Crumey, literal (§3.1): *"magnitude is a good visibility indicator for small
targets, while surface brightness is better for large ones."*

### 1.2 El área de Riccò es el codo

```
A_R = R/C∞ = (r1·B^(−1/4) + r2)² / (k1·B^(−1/4) + k2)   (Ec. 22, 59)
r_R = 5,21·µsky − 76,2  [arcmin]   (Ec. 63, 21 ≤ µsky ≤ 22, err. 0,05′)
```

A `µsky = 21,83` da `r_R = 37,6′` (~75′ de diámetro) a ojo desnudo. Debajo de
esa escala un objeto se comporta como punto; encima, como superficie.

Consecuencia del codo (Ec. 60 con `A = A_R`): un objeto **del tamaño exacto del
área de Riccò** debe estar `−4,167·log(2) = 1,25 mag arcsec⁻²` más brillante
que `µ∞` para verse como **no estelar**. Es el criterio de "esto ya no es una
estrella gorda": las fuentes extensas tienen que estar suficientemente por
encima del límite puntual para separarse de él.

### 1.3 La equivalencia límite estelar ↔ brillo superficial

En §1.2, Crumey subraya que el umbral es *"invariante en forma"* y relativo, lo
que implica *"an equivalence between limiting stellar magnitude and limiting
surface brightness"*. Traducido: dado un observador y un sitio, su límite
estelar `m0` y su límite de brillo superficial `µ∞` **no son independientes** —
los ata la misma curva. La Tabla 1 del paper explota esto con el suplemento
`sup = µ∞ − m0`, **independiente de F** y por tanto del observador.

Consecuencia práctica: un DSO entero se puede reducir a un número —su
**"effective visual magnitude"**— que es la magnitud estelar que ese mismo
observador necesitaría para verlo. Es un indicador de calidad de cielo, y Crumey
lo usa así para M33 y M31 (abajo).

## 2. El halo: dónde termina visualmente la galaxia

### 2.1 El método de Crumey (Fig. 12, M33)

Crumey traza la galaxia **no** como un brillo por píxel, sino como una curva de
**brillo superficial medio encerrado frente a área encerrada**: los puntos son
isofotas sucesivas, cada una con su área acumulada y su SB medio. Sobre eso
superpone la curva umbral (Ec. 60). El **punto de cruce** da el tamaño y brillo
visibles:

> *"The co-ordinates of the intersection point give the visible size and
> brightness of the galaxy."*

Es decir: el halo visible termina donde el brillo acumulado deja de superar la
curva umbral dependiente del tamaño. Fuera de ahí, la galaxia es invisible **no
contra el cielo, sino contra su propio resto interior** (que también es
invisible), de modo que el ojo no la separa.

### 2.2 Números M33 (cielo 21,83, F = 1,378)

| Cantidad | Catálogo (isofota 25,3) | **Visible (Crumey)** |
|---|---|---|
| Radio circular equivalente | 25,3′ | **18,7′** |
| Brillo superficial en el borde | 25,3 mag/″² | **22,43 mag/″²** |
| Magnitud total | 5,8 | **5,93** |
| Isofota límite | 25,3 | **23,71–23,75** |

El halo **muere ~6′ antes** de la isofota profunda, a un SB ~1,6 mag más
brillante. Al barrer `µsky` de 21 a 22, el radio visible apenas se mueve
(18,5–18,75′) y el SB del borde tampoco (22,41–22,44): **la extensión visible es
casi insensible al cielo**, lo que cambia es el límite estelar requerido.

Las dos asíntotas de la curva para M33:

- Asíntota Riccò = magnitud constante **6,59**: el límite estelar que hace falta
  para verla (es decir, su effective visual magnitude ≈ 6,6).
- Asíntota horizontal = **24,59 mag arcsec⁻²**: el SB por debajo del cual ningún
  halo extenso se ve, por grande que sea.

El factor de campo necesario para que M33 sea visible obedece
`F ≈ 0,5482·µsky − 10,585` (21 ≤ µsky ≤ 22). Con `F = 2` haría falta
`µsky = 22,63`, más oscuro que el cielo natural: **M33 no es objetivo fácil ni
bajo cielo muy oscuro** (contradice la escala Bortle, que la da por obvia en
clase 1).

### 2.3 M31, de contraste

Mismo procedimiento (datos De Vaucouleurs 1958): con `F = 2` se vuelve visible a
`µsky ≈ 19,2`, área visible ~2100 arcmin², effective visual magnitude **5,2**.
M31 es objetivo fácil a ojo desnudo bajo cielo moderado, acorde con la
experiencia. Corrección de color: B−V = 0,91 (M31) y 0,55 (M33) mueven la
magnitud efectiva en ±0,06…0,25 según el estándar elegido (Ec. 18).

### 2.4 Validación empírica: Herschel (Fig. 15, 16)

Crumey traza los 2136 objetos de Herschel en (µ vs α) contra su curva umbral a
la potencia de barrido:

```
µ157 = 23,18 − 4,167·log(0,468·α^(−0,6) + 1)     (Ec. 89)
```

(`4,167 = 2,5/0,6`; cálculo propio: `0,468 = α_TR^(0,6)` ⇒ `α_TR ≈ 0,28
arcmin²`.) Resultado:

- **91,7 %** de los descubiertos caen bajo la curva; solo **3,2 %** están más de
  0,25 mag/″² por encima.
- Los omitidos son más chicos y más cerca del umbral: `L` medio (distancia a la
  curva, "visibility level" de Adrian 1989) **0,69** en descubiertos frente a
  **0,35** en omitidos; `log α` medio **0,28** frente a **−0,21**.
- Solo **3,6 %** de los omitidos deberían haber sido fáciles.

Esto confirma dos cosas a la vez: la curva acumulado-vs-área **es** el detector
correcto, y la detección de un DSO la dispara su **núcleo brillante** —Herschel
*"needed only to see the bright centre of an object in order to detect it"*—,
mientras que la **extensión** (el halo) es el cruce, no el centro.

### 2.5 El aumento óptimo mueve el halo (Fig. 17)

*"The contrast of an extended object seen in a telescope is independent of
magnification, but the threshold is dependent on image size and background,
both of which change with magnification."* Subir potencia:

- desplaza la asíntota Riccò **a la izquierda** (mejora el límite puntual),
- baja la asíntota horizontal (empeora el límite de SB).

Un objeto puede ser invisible a baja y alta potencia, visible en un rango
intermedio (ej. del paper: visible a ×75, invisible a ×20 y ×200). Traducción
para el render: **la extensión visible de un halo depende del aumento, no solo
su tamaño angular.** El área de Riccò telescópica

```
A_TR = R_a/(M²·C_a)                              (Ec. 81)
```

es la escala que se encoge con el aumento, y es lo que entra en la versión
telescópica de la curva:

```
µlim = µ∞ − (2,5/q)·log((α_TR/α)^q + 1)          (Ec. 84)
```

Dato empírico que Crumey anota: Leibowitz (1952) halló que a baja luz la agudeza
es máxima con pupila de ~3 mm —la pupila de salida que Herschel eligió por
tanteo para sus barridos de nebulosas—. Es el aumento donde el halo rinde.

## 3. Qué le dice esto al repo

El render de PS1 pinta hoy:

- `resources/js/bitacora-ps1.js:1389-1390` — `ctxFotometrico(o.cielo,
  parche.thetaIntArcmin)` y `umbral = sbUmbralContraste(c)` con el comentario
  explícito *"constante en todo el parche"*.
- `resources/js/bitacora-gaia-render.js:550` — `sbUmbralContraste(c) =
  −2,5·log10(c.Fcielo · c.Cmin)`.
- `resources/js/bitacora-ps1.js:1090-1095` — `ps1Opacidad(sbPixel, sbUmbral)`,
  rampa contra ese umbral único.
- `resources/js/bitacora-ps1.js:1392-1398` — el halo extrapolado del catálogo y
  el umbral son *"decisiones INDEPENDIENTES"*: `halo` decide si se rellena el
  perfil; la ley de visibilidad es *"la misma para todas"*.

**El gap exacto.** El repo aplica el tamaño del parche (`thetaIntArcmin`) **una
vez** para bajar el umbral de toda la galaxia, y luego mide cada píxel contra
ese umbral fijo. Crumey dice que el umbral debe ser **función del área
encerrada** a lo largo del perfil: el halo se corta en el cruce
`µ_enc(r) = µlim(α(r))`, no en un nivel de SB fijo. Las dos asíntotas de la
curva ya existen en el repo (θ_R de H2c y `sbUmbralContraste` a θ enorme); lo
que falta es **evaluarlas por radio encerrado**, no una sola vez por parche.

Dos consecuencias concretas, medibles:

1. **El borde del halo está mal de sitio.** Hoy el píxel se apaga contra el
   umbral del parche entero; según Crumey debería apagarse contra el umbral del
   área encerrada hasta ese radio. Para una galaxia grande y difusa el umbral
   por-radio es **más estricto** en el borde (área encerrada grande ⇒ meseta µ∞,
   no rama Riccò): el halo se corta antes de lo que pinta hoy.
2. **La transición no la da Crumey.** Él da *dónde* termina el halo (el cruce),
   no *cómo* se desvanece. La rampa `ps1Opacidad` sigue haciendo falta para la
   transición suave; solo cambia el umbral que la alimenta, de constante a
   dependiente de área encerrada.

## 4. Lo que Crumey NO da (límites honestos)

- **No uniformidad:** la trata *"approximately"*. Él mismo avisa de que las
  predicciones de aumento óptimo son *"of limited value … because targets are in
  general not uniform"*. El método de Fig. 12 usa encerrado-desde-centro; la
  regla local (ventana de Riccò centrada en cada radio) queda abierta.
- **El "edge against inner galaxy" es caveat, no fórmula.** Crumey lo señala
  como cautela sobre M33, no lo convierte en ley. Es el hueco que un modelo de
  halo real tendría que cerrar con datos propios.
- **Forma:** el área basta como determinante hasta razón de ejes ≈ 7 (Lamar et
  al. 1948). Galaxia muy elongada (edge-on > 7) necesita un factor de campo
  extra: umbral sube.
- **Espectro:** nebulosas de emisión excluidas (radiancia muy distinta de cuerpo
  negro); el cielo contaminado tampoco es cuerpo negro.
- **Glare:** una estrella brillante cerca puede hacer invisible un objetivo
  tenue (Adrian 1989); no lo desarrolla.
- **Estructura interna:** la rampa, los interbrazos, las depresiones —nada de
  eso está en Blackwell, y por tanto nada en Crumey. Su ley es de *mancha* que
  termina en un cruce, no de textura.

## Conclusión

Para el halo, Crumey aporta una regla **constructiva y validada**: el borde
visible de una galaxia es el cruce de su perfil de brillo medio encerrado contra
la curva umbral dependiente del área, y muere contra la propia luz interior de
la galaxia, no contra el cielo. El repo ya tiene las dos asíntotas de esa curva;
le falta aplicarlas por radio encerrado en vez de una vez por parche. Lo que
Crumey **no** aporta es la forma de la transición en ese borde —eso sigue siendo
territorio de `ps1Opacidad` y de un experimento propio.
