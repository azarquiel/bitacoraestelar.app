#!/usr/bin/env node
/* Arnés de diagnóstico del grano SBF — bugfix v8, prioridad 1.

   v7 dejó abierto un hallazgo: `s_grano` vale 0 en las 18 corridas de su matriz
   y la especificación describe S2 como «toda la textura del halo». Un término
   que siempre vale 0 puede ser dos cosas muy distintas, y hasta separarlas no se
   puede tocar ninguna ley:

     (A) DESCONEXIÓN  S2 no llega a la imagen. Multiplicarlo no cambiaría nada.
     (B) LEY DURA     S2 llega, pero el umbral perceptual del grano es tan alto
                      que el desvanecido lo apaga siempre.

   El arnés no cambia el modelo: lo interroga. Multiplica S2 por un factor —una
   intervención que NO es física, solo un trazador— y mira si σ, `s_grano` y los
   píxeles se mueven. Si se mueven, la cadena está viva y el problema es (B); si
   no, hay una desconexión que localizar.

   Además tabula, por anillo, la razón σ/(umbral del grano): cuánto le falta al
   grano para superar H2c. Es el número que decide si la ley del grano se está
   evaluando a la escala angular correcta.

     node scripts/harness_grano_sbf.js            diagnóstico completo
     node scripts/harness_grano_sbf.js --escalas  barrido multiescala del umbral */
'use strict';

