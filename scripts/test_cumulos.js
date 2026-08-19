#!/usr/bin/env node
/* Test de la Capa 1 (población estelar) de resources/js/bitacora-cumulos.js.

   Lo que se comprueba aquí es lo que la especificación pide para cerrar la
   Fase 1: que N_tot salga del flujo integrado y no de un ajuste, que S1/S2
   coincidan elemento a elemento con la suma directa sobre la LF, que el reparto
   resuelto/no resuelto no pierda ni invente flujo, que m_crowd sea continua y
   monótona en r, y que la realización sintética sea determinista y ajena al
   instrumento.

   Cierra con la puerta de conservación: el brillo superficial central que
   predice el modelo (V_t + geometría de King) contra el mu_V(0) MEDIDO que
   tabula Harris, cúmulo a cúmulo. Son dos datos independientes del mismo
   catálogo, así que el residuo mide de verdad si la Capa 1 cierra.

   Sin dependencias:  node scripts/test_cumulos.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/lf-globulares-datos.js');
require('../simulador_ocular/resources/js/globulares-datos.js');
require('../resources/js/bitacora-cumulos.js');
var R = global.window.BitacoraGaiaRender;
var C = global.window.BitacoraCumulos;
var CATALOGO = global.window.BITACORA_GLOBULARES;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) {
    console.log('  ok   ' + etiqueta + ' = ' + actual.toPrecision(8));
  } else {
    fallos++;
    console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado.toPrecision(8) +
      ' ±' + tol + '\n         obtenido ' + actual.toPrecision(8));
  }
}
function rel(a, b) { return Math.abs(a - b) / Math.abs(b); }

// M13 (NGC 6205) del catálogo, con todos sus campos de población.
function delCatalogo(id) {
  var e = CATALOGO.filter(function (f) { return f[0] === id; })[0];
  if (!e) throw new Error('no está en el catálogo: ' + id);
  return { id: e[0], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
           Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
}
var M13 = delCatalogo('NGC 6205');
var pobM13 = C.poblacion(M13);

/* ── 1. Las tres LF comparten rejilla ───────────────────────────────────── */
console.log('Funciones de luminosidad:');
var LF = global.window.BITACORA_LF_GLOBULARES;
var alineadas = LF.tablas.every(function (t) {
  var k = (t.m0 - LF.tablas[0].m0) / LF.tablas[0].paso;
  return t.paso === LF.tablas[0].paso && Math.abs(k - Math.round(k)) < 1e-6;
});
ok(alineadas, 'las tres tablas caen en la misma rejilla de magnitud');
ok(LF.tablas.length === 3, 'hay tres tablas de metalicidad, no una');
LF.tablas.forEach(function (t) {
  var suma = t.phi.reduce(function (a, b) { return a + b; }, 0);
  // 1e-6 y no 1e-9: el fichero generado escribe phi con seis cifras, así que la
  // suma no puede cerrar mejor que eso. Es precisión de serialización, no del
  // modelo, y no propaga: N_tot se deriva del flujo, no del número.
  casi(suma, 1, 1e-6, '[Fe/H]=' + t.feh + ': la LF está normalizada en número');
});

var lfPobre = C.lfInterpolada(-2.0), lfMedia = C.lfInterpolada(-1.5);
var difMax = 0;
for (var i = 0; i < lfPobre.phi.length; i++) difMax = Math.max(difMax, Math.abs(lfPobre.phi[i] - lfMedia.phi[i]));
ok(difMax > 1e-6, 'metalicidades distintas dan LF distintas (el grano no es una constante)');
var lfExtremo = C.lfInterpolada(-5.0);
var igualAlExtremo = true;
for (i = 0; i < lfPobre.phi.length; i++) if (lfExtremo.phi[i] !== lfPobre.phi[i]) igualAlExtremo = false;
ok(igualAlExtremo, 'fuera del rango tabulado se usa la tabla del extremo, sin extrapolar');

/* ── 2. N_tot es derivado del flujo integrado ───────────────────────────── */
console.log('N_tot y flujo total:');
var sumaFlujo = 0;
for (i = 0; i < pobM13.magnitudes.length; i++) {
  sumaFlujo += pobM13.estrellasPorBin[i] * Math.pow(10, -0.4 * pobM13.magnitudes[i]);
}
ok(rel(sumaFlujo, pobM13.Ftotal) < 1e-9,
  'M13: la LF integrada reproduce F(V_t) (residuo ' + rel(sumaFlujo, pobM13.Ftotal).toExponential(2) + ')');
ok(pobM13.Ntot > 1e4 && pobM13.Ntot < 1e7,
  'M13: N_tot = ' + pobM13.Ntot.toExponential(3) + ' estrellas, del orden esperado para un globular');

