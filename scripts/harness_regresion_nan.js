#!/usr/bin/env node
/* Regresión visual/fotométrica de la capa PS1 sobre 5 galaxias, antes y después
   del cambio de semántica de ausencia + deltaExp (INFORME2/INFORME3).
   Uso: ETIQUETA=antes|despues node scripts/harness_regresion_nan.js
   Salidas: .scratch/diagnostico-oscuros/reg_<alias>_<etiqueta>.{pgm,json} */
'use strict';
var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var OUT = path.join(RAIZ, '.scratch', 'diagnostico-oscuros');
fs.mkdirSync(OUT, { recursive: true });
var ETIQ = process.env.ETIQUETA || 'despues';

global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;
var CAT = global.window.BITACORA_GALAXIAS;
var FOT = R.fot, PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);
var IN_GAIA = path.join(RAIZ, '.scratch', 'quitar-general');
var SIZE = 720, AFOV = 70, CFG = { D: 457.2, M: 190, sqm: 21.2 };

var OBJS = [
  { cat: 'NGC 5194', alias: 'M51',    csv: 'gaia_ngc5194.csv' },
  { cat: 'NGC 3031', alias: 'M81',    csv: 'gaia_ngc3031.csv' },
  { cat: 'NGC 4594', alias: 'M104',   csv: 'gaia_ngc4594.csv' },
  { cat: 'NGC 5457', alias: 'M101',   csv: 'gaia_ngc5457.csv' },
  { cat: 'NGC 205',  alias: 'NGC205', csv: 'gaia_ngc205.csv' }
];

