# 02 — Cómo se quitan las estrellas de una imagen de campo

**Type:** research
**Status:** resolved
**Blocked by:** —

## Question

La imagen del cartografiado trae **todo**: la galaxia, la nebulosa y las
estrellas. Pero las estrellas ya las pinta la capa de Gaia, con su fotometría y
su magnitud límite. Si la imagen entra tal cual, cada estrella se pinta dos
veces y con dos aspectos distintos.

La spec original manda **StarNet++**, que es una red neuronal offline: no cabe
en una tubería de navegador ni en un campo pedido en vivo.

Averiguar qué alternativas hay, y cuáles son viables en JS sobre un lienzo de
PROC² píxeles en tiempo de fotograma:

1. **Resta informada por catálogo** — la posición y el flujo de cada estrella ya
   los da Gaia DR3, exactamente, para este mismo campo. ¿Qué exige restar una
   PSF ajustada en esas posiciones? ¿Cómo se estima la PSF de la placa (FWHM,
   alas)? ¿Qué pasa con las estrellas que la placa satura y con las que Gaia no
   trae (el catálogo está incompleto en núcleos densos por aglomeración)?
2. **Filtro morfológico / de mediana** — apertura morfológica, mediana de radio
   grande, o `min` seguido de `max`. Cuánto se lleva por delante del objeto
   difuso, sobre todo del núcleo de una galaxia, que en tamaño se parece a una
   estrella gorda.
3. **In-painting del hueco** — una vez marcada la estrella, con qué se rellena.
   Ojo: `rellenarNucleo` / `repararNucleos` ya hacen algo parecido en este mismo
   módulo (`resources/js/bitacora-gaia-render.js:311`), para el núcleo hundido
   de los mosaicos de PanSTARRS. Mirar si sirve de base.
4. **Prior art** — cómo lo resuelven otros simuladores de cielo o pipelines de
   fotometría de galaxias sobre imágenes con estrellas superpuestas.

Devolver una comparación honesta de coste, calidad y complejidad, no una
recomendación de una línea.

## Answer

Medido, no opinado. Los tres bancos de pruebas quedan en
`.scratch/difusas-desde-imagen/bench/`, ejecutables con `node`:
`bench_estrellas.js` (coste), `bench_calidad.js` y `bench_calidad2.js`
(cuánto se lleva del objeto). Node 26 usa V8, el mismo motor que Chrome.

### Coste, lienzo de 720² (518 kpx)

| método | ms |
|---|---|
| máscara en posiciones de catálogo + relleno desde el entorno | **1,3** |
| resta de PSF, 2000 estrellas, sello 15×15 | 3,2 |
| resta de PSF, 8000 estrellas, sello 31×31 | 35 |
| apertura morfológica vHGW (r=3 o r=6, da igual) | 21–22 |
| mediana de caja por histograma 9×9 / 15×15 | 44 / 41 |
| resta de PSF, 8000 estrellas, sello 81×81 (con alas) | 217 |
| mediana de anillo r=4..6 / r=6..9 | 214 / 468 |

La mediana de anillo queda descartada por coste. La apertura vHGW no depende del
radio (por eso r=6 no cuesta más que r=3). A 1440² todo se multiplica por ~4.

### Calidad: la morfología se come la galaxia (sobre imagen **lineal**)

Galaxia extensa, Re = 16 px ≈ 6,8 FWHM. Lo que queda tras el filtro, en % del
original:

| filtro | pico núcleo | F(r<5px) | F(r<30px) | pico estrella |
|---|---|---|---|---|
| apertura 7×7 | 2 % | 21 % | **54 %** | 0 % |
| apertura 11×11 | 1 % | 10 % | 46 % | 0 % |
| mediana anillo 4..7 | 2 % | 13 % | 45 % | 0 % |
| mediana caja 11×11 | 2 % | 18 % | 50 % | 0 % |

Con la galaxia **compacta** (Re = 6 px) es peor: la apertura 7×7 deja el **17 %**
del flujo total. Sobre datos lineales, cualquier filtro que mate la estrella mata
también el núcleo. Esto es exactamente el fallo que se vio la vez anterior —
«mancha uniforme», sin núcleo.

### Pero sobre la imagen **estirada** (asinh, lo que llega en el JPG) cambia todo

