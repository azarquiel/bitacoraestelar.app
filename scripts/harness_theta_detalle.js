#!/usr/bin/env node
/* HARNESS: ¿de dónde sale θ_detalle, y aguanta?

   No toca producción. Mide sobre los parches de PS1 que ya están en la caché del
   proxy (simulador_ocular/cache-ps1), identificados en lib_parches_ps1.js.

   La medida NO es «buscar gradientes». Un gradiente lo produce cualquier cosa:
   ruido, el borde del parche, el anillo de una máscara, una costura de skycell,
   una estrella mal tapada. Lo que se mide es la DESCOMPOSICIÓN DE FOURIER EN
   AZIMUT dentro del plano de la galaxia, que es como se miden los brazos
   espirales de verdad:

     · un brazo de dos ramas es el modo m = 2, y su fase gira con el radio
       (por eso es una ESPIRAL);
     · una costura recta o una barra también dan m = 2, pero con la fase
       CONGELADA: no giran;
     · una estrella residual es un punto, así que reparte energía por igual en
       todos los m, y se delata comparando m = 2 contra el suelo de m altos;
     · el ruido baja como 1/√N al promediar el anillo entero.

   De ahí sale una escala angular medida, no supuesta: si a un radio r manda el
   modo m, la distancia brazo→interbrazo es π·r/m.

   Sin dependencias:  node scripts/harness_theta_detalle.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = window.BitacoraPS1.cfg;
var P = require('./lib_parches_ps1.js')(R);
var G = require('./lib_galaxias_sinteticas.js')(R);

/* Generador secuencial y sembrado: reproducible entre ejecuciones, pero SIN la
   estructura de rejilla que tiene cualquier «ruido» calculado a partir de (x, y).
   Esa rejilla se cuela como modos azimutales coherentes y le inventa brazos al
   test nulo, que es justo lo que el test nulo tiene que descartar. */
function azar(semilla) {
  var s = semilla >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  var u = rnd() || 1e-9, v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

var NAZ = 256, MMAX = 24;            // muestras por anillo y modos que se calculan
var M_SUELO = 8;                     // desde este m para arriba se toma el suelo de ruido

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }

/* ── Muestreo de un anillo en el PLANO de la galaxia ───────────────────────
   Se desproyecta con el b/a y el PA del catálogo: los brazos son circulares en
   el plano del disco, no en el cielo, y sin desproyectar una galaxia inclinada
   se inventa un m = 2 que es sólo su elipticidad. */
