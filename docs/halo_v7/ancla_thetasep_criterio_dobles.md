# ADR 0012 · el ancla de θ_sep: qué criterio de separación visual existe ya

Pregunta: antes de meter `aCrowd` en el render hay que fijar el VALOR de
`θ_sep`, y el paso 2 dejó claro que el fixture de Gaia no lo puede fijar
(`calibracion_thetasep_adr0012.md`). ¿Hay ya un criterio de separación visual en
el simulador que sirva de ancla, en vez de inventar uno para cúmulos?

**Sí, y en su mitad óptica ya es el MISMO código.** Lo que hay que corregir no es
la falta de criterio: es que `thetaSepFwhm` está expresado en una unidad que no
es la que su nombre dice, y por eso `1,0` no significa lo que parece.

---

## 1. El criterio de dobles que ya existe

`resolucionDoble(o)`, `simulador_ocular/resources/js/bitacora-ocular.js:994-1011`.
Dos condiciones independientes, ambas obligatorias:

| eje | condición | dónde |
|---|---|---|
| óptico | `sep ≥ 116/D` (Dawes) | `bitacora-ocular.js:1001` |
| ojo | `aumentos · sep ≥ 480″` cómodo, `≥ 300″` marginal | `bitacora-ocular.js:1006-1008` |

Respaldo: `docs/dobles/notas-resolucion-dobles.md`, con fuentes primarias para el
eje óptico —Dawes 1867 (MmRAS 35, 137; MNRAS 27, 217) y Rayleigh 1879 (Phil. Mag.
5ª serie, 8, 261)— y §5 para el eje del ojo.

## 2. El eje óptico ya está compartido con los cúmulos

La imagen estelar del render:

- `bitacora-gaia-render.js:1201-1204` — `radioAiry(D) = CFG.airyArcsec / D`, con
  `airyArcsec = 138,4` (`:796`): es `1,22·λ/D` a 550 nm, el radio del primer
  anillo oscuro, o sea **el criterio de Rayleigh**.
- `bitacora-gaia-render.js:1206-1211` — `radioImagenEstelar(D) = √(radioAiry² +
  (seeing/2)²)`, con `seeingArcsec = 2,0` (`:800`).
- `bitacora-gaia-render.js:1564` — **el cúmulo lo llama a él**:
  `var fwhmAs = 2 * radioImagenEstelar(o.apertura);`

Es decir: el beam con el que se mide el crowding y el disco con el que se dibujan
las estrellas salen de la misma función, y `test_estrella_fisica.js:57-62` valida
esa función contra los números de libro (114 mm → 1,21″ de Rayleigh, Dawes 1,02″,
un 19 % más apretado). El eje óptico está validado y no hay que traer nada nuevo.

## 3. El problema: `fwhmAs` no es un FWHM

`fwhmAs = 2 · radioImagenEstelar` es **dos veces un radio de Rayleigh** (sumado
en cuadratura con la HWHM del seeing). En régimen de difracción pura eso es el
DIÁMETRO del primer anillo oscuro, no la anchura a media altura del perfil de
Airy —que vale ≈1,03·λ/D, casualmente muy cerca de Dawes—.

Consecuencia directa sobre `CFG.thetaSepFwhm = 1,0`
(`bitacora-cumulos.js:44-50`, comentado como «convención: 1 FWHM»):

> θ_sep = 1,0 · fwhmAs = **2 × Rayleigh ≈ 2,4 × Dawes**

No es la convención que el comentario anuncia, y es entre 2 y 2,4 veces más
exigente que el criterio que el simulador ya aplica a las dobles. MEDIDO, M13 con
D=467 mm: Rayleigh 0,296″, Dawes 0,248″, `fwhmAs` 2,09″ — porque a esa apertura
manda el seeing, 3,4:1 sobre la difracción.

## 4. El ancla, sin criterio nuevo

El enunciado de Rayleigh es «el centro de una cae en el primer anillo oscuro de
la otra», es decir **una separación igual al RADIO de la imagen estelar**. Llevado
a la imagen que el render dibuja de verdad —Airy ⊕ seeing— eso es exactamente
`radioImagenEstelar`, y en las unidades actuales:

```
θ_sep = radioImagenEstelar = fwhmAs / 2   →   thetaSepFwhm = 0,50
```

Cero constantes nuevas, misma función que las dobles, y el seeing entra donde ya
entraba.

