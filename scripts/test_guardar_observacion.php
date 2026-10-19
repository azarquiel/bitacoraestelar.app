<?php
declare(strict_types=1);
/* Test de GUARDAR / EDITAR UNA OBSERVACIÓN (#464): atómico y sin duplicar.

   1. Crear: fila, observador, viaje y entradas se escriben juntos; si falla
      cualquier paso no queda nada y el 500 dice cuál.
   2. Editar con un INSERT de entradas que falla: las entradas anteriores siguen.
   3. Reintento con la misma clave de idempotencia: devuelve el id de la primera.
   4. La ficha y el objeto del mapa no pueden tumbar el guardado: se avisa.

   No hay WordPress: el código REAL de los manejadores y de guardar_entradas se
   saca del plugin y se evalúa con un $wpdb de mentira que sabe deshacer una
   transacción (copia las tablas en START y las restaura en ROLLBACK).

   Sin framework:  php scripts/test_guardar_observacion.php  */

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
function current_time( $t, $g = false ) { return '2026-10-19 22:00:00'; }
function get_current_user_id() { return $GLOBALS['uid']; }
function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_entradas() { return 'ent'; }
function bitacora_nombre_tabla_imagenes() { return 'img'; }

// Postizos de lo que NO se prueba aquí (validación, viaje, ficha, mapa).
function bitacora_validar_datos( $p ) { return array( 'objeto' => $p['objeto'], 'objeto_etiqueta' => $p['objeto'], 'observador' => 'Ana', 'base_id' => 0, 'ra' => null, 'decl' => null ); }
function bitacora_unificar_estrella( $d ) { return $d; }
function bitacora_validar_entradas( $e ) { return $e; }
function bitacora_viaje_pedido( $p ) { return 0; }
function bitacora_obtener( $id ) { $f = $GLOBALS['wpdb']->tabla['obs'][ $id ] ?? null; return $f ? (object) ( $f + array( 'borrada_en' => null ) ) : null; }
function bitacora_puede_modificar( $o ) { return true; }
function bitacora_observador_id_desde_nombre( $n, $u = 0 ) { return 7; }
function bitacora_viaje_sincronizar( $id, $v = 0 ) { return $GLOBALS['falla_viaje'] ? false : 3; }
function bitacora_sembrar_ficha_desde_registro( $id, $p ) { return $GLOBALS['falla_ficha'] ? false : true; }
function bitacora_asegurar_objeto_mapa( $o, $e, $ra, $dec, $t ) { return $GLOBALS['falla_mapa'] ? new WP_Error( 'x', 'sin distancia' ) : true; }

