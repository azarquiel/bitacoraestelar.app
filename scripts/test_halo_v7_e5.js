#!/usr/bin/env node
/* E5 · Verificación fenomenológica sobre la matriz archivada.

   Aquí NO se comprueban igualdades numéricas —de eso van E1-E4—, sino el orden
   en que las cosas desaparecen, que es lo que un observador reconoce:

     1. A más aumentos, el halo se apaga antes que el núcleo.
     2. Con peor cielo, el halo encoge.
     3. El grano nunca sobrevive a la mancha.
     4. Ningún cúmulo de la matriz muestra estructura anular.

   Lee simulador_ocular/docs/validacion/matriz_v7.json, que produce scripts/matriz_halo_v7.js con
   semillas fijas. Si el JSON no está o se ha quedado viejo, se regenera con:

     node scripts/matriz_halo_v7.js

   node scripts/test_halo_v7_e5.js */
'use strict';

var fs = require('fs');
var path = require('path');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var M = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'simulador_ocular', 'docs', 'validacion', 'matriz_v7.json'), 'utf8'));
var filas = M.filas;

console.log('\nE5 · matriz ' + M.version + ' (' + M.generado + '): ' + filas.length +
  ' corridas, ' + M.apertura + ' mm × ' + M.aumentos.join('/') + '× × SQM ' + M.cielos.join('/'));

ok(filas.length === 18, 'la matriz tiene las 18 corridas: 3 cúmulos × 3 aumentos × 2 cielos');

function fila(nombre, MAG, sqm) {
  return filas.filter(function (f) {
    return f.nombre === nombre && f.MAG === MAG && f.sqm === sqm;
  })[0];
}
var NOMBRES = ['M13', '47 Tuc', 'ω Cen'];

/* ── 1. A más aumentos, el halo se apaga antes que el núcleo ──────────────── */

console.log('\nE5.1 · a más aumentos el halo encoge y el núcleo aguanta');

NOMBRES.forEach(function (nombre) {
  M.cielos.forEach(function (sqm) {
    var serie = M.aumentos.map(function (MAG) { return fila(nombre, MAG, sqm); });
    var baja = serie.every(function (f, i) {
      return i === 0 || f.rVisibleEnRh < serie[i - 1].rVisibleEnRh;
    });
    var nucleo = serie.every(function (f) { return f.nucleoVisible; });
    ok(baja && nucleo, nombre + ' SQM ' + sqm + ': el halo pasa de ' +
      serie.map(function (f) { return f.rVisibleEnRh.toFixed(2); }).join(' → ') +
      ' r_h al subir ' + M.aumentos.join('/') + '×, y el núcleo sigue visible en las tres');
  });
});

/* ── 2. Con peor cielo, el halo encoge ────────────────────────────────────── */

console.log('\nE5.2 · con peor cielo el halo encoge, a igualdad de aumentos');

var peorRazon = 1;
NOMBRES.forEach(function (nombre) {
  var encogen = M.aumentos.every(function (MAG) {
    var bueno = fila(nombre, MAG, 21.5), malo = fila(nombre, MAG, 18.5);
    var razon = malo.rVisibleAs / bueno.rVisibleAs;
    if (razon < peorRazon) peorRazon = razon;
    return razon < 1;
  });
  ok(encogen, nombre + ': de SQM 21,5 a 18,5 el halo encoge en los tres aumentos');
});
ok(peorRazon < 0.8, 'y no es un encogimiento simbólico: el mayor recorte deja el halo ' +
  'en el ' + (peorRazon * 100).toFixed(0) + ' % de su radio');

/* ── 3. El grano nunca sobrevive a la mancha ──────────────────────────────── */

console.log('\nE5.3 · el grano nunca llega más lejos que la mancha');

ok(filas.every(function (f) { return f.rGranoAs <= f.rVisibleAs; }),
  'en las ' + filas.length + ' corridas, el radio del grano no pasa del de la mancha');

/* Y el hecho medido, dicho en voz alta para que quede en la batería y no en la
   memoria de nadie: en esta matriz el grano NO se pinta en ningún punto. El
   término σ_grano queda entre 3,9 y 7,2 mag por debajo de su propio umbral,
   porque el umbral de contraste se evalúa a un tamaño angular del orden del
   beam y ahí Cmin vale 10²-10³. No es un fallo de v7 —D1/D2/D3 no van de
   esto— pero sí lo primero que hay que mirar en v8: hoy S1 pone el velo y S2
   no pinta nada. Ver simulador_ocular/docs/iteraciones/v7_autocritica.md. */
var sinGrano = filas.filter(function (f) { return f.rGranoAs === 0; }).length;
ok(sinGrano === filas.length,
  'HALLAZGO, no regresión: el grano no se pinta en NINGUNA de las ' + filas.length +
  ' corridas (s_grano ≡ 0). Si esto deja de ser verdad, es que v8 tocó la ley del grano');

/* ── 4. Ninguna estructura anular ─────────────────────────────────────────── */

console.log('\nE5.4 · ningún cúmulo de la matriz muestra estructura anular');

var peorQ = 0, peorDe = '';
filas.forEach(function (f) {
  if (f.anularQ > peorQ) { peorQ = f.anularQ; peorDe = f.nombre + ' ' + f.MAG + '× SQM ' + f.sqm; }
});
ok(peorQ < 1.5, 'el peor cociente de salto de S1 por magnitud de m_res es ' +
  peorQ.toFixed(3) + ' (' + peorDe + '); con la cola escalonada de antes de E4 se iba a 4,3');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nE5 verde');
process.exit(fallos ? 1 : 0);
