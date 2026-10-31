<?php
declare(strict_types=1);
/* Test del equipo prestado (#499): qué observaciones se marcan y cuáles calibran.

   Dos capas, las dos EJECUTADAS (nada de buscar texto en el fuente):
   · la regla pura (`bitacora-equipo-prestado.php`), que se carga tal cual;
   · el anotador por lotes (`bitacora_anotar_equipo_prestado`), extraído del
     plugin y ejecutado contra un SQLite en memoria con las tablas reales.

   Las tres observaciones del AC 6: propia, prestada y de pieza desaparecida.

   Sin framework:  php scripts/test_equipo_prestado.php  */

$RAIZ   = dirname( __DIR__ );
$PLUGIN = $RAIZ . '/resources/plugins/bitacora-registro/';
require $PLUGIN . 'bitacora-equipo-prestado.php';

$fallos = 0;
function ok( $cond, $et ) {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}

// ── Regla pura ────────────────────────────────────────────────────────────────
$yo = 3; $b = 9;
$duenos = array( 'telescopio:1' => 3, 'telescopio:2' => 9, 'telescopio:3' => null, 'ocular:5' => 3, 'ocular:6' => 9 );

$r = bitacora_equipo_prestado( $yo, array( array( 'telescopio', 1 ), array( 'ocular', 5 ) ), $duenos );
ok( $r['calibra'] && ! $r['prestado'] && ! $r['no_disponible'], 'solo piezas propias: calibra como hoy (AC 3)' );

$r = bitacora_equipo_prestado( $yo, array( array( 'telescopio', 3 ), array( 'ocular', 5 ) ), $duenos );
ok( $r['calibra'], 'catálogo (usuario_id NULL) con pieza propia: calibra (AC 3)' );

$r = bitacora_equipo_prestado( $yo, array( array( 'telescopio', 2 ), array( 'ocular', 5 ) ), $duenos );
ok( ! $r['calibra'] && 1 === count( $r['prestado'] ) && 9 === $r['prestado'][0]['dueno_id'], 'telescopio de B: prestada y fuera (AC 1, 2)' );

$r = bitacora_equipo_prestado( $yo, array( array( 'telescopio', 1 ), array( 'ocular', 6 ) ), $duenos );
ok( ! $r['calibra'] && 'ocular' === $r['prestado'][0]['tipo'], 'ocular de B con telescopio propio: cada pieza se juzga por separado' );

$r = bitacora_equipo_prestado( $yo, array( array( 'telescopio', 1 ), array( 'ocular', 77 ) ), $duenos );
ok( ! $r['calibra'] && ! $r['prestado'] && array( array( 'tipo' => 'ocular', 'id' => 77 ) ) === $r['no_disponible'], 'pieza desaparecida: no se llama prestada y queda fuera (AC 2)' );

$r = bitacora_equipo_prestado( $yo, array(), $duenos );
ok( $r['calibra'], 'sin id de pieza (texto libre antiguo): no marca nada y calibra' );

$r = bitacora_equipo_prestado( 0, array( array( 'telescopio', 2 ) ), $duenos );
ok( $r['calibra'] && ! $r['prestado'], 'observación sin cuenta dueña: no hay con quién comparar, no se marca' );

// ── Anotador por lotes, contra SQLite ────────────────────────────────────────
function bitacora_nombre_tabla_entradas() { return 'wp_entradas'; }
function bitacora_nombre_tabla_telescopios() { return 'wp_tel'; }
function bitacora_nombre_tabla_oculares() { return 'wp_ocu'; }
function bitacora_nombre_tabla_auxiliares() { return 'wp_aux'; }
function get_userdata( $id ) { return 9 === $id ? (object) array( 'display_name' => 'Berta' ) : false; }

