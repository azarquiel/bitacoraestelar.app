/* Test de la lista unificada de equipo del formulario de registro (#496).
   Cubre los helpers puros de resources/js/bitacora-equipo.js que pintan el
   selector: grupos, etiqueta con propietario, aviso de pieza prestada, opción
   «ya no disponible» y mensaje de rechazo del servidor.
   Sin framework:  node scripts/test_equipo_unificado.js */

'use strict';

var E = require('../resources/js/bitacora-equipo.js');

var fallos = 0;
function eq(a, b, et) {
  if (a === b) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}

var mio1 = { id: 1, usuario_id: 7, vendor: 'Orion', modelo: 'XT8', nombre: 'Mi Dobson', apertura_mm: 203, focal_mm: 1200 };
var mio2 = { id: 2, usuario_id: 7, vendor: 'Sky-Watcher', modelo: 'Maksutov 127', apertura_mm: 127, focal_mm: 1500 };
var deB = { id: 10, usuario_id: 9, de: 'B', vendor: 'GSO', modelo: 'Dobson 12', nombre: 'Dobson 12', apertura_mm: 305, focal_mm: 1500 };
var deC = { id: 11, usuario_id: 12, de: 'C', vendor: 'Celestron', modelo: 'C8', apertura_mm: 203, focal_mm: 2032 };
var cat = { id: 20, usuario_id: null, vendor: 'Meade', modelo: 'LX90', apertura_mm: 203, focal_mm: 2000 };

console.log('gruposPiezas (propias, compartidas por dueño, catálogo):');
(function () {
  var g = E.gruposPiezas([mio1, mio2, deB, deC, cat]);
  eq(g.map(function (x) { return x.etiqueta; }).join('|'), 'Mi flota|De B|De C|Catálogo', 'orden: Mi flota, De {nombre}, Catálogo');
  eq(g[0].piezas.length, 2, 'Mi flota agrupa las dos propias');
  var sinPropias = E.gruposPiezas([deB, cat]);
  eq(sinPropias.map(function (x) { return x.etiqueta; }).join('|'), 'De B|Catálogo', 'los grupos vacíos no se pintan');
  eq(E.gruposPiezas([]).length, 0, 'lista vacía -> ningún grupo');
  eq(E.gruposPiezas(null).length, 0, 'sin lista -> ningún grupo');
})();

console.log('opcionesHtml (el <select> nativo):');
(function () {
  var h = E.opcionesHtml('telescopios', [mio1, deB], '— Elige —');
  eq(h.indexOf('<optgroup label="Mi flota">') > -1 && h.indexOf('<optgroup label="De B">') > -1, true, 'con algo compartido, usa <optgroup>');
  eq(h.indexOf('<option value="">— Elige —</option>') === 0, true, 'el placeholder va primero, fuera de los grupos');
  eq(h.indexOf('Mi Dobson') < h.indexOf('De B'), true, 'las propias van antes que las compartidas');
  eq(h.indexOf('>B · Dobson 12') > -1, true, 'la opción prestada EMPIEZA por el dueño (visible con el selector cerrado)');
  eq(h.indexOf('>Mi Dobson') > -1 && h.indexOf('>B · Mi Dobson') === -1, true, 'la propia no lleva dueño');

  var hoy = E.opcionesHtml('telescopios', [mio1, mio2], '— Elige —');
  eq(hoy.indexOf('optgroup'), -1, 'sin nada compartido: sin grupos, el selector de hoy');
  eq(hoy,
    '<option value="">— Elige —</option>' +
    '<option value="1">Mi Dobson  —  Orion XT8 (203mm f=1200)</option>' +
    '<option value="2">Sky-Watcher Maksutov 127 (127mm f=1500)</option>',
    'el HTML sin compartido es idéntico al que pintaba el formulario');

  var xss = E.opcionesHtml('oculares', [{ id: 5, usuario_id: 9, de: 'B<img>', vendor: 'X', modelo: '<b>' }], '—');
  eq(xss.indexOf('<img>') === -1 && xss.indexOf('<b>') === -1, true, 'dueño y modelo se escapan');

  var nd = E.opcionesHtml('telescopios', [mio1], '—', { id: 99, nombre: 'Dobson 12' });
  eq(nd.indexOf('<option value="99">Dobson 12 (ya no disponible)</option>') > -1, true, 'pieza que ya no está: opción «(ya no disponible)» conservada');
  eq(E.opcionesHtml('telescopios', [mio1], '—', { id: 1, nombre: 'x' }).indexOf('ya no disponible'), -1, 'si la pieza SÍ está en la lista no se duplica');
})();

