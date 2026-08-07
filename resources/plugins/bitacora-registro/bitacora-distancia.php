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
 * El orden va de la medida más directa a la más indirecta, y la última es la
 * mano del observador:
 *   1. Las MEDIDAS de SIMBAD (mediana de todas las publicadas).
 *   2. La PARALAJE de SIMBAD, que vive en otra tabla y suele estar cuando las
 *      medidas no (NGC 2022, 0,4378 mas -> ~7450 años luz).
 *   3. VizieR (B/ocl, catálogo de cúmulos abiertos de Dias).
 *   4. El OPEN ASTRONOMY CATALOG, que sabe la distancia de los transitorios y
 *      sus restos (M1, la Cangrejo, sale de ahí como SN 1054).
 *   5. NED, por CORRIMIENTO AL ROJO y solo si es lo bastante grande: es una
 *      estimación, no una medida, y solo vale lejos (ver la función).
 *   6. La que escriba a mano el observador, único recurso para lo que ninguna
 *      base de datos sabe (las nebulosas difusas galácticas, como NGC 2024).
 *
 * Funciones PURAS, sin WordPress ni red: el test scripts/test_distancia_objeto.php
 * requiere este archivo tal cual. Las consultas viven en bitacora-registro.php.
 */

// Años luz por pársec. Con la paralaje en milisegundos de arco (mas), la
// distancia en pársecs es 1000/paralaje, de donde sale la constante de abajo.
if ( ! defined( 'BITACORA_AL_POR_PARSEC' ) ) {
    define( 'BITACORA_AL_POR_PARSEC', 3.2616 );
}

// Un megapársec son un millón de pársecs: la unidad en la que dan la distancia
// tanto el Open Astronomy Catalog como la ley de Hubble.
if ( ! defined( 'BITACORA_AL_POR_MPC' ) ) {
    define( 'BITACORA_AL_POR_MPC', 1000000.0 * BITACORA_AL_POR_PARSEC );
}

// Constante de Hubble (km/s por Mpc) y velocidad de la luz (km/s). H0 es la
// palanca: se sigue midiendo y las estimaciones publicadas van de 67 a 74, así
// que las distancias que salgan de aquí tienen ese ~10% de holgura de partida.
if ( ! defined( 'BITACORA_H0' ) ) {
    define( 'BITACORA_H0', 70.0 );
}
if ( ! defined( 'BITACORA_C_KMS' ) ) {
    define( 'BITACORA_C_KMS', 299792.458 );
}

// Corrimiento al rojo por debajo del cual NO se estima la distancia con la ley
// de Hubble. Las galaxias cercanas se mueven por la gravedad de sus vecinas
// además de por la expansión, y esa velocidad propia (unos cientos de km/s) se
// come la señal: M104 tiene z = 0,00363, que por Hubble da ~51 millones de años
// luz cuando está a ~29. A partir de z = 0,01 (unos 40 Mpc) la expansión manda
// y el error baja al orden del 10%.
if ( ! defined( 'BITACORA_Z_MIN_HUBBLE' ) ) {
    define( 'BITACORA_Z_MIN_HUBBLE', 0.01 );
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

/**
 * Distancia en años luz que la ley de Hubble atribuye a un corrimiento al rojo,
 * o null si ese z no sirve para estimarla.
 *
 * La recesión de una galaxia lejana es proporcional a su distancia (v = H0·D),
 * así que D = c·z/H0. Cerca NO vale: la velocidad propia de la galaxia dentro de
 * su grupo es del mismo orden que la de expansión y el resultado se dispara (ver
 * BITACORA_Z_MIN_HUBBLE). Por eso esta fuente es la última antes de la mano: da
 * un orden de magnitud honesto de lo lejano, no una medida.
 */
function bitacora_distancia_por_redshift( $z ) {
    if ( ! is_numeric( $z ) ) {
        return null;
    }
    $z = floatval( $z );
    // Un z negativo es un objeto que se acerca (M31 lo hace): no es expansión.
    if ( $z < BITACORA_Z_MIN_HUBBLE ) {
        return null;
    }
    // ponytail: ley de Hubble lineal, sin corrección cosmológica. A z = 0,1 se
    // queda corta ~5% y crece a partir de ahí; si algún día se registran objetos
    // a z > 0,5, aquí va la distancia de luminosidad con parámetros ΛCDM.
    $mpc = BITACORA_C_KMS * $z / BITACORA_H0;
    return round( $mpc * BITACORA_AL_POR_MPC );
}

/**
 * Distancia en años luz que lee del JSON del Open Astronomy Catalog, o null.
 *
 * La respuesta viene envuelta en el nombre con el que respondió el catálogo (no
 * el que se preguntó), y la distancia es una lista de valores publicados en
 * megapársecs:  {"SN2011fe": {"lumdist": [{"value": "3.56"}]}}
 * Cuando no conoce el objeto responde {"message": "Event ... not found ..."}.
 * Con varios valores se queda con la mediana, por lo mismo que en SIMBAD.
 */
function bitacora_oac_dist_al_desde_json( $cuerpo ) {
    $datos = json_decode( (string) $cuerpo, true );
    if ( ! is_array( $datos ) ) {
        return null;
    }
    $medidas_al = array();
    foreach ( $datos as $entrada ) {
        if ( ! is_array( $entrada ) || ! isset( $entrada['lumdist'] ) || ! is_array( $entrada['lumdist'] ) ) {
            continue;
        }
        foreach ( $entrada['lumdist'] as $medida ) {
            $v = is_array( $medida ) && isset( $medida['value'] ) ? $medida['value'] : null;
            if ( is_numeric( $v ) ) {
                $medidas_al[] = floatval( $v ) * BITACORA_AL_POR_MPC;
            }
        }
    }
    return bitacora_distancia_al( $medidas_al );
}

/**
 * Corrimiento al rojo que lee del JSON de NED (servicio ObjectLookup), o null si
 * no lo trae (a los objetos galácticos no les corresponde ninguno).
 *
 * NED contesta con el objeto que ÉL prefiere para ese nombre, que a veces es una
 * designación de otro catálogo del mismo astro (M104 responde como la fuente de
 * radio de su núcleo). El z sigue siendo el bueno, así que se acepta; lo que no
 * se acepta es un z ausente o no numérico.
 */
function bitacora_ned_redshift_desde_json( $cuerpo ) {
    $datos = json_decode( (string) $cuerpo, true );
    if ( ! is_array( $datos ) || ! isset( $datos['Preferred']['Redshift']['Value'] ) ) {
        return null;
    }
    $z = $datos['Preferred']['Redshift']['Value'];
    return is_numeric( $z ) ? floatval( $z ) : null;
}
