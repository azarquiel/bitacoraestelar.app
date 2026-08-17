#!/usr/bin/env node
/* Test de la CADENA FOTOMÉTRICA COMPARTIDA del render de Gaia
   (resources/js/bitacora-gaia-render.js).

   Vigila los sitios donde un error es silencioso y visualmente plausible: la
   pupila de salida aplicada dos veces, el anclaje del brillo superficial, la
   curva de tono de las estrellas y el realce perceptual de las capas.

   Sin dependencias:  node scripts/test_difuso.js

   El telón difuso, las galaxias y las nebulosas sintéticas se borraron del
   render junto con `capasDifusas`; sus tests iban aquí y se quitaron con
   ellas. El halo de King de los cúmulos globulares volvió (con otra
   arquitectura, sin discretizar en anillos) — su test vive aparte, en
   scripts/test_globulares.js. */
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

/* ── 13b. El realce perceptual decae si el objeto ya está bien visible ──────
   Bug (2026-08-01): el boost de GAMMA_PERCEPTUAL se aplicaba IGUAL da igual
   si el objeto rozaba el umbral de contraste (donde ayuda, evita que
   desaparezca) o si ya estaba muy por encima (visibilidadDifusa≈1, un núcleo
   de cúmulo globular bien resuelto): un núcleo ya visible del todo se inflaba
   igual que una nebulosa apenas perceptible, y se veía quemado/blanco. El
   quinto parámetro `s` (la misma visibilidad 0-1 que pintarFot ya calcula
   antes de llamar) atenúa el gamma hacia 1 (sin boost) según crece s. */
console.log('Realce perceptual decae con la visibilidad (no infla lo ya visible):');
function nivelDeS(mu, s) {
  var F = Math.pow(10, -0.4 * mu);
  F = R.realzarPerceptual(F, Fc2, rg, s);
  return R.valorDeFlujo(F, Fc2, rg);
}
var sinBoost = nivelDeS(21.62, 1), boostCompleto = nivelDeS(21.62, 0);
ok(Math.abs(sinBoost - nivelDe(21.62, false)) < 0.5,
  's=1 (ya totalmente visible): nivel ≈ igual que sin realce (' + sinBoost.toFixed(1) + ' vs ' +
  nivelDe(21.62, false).toFixed(1) + ')');
ok(Math.abs(boostCompleto - nivelDe(21.62, true)) < 0.5,
  's=0 (justo en el umbral): nivel ≈ igual que el realce de siempre (' + boostCompleto.toFixed(1) + ')');
ok(sinBoost < boostCompleto, 'a más visibilidad, menos boost (' + sinBoost.toFixed(1) + ' < ' + boostCompleto.toFixed(1) + ')');

/* ── 13c. Techo del realce, para las capas que traen imagen real ─────────────
   El realce se calibró contra un Sérsic sintético y el halo de King, que apenas
   tienen luz por debajo de μ23. Una imagen de PanSTARRS sí la tiene en todas
   partes, y ahí el boost llega a ×13: el brazo externo de M51 y la nube sobre
   NGC 5195 salían casi tan brillantes como el disco interior —0,8 mag de
   regalo— cuando en ese telescopio apenas se intuirían. El techo es POR CAPA:
   sin él, la cadena es exactamente la de antes, que es lo que mantiene quietas
   las placas, los globulares y el caso de NGC 891. */
function boostDe(mu, s, techo) {
  var F = Math.pow(10, -0.4 * mu);
  return R.realzarPerceptual(F, Fc2, rg, s, techo) / F;
}
[21, 22, 23, 24].forEach(function (mu) {
  ok(boostDe(mu, 0.2, 2) <= 2 + 1e-9,
    'con techo 2, μ=' + mu + ' no se infla más de ×2 (era ×' + boostDe(mu, 0.2).toFixed(1) + ')');
});
ok(boostDe(20, 0.95, 2) < 1.2, 'lo que ya se ve bien no lo toca el techo');
[21, 23].forEach(function (mu) {
  casi(boostDe(mu, 0.2, 0), boostDe(mu, 0.2), 1e-12,
    'sin techo (0), μ=' + mu + ': la cadena de siempre, intacta');
});

/* ── 14. La apertura tiene que notarse en los objetos extensos ──────────────
   El brillo superficial NO puede subir con la apertura: a igual pupila de salida
   es idéntico, y eso es física. Lo que sí cambia es el tamaño en la retina, y un
   objeto mayor se detecta con mucho menos contraste (Blackwell, vía Clark). Sin
   ese término, cambiar de un 12" a un 18" no mejoraba nada salvo las estrellas. */
console.log('Apertura y umbral de contraste:');
function ctxDe(pupila, aumentos) {
  return R.ctxFotometrico({ pupilaSalida: pupila, pupilaOjo: 7, sqm: 21, transmision: 0.7, aumentos: aumentos });
}
/* Mismo ocular en un 12" y en un 18": más aumentos, umbral más bajo. El margen
   era 0,9 y ya no se cumple, pero no porque la ley empeore: con C_MAG_EXP 1,0
   el clamp C_MAG_MIN entra en 222x, y 254x y 343x están LOS DOS pasados, así
   que el término de tamaño aporta lo mismo a ambos y la ventaja del 18" es
   solo la pupila de salida. Se comprueba contra esa predicción exacta en vez
   de contra un margen a ojo. */
var doce = ctxDe(305 / 254, 254), diecoicho = ctxDe(457 / 343, 343);
ok(diecoicho.Cmin < doce.Cmin,
  'un 18" baja el umbral respecto a un 12" (' + doce.Cmin.toFixed(3) + ' → ' + diecoicho.Cmin.toFixed(3) + ')');
casi(diecoicho.Cmin / doce.Cmin,
  Math.pow(diecoicho.dim / doce.dim, -FOT.C_EXP), 1e-9,
  'y la ventaja es EXACTAMENTE el término de pupila: los dos van pasados del aumento óptimo');

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

/* ── 15. Contaminación lumínica comprime el contraste de las estrellas ──────
   Bug: pintarFot() invertía el valor de pantalla de una estrella con el
   Fcielo de LA ESCENA y volvía a pasarlo por la curva con ese mismo Fcielo:
   son funciones inversas exactas, así que el contraste de la estrella sobre
   el fondo era invariante al SQM y una estrella se veía IGUAL de marcada con
   cielo negro que con cielo muy contaminado — y como el fondo sí se aclaraba,
   parecía que aparecían estrellas nuevas al empeorar el cielo. Arreglo:
   invertir contra Fref (fijo, sqm=21) y solo el segundo paso usa el Fcielo
   real, así el contraste SÍ se comprime cuando el cielo empeora. */
console.log('Contaminación lumínica comprime el contraste de las estrellas:');
function contrasteEstrella(sqm, v) {
  var c = R.ctxFotometrico({ pupilaSalida: 2, pupilaOjo: 7, sqm: sqm, transmision: 1 });
  return R.valorDeFlujo(R.flujoDeValor(v, c.Fref, c.rango), c.Fcielo, c.rango);
}
ok(R.ctxFotometrico({ pupilaSalida: 2, pupilaOjo: 7, sqm: 21.9, transmision: 1 }).Fref ===
  R.ctxFotometrico({ pupilaSalida: 2, pupilaOjo: 7, sqm: 16.15, transmision: 1 }).Fref,
  'Fref es fijo, no depende del sqm de la escena');
casi(contrasteEstrella(21, 128), 128, 1e-9,
  'en sqm=21 (la referencia) el contraste no cambia: compatible con el comportamiento anterior');
var claro = contrasteEstrella(21.9, 128), contaminado = contrasteEstrella(16.15, 128);
ok(claro > contaminado,
  'la misma estrella (' + claro.toFixed(1) + ' en cielo oscuro vs ' + contaminado.toFixed(1) +
  ' con contaminación) pierde contraste al empeorar el cielo, ya no lo mantiene fijo');

/* ── 15b. El halo difuso de un cúmulo globular NO se suma sin comprimir al
   brillo propio de una estrella resuelta ──────────────────────────────────
   Sospecha del usuario (2026-08-01): que el halo de un globular sufriera el
   mismo bug que la contaminación lumínica (nº15) -que el "exceso" de una
   estrella sobre su fondo se mantenga fijo pase lo que pase con el fondo, en
   vez de comprimirse-. pintarFot() usa la MISMA fórmula para cualquier fondo
   difuso (Fobj[i], venga de contaminación o de perfil de King): F = difuso +
   flujoDeValor(v, Fref, rango); salida = valorDeFlujo(F, Fcielo, rango). Como
   valorDeFlujo es logarítmica (cóncava), el exceso que aporta la estrella
   SIEMPRE decrece al crecer F, sea cual sea la fuente del difuso -no hace
   falta lógica aparte por cúmulo-. Se reproduce aquí la fórmula exacta de
   pintarFot con las mismas piezas exportadas que usa el nº15, sin canvas. */
console.log('Halo de cúmulo globular comprime el exceso de una estrella, igual que la CL:');
var cFondo = R.ctxFotometrico({ pupilaSalida: 2, pupilaOjo: 7, sqm: 21, transmision: 1 });
function pixelFot(v, difuso) {
  var F = difuso + (v > 0 ? R.flujoDeValor(v, cFondo.Fref, cFondo.rango) : 0);
  return cFondo.nivelFondo + R.valorDeFlujo(F, cFondo.Fcielo, cFondo.rango);
}
var vEstrella = 200;
var nivelesDifuso = [0, cFondo.Fcielo, cFondo.Fcielo * 10, cFondo.Fcielo * 100, cFondo.Fcielo * 1000];
var excesos = nivelesDifuso.map(function (dif) { return pixelFot(vEstrella, dif) - pixelFot(0, dif); });
var comprimeSiempre = true;
for (var e = 1; e < excesos.length; e++) if (excesos[e] >= excesos[e - 1]) comprimeSiempre = false;
ok(comprimeSiempre, 'el exceso de la estrella (' + excesos.map(function (x) { return x.toFixed(0); }).join(' → ') +
  ') decrece según crece el difuso local (halo del cúmulo), nunca se mantiene fijo ni crece');
ok(excesos[0] === vEstrella, 'sin difuso de fondo, el exceso es exactamente el valor propio de la estrella');

