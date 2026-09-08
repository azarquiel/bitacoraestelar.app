#!/usr/bin/env node
/* Hojas de validación VISUAL de la rama nebulosa planetaria.

   Pinta el buffer difuso de producción (montaje lib_parche_produccion +
   window.BitacoraPS1.ps1PintarParche) y lo vuelca a PNG con el mapeo de nivel de pintarFot
   (nivelFondo + valorDeFlujo), sin la capa de estrellas-sprite ni el realce
   local: lo que se valida aquí es morfología, tamaño angular y respuesta de
   la rampa al fondo — los bits los vigila test_golden_difusas.js.

   Salidas: .scratch/vistas-np[-etiqueta]/*.png + resumen por consola.

   La etiqueta existe para que «antes/después» sea posible: sin ella, la segunda
   pasada sobrescribe la primera y el antes se pierde. El procedimiento está en
   simulador_ocular/docs/notas/validacion-visual-difusas.md

   De dónde sale el parche: `--fuente fits` (por defecto) baja el stack por
   lib_bajar_parche, que es el camino de ANTES de la fase 1; `--fuente textura`
   lo lee de la textura publicada con el `ps1LeerTextura` del navegador sobre
   ficheros de disco, que es el de DESPUÉS. Es el mismo cambio que mide
   harness_l1_equivalencia.js en bits, aquí mirado a ojo. Un objeto cuya textura
   sea una `fila` (no cabe, sur, ausencia-excesiva) no tiene vista por textura:
   se salta con su motivo, que en producción es la capa apagada.

   Uso:  node scripts/harness_vistas_np.js
         node scripts/harness_vistas_np.js --etiqueta antes
         node scripts/harness_vistas_np.js --etiqueta despues --fuente textura
         node scripts/harness_vistas_np.js --fuente textura --dir simulador_ocular/dso
         node scripts/harness_vistas_np.js --solo "NGC 5194" */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'dso-texturas-datos.js'));
var R = global.window.BitacoraGaiaRender, PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);
var png = require('./lib_png.js');

var arg = {};
process.argv.slice(2).forEach(function (a, i, v) { if (a.slice(0, 2) === '--') arg[a.slice(2)] = v[i + 1]; });

var CAT = window.BitacoraPS1.ps1CatalogoDifuso(global.window.BITACORA_GALAXIAS, global.window.BITACORA_NEBULOSAS);
var OUT = path.join(RAIZ, '.scratch', 'vistas-np' + (arg.etiqueta ? '-' + arg.etiqueta : ''));
fs.mkdirSync(OUT, { recursive: true });
var GAIA = path.join(__dirname, 'fixtures', 'gaia');
/* Gaia de los objetos que solo se miran (no son golden): fuera del repo, como
   los FITS. Pinearlos en git costaría ~12 MB y solo el golden necesita entrada
   estable bit a bit (decisión 9.1, ADR 0024). */
var GAIA_CACHE = process.env.BITACORA_GAIA_DIR ||
  path.join(require('os').tmpdir(), 'bitacora-gaia-vistas');
var SIZE = 720, AFOV = 70;
var TEXTURA = arg.fuente === 'textura';
/* Dónde vive la textura: lo publicado y, para los de solo-mirar, el `--dir` de
   la corrida. Quién manda sigue siendo el manifiesto (ver fuenteDe); esto es
   solo el disco donde se busca el fichero, igual que en
   harness_l1_equivalencia.js. */
var DIRS = [path.resolve(RAIZ, arg.dir || path.join('simulador_ocular', 'dso')),
            path.join(__dirname, 'fixtures', 'dso')];

/* `fetch` de mentira que sirve ficheros: así el camino de la textura es el del
   NAVEGADOR (ps1LeerTextura), no una relectura del PNG escrita aquí. */
