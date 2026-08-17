#!/usr/bin/env node
/* E2 · Auditoría del orden muestrear → emparejar → anclar → atenuar.

   La pregunta: ¿hay alguna normalización o anclaje fotométrico que se ejecute
   DESPUÉS de una atenuación? Si lo hubiera, atenuar no serviría de nada —el
   re-anclaje devolvería el nivel— y el halo se negaría a apagarse.

   Se responde con un guardián que se queda en la batería: se inyecta una
   atenuación de factor 0,5 en el modelo y se exige que el flujo pintado baje
   exactamente ×0,5. Dos cuidados para que el «exactamente» sea legítimo:

     · La inyección escala Sigma y S2 A LA VEZ. Así <I> y sigma_grano se dividen
       los dos por 2 y la anchura de la lognormal, s² = ln(1 + sigma²/<I>²), no
       se mueve: cada píxel vale la mitad EXACTA que su gemelo, con el mismo
       grano. Escalando solo Sigma, s cambia, el campo se resortea y la igualdad
       solo valdría en promedio (~1 %), que es demasiado flojo para un guardián.
     · Se fija m_res (vía m_crowd) al valor de la medida de referencia. Si no, al
       bajar el flujo el fondo local se oscurece, m_lim,sky se hace más profunda
       y el reparto resuelto/campo cambia: se estaría midiendo eso.
     · El cielo es muy oscuro a propósito, para que s_halo y s_grano estén
       saturados a 1 en toda la región medida. Con la atenuación a medio camino,
       la salida NO debe bajar ×0,5 —la ley de visibilidad no es lineal— y el
       guardián estaría midiendo la ley perceptual en vez del anclaje.

   node scripts/test_halo_v7_e2.js */
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

function delCatalogo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}

function pintar(cum, D, MAG, sqm, arcmin, SIZE) {
  var difuso = new Float32Array(SIZE * SIZE);
  var crudo = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: arcmin, size: SIZE, apertura: D,
    cielo: { pupilaSalida: D / MAG, pupilaOjo: 7, sqm: sqm, transmision: 0.9,
             aumentos: MAG, perceptual: true },
    estrellas: [], campoCrudo: crudo, realization: 0
  });
  var total = 0;
  for (var i = 0; i < difuso.length; i++) total += difuso[i];
  return { difuso: difuso, crudo: crudo, res: res, total: total,
           SIZE: SIZE, arcmin: arcmin };
}

// Suma del buffer dentro de un radio propio: el guardián solo puede mirar donde
// la atenuación está saturada, y eso es un disco, no el lienzo entero.
function totalHasta(P, pob, rMaxAs) {
  var asPorPx = P.arcmin * 60 / P.SIZE, cen = P.SIZE / 2, suma = 0;
  for (var y = 0; y < P.SIZE; y++) {
    for (var x = 0; x < P.SIZE; x++) {
      if (pob.radioPropio((x - cen) * asPorPx, (y - cen) * asPorPx) > rMaxAs) continue;
      suma += P.difuso[y * P.SIZE + x];
    }
  }
  return suma;
}

var M13 = delCatalogo('NGC 6205');
var SIZE = 512;
var pobM13 = C.poblacionCacheada(M13, 0);
var ANCHO = Math.ceil(2.4 * pobM13.rtAs / 60);

/* ── 1. Guardián del re-anclaje ──────────────────────────────────────────── */
console.log('E2.1 · atenuar ×0,5 baja el flujo pintado ×0,5 (guardián permanente):');

// Cielo de 25 mag/arcsec²: irreal a propósito. Es el que satura s_halo y
// s_grano a 1 y deja ver el anclaje sin la ley de visibilidad por medio.
var SQM_SATURADO = 25;
var ref = pintar(M13, 200, 100, SQM_SATURADO, ANCHO, SIZE);

