#!/usr/bin/env node
/* Genera la TEXTURA propia de un objeto difuso: PNG de 16 bits + sidecar JSON,
   y la fila del manifiesto que el navegador lee para saber que existe.

   Por qué en Node y no en Python: las leyes que esto necesita —parseFITS,
   ps1LadoArcmin, ps1CabeEnParche, ps1GalaxiasDelCampo, ps1Cielo, ps1SigmaCielo,
   ps1EscenaEnParche, y la codificación asinh16— ya están escritas y probadas en
   resources/js/, y las comparte con el navegador. Copiarlas a Python sería la
   deriva que prohíbe el ADR 0008. Aquí no se define ninguna ley: se llaman.

   Un objeto por ejecución (`--solo`), que es la rebanada de #200; cubrir el
   banco entero, con reanudación e informe, es #201.

   El parche viene de lib_bajar_parche.js, con su caché en $PS1_HARNESS_DIR: si
   el objeto ya está bajado, esto no toca la red.

   Uso:  node scripts/gen_dso_texturas.js --solo "NGC 5194"
         node scripts/gen_dso_texturas.js --solo "NGC 5194" --dir scripts/fixtures/dso
*/
'use strict';

var fs = require('fs'), path = require('path'), crypto = require('crypto');
var RAIZ = path.join(__dirname, '..');

global.window = global.window || {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));

var PS1 = window.BitacoraPS1, P16 = window.BitacoraPNG16;
var LIBPNG = require('./lib_png.js');
var bajar = require('./lib_bajar_parche.js')(window.BitacoraGaiaRender).bajar;
/* Del banco salen dos cosas que ya estaban resueltas y no se rehacen aquí: la
   clave con la que se busca un nombre (las galaxias van 'NGC 5194' y las
   nebulosas 'NGC0040', y hay alternos) y el veredicto de si un objeto es apto.
   Reescribirlas sería la deriva del ADR 0008 y, de paso, dejaría al generador
   sin encontrar la mitad del catálogo. */
var BANCO = require('./lib_banco_dso.js')(window.BitacoraGaiaRender);

/* Versión del generador. Súbela cuando cambie lo que determina los píxeles: el
   nombre de fichero lleva el hash, así que subirla republica todas las
   texturas y deja las viejas huérfanas (la URL es inmutable a propósito). */
var GENERADOR = 'gen_dso_texturas 1';
var SONDEO = 'PS1 DR2 3π stack';
var MANIFIESTO = path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'dso-texturas-datos.js');
var FIXTURES = path.join(RAIZ, 'scripts', 'fixtures', 'dso');

function arg(n, pordefecto) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
}

/* Hash de LO QUE DETERMINA LOS PÍXELES, y de nada más: ni la fecha ni el
   directorio de salida entran. Mismo stack y mismos parámetros, mismo nombre de
   fichero, y por eso la URL puede ser inmutable. */
function version(gal, salida) {
  var semilla = [GENERADOR, SONDEO, PS1.cfg.banda, gal.nombre,
                 gal.ra.toFixed(5), gal.dec.toFixed(5),
                 gal.ladoArcmin.toFixed(3), salida, 'asinh16'].join('|');
  return crypto.createHash('sha256').update(semilla).digest('hex').slice(0, 8);
}

function filaDe(nombre) {
  var todas = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);
  var k = BANCO.clave(nombre);
  for (var i = 0; i < todas.length; i++) {
    if (BANCO.clave(todas[i][0]) === k || (todas[i][1] && BANCO.clave(todas[i][1]) === k)) return todas[i];
  }
  return null;
}

/* Por qué un objeto no puede tener textura. El veredicto es el del banco
   (`apta`); aquí solo se le pone nombre al que de los dos falló, que es lo que
   va a la columna `motivo` del manifiesto. */
function motivoAusencia(f) {
  if (BANCO.apta(f)) return '';
  return (f[3] > PS1.cfg.decMin) ? 'no-cabe' : 'sur';
}

/* El manifiesto se reconstruye de los sidecars ESCRITOS: así es reanudable sin
   llevar estado aparte, y no puede declarar una textura que no exista.

   De los dos directorios, no solo del de salida: las texturas del banco golden
   viven en `scripts/fixtures/dso/` (van en git, son la entrada de los tests) y
   las demás en `simulador_ocular/dso/`, y generar en uno no puede borrar del
   manifiesto lo que está en el otro. Si un objeto está en los dos, manda el
   directorio de salida, que es el que se acaba de escribir.
   Ordenado por RA, como el resto de catálogos. */
