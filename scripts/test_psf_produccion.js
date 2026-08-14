#!/usr/bin/env node
/* REGRESIÓN: el camino de producción contra el harness ya validado.

   La PSF del parche se midió primero fuera (scripts/lib_psf_parche.js, validada
   por test_psf_parche.js y por harness_decision_psf_resolucion.js). Al llevarla
   a producción se reescribió como IIFE de navegador, sin `require`. Esto
   comprueba que la reescritura es la MISMA función, no una parecida: mismo
   θ_add, mismo kernel, mismo resultado bit a bit sobre parches reales.

   Y comprueba lo que el cambio no debe romper: campo angular, fotometría,
   máscara de no finitos, y que la PSF se aplique UNA sola vez por muchas veces
   que se repinte.

   Necesita los parches en la caché de lib_bajar_parche.js (los deja el harness
   de decisión la primera vez que corre, con red).

   Uso:  node scripts/test_psf_produccion.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender;
var CFG = R.config, PS1 = R.ps1, FOT = R.fot;
var P = require('./lib_psf_parche.js')(R);
var B = require('./lib_bajar_parche.js')(R);

var fallos = 0;
function casi(a, e, tol, et) {
  if (Math.abs(a - e) <= tol) console.log('  ok   ' + et + ' = ' + a.toFixed(8));
  else { fallos++; console.error('  FALLA ' + et + '\n         esperado ' + e + ' ±' + tol + '\n         obtenido ' + a); }
}
function ok(c, et) { if (c) console.log('  ok   ' + et); else { fallos++; console.error('  FALLA ' + et); } }

var OBJETOS = [
  { nombre: 'NGC 5194 (M51)',  ra: 202.47208, dec: 47.19667 },
  { nombre: 'NGC 3031 (M81)',  ra: 148.88958, dec: 69.06667 },
  { nombre: 'NGC 5457 (M101)', ra: 210.80208, dec: 54.34861 },
  { nombre: 'NGC 205',         ra:  10.09375, dec: 41.68639 }
];
var APERTURAS = [80, 203, 457, 914];
var LADO = 20.03;

function correr(parches) {

  console.log('\n— 1. PS1.salida está en 1024, y es lo único que se movió de la config —');
  casi(PS1.salida, 1024, 0, 'PS1.salida');
  casi(PS1.ladoMax, 20, 1e-12, 'ladoMax (sin tocar)');
  casi(PS1.ladoMin, 1.5, 1e-12, 'ladoMin (sin tocar)');
  casi(PS1.fracMin, 0.4, 1e-12, 'fracMin (sin tocar)');
  casi(PS1.ladoFactor, 6, 1e-12, 'ladoFactor (sin tocar)');
  casi(PS1.seeingAs, 1.1, 1e-12, 'seeingAs (sin tocar)');
  casi(CFG.airyArcsec, 138.4, 1e-12, 'airyArcsec (sin tocar)');
  casi(CFG.seeingArcsec, 2.0, 1e-12, 'seeingArcsec (sin tocar)');
  casi(FOT.C_MAG_MIN, 0.45, 1e-12, 'C_MAG_MIN (sin tocar)');
  casi(FOT.C_MAG_MAX, 2.0, 1e-12, 'C_MAG_MAX (sin tocar)');
  casi(FOT.C_MAG_EXP, 1.0, 1e-12, 'C_MAG_EXP (sin tocar)');

  console.log('\n— 2. El campo angular es idéntico: se subió `salida`, no se tocó `lado` —');
  /* Es la diferencia entre afinar el muestreo y recortar galaxia. Lo segundo se
     pagaría en la fracción de luz que el parche abarca. */
  [10, 60, 114, 200, 400].forEach(function (re) {
    var esperado = Math.max(PS1.ladoMin, Math.min(PS1.ladoMax, PS1.ladoFactor * re / 60));
    casi(R.ps1LadoArcmin(re), esperado, 1e-12, 'ps1LadoArcmin(' + re + '″)');
  });
  OBJETOS.forEach(function (o) {
    var p = parches[o.nombre];
    if (p) casi(p.ancho * p.escalaAs / 60, LADO, 0.02, o.nombre + ': lado del parche bajado (′)');
  });

  console.log('\n— 3. θ_add de producción == θ_add del harness, en toda la rejilla —');
  /* Si estas dos cuentas se separan, la reescritura introdujo física distinta. */
  [2.3511, 1.1738, 0.6680, 0.25].forEach(function (esc) {
    APERTURAS.forEach(function (D) {
      casi(R.ps1ThetaAdd(D, esc), P.thetaAdd(D, esc), 1e-12,
        'θ_add(' + D + ' mm, ' + esc + '″/px)');
    });
  });
  casi(R.ps1ThetaAdd(80, 40), 0, 0, 'y si el parche ya viene más borroso que el telescopio, θ_add = 0');

  console.log('\n— 4. La convolución de producción == la del harness, bit a bit —');
  /* Salvo por la máscara, que producción restaura y el harness no: por eso la
     comparación salta los píxeles que eran no finitos de entrada. */
  OBJETOS.forEach(function (o) {
    var p = parches[o.nombre];
    if (!p) return;
    var a = R.ps1PsfParche(p.datos, p.ancho, p.alto, p.escalaAs, 457);
    var b = P.convolucionar(p.datos, p.ancho, p.alto, p.escalaAs, 457, null);
    var peor = 0, n = 0;
    for (var i = 0; i < a.length; i++) {
      if (!isFinite(p.datos[i])) continue;             // ahí producción restaura NaN a propósito
      if (!isFinite(a[i]) || !isFinite(b[i])) continue;
      peor = Math.max(peor, Math.abs(a[i] - b[i])); n++;
    }
    ok(n > 0 && peor === 0, o.nombre + ': idéntica en ' + n + ' px (peor Δ = ' + peor + ')');
  });

  console.log('\n— 5. La máscara de no finitos se conserva EXACTAMENTE —');
  /* No es cosmética: los huecos del stack están en el centro de estrellas
     saturadas, y rellenarlos mete flujo que no está en el cielo. */
  OBJETOS.forEach(function (o) {
    var p = parches[o.nombre];
    if (!p) return;
    var a = R.ps1PsfParche(p.datos, p.ancho, p.alto, p.escalaAs, 457);
    var huecos = 0, iguales = 0, extra = 0;
    for (var i = 0; i < a.length; i++) {
      var e = !isFinite(p.datos[i]), s = !isFinite(a[i]);
      if (e) { huecos++; if (s) iguales++; }
      else if (s) extra++;
    }
    ok(iguales === huecos && extra === 0,
      o.nombre + ': ' + huecos + ' huecos, ' + iguales + ' conservados, ' + extra + ' nuevos');
  });

  console.log('\n— 6. Y con la máscara conservada el flujo se conserva —');
  /* Sin ella, M81 se iba a +4,44 % y NGC 205 a +5,18 %. */
  OBJETOS.forEach(function (o) {
    var p = parches[o.nombre];
    if (!p) return;
    var a = R.ps1PsfParche(p.datos, p.ancho, p.alto, p.escalaAs, 457);
    var sa = 0, sb = 0;
    for (var i = 0; i < a.length; i++) {
      if (isFinite(p.datos[i])) sa += p.datos[i];
      if (isFinite(a[i])) sb += a[i];
    }
    var d = 100 * (sb / sa - 1);
    ok(Math.abs(d) < 0.5, o.nombre + ': Δ flujo = ' + d.toFixed(4) + ' % (< 0,5 %)');
  });

  console.log('\n— 7. La PSF se aplica UNA sola vez, por muchas veces que se repinte —');
  /* Es la doble contabilización que había que evitar: sin caché, cada repintado
     convolucionaría sobre el resultado anterior y el borrón se acumularía. */
  var p0 = parches[OBJETOS[0].nombre];
  if (p0) {
    var parche = { datos: p0.datos, ancho: p0.ancho, alto: p0.alto, ladoArcmin: LADO };
    var d1 = R.ps1DatosConPsf(parche, p0.escalaAs, 457);
    var d2 = R.ps1DatosConPsf(parche, p0.escalaAs, 457);
    var d3 = R.ps1DatosConPsf(parche, p0.escalaAs, 457);
    ok(d1 === d2 && d2 === d3, 'tres pasadas con la misma apertura devuelven el MISMO array');
    ok(parche.datos === p0.datos, 'y `parche.datos` no se muta nunca: se convoluciona desde el original');
    var ref = R.ps1PsfParche(p0.datos, p0.ancho, p0.alto, p0.escalaAs, 457);
    var peor = 0;
    for (var i = 0; i < d3.length; i++) {
      if (!isFinite(ref[i]) || !isFinite(d3[i])) continue;
      peor = Math.max(peor, Math.abs(d3[i] - ref[i]));
    }
    casi(peor, 0, 0, 'y el resultado tras 3 pasadas == 1 sola convolución (sin acumular borrón)');
    // Cambiar de apertura sí tiene que recalcular, y desde el original.
    var d914 = R.ps1DatosConPsf(parche, p0.escalaAs, 914);
    ok(d914 !== d1, 'cambiar de apertura recalcula');
    var ref914 = R.ps1PsfParche(p0.datos, p0.ancho, p0.alto, p0.escalaAs, 914);
    peor = 0;
    for (i = 0; i < d914.length; i++) {
      if (!isFinite(ref914[i]) || !isFinite(d914[i])) continue;
      peor = Math.max(peor, Math.abs(d914[i] - ref914[i]));
    }
    casi(peor, 0, 0, 'y lo recalcula desde parche.datos, no desde el de 457 mm');
  }

  console.log('\n— 8. A 1024 px, 457 y 914 mm siguen siendo distintos —');
  /* Era la razón del cambio. A 512 px esto daba 0 exacto porque el kernel es la
     identidad en float32. */
  OBJETOS.forEach(function (o) {
    var p = parches[o.nombre];
    if (!p) return;
    var a = R.ps1PsfParche(p.datos, p.ancho, p.alto, p.escalaAs, 457);
    var b = R.ps1PsfParche(p.datos, p.ancho, p.alto, p.escalaAs, 914);
    var s2 = 0, n = 0, val = [];
    for (var i = 0; i < a.length; i++) {
      if (!isFinite(a[i]) || !isFinite(b[i])) continue;
      s2 += (a[i] - b[i]) * (a[i] - b[i]); n++;
      val.push(p.datos[i]);
    }
    val.sort(function (x, y) { return x - y; });
    var med = val[val.length >> 1], des = [];
    for (i = 0; i < val.length; i += 7) des.push(Math.abs(val[i] - med));   // muestreo: basta para la MAD
    des.sort(function (x, y) { return x - y; });
    var sig = des[des.length >> 1] * 1.4826;
    var d = Math.sqrt(s2 / n) / sig;
    ok(d > 0.5, o.nombre + ': RMS(457 − 914) = ' + d.toFixed(4) + ' σ de cielo (> 0,5)');
  });
  // Y la comprobación de que a 512 px NO lo eran: la escala de antes del cambio.
  var pRef = parches[OBJETOS[0].nombre];
  if (pRef) {
    var e512 = LADO * 60 / 512;
    ok(P.sigmaPx(457, e512, null) < 0.5 && P.sigmaPx(914, e512, null) < 0.5,
      'a la escala de 512 px (' + e512.toFixed(2) + '″/px) las dos eran subpíxel: σ = ' +
      P.sigmaPx(457, e512, null).toFixed(3) + ' y ' + P.sigmaPx(914, e512, null).toFixed(3));
  }

  console.log('\n— 9. Y el signo es el correcto: más apertura, menos borrón añadido —');
  var esc = LADO * 60 / PS1.salida, prev = Infinity;
  APERTURAS.forEach(function (D) {
    var t = R.ps1ThetaAdd(D, esc);
    ok(t <= prev + 1e-12, D + ' mm: θ_add = ' + t.toFixed(4) + '″ (no crece con D)');
    prev = t;
  });

  console.log('\n— 10. La fotometría no se mueve —');
  /* No es que dé lo mismo: es que ctxFotometrico recibe SOLO la óptica, así que
     no tiene por dónde enterarse del parche ni de su resolución. */
  var opt = { sqm: 21.3, transmision: 0.82, pupilaOjo: 7, pupilaSalida: 457 / 150 };
  var c1 = R.ctxFotometrico(opt), c2 = R.ctxFotometrico(opt);
  casi(c1.Cmin, c2.Cmin, 0, 'Cmin');
  casi(c1.nivelFondo, c2.nivelFondo, 0, 'nivelFondo');
  casi(c1.rango, c2.rango, 0, 'rango');
  /* El 2º argumento (thetaIntArcmin, ley H2c) es tamaño INTRÍNSECO del objeto
     en el cielo, no resolución del parche: la guarda sigue siendo que ninguna
     PSF ni escala de píxel entra en la fotometría. */
  ok(R.ctxFotometrico.length <= 2, 'ctxFotometrico toma la óptica y a lo sumo θint: sin hueco para el parche ni su PSF');
  casi(R.ctxFotometrico(opt, 8).Cmin, c1.Cmin, 0, 'sin aumentos en la óptica, θint no mueve Cmin');
  casi(R.nivelFondo({ pupilaSalida: 457 / 150, pupilaOjo: 7, sqm: 21.3, transmision: 0.82 }),
    R.nivelFondo({ pupilaSalida: 457 / 150, pupilaOjo: 7, sqm: 21.3, transmision: 0.82 }), 0,
    'nivelFondo del render');

  console.log('\n— 11. La apertura sale bien de la pupila, y sin depender de MAG —');
  /* Los llamadores pasan pupila y aumentos, no D. pupila = D/MAG, así que el
     producto ES D: los aumentos se cancelan. Con la MISMA D por dos aumentos
     distintos, θ_add tiene que salir igual. */
  [[457, 50], [457, 150], [457, 300]].forEach(function (t) {
    var D = t[0], MAG = t[1], pupila = D / MAG;
    casi(pupila * MAG, D, 1e-9, 'pupila×MAG a ' + MAG + '× reconstruye D = ' + D);
    casi(R.ps1ThetaAdd(pupila * MAG, esc), R.ps1ThetaAdd(D, esc), 1e-12,
      'y θ_add a ' + MAG + '× es el mismo');
  });

  console.log('\n— 12. Sin óptica que simular, la PSF ni se calcula —');
  /* Los tests de geometría pintan sin `cielo`: ahí no hay apertura, y el parche
     tiene que salir tal cual. */
  var p2 = parches[OBJETOS[0].nombre];
  if (p2) {
    var pp = { datos: p2.datos, ancho: p2.ancho, alto: p2.alto, ladoArcmin: LADO };
    ok(R.ps1DatosConPsf(pp, p2.escalaAs, 0) === p2.datos, 'sin apertura devuelve el array original');
    ok(R.ps1DatosConPsf(pp, p2.escalaAs, undefined) === p2.datos, 'y con apertura indefinida, igual');
  }

  console.log('\n— 13. Y el camino ENTERO, pintando de verdad con ps1PintarParche —');
  /* Lo de arriba prueba las piezas. Esto prueba el cableado: que `o.apertura`
     llega, que la escala del parche se calcula bien y que el bucle lee del array
     convolucionado y no del original. Si cualquiera de las tres falla, aquí los
     lienzos de 457 y 914 salen idénticos y arriba no se habría notado. */
  var pC = parches[OBJETOS[0].nombre];
  if (pC) {
    var SIZE = 256, ARCMIN = 30;
    var cieloC = { pupilaSalida: 457 / 150, pupilaOjo: 7, sqm: 21.3, transmision: 0.82, aumentos: 150 };
    function pintar(D, cielo) {
      var pr = { datos: pC.datos, ancho: pC.ancho, alto: pC.alto, ladoArcmin: LADO,
                 ra: OBJETOS[0].ra, dec: OBJETOS[0].dec, comps: [], pa: 0 };
      var lienzo = new Float32Array(SIZE * SIZE);
      R.ps1PintarParche(lienzo, pr, { ra0: OBJETOS[0].ra, dec0: OBJETOS[0].dec,
        arcmin: ARCMIN, size: SIZE, cielo: cielo, apertura: D });
      return lienzo;
    }
    function rms(a, b) {
      var s = 0, n = 0;
      for (var i = 0; i < a.length; i++) { s += (a[i] - b[i]) * (a[i] - b[i]); n++; }
      return Math.sqrt(s / n);
    }
    var antes = 0, k;
    for (k = 0; k < pC.datos.length; k += 13) if (isFinite(pC.datos[k])) antes += pC.datos[k];
    var L457 = pintar(457, cieloC), L914 = pintar(914, cieloC);
    var esc457 = 0;
    for (var i = 0; i < L457.length; i++) esc457 = Math.max(esc457, L457[i]);
    ok(esc457 > 0, 'el parche se pinta: pico del lienzo = ' + esc457.toFixed(4));
    ok(rms(L457, L914) > 0, 'y 457 vs 914 dan lienzos DISTINTOS: RMS = ' + rms(L457, L914).toExponential(3));
    // El respaldo: sin `apertura`, la pupila y los aumentos reconstruyen la misma D.
    var Lfb = pintar(undefined, cieloC);
    casi(rms(Lfb, L457), 0, 0, 'sin `apertura`, pupila×aumentos pinta EL MISMO lienzo que D = 457');
    // Y el mismo D por otro camino de aumentos tiene que dar lo mismo.
    var Lotro = pintar(undefined, { pupilaSalida: 457 / 50, pupilaOjo: 7, sqm: 21.3,
                                    transmision: 0.82, aumentos: 50 });
    ok(rms(Lotro, L457) === 0 || rms(Lotro, L457) < 1e-6,
      'y con 50× en vez de 150× (misma D) el lienzo no cambia por los aumentos');
    var despues = 0;
    for (k = 0; k < pC.datos.length; k += 13) if (isFinite(pC.datos[k])) despues += pC.datos[k];
    casi(despues, antes, 0, 'y tras pintar cuatro veces `parche.datos` sigue byte a byte igual');
  }

  console.log(fallos ? '\n' + fallos + ' FALLOS\n' : '\nTodo ok\n');
  process.exit(fallos ? 1 : 0);
}

var parches = {}, cadena = Promise.resolve();
OBJETOS.forEach(function (o) {
  cadena = cadena.then(function () {
    return B.bajar(o.ra, o.dec, LADO, PS1.salida).then(function (p) {
      parches[o.nombre] = p;
    }).catch(function (e) { console.error('  sin parche ' + o.nombre + ': ' + e.message); });
  });
});
cadena.then(function () { correr(parches); });
