<?php
/**
 * IMPORTAR OBSERVACIONES · Open Astronomy Log
 *
 * El otro extremo de registro/plantilla-oal.html: lee el XML que produce la
 * plantilla y lo mete como observaciones, viajes y fichas de un usuario.
 * La spec completa, con las decisiones y lo que queda fuera, está en
 * registro/spec-importar-oal.md.
 *
 * El archivo tiene DOS MITADES y la frontera importa:
 *
 *   1) PURA — leer el XML, normalizar nombres, decidir qué casa con qué y
 *      fusionar las observaciones hermanas. Sin WordPress ni base de datos, que
 *      es lo que permite a scripts/test_oal_import.php requerir este archivo
 *      tal cual y probar las reglas de verdad.
 *   2) CON WORDPRESS — buscar, crear y actualizar filas. Se apoya entera en la
 *      primera mitad; aquí no se decide nada, solo se escribe.
 *
 * El XML viene de fuera y se trata como entrada hostil: sin entidades externas
 * (XXE), sin red y con un tope de tamaño.
 */

/* ===========================================================================
 * 1. PURA · leer el XML
 * =========================================================================== */

/** Tope de un XML de plantilla. Una temporada entera de texto no llega a 1 MB. */
define( 'BITACORA_OAL_MAX_BYTES', 8 * 1024 * 1024 );

/** El espacio de nombres propio: lo que OAL no sabe guardar de una noche. */
define( 'BITACORA_OAL_NS_BIT', 'https://bitacoraestelar.es/oal-ext/1' );

/**
 * Lee el XML de la plantilla y devuelve su contenido ya normalizado.
 *
 * @param string $xml El fichero entero.
 * @return array|array{error:string} Estructura con lugares, equipo, noches y
 *         observaciones, o array('error' => motivo) si no se puede leer.
 */
function bitacora_oal_leer( $xml ) {
    if ( ! is_string( $xml ) || '' === trim( $xml ) ) {
        return array( 'error' => 'El fichero está vacío.' );
    }
    if ( strlen( $xml ) > BITACORA_OAL_MAX_BYTES ) {
        return array( 'error' => 'El fichero pasa de ' . round( BITACORA_OAL_MAX_BYTES / 1048576 ) . ' MB.' );
    }

    // Entrada hostil: ni entidades externas (XXE) ni red. PHP 8 ya no las carga
    // por defecto, pero decirlo aquí lo deja escrito y a salvo de cambios.
    // El cargador se devuelve como estaba al terminar: es global del proceso, y
    // dejarlo bloqueado rompería a cualquier otro plugin que sí lea DTDs.
    $cargador = null;
    if ( function_exists( 'libxml_set_external_entity_loader' ) ) {
        $cargador = libxml_set_external_entity_loader( function () { return null; } );
    }
    $previo = libxml_use_internal_errors( true );
    $doc    = new DOMDocument();
    $ok     = $doc->loadXML( $xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING );
    libxml_clear_errors();
    libxml_use_internal_errors( $previo );
    if ( function_exists( 'libxml_set_external_entity_loader' ) ) {
        // Si no había ninguno, PHP devuelve true, que no vale para reponerlo.
        libxml_set_external_entity_loader( is_callable( $cargador ) ? $cargador : null );
    }
    if ( ! $ok || ! $doc->documentElement ) {
        return array( 'error' => 'El fichero no es XML válido.' );
    }

    $raiz = $doc->documentElement;
    if ( 'observations' !== $raiz->localName ) {
        return array( 'error' => 'El fichero no es una bitácora OAL.' );
    }

    $out = array(
        'plantilla'    => $raiz->getAttributeNS( BITACORA_OAL_NS_BIT, 'plantilla' ),
        'observador'   => array( 'nombre' => '', 'apellidos' => '', 'correo' => '' ),
        'lugares'      => array(),
        'telescopios'  => array(),
        'oculares'     => array(),
        'auxiliares'   => array(),
        'personas'     => array(),
        'targets'      => array(),
        'noches'       => array(),
        'observaciones' => array(),
    );

    foreach ( bitacora_oal_hijos( $raiz, 'sites', 'site' ) as $n ) {
        $out['lugares'][ $n->getAttribute( 'id' ) ] = array(
            'nombre'  => bitacora_oal_texto( $n, 'name' ),
            'lat'     => bitacora_oal_numero( $n, 'latitude' ),
            'lon'     => bitacora_oal_numero( $n, 'longitude' ),
            'altitud' => bitacora_oal_numero( $n, 'elevation' ),
            'tz'      => bitacora_oal_numero( $n, 'timezone' ),
        );
    }
    foreach ( bitacora_oal_hijos( $raiz, 'scopes', 'scope' ) as $n ) {
        $out['telescopios'][ $n->getAttribute( 'id' ) ] = array(
            'modelo'   => bitacora_oal_texto( $n, 'model' ),
            'apertura' => bitacora_oal_numero( $n, 'aperture' ),
            'focal'    => bitacora_oal_numero( $n, 'focalLength' ),
        );
    }
    foreach ( bitacora_oal_hijos( $raiz, 'eyepieces', 'eyepiece' ) as $n ) {
        $out['oculares'][ $n->getAttribute( 'id' ) ] = array(
            'modelo' => bitacora_oal_texto( $n, 'model' ),
            'focal'  => bitacora_oal_numero( $n, 'focalLength' ),
            'campo'  => bitacora_oal_numero( $n, 'apparentFOV' ),
        );
    }
    foreach ( bitacora_oal_hijos( $raiz, 'lenses', 'lens' ) as $n ) {
        $out['auxiliares'][ $n->getAttribute( 'id' ) ] = array(
            'modelo' => bitacora_oal_texto( $n, 'model' ),
            'factor' => bitacora_oal_numero( $n, 'factor' ),
        );
    }

    $primero = true;
    foreach ( bitacora_oal_hijos( $raiz, 'observers', 'observer' ) as $n ) {
        $nombre = trim( bitacora_oal_texto( $n, 'firstName' ) . ' ' . bitacora_oal_texto( $n, 'lastName' ) );
        $out['personas'][ $n->getAttribute( 'id' ) ] = $nombre;
        if ( $primero ) {
            $out['observador'] = array(
                'nombre'    => bitacora_oal_texto( $n, 'firstName' ),
                'apellidos' => bitacora_oal_texto( $n, 'lastName' ),
                'correo'    => bitacora_oal_texto( $n, 'contact' ),
            );
            $primero = false;
        }
    }

    foreach ( bitacora_oal_hijos( $raiz, 'targets', 'target' ) as $n ) {
        $pos = bitacora_oal_hijo( $n, 'position' );
        $out['targets'][ $n->getAttribute( 'id' ) ] = array(
            'nombre' => bitacora_oal_texto( $n, 'name' ),
            'ra'     => $pos ? bitacora_oal_numero( $pos, 'ra' ) : null,
            'dec'    => $pos ? bitacora_oal_numero( $pos, 'dec' ) : null,
        );
    }

    foreach ( bitacora_oal_hijos( $raiz, 'sessions', 'session' ) as $n ) {
        $ini = bitacora_oal_instante( bitacora_oal_texto( $n, 'begin' ) );
        $fin = bitacora_oal_instante( bitacora_oal_texto( $n, 'end' ) );
        $tripulacion = array();
        foreach ( $n->getElementsByTagName( 'coObserver' ) as $c ) {
            $id = trim( $c->textContent );
            if ( isset( $out['personas'][ $id ] ) && '' !== $out['personas'][ $id ] ) {
                $tripulacion[] = $out['personas'][ $id ];
            }
        }
        $out['noches'][ $n->getAttribute( 'id' ) ] = array(
            'noche'       => $ini ? bitacora_viaje_noche( $ini['fecha'], $ini['hora'] ) : null,
            'lugar'       => bitacora_oal_texto( $n, 'site' ),
            'comienzo'    => $ini ? $ini['hora'] : '',
            'fin'         => $fin ? $fin['hora'] : '',
            'tripulacion' => $tripulacion,
            // Forma vieja del cielo: bit:sqm/ir/seeing/bortle en la sesión, un
            // valor por noche. Ya no se escribe (ADR 0001), pero los XML que
            // los compañeros rellenaron lo traen así y se reparte más abajo.
            'sqm'         => bitacora_oal_numero( $n, 'sqm' ),
            'ir'          => bitacora_oal_numero( $n, 'ir' ),
            'seeing'      => bitacora_oal_numero( $n, 'seeing' ),
            'bortle'      => bitacora_oal_numero( $n, 'bortle' ),
            'meteo'       => bitacora_oal_texto( $n, 'weather' ),
            'cronica'     => bitacora_oal_texto( $n, 'comments' ),
        );
    }

    foreach ( $raiz->childNodes as $n ) {
        if ( XML_ELEMENT_NODE !== $n->nodeType || 'observation' !== $n->localName ) {
            continue;
        }
        $inst   = bitacora_oal_instante( bitacora_oal_texto( $n, 'begin' ) );
        $result = bitacora_oal_hijo( $n, 'result' );
        // Quién firma ESTA observación: en una salida con tripulación no tiene
        // por qué ser el dueño del fichero, y perderlo atribuiría al dueño lo
        // que vio otro.
        $quien = trim( bitacora_oal_texto( $n, 'observer' ) );
        $out['observaciones'][] = array(
            'id'          => $n->getAttribute( 'id' ),
            'noche'       => bitacora_oal_texto( $n, 'session' ),
            'observador'  => isset( $out['personas'][ $quien ] ) ? $out['personas'][ $quien ] : '',
            'target'      => bitacora_oal_texto( $n, 'target' ),
            'fecha'       => $inst ? $inst['fecha'] : '',
            'hora'        => $inst ? $inst['hora'] : '',
            'desfase'     => $inst ? $inst['desfase'] : '',
            'telescopio'  => bitacora_oal_texto( $n, 'scope' ),
            'ocular'      => bitacora_oal_texto( $n, 'eyepiece' ),
            'auxiliar'    => bitacora_oal_texto( $n, 'lens' ),
            'aumento'     => bitacora_oal_numero( $n, 'magnification' ),
            // El cielo de ESTA observación: el SQM y el seeing en su elemento
            // estándar, IR y Bortle en bit:, que el estándar no los tiene.
            'sqm'         => bitacora_oal_sqm( $n ),
            'ir'          => bitacora_oal_numero( $n, 'ir' ),
            'seeing'      => bitacora_oal_numero( $n, 'seeing' ),
            'bortle'      => bitacora_oal_numero( $n, 'bortle' ),
            'descripcion' => $result ? bitacora_oal_texto( $result, 'description' ) : '',
        );
    }

    return bitacora_oal_repartir_cielo( $out );
}

