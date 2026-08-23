#!/usr/bin/env node
/* Test de las Capas 2-4 del modelo de cúmulos: pintarCumulo, en
   resources/js/bitacora-gaia-render.js. Cierra la Fase 2.

   Lo que se comprueba:

     · Conservación (§3.4): lo que se pinta como campo más lo que queda para
       dibujar suma el flujo total del cúmulo, dentro del 1 %.
     · Nivel 2 (§9.2): por anillos, la media del campo reproduce Sigma(r)·S1 y su
       varianza reproduce Sigma(r)·S2/Omega_beam dentro del 10 %.
     · El grano está anclado al CIELO: el mismo trozo de cúmulo tiene el mismo
       grano a dos campos distintos. Hacer zoom lo agranda, no lo redibuja.
     · Nivel 3 (§9.3): duplicar la apertura hunde m_res y vacía el campo.
     · La banda de transición sale como m_eff, y m_eff no vuelve a entrar en
       ninguna cuenta de flujo.

   Sin dependencias ni canvas (pintarCumulo escribe en un Float32Array):
   node scripts/test_cumulo_render.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;
var CATALOGO = global.window.BITACORA_GLOBULARES;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function dentro(actual, esperado, fracc, etiqueta) {
  var r = Math.abs(actual - esperado) / Math.abs(esperado);
  if (r <= fracc) {
    console.log('  ok   ' + etiqueta + ' (' + (r * 100).toFixed(2) + ' %)');
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toPrecision(6) +
      ' ±' + (fracc * 100) + ' %\n         obtenido ' + actual.toPrecision(6) +
      '  (' + (r * 100).toFixed(2) + ' %)');
  }
}

function delCatalogo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}
var M13 = delCatalogo('NGC 6205');

// Equipo de referencia: 200 mm a 100x, cielo oscuro. El mismo de la matriz de
// validación de la especificación (§9.4, fila 2).
function equipo(D, MAG, sqm) {
  return { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9,
           aumentos: MAG, perceptual: true };
}

function pintar(cum, D, MAG, sqm, arcmin, SIZE) {
  var difuso = new Float32Array(SIZE * SIZE);
  var crudo = new Float32Array(SIZE * SIZE);
  var cielo = equipo(D, MAG, sqm);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: arcmin, size: SIZE,
    cielo: cielo, apertura: D, estrellas: [], campoCrudo: crudo
  });
  return { difuso: difuso, crudo: crudo, cielo: cielo, res: res, SIZE: SIZE, arcmin: arcmin };
}

/* ── 1. Conservación: campo + resueltas = flujo total ───────────────────── */
console.log('Conservación del flujo (§3.4):');

var SIZE = 720;
// Campo que cubre el cúmulo entero: r_t de M13 en arcmin, con margen.
var pobM13 = C.poblacionCacheada(M13, 0);
var campoAncho = Math.ceil(2.4 * pobM13.rtAs / 60);
var A = pintar(M13, 200, 100, 21.5, campoAncho, SIZE);
ok(!!A.res, 'pintarCumulo devuelve resultado con el módulo de población cargado');

/* El reparto resuelto/campo se rehace aquí sobre la MISMA rejilla de píxeles,
   con la m_res(r) que el render tabuló. La identidad que se pone a prueba no es
   S1campo + Fdibujado = Ftotal (eso ya lo cierra la Capa 1, exacto), sino que el
   bucle de pintado —área del píxel, radio propio, interpolación de la tabla—
   no pierda ni invente luz al llevarlo al lienzo. */
