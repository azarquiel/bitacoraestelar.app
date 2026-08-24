# Informe Fase 4 — Auditoría del déficit de señal débil extensa

Fecha: 2026-08-15. Configuración fija: 457,2 mm · 190× · SQM 21,2 · δ=2 · SIZE 720.
Objetos: M51, M81, M104, M101, NGC 205. ROIs congeladas a priori
(`scripts/rois_M51.json`, `scripts/rois_M101.json`, `scripts/rois_M81.json`).
Paridad bit a bit (dmax=0) y SHA-1 de fotometría idéntico al baseline de Fase 3
verificados en los 5 objetos antes de cualquier medida (columna `sha_fotometria`
de `tabla_resumen.csv`).

## 0. Localizaciones (Tarea 0.2)

Todas en `resources/js/bitacora-gaia-render.js` (solo lectura; nada tocado):

| Qué | Dónde |
|---|---|
| Estimación de cielo | `ps1Cielo` (línea 1594), `ps1SigmaCielo` (1614) |
| Anclaje y cero del parche | `ps1AnclarACatalogo` (2274); suelo = cielo + kRuido·σ, kRuido=1,5 (2287); corte NaN v<cielo−2σ (2288) |
| Escala de mezcla s | `ps1EscalaMezcla` (2019); aplicación en `ps1PintarParche` (2550) |
| Mezcla imagen/modelo | `ps1PintarParche`, línea 2650: `wv·s·fv + (1−wv)·fm` |
| Opacidad H2c | `sbUmbralContraste` (2242), `ps1Opacidad` (2249) |
| Cero del mapeo a pantalla | `pintarFot` (472); nivel = `nivelFondo + valorDeFlujo(F, Fcielo, rango)` (532) |

Dos ceros distintos por diseño: el parche anclado resta el **suelo** (cielo + 1,5σ),
el mapeo a pantalla usa **Fcielo** (SQM). El offset resultante es deliberado
(anti-pedestal) y vale kRuido·σ·kanc por píxel: 4,2–11,6 % de Fcielo según objeto.

## 1. Cierre aritmético

La descomposición exacta de la mezcla,
`f_mez − f_bil = (s−1)·T1 + Σpe·(1−wv)·(fm−fv)/Σpe`,
cierra píxel a píxel: **1231/1231 exacto, 0 malos** (M51; análogo en el resto).
La cadena medida etapa a etapa (anclado → PSF → bilineal → mezcla → opacidad)
reproduce el render de producción sin residuo.

## 2. Veredicto de la firma

Regresión global déficit vs señal (M51): pendiente 0,305, intercepto ≈ 0
(−5·10⁻¹⁰), r² 0,63. M81: pendiente 0,291, r² 0,34. Firma **mixta**: la
pendiente global está inflada por dilución (compara anclado nearest contra
mezcla suavizada); el componente real de s, medido por etapa, es
**multiplicativo puro**: dmag_bilineal→mezcla es una constante por parche
(mediana = p10 = p90 = 0,153 mag en M51) igual a −2,5·log10(s).

## 3. Veredicto por hipótesis

### H-F3 (doble referencia de cero) — DESCARTADA

Test de ceros sintético (`--ceros`): el pipeline coincide con el modelo de
resta única E1/E2 con Δ ≤ 3·10⁻⁶ niveles en los tres escenarios (cielo,
cielo+1σ, cielo+3σ). No hay doble resta de cielo ni un δ con referencia
distinta. Los estimadores son insesgados: en M51 el cielo estimado es
−0,64 DN con σ 27,6 (compatible con cero).

### H-F4 (PSF/bilineal) — DESCARTADA

Δmag(anclado→PSF) lejos de NaN ≈ 0 (mediana −0,011 mag en IB-O de M51, n=106).
El contrafactual sin PSF recupera ≤ 10 % del déficit (8,9 % mediana en M51).
PSF y bilineal suman 12–15 % y 11–12 % de atribución respectivamente, pero son
redistribución local, no pérdida sistemática.

### H-F2 (cielo sesgado alto) — DESCARTADA como estimador

Contrafactual con cielo por anillos 2–3×d25: cielo −0,20 vs −0,64 DN.
Recuperación 3,6 %, negros por ROI idénticos. El estimador de producción no
sesga. **Pero** el componente estructural del cero sí pesa: no es el cielo,
es el suelo (kRuido·σ), ver §4.

### H-F1 (escala de mezcla s) — IDENTIFICADA, corrección inaceptable

