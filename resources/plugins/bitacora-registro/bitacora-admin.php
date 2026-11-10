<?php
/**
 * Bitácora Registro · escritorio de WordPress
 *
 * La pantalla «Bitácora» del escritorio, sus paneles (observadores, objetos,
 * diagnóstico, importación antigua) y las semillas de datos que se lanzan
 * desde ellos. Nada de esto se ejecuta en una petición del frontend.
 *
 * Lo carga bitacora-registro.php; no es un plugin por sí mismo.
 */

// Impide el acceso directo al archivo.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Convierte un valor numérico de los CSV (decimales con coma, p. ej. "12,5")
 * a float, o null si está vacío/no numérico.
 */
function bitacora_csv_num( $v ) {
    $v = trim( (string) $v );
    if ( '' === $v ) {
        return null;
    }
    $v = str_replace( ',', '.', $v );
    return is_numeric( $v ) ? floatval( $v ) : null;
}

/**
 * Lee un CSV del plugin (UTF-8) y devuelve un array de filas asociativas usando
 * la primera línea como cabecera. null si no existe. El separador es ';'.
 */
function bitacora_leer_csv( $nombre, $sep = ';' ) {
    $archivo = __DIR__ . '/datos/' . $nombre;
    if ( ! file_exists( $archivo ) ) {
        return null;
    }
    $lineas = file( $archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES );
    if ( ! $lineas ) {
        return array();
    }
    // Quita el BOM UTF-8 si lo hubiera y los retornos de carro (CRLF) de cada
    // línea, para que el último campo de cada fila no arrastre un "\r".
    $lineas = array_map( function ( $l ) { return rtrim( $l, "\r" ); }, $lineas );
    $lineas[0] = preg_replace( '/^\xEF\xBB\xBF/', '', $lineas[0] );
    // Entrecomillado y escape explícitos: desde PHP 8.4 omitirlos avisa de que su
    // valor por defecto va a cambiar. Estos son los de siempre.
    $cabecera = str_getcsv( array_shift( $lineas ), $sep, '"', '\\' );
    $filas = array();
    foreach ( $lineas as $linea ) {
        $campos = str_getcsv( $linea, $sep, '"', '\\' );
        $fila = array();
        foreach ( $cabecera as $i => $col ) {
            $fila[ trim( $col ) ] = isset( $campos[ $i ] ) ? $campos[ $i ] : '';
        }
        $filas[] = $fila;
    }
    return $filas;
}

/**
 * Importa el catálogo GLOBAL de equipo (telescopios, oculares y auxiliares) desde
 * los CSV de datos/. Idempotente: upsert por (vendor, modelo) sobre las filas del
 * catálogo (usuario_id NULL); no toca el equipo personal de nadie.
 * Devuelve array con recuentos por categoría o WP_Error.
 */
function bitacora_importar_equipo_seed() {
    global $wpdb;
    $ahora = current_time( 'mysql', true );
    $totales = array( 'telescopios' => 0, 'oculares' => 0, 'auxiliares' => 0 );

    // Upsert de una fila del catálogo (usuario_id NULL) buscando por vendor+modelo.
    $upsert = function ( $tabla, $clave_modelo, $vendor, $modelo, $datos ) use ( $wpdb, $ahora ) {
        if ( '' === trim( (string) $vendor ) && '' === trim( (string) $modelo ) ) {
            return null;
        }
        $id = $wpdb->get_var( $wpdb->prepare(
            "SELECT id FROM $tabla WHERE usuario_id IS NULL AND vendor = %s AND $clave_modelo = %s",
            $vendor,
            $modelo
        ) );
        if ( $id ) {
            $wpdb->update( $tabla, array_merge( $datos, array( 'actualizado_en' => $ahora ) ), array( 'id' => intval( $id ) ) );
            return 'actualizado';
        }
        $wpdb->insert( $tabla, array_merge(
            array( 'usuario_id' => null, 'vendor' => $vendor, $clave_modelo => $modelo, 'creado_en' => $ahora ),
            $datos
        ) );
        return 'insertado';
    };

    // Telescopios: Vendor;Model;Optics;D (mm);D (inch);FL (mm);f/Ratio;...
    $tel = bitacora_leer_csv( 'telescopios.csv' );
    if ( is_array( $tel ) ) {
        $t = bitacora_nombre_tabla_telescopios();
        foreach ( $tel as $f ) {
            $r = $upsert( $t, 'modelo', sanitize_text_field( $f['Vendor'] ), sanitize_text_field( $f['Model'] ), array(
                'optica'      => sanitize_text_field( isset( $f['Optics'] ) ? $f['Optics'] : '' ),
                'apertura_mm' => bitacora_csv_num( isset( $f['D (mm)'] ) ? $f['D (mm)'] : '' ),
                'focal_mm'    => bitacora_csv_num( isset( $f['FL (mm)'] ) ? $f['FL (mm)'] : '' ),
                'f_ratio'     => bitacora_csv_num( isset( $f['f/Ratio'] ) ? $f['f/Ratio'] : '' ),
            ) );
            if ( $r ) {
                $totales['telescopios']++;
            }
        }
    }

    // Oculares: Vendor;Model;F.Length (mm);AFoV (°);Barrel (");Reticle
    $ocu = bitacora_leer_csv( 'oculares.csv' );
    if ( is_array( $ocu ) ) {
        $t = bitacora_nombre_tabla_oculares();
        foreach ( $ocu as $f ) {
            $r = $upsert( $t, 'modelo', sanitize_text_field( $f['Vendor'] ), sanitize_text_field( $f['Model'] ), array(
                'focal_mm'       => bitacora_csv_num( isset( $f['F.Length (mm)'] ) ? $f['F.Length (mm)'] : '' ),
                'campo_aparente' => bitacora_csv_num( isset( $f['AFoV (°)'] ) ? $f['AFoV (°)'] : '' ),
                'barril_mm'      => bitacora_csv_num( isset( $f['Barrel (")'] ) ? $f['Barrel (")'] : '' ),
            ) );
            if ( $r ) {
                $totales['oculares']++;
            }
        }
    }

    // Auxiliares: Vendor;Name;Magnification;Focal Length extension (mm)
    $aux = bitacora_leer_csv( 'auxiliares.csv' );
    if ( is_array( $aux ) ) {
        $t = bitacora_nombre_tabla_auxiliares();
        foreach ( $aux as $f ) {
            $r = $upsert( $t, 'nombre', sanitize_text_field( $f['Vendor'] ), sanitize_text_field( $f['Name'] ), array(
                'factor'       => bitacora_csv_num( isset( $f['Magnification'] ) ? $f['Magnification'] : '' ),
                'extension_mm' => bitacora_csv_num( isset( $f['Focal Length extension (mm)'] ) ? $f['Focal Length extension (mm)'] : '' ),
            ) );
            if ( $r ) {
                $totales['auxiliares']++;
            }
        }
    }

    return $totales;
}

