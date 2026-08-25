#!/usr/bin/env node
/* Test de la EXPORTACIÓN (registro/spec-exportar-oal.md).

   Lo que aquí se prueba es el ciclo entero sin levantar WordPress: un `estado`
   como el que devuelve /wp-json/bitacora/v1/estado-oal, escrito a XML por el
   motor, leído de vuelta y escrito otra vez. Si esa vuelta pierde algo, el
   fichero que un compañero corrige y vuelve a subir entra distinto de como
   salió, y eso no se nota hasta tener cientos.

   Las reglas que vigila, todas de la spec:
     - solo se emiten los recursos que alguna observación referencia;
     - el <contact> es solo del que exporta;
     - una observación de tres entradas son tres <observation> con id distintos,
       y las tres comparten noche y objeto, que es por donde el importador las
       vuelve a fundir en una;
     - cada <result> lleva su xsi:type y su <rating>, y cada observación su
       <session>;
     - el correo sale del MISMO estado que el XML.

   Sin dependencias:  node scripts/test_oal_exportar.js */
'use strict';

var motor = require('./lib_motor_oal.js');
var OAL = motor.cargar();

var fallos = 0;
function eq(a, b, et) {
  var iguales = JSON.stringify(a) === JSON.stringify(b);
  if (iguales) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function ok(c, et) {
  if (c) { console.log('  ok   ' + et); } else { fallos++; console.log('  FALLA ' + et); }
}
function cuantas(xml, re) { return (xml.match(re) || []).length; }

/* ── El estado que devuelve el endpoint ────────────────────────────────────
   Una salida con dos observaciones: M13, mirada a tres aumentos (tres entradas
   de la bitácora, tres <observation> en OAL), y NGC 6826, que la firmó un
   compañero. El catálogo del usuario tiene además un tubo, un ocular y una base
   que esa noche no se usaron: no deben salir del fichero.                   */

function estado() {
  return {
    observador: { nombre: 'Israel', apellidos: 'Pérez de Tudela', correo: 'isra@ejemplo.es' },
    lugares: [
      { id: 'lu7', nombre: 'El Culebrín II', lat: 38.064, lon: -6.206, altitud: 600, tz: 120 },
      { id: 'lu9', nombre: 'Base que esa noche no se pisó', lat: 40, lon: -3, altitud: 700, tz: 120 }
    ],
    telescopios: [
      { id: 'te3', modelo: 'El Dobson', apertura: 305, focal: 1494.5 },
      { id: 'te4', modelo: 'Refractor que se quedó en casa', apertura: 80, focal: 480 }
    ],
    oculares: [
      { id: 'oc2', modelo: 'Nagler 22mm', focal: 22, campo: 82 },
      { id: 'oc5', modelo: 'Nagler 7mm', focal: 7, campo: 82 },
      { id: 'oc8', modelo: 'Ocular sin estrenar', focal: 40, campo: 68 }
    ],
    auxiliares: [{ id: 'au1', modelo: 'Barlow 2x', factor: 2 }],
    noches: [{
      id: 'n42', fecha: '2026-08-05', lugarId: 'lu7', comienzo: '22:30', fin: '03:00',
      tripulacion: 'Ángel L. Huelmo, Víctor', meteo: 'Despejado',
      cronica: 'Salida larga & sin luna'
    }],
    observaciones: [
      { id: 'obs11-1', nocheId: 'n42', objeto: 'M13', ra: 250.42, dec: 36.46, otype: 'GlC',
        hora: '23:40', telescopioId: 'te3', ocularId: 'oc2', auxiliarId: '', aumentos: 67.9,
        sqm: 21.42, ir: -18, seeing: 3, bortle: 4,
        texto: 'Enorme y granulado', observador: 'Israel Pérez de Tudela' },
      { id: 'obs11-2', nocheId: 'n42', objeto: 'M13', ra: 250.42, dec: 36.46, otype: 'GlC',
        hora: '23:40', telescopioId: 'te3', ocularId: 'oc5', auxiliarId: '', aumentos: 213.5,
        sqm: 21.42, ir: -18, seeing: 3, bortle: 4,
        texto: 'Se resuelve entera', observador: 'Israel Pérez de Tudela' },
      { id: 'obs11-3', nocheId: 'n42', objeto: 'M13', ra: 250.42, dec: 36.46, otype: 'GlC',
        hora: '23:40', telescopioId: 'te3', ocularId: 'oc5', auxiliarId: 'au1', aumentos: 427,
        sqm: 21.42, ir: -18, seeing: 3, bortle: 4,
        texto: 'Al límite del seeing', observador: 'Israel Pérez de Tudela' },
      // De madrugada, otro cielo (el SQM es direccional) y otra firma.
      { id: 'obs12-1', nocheId: 'n42', objeto: 'NGC 6826', ra: 296.2, dec: 50.52, otype: 'PN',
        hora: '02:15', telescopioId: 'te3', ocularId: 'oc5', auxiliarId: '', aumentos: 213.5,
        sqm: 20.9, ir: -14, seeing: 4, bortle: 5,
        texto: 'Parpadea al mirar de lado', observador: 'Ángel L. Huelmo' }
    ]
  };
}

var e = estado();
var xml = OAL.xmlDe(e);

/* ── Solo lo que se usó ───────────────────────────────────────────────────── */

console.log('el fichero lleva solo los recursos que alguna fila referencia:');
eq(cuantas(xml, /<site id=/g), 1, 'una sola base: la de esa noche');
ok(xml.indexOf('Base que esa noche no se pisó') === -1, 'la otra base no viaja');
eq(cuantas(xml, /<scope id=/g), 1, 'un solo telescopio');
ok(xml.indexOf('Refractor que se quedó en casa') === -1, 'el que no salió, tampoco');
eq(cuantas(xml, /<eyepiece id=/g), 2, 'los dos oculares que se usaron');
ok(xml.indexOf('Ocular sin estrenar') === -1, 'el que no se usó se queda fuera');
eq(cuantas(xml, /<lens id=/g), 1, 'la Barlow, que sí se montó');

/* ── Quién firma y a quién se le da el correo ─────────────────────────────── */

console.log('el <contact> es solo del que exporta:');
eq(cuantas(xml, /<contact>/g), 1, 'un único contacto en todo el fichero');
ok(xml.indexOf('<contact>isra@ejemplo.es</contact>') > -1, 'y es el del que exporta');
ok(/<observer id="ob1">[\s\S]*?<contact>/.test(xml), 'va dentro de ob1, no de un compañero');

console.log('cada persona se declara una vez, firme donde firme:');
eq(cuantas(xml, /<observer id=/g), 3, 'el que exporta y sus dos compañeros');
ok(xml.indexOf('<observer>ob1</observer>') > -1, 'las suyas las firma él');
var ang = /<observer id="(co\d+)">\s*<firstName>Ángel L\. Huelmo<\/firstName>/.exec(xml);
ok(!!ang, 'el compañero que firmó una observación está en <observers>');
ok(ang && xml.indexOf('<observer>' + ang[1] + '</observer>') > -1,
   'y la observación suya lo referencia a él, no al dueño');
ok(ang && xml.indexOf('<coObserver>' + ang[1] + '</coObserver>') > -1,
   'el mismo id le sirve de tripulante: un nombre, una persona');

/* ── Una observación, varias entradas ─────────────────────────────────────── */

console.log('tres entradas de la bitácora son tres <observation>:');
var ids = (xml.match(/<observation id="([^"]+)"/g) || []).map(function (s) {
  return /"([^"]+)"/.exec(s)[1];
});
eq(ids.length, 4, 'cuatro observaciones en el fichero');
eq(ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length, 4, 'los cuatro id, distintos');
eq(cuantas(xml, /<target id=/g), 2, 'y solo dos targets: M13 se cataloga una vez');
eq(cuantas(xml, /<session>n42<\/session>/g), 4, 'todas dicen de qué noche son');

