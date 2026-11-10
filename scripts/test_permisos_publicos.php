<?php
declare(strict_types=1);
/* Test de dos permisos de rutas que cualquiera alcanza:

   · GET /viajes y GET /viajes/{id} son públicos, pero las coordenadas de la
     base solo viajan si quien mira puede ver esa base (dueño, pública o
     compartida). Una base privada no enseña dónde está.
   · POST /objetos no reescribe un objeto que ya está en el catálogo del mapa,
     salvo que lo pida un administrador.

   No hay WordPress ni MySQL: las funciones reales se extraen del plugin y se
   ejecutan contra un SQLite en memoria.

   Sin framework:  php scripts/test_permisos_publicos.php  */

$PLUGIN = dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-registro.php';

// ── Postizos de WordPress y del plugin ───────────────────────────────────────
$GLOBALS['uid']   = 0;
$GLOBALS['admin'] = false;
$GLOBALS['red']   = 0;
function get_current_user_id() { return $GLOBALS['uid']; }
function current_user_can( $c ) { return $GLOBALS['admin']; }
function sanitize_text_field( $t ) { return trim( (string) $t ); }
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function current_time( $t, $gmt = false ) { return '2026-11-09 00:00:00'; }
function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_viajes() { return 'viajes'; }
function bitacora_nombre_tabla_bases() { return 'bases'; }
function bitacora_nombre_tabla_base_compartida() { return 'base_comp'; }
function bitacora_nombre_tabla_objetos() { return 'objetos'; }
function bitacora_nombre_tabla_viaje_tripulacion() { return 'trip'; }
function bitacora_nombre_tabla_observadores() { return 'observadores'; }
function bitacora_nombre_tabla_entradas() { return 'entradas'; }
function bitacora_nombre_tabla_telescopios() { return 'telescopios'; }
function bitacora_nombre_tabla_oculares() { return 'oculares'; }
function bitacora_slug_objeto( $t ) { return preg_replace( '/[^a-z0-9]/', '', strtolower( (string) $t ) ); }
// Resolver en SIMBAD: si se llega aquí con un objeto que ya existe, se gastó red.
function bitacora_completar_objeto( $ident, $dist = null ) {
    $GLOBALS['red']++;
    return array( 'tipo' => 'galaxia', 'dist_al' => 1.0 );
}
function bitacora_estrella_existente( $calc ) { return null; }
function bitacora_guardar_objeto_fila( $slug, $fila ) {
    global $wpdb;
    $existe = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM objetos WHERE slug = %s', $slug ) );
    if ( $existe ) {
        $wpdb->pdo->exec( $wpdb->prepare( 'UPDATE objetos SET nombre = %s WHERE slug = %s', $fila['nombre'], $slug ) );
        return 'actualizado';
    }
    $wpdb->pdo->exec( $wpdb->prepare( 'INSERT INTO objetos (slug, nombre) VALUES (%s, %s)', $slug, $fila['nombre'] ) );
    return 'insertado';
}

class WP_Error {
    public $code;
    public function __construct( $c = '', $m = '', $d = array() ) { $this->code = $c; }
    public function add_data( $d ) {}
}
class WP_REST_Request implements ArrayAccess {
    private $p;
    public function __construct( array $p = array() ) { $this->p = $p; }
    public function get_param( $k ) { return isset( $this->p[ $k ] ) ? $this->p[ $k ] : null; }
    public function get_json_params() { return $this->p; }
    public function offsetExists( $k ): bool { return isset( $this->p[ $k ] ); }
    #[\ReturnTypeWillChange]
    public function offsetGet( $k ) { return $this->p[ $k ] ?? null; }
    public function offsetSet( $k, $v ): void { $this->p[ $k ] = $v; }
    public function offsetUnset( $k ): void { unset( $this->p[ $k ] ); }
}
class WP_REST_Response {
    public $data;
    public function __construct( $d, $c = 200 ) { $this->data = $d; }
}

