#!/usr/bin/env node
/* Arnés de medida de H2: ¿realimentar la niebla al cielo cambia algo VISIBLE?
   (issue #186; hallazgo H2 de
   simulador_ocular/docs/notas/niebla-campo-pupila-y-aumentos.md §5.6).

   Hoy la luz de la niebla sub-mlim (nieblaCampo, ADR 0022) no entra por
   sumaSB/veloSB, así que no degrada magLimite — al revés que la banda truncada
   del ADR 0014, que es la misma física. La nota midió −0,32 mag en el peor caso.
   Antes de decidir CÓMO realimentarla (escalar de campo vs mlim espacial, las
   opciones (a) y (b) del ticket), esta medida responde si hace falta hacerlo:
   si ni siquiera el techo del efecto mueve un veredicto, H2 se cierra sin código.

   No toca producción. El lazo (más niebla → peor mlim → más niebla) se cierra
   aquí, en el arnés, con iteración de punto fijo, y las leyes se importan, no
   se copian (ADR 0008): magLimite, sumaSB, ctxFotometrico, thetaNieblaArcmin.

   Dos variantes de realimentación, que acotan el efecto por los dos lados:
     campo  — un escalar sobre todo el campo del fixture. Es la opción (a) del
              ticket tal cual.
     nucleo — el μ del anillo interior aplicado como si fuera el cielo local.
              No es implementable como escalar; es el TECHO de la opción (b),
              el caso más favorable posible a que H2 se note.

   Y tres cosas por caso: si el punto fijo converge, cuánto cae mlim, y si algo
   cambia de veredicto — anillos que aparecen/desaparecen, y estrellas que
   cruzan de canal (dejan de dibujarse una a una y caen a la niebla).

   Banco, equipos, anillos y línea base: los mismos que
   harness_niebla_abiertos.js, para que las dos medidas sean comparables.

   node scripts/harness_h2_realimentacion.js [--sqm N]                      */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : def; }
var SQM = arg('sqm', 21.5), T = 0.8, POJO = 7, G_TOPE = 20.0;
var COLA_GLOW = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin);
var TOL = 0.001, MAX_IT = 20;   // punto fijo: milimagnitud y tope de vueltas

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
var ANILLOS = [[0, 0.25], [0.25, 0.5], [0.5, 1]];
var VARIANTES = ['campo', 'nucleo'];

var DIR = path.join(__dirname, 'fixtures', 'gaia');
function csvDe(id) { return path.join(DIR, 'niebla_' + id.toLowerCase().replace(/\s+/g, '') + '.csv'); }

function leer(id) {
  var lineas = fs.readFileSync(csvDe(id), 'utf8').trim().split('\n').slice(1);
  var e = new Array(lineas.length);
  for (var i = 0; i < lineas.length; i++) {
    var p = lineas[i].split(',');
    e[i] = [+p[0], +p[1], +p[2]];
  }
  return e;
}

/* Radio en arcmin de cada estrella al centro del cúmulo, precalculado una vez:
   el punto fijo recorre el fixture hasta 20 veces por caso y la trigonometría
   no depende de mlim. */
function radios(c, estrellas) {
  var cos0 = Math.cos(c[2] * Math.PI / 180), r = new Float64Array(estrellas.length);
  for (var i = 0; i < estrellas.length; i++) {
    var dra = ((estrellas[i][0] - c[1] + 540) % 360) - 180;
    var dx = dra * cos0 * 60, dy = (estrellas[i][1] - c[2]) * 60;
    r[i] = Math.sqrt(dx * dx + dy * dy);
  }
  return r;
}

/* Flujo por arcsec² en la corona [r0,r1) arcmin, de las estrellas por debajo de
   `corte`. Aquí conviven DOS cortes y no son intercambiables:

     mlim              — el del prerregistro (ADR 0022): la mancha que se juzga
                         es toda la banda sub-mlim, glow incluido. Se usa para
                         el veredicto visible/no visible, para que este arnés
                         cuente cambios sobre la misma línea que
                         harness_niebla_abiertos.js.
     mlim + colaGlow   — el de nieblaCampo: solo lo que NO se dibuja una a una.
                         Se usa para el velo. La banda del glow ya está resuelta
                         en pantalla como estrellas; realimentarla al cielo la
                         contaría dos veces. */
