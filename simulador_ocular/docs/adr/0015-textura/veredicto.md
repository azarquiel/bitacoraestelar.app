# Veredicto: calibración de K y canal de producción (ADR 0015, #99)

Fecha: 2026-08-22. Prerregistro: `simulador_ocular/docs/adr/0015-textura/prerregistro.md`.
Ley: `simulador_ocular/docs/adr/0015-umbral-de-textura-para-el-grano-sbf.md`, implementada en
`resources/js/bitacora-gaia-render.js` (`TEXTURA`, `#97`).

## Veredicto

**El canal queda APAGADO** (`TEXTURA.ACTIVO = false`, sin cambios respecto a
hoy). La ley de umbral de textura, con el único punto de anclaje
prerregistrado, no reproduce la transición nebuloso→moteado→resuelto: falsea
los listones P1, P2 y el banco del 18″ con el estadístico de energía, y
también con la única vía de escape declarada (Minkowski). Se descarta con
medida, como el precedente de los dos ejes de Gaia (ADR 0012).

## 1. Anclaje de K

Único dato de anclaje: M13, 200 mm, SQM 21, 120×, "primera rotura del
núcleo" (r/r_h 0,00–0,25). Quick 1974 escribe `P(ver) = 1 − exp(−(d′/K)^β)`, y
K es por definición el criterio de d′ en el umbral: se ancla haciendo que el
exponente de Quick valga exactamente 1 en el punto declarado, sin introducir
ninguna segunda elección (p. ej. qué P(ver) exacto cuenta como "rotura", dato
que el prerregistro no fijó). Con exponente = 1, `P(ver)` en el ancla sale
1 − e⁻¹ ≈ 0,632 por construcción — dentro de la banda de transición que exige
el prerregistro (§1), confirmando que el ajuste no es degenerado.

Procedimiento ejecutable (`scripts/calibrar_k_textura.js`): con K = 1 se mide
el exponente de Quick que sale en el ancla (a través de la tabla radial de
producción, `tabla.sGrano`, ADR 0008) y se reescala K para que ese exponente
valga 1. El mismo procedimiento sirve para el estadístico de energía y para
la vía de escape Minkowski; solo cambia qué produce el exponente.

| Estadístico | K calibrado | P(ver) en el ancla |
|---|---|---|
| Energía (§2/§3, producción) | 8,245813 × 10⁻² | 0,632 |
| Minkowski (§5, vía de escape) | 2,547573 × 10⁻¹ | 0,632 |

## 2. Listones — estadístico de energía (K = 8,245813 × 10⁻²)

| Listón | Predicción | Medida | Resultado |
|---|---|---|---|
| P1 — 61×, P(ver) < 0,05 en los 4 anillos | < 0,05 en cada uno | [0,9995; 0,9965; 0,8886; 0,6514] | **FALLA** |
| P2 — núcleo, P(ver) creciente con el aumento (120/173/250×) | 120× < 173× < 250× | [0,6321; 0,2518; 0,0911] — **decreciente** | **FALLA** |
| P3 — halo (N_ef ≈ 0,07) a 250×, P(ver) < 0,10 | < 0,10 | 0,0120 | ok |
| Banco del 18″ (núcleo) | ver prerregistro §3 | M55/70×=1,00 (esperado 0,3–0,7); M55/480×=0,059 (esperado >0,7); M22/98×=1,00 (ok, >0,7); M30/98×=1,00 (esperado 0,3–0,7); M62/70,98,270×≈1,00 (esperado <0,3, es el caso "no rompe") | **FALLA** (solo M22 pasa) |

## 3. Listones — vía de escape Minkowski (K = 2,547573 × 10⁻¹)

| Listón | Predicción | Medida | Resultado |
|---|---|---|---|
| P1 | < 0,05 en cada anillo | [1,00; 1,00; 1,00; 1,00] | **FALLA** (peor que energía) |
| P2 | creciente | [0,6321; 0,2151; 0,0686] — decreciente | **FALLA** |
| P3 | < 0,10 | 0,5437 | **FALLA** (peor que energía: el pooling amplifica también el halo) |
| Banco del 18″ | ver §3 | mismo patrón: solo M22 pasa | **FALLA** |