/**
 * Importa (o actualiza) los objetos desde datos/objetos-seed.json.
 * Devuelve array( 'insertados' => n, 'actualizados' => n ) o WP_Error.
 */
function bitacora_importar_objetos_seed() {
    global $wpdb;
    $archivo = __DIR__ . '/datos/objetos-seed.json';
    if ( ! file_exists( $archivo ) ) {
        return new WP_Error( 'sin_semilla', 'No se encontró datos/objetos-seed.json en el servidor.' );
    }
    $json = json_decode( file_get_contents( $archivo ), true );
    if ( ! is_array( $json ) ) {
        return new WP_Error( 'semilla_invalida', 'El archivo de objetos no es un JSON válido.' );
    }

    $insertados = 0;
    $actualizados = 0;
    $avisos = array();

    foreach ( $json as $o ) {
        $slug = isset( $o['id'] ) ? sanitize_key( $o['id'] ) : '';
        if ( '' === $slug ) {
            continue;
        }
        $num = null;
        if ( preg_match( '/^m(\d+)$/', $slug, $mm ) ) {
            $num = intval( $mm[1] );
        }

        $fila = array(
            'slug'         => $slug,
            'num'          => $num,
            'nombre'       => sanitize_text_field( isset( $o['name'] ) ? $o['name'] : '' ),
            'etiqueta'     => sanitize_text_field( isset( $o['label'] ) ? $o['label'] : '' ),
            'color'        => sanitize_text_field( isset( $o['color'] ) ? $o['color'] : '' ),
            'ficha'        => sanitize_text_field( isset( $o['ficha'] ) ? $o['ficha'] : '' ),
            'coords_texto' => sanitize_text_field( isset( $o['coords'] ) ? $o['coords'] : '' ),
            'top_x'        => isset( $o['top']['x'] ) ? floatval( $o['top']['x'] ) : null,
            'top_y'        => isset( $o['top']['y'] ) ? floatval( $o['top']['y'] ) : null,
            'edge_x'       => isset( $o['edge']['x'] ) ? floatval( $o['edge']['x'] ) : null,
            'edge_y'       => isset( $o['edge']['y'] ) ? floatval( $o['edge']['y'] ) : null,
            'gal_l'        => isset( $o['l'] ) ? floatval( $o['l'] ) : null,
            'gal_b'        => isset( $o['b'] ) ? floatval( $o['b'] ) : null,
            'dist_al'      => isset( $o['dist_al'] ) ? floatval( $o['dist_al'] )
                              : ( isset( $o['dist'] ) ? floatval( $o['dist'] ) : null ),
            // La semilla no declara el tipo, solo el color de la leyenda, y ambos
            // van 1:1: NGC 40, NGC 6826, NGC 6905, M27 y M57 son #5fe0c8 =
            // 'planetaria'. Sin esto se quedaban en el mapa con el tipo vacío.
            'tipo'         => sanitize_text_field(
                ( isset( $o['tipo'] ) && '' !== $o['tipo'] )
                    ? $o['tipo']
                    : bitacora_tipo_por_color( isset( $o['color'] ) ? $o['color'] : '' )
            ),
            'morph'        => sanitize_text_field( isset( $o['morph'] ) ? $o['morph'] : '' ),
        );

        // Si la semilla no trae posición, se calcula automáticamente resolviendo
        // el objeto en SIMBAD (coordenadas + distancia + tipo morfológico). Los
        // objetos que ya traen top/edge del catálogo no tocan la red.
        if ( null === $fila['top_x'] && null === $fila['top_y'] ) {
            $ident = $fila['etiqueta'] ? $fila['etiqueta'] : strtoupper( $slug );
            $calc  = bitacora_completar_objeto( $ident, $fila['dist_al'] );
            if ( is_wp_error( $calc ) ) {
                $avisos[] = $calc->get_error_message();
            } else {
                foreach ( $calc as $k => $v ) {
                    // El valor calculado rellena solo lo que la semilla dejó vacío.
                    if ( ! isset( $fila[ $k ] ) || null === $fila[ $k ] || '' === $fila[ $k ] ) {
                        $fila[ $k ] = $v;
                    }
                }
            }
        }

        $res = bitacora_guardar_objeto_fila( $slug, $fila );
        if ( is_wp_error( $res ) ) {
            $avisos[] = $slug . ': ' . $res->get_error_message();
        } elseif ( 'actualizado' === $res ) {
            $actualizados++;
        } else {
            $insertados++;
        }
    }
    return array( 'insertados' => $insertados, 'actualizados' => $actualizados, 'avisos' => $avisos );
}

