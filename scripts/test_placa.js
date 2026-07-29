#!/usr/bin/env node
/* Test de la CADENA DE LA PLACA del render compartido
   (fusionarPlacas, rellenarNucleo y flujoDePlaca en bitacora-gaia-render.js).

   Son tres reglas numéricas con parámetros puestos a ojo que deciden lo que se ve
   en las vistas DSS y PanSTARRS. Vivían dentro de la clausura del simulador, sin
   test posible. Aquí NO se fijan sus valores —están para tocarlos— sino sus
   invariantes: más luma nunca es menos flujo, un píxel apagado no inventa luz, y
   una fusión que no cuadra devuelve la placa buena en vez de una recta inventada.

   Sin dependencias:  node scripts/test_placa.js  */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function casi(actual, esperado, tol, etiqueta) {
  if (Math.abs(actual - esperado) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + actual); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + esperado + ' ±' + tol + '\n         obtenido ' + actual); }
}

/* ── 1. luma → flujo ───────────────────────────────────────────────────────── */
console.log('Flujo a partir de la luma de la placa:');

var F = R.flujoDePlaca(new Float32Array([0, 1, 60, 128, 200, 255]), false);
ok(F[0] === 0, 'un píxel apagado se queda a flujo 0 (no se inventa luz de fondo)');
ok(F[1] > 0, 'un píxel con señal mínima ya da flujo');

var creciente = true;
for (var i = 2; i < F.length; i++) { if (!(F[i] > F[i - 1])) creciente = false; }
ok(creciente, 'más luma, más flujo (monótona)');

/* Los dos extremos anclan la escala: la luma 255 debe caer justo en SB_OBJ_MAX y
   la luma 1 casi en SB_OBJ_MIN. Se comprueba en magnitudes, que es la física,
   invirtiendo el flujo. */
function sbDeFlujo(f) { return -2.5 * Math.log10(f); }
// Tolerancia 1e-6: el flujo se guarda en Float32Array (≈7 dígitos), no en double.
casi(sbDeFlujo(F[5]), FOT.SB_OBJ_MAX, 1e-6, 'luma 255 → SB_OBJ_MAX (mag/arcsec²)');
casi(sbDeFlujo(F[3]), (FOT.SB_OBJ_MIN + FOT.SB_OBJ_MAX) / 2, 0.05, 'luma 128 → mitad de la escala');
ok(sbDeFlujo(F[1]) < FOT.SB_OBJ_MIN && sbDeFlujo(F[1]) > FOT.SB_OBJ_MIN - 0.2,
  'luma 1 → casi SB_OBJ_MIN (el extremo apagado de la escala)');

/* Un salto de 4 mag/arcsec² son 40 veces menos flujo: la escala es logarítmica,
   no lineal en luma. Si alguien la volviera lineal, esto se cae. */
var mitad = R.flujoDePlaca(new Float32Array([128]), false)[0];
var todo = R.flujoDePlaca(new Float32Array([255]), false)[0];
casi(sbDeFlujo(mitad) - sbDeFlujo(todo), (FOT.SB_OBJ_MIN - FOT.SB_OBJ_MAX) / 2, 0.05,
  'medio recorrido de luma = medio recorrido en magnitudes');

console.log('\nPlacas de PanSTARRS (gamma y recorte):');
var Fh = R.flujoDePlaca(new Float32Array([0, 128, 255, 512, 900]), true);
ok(Fh[0] === 0, 'el píxel apagado sigue a flujo 0');
ok(Fh[3] === Fh[4], 'por encima de 512 se recorta: 900 y 512 dan lo mismo');
ok(Fh[1] < R.flujoDePlaca(new Float32Array([128]), false)[0],
  'la gamma de HiPS oscurece los tonos medios respecto a la placa del DSS');
casi(Fh[2], R.flujoDePlaca(new Float32Array([255]), false)[0], 1e-12,
  'la luma 255 no la mueve la gamma (anclada arriba)');

/* ── 2. Fusión HDR de las dos placas ───────────────────────────────────────── */
console.log('\nFusión de la placa profunda con la corta:');

