<?php
/**
 * Bitácora Registro · la ficha .docx de una observación
 *
 * GET /observaciones/{id}/ficha: rellena ficha/plantilla_ficha.docx con los
 * datos de la observación y la entrega como descarga.
 *
 * Lo carga bitacora-registro.php; no es un plugin por sí mismo.
 */

// Impide el acceso directo al archivo.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/* ===========================================================================
 * 3-BIS. GENERAR LA FICHA .docx DE UNA OBSERVACIÓN
 *
 * El .docx se genera en PHP, sin dependencias externas. Se abre la plantilla
 * original (ficha/plantilla_ficha.docx) como ZIP con la clase ZipArchive, se
 * sustituyen las marcas [entre corchetes] dentro del XML —teniendo en cuenta
 * que Word puede partir un mismo texto en varios fragmentos— y se vuelve a
 * comprimir. El diseño (tipografías, colores, brújula, márgenes) se conserva
 * EXACTAMENTE: solo se tocan los textos, no la estructura.
 *
 * Único requisito: la extensión ZipArchive de PHP (activa por defecto en la
 * práctica totalidad de los WordPress). No hace falta Node.js, ni unzip/zip,
 * ni proc_open.
 *
 * La plantilla se busca en ficha/plantilla_ficha.docx, o en la ruta que
 * indiques con define( 'BITACORA_PLANTILLA', '/ruta/a/plantilla_ficha.docx' );.
 * =========================================================================== */

/**
 * Traduce el objeto a su catalogo legible, para el hueco [Catalogo].
 */
function bitacora_catalogo_de( $obs ) {
    if ( 'messier' === $obs->tipo ) {
        return 'Catálogo Messier';
    }
    $o = strtoupper( (string) $obs->objeto );
    if ( 0 === strpos( $o, 'NGC' ) ) {
        return 'Catálogo NGC';
    }
    if ( 0 === strpos( $o, 'IC' ) ) {
        return 'Catálogo IC';
    }
    return 'Objeto de cielo profundo';
}

/**
 * Constelación de un objeto Messier, deducida de su número (M1–M110). No se
 * guarda en la tabla: es información fija del catálogo, la misma que muestra el
 * autocompletado del formulario. Para objetos que no son Messier devuelve '',
 * y la ficha usa solo las coordenadas.
 */
function bitacora_constelacion_de( $obs ) {
    if ( 'messier' !== $obs->tipo || ! $obs->num ) {
        return '';
    }
    $mapa = array(
        1=>'Taurus', 2=>'Aquarius', 3=>'Canes Venatici', 4=>'Scorpius', 5=>'Serpens',
        6=>'Scorpius', 7=>'Scorpius', 8=>'Sagittarius', 9=>'Ophiuchus', 10=>'Ophiuchus',
        11=>'Scutum', 12=>'Ophiuchus', 13=>'Hercules', 14=>'Ophiuchus', 15=>'Pegasus',
        16=>'Serpens', 17=>'Sagittarius', 18=>'Sagittarius', 19=>'Ophiuchus', 20=>'Sagittarius',
        21=>'Sagittarius', 22=>'Sagittarius', 23=>'Sagittarius', 24=>'Sagittarius', 25=>'Sagittarius',
        26=>'Scutum', 27=>'Vulpecula', 28=>'Sagittarius', 29=>'Cygnus', 30=>'Capricornus',
        31=>'Andromeda', 32=>'Andromeda', 33=>'Triangulum', 34=>'Perseus', 35=>'Gemini',
        36=>'Auriga', 37=>'Auriga', 38=>'Auriga', 39=>'Cygnus', 40=>'Ursa Major',
        41=>'Canis Major', 42=>'Orion', 43=>'Orion', 44=>'Cancer', 45=>'Taurus',
        46=>'Puppis', 47=>'Puppis', 48=>'Hydra', 49=>'Virgo', 50=>'Monoceros',
        51=>'Canes Venatici', 52=>'Cassiopeia', 53=>'Coma Berenices', 54=>'Sagittarius', 55=>'Sagittarius',
        56=>'Lyra', 57=>'Lyra', 58=>'Virgo', 59=>'Virgo', 60=>'Virgo',
        61=>'Virgo', 62=>'Ophiuchus', 63=>'Canes Venatici', 64=>'Coma Berenices', 65=>'Leo',
        66=>'Leo', 67=>'Cancer', 68=>'Hydra', 69=>'Sagittarius', 70=>'Sagittarius',
        71=>'Sagitta', 72=>'Aquarius', 73=>'Aquarius', 74=>'Pisces', 75=>'Sagittarius',
        76=>'Perseus', 77=>'Cetus', 78=>'Orion', 79=>'Lepus', 80=>'Scorpius',
        81=>'Ursa Major', 82=>'Ursa Major', 83=>'Hydra', 84=>'Virgo', 85=>'Coma Berenices',
        86=>'Virgo', 87=>'Virgo', 88=>'Coma Berenices', 89=>'Virgo', 90=>'Virgo',
        91=>'Coma Berenices', 92=>'Hercules', 93=>'Puppis', 94=>'Canes Venatici', 95=>'Leo',
        96=>'Leo', 97=>'Ursa Major', 98=>'Coma Berenices', 99=>'Coma Berenices', 100=>'Coma Berenices',
        101=>'Ursa Major', 102=>'Draco', 103=>'Cassiopeia', 104=>'Virgo', 105=>'Leo',
        106=>'Canes Venatici', 107=>'Ophiuchus', 108=>'Ursa Major', 109=>'Ursa Major', 110=>'Andromeda',
    );
    $n = intval( $obs->num );
    return isset( $mapa[ $n ] ) ? $mapa[ $n ] : '';
}

