# Informe Fase 2 — Barrido de escala del soporte de la rampa de opacidad

**Fecha:** 15-ago-2026 · **Rama:** `fase2-soporte-rampa` (desde `fase1-diagnostico-interbrazos`)
**Configuración:** 457,2 mm · 190× · SQM 21,2 · lienzo 720 px · AFOV 70° · δ = 2 niveles
(idéntica a Fase 1). **Paridad:** la réplica con soporte de producción (25″)
coincide **bit a bit** con `ps1PintarParche` en los cinco objetos (dmax = 0), el
mapa de soporte coincide elemento a elemento con `ps1SoporteLocal`, y reproduce
el baseline de la Fase 1 al píxel exacto donde existe (M51/M81/M104).
La fotometría pre-opacidad es bit a bit idéntica en todas las escalas del
barrido (huella SHA-1 del buffer lineal): la escala del soporte solo cambió `op`.

## Veredicto global: **H-D DESCARTADA** (y la Tarea 2 queda acotada: imposible)

Ninguna escala de la parrilla —ni la serie física hasta α = 4— reduce la
fracción negra clase (b) de las ROIs interbrazo más de un **12,5 %** (criterio:
≥ 80 %). El **techo del enfoque completo**, medido con el máximo píxel a píxel
sobre las cinco escalas de la parrilla (corrida exploratoria, ver abajo), es
**20,4 %**. Como `ps1Opacidad` es monótona en el flujo, la opacidad de
cualquier conjunto multiescala de la Tarea 2 ({25,75}, {25,100}, {25,75,200})
está acotada por ese máximo: **ningún conjunto puede cumplir el criterio**, así
que la Tarea 2 no se ejecutó, conforme al protocolo (H-D descartada → cierre).

## Por qué se revirtió `opacidadInternaEscena` (arqueología de c99b72c)

Las dos cosas, y una tercera:

1. **Borde geométrico**: forzar op = 1 dentro de la elipse μ=25 convierte la
   elipse en *fuente*: el fondo sub-umbral de dentro se resucita entero y se
   pinta como envolvente circular — en M101 a 190×, 380 160 px del lienzo que
   estaban a nivel de cielo salían con señal (la elipse entera).
2. **La condición geométrica uniforme no distingue** protección de fuente de
   luminancia: la variante suavizada (subir solo la opacidad parcial) quitaba el
   97,7 % de la envolvente pero **posterizaba el cuerpo de M81**.
3. El sustituto vigente (soporte local de 25″, sin geometría) ya conseguía lo
   medible sin regresión: amplificación brazo/interbrazo de ×1,6–×178 a
   ×1,00–×2,03, ningún píxel baja, brazos bit a bit iguales.

**Restricción de diseño heredada:** protección de estructura interna **sin
fronteras geométricas duras**. Ninguna variante del barrido introduce frontera
(los PNG de diferencia muestran atenuación difusa, no bordes); el criterio 53.11
no es lo que descarta H-D — lo descartan los números.

## Definición exacta del soporte de producción (línea base para Fase 3)

`ps1SoporteLocal` (resources/js/bitacora-gaia-render.js:1979):

- **Kernel:** media aritmética en caja cuadrada de (2·rad+1)² **px de parche**,
  separable por sumas corridas (`ps1CajaSeparable`), bordes por replicación
  (clamp del índice).
- **Escala:** rad = max(1, round(`PS1.mezclaCajaAs` / escParche / 2)) con
  `mezclaCajaAs` = **25″ intrínsecos** y escParche = ″/px del parche
  (M51: 1,057″/px → rad = 12). Es la misma vecindad que `ps1PesoImagen`;
  no existe parámetro propio.
- **Ponderación:** uniforme (media, no gaussiana).
- **NaN y negativos:** entran como **0** (la ausencia no da soporte).
- **Aplicación** (`ps1PintarParche`): sop muestreado por vecino más próximo en
  la rejilla del parche (round(fx, fy)); fuera del parche sop = 0;
  `op = ps1Opacidad(−2,5·log10(max(f_píxel, sop)), umbral)` — el soporte solo
  puede subir la opacidad, nunca bajar la de un píxel que ya se veía solo, y no
  aporta flujo.

## Parrilla ejecutada

Fija: 25 (baseline) · 50 · 75 · 100 · 150″. Serie física: con la configuración
de referencia, θR(SBe = 23,76) = 10^(0,094 + 0,081·SBe) = **104,4′ aparentes**
→ 104,4·60/190 = **33,0″ intrínsecos** (α=1); α=2 → 66″; α=4 → 132″. Sin
colisiones con la parrilla fija. Exploratoria (documentada como tal, no
sustituye nada): `m25+50+75+100+150` = máximo píxel a píxel de los cinco mapas,
como cota superior del enfoque.

## Tabla de veredicto (M51; criterios a priori)

Fracción b agregada de las 4 ROIs interbrazo (baseline 0,512 = 618/1208 px);
puente hoy 19,6 %; datos completos en `tabla_resumen.csv` y los JSON.

