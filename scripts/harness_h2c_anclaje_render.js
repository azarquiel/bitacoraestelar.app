#!/usr/bin/env node
/* EXPERIMENTO H2c: ANCLAJE ABSOLUTO + A/B DE RENDER.  NO toca producción.

   A  = ley actual de la rama (C_MAG_EXP=1.0, clamp [0.45,2.0]) tal cual.
   A0 = ley desplegada en main (C_MAG_EXP=0.5) — solo en la parte analítica.
   B  = H2c: Cmin = C_MIN·(Fref/(Fcielo·dim))^C_EXP · (1+θR(SBe)/θeff_app)²
        con θeff = √(θint² + θseeing²), θR de Blackwell (log10 θR = 0.094+0.081·SBe).
        Amplitud: se CONSERVA C_MIN/C_EXP (anclaje de continuidad, K≈2.0 sobre
        Blackwell). Ninguna constante nueva.

   La variante B se obtiene parcheando el FUENTE EN MEMORIA de
   bitacora-gaia-render.js (gancho o.cminExperimental); el fichero no se
   modifica y sin gancho el módulo B reproduce producción bit a bit (se
   comprueba). Salidas en docs/ricco/anclaje/.  exit 0 = todas las exigencias.

   Uso:  node scripts/harness_h2c_anclaje_render.js            (red la 1.ª vez)
         node scripts/harness_h2c_anclaje_render.js --sin-red  (solo cacheados) */
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');
var cp = require('child_process');
var RAIZ = path.join(__dirname, '..');
var RUTA_RAMA = path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js');
var RUTA_MAIN = path.resolve(RAIZ, '..', '..', '..', 'resources', 'js', 'bitacora-gaia-render.js');
var OUT = path.join(RAIZ, 'docs', 'ricco', 'anclaje');
fs.mkdirSync(OUT, { recursive: true });
var SIN_RED = process.argv.indexOf('--sin-red') >= 0;

var fallos = 0;
function exige(cond, txt) {
  if (cond) console.log('  ok   ' + txt);
  else { fallos++; console.error('  EXIGENCIA FALLA: ' + txt); }
}
function f(v, d) { return (v == null || !isFinite(v)) ? '—' : v.toFixed(d == null ? 3 : d); }
function log10(x) { return Math.log(x) / Math.LN10; }

/* ── Carga de los tres módulos ───────────────────────────────────────────── */
global.window = {};
require(RUTA_MAIN);
var Rmain = global.window.BitacoraGaiaRender;          // ley desplegada (A0)

global.window = {};
require(RUTA_RAMA);
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;              // rama (A)
var CAT = global.window.BITACORA_GALAXIAS;
var FOT = R.fot, PS1 = R.ps1, CFG = R.config;
var P = require('./lib_psf_parche.js')(R);
var B = require('./lib_bajar_parche.js')(R);
var SINT = require('./lib_galaxias_sinteticas.js')(R);

/* La intercepción por vm del primer experimento ya no hace falta: H2c vive en
   producción tras la bandera FOT.H2C (hoy ACTIVA por defecto, validada en
   campo). A = vía histórica C_MAG (bandera a null durante todo el harness);
   B = mismo módulo con la bandera puesta al pintar. */
console.log('═══ 0. Carga y reversibilidad de la bandera ═══');
exige(R.fot.H2C === R.fot.H2C_DEFECTO, 'FOT.H2C viene ACTIVA por defecto (H2C_DEFECTO)');
R.fot.H2C = null;   // el harness compara contra la vía histórica: A la usa siempre
var idem = true;
[[7, 1, 21], [2.89, 158, 21.2], [2.0, 152, 22], [1.14, 400, 21]].forEach(function (c) {
  var o1 = { pupilaSalida: c[0], pupilaOjo: 7, sqm: c[2], aumentos: c[1] };
  var o2 = { pupilaSalida: c[0], pupilaOjo: 7, sqm: c[2], aumentos: c[1] };
  if (Math.abs(R.ctxFotometrico(o1).Cmin - R.ctxFotometrico(o2, 8).Cmin) > 0) idem = false;
});
exige(idem, 'con la bandera apagada, ctxFotometrico ignora θint (0 exacto)');
var Rb = R;   // B es el MISMO módulo: solo cambia la bandera al pintar

