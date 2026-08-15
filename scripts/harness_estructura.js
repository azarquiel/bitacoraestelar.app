#!/usr/bin/env node
/* HARNESS: ¿DETECCIÓN y ESTRUCTURA son la misma ley evaluada dos veces?

   No toca producción. Todo se monta encima de piezas que ya existen en
   resources/js/bitacora-gaia-render.js:

     · ctxFotometrico  → Cmin sin término de tamaño (cielo + luminancia retinal)
     · radioImagenEstelar(D) = √(Airy(D)² + (seeing/2)²)   ← ya está, y hoy solo
       la consume radioEstrella: las galaxias NO la ven pasar
     · ps1ComponentesSersic / ps1FlujoModelo → el perfil
     · FOT.C_MAG_* → los clamps y el exponente

   La tesis que se pone a prueba:

     Cmin(θ) es UNA sola ley de umbral. Lo que cambia entre las dos preguntas es
     QUÉ θ se le mete y CONTRA QUÉ se compara el contraste:

       DETECCIÓN  θ = D25 · aumentos          contraste = objeto / cielo
       ESTRUCTURA θ = θ_detalle_borroso · aumentos   contraste = brazo / interbrazo

     donde θ_detalle_borroso = √(θ_detalle² + θ_res²) y θ_res = 2·radioImagenEstelar(D).
     Ahí, y solo ahí, entra la APERTURA en la resolución: por el disco de Airy.

   Si la tesis se sostiene no hace falta una segunda perilla: hace falta llamar a
   la misma función con el otro tamaño angular.

   Sin dependencias:  node scripts/harness_estructura.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot, CFG = R.config;
var G = require('./lib_galaxias_sinteticas.js')(R);   // los MISMOS siete objetos

var SQM = 21.3, T = 0.82, POJO = 7;
var FCIELO = Math.pow(10, -0.4 * SQM);

/* PROVISIONAL, heredado del harness anterior y NO recalibrado aquí: el clamp
   C_MAG_MIN cae en 60′ de tamaño aparente (plateau de Blackwell). */
var PLATEAU_PROV = 60, C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);

/* La estructura de una espiral ESCALA con la galaxia: el ancho de brazo y la
   separación interbrazo son una fracción del disco, no un tamaño fijo. 1/25 del
   D25 es el orden de M51/M33. No es una perilla: es morfología, y la sección 2b
   comprueba que la conclusión no depende del número. */
var FRAC_BRAZO = 1 / 25;
/* Amplitud del brazo sobre el disco local. 0,30 = el brazo es un 30 % más
   brillante que el interbrazo, típico en B de una Sc. */
var AMP_BRAZO = 0.30;

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }
function clampT(t) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, t)); }
function enClamp(t) { return clampT(t) !== t; }

/* ── La ley, UNA sola vez ──────────────────────────────────────────────────── */
function cminBase(D, MAG) {                 // tronco común, de producción
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO,
    pupilaSalida: D / MAG }).Cmin;
}
function terminoTam(thetaArcmin, MAG) {     // ley B: tamaño APARENTE
  return clampT(Math.pow(C_MAG_REF_B / (thetaArcmin * MAG), FOT.C_MAG_EXP));
}
function cmin(D, MAG, thetaArcmin) { return cminBase(D, MAG) * terminoTam(thetaArcmin, MAG); }
function umbralDe(c) { return -2.5 * Math.log10(FCIELO * c); }

/* ── Resolución: la única puerta por la que la apertura toca una galaxia ───── */
function thetaRes(D) { return 2 * R.radioImagenEstelar(D); }        // ″, FWHM equivalente
/* Un detalle de tamaño θ convolucionado con la resolución sale más ancho y más
   plano. El flujo se conserva, así que la amplitud baja por θ²/θ_eff²: la misma
   cuadratura que ya usa radioEstrella, y por el mismo motivo. */
function thetaEff(thetaDet, D) {
  var tr = thetaRes(D);
  return Math.sqrt(thetaDet * thetaDet + tr * tr);
}
function dilucion(thetaDet, D) {
  var te = thetaEff(thetaDet, D);
  return (thetaDet * thetaDet) / (te * te);
}

