#!/usr/bin/env node
/* Test del MOTOR de la plantilla de observaciones (registro/plantilla-oal.html).

   La plantilla es lo único que tocan los compañeros y viaja fuera del portal:
   lo que descarguen es lo que el importador tendrá que creerse. Dos cosas se
   rompen en silencio si nadie las mira:

     - La regla de la noche. Lo visto a las 02:15 pertenece a la noche anterior;
       si el instante del XML sale con la fecha del anochecer en vez de la del
       reloj, cada madrugada acaba en el viaje equivocado y nadie lo nota hasta
       tener cientos.
     - El ciclo descargar -> abrir -> descargar. Si no conserva los
       identificadores, la segunda entrega del mismo XML duplica todo en vez de
       actualizarlo.

   El motor vive dentro del HTML (la plantilla es un fichero único), así que el
   test extrae el bloque <script id="motor"> y lo ejecuta tal cual. El sitio usa
   ese mismo motor extraído a un .js (ADR 0003), y dos copias que divergen es el
   fallo que este repositorio ya sufrió con la astrometría: aquí se afirma que
   son idénticas.

   Sin dependencias:  node scripts/test_oal_plantilla.js */
'use strict';

var motor = require('./lib_motor_oal.js');
var path = require('path');

var incrustado = motor.fuenteIncrustada();
var OAL = motor.cargar(incrustado);

var fallos = 0;
function eq(a, b, et) {
  var iguales = JSON.stringify(a) === JSON.stringify(b);
  if (iguales) { console.log('  ok   ' + et); }
  else { fallos++; console.log('  FALLA ' + et + '\n         esperado ' + JSON.stringify(b) + '\n         obtenido ' + JSON.stringify(a)); }
}
function ok(c, et) {
  if (c) { console.log('  ok   ' + et); } else { fallos++; console.log('  FALLA ' + et); }
}

/* ── El motor extraído es el mismo motor ──────────────────────────────────── */

console.log('el .js servible y el bloque de la plantilla no se separan:');
var extraido = motor.fuenteExtraida();
var relativa = path.relative(path.join(__dirname, '..'), motor.RUTA_EXTRAIDO);
if (extraido === null) {
  fallos++;
  console.log('  FALLA falta ' + relativa + ' · relanza node scripts/generar_motor_oal.js');
} else {
  ok(extraido === incrustado,
     relativa + ' es copia literal del bloque' +
     (extraido === incrustado ? '' : ' · relanza node scripts/generar_motor_oal.js'));
}

/* ── Un estado de ejemplo: una noche, el mismo objeto a dos aumentos ──────── */

function estado() {
  return {
    observador: { nombre: 'Ángel', apellidos: 'L. Huelmo', correo: 'angel@ejemplo.es' },
    lugares: [{ id: 'lu1', nombre: 'El Culebrín II', lat: 38.064, lon: -6.206, altitud: 600, tz: 120 }],
    telescopios: [{ id: 'te1', modelo: 'Skywatcher 12"', apertura: 305, focal: 1494.5 }],
    oculares: [{ id: 'oc1', modelo: 'Nagler 22mm', focal: 22, campo: 82 },
               { id: 'oc2', modelo: 'Nagler 7mm', focal: 7, campo: 82 }],
    auxiliares: [{ id: 'au1', modelo: 'Barlow 2x', factor: 2 }],
    noches: [{ id: 'no1', fecha: '2026-08-05', lugarId: 'lu1', comienzo: '22:30', fin: '03:00',
               sqm: 21.42, ir: -18, seeing: 3, bortle: 4, tripulacion: 'Isra, Víctor',
               meteo: 'Despejado', cronica: 'Noche de las buenas & sin luna' }],
    observaciones: [
      // La primera heredó el cielo de la noche; la segunda midió el suyo, ya de
      // madrugada y con el objeto en otra parte del cielo.
      { id: 'ob1', nocheId: 'no1', objeto: 'M13', ra: 250.42, dec: 36.46, otype: 'GlC',
        hora: '23:40', telescopioId: 'te1', ocularId: 'oc1', auxiliarId: '', aumentos: '',
        sqm: 21.42, ir: -18, seeing: 3, bortle: 4,
        texto: 'Un puño de estrellas' },
      { id: 'ob2', nocheId: 'no1', objeto: 'M13', ra: 250.42, dec: 36.46, otype: 'GlC',
        hora: '02:15', telescopioId: 'te1', ocularId: 'oc2', auxiliarId: '', aumentos: '',
        sqm: 20.9, ir: -18, seeing: 4, bortle: 4,
        texto: 'A más aumentos se resuelve entera' }
    ]
  };
}

