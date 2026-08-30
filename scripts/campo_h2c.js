#!/usr/bin/env node
/* Experimento de CAMPO de la ley H2c: visto/no-visto real frente al margen
   predicho. Es el único bloqueo que queda antes de producción (veredicto D del
   experimento de anclaje): decide si K = 2.0 (conservar C_MIN) se mantiene o
   necesita una corrección de NIVEL. La forma H2c no se toca aquí.

   Datos: simulador_ocular/docs/experimentos/ricco/campo/observaciones.csv, UNA observación real por fila:
     objeto,apertura_mm,aumentos,sqm,seeing_as,transmision,resultado
   - objeto: nombre EXACTO del catálogo (col. 0 de BITACORA_GALAXIAS)
   - seeing_as: ″ (vacío = 2.0); transmision: 0–1 (vacío = la del render)
   - resultado: visto | no_visto | lateral  (lateral = solo con visión lateral,
     o sea justo en el umbral: los casos que más pesan)
   Sirven 6–10 casos CERCA del umbral. Sin fichero o sin filas, el script
   imprime la plantilla y el margen predicho de los objetos del A/B, para
   elegir qué observar.

   El margen por fila:
     C_obj  = 10^(−0.4·(μ_media(μ25) − sqm))   (contraste medio; dim y T se
              cancelan: atenúan objeto y cielo por igual)
     Cmin   = ctxFotometrico con FOT.H2C activa y θint = ps1ThetaIntArcmin
     margen = log10(C_obj / Cmin)   (>0 ⇒ H2c predice «se empieza a pintar»)

   Lectura del resultado, a mano y sin regresión:
   - visto con margen<0 sistemático ⇒ K=2.0 es demasiado estricto (bajar nivel)
   - no_visto con margen>0 sistemático ⇒ demasiado laxo (subir nivel)
   - si el desajuste DEPENDE del tamaño o del fondo ⇒ BLOQUEO: contradice K
     constante y hay que documentarlo, no inventar fórmula. */
'use strict';
var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'resources', 'js', 'bitacora-ps1.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;
var CAT = global.window.BITACORA_GALAXIAS;
var DIR = path.join(RAIZ, 'simulador_ocular', 'docs', 'experimentos', 'ricco', 'campo');
var CSV = path.join(DIR, 'observaciones.csv');

var ALIAS = { 'M101': 'NGC 5457', 'M51': 'NGC 5194', 'M81': 'NGC 3031',
              'M33': 'NGC 598', 'M104': 'NGC 4594', 'M110': 'NGC 205' };
function galDe(nombre) {
  nombre = ALIAS[nombre] || nombre;
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === nombre) {
    var g = CAT[i];
    return { nombre: g[0], reArcsec: g[4], ba: g[5], pa: g[6],
             magV: g[7], n: g[8], bt: g[9] };
  }
  return null;
}

function margenDe(gal, D, M, sqm, seeingAs, T) {
  var comps = window.BitacoraPS1.ps1ComponentesSersic(gal);
  var medidas = window.BitacoraPS1.ps1MedidasHalo(gal, comps);
  var thInt = window.BitacoraPS1.ps1ThetaIntArcmin(comps, gal.ba);
  if (!(thInt > 0) || !isFinite(medidas.muProm)) return null;
  var H2C = { THETA_R_A: R.fot.H2C_DEFECTO.THETA_R_A,
              THETA_R_B: R.fot.H2C_DEFECTO.THETA_R_B,
              SEEING_AS: (seeingAs > 0) ? seeingAs : R.fot.H2C_DEFECTO.SEEING_AS };
  var o = { pupilaSalida: D / M, pupilaOjo: 7, sqm: sqm, aumentos: M };
  if (T > 0) o.transmision = T;
  var prev = R.fot.H2C;
  R.fot.H2C = H2C;
  var ctx = R.ctxFotometrico(o, thInt);
  R.fot.H2C = prev;
  var Cobj = Math.pow(10, -0.4 * (medidas.muProm - sqm));
  return { thInt: thInt, muProm: medidas.muProm, SBe: ctx.SBe, Cmin: ctx.Cmin,
           Cobj: Cobj, margen: Math.log10(Cobj / ctx.Cmin), pupila: D / M };
}

