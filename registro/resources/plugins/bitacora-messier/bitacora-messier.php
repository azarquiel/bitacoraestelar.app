<?php
/**
 * Plugin Name: Bitácora Messier
 * Description: Almacena observaciones astronómicas en una tabla propia (SQL estándar, portable). Expone un endpoint REST protegido por sesión de WordPress.
 * Version:     1.0.0
 * Author:      Israel Pérez de Tudela Vázquez
 * License:     GPL-2.0-or-later
 *
 * ---------------------------------------------------------------------------
 * NOTA DE DISEÑO
 * Los datos NO se guardan como Custom Post Type ni en wp_postmeta, sino en una
 * tabla propia con columnas explícitas. Así la información es SQL estándar y
 * migrable a cualquier otro sistema (Supabase, PostgreSQL...) con un simple
 * export/import, sin depender de WordPress ni de ningún plugin.
 *
 * WordPress se usa solo para lo que hace bien: autenticar al usuario.
 * ---------------------------------------------------------------------------
 */

// Impide el acceso directo al archivo.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'BITACORA_VERSION', '1.2.0' );
define( 'BITACORA_TABLA', 'bitacora_observaciones' );

/**
 * Nombre real de la tabla, con el prefijo que use esta instalación
 * (normalmente wp_, pero puede ser otro).
 */
function bitacora_nombre_tabla() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA;
}

/* ===========================================================================
 * 1. CREACIÓN DE LA TABLA (al activar el plugin)
 *
 * Un campo por cada dato que produce el formulario. Nada especulativo.
 * =========================================================================== */
function bitacora_crear_tabla() {
    global $wpdb;
    $tabla   = bitacora_nombre_tabla();
    $collate = $wpdb->get_charset_collate();

    // dbDelta es exigente con el formato: dos espacios tras PRIMARY KEY,
    // tipos en minúscula, una definición por línea.
    $sql = "CREATE TABLE $tabla (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        objeto varchar(64) NOT NULL,
        objeto_etiqueta varchar(255) NOT NULL DEFAULT '',
        tipo varchar(16) NOT NULL DEFAULT '',
        num smallint(6) DEFAULT NULL,
        ra double NOT NULL,
        decl double NOT NULL,
        observador varchar(160) NOT NULL DEFAULT '',
        telescopio varchar(160) NOT NULL DEFAULT '',
        fecha_hora_local varchar(32) NOT NULL DEFAULT '',
        fecha_hora_utc datetime NOT NULL,
        lat double NOT NULL,
        lon double NOT NULL,
        obj_alt double NOT NULL,
        obj_az double NOT NULL,
        sun_alt double NOT NULL,
        moon_alt double NOT NULL,
        sqm double DEFAULT NULL,
        ir double DEFAULT NULL,
        temp double DEFAULT NULL,
        usuario_id bigint(20) unsigned NOT NULL,
        creado_en datetime NOT NULL,
        actualizado_en datetime DEFAULT NULL,
        borrada_en datetime DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY objeto (objeto),
        KEY fecha_hora_utc (fecha_hora_utc),
        KEY usuario_id (usuario_id),
        KEY borrada_en (borrada_en)
    ) $collate;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );

    update_option( 'bitacora_db_version', BITACORA_VERSION );
}
register_activation_hook( __FILE__, 'bitacora_crear_tabla' );

/**
 * Migración automática: si el plugin se actualiza sin desactivarlo, la tabla
 * puede haberse creado con una versión antigua del esquema. dbDelta añade las
 * columnas que falten SIN tocar los datos existentes.
 */
function bitacora_comprobar_version() {
    if ( get_option( 'bitacora_db_version' ) !== BITACORA_VERSION ) {
        bitacora_crear_tabla();
    }
}
add_action( 'plugins_loaded', 'bitacora_comprobar_version' );

/* ===========================================================================
 * 2. VALIDACIÓN DE LOS DATOS RECIBIDOS
 *
 * Nunca confiamos en lo que llega del navegador: cualquiera puede enviar
 * datos falsos saltándose el formulario. Validamos rangos y tipos.
 * =========================================================================== */

