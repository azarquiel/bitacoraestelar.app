#!/usr/bin/env node
/* Genera la TEXTURA propia de un objeto difuso: PNG de 16 bits + sidecar JSON,
   y la fila del manifiesto que el navegador lee para saber que existe.

   Por qué en Node y no en Python: las leyes que esto necesita —parseFITS,
   ps1LadoArcmin, ps1CabeEnParche, ps1GalaxiasDelCampo, ps1Cielo, ps1SigmaCielo,
   ps1EscenaEnParche, y la codificación asinh16— ya están escritas y probadas en
   resources/js/, y las comparte con el navegador. Copiarlas a Python sería la
   deriva que prohíbe el ADR 0008. Aquí no se define ninguna ley: se llaman.

   Un objeto por ejecución (`--solo`) o el banco entero del ADR 0024
   (`--banco`), que la lista la devuelve lib_banco_dso.js y no se escribe aquí.
   Reanudable: lo que ya tiene su `<v>` en disco no se vuelve a pedir ni a
   escribir, así que una ejecución interrumpida continúa donde estaba.

   El parche viene de lib_bajar_parche.js, con su caché en $PS1_HARNESS_DIR: si
   el objeto ya está bajado, esto no toca la red. Un objeto sin cobertura de PS1
   no se reintenta para siempre: deja su fila de manifiesto (`sin-cobertura`) y
   la siguiente ejecución lo salta. Sin pausas ni espera creciente: la fase 0
   midió 147 descargas seguidas sin un solo estrangulamiento y basta con un
   reintento simple (docs/validacion/dso_texturas_fase0.md §D).

   Uso:  node scripts/gen_dso_texturas.js --solo "NGC 5194"
         node scripts/gen_dso_texturas.js --banco
         node scripts/gen_dso_texturas.js --banco --seco   # qué haría, sin red
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
var INFORME = path.join(RAIZ, 'simulador_ocular', 'docs', 'validacion', 'dso_texturas_informe.md');

/* Umbral de la lista de revisión, del §5 fase 0 del objetivo: por encima de esta
   fracción de ausencia DENTRO de la escena, el objeto se mira a ojo antes de
   darlo por bueno. No excluye a nadie —eso sería una ley nueva, y las leyes van
   al ADR— solo lo pone en la lista del informe. */
var REVISION = 0.2;

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

/* Un objeto que no puede tener textura deja su propio sidecar (`<id>.fila.json`,
   sin PNG): así el veredicto es reanudable —no se vuelve a pedir a STScI lo que
   ya se sabe que no está— y el manifiesto se sigue reconstruyendo del disco.
   Los cinco controles de exclusión NO pasan por aquí: su veredicto es el del
   banco y se calcula sin tocar la red ni el disco. */
function escribirFila(dir, nombre, motivo, ra, dec) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PS1.ps1IdTextura(nombre) + '.fila.json'),
    JSON.stringify({ nombre: nombre, modelo: 'fila', motivo: motivo,
                     generador: GENERADOR, ra: ra, dec: dec }, null, 1) + '\n');
}

/* Filas de los controles del ADR 0024. Se leen del banco, que las decide con
   `decMin` y `ps1CabeEnParche` —las leyes de producción— y no de una lista de
   motivos escrita a mano: si el catálogo cambiara y uno dejara de ser control,
   el banco lo dice en `avisos` y aquí no aparece con un motivo falso. */
function filasControl() {
  return BANCO.banco().controles.filter(function (c) {
    return c.fila && (c.real === 'sur' || c.real === 'no-cabe');
  }).map(function (c) {
    return { ra: c.fila[2], fila: [c.fila[0], 'fila', '', 0, 0, 0, c.real] };
  });
}

/* Los sidecars de los dos directorios, uno por objeto. Si un objeto tiene los
   dos —primero se quedó sin cobertura y luego apareció— manda la textura: el
   veredicto de ausencia caducó en cuanto hubo píxeles. */
function sidecarsDe(dir) {
  var porNombre = {};
  sidecars(FIXTURES).concat(dir === FIXTURES ? [] : sidecars(dir))
    .forEach(function (s) {
      var v = porNombre[s.nombre];
      if (!v || v.modelo === 'fila' || s.modelo !== 'fila') porNombre[s.nombre] = s;
    });
  return Object.keys(porNombre).map(function (n) { return porNombre[n]; });
}

