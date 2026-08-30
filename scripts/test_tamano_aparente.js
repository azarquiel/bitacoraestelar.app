#!/usr/bin/env node
/* Tests de REGRESIÓN de la ley B del término de tamaño, la propuesta que mide
   scripts/harness_tamano_aparente.js:

     A (producción hoy):  término = clamp( (C_MAG_REF / aumentos)^C_MAG_EXP )
     B (propuesta):       término = clamp( (C_MAG_REF_B / (D25 · aumentos))^C_MAG_EXP )

   La ley B vive AQUÍ y en el harness, no en resources/js/: producción sigue sin
   tocar hasta que el resultado se revise. Estos tests fijan las propiedades que
   el cambio tiene que cumplir el día que se aplique, para que aplicarlo sea
   comprobar que siguen verdes en vez de volver a razonarlas.

   Sin dependencias:  node scripts/test_tamano_aparente.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var fallos = 0;
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(6));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toFixed(6) +
      ' ±' + tol + '\n         obtenido ' + actual.toFixed(6));
  }
}
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var SQM = 21.3, T = 0.82, POJO = 7;
/* PROVISIONAL, y a propósito: el valor definitivo se calibra en otra fase con
   datos de detección. Los tests de abajo son invariantes en él —comparan la ley
   consigo misma— salvo donde se dice lo contrario. */
var PLATEAU_PROV = 60, C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);

function clampT(t) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, t)); }
// El tronco común: ctxFotometrico SIN aumentos devuelve Cmin sin término de tamaño.
function ctxBase(apertura, MAG) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
    pupilaSalida: apertura / MAG });
}
function terminoA(MAG) { return clampT(Math.pow(FOT.C_MAG_REF / MAG, FOT.C_MAG_EXP)); }
function terminoB(d25, MAG) {
  return clampT(Math.pow(C_MAG_REF_B / (d25 * MAG), FOT.C_MAG_EXP));
}

console.log('\n— El término B rompe la degeneración de tamaños —');
/* Dentro de la ventana sin clamp: la ley A da lo mismo para los dos tamaños (es
   ciega al objeto) y la B no. Fuera de la ventana las dos se clavan, y eso no es
   un fallo: es la respuesta física —el umbral satura con el tamaño aparente—. */
var MAG_V = 100, D_CHICA = 0.2, D_GRANDE = 0.5;
ok(terminoA(MAG_V) === terminoA(MAG_V), 'la ley A no ve el objeto (trivial: no lo recibe)');
ok(terminoB(D_CHICA, MAG_V) > terminoB(D_GRANDE, MAG_V),
  'a igual aumento, el objeto más pequeño pide MÁS contraste (' +
  terminoB(D_CHICA, MAG_V).toFixed(4) + ' > ' + terminoB(D_GRANDE, MAG_V).toFixed(4) + ')');
ok(!terminoBEnClamp(D_CHICA, MAG_V) && !terminoBEnClamp(D_GRANDE, MAG_V),
  'y se mide dentro de la ventana sin clamp, no en el suelo');
function terminoBEnClamp(d25, MAG) {
  return Math.pow(C_MAG_REF_B / (d25 * MAG), FOT.C_MAG_EXP) !== terminoB(d25, MAG);
}

console.log('\n— La variable es el TAMAÑO APARENTE, no D25 ni los aumentos por separado —');
var equis = [[0.25, 100], [0.5, 50], [1, 25], [0.125, 200]];   // D25·MAG = 25′ en todos
var ref = terminoB(equis[0][0], equis[0][1]);
equis.forEach(function (e) {
  casi(terminoB(e[0], e[1]), ref, 1e-12,
    'D25 ' + e[0] + '′ a ' + e[1] + 'x (aparente ' + (e[0] * e[1]) + '′)');
});

console.log('\n— La pupila de salida sigue siendo una variable independiente —');
/* Mismo tamaño aparente, distinta pupila: el término se repite y Cmin NO, porque
   la luminancia retinal entra por su lado. Si el término de tamaño se comiera
   esta dependencia, el modelo diría que un 8″ y un 18″ ven igual. */
var a = ctxBase(203, 100), b = ctxBase(457, 100);
casi(terminoB(0.25, 100), terminoB(0.25, 100), 1e-12, 'mismo término con las dos aperturas');
ok(a.Cmin > b.Cmin, 'y Cmin baja con la pupila mayor (' +
  a.Cmin.toFixed(5) + ' → ' + b.Cmin.toFixed(5) + ')');
casi(b.Cmin / a.Cmin, Math.pow(b.dim / a.dim, -FOT.C_EXP), 1e-9,
  'exactamente lo que dice el término de pupila');

console.log('\n— Fallback de los objetos sin D25: no-op EXACTO sobre la ley de hoy —');
/* No es una perilla nueva: C_MAG_REF_B/C_MAG_REF es el mismo número de hoy con
   otras unidades. Un objeto difuso sin D25 conserva su comportamiento actual. */
var TAM_NEUTRO = C_MAG_REF_B / FOT.C_MAG_REF;
[20, 66, 100, 150, 222, 400, 900, 2000].forEach(function (MAG) {
  casi(terminoB(TAM_NEUTRO, MAG), terminoA(MAG), 1e-12,
    'sin D25 a ' + MAG + 'x, B = A (clamps incluidos)');
});

console.log('\n— Las estrellas no se enteran —');
/* Las estrellas llegan a pintarFot ya resueltas en pantalla y consumen Fcielo y
   rango, nunca Cmin. Se comprueba que eso es cierto midiendo lo que SÍ usan a
   dos aumentos con la misma pupila de salida: si algo de ahí se moviera con el
   aumento, el término de tamaño podría tocarlas. */
var e1 = ctxBase(250, 100), e2 = ctxBase(1000, 400);   // los dos, pupila 2,5 mm
casi(e2.Fcielo, e1.Fcielo, 1e-18, 'Fcielo idéntico');
casi(e2.rango, e1.rango, 1e-12, 'rango idéntico');
casi(e2.nivelFondo, e1.nivelFondo, 1e-12, 'nivelFondo idéntico');
casi(e2.SBe, e1.SBe, 1e-12, 'SBe idéntico');
ok(Math.abs(e2.Cmin * terminoA(400) - e1.Cmin * terminoA(100)) > 1e-3,
  'y solo Cmin se mueve al meterle el término, que es lo que no usan');

console.log('\n— El presupuesto fotométrico no se toca —');
/* El término vive en el UMBRAL. El flujo del modelo no lo ve pasar. */
var comps = window.BitacoraPS1.ps1ComponentesSersic({ magV: 9, reArcsec: 100, n: 3, ba: 1, bt: 0 });
casi(window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, 50), window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, 50), 1e-18,
  'ps1FlujoModelo no depende de aumentos ni de D25');

console.log(fallos ? '\n' + fallos + ' FALLOS\n' : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