/* ── Ley H2c (la ÚNICA definición; parámetros de Blackwell ya medidos) ───── */
var SEEING_AS = (CFG && CFG.seeingArcsec) || 2.0;
function thetaR(SBe) { return Math.pow(10, 0.094 + 0.081 * SBe); }        // arcmin
function cinfBw(SBe) { return Math.pow(10, -4.087 + 0.128 * SBe); }       // Blackwell 50 % lab
function factorH2c(thIntArcmin, M, SBe) {
  var thEff = Math.sqrt(thIntArcmin * thIntArcmin + Math.pow(SEEING_AS / 60, 2));
  return Math.pow(1 + thetaR(SBe) / (thEff * M), 2);
}
// Factor C_MAG de producción (la rama), para deshacerlo y aislar baseCmin.
function factorProd(M) {
  return Math.max(R.fot.C_MAG_MIN, Math.min(R.fot.C_MAG_MAX,
    Math.pow(R.fot.C_MAG_REF / M, R.fot.C_MAG_EXP)));
}
/* Gancho para el cielo del render. baseCmin = C_MIN·(Fref/(Fcielo·dim))^C_EXP,
   ya calculado por producción: C_MIN/C_EXP se conservan literalmente. */
function ganchoH2c(thIntArcmin) {
  return function (o, baseCmin, ctx) {
    var SBe = (o.sqm != null ? o.sqm : 21) - 2.5 * log10(ctx.dim) - 2.5 * log10(ctx.T);
    return baseCmin * factorH2c(thIntArcmin, o.aumentos || 1, SBe);
  };
}

/* ═══ 1. ANCLAJE DOCUMENTAL (hallazgos verificados en el repo) ═══════════ */
console.log('\n═══ 1. Qué calibró la ley actual (auditoría del repo) ═══');
[
  'C_MIN=0.08 y C_EXP=0.35 nacen en 19da7f0 (jul 2026) con la referencia',
  '  «cielo rural 21 mag/arcsec² a pupila plena» y cita genérica a Blackwell/',
  '  Clark. NINGÚN dato del repo fija el 0.08: no hay reporte umbral medido.',
'C_MAG nace en f872dbe con EXP=0.7, MIN=0.3: calibración CUALITATIVA (render',
  '  de NGC 891 con 12"/18"/24"; «lo que más gana es el disco tenue»).',
'629429b cambió EXP 0.7→0.5 y MIN 0.3→0.45 SIN justificación en el mensaje',
  '  (commit de estrellas de carbono). La amplitud vigente en main no está',
  '  calibrada contra nada.',
'La rama difusas-desde-imagen (05cfa0c) corrigió EXP 0.5→1.0 por signo del',
  '  neto MAG^(2·C_EXP−C_MAG_EXP); MIN=0.45 heredado.',
'El único reporte real cuantificado del repo es la serie SQM (18" a 158x:',
  '  separa 21.2/21.4/21.6/21.8; 21.8 vs 22 ya no) y calibra la curva del',
  '  fondo en pantalla (entonces SB_CIELO_NEGRO; hoy ADR-0001), NO el umbral',
  '  de contraste.',
'Criterio del simulador: Cmin es donde EMPIEZA el desvanecido de la capa',
  '  (suave con UMBRAL_MARGEN=0.4/UMBRAL_ANCHURA=1.4 dex): «se empieza a',
  '  pintar», no 50 % de detección forzada en laboratorio (Blackwell).'
].forEach(function (l) { console.log('  ' + l); });

/* ═══ 2. COMPARACIÓN ABSOLUTA ════════════════════════════════════════════ */
console.log('\n═══ 2. Comparación absoluta Blackwell / producción ═══');
console.log('  C_real cuantitativo: NO EXISTE en el repo (los reportes son prosa');
console.log('  cualitativa). Solo se comparan A y B; C se declara ausente.');
var FONDOS = [21.0, 21.2, 21.5, 22.0, 23.0];
var csv2 = ['fondo,C_blackwell,C_prod_base,C_prod_min,C_prod_max,K_base,dex_base,K_min,K_max'];
console.log('  fondo | C_bw    | C_prod(M=100) | rango clamp      | K=prod/bw | dex');
FONDOS.forEach(function (fo) {
  var cbw = cinfBw(fo);
  var base = FOT.C_MIN * Math.pow(10, 0.4 * FOT.C_EXP * (fo - 21));
  var K = base / cbw;
  csv2.push([fo, cbw.toExponential(4), base.toExponential(4),
    (base * FOT.C_MAG_MIN).toExponential(4), (base * FOT.C_MAG_MAX).toExponential(4),
    f(K, 3), f(log10(K), 3), f(base * FOT.C_MAG_MIN / cbw, 3), f(base * FOT.C_MAG_MAX / cbw, 3)].join(','));
  console.log('  ' + f(fo, 1) + '  | ' + f(cbw, 4) + ' | ' + f(base, 4) + '        | ×' +
    f(FOT.C_MAG_MIN, 2) + '…×' + f(FOT.C_MAG_MAX, 2) + ' (' + f(base * FOT.C_MAG_MIN, 4) + '…' +
    f(base * FOT.C_MAG_MAX, 4) + ') | ' + f(K, 2) + '      | ' + f(log10(K), 3));
});
fs.writeFileSync(path.join(OUT, 'anclaje_absoluto.csv'), csv2.join('\n') + '\n');
/* H_A (K constante) frente a H_B (K depende del fondo): la pendiente de
   log K con el fondo es EXACTA (dos leyes exponenciales): 0.4·C_EXP − 0.128. */
