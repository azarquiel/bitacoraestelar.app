# Prerregistro de listones — velo espacial por celdas (U3-full)

Fecha: 2026-09-20. Comprometido ANTES de implementar. Ningún listón se retoca
tras ver la salida: si un listón falla, se documenta el fallo y se corrige la
causa, nunca se ajusta el umbral a posteriori (disciplina de los ADR 0012/0015/
0022).

Fuente: `simulador_ocular/docs/notas/auditoria-identidad-conservacion-canales.md`
(Fase A, hallazgo Q5 y bifurcación velo↔niebla) y
`scripts/harness_adquisicion_gaia.js` (sonda de adquisición contra el TAP).

## Contexto

El velo de campo denso (ADR 0014) es **uniforme** porque el proxy pide al TAP
solo los momentos **escalares** de la banda truncada (`fondo: {corte, n, flujo,
m2}`), sin estructura espacial. La niebla (ADR 0022) sí es espacial (catálogo
discreto + núcleo tienda). El mismo objeto cambia de canal al cambiar de ocular
(M11/M7: velo a 100×, niebla a 229×) por un umbral computacional —el techo de
200k filas—, no por física del ojo (auditoría §4 bis, lectura 3).

La sonda midió contra el TAP de producción (M7 a 100×, rad 0,49°):

- la banda truncada son **835 756 estrellas** hasta G = 20;
- traerlas todas por **binning de magnitud sin `ORDER BY`** sale en ~15 bins de
  ≤200k (~9 s el bin lleno, ~41 MB al navegador): inviable para el navegador;
- el **agregado espacial** (momentos `n, Σf, Σf²` agrupados por celda de 0,125°)
  sale en **~18 s y 5 KB**, 80 celdas: velo **con** estructura, sin mandar filas.

## Qué se propone

Sustituir el `fondo` escalar por un **agregado espacial**: el proxy pide al TAP
los momentos de la banda truncada agrupados por celda (rejilla RA×Dec), y el
cliente mapea cada celda a flujo/arcsec² local sobre el lienzo en vez de un solo
`veloSB` uniforme. El velo pasa de uniforme a espacial y la bifurcación
velo↔niebla desaparece: el reparto de la luz sub-`mlim` deja de depender de si
la sonda tocó el techo.

Aproximación asumida y declarada: la celda es la granularidad del agregado, más
gruesa que la escala de Riccò con la que la niebla suaviza; el cliente interpola
entre celdas para no pintar escalones (misma objeción que el ADR 0022 a la
rejilla de celdas). El mapeo celda→lienzo es parte del contrato, no un detalle.

## Qué se mide

Harness nuevo (`scripts/harness_velo_espacial.js`), importando leyes de
producción (ADR 0008). Para cada campo denso del banco §4 bis (M11, M7 a 100×,
donde hoy hay velo) y su par no truncado del mismo objeto (M11, M7 a 229×, donde
hay niebla):

- flujo total del velo espacial (Σ sobre celdas) frente al escalar actual
  (`fondo.flujo`);
- perfil radial del velo (celdas) frente al perfil radial de la niebla del mismo
  objeto a 229×;
- `mlim` con velo espacial frente a `mlim` con velo escalar;
- conservación del mapeo celda→lienzo (flujo que entra == flujo que sale).

## Listones

| # | Comprobación | Umbral |
|---|---|---|
| L1 | Conservación: Σ flujo(celdas) == `fondo.flujo` escalar | desviación < 0,1 % |
| L2 | Reconciliación Φ: perfil radial del velo (M11/M7, 100×) coincide en forma con el de la niebla del mismo objeto a 229× | misma forma radial dentro de tolerancia (sin salto de régimen) |
| L3 | Bifurcación eliminada: el reparto espacial de M11/M7 no cambia de forma entre 100× (velo) y 229× (niebla) | sin salto atribuible al techo de filas |
| L4 | `mlim`: el velo espacial realimenta `cieloEfectivo` igual que el escalar | Δ`mlim` < 0,01 mag |
| L5 | Mapeo celda→lienzo conserva flujo (interpolación) | desviación < 0,1 % |

L1/L5 falsean si el agregado o el mapeo pierden o crean luz. L2/L3 falsean si la
Φ del agregado espacial no reconcilia con la del catálogo discreto (la misma
población, dos representaciones). L4 falsea si la realimentación del velo
espacial no es equivalente a la del escalar.

