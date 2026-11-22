# Qué implica eliminar la caché (sin eliminar el proxy)

> **Estado (2026-11-22):** decisión tomada, no se quita la caché. Este documento queda como referencia histórica. Cierre en #601.

Fecha: 2026-11-22. Estado: investigación de solo lectura, sin código. Contexto: #601
(cerrado; PR #603, ADR 0041) y la pregunta «¿quito la caché y empiezo de cero con
una de más aciertos?».

Rutas relativas a la raíz del repo. Las líneas son de `main` en `2bedfc4`, idénticas en
`origin/main` `0e7e9b1` para los ficheros de código (la PR #603 solo trae documentación).

---

## 0 · Conclusión corta

1. **«La caché» de #601 es la caché en disco de `gaia_proxy.php`.** Hay otras capas de
   caché en el proyecto (§2). Si se quitan todas, el coste cambia mucho (§4).
2. **El ratio bajo no viene de un fallo de implementación, sino del diseño de la clave.**
   La clave es el centro de la vista cuantizado a 0,001° (`gaia_proxy.php:57`,
   `:132-143`, `:151-154`). Cada desplazamiento del campo es una entrada nueva (#601,
   «Contexto»). Además, solo el 9,8 % de los campos se vuelve a pedir (#355). Una caché
   nueva con la misma clave tendría el mismo ratio.
3. **La caché de Gaia no se puede quitar sin más: está acoplada a la cadena asíncrona
   (ADR 0014, #505).** El resultado de un campo denso (minutos de TAP) solo llega al
   observador porque se escribe en disco y el siguiente sondeo lo lee como `hit`. Además,
   el `.job` solo se borra después de esa escritura (`bitacora-cache-lru.php:300-304`).
   Sin disco, hay que guardar ese resultado en algún sitio hasta entregarlo, y eso ya es
   una caché. Hoy esto pesa: 2 047 de 2 745 peticiones son `pendiente` (#601).
4. **El problema que motivó #601 (M13/M22 a 60-90′, ~40 s en cada desplazamiento) ya
   tiene solución decidida, y no es una caché:** el banco del globular hasta R_MAX = 1,08°
   (ADR 0041, #583). Para los globulares, eliminar la caché no aporta nada que el banco no
   aporte ya.
5. **El diseño «obvio» de caché con más aciertos, por celdas HEALPix, ya se midió y no
   pasó** (ADR 0030, eje 2, `informe_e4.md:3`, `:38`): el frío salió 2,27× peor que el
   control, con listón ≤ 1,5×. Lo que sí funcionó es lo precalculado offline por celda
   (Avance, ADR 0033) y por objeto (banco, ADR 0041).

Recomendación: no quitarla ahora. Si se quita, quitar solo la capa de disco de Gaia y
dejar un almacén mínimo para el resultado asíncrono (§6). Es aproximadamente 1,5 días.

---

## 1 · Proxy frente a caché: qué es cada cosa

### 1.1 `simulador_ocular/gaia_proxy.php` (1165 líneas)

| Pieza | Líneas | ¿Proxy o caché? | Notas |
|---|---|---|---|
| Validación de parámetros y cotas (rad ≤ 4,5°, mag ≤ 20, `desde`) | 1089-1119 | **Proxy** | Frontera de confianza: se queda |
| Consultas ADQL sonda/segura, failover GAVO→CDS | 172-205, 966-990 | **Proxy** | Se queda |
| Fondo agregado y velo espacial (ADR 0014, 0029) | 212-328, 940-959 | **Proxy** | Se queda |
| Cadena asíncrona UWS (hist→espacial→datos) y su `.job` | 340-512, 793-917 | **Proxy, acoplado a la caché** | El `.job` vive en `cache_gaia/` (`:343-345`) y lo borra el flujo de caché (`:861-866`) |
| Pista de densidad con el Avance (#517) | 83-99, 579-755 | **Proxy** | Lee `avance/`, no la caché |
| `gaia_cuantizar()` | 57-59, 132-143 | Mixto | Existe para dar aciertos. También redondea rad/mag hacia arriba (superconjunto) y acota la variedad de consultas al TAP |
| `gaia_clave()`, `gaia_ruta()` | 151-159 | **Caché** | `sha1('%.3f_%.3f_%.2f_%.2f'[+_d15])` → `cache_gaia/<sha1>.json.gz` |
| Tope LRU 1,5 GB, lowwater 0,90 | 43-47 | **Caché** | |
| `gaia_servir()`: gzip en disco, `ETag` = clave, `Cache-Control: public, max-age=86400`, 304 | 71, 993-1050 | **Caché** (disco + navegador) | |
| `?stats=1` y log `.hits.log` | 72, 513-560, 756-772, 1068-1083 | Métrica | Hoy mide la caché. La traza por proveedor TAP (#429) sirve también sin caché |
| `ignore_user_abort` + `set_time_limit` | 1055-1066 | Proxy, justificado por la caché | «PHP termina la consulta y la ESCRIBE en la caché» (`:1061-1066`). Sin caché, el trabajo de un cliente que corta se pierde |
| `cache_lru_flujo(...)` | 1131-1165 | **Caché + orquestación** | Todo el flujo de la petición pasa por aquí |
| `cache_gaia/.htaccess` | 1-9 | Caché | Impide descargar el log (PR #428). `.gitignore:25-28` |

### 1.2 `simulador_ocular/bitacora-cache-lru.php` (349 líneas, compartido por los tres proxies)

| Pieza | Líneas | ¿Proxy o caché? |
|---|---|---|
| `cache_lru_seleccionar_evict`, `cache_lru_limpieza` | 32-100 | **Caché** |
| Turnos de descarga (semáforo de 4 por proxy, 503 + Retry-After) | 108-145, 260-274 | **Proxy**: protege el hosting y los TAP. Se queda |
| Log de latencia y traza por origen | 147-201 | Métrica (se queda) |
| `cache_lru_flujo`: acierto+touch, flock por clave, segunda comprobación, fetch, escritura tmp+rename, borrado del `.job`, 202/502 | 232-349 | **Mezcla**: el flock evita estampidas (proxy) y el resto es caché |

Comentario de cabecera: el módulo se sube por FTP **antes** que los tres proxies; un
proxy nuevo con el módulo viejo da un fatal (`bitacora-cache-lru.php:21-22`).

### 1.3 `dss-proxy.php` y `ps1-proxy.php`

Usan el mismo flujo: `dss-proxy.php:22-30` (`cache-dss/`, 150 MB, max-age de 1 año,
`immutable`) y `:175-200`, `:230`. `ps1-proxy.php:32-38` (`cache-ps1/`, 150 MB, 1 año) y
`:294-318`, `:345`. **No hay `?stats` ni cifras de aciertos en el repo para ninguno de
los dos** (PR #19 quitó las stats del DSS): su tasa de aciertos no se puede verificar
desde aquí. El log existe en producción (`DSS_LOG_FILE`, `PS1_LOG_FILE`).

---

## 2 · Inventario completo de capas de caché

| # | Capa | Dónde | Clave / TTL | ¿Entra en «la caché» de #601? |
|---|---|---|---|---|
| C1 | Disco Gaia | `gaia_proxy.php`, `cache_gaia/` | centro 0,001°, rad 0,01°↑, mag 0,5↑, `desde`; sin TTL, LRU 1,5 GB | **Sí** |
| C2 | Navegador (HTTP) Gaia | `gaia_proxy.php:1012-1013` | URL completa; 86 400 s + ETag | Sí (sale de C1) |
| C3 | Memoria del cliente Gaia | `resources/js/bitacora-gaia-render.js:1270`, `:1604-1688` (`cacheGaia`) | `ra.toFixed(3),dec.toFixed(3)`, superconjunto monotónico en rad/mag (PR #154, ADR 0014); dura la sesión | No: acierta dentro de la sesión. Si se quita, cada repintado vuelve a pedir |
| C4 | Memoria del cliente Avance | `bitacora-gaia-render.js:1437-1556` (`cacheAvance`, 2000 celdas) | ipix | No |
| C5 | Disco DSS / PS1 + navegador | §1.3 | clave por parámetros; 1 año, immutable | Solo si «la caché» es todo |
| C6 | Memoria del cliente PS1 | `resources/js/bitacora-ps1.js:1929-2104` (`cachePS1`) | por parche | No |
| C7 | Transients de WordPress (catálogos) | `resources/plugins/bitacora-registro/bitacora-catalogos.php:40-45, 69, 186, 213, 260, 289, 315, 344, 357, 386, 400` | SIMBAD v4, BP-RP, VizieR, OAC, NED: 30 días; «no está», 1 día; fallo de red, 5 min (`bitacora-registro.php:37`) | No (otro sistema), pero ver §4.3 |
| C8 | Transient `/resolver` | `bitacora-registro.php:3969-3988` | `q` en minúsculas; 1 día / 5 min | No, pero el cupo depende de él (§4.3) |
| C9 | Transient catálogo de equipo | `bitacora-registro.php:55, 748, 2563-2566` | 12 h, se invalida al escribir | No (caché de BD local) |

Lo que **no** es caché aunque lo parezca: el **Avance** (`avance/`, ADR 0033:19-22,
generado offline y «fuera de la caché LRU») y el **banco del globular** (ADR 0041,
#583). Son datos precalculados con clave fija (celda, objeto). Son el modelo que sí
acierta (§5).

**Base de datos:** no hay ninguna tabla de caché de Gaia, DSS ni PS1. La caché de los
proxies es solo de ficheros. Los transients C7-C9 viven en `wp_options` (o en el
object cache, si el hosting lo tiene), no en tablas propias.

---

## 3 · Evidencia de la tasa de aciertos y por qué falla

| Fuente | Ventana | Peticiones | hit / miss | Ratio |
|---|---|---|---|---|
| `docs/notas/stats-cache-gaia-2026-10-10T1030.json` y #355 | 21-09 → 10-10 (18,8 d) | 229 | 43 / 184 (+2 304) | **0,19**; sin el campo dominante, **0,096** |
| #601 (`?stats=1`, 2026-11-21) | no consta | 2 745 | 140 / 478 (+65 error, 2 047 pendiente) | **0,23** |

Causas, con su fuente:

1. **La clave es la vista, no el cielo.** El centro se cuantiza a 0,001° = 3,6″
   (`gaia_proxy.php:57`). «Cada desplazamiento del campo es un cono nuevo, y con 90′ el
   núcleo denso entra en todos» (#601).
2. **Casi nadie repite.** De 184 claves nuevas, solo 18 se volvieron a pedir (9,8 %). De
   433 entradas antiguas, 7 en 19 días (#355, comentario 6101947110). «Ninguna clave ha
   fallado dos veces»: el LRU no expulsa nada que se fuera a usar. **Lo que falla es la
   clave, no la capacidad.**
3. **La magnitud parte la clave.** De 587 campos, 33 tienen varias magnitudes: 37
   claves sobran, 38,7 MB (8 %) (#355 §4; `cifras-cache-gaia-355-2026-10-10.txt`, línea
   P4). Se descartó arreglarlo (#356, NOT_PLANNED) porque colapsar `mag` rompe el
   `fondo`/`espacial` (`verificacion-epica-cache-gaia.md` §5c, M1/M2).
4. **`desde` duplica la clave.** El complemento débil es otra entrada
   (`gaia_proxy.php:151-153`). ADR 0033:66-67 ya lo anticipaba.
5. **Cliente y servidor no usan la misma cuantización.** El cliente pide con
   `toFixed(5)` (`bitacora-gaia-render.js:1629`) y el servidor cuantiza a 3 decimales.
   Por eso la caché del navegador (C2), que va por URL, acierta todavía menos que C1: dos
   URLs distintas caen en la misma entrada del servidor, pero no en la misma del
   navegador. Inferido del código; no hay medida.
6. **El ratio mezcla poblaciones.** `ratio = hit/(hit+miss)` excluye los 304 y los
   `pendiente` (`gaia_proxy.php:524-560`). En #601 el 75 % del tráfico son sondeos 202:
   la cifra de aciertos no habla de ese tráfico.
7. **El coste está en los fallos densos en frío, y ninguna caché por vista los evita:**
   39,5 s de mediana y p90 121 s (#355), los mismos 39,5 s en #601. Un acierto cuesta
   16 ms (`stats-cache-gaia-2026-10-10T1030.json`, `ms_mediano.hit`).

---

## 4 · Qué se rompe o cambia si se quita

### 4.1 Solo C1+C2 (disco y navegador de Gaia), con el proxy intacto

| Efecto | Detalle | Fuente |
|---|---|---|
| **Cadena asíncrona sin entrega garantizada** | El sondeo que termina el paso `datos` recibiría el JSON por `directo`. Si ese sondeo se pierde (pestaña cerrada, red), los minutos de TAP se pierden también y el siguiente sondeo relanza la cadena entera (280 s medidos en M7). Los demás observadores del mismo campo tampoco lo reciben. Además, el `.job` ya no lo borra nadie: hoy lo borra el rename (`bitacora-cache-lru.php:302-304`) | ADR 0014 («Un job por clave», «Fin»), `gaia_proxy.php:76-78`, `:861-866` |
| **Texto al usuario falso** | `textoPendiente` promete «Después queda guardado» | `bitacora-gaia-render.js:1362` |
| **`ignore_user_abort` pierde su sentido** | Hoy termina la consulta para escribirla en disco | `gaia_proxy.php:1061-1066` |
| Latencia | Los 140 aciertos de #601 pasan de ~16 ms a sonda (1,8 s de mediana, p90 17,9 s) o densa (39,5 s, p90 121 s). Con los tiempos medianos, unas 140 × 2-40 s más de espera en esa ventana. No se puede calcular mejor sin el reparto hit/etapa de #601 | #355, #601 |
| Carga a GAVO/CDS | Cada acierto se convierte en una consulta. Los turnos (4 a la vez) siguen limitando la concurrencia | `bitacora-cache-lru.php:108` |
| Estampida | El flock por clave hoy hace que el segundo en llegar lea lo que trajo el primero. Sin entrada en disco, el segundo vuelve a pedir: hay que convertir el lock en «esperar y repetir» o en «un solo vuelo» | `bitacora-cache-lru.php:276-285` |
| Métrica | `?stats=1` deja de tener hit/miss. La traza por proveedor y los ms por etapa siguen siendo útiles: conviene conservarlos | `gaia_proxy.php:1068-1083` |
| Disco liberado | Hasta 1,5 GB en `uploads/bitacora/cache_gaia/` (en octubre eran 486 MB; la ocupación actual no consta en el repo) | `gaia_proxy.php:46`, #355 |
| Versión del plugin | **No aplica**: el proxy vive en `uploads/bitacora/`, fuera del plugin. No hay migración ni `Version:` que subir | `bitacora-gaia-render.js:88`, AGENTS.md |
| Despliegue | FTP del proxy y, si se toca, del módulo **antes** (fatal si no) | `bitacora-cache-lru.php:21-22` |
| Ficheros huérfanos en producción | `cache_gaia/*.json.gz`, `*.lock`, `*.tmp*`, `.cleanup`, `.turno0-3`, `.hits.log(.1)`. Se borran a mano por FTP. `*.job` solo si no hay cadenas vivas | código citado arriba |

### 4.2 Tests que caen o cambian

- `scripts/test_cache_lru.php` (281 líneas): entero si se borra el módulo. Si solo se
  saca Gaia del flujo, sigue valiendo para DSS/PS1.
- `scripts/test_gaia_proxy.php`: los bloques de cuantización/clave (`:22-37`), log y
  rotación (`:125-140`, `:320-336`), barrido LRU, `.gitignore` y `.htaccess`
  (`:360-400`).
- `scripts/test_dss_proxy.php:53-54` y `scripts/test_ps1_proxy.php` (aserciones sobre
  clave y flujo), solo si se tocan DSS/PS1.
- Cliente: `scripts/test_consulta_gaia.js:130` y `scripts/test_vista_gaia.js:286, 403,
  540` dependen de `cacheGaia` (C3). Solo caen si se quita C3. `test_precalentado_gaia.js`
  también (el precalentado no tiene sentido sin C3, `bitacora-gaia-render.js:1380-1420`).
- Herramientas: `scripts/analiza_cache_gaia_355.py`, `scripts/harness_gaia_desde_e2e.py`
  y `scripts/dev_servidor_ocular.php` se quedan sin uso o hay que adaptarlos.
- `ESPERADOS` (`scripts/bateria.js:59-61`) no tiene ninguna entrada de caché: no hay
  ningún rojo conocido que limpiar.

### 4.3 Si «la caché» incluye todo (C3-C9)

- **C3 (memoria del cliente):** cada repintado, cambio de ocular o vista repetida volvería
  al proxy (lo que corrigió #461). El precalentado deja de servir. **No se recomienda.**
- **C5 DSS/PS1:** cada placa o parche vuelve a ESO/SkyView/STScI. Sin PS1 en disco, el
  navegador hace hasta 8 peticiones por galaxia, de ~2,6 s cada recorte
  (`ps1-proxy.php:12-15`, en el camino de respaldo; las texturas offline de `dso/` no
  dependen de esto). STScI no publica una cifra, pero avisa de que una descarga
  «excesiva» acaba bloqueada:
  <https://outerspace.stsci.edu/display/PANSTARRS/PS1+Image+Cutout+Service>. No he
  encontrado la política de uso de ESO DSS ni de SkyView: **sin verificar**.
- **C7/C8 (transients de catálogos):** el plugin sí tendría que cambiar (sube
  `Version:`, aunque no hay esquema que migrar). Riesgos documentados:
  - **SIMBAD:** 10 consultas/s por IP; más de 10 en un segundo = baneo de 1 min, más de
    400 en 10 s = 1 h, automático (FAQ de SIMBAD,
    <https://cds.unistra.fr/help/faq/simbad/>, citada a través de un buscador porque el
    servidor de CDS rechazó la conexión directa durante esta investigación).
  - **NED:** como mucho 1 consulta por segundo, sin concurrencia
    (<https://ned.ipac.caltech.edu/Documents/Guides/Interface/QueryAuto>).
  - **VizieR/TAPVizieR:** no he encontrado un límite publicado
    (<https://cds.unistra.fr/help/faq/vizier/>).
  - **OAC:** sin verificar.
  - **El cupo anónimo de `/resolver` solo cuenta los fallos de caché**
    (`bitacora-registro.php:3966-3968`, `:3971-3981`). Sin transient, cada búsqueda gasta
    cupo y repite las ~6 llamadas externas.
- **GAVO:** su servicio síncrono corta las consultas en ~10-15 s por defecto (ayuda del
  sitio <http://dc.zah.uni-heidelberg.de/static/help.shtml> y ejemplos TAP
  <https://dc.zah.uni-heidelberg.de/__system__/tap/run/examples>). En producción se ha
  medido el corte a ~20-21 s (ADR 0041, #505). GAVO es un servicio universitario (#601,
  «2 jobs a la vez como máximo»). No he encontrado una cuota numérica publicada.

### 4.4 ADRs y documentos que quedarían obsoletos o habría que enmendar

- `simulador_ocular/docs/adr/0014-adquisicion-gaia-por-regimen-de-densidad.md:55`
  («una vez por región, caché inmutable»), `:157-158` («Caché del proxy: misma
  clave…»), y la sección del job (`.job` junto a la entrada; «se escribe la entrada»).
- `simulador_ocular/docs/adr/0033-avance-de-gaia-y-complemento-debil.md:66-67` (clave
  con `desde`).
- `simulador_ocular/docs/adr/0041-banco-del-globular.md` («Qué cambia en el proxy: ese
  parámetro entra en la clave de caché») y la estimación de #583 (13 pts incluye «proxy
  con el círculo excluido… en la clave de caché»). **Quitar la caché simplifica #583.**
- `simulador_ocular/README.md:50, 74-75, 166, 949, 1040-1070` (secciones «Caché del
  DSS» y «Caché de los parches de PanSTARRS»).
- `simulador_ocular/docs/notas/verificacion-epica-cache-gaia.md` y las cifras de #355
  quedan como histórico.
- Reaperturas pendientes de #356/#357/#358 (condición: un `miss` densa repetido o un 304
  con etapa): pierden el sentido.

---

## 5 · Lecciones para una caché nueva con más aciertos

1. **La clave tiene que ser del cielo, no de la vista.** Una clave por (centro, radio,
   mag) nunca se repite al desplazar el campo (§3.1-3.2). Lo que acierta en el proyecto
   tiene clave fija: celda HEALPix (Avance) y objeto (banco).
2. **Pero el teselado en caliente ya falló.** ADR 0030, eje 2: equivalencia, celdas por
   campo y tamaño PASAN; **frío absoluto NO PASA en los 6 campos (2,27× el control)** y la
   reconstrucción caliente tampoco pasa (148-203 ms) (`0030-dos-ejes-gaia/informe_e4.md:3,
   :35-38`). Una caché por celdas que se llena bajo demanda paga ese frío. El camino
   medido que funciona es **precalcular offline** (ADR 0033: Avance G < 15; ADR 0041:
   banco G ≤ 20 en 143 globulares) y dejar a Gaia en vivo solo la franja o el
   complemento.
3. **Antes de diseñar, prerregistrar el listón de aciertos y su caso malo** (AGENTS.md,
   «Prerregistros»). Por ejemplo: el reuso medido es 9,8 % de campos, así que ninguna
   política por vista puede pasar de ~0,1-0,25. Un listón de «≥ 0,5» tiene que rechazar
   una caché por vista.
4. **Medir aparte lo que cuesta.** El ratio global está dominado por sondas baratas y
   sondeos 202. La métrica útil es «segundos de TAP denso ahorrados» por régimen (#355 ya
   la separaba: 17 aciertos densos ≈ 11 min en 19 días).
5. **Que cliente y servidor cuanticen igual** (o que el cliente pida ya cuantizado):
   entonces la caché del navegador (C2) acierta lo mismo que el disco.
6. **Versionar el formato en la clave o en el ETag** desde el primer día: el ETag = clave
   bloquea cualquier cambio de cuerpo (`verificacion-epica-cache-gaia.md`, M6), y SIMBAD
   ya tuvo que versionarse (`bitacora-catalogos.php:65-69`, PR #93).
7. **No mezclar el almacén del resultado asíncrono con la caché de aciertos.** Son dos
   necesidades: «entregar lo que costó minutos» (obligatorio, ADR 0014) y «reusar entre
   observadores» (opcional, de poco valor según #355).
8. **Lo inmutable no caduca, pero la clave sí se queda vieja:** la caché por vista llena
   el disco con entradas frías (7,46 MB/día, #355) sin ayudar.

---

## 6 · Pasos mínimos para quitar C1+C2 dejando el proxy

Supuesto: solo Gaia. DSS y PS1 siguen con el módulo compartido.

| # | Paso | Estimación |
|---|---|---|
| 1 | ADR nuevo en `simulador_ocular/docs/adr/` que retire la caché de Gaia y enmiende 0014/0033/0041 (§4.4). Prerregistro con el listón de lo que debe mejorar | 2 h |
| 2 | En `gaia_proxy.php`, sustituir `cache_lru_flujo` por un flujo propio corto: turnos (`cache_lru_turno`) → flock por clave → fetch → servir directo con `Cache-Control: no-store`. Fuera `gaia_servir`, `ETag`/304, LRU y `GAIA_CACHE_MAX_BYTES`/`LOWWATER`/`CLIENT_MAXAGE` | 3 h |
| 3 | **Almacén del resultado asíncrono:** al acabar la cadena, escribir el JSON junto al `.job` (`<clave>.res.json.gz`) y servirlo, y borrar ambos tras la primera entrega o tras un TTL corto (p. ej. 1 h). Sin esto, §4.1 fila 1 | 2-3 h |
| 4 | `?stats=1`: quitar hit/ratio/ocupación y mantener peticiones, errores, pendientes, ms por etapa y traza por proveedor | 1 h |
| 5 | Tests: reescribir los bloques de `test_gaia_proxy.php` (§4.2) y añadir uno del almacén asíncrono (entrega única + TTL). Pasar `php` de todos los `test_*.php` y `node scripts/bateria.js --rapida` | 3 h |
| 6 | `textoPendiente` (`bitacora-gaia-render.js:1362`): cambiar «Después queda guardado». Subir el `?v=` del JS (#449) | 0,5 h |
| 7 | Desplegar por FTP (proxy, y el módulo antes si se toca); probar M7 (denso/async), M13 y un campo disperso; vaciar a mano `cache_gaia/*.json.gz` | 1 h |
| 8 | README del simulador y PR con plantilla | 1 h |

**Total: ~1,5 días (12-14 h).** Si además se borra `bitacora-cache-lru.php` entero
(sacando los turnos y el log a un módulo nuevo y tocando DSS y PS1): **+1 día**. Si también
se quitan los transients del plugin: **+0,5 día**, más `Version:`, y con riesgo de baneo
en SIMBAD/NED (§4.3), así que **no se recomienda**.

### Riesgos

- **Alto:** perder resultados de cadenas asíncronas (minutos de GAVO) si se omite el paso
  3.
- **Medio:** más carga en GAVO, un servicio universitario sin cuota publicada, y más
  latencia en los ~23 % de peticiones que hoy aciertan.
- **Medio:** un despliegue con el orden de FTP mal hecho da un fatal en los tres proxies.
- **Bajo:** archivos huérfanos en `cache_gaia/` (solo ocupan disco).
- **De producto:** quitarla no acelera M13/M22. Eso lo hace #583. Si se hace antes de
  #583, se simplifica su estimación (desaparece «en la clave de caché»).

---

## Fuentes

- Issues: #601, #583, #355 (veredicto, comentario 6101947110), #356, #357, #358, #359,
  #505, #517, #518, #461, #449, #428. PRs: #9, #18, #19, #29, #154, #365, #488, #603.
- ADRs: `simulador_ocular/docs/adr/0014-…`, `0030-dos-ejes-gaia-preregistro-de-listones.md` +
  `0030-dos-ejes-gaia/informe_e4.md`, `0033-…`, `0041-banco-del-globular.md`.
- Notas: `simulador_ocular/docs/notas/verificacion-epica-cache-gaia.md`,
  `cifras-cache-gaia-355-2026-10-10.txt`, `stats-cache-gaia-2026-10-10T1030.json`.
- Documentación externa: FAQ de SIMBAD <https://cds.unistra.fr/help/faq/simbad/>; NED
  <https://ned.ipac.caltech.edu/Documents/Guides/Interface/QueryAuto>; FAQ de VizieR
  <https://cds.unistra.fr/help/faq/vizier/>; ayuda de GAVO
  <http://dc.zah.uni-heidelberg.de/static/help.shtml> y
  <https://dc.zah.uni-heidelberg.de/__system__/tap/run/examples>; PS1 Cutout
  <https://outerspace.stsci.edu/display/PANSTARRS/PS1+Image+Cutout+Service>.
- Sin verificar: políticas de ESO DSS, SkyView y OAC; tasas de acierto de DSS/PS1; la
  ventana temporal y el reparto por etapa del `?stats=1` de #601.
