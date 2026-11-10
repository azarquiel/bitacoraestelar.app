<?php
declare(strict_types=1);
/* Test de datos.js (bitacora_datos_js), el fichero con el que arranca el mapa
   público: que el nº de consultas NO crezca con el nº de observaciones.

   Pedía la ficha, las entradas y las imágenes observación a observación: más de
   mil consultas por visita con unos cientos de observaciones, sin caché. Ahora
   se traen de una vez y se reparten en PHP. Aquí se comprueba eso y que lo que
   sale sigue siendo lo mismo (ficha, entradas en orden, imágenes de su entrada,
   borradas fuera).

   La función termina con exit, así que se ejecuta en un proceso hijo:
     php scripts/test_datos_js_consultas.php                 el test
     php scripts/test_datos_js_consultas.php hijo N [plugin] emite datos.js con N observaciones

   No hay WordPress ni MySQL: la función real, contra un SQLite en memoria.  */

if ( ( $argv[1] ?? '' ) === 'hijo' ) {
    $N      = (int) $argv[2];
    $PLUGIN = $argv[3] ?? dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-registro.php';

    foreach ( array( '' => 'obs', '_entradas' => 'ent', '_imagenes' => 'img', '_objetos' => 'obj',
                     '_observadores' => 'obr', '_fichas' => 'fic', '_telescopios' => 'tel', '_viajes' => 'via' ) as $sufijo => $t ) {
        eval( "function bitacora_nombre_tabla$sufijo() { return '$t'; }" );
    }
    function get_current_user_id() { return 0; }
    function wp_validate_auth_cookie( $c, $e ) { return 0; }
    function nocache_headers() {}
    function wp_json_encode( $d ) { return json_encode( $d, JSON_UNESCAPED_UNICODE ); }
    class WP_REST_Request {}
    require dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-slug.php';

    class WpdbCuenta {
        public $pdo;
        public $consultas = 0;
        public function __construct() {
            $this->pdo = new PDO( 'sqlite::memory:' );
            $this->pdo->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
        }
        public function prepare( $sql, ...$args ) {
            foreach ( $args as $a ) {
                $sql = preg_replace( '/%[dsf]/', is_int( $a ) ? (string) $a : "'" . str_replace( "'", "''", (string) $a ) . "'", $sql, 1 );
            }
            return $sql;
        }
        private function q( $sql ) { $this->consultas++; return $this->pdo->query( $sql ); }
        public function get_results( $sql ) { return $this->q( $sql )->fetchAll( PDO::FETCH_OBJ ); }
        public function get_row( $sql, $modo = null ) {
            $f = $this->q( $sql )->fetch( 'ARRAY_A' === $modo ? PDO::FETCH_ASSOC : PDO::FETCH_OBJ );
            return $f ? $f : null;
        }
        public function get_var( $sql ) { $v = $this->q( $sql )->fetchColumn(); return false === $v ? null : $v; }
    }
    define( 'ARRAY_A', 'ARRAY_A' );
    $wpdb = new WpdbCuenta();
    $p = $wpdb->pdo;
    $p->exec( 'CREATE TABLE obr ( id INTEGER PRIMARY KEY, clave TEXT, nombre TEXT, equipo TEXT, blog_url TEXT, usuario_id INTEGER )' );
    $p->exec( 'CREATE TABLE obj ( id INTEGER PRIMARY KEY, slug TEXT, num INTEGER, nombre TEXT, etiqueta TEXT, color TEXT, ficha TEXT, coords_texto TEXT, top_x REAL, top_y REAL, edge_x REAL, edge_y REAL, gal_l REAL, gal_b REAL, dist_al REAL, bp_rp REAL, sp_type TEXT, tipo TEXT )' );
    $p->exec( 'CREATE TABLE obs ( id INTEGER PRIMARY KEY, objeto TEXT, observador_id INTEGER, telescopio TEXT, telescopio_id INTEGER, fecha_observacion TEXT, hora_observacion TEXT, default_index INTEGER, resultado TEXT, motivo_no_visto TEXT, cielo_bortle INTEGER, cielo_sqm REAL, audio_url TEXT, viaje_id INTEGER, borrada_en TEXT )' );
    $p->exec( 'CREATE TABLE ent ( id INTEGER PRIMARY KEY, observacion_id INTEGER, orden INTEGER, aumento REAL, campo_real REAL, pupila_salida REAL, boton TEXT, titulo TEXT, descripcion TEXT )' );
    $p->exec( 'CREATE TABLE img ( id INTEGER PRIMARY KEY, entrada_id INTEGER, orden INTEGER, tipo TEXT, imagen_url TEXT, etiqueta TEXT, pos TEXT, origen TEXT )' );
    $p->exec( 'CREATE TABLE fic ( id INTEGER PRIMARY KEY, observacion_id INTEGER, lugar TEXT, pdf TEXT, sqm REAL, ir REAL, temp REAL )' );
    $p->exec( 'CREATE TABLE tel ( id INTEGER PRIMARY KEY, nombre TEXT, vendor TEXT, modelo TEXT, apertura_mm REAL, focal_mm REAL, f_ratio REAL )' );
    $p->exec( 'CREATE TABLE via ( id INTEGER PRIMARY KEY, nombre TEXT, noche TEXT, observador_id INTEGER )' );
    $p->exec( "INSERT INTO obr VALUES (5, 'nestor', 'Néstor', NULL, '', 3)" );
    $p->exec( "INSERT INTO tel VALUES (7, 'El Faro', 'Skywatcher', 'Dobson 200', 200, 1200, 6)" );
    $p->exec( "INSERT INTO via VALUES (1, 'Noche larga', '2026-08-01', 5)" );
    for ( $i = 1; $i <= $N; $i++ ) {
        // Una de cada cuatro está en la papelera: ni ella ni lo suyo deben salir.
        $borrada = ( 0 === $i % 4 ) ? "'2026-09-01'" : 'NULL';
        $p->exec( "INSERT INTO obs VALUES ($i, 'M$i', 5, 'Dobson', 7, '2026-08-01', '22:" . sprintf( '%02d', $i % 60 ) . "', 0, 'visto', NULL, 3, 21.4, '', 1, $borrada)" );
        // Dos entradas, insertadas al revés que su orden.
        $e2 = $i * 10 + 2; $e1 = $i * 10 + 1;
        $p->exec( "INSERT INTO ent VALUES ($e2, $i, 1, 200, 0.4, 1.0, '', 'Ocular B de M$i', '<p>B$i</p>')" );
        $p->exec( "INSERT INTO ent VALUES ($e1, $i, 0, 70, 1.17, 2.9, '', 'Ocular A de M$i', '<p>A$i</p>')" );
        // La entrada A: dos principales (al revés que su orden) y un anexo. La B: una sin etiqueta.
        $p->exec( "INSERT INTO img (entrada_id, orden, tipo, imagen_url, etiqueta, pos, origen) VALUES
            ($e1, 1, 'principal', 'm{$i}_a2.webp', 'segunda', '', 'subida'),
            ($e1, 0, 'principal', 'm{$i}_a1.webp', 'primera', '', 'simulada'),
            ($e1, 0, 'anexo', 'm{$i}_anexo.webp', 'croquis', 'left', 'subida'),
            ($e2, 0, 'principal', 'm{$i}_b.webp', '', '', 'subida')" );
        if ( 0 === $i % 2 ) {
            $p->exec( "INSERT INTO fic (observacion_id, lugar, pdf, sqm, ir, temp) VALUES ($i, 'Lugar $i', 'https://e/f$i.pdf', 21.5, -20, 8)" );
        }
    }
    // Una ficha repetida para la 2: manda la primera, como antes.
    $p->exec( "INSERT INTO fic (observacion_id, lugar, pdf, sqm, ir, temp) VALUES (2, 'Repetida', '', NULL, NULL, NULL)" );

    $fuente = (string) file_get_contents( $PLUGIN );
    foreach ( array( 'bitacora_nave_visor', 'bitacora_lugar_visor', 'bitacora_boton_de_entrada', 'bitacora_orden_de_la_ruta',
                     'bitacora_observador_clave_de_usuario', 'bitacora_datos_js' ) as $fn ) {
        if ( ! preg_match( '/^function ' . $fn . '\(.*?^\}/ms', $fuente, $m ) ) {
            fwrite( STDERR, "No encuentro $fn() en el plugin\n" );
            exit( 2 );
        }
        eval( $m[0] );
    }
    register_shutdown_function( function () use ( $wpdb ) { echo "\n/*CONSULTAS " . $wpdb->consultas . "*/\n"; } );
    bitacora_datos_js( new WP_REST_Request() );
    exit;   // no se llega: la función termina la petición
}

// ── El test ──────────────────────────────────────────────────────────────────
$fallos = 0;
function ok( $cond, string $et ): void {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}
/** Ejecuta el hijo y devuelve array( consultas, OBSERVACIONES decodificado, salida ). */
function emitir( int $n ): array {
    $salida = (string) shell_exec( escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( __FILE__ ) . ' hijo ' . $n . ' 2>&1' );
    preg_match( '/\/\*CONSULTAS (\d+)\*\//', $salida, $c );
    preg_match( '/^var OBSERVACIONES = (.*);$/m', $salida, $o );
    return array( isset( $c[1] ) ? (int) $c[1] : -1, isset( $o[1] ) ? json_decode( $o[1], true ) : null, $salida );
}

list( $c8, $obs, $salida ) = emitir( 8 );
list( $c80 ) = emitir( 80 );
ok( is_array( $obs ), 'datos.js se emite y OBSERVACIONES es JSON' . ( is_array( $obs ) ? '' : "\n$salida" ) );
ok( $c8 > 0 && $c8 === $c80, "el nº de consultas no depende del nº de observaciones (8 → $c8, 80 → $c80)" );
ok( $c8 <= 12, "y son pocas ($c8)" );

ok( isset( $obs['m1'], $obs['m2'], $obs['m3'] ) && ! isset( $obs['m4'] ) && 6 === count( $obs ), 'las de la papelera no salen' );
$m2 = $obs['m2'][0];
ok( 'Lugar 2' === $m2['lugar'] && 'https://e/f2.pdf' === $m2['pdf'], 'cada observación lleva SU ficha (y de dos, la primera)' );
ok( '' === $obs['m1'][0]['pdf'], 'la que no tiene ficha sale sin ella' );
ok( array( 'Ocular A de M2', 'Ocular B de M2' ) === array_column( $m2['entries'], 'titulo' ), 'las entradas, en su orden' );
ok( 'tabs' === $m2['entries'][0]['imgMode']
    && array( 'm2_a1.webp', 'm2_a2.webp' ) === array_column( $m2['entries'][0]['img'], 'archivo' ), 'las imágenes de cada entrada, en su orden' );
ok( 'm2_anexo.webp' === $m2['entries'][0]['anexos'][0]['img'] && 'left' === $m2['entries'][0]['anexos'][0]['pos'], 'el anexo, en su entrada' );
ok( 'm2_b.webp' === $m2['entries'][1]['img'], 'una imagen sola sin etiqueta sale como cadena' );
ok( 'm3_b.webp' === $obs['m3'][0]['entries'][1]['img'], 'y ninguna imagen se cruza de observación' );
ok( array( 70.0, 200.0 ) === array_map( 'floatval', $m2['aumentos'] ), 'la horquilla de aumentos sale de sus entradas' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