function repartoEnLienzo(P) {
  var pob = P.res.poblacion, tabla = P.res.tabla, rImg = P.res.radioImagenAs;
  var escv = P.SIZE / (P.arcmin / 60), asPorPx = 3600 / escv;
  var areaPx = asPorPx * asPorPx, cen = P.SIZE / 2;
  var campo = 0, resuelto = 0, total = 0;
  for (var y = 0; y < P.SIZE; y++) {
    for (var x = 0; x < P.SIZE; x++) {
      var rAs = pob.radioPropio(-(x - cen) * asPorPx, -(y - cen) * asPorPx);
      if (rAs >= pob.rtAs) continue;
      var s = pob.sigma(rAs);
      var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
      var mRes = tabla.mRes[i] * (1 - t) + tabla.mRes[i + 1] * t;
      campo += s * pob.S1campo(mRes, rAs, rImg) * areaPx;
      resuelto += s * pob.Fdibujado(mRes, rAs, rImg) * areaPx;
      total += s * pob.Ftotal * areaPx;
    }
  }
  return { campo: campo, resuelto: resuelto, total: total };
}
var rep = repartoEnLienzo(A);
dentro(rep.campo + rep.resuelto, pobM13.Ftotal, 0.01,
  'campo + resueltas = F(V_t) sobre el lienzo entero');
dentro(A.res.Fmedio, rep.campo, 0.01,
  'el campo que pinta el render es el que dice el modelo');
console.log('       reparto a 200 mm/100x: campo ' +
  (100 * rep.campo / rep.total).toFixed(1) + ' %, resueltas ' +
  (100 * rep.resuelto / rep.total).toFixed(1) + ' %');

/* El grano no puede quitar luz, así que una ley que se recorte en cero se lleva
   la media por delante donde sigma > <I> —que en el halo de un globular es TODO
   el halo, con menos de una estrella por beam: una gaussiana recortada inventaba
   el 65 % del flujo—. La lognormal no se recorta, así que el único desvío que
   queda es el del muestreo: la suma de N celdas ruidosas fluctúa, y esa
   fluctuación es física, no un error del modelo. Se compara contra ella, que es
   lo que la hace sensible: un recorte del 65 % son cientos de sigmas. */
function fluctuacionEsperada(P) {
  var pob = P.res.poblacion, tabla = P.res.tabla;
  var escv = P.SIZE / (P.arcmin / 60), asPorPx = 3600 / escv;
  var areaPx = asPorPx * asPorPx, cen = P.SIZE / 2, v = 0;
  for (var y = 0; y < P.SIZE; y++) {
    for (var x = 0; x < P.SIZE; x++) {
      var rAs = pob.radioPropio(-(x - cen) * asPorPx, -(y - cen) * asPorPx);
      if (rAs >= pob.rtAs) continue;
      var s = enTabla(tabla, tabla.sigma, rAs);
      v += s * s * areaPx * areaPx;
    }
  }
  return Math.sqrt(v);
}
var sesgo = A.res.Fpintado - A.res.Fmedio;
var fluct = fluctuacionEsperada(A);
ok(Math.abs(sesgo) < 3 * fluct,
  'el grano no sesga el flujo total: desvío ' +
  (100 * sesgo / A.res.Fmedio).toFixed(2) + ' %, fluctuación esperada ' +
  (100 * fluct / A.res.Fmedio).toFixed(2) + ' % (' +
  (sesgo / fluct).toFixed(2) + ' sigmas)');

/* ── 2. El grano crudo tiene varianza 1 ──────────────────────────────────── */
console.log('\nGrano (SBF):');

var suma = 0, suma2 = 0, cuantos = 0;
for (var gy = 0; gy < 300; gy++) {
  for (var gx = 0; gx < 300; gx++) {
    var g = R.granoEn(12345, gx * 0.37, gy * 0.37, 1.0);
    suma += g; suma2 += g * g; cuantos++;
  }
}
var media = suma / cuantos, varianza = suma2 / cuantos - media * media;
ok(Math.abs(media) < 0.05, 'el grano tiene media nula (' + media.toFixed(4) + ')');
dentro(varianza, 1, 0.10, 'y varianza unidad tras la interpolación bilineal');

/* ── 3. Nivel 2: media y varianza por anillos ────────────────────────────── */
/* Se mide sobre el campo CRUDO —el de antes de la ley visual—, que es donde vive
   la estadística de la LF. Sobre el lienzo no se puede: la ley visual multiplica
   la media por s_halo y el grano por s_grano, y con eso lo que se mediría es el
   desvanecido, no la SBF. Que el desvanecido sea el que debe ser se comprueba
   aparte, en el bloque 3b. */
