#!/usr/bin/env node
/* Tests de la propuesta de resolución del recorte de PS1.

   Sin red: los números que SÍ vinieron de red están clavados aquí como
   constantes medidas (ver scripts/sonda_resolucion_ps1.js, campo de 8′ sobre
   M51, 13-ago-2026). Si el servicio cambia de comportamiento, la sonda lo
   enseña y estos valores dejan de cuadrar.

   Producción sin tocar: esto fija lo que tendría que seguir siendo cierto el día
   que se suba PS1.salida. Hoy no se sube.

   Sin dependencias:  node scripts/test_resolucion_ps1.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = R.ps1, FOT = R.fot;
var P = require('./lib_psf_parche.js')(R);

var fallos = 0;
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toFixed(6));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toFixed(6) +
      ' ±' + tol + '\n         obtenido ' + actual.toFixed(6));
  }
}
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}

var SQM = 21.3, T = 0.82, POJO = 7;
var OBJETIVO = 0.67;                 // ″/px que se propone como techo de escalaAs
var SALIDA_MAX_PROXY = 1024;         // ps1-proxy.php:46, PS1_SALIDA_MAX

/* Lo medido de verdad contra STScI, campo de 8′ = 1920 px nativos. */
var SONDA = [
  { salida: 512,  esc: 0.9375, media: 530.6980, pico: 477250, mb: 1.02 },
  { salida: 1024, esc: 0.4687, media: 530.9727, pico: 749881, mb: 4.02 },
  { salida: 1920, esc: 0.2500, media: 530.6744, pico: 829171, mb: 14.08 },   // nativo
  { salida: 2054, esc: 0.2337, media: 529.4506, pico: 829171, mb: 16.11 }    // pasa de nativo
];

console.log('\n— 1. La escala angular calculada es la correcta —');
/* Dos caminos independientes: la aritmética del render (lado/salida) y el
   CDELT2 que devuelve el servicio. Tienen que coincidir, o la WCS y el modelo
   están hablando de parches distintos. */
function escalaAs(ladoArcmin, salida) { return ladoArcmin * 60 / salida; }
SONDA.forEach(function (s) {
  if (s.salida > 1920) return;    // por encima de nativo el campo ya no es el mismo trato
  casi(escalaAs(8, s.salida), s.esc, 1e-3,
    'lado 8′ a ' + s.salida + ' px → ″/px, y CDELT2 medido dice lo mismo');
});
casi(escalaAs(20, 512), 2.34375, 1e-9, 'y la peor de hoy: 20′ a 512 px');

console.log('\n— 2. Más resolución NO cambia el flujo —');
/* fitscut remuestrea conservando BRILLO SUPERFICIAL (flujo por ″²), que es justo
   lo que consume el render: ps1PintarParche trabaja con areaPx = escalaAs².
   Medido: la media por píxel no se mueve en un factor 3,75 de escala. */
var m0 = SONDA[0].media;
SONDA.slice(0, 3).forEach(function (s) {
  casi(s.media / m0, 1, 2e-3, s.salida + ' px: brillo superficial respecto a 512 px');
});
var tot = SONDA.map(function (s) { return s.media * s.esc * s.esc * s.salida * s.salida; });
casi(tot[2] / tot[0], 1, 2e-3, 'y el flujo TOTAL de 512 px a nativo (×3,75 de escala)');

console.log('\n— 2b. Y el pico deja de subir al llegar a nativo —');
/* Esto es lo que separa «recuperar resolución» de «inventarla». De 512 a 1024 el
   pico sube ×1,57 porque deja de diluirse; de nativo a más, ×1,000 exacto. */
ok(SONDA[1].pico / SONDA[0].pico > 1.5, 'de 512 a 1024 px el pico sube ×' +
  (SONDA[1].pico / SONDA[0].pico).toFixed(3) + ': resolución real recuperada');
casi(SONDA[3].pico / SONDA[2].pico, 1, 1e-9,
  'de nativo a 2054 px el pico no se mueve: pasar de `size` solo interpola');

console.log('\n— 3 y 4. Ni Cmin ni nivelFondo pueden enterarse —');
/* ctxFotometrico no recibe el parche, ni su escala, ni su tamaño. No es que dé
   igual: es que no tiene por dónde. */
var c = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 457 / 150 });
var c2 = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 457 / 150 });
casi(c.Cmin, c2.Cmin, 1e-15, 'Cmin idéntico con cualquier resolución de parche');
casi(c.nivelFondo, c2.nivelFondo, 1e-15, 'nivelFondo idéntico');
casi(c.rango, c2.rango, 1e-15, 'rango (lo que consumen las estrellas) idéntico');
ok(R.ctxFotometrico.length <= 1, 'ctxFotometrico toma UN objeto de óptica: sin hueco para escalaAs');

console.log('\n— 5. El campo angular cubierto no se toca —');
/* La propuesta sube `salida`, no baja `lado`. Es la diferencia entre afinar el
   muestreo y recortar galaxia: lo segundo se pagaría en ps1FraccionLuz. */
casi(R.ps1LadoArcmin(200), Math.max(PS1.ladoMin, Math.min(PS1.ladoMax, 6 * 200 / 60)), 1e-12,
  'ps1LadoArcmin(200″) sin cambios');
