#!/usr/bin/env node
/* #617 · ¿El exceso de filas de M13 en 0,5-1 r_h es de `num` o de `c`? Aplica
   el prerregistro de ADR 0039, «El exceso de filas en 0,5-1 r_h», sin mover
   dominio ni listón.

   node scripts/spike_617_exceso.js ruta/hlsp_acsggct_hst_acs-wfc_ngc6205_r.rdviq.cal.adj.zpt [--619]
   --619: control y reparto con 5/6p + BP−RP (ADR 0039, «Qué cuenta como recuperada la Tabla A.1»)
   (el .zpt no está en el repo: 26 MB, MAST /pub/hlsp/acsggct/ngc6205/) */
'use strict';
var fs = require('fs'), path = require('path');
var F = require('./flujo_hst.js'), X = require('./exceso_617.js');
global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender, C = global.window.BitacoraCumulos;

var e = global.window.BITACORA_GLOBULARES.filter(function (f) { return f[0] === 'NGC 6205'; })[0];
var RA0 = e[2], DEC0 = e[3], RH_AS = e[5] * 60, COS0 = Math.cos(DEC0 * Math.PI / 180);
function plano(ra, dec) { return { x: (ra - RA0) * COS0 * 3600, y: (dec - DEC0) * 3600 }; }

// Modelo: la población de producción, con el corte de la consulta del fixture como el arnés.
var pob = C.poblacion(C.fichaDeFila(e));
var mAp = pob.magnitudes, num = pob.estrellasPorBin, NB = mAp.length, CORTE_G = 18.5;
var MBORDE = C.config.mCutGeneracion;   // borde de bin del arnés (harness_fusion_blending.js)
for (var b0 = 0; b0 + 1 < NB; b0++)
  if (mAp[b0] <= MBORDE && mAp[b0 + 1] > MBORDE) { MBORDE = (mAp[b0] + mAp[b0 + 1]) / 2; break; }
if (b0 + 1 >= NB) throw new Error('mCutGeneracion fuera de la LF: sin borde de bin');
var V0 = MBORDE - 1, V1 = MBORDE;       // «17.07–18.07» del arnés

// HST.
var lineas = fs.readFileSync(process.argv[2], 'utf8').split('\n');
var cab = lineas[0].trim().split(/\s+/);
var iV = cab.indexOf('Vvega'), iI = cab.indexOf('Ivega'), iVg = cab.indexOf('Vground'), iRA = cab.indexOf('RA'), iDE = cab.indexOf('Dec');
if ([iV, iI, iVg, iRA, iDE].some(function (i) { return i < 0; })) throw new Error('cabecera inesperada: ' + cab.join(' '));
var hst = [];
lineas.slice(1).forEach(function (l) {
  var c = l.trim().split(/\s+/);
  if (c.length < cab.length) return;
  var p = plano(+c[iRA], +c[iDE]);
  p.v = +c[iV]; p.i = +c[iI]; p.vg = +c[iVg];
  hst.push(p);
});

// Gaia: fixture entero (miembros y campo, como HST).
var VAL = path.join(__dirname, '../simulador_ocular/docs/validacion');
var esMezcla = require('./mezcla_gaia.js').leer(path.join(VAL, 'm13_gaia_dr3_mezcla.csv'));
var ruwe = new Map();   // #619: ruwe del sidecar (nulo = solución 2p)
fs.readFileSync(path.join(VAL, 'm13_gaia_dr3_mezcla.csv'), 'utf8').trim().split('\n').slice(1).forEach(function (l) {
  var c = l.split(',');
  ruwe.set(c[0] + ',' + c[1], c[2] === '' ? null : +c[2]);
});
var gaia = fs.readFileSync(path.join(VAL, 'm13_gaia_dr3.csv'), 'utf8').trim().split('\n').slice(1).map(function (l) {
  var c = l.split(','), fila = [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]], p = plano(fila[0], fila[1]);
  p.g = fila[2]; p.vGaia = R.magVGaia(fila); p.color = fila[3] != null; p.mezcla = esMezcla.get(c[0] + ',' + c[1]); p.r = Math.hypot(p.x, p.y);
  if (!ruwe.has(c[0] + ',' + c[1])) throw new Error('fila sin sidecar: ' + c[0] + ',' + c[1]);
  p.ruwe = ruwe.get(c[0] + ',' + c[1]);
  return p;
});

// Alineado y G de HST: los de #614, sin cambios.
var control = gaia.filter(function (p) { return p.g >= 16.5 && p.g <= 18.5 && !p.mezcla; });
var d = F.alinear(control, hst.filter(function (s) { return s.v < 20; }));
hst.forEach(function (s) { s.x += d.dx; s.y += d.dy; s.r = Math.hypot(s.x, s.y); });
var idx01 = F.indice(hst, 0.1), pares = [];
control.forEach(function (p) {
  var s = F.masCercana(p, idx01, 0.1);
  if (s) pares.push({ g: p.g, v: s.v, i: s.i });
});
var t = F.ajustarG(pares);
hst.forEach(function (s) { s.g = t.g(s.v, s.i); });

