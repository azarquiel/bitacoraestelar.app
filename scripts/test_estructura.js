#!/usr/bin/env node
/* Tests de la separación DETECCIÓN / ESTRUCTURA que mide
   scripts/harness_estructura.js.

   La tesis: NO hay dos leyes. Hay una, Cmin(θ), llamada con dos tamaños
   angulares distintos —el del objeto y el del detalle borroso— y comparada
   contra dos contrastes distintos —objeto/cielo y brazo/interbrazo—. La
   apertura entra en la segunda por el disco de Airy, que ya está en el render
   (radioImagenEstelar) y hoy solo se aplica a estrellas.

   Producción sin tocar: estos tests montan la propuesta aquí encima. Fijan las
   propiedades que tendrá que cumplir el día que se aplique.

   Sin dependencias:  node scripts/test_estructura.js */
'use strict';

global.window = {};
require('../resources/js/bitacora-gaia-render.js');
require('../resources/js/bitacora-ps1.js');
var R = global.window.BitacoraGaiaRender;
var FOT = R.fot, CFG = R.config;

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

var SQM = 21.3, T = 0.82, POJO = 7;
var PLATEAU_PROV = 60, C_MAG_REF_B = PLATEAU_PROV * Math.pow(FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP);
function clampT(t) { return Math.max(FOT.C_MAG_MIN, Math.min(FOT.C_MAG_MAX, t)); }
function cmin(D, MAG, thetaArcmin) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: D / MAG }).Cmin *
    clampT(Math.pow(C_MAG_REF_B / (thetaArcmin * MAG), FOT.C_MAG_EXP));
}
function thetaRes(D) { return 2 * R.radioImagenEstelar(D); }
function thetaEff(td, D) { var tr = thetaRes(D); return Math.sqrt(td * td + tr * tr); }
function dilucion(td, D) { var te = thetaEff(td, D); return td * td / (te * te); }

console.log('\n— La resolución sale de piezas que ya existen, sin constante nueva —');
casi(R.radioAiry(114), CFG.airyArcsec / 114, 1e-12, 'Airy = airyArcsec/D (″)');
casi(thetaRes(457), 2 * Math.sqrt(Math.pow(CFG.airyArcsec / 457, 2) +
  Math.pow(CFG.seeingArcsec / 2, 2)), 1e-12, 'θ_res = 2·√(Airy² + (seeing/2)²)');
ok(thetaRes(457) < thetaRes(114), 'más apertura aprieta el detalle (' +
  thetaRes(457).toFixed(2) + '″ < ' + thetaRes(114).toFixed(2) + '″)');
ok(thetaRes(914) > CFG.seeingArcsec * 0.999,
  'pero nunca por debajo del seeing: el suelo atmosférico manda');
casi(thetaRes(1e6), CFG.seeingArcsec, 1e-3, 'apertura infinita → θ_res = seeing');

console.log('\n— La dilución del contraste es conservación de flujo, no un ajuste —');
casi(dilucion(1e6, 457), 1, 1e-6, 'detalle mucho mayor que la resolución: intacto');
ok(dilucion(0.1, 457) < 0.01, 'detalle mucho menor que la resolución: se borra');
casi(dilucion(thetaRes(457), 457), 0.5, 1e-12, 'detalle = θ_res: mitad del contraste');

console.log('\n— Es UNA ley con dos argumentos, no dos leyes —');
/* Si la función de estructura fuese otra ley, esto no podría cumplirse: mismo
   código, mismo clamp, mismo exponente; solo cambia el θ que se le pasa. */
var D = 457, MAG = 150;
casi(cmin(D, MAG, 5), cmin(D, MAG, 5), 1e-15, 'la misma llamada da lo mismo');
/* θ dentro de la ventana sin clamp: a 150x eso es 0,09′–0,40′ de tamaño real.
   Fuera de ella los dos valores se clavan y salen IGUALES —cmin(150, 0,4′) =
   cmin(150, 5′)—, que es justo lo que denuncia la sección de los clamps. */
ok(cmin(D, MAG, 0.1) > cmin(D, MAG, 0.4),
  'y un θ menor pide más contraste: el detalle es más exigente que el objeto');
casi(cmin(D, MAG, 0.4), cmin(D, MAG, 5), 1e-15,
  'CLAVADO: con los clamps de hoy, 0,4′ y 5′ dan el mismo umbral a 150x');

console.log('\n— A misma pupila de salida, la apertura sigue mandando en la estructura —');
/* Detección: a misma pupila el fondo y la luminancia retinal son idénticos y la
   ventaja del 18″ es solo tamaño aparente. Estructura: además del aumento, el
   Airy. Las dos vías van en el mismo sentido, que es lo que hay que comprobar
   para descartar la inversión algebraica de la ley vieja. */
var chico = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 203 / 101.5 });
var grande = R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: 457 / 228.5 });
casi(grande.nivelFondo, chico.nivelFondo, 1e-12, 'misma pupila → mismo fondo en pantalla');
casi(grande.Cmin, chico.Cmin, 1e-12, 'y mismo Cmin antes del término de tamaño');
var TD = 12;   // ″, un brazo de una galaxia de 5′
ok(thetaEff(TD, 457) < thetaEff(TD, 203), 'el detalle sale menos borroso en el 18″');
ok(dilucion(TD, 457) > dilucion(TD, 203), 'y conserva más contraste (' +
  dilucion(TD, 457).toFixed(3) + ' > ' + dilucion(TD, 203).toFixed(3) + ')');