/* ── 16. El cruce resuelta/glow en g=mlim es continuo ───────────────────────
   Bug real (el que seguía viéndose tras el fix de Fref): la rama resuelta
   tenía un SUELO alfaMin y la rama de glow (no resuelta) arrancaba en
   glowIntensidad, una constante sin relación con alfaMin. Al empeorar el
   cielo mlim baja y una estrella cruza de una rama a otra: si glowIntensidad
   > alfaMin, cruzar el límite la hace SALTAR a un alpha mayor (y un radio de
   glow mayor que el disco puntual) justo cuando debería desvanecerse — se ve
   como si "apareciera" una estrella nueva. Arreglo: ancla la rama de glow en
   alfaMin, así en g=mlim las dos ramas coinciden EXACTAMENTE. */
console.log('Cruce resuelta/glow en mlim, sin salto:');
var CFG = R.config;
function alphaResuelta(mlim, g) {
  return Math.max(CFG.alfaMin, CFG.brillo * Math.min(1, (mlim - g) / CFG.rangoBrillo));
}
function alphaGlow(mlim, g) { return CFG.alfaMin * Math.pow(10, -0.4 * (g - mlim)); }
casi(alphaResuelta(14, 14), alphaGlow(14, 14 + 1e-9), 1e-6,
  'en g=mlim las dos ramas dan el mismo alpha (continuidad)');
ok(alphaGlow(14, 14.5) < alphaResuelta(14, 14) && alphaGlow(14, 15) < alphaGlow(14, 14.5),
  'pasado el límite el glow solo decae, nunca sube');

/* ── 17. El salto de brillo entre dos estrellas es el de sus magnitudes ──────
   Dos estrellas separadas por Δmag se diferencian en un factor 10^(0,4·Δmag)
   de flujo, y eso es una propiedad de las ESTRELLAS: ningún telescopio la
   cambia. En el render tiene que sobrevivir a dos conversiones seguidas —la
   rampa de alpha de dibujar(), que es lineal en magnitudes, y el flujoDeValor()
   de pintarFot(), que vuelve a flujo exponencialmente—, y solo se conserva si
   las dos reparten las MISMAS magnitudes sobre el intervalo 0-1.

   Con rangoBrillo=12 contra un rango de 11,5 no se conservaba: cada magnitud
   se pintaba como 0,958 y un salto de 2 mag salía 5,84x en vez de 6,31x. De
   ahí que rangoBrillo se derive ahora de SB_NEGRO-SB_BLANCO; este test es lo
   que impide que vuelvan a separarse. */
console.log('El salto de brillo entre dos magnitudes no depende del equipo:');
var rangoTono = FOT.SB_NEGRO - FOT.SB_BLANCO;
casi(CFG.rangoBrillo, rangoTono, 1e-9,
  'rangoBrillo es el rango de tono, no un número suelto');
// Flujo que pintarFot() reconstruye del valor de pantalla de una estrella, sin
// el término -1 (que resta el cielo y es lo único que rompe la igualdad exacta
// entre equipos; ver más abajo). Fref, no Fcielo: ver el comentario de pintarFot.
var Fref = Math.pow(10, -0.4 * 21);
function flujoPintado(mlim, g) {
  return Fref * Math.pow(10, 255 * alphaResuelta(mlim, g) * rangoTono / (255 * 2.5));
}
[[15.91, '18" f/4.5 a 158x'], [14.72, '8" f/10 a 156x']].forEach(function (eq) {
  casi(flujoPintado(eq[0], 8) / flujoPintado(eq[0], 10), Math.pow(10, 0.4 * 2), 1e-6,
    'mag 8 vs mag 10 en un ' + eq[1] + ' = 6,31x');
});
// Y no es cosa de esas dos magnitudes ni de esos dos equipos: la ley vale en
// todo el tramo donde la rampa no está ni saturada (alfa=1) ni en su suelo.
var ratios = [];
[15.91, 14.72, 12.0, 18.0].forEach(function (mlim) {
  for (var g = mlim - CFG.rangoBrillo + 0.5; g < mlim - CFG.alfaMin * CFG.rangoBrillo - 1; g += 0.7) {
    ratios.push(flujoPintado(mlim, g) / flujoPintado(mlim, g + 1));
  }
});
ok(ratios.every(function (r) { return Math.abs(r - Math.pow(10, 0.4)) < 1e-6; }),
  'una magnitud de diferencia son 2,512x en ' + ratios.length + ' puntos de 4 equipos distintos');
// El -1 de flujoDeValor resta el cielo, así que el flujo reconstruido de verdad
// no es exactamente proporcional: deja un residuo que SÍ depende del equipo.
// Es correcto (el valor de pantalla es un incremento sobre el fondo, no un flujo
// absoluto) y es pequeño; lo que se fija aquí es que siga siendo pequeño.
function flujoReal(mlim, g) { return R.flujoDeValor(255 * alphaResuelta(mlim, g), Fref, rangoTono); }
var r18 = flujoReal(15.91, 8) / flujoReal(15.91, 10);
var r8 = flujoReal(14.72, 8) / flujoReal(14.72, 10);
ok(Math.abs(r18 - r8) / r8 < 0.02,
  'con el -1 del cielo, los dos equipos siguen coincidiendo al 2 % (' +
  r18.toFixed(3) + ' vs ' + r8.toFixed(3) + ')');

/* ── 18. La capa de galaxias desde imagen real (ps1cutouts) ──────────────────
   Todo con un parche SINTÉTICO en memoria: sin red, sin FITS de verdad. Lo que
   se vigila es lo que falla en silencio y sale visualmente plausible: una URL
   sin wcs=1 (el servicio contesta 200 OK con un recorte de otro sitio), un
   pedestal de cielo que se cuela en el nivel, una máscara de estrellas que se
   come el núcleo, o un parche pintado un poco corrido. */
console.log('\nCapa de galaxias desde imagen real (ps1cutouts):');

/* La petición al proxy: objeto, lado y banda, y nada de ocular ni aumento (de
   eso depende que el parche se pueda cachear para siempre). Lo que hay detrás
   —skycells, wcs=1, el `size` en píxeles nativos— lo prueba
   scripts/test_ps1_proxy.php, que es donde vive. */
var urlPar = R.ps1UrlParche({ ra: 10.6847, dec: 41.269, ladoArcmin: 3 });
ok(/[?&]lado=3\.00(&|$)/.test(urlPar), 'la URL del parche lleva el lado en minutos');
ok(/[?&]banda=g(&|$)/.test(urlPar), 'y la banda');
ok(!/aumento|pupila|ocular/.test(urlPar), 'y nada del equipo: el parche no depende de él');

/* El lector de FITS, contra un fichero armado aquí mismo: float32 BIG-endian,
   cabecera en bloques de 2880 y un NaN que tiene que llegar como NaN (es la
   marca de "fuera de la skycell" que usa la fusión). */
var cards = ['SIMPLE  =                    T', 'BITPIX  =                  -32',
             'NAXIS   =                    2', 'NAXIS1  =                    2',
             'NAXIS2  =                    2', 'CDELT2  =    2.7777777778E-04',
             'ZPT_0000=                24.46', 'END'];
var cab = cards.map(function (c) { while (c.length < 80) c += ' '; return c; }).join('');
while (cab.length % 2880) cab += ' ';
var buf = new ArrayBuffer(cab.length + 16), vistaB = new DataView(buf), bytesB = new Uint8Array(buf);
for (var i18 = 0; i18 < cab.length; i18++) bytesB[i18] = cab.charCodeAt(i18);
[1.5, -2.25, NaN, 100].forEach(function (v, k) { vistaB.setFloat32(cab.length + k * 4, v, false); });
var fits = R.parseFITS(buf);
ok(fits && fits.ancho === 2 && fits.alto === 2, 'el lector de FITS saca las dimensiones');
casi(fits.escalaAs, 1, 1e-6, 'CDELT2 se lee en ″/px');
casi(fits.zpt, 24.46, 1e-6, 'el punto cero de la cabecera se lee (aunque el nivel lo ponga el catálogo)');
ok(fits.datos[0] === 1.5 && fits.datos[1] === -2.25 && fits.datos[3] === 100,
  'los píxeles llegan en big-endian, con su signo');
ok(!(fits.datos[2] === fits.datos[2]), 'el NaN de fuera de la skycell sobrevive al lector');

// Parche sintético: perfil exponencial (n=1) sobre un pedestal de cielo.
var LADO = 3, RE = 30, ANCHO = 64;               // ′, ″, px
var ESCALA = LADO * 60 / ANCHO;                  // ″/px
function parcheSintetico(pedestal) {
  var d = new Float32Array(ANCHO * ANCHO), c = (ANCHO - 1) / 2;
  var h = ps1H();
  for (var y = 0; y < ANCHO; y++) {
    for (var x = 0; x < ANCHO; x++) {
      var r = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) * ESCALA;
      d[y * ANCHO + x] = pedestal + 1000 * Math.exp(-r / h);
    }
  }
  return d;
}
function ps1H() { return RE / 1.678; }           // escala de un disco exponencial

// El nivel absoluto lo pone el catálogo: la luz total del parche es la mag V del
// RC3, corregida por la fracción de Sérsic que cae dentro del parche.
var magV = 9.5, frac = R.ps1FraccionLuz(1, (LADO * 60 / 2) / RE);
var opAncla = { magV: magV, n: 1, reArcsec: RE, ladoArcmin: LADO, escalaAs: ESCALA };
function totalAnclado(pedestal) {
  var a = R.ps1AnclarACatalogo(parcheSintetico(pedestal), ANCHO, ANCHO, opAncla);
  var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
  return s * ESCALA * ESCALA;
}
ok(frac > 0.94 && frac < 0.98, 'con lado 6·r_e el parche recoge el ~96 % de la luz (' + frac.toFixed(3) + ')');
casi(-2.5 * Math.log10(totalAnclado(0) / frac), magV, 1e-6,
  'el parche anclado suma la mag V del catálogo');
// Y el pedestal de cielo del stack no cambia el nivel: se resta antes de integrar.
casi(totalAnclado(400) / totalAnclado(0), 1, 0.02,
  'un pedestal de cielo de 400 DN no mueve el nivel ni un 2 %');

/* El ruido del stack no puede hacerse pasar por galaxia. Recortar en cero lo que
   está por debajo del cielo conserva solo el ruido POSITIVO, así que un parche
   grande acaba con un pedestal falso repartido por todas partes: medido sobre
   M51, el 16 % del flujo integrado venía de más allá de 5′, donde ya no hay
   señal. Eso apagaba la galaxia (el anclaje reparte su luz entre ese ruido) y
   dejaba granulado en el fondo. El corte va en k·σ del borde. */
