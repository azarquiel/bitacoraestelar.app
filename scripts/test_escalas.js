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

console.log('holguraVigente: la del centrado no llega al Grupo Local:');
var H = { x: 30, y: 0, escala: 2 };
eq(E.holguraVigente(H, 0.5, CFG), H, 'por encima del umbral (0,1) vale');
eq(E.holguraVigente(H, 0.1, CFG), H, 'en el umbral aún vale');
eq(E.holguraVigente(H, 0.09, CFG), null, 'en el fundido no: la Vía Láctea entra centrada');
eq(E.holguraVigente(null, 0.5, CFG), null, 'sin holgura, nada');

console.log('limitar: galaxia (tope del Grupo Local = umbral 0,1, donde empieza el fundido):');
eq(E.limitar(p('galaxia', true, 1, 0.001, 1000)), 0.1, 'centro desplazado: alejar se para en el tope');
eq(E.limitar(p('galaxia', true, 1, 100, 1000)), 100, 'centro desplazado: acercar es libre');
eq(E.limitar(p('galaxia', true, 0.08, 0.05, 1000)), 0.08, 'ya rebasado, no sigue alejando');
eq(E.limitar(p('galaxia', false, 1, 0.001, 1000)), 0.001, 'Sol centrado: pasa al Grupo Local');

console.log('fundidoGrupoLocal (umbral 0.1, final 0.04):');
var GL = CFG.grupoLocal;
eq(E.fundidoGrupoLocal(0.5, GL), 1, 'por encima del umbral: galaxia entera');
eq(E.fundidoGrupoLocal(0.1, GL), 1, 'en el umbral: galaxia entera');
eq(E.fundidoGrupoLocal(0.04, GL), 0, 'en el final: solo atlas');
eq(E.fundidoGrupoLocal(0.001, GL), 0, 'por debajo del final: solo atlas');
eq(Math.abs(E.fundidoGrupoLocal(0.07, GL) - 0.5) < 1e-9, true, 'punto medio: 0,5');
eq(E.umbrales({ umbral: 0.1 }).umbralFinal, 0.1 * 0.4, 'sin umbralFinal: 40 % del umbral');
eq(E.umbrales({ umbral: 0.1, umbralFinal: 0.2 }).umbralFinal, 0.1 * 0.4, 'umbralFinal no menor que el umbral: 40 %');
eq(E.umbrales(undefined).umbral, 0.1, 'sin config: umbral 0,1');
eq(E.topes(p('grupoLocal', true, 1, 1, 1000)).grupoLocalMax, 0.04, 'el tope del Grupo Local es el umbralFinal');

console.log('cercanía del Sol (800x600, proximidad 0.28 -> radio 168):');
eq(E.proximidadSol({}), 0.28, 'sin config: 0,28');
eq(E.proximidadSol({ vecindario: { proximidad: 0.12 } }), 0.12, 'la config manda');
eq(E.solCerca(0, 0, 800, 600, {}), true, 'Sol en el centro: cerca');
eq(E.solCerca(100, 100, 800, 600, {}), true, 'dentro del radio (141 < 168)');
eq(E.solCerca(200, 150, 800, 600, {}), false, 'fuera del radio (250 > 168)');
eq(E.solCerca(100, 100, 800, 600, { vecindario: { proximidad: 0.12 } }), false, 'con proximidad 0,12 (radio 72) ya no');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
