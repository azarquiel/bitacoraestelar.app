#!/usr/bin/env node
/* Test del SELECTOR DE VIAJE del formulario de registro
   (`BitacoraBase.avisoViaje`, resources/js/bitacora-base.js).

   Toda observación pertenece a una sesión —un viaje interestelar—, y ahora la
   sesión es obligatoria: es ella la que dice desde dónde se observaba. Quién
   decide a qué noche pertenece una hora es el servidor (la regla del mediodía
   vive en un solo sitio, bitacora-viaje.php), así que lo que se prueba aquí es
   el ciclo que rodea a esa pregunta: cuándo se pregunta, cuándo NO, y qué se
   enseña mientras la respuesta vuela.

   La BASE ya no entra: el formulario de registro dejó de preguntarla, así que
   la noche se identifica solo con fecha y hora, y de ella pueden colgar VARIOS
   viajes (dos salidas desde sitios distintos la misma noche).

   Sin dependencias ni red: consultar/alta son de mentira y se resuelven a mano.
   node scripts/test_aviso_viaje.js  */
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

var SIERRA = { id: 12, nombre: '', noche: '2026-08-04', base_nombre: 'Sierra de Béjar' };
var BALCON = { id: 13, nombre: 'Desde casa', noche: '2026-08-04', base_nombre: 'Balcón' };

/* Un aviso con las dos llamadas al servidor bajo control: cada consulta queda
   pendiente hasta que el test la resuelve, que es como se reproducen las
   respuestas que llegan tarde. */
function nuevo() {
  var v = { consultas: [], altas: [], estados: [], viajes: [] };
  v.aviso = B.avisoViaje({
    consultar: function (datos) {
      return new Promise(function (res, rej) { v.consultas.push({ datos: datos, res: res, rej: rej }); });
    },
    alta: function (datos) {
      return new Promise(function (res, rej) { v.altas.push({ datos: datos, res: res, rej: rej }); });
    },
    onEstado: function (estado, viajes) { v.estados.push(estado); v.viajes.push(viajes || null); }
  });
  return v;
}
function ultimo(a) { return a.length ? a[a.length - 1] : null; }
// Deja correr las promesas ya resueltas antes de mirar el resultado.
function vuelta() { return new Promise(function (res) { setTimeout(res, 0); }); }

