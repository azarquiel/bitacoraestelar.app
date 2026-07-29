<?php
declare(strict_types=1);

/* ════════════════════════════════════════════════════════════════════════════
   CACHÉ LRU EN DISCO — política compartida por los proxies del simulador
   ────────────────────────────────────────────────────────────────────────────
   Los dos proxies (gaia_proxy.php y dss-proxy.php) cachean en disco respuestas
   INMUTABLES —un catálogo fijo y un archivo de placas fijo—, así que no caducan:
   lo único que acota el disco es la expulsión por tamaño. Esa política estaba
   escrita dos veces, idéntica salvo el prefijo del nombre y el patrón de
   fichero; un arreglo en la expulsión había que aplicarlo en dos sitios.

   Lo que NO vive aquí: la clave de caché, la ruta y el servido. Cada proxy
   sirve algo distinto (JSON con negociación gzip / GIF) y con sus propios
   cuerpos de error, y meter eso aquí pediría más perillas de las que ahorra.

   Test: scripts/test_cache_lru.php (sobre un directorio temporal de verdad).
   Se sube por FTP a /wp-content/uploads/bitacora/, junto a los dos proxies.
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
