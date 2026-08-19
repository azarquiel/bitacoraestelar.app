Sí. La captura confirma bastante bien tu impresión: **el problema no parece estar en que el modelo no conozca el color azul, sino en que la cadena de representación está reduciendo demasiado su cromaticidad antes de llegar al píxel final**.

Y hay un punto importante: tu arquitectura es bastante más sólida de lo que sugiere el resultado visual. Yo **no tocaría la tabla BP–RP → RGB como primera medida**. El lugar donde veo el problema está principalmente en la interacción entre **flujo, saturación, mezcla con blanco, gamma y PSF/display**.

## 1. Qué veo en la captura

En la imagen hay una diferencia muy clara entre:

* la estrella rojiza/anaranjada, que **sí conserva una identidad cromática evidente**;
* las estrellas blancas;
* y las estrellas que presumiblemente deberían ser azuladas, que aparecen como **blanco frío o gris azulado**, pero no como azul.

Eso es exactamente lo que describirías como un *Joyero* deslucido.

He analizado además los píxeles brillantes de la captura. Hay estrellas con componente azul claramente superior al rojo, por ejemplo valores alrededor de `223,230,249`, pero su saturación RGB es solamente del orden de **0,10**. Es decir: el azul está ahí, pero está siendo representado como **blanco ligeramente azulado**, no como azul perceptualmente evidente.

En cambio, la estrella anaranjada alcanza valores del tipo `234,154,73`, con una saturación RGB cercana a **0,69**.

La diferencia es enorme.

Por tanto, no estamos ante:

> "el modelo no produce azules".

Estamos ante:

> **"el azul producido por el modelo está siendo llevado demasiado cerca del blanco en la representación final."**

---

# 2. El principio que más sospecho

Tu principio 8 es el candidato número uno:

> "La saturación depende del brillo absoluto de la estrella (Purkinje)." 

La idea física de fondo es correcta: a niveles bajos de luminancia la percepción cromática disminuye.

Pero hay una cuestión conceptual importante:

### Estás usando una sola función de saturación para controlar algo que visualmente no se comporta igual para todos los colores.

Una estrella azul y una estrella roja con el mismo flujo no necesariamente producen la misma impresión de color cuando las conviertes a una imagen RGB y después aplicas una reducción de saturación.

Y aquí aparece un efecto especialmente problemático:

### el azul está mucho más cerca del blanco perceptualmente que el rojo cuando reduces saturación.

Imagina:

```text
azul intenso → (40,80,255)
↓ reducir saturación
azul pálido → (180,190,230)
↓
casi blanco → (220,225,240)
```

Mientras que:

```text
rojo/naranja intenso → (255,120,60)
↓ reducir saturación
naranja pálido → (230,200,180)
```

El segundo todavía puede parecer inequívocamente cálido.

El primero rápidamente parece simplemente **blanco frío**.

Por eso una política de:

```text
saturación = función(brillo)
```

puede ser razonable fisiológicamente pero **visualmente asimétrica**.

---

# 3. El segundo problema: estás aclarando demasiado el núcleo

Tu principio 12 dice:

> "El disco central mezcla color con blanco en proporción fija." 

Aquí veo un problema bastante serio para el objetivo que persigues.

El núcleo de una estrella es precisamente donde se concentra la mayor señal y, por tanto, donde esperarías obtener el estímulo cromático más evidente.

Si haces:

```text
color → mezcla con blanco
```

estás haciendo esto:

```text
        color puro
           ↓
     color + blanco
           ↓
     blanco coloreado
```

Y en una estrella azul eso es particularmente destructivo.

Una estrella que originalmente fuera:

```text
RGB ≈ 100,150,255
```

puede terminar como:

```text
RGB ≈ 200,220,255
```

Eso ya no se percibe como "azul". Se percibe como **blanco frío**.

Mientras que una estrella roja:

```text
RGB ≈ 255,100,60
```

mezclada con blanco puede seguir siendo:

```text
RGB ≈ 255,180,150
```

y continúa siendo reconociblemente cálida.

Esto encaja **muy bien** con lo que veo en tu captura.

---

# 4. El tratamiento del rojo y del azul no es simétrico

Tu arquitectura tiene además una decisión explícita:

> el extremo rojo se deja crudo para conservar el rojo del carbono. 

Y además tienes un realce específico para carbono. 

Esto produce inevitablemente una asimetría:

**rojo**

