#!/usr/bin/env node
/* ¿Qué canal se lleva la luz sub-mlim en cada tipo de objeto? (18″ de referencia)

   Reparte el flujo Gaia del campo en los cuatro destinos que el render tiene
   para una estrella, tal como los define bitacora-gaia-render.js:

     estrellas  g <= mlim                          sprite resuelto, dibujar()
     glow       mlim < g <= mlim + colaGlow        sprite tenue, dibujar()
     niebla     g > mlim + colaGlow                campo difuso, nieblaCampo()
     velo       banda truncada por el TOP del proxy  cielo extra, veloSB()

   Los tres primeros los decide la MAGNITUD; el cuarto lo decide la DENSIDAD
   (solo existe si la sonda del proxy toca el techo de 200 000 filas, ADR 0014).

   Los datos salen del proxy de PRODUCCIÓN con los MISMOS parámetros que pide
   vistaGaia (ra, dec, radioConsulta(campo), mag = 20 con la capa de galaxias
   activa), así que lo medido es lo que el observador recibe, no una consulta
   inventada. Las leyes (magLimite, colaGlow, veloSB, ctxFotometrico) se
   importan del módulo, no se copian (ADR 0008).

   Respuestas cacheadas en scripts/fixtures/gaia/canales_<id>_<rad>.json: la
   segunda vuelta no toca la red.

     node scripts/harness_canales_g.js [--sqm N] [--json fichero]            */
'use strict';

var fs = require('fs'), path = require('path'), https = require('https');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;

function arg(n, def) { var i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : def; }
var SQM = +arg('sqm', 21.5), T = 0.8, POJO = 7, AFOV = 68;
var APERTURA = 457;                       // 18″
/* Profundidad de la consulta: la de PRODUCCIÓN, importada (ADR 0008). Con la
   capa de galaxias activa —el defecto— sale siempre el tope de 20,0, porque la
   máscara de PS1 pide todas las estrellas que PanSTARRS registra. */
function magConsulta(aumentos) { return R.profundidadConsulta(APERTURA, T, aumentos, true); }
var COLA_GLOW = -2.5 * Math.log10(R.config.glowCorte / R.config.alfaMin);   // 2,30 mag
var PROXY = 'https://bitacoraestelar.app/wp-content/uploads/bitacora/gaia_proxy.php';

/* Banco: uno por régimen esperado, más un control pobre. R = radio visible
   documental (SIMBAD / literatura), el mismo criterio que el banco del ADR 0022. */
var BANCO = [
  ['M45',      56.750,   24.117, 55,  'cúmulo abierto cercano y brillante'],
  ['M11',     282.771,   -6.270,  7,  'cúmulo abierto rico y lejano'],
  ['NGC 7789', 359.334,  56.726,  8,  'cúmulo abierto rico, turnoff débil'],
  ['NGC 2266', 100.862,  26.974,  2.5,'cúmulo abierto pobre (control)'],
  ['M7',      268.463,  -34.793, 40,  'abierto sobre el campo de Escorpio/Sgr'],
  ['M24',     274.200,  -18.550, 45,  'nube estelar de Sagitario']
];
var EQUIPOS = [
  { id: '100×', MAG: 100 },
  { id: '229×', MAG: 229 }
];

var DIR = path.join(__dirname, 'fixtures', 'gaia');

function cacheDe(id, rad) {
  return path.join(DIR, 'canales_' + id.toLowerCase().replace(/\s+/g, '') + '_' + rad.toFixed(3) + '.json');
}

