#!/usr/bin/env node
/* Test de SIGUIENTE OBJETO
   (`BitacoraBase.siguienteObjeto`, resources/js/bitacora-base.js).

   Una noche de campo amplio se pasa saltando de objeto en objeto, y muchas
   veces sin mover el tubo: M42 y M43 caen en el mismo campo del mismo ocular,
   vistas en el mismo instante y descritas en el mismo párrafo. Encadenar el
   objeto siguiente tiene por eso DOS vías, y lo único que las diferencia es qué
   se conserva:

     - «mismo campo»: se conserva todo lo que se vio —óptica, descripción,
       imágenes— y la hora NO avanza, porque el campo se vio de una vez.
     - «más tarde»:   se conserva solo la óptica (no se ha tocado el tubo) y la
       hora avanza 20 minutos, que es otra observación.

   Las dos vacían siempre el objeto y sus coordenadas: arrastrar el nombre o el
   RA/Dec de M42 al registro de M43 es justo el error que esto evita.

   Esta función es la fuente única de esa regla para que las dos vías no la
   copien en dos ramas del manejador del botón. Es pura y no toca el DOM: lo que
   devuelve son entradas con las claves que come `crearEntrada(datos)` del
   formulario (`campo_real`, `ocular_id`, `imagen_id`…), que NO son las que
   produce `recogerEntradas()` (`campoReal`, `ocularId`, `imagenId`…). Traducir
   entre esas dos formas es media función.

   Sin dependencias:  node scripts/test_siguiente_objeto.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

/* El estado de partida: M42 ya registrada, con un ocular, un dibujo y una
   sección de Exploración escrita. */
function estadoM42() {
  return {
    fecha: '2026-08-05',
    hora: '23:50',
    objeto: 'M42',
    ra: '05 35 17',
    dec: '-05 23 28',
    resuelto: { tipo: 'messier', num: 42 },
    entradas: [{
      aumento: 48,
      campoReal: 1.2,
      pupilaSalida: 6.6,
      titulo: 'Nagler 31mm',
      descripcion: '<p>M42 domina el campo, con M43 pegada al norte.</p>',
      ocularId: 3,
      auxiliarId: null,
      auxiliar2Id: null,
      imagenes: [{
        tipo: 'principal',
        imagenId: 512,
        imagenUrl: 'https://bitacoraestelar.app/wp-content/uploads/m42.jpg',
        etiqueta: 'Boceto a 48x',
        pos: '',
        origen: 'subida'
      }]
    }],
    exploracion: '<p>Buscar el Trapecio con más aumento la próxima vez.</p>'
  };
}

/* ── 1. Vía «mismo campo»: se conserva lo que se escribió ────────────────────
   El caso que justifica la épica entera. La descripción es obligatoria por
   entrada, así que sin conservarla encadenar un objeto del mismo campo obliga a
   reescribir un texto que precisamente habla de los dos objetos a la vez. */
seccion('Mismo campo: se conserva lo que ya se vio');
var mismo = B.siguienteObjeto(estadoM42(), { mismoCampo: true });
var e1 = mismo.entradas[0];

ok(mismo.entradas.length === 1, 'sigue habiendo una entrada');
ok(e1.aumento === 48, 'conserva el aumento');
ok(e1.campo_real === 1.2, 'conserva el campo real, con la clave de crearEntrada');
ok(e1.pupila_salida === 6.6, 'conserva la pupila de salida');
ok(e1.ocular_id === 3, 'conserva el ocular');
ok(e1.titulo === 'Nagler 31mm', 'conserva el nombre del ocular');
ok(/M43 pegada al norte/.test(e1.descripcion), 'conserva la descripción: es la del campo entero');

seccion('Mismo campo: la hora no avanza');
ok(mismo.fecha === '2026-08-05' && mismo.hora === '23:50',
   'el campo se vio en un instante, no veinte minutos después');

seccion('Mismo campo: la imagen se reapunta, no se resube');
var img = e1.imagenes[0];
ok(e1.imagenes.length === 1, 'la imagen viaja con la entrada');
ok(img.imagen_id === 512, 'mismo adjunto, por id y con la clave de crearImagen');
ok(/m42\.jpg$/.test(img.imagen_url), 'y con su url, así que no hay que volver a subirla');
ok(img.etiqueta === 'Boceto a 48x', 'conserva la etiqueta');
ok(img.origen === 'subida', 'conserva el origen');

/* ── 2. Vía «más tarde»: solo la óptica ──────────────────────────────────────
   Otro objeto, otro rato. Arrastrar la descripción falsificaría lo visto. */
seccion('Más tarde: se conserva la óptica y nada de lo visto');
var tarde = B.siguienteObjeto(estadoM42(), { mismoCampo: false });
var e2 = tarde.entradas[0];

ok(e2.aumento === 48, 'no se ha tocado el tubo: sigue el mismo aumento');
ok(e2.campo_real === 1.2, 'y el mismo campo real');
ok(e2.pupila_salida === 6.6, 'y la misma pupila');
ok(e2.ocular_id === 3, 'y el mismo ocular');
ok(e2.descripcion === '', 'la descripción se vacía: es otro objeto');
ok(e2.titulo === '', 'el título de la entrada se vacía');
ok(e2.imagenes.length === 0, 'y no arrastra el dibujo del objeto anterior');

