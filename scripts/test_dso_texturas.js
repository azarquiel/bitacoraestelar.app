#!/usr/bin/env node
/* El generador de texturas DSO (scripts/gen_dso_texturas.js) por el lado del
   ESCRITOR: lo que test_fuente_parche.js prueba es el lector.

   Lo que se vigila aquí:

     · el hash de versión depende de TODO lo que determina los píxeles y de nada
       más, porque la URL que lo lleva es inmutable: dos texturas distintas con
       el mismo nombre serían una imagen vieja servida para siempre;
     · el generador encuentra los objetos por los dos formatos de nombre que
       conviven en el catálogo ('NGC 5194' y 'NGC0040'), y su motivo de ausencia
       es el mismo veredicto que el del banco;
     · el manifiesto commiteado es exactamente el que sale de los sidecars
       commiteados: si alguien edita uno de los dos a mano, se ve;
     · y los bits publicados son los que dicen ser: la textura del banco, leída
       con el decodificador del navegador y recodificada con los parámetros de
       su sidecar, vuelve a dar los mismos 16 bits.

   Sin red y sin $PS1_HARNESS_DIR: todo sale de scripts/fixtures/dso/.

   Uso:  node scripts/test_dso_texturas.js */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;
var G = require('./gen_dso_texturas.js');

var fallos = 0, comprobaciones = 0;
function ok(c, t) {
  comprobaciones++;
  console.log('  ' + (c ? 'ok  ' : 'FALLO') + '  ' + t);
  if (!c) fallos++;
}

var M51 = { nombre: 'NGC 5194', ra: 202.47208, dec: 47.19667, ladoArcmin: 18.035 };

console.log('\nEl hash de versión:');
var v0 = G.version(M51, 1024);
ok(/^[0-9a-f]{8}$/.test(v0), 'son 8 hex (' + v0 + ')');
ok(G.version(M51, 1024) === v0, 'mismo objeto y mismos parámetros, mismo hash');
/* Cada campo, por separado: si uno dejara de entrar, dos parches distintos
   compartirían nombre de fichero y el segundo no llegaría nunca al navegador,
   porque la URL se sirve como inmutable. */
[['nombre', 'NGC 5195'], ['ra', 202.5], ['dec', 47.2], ['ladoArcmin', 18.04]].forEach(function (par) {
  var otro = {};
  Object.keys(M51).forEach(function (k) { otro[k] = M51[k]; });
  otro[par[0]] = par[1];
  ok(G.version(otro, 1024) !== v0, 'cambiar ' + par[0] + ' cambia el hash');
});
ok(G.version(M51, 2048) !== v0, 'cambiar la resolución de salida cambia el hash');

console.log('\nEncontrar el objeto en el catálogo:');
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var m51 = G.filaDe('NGC 5194');
ok(!!m51 && m51[0] === 'NGC 5194', 'una galaxia, por su nombre literal');
/* Las nebulosas van 'NGC0040' y las galaxias 'NGC 5194': con una comparación
   literal, el generador no vería la mitad del catálogo. */
var pn = G.filaDe('NGC 40');
ok(!!pn, 'una nebulosa escrita «NGC 40», que en su catálogo es «NGC0040»');
ok(G.filaDe('no existe tal cosa') === null, 'y lo que no está devuelve null');

console.log('\nPor qué un objeto no tiene textura:');
ok(G.motivoAusencia(m51) === '', 'M51 sí puede tenerla');
var m31 = G.filaDe('NGC 224'), ngc55 = G.filaDe('NGC 55');
ok(!!m31 && G.motivoAusencia(m31) === 'no-cabe', 'M31 no cabe en el parche');
ok(!!ngc55 && G.motivoAusencia(ngc55) === 'sur', 'NGC 55 está por debajo de −30° (' +
   (ngc55 ? G.motivoAusencia(ngc55) : '—') + ')');

