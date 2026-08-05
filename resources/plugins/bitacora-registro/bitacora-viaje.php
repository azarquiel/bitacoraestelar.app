<?php
/**
 * VIAJE INTERESTELAR · a qué sesión pertenece una observación
 *
 * Un viaje es la salida de UN observador, UNA noche, desde UNA base. El
 * telescopio NO entra en la identidad: cambiar de tubo a media noche no parte
 * la salida en dos (en Open Astronomy Log el `scope` cuelga de la observación,
 * no de la `session`, que se define por tiempo y sitio).
 *
 * Funciones PURAS, sin WordPress ni base de datos: el test
 * scripts/test_viaje_noche.php requiere este archivo tal cual. Es la única
 * costura de la funcionalidad; el SQL y las rutas REST se apoyan en ella.
 */

/**
 * La NOCHE a la que pertenece una observación, en 'Y-m-d'.
 *
 * Convenio de mediodía, el de la fecha juliana (que cuenta desde el mediodía
 * medio de Greenwich): la madrugada pertenece a la noche que la engendró. Antes
 * de las 12:00 la noche es la del día anterior; a partir de las 12:00, la del
 * mismo día.
 *
 *   2026-08-04 22:40  ->  2026-08-04
 *   2026-08-05 02:15  ->  2026-08-04
 *   2026-08-05 12:00  ->  2026-08-05  (el corte, exacto)
 *
 * La cuenta es sobre el reloj de PARED de la base: 'fecha' y 'hora' ya vienen
 * en hora local (lo mismo que consume bitacora-astro.js), así que la zona
 * horaria NO entra. Eso la hace inmune al horario de verano: la noche de un
 * cambio de hora se decide igual que cualquier otra, porque nunca se convierte
 * a UTC ni se restan 12 horas de reloj absoluto.
 *
 * Sin hora, la noche es la fecha tal cual: no hay con qué desplazarla, y
 * inventarse un desplazamiento movería de noche observaciones que quizá no lo
 * necesitan.
 *
 * @param string $fecha 'YYYY-MM-DD' (hora local de la base).
 * @param string $hora  'HH:MM' o 'HH:MM:SS', o '' si no se registró.
 * @return string|null  'Y-m-d', o null si la fecha no es una fecha.
 */
function bitacora_viaje_noche( $fecha, $hora = '' ) {
    $fecha = trim( (string) $fecha );
    if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})/', $fecha, $f ) ) {
        return null;
    }
    if ( ! checkdate( intval( $f[2] ), intval( $f[3] ), intval( $f[1] ) ) ) {
        return null;
    }
    $dia = $f[1] . '-' . $f[2] . '-' . $f[3];

    $hora = trim( (string) $hora );
    if ( ! preg_match( '/^([01]\d|2[0-3]):([0-5]\d)/', $hora, $h ) ) {
        return $dia;
    }
    if ( intval( $h[1] ) >= 12 ) {
        return $dia;
    }
    // Madrugada: la noche es la del día anterior. UTC fijo en el cálculo porque
    // aquí solo se resta un día de calendario, sin husos ni saltos de hora.
    $d = new DateTimeImmutable( $dia . ' 00:00:00', new DateTimeZone( 'UTC' ) );
    return $d->modify( '-1 day' )->format( 'Y-m-d' );
}

/**
 * La VENTANA de una salida —del instante en que se abrió el tubo al instante en
 * que se cerró—, en 'Y-m-d H:i', o null si su ficha no dice las dos horas.
 *
 * La noche del viaje es la del convenio de mediodía, así que el comienzo se
 * coloca sobre ella con el convenio INVERSO: a partir de las 12:00 es la tarde
 * de esa misma fecha; antes de las 12:00, la madrugada del día siguiente. El fin
 * va detrás del comienzo, y si su hora de reloj no es mayor es que se cruzó la
 * medianoche. Así una salida de 22:00 a 03:00, otra de 00:30 a 03:00 y una que
 * se alarga hasta las 13:00 se describen todas sin más datos que los suyos.
 *
 * @param object|array $viaje Con noche, comienzo y fin.
 * @return array{ini:string,fin:string}|null
 */
function bitacora_viaje_ventana( $viaje ) {
    $v     = (array) $viaje;
    $noche = isset( $v['noche'] ) ? trim( (string) $v['noche'] ) : '';
    if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $noche ) ) {
        return null;
    }
    $ini = bitacora_viaje_hora( isset( $v['comienzo'] ) ? $v['comienzo'] : '' );
    $fin = bitacora_viaje_hora( isset( $v['fin'] ) ? $v['fin'] : '' );
    if ( null === $ini || null === $fin ) {
        return null;   // una ficha a medias no describe ninguna ventana
    }
    $dia_ini = ( intval( substr( $ini, 0, 2 ) ) >= 12 ) ? $noche : bitacora_viaje_dia_siguiente( $noche );
    $dia_fin = ( $fin > $ini ) ? $dia_ini : bitacora_viaje_dia_siguiente( $dia_ini );
    return array( 'ini' => $dia_ini . ' ' . $ini, 'fin' => $dia_fin . ' ' . $fin );
}

/** Una hora de reloj 'HH:MM' normalizada, o null si no lo es. */
function bitacora_viaje_hora( $hora ) {
    return preg_match( '/^([01]\d|2[0-3]):([0-5]\d)/', trim( (string) $hora ), $h )
        ? $h[1] . ':' . $h[2]
        : null;
}

