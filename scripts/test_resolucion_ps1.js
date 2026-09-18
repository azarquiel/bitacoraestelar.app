#!/usr/bin/env node
/* Tests de la propuesta de resolución del recorte de PS1.

   Sin red: los números que SÍ vinieron de red están clavados aquí como
   constantes medidas (ver scripts/sonda_resolucion_ps1.js, campo de 8′ sobre
   M51, 13-ago-2026). Si el servicio cambia de comportamiento, la sonda lo
   enseña y estos valores dejan de cuadrar.

   Desde la fase 2 del ADR 0024 fija además la REGLA C, la que decide el tamaño
   del parche de cada objeto (`ps1SalidaParche`, §4.2 del objetivo), y el listón
   L2.1: ningún objeto del banco queda «subpíxel» para ninguna de las cuatro
   aperturas. La regla se lee de producción, no se reescribe aquí (ADR 0008).

   Sin dependencias:  node scripts/test_resolucion_ps1.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = window.BitacoraPS1.cfg, FOT = R.fot;
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
var OBJETIVO = 0.67;                 // ″/px del README: el techo que la regla C alcanza salvo en el tope
var SALIDA_MAX_PROXY = 2048;         // ps1-proxy.php:46, PS1_SALIDA_MAX
var API = window.BitacoraPS1;
require('../simulador_ocular/resources/js/galaxias-datos.js');
require('../simulador_ocular/resources/js/nebulosas-datos.js');
var BANCO = require('./lib_banco_dso.js')(R);
var FWHM_A_SIGMA = 2 * Math.sqrt(2 * Math.LN2);

/* σ de la PSF del telescopio en PÍXELES del parche, con la θ_add de producción
   (`ps1ThetaAdd`) y la misma división que hace `ps1PsfParche`. */
function sigmaPxProd(D, escalaAs) {
  return API.ps1ThetaAdd(D, escalaAs) / FWHM_A_SIGMA / escalaAs;
}

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
   Medido: la media por píxel no se mueve en un factor 3,75 de escala.

   ALCANCE, para no cobrarse L2.3 entero con esto: la sonda va de 0,94 a 0,25″/px
   sobre M51, o sea de la escala de la fase 2 HACIA la nativa. NO cubre el régimen
   sobremuestreado —por debajo de 0,25″/px— donde vivían 31 de los 69 objetos de
   la fase 1, y la fila que sí lo pisa (2054 px, 0,2337″/px) queda fuera a mano
   porque ahí fitscut ya solo interpola. La comparación objeto a objeto de fase 2
   contra fase 1 se mide sobre el banco regenerado; aquí está el listón, no la
   medida de los 69. */
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
/* El 2º argumento (thetaIntArcmin, ley H2c) es tamaño del OBJETO en el cielo,
   no del parche: escalaAs y la resolución siguen sin tener por dónde entrar. */
ok(R.ctxFotometrico.length <= 2, 'ctxFotometrico toma la óptica y a lo sumo θint: sin hueco para escalaAs');

console.log('\n— 5. El campo angular cubierto no se toca —');
/* La propuesta sube `salida`, no baja `lado`. Es la diferencia entre afinar el
   muestreo y recortar galaxia: lo segundo se pagaría en ps1FraccionLuz. */
casi(window.BitacoraPS1.ps1LadoArcmin(200), Math.max(PS1.ladoMin, Math.min(PS1.ladoMax, 6 * 200 / 60)), 1e-12,
  'ps1LadoArcmin(200″) sin cambios');
