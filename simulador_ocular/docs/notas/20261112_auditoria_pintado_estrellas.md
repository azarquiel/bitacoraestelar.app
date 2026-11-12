# Auditoría del pintado de estrellas al cambiar de ocular (2026-11-12)

Pregunta: ¿el simulador de ocular reproduce el comportamiento físico de una estrella Gaia
(flujo integrado, pico, tamaño de PSF, fondo, contraste) al cambiar la focal del ocular, y por
tanto el aumento `M` y la pupila de salida `d`?

## Veredicto

**Incorrecto frente al modelo físico lineal de referencia.** Con `d ≤ P_eye`, el flujo integrado
de la estrella crece ×5–10 al subir aumentos (debería ser constante) y el tamaño aparente de la
PSF apenas cambia (debería crecer ∝ M). Fondo de cielo, campo real y escala de píxel son
correctos. Hay además un bug confirmado: el salto del −50 % en `factorDilucion`.

Causa raíz: el brillo de la estrella se pinta como **margen de detección sobre `mlim`**, no como
flujo, y el tamaño lo fija un **suelo de visibilidad en píxeles**, no la PSF multiplicada por `M`.
Las dos cosas son decisiones documentadas (ADR 0018, ADR 0019 y la sección «Escala aparente del
dibujo» de `simulador_ocular/CONTEXT.md`), así que el fallo de B, D y G no es un error de código
sino un desacuerdo entre el diseño y la referencia física.

## Modelo de referencia

- `M = f/f_e`, `d = D/M = f_e/N`.
- Flujo en el ojo: `F_eye = F_star · A · T · min(1, (P_eye/d)²)`; constante con `d ≤ P_eye`.
- Fondo: `B_eye ∝ B_sky · T · min(d, P_eye)²` por ángulo sólido.
- PSF aparente: FWHM ≈ `M · √((1,03 λ/D)² + θ_seeing²)`.
- Pico ∝ `F_eye · Ω_pix / Ω_PSF`; el flujo integrado no depende de la escala de píxel.

## Montaje de la medida

- Equipo: D 200 mm, f 1200 mm (N = 6), P_eye 7 mm, T 0,8, sqm 21, AFOV 68°, lienzo de 720 px,
  λ 550 nm, seeing 2″ (`CFG.seeingArcsec`).
- Oculares: 55, 40, 32, 25, 17, 12, 9, 6, 4 y 2,5 mm → d de 9,17 a 0,42 mm (21,8× a 480×).
- Estrellas: g = 6, 8, 10, 11,5 y 12,5, en el centro del campo. A partir de g = 10 la aureola
  queda bajo su corte (`alfaAureola ≤ 0,004`).
- Funciones reales del módulo `resources/js/bitacora-gaia-render.js`: `magLimite`,
  `radioEstrella`, `sueloEstrella`, `factorDilucion`, `alfaEstrella`, `ctxFotometrico`,
  `flujoDeValor`/`valorDeFlujo` y la última línea de `pintarFot`
  (`nivelFondo + valorDeFlujo(F, FcieloPintado, rango)`).
- Unidad de flujo: ΣF es el flujo lineal del propio programa, `flujoDeValor(v, Fref)` sumado por
  píxel. Un píxel del lienzo equivale a 5,67′ aparentes y no depende de M.
- **Limitación (ADR 0008):** el arnés copia a mano los stops del degradado de
  `dibujarEstrellaColor` y rasteriza con supermuestreo 4×4. No pasa por `drawImage`, ni por el
  recorte de `lighter`, ni por `adaptacionLocal`.
- Reproducir: `node scripts/harness_auditoria_estrellas.js tabla` y
  `node scripts/harness_auditoria_estrellas.js dil`.

## Geometría y fondo por ocular

| f_e (mm) | M | d (mm) | campo real | ″/px | mlim | SBe | fondo (DN) | FcieloPintado/Fcielo |
|---|---|---|---|---|---|---|---|---|
| 55 | 21,8 | 9,17 | 187,0′ | 15,58 | 12,49 | 21,24 | 29,6 | 1,00 |
| 40 | 30,0 | 6,67 | 136,0′ | 11,33 | 13,35 | 21,35 | 27,8 | 1,00 |
| 32 | 37,5 | 5,33 | 108,8′ | 9,07 | 13,60 | 21,83 | 20,7 | 1,00 |
| 25 | 48,0 | 4,17 | 85,0′ | 7,08 | 13,85 | 22,37 | 14,3 | 1,00 |
| 17 | 70,6 | 2,83 | 57,8′ | 4,82 | 14,22 | 23,21 | 6,8 | 1,00 |
| 12 | 100,0 | 2,00 | 40,8′ | 3,40 | 14,52 | 23,96 | 3,4 | 1,00 |
| 9 | 133,3 | 1,50 | 30,6′ | 2,55 | 14,74 | 24,59 | 1,9 | 1,00 |
| 6 | 200,0 | 1,00 | 20,4′ | 1,70 | 14,89 | 25,47 | 0,9 | 1,43 |
| 4 | 300,0 | 0,67 | 13,6′ | 1,13 | 14,89 | 26,35 | 0,4 | 3,22 |
| 2,5 | 480,0 | 0,42 | 8,5′ | 0,71 | 14,89 | 27,37 | 0,1 | 8,23 |