/**
 * Importa las observaciones históricas desde datos/observaciones-seed.json
 * (extraído de via-lactea-datos.js). Reemplaza las que ya estuvieran marcadas
 * como origen='legacy', de modo que es idempotente. Devuelve los recuentos.
 */
function bitacora_importar_observaciones_seed() {
    global $wpdb;
    $archivo = __DIR__ . '/datos/observaciones-seed.json';
    if ( ! file_exists( $archivo ) ) {
        return new WP_Error( 'sin_semilla', 'No se encontró datos/observaciones-seed.json en el servidor.' );
    }
    $data = json_decode( file_get_contents( $archivo ), true );
    if ( ! is_array( $data ) || empty( $data['observaciones'] ) ) {
        return new WP_Error( 'semilla_invalida', 'La semilla de observaciones no es válida.' );
    }

    $t_ob  = bitacora_nombre_tabla();
    $t_ent = bitacora_nombre_tabla_entradas();
    $t_img = bitacora_nombre_tabla_imagenes();

    // Borra las históricas previas (y sus entradas/imágenes) para reimportar limpio.
    $previas = $wpdb->get_col( "SELECT id FROM $t_ob WHERE origen = 'legacy'" );
    if ( $previas ) {
        $ids     = implode( ',', array_map( 'intval', $previas ) );
        $ent_ids = $wpdb->get_col( "SELECT id FROM $t_ent WHERE observacion_id IN ($ids)" );
        if ( $ent_ids ) {
            $eids = implode( ',', array_map( 'intval', $ent_ids ) );
            $wpdb->query( "DELETE FROM $t_img WHERE entrada_id IN ($eids)" );
        }
        $wpdb->query( "DELETE FROM $t_ent WHERE observacion_id IN ($ids)" );
        $wpdb->query( "DELETE FROM " . bitacora_nombre_tabla_fichas() . " WHERE observacion_id IN ($ids)" );
        $wpdb->query( "DELETE FROM $t_ob WHERE id IN ($ids)" );
    }

    $usuario = get_current_user_id();
    $ahora   = current_time( 'mysql', true );
    $n_obs = 0; $n_ent = 0; $n_img = 0;

    foreach ( $data['observaciones'] as $o ) {
        $slug = sanitize_key( isset( $o['slug'] ) ? $o['slug'] : '' );
        if ( '' === $slug ) {
            continue;
        }
        $num = ( preg_match( '/^m(\d+)$/', $slug, $mm ) ) ? intval( $mm[1] ) : null;
        // "m1" -> "M1"; "ngc40" -> "NGC 40"
        $objeto = ( null !== $num ) ? ( 'M' . $num ) : strtoupper( preg_replace( '/^([a-z]+)(\d+)$/', '$1 $2', $slug ) );
        $nombre_obs = sanitize_text_field( isset( $o['observador_nombre'] ) ? $o['observador_nombre'] : '' );

        // Sin formatos: $wpdb usa %s para todo y convierte null en NULL.
        $wpdb->insert( $t_ob, array(
            'objeto'          => $objeto,
            'objeto_etiqueta' => $objeto,
            'tipo'            => ( null !== $num ) ? 'messier' : 'otro',
            'num'             => $num,
            'observador'      => $nombre_obs,
            'telescopio'      => sanitize_text_field( isset( $o['instrumento'] ) ? $o['instrumento'] : '' ),
            'fecha_observacion' => sanitize_text_field( isset( $o['fecha'] ) ? (string) $o['fecha'] : '' ),
            'default_index'   => intval( isset( $o['default_index'] ) ? $o['default_index'] : 0 ),
            'origen'          => 'legacy',
            'usuario_id'      => $usuario,
            'creado_en'       => $ahora,
        ) );
        $obs_id = intval( $wpdb->insert_id );
        if ( ! $obs_id ) {
            continue;
        }
        bitacora_asignar_observador( $obs_id, $nombre_obs, $usuario );
        // La sesión (lugar/fecha/pdf) va a la ficha, no a la observación.
        $wpdb->insert( bitacora_nombre_tabla_fichas(), array(
            'observacion_id' => $obs_id,
            'lugar'          => sanitize_text_field( isset( $o['lugar'] ) ? $o['lugar'] : '' ),
            'fecha'          => sanitize_text_field( isset( $o['fecha'] ) ? (string) $o['fecha'] : '' ),
            'pdf'            => esc_url_raw( isset( $o['pdf'] ) ? $o['pdf'] : '' ),
            'creado_en'      => $ahora,
        ) );
        $n_obs++;

        $orden = 0;
        $entries = isset( $o['entries'] ) && is_array( $o['entries'] ) ? $o['entries'] : array();
        foreach ( $entries as $e ) {
            $wpdb->insert( $t_ent, array(
                'observacion_id' => $obs_id,
                'orden'          => $orden,
                'aumento'        => isset( $e['aumento'] ) ? $e['aumento'] : null,
                'campo_real'     => isset( $e['campo_real'] ) ? $e['campo_real'] : null,
                'pupila_salida'  => isset( $e['pupila'] ) ? $e['pupila'] : null,
                'boton'          => sanitize_text_field( isset( $e['boton'] ) ? $e['boton'] : '' ),
                'titulo'         => sanitize_text_field( isset( $e['titulo'] ) ? $e['titulo'] : '' ),
                'descripcion'    => wp_kses_post( isset( $e['html'] ) ? $e['html'] : '' ),
                'creado_en'      => $ahora,
            ) );
            $ent_id = intval( $wpdb->insert_id );
            $n_ent++;

            $io = 0;
            $imgs = isset( $e['imagenes'] ) && is_array( $e['imagenes'] ) ? $e['imagenes'] : array();
            foreach ( $imgs as $img ) {
                $archivo = sanitize_text_field( isset( $img['archivo'] ) ? $img['archivo'] : '' );
                if ( '' === $archivo ) {
                    continue;
                }
                $pos = ( isset( $img['pos'] ) && in_array( $img['pos'], array( 'left', 'right' ), true ) ) ? $img['pos'] : '';
                $wpdb->insert( $t_img, array(
                    'entrada_id' => $ent_id,
                    'orden'      => $io,
                    'tipo'       => ( isset( $img['tipo'] ) && 'anexo' === $img['tipo'] ) ? 'anexo' : 'principal',
                    'imagen_id'  => null,
                    'imagen_url' => $archivo,   // nombre de archivo; el visor antepone la ruta base
                    'etiqueta'   => sanitize_text_field( isset( $img['etiqueta'] ) ? $img['etiqueta'] : '' ),
                    'pos'        => $pos,
                    'creado_en'  => $ahora,
                ) );
                $io++; $n_img++;
            }
            $orden++;
        }
    }

    return array( 'observaciones' => $n_obs, 'entradas' => $n_ent, 'imagenes' => $n_img );
}

