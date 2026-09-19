#!/usr/bin/env node
/* Harness de validación del velo espacial (ADR 0029, listones L1-L4).

   Mide contra el TAP real y las fixtures cacheadas si el velo por celdas
   reconcilia con el catálogo discreto (L2/L3) y conserva el flujo (L1). L4 es
   por construcción (el cliente sigue realimentando el escalar, no se mide con
   TAP): se anota, no se consulta.

   Para cada campo denso (M7, M11 a 100×):
     L1  Σ flujo(celdas) == fondo.flujo escalar         (< 0,1 %)
     L2  perfil radial del velo (celdas) == perfil de la MISMA banda (corte,20]
         calculado del catálogo discreto del MISMO objeto a 229× (sin truncar)
     L3  sin salto de forma entre 100× (velo) y 229× (niebla) — la L2 es la
         prueba operativa; L3 es que el perfil no dependa del techo de filas.

   node scripts/harness_velo_espacial.js [--json fichero]               */
'use strict';

var fs = require('fs'), path = require('path'), https = require('https');
var CDS = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=';
var N = 8;                     // granularidad fijada (ADR 0029)
var G_TOPE = 20.0;
var ANILLO = 3;                // arcmin por anillo

function tap(url) {
  return new Promise(function (res, rej) {
    var t0 = Date.now();
    var req = https.get(url, {
      timeout: 120000,
      headers: { 'User-Agent': 'bitacora-harness-velo-espacial/1.0' }
    }, function (r) {
      var c = [];
      r.on('data', function (d) { c.push(d); });
      r.on('end', function () { res({ ms: Date.now() - t0, body: Buffer.concat(c).toString('utf8') }); });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', rej);
  });
}

var DIR = path.join(__dirname, 'fixtures', 'gaia');
function fix(id, rad) {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'canales_' + id.toLowerCase() + '_' + rad.toFixed(3) + '.json'), 'utf8'));
}

// Perfil radial de un conjunto de puntos {ra,dec,flujo}: fracción de flujo por anillo.
function perfil(puntos, CRA, CDEC, rMaxArcmin) {
  var cos0 = Math.cos(CDEC * Math.PI / 180), ann = {};
  puntos.forEach(function (p) {
    var dra = (p.ra - CRA) * cos0 * 60, ddec = (p.dec - CDEC) * 60;
    var d = Math.sqrt(dra * dra + ddec * ddec);
    if (d > rMaxArcmin) return;
    var k = Math.floor(d / ANILLO) * ANILLO;
    ann[k] = (ann[k] || 0) + p.flujo;
  });
  var total = 0;
  Object.keys(ann).forEach(function (k) { total += ann[k]; });
  var out = {};
  Object.keys(ann).sort(function (a, b) { return a - b; }).forEach(function (k) {
    out[k] = ann[k] / total;
  });
  return out;
}

function fmt(p) {
  return Object.keys(p).map(function (k) { return k + "′:" + (p[k] * 100).toFixed(1) + '%'; }).join(' ');
}

async function medir(id, CRA, CDEC, radDenso, radNoDenso) {
  var denso = fix(id, radDenso);        // 100×: scalar fondo + data truncada
  var noDenso = fix(id, radNoDenso);    // 229×: catálogo discreto completo
  var fondo = denso.fondo;
  if (!fondo) { console.log(id + ': sin fondo (no denso), se salta'); return null; }
  var corte = fondo.corte, rad = fondo.rad;

  // L1 + perfil del velo: agregado espacial por celdas, misma banda (corte,20].
  var q = 'SELECT FLOOR(RA_ICRS*' + N + ') AS rx, FLOOR(DE_ICRS*' + N + ') AS dy,'
    + ' COUNT(*) AS n, SUM(POWER(10,-0.4*Gmag)) AS flujo, SUM(POWER(10,-0.8*Gmag)) AS m2'
    + ' FROM "I/355/gaiadr3" WHERE Gmag>' + corte + ' AND Gmag<=' + G_TOPE
    + ' AND 1=CONTAINS(POINT(\'ICRS\',RA_ICRS,DE_ICRS), CIRCLE(\'ICRS\',' + CRA + ',' + CDEC + ',' + rad + '))'
    + ' GROUP BY rx, dy';
  var r = await tap(CDS + encodeURIComponent(q));
  var celdas = (JSON.parse(r.body).data || []).map(function (c) {
    return { ra: (c[0] + 0.5) / N, dec: (c[1] + 0.5) / N, flujo: c[3] };
  });
  var sumaCeldas = celdas.reduce(function (s, c) { return s + c.flujo; }, 0);
  var L1 = Math.abs(sumaCeldas / fondo.flujo - 1);

  // Perfil del velo (celdas) y perfil discreto de la MISMA banda a 229×.
  var veloPerfil = perfil(celdas, CRA, CDEC, radNoDenso * 60);
  var discreto = (noDenso.data || []).filter(function (d) { return d[2] > corte && d[2] <= G_TOPE; })
    .map(function (d) { return { ra: +d[0], dec: +d[1], flujo: Math.pow(10, -0.4 * d[2]) }; });
  var discretoPerfil = perfil(discreto, CRA, CDEC, radNoDenso * 60);

  // L2/L3: distancia de forma entre los dos perfiles normalizados (máx diferencia).
  var claves = Object.keys(discretoPerfil).sort(function (a, b) { return a - b; });
  var dmax = 0;
  claves.forEach(function (k) {
    dmax = Math.max(dmax, Math.abs((veloPerfil[k] || 0) - discretoPerfil[k]));
  });

  console.log('\n' + id + ' (100× velo vs 229× niebla, banda ' + corte.toFixed(1) + '–20):');
  console.log('  L1 Σ celdas == escalar: desv ' + (L1 * 100).toFixed(3) + ' %  (' + (L1 < 0.001 ? 'PASA' : 'FALLA') + ')');
  console.log('  velo      : ' + fmt(veloPerfil));
  console.log('  discreto  : ' + fmt(discretoPerfil));
  console.log('  L2/L3 forma: dmax ' + (dmax * 100).toFixed(1) + ' %  (' + (dmax < 0.2 ? 'PASA (tolerancia 20 %)' : 'FALLA') + ')');
  return { id: id, L1: L1, dmax: dmax, velo: veloPerfil, discreto: discretoPerfil, celdas: celdas.length };
}

(async function () {
  var filas = [];
  filas.push(await medir('m7', 268.463, -34.793, 0.490, 0.214));
  filas.push(await medir('m11', 282.771, -6.270, 0.490, 0.214));
  var salida = process.argv.indexOf('--json') > 0 ? process.argv[process.argv.indexOf('--json') + 1] : null;
  if (salida) fs.writeFileSync(salida, JSON.stringify(filas, null, 2));
  var todoPasa = filas.every(function (f) { return f && f.L1 < 0.001 && f.dmax < 0.2; });
  console.log('\n== Veredicto ==');
  console.log(todoPasa ? 'L1-L4 PASA' : 'HAY FALLOS');
  process.exit(todoPasa ? 0 : 1);
})().catch(function (e) { console.error('FALLO: ' + e.message); process.exit(1); });