var B = pintar(M13, 200, 100, 22.0, 20, SIZE);

/* Interpolación de la tabla igual que la del render: comparar con el valor del
   nodo mete un error de hasta el 2 % en el núcleo, donde el perfil cae rápido. */
function enTabla(tabla, v, rAs) {
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  return v[i] * (1 - t) + v[i + 1] * t;
}

function anillo(P, r0As, r1As) {
  var pob = P.res.poblacion, tabla = P.res.tabla;
  var escv = P.SIZE / (P.arcmin / 60), asPorPx = 3600 / escv, cen = P.SIZE / 2;
  var s = 0, n = 0, mediaTeo = 0, logVar = 0, logVarTeo = 0;
  for (var y = 0; y < P.SIZE; y++) {
    for (var x = 0; x < P.SIZE; x++) {
      var rAs = pob.radioPropio(-(x - cen) * asPorPx, -(y - cen) * asPorPx);
      if (rAs < r0As || rAs >= r1As) continue;
      var v = P.crudo[y * P.SIZE + x];
      var Ir = enTabla(tabla, tabla.I, rAs), sr = enTabla(tabla, tabla.sigma, rAs);
      s += v; n++; mediaTeo += Ir;
      /* La varianza se mide en LOGARITMO y contra el <I>(r) del propio píxel.
         Dos razones, las dos necesarias: contra la media del anillo entero lo que
         se mediría es la caída del perfil dentro de él (en 60"-90" pesa más que el
         grano), y la varianza lineal de un campo tan sesgado como éste —sigma
         llega a 3·<I>— es un estimador pésimo: con 5.000 píxeles su propio error
         ronda el 100 %, así que no distingue un modelo bueno de uno malo. La
         varianza de ln(I) es s² = ln(1 + sigma²/<I>²), tiene error sqrt(2/n) y
         dice exactamente lo mismo. */
      var d = Math.log(v) - Math.log(Ir);
      logVar += d * d;
      // ln X - ln<I> = -s²/2 + s·g, así que su cuadrado medio vale s² + s⁴/4.
      var s2 = Math.log(1 + (sr * sr) / (Ir * Ir));
      logVarTeo += s2 + s2 * s2 / 4;
    }
  }
  return { n: n, media: s / n, mediaTeo: mediaTeo / n,
           logVar: logVar / n, logVarTeo: logVarTeo / n };
}

[[60, 90], [120, 180], [240, 320]].forEach(function (par) {
  var a = anillo(B, par[0], par[1]);
  var etq = par[0] + '"-' + par[1] + '" (' + a.n + ' px)';
  dentro(a.media, a.mediaTeo, 0.10, 'anillo ' + etq + ': <I> = Sigma·S1');
  dentro(a.logVar, a.logVarTeo, 0.10, 'anillo ' + etq + ': Var = Sigma·S2/Omega_beam');
});

/* ── 3b. La ley visual: dos escalas angulares, una sola ley ──────────────── */
console.log('\nLey visual (§4.2):');
ok(B.res.cGrano.Cmin > B.res.cHalo.Cmin,
  'Cmin(grano) > Cmin(cúmulo): el grano muere antes que la mancha (x' +
  (B.res.cGrano.Cmin / B.res.cHalo.Cmin).toFixed(0) + ')');
var Bciudad = pintar(M13, 200, 100, 18.5, 20, SIZE);
function sHaloA(P, rAs) { return P.res.tabla.sHalo[Math.round(rAs / P.res.tabla.paso)]; }
ok(sHaloA(Bciudad, 200) < sHaloA(B, 200),
  'con el cielo peor, el halo se desvanece antes (' + sHaloA(B, 200).toFixed(3) +
  ' → ' + sHaloA(Bciudad, 200).toFixed(3) + ')');
ok(sHaloA(B, 30) >= sHaloA(B, 400),
  'y el desvanecido crece hacia fuera, no al revés');