// Campo de prueba: la profunda satura por arriba (quema el núcleo), la corta lo
// conserva. Relación lineal conocida: profunda ≈ 2·corta, recortada a 255.
var N = 4000;
var prof = new Float32Array(N), cort = new Float32Array(N);
for (i = 0; i < N; i++) {
  var real = (i / N) * 300;                 // brillo "de verdad", 0-300
  cort[i] = Math.min(255, real / 2);        // corta: no satura
  prof[i] = Math.min(255, real);            // profunda: satura a partir de 255
}
var fus = R.fusionarPlacas(prof, cort);
ok(fus !== prof, 'con bastantes píxeles en común, fusiona');
ok(fus.length === prof.length, 'mismo tamaño de campo');

// Por debajo de 210 la profunda manda tal cual; en la zona quemada la fusión
// tiene que RECUPERAR señal por encima del recorte de la profunda.
ok(Math.abs(fus[100] - prof[100]) < 1e-6, 'en la zona lineal no toca la profunda');
var quemados = 0, recuperados = 0;
for (i = 0; i < N; i++) {
  if (prof[i] >= 255) { quemados++; if (fus[i] > 255.5) recuperados++; }
}
ok(quemados > 100, 'el campo de prueba tiene núcleo quemado');
ok(recuperados > 0.9 * quemados, 'recupera el núcleo por encima del recorte (' + recuperados + '/' + quemados + ')');

var creceFus = true;
for (i = 1; i < N; i++) { if (fus[i] < fus[i - 1] - 1e-6) creceFus = false; }
ok(creceFus, 'la fusión sigue siendo monótona (no invierte el degradado)');

// Nunca por debajo de la profunda: la fusión añade señal, no la quita.
var nuncaMenos = true;
for (i = 0; i < N; i++) { if (fus[i] < prof[i] - 1e-6) nuncaMenos = false; }
ok(nuncaMenos, 'la fusión nunca oscurece lo que la profunda ya registró');

console.log('\nFusión que no cuadra → la placa profunda tal cual:');
// Pocos píxeles en la zona lineal común (n < 500).
var pocos = new Float32Array(300), pocosC = new Float32Array(300);
for (i = 0; i < 300; i++) { pocos[i] = 150; pocosC[i] = 60; }
ok(R.fusionarPlacas(pocos, pocosC) === pocos, 'con n < 500 devuelve la profunda sin tocar');

// Correlación invertida: la corta crece donde la profunda decrece → pendiente
// negativa. Preferimos una placa buena a una recta inventada.
var inv = new Float32Array(N), invC = new Float32Array(N);
for (i = 0; i < N; i++) { inv[i] = 120 + (i / N) * 95; invC[i] = 200 - (i / N) * 150; }
ok(R.fusionarPlacas(inv, invC) === inv, 'con pendiente no positiva devuelve la profunda sin tocar');

// Una corta a oscuras (sin señal) tampoco debe arrastrar el ajuste.
var cortaVacia = new Float32Array(N);
ok(R.fusionarPlacas(prof, cortaVacia) === prof, 'una placa corta sin señal se ignora');

/* ── 3. Regla del núcleo hundido ───────────────────────────────────────────── */
console.log('\nNúcleos hundidos de PanSTARRS:');
// El entorno se pasa a mano: la regla es el umbral, no el kernel del desenfoque.
var v = new Float32Array([10, 200, 60, 100, 20]);
var entorno = new Float32Array([10, 200, 200, 130, 200]);
var reparado = R.rellenarNucleo(v, entorno);
ok(reparado[0] === 10, 'entorno oscuro: no se toca (no es un núcleo)');
ok(reparado[1] === 200, 'píxel a la altura de su entorno: no se toca');
casi(reparado[2], 250, 1e-9, 'entorno claro y píxel hundido: se rellena por encima del entorno');
ok(reparado[3] === 100, 'entorno por debajo del umbral (140): no se toca');
casi(reparado[4], 250, 1e-9, 'un agujero profundo también se rellena');

// El tope de 300 evita que un entorno ya saturado dispare el relleno.
var alto = R.rellenarNucleo(new Float32Array([10]), new Float32Array([280]));
ok(alto[0] === 300, 'el relleno se acota a 300');

// Y el caso que importa de verdad: sin la regla, el núcleo de una estrella
// brillante sale MÁS oscuro que su halo.
var estrella = new Float32Array([250, 250, 30, 250, 250]);   // el centro, vacío
var haloDeEstrella = new Float32Array([200, 240, 250, 240, 200]);
var arreglada = R.rellenarNucleo(estrella, haloDeEstrella);
ok(arreglada[2] >= Math.max(arreglada[1], arreglada[3]),
  'el centro deja de ser el punto más oscuro de la estrella');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
