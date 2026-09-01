#!/usr/bin/env node
/* Harness prerregistrado de la niebla sub-mlim en cúmulos abiertos
   (simulador_ocular/docs/adr/0022-preregistro-niebla-sub-mlim-en-cumulos-abiertos.md).

   Mide, por cúmulo/equipo/anillo, el flujo Gaia de las estrellas con g > mlim
   partido en dos bandas según lo que dibujar() hace hoy con ellas:
     glow    (mlim, mlim+2,30]   — sprite de glow (alfaMin/glowCorte)
     perdida (mlim+2,30, 20,0]   — se descarta entera (aGlow < glowCorte)
   y juzga C_total = F/Fcielo contra el Cmin de PRODUCCIÓN (ctxFotometrico,
   H2c activa, thetaInt = thetaNieblaArcmin = θ_R/aumentos, ADR 0023) — ADR
   0008: la ley se importa, no se copia.

   Datos pineados en scripts/fixtures/gaia/niebla_<id>.csv (ra,dec,g). Si
   faltan, se bajan de VizieR (I/355/gaiadr3, G<=20) en serie — VizieR
   serializa por IP, paralelo no ahorra.

   node scripts/harness_niebla_abiertos.js [--bajar] [--sqm N]              */
'use strict';

var fs = require('fs'), path = require('path'), https = require('https');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : def; }
var SQM = arg('sqm', 21.5), T = 0.8, POJO = 7, G_TOPE = 20.0;
var COLA_GLOW = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin); // 2,30 mag

// Banco del prerregistro (§Banco): [id, RA°, Dec°, R arcmin, papel]
var BANCO = [
  ['M11',      282.77083,  -6.270,  7,   'positivo'],
  ['NGC 7789', 359.334,    56.726,  8,   'positivo'],
  ['M37',       88.074,    32.545, 12,   'informativo'],
  ['M46',      115.438,   -14.810, 13,   'informativo'],
  ['M45',       56.750,    24.117, 55,   'control'],
  ['NGC 1664',  72.763,    43.676,  9,   'control'],
  ['NGC 2266', 100.862,    26.974,  2.5, 'control']
];
var EQUIPOS = [
  { id: 'E1', D: 200, MAG: 61 },
  { id: 'E2', D: 200, MAG: 150 },
  { id: 'E3', D: 457, MAG: 61 },
  { id: 'E4', D: 457, MAG: 229 }
];
var ANILLOS = [[0, 0.25], [0.25, 0.5], [0.5, 1]]; // en fracciones de R

var DIR = path.join(__dirname, 'fixtures', 'gaia');
function csvDe(id) { return path.join(DIR, 'niebla_' + id.toLowerCase().replace(/\s+/g, '') + '.csv'); }

function bajar(c) {
  var radDeg = Math.max(3, c[3] * 1.1) / 60;
  var adql = 'SELECT TOP 400000 RA_ICRS, DE_ICRS, Gmag FROM "I/355/gaiadr3"' +
    ' WHERE Gmag <= ' + G_TOPE +
    ' AND 1=CONTAINS(POINT(\'ICRS\', RA_ICRS, DE_ICRS),' +
    ' CIRCLE(\'ICRS\',' + c[1] + ',' + c[2] + ',' + radDeg + '))';
  var url = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?request=doQuery&lang=adql&format=json&query=' +
    encodeURIComponent(adql);
  return new Promise(function (res, rej) {
    https.get(url, function (r) {
      var trozos = [];
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode + ' para ' + c[0])); return; }
      r.on('data', function (d) { trozos.push(d); });
      r.on('end', function () {
        try {
          var j = JSON.parse(Buffer.concat(trozos).toString('utf8'));
          var lineas = ['ra,dec,g'];
          for (var i = 0; i < j.data.length; i++) {
            var d = j.data[i];
            if (d[2] == null) continue;
            lineas.push(d[0] + ',' + d[1] + ',' + d[2]);
          }
          fs.writeFileSync(csvDe(c[0]), lineas.join('\n') + '\n');
          console.log('  ' + c[0] + ': ' + (lineas.length - 1) + ' fuentes (radio ' + (radDeg * 60).toFixed(1) + '′)');
          res();
        } catch (e) { rej(e); }
      });
    }).on('error', rej);
  });
}

function leer(id) {
  var lineas = fs.readFileSync(csvDe(id), 'utf8').trim().split('\n').slice(1);
  var e = new Array(lineas.length);
  for (var i = 0; i < lineas.length; i++) {
    var p = lineas[i].split(',');
    e[i] = [+p[0], +p[1], +p[2]];
  }
  return e;
}