* extremo de la tabla protegido;
* espectro de carbono;
* `bprpOffset`;
* `bprpMin`;
* `tinteNucleoCarbono` específico.

**azul**

* depende exclusivamente de BP–RP;
* pasa por gamma;
* pasa por saturación;
* pasa por mezcla del núcleo;
* pasa por PSF;
* pasa por display.

Es decir, has construido deliberadamente una cadena que **protege el rojo**, pero no existe una protección equivalente del azul.

Eso no es necesariamente un error científico, pero sí explica muy bien el resultado visual.

---

# 5. Hay además una cuestión con la gamma

Tu principio 7 dice que los códigos del trabajo están en RGB lineal y después haces conversión parcial a sRGB. 

Aquí sería extremadamente cuidadoso.

La secuencia correcta conceptualmente es:

```text
flujo espectral
       ↓
XYZ
       ↓
RGB lineal
       ↓
composición de luminancias / mezcla física
       ↓
tone mapping / display
       ↓
sRGB
```

Pero si alguna operación de:

* mezcla con blanco,
* reducción de saturación,
* interpolación,
* composición de PSF,

se realiza **después de gamma**, estás haciendo operaciones en un espacio que no es lineal.

Eso puede producir exactamente este tipo de pérdida de cromaticidad.

Especialmente importante:

### No conviene hacer la física de la estrella en sRGB.

El sRGB debería ser prácticamente la **última etapa**.

Tu propio diseño del modelo de observación de cúmulos ya separa conceptualmente la capa perceptual de la capa de display y reserva `gamma`/`asinh` para esta última. 

Yo aplicaría exactamente esa filosofía al color estelar.

---

# 6. Hay una tensión interesante entre tus principios 8 y 11

Tu principio 8 dice:

> estrella débil → menos saturación.

Tu principio 11 dice:

> núcleo, aureola y spikes llevan el color de la propia estrella. 

Esto está bien arquitectónicamente.

Pero hay que distinguir dos cosas:

### A. La estrella tiene menos capacidad perceptual para mostrar color.

Eso puede modelarse mediante saturación.

### B. La PSF distribuye su flujo.

Eso no debería cambiar arbitrariamente el color de la fuente.

La PSF debería distribuir **los canales de color de la fuente**, conservando la relación espectral.

Por tanto, una operación como:

```text
RGB estrella
   ↓
PSF
```

es razonable.

Pero:

```text
RGB estrella
   ↓
PSF
   ↓
mezcla con blanco
```

puede destruir el color.

Y todavía peor:

```text
RGB estrella
   ↓
PSF
   ↓
mezcla con blanco
   ↓
gamma
```

porque estás acumulando varios mecanismos que empujan hacia blanco.

---

# 7. Mi diagnóstico principal

Yo ordenaría las causas así:

| Sospecha                                            | Probabilidad |  Impacto |
| --------------------------------------------------- | -----------: | -------: |
| Saturación dependiente del flujo demasiado agresiva | **Muy alta** | Muy alto |
| Mezcla fija con blanco del núcleo                   | **Muy alta** | Muy alto |
| Tratamiento asimétrico rojo/azul                    |     **Alta** |     Alto |
| Operaciones de color en espacio no lineal           |     **Alta** |     Alto |
| PSF que añade blanco o luminancia neutra            |   Media-alta |     Alto |
| Tabla BP–RP → RGB incorrecta                        |     **Baja** |     Alto |
| Gaia BP–RP insuficiente para producir color         |         Baja |    Medio |
| Falta de estrellas azules reales en Gaia            |        Media |    Medio |

La captura, por sí sola, **no me lleva a modificar la tabla de colores**.

---

# 8. Hay un problema más profundo: "color físico" ≠ "color observable en pantalla"

Tu principio 3 es conceptualmente muy bueno: los nodos proceden de una cadena física espectro → CIE → XYZ → sRGB. 

Pero después estás intentando representar en un monitor algo que en el ocular tendría una respuesta perceptual muy distinta.

Por tanto tienes dos problemas diferentes:

### Modelo cromático de la estrella

```text
BP-RP
   ↓
color espectral
```

### Modelo de observación

```text
flujo
   ↓
luminancia retinal
   ↓
sensibilidad cromática
   ↓
color percibido
```

Y finalmente:

```text
color percibido
   ↓
display
```

El error sería intentar resolver todo esto modificando directamente el RGB inicial.

**No lo haría.**

