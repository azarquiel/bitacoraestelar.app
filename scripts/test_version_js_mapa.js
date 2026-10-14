#!/usr/bin/env node
/* Test del VERSIONADO de caché de los JS de mapa.html (historia #449).

   Un JS que cambia debe llevar un ?v= nuevo en mapa.html, o el navegador sirve
   su copia vieja junto a ficheros nuevos (3bda813: la rueda lanzaba TypeError).

   Se compara con el merge-base con origin/main: cada <script ... ?v=> cuyo
   fichero difiere de esa base (commits de la rama y árbol de trabajo) tiene que
   tener un ?v= distinto del que mapa.html llevaba en la base. Subir el ?v= de un
   fichero que no ha cambiado no falla. Solo git local: sin red.

   Sin dependencias:  node scripts/test_version_js_mapa.js  */
'use strict';

var fs = require('fs'), path = require('path'), cp = require('child_process');
var RAIZ = path.join(__dirname, '..');
var HTML = 'mapa/mapa.html';

/* URL pública -> fichero del repo. Lo dinámico (datos.js, de WordPress) no
   está en el repo y se salta. */
var PREFIJOS = [['/bitacora-mapa/js/', 'mapa/js/'], ['/wp-content/uploads/bitacora/', 'resources/js/']];

/* {fichero: v} de los <script src=...?v=> vivos (no los comentados). */
function versiones(html) {
  var res = {}, re = /<script[^>]*\ssrc="([^"?]+)\?v=([^"]+)"/g, m;
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  while ((m = re.exec(html))) {
    for (var i = 0; i < PREFIJOS.length; i++) {
      if (m[1].indexOf(PREFIJOS[i][0]) === 0) { res[PREFIJOS[i][1] + m[1].slice(PREFIJOS[i][0].length)] = m[2]; break; }
    }
  }
  return res;
}

/* Ficheros cambiados sin versión nueva. */
function sinVersionNueva(actual, base, cambiados) {
  return cambiados.filter(function (f) { return f in actual && actual[f] === base[f]; });
}

var fallos = 0;
function ok(c, msg) { if (c) console.log('  ok  ' + msg); else { fallos++; console.error('  FALLA  ' + msg); } }
function git() { return cp.execFileSync('git', [].slice.call(arguments), { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1 << 26 }); }

console.log('Lógica (sintética)');
var h = function (v) { return '<script src="/bitacora-mapa/js/a.js?v=' + v + '"></script><!-- <script src="/bitacora-mapa/js/c.js?v=1"></script> -->' +
  '<script src="/bitacora-mapa/js/b.js?v=7"></script><script src="/wp-json/bitacora/v1/datos.js?v=1"></script>'; };
var base = versiones(h('1'));
ok(Object.keys(base).join() === 'mapa/js/a.js,mapa/js/b.js', 'ignora lo comentado y lo que no está en el repo');
ok(sinVersionNueva(versiones(h('1')), base, ['mapa/js/a.js']).join() === 'mapa/js/a.js', 'JS cambiado sin ?v= nuevo: falla y lo nombra');
ok(sinVersionNueva(versiones(h('2')), base, ['mapa/js/a.js']).length === 0, 'JS cambiado con ?v= nuevo: pasa');
ok(sinVersionNueva(versiones(h('2')), base, []).length === 0, '?v= subido sin cambio en el JS: no falla');

console.log('Rama contra origin/main');
var ref = git('merge-base', 'HEAD', 'origin/main').trim();
var cambiados = git('diff', '--name-only', ref).split('\n').filter(Boolean);
var actual = versiones(fs.readFileSync(path.join(RAIZ, HTML), 'utf8'));
var antes = versiones(git('show', ref + ':' + HTML));
var malos = sinVersionNueva(actual, antes, cambiados);
ok(!malos.length, 'todo JS cambiado desde ' + ref.slice(0, 7) + ' lleva ?v= nuevo' + (malos.length ? ': ' + malos.join(', ') : ''));

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