/**
 * Extrae el identificador limpio del objeto a partir de la etiqueta.
 * "M30 · Capricornus" -> "M30"   |   "NGC 6826 (coordenadas manuales)" -> "NGC 6826"
 */
function bitacora_identificador_objeto( $etiqueta, $tipo, $num ) {
    if ( 'messier' === $tipo && $num ) {
        return 'M' . intval( $num );
    }
    // Para el resto, tomamos lo que hay antes del primer separador.
    $limpio = preg_split( '/\s+[·(]/u', trim( $etiqueta ) );
    return trim( $limpio[0] );
}

/**
 * Comprueba que un valor es numérico y está dentro de un rango.
 * Devuelve el número, o WP_Error si no es válido.
 */
function bitacora_validar_num( $valor, $min, $max, $campo ) {
    if ( ! is_numeric( $valor ) ) {
        return new WP_Error( 'campo_invalido', "El campo '$campo' debe ser numérico.", array( 'status' => 400 ) );
    }
    $n = floatval( $valor );
    if ( $n < $min || $n > $max ) {
        return new WP_Error( 'campo_invalido', "El campo '$campo' está fuera de rango ($min a $max).", array( 'status' => 400 ) );
    }
    return $n;
}

/**
 * Valida y normaliza los datos de una observación recibidos del navegador.
 * La usan tanto la creación como la edición: una sola fuente de verdad.
 *
 * @return array|WP_Error Array listo para insertar/actualizar, o el error.
 */
function bitacora_validar_datos( $d ) {
    if ( empty( $d ) ) {
        return new WP_Error( 'sin_datos', 'No se recibieron datos.', array( 'status' => 400 ) );
    }

    // --- Campos obligatorios de texto ---
    $etiqueta   = sanitize_text_field( $d['objeto'] ?? '' );
    $observador = sanitize_text_field( $d['observador'] ?? '' );
    $telescopio = sanitize_text_field( $d['telescopio'] ?? '' );
    $tipo       = sanitize_text_field( $d['tipo'] ?? '' );

    if ( '' === $etiqueta ) {
        return new WP_Error( 'campo_invalido', 'Falta el objeto observado.', array( 'status' => 400 ) );
    }
    if ( '' === $observador ) {
        return new WP_Error( 'campo_invalido', 'Falta el nombre del observador.', array( 'status' => 400 ) );
    }

    // --- Números, cada uno con su rango físico ---
    $numeros = array(
        'ra'      => array( $d['ra']      ?? null, 0,    360 ),
        'dec'     => array( $d['dec']     ?? null, -90,  90  ),
        'lat'     => array( $d['lat']     ?? null, -90,  90  ),
        'lon'     => array( $d['lon']     ?? null, -180, 180 ),
        'objAlt'  => array( $d['objAlt']  ?? null, -90,  90  ),
        'objAz'   => array( $d['objAz']   ?? null, 0,    360 ),
        'sunAlt'  => array( $d['sunAlt']  ?? null, -90,  90  ),
        'moonAlt' => array( $d['moonAlt'] ?? null, -90,  90  ),
    );
    $v = array();
    foreach ( $numeros as $campo => $spec ) {
        list( $valor, $min, $max ) = $spec;
        $resultado = bitacora_validar_num( $valor, $min, $max, $campo );
        if ( is_wp_error( $resultado ) ) {
            return $resultado;
        }
        $v[ $campo ] = $resultado;
    }

    // --- Fechas ---
    $fecha_local = sanitize_text_field( $d['fechaHoraLocal'] ?? '' );
    $fecha_utc   = sanitize_text_field( $d['fechaHoraUTC'] ?? '' );
    $ts          = strtotime( $fecha_utc );
    if ( ! $ts ) {
        return new WP_Error( 'campo_invalido', 'La fecha/hora UTC no es válida.', array( 'status' => 400 ) );
    }

    // --- Número Messier (opcional) ---
    $num = isset( $d['num'] ) && is_numeric( $d['num'] ) ? intval( $d['num'] ) : null;
    if ( null !== $num && ( $num < 1 || $num > 110 ) ) {
        return new WP_Error( 'campo_invalido', 'El número Messier debe estar entre 1 y 110.', array( 'status' => 400 ) );
    }

    // --- Datos de cielo (opcionales): null, o número en rango razonable ---
    $cielo = array();
    $rangos_cielo = array(
        'sqm'  => array( 0, 25 ),    // magnitudes por segundo de arco al cuadrado
        'ir'   => array( -50, 50 ),  // temperatura del cielo (infrarrojo), ºC
        'temp' => array( -50, 60 ),  // temperatura ambiente, ºC
    );
    foreach ( $rangos_cielo as $campo => $rango ) {
        $valor = $d[ $campo ] ?? null;
        if ( null === $valor || '' === $valor ) {
            $cielo[ $campo ] = null;
        } elseif ( is_numeric( $valor ) && $valor >= $rango[0] && $valor <= $rango[1] ) {
            $cielo[ $campo ] = floatval( $valor );
        } else {
            return new WP_Error( 'campo_invalido', "El campo '$campo' está fuera de rango.", array( 'status' => 400 ) );
        }
    }

    return array(
        'objeto'           => bitacora_identificador_objeto( $etiqueta, $tipo, $num ),
        'objeto_etiqueta'  => $etiqueta,
        'tipo'             => $tipo,
        'num'              => $num,
        'ra'               => $v['ra'],
        'decl'             => $v['dec'],
        'observador'       => $observador,
        'telescopio'       => $telescopio,
        'fecha_hora_local' => $fecha_local,
        'fecha_hora_utc'   => gmdate( 'Y-m-d H:i:s', $ts ),
        'lat'              => $v['lat'],
        'lon'              => $v['lon'],
        'obj_alt'          => $v['objAlt'],
        'obj_az'           => $v['objAz'],
        'sun_alt'          => $v['sunAlt'],
        'moon_alt'         => $v['moonAlt'],
        'sqm'              => $cielo['sqm'],
        'ir'               => $cielo['ir'],
        'temp'             => $cielo['temp'],
    );
}

