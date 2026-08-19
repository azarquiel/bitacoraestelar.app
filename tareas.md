
# Experimento V3 — Contabilidad Glow ↔ King en cúmulos globulares

Trabaja sobre el repositorio actual de **Bitácora Estelar**, utilizando el código real de la rama experimental existente.

Esta fase parte de los resultados obtenidos en los experimentos anteriores.

---

# ESTADO ACTUAL DEL PROYECTO

## V2-A — ACEPTADA

La implementación anterior utilizaba:

```text
King(r)^gammaHalo
````

La V2-A sustituyó esto por:

```text
King(r)
```

Resultado:

* la implementación BASE perdía hasta aproximadamente un 86 % del flujo a 450×;
* el tamaño aparente del halo se contraía artificialmente al aumentar los aumentos;
* V2-A conserva el flujo;
* `r50` y `r90` permanecen invariantes con los aumentos;
* confirmado en M13, M92 y 47 Tuc.

**V2-A está aceptada y debe considerarse el comportamiento correcto.**

No modificarla durante este experimento.

---

## V2-RC — NEUTRA

Se investigó la discontinuidad de `tPin` alrededor de `r_c`.

Se comprobó que:

* existe una discontinuidad matemática real;
* eliminar completamente el corte dentro de `r_c` empeora;
* una transición local continua elimina la discontinuidad;
* no altera el flujo;
* pero la mejora no es visualmente apreciable en Chrome real;
* la banda queda por debajo de la resolución efectiva del render en los campos probados.

Conclusión:

```text
V2-RC = NEUTRO
```

No consolidar.

No modificar durante esta fase.

---

## V2-B — CONGELADA

V2-B propone sustituir la resta global de estrellas Gaia por una resta espacial estrella-a-estrella utilizando la PSF existente.

Está matemáticamente implementada y conservadora, pero todavía no se ha demostrado su beneficio visual.

No modificar durante esta fase.

---

# OBJETIVO DE ESTA FASE

Investigar exclusivamente la coherencia entre:

```text
King
+
estrellas Gaia resueltas
+
glow de Gaia
```

Existe un posible problema de doble conteo o pérdida de flujo porque la magnitud utilizada para la resta del King:

```text
CFG.globular.magResta
```

es fija, mientras que la profundidad de la consulta/render Gaia depende del equipo.

Se han identificado estos dos casos potencialmente problemáticos.

---

# PROBLEMA HIPOTÉTICO A

## Equipo con profundidad Gaia superior a `magResta`

Puede existir una estrella:

```text
magResta < magestrella <= magLimiteConsulta
```

que:

* se obtiene de Gaia;
* puede ser dibujada individualmente o mediante glow;
* pero no se resta del flujo King.

Resultado potencial:

```text
King
+
estrella Gaia
```

representan parcialmente la misma luz.

→ posible **doble conteo**.

---

# PROBLEMA HIPOTÉTICO B

## Equipo con profundidad Gaia inferior a `magResta`

Puede ocurrir que una estrella:

```text
magestrella <= magResta
```

sea incluida en la resta del King pero no llegue a ser dibujada por el sistema Gaia debido al límite del equipo.

Resultado:

```text
King reducido
+
estrella no representada
```

→ posible **pérdida de flujo**.

---

# OBJETIVO PRINCIPAL

Antes de modificar código, demostrar si estos problemas existen realmente en el render actual.

No asumir que existen solamente porque sean posibles.

Queremos obtener una contabilidad explícita del flujo.

---

# REGLA FUNDAMENTAL

## NO cambies todavía `magResta`

No modifiques:

```text
CFG.globular.magResta
```

No conviertas automáticamente:

```text
magResta = magLimite
```

No cambies la profundidad de la consulta Gaia.

No cambies el límite de magnitud del equipo.

No queremos todavía una solución.

Primero queremos medir el problema.

---

# PARTE 1 — MAPEAR EL PIPELINE REAL

Localiza y documenta exactamente cómo una estrella Gaia atraviesa el sistema.

Debes identificar:

1. dónde se obtiene la estrella Gaia;
2. qué magnitud se utiliza;
3. cuál es el límite de consulta;
4. cuál es el límite de dibujo;
5. cuándo se considera estrella resuelta;
6. cuándo genera glow;
7. cuándo su flujo entra en la resta de King;
8. dónde se suma finalmente su flujo al render.

No te bases únicamente en nombres de variables.

Sigue el flujo real de ejecución.

---

# PARTE 2 — CREAR UNA CLASIFICACIÓN DE ESTRELLAS

Para cada estrella Gaia relevante dentro de `r_t`, clasifícala en una de estas categorías:

```text
A = representada como estrella individual
B = representada mediante glow
C = representada solamente por King
D = restada de King y además representada por Gaia
E = restada de King pero no representada por Gaia
```

La clasificación debe ser mutuamente comprensible y permitir detectar:

```text
D → posible doble conteo
E → posible pérdida
```

Si una estrella puede pertenecer a más de una categoría debido al pipeline actual, documenta exactamente cómo ocurre.

---

# PARTE 3 — CONTABILIDAD POR ESTRELLA

Para cada estrella utilizada en la prueba registra como mínimo:

```text
id
magnitud Gaia
distancia al centro
flujo físico
entra en consulta Gaia
se dibuja individualmente
genera glow
entra en resta King
flujo restado
flujo representado como estrella
flujo representado como glow
```

No es necesario guardar todos los datos del catálogo.

Puede utilizarse un resumen estadístico.

Pero debe ser posible verificar el presupuesto.

---

# PARTE 4 — CONTABILIDAD GLOBAL

Para un cúmulo concreto calcula:

```text
F_Harris
F_resta_King
F_estrellas
F_glow
F_King_restante
```

y determina:

```text
F_representado =
    F_King_restante
    + F_estrellas
    + F_glow
