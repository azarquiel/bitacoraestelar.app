<?php
declare(strict_types=1);
/* Test de la VALIDACIÓN DEL SERVIDOR (#467): bitacora_validar_datos y
   bitacora_validar_entradas piden lo mismo que el formulario.

   Un caso por regla: fecha YYYY-MM-DD, seeing y Bortle con 400 (antes se
   descartaban), topes de las entradas iguales en PHP y JS, y la ficha que se
   siembra sale del mismo validador de astrometría. Las funciones REALES se
   sacan del plugin (cargarlo entero engancharía WordPress).

   Sin framework:  php scripts/test_validacion_servidor.php  */

class WP_Error {
    public $codigo; public $mensaje; public $datos;
    public function __construct( $codigo = '', $mensaje = '', $datos = array() ) {
        $this->codigo = $codigo; $this->mensaje = $mensaje; $this->datos = $datos;
    }
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function sanitize_text_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function wp_kses_post( $s ) { return (string) $s; }
function wp_strip_all_tags( $s ) { return strip_tags( (string) $s ); }
function esc_url_raw( $s ) { return (string) $s; }
function bitacora_identificador_objeto( $e, $t, $n ) { return $e; }
function bitacora_upsert_ficha( $id, $campos ) { $GLOBALS['ficha'] = $campos; return true; }

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
function sacar( string $fuente, string $nombre ): string {
    $desde = strpos( $fuente, "function $nombre(" );
    if ( false === $desde ) { echo "FALLA no se encuentra $nombre() en el plugin\n"; exit( 1 ); }
    return substr( $fuente, $desde, strpos( $fuente, "\n}\n", $desde ) - $desde + 3 );
}
foreach ( array( 'bitacora_validar_num', 'bitacora_validar_resultado', 'bitacora_fecha_valida', 'bitacora_validar_entero_opcional',
                 'bitacora_validar_astrometria', 'bitacora_sanitizar_url_https', 'bitacora_validar_datos', 'bitacora_validar_entradas',
                 'bitacora_sembrar_ficha_desde_registro' ) as $f ) {
    eval( sacar( $fuente, $f ) );
}
// Las constantes de los topes, tal como las define el plugin.
preg_match_all( "/define\( 'BITACORA_TOPE_(\w+)', (\d+) \)/", $fuente, $m, PREG_SET_ORDER );
foreach ( $m as $c ) { define( 'BITACORA_TOPE_' . $c[1], (int) $c[2] ); }

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }
function es400( $r ): bool { return is_wp_error( $r ) && 400 === $r->datos['status']; }

$base = array( 'objeto' => 'M42', 'observador' => 'Ana', 'ra' => 83.8, 'dec' => -5.4 );

echo "validar_datos:\n";
ok( ! is_wp_error( bitacora_validar_datos( $base ) ), 'datos mínimos: pasan' );
ok( es400( bitacora_validar_datos( array() ) ), 'sin datos: 400' );
ok( es400( bitacora_validar_datos( array_merge( $base, array( 'objeto' => '' ) ) ) ), 'falta el objeto: 400' );
ok( es400( bitacora_validar_datos( array_merge( $base, array( 'observador' => '' ) ) ) ), 'falta el observador: 400' );
ok( es400( bitacora_validar_datos( array_merge( $base, array( 'ra' => 400 ) ) ) ), 'RA fuera de rango: 400' );
eq( bitacora_validar_datos( array_merge( $base, array( 'fechaObservacion' => '2026-10-19' ) ) )['fecha_observacion'], '2026-10-19', 'fecha YYYY-MM-DD: se guarda' );
eq( bitacora_validar_datos( $base )['fecha_observacion'], '', 'sin fecha: se acepta (filas antiguas)' );
foreach ( array( '19/10/2026', '2026-1-9', '2026-02-30', '2026-13-01', 'ayer' ) as $mala ) {
    ok( es400( bitacora_validar_datos( array_merge( $base, array( 'fechaObservacion' => $mala ) ) ) ), "fecha «{$mala}»: 400" );
}
eq( bitacora_validar_datos( array_merge( $base, array( 'seeing' => 3 ) ) )['seeing'], 3, 'seeing 3: se guarda' );
eq( bitacora_validar_datos( array_merge( $base, array( 'seeing' => '' ) ) )['seeing'], null, 'seeing vacío: NULL' );
foreach ( array( 0, 6, 'x', 2.5 ) as $malo ) {
    ok( es400( bitacora_validar_datos( array_merge( $base, array( 'seeing' => $malo ) ) ) ), 'seeing ' . var_export( $malo, true ) . ': 400' );
}
eq( bitacora_validar_datos( array_merge( $base, array( 'cieloBortle' => '7' ) ) )['cielo_bortle'], 7, 'Bortle 7: se guarda' );
foreach ( array( 0, 10, 'x' ) as $malo ) {
    ok( es400( bitacora_validar_datos( array_merge( $base, array( 'cieloBortle' => $malo ) ) ) ), 'Bortle ' . var_export( $malo, true ) . ': 400' );
}
ok( es400( bitacora_validar_datos( array_merge( $base, array( 'cieloSqm' => 30 ) ) ) ), 'SQM fuera de rango: 400' );