function fila(nombre, D, M, sqm, seeingAs, T, resultado) {
  var gal = galDe(nombre);
  if (!gal) { console.log('  ⚠ ' + nombre + ': no está en el catálogo'); return null; }
  var m = margenDe(gal, D, M, sqm, seeingAs, T);
  if (!m) { console.log('  ⚠ ' + nombre + ': sin modelo (θint o μ media indefinidos)'); return null; }
  var acorde = resultado === 'visto' ? m.margen > 0
             : resultado === 'no_visto' ? m.margen < 0
             : resultado === 'lateral' ? Math.abs(m.margen) < 0.3 : null;
  console.log('  ' + [nombre, D + 'mm', M + 'x', 'pupila ' + m.pupila.toFixed(2),
    'sqm ' + sqm, 'θint ' + m.thInt.toFixed(1) + '′', 'SBe ' + m.SBe.toFixed(2),
    'μ̄ ' + m.muProm.toFixed(2), 'margen ' + (m.margen >= 0 ? '+' : '') + m.margen.toFixed(2) + ' dex',
    resultado || '(predicción)', acorde == null ? '' : (acorde ? '✓ acorde' : '✗ DESACUERDO')
  ].join(' · '));
  return { margen: m.margen, resultado: resultado, acorde: acorde };
}

/* Casos RECOMENDADOS: escalera de márgenes −0.2…+0.3 con el equipo real
   (barrido de objetos × equipos × sqm 21–22). El sqm es el de LA NOCHE: estas
   filas dicen «observa este objeto una noche así»; el margen definitivo lo
   calcula el sqm medido que se apunte en el CSV.
   Nombres del catálogo (col. 0): M101=NGC 5457, M51=5194, M81=3031, M33=598,
   M104=4594, M110=205. */
var RECOMENDADOS = [
  ['NGC 6946', 305, 152, 21.0],    // ≈ −0.20
  ['NGC 5457', 305, 152, 21.0],    // ≈ −0.19
  ['NGC 598', 305, 152, 21.0],     // ≈ −0.15 (¡60′: el θint más grande!)
  ['NGC 891', 305, 152, 21.2],     // ≈ −0.09
  ['NGC 5457', 457.2, 158, 21.2],  // ≈ −0.03 ← EL caso de discriminación
  ['NGC 300', 457.2, 158, 21.2],   // ≈ 0.00 (muy al sur: si no llega, saltarla)
  ['NGC 2403', 305, 152, 21.2],    // ≈ +0.08
  ['NGC 5194', 305, 152, 21.2],    // ≈ +0.16
  ['NGC 5194', 457.2, 158, 21.0],  // ≈ +0.23
  ['NGC 3031', 457.2, 158, 21.2]   // ≈ +0.31
];
function predicciones() {
  console.log('Margen PREDICHO de los casos recomendados (elegir 6–10, mejor los cercanos a 0):\n');
  RECOMENDADOS.forEach(function (t) { fila(t[0], t[1], t[2], t[3], 0, 0, null); });
  console.log('\nRellenar ' + path.relative(RAIZ, CSV) + ' con observaciones REALES y repetir.');
  console.log('\nESTADO: PENDIENTE DE CAMPO');
}

if (!fs.existsSync(CSV)) {
  console.log('Sin datos de campo aún: ' + path.relative(RAIZ, CSV) + ' no existe. Plantilla escrita.\n');
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CSV, 'objeto,apertura_mm,aumentos,sqm,seeing_as,transmision,resultado\n');
  predicciones();
  process.exit(0);
}

var lineas = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1)
  .filter(function (l) { return l.trim(); });
if (!lineas.length) {
  console.log('El CSV existe pero está vacío: sin veredicto de campo.\n');
  predicciones();
  process.exit(0);
}
console.log('═══ Campo H2c: ' + lineas.length + ' observaciones ═══');
var casos = [];
lineas.forEach(function (l) {
  var c = l.split(/[;,]/);
  var r = fila(c[0], +c[1], +c[2], +c[3], +c[4] || 0, +c[5] || 0, (c[6] || '').trim());
  if (r) casos.push(r);
});
var des = casos.filter(function (c) { return c.acorde === false; });
console.log('\n' + casos.length + ' casos · ' + des.length + ' en desacuerdo con K = 2.0');
if (casos.length < 6) {
  console.log('Menos de 6 casos: el veredicto aún no es fiable.');
  console.log('\nESTADO: PENDIENTE DE CAMPO');
}
if (des.length) {
  var sesgo = des.reduce(function (s, c) { return s + c.margen; }, 0) / des.length;
  /* Signo: margen = log10(Cobj/Cmin). VISTO con margen<0 ⇒ el umbral real está
     más BAJO ⇒ K baja: mover log10(Cmin) en +margen es K_nuevo = K·10^(margen).
     NO_VISTO con margen>0 ⇒ K sube: la misma fórmula. */
  console.log('margen medio de los desacuerdos: ' + sesgo.toFixed(2) +
    ' dex → si el signo es consistente, corrección de NIVEL (nuevo K = 2.0·10^' +
    sesgo.toFixed(2) + ' = ' + (2 * Math.pow(10, sesgo)).toFixed(2) +
    '); si depende de tamaño/fondo, BLOQUEO.');
} else if (casos.length >= 6) {
  console.log('K = 2.0 compatible con el campo: nivel confirmado.');
}