/**
 * Reparte el cielo entre la noche y sus observaciones, en este orden:
 *
 * 1. De la noche a sus observaciones sin valor propio. Como esto va ANTES del
 *    paso 2, lo único que baja es lo que la noche traía escrito en el XML, o
 *    sea la forma vieja —un `bit:sqm` por <session>—, que así sigue entrando
 *    entera. En un fichero de la forma nueva la noche llega vacía y no baja
 *    nada: en el XML no hay herencia, y el SQM es direccional, así que el de
 *    una observación no vale como medida de la de al lado (ADR 0001).
 * 2. De las observaciones a la noche, el primer valor no nulo. El viaje solo
 *    guarda un RESUMEN del cielo, y con un SQM direccional ese resumen es
 *    arbitrario por naturaleza: el primero es tan defendible como otro, y es
 *    lo que ya hacía la forma vieja.
 */
function bitacora_oal_repartir_cielo( $datos ) {
    $campos = array( 'sqm', 'ir', 'seeing', 'bortle' );
    foreach ( $datos['observaciones'] as $i => $o ) {
        if ( ! isset( $datos['noches'][ $o['noche'] ] ) ) {
            continue;
        }
        foreach ( $campos as $c ) {
            if ( null === $o[ $c ] ) {
                $datos['observaciones'][ $i ][ $c ] = $datos['noches'][ $o['noche'] ][ $c ];
            }
        }
    }
    foreach ( $datos['noches'] as $id => $noche ) {
        foreach ( $campos as $c ) {
            if ( null !== $noche[ $c ] ) {
                continue;
            }
            foreach ( $datos['observaciones'] as $o ) {
                // La clave de $noches viene de un atributo id: si es numérica,
                // PHP la guarda como int y (string) es lo que las hace iguales.
                if ( (string) $o['noche'] === (string) $id && null !== $o[ $c ] ) {
                    $datos['noches'][ $id ][ $c ] = $o[ $c ];
                    break;
                }
            }
        }
    }
    return $datos;
}

/**
 * El <sky-quality> de una observación, siempre en mag/arcsec².
 *
 * OAL lo tipa como surfaceBrightnessType, que admite las dos unidades. La
 * bitácora guarda solo mag/arcsec², así que el de arcmin² se convierte: hay
 * 3600 arcsec² en un arcmin², y 2,5·log10(3600) = 8,89 mag.
 */
function bitacora_oal_sqm( $n ) {
    $e = bitacora_oal_hijo( $n, 'sky-quality' );
    $v = bitacora_oal_numero( $n, 'sky-quality' );
    if ( ! $e || null === $v ) {
        return null;
    }
    return 'mags-per-squarearcmin' === $e->getAttribute( 'unit' ) ? $v + 8.89 : $v;
}

/** Los <hijo> dentro de <padre>, o lista vacía si el padre no está. */
function bitacora_oal_hijos( $raiz, $padre, $hijo ) {
    $p = bitacora_oal_hijo( $raiz, $padre );
    if ( ! $p ) {
        return array();
    }
    $out = array();
    foreach ( $p->childNodes as $n ) {
        if ( XML_ELEMENT_NODE === $n->nodeType && $hijo === $n->localName ) {
            $out[] = $n;
        }
    }
    return $out;
}

/** El primer hijo directo con ese nombre, o null. */
function bitacora_oal_hijo( $nodo, $nombre ) {
    if ( ! $nodo ) {
        return null;
    }
    foreach ( $nodo->childNodes as $n ) {
        if ( XML_ELEMENT_NODE === $n->nodeType && $nombre === $n->localName ) {
            return $n;
        }
    }
    return null;
}

/** El texto de un hijo directo, ya recortado. Vacío si no está. */
function bitacora_oal_texto( $nodo, $nombre ) {
    $h = bitacora_oal_hijo( $nodo, $nombre );
    return $h ? trim( $h->textContent ) : '';
}

/** Un hijo directo como número, o null si no está o no es un número. */
function bitacora_oal_numero( $nodo, $nombre ) {
    $t = bitacora_oal_texto( $nodo, $nombre );
    if ( '' === $t || ! is_numeric( str_replace( ',', '.', $t ) ) ) {
        return null;
    }
    return floatval( str_replace( ',', '.', $t ) );
}

/**
 * Parte un instante ISO en fecha y hora de RELOJ, sin convertir a UTC.
 * El desfase ya lo escribió la plantilla; lo que importa aquí es la hora local,
 * que es con la que se decide la noche y con la que trabaja bitacora-astro.js.
 * El desfase se guarda aparte, para quien sí necesite el instante absoluto.
 *
 *   '2026-08-06T02:15:00+02:00'
 *     -> array('fecha' => '2026-08-06', 'hora' => '02:15', 'desfase' => '+02:00')
 */
function bitacora_oal_instante( $iso ) {
    $iso = trim( (string) $iso );
    if ( ! preg_match( '/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/', $iso, $m ) ) {
        return null;
    }
    $desfase = '';
    if ( preg_match( '/(Z|[+-]\d{2}:\d{2})$/', $iso, $z ) ) {
        $desfase = ( 'Z' === $z[1] ) ? '+00:00' : $z[1];
    }
    return array( 'fecha' => $m[1], 'hora' => $m[2], 'desfase' => $desfase );
}

/**
 * El instante en UTC ('Y-m-d H:i:s') de una hora de reloj con su desfase, o null
 * si falta alguno de los dos. Sin desfase no se inventa uno: colocar mal en el
 * tiempo una observación es peor que no colocarla.
 */
function bitacora_oal_utc( $fecha, $hora, $desfase ) {
    if ( '' === trim( (string) $fecha ) || '' === trim( (string) $hora ) || '' === trim( (string) $desfase ) ) {
        return null;
    }
    try {
        $d = new DateTimeImmutable( $fecha . ' ' . $hora . ':00' . $desfase );
    } catch ( Exception $e ) {
        return null;
    }
    return $d->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
}

/* ===========================================================================
 * 2. PURA · normalizar, casar y fusionar
 * =========================================================================== */

/**
 * Nombre normalizado para comparar: sin acentos, sin mayúsculas, sin espacios
 * de más. "El Culebrín II" y "el culebrin ii" son el mismo sitio.
 *
 * Los acentos se quitan con una tabla y no con iconv //TRANSLIT porque su
 * resultado depende de la libc: en macOS 'í' sale como "'i", que metería una
 * palabra de más y rompería justo la comparación que esto viene a hacer.
 */
function bitacora_oal_clave( $s ) {
    $acentos = array(
        'á'=>'a','à'=>'a','ä'=>'a','â'=>'a','ã'=>'a','å'=>'a',
        'é'=>'e','è'=>'e','ë'=>'e','ê'=>'e',
        'í'=>'i','ì'=>'i','ï'=>'i','î'=>'i',
        'ó'=>'o','ò'=>'o','ö'=>'o','ô'=>'o','õ'=>'o','ø'=>'o',
        'ú'=>'u','ù'=>'u','ü'=>'u','û'=>'u',
        'ñ'=>'n','ç'=>'c','ý'=>'y','ÿ'=>'y',
    );
    $s = (string) $s;
    $s = function_exists( 'mb_strtolower' ) ? mb_strtolower( $s, 'UTF-8' ) : strtolower( $s );
    $s = strtr( $s, $acentos );
    $s = preg_replace( '/[^a-z0-9]+/', ' ', $s );
    return trim( preg_replace( '/\s+/', ' ', $s ) );
}

/**
 * Distancia en metros entre dos puntos (haversine sobre una Tierra esférica).
 * A la escala que importa aquí —¿es el mismo cerro?— sobra la precisión.
 */
function bitacora_oal_distancia_m( $lat1, $lon1, $lat2, $lon2 ) {
    $r = 6371000.0;
    $f1 = deg2rad( floatval( $lat1 ) );
    $f2 = deg2rad( floatval( $lat2 ) );
    $df = deg2rad( floatval( $lat2 ) - floatval( $lat1 ) );
    $dl = deg2rad( floatval( $lon2 ) - floatval( $lon1 ) );
    $a  = sin( $df / 2 ) ** 2 + cos( $f1 ) * cos( $f2 ) * sin( $dl / 2 ) ** 2;
    return $r * 2 * atan2( sqrt( $a ), sqrt( 1 - $a ) );
}

/** Cuánto puede alejarse un sitio del XML de una base ya conocida y seguir siendo ella. */
define( 'BITACORA_OAL_RADIO_M', 150 );

/**
 * ¿A qué base ya existente corresponde un <site> del XML?
 *
 * Primero por nombre; si no, por cercanía (la más cercana dentro del radio).
 * Devuelve 0 si no casa con ninguna, que significa "hay que crearla".
 *
 * Que esto falle no es inocuo: dos bases para el mismo cerro parten en dos la
 * gráfica de salud del sitio, con la mitad de los puntos en cada una.
 *
 * @param array $sitio Con nombre, lat y lon.
 * @param array $bases Filas visibles para el usuario (id, nombre, lat, lon).
 * @return int Id de la base, o 0.
 */
function bitacora_oal_base_casada( $sitio, $bases ) {
    $clave = bitacora_oal_clave( isset( $sitio['nombre'] ) ? $sitio['nombre'] : '' );
    foreach ( $bases as $b ) {
        $b = (array) $b;
        if ( '' !== $clave && bitacora_oal_clave( $b['nombre'] ) === $clave ) {
            return intval( $b['id'] );
        }
    }
    if ( ! isset( $sitio['lat'] ) || ! isset( $sitio['lon'] ) || null === $sitio['lat'] || null === $sitio['lon'] ) {
        return 0;
    }
    $mejor = 0;
    $mejor_d = BITACORA_OAL_RADIO_M;
    foreach ( $bases as $b ) {
        $b = (array) $b;
        if ( ! isset( $b['lat'] ) || ! isset( $b['lon'] ) || null === $b['lat'] || null === $b['lon'] ) {
            continue;
        }
        $d = bitacora_oal_distancia_m( $sitio['lat'], $sitio['lon'], $b['lat'], $b['lon'] );
        if ( $d <= $mejor_d ) {
            $mejor   = intval( $b['id'] );
            $mejor_d = $d;
        }
    }
    return $mejor;
}

/**
 * Una pieza de equipo escrita para que se reconozca fuera de casa: el nombre
 * propio que el observador le dio en Mi flota Y el modelo real. Solo el nombre
 * («Endeavour») no le dice nada a nadie más, y solo el modelo pierde el nombre
 * con el que él lo llama.
 */