if (TEXTURA) {
  var BASE = 'https://textura-local/dso/';
  window.BitacoraPS1.texturasUrl = BASE;
  require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
  global.fetch = function (url) {
    url = String(url);
    if (url.indexOf(BASE) !== 0) return Promise.resolve({ ok: false, status: 599 });
    var n = url.slice(BASE.length), ruta = null;
    DIRS.forEach(function (d) { if (!ruta && fs.existsSync(path.join(d, n))) ruta = path.join(d, n); });
    if (!ruta) return Promise.resolve({ ok: false, status: 404 });
    var b = fs.readFileSync(ruta);
    return Promise.resolve({
      ok: true, status: 200,
      arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
      json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
    });
  };
}

/* El sidecar del objeto en disco. Solo se mira cuando el MANIFIESTO no conoce al
   objeto: los de solo-mirar no están publicados y su textura vive en el `--dir`.
   Dentro de un directorio manda la misma precedencia que el generador escribe en
   `rangoSidecar`: una `fila` de `ausencia-excesiva` gana a un `<id>.<v>.json` en
   disco, porque si mandara la textura un parche viejo resucitaría la imagen que
   el veredicto acaba de rechazar. Dos versiones del mismo objeto en el mismo
   directorio no se desempatan a ojo: se tira, que elegir por orden alfabético
   del hash es pintar una textura vieja y llamarla «después». */
function sidecarDe(nombre) {
  var id = window.BitacoraPS1.ps1IdTextura(nombre);
  for (var i = 0; i < DIRS.length; i++) {
    if (!fs.existsSync(DIRS[i])) continue;
    var hay = fs.readdirSync(DIRS[i]).filter(function (n) {
      return n.indexOf(id + '.') === 0 && /\.json$/.test(n);
    });
    var leer = function (n) { return JSON.parse(fs.readFileSync(path.join(DIRS[i], n), 'utf8')); };
    var filas = hay.filter(function (n) { return /\.fila\.json$/.test(n); });
    for (var j = 0; j < filas.length; j++) {
      var sc = leer(filas[j]);
      if (sc.motivo === 'ausencia-excesiva') return sc;
    }
    var vers = hay.filter(function (n) { return !/\.fila\.json$/.test(n); });
    if (vers.length > 1) throw new Error(id + ': ' + vers.length + ' versiones en ' + DIRS[i] + ', no se elige por hash');
    if (vers.length) return leer(vers[0]);
    if (filas.length) return leer(filas[0]);
  }
  return null;
}

