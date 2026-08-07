<?php
/**
 * DISTANCIA AL SOL · de qué fuente sale y con qué nombre se pregunta
 *
 * Sin distancia no hay sitio en el mapa: la posición de un objeto es su
 * dirección (l, b) MÁS lo lejos que está. SIMBAD la sabe de muchos objetos,
 * pero su tabla de medidas (`mesDistance`) está vacía para buena parte de las
 * nebulosas y cúmulos galácticos —NGC 2024 no tiene ni una—, así que hace falta
 * una escalera de fuentes en vez de una sola.
 *
 * El orden es de más específico a más general:
 *   1. Las MEDIDAS de SIMBAD (mediana de todas las publicadas).
 *   2. La PARALAJE de SIMBAD, que vive en otra tabla y suele estar cuando las
 *      medidas no (NGC 2022, 0,4378 mas -> ~7450 años luz).
 *   3. VizieR (B/ocl, catálogo de cúmulos abiertos de Dias), en el plugin.
 *   4. La que escriba a mano el observador, que es lo único que cubre lo que
 *      ninguna base de datos sabe.
 *
 * Funciones PURAS, sin WordPress ni red: el test scripts/test_distancia_objeto.php
 * requiere este archivo tal cual. Las consultas viven en bitacora-registro.php.
 */

// Años luz por pársec. Con la paralaje en milisegundos de arco (mas), la
// distancia en pársecs es 1000/paralaje, de donde sale la constante de abajo.
if ( ! defined( 'BITACORA_AL_POR_PARSEC' ) ) {
    define( 'BITACORA_AL_POR_PARSEC', 3.2616 );
}

/**
 * La distancia en años luz que se le atribuye a un objeto, o null si no hay de
 * dónde sacarla.
 *
 * @param array      $medidas_al Distancias publicadas, YA en años luz (pueden ser cero).
 * @param float|null $plx_mas    Paralaje en milisegundos de arco, si SIMBAD la tiene.
 *
 * Con varias medidas se toma la MEDIANA, no la media: las distancias publicadas
 * de un mismo objeto se separan a veces por un factor 2 y una sola medida vieja
 * y disparatada no debe arrastrar al resto. La paralaje solo entra si no hay
 * ninguna medida, porque una medida publicada ya suele tenerla en cuenta.
 */
function bitacora_distancia_al( $medidas_al, $plx_mas = null ) {
    $medidas = array();
    foreach ( (array) $medidas_al as $d ) {
        // Una distancia negativa o nula no es una medida, es un hueco del catálogo.
        if ( is_numeric( $d ) && floatval( $d ) > 0 ) {
            $medidas[] = floatval( $d );
        }
    }

    if ( ! empty( $medidas ) ) {
        sort( $medidas );
        $n   = count( $medidas );
        $mid = intdiv( $n, 2 );
        $mediana = ( $n % 2 )
            ? $medidas[ $mid ]
            : ( $medidas[ $mid - 1 ] + $medidas[ $mid ] ) / 2.0;
        return round( $mediana );
    }

    // Una paralaje negativa es ruido de medida (las hay en Gaia para objetos
    // lejanos), y con ella la distancia saldría negativa: no vale como fuente.
    if ( is_numeric( $plx_mas ) && floatval( $plx_mas ) > 0 ) {
        return round( 1000.0 * BITACORA_AL_POR_PARSEC / floatval( $plx_mas ) );
    }

    return null;
}

/**
 * El nombre de un objeto tal como lo escriben los catálogos de VizieR: prefijo,
 * UN espacio y número, sin ceros a la izquierda ("ngc2024" -> "NGC 2024").
 *
 * El observador escribe el identificador a su manera y SIMBAD es tolerante,
 * pero los catálogos tabulados de VizieR no: allí la columna es texto y
 * "NGC2024" no casa con "NGC 2024". Devuelve '' si no reconoce la forma
 * prefijo+número, que es la única que se sabe traducir.
 */
function bitacora_nombre_catalogo( $identificador ) {
    $id = trim( (string) $identificador );
    if ( ! preg_match( '/^([A-Za-z]+)\s*0*(\d+)([A-Za-z]?)$/', $id, $m ) ) {
        return '';
    }
    return strtoupper( $m[1] ) . ' ' . $m[2] . strtoupper( $m[3] );
}