function bitacora_oal_equipo_nombrado( $nombre, $modelo ) {
    $nombre = trim( (string) $nombre );
    $modelo = trim( (string) $modelo );
    if ( '' === $nombre || '' === $modelo ) {
        return '' === $nombre ? $modelo : $nombre;
    }
    // Si uno ya contiene al otro, repetirlo sobra: se queda el que más dice.
    if ( false !== strpos( bitacora_oal_clave( $nombre ), bitacora_oal_clave( $modelo ) ) ) {
        return $nombre;
    }
    if ( false !== strpos( bitacora_oal_clave( $modelo ), bitacora_oal_clave( $nombre ) ) ) {
        return $modelo;
    }
    return $nombre . ' · ' . $modelo;
}

/**
 * ¿Qué fila del catálogo (global o personal) es este modelo del XML?
 * Solo por modelo normalizado: un telescopio no tiene coordenadas con las que
 * desempatar. Devuelve 0 si hay que crearlo.
 */
function bitacora_oal_equipo_casado( $modelo, $filas ) {
    $clave = bitacora_oal_clave( $modelo );
    if ( '' === $clave ) {
        return 0;
    }
    foreach ( $filas as $f ) {
        $f = (array) $f;
        // Todas las formas con las que esa pieza puede aparecer escrita: el
        // modelo a secas y con la marca delante (así lo escriben otros
        // programas), el nombre propio de Mi flota, y el compuesto que exporta
        // esta bitácora. Cualquiera de ellas es la misma pieza.
        $nombre = isset( $f['propio'] ) ? trim( (string) $f['propio'] ) : '';
        $marca  = trim( ( isset( $f['vendor'] ) ? $f['vendor'] . ' ' : '' ) . $f['modelo'] );
        $formas = array( $f['modelo'], $marca, $nombre, bitacora_oal_equipo_nombrado( $nombre, $marca ) );
        foreach ( $formas as $forma ) {
            if ( '' !== bitacora_oal_clave( $forma ) && bitacora_oal_clave( $forma ) === $clave ) {
                return intval( $f['id'] );
            }
        }
    }
    return 0;
}

/**
 * El objeto tal y como lo guarda la bitácora, a partir del nombre del target.
 *   'M13'      -> array('M13',      'messier', 13)
 *   'NGC 7000' -> array('NGC 7000', 'otro',    null)
 */
function bitacora_oal_objeto( $nombre ) {
    $limpio = trim( preg_replace( '/\s+/', ' ', (string) $nombre ) );
    if ( preg_match( '/^m\s*(\d{1,3})$/i', $limpio, $m ) && intval( $m[1] ) >= 1 && intval( $m[1] ) <= 110 ) {
        return array( 'objeto' => 'M' . intval( $m[1] ), 'tipo' => 'messier', 'num' => intval( $m[1] ) );
    }
    return array( 'objeto' => $limpio, 'tipo' => 'otro', 'num' => null );
}

/**
 * Fusiona las observaciones hermanas: en OAL una observación es un objeto con
 * UN telescopio y UN ocular; aquí una observación tiene una entrada por cada
 * ocular. M13 a 68x y a 210x la misma noche es una ficha, no dos.
 *
 * La clave de fusión —y el identificador con el que se reconoce en una segunda
 * importación— es NOCHE + OBJETO, no el id de la primera hermana: así reordenar
 * o añadir una entrada más tarde sigue actualizando la misma observación.
 *
 * @param array $datos Lo que devuelve bitacora_oal_leer().
 * @return array Lista de observaciones, cada una con sus entradas en orden.
 */
function bitacora_oal_agrupar( $datos ) {
    $grupos = array();
    foreach ( $datos['observaciones'] as $o ) {
        $target = isset( $datos['targets'][ $o['target'] ] ) ? $datos['targets'][ $o['target'] ] : null;
        $noche  = isset( $datos['noches'][ $o['noche'] ] ) ? $datos['noches'][ $o['noche'] ] : null;
        if ( ! $target || ! $noche || ! $noche['noche'] || '' === trim( $target['nombre'] ) ) {
            continue;   // lo malo lo lista bitacora_oal_problemas(); aquí no entra
        }
        $clave = bitacora_oal_id( $noche['noche'], $target['nombre'] );
        if ( ! isset( $grupos[ $clave ] ) ) {
            $obj = bitacora_oal_objeto( $target['nombre'] );
            $grupos[ $clave ] = array(
                'oal_id'   => $clave,
                'noche_id' => $o['noche'],
                // La FECHA de la noche, la misma con la que se construye la
                // clave. 'fecha' de aquí abajo es la de la entrada más temprana,
                // que en una madrugada es del día siguiente: quien tenga que
                // razonar sobre la noche mira esta.
                'noche'    => $noche['noche'],
                'objeto'   => $obj['objeto'],
                'tipo'     => $obj['tipo'],
                'num'      => $obj['num'],
                'ra'       => $target['ra'],
                'dec'      => $target['dec'],
                'fecha'    => $o['fecha'],
                'hora'     => $o['hora'],
                'desfase'  => $o['desfase'],
                'observador' => $o['observador'],
                'sqm'      => null,
                'ir'       => null,
                'seeing'   => null,
                'bortle'   => null,
                'entradas' => array(),
            );
        }
        // El cielo de la observación es el de la primera hermana que lo midió:
        // son el mismo objeto la misma noche, así que miran al mismo sitio.
        foreach ( array( 'sqm', 'ir', 'seeing', 'bortle' ) as $c ) {
            if ( null === $grupos[ $clave ][ $c ] && isset( $o[ $c ] ) ) {
                $grupos[ $clave ][ $c ] = $o[ $c ];
            }
        }
        $grupos[ $clave ]['entradas'][] = array(
            'fecha'       => $o['fecha'],
            'hora'        => $o['hora'],
            'desfase'     => $o['desfase'],
            'aumento'     => $o['aumento'],
            'telescopio'  => $o['telescopio'],
            'ocular'      => $o['ocular'],
            'auxiliar'    => $o['auxiliar'],
            'descripcion' => $o['descripcion'],
        );
    }

    foreach ( $grupos as $clave => $g ) {
        // Ordenar por FECHA y hora, no solo por hora: una misma noche cruza la
        // medianoche, y con 00:30 antes que 23:00 la observación se fecharía en
        // la noche siguiente sin decir nada.
        usort( $grupos[ $clave ]['entradas'], function ( $a, $b ) {
            return strcmp( $a['fecha'] . ' ' . $a['hora'], $b['fecha'] . ' ' . $b['hora'] );
        } );
        // La observación se fecha en su entrada más temprana.
        $primera = $grupos[ $clave ]['entradas'][0];
        if ( '' !== $primera['fecha'] && '' !== $primera['hora'] ) {
            $grupos[ $clave ]['fecha']   = $primera['fecha'];
            $grupos[ $clave ]['hora']    = $primera['hora'];
            $grupos[ $clave ]['desfase'] = $primera['desfase'];
        }
    }
    return array_values( $grupos );
}

/**
 * El identificador estable de una observación importada: FECHA de la noche más
 * objeto. Ninguna de las dos mitades es casual:
 *
 * - La fecha, y no el id de la sesión en el XML ('no1'…), porque la plantilla
 *   les pone un sufijo aleatorio para que dos ficheros no choquen: rellenar la
 *   misma noche en una plantilla recién descargada daría otro id, y volver a
 *   subirla duplicaría todo en vez de actualizarlo. La noche del 5 de agosto es
 *   la noche del 5 de agosto en cualquier fichero.
 * - El objeto canonizado ("M 13", "m13" y "M13" son el mismo), porque si no,
 *   corregir un espacio en la plantilla crearía una observación nueva.
 *
 * El lugar NO entra, siguiendo la regla acordada de fusionar por noche + objeto
 * (registro/spec-importar-oal.md): mirar el mismo objeto la misma noche desde
 * dos bases distintas —mudarse de sitio a media noche y volver a él— queda como
 * una sola observación. Meter el lugar arreglaría ese caso rarísimo y estropearía
 * uno más probable: renombrar la base en la plantilla duplicaría toda la noche.
 *
 * Cabe en oal_id (varchar 64); si el nombre del objeto es larguísimo se recorta,
 * que a esa longitud dos objetos distintos de la misma noche ya no colisionan.
 *
 * @param string $noche  La noche en 'Y-m-d'.
 * @param string $objeto El nombre del objeto tal cual venga del XML.
 */
function bitacora_oal_id( $noche, $objeto ) {
    $obj = bitacora_oal_objeto( $objeto );
    return substr( $noche . '#' . bitacora_oal_clave( $obj['objeto'] ), 0, 64 );
}

/**
 * Qué observaciones ya guardadas SIN oal_id son en realidad las que trae el XML
 * (ADR 0002 · la identidad se adopta al importar, no se sella al exportar).
 *
 * Lo nacido en el formulario tiene el oal_id VACÍO —la columna es NOT NULL con
 * defecto ''—, así que no casa con nada y una reimportación lo duplicaría
 * entero. La regla que se aplica aquí no es nueva:
 * «mismo usuario + misma noche + mismo objeto = la misma observación» es
 * literalmente lo que oal_id ya impone, y la clave se calcula con la MISMA
 * función, para que las dos formas de reconocer una observación no puedan
 * divergir.
 *
 * Con más de una candidata no se adopta ninguna: pasa cuando el objeto se vio
 * en dos salidas de la misma noche desde dos bases, y la clave cuelga de la
 * noche, no del viaje. Elegir una sería inventarse cuál.
 *
 * @param array $grupos  Los de bitacora_oal_agrupar().
 * @param array $ya      oal_id => id de las que ya casaron por clave.
 * @param array $sueltas Filas sin oal_id: array('id','fecha','hora','objeto').
 * @return array array('adoptadas' => oal_id => id, 'ambiguas' => oal_id => cuántas)
 */
function bitacora_oal_adopciones( $grupos, $ya, $sueltas ) {
    $por_clave = array();
    foreach ( $sueltas as $s ) {
        // La madrugada pertenece a la noche que la engendró, aquí igual que en
        // el resto del proyecto.
        $noche = bitacora_viaje_noche( $s['fecha'], isset( $s['hora'] ) ? $s['hora'] : '' );
        if ( ! $noche ) {
            continue;
        }
        $por_clave[ bitacora_oal_id( $noche, $s['objeto'] ) ][] = intval( $s['id'] );
    }

    $adoptadas = array();
    $ambiguas  = array();
    foreach ( $grupos as $g ) {
        $clave = $g['oal_id'];
        if ( isset( $ya[ $clave ] ) || ! isset( $por_clave[ $clave ] ) ) {
            continue;
        }
        $candidatas = array_unique( $por_clave[ $clave ] );
        if ( 1 === count( $candidatas ) ) {
            $adoptadas[ $clave ] = intval( reset( $candidatas ) );
        } else {
            $ambiguas[ $clave ] = count( $candidatas );
        }
    }
    return array( 'adoptadas' => $adoptadas, 'ambiguas' => $ambiguas );
}

