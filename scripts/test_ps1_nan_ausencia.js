#!/usr/bin/env node
/* Test de semántica de ausencia en el parche PS1 (previo al cambio de producción
   del INFORME2 y guardián después de él).

   Dos modos:
     node scripts/test_ps1_nan_ausencia.js actual   ← documenta la semántica
       vigente y guarda la línea base (test_nan_baseline.json);
     node scripts/test_ps1_nan_ausencia.js nuevo    ← exige la semántica nueva
       (v < cielo−2σ y NaN del stack = ausencia / fuera del parche) y compara
       contra la línea base.

   Casos:
     A  píxel válido: idéntico en ambos modos (anclaje bit a bit).
     B  bloque sobresustraído (v ≪ cielo−2σ): actual → 0 y no se pinta;
        nuevo → NaN y el lienzo recibe exactamente (1−w)·perfil (aquí w=0 en el
        centro del bloque: el modelo entero, con su opacidad).
     C  NaN aislado ya existente (hueco del stack).
     D  región contigua de NaN.
     E  NGC 205 real: los huecos de estrellas saturadas no fabrican puntos
        brillantes ni halo artificial.
     F  M51 real: el foso desaparece sin discontinuidades nuevas.

   Sin red si los parches están en la caché del harness. */
'use strict';

var fs = require('fs'), path = require('path');
var RAIZ = path.join(__dirname, '..');
var OUT = path.join(RAIZ, '.scratch', 'diagnostico-oscuros');
fs.mkdirSync(OUT, { recursive: true });
var BASE = path.join(OUT, 'test_nan_baseline.json');

// Sin argumento hace de GUARDIÁN de la semántica nueva (modo 'nuevo'); 'actual'
// solo sirvió para fijar la línea base con el módulo previo al cambio.
var MODO = process.argv[2] || 'nuevo';
if (MODO !== 'actual' && MODO !== 'nuevo') {
  console.error('uso: node scripts/test_ps1_nan_ausencia.js [actual|nuevo]');
  process.exit(2);
}

global.window = {};
require(path.join(RAIZ, 'resources', 'js', 'bitacora-gaia-render.js'));
require(path.join(RAIZ, 'simulador_ocular', 'resources', 'js', 'galaxias-datos.js'));
var R = global.window.BitacoraGaiaRender;
var CAT = global.window.BITACORA_GALAXIAS;
var FOT = R.fot, PS1 = R.ps1;
var B = require('./lib_bajar_parche.js')(R);
var IN_GAIA = path.join(RAIZ, '.scratch', 'quitar-general');
var SIZE = 720, AFOV = 70, CFG = { D: 457.2, M: 190, sqm: 21.2 };