/* ── Lo que el esquema exige ──────────────────────────────────────────────── */

console.log('el <result> se puede instanciar y la noche no se pierde:');
eq(cuantas(xml, /<result xsi:type="oal:findingsDeepSkyType">/g), 4, 'cada result con su xsi:type');
eq(cuantas(xml, /<rating>99<\/rating>/g), 4, 'y su rating 99 («desconocido», que es la verdad)');
ok(xml.indexOf('<begin>2026-08-06T02:15:00+02:00</begin>') > -1,
   'los instantes llevan el desfase local, no Z, y la madrugada su fecha de reloj');
var orden = /<observation id="obs11-1">([\s\S]*?)<\/observation>/.exec(xml)[1];
var secuencia = (orden.match(/<\/?([\w:-]+)[ >]/g) || []).join(' ');
ok(secuencia.indexOf('<observer') < secuencia.indexOf('<target'), 'el observador va antes que el target');
ok(secuencia.indexOf('<target') < secuencia.indexOf('<begin'), 'y el target antes que el instante');
ok(secuencia.indexOf('<magnification') < secuencia.indexOf('<result'), 'los aumentos antes del resultado');
ok(secuencia.indexOf('<result') < secuencia.indexOf('<bit:'), 'y lo nuestro, al final');

console.log('el cielo cuelga de la observación, no de la noche (ADR 0001):');
ok(xml.indexOf('<bit:sqm>') === -1, 'la sesión no lleva cielo');
ok(xml.indexOf('<sky-quality unit="mags-per-squarearcsec">20.9</sky-quality>') > -1,
   'la de madrugada escribe el suyo, distinto');

