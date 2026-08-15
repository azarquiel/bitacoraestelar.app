# Informe Fase 3 — Pertenencia a estructura (H-E1 estadístico de orden, H-E2 propagación de opacidad)

**Fecha:** 15-ago-2026 · **Rama:** `fase3-pertenencia-estructura` (desde `fase2-soporte-rampa`)
**Configuración:** 457,2 mm · 190× · SQM 21,2 · lienzo 720 px · AFOV 70° · δ = 2
(idéntica a Fases 1 y 2). **Patrón no destructivo:**
`op_final(x) = max(op_produccion_25(x), componente_variante(x))` — verificado
por corrida con el test automático de no-borrado (0 px con op_final < op_prod,
tolerancia 0, los cinco objetos, todas las corridas).

## Veredicto global: **AMBAS DESCARTADAS**

Ninguna de las 10 configuraciones de la parrilla a priori cumple el criterio de
interbrazos (reducción ≥ 80 % de la fracción negra clase b) en M51, y las dos
familias fallan por motivos distintos y complementarios:

- **E1** es limpia (cielo, anillos, fuentes compactas y especificidad
  intactos en los cinco objetos) pero **se queda corta**: 51 % en el mejor
  punto de la parrilla, y las exploratorias muestran que la familia entera
  tiene un techo por debajo del criterio del puente.
- **E2** llega más lejos en los interbrazos (54 %) pero **viola
  estructuralmente el cielo** (enciende op > 0 en el 43–88 % del campo) y
  **abrillanta el anillo de las fuentes compactas** hasta −0,28 mag: el riesgo
  de halo previsto en el protocolo, medido.

Y el hallazgo que acota la línea entera (exploratoria E1 p99/150″): **aun con
op = 1**, el puente de marea conserva un 9,2 % de píxeles negros (criterio
≤ 5 %) y los interbrazos un 23–35 % de negros. Ese residuo ya no es de la
rampa: es la mezcla, cuyo nivel queda bajo fondo+δ. **Ninguna variante de la
capa de opacidad puede cumplir los criterios de esta línea**; los datos apuntan
a la capa de mezcla/detección, no a H-E3.

## Punto único de decisión (verificado, no asumido)

`ps1SoporteLocal` (resources/js/bitacora-gaia-render.js:1979) + la evaluación
`op = ps1Opacidad(−2,5·log10(max(f, sop)), umbral)` dentro del bucle de
`ps1PintarParche`. No hay otro sitio donde la rampa mire la vecindad; la
réplica del harness con la variante apagada es bit a bit la producción
(dmax = 0 en los cinco objetos) y reproduce el baseline de la Fase 1 al píxel
(M51 negros 149 549/b 48 205; M81 338 413/122 305; M104 62 754/0;
M101 389 728/140 728; NGC 205 71 550/0). La fotometría pre-opacidad es
idéntica en todas las corridas (huella SHA-1 del buffer lineal contra el
baseline s25 de cada objeto): las variantes solo cambian `op`.

## Decisiones sobre los NaN (declaradas a priori)

- **E1:** idéntico a producción — NaN y negativos entran como «sin señal»
  (bin 0 del histograma), exactamente igual que la media de `ps1CajaSeparable`
  los cuenta como 0. El percentil los cuenta: una caja medio vacía tiene el
  percentil que le corresponde con esa mitad a cero.
- **E2:** los NaN no siembran opacidad (op = 0) ni la reciben (componente
  final 0). La distancia es euclídea, sin noción de camino, así que tampoco
  bloquean la propagación entre dos píxeles válidos (la definición directa
  contra la que se verifica no tiene caminos).

## Implementación verificada de E2

`componente(x) = max_y op_rampa25(y)·k(d(x,y))` se calcula **exacta por
niveles**: op cuantizada a 128 niveles (error ≤ 1/256 = 0,004) y una
transformada de distancia euclídea exacta (Felzenszwalb, O(n) por nivel) del
conjunto {op ≥ nivel}; comp = max sobre niveles de q·k(d_q). Verificación por
corrida contra la definición directa (fuerza bruta euclídea) en una ROI de
40×40 px: |err|max ≤ 0,0032–0,016 en todas las corridas, tolerancia declarada
0,02. El chamfer de dos pasadas del plan original se descartó durante la
Tarea 0: el 3×3 unitario dejaba 0,032 de error métrico y el arrastre codicioso
de lin no bajaba de 0,021 en M104/M81 a alcance 50″; se documenta porque la
verificación hizo exactamente su trabajo.

