#!/usr/bin/env node
/* E1 · El difuso del cúmulo entra por la MISMA cadena fotométrica que el cielo.

   Los tres tests del documento de tareas, con una precisión sobre el enunciado
   que la medida obligó a hacer explícita:

     El render no trabaja en el marco del OJO, trabaja en el del CIELO. pintarFot
     pinta el objeto como incremento de contraste sobre Fcielo (sin atenuar) y
     mete la pupila una sola vez, en el fondo (SBe) y en el umbral (Cmin) —lo
     dice su propio comentario: «Ningún motor que produzca un Fobj debe volver a
     aplicarlo, o lo contaría dos veces»—. Así que «el halo recibe el mismo dim
     que el cielo» no puede comprobarse buscando un factor dim en el flujo del
     halo: se comprueba viendo que halo y cielo viven en el MISMO marco, es
     decir, que su contraste no se mueve cuando se mueve la pupila.

   Por eso el test 1 mide Δμ_halo − Δμ_cielo (que es lo mismo que Δμ_halo ==
   Δμ_cielo del documento, sea cual sea el marco: los términos de pupila se
   cancelan) sobre el campo PINTADO, no sobre la tabla: sobre la tabla la
   igualdad sería una identidad algebraica y el test no podría fallar nunca.

   node scripts/test_halo_v7_e1.js */
'use strict';

