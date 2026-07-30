#!/usr/bin/env node
/* Test del TAMAÑO FÍSICO de la imagen estelar
   (`radioEstrella` en resources/js/bitacora-gaia-render.js).

   Lo que fija: una estrella es una fuente puntual, así que lo que se ve en el
   ocular es su DISCO DE AIRY (2,44·λ/D, un ángulo fijo sobre el cielo) sumado al
   borrón del seeing. Al ser ángulos de cielo, el aumento los agranda: por eso las
   estrellas "engordan" con el aumento. Y el disco de Airy va como 1/D: por eso un
   telescopio de más apertura las da más apretadas al mismo aumento.

   El modelo anterior no tenía ninguna de las dos cosas —el tamaño solo dependía
   de la magnitud—, así que cambiar de telescopio o subir el aumento no movía nada.

   Sin dependencias:  node scripts/test_estrella_fisica.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var C = R.config;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(a, b, tol, etiqueta) {
  if (a != null && Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a.toFixed(3)); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

/* ── Cómo se muestra el lienzo (las constantes son de bitacora-ocular.js) ──── */
var SIZE = 720, AFOV_REF = 110, VENTANA = 560;
function equipo(aperturaMm, focalMm, focalOcular, afov) {
  var aum = focalMm / focalOcular;
  return {
    apertura: aperturaMm, aumentos: aum, afov: afov,
    arcmin: (afov / aum) * 60,
    diam: VENTANA * Math.min(1, afov / AFOV_REF)
  };
}
// Radio dibujado, en píxeles DE PANTALLA (lo que de verdad ve el observador). No
// recibe magnitud: el disco lo fijan la apertura, el aumento y el seeing.
function radioPantalla(eq) {
  return R.radioEstrella({
    arcmin: eq.arcmin, afov: eq.afov, apertura: eq.apertura, size: SIZE
  }) * eq.diam / SIZE;
}
function huecoPantalla(eq, sepArcsec) {
  return (sepArcsec / 3600) * (SIZE / (eq.arcmin / 60)) * eq.diam / SIZE;
}

/* ── 1. El disco de Airy, contra el número de libro ───────────────────────────
   Radio del primer anillo oscuro = 1,22·λ/D. A 550 nm son 138″/D(mm), que es el
   criterio de Rayleigh: para 114 mm, 1,21″ (el límite de Dawes de ese tubo es
   1,02″, un 19 % más apretado, como debe ser). */
console.log('Disco de Airy (radio en segundos de arco):');
casi(R.radioAiry(114), 138.4 / 114, 0.01, 'un 114 mm da ' + (138.4 / 114).toFixed(2) + '″');
casi(R.radioAiry(200), 138.4 / 200, 0.01, 'un 200 mm, la mitad y algo');
ok(R.radioAiry(400) < R.radioAiry(114), 'más apertura, disco más pequeño');
casi(R.radioAiry(114) / R.radioAiry(228), 2, 1e-9, 'el doble de apertura, la mitad de disco (va como 1/D)');
ok(R.radioAiry(0) === null && R.radioAiry(null) === null, 'sin apertura no hay disco');

/* ── 2. Las estrellas engordan con el aumento ─────────────────────────────────
   La sensación en el ocular: el disco es un ángulo de CIELO fijo, así que al
   magnificar más, ocupa más. Mismo telescopio, mismo ocular de campo aparente,
   distinta focal efectiva (un Barlow). */
console.log('\nMismo telescopio, más aumento (Barlow 1,5× y 3× sobre un 114/1000):');
var x222 = equipo(114, 1000, 4.5, 72);
var x333 = equipo(114, 1000 * 1.5, 4.5, 72);
var x667 = equipo(114, 1000 * 3.0, 4.5, 72);
ok(x222.aumentos < x333.aumentos && x333.aumentos < x667.aumentos,
  'aumentos: ' + [x222, x333, x667].map(function (e) { return e.aumentos.toFixed(0) + '×'; }).join(' < '));