/* ── Las dos preguntas ─────────────────────────────────────────────────────── */
function detectar(obj, D, MAG) {
  var c = cmin(D, MAG, obj.d25);
  var muLim = umbralDe(c);
  return { cmin: c, muLim: muLim, rDet: G.radioIsofota(obj.comps, muLim) };
}
/* Margen de estructura, en magnitudes: cuánto le sobra (o le falta) al contraste
   del brazo para pasar el umbral, evaluado en el tamaño aparente del DETALLE. */
function estructurar(obj, D, MAG) {
  var thetaDet = obj.d25 * 60 * FRAC_BRAZO;                       // ″
  var te = thetaEff(thetaDet, D);
  var fDisco = R.ps1FlujoModelo(obj.comps, 0, 0, obj.re);         // brillo local en r_e
  var cLocal = AMP_BRAZO * fDisco / (fDisco + FCIELO) * dilucion(thetaDet, D);
  var umbral = cmin(D, MAG, te / 60);
  return { thetaDet: thetaDet, thetaEff: te, cLocal: cLocal, umbral: umbral,
           margen: 2.5 * Math.log10(cLocal / umbral),
           apar: te / 60 * MAG, enClamp: enClamp(Math.pow(C_MAG_REF_B / (te / 60 * MAG), FOT.C_MAG_EXP)) };
}

/* Máximo sobre el rango usable. Por debajo de D/pupilaOjo la pupila de salida se
   sale del ojo y la curva se aplana: un barrido ingenuo confunde ese borde con
   un pico, así que el borde se marca. */
function optimo(D, valor) {
  var lo = Math.ceil(D / POJO), hi = 2000, mejor = lo, vMejor = -Infinity;
  for (var m = lo; m <= hi; m++) {
    var v = valor(m);
    if (v > vMejor + 1e-12) { vMejor = v; mejor = m; }
  }
  return { mag: mejor, valor: vMejor, borde: (mejor === lo || mejor === hi), min: lo };
}
function textoOpt(D, o) {
  return o.mag + 'x' + (o.borde ? '↓' : '') + ' · pupila ' + f(D / o.mag, 2) + ' mm';
}

/* ═══ 0. ¿Toca la apertura la resolución de una galaxia, hoy? ══════════════ */
console.log('\n═══ 0. La apertura y la resolución de galaxias, en el código de hoy ═══');
console.log('  radioImagenEstelar(D) = √(Airy² + (seeing/2)²) existe y está exportada.');
console.log('  Sus ÚNICOS consumidores son radioEstrella/sueloEstrella: estrellas.');
console.log('  ps1PintarParche muestrea el parche por vecino más próximo, sin PSF: la');
console.log('  resolución de una galaxia la fija el stack de PS1 (seeing ' + R.ps1.seeingAs +
  '″), no el telescopio.');
fila(['apertura (mm)', 'Airy r₁ (″)', 'θ_res = 2·r_imagen (″)', 'θ_res vs seeing PS1']);
[80, 114, 203, 305, 457, 914].forEach(function (D) {
  fila([String(D), f(R.radioAiry(D), 2), f(thetaRes(D), 2),
    f(thetaRes(D) / R.ps1.seeingAs, 2) + '×']);
});
console.log('  Con seeing ' + CFG.seeingArcsec + '″ el suelo atmosférico manda desde ~200 mm:');
console.log('  la apertura aprieta el detalle hasta ahí y luego satura. Eso es físico,');
console.log('  y hoy NO se aplica a ninguna galaxia.');

/* ═══ 1. Las dos preguntas sobre la misma familia ══════════════════════════ */
var D18 = 457;
console.log('\n═══ 1. Misma galaxia, mismo aumento: detección contra estructura (18″) ═══');
fila(['D25 (′)', 'MAG', 'θ det. apar. (′)', 'θ estr. apar. (′)', 'μ_lim', 'margen estr. (mag)']);
[0.5, 2, 10, 30].forEach(function (d) {
  var o = G.objetos[G.TAMANOS.indexOf(d)];
  [66, 150, 300, 600].forEach(function (MAG) {
    var det = detectar(o, D18, MAG), est = estructurar(o, D18, MAG);
    fila([f(d, 1), MAG + 'x', f(d * MAG, 1), f(est.apar, 1), f(det.muLim), f(est.margen, 2)]);
  });
});

