<?php
declare(strict_types=1);

/* ════════════════════════════════════════════════════════════════════════════
   CACHÉ LRU EN DISCO — política compartida por los proxies del simulador
   ────────────────────────────────────────────────────────────────────────────
   Los tres proxies (gaia_proxy.php, dss-proxy.php y ps1-proxy.php) cachean en
   disco respuestas INMUTABLES —un catálogo fijo, un archivo de placas fijo—, así
   que no caducan: lo único que acota el disco es la expulsión por tamaño.

   Aquí viven la política de expulsión, el FLUJO completo de una petición
   (acierto + touch, flock, segunda comprobación, fetch, 502, escritura en tmp +
   rename, limpieza, servido y camino sin bloqueo) y el log de latencia con un
   solo formato. Un arreglo en cualquiera de ellos se hace una vez.

   Lo que NO vive aquí: la clave de caché, la ruta, la petición al origen y el
   servido (cabeceras, gzip, GIF/FITS/JSON, cuerpos de error). Cada proxy los
   aporta como callbacks a cache_lru_flujo().

   Test: scripts/test_cache_lru.php (sobre un directorio temporal de verdad).
   Se sube por FTP a /wp-content/uploads/bitacora/ ANTES que los tres proxies:
   un proxy nuevo sobre este fichero viejo da un error fatal.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Selecciona qué entradas evictar (LRU) para bajar el tamaño total por debajo del
 * nivel bajo. PURA: recibe la lista [ [ruta, tamaño, mtime], ... ], no toca disco.
 * Ordena por mtime ascendente (más viejas primero) y acumula hasta bajar del
 * objetivo o alcanzar el máximo de borrados por pasada (limpieza incremental).
 * Devuelve [ 'rutas' => string[], 'liberado' => int ].
 */
function cache_lru_seleccionar_evict(array $lista, int $total, int $max_bytes, float $lowwater, int $max_del): array {
    $objetivo = (int) ($max_bytes * $lowwater);
    if ($total <= $max_bytes) {
        return ['rutas' => [], 'liberado' => 0];
    }
    usort($lista, static fn($a, $b) => $a[2] <=> $b[2]);   // más antiguas primero
    $rutas = [];
    $liberado = 0;
    foreach ($lista as [$ruta, $size, $mtime]) {
        if ($total - $liberado <= $objetivo || count($rutas) >= $max_del) {
            break;
        }
        $rutas[] = $ruta;
        $liberado += $size;
    }
    return ['rutas' => $rutas, 'liberado' => $liberado];
}

/**
 * Limpieza LRU incremental de un directorio de caché: como mucho una vez cada
 * `cada` segundos, y borrando como mucho `max_del` entradas por pasada. Barre
 * además los .lock y .tmp huérfanos que ya nadie puede estar usando.
 *
 * Opciones (todas obligatorias salvo las marcadas):
 *   dir           directorio de la caché
 *   patron        glob de las entradas ('*.gif', '*.json.gz'…)
 *   max_bytes     tope de tamaño de la caché
 *   lowwater      fracción del tope a la que se baja tras evictar (0.80, 0.90…)
 *   max_del       máximo de entradas a borrar por pasada
 *   cada          segundos mínimos entre dos limpiezas
 *   huerfano_ttl  edad mínima de un .lock/.tmp para retirarlo
 */
function cache_lru_limpieza(array $cfg): void {
    $dir = $cfg['dir'];
    // El "stamp" evita que cada petición escanee el directorio. Se actualiza ANTES
    // de escanear para que peticiones concurrentes no disparen la limpieza a la vez.
    $stamp = $dir . '/.cleanup';
    $ultima = @filemtime($stamp) ?: 0;
    if (time() - $ultima < $cfg['cada']) {
        return;
    }
    @touch($stamp);

    $ahora = time();
    $lista = [];
    $total = 0;
    foreach (glob($dir . '/' . $cfg['patron']) ?: [] as $f) {
        $mtime = @filemtime($f);
        $size = @filesize($f);
        if ($mtime === false || $size === false) {
            continue;
        }
        $lista[] = [$f, $size, $mtime];
        $total += $size;
    }

    $plan = cache_lru_seleccionar_evict($lista, $total, $cfg['max_bytes'], $cfg['lowwater'], $cfg['max_del']);
    foreach ($plan['rutas'] as $f) {
        @unlink($f);
    }

    // Barrido de .lock y .tmp huérfanos: solo los más viejos que huerfano_ttl (ningún
    // fetch activo los usa a esas alturas), así el unlink no compite con un flock en curso.
    foreach (array_merge(glob($dir . '/*.lock') ?: [], glob($dir . '/*.tmp*') ?: []) as $f) {
        if (($mt = @filemtime($f)) !== false && $ahora - $mt >= $cfg['huerfano_ttl']) {
            @unlink($f);
        }
    }
}

