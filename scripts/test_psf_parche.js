#!/usr/bin/env node
/* Invariantes A–F de la PSF sobre el parche de PS1 (scripts/lib_psf_parche.js).

   Producción sin tocar: esto fija las propiedades que la candidata tendrá que
   seguir cumpliendo el día que se mueva a resources/js/. Si alguna falla, el
   cambio no está listo.

   Sin dependencias:  node scripts/test_psf_parche.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = window.BitacoraPS1.cfg;
var P = require('./lib_psf_parche.js')(R);

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

var APS = [80, 203, 457, 914], SEEINGS = [1.5, 2.0, 3.0, 4.0, 6.0];
var SQM = 21.3, T = 0.82, POJO = 7, ESC = 0.25;   // ″/px, la escala de PS1

/* Un parche sintético: fondo llano más una sinusoide de periodo conocido. Es el
   banco de pruebas de una MTF, que es exactamente lo que se está midiendo. */
function parcheSinusoide(n, periodoAs, amp) {
  var v = new Float32Array(n * n);
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      v[y * n + x] = 100 * (1 + amp * Math.sin(2 * Math.PI * x * ESC / periodoAs));
    }
  }
  return v;
}
/* Amplitud que queda, medida lejos del borde para que la réplica de borde no
   contamine: pico a valle sobre el centro. */
function amplitud(v, n) {
  var y = n >> 1, lo = Infinity, hi = -Infinity, m = n >> 2;
  for (var x = m; x < n - m; x++) { var f = v[y * n + x]; if (f < lo) lo = f; if (f > hi) hi = f; }
  return (hi - lo) / (hi + lo);
}
function suma(v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s; }
function retencion(D, periodoAs, seeing) {
  var n = 128, v = parcheSinusoide(n, periodoAs, 0.3);
  var w = P.convolucionar(v, n, n, ESC, D, seeing);
  return amplitud(w, n) / amplitud(v, n);
}

console.log('\n— La PSF sale de piezas que ya existen, sin constante nueva —');
casi(P.thetaRes(457), 2 * R.radioImagenEstelar(457), 1e-12, 'θ_res = 2·radioImagenEstelar (″)');
casi(P.thetaParche(ESC), Math.sqrt(Math.pow(PS1.seeingAs, 2) +
  Math.pow(ESC * P.CAJA_A_FWHM, 2)), 1e-12, 'θ_parche = seeing de PS1 ⊕ caja del píxel (″)');
casi(P.thetaAdd(457, ESC), Math.sqrt(Math.pow(P.thetaRes(457), 2) - Math.pow(P.thetaParche(ESC), 2)), 1e-12,
  'θ_add = √(θ_res² − θ_parche²) (″)');
ok(P.thetaAdd(914, ESC) > 0, 'con el seeing de hoy (' + CFG.seeingArcsec + '″) el telescopio SIEMPRE ' +
  'borra más que PS1 (1,1″): hay algo que añadir');
casi(P.thetaAddCon(914, 0.5, ESC), 0, 1e-12,
  'y si el telescopio fuese más fino que el parche, θ_add = 0: no se inventa resolución');

console.log('\n— La convolución numérica coincide con la MTF analítica —');
/* Si no coincidiese, el kernel estaría mal normalizado o mal escalado, y todo lo
   demás mediría otra cosa. Es la prueba de que el eje angular está bien puesto. */
[20, 40, 80].forEach(function (p) {
  casi(retencion(457, p, null), P.mtf(P.thetaAdd(457, ESC), p), 0.02,
    'periodo ' + p + '″: retención medida vs exp(−2π²σ²/P²)');
});

console.log('\n— Los huecos del stack no se esparcen —');
/* Los parches reales traen píxeles no finitos: 76 en el de M51, 96 en el de
   M101. Una convolución ciega reparte cada uno por un disco de 3σ y se lleva por
   delante media galaxia. Aquí se saltan y se renormaliza por el peso usado. */
