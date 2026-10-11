/* Test de los controles propios de cada escala del mapa
   (mapa/js/via-lactea-capas.js). El abatimiento y los giros son de la VISTA DE
   LA VÍA LÁCTEA: en el atlas del Grupo Local y en el vecindario solar no pintan
   nada y no deben verse.
   Sin framework:  node scripts/test_capas_controles.js */

'use strict';

var C = require('../mapa/js/via-lactea-capas.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

var GIROS = { giroAzimutalCanto: true, giroPlanoCanto: true };

console.log('capaActiva (quién manda en pantalla):');
eq(C.capaActiva(0, 0), 'galaxia', 'sin fundidos manda la galaxia');
eq(C.capaActiva(0.3, 0), 'galaxia', 'atlas a medio fundir: aún manda la galaxia');
eq(C.capaActiva(0.8, 0), 'grupoLocal', 'atlas dominante');
eq(C.capaActiva(0, 0.8), 'vecindario', 'vecindario dominante');
eq(C.capaActiva(0.8, 0.8), 'vecindario', 'el vecindario gana al atlas (no coinciden en la práctica)');

console.log('controlesVisibles en la galaxia (vista cenital):');
var cenital = C.controlesVisibles('galaxia', false, GIROS);
eq(cenital.abatimiento, true, 'deslizador de abatimiento disponible');
eq(cenital.giroCanto, false, 'el giro azimutal de canto no, que estamos en cenital');
eq(cenital.giroPlano, false, 'el giro en plano de canto tampoco');

console.log('controlesVisibles en la galaxia (vista de canto):');
var canto = C.controlesVisibles('galaxia', true, GIROS);
eq(canto.abatimiento, true, 'de canto sigue el mismo mando: es su tope, 90°');
eq(canto.giroCanto, true, 'giro azimutal de canto disponible');
eq(canto.giroPlano, true, 'giro en plano de canto disponible');
eq(C.controlesVisibles('galaxia', true, {}).giroCanto, false, 'sin el interruptor de CONFIG, no hay giro azimutal');
eq(C.controlesVisibles('galaxia', true, {}).giroPlano, false, 'sin el interruptor de CONFIG, no hay giro en plano');

console.log('controlesVisibles fuera de la galaxia (cada escala, lo suyo):');
['grupoLocal', 'vecindario'].forEach(function (capa) {
  [false, true].forEach(function (esCanto) {
    var c = C.controlesVisibles(capa, esCanto, GIROS);
    eq(c.abatimiento, false, capa + ': sin abatimiento');
    eq(c.giroCanto, false, capa + ': sin giro azimutal de canto');
    eq(c.giroPlano, false, capa + ': sin giro en plano de canto');
  });
});

console.log('leyenda: cada escala enseña la suya y esconde las otras dos:');
[['galaxia', 'leyendaObjetos'], ['grupoLocal', 'leyendaHubble'],
 ['vecindario', 'leyendaEspectral']].forEach(function (par) {
  var c = C.controlesVisibles(par[0], false, GIROS);
  ['leyendaObjetos', 'leyendaHubble', 'leyendaEspectral'].forEach(function (k) {
    eq(c[k], k === par[1], par[0] + ': ' + k + (k === par[1] ? ' visible' : ' escondida'));
  });
});

console.log('puedeCambiarDeEscala (#424): solo con el centro en el origen:');
['galaxia', 'grupoLocal', 'vecindario'].forEach(function (capa) {
  eq(C.puedeCambiarDeEscala(capa, false), true, capa + ': centro en el origen, se cambia');
  eq(C.puedeCambiarDeEscala(capa, true), capa === 'galaxia', capa + ': centro desplazado, ' + (capa === 'galaxia' ? 'se pasa libre' : 'no se cambia'));
});

console.log('limitarEscala (#424): topes con el centro desplazado:');
var TOPES = { vecindarioMin: 30, grupoLocalMax: 0.04 };
eq(C.limitarEscala('vecindario', true, 40, 20, TOPES), 30, 'vecindario: alejar se para en el tope');
eq(C.limitarEscala('vecindario', true, 40, 50, TOPES), 50, 'vecindario: acercar es libre');
eq(C.limitarEscala('vecindario', true, 25, 20, TOPES), 25, 'vecindario: ya rebasado, no sigue alejando');
eq(C.limitarEscala('vecindario', true, 25, 28, TOPES), 28, 'vecindario: ya rebasado, acercar es libre');
eq(C.limitarEscala('vecindario', false, 40, 20, TOPES), 20, 'vecindario: en el origen, como hoy');
eq(C.limitarEscala('grupoLocal', true, 0.01, 0.1, TOPES), 0.04, 'grupo local: acercar se para en el tope');
eq(C.limitarEscala('grupoLocal', true, 0.01, 0.005, TOPES), 0.005, 'grupo local: alejar es libre');
eq(C.limitarEscala('grupoLocal', true, 0.05, 0.1, TOPES), 0.05, 'grupo local: ya rebasado, no sigue acercando');
eq(C.limitarEscala('grupoLocal', false, 0.01, 0.1, TOPES), 0.1, 'grupo local: en el origen, como hoy');
eq(C.limitarEscala('galaxia', true, 1, 100, TOPES), 100, 'galaxia: libre aunque haya centro');
eq(C.limitarEscala('galaxia', true, 1, 0.001, TOPES), 0.001, 'galaxia: libre alejando hacia el Grupo Local');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