Tu arquitectura actual ya apunta hacia una separación de capas. El problema es que el color estelar todavía parece estar mezclando demasiado:

* color intrínseco,
* percepción,
* brillo,
* núcleo,
* display.

---

# Puntos débiles de tu aproximación

## 1. La saturación depende únicamente del flujo

Es probablemente la debilidad conceptual más importante.

La fórmula:

```text
S = f(flujo)
```

es demasiado simple.

Debería ser más parecido a:

```text
S = f(luminancia retinal,
      fondo,
      adaptación,
      tamaño angular,
      color)
```

No necesariamente necesitas implementar todo eso ahora, pero conviene que la arquitectura permita hacerlo.

---

## 2. "Purkinje" está haciendo demasiado trabajo

La reducción cromática a baja luminancia no debería interpretarse simplemente como:

> menos flujo → menos saturación RGB.

La transición escotópica/mesópica afecta a la respuesta espectral del sistema visual, no es simplemente un control gráfico de saturación.

Tu especificación del modelo de observación ya contempla explícitamente régimen escotópico/mesópico y una función de saturación. 

Por tanto, yo reutilizaría ese concepto en lugar de mantener una heurística independiente en el render estelar.

---

## 3. El blanco del núcleo es un parámetro estético disfrazado de fisiología

`CFG.tinteNucleo` puede ser útil artísticamente, pero físicamente es difícil justificar una mezcla fija:

```text
C' = α C + (1-α) blanco
```

para todas las estrellas.

La estrella no "se vuelve blanca" porque su núcleo sea un núcleo geométrico.

La apariencia blanca del núcleo debería emerger de:

* saturación del display;
* luminancia;
* respuesta visual;
* integración espacial;
* PSF.

---

## 4. El tratamiento especial del carbono rompe la simetría del modelo

El realce del carbono está justificado como capa específica del simulador. 

Pero introduce un riesgo:

> si quieres validar que el sistema reproduce correctamente colores estelares, el carbono deja de ser un buen patrón de referencia.

Porque sabes de antemano que está siendo tratado de manera especial.

Yo usaría estrellas normales B, A, F, G, K y M como banco de pruebas cromático y dejaría el carbono como **caso especial separado**.

---

## 5. La estrella sin BP–RP no debería tener "amarillo" como neutro

Tu principio 5 establece un índice neutro amarillo. 

Esto me parece discutible.

Si no conoces el color, el modelo debería representar:

> **incertidumbre cromática**

no:

> **la estrella es amarilla**.

Un neutro verdaderamente acromático sería más coherente como fallback.

No es la causa del problema de NGC 4755, pero sí es una debilidad conceptual.

---

# Mejoras que propondría

Las dividiría en tres niveles.

## Nivel 1 — No cambiar el modelo físico

Primero haría una prueba extremadamente sencilla:

### Eliminar temporalmente el `tinteNucleo`

No cambiaría nada más.

Compararía:

```text
actual
vs
tinteNucleo = 0
```

Si las estrellas azules empiezan inmediatamente a aparecer azules, ya tienes localizado uno de los principales responsables.

---

### Segundo experimento: saturación constante

Temporalmente:

```text
saturación = 1
```

para todas las estrellas.

Si el Joyero recupera inmediatamente azules fuertes, entonces el problema está demostrado:

> **la función de saturación dependiente del brillo está sobreatenuando el color.**

Este experimento me parece imprescindible antes de modificar cualquier fórmula.

---

### Tercer experimento: ambas cosas

```text
tinteNucleo = 0
saturación = 1
```

Si entonces NGC 4755 aparece con azules claramente reconocibles, ya tienes prácticamente aislado el problema.

---

# Nivel 2 — Corregir la representación

Yo cambiaría el modelo de:

```text
color → saturar → mezclar con blanco
```

por algo conceptualmente más limpio:

```text
BP-RP
   ↓
color espectral lineal
   ↓
flujo de la estrella
   ↓
PSF / integración espacial
   ↓
modelo perceptual
   ↓
tone mapping
   ↓
sRGB
```

El color no debería recibir "blanco" artificialmente porque el objeto sea brillante.

---

# Nivel 3 — Saturación dependiente de luminancia, no simplemente de magnitud

Tu modelo de observación ya tiene una variable mucho mejor:

```text
L_ret
```

La especificación la define como luminancia retinal y la relaciona con pupila de salida, luminancia del cielo y transmisión óptica. 

