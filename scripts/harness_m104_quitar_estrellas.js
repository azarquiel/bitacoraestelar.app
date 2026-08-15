#!/usr/bin/env node
/* OBSOLETO (ago-2026): describe la producción ANTERIOR (nucleoPx + relleno
   plano). El algoritmo que salió de aquí ya está en producción y lo valida
   scripts/harness_quitar_estrellas_general.js; este queda como registro del
   diagnóstico. Con PS1.nucleoPx eliminado, su «réplica de producción» compara
   contra la vía sin geometría (sin protección).

   HARNESS: ps1QuitarEstrellas sobre M104, y nada más.

   Pregunta a decidir: el «bola dentro de anillo oscuro» del núcleo, ¿se arregla
   PROTEGIENDO el núcleo (radio), cambiando el RELLENO (plano → fondo galáctico
   local), o con las dos cosas?

   Qué hace:
     1. Reproduce el caso actual: parche de producción (1024 px, PS1.salida),
        estrellas reales de Gaia (gaia_m104.csv), ps1QuitarEstrellas de verdad.
     2. Lista las fuentes de Gaia eliminadas a <15″ del núcleo: posición,
        magnitud y radio de máscara.
     3. Variantes de protección del núcleo: 0, 1, 2, 3 y 5″ (producción:
        nucleoPx=3 px alrededor del centro del parche = 2,33″ a 1024).
     4. Variante de relleno: en vez del disco plano, mediana de la ISOFOTA
        elíptica local (b/a y PA del catálogo) — estimación del fondo galáctico
        en ese radio. SOLO aquí; producción no se toca.
     5. Por variante: perfil radial 0–20″ (anillos de 1″), mínimo radial,
        profundidad respecto al centro, flujo acumulado, residuo de cada
        estrella quitada (¿se reintroduce?), mapa de clases y recorte PGM con
        TOPE COMÚN (referencia fija, sin normalizar por imagen).
     6. Clases por píxel, separadas: 0=dato, 1=NaN original de PS1,
        2=reconstruido (máscara de Gaia rellenada), 3=enmascarado pero
        PROTEGIDO (no se toca).
     7. Independencia de apertura: la máscara corre ANTES de la PSF y no ve D;
        se comprueba midiendo el mínimo tras la PSF de 200 y de 450 mm.

   Todo se mide en DN del stack (pre-anclaje): unidades fijas entre variantes.
   El anclaje reescala por el flujo total, que cambia con el relleno, y eso
   contaminaría la comparación; su factor k se imprime aparte por variante.

   La réplica local de ps1QuitarEstrellas + ps1FondoAlrededor se VERIFICA
   contra producción: con protección 3 px y relleno plano el resultado debe ser
   idéntico bit a bit, o el harness aborta.

   NO evalúa bilineal: eso es remuestreo del pintado, otro problema.

   Uso:  node scripts/harness_m104_quitar_estrellas.js */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = R.ps1;
var B = require('./lib_bajar_parche.js')(R);
require('../simulador_ocular/resources/js/galaxias-datos.js');

var OUT_DIR = path.join(__dirname, '..', '.scratch', 'm104-quitar');
fs.mkdirSync(OUT_DIR, { recursive: true });
var CSV = path.join(__dirname, '..', '.scratch', 'm104-nucleo', 'gaia_m104.csv');

function f(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 2 : d); }
function fila(c) { console.log(c.join(' | ')); }

/* ── M104 ────────────────────────────────────────────────────────────────── */
var CAT = global.window.BITACORA_GALAXIAS, filaCat = null;
for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === 'NGC 4594') filaCat = CAT[i];
var gal = {
  nombre: filaCat[0], ra: filaCat[2], dec: filaCat[3], reArcsec: filaCat[4],
  ba: filaCat[5], pa: filaCat[6], magV: filaCat[7], n: filaCat[8], bt: filaCat[9],
  ladoArcmin: R.ps1LadoArcmin(filaCat[4])
};
if (!fs.existsSync(CSV)) { console.error('falta ' + CSV + ' (lo dejó harness_m104_nucleo.js)'); process.exit(1); }
var estrellas = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1).map(function (l) {
  var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
}).filter(function (e) { return isFinite(e[2]); });

