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
