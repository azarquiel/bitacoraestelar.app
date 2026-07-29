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

/* El halo NO puede depender de con cuánto campo se mire: es brillo superficial
   intrínseco. Antes se restaba el flujo observado en anillos escalados al CAMPO,
   así que a campo ancho el anillo central diluía el core cientos de veces, la
   resta no quitaba nada y el halo se disparaba. */
console.log('Halo anclado: invariante al ancho del campo:');
window.BITACORA_GLOBULARES = [['NGC 104', '47 Tuc', 10, 40, 0.36, 3.17, 2.07, 14.38]];
/* Se compara el FLUJO TOTAL, no el píxel central: a campo ancho el core cae por
   debajo del píxel y su pico se muestrea peor, cosa esperable. Lo que no puede
   cambiar es cuánta luz aporta la capa en total. */
function haloFlujoTotal(arcmin) {
  var n = 128;
  var h = R.haloCatalogado(gc, cumulo, { ra: 10, dec: 40, arcmin: arcmin, size: n }, null);
  if (!h) return 0;
  var areaPix = Math.pow(arcmin * 60 / n, 2);          // arcsec² por píxel
  var s = 0; for (var i = 0; i < h.length; i++) s += h[i];
  return s * areaPix;
}
var estrecho = haloFlujoTotal(20), ancho = haloFlujoTotal(180);
ok(estrecho > 0 && ancho > 0, 'produce halo con campo estrecho y con campo ancho');
var razonCampo = ancho / estrecho;
ok(razonCampo > 0.5 && razonCampo < 2,
  'campo 9x más ancho cambia el flujo total menos de 2x (razón ' + razonCampo.toFixed(2) + ')');

/* Y el perfil tiene que caer de forma continua: restar un perfil escalonado de un
   King continuo deja un salto por anillo, y eso se ve como círculos concéntricos. */
console.log('Halo anclado: perfil sin anillos:');
var NN = 160;
var perfilHalo = R.haloCatalogado(gc, cumulo, { ra: 10, dec: 40, arcmin: 30, size: NN }, null);
var subidas = 0, previo = Infinity;
for (var px = NN / 2; px < NN; px++) {
  var v = perfilHalo[(NN / 2) * NN + px];
  if (v > previo && previo > 0) subidas++;
  previo = v;
}
ok(subidas === 0, 'el perfil radial no vuelve a subir en ningún punto (' + subidas + ' repuntes)');

// Sin catálogo cargado, el motor cae a los conteos y sigue funcionando.
window.BITACORA_GLOBULARES = null;
ok(R.globularEnCampo(optsC) === null, 'sin catálogo → null, sin romperse');
ok(R.haloNoResuelto(cumulo, optsC, null) !== null, 'sigue el camino de conteos');

/* ── 9. Anillos interiores hambrientos: la burbuja ──────────────────────────
   A mucho aumento (campo estrecho) o con un cúmulo compacto a campo ancho, el
   anillo más interior de radio fijo puede no contener NINGUNA estrella: el flujo
   observado sale 0, no se resta nada, el King entra a pelo y aparece una burbuja
   brillante con un salto en la frontera del anillo.
   Con anillos adaptativos (mínimo de estrellas por anillo) eso no puede pasar. */
console.log('Halo anclado: anillos interiores con datos suficientes:');
// Cúmulo LLENO (sin vaciar) y campo muy estrecho: el caso de M13 a 422x.
var lleno = cumuloSintetico(RC, RT, 9000, 0);
// muV por encima del brillo que el propio cúmulo ya tiene (18,76 medido), o no
// habría déficit y la capa se abstendría — que es justo lo que debe hacer.
var gcT = { id: 'test', ra: 10, dec: 40, rc: 0.06, c: 1.176, muV: 17.5 };
var F0T = Math.pow(10, -0.4 * gcT.muV);
var NE = 160, campoEstrecho = { ra: 10, dec: 40, arcmin: 10, size: NE };
var hEstrecho = R.haloCatalogado(gcT, lleno, campoEstrecho, null);
ok(hEstrecho !== null, 'produce halo a campo estrecho');
var centroE = hEstrecho[(NE / 2) * NE + NE / 2];
ok(centroE < F0T * 0.9,
  'el centro resta flujo observado, no entra el King a pelo (' +
  (centroE / F0T).toFixed(2) + ' del pico)');

/* Sin repuntes tampoco a campo estrecho, y medidos como FRACCIÓN DEL PICO: el
   test anterior contaba saltos sin mirar su tamaño, y los que quedaban valían
   hasta 21 niveles de 255 en pantalla — o sea, un anillo bien visible. */
