#!/usr/bin/env node
/* CFG.magBlanco — la pendiente del alpha del disco, SEPARADA del rango de la
   cadena fotométrica (rama C, ver ADR 0019).

   Contexto: el alpha no es el nivel en pantalla. La capa de estrellas se
   escribe como valor 0-255 y pintarFot la vuelve a leer como FLUJO con
   `flujoDeValor(v, c.Fref, c.rango)`, y ese flujo se mapea con
   `valorDeFlujo(F, c.FcieloPintado, c.rango)`. Este test fija las dos cosas que
   salen de ahí:

     · si la lectura usara la MISMA pendiente que el pintado, la pendiente se
       cancelaría y el nivel final no se movería (la trampa: T2);
     · como pintarFot lee con `c.rango` FIJO, bajar `magBlanco` sí sube el nivel
       final, y lo hace ~proporcional a 1/magBlanco (T3).

   node scripts/test_alfa_magblanco.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok    ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function cerca(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

var AFOV = 100, SIZE = 720, POJO = 7, T = 0.85, SQM = 21.5;
var D = 200, M = Math.round(1800 / 13), G = 7.46;   // VISAC 200L, Ethos 13 mm

var arcmin = AFOV / M * 60, asPorPx = arcmin * 60 / SIZE;
var mlim = R.magLimite({ apertura: D, aumentos: M, transmision: T, sqm: SQM, pupilaOjo: POJO });
var c = R.ctxFotometrico({ pupilaSalida: D / M, pupilaOjo: POJO, sqm: SQM, transmision: T, aumentos: M });

function alfaDe(g, magBlanco) {
  var antes = CFG.magBlanco;
  if (magBlanco != null) CFG.magBlanco = magBlanco;
  var o = { afov: AFOV, apertura: D, arcmin: arcmin, size: SIZE, g: g, blur: R.blurEstrella(g, D), mlim: mlim };
  var Rtot = R.radioEstrella(o);
  var a = R.alfaEstrella(g, mlim, Rtot * asPorPx, R.factorDilucion(R.sueloEstrella(o), Rtot));
  CFG.magBlanco = antes;
  return a;
}
/* El nivel de pantalla de la estrella tal y como lo calcula pintarFot: la capa
   se lee como flujo contra el cielo de REFERENCIA y se mapea contra el de la
   escena. `rangoLectura` existe solo para poder demostrar la trampa T2. */
function nivelDe(g, magBlanco, rangoLectura) {
  var v = 255 * alfaDe(g, magBlanco);
  var F = R.flujoDeValor(v, c.Fref, rangoLectura == null ? c.rango : rangoLectura);
  return c.nivelFondo + R.valorDeFlujo(F, c.FcieloPintado, c.rango);
}

console.log('D=' + D + 'mm ' + M + 'x sqm=' + SQM + '  mlim=' + mlim.toFixed(2)
  + '  fondo=' + c.nivelFondo.toFixed(1) + '  c.rango=' + c.rango);

/* T1 — el valor de producción, elegido en el A/B contra las notas (ADR 0019).
   Va POR ENCIMA del margen (mlim − g) de la más brillante de estos cúmulos con
   el 18": ahí es donde empieza a quemarse el pico. Si alguien lo baja de ese
   margen, T4 y el guardián de apertura lo cazan. */
ok(cerca(CFG.magBlanco, 9.5),
  'T1a: magBlanco de produccion = 9,5 (' + CFG.magBlanco + ')');
ok(CFG.magBlanco < CFG.rangoBrillo,
  'T1b: y va por debajo del rango de la cadena, que es lo que aclara la estrella');
ok(cerca(R.alfaEstrella(7.46, 14.17, 5, 1), (14.17 - 7.46) / CFG.magBlanco, 1e-9),
  'T1c: la rampa es (mlim-g)/magBlanco, sin mas');

/* T2 — LA TRAMPA. Si pintarFot leyera la capa con la misma pendiente con la que
   se pintó, las dos conversiones serían inversas y el flujo codificado saldría
   idéntico: cambiar la pendiente no pintaría NADA más brillante. Por eso la
   rama C deja la lectura anclada a c.rango.
   Las dos pendientes van POR ENCIMA del margen (mlim − g) de esta estrella: la
   cancelación es exacta mientras no haya recorte, y en cuanto alpha llega a 1
   lo único que queda es el recorte (T4). */
var t2a = nivelDe(G, 11.5, 11.5), t2b = nivelDe(G, 9, 9);
ok(cerca(t2a, t2b, 1e-6),
  'T2: con lectura emparejada la pendiente se cancela (' + t2a.toFixed(1)
  + ' = ' + t2b.toFixed(1) + ')');

/* T3 — la ley que sí mueve el nivel: pintarFot lee con c.rango fijo, así que el
   flujo codificado es Fref·(10^(0,4·Δmag·c.rango/magBlanco) − 1) y el nivel
   sobre el fondo va ~como 255·Δmag/magBlanco. Bajar magBlanco aclara. */
var n115 = nivelDe(G, 11.5) - c.nivelFondo;
var n80 = nivelDe(G, 8) - c.nivelFondo;
ok(n80 > n115 * 1.3, 'T3a: magBlanco 8 pinta mas claro que 11,5 ('
  + n115.toFixed(1) + ' -> ' + n80.toFixed(1) + ')');
ok(cerca(n80 / n115, 11.5 / 8, 0.12),
  'T3b: y el nivel escala ~1/magBlanco (' + (n80 / n115).toFixed(3)
  + ' vs ' + (11.5 / 8).toFixed(3) + ')');

/* T4 — el precio de bajar la pendiente: la saturación. En cuanto alpha llega a
   1 la estrella deja de responder a la apertura (el canal mlim se recorta) y el
   guardián test_alfa_apertura.js falla. Aquí se fija el suelo: con magBlanco
   por debajo del margen de la estrella más brillante del cúmulo, se satura. */
var margen = mlim - G;
ok(cerca(alfaDe(G, margen * 0.8), 1, 1e-9),
  'T4a: magBlanco < (mlim-g) satura la estrella a blanco (margen=' + margen.toFixed(2) + ')');
ok(alfaDe(G, margen * 1.2) < 1,
  'T4b: por encima del margen sigue habiendo recorrido');

/* T5 — el suelo alfaMin y la dilución siguen intactos con la pendiente nueva. */
ok(cerca(R.alfaEstrella(20, 14.17, 5, 1), CFG.alfaMin),
  'T5a: por debajo del limite se queda en alfaMin');
ok(cerca(R.alfaEstrella(7.46, 14.17, 5, 0.5), (14.17 - 7.46) / CFG.magBlanco / 2, 1e-9),
  'T5b: la dilucion sigue multiplicando al final');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo OK');
process.exit(fallos ? 1 : 0);
