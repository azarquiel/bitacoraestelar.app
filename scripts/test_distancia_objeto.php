<?php
declare(strict_types=1);
/* Test de la DISTANCIA AL SOL de un objeto del mapa
   (resources/plugins/bitacora-registro/bitacora-distancia.php).

   Sin distancia un objeto no se pinta: la observación se guarda y el mapa se
   queda vacío, en silencio. Eso fue el bug de NGC 2022 y NGC 2024, y de ahí
   salen los dos casos dorados de abajo: SIMBAD no publica ninguna medida de
   ninguno de los dos, pero del primero sí tiene paralaje (0,4378 mas), así que
   se coloca solo; del segundo no tiene nada y solo lo salva la mano.

   Sin framework:  php scripts/test_distancia_objeto.php  */

require __DIR__ . '/../resources/plugins/bitacora-registro/bitacora-distancia.php';

$fallos = 0;
function eq($a, $b, string $et): void {
    global $fallos;
    if ($a === $b) { echo "  ok   $et\n"; }
    else { $fallos++; echo "  FALLA $et\n         esperado " . var_export($b, true) . "\n         obtenido " . var_export($a, true) . "\n"; }
}

echo "bitacora_distancia_al · las medidas publicadas mandan:\n";
eq(bitacora_distancia_al([2500.0]), 2500.0, 'una sola medida se usa tal cual');
// Mediana y no media: la de 20.000 es la medida vieja y disparatada que no debe
// arrastrar al objeto al otro lado de la galaxia.
eq(bitacora_distancia_al([2000.0, 2400.0, 20000.0]), 2400.0, 'con tres medidas, la de en medio');
eq(bitacora_distancia_al([1000.0, 2000.0, 3000.0, 4000.0]), 2500.0, 'con número par, el promedio de las dos centrales');
eq(bitacora_distancia_al([2400.0, 2000.0, 20000.0]), 2400.0, 'el orden de llegada da igual');
eq(bitacora_distancia_al([1234.4]), 1234.0, 'la distancia se redondea a años luz enteros');

echo "las medidas vacías o imposibles no cuentan:\n";
eq(bitacora_distancia_al([0.0, 3000.0]), 3000.0, 'un cero es un hueco del catálogo, no una medida');
eq(bitacora_distancia_al([-5.0, 3000.0]), 3000.0, 'una distancia negativa tampoco es una medida');
eq(bitacora_distancia_al(['', null, 'nan']), null, 'sin nada numérico no hay distancia');

echo "la paralaje entra cuando no hay ninguna medida:\n";
// NGC 2022: SIMBAD no tiene mesDistance, pero sí la paralaje Gaia de su estrella
// central. 1000/0,4378 = 2284 pc, y de ahí ~7450 años luz. Este es el objeto que
// el observador no podía pintar.
eq(bitacora_distancia_al([], 0.4378), 7450.0, 'NGC 2022 se coloca por su paralaje');
eq(bitacora_distancia_al([], 1000.0), 3.0, 'una paralaje de 1000 mas es 1 pc');
// Con medidas publicadas la paralaje sobra: la medida ya suele tenerla en cuenta.
eq(bitacora_distancia_al([5000.0], 0.4378), 5000.0, 'habiendo medida, la paralaje no la pisa');

echo "una paralaje que no sirve deja el objeto sin colocar:\n";
// Las paralajes negativas existen (ruido de medida en objetos lejanos) y darían
// una distancia negativa, que colocaría el objeto en el lado contrario del mapa.
eq(bitacora_distancia_al([], -0.2), null, 'paralaje negativa: ruido, no distancia');
eq(bitacora_distancia_al([], 0.0), null, 'paralaje cero: no se divide por cero');
eq(bitacora_distancia_al([], null), null, 'sin medidas y sin paralaje, null');
// NGC 2024 (la Flama): SIMBAD no tiene ni medidas ni paralaje y no está en el
// catálogo de cúmulos de VizieR. Es el caso que SOLO resuelve la mano, y por eso
// el formulario tiene que pedir la distancia en vez de callarse.
eq(bitacora_distancia_al([], null), null, 'NGC 2024 no lo salva ninguna base de datos');

echo "bitacora_nombre_catalogo · como escribe VizieR los nombres:\n";
// En un catálogo tabulado la columna es texto exacto: sin el espacio no casa.
eq(bitacora_nombre_catalogo('ngc2024'), 'NGC 2024', 'sin espacio y en minúsculas');
eq(bitacora_nombre_catalogo('NGC 2024'), 'NGC 2024', 'ya bien escrito se queda igual');
eq(bitacora_nombre_catalogo('  ngc  869  '), 'NGC 869', 'espacios de sobra');
eq(bitacora_nombre_catalogo('NGC0457'), 'NGC 457', 'sin ceros a la izquierda');
eq(bitacora_nombre_catalogo('ic434'), 'IC 434', 'otros prefijos igual');
eq(bitacora_nombre_catalogo('M11'), 'M 11', 'los Messier también, aunque VizieR no los liste');

