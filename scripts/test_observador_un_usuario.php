<?php
declare(strict_types=1);
/* Test de «un usuario, un observador» (bitacora_observador_id_desde_nombre).

   El catálogo de observadores se crea solo, por nombre, y cada fila se enlaza a
   la cuenta que la usa por primera vez. El fallo: quien registraba una
   observación con el nombre de un compañero se quedaba enlazado también a esa
   fila, y el mapa podía abrirse con las observaciones del compañero como «mías».
   La regla: una cuenta que ya tiene su observador no se queda con otro.

   No hay WordPress ni MySQL: la función real contra un SQLite en memoria.

   Sin framework:  php scripts/test_observador_un_usuario.php  */

function bitacora_nombre_tabla_observadores() { return 'obr'; }
function current_time( $t, $gmt = false ) { return '2026-11-09 00:00:00'; }
function sanitize_title( $s ) { return trim( (string) preg_replace( '/[^a-z0-9]+/', '-', strtolower( (string) $s ) ), '-' ); }

class WpdbSqlite {
    public $pdo;
    public $insert_id = 0;
    public function __construct() {
        $this->pdo = new PDO( 'sqlite::memory:' );
        $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
        $this->pdo->exec( 'CREATE TABLE obr ( id INTEGER PRIMARY KEY, clave TEXT UNIQUE, nombre TEXT, equipo TEXT, usuario_id INTEGER, creado_en TEXT )' );
    }
    public function prepare( $sql, ...$args ) {
        foreach ( $args as $a ) {
            $sql = preg_replace( '/%[dsf]/', is_int( $a ) ? (string) $a : "'" . str_replace( "'", "''", (string) $a ) . "'", $sql, 1 );
        }
        return $sql;
    }
    public function get_var( $sql ) { $v = $this->pdo->query( $sql )->fetchColumn(); return false === $v ? null : $v; }
    public function query( $sql ) { return $this->pdo->exec( $sql ); }
    public function insert( $tabla, $fila, $fmt = null ) {
        $cols = implode( ',', array_keys( $fila ) );
        $this->pdo->prepare( "INSERT INTO $tabla ($cols) VALUES (" . implode( ',', array_fill( 0, count( $fila ), '?' ) ) . ')' )
            ->execute( array_values( $fila ) );
        $this->insert_id = (int) $this->pdo->lastInsertId();
        return 1;
    }
}

$fuente = (string) file_get_contents( dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-registro.php' );
if ( ! preg_match( '/^function bitacora_observador_id_desde_nombre\(.*?^\}/ms', $fuente, $m ) ) {
    fwrite( STDERR, "No encuentro bitacora_observador_id_desde_nombre() en el plugin\n" );
    exit( 1 );
}
eval( $m[0] );

$fallos = 0;
function ok( $cond, string $et ): void {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}
/** usuario_id de la fila de ese nombre (null si no tiene). */
function de( string $nombre ) {
    global $wpdb;
    $v = $wpdb->get_var( $wpdb->prepare( 'SELECT usuario_id FROM obr WHERE nombre = %s', $nombre ) );
    return null === $v ? null : (int) $v;
}

global $wpdb;
$wpdb = new WpdbSqlite();

$isra = bitacora_observador_id_desde_nombre( 'Isra Pérez', 3 );
ok( 3 === de( 'Isra Pérez' ), 'la primera firma de una cuenta queda enlazada a ella' );
ok( $isra === bitacora_observador_id_desde_nombre( 'Isra Pérez', 3 ), 'y repetirla devuelve la misma fila' );

$ana = bitacora_observador_id_desde_nombre( 'Ana García', 3 );
ok( $ana > 0 && $ana !== $isra, 'firmar con el nombre de un compañero crea su fila' );
ok( null === de( 'Ana García' ), 'pero NO la enlaza a la cuenta que ya tiene su observador' );

$wpdb->pdo->exec( "INSERT INTO obr (clave, nombre, usuario_id) VALUES ('luis-ruiz', 'Luis Ruiz', NULL)" );
bitacora_observador_id_desde_nombre( 'Luis Ruiz', 3 );
ok( null === de( 'Luis Ruiz' ), 'ni se queda con una fila que ya existía sin dueño' );

bitacora_observador_id_desde_nombre( 'Ana García', 4 );
ok( 4 === de( 'Ana García' ), 'cuando Ana registra con su cuenta, su fila pasa a ser suya' );
bitacora_observador_id_desde_nombre( 'Ana García', 3 );
ok( 4 === de( 'Ana García' ) && 3 === de( 'Isra Pérez' ), 'y nadie pisa un enlace ya puesto' );

bitacora_observador_id_desde_nombre( 'Sin Cuenta', 0 );
ok( null === de( 'Sin Cuenta' ), 'sin usuario (compañero de un OAL) la fila nace sin enlazar' );
ok( null === bitacora_observador_id_desde_nombre( '  ', 3 ), 'un nombre vacío sigue sin crear nada' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