Yo utilizaría esa magnitud para determinar la pérdida cromática.

Conceptualmente:

```text
S = f(L_ret / L_adaptación)
```

y no:

```text
S = f(magnitud)
```

Esto además encaja mucho mejor con tu arquitectura actual.

---

# 9. Y haría una mejora específica para estrellas muy brillantes

Hay una paradoja interesante.

En tu modelo:

> estrella brillante → saturación completa.

Eso es razonable.

Pero cuando la estrella llega a valores cercanos a:

```text
RGB = 255,255,255
```

el monitor **clipea**.

Entonces puedes tener:

```text
color físico muy azul
          ↓
gran luminancia
          ↓
RGB 250,250,255
          ↓
visualización
          ↓
"blanco"
```

Esto es fundamental.

Una estrella azul muy brillante **no necesita necesariamente más saturación**; necesita que el *tone mapping* conserve la diferencia cromática mientras comprime la luminancia.

Esto es un problema de **gamut/tone mapping**, no de astronomía.

Y creo que aquí puede estar una parte importante del "Joyero deslucido".

---

# 10. Propuesta concreta de arquitectura

Yo dejaría tu `BitacoraGaiaColor` esencialmente como está:

```text
BP-RP
  ↓
color físico
```

y movería la cuestión de cuánto color vemos a otra capa:

```text
BitacoraGaiaColor
        │
        │ color intrínseco
        ▼
BitacoraGaiaRender
        │
        ├── flujo
        ├── L_ret
        ├── PSF
        ├── adaptación
        └── sensibilidad cromática
              │
              ▼
         color observado
              │
              ▼
           display
```

Esto respeta además tu principio de fuente única: **una única definición de qué color tiene la estrella**, pero permite que la observación determine cuánto de ese color resulta visible.

---

# 11. Una prueba que considero especialmente valiosa

Antes de tocar producción, haría un pequeño *harness* con seis estrellas artificiales:

```text
B   BP-RP muy negativo
A   BP-RP negativo
F   BP-RP ligeramente positivo
G   BP-RP medio
K   BP-RP alto
M   BP-RP muy alto
```

Todas con exactamente el mismo flujo.

Después repetiría con:

```text
flujo × 0,25
flujo × 1
flujo × 4
flujo × 16
```

Y mediría:

* RGB resultante;
* saturación HSV/HSL;
* diferencia B−R;
* diferencia R−B;
* luminancia;
* distancia perceptual respecto al blanco.

Eso te permitirá saber si tienes realmente:

```text
B → azul
A → blanco azulado
F → blanco
G → amarillo
K → naranja
M → rojo
```

y **en qué punto desaparece el azul**.

---

# Mi recomendación final

Yo **no modificaría todavía `GAIA_COLOR`**.

Tampoco introduciría una "ganancia azul" artificial. Eso sería tapar el síntoma.

Haría exactamente esta secuencia:

1. **`tinteNucleo = 0`**
2. **saturación = 1**
3. comparar NGC 4755.
4. Después restaurar una cosa cada vez.
5. Determinar qué porcentaje de la pérdida procede de saturación y qué porcentaje de mezcla con blanco.
6. Comprobar que todas las operaciones de color previas al display se realizan en **RGB lineal**, no sRGB.
7. Separar definitivamente **color intrínseco** de **color observable**.
8. Sustituir progresivamente `saturación = f(flujo)` por una función basada en **luminancia retinal/adaptación**.
9. Finalmente revisar el *tone mapping* para evitar que las estrellas azules brillantes sean llevadas a `R≈G≈B≈255`.

### Mi diagnóstico en una frase

**Tu modelo de color de la estrella me parece razonablemente bien planteado; lo que está fallando es la etapa que convierte ese color en una estrella observable y finalmente en un píxel.**

Y la captura es especialmente reveladora porque el rojo **sí sobrevive** mientras el azul se convierte en blanco frío. Eso apunta mucho más a **desaturación + mezcla con blanco + compresión de luminancia** que a un problema de BP–RP o de la tabla cromática.

Además, hay una conexión muy clara con la especificación que acabas de desarrollar para los cúmulos: allí ya has separado **Capa 3 = flujo físico**, **Capa 4 = sistema visual** y **Capa 5 = display**.  Yo aplicaría exactamente esa separación al render de estrellas. Es probablemente la forma más limpia de solucionar el problema sin empezar a añadir "parches de color azul" al modelo.
