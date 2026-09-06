#!/usr/bin/env node
/* HARNESS #210: ¿se ve la costura del parche PS1 en una nebulosa que lo llena?

   Medida, no implementación. NGC 6888 a {457 mm · 100× · SQM 21,2}, montaje de
   producción (lib_parche_produccion + ps1PintarParche), sin sprites.

   Densidad de estrellas VISIBLES, en estrellas/arcmin²:
     dentro  = fuentes Gaia proyectadas dentro del parche cuyo píxel del lienzo
               difuso destaca sobre su anillo local (pico ≥ factor × mediana del
               anillo 2–4 px y flujo > 0), MENOS el nulo: el mismo detector a 25″
               de cada fuente, que mide lo que destaca sin estrella (filamento,
               grano del anclaje). Es lo que el observador ve como «grano» del
               recorte atribuible a estrellas.
     fuera   = fuentes Gaia del anillo equivalente (misma área que el parche, a
               continuación de su borde) con g < magLimite: es lo que dibujar()
               pinta como sprite fuera del recorte.
     control = fuentes Gaia con g < magLimite DENTRO del parche: lo que debería
               verse dentro si dentro y fuera obedecieran la misma ley.

   LISTÓN, fijado antes de medir: la costura no se ve si
       0,67 ≤ dentro / fuera ≤ 1,5.
   Poisson con ~100 cuentas es ±10 %; el resto del margen es para el gradiente
   real de densidad estelar en el Cisne. Fuera del intervalo: costura.

   Sale con código 1 si el ratio se sale del listón.

   Uso:  node scripts/harness_costura_parche.js [--obj NGC6888] [--csv gaia_ngc6888.csv]
         [--D 457.2] [--M 100] [--sqm 21.2] [--viaA | --viaB <arcmin>] [--png]
   --viaA: monta el parche con la mlim del equipo (vía A, la de producción).
   --viaB: quita las conservadas a menos de <arcmin> del borde (vía B, emulada). */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);

var arg = { obj: 'NGC6888', csv: 'gaia_ngc6888.csv', D: '457.2', M: '100', sqm: '21.2' };
process.argv.slice(2).forEach(function (a, i, v) { if (a.slice(0, 2) === '--') arg[a.slice(2)] = v[i + 1] || true; });
var D = +arg.D, M = +arg.M, SQM = +arg.sqm, SIZE = 720, AFOV = 70, FACTOR = 1.5;

var CAT = window.BitacoraPS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
function fila(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; throw new Error('sin fila: ' + n); }
var gaia = fs.readFileSync(path.join(__dirname, 'fixtures', 'gaia', arg.csv), 'utf8').trim().split('\n').slice(1)
  .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });

