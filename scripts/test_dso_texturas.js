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
     · y cubre el banco del ADR 0024: los controles de exclusión salen «fila»
       con su motivo y sin red, y un objeto sin textura NO tiene fila, porque
       una fila sin motivo apagaría el respaldo por proxy en silencio. La
       cardinalidad la devuelve lib_banco_dso.js, no este fichero (ADR 0005);
     · el informe (docs/validacion/dso_texturas_informe.md) sale de lo escrito y
       regenerarlo no cambia un byte;
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
ok(antes === despues, 'regenerarlo no cambia un byte (' + n + ' fila(s))');
var json = fs.readdirSync(G.FIXTURES).filter(function (f) { return /\.json$/.test(f); });
var sidecars = json.filter(function (f) { return !/\.fila\.json$/.test(f); }).length;
ok(n === json.length + G.filasControl().length,
   'una fila por sidecar y una por control, ni más ni menos');

/* El banco lo fija el ADR 0024 y lo devuelve lib_banco_dso.js: ni la lista ni su
   tamaño se escriben aquí (ADR 0005), porque clavar el número hace que el
   guardián falle el día que el catálogo crezca en vez de crecer con él. */
console.log('\nEl manifiesto cubre el banco (ADR 0024):');
var B = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);
var b = B.banco();
b.avisos.forEach(function (a) { console.log('  AVISO · ' + a); });
/* Se lee el manifiesto RECIÉN generado (`despues`), no el commiteado: la
   comprobación de arriba ya dice que son el mismo byte a byte, así que juzgar el
   generado ata estas promesas al código y no solo al fichero de git. */
var MAN = (new Function('window', despues + ';return window.BITACORA_DSO_TEXTURAS;'))({});
function filaMan(nombre) {
  for (var i = 0; i < MAN.length; i++) if (MAN[i][0] === nombre) return MAN[i];
  return null;
}
ok(b.objetos.length > 0 && b.controles.length > 0,
   'el banco trae ' + b.objetos.length + ' objetos y ' + b.controles.length + ' controles');

/* Los controles, uno a uno: son la promesa de que «no tiene textura» viaja como
   dato con su motivo, y no como silencio que el runtime resolvería pidiendo el
   FITS al proxy. La cardinalidad de este bucle la pone el banco. */
b.controles.forEach(function (c) {
  var f = filaMan(c.fila ? c.fila[0] : c.nombre);
  var bien = !!f && f[1] === 'fila' && f[6] === c.esperado && f[2] === '';
  ok(bien, 'el control ' + c.nombre + ' sale «fila» con motivo «' + c.esperado + '»' +
     (bien ? '' : ' — y sale ' + JSON.stringify(f)));
});

/* «Sin pedir red» no es una promesa del runtime aquí: es que el veredicto de los
   controles se calcula del catálogo. Con `fetch` puesto a estallar, sigue. */
var fetchOriginal = global.fetch;
global.fetch = function () { throw new Error('el generador ha pedido red'); };
var control0 = null, exploto = '';
try { control0 = G.filasControl(); } catch (e) { exploto = e.message; }
global.fetch = fetchOriginal;
ok(control0 && control0.length === b.controles.length && !exploto,
   'las filas de los controles salen sin una sola petición' + (exploto ? ' — ' + exploto : ''));

/* Un objeto del banco está en el manifiesto si —y solo si— tiene su textura
   escrita: sin fila, el runtime cae al proxy, que es el régimen mixto de la
   fase 1. Una fila «fila» con motivo vacío apagaría ese respaldo en silencio. */
var enManifiesto = 0, alProxy = 0, resueltos = 0, malos = [];
b.objetos.forEach(function (o) {
  var f = filaMan(o.nombre);
  var id = window.BitacoraPS1.ps1IdTextura(o.nombre);
  var hay = fs.readdirSync(G.FIXTURES).some(function (x) {
    return x.indexOf(id + '.') === 0 && /\.json$/.test(x);
  });
  if (hay) resueltos++;
  if (!f) { alProxy++; if (hay) malos.push(o.nombre + ' tiene sidecar y no está en el manifiesto'); return; }
  enManifiesto++;
  if (!hay) malos.push(o.nombre + ' está en el manifiesto sin sidecar');
  if (f[1] === 'fila' && !f[6]) malos.push(o.nombre + ' es «fila» sin motivo');
});
ok(enManifiesto + alProxy === b.objetos.length && !malos.length,
   'los ' + b.objetos.length + ' objetos del banco: ' + enManifiesto + " declarados, " +
   alProxy + ' al proxy' + (malos.length ? ' — ' + malos.join('; ') : ''));

console.log('\nEl informe sale de lo escrito:');
var infAntes = fs.readFileSync(G.INFORME, 'utf8');
var inf = G.escribirInforme(G.FIXTURES);
var infDespues = fs.readFileSync(G.INFORME, 'utf8');
if (infAntes !== infDespues) fs.writeFileSync(G.INFORME, infAntes);
ok(infAntes === infDespues, 'regenerarlo no cambia un byte');
ok(inf.imagenes === sidecars && inf.pendientes === b.objetos.length - resueltos,
   'cuenta las ' + inf.imagenes + ' texturas escritas y las ' + inf.pendientes + ' pendientes');
ok(/fracAusenciaEscena/.test(infAntes) && /Volumen/.test(infAntes),
   'trae la lista de revisión y el volumen');

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
     proceso en verde con la mitad sin correr. El sumando de los controles NO se
     escribe: lo pone el banco, que es quien sabe cuántos son; las 23 restantes
     son comprobaciones fijas de este fichero, no objetos.

     Mutaciones documentadas, las dos comprobadas:

       · quitar `gal.ladoArcmin.toFixed(3)` de la semilla de `version()` deja 1
         rojo, «cambiar ladoArcmin cambia el hash». Solo uno: el del sidecar del
         banco compara contra el hash que este mismo código calcula, así que se
         mueve con la mutación y no la caza. Por eso los cinco campos se prueban
         uno a uno y no por el resultado final;
       · quitar `.concat(filasControl())` de `escribirManifiesto()` deja 7 rojos:
         los 5 controles, la cuenta de filas y el manifiesto commiteado, que
         deja de salir byte a byte de lo que hay en disco. */
  var MINIMO = 23 + b.controles.length;
  console.log('');
  ok(comprobaciones >= MINIMO,
     'se ejecutaron todas las comprobaciones (' + comprobaciones + ' ≥ ' + MINIMO + ')');
  console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\ntodo en orden.');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.error('EXCEPCIÓN: ' + e.stack);
  process.exit(1);
});
