<?php
/**
 * La regla «nombre de objeto → slug», en un solo sitio.
 *
 * Minúsculas y solo letras y números: «NGC 6826» -> «ngc6826», «Sh2-155» ->
 * «sh2155». Es la clave que agrupa las observaciones de un objeto y la fila del
 * catálogo del mapa; si dos caminos la calculan distinto, el mismo objeto acaba
 * duplicado. Las copias JS (mapa/js/grupo-local.js, via-lactea-buscador-indice.js,
 * registro/resources/js/bitacora-listado.js) deben dar lo mismo
 * (scripts/test_slug_objeto.php y scripts/test_slug_objeto.js).
 *
 * @param mixed $nombre Designación tal como la escribió quien registra.
 * @return string El slug; '' si no queda ni una letra ni un número.
 */
function bitacora_slug_objeto( $nombre ) {
    return strtolower( preg_replace( '/[^A-Za-z0-9]/', '', (string) $nombre ) );
}

/**
 * «Abell N» -> «PN A66 N», o '' si el nombre no es de esos. Sesame/SIMBAD
 * resuelve «Abell 12» como el cúmulo de galaxias ACO 12; en observación visual
 * nombra la planetaria del catálogo de 1966 (N <= 86). Debe dar lo mismo que
 * BitacoraBase.aliasAbell (resources/js/bitacora-base.js); la tabla de casos es
 * scripts/fixtures/alias_abell.json. Quien quiera el cúmulo escribe «ACO N».
 *
 * @param mixed $nombre Designación tal como la escribió quien registra.
 * @return string La designación inequívoca; '' si no hay alias.
 */
function bitacora_alias_abell( $nombre ) {
    if ( ! preg_match( '/^A(?:bell)?\s*0*(\d{1,2})$/i', trim( (string) $nombre ), $m ) ) {
        return '';
    }
    $n = (int) $m[1];
    return ( $n >= 1 && $n <= 86 ) ? 'PN A66 ' . $n : '';
}
