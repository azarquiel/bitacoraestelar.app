# Informe E1 — histograma de profundidad (eje 1, ADR 0012)

**Veredicto: NO PASA — no implementar la Fase 1 por la vía del COUNT previo.**

Medido el 2026-08-18 contra `tapvizier.cds.unistra.fr` (`I/355/gaiadr3`), radio 0,89°,
profundidad de control G≤20, TOP 40000. Protocolo del preregistro: 3 repeticiones
intercaladas por campo, mediana por fase, equivalencia por conjunto de `Source`.
Arnés: `scripts/harness_gaia_e1_histograma.js`. Crudos: `scripts/salida_gaia_e1_a.json`
(M7, M6, Cygnus) y `scripts/salida_gaia_e1_b.json` (M13, Virgo, polo).

## Resultados (medianas de 3 repeticiones)

| Campo | Régimen | hist | rec | control | Gmax | L1 equiv | Listón económico |
|---|---|---|---|---|---|---|---|
| M7 | saturante fuerte | 15,15 s | 4,44 s | 12,17 s | 15,5 | PASA | L2 0,62× — NO PASA |
| M6 | saturante | 10,43 s | 2,81 s | 3,34 s | 17,5 | PASA | L2 0,25× — NO PASA |
| Cygnus | saturante | 3,54 s | 2,34 s | 2,26 s | 19,0 | PASA | L2 0,39× — NO PASA |
| M13 | saturante justo | 1,38 s | 1,67 s | 2,58 s | 20,0 | PASA | L2 0,85× — NO PASA |
| Virgo | no saturante | 1,12 s | 1,26 s | 1,22 s | 20,0 | PASA | L3 1,12 s — NO PASA |
| Polo N | no saturante | 1,15 s | 1,24 s | 1,30 s | 20,0 | PASA | L3 1,15 s — NO PASA |

Listones preregistrados (ADR 0012): L2 = speedup neto `control/(hist+rec)` ≥ 3× en cada
campo saturante; L3 = sobrecoste del histograma ≤ 1 s en no saturantes; L4 = el COUNT solo
se acepta si su coste es pequeño frente al ahorro. L4 no llega a evaluarse como ratio:
**no hubo ahorro en ningún campo** (de −0,47 s a −9,89 s).

## Lo que sí quedó demostrado

- **La corrección estructural funciona: L1 al 100 %.** En las 18 repeticiones con dato, el
  conjunto de `Source` de la consulta recortada fue idéntico al del control. El Gmax del
  primer escalón acumulado ≥ 40 000 es superconjunto exacto, sin margen que calibrar.
- **El recorte en sí ahorra donde satura fuerte**: rec = 4,4 s frente a control = 12,2 s en
  M7 (y 28 s el día anterior). El problema no es recortar: es lo que cuesta AVERIGUAR el
  Gmax preguntándoselo al TAP.

## Por qué muere la vía del COUNT

El `COUNT ... GROUP BY FLOOR(Gmag/0,5)` recorre las mismas filas del círculo que la
consulta entera, y en VizieR esa agregación cuesta sistemáticamente **igual o más** que su
`ORDER BY + TOP` optimizado (M6: 10,4 s de histograma contra 3,3 s de consulta completa).
La premisa «contar sin ordenar es barato» es falsa en este servidor. Con el histograma
gratis, M7 daría hoy ~2,7× — tampoco alcanzaría el listón de 3×.

Hallazgos operativos del servidor, relevantes para cualquier E futuro:

- **`FLOOR` es soporte intermitente**: nodos del balanceador de TAPVizieR lo aceptan y
  otros responden `400 Incorrect ADQL query`. También aparecen `400 unresolved
  identifiers` y `503 too busy` intermitentes, y alguna respuesta JSON truncada. Todo
  arnés contra este servicio necesita reintentos con backoff y pausas entre consultas
  (la tirada sin pausas acabó en cascada de 503).
- **Varianza enorme**: el control de M7 osciló entre 10,4 s y 57,2 s en la misma sesión
  (28 s el día anterior). Una sola medida no vale nada aquí; la mediana de repeticiones
  intercaladas es el mínimo honesto.
- M13 con radio 0,89° y G≤20 **sí satura** (justo por encima de 40 000): el histograma
  elige Gmax = 20,0 y el recorte no recorta nada.

## Decisión que activa el preregistro

Por el criterio del ADR 0012, la profundidad adaptativa por COUNT previo queda
**descartada con medidas**. Vías que siguen vivas, sin decidir:

1. **Escalera iterativa (E1-bis)**: consulta con profundidad conservadora estimada sin
   red (por ejemplo, por densidad local precalculada offline) y segunda consulta más
   honda solo si falta. Es la caída prevista en la especificación; exigiría su propio
   experimento y su propio listón.
2. **Pasar directamente al eje 2** (E2–E6, teselado): ortogonal por diseño; nada de lo
   medido aquí lo toca. El recorte de la cola de glow (PR #78) sigue siendo decisión de
   producto independiente.