/** Panel del escritorio: importación de las observaciones históricas. */
function bitacora_panel_legacy() {
    global $wpdb;
    $t = bitacora_nombre_tabla();

    if ( isset( $_POST['bitacora_importar_legacy'] ) && check_admin_referer( 'bitacora_importar_legacy' ) ) {
        $r = bitacora_importar_observaciones_seed();
        if ( is_wp_error( $r ) ) {
            echo '<div class="notice notice-error"><p>' . esc_html( $r->get_error_message() ) . '</p></div>';
        } else {
            echo '<div class="notice notice-success"><p>Importadas <strong>' . intval( $r['observaciones'] ) .
                 '</strong> observaciones históricas, ' . intval( $r['entradas'] ) . ' entradas y ' .
                 intval( $r['imagenes'] ) . ' imágenes.</p></div>';
        }
    }

    if ( isset( $_POST['bitacora_reasignar_legacy'] ) && check_admin_referer( 'bitacora_reasignar_legacy' ) ) {
        $uid = intval( isset( $_POST['bitacora_usuario_destino'] ) ? $_POST['bitacora_usuario_destino'] : 0 );
        $destino = $uid ? get_userdata( $uid ) : false;
        if ( $destino ) {
            $n = $wpdb->query( $wpdb->prepare( "UPDATE $t SET usuario_id = %d WHERE origen = 'legacy'", $uid ) );
            // Vincula también el observador de esas observaciones a este usuario de WordPress.
            $t_obs = bitacora_nombre_tabla_observadores();
            $wpdb->query( $wpdb->prepare(
                "UPDATE $t_obs SET usuario_id = %d WHERE id IN ( SELECT observador_id FROM ( SELECT DISTINCT observador_id FROM $t WHERE origen = 'legacy' AND observador_id IS NOT NULL ) AS sub )",
                $uid
            ) );
            echo '<div class="notice notice-success"><p>Reasignadas <strong>' . intval( $n ) . '</strong> observaciones históricas a <strong>' . esc_html( $destino->display_name ) . '</strong>. Ya puedes editarlas y generar sus fichas desde ese usuario.</p></div>';
        } else {
            echo '<div class="notice notice-error"><p>Selecciona un usuario válido.</p></div>';
        }
    }

    $total = intval( $wpdb->get_var( "SELECT COUNT(*) FROM $t WHERE origen = 'legacy'" ) );

    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Observaciones históricas (de via-lactea-datos.js)</h2>';
    echo '<p>Importadas en la base de datos: <strong>' . $total . '</strong>. Incluyen sus entradas por ocular, textos e imágenes.</p>';
    echo '<form method="post">';
    wp_nonce_field( 'bitacora_importar_legacy' );
    echo '<button type="submit" name="bitacora_importar_legacy" value="1" class="button button-primary">Importar / reimportar observaciones históricas</button>';
    echo ' <span style="color:#646970">Idempotente: reemplaza las históricas por las de la semilla (no toca las que registres con el formulario).</span>';
    echo '</form>';

    // Reasignar la propiedad (usuario_id) de las históricas a un usuario de WordPress.
    echo '<form method="post" style="margin-top:16px;padding-top:14px;border-top:1px solid #e0e0e0">';
    wp_nonce_field( 'bitacora_reasignar_legacy' );
    echo '<label style="margin-right:8px">Propietario de las observaciones históricas: </label>';
    wp_dropdown_users( array( 'name' => 'bitacora_usuario_destino', 'selected' => get_current_user_id() ) );
    echo ' <button type="submit" name="bitacora_reasignar_legacy" value="1" class="button">Reasignar</button>';
    echo '<p style="color:#646970;margin:8px 0 0">Pone las históricas a nombre del usuario elegido (el que puede editarlas y generar sus fichas). No reimporta ni cambia su contenido.</p>';
    echo '</form></div>';
}