class WpdbSqlite {
    public $pdo;
    public $consultas = 0;
    public function __construct() {
        $this->pdo = new PDO( 'sqlite::memory:' );
        $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
        foreach ( array( 'wp_tel', 'wp_ocu', 'wp_aux' ) as $t ) {
            $this->pdo->exec( "CREATE TABLE $t ( id INTEGER PRIMARY KEY, usuario_id INTEGER )" );
        }
        $this->pdo->exec( 'CREATE TABLE wp_entradas ( id INTEGER PRIMARY KEY, observacion_id INTEGER, ocular_id INTEGER, auxiliar_id INTEGER, auxiliar2_id INTEGER )' );
        $this->pdo->exec( 'INSERT INTO wp_tel VALUES (1, 3), (2, 9), (3, NULL)' );
        $this->pdo->exec( 'INSERT INTO wp_ocu VALUES (5, 3), (6, 9)' );
        $this->pdo->exec( 'INSERT INTO wp_aux VALUES (8, 3)' );
        $this->pdo->exec( 'INSERT INTO wp_entradas VALUES (1, 10, 5, 8, NULL), (2, 11, 5, NULL, NULL), (3, 12, 77, NULL, NULL), (4, 13, 6, NULL, NULL)' );
    }
    public function get_results( $sql ) { $this->consultas++; return $this->pdo->query( $sql )->fetchAll( PDO::FETCH_OBJ ); }
}

function bitacora_equipo_tabla( $tipo ) {
    return array( 'telescopio' => bitacora_nombre_tabla_telescopios(), 'ocular' => bitacora_nombre_tabla_oculares(), 'auxiliar' => bitacora_nombre_tabla_auxiliares() )[ $tipo ] ?? null;
}
$fuente = file_get_contents( $PLUGIN . 'bitacora-registro.php' );
foreach ( array( 'bitacora_equipo_piezas', 'bitacora_anotar_equipo_prestado' ) as $fn ) {
    if ( ! preg_match( '/^function ' . $fn . '\(.*?^\}/ms', $fuente, $m ) ) { fwrite( STDERR, "No encuentro $fn()\n" ); exit( 1 ); }
    eval( $m[0] );
}

global $wpdb;
$wpdb = new WpdbSqlite();
$fila = function ( $id, $uid, $tel ) { return (object) array( 'id' => $id, 'usuario_id' => $uid, 'telescopio_id' => $tel ); };
$filas = array(
    $fila( 10, 3, 1 ),     // propia: telescopio 1 y ocular 5, auxiliar 8, todo de 3
    $fila( 11, 3, 2 ),     // prestada: telescopio de B (9)
    $fila( 12, 3, 1 ),     // pieza desaparecida: ocular 77
    $fila( 13, 3, 3 ),     // catálogo + ocular de B
    $fila( 14, 3, null ),  // sin telescopio ni entradas: texto libre
);
bitacora_anotar_equipo_prestado( $filas );
$por = array(); foreach ( $filas as $f ) { $por[ $f->id ] = $f; }

ok( true === $por[10]->calibra && array() === $por[10]->equipo_prestado, 'propia: calibra, sin marca' );
ok( false === $por[11]->calibra && 'Berta' === $por[11]->equipo_prestado[0]['de'] && 'telescopio' === $por[11]->equipo_prestado[0]['tipo'], 'prestada: fuera, con el nombre visible del dueño' );
ok( false === $por[12]->calibra && array() === $por[12]->equipo_prestado && 77 === $por[12]->equipo_no_disponible[0]['id'], 'pieza desaparecida: fuera y sin llamarla prestada' );
ok( false === $por[13]->calibra && 'ocular' === $por[13]->equipo_prestado[0]['tipo'], 'catálogo con ocular de B: prestada' );
ok( true === $por[14]->calibra, 'texto libre sin pieza: calibra' );
ok( 4 === $wpdb->consultas, 'cinco observaciones, cuatro consultas: entradas y una por tabla de piezas con datos' . ' [' . $wpdb->consultas . ']' );

$wpdb = new WpdbSqlite();
bitacora_anotar_equipo_prestado( array() );
ok( 0 === $wpdb->consultas, 'lista vacía: no consulta' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
