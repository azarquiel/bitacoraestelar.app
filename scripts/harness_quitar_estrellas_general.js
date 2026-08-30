#!/usr/bin/env node
/* HARNESS HISTÓRICO — SUPERADO (ago-2026). Validó la regla nuclear por fuente,
   que después evolucionó a la protección de ESCENA (`geo.escena`,
   ps1EscenaEnParche): ahora se conserva TODO lo proyectado dentro de la unión
   de elipses isofotales de los componentes catalogados, no solo el núcleo. La
   comparación B de abajo (producción con geo ≡ candidato) ya no cuadra:
   producción sin `escena` no protege nada. La validación vigente vive en
   scripts/harness_escena_quitar_estrellas.js y scripts/test_quitar_estrellas.js.

   HARNESS: validación general del algoritmo candidato para ps1QuitarEstrellas.

   Algoritmo candidato (regla geométrica, sin constantes físicas nuevas):
     - una fuente de Gaia es NUCLEAR si su máscara cubre el centro de la
       galaxia: dist(fuente, núcleo) < radio de máscara de la fuente;
     - las fuentes nucleares se PROTEGEN (su disco no se toca);
     - el resto de máscaras se reconstruye por ISOFOTAS elípticas (b/a y PA
       del catálogo);
     - los NaN originales de PS1 fuera de máscara no se tocan.
   Todo derivado de la geometría fuente/núcleo y del radio de máscara: no
   depende del tamaño del parche ni de la resolución.

   Galaxias: M104, M51, M81, M101, NGC 205 — parches reales a 1024 px.
   Por galaxia:
     - fuentes Gaia <15″ del núcleo, clasificadas nuclear/superpuesta;
     - variantes: producción (réplica verificada bit a bit), protección por
       RADIO de 0 / 2,33 / 5″ / radio-de-máscara, relleno plano vs isofotas,
       y el candidato por FUENTE;
     - déficit máximo y de flujo 0–20″ contra el parche sin quitar
       (referencia fija, DN del stack), déficit del núcleo (0–2″),
       discontinuidad máxima entre anillos vecinos (salto en el borde de la
       máscara), residuo de cada estrella (¿se elimina? ¿se reintroduce?),
       y píxeles protegidos por accidente en máscaras NO nucleares.

   La apertura no se re-mide: ps1QuitarEstrellas corre antes de la PSF y no
   recibe D — la máscara es idéntica por construcción (medido en
   harness_m104_quitar_estrellas.js).

   NO toca producción. NO evalúa bilineal.
   Uso:  node scripts/harness_quitar_estrellas_general.js */
'use strict';

var fs = require('fs'), path = require('path');
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var PS1 = window.BitacoraPS1.cfg;
var B = require('./lib_bajar_parche.js')(R);
require('../simulador_ocular/resources/js/galaxias-datos.js');

var OUT_DIR = path.join(__dirname, '..', '.scratch', 'quitar-general');
fs.mkdirSync(OUT_DIR, { recursive: true });

var GALAXIAS = [
  { ngc: 'NGC 4594', alias: 'M104', csv: 'gaia_ngc4594.csv' },
  { ngc: 'NGC 5194', alias: 'M51',  csv: 'gaia_ngc5194.csv' },
  { ngc: 'NGC 3031', alias: 'M81',  csv: 'gaia_ngc3031.csv' },
  { ngc: 'NGC 5457', alias: 'M101', csv: 'gaia_ngc5457.csv' },
  { ngc: 'NGC 205',  alias: 'NGC205', csv: 'gaia_ngc205.csv' }
];

var RMAX = 20, CORTE = 65;

function f(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 2 : d); }
function fila(c) { console.log(c.join(' | ')); }
function mediana(m) {
  if (!m.length) return NaN;
  m.sort(function (a, b) { return a - b; });
  return m[m.length >> 1];
}

// Copia de ps1FondoAlrededor (no exportada), verificada bit a bit vía la
// réplica de producción de cada galaxia.
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
    if (m.length >= 8) return mediana(m);
  }
  return null;
}

