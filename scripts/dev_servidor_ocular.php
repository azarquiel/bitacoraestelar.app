<?php
/* Servidor de desarrollo del simulador de oculares, sin WordPress.
   Mapea /wp-content/uploads/bitacora/* a los ficheros del repo (que el deploy
   copia a uploads) y ejecuta los proxys PHP desde simulador_ocular/, así que
   sus cachés (cache-ps1/, cache_gaia/) caen allí, como en producción.

   Uso:   php -S localhost:8080 scripts/dev_servidor_ocular.php
   Abrir: http://localhost:8080/            (ocular-wordpress.html)          */

$raiz = dirname(__DIR__);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($uri === '/' || $uri === '/ocular') {
    header('Content-Type: text/html; charset=utf-8');
    readfile($raiz . '/simulador_ocular/ocular-wordpress.html');
    return true;
}

if (preg_match('#^/wp-content/uploads/bitacora/([A-Za-z0-9._-]+)$#', $uri, $m)) {
    $nombre = $m[1];
    $candidatos = array(
        '/resources/js/', '/resources/css/',
        '/simulador_ocular/resources/js/', '/simulador_ocular/resources/css/',
        '/simulador_ocular/',
    );
    foreach ($candidatos as $dir) {
        $ruta = $raiz . $dir . $nombre;
        if (!is_file($ruta)) continue;
        if (substr($nombre, -4) === '.php') {
            chdir(dirname($ruta));
            require $ruta;
            return true;
        }
        $tipos = array('js' => 'application/javascript', 'css' => 'text/css');
        $ext = pathinfo($nombre, PATHINFO_EXTENSION);
        header('Content-Type: ' . (isset($tipos[$ext]) ? $tipos[$ext] : 'application/octet-stream'));
        readfile($ruta);
        return true;
    }
}

return false;   // el resto lo sirve el propio servidor embebido