/** $wpdb de mentira que ejecuta de verdad, sobre SQLite en memoria. */
class WpdbSqlite {
    public $pdo;
    public $error = '';
    public function __construct() {
        $this->pdo = new PDO( 'sqlite::memory:' );
        $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
        $this->pdo->exec( 'CREATE TABLE bases ( id INTEGER PRIMARY KEY, usuario_id INTEGER, nombre TEXT, lat REAL, lon REAL, altitud_m REAL, tz TEXT, visibilidad TEXT )' );
        $this->pdo->exec( 'CREATE TABLE base_comp ( base_id INTEGER, usuario_id INTEGER )' );
        $this->pdo->exec( 'CREATE TABLE viajes ( id INTEGER PRIMARY KEY, usuario_id INTEGER, observador_id INTEGER, base_id INTEGER, noche TEXT, nombre TEXT )' );
        $this->pdo->exec( 'CREATE TABLE obs ( id INTEGER PRIMARY KEY, viaje_id INTEGER, objeto TEXT, objeto_etiqueta TEXT, tipo TEXT, num INTEGER, fecha_observacion TEXT, hora_observacion TEXT, telescopio TEXT, telescopio_id INTEGER, resultado TEXT, borrada_en TEXT )' );
        $this->pdo->exec( 'CREATE TABLE objetos ( id INTEGER PRIMARY KEY, slug TEXT, nombre TEXT )' );
        $this->pdo->exec( 'CREATE TABLE trip ( viaje_id INTEGER, observador_id INTEGER )' );
        $this->pdo->exec( 'CREATE TABLE observadores ( id INTEGER PRIMARY KEY, nombre TEXT )' );
        $this->pdo->exec( 'CREATE TABLE entradas ( id INTEGER PRIMARY KEY, observacion_id INTEGER, ocular_id INTEGER )' );
        $this->pdo->exec( 'CREATE TABLE telescopios ( id INTEGER PRIMARY KEY, nombre TEXT, vendor TEXT, modelo TEXT )' );
        $this->pdo->exec( 'CREATE TABLE oculares ( id INTEGER PRIMARY KEY, vendor TEXT, modelo TEXT )' );
        // Bases del usuario 3: privada, pública y compartida con el 5.
        $this->pdo->exec( "INSERT INTO bases VALUES
            (1, 3, 'Casa',     40.1, -3.1, 700, 'Europe/Madrid', 'privada'),
            (2, 3, 'Mirador',  41.2, -2.2, 900, 'Europe/Madrid', 'publica'),
            (3, 3, 'La finca', 42.3, -1.3, 800, 'Europe/Madrid', 'seleccionada')" );
        $this->pdo->exec( 'INSERT INTO base_comp VALUES (3, 5)' );
        $this->pdo->exec( "INSERT INTO viajes VALUES
            (10, 3, NULL, 1, '2026-08-01', 'Desde casa'),
            (11, 3, NULL, 2, '2026-08-02', 'Desde el mirador'),
            (12, 3, NULL, 3, '2026-08-03', 'Desde la finca'),
            (13, 3, NULL, 0, '2026-08-04', 'Sin lugar')" );
        $this->pdo->exec( "INSERT INTO objetos VALUES (1, 'm31', 'Galaxia de Andrómeda')" );
    }
    public function prepare( $sql, ...$args ) {
        if ( 1 === count( $args ) && is_array( $args[0] ) ) { $args = $args[0]; }
        foreach ( $args as $a ) {
            $v = ( is_int( $a ) || is_float( $a ) ) ? (string) $a : "'" . str_replace( "'", "''", (string) $a ) . "'";
            $sql = preg_replace( '/%[dsf]/', $v, $sql, 1 );
        }
        return $sql;
    }
    private function q( $sql ) {
        // El GROUP_CONCAT del listado lleva ORDER BY y SEPARATOR (solo MySQL):
        // se cambia por NULL, la ruta de objetos no es lo que se prueba aquí.
        $sql = preg_replace( '/\( SELECT GROUP_CONCAT\(.*?\) AS objetos_ruta/s', 'NULL AS objetos_ruta', $sql );
        // CONCAT_WS tampoco existe en SQLite: los rótulos de equipo no se prueban aquí.
        $sql = preg_replace( "/CONCAT_WS\( ' ', (\S+), (\S+) \)/", "( $1 || ' ' || $2 )", $sql );
        try {
            return $this->pdo->query( $sql );
        } catch ( PDOException $e ) {
            $this->error = $e->getMessage();
            return null;
        }
    }
    public function get_results( $sql ) { $r = $this->q( $sql ); return $r ? $r->fetchAll( PDO::FETCH_OBJ ) : array(); }
    public function get_row( $sql ) { $r = $this->q( $sql ); $f = $r ? $r->fetch( PDO::FETCH_OBJ ) : false; return $f ? $f : null; }
    public function get_var( $sql ) { $r = $this->q( $sql ); $v = $r ? $r->fetchColumn() : false; return false === $v ? null : $v; }
    public function get_col( $sql ) { $r = $this->q( $sql ); return $r ? $r->fetchAll( PDO::FETCH_COLUMN ) : array(); }
}

// ── Las funciones reales, tal cual están en el plugin ────────────────────────
$fuente = file_get_contents( $PLUGIN );
foreach ( array( 'bitacora_base_legible', 'bitacora_viaje_obtener', 'bitacora_viajes_listar', 'bitacora_viaje_leer', 'bitacora_crear_objeto' ) as $fn ) {
    if ( ! preg_match( '/^function ' . $fn . '\(.*?^\}/ms', $fuente, $m ) ) {
        fwrite( STDERR, "No encuentro $fn() en el plugin\n" );
        exit( 1 );
    }
    eval( $m[0] );
}

$fallos = 0;
function ok( $cond, $et ) {
    global $fallos, $wpdb;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et" . ( $wpdb->error ? ' [' . $wpdb->error . ']' : '' ) . "\n"; }
}
/** Viajes del listado, por id, vistos por el usuario $uid (0 = anónimo). */
function listado( $uid ) {
    global $wpdb;
    $wpdb = new WpdbSqlite();
    $GLOBALS['uid'] = $uid;
    $por = array();
    foreach ( bitacora_viajes_listar( new WP_REST_Request() )->data as $f ) { $por[ (int) $f->id ] = $f; }
    return $por;
}
function ficha( $uid, $id ) {
    global $wpdb;
    $wpdb = new WpdbSqlite();
    $GLOBALS['uid'] = $uid;
    return bitacora_viaje_leer( new WP_REST_Request( array( 'id' => $id ) ) )->data;
}

// ── 1. La base de un viaje, según quién mire ─────────────────────────────────
$anon = listado( 0 );
ok( 4 === count( $anon ), 'el listado sigue siendo público: el anónimo ve los cuatro viajes' );
ok( null === $anon[10]->base, 'anónimo: la base privada no viaja' );
ok( ! isset( $anon[10]->base_lat ) && ! isset( $anon[10]->base_lon ), 'ni sus coordenadas sueltas' );
ok( 'Casa' === $anon[10]->base_nombre, 'el nombre del lugar sí (es la etiqueta del viaje)' );
ok( is_array( $anon[11]->base ) && 41.2 === (float) $anon[11]->base['lat'], 'anónimo: la base pública viaja con sus coordenadas' );
ok( null === $anon[12]->base, 'anónimo: la base compartida con otros no viaja' );
ok( null === $anon[13]->base, 'un viaje sin lugar sigue con base null' );

$dueno = listado( 3 );
ok( is_array( $dueno[10]->base ) && 40.1 === (float) $dueno[10]->base['lat'], 'dueño: su base privada viaja entera' );
ok( is_array( $dueno[12]->base ), 'dueño: y la compartida' );

$otro = listado( 5 );
ok( null === $otro[10]->base, 'otro usuario: la privada no' );
ok( is_array( $otro[12]->base ) && 42.3 === (float) $otro[12]->base['lat'], 'otro usuario: la que le comparten sí' );

ok( null === ficha( 0, 10 )->base, 'ficha del viaje, anónimo: base privada null' );
ok( null !== ficha( 0, 11 )->base && 41.2 === (float) ficha( 0, 11 )->base->lat, 'ficha del viaje, anónimo: base pública entera' );
ok( null !== ficha( 3, 10 )->base, 'ficha del viaje, dueño: su base privada' );

// ── 2. POST /objetos no pisa lo que ya está en el mapa ───────────────────────
function crear( $admin, $cuerpo ) {
    global $wpdb;
    $wpdb = new WpdbSqlite();
    $GLOBALS['uid'] = 5; $GLOBALS['admin'] = $admin; $GLOBALS['red'] = 0;
    return bitacora_crear_objeto( new WP_REST_Request( $cuerpo ) )->data;
}
$r = crear( false, array( 'id' => 'M31', 'name' => 'pisado' ) );
ok( 'existente' === $r['resultado'], 'usuario normal sobre un objeto que ya existe: «existente»' );
ok( 'Galaxia de Andrómeda' === $wpdb->get_var( "SELECT nombre FROM objetos WHERE slug = 'm31'" ), 'y la fila queda como estaba' );
ok( 0 === $GLOBALS['red'], 'sin gastar una consulta a SIMBAD' );

$r = crear( false, array( 'id' => 'M33', 'name' => 'Triángulo' ) );
ok( 'insertado' === $r['resultado'] && 'Triángulo' === $r['objeto']->nombre, 'usuario normal: un objeto nuevo sí se crea' );

$r = crear( true, array( 'id' => 'M31', 'name' => 'Andrómeda' ) );
ok( 'actualizado' === $r['resultado'] && 'Andrómeda' === $r['objeto']->nombre, 'el administrador conserva la actualización' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
