<?php
declare(strict_types=1);
/* Test de la mitad que ESCRIBE del importador de Open Astronomy Log: al aplicar
   una importación, cada objeto observado tiene que quedar también en el catálogo
   del mapa (tabla de objetos), igual que cuando la observación se registra desde
   el formulario. Si no, la observación existe pero el objeto no se pinta: el
   buscador lo encuentra (resuelve en SIMBAD al vuelo) y el mapa sigue vacío.

   No hay WordPress: se le pone al importador un $wpdb de mentira y espías en las
   funciones del plugin que aquí no se cargan.

   Sin framework:  php scripts/test_oal_objeto_mapa.php  */

// ── Postizos de WordPress ────────────────────────────────────────────────────
class WP_Error {
    public $codigo; public $mensaje;
    public function __construct( $codigo = '', $mensaje = '', $datos = array() ) {
        $this->codigo = $codigo; $this->mensaje = $mensaje;
    }
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

/** $wpdb mínimo: no hay nada guardado y todo lo que se inserta recibe un id. */
class WpdbFalso {
    public $insert_id = 0;
    public $insertados = array();
    public function prepare( $sql, ...$args ) { return $sql; }
    public function get_var( $sql ) { return null; }
    public function get_results( $sql, $modo = null ) { return array(); }
    public function get_row( $sql, $modo = null ) { return null; }
    public function get_col( $sql ) { return array(); }
    public function delete( $tabla, $donde ) { return 1; }
    public function query( $sql ) { return 1; }
    public function insert( $tabla, $fila ) { $this->insert_id++; $this->insertados[] = $tabla; return 1; }
    public function update( $tabla, $fila, $donde ) { return 1; }
}
$wpdb = new WpdbFalso();

// ── Postizos del propio plugin (bitacora-registro.php no se carga: engancharía
//    WordPress entero) ─────────────────────────────────────────────────────────
foreach ( array( '', '_entradas', '_imagenes', '_objetos', '_observadores', '_fichas', '_bases',
                 '_base_compartida', '_viajes', '_viaje_tripulacion', '_telescopios', '_oculares',
                 '_auxiliares', '_filtros' ) as $sufijo ) {
    eval( 'function bitacora_nombre_tabla' . $sufijo . '() { return "wp_bitacora' . $sufijo . '"; }' );
}
function bitacora_observador_id_desde_nombre( $nombre, $usuario_id ) { return 7; }
function bitacora_viaje_asegurar( $usuario_id, $base_id, $fecha, $hora, $observador_id = null ) { return 11; }
function bitacora_simbad( $id ) { return array( 'ra' => 250.4, 'dec' => 36.4, 'dist_al' => 22200.0, 'morph' => '', 'otype' => 'GlC' ); }

// El espía: qué objetos se han mandado colocar en el mapa.
$GLOBALS['colocados'] = array();
function bitacora_asegurar_objeto_mapa( $identificador, $etiqueta = '', $ra = null, $dec = null, $tipo_obs = '' ) {
    $GLOBALS['colocados'][] = array( 'id' => $identificador, 'ra' => $ra, 'dec' => $dec );
    return true;
}

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-oal.php';

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }

$xml = (string) file_get_contents( __DIR__ . '/../registro/ejemplos-oal/noche-simple.xml' );

echo "la vista previa no coloca nada en el mapa:\n";
$previa = bitacora_oal_importar( $xml, 3, false );
eq( $previa['aplicado'], false, 'la vista previa no escribe' );
eq( count( $GLOBALS['colocados'] ), 0, 'ni toca el catálogo de objetos' );

echo "al aplicar, cada objeto importado entra en el catálogo del mapa:\n";
$res = bitacora_oal_importar( $xml, 3, true );
eq( $res['aplicado'], true, 'la importación se aplica' );
eq( $res['creadas'], 3, 'tres observaciones creadas' );
$ids = array_map( function ( $c ) { return $c['id']; }, $GLOBALS['colocados'] );
sort( $ids );
eq( $ids, array( 'M13', 'M57', 'NGC 7000' ), 'los tres objetos se mandan al mapa' );
ok( null !== $GLOBALS['colocados'][0]['ra'], 'con las coordenadas de la observación' );

echo ( $fallos ? "\nFALLOS: $fallos\n" : "\nok · lo importado también se pinta en el mapa\n" );
exit( $fallos ? 1 : 0 );
