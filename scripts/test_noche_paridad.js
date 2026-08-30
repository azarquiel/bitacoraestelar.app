#!/usr/bin/env node
/* PARIDAD del convenio de mediodía entre los dos relojes del proyecto:
   bitacora_viaje_noche (PHP, bitacora-viaje.php) y nocheDe (JS, el motor de la
   plantilla OAL). La clave de adopción oal_id = noche#objeto cuelga de la
   noche: si los dos relojes divergen, la adopción falla en silencio, que es
   duplicar (ADR 0002).

   La tabla de casos es LA MISMA de scripts/test_viaje_noche.php: si un caso
   cambia allí, tiene que cambiar aquí — el corpus es el contrato, no el
   código (el mismo patrón que ata plantilla-escribe con PHP-lee).

   Divergencia real que este test dejó fijada: la hora de UN dígito («9:30»).
   PHP siempre la trató como ilegible (no desplaza); el motor JS la parseaba y
   desplazaba. Se alineó el JS al criterio estricto de PHP.

   Sin dependencias:  node scripts/test_noche_paridad.js */
'use strict';

var motor = require('./lib_motor_oal.js');
var OAL = motor.cargar();

var fallos = 0;
function eq(got, want, etiqueta) {
  if (got === want) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta + ' (sale ' + JSON.stringify(got) + ', esperaba ' + JSON.stringify(want) + ')'); }
}

console.log('nocheDe · la misma tabla de casos que bitacora_viaje_noche (PHP):\n');

/* [fecha, hora, noche esperada, etiqueta] — copia de test_viaje_noche.php */
var CASOS = [
  ['2026-08-04', '22:40', '2026-08-04', 'la tarde es su propia noche'],
  ['2026-08-05', '02:15', '2026-08-04', 'la madrugada cae en la noche anterior'],
  ['2026-08-04', '23:59', '2026-08-04', 'justo antes de medianoche'],
  ['2026-08-05', '00:00', '2026-08-04', 'justo después de medianoche'],
  ['2026-08-05', '11:59', '2026-08-04', 'las 11:59 aún son de la noche anterior'],
  ['2026-08-05', '12:00', '2026-08-05', 'las 12:00 ya abren noche nueva'],
  ['2026-01-01', '03:00', '2025-12-31', 'año nuevo de madrugada'],
  ['2026-03-01', '01:00', '2026-02-28', 'primero de marzo (año común)'],
  ['2024-03-01', '01:00', '2024-02-29', 'primero de marzo (bisiesto)'],
  ['2026-03-29', '01:30', '2026-03-28', 'madrugada del salto de primavera'],
  ['2026-03-29', '03:30', '2026-03-28', 'después del salto, misma noche'],
  ['2026-10-25', '02:30', '2026-10-24', 'madrugada de la hora repetida de otoño'],
  ['2026-08-04', '',      '2026-08-04', 'sin hora, la noche es la fecha tal cual'],
  ['2026-08-04', null,    '2026-08-04', 'hora omitida por completo'],
  ['2026-08-04', 'ayer',  '2026-08-04', 'una hora ilegible no desplaza'],
  ['2026-08-04', '25:00', '2026-08-04', 'una hora imposible no desplaza'],
  ['',           '22:00', null,         'sin fecha no hay noche']
];
CASOS.forEach(function (c) { eq(OAL.nocheDe(c[0], c[1]), c[2], c[3]); });

console.log('\nnocheDe · el criterio estricto de hora, alineado con PHP:\n');
eq(OAL.nocheDe('2026-08-05', '9:30'), '2026-08-05',
   'hora de UN dígito = ilegible: no desplaza (la divergencia que este test cerró)');
eq(OAL.nocheDe('2026-08-05', '09:30'), '2026-08-04', 'con dos dígitos sí es madrugada');

console.log('\nfechaDeReloj · la inversa, con el mismo criterio:\n');
eq(OAL.fechaDeReloj('2026-08-04', '02:15'), '2026-08-05', 'la madrugada se guarda con la fecha del día siguiente');
eq(OAL.fechaDeReloj('2026-08-04', '22:40'), '2026-08-04', 'la tarde con su propia fecha');
eq(OAL.fechaDeReloj('2026-08-04', '9:30'), '2026-08-04', 'hora de un dígito: tampoco desplaza aquí');

console.log('\nnocheDe ∘ fechaDeReloj · ida y vuelta:\n');
[['2026-08-04', '22:40'], ['2026-08-04', '02:15'], ['2025-12-31', '03:00']].forEach(function (p) {
  var fecha = OAL.fechaDeReloj(p[0], p[1]);
  eq(OAL.nocheDe(fecha, p[1]), p[0], p[0] + ' ' + p[1] + ' vuelve a su noche');
});

console.log(fallos ? ('\n' + fallos + ' fallo(s)') : '\nTodo en orden');
process.exit(fallos ? 1 : 0);