/* --- Motor de sustitución en el .docx (sin dependencias externas) --------- */

function bitacora_docx_decode( $s ) {
    return str_replace(
        array( '&lt;', '&gt;', '&quot;', '&apos;', '&amp;' ),
        array( '<', '>', '"', "'", '&' ),
        $s
    );
}
function bitacora_docx_encode( $s ) {
    return str_replace( array( '&', '<', '>' ), array( '&amp;', '&lt;', '&gt;' ), $s );
}

/**
 * Extrae los <w:t>…</w:t> de un XML: apertura, texto (decodificado), cierre y
 * posición en bytes. Devuelve array( $runs, $concat ).
 */
function bitacora_docx_extraer_runs( $xml ) {
    $runs = array();
    if ( preg_match_all( '/(<w:t\b[^>]*>)(.*?)(<\/w:t>)/s', $xml, $m, PREG_OFFSET_CAPTURE ) ) {
        foreach ( $m[0] as $k => $whole ) {
            $runs[] = array(
                'apertura' => $m[1][ $k ][0],
                'texto'    => bitacora_docx_decode( $m[2][ $k ][0] ),
                'cierre'   => $m[3][ $k ][0],
                'ini'      => $whole[1],
                'fin'      => $whole[1] + strlen( $whole[0] ),
            );
        }
    }
    $concat = '';
    foreach ( $runs as $r ) {
        $concat .= $r['texto'];
    }
    return array( $runs, $concat );
}

/**
 * Reparte un reemplazo [pos, pos+len) que puede abarcar varios runs: el valor
 * entero va al primer run tocado; en los demás se borra su parte.
 */
function bitacora_docx_reemplazar( $runs, &$nuevo, $pos, $len, $valor ) {
    $offsets = array();
    $acc = 0;
    foreach ( $runs as $r ) {
        $offsets[] = $acc;
        $acc += strlen( $r['texto'] );
    }
    $restante = $len;
    $total = count( $runs );
    for ( $idx = 0; $idx < $total && $restante > 0; $idx++ ) {
        $ini = $offsets[ $idx ];
        $fin = $ini + strlen( $runs[ $idx ]['texto'] );
        if ( $pos < $fin && $pos + $len > $ini ) {
            $li = max( 0, $pos - $ini );
            $lf = min( strlen( $runs[ $idx ]['texto'] ), $pos + $len - $ini );
            $inserta = ( $restante === $len ) ? $valor : '';
            $nuevo[ $idx ] = substr( $nuevo[ $idx ], 0, $li ) . $inserta . substr( $nuevo[ $idx ], $lf );
            $restante -= ( $lf - $li );
        }
    }
}

function bitacora_docx_reconstruir( $xml, $runs, $nuevo ) {
    $salida = '';
    $cursor = 0;
    foreach ( $runs as $idx => $r ) {
        $salida .= substr( $xml, $cursor, $r['ini'] - $cursor );
        // Un «\n» del valor es un salto de línea del documento (#396).
        $texto   = str_replace( "\n", '</w:t><w:br/><w:t xml:space="preserve">', bitacora_docx_encode( $nuevo[ $idx ] ) );
        $salida .= $r['apertura'] . $texto . $r['cierre'];
        $cursor = $r['fin'];
    }
    return $salida . substr( $xml, $cursor );
}

