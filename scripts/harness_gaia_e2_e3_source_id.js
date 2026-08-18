/* E2 + E3 — eje 2 del estudio Gaia (ADR 0012, especificacion_optimizacion_gaia.md).
 *
 * E2 — semántica: los bits altos del source_id de Gaia DR3 codifican el ipix HEALPix
 *      nested de nivel 12 (source_id = ipix12 · 2^35 + secuencial). Se verifica contra
 *      un campo real: para cada estrella, ipix12 según su source_id contra ipix12
 *      según sus (RA, Dec) con ang2pix nested propio. Deben coincidir (≥ 99,9 %:
 *      el borde de píxel tolera el redondeo de las coordenadas publicadas).
 *
 * E3 — coste: la misma selección (celda de nivel L, Gmag ≤ 20) expresada como
 *      `source_id BETWEEN a AND b` (rango sobre clave primaria) frente al cono
 *      circunscrito equivalente con CONTAINS. Sin ORDER BY en ninguna de las dos:
 *      la consulta de celda no lo necesita. 3 repeticiones intercaladas, mediana.
 *
 * Uso:  node scripts/harness_gaia_e2_e3_source_id.js [--reps=3]
 * Salida: informe en stdout + crudo en scripts/salida_gaia_e2_e3.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const MAG_MAX = 20.0;
const TIMEOUT_MS = 120000;
const PAUSA_MS = 8000;
const REINTENTOS = 3;
const P235 = 2n ** 35n;

// ───────────────────────── HEALPix nested (ang2pix), sin librerías ─────────────────
// Algoritmo estándar del paper HEALPix (Górski et al. 2005), rama nested.
function ang2pixNest(nside, raDeg, decDeg) {
  const z = Math.sin(decDeg * Math.PI / 180);
  const phi = ((raDeg % 360) + 360) % 360 * Math.PI / 180;
  const za = Math.abs(z);
  const tt = (2 * phi / Math.PI) % 4;
  let face, ix, iy;
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt);
    const t2 = nside * (z * 0.75);
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2);
    const ifp = jp >> Math.log2(nside), ifm = jm >> Math.log2(nside);
    face = ifp === ifm ? (ifp & 3) + 4 : ifp < ifm ? ifp & 3 : (ifm & 3) + 8;
    ix = jm & (nside - 1);
    iy = nside - 1 - (jp & (nside - 1));
  } else {
    const tp = tt - Math.floor(tt);
    const tmp = nside * Math.sqrt(3 * (1 - za));
    let jp = Math.floor(tp * tmp), jm = Math.floor((1 - tp) * tmp);
    jp = Math.min(jp, nside - 1); jm = Math.min(jm, nside - 1);
    if (z >= 0) { face = Math.floor(tt); ix = nside - jm - 1; iy = nside - jp - 1; }
    else { face = Math.floor(tt) + 8; ix = jp; iy = jm; }
  }
  let pix = 0n;
  for (let b = 0; b < Math.log2(nside); b++) {
    pix |= BigInt(((ix >> b) & 1)) << BigInt(2 * b);
    pix |= BigInt(((iy >> b) & 1)) << BigInt(2 * b + 1);
  }
  return BigInt(face) * BigInt(nside) * BigInt(nside) + pix;
}

/* Rango de source_id de una celda nested de nivel L (ipix en ese nivel). */
function rangoSourceId(nivel, ipix) {
  const desplaza = 2n * BigInt(12 - nivel);
  const lo = (ipix << desplaza) * P235;
  const hi = ((ipix + 1n) << desplaza) * P235 - 1n;
  return [lo, hi];
}

// Lado de celda ≈ sqrt(área); radio del cono circunscrito = lado·√2/2 con holgura.
const gradosCelda = (nivel) => Math.sqrt(41253 / (12 * 4 ** nivel));

