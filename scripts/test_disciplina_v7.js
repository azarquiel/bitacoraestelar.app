#!/usr/bin/env node
/* Disciplina de v7 · guardián de ADR-0004..0007.

   No mide física: mide que las reglas de proceso que salieron de la iteración
   v7 sigan en pie. Tres de las cuatro decisiones son comprobables:

   - ADR-0005 (un test vacuo no es evidencia): la suite tiene que saber contar
     asserts y NO puede dar por superada una batería que no comprobó nada.
   - ADR-0004 (nada de parámetros estéticos para tapar fotometría): la capa
     fotométrica no admite mandos de ajuste visual, ni con otro nombre.
   - ADR-0006 (métricas fotométricas y perceptuales separadas): la capa
     fotométrica no nombra los mandos del ojo (dim, pupila, cielo, realce);
     el complemento —que mover la pupila no mueve el contraste— lo mide
     E1.3, y ahí se queda.

   ADR-0007 (una capa física por investigación) no se comprueba desde aquí:
   es una regla sobre cómo se conduce un experimento, no sobre el árbol.

     node scripts/test_disciplina_v7.js
*/
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var suite = require('./suite_halo_v7.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── 1. La suite clasifica: superado / fallido / vacuo ───────────────────── */
console.log('\n1 · clasificación de una corrida (ADR-0005):');

ok(suite.clasificar(0, '  ok algo\n  ok otra cosa\n') === 'superado',
  'salida verde con asserts contados = superado');
ok(suite.clasificar(1, '  ok algo\n  FALLA otra\n') === 'fallido',
  'código de salida distinto de 0 = fallido');
ok(suite.clasificar(0, 'Todo OK\n') === 'vacuo',
  'salida verde SIN un solo assert = vacuo, no superado');
ok(suite.clasificar(0, '') === 'vacuo',
  'una batería muda es vacua aunque termine en 0');

/* Contra ficheros de verdad: la clasificación no puede depender de que el
   test colabore contándose a sí mismo. */
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'disciplina-'));
function fixture(nombre, cuerpo) {
  var f = path.join(tmp, nombre);
  fs.writeFileSync(f, cuerpo);
  return f;
}
var fVerde = fixture('verde.js', 'console.log("  ok comprobado algo");\n');
var fVacuo = fixture('vacuo.js',
  '[].forEach(function () { console.log("  ok nunca"); });\nconsole.log("Todo OK");\n');
var fRojo = fixture('rojo.js',
  'console.log("  ok una");\nconsole.error("  FALLA otra");\nprocess.exit(1);\n');

ok(suite.correr(fVerde).clase === 'superado', 'fichero con un assert: superado');
ok(suite.correr(fVacuo).clase === 'vacuo',
  'fichero que itera sobre un conjunto vacío: vacuo (el caso de E1 en v7)');
ok(suite.correr(fRojo).clase === 'fallido', 'fichero con un assert roto: fallido');
ok(suite.correr(fVerde).asserts === 1 && suite.correr(fVacuo).asserts === 0,
  'el recuento de asserts es el de la corrida, no el del código fuente');

/* ── 2. Un vacuo no puede presentarse como evidencia positiva ────────────── */
console.log('\n2 · el vacuo no pasa por verde (ADR-0005):');

function corridaSuite(ficheros) {
  var r = cp.spawnSync(process.execPath,
    [path.join(__dirname, 'suite_halo_v7.js')].concat(ficheros),
    { encoding: 'utf8' });
  return { codigo: r.status, salida: r.stdout + r.stderr };
}
var soloVerde = corridaSuite([fVerde]);
var conVacuo = corridaSuite([fVerde, fVacuo]);

ok(soloVerde.codigo === 0, 'la suite sale 0 cuando todo está superado');
ok(conVacuo.codigo !== 0,
  'la suite sale distinto de 0 si alguna batería es vacua');
ok(/vacuo/.test(conVacuo.salida) && /vacuo\.js/.test(conVacuo.salida),
  'y nombra la batería vacua en el informe');
ok(corridaSuite([fVerde, fRojo]).codigo !== 0, 'y sale distinto de 0 si hay fallidos');

/* ── 3. Sin parámetros estéticos en la capa fotométrica (ADR-0004) ───────── */
console.log('\n3 · la fotometría no lleva mandos de ajuste (ADR-0004):');

var fuente = fs.readFileSync(
  path.join(__dirname, '..', 'resources', 'js', 'bitacora-cumulos.js'), 'utf8');
// Igual que test_cumulos.js §9: en comentarios se pueden nombrar para explicar
// dónde vive cada cosa; lo que no puede haber es código que los use.
var codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* La lista no es de nombres históricos sino de FORMAS de nombre: una prótesis
   vuelve con otra etiqueta, y este test tiene que enterarse igual. */
var esteticos = [
  /\brestaMaxFrac\b/, /\bremanenteMinFrac\b/, /\bmagResta\b/,
  /\bfudge/i, /\bajuste(Visual|Estetico|Estético)/i, /\bfactor(Visual|Estetico|Estético)/i,
  /\bcorreccion(Visual|Estetica|Estética)/i, /\bescalaVisual\b/i,
  /\bboost/i, /\brealce/i, /\bgamma(Halo|Visual|Render)/i
];
esteticos.forEach(function (re) {
  ok(!re.test(codigo), 'la capa fotométrica no usa ' + re.source);
});

/* ── 4. La fotometría no nombra los mandos del ojo (ADR-0006) ────────────── */
console.log('\n4 · métricas fotométricas y perceptuales separadas (ADR-0006):');

['pupilaOjo', 'pupilaSalida', 'sqm', 'SBe', 'contraste'].forEach(function (mando) {
  ok(!(new RegExp('\\b' + mando + '\\b')).test(codigo),
    'bitacora-cumulos.js no usa ' + mando);
});

/* ── 5. Los ADR de v7 existen y dicen lo que deben ───────────────────────── */
console.log('\n5 · los ADR están en el árbol:');

var adrs = [
  ['0004', /estétic/i],
  ['0005', /vacu/i],
  ['0006', /perceptual/i],
  ['0007', /capa/i],
  ['0008', /arn[ée]s/i]
];
var dirAdr = path.join(__dirname, '..', 'simulador_ocular', 'docs', 'adr');
var listado = fs.readdirSync(dirAdr);
adrs.forEach(function (par) {
  var f = listado.filter(function (n) { return n.indexOf(par[0] + '-') === 0; })[0];
  var texto = f ? fs.readFileSync(path.join(dirAdr, f), 'utf8') : '';
  ok(!!f && par[1].test(texto) && /## Regla/.test(texto),
    'ADR-' + par[0] + ' existe, trata su tema y deja una regla escrita');
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
