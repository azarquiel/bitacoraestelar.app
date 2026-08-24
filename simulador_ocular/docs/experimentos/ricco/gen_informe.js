#!/usr/bin/env node
/* Genera informe.html (4 gráficas SVG + tablas) desde los CSV del harness. */
'use strict';
const fs = require('fs');
const dir = __dirname;

function leeCSV(f) {
  const [cab, ...lineas] = fs.readFileSync(dir + '/' + f, 'utf8').trim().split('\n');
  const cols = cab.split(',');
  return lineas.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], parseFloat(v)])));
}
const datos = leeCSV('blackwell_analisis.csv');
const ajustes = leeCSV('ajustes.csv');
const FONDOS = [13, 17, 19, 21, 23];
const COLOR = { 13: 'var(--s1)', 17: 'var(--s2)', 19: 'var(--s3)', 21: 'var(--s4)', 23: 'var(--s5)' };

// ── mini-librería SVG ────────────────────────────────────────────────────────
const W = 640, H = 420, ML = 62, MR = 16, MT = 14, MB = 46;
function grafica(titulo, xlab, ylab, xmin, xmax, ymin, ymax, cuerpo, xticks, yticks) {
  const X = v => ML + (v - xmin) / (xmax - xmin) * (W - ML - MR);
  const Y = v => H - MB - (v - ymin) / (ymax - ymin) * (H - MT - MB);
  let s = `<figure><figcaption>${titulo}</figcaption>` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${titulo}">`;
  for (const t of xticks) {
    s += `<line x1="${X(t[0])}" y1="${Y(ymin)}" x2="${X(t[0])}" y2="${Y(ymax)}" class="grid"/>`;
    s += `<text x="${X(t[0])}" y="${H - MB + 18}" class="tick" text-anchor="middle">${t[1]}</text>`;
  }
  for (const t of yticks) {
    s += `<line x1="${X(xmin)}" y1="${Y(t[0])}" x2="${X(xmax)}" y2="${Y(t[0])}" class="grid"/>`;
    s += `<text x="${ML - 8}" y="${Y(t[0]) + 4}" class="tick" text-anchor="end">${t[1]}</text>`;
  }
  s += `<rect x="${ML}" y="${Y(ymax)}" width="${W - ML - MR}" height="${H - MT - MB}" class="marco"/>`;
  s += cuerpo(X, Y);
  s += `<text x="${(ML + W - MR) / 2}" y="${H - 8}" class="eje" text-anchor="middle">${xlab}</text>`;
  s += `<text x="16" y="${(MT + H - MB) / 2}" class="eje" text-anchor="middle" transform="rotate(-90 16 ${(MT + H - MB) / 2})">${ylab}</text>`;
  return s + '</svg></figure>';
}
const linea = (pts, X, Y, cls, estilo) =>
  `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}" class="${cls}" style="${estilo || ''}"/>`;
