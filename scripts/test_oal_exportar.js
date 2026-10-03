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

/* ── El correo (ADR 0006: una ficha por objeto) ───────────────────────────── */

console.log('el correo sale del mismo estado que el XML, una ficha por objeto:');
var correo = OAL.textoDe(e);
ok(correo.indexOf('<h2>Salida del 5 de agosto de 2026</h2>') > -1, 'cabecera con la fecha de la noche');
eq(cuantas(correo, /<h3>/g), 2, 'una <h3> por objeto: las tres entradas de M13 son una ficha');
ok(!/<table|<tr|<td/.test(correo), 'sin tabla');
ok(!/\sstyle=/.test(correo), 'sin estilos en línea');
ok(correo.indexOf('<ul>\n<li>Observador: Israel Pérez de Tudela</li>\n<li>Fecha: 5 de agosto de 2026</li>\n<li>Lugar: El Culebrín II</li>') > -1,
   'la cabecera es una lista y empieza como la plantilla: observador, fecha, lugar');
ok(correo.indexOf('Ventana: 20:30–01:00 UT') > -1, 'la ventana va en UT (tz +120)');
ok(correo.indexOf('Seeing: 3 (Antoniadi, regular)') > -1, 'el seeing con su escala a la vista');
ok(correo.indexOf('Transparencia: Mayoritariamente transparente (IR -18)') > -1, 'la transparencia con su banda');
ok(correo.indexOf('Cielo: SQM 21.42 mag/arcsec² · Bortle 4') > -1, 'el brillo del cielo');
ok(correo.indexOf('/5') === -1, 'ninguna escala x/5');
ok(correo.indexOf('Tripulación: Ángel L. Huelmo, Víctor') > -1, 'la tripulación');
eq(cuantas(correo, /Telescopio: /g), 1, 'un solo telescopio: una sola línea…');
ok(correo.indexOf('<li>Telescopio: El Dobson</li>\n</ul>\n<h3>') > -1, '…y en la cabecera');
ok(correo.indexOf('<p>Salida larga &amp; sin luna</p>') < correo.indexOf('Observador: '),
   'la crónica va antes del bloque de datos, y escapada');
ok(correo.indexOf('<h3>M13</h3>\n<ul>\n<li>Ocular: Nagler 22mm · Aumentos: 68x</li>\n<li>Hora: 21:40 UT</li>\n</ul>\n' +
   '<p><em>Enorme y granulado</em></p>\n' +
   '<ul>\n<li>Ocular: Nagler 7mm · Aumentos: 214x</li>\n</ul>\n<p><em>Se resuelve entera</em></p>\n' +
   '<ul>\n<li>Ocular: Nagler 7mm + Barlow 2x · Aumentos: 427x</li>\n</ul>\n<p><em>Al límite del seeing</em></p>') > -1,
   'M13: un subbloque por entrada, en su orden, con la hora en UT solo en el primero');
ok(correo.indexOf('<h3>NGC 6826</h3>\n<ul>\n<li>Ocular: Nagler 7mm · Aumentos: 214x</li>\n<li>Hora: 00:15 UT</li>\n<li>Observador: Ángel L. Huelmo</li>') > -1,
   'la madrugada pasa de día en UT, y la firma ajena lleva su línea');
eq(cuantas(correo, /Observador: /g), 2, 'el dueño solo firma en la cabecera');
eq(OAL.textoDe(e), correo, 'y es determinista: el mismo estado da el mismo correo');
// ADR 0004: aquí no se redacta nada. Todo lo que sale del correo estaba en el
// estado, así que quitar los textos del observador deja las fichas sin prosa.
var mudo = estado();
mudo.observaciones.forEach(function (o) { o.texto = ''; });
mudo.noches[0].cronica = '';
ok(OAL.textoDe(mudo).indexOf('Enorme') === -1, 'sin descripciones no aparece ninguna frase');
ok(OAL.textoDe(mudo).indexOf('<h3>M13</h3>\n<ul>\n<li>Ocular: Nagler 22mm') > -1, 'y la ficha sale igual, sin descripción');

