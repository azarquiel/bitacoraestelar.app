#!/usr/bin/env node
/* Test de la CADENA FOTOMÉTRICA COMPARTIDA y de las capas difusas del render de
   Gaia (resources/js/bitacora-gaia-render.js).

   Vigila los tres sitios donde un error es silencioso y visualmente plausible:
   la pupila de salida aplicada dos veces, el anclaje del brillo superficial y el
   ajuste de perfiles sobre conteos sesgados.

   Sin dependencias:  node scripts/test_difuso.js

   Crece con las fases: hoy cubre la cadena fotométrica (F1). Los asserts de
   Rayleigh→μ, King y telón entran con sus fases. */
'use strict';

// El módulo es un IIFE de navegador: se cuelga de window y no exporta nada.
global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var fallos = 0;
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(4));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toFixed(4) +
      ' ±' + tol + '\n         obtenido ' + actual.toFixed(4));
  }
}
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

/* Invierte la curva del fondo: del gris 0–255 al brillo superficial en el ocular
   (mag/arcsec²). Así se comprueba la FÍSICA, no el tono en pantalla. */
function sbDelFondo(nivel) {
  return FOT.SB_CIELO_NEGRO - (nivel / 255) * (FOT.SB_CIELO_NEGRO - FOT.SB_CIELO_BLANCO);
}
function sbEnOcular(pupilaSalida, transmision) {
  // sqm 19: deja el gris en mitad de la curva, lejos de los recortes a 0 y 255.
  return sbDelFondo(R.ctxFotometrico({
    pupilaSalida: pupilaSalida, pupilaOjo: 7, sqm: 19,
    transmision: (transmision != null) ? transmision : 1
  }).nivelFondo);
}

/* ── 1. La pupila de salida se aplica UNA sola vez ─────────────────────────────
   Es el fallo más probable de toda la cadena y el más difícil de ver a ojo: si
   un motor vuelve a atenuar su Fobj, la imagen sale plausible pero mal.
   Entre dos pupilas el fondo debe separarse exactamente −2,5·log10((p1/p2)²). */
console.log('Pupila de salida aplicada una sola vez:');
var p1 = 7, p2 = 3.5;
var esperadoDelta = -2.5 * Math.log10(Math.pow(p2 / p1, 2));
casi(sbEnOcular(p2) - sbEnOcular(p1), esperadoDelta, 1e-9,
  'Δ(mag/arcsec²) entre pupila ' + p1 + ' y ' + p2 + ' mm');

var p3 = 1.75;
casi(sbEnOcular(p3) - sbEnOcular(p2), -2.5 * Math.log10(Math.pow(p3 / p2, 2)), 1e-9,
  'Δ entre ' + p2 + ' y ' + p3 + ' mm (misma razón, mismo salto)');

/* ── 2. Tope al brillo de ojo desnudo ────────────────────────────────────────
   Con d_ep > d_eye el ojo recorta el haz: el fondo NO sigue aclarándose. */
console.log('Tope de la pupila del ojo:');
casi(sbEnOcular(12), sbEnOcular(7), 1e-9, 'pupila 12 mm = pupila 7 mm (recortado)');
ok(sbEnOcular(3.5) > sbEnOcular(7), 'más aumento → fondo más oscuro (SBe mayor)');

/* ── 3. La transmisión entra en el fondo, no solo en la magnitud límite ────── */
console.log('Transmisión del tubo en el fondo:');
casi(sbEnOcular(7, 0.7) - sbEnOcular(7, 1), -2.5 * Math.log10(0.7), 1e-9,
  'Δ por T = 0,7');

/* ── 4. Magnitud límite: recorte de apertura efectiva ────────────────────────
   Con pupila de salida > pupila del ojo se desperdicia apertura: D_eff = MAG·d_eye.
   Sin este recorte el simulador es optimista a poca potencia. */
