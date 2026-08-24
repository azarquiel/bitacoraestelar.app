#!/usr/bin/env node
/* Conservación del flujo cuando la mitad dibujada es un SORTEO (ADR 0012).

   Sustituye a test_banda_conservacion.js, que medía la fuga del (1−a) de la
   banda de transición. La banda ya no existe: el ADR 0012 la reemplaza por una
   probabilidad por estrella, y con ella desaparece la magnitud efectiva que se
   perdía por el camino.

   Pero aparece una tensión nueva, anotada en simulador_ocular/docs/adr/0012-crowding/punto_fijo.md
   §7: el velo usa la ESPERANZA (1−a) sobre la LF, que es un continuo, así que
   `Fdibujado = Ftotal − S1campo` es exacto; las estrellas catalogadas, en
   cambio, se sortean, y en una realización concreta el flujo dibujado ya no es
   el complemento exacto del velo —lo es en media—.

   Este test mide esa diferencia y la compara con lo que la estadística permite,
   no con un número inventado:

     B1  la partición del modelo es exacta: S1campo(m_res,r) + Fdibujado = Ftotal
         a todo radio. Es álgebra de la Capa 1 y tiene que cerrar al bit.
     B2  el sorteo del render es reproducible desde `C.sorteo` + `pob.aCrowd`:
         la lista que entrega pintarCumulo es exactamente la que sale de aplicar
         la ley a mano. Sin esto, B3 mediría otra cosa (ADR 0008).
     B3  el sesgo del sorteo es nulo: promediando 200 semillas, la cuenta
         dibujada coincide con Σa dentro de 3σ/√200. Poisson-binomial, σ² =
         Σ a(1−a): es la tolerancia que la propia ley fija, no una calibración.
     B4  una realización SUELTA cae dentro de 4σ. Aquí es donde no hay que
         confundir un puñado de estrellas de más o de menos con un fallo del
         modelo: si el desvío está dentro de σ, es el sorteo haciendo su trabajo.

   node scripts/test_conservacion_sorteo.js */
'use strict';

global.window = {};
global.document = undefined;
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;
var CATALOGO = global.window.BITACORA_GLOBULARES;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

function delCatalogo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], ra: e[2], dec: e[3], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}

var REFS = ['NGC 104', 'NGC 6205', 'NGC 5139'];
var EQUIPOS = [
  { D: 100, MAG: 50, sqm: 21.5 },
  { D: 200, MAG: 100, sqm: 21.5 },
  { D: 400, MAG: 200, sqm: 21.5 },
  { D: 467, MAG: 173, sqm: 21.0 }     // el de la captura del simulador
];

function corrida(cum, eq, estrellas, size) {
  var SIZE = size || 512;
  var pob = C.poblacionCacheada(cum, 0);
  var difuso = new Float32Array(SIZE * SIZE);
  var res = R.pintarCumulo(difuso, cum, {
    ra0: cum.ra, dec0: cum.dec, arcmin: Math.ceil(2.4 * pob.rtAs / 60), size: SIZE,
    cielo: { pupilaSalida: eq.D / eq.MAG, pupilaOjo: 7, sqm: eq.sqm,
             transmision: 0.9, aumentos: eq.MAG, perceptual: true },
    apertura: eq.D, estrellas: estrellas || [], realization: 0
  });
  return { res: res, pob: pob };
}

/* ── B1: la partición del modelo es exacta ───────────────────────────────── */

console.log('Conservación del flujo con el sorteo del ADR 0012\n');
console.log('B1 · S1campo + Fdibujado = Ftotal (álgebra de la Capa 1)\n');
console.log('  cúmulo     equipo             velo    dibujado      residuo');

var peorB1 = 0;
REFS.forEach(function (id) {
  var cum = delCatalogo(id);
  EQUIPOS.forEach(function (eq) {
    var c = corrida(cum, eq), t = c.res.tabla, pob = c.pob;
    var velo = 0, dib = 0, total = 0, peor = 0;
    for (var i = 0; i < t.r.length; i++) {
      if (!isFinite(t.mRes[i])) continue;
      var s = pob.sigma(t.r[i]);
      if (!(s > 0)) continue;
      var peso = s * t.r[i] * t.paso;          // 2·pi·r·Sigma(r)·dr, sin el 2·pi
      var v = pob.S1campo(t.mRes[i], t.r[i], c.res.radioImagenAs);
      var d = pob.Fdibujado(t.mRes[i], t.r[i], c.res.radioImagenAs);
      var res1 = Math.abs((v + d) / pob.Ftotal - 1);
      if (res1 > peor) peor = res1;
      velo += peso * v; dib += peso * d; total += peso * pob.Ftotal;
    }
    if (peor > peorB1) peorB1 = peor;
    console.log('  ' + id.padEnd(10) + ' ' +
      (eq.D + ' mm ' + eq.MAG + 'x ' + eq.sqm).padEnd(17) +
      (100 * velo / total).toFixed(1).padStart(7) + ' %' +
      (100 * dib / total).toFixed(1).padStart(10) + ' %' +
      peor.toExponential(1).padStart(13));
  });
});
console.log('');
ok(peorB1 < 1e-12, 'B1 · la partición cierra al bit (peor ' + peorB1.toExponential(1) + ')');