var fallos = 0;
function exige(c, t) { if (c) console.log('  ok   ' + t); else { fallos++; console.error('  FALLA ' + t); } }
function nota(t) { console.log('  nota ' + t); }
function filaCat(n) { for (var i = 0; i < CAT.length; i++) if (CAT[i][0] === n) return CAT[i]; return null; }
function galDeFila(g) {
  return { nombre: g[0], ra: g[2], dec: g[3], reArcsec: g[4], ba: g[5], pa: g[6],
           magV: g[7], n: g[8], bt: g[9], nMedido: g[11] || 0,
           ladoArcmin: R.ps1LadoArcmin(g[4]) };
}
function leerGaia(f) {
  return fs.readFileSync(path.join(IN_GAIA, f), 'utf8').trim().split('\n').slice(1)
    .map(function (l) { var t = l.split(','); return [parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2])]; });
}
function oDe(gal) {
  var cielo = { pupilaSalida: CFG.D / CFG.M, pupilaOjo: 7, sqm: CFG.sqm,
                aumentos: CFG.M, realceMax: PS1.realceMax, perceptual: true };
  return { ra0: gal.ra, dec0: gal.dec, arcmin: AFOV / CFG.M * 60, size: SIZE,
           cielo: cielo, apertura: CFG.D };
}
function nivelPantalla(difuso, c) {
  var out = new Float32Array(difuso.length);
  for (var i = 0; i < difuso.length; i++) {
    var F = difuso[i];
    if (F > 0 && FOT.GAMMA_PERCEPTUAL !== 1) F = R.realzarPerceptual(F, c.Fcielo, c.rango, 0, PS1.realceMax);
    out[i] = c.nivelFondo + R.valorDeFlujo(F, c.Fcielo, c.rango);
  }
  return out;
}
function pct(arr, p) {
  var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
  return a.length ? a[Math.floor(a.length * p)] : NaN;
}
function mediana(a) { return pct(a, 0.5); }
function radiosLienzo(gal, arcmin) {
  var aspx = arcmin * 60 / SIZE, cx = (SIZE - 1) / 2, cy = (SIZE - 1) / 2;
  var paR = (gal.pa || 0) * Math.PI / 180, s = Math.sin(paR), co = Math.cos(paR);
  var ba = (gal.ba > 0 && gal.ba <= 1) ? gal.ba : 1;
  var r = new Float32Array(SIZE * SIZE);
  for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
    var norte = -(y - cy) * aspx, este = -(x - cx) * aspx;
    var u = este * s + norte * co, v = -este * co + norte * s;
    r[y * SIZE + x] = Math.hypot(u, v / ba);
  }
  return r;
}
function enAnillo(mapa, r, r0, r1) {
  var m = [];
  for (var i = 0; i < mapa.length; i++) if (r[i] >= r0 && r[i] < r1) m.push(mapa[i]);
  return m;
}
// Cadena completa de producción a partir del parche crudo F.
function cadena(gal, F, csv) {
  var fSim = { ancho: F.ancho, alto: F.alto, escalaAs: F.escalaAs, wcs: F.wcs || null };
  fSim.afin = R.ps1AfinParche(fSim, gal);
  var enPx = R.ps1EstrellasEnPixeles(fSim, gal, csv ? leerGaia(csv) : []);
  var escena = R.ps1EscenaEnParche(fSim, gal, R.ps1GalaxiasDelCampo(CAT, gal.ra, gal.dec, gal.ladoArcmin));
  var limpio = R.ps1QuitarEstrellas(F.datos, F.ancho, F.alto, enPx,
    { afin: fSim.afin, ba: gal.ba, pa: gal.pa, escena: escena });
  var comps = R.ps1ComponentesSersic(gal);
  var datos = R.ps1AnclarACatalogo(limpio, F.ancho, F.alto, {
    magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
    ladoArcmin: gal.ladoArcmin, escalaAs: F.escalaAs });
  var peso = R.ps1PesoImagen(datos, F.ancho, F.alto, F.escalaAs);
  var perfil = R.ps1PerfilEnParche(comps, gal.pa, F.ancho, F.alto, fSim.afin);
  return { ra: gal.ra, dec: gal.dec, ladoArcmin: gal.ladoArcmin,
           ancho: F.ancho, alto: F.alto, afin: fSim.afin,
           comps: comps, pa: gal.pa, halo: R.ps1MedidasHalo(gal, comps),
           thetaIntArcmin: R.ps1ThetaIntArcmin(comps, gal.ba),
           peso: peso, escalaMezcla: R.ps1EscalaMezcla(datos, peso, perfil),
           datos: datos };
}
function pintar(parche, o) {
  var difuso = new Float32Array(SIZE * SIZE);
  o.cielo.galaxiaMask = null;                    // máscara limpia por pintado
  R.ps1PintarParche(difuso, parche, o);
  return difuso;
}

var base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};
var nuevaBase = {};