var F = null, nuc = null, esc = 0;

B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (f1024) {
  F = f1024; esc = F.escalaAs;
  nuc = [(F.ancho - 1) / 2, (F.alto - 1) / 2];   // bajar() recorta centrado en el núcleo
  console.log('═══ M104 · parche ' + F.ancho + '×' + F.alto + ' px · escalaAs=' + f(esc, 3) +
    '″/px · ' + estrellas.length + ' estrellas de Gaia (G≤20) ═══');
  cuerpo();
}).catch(function (e) { console.error('sin parche: ' + e.message); process.exit(1); });

function cuerpo() {

/* ── Estrellas en píxeles del parche, y las de <15″ del núcleo ───────────── */
var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: esc, wcs: F.wcs || null };
fSim.afin = R.ps1AfinParche(fSim, gal);
var enPx = R.ps1EstrellasEnPixeles(fSim, gal, estrellas);
console.log('\n── Fuentes de Gaia eliminadas a <15″ del núcleo ──');
fila(['  px (x, y)', 'offset (″)', 'G', 'radio máscara (″/px)']);
var cerca = [];
enPx.forEach(function (e) {
  var d = Math.hypot(e.x - nuc[0], e.y - nuc[1]) * esc;
  if (d < 15) {
    cerca.push(e);
    fila(['  (' + f(e.x, 1) + ', ' + f(e.y, 1) + ')', f(d, 1), f(e.g, 2),
      f(e.rAs, 1) + '″ / ' + f(e.rPx, 1) + ' px']);
  }
});
console.log('  protección de producción: nucleoPx=' + PS1.nucleoPx + ' px = ' +
  f(PS1.nucleoPx * esc, 2) + '″ alrededor del CENTRO DEL PARCHE');

/* ── Réplica parametrizada de ps1QuitarEstrellas ─────────────────────────── */
/* Devuelve {out, clase}: clase 0=dato intacto, 1=NaN original de PS1 (fuera de
   máscara: se conserva NaN), 2=reconstruido (dentro de máscara, rellenado),
   3=enmascarado pero protegido (dentro del disco de una estrella Y del radio de
   protección: NO se toca). Producción = rProtAs 3 px·esc + relleno 'plano'. */

// Copia de ps1FondoAlrededor (no exportada): mediana del anillo [r, 1,6r],
// ensanchándose hasta 4 veces, saltando máscara y NaN.
function fondoAlrededor(datos, mascara, ancho, alto, x, y, r) {
  for (var k = 0; k < 4; k++) {
    var rIn = r * Math.pow(1.6, k), rOut = rIn * 1.6, m = [], dx, dy;
    for (dy = -Math.ceil(rOut); dy <= Math.ceil(rOut); dy++) {
      var yy = Math.round(y + dy); if (yy < 0 || yy >= alto) continue;
      for (dx = -Math.ceil(rOut); dx <= Math.ceil(rOut); dx++) {
        var xx = Math.round(x + dx); if (xx < 0 || xx >= ancho) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < rIn || d > rOut) continue;
        var j = yy * ancho + xx;
        if (mascara[j]) continue;
        var v = datos[j];
        if (v === v) m.push(v);
      }
    }
    if (m.length >= 8) { m.sort(function (a, b) { return a - b; }); return m[m.length >> 1]; }
  }
  return null;
}

/* Radio elíptico (″, sobre la isofota) de un píxel respecto al núcleo, con el
   b/a y PA del catálogo. PA de norte a este; el parche sin WCS va norte-arriba
   (este = −x). */
