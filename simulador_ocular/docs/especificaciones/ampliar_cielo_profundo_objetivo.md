# Objetivo

Quiero ampliar el simulador de observación astronómica para que pueda representar, además de galaxias, otros objetos de cielo profundo como:

* nebulosas planetarias
* restos de supernovas
* nebulosas de emisión
* nebulosas de reflexión
* otros objetos extendidos que podamos incorporar posteriormente

El objetivo **no es implementar inmediatamente todos esos objetos**, sino estudiar primero la arquitectura actual y diseñar una extensión que permita incorporarlos sin degradar ni romper la representación actual de galaxias.

## Skills obligatorios

Debes utilizar y respetar estos skills durante el trabajo:

* `/ponytail:ponytail ultra`
* `/mattpocock-skills:implement`
* `/mattpocock-skills:tdd`

No los trates como una formalidad. Quiero que su metodología determine cómo analizas, diseñas, implementas y validas el cambio.

---

# Principio fundamental

Antes de modificar código, estudia el pipeline actual de representación de galaxias y determina qué partes son:

1. **genéricas de la observación de un objeto celeste**, por ejemplo:

   * magnitud
   * brillo superficial
   * escala angular
   * seeing
   * PSF
   * pupila de salida
   * aumento
   * campo aparente
   * contraste con el fondo
   * adaptación a la visión
   * representación final en pantalla

2. **específicas de galaxias**, por ejemplo:

   * perfil radial
   * disco
   * bulbo
   * brazos espirales
   * estructuras de galaxias
   * parámetros específicos de galaxias
   * tratamiento particular de estrellas embebidas o del campo
   * cualquier hipótesis que no sea físicamente válida para otros objetos.

No quiero una simple abstracción mecánica de funciones existentes.

Quiero que determines primero **qué modelo físico común existe realmente** y dónde deben aparecer modelos específicos por tipo de objeto.

---

# Primera fase: investigación del repositorio

Antes de escribir código:

* inspecciona la estructura relevante del repositorio;
* identifica el pipeline completo de representación de galaxias;
* localiza los módulos responsables del modelo físico;
* localiza los módulos responsables de la observación;
* localiza el rendering;
* identifica tests, harnesses, ADRs y guardianes relacionados;
* estudia especialmente las decisiones arquitectónicas ya tomadas sobre:

  * PSF
  * seeing
  * brillo superficial
  * contraste
  * crowding
  * estrellas
  * halo
  * datos PS1/Gaia
  * escalas angulares
  * magnitudes.

No presupongas que una función es reutilizable simplemente porque su nombre parece genérico.

Traza el flujo real de datos.

---

# Segunda fase: separar modelo de objeto y modelo de observación

Quiero que evalúes explícitamente una arquitectura conceptualmente similar a:

```
catálogo / definición del objeto
          ↓
    modelo intrínseco
          ↓
   transformación angular
          ↓
  modelo de observación
          ↓
      PSF / seeing
          ↓
   contraste / fondo
          ↓
       rendering
```

Pero **no implementes esta arquitectura por anticipado**.

Primero comprueba si encaja con el código existente y propón la mínima evolución necesaria.

El punto importante es separar:

### Modelo intrínseco

Describe qué es el objeto antes de observarlo.

Ejemplos:

* galaxia → distribución espacial de luminosidad y color
* nebulosa planetaria → estructura angular y distribución de emisión
* resto de supernova → filamentos/cáscara/estructura irregular
* nebulosa de emisión → distribución espacial de emisión
* cúmulo → distribución discreta de estrellas

### Modelo de observación

Describe cómo ese objeto es percibido con el telescopio:

* diámetro
* aumento
* campo
* pupila
* seeing
* PSF
* brillo de cielo
* contraste
* resolución
* adaptación visual
* límites de detección.

La misma física de observación debería poder aplicarse a diferentes clases de objetos cuando corresponda.

---

# Tercera fase: identificar los límites de reutilización

Haz una tabla interna de análisis con algo equivalente a:

| Componente actual | ¿Genérico? | ¿Específico de galaxias? | ¿Puede reutilizarse? | Cambio necesario |
| ----------------- | ---------- | ------------------------ | -------------------- | ---------------- |

Presta especial atención a cualquier código que actualmente mezcle:

* geometría de la galaxia
* datos de estrellas
* brillo superficial
* PSF
* contraste
* decisiones de rendering.

Quiero evitar crear una abstracción artificial que simplemente cambie nombres.

---

# Cuarta fase: diseñar el primer objeto no galáctico

No implementes inicialmente cinco tipos de nebulosa.

Selecciona **un único objeto representativo** que permita validar la arquitectura.

Mi preferencia inicial sería una **nebulosa planetaria**, porque permite comprobar si el sistema soporta un objeto extendido que no sea una galaxia y que tenga una morfología diferente.

Pero puedes proponer otro objeto si el análisis del repositorio demuestra que existe un candidato mejor.

El primer objeto debe servir principalmente como **prueba arquitectónica**, no como catálogo completo de nebulosas.

---

# Quinta fase: TDD