// ───────────────────── VALORES COMUNES A LOS TRES PROXIES ────────────────────
const CACHE_LRU_CONNECT_TIMEOUT = 8;                  // s: timeout de CONEXIÓN al origen
const CACHE_LRU_CADA            = 300;                // s: limpieza como mucho cada 5 min
const CACHE_LRU_MAX_DEL         = 300;                // nº máx. de entradas a borrar por pasada (incremental)
const CACHE_LRU_ORPHAN_TTL      = 3600;               // s: edad mínima de un .lock/.tmp huérfano para retirarlo
const CACHE_LRU_LOG_MAX_BYTES   = 5 * 1024 * 1024;    // bytes: al superarlo el log rota a .1 (un solo nivel)

// ─────────────────────────── LOG DE LATENCIA ─────────────────────────────────

/**
 * Línea del log: un JSON por petición, con salto de línea final. Pura — el
 * instante y el tiempo entran como parámetros, así el test no depende del reloj.
 * `etapa` solo tiene sentido en un fallo (en Gaia `sonda` | `densa`).
 * `traza` (#429): un intento por origen, [etapa, proveedor, http, ms]; solo
 * cuando la petición fue al origen (null en un acierto).
 */
function cache_lru_log_linea(float $t, string $clave, string $estado, ?string $etapa, int $bytes, float $ms, ?array $traza = null): string {
    return json_encode([
        't'      => round($t, 3),
        'clave'  => $clave,
        'estado' => $estado,
        'etapa'  => $etapa,
        'bytes'  => $bytes,
        'ms'     => round($ms, 1),
        'traza'  => $traza,
    ], JSON_UNESCAPED_SLASHES) . "\n";
}

/**
 * Añade una línea al log, rotando a `<log>.1` cuando el activo supera el tope (un
 * solo nivel: la rotación previa se pisa). Best-effort de arriba abajo: si el
 * disco falla (permisos, lleno), se calla. Medir nunca puede romper el servicio.
 */
function cache_lru_log_escribir(string $ruta, string $linea, int $max_bytes): void {
    /* El filesize+rename va fuera del lock: dos peticiones que crucen el tope a
       la vez rotan las dos y la segunda pisa la .1 anterior. La ventana son
       microsegundos cada 5 MB y lo que se pierde es historia ya agregada, nunca
       la petición en curso; un lock propio costaría más que el dato. */
    $tam = @filesize($ruta);
    if ($tam !== false && $tam >= $max_bytes) {
        @rename($ruta, $ruta . '.1');
    }
    @file_put_contents($ruta, $linea, FILE_APPEND | LOCK_EX);
}

/**
 * Registra la petición en curso. El reloj de partida es el del SAPI
 * (`REQUEST_TIME_FLOAT`), así que mide la petición entera sin plumbing.
 */
function cache_lru_log_registrar(string $archivo, string $clave, string $estado, ?string $etapa, int $bytes): void {
    $ahora = microtime(true);
    $ms = ($ahora - (float) ($_SERVER['REQUEST_TIME_FLOAT'] ?? $ahora)) * 1000;
    cache_lru_log_escribir($archivo, cache_lru_log_linea($ahora, $clave, $estado, $etapa, $bytes, $ms,
        $GLOBALS['cache_lru_traza'] ?? null), CACHE_LRU_LOG_MAX_BYTES);
}

/** Anota un intento contra el origen en la traza de la petición en curso (#429). */
function cache_lru_traza(string $etapa, string $proveedor, int $http, float $t0): void {
    $GLOBALS['cache_lru_traza'][] = [$etapa, $proveedor, $http, round((microtime(true) - $t0) * 1000, 1)];
}