// #396: un intento fallido lleva su estado bajo el nombre; un visto no cambia.
var fallido = estado();
fallido.observaciones[0].resultado = 'detectado_no_visto';
fallido.observaciones[0].motivo = 'luna';
var cf = OAL.textoDe(fallido);
ok(cf.indexOf('</h3>\n<p>Explorado – no confirmado · detectado · Luna</p>') > -1, 'el correo de un fallo dice «Explorado – no confirmado · detectado · Luna»');
eq(cuantas(cf, /Explorado – no confirmado/g), 1, 'y solo el fallo lo lleva');
ok(correo.indexOf('Explorado') === -1, 'el correo de lo visto no cambia');

console.log('la descripción conserva sus párrafos:');
var parrafos = estado();
parrafos.observaciones = [parrafos.observaciones[0]];
parrafos.observaciones[0].texto = 'Línea corta.\n\nPárrafo largo\ncon salto.\r\n\r\n<script>x</script>';
parrafos.noches[0].cronica = 'Llegamos tarde.\n\nPero despejó.';
var cp = OAL.textoDe(parrafos);
ok(cp.indexOf('<p><em>Línea corta.</em></p>\n<p><em>Párrafo largo<br>con salto.</em></p>\n<p><em>&lt;script&gt;x&lt;/script&gt;</em></p>') > -1,
   'línea en blanco = <p>, salto simple = <br>, en cursiva y escapado');
var sintesis = estado();
sintesis.observaciones = [sintesis.observaciones[0]];
sintesis.observaciones[0].texto = 'Rasgos:\n• Forma romboidal\n• Bahía <oscura>\nOrientación dobson.';
ok(OAL.textoDe(sintesis).indexOf('<ul>\n<li><em>Rasgos:</em>\n<ul>\n<li><em>Forma romboidal</em></li>\n' +
   '<li><em>Bahía &lt;oscura&gt;</em></li>\n</ul>\n</li>\n</ul>\n<p><em>Orientación dobson.</em></p>') > -1,
   'las líneas «• » de una síntesis son una sublista colgada de la línea anterior, en una columna');
ok(cp.indexOf('<p>Llegamos tarde.</p>\n<p>Pero despejó.</p>') > -1, 'la crónica, igual pero en redonda');

console.log('se agrupa por noche + objeto, venga de donde venga el estado:');
var pegado = estado();
pegado.observaciones = [
  { id: 'a', nocheId: 'n42', objeto: 'M 13', hora: '23:40', telescopioId: 'te3', ocularId: 'oc2', aumentos: 58, texto: 'uno' },
  { id: 'b', nocheId: 'n42', objeto: 'm-13', hora: '23:40', telescopioId: 'te3', ocularId: 'oc5', aumentos: 225, texto: 'dos' }
];
var cg = OAL.textoDe(pegado);
eq(cuantas(cg, /<h3>/g), 1, 'ids sin obsN- y nombres «M 13» / «m-13»: una sola ficha');
ok(cg.indexOf('<h3>M 13</h3>') > -1, 'con el nombre de la primera entrada');
ok(cg.indexOf('Aumentos: 58x') < cg.indexOf('Aumentos: 225x'), 'y las entradas en el orden en que llegan');

console.log('orden cronológico real, con el convenio de mediodía:');
var orden = estado();
orden.observaciones = [
  { id: 'a', nocheId: 'n42', objeto: 'M 1', hora: '01:15' },
  { id: 'b', nocheId: 'n42', objeto: 'M 2', hora: '' },
  { id: 'c', nocheId: 'n42', objeto: 'M 3', hora: '22:40' },
  { id: 'd', nocheId: 'n42', objeto: 'M 4', hora: '23:50' }
];
eq((OAL.textoDe(orden).match(/<h3>[^<]*<\/h3>/g) || []), ['<h3>M 3</h3>', '<h3>M 4</h3>', '<h3>M 1</h3>', '<h3>M 2</h3>'],
   '22:40 → 23:50 → 01:15 → sin hora');

