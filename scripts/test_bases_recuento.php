<?php
declare(strict_types=1);
/* Test del listado de bases (bitacora_bases_listar): los dos recuentos de cada
   base salen bien y NO cuestan una consulta por base.

   · n_filas: todas las observaciones vivas de la base (protege el borrado).
   · n_observaciones: solo las vistas (ranking y medalla, #396).
   Eran dos COUNT por base; ahora un GROUP BY para todas.

   No hay WordPress ni MySQL: la función real contra un SQLite en memoria.

   Sin framework:  php scripts/test_bases_recuento.php  */

function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_bases() { return 'bases'; }
function bitacora_nombre_tabla_base_compartida() { return 'bco'; }
function get_current_user_id() { return 3; }
function get_userdata( $id ) { return (object) array( 'display_name' => "Usuario $id" ); }
class WP_REST_Request {}
class WP_REST_Response { public $data; public function __construct( $d, $c = 200 ) { $this->data = $d; } }

class WpdbCuenta {
    public $pdo;
    public $consultas = 0;
    public function __construct( int $bases ) {
        $this->pdo = new PDO( 'sqlite::memory:' );
        $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
        $this->pdo->exec( 'CREATE TABLE bases ( id INTEGER PRIMARY KEY, usuario_id INTEGER, nombre TEXT, visibilidad TEXT )' );
        $this->pdo->exec( 'CREATE TABLE bco ( base_id INTEGER, usuario_id INTEGER )' );
        $this->pdo->exec( 'CREATE TABLE obs ( id INTEGER PRIMARY KEY, base_id INTEGER, resultado TEXT, borrada_en TEXT )' );
        for ( $i = 1; $i <= $bases; $i++ ) {
            $this->pdo->exec( "INSERT INTO bases VALUES ($i, 3, 'Base " . sprintf( '%03d', $i ) . "', 'privada')" );
        }
        // Base 1: tres vistas, un fallo, y dos en la papelera (una vista) que no cuentan.
        // Base 2: solo un fallo. Base 3: nada.
        $this->pdo->exec( "INSERT INTO obs (base_id, resultado, borrada_en) VALUES
            (1, 'visto', NULL), (1, 'visto', NULL), (1, 'visto', NULL), (1, 'no_visto', NULL),
            (1, 'visto', '2026-09-01'), (1, 'no_visto', '2026-09-01'),
            (2, 'detectado_no_visto', NULL)" );
    }
    public function prepare( $sql, ...$args ) {
        foreach ( $args as $a ) { $sql = preg_replace( '/%[ds]/', (string) intval( $a ), $sql, 1 ); }
        return $sql;
    }
    public function get_results( $sql ) { $this->consultas++; return $this->pdo->query( $sql )->fetchAll( PDO::FETCH_OBJ ); }
    public function get_var( $sql ) { $this->consultas++; $v = $this->pdo->query( $sql )->fetchColumn(); return false === $v ? null : $v; }
    public function get_col( $sql ) { $this->consultas++; return $this->pdo->query( $sql )->fetchAll( PDO::FETCH_COLUMN ); }
}

$fuente = (string) file_get_contents( dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-registro.php' );
foreach ( array( 'bitacora_base_compartidos', 'bitacora_nombre_usuario', 'bitacora_bases_listar' ) as $fn ) {
    if ( ! preg_match( '/^function ' . $fn . '\(.*?^\}/ms', $fuente, $m ) ) {
        fwrite( STDERR, "No encuentro $fn() en el plugin\n" );
        exit( 1 );
    }
    eval( $m[0] );
}

$fallos = 0;
function ok( $cond, string $et ): void {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}
function listar( int $bases ): array {
    global $wpdb;
    $wpdb = new WpdbCuenta( $bases );
    $por = array();
    foreach ( bitacora_bases_listar( new WP_REST_Request() )->data as $b ) { $por[ (int) $b->id ] = $b; }
    return $por;
}

$b = listar( 3 );
ok( 3 === count( $b ), 'salen las tres bases' );
ok( 4 === $b[1]->n_filas && 3 === $b[1]->n_observaciones, 'base con vistas y un fallo: 4 filas, 3 observaciones (la papelera no cuenta)' );
ok( 1 === $b[2]->n_filas && 0 === $b[2]->n_observaciones, 'base con solo un fallo: 1 fila (protege el borrado), 0 observaciones' );
ok( 0 === $b[3]->n_filas && 0 === $b[3]->n_observaciones, 'base sin observaciones: ceros, y enteros' );
ok( true === $b[1]->es_mia && array() === $b[1]->compartidos, 'el resto de la fila no cambia' );

// Las consultas que quedan por base son las de con quién se comparte (solo las
// propias); los recuentos ya no suman ninguna.
$c3 = $wpdb->consultas;
listar( 30 );
$c30 = $wpdb->consultas;
ok( $c30 - $c3 === 27, "los recuentos no cuestan consultas por base (3 bases → $c3, 30 → $c30: solo crece la de compartidos)" );

global $wpdb;
$wpdb = new WpdbCuenta( 0 );
ok( array() === bitacora_bases_listar( new WP_REST_Request() )->data, 'sin bases: lista vacía, sin consulta rota' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