echo "\nvalidar_entradas:\n";
$ent = array( 'aumento' => 100, 'campoReal' => 1.2, 'pupilaSalida' => 2.0, 'descripcion' => 'Se ve.' );
function entradas( array $cambios ) { global $ent; return bitacora_validar_entradas( array( array_merge( $ent, $cambios ) ) ); }
ok( ! is_wp_error( entradas( array() ) ), 'entrada correcta: pasa' );
ok( ! is_wp_error( bitacora_validar_entradas( array() ) ), 'sin entradas: válido' );
ok( es400( entradas( array( 'descripcion' => '' ) ) ), 'sin descripción: 400' );
ok( es400( entradas( array( 'aumento' => 0 ) ) ), 'aumento 0: 400' );
ok( ! is_wp_error( entradas( array( 'aumento' => BITACORA_TOPE_AUMENTO ) ) ), 'aumento en el tope: pasa' );
ok( es400( entradas( array( 'aumento' => BITACORA_TOPE_AUMENTO + 1 ) ) ), 'aumento sobre el tope: 400' );
ok( es400( entradas( array( 'campoReal' => 0 ) ) ), 'campo 0: 400' );
ok( es400( entradas( array( 'campoReal' => BITACORA_TOPE_CAMPO + 1 ) ) ), 'campo sobre el tope: 400' );
ok( es400( entradas( array( 'pupilaSalida' => BITACORA_TOPE_PUPILA + 1 ) ) ), 'pupila sobre el tope: 400' );
ok( ! is_wp_error( entradas( array( 'pupilaSalida' => null ) ) ), 'pupila vacía: pasa' );
ok( false !== strpos( entradas( array( 'aumento' => 99999 ) )->mensaje, (string) BITACORA_TOPE_AUMENTO ), 'el mensaje dice el tope' );

echo "\ntopes iguales en el formulario (JS):\n";
$js = (string) file_get_contents( __DIR__ . '/../registro/resources/js/bitacora-formulario.js' );
preg_match( '/var TOPES=\{aumento:(\d+), campo:(\d+), pupila:(\d+)\}/', $js, $t );
eq( array_map( 'intval', array_slice( $t, 1 ) ), array( BITACORA_TOPE_AUMENTO, BITACORA_TOPE_CAMPO, BITACORA_TOPE_PUPILA ), 'TOPES del JS = BITACORA_TOPE_* del PHP' );
ok( false !== strpos( $js, 'class="e-aumento" step="1" min="1" max="' . BITACORA_TOPE_AUMENTO . '"' ), 'el input de aumento lleva el tope' );
ok( false !== strpos( $js, 'class="e-pupila" step="0.1" min="0" max="' . BITACORA_TOPE_PUPILA . '"' ), 'el input de pupila lleva el tope' );

echo "\nsembrar_ficha_desde_registro (mismo validador de astrometría):\n";
$astro = array_merge( $base, array( 'lat' => 40.4, 'lon' => -3.7, 'objAlt' => 45, 'objAz' => 180, 'sunAlt' => -30, 'moonAlt' => -10,
                                    'fechaHoraLocal' => '2026-10-19 22:00', 'fechaHoraUTC' => '2026-10-19T20:00:00Z' ) );
$GLOBALS['ficha'] = null;
eq( bitacora_sembrar_ficha_desde_registro( 5, $astro ), true, 'astrometría válida: se siembra' );
eq( $GLOBALS['ficha']['obj_alt'], 45.0, 'la ficha lleva la altura validada' );
eq( $GLOBALS['ficha']['fecha_hora_utc'], '2026-10-19 20:00:00', 'la ficha lleva la hora UTC normalizada' );
$GLOBALS['ficha'] = null;
eq( bitacora_sembrar_ficha_desde_registro( 5, array_merge( $astro, array( 'lat' => 95 ) ) ), false, 'latitud fuera de rango: no se siembra' );
eq( $GLOBALS['ficha'], null, 'y no escribe la ficha' );
eq( bitacora_sembrar_ficha_desde_registro( 5, $base ), null, 'sin lat/lon: no hay ficha' );
eq( bitacora_sembrar_ficha_desde_registro( 5, array_merge( $astro, array( 'objAlt' => 200 ) ) ), false, 'altura fuera de rango: no se siembra' );

echo "\nlimpieza:\n";
ok( false === strpos( $fuente, 'bitacora_formatos_datos' ), 'bitacora_formatos_datos ya no existe' );

echo $fallos ? "\n$fallos FALLO(S)\n" : "\nTODO OK\n";
exit( $fallos ? 1 : 0 );
