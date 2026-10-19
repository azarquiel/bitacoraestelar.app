<?php
declare(strict_types=1);
/* Test de LA REGLA «NOMBRE DE OBJETO → SLUG» (bitacora_slug_objeto).

   Una sola función para todos los caminos del servidor, con la tabla de casos
   en scripts/fixtures/slug_objeto.json (la misma que lee test_slug_objeto.js).
   Además vigila que nadie vuelva a copiar la receta en el plugin: el caso
   «Sh2-155» acabó como dos objetos cuando POST /objetos usaba sanitize_key.

   Sin framework:  php scripts/test_slug_objeto.php  */

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-slug.php';

$fallos = 0;
function eq( $a, $b, $et ) {
    global $fallos;
    if ( $a === $b ) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export( $b, true ) . "\n         obtenido " . var_export( $a, true ) . "\n"; }
}

echo "tabla de casos:\n";
foreach ( json_decode( (string) file_get_contents( __DIR__ . '/fixtures/slug_objeto.json' ), true ) as $caso ) {
    eq( bitacora_slug_objeto( $caso[0] ), $caso[1], '"' . $caso[0] . '" -> "' . $caso[1] . '"' );
}
eq( bitacora_slug_objeto( null ), '', 'null -> ""' );

echo "alias Abell (scripts/fixtures/alias_abell.json):\n";
foreach ( json_decode( (string) file_get_contents( __DIR__ . '/fixtures/alias_abell.json' ), true ) as $caso ) {
    eq( bitacora_alias_abell( $caso[0] ), $caso[1], '"' . $caso[0] . '" -> "' . $caso[1] . '"' );
}

echo "sin copias de la receta en el plugin:\n";
foreach ( glob( __DIR__ . '/../resources/plugins/bitacora-registro/*.php' ) as $f ) {
    if ( 'bitacora-slug.php' === basename( $f ) ) { continue; }
    $src = (string) file_get_contents( $f );
    eq( false !== strpos( $src, "'/[^A-Za-z0-9]/'" ), false, basename( $f ) . ' no repite el preg_replace del slug' );
    eq( 1 === preg_match( '/sanitize_key\(\s*str_replace\(\s*\' \'/', $src ), false, basename( $f ) . ' no calcula el slug con sanitize_key' );
}

if ( $fallos ) { echo "\n$fallos fallo(s).\n"; exit( 1 ); }
echo "\nTodo bien.\n";