/* ── La regla de la noche ─────────────────────────────────────────────────── */

console.log('la madrugada pertenece a la noche que la engendró:');
eq(OAL.fechaDeReloj('2026-08-05', '22:30'), '2026-08-05', 'las 22:30 son del mismo día');
eq(OAL.fechaDeReloj('2026-08-05', '02:15'), '2026-08-06', 'las 02:15 ya son del día siguiente');
eq(OAL.fechaDeReloj('2026-08-05', '12:00'), '2026-08-05', 'el corte del mediodía, exacto');
eq(OAL.fechaDeReloj('2026-08-31', '01:00'), '2026-09-01', 'cambia de mes');
eq(OAL.fechaDeReloj('2026-12-31', '01:00'), '2027-01-01', 'y de año');
eq(OAL.fechaDeReloj('', '02:00'), null, 'sin fecha no hay instante');

console.log('y la noche se recupera de la fecha de reloj (inversa exacta):');
eq(OAL.nocheDe('2026-08-06', '02:15'), '2026-08-05', 'la madrugada vuelve a su noche');
eq(OAL.nocheDe('2026-08-05', '22:30'), '2026-08-05', 'el anochecer se queda donde está');
eq(OAL.nocheDe('2026-09-01', '01:00'), '2026-08-31', 'cruzando el mes hacia atrás');

console.log('el instante lleva el desfase del lugar, no UTC:');
eq(OAL.instante('2026-08-05', '23:40', 120), '2026-08-05T23:40:00+02:00', 'España en verano');
eq(OAL.instante('2026-08-05', '02:15', 120), '2026-08-06T02:15:00+02:00', 'la madrugada avanza el día');
eq(OAL.instante('2025-09-15', '23:30', -240), '2025-09-15T23:30:00-04:00', 'Chile, desfase negativo');
eq(OAL.desfase(0), '+00:00', 'sin desfase');
eq(OAL.desfase(330), '+05:30', 'desfases que no son horas enteras');

/* ── El XML ───────────────────────────────────────────────────────────────── */

console.log('el XML declara la extensión y la versión de plantilla:');
var xml = OAL.xmlDe(estado());
ok(xml.indexOf('xmlns:bit="https://bitacoraestelar.es/oal-ext/1"') > -1, 'espacio de nombres propio');
ok(xml.indexOf('bit:plantilla="' + OAL.VERSION_PLANTILLA + '"') > -1, 'versión sellada');

console.log('el cielo cuelga de CADA observación, no de la noche (ADR 0001):');
// El SQM es direccional: se mide hacia donde está el objeto. Dos objetos de la
// misma noche tienen legítimamente cielos distintos, así que el XML no puede
// escribir un solo valor por noche y que cada lector se lo reparta.
ok(xml.indexOf('<bit:sqm>') === -1, 'la sesión ya no lleva el cielo');
ok(xml.indexOf('<bit:seeing>') === -1, 'ni el seeing, que además reinventaba un elemento estándar');
eq((xml.match(/<sky-quality unit="mags-per-squarearcsec">21\.42<\/sky-quality>/g) || []).length, 1,
   'el SQM va en el elemento estándar, en la observación que lo midió');
ok(xml.indexOf('<sky-quality unit="mags-per-squarearcsec">20.9</sky-quality>') > -1,
   'y la que midió otro cielo escribe el suyo');
eq((xml.match(/<seeing>3<\/seeing>/g) || []).length, 1, 'el seeing, en el elemento estándar (Antoniadi 1-5)');
ok(xml.indexOf('<seeing>4</seeing>') > -1, 'también el propio de la otra observación');
eq((xml.match(/<bit:ir>-18<\/bit:ir>/g) || []).length, 2, 'el IR sigue en bit:, que el estándar no lo tiene');
eq((xml.match(/<bit:bortle>4<\/bit:bortle>/g) || []).length, 2, 'y el Bortle igual');