/** Panel del escritorio: catálogo de observadores. */
function bitacora_panel_observadores() {
    global $wpdb;
    $t = bitacora_nombre_tabla_observadores();

    // Canales propios del observador: el feed RSS de su podcast (issue #178), de
    // donde el fieldset de audio saca el desplegable de episodios, y su blog, el
    // "planeta de origen" que el mapa enciende junto a su nombre. Un solo
    // formulario por fila guarda los dos.
    if ( isset( $_POST['bitacora_guardar_feed'] ) && check_admin_referer( 'bitacora_guardar_feed' ) ) {
        $obs_id   = intval( $_POST['bitacora_observador_id'] ?? 0 );
        $feed_url = esc_url_raw( trim( $_POST['bitacora_feed_rss_url'] ?? '' ) );
        // https obligado: un blog en http avisa de inseguro al visitante que llega.
        // Una URL que no lo cumple NO se guarda como vacía: eso borraría en
        // silencio el blog que ya tenía el observador (y apagaría su planeta)
        // por una errata al teclear. Se deja como estaba y se dice por qué, que
        // es lo mismo que hace el REST devolviendo un 400.
        $blog_crudo = trim( (string) ( $_POST['bitacora_blog_url'] ?? '' ) );
        $blog_url   = bitacora_sanitizar_url_https( $blog_crudo );
        $campos     = array( 'feed_rss_url' => $feed_url );
        $blog_malo  = ( '' !== $blog_crudo && '' === $blog_url );
        if ( ! $blog_malo ) {
            $campos['blog_url'] = $blog_url;
        }
        if ( $obs_id ) {
            $wpdb->update(
                $t,
                $campos,
                array( 'id' => $obs_id ),
                array_fill( 0, count( $campos ), '%s' ),
                array( '%d' )
            );
            if ( $blog_malo ) {
                echo '<div class="notice notice-error"><p>La URL del blog debe empezar por <code>https://</code>. El blog se ha dejado como estaba; el feed sí se ha guardado.</p></div>';
            } else {
                echo '<div class="notice notice-success"><p>Canales del observador actualizados.</p></div>';
            }
        }
    }

    $obs = $wpdb->get_results(
        "SELECT o.*, ( SELECT COUNT(*) FROM " . bitacora_nombre_tabla() . " b WHERE b.observador_id = o.id AND b.borrada_en IS NULL AND b.resultado = 'visto' ) AS num FROM $t o ORDER BY o.nombre ASC"
    );
    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Observadores</h2>';
    if ( empty( $obs ) ) {
        echo '<p>Todavía no hay observadores. Se crean solos al registrar observaciones.</p></div>';
        return;
    }
    echo '<p>Disponibles en <code>/wp-json/bitacora/v1/observadores</code>. Filtra observaciones con <code>?observador=ID</code>.</p>';
    echo '<table class="widefat striped"><thead><tr><th>ID</th><th>Nombre</th><th>Clave</th><th>Observaciones</th><th>Canales propios (podcast y blog)</th></tr></thead><tbody>';
    foreach ( $obs as $o ) {
        printf(
            '<tr><td>%d</td><td><strong>%s</strong></td><td>%s</td><td>%d</td><td>' .
            '<form method="post" style="display:flex;gap:6px;flex-wrap:wrap">%s' .
            '<input type="hidden" name="bitacora_observador_id" value="%d">' .
            '<input type="url" name="bitacora_feed_rss_url" value="%s" placeholder="https://…/feed.xml" style="flex:1 1 220px">' .
            '<input type="url" name="bitacora_blog_url" value="%s" placeholder="https://… (blog)" style="flex:1 1 220px">' .
            '<button type="submit" name="bitacora_guardar_feed" value="1" class="button">Guardar</button>' .
            '</form></td></tr>',
            intval( $o->id ), esc_html( $o->nombre ), esc_html( $o->clave ), intval( $o->num ),
            wp_nonce_field( 'bitacora_guardar_feed', '_wpnonce', true, false ),
            intval( $o->id ), esc_attr( $o->feed_rss_url ),
            esc_attr( isset( $o->blog_url ) ? $o->blog_url : '' )
        );
    }
    echo '</tbody></table></div>';
}

