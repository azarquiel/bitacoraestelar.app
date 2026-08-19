/* E1 — histograma de profundidad (eje 1 del estudio Gaia, ADR 0012).
 *
 * Para cada campo mide, contra el TAP de VizieR real:
 *   HIST    — COUNT por escalones de 0,5 mag SIN ORDER BY (candidata, paso previo)
 *   REC     — la consulta de producción recortada al Gmax que elige el histograma
 *   CONTROL — la consulta de producción a profundidad completa (diseño actual)
 *
 * y evalúa los listones preregistrados del ADR 0012:
 *   L1 equivalencia por Source 100 % (REC ≡ CONTROL)
 *   L2 speedup neto ≥ 3× en cada campo saturante:  control / (hist + rec)
 *   L3 sobrecoste medio del histograma ≤ 1 s en campos no saturantes
 *   L4 criterio económico: coste hist pequeño frente al ahorro (se reporta el ratio)
 *
 * Protocolo: 3 repeticiones intercaladas (candidata/control alternan el orden por
 * repetición, nunca en bloque). Un campo es "saturante" si el CONTROL devuelve
 * exactamente TOP_N filas. La decisión usa la MEDIANA por consulta.
 *
 * Uso:  node scripts/harness_gaia_e1_histograma.js [--campos=m7,m13] [--reps=3]
 * Salida: informe PASA/NO PASA en stdout + crudo en scripts/salida_gaia_e1.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const TOP_N = 40000;          // GAIA_MAX_ROWS del proxy
const MAG_MAX = 20.0;         // GAIA_MAX_MAG del proxy
const ESCALON = 0.5;          // GAIA_QUANT_MAG: mismo cuanto que ya usa el proxy
const RADIO = 0.89;           // ° — el de las medidas previas (M7, 2026-08-17)
const TIMEOUT_MS = 120000;
const PAUSA_MS = 8000;        // entre consultas: la tirada sin pausa provocó 503/400 en cadena
const REINTENTOS = 3;         // backoff 30/60/120 s ante 4xx/5xx del servidor

// Los 6 campos de la especificación (regímenes de densidad distintos).
const CAMPOS = [
  { id: 'm7',     nombre: 'M7 (bulbo, satura fuerte)',        ra: 268.447, dec: -34.841 },
  { id: 'm6',     nombre: 'M6 (plano, satura moderado)',      ra: 265.069, dec: -32.242 },
  { id: 'cygnus', nombre: 'Cygnus sin cúmulo (plano)',        ra: 305.5,   dec: 40.2 },
  { id: 'm13',    nombre: 'M13 (densidad media, no satura)',  ra: 250.423, dec: 36.460 },
  { id: 'virgo',  nombre: 'Virgo (alta latitud)',             ra: 187.7,   dec: 12.4 },
  { id: 'polo',   nombre: 'Polo galáctico norte (casi vacío)', ra: 192.86,  dec: 27.13 },
];

const circulo = (c) =>
  `1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS), CIRCLE('ICRS',${c.ra},${c.dec},${RADIO}))`;

/* La de producción (gaia_proxy.php) + columna Source para poder comparar conjuntos.
 * Control y recortada llevan la MISMA forma: la única diferencia es el Gmax. */
const consultaCampo = (c, mag) =>
  `SELECT TOP ${TOP_N} Source, RA_ICRS, DE_ICRS, Gmag, "BP-RP" FROM "I/355/gaiadr3"` +
  ` WHERE Gmag<=${mag} AND ${circulo(c)} ORDER BY Gmag`;

/* Histograma: COUNT por escalón de 0,5 mag, sin ORDER BY (ordenar ≤40 grupos es del
 * cliente). GROUP BY sobre la expresión; si el TAP lo rechaza se cae al alias. */
