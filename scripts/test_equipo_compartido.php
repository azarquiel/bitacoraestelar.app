<?php
declare(strict_types=1);
/* Test de la FLOTA COMPARTIDA (#494).

   1. Compartir con un usuario que existe: 201 y solo su nombre en la respuesta.
   2. No existe, mayúsculas distintas, el propio, entrada inválida: la MISMA respuesta.
   3. Compartir dos veces: 200 `ya-compartido`, sin fila duplicada.
   4. Revocar borra la fila; revocar a quien no comparto responde como «no existe».
   5. Listado en los dos sentidos.
   6. Límite de ritmo: 429 `limite-de-ritmo` con Retry-After.
   7. El destinatario no puede editar ni borrar las piezas del propietario (403).

   No hay WordPress: el código REAL de los manejadores se saca del plugin y se
   evalúa con un $wpdb de mentira.

   Sin framework:  php scripts/test_equipo_compartido.php  */

class WP_Error {
    public $codigo, $mensaje, $datos;
    public function __construct( $c = '', $m = '', $d = null ) { $this->codigo = $c; $this->mensaje = $m; $this->datos = $d; }
}
class WP_REST_Response {
    public $d, $s, $h;
    public function __construct( $d = null, $s = 200, $h = array() ) { $this->d = $d; $this->s = $s; $this->h = $h; }
}
class WP_REST_Request implements ArrayAccess {
    public $p;
    public function __construct( $p = array() ) { $this->p = $p; }
    public function get_param( $k ) { return $this->p[ $k ] ?? null; }
    public function get_json_params() { return $this->p; }
    public function offsetExists( $k ): bool { return isset( $this->p[ $k ] ); }
    public function offsetGet( $k ): mixed { return $this->p[ $k ]; }
    public function offsetSet( $k, $v ): void {}
    public function offsetUnset( $k ): void {}
}
function is_wp_error( $x ) { return $x instanceof WP_Error; }
function current_time( $t, $g = false ) { return '2026-10-24 22:00:00'; }
function get_current_user_id() { return $GLOBALS['yo']; }
function bitacora_nombre_tabla_equipo_compartido() { return 'comp'; }
function bitacora_nombre_tabla_telescopios() { return 'tel'; }
function bitacora_nombre_tabla_oculares() { return 'ocu'; }
function bitacora_nombre_tabla_auxiliares() { return 'aux'; }

$cache = array();
function get_transient( $k ) { return $GLOBALS['cache'][ $k ] ?? false; }
function set_transient( $k, $v, $ttl ) { $GLOBALS['cache'][ $k ] = $v; return true; }

// Usuarios: como MySQL, get_user_by('login') no distingue mayúsculas.
$USUARIOS = array( 5 => 'ana', 7 => 'beto', 9 => 'Carla' );
function get_user_by( $campo, $v ) {
    foreach ( $GLOBALS['USUARIOS'] as $id => $login ) {
        if ( strtolower( $login ) === strtolower( trim( $v ) ) ) { return (object) array( 'ID' => $id, 'user_login' => $login ); }
    }
    return false;
}

class WpdbFalso {
    public $users = 'usuarios';
    public $pares = array(), $piezas = array(), $escrituras = 0;
    public function prepare( $sql, ...$a ) {
        foreach ( $a as $v ) { $sql = preg_replace( '/%[ds]/', is_int( $v ) ? (string) $v : "'$v'", $sql, 1 ); }
        return $sql;
    }
    public function query( $sql ) {
        preg_match( '/^INSERT IGNORE INTO comp .* VALUES \((\d+), (\d+), /', $sql, $m );
        $k = $m[1] . '-' . $m[2];
        if ( isset( $this->pares[ $k ] ) ) { return 0; }
        $this->pares[ $k ] = true;
        return 1;
    }
    public function delete( $t, $w, $f = null ) {
        if ( 'comp' !== $t ) { $this->escrituras++; return 1; }
        $k = $w['propietario_id'] . '-' . $w['destinatario_id'];
        if ( ! isset( $this->pares[ $k ] ) ) { return 0; }
        unset( $this->pares[ $k ] );
        return 1;
    }
    public function get_col( $sql ) {
        preg_match( '/u\.ID = c\.(\w+) WHERE c\.(\w+) = (\d+)/', $sql, $m );
        $out = array();
        foreach ( array_keys( $this->pares ) as $k ) {
            list( $p, $d ) = array_map( 'intval', explode( '-', $k ) );
            if ( 'propietario_id' === $m[2] && $p === (int) $m[3] ) { $out[] = $GLOBALS['USUARIOS'][ $d ]; }
            if ( 'destinatario_id' === $m[2] && $d === (int) $m[3] ) { $out[] = $GLOBALS['USUARIOS'][ $p ]; }
        }
        sort( $out );
        return $out;
    }
    public function get_row( $sql ) {
        preg_match( '/FROM (\w+) WHERE id = (\d+)/', $sql, $m );
        $f = $this->piezas[ $m[1] ][ (int) $m[2] ] ?? null;
        return $f ? (object) $f : null;
    }
    public function update( $t, $d, $w ) { $this->escrituras++; return 1; }
}

