<?php
declare(strict_types=1);
/* Test del TRAMO DE AUDIO frente al reimportador de OAL (ADR 0005).

   Reimportar el XML de una observación que ya tiene tramo de audio (adoptada
   o actualizada por oal_id) no puede borrarlo ni tocarlo: el importador
   construye su $fila SOLO con lo que trae el XML, y el XML no tiene ni puede
   tener campos de audio (ADR 0003, un solo escritor del dialecto). Este test
   comprueba justo eso: el array que bitacora_oal_importar() pasa a
   $wpdb->update() para una observación YA EXISTENTE (por tanto, con tramo
   guardado) no lleva ninguna de las cuatro claves de audio.

   No hay WordPress: mismos postizos que test_oal_objeto_mapa.php, con un
   $wpdb que finge que la observación de la noche importada YA EXISTE (para
   forzar la rama de ACTUALIZAR) y que espía el array que le llega.

   Sin framework:  php scripts/test_audio_oal_reimport.php  */

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

foreach ( array( '', '_entradas', '_imagenes', '_objetos', '_observadores', '_fichas', '_bases',
                 '_base_compartida', '_viajes', '_viaje_tripulacion', '_telescopios', '_oculares',
                 '_auxiliares', '_filtros' ) as $sufijo ) {
    eval( 'function bitacora_nombre_tabla' . $sufijo . '() { return "wp_bitacora' . $sufijo . '"; }' );
}
function bitacora_observador_id_desde_nombre( $nombre, $usuario_id ) { return 7; }
function bitacora_viaje_asegurar( $usuario_id, $base_id, $fecha, $hora, $observador_id = null ) { return 11; }
function bitacora_simbad( $id ) { return array( 'ra' => 250.4, 'dec' => 36.4, 'dist_al' => 22200.0, 'morph' => '', 'otype' => 'GlC' ); }
function bitacora_asegurar_objeto_mapa( $identificador, $etiqueta = '', $ra = null, $dec = null, $tipo_obs = '' ) { return true; }

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-oal.php';

/** $wpdb de mentira: la observación de M13 en la noche del XML YA EXISTE (id
 *  999, con tramo de audio guardado en la BD de verdad), así que importar
 *  entra por la rama de ACTUALIZAR y no por la de crear. Cada update() que
 *  recibe ese id 999 se guarda para poder inspeccionar sus claves. */
class WpdbAudio {
    public $insert_id = 0;
    public $updates_a_999 = array();
    private $oal_id_m13;
    public function __construct( $oal_id_m13 ) { $this->oal_id_m13 = $oal_id_m13; }
    public function prepare( $sql, ...$args ) {
        if ( 1 === count( $args ) && is_array( $args[0] ) ) { $args = $args[0]; }
        foreach ( $args as $a ) {
            $v = is_int( $a ) ? (string) $a : "'" . str_replace( "'", "''", (string) $a ) . "'";
            $sql = preg_replace( '/%[dsf]/', $v, $sql, 1 );
        }
        return $sql;
    }
    public function get_var( $sql ) {
        // La consulta de "qué ya está importado", para el objeto que nos interesa.
        return ( false !== strpos( $sql, $this->oal_id_m13 ) ) ? 999 : null;
    }
    public function get_results( $sql, $modo = null ) { return array(); }
    public function get_row( $sql, $modo = null ) { return null; }
    public function get_col( $sql ) { return array(); }
    public function insert( $tabla, $fila ) { $this->insert_id++; return 1; }
    public function update( $tabla, $fila, $donde ) {
        if ( isset( $donde['id'] ) && 999 === $donde['id'] ) {
            $this->updates_a_999[] = $fila;
        }
        return 1;
    }
    public function query( $sql ) { return 1; }
    public function delete( $tabla, $donde ) { return 1; }
}

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }

$xml = (string) file_get_contents( __DIR__ . '/../registro/ejemplos-oal/noche-simple.xml' );
$oal_id_m13 = bitacora_oal_id( '2026-08-05', 'M13' );

global $wpdb;
$wpdb = new WpdbAudio( $oal_id_m13 );

echo "reimportar una observación con tramo de audio no la toca:\n";
$res = bitacora_oal_importar( $xml, 3, true );
ok( $res['aplicado'], 'la importación se aplica' );
ok( count( $wpdb->updates_a_999 ) >= 1, 'M13 (id 999, ya importada) se actualiza en vez de duplicarse' );

$fila = $wpdb->updates_a_999[0];
foreach ( array( 'audio_url', 'audio_inicio', 'audio_fin', 'audio_episodio_url' ) as $col ) {
    ok( ! array_key_exists( $col, $fila ), "el UPDATE no lleva la clave '$col'" );
}

echo $fallos ? "\n$fallos fallo(s)\n" : "\nok · reimportar OAL no toca el tramo de audio\n";
exit( $fallos ? 1 : 0 );
