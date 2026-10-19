<?php
declare(strict_types=1);
/* Test de UNA ESTRELLA, UNA FILA (#435), por sus dos vías:

   1. Al registrar: «HR 7106» con «Sheliak» ya en el catálogo no crea fila; la
      observación pasa a colgar de «Sheliak».
   2. La migración: las filas duplicadas se funden en la canónica, sus
      observaciones se mueven a ella y la fila sobrante desaparece.

   No hay WordPress: el código REAL de las funciones se saca del plugin y se
   evalúa con un $wpdb de mentira.

   Sin framework:  php scripts/test_estrella_unica.php  */

class WP_Error {}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
define( 'ARRAY_A', 'ARRAY_A' );
function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_objetos() { return 'objs'; }

$GLOBALS['calc'] = array( 'tipo' => 'estrella', 'gal_l' => 63.188, 'gal_b' => 14.783, 'dist_al' => 906.2 );
function bitacora_completar_objeto( $id, $d = null, $ra = null, $dec = null, $t = '' ) { return $GLOBALS['calc']; }

class WpdbFalso {
    public $objetos = array(), $obs = array(), $borradas = array(), $actualizadas = array();
    public function prepare( $sql, ...$a ) { return $sql; }
    public function get_var( $sql ) { return null; }
    public function get_results( $sql, $modo = null ) {
        if ( false !== strpos( $sql, 'FROM obs' ) ) { return $this->obs; }
        return $this->objetos;
    }
    public function update( $t, $f, $w ) { $this->actualizadas[] = array( $w['id'], $f['objeto'] ); return 1; }
    public function delete( $t, $w ) { $this->borradas[] = $w['slug']; return 1; }
}
$wpdb = new WpdbFalso();

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-slug.php';
$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
$desde  = strpos( $fuente, 'function bitacora_clave_posicion_estrella' );
$hasta  = strpos( $fuente, '/**', strpos( $fuente, 'function bitacora_fusionar_estrellas_duplicadas' ) );
if ( false === $desde || false === $hasta ) { echo "FALLA no se encuentra el bloque en el plugin\n"; exit( 1 ); }
eval( substr( $fuente, $desde, $hasta - $desde ) );

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
$fila = function ( $slug, $etiqueta, $l = 63.188, $b = 14.783, $d = 906.0 ) {
    return array( 'slug' => $slug, 'etiqueta' => $etiqueta, 'gal_l' => $l, 'gal_b' => $b, 'dist_al' => $d );
};

echo "al registrar, el alias cuelga de la fila existente:\n";
$wpdb->objetos = array( $fila( 'sheliak', 'Sheliak' ) );
$datos = bitacora_unificar_estrella( array( 'objeto' => 'HR 7106', 'objeto_etiqueta' => 'HR 7106', 'ra' => null, 'decl' => null ) );
eq( $datos['objeto'], 'Sheliak', 'HR 7106 pasa a Sheliak' );
eq( $datos['objeto_etiqueta'], 'HR 7106', 'y lo escrito queda en la etiqueta' );
$GLOBALS['calc']['gal_l'] = 66.925;
$datos = bitacora_unificar_estrella( array( 'objeto' => 'HR 7139', 'objeto_etiqueta' => 'x', 'ra' => null, 'decl' => null ) );
eq( $datos['objeto'], 'HR 7139', 'otra posición: no se toca' );
$GLOBALS['calc'] = array( 'tipo' => 'cumulo-abierto', 'gal_l' => 63.188, 'gal_b' => 14.783, 'dist_al' => 906.0 );
$datos = bitacora_unificar_estrella( array( 'objeto' => 'Tr 37', 'objeto_etiqueta' => 'x', 'ra' => null, 'decl' => null ) );
eq( $datos['objeto'], 'Tr 37', 'mismo sitio pero no es estrella: no se funde' );

echo "la canónica sale del nombre, no del orden:\n";
$plan = bitacora_plan_fusion_estrellas( array(
    $fila( 'hr7106', 'HR 7106' ) + array( 'n_obs' => 1 ),
    $fila( 'sheliak', 'Sheliak' ) + array( 'n_obs' => 1 ),
    $fila( 'hr7139', 'HR 7139', 66.925, 15.323, 770.0 ) + array( 'n_obs' => 2 ),
    $fila( 'sao67559', 'SAO 67559', 66.925, 15.323, 770.0 ) + array( 'n_obs' => 0 ),
    $fila( 'vega', 'Vega', 1.0, 2.0, 25.0 ) + array( 'n_obs' => 0 ),
) );
eq( array_map( function ( $f ) { return $f['slug']; }, $plan ), array( 'hr7106' => 'sheliak', 'sao67559' => 'hr7139' ), 'dos alias, ninguna otra fila' );

echo "la migración mueve las observaciones y borra el sobrante:\n";
$wpdb->objetos = array( $fila( 'hr7106', 'HR 7106' ), $fila( 'sheliak', 'Sheliak' ), $fila( 'vega', 'Vega', 1.0, 2.0, 25.0 ) );
$wpdb->obs = array( (object) array( 'id' => 5, 'objeto' => 'HR 7106' ), (object) array( 'id' => 6, 'objeto' => 'Sheliak' ), (object) array( 'id' => 7, 'objeto' => 'Vega' ) );
eq( bitacora_fusionar_estrellas_duplicadas(), 1, 'una fila fusionada' );
eq( $wpdb->actualizadas, array( array( 5, 'Sheliak' ) ), 'solo la observación del alias se mueve' );
eq( $wpdb->borradas, array( 'hr7106' ), 'y se borra solo la fila del alias' );

echo $fallos ? "\n$fallos fallos\n" : "\ntodo ok\n";
exit( $fallos ? 1 : 0 );