var ANCHO_R = 128, LADO_R = ANCHO_R * ESCALA / 60;   // parche ancho: 6′ = 12·r_e
function parcheConRuido(sigma) {
  var d = new Float32Array(ANCHO_R * ANCHO_R), c = (ANCHO_R - 1) / 2, semilla = 12345;
  function rnd() { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; }
  for (var y = 0; y < ANCHO_R; y++) {
    for (var x = 0; x < ANCHO_R; x++) {
      var r = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c)) * ESCALA;
      // Ruido gaussiano (suma de 12 uniformes) sobre un disco que muere pronto.
      var g = 0; for (var k = 0; k < 12; k++) g += rnd();
      d[y * ANCHO_R + x] = 1000 * Math.exp(-r / ps1H()) + (g - 6) * sigma;
    }
  }
  return d;
}
var SIGMA = 17;                                   // DN, el del stack de PS1 medido en M51
var anclado = R.ps1AnclarACatalogo(parcheConRuido(SIGMA), ANCHO_R, ANCHO_R,
  { magV: magV, n: 1, reArcsec: RE, ladoArcmin: LADO_R, escalaAs: ESCALA });
var luzLejos = 0, luzTotal = 0, pxConLuz = 0, cA = (ANCHO_R - 1) / 2;
for (var yA = 0; yA < ANCHO_R; yA++) {
  for (var xA = 0; xA < ANCHO_R; xA++) {
    var vA = anclado[yA * ANCHO_R + xA];
    if (!(vA > 0)) continue;
    pxConLuz++; luzTotal += vA;
    // Más allá de 4 r_e el disco ya no aporta nada: lo que quede ahí es ruido.
    if (Math.sqrt((xA - cA) * (xA - cA) + (yA - cA) * (yA - cA)) * ESCALA > 4 * RE) luzLejos += vA;
  }
}
ok(luzLejos / luzTotal < 0.05,
  'el ruido del stack no se cuela como luz de galaxia (' + (100 * luzLejos / luzTotal).toFixed(1) + '% lejos)');
ok(pxConLuz < ANCHO_R * ANCHO_R * 0.25,
  'el fondo de ruido no queda encendido entero (' + pxConLuz + ' de ' + (ANCHO_R * ANCHO_R) + ' px con luz)');

// (La costura de skycells por NaN se fue al proxy: scripts/test_ps1_proxy.php.)

/* Supresión de estrellas: TODAS las de la muestra de Gaia (máscara total, ficha
   04 revisada el 11-ago-2026), salvo la fuente nuclear de la galaxia (ver
   scripts/test_quitar_estrellas.js), y con un radio que depende solo de lo
   brillante que sea la estrella, no del equipo. Sin `geo` el relleno es la
   mediana de un anillo: reparte luz pero no la conserva al dígito, suma con
   holgura. */
function tocadosTrasQuitar(estrellas) {
  var d = parcheSintetico(0), enPx = [], pxPorAs = ANCHO / (LADO * 60);
  estrellas.forEach(function (e, k) {                         // [g, radio ″ desde el centro]
    enPx.push({ x: (ANCHO - 1) / 2 + e[1] * pxPorAs, y: (ANCHO - 1) / 2 + (k - 1) * 6,
                rPx: R.ps1RadioMascaraAs(e[0]) * pxPorAs });
  });
  var out = R.ps1QuitarEstrellas(d, ANCHO, ANCHO, enPx);
  var n = 0, s = 0;
  for (var j = 0; j < out.length; j++) { if (out[j] !== d[j]) n++; s += out[j]; }
  return { tocados: n, suma: s };
}
var qCero = tocadosTrasQuitar([]);
var qDebil = tocadosTrasQuitar([[19, 20]]);
var qTodas = tocadosTrasQuitar([[12, 60], [13.5, 45], [19, 30]]);
ok(qCero.tocados === 0 && qDebil.tocados > 0,
  'una estrella más débil que cualquier equipo también se enmascara (' + qDebil.tocados + ' px)');
ok(qTodas.tocados > qDebil.tocados,
  'cuantas más estrellas, más parche limpiado (' + qDebil.tocados + ' < ' + qTodas.tocados + ')');
ok(R.ps1RadioMascaraAs(12) > R.ps1RadioMascaraAs(19),
  'la estrella brillante se enmascara con más radio que la débil');
casi(R.ps1RadioMascaraAs(2), R.ps1.mascaraMaxAs, 1e-9, 'el radio de máscara tiene tope');
casi(R.ps1RadioMascaraAs(25), R.ps1.seeingAs, 1e-9, 'y suelo en el seeing del stack');
casi(qTodas.suma / qCero.suma, 1, 0.02, 'quitar estrellas no mueve la luz del parche ni un 2 %');

/* La ley magnitud → radio, contra lo medido en .scratch/alas-brillantes: 19031
   estrellas de 33 parches de PS1, apiladas por tramos y con un testigo del mismo
   radio galactocéntrico restado. Lo que se fija aquí es lo que costó medir. */
var gAntes = null, rAntes = null, escalones = 0;
for (var gM = 20; gM >= 4; gM -= 0.05) {
  var rM = R.ps1RadioMascaraAs(gM);
  if (rAntes != null) {
    if (rM < rAntes - 1e-9) escalones = -1;                       // se hizo MENOR al brillar más
    else if (escalones >= 0 && rM - rAntes > 0.02 * rAntes) escalones++;   // salto de más del 2 %
  }
  gAntes = gM; rAntes = rM;
}
ok(escalones === 0, 'R(g) no baja al brillar la estrella y no da saltos: es continua y monótona');
ok(R.ps1RadioMascaraAs(-1.5) <= R.ps1.mascaraMaxAs + 1e-9,
  'ni Sirio se salta el máximo absoluto (' + R.ps1RadioMascaraAs(-1.5).toFixed(1) + '″)');
/* La FORMA es lo medido: el radio crece ×10^(0,4/3) = 1,359 por magnitud, y el
   ajuste sobre los datos dio ×1,362 (α = 2,98 contra el 3 de la ley). Se
   comprueba donde el tope no manda todavía. */
casi(R.ps1RadioMascaraAs(15) / R.ps1RadioMascaraAs(16), Math.pow(10, 0.4 / 3), 1e-6,
  'y crece ×1,359 por magnitud, el ala r^-3 que dicen los perfiles apilados');
/* Los dos casos reales de M81 que dispararon la campaña. La estrella de g=11,3
   del parche pide ~30″: con el tope viejo de 25″ se quedaba corta, y las medidas
   por estrella piden 35–37″ en el tramo g 10–12. La de g=15,4, en cambio, ya
   estaba bien servida y no puede crecer por el cambio de tope. */
ok(R.ps1RadioMascaraAs(11.29) > 25,
  'la estrella de g=11,3 de M81 pasa de los 25″ que la recortaban (' +
  R.ps1RadioMascaraAs(11.29).toFixed(1) + '″)');
casi(R.ps1RadioMascaraAs(15.4), 8.3, 0.1,
  'y la de g=15,4 del mismo parche no se entera del cambio de tope');

/* Relleno de la máscara. Hasta rellenoPlanoMaxAs manda la mediana de alrededor,
   que sobre un gradiente suave es el mejor dato local; por encima el disco se
   deja al nivel del cielo, porque ahí el anillo del que sale la mediana ya cae
   en la periferia y el disco salía como un hoyo (campo/perfil 0,025 medido en la
   estrella de g=9,2 de NGC 5055). */
var GRAD = new Float32Array(ANCHO * ANCHO);              // rampa: 10 DN de cielo + gradiente
for (var yG = 0; yG < ANCHO; yG++) for (var xG = 0; xG < ANCHO; xG++)
  GRAD[yG * ANCHO + xG] = 10 + 400 * Math.exp(-Math.hypot(xG - 20, yG - 20) / 25);
var ESC_AS = 2;                                          // ″/px
function rellenoEn(rAs) {
  var e = { x: 60, y: 60, rPx: rAs / ESC_AS, rAs: rAs };
  var o = R.ps1QuitarEstrellas(GRAD, ANCHO, ANCHO, [e]);
  return o[60 * ANCHO + 60];
}
var cieloGrad = R.ps1Cielo(GRAD, ANCHO, ANCHO);
ok(rellenoEn(R.ps1.rellenoPlanoMaxAs - 2) > cieloGrad + 1,
  'una máscara estrecha se rellena con lo de alrededor, no con el cielo');
casi(rellenoEn(R.ps1.rellenoPlanoMaxAs + 2), cieloGrad, 1e-6,
  'y una ancha se deja al cielo, para que la apague el anclaje y la rellene el perfil');
ok(R.ps1.rellenoPlanoMaxAs < R.ps1.mascaraMaxAs,
  'el tope de máscara llega más lejos que el relleno plano: si no, el hueco no se usaría nunca');
// Sin `rAs` (una llamada que no lo traiga) se conserva el trato de siempre.
var sinRAs = R.ps1QuitarEstrellas(GRAD, ANCHO, ANCHO, [{ x: 60, y: 60, rPx: 60 / ESC_AS }]);
ok(sinRAs[60 * ANCHO + 60] > cieloGrad + 1, 'sin rAs se rellena como antes, sea cual sea el radio');
// Y ps1EstrellasEnPixeles lo trae, que es de donde sale en producción.
var enPxRAs = R.ps1EstrellasEnPixeles(
  { ancho: ANCHO, alto: ANCHO, escalaAs: LADO * 60 / ANCHO },
  { ra: 10, dec: 41, ladoArcmin: LADO }, [[10, 41, 9]]);
ok(enPxRAs.length === 1 && Math.abs(enPxRAs[0].rAs - R.ps1RadioMascaraAs(9)) < 1e-9,
  'ps1EstrellasEnPixeles trae el radio en ″ además de en px');

/* El caso que se vio en el simulador el 12-ago-2026: una estrella real deja un
   ala ancha, y si la máscara se queda dentro de ella el relleno sale del propio
   ala y aparece «un halo con un hueco». Sobre un fondo plano con una PSF de ala
   r^-3, tras quitarla no puede quedar NADA por encima del fondo (halo) ni muy por
   debajo (hueco) en todo el entorno de la estrella. */
var FONDO = 100, N = 201, PXAS = 0.7, xEst = 60, yEst = 60;  // ″/px, como un parche de 6′ a 512 px
/* Ala en r^-3 normalizada al propio criterio de la máscara: una estrella de
   `mascaraMagRef` asoma un 10 % del fondo a un radio de seeing, y las demás suben
   con su flujo. Si la ley de ps1RadioMascaraAs es la correcta, el borde de la
   máscara cae SIEMPRE en ese mismo 10 %, sea cual sea la magnitud. */