var PAR_RAD = gal.pa * Math.PI / 180, SIN_PA = Math.sin(PAR_RAD), COS_PA = Math.cos(PAR_RAD);
function radioElip(x, y) {
  var este = -(x - nuc[0]) * esc, norte = -(y - nuc[1]) * esc;   // fila del FITS crece al norte
  var u = este * SIN_PA + norte * COS_PA;        // eje mayor
  var v = -este * COS_PA + norte * SIN_PA;       // eje menor
  return Math.hypot(u, v / (gal.ba > 0 ? gal.ba : 1));
}

/* Mediana del fondo galáctico por BANDA de isofota (1 px de ancho), calculada
   una vez sobre los píxeles NO enmascarados: la estimación local que pide la
   variante 'isofota'. */
function tablaIsofotas(datos, mascara, ancho, alto) {
  var bandas = [];
  for (var y = 0; y < alto; y++) {
    for (var x = 0; x < ancho; x++) {
      var j = y * ancho + x;
      if (mascara[j]) continue;
      var v = datos[j];
      if (v !== v) continue;
      var b = Math.round(radioElip(x, y) / esc);
      (bandas[b] || (bandas[b] = [])).push(v);
    }
  }
  return bandas.map(function (m) {
    if (!m || m.length < 8) return null;
    m.sort(function (a, b) { return a - b; });
    return m[m.length >> 1];
  });
}

function quitarVariante(datos, ancho, alto, lista, rProtAs, relleno) {
  var mascara = new Uint8Array(datos.length), clase = new Uint8Array(datos.length);
  var i, e, x, y;
  var rProtPx = rProtAs / esc;
  for (i = 0; i < datos.length; i++) if (!(datos[i] === datos[i])) clase[i] = 1;   // NaN original
  for (i = 0; i < lista.length; i++) {
    e = lista[i];
    var r = Math.max(1, e.rPx), r2 = r * r;
    for (y = Math.max(0, Math.floor(e.y - r)); y <= Math.min(alto - 1, Math.ceil(e.y + r)); y++) {
      for (x = Math.max(0, Math.floor(e.x - r)); x <= Math.min(ancho - 1, Math.ceil(e.x + r)); x++) {
        var dx = x - e.x, dy = y - e.y;
        if (dx * dx + dy * dy > r2) continue;
        var nx = x - nuc[0], ny = y - nuc[1];
        if (nx * nx + ny * ny <= rProtPx * rProtPx) { clase[y * ancho + x] = 3; continue; }
        mascara[y * ancho + x] = 1;
      }
    }
  }
  var out = Float32Array.from(datos);
  var isofotas = (relleno === 'isofota') ? tablaIsofotas(datos, mascara, ancho, alto) : null;
  var cieloP = null;
  for (i = 0; i < lista.length; i++) {
    e = lista[i];
    var rE = Math.max(1, e.rPx), fondo = null;
    if (relleno === 'plano') {
      if (e.rAs > PS1.rellenoPlanoMaxAs) {
        if (cieloP == null) cieloP = R.ps1Cielo(datos, ancho, alto);
        fondo = cieloP;
      } else {
        fondo = fondoAlrededor(datos, mascara, ancho, alto, e.x, e.y, rE);
      }
      if (fondo == null) continue;
    }
    var rE2 = rE * rE;
    for (y = Math.max(0, Math.floor(e.y - rE)); y <= Math.min(alto - 1, Math.ceil(e.y + rE)); y++) {
      for (x = Math.max(0, Math.floor(e.x - rE)); x <= Math.min(ancho - 1, Math.ceil(e.x + rE)); x++) {
        var ex = x - e.x, ey = y - e.y;
        if (ex * ex + ey * ey > rE2) continue;
        var j = y * ancho + x;
        if (!mascara[j]) continue;
        var v = fondo;
        if (relleno === 'isofota') {
          var b = Math.round(radioElip(x, y) / esc);
          v = isofotas[b];
          // banda sin muestras (no debería pasar cerca del núcleo): la vecina
          for (var k = 1; v == null && k < 8; k++) v = isofotas[b + k] != null ? isofotas[b + k] : isofotas[b - k];
          if (v == null) continue;
        }
        out[j] = v;
        clase[j] = 2;
      }
    }
  }
  return { out: out, clase: clase };
}