var pendK = 0.4 * FOT.C_EXP - 0.128;
console.log('  pendiente exacta de log10 K con el fondo: ' + f(pendK, 4) + ' dex/mag');
console.log('  → de fondo 21 a 24: Δlog K = ' + f(pendK * 3, 3) +
  ' dex, frente a rms 0.086 del propio ajuste de Blackwell');
exige(Math.abs(pendK * 3) < 0.086,
  'H_A defendible: la deriva de K en 3 mag (' + f(pendK * 3, 3) + ' dex) < rms de Blackwell (0.086)');
var K21 = FOT.C_MIN / cinfBw(21);
console.log('  K (fondo 21) = C_MIN / C∞_bw = ' + f(K21, 3) + '  (+' + f(log10(K21), 3) + ' dex)');
console.log('  H_C (K según tamaño): exigirlo equivale a conservar C_MAG, que es lo');
console.log('  que Blackwell refuta (rms 1.068); ningún dato del repo lo pide.');

/* ═══ 3. CRITERIOS DE DETECCIÓN ══════════════════════════════════════════ */
console.log('\n═══ 3. Criterios: 50 % laboratorio ≠ «se empieza a pintar» ═══');
console.log('  Blackwell 1946: detección forzada al 50 %, binocular, observadores');
console.log('  entrenados, tiempo libre. El simulador: umbral donde arranca un');
console.log('  desvanecido de 1.4 dex. El offset medido (+' + f(log10(K21), 2) + ' dex) tiene el');
console.log('  SIGNO correcto (el campo exige más contraste que el laboratorio) y');
console.log('  una magnitud plausible, pero el repo NO contiene datos para medirlo:');
console.log('  K=2.0 aquí NO es una constante nueva, es conservar C_MIN. La');
console.log('  conversión laboratorio→campo real queda como experimento pendiente.');

/* ═══ 4. CONSISTENCIA CON LA LEY ACTUAL (rejilla operativa) ══════════════ */
console.log('\n═══ 4. Rejilla 18–360′, fondos 21–24: nivel y forma ═══');
var csv4 = ['fondo,theta_app_arcmin,prod_rama_M66,prod_rama_M158,prod_rama_M400,prod_main_M158,h2c_campo,h2c_blackwell'];
var THETAS = [18, 30, 60, 120, 240, 360];
[21, 22, 23, 24].forEach(function (fo) {
  THETAS.forEach(function (th) {
    var base = FOT.C_MIN * Math.pow(10, 0.4 * FOT.C_EXP * (fo - 21));
    function prod(M, exp, min, max) {
      return base * Math.max(min, Math.min(max, Math.pow(100 / M, exp)));
    }
    var h2cCampo = base * Math.pow(1 + thetaR(fo) / th, 2);
    var h2cBw = cinfBw(fo) * Math.pow(1 + thetaR(fo) / th, 2);
    csv4.push([fo, th,
      prod(66, FOT.C_MAG_EXP, FOT.C_MAG_MIN, FOT.C_MAG_MAX).toExponential(4),
      prod(158, FOT.C_MAG_EXP, FOT.C_MAG_MIN, FOT.C_MAG_MAX).toExponential(4),
      prod(400, FOT.C_MAG_EXP, FOT.C_MAG_MIN, FOT.C_MAG_MAX).toExponential(4),
      prod(158, Rmain.fot.C_MAG_EXP, Rmain.fot.C_MAG_MIN, Rmain.fot.C_MAG_MAX).toExponential(4),
      h2cCampo.toExponential(4), h2cBw.toExponential(4)].join(','));
  });
});
fs.writeFileSync(path.join(OUT, 'rejilla_leyes.csv'), csv4.join('\n') + '\n');
/* El anclaje mueve NIVEL (0.30 dex uniforme entre h2c_campo y h2c_blackwell);
   la FORMA (cociente entre θ) es idéntica por construcción: se comprueba. */
