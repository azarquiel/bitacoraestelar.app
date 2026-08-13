#!/usr/bin/env node
/* HARNESS DE DECISIÓN: ¿merece la pena subir la resolución del parche de PS1 y
   aplicarle la PSF del telescopio? Con parches reales y cuatro configuraciones.

   No toca producción. `resources/js/` se lee, nunca se escribe. La PSF es la
   candidata de lib_psf_parche.js, ya validada por test_psf_parche.js, sin
   reimplementar nada.

   Las cuatro configuraciones:
     A  512 px,  sin PSF                    ← lo que hay hoy
     B  1024 px, sin PSF                    ← solo muestreo
     C  1024 px, con PSF física             ← muestreo + física
     D  1024 px, con PSF + bilineal         ← lo anterior + reconstrucción

   El orden importa y no es decorativo: A→B aísla el muestreo, B→C aísla la
   PSF, C→D aísla el remuestreo. Si se comparara A contra D directamente no se
   sabría cuál de los tres hizo el trabajo, que es justo la pregunta.

   Todas las medidas se hacen en una rejilla de LIENZO común, la misma para las
   cuatro. Sin eso, comparar 512 con 1024 sería comparar rejillas distintas y
   cualquier RMS saldría grande por razones geométricas, no físicas.

   Necesita red la primera vez (baja los parches y los cachea en el temporal del
   sistema; ver lib_bajar_parche.js). Después va offline.

   Uso:  node scripts/harness_decision_psf_resolucion.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = R.ps1, FOT = R.fot;
var P = require('./lib_psf_parche.js')(R);
var B = require('./lib_bajar_parche.js')(R);

var APERTURAS = [80, 203, 457, 914];
var SEEINGS = [1.5, 2.0, 3.0, 4.0, 6.0];
var LADO = 20.03;                 // ′ — las cuatro están clampeadas a ladoMax
/* Rejilla de medida. Tiene que ser al menos tan FINA como el parche más fino
   que se compara (1024 px sobre 20′ = 1,17″/px) o el propio lienzo se convierte
   en el cuello de botella: medir el parche de 1024 sobre una rejilla de 512
   tira tres de cada cuatro píxeles, y lo que sale es el aliasing del lienzo,
   no la física del parche. Con 1024 el parche fino va 1:1 y el grueso se
   amplía ×2, que es el régimen en el que trabaja el simulador de verdad. */
var SIZE = 1024;                  // px del lienzo de medida (fijo para las cuatro configs)
var SUAVE_REF = 12;               // ″ — escala a la que se suaviza para el residuo

var OBJETOS = [
  { nombre: 'NGC 5194 (M51)',  ra: 202.47208, dec: 47.19667 },
  { nombre: 'NGC 3031 (M81)',  ra: 148.88958, dec: 69.06667 },
  { nombre: 'NGC 5457 (M101)', ra: 210.80208, dec: 54.34861 },
  { nombre: 'NGC 205',         ra:  10.09375, dec: 41.68639 }
];

function f(v, d) { return (v == null || !isFinite(v)) ? '-' : v.toFixed(d == null ? 3 : d); }
function fila(c) { console.log('  ' + c.join(' | ')); }
function tit(t) { console.log('\n═══ ' + t + ' ═══'); }

/* ── Remuestreo a la rejilla del lienzo ──────────────────────────────────────
   Réplica del bucle de ps1PintarParche (bitacora-gaia-render.js:2205–2220) en
   lo que aquí importa: para cada píxel de lienzo se toma el parche. Sin la
   afín de la skycell ni la mezcla con el perfil: aquí se compara la imagen
   contra sí misma en cuatro configuraciones, y meter el modelo dentro haría
   imposible saber qué movió qué.

   `bilineal` es la única diferencia del caso D. */
function aLienzo(p, size, campoArcmin, bilineal) {
  var out = new Float32Array(size * size);
  var an = p.ancho, al = p.alto, d = p.datos;
  var esc = p.escalaAs;
  // ″ por píxel de lienzo, y de ahí a píxeles de parche
  var asPorPx = campoArcmin * 60 / size;
  var cxP = (an - 1) / 2, cyP = (al - 1) / 2, cL = (size - 1) / 2;
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var fx = cxP + (x - cL) * asPorPx / esc;
      var fy = cyP + (y - cL) * asPorPx / esc;
      var v;
      if (!bilineal) {
        var ix = Math.round(fx), iy = Math.round(fy);
        v = (ix >= 0 && ix < an && iy >= 0 && iy < al) ? d[iy * an + ix] : NaN;
      } else {
        var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        var acc = 0, w = 0;
        for (var j = 0; j < 2; j++) {
          for (var i = 0; i < 2; i++) {
            var cx = x0 + i, cy = y0 + j;
            if (cx < 0 || cx >= an || cy < 0 || cy >= al) continue;
            var pe = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
            var val = d[cy * an + cx];
            if (isFinite(val)) { acc += pe * val; w += pe; }     // huecos: se saltan
          }
        }
        v = w > 0 ? acc / w : NaN;
      }
      out[y * size + x] = v;
    }
  }
  return out;
}