console.log('dos telescopios: cada ficha lleva el suyo:');
var dos = estado();
dos.observaciones[3].telescopioId = 'te4';
var cd = OAL.textoDe(dos);
eq(cuantas(cd, /Telescopio: /g), 2, 'una línea por ficha');
ok(cd.indexOf('<li>Tripulación: Ángel L. Huelmo, Víctor</li>\n</ul>') > -1, 'ninguna en la cabecera');
ok(cd.indexOf('<li>Hora: 00:15 UT</li>\n<li>Telescopio: Refractor que se quedó en casa</li>') > -1, 'la de NGC 6826, con el suyo');

console.log('sin huso no se escribe UT:');
var sinTz = estado();
sinTz.lugares.forEach(function (l) { l.tz = ''; });
var cs = OAL.textoDe(sinTz);
ok(cs.indexOf(' UT') === -1, 'ninguna hora dice UT');
ok(cs.indexOf('Ventana: 22:30–03:00') > -1 && cs.indexOf('Hora: 23:40') > -1, 'se queda la hora de pared');

console.log('una línea sin dato no se pinta:');
var pobre = estado();
pobre.observaciones = [];
pobre.noches[0].tripulacion = '';
pobre.noches[0].fin = '';
var cpo = OAL.textoDe(pobre);
ok(!/Seeing|Transparencia|Cielo:|Tripulación|Telescopio|<h3>/.test(cpo), 'ni cielo, ni tripulación, ni telescopio, ni fichas');
ok(cpo.indexOf('Ventana: 20:30–? UT') > -1, 'una ventana a medias conserva su ?');
ok(cpo.indexOf('—') === -1, 'y nada de rayas');

console.log('las etiquetas del cielo son las de la app:');
global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;
eq(OAL.TRANSPARENCIA, B.TRANSPARENCIA, 'las bandas de transparencia, las de BitacoraBase');
var fs = require('fs');
['registro/mis-viajes-wordpress.html', 'registro/registrar-observacion-wordpress.html'].forEach(function (f) {
  var html = fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8');
  var sel = /<select id="v?[sS]eeing">([\s\S]*?)<\/select>/.exec(html)[1];
  var opts = [];
  sel.replace(/<option value="(\d)">\d · ([^<]+)<\/option>/g, function (_, v, t) { opts.push(t.toLowerCase()); });
  eq(opts, OAL.ANTONIADI, 'las etiquetas de seeing, las del <select> de ' + f);
});
ok(B.montarTransparencia.toString().indexOf("' · IR ' + t.ir") > -1,
   'el <select> pinta el IR con el guion de siempre, el mismo que el correo');
/* ── Lo que no está en el fichero, no se referencia ───────────────────────── */

console.log('una referencia a lo que no viaja en el fichero no se escribe:');
// Un id sin su <scope>/<eyepiece>/<lens>/<site> arriba es un IDREF colgando:
// no valida, y quien lo lea no sabe a qué apunta. Pasa en cuanto el catálogo
// del estado se queda corto (equipo borrado, salida a medio construir).
var cojo = estado();
cojo.telescopios = [];
cojo.oculares = [];
cojo.auxiliares = [];
cojo.lugares = [];
var xmlCojo = OAL.xmlDe(cojo);
eq(xmlCojo.indexOf('<scope>'), -1, 'sin telescopios en el fichero, ninguna observación los cita');
eq(xmlCojo.indexOf('<eyepiece>'), -1, 'ni oculares');
eq(xmlCojo.indexOf('<lens>'), -1, 'ni lentes');
eq(xmlCojo.indexOf('<site>'), -1, 'ni el sitio');
ok(xmlCojo.indexOf('<observation id=') > -1, 'pero las observaciones siguen saliendo');