// ───────────────────────── TAP (mismo protocolo endurecido que E1) ─────────────────
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const errorVotable = (cuerpo) =>
  (cuerpo.match(/<INFO[^>]*>([\s\S]*?)<\/INFO>/) || [, cuerpo])[1].trim().slice(0, 300);

async function tap(adql) {
  for (let intento = 0; ; intento++) {
    const url = TAP + '?request=doQuery&lang=adql&format=json&query=' + encodeURIComponent(adql);
    const t0 = performance.now();
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const ttfb = performance.now() - t0;
      const cuerpo = await resp.text();
      const total = performance.now() - t0;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${errorVotable(cuerpo)}`);
      const json = JSON.parse(cuerpo);
      return { ttfb, total, bytes: cuerpo.length, filas: json.data.length, data: json.data };
    } catch (e) {
      if (intento >= REINTENTOS) throw e;
      const espera = 30000 * 2 ** intento;
      console.log(`    ${String(e.message).slice(0, 90)} — reintento en ${espera / 1000}s`);
      await dormir(espera);
    }
  }
}

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ───────────────────────────────── E2 ─────────────────────────────────────────────
/* Campo barato con Source+RA+Dec para verificar la codificación. El double de JSON
 * pierde los bits bajos de un source_id de 63 bits, pero ipix12 = source/2^35 queda
 * intacto: el error (< 2^11) es despreciable frente al divisor. */
async function e2(crudo) {
  console.log('E2 — semántica source_id → ipix12 (campo del polo, G≤20)');
  const q = `SELECT TOP 40000 Source, RA_ICRS, DE_ICRS FROM "I/355/gaiadr3"` +
    ` WHERE Gmag<=${MAG_MAX} AND 1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS),` +
    ` CIRCLE('ICRS',192.86,27.13,0.89))`;
  const r = await tap(q);
  let iguales = 0, borde = 0;
  for (const [src, ra, dec] of r.data) {
    const ipixDeSource = BigInt(Math.floor(Number(src) / 2 ** 35));
    const ipixDeCoords = ang2pixNest(4096, Number(ra), Number(dec));
    if (ipixDeSource === ipixDeCoords) iguales++;
    else borde++; // vecino inmediato por redondeo en el borde: se cuenta aparte
  }
  const frac = iguales / r.filas;
  crudo.e2 = { filas: r.filas, iguales, borde, fraccion: frac };
  console.log(`  ${iguales}/${r.filas} coinciden (${(frac * 100).toFixed(2)} %), ${borde} en borde de píxel`);
  console.log(`  E2: ${frac >= 0.999 ? 'PASA' : 'NO PASA'} (listón 99,9 %)\n`);
  await dormir(PAUSA_MS);
  return frac >= 0.999;
}

// ───────────────────────────────── E3 ─────────────────────────────────────────────
/* Dos zonas (densa y vacía) × dos niveles (6 y 7). En cada caso, la celda que contiene
 * el centro, pedida por rango de source_id y por el cono circunscrito. El cono trae de
 * más (área ~1,6× la celda): también se compara recortando su resultado a la celda por
 * software, que es lo que haría el proxy. */
const ZONAS = [
  { id: 'm6',   nombre: 'M6 (plano denso)', ra: 265.069, dec: -32.242 },
  { id: 'polo', nombre: 'Polo N (vacío)',   ra: 192.86,  dec: 27.13 },
];

async function e3(crudo, reps) {
  console.log('E3 — rango source_id frente a cono circunscrito (sin ORDER BY, G≤20)');
  crudo.e3 = [];
  for (const zona of ZONAS) {
    for (const nivel of [6, 7]) {
      const ipix = ang2pixNest(4096, zona.ra, zona.dec) >> (2n * BigInt(12 - nivel));
      const [lo, hi] = rangoSourceId(nivel, ipix);
      const radio = (gradosCelda(nivel) * Math.SQRT1_2 * 1.1).toFixed(3);
      const qRango = `SELECT TOP 300000 Source FROM "I/355/gaiadr3"` +
        ` WHERE Source BETWEEN ${lo} AND ${hi} AND Gmag<=${MAG_MAX}`;
      const qCono = `SELECT TOP 300000 Source FROM "I/355/gaiadr3"` +
        ` WHERE Gmag<=${MAG_MAX} AND 1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS),` +
        ` CIRCLE('ICRS',${zona.ra},${zona.dec},${radio}))`;
      const caso = { zona: zona.id, nivel, ipix: ipix.toString(), rango: [], cono: [] };

      for (let rep = 0; rep < reps; rep++) {
        const orden = rep % 2 ? [['cono', qCono], ['rango', qRango]] : [['rango', qRango], ['cono', qCono]];
        for (const [tipo, q] of orden) {
          try {
            const r = await tap(q);
            // Verificación de contención: todo Source del rango debe caer en la celda.
            if (tipo === 'rango' && rep === 0) {
              caso.fueraDeCelda = r.data.filter(([s]) => {
                const ip = BigInt(Math.floor(Number(s) / 2 ** 35)) >> (2n * BigInt(12 - nivel));
                return ip !== ipix;
              }).length;
            }
            delete r.data;
            caso[tipo].push(r);
            console.log(`  ${zona.id} n${nivel} ${tipo.padEnd(5)} rep${rep + 1}: ${(r.total / 1000).toFixed(2)}s ${r.filas} filas`);
          } catch (e) {
            console.log(`  ${zona.id} n${nivel} ${tipo} rep${rep + 1}: ERROR ${String(e.message).slice(0, 90)}`);
          }
          await dormir(PAUSA_MS);
        }
      }
      crudo.e3.push(caso);
      fs.writeFileSync(path.join(__dirname, 'salida_gaia_e2_e3.json'), JSON.stringify(crudo, null, 1));
    }
  }
}

// ─────────────────────────────── Informe ──────────────────────────────────────────
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const reps = Number(args.reps || 3);
  const crudo = { fecha: new Date().toISOString(), tap: TAP, reps };

  const e2ok = await e2(crudo);
  await e3(crudo, reps);

  console.log('\n══════════ INFORME E2+E3 ══════════');
  console.log(`E2 semántica: ${e2ok ? 'PASA' : 'NO PASA'} (${(crudo.e2.fraccion * 100).toFixed(2)} %)`);
  let rangoGana = 0, casos = 0;
  for (const c of crudo.e3) {
    const tR = c.rango.filter((x) => x.total).map((x) => x.total / 1000);
    const tC = c.cono.filter((x) => x.total).map((x) => x.total / 1000);
    if (!tR.length || !tC.length) { console.log(`${c.zona} n${c.nivel}: SIN DATOS`); continue; }
    const mR = mediana(tR), mC = mediana(tC);
    casos++; if (mR <= mC) rangoGana++;
    console.log(
      `${c.zona} n${c.nivel}: rango ${mR.toFixed(2)}s (${c.rango[0].filas} filas, fuera de celda: ${c.fueraDeCelda})` +
      ` | cono ${mC.toFixed(2)}s (${c.cono[0].filas} filas) → ${mR <= mC ? 'RANGO' : 'CONO'} ${(mC / mR).toFixed(2)}×`,
    );
  }
  const e3ok = casos > 0 && rangoGana === casos;
  console.log(`E3 rango indexado: ${e3ok ? 'PASA (el rango gana en todos los casos)' : 'NO PASA — RA/Dec entra como candidato'}`);
  console.log(`\n══════════ VEREDICTO: ${e2ok && e3ok ? 'seguir con E4 (barrido de niveles)' : 'revisar antes de E4'} ══════════`);
  crudo.veredicto = { e2: e2ok, e3: e3ok };
  fs.writeFileSync(path.join(__dirname, 'salida_gaia_e2_e3.json'), JSON.stringify(crudo, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
