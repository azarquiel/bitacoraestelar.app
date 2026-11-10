<?php
/**
 * Bitácora Registro · consultas a los catálogos astronómicos
 *
 * SIMBAD, Gaia (BP–RP), VizieR, Open Astronomy Catalog y NED: de aquí salen las
 * coordenadas, la distancia y el tipo con que bitacora_completar_objeto() sitúa
 * un objeto en el mapa. Toda la red del plugin vive en este fichero, con su
 * caché en transients y la regla que separa «no está» de «no respondió».
 *
 * Lo carga bitacora-registro.php; no es un plugin por sí mismo.
 */

// Impide el acceso directo al archivo.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * ¿La consulta a un catálogo falló por la red y no por el objeto? Lo es un
 * WP_Error (timeout, DNS), un 408 (timeout del servidor), un 429 (el servicio
 * nos frena) o un 5xx. Cualquier
 * otra respuesta es el catálogo contestando, y si no trae el objeto es que no
 * está. Es la ÚNICA regla que separa las dos cosas en las consultas de
 * bitacora_completar_objeto (issue #460).
 */
function bitacora_fallo_de_red( $respuesta ) {
    if ( is_wp_error( $respuesta ) ) {
        return true;
    }
    $codigo = (int) wp_remote_retrieve_response_code( $respuesta );
    return 408 === $codigo || 429 === $codigo || $codigo >= 500;
}

/**
 * Cachea que una consulta no dio resultado. Si el catálogo contestó «no está»,
 * 'nulo' durante un día; si falló la red, 'fallo' solo unos minutos, para que
 * un corte no deje el objeto sin distancia ni tipo 24 h. Los lectores tratan
 * cualquier valor no numérico como null.
 */
function bitacora_cachear_ausencia( $cache_key, $fallo_de_red ) {
    if ( $fallo_de_red ) {
        set_transient( $cache_key, 'fallo', BITACORA_TTL_FALLO_RED );
    } else {
        set_transient( $cache_key, 'nulo', DAY_IN_SECONDS );
    }
}

/**
 * Consulta SIMBAD (servicio TAP) por identificador y devuelve
 * array( 'ra', 'dec', 'dist_al', 'morph', 'otype', 'sp_type', 'gaia_dr3_id' ) o
 * null si no se encuentra o falla la red. La distancia es la mediana de las
 * medidas disponibles y, si no hay ninguna, la que da la paralaje (ver
 * bitacora_distancia_al). Se cachea 30 días por identificador para no repetir
 * peticiones.
 */
function bitacora_simbad( $identificador ) {
    // El mismo alias que aplica el navegador antes de Sesame: sin él, «Abell 12»
    // traía la distancia y el tipo del cúmulo ACO 12 con las coordenadas de la
    // planetaria.
    $id = trim( (string) $identificador );
    $id = bitacora_alias_abell( $id ) ?: $id;
    if ( '' === $id ) {
        return null;
    }
    // Versionada: si cambia la forma del array devuelto (nuevas claves como
    // sp_type o gaia_dr3_id) o lo que se consulta (alias Abell), subir esta
    // versión invalida de golpe la caché vieja en vez de dejar arrays a medias
    // 30 días sirviendo null.
    $cache_key = 'bitacora_simbad_v4_' . md5( strtolower( $id ) );
    $cache = get_transient( $cache_key );
    if ( false !== $cache ) {
        return is_array( $cache ) ? $cache : null;
    }

    // `plx_value` (paralaje, en mas) y `sp_type` (tipo espectral en texto) viajan
    // en la misma consulta: son gratis. `sp_type` alimenta el color de respaldo
    // (BitacoraGaiaColor.bpRpPorTipo) cuando la estrella no tiene fotometría de
    // Gaia (primarias muy brillantes, saturadas y fuera de catálogo).
    //
    // `g.id` es el identificador `Gaia DR3 <source_id>` que SIMBAD ya tiene
    // vinculado al objeto (#468): viaja en esta misma consulta en vez de pagar
    // una segunda ida y vuelta al mismo servicio. Es identidad, no posición, así
    // que en sistemas múltiples (Gamma Andromedae) no se engancha a la vecina.
    // Si SIMBAD no lo vinculó, ninguna búsqueda posicional del plugin acertará
    // mejor: bitacora_gaia_bprp() no la intenta.
    $adql = "SELECT b.ra, b.dec, b.morph_type, b.otype_txt, b.sp_type, d.dist, d.unit, b.plx_value, b.plx_err, g.id "
        . "FROM basic AS b JOIN ident AS i ON i.oidref = b.oid "
        . "LEFT JOIN mesDistance AS d ON d.oidref = b.oid "
        . "LEFT JOIN ident AS g ON g.oidref = b.oid AND g.id LIKE 'Gaia DR3%' "
        . "WHERE i.id = '" . str_replace( "'", "''", $id ) . "'";

    // CDS primero; si no contesta (se cuelga a veces), el espejo de CfA. Solo un
    // fallo de red o un 5xx pasa al siguiente: un 200 sin filas es «no está».
    $respuesta = null;
    foreach ( array(
        'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
        'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync',
    ) as $url ) {
        $respuesta = wp_remote_post(
            $url,
            array(
                'timeout' => 15,
                'body'    => array(
                    'request' => 'doQuery',
                    'lang'    => 'ADQL',
                    'format'  => 'csv',
                    'query'   => $adql,
                ),
            )
        );
        if ( ! is_wp_error( $respuesta ) && 200 === wp_remote_retrieve_response_code( $respuesta ) ) {
            break;
        }
    }
    if ( is_wp_error( $respuesta ) || 200 !== wp_remote_retrieve_response_code( $respuesta ) ) {
        bitacora_cachear_ausencia( $cache_key, bitacora_fallo_de_red( $respuesta ) );
        return null;
    }

    $csv = trim( wp_remote_retrieve_body( $respuesta ) );
    $lineas = preg_split( '/\r?\n/', $csv );
    if ( count( $lineas ) < 2 ) {
        bitacora_cachear_ausencia( $cache_key, false );
        return null;
    }
    array_shift( $lineas ); // cabecera

    $ra = null; $dec = null; $morph = ''; $otype = ''; $sp_type = ''; $plx = null; $plx_err = null;
    $gaia_dr3_id = null;
    $distancias_al = array();
    // Factores a años luz por unidad de SIMBAD.
    $a_al = array( 'pc' => 3.2616, 'kpc' => 3261.6, 'mpc' => 3261600.0, 'ly' => 1.0, 'al' => 1.0 );

    foreach ( $lineas as $linea ) {
        if ( '' === trim( $linea ) ) {
            continue;
        }
        $c = str_getcsv( $linea );
        if ( count( $c ) < 8 ) {
            continue;
        }
        if ( null === $ra && is_numeric( $c[0] ) ) {
            $ra = floatval( $c[0] );
            $dec = floatval( $c[1] );
        }
        if ( '' === $morph && '' !== trim( $c[2] ) ) {
            $morph = trim( $c[2] );
        }
        if ( '' === $otype && '' !== trim( $c[3] ) ) {
            $otype = trim( $c[3] );
        }
        if ( '' === $sp_type && '' !== trim( $c[4] ) ) {
            $sp_type = trim( $c[4] );
        }
        $dist = trim( $c[5] );
        $unidad = strtolower( trim( $c[6] ) );
        if ( is_numeric( $dist ) && isset( $a_al[ $unidad ] ) ) {
            $distancias_al[] = floatval( $dist ) * $a_al[ $unidad ];
        }
        if ( null === $gaia_dr3_id && isset( $c[9] ) && preg_match( '/^Gaia DR3 (\d+)$/', trim( $c[9] ), $m ) ) {
            $gaia_dr3_id = $m[1];
        }
        // La paralaje es del objeto, así que viene repetida en todas las filas.
        if ( null === $plx && is_numeric( $c[7] ) ) {
            $plx = floatval( $c[7] );
            $plx_err = ( isset( $c[8] ) && is_numeric( $c[8] ) ) ? floatval( $c[8] ) : null;
        }
    }

    $dist_al = bitacora_distancia_al( $distancias_al, $plx, $plx_err );

    if ( null === $ra ) {
        bitacora_cachear_ausencia( $cache_key, false );
        return null;
    }

    $resultado = array(
        'ra'          => $ra,
        'dec'         => $dec,
        'dist_al'     => $dist_al,
        'morph'       => $morph,
        'otype'       => $otype,
        'sp_type'     => $sp_type,
        'gaia_dr3_id' => $gaia_dr3_id,
    );
    set_transient( $cache_key, $resultado, 30 * DAY_IN_SECONDS );
    return $resultado;
}

/**
 * Índice BP–RP (color de Gaia DR3) de una estrella, o null si no hay coincidencia
 * o falla la red. Alimenta el color de las estrellas del vecindario solar.
 *
 * Solo consulta cuando $gaia_dr3_id viene informado (identificador que SIMBAD ya
 * tiene vinculado al objeto, ver bitacora_simbad): busca por ese
 * `source_id` exacto, identidad y no posición. Sin id no se intenta ninguna
 * búsqueda por radio — un radio de ~10″ engancha a la estrella vecina en sistemas
 * múltiples (Gamma Andromedae: la primaria K está saturada y fuera de Gaia, y una
 * búsqueda posicional coge la compañera B, con un color completamente distinto).
 * Si SIMBAD, que ya hace su propio crossmatch, no vinculó el objeto a Gaia,
 * tampoco lo va a acertar mejor una búsqueda por posición del plugin: mejor
 * $bp_rp = null y que el llamador caiga al tipo espectral (sp_type).
 *
 * Consulta Gaia DR3 por TAP con el mismo failover que el proxy del simulador:
 * CDS (VizieR I/355/gaiadr3) y, si falla, GAVO (gaia.dr3lite). Se cachea 30 días
 * por source_id.
 */
function bitacora_gaia_bprp( $gaia_dr3_id ) {
    $gaia_dr3_id = trim( (string) $gaia_dr3_id );
    if ( '' === $gaia_dr3_id || ! ctype_digit( $gaia_dr3_id ) ) {
        return null;
    }
    $cache_key = 'bitacora_bprp_' . $gaia_dr3_id;
    $cache = get_transient( $cache_key );
    if ( false !== $cache ) {
        return is_numeric( $cache ) ? floatval( $cache ) : null; // 'nulo' o 'fallo'
    }

    $proveedores = array(
        array(
            'url'   => 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync',
            'query' => 'SELECT TOP 1 "BP-RP" AS bprp FROM "I/355/gaiadr3"'
                . ' WHERE Source=' . $gaia_dr3_id . ' AND "BP-RP" IS NOT NULL',
        ),
        array(
            'url'   => 'https://dc.zah.uni-heidelberg.de/tap/sync',
            'query' => 'SELECT TOP 1 phot_bp_mean_mag-phot_rp_mean_mag AS bprp FROM gaia.dr3lite'
                . ' WHERE source_id=' . $gaia_dr3_id
                . ' AND phot_bp_mean_mag IS NOT NULL AND phot_rp_mean_mag IS NOT NULL',
        ),
    );

    // 'fallo' solo si no contestó ninguno; un «no está» de cualquiera manda.
    $fallo_de_red = true;
    foreach ( $proveedores as $p ) {
        $respuesta = wp_remote_post(
            $p['url'],
            array(
                'timeout' => 20,
                'body'    => array(
                    'request' => 'doQuery',
                    'lang'    => 'ADQL',
                    'format'  => 'csv',
                    'query'   => $p['query'],
                ),
            )
        );
        $fallo_de_red = $fallo_de_red && bitacora_fallo_de_red( $respuesta );
        if ( is_wp_error( $respuesta ) || 200 !== wp_remote_retrieve_response_code( $respuesta ) ) {
            continue;
        }
        $csv = trim( wp_remote_retrieve_body( $respuesta ) );
        $lineas = preg_split( '/\r?\n/', $csv );
        if ( count( $lineas ) < 2 ) {
            continue; // solo cabecera: sin coincidencia en este proveedor
        }
        $val = trim( $lineas[1], " \"\r\n" );
        if ( is_numeric( $val ) ) {
            $bprp = floatval( $val );
            set_transient( $cache_key, (string) $bprp, 30 * DAY_IN_SECONDS );
            return $bprp;
        }
    }

    bitacora_cachear_ausencia( $cache_key, $fallo_de_red );
    return null;
}

/**
 * Distancia en años luz según VizieR, la SEGUNDA base de datos: se pregunta por
 * el nombre del objeto cuando SIMBAD no sabe a qué distancia está. Devuelve la
 * distancia o null. Se cachea 30 días por nombre.
 *
 * Catálogo consultado: B/ocl (Dias, «Optically visible open clusters and
 * Candidates»), que trae la distancia en pársecs de ~1.700 cúmulos abiertos, la
 * familia con más huecos en el `mesDistance` de SIMBAD (M11, NGC 869 y NGC 457
 * están aquí y allí no). Es una lista, no un catálogo general: las nebulosas
 * difusas siguen sin tener fuente automática y se resuelven a mano.
 */
function bitacora_vizier_dist_al( $identificador ) {
    // Los catálogos tabulados casan el nombre por texto exacto: "ngc2024" no es
    // "NGC 2024". Si el identificador no tiene forma de prefijo+número (un nombre
    // propio, una designación rara), no hay nada que preguntar aquí.
    $nombre = bitacora_nombre_catalogo( $identificador );
    if ( '' === $nombre ) {
        return null;
    }

    $cache_key = 'bitacora_vizier_dist_' . md5( $nombre );
    $cache = get_transient( $cache_key );
    if ( false !== $cache ) {
        return is_numeric( $cache ) ? floatval( $cache ) : null; // 'nulo' o 'fallo'
    }

    $respuesta = wp_remote_post(
        'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync',
        array(
            'timeout' => 20,
            'body'    => array(
                'request' => 'doQuery',
                'lang'    => 'ADQL',
                'format'  => 'csv',
                'query'   => 'SELECT TOP 1 Dist FROM "B/ocl/clusters"'
                    . ' WHERE Cluster = \'' . str_replace( "'", "''", $nombre ) . '\' AND Dist > 0',
            ),
        )
    );
    if ( ! is_wp_error( $respuesta ) && 200 === wp_remote_retrieve_response_code( $respuesta ) ) {
        $lineas = preg_split( '/\r?\n/', trim( wp_remote_retrieve_body( $respuesta ) ) );
        if ( count( $lineas ) >= 2 ) {
            $val = trim( $lineas[1], " \"\r\n" );
            if ( is_numeric( $val ) && floatval( $val ) > 0 ) {
                // La columna Dist de B/ocl viene en pársecs.
                $al = round( floatval( $val ) * BITACORA_AL_POR_PARSEC );
                set_transient( $cache_key, (string) $al, 30 * DAY_IN_SECONDS );
                return $al;
            }
        }
    }

    bitacora_cachear_ausencia( $cache_key, bitacora_fallo_de_red( $respuesta ) );
    return null;
}

/**
 * Distancia en años luz según el OPEN ASTRONOMY CATALOG (api.astrocats.space),
 * o null. Se cachea 30 días por identificador.
 *
 * Es el catálogo abierto de los TRANSITORIOS —supernovas, mareas, kilonovas— y
 * de ellos publica la distancia de luminosidad en megapársecs. Cubre un hueco
 * que no tapa ningún otro: los restos históricos, que se registran por su nombre
 * de toda la vida y no tienen distancia en SIMBAD. M1 (la Cangrejo) responde
 * aquí como SN 1054, a 0,0019 Mpc (~6.200 años luz).
 *
 * Es estrecho a propósito y no se equivoca de objeto: preguntado por M31, M42,
 * M51 o NGC 2024 contesta que no lo conoce, así que no puede colar la distancia
 * de otro astro.
 */
function bitacora_oac_dist_al( $identificador ) {
    $id = trim( (string) $identificador );
    if ( '' === $id ) {
        return null;
    }
    $cache_key = 'bitacora_oac_dist_' . md5( strtolower( $id ) );
    $cache = get_transient( $cache_key );
    if ( false !== $cache ) {
        return is_numeric( $cache ) ? floatval( $cache ) : null; // 'nulo' o 'fallo'
    }

    $respuesta = wp_remote_get(
        'https://api.astrocats.space/' . rawurlencode( $id ) . '/lumdist',
        array( 'timeout' => 20 )
    );
    if ( ! is_wp_error( $respuesta ) && 200 === wp_remote_retrieve_response_code( $respuesta ) ) {
        $al = bitacora_oac_dist_al_desde_json( wp_remote_retrieve_body( $respuesta ) );
        if ( null !== $al ) {
            set_transient( $cache_key, (string) $al, 30 * DAY_IN_SECONDS );
            return $al;
        }
    }

    bitacora_cachear_ausencia( $cache_key, bitacora_fallo_de_red( $respuesta ) );
    return null;
}

/**
 * Distancia en años luz estimada a partir del corrimiento al rojo que da NED
 * (NASA/IPAC Extragalactic Database), o null. Se cachea 30 días.
 *
 * NED es la referencia de lo extragaláctico y su servicio ObjectLookup resuelve
 * el nombre y devuelve el z en un JSON pequeño. Lo que NO devuelve por ninguna
 * vía automática son sus distancias independientes del corrimiento al rojo (la
 * compilación NED-D): eso solo está en la página web, y raspar HTML dentro del
 * plugin sería tan frágil como inútil el día que cambien la plantilla.
 *
 * Así que de NED sale el z, y del z sale una ESTIMACIÓN por la ley de Hubble,
 * que es la última fuente de la escalera y solo se acepta lejos
 * (bitacora_distancia_por_redshift explica por qué). A los objetos galácticos
 * NED les devuelve z nulo, así que no estorban.
 */
function bitacora_ned_dist_al( $identificador ) {
    $id = trim( (string) $identificador );
    if ( '' === $id ) {
        return null;
    }
    $cache_key = 'bitacora_ned_dist_' . md5( strtolower( $id ) );
    $cache = get_transient( $cache_key );
    if ( false !== $cache ) {
        return is_numeric( $cache ) ? floatval( $cache ) : null; // 'nulo' o 'fallo'
    }

    $respuesta = wp_remote_get(
        add_query_arg( 'name', rawurlencode( $id ), 'https://ned.ipac.caltech.edu/srs/ObjectLookup' ),
        array( 'timeout' => 20 )
    );
    if ( ! is_wp_error( $respuesta ) && 200 === wp_remote_retrieve_response_code( $respuesta ) ) {
        $z  = bitacora_ned_redshift_desde_json( wp_remote_retrieve_body( $respuesta ) );
        $al = bitacora_distancia_por_redshift( $z );
        if ( null !== $al ) {
            set_transient( $cache_key, (string) $al, 30 * DAY_IN_SECONDS );
            return $al;
        }
    }

    bitacora_cachear_ausencia( $cache_key, bitacora_fallo_de_red( $respuesta ) );
    return null;
}