/* ═══ SINTÉTICO (casos A–D): parche fabricado sobre la geometría de M81 ═══ */
console.log('── sintético (A–D), modo ' + MODO + ' ──');
(function () {
  var gal = galDeFila(filaCat('NGC 3031'));
  var N = 256, lado = gal.ladoArcmin, escalaAs = lado * 60 / N;
  var fSim = { ancho: N, alto: N, escalaAs: escalaAs, wcs: null };
  fSim.afin = R.ps1AfinParche(fSim, gal);
  var a = fSim.afin;
  // Disco exponencial + ruido determinista; cielo≈0.
  var datos = new Float32Array(N * N);
  // Gaussiana: en el borde del parche solo queda el ruido (cielo≈0, σ≈ruido).
  var cx = (N - 1) / 2, cy = (N - 1) / 2, rd = 0.10 * lado * 60;   // escala del disco, ″
  for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
    var i = y * N + x;
    var ruido = 8 * Math.sin(i * 0.7331) * Math.cos(i * 0.1291);
    var rAs = Math.hypot(x - cx, y - cy) * escalaAs;
    datos[i] = ruido + 30000 * Math.exp(-(rAs / rd) * (rAs / rd));
  }
  /* Marcadores a un mismo radio (~0.9·rd), separados en acimut. Los bloques son
     de 4×4 px (≈24″): MÁS PEQUEÑOS que la caja del peso (radio 25″), para que
     w se quede alto alrededor — que es la situación de M51, donde el modelo NO
     entra hoy. Un bloque mayor que la caja hunde w y el modelo entra ya en
     producción: eso no reproduce el defecto. */
  var rr = Math.round(0.9 * rd / escalaAs);
  var pA = Math.round(cy) * N + (Math.round(cx) + rr);           // A: válido
  var bx = Math.round(cx) - rr, by = Math.round(cy) - 2;         // B: bloque -200 (4×4)
  var cxp = Math.round(cx), cyp = Math.round(cy) + rr;           // C: NaN aislado
  var dx0 = Math.round(cx) - 2, dy0 = Math.round(cy) - rr;       // D: 4×4 NaN
  for (var yy = 0; yy < 4; yy++) for (var xx = 0; xx < 4; xx++) datos[(by + yy) * N + (bx + xx)] = -200;
  datos[cyp * N + cxp] = NaN;
  for (yy = 0; yy < 4; yy++) for (xx = 0; xx < 4; xx++) datos[(dy0 + yy) * N + (dx0 + xx)] = NaN;

  var cielo = R.ps1Cielo(datos, N, N), sigma = R.ps1SigmaCielo(datos, N, N, cielo);
  nota('cielo=' + cielo.toFixed(2) + ' σ=' + sigma.toFixed(2) +
       ' corte(2σ)=' + (cielo - 2 * sigma).toFixed(2) + ' suelo=' + (cielo + PS1.kRuido * sigma).toFixed(2));
  exige(-200 < cielo - 2 * sigma, 'el bloque B queda por debajo de cielo−2σ');

  var oAnc = { magV: gal.magV, n: gal.n, reArcsec: gal.reArcsec,
               ladoArcmin: gal.ladoArcmin, escalaAs: escalaAs };
  var anc = R.ps1AnclarACatalogo(datos, N, N, oAnc);
  var comps = R.ps1ComponentesSersic(gal);
  var peso = R.ps1PesoImagen(anc, N, N, escalaAs);
  var perfil = R.ps1PerfilEnParche(comps, gal.pa, N, N, fSim.afin);
  var sMezcla = R.ps1EscalaMezcla(anc, peso, perfil);
  var parche = { ra: gal.ra, dec: gal.dec, ladoArcmin: lado, ancho: N, alto: N,
                 afin: fSim.afin, comps: comps, pa: gal.pa,
                 halo: R.ps1MedidasHalo(gal, comps),
                 thetaIntArcmin: R.ps1ThetaIntArcmin(comps, gal.ba),
                 peso: peso, escalaMezcla: sMezcla, datos: anc };
  exige(R.ps1HaloActivo(parche.halo), 'halo activo (la mezcla imagen/modelo está en juego)');
  exige(isFinite(sMezcla) && sMezcla > 0, 'escalaMezcla finita y positiva: ' + sMezcla.toFixed(4));

  var iB = (by + 1) * N + (bx + 1), iC = cyp * N + cxp, iD = (dy0 + 1) * N + (dx0 + 1);
  nuevaBase.sint = { ancA: anc[pA], sMezcla: sMezcla, wB: peso[iB], wC: peso[iC], wD: peso[iD] };

  if (MODO === 'actual') {
    exige(anc[iB] === 0, 'B (sobresustraído) ancla a 0 — semántica vigente');
    exige(anc[iC] === 0, 'C (NaN del stack) ancla a 0 — semántica vigente: el hueco DEJA de ser hueco aquí');
    exige(anc[iD] === 0, 'D (región NaN) ancla a 0 — semántica vigente');
  } else {
    exige(anc[iB] !== anc[iB], 'B (sobresustraído) ancla a NaN (ausencia)');
    exige(anc[iC] !== anc[iC], 'C (NaN del stack) sigue NaN (ausencia unificada)');
    exige(anc[iD] !== anc[iD], 'D (región NaN) sigue NaN');
    exige(anc[pA] === base.sint.ancA, 'A: el píxel válido ancla BIT A BIT igual que antes');
    exige(peso[iB] === base.sint.wB && peso[iC] === base.sint.wC && peso[iD] === base.sint.wD,
      'peso: NaN cuenta como sin-señal, igual que el 0 de antes (sin cambio)');
    exige(Math.abs(sMezcla - base.sint.sMezcla) / base.sint.sMezcla < 0.05,
      'escalaMezcla no envenenada por NaN y estable (Δ ' +
      (100 * (sMezcla - base.sint.sMezcla) / base.sint.sMezcla).toFixed(2) + ' %)');
  }

  // Pintado: del píxel del parche al del lienzo (afín por defecto, sin giro).
  var o = oDe(gal);
  var escv = SIZE / (o.arcmin / 60), pxPorAs = escv / 3600, q = N / (lado * 60);
  function lienzoDe(px, py) {
    var este = (a.cx - px) / q, norte = (py - a.cy) / q;
    return { x: Math.round(SIZE / 2 - este * pxPorAs), y: Math.round(SIZE / 2 - norte * pxPorAs) };
  }
  var difuso = pintar(parche, o);
  var c = R.ctxFotometrico(o.cielo, parche.thetaIntArcmin);
  var umbral = R.sbUmbralContraste(c);
  // Puntos de medida: el CENTRO geométrico de cada bloque 4×4 (los 4 vecinos de
  // la bilineal caen dentro del bloque; el redondeo al px del lienzo desvía
  // <0,2 px de parche, dentro del interior del bloque).
  var pB = lienzoDe(bx + 1.5, by + 1.5), pC = lienzoDe(cxp, cyp), pD = lienzoDe(dx0 + 1.5, dy0 + 1.5);
  var fB = difuso[pB.y * SIZE + pB.x], fC = difuso[pC.y * SIZE + pC.x], fD = difuso[pD.y * SIZE + pD.x];
  // Modelo con su rampa en un punto del parche (lo que debe quedar si el bloque
  // es AUSENCIA pura: fv=0, wv=0 → f = perfil).
  function modeloConRampa(px, py) {
    var este = (a.cx - px) / q, norte = (py - a.cy) / q;
    var fm = R.ps1FlujoModelo(parche.comps, parche.pa, norte, este);
    if (!(fm > 0)) return 0;
    return R.ps1FlujoConOpacidad(fm, R.ps1Opacidad(-2.5 * Math.log10(fm), umbral), c);
  }
  var mB = modeloConRampa(bx + 1.5, by + 1.5), mD = modeloConRampa(dx0 + 1.5, dy0 + 1.5);
  nuevaBase.sintPintado = { fB: fB, fC: fC, fD: fD };

  if (MODO === 'actual') {
    // Hoy el bloque ancla a 0 y el peso alrededor sigue alto: solo entra la
    // fracción (1−w)·modelo, muy por debajo del modelo entero. Ese déficit ES
    // el defecto de M51.
    exige(fB < 0.6 * mB, 'B se queda muy por debajo del modelo (f=' + fB.toExponential(3) +
      ' modelo=' + mB.toExponential(3) + '): el 0 con w alto bloquea el relleno — el defecto');
    exige(fD < 0.6 * mD, 'D ídem con NaN del stack (f=' + fD.toExponential(3) +
      ' modelo=' + mD.toExponential(3) + ')');
    nota('C aislado: f=' + fC.toExponential(3) + ' (bilineal mezcla con vecinos finitos)');
  } else {
    // Ausencia: los 4 vecinos NaN aportan fv=0, wv=0 y cuentan en la cobertura
    // → el lienzo trae EXACTAMENTE el modelo con su rampa, sin renormalizar.
    exige(fB > 0, 'B se pinta (ausencia → (1−w)·perfil)');
    exige(Math.abs(fB - mB) <= 2e-2 * Math.max(mB, 1e-30),
      'B trae el MODELO exacto (f=' + fB.toExponential(3) + ' esperado=' + mB.toExponential(3) + ')');
    exige(fD > 0 && Math.abs(fD - mD) <= 2e-2 * Math.max(mD, 1e-30),
      'D (región NaN del stack) trae el modelo exacto: semántica UNIFICADA con la sobresustracción');
    exige(fC > 0, 'C aislado se pinta');
    exige(fB <= mB * 1.02 && fD <= mD * 1.02,
      'el relleno no INVENTA brillo por encima del modelo');
    // La igualdad del caso A se exige en el ANCLAJE (bit a bit, arriba): el
    // nivel pintado cambia legítimamente porque deltaExp también cambia.
  }
})();