// El lienzo es exactamente <I>·s_halo + dI·s_grano: la ley aplicada, sin sorpresas.
var escvB = SIZE / (B.arcmin / 60), asPxB = 3600 / escvB, cenB = SIZE / 2;
var xB = Math.round(cenB + 60 / asPxB), yB = Math.round(cenB);
var rB = B.res.poblacion.radioPropio(-(xB - cenB) * asPxB, -(yB - cenB) * asPxB);
var IB = enTabla(B.res.tabla, B.res.tabla.I, rB);
var esperadoB = IB * enTabla(B.res.tabla, B.res.tabla.sHalo, rB) +
  (B.crudo[yB * SIZE + xB] - IB) * enTabla(B.res.tabla, B.res.tabla.sGrano, rB);
dentro(B.difuso[yB * SIZE + xB], esperadoB, 1e-5,
  'el píxel pintado es <I>·s_halo + dI·s_grano');

/* ── 4. El grano está anclado al cielo, no al lienzo ─────────────────────── */
console.log('\nAnclaje del grano:');
var Z1 = pintar(M13, 200, 100, 22.0, 20, SIZE);
var Z2 = pintar(M13, 200, 100, 22.0, 40, SIZE);
/* El mismo punto del CIELO en los dos campos. Se muestrea en píxeles del campo
   ANCHO, que caen exactos sobre píxeles del estrecho (el doble de escala): si se
   comparasen posiciones cualesquiera, lo que se mediría sería el redondeo a
   píxel, no el anclaje. El valor comparado es el campo crudo, que es el que
   lleva el grano. */
var asPx2 = 3600 / (SIZE / (Z2.arcmin / 60));
/* Lo que tiene que coincidir es el PATRÓN, no el valor: al alejar el zoom el
   píxel promedia más grano y la amplitud baja (Omega = max(beam, píxel)), que es
   lo que hace la naturaleza. El patrón se recupera deshaciendo la lognormal:
   g = (ln I_crudo - mu) / s, con los mismos <I> y s interpolados que usa el
   render (mu = ln<I> - s²/2). */
function patronEn(P, dxAs, dyAs) {
  var pxPorAs = (P.SIZE / (P.arcmin / 60)) / 3600, cen = P.SIZE / 2;
  var x = Math.round(cen - dxAs * pxPorAs), y = Math.round(cen - dyAs * pxPorAs);
  var rAs = P.res.poblacion.radioPropio(dxAs, dyAs);
  var I = enTabla(P.res.tabla, P.res.tabla.I, rAs);
  var s = enTabla(P.res.tabla, P.res.tabla.lnS, rAs);
  return (Math.log(P.crudo[y * P.SIZE + x]) - (Math.log(I) - s * s / 2)) / s;
}
var iguales = 0, muestras = 0, peor = 0;
for (var d = 30; d <= 120; d += 3) {
  var dxAs = d * asPx2;                       // desplazamiento entero en el campo ancho
  var g1 = patronEn(Z1, dxAs, 0), g2 = patronEn(Z2, dxAs, 0);
  muestras++;
  peor = Math.max(peor, Math.abs(g1 - g2));
  if (Math.abs(g1 - g2) <= 1e-6) iguales++;
}
ok(iguales === muestras,
  'el grano es el MISMO patrón a 20\' y a 40\' de campo (' + iguales + '/' + muestras +
  ' puntos, peor desvío ' + peor.toExponential(1) + ')');
ok(Z2.res.tabla.sigma[100] < Z1.res.tabla.sigma[100],
  'y al alejar el zoom se aplana, porque el píxel promedia (sigma ' +
  Z1.res.tabla.sigma[100].toExponential(2) + ' → ' + Z2.res.tabla.sigma[100].toExponential(2) + ')');

