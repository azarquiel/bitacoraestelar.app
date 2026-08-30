<?php
declare(strict_types=1);
/* Test de QUIÉN MIRA EL MAPA: con sesión iniciada, el mapa arranca filtrado por
   las observaciones del propio usuario; sin sesión, con "Todas".

   El mapa de producción se sirve como fichero estático (/mapa.html): no pasa por
   wp_head, así que la inyección de BITACORA_WP nunca llega y el selector se
   quedaba siempre en "Todas". Quien lleva ahora la clave es datos.js, que sí
   carga con la cookie de sesión.

   Se cubren las dos mitades del camino:
   1. bitacora_observador_clave_de_usuario(): las tres vías de averiguar la clave
      (vínculo directo, sus observaciones, su nombre) y el caso sin sesión.
   2. El cableado: que datos.js emita OBSERVADOR_ACTIVO validando la cookie a
      mano (sin nonce, WordPress atiende el REST como anónimo) y que el mapa lo
      use de respaldo cuando no hay BITACORA_WP.

   No hay WordPress: se le pone a la función un $wpdb de mentira.

   Sin framework:  php scripts/test_observador_activo.php  */

// ── Postizos de WordPress y del plugin ───────────────────────────────────────
function bitacora_nombre_tabla_observadores() { return 'wp_bitacora_observadores'; }
function bitacora_nombre_tabla() { return 'wp_bitacora'; }
function sanitize_title( $s ) {
    $s = mb_strtolower( trim( (string) $s ), 'UTF-8' );
    $s = strtr( $s, array( 'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n' ) );
    $s = preg_replace( '/[^a-z0-9]+/', '-', $s );
    return trim( (string) $s, '-' );
}
$GLOBALS['usuarios'] = array();
function get_userdata( $id ) {
    return isset( $GLOBALS['usuarios'][ $id ] ) ? $GLOBALS['usuarios'][ $id ] : false;
}
class UsuarioFalso {
    public $first_name = '';
    public $last_name = '';
    public $display_name = '';
    public function __construct( $n, $a, $d ) {
        $this->first_name = $n; $this->last_name = $a; $this->display_name = $d;
    }
}

/** $wpdb mínimo: cada consulta de las tres vías responde lo que se le ponga en
 *  $vinculo (clave por usuario_id), $por_observacion y $claves (las que existen). */
class WpdbFalso {
    public $vinculo = null;
    public $por_observacion = null;
    public $claves = array();
    public $consultas = array();
    public function prepare( $sql, ...$args ) {
        // Sustitución posicional bastante para el test: %d y %s por su valor.
        foreach ( $args as $a ) {
            $sql = preg_replace( '/%[ds]/', is_int( $a ) ? (string) $a : "'" . $a . "'", $sql, 1 );
        }
        return $sql;
    }
    public function get_var( $sql ) {
        $this->consultas[] = $sql;
        if ( false !== strpos( $sql, 'INNER JOIN' ) ) {
            return $this->por_observacion;
        }
        if ( false !== strpos( $sql, 'WHERE usuario_id' ) ) {
            return $this->vinculo;
        }
        // Vía 3: WHERE clave = '...'
        if ( preg_match( "/WHERE clave = '([^']*)'/", $sql, $m ) ) {
            return in_array( $m[1], $this->claves, true ) ? $m[1] : null;
        }
        return null;
    }
}
$wpdb = new WpdbFalso();

// La función REAL se saca del plugin (cargarlo entero engancharía WordPress).
// Si alguien la renombra o cambia su forma, este test se entera en vez de probar
// una copia vieja.
$plugin = __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';
$fuente = (string) file_get_contents( $plugin );
$desde  = strpos( $fuente, 'function bitacora_observador_clave_de_usuario(' );
if ( false === $desde ) {
    echo "FALLA no se encuentra bitacora_observador_clave_de_usuario() en el plugin\n";
    exit( 1 );
}
$hasta = strpos( $fuente, "\n}\n", $desde );
eval( substr( $fuente, $desde, $hasta - $desde + 3 ) );

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }

echo "clave del observador de un usuario:\n";