/* ═══ Análisis de una galaxia ═══ */
function analizar(G, filaCat) {
  var gal = {
    nombre: filaCat[0], ra: filaCat[2], dec: filaCat[3], reArcsec: filaCat[4],
    ba: filaCat[5], pa: filaCat[6], magV: filaCat[7], n: filaCat[8], bt: filaCat[9],
    ladoArcmin: window.BitacoraPS1.ps1LadoArcmin(filaCat[4])
  };
  var estrellas = fs.readFileSync(path.join(OUT_DIR, G.csv), 'utf8')
    .trim().split('\n').slice(1).map(function (l) {
      var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])];
    }).filter(function (e) { return isFinite(e[2]); });

  return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, PS1.salida).then(function (F) {
    var esc = F.escalaAs;
    var nuc = [(F.ancho - 1) / 2, (F.alto - 1) / 2];   // bajar() recorta centrado en el núcleo
    console.log('\n\n═══════ ' + G.alias + ' (' + gal.nombre + ') · ' + F.ancho + '×' + F.alto +
      ' px · ' + f(esc, 3) + '″/px · lado ' + f(gal.ladoArcmin, 1) + '′ · ' +
      estrellas.length + ' fuentes Gaia G≤20 ═══════');

    var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: esc, wcs: F.wcs || null };
    fSim.afin = window.BitacoraPS1.ps1AfinParche(fSim, gal);
    var enPx = window.BitacoraPS1.ps1EstrellasEnPixeles(fSim, gal, estrellas);

    /* ── Fuentes <15″: nuclear si su máscara cubre el centro (d < rAs) ────── */
    console.log('\n── Fuentes Gaia a <15″ del núcleo ──');
    fila(['  offset (″)', 'G', 'máscara (″)', 'clasificación']);
    var cerca = [], nucleares = [];
    enPx.forEach(function (e) {
      e.dAs = Math.hypot(e.x - nuc[0], e.y - nuc[1]) * esc;
      e.nuclear = e.dAs < e.rAs;      // la máscara invade el núcleo
      if (e.dAs < 15) {
        cerca.push(e);
        fila(['  ' + f(e.dAs, 1), f(e.g, 2), f(e.rAs, 1),
          e.nuclear ? 'NUCLEAR (máscara cubre el centro)' : 'superpuesta']);
      }
      if (e.nuclear) nucleares.push(e);
    });
    if (!cerca.length) console.log('  (ninguna)');
    var rMaskNuc = 0;
    nucleares.forEach(function (e) { rMaskNuc = Math.max(rMaskNuc, e.rAs); });
    console.log('  fuentes nucleares: ' + nucleares.length +
      (nucleares.length ? ' · radio de máscara nuclear máx: ' + f(rMaskNuc, 1) + '″' : ''));

    /* ── Geometría de isofotas (b/a, PA del catálogo), por el AFÍN inverso:
       la misma convención que producción (+norte = +y sin WCS). ───────────── */
    var paRad = gal.pa * Math.PI / 180, sinPA = Math.sin(paRad), cosPA = Math.cos(paRad);
    var AF = fSim.afin;
    function radioElip(x, y) {
      var dx = x - AF.cx, dy = y - AF.cy;
      var este = AF.ex * dx + AF.ey * dy, norte = AF.nx * dx + AF.ny * dy;
      var u = este * sinPA + norte * cosPA;
      var v = -este * cosPA + norte * sinPA;
      return Math.hypot(u, v / (gal.ba > 0 ? gal.ba : 1));
    }
    function tablaIsofotas(datos, mascara) {
      var bandas = [];
      for (var y = 0; y < F.alto; y++) for (var x = 0; x < F.ancho; x++) {
        var j = y * F.ancho + x;
        if (mascara[j]) continue;
        var v = datos[j];
        if (v !== v) continue;
        var b = Math.round(radioElip(x, y) / esc);
        (bandas[b] || (bandas[b] = [])).push(v);
      }
      return bandas.map(function (m) { return (m && m.length >= 8) ? mediana(m) : null; });
    }

    /* ── Réplica parametrizada. opts:
         modo 'radio': protege píxeles a <rProtAs del núcleo (producción = radio
                       nucleoPx·esc + relleno plano);
         modo 'fuente': protege el disco entero de cada fuente NUCLEAR (regla
                       candidata; las máscaras no nucleares mandan si solapan).
       clase: 0=dato, 1=NaN original, 2=reconstruido, 3=protegido. ─────────── */
    function quitar(lista, opts) {
      var mascara = new Uint8Array(F.datos.length), clase = new Uint8Array(F.datos.length);
      var i, e, x, y, j;
      var rProtPx = (opts.rProtAs || 0) / esc;
      for (i = 0; i < F.datos.length; i++) if (!(F.datos[i] === F.datos[i])) clase[i] = 1;
      for (i = 0; i < lista.length; i++) {
        e = lista[i];
        if (opts.modo === 'fuente' && e.nuclear) continue;   // su disco se marca luego
        var r = Math.max(1, e.rPx), r2 = r * r;
        for (y = Math.max(0, Math.floor(e.y - r)); y <= Math.min(F.alto - 1, Math.ceil(e.y + r)); y++) {
          for (x = Math.max(0, Math.floor(e.x - r)); x <= Math.min(F.ancho - 1, Math.ceil(e.x + r)); x++) {
            var dx = x - e.x, dy = y - e.y;
            if (dx * dx + dy * dy > r2) continue;
            if (opts.modo === 'radio') {
              var nx = x - nuc[0], ny = y - nuc[1];
              if (nx * nx + ny * ny <= rProtPx * rProtPx) { clase[y * F.ancho + x] = 3; continue; }
            }
            mascara[y * F.ancho + x] = 1;
          }
        }
      }
      if (opts.modo === 'fuente') {
        for (i = 0; i < lista.length; i++) {
          e = lista[i];
          if (!e.nuclear) continue;
          var rn = Math.max(1, e.rPx), rn2 = rn * rn;
          for (y = Math.max(0, Math.floor(e.y - rn)); y <= Math.min(F.alto - 1, Math.ceil(e.y + rn)); y++) {
            for (x = Math.max(0, Math.floor(e.x - rn)); x <= Math.min(F.ancho - 1, Math.ceil(e.x + rn)); x++) {
              var fx = x - e.x, fy = y - e.y;
              if (fx * fx + fy * fy > rn2) continue;
              j = y * F.ancho + x;
              if (!mascara[j]) clase[j] = 3;   // máscara no nuclear solapada manda
            }
          }
        }
      }
      var out = Float32Array.from(F.datos);
      var isofotas = (opts.relleno === 'isofota') ? tablaIsofotas(F.datos, mascara) : null;
      var cieloP = null;
      for (i = 0; i < lista.length; i++) {
        e = lista[i];
        if (opts.modo === 'fuente' && e.nuclear) continue;
        var rE = Math.max(1, e.rPx), fondo = null;
        // El disco ancho se deja al cielo con CUALQUIER relleno: es la
        // arquitectura medida (anclaje lo apaga, el perfil lo rellena), y así
        // la producción nueva y el candidato son comparables bit a bit.
        if (e.rAs > PS1.rellenoPlanoMaxAs) {
          if (cieloP == null) cieloP = window.BitacoraPS1.ps1Cielo(F.datos, F.ancho, F.alto);
          fondo = cieloP;
        } else if (opts.relleno === 'plano') {
          fondo = fondoAlrededor(F.datos, mascara, F.ancho, F.alto, e.x, e.y, rE);
          if (fondo == null) continue;
        }
        var rE2 = rE * rE;
        for (y = Math.max(0, Math.floor(e.y - rE)); y <= Math.min(F.alto - 1, Math.ceil(e.y + rE)); y++) {
          for (x = Math.max(0, Math.floor(e.x - rE)); x <= Math.min(F.ancho - 1, Math.ceil(e.x + rE)); x++) {
            var ex = x - e.x, ey = y - e.y;
            if (ex * ex + ey * ey > rE2) continue;
            j = y * F.ancho + x;
            if (!mascara[j]) continue;
            var v = fondo;
            if (v == null && opts.relleno === 'isofota') {
              var b = Math.round(radioElip(x, y) / esc);
              v = isofotas[b];
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

    /* ── Verificación de la réplica contra producción ───────────────────────
       A) sin `geo`: la vía vieja (sin protección, relleno plano) ≡ plano-prot0.
       B) con `geo`: la producción nueva ≡ variante candidato, bit a bit. ──── */
    function compara(nombre, real, mio) {
      var dMaxRep = 0, nDist = 0;
      for (var i = 0; i < real.length; i++) {
        var a = real[i], b = mio[i];
        if ((a === a) !== (b === b)) { nDist++; continue; }
        if (a === a && Math.abs(a - b) > dMaxRep) dMaxRep = Math.abs(a - b);
      }
      console.log('  ' + nombre + ': finitud distinta ' + nDist + ' px · Δmax ' + dMaxRep +
        (nDist || dMaxRep > 0 ? '  ✗ NO COINCIDE — ABORTO' : '  ✓ bit a bit'));
      if (nDist || dMaxRep > 0) process.exit(1);
    }
    compara('producción sin geo vs réplica plano-prot0',
      window.BitacoraPS1.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx),
      quitar(enPx, { modo: 'radio', rProtAs: 0, relleno: 'plano' }).out);
    compara('producción con geo vs candidato (por fuente + isofotas)',
      window.BitacoraPS1.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx,
        { afin: fSim.afin, ba: gal.ba, pa: gal.pa }),
      quitar(enPx, { modo: 'fuente', relleno: 'isofota' }).out);

    /* ── Perfil radial 0–20″ (anillos de 1″) y métricas contra referencia ─── */
    function perfil(datos, clase) {
      var anillos = [], cl = [];
      for (var a = 0; a < RMAX; a++) { anillos.push([]); cl.push([0, 0, 0, 0]); }
      var rMaxPx = RMAX / esc;
      var y0 = Math.max(0, Math.floor(nuc[1] - rMaxPx)), y1 = Math.min(F.alto - 1, Math.ceil(nuc[1] + rMaxPx));
      var x0 = Math.max(0, Math.floor(nuc[0] - rMaxPx)), x1 = Math.min(F.ancho - 1, Math.ceil(nuc[0] + rMaxPx));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var rAs = Math.hypot(x - nuc[0], y - nuc[1]) * esc;
        if (rAs >= RMAX) continue;
        var j = y * F.ancho + x, a2 = Math.floor(rAs);
        cl[a2][clase ? clase[j] : 0]++;
        var v = datos[j];
        if (v === v) anillos[a2].push(v);
      }
      var out = [], acum = 0;
      for (a = 0; a < RMAX; a++) {
        var m = anillos[a].sort(function (u, w) { return u - w; });
        var s = 0; for (var k = 0; k < m.length; k++) s += m[k];
        var media = m.length ? s / m.length : NaN;
        var area = Math.PI * (2 * a + 1) / (esc * esc);
        if (isFinite(media)) acum += media * area;
        out.push({ r: a, n: m.length, med: m.length ? m[m.length >> 1] : NaN,
                   acum: acum, clases: cl[a] });
      }
      return out;
    }
    var P_REF = perfil(F.datos, null);

    function medir(P) {
      var peor = null, nAnillos = 0, defNuc = -Infinity, discont = 0, dAnt = null;
      for (var a = 0; a < RMAX; a++) {
        var d = 1 - P[a].med / P_REF[a].med;
        if (!isFinite(d)) { dAnt = null; continue; }
        if (d > 0.10) nAnillos++;
        if (!peor || d > peor.d) peor = { r: a + 0.5, d: d };
        if (a < 2) defNuc = Math.max(defNuc, d);
        if (dAnt != null) discont = Math.max(discont, Math.abs(d - dAnt));
        dAnt = d;
      }
      return { peor: peor, nAnillos: nAnillos, defNuc: defNuc, discont: discont,
               defFlujo: 1 - P[RMAX - 1].acum / P_REF[RMAX - 1].acum };
    }
    function residuoEstrella(datos, e) {
      var dentro = [], fuera = [], rr = Math.max(1, e.rPx), lim = Math.ceil(rr * 1.6);
      for (var dy = -lim; dy <= lim; dy++) for (var dx = -lim; dx <= lim; dx++) {
        var x = Math.round(e.x + dx), y = Math.round(e.y + dy);
        if (x < 0 || y < 0 || x >= F.ancho || y >= F.alto) continue;
        var d = Math.hypot(x - e.x, y - e.y), v = datos[y * F.ancho + x];
        if (v !== v) continue;
        if (d <= rr) dentro.push(v); else if (d <= rr * 1.6) fuera.push(v);
      }
      return mediana(dentro) - mediana(fuera);
    }
    // píxeles protegidos (clase 3) dentro del disco de máscara de una fuente
    function protegidosEn(clase, e) {
      var n = 0, rr = Math.max(1, e.rPx), rr2 = rr * rr;
      for (var y = Math.max(0, Math.floor(e.y - rr)); y <= Math.min(F.alto - 1, Math.ceil(e.y + rr)); y++)
        for (var x = Math.max(0, Math.floor(e.x - rr)); x <= Math.min(F.ancho - 1, Math.ceil(e.x + rr)); x++) {
          var dx = x - e.x, dy = y - e.y;
          if (dx * dx + dy * dy > rr2) continue;
          if (clase[y * F.ancho + x] === 3) n++;
        }
      return n;
    }

    /* ── Variantes ────────────────────────────────────────────────────────── */
    var protMask = rMaskNuc;   // 0 si no hay fuente nuclear
    var VARIANTES = [
      // 3 px = el nucleoPx que había en producción hasta ago-2026
      { nombre: 'antes',            modo: 'radio',  rProtAs: 3 * esc,  relleno: 'plano' },
      { nombre: 'plano-protMask',   modo: 'radio',  rProtAs: protMask, relleno: 'plano' },
      { nombre: 'isofota-prot0',    modo: 'radio',  rProtAs: 0,        relleno: 'isofota' },
      { nombre: 'isofota-prot2.33', modo: 'radio',  rProtAs: 2.33,     relleno: 'isofota' },
      { nombre: 'isofota-prot5',    modo: 'radio',  rProtAs: 5,        relleno: 'isofota' },
      { nombre: 'isofota-protMask', modo: 'radio',  rProtAs: protMask, relleno: 'isofota' },
      { nombre: 'candidato',        modo: 'fuente', rProtAs: null,     relleno: 'isofota' }
    ];
    VARIANTES.forEach(function (v) { var q = quitar(enPx, v); v.datos = q.out; v.clase = q.clase; });
    VARIANTES.unshift({ nombre: 'sin-quitar', datos: F.datos, clase: null });

    /* ── Recortes PGM, tope común por galaxia ─────────────────────────────── */
    function recorte(datos) {
      var h = CORTE >> 1, out = new Float32Array(CORTE * CORTE);
      for (var y = 0; y < CORTE; y++) for (var x = 0; x < CORTE; x++) {
        var px = Math.round(nuc[0]) - h + x, py = Math.round(nuc[1]) - h + y;
        out[y * CORTE + x] = (px >= 0 && px < F.ancho && py >= 0 && py < F.alto)
          ? datos[py * F.ancho + px] : NaN;
      }
      return out;
    }
    var tope = 0;
    VARIANTES.forEach(function (v) {
      var r = recorte(v.datos);
      for (var i = 0; i < r.length; i++) if (r[i] === r[i] && r[i] > tope) tope = r[i];
    });
    function guardarPGM(nombre, rec, esClase) {
      var lin = ['P2', CORTE + ' ' + CORTE, '255'];
      var e = tope > 0 ? 255 / Math.log1p(tope) : 0, NIV = [60, 255, 160, 0];
      for (var y = 0; y < CORTE; y++) {
        var l = [];
        for (var x = 0; x < CORTE; x++) {
          var v = rec[y * CORTE + x];
          l.push(esClase ? NIV[v] : ((v === v && v > 0) ? Math.min(255, Math.round(Math.log1p(v) * e)) : 0));
        }
        lin.push(l.join(' '));
      }
      fs.writeFileSync(path.join(OUT_DIR, nombre + '.pgm'), lin.join('\n') + '\n');
    }

    /* ── Medidas ──────────────────────────────────────────────────────────── */
    var resumen = [];
    VARIANTES.forEach(function (v) {
      var P = perfil(v.datos, v.clase);
      var M = medir(P);
      if (v.nombre === 'antes' || v.nombre === 'candidato') {
        console.log('\n  ── perfil ' + v.nombre + ' ──');
        fila(['    r (″)', 'mediana', 'déficit %', 'dato/NaN/rec/prot']);
        P.forEach(function (an, a) {
          fila(['    ' + an.r + '–' + (an.r + 1), f(an.med, 0),
            f(100 * (1 - an.med / P_REF[a].med), 1), an.clases.join('/')]);
        });
      }
      var residuos = cerca.map(function (e) {
        return (e.nuclear ? 'NUC ' : '') + 'G' + f(e.g, 1) + '@' + f(e.dAs, 1) + '″: ' +
          f(residuoEstrella(v.datos, e), 0);
      });
      var protAccidental = 0;
      if (v.clase) cerca.forEach(function (e) { if (!e.nuclear) protAccidental += protegidosEn(v.clase, e); });
      guardarPGM(G.alias + '_' + v.nombre, recorte(v.datos), false);
      if (v.clase) {
        var h = CORTE >> 1, rc = new Uint8Array(CORTE * CORTE);
        for (var y = 0; y < CORTE; y++) for (var x = 0; x < CORTE; x++) {
          var px = Math.round(nuc[0]) - h + x, py = Math.round(nuc[1]) - h + y;
          rc[y * CORTE + x] = (px >= 0 && px < F.ancho && py >= 0 && py < F.alto)
            ? v.clase[py * F.ancho + px] : 0;
        }
        guardarPGM(G.alias + '_clases_' + v.nombre, rc, true);
      }
      resumen.push({ v: v, M: M, residuos: residuos, protAccidental: protAccidental });
    });

    console.log('\n  ── resumen ' + G.alias + ' (déficit contra sin-quitar, referencia fija) ──');
    fila(['    variante', 'déficit máx.', 'núcleo 0–2″', 'discont. máx.', 'flujo 0–20″', 'prot. accidental (px)']);
    resumen.forEach(function (r) {
      var d = r.M.peor;
      fila(['    ' + r.v.nombre, d ? f(100 * d.d, 1) + ' % @ ' + f(d.r, 1) + '″' : '—',
        isFinite(r.M.defNuc) ? f(100 * r.M.defNuc, 1) + ' %' : '—',
        f(100 * r.M.discont, 1) + ' pt', f(100 * r.M.defFlujo, 1) + ' %',
        r.v.clase ? '' + r.protAccidental : '—']);
    });
    console.log('  residuos de estrella (disco−anillo, DN) por variante:');
    resumen.forEach(function (r) {
      if (r.residuos.length) console.log('    ' + r.v.nombre + ':  ' + r.residuos.join('  ·  '));
    });

    var rc = null;
    resumen.forEach(function (r) { if (r.v.nombre === 'candidato') rc = r; });
    var rp = null;
    resumen.forEach(function (r) { if (r.v.nombre === 'antes') rp = r; });
    return { alias: G.alias, nucleares: nucleares.length, rMaskNuc: rMaskNuc,
             prod: rp.M, cand: rc.M, protAccidental: rc.protAccidental,
             residuosCand: rc.residuos, residuosRef: resumen[0].residuos };
  });
}