global.window = global.window || {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;
var H = require('./harness_halo_v7.js');

/* Trazador: la misma población con S2 multiplicado. Se envuelve
   `poblacionCacheada` y no la ficha del cúmulo porque es lo que llama
   `pintarCumulo`: así el trazador entra por el MISMO camino que el modelo real y
   no por una copia del arnés. El objeto derivado hereda por prototipo (sigma,
   mCrowd, radioPropio, rtAs...), de modo que lo único que cambia es S2. */
function conS2(factor, fn) {
  var orig = C.poblacionCacheada;
  C.poblacionCacheada = function (cum, real) {
    var p = orig(cum, real);
    if (factor === 1) return p;
    var q = Object.create(p);
    q.S2 = function (mlim) { return p.S2(mlim) * factor; };
    // El render usa el segundo momento CON la banda; el trazador tiene que
    // entrar por ahí o no toca nada (y volvería a medir un conjunto vacío).
    q.S2campo = function (mRes, delta) { return p.S2campo(mRes, delta) * factor; };
    return q;
  };
  try { return fn(); } finally { C.poblacionCacheada = orig; }
}

/* Una corrida con el factor puesto. Devuelve lo que hace falta para responder a
   (A) vs (B): la tabla radial, el máximo de cada término y una firma del lienzo
   (suma de |I|) que cambia si y solo si algún píxel cambió. */
function corrida(cum, cfg, factor) {
  return conS2(factor, function () {
    var m = H.medir(cum, cfg);
    var t = m.tabla, sMax = 0, sgMax = 0, granoMax = 0;
    for (var i = 0; i < t.r.length; i++) {
      if (t.sigma[i] > sMax) sMax = t.sigma[i];
      if (t.sGrano[i] > sgMax) sgMax = t.sGrano[i];
      var fondo = (m.ctxGrano.Fcielo + t.I[i]) * m.ctxGrano.Cmin;
      if (fondo > 0 && t.sigma[i] / fondo > granoMax) granoMax = t.sigma[i] / fondo;
    }
    var firma = 0, per = m.perceptual;
    for (var k = 0; k < per.length; k++) firma += per[k].I * per[k].n;
    /* Varianza LOGARÍTMICA del campo crudo, ponderada por píxeles: es el tap
       físico, antes de cualquier ley perceptual. Si S2 estuviese desconectado,
       este número no se movería con el trazador aunque σ de la tabla sí. En log
       porque el campo es lognormal y el estimador lineal de una lognormal muy
       sesgada tiene ~100 % de error (§Fase 2, desviación 4). */
    var g = m.granoEn(0, Math.min(m.rtAs, m.arcmin * 60 / 2), 24);
    var sw = 0, wn = 0;
    for (var q = 0; q < g.length; q++) { sw += g[q].sLn * g[q].sLn * g[q].n; wn += g[q].n; }
    return { medida: m, sigmaMax: sMax, sGranoMax: sgMax, razonMax: granoMax,
             firma: firma, varCrudo: wn ? sw / wn : 0 };
  });
}

/* Barrido multiescala del criterio del grano en un radio dado.

   La textura no es un elemento aislado del tamaño del beam: es un campo
   aleatorio que el ojo puede integrar sobre un parche mayor. Promediar n celdas
   independientes divide la amplitud por √n —n = (θ/θ_beam)²— y a la vez baja el
   umbral, porque H2c favorece al elemento grande. El barrido mide las dos cosas
   a la vez y dice a qué escala la textura está MÁS cerca de verse.

   El render NO barre: usa el máximo analítico de esta misma curva, θ* = θ_R/M
   (ver pintarCumulo). El barrido queda como comprobación de que ese máximo es el
   de verdad — si algún día la forma de Cmin cambia, aquí se ve antes que en
   ningún sitio. */
function barridoEscalas(medida, rAs, cielo) {
  var t = medida.tabla;
  var I = enTabla(t, t.I, rAs), sBeam = enTabla(t, t.sigma, rAs);
  var thBeamAs = 2 * Math.sqrt(medida.omegaBeam / Math.PI);   // diámetro equivalente
  var salida = [];
  for (var k = 0; k <= 24; k++) {
    var thAs = thBeamAs * Math.pow(2, k / 4);
    var ctx = R.ctxFotometrico(cielo, thAs / 60);
    var sigma = sBeam * (thBeamAs / thAs);
    var umbral = (ctx.Fcielo + I) * ctx.Cmin;
    salida.push({ thAs: thAs, thArcmin: thAs / 60, Cmin: ctx.Cmin,
                  sigma: sigma, umbral: umbral, razon: sigma / umbral });
  }
  return salida;
}

function enTabla(tabla, v, rAs) {
  if (!(rAs >= 0) || rAs >= tabla.r[tabla.r.length - 1]) return 0;
  var u = rAs / tabla.paso, i = Math.floor(u), t = u - i;
  return v[i] * (1 - t) + v[i + 1] * t;
}

function cieloDe(cfg) {
  return { pupilaSalida: cfg.D / cfg.MAG, pupilaOjo: 7, sqm: cfg.sqm,
           transmision: 0.9, aumentos: cfg.MAG, perceptual: true };
}

module.exports = { conS2: conS2, corrida: corrida, barridoEscalas: barridoEscalas,
                   cieloDe: cieloDe, cumulo: H.cumulo };

/* ── Volcado ─────────────────────────────────────────────────────────────── */
if (require.main === module) {
  var EQUIPOS = [
    { D: 100, MAG: 50, sqm: 21.5 },
    { D: 200, MAG: 146, sqm: 21.5 },
    { D: 400, MAG: 200, sqm: 21.5 },
    { D: 200, MAG: 146, sqm: 25.0 }     // cielo irreal, cota superior
  ];
  var cum = H.cumulo('NGC 6205');       // M13

  console.log('\n══ 1 · ¿S2 llega a la imagen?  (M13, factores 1 / 10 / 100)\n');
  console.log('  equipo             xS2   sigma_max     s_grano_max   sigma/umbral   firma lienzo');
  EQUIPOS.forEach(function (eq) {
    [1, 10, 100].forEach(function (f) {
      var c = corrida(cum, { D: eq.D, MAG: eq.MAG, sqm: eq.sqm, realization: 0 }, f);
      console.log('  ' + (eq.D + ' mm ' + eq.MAG + 'x SQM ' + eq.sqm).padEnd(20) +
        String(f).padStart(4) + c.sigmaMax.toExponential(3).padStart(12) +
        c.sGranoMax.toFixed(4).padStart(14) + c.razonMax.toExponential(3).padStart(15) +
        c.firma.toExponential(4).padStart(15));
    });
    console.log('');
  });

  console.log('══ 2 · a qué escala angular está el grano más cerca del umbral');
  console.log('   (M13, r = r_h; σ(θ) = σ_beam·θ_beam/θ, promediado de celdas independientes)\n');
  EQUIPOS.forEach(function (eq) {
    var cfg = { D: eq.D, MAG: eq.MAG, sqm: eq.sqm, realization: 0 };
    var m = H.medir(cum, cfg);
    var b = barridoEscalas(m, m.rhAs, cieloDe(cfg));
    var mejor = b.reduce(function (a, x) { return x.razon > a.razon ? x : a; }, b[0]);
    console.log('  ' + (eq.D + ' mm ' + eq.MAG + 'x SQM ' + eq.sqm).padEnd(20) +
      ' beam ' + b[0].thAs.toFixed(2) + '"  razón(beam) ' + b[0].razon.toExponential(2) +
      '   mejor escala ' + mejor.thAs.toFixed(1) + '" (' + mejor.thArcmin.toFixed(2) +
      "')  razón " + mejor.razon.toExponential(2) +
      '   ganancia ×' + (mejor.razon / b[0].razon).toFixed(1));
  });

  if (process.argv.indexOf('--escalas') >= 0) {
    var cfg0 = { D: 200, MAG: 146, sqm: 21.5, realization: 0 };
    var m0 = H.medir(cum, cfg0);
    console.log('\n══ 3 · barrido completo (M13, 200 mm 146×, r = r_h)\n');
    console.log('    θ("）      θ(′)      Cmin        σ(θ)        umbral      σ/umbral');
    barridoEscalas(m0, m0.rhAs, cieloDe(cfg0)).forEach(function (x) {
      console.log('  ' + x.thAs.toFixed(2).padStart(8) + x.thArcmin.toFixed(3).padStart(10) +
        x.Cmin.toExponential(2).padStart(12) + x.sigma.toExponential(2).padStart(13) +
        x.umbral.toExponential(2).padStart(13) + x.razon.toExponential(2).padStart(13));
    });
  }
}
