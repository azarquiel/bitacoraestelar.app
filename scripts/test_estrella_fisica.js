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

/* ── 6. El suelo de una doble catalogada se recorta con el aumento ───────────
   El bug que fijó esto: el suelo de arriba (secciones 1-5) es UNO para toda
   estrella suelta, y a aumentos normales (no los extremos de la sección 2) es
   mucho mayor que el hueco en pantalla de un par bien resuelto, así que el
   dibujo se fundía en una mancha aunque el propio veredicto del simulador
   (resolucionDoble en bitacora-ocular.js) dijera "se resuelve cómodo". Detalle
   completo, con la aritmética y las fuentes de campo, en
   simulador_ocular/notas-separacion-dobles-dibujo.md.

   `radioEstrella` ahora acepta un `sep` (″) opcional: SOLO cuando viene (el
   objeto es una doble catalogada, ver bitacora-ocular.js:renderGaia2D) el
   suelo se recorta a una fracción del hueco en pantalla entre las dos
   componentes. Sin `sep` (cualquier otro campo o cúmulo) nada cambia: por eso
   las secciones 1-5 de arriba siguen pasando tal cual, sin tocarlas. */
console.log('\nEl suelo de una doble SÍ decrece con el aumento (radioEstrella con sep):');

function huecoConSep(eq, sepArcsec) {
  var r = R.radioEstrella({ arcmin: eq.arcmin, afov: eq.afov, apertura: eq.apertura, size: SIZE, sep: sepArcsec });
  var sepPx = (sepArcsec / 3600) * (SIZE / (eq.arcmin / 60));
  return (sepPx - 2 * r) * eq.diam / SIZE;   // px de PANTALLA; negativo = discos solapados
}

// Albireo (34,7″) con un 150 mm a 75×, el aumento con el que freestarcharts.com
// y eyesonthesky.com dicen que YA se separa con holgura: antes del recorte el
// dibujo apenas dejaba 0,1-0,2 px de hueco (una mancha alargada, no un split).
var albireo75 = equipo(150, 1500, 20, 68);   // 1500/20 = 75×
ok(huecoConSep(albireo75, 34.7) > 0.8,
  'Albireo a 75×/150mm: hueco en pantalla ' + huecoConSep(albireo75, 34.7).toFixed(2) + ' px (antes, sin recorte, ~0,2 px)');

// Sigue sin separar lo que de verdad no toca separar: a poco aumento (20×) el
// mismo par cabe en un campo tan ancho que 34,7″ son casi nada en pantalla; el
// recorte por sep no debe inventar un hueco que no hay.
var albireo20 = equipo(150, 1500, 75, 68);   // 1500/75 = 20×
ok(huecoConSep(albireo20, 34.7) < huecoConSep(albireo75, 34.7),
  'y a menos aumento (20×) el hueco es menor: ' + huecoConSep(albireo20, 34.7).toFixed(2) + ' px');

// Un par realmente apretado (Castor, 2,0″) sigue fundido: el recorte del suelo
// nunca gana al término FÍSICO (Airy+seeing), que es el que de verdad decide si
// el par se resuelve. El suelo solo deja de estorbar; no resuelve lo irresoluble.
var castor300 = equipo(200, 2000, 6.67, 50);   // ~300×, 2×/mm de un 200 mm
ok(huecoConSep(castor300, 2.0) < 0,
  'Castor a 300×/200mm sigue fundido (' + huecoConSep(castor300, 2.0).toFixed(2) + ' px): el recorte no inventa resolución');

// Sin `sep` (el resto de esta suite, campos y cúmulos) nada se mueve: mismo
// resultado con y sin el argumento cuando no hay doble de por medio.
casi(R.radioEstrella({ arcmin: albireo75.arcmin, afov: albireo75.afov, apertura: albireo75.apertura, size: SIZE }),
     R.radioEstrella({ arcmin: albireo75.arcmin, afov: albireo75.afov, apertura: albireo75.apertura, size: SIZE, sep: null }),
     1e-9, 'sin sep (o null), radioEstrella no cambia');

/* ── Sección 7: aureola de dispersión (glare) de estrellas resueltas muy
   brillantes (R.alfaAureola, bitacora-gaia-render.js) ── */
console.log('\n7. Aureola de dispersión: brillante = halo visible, tenue = puntual');