s comprime toda la imagen en exactamente −2,5·log10(s) mag uniformes:
M51 +0,153 (s=0,869), M81 +0,240 (s=0,802), M101 +0,461 (s=0,654),
M104 +0,055, NGC 205 −0,023. La atribución del tramo anclado→mezcla al
término (s−1)·T1 es 110–115 %. Pero s es la **ley de presupuesto**
(Σmezcla = Σimagen anclada), no un bug: quitarlo (CF-s1) infla el flujo
0–20″ +15,1 % (M51) / +24,7 % (M81) y el campo +10,7 % / +17,6 %, violando
el criterio de ≤0,5 %. La variante s solo sobre señal fuerte (CF-sdebil)
degenera a s=0 y destruye el render (recuperación −8,3, flujo 0–20″ −100 %).

## 4. Hallazgo central: la premisa estaba mal planteada

El interbrazo crudo a +2σ equivale a mag 24,07/arcsec² en M51, ya **1,1 mag
por debajo** del umbral H2c a 190×/21,2 (22,97). La cadena no atenúa esa señal
0,5 mag: el suelo (cielo + 1,5σ) la **borra** (anclado = 0 en >50 % de los
píxeles interbrazo; mediana anclada 25,52) y la mezcla la **reconstruye**
parcialmente vía perfil y vecinos hasta 23,4–24,1. En M81, IB-N sale todo NaN
del anclaje y la mezcla lo resucita desde el modelo. La señal interbrazo es
genuinamente sub-umbral en esta configuración; lo que se ve en pantalla ya es
un regalo del perfil, no un déficit de la imagen.

El contrafactual del suelo (v≥suelo → v−cielo, CF-suelo) abrillanta los
interbrazos (−0,1..−0,2 mag en M51; −0,4..−0,7 en M81) pero cuesta −5,4 % /
−4,7 % de flujo en 0–20″: RECHAZADO. El pedestal que el suelo evita vale más
que lo que devuelve.

## 5. Contrafactuales contra criterios

Criterio de «causa demostrada»: recuperación ≥ 60 % del déficit **y** flujo
0–20″ y campo dentro de ±0,5 % **e** invariantes (Cmin, nivelFondo, rango)
intactos. Resultado (`tabla_contrafactuales.csv`):

| Objeto | CF | Recuperación | ΔF(0–20″) | ΔF(campo) | Veredicto |
|---|---|---|---|---|---|
| M51 | s1 | 152 % | +15,1 % | +10,7 % | RECHAZADO |
| M51 | sdebil | −826 % | −100 % | −70,8 % | RECHAZADO |
| M51 | cielo | 3,6 % | +0,02 % | 0,0 % | RECHAZADO |
| M51 | suelo | −31 % | −5,4 % | 0,0 % | RECHAZADO |
| M51 | psf | 8,9 % | 0,0 % | +0,3 % | RECHAZADO |
| M81 | s1 | 84 % | +24,7 % | +17,6 % | RECHAZADO |
| M81 | suelo | −69 % | −4,7 % | 0,0 % | RECHAZADO |

**Ningún contrafactual cumple.** No hay causa demostrada corregible.

Nota de honestidad metodológica: el píxel sintético no se re-ejecuta bajo cada
contrafactual; H-F3 queda cubierta por los modelos independientes E1/E2 del
test `--ceros`, que reproducen el pipeline con y sin la hipotética doble resta.

## 6. Sin especificación de Fase 5

La especificación de Fase 5 estaba condicionada a demostrar una causa con
corrección aceptable. No la hay: el componente dominante (s) es la ley de
presupuesto y su retirada viola la fotometría global; el segundo (suelo) es
el anti-pedestal y su retirada cuesta flujo central; el resto (PSF, bilineal,
cielo, doble cero) queda exonerado con datos. El «déficit» restante es señal
sub-umbral que el modelo ya reconstruye parcialmente. No se propone cambio de
producción.

## 7. Implicaciones para el anclaje absoluto H2

- La fotometría global (flujo 0–20″ y de campo) está anclada al catálogo por
  construcción (`ps1AnclarACatalogo` reescala k para Σ=flujo de catálogo):
  el cero absoluto de H2 no hereda el efecto s, que actúa después y se
  compensa en el presupuesto total.
- El único sesgo heredable al calibrar C∞ sobre renders actuales es el efecto
  del suelo en la apertura 0–20″: ≈5 % de flujo, es decir **≤0,06 mag**, no
  las ~0,5 mag temidas al abrir la fase.
- Orden correcto: no recalibrar C∞ antes de decidir sobre s/suelo — y como no
  se propone ningún cambio sobre s ni sobre el suelo, la calibración H2c
  vigente (K=2,0, `FOT.H2C`) sigue siendo válida tal cual.
