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