/** Panel del escritorio: estado e importación de los objetos del mapa. */
function bitacora_panel_objetos() {
    global $wpdb;
    $tabla = bitacora_nombre_tabla_objetos();

    if ( isset( $_POST['bitacora_importar_objetos'] ) && check_admin_referer( 'bitacora_importar_objetos' ) ) {
        $r = bitacora_importar_objetos_seed();
        if ( is_wp_error( $r ) ) {
            echo '<div class="notice notice-error"><p>' . esc_html( $r->get_error_message() ) . '</p></div>';
        } else {
            echo '<div class="notice notice-success"><p>Objetos importados: <strong>' . intval( $r['insertados'] ) .
                 '</strong> nuevos, <strong>' . intval( $r['actualizados'] ) . '</strong> actualizados.</p></div>';
        }
    }

    $total = intval( $wpdb->get_var( "SELECT COUNT(*) FROM $tabla" ) );

    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Objetos del mapa (Vía Láctea)</h2>';
    echo '<p>Objetos en la base de datos: <strong>' . $total . '</strong>. Disponibles en <code>/wp-json/bitacora/v1/objetos</code>.</p>';
    echo '<form method="post">';
    wp_nonce_field( 'bitacora_importar_objetos' );
    echo '<button type="submit" name="bitacora_importar_objetos" value="1" class="button button-primary">Importar / actualizar objetos desde la semilla</button>';
    echo ' <span style="color:#646970">Idempotente: puedes pulsarlo las veces que quieras sin duplicar (clave: el identificador del objeto).</span>';
    echo '</form>';

    // ── Backfill del color BP–RP (Gaia) para el vecindario solar ──
    if ( isset( $_POST['bitacora_backfill_bprp'] ) && check_admin_referer( 'bitacora_backfill_bprp' ) ) {
        $n = bitacora_backfill_bprp();
        echo '<div class="notice notice-success"><p>Color BP–RP completado en <strong>' . intval( $n ) . '</strong> objeto(s) cercano(s).</p></div>';
    }
    $sin_bprp = intval( $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM $tabla WHERE bp_rp IS NULL AND dist_al IS NOT NULL AND dist_al <= %f",
        BITACORA_BPRP_DIST_MAX_AL
    ) ) );
    echo '<form method="post" style="margin-top:14px;padding-top:12px;border-top:1px solid #e0e0e0">';
    wp_nonce_field( 'bitacora_backfill_bprp' );
    echo '<button type="submit" name="bitacora_backfill_bprp" value="1" class="button">Completar color BP–RP de objetos cercanos</button>';
    echo ' <span style="color:#646970">Consulta Gaia el color de las estrellas cercanas para el vecindario solar. Pendientes: <strong>' . $sin_bprp . '</strong>. Idempotente. Los objetos nuevos ya lo obtienen al registrarse.</span>';
    echo '</form>';

    // ── Backfill de objetos observados que se quedaron fuera del mapa ──
    if ( isset( $_POST['bitacora_backfill_objetos'] ) && check_admin_referer( 'bitacora_backfill_objetos' ) ) {
        $r = bitacora_objetos_backfill();
        echo '<div class="notice notice-success"><p>Colocados en el mapa: <strong>' . intval( $r['colocados'] ) . '</strong> objeto(s).</p>';
        foreach ( $r['problemas'] as $obj => $motivo ) {
            echo '<p>' . esc_html( $obj ) . ': ' . esc_html( $motivo ) . '</p>';
        }
        echo '</div>';
    }
    echo '<form method="post" style="margin-top:14px;padding-top:12px;border-top:1px solid #e0e0e0">';
    wp_nonce_field( 'bitacora_backfill_objetos' );
    echo '<button type="submit" name="bitacora_backfill_objetos" value="1" class="button">Colocar en el mapa los objetos observados que falten</button>';
    echo ' <span style="color:#646970">Reintenta los objetos de observaciones ya guardadas que no se pudieron situar en su día (p. ej. porque entonces no se les encontró la distancia). Idempotente.</span>';
    echo '</form>';

    // ── Reclasificación del antiguo cajón 'otro' (estrella / desconocido) ──
    if ( isset( $_POST['bitacora_reclasificar_objetos'] ) && check_admin_referer( 'bitacora_reclasificar_objetos' ) ) {
        $n = bitacora_objetos_reclasificar();
        echo '<div class="notice notice-success"><p>Reclasificados: <strong>' . intval( $n ) . '</strong> objeto(s).</p></div>';
    }
    // Lo que el contador cuenta es lo que el rótulo promete: objetos SIN clasificar.
    // La consulta de bitacora_objetos_reclasificar() es más ancha —entran también las
    // filas en 'estrella' (protoplanetarias guardadas antes de que existiera su
    // categoría) y en 'abierto' (cúmulos con nebulosidad que el OpenNGC reescribe a
    // 'emision', ADR 0002)—, y la diferencia es a propósito: una estrella o un cúmulo
    // bien clasificado no es un pendiente, es trabajo extra que el botón hace de paso.
    // Lo que no puede pasar es lo contrario, que el contador sea más ancho que la
    // consulta: entonces el panel enseñaría pendientes que el botón no toca. Si algún
    // día se estrecha la consulta, se estrecha este COUNT con ella.
    $sin_clasificar = intval( $wpdb->get_var( "SELECT COUNT(*) FROM $tabla WHERE tipo IN ('otro', '', 'desconocido')" ) );
    echo '<form method="post" style="margin-top:14px;padding-top:12px;border-top:1px solid #e0e0e0">';
    wp_nonce_field( 'bitacora_reclasificar_objetos' );
    echo '<button type="submit" name="bitacora_reclasificar_objetos" value="1" class="button">Reclasificar los objetos sin clasificar («otro» o «desconocido»)</button>';
    echo ' <span style="color:#646970">Vuelve a preguntar el tipo a SIMBAD para los objetos que no tienen clasificación. Sirve para dos cosas: separar el antiguo cajón «otro» —que mezclaba «es una estrella» con «no se pudo clasificar»— y rescatar los que están en «Sin clasificar» porque el clasificador aún no conocía su tipo cuando se registraron. Pendientes: <strong>' . $sin_clasificar . '</strong>. Idempotente; no toca la posición ni la distancia.</span>';
    echo '</form></div>';

    // ── Catálogo de equipo (telescopios / oculares / auxiliares) ──
    if ( isset( $_POST['bitacora_importar_equipo'] ) && check_admin_referer( 'bitacora_importar_equipo' ) ) {
        $r = bitacora_importar_equipo_seed();
        if ( is_wp_error( $r ) ) {
            echo '<div class="notice notice-error"><p>' . esc_html( $r->get_error_message() ) . '</p></div>';
        } else {
            echo '<div class="notice notice-success"><p>Catálogo de equipo importado: <strong>' . intval( $r['telescopios'] ) .
                 '</strong> telescopios, <strong>' . intval( $r['oculares'] ) . '</strong> oculares, <strong>' .
                 intval( $r['auxiliares'] ) . '</strong> auxiliares.</p></div>';
        }
    }
    $t_tel = intval( $wpdb->get_var( 'SELECT COUNT(*) FROM ' . bitacora_nombre_tabla_telescopios() . ' WHERE usuario_id IS NULL' ) );
    $t_ocu = intval( $wpdb->get_var( 'SELECT COUNT(*) FROM ' . bitacora_nombre_tabla_oculares() . ' WHERE usuario_id IS NULL' ) );
    $t_aux = intval( $wpdb->get_var( 'SELECT COUNT(*) FROM ' . bitacora_nombre_tabla_auxiliares() . ' WHERE usuario_id IS NULL' ) );
    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Catálogo de equipo</h2>';
    echo '<p>Catálogo global: <strong>' . $t_tel . '</strong> telescopios, <strong>' . $t_ocu . '</strong> oculares, <strong>' . $t_aux . '</strong> auxiliares. Cada observador arma su flota desde estos modelos o añadiendo los suyos.</p>';
    echo '<form method="post">';
    wp_nonce_field( 'bitacora_importar_equipo' );
    echo '<button type="submit" name="bitacora_importar_equipo" value="1" class="button button-primary">Importar / actualizar catálogo desde los CSV</button>';
    echo ' <span style="color:#646970">Idempotente (clave: fabricante + modelo). No toca el equipo personal de nadie.</span>';
    echo '</form></div>';
}
/* ===========================================================================
 * 5. PANTALLA DE ADMINISTRACIÓN
 *
 * Una tabla sencilla para ver lo registrado sin salir de WordPress.
 * =========================================================================== */