const puntos = (pts, X, Y, color, tip) =>
  pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="4" fill="${color}" stroke="var(--surf)" stroke-width="1"><title>${tip(p)}</title></circle>`).join('');
const etiqueta = (x, y, X, Y, color, txt, anchor) =>
  `<text x="${X(x)}" y="${Y(y)}" class="serie" fill="${color}" text-anchor="${anchor || 'start'}">${txt}</text>`;

const porFondo = f => datos.filter(d => d.fondo === f);
const aj = f => ajustes.find(a => a.fondo === f);
const decadas = (a, b, fmt) => { const r = []; for (let k = Math.ceil(a); k <= b; k++) r.push([k, fmt(k)]); return r; };
const pot = k => k === 0 ? '1' : `10<tspan dy="-5" font-size="9">${k}</tspan>`;
// SVG no anida tspan en <text> vía innerHTML aquí sin cuidado; usar 10^k plano:
const potTxt = k => k === 0 ? '1' : (k === 1 ? '10' : (k === 2 ? '100' : '10^' + k));

// ── G1: log C vs log θ, con ajustes H2 ───────────────────────────────────────
const g1 = grafica('1 · Contraste umbral frente a tamaño angular aparente (Blackwell/Clark; curvas: ajuste H2)',
  'θ aparente (arcmin, escala log)', 'log₁₀ C umbral',
  -0.4, 2.75, -2.8, 3.5,
  (X, Y) => {
    let s = '';
    for (const f of FONDOS) {
      const a = aj(f), lC8 = Math.log10(a.C_inf), tR = a.thetaR_arcmin;
      const fit = [];
      for (let lt = -0.4; lt <= 2.72; lt += 0.05)
        fit.push([lt, lC8 + 2 * Math.log10(1 + tR / Math.pow(10, lt))]);
      s += linea(fit, X, Y, 'fit', 'stroke:' + COLOR[f]);
      s += puntos(porFondo(f).map(d => [d.log_theta, d.logC]), X, Y, COLOR[f],
        p => `fondo ${f} · θ=${Math.pow(10, p[0]).toFixed(1)}′ · logC=${p[1].toFixed(2)}`);
      s += etiqueta(2.58, porFondo(f)[6].logC + 0.12, X, Y, COLOR[f], 'fondo ' + f, 'end');
    }
    // guías de pendiente
    s += linea([[-0.3, 2.7], [0.4, 1.3]], X, Y, 'guia') + etiqueta(0.42, 1.45, X, Y, 'var(--txt2)', 'pendiente −2 (Ricco)');
    s += linea([[1.8, -1.7], [2.6, -2.5]], X, Y, 'guia') + etiqueta(1.75, -1.55, X, Y, 'var(--txt2)', 'pendiente −1', 'end');
    return s;
  },
  decadas(0, 2, k => potTxt(k) + '′').concat([[-0.4, ''], [2.75, '']]).slice(0, 3),
  decadas(-2, 3, k => String(k)));

// ── G2: log C vs log área ────────────────────────────────────────────────────
const g2 = grafica('2 · Contraste umbral frente a área (pendiente −1 = C·A constante)',
  'área (arcmin², escala log)', 'log₁₀ C umbral',
  -0.8, 5.2, -2.8, 3.5,
  (X, Y) => {
    let s = '';
    s += linea([[-0.5, 2.7], [1.5, 0.7]], X, Y, 'guia') + etiqueta(1.55, 0.75, X, Y, 'var(--txt2)', 'pendiente −1 = Ricco');
    for (const f of FONDOS) {
      s += linea(porFondo(f).map(d => [d.log_area, d.logC]), X, Y, 'fit', 'stroke:' + COLOR[f]);
      s += puntos(porFondo(f).map(d => [d.log_area, d.logC]), X, Y, COLOR[f],
        p => `fondo ${f} · logA=${p[0].toFixed(2)} · logC=${p[1].toFixed(2)}`);
      s += etiqueta(5.05, porFondo(f)[6].logC + 0.12, X, Y, COLOR[f], 'fondo ' + f, 'end');
    }
    return s;
  },
  decadas(0, 5, k => potTxt(k)), decadas(-2, 3, k => String(k)));

// ── G3: C·A vs θ (plano = Ricco) ─────────────────────────────────────────────
const g3 = grafica('3 · C·A frente a θ: el tramo plano marca el régimen de Ricco',
  'θ aparente (arcmin, escala log)', 'log₁₀ (C·A) (arcmin²)',
  -0.4, 2.75, -0.6, 4.4,
  (X, Y) => {
    let s = '';
    for (const f of FONDOS) {
      const pts = porFondo(f).map(d => [d.log_theta, Math.log10(d.CA)]);
      s += linea(pts, X, Y, 'fit', 'stroke:' + COLOR[f]);
      s += puntos(pts, X, Y, COLOR[f],
        p => `fondo ${f} · θ=${Math.pow(10, p[0]).toFixed(1)}′ · C·A=${Math.pow(10, p[1]).toFixed(2)}`);
      s += etiqueta(-0.32, pts[0][1] + 0.22, X, Y, COLOR[f], 'fondo ' + f);
      const tR = aj(f).thetaR_arcmin; // marca θR del ajuste H2
      s += `<line x1="${X(Math.log10(tR))}" y1="${Y(-0.6) - 6}" x2="${X(Math.log10(tR))}" y2="${Y(-0.6) - 16}" stroke="${COLOR[f]}" stroke-width="2"><title>θR fondo ${f} = ${tR.toFixed(0)}′</title></line>`;
    }
    s += etiqueta(2.7, -0.28, X, Y, 'var(--txt2)', 'marcas: θR del ajuste H2', 'end');
    return s;
  },
  decadas(0, 2, k => potTxt(k) + '′'), decadas(0, 4, k => String(k)));

// ── G4: curva maestra normalizada + leyes candidatas ─────────────────────────
const g4 = grafica('4 · Curva maestra: C/C∞ frente a θ/θR — los 5 fondos colapsan sobre (1+θR/θ)²',
  'θ / θR (escala log)', 'log₁₀ (C / C∞)',
  -2.3, 1.3, -0.4, 4.8,
  (X, Y) => {
    let s = '';
    const master = [];
    for (let lx = -2.3; lx <= 1.3; lx += 0.05)
      master.push([lx, 2 * Math.log10(1 + 1 / Math.pow(10, lx))]);
    s += linea(master, X, Y, 'fit', 'stroke:var(--txt2);stroke-width:2.5');
    s += etiqueta(0.6, 0.55, X, Y, 'var(--txt2)', 'H2: (1+θR/θ)²');
    // ley actual del simulador, forma pura en θ (exp −0.5) con recorte 4.44x,
    // anclada donde cruza la maestra en θ/θR = 1
    const anc = 2 * Math.log10(2);
    const ley = [];
    for (let lx = -2.3; lx <= 1.3; lx += 0.05) {
      const v = anc - 0.5 * lx;
      ley.push([lx, Math.max(anc - 0.5 * Math.log10(4.94), Math.min(anc + 0.5 * Math.log10(4), v))]);
    }
    s += linea(ley, X, Y, 'guia', 'stroke-dasharray:7 4') +
         etiqueta(-2.25, 1.15, X, Y, 'var(--txt2)', 'ley actual: θ^−0,5 acotada');
    s += linea([[-2.0, 4.0], [-1.0, 2.0]], X, Y, 'guia') + etiqueta(-0.97, 2.0, X, Y, 'var(--txt2)', '1/θ²');
    s += linea([[-2.0, 2.6], [-0.5, 1.1]], X, Y, 'guia') + etiqueta(-0.47, 1.1, X, Y, 'var(--txt2)', '1/θ');
    for (const f of FONDOS) {
      const a = aj(f), lC8 = Math.log10(a.C_inf), lTR = Math.log10(a.thetaR_arcmin);
      s += puntos(porFondo(f).map(d => [d.log_theta - lTR, d.logC - lC8]), X, Y, COLOR[f],
        p => `fondo ${f} · θ/θR=${Math.pow(10, p[0]).toFixed(2)} · C/C∞=${Math.pow(10, p[1]).toFixed(1)}`);
    }
    return s;
  },
  [[-2, '0,01'], [-1, '0,1'], [0, '1'], [1, '10']], decadas(0, 4, k => String(k)));

// ── tabla de datos y de ajustes ──────────────────────────────────────────────
const filaT = d => `<tr><td>${d.fondo}</td><td>${d.theta_arcmin.toFixed(2)}</td><td>${d.area_arcmin2.toFixed(1)}</td><td>${d.logC.toFixed(3)}</td><td>${d.CA.toExponential(2)}</td><td>${d.pend_local.toFixed(2)}</td></tr>`;
const tabla = `<details><summary>Tabla completa (vista de datos)</summary><table>
<tr><th>fondo (mag/″²)</th><th>θ (′)</th><th>área (′²)</th><th>log C</th><th>C·A</th><th>pendiente local</th></tr>
${datos.map(filaT).join('\n')}</table></details>`;
const filaA = a => `<tr><td>${a.fondo}</td><td>${a.pend_libre.toFixed(2)}</td><td>${a.rms_libre.toFixed(3)}</td><td>${a.rms_H0.toFixed(3)}</td><td>${a.rms_H1.toFixed(3)}</td><td>${a.rms_H2.toFixed(3)}</td><td>${a.thetaR_arcmin.toFixed(0)}′</td><td>${a.area_ricco_arcmin2.toFixed(0)}</td><td>${a.pend_libre_peq.toFixed(2)}</td></tr>`;
const tablaA = `<table>
<tr><th>fondo</th><th>pend. libre</th><th>rms libre</th><th>rms H0 (−1)</th><th>rms H1 (−2)</th><th>rms H2</th><th>θR</th><th>área Ricco (′²)</th><th>pend. θ≤10′</th></tr>
${ajustes.map(filaA).join('\n')}</table>`;

const html = `<!doctype html><html lang="es"><meta charset="utf-8">
<title>C(θ): Blackwell/Clark frente a la ley C_MAG actual</title>
<style>
.viz-root{color-scheme:light;--surf:#fcfcfb;--txt:#0b0b0b;--txt2:#52514e;--grid:#e4e3df;
 --s1:#b7d3f6;--s2:#86b6ef;--s3:#5598e7;--s4:#256abf;--s5:#104281;
 background:var(--surf);color:var(--txt);font:15px/1.5 system-ui;max-width:720px;margin:0 auto;padding:24px}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;
 --surf:#1a1a19;--txt:#fff;--txt2:#c3c2b7;--grid:#33322f;
 --s1:#9ec5f4;--s2:#6da7ec;--s3:#3987e5;--s4:#2a78d6;--s5:#5598e7}}