function mResRef(rAs) {
  var t = ref.res.tabla, ult = t.r.length - 1;
  if (!(rAs >= 0) || rAs >= t.r[ult]) return Infinity;
  var u = rAs / t.paso, i = Math.floor(u), f = u - i;
  var a = t.mRes[i], b = t.mRes[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a * (1 - f) + b * f;
}

/* El pin de m_res va 0,5 mag POR DEBAJO de la m_res de referencia, no encima:
   a 200 mm/100× el corte lo pone m_lim,sky en todos los radios (m_crowd va
   1,5 mag por encima), así que fijar m_crowd en el propio valor de referencia
   no fija nada —sigue mandando el cielo, que se mueve al bajar el flujo—. Medio
   magnitud por debajo, m_crowd pasa a ser el mínimo en las dos medidas y el
   reparto queda idéntico por construcción. El valor absoluto da igual: lo que
   el guardián compara son dos medidas con el MISMO reparto. */
function conPoblacionEscalada(K, fn) {
  var mod = global.window.BitacoraCumulos, pobCache = mod.poblacionCacheada;
  var falso = Object.create(mod);
  falso.poblacionCacheada = function (cum, realization) {
    var pob = pobCache.call(mod, cum, realization);
    var falsa = Object.create(pob);
    falsa.sigma = function (rAs) { return K * pob.sigma(rAs); };
    falsa.S2 = function (m) { return K * pob.S2(m); };
    falsa.mCrowd = function (rAs) { return mResRef(rAs) - 0.5; };
    return falsa;
  };
  global.window.BitacoraCumulos = falso;
  try { return fn(); } finally { global.window.BitacoraCumulos = mod; }
}

var K = 0.5;
var uno = conPoblacionEscalada(1, function () {
  return pintar(M13, 200, 100, SQM_SATURADO, ANCHO, SIZE);
});
var atenuado = conPoblacionEscalada(K, function () {
  return pintar(M13, 200, 100, SQM_SATURADO, ANCHO, SIZE);
});

// Que la inyección hizo lo que dice: mismo reparto, solo cambia el nivel.
var peorMRes = 0;
for (var k = 0; k < uno.res.tabla.mRes.length; k++) {
  var a1 = uno.res.tabla.mRes[k], b1 = atenuado.res.tabla.mRes[k];
  if (!isFinite(a1) || !isFinite(b1)) continue;
  peorMRes = Math.max(peorMRes, Math.abs(a1 - b1));
}
ok(peorMRes < 1e-9, 'la inyección no mueve m_res (máx ' + peorMRes.toExponential(1) +
  ' mag): lo único que cambia es el nivel');

/* Hasta dónde llega la saturación. Más allá el velo cruza el umbral y ahí el
   ×0,5 exacto no es exigible: la ley de visibilidad no es lineal, y exigirlo
   sería exigir que la percepción no exista. */
var rSat = 0;
for (var j = 0; j < uno.res.tabla.sHalo.length; j++) {
  // Saturación EXACTA (== 1), no «casi»: con 0,999 los dos campos se atenúan de
  // forma ligeramente distinta y el residuo que sale (1,4e-6) es esa diferencia,
  // no un re-anclaje. suave() satura a 1 exacto, así que el corte es limpio.
  if (uno.res.tabla.sHalo[j] >= 1 && atenuado.res.tabla.sHalo[j] >= 1) {
    rSat = uno.res.tabla.r[j];
  } else break;
}
ok(rSat > M13.rh * 60, 's_halo saturado a 1 hasta r = ' + rSat.toFixed(0) +
  '" (' + (rSat / (M13.rh * 60)).toFixed(1) + ' r_h): hay disco donde medir el anclaje');

var pobPin = C.poblacionCacheada(M13, 0);
var razon = totalHasta(atenuado, pobPin, rSat) / totalHasta(uno, pobPin, rSat);
ok(Math.abs(razon / K - 1) <= 1e-9, 'el flujo pintado baja ×' + razon.toFixed(12) +
  ' (pedido ×' + K + ', desvío ' + Math.abs(razon / K - 1).toExponential(1) + ')');

var razonModelo = atenuado.res.Fmedio / uno.res.Fmedio;
ok(Math.abs(razonModelo / K - 1) <= 1e-9, 'y el integral del modelo también: ×' +
  razonModelo.toFixed(12));

/* El contraejemplo: con un cielo urbano la atenuación NO está saturada y la
   salida baja MÁS de ×0,5. Sin esta comprobación, un guardián que pasara por
   estar midiendo una zona donde nada se atenúa no se distinguiría de uno bueno:
   demuestra que el buffer medido sí lleva la atenuación puesta. */
var unoUrbano = conPoblacionEscalada(1, function () {
  return pintar(M13, 200, 100, 18.5, ANCHO, SIZE);
});
var atenuadoUrbano = conPoblacionEscalada(K, function () {
  return pintar(M13, 200, 100, 18.5, ANCHO, SIZE);
});
var razonUrbano = totalHasta(atenuadoUrbano, pobPin, rSat) /
                  totalHasta(unoUrbano, pobPin, rSat);
ok(razonUrbano < K - 0.01, 'y en cielo urbano baja MÁS de ×0,5 (×' +
  razonUrbano.toFixed(4) + '): la mitad de luz cruza el umbral peor, ' +
  'que es la ley perceptual haciendo su trabajo');

/* ── 2. Conservación en rejilla (D, M, seeing) ───────────────────────────── */
console.log('\nE2.2 · campo + resueltas = F(V_t) en rejilla (D, M, seeing):');

/* El reparto se rehace sobre la MISMA rejilla de píxeles con la m_res(r) que el
   render tabuló (igual que en test_cumulo_render.js). Lo que se pone a prueba no
   es S1 + Fresuelto = Ftotal —eso lo cierra la Capa 1, exacto—, sino que el
   bucle de pintado no pierda ni invente luz al llevarlo al lienzo. */
function repartoEnLienzo(P) {
  var pob = P.res.poblacion, tabla = P.res.tabla, delta = C.config.delta;
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
      campo += s * pob.S1(mRes + delta) * areaPx;
      resuelto += s * pob.Fresuelto(mRes + delta) * areaPx;
      total += s * pob.Ftotal * areaPx;
    }
  }
  return { campo: campo, resuelto: resuelto, total: total };
}

