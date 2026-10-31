<?php
/**
 * Equipo prestado (#499). PURO: sin WordPress ni base de datos.
 *
 * Una pieza es PRESTADA si su `usuario_id` no es NULL (catálogo) ni el de la
 * observación. Se deduce al leer; no hay columna que lo guarde, y NO depende de
 * que el dueño siga compartiendo: revocar no cambia la marca (CONTEXT.md,
 * «Pieza prestada»). Una pieza con id guardado cuya fila ya no existe es
 * «Equipo no disponible»: no se sabe de quién era y se excluye por prudencia.
 * Una observación sin id de pieza (texto libre antiguo) no marca nada.
 */

/**
 * @param int   $obs_usuario_id Cuenta dueña de la observación.
 * @param array $piezas         Lista de array( tipo, id ), como `bitacora_equipo_piezas`.
 * @param array $duenos         'tipo:id' => usuario_id (null = catálogo) de las filas que EXISTEN.
 * @return array {
 *   prestado:      array( array( tipo, id, dueno_id ) ),
 *   no_disponible: array( array( tipo, id ) ),
 *   calibra:       bool  true = entra en la calibración del equipo del observador.
 * }
 */
function bitacora_equipo_prestado( $obs_usuario_id, $piezas, $duenos ) {
    $obs_usuario_id = intval( $obs_usuario_id );
    $prestado       = array();
    $no_disponible  = array();
    foreach ( $piezas as $p ) {
        list( $tipo, $id ) = $p;
        $clave = $tipo . ':' . $id;
        if ( ! array_key_exists( $clave, $duenos ) ) {
            $no_disponible[] = array( 'tipo' => $tipo, 'id' => $id );
            continue;
        }
        $dueno = $duenos[ $clave ];
        // Sin cuenta dueña (filas anteriores a las cuentas) no hay con quién comparar.
        if ( null !== $dueno && $obs_usuario_id > 0 && intval( $dueno ) !== $obs_usuario_id ) {
            $prestado[] = array( 'tipo' => $tipo, 'id' => $id, 'dueno_id' => intval( $dueno ) );
        }
    }
    return array(
        'prestado'      => $prestado,
        'no_disponible' => $no_disponible,
        'calibra'       => ! $prestado && ! $no_disponible,
    );
}