| filtro | pico núcleo | F(r<5px) | F(r<30px) | pico estrella |
|---|---|---|---|---|
| apertura 5×5 | 78 % | 95 % | 99 % | 13 % |
| apertura 7×7 | **66 %** | **87 %** | **98 %** | **0 %** |
| apertura 11×11 | 51 % | 69 % | 94 % | 0 % |

Hallazgo que no estaba en la pregunta: **el estirado es lo que hace viable la
morfología**, porque comprime el rango dinámico de la galaxia respecto al de la
estrella. En lineal la estrella es 100× el núcleo y el filtro tiene que morder
hondo; en asinh son comparables y una apertura 7×7 se lleva la estrella entera
dejando el 98 % del flujo de la galaxia. Ata esto a la ficha 03: la vía A (JPG)
no es solo la barata, es la que hace fácil la supresión de estrellas.

### Ganador: máscara en posiciones de catálogo + relleno desde el entorno

| variante | pico núcleo | F(r<5px) | F(r<30px) | pico estrella |
|---|---|---|---|---|
| máscara r=3 + relleno | **100 %** | **100 %** | 99 % | 1 % |
| máscara r=5 + relleno | 100 % | 99 % | 99 % | 0 % |
| máscara r=8 + relleno | 64 % | 92 % | 97 % | 0 % |

1,3 ms, no toca la galaxia porque solo toca donde el catálogo dice que hay
estrella, y no necesita ni PSF ajustada ni imagen lineal. **Es el mejor en las
dos columnas a la vez**, coste y calidad. El radio no puede pasar de ~5 px: a
r=8 empieza a comerse el núcleo.

**Y ya hay medio código escrito para esto en el módulo.** `repararNucleos` /
`rellenarNucleo` (`resources/js/bitacora-gaia-render.js:311`) son justo una
máscara rellenada desde un entorno desenfocado — `desenfocar()` se reusa tal
cual. La regla de relleno hay que invertirla: hoy rellena hoyos oscuros
(`v[i] < 0,5·entorno[i]`), aquí hay que aplanar picos brillantes.

### Resta de PSF: solo paga si la astrometría es casi perfecta

Sobre imagen lineal, residuo en % del pico original de la estrella:

| condición | residuo |
|---|---|
| PSF perfecta, centro exacto | **0,1 %** |
| centroide desviado 0,3 px | 17,7 % |
| centroide desviado 0,5 px | 28,2 % |
| flujo 10 % de más / de menos | 9,9 % / 10,1 % |
| centroide 0,3 px + flujo 10 % | 25,4 % |

En el caso ideal es insuperable —0,1 % de residuo y el núcleo intacto—, pero se
degrada a plomo con medio píxel de error. Un residuo del 28 % es un punto
brillante visible, y encima **donde el catálogo pone una estrella**: se sumaría a
la estrella que la capa de Gaia pinta justo ahí.

### Lo que esto destapa: la proyección del render **no es TAN**

`dibujar()` coloca las estrellas con una proyección lineal
(`bitacora-gaia-render.js:1286`, `x = SIZE/2 − ΔRA·cos(dec0)·esc`), mientras
`hips2fits` entrega **TAN**. `bench_proyeccion.js` mide la diferencia en píxeles
del lienzo, que es la unidad que decide si una resta cae encima de la estrella:

| dec0 | campo 10′ | 30′ | 60′ | 120′ |
|---|---|---|---|---|
| 0° | 0,00 px | 0,01 | 0,02 | 0,10 |
| 40° | 0,49 px | 1,47 | 2,95 | 5,90 |
| **70°** | **1,61 px** | **4,83** | 9,66 | 19,36 |

Cruzado con la tabla de arriba: a declinación alta el error de registro supera
por sí solo el umbral donde la resta de PSF deja de servir, y a 60′ el difuso
entero aparecería desplazado varios píxeles respecto de las estrellas. Sale
ficha nueva: **09**.

### Sin responder: prior art

El punto 4 de la pregunta —cómo lo resuelven otros simuladores y las tuberías de
fotometría de galaxias— no se investigó; el subagente que lo llevaba murió antes.
No se reabre: las medidas de arriba ya deciden, y el prior art solo habría
confirmado o no. Si alguna vez se necesita, es media hora de búsqueda.