/**
 * Las filas que no se pueden importar y por qué. No aborta el fichero: se
 * listan, entra lo demás, y se corrigen en la plantilla.
 *
 * @return array Lista de array('donde' => …, 'que' => …).
 */
function bitacora_oal_problemas( $datos ) {
    $out = array();
    foreach ( $datos['noches'] as $id => $n ) {
        if ( ! $n['noche'] ) {
            $out[] = array( 'donde' => 'Noche ' . $id, 'que' => 'sin fecha utilizable: no se importa.' );
        }
    }
    foreach ( $datos['observaciones'] as $i => $o ) {
        $donde  = 'Observación ' . ( $i + 1 );
        $target = isset( $datos['targets'][ $o['target'] ] ) ? $datos['targets'][ $o['target'] ] : null;
        $noche  = isset( $datos['noches'][ $o['noche'] ] ) ? $datos['noches'][ $o['noche'] ] : null;
        if ( ! $target || '' === trim( $target['nombre'] ) ) {
            $out[] = array( 'donde' => $donde, 'que' => 'sin objeto: no se importa.' );
            continue;
        }
        $donde .= ' (' . $target['nombre'] . ')';
        if ( ! $noche ) {
            $out[] = array( 'donde' => $donde, 'que' => 'cuelga de una noche que no está en el fichero.' );
        } elseif ( ! $noche['noche'] ) {
            $out[] = array( 'donde' => $donde, 'que' => 'su noche no tiene fecha utilizable.' );
        }
        if ( '' === trim( $o['descripcion'] ) ) {
            $out[] = array( 'donde' => $donde, 'que' => 'sin descripción: entra vacía.' );
        }
    }
    return $out;
}

/* ===========================================================================
 * 3. CON WORDPRESS · buscar, crear y escribir
 *
 * Nada de lo de aquí decide reglas: todas están arriba, probadas aparte.
 * =========================================================================== */

/**
 * Importa un XML de la plantilla al usuario indicado.
 *
 * Dos pasos: sin $confirmar solo devuelve el plan (qué entraría, qué se
 * crearía, qué se actualizaría y qué está mal), sin escribir nada.
 *
 * @param string $xml        El fichero entero.
 * @param int    $usuario_id A quién pertenecen las observaciones.
 * @param bool   $confirmar  false = vista previa; true = escribir.
 * @return array|WP_Error
 */
function bitacora_oal_importar( $xml, $usuario_id, $confirmar = false ) {
    global $wpdb;
    $usuario_id = intval( $usuario_id );
    if ( $usuario_id <= 0 ) {
        return new WP_Error( 'sin_usuario', 'No se sabe de quién son estas observaciones.', array( 'status' => 400 ) );
    }
    $datos = bitacora_oal_leer( $xml );
    if ( isset( $datos['error'] ) ) {
        return new WP_Error( 'xml_invalido', $datos['error'], array( 'status' => 400 ) );
    }

    $grupos    = bitacora_oal_agrupar( $datos );
    $problemas = bitacora_oal_problemas( $datos );

    // Qué bases y qué equipo casan con lo que ya hay.
    $bases  = bitacora_oal_bases_visibles( $usuario_id );
    $mapa_base = array();
    $bases_nuevas = array();
    $bases_reusadas = array();
    $nombre_base = array();
    foreach ( $bases as $b ) {
        $nombre_base[ intval( $b['id'] ) ] = $b['nombre'];
    }
    foreach ( $datos['lugares'] as $id => $sitio ) {
        $casada = bitacora_oal_base_casada( $sitio, $bases );
        $mapa_base[ $id ] = $casada;
        if ( $casada ) {
            $bases_reusadas[] = $nombre_base[ $casada ];
        } else {
            $bases_nuevas[ $id ] = $sitio['nombre'];
        }
    }
    $equipo = array();
    $equipo_nuevo = array();
    $equipo_reusado = array();
    foreach ( array( 'telescopios', 'oculares', 'auxiliares' ) as $clase ) {
        $filas = bitacora_oal_equipo_visible( $clase, $usuario_id );
        foreach ( $datos[ $clase ] as $id => $pieza ) {
            $casado = bitacora_oal_equipo_casado( $pieza['modelo'], $filas );
            $equipo[ $clase ][ $id ] = $casado;
            if ( '' === trim( $pieza['modelo'] ) ) {
                continue;
            }
            if ( $casado ) {
                $equipo_reusado[] = $pieza['modelo'];
            } else {
                $equipo_nuevo[] = $pieza['modelo'];
            }
        }
    }

    // Qué ya está importado (y por tanto se actualizaría).
    $t_ob = bitacora_nombre_tabla();
    $ya   = array();
    foreach ( $grupos as $g ) {
        $id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM $t_ob WHERE usuario_id = %d AND oal_id = %s AND borrada_en IS NULL",
            $usuario_id, $g['oal_id']
        ) );
        if ( $id ) {
            $ya[ $g['oal_id'] ] = intval( $id );
        }
    }

    // Y qué observaciones tuyas del formulario son estas mismas (ADR 0002).
    $adopcion = bitacora_oal_adopciones( $grupos, $ya, bitacora_oal_sueltas( $usuario_id, $grupos ) );
    foreach ( $grupos as $g ) {
        if ( isset( $adopcion['ambiguas'][ $g['oal_id'] ] ) ) {
            $problemas[] = array(
                'donde' => $g['objeto'],
                'que'   => 'tienes ' . $adopcion['ambiguas'][ $g['oal_id'] ] . ' observaciones de ese objeto esa '
                         . 'noche sin importar de un XML, así que no se sabe cuál es esta: entra como nueva.',
            );
        }
    }

    $resumen = array(
        'plantilla'     => $datos['plantilla'],
        'observador'    => trim( $datos['observador']['nombre'] . ' ' . $datos['observador']['apellidos'] ),
        'noches'        => count( $datos['noches'] ),
        'observaciones' => count( $grupos ),
        'entradas'      => array_sum( array_map( function ( $g ) { return count( $g['entradas'] ); }, $grupos ) ),
        'nuevas'        => count( $grupos ) - count( $ya ) - count( $adopcion['adoptadas'] ),
        'actualizadas'  => count( $ya ),
        // Aparte de las que ya venían de un XML, y a propósito: adoptar es
        // sobrescribir con lo que traiga el fichero, así que pisa lo que se
        // hubiera editado en el sitio después. Eso hay que decirlo con otras
        // palabras que «se actualizan».
        'adoptadas'     => count( $adopcion['adoptadas'] ),
        'bases_nuevas'  => array_values( $bases_nuevas ),
        'equipo_nuevo'  => array_values( array_unique( $equipo_nuevo ) ),
        // Lo que NO se crea porque ya lo tienes: enseñarlo es lo que da
        // confianza en que la importación no va a llenar de duplicados.
        'bases_reusadas' => array_values( array_unique( $bases_reusadas ) ),
        'equipo_reusado' => array_values( array_unique( $equipo_reusado ) ),
        'problemas'     => $problemas,
        'aplicado'      => false,
    );
    if ( ! $confirmar ) {
        return $resumen;
    }

    // ── A partir de aquí se escribe ──────────────────────────────────────────
    $ahora = current_time( 'mysql', true );
    $firma = trim( $datos['observador']['nombre'] . ' ' . $datos['observador']['apellidos'] );
    if ( '' === $firma ) {
        $u     = get_userdata( $usuario_id );
        $firma = $u ? $u->display_name : '';
    }
    $observador_id = bitacora_observador_id_desde_nombre( $firma, $usuario_id );

    foreach ( $bases_nuevas as $id => $nombre ) {
        $mapa_base[ $id ] = bitacora_oal_base_crear( $datos['lugares'][ $id ], $usuario_id );
    }
    foreach ( array( 'telescopios', 'oculares', 'auxiliares' ) as $clase ) {
        foreach ( $datos[ $clase ] as $id => $pieza ) {
            if ( ! $equipo[ $clase ][ $id ] && '' !== trim( $pieza['modelo'] ) ) {
                $equipo[ $clase ][ $id ] = bitacora_oal_equipo_crear( $clase, $pieza, $usuario_id );
            }
        }
    }

    // Una noche, un viaje.
    $mapa_viaje = array();
    foreach ( $datos['noches'] as $id => $n ) {
        if ( ! $n['noche'] ) {
            continue;
        }
        $base_id = isset( $mapa_base[ $n['lugar'] ] ) ? intval( $mapa_base[ $n['lugar'] ] ) : 0;
        $viaje_id = bitacora_viaje_asegurar( $usuario_id, $base_id, $n['noche'], '21:00', $observador_id );
        if ( ! $viaje_id ) {
            continue;
        }
        $mapa_viaje[ $id ] = array( 'id' => $viaje_id, 'base_id' => $base_id );
        bitacora_oal_viaje_actualizar( $viaje_id, $n );
        foreach ( $n['tripulacion'] as $companero ) {
            bitacora_oal_tripulante( $viaje_id, $companero, $usuario_id );
        }
    }

    // Las coordenadas que el compañero no puso las resuelve SIMBAD, igual que
    // en el formulario. Solo al escribir: la vista previa no toca la red.
    foreach ( $grupos as $i => $g ) {
        if ( null === $g['ra'] || null === $g['dec'] ) {
            $s = bitacora_simbad( $g['objeto'] );
            if ( $s ) {
                $grupos[ $i ]['ra']  = ( null === $g['ra'] ) ? $s['ra'] : $g['ra'];
                $grupos[ $i ]['dec'] = ( null === $g['dec'] ) ? $s['dec'] : $g['dec'];
            }
        }
    }

    $creadas = 0;
    $actualizadas = 0;
    $adoptadas = 0;
    foreach ( $grupos as $g ) {
        $viaje = isset( $mapa_viaje[ $g['noche_id'] ] ) ? $mapa_viaje[ $g['noche_id'] ] : null;
        if ( ! $viaje ) {
            continue;
        }
        // Cada observación la firma quien la hizo (el <observer> de su bloque);
        // el dueño del fichero solo cubre las que no lo dicen.
        $quien    = '' !== trim( $g['observador'] ) ? trim( $g['observador'] ) : $firma;
        $quien_id = ( $quien === $firma ) ? $observador_id : bitacora_observador_id_desde_nombre( $quien, $usuario_id );
        $tel_id = 0;
        foreach ( $g['entradas'] as $e ) {
            if ( ! $tel_id && ! empty( $equipo['telescopios'][ $e['telescopio'] ] ) ) {
                $tel_id = $equipo['telescopios'][ $e['telescopio'] ];
            }
        }
        $fila = array(
            'objeto'            => sanitize_text_field( $g['objeto'] ),
            'objeto_etiqueta'   => sanitize_text_field( $g['objeto'] ),
            'tipo'              => $g['tipo'],
            'num'               => $g['num'],
            'ra'                => $g['ra'],
            'decl'              => $g['dec'],
            'observador'        => sanitize_text_field( $quien ),
            'observador_id'     => $quien_id ? $quien_id : null,
            'telescopio'        => bitacora_oal_modelo( $datos, 'telescopios', $g['entradas'][0]['telescopio'] ),
            'telescopio_id'     => $tel_id ? $tel_id : null,
            'fecha_observacion' => $g['fecha'],
            'hora_observacion'  => $g['hora'],
            // El cielo es de la OBSERVACIÓN (ADR 0001): el SQM se mide hacia
            // donde está el objeto. El viaje solo guarda un resumen.
            'cielo_sqm'         => $g['sqm'],
            'cielo_ir'          => $g['ir'],
            'cielo_bortle'      => ( null === $g['bortle'] ) ? null : intval( $g['bortle'] ),
            'seeing'            => ( null === $g['seeing'] ) ? null : intval( $g['seeing'] ),
            'origen'            => 'oal',
            'oal_id'            => $g['oal_id'],
            'usuario_id'        => $usuario_id,
            'base_id'           => $viaje['base_id'] ? $viaje['base_id'] : null,
            'viaje_id'          => $viaje['id'],
            'actualizado_en'    => $ahora,
        );
        $obs_id = isset( $ya[ $g['oal_id'] ] ) ? $ya[ $g['oal_id'] ] : 0;
        // Adoptar: la fila ya existía, nacida en el formulario. Se le pone la
        // clave —lo hace $fila, que ya la lleva— y se actualiza, en vez de
        // crear otra. Exportar sigue siendo solo lectura: la identidad se
        // adopta al importar, no se sella al descargar (ADR 0002).
        $adoptada = false;
        if ( ! $obs_id && isset( $adopcion['adoptadas'][ $g['oal_id'] ] ) ) {
            $obs_id   = $adopcion['adoptadas'][ $g['oal_id'] ];
            $adoptada = true;
        }
        if ( $obs_id ) {
            $wpdb->update( $t_ob, $fila, array( 'id' => $obs_id ) );
            if ( $adoptada ) {
                $adoptadas++;
            } else {
                $actualizadas++;
            }
        } else {
            $fila['creado_en'] = $ahora;
            $wpdb->insert( $t_ob, $fila );
            $obs_id = intval( $wpdb->insert_id );
            $creadas++;
        }
        if ( ! $obs_id ) {
            continue;
        }
        bitacora_oal_entradas_guardar( $obs_id, $g, $datos, $equipo, $ahora );
        bitacora_oal_ficha_guardar( $obs_id, $g, $viaje['base_id'], $ahora );

        // Lo importado también se pinta: si el objeto aún no está en el catálogo
        // del mapa, se calcula su sitio, igual que al registrar desde el
        // formulario. Sin esto la observación existe pero el mapa se queda
        // vacío, y el buscador —que resuelve en SIMBAD al vuelo— sí lo
        // encuentra, así que el hueco no se nota hasta que se busca. Se hace
        // también en las actualizaciones: así una importación repetida coloca
        // los objetos de lo que se importó antes de que esto existiera.
        $obj_res = bitacora_asegurar_objeto_mapa( $g['objeto'], $g['objeto'], $g['ra'], $g['dec'], $g['tipo'] );
        if ( is_wp_error( $obj_res ) ) {
            $problemas[] = array(
                'donde' => $g['objeto'],
                'que'   => $obj_res->get_error_message(),
            );
        }
    }
    $resumen['problemas'] = $problemas;

    $resumen['aplicado']     = true;
    $resumen['creadas']      = $creadas;
    $resumen['actualizadas'] = $actualizadas;
    $resumen['adoptadas']    = $adoptadas;
    return $resumen;
}

