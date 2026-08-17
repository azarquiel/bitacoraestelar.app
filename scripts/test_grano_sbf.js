#!/usr/bin/env node
/* Grano SBF · bugfix v8 — la textura del campo no resuelto.

   v7 dejó registrado que `s_grano` valía 0 en las 18 corridas de su matriz y que
   la especificación describía S2 como «toda la textura del halo». Un término
   siempre nulo puede ser una desconexión o una ley dura, y hasta separarlas no se
   podía tocar nada. Este archivo fija lo que v8 midió y lo que v8 cambió.

   Lo que NO hace: comprobar que el grano se ve. No se ve, y eso también está
   asertado aquí con el número medido — el criterio de v7 «el grano desaparece
   antes que la mancha» se cumplía sobre un conjunto vacío, y un test que solo
   repita el vacío no es evidencia (ADR 0004).

     node scripts/test_grano_sbf.js */
'use strict';

var A = require('./harness_grano_sbf.js');
var H = require('./harness_halo_v7.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) console.log('  ok   ' + etiqueta);
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(actual, esperado, tolRel, etiqueta) {
  var d = Math.abs(actual - esperado) / Math.abs(esperado || 1);
  ok(d <= tolRel, etiqueta + ' (' + actual.toExponential(3) + ' vs ' +
    esperado.toExponential(3) + ', ' + (100 * d).toFixed(2) + ' %)');
}

var M13 = A.cumulo('NGC 6205');
var EQ = { D: 200, MAG: 146, sqm: 21.5, realization: 0 };

/* ── G1 · S2 llega a σ y al campo crudo ──────────────────────────────────────
   El trazador multiplica S2 por k. σ = √(Σ·S2/Ω) debe ir con √k EXACTAMENTE: si
   se quedase quieto, S2 estaría desconectado de la Capa 3 y no habría ley
   perceptual que discutir. */
console.log('\nG1 · el trazador de S2 mueve σ y el campo crudo:');
var c1 = A.corrida(M13, EQ, 1);
var c10 = A.corrida(M13, EQ, 10);
var c100 = A.corrida(M13, EQ, 100);
casi(c10.sigmaMax / c1.sigmaMax, Math.sqrt(10), 1e-6, 'σ_max va con √k para k = 10');
casi(c100.sigmaMax / c1.sigmaMax, 10, 1e-6, 'σ_max va con √k para k = 100');
ok(c1.varCrudo > 0, 'el campo crudo tiene varianza (' + c1.varCrudo.toExponential(2) + ')');
/* En el campo PINTADO la huella de S2 no es un factor sino un sumando: la
   anchura de la lognormal es s² = ln(1 + σ²/⟨I⟩²), y con σ ≫ ⟨I⟩ —el régimen del
   halo, menos de una estrella no resuelta por beam— multiplicar S2 por 10 le suma
   ln 10. Que salga esa constante y no otra es la prueba de que lo medido en el
   lienzo crudo viene de S2 y no de la malla del grano ni del muestreo. */
casi((c100.varCrudo - c1.varCrudo) / 2, Math.LN10, 0.02,
  'y en el campo crudo cada década de S2 suma ln 10 a la anchura logarítmica');

/* ── G2 · s_grano no es un término muerto ────────────────────────────────────
   La comprobación que v7 pedía: que exista un k con `s_grano` > 0 y con píxeles
   distintos en el lienzo. Sin ella, `dI · s_grano` podría borrarse del render sin
   que ningún test se enterase — que es la definición de término desconectado.
   El k que hace falta se imprime: es la distancia real a la que está la ley. */
console.log('\nG2 · s_grano se enciende y pinta, con S2 suficientemente grande:');
var kMin = null, subida = true, prev = -1;
[1, 10, 100, 1e3, 1e4].forEach(function (k) {
  var c = A.corrida(M13, EQ, k);
  if (kMin === null && c.sGranoMax > 0) kMin = k;
  if (c.sGranoMax < prev) subida = false;
  prev = c.sGranoMax;
});
var cAlto = A.corrida(M13, EQ, 1e4);
ok(kMin !== null, 'existe un factor de S2 que enciende el grano' +
  (kMin ? ' (k = ' + kMin.toExponential(0) + ')' : ''));
ok(subida, 's_grano crece monótonamente con S2');
ok(cAlto.sGranoMax > 0.5, 'y llega a encenderse del todo: s_grano = ' +
  cAlto.sGranoMax.toFixed(3) + ' con k = 1e4');
ok(Math.abs(cAlto.firma - c1.firma) / c1.firma > 0.01,
  'y el lienzo cambia cuando el grano se pinta (' +
  (100 * (cAlto.firma - c1.firma) / c1.firma).toFixed(1) + ' % de flujo pintado)');
ok(c1.sGranoMax === 0,
  'HALLAZGO, no regresión: con S2 real el grano sigue sin pintarse en M13/200 mm 146×');

/* ── G3 · la escala perceptual del grano no es el beam ───────────────────────
   Una textura no es un elemento aislado del tamaño del beam: es un campo
   aleatorio que el ojo integra sobre un parche. Promediar n celdas divide la
   amplitud por √n y a la vez baja el umbral, porque H2c favorece al elemento
   grande. El óptimo de ese compromiso es θ* = θ_R/M —la escala a la que el
   término de Ricco vale 1— y es lo que el render debe usar. Sin constantes
   nuevas: θ_R y M ya estaban en la ley. */
console.log('\nG3 · el grano se juzga en la escala de integración, no en el beam:');
var m = H.medir(M13, EQ);
ok(typeof R.thetaRiccoArcmin === 'function', 'la escala de Ricco está expuesta');
if (typeof R.thetaRiccoArcmin === 'function') {
  var thR = R.thetaRiccoArcmin(m.ctxHalo.SBe);
  casi(m.thGranoAs, Math.max(m.thBeamAs, 60 * thR / EQ.MAG), 1e-9,
    'θ_grano = max(θ_beam, θ_R/M)');
  ok(m.thGranoAs > m.thBeamAs,
    'y con este equipo la integración es mayor que el beam (' +
    m.thGranoAs.toFixed(1) + '" contra ' + m.thBeamAs.toFixed(1) + '")');
  casi(m.atenGrano, m.thBeamAs / m.thGranoAs, 1e-9,
    'la amplitud juzgada baja como θ_beam/θ_grano (√n celdas)');
  /* Y el cambio de escala ACERCA el grano al umbral: si no lo hiciera, el óptimo
     estaría mal calculado y la ley nueva sería un rodeo sin efecto. */
  ok(m.razonGrano > m.razonBeam,
    'juzgar en la escala de integración acerca el grano al umbral (×' +
    (m.razonGrano / m.razonBeam).toFixed(1) + ')');
  /* Y θ* = θ_R/M es de verdad el máximo, no una escala cualquiera mayor que el
     beam: se contrasta contra el barrido numérico del arnés, que no sabe nada de
     la fórmula. El paso del barrido es 1/4 de octava, así que coincidir dentro
     de ese paso es todo lo que se le puede pedir. */
  var b = A.barridoEscalas(m, m.rhAs, A.cieloDe(EQ));
  var mejor = b.reduce(function (a, x) { return x.razon > a.razon ? x : a; }, b[0]);
  ok(Math.abs(Math.log2(mejor.thAs / m.thGranoAs)) <= 0.25,
    'y θ* coincide con el máximo del barrido numérico (' + mejor.thAs.toFixed(1) +
    '" contra ' + m.thGranoAs.toFixed(1) + '")');
}

/* ── G4 · la fotometría no se entera ─────────────────────────────────────────
   La ley nueva toca la DETECTABILIDAD, no el campo. ⟨I⟩ y σ tienen que seguir
   siendo Σ·S1campo y √(Σ·S2campo/Ω) exactos —los momentos del campo con la banda
   de transición dentro—, y el flujo pintado seguir conservándose.
   Este es el guardián de ADR 0003: nada de arreglar apariencia moviendo flujo. */
console.log('\nG4 · ⟨I⟩ y σ siguen siendo las magnitudes físicas de la Capa 3:');
var pob = C.poblacionCacheada(M13, 0);
var delta = C.config.delta;
var peorI = 0, peorS = 0;
for (var i = 1; i < m.tabla.r.length; i += 17) {
  var rAs = m.tabla.r[i], s = pob.sigma(rAs);
  if (!(s > 0) || !isFinite(m.tabla.mRes[i])) continue;
  var mr = m.tabla.mRes[i];
  var Iesp = s * pob.S1campo(mr, delta);
  var sEsp = Math.sqrt(s * pob.S2campo(mr, delta) / m.omegaBeam);
  peorI = Math.max(peorI, Math.abs(m.tabla.I[i] - Iesp) / Iesp);
  peorS = Math.max(peorS, Math.abs(m.tabla.sigma[i] - sEsp) / sEsp);
}
ok(peorI < 1e-12, '⟨I⟩(r) = Σ·S1campo(m_res) exacto (peor ' + peorI.toExponential(1) + ')');
ok(peorS < 1e-12, 'σ(r) = √(Σ·S2campo/Ω) exacto (peor ' + peorS.toExponential(1) + ')');

/* ── G5 · qué hace el cielo ──────────────────────────────────────────────────
   Se comprueba sobre la RAZÓN σ/umbral y no sobre `s_grano`, que hoy es 0: un
   criterio evaluado sobre el conjunto vacío no verifica nada (lección 6 de v7).

   HALLAZGO DE v8, contra lo que decía la prosa de la especificación. Esta
   afirmaba que «en cielo urbano queda mancha, no mancha granulada», apoyándose en
   que Cmin(θ_grano) > Cmin(θ_mancha). Lo primero es cierto y sigue asertado; lo
   segundo NO se sigue de ello, porque el umbral no es lo único que se mueve: con
   el cielo sucio `m_lim,sky` se hunde, las estrellas del halo dejan de resolverse
   y CAEN AL CAMPO, así que S2 —y con él σ— sube más deprisa que el umbral. Medido:
   la mancha se aleja de su umbral y el grano se acerca al suyo.

   No es una regresión de v8: `razonBeam` —la misma razón evaluada como la juzgaba
   v7, con el beam como elemento— tiene exactamente el mismo signo. Lo que v7 no
   podía ver es que su criterio se cumplía sobre el conjunto vacío. */
console.log('\nG5 · qué hace el cielo con la mancha y con el grano:');
var claro = H.medir(M13, { D: 200, MAG: 146, sqm: 21.5, realization: 0 });
var sucio = H.medir(M13, { D: 200, MAG: 146, sqm: 18.5, realization: 0 });
function razonHalo(m) {
  var v = 0;
  for (var k = 0; k < m.tabla.r.length; k++) {
    v = Math.max(v, m.tabla.I[k] / (m.ctxHalo.Fcielo * m.ctxHalo.Cmin));
  }
  return v;
}
ok(claro.ctxGrano.Cmin > claro.ctxHalo.Cmin,
  'Cmin(grano) > Cmin(mancha) (' + claro.ctxGrano.Cmin.toExponential(2) + ' contra ' +
  claro.ctxHalo.Cmin.toExponential(2) + ')');
ok(razonHalo(sucio) < razonHalo(claro),
  'de SQM 21,5 a 18,5 la mancha se aleja de su umbral (' +
  razonHalo(claro).toExponential(2) + ' → ' + razonHalo(sucio).toExponential(2) + ')');
ok(sucio.razonGrano > claro.razonGrano,
  'HALLAZGO: y el grano se ACERCA al suyo (' + claro.razonGrano.toExponential(2) +
  ' → ' + sucio.razonGrano.toExponential(2) + '), porque el cielo le regala estrellas');
ok(sucio.razonBeam > claro.razonBeam,
  'y no lo trae v8: con la ley del beam de v7 el signo es el mismo (' +
  claro.razonBeam.toExponential(2) + ' → ' + sucio.razonBeam.toExponential(2) + ')');
ok(sucio.tabla.mRes[1] <= claro.tabla.mRes[1] &&
   mResHalo(sucio) < mResHalo(claro),
  'y la causa se ve en m_res: en el halo baja con el cielo sucio (' +
  mResHalo(claro).toFixed(2) + ' → ' + mResHalo(sucio).toFixed(2) + ')');
function mResHalo(m) {
  var i = Math.round(m.rhAs / m.tabla.paso);
  return m.tabla.mRes[Math.min(i, m.tabla.mRes.length - 1)];
}
var maxHalo = 0;
for (var j = 0; j < claro.tabla.sHalo.length; j++) maxHalo = Math.max(maxHalo, claro.tabla.sHalo[j]);
ok(maxHalo > 0.5, 'la mancha sí supera su umbral (s_halo máx = ' + maxHalo.toFixed(3) +
  '), así que la comparación no es entre dos ceros');

/* ── G6 · el aumento sí mueve el grano ───────────────────────────────────────
   Con la escala de integración, θ* = θ_R/M encoge al subir aumentos y σ_eff sube
   con M. Que la razón responda al aumento es lo que v7 no podía comprobar. */
console.log('\nG6 · el grano responde al aumento:');
var m50 = H.medir(M13, { D: 200, MAG: 50, sqm: 21.5, realization: 0 });
var m400 = H.medir(M13, { D: 200, MAG: 400, sqm: 21.5, realization: 0 });
ok(m400.razonGrano !== m50.razonGrano,
  'la razón del grano no es constante en el aumento (' +
  m50.razonGrano.toExponential(2) + ' a 50× contra ' +
  m400.razonGrano.toExponential(2) + ' a 400×)');
ok(m400.thGranoAs < m50.thGranoAs,
  'y la escala de integración encoge al subir aumentos (' +
  m50.thGranoAs.toFixed(1) + '" → ' + m400.thGranoAs.toFixed(1) + '")');

/* ── G7 · magLimite no lleva seeing, y con SEEING_AS fijo no puede llevarlo ──
   Prioridad 2 del plan de v8: «investigar e implementar SOLO si los datos
   confirman la necesidad». El dato que decide es interno: `FOT.H2C.SEEING_AS` es
   una constante (2″, sin modelo por noche, a propósito), así que un término de
   seeing en magLimite sería un desplazamiento CONSTANTE de la calibración, no un
   comportamiento nuevo. Se registra como hecho, no se implementa. Si alguien
   mete el seeing en magLimite, este test se pone rojo y toca revisar la
   calibración entera, no solo añadir un término. */
console.log('\nG7 · magLimite es ciega al seeing (registrado, no implementado):');
var mlim0 = R.magLimite({ apertura: 200, aumentos: 146, transmision: 0.9, sqm: 21.5, pupilaOjo: 7 });
var guardado = R.fot.H2C.SEEING_AS;
R.fot.H2C.SEEING_AS = 5.0;
var mlim1 = R.magLimite({ apertura: 200, aumentos: 146, transmision: 0.9, sqm: 21.5, pupilaOjo: 7 });
R.fot.H2C.SEEING_AS = guardado;
ok(mlim0 === mlim1, 'cambiar SEEING_AS de 2″ a 5″ no mueve magLimite');
ok(R.fot.H2C.SEEING_AS === 2.0, 'y SEEING_AS sigue siendo la constante de 2″');

console.log(fallos === 0 ? '\nGrano SBF verde' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
