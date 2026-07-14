<?php
/**
 * Plugin Name: Bitácora Registro
 * Description: Almacena observaciones astronómicas en una tabla propia (SQL estándar, portable). Expone un endpoint REST protegido por sesión de WordPress.
 * Version:     1.14.1
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

define( 'BITACORA_VERSION', '1.14.1' );
define( 'BITACORA_TABLA', 'bitacora_observaciones' );
define( 'BITACORA_TABLA_ENTRADAS', 'bitacora_entradas' );
define( 'BITACORA_TABLA_IMAGENES', 'bitacora_imagenes' );
define( 'BITACORA_TABLA_OBJETOS', 'bitacora_objetos' );
define( 'BITACORA_TABLA_OBSERVADORES', 'bitacora_observadores' );
define( 'BITACORA_TABLA_FICHAS', 'bitacora_fichas' );

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

/** Nombre real de la tabla de imágenes (una entrada tiene varias). */
function bitacora_nombre_tabla_imagenes() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA_IMAGENES;
}

/** Nombre real de la tabla de objetos del mapa (catálogo de representación). */
function bitacora_nombre_tabla_objetos() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA_OBJETOS;
}

/** Nombre real de la tabla de observadores (catálogo). */
function bitacora_nombre_tabla_observadores() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA_OBSERVADORES;
}

