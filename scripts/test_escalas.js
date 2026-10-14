/* Test de los topes de zoom y la relación píxeles↔campo (mapa/js/via-lactea-escalas.js).
   Sin framework:  node scripts/test_escalas.js */

'use strict';

var E = require('../mapa/js/via-lactea-escalas.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

var CFG = {
  vecindario: { fovInicioAl: 100, fovFinalAl: 10, fovSalidaAl: 20 },
  grupoLocal: { umbral: 0.1, umbralFinal: 0.04 },
  fisica: { anchoImagenAl: 100000 }
};
// vecindarioMin = 0.42*500*1e5 / (anchoImagen*20) = 1050000/anchoImagen
function p(capa, desplazado, escala, pedida, anchoImagen) {
  return { capa: capa, desplazado: desplazado, escala: escala, pedida: pedida,
           ancho: 800, alto: 500, anchoImagen: anchoImagen, cfg: CFG };
}

console.log('radioCampo:');
eq(E.radioCampo(800, 500), 210, '42 % del lado corto');
eq(E.radioCampo(500, 800), 210, 'da igual cuál sea');

console.log('limitar (#424): vecindario con la imagen cargada (tope 1050):');
eq(E.limitar(p('vecindario', true, 2000, 1000, 1000)), 1050, 'alejar se para en el tope');
eq(E.limitar(p('vecindario', true, 2000, 3000, 1000)), 3000, 'acercar es libre');
eq(E.limitar(p('vecindario', true, 900, 800, 1000)), 900, 'ya rebasado, no sigue alejando');
eq(E.limitar(p('vecindario', true, 900, 950, 1000)), 950, 'ya rebasado, acercar es libre');
eq(E.limitar(p('vecindario', false, 2000, 1000, 1000)), 1000, 'centro en el origen: pasa a la escala de al lado');

console.log('limitar: sin imagen cargada (96e979f) no deja el zoom en 0 ni aleja:');
[0, undefined, NaN, null].forEach(function (a) {
  eq(E.limitar(p('vecindario', true, 40, 20, a)), 40, 'anchoImagen=' + a + ': se queda donde está');
});
eq(E.limitar(p('vecindario', true, 40, 50, 0)), 50, 'sin imagen, acercar es libre');
eq(E.topes(p('vecindario', true, 40, 20, 0)).vecindarioMin, Infinity, 'tope sin dato = Infinity');
eq(E.limitar({ capa: 'vecindario', desplazado: true, escala: 40, pedida: 20, ancho: 0, alto: 0, anchoImagen: 1000, cfg: CFG }), 40, 'visor sin tamaño (tope 0): no cae a 0');

console.log('limitar: grupo local:');
eq(E.limitar(p('grupoLocal', true, 0.01, 0.1, 1000)), 0.04, 'acercar se para en el tope');
eq(E.limitar(p('grupoLocal', true, 0.01, 0.005, 1000)), 0.005, 'alejar es libre');
eq(E.limitar(p('grupoLocal', true, 0.05, 0.1, 1000)), 0.05, 'ya rebasado, no sigue acercando');
eq(E.limitar(p('grupoLocal', false, 0.01, 0.1, 1000)), 0.1, 'centro en el origen: libre');

console.log('limitar: galaxia siempre libre:');
eq(E.limitar(p('galaxia', true, 1, 100, 1000)), 100, 'acercando');
eq(E.limitar(p('galaxia', true, 1, 0.001, 1000)), 0.001, 'alejando');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
