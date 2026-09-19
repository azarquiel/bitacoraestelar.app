#!/usr/bin/env node
/* Auditoría de identidad y conservación por canal — Fase B (cuantificación).
 *
 * Extiende harness_canales_g.js con los DOS momentos de la población sub-mlim:
 *   ⟨I⟩   = Σ f          (media, flujo/arcsec²)      — ya lo medía el arnés base
 *   σ²    = Σ f² / Ω²    (varianza SBF)              — lo nuevo
 *   N_eff = ⟨I⟩² / σ² = (Σf)² / Σf²                  — estrellas efectivas/beam
 *
 * y el Δmlim de la hipótesis H2: qué pasa si el flujo de glow+niebla se
 * realimenta a cieloEfectivo como fondo uniforme (variante escalar del #186).
 *
 * Importa las leyes de producción (magLimite, sumaSB, veloSB, ctxFotometrico),
 * no las reimplementa (ADR 0008). Los datos salen de las mismas fixtures
 * cacheadas que harness_canales_g.js, sin tocar la red.
 *
 *   node scripts/harness_auditoria_canales.js [--sqm N] [--json fichero]      */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : def; }
var SQM = +arg('sqm', 21.5), T = 0.8, POJO = 7, AFOV = 68, APERTURA = 457; // 18″
function magConsulta(aumentos) { return R.profundidadConsulta(APERTURA, T, aumentos, true); }
var COLA_GLOW = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin); // 2,30 mag
var PATCH = R.fot.NIEBLA_GANANCIA_ESTETICA;

var BANCO = [
  ['M45', 56.750, 24.117, 55, 'abierto cercano brillante'],
  ['M11', 282.771, -6.270, 7, 'abierto rico lejano'],
  ['NGC 7789', 359.334, 56.726, 8, 'abierto rico, turnoff débil'],
  ['NGC 2266', 100.862, 26.974, 2.5, 'abierto pobre (control)'],
  ['M7', 268.463, -34.793, 40, 'abierto sobre campo de Sgr'],
  ['M24', 274.200, -18.550, 45, 'nube estelar de Sagitario']
];
var EQUIPOS = [{ id: '100×', MAG: 100 }, { id: '229×', MAG: 229 }];
var DIR = path.join(__dirname, 'fixtures', 'gaia');

