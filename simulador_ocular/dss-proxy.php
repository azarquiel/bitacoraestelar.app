<?php
/* ══════════════════════════════════════════════════════════════
   dss-proxy.php — sirve placas del DSS (ESO) desde tu dominio
   Uso:  dss-proxy.php?ra=05+35+17&dec=-05+23+28&x=84&y=84
   La primera petición descarga la placa de archive.eso.org y la
   guarda en ./cache-dss/; las siguientes se sirven del disco.
   ══════════════════════════════════════════════════════════════ */

$ra  = $_GET['ra']  ?? '';
$dec = $_GET['dec'] ?? '';
$x   = min(120, max(1, floatval($_GET['x'] ?? 30)));   // límite del DSS: 120'
$y   = min(120, max(1, floatval($_GET['y'] ?? 30)));

/* Reconocimiento solicitado, con lista blanca */
$sv = $_GET['Sky-Survey'] ?? 'DSS1';
if (!in_array($sv, ['DSS1', 'DSS2-red', 'DSS2-blue', 'DSS2-infrared'], true)) {
    $sv = 'DSS1';
}

/* Validación: solo dígitos, espacios, signos, puntos y dos puntos.
   Evita que el script se pueda usar como proxy abierto. */
if (!preg_match('/^[0-9+\-.: ]{1,24}$/', $ra) ||
    !preg_match('/^[0-9+\-.: ]{1,24}$/', $dec)) {
    http_response_code(400);
    exit('Coordenadas no válidas');
}

/* Caché en disco: una placa por combinación de coordenadas y campo */
$cacheDir = __DIR__ . '/cache-dss';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0755, true);
}
$clave   = md5($ra . '|' . $dec . '|' . $x . '|' . $y . '|' . $sv);
$fichero = $cacheDir . '/' . $clave . '.gif';

if (!file_exists($fichero)) {
    $url = 'https://archive.eso.org/dss/dss/image'
         . '?ra='  . rawurlencode($ra)
         . '&dec=' . rawurlencode($dec)
         . '&equinox=J2000&name='
         . '&x=' . $x . '&y=' . $y
         . '&Sky-Survey=' . rawurlencode($sv) . '&mime-type=download-gif';

    $datos = descargar($url);
    if ($datos === false || strlen($datos) < 200) {
        http_response_code(502);
        exit('El servidor del DSS no respondió');
    }
    file_put_contents($fichero, $datos, LOCK_EX);
}

header('Content-Type: image/gif');
header('Cache-Control: public, max-age=31536000, immutable');
header('Content-Length: ' . filesize($fichero));
readfile($fichero);
exit;

/* Descarga con cURL si está disponible; si no, file_get_contents */
function descargar($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 40,
            CURLOPT_USERAGENT      => 'simulador-ocular/1.0',
        ]);
        $datos = curl_exec($ch);
        curl_close($ch);
        return $datos;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 40]]);
    return @file_get_contents($url, false, $ctx);
}