function filaCat(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; return null; }
function leerGaia(f) {
  return fs.readFileSync(path.join(IN_GAIA, f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}
function pgmGris(nombre, datos, W, H) {
  var lin = ['P2', W + ' ' + H, '255'];
  for (var y = 0; y < H; y++) {
    var l = [];
    for (var x = 0; x < W; x++) l.push(Math.max(0, Math.min(255, Math.round(datos[y * W + x]))));
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT, nombre + '.pgm'), lin.join('\n') + '\n');
}
function pct(arr, p) {
  var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
  return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
}

var cola = Promise.resolve();
OBJS.forEach(function (O) { cola = cola.then(function () { return corre(O); }); });
cola.then(function () { console.log('regresión (' + ETIQ + ') lista.'); });

function corre(O) {
  var g = filaCat(O.cat);
  var gal = { nombre: g[0], ra: g[2], dec: g[3], reArcsec: g[4], ba: g[5], pa: g[6],
              magV: g[7], n: g[8], bt: g[9], nMedido: g[11] || 0,
              ladoArcmin: window.BitacoraPS1.ps1LadoArcmin(g[4]) };
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null };
    fSim.afin = window.BitacoraPS1.ps1AfinParche(fSim, gal);
    var enPx = window.BitacoraPS1.ps1EstrellasEnPixeles(fSim, gal, leerGaia(O.csv));
    var escena = window.BitacoraPS1.ps1EscenaEnParche(fSim, gal, window.BitacoraPS1.ps1GalaxiasDelCampo(CAT, gal.ra, gal.dec, gal.ladoArcmin));
    var limpio = window.BitacoraPS1.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx,
      { afin: fSim.afin, ba: gal.ba, pa: gal.pa, escena: escena });
    var comps = window.BitacoraPS1.ps1ComponentesSersic(gal);
    var datos = window.BitacoraPS1.ps1AnclarACatalogo(limpio, F.ancho, F.alto, {
      magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
      ladoArcmin: gal.ladoArcmin, escalaAs: F.escalaAs });
    var peso = window.BitacoraPS1.ps1PesoImagen(datos, F.ancho, F.alto, F.escalaAs);
    var perfil = window.BitacoraPS1.ps1PerfilEnParche(comps, gal.pa, F.ancho, F.alto, fSim.afin);
    var parche = { ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
                   ancho: F.ancho, alto: F.alto, afin: fSim.afin,
                   comps: comps, pa: gal.pa, halo: window.BitacoraPS1.ps1MedidasHalo(gal, comps),
                   thetaIntArcmin: window.BitacoraPS1.ps1ThetaIntArcmin(comps, gal.ba),
                   peso: peso, escalaMezcla: window.BitacoraPS1.ps1EscalaMezcla(datos, peso, perfil),
                   datos: datos };
    var cielo = { pupilaSalida: CFG.D / CFG.M, pupilaOjo: 7, sqm: CFG.sqm,
                  aumentos: CFG.M, realceMax: PS1.realceMax, perceptual: true };
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / CFG.M * 60, size: SIZE,
              cielo: cielo, apertura: CFG.D };
    var difuso = new Float32Array(SIZE * SIZE);
    window.BitacoraPS1.ps1PintarParche(difuso, parche, o);
    var c = R.ctxFotometrico(cielo, parche.thetaIntArcmin);
    var E = new Float32Array(difuso.length), flujo = 0;
    for (var i = 0; i < difuso.length; i++) {
      var Fx = difuso[i]; flujo += Fx;
      if (Fx > 0 && FOT.GAMMA_PERCEPTUAL !== 1) Fx = R.realzarPerceptual(Fx, c.Fcielo, c.rango, 0, PS1.realceMax);
      E[i] = c.nivelFondo + R.valorDeFlujo(Fx, c.Fcielo, c.rango);
    }
    // anillos elípticos relativos al semieje de la isofota 25
    var aAs = parche.halo.aArcmin * 60 / 2;
    var aspx = o.arcmin * 60 / SIZE, cx = (SIZE - 1) / 2, cy = (SIZE - 1) / 2;
    var paR = (gal.pa || 0) * Math.PI / 180, sn = Math.sin(paR), co = Math.cos(paR);
    var ba = (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1;
    var cuerpo = [], borde = [], fuera = [];
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var norte = -(y - cy) * aspx, este = -(x - cx) * aspx;
      var u = este * sn + norte * co, v2 = -este * co + norte * sn;
      var r = Math.hypot(u, v2 / ba) / aAs;
      var e = E[y * SIZE + x];
      if (r < 0.8) { if (r >= 0.2) cuerpo.push(e); }
      else if (r < 1.2) borde.push(e);
      else if (r < 1.6) fuera.push(e);
    }
    var pintFuera = 0;
    for (i = 0; i < fuera.length; i++) if (fuera[i] > c.nivelFondo + 0.5) pintFuera++;
    var m = { etiqueta: ETIQ, umbralSB: +R.sbUmbralContraste(c).toFixed(3),
              fondo: +c.nivelFondo.toFixed(2), flujoTotal: flujo,
              cuerpo: { p20: +pct(cuerpo, 0.2).toFixed(2), p50: +pct(cuerpo, 0.5).toFixed(2),
                        p80: +pct(cuerpo, 0.8).toFixed(2), max: +pct(cuerpo, 1).toFixed(2) },
              borde_p50: +pct(borde, 0.5).toFixed(2),
              fuera_pintado_pct: +(100 * pintFuera / Math.max(1, fuera.length)).toFixed(1) };
    fs.writeFileSync(path.join(OUT, 'reg_' + O.alias + '_' + ETIQ + '.json'), JSON.stringify(m, null, 1));
    pgmGris('reg_' + O.alias + '_' + ETIQ, E, SIZE, SIZE);
    console.log(O.alias + ' (' + ETIQ + '): cuerpo p20/p50/p80 ' + m.cuerpo.p20 + '/' + m.cuerpo.p50 +
      '/' + m.cuerpo.p80 + ' max ' + m.cuerpo.max + ' borde ' + m.borde_p50 +
      ' fuera% ' + m.fuera_pintado_pct + ' flujo ' + flujo.toExponential(3));
  });
}
