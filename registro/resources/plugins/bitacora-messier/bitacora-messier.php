<?php
/**
 * Plugin Name: Bitácora Messier
 * Description: Almacena observaciones astronómicas en una tabla propia (SQL estándar, portable). Expone un endpoint REST protegido por sesión de WordPress.
 * Version:     1.4.0
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

define( 'BITACORA_VERSION', '1.4.0' );
define( 'BITACORA_TABLA', 'bitacora_observaciones' );
define( 'BITACORA_TABLA_ENTRADAS', 'bitacora_entradas' );

/**
 * Nombre real de la tabla, con el prefijo que use esta instalación
 * (normalmente wp_, pero puede ser otro).
 */
function bitacora_nombre_tabla() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA;
}

/** Nombre real de la tabla de entradas (una observación tiene varias). */
function bitacora_nombre_tabla_entradas() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA_ENTRADAS;
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

    // Tabla hija: las entradas de una observación, una por ocular/aumento.
    $tabla_entradas = bitacora_nombre_tabla_entradas();
    $sql_entradas = "CREATE TABLE $tabla_entradas (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        observacion_id bigint(20) unsigned NOT NULL,
        orden smallint(6) NOT NULL DEFAULT 0,
        aumento double NOT NULL,
        campo_real double NOT NULL,
        pupila_salida double DEFAULT NULL,
        descripcion longtext NOT NULL,
        imagen_id bigint(20) unsigned DEFAULT NULL,
        imagen_url varchar(255) NOT NULL DEFAULT '',
        creado_en datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY observacion_id (observacion_id)
    ) $collate;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );
    dbDelta( $sql_entradas );

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

    // Generar y descargar la ficha .docx de una observación.
    register_rest_route(
        'bitacora/v1',
        '/observaciones/(?P<id>\d+)/ficha',
        array(
            'methods'             => 'GET',
            'callback'            => 'bitacora_generar_ficha',
            'permission_callback' => $solo_logueados,
        )
    );
}
add_action( 'rest_api_init', 'bitacora_registrar_rutas' );

/* ===========================================================================
 * 2-BIS. ENTRADAS POR OCULAR (una observación tiene varias)
 *
 * Cada entrada es lo observado a un aumento concreto: el aumento, el campo real
 * que da el ocular en ese telescopio, la pupila de salida (opcional), una
 * descripción (obligatoria) y, opcionalmente, una imagen ya orientada
 * (Norte abajo, Oeste a la izquierda) que de momento solo se guarda.
 * =========================================================================== */

/** Devuelve las entradas de una observación, ordenadas. */
function bitacora_obtener_entradas( $observacion_id ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla_entradas();
    return $wpdb->get_results(
        $wpdb->prepare( "SELECT * FROM $tabla WHERE observacion_id = %d ORDER BY orden ASC, id ASC", $observacion_id )
    );
}

/**
 * Valida la lista de entradas recibida del navegador. Devuelve un array de
 * filas listas para la BD, o WP_Error. Una observación sin entradas es válida.
 */
function bitacora_validar_entradas( $lista ) {
    if ( empty( $lista ) ) {
        return array();
    }
    if ( ! is_array( $lista ) ) {
        return new WP_Error( 'entradas_invalidas', 'El formato de las entradas no es válido.', array( 'status' => 400 ) );
    }

    $salida = array();
    foreach ( array_values( $lista ) as $i => $e ) {
        $n = $i + 1;

        $aumento = isset( $e['aumento'] ) ? $e['aumento'] : null;
        if ( ! is_numeric( $aumento ) || $aumento <= 0 || $aumento > 10000 ) {
            return new WP_Error( 'entrada_invalida', "Entrada $n: el aumento debe ser un número mayor que 0.", array( 'status' => 400 ) );
        }

        // Campo real en grados decimales (p. ej. 1.17 para 1º 10').
        $campo = isset( $e['campoReal'] ) ? $e['campoReal'] : null;
        if ( ! is_numeric( $campo ) || $campo <= 0 || $campo > 10 ) {
            return new WP_Error( 'entrada_invalida', "Entrada $n: el campo real (en grados) debe estar entre 0 y 10.", array( 'status' => 400 ) );
        }

        $desc = sanitize_textarea_field( isset( $e['descripcion'] ) ? $e['descripcion'] : '' );
        if ( '' === trim( $desc ) ) {
            return new WP_Error( 'entrada_invalida', "Entrada $n: falta la descripción.", array( 'status' => 400 ) );
        }

        // Pupila de salida (mm), opcional.
        $pupila = isset( $e['pupilaSalida'] ) ? $e['pupilaSalida'] : null;
        if ( null === $pupila || '' === $pupila ) {
            $pupila = null;
        } elseif ( is_numeric( $pupila ) && $pupila > 0 && $pupila <= 15 ) {
            $pupila = floatval( $pupila );
        } else {
            return new WP_Error( 'entrada_invalida', "Entrada $n: la pupila de salida (mm) está fuera de rango.", array( 'status' => 400 ) );
        }

        // Imagen (opcional): id de la biblioteca de medios y/o su URL.
        $img_id  = ( isset( $e['imagenId'] ) && is_numeric( $e['imagenId'] ) ) ? intval( $e['imagenId'] ) : null;
        $img_url = isset( $e['imagenUrl'] ) ? esc_url_raw( $e['imagenUrl'] ) : '';

        $salida[] = array(
            'aumento'       => floatval( $aumento ),
            'campo_real'    => floatval( $campo ),
            'pupila_salida' => $pupila,
            'descripcion'   => $desc,
            'imagen_id'     => $img_id,
            'imagen_url'    => $img_url,
        );
    }
    return $salida;
}