var repuntes = 0, prev = Infinity, peorSalto = 0;
var picoE = hEstrecho[(NE / 2) * NE + NE / 2];
for (var pe = NE / 2; pe < NE; pe++) {
  var ve = hEstrecho[(NE / 2) * NE + pe];
  if (ve > prev && prev > 0) {
    repuntes++;
    peorSalto = Math.max(peorSalto, (ve - prev) / picoE);
  }
  prev = ve;
}
ok(repuntes === 0, 'perfil sin ningún repunte a campo estrecho (' + repuntes +
  ', peor ' + (peorSalto * 100).toFixed(2) + '% del pico)');

/* Una estrella brillante justo en el centro hace que el anillo interior
   sobre-reste. La cota monótona NO puede dejar que ese único valor aplaste el
   perfil entero: con un mínimo corriente desde el centro, el cúmulo se quedaba
   sin nubosidad en todo el núcleo. */
console.log('Halo anclado: un centro sobre-restado no puede aplastar el halo:');
var conBrillante = lleno.slice();
conBrillante.push([10, 40, 8.0, 0.9]);          // estrella de mag 8 en el centro
var hBrillante = R.haloCatalogado(gcT, conBrillante, campoEstrecho, null);
ok(hBrillante !== null, 'sigue habiendo halo con una estrella brillante central');
function flujoTotal(h) { var s = 0; for (var i = 0; i < h.length; i++) s += h[i]; return s; }
var conservado = flujoTotal(hBrillante) / flujoTotal(hEstrecho);
ok(conservado > 0.5,
  'conserva más de la mitad del halo (' + (conservado * 100).toFixed(0) + '%)');

/* Monótono NO basta: un perfil que solo baja puede estar lleno de codos, y
   adaptacionLocal es una máscara de enfoque que realza justo las
   discontinuidades de pendiente, convirtiendo cada codo en un círculo visible.
   Se mide la segunda diferencia a lo largo del radio, normalizada al pico. */
console.log('Halo anclado: perfil suave, no solo monótono:');
function curvaturaMaxima(h, N) {
  var pico = h[(N / 2) * N + N / 2], peor = 0;
  if (!(pico > 0)) return Infinity;
  for (var x = N / 2 + 1; x < N - 1; x++) {
    var a = h[(N / 2) * N + x - 1], b = h[(N / 2) * N + x], c = h[(N / 2) * N + x + 1];
    peor = Math.max(peor, Math.abs(a - 2 * b + c) / pico);
  }
  return peor;
}
var curva = curvaturaMaxima(hEstrecho, NE);
ok(curva < 0.003, 'sin codos en el perfil radial (curvatura máx ' +
  (curva * 100).toFixed(3) + '% del pico por píxel²)');

// El muestreador nunca debe devolver 0 en el centro por falta de estrellas.
var obs = R.flujoObservadoCumulo(lleno, gcT, gcT.rc * Math.pow(10, gcT.c), 0.0833);
ok(obs && obs(0) > 0, 'el flujo observado en el centro no es cero');
ok(obs(0) >= obs(0.05), 'el perfil observado decrece del centro hacia fuera');

/* ── 10. Curva de tono de las estrellas ─────────────────────────────────────
   Las estrellas se dibujaban con 'lighter' en 8 bits y saltándose la curva de
   tono: en el núcleo de un cúmulo cientos de sprites sumaban por encima de 255,
   se recortaban a blanco y no quedaba ninguna estrella distinguible. Ahora su
   valor de pantalla vuelve a flujo y se mapea junto con las capas difusas. */
console.log('Curva de tono de la capa de estrellas:');
var Fc = Math.pow(10, -0.4 * 21), rango = FOT.SB_NEGRO - FOT.SB_BLANCO;
// Ida y vuelta exacta: nada que no estuviera saturado se mueve de sitio.
[1, 37, 128, 200, 255].forEach(function (v) {
  casi(R.valorDeFlujo(R.flujoDeValor(v, Fc, rango), Fc, rango), v, 1e-9,
    'valor ' + v + ' sobrevive la ida y vuelta');
});

/* Lo que antes se recortaba, ahora comprime. Dos estrellas que sumaban 400
   niveles quedaban en 255 igual que cuatro que sumaran 800: misma mancha blanca
   y sin forma. Ahora conservan su orden. */