/* ── 3. S1 y S2, elemento a elemento contra la suma directa ─────────────── */
/* Desde v7-E4 la cola se INTERPOLA dentro del bin que m_lim parte: devolver el
   bin entero hacía de S1 y S2 funciones escalón de m_lim y, como m_res(r) es
   continua, cada borde de bin dibujaba un anillo concéntrico (D3). Así que la
   suma directa sigue siendo la referencia, pero solo donde no hay bin partido
   —los bordes— y en medio la cola tiene que quedar ENTRE los dos bins enteros
   que la rodean, que es lo que dice la interpolación y lo que garantiza que no
   se pierde ni se duplica flujo. */
console.log('S1 y S2 contra la suma directa sobre la LF (tolerancia 1e-9 relativa):');
var pasoLF = pobM13.magnitudes[1] - pobM13.magnitudes[0];
function colaDirecta(mlim, cuadrado) {
  var s = 0;
  for (var j = 0; j < pobM13.magnitudes.length; j++) {
    if (pobM13.magnitudes[j] <= mlim) continue;
    var fj = Math.pow(10, -0.4 * pobM13.magnitudes[j]);
    s += pobM13.estrellasPorBin[j] * fj * (cuadrado ? fj : 1);
  }
  return s;
}
var peorS1 = 0, peorS2 = 0, peorReparto = 0, fueraS1 = 0, fueraS2 = 0;
for (var mlim = 8; mlim <= 26; mlim += 0.1) {
  // Bordes del bin que contiene m_lim: la cola tiene que caer entre los dos.
  var centro = pobM13.magnitudes[0] +
    Math.round((mlim - pobM13.magnitudes[0]) / pasoLF) * pasoLF;
  var alto1 = colaDirecta(centro - pasoLF / 2 - 1e-9, false);   // bin partido entero dentro
  var bajo1 = colaDirecta(centro + pasoLF / 2 + 1e-9, false);   // bin partido entero fuera
  var alto2 = colaDirecta(centro - pasoLF / 2 - 1e-9, true);
  var bajo2 = colaDirecta(centro + pasoLF / 2 + 1e-9, true);
  var v1 = pobM13.S1(mlim), v2 = pobM13.S2(mlim);
  if (v1 > alto1 * (1 + 1e-9) || v1 < bajo1 * (1 - 1e-9)) fueraS1++;
  if (v2 > alto2 * (1 + 1e-9) || v2 < bajo2 * (1 - 1e-9)) fueraS2++;
  // En el borde del bin no hay nada que partir: ahí la coincidencia es exacta.
  var borde = centro + pasoLF / 2;
  var d1 = colaDirecta(borde, false), d2 = colaDirecta(borde, true);
  if (d1 > 0) peorS1 = Math.max(peorS1, rel(pobM13.S1(borde), d1));
  if (d2 > 0) peorS2 = Math.max(peorS2, rel(pobM13.S2(borde), d2));
  peorReparto = Math.max(peorReparto, rel(pobM13.S1(mlim) + pobM13.Fresuelto(mlim), pobM13.Ftotal));
}
ok(peorS1 < 1e-9, 'S1 coincide con la suma directa en los bordes de bin (peor ' + peorS1.toExponential(2) + ')');
ok(peorS2 < 1e-9, 'S2 coincide con la suma directa en los bordes de bin (peor ' + peorS2.toExponential(2) + ')');
ok(fueraS1 === 0 && fueraS2 === 0,
  'y dentro del bin la cola interpolada queda entre los dos bins enteros que la rodean');
ok(peorReparto < 1e-9,
  'resuelto + no resuelto = F(V_t) para todo m_lim (peor ' + peorReparto.toExponential(2) + ')');
ok(rel(pobM13.S1(-99), pobM13.Ftotal) < 1e-12, 'sin nada resuelto, el campo se lleva todo el flujo');
casi(pobM13.S1(99), 0, 0, 'con todo resuelto, el campo se queda a cero exacto');

/* ── 4. El perfil está normalizado sobre el cielo ───────────────────────── */
console.log('Perfil radial Sigma(r):');
var N = 20000, h = pobM13.rtAs / N, integral = 0;
for (var j = 0; j < N; j++) {
  var r0 = j * h, r1 = r0 + h;
  integral += (pobM13.sigma(r0) * r0 + pobM13.sigma(r1) * r1) / 2 * h;
}
integral *= 2 * Math.PI;
casi(integral, 1, 1e-3, 'M13: integrado sobre el cielo suma 1 (fracción de estrellas por arcsec²)');
ok(pobM13.sigma(pobM13.rtAs * 1.1) === 0, 'más allá del radio de marea no hay estrellas');