/* ── Verificación de la réplica contra producción ────────────────────────── */
var prod = R.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx);
var replica = quitarVariante(F.datos, F.ancho, F.alto, enPx, PS1.nucleoPx * esc, 'plano');
var dMax = 0, nDist = 0;
for (i = 0; i < prod.length; i++) {
  var a = prod[i], b = replica.out[i];
  if ((a === a) !== (b === b)) { nDist++; continue; }
  if (a === a && Math.abs(a - b) > dMax) dMax = Math.abs(a - b);
}
console.log('\n── Réplica vs ps1QuitarEstrellas de producción (prot. 3 px, relleno plano) ──');
console.log('  px con finitud distinta: ' + nDist + ' · Δmax = ' + dMax);
if (nDist || dMax > 0) { console.error('  ✗ LA RÉPLICA NO ES FIEL: aborto.'); process.exit(1); }
console.log('  ✓ idéntica bit a bit: lo que se mida abajo vale para producción.');

/* ── Métricas radiales 0–20″, en DN, anillos de 1″ ───────────────────────── */
var RMAX = 20;
function perfil(datos, clase) {
  var anillos = [], cl = [];
  for (var a = 0; a < RMAX; a++) { anillos.push([]); cl.push([0, 0, 0, 0]); }
  var rMaxPx = RMAX / esc;
  var y0 = Math.max(0, Math.floor(nuc[1] - rMaxPx)), y1 = Math.min(F.alto - 1, Math.ceil(nuc[1] + rMaxPx));
  var x0 = Math.max(0, Math.floor(nuc[0] - rMaxPx)), x1 = Math.min(F.ancho - 1, Math.ceil(nuc[0] + rMaxPx));
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var rAs = Math.hypot(x - nuc[0], y - nuc[1]) * esc;
      if (rAs >= RMAX) continue;
      var j = y * F.ancho + x, a2 = Math.floor(rAs);
      cl[a2][clase ? clase[j] : 0]++;
      var v = datos[j];
      if (v === v) anillos[a2].push(v);
    }
  }
  var out = [], acum = 0;
  for (a = 0; a < RMAX; a++) {
    var m = anillos[a].sort(function (u, w) { return u - w; });
    var s = 0; for (var k = 0; k < m.length; k++) s += m[k];
    var media = m.length ? s / m.length : NaN;
    var area = Math.PI * (Math.pow(a + 1, 2) - Math.pow(a, 2)) / (esc * esc);   // px equivalentes
    if (isFinite(media)) acum += media * area;
    out.push({ r: a, n: m.length, min: m.length ? m[0] : NaN, med: m.length ? m[m.length >> 1] : NaN,
               max: m.length ? m[m.length - 1] : NaN, acum: acum, clases: cl[a] });
  }
  return out;
}
/* Mínimo GLOBAL con subida por los dos lados: una meseta (medianas idénticas
   por el relleno plano) también es anillo, así que no se exige «estrictamente
   menor que el vecino» sino que haya algo más brillante por dentro Y por
   fuera. prof = la menor de las dos subidas (lo que de verdad se ve). */
function minimoRadial(anillos) {
  var iMin = -1;
  for (var a = 1; a < anillos.length; a++) {
    if (!isFinite(anillos[a].med)) continue;
    if (iMin < 0 || anillos[a].med < anillos[iMin].med) iMin = a;
  }
  if (iMin < 0) return null;
  var dentro = -Infinity, fuera = -Infinity;
  for (a = 0; a < iMin; a++) if (isFinite(anillos[a].med)) dentro = Math.max(dentro, anillos[a].med);
  for (a = iMin + 1; a < anillos.length; a++) if (isFinite(anillos[a].med)) fuera = Math.max(fuera, anillos[a].med);
  var v = anillos[iMin].med;
  if (!(dentro > v && fuera > v)) return null;   // monótono: el «mínimo» es el borde
  return { r: iMin + 0.5, med: v, prof: Math.min(dentro - v, fuera - v) };
}
/* ¿Se reintrodujo la estrella? Residuo puntual en su posición: mediana del
   disco menos mediana del anillo de fuera. En el parche SIN quitar sale el
   pico real; tras quitar debe quedar ≈0 (relleno plano exacto: 0 clavado). */