/**
 * Formatos de $wpdb para los datos de bitacora_validar_datos().
 *
 * Los campos opcionales (sqm, ir, temp) pueden ser null: para que $wpdb
 * guarde NULL de verdad —y no 0— el formato de un valor null debe ser '%s'
 * (así WordPress lo trata como NULL en vez de convertirlo a 0.0 con '%f').
 */
function bitacora_formatos_datos( $datos ) {
    // 16 campos fijos: los 13 primeros y los 3 de cielo al final.
    $base = array( '%s','%s','%s','%d','%f','%f','%s','%s','%s','%s','%f','%f','%f','%f','%f','%f' );
    // Ajuste para sqm, ir, temp: si son null, formato '%s' (=> NULL).
    foreach ( array( 'sqm', 'ir', 'temp' ) as $campo ) {
        $base[] = ( null === $datos[ $campo ] ) ? '%s' : '%f';
    }
    return $base;
}

/**
 * Recupera una observación por id, o null si no existe.
 */
function bitacora_obtener( $id ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla();
    return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $tabla WHERE id = %d", $id ) );
}

/**
 * LA REGLA DE ORO: cada usuario solo puede tocar SUS observaciones.
 * Se comprueba en el servidor, no en el navegador.
 *
 * @return true|WP_Error
 */
