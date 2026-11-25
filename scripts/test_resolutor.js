#!/usr/bin/env node
/* Test del RESOLVEDOR DE OBJETO POR NOMBRE
   (`BitacoraBase.resolutorNombre`, resources/js/bitacora-base.js).

   El parseo de la respuesta ya lo fija test_sesame.js. Lo que se comprueba aquí
   es el ciclo que rodea a la consulta, que es donde estaban las diferencias
   entre las dos copias que había (el simulador y el formulario de registro):
   la espera tras la última tecla, no repetir la misma consulta y no pisar las
   coordenadas que el observador haya escrito a mano.

   Sin dependencias ni red: se sustituye fetch por uno de mentira.
   node scripts/test_resolutor.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* Respuesta real del CDS para M42, recortada a lo que lee leerSesame. */
var M42 = '%C.0 HII\n%J 83.82010000 -5.38760000 = 05 35 16.8    -05 23 15\n';
var SIN_RESULTADO = '#!Sesame: nothing found\n';
/* Respuestas reales del espejo SIMBAD de Harvard (sim-id, ASCII), recortadas. */
var M13_SIMBAD = 'C.D.S.  -  SIMBAD4 rel 1.8  -  2026.11.24CET21:56:40\n\nM13\n---\n\n' +
  'Object M 13  ---  GlC  ---  OID=@2894585   (@@134462,0)  ---  coobox=18253\n\n' +
  'Coordinates(ICRS,ep=J2000,eq=2000): 16 41 41.634  +36 27 40.75 (IR  ) C [~ ~ ] 2006AJ....131.1163S\n';
var M42_SIMBAD = 'Object M 42  ---  HII  ---  OID=@810146\n' +
  'Coordinates(ICRS,ep=J2000,eq=2000): 05 35 16.8  -05 23 15 (Xray) D [5000 5000 90] 2022A&A...661A..38P\n';
var NADA_SIMBAD = "!! 'zzqx99': No known catalog could be found\n query string: zzqx99\n";
function cuelga(init) {
  return new Promise(function (_r, rej) { init.signal.addEventListener('abort', function () { rej(new Error('abort')); }); });
}
function responde(txt) { return Promise.resolve({ ok: true, text: function () { return Promise.resolve(txt); } }); }

var consultas = [];      // cada URL pedida
var respuesta = M42;
global.fetch = function (url) {
  consultas.push(url);
  return Promise.resolve({ ok: true, text: function () { return Promise.resolve(respuesta); } });
};

// Espera corta para no alargar el test; en producción son 700 ms.
var ESPERA = 20;
function tras(ms, fn) { return new Promise(function (res) { setTimeout(function () { fn(); res(); }, ms); }); }

function nuevo(opts) {
  opts = opts || {};
  var visto = { resueltos: [], estados: [] };
  visto.resolutor = B.resolutorNombre({
    espera: ESPERA,
    timeout: opts.timeout,
    puedeEscribir: opts.puedeEscribir,
    onResuelto: function (d) { visto.resueltos.push(d); },
    onEstado: function (estado, q) { visto.estados.push(estado + ':' + q); }
  });
  return visto;
}

function seccion(t) { console.log('\n' + t); }