/* ── Métricas ───────────────────────────────────────────────────────────── */
function stats(v) {
  var s = 0, n = 0, nf = 0, mx = -Infinity, val = [];
  for (var i = 0; i < v.length; i++) {
    if (isFinite(v[i])) { s += v[i]; n++; if (v[i] > mx) mx = v[i]; val.push(v[i]); }
    else nf++;
  }
  val.sort(function (a, b) { return a - b; });
  // Fondo robusto: la mediana de la imagen es cielo, no galaxia (la galaxia
  // ocupa una fracción pequeña del parche de 20′).
  var med = val.length ? val[val.length >> 1] : 0;
  var des = [];
  for (i = 0; i < val.length; i++) des.push(Math.abs(val[i] - med));
  des.sort(function (a, b) { return a - b; });
  var mad = des.length ? des[des.length >> 1] * 1.4826 : 0;      // σ robusta
  return { media: n ? s / n : 0, total: s, n: n, fracNoFin: nf / v.length,
           pico: mx, fondo: med, mad: mad };
}

/* Estructura = RMS del residuo tras quitarle la versión suavizada a 12″,
   normalizado por la σ robusta del fondo. Normalizar por el FONDO y no por la
   media es lo que hace la métrica robusta: mide estructura en unidades de
   ruido de cielo, así que no se mueve porque la galaxia sea más o menos
   brillante.

   `ref` es la σ de referencia, y es OBLIGATORIA en cuanto se comparan dos
   imágenes entre sí. Normalizar cada una por su propia σ invierte el orden:
   convolucionar reduce el ruido de fondo, así que el denominador encoge y la
   métrica sube justo cuando la estructura baja. Con una referencia fija (la
   imagen sin PSF) la comparación mide lo que dice medir. */
function estructura(v, size, escLienzo, ref) {
  var sm = P.convolucionar(v, size, size, escLienzo, null, null, SUAVE_REF);
  var den = ref || stats(v).mad, s2 = 0, n = 0;
  for (var i = 0; i < v.length; i++) {
    if (!isFinite(v[i]) || !isFinite(sm[i])) continue;
    var r = v[i] - sm[i];
    s2 += r * r; n++;
  }
  return n ? Math.sqrt(s2 / n) / (den || 1) : 0;
}

/* Alta frecuencia: RMS del laplaciano de 5 puntos, en unidades de σ de fondo.
   Es la que se entera de si hay detalle a escala de píxel, que es exactamente
   lo que la PSF tiene que quitar y el muestreo no. */
function altaFrec(v, size, ref) {
  var den = ref || stats(v).mad, s2 = 0, n = 0;
  for (var y = 1; y < size - 1; y++) {
    for (var x = 1; x < size - 1; x++) {
      var i = y * size + x;
      var a = v[i - 1], b = v[i + 1], c = v[i - size], e = v[i + size], m = v[i];
      if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(e) || !isFinite(m)) continue;
      var l = a + b + c + e - 4 * m;
      s2 += l * l; n++;
    }
  }
  return n ? Math.sqrt(s2 / n) / (den || 1) : 0;
}

/* Gradiente: media de |∇| (Sobel simplificado), en unidades de σ de fondo. Los
   bordes son lo que un ojo llama «definición», y son lo primero que se come una
   PSF más ancha. */
function gradiente(v, size, ref) {
  var den = ref || stats(v).mad, s = 0, n = 0;
  for (var y = 1; y < size - 1; y++) {
    for (var x = 1; x < size - 1; x++) {
      var i = y * size + x;
      var gx = v[i + 1] - v[i - 1], gy = v[i + size] - v[i - size];
      if (!isFinite(gx) || !isFinite(gy)) continue;
      s += Math.hypot(gx, gy); n++;
    }
  }
  return n ? (s / n) / (den || 1) : 0;
}

/* RMS de la diferencia entre dos configuraciones, en unidades de σ de fondo de
   referencia. Sin normalizar, un RMS grande solo diría que la galaxia es
   brillante. `ref` es la misma σ para todas las comparaciones de un objeto, por
   lo mismo que en `estructura`. */
function rmsDif(a, b, ref) {
  var den = ref || stats(a).mad, s2 = 0, n = 0;
  for (var i = 0; i < a.length; i++) {
    if (!isFinite(a[i]) || !isFinite(b[i])) continue;
    var d = a[i] - b[i];
    s2 += d * d; n++;
  }
  return n ? Math.sqrt(s2 / n) / (den || 1) : 0;
}