## Parrilla E1 (M51, criterios a priori)

Fracción b agregada de las 4 ROIs interbrazo (baseline 618 px); puente
baseline 19,6 %; criterios: interbrazos ≥ 80 %, puente ≤ 5 %, cielo sin
subida, anillos |Δ| ≤ 0,05 mag, RESID |Δmag| ≤ 0,05.

| config | red. b interbrazo | puente | cielo op>0 | anillos | RESID | veredicto |
|---|---|---|---|---|---|---|
| p75/50″ | 18,6 % ✗ | 14,4 % ✗ | 0,0000 ✓ | 0,000 ✓ | 0,000 ✓ | ✗ |
| p75/100″ | 20,2 % ✗ | 15,4 % ✗ | 0,0000 ✓ | 0,000 ✓ | 0,000 ✓ | ✗ |
| p90/50″ | 37,9 % ✗ | 10,1 % ✗ | 0,0000 ✓ | 0,000 ✓ | 0,000 ✓ | ✗ |
| p90/100″ | 51,0 % ✗ | 10,5 % ✗ | 0,0000 ✓ | 0,000 ✓ | 0,000 ✓ | ✗ |

Centinelas E1 (los cuatro puntos de la parrilla, los cuatro objetos): **M104**
0 solo-rampa siempre ✓; **NGC 205** 0 clase b siempre ✓; **M101** HII-A/HII-B
Δmag = 0,0000 y cielo 0,0000 ✓; **M81** cielo exterior intacto (op>0 = 0,0500
= producción ✓) pero la firma solo baja un 5,9 % en el mejor punto (criterio
≥ 60 % ✗). E1 no rompe nada y no arregla lo suficiente.

**Sensibilidad a píxeles calientes (métrica 9, exploratoria):** 8 calientes
sintéticos a p99,9 en copia del parche (centros de ROI + rejilla fija):
b interbrazo 38 385 frente a 38 391, cielo 0,0000, anillos 0,0000. Un caliente
es 1 píxel de (2·47+1)² = 9 025: el p90 no lo ve. **El riesgo declarado de E1
no se materializa.**

**Exploratorias E1 (fuera de parrilla, documentadas como tales):** p95/150″ →
57,8 % (cielo aún 0,0000); p99/150″ → 91,3 % de reducción b, pero el cielo
empieza a encenderse (op>0 = 0,0007) y el puente sigue en 9,2 % de negros con
op mediana 1,000. La dirección del estadístico de orden **satura contra el
suelo de la mezcla** (abajo) antes de cumplir los criterios.

## Parrilla E2 (M51, criterios a priori)

Verificación chamfer↔directo por corrida entre paréntesis (tolerancia 0,02).
Cielo baseline: op>0 = 0,0000, nivel 23,556.

| config | red. b interbrazo | puente | cielo op>0 | RESID Δmag anillo | verif. | veredicto |
|---|---|---|---|---|---|---|
| exp/50″ | 20,6 % ✗ | 13,7 % ✗ | **0,8816 ✗** | −0,024 ✓ | 0,0038 | ✗ |
| exp/100″ | 40,0 % ✗ | 11,4 % ✗ | **0,8816 ✗** | −0,120 ✗ | 0,0011 | ✗ |
| exp/150″ | 47,6 % ✗ | 10,5 % ✗ | **0,8816 ✗** | −0,188 ✗ | 0,0009 | ✗ |
| lin/50″ | 44,7 % ✗ | 11,4 % ✗ | **0,4461 ✗** | −0,178 ✗ | 0,0023 | ✗ |
| lin/100″ | 52,6 % ✗ | 9,8 % ✗ | **0,7862 ✗** | −0,255 ✗ | 0,0010 | ✗ |
| lin/150″ | 54,0 % ✗ | 9,8 % ✗ | **0,8782 ✗** | −0,280 ✗ | 0,0000 | ✗ |