figure{margin:28px 0}figcaption{font-weight:600;margin-bottom:6px}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.marco{fill:none;stroke:var(--grid)}
.tick{font:11px system-ui;fill:var(--txt2)}.eje{font:12px system-ui;fill:var(--txt2)}
.serie{font:11px system-ui;font-weight:600}
.fit{fill:none;stroke-width:1.8}.guia{fill:none;stroke:var(--txt2);stroke-width:1;stroke-dasharray:4 4}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid var(--grid);padding:3px 8px;text-align:right}
details{margin:16px 0}
</style><body class="viz-root">
<h1>Contraste umbral C(θ): datos de Blackwell/Clark frente a la ley C_MAG del simulador</h1>
<p>Datos: Blackwell (1946), tabla VIII, digitalización de Clark (1990) usada por el
ODM de Mel Bartels. C = contraste umbral (50 % de detección), θ = tamaño angular
<em>aparente</em> en el ojo, fondo en mag/arcsec². Ajustes por mínimos cuadrados en log-log;
H2: C(θ)=C∞·(1+θR/θ)².</p>
${g1}${g2}${g3}${g4}
<h2>Ajustes por fondo (rms en dex)</h2>${tablaA}
${tabla}
</body></html>`;
fs.writeFileSync(dir + '/informe.html', html);
console.log('informe.html escrito (' + html.length + ' bytes)');