function residuoEstrella(datos, e) {
  var dentro = [], fuera = [], rr = Math.max(1, e.rPx);
  var lim = Math.ceil(rr * 1.6);
  for (var dy = -lim; dy <= lim; dy++) {
    for (var dx = -lim; dx <= lim; dx++) {
      var x = Math.round(e.x + dx), y = Math.round(e.y + dy);
      if (x < 0 || y < 0 || x >= F.ancho || y >= F.alto) continue;
      var d = Math.hypot(x - e.x, y - e.y), v = datos[y * F.ancho + x];
      if (v !== v) continue;
      if (d <= rr) dentro.push(v); else if (d <= rr * 1.6) fuera.push(v);
    }
  }
  dentro.sort(function (a, b) { return a - b; }); fuera.sort(function (a, b) { return a - b; });
  if (!dentro.length || !fuera.length) return NaN;
  return dentro[dentro.length >> 1] - fuera[fuera.length >> 1];
}

/* ── Recorte PGM, tope común ─────────────────────────────────────────────── */
var CORTE = 65;
function recorte(datos) {
  var h = CORTE >> 1, out = new Float32Array(CORTE * CORTE);
  for (var y = 0; y < CORTE; y++) for (var x = 0; x < CORTE; x++) {
    var px = Math.round(nuc[0]) - h + x, py = Math.round(nuc[1]) - h + y;
    out[y * CORTE + x] = (px >= 0 && px < F.ancho && py >= 0 && py < F.alto)
      ? datos[py * F.ancho + px] : NaN;
  }
  return out;
}
function guardarPGM(nombre, rec, tope) {
  var lin = ['P2', CORTE + ' ' + CORTE, '255'];
  var e = tope > 0 ? 255 / Math.log1p(tope) : 0;
  for (var y = 0; y < CORTE; y++) {
    var l = [];
    for (var x = 0; x < CORTE; x++) {
      var v = rec[y * CORTE + x];
      l.push((v === v && v > 0) ? Math.min(255, Math.round(Math.log1p(v) * e)) : 0);
    }
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT_DIR, nombre + '.pgm'), lin.join('\n') + '\n');
}
function guardarClases(nombre, clase) {
  // 0=dato → 60, 1=NaN original → 255, 2=reconstruido → 160, 3=protegido → 0
  var NIV = [60, 255, 160, 0], lin = ['P2', CORTE + ' ' + CORTE, '255'];
  var h = CORTE >> 1;
  for (var y = 0; y < CORTE; y++) {
    var l = [];
    for (var x = 0; x < CORTE; x++) {
      var px = Math.round(nuc[0]) - h + x, py = Math.round(nuc[1]) - h + y;
      l.push((px >= 0 && px < F.ancho && py >= 0 && py < F.alto) ? NIV[clase[py * F.ancho + px]] : 0);
    }
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT_DIR, nombre + '.pgm'), lin.join('\n') + '\n');
}