function escribirManifiesto(dir) {
  var filas = sidecarsDe(dir)
    .map(function (s) {
      return { ra: s.ra, fila: s.modelo === 'fila'
        ? [s.nombre, 'fila', '', 0, 0, 0, s.motivo]
        : [s.nombre, 'imagen', s.version, s.ancho, s.escalaAs, s.auditoria.fracAusencia, ''] };
    })
    .concat(filasControl())
    .sort(function (a, b) { return a.ra - b.ra; })
    .map(function (e) { return e.fila; });
  var cuerpo = filas.map(function (f) {
    return '  ' + JSON.stringify(f).replace(/,/g, ', ') + ',';
  }).join('\n');
  fs.writeFileSync(MANIFIESTO,
    '/* Texturas DSO — GENERADO, no editar a mano.\n' +
    '   Regenerar: node scripts/gen_dso_texturas.js --banco (o --solo "<nombre>")\n' +
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
  /* Un objeto que no cabe o está al sur no se descarga ni se escribe: su fila de
     manifiesto sale del banco (`filasControl`), sin disco y sin red. */
  if (motivo) throw new Error(nombre + ' no admite textura (' + motivo + '): su fila la pone el manifiesto, no una textura');

  var lado = PS1.ps1LadoArcmin(f[4]);
  var campo = PS1.ps1GalaxiasDelCampo([f], f[2], f[3], lado);
  if (!campo.length) throw new Error(nombre + ': ps1GalaxiasDelCampo no lo devuelve');
  var gal = campo[0], salida = PS1.cfg.salida, v = version(gal, salida);

  var id = PS1.ps1IdTextura(gal.nombre), base = path.join(dir, id + '.' + v);
  /* Reanudación: lo ya resuelto —textura escrita, o veredicto de que no la
     tendrá— no se vuelve a pedir. Se mira también en las fixtures, que es donde
     viven las texturas del banco golden. */
  if ([dir, FIXTURES].some(function (d) { return fs.existsSync(path.join(d, id + '.fila.json')); })) {
    console.log('ya estaba (fila): ' + id);
    return Promise.resolve('fila');
  }
  var hecho = [dir, FIXTURES].filter(function (d) {
    return fs.existsSync(path.join(d, id + '.' + v + '.png')) &&
           fs.existsSync(path.join(d, id + '.' + v + '.json'));
  })[0];
  if (hecho) {
    console.log('ya estaba: ' + id + '.' + v + '.{png,json} en ' + path.relative(RAIZ, hecho));
    return Promise.resolve('ya');
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
    return 'nuevo';
  });
}

/* ── El banco entero ──────────────────────────────────────────────────────
   La lista la devuelve lib_banco_dso.js: aquí no hay ningún nombre ni ninguna
   cuenta de objetos (ADR 0005). En serie a propósito —STScI es un servicio
   ajeno— y reanudable, que `generar` salta lo ya escrito.

   `--seco` recorre el banco sin pedir nada: dice qué falta y qué haría. Es lo
   que se puede probar sin red, y lo que se mira antes de una tirada larga. */
function correrBanco(dir, seco) {
  var b = BANCO.banco();
  b.avisos.forEach(function (a) { console.log('AVISO · ' + a); });
  var estado = { objetos: b.objetos.length, controles: b.controles.length,
                 nuevos: 0, ya: 0, filas: 0, pendientes: 0, fallos: [] };

  return b.objetos.reduce(function (cadena, o, i) {
    return cadena.then(function () {
      console.log('\n[' + (i + 1) + '/' + b.objetos.length + '] ' + o.nombre + '  (' + o.motivo + ')');
      if (seco) {
        var v = version(o.gal, PS1.cfg.salida), id = PS1.ps1IdTextura(o.nombre);
        var hay = [dir, FIXTURES].some(function (d) {
          return fs.existsSync(path.join(d, id + '.' + v + '.png')) ||
                 fs.existsSync(path.join(d, id + '.fila.json'));
        });
        console.log('  ' + (hay ? 'ya está' : 'pediría') + '  ' + id + '.' + v +
          '  ' + o.gal.ladoArcmin.toFixed(2) + '′ → ' + PS1.cfg.salida + ' px');
        if (hay) estado.ya++; else estado.pendientes++;
        return;
      }
      /* `generar` avisa de lo suyo tirando —también antes de la primera promesa,
         cuando el objeto ni siquiera admite textura—, así que la llamada va
         envuelta: un objeto que revienta no puede tumbar la tirada entera.
         Un reintento simple, que es lo que la fase 0 justificó (§D): sin pausas
         ni espera creciente, porque no se midió estrangulamiento alguno. */
      var intento = function () { return Promise.resolve().then(function () { return generar(o.nombre, dir); }); };
      return intento().catch(intento)
        .then(function (r) { estado[r === 'nuevo' ? 'nuevos' : r === 'fila' ? 'filas' : 'ya']++; })
        .catch(function (e) {
          /* Sin cobertura de PS1 es un veredicto, no una avería: se anota como
             fila de manifiesto y no se vuelve a pedir nunca más. */
          if (/sin cobertura|ninguna celda/.test(e.message)) {
            escribirFila(dir, o.nombre, 'sin-cobertura', o.gal.ra, o.gal.dec);
            estado.filas++;
            console.log('  sin cobertura de PS1 → fila de manifiesto');
          } else {
            estado.fallos.push(o.nombre + ': ' + e.message);
            console.log('  FALLO: ' + e.message);
          }
        });
    });
  }, Promise.resolve()).then(function () { return estado; });
}

