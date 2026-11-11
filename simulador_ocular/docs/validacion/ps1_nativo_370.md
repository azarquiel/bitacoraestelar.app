# #370 · Resolución nativa de PS1 + remuestreo propio en la generación offline

Spike de medida. ¿Compensa pedir a `fitscut` solo `size` (píxel nativo de
0,25″, sin `output_size`) y bajar nosotros a la regla C, para quitarnos el
sesgo de flujo que #366 midió en el remuestreo de `fitscut`?

## Prerregistro (escrito y commiteado ANTES de medir — ADR 0012 bis)

Los listones de AC1, AC2, AC5 y AC6 no tienen número en la issue; los de abajo
son **supuestos de este prerregistro**, elegidos sin haber visto ninguna medida
salvo la sonda de viabilidad (§Sonda). No se mueven después.

| AC | Qué se mide | Listón | Si falla |
|---|---|---|---|
| AC1 | pico de RSS del proceso Node (`/usr/bin/time -l`, «maximum resident set size»), un proceso nuevo por objeto y camino, caché vacía, en los 9 objetos del banco capados a 2048 | **No-Go** si el pico del camino nativo pasa de **8 GB** (la mitad de la RAM de la máquina) **o** si `vm.swapusage` sube más de **256 MB** entre antes y después de la corrida | AC6: se cierra sin código |
| AC2 | bytes reales recibidos de `fitscut` (contados al vuelo) y tiempo de pared, en la muestra de 50 de L2.4 (semilla 20260904, mismo sorteo, ahora en `lib_muestra_dso.js`), extrapolados a las filas aptas por bytes/píxel nativo pedido | **No-Go** si la regeneración completa extrapolada pasa de **100 GB** de descarga **o** de **24 h** de pared al caudal medido | AC6: se cierra sin código |
| AC3 | sesgo de flujo en σ/px contra el parche **nativo** (verdad), sobre el banco: `|media(remuestreado) − media(nativo)| / σ`, con σ = `ps1SigmaCielo` del parche de `fitscut` a la regla C (mismo denominador que #366) y la misma huella de píxeles finitos | **Pasa** si el peor caso del remuestreo propio es **< 0,32 σ/px** (cota baja del rango de #366) **y** menor que el peor caso de `fitscut` medido en el mismo arnés (control positivo: ese tiene que salir distinto de 0) | se cierra sin código |
| AC4 | `git diff --stat main` y `php scripts/test_ps1_proxy.php` | ningún cambio en `ps1-proxy.php`, `dso-texturas-datos.js` ni `resources/js/bitacora-ps1.js`; proxy en verde | no se entrega |
| AC5 | NAXIS y bytes del PNG-16 con el camino nuevo frente al de hoy, en los objetos medidos | misma resolución exacta (regla C) en todos; **Σ bytes nuevo / Σ bytes hoy ≤ 1,01** | no se entrega |

## Sonda de viabilidad (2026-11-11, antes del prerregistro)

Peor caso, NGC 7293 (20′), una skycell, `size=4800` sin `output_size`:
`NAXIS1 = NAXIS2 = 4800`, `BITPIX = -32`, **92 177 280 bytes en 18,4 s**,
conexión sin cortes. Confirma que el nativo a 4800 px se sirve.

Máquina de todas las medidas: Intel Core i7-7700 @ 3,60 GHz, 16 GB RAM,
macOS (Darwin 22.6.0), Node v24.16.0.

## Corrida 1 (2026-11-11) — salida cruda, sin interpretar

Código: `scripts/harness_ps1_nativo_370.js` y `scripts/harness_ps1_nativo_370_ram.sh` tal como están en este commit. Los bytes por objeto de AC2 en `ps1_nativo_370/ac2_370.json`.

### AC2

```

AC2 sobre 50 objetos medidos (73 celdas, media 1.46)
  muestra   hoy 0.108 GB  ·  nativo 0.428 GB  ·  factor medido ×3.95
  bytes/px pedido   hoy 4.055  ·  nativo 4.014
  caudal   hoy 1.33 MB/s  ·  nativo 3.36 MB/s
  extrapolado a 2065 aptas   hoy 6.0 GB / 1.3 h  ·  nativo 25.3 GB / 2.1 h  ·  factor ×4.21
  listón AC6: ≤ 100 GB y ≤ 24 h  →  CABE
```

### AC1

```
swap antes: total = 2048,00M  used = 1233,75M  free = 814,25M  (encrypted)
NGC 205 · fitscut · pico RSS 294 MB
NGC 205 · nativo · pico RSS 602 MB
NGC 5194 · fitscut · pico RSS 261 MB
NGC 5194 · nativo · pico RSS 517 MB
NGC 5457 · fitscut · pico RSS 273 MB
NGC 5457 · nativo · pico RSS 574 MB
NGC 3031 · fitscut · pico RSS 262 MB
NGC 3031 · nativo · pico RSS 572 MB
NGC 4565 · fitscut · pico RSS 262 MB
NGC 4565 · nativo · pico RSS 532 MB
NGC 891 · fitscut · pico RSS 254 MB
NGC 891 · nativo · pico RSS 559 MB
NGC 253 · fitscut · pico RSS 275 MB
NGC 253 · nativo · pico RSS 561 MB
NGC7293 · fitscut · pico RSS 261 MB
NGC7293 · nativo · pico RSS 575 MB
IC2177 · fitscut · pico RSS 234 MB
IC2177 · nativo · pico RSS 485 MB
swap después: total = 2048,00M  used = 1517,50M  free = 530,50M  (encrypted)
```

### AC3 + AC5

```
[1/69] NGC 3310  189 px  fitscut 8.63e-2 σ/px  ·  propio 7.92e-9 σ/px  ·  PNG 0.998×
[2/69] NGC 404  336 px  fitscut 5.80e-9 σ/px  ·  propio 5.29e-9 σ/px  ·  PNG 1.000×
[3/69] NGC 3377  545 px  fitscut 8.34e-5 σ/px  ·  propio 2.75e-9 σ/px  ·  PNG 1.002×
[4/69] NGC 4125  947 px  fitscut 2.69e-2 σ/px  ·  propio 2.95e-2 σ/px  ·  PNG 1.000×
[5/69] NGC 7331  1441 px  fitscut 3.92e-3 σ/px  ·  propio 3.71e-2 σ/px  ·  PNG 1.002×
[6/69] NGC 205  2048 px  fitscut 1.32e-2 σ/px  ·  propio 7.80e-2 σ/px  ·  PNG 1.000×
[7/69] NGC 5194  2048 px  fitscut 3.84e-3 σ/px  ·  propio 1.84e-4 σ/px  ·  PNG 1.000×
[8/69] NGC 5457  2048 px  fitscut 1.16e-2 σ/px  ·  propio 1.78e-4 σ/px  ·  PNG 1.001×
[9/69] NGC 4594  1590 px  fitscut 3.20e-2 σ/px  ·  propio 3.18e-2 σ/px  ·  PNG 1.000×
[10/69] NGC 3031  2048 px  fitscut 5.60e-2 σ/px  ·  propio 9.22e-2 σ/px  ·  PNG 1.001×
[11/69] NGC 4486  1278 px  fitscut 6.54e-4 σ/px  ·  propio 3.55e-3 σ/px  ·  PNG 0.999×
[12/69] NGC 1068  642 px  fitscut 4.00e-2 σ/px  ·  propio 3.64e-2 σ/px  ·  PNG 1.001×
[13/69] NGC 4826  1503 px  fitscut 1.75e-3 σ/px  ·  propio 6.04e-3 σ/px  ·  PNG 0.998×
[14/69] NGC 4565  2048 px  fitscut 2.77e-2 σ/px  ·  propio 1.16e-2 σ/px  ·  PNG 0.999×
[15/69] NGC 891  2048 px  fitscut 1.06e-1 σ/px  ·  propio 1.38e-1 σ/px  ·  PNG 0.999×
[16/69] NGC 5195  787 px  fitscut 2.59e-3 σ/px  ·  propio 7.87e-11 σ/px  ·  PNG 0.999×
[17/69] NGC 4374  656 px  fitscut 6.40e-2 σ/px  ·  propio 3.67e-10 σ/px  ·  PNG 0.998×
[18/69] NGC 4406  1554 px  fitscut 7.62e-4 σ/px  ·  propio 3.20e-5 σ/px  ·  PNG 0.998×
[19/69] NGC 3034  1650 px  fitscut 2.09e-3 σ/px  ·  propio 2.20e-2 σ/px  ·  PNG 0.994×
[20/69] NGC 253  2048 px  fitscut 3.61e-2 σ/px  ·  propio 4.02e-2 σ/px  ·  PNG 1.002×
[21/69] NGC6720  275 px  fitscut 3.36e-1 σ/px  ·  propio 3.06e-8 σ/px  ·  PNG 0.999×
[22/69] NGC7008  309 px  fitscut 1.34e-1 σ/px  ·  propio 1.34e-1 σ/px  ·  PNG 1.000×
[23/69] Abell 12  180 px  fitscut 1.90e-1 σ/px  ·  propio 1.90e-1 σ/px  ·  PNG 1.000×
[24/69] NGC7026  180 px  fitscut 2.54e-1 σ/px  ·  propio 2.54e-1 σ/px  ·  PNG 1.000×
[25/69] NGC7662  180 px  fitscut 1.02e-7 σ/px  ·  propio 6.62e-8 σ/px  ·  PNG 1.000×
[26/69] NGC6543  195 px  fitscut 2.29e-1 σ/px  ·  propio 2.26e+1 σ/px  ·  PNG 1.000×
[27/69] NGC3587  774 px  fitscut 3.65e-3 σ/px  ·  propio 5.50e-3 σ/px  ·  PNG 0.996×
[28/69] NGC1360  1387 px  fitscut 1.46e-3 σ/px  ·  propio 1.55e-2 σ/px  ·  PNG 1.001×
[29/69] NGC6853  1448 px  fitscut 7.30e-3 σ/px  ·  propio 5.11e-3 σ/px  ·  PNG 0.999×
[30/69] NGC7293  2048 px  fitscut 1.20e-2 σ/px  ·  propio 9.28e-2 σ/px  ·  PNG 1.000×
[31/69] IC0063  592 px  fitscut 5.05e-3 σ/px  ·  propio 9.43e-5 σ/px  ·  PNG 0.996×
[32/69] IC0131  180 px  fitscut 2.70e-9 σ/px  ·  propio 1.65e-9 σ/px  ·  PNG 1.000×
[33/69] IC0143  180 px  fitscut 1.11e-8 σ/px  ·  propio 3.89e-9 σ/px  ·  PNG 1.000×
[34/69] NGC1982  1871 px  fitscut 1.59e-3 σ/px  ·  propio 6.84e-2 σ/px  ·  PNG 1.002×
[35/69] NGC2282  324 px  fitscut 2.69e-1 σ/px  ·  propio 2.69e-1 σ/px  ·  PNG 1.000×
[36/69] IC0466  180 px  fitscut 2.19e-1 σ/px  ·  propio 2.19e-1 σ/px  ·  PNG 1.000×
[37/69] NGC6857  180 px  fitscut 1.99e-1 σ/px  ·  propio 1.99e-1 σ/px  ·  PNG 1.000×
[38/69] NGC6888  1528 px  fitscut 6.00e-4 σ/px  ·  propio 1.23e-1 σ/px  ·  PNG 0.998×
[39/69] IC1470  195 px  fitscut 2.43e-2 σ/px  ·  propio 8.30e-10 σ/px  ·  PNG 0.998×
[40/69] NGC7635  1184 px  fitscut 6.19e-3 σ/px  ·  propio 1.89e-1 σ/px  ·  PNG 1.001×
[41/69] IC0059  764 px  fitscut 1.05e-2 σ/px  ·  propio 3.05e-5 σ/px  ·  PNG 0.998×
[42/69] IC0359A  1323 px  fitscut 3.28e-5 σ/px  ·  propio 2.52e-10 σ/px  ·  PNG 1.000×
[43/69] NGC1555  197 px  fitscut 3.84e-2 σ/px  ·  propio 1.03e+0 σ/px  ·  PNG 1.002×
[44/69] NGC1788  216 px  fitscut 5.30e-2 σ/px  ·  propio 5.30e-2 σ/px  ·  PNG 1.000×
[45/69] NGC1999  216 px  fitscut 1.54e-1 σ/px  ·  propio 1.54e-1 σ/px  ·  PNG 1.000×
[46/69] NGC1985  180 px  fitscut 9.36e-9 σ/px  ·  propio 3.02e-9 σ/px  ·  PNG 1.000×
[47/69] IC0431  684 px  fitscut 5.76e-2 σ/px  ·  propio 3.49e-1 σ/px  ·  PNG 1.003×
[48/69] IC0432  1080 px  fitscut 6.95e-2 σ/px  ·  propio 6.95e-2 σ/px  ·  PNG 1.000×
[49/69] NGC2023  967 px  fitscut 2.01e-2 σ/px  ·  propio 2.69e-2 σ/px  ·  PNG 1.001×
[50/69] IC0435  375 px  fitscut 1.11e-2 σ/px  ·  propio 4.42e-1 σ/px  ·  PNG 0.996×
[51/69] NGC2064  1080 px  fitscut 2.05e-2 σ/px  ·  propio 2.05e-2 σ/px  ·  PNG 1.000×
[52/69] NGC2067  530 px  fitscut 2.61e-3 σ/px  ·  propio 2.64e-10 σ/px  ·  PNG 0.995×
[53/69] NGC2068  486 px  fitscut 4.38e-2 σ/px  ·  propio 4.38e-2 σ/px  ·  PNG 1.000×
[54/69] NGC2149  265 px  fitscut 6.11e-3 σ/px  ·  propio 5.92e-9 σ/px  ·  PNG 1.000×
[55/69] NGC2170  216 px  fitscut 2.09e-1 σ/px  ·  propio 2.10e-1 σ/px  ·  PNG 1.000×
[56/69] NGC2163  265 px  fitscut 8.52e-3 σ/px  ·  propio 1.94e-1 σ/px  ·  PNG 1.000×
[57/69] NGC2182  265 px  fitscut 7.24e-2 σ/px  ·  propio 4.17e-1 σ/px  ·  PNG 0.999×
[58/69] IC0444  611 px  fitscut 3.16e-3 σ/px  ·  propio 3.16e-3 σ/px  ·  PNG 1.000×
[59/69] NGC2245  216 px  fitscut 8.33e-2 σ/px  ·  propio 8.33e-2 σ/px  ·  PNG 1.000×
[60/69] NGC2247  216 px  fitscut 3.25e-1 σ/px  ·  propio 3.25e-1 σ/px  ·  PNG 1.000×
[61/69] NGC2261  180 px  fitscut 2.00e-3 σ/px  ·  propio 2.00e-3 σ/px  ·  PNG 1.000×
[62/69] NGC2327  180 px  fitscut 2.70e-1 σ/px  ·  propio 2.70e-1 σ/px  ·  PNG 1.000×
[63/69] IC2177  2048 px  fitscut 1.33e-1 σ/px  ·  propio 2.15e-1 σ/px  ·  PNG 1.000×
[64/69] IC4684  265 px  fitscut 4.26e-2 σ/px  ·  propio 1.08e+0 σ/px  ·  PNG 0.996×
[65/69] NGC6590  375 px  fitscut 3.41e-2 σ/px  ·  propio 1.48e-1 σ/px  ·  PNG 0.998×
[66/69] IC1287  1528 px  fitscut 4.51e-3 σ/px  ·  propio 1.83e-1 σ/px  ·  PNG 1.001×
[67/69] NGC6914  324 px  fitscut 9.51e-2 σ/px  ·  propio 9.51e-2 σ/px  ·  PNG 1.000×
[68/69] IC5076  756 px  fitscut 1.91e-1 σ/px  ·  propio 1.91e-1 σ/px  ·  PNG 1.000×
[69/69] NGC1952  1222 px  fitscut 1.04e-2 σ/px  ·  propio 3.54e-4 σ/px  ·  PNG 1.000×

AC3 sobre 69 objetos (σ/px contra el mosaico nativo, σ del parche de fitscut)
  fitscut  mediana 2.05e-2  ·  peor 3.36e-1
  propio   mediana 3.71e-2  ·  peor 2.26e+1
  listón: peor propio < 0,32 y < peor fitscut  →  NO PASA
AC5  PNG Σ propio / Σ fitscut = 0.9997  (147.10 / 147.13 MB)  ·  resolución distinta de la regla C: 0  →  PASA
```

## Corrida 1 es inválida para AC3: el arnés incumplía el prerregistro

El prerregistro de AC3 dice «la misma huella de píxeles finitos». El arnés de
la corrida 1 promediaba los finitos de CADA parche por separado, así que la
diferencia de huella NaN entre nativo, `fitscut` y propio se colaba como
«sesgo» en las dos columnas. Se ve en la propia salida: Abell 12, NGC7026 y
NGC2247 dan la MISMA cifra en `fitscut` y en propio (0,19–0,33 σ/px), que es
el suelo de la métrica, no remuestreo. Y el 22,6 σ/px de NGC 6543 era el
remuestreo propio quedándose con astillas finitas junto al núcleo saturado
(máx 1,0e6) con la regla «NaN solo si todo es NaN»: +12 % de flujo en la media
de finitos. Esto se corrige en el arnés, no en el listón, que no se toca.

**Corrección (corrida 2):** máscara común —píxeles gruesos finitos en
`fitscut` y en propio, cuyos nativos cubiertos son todos finitos— y como
referencia la media por área del nativo sobre esa máscara. Con esa
referencia la columna del propio sale 0 **por construcción** (es la misma
cuenta); lo que demuestra que el remuestreo propio conserva el flujo es
`scripts/test_remuestreo_ps1.js` (razón de flujos 1 ± 1e-5 a factor
4800/2048). Lo que aporta el arnés es la otra mitad: que `fitscut` SÍ
sesga, y cuánto.

**Comprobación de la premisa** (NGC 7293, máscara común 100 %): `fitscut`
da media/referencia **1,0798 a 1024 px** y **0,9777 a 2048 px** — un salto
de 10,4 %, el mismo 10,1 % de #366. El sesgo de `fitscut` es real, no huella.

## Corrida 2 (2026-11-11) — AC3 y AC5 con máscara común

```
AC3 sobre 69 objetos (σ/px contra el mosaico nativo, σ del parche de fitscut)
  fitscut  mediana 2.61e-3  ·  peor 1.65e+0
  propio   mediana 0.00e+0  ·  peor 0.00e+0
  listón: peor propio < 0,32 y < peor fitscut  →  PASA
AC5  PNG Σ propio / Σ fitscut = 0.9997  (147.10 / 147.13 MB)  ·  resolución distinta de la regla C: 0  →  PASA
```

Peores de `fitscut`: NGC 6543 1,65 σ/px (−1,0 % sobre un núcleo muy
brillante), NGC 6720 0,336, NGC 3310 0,086. Máscara mínima: NGC 1982 41,7 %
(Trapecio, saturado), NGC 253 90,8 % (borde de cobertura); el resto ≥ 96 %.

## Regla de NaN del remuestreo propio (decidida tras la corrida 2)

Un píxel grueso lleva dato solo si **al menos la mitad de su área** lo tiene.
Principio: un píxel representa su área y una astilla minoritaria no la
representa. No se eligió por reproducir a `fitscut`: `fitscut` no tiene regla
única (a factor 2 exacto, Abell 12, marca NaN solo el bloque entero; a 2,34,
NGC 205, deja 429 NaN entre los 354 de «todo NaN» y los 515 de «mayoría»).
Fijada en `test_remuestreo_ps1.js`. No afecta a AC3 (la máscara solo usa
bloques enteros con dato); la corrida 3 vuelve a pesar AC5 con ella.

## Veredicto por AC

| AC | Resultado | Cifra |
|---|---|---|
| AC1 RAM | pico **485–616 MB** nativo frente a 234–294 MB fitscut (×2,1), lejos de 8 GB. **Swap: +284 MB, el listón literal de 256 MB FALLA** | ver nota |
| AC2 volumen | **CABE**: factor medido ×3,95 en la muestra; extrapolado a 2065 aptas 25,3 GB / 2,1 h (hoy 6,0 GB / 1,3 h) | ≤ 100 GB, ≤ 24 h |
| AC3 flujo | **PASA** (corrida 2): propio 0, `fitscut` peor 1,65 σ/px, por encima de los 0,32–0,36 de #366 | |
| AC4 en caliente | **PASA**: sin cambios en `ps1-proxy.php`, `dso-texturas-datos.js` ni `bitacora-ps1.js`; `test_ps1_proxy.php` verde | |
| AC5 PNG | **PASA** (corrida 2): ×0,9997, misma resolución en 69/69 | corrida 3 pendiente |
| AC6 | **pendiente de decisión**: depende de cómo se lea la swap de AC1 | |

**Nota sobre la swap (AC1).** El listón prerregistrado mide `vm.swapusage`
de TODA la máquina antes y después de una corrida de unos 25 min, con 1,2 GB
ya en swap al empezar y otros procesos vivos. Con un pico de 616 MB en 16 GB
no es atribuible a la medida, pero el ADR 0012 bis no deja reinterpretarlo a
posteriori: el listón, leído literalmente, FALLA. La salida limpia es una
medida nueva y fechada contra el MISMO listón —solo `fitscut`, solo nativo y
un control en reposo de igual duración— o que el dueño de la issue decida.

**AC2, alcance.** La extrapolación es a las 2065 filas aptas de hoy (la issue
dice ≈1050), y cuenta solo los recortes del parche: la escalera de lados
(ADR 0034) y el campo vecino multiplican por igual los dos caminos.

## Cómo queda en el código

Opt-in: `node scripts/gen_dso_texturas.js --solo "NGC 5194" --nativo`. Con el
flag, `version()` lleva `nativo` en la semilla (otro nombre de fichero, sin
pisar lo publicado) y el sidecar `remuestreo: "nativo+area"`. Sin el flag,
mismos píxeles y mismos hashes que antes. Pasarlo a defecto republicaría el
banco entero (tercera republicación): decisión aparte.

Aviso de paso: el generador reescribe `dso-texturas-datos.js` y
`dso_texturas_informe.md` en cada ejecución, aunque se le pase `--dir`. Ya
era así antes de esta issue.