/** Nombre real de la tabla de fichas (astrometría de cada observación). */
function bitacora_nombre_tabla_fichas() {
    global $wpdb;
    return $wpdb->prefix . BITACORA_TABLA_FICHAS;
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
        ra double DEFAULT NULL,
        decl double DEFAULT NULL,
        observador varchar(160) NOT NULL DEFAULT '',
        telescopio varchar(160) NOT NULL DEFAULT '',
        fecha_observacion varchar(32) NOT NULL DEFAULT '',
        default_index smallint(6) NOT NULL DEFAULT 0,
        origen varchar(16) NOT NULL DEFAULT 'formulario',
        observador_id bigint(20) unsigned DEFAULT NULL,
        usuario_id bigint(20) unsigned NOT NULL,
        creado_en datetime NOT NULL,
        actualizado_en datetime DEFAULT NULL,
        borrada_en datetime DEFAULT NULL,
        PRIMARY KEY  (id),
        KEY objeto (objeto),
        KEY usuario_id (usuario_id),
        KEY observador_id (observador_id),
        KEY borrada_en (borrada_en)
    ) $collate;";

    // Tabla hija: las entradas de una observación, una por ocular/aumento.
    $tabla_entradas = bitacora_nombre_tabla_entradas();
    $sql_entradas = "CREATE TABLE $tabla_entradas (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        observacion_id bigint(20) unsigned NOT NULL,
        orden smallint(6) NOT NULL DEFAULT 0,
        aumento double DEFAULT NULL,
        campo_real double DEFAULT NULL,
        pupila_salida double DEFAULT NULL,
        boton varchar(160) NOT NULL DEFAULT '',
        titulo varchar(160) NOT NULL DEFAULT '',
        descripcion longtext NOT NULL,
        imagen_id bigint(20) unsigned DEFAULT NULL,
        imagen_url varchar(255) NOT NULL DEFAULT '',
        creado_en datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY observacion_id (observacion_id)
    ) $collate;";

    // Tabla nieta: las imágenes de cada entrada. Cubren dos usos:
    //  - tipo 'principal': el boceto/foto del objeto a ese aumento; puede haber
    //    varias con su 'etiqueta' (pestañas: "sin filtro", "con filtro"...).
    //  - tipo 'anexo': imagen de apoyo a la descripción, con 'etiqueta' (título)
    //    y 'pos' (left/right).
    $tabla_imagenes = bitacora_nombre_tabla_imagenes();
    $sql_imagenes = "CREATE TABLE $tabla_imagenes (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        entrada_id bigint(20) unsigned NOT NULL,
        orden smallint(6) NOT NULL DEFAULT 0,
        tipo varchar(16) NOT NULL DEFAULT 'principal',
        imagen_id bigint(20) unsigned DEFAULT NULL,
        imagen_url varchar(255) NOT NULL DEFAULT '',
        etiqueta varchar(255) NOT NULL DEFAULT '',
        pos varchar(16) NOT NULL DEFAULT '',
        creado_en datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY entrada_id (entrada_id)
    ) $collate;";

    // Tabla independiente: los objetos del mapa de la Vía Láctea. Es metadato
    // de REPRESENTACIÓN (color, posiciones, enlace al PDF), no ligado a ninguna
    // observación concreta. Sustituye al bloque OBJECTS de via-lactea-datos.js.
    $tabla_objetos = bitacora_nombre_tabla_objetos();
    $sql_objetos = "CREATE TABLE $tabla_objetos (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        slug varchar(64) NOT NULL,
        num smallint(6) DEFAULT NULL,
        nombre varchar(255) NOT NULL DEFAULT '',
        etiqueta varchar(64) NOT NULL DEFAULT '',
        color varchar(16) NOT NULL DEFAULT '',
        ficha varchar(64) NOT NULL DEFAULT '',
        coords_texto varchar(255) NOT NULL DEFAULT '',
        top_x double DEFAULT NULL,
        top_y double DEFAULT NULL,
        edge_x double DEFAULT NULL,
        edge_y double DEFAULT NULL,
        creado_en datetime NOT NULL,
        actualizado_en datetime DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY slug (slug)
    ) $collate;";

    // Catálogo de observadores: quién observa. Cada observación enlaza a uno
    // (observador_id). Permite en el futuro filtrar el mapa por observador.
    $tabla_observadores = bitacora_nombre_tabla_observadores();
    $sql_observadores = "CREATE TABLE $tabla_observadores (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        clave varchar(96) NOT NULL,
        nombre varchar(160) NOT NULL DEFAULT '',
        equipo varchar(160) DEFAULT NULL,
        usuario_id bigint(20) unsigned DEFAULT NULL,
        creado_en datetime NOT NULL,
        actualizado_en datetime DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY clave (clave)
    ) $collate;";

    // Ficha (astrometría) de una observación: los datos de la sesión necesarios
    // para la ficha imprimible. Relación 1:1 con la observación (mapa/contenido).
    $tabla_fichas = bitacora_nombre_tabla_fichas();
    $sql_fichas = "CREATE TABLE $tabla_fichas (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        observacion_id bigint(20) unsigned NOT NULL,
        ra double DEFAULT NULL,
        decl double DEFAULT NULL,
        fecha_hora_local varchar(32) NOT NULL DEFAULT '',
        fecha_hora_utc datetime DEFAULT NULL,
        lat double DEFAULT NULL,
        lon double DEFAULT NULL,
        obj_alt double DEFAULT NULL,
        obj_az double DEFAULT NULL,
        sun_alt double DEFAULT NULL,
        moon_alt double DEFAULT NULL,
        sqm double DEFAULT NULL,
        ir double DEFAULT NULL,
        temp double DEFAULT NULL,
        pdf varchar(255) NOT NULL DEFAULT '',
        lugar varchar(255) NOT NULL DEFAULT '',
        fecha varchar(64) NOT NULL DEFAULT '',
        creado_en datetime NOT NULL,
        actualizado_en datetime DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY observacion_id (observacion_id)
    ) $collate;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );
    dbDelta( $sql_entradas );
    dbDelta( $sql_imagenes );
    dbDelta( $sql_objetos );
    dbDelta( $sql_observadores );
    dbDelta( $sql_fichas );

    // Rellena el catálogo y enlaza las observaciones ya existentes por su nombre.
    bitacora_backfill_observadores();

    // Migra la astrometría de las observaciones existentes a la tabla de fichas.
    if ( ! get_option( 'bitacora_fichas_migradas' ) ) {
        $obs_todas = $wpdb->get_results( "SELECT * FROM $tabla" );
        foreach ( $obs_todas as $ob ) {
            $ya = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $tabla_fichas WHERE observacion_id = %d", $ob->id ) );
            if ( $ya ) {
                continue;
            }
            $wpdb->insert( $tabla_fichas, array(
                'observacion_id'   => $ob->id,
                'ra'               => isset( $ob->ra ) ? $ob->ra : null,
                'decl'             => isset( $ob->decl ) ? $ob->decl : null,
                'fecha_hora_local' => isset( $ob->fecha_hora_local ) ? $ob->fecha_hora_local : '',
                'fecha_hora_utc'   => isset( $ob->fecha_hora_utc ) ? $ob->fecha_hora_utc : null,
                'lat'              => isset( $ob->lat ) ? $ob->lat : null,
                'lon'              => isset( $ob->lon ) ? $ob->lon : null,
                'obj_alt'          => isset( $ob->obj_alt ) ? $ob->obj_alt : null,
                'obj_az'           => isset( $ob->obj_az ) ? $ob->obj_az : null,
                'sun_alt'          => isset( $ob->sun_alt ) ? $ob->sun_alt : null,
                'moon_alt'         => isset( $ob->moon_alt ) ? $ob->moon_alt : null,
                'sqm'              => isset( $ob->sqm ) ? $ob->sqm : null,
                'ir'               => isset( $ob->ir ) ? $ob->ir : null,
                'temp'             => isset( $ob->temp ) ? $ob->temp : null,
                'pdf'              => isset( $ob->pdf ) ? $ob->pdf : '',
                'lugar'            => isset( $ob->lugar ) ? $ob->lugar : '',
                'fecha'            => isset( $ob->fecha ) ? $ob->fecha : '',
                'creado_en'        => current_time( 'mysql', true ),
            ) );
        }
        update_option( 'bitacora_fichas_migradas', 1 );
    }

    // Fase 3: garantiza que TODA observación (incluidas las históricas) tenga su
    // ficha con la sesión, ANTES de retirar las columnas duplicadas.
    if ( ! get_option( 'bitacora_fichas_backfill_v2' ) ) {
        $todas = $wpdb->get_results( "SELECT * FROM $tabla" );
        foreach ( $todas as $ob ) {
            $ya = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $tabla_fichas WHERE observacion_id = %d", $ob->id ) );
            if ( $ya ) {
                continue;
            }
            $fila = array( 'observacion_id' => $ob->id, 'creado_en' => current_time( 'mysql', true ) );
            foreach ( array( 'ra', 'decl', 'fecha_hora_local', 'fecha_hora_utc', 'lat', 'lon', 'obj_alt', 'obj_az', 'sun_alt', 'moon_alt', 'sqm', 'ir', 'temp', 'pdf', 'lugar', 'fecha' ) as $c ) {
                if ( isset( $ob->$c ) ) {
                    $fila[ $c ] = $ob->$c;
                }
            }
            $wpdb->insert( $tabla_fichas, $fila );
        }
        update_option( 'bitacora_fichas_backfill_v2', 1 );
    }

    // Retira de la observación las columnas de sesión ya duplicadas en la ficha.
    if ( ! get_option( 'bitacora_columnas_sesion_retiradas' ) ) {
        foreach ( array( 'fecha_hora_local', 'fecha_hora_utc', 'lat', 'lon', 'obj_alt', 'obj_az', 'sun_alt', 'moon_alt', 'sqm', 'ir', 'temp', 'pdf', 'lugar', 'fecha' ) as $c ) {
            $existe = $wpdb->get_var( $wpdb->prepare(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
                DB_NAME, $tabla, $c
            ) );
            if ( $existe ) {
                $wpdb->query( "ALTER TABLE $tabla DROP COLUMN $c" );
            }
        }
        update_option( 'bitacora_columnas_sesion_retiradas', 1 );
    }

    // Instalaciones anteriores: aflojar los campos astrométricos (las
    // observaciones históricas no los tienen). Se hace una sola vez.
    if ( ! get_option( 'bitacora_schema_legacy' ) ) {
        foreach ( array( 'ra', 'decl', 'lat', 'lon', 'obj_alt', 'obj_az', 'sun_alt', 'moon_alt' ) as $c ) {
            $wpdb->query( "ALTER TABLE $tabla MODIFY $c double DEFAULT NULL" );
        }
        $wpdb->query( "ALTER TABLE $tabla MODIFY fecha_hora_utc datetime DEFAULT NULL" );
        $wpdb->query( "ALTER TABLE $tabla_entradas MODIFY aumento double DEFAULT NULL" );
        $wpdb->query( "ALTER TABLE $tabla_entradas MODIFY campo_real double DEFAULT NULL" );
        update_option( 'bitacora_schema_legacy', 1 );
    }

    // El PDF de la ficha pertenece a la observación, no al objeto: si una versión
    // anterior creó la columna 'pdf' en la tabla de objetos, la eliminamos.
    $col_pdf = $wpdb->get_var( $wpdb->prepare(
        "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'pdf'",
        DB_NAME, $tabla_objetos
    ) );
    if ( $col_pdf ) {
        $wpdb->query( "ALTER TABLE $tabla_objetos DROP COLUMN pdf" );
    }

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

    // --- Fecha de la observación (opcional, para el mapa: 'cuándo se observó') ---
    $fecha_obs = sanitize_text_field( $d['fechaObservacion'] ?? '' );

    // --- RA/Dec: obligatorios (identifican el objeto; permiten calcular la ficha) ---
    $v = array();
    foreach ( array( 'ra' => array( 0, 360 ), 'dec' => array( -90, 90 ) ) as $campo => $rng ) {
        $resultado = bitacora_validar_num( $d[ $campo ] ?? null, $rng[0], $rng[1], $campo );
        if ( is_wp_error( $resultado ) ) {
            return $resultado;
        }
        $v[ $campo ] = $resultado;
    }

    // --- Resto de astrometría: OPCIONAL (su sitio es la ficha, Form 2) ---
    $opcionales = array(
        'lat'     => array( -90,  90  ),
        'lon'     => array( -180, 180 ),
        'objAlt'  => array( -90,  90  ),
        'objAz'   => array( 0,    360 ),
        'sunAlt'  => array( -90,  90  ),
        'moonAlt' => array( -90,  90  ),
    );
    foreach ( $opcionales as $campo => $rng ) {
        $valor = $d[ $campo ] ?? null;
        if ( null === $valor || '' === $valor ) {
            $v[ $campo ] = null;
            continue;
        }
        $resultado = bitacora_validar_num( $valor, $rng[0], $rng[1], $campo );
        if ( is_wp_error( $resultado ) ) {
            return $resultado;
        }
        $v[ $campo ] = $resultado;
    }

    // --- Fechas (opcionales; su sitio es la ficha) ---
    $fecha_local   = sanitize_text_field( $d['fechaHoraLocal'] ?? '' );
    $fecha_utc_raw = sanitize_text_field( $d['fechaHoraUTC'] ?? '' );
    $fecha_utc     = ( $fecha_utc_raw && strtotime( $fecha_utc_raw ) ) ? gmdate( 'Y-m-d H:i:s', strtotime( $fecha_utc_raw ) ) : null;

    // --- Enlace a la ficha publicada (PDF), opcional ---
    $pdf = isset( $d['pdf'] ) ? esc_url_raw( $d['pdf'] ) : '';

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
        'objeto'          => bitacora_identificador_objeto( $etiqueta, $tipo, $num ),
        'objeto_etiqueta' => $etiqueta,
        'tipo'            => $tipo,
        'num'             => $num,
        'ra'              => $v['ra'],
        'decl'            => $v['dec'],
        'observador'      => $observador,
        'telescopio'      => $telescopio,
        'fecha_observacion' => $fecha_obs,
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
    $base[] = '%s'; // pdf
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

    // Datos de ficha (astrometría) de una observación: leer y guardar.
    register_rest_route(
        'bitacora/v1',
        '/observaciones/(?P<id>\d+)/ficha-datos',
        array(
            array(
                'methods'             => 'GET',
                'callback'            => 'bitacora_leer_ficha_datos',
                'permission_callback' => $solo_logueados,
            ),
            array(
                'methods'             => 'PUT',
                'callback'            => 'bitacora_guardar_ficha_datos',
                'permission_callback' => $solo_logueados,
            ),
        )
    );

    // Objetos del mapa. Lectura PÚBLICA: son datos que hoy ya se sirven de forma
    // abierta en via-lactea-datos.js. El futuro visor los leerá de aquí.
    register_rest_route(
        'bitacora/v1',
        '/objetos',
        array(
            'methods'             => 'GET',
            'callback'            => 'bitacora_listar_objetos',
            'permission_callback' => '__return_true',
        )
    );

    // Observadores (catálogo). Lectura pública, para filtrar el mapa por autor.
    register_rest_route(
        'bitacora/v1',
        '/observadores',
        array(
            'methods'             => 'GET',
            'callback'            => 'bitacora_listar_observadores',
            'permission_callback' => '__return_true',
        )
    );

    // Datos del visor: emite OBSERVADORES/OBJECTS/OBSERVACIONES como JavaScript,
    // en el mismo formato que via-lactea-datos.js. Lectura pública.
    register_rest_route(
        'bitacora/v1',
        '/datos.js',
        array(
            'methods'             => 'GET',
            'callback'            => 'bitacora_datos_js',
            'permission_callback' => '__return_true',
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

/** Devuelve las entradas de una observación, cada una con sus imágenes. */
function bitacora_obtener_entradas( $observacion_id ) {
    global $wpdb;
    $t_ent = bitacora_nombre_tabla_entradas();
    $t_img = bitacora_nombre_tabla_imagenes();

    $entradas = $wpdb->get_results(
        $wpdb->prepare( "SELECT * FROM $t_ent WHERE observacion_id = %d ORDER BY orden ASC, id ASC", $observacion_id )
    );
    foreach ( $entradas as $en ) {
        $en->imagenes = $wpdb->get_results(
            $wpdb->prepare( "SELECT * FROM $t_img WHERE entrada_id = %d ORDER BY orden ASC, id ASC", $en->id )
        );
    }
    return $entradas;
}

/**
 * Valida la lista de entradas recibida del navegador. Devuelve un array de
 * filas listas para la BD, o WP_Error. Una observación sin entradas es válida.
 * Cada entrada puede traer varias imágenes ('principal' con etiqueta, 'anexo'
 * con etiqueta/título y posición).
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

        // Descripción: se admite HTML seguro (párrafos, listas, negrita...).
        $desc = wp_kses_post( isset( $e['descripcion'] ) ? $e['descripcion'] : '' );
        if ( '' === trim( wp_strip_all_tags( $desc ) ) ) {
            return new WP_Error( 'entrada_invalida', "Entrada $n: falta la descripción.", array( 'status' => 400 ) );
        }

        // Nombre del ocular (opcional), p. ej. "Nagler 31mm".
        $titulo = sanitize_text_field( isset( $e['titulo'] ) ? $e['titulo'] : '' );

        // Pupila de salida (mm), opcional.
        $pupila = isset( $e['pupilaSalida'] ) ? $e['pupilaSalida'] : null;
        if ( null === $pupila || '' === $pupila ) {
            $pupila = null;
        } elseif ( is_numeric( $pupila ) && $pupila > 0 && $pupila <= 15 ) {
            $pupila = floatval( $pupila );
        } else {
            return new WP_Error( 'entrada_invalida', "Entrada $n: la pupila de salida (mm) está fuera de rango.", array( 'status' => 400 ) );
        }

        // Imágenes de la entrada (opcionales).
        $imagenes = array();
        if ( isset( $e['imagenes'] ) && is_array( $e['imagenes'] ) ) {
            foreach ( array_values( $e['imagenes'] ) as $img ) {
                $img_id  = ( isset( $img['imagenId'] ) && is_numeric( $img['imagenId'] ) ) ? intval( $img['imagenId'] ) : null;
                $img_url = isset( $img['imagenUrl'] ) ? esc_url_raw( $img['imagenUrl'] ) : '';
                if ( null === $img_id && '' === $img_url ) {
                    continue; // imagen vacía: se ignora
                }
                $tipo = ( isset( $img['tipo'] ) && 'anexo' === $img['tipo'] ) ? 'anexo' : 'principal';
                $pos  = ( isset( $img['pos'] ) && in_array( $img['pos'], array( 'left', 'right' ), true ) ) ? $img['pos'] : '';
                $imagenes[] = array(
                    'tipo'      => $tipo,
                    'imagen_id' => $img_id,
                    'imagen_url'=> $img_url,
                    'etiqueta'  => sanitize_text_field( isset( $img['etiqueta'] ) ? $img['etiqueta'] : '' ),
                    'pos'       => $pos,
                );
            }
        }

        $salida[] = array(
            'aumento'       => floatval( $aumento ),
            'campo_real'    => floatval( $campo ),
            'pupila_salida' => $pupila,
            'titulo'        => $titulo,
            'descripcion'   => $desc,
            'imagenes'      => $imagenes,
        );
    }
    return $salida;
}

/**
 * Reemplaza TODAS las entradas de una observación (y sus imágenes) por la lista
 * dada. Se usa al crear y al editar.
 */
function bitacora_guardar_entradas( $observacion_id, $entradas ) {
    global $wpdb;
    $t_ent = bitacora_nombre_tabla_entradas();
    $t_img = bitacora_nombre_tabla_imagenes();

    // Borra las imágenes de las entradas previas y luego las entradas.
    $previas = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM $t_ent WHERE observacion_id = %d", $observacion_id ) );
    if ( $previas ) {
        $ids = implode( ',', array_map( 'intval', $previas ) );
        $wpdb->query( "DELETE FROM $t_img WHERE entrada_id IN ($ids)" );
    }
    $wpdb->delete( $t_ent, array( 'observacion_id' => $observacion_id ), array( '%d' ) );

    $orden = 0;
    foreach ( $entradas as $e ) {
        $wpdb->insert(
            $t_ent,
            array(
                'observacion_id' => $observacion_id,
                'orden'          => $orden,
                'aumento'        => $e['aumento'],
                'campo_real'     => $e['campo_real'],
                'pupila_salida'  => $e['pupila_salida'],
                'titulo'         => $e['titulo'],
                'descripcion'    => $e['descripcion'],
                'creado_en'      => current_time( 'mysql', true ),
            ),
            array(
                '%d', // observacion_id
                '%d', // orden
                '%f', // aumento
                '%f', // campo_real
                ( null === $e['pupila_salida'] ) ? '%s' : '%f', // pupila (NULL como %s)
                '%s', // titulo
                '%s', // descripcion
                '%s', // creado_en
            )
        );
        $entrada_id = $wpdb->insert_id;

        $io = 0;
        foreach ( $e['imagenes'] as $img ) {
            $wpdb->insert(
                $t_img,
                array(
                    'entrada_id' => $entrada_id,
                    'orden'      => $io,
                    'tipo'       => $img['tipo'],
                    'imagen_id'  => $img['imagen_id'],
                    'imagen_url' => $img['imagen_url'],
                    'etiqueta'   => $img['etiqueta'],
                    'pos'        => $img['pos'],
                    'creado_en'  => current_time( 'mysql', true ),
                ),
                array(
                    '%d', // entrada_id
                    '%d', // orden
                    '%s', // tipo
                    ( null === $img['imagen_id'] ) ? '%s' : '%d', // imagen_id (NULL como %s)
                    '%s', // imagen_url
                    '%s', // etiqueta
                    '%s', // pos
                    '%s', // creado_en
                )
            );
            $io++;
        }
        $orden++;
    }
}

/* ===========================================================================
 * 2-QUATER. CATÁLOGO DE OBSERVADORES
 *
 * Cada observación la hace un único observador. El catálogo se construye solo:
 * al guardar, el nombre del observador se busca (o se crea) aquí y la
 * observación queda enlazada por observador_id. Sirve para filtrar por autor.
 * =========================================================================== */

/** Busca un observador por su nombre; si no existe, lo crea. Devuelve su id. */
function bitacora_observador_id_desde_nombre( $nombre, $usuario_id = 0 ) {
    global $wpdb;
    $nombre = trim( (string) $nombre );
    if ( '' === $nombre ) {
        return null;
    }
    $tabla = bitacora_nombre_tabla_observadores();
    $clave = sanitize_title( $nombre );
    if ( '' === $clave ) {
        $clave = 'obs-' . substr( md5( $nombre ), 0, 12 );
    }
    $id = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $tabla WHERE clave = %s", $clave ) );
    if ( $id ) {
        return intval( $id );
    }
    $wpdb->insert(
        $tabla,
        array(
            'clave'      => $clave,
            'nombre'     => $nombre,
            'equipo'     => null,
            'usuario_id' => $usuario_id ? intval( $usuario_id ) : null,
            'creado_en'  => current_time( 'mysql', true ),
        ),
        array( '%s', '%s', '%s', $usuario_id ? '%d' : '%s', '%s' )
    );
    return intval( $wpdb->insert_id );
}

/** Enlaza una observación con su observador (find-or-create por nombre). */
function bitacora_asignar_observador( $observacion_id, $nombre, $usuario_id = 0 ) {
    global $wpdb;
    $oid = bitacora_observador_id_desde_nombre( $nombre, $usuario_id );
    if ( $oid ) {
        $wpdb->update(
            bitacora_nombre_tabla(),
            array( 'observador_id' => $oid ),
            array( 'id' => $observacion_id ),
            array( '%d' ),
            array( '%d' )
        );
    }
    return $oid;
}

/** Rellena observador_id en las observaciones que aún no lo tengan. */
function bitacora_backfill_observadores() {
    global $wpdb;
    $tabla = bitacora_nombre_tabla();
    $cols = $wpdb->get_col( "DESC $tabla", 0 );
    if ( ! in_array( 'observador_id', (array) $cols, true ) ) {
        return; // la columna aún no existe
    }
    $filas = $wpdb->get_results(
        "SELECT id, observador, usuario_id FROM $tabla WHERE ( observador_id IS NULL OR observador_id = 0 ) AND observador <> ''"
    );
    foreach ( $filas as $f ) {
        bitacora_asignar_observador( intval( $f->id ), $f->observador, intval( $f->usuario_id ) );
    }
}

/** Lista los observadores, cada uno con su nº de observaciones activas. */
function bitacora_listar_observadores( WP_REST_Request $peticion ) {
    global $wpdb;
    $t_obs = bitacora_nombre_tabla_observadores();
    $t_ob  = bitacora_nombre_tabla();
    $sql = "SELECT o.*, ( SELECT COUNT(*) FROM $t_ob b WHERE b.observador_id = o.id AND b.borrada_en IS NULL ) AS num_observaciones
            FROM $t_obs o ORDER BY o.nombre ASC";
    $filas = $wpdb->get_results( $sql );
    return new WP_REST_Response( $filas ? $filas : array(), 200 );
}

/* ===========================================================================
 * 2-SEXIES. DATOS DEL VISOR (emite via-lactea-datos.js desde la base de datos)
 * =========================================================================== */

/** Construye la cadena "lugar" del visor a partir de la ficha. */
function bitacora_lugar_visor( $ficha ) {
    if ( ! $ficha ) {
        return '';
    }
    if ( isset( $ficha->lugar ) && '' !== $ficha->lugar ) {
        return $ficha->lugar;
    }
    $p = array();
    if ( isset( $ficha->sqm ) && null !== $ficha->sqm && '' !== $ficha->sqm ) {
        $p[] = 'SQM-L ' . ( 0 + $ficha->sqm );
    }
    if ( isset( $ficha->ir ) && null !== $ficha->ir && '' !== $ficha->ir ) {
        $p[] = 'IR ' . ( 0 + $ficha->ir ) . 'º';
    }
    if ( isset( $ficha->temp ) && null !== $ficha->temp && '' !== $ficha->temp ) {
        $p[] = ( 0 + $ficha->temp ) . 'º amb.';
    }
    return implode( ' · ', $p );
}

/** Deriva el "boton" de una entrada (p. ej. "70x - 1º 10’ - 6.6mm"). */
function bitacora_boton_de_entrada( $e ) {
    if ( null === $e->aumento || '' === $e->aumento ) {
        return 'Exploración';
    }
    $partes = array( ( 0 + $e->aumento ) . 'x' );
    if ( isset( $e->campo_real ) && null !== $e->campo_real && '' !== $e->campo_real ) {
        $deg = floatval( $e->campo_real );
        $d = floor( $deg );
        $m = round( ( $deg - $d ) * 60 );
        $partes[] = ( $d > 0 ) ? ( $d . 'º ' . $m . '’' ) : ( $m . '’' );
    }
    if ( isset( $e->pupila_salida ) && null !== $e->pupila_salida && '' !== $e->pupila_salida ) {
        $partes[] = ( 0 + $e->pupila_salida ) . 'mm';
    }
    return implode( ' - ', $partes );
}

/** Emite el JavaScript de datos del visor (OBSERVADORES, OBJECTS, OBSERVACIONES). */
function bitacora_datos_js( WP_REST_Request $peticion ) {
    global $wpdb;
    $t_ob  = bitacora_nombre_tabla();
    $t_ent = bitacora_nombre_tabla_entradas();
    $t_img = bitacora_nombre_tabla_imagenes();
    $t_obj = bitacora_nombre_tabla_objetos();
    $t_obs = bitacora_nombre_tabla_observadores();
    $t_fic = bitacora_nombre_tabla_fichas();

    // OBSERVADORES { clave: { nombre, equipo } } y mapa id -> clave.
    $observadores = array();
    $clave_por_id = array();
    foreach ( $wpdb->get_results( "SELECT * FROM $t_obs" ) as $o ) {
        $observadores[ $o->clave ] = array( 'nombre' => $o->nombre, 'equipo' => $o->equipo );
        $clave_por_id[ (int) $o->id ] = $o->clave;
    }

    // OBJECTS [ { id, name, label, color, ficha, coords, top, edge } ]
    $objetos = array();
    foreach ( $wpdb->get_results( "SELECT * FROM $t_obj ORDER BY num ASC, slug ASC" ) as $o ) {
        $objetos[] = array(
            'id'     => $o->slug,
            'name'   => $o->nombre,
            'label'  => $o->etiqueta,
            'color'  => $o->color,
            'ficha'  => $o->ficha ? $o->ficha : $o->slug,
            'coords' => $o->coords_texto,
            'top'    => array( 'x' => floatval( $o->top_x ), 'y' => floatval( $o->top_y ) ),
            'edge'   => array( 'x' => floatval( $o->edge_x ), 'y' => floatval( $o->edge_y ) ),
        );
    }

    // OBSERVACIONES { slug: [ { observador, fecha, lugar, instrumento, pdf, defaultIndex, entries } ] }
    $observaciones = array();
    $obs_rows = $wpdb->get_results( "SELECT * FROM $t_ob WHERE borrada_en IS NULL ORDER BY id ASC" );
    foreach ( $obs_rows as $ob ) {
        $slug = strtolower( preg_replace( '/[^A-Za-z0-9]/', '', $ob->objeto ) );
        if ( '' === $slug ) {
            continue;
        }
        $ficha = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $t_fic WHERE observacion_id = %d", $ob->id ) );

        $entradas = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t_ent WHERE observacion_id = %d ORDER BY orden ASC, id ASC", $ob->id ) );
        $entries = array();
        foreach ( $entradas as $e ) {
            $principales = array();
            $anexos = array();
            $imgs = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM $t_img WHERE entrada_id = %d ORDER BY orden ASC, id ASC", $e->id ) );
            foreach ( $imgs as $im ) {
                if ( 'anexo' === $im->tipo ) {
                    $anexos[] = array( 'img' => $im->imagen_url, 'titulo' => $im->etiqueta, 'pos' => $im->pos ? $im->pos : 'right' );
                } else {
                    $principales[] = array( 'archivo' => $im->imagen_url, 'etiqueta' => $im->etiqueta );
                }
            }
            // img: null | 'archivo' | [ {archivo, etiqueta} ] (con imgMode:'tabs')
            $img = null;
            $img_mode = '';
            if ( 1 === count( $principales ) && '' === $principales[0]['etiqueta'] ) {
                $img = $principales[0]['archivo'];
            } elseif ( count( $principales ) >= 1 ) {
                $img = $principales;
                $img_mode = 'tabs';
            }
            $entry = array(
                'boton'  => $e->boton ? $e->boton : bitacora_boton_de_entrada( $e ),
                'titulo' => $e->titulo,
                'img'    => $img,
                'html'   => $e->descripcion,
            );
            if ( '' !== $img_mode ) {
                $entry['imgMode'] = $img_mode;
            }
            if ( $anexos ) {
                $entry['anexos'] = $anexos;
            }
            $entries[] = $entry;
        }

        $registro = array(
            'observador'   => isset( $clave_por_id[ (int) $ob->observador_id ] ) ? $clave_por_id[ (int) $ob->observador_id ] : '',
            'fecha'        => isset( $ob->fecha_observacion ) ? $ob->fecha_observacion : '',
            'lugar'        => bitacora_lugar_visor( $ficha ),
            'instrumento'  => $ob->telescopio,
            'pdf'          => $ficha ? $ficha->pdf : '',
            'defaultIndex' => (int) $ob->default_index,
            'entries'      => $entries,
        );
        if ( ! isset( $observaciones[ $slug ] ) ) {
            $observaciones[ $slug ] = array();
        }
        $observaciones[ $slug ][] = $registro;
    }

    while ( ob_get_level() > 0 ) {
        ob_end_clean();
    }
    if ( ! headers_sent() ) {
        nocache_headers();
        header( 'Content-Type: application/javascript; charset=utf-8' );
        header( 'X-Content-Type-Options: nosniff' );
    }
    echo "/* Generado por Bitácora Registro desde la base de datos. No editar a mano. */\n";
    echo 'var OBSERVADORES = ' . wp_json_encode( (object) $observadores ) . ";\n";
    echo 'var OBJECTS = ' . wp_json_encode( $objetos ) . ";\n";
    echo 'var OBSERVACIONES = ' . wp_json_encode( (object) $observaciones ) . ";\n";
    exit;
}

/* ===========================================================================
 * 2-TER. OBJETOS DEL MAPA (catálogo de representación en la Vía Láctea)
 *
 * Tabla independiente de las observaciones. Se siembra desde el JSON empaquetado
 * datos/objetos-seed.json (extraído de via-lactea-datos.js) con un botón en el
 * panel de administración. La importación es idempotente (clave única: slug).
 * =========================================================================== */

/** Lista todos los objetos del mapa (para el visor y para comprobación). */
function bitacora_listar_objetos( WP_REST_Request $peticion ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla_objetos();
    $filas = $wpdb->get_results( "SELECT * FROM $tabla ORDER BY num ASC, slug ASC" );
    return new WP_REST_Response( $filas ? $filas : array(), 200 );
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

    $tabla = bitacora_nombre_tabla_objetos();
    $insertados = 0;
    $actualizados = 0;

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
        );
        $formatos = array(
            '%s',                              // slug
            ( null === $num ) ? '%s' : '%d',   // num
            '%s', '%s', '%s', '%s', '%s',      // nombre, etiqueta, color, ficha, coords
            ( null === $fila['top_x'] )  ? '%s' : '%f',
            ( null === $fila['top_y'] )  ? '%s' : '%f',
            ( null === $fila['edge_x'] ) ? '%s' : '%f',
            ( null === $fila['edge_y'] ) ? '%s' : '%f',
        );

        $existe = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $tabla WHERE slug = %s", $slug ) );
        if ( $existe ) {
            $fila['actualizado_en'] = current_time( 'mysql', true );
            $fmt = $formatos;
            $fmt[] = '%s';
            $wpdb->update( $tabla, $fila, array( 'id' => intval( $existe ) ), $fmt, array( '%d' ) );
            $actualizados++;
        } else {
            $fila['creado_en'] = current_time( 'mysql', true );
            $fmt = $formatos;
            $fmt[] = '%s';
            $wpdb->insert( $tabla, $fila, $fmt );
            $insertados++;
        }
    }
    return array( 'insertados' => $insertados, 'actualizados' => $actualizados );
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

    $total = intval( $wpdb->get_var( "SELECT COUNT(*) FROM $t WHERE origen = 'legacy'" ) );

    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Observaciones históricas (de via-lactea-datos.js)</h2>';
    echo '<p>Importadas en la base de datos: <strong>' . $total . '</strong>. Incluyen sus entradas por ocular, textos e imágenes.</p>';
    echo '<form method="post">';
    wp_nonce_field( 'bitacora_importar_legacy' );
    echo '<button type="submit" name="bitacora_importar_legacy" value="1" class="button button-primary">Importar / reimportar observaciones históricas</button>';
    echo ' <span style="color:#646970">Idempotente: reemplaza las históricas por las de la semilla (no toca las que registres con el formulario).</span>';
    echo '</form></div>';
}