function medir(c, eq) {
  var pupila = eq.D / eq.MAG;
  var cielo = { sqm: SQM, pupilaSalida: pupila, pupilaOjo: POJO, transmision: T, aumentos: eq.MAG };
  var mlim = R.magLimite({ apertura: eq.D, aumentos: eq.MAG, transmision: T, sqm: SQM, pupilaOjo: POJO });
  var estrellas = leer(c[0]);
  var cos0 = Math.cos(c[2] * Math.PI / 180);

  /* Escala de juicio de PRODUCCION (ADR 0023 v2): max(theta_R/M, R50). No se
     reimplementa aqui (ADR 0008): se llama a nieblaCampo() sobre un lienzo de
     usar y tirar y se lee la theta que ella misma escribe. El campo del harness
     es el del fixture (radio 1,1R), que NO es el campo del ocular: threat
     anotado en el ADR. SIZE pequeno basta porque R50 sale en arcmin y es
     invariante de escala; el lado 2,2R cubre el circulo del fixture. */
  var SIZE_TH = 64;
  var opTh = {
    ra0: c[1], dec0: c[2], arcmin: 2.2 * c[3], size: SIZE_TH, mlim: mlim, cielo: cielo
  };
  R.nieblaCampo(new Float32Array(SIZE_TH * SIZE_TH), estrellas, opTh);
  var thJuicio = opTh.thetaJuicioArcmin || R.thetaNieblaArcmin(cielo);

  // Flujo sub-mlim por bandas en una corona [r0,r1) arcmin.
  function corona(r0, r1) {
    var Fglow = 0, Fperd = 0, nGlow = 0, nPerd = 0;
    for (var i = 0; i < estrellas.length; i++) {
      var g = estrellas[i][2];
      if (g <= mlim || g > G_TOPE) continue;
      var dra = ((estrellas[i][0] - c[1] + 540) % 360) - 180;
      var dx = dra * cos0 * 60, dy = (estrellas[i][1] - c[2]) * 60; // arcmin
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r < r0 || r >= r1) continue;
      var f = Math.pow(10, -0.4 * g);
      if (g <= mlim + COLA_GLOW) { Fglow += f; nGlow++; } else { Fperd += f; nPerd++; }
    }
    var areaAs2 = Math.PI * (r1 * r1 - r0 * r0) * 3600;
    return { F: (Fglow + Fperd) / areaAs2, Fglow: Fglow / areaAs2, Fperd: Fperd / areaAs2,
             nGlow: nGlow, nPerd: nPerd };
  }

  /* Prerregistro v2: línea base del campo local en (R, 1,1R] — fuera del radio
     documental del cúmulo. En los positivos aún contiene periferia del cúmulo:
     base sobrestimada, exceso = cota inferior (conservador donde debe). */
  var base = corona(c[3], c[3] * 1.1);
  var filas = [];
  for (var a = 0; a < ANILLOS.length; a++) {
    var r0 = ANILLOS[a][0] * c[3], r1 = ANILLOS[a][1] * c[3]; // arcmin
    var m = corona(r0, r1);
    var Fexc = Math.max(0, m.F - base.F);                       // exceso sobre el campo
    // theta de produccion, ya calculada arriba por la propia nieblaCampo().
    var ctx = R.ctxFotometrico(cielo, thJuicio);
    var C = Fexc / ctx.Fcielo;
    filas.push({
      anillo: r0.toFixed(1) + '–' + r1.toFixed(1) + '′',
      mu: m.F > 0 ? -2.5 * Math.log10(m.F) : Infinity,
      muExc: Fexc > 0 ? -2.5 * Math.log10(Fexc) : Infinity,
      muGlow: m.Fglow > 0 ? -2.5 * Math.log10(m.Fglow) : Infinity,
      muPerd: m.Fperd > 0 ? -2.5 * Math.log10(m.Fperd) : Infinity,
      nGlow: m.nGlow, nPerd: m.nPerd,
      C: C, Cmin: ctx.Cmin, visible: C >= ctx.Cmin
    });
  }
  return { mlim: mlim, thJuicio: thJuicio,
           muBase: base.F > 0 ? -2.5 * Math.log10(base.F) : Infinity, filas: filas };
}