$wpdb = new WpdbFalso();
$wpdb->vinculo = 'israel-perez-de-tudela-vazquez';
eq( bitacora_observador_clave_de_usuario( 3 ), 'israel-perez-de-tudela-vazquez',
    'vía 1: el observador vinculado por usuario_id' );

$wpdb = new WpdbFalso();
$wpdb->por_observacion = 'juan-antonio-paez';
eq( bitacora_observador_clave_de_usuario( 3 ), 'juan-antonio-paez',
    'vía 2: sin vínculo, la clave sale de sus propias observaciones' );

$wpdb = new WpdbFalso();
$wpdb->claves = array( 'angel-l-huelmo' );
$GLOBALS['usuarios'][7] = new UsuarioFalso( 'Ángel L.', 'Huelmo', 'angel' );
eq( bitacora_observador_clave_de_usuario( 7 ), 'angel-l-huelmo',
    'vía 3: sin vínculo ni observaciones, por su nombre y apellidos' );

$wpdb = new WpdbFalso();
$wpdb->claves = array( 'rafael-castillo-garcia' );
eq( bitacora_observador_clave_de_usuario( 9, 'Rafael Castillo García' ), 'rafael-castillo-garcia',
    'vía 3: el nombre se puede pasar ya calculado (lo hace wp_head)' );

$wpdb = new WpdbFalso();
$GLOBALS['usuarios'][5] = new UsuarioFalso( 'Recién', 'Llegada', 'recien' );
eq( bitacora_observador_clave_de_usuario( 5 ), '',
    'usuario sin observaciones: cadena vacía, el mapa arranca con "Todas"' );

$wpdb = new WpdbFalso();
$wpdb->vinculo = 'israel-perez-de-tudela-vazquez';
eq( bitacora_observador_clave_de_usuario( 0 ), '',
    'sin sesión: cadena vacía y ni se consulta la base' );
eq( count( $wpdb->consultas ), 0, 'sin sesión: ninguna consulta' );

echo "\ncableado (datos.js emite la clave, el mapa la usa):\n";

$datos_js = substr( $fuente, strpos( $fuente, 'function bitacora_datos_js(' ) );
$datos_js = substr( $datos_js, 0, strpos( $datos_js, "\n}\n" ) );
ok( false !== strpos( $datos_js, 'var OBSERVADOR_ACTIVO = ' ),
    'datos.js emite OBSERVADOR_ACTIVO' );
ok( false !== strpos( $datos_js, 'bitacora_observador_clave_de_usuario(' ),
    'datos.js usa la misma regla que wp_head, no una copia' );
ok( false !== strpos( $datos_js, "wp_validate_auth_cookie( '', 'logged_in' )" ),
    'datos.js valida la cookie a mano: un <script src> no puede mandar el nonce' );

$inyecta = substr( $fuente, strpos( $fuente, 'function bitacora_inyectar_datos(' ) );
$inyecta = substr( $inyecta, 0, strpos( $inyecta, "\n}\n" ) );
ok( false !== strpos( $inyecta, 'bitacora_observador_clave_de_usuario(' ),
    'wp_head usa la función compartida (una sola regla en todo el plugin)' );

$app = (string) file_get_contents( __DIR__ . '/../mapa/js/via-lactea-app.js' );
ok( false !== strpos( $app, 'window.OBSERVADOR_ACTIVO' ),
    'el mapa usa OBSERVADOR_ACTIVO cuando no hay BITACORA_WP (caso /mapa.html)' );
$bloque = substr( $app, strpos( $app, 'var claveInicial' ) );
$bloque = substr( $bloque, 0, 400 );
ok( false !== strpos( $bloque, 'BITACORA_WP.observadorClave' ) &&
    false !== strpos( $bloque, 'window.OBSERVADOR_ACTIVO' ),
    'claveInicial acepta los dos caminos, con BITACORA_WP por delante' );

$html = (string) file_get_contents( __DIR__ . '/../mapa/mapa.html' );
ok( false !== strpos( $html, '/wp-json/bitacora/v1/datos.js' ),
    'mapa.html carga datos.js (es quien trae la clave)' );

if ( $fallos ) { echo "\n$fallos fallo(s).\n"; exit( 1 ); }
echo "\nTodo verde.\n";