[10, 60, 200, 400].forEach(function (re) {
  casi(window.BitacoraPS1.ps1LadoArcmin(re), window.BitacoraPS1.ps1LadoArcmin(re), 1e-15, 'lado de r_e = ' + re + '″ estable');
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
/* Lo que importa no es su valor, sino que la resolución sea de ADQUISICIÓN y no
   de render: que no la mueva ni el lienzo ni los aumentos. La regla C recibe el
   lado del objeto y nada más. */
ok(API.ps1SalidaParche.length === 1, 'ps1SalidaParche toma el lado y nada más: sin hueco para MAG ni SIZE');
ok(API.ps1SalidaParche(20) <= SALIDA_MAX_PROXY, 'y el peor caso cabe en el tope del proxy');

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

console.log('\n— 11. La regla C decide el tamaño, y lo decide el objeto —');
/* §4.2 del objetivo: salida(lado) = clamp(ceil(lado·60/0,5), 128, 2048). Los tres
   lados son los del ADR: el mínimo, la mediana del catálogo y el tope. */
[[1.5, 180], [4.6, 552], [20, 2048]].forEach(function (par) {
  casi(API.ps1SalidaParche(par[0]), par[1], 1e-12, 'lado ' + par[0] + '′ → px');
  var e = escalaAs(par[0], API.ps1SalidaParche(par[0]));
  ok(e <= OBJETIVO, '  y su escala, ' + e.toFixed(3) + '″/px, llega al objetivo de ' + OBJETIVO);
});
/* El tope de 2048 es lo ÚNICO que impide los 0,5″/px, y entra a los 17,07′. */
casi(escalaAs(17.06, API.ps1SalidaParche(17.06)), 0.5, 2e-3, 'justo por debajo del tope, 0,5″/px clavados');
ok(escalaAs(20, API.ps1SalidaParche(20)) > 0.5, 'y en el tope la escala se afloja a ' +
  escalaAs(20, API.ps1SalidaParche(20)).toFixed(3) + '″/px: el tope manda, no la regla');
/* Nunca más fina que la nativa de PS1 (0,25″/px): pedir más sería interpolar. */
var masFina = 0;
for (var lc = PS1.ladoMin; lc <= PS1.ladoMax + 1e-9; lc += 0.05) {
  if (escalaAs(lc, API.ps1SalidaParche(lc)) < 0.25) masFina++;
}
ok(masFina === 0, 'ningún lado del rango pide una escala más fina que la nativa de PS1');
casi(API.ps1SalidaParche(0), PS1.salidaMin, 1e-12,
  'un lado ausente cae al suelo de 128 px, no a NaN ni a cero');

console.log('\n— 12. L2.1: ningún objeto del banco queda «subpíxel» —');
/* El listón de la fase 2 (ADR 0024): σ de la PSF del telescopio ≥ 1 px en los
   objetos por debajo de 17′ y ≥ 0,85 px en los que llegan al tope de 2048. Es
   sobre TODO el banco y con la θ_add de producción, no con una copia. */
var banco = BANCO.banco().objetos.filter(function (o) { return o.gal; });
ok(banco.length > 0, 'el banco resuelve ' + banco.length + ' objetos contra los catálogos de este árbol');
var peor = { s: Infinity }, enTope = 0, subpixel = 0;
[80, 203, 457, 914].forEach(function (D) {
  banco.forEach(function (o) {
    var px = API.ps1SalidaParche(o.gal.ladoArcmin), e = escalaAs(o.gal.ladoArcmin, px);
    var sg = sigmaPxProd(D, e);
    if (sg < peor.s) peor = { s: sg, D: D, nombre: o.nombre, lado: o.gal.ladoArcmin, esc: e, px: px };
    if (px >= PS1.salidaMax && D === 80) enTope++;
    /* El listón laxo es el del TOPE, y el tope entra a los 17,07′, no a los 17:
       un objeto entre medias no está en el tope y le toca el estricto. Por eso
       la pregunta es por los píxeles, no por el lado. */
    var liston = (px >= PS1.salidaMax) ? 0.85 : 1;
    if (sg < liston) {
      subpixel++;
      console.error('  FALLA L2.1 ' + o.nombre + ' (' + o.gal.ladoArcmin.toFixed(2) + '′, ' +
        e.toFixed(3) + '″/px) con ' + D + ' mm: σ = ' + sg.toFixed(3) + ' px < ' + liston);
    }
  });
});
ok(subpixel === 0, 'L2.1: σ ≥ 1 px (o ≥ 0,85 en el tope) en ' + banco.length + ' objetos × 4 aperturas');
console.log('       el peor: ' + peor.nombre + ' (' + peor.lado.toFixed(2) + '′ → ' + peor.px +
  ' px, ' + peor.esc.toFixed(3) + '″/px) con ' + peor.D + ' mm → σ = ' + peor.s.toFixed(3) + ' px');
console.log('       ' + enTope + ' de ' + banco.length + ' objetos del banco llegan al tope de ' + PS1.salidaMax + ' px');
/* Y la comparación que separa la fase 2 de la 1: a 1024 px fijos los grandes SÍ
   caían por debajo del píxel, que es el motivo escrito del extremo alto. */
var sFase1 = sigmaPxProd(914, escalaAs(20, PS1.salida));
ok(sFase1 < 1, 'a la resolución de la fase 1 (' + escalaAs(20, PS1.salida).toFixed(3) +
  '″/px en 20′) un 914 mm daba σ = ' + sFase1.toFixed(3) + ' px: el listón no se cumplía');

console.log('\n— Lo que NO se toca —');
casi(PS1.ladoMax, 20, 1e-12, 'PS1.ladoMax');
casi(PS1.seeingAs, 1.1, 1e-12, 'PS1.seeingAs');
casi(CFG.airyArcsec, 138.4, 1e-12, 'airyArcsec');
casi(CFG.seeingArcsec, 2.0, 1e-12, 'seeingArcsec');
casi(FOT.C_MAG_MIN, 0.45, 1e-12, 'C_MAG_MIN');
casi(FOT.C_MAG_MAX, 2.0, 1e-12, 'C_MAG_MAX');
casi(FOT.C_MAG_EXP, 1.0, 1e-12, 'C_MAG_EXP');
casi(PS1.escalaObjetivoAs, 0.5, 1e-12, 'PS1.escalaObjetivoAs (regla C)');
casi(PS1.salidaMax, SALIDA_MAX_PROXY, 1e-12, 'PS1.salidaMax = el tope del proxy: la regla cabe en él');
casi(PS1.salidaMin, 128, 1e-12, 'PS1.salidaMin');

console.log(fallos ? '\n' + fallos + ' FALLOS\n' : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
