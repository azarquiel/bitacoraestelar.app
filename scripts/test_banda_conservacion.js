#!/usr/bin/env node
/* Conservación del flujo EN LA BANDA DE TRANSICIÓN (hipótesis 3 del
   diagnóstico de M13, docs/halo_v7/diagnostico_estrellas_perdidas.md).

   El reparto de la Capa 2 es una partición: cada estrella o va al campo
   estadístico o se dibuja. La banda de transición rompe esa partición sin que
   ningún test lo viera:

     · el campo se integra con corte DURO en m_res+δ, `S1(m_res+δ)`, así que
       ninguna estrella de la banda [m_res−δ, m_res+δ] está en el velo;
     · pero cada estrella de la banda se dibuja con peso a(m) < 1, vía
       `m_eff = m + 2,5·log10(1/a)`.

   El (1−a) no está en ninguno de los dos sitios: se pierde. El test de
   conservación que ya existía (test_cumulo_render.js) no lo ve porque cuenta lo
   dibujado como `Fresuelto(m_res+δ)` —todas las estrellas de la banda a flujo
   entero—, que es la partición IDEAL, no la que se pinta.

   Aquí se cuenta lo que de verdad se dibuja:

     dibujado(r) = Fresuelto(m_res−δ) + ∫[m_res−δ, m_res+δ] a(m)·dF(m)
     campo(r)    = S1campo(m_res) = S1(m_res+δ) + ∫banda (1−a(m))·dF(m)
     total(r)    = Ftotal

   y se exige campo + dibujado = total al 1 % (ADR 0003, tolerancia de Fase 2).
   La columna "partición ideal" es el corte duro por los dos lados —campo
   S1(m_res+δ) y la banda entera dibujada a flujo íntegro—: cierra siempre, y
   por eso no veía nada. Es la que mide test_cumulo_render.

   Nada de la ley se reimplementa (ADR 0008): a(m) es `C.atenuacionTransicion`,
   la del render, y las rebanadas de flujo salen de `pob.Fresuelto`, la de la
   población. La cuadratura sólo suma.

   node scripts/test_banda_conservacion.js */
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

var REFS = ['NGC 104', 'NGC 6205', 'NGC 5139'];
var EQUIPOS = [
  { D: 100, MAG: 50, sqm: 21.5 },
  { D: 200, MAG: 100, sqm: 21.5 },
  { D: 400, MAG: 200, sqm: 21.5 },
  { D: 467, MAG: 173, sqm: 21.0 }     // el de la captura del simulador
];

/* Flujo DIBUJADO por unidad de perfil a un radio con m_res dada: las resueltas
   enteras más la banda con su peso. La rebanada [m1, m2] de la LF vale
   Fresuelto(m2) − Fresuelto(m1) (flujo de las más brillantes que m2 menos el de
   las más brillantes que m1), y se pesa con la a(m) del centro de la rebanada.
   PASOS por magnitud: a(m) es un smoothstep, así que la regla del punto medio
   converge en O(h²); con 200 rebanadas el error de cuadratura es ~1e-6, tres
   órdenes por debajo de la tolerancia del test. */
var PASOS = 200;
function fDibujado(pob, mRes, delta) {
  var entero = pob.Fresuelto(mRes - delta);
  var h = 2 * delta / PASOS, suma = 0;
  for (var i = 0; i < PASOS; i++) {
    var m1 = mRes - delta + i * h, m2 = m1 + h;
    var dF = pob.Fresuelto(m2) - pob.Fresuelto(m1);
    suma += C.atenuacionTransicion(m1 + h / 2, mRes, delta) * dF;
  }
  return entero + suma;
}

/* Balance sobre el perfil entero, pesado por Sigma(r): el número que sale es la
   fracción del flujo del cúmulo que el render no pinta en ningún sitio. Se
   recorre la tabla radial del render, que es la m_res(r) real. */
function balance(cum, eq) {
  var SIZE = 512, delta = C.config.delta;
  var pob = C.poblacionCacheada(cum, 0);
  var arcmin = Math.ceil(2.4 * pob.rtAs / 60);
  var difuso = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: arcmin, size: SIZE,
    cielo: { pupilaSalida: eq.D / eq.MAG, pupilaOjo: 7, sqm: eq.sqm,
             transmision: 0.9, aumentos: eq.MAG, perceptual: true },
    apertura: eq.D, estrellas: []
  });
  var t = res.tabla, campo = 0, dibujado = 0, total = 0, ideal = 0, campoDuro = 0;
  for (var i = 0; i < t.r.length; i++) {
    if (!isFinite(t.mRes[i])) continue;
    var s = pob.sigma(t.r[i]);
    if (!(s > 0)) continue;
    var peso = s * t.r[i] * t.paso;            // 2·pi·r·Sigma(r)·dr, sin el 2·pi
    campo += peso * pob.S1campo(t.mRes[i], delta);
    campoDuro += peso * pob.S1(t.mRes[i] + delta);
    dibujado += peso * fDibujado(pob, t.mRes[i], delta);
    ideal += peso * pob.Fresuelto(t.mRes[i] + delta);
    total += peso * pob.Ftotal;
  }
  return { campo: campo, dibujado: dibujado, ideal: ideal, total: total,
           fuga: (total - campo - dibujado) / total,
           fugaIdeal: (total - campoDuro - ideal) / total, res: res, pob: pob };
}

