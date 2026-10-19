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