Promise.resolve()

  /* ── 1. Se espera a que deje de teclear ────────────────────────────────────
     Escribir «M42» letra a letra debe producir UNA consulta, no tres. */
  .then(function () {
    seccion('Una sola consulta por ráfaga de tecleo:');
    consultas = []; respuesta = M42;
    var v = nuevo();
    'M42'.split('').reduce(function (acc, _c, i) {
      v.resolutor.programar('M42'.slice(0, i + 1));
      return acc;
    }, null);
    ok(consultas.length === 0, 'no se consulta mientras se teclea');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 1, 'una consulta tras la espera (' + consultas.length + ')');
      ok(/M42/.test(consultas[0]), 'se consulta el texto completo, no un prefijo');
      ok(v.resueltos.length === 1, 'un resultado');
      ok(Math.abs(v.resueltos[0].ra - 83.8201) < 1e-6 && Math.abs(v.resueltos[0].dec + 5.3876) < 1e-6,
        'RA/Dec en grados desde la respuesta del CDS');
      ok(v.resueltos[0].q === 'M42', 'devuelve el nombre consultado');
      ok(v.resueltos[0].otype === 'HII', 'devuelve el tipo de objeto');
    });
  })

  /* ── 2. Menos de dos letras no es un nombre ────────────────────────────────*/
  .then(function () {
    seccion('Nombres demasiado cortos:');
    consultas = [];
    var v = nuevo();
    v.resolutor.programar('M');
    v.resolutor.programar(' ');
    v.resolutor.programar('');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 0, 'ni se consulta');
      ok(v.estados.length === 0, 'ni se avisa de nada');
    });
  })

  /* ── 3. La misma consulta no se repite ─────────────────────────────────────
     Pedir otra vez el mismo nombre, sin cambiarlo entre medias, no debe
     disparar otra consulta al CDS. (Si cambia y vuelve, sí: ver la sección 6.) */
  .then(function () {
    seccion('Deduplicado de la última consulta:');
    consultas = [];
    var v = nuevo();
    v.resolutor.programar('NGC 6826');
    return tras(ESPERA * 3, function () {}).then(function () {
      v.resolutor.programar('NGC 6826');
      return tras(ESPERA * 3, function () {
        ok(consultas.length === 1, 'el mismo nombre no se vuelve a consultar (' + consultas.length + ')');
      });
    });
  })

  /* ── 4. No se pisa lo que el observador escribió a mano ────────────────────
     Es la guarda que solo tenía el formulario de registro; ahora la tienen los
     dos. Dos momentos distintos: antes de programar y al volver la respuesta. */
  .then(function () {
    seccion('Coordenadas escritas a mano:');
    consultas = [];
    var libre = false;
    var v = nuevo({ puedeEscribir: function () { return libre; } });
    v.resolutor.programar('M13');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 0, 'con las cajetillas ocupadas ni se consulta');
    });
  })
  .then(function () {
    // Ahora la carrera de verdad: las cajetillas están libres al programar y el
    // observador escribe sus coordenadas MIENTRAS el CDS responde.
    consultas = []; respuesta = M42;
    var libre = true;
    var v = nuevo({ puedeEscribir: function () { return libre; } });
    var fetchNormal = global.fetch;
    global.fetch = function (url) { libre = false; return fetchNormal(url); };
    v.resolutor.programar('M13');
    return tras(ESPERA * 3, function () {
      global.fetch = fetchNormal;
      ok(consultas.length === 1, 'la consulta ya iba en camino');
      ok(v.resueltos.length === 0, 'pero el resultado se descarta: manda lo tecleado');
    });
  })

  /* ── 5. Estados: buscando → nada / error ───────────────────────────────────*/
  .then(function () {
    seccion('Avisos de estado:');
    respuesta = SIN_RESULTADO;
    var v = nuevo();
    v.resolutor.programar('Objeto Inexistente 42');
    return tras(ESPERA * 3, function () {
      ok(v.estados[0] === 'buscando:Objeto Inexistente 42', 'primero avisa de que busca');
      ok(v.estados[1] === 'nada:Objeto Inexistente 42', 'y luego de que no está en SIMBAD');
      ok(v.resueltos.length === 0, 'sin resultado no se escribe nada');
    });
  })
  .then(function () {
    var v = nuevo();
    global.fetch = function () { return Promise.reject(new Error('sin red')); };
    v.resolutor.programar('M42');
    return tras(ESPERA * 3, function () {
      ok(v.estados[v.estados.length - 1] === 'error:M42', 'la red caída avisa como error');
      ok(v.resueltos.length === 0, 'y no escribe coordenadas');
    });
  })
  .then(function () {
    // Un 5xx del CDS trae una página HTML: no es «no encontrado».
    var v = nuevo();
    global.fetch = function () {
      return Promise.resolve({ ok: false, status: 503, text: function () {
        return Promise.resolve('<html><body>Service Unavailable</body></html>');
      } });
    };
    v.resolutor.programar('M42');
    return tras(ESPERA * 3, function () {
      ok(v.estados[v.estados.length - 1] === 'error:M42', 'un 5xx avisa como error, no como «nada»');
      ok(v.resueltos.length === 0, 'y no escribe coordenadas');
    });
  })
  .then(function () {
    // Sesame que no contesta nunca: la consulta se aborta pasado el timeout.
    var abortada = false;
    var v = nuevo({ timeout: ESPERA * 2 });
    global.fetch = function (url, init) {
      return new Promise(function (_res, rej) {
        init.signal.addEventListener('abort', function () { abortada = true; rej(new Error('abort')); });
      });
    };
    v.resolutor.programar('M42');
    // Tres espejos colgados: tres timeouts de ESPERA·2 antes del error.
    return tras(ESPERA * 10, function () {
      ok(abortada, 'la consulta colgada se aborta');
      ok(v.estados[v.estados.length - 1] === 'error:M42', 'y avisa como error');
    });
  })

  .then(function () {
    seccion('Respaldo a los otros espejos:');
    var v = nuevo({ timeout: ESPERA * 2 });
    consultas = [];
    // El CDS se cuelga; el SIMBAD de Harvard contesta (2026-11-24: el CDS
    // redirigía a un CfA que tampoco contestaba).
    global.fetch = function (url, init) {
      consultas.push(url);
      return /simbad\.harvard\.edu/.test(url) ? responde(M13_SIMBAD) : cuelga(init);
    };
    v.resolutor.programar('M13');
    return tras(ESPERA * 8, function () {
      ok(consultas.length === 2 && /simbad\.harvard\.edu\/simbad\/sim-id/.test(consultas[1]), 'tras el timeout del CDS pide al SIMBAD de Harvard');
      ok(/Ident=M13/.test(consultas[1]), 'con el nombre en Ident');
      var r = v.resueltos[0];
      ok(r && Math.abs(r.ra - 250.42347) < 1e-4 && Math.abs(r.dec - 36.46132) < 1e-4,
        'RA/Dec en grados desde «16 41 41.634 +36 27 40.75» (' + (r && r.ra.toFixed(5) + ', ' + r.dec.toFixed(5)) + ')');
      ok(r && r.otype === 'GlC', 'y el tipo de objeto');
      ok(v.estados.indexOf('error:M13') < 0, 'sin avisar de error');
    });
  })
  .then(function () {
    // Declinación negativa por SIMBAD: el signo afecta a minutos y segundos.
    var v = nuevo({ timeout: ESPERA * 2 });
    global.fetch = function (url, init) { return /simbad\.harvard/.test(url) ? responde(M42_SIMBAD) : cuelga(init); };
    v.resolutor.programar('M42');
    return tras(ESPERA * 8, function () {
      var r = v.resueltos[0];
      ok(r && Math.abs(r.ra - 83.82) < 1e-4 && Math.abs(r.dec + 5.3875) < 1e-4, 'dec negativa: −05 23 15 = −5,3875° (' + (r && r.dec.toFixed(4)) + ')');
    });
  })
  .then(function () {
    // «No encontrado» de SIMBAD es «nada», y no se pregunta al tercero.
    var v = nuevo({ timeout: ESPERA * 2 });
    consultas = [];
    global.fetch = function (url, init) { consultas.push(url); return /simbad\.harvard/.test(url) ? responde(NADA_SIMBAD) : cuelga(init); };
    v.resolutor.programar('zzqx99');
    return tras(ESPERA * 8, function () {
      ok(consultas.length === 2 && v.estados[v.estados.length - 1] === 'nada:zzqx99', '«!!» de SIMBAD avisa de «nada» y no sigue');
    });
  })
  .then(function () {
    // CDS y SIMBAD de Harvard caídos: el CfA, con el formato de Sesame.
    var v = nuevo({ timeout: ESPERA * 2 });
    consultas = [];
    global.fetch = function (url, init) { consultas.push(url); return /cfa\.harvard/.test(url) ? responde(M42) : cuelga(init); };
    v.resolutor.programar('M42');
    return tras(ESPERA * 12, function () {
      ok(consultas.length === 3 && /vizier\.cfa\.harvard\.edu/.test(consultas[2]), 'tercero: el Sesame del CfA');
      ok(v.resueltos.length === 1 && Math.abs(v.resueltos[0].ra - 83.8201) < 1e-6, 'y las coordenadas llegan');
    });
  })
  .then(function () {
    // «Nada encontrado» del primer espejo es definitivo: no se pregunta al segundo.
    var v = nuevo();
    consultas = [];
    global.fetch = function (url) {
      consultas.push(url);
      return Promise.resolve({ ok: true, text: function () { return Promise.resolve(SIN_RESULTADO); } });
    };
    v.resolutor.programar('zzqx99');
    return tras(ESPERA * 3, function () {
      ok(consultas.length === 1, '«nada» no prueba el segundo espejo');
      ok(v.estados[v.estados.length - 1] === 'nada:zzqx99', 'y avisa de «nada»');
    });
  })

  /* ── 6. Respuestas fuera de orden ──────────────────────────────────────────
     «NGC 68» se consulta, el observador sigue tecleando hasta «NGC 6826» y la
     respuesta de «NGC 68» llega la última. Manda el último nombre escrito. */
  .then(function () {
    seccion('Respuestas que llegan fuera de orden:');
    var NGC68 = '%C.0 G\n%J 4.53500000 30.06500000 = 00 18 08.4    +30 03 54\n';
    var NGC6826 = '%C.0 PN\n%J 296.20000000 50.52500000 = 19 44 48.0    +50 31 30\n';
    var pendientes = {};
    global.fetch = function (url) {
      return new Promise(function (res) {
        var txt = /6826/.test(url) ? NGC6826 : NGC68;
        pendientes[/6826/.test(url) ? 'NGC 6826' : 'NGC 68'] = function () {
          res({ ok: true, text: function () { return Promise.resolve(txt); } });
        };
      });
    };
    var v = nuevo();
    v.resolutor.programar('NGC 68');
    return tras(ESPERA * 3, function () {
      v.resolutor.programar('NGC 6826');
    }).then(function () {
      return tras(ESPERA * 3, function () {
        pendientes['NGC 6826']();
      });
    }).then(function () {
      return tras(ESPERA, function () { pendientes['NGC 68'](); });
    }).then(function () {
      return tras(ESPERA, function () {
        var ultimo = v.resueltos[v.resueltos.length - 1];
        ok(v.resueltos.length === 1, 'solo se escribe una respuesta (' + v.resueltos.length + ')');
        ok(ultimo && ultimo.q === 'NGC 6826' && Math.abs(ultimo.ra - 296.2) < 1e-6,
          'quedan las coordenadas de NGC 6826');
        ok(v.estados.indexOf('error:NGC 68') < 0, 'la consulta descartada no avisa de error');
      });
    });
  })
  .then(function () {
    // Mientras «NGC 6826» está en camino el observador borra hasta «N»: su
    // respuesta ya no corresponde a lo escrito.
    var resolver;
    global.fetch = function () {
      return new Promise(function (res) {
        resolver = function () { res({ ok: true, text: function () { return Promise.resolve(M42); } }); };
      });
    };
    var v = nuevo();
    v.resolutor.programar('NGC 6826');
    return tras(ESPERA * 3, function () {
      v.resolutor.programar('N');
      resolver();
    }).then(function () {
      return tras(ESPERA, function () {
        ok(v.resueltos.length === 0, 'borrar el nombre descarta la respuesta en camino');
      });
    });
  })
  .then(function () {
    // Una tecla que no cambia el nombre (un espacio al final) no tira la
    // consulta que ya va en camino.
    var resolver, abortada = false;
    global.fetch = function (url, init) {
      consultas.push(url);
      init.signal.addEventListener('abort', function () { abortada = true; });
      return new Promise(function (res) {
        resolver = function () { res({ ok: true, text: function () { return Promise.resolve(M42); } }); };
      });
    };
    consultas = [];
    var v = nuevo();
    v.resolutor.programar('M42');
    return tras(ESPERA * 3, function () {
      v.resolutor.programar('M42 ');
    }).then(function () {
      return tras(ESPERA * 3, function () { resolver(); });
    }).then(function () {
      return tras(ESPERA, function () {
        ok(!abortada && consultas.length === 1, 'el mismo nombre no aborta ni repite la consulta');
        ok(v.resueltos.length === 1, 'y su respuesta se escribe');
      });
    });
  })

  .then(function () {
    // Una errata borrada antes de la espera: el formulario ya tiró las
    // coordenadas de A al ver «A x», así que volver a A tiene que consultarlo.
    consultas = [];
    global.fetch = function (url) {
      consultas.push(url);
      return Promise.resolve({ ok: true, text: function () { return Promise.resolve(M42); } });
    };
    var v = nuevo();
    v.resolutor.programar('NGC 6826');
    return tras(ESPERA * 3, function () {
      v.resolutor.programar('NGC 6826x');
      v.resolutor.programar('NGC 6826');
    }).then(function () {
      return tras(ESPERA * 3, function () {
        ok(consultas.length === 2, 'volver a un nombre tras cambiarlo lo consulta otra vez (' + consultas.length + ')');
      });
    });
  })

  /* ── 7. Después de un error ────────────────────────────────────────────────*/
  .then(function () {
    seccion('Después de un error:');
    consultas = [];
    var falla = true;
    global.fetch = function (url) {
      consultas.push(url);
      if (falla) return Promise.reject(new Error('sin red'));
      return Promise.resolve({ ok: true, text: function () { return Promise.resolve(M42); } });
    };
    var v = nuevo();
    v.resolutor.programar('M42');
    return tras(ESPERA * 3, function () {
      falla = false;
      v.resolutor.programar('M42');
    }).then(function () {
      return tras(ESPERA * 3, function () {
        // 3 espejos fallidos + 1 reintento que acierta.
        ok(consultas.length === 4, 'el mismo nombre se puede reintentar (' + consultas.length + ')');
        ok(v.resueltos.length === 1, 'y el reintento escribe las coordenadas');
      });
    });
  })
  .then(function () {
    // Un fallo dentro de onResuelto es de quien lo cablea, no de Sesame.
    var estados = [];
    global.fetch = function () {
      return Promise.resolve({ ok: true, text: function () { return Promise.resolve(M42); } });
    };
    var r = B.resolutorNombre({
      espera: ESPERA,
      onResuelto: function () { throw new Error('fallo del consumidor'); },
      onEstado: function (e) { estados.push(e); }
    });
    var avisos = [];
    function capturar(e) { avisos.push(e); }
    process.on('unhandledRejection', capturar);
    r.programar('M42');
    return tras(ESPERA * 3, function () {
      process.removeListener('unhandledRejection', capturar);
      ok(estados.indexOf('error') < 0, 'un fallo en onResuelto no se avisa como error de Sesame');
      ok(avisos.length === 1, 'y sale a la consola en vez de tragarse');
    });
  })

  .then(function () {
    console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
    process.exit(fallos === 0 ? 0 : 1);
  })
  .catch(function (e) {
    console.error('Error inesperado en el test:', e);
    process.exit(1);
  });