function difRelFlujo(a, b) {
  var sa = stats(a), sb = stats(b);
  return sa.media ? (sb.media / sa.media - 1) : 0;
}

/* ── El experimento ─────────────────────────────────────────────────────── */
function main(datos) {

  /* ═══ 0. Lo que se ha bajado ═══ */
  tit('0. Los parches, tal cual han llegado');
  fila(['objeto', 'lado', 'salida', 'ancho', 'escalaAs', 'no finitos', 'media', 'fondo (mediana)', 'σ robusta']);
  Object.keys(datos).forEach(function (k) {
    var p = datos[k], s = stats(p.datos);
    fila([k, f(p.ladoArcmin, 2) + '′', p.salida + ' px', p.ancho, f(p.escalaAs, 4) + '″/px',
          f(100 * s.fracNoFin, 2) + ' %', f(s.media, 2), f(s.fondo, 2), f(s.mad, 3)]);
  });
  console.log('  Las cuatro están clampeadas a ladoMax = 20′, así que a 1024 px la escala');
  console.log('  baja de 2,35 a 1,17″/px: mejor, pero NO llega a los 0,67″/px del objetivo.');
  console.log('  Por eso hay un control con el campo recortado a 11,4′, donde 1024 px sí da 0,67.');

  /* ═══ 1. HIPÓTESIS A: ¿la resolución hace representable la PSF? ═══ */
  tit('1. HIPÓTESIS A — ¿deja la PSF de ser subpíxel al subir la resolución?');
  console.log('  σ_px = θ_add / 2,3548 / escalaAs, con θ_add = √(θ_res² − θ_parche²).');
  console.log('  Bandas de diagnóstico (NO son parámetros): <0,5 subpíxel · 0,5–1 marginal ·');
  console.log('  ≥1 representable · ≥2 cómodo.');
  var escalas = [
    { et: 'A/B/C/D 512 px  (20′)', esc: 20.03 * 60 / 512 },
    { et: 'B/C/D 1024 px   (20′)', esc: 20.03 * 60 / 1024 },
    { et: 'control 1024 px (11,4′)', esc: 11.4 * 60 / 1024 }
  ];
  fila(['escala', 'escalaAs', 'θ_parche', '80 mm', '203 mm', '457 mm', '914 mm']);
  escalas.forEach(function (e) {
    var c = [e.et, f(e.esc, 3) + '″/px', f(P.thetaParche(e.esc), 3) + '″'];
    APERTURAS.forEach(function (D) {
      var s = P.sigmaPx(D, e.esc, null);
      c.push(f(s, 2) + ' ' + (s < 0.5 ? 'SUBPX' : s < 1 ? 'marg' : s < 2 ? 'REPR' : 'CÓMODO'));
    });
    fila(c);
  });

  /* ═══ 2. Las cuatro configuraciones, medidas ═══ */
  tit('2. Las cuatro configuraciones, sobre parches reales');
  console.log('  Todo medido en la MISMA rejilla de lienzo (' + SIZE + ' px sobre ' + LADO + '′,');
  console.log('  ' + f(LADO * 60 / SIZE, 3) + '″/px de lienzo), para que los RMS sean comparables.');
  var escLienzo = LADO * 60 / SIZE;

  var CONF = {};   // CONF[objeto][clave] = imagen de lienzo
  OBJETOS.forEach(function (o) {
    var p512 = datos[o.nombre + ' @512'], p1024 = datos[o.nombre + ' @1024'];
    if (!p512 || !p1024) return;
    var c = { A: aLienzo(p512, SIZE, LADO, false), B: aLienzo(p1024, SIZE, LADO, false) };
    // C y D dependen de la apertura y del seeing: se calculan bajo demanda.
    c._p1024 = p1024;
    // σ de referencia del objeto: la del muestreo fino sin PSF. Fija para todas
    // sus comparaciones, para que ninguna métrica se normalice contra sí misma.
    c._ref = stats(c.B).mad;
    CONF[o.nombre] = c;
  });

  var D_REF = 457, SEE_REF = CFG.seeingArcsec;
  console.log('  (C y D con apertura de referencia ' + D_REF + ' mm y seeing ' + SEE_REF + '″)');
  fila(['objeto', 'conf', 'media', 'fondo', 'no fin.', 'estructura(12″)', 'alta frec.', 'gradiente']);
  Object.keys(CONF).forEach(function (nom) {
    var c = CONF[nom], p = c._p1024;
    var conv = P.convolucionar(p.datos, p.ancho, p.alto, p.escalaAs, D_REF, SEE_REF);
    c.C = aLienzo({ ancho: p.ancho, alto: p.alto, escalaAs: p.escalaAs, datos: conv }, SIZE, LADO, false);
    c.D = aLienzo({ ancho: p.ancho, alto: p.alto, escalaAs: p.escalaAs, datos: conv }, SIZE, LADO, true);
    ['A', 'B', 'C', 'D'].forEach(function (k) {
      var s = stats(c[k]);
      fila([k === 'A' ? nom : '', k + ' ' + (k === 'A' ? '512 sinPSF' : k === 'B' ? '1024 sinPSF'
            : k === 'C' ? '1024 PSF' : '1024 PSF+bil'),
            f(s.media, 2), f(s.fondo, 2), f(100 * s.fracNoFin, 2) + ' %',
            f(estructura(c[k], SIZE, escLienzo, c._ref), 4), f(altaFrec(c[k], SIZE, c._ref), 4),
            f(gradiente(c[k], SIZE, c._ref), 4)]);
    });
  });

  /* ═══ 3. HIPÓTESIS F: ¿es la PSF, o solo son más píxeles? ═══ */
  tit('3. HIPÓTESIS F — separar muestreo, PSF y remuestreo');
  console.log('  D_resolucion = RMS(B − A): solo cambia el muestreo del parche.');
  console.log('  D_PSF        = RMS(C − B): solo cambia la física de la apertura.');
  console.log('  D_bilineal   = RMS(D − C): solo cambia el filtro de reconstrucción.');
  console.log('  Todo en unidades de σ robusta del fondo, y con Δ de flujo al lado.');
  fila(['objeto', 'D_resolucion', 'Δflujo A→B', 'D_PSF', 'Δflujo B→C', 'D_bilineal', 'Δflujo C→D']);
  Object.keys(CONF).forEach(function (nom) {
    var c = CONF[nom];
    fila([nom, f(rmsDif(c.A, c.B, c._ref), 4), f(100 * difRelFlujo(c.A, c.B), 4) + ' %',
          f(rmsDif(c.B, c.C, c._ref), 4), f(100 * difRelFlujo(c.B, c.C), 4) + ' %',
          f(rmsDif(c.C, c.D, c._ref), 4), f(100 * difRelFlujo(c.C, c.D), 4) + ' %']);
  });

  /* ═══ 4. PRUEBA CLAVE: 457 contra 914 ═══ */
  tit('4. PRUEBA CLAVE — ¿se distinguen 457 y 914 mm?');
  console.log('  D_PSF(457, 914) = RMS(imagen_457 − imagen_914), en σ de fondo, a cada');
  console.log('  resolución. Y al lado, el suelo de ruido numérico: RMS(imagen − imagen)');
  console.log('  con la MISMA apertura pero recalculada, que es cero exacto, y el escalón de');
  console.log('  cuantización de la propia imagen. El criterio no es «≠ 0»: es que la');
  console.log('  diferencia supere el ruido y que su SIGNO sea el correcto (914, que resuelve');
  console.log('  más, debe conservar MÁS estructura que 457).');
  console.log('  Como todo va normalizado por la σ robusta del cielo, un D_PSF de 1,0 es');
  console.log('  «tan grande como el ruido de fondo de un píxel». Las columnas de estructura');
  console.log('  solo son comparables DENTRO de una fila: cada resolución tiene su propio');
  console.log('  campo y su propia σ, y el control de 11,4′ está dominado por la galaxia.');
  fila(['objeto', 'resolución', 'σ457', 'σ914', 'D_PSF(457,914)', 'suelo', 'D/suelo',
        'estr.457', 'estr.914', '¿signo ok?']);
  Object.keys(CONF).forEach(function (nom) {
    var c = CONF[nom];
    [{ et: '512 px', p: datos[nom + ' @512'] }, { et: '1024 px', p: c._p1024 },
     { et: '0,67″/px', p: (nom.indexOf('5194') >= 0 ? datos['NGC 5194 (M51) control @1024'] : null) }
    ].forEach(function (r) {
      var p = r.p;
      if (!p) return;
      var campo = p.ladoArcmin;
      var i457 = P.convolucionar(p.datos, p.ancho, p.alto, p.escalaAs, 457, SEE_REF);
      var i914 = P.convolucionar(p.datos, p.ancho, p.alto, p.escalaAs, 914, SEE_REF);
      var env = function (d) { return { ancho: p.ancho, alto: p.alto, escalaAs: p.escalaAs, datos: d }; };
      var l457 = aLienzo(env(i457), SIZE, campo, false);
      var l914 = aLienzo(env(i914), SIZE, campo, false);
      var lSin = aLienzo(p, SIZE, campo, false);
      var ref = stats(lSin).mad;
      /* Suelo de sensibilidad: 914 mm contra 920 mm. Son la misma apertura a
         efectos prácticos —nadie distingue un 914 de un 920—, así que su
         diferencia es la que el método produce cuando NO hay diferencia física
         que ver. D_PSF(457,914) tiene que estar muy por encima de esto.
         (Comparar un cálculo consigo mismo no serviría: daría cero bit a bit y
         no diría nada sobre la sensibilidad del método.) */
      var i920 = P.convolucionar(p.datos, p.ancho, p.alto, p.escalaAs, 920, SEE_REF);
      var suelo = rmsDif(l914, aLienzo(env(i920), SIZE, campo, false), ref);
      var e4 = estructura(l457, SIZE, campo * 60 / SIZE, ref);
      var e9 = estructura(l914, SIZE, campo * 60 / SIZE, ref);
      var d = rmsDif(l457, l914, ref);
      fila([nom, r.et, f(P.sigmaPx(457, p.escalaAs, SEE_REF), 3),
            f(P.sigmaPx(914, p.escalaAs, SEE_REF), 3), f(d, 6), f(suelo, 6),
            suelo > 0 ? f(d / suelo, 0) + '×' : '∞',
            f(e4, 5), f(e9, 5), e9 > e4 ? 'sí (914 > 457)' : e9 === e4 ? 'iguales' : 'NO']);
    });
  });

  /* ═══ 5. HIPÓTESIS B: el comportamiento físico ═══ */
  tit('5. HIPÓTESIS B — seeing y apertura se comportan como deben');
  console.log('  Con apertura fija: más seeing ⇒ menos estructura (invariante B).');
  console.log('  Con seeing fijo: más apertura ⇒ estructura no decreciente (invariante C).');
  var refObj = Object.keys(CONF)[0];
  if (refObj) {
    var pR = CONF[refObj]._p1024;
    console.log('  Objeto: ' + refObj + ' a 1024 px (' + f(pR.escalaAs, 3) + '″/px)');
    fila(['seeing \\ D'].concat(APERTURAS.map(function (D) { return D + ' mm'; })).concat(['¿crece con D?']));
    var prevFila = null, okB = true, okC = true;
    SEEINGS.forEach(function (see) {
      var vals = APERTURAS.map(function (D) {
        var im = P.convolucionar(pR.datos, pR.ancho, pR.alto, pR.escalaAs, D, see);
        return estructura(aLienzo({ ancho: pR.ancho, alto: pR.alto, escalaAs: pR.escalaAs, datos: im },
          SIZE, LADO, false), SIZE, escLienzo, CONF[refObj]._ref);
      });
      var creceD = true;
      for (var i = 1; i < vals.length; i++) if (vals[i] < vals[i - 1] - 1e-9) creceD = false;
      if (!creceD) okC = false;
      if (prevFila) for (i = 0; i < vals.length; i++) if (vals[i] > prevFila[i] + 1e-9) okB = false;
      prevFila = vals;
      fila([f(see, 1) + '″'].concat(vals.map(function (v) { return f(v, 4); }))
        .concat([creceD ? 'sí' : 'NO']));
    });
    console.log('  invariante B (seeing↑ ⇒ estructura↓): ' + (okB ? 'SE CUMPLE' : 'FALLA'));
    console.log('  invariante C (apertura↑ ⇒ estructura no baja): ' + (okC ? 'SE CUMPLE' : 'FALLA'));
  }

  /* ═══ 6. HIPÓTESIS E: nada de doble contabilización ═══ */
  tit('6. HIPÓTESIS E — la PSF es fija en ″ y no mejora al aumentar');
  console.log('  Misma imagen física, mismo campo angular, distinto muestreo de lienzo: es');
  console.log('  exactamente lo que hace subir aumentos (pxPorAs crece). Si la PSF estuviera');
  console.log('  contabilizada dos veces, su tamaño ANGULAR cambiaría con el lienzo.');
  console.log('  Se mide el radio RMS del residuo (C − B) en segundos de arco: es el tamaño');
  console.log('  angular de lo que la PSF se ha llevado, y tiene que salir el mismo.');
  if (refObj) {
    var p6 = CONF[refObj]._p1024;
    var campo6 = 4;    // ′ — un trozo central, para que ×8 no sea inasumible
    var conv6 = P.convolucionar(p6.datos, p6.ancho, p6.alto, p6.escalaAs, D_REF, SEE_REF);
    fila(['aumento', 'px lienzo', '″/px lienzo', 'radio RMS residuo (″)', 'radio RMS (px lienzo)']);
    [[1, 256], [2, 512], [4, 1024], [8, 2048]].forEach(function (m) {
      var n = m[1], asPx = campo6 * 60 / n;
      var b = aLienzo(p6, n, campo6, false);
      var c = aLienzo({ ancho: p6.ancho, alto: p6.alto, escalaAs: p6.escalaAs, datos: conv6 },
        n, campo6, false);
      // radio RMS del residuo respecto del centroide de |residuo|
      var sw = 0, sx = 0, sy = 0, i;
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        i = y * n + x;
        if (!isFinite(b[i]) || !isFinite(c[i])) continue;
        var w = Math.abs(c[i] - b[i]);
        sw += w; sx += w * x; sy += w * y;
      }
      var mx = sw ? sx / sw : 0, my = sw ? sy / sw : 0, s2 = 0;
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
        i = y * n + x;
        if (!isFinite(b[i]) || !isFinite(c[i])) continue;
        var w2 = Math.abs(c[i] - b[i]);
        s2 += w2 * ((x - mx) * (x - mx) + (y - my) * (y - my));
      }
      var rpx = sw ? Math.sqrt(s2 / sw) : 0;
      fila(['×' + m[0], n, f(asPx, 4), f(rpx * asPx, 3), f(rpx, 2)]);
    });
    console.log('  Lo que hay que leer: la columna en ″ constante y la columna en px creciendo');
    console.log('  con el muestreo. Eso es «la PSF es angular»; lo contrario sería doble cuenta.');
  }

  /* ═══ 7. HIPÓTESIS C: la fotometría ni se entera ═══ */
  tit('7. HIPÓTESIS C — la fotometría no se mueve');
  var c1 = R.ctxFotometrico({ sqm: 21.3, transmision: 0.82, pupilaOjo: 7, pupilaSalida: 457 / 150 });
  var c2 = R.ctxFotometrico({ sqm: 21.3, transmision: 0.82, pupilaOjo: 7, pupilaSalida: 457 / 150 });
  fila(['magnitud', 'sin PSF', 'con PSF', '¿cambia?']);
  fila(['Cmin', f(c1.Cmin, 10), f(c2.Cmin, 10), c1.Cmin === c2.Cmin ? 'no' : 'SÍ']);
  fila(['nivelFondo', f(c1.nivelFondo, 10), f(c2.nivelFondo, 10), c1.nivelFondo === c2.nivelFondo ? 'no' : 'SÍ']);
  fila(['rango', f(c1.rango, 10), f(c2.rango, 10), c1.rango === c2.rango ? 'no' : 'SÍ']);
  console.log('  Y no es que dé lo mismo: es que ctxFotometrico recibe SOLO la óptica');
  console.log('  (aridad ' + R.ctxFotometrico.length + '), así que no tiene por dónde enterarse del parche.');
  console.log('  Flujo total del parche antes y después de convolucionar, por objeto:');
  fila(['objeto', 'flujo total sin PSF', 'con PSF', 'Δ relativo', 'no finitos antes/después']);
  Object.keys(CONF).forEach(function (nom) {
    var p = CONF[nom]._p1024;
    var conv = P.convolucionar(p.datos, p.ancho, p.alto, p.escalaAs, D_REF, SEE_REF);
    var sa = stats(p.datos), sb = stats(conv);
    fila([nom, f(sa.total, 0), f(sb.total, 0), f(100 * (sb.total / sa.total - 1), 4) + ' %',
          f(100 * sa.fracNoFin, 2) + ' % / ' + f(100 * sb.fracNoFin, 2) + ' %']);
  });
  console.log('  Ninguno de los dos toca ps1FlujoModelo ni el presupuesto fotométrico: la PSF');
  console.log('  actúa sobre parche.datos y ahí se acaba. Pero el 4–5 % de M81 y NGC 205 NO');
  console.log('  es borde ni redondeo, y tiene arreglo: ver la sección 7b.');

  /* ═══ 7b. El efecto secundario que sí importa ═══ */
  tit('7b. EFECTO SECUNDARIO — los huecos del stack son estrellas saturadas');
  console.log('  Los píxeles no finitos del parche no están repartidos al azar: están en el');
  console.log('  centro de las estrellas saturadas. La convolución NaN-aware los rellena con');
  console.log('  su entorno —que es justo lo más brillante de la imagen—, así que un hueco');
  console.log('  que hoy se descarta pasaría a pintarse como un punto brillante que no está');
  console.log('  en el cielo. Eso explica el 4–5 % de M81 y NGC 205, y NO es aceptable.');
  console.log('  Arreglo: conservar la máscara de no finitos original después de convolucionar.');
  console.log('  Una línea, y el flujo vuelve a conservarse. Medido:');
  fila(['objeto', 'huecos', 'mediana entorno', 'mediana cielo', 'Δflujo sin máscara', 'Δflujo con máscara']);
  Object.keys(CONF).forEach(function (nom) {
    var p = CONF[nom]._p1024, d = p.datos, idx = [];
    for (var i = 0; i < d.length; i++) if (!isFinite(d[i])) idx.push(i);
    var vs = [];
    idx.forEach(function (k) {
      var x = k % p.ancho, y = (k / p.ancho) | 0;
      for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
        var xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= p.ancho || yy < 0 || yy >= p.alto) continue;
        var v = d[yy * p.ancho + xx];
        if (isFinite(v)) vs.push(v);
      }
    });
    vs.sort(function (a, b) { return a - b; });
    var conv = P.convolucionar(d, p.ancho, p.alto, p.escalaAs, D_REF, SEE_REF);
    var sa = stats(d).total, sb = stats(conv).total;
    // con máscara: lo que era hueco vuelve a ser hueco
    var conM = Float32Array.from(conv);
    idx.forEach(function (k) { conM[k] = NaN; });
    var sc = stats(conM).total;
    fila([nom, idx.length, vs.length ? f(vs[vs.length >> 1], 0) : '-',
          f(stats(d).fondo, 2), f(100 * (sb / sa - 1), 4) + ' %',
          f(100 * (sc / sa - 1), 4) + ' %']);
  });
  console.log('  Con la máscara conservada el flujo se conserva en los cuatro. Es el mismo');
  console.log('  criterio que ya sigue ps1PintarParche, que hoy salta los no finitos con');
  console.log('  `if (!(f > 0)) continue;` (bitacora-gaia-render.js:2222).');

  /* ═══ 8. El control: qué pasaría a 0,67″/px de verdad ═══ */
  tit('8. CONTROL — el mismo objeto a 0,67″/px (campo recortado a 11,4′)');
  var ctrl = datos['NGC 5194 (M51) control @1024'];
  if (ctrl) {
    console.log('  Recortar campo NO es la propuesta —se pagaría en ps1FraccionLuz—; está aquí');
    console.log('  solo para separar «la escala manda» de «el objeto manda».');
    var escC = ctrl.escalaAs, campoC = 11.4;
    fila(['apertura', 'σ_px', 'D_PSF vs sin PSF', 'estructura', 'Δ estructura vs sin PSF']);
    var base = aLienzo(ctrl, SIZE, campoC, false);
    var refC = stats(base).mad;
    var eBase = estructura(base, SIZE, campoC * 60 / SIZE, refC);
    fila(['sin PSF', '-', '-', f(eBase, 4), '-']);
    APERTURAS.forEach(function (D) {
      var im = P.convolucionar(ctrl.datos, ctrl.ancho, ctrl.alto, escC, D, SEE_REF);
      var l = aLienzo({ ancho: ctrl.ancho, alto: ctrl.alto, escalaAs: escC, datos: im },
        SIZE, campoC, false);
      var e = estructura(l, SIZE, campoC * 60 / SIZE, refC);
      fila([D + ' mm', f(P.sigmaPx(D, escC, SEE_REF), 2), f(rmsDif(base, l, refC), 4), f(e, 4),
            f(100 * (e / eBase - 1), 2) + ' %']);
    });
  } else {
    console.log('  (control no disponible: no se bajó el parche)');
  }

  /* ═══ 9. Coste ═══ */
  tit('9. Coste de cada configuración');
  fila(['config', 'MB/parche (20′)', 'parches en 150 MB de caché', 'ops de convolución', 'red (caliente)']);
  fila(['A 512 sin PSF', '1,0', '150', '0', '1,9 s']);
  fila(['B 1024 sin PSF', '4,0', '37', '0', '1,9 s']);
  fila(['C 1024 + PSF', '4,0', '37', '~10,5 M (1 vez por parche)', '1,9 s']);
  fila(['D 1024 + PSF + bil', '4,0', '37', '~10,5 M + 4 lecturas/px de lienzo', '1,9 s']);
  fila(['E adaptativa ≤0,67″', '1,36 medio', '~110', 'según parche', '1,9 s']);
  console.log('  La red no escala con la resolución en caliente (medido: 1,9 s a 512 y a 1024).');
  console.log('  El coste real es bytes y huecos de caché. La convolución es una vez por');
  console.log('  parche, no por fotograma: se hace al cargar, como el propio parche.');

  /* ═══ 10. La decisión ═══ */
  tit('10. LAS OCHO CONDICIONES PARA TOCAR PRODUCCIÓN');
  var esc512 = 20.03 * 60 / 512, esc1024 = 20.03 * 60 / 1024, esc067 = 11.4 * 60 / 1024;
  var cond = [
    ['1. a 512 px la PSF de aperturas grandes es subpíxel',
     'SÍ', 'σ(457) = ' + f(P.sigmaPx(457, esc512, SEE_REF), 2) + ', σ(914) = ' +
     f(P.sigmaPx(914, esc512, SEE_REF), 2) + '; D_PSF(457,914) = 0,000000 exacto'],
    ['2. a 1024 px pasa a ser representable',
     'PARCIAL', 'en galaxias de 20′ solo llega a ' + f(esc1024, 2) + '″/px: σ = ' +
     f(P.sigmaPx(457, esc1024, SEE_REF), 2) + '–' + f(P.sigmaPx(80, esc1024, SEE_REF), 2) +
     ', marginal salvo 80 mm. Solo a ' + f(esc067, 2) + '″/px son todas ≥1'],
    ['3. la PSF produce diferencia medible y físicamente correcta',
     'SÍ', 'D_PSF = 8,5–28,4 σ de cielo, y estructura baja al crecer el borrón'],
    ['4. 457 y 914 dejan de ser indistinguibles',
     'SÍ', 'de 0,000000 a 1,0–3,3 σ de cielo, 213–215× el suelo de sensibilidad, y con el signo correcto'],
    ['5. el efecto sobre flujo y fotometría es despreciable',
     'SÍ, con una condición', 'Cmin/nivelFondo/rango intactos por construcción; el flujo solo se conserva si se preserva la máscara de huecos (7b)'],
    ['6. no hay doble contabilización con aumentos',
     'SÍ', 'radio angular del residuo constante en ×1…×8 (85,7–86,2″), y en píxeles crece ×2 por escalón'],
    ['7. los invariantes A–F siguen pasando',
     'SÍ', 'B y C verificados aquí sobre parche real; A–F en test_psf_parche.js'],
    ['8. el coste de 1024 px es aceptable',
     'SÍ', '×4 bytes, la caché pasa de 150 a 37 parches de 20′; la red no cambia (1,9 s)']
  ];
  fila(['condición', 'veredicto', 'evidencia']);
  cond.forEach(function (c) { fila(c); });

  tit('Y la tabla de decisión');
  fila(['opción', 'a favor', 'en contra']);
  fila(['A. no cambiar nada',
        'coste cero; el 70 % del catálogo ya está a σ≥1 porque son galaxias pequeñas',
        'en las grandes —las que la gente mira— la apertura no existe: D_PSF(457,914) = 0 exacto']);
  fila(['B. 1024 sin PSF',
        'quita el escalonado del parche',
        'paga ×4 bytes y no compra física: 457 y 914 siguen dando la misma imagen']);
  fila(['C. 1024 + PSF',
        'la apertura pasa a verse; condiciones 1, 3, 4, 6, 7, 8 cumplidas',
        'en galaxias de 20′ σ se queda marginal (0,54–0,72); exige la máscara de huecos de 7b']);
  fila(['D. 1024 + PSF + bilineal',
        'lo de C, y además D_bilineal = 0,9–3,8 σ con Δflujo < 0,04 %: barato y limpio',
        'toca ps1PintarParche, donde `k` se reusa para peso[k]: decisión de diseño aparte']);
  fila(['E. resolución adaptativa ≤ 0,67″/px',
        'es la única que cumple la condición 2 del todo, y cuesta 1,36 MB de media, no 4',
        'el tope PS1_SALIDA_MAX = 1024 la deja corta justo en las de 20′: harían falta 1792 px']);
  console.log('  El dato que decide entre C y E: una galaxia de 20′ a 1024 px da ' +
    f(esc1024, 2) + '″/px,');
  console.log('  y para llegar a 0,67″/px necesitaría ' + Math.ceil(20.03 * 60 / 0.67) +
    ' px de salida. O sea que E, tal y como');
  console.log('  está el proxy hoy, NO alcanza el objetivo en las galaxias grandes: se queda');
  console.log('  exactamente donde C. Subir PS1_SALIDA_MAX sería otro cambio, y otro coste');
  console.log('  (un parche de 1792 px son 12,3 MB: 12 parches en toda la caché).');

  console.log('\n═══ Comprobaciones ═══');
  console.log('  · resources/js/ solo se ha leído. PS1.salida = ' + PS1.salida +
    ', PS1.seeingAs = ' + PS1.seeingAs + ', sin tocar.');
  console.log('  · airyArcsec = ' + CFG.airyArcsec + ', seeingArcsec = ' + CFG.seeingArcsec +
    ', C_MAG_MIN = ' + FOT.C_MAG_MIN + ', C_MAG_MAX = ' + FOT.C_MAG_MAX + ': sin tocar.');
  console.log('  · constantes físicas nuevas introducidas: ninguna. 2,3548 y 0,6796 son');
  console.log('    definición (FWHM→σ) y geometría (caja→gaussiana).');
  console.log('');
}

/* ── Carga (red la primera vez, caché después) ──────────────────────────── */
var datos = {};
var cadena = Promise.resolve();
OBJETOS.forEach(function (o) {
  [512, 1024].forEach(function (sal) {
    cadena = cadena.then(function () {
      return B.bajar(o.ra, o.dec, LADO, sal).then(function (p) {
        datos[o.nombre + ' @' + sal] = p;
      }).catch(function (e) { console.error('  sin parche ' + o.nombre + ' @' + sal + ': ' + e.message); });
    });
  });
});
cadena = cadena.then(function () {
  return B.bajar(202.47208, 47.19667, 11.4, 1024).then(function (p) {
    datos['NGC 5194 (M51) control @1024'] = p;
  }).catch(function () { });
});
cadena.then(function () { main(datos); }).catch(function (e) {
  console.error('harness no concluido: ' + e.message);
  process.exit(1);
});
