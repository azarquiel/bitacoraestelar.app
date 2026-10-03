<?php
declare(strict_types=1);
/* Test de los RECUENTOS que solo cuentan lo visto (#396, épica #393).

   Criterio 1: un viaje con 5 vistos y 2 fallos cuenta 5 + 2, no 7.
   Criterio 3: el guardián de borrado de bases sigue contando TODAS las filas.
   Criterio 5: la ficha .docx dice «Explorado – no confirmado · …».
   Criterio 6: con datos previos (todo 'visto') ningún total cambia.
   Las funciones REALES se sacan del plugin (cargarlo entero engancharía WordPress).

   Sin framework:  php scripts/test_recuentos_solo_vistos.php  */

class WP_Error {
    public $codigo; public $mensaje; public $datos;
    public function __construct( $codigo = '', $mensaje = '', $datos = array() ) {
        $this->codigo = $codigo; $this->mensaje = $mensaje; $this->datos = $datos;
    }
}
class WP_REST_Response {
    public $data; public $status;
    public function __construct( $data = null, $status = 200 ) { $this->data = $data; $this->status = $status; }
}
class WP_REST_Request implements ArrayAccess {
    public $p = array();
    public function offsetExists( $o ): bool { return isset( $this->p[ $o ] ); }
    public function offsetGet( $o ): mixed { return $this->p[ $o ]; }
    public function offsetSet( $o, $v ): void { $this->p[ $o ] = $v; }
    public function offsetUnset( $o ): void { unset( $this->p[ $o ] ); }
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_bases() { return 'bas'; }
function bitacora_nombre_tabla_base_compartida() { return 'comp'; }
function bitacora_base_propia( $id ) { return true; }

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
function sacar( string $fuente, string $nombre ): string {
    $desde = strpos( $fuente, "function $nombre(" );
    if ( false === $desde ) { echo "FALLA no se encuentra $nombre() en el plugin\n"; exit( 1 ); }
    return substr( $fuente, $desde, strpos( $fuente, "\n}\n", $desde ) - $desde + 3 );
}
foreach ( array( 'bitacora_viaje_num_objetos', 'bitacora_viaje_num_vistos', 'bitacora_base_borrar',
                 'bitacora_ficha_motivo_etiqueta', 'bitacora_ficha_estado_linea', 'bitacora_docx_encode',
                 'bitacora_docx_reconstruir' ) as $f ) {
    eval( sacar( $fuente, $f ) );
}

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }

/** $wpdb de mentira: la tabla de observaciones es una fixture; interpreta solo
 *  los filtros que usan los recuentos (viaje_id / base_id / resultado). */
class WpdbFixture {
    public $filas = array();
    public $borrados = array();
    public function prepare( $sql, ...$a ) { return array( $sql, $a[0] ?? null ); }
    public function get_var( $q ) {
        list( $sql, $id ) = $q;
        $col = false !== strpos( $sql, 'viaje_id' ) ? 'viaje_id' : 'base_id';
        $solo_vistas = false !== strpos( $sql, "resultado = 'visto'" );
        $n = 0;
        foreach ( $this->filas as $f ) {
            if ( $f[ $col ] === $id && null === $f['borrada_en'] && ( ! $solo_vistas || 'visto' === $f['resultado'] ) ) { $n++; }
        }
        return $n;
    }
    public function delete( $t, $w ) { $this->borrados[] = $t; return 1; }
}
function fila( int $viaje, int $base, string $res, ?string $borrada = null ): array {
    return array( 'viaje_id' => $viaje, 'base_id' => $base, 'resultado' => $res, 'borrada_en' => $borrada );
}

