#!/usr/bin/env node
/* Test del PAR DE UNA DOBLE completado desde el catálogo
   (`parDoble` en resources/js/bitacora-gaia-render.js).

   El fallo que fija: Gaia DR3 satura por arriba y no trae las primarias muy
   brillantes. La de Almaak (γ And A, V 2,3 pero G ≈ 1,5 por ser una gigante K3
   muy roja) no está en el catálogo, así que el simulador dibujaba UNA estrella
   —la compañera— mientras el veredicto decía «se resuelve». No había par que
   partir.

   No todas las dobles lo sufren (Mizar, Achird y 65 Psc vienen completas de
   Gaia), así que lo que se comprueba aquí es justo eso: que solo se sintetiza lo
   que falta y que a un par completo no se le añade nada.

   Sin dependencias:  node scripts/test_par_doble.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a.toFixed(4)); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

/* Almaak, del catálogo de dobles: 02 03 54 / +42 19 42, mag 2,3 y 5,1, sep 9,6″. */
var ALMAAK = { ra: 30.975, dec: 42.3283, mag1: 2.3, mag2: 5.1, sep: 9.6 };

// Separación en segundos de arco entre dos entradas [ra, dec, g, bprp].
function separacion(a, b) {
  var cos0 = Math.cos(a[1] * Math.PI / 180);
  var dra = (((b[0] - a[0] + 540) % 360) - 180) * cos0, ddec = b[1] - a[1];
  return Math.sqrt(dra * dra + ddec * ddec) * 3600;
}
function estrella(sepArcsec, paGrados, g, centro) {
  var c = centro || ALMAAK, pa = paGrados * Math.PI / 180;
  return [c.ra + sepArcsec * Math.sin(pa) / (3600 * Math.cos(c.dec * Math.PI / 180)),
          c.dec + sepArcsec * Math.cos(pa) / 3600, g, 0.5];
}

/* ── 1. El caso de Almaak: Gaia solo trae la compañera ─────────────────────── */
console.log('Almaak: Gaia solo trae la compañera (G 4,86):');
var soloB = [estrella(9.9, 20, 4.86), estrella(25, 200, 15.29), estrella(30, 300, 17.01)];
var conPar = R.parDoble(soloB, ALMAAK);

ok(conPar.length === soloB.length + 1, 'añade UNA componente (' + soloB.length + ' → ' + conPar.length + ')');
ok(soloB.length === 3, 'y no toca la lista original (sigue con 3)');
var nueva = conPar[conPar.length - 1];
casi(nueva[2], 2.3, 1e-9, 'la que falta es la primaria de mag 2,3');
/* Tolerancia de 0,01″: el desplazamiento usa cos δ del centro del par y aquí se
   mide desde la componente hallada, unos segundos más al norte. La aproximación
   de cielo plano deja esa miga, irrelevante para dibujar. */
casi(separacion(soloB[0], nueva), ALMAAK.sep, 0.01, 'a la separación del catálogo (″), desde la que sí estaba');
ok(nueva[3] === null, 'sin color: el catálogo de dobles no trae BP–RP');

/* Las estrellas de campo débiles no se confunden con la componente que falta: si
   se hubieran contado como componentes, no se habría añadido nada. */
ok(conPar.length > soloB.length, 'las estrellas de campo débiles no cuentan como componentes');

/* ── 2. Un par que Gaia sí trae completo no se toca ─────────────────────────── */
console.log('\nMizar (G 2,28 + 3,91), Achird (3,32 + 6,76): Gaia las trae:');
var mizar = { ra: 200.9814, dec: 54.9254, mag1: 2.2, mag2: 3.9, sep: 14.4 };
var parCompleto = [estrella(0.5, 10, 2.28, mizar), estrella(14.2, 150, 3.91, mizar), estrella(20, 60, 16.4, mizar)];
ok(R.parDoble(parCompleto, mizar) === parCompleto, 'con las dos componentes presentes, devuelve la lista TAL CUAL');

var achird = { ra: 12.2761, dec: 57.815, mag1: 3.4, mag2: 7.4, sep: 11.6 };
var achirdGaia = [estrella(0.4, 30, 3.32, achird), estrella(11.5, 210, 6.76, achird)];
ok(R.parDoble(achirdGaia, achird) === achirdGaia, 'la secundaria más débil que mag2 también cuenta (G 6,76 < V 7,4)');

/* ── 3. Un campo sin ninguna de las dos: se sintetizan las dos ─────────────── */
console.log('\nNi una componente en el catálogo:');
var vacio = [estrella(28, 95, 18.2)];
var dos = R.parDoble(vacio, ALMAAK);
ok(dos.length === 3, 'añade las dos componentes');
casi(dos[1][2], 2.3, 1e-9, 'la primaria, con la magnitud del catálogo');
casi(dos[2][2], 5.1, 1e-9, 'y la secundaria');
casi(separacion(dos[1], dos[2]), ALMAAK.sep, 1e-6, 'separadas exactamente lo que dice el catálogo (″)');
casi(dos[1][0], ALMAAK.ra, 1e-12, 'la primaria va en las coordenadas del catálogo (ra)');
casi(dos[1][1], ALMAAK.dec, 1e-12, 'y en su declinación');

/* El ángulo es asumido, pero no puede salir alineado con los ejes: un par
   perfectamente vertical u horizontal se lee como un artefacto del dibujo. */
var dRa = Math.abs(dos[2][0] - dos[1][0]), dDec = Math.abs(dos[2][1] - dos[1][1]);
ok(dRa > 1e-9 && dDec > 1e-9, 'el par sale oblicuo, no pegado a un eje');

/* ── 4. Sin datos no se inventa nada ───────────────────────────────────────── */
console.log('\nEntradas del catálogo a medias (muchas múltiples no traen sep ni mag2):');
var campo = [estrella(9.9, 20, 4.86)];
ok(R.parDoble(campo, { ra: 30.975, dec: 42.3283, mag1: 4.4, mag2: null, sep: null }) === campo, 'sin sep ni mag2');
ok(R.parDoble(campo, { ra: 30.975, dec: 42.3283, mag1: 4.4, mag2: 7.0, sep: null }) === campo, 'sin separación');
ok(R.parDoble(campo, { ra: 30.975, dec: 42.3283, mag1: 4.4, mag2: null, sep: 12 }) === campo, 'sin la magnitud de la B');
ok(R.parDoble(campo, { ra: NaN, dec: 42.3283, mag1: 2.3, mag2: 5.1, sep: 9.6 }) === campo, 'sin coordenadas');
ok(R.parDoble([], ALMAAK).length === 2, 'un campo vacío del todo sí recibe el par');

/* ── 5. Declinaciones altas: la separación es la de verdad, no la de la RA ──── */
console.log('\nCerca del polo, la RA se estrecha (cos δ):');
var polar = { ra: 100, dec: 85, mag1: 5.0, mag2: 6.0, sep: 20 };
var pares = R.parDoble([], polar);
casi(separacion(pares[0], pares[1]), polar.sep, 1e-6, 'a δ +85° la separación sigue siendo 20″');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