console.log('cada observación dice a qué noche pertenece:');
eq((xml.match(/<session>no1<\/session>/g) || []).length, 2, 'las dos la referencian');
ok(xml.indexOf('<begin>2026-08-06T02:15:00+02:00</begin>') > -1, 'la de madrugada, con su fecha de reloj');

console.log('el mismo objeto dos veces es UN target y DOS observaciones:');
eq((xml.match(/<target id=/g) || []).length, 1, 'un solo target');
eq((xml.match(/<observation id=/g) || []).length, 2, 'dos observaciones');
ok(xml.indexOf('xsi:type="oal:deepSkyGC"') > -1, 'el tipo de Sesame se traduce al de OAL');

console.log('los aumentos se calculan si no los escriben:');
ok(xml.indexOf('<magnification>67.9</magnification>') > -1, '1494.5 / 22 = 67.9');
eq(OAL.aumentos({ focal: 1494.5 }, { focal: 7 }, { factor: 2 }), 427, 'con Barlow, el factor multiplica');
eq(OAL.aumentos({ focal: 1494.5 }, null, null), '', 'sin ocular no hay aumento que inventar');

console.log('el texto del observador no rompe el XML:');
ok(xml.indexOf('Noche de las buenas &amp; sin luna') > -1, 'el ampersand va escapado');
eq(OAL.escapar('<b>M13 & "Ana"</b>'), '&lt;b&gt;M13 &amp; &quot;Ana&quot;&lt;/b&gt;', 'todo lo que hay que escapar');

console.log('la tripulación viaja como coObserver:');
eq((xml.match(/<coObserver>/g) || []).length, 2, 'dos compañeros');
eq((xml.match(/<observer id=/g) || []).length, 3, 'el autor y sus dos compañeros');

/* ── Ida y vuelta ─────────────────────────────────────────────────────────── */

console.log('descargar -> abrir -> descargar no cambia nada:');
var vuelta = OAL.leer(xml);
eq(vuelta.noches[0].id, 'no1', 'el id de la noche se conserva');
eq(vuelta.observaciones.map(function (o) { return o.id; }), ['ob1', 'ob2'], 'y los de las observaciones');
eq(vuelta.noches[0].fecha, '2026-08-05', 'la fecha vuelve a ser la del anochecer');
eq(vuelta.noches[0].comienzo, '22:30', 'la hora de comienzo, en local');
eq(vuelta.observaciones[1].hora, '02:15', 'la hora de la madrugada, en local');
eq(vuelta.observaciones[0].sqm, 21.42, 'el SQM de la primera observación sobrevive al viaje');
eq(vuelta.observaciones[1].sqm, 20.9, 'y el suyo, distinto, la segunda');
eq(vuelta.observaciones[1].seeing, 4, 'con su seeing');
eq(vuelta.observaciones[1].bortle, 4, 'y su Bortle de bit:');
eq(vuelta.noches[0].sqm, 21.42, 'la casilla de la noche se rellena con el primero, para volver a sembrar');
eq(vuelta.noches[0].tripulacion, 'Isra, Víctor', 'la tripulación vuelve por su nombre');
eq(vuelta.noches[0].cronica, 'Noche de las buenas & sin luna', 'la crónica se desescapa');
eq(vuelta.observaciones[0].objeto, 'M13', 'el objeto vuelve del catálogo de targets');
eq(vuelta.observaciones[0].ra, 250.42, 'con sus coordenadas');
eq(vuelta.observaciones[0].texto, 'Un puño de estrellas', 'y su descripción');
eq(vuelta.observador.correo, 'angel@ejemplo.es', 'el observador sigue siendo el mismo');
eq(OAL.xmlDe(vuelta), xml, 'el XML generado dos veces es idéntico');

/* ── La siembra del cielo ──────────────────────────────────────────────────
   El compañero teclea el cielo UNA vez por noche y de ahí baja a sus
   observaciones. Es un gesto de la interfaz, no una regla del formato: si
   pisara lo tecleado a mano, corregir el SQM de la noche borraría en silencio
   las medidas de cada objeto, que son las que valen. */

console.log('el cielo de la noche siembra las observaciones que no tienen el suyo:');
var sembrado = estado();
sembrado.observaciones[0].sqm = ''; sembrado.observaciones[0].seeing = '';
sembrado.noches[0].sqm = 21.42; sembrado.noches[0].seeing = 3;
OAL.sembrarCielo(sembrado, 'no1');
eq(sembrado.observaciones[0].sqm, 21.42, 'la que estaba vacía recibe el de la noche');
eq(sembrado.observaciones[0].seeing, 3, 'y también su seeing');
eq(sembrado.observaciones[1].sqm, 20.9, 'la que tenía el suyo no se toca');
eq(sembrado.observaciones[1].seeing, 4, 'ni su seeing');

