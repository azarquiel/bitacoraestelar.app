<?php
declare(strict_types=1);
/* Test del EQUIPO COMPARTIDO CONMIGO (#495).

   1. GET /equipo trae lo mío y, detrás, lo que me comparten, con `de` = nombre visible.
   2. Lo de quien no me comparte no aparece (tampoco si soy yo quien le comparte).
   3. Guardar con una pieza compartida conmigo: se acepta.
   4. Tras revocar, guardar una observación NUEVA con esa pieza: 403.
   5. Leer una observación antigua tras revocar o borrar: sin error, con su texto y la marca.
   6. Editar el resto de una observación cuya pieza ya no existe: se acepta.
   7. Las piezas compartidas son solo lectura para el destinatario.
   UX-1 `de` nunca lleva login ni correo. UX-2 orden total y estable.

   No hay WordPress: el código REAL se saca del plugin y se evalúa con un $wpdb
   de mentira.

   Sin framework:  php scripts/test_equipo_compartido_conmigo.php  */

class WP_Error {
    public $codigo, $mensaje, $datos;
    public function __construct( $c = '', $m = '', $d = null ) { $this->codigo = $c; $this->mensaje = $m; $this->datos = $d; }
}
class WP_REST_Response {
    public $d, $s;
    public function __construct( $d = null, $s = 200 ) { $this->d = $d; $this->s = $s; }
}
class WP_REST_Request implements ArrayAccess {
    public $json, $url;
    public function __construct( $json = array(), $url = array() ) { $this->json = $json; $this->url = $url; }
    public function get_json_params() { return $this->json; }
    public function offsetExists( $k ): bool { return isset( $this->url[ $k ] ); }
    public function offsetGet( $k ): mixed { return $this->url[ $k ]; }
    public function offsetSet( $k, $v ): void {}
    public function offsetUnset( $k ): void {}
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function current_time( $t, $g = false ) { return '2026-10-24 22:00:00'; }
function get_current_user_id() { return $GLOBALS['yo']; }
function sanitize_text_field( $v ) { return trim( (string) $v ); }
function bitacora_nombre_tabla() { return 'obs'; }
function bitacora_nombre_tabla_telescopios() { return 'tel'; }
function bitacora_nombre_tabla_oculares() { return 'ocu'; }
function bitacora_nombre_tabla_auxiliares() { return 'aux'; }
function bitacora_nombre_tabla_equipo_compartido() { return 'comp'; }

// Postizos de lo que NO se prueba aquí.
function bitacora_validar_datos( $p ) { return array( 'objeto' => 'M13', 'base_id' => 0, 'telescopio' => $p['telescopio'] ?? '', 'telescopio_id' => $p['telescopioId'] ?? null ); }
function bitacora_unificar_estrella( $d ) { return $d; }
function bitacora_validar_entradas( $l ) {
    return array_map( fn( $e ) => array( 'ocular_id' => $e['ocularId'] ?? null, 'auxiliar_id' => $e['auxiliarId'] ?? null, 'auxiliar2_id' => $e['auxiliar2Id'] ?? null ), $l );
}
function bitacora_clave_idem( $p ) { return ''; }
function bitacora_obtener( $id ) { return $GLOBALS['wpdb']->obs[ $id ] ?? null; }
function bitacora_puede_modificar( $o ) { return true; }
function bitacora_obtener_entradas( $id ) { return $GLOBALS['wpdb']->ent; }
function bitacora_error_paso( $p ) { return new WP_Error( 'error_bd', $p, array( 'status' => 500 ) ); }
function bitacora_en_transaccion( $c ) { $GLOBALS['escrituras']++; return $c(); }
function bitacora_escribir_dependientes( $id, $d, $u, $p, $e ) { return true; }
function bitacora_escribir_accesorios( $id, $d, $p ) { return array( 'aviso' => '', 'aviso_ficha' => '' ); }

// Usuarios con login, nombre visible y correo: el correo y el login no deben salir.
// 11 se llama igual que 7 a propósito (el orden desempata por id).
$USUARIOS = array(
    5  => array( 'user_login' => 'ana',   'display_name' => 'Ana García', 'user_email' => 'ana@x.es' ),
    7  => array( 'user_login' => 'beto',  'display_name' => 'Beto',       'user_email' => 'beto@x.es' ),
    9  => array( 'user_login' => 'carla', 'display_name' => 'Carla',      'user_email' => 'carla@x.es' ),
    11 => array( 'user_login' => 'beto2', 'display_name' => 'beto',       'user_email' => 'beto2@x.es' ),
);

class WpdbFalso {
    public $users = 'usuarios';
    public $piezas = array(), $pares = array(), $obs = array(), $ent = array();
    public $insert_id = 1;
    public function prepare( $sql, ...$a ) {
        foreach ( $a as $v ) { $sql = preg_replace( '/%[ds]/', is_int( $v ) ? (string) $v : "'$v'", $sql, 1 ); }
        return $sql;
    }
    // ¿propietario-destinatario?
    public function get_var( $sql ) {
        preg_match( '/FROM comp WHERE propietario_id = (\d+) AND destinatario_id = (\d+)/', $sql, $m );
        return isset( $this->pares[ $m[1] . '-' . $m[2] ] ) ? '1' : null;
    }
    public function get_row( $sql ) {
        preg_match( '/FROM (\w+) WHERE id = (\d+)/', $sql, $m );
        $f = $this->piezas[ $m[1] ][ (int) $m[2] ] ?? null;
        return $f ? (object) ( $f + array( 'id' => (int) $m[2] ) ) : null;
    }
    public function get_results( $sql ) {
        // Dueños que comparten conmigo, con todas las columnas de usuarios a mano.
        if ( preg_match( '/^SELECT (.*) FROM comp c JOIN usuarios u ON u\.ID = c\.propietario_id WHERE c\.destinatario_id = (\d+)$/', $sql, $m ) ) {
            $out = array();
            foreach ( array_keys( $this->pares ) as $k ) {
                list( $p, $d ) = array_map( 'intval', explode( '-', $k ) );
                if ( $d !== (int) $m[2] ) { continue; }
                $u = array( 'ID' => $p ) + $GLOBALS['USUARIOS'][ $p ];
                $fila = array();
                foreach ( array_map( 'trim', explode( ',', $m[1] ) ) as $col ) { $c = substr( $col, 2 ); $fila[ $c ] = $u[ $c ]; }
                $out[] = (object) $fila;
            }
            return $out;
        }
        // Piezas de una tabla por usuario_id = N o usuario_id IN (…). Sin ordenar: el orden de lo
        // ajeno lo pone el plugin; el de lo propio, MySQL (aquí, el de inserción).
        preg_match( '/FROM (\w+) WHERE usuario_id (?:= (\d+)|IN \(([\d,]+)\)|IS NULL)/', $sql, $m );
        $quien = isset( $m[3] ) ? array_map( 'intval', explode( ',', $m[3] ) ) : ( isset( $m[2] ) && '' !== $m[2] ? array( (int) $m[2] ) : array( null ) );
        $out = array();
        foreach ( $this->piezas[ $m[1] ] ?? array() as $id => $f ) {
            if ( in_array( null === $f['usuario_id'] ? null : (int) $f['usuario_id'], $quien, true ) ) { $out[] = (object) ( $f + array( 'id' => $id ) ); }
        }
        return $out;
    }
    public function insert( $t, $d ) { return 1; }
    public function update( $t, $d, $w ) { $GLOBALS['escrituras']++; return 1; }
    public function delete( $t, $w, $f = null ) { $GLOBALS['escrituras']++; return 1; }
}

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
foreach ( array(
    'bitacora_equipo_tabla', 'bitacora_equipo_esquema', 'bitacora_equipo_leer_todo', 'bitacora_equipo_personal',
    'bitacora_equipo_piezas', 'bitacora_equipo_pieza_usable', 'bitacora_piezas_no_disponibles', 'bitacora_validar_equipo_usable',
    'bitacora_guardar_observacion', 'bitacora_editar_observacion', 'bitacora_leer_observacion',
    'bitacora_equipo_pieza_propia', 'bitacora_equipo_editar', 'bitacora_equipo_borrar',
) as $f ) {
    if ( ! preg_match( '/^function ' . $f . '\(.*?^\}$/ms', $fuente, $m ) ) { echo "FALLA no se encuentra $f en el plugin\n"; exit( 1 ); }
    eval( $m[0] );
}

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
// Ana (5) tiene un telescopio; Beto (7), Carla (9) y el otro «beto» (11) tienen los suyos.
function mundo(): void {
    global $wpdb;
    $GLOBALS['yo'] = 5;
    $GLOBALS['escrituras'] = 0;
    $wpdb = new WpdbFalso();
    $wpdb->piezas = array(
        'tel' => array(
            1  => array( 'usuario_id' => null, 'vendor' => 'Sky-Watcher', 'modelo' => 'Dob 8' ),
            2  => array( 'usuario_id' => '5',  'vendor' => 'Celestron', 'modelo' => 'C8' ),
            31 => array( 'usuario_id' => '7',  'vendor' => 'Taurus', 'modelo' => 'T400' ),
            30 => array( 'usuario_id' => '7',  'vendor' => 'Obsession', 'modelo' => 'Dob 18' ),
            40 => array( 'usuario_id' => '9',  'vendor' => 'Lunt', 'modelo' => 'LS60' ),
            50 => array( 'usuario_id' => '11', 'vendor' => 'Meade', 'modelo' => 'LX200' ),
        ),
        'ocu' => array(
            33 => array( 'usuario_id' => '7', 'vendor' => 'TV', 'modelo' => 'Ethos 21' ),
            32 => array( 'usuario_id' => '7', 'vendor' => 'TV', 'modelo' => 'Ethos 21' ),
        ),
        'aux' => array( 34 => array( 'usuario_id' => '7', 'vendor' => 'TV', 'nombre' => 'Paracorr' ) ),
    );
}
function equipo() { return bitacora_equipo_personal( new WP_REST_Request() )->d; }
function ids( array $filas ) { return array_map( fn( $f ) => (int) $f->id, $filas ); }
function crear( array $p ) { return bitacora_guardar_observacion( new WP_REST_Request( $p ) ); }
function editar( array $p ) { return bitacora_editar_observacion( new WP_REST_Request( $p, array( 'id' => 10 ) ) ); }
function leer() { return bitacora_leer_observacion( new WP_REST_Request( array(), array( 'id' => 10 ) ) ); }

echo "1. B comparte con A: GET /equipo trae lo de A y lo de B, con `de`:\n";
mundo();
$wpdb->pares = array( '7-5' => true );
$e = equipo();
eq( ids( $e['telescopios'] ), array( 2, 30, 31 ), 'mis telescopios y luego los de Beto' );
eq( ids( $e['oculares'] ), array( 32, 33 ), 'oculares de Beto' );
eq( ids( $e['auxiliares'] ), array( 34 ), 'auxiliares de Beto' );
eq( property_exists( $e['telescopios'][0], 'de' ), false, 'lo mío no lleva `de`' );
eq( $e['telescopios'][1]->de, 'Beto', 'lo de Beto lleva su nombre visible' );

echo "UX-1. `de` es el nombre visible, nunca login ni correo:\n";
$json = json_encode( $e );
eq( str_contains( $json, 'beto@x.es' ) || str_contains( $json, '"beto"' ) || str_contains( $json, 'user_' ), false, 'ni correo ni login en la respuesta' );

echo "2. Sin compartir no veo nada ajeno:\n";
mundo();
eq( ids( equipo()['telescopios'] ), array( 2 ), 'solo lo mío' );
$wpdb->pares = array( '5-7' => true );
eq( ids( equipo()['telescopios'] ), array( 2 ), 'que yo comparta con Beto no me da lo suyo' );
eq( crear( array( 'telescopioId' => 30 ) )->codigo ?? null, 'pieza_no_usable', 'ni me deja usarlo' );
$wpdb->pares = array( '7-9' => true );
eq( ids( equipo()['telescopios'] ), array( 2 ), 'lo que Beto comparte con Carla no me llega' );

echo "UX-2. Orden total: propias, luego por dueño (nombre, id) y por modelo, id:\n";
mundo();
$wpdb->pares = array( '11-5' => true, '9-5' => true, '7-5' => true );
eq( ids( equipo()['telescopios'] ), array( 2, 30, 31, 50, 40 ), 'Beto(7), beto(11), Carla; dentro, por marca y modelo' );
eq( ids( equipo()['oculares'] ), array( 32, 33 ), 'dos oculares iguales desempatan por id' );
$wpdb->pares = array( '9-5' => true, '7-5' => true, '11-5' => true );
eq( ids( equipo()['telescopios'] ), array( 2, 30, 31, 50, 40 ), 'el orden de las filas de compartir no lo mueve' );

echo "3. Guardar con una pieza compartida conmigo:\n";
mundo();
$wpdb->pares = array( '7-5' => true );
eq( crear( array( 'telescopioId' => 30, 'entradas' => array( array( 'ocularId' => 32, 'auxiliarId' => 34 ) ) ) )->s, 201, 'telescopio, ocular y auxiliar de Beto: 201' );
eq( crear( array( 'telescopioId' => 2, 'entradas' => array( array( 'ocularId' => 32 ) ) ) )->s, 201, 'mezclar lo mío con lo de Beto: 201' );

echo "4. Revocado: guardar una observación NUEVA con la pieza de B da 403:\n";
mundo();
$wpdb->pares = array();
$r = crear( array( 'telescopioId' => 30 ) );
eq( array( $r->codigo ?? null, $r->datos['status'] ?? null ), array( 'pieza_no_usable', 403 ), '403 pieza_no_usable' );
eq( $GLOBALS['escrituras'], 0, 'no escribe nada' );

echo "5. Leer una observación antigua tras revocar o borrar:\n";
mundo();
$wpdb->pares = array( '7-5' => true );
$wpdb->obs[10] = (object) array( 'id' => 10, 'usuario_id' => '5', 'telescopio_id' => 30, 'telescopio' => 'Obsession Dob 18', 'borrada_en' => null );
$wpdb->ent = array( (object) array( 'ocular_id' => 32, 'auxiliar_id' => null, 'auxiliar2_id' => null ) );
eq( leer()->d->piezas_no_disponibles, array(), 'compartida aún: nada marcado' );
$wpdb->pares = array();
$r = leer();
eq( array( $r->s, $r->d->telescopio ), array( 200, 'Obsession Dob 18' ), 'revocado: 200 con su texto' );
eq( $r->d->piezas_no_disponibles, array( array( 'tipo' => 'telescopio', 'id' => 30, 'existe' => true ), array( 'tipo' => 'ocular', 'id' => 32, 'existe' => true ) ), 'revocado: marca «ya no disponible»' );
unset( $wpdb->piezas['tel'][30] );
$r = leer();
eq( array( $r->s, $r->d->telescopio ), array( 200, 'Obsession Dob 18' ), 'borrada: 200 con su texto' );
eq( $r->d->piezas_no_disponibles[0], array( 'tipo' => 'telescopio', 'id' => 30, 'existe' => false ), 'borrada: marca «Equipo no disponible»' );
$GLOBALS['yo'] = 7;
$wpdb->pares = array( '7-5' => true );
eq( count( leer()->d->piezas_no_disponibles ), 1, 'se juzga con el autor, no con quien lee' );

echo "6. Editar el resto de una observación cuya pieza ya no existe:\n";
$GLOBALS['yo'] = 5;
$wpdb->pares = array();
eq( editar( array( 'telescopioId' => 30, 'telescopio' => 'Obsession Dob 18', 'entradas' => array( array( 'ocularId' => 32 ) ) ) )->s, 200, '200' );

echo "7. Solo lectura para el destinatario:\n";
mundo();
$wpdb->pares = array( '7-5' => true );
$r = bitacora_equipo_editar( new WP_REST_Request( array( 'modelo' => 'Mío' ), array( 'tipo' => 'telescopio', 'id' => 30 ) ) );
eq( $r->datos['status'] ?? null, 403, 'editar una pieza de Beto: 403' );
$r = bitacora_equipo_borrar( new WP_REST_Request( array(), array( 'tipo' => 'ocular', 'id' => 32 ) ) );
eq( $r->datos['status'] ?? null, 403, 'borrar una pieza de Beto: 403' );
eq( $GLOBALS['escrituras'], 0, 'no escribe nada' );

echo $fallos ? "\n$fallos fallos\n" : "\ntodo ok\n";
exit( $fallos ? 1 : 0 );
