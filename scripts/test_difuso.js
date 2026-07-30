#!/usr/bin/env node
/* Test de la CADENA FOTOMÉTRICA COMPARTIDA del render de Gaia
   (resources/js/bitacora-gaia-render.js).

   Vigila los sitios donde un error es silencioso y visualmente plausible: la
   pupila de salida aplicada dos veces, el anclaje del brillo superficial, la
   curva de tono de las estrellas y el realce perceptual de las capas.

   Sin dependencias:  node scripts/test_difuso.js

   Las capas difusas (telón, halo de King, galaxias, nebulosas) se borraron del
   render junto con `capasDifusas`; sus tests iban aquí y se quitaron con ellas. */
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

/* ── 14. La apertura tiene que notarse en los objetos extensos ──────────────
   El brillo superficial NO puede subir con la apertura: a igual pupila de salida
   es idéntico, y eso es física. Lo que sí cambia es el tamaño en la retina, y un
   objeto mayor se detecta con mucho menos contraste (Blackwell, vía Clark). Sin
   ese término, cambiar de un 12" a un 18" no mejoraba nada salvo las estrellas. */
console.log('Apertura y umbral de contraste:');
function ctxDe(pupila, aumentos) {
  return R.ctxFotometrico({ pupilaSalida: pupila, pupilaOjo: 7, sqm: 21, transmision: 0.7, aumentos: aumentos });
}
// Mismo ocular en un 12" y en un 18": más aumentos, umbral más bajo.
var doce = ctxDe(305 / 254, 254), diecoicho = ctxDe(457 / 343, 343);
ok(diecoicho.Cmin < doce.Cmin * 0.9,
  'un 18" baja el umbral respecto a un 12" (' + doce.Cmin.toFixed(3) + ' → ' + diecoicho.Cmin.toFixed(3) + ')');

/* Pero el FONDO solo depende de la pupila de salida, nunca de la apertura: si
   esto se rompiera, el simulador estaría inventando luz que el telescopio no
   puede dar, y ese es el error más fácil de colar «para que se vea mejor». */
casi(ctxDe(2, 100).nivelFondo, ctxDe(2, 400).nivelFondo, 1e-9,
  'el fondo no cambia con los aumentos a igual pupila de salida');

// Y el término satura por arriba y por abajo, para no dispararse en los extremos.
var enorme = ctxDe(2, 100000), minusculo = ctxDe(2, 0.01);
var sinTermino = R.ctxFotometrico({ pupilaSalida: 2, pupilaOjo: 7, sqm: 21, transmision: 0.7 });
casi(enorme.Cmin / sinTermino.Cmin, FOT.C_MAG_MIN, 1e-9, 'acotado por abajo');
casi(minusculo.Cmin / sinTermino.Cmin, FOT.C_MAG_MAX, 1e-9, 'acotado por arriba');

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