console.log('y una salida sin lugar conserva su hora local:');
// Sin lugar no hay huso del lugar. Si nadie lo pone, todo salía en +00:00, o
// sea con la hora movida: la noche trae el suyo (lo pone el servidor).
var sinLugar = estado();
sinLugar.lugares = [];
sinLugar.noches[0].lugarId = '';
sinLugar.noches[0].tz = 120;
var xmlSin = OAL.xmlDe(sinLugar);
ok(xmlSin.indexOf('<begin>2026-08-05T22:30:00+02:00</begin>') > -1, 'la sesión, con el huso de la noche');
ok(xmlSin.indexOf('+00:00') === -1, 'y nada se va a UTC por el camino');
eq(OAL.xmlDe(OAL.leer(xmlSin)), xmlSin, 'y leerlo y volver a escribirlo no mueve la hora');

console.log('con la bitácora entera, cada noche lleva SU huso, no el de la primera que pisó el lugar:');
// El lugar sale una vez y su tz es el de la primera noche. Un sitio pisado en
// marzo (+01:00) y en agosto (+02:00) tiene que fechar cada noche con el suyo,
// o todas las del otro horario entran una hora corridas en AstroPlanner.
var dos = estado();
dos.lugares[0].tz = 60;
dos.noches[0].tz = 120;
dos.noches.push({ id: 'n43', fecha: '2026-03-10', lugarId: 'lu7', tz: 60, comienzo: '21:00', fin: '',
                  tripulacion: '', meteo: '', cronica: '' });
dos.observaciones.push({ id: 'obs12-1', nocheId: 'n43', objeto: 'M42', ra: 83.8, dec: -5.4, otype: 'HII',
  hora: '22:00', telescopioId: 'te3', ocularId: 'oc2', auxiliarId: '', aumentos: 67.9,
  sqm: '', ir: '', seeing: '', bortle: '', texto: 'Trapecio', observador: 'Israel Pérez de Tudela' });
var xmlDos = OAL.xmlDe(dos);
ok(xmlDos.indexOf('<begin>2026-08-05T22:30:00+02:00</begin>') > -1, 'la noche de agosto, en +02:00');
ok(xmlDos.indexOf('<begin>2026-03-10T21:00:00+01:00</begin>') > -1, 'la de marzo, en +01:00');
ok(xmlDos.indexOf('<begin>2026-03-10T22:00:00+01:00</begin>') > -1, 'y su observación también');
var sinTzNoche = estado();
delete sinTzNoche.noches[0].tz;
ok(OAL.xmlDe(sinTzNoche).indexOf('<begin>2026-08-05T22:30:00+02:00</begin>') > -1, 'sin tz en la noche, manda el del lugar');

/* ── El tramo de audio no viaja en el XML (ADR 0005) ──────────────────────── */

console.log('el tramo de audio de una observación no sale en el XML (ADR 0005):');
// El dialecto no lo conoce (ADR 0003): aunque el estado traiga los cuatro
// campos colgando de la observación, xmlDe() no los mira, así que no pueden
// aparecer en ningún <observation> ni en ningún bit:.
var conAudio = estado();
conAudio.observaciones[0].audio_url = 'https://suena.test/audio.mp3';
conAudio.observaciones[0].audio_inicio = 125;
conAudio.observaciones[0].audio_fin = 260;
conAudio.observaciones[0].audio_episodio_url = 'https://suena.test/episodio-87';
var xmlAudio = OAL.xmlDe(conAudio);
eq(xmlAudio, xml, 'el XML con tramo de audio en el estado es idéntico al de sin él');
ok(xmlAudio.indexOf('audio') === -1, 'ni el nombre del campo se cuela en ningún sitio');
ok(xmlAudio.indexOf('suena.test') === -1, 'ni ninguna de sus URLs');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nok · la salida se exporta, se lee de vuelta igual y se cuenta en el correo');
