<?php
declare(strict_types=1);
/* Test de EXPORTAR TODO LO MÍO (registro/spec-exportar-oal.md, issue #120):
   el `estado` de la bitácora entera de un usuario, construido en el servidor.

   El motor no cambia (un estado con 300 noches tiene la misma forma que uno
   con una); lo que aquí se vigila es el constructor, bitacora_oal_estado_viajes:

     - una noche por salida, en orden de fecha;
     - los recursos —lugar, tubo, ocular— se emiten UNA vez aunque los usen
       muchas noches: cada recurso repetido es una fila roja en AstroPlanner;
     - solo salen los recursos que alguna observación referencia;
     - las observaciones borradas no salen;
     - el estado de una sola salida sigue siendo el de siempre.

   No hay WordPress: un $wpdb de mentira con dos salidas en la misma base.

   Sin framework:  php scripts/test_oal_exportar_todo.php  */

// ── Postizos de WordPress ────────────────────────────────────────────────────
define( 'ARRAY_A', 'ARRAY_A' );
function wp_strip_all_tags( $s ) { return strip_tags( (string) $s ); }
function wp_timezone() { return new DateTimeZone( 'Europe/Madrid' ); }
function get_userdata( $id ) {
    return (object) array( 'first_name' => 'Israel', 'last_name' => 'Pérez', 'display_name' => 'isra', 'user_email' => 'isra@ejemplo.es' );
}
foreach ( array( '', '_entradas', '_objetos', '_observadores', '_bases', '_viajes', '_viaje_tripulacion',
                 '_telescopios', '_oculares', '_auxiliares' ) as $sufijo ) {
    eval( 'function bitacora_nombre_tabla' . $sufijo . '() { return "wp_bitacora' . $sufijo . '"; }' );
}

/** $wpdb con dos salidas del usuario 5 en la misma base, con el mismo tubo. */
class WpdbFalso {
    public $viajes = array();
    public $obs = array();
    public $entradas = array();
    public $consultas = array();
    private $args = array();
    public function prepare( $sql, ...$args ) {
        $this->args = ( 1 === count( $args ) && is_array( $args[0] ) ) ? $args[0] : $args;
        return $sql;
    }
    private function enteros() { return array_map( 'intval', $this->args ); }
    public function get_row( $sql, $modo = null ) {
        $this->consultas[] = $sql;
        if ( false !== strpos( $sql, 'wp_bitacora_bases' ) ) {
            return (object) array( 'id' => $this->args[0], 'nombre' => 'El Culebrín', 'lat' => 38.06, 'lon' => -6.2, 'altitud_m' => 600, 'tz' => 'Europe/Madrid' );
        }
        return null;
    }
    public function get_col( $sql ) {
        $this->consultas[] = $sql;
        return array();
    }
    public function get_var( $sql ) { return ''; }
    public function get_results( $sql, $modo = null ) {
        $this->consultas[] = $sql;
        $ids = $this->enteros();
        if ( false !== strpos( $sql, 'FROM wp_bitacora_viajes' ) ) {
            return array_values( array_filter( $this->viajes, function ( $v ) use ( $ids ) { return intval( $v->usuario_id ) === $ids[0]; } ) );
        }
        if ( false !== strpos( $sql, 'FROM wp_bitacora WHERE viaje_id' ) ) {
            return array_values( array_filter( $this->obs, function ( $o ) use ( $ids ) { return intval( $o->viaje_id ) === $ids[0] && null === $o->borrada_en; } ) );
        }
        if ( false !== strpos( $sql, 'FROM wp_bitacora_entradas' ) ) {
            return array_values( array_filter( $this->entradas, function ( $e ) use ( $ids ) { return intval( $e->observacion_id ) === $ids[0]; } ) );
        }
        if ( false !== strpos( $sql, 'FROM wp_bitacora_telescopios' ) ) {
            return array_map( function ( $id ) { return array( 'id' => $id, 'nombre' => 'El Dobson', 'vendor' => 'Skywatcher', 'modelo' => '12"', 'apertura_mm' => 305, 'focal_mm' => 1500 ); }, $ids );
        }
        if ( false !== strpos( $sql, 'FROM wp_bitacora_oculares' ) ) {
            return array_map( function ( $id ) { return array( 'id' => $id, 'nombre' => '', 'vendor' => 'TeleVue', 'modelo' => 'Nagler 22', 'focal_mm' => 22, 'campo_aparente' => 82 ); }, $ids );
        }
        return array();
    }
}
$wpdb = new WpdbFalso();

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-viaje.php';
require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-oal.php';

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }
function ids( array $filas ): array { return array_map( function ( $f ) { return $f['id']; }, $filas ); }

