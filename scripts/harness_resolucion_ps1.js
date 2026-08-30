#!/usr/bin/env node
/* HARNESS: ¿se puede pedir el parche de PS1 a más resolución, y hasta dónde?

   No toca producción. La pregunta no es «¿se ve mejor?», sino si la resolución
   angular del recorte permite REPRESENTAR ESPACIALMENTE la PSF que un día
   entregaría radioImagenEstelar(D). Si σ del kernel no llega al píxel, la PSF no
   es que se note poco: es que no se puede dibujar.

   Sin dependencias:  node scripts/harness_resolucion_ps1.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = window.BitacoraPS1.cfg;
var P = require('./lib_psf_parche.js')(R);
var PAR = require('./lib_parches_ps1.js')(R);

var APS = [80, 203, 457, 914];
var ESCALAS = [2.35, 1.00, 0.67, 0.50, 0.25];
var ESCALA_NATIVA = 0.25;                  // ″/px del stack de PS1
function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log(c.join(' | ')); }

/* Criterios DIAGNÓSTICOS del análisis. No son parámetros de producción y no
   deben acabar en ninguna constante: son la regla con la que se lee la tabla. */
function veredicto(s) {
  if (s < 0.5) return 'subpíxel';
  if (s < 1.0) return 'marginal';
  if (s < 2.0) return 'representable';
  return 'cómodo';
}

/* ═══ 1. De dónde sale escalaAs y dónde está el 512 ═══════════════════════ */
console.log('\n═══ 1. De dónde sale escalaAs ═══');
console.log('  proxy  ps1-proxy.php:106  size = lado·60/0,25   ← píxeles NATIVOS del stack');
console.log('  proxy  ps1-proxy.php:109  &output_size = $salida  ← fitscut remuestrea y corrige la WCS');
console.log('  proxy  ps1-proxy.php:338  $salida = ps1_acotar_salida($_GET[salida] ?? 512)');
console.log('  proxy  ps1-proxy.php:46   PS1_SALIDA_MAX = 1024   ← tope del PROXY, no del servicio');
console.log('  render bitacora-gaia-render.js:1322  PS1.salida = 512');
console.log('  render bitacora-gaia-render.js:1401  ps1UrlParche(gal, salida)  ← ya parametrizada');
console.log('  render bitacora-gaia-render.js:1456  escalaAs = |CDELT2|·3600   ← de la cabecera');
console.log('  render bitacora-gaia-render.js:2297  y si falta: lado·60/ancho');
console.log('  ⇒ escalaAs = lado(′)·60 / salida. El 512 es un DEFECTO, en los dos sentidos');
console.log('    de la palabra: valor por omisión, y decisión sin medida detrás.');

/* ═══ 2. El techo físico de verdad ════════════════════════════════════════ */
console.log('\n═══ 2. Hasta dónde tiene sentido pedir, sin inventar dato ═══');
var sigmaStack = PS1.seeingAs / P.FWHM_A_SIGMA;
console.log('  El stack de PS1 está muestreado a ' + ESCALA_NATIVA + '″/px y su seeing es ' +
  PS1.seeingAs + '″ de FWHM,');
console.log('  o sea σ = ' + f(sigmaStack, 3) + '″. La imagen está limitada en banda AHÍ: por debajo');
console.log('  de ~' + f(sigmaStack, 2) + '″/px no hay información nueva, solo más bytes.');
console.log('  · pedir output_size mayor que size = lado·60/0,25 sería interpolar en el');
console.log('    servidor: eso sí es inventar dato, y no se pide.');
console.log('  · pedir por debajo de ' + f(sigmaStack, 2) + '″/px es sobremuestrear: legítimo, pero');
console.log('    paga 4× los bytes por cada mitad de escala y no añade resolución.');
console.log('  ⇒ el objetivo razonable es ≈0,5″/px: es a la vez el suelo de Nyquist del');
console.log('    seeing del stack y —como se ve abajo— donde la PSF se vuelve dibujable.');

/* ═══ 3. La tabla ═════════════════════════════════════════════════════════ */
console.log('\n═══ 3. σ del kernel de la PSF, en píxeles del parche ═══');
fila(['\n  escalaAs', 'θ_parche', 'apertura', 'θ_res', 'θ_add', 'σ (px)', 'veredicto']);
ESCALAS.forEach(function (e) {
  APS.forEach(function (D, i) {
    var s = P.sigmaPx(D, e, null);
    fila(['  ' + (i === 0 ? f(e, 2) + '″/px' : '        '),
          i === 0 ? f(P.thetaParche(e), 2) + '″' : '     ',
          D + ' mm', f(P.thetaRes(D), 2) + '″', f(P.thetaAdd(D, e), 2) + '″',
          f(s, 2), veredicto(s)]);
  });
});
console.log('  subpíxel σ<0,5 · marginal 0,5≤σ<1 · representable σ≥1 · cómodo σ≥2');
console.log('  (criterios de lectura del análisis, NO constantes de producción)');