// ─────────────────────────────── FLUJO ───────────────────────────────────────

/**
 * Flujo de una petición cacheada: acierto (+ touch) → flock → segunda comprobación
 * → fetch → 502 → escritura atómica (tmp + rename) → limpieza → servido; y, si no
 * hay flock, descarga directa sin cachear. Cada salida queda en el log.
 *
 * Cada proxy aporta lo suyo en `$cfg` y callbacks:
 *   cfg  ruta, clave, dir, patron, max_bytes, lowwater, log   (obligatorios)
 *        codificar  callable(string): string|false  — lo que se escribe en disco
 *                   (Gaia lo gzipa); el servido directo sigue recibiendo el crudo.
 *   fetch($etapa)       ?string  — pide al origen; null = falló. `$etapa` por referencia.
 *   servir($estado, $etapa)      — sirve la entrada de caché; registra su propio log
 *                                  (conoce los bytes y si fue 304) y termina.
 *   directo($datos)              — sirve los datos en memoria, sin caché.
 *   fallo()                      — responde 502 con el cuerpo del proxy.
 * `servir`, `directo` y `fallo` terminan la ejecución; el `return` tras cada uno
 * solo importa con callbacks que no terminan (los tests).
 */
function cache_lru_flujo(array $cfg, callable $fetch, callable $servir, callable $directo, callable $fallo): void {
    $ruta = $cfg['ruta'];
    $reg = static fn(string $estado, ?string $etapa, int $bytes) =>
        cache_lru_log_registrar($cfg['log'], $cfg['clave'], $estado, $etapa, $bytes);

    // ── ACIERTO de caché ── (las respuestas son inmutables; no caducan)
    if (is_file($ruta)) {
        @touch($ruta);                       // LRU: renueva su antigüedad
        $servir('hit', null);
        return;
    }

    // ── FALLO: pedir al origen bajo bloqueo (evita estampida) ──
    $lock = @fopen($ruta . '.lock', 'c');
    if ($lock && flock($lock, LOCK_EX)) {
        // Otra petición pudo llenar la caché mientras esperábamos el lock.
        if (is_file($ruta)) {
            flock($lock, LOCK_UN);
            fclose($lock);
            $servir('hit', null);
            return;
        }

        $etapa = null;
        $datos = $fetch($etapa);

        if ($datos === null) {
            flock($lock, LOCK_UN);
            fclose($lock);
            $reg('error', $etapa, 0);
            $fallo();
            return;
        }

        // Escritura ATÓMICA (temp + rename) para no dejar ficheros a medias.
        $en_disco = isset($cfg['codificar']) ? $cfg['codificar']($datos) : $datos;
        $tmp = $ruta . '.tmp' . getmypid();
        if ($en_disco !== false && file_put_contents($tmp, $en_disco) !== false) {
            @rename($tmp, $ruta);
        } else {
            @unlink($tmp);
        }
        flock($lock, LOCK_UN);
        fclose($lock);
        // El .lock NO se borra: unlink mientras otro proceso lo tiene abierto en
        // flock es una condición de carrera (operaría sobre un inodo fantasma). Es
        // vacío y hay uno por entrada; la limpieza incremental los retira si envejecen.

        cache_lru_limpieza([
            'dir' => $cfg['dir'], 'patron' => $cfg['patron'],
            'max_bytes' => $cfg['max_bytes'], 'lowwater' => $cfg['lowwater'],
            'max_del' => CACHE_LRU_MAX_DEL, 'cada' => CACHE_LRU_CADA,
            'huerfano_ttl' => CACHE_LRU_ORPHAN_TTL,
        ]);

        if (is_file($ruta)) {
            $servir('miss', $etapa);
            return;
        }
        // Si por lo que sea no se escribió la caché, servimos los datos directos.
        $reg('miss', $etapa, strlen($datos));
        $directo($datos);
        return;
    }

    // No se pudo bloquear (caso raro): servir sin cachear con una petición directa.
    if ($lock) {
        fclose($lock);
    }
    $etapa = null;
    $datos = $fetch($etapa);
    if ($datos !== null) {
        $reg('miss', $etapa, strlen($datos));
        $directo($datos);
        return;
    }
    $reg('error', $etapa, 0);
    $fallo();
}