function fila(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; throw new Error('sin fila: ' + n); }
function rutaGaia(f) {
  var a = path.join(GAIA, f);
  if (fs.existsSync(a)) return a;
  var b = path.join(GAIA_CACHE, f);
  return fs.existsSync(b) ? b : null;
}
function leerGaia(f) {
  return fs.readFileSync(rutaGaia(f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}

var VISTAS = [
  // control: las galaxias del golden, una config de referencia
  { obj: 'NGC 5194', csv: 'gaia_ngc5194.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC 5457', csv: 'gaia_ngc5457.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC 4594', csv: 'gaia_ngc4594.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC 3031', csv: 'gaia_ngc3031.csv', D: 457.2, M: 190, sqm: 21.2 },
  // M57: tamaño angular con el aumento, apertura, y rampa contra el fondo
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 100, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 300, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 203.0, M: 190, sqm: 21.2 },
  { obj: 'NGC6720', csv: 'gaia_ngc6720.csv', D: 457.2, M: 190, sqm: 18.5 },
  // emisión/reflexión (rama nebulosas-emision-reflexion)
  { obj: 'NGC2068', csv: 'gaia_ngc2068.csv', D: 457.2, M: 100, sqm: 21.2 },
  { obj: 'NGC2068', csv: 'gaia_ngc2068.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC7635', csv: 'gaia_ngc7635.csv', D: 457.2, M: 190, sqm: 21.2 },
  { obj: 'NGC6888', csv: 'gaia_ngc6888.csv', D: 457.2, M: 100, sqm: 21.2 },
  // resto de supernova
  { obj: 'NGC1952', csv: 'gaia_ngc1952.csv', D: 457.2, M: 190, sqm: 21.2 },

  /* Modos de fallo del catálogo de texturas que las vistas de arriba no cubren
     (notas/validacion-visual-difusas.md). Su Gaia no va en git: se genera con
     `gen_fixtures_gaia.js --vistas` a la caché, y sin ella la vista se salta con
     aviso en vez de tumbar la corrida. */
  { obj: 'NGC7008',  csv: 'gaia_ngc7008.csv',  D: 457.2, M: 190, sqm: 21.2 },   // mordida 43,6 %
  { obj: 'Abell 12', csv: 'gaia_abell12.csv',  D: 457.2, M: 190, sqm: 21.2 },   // mordida 79,8 %
  { obj: 'NGC 4486', csv: 'gaia_ngc4486.csv',  D: 457.2, M: 190, sqm: 21.2 },   // núcleo saturado
  { obj: 'NGC 4826', csv: 'gaia_ngc4826.csv',  D: 457.2, M: 190, sqm: 21.2 },   // banda de polvo
  { obj: 'NGC 253',  csv: 'gaia_ngc253.csv',   D: 457.2, M: 190, sqm: 21.2 },   // borde de cobertura
  { obj: 'NGC1982',  csv: 'gaia_ngc1982.csv',  D: 457.2, M: 190, sqm: 21.2 },   // 77,8 % de ausencia en escena
  { obj: 'NGC 3310', csv: 'gaia_ngc3310.csv',  D: 457.2, M: 190, sqm: 21.2 },   // lado mínimo, 1,57′
  { obj: 'NGC 205',  csv: 'gaia_ngc205.csv',   D: 457.2, M: 190, sqm: 21.2 },   // lado en el tope, 20′
  { obj: 'NGC7008',  csv: 'gaia_ngc7008.csv',  D: 203.0, M: 100, sqm: 20.5 },
  { obj: 'NGC 4486', csv: 'gaia_ngc4486.csv',  D: 203.0, M: 100, sqm: 20.5 },
  { obj: 'NGC1982',  csv: 'gaia_ngc1982.csv',  D: 203.0, M: 100, sqm: 20.5 },
  { obj: 'NGC 205',  csv: 'gaia_ngc205.csv',   D: 203.0, M: 100, sqm: 20.5 }
];

/* El parche crudo del objeto: el FITS del stack (antes) o la textura publicada
   (después). Cuando no hay imagen que leer devuelve null y deja el motivo en
   `notas`, que es lo que se escribe en el resumen: en producción es la capa
   apagada para ese objeto, no un fallo de la corrida. */
function fuenteDe(gal, notas) {
  if (!TEXTURA) return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida);
  /* Quién decide: el MANIFIESTO, como en producción (ps1FuenteParche). Solo
     cuando no tiene fila del objeto —los de solo-mirar, que no se publican— se
     mira el sidecar del disco. Al revés, el arnés informaría de una capa que
     producción no pinta. */
  var fila = window.BitacoraPS1.ps1FilaTextura(gal.nombre), version;
  if (fila && fila[1] === 'imagen') {
    version = fila[2];
  } else if (fila) {
    notas.motivo = fila[6] || 'fila';
    return Promise.resolve(null);
  } else {
    var sc = sidecarDe(gal.nombre);
    if (!sc) { notas.motivo = 'sin-textura'; return Promise.resolve(null); }
    if (sc.modelo === 'fila' || !sc.version) {
      notas.motivo = sc.motivo || 'fila';
      return Promise.resolve(null);
    }
    version = sc.version;
  }
  var base = window.BitacoraPS1.texturasUrl + window.BitacoraPS1.ps1IdTextura(gal.nombre) + '.' + version;
  return window.BitacoraPS1.ps1LeerTextura(base + '.png', base + '.json', notas).then(function (T) {
    if (!T) return null;
    return { ancho: T.ancho, alto: T.alto, escalaAs: T.escalaAs, wcs: T.wcs || null, datos: T.datos };
  });
}

function nombreVista(v) {
  return v.obj.replace(/\s+/g, '') + '_D' + Math.round(v.D) + '_M' + v.M + '_sqm' + v.sqm;
}