/* ── 5. Nivel 3: la apertura hunde m_res y vacía el campo ────────────────── */
console.log('\nResolución (§9.3):');
var P100 = pintar(M13, 100, 100, 21.5, 20, SIZE);
var P400 = pintar(M13, 400, 100, 21.5, 20, SIZE);
function mResA(P, rAs) {
  var u = rAs / P.res.tabla.paso, i = Math.floor(u);
  return P.res.tabla.mRes[i];
}
var d100 = mResA(P100, 200), d400 = mResA(P400, 200);
ok(d400 > d100 + 1.0,
  'duplicar dos veces la apertura hunde m_res a 200" más de 1 mag (' +
  d100.toFixed(2) + ' → ' + d400.toFixed(2) + ')');
ok(P400.res.Fmedio < P100.res.Fmedio,
  'y el campo no resuelto pierde flujo (' + P100.res.Fmedio.toExponential(3) +
  ' → ' + P400.res.Fmedio.toExponential(3) + ')');
var nucleo100 = mResA(P100, 5), halo100 = mResA(P100, 400);
ok(nucleo100 < halo100,
  'el núcleo aglomera: m_res es más brillante dentro que fuera (' +
  nucleo100.toFixed(2) + ' vs ' + halo100.toFixed(2) + ')');

/* ── 6. El sorteo por estrella (ADR 0012) ────────────────────────────────── */
console.log('\nSorteo por estrella:');

/* No hay banda ni magnitud efectiva: una estrella sale ENTERA o no sale. Se
   comprueba con tres estrellas puestas al mismo radio y m_res conocida. */
var rTest = 200, mResTest = mResA(P100, rTest);
var pxAs = rTest / 3600;
function estrellaA(mag, dx) {
  return [M13.ra + (pxAs + (dx || 0) / 3600) / Math.cos(M13.dec * Math.PI / 180),
          M13.dec, mag, 0.8];
}
function pintaCon(estrellas) {
  return R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: SIZE,
    cielo: equipo(100, 100, 21.5), apertura: 100, estrellas: estrellas
  });
}
var brillante = estrellaA(mResTest - 2), debil = estrellaA(mResTest + 2, 1);
var salida = pintaCon([brillante, debil]).estrellas;
ok(salida.filter(function (e) { return e === brillante; }).length === 1,
  'la resuelta sale con su magnitud intacta');
ok(salida.filter(function (e) { return e === debil; }).length === 0,
  'la más débil que m_res no se dibuja (ya está en el velo)');
ok(salida.every(function (e) { return e[4] === undefined; }),
  'ninguna sale con magnitud efectiva: el sorteo no atenúa');

/* Determinista: repintar no re-sortea. Es lo que hace que el cuadro no
   parpadee al mover el ocular ni al redibujar.

   A 100 mm el sorteo no tiene nada que decidir (a ≈ 1: m_res es tan brillante
   que no hay vecina capaz de fundir a nadie), así que la muestra se planta en el
   NÚCLEO con 467 mm, donde a ≈ 0,93 y el sorteo sí decide. Y lo que se exige no
   es un número redondo de supervivientes sino que la cuenta case con Σa dentro
   de lo que la Poisson-binomial permite: sortear dispersa, y confundir esa
   dispersión con un fallo del modelo es el error que el ADR 0012 anota. */
var Pnuc = R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: SIZE,
  cielo: equipo(467, 173, 21.0), apertura: 467, estrellas: []
});
var rNuc = 5, mResNuc = mResA({ res: Pnuc }, rNuc);
var muestras = [], E = 0, V = 0;
for (var jm = 0; jm < 200; jm++) {
  var eNuc = [M13.ra + (rNuc + jm * 0.02) / 3600 / Math.cos(M13.dec * Math.PI / 180),
              M13.dec, mResNuc - 0.1, 0.8];
  muestras.push(eNuc);
  var pNuc = Pnuc.poblacion.aCrowd(eNuc[2], rNuc + jm * 0.02, Pnuc.radioImagenAs);
  E += pNuc; V += pNuc * (1 - pNuc);
}
function sorteaNucleo() {
  return R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
    ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: SIZE,
    cielo: equipo(467, 173, 21.0), apertura: 467, estrellas: muestras
  }).estrellas.filter(function (e) { return muestras.indexOf(e) >= 0; });
}
var s1 = sorteaNucleo(), s2 = sorteaNucleo();
ok(s1.length === s2.length && s1.every(function (e, i) { return e === s2[i]; }),
  'el sorteo es determinista: dos pintados dan la misma lista (' + s1.length + '/200)');
