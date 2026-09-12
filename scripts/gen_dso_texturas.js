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

   Dos parches por objeto (#285, ADR 0028): el suyo y su CAMPO VECINO, apuntado
   fuera del objeto, que es de donde salen el cielo y la σ que van al sidecar —el
   marco del 6 % del parche cae dentro del objeto en la mitad del banco—. Los dos
   vienen de lib_bajar_parche.js, con su caché en $PS1_HARNESS_DIR: si
   el objeto ya está bajado, esto no toca la red. Un objeto sin cobertura de PS1
   no se reintenta para siempre: deja su fila de manifiesto (`sin-cobertura`) y
   la siguiente ejecución lo salta. Lo mismo el que sí tiene parche pero no tiene
   imagen donde está el objeto (`ausencia-excesiva`), que es un veredicto
   POSTERIOR a la descarga porque sin los píxeles no se puede saber. Sin pausas
   ni espera creciente: la fase 0 midió 147 descargas seguidas sin un solo
   estrangulamiento y basta con un reintento simple
   (docs/validacion/dso_texturas_fase0.md §D).

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

/* Si el objeto no tiene imagen DONDE ESTÁ EL OBJETO, no hay imagen (#229).

   Es un criterio, no un umbral: se exige que NINGÚN píxel dentro de la
   extensión del objeto esté medido, así que no hay ninguna raya que poner entre
   el caso que cae y el que no. La extensión es la del propio objeto —el borde
   REAL si su clase lo tiene (`ps1RadioBordeAs`) y si no r_e—, no el parche ni la
   escena: la escena mete a los vecinos y el parche, cielo.

   NGC 1982 (M43) es el caso que lo destapa: el núcleo de Orión es demasiado
   brillante para el stack 3π y PS1 no tiene datos ahí; da 100 % y no se arregla
   regenerando. NGC 253, el segundo peor del banco, tiene su interior medido y
   sigue siendo `imagen`. */
/* Los tres radios del objeto —el suyo, el de la escena μ25 y el de catálogo—
   viven en `lib_radio_objeto.js` desde #285: los comparte con el arnés que los
   midió (#274), y tenerlos dos veces sería la deriva del ADR 0008. */
var RAD = require('./lib_radio_objeto.js')(PS1);
var radioObjetoAs = RAD.radioObjetoAs;

/* La extensión, con la MISMA forma que un componente de escena: así la
   pertenencia la decide `ps1FuenteEnEscena` —la elipse de producción, con `ba` y
   `pa`— y aquí no se escribe ninguna geometría (ADR 0008). Lo único que cambia
   respecto de `ps1EscenaEnParche` es el radio: el del objeto, no la isofota μ25,
   que en una galaxia llega mucho más lejos que el objeto que #229 juzga. */
function extensionDelObjeto(gal, afin) {
  var paR = (gal.pa || 0) * Math.PI / 180;
  return [{ cx: afin.cx, cy: afin.cy, cos: Math.cos(paR), sin: Math.sin(paR),
            ba: (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1, r25As: radioObjetoAs(gal) }];
}

/* Fracción de píxeles ausentes dentro de esa extensión. La afín es la del parche
   (`ps1AfinParche`), la misma que usa la escena: el centro y la rotación son los
   del WCS, no el supuesto de norte arriba. */
function ausenciaEnObjeto(datos, ancho, alto, afin, ext) {
  var n = 0, aus = 0, x, y;
  /* Sin radio no hay región que mirar, y `ps1FuenteEnEscena` con r = 0 diría que
     sí al píxel del centro exacto: un objeto sin extensión en el catálogo no lo
     juzga esta regla. */
  if (!(ext && ext.length && ext[0].r25As > 0)) return { n: 0, ausentes: 0, frac: 0 };
  for (y = 0; y < alto; y++) {
    for (x = 0; x < ancho; x++) {
      if (!PS1.ps1FuenteEnEscena(ext, afin, x, y)) continue;
      n++;
      var v = datos[y * ancho + x];
      if (v !== v) aus++;
    }
  }
  return { n: n, ausentes: aus, frac: n ? aus / n : 0 };
}

/* El veredicto. `n === 0` no es ausencia excesiva: es que el objeto no tiene
   extensión medible en el catálogo, y eso no lo decide esta regla. */
function ausenciaExcesiva(a) { return a.n > 0 && a.ausentes === a.n; }

/* ── La firma de una celda perdida (#259) ─────────────────────────────────
   La ausencia normal es la máscara de estrellas: cientos de manchas pequeñas
   repartidas por el parche. La de una skycell que no llegó es UN bloque
   rectangular, grande, que rellena su caja envolvente casi entera. Eso es lo
   que se mide aquí: la mayor componente conexa de ausencia (4-vecinos), su
   fracción del parche y cuánto de su caja envolvente ocupa.

   Los cortes salen del barrido de las 72 texturas del banco del 2026-09-09:
   NGC 4486 (33,8 % en un bloque, 100 % de su caja) contra NGC 253 (8,0 % en 339
   componentes, 22 % de caja). No es un veredicto —Abell 12 lo dispara con la
   máscara de μ Ori, que es ausencia legítima— sino la señal de que hay que
   mirar: quien decide si se publica es la cuenta de celdas. */
var BLOQUE_FRAC = 0.03, BLOQUE_RELLENO = 0.35;

function bloqueDeAusencia(ausente, ancho, alto) {
  var n = ancho * alto, visto = new Uint8Array(n), pila = new Int32Array(n);
  var componentes = 0, mayor = 0, caja = null;
  for (var s = 0; s < n; s++) {
    if (!ausente[s] || visto[s]) continue;
    componentes++;
    var top = 0, px = 0, x0 = ancho, x1 = -1, y0 = alto, y1 = -1;
    pila[top++] = s; visto[s] = 1;
    while (top) {
      var i = pila[--top], x = i % ancho, y = (i - x) / ancho;
      px++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && ausente[i - 1] && !visto[i - 1]) { visto[i - 1] = 1; pila[top++] = i - 1; }
      if (x < ancho - 1 && ausente[i + 1] && !visto[i + 1]) { visto[i + 1] = 1; pila[top++] = i + 1; }
      if (y > 0 && ausente[i - ancho] && !visto[i - ancho]) { visto[i - ancho] = 1; pila[top++] = i - ancho; }
      if (y < alto - 1 && ausente[i + ancho] && !visto[i + ancho]) { visto[i + ancho] = 1; pila[top++] = i + ancho; }
    }
    if (px > mayor) { mayor = px; caja = [x0, y0, x1, y1]; }
  }
  var areaCaja = caja ? (caja[2] - caja[0] + 1) * (caja[3] - caja[1] + 1) : 0;
  return { componentes: componentes, mayorPx: mayor, mayorFrac: n ? mayor / n : 0,
           rellenoCaja: areaCaja ? mayor / areaCaja : 0, caja: caja };
}

/* Al mosaico le falta una celda: lo que hay es un trozo de cielo sin medir con
   forma de bloque. Vale para el parche del objeto (#259) y para su campo vecino
   (#285): ninguno de los dos se publica así. `undefined` es un parche servido
   por una caché anterior a #259 —no se sabe— y eso no es una celda perdida. */
function celdaPerdida(p) {
  return p.celdasPedidas > 0 && p.celdasCosidas < p.celdasPedidas;
}

/* Las celdas tal cual van al sidecar. `null` es un parche servido por una caché
   anterior a #259 —no se sabe—, que no es lo mismo que cero. */
function celdasDe(p) {
  return { pedidas: p.celdasPedidas === undefined ? null : p.celdasPedidas,
           cosidas: p.celdasCosidas === undefined ? null : p.celdasCosidas };
}

function bloqueSospechoso(b) {
  return b.mayorFrac > BLOQUE_FRAC && b.rellenoCaja > BLOQUE_RELLENO;
}

function arg(n, pordefecto) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
}