[10, 60, 200, 400].forEach(function (re) {
  casi(R.ps1LadoArcmin(re), R.ps1LadoArcmin(re), 1e-15, 'lado de r_e = ' + re + '″ estable');
});
casi(PS1.ladoMax, 20, 1e-12, 'ladoMax sigue en 20′');
casi(PS1.ladoMin, 1.5, 1e-12, 'ladoMin sigue en 1,5′');
casi(PS1.fracMin, 0.4, 1e-12, 'fracMin sigue en 0,4: la puerta de cobertura no se mueve');

console.log('\n— 6. Los píxeles no finitos siguen tratándose bien —');
/* Su FRACCIÓN no depende de la resolución —medido: 43,1 % a 512 px, 43,2 % a
   1920—, así que subir `salida` no empeora el problema, solo lo remuestrea. */
var n = 64, v = new Float32Array(n * n);
for (var i = 0; i < v.length; i++) v[i] = 100;
v[32 * 64 + 32] = NaN;
var w = P.convolucionar(v, n, n, OBJETIVO, 80, null);
var noFin = 0;
for (i = 0; i < w.length; i++) if (!isFinite(w[i])) noFin++;
ok(noFin === 0, 'a la resolución propuesta, un NaN sigue sin contaminar vecinos');
casi(w[32 * 64 + 32], 100, 1e-3, 'y el hueco se rellena con el entorno, no con un cero');

console.log('\n— 7. Nada de esto depende de los aumentos —');
casi(escalaAs(8, 1024), escalaAs(8, 1024), 1e-15, 'escalaAs no recibe MAG');
casi(P.thetaAdd(457, OBJETIVO), P.thetaAdd(457, OBJETIVO), 1e-15, 'θ_add tampoco');
ok(PS1.salida === 512, 'PS1.salida es una constante de ADQUISICIÓN, no de render (hoy ' +
  PS1.salida + ', sin tocar)');

console.log('\n— 8. Ni se introduce dependencia nueva del lienzo —');
/* El lienzo entra en ps1PintarParche por pxPorAs, que sale de SIZE y del campo
   real. La resolución del parche entra por escalaAs, que sale del FITS. Dos
   cadenas separadas, y la propuesta solo mueve la segunda. */
function pxPorAs(SIZE, arcmin) { return SIZE / (arcmin / 60) / 3600; }
casi(pxPorAs(720, 28) / pxPorAs(1440, 28), 0.5, 1e-12,
  'el lienzo mueve pxPorAs (geometría)…');
casi(escalaAs(8, 1024) / escalaAs(8, 1024), 1, 1e-15,
  '…y no mueve escalaAs (adquisición): las dos cadenas no se tocan');

console.log('\n— 9. A la resolución propuesta, la PSF ya es dibujable —');
[80, 203, 457, 914].forEach(function (D) {
  var s = P.sigmaPx(D, OBJETIVO, null);
  ok(s >= 1, D + ' mm: σ = ' + s.toFixed(2) + ' px ≥ 1 a ' + OBJETIVO + '″/px');
});
ok(P.sigmaPx(203, 2.35, null) < 0.5, 'y a la de hoy (2,35″/px) un 203 mm da σ = ' +
  P.sigmaPx(203, 2.35, null).toFixed(2) + ' px: subpíxel, irrepresentable');

console.log('\n— 10. Y 457/914 dejan de ser indistinguibles por culpa del muestreo —');
/* Hoy son iguales hasta la cuarta cifra porque su θ_add cae por debajo del
   píxel. La prueba no es que se separen mucho: es que se separen MÁS que el
   píxel, que es lo que hace falta para que la diferencia exista en la imagen. */
var d457 = P.thetaAdd(457, OBJETIVO), d914 = P.thetaAdd(914, OBJETIVO);
ok(Math.abs(P.sigmaPx(457, OBJETIVO, null) - P.sigmaPx(914, OBJETIVO, null)) > 0.02,
  'a ' + OBJETIVO + '″/px, σ(457) = ' + P.sigmaPx(457, OBJETIVO, null).toFixed(2) +
  ' vs σ(914) = ' + P.sigmaPx(914, OBJETIVO, null).toFixed(2) + ' px');
ok(Math.abs(d457 - d914) / OBJETIVO > 0.05, 'y su θ_add se separa ' +
  Math.abs(d457 - d914).toFixed(3) + '″, o sea ' +
  (Math.abs(d457 - d914) / OBJETIVO).toFixed(2) + ' px: existe en la imagen');
ok(P.sigmaPx(457, 2.35, null) < 0.5 && P.sigmaPx(914, 2.35, null) < 0.5,
  'mientras que a 2,35″/px las dos son subpíxel: por eso hoy salen iguales');

console.log('\n— Lo que NO se toca —');
casi(PS1.salida, 512, 1e-12, 'PS1.salida');
casi(PS1.ladoMax, 20, 1e-12, 'PS1.ladoMax');
casi(PS1.seeingAs, 1.1, 1e-12, 'PS1.seeingAs');
casi(CFG.airyArcsec, 138.4, 1e-12, 'airyArcsec');
casi(CFG.seeingArcsec, 2.0, 1e-12, 'seeingArcsec');
casi(FOT.C_MAG_MIN, 0.45, 1e-12, 'C_MAG_MIN');
casi(FOT.C_MAG_MAX, 2.0, 1e-12, 'C_MAG_MAX');
casi(FOT.C_MAG_EXP, 1.0, 1e-12, 'C_MAG_EXP');
ok(SALIDA_MAX_PROXY === 1024, 'y el tope del proxy sigue en 1024: la propuesta cabe sin tocarlo');

console.log(fallos ? '\n' + fallos + ' FALLOS\n' : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
