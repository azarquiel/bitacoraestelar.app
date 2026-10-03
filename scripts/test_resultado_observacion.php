<?php
declare(strict_types=1);
/* Test del RESULTADO de la observación (#394, épica #393): visto /
   detectado_no_visto / no_visto y su motivo.

   Cubre los criterios 1 a 4: migración (columnas y filas previas en 'visto'),
   rechazo de valores fuera de lista, defecto 'visto' y motivo a NULL al pasar
   a visto. Las funciones REALES se sacan del plugin (cargarlo entero
   engancharía WordPress).

   Sin framework:  php scripts/test_resultado_observacion.php  */

class WP_Error {
    public $codigo; public $mensaje; public $datos;
    public function __construct( $codigo = '', $mensaje = '', $datos = array() ) {
        $this->codigo = $codigo; $this->mensaje = $mensaje; $this->datos = $datos;
    }
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
function sacar( string $fuente, string $nombre ): string {
    $desde = strpos( $fuente, "function $nombre(" );
    if ( false === $desde ) { echo "FALLA no se encuentra $nombre() en el plugin\n"; exit( 1 ); }
    return substr( $fuente, $desde, strpos( $fuente, "\n}\n", $desde ) - $desde + 3 );
}
eval( sacar( $fuente, 'bitacora_validar_resultado' ) );
eval( sacar( $fuente, 'bitacora_asegurar_columna' ) );

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }
function es400( $r ): bool { return is_wp_error( $r ) && 400 === $r->datos['status']; }

/** $wpdb de mentira: una tabla con filas previas; ALTER ... ADD COLUMN rellena
 *  las filas existentes con el DEFAULT, como MySQL. */
class WpdbTabla {
    public $cols = array( 'id' ); public $filas = array( array( 'id' => 1 ), array( 'id' => 2 ) );
    public $defs = array();
    public function get_col( $sql, $n = 0 ) { return $this->cols; }
    public function query( $sql ) {
        preg_match( '/ADD COLUMN (\w+) (.*)$/', $sql, $m );
        $this->cols[] = $m[1]; $this->defs[ $m[1] ] = $m[2];
        $def = preg_match( "/DEFAULT '([^']*)'/", $m[2], $d ) ? $d[1] : null;
        foreach ( $this->filas as &$f ) { $f[ $m[1] ] = $def; }
        return 1;
    }
}

echo "migración (criterio 1):\n";
preg_match( '/asegurar_columna\( \$tabla, \'resultado\', "([^"]+)" \)/', $fuente, $r );
preg_match( '/asegurar_columna\( \$tabla, \'motivo_no_visto\', "([^"]+)" \)/', $fuente, $m );
ok( $r && $m, 'la migración declara resultado y motivo_no_visto' );
$wpdb = new WpdbTabla();
bitacora_asegurar_columna( 'wp_bitacora', 'resultado', $r[1] );
bitacora_asegurar_columna( 'wp_bitacora', 'motivo_no_visto', $m[1] );
ok( false !== strpos( $r[1], "NOT NULL DEFAULT 'visto'" ), "resultado es NOT NULL DEFAULT 'visto'" );
ok( false === strpos( $m[1], 'NOT NULL' ), 'motivo_no_visto admite NULL' );
eq( array_column( $wpdb->filas, 'resultado' ), array( 'visto', 'visto' ), "las filas previas leen 'visto'" );
eq( array_column( $wpdb->filas, 'motivo_no_visto' ), array( null, null ), 'las filas previas no tienen motivo' );
ok( preg_match( "/Version:\s+(\S+)/", $fuente, $v1 ) && preg_match( "/'BITACORA_VERSION', '([^']+)'/", $fuente, $v2 ) && $v1[1] === $v2[1],
    'cabecera Version: y BITACORA_VERSION coinciden (solo la constante dispara la migración)' );

echo "\nresultado (criterio 2):\n";
eq( bitacora_validar_resultado( array() ), array( 'resultado' => 'visto', 'motivo_no_visto' => null ), 'sin resultado: visto' );
eq( bitacora_validar_resultado( array( 'resultado' => '' ) )['resultado'], 'visto', 'vacío: visto' );
foreach ( array( 'visto', 'detectado_no_visto', 'no_visto' ) as $v ) {
    eq( bitacora_validar_resultado( array( 'resultado' => $v ) )['resultado'], $v, "$v se acepta" );
}
ok( es400( bitacora_validar_resultado( array( 'resultado' => 'quizá' ) ) ), 'valor fuera de lista: 400' );
ok( es400( bitacora_validar_resultado( array( 'resultado' => array( 'visto' ) ) ) ), 'no-cadena: 400' );
ok( es400( bitacora_validar_resultado( array( 'resultado' => 'VISTO' ) ) ), 'mayúsculas: 400 (comparación estricta)' );

echo "\nmotivo (criterios 3 a 5):\n";
foreach ( array( 'nubes', 'contaminacion', 'luna', 'bajo', 'seeing', 'apertura', 'no_localizado', 'otro' ) as $mo ) {
    eq( bitacora_validar_resultado( array( 'resultado' => 'no_visto', 'motivo_no_visto' => $mo ) )['motivo_no_visto'], $mo, "motivo $mo se acepta" );
}
ok( es400( bitacora_validar_resultado( array( 'resultado' => 'no_visto', 'motivo_no_visto' => 'aburrimiento' ) ) ), 'motivo fuera de lista: 400' );
ok( es400( bitacora_validar_resultado( array( 'resultado' => 'visto', 'motivo_no_visto' => 'aburrimiento' ) ) ), 'motivo inválido: 400 también con visto' );
eq( bitacora_validar_resultado( array( 'resultado' => 'visto', 'motivo_no_visto' => 'nubes' ) )['motivo_no_visto'], null, 'visto: motivo a NULL aunque llegue informado' );
eq( bitacora_validar_resultado( array( 'resultado' => 'no_visto' ) )['motivo_no_visto'], null, 'no visto sin motivo: se acepta' );
eq( bitacora_validar_resultado( array( 'resultado' => 'detectado_no_visto', 'motivo_no_visto' => '' ) )['motivo_no_visto'], null, 'motivo vacío: NULL' );

echo "\ncableado (POST y PUT pasan por el validador, que devuelve los campos):\n";
$vd = sacar( $fuente, 'bitacora_validar_datos' );
ok( false !== strpos( $vd, 'bitacora_validar_resultado( $d )' ), 'bitacora_validar_datos llama al validador del resultado' );
ok( false !== strpos( $vd, "'resultado'          => \$res['resultado']" ) && false !== strpos( $vd, "'motivo_no_visto'    => \$res['motivo_no_visto']" ),
    'la lista blanca del return incluye resultado y motivo_no_visto' );

echo $fallos ? "\n$fallos FALLO(S)\n" : "\nTODO OK\n";
exit( $fallos ? 1 : 0 );