function bitacora_puede_modificar( $observacion ) {
    if ( ! $observacion ) {
        return new WP_Error( 'no_encontrada', 'Esa observación no existe.', array( 'status' => 404 ) );
    }
    if ( intval( $observacion->usuario_id ) !== get_current_user_id() ) {
        return new WP_Error(
            'prohibido',
            'Solo puedes modificar o borrar tus propias observaciones.',
            array( 'status' => 403 )
        );
    }
    return true;
}
function bitacora_registrar_rutas() {

    // LA PUERTA DE SEGURIDAD: solo usuarios con sesión iniciada.
    // Se aplica ANTES de ejecutar el callback, tanto en POST como en GET.
    $solo_logueados = function () {
        if ( ! is_user_logged_in() ) {
            return new WP_Error(
                'no_autorizado',
                'Debes iniciar sesión para acceder a las observaciones.',
                array( 'status' => 401 )
            );
        }
        return true;
    };

    // Ambos métodos en una sola ruta: si se registraran por separado con la
    // misma URL, la segunda llamada sobrescribiría a la primera.
    register_rest_route(
        'bitacora/v1',
        '/observaciones',
        array(
            array(
                'methods'             => 'POST',
                'callback'            => 'bitacora_guardar_observacion',
                'permission_callback' => $solo_logueados,
            ),
            array(
                'methods'             => 'GET',
                'callback'            => 'bitacora_listar_observaciones',
                'permission_callback' => $solo_logueados,
            ),
        )
    );

    // Una observación concreta: leer, editar, borrar (suave) y restaurar.
    register_rest_route(
        'bitacora/v1',
        '/observaciones/(?P<id>\d+)',
        array(
            array(
                'methods'             => 'GET',
                'callback'            => 'bitacora_leer_observacion',
                'permission_callback' => $solo_logueados,
            ),
            array(
                'methods'             => 'PUT',
                'callback'            => 'bitacora_editar_observacion',
                'permission_callback' => $solo_logueados,
            ),
            array(
                'methods'             => 'DELETE',
                'callback'            => 'bitacora_borrar_observacion',
                'permission_callback' => $solo_logueados,
            ),
        )
    );

    // Restaurar una observación borrada (deshacer el borrado suave).
    register_rest_route(
        'bitacora/v1',
        '/observaciones/(?P<id>\d+)/restaurar',
        array(
            'methods'             => 'POST',
            'callback'            => 'bitacora_restaurar_observacion',
            'permission_callback' => $solo_logueados,
        )
    );
}
add_action( 'rest_api_init', 'bitacora_registrar_rutas' );

/**
 * Guarda una observación. Devuelve el id creado.
 */
function bitacora_guardar_observacion( WP_REST_Request $peticion ) {
    global $wpdb;

    $datos = bitacora_validar_datos( $peticion->get_json_params() );
    if ( is_wp_error( $datos ) ) {
        return $datos;
    }

    // Campos que fija el servidor, nunca el navegador.
    $datos['usuario_id'] = get_current_user_id();
    $datos['creado_en']  = current_time( 'mysql', true );

    $formatos   = bitacora_formatos_datos( $datos );
    $formatos[] = '%d'; // usuario_id
    $formatos[] = '%s'; // creado_en

    // $wpdb->insert usa consultas preparadas: sin inyección SQL.
    $ok = $wpdb->insert( bitacora_nombre_tabla(), $datos, $formatos );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo guardar la observación.', array( 'status' => 500 ) );
    }

    return new WP_REST_Response(
        array(
            'ok'      => true,
            'id'      => $wpdb->insert_id,
            'objeto'  => $datos['objeto'],
            'mensaje' => 'Observación registrada.',
        ),
        201
    );
}

/**
 * Devuelve una observación concreta (para precargar el formulario al editar).
 */
function bitacora_leer_observacion( WP_REST_Request $peticion ) {
    $obs = bitacora_obtener( intval( $peticion['id'] ) );
    if ( ! $obs || $obs->borrada_en ) {
        return new WP_Error( 'no_encontrada', 'Esa observación no existe.', array( 'status' => 404 ) );
    }
    return new WP_REST_Response( $obs, 200 );
}

/**
 * Edita una observación existente. Solo su autor puede hacerlo.
 */