/** Sustituye las marcas [clave] (aunque Word las haya partido en varios runs). */
function bitacora_docx_sustituir_campos( $xml, $valores ) {
    list( $runs, $concat ) = bitacora_docx_extraer_runs( $xml );
    if ( ! count( $runs ) ) {
        return $xml;
    }
    $nuevo = array();
    foreach ( $runs as $r ) {
        $nuevo[] = $r['texto'];
    }
    foreach ( $valores as $clave => $valor ) {
        $marca = '[' . $clave . ']';
        $desde = 0;
        while ( false !== ( $pos = strpos( $concat, $marca, $desde ) ) ) {
            bitacora_docx_reemplazar( $runs, $nuevo, $pos, strlen( $marca ), $valor );
            $desde = $pos + strlen( $marca );
        }
    }
    return bitacora_docx_reconstruir( $xml, $runs, $nuevo );
}

/** Sustituye la línea fija «Ophiucus <coords>» de la plantilla por la real. */
function bitacora_docx_sustituir_constelacion( $xml, $nueva ) {
    if ( '' === $nueva ) {
        return $xml;
    }
    list( $runs, $concat ) = bitacora_docx_extraer_runs( $xml );
    if ( ! count( $runs ) ) {
        return $xml;
    }
    $nuevo = array();
    foreach ( $runs as $r ) {
        $nuevo[] = $r['texto'];
    }
    $patron = '/Ophiucus\s+\d{1,2}h\s+\d{1,2}m\s+[-+]?\d{1,3}\xc2\xba\s+\d{1,2}\xe2\x80\x99/';
    $hubo = false;
    if ( preg_match_all( $patron, $concat, $mm, PREG_OFFSET_CAPTURE ) ) {
        foreach ( $mm[0] as $match ) {
            bitacora_docx_reemplazar( $runs, $nuevo, $match[1], strlen( $match[0] ), $nueva );
            $hubo = true;
        }
    }
    return $hubo ? bitacora_docx_reconstruir( $xml, $runs, $nuevo ) : $xml;
}

/* --- Formato de los valores (equivalente al antiguo generador Node) ------- */

function bitacora_ficha_grados( $v ) {
    if ( null === $v || '' === $v ) {
        return "\xe2\x80\x94"; // —
    }
    $n = floatval( $v );
    return ( $n >= 0 ? '+' : "\xe2\x88\x92" ) . number_format( abs( $n ), 1, '.', '' ) . "\xc2\xb0";
}
function bitacora_ficha_azimut( $v ) {
    if ( null === $v || '' === $v ) {
        return "\xe2\x80\x94";
    }
    return number_format( floatval( $v ), 1, '.', '' ) . "\xc2\xb0";
}
function bitacora_ficha_radec_texto( $ra, $dec ) {
    $ra  = floatval( $ra );
    $dec = floatval( $dec );
    $h   = $ra / 15;
    $hh  = floor( $h );
    $mm  = round( ( $h - $hh ) * 60 );
    $signo = $dec < 0 ? '-' : '+';
    $ad  = abs( $dec );
    $dd  = floor( $ad );
    $dm  = round( ( $ad - $dd ) * 60 );
    return sprintf( "%dh %02dm %s%d\xc2\xba %02d\xe2\x80\x99", $hh, $mm, $signo, $dd, $dm );
}
function bitacora_ficha_datos_cielo( $obs ) {
    // SQM/IR viven en la observación (cielo_sqm/cielo_ir); la ficha solo los lee.
    $sqm = isset( $obs->cielo_sqm ) ? $obs->cielo_sqm : null;
    $ir  = isset( $obs->cielo_ir )  ? $obs->cielo_ir  : null;
    $p = array();
    if ( null !== $sqm && '' !== $sqm ) {
        $p[] = 'SQM-L ' . ( 0 + $sqm );
    }
    if ( null !== $ir && '' !== $ir ) {
        $p[] = 'IR ' . ( 0 + $ir ) . "\xc2\xb0";
    }
    if ( isset( $obs->temp ) && null !== $obs->temp && '' !== $obs->temp ) {
        $p[] = 'Temperatura ambiente ' . ( 0 + $obs->temp ) . "\xc2\xb0";
    }
    return implode( ' ', $p );
}
function bitacora_ficha_nombre_largo( $obs ) {
    if ( 'messier' === $obs->tipo && $obs->num ) {
        return 'Messier ' . intval( $obs->num );
    }
    $etiqueta = $obs->objeto_etiqueta ? $obs->objeto_etiqueta : $obs->objeto;
    $partes = preg_split( '/\s+[·(]/u', trim( $etiqueta ) );
    return trim( $partes[0] );
}
/** Motivos de un no visto, tal como los rotula la app (BitacoraBase.MOTIVOS_NO_VISTO). */
function bitacora_ficha_motivo_etiqueta( $motivo ) {
    $m = array(
        'nubes'         => 'Nubes o transparencia',
        'contaminacion' => 'Contaminación lumínica',
        'luna'          => 'Luna',
        'bajo'          => 'Objeto bajo u obstáculo',
        'seeing'        => 'Seeing',
        'apertura'      => 'Apertura insuficiente',
        'no_localizado' => 'No localizado',
        'otro'          => 'Otro',
    );
    return isset( $m[ $motivo ] ) ? $m[ $motivo ] : '';
}
/**
 * La línea de estado de un intento fallido («Explorado – no confirmado ·
 * detectado · Luna»), o '' si la observación se vio (#396).
 */