Si se prefiriera el criterio empírico de Dawes —el que usa el veredicto de
dobles— en lugar del teórico de Rayleigh, el ancla apenas se mueve en cuanto el
seeing pesa. MEDIDO, sustituyendo `138,4/D` por `116/D` dentro de la cuadratura:

| apertura | ancla con Rayleigh | ancla con Dawes | diferencia |
|---|---|---|---|
| 467 mm | 1,043″ | 1,030″ | 1,2 % |
| 114 mm | 1,573″ | 1,427″ | 9,3 % |

La elección entre los dos criterios de libro es irrelevante frente al seeing en
aperturas grandes, y menor en pequeñas. Lo que sí cambia el resultado por un
factor 2 es la confusión de la unidad del apartado 3.

## 5. Lo que NO se puede tomar prestado: el eje del ojo

El segundo eje del veredicto de dobles —`aumentos · sep ≥ 480″`— no debe entrar
en `θ_sep`, por tres razones:

1. **No tiene fuente primaria.** `notas-resolucion-dobles.md` §5 lo cita de dos
   guías de aficionados (milwaukeeastro, Cloudy Nights), no de literatura. El
   propio documento lo marca como umbral empírico.
2. **Está en contradicción abierta con el render.**
   `docs/dobles/notas-separacion-dobles-dibujo.md` documenta que el DIBUJO
   necesita entre 5× y 8× más aumento que el que anuncia `resolucionDoble` para
   enseñar un píxel de hueco, y lo llama «fallo de diseño real». El eje del ojo
   del veredicto de dobles no está consolidado; el óptico sí.
3. **Duplicaría el aumento.** El modelo de cúmulos deja el aumento fuera de
   `m_crowd` a propósito —es física de telescopio y atmósfera, ver el comentario
   de `bitacora-gaia-render.js:1596-1605`— y lo mete por `m_lim,sky`. Meterlo
   otra vez en `θ_sep` sería contarlo dos veces, que es justo lo que el punto 3
   del ADR 0012 prohíbe para la banda `δ`.

## 6. Lo que cuesta el ancla, medido

Pasar de `thetaSepFwhm` 1,0 a 0,5 no es cosmético. Del barrido del paso 2, M13,
D=467 mm, 173×, Δmag 0,75:

| thetaSepFwhm | núcleo (≤0,25 r_h) | cúmulo entero |
|---|---|---|
| 1,00 | 77 | 1517 |
| 0,50 | 128 | 1713 |

Referencias: el render de hoy con `k = 30` entrega 1575 estrellas, y el ADR 0012
anunciaba «el cúmulo entero baja de 1575 a ~1517» — ese número correspondía a
`thetaSepFwhm = 1,0`. **Con el ancla del apartado 4, la dirección se invierte: el
cúmulo GANA estrellas (1575 → 1713), no las pierde.**

Eso no es motivo para preferir 1,0. El ADR 0004 prohíbe elegir el parámetro por
cómo queda la imagen, y el ADR 0012 ya avisó de que el cambio «no va a hacer que
el render se parezca más a una foto». Pero sí obliga a actualizar la previsión
del ADR antes de implementar: la frase «el núcleo gana estrellas y la corona
pierde más» deja de describir el resultado esperado.

## 7. Recomendación

1. Anclar `θ_sep = radioImagenEstelar`, o sea `thetaSepFwhm = 0,50` con la
   definición actual de `fwhmAs`. Es Rayleigh sobre la imagen real, y es el mismo
   eje óptico que ya juzga las dobles.
2. Arreglar el nombre en el mismo cambio: `fwhmAs` no es una FWHM y el comentario
   de `bitacora-cumulos.js:47` dice lo contrario. O se renombra a algo como
   `beamAs`/`diamImagenAs`, o `thetaSepFwhm` pasa a expresarse en radios de
   imagen estelar. Sin eso, el 0,50 parecerá un ajuste y no un ancla.
3. Corregir en el ADR 0012 la previsión de estrellas antes de tocar el render.
4. `Δmag = 0,75` se queda sin ancla propia: el barrido del paso 2 no lo
   distingue y `notas-resolucion-dobles.md` §4 solo ofrece una penalización
   heurística por Δm (estilo Lord Contrast Index), marcada allí como no física.
   **Sin fuente primaria**: se deja como está y se declara.

Con esto cerrado, el paso 3 del ADR 0012 —(A) atenuación contra Bernoulli, (B)
esquema del punto fijo— ya puede correr con un `θ_sep` fijado por física y no por
la imagen.