Aplica TDD de forma estricta.

Antes de implementar el comportamiento:

1. define qué comportamiento observable queremos;
2. escribe tests que expresen ese comportamiento;
3. implementa la mínima solución;
4. ejecuta la suite;
5. comprueba regresión sobre galaxias.

Los tests deben demostrar especialmente que:

* una galaxia sigue produciendo exactamente el comportamiento esperado;
* un objeto extendido no galáctico puede recorrer el mismo pipeline de observación cuando corresponde;
* los parámetros específicos de una galaxia no contaminan al nuevo objeto;
* PSF/seeing/contraste siguen siendo aplicados en el lugar correcto;
* el rendering no necesita conocer innecesariamente el tipo físico del objeto.

No aceptes tests que solamente comprueben que una función "no falla".

---

# Sexta fase: implementación incremental

No hagas una gran refactorización.

La estrategia debe ser:

1. identificar la mínima frontera arquitectónica;
2. extraer únicamente lo que realmente es común;
3. conservar el comportamiento actual de galaxias;
4. añadir el primer tipo nuevo;
5. validar visualmente;
6. solamente después evaluar si merece la pena generalizar más.

No hagas:

* una jerarquía enorme de clases;
* un sistema genérico de plugins sin necesidad;
* una abstracción especulativa para objetos que todavía no existen;
* una migración masiva de parámetros;
* una reescritura del renderer.

La arquitectura debe emerger de una necesidad demostrada.

---

# Validación visual

La validación no debe ser solamente mediante tests.

Necesito comprobar visualmente que:

* las galaxias no han cambiado;
* el nuevo objeto tiene una morfología razonable;
* el tamaño angular responde correctamente al aumento;
* el brillo/contraste responde correctamente al fondo;
* la PSF y el seeing afectan al objeto de forma coherente;
* no aparecen halos, zonas negras, sobrecontraste u otros artefactos derivados de reutilizar incorrectamente el pipeline de galaxias.

Si existe algún harness o sistema de generación de vistas ya utilizado en el proyecto, reutilízalo.

No inventes un segundo sistema de validación si el existente puede ampliarse.

---

# ADR

Si durante el análisis aparece una decisión arquitectónica que vaya a condicionar futuras incorporaciones de objetos, propón un ADR.

Especialmente si la conclusión es algo como:

> El simulador debe separar el modelo intrínseco del objeto del modelo de observación.

Pero **no crees un ADR simplemente por crear documentación**.

Primero demuestra que existe una decisión arquitectónica estable que merece quedar registrada.

Si ya existe un ADR que cubre parcialmente esta cuestión, amplíalo en lugar de duplicarlo.

---

# Criterio de éxito

Consideraré correcta la solución si al final podemos conceptualizar el sistema de forma parecida a:

```
Objeto celeste
    │
    ├── Galaxia
    ├── Nebulosa planetaria
    ├── Resto de supernova
    ├── Nebulosa de emisión
    └── ...

todos ellos
    ↓
modelo de observación común
    ↓
rendering común cuando sea físicamente apropiado
```

pero **sin forzar que todos compartan el mismo modelo intrínseco**.

La arquitectura debe permitir que una galaxia sea compleja, una nebulosa sea una distribución continua y un cúmulo sea fundamentalmente un conjunto de estrellas sin que el código tenga que fingir que todos son la misma cosa.

---

# Restricciones importantes

* No hagas una refactorización especulativa.
* No cambies parámetros físicos existentes sin justificarlo.
* No mezcles esta tarea con mejoras de calidad visual que no sean necesarias.
* No aproveches la tarea para "limpiar" código no relacionado.
* No modifiques el comportamiento de galaxias salvo que sea imprescindible.
* No introduzcas nuevos parámetros globales sin necesidad.
* No dupliques lógica existente.
* No sustituyas una decisión física por una conveniencia de implementación.
* No declares éxito solamente porque la suite esté verde: exige también validación visual.

---

# Entregables

Antes de implementar, quiero que me presentes:

1. mapa del pipeline actual;
2. qué partes son genéricas y cuáles específicas de galaxias;
3. propuesta de frontera arquitectónica;
4. candidato elegido como primer objeto no galáctico y por qué;
5. tests que vas a añadir;
6. cambios mínimos previstos;
7. posibles ADRs;
8. estrategia de validación visual.

Después de mi aprobación, implementa siguiendo TDD y `/mattpocock-skills:implement`.

Al terminar:

* ejecuta la suite completa;
* ejecuta los tests/harnesses relevantes;
* genera las vistas de validación;
* compara explícitamente con el comportamiento anterior de galaxias;
* informa de cualquier discrepancia;
* no cierres hipótesis que no hayan sido realmente demostradas.

## Regla final

**Primero descubre la arquitectura que el proyecto necesita; después implementa el primer objeto que demuestre esa arquitectura.**

No empieces creando "un sistema de nebulosas".

Empieza convirtiendo el actual sistema de galaxias en un sistema capaz de distinguir correctamente entre:

**qué es el objeto** y **cómo lo observa el telescopio**.
