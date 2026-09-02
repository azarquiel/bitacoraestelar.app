#!/usr/bin/env node
/* Test de las dos reglas puras de "Mi bitácora"
   (`BitacoraListado.filtrarPorNombre` y `.repartirPorViaje`,
   registro/resources/js/bitacora-listado.js).

   Viajes y observaciones son ya una sola página con tres vistas de lo mismo:
   las salidas con sus objetos plegados, la lista plana con buscador, y la
   papelera. Lo que se prueba aquí es lo que no depende del navegador:

   · El BUSCADOR mira solo el nombre del objeto, por subcadena, sin distinguir
     mayúsculas ni acentos —quien teclea "andromeda" busca "Andrómeda"—, y con
     la caja vacía no filtra nada.
   · El REPARTO por viaje conserva el orden en que vinieron las observaciones y
     no pierde de vista lo que no cuelga de ninguna salida: eso va aparte, en
     `sin`, para que la página pueda enseñarlo bajo su propio epígrafe.

   Sin dependencias ni red ni DOM: el módulo publica estas dos funciones antes
   de tocar la página, justo para poder cargarlo así.
   node scripts/test_listado_unificado.js  */
'use strict';

global.window = {};
require('../registro/resources/js/bitacora-listado.js');
var L = global.window.BitacoraListado;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

function nombres(filas) { return filas.map(function (o) { return o.objeto; }).join(','); }

// ═══════════════════════════════════════════════════════════════════════════
seccion('El buscador');

var catalogo = [
  { id: 1, objeto: 'M31 · Andrómeda' },
  { id: 2, objeto: 'M42' },
  { id: 3, objeto: 'NGC 7008' },
  { id: 4, objeto: 'Trío de Leo' },
  { id: 5, objeto: 'M13' }
];

ok(L.filtrarPorNombre(catalogo, '').length === 5, 'caja vacía: no filtra nada');
ok(L.filtrarPorNombre(catalogo, '   ').length === 5, 'solo espacios: tampoco filtra');
ok(L.filtrarPorNombre(catalogo, '') !== catalogo, 'devuelve copia, no la lista original');

ok(nombres(L.filtrarPorNombre(catalogo, 'M4')) === 'M42', 'subcadena exacta');
ok(nombres(L.filtrarPorNombre(catalogo, 'm4')) === 'M42', 'minúsculas encuentran mayúsculas');
ok(nombres(L.filtrarPorNombre(catalogo, 'NGC')) === 'NGC 7008', 'mayúsculas encuentran mayúsculas');

ok(nombres(L.filtrarPorNombre(catalogo, 'andromeda')) === 'M31 · Andrómeda',
   'sin acentos encuentra con acentos');
ok(nombres(L.filtrarPorNombre(catalogo, 'Andrómeda')) === 'M31 · Andrómeda',
   'con acentos encuentra con acentos');
ok(nombres(L.filtrarPorNombre(catalogo, 'TRIO')) === 'Trío de Leo',
   'la í acentuada se encuentra sin tilde y en mayúsculas');

ok(nombres(L.filtrarPorNombre(catalogo, 'leo')) === 'Trío de Leo',
   'la subcadena no tiene que ir al principio');
ok(L.filtrarPorNombre(catalogo, 'M1').length === 1, 'M1 no encuentra M31 (no es subcadena)');
ok(L.filtrarPorNombre(catalogo, 'zzz').length === 0, 'sin coincidencias: lista vacía');

ok(L.filtrarPorNombre([{ id: 9, objeto: null }], 'algo').length === 0,
   'objeto sin nombre no revienta el filtro');

// El orden es el que trae el servidor: filtrar no reordena.
ok(nombres(L.filtrarPorNombre(catalogo, 'M')) === 'M31 · Andrómeda,M42,M13',
   'conserva el orden de entrada');

// ═══════════════════════════════════════════════════════════════════════════
seccion('El reparto por viaje');

var filas = [
  { id: 1, objeto: 'M42', viaje_id: 7 },
  { id: 2, objeto: 'M43', viaje_id: 7 },
  { id: 3, objeto: 'M13', viaje_id: 9 },
  { id: 4, objeto: 'M57', viaje_id: null },
  { id: 5, objeto: 'M27', viaje_id: 0 },
  { id: 6, objeto: 'M81', viaje_id: 44 }   // viaje que la lista no conocerá
];

var r = L.repartirPorViaje(filas);

ok(nombres(r.porViaje['7']) === 'M42,M43', 'las de un viaje van juntas y en orden');
ok(nombres(r.porViaje['9']) === 'M13', 'viaje con un solo objeto');
ok(Object.keys(r.porViaje).length === 3, 'tres viajes citados (7, 9 y el desconocido 44)');
ok(r.porViaje['44'] !== undefined,
   'un viaje que no está en la lista SIGUE en el reparto: la página lo enseña como huérfano');

ok(nombres(r.sin) === 'M57,M27', 'viaje_id nulo y viaje_id 0 caen los dos en "sin viaje"');

// La clave es cadena aunque el id venga como número: así se puede buscar el
// <details data-viaje="7"> sin convertir en cada uso.
ok(typeof Object.keys(r.porViaje)[0] === 'string', 'las claves son cadenas');

// Nada se pierde por el camino.
var total = r.sin.length;
Object.keys(r.porViaje).forEach(function (k) { total += r.porViaje[k].length; });
ok(total === filas.length, 'ninguna observación se queda fuera del reparto');

ok(L.repartirPorViaje([]).sin.length === 0, 'lista vacía: reparto vacío, sin reventar');

// ═══════════════════════════════════════════════════════════════════════════
console.log('');
if (fallos) { console.error(fallos + ' FALLO(S)'); process.exit(1); }
console.log('Todo en orden.');
