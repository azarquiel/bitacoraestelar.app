#!/usr/bin/env node
/* L1.1 del ADR 0024: ¿pinta lo mismo el parche que viene de la TEXTURA que el
   que viene del FITS? Los dos caminos, vivos en el mismo proceso, sobre el
   banco entero.

   Por qué un comparador y no el golden: el golden guarda hashes y agregados,
   no píxeles, así que `max|Δ| ≤ 0,05·σ` no puede salir de él (nota de
   recaptura, paso 4). Aquí se montan los dos parches del mismo objeto y se
   restan píxel a píxel.

   Lo que se mide, con los umbrales del ADR 0024 §Fase 1:

     · `max|Δ| ≤ 0,05·σ` en `parche.datos` tras ps1AnclarACatalogo;
     · `|ΣΔ|/Σ ≤ 1e-4` (el presupuesto de luz);
     · los NaN HEREDADOS del stack, idénticos: cero píxeles de diferencia;
     · los NaN nacidos de la REGLA DE AUSENCIA que difieran: no más de 1e-4
       del parche, con el VALOR movido ≤ 1 paso de cuantización y el CORTE
       movido ≤ 6,93 pasos (redacción del 2026-09-07 del ADR 0024). El 6,93 no
       sale de ninguna medida: si cada valor del borde se mueve como mucho un
       paso, la mediana se mueve como mucho uno y la MAD como mucho dos, así
       que `cielo − kσ` con `k = kAusencia` se mueve como mucho
       `1 + 2·1,4826·k` pasos. Es el techo de una codificación correcta;
     · los 5 controles de exclusión salen «fila» con su motivo y sin red.

   Ninguna ley se reimplementa (ADR 0008): el camino FITS es lib_bajar_parche +
   lib_parche_produccion (el del golden) y el camino textura es el
   `ps1LeerTextura` DEL NAVEGADOR con un `fetch` de mentira que sirve ficheros
   de disco, igual que test_fuente_parche.js. El corte de la regla de ausencia
   se recalcula con ps1Cielo/ps1SigmaCielo sobre el mismo `limpio` que ve
   ps1AnclarACatalogo, y el factor del anclaje sale de llamar a
   ps1AnclarACatalogo con `magV = 0`, que es su propia rama sin escalar.

   La σ del listón es la MISMA que usa el comparador de R1
   (`harness_r1_wcs.js`, «σ es la de la capa antes»): desviación típica de los
   finitos del `parche.datos` del camino FITS. No se elige aquí: es la escala
   contra la que el procedimiento de recaptura fija el 0,05·σ, y cambiarla
   ahora sería mover el listón.

   Se informa además de `max|Δ|` contra el RUIDO DEL CIELO en unidades ancladas
   (σ del cielo de `limpio` × factor del anclaje), que es la lectura estricta.
   No decide el veredicto —el precedente manda—, pero es el número que dice si
   la discrepancia vive en el cielo o en el núcleo, y por eso va en la tabla.

   Estrellas: el CSV de Gaia pineado del objeto si está en scripts/fixtures/gaia
   (`gaia_<nombre sin espacios en minúsculas>.csv`), y ninguna si no está. Es la
   MISMA entrada en los dos caminos, así que la equivalencia se mide igual; lo
   único que cambia es cuánta máscara atraviesa la comparación. Los objetos sin
   CSV van marcados en la tabla.

   `--sonda <f>` es la VÍA DE ESCAPE del ADR 0024 y solo eso: en vez de leer la
   textura del disco, codifica y decodifica el mismo parche en memoria con
   `a = f·σ`. No se salta nada por el camino —el ida y vuelta por el PNG es bit
   a bit (test_dso_texturas.js §«los bits publicados son los que dicen ser») y
   `uMin`/`uMax` salen de la misma llamada a `codificar`—, así que sirve para
   medir una codificación que todavía no está escrita en disco. Con `--sonda 1`
   tiene que dar lo MISMO que leyendo la textura, y eso se comprueba.

   Uso:  node scripts/harness_l1_equivalencia.js
         node scripts/harness_l1_equivalencia.js --dir simulador_ocular/dso
         node scripts/harness_l1_equivalencia.js --solo "NGC 5194"
         node scripts/harness_l1_equivalencia.js --md          (tabla markdown)
         node scripts/harness_l1_equivalencia.js --sonda 0.25  (vía de escape) */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-png16.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'nebulosas-datos.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'dso-texturas-datos.js'));