var gal = P.galDeFila(fila(arg.obj));
B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
  var mlimMontaje = arg.viaA ? R.magLimite({ apertura: D, aumentos: M, sqm: SQM }) : undefined;
  var parche = P.montar(F, gal, gaia, CAT, mlimMontaje);   // --viaA: grano recortado a mlim (producción)
  /* --viaB <arcmin>: emula «desvanecer la conservación cerca del borde»: toda
     fuente conservada a menos de esa distancia del borde del recorte se quita
     como si estuviera fuera de la escena (misma máscara y relleno que fuera).
     Solo aquí, no en producción: es la vía que se mide para descartarla. */
  var bandaB = +arg.viaB || 0, perdidaB = 0;
  if (bandaB > 0) {
    var fB = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null, afin: parche.afin };
    var enPxB = window.BitacoraPS1.ps1EstrellasEnPixeles(fB, gal, gaia);
    var bandaPx = bandaB * 60 / F.escalaAs, enBanda = [];
    for (var ib = 0; ib < enPxB.length; ib++) {
      var eb = enPxB[ib];
      if (!window.BitacoraPS1.ps1FuenteEnEscena(parche.escena, parche.afin, eb.x, eb.y)) continue;
      if (Math.min(eb.x, eb.y, F.ancho - 1 - eb.x, F.alto - 1 - eb.y) < bandaPx) enBanda.push(eb);
    }
    parche.datos = window.BitacoraPS1.ps1QuitarEstrellas(parche.datos, F.ancho, F.alto, enBanda,
      { afin: parche.afin, ba: gal.ba, pa: gal.pa });
    var ladoInt = Math.max(0, gal.ladoArcmin - 2 * bandaB);
    perdidaB = 100 * (1 - ladoInt * ladoInt / (gal.ladoArcmin * gal.ladoArcmin));
  }
  var cielo = { pupilaSalida: D / M, pupilaOjo: 7, sqm: SQM, aumentos: M, realceMax: PS1.realceMax, perceptual: true };
  var o = { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / M * 60, size: SIZE, cielo: cielo, apertura: D };
  var difuso = new Float32Array(SIZE * SIZE);
  window.BitacoraPS1.ps1PintarParche(difuso, parche, o);
  var mlim = R.magLimite({ apertura: D, aumentos: M, sqm: SQM });

  // proyección del lienzo, la misma que ps1PintarParche
  var escv = SIZE / (o.arcmin / 60), cos0 = Math.cos(gal.dec * Math.PI / 180);
  var medioLado = (gal.ladoArcmin / 60) * escv / 2;          // px del lienzo
  var areaParche = gal.ladoArcmin * gal.ladoArcmin;            // arcmin²
  var rInt = Math.sqrt(areaParche / Math.PI) * escv / 60;      // px: círculo de igual área que el parche
  var rExt = Math.sqrt(2 * areaParche / Math.PI) * escv / 60;  // px: anillo exterior de igual área
  var asPx = 3600 / escv;
  function px(ra, dec) {
    var dra = (((ra - gal.ra + 540) % 360) - 180) * cos0;
    return { x: SIZE / 2 - dra * escv, y: SIZE / 2 - (dec - gal.dec) * escv };
  }
  function destaca(x, y) {
    var xi = Math.round(x), yi = Math.round(y);
    if (xi < 4 || yi < 4 || xi >= SIZE - 4 || yi >= SIZE - 4) return false;
    var pico = 0, anillo = [];
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var d = Math.hypot(dx, dy), v = difuso[(yi + dy) * SIZE + xi + dx];
      if (d <= 1.5) { if (v > pico) pico = v; }
      else if (d >= 2 && d <= 4) anillo.push(v);
    }
    anillo.sort(function (a, b) { return a - b; });
    var med = anillo[anillo.length >> 1];
    return pico > 0 && pico >= FACTOR * Math.max(med, 1e-12);
  }
  var dentro = 0, dentroGaia = 0, control = 0, fuera = 0, fueraTot = 0, nulo = 0;
  var porMag = {};
  var a = parche.afin;
  for (var i = 0; i < gaia.length; i++) {
    var p = px(gaia[i][0], gaia[i][1]), g = gaia[i][2];
    var dx = p.x - SIZE / 2, dy = p.y - SIZE / 2, r = Math.hypot(dx, dy);
    if (Math.abs(dx) <= medioLado && Math.abs(dy) <= medioLado) {
      dentroGaia++;
      if (g < mlim) control++;
      if (destaca(p.x, p.y)) { dentro++; var b = Math.floor(g); porMag[b] = (porMag[b] || 0) + 1; }
      // nulo: el mismo detector a 7 px (25″) de la fuente, promediado en las
      // cuatro diagonales para que la orientación de un filamento no lo sesgue:
      // lo que «destaca» ahí es estructura de la nebulosa o grano del anclaje, no estrella
      for (var kn = 0; kn < 4; kn++) {
        var ox7 = (kn & 1) ? 7 : -7, oy7 = (kn & 2) ? 7 : -7;
        if (Math.abs(dx + ox7) <= medioLado && Math.abs(dy + oy7) <= medioLado && destaca(p.x + ox7, p.y + oy7)) nulo += 0.25;
      }
    } else if (r > rInt && r <= rExt) {
      fueraTot++;
      if (g < mlim) fuera++;
    }
  }
  /* Picos del difuso dentro del parche SIN fuente Gaia a ≤ 2 px: el grano que
     la fixture (g ≤ 20) no cataloga y que ninguna máscara puede quitar. */
  var ocupado = new Uint8Array(SIZE * SIZE);
  for (i = 0; i < gaia.length; i++) {
    var q = px(gaia[i][0], gaia[i][1]), qx = Math.round(q.x), qy = Math.round(q.y);
    for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
      var ux = qx + ox, uy = qy + oy;
      if (ux >= 0 && uy >= 0 && ux < SIZE && uy < SIZE) ocupado[uy * SIZE + ux] = 1;
    }
  }
  var sinCatalogar = 0;
  for (var sy = Math.ceil(SIZE / 2 - medioLado); sy <= SIZE / 2 + medioLado; sy++) {
    for (var sx = Math.ceil(SIZE / 2 - medioLado); sx <= SIZE / 2 + medioLado; sx++) {
      var v0 = difuso[sy * SIZE + sx];
      if (!(v0 > 0) || ocupado[sy * SIZE + sx]) continue;
      var esMax = true;
      for (var my = -1; my <= 1 && esMax; my++) for (var mx = -1; mx <= 1; mx++) {
        if ((mx || my) && difuso[(sy + my) * SIZE + sx + mx] > v0) { esMax = false; break; }
      }
      if (esMax && destaca(sx, sy)) sinCatalogar++;
    }
  }
  // cobertura de la escena sobre el parche (la condición de la historia: > 90 %)
  var n = 0, muestras = 0;
  for (var yy = 0; yy < parche.alto; yy += 8) for (var xx = 0; xx < parche.ancho; xx += 8) {
    muestras++; if (window.BitacoraPS1.ps1FuenteEnEscena(parche.escena, a, xx, yy)) n++;
  }
  var cobertura = 100 * n / muestras;
  var dd = Math.max(0, dentro - nulo) / areaParche, df = fuera / areaParche, ratio = dd / df;
  console.log((arg.viaA ? '[vía A] ' : bandaB ? '[vía B ' + bandaB + '′] ' : '[sin mlim] ') + arg.obj + ' · D ' + D + ' · ' + M + '× · SQM ' + SQM + ' · mlim ' + mlim.toFixed(2) +
    ' · escena cubre ' + cobertura.toFixed(1) + ' % del parche · ' + asPx.toFixed(2) + '″/px lienzo');
  console.log('  parche ' + gal.ladoArcmin.toFixed(2) + '′ (' + areaParche.toFixed(0) + ' arcmin²), anillo ' +
    rInt.toFixed(1) + '–' + rExt.toFixed(1) + ' px · Gaia de la fixture hasta g ' +
    Math.max.apply(null, gaia.map(function (s) { return s[2]; })).toFixed(1));
  console.log('  dentro: Gaia ' + dentroGaia + ' · g<mlim (control) ' + control + ' · destacan en el difuso ' + dentro +
    ' · nulo (detector a 25″ de cada fuente, 4 direcciones) ' + nulo.toFixed(0) + '  = (destacan − nulo) ' + dd.toFixed(3) + '/arcmin²');
  console.log('  dentro por magnitud (destacan): ' + JSON.stringify(porMag));
  console.log('  dentro sin catalogar (picos sin Gaia a ≤2 px): ' + sinCatalogar +
    '  = ' + (sinCatalogar / areaParche).toFixed(3) + '/arcmin²');
  console.log('  fuera : Gaia ' + fueraTot + ' · g<mlim (sprites) ' + fuera + '  = ' + df.toFixed(3) + '/arcmin²');
  console.log('  ratio dentro/fuera = ' + ratio.toFixed(2) + '  (listón 0,67–1,5): ' +
    (ratio >= 0.67 && ratio <= 1.5 ? 'SIN costura' : 'COSTURA'));
  console.log('  control/fuera = ' + (control / fuera).toFixed(2) + ' (gradiente real de densidad)');
  if (bandaB) console.log('  vía B: la franja de ' + bandaB + '′ deja sin protección el ' + perdidaB.toFixed(0) + ' % del área del parche');
  process.exitCode = (ratio >= 0.67 && ratio <= 1.5) ? 0 : 1;
  if (arg.png) {
    var png = require('./lib_png.js'), c = R.ctxFotometrico(cielo, parche.thetaIntArcmin);
    var rgb = new Uint8Array(SIZE * SIZE * 3);
    for (var k = 0; k < difuso.length; k++) {
      var v = c.nivelFondo; if (difuso[k] > 0) v += R.valorDeFlujo(difuso[k], c.Fcielo, c.rango);
      rgb[k * 3] = rgb[k * 3 + 1] = rgb[k * 3 + 2] = Math.max(0, Math.min(255, Math.round(v)));
    }
    var out = path.join(RAIZ, '.scratch', 'costura'); fs.mkdirSync(out, { recursive: true });
    png.escribir(path.join(out, arg.obj.replace(/\s+/g, '') + '_M' + M + '.png'), rgb, SIZE, SIZE);
    console.log('  png: ' + out);
  }
}).catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2); });