/* ── El informe ───────────────────────────────────────────────────────────
   Lo que hay ESCRITO, no lo que se pretendía escribir: sale de los sidecars y
   del peso de los PNG en disco, igual que el manifiesto, y por eso una tirada a
   medias se ve como lo que es. Sin fecha dentro, para que regenerarlo sin haber
   generado nada no ensucie el árbol: la fecha la lleva el commit. */
function escribirInforme(dir) {
  var todos = sidecarsDe(dir);
  var imagenes = todos.filter(function (s) { return s.modelo !== 'fila'; })
    .sort(function (a, b) { return a.ra - b.ra; });

  var b = BANCO.banco(), cuenta = {};
  cuenta['imagen'] = imagenes.length;
  todos.filter(function (s) { return s.modelo === 'fila'; })
    .forEach(function (s) { cuenta[s.motivo] = (cuenta[s.motivo] || 0) + 1; });
  filasControl().forEach(function (e) { cuenta[e.fila[6]] = (cuenta[e.fila[6]] || 0) + 1; });
  /* Pendiente = sin textura Y sin veredicto. Un objeto con su fila escrita
     (`sin-cobertura`) está resuelto: no se le va a volver a pedir nada. */
  var resuelto = {};
  todos.forEach(function (s) { resuelto[BANCO.clave(s.nombre)] = 1; });
  var pendientes = b.objetos.filter(function (o) { return !resuelto[BANCO.clave(o.nombre)]; });

  /* Volumen: bytes en disco, y bytes/px, que es la cifra con la que la fase 0
     corrigió el ×0,6 de la tabla 4.2 del objetivo. */
  var bytes = 0, bpp = [];
  imagenes.forEach(function (s) {
    var f = [dir, FIXTURES].map(function (d) {
      return path.join(d, PS1.ps1IdTextura(s.nombre) + '.' + s.version + '.png');
    }).filter(function (p) { return fs.existsSync(p); })[0];
    if (!f) return;
    var n = fs.statSync(f).size;
    bytes += n;
    bpp.push(n / (s.ancho * s.alto));
  });
  bpp.sort(function (a, c) { return a - c; });
  var mediana = bpp.length ? bpp[bpp.length >> 1] : 0;

  /* Los mismos tramos de escala que la tabla B de la fase 0, para poder
     comparar sin volver a decidir dónde cortar. */
  var TRAMOS = [[0, 0.15], [0.15, 0.25], [0.25, 0.5], [0.5, Infinity]];
  var hist = TRAMOS.map(function (t) {
    return imagenes.filter(function (s) { return s.escalaAs >= t[0] && s.escalaAs < t[1]; }).length;
  });

  var revision = imagenes.filter(function (s) {
    return s.auditoria && s.auditoria.fracAusenciaEscena > REVISION;
  }).sort(function (a, c) { return c.auditoria.fracAusenciaEscena - a.auditoria.fracAusenciaEscena; });

  var L = [];
  L.push('# Texturas DSO — informe de generación');
  L.push('');
  L.push('GENERADO por `node scripts/gen_dso_texturas.js --banco`, no editar a mano.');
  L.push('Sale de los sidecars y de los PNG escritos, así que una tirada a medias se');
  L.push('ve como lo que es. El banco lo fija el ADR 0024 y lo devuelve');
  L.push('`scripts/lib_banco_dso.js`.');
  L.push('');
  L.push('## Cuenta por motivo');
  L.push('');
  L.push('| modelo / motivo | objetos |');
  L.push('|---|---|');
  Object.keys(cuenta).sort().forEach(function (k) { L.push('| ' + k + ' | ' + cuenta[k] + ' |'); });
  L.push('| pendientes del banco | ' + pendientes.length + ' |');
  L.push('| **banco (ADR 0024)** | **' + b.objetos.length + ' + ' + b.controles.length + ' controles** |');
  b.avisos.forEach(function (a) { L.push(''); L.push('> AVISO · ' + a); });
  L.push('');
  L.push('## Volumen');
  L.push('');
  L.push('| medida | valor |');
  L.push('|---|---|');
  L.push('| texturas escritas | ' + imagenes.length + ' |');
  L.push('| total en disco | ' + (bytes / 1048576).toFixed(1) + ' MB |');
  L.push('| bytes/px (mediana) | ' + mediana.toFixed(2) + ' |');
  L.push('');
  L.push('## Histograma de `escalaAs`');
  L.push('');
  L.push('| ″/px | texturas |');
  L.push('|---|---|');
  L.push('| < 0,15 | ' + hist[0] + ' |');
  L.push('| 0,15 – 0,25 | ' + hist[1] + ' |');
  L.push('| 0,25 – 0,5 | ' + hist[2] + ' |');
  L.push('| ≥ 0,5 | ' + hist[3] + ' |');
  L.push('');
  L.push('## Lista de revisión');
  L.push('');
  L.push('Objetos con `fracAusenciaEscena` > ' + (100 * REVISION).toFixed(0) +
         ' %: la ausencia cae dentro de la escena y hay que mirarlos a ojo antes');
  L.push('de darlos por buenos (objetivo §5, fase 0).');
  L.push('');
  if (!revision.length) L.push('Ninguno.');
  else {
    L.push('| objeto | fracAusenciaEscena | fracAusencia |');
    L.push('|---|---|---|');
    revision.forEach(function (s) {
      L.push('| ' + s.nombre + ' | ' + (100 * s.auditoria.fracAusenciaEscena).toFixed(1) +
             ' % | ' + (100 * s.auditoria.fracAusencia).toFixed(1) + ' % |');
    });
  }
  if (pendientes.length) {
    L.push('');
    L.push('## Pendientes');
    L.push('');
    L.push('Objetos del banco sin textura ni veredicto: caen al proxy mientras');
    L.push('`BitacoraPS1.cfg.proxyRespaldo` siga encendido (régimen mixto).');
    L.push('');
    L.push(pendientes.map(function (o) { return o.nombre; }).join(', ') + '.');
  }
  L.push('');
  fs.writeFileSync(INFORME, L.join('\n'));
  return { imagenes: imagenes.length, pendientes: pendientes.length,
           revision: revision.length, bytes: bytes, cuenta: cuenta };
}

