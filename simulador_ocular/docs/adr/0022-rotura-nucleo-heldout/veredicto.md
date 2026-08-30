# Veredicto — validación held-out de Φ″ (ADR 0022)

Fecha ejecución: 2026-08-30. Una única corrida de `scripts/veredicto_heldout_phi2.js`
contra los listones congelados en `prerregistro.md`. Nada retocado tras verla.

## Resultado

U″ (ancla M13/200mm/120x, heredado de ADR 0018) = 1.977118e-1

**50 casos con listón binario, 14 fallan. FALSA.**

11 casos "intermedio" quedan fuera del listón, como estaba previsto.

## Fallos (14/50)

| Cúmulo | Aumento | Clasificación | Φ″ | Signo |
|---|---|---|---|---|
| NGC 6254 (M10) | 70x | nebuloso | 4.15e-1 | Φ″≥U″, debía ser <U″ |
| NGC 6254 (M10) | 99x | nebuloso | 7.37e-1 | Φ″≥U″, debía ser <U″ |
| NGC 5904 (M5) | 70x | resuelto | 7.23e-3 | Φ″<U″, debía ser ≥U″ |
| NGC 5904 (M5) | 98x | resuelto | 9.42e-2 | Φ″<U″, debía ser ≥U″ |
| NGC 6333 (M9) | 99x | resuelto | 1.18e-1 | Φ″<U″, debía ser ≥U″ |
| NGC 6205 (M13-18″) | 70x | resuelto | 1.16e-1 | Φ″<U″, debía ser ≥U″ |
| NGC 6402 (M14) | 216x | resuelto | 1.44e-1 | Φ″<U″, debía ser ≥U″ |
| NGC 6838 (M71) | 70x | nebuloso | 4.28e-1 | Φ″≥U″, debía ser <U″ |
| NGC 7078 (M15) | 98x | resuelto | 3.76e-16 | Φ″<U″, debía ser ≥U″ |
| NGC 7078 (M15) | 216x | resuelto | 1.13e-1 | Φ″<U″, debía ser ≥U″ |
| NGC 7089 (M2) | 70x | resuelto | 7.75e-17 | Φ″<U″, debía ser ≥U″ |
| NGC 7089 (M2) | 99x | resuelto | 2.35e-16 | Φ″<U″, debía ser ≥U″ |
| NGC 7089 (M2) | 219x | nebuloso | 2.80e-1 | Φ″≥U″, debía ser <U″ |
| NGC 7089 (M2) | 273x | nebuloso | 4.52e-1 | Φ″≥U″, debía ser <U″ |

## Patrón

No es ruido disperso. Dos direcciones sistemáticas:

- **M2 y M15 invierten el orden**: el observador reporta núcleo resuelto a
  aumento bajo/medio y "se pierde" a aumento más alto (ya señalado como no
  monotónico en el prerregistro, atribuido por el propio observador a
  foco/seeing). Φ″ crece monótono con el aumento por construcción — no
  puede reproducir esa no-monotonicidad, así que falla en ambos extremos.
- **M5, M9, M10, M13-18″, M14, M71 exigen menos aumento del que Φ″ concede**:
  en 6 de los 9 cúmulos "normales" (monotónicos), el primer aumento o los dos
  primeros ya reportan núcleo resuelto con Φ″ órdenes de magnitud por debajo
  de U″. La métrica subestima sistemáticamente la resolución a aumento
  bajo-medio en el banco de 458 mm.

## Precondición de validez

Cumplida: 9 de los 13 cúmulos held-out son monotónicos y sirven de prueba
limpia; M2/M15 no monotónicos se congelaron tal cual sin suavizar, como fija
el prerregistro — su fallo es evidencia, no un caso inválido a descartar.

## Conclusión

Φ″ **falsada** en validación held-out. Se abre la iteración (b) sobre el
render (#113), con la variable ya acotada en el prerregistro de ADR 0018 §4:
partición de Δ o forma de `m_res`. Requiere su propio prerregistro y
grilling — no se empieza en este commit.