function cacheDe(id, rad) {
  return path.join(DIR, 'canales_' + id.toLowerCase().replace(/\s+/g, '') + '_' + rad.toFixed(3) + '.json');
}
function leer(id, rad) {
  var f = cacheDe(id, rad);
  if (!fs.existsSync(f)) throw new Error('falta fixture ' + f);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function sb(flujo, areaAs2) { return (flujo > 0 && areaAs2 > 0) ? -2.5 * Math.log10(flujo / areaAs2) : Infinity; }

function medir(c, eq) {
  var campoArcmin = AFOV * 60 / eq.MAG;
  var rad = Math.min((360 / 60) * 0.72, Math.max(0.12, (campoArcmin / 60) * 0.72));
  var pupila = APERTURA / eq.MAG;
  var j = leer(c[0], rad);
  var estrellas = (j.data || []).map(function (d) { return [+d[0], +d[1], +d[2]]; });
  var velo = R.veloSB(j.fondo);

  var cielo = { sqm: SQM, pupilaSalida: pupila, pupilaOjo: POJO, transmision: T, aumentos: eq.MAG };
  var mlim = R.magLimite({ apertura: APERTURA, aumentos: eq.MAG, transmision: T, sqm: SQM, pupilaOjo: POJO });
  if (velo != null) {
    cielo.veloSB = velo;
    mlim = R.magLimite({ apertura: APERTURA, aumentos: eq.MAG, transmision: T, sqm: SQM, pupilaOjo: POJO, veloSB: velo });
  }
  var corte = mlim + COLA_GLOW;

  var rMedidaArcmin = Math.min(c[3], campoArcmin / 2);
  var areaMedida = Math.PI * Math.pow(rMedidaArcmin * 60, 2);   // arcsec²
  var areaCono = Math.PI * Math.pow(rad * 3600, 2);             // arcsec²

  var F = { glow: 0, niebla: 0 }, F2 = { glow: 0, niebla: 0 }, N = { glow: 0, niebla: 0 };
  var cos0 = Math.cos(c[2] * Math.PI / 180);
  for (var i = 0; i < estrellas.length; i++) {
    var g = estrellas[i][2];
    if (!(g > 0)) continue;
    var dra = ((estrellas[i][0] - c[1] + 540) % 360) - 180;
    var dx = dra * cos0 * 60, dy = (estrellas[i][1] - c[2]) * 60;
    if (Math.sqrt(dx * dx + dy * dy) > rMedidaArcmin) continue;
    if (g <= mlim) continue;                        // resuelto, fuera del sub-mlim
    var k = (g <= corte) ? 'glow' : 'niebla';
    var f = Math.pow(10, -0.4 * g);
    F[k] += f; F2[k] += f * f; N[k]++;
  }
  // Velo: banda truncada, uniforme. flujo y m2 (Σf²) vienen del TAP sobre el cono.
  var flujoVelo = (j.fondo && j.fondo.flujo > 0) ? j.fondo.flujo : 0;
  var m2Velo = (j.fondo && j.fondo.m2 > 0) ? j.fondo.m2 : 0;
  var FveloDisk = flujoVelo * (areaMedida / areaCono);      // flujo en el disco
  var F2veloDisk = m2Velo * (areaMedida / areaCono);        // Σf² en el disco (escala lineal)

  function canal(nombre, Sf, Sf2) {
    var I = Sf / areaMedida;
    var sig2 = Sf2 / (areaMedida * areaMedida);
    var Nef = Sf2 > 0 ? (Sf * Sf) / Sf2 : 0;
    return { flujo: Sf, I: I, mu: sb(Sf, areaMedida), sigma2: sig2, N_eff: Nef };
  }

  var glow = canal('glow', F.glow, F2.glow);
  var niebla = canal('niebla', F.niebla, F2.niebla);
  var veloC = canal('velo', FveloDisk, F2veloDisk);
  var Stot = F.glow + F.niebla + FveloDisk;
  var S2tot = F2.glow + F2.niebla + F2veloDisk;
  var total = { flujo: Stot, mu: sb(Stot, areaMedida), N_eff: S2tot > 0 ? (Stot * Stot) / S2tot : 0 };

  /* N_eff por beam. N_eff(disco) = (Σf)²/Σf² es independiente del área; el número
     POR BEAM es ese mismo multiplicado por la fracción de disco que ocupa un beam:
       N_eff_beam = N_eff_disco · Ω_beam/Ω_disco
     con Ω_beam el círculo de diámetro θ_R(SBe)/M (la escala de integración de
     Riccò, la misma que usa el suavizado de la niebla y el grano del cúmulo). */
  var ctx = R.ctxFotometrico(cielo, R.thetaNieblaArcmin(cielo));
  var thRMin = R.thetaNieblaArcmin(cielo);            // arcmin (diámetro)
  var omegaBeam = Math.PI * Math.pow(thRMin * 60 / 2, 2);   // arcsec²
  var neffBeam = total.N_eff * (omegaBeam / areaMedida);

  // ── H2 escalar: realimentar glow y/o niebla como fondo uniforme sobre el disco ──
  var sbGlow = sb(F.glow, areaMedida);
  var sbNiebla = sb(F.niebla, areaMedida);
  var cieloActual = R.sumaSB(SQM, velo);                    // mag/arcsec²
  function dmlimDe(sbExtra) {
    if (!isFinite(sbExtra)) return 0;
    var h2 = R.sumaSB(cieloActual, sbExtra);
    var m2 = R.magLimite({ apertura: APERTURA, aumentos: eq.MAG, transmision: T, sqm: h2, pupilaOjo: POJO });
    return m2 - mlim;
  }
  var dmlimGlow = dmlimDe(sbGlow);
  var dmlimNiebla = dmlimDe(sbNiebla);
  var dmlimAmbos = dmlimDe(R.sumaSB(sbGlow, sbNiebla));

  // Efecto del parche sobre N_eff: el parche es un escalar ×k sobre el flujo PINTADO;
  // N_eff = (Σf)²/Σf² es INVARIANTE a un escalar global. Lo pintado no cambia σ.
  return {
    objeto: c[0], equipo: eq.id, mlim: mlim,
    dmlimGlow: dmlimGlow, dmlimNiebla: dmlimNiebla, dmlimAmbos: dmlimAmbos,
    rMedidaArcmin: rMedidaArcmin, areaMedida: areaMedida, omegaBeam: omegaBeam, truncada: !!j.fondo,
    corteTruncado: j.fondo ? j.fondo.corte : null,
    cieloActual: cieloActual, sbGlow: sbGlow, sbNiebla: sbNiebla,
    n: { glow: N.glow, niebla: N.niebla },
    glow: glow, niebla: niebla, velo: veloC, total: total, neffBeam: neffBeam,
    patch: PATCH
  };
}

function pct(x) { return (100 * x).toFixed(1) + '%'; }
function mag(x) { return isFinite(x) ? x.toFixed(2) : '—'; }

(function () {
  var filas = [];
  BANCO.forEach(function (c) { EQUIPOS.forEach(function (eq) { filas.push(medir(c, eq)); }); });

  console.log('Fase B · momentos y N_eff sub-mlim · 457 mm (18″), sqm ' + SQM + ', parche ' + PATCH + '\n');
  console.log('objeto   eq   mlim  Δm_glow Δm_nieb Δm_amb |  μ_glow   Nglow | μ_niebla  Nniebla | μ_velo    Nvelo  | N_disco N_beam');
  console.log('-'.repeat(125));
  filas.forEach(function (f) {
    var g = f.glow.flujo > 0 ? f.glow.N_eff.toFixed(0) : '—';
    var n = f.niebla.flujo > 0 ? f.niebla.N_eff.toFixed(0) : '—';
    var v = f.velo.flujo > 0 ? f.velo.N_eff.toFixed(0) : '—';
    console.log(
      f.objeto.padEnd(9) + f.equipo.padEnd(5) + mag(f.mlim) +
      '  ' + f.dmlimGlow.toFixed(2) + '   ' + f.dmlimNiebla.toFixed(2) + '   ' + f.dmlimAmbos.toFixed(2) +
      '  | ' + mag(f.sbGlow).padStart(6) + ' ' + g.padStart(6) +
      ' | ' + mag(f.sbNiebla).padStart(7) + ' ' + n.padStart(7) +
      ' | ' + mag(f.velo.mu).padStart(7) + ' ' + v.padStart(7) +
      '  | ' + f.total.N_eff.toFixed(0).padStart(7) + ' ' + f.neffBeam.toFixed(2).padStart(6));
  });
  console.log('\nDetalle de σ² (flux²/arcsec²), flujo depositado (unidades estrella G=0) y beam:');
  filas.forEach(function (f) {
    console.log('  ' + f.objeto + ' ' + f.equipo + '  cielo ' + f.cieloActual.toFixed(2) +
      ' · σ² glow ' + f.glow.sigma2.toExponential(2) + ', niebla ' + f.niebla.sigma2.toExponential(2) +
      ', velo ' + f.velo.sigma2.toExponential(2) +
      ' · flujo glow ' + f.glow.flujo.toExponential(3) + ' niebla ' + f.niebla.flujo.toExponential(3) + ' velo ' + f.velo.flujo.toExponential(3) +
      ' · Ω_beam ' + f.omegaBeam.toExponential(2) + ' as²');
  });

  var salida = arg('json', null);
  if (salida) fs.writeFileSync(salida, JSON.stringify(filas, null, 2));
})();
