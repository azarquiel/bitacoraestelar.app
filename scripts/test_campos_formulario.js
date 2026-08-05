#!/usr/bin/env node
/* Test de los CAMPOS de formulario (resources/css/bitacora-base.css).

   Los fragmentos HTML se pegan en el editor de WordPress y el CSS va por FTP:
   son dos archivos que nadie obliga a viajar juntos, así que se puede añadir un
   campo nuevo y dejarlo sin estilo sin que nada avise. Eso pasó con la crónica
   de "Mis viajes": un <textarea> dentro de un label.field, con el aspecto por
   defecto del navegador —blanco, sobre un fondo oscuro— entre campos que sí
   seguían la paleta.

   El contrato es "un control dentro de un label.field se ve como los demás", y
   se comprueba cruzando las dos fuentes: qué controles usan los fragmentos y
   cuáles estiliza la hoja común. No mira colores concretos, solo que el control
   esté cubierto: así no se rompe al retocar la paleta.

   Sin dependencias:  node scripts/test_campos_formulario.js */
'use strict';

var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var CSS = path.join(RAIZ, 'resources/css/bitacora-base.css');
var FRAGMENTOS = ['registro', 'simulador_ocular'];

// Controles que NO llevan el aspecto de campo de texto y por eso no cuentan:
// el de archivo lo pinta el navegador con su propio botón, y los ocultos y las
// casillas no tienen caja que estilizar.
var EXENTOS = ['file', 'hidden', 'checkbox', 'radio', 'submit', 'button'];

var fallos = 0;
function ok(cond, et) {
  if (cond) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et); }
}

/* Los campos salen de dos sitios: el fragmento que se pega en WordPress y el
   .js que pinta los que son variables (la flota, las entradas por ocular). Los
   dos escriben el mismo `label.field`, así que los dos entran aquí. */
function fuentes() {
  var salida = [];
  FRAGMENTOS.forEach(function (dir) {
    [path.join(RAIZ, dir), path.join(RAIZ, dir, 'resources/js')].forEach(function (d) {
      if (!fs.existsSync(d)) return;
      fs.readdirSync(d).forEach(function (f) {
        if (!/\.(html|js)$/.test(f)) return;
        var txt = fs.readFileSync(path.join(d, f), 'utf8');
        if (txt.indexOf('field') === -1) return;
        salida.push({ archivo: path.relative(RAIZ, path.join(d, f)), txt: txt });
      });
    });
  });
  return salida;
}

/* Los controles que viven dentro de un <label class="field">. Es ahí donde el
   aspecto lo pone la hoja común; lo que va suelto (las entradas por ocular, la
   salida JSON) trae el suyo propio y no entra en este contrato. */
function controlesEnCampos(txt) {
  var encontrados = [];
  var campo = /<label[^>]*class="[^"]*\bfield\b[^"]*"[^>]*>([\s\S]*?)<\/label>/g;
  var m;
  while ((m = campo.exec(txt))) {
    var dentro = m[1];
    if (/<textarea/.test(dentro)) encontrados.push('textarea');
    if (/<select/.test(dentro)) encontrados.push('select');
    var input = /<input[^>]*>/g, i;
    while ((i = input.exec(dentro))) {
      var tipo = /type="?([a-z-]+)"?/.exec(i[0]);
      tipo = tipo ? tipo[1] : 'text';           // sin type, un <input> es de texto
      if (EXENTOS.indexOf(tipo) === -1) encontrados.push('input[type=' + tipo + ']');
    }
  }
  return encontrados;
}

/* Un control está cubierto si la hoja común le da caja: fondo, borde y color.
   Se busca la regla que lo nombra, no un color concreto. */
function cubiertos(css) {
  var lista = [];
  var regla = /([^{}]+)\{([^}]*)\}/g, m;
  while ((m = regla.exec(css))) {
    var selector = m[1], cuerpo = m[2];
    if (!/background\s*:/.test(cuerpo) || !/border\s*:/.test(cuerpo)) continue;
    if (/\btextarea\b/.test(selector)) lista.push('textarea');
    if (/\bselect\b/.test(selector)) lista.push('select');
    var tipos = selector.match(/input\[type=([a-z-]+)\]/g) || [];
    tipos.forEach(function (t) { lista.push(t.replace('input[type=', 'input[type=') ); });
    if (/(^|[\s,])input(?![\[\w-])/.test(selector)) lista.push('input[type=text]');
  }
  return lista;
}

var css = fs.readFileSync(CSS, 'utf8');
var cubre = cubiertos(css);

console.log('todo control dentro de un label.field tiene aspecto de campo:');
var total = 0;
fuentes().forEach(function (f) {
  var vistos = controlesEnCampos(f.txt).filter(function (c, i, a) { return a.indexOf(c) === i; });
  total += vistos.length;
  vistos.forEach(function (c) {
    ok(cubre.indexOf(c) !== -1, f.archivo + ' · ' + c + ' está estilizado en bitacora-base.css');
  });
});
// Si el reconocimiento de campos se rompiera, el test pasaría sin mirar nada.
ok(total > 10, 'se han encontrado campos que comprobar (' + total + ')');

console.log(fallos ? '\n' + fallos + ' FALLO(S)\n' : '\nok · ningún campo se queda con el estilo del navegador\n');
process.exit(fallos ? 1 : 0);