/* ═══ E: NGC 205 — huecos de estrellas saturadas ═══ */
console.log('── E: NGC 205, modo ' + MODO + ' ──');
var gal205 = galDeFila(filaCat('NGC 205'));
B.bajar(gal205.ra, gal205.dec, gal205.ladoArcmin, PS1.salida).then(function (F205) {
  var nHuecos = 0;
  for (var i = 0; i < F205.datos.length; i++) if (!isFinite(F205.datos[i])) nHuecos++;
  nota('huecos crudos del stack: ' + nHuecos + ' px (' + (100 * nHuecos / F205.datos.length).toFixed(3) + ' %)');
  var parche = cadena(gal205, F205, 'gaia_ngc205.csv');
  var o = oDe(gal205);
  var difuso = pintar(parche, o);
  var c = R.ctxFotometrico(o.cielo, parche.thetaIntArcmin);
  var E = nivelPantalla(difuso, c);
  var r = radiosLienzo(gal205, o.arcmin);
  var aAs = parche.halo.aArcmin * 60 / 2;                        // semieje isofota 25
  var cuerpo = enAnillo(E, r, 0, aAs), fuera = enAnillo(E, r, aAs * 1.2, aAs * 1.6);
  var pintadoFuera = 0;
  for (i = 0; i < fuera.length; i++) if (fuera[i] > c.nivelFondo + 0.5) pintadoFuera++;
  var m = { maxE: pct(cuerpo, 1 - 1e-9), p99: pct(cuerpo, 0.99), p50: mediana(cuerpo),
            fueraPct: 100 * pintadoFuera / Math.max(1, fuera.length),
            flujoTotal: difuso.reduce(function (s, v) { return s + v; }, 0) };
  nota('cuerpo p50=' + m.p50.toFixed(2) + ' p99=' + m.p99.toFixed(2) + ' max=' + m.maxE.toFixed(2) +
       '; fuera(1.2–1.6a) pintado=' + m.fueraPct.toFixed(1) + ' %; flujo=' + m.flujoTotal.toExponential(4));
  nuevaBase.n205 = m;
  if (MODO === 'nuevo') {
    exige(m.maxE <= base.n205.maxE + 2, 'sin puntos brillantes nuevos (max E ' +
      m.maxE.toFixed(2) + ' ≤ ' + base.n205.maxE.toFixed(2) + '+2)');
    exige(m.fueraPct <= base.n205.fueraPct + 5, 'sin halo artificial fuera del cuerpo (' +
      m.fueraPct.toFixed(1) + ' % ≤ ' + base.n205.fueraPct.toFixed(1) + '+5)');
    exige(Math.abs(m.flujoTotal - base.n205.flujoTotal) / base.n205.flujoTotal < 0.10,
      'flujo total estable (Δ ' + (100 * (m.flujoTotal - base.n205.flujoTotal) / base.n205.flujoTotal).toFixed(2) + ' %)');
  }

  /* ═══ F: M51 — el foso desaparece sin discontinuidades ═══ */
  console.log('── F: M51, modo ' + MODO + ' ──');
  var gal51 = galDeFila(filaCat('NGC 5194'));
  return B.bajar(gal51.ra, gal51.dec, gal51.ladoArcmin, PS1.salida).then(function (F51) {
    var parche51 = cadena(gal51, F51, 'gaia_ngc5194.csv');
    var o51 = oDe(gal51);
    var difuso51 = pintar(parche51, o51);
    var c51 = R.ctxFotometrico(o51.cielo, parche51.thetaIntArcmin);
    var E51 = nivelPantalla(difuso51, c51);
    var r51 = radiosLienzo(gal51, o51.arcmin);
    /* Perfil elíptico de medianas cada 8″, 40–300″; foso = primer anillo ≤
       fondo+0.2. La continuidad se mide en RELATIVO: caída entre anillos
       vecinos partida por la amplitud local (prev − fondo). El salto absoluto
       no compara renders con niveles globales distintos: una caída de 7
       niveles dentro de un cuerpo a 15 sobre el fondo es menos discontinua que
       una de 5 que aterriza EN el fondo (la de producción vieja, ratio 1,0). */
    var perfilR = [], rFoso = 0, saltoRelMax = 0;
    for (var rb = 40; rb < 300; rb += 8) {
      var mR = mediana(enAnillo(E51, r51, rb, rb + 8));
      perfilR.push(mR);
      if (!rFoso && mR <= c51.nivelFondo + 0.2) rFoso = rb;
      if (perfilR.length > 1) {
        var prev = perfilR[perfilR.length - 2];
        if (prev > c51.nivelFondo + 0.5) {
          var rel = (prev - mR) / (prev - c51.nivelFondo);
          if (rel > saltoRelMax) saltoRelMax = rel;
        }
      }
    }
    var anillo = enAnillo(E51, r51, 60, 160);
    var m51 = { p20: pct(anillo, 0.2), p50: mediana(anillo), rFoso: rFoso || 300,
                saltoRelMax: saltoRelMax, perfilR: perfilR };
    nota('anillo 60–160″ p20=' + m51.p20.toFixed(2) + ' p50=' + m51.p50.toFixed(2) +
         '; foso desde r=' + m51.rFoso + '″; salto relativo máximo=' + m51.saltoRelMax.toFixed(2));
    nuevaBase.m51 = m51;
    if (MODO === 'nuevo') {
      exige(m51.rFoso >= 200, 'el foso interno desaparece (arrancaba en ' + base.m51.rFoso + '″, ahora ' + m51.rFoso + '″)');
      exige(m51.p50 >= base.m51.p50 + 4, 'la mediana del anillo sube (' +
        base.m51.p50.toFixed(2) + ' → ' + m51.p50.toFixed(2) + ')');
      exige(m51.p20 > c51.nivelFondo + 0.2, 'el negro absoluto desaparece (p20 ' +
        m51.p20.toFixed(2) + ' > fondo ' + c51.nivelFondo.toFixed(2) + '+0.2)');
      exige(m51.saltoRelMax <= base.m51.saltoRelMax + 0.05, 'sin discontinuidades nuevas (salto relativo ' +
        m51.saltoRelMax.toFixed(2) + ' ≤ ' + base.m51.saltoRelMax.toFixed(2) + '+0.05)');
    }

    if (MODO === 'actual') {
      fs.writeFileSync(BASE, JSON.stringify(nuevaBase, null, 1));
      nota('línea base guardada en ' + path.relative(RAIZ, BASE));
    }
    console.log(fallos ? '\nFALLOS: ' + fallos : '\nTodo en orden (' + MODO + ').');
    process.exit(fallos ? 1 : 0);
  });
}).catch(function (e) { console.error(e); process.exit(2); });