var sEst = R.ps1.seeingAs, gEst = 14;
var picoEst = 0.1 * FONDO * Math.pow(10, 0.4 * (R.ps1.mascaraMagRef - gEst));
var conEstrella = new Float32Array(N * N);
for (var yP = 0; yP < N; yP++) {
  for (var xP = 0; xP < N; xP++) {
    var rAs = Math.max(sEst, Math.sqrt((xP - xEst) * (xP - xEst) + (yP - yEst) * (yP - yEst)) * PXAS);
    conEstrella[yP * N + xP] = FONDO + picoEst / Math.pow(rAs / sEst, 3);
  }
}
var sinEstrella = R.ps1QuitarEstrellas(conEstrella, N, N,
  [{ x: xEst, y: yEst, rPx: R.ps1RadioMascaraAs(gEst) / PXAS }]);
var maxRes = -Infinity, minRes = Infinity;
for (var iR = 0; iR < sinEstrella.length; iR++) {
  if (sinEstrella[iR] > maxRes) maxRes = sinEstrella[iR];
  if (sinEstrella[iR] < minRes) minRes = sinEstrella[iR];
}
ok(maxRes < FONDO * 1.15, 'quitada la estrella no queda halo (máximo ' + maxRes.toFixed(1) +
  ' sobre un fondo de ' + FONDO + ')');
ok(minRes > FONDO * 0.9, 'ni hueco (mínimo ' + minRes.toFixed(1) + ')');
/* El núcleo ya no se protege por píxel central (nucleoPx murió): la protección
   es por fuente nuclear con la geometría de la galaxia, y la ejercita
   scripts/test_quitar_estrellas.js. Sin `geo`, la máscara trata el centro como
   cualquier otro píxel. */
var dN = parcheSintetico(0);
var outN = R.ps1QuitarEstrellas(dN, ANCHO, ANCHO,
  [{ x: (ANCHO - 1) / 2, y: (ANCHO - 1) / 2, rPx: 12 }]);
var cN = Math.round((ANCHO - 1) / 2), iN = cN * ANCHO + cN;
ok(outN[iN] !== dN[iN], 'sin geometría de galaxia no hay zona ciega en el centro');

/* El parche cae donde dice el catálogo, a la escala que dice CDELT: una galaxia
   desplazada 5′ al este y 2′ al norte del centro del campo aterriza en el píxel
   que la proyección de dibujar() le asigna. */
var CAMPO = 30, SIZE = 720, dec0 = 41;           // ′, px, °
var cos0 = Math.cos(dec0 * Math.PI / 180);
var galRA = 10 + (5 / 60) / cos0, galDec = dec0 + 2 / 60;
var marca = new Float32Array(ANCHO * ANCHO);
marca[Math.round((ANCHO - 1) / 2) * ANCHO + Math.round((ANCHO - 1) / 2)] = 1;
var lienzo = new Float32Array(SIZE * SIZE);
R.ps1PintarParche(lienzo, { datos: marca, ancho: ANCHO, alto: ANCHO, ladoArcmin: LADO,
                            ra: galRA, dec: galDec },
                  { ra0: 10, dec0: dec0, arcmin: CAMPO, size: SIZE });
var mejor = -1, vMejor = 0;
for (i18 = 0; i18 < lienzo.length; i18++) if (lienzo[i18] > vMejor) { vMejor = lienzo[i18]; mejor = i18; }
var escv = SIZE / (CAMPO / 60);
casi(mejor % SIZE, SIZE / 2 - (5 / 60) * escv, 1.5, 'el parche cae en su x (5′ al este)');
casi(Math.floor(mejor / SIZE), SIZE / 2 - (2 / 60) * escv, 1.5, 'el parche cae en su y (2′ al norte)');

/* Y CON EL NORTE ARRIBA. Un parche centrado no basta para verlo: hay que pintar
   una marca fuera del centro. En el FITS de PS1 la FILA crece hacia el NORTE
   (medido sobre M51: NGC 5195, que está al norte, aparece en py = centro + dy) y
   la COLUMNA crece hacia el OESTE (PC001001 = −1); en el lienzo el norte está
   arriba (y decreciente) y el oeste a la derecha (x creciente). Sin invertir la
   fila, la galaxia sale espejada en vertical: el brazo de arriba aparece abajo. */
var kPx = (LADO / 60) * escv / ANCHO;            // px de lienzo por px de parche
var marcaN = new Float32Array(ANCHO * ANCHO);
var cM = Math.round((ANCHO - 1) / 2);
marcaN[(cM + 10) * ANCHO + (cM - 6)] = 1;        // 10 px al norte, 6 px al este
var lienzoN = new Float32Array(SIZE * SIZE);
R.ps1PintarParche(lienzoN, { datos: marcaN, ancho: ANCHO, alto: ANCHO, ladoArcmin: LADO,
                             ra: 10, dec: dec0 },
                  { ra0: 10, dec0: dec0, arcmin: CAMPO, size: SIZE });
var mejorN = -1, vN = 0;
for (i18 = 0; i18 < lienzoN.length; i18++) if (lienzoN[i18] > vN) { vN = lienzoN[i18]; mejorN = i18; }
casi(Math.floor(mejorN / SIZE), SIZE / 2 - 10 * kPx, 1.5,
  'lo que está al norte en el parche sale ARRIBA en el lienzo (no espejado)');
casi(mejorN % SIZE, SIZE / 2 - 6 * kPx, 1.5,
  'lo que está al este en el parche sale a la izquierda en el lienzo');

/* La misma orientación, en el otro sentido: las estrellas de Gaia que se van a
   enmascarar. Una estrella al norte del centro de la galaxia tiene que caer en
   una FILA MAYOR del parche; si no, la máscara borra el sitio simétrico y deja
   la estrella intacta. */
var galEst = { ra: 202.47208, dec: 47.19667, ladoArcmin: 18, magV: 8.2, n: 1, reArcsec: 180 };
var estN = [[galEst.ra, galEst.dec + 3 / 60, 10]];                 // 3′ al norte
var enPxN = R.ps1EstrellasEnPixeles({ ancho: 512, alto: 512 }, galEst, estN);
ok(enPxN.length === 1 && enPxN[0].y > (512 - 1) / 2,
  'una estrella al norte se enmascara en una fila mayor del parche');
var estE = [[galEst.ra + (3 / 60) / Math.cos(galEst.dec * Math.PI / 180), galEst.dec, 10]];
var enPxE = R.ps1EstrellasEnPixeles({ ancho: 512, alto: 512 }, galEst, estE);
ok(enPxE.length === 1 && enPxE[0].x < (512 - 1) / 2,
  'una estrella al este se enmascara en una columna menor del parche');
ok(R.ps1EstrellasEnPixeles({ ancho: 512, alto: 512 }, galEst, [[galEst.ra, galEst.dec, 18]]).length === 1,
  'una estrella por debajo de la magnitud límite del equipo TAMBIÉN se enmascara');

/* Y con la rejilla GIRADA. El recorte llega en la rejilla de la skycell, cuyo
   punto de tangencia puede quedar a grados del objeto: allí el norte del cielo
   no apunta hacia arriba dentro del parche. En M81 son 3,6°, o sea 16 px en el
   borde, y con el supuesto de norte arriba las máscaras caían 12 px fuera de su
   estrella —la estrella quedaba sin tapar y la máscara abría un hoyo al lado.
   Se monta una WCS con CRVAL lejos en α, que es lo que produce el giro. */
var escGrad = (18 / 60) / 512;                      // 18′ en 512 px, en grados/px
var fGirado = { ancho: 512, alto: 512, escalaAs: escGrad * 3600,
                wcs: { ra0: galEst.ra + 4, dec0: galEst.dec, x0: 255.5, y0: 255.5,
                       gx: -escGrad, gy: escGrad } };
// El punto de referencia se mueve al sitio donde de verdad cae el objeto.
var cGir = R.ps1CieloAPixel(fGirado.wcs, galEst.ra, galEst.dec);
fGirado.wcs.x0 = 255.5 - (cGir[0] - 255.5); fGirado.wcs.y0 = 255.5 - (cGir[1] - 255.5);
var aGir = R.ps1AfinParche(fGirado, galEst);
var giroGrados = Math.atan2(aGir.xn, aGir.yn) * 180 / Math.PI;
ok(Math.abs(giroGrados + 4 * Math.sin(galEst.dec * Math.PI / 180)) < 0.15,
  'la afín del parche recoge el giro de la rejilla (' + giroGrados.toFixed(2) + '°)');
var pGir = R.ps1EstrellasEnPixeles(fGirado, galEst, estN)[0];
var pRecto = R.ps1EstrellasEnPixeles({ ancho: 512, alto: 512 }, galEst, estN)[0];
// La estrella está a 85 px del centro, así que 2,94° la mueven ~4,4 px: mucho
// más que el radio de máscara de una débil, que es de un píxel escaso.
ok(Math.hypot(pGir.x - pRecto.x, pGir.y - pRecto.y) > 3,
  'y la estrella se enmascara donde la pone la WCS, no donde la ponía el norte arriba');
// Contra la verdad: la TAN llevada a mano hasta esa estrella.
var espN = R.ps1CieloAPixel(fGirado.wcs, estN[0][0], estN[0][1]);
ok(Math.hypot(pGir.x - espN[0], pGir.y - espN[1]) < 0.01,
  'y coincide con la gnomónica de su propia cabecera');
// Y la vuelta de la afín deshace la ida: un píxel del parche da su (norte, este).
var dxA = 40, dyA = -25;
var norteA = aGir.nx * dxA + aGir.ny * dyA, esteA = aGir.ex * dxA + aGir.ey * dyA;
ok(Math.abs(aGir.xe * esteA + aGir.xn * norteA - dxA) < 1e-6 &&
   Math.abs(aGir.ye * esteA + aGir.yn * norteA - dyA) < 1e-6,
  'la afín y su inversa se deshacen, que es lo que une el perfil con la imagen');
// Y el parche ocupa en el render el lado que le toca, ni más ni menos.
var minX = SIZE, maxX = -1;
var lienzoLleno = new Float32Array(SIZE * SIZE);
R.ps1PintarParche(lienzoLleno, { datos: parcheSintetico(0), ancho: ANCHO, alto: ANCHO,
                                 ladoArcmin: LADO, ra: 10, dec: dec0 },
                  { ra0: 10, dec0: dec0, arcmin: CAMPO, size: SIZE });