/**
 * Reemplaza TODAS las entradas de una observación por la lista dada (borra las
 * previas e inserta las nuevas). Se usa al crear y al editar.
 */
function bitacora_guardar_entradas( $observacion_id, $entradas ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla_entradas();

    $wpdb->delete( $tabla, array( 'observacion_id' => $observacion_id ), array( '%d' ) );

    $orden = 0;
    foreach ( $entradas as $e ) {
        $fila = array(
            'observacion_id' => $observacion_id,
            'orden'          => $orden,
            'aumento'        => $e['aumento'],
            'campo_real'     => $e['campo_real'],
            'pupila_salida'  => $e['pupila_salida'],
            'descripcion'    => $e['descripcion'],
            'imagen_id'      => $e['imagen_id'],
            'imagen_url'     => $e['imagen_url'],
            'creado_en'      => current_time( 'mysql', true ),
        );
        $formatos = array(
            '%d', // observacion_id
            '%d', // orden
            '%f', // aumento
            '%f', // campo_real
            ( null === $e['pupila_salida'] ) ? '%s' : '%f', // pupila (NULL como %s)
            '%s', // descripcion
            ( null === $e['imagen_id'] ) ? '%s' : '%d',     // imagen_id (NULL como %s)
            '%s', // imagen_url
            '%s', // creado_en
        );
        $wpdb->insert( $tabla, $fila, $formatos );
        $orden++;
    }
}

/**
 * Guarda una observación. Devuelve el id creado.
 */
function bitacora_guardar_observacion( WP_REST_Request $peticion ) {
    global $wpdb;

    $params = $peticion->get_json_params();

    $datos = bitacora_validar_datos( $params );
    if ( is_wp_error( $datos ) ) {
        return $datos;
    }

    // Entradas por ocular (opcionales). Se validan ANTES de tocar la BD, para
    // no dejar una observación a medias si alguna entrada es incorrecta.
    $entradas = bitacora_validar_entradas( isset( $params['entradas'] ) ? $params['entradas'] : array() );
    if ( is_wp_error( $entradas ) ) {
        return $entradas;
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

    $id = $wpdb->insert_id;
    bitacora_guardar_entradas( $id, $entradas );

    return new WP_REST_Response(
        array(
            'ok'      => true,
            'id'      => $id,
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
    $obs->entradas = bitacora_obtener_entradas( $obs->id );
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

    $params = $peticion->get_json_params();

    $datos = bitacora_validar_datos( $params );
    if ( is_wp_error( $datos ) ) {
        return $datos;
    }

    $entradas = bitacora_validar_entradas( isset( $params['entradas'] ) ? $params['entradas'] : array() );
    if ( is_wp_error( $entradas ) ) {
        return $entradas;
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

    // Reemplaza el conjunto de entradas por el recibido.
    bitacora_guardar_entradas( $id, $entradas );

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
        $salida .= $r['apertura'] . bitacora_docx_encode( $nuevo[ $idx ] ) . $r['cierre'];
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
    $p = array();
    if ( null !== $obs->sqm  && '' !== $obs->sqm  ) {
        $p[] = 'SQM-L ' . ( 0 + $obs->sqm );
    }
    if ( null !== $obs->ir   && '' !== $obs->ir   ) {
        $p[] = 'IR ' . ( 0 + $obs->ir ) . "\xc2\xb0";
    }
    if ( null !== $obs->temp && '' !== $obs->temp ) {
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

    // Marcas [entre corchetes] de la plantilla -> valores de la observación.
    $valores = array(
        'Nombre_observador' => $obs->observador ? $obs->observador : '',
        'Nombre_objeto'     => bitacora_ficha_nombre_largo( $obs ),
        'Catálogo'          => bitacora_catalogo_de( $obs ),
        'Datos_del_dielo'   => bitacora_ficha_datos_cielo( $obs ),  // errata original de la plantilla
        'Datos_del_cielo'   => bitacora_ficha_datos_cielo( $obs ),  // por si algún día la corriges
        'altitud_sol'       => bitacora_ficha_grados( $obs->sun_alt ),
        'altitud_luna'      => bitacora_ficha_grados( $obs->moon_alt ),
        'altitud_objeto'    => bitacora_ficha_grados( $obs->obj_alt ),
        'azimut_objeto'     => bitacora_ficha_azimut( $obs->obj_az ),
        'Telescopio'        => $obs->telescopio ? $obs->telescopio : '',
    );
    $constelacion = bitacora_ficha_constelacion_coords( $obs );

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
    $slug = strtolower( preg_replace( '/[^A-Za-z0-9]/', '', $obs->objeto ) );
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
        'media'     => esc_url_raw( rest_url( 'wp/v2/media' ) ),
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

    $activas  = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NULL ORDER BY fecha_hora_utc DESC LIMIT 100" );
    $borradas = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NOT NULL ORDER BY borrada_en DESC LIMIT 50" );

    echo '<div class="wrap"><h1>Bitácora Messier</h1>';
    echo '<p>Observaciones activas: <strong>' . count( $activas ) . '</strong>';
    if ( $borradas ) {
        echo ' &nbsp;·&nbsp; En la papelera: <strong>' . count( $borradas ) . '</strong>';
    }
    echo '</p>';

    bitacora_panel_diagnostico();

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