console.log('Conservación de la banda de transición (ADR 0003, Fase 2: ±1 %)\n');
console.log('  cúmulo     equipo            campo    dibujado    fuga (1−a)   partición ideal');

var peorFuga = 0;
REFS.forEach(function (id) {
  var cum = delCatalogo(id);
  EQUIPOS.forEach(function (eq) {
    var b = balance(cum, eq);
    if (Math.abs(b.fuga) > peorFuga) peorFuga = Math.abs(b.fuga);
    console.log('  ' + id.padEnd(10) + ' ' +
      (eq.D + ' mm ' + eq.MAG + 'x ' + eq.sqm).padEnd(17) +
      (100 * b.campo / b.total).toFixed(1).padStart(6) + ' %' +
      (100 * b.dibujado / b.total).toFixed(1).padStart(10) + ' %' +
      (100 * b.fuga).toFixed(2).padStart(11) + ' %' +
      (100 * b.fugaIdeal).toFixed(2).padStart(15) + ' %');
  });
});

console.log('');
ok(peorFuga <= 0.01,
  'campo + dibujado = F(V_t) al 1 % en las 12 filas (peor fuga ' +
  (100 * peorFuga).toFixed(2) + ' %)');

/* Y la misma fuga vista desde el otro lado: sobre la lista de estrellas que
   pintarCumulo entrega, comparando el flujo de la m_eff con el de la m original.
   Esto no es el modelo, son las estrellas que el observador tiene delante. */
console.log('\nLa misma luz, contada sobre las estrellas que se entregan a dibujar:');
var M13 = delCatalogo('NGC 6205');
var pobM13 = C.poblacionCacheada(M13, 0);
/* Con las de Gaia de verdad: las sintéticas del núcleo nacen por debajo de la
   magnitud límite de cualquier equipo y casi ninguna llega a la banda. El
   fixture es el mismo del arnés de estrellas (cono de 0,24°, G < 18,5). */
var gaia = require('fs').readFileSync(__dirname + '/../docs/halo_v7/m13_gaia_dr3.csv', 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });
var mlimM13 = R.magLimite({ apertura: 467, aumentos: 173, transmision: 0.9,
                            sqm: 21, pupilaOjo: 7 });
var difuso = new Float32Array(512 * 512);
var resM13 = R.pintarCumulo(difuso, M13, {
  ra0: M13.ra, dec0: M13.dec, arcmin: Math.ceil(2.4 * pobM13.rtAs / 60), size: 512,
  cielo: { pupilaSalida: 467 / 173, pupilaOjo: 7, sqm: 21, transmision: 0.9,
           aumentos: 173, perceptual: true },
  apertura: 467, estrellas: gaia.filter(function (s) { return s[2] <= mlimM13; })
});
var fEff = 0, fOrig = 0, enBanda = 0;
resM13.estrellas.forEach(function (e) {
  var m0 = (e[4] != null) ? e[4] : e[2];
  fEff += Math.pow(10, -0.4 * e[2]);
  fOrig += Math.pow(10, -0.4 * m0);
  if (e[2] !== m0) enBanda++;
});
console.log('  M13 467 mm 173x: ' + resM13.estrellas.length + ' estrellas, ' + enBanda +
  ' en la banda; flujo entregado ' + (100 * fEff / fOrig).toFixed(1) + ' % del suyo propio');
console.log('  ese ' + (100 * (1 - fEff / fOrig)).toFixed(1) + ' % no se pierde: es el (1−a)' +
  ' que ahora vive en el velo.');

/* Y que vive ahí de verdad, medido sobre el perfil que el render acaba de
   pintar: el exceso de <I> sobre el corte duro tiene que ser exactamente la
   integral de (1−a) sobre la banda. Sin constantes: si el render usara todavía
   S1(m_res+δ) el exceso sería 0 y esto se pone rojo. */
function fBanda(pob, mRes, delta) {
  var h = 2 * delta / PASOS, suma = 0;
  for (var i = 0; i < PASOS; i++) {
    var m1 = mRes - delta + i * h, m2 = m1 + h;
    suma += (1 - C.atenuacionTransicion(m1 + h / 2, mRes, delta)) *
            (pob.Fresuelto(m2) - pob.Fresuelto(m1));
  }
  return suma;
}
var tM13 = resM13.tabla, peorVelo = 0, menorExceso = Infinity, dl = C.config.delta;
for (var i2 = 0; i2 < tM13.r.length; i2++) {
  if (!isFinite(tM13.mRes[i2])) continue;
  var sM = pobM13.sigma(tM13.r[i2]);
  if (!(sM > 0) || !(tM13.I[i2] > 0)) continue;
  var exceso = tM13.I[i2] / sM - pobM13.S1(tM13.mRes[i2] + dl);
  var esperado = fBanda(pobM13, tM13.mRes[i2], dl);
  if (!(esperado > 0)) continue;
  var dv = Math.abs(exceso / esperado - 1);
  if (dv > peorVelo) peorVelo = dv;
  if (exceso / pobM13.S1(tM13.mRes[i2] + dl) < menorExceso)
    menorExceso = exceso / pobM13.S1(tM13.mRes[i2] + dl);
}
console.log('  el velo engorda entre ' + (100 * menorExceso).toFixed(1) +
  ' % y lo que pida el radio; desvío contra la cuadratura: ' +
  (100 * peorVelo).toFixed(4) + ' %');
ok(peorVelo < 1e-3,
  '<I> − Sigma·S1(m_res+δ) = Sigma·∫banda (1−a)dF en todo el perfil');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
