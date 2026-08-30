<?php
declare(strict_types=1);
/* Test de bitacora_orden_de_la_ruta()
   (resources/plugins/bitacora-registro/bitacora-registro.php).

   Una salida que cruza medianoche (empieza el 4 y sigue de madrugada el 5)
   comparaba solo la HORA: la 00:30 del día 5 ordenaba antes que la 23:00 del
   día 4, y el mapa dibujaba primero el objeto visitado después. La fecha tiene
   que entrar en la comparación antes que la hora.

   Sin framework:  php scripts/test_orden_ruta_viaje.php  */

$PLUGIN = dirname( __DIR__ ) . '/resources/plugins/bitacora-registro/bitacora-registro.php';
$fuente = file_get_contents( $PLUGIN );
if ( ! preg_match( '/^function bitacora_orden_de_la_ruta\(.*?^\}/ms', $fuente, $m ) ) {
    fwrite( STDERR, "No encuentro bitacora_orden_de_la_ruta() en el plugin\n" );
    exit( 1 );
}
eval( $m[0] );

$fallos = 0;
function ok( $cond, string $et ): void {
    global $fallos;
    if ( $cond ) { echo "  ok   $et\n"; } else { $fallos++; echo "  FALLA $et\n"; }
}

function ordenar( array $lista ): array {
    usort( $lista, 'bitacora_orden_de_la_ruta' );
    return array_column( $lista, 'slug' );
}

echo "cruce de medianoche:\n";
$cruce = array(
    array( 'slug' => 'M13',  'fecha' => '2026-08-05', 'hora' => '00:30', 'id' => 2 ),
    array( 'slug' => 'M57',  'fecha' => '2026-08-04', 'hora' => '23:00', 'id' => 1 ),
);
ok( ordenar( $cruce ) === array( 'M57', 'M13' ), 'lo visitado antes de medianoche va primero' );

echo "mismo día, por hora:\n";
$mismo_dia = array(
    array( 'slug' => 'M57', 'fecha' => '2026-08-04', 'hora' => '23:00', 'id' => 2 ),
    array( 'slug' => 'M13', 'fecha' => '2026-08-04', 'hora' => '21:00', 'id' => 1 ),
);
ok( ordenar( $mismo_dia ) === array( 'M13', 'M57' ), 'dentro del mismo día manda la hora' );

echo "sin hora, al final por id:\n";
$sin_hora = array(
    array( 'slug' => 'Ficha', 'fecha' => '2026-08-04', 'hora' => '', 'id' => 9 ),
    array( 'slug' => 'M13',   'fecha' => '2026-08-05', 'hora' => '00:30', 'id' => 2 ),
    array( 'slug' => 'M57',   'fecha' => '2026-08-04', 'hora' => '23:00', 'id' => 1 ),
);
ok( ordenar( $sin_hora ) === array( 'M57', 'M13', 'Ficha' ), 'lo sin hora cierra la ruta aunque su fecha sea la más antigua' );

echo $fallos ? "\n$fallos fallo(s)\n" : "\nTodo correcto\n";
exit( $fallos ? 1 : 0 );