function bitacora_ficha_estado_linea( $obs ) {
    $res = isset( $obs->resultado ) ? $obs->resultado : 'visto';
    if ( 'detectado_no_visto' !== $res && 'no_visto' !== $res ) {
        return '';
    }
    $p = array( "Explorado \xe2\x80\x93 no confirmado" );
    if ( 'detectado_no_visto' === $res ) {
        $p[] = 'detectado';
    }
    $motivo = bitacora_ficha_motivo_etiqueta( isset( $obs->motivo_no_visto ) ? $obs->motivo_no_visto : '' );
    if ( '' !== $motivo ) {
        $p[] = $motivo;
    }
    return implode( ' · ', $p );
}
function bitacora_ficha_constelacion_coords( $obs ) {
    $partes = array();
    $cons = bitacora_constelacion_de( $obs );
    if ( '' !== $cons ) {
        $partes[] = $cons;
    }
    $partes[] = bitacora_ficha_radec_texto( $obs->ra, $obs->decl );
    return implode( ' ', $partes );
}

function bitacora_generar_ficha( WP_REST_Request $peticion ) {
    // Envoltura: registra el último error (visible en el panel de Bitácora) y
    // captura cualquier excepción/fatal de PHP para devolver un mensaje legible
    // en lugar de un 500 opaco.
    try {
        $resultado = bitacora_generar_ficha_interno( $peticion );
        if ( is_wp_error( $resultado ) ) {
            update_option( 'bitacora_error_ficha', gmdate( 'Y-m-d H:i:s' ) . ' UTC — ' . $resultado->get_error_message() );
        }
        return $resultado;
    } catch ( \Throwable $e ) {
        update_option(
            'bitacora_error_ficha',
            gmdate( 'Y-m-d H:i:s' ) . ' UTC — EXCEPCIÓN: ' . $e->getMessage() . ' @ ' . basename( $e->getFile() ) . ':' . $e->getLine()
        );
        return new WP_Error( 'excepcion', 'Error al generar la ficha: ' . $e->getMessage(), array( 'status' => 500 ) );
    }
}