function bitacora_editar_observacion( WP_REST_Request $peticion ) {
    global $wpdb;

    $id  = intval( $peticion['id'] );
    $obs = bitacora_obtener( $id );

    $permiso = bitacora_puede_modificar( $obs );
    if ( is_wp_error( $permiso ) ) {
        return $permiso;
    }
    if ( $obs->borrada_en ) {
        return new WP_Error( 'borrada', 'Esa observación está borrada. Restáurala antes de editarla.', array( 'status' => 409 ) );
    }

    $datos = bitacora_validar_datos( $peticion->get_json_params() );
    if ( is_wp_error( $datos ) ) {
        return $datos;
    }
    $datos['actualizado_en'] = current_time( 'mysql', true );

    $formatos   = bitacora_formatos_datos( $datos );
    $formatos[] = '%s'; // actualizado_en

    $ok = $wpdb->update(
        bitacora_nombre_tabla(),
        $datos,
        array( 'id' => $id ),
        $formatos,
        array( '%d' )
    );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo actualizar la observación.', array( 'status' => 500 ) );
    }

    return new WP_REST_Response(
        array( 'ok' => true, 'id' => $id, 'mensaje' => 'Observación actualizada.' ),
        200
    );
}

/**
 * Borrado SUAVE: marca la fila como borrada, pero no la elimina.
 * Los datos siguen ahí y se pueden restaurar.
 */
function bitacora_borrar_observacion( WP_REST_Request $peticion ) {
    global $wpdb;

    $id  = intval( $peticion['id'] );
    $obs = bitacora_obtener( $id );

    $permiso = bitacora_puede_modificar( $obs );
    if ( is_wp_error( $permiso ) ) {
        return $permiso;
    }
    if ( $obs->borrada_en ) {
        return new WP_REST_Response(
            array( 'ok' => true, 'id' => $id, 'mensaje' => 'Esa observación ya estaba borrada.' ),
            200
        );
    }

    $ok = $wpdb->update(
        bitacora_nombre_tabla(),
        array( 'borrada_en' => current_time( 'mysql', true ) ),
        array( 'id' => $id ),
        array( '%s' ),
        array( '%d' )
    );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo borrar la observación.', array( 'status' => 500 ) );
    }

    return new WP_REST_Response(
        array( 'ok' => true, 'id' => $id, 'mensaje' => 'Observación borrada. Puedes recuperarla.' ),
        200
    );
}

/**
 * Deshace un borrado suave.
 */
function bitacora_restaurar_observacion( WP_REST_Request $peticion ) {
    global $wpdb;

    $id  = intval( $peticion['id'] );
    $obs = bitacora_obtener( $id );

    $permiso = bitacora_puede_modificar( $obs );
    if ( is_wp_error( $permiso ) ) {
        return $permiso;
    }

    // Ojo: $wpdb->update() no escribe NULL de forma fiable (puede guardar ''),
    // así que hacemos la consulta explícita, igualmente preparada.
    $tabla = bitacora_nombre_tabla();
    $ok    = $wpdb->query(
        $wpdb->prepare( "UPDATE $tabla SET borrada_en = NULL WHERE id = %d", $id )
    );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo restaurar la observación.', array( 'status' => 500 ) );
    }

    return new WP_REST_Response(
        array( 'ok' => true, 'id' => $id, 'mensaje' => 'Observación restaurada.' ),
        200
    );
}

/**
 * Lista las observaciones. Por defecto excluye las borradas.
 * Acepta ?borradas=1 para ver la papelera, y ?mias=1 para filtrar por autor.
 *
 * Añade a cada fila el campo "mia": si el usuario actual puede editarla/borrarla.
 * La interfaz lo usa para mostrar u ocultar botones, pero el permiso REAL
 * se comprueba siempre en el servidor.
 */