console.log('avisoPrestada (consecuencia visible al elegir):');
(function () {
  eq(E.avisoPrestada([mio1, null]), '', 'pieza propia -> sin aviso');
  eq(E.avisoPrestada([cat]), '', 'pieza del catálogo -> sin aviso');
  eq(E.avisoPrestada([deB]), 'Equipo de B. Esta observación no entrará en la calibración de tu equipo.', 'pieza de B -> aviso con su nombre');
  eq(E.avisoPrestada([deB, mio1, deB]).indexOf('Equipo de B.'), 0, 'dos piezas del mismo dueño no repiten el nombre');
  eq(E.avisoPrestada([deB, deC]).indexOf('Equipo de B y C.'), 0, 'dos dueños -> «B y C»');
})();

console.log('Marcas de equipo ajeno en lo leído (#499):');
(function () {
  var propia = { mia: true, calibra: true, equipo_prestado: [], equipo_no_disponible: [] };
  var prestada = { mia: true, calibra: false, equipo_prestado: [{ tipo: 'telescopio', id: 2, de: 'B' }, { tipo: 'ocular', id: 6, de: 'B' }], equipo_no_disponible: [] };
  var desaparecida = { mia: true, calibra: false, equipo_prestado: [], equipo_no_disponible: [{ tipo: 'ocular', id: 77 }] };
  var ajena = { mia: false, calibra: false, equipo_prestado: [{ tipo: 'telescopio', id: 2, de: 'B' }], equipo_no_disponible: [] };
  eq(E.etiquetasEquipoAjeno(propia).length, 0, 'propia: sin etiqueta');
  eq(E.etiquetasEquipoAjeno(prestada).map(function (e) { return e.texto; }).join('|'), 'Equipo de B', 'prestada: «Equipo de B» una sola vez');
  eq(E.etiquetasEquipoAjeno(desaparecida)[0].texto, 'Equipo no disponible', 'desaparecida: «Equipo no disponible», no «prestado»');
  eq(E.etiquetasEquipoAjeno({ equipo_prestado: [{ de: 'B' }], equipo_no_disponible: [{}] }).length, 2, 'ambas cosas: dos etiquetas distintas');
  eq(E.etiquetasEquipoAjeno(null).length, 0, 'sin observación -> nada');
  eq(E.motivoExclusion(prestada, true), 'Hecha con el equipo de B, por eso no entra en la calibración de tu equipo.', 'UX-4: la frase del detalle');
  eq(E.motivoExclusion(ajena, false), '', 'a otro lector no se le habla de «tu equipo»');
  eq(E.motivoExclusion(propia, true), '', 'propia: sin motivo');
  eq(E.motivoExclusion(desaparecida, true).indexOf('ya no existe') > -1, true, 'desaparecida: motivo propio');
  eq(E.excluidasCalibracion([propia, prestada, desaparecida, ajena]), 2, 'solo cuentan MIS excluidas (las de otro no)');
  eq(E.excluidasCalibracion([]), 0, 'lista vacía -> 0');
})();

console.log('hayCompartido:');
eq(E.hayCompartido({ telescopios: [mio1], oculares: [], auxiliares: [deB] }), true, 'basta una pieza de otro en cualquier categoría');
eq(E.hayCompartido({ telescopios: [mio1], oculares: [mio2], auxiliares: [] }), false, 'sin piezas con `de` -> falso');
eq(E.hayCompartido(null), false, 'sin flota -> falso');

console.log('mensajeRechazo (403 del servidor):');
eq(E.mensajeRechazo({ tipo: 'telescopio', id: 10, nombre: 'GSO Dobson 12' }, { telescopios: [deB] }),
  'B ya no comparte "Dobson 12". Elige otra pieza y vuelve a guardar.', 'nombra al dueño y la pieza con el nombre que el usuario veía');
eq(E.mensajeRechazo({ tipo: 'ocular', id: 5, nombre: 'Nagler 31' }, { oculares: [] }),
  '"Nagler 31" ya no está disponible para ti. Elige otra pieza y vuelve a guardar.', 'pieza que no está en la lista: sin dueño inventado');

console.log('nombrePieza:');
eq(E.nombrePieza(mio1), 'Orion XT8', 'vendor + modelo');
eq(E.nombrePieza(null), '', 'null -> vacío');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nTodo verde.');