for (var yy = 0; yy < SIZE; yy++) {
  for (var xx = 0; xx < SIZE; xx++) {
    if (lienzoLleno[yy * SIZE + xx] > 0) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; }
  }
}
casi(maxX - minX + 1, (LADO / 60) * escv, 2, 'el parche mide en el render sus ' + LADO + '′');

// Selección del campo: PS1 no cubre por debajo de −30°, y esas filas no se piden.
var catalogo = [
  ['NGC 1', '', 10, 41.02, 30, 1, 0, 12, 1, 0.3, 0],       // dentro
  ['NGC 2', '', 10, 41 + 5, 30, 1, 0, 12, 1, 0.3, 0],      // fuera del campo
  ['NGC 3', '', 10, -45, 30, 1, 0, 12, 1, 0.3, 0]          // fuera de cobertura
];
var enCampo = R.ps1GalaxiasDelCampo(catalogo, 10, dec0, CAMPO).map(function (g) { return g.nombre; });
ok(enCampo.length === 1 && enCampo[0] === 'NGC 1',
  'solo entran las galaxias del campo que PS1 cubre (' + enCampo.join(',') + ')');

/* Y las que no caben en el parche tampoco entran: con r_e = 36′ (M31) el parche
   de 20′ abarca el 8 % de la luz, y el stack de PanSTARRS ya no trae ese disco,
   así que el anclaje lo apretaría todo en el bulbo. La galaxia normal sí pasa. */
var enormes = R.ps1GalaxiasDelCampo(
  [['M31 (r_e 36′)', '', 10, 41.02, 2158.72, 0.324, 35, 3.61, 1, 0.3, 1],
   ['normal (r_e 3′)', '', 10, 41.02, 186.19, 0.135, 136, 9.67, 1, 0.3, 1]],
  10, dec0, CAMPO).map(function (g) { return g.nombre; });
ok(enormes.length === 1 && enormes[0] === 'normal (r_e 3′)',
  'la galaxia mucho mayor que el parche se queda sin capa (' + enormes.join(',') + ')');
casi(R.ps1LadoArcmin(8105), R.ps1.ladoMax, 1e-9, 'M31 se queda en el tope de 20′');
casi(R.ps1LadoArcmin(1), R.ps1.ladoMin, 1e-9, 'una galaxia diminuta no baja del suelo de 1,5′');

/* ══════════════ HALO EXTRAPOLADO Y UMBRAL DE CONTRASTE ══════════════
   El perfil que se extrapola más allá de la imagen tiene que ser EL MISMO que
   el del catálogo (gen_galaxias.py): si el I_e no está bien normalizado, el
   halo sale más brillante o más flojo que la galaxia a la que se pega. */
// magV 11: con b25 = 3,2′ y μ = 22,68 pasa las dos condiciones con un cielo de
// 21 (Δμ = 1,68). Con magV 10 el mismo perfil se queda en Δμ = 1,09 y no entra.
var galH = { magV: 11, reArcsec: 60, n: 1, ba: 0.6, pa: 30, bt: 0,
             nMedido: 1.2, ladoArcmin: 6 };
var compsH = R.ps1ComponentesSersic(galH);
ok(compsH.length === 1, 'una galaxia sin bulbo trae una sola componente');
var rMaxH = R.ps1RadioHaloAs(compsH);
casi(-2.5 * Math.log10(R.ps1FlujoModelo(compsH, galH.pa, rMaxH * Math.cos(galH.pa * Math.PI / 180),
                                        rMaxH * Math.sin(galH.pa * Math.PI / 180))),
     R.ps1.muHalo, 1e-6, 'el halo se extrapola justo hasta ' + R.ps1.muHalo + ' mag/arcsec²');
ok(rMaxH > 2 * galH.reArcsec, 'y eso queda bastante más allá del parche (' +
  (rMaxH / galH.reArcsec).toFixed(1) + '·r_e)');

// Integrando el modelo se recupera la magnitud del catálogo (menos la luz que
// queda más allá del corte de muHalo). Comprueba a la vez I_e, la elipse y el PA.
var pasoH = 2, sumaH = 0;                     // ″ por celda
for (var nH = -rMaxH; nH <= rMaxH; nH += pasoH) {
  for (var eH = -rMaxH; eH <= rMaxH; eH += pasoH) {
    sumaH += R.ps1FlujoModelo(compsH, galH.pa, nH, eH) * pasoH * pasoH;
  }
}
var esperadoH = Math.pow(10, -0.4 * galH.magV) * R.ps1FraccionLuz(galH.n, rMaxH / galH.reArcsec);
casi(sumaH / esperadoH, 1, 0.02, 'el halo integrado da la magnitud del catálogo');

// Reparto bulbo/disco: con B/T = 1 toda la luz va al bulbo (n=4, r_e más chico).
var compsB = R.ps1ComponentesSersic({ magV: 10, reArcsec: 60, n: 1, ba: 1, pa: 0, bt: 1 });
ok(compsB.length === 1 && compsB[0].n === 4 && compsB[0].re < 60,
  'con B/T = 1 solo queda el bulbo, más compacto que el disco');

/* Umbral de Blackwell/Clark: por debajo del cielo no se ve nada, deltaPlena
   mag por encima se ve entero, y en medio la potencia de PS1.deltaExp. */
casi(R.ps1Opacidad(21, 21), 0, 1e-12, 'un halo tan brillante como el cielo no se ve');
casi(R.ps1Opacidad(22, 21), 0, 1e-12, 'y uno más débil, tampoco');
casi(R.ps1Opacidad(21 - R.ps1.deltaPlena, 21), 1, 1e-12, 'a Δ = ' + R.ps1.deltaPlena + ' se ve entero');
casi(R.ps1Opacidad(21 - 5, 21), 1, 1e-12, 'y no pasa de 1 por mucho que suba');
casi(R.ps1Opacidad(21 - 1.5, 21), Math.pow(1.5 / R.ps1.deltaPlena, R.ps1.deltaExp), 1e-12,
  'en la transición sigue la potencia pedida');
var opAnt = -1, monotona = true;
for (var dOp = 0; dOp <= 4; dOp += 0.05) {
  var opH = R.ps1Opacidad(21 - dOp, 21);
  if (opH < opAnt - 1e-12) monotona = false;
  opAnt = opH;
}
ok(monotona, 'la opacidad no retrocede en ningún punto (sin borde duro)');

/* La mezcla con el fondo se hace sobre el flujo, pero tiene que salir la mezcla
   de COLOR pedida: nivel = (1−op)·cielo + op·galaxia. */
var cH = R.ctxFotometrico({ sqm: 21, pupilaSalida: 3, pupilaOjo: 7, transmision: 0.9 });
var Fgal = cH.Fcielo * 4;
var nivelPleno = 255 * 2.5 * Math.log10(1 + Fgal / cH.Fcielo) / cH.rango;
casi(255 * 2.5 * Math.log10(1 + R.ps1FlujoConOpacidad(Fgal, 0.4, cH) / cH.Fcielo) / cH.rango,
     0.4 * nivelPleno, 1e-9, 'la opacidad 0,4 deja el nivel a 0,4 del camino al color de la galaxia');
casi(R.ps1FlujoConOpacidad(Fgal, 0, cH), 0, 1e-30, 'opacidad 0 = el píxel se queda en el cielo');
casi(R.ps1FlujoConOpacidad(Fgal, 1, cH), Fgal, 1e-30, 'opacidad 1 = el píxel de la galaxia entero');

/* ── Activación: no toda galaxia enseña halo ──────────────────────────────────
   μ_medio = m + 2,5·log10(π·a·b/4) + 8,89, con a y b DIÁMETROS en ′. */
casi(R.ps1BrilloMedio(10, 2, 1), 10 + 2.5 * Math.log10(Math.PI / 2) + 8.89, 1e-12,
  'el brillo superficial medio sigue la fórmula pedida');

// Los ejes salen de la isofota 25 del mismo modelo del catálogo.
var medH = R.ps1MedidasHalo(galH, compsH);
casi(-2.5 * Math.log10(R.ps1FlujoModelo(compsH, galH.pa,
       (medH.aArcmin / 2) * 60 * Math.cos(galH.pa * Math.PI / 180),
       (medH.aArcmin / 2) * 60 * Math.sin(galH.pa * Math.PI / 180))),
     25, 1e-6, 'el eje mayor es el diámetro de la isofota de 25 mag/arcsec²');
casi(medH.bArcmin / medH.aArcmin, galH.ba, 1e-12, 'y el menor va con el b/a del catálogo');

// Condición A: por debajo de haloMenorMin no hay halo, sea cual sea el brillo.
var difusa = { bArcmin: R.ps1.haloMenorMin + 0.01, muProm: R.ps1.haloMuFijo + 0.5 };
ok(R.ps1HaloActivo({ bArcmin: R.ps1.haloMenorMin, muProm: difusa.muProm }) === false,
  'una galaxia con el eje menor en el límite no entra (condición A)');
ok(R.ps1HaloActivo(difusa) === true, 'y justo por encima, sí');
// Condición B: brillo superficial medio, un absoluto de la galaxia.
ok(R.ps1HaloActivo({ bArcmin: 20, muProm: R.ps1.haloMuFijo - 0.01 }) === false,
  'una galaxia compacta se queda fuera por grande que sea (condición B)');
ok(R.ps1HaloActivo({ bArcmin: 20, muProm: R.ps1.haloMuFijo + 0.01 }) === true,
  'y una difusa entra');
// Sin medidas, nada de halos inventados.
ok(R.ps1HaloActivo(null) === false, 'sin medidas no hay halo');
ok(R.ps1HaloActivo({ bArcmin: 20, muProm: Infinity }) === false,
  'ni con un brillo medio sin definir');

/* La puerta no mira ni el ocular ni el cielo: en su firma solo cabe la galaxia.
   Mientras, SBe —el que sí manda en la rampa— se oscurece con el aumento. */
ok(R.ps1HaloActivo.length === 1, 'la puerta se decide solo con la galaxia');
var cielo5 = R.ctxFotometrico({ sqm: 21, pupilaSalida: 5, pupilaOjo: 7, transmision: 0.9 });
var cielo1 = R.ctxFotometrico({ sqm: 21, pupilaSalida: 1, pupilaOjo: 7, transmision: 0.9 });
ok(cielo1.SBe > cielo5.SBe + 1, 'y eso que SBe sí se oscurece con el aumento (' +
  cielo5.SBe.toFixed(2) + ' → ' + cielo1.SBe.toFixed(2) + ')');

