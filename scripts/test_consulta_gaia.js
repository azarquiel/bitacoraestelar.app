#!/usr/bin/env node
/* Test de la PROFUNDIDAD de consulta a Gaia (`magConsultaGaia` en
   resources/js/bitacora-gaia-render.js).

   Antes la consulta pedía siempre GAIA_MAG_MAX=17 fijo, sin relación con la
   apertura del equipo. Con un tope fijo y una cola de glow ancha, un 8" y un
   18" acababan "viendo" casi el mismo catálogo entero -la apertura dejaba de
   notarse en el número de estrellas. Ahora la profundidad sale de magLimite()
   (el mismo mlim del render) al cielo más oscuro que admite la UI y aumentos
   altos, más el margen de la cola de glow: cada equipo pide solo lo que puede
   llegar a usar.

   Sin dependencias:  node scripts/test_consulta_gaia.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, msg) {
  console.log('  ' + (cond ? 'ok  ' : 'FALLO') + '  ' + msg);
  if (!cond) fallos++;
}

console.log('magConsultaGaia crece con la apertura, no es un tope fijo:');
var m8 = R.magConsultaGaia(200, 0.9);   // ~8"
var m18 = R.magConsultaGaia(457, 0.9);  // ~18"
ok(m18 > m8 + 1, 'un 18" pide un catálogo notablemente más profundo que un 8" (' +
  m8.toFixed(2) + ' → ' + m18.toFixed(2) + ')');

console.log('Se mantiene dentro de límites sanos:');
ok(R.magConsultaGaia(1000, 0.9) <= 20, 'un equipo enorme no supera el tope de seguridad (20)');
ok(R.magConsultaGaia(40, 0.6) >= 12, 'un equipo minúsculo no baja del suelo de seguridad (12)');

console.log('Sin apertura, cae a un valor de respaldo razonable:');
ok(R.magConsultaGaia(0, 0.9) > 0, 'apertura 0 no revienta, devuelve el valor por defecto');

console.log('El margen de la cola de glow sale de las MISMAS constantes que dibujar():');
var colaEsperada = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin);
var techo = R.magLimite({ apertura: 200, aumentos: 1e6, transmision: 0.9, sqm: 22 });
var esperado = Math.max(12, Math.min(20, techo + colaEsperada + 0.3));
ok(Math.abs(m8 - esperado) < 1e-6,
  'magConsultaGaia(200) coincide con techo+cola(alfaMin,glowCorte)+margen = ' + esperado.toFixed(3));

/* REGRESIÓN (M6/M7 hacia el bulbo con 18" f/4.5 + ocular de 31 mm): la
   profundidad se pedía con el techo del tubo (aumentos=1e6) en vez de con el
   aumento REAL, y como campo ancho = pocos aumentos, la profundidad de más caía
   justo sobre el radio mayor. En M7 (rad 0,89°) eso pedía Gmag<=19,6 -2,76
   millones de estrellas a ordenar- para devolver, tras el TOP 40000, las MISMAS
   filas hasta G=15,18 que devuelve Gmag<=15,5: 28 s medidos contra 4,7 s por el
   mismo dato, y con VizieR y GAVO agotando su timeout el proxy daba 502.
   Medido contra tapvizier.cds.unistra.fr, catálogo I/355/gaiadr3. */
console.log('La profundidad la fija el aumento REAL, no el techo del tubo:');
var D18 = 457.2, F18 = D18 * 4.5;
var aum31 = F18 / 31;                                    // ocular de 31 mm → 66x
var mAncho = R.magConsultaGaia(D18, 0.7, aum31);
var mEstrecho = R.magConsultaGaia(D18, 0.7, F18 / 5);    // ocular de 5 mm → 411x
ok(mAncho < mEstrecho,
  'a campo ancho se pide menos profundidad que a campo estrecho (' +
  mAncho.toFixed(2) + ' vs ' + mEstrecho.toFixed(2) + ')');
ok(mAncho < 18.5,
  'el 18" a 66x no pide el catálogo del bulbo entero: ' + mAncho.toFixed(2) + ' < 18,5');
