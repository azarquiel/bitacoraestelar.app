/* E4 — barrido de niveles HEALPix (eje 2, ADR 0012).
 *
 * Para cada campo del estudio (círculo de 0,89°) y nivel:
 *   1. Enumera las celdas que intersecan el círculo AMPLIADO 0,9' (borde borroso de E2),
 *      por muestreo denso de puntos → ang2pix → únicos. Local, sin red.
 *   2. Nivel 6: adquiere cada celda por rango de source_id, SIN ORDER BY, a la
 *      profundidad que el campo necesita (corte de E1 + 0,5 de margen). Mide tiempo,
 *      filas y bytes por celda; el frío absoluto del campo es la suma secuencial
 *      (VizieR serializa por IP).
 *   3. Reconstruye el campo en local: unión de celdas → recorte por distancia angular
 *      real ≤ 0,89° → ORDER BY Gmag → TOP 40000. Mide el tiempo de reconstrucción
 *      (régimen completamente caliente) y compara el conjunto de Source contra el
 *      control de producción (TOP 40000 ORDER BY Gmag, G≤20).
 *   4. Nivel 7 solo se enumera: su recuento de celdas contra el listón ≤9/≤16.
 *   5. Escalera de profundidad: la celda de nivel 6 que contiene M7, a G≤16/18/20.
 *
 * Uso:  node scripts/harness_gaia_e4_barrido.js [--campos=m7,m6] [--sinEscalera]
 * Salida: informe en stdout + crudo incremental en scripts/salida_gaia_e4[_sufijo].json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const RADIO = 0.89;
const MARGEN = 0.015;         // ° ≈ 0,9': borde borroso del source_id (informe E2)
const MAG_MAX = 20.0;
const TOP_N = 40000;
const TIMEOUT_MS = 120000;
const PAUSA_MS = 8000;
const REINTENTOS = 3;
const P235 = 2n ** 35n;

/* Profundidad de adquisición por campo: corte medido en E1 + 0,5 de margen.
 * Donde no satura, la profundidad completa. */
const CAMPOS = [
  { id: 'm7',     nombre: 'M7 (bulbo)',            ra: 268.447, dec: -34.841, prof: 16.0 },
  { id: 'm6',     nombre: 'M6 (plano denso)',      ra: 265.069, dec: -32.242, prof: 18.0 },
  { id: 'cygnus', nombre: 'Cygnus (plano)',        ra: 305.5,   dec: 40.2,    prof: 19.5 },
  { id: 'm13',    nombre: 'M13 (media)',           ra: 250.423, dec: 36.460,  prof: 20.0 },
  { id: 'virgo',  nombre: 'Virgo (alta latitud)',  ra: 187.7,   dec: 12.4,    prof: 20.0 },
  { id: 'polo',   nombre: 'Polo N (vacío)',        ra: 192.86,  dec: 27.13,   prof: 20.0 },
];

// ───────────── HEALPix nested (mismo ang2pix verificado en E2) ─────────────
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

const aNivel = (ipix12, nivel) => ipix12 >> (2n * BigInt(12 - nivel));

function rangoSourceId(nivel, ipix) {
  const d = 2n * BigInt(12 - nivel);
  return [(ipix << d) * P235, ((ipix + 1n) << d) * P235 - 1n];
}

/* Celdas de `nivel` que tocan el círculo ampliado: muestreo de puntos cada ~1/32 de
 * lado de celda. Con lado/8 una celda que roza el borde caía entre dos puntos y su
 * estrella desaparecía de la reconstrucción (medido: 2/3871 en el polo). lado/32 deja
 * solo tangencias sub-0,03°; producción usaría un query_disc exacto. */
function celdasDelCampo(campo, nivel) {
  const lado = Math.sqrt(41253 / (12 * 4 ** nivel));
  const paso = lado / 32;
  const rMax = RADIO + MARGEN;
  const cosDec = Math.cos(campo.dec * Math.PI / 180);
  const celdas = new Set();
  for (let dx = -rMax; dx <= rMax; dx += paso) {
    for (let dy = -rMax; dy <= rMax; dy += paso) {
      if (dx * dx + dy * dy > rMax * rMax) continue;
      celdas.add(aNivel(ang2pixNest(4096, campo.ra + dx / cosDec, campo.dec + dy), nivel).toString());
    }
  }
  return [...celdas].map(BigInt);
}