/* Filas reales de galaxias-datos.js: M82 (μ=22,11) y NGC 4565 (22,23) fuera;
   M51 (22,39) y M101 (23,21) dentro; M49 (21,34), fuera. La columna 12 (n de
   S4G) viaja en las medidas pero no decide: M82 mide 2,44 y M51 3,87. */
function medidas(g) { return R.ps1MedidasHalo(g, R.ps1ComponentesSersic(g)); }
var m82 = medidas({ reArcsec: 137.47, ba: 0.38, magV: 8.75, n: 1, bt: 0.03, nMedido: 2.44 });
var m51 = medidas({ reArcsec: 180.35, ba: 0.617, magV: 8.21, n: 1, bt: 0.15, nMedido: 3.87 });
var m101 = medidas({ reArcsec: 379.23, ba: 0.933, magV: 7.76, n: 1, bt: 0.08, nMedido: 1.31 });
var m49 = medidas({ reArcsec: 115.38, ba: 0.813, magV: 8.47, n: 4, bt: 1, nMedido: 4.49 });
var m4565 = medidas({ reArcsec: 186.19, ba: 0.135, magV: 9.67, n: 1, bt: 0.3, nMedido: 1.28 });
ok(R.ps1HaloActivo(m82) === false, 'M82 se queda fuera (μ = ' + m82.muProm.toFixed(2) + ')');
ok(R.ps1HaloActivo(m4565) === false, 'NGC 4565 tampoco, por poco (μ = ' +
  m4565.muProm.toFixed(2) + ')');
ok(R.ps1HaloActivo(m51) === true, 'M51 lleva halo (μ = ' + m51.muProm.toFixed(2) +
  ') aunque su n de S4G sea 3,87');
ok(R.ps1HaloActivo(m101) === true, 'M101 lleva halo (μ = ' + m101.muProm.toFixed(2) + ')');
ok(R.ps1HaloActivo(m49) === false, 'M49, elíptica, no (μ = ' + m49.muProm.toFixed(2) + ')');
ok(m82.n === 2.44, 'el n medido sigue viajando en las medidas, sin decidir');

/* ── n medido en la imagen por concentración ──────────────────────────────────
   Ya no abre la puerta (manda el brillo medio), pero se queda medido y probado:
   la razón r90/r50 crece con n, y por eso se puede invertir. */
var aEnRe = 3;
ok(R.ps1ConcentracionTeorica(1, aEnRe) < R.ps1ConcentracionTeorica(4, aEnRe),
  'un perfil concentrado tiene el r90/r50 mayor que uno exponencial (' +
  R.ps1ConcentracionTeorica(1, aEnRe).toFixed(2) + ' contra ' +
  R.ps1ConcentracionTeorica(4, aEnRe).toFixed(2) + ')');
casi(R.ps1NDeConcentracion(R.ps1ConcentracionTeorica(2.2, aEnRe), aEnRe), 2.2, 1e-3,
  'y la inversión devuelve el n del que salió');

/* Vuelta entera sobre un parche SINTÉTICO: se pinta el perfil de un n conocido
   y se recupera midiendo su curva de crecimiento. */
function nDeParcheSintetico(n) {
  var g = { magV: 10, reArcsec: 30, n: n, ba: 0.7, pa: 25, bt: 0, ladoArcmin: 6 };
  var comps = R.ps1ComponentesSersic(g), lado = 256, escalaAs = g.ladoArcmin * 60 / lado;
  var datos = new Float32Array(lado * lado);
  for (var py = 0; py < lado; py++) {
    var norte = (py - (lado - 1) / 2) * escalaAs;
    for (var px = 0; px < lado; px++) {
      datos[py * lado + px] = R.ps1FlujoModelo(comps, g.pa, norte,
        ((lado - 1) / 2 - px) * escalaAs);
    }
  }
  var ejes = R.ps1EjesArcmin(comps, g.ba);
  return R.ps1ConcentracionN({ datos: datos, ancho: lado, alto: lado, escalaAs: escalaAs },
    { pa: g.pa, ba: g.ba, aArcmin: ejes.a, reArcsec: g.reArcsec, ladoArcmin: g.ladoArcmin });
}
var nMedido1 = nDeParcheSintetico(1), nMedido4 = nDeParcheSintetico(4);
ok(Math.abs(nMedido1 - 1) < 0.15, 'un disco exponencial se mide como n≈1 (' +
  nMedido1.toFixed(2) + ')');
ok(Math.abs(nMedido4 - 4) < 0.6, 'y un bulbo de de Vaucouleurs como n≈4 (' +
  nMedido4.toFixed(2) + ')');
ok(nMedido1 < R.ps1.haloSersicMax && nMedido4 > R.ps1.haloSersicMax,
  'la medida cae a los dos lados del tope de Sérsic, por si vuelve a hacer falta');
ok(R.ps1ConcentracionN({ datos: new Float32Array(16), ancho: 4, alto: 4, escalaAs: 1 },
  { pa: 0, ba: 1, aArcmin: 2, reArcsec: 30, ladoArcmin: 6 }) === 0,
  'un parche sin luz no inventa ninguna n');

/* Y el efecto en el lienzo: con la galaxia ACTIVA el modelo pinta más allá del
   parche; con la misma galaxia fuera de la regla, el parche vacío no pinta nada
   —ni halo ni degradado—. El parche va vacío para medir solo lo extrapolado. */
var SH = 240, CAMPO_H = 20;
/* `equipo` va entero (apertura y aumentos), no solo la pupila: el umbral de
   contraste depende de las DOS —de la pupila por la luminancia que llega al ojo,
   del aumento por el tamaño aparente— y pasar solo una deja fuera media ley. */
function haloPintado(equipo, medidas) {
  var lienzoH = new Float32Array(SH * SH), n2 = 0;
  R.ps1PintarParche(lienzoH, {
    datos: new Float32Array(4), ancho: 2, alto: 2, ladoArcmin: 6,
    ra: 10, dec: 41, comps: compsH, pa: galH.pa, halo: medidas
  }, { ra0: 10, dec0: 41, arcmin: CAMPO_H, size: SH,
       cielo: { sqm: 21, pupilaOjo: 7, transmision: 0.9,
                pupilaSalida: equipo.D / equipo.MAG, aumentos: equipo.MAG } });
  for (var iH = 0; iH < lienzoH.length; iH++) if (lienzoH[iH] > 0) n2++;
  return n2;
}
var OCHO = { D: 203, MAG: 100 }, DIECIOCHO = { D: 457, MAG: 100 };
ok(R.ps1HaloActivo(medH) === true, 'la galaxia de prueba cumple las dos condiciones');
ok(haloPintado(OCHO, medH) > 0, 'y su halo se pinta (' + haloPintado(OCHO, medH) + ' px)');
ok(haloPintado(OCHO, { bArcmin: 5, muProm: 21 }) === 0,
  'la que no las cumple no pinta nada donde no hay imagen');

/* ── La apertura, a igual aumento ────────────────────────────────────────────
   El criterio de esta ley: más apertura NUNCA puede pintar menos galaxia. El
   brillo superficial no sube con D —eso es física y ps1AnclarACatalogo lo
   respeta—, pero la pupila de salida sí, y con ella baja el umbral del ojo.
   Con la ley anterior (Δ contra SBe, el cielo atenuado, contra un objeto sin
   atenuar) el signo salía AL REVÉS: a 150x el 18″ perdía 1,76 mag de contraste
   contra el 8″ y pintaba menos galaxia. Este ok() es el que lo habría cazado. */
var px8 = haloPintado(OCHO, medH), px18 = haloPintado(DIECIOCHO, medH);
ok(px18 > px8, 'a igual aumento, más apertura pinta MÁS galaxia (18″ ' + px18 +
  ' px contra 8″ ' + px8 + ')');

/* ── La apertura, a igual PUPILA DE SALIDA ───────────────────────────────────
   Aquí el brillo superficial que llega al ojo es idéntico por física: los dos
   equipos entregan la misma luminancia. Lo único que puede separarlos es el
   tamaño aparente, y el 18″ llega a 183x donde el 8″ se queda en 81x. Así que
   la igualdad tiene que ser de LUMINANCIA (el fondo de cielo, bit a bit) y la
   ventaja, de UMBRAL. */
var pupC = { D: 203, MAG: 203 / 2.5 }, pupD = { D: 457, MAG: 457 / 2.5 };
function ctxEquipo(e) {
  return R.ctxFotometrico({ sqm: 21, pupilaOjo: 7, transmision: 0.9,
                            pupilaSalida: e.D / e.MAG, aumentos: e.MAG });
}
casi(ctxEquipo(pupD).nivelFondo, ctxEquipo(pupC).nivelFondo, 1e-12,
  'a igual pupila el fondo de cielo es el MISMO (la apertura no lo mueve)');
ok(R.sbUmbralContraste(ctxEquipo(pupD)) > R.sbUmbralContraste(ctxEquipo(pupC)),
  'y aun así el 18″ llega más hondo, por tamaño aparente (' +
  R.sbUmbralContraste(ctxEquipo(pupD)).toFixed(2) + ' contra ' +
  R.sbUmbralContraste(ctxEquipo(pupC)).toFixed(2) + ' mag/arcsec²)');

/* ── Cmin llega de verdad a las galaxias ─────────────────────────────────────
   La rampa de opacidad mide contra sbUmbralContraste, que es Fcielo·Cmin: si
   alguien vuelve a atarla al cielo pelado o a SBe, esto se entera. Se comprueba
   moviendo SOLO el término de tamaño aparente de Cmin (los aumentos) con la
   pupila clavada: si el umbral no se mueve, Cmin no está llegando. */
function umbralCon(pupila, aumentos) {
  return R.sbUmbralContraste(R.ctxFotometrico({ sqm: 21, pupilaOjo: 7,
    transmision: 0.9, pupilaSalida: pupila, aumentos: aumentos }));
}
ok(umbralCon(2.5, 200) > umbralCon(2.5, 50),
  'con la pupila clavada, el umbral sigue los aumentos: Cmin llega a la rampa');