// Sirio/Vega (mag ~0): halo claramente visible pero nunca opaco (techo en
// aureolaAlfaMax, no en 1 -si no, se vería como un disco sólido-).
ok(R.alfaAureola(0) > 0.1 && R.alfaAureola(0) <= C.aureolaAlfaMax,
  'mag 0: alfaAureola=' + R.alfaAureola(0).toFixed(3) + ' (techo ' + C.aureolaAlfaMax + ')');

// Se apaga sola con la magnitud, sin corte duro: Albireo A (mag 3,1, primaria
// típica de doble) debe asomar ya un halo perceptible -no "casi nulo"-, y una
// estrella de campo típica (mag 10) no debe pintar nada.
ok(R.alfaAureola(3.1) > 0.08, 'mag 3,1 (Albireo A): alfaAureola=' + R.alfaAureola(3.1).toFixed(4) + ' (perceptible)');
ok(R.alfaAureola(10) < 0.004, 'mag 10: alfaAureola=' + R.alfaAureola(10).toFixed(6) + ' (por debajo del umbral de dibujo)');

// Monótona decreciente con la magnitud (más tenue ⇒ menos halo, sin saltos).
ok(R.alfaAureola(0) > R.alfaAureola(2) && R.alfaAureola(2) > R.alfaAureola(5),
  'monótona: mag 0 > mag 2 > mag 5');

// La aureola representa luz dispersada: más apertura recoge más luz (∝ D²), así
// que la MISMA estrella debe asomar más halo en un 18" que en un 6".
ok(R.alfaAureola(3.1, 457) > R.alfaAureola(3.1, 152),
  'Albireo A: más aureola en un 18" (' + R.alfaAureola(3.1, 457).toFixed(3) +
  ') que en un 6" (' + R.alfaAureola(3.1, 152).toFixed(3) + ')');
ok(Math.abs(R.alfaAureola(3.1) - R.alfaAureola(3.1, 200)) < 1e-9,
  'sin apertura, se asume la de referencia (200 mm): mismo resultado');

/* ── Sección 8: el suelo SÍ escala con la magnitud (radioEstrella con `g`) ────
   Sección 1-6 (sin `g`) siguen intactas: por defecto delta=0, mismo suelo de
   siempre. Con `g`, una estrella brillante debe dibujarse más gorda que una en
   el límite -sin que eso reabra el bug de los pares, que sigue protegido por
   `sep` (sección 6), independiente de cómo se calcule este suelo base. */
console.log('\n8. El suelo de estrella suelta SÍ escala con magnitud (radioEstrella con g):');
var campoTipico = equipo(200, 1200, 9, 100);
function radioConMag(eq, g) {
  return R.radioEstrella({ arcmin: eq.arcmin, afov: eq.afov, apertura: eq.apertura, size: SIZE, g: g }) * eq.diam / SIZE;
}
ok(radioConMag(campoTipico, 3) > radioConMag(campoTipico, 13),
  'mag 3 (' + radioConMag(campoTipico, 3).toFixed(2) + ' px) más gorda que mag 13 (' + radioConMag(campoTipico, 13).toFixed(2) + ' px)');
casi(radioConMag(campoTipico, 25), radioPantalla(campoTipico), 1e-3,
  'muy tenue (mag 25) converge al suelo puro sin g (flujo relativo ≈ 0)');

/* ── Sección 9: el suelo escala con el FLUJO ABSOLUTO, no con mlim ───────────
   Bug real (probado y descartado): un suelo relativo a mlim (mlim - margen)
   hacía que con un equipo SOMERO (mlim bajo) casi todo el campo quedara a
   pocas magnitudes de SU límite y "engordara" en bloque -no solo las pocas
   estrellas realmente brillantes-. Con flujo absoluto (misma fórmula que
   alfaAureola: factorApertura·10^-0,4g), el tamaño de una estrella dada de
   magnitud fija NO depende de qué tan profundo llegue el equipo (mlim), solo
   de su brillo real y de la apertura -que sí debe importar: un 18" recoge
   más fotones que un 6" y muestra la MISMA estrella más gorda-. */
console.log('\n9. El suelo depende del flujo absoluto (magnitud + apertura), no de mlim:');
function radioMag(apertura, g, mlim) {
  return R.radioEstrella({ arcmin: 60, afov: 60, size: SIZE, apertura: apertura, g: g, mlim: mlim });
}
casi(radioMag(300, 8, 11), radioMag(300, 8, 18), 1e-9,
  'la misma estrella (mag 8, 300 mm) sale igual con mlim=11 que con mlim=18: mlim ya no interviene en el tamaño');