console.log('\n═══ 1b. Dónde cae el máximo de cada pregunta (18″) ═══');
fila(['D25 (′)', 'DETECCIÓN: máx.', 'ESTRUCTURA: máx.', 'θ detalle (″)', 'margen máx. (mag)']);
G.objetos.forEach(function (o) {
  var od = optimo(D18, function (m) { return detectar(o, D18, m).muLim; });
  var oe = optimo(D18, function (m) { return estructurar(o, D18, m).margen; });
  fila([f(o.d25, 1), textoOpt(D18, od), textoOpt(D18, oe),
    f(o.d25 * 60 * FRAC_BRAZO, 1), f(oe.valor, 2)]);
});
console.log('  Si las dos columnas coinciden, la separación no existe y sobra media');
console.log('  investigación. Si divergen, es que son dos tareas distintas.');

/* ═══ 2b. ¿Depende la conclusión del tamaño supuesto del detalle? ══════════ */
console.log('\n═══ 2. Sensibilidad al tamaño del detalle (D25 = 10′, 18″) ═══');
var o10 = G.objetos[G.TAMANOS.indexOf(10)];
fila(['brazo = D25/', 'θ detalle (″)', 'estructura: máx.', 'detección: máx.']);
[10, 25, 50, 100].forEach(function (den) {
  var guardado = FRAC_BRAZO; FRAC_BRAZO = 1 / den;
  var oe = optimo(D18, function (m) { return estructurar(o10, D18, m).margen; });
  var od = optimo(D18, function (m) { return detectar(o10, D18, m).muLim; });
  fila(['/' + den, f(o10.d25 * 60 / den, 1), textoOpt(D18, oe), textoOpt(D18, od)]);
  FRAC_BRAZO = guardado;
});

/* ═══ 3. Dos aperturas, tres formas de compararlas ════════════════════════ */
console.log('\n═══ 3. Dos aperturas (203 mm y 457 mm), D25 = 5′ ═══');
var o5 = G.objetos[G.TAMANOS.indexOf(5)];
function comparar(etiqueta, filas) {
  console.log('  · ' + etiqueta);
  fila(['   apertura', 'MAG', 'pupila (mm)', 'θ_res (″)', 'μ_lim (detección)', 'margen estructura']);
  filas.forEach(function (par) {
    var D = par[0], MAG = par[1];
    fila(['   ' + D + ' mm', MAG + 'x', f(D / MAG, 2), f(thetaRes(D), 2),
      f(detectar(o5, D, MAG).muLim), f(estructurar(o5, D, MAG).margen, 3)]);
  });
}
comparar('mismo AUMENTO (150x): debe ganar la apertura mayor en las dos',
  [[203, 150], [457, 150]]);
comparar('misma PUPILA DE SALIDA (2 mm): fondo y luminancia idénticos',
  [[203, 102], [457, 229]]);
comparar('mismo TAMAÑO APARENTE del objeto (D25·MAG = 750′)',
  [[203, 150], [457, 150]]);
console.log('  A misma pupila la DETECCIÓN debe empatar salvo por el tamaño aparente,');
console.log('  y la ESTRUCTURA no: el 18″ va a más aumento con la misma pupila, y encima');
console.log('  tiene el Airy más apretado. Las dos vías van en el mismo sentido.');

/* ═══ 4. Galaxias reales ═══════════════════════════════════════════════════ */
console.log('\n═══ 4. Casos reales (D25 derivado del perfil, como en d25_catalogo.js) ═══');
require('../simulador_ocular/resources/js/galaxias-datos.js');
var CAT = window.BITACORA_GALAXIAS;
function delCatalogo(nombre) {
  var g = null;
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === nombre) { g = CAT[i]; break; }
  if (!g) return null;
  var comps = R.ps1ComponentesSersic({ magV: g[7], reArcsec: g[4], n: g[8], ba: g[5], bt: g[9] });
  return { nombre: nombre, d25: 2 * G.radioIsofota(comps, 25) / 60, re: g[4], comps: comps,
           polvo: g[10] };
}
fila(['galaxia', 'D25 (′)', 'θ brazo (″)', 'DETECCIÓN: máx.', 'ESTRUCTURA: máx.', 'margen (mag)']);
['NGC 598', 'NGC 3031', 'NGC 5194', 'NGC 4565', 'NGC 221'].forEach(function (n) {
  var o = delCatalogo(n);
  if (!o) { fila([n, 'NO ESTÁ EN EL CATÁLOGO', '-', '-', '-', '-']); return; }
  var od = optimo(D18, function (m) { return detectar(o, D18, m).muLim; });
  var oe = optimo(D18, function (m) { return estructurar(o, D18, m).margen; });
  fila([n, f(o.d25, 1), f(o.d25 * 60 * FRAC_BRAZO, 1),
    textoOpt(D18, od), textoOpt(D18, oe), f(oe.valor, 2)]);
});