/* ── Variantes ───────────────────────────────────────────────────────────── */
var VARIANTES = [{ nombre: 'sin-quitar', datos: F.datos, clase: null }];
[0, 1, 2, 3, 5].forEach(function (rp) {
  var q = quitarVariante(F.datos, F.ancho, F.alto, enPx, rp, 'plano');
  VARIANTES.push({ nombre: 'plano-prot' + rp, datos: q.out, clase: q.clase, rProt: rp, relleno: 'plano' });
});
[0, Math.round(PS1.nucleoPx * esc * 100) / 100, 5].forEach(function (rp) {
  var q = quitarVariante(F.datos, F.ancho, F.alto, enPx, rp, 'isofota');
  VARIANTES.push({ nombre: 'isofota-prot' + rp, datos: q.out, clase: q.clase, rProt: rp, relleno: 'isofota' });
});
// producción exacta (= plano-prot2.33, ya verificado, pero con su clase)
var qProd = quitarVariante(F.datos, F.ancho, F.alto, enPx, PS1.nucleoPx * esc, 'plano');
VARIANTES.splice(1, 0, { nombre: 'produccion', datos: qProd.out, clase: qProd.clase,
                         rProt: PS1.nucleoPx * esc, relleno: 'plano' });

// tope común de TODOS los recortes: referencia fija
var tope = 0;
VARIANTES.forEach(function (v) {
  var r = recorte(v.datos);
  for (var i = 0; i < r.length; i++) if (r[i] === r[i] && r[i] > tope) tope = r[i];
});

/* ── Medida por variante ─────────────────────────────────────────────────── */
/* La métrica del anillo es el DÉFICIT contra el parche sin quitar (referencia
   fija, mismas unidades): déficit(r) = 1 − mediana_variante/mediana_referencia.
   Un mínimo radial «global» no vale aquí: la galaxia cae más deprisa hacia
   fuera que el fondo de la meseta, así que el anillo es una depresión RESPECTO
   AL PERFIL, no respecto a los anillos exteriores. */
var P_REF = perfil(F.datos, null);
function deficitDe(P) {
  var peor = null, nAnillos = 0;
  for (var a = 0; a < RMAX; a++) {
    var d = 1 - P[a].med / P_REF[a].med;
    if (!isFinite(d)) continue;
    if (d > 0.10) nAnillos++;
    if (!peor || d > peor.d) peor = { r: a + 0.5, d: d };
  }
  return { peor: peor, nAnillos: nAnillos };
}
var resumenFinal = [];
VARIANTES.forEach(function (v) {
  var P = perfil(v.datos, v.clase);
  console.log('\n── ' + v.nombre + (v.rProt != null ? '  (protección ' + f(v.rProt, 2) +
    '″, relleno ' + v.relleno + ')' : '') + ' ──  [DN]');
  fila(['  r (″)', 'n', 'min', 'mediana', 'max', 'déficit %', 'acum', 'dato/NaN/rec/prot']);
  P.forEach(function (an, a) {
    var d = 1 - an.med / P_REF[a].med;
    fila(['  ' + an.r + '–' + (an.r + 1), '' + an.n, f(an.min, 0), f(an.med, 0), f(an.max, 0),
      f(100 * d, 1), f(an.acum / 1e6, 2) + 'e6', an.clases.join('/')]);
  });
  var min = minimoRadial(P), centro = P[0].med;
  var def = deficitDe(P);
  console.log('  mínimo radial global 0–20″: ' + (min ? 'r≈' + f(min.r, 1) + '″, prof. ' +
    f(min.prof, 0) + ' DN (vs centro ' + f(centro - min.med, 0) + ')' : 'no hay (perfil monótono)'));
  console.log('  déficit máximo vs sin-quitar: ' + (def.peor ? f(100 * def.peor.d, 1) + ' % en r≈' +
    f(def.peor.r, 1) + '″ · anillos con déficit >10 %: ' + def.nAnillos : '—'));
  console.log('  flujo acumulado 0–20″: ' + f(P[RMAX - 1].acum / 1e6, 3) + 'e6 DN·px  (déficit ' +
    f(100 * (1 - P[RMAX - 1].acum / P_REF[RMAX - 1].acum), 1) + ' %)');
  var resid = cerca.map(function (e) {
    return 'G' + f(e.g, 1) + '@' + f(Math.hypot(e.x - nuc[0], e.y - nuc[1]) * esc, 1) + '″: ' +
      f(residuoEstrella(v.datos, e), 0);
  });
  console.log('  residuo estrella (disco−anillo, DN): ' + resid.join('  ·  '));
  guardarPGM(v.nombre, recorte(v.datos), tope);
  if (v.clase) guardarClases('clases_' + v.nombre, v.clase);
  resumenFinal.push({ v: v, def: def, acum: P[RMAX - 1].acum });
});

