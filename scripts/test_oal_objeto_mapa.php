<?php
declare(strict_types=1);
/* Test de LO OBSERVADO ACABA EN EL MAPA, por sus dos caminos torcidos:

   1. El importador de Open Astronomy Log (la mitad que ESCRIBE): cada objeto
      importado tiene que quedar también en el catálogo del mapa, igual que
      cuando la observación se registra desde el formulario.
   2. El backfill (bitacora_objetos_backfill): las observaciones que ya están
      guardadas y cuyo objeto se quedó sin colocar —porque en su día no se le
      encontró la distancia— hay que poder reintentarlas.

   Si no, la observación existe pero el objeto no se pinta, y en silencio: el
   buscador SÍ lo encuentra, porque resuelve en SIMBAD al vuelo, así que el mapa
   parece roto solo cuando se busca. Fue el caso de NGC 2022.

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

/** $wpdb mínimo: no hay nada guardado y todo lo que se inserta recibe un id.
 *  Para el backfill se le pueden poner a mano las observaciones guardadas
 *  ($observaciones) y los slugs que ya están en el catálogo ($slugs). */
class WpdbFalso {
    public $insert_id = 0;
    public $insertados = array();
    public $observaciones = array();
    public $slugs = array();
    public function prepare( $sql, ...$args ) { return $sql; }
    public function get_var( $sql ) { return null; }
    public function get_results( $sql, $modo = null ) {
        return ( false !== strpos( $sql, 'borrada_en IS NULL AND objeto' ) ) ? $this->observaciones : array();
    }
    public function get_row( $sql, $modo = null ) { return null; }
    public function get_col( $sql ) {
        return ( false !== strpos( $sql, 'SELECT slug' ) ) ? $this->slugs : array();
    }
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
                 '_auxiliares' ) as $sufijo ) {
    eval( 'function bitacora_nombre_tabla' . $sufijo . '() { return "wp_bitacora' . $sufijo . '"; }' );
}
function bitacora_observador_id_desde_nombre( $nombre, $usuario_id ) { return 7; }
function bitacora_viaje_asegurar( $usuario_id, $base_id, $fecha, $hora, $observador_id = null ) { return 11; }
function bitacora_simbad( $id ) { return array( 'ra' => 250.4, 'dec' => 36.4, 'dist_al' => 22200.0, 'morph' => '', 'otype' => 'GlC' ); }

// El espía: qué objetos se han mandado colocar en el mapa. Los identificadores
// listados en $GLOBALS['no_colocables'] fallan, como los que no tienen distancia.
$GLOBALS['colocados'] = array();
$GLOBALS['no_colocables'] = array();
function bitacora_asegurar_objeto_mapa( $identificador, $etiqueta = '', $ra = null, $dec = null, $tipo_obs = '' ) {
    $GLOBALS['colocados'][] = array( 'id' => $identificador, 'ra' => $ra, 'dec' => $dec );
    if ( in_array( $identificador, $GLOBALS['no_colocables'], true ) ) {
        return new WP_Error( 'sin_distancia', 'No hay distancia para «' . $identificador . '».' );
    }
    return true;
}

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-oal.php';

// bitacora_objetos_backfill() vive en bitacora-registro.php, que no se puede
// cargar aquí (engancharía WordPress entero al incluirlo), así que se saca su
// código REAL del fichero y se define tal cual. Si alguien la renombra o cambia
// su forma, este test se entera en vez de probar una copia vieja.
$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
$desde  = strpos( $fuente, 'function bitacora_objetos_backfill()' );
if ( false === $desde ) {
    echo "FALLA no se encuentra bitacora_objetos_backfill() en el plugin\n";
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

// ── El backfill: rescatar lo ya guardado que se quedó sin colocar ────────────
$obs = function ( $objeto, $ra, $dec, $tipo = '' ) {
    return (object) array( 'objeto' => $objeto, 'objeto_etiqueta' => $objeto, 'ra' => $ra, 'decl' => $dec, 'tipo' => $tipo );
};
$wpdb->slugs = array( 'm13', 'ngc2024' );          // lo que ya está en el mapa
$wpdb->observaciones = array(
    $obs( 'M13', 250.4, 36.4 ),                    // ya colocado: ni se intenta
    $obs( 'NGC 2022', 85.5, 9.1, 'planetaria' ),   // el huérfano del caso real
    $obs( 'NGC 2022', 85.5, 9.1, 'planetaria' ),   // otra noche, el mismo objeto
    $obs( 'IC 1101', 240.0, 5.7 ),                 // este sigue sin poder situarse
    $obs( '', null, null ),                        // fila sin objeto: se ignora
);
$GLOBALS['no_colocables'] = array( 'IC 1101' );

echo "el backfill coloca los objetos observados que faltan:\n";
$GLOBALS['colocados'] = array();
$r = bitacora_objetos_backfill();
eq( $r['colocados'], 1, 'coloca el objeto huérfano (y solo una vez, aunque se observara dos noches)' );
eq( array_map( function ( $c ) { return $c['id']; }, $GLOBALS['colocados'] ),
    array( 'NGC 2022', 'IC 1101' ), 'no reintenta lo que ya está en el catálogo' );
eq( array_keys( $r['problemas'] ), array( 'IC 1101' ), 'lo que sigue sin poder situarse se cuenta como problema' );
ok( false !== strpos( $r['problemas']['IC 1101'], 'No hay distancia' ), 'con el motivo, para poder darle la distancia a mano' );

echo "repetirlo no cuesta nada:\n";
$wpdb->slugs = array( 'm13', 'ngc2024', 'ngc2022' );
$GLOBALS['colocados'] = array();
$r2 = bitacora_objetos_backfill();
eq( $r2['colocados'], 0, 'segunda pasada: no hay nada nuevo que colocar' );
eq( count( $GLOBALS['colocados'] ), 1, 'solo se reintenta el que nunca se pudo situar' );

echo ( $fallos ? "\nFALLOS: $fallos\n" : "\nok · lo observado acaba en el mapa por los dos caminos\n" );
exit( $fallos ? 1 : 0 );