// Dominio: huella ACS (celdas de 4″, ≥ 3 HST, borde erosionado).
var LADO = 4, H = X.huella(hst, LADO, 3);
function enAnillo(r0, r1) { return function (p) { return p.r > r0 && p.r <= r1 && H.dentro(p); }; }
function cobertura(r0, r1) {   // fracción del anillo dentro de la huella, en rejilla fija de 1″
  var n = 0, s = 0;
  for (var x = -r1; x <= r1; x += 1) for (var y = -r1; y <= r1; y += 1) {
    var r = Math.hypot(x, y);
    if (r <= r0 || r > r1) continue;
    n++; if (H.dentro({ x: x, y: y })) s++;
  }
  return s / n;
}
// Modelo integrado sobre las celdas de la huella dentro del anillo (subceldas de 1″).
function modelo(r0, r1, enTramo) {
  var n = 0, nc = 0;
  H.celdas.forEach(function (cel) {
    for (var a = -1.5; a <= 1.5; a++) for (var b = -1.5; b <= 1.5; b++) {
      var x = cel.x + a, y = cel.y + b, r = Math.hypot(x, y);
      if (r <= r0 || r > r1) continue;
      var s = pob.sigma(r);
      for (var k = 0; k < NB; k++) {
        if (!enTramo(k)) continue;
        n += s * num[k]; nc += s * num[k] * pob.completitud(mAp[k], r, CORTE_G);
      }
    }
  });
  return { n: n, c: nc / n };
}
function f(x, dd) { return x.toFixed(dd === undefined ? 3 : dd).replace('.', ','); }

console.log('#617 · exceso de filas de M13 en 0,5-1 r_h: num o c (prerregistro ADR 0039)');
console.log('HST: ' + hst.length + ' estrellas; alineado dx = ' + f(d.dx) + '″, dy = ' + f(d.dy) + '″; G − V sobre ' + pares.length + ' pares (#614)');
console.log('k = ' + C.config.gaiaCrowdingK + '; tramo V ' + f(V0, 2) + '-' + f(V1, 2) + ' (bordes de bin del arnés); corte G ' + f(CORTE_G, 1));

// Control del método: región 0,5-2,2′ de la Tabla A.1, G 16-18.
var enA1 = enAnillo(30, 132);
var cg = gaia.filter(function (p) { return p.g >= 16 && p.g < 18 && enA1(p); }).length;
var ch = hst.filter(function (s) { return s.g >= 16 && s.g < 18 && enA1(s); }).length;
var pasaControl = X.control(cg, ch);
console.log('\nControl (Tabla A.1, 0,5-2,2′ ∩ ACS, cobertura ' + f(100 * cobertura(30, 132), 1) + ' %), G 16-18:');
console.log('  N_Gaia / N_HST = ' + cg + ' / ' + ch + ' = ' + f(100 * cg / ch, 1) + ' %  (Fabricius 47 %, ±10) → ' + (pasaControl ? 'VALE' : 'NO VALE: sin veredicto'));

// Medida: anillo 0,5-1 r_h ∩ ACS, V 17,07-18,07.
var r0 = 0.5 * RH_AS, r1 = RH_AS, en = enAnillo(r0, r1);
var nHst = hst.filter(function (s) { return s.vg > V0 && s.vg <= V1 && en(s); }).length;
var nGaia = gaia.filter(function (p) { return p.vGaia > V0 && p.vGaia <= V1 && en(p); }).length;
var mod = modelo(r0, r1, function (k) { return mAp[k] > V0 && mAp[k] <= V1; });
var v = X.veredicto({ nHst: nHst, nMod: mod.n, nGaia: nGaia, cMod: mod.c });
console.log('\nAnillo 0,5-1 r_h (' + f(r0, 1) + '-' + f(r1, 1) + '″) ∩ ACS, cobertura ' + f(100 * cobertura(r0, r1), 1) + ' %, V ' + f(V0, 2) + '-' + f(V1, 2) + ':');
console.log('  N_HST (Vground) = ' + nHst + '   N_Gaia (magVGaia) = ' + nGaia + '   num del modelo = ' + f(mod.n, 1) + '   c_mod = ' + f(mod.c));
console.log('  AC1  R_num = N_HST / num = ' + f(v.num.q) + ' ± ' + f(v.num.sigma) + '  → ' + (!pasaControl ? 'fuera de banda: ' + !(!v.num.falla) + ' (sin voto)' : v.num.falla ? 'FALLA num' : 'num vale'));
console.log('  AC2  c_emp = N_Gaia / N_HST = ' + f(v.cEmp) + ';  c_emp / c_mod = ' + f(v.k.q) + ' ± ' + f(v.k.sigma) + '  → ' + (!pasaControl ? 'fuera de banda: ' + !(!v.k.falla) + ' (sin voto)' : v.k.falla ? 'FALLA k' : 'k vale'));
console.log('  producto R_num · c_emp / c_mod = ' + f(v.producto) + '  (arnés: cat/num·c 2,79, solo miembros) → ' + (v.cuadra ? 'cuadra' : 'NO cuadra'));