/* ═══ 4. ¿Qué escalaAs hace falta exactamente? ════════════════════════════ */
console.log('\n═══ 4. La escala que cada apertura necesita, resuelta al revés ═══');
/* σ = θ_add/(2,3548·e) con θ_add² = θ_res² − seeingPS1² − (0,68·e)². Se despeja:
     e² = (θ_res² − seeingPS1²) / ((2,3548·σ)² + 0,68²)
   No es un ajuste: es la misma fórmula, resuelta para e. */
function escalaPara(D, sigma) {
  var num = Math.pow(P.thetaRes(D), 2) - Math.pow(PS1.seeingAs, 2);
  var den = Math.pow(P.FWHM_A_SIGMA * sigma, 2) + Math.pow(P.CAJA_A_FWHM, 2);
  return num > 0 ? Math.sqrt(num / den) : 0;
}
fila(['\n  apertura', 'escalaAs para σ=0,5', 'para σ=1', 'para σ=2']);
APS.forEach(function (D) {
  fila(['  ' + D + ' mm'].concat([0.5, 1, 2].map(function (s) {
    return f(escalaPara(D, s), 2) + '″/px';
  })));
});
console.log('  ⇒ la apertura MÁS exigente es la mayor, porque su θ_res es la más pequeña.');
console.log('    Para que un ' + Math.max.apply(null, APS) + ' mm llegue a σ=1 hace falta ' +
  f(escalaPara(914, 1), 2) + '″/px.');
console.log('    A 0,50″/px las cuatro pasan de σ=1, y eso es lo que decide la propuesta.');

/* ═══ 5. Qué galaxias están afectadas de verdad ═══════════════════════════ */
console.log('\n═══ 5. El problema NO es de todas las galaxias: es de las grandes ═══');
require('../simulador_ocular/resources/js/galaxias-datos.js');
var CAT = window.BITACORA_GALAXIAS;
function ladoDe(g) { return Math.max(PS1.ladoMin, Math.min(PS1.ladoMax, PS1.ladoFactor * g[4] / 60)); }
var conCobertura = CAT.filter(function (g) { return g[3] > PS1.decMin; });
var lados = conCobertura.map(ladoDe);
function escalaAs(lado, salida) { return lado * 60 / salida; }

fila(['\n  salida', 'escalaAs mín', 'mediana', 'máx', 'galaxias con σ≥1 a 203 mm', 'con σ≥1 a 914 mm']);
[512, 1024, 2048].forEach(function (sal) {
  var es = lados.map(function (l) { return escalaAs(l, sal); }).sort(function (a, b) { return a - b; });
  var n203 = es.filter(function (e) { return P.sigmaPx(203, e, null) >= 1; }).length;
  var n914 = es.filter(function (e) { return P.sigmaPx(914, e, null) >= 1; }).length;
  fila(['  ' + sal + ' px', f(es[0], 2) + '″', f(es[es.length >> 1], 2) + '″', f(es[es.length - 1], 2) + '″',
        n203 + '/' + es.length + ' (' + f(100 * n203 / es.length, 0) + ' %)',
        n914 + '/' + es.length + ' (' + f(100 * n914 / es.length, 0) + ' %)']);
});
console.log('  ⇒ a 512 px la MAYORÍA de las galaxias del catálogo ya está bien: son pequeñas,');
console.log('    su lado es el mínimo de 1,5′ y eso da ' + f(escalaAs(PS1.ladoMin, 512), 2) + '″/px.');
console.log('    Las que fallan son las grandes —y son justo las que se miran—. Los 44 parches');
console.log('    en caché tienen escalaAs ' +
  f(Math.min.apply(null, PAR.parches.map(function (p) { return p.fits.escalaAs; })), 2) + '″…' +
  f(Math.max.apply(null, PAR.parches.map(function (p) { return p.fits.escalaAs; })), 2) + '″/px:');
console.log('    la caché está llena de las grandes porque son las que alguien ha mirado.');

/* ═══ 6. Coste ════════════════════════════════════════════════════════════ */
console.log('\n═══ 6. Coste de cada alternativa ═══');
/* Los bytes salen de la aritmética del FITS: float32 = 4 bytes por píxel. La
   descarga y la decodificación escalan con ellos. La convolución futura escala
   con píxeles × ancho del kernel, y el kernel es separable, o sea 2·(2·3σ+1). */