var R = window.BitacoraGaiaRender, PS1 = window.BitacoraPS1, CFG = PS1.cfg;
var B = require('./lib_bajar_parche.js')(R);
var P = require('./lib_parche_produccion.js')(R);
var BANCO = require('./lib_banco_dso.js')(R);
var FIXTURES = path.join(__dirname, 'fixtures', 'dso');
var GAIA = path.join(__dirname, 'fixtures', 'gaia');
var CAT = PS1.ps1CatalogoDifuso(window.BITACORA_GALAXIAS, window.BITACORA_NEBULOSAS);

/* Umbrales de L1.1. Prerregistrados: no se tocan aquí. */
var MAX_SIGMA = 0.05, MAX_FLUJO = 1e-4, MAX_FRAC_NAN = 1e-4, MAX_SALTO = 1;
/* Techo del desplazamiento del corte, derivado y no medido: la mediana del
   borde se mueve ≤ 1 paso y la MAD ≤ 2, así que cielo − kσ se mueve ≤
   1 + 2·1,4826·k. Sale de la cfg para que mover kAusencia lo mueva con ella. */
var MAX_CORTE = 1 + 2 * 1.4826 * CFG.kAusencia;

function arg(n, pordefecto) {
  var i = process.argv.indexOf(n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
}
var SOLO = arg('--solo', '');
var SONDA = parseFloat(arg('--sonda', '0')) || 0;
var MD = process.argv.indexOf('--md') > 0;
var DIRS = [path.resolve(RAIZ, arg('--dir', path.join('simulador_ocular', 'dso'))), FIXTURES];

/* ── El camino de la textura: el lector del navegador sobre ficheros ────────
   `fetch` de mentira. Registra lo que se pide, para poder decir «sin red». */
var BASE = 'https://textura-local/dso/';
PS1.texturasUrl = BASE;
var pedidos = [];
global.fetch = function (url) {
  url = String(url);
  pedidos.push(url);
  if (url.indexOf(BASE) !== 0) return Promise.resolve({ ok: false, status: 599 });
  var nombre = url.slice(BASE.length), ruta = null;
  DIRS.forEach(function (d) { if (!ruta && fs.existsSync(path.join(d, nombre))) ruta = path.join(d, nombre); });
  if (!ruta) return Promise.resolve({ ok: false, status: 404 });
  var b = fs.readFileSync(ruta);
  return Promise.resolve({
    ok: true, status: 200,
    arrayBuffer: function () { return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); },
    json: function () { return Promise.resolve(JSON.parse(b.toString('utf8'))); }
  });
};

/* El sidecar en disco: hace falta su `codificacion` para el paso de
   cuantización, que es la tolerancia del listón de los NaN de ausencia. */
function sidecarDe(nombre) {
  var id = PS1.ps1IdTextura(nombre), fila = PS1.ps1FilaTextura(nombre), v = fila && fila[2];
  for (var i = 0; i < DIRS.length; i++) {
    if (!fs.existsSync(DIRS[i])) continue;
    var f = fs.readdirSync(DIRS[i]).filter(function (n) {
      return n.indexOf(id + '.') === 0 && /\.json$/.test(n) && !/\.fila\.json$/.test(n) &&
             (!v || n === id + '.' + v + '.json');
    })[0];
    if (f) return JSON.parse(fs.readFileSync(path.join(DIRS[i], f), 'utf8'));
  }
  return null;
}