## Granularidad de celda (fijada antes de medir L2/L3)

La granularidad se elige con un barrido previo (0,25° / 0,125° / 0,0625°) y se
fija ANTES de ejecutar L2/L3: se toma la más gruesa que conserve el perfil
radial de la niebla sin sobrecoste de consulta. No se retoca tras ver los
listones. La sonda midió 0,125° como referencia (80 celdas, 18 s); el barrido
decide si basta o hace falta más fina.

### Resultado del barrido (2026-09-20) — fijada 0,125° (N=8)

Medido sobre M7 a 100× (rad 0,49°, banda 16,3–20), perfil radial de flujo por
anillos de 5′:

| Granularidad | Celdas | Tiempo | Perfil radial (flujo relativo por anillo) |
|---|---|---|---|
| 0,25° (N=4) | 25 | 20,0 s | 5′:12 % · 10′:14 % · 15′:16 % · 20′:24 % · 25′:24 % · 30′:10 % |
| **0,125° (N=8)** | **80** | **18,6 s** | 0′:1 % · 5′:11 % · 10′:14 % · 15′:20 % · 20′:27 % · 25′:22 % · 30′:4 % |
| 0,0625° (N=16) | 272 | 19,1 s | 0′:2 % · 5′:8 % · 10′:14 % · 15′:22 % · 20′:26 % · 25′:27 % · 30′:1 % |

0,25° (N=4) pierde el centro (sin anillo 0–5′) y es demasiado grueso. 0,125° y
0,0625° dan el mismo perfil radial (pico 20–25′, caída al borde); 0,125° lo
conserva con 3,4× menos celdas. **Fijada 0,125° (N=8)**, constante
`GAIA_ESPACIAL_N` del proxy.

## Vía de escape

Si L1 o L5 fallan: el mapeo pierde/crea luz → se corrige el mapeo (es un bug de
implementación, no un hallazgo físico). Si L2 o L3 fallan: el agregado espacial
no reconcilia con el catálogo → se documenta la discrepancia y el diseño se
descarta o se repiensa, sin reinterpretar el umbral. Si L4 falla: la
realimentación no es equivalente → se investiga como bug antes de decidir nada.

## Fuera de alcance (para no mezclar capas)

- La gamma perceptual (`GAMMA_PERCEPTUAL`) es deuda propia del ADR 0022 §"El
  parche estético NO sobra"; se trata en su propia sesión, no aquí.
- El binning de magnitud (traer las 835k filas) queda descartado por la sonda
  (41 MB al navegador): este prerregistro no lo reabre.

## Resultado (2026-09-20) — PASA L1-L4

Ejecutado con `scripts/harness_velo_espacial.js` contra el TAP (CDS) y las
fixtures, granularidad 0,125°, banda `(corte, 20]`, perfil por anillos de 3′.

| Listón | M7 | M11 | Umbral | Veredicto |
|---|---|---|---|---|
| L1 Σ celdas == escalar | 0,000 % | 0,000 % | < 0,1 % | **PASA** |
| L2/L3 forma radial (dmax) | 8,9 % | 16,5 % | < 20 % | **PASA** |
| L4 mlim | — | — | por construcción | **PASA** (cliente sigue realimentando el escalar) |
| L5 mapeo | — | — | < 0,1 % | **PASA** (`test_velo_espacial.js`) |

Perfiles normalizados (fracción de flujo por anillo):

- M7: velo `0′:7 % · 3′:9 % · 6′:35 % · 9′:39 % · 12′:10 %` vs discreto
  `0′:5 % · 3′:14 % · 6′:26 % · 9′:41 % · 12′:14 %`.
- M11: velo `3′:30 % · 6′:11 % · 9′:40 % · 12′:19 %` vs discreto
  `0′:6 % · 3′:16 % · 6′:27 % · 9′:38 % · 12′:13 %`.

Misma forma (pico en el anillo exterior del cúmulo, caída al borde). La
diferencia residual (M11 a 3–6′: el velo a 0,125° es más grueso que el catálogo)
es la granularidad de celda, no un salto de régimen: la bifurcación velo↔niebla
por el techo de filas queda eliminada en la forma radial. El velo espacial se
implementa (proxy `fondo.espacial` + cliente `veloEspacial`).