function pedir(ra, dec, rad, mag) {
  return new Promise(function (res, rej) {
    var url = PROXY + '?ra=' + ra + '&dec=' + dec + '&rad=' + rad + '&mag=' + mag;
    /* El servidor rechaza con 400 las peticiones sin User-Agent (regla del WAF
       delante de /wp-content/uploads), así que el arnés se identifica. */
    var req = https.get(url, {
      timeout: 300000,
      headers: { 'User-Agent': 'bitacora-harness-canales-g/1.0 (+scripts/harness_canales_g.js)' }
    }, function (r) {
      var trozos = [];
      if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode)); return; }
      r.on('data', function (d) { trozos.push(d); });
      r.on('end', function () {
        try { res(JSON.parse(Buffer.concat(trozos).toString('utf8'))); }
        catch (e) { rej(e); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', rej);
  });
}

function consultar(id, ra, dec, rad, mag) {
  var f = cacheDe(id, rad);
  if (fs.existsSync(f)) return Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8')));
  process.stderr.write('  bajando ' + id + ' rad=' + rad.toFixed(3) + '°… ');
  var t0 = Date.now();
  return pedir(ra, dec, rad, mag).then(function (j) {
    fs.writeFileSync(f, JSON.stringify(j));
    process.stderr.write(((Date.now() - t0) / 1000).toFixed(1) + ' s, ' +
      (j.data ? j.data.length : 0) + ' filas' + (j.fondo ? ' + fondo' : '') + '\n');
    return j;
  });
}

// mag/arcsec² de un flujo (unidades de estrella G=0) repartido en un área en arcsec².
function sb(flujo, areaAs2) {
  return (flujo > 0 && areaAs2 > 0) ? -2.5 * Math.log10(flujo / areaAs2) : Infinity;
}

function medir(c, eq) {
  var campoArcmin = AFOV * 60 / eq.MAG;               // campo real del ocular
  /* radioConsulta() no está exportada: esta es la ÚNICA ley copiada del módulo
     (0,72 del campo, acotada). Si cambia allí, hay que cambiarla aquí. */
  var rad = Math.min((360 / 60) * 0.72, Math.max(0.12, (campoArcmin / 60) * 0.72));
  var pupila = APERTURA / eq.MAG;
  return consultar(c[0], c[1], c[2], rad, magConsulta(eq.MAG)).then(function (j) {
    var estrellas = (j.data || []).map(function (d) { return [+d[0], +d[1], +d[2]]; });
    var velo = R.veloSB(j.fondo);

    var cielo = { sqm: SQM, pupilaSalida: pupila, pupilaOjo: POJO, transmision: T, aumentos: eq.MAG };
    var mlim = R.magLimite({ apertura: APERTURA, aumentos: eq.MAG, transmision: T, sqm: SQM, pupilaOjo: POJO });
    if (velo != null) {
      // Igual que vistaGaia: el velo es cielo extra y rehace la magnitud límite.
      cielo.veloSB = velo;
      mlim = R.magLimite({ apertura: APERTURA, aumentos: eq.MAG, transmision: T, sqm: SQM,
                           pupilaOjo: POJO, veloSB: velo });
    }
    var corte = mlim + COLA_GLOW;

    /* Región de medida: el disco del objeto, recortado al campo del ocular —un
       objeto más grande que el campo no cabe, y medir fuera del campo sería
       medir lo que el observador no ve. */
    var rMedidaArcmin = Math.min(c[3], campoArcmin / 2);
    var areaMedida = Math.PI * Math.pow(rMedidaArcmin * 60, 2);          // arcsec²
    var areaCono = Math.PI * Math.pow(rad * 3600, 2);                    // arcsec²

    var F = { estrellas: 0, glow: 0, niebla: 0 }, N = { estrellas: 0, glow: 0, niebla: 0 };
    var cos0 = Math.cos(c[2] * Math.PI / 180);
    for (var i = 0; i < estrellas.length; i++) {
      var g = estrellas[i][2];
      if (!(g > 0)) continue;
      var dra = ((estrellas[i][0] - c[1] + 540) % 360) - 180;
      var dx = dra * cos0 * 60, dy = (estrellas[i][1] - c[2]) * 60;      // arcmin
      if (Math.sqrt(dx * dx + dy * dy) > rMedidaArcmin) continue;
      var k = (g <= mlim) ? 'estrellas' : (g <= corte ? 'glow' : 'niebla');
      F[k] += Math.pow(10, -0.4 * g);
      N[k]++;
    }
    /* El velo es uniforme sobre el campo por construcción (ADR 0014), así que
       para compararlo con los otros canales se escala a la misma área. */
    var Fvelo = (j.fondo && j.fondo.flujo > 0) ? j.fondo.flujo * (areaMedida / areaCono) : 0;
    var nVelo = (j.fondo && j.fondo.n > 0) ? j.fondo.n * (areaMedida / areaCono) : 0;

    var total = F.estrellas + F.glow + F.niebla + Fvelo;
    var subMlim = F.glow + F.niebla + Fvelo;
    var ctx = R.ctxFotometrico(cielo, R.thetaNieblaArcmin(cielo));

    return {
      objeto: c[0], papel: c[4], equipo: eq.id, campoArcmin: campoArcmin,
      radConsultaDeg: rad, filas: estrellas.length, truncada: !!j.fondo,
      rMedidaArcmin: rMedidaArcmin, mlim: mlim, corte: corte,
      veloSB: velo, corteTruncado: j.fondo ? j.fondo.corte : null,
      n: N, nVelo: nVelo,
      F: { estrellas: F.estrellas, glow: F.glow, niebla: F.niebla, velo: Fvelo },
      mu: {
        estrellas: sb(F.estrellas, areaMedida), glow: sb(F.glow, areaMedida),
        niebla: sb(F.niebla, areaMedida), velo: sb(Fvelo, areaMedida),
        sub: sb(subMlim, areaMedida), cielo: ctx.SBe
      },
      frac: {
        glow: subMlim > 0 ? F.glow / subMlim : 0,
        niebla: subMlim > 0 ? F.niebla / subMlim : 0,
        velo: subMlim > 0 ? Fvelo / subMlim : 0
      },
      // Contraste de la niebla contra el cielo, con el Cmin de producción.
      Cniebla: F.niebla / (Math.pow(10, -0.4 * SQM) * areaMedida),
      Cmin: ctx.Cmin
    };
  });
}

function pct(x) { return (100 * x).toFixed(1).padStart(5) + ' %'; }
function m(x) { return isFinite(x) ? x.toFixed(2).padStart(6) : '     —'; }

(function () {
  var filas = [], tareas = Promise.resolve();
  BANCO.forEach(function (c) {
    EQUIPOS.forEach(function (eq) {
      tareas = tareas.then(function () {
        return medir(c, eq).then(function (f) { filas.push(f); });
      });
    });
  });
  tareas.then(function () {
    console.log('\nCanales de la luz de Gaia · apertura 457 mm (18″), sqm ' + SQM +
                ', T ' + T + ', ocular de ' + AFOV + '°\n');
    console.log('objeto      equipo  campo   r_med   mlim   corte  | reparto del flujo SUB-mlim   | μ niebla  μ velo   C/Cmin');
    console.log('-'.repeat(118));
    filas.forEach(function (f) {
      console.log(
        f.objeto.padEnd(10) + '  ' + f.equipo.padEnd(6) + ' ' +
        f.campoArcmin.toFixed(1).padStart(5) + '′ ' +
        f.rMedidaArcmin.toFixed(1).padStart(5) + '′ ' +
        m(f.mlim) + '  ' + m(f.corte) + '  | ' +
        'glow ' + pct(f.frac.glow) + '  niebla ' + pct(f.frac.niebla) + '  velo ' + pct(f.frac.velo) + ' | ' +
        m(f.mu.niebla) + '  ' + m(f.veloSB == null ? Infinity : f.mu.velo) + '  ' +
        (f.Cmin > 0 ? (f.Cniebla / f.Cmin).toFixed(2).padStart(6) : '     —'));
    });
    console.log('\nDetalle por objeto:');
    filas.forEach(function (f) {
      console.log('  ' + f.objeto + ' ' + f.equipo + ': ' + f.filas + ' filas' +
        (f.truncada ? ' TRUNCADA (velo desde corte G=' + f.corteTruncado + ', SB ' + f.veloSB.toFixed(2) + ')' : ' completa (sin velo)') +
        ' · n = ' + f.n.estrellas + ' estrellas / ' + f.n.glow + ' glow / ' + f.n.niebla + ' niebla' +
        (f.nVelo ? ' / ' + Math.round(f.nVelo) + ' velo' : '') +
        ' · μ_sub ' + f.mu.sub.toFixed(2) + ' contra cielo ' + f.mu.cielo.toFixed(2));
    });
    var salida = arg('json', null);
    if (salida) fs.writeFileSync(salida, JSON.stringify(filas, null, 2));
  }).catch(function (e) {
    console.error('FALLO: ' + (e && e.message));
    process.exit(1);
  });
})();
