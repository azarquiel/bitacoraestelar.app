#!/usr/bin/env node
/* Sonda de adquisición Gaia alternativa — decisión US-3 (épica #330).
 *
 * Mide contra el TAP de producción (CDS VizieR) si la bifurcación velo↔niebla
 * se puede eliminar sin mandar millones de filas al navegador. Tres números:
 *
 *   1. Histograma de densidad: estrellas por 0,5 mag hasta G=20 (campo denso).
 *   2. Binning por magnitud: tiempo de un bin de ~200k filas SIN ORDER BY
 *      (la alternativa que elimina el TOP y el sort). Da TODAS las filas.
 *   3. Agregado espacial: momentos (n, Σf, Σf²) POR CELDA de 0,125° de la banda
 *      truncada (la vía U3-full: velo con estructura, sin mandar filas).
 *
 * Campo de referencia: M7 a 100× (el peor caso, rad 0,49°, 835k estrellas).
 * No toca el proxy ni las fixtures: consulta el TAP directo, una vez.
 *
 *   node scripts/harness_adquisicion_gaia.js                        */
'use strict';

var https = require('https');

var CDS = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=';
var RA = 268.463, DEC = -34.793, RAD = 0.49;   // M7, ocular 100× (el denso del banco)
var CONE = "1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS), CIRCLE('ICRS'," + RA + ',' + DEC + ',' + RAD + '))';
var BIN_TOP = 200000;

function tap(url) {
  return new Promise(function (res, rej) {
    var t0 = Date.now();
    var req = https.get(url, {
      timeout: 180000,
      headers: { 'User-Agent': 'bitacora-adquisicion-probe/1.0 (+scripts/harness_adquisicion_gaia.js)' }
    }, function (r) {
      var trozos = [];
      r.on('data', function (d) { trozos.push(d); });
      r.on('end', function () {
        var body = Buffer.concat(trozos);
        res({ ms: Date.now() - t0, http: r.statusCode, bytes: body.length, text: body.toString('utf8') });
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', rej);
  });
}

function q(adql) { return CDS + encodeURIComponent(adql); }

(async function () {
  console.log('Sonda de adquisición Gaia · M7 100× (ra ' + RA + ', dec ' + DEC + ', rad ' + RAD + '°)\n');

  // 1) histograma
  var h = await tap(q('SELECT FLOOR(Gmag*2) AS k, COUNT(*) AS n FROM "I/355/gaiadr3" WHERE Gmag<=20 AND Gmag>=14 AND ' + CONE + ' GROUP BY k'));
  var filas = (JSON.parse(h.text).data || []).sort(function (a, b) { return a[0] - b[0]; });
  var total = filas.reduce(function (s, r) { return s + r[1]; }, 0);
  var densas = filas.filter(function (r) { return r[1] > BIN_TOP; });
  console.log('1. Histograma 0,5 mag (' + h.ms + ' ms):');
  console.log('   ' + filas.map(function (r) { return (r[0] / 2).toFixed(1) + '=' + r[1].toLocaleString(); }).join(' '));
  console.log('   total G≤20: ' + total.toLocaleString() + ' estrellas; bandas > ' + BIN_TOP + ': ' +
    densas.map(function (r) { return (r[0] / 2).toFixed(1); }).join(', '));
  // nº de bins de ≤200k: cada banda se parte en ceil(n/200k)
  var bins = 0;
  filas.forEach(function (r) { bins += Math.ceil(r[1] / BIN_TOP); });
  console.log('   → ' + bins + ' bins de ≤200k para traerlas TODAS\n');

  // 2) bin denso [19.5,20] (304k) cortado a 200k, sin ORDER BY
  var b = await tap(q('SELECT TOP ' + BIN_TOP + ' RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3" WHERE Gmag>19.5 AND Gmag<=20 AND ' + CONE));
  var bfilas = (JSON.parse(b.text).data || []).length;
  var mbPorFila = b.bytes / bfilas;
  var totalMB = total * mbPorFila / 1e6;
  console.log('2. Bin [19,5–20] TOP 200k sin ORDER BY: ' + b.ms + ' ms, ' + bfilas.toLocaleString() + ' filas, ' +
    (b.bytes / 1e6).toFixed(1) + ' MB');
  console.log('   → ~' + mbPorFila.toFixed(1) + ' B/fila; traerlas todas ≈ ' + totalMB.toFixed(0) + ' MB al navegador');
  console.log('   → coste total binning ≈ ' + bins + ' bins × ~' + (b.ms / 1000).toFixed(1) + ' s (bin lleno) — acotado por ' +
    Math.round(bins * b.ms / 1000) + ' s\n');

  // 3) agregado espacial de la banda truncada (corte 16,3 ≈ TOP 40000 de M7)
  var a = await tap(q('SELECT FLOOR(RA_ICRS*8) AS rx, FLOOR(DE_ICRS*8) AS dy, COUNT(*) AS n, SUM(POWER(10,-0.4*Gmag)) AS flujo, SUM(POWER(10,-0.8*Gmag)) AS m2 FROM "I/355/gaiadr3" WHERE Gmag>16.3 AND Gmag<=20 AND ' + CONE + ' GROUP BY rx, dy'));
  var celdas = (JSON.parse(a.text).data || []).length;
  console.log('3. Agregado espacial (celdas 0,125°, banda 16,3–20): ' + a.ms + ' ms, ' + celdas + ' celdas, ' +
    (a.bytes / 1e3).toFixed(1) + ' KB');
  console.log('   → velo CON estructura espacial (momentos por celda) en ' + (a.ms / 1000).toFixed(1) + ' s, datos triviales');
})().catch(function (e) { console.error('FALLO: ' + e.message); process.exit(1); });