Promise.resolve()

  /* ── 1. Sin fecha no hay noche a la que preguntar ───────────────────────────
     La fecha es lo único que sitúa la observación en una noche. Sin ella no hay
     pregunta que hacer, y exigir la sesión antes de tenerla sería pedir algo
     imposible. */
  .then(function () {
    seccion('Sin fecha, ni se pregunta:');
    var v = nuevo();
    v.aviso.actualizar('', '22:40');
    ok(v.consultas.length === 0, 'sin fecha no se consulta');
    ok(ultimo(v.estados) === 'sin-datos', 'estado sin-datos');
  })

  /* ── 2. La noche no tiene ninguna sesión ────────────────────────────────────
     El caso que motiva todo: es la primera observación de la noche, nadie ha
     dado de alta la sesión, y sin sesión no se registra. El formulario debe
     poder ofrecer el alta aquí mismo. */
  .then(function () {
    seccion('La noche todavía no tiene viaje:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-05', '02:15');
    ok(v.consultas.length === 1, 'se consulta una vez');
    ok(ultimo(v.estados) === 'consultando', 'mientras vuela, estado consultando');
    ok(v.consultas[0].datos.fecha === '2026-08-05' && v.consultas[0].datos.hora === '02:15',
      'se manda fecha y hora tal cual');
    ok(!('baseId' in v.consultas[0].datos), 'la base ya no forma parte de la pregunta');
    v.consultas[0].res([]);
    return vuelta().then(function () {
      ok(ultimo(v.estados) === 'sin-viaje', 'sin viaje: hay que ofrecer darlo de alta');
      ok(ultimo(v.viajes).length === 0, 'y no se enseña ninguno');
    });
  })

  /* ── 3. La noche ya tiene sesión ────────────────────────────────────────────
     Una sola: el formulario la da por elegida sin preguntar nada. */
  .then(function () {
    seccion('La noche ya tiene viaje:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-04', '22:40');
    v.consultas[0].res([SIERRA]);
    return vuelta().then(function () {
      ok(ultimo(v.estados) === 'con-viaje', 'estado con-viaje');
      ok(ultimo(v.viajes)[0] === SIERRA, 'se entrega el viaje para pintarlo');
    });
  })

  /* ── 4. Dos salidas la misma noche ──────────────────────────────────────────
     Se puede cambiar de sitio a media noche, y entonces la noche tiene dos
     viajes. La clave única los permite, así que el aviso los entrega todos y es
     el observador quien elige: colgar la observación del primero que aparezca la
     dejaría en el lugar equivocado. */
  .then(function () {
    seccion('La misma noche con dos viajes:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-04', '22:40');
    v.consultas[0].res([SIERRA, BALCON]);
    return vuelta().then(function () {
      ok(ultimo(v.estados) === 'con-viaje', 'estado con-viaje');
      ok(ultimo(v.viajes).length === 2, 'se entregan los dos, sin elegir por el observador');
    });
  })

  /* ── 5. La respuesta que llega tarde no pisa a la nueva ─────────────────────
     Cambiar la fecha mientras la consulta vuela es lo normal: se rellena el
     formulario de arriba abajo. Si la respuesta vieja pintara al volver, el
     formulario ofrecería la sesión de OTRA noche, y la observación acabaría
     colgada de la salida equivocada. */
  .then(function () {
    seccion('Respuestas que llegan tarde:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-04', '22:40');
    v.aviso.actualizar('2026-08-05', '22:40');      // se arrepiente de la fecha
    ok(v.consultas.length === 2, 'la fecha nueva se consulta de nuevo');
    v.consultas[1].res([]);                          // la nueva vuelve primero
    return vuelta().then(function () {
      ok(ultimo(v.estados) === 'sin-viaje', 'manda la respuesta de la fecha nueva');
      v.consultas[0].res([SIERRA]);                  // y ahora la vieja
      return vuelta().then(function () {
        ok(ultimo(v.estados) === 'sin-viaje', 'la respuesta vieja no pisa a la nueva');
        ok(ultimo(v.viajes).length === 0, 'no se cuela el viaje de la noche anterior');
      });
    });
  })

  /* ── 6. Lo mismo no se consulta dos veces ───────────────────────────────────
     El formulario recalcula en cada tecla; preguntar por lo mismo una y otra
     vez sería castigar al servidor sin cambiar nada de lo que se ve.

     El deduplicado es por fecha + hora EXACTAS, no por noche: saber si dos
     horas caen en la misma noche exige la regla del mediodía, y esa regla vive
     solo en el servidor. Cambiar la hora vuelve a consultar aunque la noche no
     cambie —una petición de más es más barata que una segunda copia de la
     regla. */
  .then(function () {
    seccion('Deduplicado de la consulta:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-04', '22:40');
    v.consultas[0].res([]);
    return vuelta().then(function () {
      v.aviso.actualizar('2026-08-04', '22:40');
      ok(v.consultas.length === 1, 'los mismos datos no se vuelven a consultar');
      ok(ultimo(v.estados) === 'sin-viaje', 'y el aviso se queda como estaba');
      v.aviso.actualizar('2026-08-04', '23:10');
      ok(v.consultas.length === 2, 'otra hora sí se consulta (la noche la decide el servidor)');
      v.aviso.actualizar('2026-08-05', '23:10');
      ok(v.consultas.length === 3, 'otra fecha también');
    });
  })

  /* ── 7. Dar de alta la sesión desde el propio formulario ────────────────────
     Es lo que el aviso ofrece: registrar la salida sin salir de aquí, con los
     mismos datos por los que se preguntó. Nace SIN lugar —el lugar se pone en la
     ficha del viaje—, y al volver ya es el viaje de la noche. */
  .then(function () {
    seccion('Alta del viaje desde el aviso:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-05', '02:15');
    v.consultas[0].res([]);
    return vuelta().then(function () {
      v.aviso.registrar();
      ok(v.altas.length === 1, 'se da de alta una vez');
      ok(v.altas[0].datos.fecha === '2026-08-05' && v.altas[0].datos.hora === '02:15',
        'con los mismos datos de la consulta');
      v.altas[0].res(SIERRA);
      return vuelta().then(function () {
        ok(ultimo(v.estados) === 'con-viaje', 'tras el alta, la noche ya tiene viaje');
        ok(ultimo(v.viajes)[0] === SIERRA, 'y es el recién creado');
      });
    });
  })

  /* ── 8. El alta se suma a lo que ya había ───────────────────────────────────
     Si la noche ya tenía una salida y se registra otra, la lista pasa a tener
     las dos: la primera no desaparece del selector por dar de alta la segunda. */
  .then(function () {
    seccion('Alta con viajes ya existentes:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-04', '22:40');
    v.consultas[0].res([SIERRA]);
    return vuelta().then(function () {
      v.aviso.registrar();
      v.altas[0].res(BALCON);
      return vuelta().then(function () {
        ok(ultimo(v.viajes).length === 2, 'el nuevo se suma, no sustituye');
        ok(ultimo(v.viajes)[1] === BALCON, 'y el recién creado va el último');
      });
    });
  })

  /* ── 9. Si el servidor no contesta, se vuelve a intentar ────────────────────
     Sin sesión no se registra, así que no saber si la hay es un callejón sin
     salida: se avisa, y como no se llegó a saber nada, el siguiente intento
     vuelve a preguntar. */
  .then(function () {
    seccion('El servidor no contesta:');
    var v = nuevo();
    v.aviso.actualizar('2026-08-04', '22:40');
    v.consultas[0].rej(new Error('sin red'));
    return vuelta().then(function () {
      ok(ultimo(v.estados) === 'error', 'estado error');
      v.aviso.actualizar('2026-08-04', '22:40');
      ok(v.consultas.length === 2, 'lo que falló se reintenta');
    });
  })

  /* ── 10. Lo que se enseña, con el mismo diseño que SIMBAD ───────────────────
     El viaje se resuelve solo, así que se anuncia como se anuncia el objeto que
     SIMBAD resuelve: una línea `status` con su clase (ok/info/err) y un ✓ o un ✗
     delante. Nunca se elige —la salida la deciden la fecha y la hora— y nada de
     bloque aparte, que era otro lenguaje visual para la misma idea.

     `mensajeViaje(estado, etiquetas)` devuelve solo texto plano: quien lo pinta
     lo mete con textContent, así que una salida llamada `<b>` no puede inyectar
     nada. */
  .then(function () {
    seccion('El aviso habla el idioma de SIMBAD:');
    var m = B.mensajeViaje('con-viaje', ['Sierra de Béjar · 3 objetos']);
    ok(m.clase === 'ok', 'una sola salida es un acierto (clase ok)');
    ok(m.texto.indexOf('✓') === 0, 'y se marca con ✓, como el objeto resuelto');
    ok(m.texto.indexOf('Sierra de Béjar · 3 objetos') > 0, 'el texto nombra la salida');
    ok(!('elegir' in m), 'no hay selector que enseñar: la salida no se elige nunca');
    ok(m.alta === false, 'ni se ofrece dar de alta otra');
    ok(m.oculto === false, 'y se ve');

    // Dos salidas que contienen la misma hora NO son una elección: son un error
    // de las fichas, porque nadie observa desde dos sitios a la vez.
    var dos = B.mensajeViaje('con-viaje', ['Sierra · 2 objetos', 'Balcón · 1 objeto']);
    ok(dos.clase === 'err', 'dos salidas a la misma hora es un error, no una opción');
    ok(dos.texto.indexOf('✗') === 0, 'y se marca con ✗');
    ok(dos.texto.indexOf('Mis viajes') > 0, 'y se arregla en la ficha del viaje, no eligiendo aquí');

    var sin = B.mensajeViaje('sin-viaje', []);
    ok(sin.clase === 'err', 'sin sesión no se puede guardar: error');
    ok(sin.alta === true, 'y se ofrece registrarla ahí mismo');

    var buscando = B.mensajeViaje('consultando', []);
    ok(buscando.clase === 'info', 'mientras se busca, en tono neutro');
    ok(buscando.alta === false, 'sin ofrecer el alta antes de saber si hace falta');

    var nada = B.mensajeViaje('sin-datos', []);
    ok(nada.oculto === true, 'sin fecha no se enseña nada');

    var mal = B.mensajeViaje('error', []);
    ok(mal.clase === 'err' && mal.alta === false, 'un fallo del servidor no invita a crear nada');
  })

  /* ── 11. El aviso llega a montarse ──────────────────────────────────────────
     Todo lo de arriba da igual si el formulario nunca construye el aviso, y eso
     es justo lo que pasaba: `var WP = window.BITACORA_WP || null` estaba escrito
     MÁS ABAJO que el bloque del viaje. Como `var` se iza sin su valor, al llegar
     a la línea del aviso WP valía `undefined`, así que `avisoViaje` nacía `null`
     y `VIAJES_API` cadena vacía: no se preguntaba por la sesión jamás, en
     silencio y sin error en consola.

     No hay DOM aquí, así que se comprueba sobre el propio fuente: la declaración
     de WP tiene que ir ANTES de todo lo que la lee al cargar el módulo. */
  .then(function () {
    seccion('El formulario monta el aviso de verdad:');
    var src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'registro/resources/js/bitacora-formulario.js'), 'utf8');
    var declara = src.indexOf('var WP = window.BITACORA_WP');
    ok(declara !== -1, 'el formulario lee los datos que inyecta WordPress');
    ok(declara < src.indexOf('BitacoraBase.avisoViaje('),
       'y los lee ANTES de montar el aviso, o el aviso nace null');
    ok(declara < src.indexOf('var VIAJES_API'),
       'y antes de armar la URL de los viajes, o se queda vacía');
  })

  .then(function () {
    console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nok · el viaje de la noche se resuelve solo');
    process.exit(fallos ? 1 : 0);
  })
  .catch(function (e) { console.error(e); process.exit(1); });