La violación del cielo es **estructural**, no de parámetro: cualquier fuente
con op > 0 propaga k > 0 a su alrededor (la cola exponencial no se anula
nunca; la lineal ilumina todo lo que quede a menos de L de cualquier fuente),
y el campo de M51 está sembrado de fuentes débiles con op > 0. El nivel medio
sube poco (23,556 → 23,569 como mucho) porque la op nueva es pequeña, pero la
fracción op > 0 pasa de 0 a 0,44–0,88: el criterio «cielo puro sin op > 0
nueva» no admite ese cambio, y el halo de RESID (−0,28 mag en el anillo
1,5–3×, criterio ≤ 0,05) es su cara visible. La única config que respeta a
RESID (exp/50″) es la que menos interbrazo arregla (20,6 %).

Centinelas E2 (todas las configs, cuatro objetos): **M104** conserva 0
solo-rampa ✓ pero su campo pasa de op>0 = 0,0012 a 0,62–0,85 ✗ — hasta el
objeto de especificidad brilla; **M81** reduce su firma un 40,2 % como mucho
(lin/150″; criterio ≥ 60 % ✗) con el cielo en 0,83–0,94 ✗; **M101** reduce su b un 11–35 % (mejor lin/150″) con las HII-A/B intactas
(|Δmag| ≤ 0,023, dentro del criterio) — el problema de M101 es el mismo de
M51: insuficiencia, no daño local; **NGC 205** mantiene 0 clase b.
Verificación chamfer↔directo ≤ 0,004 en todos.

**Sobre la mitigación única prevista** (excluir de la propagación fuentes con
tamaño < 2× FWHM): arreglaría RESID, pero no toca la violación del cielo
(la propagan las fuentes extensas igual) ni acerca los interbrazos al 80 %:
no se ejecutó porque el veredicto de E2 no depende de ella.

## El suelo de la mezcla: la cota que cierra la línea

En la exploratoria p99/150″ la op mediana de IB-O, IB-E, IB-SE y el puente es
1,000 y su clase b cae a 2/0/0/0 — la rampa ya no quita nada — y sin embargo
siguen negros: IB-O 35,3 % de píxeles, IB-SE 29,6 %, puente 9,2 % (baseline
19,6 %, criterio ≤ 5 %). Con op = 1 el nivel pintado es el de la mezcla
(w·s·imagen + (1−w)·perfil), que en esos píxeles queda bajo fondo+δ — la
Fase 1 ya midió la mezcla del interbrazo ~0,5 mag bajo el umbral. Es una
**cota inferior estructural para cualquier variante de opacidad**, del patrón
que sea: el criterio del puente (≤ 5 %) es inalcanzable desde esta capa.

## Coste computacional

E1: 0,56–0,84 s por parche de 1024² (histograma deslizante O(n·256),
crece poco con la escala). E2: ~7,4 s con la EDT por 128 niveles (O(128·n));
una implementación de producción podría bajarlo, pero es irrelevante: ninguna
es candidata.

## Recomendación (argumentada)

**Cerrar la línea de la capa de opacidad** (H-E1, H-E2 y también H-E3 sin
ejecutarla: cualquier referencia dual estructura/entorno seguiría decidiendo
`op`, y la cota del suelo de la mezcla le aplica igual). El siguiente
diagnóstico pertenece a la **capa de mezcla/nivel**: por qué el nivel pintado
del interbrazo y del puente queda bajo fondo+δ cuando la imagen cruda está a
+2σ (Fase 1, H-B: sobresustracción descartada — la señal existe y la mezcla
la apaga). Ojo: eso NO es la capa de detección H2c (el umbral está bien
medido, [[ricco-medido-c-mag]]); es cómo `ps1EscalaMezcla`/el anclaje colocan
el nivel de la señal débil extensa respecto del cielo. Un protocolo nuevo, con
sus propios invariantes (los de la Fase 2 siguen vigentes: fotometría
pre-opacidad intacta, sin geometría de escena, vigilar la atenuación en las
dos direcciones).

No hay especificación de Fase 4 que entregar: no hay candidata.

## Reproducción

Ver `README.md`. Paridad bit a bit obligatoria antes de medir (los cinco
objetos); batería de los seis tests verde al cierre (`test_difuso`,
`test_quitar_estrellas`, `test_psf_produccion`, `test_bilineal_parche`,
`test_resolucion_ps1`, `test_ps1_nan_ausencia`); producción sin un solo cambio
(diff vacío fuera de scripts/ y docs/). Sin aleatoriedad; los «calientes» son
deterministas (posiciones fijas, nivel p99,9 del parche).