/**
 * Las observaciones del usuario que aún no llevan oal_id y podrían ser las que
 * trae el XML: las candidatas a adopción (ADR 0002). Quién es cuál lo decide
 * bitacora_oal_adopciones(), que es pura y está probada aparte.
 *
 * Se piden solo las de las fechas en juego —la noche de cada grupo y su
 * madrugada—, no la bitácora entera: quince años de observaciones no caben en
 * una previa.
 *
 * @return array Filas array('id','fecha','hora','objeto').
 */
function bitacora_oal_sueltas( $usuario_id, $grupos ) {
    global $wpdb;
    $fechas = array();
    foreach ( $grupos as $g ) {
        // La noche del grupo, la MISMA con la que se construyó su oal_id: si se
        // dedujera otra vez de la fecha de la entrada más temprana, un fichero
        // donde las dos no coincidan preguntaría por la noche equivocada y la
        // adopción fallaría en silencio, que es duplicar.
        if ( empty( $g['noche'] ) ) {
            continue;
        }
        $fechas[ $g['noche'] ] = true;
        // Y su madrugada, que se guarda con la fecha de reloj del día siguiente.
        $manana = new DateTimeImmutable( $g['noche'] . ' 00:00:00', new DateTimeZone( 'UTC' ) );
        $fechas[ $manana->modify( '+1 day' )->format( 'Y-m-d' ) ] = true;
    }
    if ( ! $fechas ) {
        return array();
    }
    $fechas = array_keys( $fechas );
    $huecos = implode( ', ', array_fill( 0, count( $fechas ), '%s' ) );
    $t_ob   = bitacora_nombre_tabla();
    $filas  = $wpdb->get_results( $wpdb->prepare(
        "SELECT id, fecha_observacion AS fecha, hora_observacion AS hora, objeto
           FROM $t_ob
          WHERE usuario_id = %d AND ( oal_id IS NULL OR oal_id = '' ) AND borrada_en IS NULL
            AND fecha_observacion IN ( $huecos )",
        array_merge( array( $usuario_id ), $fechas )
    ), ARRAY_A );
    return $filas ? $filas : array();
}

/** Las bases que ese usuario puede elegir: suyas, públicas y compartidas con él. */
function bitacora_oal_bases_visibles( $usuario_id ) {
    global $wpdb;
    $t  = bitacora_nombre_tabla_bases();
    $tc = bitacora_nombre_tabla_base_compartida();
    return $wpdb->get_results( $wpdb->prepare(
        "SELECT id, nombre, lat, lon FROM $t
         WHERE usuario_id = %d OR visibilidad = 'publica'
            OR id IN ( SELECT base_id FROM $tc WHERE usuario_id = %d )",
        $usuario_id, $usuario_id
    ), ARRAY_A );
}

/**
 * El catálogo global de una clase de equipo más el personal de ese usuario.
 * Las auxiliares no tienen columna 'modelo' sino 'nombre'; se alía para que
 * bitacora_oal_equipo_casado() vea siempre la misma forma.
 */
function bitacora_oal_equipo_visible( $clase, $usuario_id ) {
    global $wpdb;
    $cat = bitacora_oal_catalogo( $clase );
    $t   = $cat['tabla'];
    $col = $cat['modelo'];
    // El nombre propio viaja también: es una de las formas con las que la pieza
    // puede venir escrita en el XML, y sin él el emparejamiento por nombre no
    // tendría con qué comparar.
    $prop = $cat['propio'] ? $cat['propio'] . ' AS propio' : "'' AS propio";
    return $wpdb->get_results( $wpdb->prepare(
        "SELECT id, vendor, $col AS modelo, $prop FROM $t WHERE usuario_id IS NULL OR usuario_id = %d",
        $usuario_id
    ), ARRAY_A );
}

/**
 * Dónde vive cada clase de equipo: su tabla, cómo llama a la columna del modelo
 * y si tiene nombre propio. Las tres asimetrías del esquema, en un solo sitio:
 * las auxiliares llaman 'nombre' AL MODELO (una Barlow no se bautiza), y solo
 * los telescopios tienen además nombre propio —el que el observador le pone a
 * su tubo en Mi flota—.
 */
function bitacora_oal_catalogo( $clase ) {
    $mapa = array(
        'telescopios' => array( bitacora_nombre_tabla_telescopios(), 'modelo', 'nombre' ),
        'oculares'    => array( bitacora_nombre_tabla_oculares(),    'modelo', '' ),
        'auxiliares'  => array( bitacora_nombre_tabla_auxiliares(),  'nombre', '' ),
    );
    return array(
        'tabla'  => $mapa[ $clase ][0],
        'modelo' => $mapa[ $clase ][1],
        'propio' => $mapa[ $clase ][2],
    );
}

/** Crea una base privada del usuario con lo que dice el XML. */
function bitacora_oal_base_crear( $sitio, $usuario_id ) {
    global $wpdb;
    $wpdb->insert( bitacora_nombre_tabla_bases(), array(
        'usuario_id'  => $usuario_id,
        'nombre'      => sanitize_text_field( $sitio['nombre'] ),
        'lat'         => $sitio['lat'],
        'lon'         => $sitio['lon'],
        'altitud_m'   => $sitio['altitud'],
        'visibilidad' => 'privada',
        'creado_en'   => current_time( 'mysql', true ),
    ) );
    return intval( $wpdb->insert_id );
}

/** Crea una pieza de equipo personal con las specs del XML. */
function bitacora_oal_equipo_crear( $clase, $pieza, $usuario_id ) {
    global $wpdb;
    $cat  = bitacora_oal_catalogo( $clase );
    $fila = array(
        'usuario_id'     => $usuario_id,
        $cat['modelo']   => sanitize_text_field( $pieza['modelo'] ),
        'creado_en'      => current_time( 'mysql', true ),
    );
    if ( 'telescopios' === $clase ) {
        $fila['apertura_mm'] = $pieza['apertura'];
        $fila['focal_mm']    = $pieza['focal'];
        if ( $pieza['apertura'] && $pieza['focal'] ) {
            $fila['f_ratio'] = round( $pieza['focal'] / $pieza['apertura'], 2 );
        }
    } elseif ( 'oculares' === $clase ) {
        $fila['focal_mm']       = $pieza['focal'];
        $fila['campo_aparente'] = $pieza['campo'];
    } else {
        $fila['factor'] = $pieza['factor'];
    }
    $wpdb->insert( $cat['tabla'], $fila );
    return intval( $wpdb->insert_id );
}