function bytes(sal) { return sal * sal * 4; }
function opsConv(sal, e) {
  var sig = P.sigmaPx(457, e, null);
  return sal * sal * 2 * (2 * Math.ceil(3 * Math.max(sig, 0.01)) + 1);
}
fila(['\n  salida', 'escalaAs a 20′', 'bytes/parche', 'caché de 150 MB', 'ops de convolución']);
[512, 1024, 2048, 4800].forEach(function (sal) {
  var e = escalaAs(20, sal);
  fila(['  ' + sal + ' px', f(e, 2) + '″/px', f(bytes(sal) / 1048576, 1) + ' MB',
        Math.floor(150 * 1048576 / bytes(sal)) + ' parches',
        f(opsConv(sal, e) / 1e6, 1) + ' M']);
});
console.log('  · red y descarga: escalan con los bytes. El parche se pide UNA vez por galaxia');
console.log('    y luego es disco: `Cache-Control: immutable, max-age=1 año`.');
console.log('  · memoria del navegador: un Float32Array por parche vivo, esos mismos bytes.');
console.log('  · decodificación: parseFITS es un recorrido lineal, escala con los bytes.');
console.log('  · caché de disco: PS1_CACHE_MAX_BYTES = 150 MB, con LRU. A 1024 px caben ' +
  Math.floor(150 * 1048576 / bytes(1024)) + ',');
console.log('    a 2048 solo ' + Math.floor(150 * 1048576 / bytes(2048)) + ': ahí el tope de caché');
console.log('    empieza a ser el que manda, no la red.');

/* ═══ 7. Las cuatro alternativas, comparadas ═════════════════════════════ */
console.log('\n═══ 7. Las cuatro alternativas ═══');
fila(['\n  alternativa', 'escalaAs a 20′', 'σ a 203 mm', 'σ a 914 mm', 'coste', 'toca producción']);
[
  ['dejar 512 px', escalaAs(20, 512), '1 línea… ninguna', 'no'],
  ['subir a 1024 px', escalaAs(20, 1024), '4× bytes', 'PS1.salida'],
  ['subir a 2048 px', escalaAs(20, 2048), '16× bytes, y el proxy', 'PS1.salida + PS1_SALIDA_MAX'],
  ['bajar ladoMax a 10′', escalaAs(10, 512), 'igual', 'PS1.ladoMax (rompe cobertura)']
].forEach(function (a) {
  fila(['  ' + a[0], f(a[1], 2) + '″/px', f(P.sigmaPx(203, a[1], null), 2),
        f(P.sigmaPx(914, a[1], null), 2), a[2], a[3]]);
});
console.log('  · «bajar ladoMax» se descarta sin discusión: recorta el campo angular y con él');
console.log('    la fracción de luz que el parche abarca (ps1FraccionLuz / PS1.fracMin). Ganar');
console.log('    resolución tirando galaxia por el borde no es ganar resolución.');
console.log('  · «mantener 512 y pedir un recorte más pequeño» es lo mismo con otro nombre.');

/* ═══ 8. Doble contabilización y dependencias ════════════════════════════ */
console.log('\n═══ 8. Lo que la resolución del parche NO puede tocar ═══');
fila(['  magnitud', '¿depende de salida?', 'por qué']);
fila(['  flujo total del parche', 'NO', 'fitscut remuestrea conservando el flujo por ″²']);
fila(['  Cmin / μ_lim', 'NO', 'ctxFotometrico solo ve sqm, transmisión y pupilas']);
fila(['  nivelFondo', 'NO', 'lo mismo']);
fila(['  campo angular cubierto', 'NO', 'lo fija `lado`, y `lado` no cambia']);
fila(['  tamaño en pantalla', 'NO', 'lo fijan `lado` y la escala del lienzo']);
fila(['  σ de la PSF (px)', 'SÍ', 'es el único que debe cambiar, y es el objetivo']);
console.log('  ⇒ subir la resolución del recorte es una decisión de ADQUISICIÓN. No toca la');
console.log('    física de detección, ni la ley Cmin, ni los aumentos, ni el lienzo.');

/* ═══ Comprobaciones ══════════════════════════════════════════════════════ */
console.log('\n═══ Comprobaciones ═══');
console.log('  · producción intacta: este script solo LEE CFG/PS1 y llama a funciones exportadas.');
console.log('  · PS1.salida = ' + PS1.salida + ', PS1.ladoMax = ' + PS1.ladoMax +
  ', PS1.seeingAs = ' + PS1.seeingAs + ', sin tocar.');
console.log('  · airyArcsec = ' + CFG.airyArcsec + ', seeingArcsec = ' + CFG.seeingArcsec + ', sin tocar.');
console.log('  · sin PSF aplicada, sin θ_detalle, sin tocar clamps ni ps1FlujoModelo.');