var seeingOriginal = R.config.seeingArcsec;

/* Primero el anclaje absoluto: con el cúmulo ENTERO en el lienzo, campo +
   resueltas tiene que ser el flujo del catálogo. */
[['NGC 6205', 200, 100], ['NGC 104', 200, 100], ['NGC 5139', 200, 100]].forEach(function (caso) {
  var cum = delCatalogo(caso[0]);
  var pob = C.poblacionCacheada(cum, 0);
  var P = pintar(cum, caso[1], caso[2], 21.5, Math.ceil(2.4 * pob.rtAs / 60), SIZE);
  var rep = repartoEnLienzo(P);
  var razon2 = (rep.campo + rep.resuelto) / pob.Ftotal;
  ok(Math.abs(razon2 - 1) <= 0.01, caso[0] + ' entero en el lienzo: campo + resueltas = ' +
    (100 * razon2).toFixed(2) + ' % de F(V_t)');
});

/* Y ahora la rejilla, con el campo VERDADERO de cada aumento (campo aparente
   68° / M) y el lienzo a 1024 px, que es lo que usa la aplicación. Con el campo
   ancho y 512 px el píxel mide 6″ y se come el beam: Omega = max(beam, píxel)
   se queda clavado en el píxel y el seeing no entra en NINGÚN sitio, ni en el
   grano ni en m_crowd. El eje de seeing sería decorativo. Aquí el lienzo cubre
   solo parte del cúmulo, así que la referencia es el flujo del modelo sobre
   ESOS píxeles, no F(V_t): lo que se audita es el bucle de pintado. */
var GRID = 1024, omegas = {};
[['NGC 6205', 100, 50], ['NGC 6205', 200, 100], ['NGC 6205', 400, 200],
 ['NGC 104', 200, 100], ['NGC 5139', 200, 100]].forEach(function (caso) {
  var cum = delCatalogo(caso[0]);
  [1.5, 2.0, 3.5].forEach(function (seeing) {
    R.config.seeingArcsec = seeing;
    var arcmin = 68 * 60 / caso[2];
    var P = pintar(cum, caso[1], caso[2], 21.5, arcmin, GRID);
    var rep = repartoEnLienzo(P);
    var razon2 = (rep.campo + rep.resuelto) / rep.total;
    var razonPintado = P.res.Fmedio / rep.campo;
    var omega = Math.max(Math.PI * Math.pow(P.res.fwhmAs / 2, 2),
                         Math.pow(arcmin * 60 / GRID, 2));
    omegas[caso[0] + caso[2]] = (omegas[caso[0] + caso[2]] || []).concat(omega.toFixed(3));
    ok(Math.abs(razon2 - 1) <= 0.01 && Math.abs(razonPintado - 1) <= 0.01,
      caso[0] + ' ' + caso[1] + ' mm ' + caso[2] + '× seeing ' + seeing.toFixed(1) +
      '": campo + resueltas = ' + (100 * razon2).toFixed(2) + ' % del flujo del ' +
      'modelo en esos píxeles, y el render pinta el ' + (100 * razonPintado).toFixed(2) +
      ' % del campo (campo ' + (100 * rep.campo / rep.total).toFixed(1) +
      ' %, Omega ' + omega.toFixed(1) + ' arcsec²)');
  });
});
R.config.seeingArcsec = seeingOriginal;

/* Que el eje de seeing mueve algo de verdad. Se mueve en cuatro de los cinco
   equipos; el que no, 100 mm a 50×, es el de campo más ancho —81′ de campo
   verdadero— y ahí el píxel mide 4,8″ y tapa el beam en las tres pasadas. Eso
   no es un fallo: es Omega = max(beam, píxel) diciendo que a poco aumento el
   grano ya está promediado por el propio píxel. */
var claves = Object.keys(omegas);
var quietos = claves.filter(function (k) { return omegas[k][0] === omegas[k][2]; });
ok(claves.length - quietos.length === 4 && quietos.length === 1 &&
   quietos[0] === 'NGC 620550',
  'el seeing mueve Omega en 4 de los 5 equipos; el que no (100 mm 50×, píxel de ' +
  '4,8″ sobre 81′ de campo) es píxel-limitado en las tres pasadas');

console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