/* ── Ley ÚNICA: la puerta del halo no decide la óptica ───────────────────────
   `ps1HaloActivo` decide si se extrapola el perfil donde la imagen no llega.
   Eso es una propiedad del OBJETO. La ley de visibilidad la marca el ojo, y
   tiene que ser la misma para las dos poblaciones. Antes iban atadas (un
   `if (!halo) c = null`) y el render acababa con dos leyes ópticas de signo
   contrario conviviendo. Se comprueba con una galaxia que NO abre la puerta y
   sí trae imagen: debe pasar por la rampa y quedar marcada igual. */
var sinPuerta = { bArcmin: 5, muProm: 21 };   // eje grande pero brillante: no es difusa
ok(R.ps1HaloActivo(sinPuerta) === false, 'la galaxia de control no abre la puerta del halo');
var cieloU = { sqm: 21, pupilaSalida: 2.5, pupilaOjo: 7, transmision: 0.9,
               aumentos: 100, perceptual: true };
var lienzoU = new Float32Array(SH * SH);
var imagenU = new Float32Array(4);
for (var iU = 0; iU < 4; iU++) imagenU[iU] = Math.pow(10, -0.4 * 20);   // μ=20, bien sobre el umbral
R.ps1PintarParche(lienzoU, {
  datos: imagenU, ancho: 2, alto: 2, ladoArcmin: 6,
  ra: 10, dec: 41, comps: compsH, pa: galH.pa, halo: sinPuerta
}, { ra0: 10, dec0: 41, arcmin: CAMPO_H, size: SH, cielo: cieloU });
var nU = 0, marcadosU = 0;
for (iU = 0; iU < lienzoU.length; iU++) {
  if (lienzoU[iU] > 0) nU++;
  if (R.difusoMarcado(cieloU.difusoMask, iU)) marcadosU++;
}
ok(nU > 0 && marcadosU === nU,
  'una galaxia SIN halo pasa por la misma rampa y queda marcada igual (' + nU + ' px)');
var cU = R.ctxFotometrico(cieloU);
// Cociente y no diferencia: el lienzo es Float32Array y estos flujos son ~1e-8,
// donde el épsilon absoluto de la precisión simple ya es ~1e-15.
casi(lienzoU[Math.round(SH / 2) * SH + Math.round(SH / 2)] /
  R.ps1FlujoConOpacidad(imagenU[0], R.ps1Opacidad(20, R.sbUmbralContraste(cU)), cU),
  1, 1e-6,
  'y su píxel sale exactamente de la MISMA ley que el de una galaxia con halo');

/* ── El presupuesto fotométrico no lo toca ninguna apertura ──────────────────
   ps1AnclarACatalogo es lo ÚNICO que fija cuánta luz tiene la galaxia, y va
   antes de toda óptica: ni la apertura ni el aumento entran en su firma. Este
   es el guardia contra la tentación de "arreglar" la apertura metiendo un D² en
   el flujo de la galaxia —que es justo lo que NO hay que hacer: el brillo
   superficial de una fuente extensa es invariante con D—. Se comprueba que el
   flujo integrado del parche anclado es el del catálogo, al bit. */
var LADO_P = 6, PX_P = 48, ESCALA_P = LADO_P * 60 / PX_P;
var crudoP = new Float32Array(PX_P * PX_P), iP;
for (iP = 0; iP < crudoP.length; iP++) {
  var yP = ((PX_P - 1) / 2 - Math.floor(iP / PX_P)) * ESCALA_P;
  var xP = ((PX_P - 1) / 2 - (iP % PX_P)) * ESCALA_P;
  crudoP[iP] = 1000 + R.ps1FlujoModelo(compsH, galH.pa, yP, xP) * 1e9;
}
var netoP = R.ps1AnclarACatalogo(crudoP, PX_P, PX_P, {
  magV: galH.magV, n: galH.n, reArcsec: galH.reArcsec,
  ladoArcmin: LADO_P, escalaAs: ESCALA_P
});
var sumaP = 0;
for (iP = 0; iP < netoP.length; iP++) sumaP += netoP[iP];
var esperadoP = Math.pow(10, -0.4 * galH.magV) *
  Math.max(R.ps1FraccionLuz(galH.n, (LADO_P * 60 / 2) / galH.reArcsec), 0.02);
casi(sumaP * ESCALA_P * ESCALA_P / esperadoP, 1, 1e-6,
  'el parche anclado integra EXACTAMENTE la luz del catálogo');
ok(R.ps1AnclarACatalogo.length === 4,
  'y su firma no admite apertura ninguna: (datos, ancho, alto, o)');

/* ── La dependencia con el AUMENTO, a apertura fija ─────────────────────────
   Dos términos tiran en sentidos opuestos: la pupila de salida encoge con los
   aumentos (peor luminancia retinal, MAG^(2·C_EXP)) y el objeto crece en la
   retina (mejor umbral, MAG^(−C_MAG_EXP)). El neto, Cmin ∝ MAG^(2·C_EXP −
   C_MAG_EXP), tiene que salir NEGATIVO o subir aumentos apaga el objeto en vez
   de sacarlo. Con C_MAG_EXP 0,5 salía +0,20 y el halo se apagaba.
   Y no puede mejorar para siempre: el clamp C_MAG_MIN corta el término de
   tamaño en MAG_sat y a partir de ahí solo queda la pupila, así que la curva
   tiene un máximo. Ese máximo es el aumento óptimo del modelo. */
ok(2 * FOT.C_EXP - FOT.C_MAG_EXP < 0,
  'el exponente neto del umbral con los aumentos es NEGATIVO (' +
  (2 * FOT.C_EXP - FOT.C_MAG_EXP).toFixed(2) + '): más aumentos sacan el objeto');
var MAG_SAT = FOT.C_MAG_REF * Math.pow(FOT.C_MAG_MIN, -1 / FOT.C_MAG_EXP);
ok(umbralCon(203 / 150, 150) > umbralCon(203 / 50, 50),
  'y se mide: a apertura fija, 150x llega más hondo que 50x');
ok(umbralCon(203 / (2 * MAG_SAT), 2 * MAG_SAT) < umbralCon(203 / MAG_SAT, MAG_SAT),
  'pero la mejora NO crece sin fin: pasado ' + Math.round(MAG_SAT) +
  'x (clamp C_MAG_MIN) vaciar la pupila vuelve a empeorar');

/* La exención del techo: ps1PintarParche marca en `cielo.difusoMask` los píxeles
   que salen del perfil, y pintarFot los trata aparte —la rampa de opacidad es su
   único desvanecido—. Sin la marca, el halo se apaga DOS veces: la rampa y
   visibilidadDifusa miden las dos contra el mismo umbral (Fcielo·Cmin), así que
   son la misma ley aplicada dos veces, y encima el techo del realce le quitaba
   el refuerzo. El radio de sondeo es 0,5·r_e y no 1,5·r_e como antes: contra el
   umbral de detección esta galaxia de prueba ya no llega tan lejos (ver la nota
   de deltaPlena en PS1). */
var R_SONDEO = 0.5;
function halo(equipo) {
  var cielo = { sqm: 21, pupilaSalida: equipo.D / equipo.MAG, pupilaOjo: 7,
                transmision: 0.9, aumentos: equipo.MAG,
                perceptual: true, realceMax: R.ps1.realceMax };
  var lienzo = new Float32Array(SH * SH);
  R.ps1PintarParche(lienzo, {
    datos: new Float32Array(4), ancho: 2, alto: 2, ladoArcmin: 6,
    ra: 10, dec: 41, comps: compsH, pa: galH.pa, halo: medH
  }, { ra0: 10, dec0: 41, arcmin: CAMPO_H, size: SH, cielo: cielo });
  var c = R.ctxFotometrico(cielo), pxPorAs = (SH / (CAMPO_H / 60)) / 3600;
  var i = Math.round(SH / 2) * SH + Math.round(SH / 2 + R_SONDEO * galH.reArcsec * pxPorAs);
  // El mismo píxel por los dos caminos de pintarFot: exento y con el trato viejo.
  var F = lienzo[i], sVieja = R.visibilidadDifusa(F, c.Fcielo * c.Cmin, true);
  return {
    marcado: R.difusoMarcado(cielo.difusoMask, i),
    dn: F > 0 ? R.valorDeFlujo(R.realzarPerceptual(F, c.Fcielo, c.rango, 0, 0),
      c.Fcielo, c.rango) : 0,
    dnVieja: (F > 0 && sVieja > 0) ? R.valorDeFlujo(R.realzarPerceptual(F * sVieja,
      c.Fcielo, c.rango, sVieja, R.ps1.realceMax), c.Fcielo, c.rango) : 0
  };
}
var hAlto = halo(DIECIOCHO);
ok(hAlto.marcado === true, 'a ' + R_SONDEO + ' r_e el píxel queda marcado como capa de galaxia');
ok(hAlto.dn > 1, 'y se ve: ' + hAlto.dn.toFixed(1) + ' DN sobre el cielo');
ok(hAlto.dnVieja < hAlto.dn, 'pasarlo OTRA VEZ por visibilidadDifusa lo apagaría a ' +
  hAlto.dnVieja.toFixed(1) + ' DN: es el mismo umbral contado dos veces');

/* Y la ley es ÚNICA para todo el parche de esa galaxia: partirla por un radio
   dejaba un escalón en la costura —anillo a nivel de cielo dentro, halo a 10 DN
   fuera: el círculo negro que se vio en M101 a 146x—. Un perfil que decrece
   hacia fuera se pinta con una sola ley o la costura se ve. */
var cieloD = { sqm: 21, pupilaSalida: DIECIOCHO.D / DIECIOCHO.MAG, pupilaOjo: 7,
               transmision: 0.9, aumentos: DIECIOCHO.MAG,
               perceptual: true, realceMax: R.ps1.realceMax };
var lienzoD = new Float32Array(SH * SH);
R.ps1PintarParche(lienzoD, {
  datos: new Float32Array(4), ancho: 2, alto: 2, ladoArcmin: 6,
  ra: 10, dec: 41, comps: compsH, pa: galH.pa, halo: medH
}, { ra0: 10, dec0: 41, arcmin: CAMPO_H, size: SH, cielo: cieloD });
var pxAsD = (SH / (CAMPO_H / 60)) / 3600;
var iD = Math.round(SH / 2) * SH + Math.round(SH / 2 + 0.5 * galH.reArcsec * pxAsD);
ok(lienzoD[iD] > 0 && R.difusoMarcado(cieloD.difusoMask, iD), 'a 0,5 r_e se pinta y se exime igual');
/* ── Mezcla de imagen y perfil ───────────────────────────────────────────────
   La regla vieja era `max(imagen, perfil)` y se descartó: medido sobre M51, el
   perfil ganaba en el 70-95 % de los píxeles desde 0,3 r_e y metía el 154,6 %
   de la luz del catálogo. Ahora la imagen manda donde midió, el perfil rellena
   lo demás, y el peso hace el tránsito. */