console.log('cambiar el cielo de la noche no pisa lo ya tecleado:');
var cambiada = estado();
cambiada.observaciones[0].sqm = '';
cambiada.noches[0].sqm = 20.5;                 // el compañero corrige la noche
OAL.sembrarCielo(cambiada, 'no1');
eq(cambiada.observaciones[0].sqm, 20.5, 'la que heredaba sigue heredando');
eq(cambiada.observaciones[1].sqm, 20.9, 'la tecleada a mano se queda como estaba');

var otraNoche = estado();
otraNoche.noches.push({ id: 'no2', fecha: '2026-08-06', lugarId: 'lu1', sqm: 19, ir: '', seeing: '', bortle: '' });
OAL.sembrarCielo(otraNoche, 'no2');
eq(otraNoche.observaciones[0].sqm, 21.42, 'y sembrar una noche no toca las observaciones de otra');

console.log('un XML viejo trae el cielo en la sesión y se reparte al abrirlo:');
// Lo que ya rellenaron los compañeros: <bit:sqm> y compañía dentro de <session>.
// Lee viejo, escribe nuevo: sin migración y sin avisar a nadie.
var viejo = OAL.xmlDe(estado())
  .replace(/^.*<sky-quality[\s\S]*?<\/sky-quality>\n/gm, '')
  .replace(/^.*<seeing>[\s\S]*?<\/seeing>\n/gm, '')
  .replace(/^.*<bit:ir>[\s\S]*?<\/bit:ir>\n/gm, '')
  .replace(/^.*<bit:bortle>[\s\S]*?<\/bit:bortle>\n/gm, '')
  .replace('    </session>', '      <bit:sqm>21.42</bit:sqm>\n      <bit:ir>-18</bit:ir>\n' +
                             '      <bit:seeing>3</bit:seeing>\n      <bit:bortle>4</bit:bortle>\n    </session>');
var deVuelta = OAL.leer(viejo);
eq(deVuelta.noches[0].sqm, 21.42, 'el cielo viejo de la noche se lee igual');
eq(deVuelta.observaciones.map(function (o) { return o.sqm; }), [21.42, 21.42],
   'y baja a todas las observaciones de esa noche');
eq(deVuelta.observaciones[1].seeing, 3, 'el seeing viejo también');
ok(OAL.xmlDe(deVuelta).indexOf('<bit:sqm>') === -1, 'al volver a descargar sale ya en la forma nueva');
ok(OAL.xmlDe(deVuelta).indexOf('<sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>') > -1,
   'con el SQM en cada observación');

/* ── Qué falta ────────────────────────────────────────────────────────────── */

console.log('lo obligatorio impide descargar; lo demás solo avisa:');
eq(OAL.problemas(estado()).filter(function (p) { return p.nivel === 'falta'; }), [], 'un estado completo no bloquea');

var sinLugar = estado();
sinLugar.noches[0].lugarId = '';
ok(OAL.problemas(sinLugar).some(function (p) { return p.nivel === 'falta' && /sin lugar/.test(p.que); }),
   'una noche sin lugar bloquea: sin base no hay salud');

var sinTexto = estado();
sinTexto.observaciones[0].texto = '   ';
ok(OAL.problemas(sinTexto).some(function (p) { return p.nivel === 'falta' && /sin descripción/.test(p.que); }),
   'una observación sin descripción bloquea');

var sinNoche = estado();
sinNoche.observaciones[0].nocheId = 'no-existe';
ok(OAL.problemas(sinNoche).some(function (p) { return p.nivel === 'falta' && /ninguna noche/.test(p.que); }),
   'una observación huérfana bloquea');

var sinHora = estado();
sinHora.observaciones[0].hora = '';
sinHora.observaciones[0].telescopioId = '';
var avisos = OAL.problemas(sinHora);
eq(avisos.filter(function (p) { return p.nivel === 'falta'; }), [], 'sin hora ni telescopio se puede descargar');
ok(avisos.some(function (p) { return p.nivel === 'flojo' && /sin hora/.test(p.que); }), 'pero avisa de la hora');

