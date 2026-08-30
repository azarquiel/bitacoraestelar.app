/* Test del reproductor del tramo de audio en la ficha del mapa
   (mapa/js/via-lactea-app.js). fmtAudioTiempo es una función pura, se prueba
   sola; el resto (cortar al llegar a "fin", reiniciar a "inicio") es lógica de
   DOM sobre <audio> y se verifica por patrón sobre el código fuente, como ya
   hace test_equipo.js con el resto de la ficha.
   Sin framework:  node scripts/test_ficha_audio_tramo.js */

'use strict';

var fs = require('fs');
var app = fs.readFileSync(__dirname + '/../mapa/js/via-lactea-app.js', 'utf8');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function ok(a, et) { eq(!!a, true, et); }

// Extrae fmtAudioTiempo tal cual está en el fichero real (sin copiarla a mano).
var m = app.match(/function fmtAudioTiempo\(seg\) \{[\s\S]*?\n  \}/);
if (!m) { console.log('FALLA no se encuentra fmtAudioTiempo() en via-lactea-app.js'); process.exit(1); }
var fmtAudioTiempo = new Function('return (' + m[0] + ')')();

console.log('fmtAudioTiempo (mm:ss, o h:mm:ss pasada la hora):');
eq(fmtAudioTiempo(0), '00:00', 'cero');
eq(fmtAudioTiempo(5), '00:05', 'segundos sueltos, con cero delante');
eq(fmtAudioTiempo(65), '01:05', 'un minuto y pico');
eq(fmtAudioTiempo(3661), '1:01:01', 'pasada la hora, con la hora sin cero delante');
eq(fmtAudioTiempo(-3), '00:00', 'negativo no rompe, se queda en cero');

console.log('el reproductor acota la reproducción al tramo (no al episodio entero):');
ok(/audioEl\.currentTime = inicio/.test(app), 'al cargar los metadatos, salta al inicio del tramo');
ok(/audioEl\.currentTime >= a\.fin/.test(app), 'al llegar al fin del tramo, lo detecta');
ok(/audioEl\.pause\(\)/.test(app), 'y lo para');
ok(/id="ficha-audio-reset"/.test(app), 'hay un botón para volver al inicio del tramo');
ok(/fichaAudioEl\.pause\(\); fichaAudioEl = null;/.test(app), 'cerrar o cambiar de ficha para el audio (no sigue sonando de fondo)');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nok · el reproductor del tramo se corta solo al llegar a "fin" y se puede reiniciar');