console.log('\nEl manifiesto commiteado sale de los sidecars commiteados:');
var antes = fs.readFileSync(G.MANIFIESTO, 'utf8');
var n = G.escribirManifiesto(G.FIXTURES);
var despues = fs.readFileSync(G.MANIFIESTO, 'utf8');
if (antes !== despues) fs.writeFileSync(G.MANIFIESTO, antes);   // el test no deja rastro
ok(antes === despues, 'regenerarlo no cambia un byte (' + n + ' textura(s))');
ok(n === fs.readdirSync(G.FIXTURES).filter(function (f) { return /\.json$/.test(f); }).length,
   'una fila por sidecar, ni más ni menos');

console.log('\nLos bits publicados son los que dice el sidecar:');
var sc = JSON.parse(fs.readFileSync(path.join(G.FIXTURES, PS1.ps1IdTextura('NGC 5194') + '.' + v0 + '.json'), 'utf8'));
ok(sc.version === v0, 'el sidecar del banco lleva el hash que este generador calcula hoy');
ok(sc.generador === G.GENERADOR, 'y la versión del generador que lo escribió (' + sc.generador + ')');
ok(Math.abs(sc.escalaAs - sc.ladoArcmin * 60 / sc.ancho) < 1e-3,
   'la escala declarada es el lado entre los píxeles (' + sc.escalaAs.toFixed(4) + '″/px)');
ok(!!sc.wcs && isFinite(sc.wcs.ra0) && isFinite(sc.wcs.gx),
   'trae la WCS del recorte, no el supuesto de norte arriba');

var png = fs.readFileSync(path.join(G.FIXTURES, PS1.ps1IdTextura('NGC 5194') + '.' + v0 + '.png'));
P16.leer(png).then(function (img) {
  ok(!!img && img.ancho === sc.ancho && img.alto === sc.alto,
     'el PNG se lee y mide lo que declara el sidecar');
  if (!img) return;
  var datos = P16.decodificar(img.u16, sc.codificacion);
  var ceros = 0, nan = 0, i;
  for (i = 0; i < img.u16.length; i++) {
    if (img.u16[i] === 0) ceros++;
    if (datos[i] !== datos[i]) nan++;
  }
  ok(ceros === nan && ceros > 0,
     'el centinela 0 y el NaN son el mismo píxel, todos (' + ceros + ')');
  ok(Math.abs(nan / datos.length - sc.auditoria.fracAusencia) < 1e-12,
     'y son la ausencia que auditó el generador');

  /* Ida y vuelta sobre lo PUBLICADO, con los extremos del sidecar: es la rama
     de `codificar` que usará cualquier regeneración, y la que decide si los
     bits que viajan son reproducibles. */
  var otra = P16.codificar(datos, sc.codificacion), iguales = 0;
  for (i = 0; i < otra.u16.length; i++) if (otra.u16[i] === img.u16[i]) iguales++;
  ok(iguales === otra.u16.length,
     'recodificar lo decodificado devuelve los mismos 16 bits (' +
     (otra.u16.length - iguales) + ' píxeles distintos)');

  var cielo = PS1.ps1Cielo(datos, img.ancho, img.alto);
  ok(Math.abs(cielo - sc.auditoria.cielo) < 0.05 * sc.auditoria.sigma,
     'el cielo que mide la ley de producción sobre lo publicado es el auditado (' +
     cielo.toFixed(4) + ' vs ' + sc.auditoria.cielo.toFixed(4) + ')');

  /* ADR 0005: cardinalidad mínima; sin ella, una promesa perdida deja el
     proceso en verde con la mitad sin correr. Mutación documentada, comprobada:
     quitar `gal.ladoArcmin.toFixed(3)` de la semilla de `version()` en
     gen_dso_texturas.js deja 1 rojo, «cambiar ladoArcmin cambia el hash». Solo
     uno: el del sidecar del banco compara contra el hash que este mismo código
     calcula, así que se mueve con la mutación y no la caza. Por eso los cinco
     campos se prueban uno a uno y no por el resultado final. */
  console.log('');
  ok(comprobaciones >= 20, 'se ejecutaron todas las comprobaciones (' + comprobaciones + ' ≥ 20)');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + e.stack);
  process.exit(1);
});
