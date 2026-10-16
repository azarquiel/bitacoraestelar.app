#!/usr/bin/env node
/* Test de la ENTRADA MANUAL del telescopio en el simulador de oculares
   (`montarTeleManual` en resources/js/bitacora-base.js; historia #461).

   El fallo que fija: apertura y focal escuchaban `input`, así que cada tecla
   llamaba a actualizar(). Al escribir «1200», la focal pasaba por «1», que da
   un campo de 360′ a mag 20, y esa consulta de Gaia se quedaba en la caché
   (superconjunto monotónico) toda la sesión. Ahora solo se usa el valor al
   confirmarlo (`change`), y un valor fuera del rango del campo no se usa: el
   campo lo marca con aria-invalid.

   Monta la entrada con un DOM falso, simula las pulsaciones y cuenta las
   llamadas a actualizar.

   Sin dependencias:  node scripts/test_tele_manual.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

// Elemento falso: guarda sus listeners y atributos, y dispara eventos a mano.
function campo(attrs) {
  var oyentes = {}, at = Object.assign({}, attrs);
  return {
    value: '',
    min: at.min || '', max: at.max || '',
    addEventListener: function (tipo, fn) { (oyentes[tipo] = oyentes[tipo] || []).push(fn); },
    setAttribute: function (k, v) { at[k] = String(v); },
    removeAttribute: function (k) { delete at[k]; },
    getAttribute: function (k) { return k in at ? at[k] : null; },
    disparar: function (tipo) { (oyentes[tipo] || []).forEach(function (fn) { fn({ type: tipo, target: this }); }, this); },
    teclear: function (texto) {
      for (var i = 1; i <= texto.length; i++) { this.value = texto.slice(0, i); this.disparar('input'); }
    }
  };
}

function montar() {
  var m = {
    apert: campo({ min: '20', max: '1000' }),
    focal: campo({ min: '100', max: '6000' }),
    tipo: campo({}),
    usos: []
  };
  B.montarTeleManual(m.apert, m.focal, m.tipo, function (a, f) { m.usos.push([a, f]); });
  return m;
}

console.log('Teclear la focal no consulta en cada pulsación:');
(function () {
  var m = montar();
  m.apert.value = '200'; m.apert.disparar('change');
  ok(m.usos.length === 0, 'con solo la apertura no se llama a actualizar');
  m.focal.teclear('1200');
  ok(m.usos.length === 0, '«1», «12», «120», «1200» tecleados: 0 llamadas a actualizar');
  m.focal.disparar('change');
  ok(m.usos.length === 1, 'al confirmar (change): 1 llamada a actualizar');
  ok(m.usos[0] && m.usos[0][0] === 200 && m.usos[0][1] === 1200, 'con apertura 200 y focal 1200');
})();

console.log('Un valor fuera de rango no consulta y el campo lo marca:');
(function () {
  var m = montar();
  m.apert.value = '200'; m.apert.disparar('change');
  m.focal.value = '12'; m.focal.disparar('change');
  ok(m.usos.length === 0, 'focal 12 (mínimo 100) confirmada: 0 llamadas a actualizar');
  ok(m.focal.getAttribute('aria-invalid') === 'true', 'la focal queda con aria-invalid="true"');
  ok(m.apert.getAttribute('aria-invalid') !== 'true', 'la apertura, que sí vale, no se marca');
  m.tipo.disparar('change');
  ok(m.usos.length === 0, 'cambiar el tipo con la focal fuera de rango tampoco consulta');
  m.focal.value = '1200'; m.focal.disparar('change');
  ok(m.usos.length === 1, 'corregida la focal: 1 llamada a actualizar');
  ok(m.focal.getAttribute('aria-invalid') !== 'true', 'y la marca desaparece');
  m.apert.value = '5000'; m.apert.disparar('change');
  ok(m.usos.length === 1 && m.apert.getAttribute('aria-invalid') === 'true',
    'apertura 5000 (máximo 1000): sin llamada y marcada');
})();

console.log('Un campo vacío está incompleto, no fuera de rango:');
(function () {
  var m = montar();
  m.focal.value = '1200'; m.focal.disparar('change');
  ok(m.usos.length === 0, 'sin apertura no se llama a actualizar');
  ok(m.apert.getAttribute('aria-invalid') !== 'true', 'y la apertura vacía no se marca');
})();

console.log('El tipo vuelve a usar el telescopio si los dos campos valen:');
(function () {
  var m = montar();
  m.apert.value = '200'; m.focal.value = '1200'; m.focal.disparar('change');
  m.tipo.disparar('change');
  ok(m.usos.length === 2, 'change del tipo: una llamada más a actualizar');
})();

console.log(fallos === 0 ? '\nTodo verde.' : '\n' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