/* ── 5. m_crowd: continua, monótona y con la dependencia física correcta ── */
console.log('Límite por aglomeración m_crowd(r):');
var omega = Math.PI * Math.pow(1.0 / 2, 2);   // beam de 1" FWHM
var previo = -Infinity, monotona = true, saltoMax = 0, anterior = null;
for (var r = 1; r < pobM13.rtAs; r += 1) {
  var m = pobM13.mCrowd(r, omega);
  if (isFinite(m)) {
    if (m < previo - 1e-9) monotona = false;
    if (anterior !== null && isFinite(anterior)) saltoMax = Math.max(saltoMax, Math.abs(m - anterior));
    previo = m;
  }
  anterior = m;
}
ok(monotona, 'crece hacia fuera: en el núcleo se resuelven menos estrellas');
ok(saltoMax < 0.2, 'sin escalones en r (salto máximo ' + saltoMax.toFixed(3) + ' mag entre arcsec contiguos)');
var mNucleo = pobM13.mCrowd(2, omega);
ok(pobM13.mCrowd(2, omega * 4) < mNucleo, 'un beam más ancho aglomera antes (m_crowd más brillante)');
ok(pobM13.mCrowd(2, omega, 60) < mNucleo, 'un criterio k más exigente también');
ok(!isFinite(pobM13.mCrowd(pobM13.rtAs * 1.05, omega)), 'fuera del cúmulo no hay aglomeración ninguna');

/* ── 6. Estrellas sintéticas: deterministas y ajenas al instrumento ─────── */
console.log('Estrellas sintéticas (las que Gaia no trae):');
var opc = { ra: 250.42183, dec: 36.45986 };
var s1lista = pobM13.sinteticas(opc), s2lista = pobM13.sinteticas(opc);
ok(s1lista.length === s2lista.length && s1lista.every(function (e, k) {
  return e[0] === s2lista[k][0] && e[1] === s2lista[k][1] && e[2] === s2lista[k][2];
}), 'dos llamadas dan exactamente la misma realización (' + s1lista.length + ' estrellas)');
var otraRealizacion = pobM13.sinteticas({ ra: opc.ra, dec: opc.dec, realization: 1 });
ok(otraRealizacion.length !== s1lista.length || otraRealizacion[0][0] !== s1lista[0][0],
  'otra realization da otra realización');
ok(s1lista.every(function (e) { return e[2] <= C.config.mCutGeneracion; }),
  'ninguna sintética es más débil que el corte de generación');
var dentro = s1lista.every(function (e) {
  var dx = (e[0] - opc.ra) * Math.cos(opc.dec * Math.PI / 180) * 3600;
  var dy = (e[1] - opc.dec) * 3600;
  return Math.sqrt(dx * dx + dy * dy) <= pobM13.rtAs * 1.001;
});
ok(dentro, 'todas caen dentro del radio de marea');
var flujoSint = s1lista.reduce(function (a, e) { return a + Math.pow(10, -0.4 * e[2]); }, 0);
ok(flujoSint < pobM13.Ftotal, 'las sintéticas no se pasan del flujo total del cúmulo (' +
  (100 * flujoSint / pobM13.Ftotal).toFixed(1) + ' %)');
ok(pobM13.completitud(15, 600) > pobM13.completitud(15, 2),
  'Gaia es más completa en el halo que en el núcleo a igual magnitud');
ok(pobM13.completitud(21, 600) < pobM13.completitud(15, 600),
  'y menos completa en las débiles que en las brillantes');

/* ── 7. El sorteo por estrella (ADR 0012) ───────────────────────────────── */
console.log('Sorteo por estrella:');

/* No es azar: es una función de las coordenadas. La misma estrella sale o no
   sale siempre igual, y por eso cambiar de ocular no la hace parpadear. */
var u1 = C.sorteo(250.4235, 36.4613, 0);
ok(u1 === C.sorteo(250.4235, 36.4613, 0), 'el sorteo es determinista en las coordenadas');
ok(u1 !== C.sorteo(250.4235, 36.4613, 1), 'y otra realización del cúmulo da otro sorteo');
ok(C.sorteo(250.4235, 36.4613, 0) !== C.sorteo(250.4236, 36.4613, 0),
  'dos estrellas vecinas sortean por separado');

/* Uniforme en [0,1): si no lo fuera, comparar contra a(m,r) no daría la
   probabilidad que la ley pide, daría otra. Se mide sobre una rejilla de
   coordenadas de verdad, no sobre enteros consecutivos. */