function apilado(veces) {   // suma de flujos, que es lo que hace pintarFot
  return R.valorDeFlujo(R.flujoDeValor(200, Fc, rango) * veces, Fc, rango);
}
ok(apilado(2) > 200, 'apilar estrellas sube el nivel');
ok(apilado(4) > apilado(2), 'un núcleo 2x más brillante sigue saliendo más brillante (' +
  apilado(2).toFixed(1) + ' vs ' + apilado(4).toFixed(1) + '), no los dos a 255');
/* Antes, dos estrellas de 200 niveles sumaban 400 y se recortaban a blanco; con
   cuatro pasaba lo mismo, así que el núcleo era una mancha plana. Ahora ambos
   casos caben en la escala y se distinguen. Con apilados extremos sigue habiendo
   techo: la curva abarca 11,5 magnitudes y eso es el rango de la pantalla, no un
   fallo — pero la rodilla está mucho más arriba que el recorte de antes. */
ok(apilado(2) < 255 && apilado(4) < 255, 'lo que antes se recortaba ahora cabe en la escala');
ok(apilado(64) > apilado(16), 'el orden se conserva incluso pasado el techo');

/* ── 11. Rodilla del realce de detalle ──────────────────────────────────────
   La adaptación local usaba un corte duro: continua en valor, pero con un salto
   de PENDIENTE en el umbral. Sobre un degradado suave —el halo de un cúmulo—
   |dif| cruza el umbral a varios radios y cada cruce deja un borde: los círculos
   concéntricos. La rodilla suave lo elimina sin tocar el realce de lo que ya
   destacaba. */
console.log('Realce de detalle: rodilla suave:');
function pendiente(d) { return (R.realceDetalle(d + 1e-4, 0.5) - R.realceDetalle(d - 1e-4, 0.5)) / 2e-4; }
ok(R.realceDetalle(6, 0.5) === 0, 'por debajo del umbral no realza nada');
// El salto de pendiente en el umbral es lo que dibujaba el círculo.
var saltoUmbral = Math.abs(pendiente(12.5) - pendiente(11.5));
ok(saltoUmbral < 0.05, 'la pendiente no salta en el umbral (' + saltoUmbral.toFixed(4) + ')');
// Y con detalle fuerte coincide con la fórmula de siempre.
[30, 60, 120].forEach(function (d) {
  casi(R.realceDetalle(d, 0.5), 0.5 * (d - 12), 1e-9,
    'detalle ' + d + ': idéntico al realce anterior');
});
ok(R.realceDetalle(-40, 0.5) === -R.realceDetalle(40, 0.5), 'simétrico en signo');

/* ── 12. Galaxias por perfil de Sérsic ──────────────────────────────────────
   El perfil se normaliza a la magnitud TOTAL del catálogo, así que lo que hay
   que comprobar es que la luz integrada sea la que el catálogo dice: si la
   normalización estuviera mal, la galaxia saldría plausible pero con el brillo
   equivocado, y a ojo no se nota. */
console.log('Galaxias: el perfil integra la luz del catálogo:');
// M31 en el centro del campo: r_e = 2198", b/a = 0,324, PA 35, V = 3,61, n = 1.
window.BITACORA_GALAXIAS = [['NGC 224', 'M31', 10, 40, 2198.47, 0.324, 35, 3.61, 1]];
function luzIntegrada(arcmin, size) {
  var g = R.capaGalaxias({ ra: 10, dec: 40, arcmin: arcmin, size: size });
  if (!g) return 0;
  var areaPix = Math.pow(arcmin * 60 / size, 2);      // arcsec² por píxel
  var s = 0; for (var i = 0; i < g.length; i++) s += g[i];
  return s * areaPix;
}
// Campo muy ancho: debe recogerse casi toda la luz de la galaxia.
var total = luzIntegrada(600, 300);
var esperado = Math.pow(10, -0.4 * 3.61);
var fraccion = total / esperado;
ok(fraccion > 0.9 && fraccion < 1.05,
  'un campo que la abarca recoge el ' + (fraccion * 100).toFixed(0) + ' % de la luz de V = 3,61');

// Y la mitad de la luz cae dentro de r_e: es la definición de radio efectivo.
var dentroRe = (function () {
  var size = 300, arcmin = 600;
  var g = R.capaGalaxias({ ra: 10, dec: 40, arcmin: arcmin, size: size });
  var escArc = arcmin * 60 / size, areaPix = escArc * escArc, s = 0;
  var pa = 35 * Math.PI / 180, sen = Math.sin(pa), cos = Math.cos(pa);
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var dN = (size / 2 - (y + 0.5)) * escArc, dE = (size / 2 - (x + 0.5)) * escArc;
      var u = dE * sen + dN * cos, v = dE * cos - dN * sen;
      if (Math.sqrt(u * u + Math.pow(v / 0.324, 2)) <= 2198.47) s += g[y * size + x];
    }
  }
  return s * areaPix;
})();
casi(dentroRe / total, 0.5, 0.03, 'la mitad de la luz cae dentro de r_e');