var formaOK = true;
[21, 23].forEach(function (fo) {
  var a = Math.pow(1 + thetaR(fo) / 18, 2) / Math.pow(1 + thetaR(fo) / 360, 2);
  var c1 = (FOT.C_MIN * Math.pow(10, 0.4 * FOT.C_EXP * (fo - 21)) * Math.pow(1 + thetaR(fo) / 18, 2)) /
           (FOT.C_MIN * Math.pow(10, 0.4 * FOT.C_EXP * (fo - 21)) * Math.pow(1 + thetaR(fo) / 360, 2));
  if (Math.abs(log10(c1 / a)) > 1e-12) formaOK = false;
});
exige(formaOK, 'el anclaje solo mueve el nivel: la forma (1+θR/θ)² no depende de K');
console.log('  rejilla_leyes.csv escrito (la interpretación va en el informe)');

/* ═══ 8 (analítica, antes del render). INVARIANCIAS DE LA LEY ════════════ */
console.log('\n═══ 8. Invariancias de la ley H2c ═══');
(function () {
  // A) mismo objeto (θint 10′, fondo 21.2, pupila fija 2.9): Cmin_B decrece con M hacia el plateau
  var Ms = [66, 100, 158, 250, 400], prev = Infinity, mono = true;
  Ms.forEach(function (M) {
    var v = factorH2c(10, M, 23.3);
    if (v > prev + 1e-12) mono = false;
    prev = v;
  });
  exige(mono, 'A: a θint y fondo fijos el factor de tamaño decrece con M (θapp manda)');
  // B) mismo θapp con pares (θint, M) distintos → mismo factor
  var f1 = factorH2c(10, 100, 23.3), f2 = factorH2c(20, 50, 23.3), f3 = factorH2c(5, 200, 23.3);
  exige(Math.abs(f1 - f2) / f1 < 2e-4 && Math.abs(f1 - f3) / f1 < 2e-3,
    'B: mismo θapp ⇒ mismo factor (pares 10′×100 / 20′×50 / 5′×200; resto es el seeing explícito)');
  var pA = Math.pow(100 / 100, FOT.C_MAG_EXP), pB = Math.pow(100 / 50, FOT.C_MAG_EXP);
  console.log('       (producción con esos pares: factor ' + f(pA, 2) + ' vs ' + f(Math.min(2, pB), 2) +
    ' — depende de M, no de θapp: defecto estructural)');
  // C) objeto grande → plateau
  exige(factorH2c(60, 158, 23.3) < 1.022, 'C: θint 60′ a 158x ⇒ factor→1 (' + f(factorH2c(60, 158, 23.3), 4) + ')');
  // D) objeto pequeño sobre el límite óptico → régimen Ricco. La pendiente
  // teórica es −2/(1+θapp/θR): solo se acerca a −2 con θapp ≪ θR (96′ a SBe
  // 23.3), así que la sonda va a θint 0.3′/0.15′ (9″, aún ≫ seeing de 2″).
  var t1 = 0.3, t2 = 0.15;
  var pend = (log10(factorH2c(t2, 66, 23.3)) - log10(factorH2c(t1, 66, 23.3))) / (log10(t2 * 66) - log10(t1 * 66));
  exige(pend < -1.4, 'D: pendiente local del umbral con θapp en pequeños = ' + f(pend, 2) + ' (Ricco emergiendo)');
  // E) θint ≪ seeing: el umbral queda acotado por θeff→θseeing (sin rescate artificial)
  var v1 = factorH2c(1 / 60, 158, 23.3), v0 = factorH2c(0.1 / 60, 158, 23.3);
  exige(v0 / v1 < 1.30, 'E: bajar θint de 1″ a 0.1″ solo mueve el umbral ' +
    f(log10(v0 / v1), 3) + ' dex (θeff lo clava al seeing: sin resolución regalada)');
  // F) la ley no tiene argumento de apertura/PSF
  exige(factorH2c.length === 3, 'F: factorH2c(θint, M, SBe) no depende de la PSF por construcción');
})();

/* ═══ 5–7. A/B DE RENDER ═════════════════════════════════════════════════ */
console.log('\n═══ 5. A/B de render (única diferencia: la ley de Cmin) ═══');
var OBJS = [
  { cat: 'NGC 4594', alias: 'M104' },
  { cat: 'NGC 3031', alias: 'M81' },
  { cat: 'NGC 5194', alias: 'M51' },
  { cat: 'NGC 5457', alias: 'M101' },
  { cat: 'NGC 205', alias: 'NGC205' }
];
var CONFIGS = [
  { et: '18a66_212', D: 457.2, M: 66, sqm: 21.2 },
  { et: '18a158_212', D: 457.2, M: 158, sqm: 21.2 },
  { et: '12a152_212', D: 305, M: 152, sqm: 21.2 },
  { et: '18a158_220', D: 457.2, M: 158, sqm: 22.0 }
];
var SIZE = 720, AFOV = 70;

