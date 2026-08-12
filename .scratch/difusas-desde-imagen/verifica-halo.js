/* Verificación end-to-end de la exención: ps1PintarParche marca la máscara y la
   cadena de pintarFot (visibilidadDifusa + realce) la respeta. Sin canvas. */
'use strict';
global.window = {};
require('/Users/isra/Documents/Código/bitacoraestelar/.claude/worktrees/difusas-desde-imagen/resources/js/bitacora-gaia-render.js');
var R = global.window.BitacoraGaiaRender, PS1 = R.ps1;

var M101 = { nombre: 'M101', ra: 210.80208, dec: 54.34861, reArcsec: 379.23, ba: 0.933,
             pa: 0, magV: 7.76, n: 1, bt: 0.08, nMedido: 1.31 };
var SIZE = 400, ARCMIN = 60;            // campo de 1° a 400 px

function pinta(pupila, conMascara) {
  var cielo = { pupilaSalida: pupila, sqm: 21, aumentos: 100, perceptual: true,
                realceMax: PS1.realceMax };
  var comps = R.ps1ComponentesSersic(M101);
  var difuso = new Float32Array(SIZE * SIZE);
  // Parche de imagen VACÍO: todo el dibujo sale del perfil extrapolado.
  var lado = M101.reArcsec * 6 / 60;
  R.ps1PintarParche(difuso, {
    datos: new Float32Array(64 * 64), ancho: 64, alto: 64, ladoArcmin: Math.min(20, lado),
    ra: M101.ra, dec: M101.dec, comps: comps, pa: M101.pa,
    halo: R.ps1MedidasHalo(M101, comps)
  }, { ra0: M101.ra, dec0: M101.dec, arcmin: ARCMIN, size: SIZE, cielo: cielo });

  var c = R.ctxFotometrico(cielo);
  var mask = conMascara ? cielo.haloMask : null;
  var pxPorAs = (SIZE / (ARCMIN / 60)) / 3600, cx = SIZE / 2, cy = SIZE / 2;
  return [0.5, 1, 1.5, 2].map(function (k) {
    var x = Math.round(cx + k * M101.reArcsec * pxPorAs), i = Math.round(cy) * SIZE + x;
    var F = difuso[i];
    if (!(F > 0)) return k + 're:0.0';
    var s = R.visibilidadDifusa(F, c.Fcielo * c.Cmin, true);
    if (!(s > 0)) return k + 're:0.0';
    var techo = (mask && mask[i]) ? 0 : cielo.realceMax;
    var dn = R.valorDeFlujo(R.realzarPerceptual(F * s, c.Fcielo, c.rango, s, techo), c.Fcielo, c.rango);
    return k + 're:' + dn.toFixed(1) + (mask && mask[i] ? '*' : '');
  }).join('  ');
}

console.log('M101, parche sin imagen, delta-DN sobre el cielo (* = exento del techo)');
[2, 3, 4].forEach(function (p) {
  console.log('  pupila ' + p + 'mm  con techo en todo: ' + pinta(p, false));
  console.log('             con la exencion: ' + pinta(p, true));
});

/* El cuello que queda: visibilidadDifusa vuelve a filtrar un flujo que la rampa
   YA atenuó. Variante F: para el halo, la rampa es el ÚNICO desvanecido —no se
   multiplica por s— y el realce va con gamma completa y sin techo. */
console.log('\nVariante F (la rampa manda sola en el halo):');
function pintaF(pupila) {
  var cielo = { pupilaSalida: pupila, sqm: 21, aumentos: 100, perceptual: true, realceMax: PS1.realceMax };
  var comps = R.ps1ComponentesSersic(M101);
  var difuso = new Float32Array(SIZE * SIZE);
  R.ps1PintarParche(difuso, {
    datos: new Float32Array(64 * 64), ancho: 64, alto: 64,
    ladoArcmin: Math.min(20, M101.reArcsec * 6 / 60),
    ra: M101.ra, dec: M101.dec, comps: comps, pa: M101.pa, halo: R.ps1MedidasHalo(M101, comps)
  }, { ra0: M101.ra, dec0: M101.dec, arcmin: ARCMIN, size: SIZE, cielo: cielo });
  var c = R.ctxFotometrico(cielo), mask = cielo.haloMask;
  var pxPorAs = (SIZE / (ARCMIN / 60)) / 3600;
  return [0.5, 1, 1.5, 2, 2.5].map(function (k) {
    var x = Math.round(SIZE / 2 + k * M101.reArcsec * pxPorAs), i = Math.round(SIZE / 2) * SIZE + x;
    var F = difuso[i];
    if (!(F > 0) || !mask[i]) return k + 're:0.0';
    var dn = R.valorDeFlujo(R.realzarPerceptual(F, c.Fcielo, c.rango, 0, 0), c.Fcielo, c.rango);
    return k + 're:' + dn.toFixed(1);
  }).join('  ');
}
[1, 2, 3, 4, 5].forEach(function (p) { console.log('  pupila ' + p + 'mm  ' + pintaF(p)); });
