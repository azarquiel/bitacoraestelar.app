#!/usr/bin/env node
/* Informe HTML del experimento H2+seeing, desde los CSV de harness_ricco_seeing.js */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'docs', 'ricco', 'seeing');

function leeCSV(f) {
  const [cab, ...ls] = fs.readFileSync(path.join(DIR, f), 'utf8').trim().split('\n');
  const cols = cab.split(',');
  return ls.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], isNaN(+v) ? v : +v])));
}
const bat = leeCSV('bateria_seeing.csv');
const resid = leeCSV('conjunto_residuales.csv');
const modelos = leeCSV('modelos.csv');
const params = JSON.parse(fs.readFileSync(path.join(DIR, 'parametros_conjuntos.json'), 'utf8'));

const W = 640, H = 420, ML = 62, MR = 16, MT = 14, MB = 46;
function grafica(titulo, xlab, ylab, xmin, xmax, ymin, ymax, cuerpo, xticks, yticks) {
  const X = v => ML + (v - xmin) / (xmax - xmin) * (W - ML - MR);
  const Y = v => H - MB - (v - ymin) / (ymax - ymin) * (H - MT - MB);
  let s = `<figure><figcaption>${titulo}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${titulo}">`;
  for (const t of xticks) {
    s += `<line x1="${X(t[0])}" y1="${Y(ymin)}" x2="${X(t[0])}" y2="${Y(ymax)}" class="grid"/>` +
         `<text x="${X(t[0])}" y="${H - MB + 18}" class="tick" text-anchor="middle">${t[1]}</text>`;
  }
  for (const t of yticks) {
    s += `<line x1="${X(xmin)}" y1="${Y(t[0])}" x2="${X(xmax)}" y2="${Y(t[0])}" class="grid"/>` +
         `<text x="${ML - 8}" y="${Y(t[0]) + 4}" class="tick" text-anchor="end">${t[1]}</text>`;
  }
  s += `<rect x="${ML}" y="${Y(ymax)}" width="${W - ML - MR}" height="${H - MT - MB}" class="marco"/>` + cuerpo(X, Y) +
       `<text x="${(ML + W - MR) / 2}" y="${H - 8}" class="eje" text-anchor="middle">${xlab}</text>` +
       `<text x="16" y="${(MT + H - MB) / 2}" class="eje" text-anchor="middle" transform="rotate(-90 16 ${(MT + H - MB) / 2})">${ylab}</text>`;
  return s + '</svg></figure>';
}
const linea = (pts, X, Y, estilo) =>
  `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke-width="2" style="${estilo}"/>`;