const distanciaAngular = (ra1, dec1, ra2, dec2) => {
  const r = Math.PI / 180;
  const s = Math.sin((dec2 - dec1) * r / 2) ** 2 +
    Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.sin((ra2 - ra1) * r / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(s)) / r;
};

// ───────────── TAP endurecido (protocolo de E1/E2) ─────────────
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const errorVotable = (cuerpo) =>
  (cuerpo.match(/<INFO[^>]*>([\s\S]*?)<\/INFO>/) || [, cuerpo])[1].trim().slice(0, 300);

async function tap(adql) {
  for (let intento = 0; ; intento++) {
    const url = TAP + '?request=doQuery&lang=adql&format=json&query=' + encodeURIComponent(adql);
    const t0 = performance.now();
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const cuerpo = await resp.text();
      const total = performance.now() - t0;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${errorVotable(cuerpo)}`);
      const json = JSON.parse(cuerpo);
      return { total, bytes: cuerpo.length, filas: json.data.length, data: json.data };
    } catch (e) {
      if (intento >= REINTENTOS) throw e;
      const espera = 30000 * 2 ** intento;
      console.log(`    ${String(e.message).slice(0, 90)} — reintento en ${espera / 1000}s`);
      await dormir(espera);
    }
  }
}

const qCelda = (nivel, ipix, prof) => {
  const [lo, hi] = rangoSourceId(nivel, ipix);
  return `SELECT TOP 500000 Source, RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3"` +
    ` WHERE Source BETWEEN ${lo} AND ${hi} AND Gmag<=${prof}`;
};

const qControl = (c) =>
  `SELECT TOP ${TOP_N} Source, RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3"` +
  ` WHERE Gmag<=${MAG_MAX} AND 1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS),` +
  ` CIRCLE('ICRS',${c.ra},${c.dec},${RADIO})) ORDER BY Gmag`;

/* Reconstrucción local = régimen completamente caliente: recorte + orden + TOP. */
function reconstruir(campo, filasCeldas) {
  const t0 = performance.now();
  const dentro = [];
  for (const f of filasCeldas) {
    if (distanciaAngular(Number(f[1]), Number(f[2]), campo.ra, campo.dec) <= RADIO) dentro.push(f);
  }
  dentro.sort((a, b) => Number(a[3]) - Number(b[3]));
  const top = dentro.slice(0, TOP_N);
  return { ms: performance.now() - t0, filas: top.length, top };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const campos = args.campos ? CAMPOS.filter((c) => args.campos.split(',').includes(c.id)) : CAMPOS;
  const sufijo = args.campos ? '_' + args.campos.replace(/,/g, '-') : '';
  const fichero = path.join(__dirname, `salida_gaia_e4${sufijo}.json`);
  const crudo = { fecha: new Date().toISOString(), radio: RADIO, margen: MARGEN, campos: {} };
  const guardar = () => fs.writeFileSync(fichero, JSON.stringify(crudo, null, 1));

  for (const campo of campos) {
    console.log(`\n═════ ${campo.nombre} (prof. adquisición G≤${campo.prof}) ═════`);
    const r = { ...campo, niveles: {} };
    crudo.campos[campo.id] = r;

    // Recuento de celdas por nivel (local): el listón ≤9 típico / ≤16 peor.
    for (const nivel of [5, 6, 7]) {
      r.niveles[nivel] = { celdas: celdasDelCampo(campo, nivel).length };
    }
    console.log(`  celdas que tocan el campo: n5=${r.niveles[5].celdas} n6=${r.niveles[6].celdas} n7=${r.niveles[7].celdas}`);

    // Adquisición nivel 6, celda a celda.
    const celdas = celdasDelCampo(campo, 6);
    const n6 = r.niveles[6];
    n6.adquisicion = [];
    const filasTodas = [];
    for (const ipix of celdas) {
      try {
        const res = await tap(qCelda(6, ipix, campo.prof));
        n6.adquisicion.push({ ipix: ipix.toString(), s: res.total / 1000, filas: res.filas, bytes: res.bytes });
        filasTodas.push(...res.data);
        console.log(`  celda ${ipix}: ${(res.total / 1000).toFixed(2)}s ${res.filas} filas ${(res.bytes / 1e6).toFixed(2)} MB`);
      } catch (e) {
        n6.adquisicion.push({ ipix: ipix.toString(), error: String(e.message).slice(0, 120) });
        console.log(`  celda ${ipix}: ERROR ${String(e.message).slice(0, 90)}`);
      }
      guardar();
      await dormir(PAUSA_MS);
    }
    n6.frioTotal = n6.adquisicion.reduce((s, a) => s + (a.s || 0), 0);
    n6.bytesTotal = n6.adquisicion.reduce((s, a) => s + (a.bytes || 0), 0);

    // Reconstrucción + control + equivalencia.
    const rec = reconstruir(campo, filasTodas);
    n6.reconstruccionMs = rec.ms;
    n6.filasReconstruidas = rec.filas;
    try {
      const control = await tap(qControl(campo));
      n6.control = { s: control.total / 1000, filas: control.filas };
      const setRec = new Set(rec.top.map((f) => String(f[0])));
      const faltan = control.data.filter((f) => !setRec.has(String(f[0])));
      // Diagnóstico: distancia al centro de cada ausente — borde de círculo o borde de celda.
      n6.equivalencia = {
        faltan: faltan.length,
        control: control.filas,
        distanciasFaltan: faltan.slice(0, 20).map((f) =>
          +distanciaAngular(Number(f[1]), Number(f[2]), campo.ra, campo.dec).toFixed(5)),
      };
      console.log(`  frío n6: ${n6.frioTotal.toFixed(2)}s ${(n6.bytesTotal / 1e6).toFixed(1)} MB | control: ${n6.control.s.toFixed(2)}s | reconstrucción: ${rec.ms.toFixed(0)} ms | faltan ${faltan.length}/${control.filas}`);
    } catch (e) {
      n6.control = { error: String(e.message).slice(0, 120) };
      console.log(`  control: ERROR ${String(e.message).slice(0, 90)}`);
    }
    guardar();
    await dormir(PAUSA_MS);
  }

  // Escalera de profundidad sobre la celda densa de M7 (nivel 6).
  if (!('sinEscalera' in args) && campos.some((c) => c.id === 'm7')) {
    console.log('\n═════ Escalera de profundidad — celda n6 de M7 ═════');
    const ipix = aNivel(ang2pixNest(4096, 268.447, -34.841), 6);
    crudo.escalera = [];
    for (const prof of [16, 18, 20]) {
      try {
        const res = await tap(qCelda(6, ipix, prof));
        crudo.escalera.push({ prof, s: res.total / 1000, filas: res.filas, MB: res.bytes / 1e6 });
        console.log(`  G≤${prof}: ${(res.total / 1000).toFixed(2)}s ${res.filas} filas ${(res.bytes / 1e6).toFixed(1)} MB`);
      } catch (e) {
        crudo.escalera.push({ prof, error: String(e.message).slice(0, 120) });
        console.log(`  G≤${prof}: ERROR ${String(e.message).slice(0, 90)}`);
      }
      guardar();
      await dormir(PAUSA_MS);
    }
  }

  // ───────────── Informe ─────────────
  console.log('\n══════════ INFORME E4 (parcial de esta tirada) ══════════');
  for (const campo of campos) {
    const r = crudo.campos[campo.id];
    const n6 = r.niveles[6];
    if (!n6.control || n6.control.error) { console.log(`${campo.nombre}: SIN CONTROL`); continue; }
    const ratio = n6.frioTotal / n6.control.s;
    console.log(
      `${campo.nombre}: celdas n6=${r.niveles[6].celdas} (n7=${r.niveles[7].celdas}) | ` +
      `frío ${n6.frioTotal.toFixed(1)}s = ${ratio.toFixed(2)}× control | ${(n6.bytesTotal / 1e6).toFixed(1)} MB | ` +
      `caliente ${n6.reconstruccionMs.toFixed(0)} ms | equivalencia: faltan ${n6.equivalencia?.faltan}/${n6.equivalencia?.control}`,
    );
  }
  guardar();
  console.log(`\nCrudo en ${fichero}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