function corona(estrellas, rad, corte, r0, r1) {
  var F = 0;
  for (var i = 0; i < estrellas.length; i++) {
    var g = estrellas[i][2];
    if (g <= corte || g > G_TOPE) continue;
    if (rad[i] < r0 || rad[i] >= r1) continue;
    F += Math.pow(10, -0.4 * g);
  }
  return F / (Math.PI * (r1 * r1 - r0 * r0) * 3600);
}

function mu(F) { return F > 0 ? -2.5 * Math.log10(F) : Infinity; }

/* Escala de juicio de producción (θ_juicio, ADR 0023 v2). La escribe la propia
   nieblaCampo sobre un lienzo de usar y tirar; no se reimplementa (ADR 0008).
   Depende de mlim, así que se recalcula en cada vuelta del punto fijo. */
function thetaJuicio(c, estrellas, cielo, mlim) {
  var SIZE = 64;
  var op = { ra0: c[1], dec0: c[2], arcmin: 2.2 * c[3], size: SIZE, mlim: mlim, cielo: cielo };
  R.nieblaCampo(new Float32Array(SIZE * SIZE), estrellas, op);
  return op.thetaJuicioArcmin || R.thetaNieblaArcmin(cielo);
}

// Estado del render con un velo dado: mlim, θ de juicio y veredicto por anillo.
function estado(c, eq, estrellas, rad, velo) {
  var cielo = {
    sqm: SQM, pupilaSalida: eq.D / eq.MAG, pupilaOjo: POJO,
    transmision: T, aumentos: eq.MAG
  };
  if (velo != null) cielo.veloSB = velo;
  var mlim = R.magLimite({
    apertura: eq.D, aumentos: eq.MAG, transmision: T,
    sqm: SQM, pupilaOjo: POJO, veloSB: velo
  });
  var th = thetaJuicio(c, estrellas, cielo, mlim);
  var ctx = R.ctxFotometrico(cielo, th);
  var corte = mlim + COLA_GLOW;
  var base = corona(estrellas, rad, mlim, c[3], c[3] * 1.1);
  var filas = ANILLOS.map(function (a) {
    var r0 = a[0] * c[3], r1 = a[1] * c[3];
    var F = corona(estrellas, rad, mlim, r0, r1);
    var C = Math.max(0, F - base) / ctx.Fcielo;
    return { anillo: r0.toFixed(1) + '–' + r1.toFixed(1) + '′', F: F, mu: mu(F),
             Fniebla: corona(estrellas, rad, corte, r0, r1),
             C: C, Cmin: ctx.Cmin, visible: C >= ctx.Cmin };
  });
  // Luz no resuelta de todo el campo: el escalar único de la opción (a).
  var Fcampo = corona(estrellas, rad, corte, 0, c[3] * 1.1);
  return { mlim: mlim, cielo: cielo, Fbase: base, Fcampo: Fcampo, filas: filas };
}

/* Punto fijo. La niebla del paso k fija el velo del paso k+1; más velo baja
   mlim, lo que mete más estrellas en la niebla. Converge por ser contractivo
   (cada vuelta añade una banda de estrellas cada vez más débil), pero eso hay
   que MEDIRLO, no suponerlo: por eso el tope de vueltas y el campo `converge`. */
function puntoFijo(c, eq, estrellas, rad, variante) {
  var s = estado(c, eq, estrellas, rad, null), velo = null, it = 0;
  for (; it < MAX_IT; it++) {
    // Luz que la niebla deposita, con el mlim de esta vuelta.
    var F = (variante === 'nucleo')
      ? s.filas[0].Fniebla      // techo de la opción (b): el anillo interior
      : s.Fcampo;               // opción (a): un escalar para todo el campo
    var nuevo = mu(F);
    if (!isFinite(nuevo)) break;                                // sin niebla: nada que realimentar
    var sig = estado(c, eq, estrellas, rad, nuevo);
    var paso = Math.abs(sig.mlim - s.mlim);
    s = sig; velo = nuevo;
    if (paso < TOL) { it++; break; }
  }
  return { s: s, velo: velo, it: it, converge: it < MAX_IT };
}