function muestrearAnillo(p, rAs, opciones) {
  var fits = p.fits, g = p.gal, ba = g[5] || 1, pa = (g[6] || 0) * Math.PI / 180;
  var af = window.BitacoraPS1.ps1AfinParche(fits, { ra: g[2], dec: g[3], ladoArcmin: p.ladoArcmin }) ||
           { cx: (fits.ancho - 1) / 2, cy: (fits.alto - 1) / 2,
             xe: -fits.ancho / (p.ladoArcmin * 60), xn: 0,
             ye: 0, yn: fits.alto / (p.ladoArcmin * 60) };
  var v = new Float64Array(NAZ), nan = 0;
  for (var k = 0; k < NAZ; k++) {
    var phi = 2 * Math.PI * k / NAZ;
    var a = rAs * Math.cos(phi), b = rAs * ba * Math.sin(phi);   // ″ en el cielo
    var norte = a * Math.cos(pa) - b * Math.sin(pa);
    var este = a * Math.sin(pa) + b * Math.cos(pa);
    var x = af.cx + af.xe * este + af.xn * norte;
    var y = af.cy + af.ye * este + af.yn * norte;
    v[k] = bilineal(fits, x, y, opciones);
    if (!isFinite(v[k])) nan++;
  }
  return { v: v, nan: nan };
}
function bilineal(fits, x, y, o) {
  var x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  if (x0 < 0 || y0 < 0 || x0 + 1 >= fits.ancho || y0 + 1 >= fits.alto) return NaN;
  var d = (o && o.datos) || fits.datos;
  var a = d[y0 * fits.ancho + x0], b = d[y0 * fits.ancho + x0 + 1];
  var c = d[(y0 + 1) * fits.ancho + x0], e = d[(y0 + 1) * fits.ancho + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}

/* ── Fourier en azimut de un anillo ───────────────────────────────────────
   Devuelve la amplitud RELATIVA de cada modo (pico sobre el nivel medio) y la
   fase, que es la que distingue una espiral de una costura. */
function modos(v, cielo) {
  var n = 0, media = 0, k;
  if (cielo) { for (k = 0; k < v.length; k++) v[k] -= cielo; }
  for (k = 0; k < v.length; k++) if (isFinite(v[k])) { media += v[k]; n++; }
  if (n < v.length * 0.8) return null;                 // demasiado hueco: anillo inservible
  media /= n;
  var A = [], fase = [];
  for (var m = 0; m <= MMAX; m++) {
    var re = 0, im = 0, c = 0;
    for (k = 0; k < v.length; k++) {
      if (!isFinite(v[k])) continue;
      var phi = 2 * Math.PI * k / v.length;
      re += v[k] * Math.cos(m * phi); im -= v[k] * Math.sin(m * phi); c++;
    }
    re /= c; im /= c;
    A.push(2 * Math.hypot(re, im) / Math.abs(media));
    fase.push(Math.atan2(im, re));
  }
  var suelo = 0, ns = 0;
  for (m = M_SUELO; m <= MMAX; m++) { suelo += A[m]; ns++; }
  return { A: A, fase: fase, media: media, suelo: suelo / ns };
}

/* Perfil de modos por radio, y de ahí la escala dominante. */
function analizar(p, opciones) {
  var lado = p.ladoArcmin * 60;                        // ″
  var rMax = lado / 2 * 0.85;                          // lejos del borde del parche
  var comps = window.BitacoraPS1.ps1ComponentesSersic({ magV: p.gal[7], reArcsec: p.gal[4], n: p.gal[8],
                                       ba: p.gal[5], bt: p.gal[9] });
  var r25 = G.radioIsofota(comps, 25);
  /* El cielo se resta ANTES de nada. Sin eso la «amplitud relativa» se mide
     contra cielo+galaxia y no significa nada: en los anillos exteriores, donde
     la galaxia ya no llega, el cociente se dispara y el método declara brazos
     donde solo hay fondo. */
  var datos = (opciones && opciones.datos) || p.fits.datos;
  var cielo = window.BitacoraPS1.ps1Cielo(datos, p.fits.ancho, p.fits.alto);
  var sigma = window.BitacoraPS1.ps1SigmaCielo(datos, p.fits.ancho, p.fits.alto, cielo);
  var op = { datos: datos, cielo: cielo };
  var anillos = [], r;
  for (r = Math.max(6, p.gal[4] * 0.3); r <= Math.min(rMax, r25); r *= 1.15) {
    var s = muestrearAnillo(p, r, op);
    var M = modos(s.v, cielo);
    if (!M) continue;
    // Anillo sin galaxia: el brillo medio sobre el cielo no llega ni a 3σ.
    if (!(M.media > 3 * sigma)) continue;
    anillos.push({ r: r, A2: M.A[2], A3: M.A[3], A4: M.A[4], suelo: M.suelo,
                   fase2: M.fase[2], nivel: M.media });
  }
  if (!anillos.length) return null;
  /* La espiral se reconoce por la fase que GIRA con el radio: dφ₂/dln r ≠ 0.
     Una barra, una costura o el borde de una máscara dan m = 2 con la fase
     quieta. Sin este filtro el método confundiría un artefacto recto con brazos. */
  var giro = 0, nGiro = 0;
  for (var i = 1; i < anillos.length; i++) {
    var d = anillos[i].fase2 - anillos[i - 1].fase2;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    giro += Math.abs(d); nGiro++;
  }
  giro = nGiro ? giro / Math.log(anillos[anillos.length - 1].r / anillos[0].r) : 0;
  // El anillo con más señal por encima del suelo de ruido.
  var mejor = anillos[0];
  anillos.forEach(function (a) { if (a.A2 - a.suelo > mejor.A2 - mejor.suelo) mejor = a; });
  return { anillos: anillos, mejor: mejor, giro: giro, r25: r25,
           // distancia brazo→interbrazo del modo m=2 al radio dominante
           thetaDet: Math.PI * mejor.r / 2,
           snr: mejor.A2 / (mejor.suelo || 1e-9) };
}

/* ═══ 1. Las tres fuentes posibles de θ_detalle ═══════════════════════════ */
console.log('\n═══ 1. Las tres fuentes candidatas ═══');
fila(['fuente', 'cómo se calcula', 'unidades', 'si no existe', 'es estructura visual?']);
fila(['A morfológica (catálogo/perfil)', 'r_e·k o D25/k, con k fijo', '″',
  'siempre existe (r_e está)', 'NO: es una escala matemática']);
fila(['B imagen (Fourier azimutal)', 'π·r/m en el anillo de más señal', '″',
  'no hay parche → sin dato', 'SÍ: es el brazo medido']);
fila(['C por componente morfológico', 'bulbo liso / disco con brazos, de B/T y n', '″',
  'B/T está en el catálogo', 'a medias: dice DÓNDE, no CUÁNTO']);

/* ═══ 2. Medida sobre PS1 real ════════════════════════════════════════════ */
console.log('\n═══ 2. Medida sobre los parches de PS1 en caché ═══');
console.log('  ' + P.parches.length + ' parches identificados contra el catálogo por su WCS.');
var CASOS = [
  ['NGC 5194', 'M51, brazos fuertes'],
  ['NGC 5457', 'M101, brazos abiertos'],
  ['NGC 3031', 'M81, brazos marcados'],
  ['NGC 6946', 'brazos fuertes, de cara'],
  ['NGC 598', 'M33, brazos rotos'],
  ['NGC 205', 'dE lisa: CONTROL, no debe dar brazos'],
  ['NGC 147', 'dE lisa: CONTROL'],
  ['NGC 224', 'M31, muy inclinada'],
  ['NGC 891', 'de canto con polvo: CONTROL de artefacto'],
  ['NGC 4594', 'Sombrero, banda de polvo']
];
fila(['galaxia', 'qué es', 'r pico (″)', 'A₂ rel.', 'suelo m≥8', 'S/R', 'giro φ₂ (rad/ln r)', 'θ_detalle (″)']);
var medidos = {};
CASOS.forEach(function (c) {
  var p = P.buscar(c[0]);
  if (!p) { fila([c[0], c[1], 'SIN PARCHE EN CACHÉ', '-', '-', '-', '-', '-']); return; }
  var a = analizar(p);
  if (!a) { fila([c[0], c[1], 'sin anillos válidos', '-', '-', '-', '-', '-']); return; }
  medidos[c[0]] = a;
  fila([c[0], c[1], f(a.mejor.r, 1), f(a.mejor.A2, 4), f(a.mejor.suelo, 4),
    f(a.snr, 2), f(a.giro, 2), f(a.thetaDet, 1)]);
});
console.log('  S/R = A₂ contra el suelo de los modos altos: por debajo de ~2 no hay brazo,');
console.log('  hay ruido. El giro separa espiral (≠0) de barra/costura/máscara (≈0).');

/* ═══ 2b. TEST NULO: una galaxia matemáticamente lisa ═════════════════════
   El control de verdad. Un Sérsic puro no tiene brazos: si la tubería le
   encuentra un m = 2 comparable al de una espiral real, el método no mide
   estructura, mide su propio sesgo. Se prueba además con el b/a y el PA
   EQUIVOCADOS, porque desproyectar mal convierte la elipticidad del objeto en
   un m = 2 falso, y en producción esos dos números vienen del catálogo. */
console.log('\n═══ 2b. Test nulo: galaxia lisa (Sérsic puro + ruido) ═══');
function parcheSintetico(opts) {
  var N = 512, lado = 20, esc = lado * 60 / N;         // ″/px
  var comps = window.BitacoraPS1.ps1ComponentesSersic({ magV: 9, reArcsec: opts.re, n: 4,
                                       ba: opts.ba, bt: 0 });
  var d = new Float64Array(N * N), cielo = 1000, rnd = azar(20260813);
  var escalaCuentas = 1e12;                            // lleva el disco a ~10³ cuentas
  for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
    // Los signos son los de la afín de ps1AfinParche sin WCS: xe = −1/esc,
    // yn = +1/esc. Ponerlos al revés espeja el parche y le mete un m = 2 falso.
    var este = -(x - (N - 1) / 2) * esc, norte = (y - (N - 1) / 2) * esc;
    d[y * N + x] = cielo + escalaCuentas * window.BitacoraPS1.ps1FlujoModelo(comps, opts.pa, norte, este) +
      opts.sigma * gauss(rnd);
  }
  return { fichero: 'sintético', nombre: 'liso', ladoArcmin: lado,
           gal: ['liso', '', 0, 0, opts.re, opts.baCat, opts.paCat, 9, 4, 0, 0, 0],
           fits: { ancho: N, alto: N, datos: d, escalaAs: esc, wcs: null, zpt: NaN } };
}
fila(['caso', 'b/a real', 'b/a supuesto', 'PA real', 'PA supuesto', 'A₂', 'suelo', 'S/R', 'veredicto']);
[['desproyección exacta', 0.6, 0.6, 30, 30],
 ['b/a equivocado 0,6→0,8', 0.6, 0.8, 30, 30],
 ['PA equivocado 30°→50°', 0.6, 0.6, 30, 50],
 ['casi de frente', 0.95, 0.95, 30, 30]].forEach(function (c) {
  var p = parcheSintetico({ re: 240, ba: c[1], baCat: c[2], pa: c[3], paCat: c[4], sigma: 20 });
  var a = analizar(p);
  if (!a) { fila([c[0], c[1], c[2], c[3], c[4], 'sin anillos', '-', '-', '-']); return; }
  fila([c[0], f(c[1], 2), f(c[2], 2), c[3] + '°', c[4] + '°', f(a.mejor.A2, 4),
    f(a.mejor.suelo, 4), f(a.snr, 2), a.snr > 2 ? 'FALSO POSITIVO' : 'limpio']);
});
console.log('  Una galaxia sin brazos ninguno debería dar S/R ≈ 1. Todo lo que suba de 2');
console.log('  aquí es estructura inventada por el método, y en producción el b/a y el PA');
console.log('  vienen del catálogo, o sea que el error de desproyección es la norma.');