function leerGaia(nombre) {
  var f = path.join(GAIA, 'gaia_' + String(nombre).toLowerCase().replace(/[\s_]+/g, '') + '.csv');
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map(function (l) {
    var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
  });
}

/* Paso de cuantización de asinh16 en unidades del parche, evaluado en `v`:
   du = (uMax − uMin)/PASOS y dv = a·[sinh(u + du) − sinh(u)]. */
function pasoCuant(v, cod) {
  var du = (cod.uMax - cod.uMin) / window.BitacoraPNG16.PASOS;
  var u = Math.asinh(v / cod.a);
  return Math.abs(cod.a * (Math.sinh(u + du) - Math.sinh(u)));
}

/* σ del listón, con la definición del comparador de R1: desviación típica de
   los finitos de la capa «antes» (aquí, el camino FITS). */
function sigmaDe(f32) {
  var s = 0, s2 = 0, n = 0;
  for (var i = 0; i < f32.length; i++) {
    var v = f32[i];
    if (v !== v) continue;
    s += v; s2 += v * v; n++;
  }
  if (!n) return 0;
  var m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

/* Cielo, σ y corte de ausencia del array que ve ps1AnclarACatalogo. Las tres
   son llamadas a producción, no una copia de su aritmética. */
function corteDe(limpio, ancho, alto) {
  var cielo = PS1.ps1Cielo(limpio, ancho, alto);
  var sigma = PS1.ps1SigmaCielo(limpio, ancho, alto, cielo);
  return { cielo: cielo, sigma: sigma, corte: cielo - CFG.kAusencia * sigma };
}

/* Factor del anclaje: ps1AnclarACatalogo con magV = 0 devuelve el neto SIN
   escalar (su propia guarda), así que el cociente de las sumas es su k. */
function factorAnclaje(parche) {
  var neto = PS1.ps1AnclarACatalogo(parche.limpio, parche.ancho, parche.alto, { magV: 0 });
  var sN = 0, sD = 0;
  for (var i = 0; i < neto.length; i++) {
    var a = neto[i], b = parche.datos[i];
    if (a === a && b === b) { sN += a; sD += b; }
  }
  return sN > 0 ? sD / sN : 1;
}

function comparar(o) {
  var gal = o.gal, sc = sidecarDe(o.nombre);
  if (!sc) return Promise.resolve({ nombre: o.nombre, motivo: o.motivo, sin: 'sin textura en disco' });
  var estrellas = leerGaia(o.nombre);
  var pineada = !!estrellas;
  estrellas = estrellas || [];

  var base = BASE + PS1.ps1IdTextura(o.nombre) + '.' + sc.version;
  var notas = {};
  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, CFG.salida).then(function (F) {
    if (!SONDA) return PS1.ps1LeerTextura(base + '.png', base + '.json', notas).then(function (T) { return [F, T, sc.codificacion]; });
    /* La sonda repite lo que hace el generador —cielo y σ del parche crudo con
       las funciones de producción, `a = f·σ`— y se queda en memoria. */
    var cielo = PS1.ps1Cielo(F.datos, F.ancho, F.alto);
    var cod = window.BitacoraPNG16.codificar(F.datos, { a: SONDA * PS1.ps1SigmaCielo(F.datos, F.ancho, F.alto, cielo) });
    return [F, { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null,
                 datos: window.BitacoraPNG16.decodificar(cod.u16, cod) },
            { a: cod.a, uMin: cod.uMin, uMax: cod.uMax }];
  }).then(function (par) {
    var F = par[0], T = par[1];
    sc = { codificacion: par[2] };
    if (!T) throw new Error('la textura no se lee (' + (notas.motivo || '?') + ')');
    if (F.ancho !== T.ancho || F.alto !== T.alto) throw new Error('dimensiones distintas');

    var n = F.datos.length, i;

    /* 1 · Los NaN heredados del stack, ANTES de que nada los toque: el
       centinela 0 los transporta, así que aquí no puede haber ni uno. */
    var nanFuenteDif = 0;
    for (i = 0; i < n; i++) {
      if ((F.datos[i] !== F.datos[i]) !== (T.datos[i] !== T.datos[i])) nanFuenteDif++;
    }

    var pF = P.montar({ ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null, datos: F.datos },
                      gal, estrellas, CAT);
    var pT = P.montar({ ancho: T.ancho, alto: T.alto, escalaAs: T.escalaAs, wcs: T.wcs || null, datos: T.datos },
                      gal, estrellas, CAT);

    var cF = corteDe(pF.limpio, pF.ancho, pF.alto), cT = corteDe(pT.limpio, pT.ancho, pT.alto);
    var sigmaCielo = cF.sigma * factorAnclaje(pF);
    var sigma = sigmaDe(pF.datos);

    var maxD = 0, sF = 0, sD = 0, comunes = 0;
    var nanHeredDif = 0, nanAusDif = 0, peorDist = 0, peorPropia = 0, peorSalto = 0;
    for (i = 0; i < n; i++) {
      var a = pF.datos[i], b = pT.datos[i], fa = a === a, fb = b === b;
      if (fa && fb) {
        var d = a - b;
        if (Math.abs(d) > maxD) maxD = Math.abs(d);
        sF += a; sD += d; comunes++;
        continue;
      }
      if (fa === fb) continue;                       // los dos NaN: de acuerdo
      /* Discrepan. ¿De qué NaN hablamos? Si el píxel ya venía sin dato del
         stack es un NaN heredado —y ese no puede moverse—; si venía con dato,
         lo ha puesto la regla de ausencia. */
      if (F.datos[i] !== F.datos[i] || T.datos[i] !== T.datos[i]) { nanHeredDif++; continue; }
      nanAusDif++;
      var vF = pF.limpio[i], vT = pT.limpio[i], paso = pasoCuant(vF === vF ? vF : vT, sc.codificacion);
      /* Dos distancias, y no es lo mismo. La del LISTÓN mira el píxel contra
         los dos cortes, porque los dos caminos tienen el suyo: cada uno
         recalcula cielo y σ sobre sus propios datos. La PROPIA mira el píxel
         contra el corte del camino en el que ese píxel es NaN, que es la que
         dice si el píxel está pegado a SU frontera —es decir, si lo que se
         movió fue el píxel o fue el corte—. */
      var dist = 0;
      if (vF === vF) dist = Math.max(dist, Math.abs(vF - cF.corte) / paso);
      if (vT === vT) dist = Math.max(dist, Math.abs(vT - cT.corte) / paso);
      if (dist > peorDist) peorDist = dist;
      var propia = (a === a) ? Math.abs(vT - cT.corte) / paso : Math.abs(vF - cF.corte) / paso;
      if (propia === propia && propia > peorPropia) peorPropia = propia;
      /* Cuánto se ha movido el VALOR entre los dos caminos, en pasos. La
         codificación no puede mover más de uno; si aquí sale más, el salto no
         lo ha puesto ella sino lo que hay entre la codificación y la decisión,
         que es el relleno de ps1QuitarEstrellas. */
      var salto = Math.abs(vF - vT) / paso;
      if (salto === salto && salto > peorSalto) peorSalto = salto;
    }

    /* Un parche del que no sobrevive un solo píxel finito —la mordida de la
       máscara se lo lleva entero— no es un objeto que discrepe: es un objeto
       sin nada que restar. Si además las dos máscaras de NaN coinciden, los dos
       caminos son idénticos y decirlo `Infinity` sería un fallo inventado. */
    var vacio = comunes === 0;

    return {
      nombre: o.nombre, motivo: o.motivo, pineada: pineada, n: n, vacio: vacio,
      escalaAs: F.escalaAs, sigma: sigma, sigmaCielo: sigmaCielo,
      maxSigma: vacio ? 0 : (sigma > 0 ? maxD / sigma : Infinity),
      maxSigmaCielo: vacio ? 0 : (sigmaCielo > 0 ? maxD / sigmaCielo : Infinity),
      flujo: vacio ? 0 : (sF > 0 ? Math.abs(sD) / sF : Infinity),
      nanFuenteDif: nanFuenteDif, nanHeredDif: nanHeredDif,
      nanAusDif: nanAusDif, fracNanAus: nanAusDif / n, peorDist: peorDist, peorPropia: peorPropia, peorSalto: peorSalto,
      deltaCorte: Math.abs(cF.corte - cT.corte) / pasoCuant(cF.corte, sc.codificacion)
    };
  }).catch(function (e) {
    return { nombre: o.nombre, motivo: o.motivo, error: e.message };
  });
}

