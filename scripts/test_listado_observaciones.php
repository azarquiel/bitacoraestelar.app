<?php
declare(strict_types=1);
/* Test del LISTADO de observaciones: que la consulta se ejecute y que traiga la
   ficha del telescopio de la flota.

   El listado pasó a acompañar cada observación con la fila de su telescopio
   (LEFT JOIN) para poder enseñar su NOMBRE PROPIO. Las dos tablas comparten
   nombres de columna (id, usuario_id, nombre, notas, creado_en), así que en
   cuanto hay JOIN cualquier columna del WHERE sin prefijo de tabla es AMBIGUA y
   el motor rechaza la consulta entera: el listado se queda vacío. Eso no se ve
   leyendo el SQL, hace falta un motor que lo ejecute.

   No hay WordPress ni MySQL: la función real se extrae del plugin y se ejecuta
   contra un SQLite en memoria con las dos tablas.

   Sin framework:  php scripts/test_listado_observaciones.php  */

$RAIZ   = dirname( __DIR__ );
$PLUGIN = $RAIZ . '/resources/plugins/bitacora-registro/bitacora-registro.php';

// ── Postizos de WordPress y del plugin ───────────────────────────────────────
function bitacora_nombre_tabla() { return 'wp_bitacora'; }
function bitacora_nombre_tabla_telescopios() { return 'wp_bitacora_telescopios'; }
function get_current_user_id() { return 3; }

class WP_REST_Request {
    private $p;
    public function __construct( array $p ) { $this->p = $p; }
    public function get_param( $k ) { return isset( $this->p[ $k ] ) ? $this->p[ $k ] : null; }
}
class WP_REST_Response {
    public $data;
    public function __construct( $d, $c = 200 ) { $this->data = $d; }
}

/** $wpdb de mentira que ejecuta de verdad: SQLite en memoria con las dos tablas
 *  que se cruzan, y con las columnas que ambas comparten (ahí está el peligro). */