/* Hash de LO QUE DETERMINA LOS PÍXELES, y de nada más: ni la fecha ni el
   directorio de salida entran. Mismo stack y mismos parámetros, mismo nombre de
   fichero, y por eso la URL puede ser inmutable.

   De los PARÁMETROS, no de los píxeles, y es a propósito: el nombre tiene que
   conocerse ANTES de bajar nada, que es lo que hace `yaResuelto` reanudable sin
   llevar estado aparte. El precio es que dos contenidos distintos del mismo
   objeto comparten nombre de fichero, así que REPUBLICAR UNA TEXTURA CORREGIDA
   EXIGE CAMBIARLE EL NOMBRE A MANO —subir `GENERADOR`, que renombra el banco
   entero—; sobrescribir el fichero conservando el nombre no vale.

   La decisión, con lo que se midió y lo que se exige a cambio, en el ADR 0026
   (docs/adr/0026-el-nombre-de-una-textura-sale-de-sus-parametros.md). De ella
   depende la cabecera inmutable de #209. */
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
function escribirFila(dir, nombre, motivo, ra, dec, auditoria) {
  fs.mkdirSync(dir, { recursive: true });
  var s = { nombre: nombre, modelo: 'fila', motivo: motivo,
            generador: GENERADOR, ra: ra, dec: dec };
  /* `ausencia-excesiva` es el único motivo que se mide sobre píxeles: su
     auditoría va al sidecar para que el veredicto se pueda revisar sin volver a
     bajar el parche. Los demás motivos no la tienen y no la escriben. */
  if (auditoria) s.auditoria = auditoria;
  fs.writeFileSync(path.join(dir, PS1.ps1IdTextura(nombre) + '.fila.json'),
    JSON.stringify(s, null, 1) + '\n');
}