function bitacora_listar_observaciones( WP_REST_Request $peticion ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla();

    $ver_borradas = '1' === (string) $peticion->get_param( 'borradas' );
    $solo_mias    = '1' === (string) $peticion->get_param( 'mias' );
    $usuario      = get_current_user_id();

    $where  = $ver_borradas ? 'borrada_en IS NOT NULL' : 'borrada_en IS NULL';
    $params = array();

    if ( $solo_mias ) {
        $where   .= ' AND usuario_id = %d';
        $params[] = $usuario;
    }

    $sql = "SELECT * FROM $tabla WHERE $where ORDER BY fecha_hora_utc DESC LIMIT 200";
    if ( $params ) {
        $sql = $wpdb->prepare( $sql, $params );
    }
    $filas = $wpdb->get_results( $sql );

    foreach ( $filas as $f ) {
        $f->mia = ( intval( $f->usuario_id ) === $usuario );
    }

    return new WP_REST_Response( $filas, 200 );
}

/* ===========================================================================
 * 4. PUENTE CON EL FORMULARIO (frontend)
 *
 * Inyecta en la página la URL del endpoint y un "nonce": un código de un solo
 * uso que demuestra que la petición procede de esta página y no de un sitio
 * ajeno que intente aprovechar la sesión del usuario (ataque CSRF).
 * =========================================================================== */
function bitacora_inyectar_datos() {
    // Solo tiene sentido para usuarios con sesión: son los únicos que pueden guardar.
    if ( ! is_user_logged_in() ) {
        return;
    }
    $datos = array(
        'endpoint'  => esc_url_raw( rest_url( 'bitacora/v1/observaciones' ) ),
        'nonce'     => wp_create_nonce( 'wp_rest' ),
        'usuarioId' => get_current_user_id(),
    );
    printf(
        '<script>window.BITACORA_WP = %s;</script>' . "\n",
        wp_json_encode( $datos )
    );
}
add_action( 'wp_head', 'bitacora_inyectar_datos' );

/* ===========================================================================
 * 5. PANTALLA DE ADMINISTRACIÓN
 *
 * Una tabla sencilla para ver lo registrado sin salir de WordPress.
 * =========================================================================== */
function bitacora_menu_admin() {
    add_menu_page(
        'Bitácora Messier',
        'Bitácora',
        'read',                 // cualquier usuario logueado puede ver
        'bitacora-messier',
        'bitacora_pantalla_admin',
        'dashicons-star-filled',
        30
    );
}
add_action( 'admin_menu', 'bitacora_menu_admin' );

function bitacora_pantalla_admin() {
    global $wpdb;
    $tabla = bitacora_nombre_tabla();

    $activas  = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NULL ORDER BY fecha_hora_utc DESC LIMIT 100" );
    $borradas = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NOT NULL ORDER BY borrada_en DESC LIMIT 50" );

    echo '<div class="wrap"><h1>Bitácora Messier</h1>';
    echo '<p>Observaciones activas: <strong>' . count( $activas ) . '</strong>';
    if ( $borradas ) {
        echo ' &nbsp;·&nbsp; En la papelera: <strong>' . count( $borradas ) . '</strong>';
    }
    echo '</p>';

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
        <th>ID</th><th>Objeto</th><th>Observador</th><th>Telescopio</th>
        <th>Fecha (UTC)</th><th>Alt.</th><th>Az.</th><th>Alt. Sol</th><th>Alt. Luna</th>';
    echo $es_papelera ? '<th>Borrada</th>' : '';
    echo '</tr></thead><tbody>';

    foreach ( $filas as $f ) {
        printf(
            '<tr%s><td>%d</td><td><strong>%s</strong></td><td>%s</td><td>%s</td><td>%s</td>
             <td>%.1f°</td><td>%.1f°</td><td>%.1f°</td><td>%.1f°</td>',
            $es_papelera ? ' style="opacity:.6"' : '',
            $f->id,
            esc_html( $f->objeto ),
            esc_html( $f->observador ),
            esc_html( $f->telescopio ),
            esc_html( $f->fecha_hora_utc ),
            $f->obj_alt,
            $f->obj_az,
            $f->sun_alt,
            $f->moon_alt
        );
        if ( $es_papelera ) {
            printf( '<td>%s</td>', esc_html( $f->borrada_en ) );
        }
        echo '</tr>';
    }
    echo '</tbody></table>';
}