function sidecars(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (n) { return /\.json$/.test(n); })
    .map(function (n) { return JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')); });
}

function escribirManifiesto(dir) {
  var porNombre = {};
  sidecars(FIXTURES).concat(dir === FIXTURES ? [] : sidecars(dir))
    .forEach(function (s) { porNombre[s.nombre] = s; });
  var filas = Object.keys(porNombre).map(function (n) { return porNombre[n]; })
    .sort(function (a, b) { return a.ra - b.ra; })
    .map(function (s) {
      return [s.nombre, 'imagen', s.version, s.ancho, s.escalaAs,
              s.auditoria.fracAusencia, ''];
    });
  var cuerpo = filas.map(function (f) {
    return '  ' + JSON.stringify(f).replace(/,/g, ', ') + ',';
  }).join('\n');
  fs.writeFileSync(MANIFIESTO,
    '/* Texturas DSO — GENERADO, no editar a mano.\n' +
    '   Regenerar: node scripts/gen_dso_texturas.js --solo "<nombre>"\n' +
    '   Campos: [nombre, modelo, version, ancho, escalaAs, fracAusencia, motivo]\n' +
    '   modelo ∈ {imagen, fila}; motivo ∈ {"", sur, no-cabe, sin-cobertura,\n' +
    '   pisada, ausencia-excesiva}. Una fila que no está aquí se pide al proxy\n' +
    '   mientras BitacoraPS1.cfg.proxyRespaldo siga encendido. */\n' +
    'window.BITACORA_DSO_TEXTURAS = [\n' + cuerpo + '\n];\n');
  return filas.length;
}

function generar(nombre, dir) {
  var f = filaDe(nombre);
  if (!f) throw new Error('no está en el catálogo difuso: ' + nombre);
  var motivo = motivoAusencia(f);
  if (motivo) throw new Error(nombre + ' no admite textura (' + motivo + '): eso es una fila de manifiesto, y las escribe #201');

  var lado = PS1.ps1LadoArcmin(f[4]);
  var campo = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], lado);
  if (!campo.length) throw new Error(nombre + ': ps1GalaxiasDelCampo no lo devuelve');
  var gal = campo[0], salida = PS1.cfg.salida, v = version(gal, salida);

  var base = path.join(dir, PS1.ps1IdTextura(gal.nombre) + '.' + v);
  if (fs.existsSync(base + '.png') && fs.existsSync(base + '.json')) {
    console.log('ya estaba: ' + path.basename(base) + '.{png,json}');
    return Promise.resolve();
  }

  return bajar(gal.ra, gal.dec, gal.ladoArcmin, salida).then(function (p) {
    var esperada = gal.ladoArcmin * 60 / salida;
    if (Math.abs(p.escalaAs - esperada) > 1e-3) {
      throw new Error('la escala del recorte (' + p.escalaAs + '″/px) no es la pedida (' + esperada + ')');
    }

    /* Auditoría con las funciones de producción, no con una copia: el runtime
       vuelve a calcular cielo y σ sobre los datos decodificados, y estos números
       están aquí para poder comparar y para la lista de revisión. */
    var cielo = PS1.ps1Cielo(p.datos, p.ancho, p.alto);
    var sigma = PS1.ps1SigmaCielo(p.datos, p.ancho, p.alto, cielo);
    var fits = { ancho: p.ancho, alto: p.alto, datos: p.datos, escalaAs: p.escalaAs, wcs: p.wcs || null };
    fits.afin = PS1.ps1AfinParche(fits, gal);
    var escena = PS1.ps1EscenaEnParche(fits, gal, [gal]);

    var nAus = 0, nAusEsc = 0, nEsc = 0, i, x, y;
    for (y = 0; y < p.alto; y++) {
      for (x = 0; x < p.ancho; x++) {
        i = y * p.ancho + x;
        var dentro = PS1.ps1FuenteEnEscena(escena, fits.afin, x, y);
        if (dentro) nEsc++;
        if (p.datos[i] === p.datos[i]) continue;
        nAus++;
        if (dentro) nAusEsc++;
      }
    }

    /* a = σ del cielo: con él el paso de cuantización cerca del cielo vale
       ≈ 2e-4 σ (§4.1 del objetivo). Los extremos los fija el propio parche. */
    var cod = P16.codificar(p.datos, { a: sigma });

    /* Error de cuantización sobre lo que se va a escribir, no sobre el ideal:
       se decodifica y se mide. Va al sidecar porque es listón (L1.1). */
    var vuelta = P16.decodificar(cod.u16, cod), errSigma = 0, errRel = 0;
    for (i = 0; i < p.datos.length; i++) {
      var a = p.datos[i], b = vuelta[i];
      if (a !== a) continue;
      if (Math.abs(a) < 5 * sigma) errSigma = Math.max(errSigma, Math.abs(b - a) / sigma);
      else errRel = Math.max(errRel, Math.abs(b / a - 1));
    }

    fs.mkdirSync(dir, { recursive: true });
    LIBPNG.escribirGris16(base + '.png', cod.u16, p.ancho, p.alto);
    var sidecar = {
      nombre: gal.nombre, version: v, generador: GENERADOR,
      ra: gal.ra, dec: gal.dec,
      fuente: { sondeo: SONDEO, banda: PS1.cfg.banda, descargado: new Date().toISOString().slice(0, 10) },
      ancho: p.ancho, alto: p.alto, ladoArcmin: gal.ladoArcmin, escalaAs: p.escalaAs,
      /* La WCS tal cual la deja parseFITS, no en tarjetas FITS: pasar de
         CRPIX/CDELT/PC a esto es una ley, y esa ley ya vive en parseFITS
         (ADR 0008). Así ps1LeerTextura la entrega sin tocarla. */
      wcs: p.wcs || null,
      codificacion: { tipo: 'asinh16', a: cod.a, uMin: cod.uMin, uMax: cod.uMax, centinela: 0 },
      auditoria: {
        cielo: cielo, sigma: sigma,
        fracAusencia: nAus / p.datos.length,
        fracAusenciaEscena: nEsc ? nAusEsc / nEsc : 0,
        errCuantMaxSigma: errSigma, errCuantMaxRel: errRel
      }
      /* `fuentesConservadas` y `procedencia` los dibuja el §4.1 del objetivo,
         pero son de las fases 3 y 4: escribirlos vacíos hoy no dice nada y el
         hash de versión no los cubre. Nacen cuando haya algo que poner. */
    };
    fs.writeFileSync(base + '.json', JSON.stringify(sidecar, null, 1) + '\n');

    var kb = Math.round(fs.statSync(base + '.png').size / 1024);
    console.log(gal.nombre + ' → ' + path.basename(base) + '.png  ' +
      p.ancho + '×' + p.alto + '  ' + p.escalaAs.toFixed(4) + '″/px  ' + kb + ' kB');
    console.log('  cielo ' + cielo.toFixed(4) + '  σ ' + sigma.toFixed(4) +
      '  ausencia ' + (100 * sidecar.auditoria.fracAusencia).toFixed(2) + ' %' +
      ' (en escena ' + (100 * sidecar.auditoria.fracAusenciaEscena).toFixed(2) + ' %)');
    console.log('  error de cuantización: ' + errSigma.toExponential(2) + ' σ cerca del cielo, ' +
      errRel.toExponential(2) + ' relativo por encima de 5σ');
  });
}

/* Requerido como módulo (scripts/test_dso_texturas.js) no genera nada: expone
   lo que se puede probar sin red ni disco. */
module.exports = { version: version, filaDe: filaDe, motivoAusencia: motivoAusencia,
                   escribirManifiesto: escribirManifiesto, generar: generar,
                   GENERADOR: GENERADOR, FIXTURES: FIXTURES, MANIFIESTO: MANIFIESTO };
if (require.main !== module) return;

var nombre = arg('--solo', '');
var dir = path.resolve(RAIZ, arg('--dir', path.join('simulador_ocular', 'dso')));
if (!nombre) {
  console.error('uso: node scripts/gen_dso_texturas.js --solo "NGC 5194" [--dir <ruta>]');
  process.exit(2);
}
generar(nombre, dir).then(function () {
  console.log('manifiesto: ' + escribirManifiesto(dir) + ' textura(s) en ' +
    path.relative(RAIZ, MANIFIESTO));
}).catch(function (e) {
  console.error('FALLO: ' + e.message);
  process.exit(1);
});