const consultasHistograma = (c) => [
  `SELECT FLOOR(Gmag/${ESCALON}) AS escalon, COUNT(*) AS n FROM "I/355/gaiadr3"` +
    ` WHERE Gmag<=${MAG_MAX} AND ${circulo(c)} GROUP BY FLOOR(Gmag/${ESCALON})`,
  `SELECT FLOOR(Gmag/${ESCALON}) AS escalon, COUNT(*) AS n FROM "I/355/gaiadr3"` +
    ` WHERE Gmag<=${MAG_MAX} AND ${circulo(c)} GROUP BY escalon`,
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/* El error útil de un TAP viene dentro del VOTable, no en la línea de estado. */
const errorVotable = (cuerpo) =>
  (cuerpo.match(/<INFO[^>]*>([\s\S]*?)<\/INFO>/) || [, cuerpo])[1].trim().slice(0, 300);

async function tap(adql) {
  for (let intento = 0; ; intento++) {
    const url = TAP + '?request=doQuery&lang=adql&format=json&query=' + encodeURIComponent(adql);
    const t0 = performance.now();
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ttfb = performance.now() - t0;
    const cuerpo = await resp.text();
    const total = performance.now() - t0;
    if (!resp.ok) {
      if (intento < REINTENTOS) {
        const espera = 30000 * 2 ** intento;
        console.log(`    HTTP ${resp.status} (${errorVotable(cuerpo).slice(0, 80)}) — reintento en ${espera / 1000}s`);
        await dormir(espera);
        continue;
      }
      throw new Error(`HTTP ${resp.status}: ${errorVotable(cuerpo)}`);
    }
    const json = JSON.parse(cuerpo);
    return { ttfb, total, bytes: cuerpo.length, filas: json.data.length, data: json.data };
  }
}

/* Primer borde de escalón cuyo acumulado ≥ TOP_N; si nunca llega, MAG_MAX (no satura). */
function elegirGmax(bins) {
  const orden = bins.map(([e, n]) => [Number(e), Number(n)]).sort((a, b) => a[0] - b[0]);
  let acum = 0;
  for (const [escalon, n] of orden) {
    acum += n;
    if (acum >= TOP_N) return { gmax: (escalon + 1) * ESCALON, acumulado: acum, satura: true };
  }
  return { gmax: MAG_MAX, acumulado: acum, satura: false };
}

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const fuentes = (r) => new Set(r.data.map((f) => String(f[0])));

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
  );
  const reps = Number(args.reps || 3);
  const ficheroSalida = path.join(__dirname, args.salida || 'salida_gaia_e1.json');
  const campos = args.campos
    ? CAMPOS.filter((c) => args.campos.split(',').includes(c.id))
    : CAMPOS;

  const crudo = { fecha: new Date().toISOString(), tap: TAP, radio: RADIO, reps, campos: {} };
  for (const c of campos) crudo.campos[c.id] = { ...c, medidas: [] };
  let formaHist = null; // índice de la variante de GROUP BY que el TAP acepta

  for (let rep = 0; rep < reps; rep++) {
    for (const c of campos) {
      const m = { rep: rep + 1 };
      const err = (fase, e) => {
        m[fase] = { error: String(e.message || e) };
        console.log(`  ${c.id} ${fase}: ERROR ${m[fase].error}`);
      };

      // Histograma + elección de Gmax (la candidata necesita su resultado).
      try {
        if (formaHist === null) {
          const variantes = consultasHistograma(c);
          for (let i = 0; i < variantes.length; i++) {
            try { m.hist = await tap(variantes[i]); formaHist = i; break; }
            catch (e) { if (i === variantes.length - 1) throw e; }
          }
        } else {
          m.hist = await tap(consultasHistograma(c)[formaHist]);
        }
        m.eleccion = elegirGmax(m.hist.data);
        delete m.hist.data;
      } catch (e) { err('hist', e); }
      await dormir(PAUSA_MS);

      // Candidata y control, orden alternado por repetición (protocolo intercalado).
      const tareas = [];
      if (m.eleccion) {
        tareas.push(['rec', () => tap(consultaCampo(c, m.eleccion.gmax))]);
      }
      tareas.push(['control', () => tap(consultaCampo(c, MAG_MAX))]);
      if (rep % 2 === 1) tareas.reverse();

      for (const [fase, corre] of tareas) {
        try { m[fase] = await corre(); } catch (e) { err(fase, e); }
        await dormir(PAUSA_MS);
      }

      // Listón 1: equivalencia por Source (solo hace falta comprobarla una vez por
      // campo, pero comprobarla en cada repetición no cuesta nada).
      if (m.rec?.data && m.control?.data) {
        const a = fuentes(m.rec), b = fuentes(m.control);
        m.equivalencia = a.size === b.size && [...a].every((s) => b.has(s));
      }
      for (const fase of ['rec', 'control']) if (m[fase]?.data) delete m[fase].data;

      crudo.campos[c.id].medidas.push(m);
      // Guardado incremental: una tirada larga interrumpida no pierde lo medido.
      fs.writeFileSync(ficheroSalida, JSON.stringify(crudo, null, 1));
      const seg = (x) => (x?.total ? (x.total / 1000).toFixed(1) + 's' : '—');
      console.log(
        `rep ${rep + 1} ${c.id.padEnd(6)} hist=${seg(m.hist)} ` +
        `gmax=${m.eleccion ? m.eleccion.gmax.toFixed(1) : '—'} rec=${seg(m.rec)} ` +
        `control=${seg(m.control)} filas=${m.control?.filas ?? '—'} ` +
        `equiv=${m.equivalencia === undefined ? '—' : m.equivalencia}`,
      );
    }
  }

  // ───────────────────────────── Informe de listones ─────────────────────────────
  console.log('\n══════════ INFORME E1 (listones ADR 0012) ══════════');
  const veredictos = [];
  for (const c of campos) {
    // Mediana por FASE con lo que haya: una repetición coja no tira las demás fases.
    const ms = crudo.campos[c.id].medidas;
    const fase = (f) => ms.filter((m) => m[f]?.total).map((m) => m[f].total / 1000);
    const conEquiv = ms.filter((m) => m.equivalencia !== undefined);
    if (!fase('hist').length || !fase('rec').length || !fase('control').length || !conEquiv.length) {
      console.log(`\n${c.nombre}: SIN DATOS SUFICIENTES`); veredictos.push(false); continue;
    }
    const satura = ms.find((m) => m.control?.filas !== undefined).control.filas >= TOP_N;
    const hist = mediana(fase('hist'));
    const rec = mediana(fase('rec'));
    const control = mediana(fase('control'));
    const equivalencia = conEquiv.every((m) => m.equivalencia === true);
    const speedup = control / (hist + rec);

    console.log(`\n${c.nombre} — ${satura ? 'SATURANTE' : 'no saturante'}`);
    console.log(`  medianas: hist=${hist.toFixed(2)}s rec=${rec.toFixed(2)}s control=${control.toFixed(2)}s`);
    const conEleccion = ms.find((m) => m.eleccion);
    console.log(`  Gmax elegido: ${conEleccion.eleccion.gmax.toFixed(1)}`);
    console.log(`  L1 equivalencia Source: ${equivalencia ? 'PASA' : 'NO PASA'}`);
    let ok = equivalencia;
    if (satura) {
      const l2 = speedup >= 3;
      console.log(`  L2 speedup neto ${speedup.toFixed(2)}× (≥3 pasa, ≥5 claramente bueno): ${l2 ? 'PASA' : 'NO PASA'}`);
      const ahorro = control - (hist + rec);
      console.log(`  L4 ahorro neto ${ahorro.toFixed(2)}s; coste hist ${hist.toFixed(2)}s (${ahorro > 0 ? (hist / ahorro).toFixed(2) + '× del ahorro' : 'NO HAY ahorro'})`);
      ok = ok && l2;
    } else {
      const l3 = hist <= 1;
      console.log(`  L3 sobrecoste histograma ${hist.toFixed(2)}s (≤1s): ${l3 ? 'PASA' : 'NO PASA'}`);
      ok = ok && l3;
    }
    crudo.campos[c.id].veredicto = { satura, hist, rec, control, speedup, equivalencia, ok };
    veredictos.push(ok);
  }

  const todo = veredictos.every(Boolean);
  console.log(`\n══════════ VEREDICTO E1: ${todo ? 'PASA — implementar Fase 1' : 'NO PASA — no implementar'} ══════════`);
  crudo.veredicto = todo;

  fs.writeFileSync(ficheroSalida, JSON.stringify(crudo, null, 1));
  console.log(`\nCrudo en ${ficheroSalida}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