function correr() {
  var falta = BANCO.filter(function (c) { return !fs.existsSync(csvDe(c[0])); });
  if (falta.length) {
    console.error('Faltan fixtures: ' + falta.map(function (c) { return c[0]; }).join(', ') +
      '\nBájalas con: node scripts/harness_niebla_abiertos.js --bajar');
    process.exit(2);
  }

  var noConverge = [], flips = [], dMax = { campo: 0, nucleo: 0 }, dMaxDet = { campo: '', nucleo: '' };
  var perdidas = 0;

  BANCO.forEach(function (c) {
    var estrellas = leer(c[0]), rad = radios(c, estrellas);
    console.log('\n' + c[0] + ' (' + c[4] + ', R=' + c[3] + '′)');
    EQUIPOS.forEach(function (eq) {
      var b = estado(c, eq, estrellas, rad, null);
      console.log('  ' + eq.id + ' ' + eq.D + 'mm ' + eq.MAG + '×  mlim=' + b.mlim.toFixed(2) +
        '  [' + b.filas.map(function (f) { return f.visible ? 'V' : '·'; }).join('') + ']');
      VARIANTES.forEach(function (v) {
        var p = puntoFijo(c, eq, estrellas, rad, v);
        var d = p.s.mlim - b.mlim;
        if (!p.converge) noConverge.push(c[0] + '/' + eq.id + '/' + v);
        if (-d > dMax[v]) { dMax[v] = -d; dMaxDet[v] = c[0] + '/' + eq.id; }

        // Estrellas que cruzan de canal: dejan de dibujarse una a una.
        var cruzan = 0;
        for (var i = 0; i < estrellas.length; i++) {
          var g = estrellas[i][2];
          if (rad[i] < c[3] && g > p.s.mlim && g <= b.mlim) cruzan++;
        }
        perdidas += cruzan;

        var cambia = p.s.filas.map(function (f, k) {
          return f.visible === b.filas[k].visible ? (f.visible ? 'V' : '·') : (f.visible ? '+' : '-');
        });
        if (cambia.some(function (x) { return x === '+' || x === '-'; })) {
          flips.push(c[0] + '/' + eq.id + '/' + v + ' ' + cambia.join(''));
        }
        console.log('    ' + v.padEnd(7) +
          ' μ_velo=' + (p.velo != null ? p.velo.toFixed(2) : '—').padStart(6) +
          '  mlim ' + b.mlim.toFixed(2) + '→' + p.s.mlim.toFixed(2) +
          ' (Δ' + d.toFixed(2) + ')' +
          '  it=' + p.it + (p.converge ? '' : ' NO CONVERGE') +
          '  [' + cambia.join('') + ']' +
          '  estrellas perdidas=' + cruzan +
          '  Cmin ' + b.filas[0].Cmin.toFixed(3) + '→' + p.s.filas[0].Cmin.toFixed(3));
      });
    });
  });

  /* Listones. El único fallo real de esta medida es que el lazo no cierre: sin
     punto fijo, ninguna de las dos opciones del ticket es implementable tal
     cual. Lo demás no es aprobado/suspenso, es el dato que #186 pide. */
  console.log('\n== Veredicto ==');
  console.log('L1 el punto fijo converge en los 56 casos:  ' +
    (noConverge.length === 0 ? 'PASA' : 'FALLA (' + noConverge.join(', ') + ')'));
  console.log('Δmlim máximo  campo:  −' + dMax.campo.toFixed(2) + ' mag (' + (dMaxDet.campo || '—') + ')');
  console.log('Δmlim máximo  nucleo: −' + dMax.nucleo.toFixed(2) + ' mag (' + (dMaxDet.nucleo || '—') + ')');
  console.log('Anillos que cambian de veredicto: ' + flips.length +
    (flips.length ? '  (' + flips.join(', ') + ')' : ''));
  console.log('Estrellas que cruzan de canal (suma de los 56 casos): ' + perdidas);
  console.log('\n¿H2 cambia algo visible? ' +
    ((flips.length || perdidas) ? 'SÍ — y arriba está dónde.'
      : 'NO, ni con la variante `nucleo`, que es el techo del efecto.'));
  process.exit(noConverge.length === 0 ? 0 : 1);
}

correr();