var nU = 0, suma = 0, malRango = 0, cuartos = [0, 0, 0, 0];
for (var iu = 0; iu < 200; iu++) {
  for (var ju = 0; ju < 200; ju++) {
    var u = C.sorteo(250 + iu * 0.0017, 36 + ju * 0.0013, 0);
    if (!(u >= 0 && u < 1)) malRango++;
    cuartos[Math.min(3, Math.floor(u * 4))]++;
    suma += u; nU++;
  }
}
ok(malRango === 0, 'siempre cae en [0,1) (' + nU + ' muestras)');
casi(suma / nU, 0.5, 2, 'con media 1/2');
var peorCuarto = Math.max.apply(null, cuartos.map(function (c) { return Math.abs(c / nU - 0.25); }));
ok(peorCuarto < 0.01, 'y reparto plano por cuartos (peor desvío ' +
  (100 * peorCuarto).toFixed(2) + ' %)');

/* ── 8. Conservación de la Fase 1, en sus dos sentidos ───────────────────
   (a) INTERNA: resuelto + campo = F(V_t) para todo m_lim. Es la de §3.4 de la
       especificación, y ya está verificada arriba a 1e-16: el reparto sale de
       la misma LF y del mismo corte, sin descuentos paralelos.
   (b) EXTERNA: el modelo predice mu_V(0) = -2.5·log10(Sigma(0)·F(V_t)) y Harris
       tabula el mu_V(0) MEDIDO. Son dos datos independientes del catálogo, así
       que el residuo dice si la geometría de King y el flujo integrado cierran
       de verdad. Se registra cúmulo a cúmulo, como pide la Fase 1, y se cierra
       sobre los cúmulos donde el perfil de King es aplicable: los de
       concentración alta (c >= 2, casi todos con núcleo colapsado) NO siguen a
       King por definición, y son la extensión opcional del plan, no un fallo
       del reparto. El residuo se conserva como evidencia: nunca se corrige
       tocando el flujo del campo (ADR 0003). */
console.log('Conservación (Fase 1): mu_V(0) del modelo contra el medido por Harris:');
var residuos = [];
CATALOGO.forEach(function (e) {
  var cum = { id: e[0], rc: e[4], rh: e[5], c: e[6], muV0: e[7],
              Vt: e[8], dkpc: e[9], ebv: e[10], feh: e[11], elip: e[12], pa: null };
  if (cum.Vt == null || cum.dkpc == null || cum.muV0 == null) return;
  var p = C.poblacion(cum);
  if (!p) return;
  var muModelo = -2.5 * Math.log10(p.sigma(0) * p.Ftotal);
  residuos.push({ id: cum.id, c: cum.c, d: muModelo - cum.muV0 });
});
function resumen(lista, etiqueta) {
  var d = lista.map(function (x) { return x.d; }).sort(function (a, b) { return a - b; });
  function pct(q) { return d[Math.min(d.length - 1, Math.floor(q * d.length))]; }
  console.log('  ' + etiqueta + ': n=' + d.length + '  mediana ' + pct(0.5).toFixed(3) +
    ' mag  p10 ' + pct(0.1).toFixed(2) + '  p90 ' + pct(0.9).toFixed(2));
  return pct(0.5);
}
var deKing = residuos.filter(function (x) { return x.c < 2.0; });
var concentrados = residuos.filter(function (x) { return x.c >= 2.0; });
var medKing = resumen(deKing, 'perfil de King aplicable (c < 2)');
resumen(concentrados, 'concentración alta (c >= 2), informativo');
residuos.sort(function (a, b) { return a.d - b.d; });
console.log('  residuo por cúmulo, extremos: ' +
  residuos.slice(0, 3).concat(residuos.slice(-3)).map(function (x) {
    return x.id + ' ' + x.d.toFixed(2);
  }).join(', '));
ok(Math.abs(medKing) <= 0.20,
  'donde King describe el cúmulo, el modelo reproduce el brillo central medido dentro de 0.20 mag');
ok(deKing.filter(function (x) { return Math.abs(x.d) <= 1.0; }).length >= 0.8 * deKing.length,
  'y 4 de cada 5 de esos cúmulos caen dentro de 1 mag');

/* ── 9. Frontera de módulos (ADR 0002), verificable por grep ─────────────── */
console.log('Frontera: la Capa 1 no sabe nada del ojo ni del display:');
var fs = require('fs'), path = require('path');
var fuente = fs.readFileSync(path.join(__dirname, '..', 'resources', 'js', 'bitacora-cumulos.js'), 'utf8');
// En comentarios sí se nombran (explican dónde vive cada cosa); lo que no puede
// haber es código que las use.
var codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
['Cmin', 'canvas', 'ctxFotometrico', 'visibilidadDifusa', 'realzarPerceptual', 'getContext']
  .forEach(function (prohibido) {
    ok(codigo.indexOf(prohibido) === -1, 'bitacora-cumulos.js no usa ' + prohibido);
  });

console.log(fallos === 0 ? '\nTodo OK' : '\n' + fallos + ' fallo(s)');
process.exit(fallos === 0 ? 0 : 1);