## 4. Diagnóstico: por qué falla y por qué el escape no lo arregla

Dos fallos, de naturaleza distinta:

- **P1 y el banco del 18″ saturan cerca de 1 ya a 61×.** La amplitud del
  grano es tan grande (RMS 88–340 % del fondo local, hasta +800 % en los
  picos — `simulador_ocular/docs/experimentos/velo_granularidad.md`) que, tras la ganancia de la
  CSF, el exponente de Quick se dispara muy por encima de 1 en casi todo el
  rango, sea cual sea el estadístico de entrada. No es una cuestión de
  "picos contra energía": es que la señal, evaluada con esta CSF y este K,
  es simplemente demasiado grande para dejar algo por debajo del umbral en
  61×–98×.

- **P2 sale invertido: `P(ver)` CAE con el aumento en vez de crecer.**
  `d′` combina dos efectos que compiten al subir el aumento: la frecuencia
  retiniana del grano BAJA (más favorable, `frecuenciaGranoCdeg` = 1800/M) y
  la iluminancia retiniana también BAJA porque la pupila de salida se
  encoge (`D/M`, con D fijo). En el M13 real, con la fotometría acoplada
  (mSky, S1campo/S2campo variando con el aumento), el segundo efecto
  domina: la CSF pierde más ganancia por menos luz de la que gana por
  frecuencia más favorable. Este acoplamiento vive en `csfTextura` y en
  `dPrimeTextura`, exactamente el mismo para el estadístico de energía y
  para Minkowski (ambos multiplican la MISMA ganancia CSF por la amplitud
  de contraste, solo cambia cómo se agrega esa amplitud). Por construcción,
  **ningún cambio de estadístico de entrada puede invertir esta
  dirección**: la vía de escape del §5 está diseñada para el caso "los
  picos dominan sobre la energía filtrada", no para una inversión de signo
  en la dependencia del aumento, y medirla confirma que no lo hace (P2
  sigue decreciente, idéntico patrón cualitativo, con Minkowski).

Conclusión: el fallo es estructural a la forma de la ley (el acoplamiento
CSF–pupila de salida tal como está escrito), no un artefacto de qué
estadístico resume la distribución del grano. La vía de escape se probó,
como exige el prerregistro, y no cambia el diagnóstico — de hecho lo empeora
en P1 y P3, porque el pooling Minkowski amplifica cualquier contraste alto
incluyendo el del halo.

## 5. Alcance de lo prohibido, respetado

No se ha tocado β (3,5 fijo), no se ha introducido un segundo parámetro
libre, no se ha retocado ningún listón de §2/§3 tras ver el resultado, y no
se han añadido ni retirado listones respecto al prerregistro (#95). Los
únicos cambios de código son el propio estadístico Minkowski (permitido
explícitamente por §5) y el interruptor `TEXTURA.ESTADISTICO` para
seleccionarlo sin duplicar la ley.

## 6. Qué queda encendido y qué no

- `TEXTURA.ACTIVO` permanece en `false`: el render de producción no cambia
  ni un bit.
- `TEXTURA.ESTADISTICO` (`'energia'` por defecto, `'minkowski'` disponible) y
  `pVerTexturaMinkowski` quedan en el módulo, documentados y cubiertos por
  test, como registro reproducible de la vía de escape que exige el §5 —no
  se usan en ningún camino de producción.
- Los listones y la calibración quedan fijados en
  `scripts/listones_umbral_textura.js` y `scripts/calibrar_k_textura.js`, y
  el veredicto queda anclado con un test permanente
  (`scripts/test_calibracion_k_veredicto.js`) para que un cambio futuro que
  reabra esta vía tenga que hacerlo con medida, no en silencio.