console.log('Galaxias: geometría:');
var enCampo = R.galaxiasEnCampo({ ra: 10, dec: 40, arcmin: 60, size: 64 });
ok(enCampo.length === 1, 'encuentra la galaxia del campo');
// El halo entra aunque el núcleo quede fuera: en campo ancho el borde de una
// galaxia grande debe aparecer igual.
ok(R.galaxiasEnCampo({ ra: 10.9, dec: 40, arcmin: 60, size: 64 }).length === 1,
  'una galaxia con el centro fuera pero halo dentro sigue contando');
ok(R.galaxiasEnCampo({ ra: 40, dec: -20, arcmin: 60, size: 64 }).length === 0,
  'en otro punto del cielo no hay ninguna');

// El eje mayor debe ir en el PA del catálogo: a igual distancia, más brillo a lo
// largo del eje mayor que del menor.
var N2 = 201, campoG = { ra: 10, dec: 40, arcmin: 300, size: N2 };
var img = R.capaGalaxias(campoG);
var escA = 300 * 60 / N2, dPx = Math.round(1500 / escA);
var paR = 35 * Math.PI / 180;
// Este = −x, Norte = −y. Eje mayor a PA=35 desde el norte hacia el este.
var mx = Math.round(N2 / 2 - dPx * Math.sin(paR)), my = Math.round(N2 / 2 - dPx * Math.cos(paR));
var nx = Math.round(N2 / 2 - dPx * Math.cos(paR)), ny = Math.round(N2 / 2 + dPx * Math.sin(paR));
ok(img[my * N2 + mx] > img[ny * N2 + nx] * 3,
  'a igual distancia, el eje mayor es mucho más brillante que el menor');

window.BITACORA_GALAXIAS = null;
ok(R.capaGalaxias({ ra: 10, dec: 40, arcmin: 60, size: 64 }) === null,
  'sin catálogo → null, sin romperse');

/* ── 13. Realce perceptual de las capas calibradas ──────────────────────────
   La curva reparte 11,5 magnitudes linealmente sobre 0–255, así que una galaxia
   0,4 mag por encima del cielo recibía 9 niveles: invisible en un monitor,
   cuando el ojo adaptado ve ese 45 % de contraste con claridad. */
console.log('Realce perceptual:');
var Fc2 = Math.pow(10, -0.4 * 21), rg = FOT.SB_NEGRO - FOT.SB_BLANCO;
function nivelDe(mu, conRealce) {
  var F = Math.pow(10, -0.4 * mu);
  if (conRealce) F = R.realzarPerceptual(F, Fc2, rg);
  return R.valorDeFlujo(F, Fc2, rg);
}
// El caso real que lo motivó: núcleo de NGC 891 a 21,62 mag/arcsec².
ok(nivelDe(21.62, false) < 15, 'sin realce, un objeto de 21,6 se queda en ' +
  nivelDe(21.62, false).toFixed(1) + '/255');
ok(nivelDe(21.62, true) > 40, 'con realce sube a ' + nivelDe(21.62, true).toFixed(1) + '/255');

// El orden de brillos se conserva: es un realce, no un aplanamiento.
ok(nivelDe(20, true) > nivelDe(21.62, true) && nivelDe(21.62, true) > nivelDe(23, true),
  'conserva el orden de brillos');
// Y queda margen: lo brillante no se va de escala.
ok(nivelDe(18, true) < 255, 'un objeto muy brillante sigue dentro de la escala');

// Con gamma 1 la cadena vuelve a ser EXACTAMENTE la de antes: es la garantía de
// que las placas, que no llevan realce, no se han movido ni un nivel.
var gammaOriginal = FOT.GAMMA_PERCEPTUAL;
FOT.GAMMA_PERCEPTUAL = 1;
[19, 21, 23].forEach(function (mu) {
  casi(nivelDe(mu, true), nivelDe(mu, false), 0,
    'gamma 1 en μ=' + mu + ': idéntico al reparto lineal');
});
FOT.GAMMA_PERCEPTUAL = gammaOriginal;

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
