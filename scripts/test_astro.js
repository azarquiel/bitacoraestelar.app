#!/usr/bin/env node
/* Test de la ASTROMETRÍA DE LA SESIÓN (resources/js/bitacora-astro.js).

   Por qué existe: la altura y el azimut que se guardan de una observación se
   calculaban en DOS copias del mismo código (el formulario de registro y el de
   la ficha), y las copias habían divergido sin que nada lo detectara: una
   refractaba el Sol y la Luna y la otra no. Un error aquí no se ve —sale un
   número plausible impreso en la ficha—, así que se comprueba contra
   invariantes físicos, no contra lo que hoy devuelve el código.

   Sin dependencias:  node scripts/test_astro.js  */
'use strict';

var A = require('../resources/js/bitacora-astro.js');

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function entre(v, min, max, etiqueta) {
  if (v >= min && v <= max) { console.log('  ok   ' + etiqueta + ' = ' + v.toFixed(4)); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado en [' + min + ', ' + max + ']\n         obtenido ' + v); }
}
function casi(a, b, tol, etiqueta) {
  if (Math.abs(a - b) <= tol) { console.log('  ok   ' + etiqueta + ' = ' + a); }
  else { fallos++; console.error('  FALLA ' + etiqueta + '\n         esperado ' + b + ' ±' + tol + '\n         obtenido ' + a); }
}

/* ── 1. El polo celeste está a una altura igual a la latitud ───────────────────
   Identidad exacta, a cualquier hora y longitud: si el tiempo sidéreo o la
   fórmula de alt/az se rompen, esto se cae. Es la prueba de extremo a extremo de
   toda la cadena (huso → JD → GMST → alt/az). */
console.log('El polo celeste está a la altura de la latitud:');
var horas = ['2026-01-15T03:00', '2026-07-15T21:30', '2026-11-02T23:45'];
horas.forEach(function (t) {
  var p = A.posiciones({ fechaHoraLocal: t, tz: '', lat: 40, lon: -3.7, ra: 0, dec: 90 });
  // 40,0201° = 40° + refracción de Bennett a esa altura. El objeto SÍ se refracta.
  entre(p.objeto.alt, 40.015, 40.025, 'alt del polo desde lat 40 (' + t + ')');
  casi(p.objeto.az, 0, 1e-9, 'az del polo = Norte exacto (' + t + ')');
});

/* Al otro lado: el polo sur celeste desde lat +40 está a −40° exactos. Por
   debajo de −1° la refracción no se aplica, así que el número sale limpio. */
var bajo = A.posiciones({ fechaHoraLocal: '2026-07-15T21:30', tz: '', lat: 40, lon: -3.7, ra: 0, dec: -90 });
casi(bajo.objeto.alt, -40, 1e-9, 'alt del polo sur desde lat 40 (sin refractar bajo el horizonte)');

/* ── 2. El Sol visto desde el Polo Norte está a la altura de su declinación ────
   Otra identidad exacta (lat = 90 ⇒ alt = dec), independiente de la hora. Fija
   la declinación solar contra dos fechas de libro: solsticio = la oblicuidad,
   equinoccio = cero. */
console.log('\nDeclinación solar medida desde el Polo Norte:');
var solsticio = A.posiciones({ fechaHoraLocal: '2026-06-21T12:00', tz: '', lat: 90, lon: 0, ra: 0, dec: 90 });
entre(solsticio.sol.alt, 23.30, 23.50, 'dec del Sol en el solsticio de junio (oblicuidad ≈ 23,44°)');

var equinoccio = A.posiciones({ fechaHoraLocal: '2026-03-20T12:00', tz: '', lat: 90, lon: 0, ra: 0, dec: 90 });
entre(equinoccio.sol.alt, -0.20, 0.20, 'dec del Sol en el equinoccio de marzo (≈ 0°)');
/* Y de paso, LA decisión del módulo: si alguien refractara el Sol, en el
   equinoccio saldría a +0,48° en vez de a ~0 y el aviso de noche astronómica se
   adelantaría medio grado. El assert de arriba ya lo cazaría; este lo dice. */
ok(equinoccio.sol.alt < 0.2, 'el Sol NO lleva refracción (umbrales de crepúsculo geométricos)');

/* La Luna nunca se aleja más de ~28,6° del ecuador celeste (23,44 + 5,15). */
console.log('\nDeclinación lunar dentro de su rango físico:');
var maxLuna = 0;
for (var mes = 1; mes <= 12; mes++) {
  var t = '2026-' + (mes < 10 ? '0' : '') + mes + '-10T00:00';
  var p2 = A.posiciones({ fechaHoraLocal: t, tz: '', lat: 90, lon: 0, ra: 0, dec: 90 });
  maxLuna = Math.max(maxLuna, Math.abs(p2.luna.alt));
}
entre(maxLuna, 15, 28.7, 'declinación lunar máxima del año (≤ 28,6°)');

/* ── 3. Azimut: el Sol al mediodía está al SUR ────────────────────────────────
   Comprueba el convenio del azimut (0 = Norte, creciendo hacia el Este). Un
   cambio de signo o un convenio Sur-Oeste daría ~0° o ~-2°, no ~178°.
   En Greenwich el mediodía solar del 20 de marzo cae ~12:07 UTC, así que a las
   12:00 el Sol está aún un poco al este del meridiano. */
console.log('\nConvenio de azimut (0 = Norte, hacia el Este):');
var mediodia = A.posiciones({ fechaHoraLocal: '2026-03-20T12:00', tz: '', lat: 51.48, lon: 0, ra: 0, dec: 90 });
entre(mediodia.sol.az, 170, 186, 'az del Sol al mediodía en Greenwich (≈ Sur)');
entre(mediodia.sol.alt, 35, 40, 'alt del Sol al mediodía en Greenwich en el equinoccio (≈ 90−51,5)');

/* ── 4. La hora de pared es la de la BASE, no la del navegador ─────────────────
   El huso es la parte que más fácil se rompe en silencio: una hora de más y la
   altura sale mal por 15°. Se comprueba con y sin horario de verano. */
console.log('\nHora local de la base → instante UTC:');
var verano = A.posiciones({ fechaHoraLocal: '2026-07-15T22:00', tz: 'Europe/Madrid', lat: 40, lon: -3.7, ra: 0, dec: 0 });
ok(verano.utc === '2026-07-15T20:00:00.000Z', 'Madrid en julio (CEST, +2) → ' + verano.utc);

var invierno = A.posiciones({ fechaHoraLocal: '2026-01-15T22:00', tz: 'Europe/Madrid', lat: 40, lon: -3.7, ra: 0, dec: 0 });
ok(invierno.utc === '2026-01-15T21:00:00.000Z', 'Madrid en enero (CET, +1) → ' + invierno.utc);

var sinTz = A.posiciones({ fechaHoraLocal: '2026-01-15T22:00', tz: '', lat: 40, lon: -3.7, ra: 0, dec: 0 });
ok(sinTz.utc === '2026-01-15T22:00:00.000Z', 'sin huso se interpreta como UTC → ' + sinTz.utc);

/* Y la hora importa: 12 horas después el mismo objeto ha cambiado de sitio. */
var t0 = A.posiciones({ fechaHoraLocal: '2026-01-15T00:00', tz: '', lat: 40, lon: 0, ra: 90, dec: 20 });
var t12 = A.posiciones({ fechaHoraLocal: '2026-01-15T12:00', tz: '', lat: 40, lon: 0, ra: 90, dec: 20 });
ok(Math.abs(t0.objeto.alt - t12.objeto.alt) > 30, 'medio día de diferencia mueve al objeto de verdad');

/* ── 5. Sin datos no hay astrometría (el llamador no valida nada más) ──────────*/
console.log('\nDatos incompletos devuelven null:');
ok(A.posiciones({ fechaHoraLocal: '2026-01-15T22:00', tz: '', lon: -3.7, ra: 0, dec: 0 }) === null, 'sin latitud (base a medias)');
ok(A.posiciones({ fechaHoraLocal: '', tz: '', lat: 40, lon: -3.7, ra: 0, dec: 0 }) === null, 'sin fecha');
ok(A.posiciones({ fechaHoraLocal: '15/01/2026 22:00', tz: '', lat: 40, lon: -3.7, ra: 0, dec: 0 }) === null, 'fecha en otro formato');
ok(A.posiciones({ fechaHoraLocal: '2026-01-15T22:00', tz: '', lat: 40, lon: -3.7 }) === null, 'sin coordenadas del objeto');
ok(A.posiciones() === null, 'sin nada');
/* Las bases guardan lat/lon como texto (vienen de la API de WordPress). */
var texto = A.posiciones({ fechaHoraLocal: '2026-07-15T21:30', tz: '', lat: '40', lon: '-3.7', ra: 0, dec: 90 });
ok(texto !== null && Math.abs(texto.objeto.alt - 40.02) < 0.01, 'lat/lon en texto (como llegan de la API)');

console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