ok(E < 195, 'y en el núcleo a 467 mm el sorteo tiene algo que decidir (Σa = ' +
  E.toFixed(1) + ' de 200)');
ok(Math.abs(s1.length - E) < 4 * Math.sqrt(V),
  'la cuenta dibujada casa con Σa dentro de 4σ: ' + s1.length + ' contra ' +
  E.toFixed(1) + ' ± ' + Math.sqrt(V).toFixed(1));

/* Invariante: las estrellas catalogadas NO tocan el campo. El velo sale de la
   LF entera por el perfil, así que dar o no dar la lista de Gaia no puede mover
   ni un fotón del difuso. */
var conEstrellas = R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: SIZE,
  cielo: equipo(100, 100, 21.5), apertura: 100,
  estrellas: [estrellaA(mResTest - 0.5), estrellaA(mResTest - 1)]
});
var sinEstrellas = R.pintarCumulo(new Float32Array(SIZE * SIZE), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: SIZE,
  cielo: equipo(100, 100, 21.5), apertura: 100, estrellas: []
});
ok(conEstrellas.Fmedio === sinEstrellas.Fmedio,
  'las catalogadas no tocan el flujo del campo (invariante 3)');

/* ── 7. Frontera y determinismo ──────────────────────────────────────────── */
console.log('\nFrontera e integración:');
var fs = require('fs');
var fuenteCumulos = fs.readFileSync(__dirname + '/../resources/js/bitacora-cumulos.js', 'utf8');
var fuenteSinComentarios = fuenteCumulos.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
['Cmin', 'canvas', 'ctxFotometrico', 'visibilidadDifusa', 'realzarPerceptual']
  .forEach(function (prohibido) {
    ok(fuenteSinComentarios.indexOf(prohibido) < 0,
      'bitacora-cumulos.js sigue sin mencionar ' + prohibido + ' (ADR 0002)');
  });

// Protección de integración: sin el módulo de población no se dibuja un cúmulo
// distinto, no se dibuja ninguno.
var guardado = global.window.BitacoraCumulos;
global.window.BitacoraCumulos = null;
var sinModulo = R.pintarCumulo(new Float32Array(16), M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: 20, size: 4,
  cielo: equipo(200, 100, 21.5), apertura: 200, estrellas: []
});
global.window.BitacoraCumulos = guardado;
ok(sinModulo === null, 'sin BitacoraCumulos, pintarCumulo devuelve null y no pinta nada');

var D1 = pintar(M13, 200, 100, 21.5, 20, SIZE).difuso;
var D2 = pintar(M13, 200, 100, 21.5, 20, SIZE).difuso;
var identico = true;
for (var q = 0; q < D1.length; q++) if (D1[q] !== D2[q]) { identico = false; break; }
ok(identico, 'dos pintados del mismo cúmulo son idénticos bit a bit');

/* La máscara difusa lleva s_halo, no un sí/no: el realce decae donde el velo ya
   se ve bien. */
// Campo más ancho que el cúmulo entero: así hay esquinas fuera de r_t donde el
// cúmulo no pinta y la máscara no debe marcar.
var M = pintar(M13, 200, 100, 21.5, campoAncho, SIZE);
var mask = M.cielo.difusoMask;
var marcados = 0, conT = 0;
for (var p = 0; p < mask.length; p++) {
  if (R.difusoMarcado(mask, p)) { marcados++; if (mask[p] > 0) conT++; }
}
ok(marcados > 0 && conT > 0, 'la máscara lleva la t de s_halo (' + conT + '/' + marcados + ' px con t>0)');
ok(!R.difusoMarcado(mask, 2 * SIZE + 2), 'y no marca la esquina, fuera de r_t');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
