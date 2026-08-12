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

console.log('Fresuelto de haloGlobular resta en agregado, no por píxel (aproximación documentada, no bug):');
var M13test = { rc: 0.62, rt: 0.62 * Math.pow(10, 1.87), muV0: 15.6 };
var estrellaBrillante = [[250, 36, 8]];   // ra, dec = centro exacto del cúmulo; g=8, muy brillante
var haloSinResta = R.haloGlobular(M13test, [], 250, 36);
var haloConResta = R.haloGlobular(M13test, estrellaBrillante, 250, 36);
ok(haloConResta.Fcentral < haloSinResta.Fcentral,
  'una estrella resuelta muy brillante en el centro SÍ reduce el Fcentral del halo (resta agregada, ' +
  haloSinResta.Fcentral.toExponential(2) + ' → ' + haloConResta.Fcentral.toExponential(2) + ')');

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
   04 revisada el 11-ago-2026), nunca el núcleo, y con un radio que depende solo
   de lo brillante que sea la estrella, no del equipo. El relleno es la mediana de
   un anillo, así que reparte luz pero no la conserva al dígito: suma con holgura. */
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
// Núcleo intacto aunque le caiga encima una estrella brillante y ancha.
var dN = parcheSintetico(0);
var outN = R.ps1QuitarEstrellas(dN, ANCHO, ANCHO,
  [{ x: (ANCHO - 1) / 2, y: (ANCHO - 1) / 2, rPx: 12 }]);
var cN = Math.round((ANCHO - 1) / 2), iN = cN * ANCHO + cN;
casi(outN[iN], dN[iN], 1e-6, 'la máscara no toca el píxel central del núcleo');

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

// Interruptor: apagado de fábrica durante las fases 1 y 2.
ok(R.galaxiasImagen === false, 'la capa de galaxias viene apagada por defecto');
R.galaxiasImagen = true; ok(R.galaxiasImagen === true, 'el interruptor se puede encender');
R.galaxiasImagen = false;

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