console.log('Magnitud límite, apertura efectiva:');
var comun = { apertura: 200, transmision: 0.8, sqm: 21, pupilaOjo: 7 };
function mlim(aumentos) {
  var o = { aumentos: aumentos };
  for (var k in comun) o[k] = comun[k];
  return R.magLimite(o);
}
// A 10x la pupila de salida es 20 mm (≫ 7): D_eff = 70 mm, no 200.
var conRecorte = mlim(10);
var sinRecorte = -22.81 + 1.792 * 21 - 0.02949 * 21 * 21 + 2.5 * Math.log10(200 * 200 * 0.8);
ok(conRecorte < sinRecorte - 1, 'a 10x (pupila 20 mm) el recorte penaliza más de 1 mag');
casi(mlim(10), mlim(10), 0, 'determinista');
// A 100x la pupila es 2 mm (< 7): sin recorte, D_eff = D.
var SB0T = Math.max(21, Math.min(27, 21 + 5 * Math.log10(7.5 * 100 / (200 * Math.sqrt(0.8)))));
casi(mlim(100), -22.81 + 1.792 * SB0T - 0.02949 * SB0T * SB0T + 2.5 * Math.log10(200 * 200 * 0.8),
  1e-9, 'a 100x (pupila 2 mm) usa la apertura completa');

/* ── 5. Telón difuso: la pendiente se mide, no se supone ─────────────────────
   Campo sintético con log10 N(m) de pendiente conocida. Si el ajuste se comiera
   la truncadura del catálogo, saldría una pendiente falsamente plana. */
console.log('Telón: ajuste de la pendiente de conteos:');
function campoSintetico(b, mcat, nTotal, radioGrados) {
  // Reparte estrellas con N(m) ∝ 10^(b·m) hasta mcat, uniformes en el campo.
  var est = [], mlo = mcat - 6;
  var acum = [], total = 0, PASO = 0.1, m;
  for (m = mlo; m < mcat; m += PASO) { total += Math.pow(10, b * m); acum.push([m, total]); }
  for (var i = 0; i < nTotal; i++) {
    var u = (i + 0.5) / nTotal * total, mag = mcat;
    for (var j = 0; j < acum.length; j++) if (acum[j][1] >= u) { mag = acum[j][0]; break; }
    // Posición determinista y bien repartida (sin RNG: el test debe ser estable).
    var a = i * 2.399963, r = radioGrados * Math.sqrt((i + 0.5) / nTotal);
    est.push([10 + r * Math.cos(a), 40 + r * Math.sin(a), mag, 0.8]);
  }
  return est;
}
var campo = campoSintetico(0.32, 16.5, 6000, 0.4);
var aj = R.pendienteConteos(campo);
casi(aj.b, 0.32, 0.03, 'pendiente b recuperada de un campo de b = 0,32');
casi(aj.mcat, 16.5, 0.11, 'magnitud de corte = la más débil de la muestra');

console.log('Telón: la razón de no resueltas crece con la pendiente:');
var Rplano = R.razonNoResuelta(0.38, 16.5, 12.5);
var Rpolo  = R.razonNoResuelta(0.18, 16.5, 12.5);
ok(Rplano > Rpolo, 'b mayor (más estrellas débiles) → más luz no resuelta');
ok(Rpolo > 0 && Rplano < 1e4, 'la integral converge en ambos extremos del rango');

/* ── 6. Telón: un campo denso pinta más luz que uno pobre ────────────────────
   Es el assert de «plano galáctico brillante, polo casi sin telón» sin depender
   de la red: mismo cielo, misma óptica, distinta densidad de estrellas. */
console.log('Telón: densidad de campo → brillo del telón:');
var opts = { ra: 10, dec: 40, arcmin: 60, size: 64 };
function medioTelon(est) {
  var t = R.telonDifuso(est, opts);
  if (!t) return null;
  var s = 0; for (var i = 0; i < t.length; i++) s += t[i];
  return s / t.length;
}
var denso = medioTelon(campoSintetico(0.32, 16.5, 12000, 0.4));
var pobre = medioTelon(campoSintetico(0.32, 16.5, 600, 0.4));
ok(denso > pobre * 5, 'campo 20× más denso → telón mucho más brillante');
ok(R.telonDifuso(campoSintetico(0.32, 16.5, 50, 0.4), opts) === null,
  'muestra insuficiente → no se inventa telón (null)');