`mlim` se congela en 14,89 a partir de d ≈ 1 mm por el corte de fondo nulo (Crumey Ec. 70,
`FOT.SB_FONDO_NULO` = 25,08). `FcieloPintado` sube por encima de `Fcielo` cuando SBe pasa de
`FOT.SB_SUELO_PINTADO` (25,08) y comprime el incremento de la estrella en pantalla.

## Estrella g = 10 por ocular (sin aureola)

| f_e | Rtot (px) | suelo (px) | alfa | pico antes de pintarFot | pico en pantalla | ΣV | Σ en pantalla | FWHM aparente | FWHM física esperada |
|---|---|---|---|---|---|---|---|---|---|
| 55 | 2,41 | 2,41 | 0,263 | 64,1 | 64,1 | 559 | 559 | 19,1′ | 0,76′ |
| 40 | 2,41 | 2,41 | 0,352 | 86,1 | 86,1 | 751 | 751 | 19,1′ | 1,04′ |
| 25 | 2,42 | 2,41 | 0,405 | 99,1 | 99,1 | 867 | 867 | 19,2′ | 1,67′ |
| 12 | 2,44 | 2,41 | 0,475 | 116,2 | 116,2 | 1034 | 1034 | 19,3′ | 3,47′ |
| 9 | 2,46 | 2,41 | 0,499 | 121,9 | 121,9 | 1102 | 1102 | 19,5′ | 4,63′ |
| 6 | 2,51 | 2,41 | 0,515 | 126,1 | 117,5 | 1191 | 1058 | 19,9′ | 6,95′ |
| 4 | 2,64 | 2,41 | 0,515 | 126,3 | 98,5 | 1312 | 872 | 20,9′ | 10,42′ |
| 2,5 | 2,96 | 2,41 | 0,515 | 126,8 | 77,0 | 1650 | 747 | 23,5′ | 16,67′ |

Flujo lineal ΣF/Fref (antes de `pintarFot`), cociente entre 2,5 mm y 40 mm: ×5,3 con g = 6,
×6,4 con g = 10 y ×10,0 con g = 12,5. Cociente entre 55 mm (d > P_eye) y 40 mm: ×0,442 con g = 6,
×0,449 con g = 10, ×0,357 con g = 11,5, contra ×0,583 esperado.

## Tabla de pruebas