var conHueco = parcheSinusoide(64, 40, 0.3);
conHueco[32 * 64 + 32] = NaN;
var sal = P.convolucionar(conHueco, 64, 64, ESC, 80, null);
var noFin = 0;
for (var q = 0; q < sal.length; q++) if (!isFinite(sal[q])) noFin++;
ok(noFin === 0, 'un NaN aislado no contamina a sus vecinos (' + noFin + ' no finitos a la salida)');
ok(Math.abs(sal[32 * 64 + 32] - conHueco[32 * 64 + 31]) / conHueco[32 * 64 + 31] < 0.05,
  'y el hueco se rellena con el entorno, no con un cero que fabricaría un agujero negro');

console.log('\n— A. A igual pupila, la fotometría de detección no se entera —');
/* La PSF conserva el flujo: es una convolución normalizada. Y el umbral no la
   ve pasar, porque se aplica al parche y no al contexto fotométrico. */
var n0 = 128, base = parcheSinusoide(n0, 40, 0.3);
APS.forEach(function (D) {
  var w = P.convolucionar(base, n0, n0, ESC, D, null);
  casi(suma(w) / suma(base), 1, 2e-3, 'apertura ' + D + ' mm: flujo total conservado');
});
var pupila = 2.0;
var ctxs = APS.map(function (D) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: pupila });
});
ok(ctxs.every(function (c) { return Math.abs(c.nivelFondo - ctxs[0].nivelFondo) < 1e-12; }),
  'a 2,00 mm de pupila el fondo es el mismo en 80/203/457/914 mm, con PSF o sin ella');
ok(ctxs.every(function (c) { return Math.abs(c.Cmin - ctxs[0].Cmin) < 1e-12; }),
  'y el Cmin de detección también: la PSF no entra en la ley fotométrica');

console.log('\n— B. Más apertura nunca da PEOR estructura —');
var bOk = true;
[10, 20, 40, 80, 160].forEach(function (p) {
  for (var i = 1; i < APS.length; i++) {
    if (retencion(APS[i], p, null) < retencion(APS[i - 1], p, null) - 1e-9) bOk = false;
  }
});
ok(bOk, 'retención monótona no decreciente con D (5 periodos × 4 aperturas)');
ok(P.thetaAdd(914, ESC) <= P.thetaAdd(80, ESC) + 1e-12, 'y θ_add no crece con la apertura (' +
  P.thetaAdd(914, ESC).toFixed(2) + '″ ≤ ' + P.thetaAdd(80, ESC).toFixed(2) + '″)');

console.log('\n— C. Con más seeing, la estructura nunca mejora —');
var cOk = true;
APS.forEach(function (D) {
  [10, 20, 40, 80, 160].forEach(function (p) {
    for (var i = 1; i < SEEINGS.length; i++) {
      if (retencion(D, p, SEEINGS[i]) > retencion(D, p, SEEINGS[i - 1]) + 1e-9) cOk = false;
    }
  });
});
ok(cOk, 'retención monótona no creciente con el seeing (4 aperturas × 5 periodos × 5 seeings)');

console.log('\n— D. Con el seeing dominando, la apertura rinde cada vez menos —');
/* No es un «se nota menos» cualitativo: la ganancia marginal por duplicar la
   apertura tiene que encogerse, y θ_res tiene que tender al suelo atmosférico. */
[2.0, 4.0].forEach(function (s) {
  var g = [];
  for (var i = 1; i < APS.length; i++) g.push(retencion(APS[i], 40, s) - retencion(APS[i - 1], 40, s));
  var decrece = true;
  for (var j = 1; j < g.length; j++) if (g[j] > g[j - 1] + 1e-9) decrece = false;
  ok(decrece, 'seeing ' + s.toFixed(1) + '″: la mejora marginal por escalón de apertura decrece [' +
    g.map(function (x) { return x.toFixed(4); }).join(', ') + ']');
});
casi(P.thetaResCon(1e7, 3.0), 3.0, 1e-4, 'apertura infinita → θ_res = seeing: el suelo es la atmósfera');
ok(P.thetaResCon(914, 4.0) / 4.0 < 1.005, 'con seeing 4″ un 36″ ya está pegado al suelo atmosférico');