/* ═══ Bucle y tabla final ═══ */
var CAT = global.window.BITACORA_GALAXIAS;
var cadena = Promise.resolve(), finales = [];
GALAXIAS.forEach(function (G) {
  cadena = cadena.then(function () {
    var filaCat = null;
    for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === G.ngc) filaCat = CAT[i];
    if (!filaCat) { console.log('\n' + G.ngc + ': no está en el catálogo, se salta.'); return; }
    return analizar(G, filaCat).then(function (r) { finales.push(r); })
      .catch(function (e) { console.log('\n' + G.alias + ': FALLO — ' + e.message); });
  });
});
cadena.then(function () {
  console.log('\n\n═══════ TABLA FINAL: producción vs candidato (por fuente + isofotas) ═══════');
  fila(['  galaxia', 'nucleares', 'máscara nuc.', 'déficit máx. antes', 'déficit máx. cand',
        'núcleo cand', 'discont. cand', 'flujo cand', 'prot. accidental']);
  finales.forEach(function (r) {
    fila(['  ' + r.alias, '' + r.nucleares, r.rMaskNuc ? f(r.rMaskNuc, 1) + '″' : '—',
      r.prod.peor ? f(100 * r.prod.peor.d, 1) + ' %' : '—',
      r.cand.peor ? f(100 * r.cand.peor.d, 1) + ' %' : '—',
      isFinite(r.cand.defNuc) ? f(100 * r.cand.defNuc, 1) + ' %' : '—',
      f(100 * r.cand.discont, 1) + ' pt', f(100 * r.cand.defFlujo, 1) + ' %',
      '' + r.protAccidental + ' px']);
  });
  console.log('\n  Recortes y mapas de clase en ' + OUT_DIR);
  console.log('  Producción intacta; réplica verificada bit a bit en cada galaxia.');
});