echo "viaje con 5 vistos y 2 fallos (criterio 1):\n";
$wpdb = new WpdbFixture();
for ( $i = 0; $i < 5; $i++ ) { $wpdb->filas[] = fila( 1, 9, 'visto' ); }
$wpdb->filas[] = fila( 1, 9, 'no_visto' );
$wpdb->filas[] = fila( 1, 9, 'detectado_no_visto' );
$wpdb->filas[] = fila( 1, 9, 'visto', '2026-10-01' );   // la papelera no cuenta
eq( bitacora_viaje_num_vistos( 1 ), 5, 'confirmados = 5' );
eq( bitacora_viaje_num_objetos( 1 ) - bitacora_viaje_num_vistos( 1 ), 2, 'no confirmados = 2' );
eq( bitacora_viaje_num_objetos( 1 ), 7, 'el total de filas (guardián) sigue siendo 7' );

echo "guardián de borrado de bases (criterio 3):\n";
$wpdb = new WpdbFixture();
$wpdb->filas[] = fila( 2, 5, 'no_visto' );
$pet = new WP_REST_Request(); $pet['id'] = 5;
$r = bitacora_base_borrar( $pet );
ok( is_wp_error( $r ) && 409 === $r->datos['status'], 'una base con solo un fallo NO se borra (409)' );
eq( $wpdb->borrados, array(), 'no se borró nada' );
$pet['id'] = 6;
$r = bitacora_base_borrar( $pet );
ok( $r instanceof WP_REST_Response, 'una base sin filas sí se borra' );

echo "el SQL de cada recuento (criterios 2 y 4):\n";
ok( preg_match( "/n_observaciones = intval\\( \\\$wpdb->get_var\\( \\\$wpdb->prepare\\(\\s*\"SELECT COUNT\\(\\*\\) FROM \\\$obs WHERE base_id = %d AND borrada_en IS NULL AND resultado = 'visto'\"/", $fuente ), 'n_observaciones de las bases solo cuenta vistas' );
ok( preg_match( "/AS num_observaciones/", $fuente ) && preg_match( "/resultado = 'visto' \\) AS num_observaciones/", $fuente ), 'num_observaciones del observador solo cuenta vistas' );
ok( preg_match( "/resultado = 'visto' \\) AS num FROM/", $fuente ), 'el panel de administración solo cuenta vistas' );
ok( ! preg_match( "/resultado[^;]*DELETE|con_observaciones[^;]*resultado/", sacar( $fuente, 'bitacora_base_borrar' ) ), 'el guardián no mira el resultado' );

echo "ficha .docx (criterio 5):\n";
$o = (object) array( 'resultado' => 'detectado_no_visto', 'motivo_no_visto' => 'luna' );
eq( bitacora_ficha_estado_linea( $o ), "Explorado \xe2\x80\x93 no confirmado · detectado · Luna", 'detectado + motivo' );
$o = (object) array( 'resultado' => 'no_visto', 'motivo_no_visto' => null );
eq( bitacora_ficha_estado_linea( $o ), "Explorado \xe2\x80\x93 no confirmado", 'no visto sin motivo: ni subtipo ni motivo' );
eq( bitacora_ficha_estado_linea( (object) array( 'resultado' => 'visto' ) ), '', 'un visto no lleva línea' );
eq( bitacora_ficha_estado_linea( (object) array() ), '', 'sin resultado (fila previa) = visto' );
$xml = '<w:t>[x]</w:t>';
$out = bitacora_docx_reconstruir( $xml, array( array( 'apertura' => '<w:t>', 'cierre' => '</w:t>', 'ini' => 0, 'fin' => strlen( $xml ) ) ), array( "M13\nEstado" ) );
eq( $out, '<w:t>M13</w:t><w:br/><w:t xml:space="preserve">Estado</w:t>', 'el salto del valor es un <w:br/>' );

echo "datos existentes, todo 'visto' (criterio 6):\n";
$wpdb = new WpdbFixture();
for ( $i = 0; $i < 4; $i++ ) { $wpdb->filas[] = fila( 3, 7, 'visto' ); }
eq( bitacora_viaje_num_vistos( 3 ), bitacora_viaje_num_objetos( 3 ), 'vistos = total de filas: ningún total cambia' );

echo $fallos ? "\n$fallos FALLO(S)\n" : "\nTodo ok\n";
exit( $fallos ? 1 : 0 );