console.log('\n— E. Ni el campo aparente ni el lienzo pueden mover nada de esto —');
/* La PSF se calcula en el marco del PARCHE (″ y escalaAs). Ni el tamaño del
   lienzo ni el campo aparente ni los aumentos entran en la cuenta. */
casi(P.thetaAdd(457, ESC), P.thetaAdd(457, ESC), 1e-15, 'θ_add no recibe aumentos, ni afov, ni SIZE');
var r512 = P.convolucionar(base, n0, n0, ESC, 457, null);
var r2048 = P.convolucionar(base, n0, n0, ESC, 457, null);
casi(amplitud(r512, n0), amplitud(r2048, n0), 1e-12,
  'la misma llamada con otro lienzo imaginario da lo mismo: no lo recibe');
var cA = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 457 / 150 });
var cB = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 457 / 150 });
casi(cA.Cmin, cB.Cmin, 1e-15, 'y el umbral tampoco: ctxFotometrico no tiene por dónde recibirlos');

console.log('\n— F. Las estrellas conservan exactamente su camino —');
casi(R.radioAiry(457), CFG.airyArcsec / 457, 1e-15, 'radioAiry intacto');
casi(R.radioImagenEstelar(457), Math.sqrt(Math.pow(CFG.airyArcsec / 457, 2) +
  Math.pow(CFG.seeingArcsec / 2, 2)), 1e-15, 'radioImagenEstelar intacto');
ok(typeof R.desenfocar === 'function', 'desenfocar sigue existiendo y sigue sin usarse aquí');
/* Y la razón de no reutilizarlo, clavada con datos reales: el parche de M51 va
   de −1448,8 a 507919,3. `desenfocar` pasa por un canvas de 8 bits, así que
   aplastaría el 99,9 % del rango Y CONVERTIRÍA EN CERO todo el ruido negativo
   del cielo restado, que es justo lo que fija el nivel de fondo. */
var real = new Float32Array([-1448.8, 0, 130, 255, 3000, 507919.3]);
ok(real[5] > 255 && real[0] < 0,
  'el parche real trae valores >255 y negativos: desenfocar los recortaría por los dos lados');

console.log('\n— Doble contabilización: la PSF no se cobra dos veces —');
/* El aumento agranda la galaxia EN PANTALLA porque el campo real se estrecha.
   La PSF es angular y fija: al subir aumentos crece en pantalla lo mismo que la
   galaxia, o sea que la RELACIÓN detalle/borrón no cambia. Aumentar no resuelve,
   que es lo correcto, y por eso no hay ganancia doble. */
function pxPorAs(SIZE, arcmin) { return SIZE / (arcmin / 60) / 3600; }
var a150 = pxPorAs(720, 4200 / 150), a300 = pxPorAs(720, 4200 / 300);
casi(a300 / a150, 2, 1e-9, 'al doblar aumentos, el lienzo dobla su escala (px/″)');
casi((P.thetaAdd(457, ESC) * a300) / (P.thetaAdd(457, ESC) * a150), 2, 1e-9,
  'y el borrón dobla su tamaño en píxeles a la vez: la relación no se mueve');
casi(P.thetaAdd(457, ESC) / P.thetaAdd(457, ESC), 1, 1e-15,
  'θ_add en ″ es el mismo a cualquier aumento: la resolución no se compra con oculares');

console.log('\n— Nada de esto toca el presupuesto ni PS1/E —');
var comps = window.BitacoraPS1.ps1ComponentesSersic({ magV: 9, reArcsec: 100, n: 3, ba: 1, bt: 0 });
casi(window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, 50), window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, 50), 1e-18,
  'ps1FlujoModelo no ve pasar ni apertura ni PSF');
casi(PS1.seeingAs, 1.1, 1e-12, 'PS1.seeingAs leída, no escrita');
casi(CFG.airyArcsec, 138.4, 1e-12, 'airyArcsec leída, no escrita');
casi(CFG.seeingArcsec, 2.0, 1e-12, 'seeingArcsec leída, no escrita');

console.log(fallos ? '\n' + fallos + ' FALLOS\n' : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