function correr() {
  var falta = BANCO.filter(function (c) { return !fs.existsSync(csvDe(c[0])); });
  var cola = Promise.resolve();
  if (falta.length) {
    console.log('Bajando fixtures que faltan (VizieR, en serie):');
    falta.forEach(function (c) { cola = cola.then(function () { return bajar(c); }); });
  }
  return cola.then(function () {
    var res = {};                                    // res[cumulo][equipo] = medida
    BANCO.forEach(function (c) {
      res[c[0]] = {};
      console.log('\n' + c[0] + ' (' + c[4] + ', R=' + c[3] + '′)');
      EQUIPOS.forEach(function (eq) {
        var m = medir(c, eq);
        res[c[0]][eq.id] = m;
        console.log('  ' + eq.id + ' ' + eq.D + 'mm ' + eq.MAG + '×  mlim=' + m.mlim.toFixed(2) +
          '  μ_campo=' + (isFinite(m.muBase) ? m.muBase.toFixed(2) : '—') +
          '  θ_juicio=' + (m.thJuicio * 60).toFixed(1) + '″');
        m.filas.forEach(function (f) {
          console.log('    ' + f.anillo.padEnd(12) +
            ' μ=' + (isFinite(f.mu) ? f.mu.toFixed(2) : '—').padStart(6) +
            ' μ_exc=' + (isFinite(f.muExc) ? f.muExc.toFixed(2) : '—').padStart(6) +
            '  [glow ' + (isFinite(f.muGlow) ? f.muGlow.toFixed(2) : '—') + '/' + f.nGlow +
            ' | perdida ' + (isFinite(f.muPerd) ? f.muPerd.toFixed(2) : '—') + '/' + f.nPerd + ']' +
            '  C_exc=' + f.C.toFixed(3) + ' Cmin=' + f.Cmin.toFixed(3) +
            (f.visible ? '  VISIBLE' : ''));
        });
      });
    });

    // ── Listones del prerregistro ──
    var visibleEn = function (id, eq) {
      return res[id][eq].filas.some(function (f) { return f.visible; });
    };
    var P1 = visibleEn('M11', 'E1');
    var P2 = visibleEn('NGC 7789', 'E1');
    var P3 = ['M45', 'NGC 1664', 'NGC 2266'].every(function (id) {
      return EQUIPOS.every(function (eq) { return !visibleEn(id, eq.id); });
    });
    var P4 = res['M11'].E3.filas[0].C < res['M11'].E1.filas[0].C;

    /* P5 (ADR 0023, sustituye al Q5 descartado): a APERTURA FIJA, el umbral de
       la niebla crece con el aumento. Es la version con dientes y sin
       referencia a la ley C_MAG: no compara contra la ley vieja -que era la
       equivocada- sino contra la fisica que la nota midio, que la niebla se
       apaga al subir aumento. Falla si alguna vez subir aumento hiciera la
       niebla mas facil de ver. */
    var P5 = true, P5det = [];
    [['M11', 'E1', 'E2', '200 mm'], ['M11', 'E3', 'E4', '457 mm']].forEach(function (par) {
      var bajo = res[par[0]][par[1]].filas[0].Cmin, alto = res[par[0]][par[2]].filas[0].Cmin;
      if (!(alto > bajo)) P5 = false;
      P5det.push(par[3] + ': ' + bajo.toFixed(3) + '→' + alto.toFixed(3));
    });

    console.log('\n== Listones (ADR 0022, P5 del ADR 0023) ==');
    console.log('P1 M11/E1 algún anillo visible:        ' + (P1 ? 'PASA' : 'FALLA'));
    console.log('P2 NGC 7789/E1 algún anillo visible:   ' + (P2 ? 'PASA' : 'FALLA'));
    console.log('P3 controles nunca visibles:           ' + (P3 ? 'PASA' : 'FALLA'));
    console.log('P4 C(M11 nuclear) E3 < E1:             ' + (P4 ? 'PASA' : 'FALLA') +
      '  (E1=' + res['M11'].E1.filas[0].C.toFixed(3) + ', E3=' + res['M11'].E3.filas[0].C.toFixed(3) + ')');
    console.log('P5 Cmin crece con el aumento:          ' + (P5 ? 'PASA' : 'FALLA') +
      '  (' + P5det.join(', ') + ')');
    console.log('Informativos: M37/E1 ' + (visibleEn('M37', 'E1') ? 'visible' : 'no visible') +
      ', M46/E1 ' + (visibleEn('M46', 'E1') ? 'visible' : 'no visible'));

    var ok = P1 && P2 && P3 && P4 && P5;
    console.log('\nVEREDICTO: ' + (ok ? 'PASA (5/5)' : 'FALLA'));
    process.exit(ok ? 0 : 1);
  }).catch(function (e) { console.error(e.message || e); process.exit(2); });
}

correr();
