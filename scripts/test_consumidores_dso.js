#!/usr/bin/env node
/* Test de los CONSUMIDORES de la textura DSO (T7, #204).

   bitacora-ps1.js lee window.BitacoraPNG16 y window.BITACORA_DSO_TEXTURAS en
   tiempo de llamada (ADR 0020: el orden de los <script> importa y solo el
   guardián lo dice). Aquí se fija que las dos páginas cargan los dos ficheros
   ANTES de bitacora-ps1.js, y que el servidor de desarrollo sirve dso/ con su
   tipo correcto (el PNG de 16 bits se lee con fetch, no con <img>).

   Sin dependencias:  node scripts/test_consumidores_dso.js */
'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var net = require('net');
var cp = require('child_process');

var RAIZ = path.join(__dirname, '..');
var fallos = 0, comprobaciones = 0;
function ok(cond, et) {
  comprobaciones++;
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et); }
}

var PAGINAS = ['simulador_ocular/ocular-wordpress.html',
               'registro/registrar-observacion-wordpress.html'];
PAGINAS.forEach(function (p) {
  var html = fs.readFileSync(path.join(RAIZ, p), 'utf8');
  function pos(f) {
    var m = html.match(new RegExp('<script src="/wp-content/uploads/bitacora/' + f.replace(/\./g, '\\.') + '\\?v=[0-9_]+" defer>'));
    return m ? m.index : -1;
  }
  var ps1 = pos('bitacora-ps1.js'), png = pos('bitacora-png16.js'), man = pos('dso-texturas-datos.js');
  console.log(p + ':');
  ok(ps1 >= 0, 'carga bitacora-ps1.js');
  ok(png >= 0 && png < ps1, 'bitacora-png16.js va antes que bitacora-ps1.js');
  ok(man >= 0 && man < ps1, 'dso-texturas-datos.js va antes que bitacora-ps1.js');
});

/* Servidor de desarrollo: un php -S efímero sobre una copia de la fixture en
   simulador_ocular/dso/ (ignorado en git), que se borra al acabar. */
var DSO = path.join(RAIZ, 'simulador_ocular/dso');
var FIX = path.join(RAIZ, 'scripts/fixtures/dso/NGC_5194.a4ddf9db');
var NOMBRE = '_test_consumidores.' + process.pid;
var creado = !fs.existsSync(DSO);
fs.mkdirSync(DSO, { recursive: true });   // dos copias a la vez (bateria -j 2) no chocan
function limpiar() {
  try {
    fs.unlinkSync(path.join(DSO, NOMBRE + '.png'));
    fs.unlinkSync(path.join(DSO, NOMBRE + '.json'));
    if (creado) fs.rmdirSync(DSO);
  } catch (e) {}
}

var PUERTO, srv;
/* Puerto libre de verdad: el SO lo asigna y se suelta justo antes del php -S. */
function puertoLibre() {
  return new Promise(function (res, rej) {
    var s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { res(p); }); });
  });
}

function pedir(ruta) {
  return new Promise(function (res) {
    http.get({ host: '127.0.0.1', port: PUERTO, path: ruta }, function (r) {
      var trozos = [];
      r.on('data', function (d) { trozos.push(d); });
      r.on('end', function () {
        res({ estado: r.statusCode, tipo: r.headers['content-type'] || '', cuerpo: Buffer.concat(trozos) });
      });
    }).on('error', function () { res(null); });
  });
}
function esperar(n) {
  if (srv.exitCode !== null) return Promise.resolve(null);   // php murió (puerto pisado, php ausente)
  return pedir('/').then(function (r) {
    if (r || n <= 0) return r;
    return new Promise(function (s) { setTimeout(s, 100); }).then(function () { return esperar(n - 1); });
  });
}

puertoLibre().then(function (p) {
  PUERTO = p;
  srv = cp.spawn('php', ['-S', '127.0.0.1:' + PUERTO, 'scripts/dev_servidor_ocular.php'],
                 { cwd: RAIZ, stdio: 'ignore' });
  return new Promise(function (res, rej) {
    srv.on('error', rej);
    srv.on('spawn', res);
  });
}).then(function () {
  fs.copyFileSync(FIX + '.png', path.join(DSO, NOMBRE + '.png'));
  fs.copyFileSync(FIX + '.json', path.join(DSO, NOMBRE + '.json'));
  return esperar(30);
}).then(function (arriba) {
  console.log('scripts/dev_servidor_ocular.php:');
  ok(arriba, 'php -S arranca');
  var base = '/wp-content/uploads/bitacora/dso/' + NOMBRE;
  return Promise.all([pedir(base + '.png'), pedir(base + '.json'),
                      pedir('/wp-content/uploads/bitacora/dso/../ocular-wordpress.html')]);
}).then(function (r) {
  var png = r[0], json = r[1], fuga = r[2];
  ok(png && png.estado === 200 && /^image\/png/.test(png.tipo), 'sirve dso/*.png como image/png');
  ok(png && png.cuerpo.length === fs.statSync(FIX + '.png').size && png.cuerpo[0] === 0x89,
     'el PNG llega entero y sin tocar');
  ok(json && json.estado === 200 && /^application\/json/.test(json.tipo), 'sirve dso/*.json como application/json');
  /* Mutación que lo pone rojo (ADR 0005): admitir «/» en la clase de caracteres
     de la regex del PHP ([A-Za-z0-9._/-]+) sirve ocular-wordpress.html por aquí. */
  ok(!fuga || fuga.estado !== 200 || !/sim-aux2-input/.test(String(fuga.cuerpo)), 'no sale de dso/ con ../');
  /* Guardián de cardinalidad (ADR 0005): si un then se salta por una excepción
     tragada, el recuento baja de 11 aunque `fallos` siga a 0. */
  ok(comprobaciones >= 11, 'se ejecutaron todas las comprobaciones (' + comprobaciones + ' ≥ 11)');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nTodo verde.');
  process.exitCode = fallos ? 1 : 0;
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + (e && e.stack || e));
  process.exitCode = 1;
}).then(function () {
  limpiar();
  if (srv && srv.exitCode === null) srv.kill();
});