class WpdbSqlite {
    public $pdo;
    public $error = '';
    public function __construct() {
        $this->pdo = new PDO( 'sqlite::memory:' );
        $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
        $this->pdo->exec( 'CREATE TABLE wp_bitacora (
            id INTEGER PRIMARY KEY, usuario_id INTEGER, observador_id INTEGER,
            viaje_id INTEGER, observador TEXT, objeto TEXT, telescopio TEXT,
            telescopio_id INTEGER, nombre TEXT, notas TEXT,
            creado_en TEXT, borrada_en TEXT, fecha_observacion TEXT,
            resultado TEXT, motivo_no_visto TEXT )' );
        $this->pdo->exec( 'CREATE TABLE wp_bitacora_telescopios (
            id INTEGER PRIMARY KEY, usuario_id INTEGER, vendor TEXT, modelo TEXT,
            nombre TEXT, optica TEXT, notas TEXT, creado_en TEXT )' );
        $this->pdo->exec( "INSERT INTO wp_bitacora_telescopios
            (id, usuario_id, vendor, modelo, nombre, optica, notas, creado_en)
            VALUES (7, 3, 'Skywatcher', 'Dobson 200', 'El Faro', 'newton', '', '2026-01-01')" );
        $this->pdo->exec( "INSERT INTO wp_bitacora
            (id, usuario_id, observador_id, viaje_id, observador, objeto, telescopio, telescopio_id, nombre, notas, creado_en, borrada_en)
            VALUES (1, 3, 5, 2, 'Nestor', 'M13', 'Skywatcher Dobson 200', 7, '', '', '2026-08-01', NULL)" );
        $this->pdo->exec( "INSERT INTO wp_bitacora
            (id, usuario_id, observador_id, viaje_id, observador, objeto, telescopio, telescopio_id, nombre, notas, creado_en, borrada_en)
            VALUES (2, 3, 5, 2, 'Nestor', 'M57', 'Celestron 114 antiguo', NULL, '', '', '2026-07-01', NULL)" );
        // Intentos fallidos (#400). M51: intento de marzo (confirmado en mayo),
        // y un intento ajeno (usuario 4) sin confirmar. M104: pendiente de verdad.
        $f = "INSERT INTO wp_bitacora (id, usuario_id, observador_id, objeto, creado_en, fecha_observacion, resultado, motivo_no_visto, borrada_en) VALUES ";
        $this->pdo->exec( $f . "(10, 3, 5, 'M51', '2026-03-01', '2026-03-01', 'no_visto', 'nubes', NULL),
            (11, 3, 5, 'M51', '2026-05-01', '2026-05-01', 'visto', NULL, NULL),
            (12, 3, 5, 'M104', '2026-04-01', '2026-04-01', 'detectado_no_visto', 'luna', NULL),
            (13, 4, 6, 'M81', '2026-04-02', '2026-04-02', 'no_visto', 'seeing', NULL),
            (14, 3, 5, 'M3', '2026-04-03', '2026-04-03', 'no_visto', 'otro', '2026-04-04')" );
    }
    public function prepare( $sql, ...$args ) {
        if ( 1 === count( $args ) && is_array( $args[0] ) ) { $args = $args[0]; }
        foreach ( $args as $a ) {
            $v = is_int( $a ) ? (string) $a : "'" . str_replace( "'", "''", (string) $a ) . "'";
            $sql = preg_replace( '/%[dsf]/', $v, $sql, 1 );
        }
        return $sql;
    }
    public function get_results( $sql ) {
        try {
            return $this->pdo->query( $sql )->fetchAll( PDO::FETCH_OBJ );
        } catch ( PDOException $e ) {
            // Igual que $wpdb: la consulta rota no devuelve filas. El motivo se
            // guarda para que el test pueda contarlo.
            $this->error = $e->getMessage();
            return array();
        }
    }
}

// ── La función real, tal cual está en el plugin ──────────────────────────────
$fuente = file_get_contents( $PLUGIN );
if ( ! preg_match( '/^function bitacora_listar_observaciones\(.*?^\}/ms', $fuente, $m ) ) {
    fwrite( STDERR, "No encuentro bitacora_listar_observaciones() en el plugin\n" );
    exit( 1 );
}
eval( $m[0] );

// ── Comprobaciones ───────────────────────────────────────────────────────────
$fallos = 0;
function ok( $cond, $et ) {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}

global $wpdb;
$wpdb = new WpdbSqlite();
$filas = bitacora_listar_observaciones( new WP_REST_Request( array( 'mias' => '1' ) ) )->data;
ok( count( $filas ) === 5, 'con el filtro "mías" el listado trae las observaciones' . ( $wpdb->error ? ' [' . $wpdb->error . ']' : '' ) );

$wpdb = new WpdbSqlite();
$todas = bitacora_listar_observaciones( new WP_REST_Request( array() ) )->data;
ok( count( $todas ) === 6, 'sin filtro también' );

$wpdb = new WpdbSqlite();
$viaje = bitacora_listar_observaciones( new WP_REST_Request( array( 'mias' => '1', 'viaje' => '2', 'observador' => '5' ) ) )->data;
ok( count( $viaje ) === 2, 'con todos los filtros a la vez (viaje y observador)' );

$por_id = array();
foreach ( $todas as $f ) { $por_id[ (int) $f->id ] = $f; }
ok( isset( $por_id[1] ) && 'El Faro' === $por_id[1]->tel_nombre, 'el telescopio de la flota viaja con su nombre propio' );
ok( isset( $por_id[1] ) && 'Skywatcher' === $por_id[1]->tel_vendor && 'Dobson 200' === $por_id[1]->tel_modelo, 'y con vendor y modelo' );
ok( isset( $por_id[2] ) && null === $por_id[2]->tel_nombre, 'la observación vieja (sin flota) se sigue listando' );
ok( isset( $por_id[2] ) && 'Celestron 114 antiguo' === $por_id[2]->telescopio, 'conservando su texto libre' );

// ── #400: filtro «Explorado – no confirmado» ──────────────────────────────────
function ids( $d ) { $i = array_map( function ( $f ) { return (int) $f->id; }, $d ); sort( $i ); return $i; }
function nc( $p ) { global $wpdb; $wpdb = new WpdbSqlite(); return bitacora_listar_observaciones( new WP_REST_Request( $p ) )->data; }

$todos = nc( array( 'resultado' => 'no_confirmado' ) );
ok( ids( $todos ) === array( 10, 12, 13 ), 'no_confirmado: solo no_visto y detectado_no_visto vivos, de todos' . ( $wpdb->error ? ' [' . $wpdb->error . ']' : '' ) );
$mios = nc( array( 'resultado' => 'no_confirmado', 'mias' => '1' ) );
ok( ids( $mios ) === array( 10, 12 ), 'combinado con mias deja los míos' );
ok( ids( nc( array( 'resultado' => 'no_confirmado', 'observador' => '6' ) ) ) === array( 13 ), 'combinado con observador' );
$por = array(); foreach ( $mios as $f ) { $por[ (int) $f->id ] = $f; }
ok( true === $por[10]->confirmado_despues && false === $por[12]->confirmado_despues, 'el intento de marzo se marca confirmado después; el pendiente no' );
ok( ids( nc( array( 'resultado' => 'no_confirmado', 'mias' => '1', 'solo_pendientes' => '1' ) ) ) === array( 12 ), 'solo_pendientes oculta el ya confirmado' );
ok( 'luna' === $por[12]->motivo_no_visto && 'detectado_no_visto' === $por[12]->resultado, 'la fila lleva subtipo y motivo' );
ok( count( nc( array() ) ) === 6, 'sin el filtro, el listado normal no cambia' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