/** Vuelca en el viaje lo que la noche trae y él aún no tiene. */
function bitacora_oal_viaje_actualizar( $viaje_id, $noche ) {
    global $wpdb;
    $fila = array( 'actualizado_en' => current_time( 'mysql', true ) );
    if ( null !== $noche['sqm'] )    { $fila['cielo_sqm']    = $noche['sqm']; }
    if ( null !== $noche['ir'] )     { $fila['cielo_ir']     = $noche['ir']; }
    if ( null !== $noche['seeing'] ) { $fila['seeing']       = intval( $noche['seeing'] ); }
    if ( null !== $noche['bortle'] ) { $fila['cielo_bortle'] = intval( $noche['bortle'] ); }
    if ( '' !== $noche['comienzo'] ) { $fila['comienzo']     = $noche['comienzo']; }
    if ( '' !== $noche['fin'] )      { $fila['fin']          = $noche['fin']; }
    if ( '' !== $noche['meteo'] )    { $fila['meteo']        = sanitize_text_field( $noche['meteo'] ); }
    if ( '' !== $noche['cronica'] )  { $fila['cronica']      = wp_kses_post( $noche['cronica'] ); }
    $wpdb->update( bitacora_nombre_tabla_viajes(), $fila, array( 'id' => intval( $viaje_id ) ) );
}

/** Apunta a un compañero en la tripulación del viaje (sin repetirlo). */
function bitacora_oal_tripulante( $viaje_id, $nombre, $usuario_id ) {
    global $wpdb;
    $oid = bitacora_observador_id_desde_nombre( $nombre, $usuario_id );
    if ( ! $oid ) {
        return;
    }
    $t  = bitacora_nombre_tabla_viaje_tripulacion();
    $ya = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM $t WHERE viaje_id = %d AND observador_id = %d", intval( $viaje_id ), intval( $oid )
    ) );
    if ( ! $ya ) {
        $wpdb->insert( $t, array(
            'viaje_id'      => intval( $viaje_id ),
            'observador_id' => intval( $oid ),
            'creado_en'     => current_time( 'mysql', true ),
        ) );
    }
}

/** El modelo (texto) de una pieza del XML, para las columnas que lo guardan legible. */
function bitacora_oal_modelo( $datos, $clase, $id ) {
    return isset( $datos[ $clase ][ $id ] ) ? sanitize_text_field( $datos[ $clase ][ $id ]['modelo'] ) : '';
}

/**
 * Reescribe las entradas de una observación: una por ocular/aumento, en orden.
 * Al reimportar se borran y se vuelven a poner, que es lo que hace que quitar
 * un aumento en la plantilla lo quite también aquí.
 */
function bitacora_oal_entradas_guardar( $obs_id, $grupo, $datos, $equipo, $ahora ) {
    global $wpdb;
    $t_ent = bitacora_nombre_tabla_entradas();
    $t_img = bitacora_nombre_tabla_imagenes();
    // Las entradas se rehacen enteras con lo que trae el XML, pero los bocetos y
    // las fotos NO se borran: no viajan en OAL, así que el fichero no puede
    // reponerlos y borrarlos sería perderlos para siempre. Se quedan enganchados
    // a la entrada del mismo orden, y si el XML trae menos entradas que antes, a
    // la última que quede. Le pasa a una observación adoptada con bocetos
    // (ADR 0002) y también a una ya importada a la que se le añadió uno aquí.
    $previas = $wpdb->get_results( $wpdb->prepare(
        "SELECT id, orden FROM $t_ent WHERE observacion_id = %d", $obs_id
    ), ARRAY_A );
    if ( $previas ) {
        $wpdb->query( $wpdb->prepare( "DELETE FROM $t_ent WHERE observacion_id = %d", $obs_id ) );
    }
    $nuevas = array();
    foreach ( $grupo['entradas'] as $orden => $e ) {
        $ocular = bitacora_oal_modelo( $datos, 'oculares', $e['ocular'] );
        $wpdb->insert( $t_ent, array(
            'observacion_id' => $obs_id,
            'orden'          => $orden,
            'aumento'        => $e['aumento'],
            'ocular_id'      => ! empty( $equipo['oculares'][ $e['ocular'] ] ) ? $equipo['oculares'][ $e['ocular'] ] : null,
            'auxiliar_id'    => ! empty( $equipo['auxiliares'][ $e['auxiliar'] ] ) ? $equipo['auxiliares'][ $e['auxiliar'] ] : null,
            'boton'          => $e['aumento'] ? ( round( $e['aumento'] ) . '×' ) : $ocular,
            'titulo'         => $ocular,
            'descripcion'    => wp_kses_post( $e['descripcion'] ),
            'creado_en'      => $ahora,
        ) );
        $nuevas[ $orden ] = intval( $wpdb->insert_id );
    }
    if ( $previas ) {
        $ultima = $nuevas ? end( $nuevas ) : 0;
        foreach ( $previas as $p ) {
            $destino = isset( $nuevas[ intval( $p['orden'] ) ] ) ? $nuevas[ intval( $p['orden'] ) ] : $ultima;
            if ( $destino ) {
                $wpdb->update( $t_img, array( 'entrada_id' => $destino ), array( 'entrada_id' => intval( $p['id'] ) ) );
            } else {
                // Sin ninguna entrada nueva no hay dónde colgarlos, y dejarlos
                // apuntando a una entrada que ya no existe los esconde para
                // siempre igual que borrarlos, pero ocupando sitio.
                $wpdb->delete( $t_img, array( 'entrada_id' => intval( $p['id'] ) ) );
            }
        }
    }
}

/**
 * Siembra la ficha con los datos CRUDOS que el XML sí sabe. La altura, el
 * azimut y el Sol y la Luna los sigue calculando la página de la ficha con
 * bitacora-astro.js: no se duplica la astronomía en PHP.
 */
function bitacora_oal_ficha_guardar( $obs_id, $grupo, $base_id, $ahora ) {
    global $wpdb;
    $t_fi = bitacora_nombre_tabla_fichas();
    $base = null;
    if ( $base_id ) {
        $base = $wpdb->get_row( $wpdb->prepare(
            "SELECT nombre, lat, lon FROM " . bitacora_nombre_tabla_bases() . " WHERE id = %d", intval( $base_id )
        ), ARRAY_A );
    }
    $fila = array(
        'observacion_id'   => $obs_id,
        'ra'               => $grupo['ra'],
        'decl'             => $grupo['dec'],
        'fecha_hora_local' => trim( $grupo['fecha'] . ' ' . $grupo['hora'] ),
        // Solo si el XML trajo huso: sin él no se puede inventar la hora UTC.
        'fecha_hora_utc'   => bitacora_oal_utc( $grupo['fecha'], $grupo['hora'], $grupo['desfase'] ),
        'lat'              => $base ? $base['lat'] : null,
        'lon'              => $base ? $base['lon'] : null,
        'sqm'              => $grupo['sqm'],
        'ir'               => $grupo['ir'],
        'lugar'            => $base ? $base['nombre'] : '',
        'fecha'            => $grupo['fecha'],
        'actualizado_en'   => $ahora,
    );
    $ya = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $t_fi WHERE observacion_id = %d", $obs_id ) );
    if ( $ya ) {
        $wpdb->update( $t_fi, $fila, array( 'id' => intval( $ya ) ) );
    } else {
        $fila['creado_en'] = $ahora;
        $wpdb->insert( $t_fi, $fila );
    }
}

/* ===========================================================================
 * 4. LAS DOS PUERTAS · REST (frontend) y panel del escritorio
 * =========================================================================== */

/**
 * POST /bitacora/v1/importar-oal
 *
 * Body: { xml: "…", confirmar: false }. Sin confirmar devuelve la vista previa;
 * con confirmar escribe. La ruta ya exige sesión iniciada (permission_callback),
 * y el destino es SIEMPRE el usuario de esa sesión: desde el frontend nadie
 * importa observaciones a la cuenta de otro. Elegir destinatario es cosa del
 * panel del escritorio, donde hace falta ser administrador.
 */
function bitacora_oal_rest_importar( $req ) {
    $xml = $req->get_param( 'xml' );
    if ( ! is_string( $xml ) ) {
        return new WP_Error( 'sin_xml', 'No llegó ningún fichero.', array( 'status' => 400 ) );
    }
    return bitacora_oal_importar( $xml, get_current_user_id(), (bool) $req->get_param( 'confirmar' ) );
}

/**
 * Panel del escritorio: subir el XML de un compañero e importarlo a su cuenta.
 *
 * Aquí SÍ se puede elegir a quién pertenecen las observaciones, porque es la
 * pantalla del administrador (capacidad + nonce). Va en dos pasos: al subir se
 * ve qué entraría, y solo el segundo botón escribe.
 */
