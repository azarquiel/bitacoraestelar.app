/* Estimación del flujo que el TOP 40000 quita hoy a un campo saturado (M7, rad 0,89°).
 *
 * Anclas MEDIDAS (E1/E4 y memoria del 2026-08-17):
 *   N(G≤15,18) = 40 000   (corte del TOP en M7)
 *   N(G≤20)    = 2,76 M   (filas que el TAP ordenaba a profundidad completa)
 *   Escalera E4 (celda n6 de M7): 29 703@G16 → 160 749@G18 (valida la pendiente)
 *
 * Modelo: log10 N(<m) lineal en m (ley de conteos), pendiente s de las anclas.
 * Flujo de la banda [m1,m2]: F = ∫ (dN/dm)·10^(-0,4·m) dm, en unidades de una
 * estrella G=0. Se reparte en:
 *   - banda RESUELTA perdida: corte → mlim físico (estrellas que se dibujarían)
 *   - banda de GLOW perdida:  mlim → mlim + cola (2,30 mag, glowCorte/alfaMin)
 * y se expresa como brillo superficial medio sobre el campo, comparable al cielo.
 */
'use strict';

const RAD = 0.89;                       // °
const AREA_ARCSEC2 = Math.PI * RAD * RAD * 3600 * 3600;
const COLA_GLOW = 2.30;                 // mag: -2,5·log10(glowCorte/alfaMin)

// M7: mlim físico a pocos aumentos (66×, cielo oscuro) ≈ 17,0; la consulta pedía 19,6.
const CASOS = [
  { nombre: 'M7 (bulbo)', corte: 15.18, mlim: 17.0, anclas: [[15.18, 40000], [20, 2.76e6]] },
  // M6: corte 17,42 (E1); total a G=20 estimado de las celdas E4 a G18 (281k filas en
  // 8 celdas, fracción de círculo ~0,37) extrapolado con la pendiente propia del plano.
  { nombre: 'M6 (plano)', corte: 17.42, mlim: 17.0, anclas: [[17.42, 40000], [18.0, 104000]] },
];

const flujo = (m) => 10 ** (-0.4 * m);

function estima({ nombre, corte, mlim, anclas }) {
  const [[m1, n1], [m2, n2]] = anclas;
  const s = Math.log10(n2 / n1) / (m2 - m1);   // dex/mag
  const N = (m) => n1 * 10 ** (s * (m - m1));
  // F de una banda por integración fina (el integrando es casi plano si s≈0,4).
  const F = (a, b) => {
    let f = 0;
    for (let m = a; m < b; m += 0.01) f += (N(m + 0.01) - N(m)) * flujo(m + 0.005);
    return f;
  };
  const bandaResuelta = corte < mlim ? F(corte, mlim) : 0;
  const bandaGlow = F(Math.max(corte, mlim), mlim + COLA_GLOW);
  const sb = (f) => (f > 0 ? -2.5 * Math.log10(f / AREA_ARCSEC2) : Infinity);
  const magInt = (f) => (f > 0 ? -2.5 * Math.log10(f) : Infinity);

  console.log(`\n${nombre} — pendiente medida s=${s.toFixed(3)} dex/mag`);
  console.log(`  corte del TOP: G=${corte} | mlim físico: G=${mlim} | cola de glow: +${COLA_GLOW}`);
  if (bandaResuelta > 0) {
    console.log(`  banda RESUELTA perdida (${corte}→${mlim}): ${Math.round(N(mlim) - N(corte)).toLocaleString()} estrellas` +
      ` | mag integrada ${magInt(bandaResuelta).toFixed(2)} | SB media ${sb(bandaResuelta).toFixed(1)} mag/arcsec²`);
  } else {
    console.log(`  banda resuelta: intacta (el corte ${corte} ≥ mlim ${mlim})`);
  }
  console.log(`  banda de GLOW perdida (${Math.max(corte, mlim).toFixed(2)}→${(mlim + COLA_GLOW).toFixed(2)}):` +
    ` ${Math.round(N(mlim + COLA_GLOW) - N(Math.max(corte, mlim))).toLocaleString()} estrellas` +
    ` | mag integrada ${magInt(bandaGlow).toFixed(2)} | SB media ${sb(bandaGlow).toFixed(1)} mag/arcsec²`);
  const total = bandaResuelta + bandaGlow;
  console.log(`  TOTAL perdido: mag integrada ${magInt(total).toFixed(2)} | SB media ${sb(total).toFixed(1)} mag/arcsec²` +
    ` (cielo oscuro ≈ 21,9; suelo de detección H2c ≈ 27)`);
  return { s, sbTotal: sb(total) };
}

console.log(`Área del campo: ${(AREA_ARCSEC2 / 1e6).toFixed(1)} M arcsec² (rad ${RAD}°)`);
for (const c of CASOS) estima(c);

// Contraste con la escalera E4 (celda n6 de M7): pendiente independiente.
const sEscalera = Math.log10(160749 / 29703) / 2;
console.log(`\nContraste: pendiente de la escalera E4 (celda M7, G16→18) = ${sEscalera.toFixed(3)} dex/mag`);
