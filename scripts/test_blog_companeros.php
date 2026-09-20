<?php
declare(strict_types=1);
/* Test del BLOG DEL COMPAÑERO: el "planeta de origen" del observador y la
   crónica que escribe en él sobre una observación concreta.

   Dos mitades:
   1. El saneado real de las URLs (bitacora_sanitizar_url_https): solo https, y
      una URL rota no se guarda a medias. Es la misma función que ya vigila el
      audio, así que aquí se comprueba que el blog pasa por ella y no por un
      esc_url_raw() suelto que dejaría entrar http.
   2. El cableado: la migración crea las columnas, el validador devuelve sus dos
      campos, datos.js las emite al mapa y el panel del admin guarda la del
      observador con el saneado estricto.

   No hay WordPress: se le ponen postizos a las dos funciones que usa.

   Sin framework:  php scripts/test_blog_companeros.php  */

// ── Postizos de WordPress ────────────────────────────────────────────────────
function esc_url_raw( $url ) {
    $u = trim( (string) $url );
    // Bastante para el test: se aceptan http/https bien formadas, nada más.
    return preg_match( '#^https?://[^\s<>"]+$#i', $u ) ? $u : '';
}
function wp_strip_all_tags( $s ) { return strip_tags( (string) $s ); }

$plugin = __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-registro.php';
$fuente = (string) file_get_contents( $plugin );

// La función REAL se saca del plugin (cargarlo entero engancharía WordPress).
$desde = strpos( $fuente, 'function bitacora_sanitizar_url_https(' );
if ( false === $desde ) {
    echo "FALLA no se encuentra bitacora_sanitizar_url_https() en el plugin\n";
    exit( 1 );
}
$hasta = strpos( $fuente, "\n}\n", $desde );
eval( substr( $fuente, $desde, $hasta - $desde + 3 ) );

$fallos = 0;
function eq( $a, $b, string $et ): void {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}
function ok( $a, string $et ): void { eq( (bool) $a, true, $et ); }

echo "saneado de la URL del blog (la misma regla que el audio):\n";
eq( bitacora_sanitizar_url_https( 'https://elcielodeisra.example/m13' ), 'https://elcielodeisra.example/m13',
    'https válida: se guarda tal cual' );
eq( bitacora_sanitizar_url_https( '  https://blog.example/cronica  ' ), 'https://blog.example/cronica',
    'los espacios de pegar la URL no cuentan' );
eq( bitacora_sanitizar_url_https( 'http://blog.example/cronica' ), '',
    'http: se rechaza (avisaría de inseguro al visitante que llega)' );
eq( bitacora_sanitizar_url_https( 'javascript:alert(1)' ), '',
    'javascript: no es una URL de blog' );
eq( bitacora_sanitizar_url_https( '' ), '', 'vacía: vacía' );

echo "\ncableado (columnas, validador, datos.js y panel del admin):\n";

$esquema = substr( $fuente, strpos( $fuente, 'function bitacora_crear_tabla(' ) );
$esquema = substr( $esquema, 0, strpos( $esquema, "\nfunction " ) );
ok( false !== strpos( $esquema, "\$tabla_observadores, 'blog_url'" ),
    'la migración añade blog_url al observador (su planeta de origen)' );
ok( false !== strpos( $esquema, "\$tabla, 'blog_post_url'" ),
    'la migración añade blog_post_url a la observación' );
ok( false !== strpos( $esquema, "\$tabla, 'blog_post_titulo'" ),
    'la migración añade blog_post_titulo a la observación' );

$validar = substr( $fuente, strpos( $fuente, 'function bitacora_validar_datos(' ) );
$validar = substr( $validar, 0, strpos( $validar, "\n}\n" ) );
ok( false !== strpos( $validar, "bitacora_sanitizar_url_https( \$d['blogPostUrl'] )" ),
    'la URL de la crónica pasa por el saneado estricto' );
ok( false !== strpos( $validar, "'blog_post_url'      => \$blog_post_url," ),
    'el validador devuelve blog_post_url (lo que se inserta en la tabla)' );
ok( false !== strpos( $validar, "'blog_post_titulo'   => \$blog_post_titulo," ),
    'el validador devuelve blog_post_titulo' );
ok( false !== strpos( $validar, "'' !== \$blog_post_url && isset( \$d['blogPostTitulo'] )" ),
    'sin URL no hay crónica: el título suelto se descarta con ella' );

$datos_js = substr( $fuente, strpos( $fuente, 'function bitacora_datos_js(' ) );
$datos_js = substr( $datos_js, 0, strpos( $datos_js, "\n}\n" ) );
ok( false !== strpos( $datos_js, "\$observadores[ \$o->clave ]['blog'] = \$o->blog_url;" ),
    'datos.js emite el blog del observador en OBSERVADORES' );
ok( false !== strpos( $datos_js, "\$registro['blog'] = array(" ),
    'datos.js emite la crónica de la observación' );
ok( false !== strpos( $datos_js, "if ( ! empty( \$ob->blog_post_url ) )" ),
    'sin URL no se emite nada: el mapa distingue "sin crónica" sin mirar cadenas' );

$panel = substr( $fuente, strpos( $fuente, 'function bitacora_panel_observadores(' ) );
$panel = substr( $panel, 0, strpos( $panel, "\n}\n" ) );
ok( false !== strpos( $panel, "\$_POST['bitacora_blog_url']" ) &&
    false !== strpos( $panel, 'bitacora_sanitizar_url_https( $blog_crudo )' ),
    'el admin guarda el blog del observador con el mismo saneado estricto' );
ok( false !== strpos( $panel, "\$campos['blog_url'] = \$blog_url;" ),
    'el admin escribe la columna blog_url' );
ok( false !== strpos( $panel, "'' !== \$blog_crudo && '' === \$blog_url" ),
    'una URL que no pasa el saneado NO se guarda vacía: borraría el blog que ya tenía' );
ok( false !== strpos( $panel, 'notice-error' ),
    'y se dice por qué, en vez de dejar el planeta apagado sin explicación' );

echo "\nel mapa pinta el planeta y el pie de la ficha:\n";
$app = (string) file_get_contents( __DIR__ . '/../mapa/js/via-lactea-app.js' );
ok( false !== strpos( $app, 'function pintarPlanetaOrigen(' ),
    'el mapa enciende/apaga el planeta junto al selector de observador' );
ok( false !== strpos( $app, 'function renderFichaBlog(' ),
    'la ficha tiene pie de crónica' );
ok( false !== strpos( $app, 'renderFichaBlog({});' ),
    'la pantalla de descubrimiento limpia el pie (es de UNA observación)' );
$html = (string) file_get_contents( __DIR__ . '/../mapa/mapa.html' );
ok( false !== strpos( $html, 'id="mw-planeta"' ), 'mapa.html trae el planeta de la consola' );
ok( false !== strpos( $html, 'id="ficha-blog"' ), 'mapa.html trae el pie de la ficha' );
ok( false !== strpos( $html, 'rel="noopener"' ), 'los enlaces salientes llevan noopener' );

$form = (string) file_get_contents( __DIR__ . '/../registro/resources/js/bitacora-formulario.js' );
ok( false !== strpos( $form, 'blogPostUrl:' ) && false !== strpos( $form, 'blogPostTitulo:' ),
    'el formulario manda los dos campos al servidor' );

if ( $fallos ) { echo "\n$fallos fallo(s).\n"; exit( 1 ); }
echo "\nTodo verde.\n";