function bitacora_menu_admin() {
    add_menu_page(
        'Bitácora Registro',
        'Bitácora',
        'read',                 // cualquier usuario logueado puede ver
        'bitacora-registro',
        'bitacora_pantalla_admin',
        'dashicons-star-filled',
        30
    );
}
add_action( 'admin_menu', 'bitacora_menu_admin' );

/**
 * Panel de diagnóstico en el escritorio: comprueba que el servidor puede
 * generar la ficha .docx (extensión ZipArchive y plantilla subida).
 */
function bitacora_panel_diagnostico() {
    $dir_ficha = __DIR__ . '/ficha';
    $plantilla = defined( 'BITACORA_PLANTILLA' ) ? BITACORA_PLANTILLA : $dir_ficha . '/plantilla_ficha.docx';

    $ok  = '<span style="color:#137333;font-weight:700">&#10003;</span>';
    $bad = '<span style="color:#b32d2e;font-weight:700">&#10007;</span>';

    $zip_ok       = class_exists( 'ZipArchive' );
    $plantilla_ok = file_exists( $plantilla );
    $todo_ok      = $zip_ok && $plantilla_ok;

    $filas = array(
        array( 'ZipArchive (extensión de PHP)', $zip_ok ? $ok . ' disponible' : $bad . ' no está activa &mdash; actívala en tu hosting' ),
        array( 'Plantilla (' . esc_html( basename( $plantilla ) ) . ')', $plantilla_ok ? $ok . ' subida' : $bad . ' falta en el servidor' ),
    );

    echo '<div style="margin:22px 0;padding:2px 18px 12px;border:1px solid #c3c4c7;border-left:4px solid ' . ( $todo_ok ? '#137333' : '#dba617' ) . ';background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Generador de fichas (.docx)</h2>';
    echo '<table class="widefat striped"><tbody>';
    foreach ( $filas as $f ) {
        echo '<tr><td style="width:300px"><strong>' . esc_html( $f[0] ) . '</strong></td><td>' . $f[1] . '</td></tr>';
    }
    echo '</tbody></table>';
    echo $todo_ok
        ? '<p style="color:#137333"><strong>Todo listo:</strong> el botón «Ficha» del listado debería funcionar.</p>'
        : '<p><strong>Falta algo</strong> (las filas con &#10007;).</p>';

    $ultimo = get_option( 'bitacora_error_ficha' );
    if ( $ultimo ) {
        echo '<p style="margin-top:14px"><strong>Último intento fallido al generar una ficha:</strong></p>';
        echo '<pre style="white-space:pre-wrap;background:#fcf0f1;border:1px solid #f0c3c4;padding:10px 12px;border-radius:4px;color:#8a1f1f">' . esc_html( $ultimo ) . '</pre>';
        echo '<p style="color:#646970;font-size:12px">Se actualiza cada vez que el botón «Ficha» falla. Si ya funciona, ignóralo.</p>';
    }
    echo '</div>';
}

