<?php
/* Test de CÓMO escribe el importador de OAL (bitacora_oal_importar):

   · Cada observación entra entera —fila, entradas y ficha— o no entra: si la
     base de datos rechaza un paso, esa observación se deshace, se cuenta como
     problema y las demás siguen.
   · Situar los objetos en el mapa (consultas a catálogos externos, lentas) va
     DESPUÉS de guardar todas las observaciones: un corte por tiempo ya no deja
     la importación a medias.
   · Solo la firma del fichero se enlaza a la cuenta que importa; un compañero
     de salida se da de alta sin usuario.

   No hay WordPress: $wpdb de mentira que apunta lo que pasa, en orden.

   Sin framework:  php scripts/test_oal_import_atomico.php  */

class WP_Error {
    public $mensaje;
    public function __construct( $codigo = '', $mensaje = '', $datos = array() ) { $this->mensaje = $mensaje; }
    public function get_error_message() { return $this->mensaje; }
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
define( 'ARRAY_A', 'ARRAY_A' );
define( 'OBJECT', 'OBJECT' );
function current_time( $tipo, $gmt = 0 ) { return '2026-08-08 00:00:00'; }
function get_userdata( $id ) { return null; }
function sanitize_text_field( $s ) { return trim( (string) $s ); }
function wp_kses_post( $s ) { return (string) $s; }
function sanitize_textarea_field( $s ) { return trim( (string) $s ); }

/** Apunta en $GLOBALS['pasos'] cada escritura. $falla = array( tabla, n ): el
 *  n-ésimo INSERT en esa tabla lo rechaza la base de datos. */
class WpdbEspia {
    public $insert_id = 0;
    public $falla = null;
    private $n = array();
    public function prepare( $sql, ...$args ) { return $sql; }
    public function get_var( $sql ) { return null; }
    public function get_results( $sql, $modo = null ) { return array(); }
    public function get_row( $sql, $modo = null ) { return null; }
    public function get_col( $sql ) { return array(); }
    public function delete( $tabla, $donde ) { return 1; }
    public function update( $tabla, $fila, $donde ) { return 1; }
    public function query( $sql ) {
        if ( in_array( $sql, array( 'START TRANSACTION', 'COMMIT', 'ROLLBACK' ), true ) ) {
            $GLOBALS['pasos'][] = $sql;
        }
        return 1;
    }
    public function insert( $tabla, $fila ) {
        $this->n[ $tabla ] = ( $this->n[ $tabla ] ?? 0 ) + 1;
        if ( $this->falla && $this->falla[0] === $tabla && $this->falla[1] === $this->n[ $tabla ] ) {
            return false;
        }
        $this->insert_id++;
        if ( 'wp_bitacora' === $tabla ) {
            $GLOBALS['pasos'][] = 'obs:' . $fila['objeto'];
        }
        return 1;
    }
}

foreach ( array( '', '_entradas', '_imagenes', '_objetos', '_observadores', '_fichas', '_bases',
                 '_base_compartida', '_viajes', '_viaje_tripulacion', '_telescopios', '_oculares',
                 '_auxiliares' ) as $sufijo ) {
    eval( 'function bitacora_nombre_tabla' . $sufijo . '() { return "wp_bitacora' . $sufijo . '"; }' );
}
function bitacora_observador_id_desde_nombre( $nombre, $usuario_id ) {
    $GLOBALS['observadores'][] = array( $nombre, $usuario_id );
    return 7;
}
function bitacora_viaje_asegurar( $usuario_id, $base_id, $fecha, $hora, $observador_id = null ) { return 11; }
function bitacora_simbad( $id ) { return array( 'ra' => 250.4, 'dec' => 36.4, 'dist_al' => 22200.0, 'morph' => '', 'otype' => 'GlC' ); }
function bitacora_asegurar_objeto_mapa( $identificador, $etiqueta = '', $ra = null, $dec = null, $tipo_obs = '' ) {
    $GLOBALS['pasos'][] = 'mapa:' . $identificador;
    return true;
}
function bitacora_unificar_estrella( $datos ) { return $datos; }
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-oal.php';

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; return; }
    $fallos++;
    echo "  FALLA $et\n        esperado: " . json_encode( $b, JSON_UNESCAPED_UNICODE ) . "\n        obtenido: " . json_encode( $a, JSON_UNESCAPED_UNICODE ) . "\n";
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }
function importar( $falla = null ) {
    global $wpdb;
    $wpdb = new WpdbEspia();
    $wpdb->falla = $falla;
    $GLOBALS['pasos'] = array();
    $GLOBALS['observadores'] = array();
    return bitacora_oal_importar( (string) file_get_contents( __DIR__ . '/../registro/ejemplos-oal/noche-simple.xml' ), 3, true );
}
function cuenta( $prefijo ) {
    return count( array_filter( $GLOBALS['pasos'], function ( $p ) use ( $prefijo ) { return 0 === strpos( $p, $prefijo ); } ) );
}

echo "importación sin tropiezos:\n";
$res = importar();
eq( $res['creadas'], 3, 'tres observaciones creadas' );
eq( array( cuenta( 'START' ), cuenta( 'COMMIT' ), cuenta( 'ROLLBACK' ) ), array( 3, 3, 0 ), 'una transacción por observación, todas confirmadas' );
$primer_mapa   = min( array_keys( array_filter( $GLOBALS['pasos'], function ( $p ) { return 0 === strpos( $p, 'mapa:' ); } ) ) );
$ultimo_commit = max( array_keys( $GLOBALS['pasos'], 'COMMIT', true ) );
ok( $primer_mapa > $ultimo_commit, 'el mapa se toca cuando TODAS las observaciones ya están guardadas' );
eq( cuenta( 'mapa:' ), 3, 'y se sitúan los tres objetos' );

echo "quién se enlaza a la cuenta que importa:\n";
$con_cuenta = array_filter( $GLOBALS['observadores'], function ( $o ) { return 0 !== $o[1]; } );
$sin_cuenta = array_filter( $GLOBALS['observadores'], function ( $o ) { return 0 === $o[1]; } );
eq( count( $con_cuenta ), 1, 'solo una identidad se enlaza a la cuenta: la firma del fichero' );
ok( count( $sin_cuenta ) >= 1, 'el compañero de salida se da de alta sin usuario' );
ok( ! array_intersect( array_column( $con_cuenta, 0 ), array_column( $sin_cuenta, 0 ) ), 'y no son la misma persona' );

echo "la base de datos rechaza las entradas de la segunda observación:\n";
$res = importar( array( 'wp_bitacora_entradas', 2 ) );
eq( $res['creadas'], 2, 'las otras dos entran' );
eq( array( cuenta( 'START' ), cuenta( 'COMMIT' ), cuenta( 'ROLLBACK' ) ), array( 3, 2, 1 ), 'la rechazada se deshace entera, no queda la fila sin entradas' );
$rechazadas = array_filter( $res['problemas'], function ( $p ) { return false !== strpos( $p['que'], 'no se ha guardado' ); } );
eq( count( $rechazadas ), 1, 'y se cuenta como problema, con su objeto' );
eq( cuenta( 'mapa:' ), 2, 'lo que no se guardó no se manda al mapa' );

echo "la base de datos rechaza la fila de la primera observación:\n";
$res = importar( array( 'wp_bitacora', 1 ) );
eq( array( $res['creadas'], cuenta( 'ROLLBACK' ) ), array( 2, 1 ), 'no se cuenta como creada y se deshace' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