/** Panel del escritorio: catálogo de observadores. */
function bitacora_panel_observadores() {
    global $wpdb;
    $t = bitacora_nombre_tabla_observadores();
    $obs = $wpdb->get_results(
        "SELECT o.*, ( SELECT COUNT(*) FROM " . bitacora_nombre_tabla() . " b WHERE b.observador_id = o.id AND b.borrada_en IS NULL ) AS num FROM $t o ORDER BY o.nombre ASC"
    );
    echo '<div style="margin:22px 0;padding:2px 18px 14px;border:1px solid #c3c4c7;border-left:4px solid #2271b1;background:#fff;max-width:820px">';
    echo '<h2 style="margin-top:14px">Observadores</h2>';
    if ( empty( $obs ) ) {
        echo '<p>Todavía no hay observadores. Se crean solos al registrar observaciones.</p></div>';
        return;
    }
    echo '<p>Disponibles en <code>/wp-json/bitacora/v1/observadores</code>. Filtra observaciones con <code>?observador=ID</code>.</p>';
    echo '<table class="widefat striped"><thead><tr><th>ID</th><th>Nombre</th><th>Clave</th><th>Observaciones</th></tr></thead><tbody>';
    foreach ( $obs as $o ) {
        printf(
            '<tr><td>%d</td><td><strong>%s</strong></td><td>%s</td><td>%d</td></tr>',
            intval( $o->id ), esc_html( $o->nombre ), esc_html( $o->clave ), intval( $o->num )
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
    echo '</form></div>';
}

/* ===========================================================================
 * 2-QUINQUE. DATOS DE FICHA (astrometría de una observación)
 *
 * La observación (objeto, observador, entradas) vive en su tabla; los datos de
 * la sesión que necesita la ficha imprimible (fecha, lugar, altitud/azimut,
 * Sol/Luna, condiciones, PDF) viven aquí, enlazados 1:1 por observacion_id.
 * =========================================================================== */

/** Devuelve la ficha (astrometría) de una observación, o null. */
function bitacora_obtener_ficha( $observacion_id ) {
    global $wpdb;
    $tabla = bitacora_nombre_tabla_fichas();
    return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $tabla WHERE observacion_id = %d", $observacion_id ) );
}

/** Valida y normaliza los datos de ficha (todos opcionales). */
function bitacora_validar_ficha_datos( $d ) {
    if ( ! is_array( $d ) ) {
        return new WP_Error( 'sin_datos', 'No se recibieron datos.', array( 'status' => 400 ) );
    }

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
        if ( null === $valor || '' === $valor ) {
            $v[ $campo ] = null;
            continue;
        }
        $r = bitacora_validar_num( $valor, $min, $max, $campo );
        if ( is_wp_error( $r ) ) {
            return $r;
        }
        $v[ $campo ] = $r;
    }

    $fecha_local   = sanitize_text_field( $d['fechaHoraLocal'] ?? '' );
    $fecha_utc_raw = sanitize_text_field( $d['fechaHoraUTC'] ?? '' );
    $fecha_utc     = $fecha_utc_raw && strtotime( $fecha_utc_raw ) ? gmdate( 'Y-m-d H:i:s', strtotime( $fecha_utc_raw ) ) : null;

    $cielo = array();
    foreach ( array( 'sqm' => array( 0, 25 ), 'ir' => array( -50, 50 ), 'temp' => array( -50, 60 ) ) as $c => $rng ) {
        $val = $d[ $c ] ?? null;
        if ( null === $val || '' === $val ) {
            $cielo[ $c ] = null;
        } elseif ( is_numeric( $val ) && $val >= $rng[0] && $val <= $rng[1] ) {
            $cielo[ $c ] = floatval( $val );
        } else {
            return new WP_Error( 'campo_invalido', "El campo '$c' está fuera de rango.", array( 'status' => 400 ) );
        }
    }

    return array(
        'ra'               => $v['ra'],
        'decl'             => $v['dec'],
        'fecha_hora_local' => $fecha_local,
        'fecha_hora_utc'   => $fecha_utc,
        'lat'              => $v['lat'],
        'lon'              => $v['lon'],
        'obj_alt'          => $v['objAlt'],
        'obj_az'           => $v['objAz'],
        'sun_alt'          => $v['sunAlt'],
        'moon_alt'         => $v['moonAlt'],
        'sqm'              => $cielo['sqm'],
        'ir'               => $cielo['ir'],
        'temp'             => $cielo['temp'],
        'pdf'              => esc_url_raw( $d['pdf'] ?? '' ),
    );
}

/** GET: devuelve los datos de ficha de una observación (para precargar Form 2). */
function bitacora_leer_ficha_datos( WP_REST_Request $peticion ) {
    $id  = intval( $peticion['id'] );
    $obs = bitacora_obtener( $id );
    if ( ! $obs || $obs->borrada_en ) {
        return new WP_Error( 'no_encontrada', 'Esa observación no existe.', array( 'status' => 404 ) );
    }
    $ficha = bitacora_obtener_ficha( $id );
    return new WP_REST_Response( $ficha ? $ficha : new stdClass(), 200 );
}

/** PUT: crea o actualiza los datos de ficha de una observación (solo su autor). */
function bitacora_guardar_ficha_datos( WP_REST_Request $peticion ) {
    global $wpdb;
    $id  = intval( $peticion['id'] );
    $obs = bitacora_obtener( $id );

    $permiso = bitacora_puede_modificar( $obs );
    if ( is_wp_error( $permiso ) ) {
        return $permiso;
    }

    $datos = bitacora_validar_ficha_datos( $peticion->get_json_params() );
    if ( is_wp_error( $datos ) ) {
        return $datos;
    }

    $tabla  = bitacora_nombre_tabla_fichas();
    $existe = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM $tabla WHERE observacion_id = %d", $id ) );
    if ( $existe ) {
        $datos['actualizado_en'] = current_time( 'mysql', true );
        $wpdb->update( $tabla, $datos, array( 'observacion_id' => $id ) );
    } else {
        $datos['observacion_id'] = $id;
        $datos['creado_en']      = current_time( 'mysql', true );
        $wpdb->insert( $tabla, $datos );
    }

    return new WP_REST_Response( array( 'ok' => true, 'id' => $id, 'mensaje' => 'Datos de ficha guardados.' ), 200 );
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

    // Sin formatos explícitos: $wpdb usa %s para todo y convierte null en NULL,
    // así los campos astrométricos vacíos (ahora en la ficha) se guardan NULL.
    $ok = $wpdb->insert( bitacora_nombre_tabla(), $datos );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo guardar la observación.', array( 'status' => 500 ) );
    }

    $id = $wpdb->insert_id;
    bitacora_asignar_observador( $id, $datos['observador'], get_current_user_id() );
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

    $ok = $wpdb->update(
        bitacora_nombre_tabla(),
        $datos,
        array( 'id' => $id )
    );

    if ( false === $ok ) {
        return new WP_Error( 'error_bd', 'No se pudo actualizar la observación.', array( 'status' => 500 ) );
    }

    bitacora_asignar_observador( $id, $datos['observador'], intval( $obs->usuario_id ) );

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
        'Nombre_objeto'     => bitacora_ficha_nombre_largo( $obs ),
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

    $filtro_observador = intval( $peticion->get_param( 'observador' ) );
    if ( $filtro_observador ) {
        $where   .= ' AND observador_id = %d';
        $params[] = $filtro_observador;
    }

    $sql = "SELECT * FROM $tabla WHERE $where ORDER BY creado_en DESC, id DESC LIMIT 200";
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
    $borradas = $wpdb->get_results( "SELECT * FROM $tabla WHERE borrada_en IS NOT NULL ORDER BY borrada_en DESC LIMIT 50" );

    echo '<div class="wrap"><h1>Bitácora Registro</h1>';
    echo '<p>Observaciones activas: <strong>' . count( $activas ) . '</strong>';
    if ( $borradas ) {
        echo ' &nbsp;·&nbsp; En la papelera: <strong>' . count( $borradas ) . '</strong>';
    }
    echo '</p>';

    bitacora_panel_diagnostico();

    bitacora_panel_objetos();

    bitacora_panel_observadores();

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
