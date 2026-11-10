<?php
declare(strict_types=1);
/* Test de que una edición NO responde «ok» cuando la base de datos la rechaza.

   Editar una pieza de equipo, una base, con quién se comparte, un viaje o su
   tripulación devolvían 200 sin mirar el resultado de la escritura: el usuario
   creía haber guardado y el cambio no existía. Y la tripulación se borraba
   antes de volver a ponerla, así que un fallo a mitad la perdía.

   $wpdb de mentira con un interruptor: con `falla` puesto, la escritura que se
   indique devuelve false, como hace $wpdb cuando MySQL la rechaza.

   Sin framework:  php scripts/test_escrituras_comprobadas.php  */

class WP_Error {
    public $code; public $data;
    public function __construct( $c = '', $m = '', $d = array() ) { $this->code = $c; $this->data = $d; }
}
class WP_REST_Response {
    public $data; public $status;
    public function __construct( $d, $s = 200 ) { $this->data = $d; $this->status = $s; }
}
class WP_REST_Request implements ArrayAccess {
    private $p; private $json;
    public function __construct( array $p, array $json ) { $this->p = $p; $this->json = $json; }
    public function get_json_params() { return $this->json; }
    public function offsetExists( $k ): bool { return isset( $this->p[ $k ] ); }
    #[\ReturnTypeWillChange]
    public function offsetGet( $k ) { return $this->p[ $k ] ?? null; }
    public function offsetSet( $k, $v ): void {}
    public function offsetUnset( $k ): void {}
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function get_current_user_id() { return 3; }
function current_time( $t, $gmt = false ) { return '2026-11-09 00:00:00'; }
function sanitize_text_field( $s ) { return trim( (string) $s ); }
function wp_kses_post( $s ) { return (string) $s; }
foreach ( array( '' => 'obs', '_viajes' => 'via', '_viaje_tripulacion' => 'tri', '_observadores' => 'obr', '_bases' => 'bas',
                 '_base_compartida' => 'bco', '_telescopios' => 'tel', '_oculares' => 'ocu', '_auxiliares' => 'aux' ) as $sufijo => $t ) {
    eval( "function bitacora_nombre_tabla$sufijo() { return '$t'; }" );
}
// Lo que rodea a las funciones probadas y no es lo que se prueba.
function bitacora_viaje_adornar( $v ) { return $v; }
function bitacora_base_legible( $id, $uid ) { return true; }
function bitacora_base_guardar_compartidos( $id, $vis, $params ) { $GLOBALS['wpdb']->pasos[] = 'compartidos'; }

/** Todo lo que se lee es del usuario 3. `falla` = 'update:via', 'insert:tri'… */
class WpdbInterruptor {
    public $falla = '';
    public $pasos = array();
    public $insert_id = 0;
    public function prepare( $sql, ...$args ) { return $sql; }
    public function get_row( $sql, $modo = null ) {
        return (object) array( 'id' => 9, 'usuario_id' => 3, 'base_id' => 1, 'noche' => '2026-08-01', 'visibilidad' => 'privada' );
    }
    public function get_var( $sql ) { return ( false !== strpos( $sql, 'FROM obr' ) ) ? 1 : null; }
    public function query( $sql ) { $this->pasos[] = $sql; return 1; }
    private function escribe( $que, $tabla ) {
        $this->pasos[] = "$que:$tabla";
        return ( $this->falla === "$que:$tabla" ) ? false : 1;
    }
    public function update( $tabla, $datos, $donde, $f = null, $fd = null ) { return $this->escribe( 'update', $tabla ); }
    public function insert( $tabla, $datos, $f = null ) { return $this->escribe( 'insert', $tabla ); }
    public function delete( $tabla, $donde, $f = null ) { return $this->escribe( 'delete', $tabla ); }
}

$fuente = (string) file_get_contents( dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-registro.php' );
foreach ( array( 'bitacora_en_transaccion', 'bitacora_viaje_obtener', 'bitacora_viaje_puede_modificar', 'bitacora_viaje_editar',
                 'bitacora_viaje_tripulacion_guardar', 'bitacora_equipo_tabla', 'bitacora_equipo_esquema', 'bitacora_equipo_pieza_propia',
                 'bitacora_equipo_editar', 'bitacora_base_propia', 'bitacora_validar_base', 'bitacora_base_editar', 'bitacora_base_compartir' ) as $fn ) {
    if ( ! preg_match( '/^function ' . $fn . '\(.*?^\}/ms', $fuente, $m ) ) {
        fwrite( STDERR, "No encuentro $fn() en el plugin\n" );
        exit( 1 );
    }
    eval( $m[0] );
}

$fallos = 0;
function ok( $cond, string $et ): void {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}
/** Llama a $fn con el interruptor en $falla; devuelve la respuesta. */
function probar( string $fn, array $ruta, array $json, string $falla = '' ) {
    global $wpdb;
    $wpdb = new WpdbInterruptor();
    $wpdb->falla = $falla;
    return $fn( new WP_REST_Request( $ruta, $json ) );
}
function es500( $r ): bool { return $r instanceof WP_Error && 500 === ( $r->data['status'] ?? 0 ); }
function es200( $r ): bool { return $r instanceof WP_REST_Response && 200 === $r->status; }

$casos = array(
    'pieza de equipo'  => array( 'bitacora_equipo_editar', array( 'tipo' => 'telescopio', 'id' => 9 ), array( 'nombre' => 'El Faro' ), 'update:tel' ),
    'base'             => array( 'bitacora_base_editar', array( 'id' => 9 ), array( 'nombre' => 'Casa', 'lat' => 40, 'lon' => -3 ), 'update:bas' ),
    'compartir base'   => array( 'bitacora_base_compartir', array( 'id' => 9 ), array( 'visibilidad' => 'publica' ), 'update:bas' ),
    'viaje'            => array( 'bitacora_viaje_editar', array( 'id' => 9 ), array( 'nombre' => 'Noche larga' ), 'update:via' ),
    'tripulación'      => array( 'bitacora_viaje_tripulacion_guardar', array( 'id' => 9 ), array( 'observadores' => array( 5, 6 ) ), 'insert:tri' ),
);
foreach ( $casos as $que => $c ) {
    ok( es200( probar( $c[0], $c[1], $c[2] ) ), "$que: si la escritura va bien, 200" );
    ok( es500( probar( $c[0], $c[1], $c[2], $c[3] ) ), "$que: si la base de datos la rechaza, 500 y no «ok»" );
}

echo "lo que tiene que ir junto, va junto:\n";
probar( 'bitacora_base_editar', array( 'id' => 9 ), array( 'nombre' => 'Casa', 'lat' => 40, 'lon' => -3 ), 'update:bas' );
ok( ! in_array( 'compartidos', $wpdb->pasos, true ), 'base rechazada: no se toca con quién se comparte' );

probar( 'bitacora_viaje_tripulacion_guardar', array( 'id' => 9 ), array( 'observadores' => array( 5, 6 ) ), 'insert:tri' );
ok( array( 'START TRANSACTION', 'delete:tri', 'insert:tri', 'ROLLBACK' ) === $wpdb->pasos, 'tripulación: si un alta falla, el borrado previo se deshace' );
probar( 'bitacora_viaje_tripulacion_guardar', array( 'id' => 9 ), array( 'observadores' => array( 5, 6 ) ) );
ok( 'COMMIT' === end( $wpdb->pasos ), 'y si todo va bien, se confirma' );

// Mudar el viaje de lugar mueve también sus observaciones: las dos o ninguna.
$r = probar( 'bitacora_viaje_editar', array( 'id' => 9 ), array( 'baseId' => 2 ), 'update:obs' );
ok( es500( $r ) && 'ROLLBACK' === end( $wpdb->pasos ) && in_array( 'update:via', $wpdb->pasos, true ),
    'viaje mudado: si no se pueden mudar sus observaciones, el viaje tampoco se muda' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