$fuente = (string) file_get_contents( __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php' );
// Los límites, los del plugin: si cambian, el test los sigue.
preg_match_all( "/^define\\( 'BITACORA_COMPARTIR_\\w+', \\d+ \\);/m", $fuente, $defs );
foreach ( $defs[0] as $d ) { eval( $d ); }
foreach ( array(
    'bitacora_cupo', 'bitacora_equipo_compartido_cupo', 'bitacora_equipo_compartido_no_encontrado',
    'bitacora_equipo_compartido_destinatario', 'bitacora_equipo_compartido_listar',
    'bitacora_equipo_compartido_crear', 'bitacora_equipo_compartido_revocar',
    'bitacora_equipo_tabla', 'bitacora_equipo_esquema', 'bitacora_equipo_pieza_propia',
    'bitacora_equipo_editar', 'bitacora_equipo_borrar',
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
function mundo(): void {
    global $wpdb, $cache;
    $GLOBALS['yo'] = 5;
    $cache = array();
    $wpdb = new WpdbFalso();
}
// Lo que ve el cliente: estado, cuerpo y cabeceras.
function vista( $r ) { return array( $r->s, $r->d, $r->h ); }
function compartir( $u ) { return bitacora_equipo_compartido_crear( new WP_REST_Request( array( 'usuario' => $u ) ) ); }
function revocar( $u ) { return bitacora_equipo_compartido_revocar( new WP_REST_Request( array( 'usuario' => $u ) ) ); }
function listar() { return bitacora_equipo_compartido_listar( new WP_REST_Request() ); }

echo "compartir con un usuario que existe:\n";
mundo();
$r = compartir( 'beto' );
eq( $r->s, 201, '201' );
eq( $r->d, array( 'ok' => true, 'nombre' => 'beto' ), 'solo su nombre: ni id ni correo' );
eq( array_keys( $wpdb->pares ), array( '5-7' ), 'queda la fila propietario-destinatario' );

echo "respuestas que no permiten enumerar:\n";
mundo();
$no = compartir( 'nadie' );
eq( array( $no->s, $no->d['codigo'] ), array( 404, 'no-encontrado-o-no-permitido' ), 'no existe: 404 con código' );
eq( vista( compartir( 'ana' ) ), vista( $no ), 'el propio nombre: idéntica' );
eq( vista( compartir( 'Beto' ) ), vista( $no ), 'mayúsculas distintas: idéntica (nombre exacto)' );
eq( vista( compartir( '' ) ), vista( $no ), 'vacío: idéntica' );
eq( vista( compartir( str_repeat( 'x', 61 ) ) ), vista( $no ), 'más de 60 caracteres: idéntica' );
eq( vista( compartir( array( 'beto' ) ) ), vista( $no ), 'no es texto: idéntica' );
eq( vista( bitacora_equipo_compartido_crear( new WP_REST_Request() ) ), vista( $no ), 'sin usuario: idéntica' );
eq( $wpdb->pares, array(), 'no escribe nada' );

echo "compartir dos veces:\n";
mundo();
compartir( 'beto' );
$r = compartir( ' beto ' );
eq( array( $r->s, $r->d['ok'], $r->d['codigo'], $r->d['nombre'] ), array( 200, true, 'ya-compartido', 'beto' ), '200 ya-compartido, aviso y no error' );
eq( count( $wpdb->pares ), 1, 'sin fila duplicada' );

echo "revocar:\n";
mundo();
compartir( 'beto' );
compartir( 'Carla' );
$r = revocar( 'beto' );
eq( array( $r->s, $r->d ), array( 200, array( 'ok' => true, 'nombre' => 'beto' ) ), '200' );
eq( array_keys( $wpdb->pares ), array( '5-9' ), 'se borra solo esa fila' );
$no = revocar( 'nadie' );
eq( array( $no->s, $no->d['codigo'] ), array( 404, 'no-encontrado-o-no-permitido' ), 'no existe: 404 con código' );
eq( vista( revocar( 'beto' ) ), vista( $no ), 'existe pero no comparto con él: idéntica' );
eq( vista( revocar( 'ana' ) ), vista( $no ), 'el propio: idéntica' );
$GLOBALS['yo'] = 9;
eq( vista( revocar( 'ana' ) ), vista( $no ), 'el destinatario no puede revocar lo que le comparten' );
eq( array_keys( $wpdb->pares ), array( '5-9' ), 'y la fila sigue' );

echo "listado:\n";
mundo();
compartir( 'beto' );
compartir( 'Carla' );
$GLOBALS['yo'] = 7;
compartir( 'ana' );
$GLOBALS['yo'] = 5;
eq( listar()->d, array( 'comparto' => array( 'Carla', 'beto' ), 'conmigo' => array( 'beto' ) ), 'a quién comparto y quién comparte conmigo' );
$GLOBALS['yo'] = 9;
eq( listar()->d, array( 'comparto' => array(), 'conmigo' => array( 'ana' ) ), 'listas vacías como arrays' );

echo "límite de ritmo:\n";
mundo();
for ( $i = 0; $i < BITACORA_COMPARTIR_MAX; $i++ ) { compartir( 'nadie' ); }
$r = compartir( 'beto' );
eq( array( $r->s, $r->d['codigo'] ), array( 429, 'limite-de-ritmo' ), 'el intento N+1 da 429 aunque el nombre exista' );
eq( $r->h['Retry-After'] >= 1 && $r->h['Retry-After'] <= BITACORA_COMPARTIR_VENTANA, true, 'Retry-After con los segundos de espera' );
eq( $r->d['espera'], $r->h['Retry-After'], 'y el cuerpo los repite' );
eq( revocar( 'beto' )->s, 429, 'revocar comparte el cupo de escritura' );
eq( $wpdb->pares, array(), 'el bloqueado no escribe' );
eq( listar()->s, 200, 'leer tiene su propio cupo' );
for ( $i = 0; $i < BITACORA_COMPARTIR_LECTURA_MAX; $i++ ) { listar(); }
eq( listar()->d['codigo'] ?? null, 'limite-de-ritmo', 'que también se agota' );
$GLOBALS['yo'] = 7;
eq( compartir( 'ana' )->s, 201, 'el cupo es por usuario' );

echo "solo lectura para el destinatario:\n";
mundo();
compartir( 'beto' );
$wpdb->piezas = array( 'tel' => array( 3 => array( 'usuario_id' => '5', 'vendor' => 'Ana', 'modelo' => 'Dob 18' ) ) );
$GLOBALS['yo'] = 7;
$pieza = array( 'tipo' => 'telescopio', 'id' => 3, 'modelo' => 'Mío' );
eq( bitacora_equipo_editar( new WP_REST_Request( $pieza ) )->datos['status'] ?? null, 403, 'PUT de una pieza compartida: 403' );
eq( bitacora_equipo_borrar( new WP_REST_Request( $pieza ) )->datos['status'] ?? null, 403, 'DELETE de una pieza compartida: 403' );
eq( $wpdb->escrituras, 0, 'no escribe nada' );

echo $fallos ? "\n$fallos fallos\n" : "\ntodo ok\n";
exit( $fallos ? 1 : 0 );