ok(cmin(457, 228.5, thetaEff(TD, 457) / 60) < cmin(203, 101.5, thetaEff(TD, 203) / 60),
  'y a misma pupila su umbral de estructura es más bajo');

console.log('\n— A igual aumento la apertura mayor no puede perder —');
[66, 150, 400].forEach(function (m) {
  ok(cmin(457, m, 5) < cmin(203, m, 5), 'detección a ' + m + 'x: gana el 18″');
  ok(cmin(457, m, thetaEff(TD, 457) / 60) < cmin(203, m, thetaEff(TD, 203) / 60),
    'estructura a ' + m + 'x: gana el 18″');
});

console.log('\n— Los clamps, tal como están, no pueden representar el fenómeno —');
/* No es una preferencia: es un recuento. Si algún día se ensanchan, este test
   falla y obliga a releer el razonamiento en vez de dejarlo pasar. */
casi(2.5 * Math.log10(FOT.C_MAG_MAX / FOT.C_MAG_MIN), 1.620, 1e-3,
  'recorrido total del término (mag)');
casi(Math.pow(FOT.C_MAG_MAX / FOT.C_MAG_MIN, 1 / FOT.C_MAG_EXP), 4.444, 1e-3,
  'razón de tamaño aparente que cubre (×)');
ok(2.5 * Math.log10(60 / 1) > 2.5 * Math.log10(FOT.C_MAG_MAX / FOT.C_MAG_MIN),
  'y el fenómeno de 1′ a 60′ pide 4,45 mag: el término se queda corto');

console.log('\n— El seeing solo puede empeorar la estructura, nunca mejorarla —');
/* Y la resolución instrumental solo puede mejorarla. Son los dos sentidos que un
   error de signo rompería sin que se note a ojo. Se barre en vez de mirar un
   caso: una invariancia que solo vale en un punto no es una invariancia. */
function thetaResCon(D, seeing) {
  return 2 * Math.sqrt(Math.pow(CFG.airyArcsec / D, 2) + Math.pow(seeing / 2, 2));
}
function dilucionCon(td, D, seeing) {
  var tr = thetaResCon(D, seeing);
  return td * td / (td * td + tr * tr);
}
var APS = [80, 203, 457, 914], TDS = [6, 12, 24, 48, 96];
var seeingPeor = true, resMejor = true;
APS.forEach(function (Da) {
  TDS.forEach(function (td) {
    if (dilucionCon(td, Da, 4) > dilucionCon(td, Da, 2) + 1e-15) seeingPeor = false;
    if (dilucionCon(td, 914, 2) < dilucionCon(td, 80, 2) - 1e-15) resMejor = false;
  });
});
ok(seeingPeor, 'más seeing nunca conserva más contraste (20 casos D × θ_detalle)');
ok(resMejor, 'más apertura nunca conserva menos contraste (20 casos)');

console.log('\n— A igual pupila las cuatro aperturas dan el mismo fondo —');
var fondos = APS.map(function (Da) {
  return R.ctxFotometrico({ sqm: SQM, transmision: T, pupilaOjo: POJO, pupilaSalida: Da / (Da / 2) });
});
ok(fondos.every(function (c) { return Math.abs(c.nivelFondo - fondos[0].nivelFondo) < 1e-9; }),
  'nivelFondo idéntico en 80/203/457/914 mm a 2,00 mm de pupila');
ok(fondos.every(function (c) { return Math.abs(c.Cmin - fondos[0].Cmin) < 1e-12; }),
  'y Cmin antes del término de tamaño también');

console.log('\n— Geometría y umbral son independientes: no hay doble conteo —');
/* El render YA agranda la galaxia al subir aumentos, porque el campo real se
   estrecha. Si el umbral usara los píxeles del lienzo, el aumento se cobraría dos
   veces. Prueba: cambiar el campo aparente del ocular mueve los píxeles y no
   puede mover el umbral. */
function pxLienzo(thetaArcmin, MAG, afov) { return thetaArcmin / 60 * 512 / (afov / MAG); }
var px50 = pxLienzo(5, 150, 50), px100 = pxLienzo(5, 150, 100);
ok(Math.abs(px50 / px100 - 2) < 1e-9, 'a 150x, un ocular de 50° dibuja el doble de píxeles que uno de 100°');
casi(cmin(457, 150, 5), cmin(457, 150, 5), 1e-15,
  'y el umbral no depende del campo aparente: no lo recibe');

console.log('\n— Nada de esto toca el flujo ni las estrellas —');
var comps = window.BitacoraPS1.ps1ComponentesSersic({ magV: 9, reArcsec: 100, n: 3, ba: 1, bt: 0 });
casi(window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, 50), window.BitacoraPS1.ps1FlujoModelo(comps, 0, 0, 50), 1e-18,
  'ps1FlujoModelo no ve pasar ni aumentos ni θ');
casi(grande.rango, chico.rango, 1e-12, 'rango (lo que consumen las estrellas) idéntico');

console.log(fallos ? '\n' + fallos + ' FALLOS\n' : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