/* LA regla de reanudación, en un solo sitio: un objeto está resuelto si tiene su
   textura completa (PNG **y** sidecar: media textura no vale) o su veredicto de
   ausencia. Se mira en el directorio de salida y en las fixtures, que es donde
   viven las texturas del banco golden. La usan `generar` y el recorrido en seco,
   que si no acabarían discrepando. */
function yaResuelto(dir, id, v) {
  var dirs = dir === FIXTURES ? [dir] : [dir, FIXTURES];
  for (var i = 0; i < dirs.length; i++) {
    var fila = path.join(dirs[i], id + '.fila.json');
    /* `celda-perdida` es la excepción: es una avería de red, no un veredicto
       sobre el cielo, así que no resuelve nada y la corrida siguiente lo vuelve
       a pedir (#259). Los demás motivos sí cierran el objeto. */
    if (fs.existsSync(fila) &&
        JSON.parse(fs.readFileSync(fila, 'utf8')).motivo !== 'celda-perdida') {
      return { dir: dirs[i], estado: 'fila' };
    }
    var sc = path.join(dirs[i], id + '.' + v + '.json');
    if (fs.existsSync(path.join(dirs[i], id + '.' + v + '.png')) && fs.existsSync(sc)) {
      /* Misma puerta que arriba, ahora del lado del CAMPO VECINO (#285): si su
         cielo se quedó sin medir por una avería de red, la textura está bien
         pero el sidecar está incompleto, y esa es la única corrida que lo puede
         arreglar —el nombre de fichero no cambia—. Lo que NO se reintenta es lo
         que el cielo decide: sin cobertura y otra escala saldrían igual. */
      var motivo = (JSON.parse(fs.readFileSync(sc, 'utf8')).vecino || {}).motivo;
      if (motivo === 'celda-perdida' || motivo === 'descarga-fallida') continue;
      return { dir: dirs[i], estado: 'ya' };
    }
  }
  return null;
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
   veredicto de ausencia caducó en cuanto hubo píxeles.

   Con una excepción, y es la de #229: `ausencia-excesiva` se dicta MIRANDO esa
   misma textura, así que ahí no hay nada que caducar. Si mandara la textura, un
   parche viejo en disco resucitaría la imagen que el veredicto acaba de
   rechazar. Prioridad: veredicto medido > textura > el resto de veredictos, y a
   igualdad manda el directorio de salida, que es el recién escrito. Revisar el
   veredicto es borrar su `.fila.json`, igual que con `sin-cobertura`: la
   siguiente ejecución lo vuelve a pedir y lo vuelve a juzgar. */
function rangoSidecar(s) {
  if (s.modelo !== 'fila') return 1;
  return s.motivo === 'ausencia-excesiva' ? 2 : 0;
}

function sidecarsUnicos(dir) {
  var porNombre = {};
  sidecars(FIXTURES).concat(dir === FIXTURES ? [] : sidecars(dir))
    .forEach(function (s) {
      var v = porNombre[s.nombre];
      if (!v || rangoSidecar(s) >= rangoSidecar(v)) porNombre[s.nombre] = s;
    });
  return Object.keys(porNombre).map(function (n) { return porNombre[n]; });
}

/* El texto, sin tocar el disco: es lo que compara el test. Escribir para volver
   a leer y restaurar era inocuo con seis filas; con setenta y cuatro, un test
   interrumpido deja el manifiesto bueno hecho un muñón (#258). */
function textoManifiesto(dir) {
  var filas = sidecarsUnicos(dir)
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
  return { filas: filas.length, texto:
    '/* Texturas DSO — GENERADO, no editar a mano.\n' +
    '   Regenerar: node scripts/gen_dso_texturas.js --banco (o --solo "<nombre>")\n' +
    '   Campos: [nombre, modelo, version, ancho, escalaAs, fracAusencia, motivo]\n' +
    '   modelo ∈ {imagen, fila}; motivo ∈ {"", sur, no-cabe, sin-cobertura,\n' +
    '   pisada, ausencia-excesiva, celda-perdida}. Una fila que no está aquí se\n' +
    '   pide al proxy mientras BitacoraPS1.cfg.proxyRespaldo siga encendido. */\n' +
    'window.BITACORA_DSO_TEXTURAS = [\n' + cuerpo + '\n];\n' };
}

function escribirManifiesto(dir) {
  var m = textoManifiesto(dir);
  fs.writeFileSync(MANIFIESTO, m.texto);
  return m.filas;
}

/* ── El campo vecino (#285, ADR 0028) ─────────────────────────────────────
   El cielo y la σ de un parche no salen de su marco: en 35 de las 68 texturas
   del banco ese marco cae DENTRO del objeto y el suelo sube con el objeto
   mismo. Salen de un segundo recorte apuntado fuera, con el mismo lado y la
   misma resolución —σ es por píxel—, que es lo que decidió el ADR 0028.

   Por eso cada objeto cuesta DOS parches, y la caché del proxy sirve los dos
   igual (misma `bajar`, misma clave de campo). La cuenta va al informe para que
   el coste de una tirada se vea antes de lanzarla.

   Aquí no se decide ninguna ley: la geometría es `ps1CampoVecino` y el cielo,
   `ps1CieloCampo`; los radios, `lib_radio_objeto.js`. Lo único que se decide es
   CUÁNDO no vale: sin dirección en cobertura, con una celda del mosaico
   perdida —misma puerta que `celda-perdida` (ADR 0026, punto 2, #259): un
   mosaico mutilado no es cielo— o con la descarga caída. Los tres motivos van
   al sidecar por separado porque se arreglan de forma distinta; qué hace el
   runtime con ellos es #287.

   Nunca tira: un campo vecino que falla marca el sidecar, no tumba la textura,
   que es buena y ya está medida. */
var PARCHES_POR_OBJETO = 2;

function auditarCampoVecino(f, gal, fits, salida) {
  var v = PS1.ps1CampoVecino(gal, RAD.rObjMaxAs(fits, f, gal),
    PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS));
  if (!v) return Promise.resolve({ motivo: 'sin-cobertura' });
  var out = { ra: v.ra, dec: v.dec, direccion: v.dir, offsetArcmin: v.offsetArcmin,
              ladoArcmin: v.ladoArcmin,
              /* `null` aquí es «no hay ninguna difusa catalogada», no «no se
                 midió»: la distancia se calcula siempre, y sale infinita solo
                 con el catálogo vacío. */
              difusaMasCercaArcmin: isFinite(v.cerca) ? v.cerca : null };
  return bajar(v.ra, v.dec, v.ladoArcmin, salida).then(function (q) {
    out.escalaAs = q.escalaAs;
    out.celdas = celdasDe(q);
    if (celdaPerdida(q)) {
      out.motivo = 'celda-perdida';
      return out;
    }
    /* El recorte entero sin un píxel medido es cielo que PS1 no cubre, no una
       descarga caída: se arreglan de forma distinta y el sidecar es lo único
       que va a leer quien lo audite. */
    var c = PS1.ps1CieloCampo(q.datos);
    if (!c.n) { out.motivo = 'sin-cobertura'; return out; }
    /* La σ es POR PÍXEL (ADR 0028, punto 2): si el vecino no viene al mismo
       ″/px que el parche, su σ no es comparable y no se publica. Sin esta
       comprobación la ley entera se cae en silencio. */
    if (Math.abs(q.escalaAs - fits.escalaAs) > 1e-3) {
      out.motivo = 'otra-escala';
      out.escalaParcheAs = fits.escalaAs;
      return out;
    }
    out.cielo = c.cielo; out.sigma = c.sigma; out.px = c.n;
    return out;
  }).catch(function (e) {
    out.motivo = 'descarga-fallida';
    out.error = (e && e.message) || String(e);
    return out;
  });
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
  var y = yaResuelto(dir, id, v);
  if (y) {
    console.log('ya estaba' + (y.estado === 'fila' ? ' (fila)' : '') + ': ' + id +
      ' en ' + path.relative(RAIZ, y.dir));
    return Promise.resolve(y.estado);
  }

  return bajar(gal.ra, gal.dec, gal.ladoArcmin, salida).then(function (p) {
    var esperada = gal.ladoArcmin * 60 / salida;
    if (Math.abs(p.escalaAs - esperada) > 1e-3) {
      throw new Error('la escala del recorte (' + p.escalaAs + '″/px) no es la pedida (' + esperada + ')');
    }

    /* Un mosaico al que le falta una skycell no se publica (#259). Las celdas ya
       se pidieron dos veces en `lib_bajar_parche.js`; si aún falta una, lo que
       hay es un trozo de cielo sin medir con forma de bloque, y una textura
       mutilada engaña más que la ausencia declarada. A diferencia de
       `ausencia-excesiva`, este veredicto NO es permanente: `yaResuelto` lo
       ignora y la siguiente ejecución lo vuelve a intentar, porque la causa es
       una avería de red y no una propiedad del cielo. */
    if (celdaPerdida(p)) {
      escribirFila(dir, gal.nombre, 'celda-perdida', gal.ra, gal.dec,
        { celdasPedidas: p.celdasPedidas, celdasCosidas: p.celdasCosidas });
      console.log(gal.nombre + ' → fila (celda-perdida): solo ' + p.celdasCosidas +
        ' de ' + p.celdasPedidas + ' celdas entraron en la costura; se reintenta en la próxima corrida');
      return 'fila';
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
    var ausente = new Uint8Array(p.datos.length);
    for (y = 0; y < p.alto; y++) {
      for (x = 0; x < p.ancho; x++) {
        i = y * p.ancho + x;
        var dentro = PS1.ps1FuenteEnEscena(escena, fits.afin, x, y);
        if (dentro) nEsc++;
        if (p.datos[i] === p.datos[i]) continue;
        ausente[i] = 1;
        nAus++;
        if (dentro) nAusEsc++;
      }
    }
    var bloque = bloqueDeAusencia(ausente, p.ancho, p.alto);

    /* El veredicto de ausencia, con la textura YA DESCARGADA: la ausencia no se
       puede saber sin la imagen, así que esto no es un filtro previo como `sur`
       o `no-cabe`. Si el objeto entero está en el agujero, no se escribe PNG:
       lo que hay no es una imagen del objeto y el runtime está mejor con el
       modelo Sérsic de la fila (ADR 0013). */
    var rObj = radioObjetoAs(gal);
    var enObjeto = ausenciaEnObjeto(p.datos, p.ancho, p.alto, fits.afin,
                                    extensionDelObjeto(gal, fits.afin));
    if (ausenciaExcesiva(enObjeto)) {
      escribirFila(dir, gal.nombre, 'ausencia-excesiva', gal.ra, gal.dec, {
        cielo: cielo, sigma: sigma,
        fracAusencia: nAus / p.datos.length,
        fracAusenciaEscena: nEsc ? nAusEsc / nEsc : 0,
        fracAusenciaObjeto: enObjeto.frac,
        radioObjetoAs: rObj, pxObjeto: enObjeto.n
      });
      console.log(gal.nombre + ' → fila (ausencia-excesiva): ' + enObjeto.ausentes +
        ' de ' + enObjeto.n + ' px dentro de ' + rObj.toFixed(1) + '″ están ausentes');
      return 'fila';
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

    /* El campo vecino ANTES de escribir: cielo y σ son parte del sidecar, y un
       sidecar se sirve como inmutable (ADR 0026, punto 3), así que no se puede
       completar después. */
    return auditarCampoVecino(f, gal, fits, salida).then(function (vecino) {
      fs.mkdirSync(dir, { recursive: true });
      /* Si venía de un `celda-perdida` de una corrida anterior, ese veredicto ya
         no vale: la textura está escrita y su fila sobra. */
      fs.rmSync(path.join(dir, id + '.fila.json'), { force: true });
      LIBPNG.escribirGris16(base + '.png', cod.u16, p.ancho, p.alto);
      /* El peso del PNG, leído del fichero recién escrito. Va al sidecar porque el
         PNG no entra en git y el informe tiene que poder sumar el volumen del
         banco sin tenerlos delante (#258). No entra en el hash de versión: no
         determina píxeles. */
      var bytesPng = fs.statSync(base + '.png').size;
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
        /* Cuántas celdas se pidieron y cuántas entraron en la costura: sin esto,
           un mosaico mutilado no se puede auditar sin volver a la red (#259). Un
           parche servido por una caché anterior a #259 no las trae, y `null` dice
           exactamente eso —no se sabe—, que no es lo mismo que cero. */
        celdas: celdasDe(p),
        /* De dónde salen el cielo y la σ de verdad (ADR 0028): dirección,
           desplazamiento, ″/px y la distancia a la difusa más cercana, que es lo
           que dice si ese recorte es cielo o tiene otro objeto dentro. Sin
           `cielo`, lleva `motivo` y el objeto queda marcado. */
        vecino: vecino,
        auditoria: {
          cielo: cielo, sigma: sigma,
          fracAusencia: nAus / p.datos.length,
          fracAusenciaEscena: nEsc ? nAusEsc / nEsc : 0,
          bloqueMayorFrac: bloque.mayorFrac, bloqueRellenoCaja: bloque.rellenoCaja,
          bloqueComponentes: bloque.componentes,
          bytes: bytesPng,
          errCuantMaxSigma: errSigma, errCuantMaxRel: errRel
        }
        /* `fuentesConservadas` y `procedencia` los dibuja el §4.1 del objetivo,
           pero son de las fases 3 y 4: escribirlos vacíos hoy no dice nada y el
           hash de versión no los cubre. Nacen cuando haya algo que poner. */
      };
      fs.writeFileSync(base + '.json', JSON.stringify(sidecar, null, 1) + '\n');

      var kb = Math.round(bytesPng / 1024);
      console.log(gal.nombre + ' → ' + path.basename(base) + '.png  ' +
        p.ancho + '×' + p.alto + '  ' + p.escalaAs.toFixed(4) + '″/px  ' + kb + ' kB');
      console.log('  cielo ' + cielo.toFixed(4) + '  σ ' + sigma.toFixed(4) +
        '  ausencia ' + (100 * sidecar.auditoria.fracAusencia).toFixed(2) + ' %' +
        ' (en escena ' + (100 * sidecar.auditoria.fracAusenciaEscena).toFixed(2) + ' %)');
      console.log('  error de cuantización: ' + errSigma.toExponential(2) + ' σ cerca del cielo, ' +
        errRel.toExponential(2) + ' relativo por encima de 5σ');
      if (bloqueSospechoso(bloque)) {
        console.log('  AVISO · la ausencia tiene forma de bloque: ' +
          (100 * bloque.mayorFrac).toFixed(1) + ' % del parche en una sola componente que llena el ' +
          (100 * bloque.rellenoCaja).toFixed(0) + ' % de su caja. Mirar antes de darla por buena (#259)');
      }
      if (vecino.motivo) {
        console.log('  AVISO · sin cielo medido fuera del objeto (' + vecino.motivo +
          '): el runtime cae a la ley del marco y el objeto queda marcado (#287)');
      } else {
        console.log('  campo vecino: ' + vecino.direccion + ' a ' +
          vecino.offsetArcmin.toFixed(1) + '′, difusa más cerca a ' +
          (vecino.difusaMasCercaArcmin === Infinity ? '∞' : vecino.difusaMasCercaArcmin.toFixed(1)) +
          '′ · cielo ' + vecino.cielo.toFixed(4) + '  σ ' + vecino.sigma.toFixed(4) +
          '  ' + vecino.escalaAs.toFixed(4) + '″/px');
      }
      return 'nuevo';
    });
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
  var estado = { seco: !!seco, nuevos: 0, ya: 0, filas: 0, pendientes: 0, fallos: [] };

  return b.objetos.reduce(function (cadena, o, i) {
    return cadena.then(function () {
      console.log('\n[' + (i + 1) + '/' + b.objetos.length + '] ' + o.nombre + '  (' + o.motivo + ')');
      /* El banco lo devuelve con `gal` resuelto; si algún día no, es un aviso
         suyo y aquí una línea del informe, no una tirada tumbada. */
      if (!o.gal) {
        estado.fallos.push(o.nombre + ': el banco no lo resuelve a campo (gal = null)');
        console.log('  FALLO: el banco no lo resuelve a campo');
        return;
      }
      var id = PS1.ps1IdTextura(o.nombre), v = version(o.gal, PS1.cfg.salida);
      if (seco) {
        var y = yaResuelto(dir, id, v);
        console.log('  ' + (y ? 'ya está (' + y.estado + ')' : 'pediría') + '  ' + id + '.' + v +
          '  ' + o.gal.ladoArcmin.toFixed(2) + '′ → ' + PS1.cfg.salida + ' px');
        if (y) estado.ya++; else estado.pendientes++;
        return;
      }
      /* `generar` avisa de lo suyo tirando —también antes de la primera promesa,
         cuando el objeto ni siquiera admite textura—, así que la llamada va
         envuelta: un objeto que revienta no puede tumbar la tirada entera. */
      var intento = function () { return Promise.resolve().then(function () { return generar(o.nombre, dir); }); };
      return intento()
        /* Un reintento simple, y SOLO de lo que puede salir distinto la segunda
           vez: la descarga. Lo que ya es un veredicto —no cabe, no está en el
           catálogo, sin cobertura— da lo mismo repetido y duplicaría la petición
           a STScI. Sin pausas ni espera creciente: la fase 0 (§D) no midió
           estrangulamiento en 147 descargas seguidas. */
        .catch(function (e) {
          if (/sin cobertura|no admite textura|no está en el catálogo|no lo devuelve/.test(e.message)) throw e;
          console.log('  reintento: ' + e.message);
          return intento();
        })
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
   del peso que ellos declaran, igual que el manifiesto, y por eso una tirada a
   medias se ve como lo que es. Sin fecha dentro, para que regenerarlo sin haber
   generado nada no ensucie el árbol: la fecha la lleva el commit. */
function textoInforme(dir) {
  var todos = sidecarsUnicos(dir);
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

  /* Volumen: bytes del PNG, y bytes/px, que es la cifra con la que la fase 0
     corrigió el ×0,6 de la tabla 4.2 del objetivo.

     El peso lo declara el sidecar (`auditoria.bytes`) desde #258: los PNG del
     banco no entran en git, así que medirlos con `statSync` daba el volumen de
     los golden y solo de ellos —el corolario de la decisión 9.1 del ADR 0024—.
     El disco sigue valiendo de respaldo para un sidecar anterior a #258, y el
     que no tenga ninguna de las dos cosas SE CUENTA APARTE: el modo de fallo que
     hay que evitar es que una textura desaparezca del volumen sin avisar. */
  var bytes = 0, bpp = [], sinPeso = [];
  imagenes.forEach(function (s) {
    var n = (s.auditoria && s.auditoria.bytes) || 0;
    if (!n) {
      var f = [dir, FIXTURES].map(function (d) {
        return path.join(d, PS1.ps1IdTextura(s.nombre) + '.' + s.version + '.png');
      }).filter(function (p) { return fs.existsSync(p); })[0];
      if (f) n = fs.statSync(f).size;
    }
    if (!n) { sinPeso.push(s.nombre); return; }
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
  L.push('## Coste de la tirada');
  L.push('');
  L.push('Cada objeto cuesta **' + PARCHES_POR_OBJETO + ' parches**: el suyo y su campo vecino, que es de');
  L.push('donde salen el cielo y la σ (ADR 0028). La caché del proxy sirve los dos igual,');
  L.push('así que un objeto ya bajado no vuelve a la red.');
  L.push('');
  L.push('| medida | valor |');
  L.push('|---|---|');
  L.push('| parches por objeto | ' + PARCHES_POR_OBJETO + ' |');
  L.push('| objetos pendientes | ' + pendientes.length + ' |');
  L.push('| parches que costaría acabar | ' + PARCHES_POR_OBJETO * pendientes.length + ' |');
  L.push('');
  L.push('## Volumen');
  L.push('');
  L.push('| medida | valor |');
  L.push('|---|---|');
  L.push('| texturas escritas | ' + imagenes.length + ' |');
  L.push('| total de los PNG | ' + (bytes / 1048576).toFixed(1) + ' MB |');
  L.push('| bytes/px (mediana) | ' + mediana.toFixed(2) + ' |');
  /* La línea solo aparece cuando hay algo que decir, pero cuando lo hay no se
     puede pasar por alto: sin ella, una textura sin peso se iría del total en
     silencio (ADR 0024, corolario de la 9.1). */
  if (sinPeso.length) {
    L.push('| **sin peso declarado** | **' + sinPeso.length + '**: ' + sinPeso.join(', ') + ' |');
  }
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
  L.push('de darlos por buenos (objetivo §5, fase 0). Lo que ya tiene veredicto');
  L.push('—`ausencia-excesiva`— no se lista aquí: está en la cuenta por motivo.');
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
  /* La firma de celda perdida sobre lo ESCRITO, que es lo que se publica. Los
     sidecars anteriores a #259 no traen las tres cifras y no aparecen aquí: para
     esos está `scripts/harness_bloques_ausencia.js`, que las mide del PNG. */
  var bloques = imagenes.filter(function (s) {
    return s.auditoria && bloqueSospechoso({ mayorFrac: s.auditoria.bloqueMayorFrac || 0,
                                             rellenoCaja: s.auditoria.bloqueRellenoCaja || 0 });
  }).sort(function (a, c) { return c.auditoria.bloqueMayorFrac - a.auditoria.bloqueMayorFrac; });
  L.push('');
  L.push('## Bloques de ausencia');
  L.push('');
  L.push('Texturas cuya mayor componente conexa de ausencia pasa de ' + (100 * BLOQUE_FRAC).toFixed(0) +
         ' % del parche');
  L.push('llenando más del ' + (100 * BLOQUE_RELLENO).toFixed(0) + ' % de su caja envolvente: la firma de una ' +
         'skycell que no llegó');
  L.push('(#259). No es un veredicto —una estrella muy brillante deja una máscara que también');
  L.push('la dispara—, es la lista de lo que hay que mirar. Las texturas anteriores a #259');
  L.push('no traen la medida en su sidecar y no salen aquí: para esas está');
  L.push('`node scripts/harness_bloques_ausencia.js`, que la mide del PNG.');
  L.push('');
  if (!bloques.length) L.push('Ninguna.');
  else {
    L.push('| objeto | mayor bloque | relleno de su caja | componentes |');
    L.push('|---|---|---|---|');
    bloques.forEach(function (s) {
      L.push('| ' + s.nombre + ' | ' + (100 * s.auditoria.bloqueMayorFrac).toFixed(2) +
             ' % | ' + (100 * s.auditoria.bloqueRellenoCaja).toFixed(0) + ' % | ' +
             s.auditoria.bloqueComponentes + ' |');
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
  return { imagenes: imagenes.length, pendientes: pendientes.length,
           revision: revision.length, bytes: bytes, sinPeso: sinPeso.length,
           texto: L.join('\n') };
}

function escribirInforme(dir) {
  var inf = textoInforme(dir);
  fs.writeFileSync(INFORME, inf.texto);
  return inf;
}

/* Requerido como módulo (scripts/test_dso_texturas.js) no genera nada: expone
   lo que se puede probar sin red ni disco. */
module.exports = { version: version, filaDe: filaDe, motivoAusencia: motivoAusencia,
                   auditarCampoVecino: auditarCampoVecino, celdaPerdida: celdaPerdida,
                   PARCHES_POR_OBJETO: PARCHES_POR_OBJETO,
                   radioObjetoAs: radioObjetoAs, extensionDelObjeto: extensionDelObjeto,
                   ausenciaEnObjeto: ausenciaEnObjeto,
                   ausenciaExcesiva: ausenciaExcesiva,
                   bloqueDeAusencia: bloqueDeAusencia, bloqueSospechoso: bloqueSospechoso,
                   yaResuelto: yaResuelto, escribirFila: escribirFila,
                   BLOQUE_FRAC: BLOQUE_FRAC, BLOQUE_RELLENO: BLOQUE_RELLENO,
                   escribirManifiesto: escribirManifiesto, escribirInforme: escribirInforme,
                   textoManifiesto: textoManifiesto, textoInforme: textoInforme,
                   DSO: path.join(RAIZ, 'simulador_ocular', 'dso'),
                   filasControl: filasControl, generar: generar,
                   GENERADOR: GENERADOR, FIXTURES: FIXTURES, MANIFIESTO: MANIFIESTO,
                   INFORME: INFORME };
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
  /* En seco no se escribe NADA: el recorrido dice qué haría, y un manifiesto o
     un informe reescritos tras una tirada real parcial son justo lo que no debe
     pasar por mirar. */
  if (estado && estado.seco) {
    console.log('\nen seco: ' + estado.ya + ' ya está(n), ' + estado.pendientes +
      ' pendiente(s) · ' + PARCHES_POR_OBJETO * estado.pendientes + ' parches (' +
      PARCHES_POR_OBJETO + ' por objeto: el suyo y su campo vecino)' + (estado.fallos.length ? ', ' + estado.fallos.length + ' fallo(s)' : '') +
      '. Ni manifiesto ni informe tocados.');
    if (estado.fallos.length) { console.error('  ' + estado.fallos.join('\n  ')); process.exit(1); }
    return;
  }
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