ok(OAL.problemas(OAL.estadoVacio()).some(function (p) { return /ninguna observación/.test(p.que); }),
   'una plantilla vacía no se descarga');

console.log('en la forma nueva, el cielo de una observación no baja a las demás:');
// El SQM es direccional: se mide hacia la zona del objeto (ADR 0001). Copiar el
// de la vecina sería inventar una medida que nadie hizo.
var soloUna = estado();
soloUna.observaciones[1].sqm = ''; soloUna.observaciones[1].seeing = '';
var releida = OAL.leer(OAL.xmlDe(soloUna));
eq(releida.observaciones[1].sqm, '', 'la que no traía SQM sigue sin traerlo');
eq(releida.observaciones[1].seeing, '', 'ni seeing');
eq(releida.noches[0].sqm, 21.42, 'pero la noche resume con el primero que hay');

console.log('corregir la noche arrastra lo heredado, no lo tecleado:');
var corregida = estado();
corregida.noches[0].sqm = 21.42;          // la primera lo hereda: mismo número
OAL.sembrarCielo(corregida, 'no1', { sqm: 21.42 });
eq(corregida.observaciones[0].sqm, 21.42, 'sin cambio, nada se mueve');
corregida.noches[0].sqm = 20.5;
OAL.sembrarCielo(corregida, 'no1', { sqm: 21.42 });
eq(corregida.observaciones[0].sqm, 20.5, 'la que mostraba el de la noche se pone al día');
eq(corregida.observaciones[1].sqm, 20.9, 'la tecleada a mano no se mueve');

console.log('mudar de noche cambia el cielo heredado por el de la nueva:');
var mudanza = estado();
mudanza.noches.push({ id: 'no2', fecha: '2026-08-06', lugarId: 'lu1', sqm: 19.8,
                      ir: -14, seeing: 2, bortle: 6 });
mudanza.observaciones[0].sqm = 21.42;     // heredado de no1
mudanza.observaciones[0].nocheId = 'no2';
OAL.sembrarCielo(mudanza, 'no2', mudanza.noches[0]);
eq(mudanza.observaciones[0].sqm, 19.8, 'toma el cielo de la noche a la que se muda');

console.log('el seeing sale como la escala Antoniadi que OAL espera:');
var seeingRaro = estado();
seeingRaro.observaciones[0].seeing = 3.4;
seeingRaro.observaciones[1].seeing = 9;
var xmlSeeing = OAL.xmlDe(seeingRaro);
ok(xmlSeeing.indexOf('<seeing>3</seeing>') > -1, '3,4 se redondea a 3');
ok(xmlSeeing.indexOf('<seeing>5</seeing>') > -1, 'y 9 se recorta al 5 de la escala');
ok(!/<seeing>(3\.4|9)<\/seeing>/.test(xmlSeeing), 'nunca sale un seeing fuera de escala');

console.log('un SQM en mag/arcmin² se convierte al entrar:');
var enArcmin = OAL.xmlDe(estado())
  .replace('<sky-quality unit="mags-per-squarearcsec">21.42</sky-quality>',
           '<sky-quality unit="mags-per-squarearcmin">12.53</sky-quality>');
eq(OAL.leer(enArcmin).observaciones[0].sqm, 21.42, '12,53 mag/arcmin² son 21,42 mag/arcsec²');

/* ── Sin coordenadas ──────────────────────────────────────────────────────── */

console.log('sin Sesame el objeto viaja solo con su nombre:');
var sinRed = estado();
sinRed.observaciones.forEach(function (o) { o.ra = ''; o.dec = ''; o.otype = ''; });
var xml2 = OAL.xmlDe(sinRed);
ok(xml2.indexOf('<position>') === -1, 'sin posición, no se inventa una');
ok(xml2.indexOf('<datasource>Observador</datasource>') > -1, 'y se dice de dónde salió el nombre');
ok(xml2.indexOf('xsi:type="oal:deepSkyNA"') > -1, 'tipo desconocido: zona del cielo, sin mentir');
eq(OAL.leer(xml2).observaciones[0].objeto, 'M13', 'el nombre vuelve igual');

if (fallos) { console.log('\n' + fallos + ' fallo(s).'); process.exit(1); }
console.log('\nok · la plantilla escribe y lee su propio XML sin perder nada');
