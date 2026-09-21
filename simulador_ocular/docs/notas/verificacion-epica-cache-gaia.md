# Verificación de la épica de la caché del proxy de Gaia (#359 y #354–#358)

Fecha: 2026-09-20. Estado: verificación contra fuentes primarias, sin código.

Se contrastan una a una las afirmaciones técnicas de la épica #359 y de sus
cinco historias (#354, #355, #356, #357, #358) contra el código de `main`, los
ADR del repositorio y una sonda en vivo al TAP de CDS/VizieR. No se usa ningún
resumen: cada veredicto lleva la cita `fichero:línea` que lo sostiene.

Ficheros de referencia (rutas reales, ver M9: la épica cita una que no existe):

- `simulador_ocular/gaia_proxy.php`
- `simulador_ocular/bitacora-cache-lru.php`
- `resources/js/bitacora-gaia-render.js`
- `scripts/test_gaia_proxy.php`, `scripts/test_precalentado_gaia.js`
- `simulador_ocular/docs/adr/0014-adquisicion-gaia-por-regimen-de-densidad.md`
- `simulador_ocular/docs/adr/0029-preregistro-velo-espacial-por-celdas.md`

---

## 1 · «Se cachea la respuesta final mergeada, un `.json.gz` por clave `sha1(ra_dec_rad_mag)`, inmutable»

**CORRECTA.**

- La clave es `sha1(sprintf('%.3f_%.3f_%.2f_%.2f', ra, dec, rad, mag))` —
  `gaia_proxy.php:94-96`.
- La ruta es `cache_gaia/<clave>.json.gz` — `gaia_proxy.php:99-101`, con
  `GAIA_CACHE_DIR = __DIR__ . '/cache_gaia'` en `gaia_proxy.php:35`.
- Lo que se escribe es el valor de retorno de `gaia_fetch()`, es decir el JSON
  **ya mergeado** con `fondo` y `fondo.espacial` — `gaia_proxy.php:455` y
  `gaia_proxy.php:466-472` (`gzencode($json, 6)` → `.tmp<pid>` → `rename`).
- Inmutabilidad: no hay TTL en ninguna parte. El acierto se sirve sin comprobar
  edad (`gaia_proxy.php:440-443`), lo único que acota el disco es el LRU por
  tamaño, y así está documentado en `gaia_proxy.php:17-19` y en
  `bitacora-cache-lru.php:7-11`.

Matiz menor de contabilidad: la entrada en disco está comprimida con gzip nivel
6 (`gaia_proxy.php:466`). Todas las cifras de bytes que cita la épica («~14 MB»)
son del cuerpo en claro, no del fichero. Ver M4.

---

## 2 · «En campo disperso se cachea solo la sonda; en denso, segura+fondo+espacial, y la sonda se descarta con `unset`»

**CORRECTA.**

- Sonda primero, sin `ORDER BY` — `gaia_proxy.php:288` con
  `gaia_consultas(..., $segura=false)` en `gaia_proxy.php:112-121`.
- Si no toca techo, se devuelve tal cual y es lo único que se cachea —
  `gaia_proxy.php:289-293`, con `gaia_truncada()` en `gaia_proxy.php:257-260`.
- `unset($json)` antes de la segunda pasada — `gaia_proxy.php:294`.
- Rama densa: segura (`gaia_proxy.php:296`), fondo escalar
  (`gaia_proxy.php:304-310`) y agregado espacial (`gaia_proxy.php:311-314`).

Dos precisiones que la épica no hace y que importan para #357:

- En campo denso el cuerpo de la sonda **nunca llega a disco**. No hay una
  entrada de sonda voluminosa que proteger ni que evictar en los campos densos:
  sonda y segura son mutuamente excluyentes por campo. El «hasta cuatro ficheros
  por campo» de #357 no puede ocurrir: son tres (denso) o uno (disperso).
- El `unset` no cubre el caso «la sonda devolvió algo ilegible»
  (`$filas === null` en `gaia_proxy.php:291`): ahí se salta a la línea 296 sin
  liberar, aunque la reasignación de `$json` lo libera igualmente. Es inocuo.

---

## 3 · Tope 500 MB, lowwater 0,90, y si `.hits.log` sobreviviría al barrido

**CORRECTA, y el criterio de aceptación 4 de #354 se cumple por partida doble.**

- `GAIA_CACHE_MAX_BYTES = 500 * 1024 * 1024` — `gaia_proxy.php:36`.
- `GAIA_CACHE_LOWWATER = 0.90` — `gaia_proxy.php:37`, consumido en
  `cache_lru_seleccionar_evict()` (`bitacora-cache-lru.php:28-44`).
- La invocación pasa `'patron' => '*.json.gz'` — `gaia_proxy.php:479-484`.

El barrido tiene **dos** globs, no uno, y hay que mirar los dos:

- LRU: `glob($dir . '/' . $cfg['patron'])` — `bitacora-cache-lru.php:74`.
- Huérfanos: `glob($dir.'/*.lock')` y `glob($dir.'/*.tmp*')` —
  `bitacora-cache-lru.php:91-95`, filtrados por `huerfano_ttl`
  (`GAIA_ORPHAN_TTL = 3600`, `gaia_proxy.php:65`).

`.hits.log` y `.hits.log.1` no casan con ninguno de los tres patrones por
extensión. Y además `glob()` de PHP hereda la semántica del shell: un patrón que
empieza por `*` **no** casa ficheros que empiezan por punto. Comprobado en esta
máquina (PHP 8.5.8) con un directorio sembrado con `.hits.log`, `.hits.log.1`,
`a.json.gz`, `b.lock`, `c.tmp123` y `.cleanup`: los tres globs devuelven
exactamente `a.json.gz`, `b.lock` y `c.tmp123`. El propio sello de la limpieza
(`$dir . '/.cleanup'`, `bitacora-cache-lru.php:64`) ya depende de esa misma
propiedad y nunca se ha autoborrado, lo que es evidencia adicional.

**Veredicto:** el log no corre riesgo de ser borrado, ni por LRU ni por el
barrido de huérfanos. El criterio de aceptación es correcto tal como está
escrito. La mitad del punto 4 de #354 que habla de git ya está resuelta: todo
`simulador_ocular/cache_gaia/` está ignorado en `.gitignore:25`.

Lo que sí falta en #354 y no está cubierto: el directorio cuelga del árbol
público del proxy (ver M3).

---

## 4 · Las siete constantes

**CORRECTA, las siete.**

| constante | valor | línea |
|---|---|---|
| `GAIA_QUANT_MAG` | `0.5` | `gaia_proxy.php:50` |
| `GAIA_MAX_MAG` | `20.0` | `gaia_proxy.php:61` |
| `GAIA_MAX_ROWS` | `40000` | `gaia_proxy.php:51` |
| `GAIA_TECHO_FILAS` | `200000` | `gaia_proxy.php:55` |
| `GAIA_ESPACIAL_N` | `8` | `gaia_proxy.php:59` |
| `GAIA_MAX_RAD` | `4.5` | `gaia_proxy.php:60` |
| `GAIA_REQUEST_TIMEOUT` | `55` | `gaia_proxy.php:47` |

`GAIA_MAX_MAG = 20.0` coincide con `GAIA_MAG_TOPE = 20.0` del cliente
(`resources/js/bitacora-gaia-render.js:64`), como declara el comentario.

---

## 5 · La afirmación central de #356: ¿la segura a mag 20 contiene la de mag 18?

**MATIZADA, y la distinción es la que decide la historia: la lista de estrellas
sí; el `fondo` y el `fondo.espacial` NO.**

### 5a · Dirección del `ORDER BY`

`gaia_consultas()` construye `' ORDER BY ' . 'Gmag'` sin `ASC` ni `DESC` —
`gaia_proxy.php:113-117` (CDS) y `:118-120` (GAVO). ADQL hereda el defecto de
SQL, que es ascendente, pero conviene no fiarse solo del defecto documentado:
sonda en vivo al TAP de producción de CDS/VizieR (2026-09-20, `I/355/gaiadr3`,
`TOP 5 … ORDER BY Gmag` sobre un círculo de 0,05° en 268,447 −34,841) devuelve
`Gmag` = 6,384 / 7,141 / 7,364 / 7,748 / 9,418. **Ascendente confirmado: el
`TOP 40000` se queda con las 40 000 más brillantes.**

### 5b · La lista de estrellas: la contención se cumple siempre

Sea `S(m)` el conjunto de estrellas del campo con `Gmag ≤ m` y `R(m)` el
resultado de la segura a magnitud `m` (las 40 000 de menor `Gmag` de `S(m)`).
Sea `c` el `Gmag` de la estrella número 40 000 de `S(20)`. Para `m₁ = 18 < 20`:

- **Caso A — el corte no llega a 18** (`c ≥ 18`, o sea hay ≤ 40 000 estrellas
  hasta 18): todas las de `S(18)` están entre las 40 000 más brillantes de
  `S(20)`, luego `R(20) ⊇ S(18) = R(18)`. Filtrar `R(20)` por `Gmag ≤ 18`
  devuelve **exactamente** `R(18)`.
- **Caso B — el campo es tan denso que las 40 000 se agotan antes de 18**
  (`c < 18`): entonces las 40 000 más brillantes de `S(20)` son todas más
  brillantes que 18, así que son las mismas 40 000 más brillantes de `S(18)`.
  Es decir `R(20) = R(18)`, **idénticos**, y filtrar por `Gmag ≤ 18` no quita
  nada.

O sea: el caso que la épica teme —el campo tan denso que el corte cae por debajo
de la magnitud pedida— no rompe la contención, la convierte en igualdad. **Para
la lista de estrellas la afirmación de #356 es correcta sin condiciones.** La
única reserva es de segundo orden: en el borde `Gmag == c` el desempate entre
estrellas de magnitud idéntica lo decide el servidor y no está garantizado que
sea estable entre consultas ni entre CDS y GAVO. Afecta a un puñado de filas del
límite, no al argumento.

### 5c · El `fondo` y el `espacial`: aquí la afirmación se rompe

El `corte` no es un parámetro libre: sale de la propia respuesta segura, como el
máximo `Gmag` servido — `gaia_corte()` en `gaia_proxy.php:160-173`, invocada en
`gaia_proxy.php:304`. Y las dos consultas agregadas llevan `mag` **dentro del
`WHERE`**:

- fondo escalar: `WHERE Gmag > corte AND Gmag <= mag` —
  `gaia_proxy.php:141-149`.
- agregado espacial: el mismo `WHERE` más `GROUP BY rx, dy` —
  `gaia_proxy.php:209-221`.

Combinando con 5b, en el **caso B** (el caso denso, que es justo aquel en el que
#356 quiere ahorrarse el `ORDER BY`):

- `R(20) = R(18)` ⟹ `corte₂₀ = corte₁₈ = c`, el mismo valor.
- La respuesta correcta a mag 18 lleva los momentos de la banda `(c, 18]`.
- La entrada cacheada a mag 20 lleva los momentos de la banda `(c, 20]`.

`n`, `flujo` y `m2` son **sumas sobre la banda**. La banda cacheada incluye toda
la población entre 18 y 20, que a mag 18 no debe contarse. Restarla a posteriori
exigiría conocer los momentos de `(18, 20]`, que es otra consulta al TAP.
**El agregado de fondo depende del `mag` pedido de una forma que no se puede
filtrar en el cliente.** Lo mismo, celda a celda, para `fondo.espacial`.

En el **caso A** (corte entre 18 y 20) el problema no existe: la banda entera
queda por encima de 18 y lo correcto a mag 18 es no llevar `fondo`; basta con
descartarlo, y `gaia_mezclar_fondo()` ya tiene esa condición
(`$corte >= $mag` ⟹ respuesta intacta, `gaia_proxy.php:181-184`).

La consecuencia física no es cosmética: `fondo.flujo` alimenta `veloSB()`
(`resources/js/bitacora-gaia-render.js:711-713`), que entra como cielo extra y
del que cuelgan `mlim`, `Cmin`, nivel de fondo y el velo espacial (ADR 0014,
§«Fondo agregado»). Servir a mag 18 un velo calculado hasta mag 20 infla el
cielo y ensombrece la magnitud límite del observador. Es exactamente el sesgo
que el ADR 0014 punto 4 quiere evitar al separar «población truncada» de
«población por debajo del `mag` físico».

### 5d · «El cliente ya recorta»: **INCORRECTA**

La premisa que #356 usa para justificar el filtrado tampoco se sostiene. El
cliente **no** filtra por magnitud: en
`resources/js/bitacora-gaia-render.js:1304` el único filtro es `f[2] != null`
(descartar filas sin `Gmag`). Y `consultar()` reutiliza deliberadamente una
entrada más honda de la pedida
(`resources/js/bitacora-gaia-render.js:1290-1299`, «superconjunto monotónico»).
El recorte que menciona el comentario de `gaia_cuantizar()`
(`gaia_proxy.php:69-75`) es **geométrico** —el lienzo dibuja lo que cabe—, no de
magnitud.

Esto tiene un corolario incómodo y ya vigente: con `GAIA_QUANT_MAG = 0.5`
redondeando hacia arriba, hoy ya se sirve de rutina un catálogo hasta 0,5 mag
más hondo del pedido, con su `fondo` calculado sobre una banda igualmente
desplazada. El sesgo de 5c ya existe en producción a escala de media magnitud.

### 5e · Veredicto de #356

- La afirmación literal («el resultado de la segura a mag 20 contiene el de
  cualquier mag menor») es **correcta sin condiciones para la lista de
  estrellas**, incluido el caso denso que se temía.
- El **alcance** propuesto —«consultar segura *y los agregados de fondo y
  espacial que la acompañan* a `GAIA_MAX_MAG` y filtrar por el `mag` pedido»—
  es **inviable tal como está escrito**: el criterio de aceptación 2 («el render
  no cambia») no se puede cumplir con un filtro a posteriori, porque el velo
  cambiaría.
- La **alternativa barata** (subir `GAIA_QUANT_MAG` a 1,0 o 2,0) tampoco es
  físicamente neutra, por el mismo motivo: ensancha el mismo sesgo de media
  magnitud a una o dos. #356 la presenta como «el mismo efecto atenuado, sin
  tocar el flujo de adquisición», y sí toca la física del velo.
- Hay una tercera vía que la historia no contempla y que sí colapsa la dimensión
  `mag` sin romper nada: ver M2.

---

## 6 · #357 CA4: «re-consultar solo la pieza que falte»

**INCORRECTA como criterio de aceptación; realizable solo con un rediseño de la
clave que la historia no describe.**

El encadenamiento está en `gaia_fetch()`:

- `$corte = gaia_corte($json)` — `gaia_proxy.php:304`, donde `$json` **es** la
  respuesta segura recién traída (`gaia_proxy.php:296`).
- `gaia_fondo_urls(..., $corte)` — `gaia_proxy.php:308`.
- `gaia_espacial_urls(..., $corte, GAIA_ESPACIAL_N)` — `gaia_proxy.php:313`.

Fondo y espacial **no** son independientes de la segura: su banda inferior es un
valor derivado de ella. Consecuencias para el alcance de #357:

- La clave propuesta `fondo_{ra,dec,rad,mag,corte}` es **circular**: para
  construirla hace falta el `corte`, y para tener el `corte` hace falta la
  entrada de segura. Si la pieza evictada es la segura, no se puede ni mirar si
  el fondo está en disco.
- Si la segura está en disco, el `corte` se recupera gratis llamando a
  `gaia_corte()` sobre el cuerpo cacheado (función pura, sin red). En ese caso
  sí se puede re-consultar solo el fondo o solo el espacial, y el CA4 se cumple.
- Si la segura falta, hay que repagar los ~23 s y, además, el `corte` resultante
  puede no coincidir con el anterior (desempates en `Gmag == c`, o failover a
  GAVO en `gaia_proxy.php:130-133`), invalidando las entradas de fondo y
  espacial que sí estaban en disco.

**Redacción correcta del CA4:** «si falta el fondo o el espacial y la segura
está en caché, se re-consulta solo esa pieza; si falta la segura, se re-consulta
la segura y se revalidan las otras dos contra el `corte` recalculado».

---

## 7 · «El cliente ya precalienta; el servidor no»

**CORRECTA.**

- `precalentar(o)` — `resources/js/bitacora-gaia-render.js:1277-1283`, expuesta
  en `:2932`, documentada en `:39`.
- Test: `scripts/test_precalentado_gaia.js` (cabecera en `:1-19`), que prueba
  `precalentarGaia`/`arcminVista` de
  `simulador_ocular/resources/js/bitacora-ocular.js` contra la caché en memoria
  de `consultar()`.
- Servidor: no existe. Un `grep -rn "precalent\|warm"` sobre `*.php`, `*.sh` y
  `*.py` del repositorio no devuelve nada. No hay cron, ni script, ni endpoint.

---

## 8 · «Hoy no hay ninguna medición en el proxy»

**CORRECTA.**

- `gaia_servir()` emite `Content-Type`, `Access-Control-Allow-Origin`
  (`gaia_proxy.php:271-274`), `Vary`, `Cache-Control` y `ETag`
  (`gaia_proxy.php:359-362`). Ninguna cabecera de diagnóstico.
- No hay ningún `X-Cache`, ni `hits.log`, ni `stats=1` en todo el árbol
  (`grep -rn` sobre `*.php` y `*.js`: cero resultados).
- El único rastro temporal que existe es el `mtime` del sello `.cleanup`
  (`bitacora-cache-lru.php:64-69`), que dice cuándo se **intentó** la última
  limpieza, no si evictó nada.

Añadido pertinente para #355: `cache_lru_limpieza()` solo se invoca **dentro de
la rama de fallo y con el lock adquirido** (`gaia_proxy.php:479-484`). Un
régimen de aciertos puros no dispara la limpieza nunca. Es correcto (sin fallos
la caché no crece), pero hay que tenerlo presente al leer el log de #354: la
frecuencia de evicción está acoplada a la tasa de fallos, no al tiempo.

---

## 9 · Procedencia de los costes citados

**MATIZADA: dos cifras están respaldadas, dos son bordes optimistas de rangos
publicados y una contradice al ADR que la propia épica cita.**

| cifra de la épica | ¿respaldada? | fuente primaria |
|---|---|---|
| sonda ~2 s | **sí**, borde optimista | `gaia_proxy.php:52-54` («~199 000 filas … ~2 s», medida 2026-08); ADR 0014:26-27 dice «**~2-4 s**» |
| segura ~23 s | **sí**, borde optimista | `gaia_proxy.php:39-46` y `resources/js/bitacora-gaia-render.js:79`; ADR 0014:81-83 dice «**~23-37 s**» |
| fondo ~39 s en M7 | **sí** | ADR 0014:54 («medido en M7: 39 s»), repetido en `gaia_proxy.php:300-303` |
| espacial ~39 s | **NO** | ADR 0029:26-27 mide el agregado espacial en **~18 s y 5 KB, 80 celdas**, y lo repite en `:77`. La épica lo iguala al fondo sin fuente |
| sonda ~14 MB | parcial | solo como comentario en `gaia_proxy.php:294`, sin informe detrás; y es el cuerpo en claro, no el fichero gzip |
| «~100 s de TAP» por campo denso | derivada | 2+23+39+39; con las cifras de los ADR el rango real es 2-4 + 23-37 + 39 + ~18 ≈ **82-98 s**. El techo por petición individual es `GAIA_REQUEST_TIMEOUT = 55` (`gaia_proxy.php:47`) y el del proceso `55*4+60 = 280 s` (`gaia_proxy.php:401`) |

No existe ningún harness que mida el coste del proxy de punta a punta. Los
harness de Gaia que hay (`scripts/harness_adquisicion_gaia.js`,
`scripts/harness_velo_espacial.js`, `scripts/harness_gaia_e{1,2_e3,4}*.js`)
miden el TAP y la física del velo, no la caché. Eso refuerza la puerta de
entrada que plantea la épica, pero también significa que su tabla es una mezcla
de tres fuentes de distinta antigüedad, no una medición única.

**Recomendación:** citar los rangos de los ADR (2-4 s, 23-37 s) en vez de sus
extremos, y corregir el espacial a ~18 s. Con ~18 s en lugar de ~39 s el coste
denso baja ~20 % y el argumento de #357 se debilita en esa misma proporción.

---

# Puntos de mejora, priorizados

## M1 — (bloqueante de #356) El alcance de #356 rompe la física del velo

Razonado en 5c. Tal como está escrito, #356 serviría a cualquier magnitud un
`fondo`/`fondo.espacial` calculado sobre la banda `(corte, 20]`, con lo que
`veloSB` y por tanto `mlim` cambian. El CA2 («el render no cambia») y el alcance
son incompatibles. **Acción:** reescribir el alcance limitando el colapso de
`mag` a la lista de estrellas, o adoptar M2.

## M2 — (habilita #356) Colapsar `mag` de verdad: binning de magnitud en el agregado

La vía que ni la épica ni #356 contemplan. Pedir el fondo y el espacial una sola
vez a `GAIA_MAX_MAG` pero **agrupados también por bucket de magnitud**,
añadiendo `FLOOR(Gmag*2)` al `SELECT`/`GROUP BY` de `gaia_fondo_consultas()`
(`gaia_proxy.php:141-149`) y de `gaia_espacial_consultas()`
(`gaia_proxy.php:209-221`). Con los momentos por bucket, el servidor reconstruye
la banda `(corte, mag]` de **cualquier** `mag` pedido sumando buckets, sin
volver al TAP: los momentos son aditivos por construcción. Coste: el agregado
escalar pasa de 1 fila a ~10, y el espacial de ~80 celdas a ~800 filas (unos
50 kB antes de gzip). Sigue sin ordenar y sigue siendo una sola consulta. El
listón L1 de ADR 0029 (Σceldas == `fondo.flujo`) sobrevive sin cambios sumando
también sobre buckets. Es el único diseño verificado que cumple a la vez el CA1
y el CA2 de #356.

## M3 — (bloqueante de #354) El `.hits.log` quedaría expuesto en la web

`GAIA_CACHE_DIR` es `__DIR__ . '/cache_gaia'` (`gaia_proxy.php:35`) y el proxy
se despliega en `/wp-content/uploads/bitacora/` (`bitacora-cache-lru.php:18`,
`resources/js/bitacora-gaia-render.js:83`). Un `.hits.log` ahí sería descargable
por URL por cualquiera y expondría el patrón completo de uso del simulador
(coordenadas y horas). #354 no lo menciona. **Acción:** añadir al alcance de
#354 o bien escribir el log fuera del `DocumentRoot`, o bien un `.htaccess` en
`cache_gaia/` que deniegue todo lo que no sea `*.json.gz`. La parte de «ni en
git» del punto 4 ya está resuelta (`.gitignore:25`).

## M4 — (bloqueante de #355) La hipótesis de #355 mezcla bytes en claro con bytes en disco

#355 arranca de «la sonda, ~14 MB por campo denso». Dos errores encadenados:
(a) en campo denso la sonda **no se cachea** (§2), así que esos 14 MB nunca
tocan el disco; (b) lo que sí se cachea va gzipeado a nivel 6
(`gaia_proxy.php:466`), y un JSON de columnas numéricas comprime bien.
**Acción:** el punto 3 del alcance de #355 («distribución de bytes por entrada»)
debe medir `filesize()` del `.json.gz`, no el tamaño del cuerpo, y el punto 1
debe definir «presión» contra `GAIA_CACHE_MAX_BYTES` medido igual.

## M5 — (bloqueante de #357) La clave de fondo propuesta es circular

Razonado en §6. Además, `cache_lru_limpieza()` recibe un solo `patron`
(`bitacora-cache-lru.php:74`): separar presupuestos exige que los prefijos sean
disjuntos y **dos** invocaciones con patrones que no se solapen; el actual
`*.json.gz` capturaría también las entradas de sonda. Se resuelve con prefijos,
pero el CA3 de #357 no lo dice. **Acción:** reescribir el CA4 como se propone en
§6 y añadir al CA3 que la llamada pasa a ser doble con patrones disjuntos.

## M6 — El `ETag` no distingue contenidos y bloquea cualquier cambio de formato

`gaia_servir()` fija `$etag = '"' . $clave . '"'` (`gaia_proxy.php:351-357`),
con `Cache-Control: public, max-age=86400` (`gaia_proxy.php:361`,
`GAIA_CLIENT_MAXAGE` en `:64`). La clave depende **solo** de
`(ra, dec, rad, mag)` cuantizados. Si #356 o #357 cambian el cuerpo servido para
los mismos parámetros —por filtrado de magnitud, por el orden de las claves del
merge en lectura, por el binning de M2—, los navegadores con la entrada aún viva
recibirán un **304 con el contenido antiguo** hasta 24 h. Esto choca de frente
con el «el contrato con el navegador no cambia» de #359 y con el «byte a byte
idéntica» del CA2 de #357: la identidad byte a byte deja de ser un lujo y pasa a
ser **obligatoria**, o hay que meter una versión de formato en la clave.
**Acción:** añadir a #356 y #357 un criterio de aceptación explícito sobre el
`ETag`.

## M7 — #354 necesita dos detalles de implementación que hoy no están en el issue

1. La rama de `?stats=1` tiene que ir **antes** de la validación de parámetros
   de `gaia_proxy.php:413-433`: tal como está, una petición sin `ra/dec/rad`
   responde 400 antes de llegar a cualquier código nuevo. El CA5 es
   irrealizable si el orden no se fija.
2. Las tres salidas de acierto llaman a `gaia_servir()`, que hace `exit`
   (`gaia_proxy.php:366` para el 304 y `:387` para el cuerpo). La línea del log
   hay que escribirla antes de esos `exit` o desde un
   `register_shutdown_function()`. El CA6 («la medición nunca puede romper el
   servicio») empuja hacia lo segundo, con todo el bloque envuelto en `@`.

## M8 — #358 CA5 no es verificable con el diseño actual

«El precalentado no puede provocar por sí solo una evicción masiva»: la limpieza
es incremental y acotada a `GAIA_CLEANUP_MAX_DEL = 300` entradas por pasada y
una pasada cada `GAIA_CLEANUP_EVERY = 300` s (`gaia_proxy.php:62-63`), y evicta
por `mtime` (`bitacora-cache-lru.php:33`). Un precalentado por cron escribe
entradas nuevas, cuyo `mtime` es el más reciente: por construcción no puede
desalojar nada pedido después de ellas, pero sí desaloja lo pedido **antes**,
que es justo lo que el observador tenía caliente. **Acción:** o el CA5 se
convierte en una medida («tras el precalentado, el número de entradas evictadas
no supera N»), que depende de #354, o se declara dependencia dura de #358
respecto de #354.

## M9 — Erratas de ruta en la épica y en #358

`simulador_ocular/bitacora-gaia-render.js` **no existe**. El módulo vive en
`resources/js/bitacora-gaia-render.js` (compartido por el simulador y por el
formulario de registro). La ruta aparece mal en el cuerpo de #359 (secciones «Lo
que esta épica NO hace» y «Referencias») y en el contexto de #358. Además, el
precalentado que `scripts/test_precalentado_gaia.js` prueba vive en
`simulador_ocular/resources/js/bitacora-ocular.js`, no en el módulo de render:
`precalentar()` es la pieza del módulo, `precalentarGaia()` la del simulador.

## M10 — Nada de esto contradice un ADR, pero sí lo roza

Ningún punto de la épica contradice un ADR aceptado. Lo más cerca que se queda:

- #356 roza el ADR 0014 puntos 3-4: el `mag` del cliente es el **límite físico**
  de adquisición, no un parámetro de caché, y las tres poblaciones se separan
  precisamente por él. Colapsar `mag` en la capa cara sin M2 invierte esa
  decisión de hecho, aunque no la revoque por escrito.
- #357 no toca ADR 0029 ni su listón L1, pero el CA2 («byte a byte idéntica»)
  obliga a que el merge en lectura reproduzca exactamente el orden de claves de
  `gaia_mezclar_fondo()` (`gaia_proxy.php:189-193`) y `gaia_mezclar_espacial()`
  (`gaia_proxy.php:249-254`), incluido el `json_encode` sin flags. Merece una
  línea en el issue.

## M11 — Lo que ya está resuelto y no hace falta hacer

- «`.hits.log` fuera del barrido de LRU»: verificado, se cumple hoy sin tocar
  nada (§3).
- «`.hits.log` fuera de git»: cubierto por `.gitignore:25`.
- «Bloqueo contra estampida y escritura atómica» (CA6 de #357): ya existe
  —`flock` en `gaia_proxy.php:446-453`, tmp+`rename` en `:466-472`,
  `ignore_user_abort` en `:407`— y es lo que hay que **conservar**, no
  construir.
- «El proxy ya cachea cualquier petición que le llegue» (premisa de #358):
  correcto, `gaia_proxy.php:440-472` no distingue el origen de la petición.

---

## Resumen de veredictos

| # | afirmación | veredicto |
|---|---|---|
| 1 | respuesta mergeada, `.json.gz` por clave, inmutable | CORRECTA |
| 2 | disperso = sonda; denso = segura+fondo+espacial, sonda con `unset` | CORRECTA |
| 3 | 500 MB / 0,90 / `.hits.log` a salvo del barrido | CORRECTA |
| 4 | las siete constantes | CORRECTA |
| 5 | la segura a mag 20 contiene la de mag menor | MATIZADA: cierta para la lista de estrellas (siempre, incluido el caso denso); **falsa** para `fondo` y `fondo.espacial` |
| 5d | «el cliente ya recorta» | INCORRECTA |
| 6 | «re-consultar solo la pieza que falte» | INCORRECTA tal como está redactada |
| 7 | el cliente precalienta, el servidor no | CORRECTA |
| 8 | no hay medición alguna en el proxy | CORRECTA |
| 9 | los costes citados | MATIZADA: espacial ~18 s, no ~39 s; sonda y segura son los bordes optimistas de rangos publicados |