/* El telón sale en flujo por arcsec², comparable con Fcielo: un campo denso debe
   quedar en el entorno del brillo de la Vía Láctea, no órdenes de magnitud fuera. */
var muTelon = -2.5 * Math.log10(denso);
ok(muTelon > 17 && muTelon < 26,
  'brillo del telón denso = ' + muTelon.toFixed(1) + ' mag/arcsec² (rango plausible)');

/* ── 7. Halo de King: el ajuste no debe comerse el sesgo que corrige ─────────
   Cúmulo sintético con perfil de King conocido y el NÚCLEO VACIADO a propósito,
   imitando la incompletitud de Gaia por aglomeración. Si el ajuste usara los
   anillos centrales, aprendería el agujero y no lo rellenaría nunca. */
console.log('Halo de King: ajuste fuera del radio de aglomeración:');
function cumuloSintetico(rcGrados, rtGrados, nTotal, rVaciado) {
  // Reparte estrellas según King(r)·2πr, y borra las de dentro de rVaciado.
  var est = [], acum = [], total = 0, PASO = rtGrados / 400, r;
  for (r = PASO / 2; r < rtGrados; r += PASO) {
    total += R.formaKing(r, rcGrados, rtGrados) * 2 * Math.PI * r;
    acum.push([r, total]);
  }
  for (var i = 0; i < nTotal; i++) {
    var u = (i + 0.5) / nTotal * total, rr = rtGrados;
    for (var j = 0; j < acum.length; j++) if (acum[j][1] >= u) { rr = acum[j][0]; break; }
    if (rr < rVaciado) continue;                     // el "agujero" de la aglomeración
    var ang = i * 2.399963;
    est.push([10 + rr * Math.cos(ang) / Math.cos(40 * Math.PI / 180),
              40 + rr * Math.sin(ang), 14 + (i % 25) * 0.1, 0.9]);
  }
  return est;
}
var optsC = { ra: 10, dec: 40, arcmin: 60, size: 64 };
var RC = 0.06, RT = 0.9;
var cumulo = cumuloSintetico(RC, RT, 9000, 0.10);

var perf = R.perfilRadial(cumulo, optsC);
var iCrowd = perf ? (function (d) { var m = 0; for (var i = 1; i < d.length; i++) if (d[i] > d[m]) m = i; return m; })(perf.dens) : -1;
ok(iCrowd >= 1, 'detecta el radio de aglomeración (anillo ' + iCrowd + ', densidad cae hacia el centro)');

var fit = R.ajustarKing(perf, iCrowd);
ok(fit && fit.k > 0, 'ajuste con amplitud positiva');

/* rc no se puede medir desde fuera del core: está degenerado y el ajuste debe
   resolver el empate hacia el perfil MENOS picudo. Lo que se comprueba no es que
   acierte rc, sino que no se pegue al mínimo de la rejilla — que daría un pico
   inventado y un núcleo sobreiluminado. */
ok(fit.rc > perf.rmax * R.king.rcMin * 1.5,
  'rc no se pega al mínimo de la rejilla (desempate conservador)');

/* Lo que de verdad importa: que el King ajustado por fuera recupere la densidad
   central que la aglomeración borró. El mismo cúmulo SIN vaciar es la verdad. */
var densCentro = perf.dens[0];
var kingCentro = fit.k * R.formaKing(perf.radio[0], fit.rc, fit.rt);
ok(kingCentro > densCentro * 2,
  'el King extrapolado predice el centro muy por encima de lo observado');
var verdad = R.perfilRadial(cumuloSintetico(RC, RT, 9000, 0), optsC).dens[0];
ok(kingCentro > verdad * 0.25 && kingCentro < verdad * 4,
  'densidad central recuperada dentro de un factor 4 de la real (' +
  kingCentro.toFixed(0) + ' vs ' + verdad.toFixed(0) + ' estrellas/grado²)');

/* El déficit se convierte a luz con la función de luminosidad MEDIDA en el campo,
   no con el flujo medio de lo observado: la aglomeración se lleva sobre todo
   fuentes débiles, y contar el hueco con el brillo medio sobreestima el halo. */