// Informativo, sin voto: la misma cuenta en G (G de HST del ajuste de #614).
var gH = hst.filter(function (s) { return s.g >= 17 && s.g < 18 && en(s); }).length;
var gG = gaia.filter(function (p) { return p.g >= 17 && p.g < 18 && en(p); }).length;
console.log('\nInformativo (sin voto), mismo dominio, G 17-18: N_Gaia / N_HST = ' + gG + ' / ' + gH + ' = ' + f(gG / gH));
/* Diagnóstico POST HOC (sin voto, escrito tras ver fallar el control): Fabricius
   da «the combined completeness of the astrometry and the photometry». Si
   cuenta solo las fuentes con BP−RP, el control y la región del núcleo
   deberían salir con las filas con color. */
console.log('\nDiagnóstico post hoc (sin voto): G 16-18, N_Gaia / N_HST, todas las filas | solo con BP−RP | Fabricius');
[[0, 30, 'r < 0,5′', 7], [30, 132, '0,5-2,2′', 47]].forEach(function (z) {
  var en2 = enAnillo(z[0], z[1]);
  var nh = hst.filter(function (s) { return s.g >= 16 && s.g < 18 && en2(s); }).length;
  var g2 = gaia.filter(function (p) { return p.g >= 16 && p.g < 18 && en2(p); });
  var gc2 = g2.filter(function (p) { return p.color; }).length;
  console.log('  ' + z[2].padEnd(9) + f(100 * g2.length / nh, 1).padStart(6) + ' % | ' + f(100 * gc2 / nh, 1).padStart(5) + ' % | ' + z[3] + ' %   (N_HST ' + nh + ')');
});
console.log('Veredicto: ' + (!pasaControl ? 'sin veredicto (control)' :
  (v.noCuadra || !v.cuadra) ? 'el método no cuadra' : [v.num.falla && 'falla num', v.k.falla && 'falla k'].filter(Boolean).join(' y ')));

/* #619 · --619: el control y el reparto con el criterio de recuento del
   prerregistro (ADR 0039, «Qué cuenta como recuperada la Tabla A.1»):
   astrometría 5/6p (ruwe no nulo) y BP−RP. Sin el flag, la salida de #617 no cambia. */
if (process.argv.indexOf('--619') > 0) {
  var crit = gaia.filter(X.recuperada);
  console.log('\n══ #619 · criterio: astrometría 5/6p (ruwe no nulo) y BP−RP; ' + crit.length + ' de ' + gaia.length + ' filas del fixture');
  var c19 = crit.filter(function (p) { return p.g >= 16 && p.g < 18 && enA1(p); }).length;
  var pasa19 = X.control(c19, ch);
  console.log('Control (0,5-2,2′ ∩ ACS, G 16-18): N_crit / N_HST = ' + c19 + ' / ' + ch + ' = ' + f(100 * c19 / ch, 1) +
              ' %  (Fabricius 47 %, ±10; todas las filas ' + f(100 * cg / ch, 1) + ' %) → ' + (pasa19 ? 'VALE' : 'NO VALE'));
  var en05 = enAnillo(0, 30);
  var h05 = hst.filter(function (s) { return s.g >= 16 && s.g < 18 && en05(s); }).length;
  var c05 = crit.filter(function (p) { return p.g >= 16 && p.g < 18 && en05(p); }).length;
  console.log('Informativo (sin voto), r < 0,5′ ∩ ACS: ' + c05 + ' / ' + h05 + ' = ' + f(100 * c05 / h05, 1) + ' %  (Fabricius 7 %)');
  if (!pasa19) console.log('Veredicto #619: el control no vale; se cierra sin tocar c (AC5)');
  else {
    var nCrit = crit.filter(function (p) { return p.vGaia > V0 && p.vGaia <= V1 && en(p); }).length;
    var vc = X.veredicto({ nHst: nHst, nMod: mod.n, nGaia: nCrit, cMod: mod.c });
    console.log('Reparto (0,5-1 r_h ∩ ACS, V ' + f(V0, 2) + '-' + f(V1, 2) + '): N_crit = ' + nCrit + ', N_HST = ' + nHst + ', num = ' + f(mod.n, 1) + ', c_mod = ' + f(mod.c));
    console.log('  R_num = ' + f(vc.num.q) + ' ± ' + f(vc.num.sigma) + (vc.num.falla ? '  → FALLA num' : '  → num vale'));
    console.log('  c_crit / c_mod = ' + f(vc.cEmp) + ' / ' + f(mod.c) + ' = ' + f(vc.k.q) + ' ± ' + f(vc.k.sigma) + (vc.k.falla ? '  → FALLA k' : '  → k vale'));
    console.log('  todas las filas: c_emp / c_mod = ' + f(v.k.q) + ' ± ' + f(v.k.sigma) + (v.k.falla ? '  → fuera' : '  → dentro'));
    console.log('Veredicto #619: ' + ({ num: '`num`', 'num y k': '`num` y k', k: 'k', 'c-cuenta': 'lo que cuenta `c` (el catálogo cuenta filas que `c` no cuenta)', ninguno: 'ninguno' })[X.lectura619(vc, v)]);
  }
}
