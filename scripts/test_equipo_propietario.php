<?php
declare(strict_types=1);
/* Test de PROPIETARIO DEL EQUIPO al guardar / editar una observación (#493).

   1. Pieza del catálogo (usuario_id NULL) o propia: se acepta.
   2. Pieza personal de otro usuario: 403 que nombra la pieza, y no se escribe nada.
   3. Id que no existe: 400 claro, no 500.
   4. Editar sin cambiar las piezas no falla aunque ya no sean utilizables.

   No hay WordPress: el código REAL de la validación y de los manejadores se saca
   del plugin y se evalúa con un $wpdb de mentira.

   Sin framework:  php scripts/test_equipo_propietario.php  */

class WP_Error {
    public $codigo, $mensaje, $datos;
    public function __construct( $c = '', $m = '', $d = null ) { $this->codigo = $c; $this->mensaje = $m; $this->datos = $d; }
    public function get_error_message() { return $this->mensaje; }
    public function get_error_data() { return $this->datos; }
}
class WP_REST_Response {
    public $d, $s;
    public function __construct( $d = null, $s = 200 ) { $this->d = $d; $this->s = $s; }
}
class WP_REST_Request implements ArrayAccess {
    public $json, $url;
    public function __construct( $json, $url = array() ) { $this->json = $json; $this->url = $url; }
    public function get_json_params() { return $this->json; }
    public function offsetExists( $k ): bool { return isset( $this->url[ $k ] ); }
    public function offsetGet( $k ): mixed { return $this->url[ $k ]; }
    public function offsetSet( $k, $v ): void {}
    public function offsetUnset( $k ): void {}
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function current_time( $t, $g = false ) { return '2026-10-24 22:00:00'; }
function get_current_user_id() { return 5; }
function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_entradas() { return 'ent'; }
function bitacora_nombre_tabla_telescopios() { return 'tel'; }
function bitacora_nombre_tabla_oculares() { return 'ocu'; }
function bitacora_nombre_tabla_auxiliares() { return 'aux'; }

// Postizos de lo que NO se prueba aquí.
function bitacora_validar_datos( $p ) { return array( 'objeto' => 'M13', 'base_id' => 0, 'telescopio_id' => $p['telescopioId'] ?? null ); }
function bitacora_unificar_estrella( $d ) { return $d; }
function bitacora_validar_entradas( $l ) {
    return array_map( fn( $e ) => array( 'ocular_id' => $e['ocularId'] ?? null, 'auxiliar_id' => $e['auxiliarId'] ?? null, 'auxiliar2_id' => $e['auxiliar2Id'] ?? null ), $l );
}
function bitacora_clave_idem( $p ) { return ''; }
function bitacora_obtener( $id ) { return $GLOBALS['wpdb']->obs[ $id ] ?? null; }
function bitacora_puede_modificar( $o ) { return true; }
function bitacora_obtener_entradas( $id ) { return $GLOBALS['wpdb']->ent; }
function bitacora_error_paso( $p ) { return new WP_Error( 'error_bd', $p, array( 'status' => 500 ) ); }
function bitacora_en_transaccion( $c ) { $GLOBALS['escrituras']++; return $c(); }
function bitacora_escribir_dependientes( $id, $d, $u, $p, $e ) { return true; }
function bitacora_escribir_accesorios( $id, $d, $p ) { return array( 'aviso' => '', 'aviso_ficha' => '' ); }

class WpdbFalso {
    public $piezas = array(), $obs = array(), $ent = array();
    public $insert_id = 1;
    public function prepare( $sql, ...$a ) { return preg_replace( '/%d/', (string) $a[0], $sql, 1 ); }
    public function get_row( $sql ) {
        preg_match( '/FROM (\w+) WHERE id = (\d+)/', $sql, $m );
        $f = $this->piezas[ $m[1] ][ (int) $m[2] ] ?? null;
        return $f ? (object) $f : null;
    }
    public function insert( $t, $d ) { return 1; }
    public function update( $t, $d, $w ) { return 1; }
}

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
foreach ( array( 'bitacora_equipo_tabla', 'bitacora_validar_equipo_usable', 'bitacora_guardar_observacion', 'bitacora_editar_observacion' ) as $f ) {
    if ( ! preg_match( '/^function ' . $f . '\(.*?^\}$/ms', $fuente, $m ) ) { echo "FALLA no se encuentra $f en el plugin\n"; exit( 1 ); }
    eval( $m[0] );
}

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function mundo(): void {
    global $wpdb;
    $GLOBALS['escrituras'] = 0;
    $wpdb = new WpdbFalso();
    $wpdb->piezas = array(
        'tel' => array( 1 => array( 'usuario_id' => null, 'vendor' => 'Sky-Watcher', 'modelo' => 'Dob 8' ), 2 => array( 'usuario_id' => '5', 'vendor' => 'Mío', 'modelo' => 'C8' ), 3 => array( 'usuario_id' => '9', 'vendor' => 'Ajeno', 'modelo' => 'Dob 18' ) ),
        'ocu' => array( 1 => array( 'usuario_id' => null, 'vendor' => 'TV', 'modelo' => 'Nagler 31' ), 3 => array( 'usuario_id' => '9', 'vendor' => 'TV', 'modelo' => 'Ethos 21' ) ),
        'aux' => array( 3 => array( 'usuario_id' => '9', 'vendor' => 'TV', 'nombre' => 'Barlow 2x' ) ),
    );
}
function crear( array $p ) { return bitacora_guardar_observacion( new WP_REST_Request( $p ) ); }
function editar( array $p ) { return bitacora_editar_observacion( new WP_REST_Request( $p, array( 'id' => 10 ) ) ); }

echo "catálogo y propias se aceptan:\n";
mundo();
$r = crear( array( 'telescopioId' => 1, 'entradas' => array( array( 'ocularId' => 1 ) ) ) );
eq( $r->s, 201, 'catálogo: 201' );
$r = crear( array( 'telescopioId' => 2 ) );
eq( $r->s, 201, 'propia: 201' );

echo "pieza de otro usuario:\n";
mundo();
$r = crear( array( 'telescopioId' => 3 ) );
eq( array( $r->codigo, $r->datos['status'] ), array( 'pieza_no_usable', 403 ), 'telescopio ajeno: 403' );
eq( $r->datos['pieza'], array( 'tipo' => 'telescopio', 'id' => 3, 'nombre' => 'Ajeno Dob 18' ), 'nombra la pieza' );
eq( str_contains( $r->mensaje, 'Ajeno Dob 18' ) && str_contains( $r->mensaje, 'compartido contigo' ), true, 'el mensaje dice cuál y por qué' );
eq( $GLOBALS['escrituras'], 0, 'no escribe nada' );
eq( crear( array( 'entradas' => array( array( 'ocularId' => 3 ) ) ) )->datos['pieza']['tipo'], 'ocular', 'ocular ajeno: 403' );
eq( crear( array( 'entradas' => array( array( 'auxiliar2Id' => 3 ) ) ) )->datos['pieza']['tipo'], 'auxiliar', 'auxiliar2 ajeno: 403' );

echo "id que no existe:\n";
mundo();
$r = crear( array( 'telescopioId' => 99 ) );
eq( array( $r->codigo, $r->datos['status'] ), array( 'pieza_inexistente', 400 ), '400 de validación' );
eq( $GLOBALS['escrituras'], 0, 'no escribe nada' );

echo "editar:\n";
mundo();
$wpdb->obs[10] = (object) array( 'telescopio_id' => 3, 'usuario_id' => 5, 'borrada_en' => null );
$wpdb->ent = array( (object) array( 'ocular_id' => 3, 'auxiliar_id' => null ) );
$r = editar( array( 'telescopioId' => 3, 'entradas' => array( array( 'ocularId' => 3 ) ) ) );
eq( $r->s, 200, 'sin cambiar piezas: 200 aunque ya no sean usables' );
$r = editar( array( 'telescopioId' => 3, 'entradas' => array( array( 'ocularId' => 3, 'auxiliarId' => 3 ) ) ) );
eq( $r->codigo ?? null, 'pieza_no_usable', 'añadir una pieza ajena nueva: 403' );
$wpdb->obs[10]->telescopio_id = 1;
eq( editar( array( 'telescopioId' => 3 ) )->codigo ?? null, 'pieza_no_usable', 'cambiar a un telescopio ajeno: 403' );

echo $fallos ? "\n$fallos fallos\n" : "\ntodo ok\n";
exit( $fallos ? 1 : 0 );