var r222 = radioPantalla(x222), r333 = radioPantalla(x333), r667 = radioPantalla(x667);
console.log('       radio de la estrella: ' + r222.toFixed(2) + ' → ' + r333.toFixed(2) + ' → ' + r667.toFixed(2) + ' px');
ok(r333 > r222, 'a 333× la estrella es MAYOR que a 222×');
ok(r667 > r333, 'y a 667× mayor que a 333×');
/* El 20 % es el umbral de "se nota a ojo". No sale más porque el suelo de
   visibilidad diluye el término físico: a 222× la imagen estelar real son 0,49 px
   y el suelo 1,78, así que la cuadratura apenas la deja asomar. Subir el efecto
   pasa por bajar el suelo, y eso es lo que hace desaparecer los globulares. */
ok(r667 / r222 > 1.20, 'de 222× a 667× engorda al menos un 20 % (×' + (r667 / r222).toFixed(2) + ')');

/* ── 3. Cambiar de telescopio cambia el tamaño ────────────────────────────────
   Al MISMO aumento y mismo ocular, más apertura = disco de Airy más pequeño =
   estrellas más apretadas. Un 114 y un 300 a 333×. */
console.log('\nMismo aumento, distinta apertura (114 mm y 300 mm, los dos a 333×):');
var chico = equipo(114, 1500, 4.5, 72);
var grande = equipo(300, 1500, 4.5, 72);
ok(Math.abs(chico.aumentos - grande.aumentos) < 1e-9, 'mismo aumento: ' + chico.aumentos.toFixed(0) + '×');
var rChico = radioPantalla(chico), rGrande = radioPantalla(grande);
console.log('       radio: 114 mm → ' + rChico.toFixed(2) + ' px · 300 mm → ' + rGrande.toFixed(2) + ' px');
ok(rGrande < rChico, 'el de 300 mm da la estrella MÁS APRETADA que el de 114 mm');

/* Y donde el término físico manda (mucho aumento), la diferencia se nota más. */
var chicoAlto = equipo(114, 3000, 4.5, 72), grandeAlto = equipo(300, 3000, 4.5, 72);
var razonAlto = radioPantalla(chicoAlto) / radioPantalla(grandeAlto);
var razonBajo = rChico / rGrande;
ok(razonAlto > razonBajo, 'a más aumento, la apertura se nota más (×' + razonAlto.toFixed(2) + ' contra ×' + razonBajo.toFixed(2) + ')');

/* ── 4. El seeing forma parte de la imagen estelar ────────────────────────────
   Con apertura grande el seeing es el que manda: es lo que impide que un 400 mm
   dé estrellas cuatro veces más finas que un 100 mm. */
console.log('\nEl seeing entra en cuadratura con el Airy:');
var seeingOriginal = C.seeingArcsec;
C.seeingArcsec = 0.5;                       // noche excepcional
var rBueno = radioPantalla(chico);
C.seeingArcsec = 5.0;                       // noche mala
var rMalo = radioPantalla(chico);
C.seeingArcsec = seeingOriginal;
ok(rMalo > rBueno, 'con peor seeing la estrella sale más gorda (' + rBueno.toFixed(2) + ' → ' + rMalo.toFixed(2) + ' px)');
ok(C.seeingArcsec === seeingOriginal, 'el seeing es una perilla de config, no una constante escondida');

/* ── 5. Lo que NO se puede romper ─────────────────────────────────────────────
   Los dos criterios que ya estaban, que siguen mandando: un globular tiene que
   verse y un par resuelto tiene que verse partido. */
console.log('\nLos dos criterios anteriores siguen en pie:');
var m13 = equipo(200, 1200, 9, 100);
var rM13 = radioPantalla(m13);
ok(rM13 >= 0.88, 'M13 a 133×: sus estrellas miden ' + rM13.toFixed(2) + ' px de radio (suelo 0,88)');
var almaak = equipo(114, 1500, 4.5, 72);
var suma = 2 * radioPantalla(almaak);
var hueco = huecoPantalla(almaak, 9.6);
ok(suma < hueco, 'Almaak a 333×: los discos (' + suma.toFixed(2) + ' px) caben en el hueco (' + hueco.toFixed(2) + ' px)');

/* Y el invariante del campo aparente: dos oculares de la misma focal, distinto
   campo, siguen dando la misma estrella en pantalla. */
console.log('\nY el invariante del campo aparente:');
var ethos = equipo(114, 1500, 4.5, 100), ap = equipo(114, 1500, 4.5, 46);
casi(radioPantalla(ethos), radioPantalla(ap), 1e-9,
  'Ethos de 100° y AstroPhysics de 46°, misma estrella en pantalla');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