var H = require('./harness_halo_v7.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var SQM = 21.5, D = 200, CAMPO = { size: 512 };

/* m_res(r) leída de la tabla igual que la lee el render (mResEn). Fuera de r_t
   no vale 0 sino Infinity: allí no hay aglomeración, todo se resuelve. */
function mResEn(m, rAs) {
  var t = m.tabla, ult = t.r.length - 1;
  if (!(rAs >= 0) || rAs >= t.r[ult]) return Infinity;
  var u = rAs / t.paso, i = Math.floor(u), f = u - i;
  var a = t.mRes[i], b = t.mRes[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a * (1 - f) + b * f;
}

function medir(id, cfg) {
  var base = { D: D, sqm: SQM, realization: 0, size: CAMPO.size };
  Object.keys(cfg).forEach(function (k) { base[k] = cfg[k]; });
  var cum = H.cumulo(id);
  // Campo fijo entre las dos medidas de un par: si cambia, cambian el píxel y
  // con él Omega, y ya no se estaría comparando lo mismo.
  if (base.arcmin == null) base.arcmin = 2.4 * (cum.rh * 60) / 60;
  return H.medir(cum, base);
}

/* ── Test 1 · Invariancia del contraste físico del difuso bajo M ──────────── */
console.log('E1.1 · el halo y el cielo se atenúan lo mismo (tap físico):');

[['NGC 6205', 146, 514], ['NGC 6205', 100, 300],
 ['NGC 104', 146, 514], ['NGC 104', 100, 300]].forEach(function (caso) {
  var id = caso[0], MA = caso[1], MB = caso[2];
  var A = medir(id, { MAG: MA }), B = medir(id, { MAG: MB });

  /* El difuso SÍ cambia con M por una razón legítima: al subir aumentos el
     fondo local se oscurece, m_lim,sky se hace más profunda y más estrellas
     salen del campo no resuelto para dibujarse una a una. Ese trozo se calcula
     aparte —de la m_res tabulada y de la S1 de la población— y se resta. Lo que
     queda es lo que este test persigue: cualquier OTRA dependencia de M en el
     flujo del halo, que solo puede venir de un factor de pupila mal puesto.

     Restar no lo hace circular: la predicción sale de la tabla y la medida, del
     campo PINTADO. Un dim aplicado en el bucle de píxeles no está en la tabla y
     aparecería entero en el residuo. */
  /* Lo que explica m_res se resta usando <I>(r) del modelo promediado sobre los
     MISMOS píxeles (`modelo`), no S1 evaluada en el radio medio del anillo:
     dentro de un anillo del núcleo, Sigma y m_res varían tanto que evaluar en el
     radio medio deja un residuo de 0,1 mag que es del promediado, no del render.

     Queda entonces la razón pintado/modelo de cada medida. Es adimensional y
     vale 1 salvo el sesgo muestral de la lognormal; lo que este test exige es
     que NO se mueva con M. Un factor de pupila colado en el bucle de píxeles
     está en el pintado y no en el modelo, así que aparecería aquí entero: entre
     146× y 514× dim cambia ×12, o sea 2,7 mag. */
  var pesoA = 0, pintA = 0, pesoB = 0, pintB = 0, usados = 0, peorBruto = 0;
  for (var i = 0; i < A.fisico.length; i++) {
    var a = A.fisico[i], b = B.fisico[i];
    if (!(a.I > 0) || !(b.I > 0) || !(a.n > 100)) continue;
    if (!(A.modelo[i].I > 0) || !(B.modelo[i].I > 0)) continue;
    // Δμ_halo − Δμ_cielo en bruto: los dos medidos contra el flujo de cielo de
    // SU medida. Se anota para el informe, no es lo que decide el test.
    var d = -2.5 * Math.log10((b.I / B.Fcielo) / (a.I / A.Fcielo));
    if (Math.abs(d) > peorBruto) peorBruto = Math.abs(d);
    usados++;
    pesoA += A.modelo[i].I * a.n; pintA += a.I * a.n;
    pesoB += B.modelo[i].I * b.n; pintB += b.I * b.n;
  }
  var razonA = pintA / pesoA, razonB = pintB / pesoB;
  var deriva = Math.abs(-2.5 * Math.log10(razonB / razonA));
  ok(usados > 5 && deriva <= 0.01, id + ' ' + MA + '× vs ' + MB + '×: la razón ' +
    'pintado/modelo no se mueve con M: ' + razonA.toFixed(4) + ' → ' + razonB.toFixed(4) +
    ' (' + deriva.toFixed(5) + ' mag; el Δμ bruto llega a ' + peorBruto.toFixed(3) +
    ' y lo explica m_res)');
});

/* ── Test 2 · Escalado físico del grano: sigma² = Sigma·S2/Omega ──────────── */
console.log('\nE1.2 · el grano sigue la ley sigma² = Sigma·S2/Omega:');

/* Dos aumentos con el campo real de cada uno (campo verdadero = campo aparente
   del ocular / M), que es lo que mueve el píxel y con él Omega. Sin esto Omega
   no depende de M y el test no probaría el escalado, solo la fórmula. */
var AFOV = 68;
/* El tercer caso lleva el lienzo a 256 px a propósito: allí el píxel (43 arcsec²)
   es más grande que el beam (4,7) y Omega pasa a ser el píxel. Sin él, los dos
   aumentos caen en el régimen de beam y el test no probaría el max() de Omega,
   que es justo lo que hace que el grano se alise al alejar el zoom. */
[['NGC 6205', 146, 1024], ['NGC 6205', 514, 1024], ['NGC 104', 146, 1024],
 ['NGC 104', 514, 1024], ['NGC 6205', 146, 256]].forEach(function (caso) {
  var id = caso[0], M = caso[1];
  var m = medir(id, { MAG: M, arcmin: AFOV * 60 / M, size: caso[2] });
  var rc = m.rcAs;

  /* (a) La LEY, en la tabla y sin ruido de estimador: sigma(r)² == Sigma(r)·
     S2(m_res+delta)/Omega, con Omega recalculado aquí desde la apertura y la
     escala de píxel de ESTE aumento. Es la parte que depende de M. */
  var peorLey = 0, peorLeyEn = 0, nodos = 0;
  for (var k = 1; k < m.tabla.r.length; k++) {
    var rk = m.tabla.r[k];
    if (rk < 0.5 * rc || rk > 3 * rc) continue;
    var teo = Math.sqrt(m.sigmaEn(rk) * m.S2(m.tabla.mRes[k] + m.delta) / m.omegaBeam);
    if (!(teo > 0) || !(m.tabla.sigma[k] > 0)) continue;
    nodos++;
    var relL = Math.abs(m.tabla.sigma[k] / teo - 1);
    if (relL > peorLey) { peorLey = relL; peorLeyEn = rk; }
  }
  ok(nodos >= 10 && peorLey <= 1e-9, id + ' ' + M + '×: sigma tabulada == Sigma·S2/Omega ' +
    'en ' + nodos + ' nodos de 0,5–3 r_c (error máx ' + peorLey.toExponential(1) +
    ' en r = ' + peorLeyEn.toFixed(0) + '", Omega = ' + m.omegaBeam.toFixed(2) +
    ' arcsec², píxel = ' + m.areaPx.toFixed(2) + ')');

  /* (b) Y que el campo PINTADO lleva esa amplitud, no otra: la anchura medida
     píxel a píxel, dividida por la que la tabla pidió en ese mismo píxel, tiene
     que valer 1. Normalizado así no hay promediado radial de por medio. */
  /* El error del estimador va con las CELDAS de grano independientes, no con los
     píxeles: la celda mide fwhm/2 de lado y a 514× cabe en ella media docena de
     píxeles, que no aportan medidas nuevas. Con eso, el 5 % por anillo del
     documento se cumple en el conjunto de la corona (abajo) y por anillo se
     exige lo que el estimador puede dar, 3 sigma. */
  var celda = Math.max(m.areaPx, (m.fwhmAs / 2) * (m.fwhmAs / 2));
  var peor = 0, peorEn = 0, vistos = 0, fuera = 0;
  m.granoEn(0.5 * rc, 3 * rc, 8).forEach(function (a) {
    // El mínimo de píxeles es solo para no medir sobre un puñado; la exigencia
    // real la pone la tolerancia de 3 sigma, que ya sabe cuántos hay.
    if (!(a.n > 80) || !(a.Imodelo > 0) || !(a.sNorm > 0)) return;
    vistos++;
    var nEf = a.n * m.areaPx / celda, tol = 3 / Math.sqrt(2 * nEf);
    var rel = Math.abs(a.sNorm - 1);
    if (rel > tol) fuera++;
    if (rel > peor) { peor = rel; peorEn = a.rAs; }
  });
  var corona = m.granoEn(0.5 * rc, 3 * rc, 1)[0];
  ok(vistos >= 4 && fuera === 0 && Math.abs(corona.sNorm - 1) <= 0.05,
    id + ' ' + M + '×: la amplitud pintada es la pedida — corona entera ' +
    (100 * Math.abs(corona.sNorm - 1)).toFixed(1) + ' %, y ningún anillo de los ' +
    vistos + ' se sale de 3 sigma (el peor, ' + (100 * peor).toFixed(1) + ' % en r = ' +
    peorEn.toFixed(0) + '")');
});

// Y que Omega manda de verdad: al subir M el píxel encoge, el grano se reparte
// en celdas menores y su amplitud sube. Es la física de "subir aumentos saca el
// grano", no un aspecto que se elija.
var g146 = medir('NGC 6205', { MAG: 146, arcmin: AFOV * 60 / 146, size: 1024 });
var g514 = medir('NGC 6205', { MAG: 514, arcmin: AFOV * 60 / 514, size: 1024 });
var rBase = 1.5 * g146.rcAs;
function sigmaEnR(m, r) {
  var a = m.granoEn(0.9 * r, 1.1 * r, 1)[0];
  return a.sigma;
}
var razonMedida = sigmaEnR(g514, rBase) / sigmaEnR(g146, rBase);
// La ley completa, no solo Omega: S2 también cambia porque m_res cambia con M.
var s2a = g146.S2(mResEn(g146, rBase) + g146.delta);
var s2b = g514.S2(mResEn(g514, rBase) + g514.delta);
var razonTeo = Math.sqrt((s2b / s2a) * (g146.omegaBeam / g514.omegaBeam));
ok(Math.abs(razonMedida / razonTeo - 1) <= 0.05,
  'al pasar de 146× a 514× la amplitud del grano sube ×' + razonMedida.toFixed(3) +
  ', la ley pide ×' + razonTeo.toFixed(3) + ' (Omega ' + g146.omegaBeam.toFixed(1) +
  ' → ' + g514.omegaBeam.toFixed(1) + ' arcsec²)');

/* ── Test 3 · Halo y cielo beben de la MISMA llamada ──────────────────────── */
console.log('\nE1.3 · un solo origen para la ley (no dos copias):');

var uno = medir('NGC 6205', { MAG: 146 });
var ctxIndep = require('../resources/js/bitacora-gaia-render.js') ||
  global.window.BitacoraGaiaRender;
var R = global.window.BitacoraGaiaRender;
var cieloIgual = {
  pupilaSalida: D / 146, pupilaOjo: 7, sqm: SQM, transmision: 0.9,
  aumentos: 146, perceptual: true
};
var ctxCielo = R.ctxFotometrico(cieloIgual);          // el que usa pintarFot
ok(uno.ctxHalo.dim === ctxCielo.dim && uno.ctxHalo.T === ctxCielo.T &&
   uno.ctxHalo.Fcielo === ctxCielo.Fcielo,
  'el contexto del halo trae el mismo dim, T y Fcielo que el del fondo ' +
  '(dim = ' + ctxCielo.dim.toFixed(5) + ')');
ok(uno.ctxHalo.Fcielo === Math.pow(10, -0.4 * SQM),
  'y ese Fcielo es el del cielo SIN atenuar: halo y fondo comparten marco');
ok(Math.abs(uno.factores.halo.valor - 1) < 0.05,
  'el flujo pintado no lleva ningún factor extra sobre <I>(r) (razón ' +
  uno.factores.halo.valor.toFixed(4) + ')');

/* La prueba dura del marco común: mover la pupila del OJO cambia dim ×4 sin
   tocar ni telescopio ni cielo. Si el halo llevase la pupila metida en el flujo
   y el cielo no (o al revés), el contraste físico se movería. */
var ojoGrande = medir('NGC 6205', { MAG: 146, pupilaOjo: 7 });
var ojoChico = medir('NGC 6205', { MAG: 146, pupilaOjo: 3.5 });
var peorPupila = 0;
for (var k = 0; k < ojoGrande.fisico.length; k++) {
  var p = ojoGrande.fisico[k], q = ojoChico.fisico[k];
  if (!(p.I > 0) || !(q.I > 0)) continue;
  if (Math.abs(mResEn(ojoGrande, p.rAs) - mResEn(ojoChico, p.rAs)) > 1e-9) continue;
  var dd = Math.abs(-2.5 * Math.log10((q.I / ojoChico.Fcielo) / (p.I / ojoGrande.Fcielo)));
  if (dd > peorPupila) peorPupila = dd;
}
ok(peorPupila <= 0.01, 'partir la pupila del ojo (dim ' + ojoGrande.dim.toFixed(4) +
  ' → ' + ojoChico.dim.toFixed(4) + ') no mueve el contraste físico: ' +
  peorPupila.toFixed(5) + ' mag');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