```

Compara con:

```text
F_Harris
```

La diferencia debe explicarse.

No aceptes simplemente:

```text
"hay una diferencia pequeña"
```

Debes indicar:

```text
diferencia absoluta
diferencia relativa
```

y qué población la produce.

---

# PARTE 5 — HACERLO CON VARIOS EQUIPOS

Este es el experimento fundamental.

Selecciona equipos/configuraciones que tengan límites de magnitud claramente diferentes respecto a:

```text
CFG.globular.magResta
```

Como mínimo necesitamos tres casos conceptuales:

```text
CASO A:
magLimite < magResta

CASO B:
magLimite ≈ magResta

CASO C:
magLimite > magResta
```

Si los telescopios disponibles no permiten exactamente estos tres casos, elige los más próximos y documenta los límites reales.

---

# PARTE 6 — USAR EL MISMO CÚMULO

Para evitar mezclar efectos, utiliza inicialmente:

```text
M13
```

Mantén constantes:

* coordenadas;
* cúmulo;
* cielo;
* campo;
* aumento si es necesario;
* PSF;
* condiciones atmosféricas;
* H2c;
* perfil King;
* catálogo Harris.

Cambia únicamente el equipo/profundidad Gaia.

---

# PARTE 7 — MEDIR LA DEPENDENCIA CON EL TELESCOPIO

Queremos saber si cambiar de equipo modifica artificialmente:

```text
F_Halo
F_Gaia
F_total_representado
```

El flujo físico total del cúmulo NO debería cambiar simplemente porque cambiemos el telescopio.

El telescopio puede cambiar:

```text
qué estrellas aparecen resueltas
```

pero no:

```text
cuánta luz física contiene el cúmulo.
```

Por tanto, mide:

```text
Frepresentado(equipo A)
Frepresentado(equipo B)
Frepresentado(equipo C)
```

y compara.

---

# PARTE 8 — INVESTIGAR EL GLOW

Determina exactamente qué estrellas generan glow.

Ten especial cuidado con:

```text
magLimite
glowCorte
```

y cualquier cola de magnitud existente.

Determina si una estrella puede:

```text
ser contabilizada por King
+
generar glow
```

o:

```text
ser contabilizada por King
+
dibujarse individualmente
```

o:

```text
generar glow
+
dibujarse individualmente
```

Si alguna de estas combinaciones ocurre, cuantifica cuánto flujo representa.

---

# PARTE 9 — NO CORREGIR TODAVÍA

Aunque encuentres doble conteo o pérdida:

**NO lo corrijas todavía.**

En esta primera fase solo queremos demostrar:

1. si existe;
2. cuánto representa;
3. en qué condiciones ocurre;
4. qué parte del cúmulo afecta;
5. si es visualmente relevante.

Documenta cualquier anomalía encontrada.

---

# PARTE 10 — TEST DE CONSERVACIÓN

Crea un test específico, por ejemplo:

```text
scripts/test_globulares_v3.js
```

o un nombre equivalente coherente con el proyecto.

El test debe comprobar como mínimo:

### Caso A

```text
magLimite < magResta
```

### Caso B

```text
magLimite ≈ magResta
```

### Caso C

```text
magLimite > magResta
```

Y debe detectar explícitamente:

```text
doble conteo
pérdida de flujo
```

No limites el test a comprobar que las funciones no lanzan errores.

---

# PARTE 11 — PRUEBA CON ESTRELLAS EXTREMAS

Incluye pruebas específicas con:

### Una estrella muy brillante

Debe comprobarse que una estrella brillante no genera una contabilización absurda entre:

```text
King
+
estrella
+
glow
```

### Muchas estrellas

Comprueba el comportamiento con una población densa.

### Pocas estrellas

Comprueba que el resultado no depende accidentalmente de la densidad.

---

# PARTE 12 — DISTANCIA AL CENTRO

Analiza si el problema depende de la posición dentro del cúmulo.

Divide las estrellas, por ejemplo, en:

```text
0–0.25 rc
0.25–0.5 rc
0.5–1 rc
1–2 rc
2 rc–rt
```

o en intervalos equivalentes adecuados.

Queremos saber si el doble conteo/pérdida se concentra:

* en el núcleo;
* en el halo intermedio;
* en las regiones exteriores.

---

# PARTE 13 — RESULTADO MATEMÁTICO

Al finalizar debemos poder responder claramente:

### Pregunta 1

¿Existe doble conteo?

```text
SI / NO
```

### Pregunta 2

¿Existe pérdida de flujo?

```text
SI / NO
```

### Pregunta 3

¿Cuánto flujo representa?

En porcentaje de:

```text
F_Harris
```

### Pregunta 4

¿Depende del telescopio?

```text
SI / NO
```

### Pregunta 5

¿Depende de la distancia al centro?

```text
SI / NO
```

---

# PARTE 14 — SOLO DESPUÉS: EVALUACIÓN VISUAL

Si la contabilidad demuestra una discrepancia significativa, crea un pequeño harness visual en Chrome, como se hizo en:

```text
docs/experimentos/comparacion_halo_rc_local.html
```

Debe utilizar exactamente la secuencia real de render:

```text
haloGlobular
→ pintarHaloGlobular
→ capaEstrellas
→ pintarFot
```

No crees un render simplificado distinto del real.

---

# COMPARACIÓN VISUAL

Si hay una discrepancia demostrada, compara:

```text
CONFIGURACIÓN ACTUAL
```

frente a una futura variante experimental.

Pero en esta fase la variante experimental debe limitarse a:

> la mínima modificación necesaria para corregir la discrepancia encontrada.

No rediseñes el halo.

---

# PARTE 15 — NO INTRODUCIR SOLUCIONES PREMATURAS

No hagas automáticamente ninguna de estas propuestas:

```text
magResta = magLimite
```

ni:

```text
King = King - todas las estrellas Gaia consultadas
```

ni:

```text
eliminar glow
```

ni:

```text
eliminar King
```

ni:

```text
cambiar el límite Gaia
```

ni:

```text
cambiar glowCorte
```

Primero necesitamos conocer la contabilidad real.

---

# PARTE 16 — CRITERIO PARA DECIDIR SI MERECE UNA V4

Solo consideraremos una corrección si existe:

```text
problema cuantificado
+
impacto visual demostrable
```

Un problema puramente matemático pero visualmente irrelevante puede quedar documentado, igual que ocurrió con V2-RC.

No queremos añadir complejidad sin beneficio observable.

---

# PARTE 17 — REGRESIÓN

Durante todo el experimento deben seguir pasando:

```text
scripts/test_globulares.js
scripts/test_globulares_v2.js
scripts/test_globulares_v2b.js
```

y cualquier otra suite relacionada con:

* H2c;
* escala;
* Gaia;
* estrella física;
* quitar estrellas.

No modificar los tests existentes para ocultar regresiones.

---

# INFORME FINAL OBLIGATORIO

Devuelve un informe con esta estructura exacta:

## 1. Estado de V2-A

Confirmar que permanece intacta.

## 2. Pipeline encontrado

Explicar el recorrido real de una estrella Gaia:

```text
consulta
→ selección
→ estrella/glow
→ resta King
→ render
```

## 3. Clasificación de poblaciones

Tabla:

| Población | Se dibuja | Genera glow | Se resta de King | Flujo |
| --------- | --------: | ----------: | ---------------: | ----: |

## 4. Caso A

```text
magLimite < magResta
```

Resultados.

## 5. Caso B

```text
magLimite ≈ magResta
```

Resultados.

## 6. Caso C

```text
magLimite > magResta
```

Resultados.

## 7. Balance de flujo

Para cada caso:

```text
F_Harris
F_King
F_estrellas
F_glow
F_total_representado
error relativo
```

## 8. Dependencia radial

Resultados por distancia al centro.

## 9. Dependencia con el telescopio

Resultados.

## 10. Tests

Lista completa.

## 11. Verificación visual

Si se ha construido el harness:

* qué cúmulos;
* qué equipos;
* qué campos;
* qué diferencias se observan.

## 12. Conclusión

Clasificar como:

```text
MEJORA
NEUTRO
EMPEORA
INCONCLUSO
```

## 13. Recomendación

Indicar claramente una de estas opciones:

```text
NO HACER NADA
```

```text
HACER EXPERIMENTO CORRECTIVO
```

```text
CORRECCIÓN JUSTIFICADA Y LISTA PARA PRODUCCIÓN
```

```text
NECESITA MÁS VERIFICACIÓN VISUAL
```

---

# RESTRICCIÓN FINAL

Esta fase tiene un único objetivo:

> **determinar si la separación actual entre King, estrellas Gaia y glow produce realmente doble conteo o pérdida de flujo dependiendo de la profundidad del equipo.**

No intentes resolver otros problemas encontrados durante la investigación.

Si encuentras:

* problemas de `r_c`;
* problemas de V2-B;
* problemas de H2c;
* problemas de seeing;
* problemas de PSF;
* problemas de adaptación local;

documenta el hallazgo, pero no lo modifiques.

La prioridad es mantener una relación causal clara:

```text
MEDIR
  ↓
DEMOSTRAR
  ↓
CUANTIFICAR
  ↓
VERIFICAR VISUALMENTE
  ↓
DECIDIR
```

No queremos todavía una solución elegante.

Queremos saber primero **qué está ocurriendo realmente con la luz del cúmulo**.

```
```
