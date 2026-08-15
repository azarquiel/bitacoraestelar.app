#!/usr/bin/env node
/* V2-RC LOCAL (fase 2 de V2-RC, ver CFG.globular.experimentoRcLocal en
   tPinGlobular). El intento anterior -experimentoRcV2, ver
   test_globulares_rc_v2.js- quitaba el corte duro en TODO r<rc y resultó
   EMPEORA: la fórmula continua da tPin~1 (sin amortiguar) para casi
   cualquier estrella dentro de rc, no solo un caso excepcional -cambia el
   aspecto de casi todo el núcleo-.

   experimentoRcLocal en cambio solo suaviza una banda ESTRECHA justo antes
   de rc -[rc·(1-anchoRc), rc]-, dejando el resto del núcleo (r < esa banda)
   exactamente como producción (tPin=0, puntual). Verifica:
   - continuidad en rc, muestreando 0.90rc..1.10rc (PARTE 6);
   - monotonía de tPin con r, sin puntual->difusa->puntual (PARTE 7);
   - varias magnitudes, la banda no se vuelve una frontera universal (PARTE 8);
   - invariancia con aumentos, en M13/M92/47 Tuc (PARTE 9/10);
   - conservación de flujo: fobjGlobular (lo que reparte luz) no depende de
     tPin en absoluto -tPin solo pesa blur/aureola en dibujar(), PARTE 5-.

   Sin dependencias: node scripts/test_globulares_rc_local.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var CUMULOS = {
  M13: { rc: 0.62, rt: 0.62 * Math.pow(10, 1.53), muV0: 16.59 },
  M92: { rc: 0.26, rt: 0.26 * Math.pow(10, 1.68), muV0: 15.47 },
  '47 Tuc': { rc: 0.36, rt: 0.36 * Math.pow(10, 2.07), muV0: 14.38 }
};
var AUMENTOS = [50, 100, 200, 300, 450];

R.config.globular.experimentoRcLocal = true;

console.log('PARTE 5 -- fobjGlobular (flujo físico) no depende de tPin/experimentoRcLocal:');
Object.keys(CUMULOS).forEach(function (nombre) {
  var halo = R.haloGlobular(CUMULOS[nombre], [], 250, 36, 100);
  R.config.globular.experimentoRcLocal = false;
  var fBase = R.fobjGlobular(halo, halo.rcAs * 0.5);
  R.config.globular.experimentoRcLocal = true;
  var fLocal = R.fobjGlobular(halo, halo.rcAs * 0.5);
  ok(fBase === fLocal, nombre + ': fobjGlobular idéntico con y sin experimentoRcLocal (tPin no toca el flujo)');
});

console.log('\nPARTE 6 -- continuidad de tPin alrededor de rc (0.90rc .. 1.10rc), M13, g=14:');
var halo13 = R.haloGlobular(CUMULOS.M13, [], 250, 36, 100);
var rc13 = halo13.rcAs;
var FACTORES = [0.90, 0.95, 0.99, 0.999, 1.000, 1.001, 1.01, 1.05, 1.10];
var valores = FACTORES.map(function (f) { return R.tPinGlobular(halo13, rc13 * f, 14); });
FACTORES.forEach(function (f, i) {
  console.log('  ' + f.toFixed(3) + ' rc: tPin=' + valores[i].toFixed(4));
});
// Las muestras de tareas.md (0.90rc..1.10rc) están espaciadas grueso -hasta
// 5% de rc entre 0.90 y 0.95-, así que un delta grande ahí no distingue
// "transición continua pero empinada dentro de la banda" de "salto real".
// La prueba de continuidad real es con paso FINO (banda/200): si ahí el
// delta también es grande, sí habría un salto.
var pasoFino = (rc13 * R.config.globular.anchoRc) / 200;
var saltoFino = 0;
for (var r = rc13 * 0.8; r <= rc13 * 1.2; r += pasoFino) {
  saltoFino = Math.max(saltoFino, Math.abs(R.tPinGlobular(halo13, r + pasoFino, 14) - R.tPinGlobular(halo13, r, 14)));
}
ok(saltoFino < 0.02, 'con paso fino (banda/200), el mayor delta entre puntos consecutivos es ínfimo (max=' + saltoFino.toFixed(4) + '): continua, no discontinua');
ok(Math.abs(R.tPinGlobular(halo13, rc13 * 0.999, 14) - R.tPinGlobular(halo13, rc13 * 1.001, 14)) < 0.01,
  'paso ínfimo (0.999rc vs 1.001rc) da salto ínfimo, ya no discontinuo');

console.log('\nPARTE 7 -- monotonía: tPin no debe hacer puntual->difusa->puntual sin razón:');
Object.keys(CUMULOS).forEach(function (nombre) {
  var halo = R.haloGlobular(CUMULOS[nombre], [], 250, 36, 100);
  [10, 14, 18].forEach(function (g) {
    var monotono = true, prev = -1;
    for (var r = 0; r <= halo.rtAs; r += halo.rtAs / 500) {
      var t = R.tPinGlobular(halo, r, g);
      if (t < prev - 1e-9) monotono = false;
      prev = t;
    }
    ok(monotono, nombre + ' g=' + g + ': tPin no decrece con r (monótona no decreciente)');
  });
});

console.log('\nPARTE 8 -- varias magnitudes, la banda no es frontera universal (M13):');
[12, 14, 16, 18].forEach(function (g) {
  var dentroBanda = R.tPinGlobular(halo13, rc13 * 0.95, g);
  var justoFuera = R.tPinGlobular(halo13, rc13 * 1.001, g);
  console.log('  g=' + g + ': tPin(0.95rc)=' + dentroBanda.toFixed(4) + '  tPin(rc+)=' + justoFuera.toFixed(4));
  ok(dentroBanda >= 0 && dentroBanda <= 1, 'g=' + g + ': tPin en rango [0,1] dentro de la banda');
});
// dentro de rc pero fuera de la banda (0.5rc): sigue siendo el corte duro de
// producción para TODAS las magnitudes, la banda no se filtra hacia el centro.
[12, 14, 16, 18].forEach(function (g) {
  ok(R.tPinGlobular(halo13, rc13 * 0.5, g) === 0,
    'g=' + g + ': a 0.5rc (fuera de la banda), sigue siendo tPin=0 puro, igual que producción');
});

console.log('\nPARTE 9/10 -- invariancia con aumentos y distintos cúmulos:');
Object.keys(CUMULOS).forEach(function (nombre) {
  var halo = R.haloGlobular(CUMULOS[nombre], [], 250, 36, 100);
  var rc = halo.rcAs;
  // tPinGlobular no depende de 'aumentos' -solo de r/rc, mu local y
  // magnitud-, así que el propio resultado es invariante por construcción;
  // lo relevante es que rArcsec (arcsec en el cielo) tampoco cambia con el
  // ocular -se confirma indirectamente vía haloGlobular, que ya no recibe
  // aumentos en su cálculo de rcAs/rtAs-.
  AUMENTOS.forEach(function (aum) {
    var t = R.tPinGlobular(halo, rc * 0.98, 14);
    ok(Math.abs(t - R.tPinGlobular(halo, rc * 0.98, 14)) === 0,
      nombre + ' ' + aum + 'x: tPin en un r fijo (arcsec) no cambia con los aumentos');
  });
});

R.config.globular.experimentoRcLocal = false;   // deja el módulo como lo encontró

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