var LADO_W = 64, mitad = new Float32Array(LADO_W * LADO_W);
for (var yW = 0; yW < LADO_W; yW++) {
  for (var xW = 0; xW < LADO_W; xW++) if (xW < LADO_W / 2) mitad[yW * LADO_W + xW] = 1;
}
var wMitad = R.ps1PesoImagen(mitad, LADO_W, LADO_W, 2);        // caja de 25″ ≈ 12 px
var filaW = Math.round(LADO_W / 2) * LADO_W;
casi(wMitad[filaW + 4], 1, 1e-9, 'donde toda la vecindad trae señal el peso satura en 1');
casi(wMitad[filaW + LADO_W - 4], 0, 1e-9, 'y donde no hay nada medido, en 0');
var wBorde = wMitad[filaW + LADO_W / 2];
ok(wBorde > 0 && wBorde < 1, 'en el borde de la señal el peso pasa por valores intermedios (' +
  wBorde.toFixed(2) + '): el tránsito es continuo, no un escalón');
var subeYBaja = true;
for (var jW = 1; jW < LADO_W; jW++) if (wMitad[filaW + jW] > wMitad[filaW + jW - 1] + 1e-9) subeYBaja = false;
ok(subeYBaja, 'y monótono: el peso solo baja al alejarse de la zona medida');

/* El presupuesto de luz no lo amplía la mezcla: `s` devuelve al total lo que la
   envolvente añadió, así que la galaxia sigue emitiendo lo que dice el catálogo. */
var imgM = new Float32Array([4, 3, 0, 0]), wM = new Float32Array([1, 0.5, 0.25, 0]);
var perfM = new Float32Array([2, 2, 2, 2]);
var sM = R.ps1EscalaMezcla(imgM, wM, perfM), sumaM = 0, sumaImg = 0;
for (var iM = 0; iM < imgM.length; iM++) {
  sumaM += wM[iM] * sM * imgM[iM] + (1 - wM[iM]) * perfM[iM];
  sumaImg += imgM[iM];
}
casi(sumaM, sumaImg, 1e-6, 'la mezcla suma exactamente lo que la imagen anclada');
ok(sM > 0 && sM < 1, 'y el reanclaje baja la imagen para hacerle sitio (×' + sM.toFixed(3) + ')');
ok(R.ps1EscalaMezcla(imgM, wM, new Float32Array([99, 99, 99, 99])) === 0,
  'si la envolvente se pasa del presupuesto, el reanclaje se corta en 0 y no se resta luz');

/* Y al pintar: con la vecindad medida la imagen manda aunque el perfil valga
   más. Con `max()` ganaba el perfil y la morfología quedaba enterrada. */
var LADO_P = 8, imgP = new Float32Array(LADO_P * LADO_P), unoP = 1e-9;
for (var iP = 0; iP < imgP.length; iP++) imgP[iP] = unoP;
var pesoP = new Float32Array(imgP.length);
for (var iP2 = 0; iP2 < pesoP.length; iP2++) pesoP[iP2] = 1;
var lienzoM = new Float32Array(SH * SH);
R.ps1PintarParche(lienzoM, {
  datos: imgP, ancho: LADO_P, alto: LADO_P, ladoArcmin: 6,
  ra: 10, dec: 41, comps: compsH, pa: galH.pa, halo: medH,
  peso: pesoP, escalaMezcla: 1
}, { ra0: 10, dec0: 41, arcmin: CAMPO_H, size: SH,
     cielo: { sqm: 21, pupilaSalida: 1, pupilaOjo: 7, transmision: 0.9 } });
var iMz = Math.round(SH / 2) * SH + Math.round(SH / 2 + 0.2 * galH.reArcsec *
  ((SH / (CAMPO_H / 60)) / 3600));
var perfilAhi = R.ps1FlujoModelo(compsH, galH.pa, 0, -0.2 * galH.reArcsec);
ok(lienzoM[iMz] < perfilAhi, 'donde la imagen midió, manda la imagen aunque el perfil valga más');

/* ── Ni halo Sérsic ni componente extra ──────────────────────────────────────
   Hubo una segunda ley de más allá de r_e con su propio r_e, n y b/a. Se
   retiró: medido sobre el parche real de M51 (13-ago-2026) añadía el 52,6 % de
   la luz del catálogo contra un presupuesto defendible del 3,9 %, y la caída
   que decían las medidas de la imagen era un artefacto del suelo de ruido —el
   corte de 1,5σ está en μ = 25,03 por píxel, así que más allá de ~1,6 r_e la
   imagen no mide, no es que la galaxia se acabe—. La única ley que queda fuera
   de la imagen es el perfil del catálogo, sin recortar. */
ok(R.ps1ComponenteHalo === undefined && R.ps1FlujoHalo === undefined,
  'el halo con ley propia ya no existe');
ok(R.ps1MedidasHalo(galH, compsH).halo === undefined,
  'y las medidas de la galaxia no traen componente extra ninguna');
// Fuera de la imagen manda el perfil del catálogo tal cual, sin modular.
var lienzoF = new Float32Array(SH * SH);
R.ps1PintarParche(lienzoF, {
  datos: new Float32Array(4), ancho: 2, alto: 2, ladoArcmin: 6,
  ra: 10, dec: 41, comps: compsH, pa: galH.pa, halo: medH
}, { ra0: 10, dec0: 41, arcmin: CAMPO_H, size: SH,
     cielo: { sqm: 21, pupilaSalida: DIECIOCHO.D / DIECIOCHO.MAG, pupilaOjo: 7,
              transmision: 0.9, aumentos: DIECIOCHO.MAG } });
var pxAsF = (SH / (CAMPO_H / 60)) / 3600;
var iF = Math.round(SH / 2) * SH + Math.round(SH / 2 + R_SONDEO * galH.reArcsec * pxAsF);
ok(lienzoF[iF] > 0 && lienzoF[iF] <= R.ps1FlujoModelo(compsH, galH.pa, 0, -R_SONDEO * galH.reArcsec),
  'sin imagen que mezclar queda el perfil del catálogo, ni más ni menos');

/* ── Interruptor y avisos de la capa (ficha 12) ──────────────────────────────
   El interruptor tiene que APAGAR de verdad: apagado, ps1CapaGalaxias no puede
   ni pedir el parche (aquí no hay fetch que valga) ni tocar el lienzo. Y el
   aviso solo habla del objeto apuntado, con la causa: por el sur no hay nada
   que esperar, por caída sí. */
ok(R.galaxiasImagen === true, 'la capa de galaxias viene encendida por defecto');

// [nombre, alt, RA°, Dec°, r_e″, b/a, PA°, magV, n, B/T, polvo, n medido]
var galNorte = ['NGC 0000', '', 180, 40, 60, 0.7, 0, 10, 1, 0.2, 0, 0];
var galSur   = ['NGC 0001', '', 180, -40, 60, 0.7, 0, 10, 1, 0.2, 0, 0];
// Como M31: tan grande que el parche de 20′ no abarca ni la mitad de su luz.
var galEnorme = ['NGC 0224', '', 180, 40, 1200, 0.7, 0, 10, 1, 0.2, 0, 0];
var opCapa = { arcmin: 20, size: 2, estrellas: [] };
var lienzoCapa = null, peticionesParche = 0;
function capa(gal, ra0, dec0) {
  var o = { ra0: ra0, dec0: dec0, arcmin: opCapa.arcmin, size: opCapa.size,
            estrellas: opCapa.estrellas, catalogo: [gal] };
  lienzoCapa = new Float32Array(4);
  peticionesParche = 0;
  return R.ps1CapaGalaxias(lienzoCapa, null, { sqm: 21, pupilaSalida: 1, pupilaOjo: 7, transmision: 0.9 }, null, o);
}
function lienzoIntacto() {
  for (var i = 0; i < lienzoCapa.length; i++) if (lienzoCapa[i] !== 0) return false;
  return true;
}

R.galaxiasImagen = false;
capa(galNorte, 180, 40).then(function (r) {
  ok(r.aviso === '', 'apagada, la capa no pide parche ni avisa de nada');
  ok(lienzoIntacto(), 'y el lienzo se queda como estaba');
  R.galaxiasImagen = true;
  // Servicio caído: el parche no llega y se dice, porque hay algo que esperar.
  global.fetch = function () { peticionesParche++; return Promise.reject(new Error('sin servicio')); };
  return capa(galNorte, 180, 40);
}).then(function (r) {
  ok(/no responde/.test(r.aviso), 'con el servicio caído se avisa de la caída');
  // Bajo −30° PanSTARRS no llega: otra causa, otro aviso, y sin pedir nada.
  return capa(galSur, 180, -40);
}).then(function (r) {
  ok(/PanSTARRS no cubre/.test(r.aviso), 'al sur de −30° se avisa de la cobertura');
  // Más grande que su parche (M31, IC 342, M33): tercera causa, texto propio.
  ok(R.ps1CabeEnParche(galEnorme) === false, 'la galaxia enorme no cabe en su parche');
  return capa(galEnorme, 180, 40);
}).then(function (r) {
  ok(/mayor que el recorte/.test(r.aviso), 'a la que no cabe en su parche se le dice por qué');
  ok(peticionesParche === 0, 'y no se pide el parche de una galaxia que no cabe');
  /* CAMPO VACÍO (ficha 07). No hace falta mirarlo con ojos: quien decide qué
     parches se piden es el CATÁLOGO, así que un campo sin ninguna fila del RC3
     no pide nada, no pinta nada y no avisa de nada. Con el catálogo real, RA
     200° / Dec +35° (b = 80°) es uno de esos campos. El suelo de ruido del stack
     —el 8 % de los píxeles de un parche vacío sobrevive al corte de 1,5σ— solo
     puede aparecer DENTRO del parche de una galaxia de verdad, nunca en cielo
     pelado. */
  return capa(galNorte, 0, 0);
}).then(function (r) {
  ok(r.aviso === '', 'fuera del catálogo, silencio');
  ok(peticionesParche === 0 && lienzoIntacto(),
    'en campo vacío no se pide parche ni se pinta un solo píxel');
  console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
  process.exit(fallos === 0 ? 0 : 1);
});