echo "lo que no tiene forma de prefijo+número no se pregunta:\n";
eq(bitacora_nombre_catalogo('Melotte 22'), 'MELOTTE 22', 'un nombre propio con número sí');
eq(bitacora_nombre_catalogo('Doble Cúmulo'), '', 'un nombre sin número, no');
eq(bitacora_nombre_catalogo(''), '', 'vacío, no');
eq(bitacora_nombre_catalogo('2024'), '', 'un número suelto no es un identificador');

/* Las respuestas de abajo son las REALES de cada servicio, copiadas tal cual el
   7 de agosto de 2026. Si algún día cambian de forma, el parseo falla aquí y no
   en silencio delante del observador. */

echo "bitacora_oac_dist_al_desde_json · Open Astronomy Catalog:\n";
// M1 responde como el resto de SN 1054: 0,0019 Mpc, unos 6.200 años luz. Es el
// hueco que solo tapa este catálogo (SIMBAD no le da distancia).
eq(bitacora_oac_dist_al_desde_json('{"M1": {"lumdist": [{"value": "0.0019"}]}}'), 6197.0, 'M1, la Cangrejo, por su supernova');
eq(bitacora_oac_dist_al_desde_json('{"SN2011fe": {"lumdist": [{"value": "3.56"}]}}'), 11611296.0, 'una supernova extragaláctica, en Mpc');
eq(bitacora_oac_dist_al_desde_json('{"SN1987A": {"lumdist": [{"value": "0.043", "kind": "host"}]}}'), 140249.0, 'la distancia de la galaxia anfitriona también vale');
// La clave del JSON es el nombre con el que responde el catálogo, no el que se
// preguntó: el parseo no puede depender de acertarla.
eq(bitacora_oac_dist_al_desde_json('{"SN 2011fe": {"lumdist": [{"value": "3.56"}]}}'), 11611296.0, 'da igual con qué nombre conteste');

echo "cuando el Open Astronomy Catalog no sabe, no inventa:\n";
eq(bitacora_oac_dist_al_desde_json('{"message": "Event \'NGC 2024\' not found in any catalog."}'), null, 'objeto desconocido');
eq(bitacora_oac_dist_al_desde_json('{"M1": {"lumdist": []}}'), null, 'sin ninguna medida');
eq(bitacora_oac_dist_al_desde_json('no es json'), null, 'respuesta ilegible');

echo "bitacora_ned_redshift_desde_json · NED:\n";
eq(bitacora_ned_redshift_desde_json('{"Preferred": {"Name": "NGC 4889", "Redshift": {"Value": 0.0215}}}'), 0.0215, 'el z de una galaxia lejana');
// NED contesta a veces con otra designación del mismo astro (M104 responde como
// la fuente de radio de su núcleo): el z sigue siendo el bueno.
eq(bitacora_ned_redshift_desde_json('{"Preferred": {"Name": "ICRF J123959.4-113722", "Redshift": {"Value": 0.003633180125}}}'), 0.003633180125, 'aunque conteste con otro nombre del mismo objeto');
eq(bitacora_ned_redshift_desde_json('{"Preferred": {"Name": "NGC 2022", "Redshift": {"Value": null}}}'), null, 'un objeto galáctico no tiene z');
eq(bitacora_ned_redshift_desde_json('{"Preferred": {"Name": "X"}}'), null, 'sin bloque de z');
eq(bitacora_ned_redshift_desde_json(''), null, 'respuesta vacía');

echo "bitacora_distancia_por_redshift · solo de lejos:\n";
eq(bitacora_distancia_por_redshift(0.0215), 300325232.0, 'NGC 4889, en el cúmulo de Coma');
eq(bitacora_distancia_por_redshift(0.158338994), 2211776517.0, '3C 273, el cuásar');
eq(bitacora_distancia_por_redshift(0.01), 139686154.0, 'justo en el corte, sí');

echo "cerca la ley de Hubble no vale y se calla:\n";
// M104: z = 0,00363 daría ~51 millones de años luz y está a ~29. La velocidad
// propia dentro de su grupo es del orden de la de expansión, y el resultado no
// es una distancia: es ruido con unidades.
eq(bitacora_distancia_por_redshift(0.003633180125), null, 'M104 está demasiado cerca para estimarla así');
eq(bitacora_distancia_por_redshift(0.001761), null, 'NGC 891, lo mismo');
eq(bitacora_distancia_por_redshift(-0.001), null, 'M31 se acerca: eso no es expansión');
eq(bitacora_distancia_por_redshift(0.0), null, 'z cero no es distancia cero');
eq(bitacora_distancia_por_redshift(null), null, 'sin z, null');

echo ($fallos ? "\n$fallos FALLOS\n" : "\nTodo en orden.\n");
exit($fallos ? 1 : 0);
