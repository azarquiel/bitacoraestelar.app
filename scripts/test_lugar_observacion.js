#!/usr/bin/env node
/* Test del LUGAR DE UNA OBSERVACIÓN
   (`BitacoraBase.lugarDeObservacion`, resources/js/bitacora-base.js).

   El lugar dejó de ser de la observación y pasó a ser del VIAJE: se sale una
   noche desde un sitio, no se cambia de sitio objeto a objeto. Pero la altura y
   el azimut del objeto, del Sol y de la Luna se calculan al registrar cada
   observación, y sin lugar no hay cómo calcularlos. De ahí la regla que se
   prueba aquí: manda el lugar del viaje y, solo si el viaje no tiene ninguno, el
   formulario vuelve a preguntarlo.

   Sin dependencias:  node scripts/test_lugar_observacion.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

var SIERRA = { id: 3, nombre: 'Sierra de Béjar', lat: 40.39, lon: -5.75, tz: 'Europe/Madrid' };
var BALCON = { id: 9, nombre: 'Balcón de casa', lat: 40.42, lon: -3.70, tz: 'Europe/Madrid' };

/* ── 1. Sin sesión no se registra nada ──────────────────────────────────────
   La sesión pasó a ser obligatoria: toda observación pertenece a una salida. El
   lugar, en cambio, sigue siendo opcional, así que mientras no haya viaje ni
   siquiera tiene sentido preguntar desde dónde se observaba. */
seccion('Sin viaje elegido:');
var r = B.lugarDeObservacion(null, null);
ok(r.faltaViaje === true, 'falta el viaje: la sesión es obligatoria');
ok(r.base === null, 'y no hay lugar del que calcular nada');
ok(r.pedirBase === false, 'no se pide el lugar antes de tener sesión');

/* ── 2. El viaje trae su lugar: manda él ─────────────────────────────────────
   Es el caso normal desde ahora. El formulario de registro ya no pregunta por el
   lugar porque el de la sesión es EL lugar. */
seccion('El viaje salió de una base:');
r = B.lugarDeObservacion({ id: 12, base: SIERRA }, null);
ok(r.faltaViaje === false, 'hay sesión');
ok(r.base === SIERRA, 'el lugar es el del viaje');
ok(r.pedirBase === false, 'no se vuelve a preguntar');
// Si quedara una base suelta en el formulario (una observación antigua que se
// reedita), la del viaje sigue mandando: dos lugares para la misma salida sería
// justo lo que este cambio viene a arreglar.
r = B.lugarDeObservacion({ id: 12, base: SIERRA }, BALCON);
ok(r.base === SIERRA, 'el lugar del viaje gana al que arrastre el formulario');
ok(r.pedirBase === false, 'y el selector no reaparece');

/* ── 3. El viaje no registró lugar: hay que preguntarlo ──────────────────────
   Sin lugar no hay altura ni azimut, así que el formulario vuelve a ofrecer el
   selector. Es la excepción que mantiene vivo el cálculo. */
seccion('El viaje no dice desde dónde se observaba:');
r = B.lugarDeObservacion({ id: 12, base: null }, null);
ok(r.faltaViaje === false, 'la sesión está, que es lo obligatorio');
ok(r.pedirBase === true, 'se pregunta el lugar para poder calcular la posición');
ok(r.base === null, 'mientras no se conteste, no hay lugar');
r = B.lugarDeObservacion({ id: 12, base: null }, BALCON);
ok(r.base === BALCON, 'contestado, el lugar es el del formulario');
ok(r.pedirBase === true, 'el selector sigue a la vista para poder cambiarlo');

/* ── 4. Sin lugar en ninguna parte, se registra igual ────────────────────────
   El lugar es opcional: no tenerlo cuesta la altura y el azimut, no la
   observación. */
seccion('Nadie dice el lugar:');
r = B.lugarDeObservacion({ id: 12, base: null }, null);
ok(r.faltaViaje === false && r.base === null, 'la observación se puede registrar sin lugar');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nok · el lugar sale del viaje, y del formulario solo si el viaje no lo tiene');
process.exit(fallos ? 1 : 0);