const puntos = (pts, X, Y, color, tip) =>
  pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="4" fill="${color}" stroke="var(--surf)" stroke-width="1"><title>${tip(p)}</title></circle>`).join('');
const etiq = (x, y, X, Y, color, txt, anchor) =>
  `<text x="${X(x)}" y="${Y(y)}" class="serie" fill="${color}" text-anchor="${anchor || 'start'}">${txt}</text>`;

/* G1: batería de seeing — margen de detección por variante (pareja coherente) */
const g1 = grafica('1 · Batería de seeing (fondo 21, M=150, seeing 2″): margen de detección log₁₀(C/umbral)',
  'θ_int / θ_seeing (escala log)', 'margen (dex; >0 = detectable)',
  -1.1, 1.1, -3.6, 1.0,
  (X, Y) => {
    let s = `<line x1="${X(-1.1)}" y1="${Y(0)}" x2="${X(1.1)}" y2="${Y(0)}" stroke="var(--txt2)" stroke-dasharray="4 4"/>`;
    const series = [
      ['margen_H2a', 'var(--c1)', 'H2a (sin seeing, C_int)'],
      ['margen_H2b_par', 'var(--c2)', 'H2b max() + C diluido'],
      ['margen_H2c_par', 'var(--c3)', 'H2c cuadratura + C diluido'],
      ['margen_mezcla_max_Cint', 'var(--c4)', 'MEZCLA: max() sobre C_int']
    ];
    for (const [col, color, nom] of series) {
      const pts = bat.map(b => [Math.log10(b.ratio_thInt_thSeeing), b[col]]);
      s += linea(pts, X, Y, 'stroke:' + color) + puntos(pts, X, Y, color,
        p => nom + ' · θi/θs=' + Math.pow(10, p[0]).toFixed(1) + ' · margen ' + p[1].toFixed(2));
    }
    s += etiq(-0.98, -3.05, X, Y, 'var(--c1)', 'H2a / H2b / H2c coherentes: coinciden (ley de flujo)');
    s += etiq(-0.98, -1.15, X, Y, 'var(--c4)', 'mezcla incoherente: regala ~2 dex bajo el seeing');
    s += etiq(0.55, 0.55, X, Y, 'var(--txt)', 'umbral de detección', 'middle');
    return s;
  },
  [[-1, '0,1'], [-0.7, '0,2'], [-0.3, '0,5'], [0, '1'], [0.3, '2'], [0.7, '5'], [1, '10']],
  [[-3, '−3'], [-2, '−2'], [-1, '−1'], [0, '0'], [1, '+1']]);

/* G2: ajuste conjunto — datos frente a modelo, fondos 21 y 23 + residuales */
const g2 = grafica('2 · Ajuste conjunto (4 parámetros para 5 fondos): datos frente a modelo (fondos 21 y 23)',
  'θ aparente (arcmin, escala log)', 'log₁₀ C umbral',
  -0.4, 2.75, -1.6, 3.5,
  (X, Y) => {
    let s = '';
    const col = { 21: 'var(--c1)', 23: 'var(--c7)' };
    for (const f of [21, 23]) {
      const rs = resid.filter(r => r.fondo === f);
      s += linea(rs.map(r => [r.log_theta, r.logC_H2conj]), X, Y, 'stroke:' + col[f]);
      s += puntos(rs.map(r => [r.log_theta, r.logC_dato]), X, Y, col[f],
        p => 'fondo ' + f + ' · logC=' + p[1].toFixed(2));
      s += etiq(2.6, rs[6].logC_dato + 0.18, X, Y, col[f], 'fondo ' + f, 'end');
    }
    s += etiq(0.1, -1.1, X, Y, 'var(--txt2)', 'curvas: log C∞=−4.09+0.128·fondo; log θR=0.094+0.081·fondo');
    s += etiq(0.1, -1.4, X, Y, 'var(--txt2)', 'rms global 0.086 dex · residual máx 0.20 dex');
    return s;
  },
  [[0, '1′'], [1, '10′'], [2, '100′']],
  [[-1, '−1'], [0, '0'], [1, '1'], [2, '2'], [3, '3']]);

const filaM = m => `<tr><td style="text-align:left">${m.modelo}</td><td>${m.rms_global.toFixed(3)}</td><td>${m.rms_f21.toFixed(3)}</td><td>${m.rms_f23.toFixed(3)}</td><td>${m.max_res.toFixed(2)}</td><td>${m.rms_banda_18_360.toFixed(3)}</td></tr>`;
const filaB = b => `<tr><td>${b.ratio_thInt_thSeeing}</td><td>${b.thInt_arcsec}</td><td>${b.thApp_arcmin}</td><td>${b.resuelto ? 'sí' : 'no'}</td><td>${b.margen_H2a.toFixed(2)}</td><td>${b.margen_H2b_par.toFixed(2)}</td><td>${b.margen_H2c_par.toFixed(2)}</td><td>${b.margen_mezcla_max_Cint.toFixed(2)}</td></tr>`;

const html = `<!doctype html><html lang="es"><meta charset="utf-8">
<title>H2 + seeing: experimento fotométrico</title>
<style>
.viz-root{color-scheme:light;--surf:#fcfcfb;--txt:#0b0b0b;--txt2:#52514e;--grid:#e4e3df;
 --c1:#2a78d6;--c2:#eb6834;--c3:#1baf7a;--c4:#eda100;--c7:#4a3aa7;
 background:var(--surf);color:var(--txt);font:15px/1.5 system-ui;max-width:720px;margin:0 auto;padding:24px}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;
 --surf:#1a1a19;--txt:#fff;--txt2:#c3c2b7;--grid:#33322f;
 --c1:#3987e5;--c2:#d95926;--c3:#199e70;--c4:#c98500;--c7:#9085e9}}
figure{margin:28px 0}figcaption{font-weight:600;margin-bottom:6px}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.marco{fill:none;stroke:var(--grid)}
.tick{font:11px system-ui;fill:var(--txt2)}.eje{font:12px system-ui;fill:var(--txt2)}
.serie{font:11px system-ui;font-weight:600}
table{border-collapse:collapse;font-size:13px;margin:12px 0}td,th{border:1px solid var(--grid);padding:3px 8px;text-align:right}
</style><body class="viz-root">
<h1>Experimento fotométrico: H2 (plateau + Ricco) con seeing</h1>
<p>Harness: <code>scripts/harness_ricco_seeing.js</code> (exit 0 = baseline reproducido e
invariancias válidas). Datos: Blackwell 1946 / Clark / ODM Bartels. Sin remuestreo ni PSF de
PS1 (efecto C excluido): solo ley fotométrica (A) y seeing (B).</p>
${g1}
<p><strong>Lección de la batería:</strong> la convolución conserva el flujo (C_obs =
C_int·θ_int²/θ_eff²). Las tres variantes son idénticas ±0.06 dex cuando cada una usa SU
contraste (bajo el área de Ricco el ojo integra: el seeing no cambia la detectabilidad).
La «sensibilidad absurda» solo aparece en la mezcla incoherente: guardia de seeing en el
umbral aplicada al contraste sin diluir (regala ~2 dex).</p>
${g2}
<h2>Modelos sobre Blackwell (amplitud libre por fondo; rms en dex)</h2>
<table><tr><th>modelo</th><th>rms global</th><th>rms f21</th><th>rms f23</th><th>|error| máx</th><th>rms banda 18–360′</th></tr>
${modelos.map(filaM).join('\n')}</table>
<p>En laboratorio (θ_seeing=0) H2a≡H2b≡H2c. La banda 18–360′ es la zona que pisa el
simulador; el rango completo enseña qué pasa fuera de ella.</p>
<h2>Batería de seeing (vista de datos)</h2>
<table><tr><th>θi/θs</th><th>θ_int (″)</th><th>θ_app (′)</th><th>resuelto</th><th>H2a</th><th>H2b par</th><th>H2c par</th><th>mezcla</th></tr>
${bat.map(filaB).join('\n')}</table>
<h2>Parámetros conjuntos</h2>
<pre>${JSON.stringify(params, null, 2)}</pre>
</body></html>`;
fs.writeFileSync(path.join(DIR, 'informe_seeing.html'), html);
console.log('informe_seeing.html escrito');