function veredicto(m) {
  return m.nanFuenteDif === 0 && m.nanHeredDif === 0 &&
         m.maxSigma <= MAX_SIGMA && m.flujo <= MAX_FLUJO &&
         m.fracNanAus <= MAX_FRAC_NAN &&
         (m.nanAusDif === 0 || (m.peorSalto <= MAX_SALTO && m.deltaCorte <= MAX_CORTE));
}

var b = BANCO.banco();
b.avisos.forEach(function (a) { console.log('AVISO · ' + a); });
var objetos = b.objetos.filter(function (o) { return o.gal && (!SOLO || BANCO.clave(o.nombre) === BANCO.clave(SOLO)); });

var medidas = [];
objetos.reduce(function (cadena, o, i) {
  return cadena.then(function () {
    return comparar(o).then(function (m) {
      medidas.push(m);
      if (MD) return;
      var etq = '[' + (i + 1) + '/' + objetos.length + '] ' + o.nombre;
      if (m.sin) return console.log(etq + '  —  ' + m.sin);
      if (m.error) return console.log(etq + '  ERROR  ' + m.error);
      console.log(etq + '  max|Δ| ' + m.maxSigma.toExponential(2) + ' σ (' +
        m.maxSigmaCielo.toExponential(2) + ' σ_cielo)  ·  |ΣΔ|/Σ ' +
        m.flujo.toExponential(2) + '  ·  NaN stack ' + m.nanFuenteDif + '/' + m.nanHeredDif +
        '  ·  NaN ausencia ' + m.nanAusDif + ' (peor ' + m.peorDist.toFixed(2) +
        ' pasos, propia ' + m.peorPropia.toFixed(2) + ', valor movido ' + m.peorSalto.toFixed(2) +
        ', corte movido ' + m.deltaCorte.toFixed(2) + ')  ' +
        (veredicto(m) ? 'PASA' : 'NO PASA'));
    });
  });
}, Promise.resolve()).then(function () {
  var hechas = medidas.filter(function (m) { return !m.sin && !m.error; });
  var malas = hechas.filter(function (m) { return !veredicto(m); });
  var rotas = medidas.filter(function (m) { return m.error; });
  var faltan = medidas.filter(function (m) { return m.sin; });

  /* Los 5 controles: su veredicto es el del banco y el manifiesto lo declara.
     Que no haya red se comprueba con lo que el fetch de mentira registró. */
  var antes = pedidos.length, malControl = [];
  b.controles.forEach(function (c) {
    var fila = PS1.ps1FilaTextura(c.fila ? c.fila[0] : c.nombre);
    if (!fila || fila[1] !== 'fila' || fila[6] !== c.esperado) {
      malControl.push(c.nombre + ' → ' + JSON.stringify(fila));
    }
  });
  var sinRed = pedidos.length === antes;

  if (MD) {
    console.log('| Objeto | motivo | max\\|Δ\\|/σ | max\\|Δ\\|/σ_cielo | \\|ΣΔ\\|/Σ | NaN stack | NaN ausencia | peor \\|v−corte\\| | contra su propio corte | valor movido | corte movido | Veredicto |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
    hechas.forEach(function (m) {
      console.log('| ' + m.nombre + (m.pineada ? '' : ' ·') + ' | ' + m.motivo + ' | ' +
        m.maxSigma.toExponential(2) + ' | ' + m.maxSigmaCielo.toExponential(2) + ' | ' +
        m.flujo.toExponential(2) + ' | ' +
        m.nanFuenteDif + ' | ' + m.nanAusDif + ' (' + m.fracNanAus.toExponential(1) + ') | ' +
        (m.nanAusDif ? m.peorDist.toFixed(2) + ' pasos' : '—') + ' | ' +
        (m.nanAusDif ? m.peorPropia.toFixed(2) + ' pasos' : '—') + ' | ' +
        (m.nanAusDif ? m.peorSalto.toFixed(2) + ' pasos' : '—') + ' | ' +
        m.deltaCorte.toFixed(2) + ' pasos | ' +
        (veredicto(m) ? '✅' : '❌') + ' |');
    });
  }

  console.log('\nL1.1 · umbrales: max|Δ| ≤ ' + MAX_SIGMA + '·σ, |ΣΔ|/Σ ≤ ' + MAX_FLUJO +
    ', NaN del stack = 0 px, NaN de ausencia ≤ ' + MAX_FRAC_NAN + ' del parche, ' +
    'valor movido ≤ ' + MAX_SALTO + ' paso y corte movido ≤ ' + MAX_CORTE.toFixed(2) + ' pasos.');
  console.log('objetos medidos: ' + hechas.length + ' de ' + medidas.length +
    (faltan.length ? '  (' + faltan.length + ' sin textura en disco)' : '') +
    (rotas.length ? '  (' + rotas.length + ' con error)' : ''));
  if (hechas.length) {
    var peor = function (f) { return hechas.reduce(function (x, m) { return Math.max(x, f(m)); }, 0); };
    console.log('peor max|Δ|/σ: ' + peor(function (m) { return m.maxSigma; }).toExponential(2) +
      '  ·  peor max|Δ|/σ_cielo: ' + peor(function (m) { return m.maxSigmaCielo; }).toExponential(2) +
      '  ·  peor |ΣΔ|/Σ: ' + peor(function (m) { return m.flujo; }).toExponential(2) +
      '  ·  NaN del stack movidos: ' + peor(function (m) { return m.nanFuenteDif + m.nanHeredDif; }) +
      '  ·  peor fracción de NaN de ausencia: ' + peor(function (m) { return m.fracNanAus; }).toExponential(2) +
      '  ·  peor distancia al corte: ' + peor(function (m) { return m.peorDist; }).toFixed(2) + ' pasos' +
      '  ·  peor distancia a su propio corte: ' + peor(function (m) { return m.peorPropia; }).toFixed(2) + ' pasos' +
      '  ·  peor salto del valor: ' + peor(function (m) { return m.peorSalto; }).toFixed(2) + ' pasos' +
      '  ·  peor desplazamiento del corte: ' + peor(function (m) { return m.deltaCorte; }).toFixed(2) + ' pasos');
  }
  console.log('controles de exclusión: ' + (malControl.length ? 'MAL — ' + malControl.join('; ')
    : b.controles.length + ' salen «fila» con su motivo') + (sinRed ? ', sin una sola petición' : ', PERO PIDIERON'));
  rotas.forEach(function (m) { console.log('ERROR · ' + m.nombre + ': ' + m.error); });
  faltan.forEach(function (m) { console.log('sin textura · ' + m.nombre); });

  var pasa = !malas.length && !rotas.length && !malControl.length && sinRed && hechas.length > 0;
  console.log('\nL1.1: ' + (pasa ? 'PASA' : 'NO PASA' + (malas.length ? ' — ' + malas.map(function (m) { return m.nombre; }).join(', ') : '')));
  process.exit(pasa ? 0 : 1);
}).catch(function (e) { console.error('FALLO: ' + (e && e.stack || e)); process.exit(2); });