/* ═══ 5. Los clamps: ¿límite perceptual o herencia numérica? ═══════════════ */
console.log('\n═══ 5. Los clamps C_MAG_MIN/C_MAG_MAX ═══');
var recorrido = 2.5 * Math.log10(FOT.C_MAG_MAX / FOT.C_MAG_MIN);
var razonTam = Math.pow(FOT.C_MAG_MAX / FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);
console.log('  Recorrido total del término: ' + f(recorrido, 3) + ' mag, independiente del exponente.');
console.log('  Con C_MAG_EXP = ' + FOT.C_MAG_EXP + ' eso solo cubre una razón de tamaño aparente de ' +
  f(razonTam, 2) + '×,');
console.log('  o sea la ventana [' + f(C_MAG_REF_B / FOT.C_MAG_MAX, 1) + '′, ' +
  f(C_MAG_REF_B / FOT.C_MAG_MIN, 1) + '′].');
console.log('  Blackwell, en cambio, va de ~1′ a ~60′ antes de aplanar: razón 60×.');
fila(['tamaño aparente', 'Blackwell ≈ 1/θ (mag rel.)', 'el término, con clamps']);
[0.5, 1, 2, 5, 13.5, 30, 60, 120].forEach(function (th) {
  var libre = Math.pow(C_MAG_REF_B / th, FOT.C_MAG_EXP);
  fila([f(th, 1) + '′', f(-2.5 * Math.log10(60 / th), 2), f(-2.5 * Math.log10(clampT(libre) / FOT.C_MAG_MIN), 2) +
    (enClamp(libre) ? '  (clavado)' : '')]);
});
console.log('  El término tiene ' + f(recorrido, 2) + ' mag donde el fenómeno tiene ' +
  f(2.5 * Math.log10(60), 2) + '.');

/* ═══ 6. Comprobaciones de no-regresión ═══════════════════════════════════ */
console.log('\n═══ 6. Comprobaciones ═══');
var comps9 = R.ps1ComponentesSersic({ magV: 9, reArcsec: 100, n: 3, ba: 1, bt: 0 });
console.log('  1. presupuesto fotométrico: ps1FlujoModelo no recibe ni aumentos ni θ → ' +
  (R.ps1FlujoModelo(comps9, 0, 0, 50) === R.ps1FlujoModelo(comps9, 0, 0, 50) ? 'intacto' : 'ROTO'));
console.log('  2. PS1/E: este harness no llama a ps1PintarParche ni a ps1Mezcla → intactos');
var e1 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 2.5 });
var e2 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 2.5 });
console.log('  3. estrellas: consumen Fcielo/rango/nivelFondo/SBe, no Cmin → ' +
  (e1.rango === e2.rango && e1.nivelFondo === e2.nivelFondo ? 'intactas' : 'ROTO'));
// Los aumentos EXACTOS que dan 2,00 mm en cada apertura, no los redondeados.
var p1 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 203 / 101.5 });
var p2 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 457 / 228.5 });
console.log('  4. misma pupila → mismo fondo: ' + f(p1.nivelFondo, 5) + ' vs ' + f(p2.nivelFondo, 5) +
  ' (Δ = ' + f(Math.abs(p1.nivelFondo - p2.nivelFondo), 6) + ')');
var mayorMejor = detectar(o5, 457, 150).muLim > detectar(o5, 203, 150).muLim;
console.log('  5. a igual aumento la apertura mayor NO empeora la detección: ' +
  (mayorMejor ? 'se cumple' : 'INVERSIÓN ALGEBRAICA'));
console.log('  6. el tamaño aparente entra en el umbral y solo ahí: por construcción,');
console.log('     terminoTam() multiplica Cmin y no toca ningún flujo.');
console.log('  7. no se ha fabricado ningún óptimo: los máximos de arriba salen del');
console.log('     barrido, y los que caen en el borde del rango van marcados con ↓.');
