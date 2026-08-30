<?php
declare(strict_types=1);
/* Test de bitacora_observador_episodios (issue #178, ADR 0005).

   Sin feed_rss_url configurada: episodios vacío (el frontend pinta el aviso
   "no encontrado/configurado"). Con feed: cada item del feed se traduce a
   {titulo, episodioUrl, audioUrl}, tomando el MP3 del <enclosure>. Si
   fetch_feed() falla (WP_Error), episodios vacío en vez de romper la
   petición.

   Sin WordPress real: mismos stubs mínimos que test_filtros_csv.php (el
   plugin solo llama a add_action/register_activation_hook al cargarse) más
   un fetch_feed() de mentira.

   Sin framework:  php scripts/test_observador_episodios.php  */

define('ABSPATH', sys_get_temp_dir() . '/bitacora_test_stub/wp-includes/../');
if (!is_dir(ABSPATH . 'wp-includes')) { mkdir(ABSPATH . 'wp-includes', 0777, true); }
define('WPINC', 'wp-includes');
file_put_contents(ABSPATH . WPINC . '/feed.php', '<?php // stub de test, fetch_feed() ya está definida');

function add_action(...$a) {}
function register_activation_hook(...$a) {}

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';

// ── Postizos de WordPress que SÍ se ejecutan ────────────────────────────────
class WP_Error {
    public $mensaje;
    public function __construct($codigo = '', $mensaje = '') { $this->mensaje = $mensaje; }
}
function is_wp_error($x) { return $x instanceof WP_Error; }

class WP_REST_Response {
    public $data; public $status;
    public function __construct($data, $status = 200) { $this->data = $data; $this->status = $status; }
}
class WP_REST_Request implements ArrayAccess {
    private $params;
    public function __construct($params) { $this->params = $params; }
    public function offsetExists($o): bool { return isset($this->params[$o]); }
    public function offsetGet($o): mixed { return $this->params[$o] ?? null; }
    public function offsetSet($o, $v): void { $this->params[$o] = $v; }
    public function offsetUnset($o): void { unset($this->params[$o]); }
}

class FeedEnclosureFalsa {
    private $link;
    public function __construct($link) { $this->link = $link; }
    public function get_link() { return $this->link; }
}
class FeedItemFalso {
    private $titulo, $url, $mp3;
    public function __construct($titulo, $url, $mp3) { $this->titulo = $titulo; $this->url = $url; $this->mp3 = $mp3; }
    public function get_title() { return $this->titulo; }
    public function get_permalink() { return $this->url; }
    public function get_enclosure() { return $this->mp3 ? new FeedEnclosureFalsa($this->mp3) : null; }
}
class FeedFalso {
    private $items;
    public function __construct($items) { $this->items = $items; }
    public function get_items($offset, $limite) { return $this->items; }
}

// fetch_feed() de mentira, controlada por esta variable global.
$GLOBALS['fetch_feed_resultado'] = null;
function fetch_feed($url) { return $GLOBALS['fetch_feed_resultado']; }

// wpdb de mentira: get_var() lee feed_rss_url de una tabla en memoria.
class WpdbFalso {
    public $prefix = 'wp_';
    public $observadores;
    public function prepare($sql, ...$args) { return vsprintf(str_replace('%s', "'%s'", str_replace('%d', '%s', $sql)), $args); }
    public function get_var($sql) {
        foreach ($this->observadores as $clave => $feed) {
            if (strpos($sql, "'$clave'") !== false) { return $feed; }
        }
        return null;
    }
}
$GLOBALS['wpdb'] = new WpdbFalso();
$wpdb = $GLOBALS['wpdb'];
$wpdb->observadores = array('nestorgm' => 'https://ejemplo.test/feed.xml', 'sin-feed' => '');

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}

echo "sin feed_rss_url configurada:\n";
$r = bitacora_observador_episodios(new WP_REST_Request(array('clave' => 'sin-feed')));
eq($r->data['episodios'], array(), 'episodios vacío, sin llamar a fetch_feed');

echo "con feed_rss_url y episodios reales:\n";
$GLOBALS['fetch_feed_resultado'] = new FeedFalso(array(
    new FeedItemFalso('Episodio 87', 'https://ejemplo.test/ep87', 'https://cdn.test/ep87.mp3'),
    new FeedItemFalso('Episodio 86', 'https://ejemplo.test/ep86', null),
));
$r = bitacora_observador_episodios(new WP_REST_Request(array('clave' => 'nestorgm')));
eq(count($r->data['episodios']), 2, 'dos episodios');
eq($r->data['episodios'][0], array('titulo' => 'Episodio 87', 'episodioUrl' => 'https://ejemplo.test/ep87', 'audioUrl' => 'https://cdn.test/ep87.mp3'), 'episodio con enclosure');
eq($r->data['episodios'][1]['audioUrl'], '', 'sin enclosure -> audioUrl vacío, no rompe');

echo "fetch_feed() falla (WP_Error):\n";
$GLOBALS['fetch_feed_resultado'] = new WP_Error('feed', 'no se pudo leer');
$r = bitacora_observador_episodios(new WP_REST_Request(array('clave' => 'nestorgm')));
eq($r->data['episodios'], array(), 'episodios vacío en vez de romper la petición');

echo $fallos ? "\n$fallos FALLO(S).\n" : "\nTodo verde.\n";
exit($fallos ? 1 : 0);