class WpdbFalso {
    public $tabla = array( 'obs' => array(), 'ent' => array(), 'img' => array() );
    public $insert_id = 0, $sig = 0, $copia = null;
    public $falla_insert = null;  // tabla cuyo INSERT falla
    public $ciego = false;        // el próximo SELECT por clave no ve nada (carrera)
    public function prepare( $sql, ...$a ) {
        foreach ( $a as $v ) { $sql = preg_replace( '/%[ds]/', is_int( $v ) ? (string) $v : "'" . $v . "'", $sql, 1 ); }
        return $sql;
    }
    public function get_col( $sql ) {
        preg_match( '/FROM (\w+) WHERE observacion_id = (\d+)/', $sql, $m );
        return array_keys( array_filter( $this->tabla[ $m[1] ], fn( $f ) => $f['observacion_id'] == $m[2] ) );
    }
    public function get_row( $sql ) {
        if ( $this->ciego ) { $this->ciego = false; return null; }
        preg_match( "/usuario_id = (\d+) AND clave_idem = '([^']*)'/", $sql, $m );
        foreach ( $this->tabla['obs'] as $id => $f ) {
            if ( $f['usuario_id'] == $m[1] && ( $f['clave_idem'] ?? null ) === $m[2] ) { return (object) array( 'id' => $id, 'objeto' => $f['objeto'] ); }
        }
        return null;
    }
    public function insert( $t, $d, $f = null ) {
        if ( $t === $this->falla_insert ) { return false; }
        if ( 'obs' === $t && isset( $d['clave_idem'] ) ) { // UNIQUE KEY (usuario_id, clave_idem)
            foreach ( $this->tabla['obs'] as $o ) { if ( $o['usuario_id'] == $d['usuario_id'] && ( $o['clave_idem'] ?? null ) === $d['clave_idem'] ) { return false; } }
        }
        $this->insert_id = ++$this->sig;
        $this->tabla[ $t ][ $this->insert_id ] = $d;
        return 1;
    }
    public function update( $t, $d, $w, $f = null, $wf = null ) {
        $this->tabla[ $t ][ $w['id'] ] = array_merge( $this->tabla[ $t ][ $w['id'] ], $d );
        return 1;
    }
    public function delete( $t, $w, $f = null ) {
        foreach ( $this->tabla[ $t ] as $id => $fila ) { if ( $fila['observacion_id'] == $w['observacion_id'] ) { unset( $this->tabla[ $t ][ $id ] ); } }
        return 1;
    }
    public function query( $sql ) {
        if ( 'START TRANSACTION' === $sql ) { $this->copia = $this->tabla; }
        elseif ( 'ROLLBACK' === $sql ) { $this->tabla = $this->copia; $this->copia = null; }
        elseif ( 'COMMIT' === $sql ) { $this->copia = null; }
        elseif ( preg_match( '/DELETE FROM img WHERE entrada_id IN \(([\d,]+)\)/', $sql, $m ) ) {
            foreach ( explode( ',', $m[1] ) as $e ) { foreach ( $this->tabla['img'] as $id => $i ) { if ( $i['entrada_id'] == $e ) { unset( $this->tabla['img'][ $id ] ); } } }
        }
        return 1;
    }
}
$wpdb = new WpdbFalso();

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
foreach ( array( 'bitacora_guardar_entradas', 'bitacora_asignar_observador', 'bitacora_clave_idem', 'bitacora_observacion_por_clave',
                 'bitacora_error_paso', 'bitacora_en_transaccion', 'bitacora_escribir_dependientes', 'bitacora_escribir_accesorios',
                 'bitacora_respuesta_repetida', 'bitacora_guardar_observacion', 'bitacora_editar_observacion' ) as $f ) {
    if ( ! preg_match( '/^function ' . $f . '\(.*?^\}$/ms', $fuente, $m ) ) { echo "FALLA no se encuentra $f en el plugin\n"; exit( 1 ); }
    eval( $m[0] );
}

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function entrada( string $t ): array {
    return array( 'aumento' => 100.0, 'campo_real' => null, 'pupila_salida' => null, 'titulo' => $t, 'descripcion' => '', 'imagenes' => array() );
}
function crear( array $extra = array() ) {
    return bitacora_guardar_observacion( new WP_REST_Request( array_merge( array( 'objeto' => 'M13', 'entradas' => array( entrada( 'a' ), entrada( 'b' ) ) ), $extra ) ) );
}
function titulos(): array { global $wpdb; return array_values( array_map( fn( $e ) => $e['titulo'], $wpdb->tabla['ent'] ) ); }
function reset_mundo(): void {
    global $wpdb; $GLOBALS['uid'] = 5; $GLOBALS['falla_viaje'] = $GLOBALS['falla_ficha'] = $GLOBALS['falla_mapa'] = false;
    $wpdb = new WpdbFalso();
}

echo "crear escribe todo junto:\n";
reset_mundo();
$r = crear();
eq( $r->s, 201, '201' );
eq( count( $wpdb->tabla['obs'] ), 1, 'una fila' );
eq( $wpdb->tabla['obs'][ $r->d['id'] ]['observador_id'], 7, 'con su observador' );
eq( titulos(), array( 'a', 'b' ), 'y sus dos entradas' );

echo "crear con un INSERT de entradas que falla:\n";
reset_mundo(); $wpdb->falla_insert = 'ent';
$r = crear();
eq( $r->codigo, 'error_bd', 'error_bd' );
eq( $r->datos, array( 'status' => 500, 'paso' => 'entradas' ), '500 con el paso que falló' );
eq( array( count( $wpdb->tabla['obs'] ), count( $wpdb->tabla['ent'] ) ), array( 0, 0 ), 'no queda fila ni entradas' );