function galDe(nombre) {
  var g = null;
  for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === nombre) g = CAT[i];
  if (!g) return null;
  return { nombre: g[0], ra: g[2], dec: g[3], reArcsec: g[4], ba: g[5], pa: g[6],
           magV: g[7], n: g[8], bt: g[9], nMedido: g[11] || 0,
           ladoArcmin: R.ps1LadoArcmin(g[4]) };
}
/* θint del MODELO del catálogo: diámetro de la isofota μ=25 del perfil Sérsic
   anclado a magV (misma maquinaria que el halo), circularizado por √(b/a). */
function thetaIntDe(gal) {
  var comps = R.ps1ComponentesSersic(gal);
  /* Bisección de μ=25 sobre la SUMA de componentes, en el SEMIEJE MAYOR
     (pa=0 → norte). SINT.radioIsofota medía sobre `este`, que con pa=0 es el
     eje MENOR (r/q): en NGC 205 eso encogía la referencia exactamente 1/ba y
     hacía parecer que producción sobrestimaba. La circularización por √(b/a)
     presupone el semieje mayor. */
  var lo = 1e-4, hi = 1e6;
  function mu(r) { return -2.5 * log10(R.ps1FlujoModelo(comps, 0, r, 0)); }
  if (mu(lo) > 25) return 0;
  for (var i = 0; i < 60; i++) {
    var m = Math.sqrt(lo * hi);
    if (mu(m) <= 25) lo = m; else hi = m;
  }
  return 2 * lo / 60 * Math.sqrt(gal.ba || 1);         // arcmin
}
function cieloDe(cfg, hook) {
  var c = { pupilaSalida: cfg.D / cfg.M, pupilaOjo: 7, sqm: cfg.sqm,
            aumentos: cfg.M, realceMax: PS1.realceMax };
  if (hook) c.cminExperimental = hook;
  return c;
}
function oDe(gal, cfg, cielo) {
  return { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / cfg.M * 60, size: SIZE,
           cielo: cielo, apertura: cfg.D };
}
function construirParche(F, gal) {
  var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null };
  fSim.afin = R.ps1AfinParche(fSim, gal);
  // Gaia: sin muestra aquí (idéntico en A y B; limitación declarada)
  var limpio = R.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, [],
    { afin: fSim.afin, ba: gal.ba, pa: gal.pa });
  var Ap = R.ps1AnclarACatalogo(limpio, F.ancho, F.alto, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
    ladoArcmin: F.ladoArcmin, escalaAs: F.escalaAs });
  var comps = R.ps1ComponentesSersic(gal);
  var peso = R.ps1PesoImagen(Ap, F.ancho, F.alto, F.escalaAs);
  var perfilP = R.ps1PerfilEnParche(comps, gal.pa, F.ancho, F.alto, fSim.afin);
  return { ra: gal.ra, dec: gal.dec, ladoArcmin: F.ladoArcmin,
           ancho: F.ancho, alto: F.alto, afin: fSim.afin,
           comps: comps, pa: gal.pa, halo: R.ps1MedidasHalo(gal, comps),
           peso: peso, escalaMezcla: R.ps1EscalaMezcla(Ap, peso, perfilP),
           datos: Ap };
}
function pintar(Rmod, parche, gal, cfg, hook, psfDatos) {
  var difuso = new Float32Array(SIZE * SIZE);
  var cielo = cieloDe(cfg, hook);
  var o = oDe(gal, cfg, cielo);
  parche.psfD = cfg.D; parche.psfDatos = psfDatos;
  Rmod.ps1PintarParche(difuso, parche, o);
  // El 2º argumento solo actúa con FOT.H2C activa (rama B); en A se ignora.
  return { difuso: difuso, cielo: cielo,
           ctx: Rmod.ctxFotometrico(cieloDe(cfg, hook), parche.thetaIntArcmin) };
}
/* Métricas sobre el lienzo de flujo (difuso: incrementos sobre el fondo). */
function metricas(d, escLAs) {
  var n = 0, flujo = 0, rMax = 0;
  var cx = (SIZE - 1) / 2, cy = (SIZE - 1) / 2;
  var sum = 0, nz = [];
  for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
    var v = d[y * SIZE + x];
    if (v > 0) {
      n++; flujo += v;
      var r = Math.hypot(x - cx, y - cy) * escLAs;
      if (r > rMax) rMax = r;
      nz.push(v);
    }
  }
  nz.sort(function (a, b) { return a - b; });
  return { area: n, flujo: flujo, rVisAs: rMax,
           mediana: nz.length ? nz[nz.length >> 1] : 0 };
}
function perfilRadial(d, escLAs, pasoAs) {
  var cx = (SIZE - 1) / 2, cy = (SIZE - 1) / 2, out = [];
  var nA = Math.ceil(SIZE / 2 * escLAs / pasoAs);
  var suma = new Float64Array(nA), cnt = new Float64Array(nA), vis = new Float64Array(nA);
  for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
    var a = Math.floor(Math.hypot(x - cx, y - cy) * escLAs / pasoAs);
    if (a >= nA) continue;
    var v = d[y * SIZE + x];
    suma[a] += v; cnt[a]++; if (v > 0) vis[a]++;
  }
  for (var i = 0; i < nA; i++) out.push({
    rAs: (i + 0.5) * pasoAs, media: cnt[i] ? suma[i] / cnt[i] : 0,
    fVis: cnt[i] ? vis[i] / cnt[i] : 0 });
  return out;
}
function cambios(dA, dB) {
  var ap = 0, des = 0;
  for (var i = 0; i < dA.length; i++) {
    if (dA[i] > 0 && !(dB[i] > 0)) des++;
    if (!(dA[i] > 0) && dB[i] > 0) ap++;
  }
  return { aparecen: ap, desaparecen: des };
}
function pgm(nombre, arrays, tope) {
  var W = SIZE * arrays.length + 4 * (arrays.length - 1), H = SIZE;
  var img = new Uint8Array(W * H); img.fill(24);
  arrays.forEach(function (d, k) {
    var x0 = k * (SIZE + 4);
    for (var y = 0; y < H; y++) for (var x = 0; x < SIZE; x++) {
      var v = Math.log1p(Math.max(0, d[y * SIZE + x])) / Math.log1p(tope);
      img[y * W + x0 + x] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  });
  var lin = ['P2', W + ' ' + H, '255'];
  for (var y2 = 0; y2 < H; y2++) {
    var l = [];
    for (var x2 = 0; x2 < W; x2++) l.push(img[y2 * W + x2]);
    lin.push(l.join(' '));
  }
  fs.writeFileSync(path.join(OUT, nombre + '.pgm'), lin.join('\n') + '\n');
}

var csvAB = ['objeto,config,theta_int_arcmin,CminA,CminB,ratio_umbral,areaA_px,areaB_px,d_area_pct,flujoA,flujoB,d_flujo_pct,rVisA_as,rVisB_as,aparecen_px,desaparecen_px'];
var csvPerf = ['objeto,config,ley,r_as,media_flujo,fraccion_visible'];
var resumenAB = [];

function correObjeto(gal, alias, F) {
  var thInt = thetaIntDe(gal);
  var parche = construirParche(F, gal);
  /* B ya no va por el gancho de vm: es la IMPLEMENTACIÓN REAL, la bandera
     FOT.H2C de producción con el θint que fabrica ps1ParcheDeGalaxia
     (ps1ThetaIntArcmin: máx. por componente, analítico). El θint de referencia
     del harness (bisección sobre la SUMA de componentes) se conserva para
     vigilar que las dos definiciones no se separen. */
  parche.thetaIntArcmin = R.ps1ThetaIntArcmin(parche.comps, gal.ba);
  exige(Math.abs(parche.thetaIntArcmin / thInt - 1) < 0.05,
    alias + ': θint producción (' + f(parche.thetaIntArcmin, 3) + '′) ≈ bisección de la suma (' +
    f(thInt, 3) + '′)');
  var psfCache = {};
  console.log('\n  ── ' + alias + ' · θint(μ25, circularizado) = ' + f(thInt, 2) + '′ (prod ' +
    f(parche.thetaIntArcmin, 2) + '′) · parche ' +
    F.ancho + '×' + F.alto + ' (' + f(F.escalaAs, 3) + '″/px) ──');
  CONFIGS.forEach(function (cfg) {
    if (!psfCache[cfg.D]) psfCache[cfg.D] = R.ps1PsfParche(parche.datos, F.ancho, F.alto, F.escalaAs, cfg.D);
    var escLAs = (AFOV / cfg.M * 3600) / SIZE;
    var rA = pintar(R, parche, gal, cfg, null, psfCache[cfg.D]);
    R.fot.H2C = R.fot.H2C_DEFECTO;
    var rB = pintar(R, parche, gal, cfg, null, psfCache[cfg.D]);
    R.fot.H2C = null;
    // Cruce implementación real ↔ fórmula del experimento: mismo Cmin.
    var esperado = ganchoH2c(parche.thetaIntArcmin)(
      cieloDe(cfg, null), rA.ctx.Cmin / factorProd(cfg.M),
      { Fcielo: rA.ctx.Fcielo, dim: rA.ctx.dim, T: rA.ctx.T });
    exige(Math.abs(rB.ctx.Cmin / esperado - 1) < 1e-9,
      alias + ' ' + cfg.et + ': el flag de producción reproduce la fórmula H2c del experimento');
    var mA = metricas(rA.difuso, escLAs), mB = metricas(rB.difuso, escLAs);
    var ch = cambios(rA.difuso, rB.difuso);
    var dArea = mA.area ? (mB.area - mA.area) / mA.area * 100 : (mB.area ? Infinity : 0);
    var dFlujo = mA.flujo ? (mB.flujo - mA.flujo) / mA.flujo * 100 : (mB.flujo ? Infinity : 0);
    csvAB.push([alias, cfg.et, f(thInt, 3), rA.ctx.Cmin.toExponential(4), rB.ctx.Cmin.toExponential(4),
      f(rB.ctx.Cmin / rA.ctx.Cmin, 3), mA.area, mB.area, f(dArea, 1),
      mA.flujo.toExponential(4), mB.flujo.toExponential(4), f(dFlujo, 1),
      f(mA.rVisAs, 0), f(mB.rVisAs, 0), ch.aparecen, ch.desaparecen].join(','));
    perfilRadial(rA.difuso, escLAs, 4).forEach(function (p) {
      if (p.media > 0 || p.fVis > 0) csvPerf.push([alias, cfg.et, 'A', f(p.rAs, 1), p.media.toExponential(3), f(p.fVis, 3)].join(','));
    });
    perfilRadial(rB.difuso, escLAs, 4).forEach(function (p) {
      if (p.media > 0 || p.fVis > 0) csvPerf.push([alias, cfg.et, 'B', f(p.rAs, 1), p.media.toExponential(3), f(p.fVis, 3)].join(','));
    });
    resumenAB.push({ alias: alias, cfg: cfg.et, ratio: rB.ctx.Cmin / rA.ctx.Cmin,
      dArea: dArea, dFlujo: dFlujo, ch: ch, mA: mA, mB: mB });
    console.log('    ' + cfg.et + ': Cmin ' + f(rA.ctx.Cmin, 4) + '→' + f(rB.ctx.Cmin, 4) +
      ' (×' + f(rB.ctx.Cmin / rA.ctx.Cmin, 2) + ') · área ' + mA.area + '→' + mB.area +
      ' px (' + f(dArea, 1) + ' %) · flujo ' + f(dFlujo, 1) + ' % · +' + ch.aparecen + '/−' + ch.desaparecen + ' px');
    if (cfg.et === '18a158_212') {
      var tope = 0;
      for (var i = 0; i < rA.difuso.length; i++) tope = Math.max(tope, rA.difuso[i], rB.difuso[i]);
      if (tope > 0) pgm(alias + '_A_vs_B_18a158', [rA.difuso, rB.difuso], tope);
    }
  });
}

/* Objeto sintético controlado (μ(re)=22.5, n=3, D25=6′): separa algoritmo de
   estructura real. El parche es el MODELO puro sobre la rejilla (sin PS1). */
function correSintetico() {
  var ob = SINT.objeto(6);          // D25 = 6′, μ(re)=22.5, n=3, b/a=1
  var gal = { nombre: 'SINT6', ra: 180, dec: 30, reArcsec: ob.re, ba: 1, pa: 0,
              magV: ob.magV, n: SINT.N_SERSIC, bt: 0, nMedido: 0,
              ladoArcmin: R.ps1LadoArcmin(ob.re) };
  var lado = gal.ladoArcmin, AN = 512, escAs = lado * 60 / AN;
  var datos = new Float32Array(AN * AN);
  for (var y = 0; y < AN; y++) for (var x = 0; x < AN; x++) {
    var este = (x - (AN - 1) / 2) * escAs, norte = (y - (AN - 1) / 2) * escAs;
    datos[y * AN + x] = R.ps1FlujoModelo(ob.comps, 0, norte, este);
  }
  var F = { ancho: AN, alto: AN, escalaAs: escAs, ladoArcmin: lado, datos: datos, wcs: null };
  correObjeto(gal, 'SINT6', F);
}

var cola = Promise.resolve();
OBJS.forEach(function (spec) {
  cola = cola.then(function () {
    var gal = galDe(spec.cat);
    if (!gal) { console.log('  ⚠ ' + spec.alias + ' no está en el catálogo'); return; }
    if (SIN_RED && spec.alias !== 'M104') return;
    return B.bajar(gal.ra, gal.dec, gal.ladoArcmin, 1024)
      .then(function (F) { correObjeto(gal, spec.alias, F); })
      .catch(function (e) { console.log('  ⚠ ' + spec.alias + ' sin parche (' + e.message + '): se omite'); });
  });
});

cola.then(function () {
  try { correSintetico(); }
  catch (e) { console.log('  ⚠ sintético: ' + e.message); }

  fs.writeFileSync(path.join(OUT, 'ab_metricas.csv'), csvAB.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'ab_perfiles.csv'), csvPerf.join('\n') + '\n');
  console.log('\n  ab_metricas.csv / ab_perfiles.csv escritos (' + (csvAB.length - 1) + ' filas)');

  /* ═══ 7b. Artefactos del desvanecido ═══ */
  console.log('\n═══ 7. Artefactos (desvanecido UMBRAL_MARGEN/ANCHURA) ═══');
  var brusco = resumenAB.filter(function (r) {
    return isFinite(r.dArea) && Math.abs(r.dArea) > 0 && (r.ch.aparecen + r.ch.desaparecen) >
      0.5 * Math.max(r.mA.area, r.mB.area, 1);
  });
  console.log('  configuraciones con >50 % de píxeles cambiando de estado: ' + brusco.length +
    (brusco.length ? '  ← revisar en el informe' : ' (transiciones suaves)'));

  /* ═══ 9. REGRESIÓN ═══ */
  console.log('\n═══ 9. Tests existentes (sin tocar nada) ═══');
  ['test_psf_produccion.js', 'test_resolucion_ps1.js', 'test_difuso.js',
   'test_quitar_estrellas.js', 'test_bilineal_parche.js'].forEach(function (t) {
    var r = cp.spawnSync('node', [path.join(__dirname, t)], { encoding: 'utf8', timeout: 300000 });
    exige(r.status === 0, t + ' exit ' + r.status);
    if (r.status !== 0) console.error((r.stdout || '').split('\n').filter(function (l) {
      return /FALLA|Error/.test(l); }).slice(0, 5).join('\n'));
  });

  /* Sensibilidad del θint (Parte 10-D): el umbral B con θint ×0.7 y ×1.4 */
  console.log('\n═══ Sensibilidad a la definición de θint (M104, 18" 158x, sqm 21.2) ═══');
  var galM104 = galDe('NGC 4594');
  if (galM104) {
    var th0 = thetaIntDe(galM104);
    [0.7, 1, 1.4].forEach(function (k) {
      var fac = factorH2c(th0 * k, 158, 23.3);
      console.log('  θint ×' + k + ' (' + f(th0 * k, 2) + '′): factor de tamaño ' + f(fac, 3) +
        ' (Δ ' + f(log10(fac / factorH2c(th0, 158, 23.3)), 3) + ' dex)');
    });
  }

  fs.writeFileSync(path.join(OUT, 'parametros_h2c.json'), JSON.stringify({
    ley: 'Cmin = C_MIN·(Fref/(Fcielo·dim))^C_EXP · (1+θR(SBe)/θeff_app)²',
    thetaR: 'log10 θR(arcmin) = 0.094 + 0.081·SBe', seeingArcsec: SEEING_AS,
    anclaje: 'conserva C_MIN=' + FOT.C_MIN + ' (K=' + f(K21, 3) + ' sobre Blackwell 50% lab, fondo 21)',
    thetaInt: '2·r(μ25 del modelo Sérsic del catálogo)·√(b/a)',
    leyA_rama: { C_MAG_EXP: FOT.C_MAG_EXP, C_MAG_MIN: FOT.C_MAG_MIN, C_MAG_MAX: FOT.C_MAG_MAX },
    leyA0_main: { C_MAG_EXP: Rmain.fot.C_MAG_EXP, C_MAG_MIN: Rmain.fot.C_MAG_MIN, C_MAG_MAX: Rmain.fot.C_MAG_MAX }
  }, null, 2));

  console.log('\n════════════════ RESULTADO ════════════════');
  if (fallos) { console.error(fallos + ' exigencias fallidas'); process.exit(1); }
  console.log('todas las exigencias pasan · salidas en docs/ricco/anclaje/');
}).catch(function (e) { console.error('ABORTO: ' + (e.stack || e)); process.exit(1); });