console.log('Halo de King: flujo por estrella desde la función de luminosidad:');
var perfC = R.perfilRadial(cumulo, optsC);
var lfC = R.pendienteConteos(cumulo);
var fLF = R.flujoMedioNoResuelto(lfC.b, lfC.lo, lfC.mcat);
ok(fLF > 0, 'flujo medio de la población no resuelta bien definido');
ok(fLF < perfC.flujoMedio,
  'más débil que el flujo medio observado (' +
  (-2.5 * Math.log10(fLF / perfC.flujoMedio)).toFixed(2) + ' mag)');
// Una pendiente más empinada = más estrellas débiles = flujo medio más débil.
ok(R.flujoMedioNoResuelto(0.38, 12.5, 16.5) < R.flujoMedioNoResuelto(0.18, 12.5, 16.5),
  'pendiente más empinada → población más débil');

console.log('Halo de King: solo pinta donde hay déficit:');
var halo = R.haloNoResuelto(cumulo, optsC);
ok(halo !== null, 'con núcleo vaciado sí produce halo');
var centroIdx = (optsC.size / 2) * optsC.size + optsC.size / 2;
ok(halo[centroIdx] > 0, 'el halo aporta luz en el centro');
ok(halo[0] === 0, 'no aporta nada en la esquina del campo (ya lo cubre el telón)');

// Sin agujero (densidad creciendo hasta el centro) no hay déficit que rellenar:
// el telón ya bastaba, y esta capa debe abstenerse en vez de duplicarlo.
ok(R.haloNoResuelto(cumuloSintetico(RC, RT, 9000, 0), optsC) === null,
  'sin déficit por aglomeración → null (no duplica el telón)');

// Un campo sin cúmulo tampoco debe disparar la capa.
ok(R.haloNoResuelto(campoSintetico(0.32, 16.5, 6000, 0.4), optsC) === null,
  'campo uniforme → null');

/* ── 8. Halo anclado al catálogo de Harris ──────────────────────────────────
   mu_V(0) es la luz TOTAL del centro: incluye las estrellas dibujadas y lo que
   el telón ya reparte. La capa debe aportar solo el RESTO, o cuenta doble. */
console.log('Halo anclado a Harris:');
// 47 Tuc: r_c = 0,36', c = 2,07, mu_V(0) = 14,38 (fila real del catálogo).
window.BITACORA_GLOBULARES = [['NGC 104', '47 Tuc', 10, 40, 0.36, 3.17, 2.07, 14.38]];
var gc = R.globularEnCampo(optsC);
ok(gc && gc.id === 'NGC 104', 'encuentra el globular catalogado en el campo');
casi(gc.rc, 0.36 / 60, 1e-9, 'r_c convertido a grados');

var anclado = R.haloCatalogado(gc, cumulo, { ra: 10, dec: 40, arcmin: 60, size: 64 }, null);
ok(anclado !== null, 'produce halo anclado');
var muCentro = -2.5 * Math.log10(anclado[centroIdx]);
ok(muCentro > 14.38, 'el centro aporta MENOS que mu_V(0) = 14,38 (' + muCentro.toFixed(2) +
  '): lo ya observado se resta');

// Con telón puesto, el aporte tiene que bajar todavía más: es luz ya contada.
var telonFalso = new Float32Array(64 * 64);
for (var q = 0; q < telonFalso.length; q++) telonFalso[q] = 1e-6;
var conTelon = R.haloCatalogado(gc, cumulo, { ra: 10, dec: 40, arcmin: 60, size: 64 }, telonFalso);
ok(conTelon === null || conTelon[centroIdx] < anclado[centroIdx],
  'restar el telón reduce el aporte del halo (sin doble conteo)');

// Fuera del radio de marea no pinta nada.
ok(anclado[0] === 0, 'nada fuera del radio de marea');

// Sin catálogo cargado, el motor cae a los conteos y sigue funcionando.
window.BITACORA_GLOBULARES = null;
ok(R.globularEnCampo(optsC) === null, 'sin catálogo → null, sin romperse');
ok(R.haloNoResuelto(cumulo, optsC, null) !== null, 'sigue el camino de conteos');

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