/* ── Anclaje: cuánto mueve cada variante el factor k (informativo) ───────── */
console.log('\n── Factor de anclaje por variante (mismo catálogo; solo cambia la suma) ──');
VARIANTES.forEach(function (v) {
  if (!v.clase) return;
  var anc = R.ps1AnclarACatalogo(v.datos, F.ancho, F.alto, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec, ladoArcmin: gal.ladoArcmin, escalaAs: esc
  });
  // k implícito: valor anclado / DN neto en el píxel más brillante del recorte
  var jMax = -1, vMax = -1;
  for (var y = 0; y < F.alto; y++) for (var x = 0; x < F.ancho; x++) {
    var j = y * F.ancho + x;
    if (v.datos[j] === v.datos[j] && v.datos[j] > vMax) { vMax = v.datos[j]; jMax = j; }
  }
  console.log('  ' + v.nombre + ': anclado(max)/DN(max) = ' + (anc[jMax] / vMax).toExponential(3));
});

/* ── Independencia de apertura ───────────────────────────────────────────── */
console.log('\n── Independencia de apertura ──');
console.log('  ps1QuitarEstrellas corre ANTES de la PSF y no recibe D: la máscara es');
console.log('  idéntica por construcción. Lo único que cambia con D es el suavizado');
console.log('  posterior. Profundidad del mínimo tras ps1PsfParche:');
console.log('  Déficit máximo vs la referencia convolucionada con la MISMA D:');
fila(['  variante', 'sin PSF', '200 mm', '450 mm']);
['produccion', 'plano-prot5', 'isofota-prot0'].forEach(function (nom) {
  var v = null;
  VARIANTES.forEach(function (w) { if (w.nombre === nom) v = w; });
  var celdas = ['  ' + nom];
  [null, 200, 450].forEach(function (D) {
    var dat = D ? R.ps1PsfParche(v.datos, F.ancho, F.alto, esc, D) : v.datos;
    var ref = D ? perfil(R.ps1PsfParche(F.datos, F.ancho, F.alto, esc, D), null) : P_REF;
    var P = perfil(dat, null), peor = null;
    for (var a = 0; a < RMAX; a++) {
      var d = 1 - P[a].med / ref[a].med;
      if (isFinite(d) && (!peor || d > peor.d)) peor = { r: a + 0.5, d: d };
    }
    celdas.push(peor ? f(100 * peor.d, 1) + ' % @ r=' + f(peor.r, 1) + '″' : '—');
  });
  fila(celdas);
});

/* ── Resumen de decisión ─────────────────────────────────────────────────── */
console.log('\n═══ Resumen: déficit contra el parche sin quitar (referencia fija) ═══');
fila(['  variante', 'prot (″)', 'relleno', 'déficit máx.', 'anillos >10 %', 'déficit flujo 0–20″']);
resumenFinal.forEach(function (r) {
  var d = r.def.peor;
  fila(['  ' + r.v.nombre, r.v.rProt != null ? f(r.v.rProt, 2) : '—', r.v.relleno || '—',
    d ? f(100 * d.d, 1) + ' % @ r=' + f(d.r, 1) + '″' : '—', '' + r.def.nAnillos,
    f(100 * (1 - r.acum / P_REF[RMAX - 1].acum), 1) + ' %']);
});
console.log('\n  Recortes (tope común log1p, ' + f(tope, 0) + ' DN) y mapas de clases en ' + OUT_DIR);
console.log('  producción intacta: resources/js sin tocar; réplica verificada bit a bit.');
}