function bitacora_oal_panel() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    $resumen  = null;
    $error    = '';
    $xml      = '';
    $destino  = get_current_user_id();

    if ( isset( $_POST['bitacora_oal_paso'] ) && check_admin_referer( 'bitacora_oal' ) ) {
        $paso    = sanitize_text_field( wp_unslash( $_POST['bitacora_oal_paso'] ) );
        $destino = isset( $_POST['bitacora_oal_usuario'] ) ? intval( $_POST['bitacora_oal_usuario'] ) : 0;

        if ( 'previa' === $paso && ! empty( $_FILES['bitacora_oal_xml']['tmp_name'] ) ) {
            if ( is_uploaded_file( $_FILES['bitacora_oal_xml']['tmp_name'] ) ) {
                $xml = (string) file_get_contents( $_FILES['bitacora_oal_xml']['tmp_name'] );
            }
        } elseif ( 'importar' === $paso ) {
            // El XML viaja en un campo oculto entre la previa y la confirmación,
            // para no obligar a subir el fichero dos veces.
            $xml = isset( $_POST['bitacora_oal_texto'] ) ? wp_unslash( $_POST['bitacora_oal_texto'] ) : '';
        }
        if ( '' !== trim( (string) $xml ) ) {
            $r = bitacora_oal_importar( $xml, $destino, 'importar' === $paso );
            if ( is_wp_error( $r ) ) {
                $error = $r->get_error_message();
            } else {
                $resumen = $r;
            }
        } else {
            $error = 'No llegó ningún fichero.';
        }
    }

    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Importar observaciones (Open Astronomy Log)</h2>';
    echo '<p>Sube el XML que un compañero haya generado con la plantilla. Se importa a su cuenta, no a la tuya: elige de quién son.</p>';

    if ( $error ) {
        echo '<div class="notice notice-error"><p>' . esc_html( $error ) . '</p></div>';
    }
    if ( $resumen ) {
        bitacora_oal_panel_resumen( $resumen );
    }

    echo '<form method="post" enctype="multipart/form-data">';
    wp_nonce_field( 'bitacora_oal' );
    echo '<p><label><strong>Observaciones de:</strong> ';
    wp_dropdown_users( array( 'name' => 'bitacora_oal_usuario', 'selected' => $destino, 'show_option_none' => false ) );
    echo '</label></p>';
    echo '<p><input type="file" name="bitacora_oal_xml" accept=".xml,text/xml,application/xml" /></p>';
    echo '<button type="submit" name="bitacora_oal_paso" value="previa" class="button">Ver qué entraría</button>';
    echo '</form>';

    // El segundo paso solo aparece cuando ya hay algo que confirmar.
    if ( $resumen && ! $resumen['aplicado'] && $resumen['observaciones'] > 0 ) {
        echo '<form method="post" style="margin-top:12px;padding-top:12px;border-top:1px solid #e0e0e0">';
        wp_nonce_field( 'bitacora_oal' );
        echo '<input type="hidden" name="bitacora_oal_usuario" value="' . intval( $destino ) . '" />';
        echo '<input type="hidden" name="bitacora_oal_texto" value="' . esc_attr( $xml ) . '" />';
        echo '<button type="submit" name="bitacora_oal_paso" value="importar" class="button button-primary">Importar de verdad</button>';
        echo ' <span style="color:#646970">Idempotente: reimportar el mismo fichero actualiza lo ya importado (clave: noche + objeto), no lo duplica.</span>';
        echo '</form>';
    }
    echo '</div>';
}

/** La vista previa (o el parte de lo hecho) de una importación. */
function bitacora_oal_panel_resumen( $r ) {
    $clase = $r['aplicado'] ? 'notice-success' : 'notice-info';
    echo '<div class="notice ' . $clase . '"><p>';
    if ( $r['aplicado'] ) {
        echo '<strong>Importado:</strong> ' . intval( $r['creadas'] ) . ' observación(es) nueva(s) y ' .
             intval( $r['actualizadas'] ) . ' actualizada(s).';
    } else {
        echo '<strong>' . esc_html( $r['observador'] ) . '</strong> · ' . intval( $r['noches'] ) . ' noche(s), ' .
             intval( $r['observaciones'] ) . ' observación(es) con ' . intval( $r['entradas'] ) . ' entrada(s): ' .
             intval( $r['nuevas'] ) . ' entrarían nuevas y ' . intval( $r['actualizadas'] ) . ' se actualizarían.';
    }
    echo '</p>';
    // Adoptar es sobrescribir (ADR 0002): se dice aparte de «se actualizan».
    if ( ! empty( $r['adoptadas'] ) ) {
        echo '<p>' . intval( $r['adoptadas'] ) . ' observación(es) suyas del formulario son estas mismas: ' .
             ( $r['aplicado']
                 ? 'se han quedado con lo que traía el fichero, sin duplicarse.'
                 : 'quedarían <strong>adoptadas y sobrescritas</strong> con lo que trae el fichero, sin duplicarse.' ) .
             '</p>';
    }
    if ( ! empty( $r['bases_nuevas'] ) ) {
        echo '<p>Bases que se crearían: <strong>' . esc_html( implode( ', ', $r['bases_nuevas'] ) ) . '</strong></p>';
    }
    if ( ! empty( $r['equipo_nuevo'] ) ) {
        echo '<p>Equipo que se crearía: <strong>' . esc_html( implode( ', ', $r['equipo_nuevo'] ) ) . '</strong></p>';
    }
    $reusado = array_merge( $r['bases_reusadas'], $r['equipo_reusado'] );
    if ( $reusado ) {
        echo '<p>Se reutiliza lo que ya tienes: ' . esc_html( implode( ', ', $reusado ) ) . '</p>';
    }
    if ( ! empty( $r['problemas'] ) ) {
        echo '<p><strong>Repasar en la plantilla:</strong></p><ul style="list-style:disc;margin-left:22px">';
        foreach ( $r['problemas'] as $p ) {
            echo '<li>' . esc_html( $p['donde'] . ': ' . $p['que'] ) . '</li>';
        }
        echo '</ul>';
    }
    echo '</div>';
}

/* ===========================================================================
 * 4. EXPORTAR · el ESTADO de una salida, en JSON
 *
 * El servidor NO compone XML: devuelve el `estado` —la misma forma que maneja
 * registro/plantilla-oal.html— y el motor del navegador lo convierte en fichero
 * OAL y en correo (ADR 0003). El dialecto tiene un solo escritor, y el correo y
 * el adjunto salen del mismo estado, porque dos consultas distintas acaban
 * dando dos números distintos.
 * =========================================================================== */

/**
 * El desfase local en MINUTOS de una zona IANA esa noche, que es lo que el
 * motor escribe en <timezone> y en cada instante. Con la zona vacía o rota se
 * usa la del sitio: es mejor la hora de pared de WordPress que un falso UTC.
 */
function bitacora_oal_tz_minutos( $tz, $fecha ) {
    $zona = null;
    if ( '' !== trim( (string) $tz ) ) {
        $zona = @timezone_open( $tz );
    }
    if ( ! $zona ) {
        $zona = wp_timezone();
    }
    try {
        // A las 22:00 de esa noche: el horario de verano cambia de madrugada y
        // el anochecer es cuando empieza la salida.
        $d = new DateTime( ( $fecha ? $fecha : '2000-01-01' ) . ' 22:00:00', $zona );
    } catch ( Exception $e ) {
        return 0;
    }
    return intval( round( $d->getOffset() / 60 ) );
}

/**
 * Del tipo del catálogo del mapa al código de otype de Sesame, que es lo que el
 * motor traduce a xsi:type. Lo que no esté aquí sale sin tipo, y el motor lo
 * emite como «zona del cielo»: no saber qué es no autoriza a inventarlo.
 */
function bitacora_oal_otype( $tipo ) {
    $tabla = array(
        'globular' => 'GlC', 'abierto' => 'OpC', 'planetaria' => 'PN',
        'emision' => 'HII', 'oscura' => 'DNe', 'snr' => 'SNR', 'carbono' => 'C*',
        // Clases de Hubble: todas son galaxias para OAL.
        'E' => 'G', 'S0' => 'G', 'S' => 'G', 'SB' => 'G', 'Irr' => 'G',
    );
    $t = trim( (string) $tipo );
    return isset( $tabla[ $t ] ) ? $tabla[ $t ] : '';
}