ok(radioMag(457, 6, 15) > radioMag(152, 6, 15),
  'la MISMA estrella (mag 6) sale más gorda en un 18" (' + radioMag(457, 6, 15).toFixed(2) +
  ' px) que en un 6" (' + radioMag(152, 6, 15).toFixed(2) + ' px): más apertura, más fotones');

/* ── Sección 10: dilución de brillo al sobre-aumentar (conservación de flujo) ─
   Pasado el punto en que el disco físico (Airy+seeing) supera al suelo
   artístico, más aumento no trae más luz: los mismos fotones se reparten en
   un disco mayor. `factorDilucion(suelo, Rtot)` diluye el alpha de pico por
   (suelo/Rtot)² -exacto para este perfil autosimilar, ver dibujarEstrellaColor-
   en cuanto Rtot supera a suelo·√2 (equivale a fisico > suelo). */
console.log('\n10. Sobre-aumentar diluye el brillo de pico (conservación de flujo):');
var eqPoco = equipo(200, 1200, 25, 60);   // aumento bajo: fisico <= suelo
var oPoco = { arcmin: eqPoco.arcmin, afov: eqPoco.afov, apertura: eqPoco.apertura, size: SIZE, g: 8 };
var sueloPoco = R.sueloEstrella(oPoco), RtotPoco = R.radioEstrella(oPoco);
ok(R.factorDilucion(sueloPoco, RtotPoco) === 1,
  'a poco aumento (suelo=' + sueloPoco.toFixed(2) + ', Rtot=' + RtotPoco.toFixed(2) + '), sin dilución');

var eqMucho = equipo(60, 3000, 1, 60);    // aumento extremo: fisico >> suelo
var oMucho = { arcmin: eqMucho.arcmin, afov: eqMucho.afov, apertura: eqMucho.apertura, size: SIZE, g: 8 };
var sueloMucho = R.sueloEstrella(oMucho), RtotMucho = R.radioEstrella(oMucho);
var dilMucho = R.factorDilucion(sueloMucho, RtotMucho);
ok(dilMucho < 1, 'a mucho aumento (Rtot=' + RtotMucho.toFixed(2) + ' px), factorDilucion=' + dilMucho.toFixed(4) + ' < 1');
casi(dilMucho * RtotMucho * RtotMucho, sueloMucho * sueloMucho, 1e-6,
  'diluido, alfa_pico·Rtot² = suelo² (conserva el flujo total, no crece con el aumento)');


/* ── Sección 11: cuánto puede engordar una brillante sobre una débil ─────────
   El engorde por magnitud (radioSueloMag/radioSueloMax) es convención de atlas,
   no física: el disco real (Airy+seeing) es el mismo para todas las estrellas
   del campo. Sirve para que el brillo se lea de un vistazo, pero pasado cierto
   punto las brillantes salen como bolas y el campo pierde el aire de estrella
   puntual. Este techo acota ESA convención sin tocar el término físico:

     · una brillante saturada (mag 2) no pasa de 3,0× el radio de una del
       límite (mag 13) en un campo típico;
     · la débil no se toca: el recorte es solo del extremo brillante, así que
       una mag 13 sigue pegada al suelo puro sin magnitud. */
console.log('\n11. Techo del engorde por magnitud (convención, no física):');
var TECHO_ENGORDE = 3.0;
var brillante = radioConMag(campoTipico, 2), debil = radioConMag(campoTipico, 13);
ok(brillante / debil <= TECHO_ENGORDE,
  'mag 2 (' + brillante.toFixed(2) + ' px) frente a mag 13 (' + debil.toFixed(2) +
  ' px): ' + (brillante / debil).toFixed(2) + '× ≤ ' + TECHO_ENGORDE.toFixed(1) + '×');
ok(debil <= radioPantalla(campoTipico) * 1.08,
  'la mag 13 sigue en el suelo puro (' + debil.toFixed(2) + ' px vs ' +
  radioPantalla(campoTipico).toFixed(2) + ' px sin magnitud): el recorte es solo del extremo brillante');
console.log('\n' + (fallos === 0 ? '✓ Todo correcto.' : '✗ ' + fallos + ' fallo(s).'));
process.exit(fallos === 0 ? 0 : 1);