| Prueba | Esperado | Observado | Error | Veredicto | Causa / corrección |
|---|---|---|---|---|---|
| A. Campo real | AFOV/M | `arcmin = afov·60/M` exacto | 0 % | OK | — |
| A. Escala de píxel | ∝ 1/M | de 15,58″/px (21,8×) a 0,71″/px (480×) | 0 % | OK | — |
| B. Flujo con d ≤ P (40 → 2,5 mm) | constante (×1,00) | ΣF ×5,3 (g6), ×6,4 (g10), ×10,0 (g12,5) | +430 % a +900 % | **FALLO** | alpha = rampa(mlim − g) y mlim sube 1,54 mag hasta congelarse en d0 ≈ 1 mm. Decisión documentada (ADR 0018); no cumple la referencia. |
| B. ¿Ley multiplicativa? | mismo cociente para todo g | el cociente depende de g (×5,3 frente a ×10) | — | **FALLO** | La rampa es lineal en magnitudes: el margen añadido pesa más en las tenues. |
| G. d > P (55 frente a 40 mm) | ×0,583 | ×0,442 (g6), ×0,449 (g10), ×0,357 (g11,5) | −24 % a −39 % | **FALLO** | El viñeteo entra por mlim (D_eff y fondo), no como factor de flujo. Dirección correcta, tamaño no. |
| C. Fondo por píxel | ∝ T·min(d,P)²; satura con d ≥ P | SBe de 21,24 → 23,96 (d = 2) → 27,37; con d = 9,17 vale sqm − 2,5·log T | < 0,01 mag | OK | Satura bien a nivel de ojo desnudo. |
| D. FWHM aparente | de 1,04′ a 16,7′ (×16) | de 19,1′ a 23,5′ (×1,23), g = 10 | ×18 a 30×; ×1,41 a 480× | **FALLO** | Manda el suelo de visibilidad (`sueloEstrella`), fijo en px. Por debajo de ~300× el lienzo tampoco puede muestrear la PSF (5,67′/px). |
| D. FWHM según g | no depende de g | 3,21 px (g12,5) frente a 4,9 px (g6) | — | FALLO (decisión) | `radioSueloMag` da más tamaño a las brillantes; convención de atlas, acotada a 3,0×. |
| E. Dilución | continua y conserva ΣV | D = 70 mm, f = 700 mm, g = 10: ΣV pasa de **1030 a 515** entre 333× y 341× | **−50 % de golpe** | **FALLO (bug)** | `factorDilucion` vale 1 hasta `Rtot = suelo·√2` y en ese punto devuelve `suelo²/Rtot² = 0,5`. Corrección: `2·suelo²/Rtot²`. |
| E. Dilución en uso real | conserva flujo en sobreaumento | con 200 mm no se activa por debajo de ~600× | — | FALLO | Hasta ahí ΣV crece sin freno. |
| Pico en pantalla, g = 10 | constante hasta ~160× (PSF < 1 px) y luego ∝ 1/M² | 86 (30×) → 122 (133×) → 77 DN (480×) | sube +42 % y luego baja | FALLO / INCIERTO | Sube por mlim. Solo baja por `SB_SUELO_PINTADO`. |
| F. Contraste pico/fondo | consistente con fondo y PSF | el fondo cae a 0,1 DN y el contraste en DN deja de tener sentido | — | INCIERTO | La estrella se mide contra `Fref`/`Fcielo` antes de la pupila, no contra el fondo pintado. |
| PSF física | combinar FWHM con FWHM | Airy como *radio* 1,22λ/D más seeing como *HWHM*, en cuadratura | radio +17 % (200 mm), +70 % (70 mm) | INCIERTO | Mezcla de convenciones. Con el perfil del sprite (FWHM = 0,70·Rtot) queda un −18 % neto. |
| I. Banda G → V | mlim es visual (V); habría que convertir G | el render no convierte G→V | — | INCIERTO | Falta medir G − V (Riello et al. 2021) en función de BP−RP. Si G − V ≈ −0,4 en las rojas, se pintan ~0,4 mag de más. |
| E. Recorte de 8 bits | ninguno en estrellas no saturadas | pico 231 DN con g = 6 | — | INCIERTO | Falta medir g < 6 en `capaEstrellas` (pasadas de ganancia). |
| K. Viñeteo de borde | separado de la fotometría | no medido | — | INCIERTO | Falta: misma estrella a r = 0; 0,5 y 0,9 del campo. |
| L. Estrella frente a extensa | leyes separadas | estrellas por mlim/alpha; extensas por SBe/Cmin | — | OK (estructura) | — |

## Bugs, por prioridad

1. **Confirmado: salto del −50 % en `factorDilucion`.** Al cruzar `Rtot = suelo·√2` el factor
   pasa de 1 a 0,5 en un paso. Corrección de una línea: `2*suelo*suelo/(Rtot*Rtot)`. Afecta a
   equipos pequeños con mucho aumento (con 70 mm, a partir de ~340×).
2. **Decisión del proyecto que falla la referencia: el flujo estelar crece con M** (ADR 0018/0019).
   No se propone volver a la rama de flujo (`CFG.alfaPorFlujo`), probada y descartada en el
   ADR 0018. Lo pendiente es separar «flujo» (constante con d ≤ P_eye) de «margen de detección».
3. **Decisión del proyecto que falla la referencia: la PSF no escala con M.** El suelo de
   visibilidad tapa el término físico hasta ~300× con 200 mm.
4. **Sospechoso: el viñeteo con d > P_eye cae un 24–39 % más que (P_eye/d)².**
5. **Sospechoso: Gaia G usada como V contra un mlim visual.** Pendiente de la medida de la fila I.

## Medidas que faltan

- Gráficas de ΣF, pico, FWHM y fondo frente a d: los datos salen de
  `node scripts/harness_auditoria_estrellas.js tabla`.
- Render real: pasar por `dibujar` con el ctx falso de `scripts/test_alfa_apertura.js`, para
  incluir aureola, `lighter` y `adaptacionLocal`.
- Fila I: G − V en función de BP−RP para cinco colores.
- Fila K: la misma estrella a tres radios del campo.
- Recorte de 8 bits con g < 6.