/** El día de calendario siguiente a 'Y-m-d'. UTC fijo: solo se suma un día. */
function bitacora_viaje_dia_siguiente( $dia ) {
    $d = new DateTimeImmutable( $dia . ' 00:00:00', new DateTimeZone( 'UTC' ) );
    return $d->modify( '+1 day' )->format( 'Y-m-d' );
}

/**
 * Las salidas a las que puede pertenecer una observación. Con una sola no hay
 * nada que preguntar: es LA salida, y el formulario la da por elegida.
 *
 * Manda la VENTANA: si el instante de la observación cae entre el comienzo y el
 * fin de una salida, es esa y solo esa —nadie observa desde dos sitios a la vez,
 * así que ofrecer además las otras de la noche sería preguntar algo que ya se
 * sabe—. Y vale aunque el convenio de mediodía la coloque en otra noche, que es
 * lo que pasa cuando la salida se alarga más allá de las 12:00.
 *
 * Solo cuando NINGUNA ventana lo contiene se vuelve al reparto de siempre, el de
 * la noche: es el caso de las fichas que no dicen sus horas, y el de la hora que
 * cae en el hueco entre dos salidas.
 *
 * Si dos ventanas se pisan salen las dos, porque eso NO es una elección sino un
 * error en las fichas —el observador no pudo estar en las dos a la vez— y quien
 * lo pinta tiene que poder cantarlo.
 *
 * Las que ni contienen el instante ni son de su noche se descartan: pertenecen
 * a otra salida y ofrecerlas sería invitar a colgar el objeto donde no va.
 *
 * @param array  $viajes Filas de viajes del observador, de noches cercanas.
 * @param string $fecha  'YYYY-MM-DD' de la observación (hora local de la base).
 * @param string $hora   'HH:MM' de la observación, o '' si no se registró.
 * @return array Las que contienen el instante; si ninguna, las de su noche.
 */
function bitacora_viajes_candidatos( $viajes, $fecha, $hora ) {
    $noche    = bitacora_viaje_noche( $fecha, $hora );
    $instante = bitacora_viaje_instante( $fecha, $hora );
    $dentro   = array();
    $fuera    = array();
    foreach ( (array) $viajes as $viaje ) {
        $fila    = (array) $viaje;
        $ventana = ( null === $instante ) ? null : bitacora_viaje_ventana( $viaje );
        $suya    = ( null !== $noche ) && isset( $fila['noche'] ) && (string) $fila['noche'] === $noche;
        if ( $ventana && $instante >= $ventana['ini'] && $instante <= $ventana['fin'] ) {
            $dentro[] = $viaje;
        } elseif ( $suya ) {
            $fuera[] = $viaje;
        }
    }
    return $dentro ? $dentro : $fuera;
}

/**
 * El instante de una observación en 'Y-m-d H:i', comparable como texto con las
 * ventanas, o null si no hay fecha y hora con las que situarlo.
 */
function bitacora_viaje_instante( $fecha, $hora ) {
    if ( ! preg_match( '/^(\d{4}-\d{2}-\d{2})/', trim( (string) $fecha ), $f ) ) {
        return null;
    }
    $h = bitacora_viaje_hora( $hora );
    return ( null === $h ) ? null : $f[1] . ' ' . $h;
}

/**
 * El LUGAR que le queda al viaje después de guardar una observación suya.
 *
 * El lugar es de la salida, no del objeto, pero el registro sigue pidiéndolo
 * cuando el viaje no lo tiene: sin él no hay altura ni azimut. Esa respuesta
 * SUBE al viaje —vale para toda la noche— y así los siguientes objetos ya no
 * tienen que contestarla otra vez.
 *
 * Y no vuelve a bajar: en cuanto el viaje tiene lugar, manda él. Cambiarlo se
 * hace en su ficha, no registrando un objeto; si no, el último objeto de la
 * noche mudaría de sitio la salida entera a espaldas del observador.
 *
 * @return int El base_id del viaje (0 = sin lugar).
 */
function bitacora_viaje_base_efectiva( $base_viaje, $base_observacion ) {
    $base_viaje = max( 0, intval( $base_viaje ) );
    if ( $base_viaje > 0 ) {
        return $base_viaje;
    }
    return max( 0, intval( $base_observacion ) );
}

/**
 * La CLAVE del viaje al que pertenece una observación, o null si la fecha no
 * sirve para situarla en ninguna noche.
 *
 * El LUGAR es del viaje y es opcional: se puede salir a observar sin registrar
 * desde dónde, y aun así la salida existe. Un viaje sin base lleva base 0
 * ("sin lugar") en vez de NULL, porque la clave única de MySQL admite varios
 * NULL: con NULL, cada guardado abriría un viaje nuevo para la misma noche.
 *
 * Es la misma función para las dos rutas que la necesitan —guardar una
 * observación nueva y repartir las históricas en el backfill—, y de ahí que sea
 * estable: la misma entrada da siempre la misma salida, que es lo que hace el
 * backfill relanzable sin duplicar viajes.
 *
 * @return array{usuario_id:int,base_id:int,noche:string}|null
 */
function bitacora_viaje_clave( $usuario_id, $base_id, $fecha, $hora = '' ) {
    $usuario_id = intval( $usuario_id );
    $base_id    = intval( $base_id );
    if ( $base_id < 0 ) {
        $base_id = 0;   // una base imposible es no tener base, no otro lugar
    }
    if ( $usuario_id <= 0 ) {
        return null;
    }
    $noche = bitacora_viaje_noche( $fecha, $hora );
    if ( null === $noche ) {
        return null;
    }
    return array(
        'usuario_id' => $usuario_id,
        'base_id'    => $base_id,
        'noche'      => $noche,
    );
}