function viaje( int $id, string $noche ) {
    return (object) array( 'id' => $id, 'usuario_id' => 5, 'base_id' => 3, 'noche' => $noche, 'comienzo' => '22:00', 'fin' => '02:00', 'meteo' => '', 'cronica' => '' );
}
function obs( int $id, int $viaje, string $objeto, $borrada = null ) {
    return (object) array( 'id' => $id, 'viaje_id' => $viaje, 'objeto' => $objeto, 'ra' => 250.4, 'decl' => 36.4, 'hora_observacion' => '23:00',
        'fecha_observacion' => '', 'telescopio_id' => 9, 'observador_id' => null, 'observador' => '', 'cielo_sqm' => null, 'cielo_ir' => null,
        'seeing' => null, 'cielo_bortle' => null, 'borrada_en' => $borrada );
}
function entrada( int $id, int $obs, int $ocular ) {
    return (object) array( 'id' => $id, 'observacion_id' => $obs, 'orden' => 1, 'aumento' => 68, 'descripcion' => 'bonito', 'ocular_id' => $ocular, 'auxiliar_id' => null );
}

$wpdb->viajes   = array( viaje( 1, '2026-03-10' ), viaje( 2, '2026-05-20' ), (object) array( 'id' => 3, 'usuario_id' => 6, 'base_id' => 3, 'noche' => '2026-06-01' ) );
$wpdb->obs      = array( obs( 10, 1, 'M13' ), obs( 11, 2, 'M57' ), obs( 12, 2, 'M27', '2026-06-01 00:00:00' ) );
$wpdb->entradas = array( entrada( 100, 10, 4 ), entrada( 101, 11, 4 ), entrada( 102, 12, 8 ) );

echo "todo lo mío: dos salidas, un lugar, un tubo, un ocular:\n";
$e = bitacora_oal_estado_usuario( 5 );
eq( array_map( function ( $n ) { return $n['id']; }, $e['noches'] ), array( 'n1', 'n2' ), 'una noche por salida, en orden de fecha; la del usuario 6 no' );
eq( ids( $e['lugares'] ), array( 'lu3' ), 'la base compartida sale UNA vez' );
eq( ids( $e['telescopios'] ), array( 'te9' ), 'el tubo compartido sale UNA vez' );
eq( ids( $e['oculares'] ), array( 'oc4' ), 'solo el ocular que alguna observación usa: el oc8 era de la borrada' );
eq( array_map( function ( $o ) { return $o['id']; }, $e['observaciones'] ), array( 'obs10-1', 'obs11-1' ), 'la observación borrada no sale' );
eq( array_map( function ( $o ) { return $o['nocheId']; }, $e['observaciones'] ), array( 'n1', 'n2' ), 'cada observación cuelga de su noche' );
eq( $e['observador']['correo'], 'isra@ejemplo.es', 'el contacto es del que exporta' );

echo "una sola salida sigue siendo lo de siempre:\n";
$uno = bitacora_oal_estado_viaje( $wpdb->viajes[1], 5 );
eq( array_map( function ( $n ) { return $n['id']; }, $uno['noches'] ), array( 'n2' ), 'una noche' );
eq( count( $uno['observaciones'] ), 1, 'una observación' );

echo "sin salidas, un estado vacío y bien formado:\n";
$nada = bitacora_oal_estado_usuario( 99 );
eq( $nada['noches'], array(), 'sin noches' );
eq( $nada['lugares'], array(), 'sin lugares' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo en verde\n";
exit( $fallos ? 1 : 0 );