echo "crear con el viaje que falla:\n";
reset_mundo(); $GLOBALS['falla_viaje'] = true;
$r = crear();
eq( $r->datos['paso'], 'viaje', 'dice «viaje»' );
eq( count( $wpdb->tabla['obs'] ), 0, 'no queda fila' );

echo "crear con el INSERT de la fila que falla:\n";
reset_mundo(); $wpdb->falla_insert = 'obs';
eq( crear()->datos['paso'], 'observación', 'dice «observación»' );

echo "editar con un INSERT de entradas que falla:\n";
reset_mundo();
$id = crear( array( 'objeto' => 'M13' ) )->d['id'];
$wpdb->falla_insert = 'ent';
$r = bitacora_editar_observacion( new WP_REST_Request( array( 'objeto' => 'M92', 'entradas' => array( entrada( 'nueva' ) ) ), array( 'id' => $id ) ) );
eq( $r->datos['paso'], 'entradas', '500 con el paso' );
eq( titulos(), array( 'a', 'b' ), 'las entradas anteriores siguen' );
eq( $wpdb->tabla['obs'][ $id ]['objeto'], 'M13', 'y la fila no cambió' );
$wpdb->falla_insert = null;
$r = bitacora_editar_observacion( new WP_REST_Request( array( 'objeto' => 'M92', 'entradas' => array( entrada( 'nueva' ) ) ), array( 'id' => $id ) ) );
eq( array( $r->s, titulos(), $wpdb->tabla['obs'][ $id ]['objeto'] ), array( 200, array( 'nueva' ), 'M92' ), 'sin fallo, edita y reemplaza' );

echo "reintento con la misma clave:\n";
reset_mundo();
$primera = crear( array( 'clave_idem' => 'clave-12345678' ) );
$segunda = crear( array( 'clave_idem' => 'clave-12345678' ) );
eq( $segunda->d['id'], $primera->d['id'], 'mismo id' );
eq( array( $segunda->s, count( $wpdb->tabla['obs'] ), count( $wpdb->tabla['ent'] ) ), array( 200, 1, 2 ), 'no crea otra fila ni otras entradas' );
crear( array( 'clave_idem' => 'otra-clave-1234' ) );
eq( count( $wpdb->tabla['obs'] ), 2, 'otra clave sí crea' );
crear(); crear();
eq( count( $wpdb->tabla['obs'] ), 4, 'sin clave no se deduplica (clientes antiguos)' );
$GLOBALS['uid'] = 6;
crear( array( 'clave_idem' => 'clave-12345678' ) );
eq( count( $wpdb->tabla['obs'] ), 5, 'la clave es por usuario' );
crear( array( 'clave_idem' => 'corta' ) );
eq( count( $wpdb->tabla['obs'] ), 6, 'una clave inválida se ignora' );

echo "dos envíos simultáneos (el SELECT no ve al otro, el índice único sí):\n";
reset_mundo();
$primera = crear( array( 'clave_idem' => 'clave-12345678' ) );
$wpdb->ciego = true;
$segunda = crear( array( 'clave_idem' => 'clave-12345678' ) );
eq( array( $segunda->d['id'], count( $wpdb->tabla['obs'] ), count( $wpdb->tabla['ent'] ) ), array( $primera->d['id'], 1, 2 ), 'devuelve la primera, sin restos' );

echo "la ficha y el mapa no tumban el guardado:\n";
reset_mundo(); $GLOBALS['falla_ficha'] = $GLOBALS['falla_mapa'] = true;
$r = crear();
eq( array( $r->s, count( $wpdb->tabla['obs'] ) ), array( 201, 1 ), 'se guarda' );
eq( array( $r->d['aviso'], '' !== $r->d['aviso_ficha'] ), array( 'sin distancia', true ), 'y avisa de las dos' );

echo $fallos ? "\n$fallos FALLOS\n" : "\ntodo ok\n";
exit( $fallos ? 1 : 0 );