function bitacora_pantalla_admin() {
    global $wpdb;
    $tabla = bitacora_nombre_tabla();

    $activas  = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NULL ORDER BY creado_en DESC, id DESC LIMIT 100" );
    // Esta pantalla la abre cualquier usuario con sesión (capacidad `read`): la
    // papelera de los demás solo la ve el administrador, igual que en la REST API.
    $de_quien = current_user_can( 'manage_options' ) ? '' : $wpdb->prepare( ' AND usuario_id = %d', get_current_user_id() );
    $borradas = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NOT NULL$de_quien ORDER BY borrada_en DESC LIMIT 50" );

    echo '<div class="wrap"><h1>Bitácora Registro</h1>';
    echo '<p>Observaciones activas: <strong>' . count( $activas ) . '</strong>';
    if ( $borradas ) {
        echo ' &nbsp;·&nbsp; En la papelera: <strong>' . count( $borradas ) . '</strong>';
    }
    echo '</p>';

    bitacora_panel_diagnostico();

    bitacora_panel_objetos();

    bitacora_panel_observadores();

    bitacora_oal_panel();

    bitacora_panel_legacy();

    if ( empty( $activas ) && empty( $borradas ) ) {
        echo '<p>Todavía no hay observaciones. Registra la primera desde el formulario.</p></div>';
        return;
    }

    bitacora_tabla_admin( $activas, 'Observaciones registradas' );

    if ( $borradas ) {
        bitacora_tabla_admin( $borradas, 'Papelera (borrado suave: los datos siguen ahí)', true );
    }

    echo '</div>';
}

/**
 * Pinta una tabla de observaciones en el panel de administración.
 */
function bitacora_tabla_admin( $filas, $titulo, $es_papelera = false ) {
    if ( empty( $filas ) ) {
        return;
    }
    echo '<h2 style="margin-top:28px">' . esc_html( $titulo ) . '</h2>';
    echo '<table class="widefat striped"><thead><tr>
        <th>ID</th><th>Objeto</th><th>Observador</th><th>Telescopio</th>';
    echo $es_papelera ? '<th>Borrada</th>' : '';
    echo '</tr></thead><tbody>';

    foreach ( $filas as $f ) {
        printf(
            '<tr%s><td>%d</td><td><strong>%s</strong></td><td>%s</td><td>%s</td>',
            $es_papelera ? ' style="opacity:.6"' : '',
            $f->id,
            esc_html( $f->objeto ),
            esc_html( $f->observador ),
            esc_html( $f->telescopio )
        );
        if ( $es_papelera ) {
            printf( '<td>%s</td>', esc_html( $f->borrada_en ) );
        }
        echo '</tr>';
    }
    echo '</tbody></table>';
}