seccion('Más tarde: la hora avanza 20 minutos');
ok(tarde.fecha === '2026-08-06' && tarde.hora === '00:10',
   '23:50 -> 00:10 del día siguiente: la medianoche se lleva la fecha');

/* ── 3. Lo que se vacía siempre ──────────────────────────────────────────────
   Da igual la vía: el objeto es otro. Dejar el nombre o las coordenadas del
   anterior guardaría M42 en la ficha de M43. */
seccion('Las dos vías vacían el objeto y sus coordenadas');
[['mismo campo', mismo], ['más tarde', tarde]].forEach(function (par) {
  var via = par[0], r = par[1];
  ok(r.objeto === '', via + ': sin nombre de objeto');
  ok(r.ra === '' && r.dec === '', via + ': sin RA/Dec');
  ok(!r.resuelto, via + ': sin estado de resolución');
});

/* ── 4. La sección «Exploración» ─────────────────────────────────────────────
   Su título lo construye el formulario con el objeto del momento ("M42.
   Exploración"). Al encadenar todavía no se sabe cuál es el objeto siguiente,
   así que lo que se hace es NO arrastrar el título viejo: el formulario lo
   rehará solo al guardar. Arrastrarlo dejaría "M42. Exploración" colgando de la
   ficha de M43. */
seccion('Exploración: viaja el texto, nunca el título viejo');
ok(/Trapecio/.test(mismo.exploracion), 'mismo campo: conserva el texto');
ok(typeof mismo.exploracion === 'string',
   'mismo campo: viaja el texto pelado, sin un título que se quedaría viejo');
ok(tarde.exploracion === '', 'más tarde: la exploración se vacía como el resto de lo visto');

/* ── 5. Pura ─────────────────────────────────────────────────────────────────
   Sin DOM y sin tocar lo que le dan: el manejador del botón la llama con el
   estado que acaba de leer del formulario y no espera que se lo cambien debajo. */
seccion('No toca el estado que le dan');
var original = estadoM42();
var copia = JSON.parse(JSON.stringify(original));
B.siguienteObjeto(original, { mismoCampo: true });
ok(JSON.stringify(original) === JSON.stringify(copia), 'el estado de entrada sale intacto');

var r1 = B.siguienteObjeto(estadoM42(), { mismoCampo: true });
r1.entradas[0].imagenes[0].etiqueta = 'tocada';
var r2 = B.siguienteObjeto(estadoM42(), { mismoCampo: true });
ok(r2.entradas[0].imagenes[0].etiqueta === 'Boceto a 48x',
   'las imágenes son copia: tocar el resultado no contamina la siguiente llamada');

seccion('Idempotente, salvo la hora de la vía «más tarde»');
var unaVez = B.siguienteObjeto(estadoM42(), { mismoCampo: true });
var otraVez = B.siguienteObjeto(estadoM42(), { mismoCampo: true });
ok(JSON.stringify(unaVez) === JSON.stringify(otraVez),
   'dos llamadas sobre el mismo estado dan el mismo resultado');

/* El avance de la hora sí se acumula, y a propósito: encadenar tres objetos por
   la vía «más tarde» los reparte por la noche. Cada llamada parte del estado que
   hay en pantalla, que ya trae la hora que dejó la anterior. */
var tras1 = B.siguienteObjeto(estadoM42(), { mismoCampo: false });
var enPantalla = estadoM42();
enPantalla.fecha = tras1.fecha; enPantalla.hora = tras1.hora;
var tras2 = B.siguienteObjeto(enPantalla, { mismoCampo: false });
ok(tras2.hora === '00:30', 'encadenar dos veces «más tarde» suma 40 minutos');

/* ── 6. Casos de borde del formulario real ───────────────────────────────────
   Se llama nada más guardar, con lo que hubiera en pantalla. Puede no haber
   exploración, puede haber varias entradas y puede no haber hora. */
seccion('Aguanta lo que traiga el formulario');
var pelado = B.siguienteObjeto({ fecha: '2026-08-05', hora: '', objeto: 'NGC 253' }, { mismoCampo: false });
ok(Array.isArray(pelado.entradas) && pelado.entradas.length === 0, 'sin entradas no inventa ninguna');
ok(pelado.hora === '', 'sin hora no se inventa una');
ok(pelado.objeto === '', 'y el objeto se vacía igual');

var dosOculares = estadoM42();
dosOculares.entradas.push({ aumento: 150, campoReal: 0.4, pupilaSalida: 2.1, titulo: 'Ethos 13mm',
                            descripcion: '<p>El Trapecio, cuatro estrellas.</p>', ocularId: 7, imagenes: [] });
var conDos = B.siguienteObjeto(dosOculares, { mismoCampo: true });
ok(conDos.entradas.length === 2, 'dos oculares del mismo campo siguen siendo dos entradas');
ok(conDos.entradas[1].ocular_id === 7, 'y el segundo conserva el suyo');

console.log('');
if (fallos) { console.error(fallos + ' comprobación(es) fallan.'); process.exit(1); }
console.log('Todo correcto.');
