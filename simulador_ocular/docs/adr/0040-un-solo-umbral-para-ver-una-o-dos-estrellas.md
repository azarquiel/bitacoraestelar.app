Fecha: 2026-11-17
Estado: aceptado
Enmienda a: 0039 (fija el umbral que dejaba «sin decidir»)

# Un solo umbral para ver una o dos estrellas

Issue #576 (épica #578). El ADR 0039 elige la imagen sumada (b) para el
blending, pero contar uno o dos picos en ella exige un umbral, y la casa tenía
dos anclas que no coinciden:

- **Rayleigh sobre la PSF.** Valle de 0,265 en el par igual, el ancla de
  `θ_sep` (ADR 0012, `0012-crowding/ancla_thetasep.md` §4). No depende del
  aumento.
- **El ojo.** `resolucionDoble` (`bitacora-ocular.js`) pide `aum·sep ≥ 300″`
  para empezar a partir un par, citado de
  `simulador_ocular/docs/notas/resolucion-dobles.md` §5. A 173× son 1,73″ =
  1,66 θ_sep, y depende del aumento.

## Decisión

**Un solo umbral para el blending y para las dobles: dos picos de la imagen
cuentan como dos si el valle entre ellos baja al menos 0,265 por debajo del
pico más débil (Rayleigh), sobre la imagen `radioImagenEstelar` (Airy ⊕
seeing).** Por debajo del umbral, la imagen es un solo objeto: un pico
desplazado hacia la brillante o una mancha alargada (ADR 0039, respuesta 1).

- **Ancla:** Rayleigh 1879 (Phil. Mag. 5ª serie, 8, 261): el valle del par
  igual de Airy cuando el centro de una cae en el primer anillo oscuro de la
  otra. Es la misma ancla de `θ_sep`; no entra ninguna constante nueva.
- **El eje del ojo (`aum·sep`) no entra en el umbral.** Está **sin ancla**
  (ver «El 300″, revisado»). El ADR 0004 no deja meter en el modelo una
  constante sin procedencia física ni medida que la calibre.

## Por qué uno y no dos

1. **El ojo ve la imagen, no el catálogo.** Un par en un globular y una doble
   del catálogo de dobles son el mismo objeto óptico: dos PSF sumadas. Con una
   regla para cada uno, el mismo par a la misma separación se vería partido en
   la ficha de dobles y fundido en el cúmulo, o al revés.
2. **Rayleigh es la única de las dos anclas con fuente primaria.** El 300″ no
   la tiene (abajo).
3. **El perfil ya trae la dependencia con Δm.** Con el valle exigido sobre el
   más débil, un par desigual necesita más separación que uno igual (tabla:
   Δm = 2 sigue fundido a 0,95 θ y se parte a 1,50 θ). `resolucion-dobles.md`
   §4 dice que no hay fórmula canónica para Δm y solo ofrece penalizaciones
   heurísticas. Con el valle no hace falta ninguna: es el mismo argumento con
   el que el ADR 0039 (respuesta 3) quita `Δmag`.
4. **Es coherente con Dawes, no lo contradice.** Dawes (MmRAS 35, 137, 1867)
   es empírico, y en su límite no hay hueco: el par se ve como figura alargada
   (`resolucion-dobles.md` §1). Con este umbral, un par igual entre Sparrow y
   Rayleigh se dibuja como mancha alargada, no como un punto. La elongación
   que Dawes veía sigue en la imagen; lo que el umbral decide es cuándo hay
   hueco.
5. **Sparrow (valle 0) no:** cuenta dos picos donde no hay hueco visible
   (tabla, columna Sparrow), y su original (ApJ 44, 76, 1916) no se ha
   abierto.

## Micro-casos con el umbral elegido

`node scripts/harness_fusion_blending.js --todas`, M13, 467 mm, 173×,
`θ_sep = 1,043″`, PSF gaussiana de FWHM 0,84 θ (valle del par igual a 1 θ:
26,6 %, reproduce Rayleigh). Se añade la fila «par igual, 1,00 θ», que marca el
borde del umbral.