/* Requerido como módulo (scripts/test_dso_texturas.js) no genera nada: expone
   lo que se puede probar sin red ni disco. */
module.exports = { version: version, filaDe: filaDe, motivoAusencia: motivoAusencia,
                   escribirManifiesto: escribirManifiesto, escribirInforme: escribirInforme,
                   filasControl: filasControl, generar: generar, correrBanco: correrBanco,
                   GENERADOR: GENERADOR, FIXTURES: FIXTURES, MANIFIESTO: MANIFIESTO,
                   INFORME: INFORME, REVISION: REVISION };
if (require.main !== module) return;

var nombre = arg('--solo', '');
var dir = path.resolve(RAIZ, arg('--dir', path.join('simulador_ocular', 'dso')));
var enBanco = process.argv.indexOf('--banco') > 0, seco = process.argv.indexOf('--seco') > 0;
if (!nombre && !enBanco) {
  console.error('uso: node scripts/gen_dso_texturas.js --solo "NGC 5194" | --banco [--seco] [--dir <ruta>]');
  process.exit(2);
}

/* El manifiesto y el informe se escriben SIEMPRE al final, también tras una
   tirada a medias o con fallos: los dos se reconstruyen de lo que hay en disco,
   así que declarar de menos es correcto y declarar de más, imposible. */
function cerrar(estado) {
  console.log('\nmanifiesto: ' + escribirManifiesto(dir) + ' fila(s) en ' +
    path.relative(RAIZ, MANIFIESTO));
  var inf = escribirInforme(dir);
  console.log('informe: ' + path.relative(RAIZ, INFORME) + '  ' + inf.imagenes +
    ' textura(s), ' + inf.pendientes + ' pendiente(s), ' + inf.revision + ' a revisar, ' +
    (inf.bytes / 1048576).toFixed(1) + ' MB');
  if (estado && estado.fallos.length) {
    console.error('\n' + estado.fallos.length + ' fallo(s):\n  ' + estado.fallos.join('\n  '));
    process.exit(1);
  }
}

/* Envuelto: `generar` avisa tirando, y también antes de la primera promesa. */
Promise.resolve().then(function () {
  return enBanco ? correrBanco(dir, seco) : generar(nombre, dir).then(function () { return null; });
}).then(cerrar)
  .catch(function (e) {
    console.error('FALLO: ' + e.message);
    process.exit(1);
  });