function bitacora_generar_ficha_interno( WP_REST_Request $peticion ) {
    $id  = intval( $peticion['id'] );
    $obs = bitacora_obtener( $id );

    if ( ! $obs || $obs->borrada_en ) {
        return new WP_Error( 'no_encontrada', 'Esa observación no existe.', array( 'status' => 404 ) );
    }
    if ( ! class_exists( 'ZipArchive' ) ) {
        return new WP_Error( 'sin_zip', 'El servidor no tiene la extensión ZipArchive de PHP, necesaria para generar el .docx.', array( 'status' => 500 ) );
    }

    $dir_ficha = __DIR__ . '/ficha';
    $plantilla = defined( 'BITACORA_PLANTILLA' ) ? BITACORA_PLANTILLA : $dir_ficha . '/plantilla_ficha.docx';
    if ( ! file_exists( $plantilla ) ) {
        return new WP_Error( 'sin_generador', 'No se encontró la plantilla de la ficha en el servidor.', array( 'status' => 500 ) );
    }

    // La astrometría vive en la ficha (bitacora_fichas). Fusionamos: partimos de
    // la observación y, si hay ficha, sus valores mandan. Así el .docx refleja
    // la ficha (Form 2), con la observación como respaldo.
    $ficha  = bitacora_obtener_ficha( $id );
    $fuente = clone $obs;
    foreach ( array( 'ra', 'decl', 'fecha_hora_local', 'fecha_hora_utc', 'lat', 'lon', 'obj_alt', 'obj_az', 'sun_alt', 'moon_alt', 'sqm', 'ir', 'temp' ) as $c ) {
        if ( ! isset( $fuente->$c ) ) {
            $fuente->$c = null;   // la columna ya no existe en la observación
        }
        if ( $ficha && isset( $ficha->$c ) && null !== $ficha->$c && '' !== $ficha->$c ) {
            $fuente->$c = $ficha->$c;
        }
    }

    // Marcas [entre corchetes] de la plantilla -> valores de la observación.
    $valores = array(
        'Nombre_observador' => $obs->observador ? $obs->observador : '',
        // El estado va en la primera línea, bajo el nombre (#396).
        'Nombre_objeto'     => trim( bitacora_ficha_nombre_largo( $obs ) . "\n" . bitacora_ficha_estado_linea( $obs ) ),
        'Catálogo'          => bitacora_catalogo_de( $obs ),
        'Datos_del_dielo'   => bitacora_ficha_datos_cielo( $fuente ),  // errata original de la plantilla
        'Datos_del_cielo'   => bitacora_ficha_datos_cielo( $fuente ),  // por si algún día la corriges
        'altitud_sol'       => bitacora_ficha_grados( $fuente->sun_alt ),
        'altitud_luna'      => bitacora_ficha_grados( $fuente->moon_alt ),
        'altitud_objeto'    => bitacora_ficha_grados( $fuente->obj_alt ),
        'azimut_objeto'     => bitacora_ficha_azimut( $fuente->obj_az ),
        'Telescopio'        => $obs->telescopio ? $obs->telescopio : '',
    );
    $constelacion = bitacora_ficha_constelacion_coords( $fuente );

    // Trabajamos sobre una COPIA de la plantilla (nunca sobre el original).
    // Nota: wp_tempnam() vive en wp-admin/includes/file.php y NO está cargada
    // en una petición REST, así que usamos tempnam() de PHP (siempre disponible)
    // y recurrimos a wp_tempnam() solo si aquélla fallara.
    $tmp = tempnam( sys_get_temp_dir(), 'bitacora-ficha' );
    if ( ! $tmp && function_exists( 'wp_tempnam' ) ) {
        $tmp = wp_tempnam( 'bitacora-ficha' );
    }
    if ( ! $tmp || ! copy( $plantilla, $tmp ) ) {
        if ( $tmp ) {
            @unlink( $tmp );
        }
        return new WP_Error( 'sin_temp', 'No se pudo preparar el archivo temporal.', array( 'status' => 500 ) );
    }

    $zip = new ZipArchive();
    if ( true !== $zip->open( $tmp ) ) {
        @unlink( $tmp );
        return new WP_Error( 'zip_error', 'No se pudo abrir la plantilla .docx.', array( 'status' => 500 ) );
    }

    // Solo el cuerpo, las cabeceras y los pies contienen texto visible.
    $objetivos = array();
    for ( $i = 0; $i < $zip->numFiles; $i++ ) {
        $n = $zip->getNameIndex( $i );
        if ( preg_match( '#^word/(document|header\d+|footer\d+)\.xml$#', $n ) ) {
            $objetivos[] = $n;
        }
    }
    $contenidos = array();
    foreach ( $objetivos as $n ) {
        $contenidos[ $n ] = $zip->getFromName( $n );
    }
    foreach ( $contenidos as $n => $xml ) {
        if ( false === $xml ) {
            continue;
        }
        $xml = bitacora_docx_sustituir_constelacion( $xml, $constelacion );
        $xml = bitacora_docx_sustituir_campos( $xml, $valores );
        $zip->deleteName( $n );
        $zip->addFromString( $n, $xml );
    }
    $zip->close();

    // Nombre de descarga: objeto en minúscula, sin espacios, + "_inv.docx".
    // "M30" -> "m30_inv.docx"   |   "NGC 6826" -> "ngc6826_inv.docx"
    $slug = bitacora_slug_objeto( $obs->objeto );
    if ( '' === $slug ) {
        $slug = 'ficha';
    }
    $nombre = $slug . '_inv.docx';

    $contenido = file_get_contents( $tmp );
    @unlink( $tmp );

    // Éxito: borra el registro de error para que el panel no muestre uno viejo.
    delete_option( 'bitacora_error_ficha' );

    // Entregamos el binario y cortamos: si WordPress siguiera, envolvería la
    // respuesta en JSON y corrompería el .docx.
    while ( ob_get_level() > 0 ) {
        ob_end_clean();
    }
    if ( ! headers_sent() ) {
        nocache_headers();
        header( 'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document' );
        header( 'Content-Disposition: attachment; filename="' . $nombre . '"' );
        header( 'Content-Length: ' . strlen( $contenido ) );
        header( 'X-Content-Type-Options: nosniff' );
    }
    echo $contenido;
    exit;
}