/** La descripción, que se guarda en HTML, como el texto plano que OAL espera. */
function bitacora_oal_texto_plano( $html ) {
    $con_saltos = preg_replace( '#<(br|/p|/div|/li)\s*/?>#i', "\n", (string) $html );
    $plano      = wp_strip_all_tags( $con_saltos );
    // Las entidades se deshacen DESPUÉS de quitar las etiquetas: un &lt;script&gt;
    // guardado como texto tiene que seguir siendo texto. Lo que sale de aquí se
    // escapa siempre al pintarlo, en el XML y en el correo.
    // En bucle, porque hay descripciones guardadas con el & ya escapado
    // («&amp;nbsp;»): una sola pasada las deja en «&nbsp;», que es justo lo que
    // se veía. Tope de tres vueltas: es una limpieza, no un intérprete.
    for ( $i = 0; $i < 3; $i++ ) {
        $antes = $plano;
        $plano = html_entity_decode( $plano, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
        if ( $plano === $antes ) {
            break;
        }
    }
    // El espacio duro del editor no es un espacio para nadie más: en el correo
    // se veía «&nbsp;» tal cual, porque volvía a escaparse el & de la entidad.
    $plano = str_replace( array( "\xC2\xA0", "\xE2\x80\x8B" ), array( ' ', '' ), $plano );
    return trim( $plano );
}

/** Un número de la base de datos como lo quiere el motor: '' si no lo hay. */
function bitacora_oal_num( $v ) {
    return ( null === $v || '' === $v ) ? '' : floatval( $v );
}

/** El slug del catálogo del mapa, la misma receta que bitacora_asegurar_objeto_mapa(). */
function bitacora_oal_slug( $objeto ) {
    return strtolower( preg_replace( '/[^A-Za-z0-9]/', '', (string) $objeto ) );
}

/**
 * El `estado` de un viaje: la salida entera con lo que cuelga de ella.
 *
 * Una observación de la bitácora tiene una entrada por ocular, y en OAL una
 * observación es un objeto con UN tubo y UN ocular: por eso cada entrada sale
 * como una observación propia, con id distinto y la misma noche y el mismo
 * objeto. Al reimportar se funden otra vez en una (bitacora_oal_agrupar).
 *
 * @param object $viaje      Fila de la tabla de viajes.
 * @param int    $usuario_id Quién exporta: el ÚNICO que lleva <contact>.
 * @return array El estado, en la forma que maneja el motor.
 */
function bitacora_oal_estado_viaje( $viaje, $usuario_id ) {
    global $wpdb;
    $t_obs = bitacora_nombre_tabla();
    $t_ent = bitacora_nombre_tabla_entradas();
    $t_bas = bitacora_nombre_tabla_bases();
    $t_tel = bitacora_nombre_tabla_telescopios();
    $t_ocu = bitacora_nombre_tabla_oculares();
    $t_aux = bitacora_nombre_tabla_auxiliares();
    $t_obr = bitacora_nombre_tabla_observadores();
    $t_tri = bitacora_nombre_tabla_viaje_tripulacion();
    $t_obj = bitacora_nombre_tabla_objetos();

    $u = get_userdata( $usuario_id );
    $estado = array(
        'observador'    => array(
            'nombre'    => $u ? ( $u->first_name ? $u->first_name : $u->display_name ) : '',
            'apellidos' => $u ? $u->last_name : '',
            'correo'    => $u ? $u->user_email : '',
        ),
        'lugares'       => array(),
        'telescopios'   => array(),
        'oculares'      => array(),
        'auxiliares'    => array(),
        'noches'        => array(),
        'observaciones' => array(),
    );
    $firma_dueno = trim( $estado['observador']['nombre'] . ' ' . $estado['observador']['apellidos'] );

    // El lugar de la salida.
    $base = $viaje->base_id
        ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $t_bas WHERE id = %d", $viaje->base_id ) )
        : null;
    if ( $base ) {
        $estado['lugares'][] = array(
            'id'      => 'lu' . intval( $base->id ),
            'nombre'  => $base->nombre,
            'lat'     => bitacora_oal_num( $base->lat ),
            'lon'     => bitacora_oal_num( $base->lon ),
            'altitud' => bitacora_oal_num( $base->altitud_m ),
            'tz'      => bitacora_oal_tz_minutos( $base->tz, $viaje->noche ),
        );
    }

    $tripulacion = $wpdb->get_col( $wpdb->prepare(
        "SELECT ob.nombre FROM $t_tri tr JOIN $t_obr ob ON ob.id = tr.observador_id
         WHERE tr.viaje_id = %d ORDER BY ob.nombre ASC",
        $viaje->id
    ) );
    $noche_id = 'n' . intval( $viaje->id );
    $estado['noches'][] = array(
        'id'          => $noche_id,
        'fecha'       => $viaje->noche,
        'lugarId'     => $base ? 'lu' . intval( $base->id ) : '',
        // El huso de la noche, para las salidas sin lugar: sin él las horas
        // saldrían en UTC, o sea corridas. Con lugar manda el del lugar.
        'tz'          => bitacora_oal_tz_minutos( $base ? $base->tz : '', $viaje->noche ),
        'comienzo'    => $viaje->comienzo,
        'fin'         => $viaje->fin,
        'tripulacion' => implode( ', ', array_map( 'trim', (array) $tripulacion ) ),
        'meteo'       => $viaje->meteo,
        'cronica'     => bitacora_oal_texto_plano( $viaje->cronica ),
        // El cielo NO viaja en la noche: cuelga de la observación (ADR 0001), y
        // ponerlo aquí volvería a inventar un SQM único para toda la salida.
    );

    // Las observaciones borradas no se exportan.
    $obs = $wpdb->get_results( $wpdb->prepare(
        "SELECT * FROM $t_obs WHERE viaje_id = %d AND borrada_en IS NULL
         ORDER BY ( hora_observacion = '' ) ASC, hora_observacion ASC, id ASC",
        $viaje->id
    ) );

    // De qué tipo es cada objeto lo sabe el catálogo del mapa, por su slug.
    $tipos = array();
    $slugs = array();
    foreach ( (array) $obs as $o ) {
        $slugs[] = bitacora_oal_slug( $o->objeto );
    }
    $slugs = array_values( array_unique( array_filter( $slugs ) ) );
    if ( $slugs ) {
        $huecos = implode( ', ', array_fill( 0, count( $slugs ), '%s' ) );
        $filas  = $wpdb->get_results( $wpdb->prepare( "SELECT slug, tipo FROM $t_obj WHERE slug IN ( $huecos )", $slugs ) );
        foreach ( (array) $filas as $f ) {
            $tipos[ $f->slug ] = $f->tipo;
        }
    }

    $equipo = array( 'telescopios' => array(), 'oculares' => array(), 'auxiliares' => array() );
    foreach ( (array) $obs as $o ) {
        $entradas = $wpdb->get_results( $wpdb->prepare(
            "SELECT * FROM $t_ent WHERE observacion_id = %d ORDER BY orden ASC, id ASC",
            $o->id
        ) );
        // Sin entradas la observación existe igual: sale con su noche, su objeto
        // y su hora, y sin descripción. Perderla al exportar sería peor.
        if ( ! $entradas ) {
            $entradas = array( (object) array(
                'aumento' => null, 'descripcion' => '', 'ocular_id' => null, 'auxiliar_id' => null,
            ) );
        }
        // Quién firma: el observador del catálogo si lo hay, si no el texto de la
        // observación, y si no el dueño de la bitácora.
        $firma = '';
        if ( $o->observador_id ) {
            $firma = (string) $wpdb->get_var( $wpdb->prepare( "SELECT nombre FROM $t_obr WHERE id = %d", $o->observador_id ) );
        }
        if ( '' === trim( $firma ) ) {
            $firma = trim( (string) $o->observador );
        }
        if ( '' === $firma ) {
            $firma = $firma_dueno;
        }
        $slug = bitacora_oal_slug( $o->objeto );
        foreach ( $entradas as $i => $e ) {
            if ( $o->telescopio_id ) {
                $equipo['telescopios'][ intval( $o->telescopio_id ) ] = 1;
            }
            if ( ! empty( $e->ocular_id ) ) {
                $equipo['oculares'][ intval( $e->ocular_id ) ] = 1;
            }
            // OAL tiene UNA <lens> por observación; de las dos ópticas auxiliares
            // que admite la entrada sale la primera, la montada más cerca del tubo.
            if ( ! empty( $e->auxiliar_id ) ) {
                $equipo['auxiliares'][ intval( $e->auxiliar_id ) ] = 1;
            }
            $estado['observaciones'][] = array(
                // Único dentro del fichero y estable: la misma entrada da siempre
                // el mismo id.
                'id'           => 'obs' . intval( $o->id ) . '-' . ( $i + 1 ),
                'nocheId'      => $noche_id,
                // La DESIGNACIÓN de catálogo, nunca la etiqueta amable: es la
                // cadena con la que AstroPlanner busca el objeto en los suyos.
                'objeto'       => $o->objeto,
                'ra'           => bitacora_oal_num( $o->ra ),
                'dec'          => bitacora_oal_num( $o->decl ),
                'otype'        => bitacora_oal_otype( isset( $tipos[ $slug ] ) ? $tipos[ $slug ] : '' ),
                'hora'         => $o->hora_observacion,
                'telescopioId' => $o->telescopio_id ? 'te' . intval( $o->telescopio_id ) : '',
                'ocularId'     => ! empty( $e->ocular_id ) ? 'oc' . intval( $e->ocular_id ) : '',
                'auxiliarId'   => ! empty( $e->auxiliar_id ) ? 'au' . intval( $e->auxiliar_id ) : '',
                'aumentos'     => bitacora_oal_num( $e->aumento ),
                'sqm'          => bitacora_oal_num( $o->cielo_sqm ),
                'ir'           => bitacora_oal_num( $o->cielo_ir ),
                'seeing'       => bitacora_oal_num( $o->seeing ),
                'bortle'       => bitacora_oal_num( $o->cielo_bortle ),
                'texto'        => bitacora_oal_texto_plano( $e->descripcion ),
                'observador'   => $firma,
            );
        }
    }

    $estado['telescopios'] = bitacora_oal_equipo_estado( 'telescopios', array_keys( $equipo['telescopios'] ), 'te' );
    $estado['oculares']    = bitacora_oal_equipo_estado( 'oculares', array_keys( $equipo['oculares'] ), 'oc' );
    $estado['auxiliares']  = bitacora_oal_equipo_estado( 'auxiliares', array_keys( $equipo['auxiliares'] ), 'au' );
    return $estado;
}

/**
 * Las piezas de equipo que se usaron, en la forma del estado. Solo esas: cada
 * recurso del fichero es una fila que hay que emparejar a mano al importarlo en
 * otro programa, y volcar el catálogo entero lo llena de ruido.
 */
function bitacora_oal_equipo_estado( $clase, $ids, $prefijo ) {
    global $wpdb;
    $ids = array_values( array_filter( array_map( 'intval', (array) $ids ) ) );
    if ( ! $ids ) {
        return array();
    }
    $cat    = bitacora_oal_catalogo( $clase );
    $tabla  = $cat['tabla'];
    $huecos = implode( ', ', array_fill( 0, count( $ids ), '%d' ) );
    $filas  = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $tabla WHERE id IN ( $huecos ) ORDER BY id ASC", $ids ), ARRAY_A );
    $out    = array();
    foreach ( (array) $filas as $f ) {
        // El nombre propio que el observador le da a su tubo en Mi flota Y el
        // modelo: el nombre es como lo llama él, el modelo es lo que permite
        // reconocerlo en otra bitácora —y lo único por lo que casa al volver—.
        // Cuál es cada columna lo dice el catálogo: en las auxiliares 'nombre'
        // ES el modelo, y componer «Barlow 2x · TeleVue» las dejaba sin casar.
        $propio = $cat['propio'] ? trim( (string) $f[ $cat['propio'] ] ) : '';
        $modelo = bitacora_oal_equipo_nombrado(
            $propio,
            trim( $f['vendor'] . ' ' . $f[ $cat['modelo'] ] )
        );
        $fila = array( 'id' => $prefijo . intval( $f['id'] ), 'modelo' => $modelo );
        if ( 'te' === $prefijo ) {
            $fila['apertura'] = bitacora_oal_num( $f['apertura_mm'] );
            $fila['focal']    = bitacora_oal_num( $f['focal_mm'] );
        } elseif ( 'oc' === $prefijo ) {
            $fila['focal'] = bitacora_oal_num( $f['focal_mm'] );
            $fila['campo'] = bitacora_oal_num( $f['campo_aparente'] );
        } else {
            $fila['factor'] = bitacora_oal_num( $f['factor'] );
        }
        $out[] = $fila;
    }
    return $out;
}

/**
 * GET /bitacora/v1/estado-oal?viaje=<id>
 *
 * El usuario sale de la SESIÓN, nunca de un parámetro: un endpoint de
 * exportación que acepte un usuario_id cualquiera es una fuga de datos con
 * forma de descarga. La ruta ya exige sesión iniciada (permission_callback) y
 * aquí se comprueba además que el viaje sea suyo.
 */
function bitacora_oal_rest_estado( $req ) {
    $usuario_id = get_current_user_id();
    $viaje      = bitacora_viaje_obtener( $req->get_param( 'viaje' ) );
    if ( ! $viaje ) {
        return new WP_Error( 'no_encontrado', 'Ese viaje no existe.', array( 'status' => 404 ) );
    }
    if ( intval( $viaje->usuario_id ) !== $usuario_id ) {
        return new WP_Error( 'no_es_tuyo', 'Solo puedes exportar tus propias salidas.', array( 'status' => 403 ) );
    }
    $res = new WP_REST_Response( bitacora_oal_estado_viaje( $viaje, $usuario_id ), 200 );
    // Qué código está respondiendo de verdad. El hash es del fichero en DISCO,
    // así que si no coincide con el que se acaba de subir —o si la cabecera ni
    // aparece— lo que corre es un compilado viejo (OPcache) o otra copia del
    // plugin, y no hay que buscar el fallo en la lógica.
    $res->header( 'X-Bitacora-Codigo', substr( md5_file( __FILE__ ), 0, 8 ) );
    return $res;
}
