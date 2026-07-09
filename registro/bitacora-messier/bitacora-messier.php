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

define( 'BITACORA_VERSION', '1.0.0' );
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
        usuario_id bigint(20) unsigned NOT NULL,
        creado_en datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY objeto (objeto),
        KEY fecha_hora_utc (fecha_hora_utc),
        KEY usuario_id (usuario_id)
    ) $collate;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );

    add_option( 'bitacora_db_version', BITACORA_VERSION );
}
register_activation_hook( __FILE__, 'bitacora_crear_tabla' );

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

/* ===========================================================================
 * 3. ENDPOINT REST: guardar una observación
 *
 * Ruta: POST /wp-json/bitacora/v1/observaciones
 * =========================================================================== */
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
}
add_action( 'rest_api_init', 'bitacora_registrar_rutas' );

/**
 * Guarda una observación. Devuelve el id creado.
 */
function bitacora_guardar_observacion( WP_REST_Request $peticion ) {
    global $wpdb;

    $d = $peticion->get_json_params();
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
        'ra'       => array( $d['ra']       ?? null, 0,    360 ),
        'dec'      => array( $d['dec']      ?? null, -90,  90  ),
        'lat'      => array( $d['lat']      ?? null, -90,  90  ),
        'lon'      => array( $d['lon']      ?? null, -180, 180 ),
        'objAlt'   => array( $d['objAlt']   ?? null, -90,  90  ),
        'objAz'    => array( $d['objAz']    ?? null, 0,    360 ),
        'sunAlt'   => array( $d['sunAlt']   ?? null, -90,  90  ),
        'moonAlt'  => array( $d['moonAlt']  ?? null, -90,  90  ),
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
    $fecha_utc_sql = gmdate( 'Y-m-d H:i:s', $ts );

    // --- Número Messier (opcional) ---
    $num = isset( $d['num'] ) && is_numeric( $d['num'] ) ? intval( $d['num'] ) : null;
    if ( null !== $num && ( $num < 1 || $num > 110 ) ) {
        return new WP_Error( 'campo_invalido', 'El número Messier debe estar entre 1 y 110.', array( 'status' => 400 ) );
    }

    $objeto = bitacora_identificador_objeto( $etiqueta, $tipo, $num );

    // --- Inserción. $wpdb->insert usa consultas preparadas: sin inyección SQL. ---
    $ok = $wpdb->insert(
        bitacora_nombre_tabla(),
        array(
            'objeto'           => $objeto,
            'objeto_etiqueta'  => $etiqueta,
            'tipo'             => $tipo,
            'num'              => $num,
            'ra'               => $v['ra'],
            'decl'             => $v['dec'],
            'observador'       => $observador,
            'telescopio'       => $telescopio,
            'fecha_hora_local' => $fecha_local,
            'fecha_hora_utc'   => $fecha_utc_sql,
            'lat'              => $v['lat'],
            'lon'              => $v['lon'],
            'obj_alt'          => $v['objAlt'],
            'obj_az'           => $v['objAz'],
            'sun_alt'          => $v['sunAlt'],
            'moon_alt'         => $v['moonAlt'],
            'usuario_id'       => get_current_user_id(),
            'creado_en'        => current_time( 'mysql', true ),
        ),
        array( '%s','%s','%s','%d','%f','%f','%s','%s','%s','%s','%f','%f','%f','%f','%f','%f','%d','%s' )
    );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo guardar la observación.', array( 'status' => 500 ) );
    }

    return new WP_REST_Response(
        array(
            'ok'      => true,
            'id'      => $wpdb->insert_id,
            'objeto'  => $objeto,
            'mensaje' => 'Observación registrada.',
        ),
        201
    );
}

/**
 * Devuelve las últimas observaciones (para comprobar que se guardan).
 */
function bitacora_listar_observaciones( WP_REST_Request $peticion ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla();
    $filas = $wpdb->get_results( "SELECT * FROM $tabla ORDER BY fecha_hora_utc DESC LIMIT 50" );
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
        'endpoint' => esc_url_raw( rest_url( 'bitacora/v1/observaciones' ) ),
        'nonce'    => wp_create_nonce( 'wp_rest' ),
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
    $filas = $wpdb->get_results( "SELECT * FROM $tabla ORDER BY fecha_hora_utc DESC LIMIT 100" );

    echo '<div class="wrap"><h1>Bitácora Messier</h1>';
    echo '<p>Observaciones registradas: <strong>' . count( $filas ) . '</strong></p>';

    if ( empty( $filas ) ) {
        echo '<p>Todavía no hay observaciones. Registra la primera desde el formulario.</p></div>';
        return;
    }

    echo '<table class="widefat striped"><thead><tr>
        <th>ID</th><th>Objeto</th><th>Observador</th><th>Telescopio</th>
        <th>Fecha (UTC)</th><th>Alt.</th><th>Az.</th><th>Alt. Sol</th><th>Alt. Luna</th>
        </tr></thead><tbody>';

    foreach ( $filas as $f ) {
        printf(
            '<tr><td>%d</td><td><strong>%s</strong></td><td>%s</td><td>%s</td><td>%s</td>
             <td>%.1f°</td><td>%.1f°</td><td>%.1f°</td><td>%.1f°</td></tr>',
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
    }
    echo '</tbody></table></div>';
}