```
caso                               (a) FoF    (b) Sparrow   (b) Rayleigh (elegido)   pico − centroide
par igual, 0,50 θ                  1          1             1                        0,000 θ
par igual, 0,70 θ                  1          1             1                        0,000 θ
par igual, 0,75 θ                  1          2             1 alargada
par igual, 0,95 θ                  1          2             1 alargada
par igual, 1,00 θ                  2          2             2
par Δm=2, 0,70 θ                   1          1             1                       −0,078 θ
par Δm=2, 0,95 θ                   1          1             1                       −0,126 θ
par Δm=2, 1,50 θ                   2          2             2
par Δm=0,75, 0,95 θ                1          2             1 alargada
cadena A–B–C igual, paso 0,60 θ    1          1             1                        0,000 θ
cadena A–B–C igual, paso 0,90 θ    1          3             1 alargada
```

Con Rayleigh, (a) y (b) dan el mismo número de objetos en los once casos; con
Sparrow difieren en cuatro. Como en el ADR 0039, ese número no es el argumento
a favor de (b), que es conservación, forma y posición. Aquí solo comprueba que
el umbral elegido no inventa picos donde la imagen no tiene hueco.

## El 300″, revisado

`resolucion-dobles.md` §5 cita dos fuentes para el eje del ojo. Abiertas el
2026-11-17:

- **milwaukeeastro.org, «Beginner's Guide: Double Stars».** Recomienda 8′ de
  separación aparente para un split fácil, y dice que 6′ es desafiante, 4′
  bastante difícil y 2′ «the bare minimum». No cita fuente: es la
  recomendación del propio club. **No aparece 300″ ni 5′.**
- **Cloudy Nights, «On Magnification for Resolving Double Stars».** Responde
  403; no se ha podido abrir.

Veredicto: **el 300″ está sin ancla.** No sale de la fuente abierta, que da 2′
(120″) como mínimo y 4′ (240″) como difícil; es una interpolación de la nota.
El 480″ (8′) sí está en la fuente, pero es una guía de aficionados sin fuente
primaria. Esto confirma lo que ya decía `ancla_thetasep.md` §5 (sin fuente
primaria, contradicción con el dibujo, aumento contado dos veces).

Lo que el umbral **no** modela por eso: la resolución del propio ojo sobre la
imagen aumentada. Es física real y depende del aumento, pero sin ancla no
entra. Orden de magnitud a 173×: el borde de Rayleigh (`θ_sep·M = 180″ = 3′`)
cae entre el «bare minimum» de 2′ y el «difícil» de 4′ de la fuente abierta,
así que con este equipo el término del ojo no es claramente el que manda. A
aumentos bajos sí lo será, y ahí el simulador partirá pares que el ojo no
parte. Se declara como límite. Una fuente primaria candidata sobre agudeza
visual a baja luminancia es Shlaer 1937 (J. Gen. Physiol. 21, 165); **no
abierta**, no se usa.

## Consecuencias

- ADR 0039: el parámetro «umbral de resolución de la imagen sumada» pasa de
  «sin decidir» a valle 0,265 (Rayleigh). El prerrequisito 3 de su veredicto
  queda cerrado.
- `resolucionDoble` tendrá que cambiar en la implementación, que no es de este
  ADR:
  - el eje óptico pasa de Dawes `116/D` a la regla del valle sobre
    `radioImagenEstelar` (incluye el seeing y la Δm del par);
  - el eje `aum·sep` sale del veredicto «se resuelve». Si se quiere conservar
    como consejo de aumento, se cita como guía de aficionados (8′ fácil), no
    como umbral.
- `resolucion-dobles.md` §5: el 300″ queda marcado «sin ancla».
- `CFG.thetaSepRadios = 1` no cambia: es el borde del par igual con este
  umbral.

## Límites declarados

- PSF gaussiana en los micro-casos. Sin anillos de Airy, el valle de un par
  muy desigual (Δm grande) sale optimista; la PSF de producción es un sprite.
- El seeing es el fijo de `CFG` (2″); no hay seeing por noche.
- El término del ojo queda fuera (sin ancla), con el sesgo descrito arriba a
  aumentos bajos.
- Una sola configuración de equipo en la tabla. La regla no depende del
  equipo; los números en θ dependen del cociente Airy/seeing.

Ninguna cifra de estrellas dibujadas se usa en este ADR a favor ni en contra
(ADR 0004).
