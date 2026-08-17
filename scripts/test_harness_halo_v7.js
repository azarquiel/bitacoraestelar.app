#!/usr/bin/env node
/* Tests del ARNÉS de diagnóstico v7 (E0). No prueban el render: prueban el
   instrumento con el que se va a medir el render, porque un arnés que miente
   convierte los tres defectos en tres números falsos.

     1. Determinismo: dos ejecuciones con la misma semilla dan lo mismo.
     2. Exactitud: se le inyecta un perfil analítico y tiene que devolver su
        mu(r) con menos de 0,01 mag de error.
     3. Los dos taps existen y están donde dicen: el físico ANTES de toda
        atenuación perceptual, el perceptual DESPUÉS.

   node scripts/test_harness_halo_v7.js */
'use strict';

var H = require('./harness_halo_v7.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* ── 1. El estimador de anillos mide lo que dice medir ───────────────────── */
console.log('Exactitud del estimador (§E0.2):');

/* Perfil analítico exponencial en flujo por arcsec². Se elige exponencial y no
   King porque su media por anillo tiene forma cerrada trivial por integración
   1D, así que el patrón de referencia no comparte código con lo medido. */
var SIZE = 512, ARCMIN = 20;
var asPorPx = ARCMIN * 60 / SIZE;
var I0 = 3e-7, hAs = 90;
function perfilAnalitico(rAs) { return I0 * Math.exp(-rAs / hAs); }

var campo = new Float32Array(SIZE * SIZE);
var cen = SIZE / 2;
for (var y = 0; y < SIZE; y++) {
  for (var x = 0; x < SIZE; x++) {
    var dx = (x - cen) * asPorPx, dy = (y - cen) * asPorPx;
    campo[y * SIZE + x] = perfilAnalitico(Math.sqrt(dx * dx + dy * dy));
  }
}

var geom = { size: SIZE, arcmin: ARCMIN, radioPropio: function (dx, dy) {
  return Math.sqrt(dx * dx + dy * dy); } };
var anillos = H.anillos(campo, geom, { r0As: 20, r1As: 300, n: 28 });

// Media analítica del anillo: 2·int(I(r)·r dr) / (r1²-r0²), por Simpson fino.
function mediaAnalitica(r0, r1) {
  var m = 2000, h = (r1 - r0) / m, s = 0;
  for (var i = 0; i <= m; i++) {
    var r = r0 + i * h, w = (i === 0 || i === m) ? 1 : (i % 2 ? 4 : 2);
    s += w * perfilAnalitico(r) * r;
  }
  return (s * h / 3) * 2 / (r1 * r1 - r0 * r0);
}

var peor = 0, peorEn = 0;
anillos.forEach(function (a) {
  var muTeo = -2.5 * Math.log10(mediaAnalitica(a.r0As, a.r1As));
  var d = Math.abs(a.mu - muTeo);
  if (d > peor) { peor = d; peorEn = a.rAs; }
});
ok(peor < 0.01, 'mu(r) de un perfil conocido, error máximo ' + peor.toFixed(4) +
  ' mag (en r = ' + peorEn.toFixed(0) + '")');
ok(anillos.length === 28 && anillos[0].n > 0, 'los anillos salen poblados y en el número pedido');

/* El detector de escalones tiene que detectar escalones: se le da el mismo
   perfil liso con y sin un salto de 0,2 mag metido a mano. Sin esta prueba, un
   detector roto diría «no hay codos» y cerraría D3 en falso. */
var liso = [], conSalto = [];
for (var q = 1; q <= 60; q++) {
  var rq = q * 5, muq = 20 + 2.5 * Math.log10(1 + rq / 40);
  liso.push({ rAs: rq, mu: muq });
  conSalto.push({ rAs: rq, mu: muq + (q > 30 ? 0.2 : 0) });
}
/* El detector se usa por COMPARACIÓN —el perfil sospechoso contra su forma
   lisa de referencia—, así que lo que se le exige es separar los dos casos con
   holgura, no un valor absoluto: un perfil curvo muestreado en pasos finitos
   tiene segunda diferencia propia (0,011 mag aquí) y no es un escalón. */
var eLiso = H.escalones(liso), eSalto = H.escalones(conSalto);
ok(eSalto.peor > 10 * eLiso.peor, 'el detector separa un salto de 0,2 mag de la curvatura ' +
  'propia del perfil (' + eSalto.peor.toFixed(4) + ' vs ' + eLiso.peor.toFixed(4) + ' mag)');
ok(Math.abs(eSalto.rAs - 155) < 10, 'y lo localiza donde está (r = ' +
  eSalto.rAs.toFixed(0) + '", salto en 155")');

/* ── 2. Determinismo ─────────────────────────────────────────────────────── */
console.log('\nDeterminismo (§E0.4):');
var V1 = H.medir(H.cumulo('NGC 6205'), { D: 200, MAG: 146, sqm: 21.5, realization: 0 });
var V2 = H.medir(H.cumulo('NGC 6205'), { D: 200, MAG: 146, sqm: 21.5, realization: 0 });
ok(JSON.stringify(V1) === JSON.stringify(V2),
  'dos medidas con la misma semilla son idénticas');

/* ── 3. Los taps están donde dicen ───────────────────────────────────────── */
console.log('\nLos dos taps (§E0.2):');
ok(V1.fisico && V1.perceptual, 'la medida trae tap físico y tap perceptual');
/* La referencia exacta es <I>(r) del modelo, no el campo crudo: la media
   muestral de un campo lognormal cae por debajo de su media verdadera (medido:
   4 % en los anillos internos), así que comparar los dos taps entre sí haría
   parecer bug lo que es el estimador. Contra el modelo la desigualdad sí es
   estricta: la capa perceptual solo multiplica por s <= 1. */
var acotado = V1.perceptual.every(function (a, i) {
  return !(a.I > 0) || a.I <= V1.modelo[i].I * (1 + 1e-9);
});
ok(acotado, 'el tap perceptual nunca supera al modelo: la percepción solo resta');
/* La firma que separa los taps es Cmin, no el cielo: el fondo entra también en
   la FÍSICA por m_lim,sky, así que empeorar el cielo mueve legítimamente los
   dos taps. Lo que el tap físico no puede notar es la capa perceptual. */
// Un anillo con luz de verdad: el que contiene r_h. El del medio de la lista
// puede caer más allá del cúmulo y comparar dos ceros.
var iMedio = 0;
while (iMedio < V1.fisico.length - 1 && V1.fisico[iMedio].r1As < V1.rhAs) iMedio++;
var Vplana = H.medir(H.cumulo('NGC 6205'),
  { D: 200, MAG: 146, sqm: 21.5, realization: 0, perceptual: false });
ok(Vplana.fisico[iMedio].I === V1.fisico[iMedio].I,
  'el tap físico no se entera de la capa perceptual (mismo flujo con perceptual on/off)');
var Vciudad = H.medir(H.cumulo('NGC 6205'), { D: 200, MAG: 146, sqm: 18.5, realization: 0 });
ok(Vciudad.perceptual[iMedio].I < V1.perceptual[iMedio].I,
  'el tap perceptual se hunde con el cielo urbano (' +
  Vciudad.perceptual[iMedio].I.toExponential(2) + ' < ' +
  V1.perceptual[iMedio].I.toExponential(2) + ')');

/* ── 4. El arnés sabe de dónde sale cada factor ──────────────────────────── */
console.log('\nOrigen de los factores (§E0.1b):');
ok(V1.factores && V1.factores.cielo && V1.factores.halo,
  'la medida declara el factor del cielo y el del halo por separado');
ok(typeof V1.factores.cielo.origen === 'string' && V1.factores.cielo.origen.length > 0,
  'cada factor dice qué función lo produjo (cielo: ' + (V1.factores.cielo || {}).origen + ')');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