| escala | red. b interbrazo (≥80 %) | puente (≤5 %) | cielo op>0 (sin subida) | anillos 1,2–2,0 (≤0,05 mag) | brazo | veredicto |
|---|---|---|---|---|---|---|
| 33″ (α=1) | 1,1 % ✗ | 19,3 % ✗ | 0,0000 ✓ | 0,064 ✗ | 0 negros ✓ | ✗ |
| 50″ | 2,9 % ✗ | 19,9 % ✗ | 0,0000 ✓ | 0,064 ✗ | ✓ | ✗ |
| 66″ (α=2) | 5,2 % ✗ | 20,9 % ✗ | 0,0000 ✓ | 0,064 ✗ | ✓ | ✗ |
| 75″ | 6,0 % ✗ | 21,9 % ✗ | 0,0000 ✓ | 0,064 ✗ | ✓ | ✗ |
| 100″ | 6,0 % ✗ | 21,6 % ✗ | 0,0000 ✓ | 0,064 ✗ | ✓ | ✗ |
| 132″ (α=4) | 3,4 % ✗ | 19,6 % ✗ | 0,0000 ✓ | 0,064 ✗ | ✓ | ✗ |
| 150″ | 12,5 % ✗ | 18,0 % ✗ | 0,0000 ✓ | 0,064 ✗ | ✓ | ✗ |
| máx. 5 escalas (expl.) | 20,4 % ✗ | 16,0 % ✗ | 0,0000 ✓ | 0,000 ✓ | ✓ | ✗ (techo) |

Centinelas a la mejor escala (150″): **M104** sigue con 0 píxeles negros
solo-rampa (especificidad ✓, RMS 0,8 DN); **M81** reduce su firma solo el
**1,0 %** (122 263 de 123 551; criterio ≥ 60 % ✗) y su estructura exterior se
**apaga** (fracción op>0 del campo: 0,050 → 0,0047).

## El patrón de fallo (por qué la escala no es el problema)

1. **La media de caja se diluye.** En un interbrazo ancho, la caja —a cualquier
   escala— está dominada por el propio interbrazo: la señal de los brazos entra
   con peso proporcional a su área y el promedio queda donde estaba la mezcla,
   ~0,5 mag bajo el umbral. La op mediana interbrazo sube (IB-O: 0,007 → 0,28 a
   150″) pero nunca lo bastante para sacar el nivel de fondo+δ. La respuesta no
   es monótona (132″ rinde peor que 100″) y hay ROIs que **empeoran** (IB-SO:
   b 133 → 144 a 150″): al crecer la caja cambia qué píxeles ganan vecinos
   brillantes y cuáles los pierden. No existe s\*, ni fino ni robusto.
2. **La escala grande apaga estructura compacta.** El mismo promedio que no
   levanta el interbrazo **diluye la vecindad de las fuentes débiles compactas**:
   su soporte cae por debajo del de 25″ y su op baja. Es la violación del
   criterio del perfil exterior (anillo 1,3–1,4 de M51: **+0,064 mag** de
   atenuación, idéntico en todas las escalas ≥33″) y la firma de M81 (op>0
   exterior 0,050 → 0,005). El riesgo previsto era encender cielo (halo); lo
   medido es lo contrario y peor: **borra señal real**. El guardián de cielo
   nunca se viola (op>0 = 0,0000 y nivel idéntico en el campo de M51 a todas
   las escalas).

**Esto apunta a H-E.** El dato que le falta a la rampa no es más área de
promedio, sino la referencia: distinguir «píxel embebido en una estructura ya
detectada» (el interbrazo entre dos brazos con op = 1) de «fondo aislado» (la
envolvente de μ=25 que motivó la reversión). Una única media local no puede
codificar las dos cosas a la vez a ninguna escala: cuando es pequeña parte la
estructura (Fase 1), cuando es grande la diluye y encima borra lo compacto
(este informe). La referencia dual estructura/entorno queda señalada por los
datos; su diseño es de otra fase, con su propio protocolo.

## Coste computacional

La caja separable es O(n) independiente del radio: **~24–28 ms por escala** en
un parche de 1024² (multiescala de 5: 96 ms, lineal en el número de escalas).
La Fase 3 no necesita optimización por este lado, sea cual sea la escala.

## Especificación para la Fase 3

**Propuesta: no tocar la escala del soporte.** No hay valor de
`PS1.mezclaCajaAs` (ni parámetro nuevo de escala, ni conjunto multiescala) que
mejore los interbrazos sin quedarse a un orden de magnitud del criterio; el
cambio de producción que esta fase iba a especificar **no existe**. Lo que la
Fase 3 (o una Fase 2b de diagnóstico H-E) debe respetar si explora la
referencia dual:

- **Dónde:** el punto único de decisión es `ps1SoporteLocal` +
  la evaluación de `op` en `ps1PintarParche` (línea del `max(f, sop)`); no hay
  otro sitio donde la rampa mire la vecindad.
- **Invariantes:** fotometría pre-opacidad intacta (la vecindad solo decide
  `op`, huella SHA-1 como aquí); el soporte solo puede subir op, nunca bajar la
  del píxel solo; sin condición geométrica de escena (restricción c99b72c);
  cielo puro sin op>0 nueva; M104 con 0 solo-rampa.
- **Tests nuevos que harán falta:** paridad bit a bit del harness contra la
  producción nueva; puente de marea ≤ 5 % (hoy 19,6 %); anillos exteriores
  |Δ| ≤ 0,05 mag **en las dos direcciones** (esta fase enseñó que la dirección
  peligrosa es la atenuación, no solo el halo); fracción op>0 exterior de M81
  como centinela de estructura compacta.

## Reproducción

Ver `README.md`. Batería de los seis tests verde al cierre
(`test_difuso`, `test_quitar_estrellas`, `test_psf_produccion`,
`test_bilineal_parche`, `test_resolucion_ps1`, `test_ps1_nan_ausencia`);
producción sin un solo cambio (diff vacío fuera de scripts/ y docs/).
Sin aleatoriedad: no hay semilla que fijar.