var parches = {};   // un montaje por objeto, como producción
function parcheDe(v, notas) {
  if (parches[v.obj]) return Promise.resolve(parches[v.obj]);
  var gal = P.galDeFila(fila(v.obj));
  return fuenteDe(gal, notas).then(function (F) {
    if (!F) return null;
    parches[v.obj] = { gal: gal, parche: P.montar(F, gal, leerGaia(v.csv), CAT) };
    return parches[v.obj];
  });
}

function vista(v) {
  var notas = {};
  return parcheDe(v, notas).then(function (m) {
    if (!m) {
      sinImagen.push(nombreVista(v) + ' (' + (notas.motivo || 'sin imagen') + ')');
      return;
    }
    var gal = m.gal, parche = m.parche;
    var cielo = { pupilaSalida: v.D / v.M, pupilaOjo: 7, sqm: v.sqm,
                  aumentos: v.M, realceMax: PS1.realceMax, perceptual: true };
    var o = { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / v.M * 60,
              size: SIZE, cielo: cielo, apertura: v.D };
    var difuso = new Float32Array(SIZE * SIZE);
    window.BitacoraPS1.ps1PintarParche(difuso, parche, o);
    var c = R.ctxFotometrico(cielo, parche.thetaIntArcmin);
    var rgb = new Uint8Array(SIZE * SIZE * 3);
    var enc = 0, negros = 0, maxN = 0;
    for (var i = 0; i < difuso.length; i++) {
      var F = difuso[i], n = c.nivelFondo;
      if (F > 0) { n += R.valorDeFlujo(F, c.Fcielo, c.rango); enc++; }
      if (F < 0 || F !== F) negros++;                 // no debe ocurrir
      var g = Math.max(0, Math.min(255, Math.round(n)));
      if (g > maxN) maxN = g;
      rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = g;
    }
    var nombre = nombreVista(v);
    pintadas++;
    png.escribir(path.join(OUT, nombre + '.png'), rgb, SIZE, SIZE);
    console.log(nombre + '.png  θint ' + parche.thetaIntArcmin.toFixed(2) + '′ · campo ' +
      o.arcmin.toFixed(1) + '′ · fondo nivel ' + Math.round(c.nivelFondo) + ' · px con objeto ' +
      enc + ' · nivel máx ' + maxN + (negros ? ' · ¡' + negros + ' px inválidos!' : ''));
  });
}

var cola = Promise.resolve(), saltadas = [], sinImagen = [], pintadas = 0;
VISTAS.filter(function (v) { return !arg.solo || v.obj === arg.solo; }).forEach(function (v) {
  cola = cola.then(function () {
    /* Sin Gaia no hay máscara de estrellas, así que la vista no sería la de
       producción: se salta con su nombre en vez de pintar algo distinto. */
    if (!rutaGaia(v.csv)) {
      if (saltadas.indexOf(v.csv) < 0) saltadas.push(v.csv);
      return;
    }
    return vista(v);
  });
});
cola.then(function () {
  console.log('→ ' + path.relative(RAIZ, OUT) + '  (fuente: ' + (TEXTURA ? 'textura' : 'FITS') + ')');
  /* Una corrida que no pinta NADA no es una corrida buena: sin este aviso, un
     `--dir` equivocado sale con código 0 y con las 26 vistas en la lista de
     saltadas, indistinguible de una validación pasada (ADR 0005). */
  if (!pintadas) {
    console.error('\nNi una sola vista pintada: revisa --dir, --fuente o los CSV de Gaia.');
    process.exit(1);
  }
  if (sinImagen.length) {
    console.log('\nSin imagen (' + sinImagen.length + '), con su motivo: ' + sinImagen.join(', '));
  }
  if (saltadas.length) {
    console.log('\nSin Gaia (' + saltadas.length + '), vistas saltadas: ' + saltadas.join(' '));
    console.log('  banco golden (van a fixtures/gaia, versionados):');
    console.log('    node scripts/gen_fixtures_gaia.js');
    console.log('  solo-mirar (van a la caché, sin versionar):');
    console.log('    node scripts/gen_fixtures_gaia.js --vistas');
    console.log('    destino: ' + GAIA_CACHE + '  ($BITACORA_GAIA_DIR para cambiarlo)');
  }
}).catch(function (e) { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