/* ═══ 3. Robustez ═════════════════════════════════════════════════════════ */
console.log('\n═══ 3. Robustez de la medida de imagen ═══');
function copiaConRuido(fits, k, sigma) {
  var d = new Float64Array(fits.datos.length), rnd = azar(1234567);
  for (var i = 0; i < d.length; i++) d[i] = fits.datos[i] + k * sigma * gauss(rnd);
  return d;
}
function copiaSuavizada(fits, sigmaPx) {
  // Gaussiana separable: simula MÁS seeing, que es lo que borra la estructura.
  var n = Math.max(1, Math.ceil(3 * sigmaPx)), ker = [], s = 0, i;
  for (i = -n; i <= n; i++) { var w = Math.exp(-i * i / (2 * sigmaPx * sigmaPx)); ker.push(w); s += w; }
  for (i = 0; i < ker.length; i++) ker[i] /= s;
  var tmp = new Float64Array(fits.datos.length), out = new Float64Array(fits.datos.length);
  var W = fits.ancho, H = fits.alto, x, y, j, acc, pes;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    acc = 0; pes = 0;
    for (j = -n; j <= n; j++) { var xx = x + j;
      if (xx < 0 || xx >= W) continue;
      var v = fits.datos[y * W + xx]; if (!isFinite(v)) continue;
      acc += v * ker[j + n]; pes += ker[j + n]; }
    tmp[y * W + x] = pes > 0 ? acc / pes : NaN;
  }
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    acc = 0; pes = 0;
    for (j = -n; j <= n; j++) { var yy = y + j;
      if (yy < 0 || yy >= H) continue;
      var v2 = tmp[yy * W + x]; if (!isFinite(v2)) continue;
      acc += v2 * ker[j + n]; pes += ker[j + n]; }
    out[y * W + x] = pes > 0 ? acc / pes : NaN;
  }
  return out;
}
function tapaBrillantes(fits, umbralSigma) {
  /* Máscara de picos, el equivalente offline de ps1QuitarEstrellas: rellena con
     la mediana local en vez de dejar el agujero, que es la regla ya establecida
     para esta capa. Lo que se comprueba es si la medida sobrevive a los ANILLOS
     que deja la máscara. */
  var cielo = window.BitacoraPS1.ps1Cielo(fits.datos, fits.ancho, fits.alto);
  var sig = window.BitacoraPS1.ps1SigmaCielo(fits.datos, fits.ancho, fits.alto, cielo);
  var d = Float64Array.from(fits.datos), W = fits.ancho, H = fits.alto;
  var lim = cielo + umbralSigma * sig, rad = 4;
  for (var y = rad; y < H - rad; y++) for (var x = rad; x < W - rad; x++) {
    if (!(fits.datos[y * W + x] > lim)) continue;
    var vecinos = [];
    for (var j = -rad; j <= rad; j++) for (var i = -rad; i <= rad; i++) {
      if (i * i + j * j <= rad * rad) continue;
      var v = fits.datos[(y + j) * W + (x + i)];
      if (isFinite(v)) vecinos.push(v);
    }
    vecinos.sort(function (a, b) { return a - b; });
    if (vecinos.length) d[y * W + x] = vecinos[vecinos.length >> 1];
  }
  return d;
}
fila(['galaxia', 'A₂ original', '+ruido ×3', '+seeing ×2', 'con máscara de estrellas', 'θ_det (″) orig → máscara']);
['NGC 5194', 'NGC 3031', 'NGC 205'].forEach(function (n) {
  var p = P.buscar(n);
  if (!p || !medidos[n]) { fila([n, 'sin parche', '-', '-', '-', '-']); return; }
  var cielo = window.BitacoraPS1.ps1Cielo(p.fits.datos, p.fits.ancho, p.fits.alto);
  var sig = window.BitacoraPS1.ps1SigmaCielo(p.fits.datos, p.fits.ancho, p.fits.alto, cielo);
  var aR = analizar(p, { datos: copiaConRuido(p.fits, 3, sig) });
  var aS = analizar(p, { datos: copiaSuavizada(p.fits, 2) });
  var aM = analizar(p, { datos: tapaBrillantes(p.fits, 8) });
  fila([n, f(medidos[n].mejor.A2, 4), f(aR && aR.mejor.A2, 4), f(aS && aS.mejor.A2, 4),
    f(aM && aM.mejor.A2, 4),
    f(medidos[n].thetaDet, 1) + ' → ' + f(aM && aM.thetaDet, 1)]);
});
console.log('  El ruido debe subir el SUELO y dejar A₂ casi igual (el anillo lo promedia).');
console.log('  Más seeing debe BAJAR A₂ (borra estructura), nunca subirla.');
console.log('  La máscara no debe crear brazos donde no los hay (mirar el control liso).');

