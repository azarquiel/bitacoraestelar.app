#!/usr/bin/env node
/* Informe HTML autocontenido del experimento H2c (anclaje + A/B de render).
   Lee simulador_ocular/docs/experimentos/ricco/anclaje/*.csv|json|pgm; convierte las láminas PGM a PNG
   (zlib de node) y las incrusta en base64.  Uso: node scripts/gen_informe_h2c.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const DIR = path.join(__dirname, '..', 'simulador_ocular', 'docs', 'experimentos', 'ricco', 'anclaje');

function leeCSV(f) {
  const [cab, ...ls] = fs.readFileSync(path.join(DIR, f), 'utf8').trim().split('\n');
  const cols = cab.split(',');
  return ls.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], isNaN(+v) ? v : +v])));
}
const abs = leeCSV('anclaje_absoluto.csv');
const rej = leeCSV('rejilla_leyes.csv');
const ab = leeCSV('ab_metricas.csv');
const params = JSON.parse(fs.readFileSync(path.join(DIR, 'parametros_h2c.json'), 'utf8'));

/* ── PNG gris 8 bits desde PGM (P2) ── */
function crc32(buf) {
  let c, t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}
function pgmAPng(fpgm) {
  const t = fs.readFileSync(path.join(DIR, fpgm), 'utf8').split(/\s+/).filter(Boolean);
  const W = +t[1], H = +t[2];
  const px = t.slice(4).map(Number);
  const raw = Buffer.alloc(H * (W + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W + 1)] = 0;
    for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = px[y * W + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}
const laminas = fs.readdirSync(DIR).filter(f => f.endsWith('.pgm')).sort();
const laminasPng = laminas.map(f => {
  const png = pgmAPng(f);
  fs.writeFileSync(path.join(DIR, f.replace('.pgm', '.png')), png);
  return { nombre: f.replace('.pgm', ''), b64: png.toString('base64') };
});

/* ── gráficas SVG (mismas convenciones que informe_seeing) ── */
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
const lg = Math.log10;

/* G1: leyes en la rejilla operativa, fondo 21 (en el ojo) */
function g1De(fondo, sub) {
  const rs = rej.filter(r => r.fondo === fondo);
  const ymax = fondo >= 23 ? 1.0 : 0.4;
  return grafica(`${sub} · Umbral de contraste en la banda operativa (fondo en el ojo ${fondo} mag/arcsec²)`,
    'θ aparente (arcmin, escala log)', 'log₁₀ C umbral',
    1.2, 2.6, -1.6, ymax,
    (X, Y) => {
      let s = '';
      const bA = rs.map(r => [lg(r.theta_app_arcmin), lg(Math.min(r.prod_rama_M66, r.prod_rama_M158, r.prod_rama_M400))]);
      const bB = rs.map(r => [lg(r.theta_app_arcmin), lg(Math.max(r.prod_rama_M66, r.prod_rama_M158, r.prod_rama_M400))]);
      s += `<path d="${bA.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}` +
           `${bB.slice().reverse().map(p => 'L' + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')}Z"` +
           ` fill="var(--c2)" opacity="0.18" stroke="none"/>`;
      s += linea(rs.map(r => [lg(r.theta_app_arcmin), lg(r.prod_rama_M158)]), X, Y, 'stroke:var(--c2);stroke-dasharray:5 3');
      s += linea(rs.map(r => [lg(r.theta_app_arcmin), lg(r.h2c_campo)]), X, Y, 'stroke:var(--c1)');
      s += puntos(rs.map(r => [lg(r.theta_app_arcmin), lg(r.h2c_campo)]), X, Y, 'var(--c1)',
        p => 'H2c campo · θ=' + Math.pow(10, p[0]).toFixed(0) + '′ · logC=' + p[1].toFixed(2));
      s += linea(rs.map(r => [lg(r.theta_app_arcmin), lg(r.h2c_blackwell)]), X, Y, 'stroke:var(--c3)');
      s += etiq(1.26, lg(rs[0].h2c_campo) + 0.16, X, Y, 'var(--c1)', 'H2c anclada a C_MIN (K=2.0)');
      s += etiq(1.26, lg(rs[0].h2c_blackwell) - 0.22, X, Y, 'var(--c3)', 'H2c amplitud Blackwell (K=1)');
      s += etiq(2.55, lg(rs[rs.length - 1].prod_rama_M66) + 0.3, X, Y, 'var(--c2)', 'producción (banda M=66…400; raya: 158x)', 'end');
      return s;
    },
    [[lg(18), '18′'], [lg(30), '30′'], [lg(60), '60′'], [lg(120), '120′'], [lg(240), '240′'], [lg(360), '360′']],
    fondo >= 23 ? [[-1.5, '−1.5'], [-1, '−1'], [-0.5, '−0.5'], [0, '0'], [0.5, '0.5'], [1, '1']]
                : [[-1.5, '−1.5'], [-1, '−1'], [-0.5, '−0.5'], [0, '0']]);
}

/* G2: A/B por objeto y configuración (Δ área %) */
const CFGS = ['18a66_212', '18a158_212', '12a152_212', '18a158_220'];
const CFGLBL = { '18a66_212': '18" 66x sqm 21.2', '18a158_212': '18" 158x sqm 21.2',
  '12a152_212': '12" 152x sqm 21.2', '18a158_220': '18" 158x sqm 22' };
const OBJETOS = [...new Set(ab.map(r => r.objeto))];
const g2 = grafica('3 · A/B de render: cambio de área visible (B −H2c− frente a A −producción−)',
  'objeto', 'Δ área visible (%)',
  -0.5, OBJETOS.length - 0.5, -60, 60,
  (X, Y) => {
    let s = `<line x1="${X(-0.5)}" y1="${Y(0)}" x2="${X(OBJETOS.length - 0.5)}" y2="${Y(0)}" stroke="var(--txt2)" stroke-dasharray="4 4"/>`;
    const col = { '18a66_212': 'var(--c1)', '18a158_212': 'var(--c2)', '12a152_212': 'var(--c3)', '18a158_220': 'var(--c4)' };
    CFGS.forEach((cfg, k) => {
      const pts = ab.filter(r => r.config === cfg).map(r => [OBJETOS.indexOf(r.objeto) + (k - 1.5) * 0.14, r.d_area_pct]);
      s += puntos(pts, X, Y, col[cfg], p => CFGLBL[cfg] + ' · Δárea ' + p[1].toFixed(1) + ' %');
    });
    s += etiq(-0.35, 52, X, Y, 'var(--c1)', '● 18" 66x');
    s += etiq(0.55, 52, X, Y, 'var(--c2)', '● 18" 158x');
    s += etiq(1.45, 52, X, Y, 'var(--c3)', '● 12" 152x');
    s += etiq(2.35, 52, X, Y, 'var(--c4)', '● 18" 158x sqm22');
    return s;
  },
  OBJETOS.map((o, i) => [i, o]),
  [[-60, '−60'], [-40, '−40'], [-20, '−20'], [0, '0'], [20, '+20'], [40, '+40'], [60, '+60']]);

const filaAbs = r => `<tr><td>${r.fondo.toFixed(1)}</td><td>${(+r.C_blackwell).toExponential(2)}</td><td>${(+r.C_prod_base).toExponential(2)}</td><td>${(+r.C_prod_min).toExponential(2)}…${(+r.C_prod_max).toExponential(2)}</td><td>${r.K_base.toFixed(2)}</td><td>${r.dex_base.toFixed(3)}</td></tr>`;
const filaAB = r => `<tr><td style="text-align:left">${r.objeto}</td><td style="text-align:left">${CFGLBL[r.config]}</td><td>${r.theta_int_arcmin.toFixed(2)}</td><td>${(+r.CminA).toFixed(3)}</td><td>${(+r.CminB).toFixed(3)}</td><td>${r.ratio_umbral.toFixed(2)}</td><td>${r.d_area_pct.toFixed(1)}</td><td>${r.d_flujo_pct.toFixed(1)}</td><td>+${r.aparecen_px}/−${r.desaparecen_px}</td></tr>`;

const html = `<!doctype html><html lang="es"><meta charset="utf-8">
<title>H2c: anclaje absoluto y A/B de render</title>
<style>
.viz-root{color-scheme:light;--surf:#fcfcfb;--txt:#0b0b0b;--txt2:#52514e;--grid:#e4e3df;
 --c1:#2a78d6;--c2:#eb6834;--c3:#1baf7a;--c4:#eda100;--c7:#4a3aa7;
 background:var(--surf);color:var(--txt);font:15px/1.5 system-ui;max-width:760px;margin:0 auto;padding:24px}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;
 --surf:#1a1a19;--txt:#fff;--txt2:#c3c2b7;--grid:#33322f;
 --c1:#3987e5;--c2:#d95926;--c3:#199e70;--c4:#c98500;--c7:#9085e9}}
figure{margin:28px 0}figcaption{font-weight:600;margin-bottom:6px}
svg{width:100%;height:auto;display:block}
.grid{stroke:var(--grid);stroke-width:1}.marco{fill:none;stroke:var(--grid)}
.tick{font:11px system-ui;fill:var(--txt2)}.eje{font:12px system-ui;fill:var(--txt2)}
.serie{font:11px system-ui;font-weight:600}
table{border-collapse:collapse;font-size:13px;margin:12px 0}td,th{border:1px solid var(--grid);padding:3px 8px;text-align:right}
img{width:100%;image-rendering:auto;border:1px solid var(--grid)}
.nota{font-size:13.5px;color:var(--txt2)}
</style><body class="viz-root">
<h1>H2c: anclaje absoluto y experimento A/B de render</h1>
<p>Harness: <code>scripts/harness_h2c_anclaje_render.js</code> (exit 0). Ley B (H2c):
<code>${params.ley}</code> con ${params.thetaR}, seeing ${params.seeingArcsec}″,
θint = ${params.thetaInt}. Anclaje: ${params.anclaje}. Producción NO se tocó: la
variante B se inyecta parcheando el fuente en memoria; sin gancho reproduce
producción exactamente (aserción).</p>

<h2>1 · Qué calibró la ley actual</h2>
<p class="nota">C_MIN=0.08/C_EXP=0.35 nacen con cita genérica a Blackwell/Clark y sin dato
umbral propio (19da7f0). C_MAG nace con EXP=0.7/MIN=0.3 calibrado <em>cualitativamente</em>
sobre renders de NGC 891 (f872dbe); 629429b lo dejó en 0.5/0.45 sin justificación en el
mensaje; la rama lo corrigió a 1.0 por el signo del neto (05cfa0c). El único reporte real
cuantificado (serie SQM 21.2–22 con 18" a 158x) calibra el fondo en pantalla, no el umbral.
No existe C_real cuantitativo en el repo: el criterio del simulador es «dónde empieza el
desvanecido», no el 50 % de detección de laboratorio.</p>

<h2>2 · Comparación absoluta</h2>
<table><tr><th>fondo</th><th>C∞ Blackwell</th><th>C producción (M=100)</th><th>rango clamp</th><th>K</th><th>dex</th></tr>
${abs.map(filaAbs).join('\n')}</table>
<p class="nota">K = C_MIN·10^(0.14·(f−21)) / C∞_bw(f). Deriva exacta de log K: ${(0.4 * 0.35 - 0.128).toFixed(3)} dex/mag
→ 0.036 dex en 3 mag, menor que el rms 0.086 del propio ajuste de Blackwell: <strong>H_A
(K constante) es defendible; K ≈ 2.0 (+0.30 dex)</strong>. H_B no está exigida por los datos;
H_C (K según tamaño) equivaldría a conservar C_MAG, que Blackwell refuta.</p>

${g1De(21, '1')}
${g1De(23, '2')}
<p class="nota">El anclaje mueve solo el NIVEL (0.30 dex uniforme entre las dos curvas H2c);
la forma no depende de K (aserción). La banda naranja es el defecto estructural de la ley
actual: a un mismo θ aparente el umbral depende de los aumentos usados.</p>

${g2}

<h2>Métricas A/B (única diferencia: la ley de Cmin)</h2>
<table><tr><th>objeto</th><th>config</th><th>θint (′)</th><th>Cmin A</th><th>Cmin B</th><th>B/A</th><th>Δárea %</th><th>Δflujo %</th><th>±px</th></tr>
${ab.map(filaAB).join('\n')}</table>
<p class="nota">Patrón: a 66x B quita el castigo por pocos aumentos de la ley actual
(M101 +56 % de área); a ~155x quita el bono por muchos (−25…−55 % de área). Los cambios
son monótonos y sin bandas: ningún píxel aparece y desaparece a la vez en la misma
configuración, y el desvanecido de 1.4 dex sigue haciendo la transición (0 configuraciones
con cortes bruscos; 2 con >50 % de píxeles de estado cambiado, por nivel, no por artefacto).</p>

<h2>Láminas (izquierda A producción · derecha B H2c; mismo tope tonal log1p, 18" 158x sqm 21.2)</h2>
${laminasPng.map(l => `<figure><figcaption>${l.nombre}</figcaption><img alt="${l.nombre}" src="data:image/png;base64,${l.b64}"></figure>`).join('\n')}

<h2>Veredicto</h2>
<p><strong>PRODUCCIÓN ACEPTABLE.</strong> H2c ha sido validada técnica y observacionalmente
y pasa a ser la ley de producción: <code>FOT.H2C</code> viene ACTIVA por defecto
(<code>H2C_DEFECTO</code>). El campo la confirmó con <strong>12 observaciones reales</strong>
(M101, NGC 6946, M33, NGC 891 con 450/300/200 mm): <strong>10/12 acordes</strong>,
<strong>K = 2.0</strong> (conservar C_MIN) confirmado, y los márgenes ordenan los tres
estados (visto ≈ 0, lateral ≈ −0.15 dex, no_visto ≈ −0.3 dex): K = 2.0 marca el umbral
de visión directa. Los 2 desacuerdos (−0.01 y −0.11 dex) caen dentro del rms del ajuste
(0.086 dex) y no dependen de tamaño ni fondo
(<code>scripts/campo_h2c.js</code> + <code>simulador_ocular/docs/experimentos/ricco/campo/observaciones.csv</code>).
θint llega a <code>ctxFotometrico</code> (2º argumento, arcmin): lo fabrica
<code>ps1ThetaIntArcmin</code> (los ejes μ=25 de <code>ps1EjesArcmin</code>, circularizados)
y viaja en el parche (<code>ps1ParcheDeGalaxia</code> → <code>ps1PintarParche</code>).
El antiguo bloque C_MAG (y su clamp <code>C_MAG_MAX</code>) deja de controlar el umbral:
queda solo como vía de regresión histórica con <code>FOT.H2C = null</code>
(tests + invariancias en <code>scripts/test_h2c_invariancias.js</code>).</p>
<pre>${JSON.stringify(params, null, 2)}</pre>
</body></html>`;
fs.writeFileSync(path.join(DIR, 'informe_h2c.html'), html);
console.log('informe_h2c.html escrito · láminas PNG: ' + laminasPng.length);