/* ── B2/B3/B4: el sorteo sobre las estrellas catalogadas ─────────────────── */

/* M13 con las de Gaia de verdad: las sintéticas del núcleo nacen por debajo de
   la magnitud límite y el sorteo no se vería. Fixture del arnés de estrellas. */
var M13 = delCatalogo('NGC 6205');
var gaia = require('fs').readFileSync(__dirname + '/../simulador_ocular/docs/validacion/m13_gaia_dr3.csv', 'utf8')
  .trim().split('\n').slice(1).map(function (l) {
    var c = l.split(',');
    return [+c[0], +c[1], +c[2], c[3] === '' ? null : +c[3]];
  });
var EQ = { D: 467, MAG: 173, sqm: 21.0 };
var c13 = corrida(M13, EQ, gaia);
var t13 = c13.res.tabla, pob13 = c13.pob, rImg = c13.res.radioImagenAs;

/* `estrellasCumulo` reenvía el MISMO array de cada estrella catalogada, así que
   las sintéticas se distinguen por identidad, sin marcarlas. */
var esGaia = new Set(gaia);
var dibujadas = c13.res.estrellas.filter(function (e) { return esGaia.has(e); });

/* m_res(r) leída de la tabla del render, no recalculada: la ley (aCrowd) sale de
   la Capa 1 y aquí sólo se interpola una tabla que ya está hecha. */
function mResEn(rAs) {
  var ult = t13.r.length - 1;
  if (!(rAs >= 0) || rAs >= t13.r[ult]) return Infinity;
  var u = rAs / t13.paso, i = Math.floor(u), t = u - i;
  var a = t13.mRes[i], b = t13.mRes[i + 1];
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return a * (1 - t) + b * t;
}

var cos0 = Math.cos(M13.dec * Math.PI / 180);
/* Las candidatas: dentro del cúmulo y por encima del cielo local. El sorteo
   decide sobre ellas y sólo sobre ellas. */
var cand = [];
gaia.forEach(function (e) {
  var dxAs = (((e[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600;
  var dyAs = (e[1] - M13.dec) * 3600;
  var rAs = pob13.radioPropio(dxAs, dyAs);
  var mRes = mResEn(rAs);
  if (!isFinite(mRes) || e[2] > mRes) return;
  cand.push({ e: e, p: pob13.aCrowd(e[2], rAs, rImg) });
});

console.log('\nB2/B3/B4 · el sorteo (M13, 467 mm 173×, ' + cand.length + ' candidatas)\n');

/* B2: reproducir la lista del render aplicando la ley a mano. */
var aMano = new Set();
cand.forEach(function (c2) {
  if (C.sorteo(c2.e[0], c2.e[1], 0) < c2.p) aMano.add(c2.e);
});
var dentroDelCumulo = dibujadas.filter(function (e) {
  var dxAs = (((e[0] - M13.ra + 540) % 360) - 180) * cos0 * 3600;
  return isFinite(mResEn(pob13.radioPropio(dxAs, (e[1] - M13.dec) * 3600)));
});
var iguales = dentroDelCumulo.length === aMano.size &&
              dentroDelCumulo.every(function (e) { return aMano.has(e); });
console.log('  el render dibuja ' + dentroDelCumulo.length + ' de dentro del cúmulo; a mano salen ' +
            aMano.size);
ok(cand.length > 100, 'B2 · hay muestra que sortear (ADR 0005)');
ok(iguales, 'B2 · la lista del render ES la ley aplicada a mano (ADR 0008)');

/* B3/B4: sesgo y dispersión. Poisson-binomial: E = Σp, σ² = Σp(1−p). */
var E = 0, V = 0;
cand.forEach(function (c2) { E += c2.p; V += c2.p * (1 - c2.p); });
var sd = Math.sqrt(V);
var SEMILLAS = 200, suma = 0, peorZ = 0;
for (var s2 = 0; s2 < SEMILLAS; s2++) {
  var n2 = 0;
  for (var j = 0; j < cand.length; j++) {
    if (C.sorteo(cand[j].e[0], cand[j].e[1], s2) < cand[j].p) n2++;
  }
  suma += n2;
  var z = Math.abs(n2 - E) / sd;
  if (z > peorZ) peorZ = z;
}
var media = suma / SEMILLAS;
console.log('  esperanza Σa = ' + E.toFixed(1) + ' estrellas, σ = ' + sd.toFixed(1) +
            ' (Poisson-binomial)');
console.log('  media de ' + SEMILLAS + ' semillas: ' + media.toFixed(1) + ' (' +
            ((media - E) / (sd / Math.sqrt(SEMILLAS))).toFixed(2) + ' σ del error de la media)');
console.log('  peor realización suelta: ' + peorZ.toFixed(2) + ' σ');
ok(Math.abs(media - E) < 3 * sd / Math.sqrt(SEMILLAS),
   'B3 · el sorteo no tiene sesgo: |media − Σa| < 3σ/√' + SEMILLAS);
ok(peorZ < 4, 'B4 · ninguna realización suelta se sale de 4σ (peor ' + peorZ.toFixed(2) + ')');

console.log('\nUn puñado de estrellas de más o de menos NO es un fallo del modelo mientras');
console.log('caiga dentro de esas σ: el ADR 0012 (A) eligió sortear, y sortear dispersa.');

console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