/* ═══ 4. Contra la escala morfológica ─ ¿acierta el atajo D25/k? ══════════ */
console.log('\n═══ 4. La escala medida contra el atajo morfológico ═══');
fila(['galaxia', 'D25 (′)', 'θ_det medido (″)', 'D25/25 (″)', 'r_e (″)', 'medido/(D25/25)', 'medido/r_e']);
Object.keys(medidos).forEach(function (n) {
  var p = P.buscar(n), a = medidos[n];
  var comps = window.BitacoraPS1.ps1ComponentesSersic({ magV: p.gal[7], reArcsec: p.gal[4], n: p.gal[8],
                                       ba: p.gal[5], bt: p.gal[9] });
  var d25 = 2 * G.radioIsofota(comps, 25) / 60;
  fila([n, f(d25, 1), f(a.thetaDet, 1), f(d25 * 60 / 25, 1), f(p.gal[4], 1),
    f(a.thetaDet / (d25 * 60 / 25), 2), f(a.thetaDet / p.gal[4], 2)]);
});
console.log('  Si la última columna es parecida entre galaxias, la escala morfológica es');
console.log('  un sustituto honesto. Si dispersa, hace falta medirla en la imagen.');

/* ═══ 5. Lo que la medida NO puede confundir ══════════════════════════════ */
console.log('\n═══ 5. Trampas comprobadas ═══');
console.log('  · borde del parche: los anillos se cortan en 0,85·(lado/2) y en r25.');
console.log('  · huecos sin skycell: llegan como NaN y un anillo con >20 % de NaN se descarta.');
console.log('  · costura o barra: dan m = 2 con la fase quieta; se separan por el giro.');
console.log('  · estrella residual: es un punto, sube TODOS los modos; se ve en el suelo m≥8.');
console.log('  · ruido: baja como 1/√' + NAZ + ' al promediar el anillo.');
console.log('  · anillo de máscara: es circular en el cielo, o sea m = 0 tras desproyectar.');