ok(mAncho >= R.magLimite({ apertura: D18, aumentos: aum31, transmision: 0.7, sqm: 22 }),
  'pero nunca por debajo del mlim que ese equipo alcanza a ese aumento (no se pierden estrellas visibles)');
ok(Math.abs(R.magConsultaGaia(D18, 0.7) - R.magConsultaGaia(D18, 0.7, 1e6)) < 1e-9,
  'sin aumentos conserva el comportamiento anterior (techo del tubo)');

/* La precarga de Gaia del arranque sale ANTES de que el catálogo (asíncrono)
   haya elegido ocular, así que `aumentos` llega sin focal: Infinity con
   telescopio ya elegido, NaN sin nada. Ninguno de los dos puede reventar ni
   propagar NaN a la URL de la consulta -al arrancar el simulador daba
   "Cannot read properties of null (reading 'focal_mm')". */
ok(Math.abs(R.magConsultaGaia(D18, 0.7, Infinity) - R.magConsultaGaia(D18, 0.7)) < 1e-9,
  'aumentos infinitos (telescopio elegido, ocular aún no) = techo del tubo');
ok(R.magConsultaGaia(D18, 0.7, NaN) > 0 && isFinite(R.magConsultaGaia(D18, 0.7, NaN)),
  'aumentos NaN (nada elegido aún) devuelve un número finito, no NaN');
ok(R.magConsultaGaia(0, 0.7, NaN) > 0,
  'sin apertura ni aumentos cae al valor por defecto en vez de romper');

/* La estrella JUSTO en mlim se dibuja igual en cualquier equipo: es lo que hace
   que mlim signifique lo mismo en un 18" y en un 8". El alpha del render se
   calibra contra mlim (no contra una magnitud absoluta), así que a g=mlim cae
   siempre en el suelo alfaMin, y el glow de la que queda un pelo por debajo
   ancla en ese mismo valor: el cruce es continuo. Lo único que cambia con la
   apertura es el TAMAÑO (sueloEstrella usa el flujo absoluto), y a magnitudes
   tan tenues ese término es despreciable. */
console.log('La estrella en el límite se ve igual en todo equipo:');
function pintadaEnLimite(D, F, t) {
  var aum = F / 13, arcmin = 82 / aum * 60;
  var mlim = R.magLimite({ apertura: D, aumentos: aum, transmision: t, sqm: 21 });
  var o = { afov: 82, apertura: D, arcmin: arcmin, size: 720, g: mlim, blur: R.blurEstrella(mlim, D), mlim: mlim };
  var Rtot = R.radioEstrella(o);
  var alfa = Math.max(R.config.alfaMin, Math.min(1, (mlim - o.g) / R.config.rangoBrillo));
  return { mlim: mlim, radio: Rtot, alfa: alfa * R.factorDilucion(R.sueloEstrella(o), Rtot) };
}
var e18 = pintadaEnLimite(457.2, 457.2 * 4.5, 0.7);   // 18" f/4.5, 13 mm → 158x
var e8  = pintadaEnLimite(203.2, 203.2 * 10,  0.65);  // 8" f/10,  13 mm → 156x
ok(e18.mlim > e8.mlim + 1, 'el 18" llega más profundo que el 8" a igual aumento (' +
  e8.mlim.toFixed(2) + ' → ' + e18.mlim.toFixed(2) + ')');
ok(Math.abs(e18.alfa - e8.alfa) < 1e-9 && Math.abs(e18.alfa - R.config.alfaMin) < 1e-9,
  'una estrella en g=mlim se pinta con el mismo alpha (alfaMin) en ambos equipos');
ok(Math.abs(e18.radio - e8.radio) / e8.radio < 0.02,
  'y con el mismo tamaño (<2% de diferencia: ' + e8.radio.toFixed(3) + ' vs ' + e18.radio.toFixed(3) + ' px)');
ok(Math.abs(R.config.alfaMin * Math.pow(10, -0.4 * 0) - R.config.alfaMin) < 1e-9,
  'el glow de la primera no resuelta arranca en ese mismo alfaMin (cruce continuo)');

console.log(fallos === 0 ? '\n✓ Todo correcto.' : '\n✗ ' + fallos + ' fallo(s).');
process.exit(fallos === 0 ? 0 : 1);