/* ── El ciclo: exportar, corregir, reimportar ─────────────────────────────── */

console.log('estado -> xmlDe -> leer -> estado no pierde nada:');
var vuelta = OAL.leer(xml);
eq(OAL.xmlDe(vuelta), xml, 'el XML de la vuelta es idéntico al de la ida');
eq(vuelta.observaciones.map(function (o) { return o.id; }),
   ['obs11-1', 'obs11-2', 'obs11-3', 'obs12-1'], 'los id de las observaciones se conservan');
eq(vuelta.noches[0].id, 'n42', 'y el de la noche, que es lo que evita duplicar al reimportar');
eq(vuelta.noches[0].fecha, '2026-08-05', 'la noche sigue siendo la del anochecer');
eq(vuelta.observaciones[3].observador, 'Ángel L. Huelmo', 'quién firmó vuelve por su nombre');
eq(vuelta.observaciones[0].observador, 'Israel Pérez de Tudela', 'y el dueño por el suyo');
eq(vuelta.noches[0].cronica, 'Salida larga & sin luna', 'la crónica se desescapa');
eq(vuelta.observaciones[2].aumentos, 427, 'los aumentos de la entrada con Barlow');
eq(vuelta.observaciones[2].auxiliarId, 'au1', 'y la Barlow con la que se midieron');

console.log('las tres hermanas vuelven con la misma noche y el mismo objeto:');
var hermanas = vuelta.observaciones.filter(function (o) { return o.objeto === 'M13'; });
eq(hermanas.length, 3, 'las tres siguen ahí');
eq(hermanas.map(function (o) { return o.nocheId; }), ['n42', 'n42', 'n42'], 'misma noche');
// Noche + objeto es la clave con la que el importador las funde otra vez en una
// observación de tres entradas (bitacora_oal_agrupar).
eq(hermanas.map(function (o) { return OAL.clave(o.objeto); }).filter(function (x, i, a) {
  return a.indexOf(x) === i;
}).length, 1, 'y un solo objeto: por ahí las funde el importador');

/* ── El correo ────────────────────────────────────────────────────────────── */

console.log('el correo sale del mismo estado que el XML:');
var correo = OAL.textoDe(e);
ok(correo.indexOf('<h2>Salida del 5 de agosto de 2026</h2>') > -1, 'cabecera con la fecha de la noche');
ok(correo.indexOf('El Culebrín II') > -1, 'la base');
ok(correo.indexOf('22:30–03:00') > -1, 'las horas de la salida');
ok(correo.indexOf('SQM 21.42') > -1, 'el cielo');
ok(correo.indexOf('Tripulación: Ángel L. Huelmo, Víctor') > -1, 'y la tripulación');
eq((correo.match(/<tr>/g) || []).length, 5, 'una fila por observación, más la cabecera de la tabla');
ok(correo.indexOf('<td>23:40</td><td>M13</td><td>67.9×</td><td>Enorme y granulado</td>') > -1,
   'cada fila con su hora, su objeto, su aumento y lo que se vio');
ok(correo.indexOf('Salida larga &amp; sin luna') > -1, 'el ampersand va escapado, como en el XML');
eq(OAL.textoDe(e), correo, 'y es determinista: el mismo estado da el mismo correo');
// ADR 0004: aquí no se redacta nada. Todo lo que sale del correo estaba en el
// estado, así que quitar los textos del observador deja la tabla vacía de prosa.
var mudo = estado();
mudo.observaciones.forEach(function (o) { o.texto = ''; });
mudo.noches[0].cronica = '';
ok(OAL.textoDe(mudo).indexOf('Enorme') === -1, 'sin descripciones no aparece ninguna frase');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nok · la salida se exporta, se lee de vuelta igual y se cuenta en el correo');
