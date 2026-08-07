// Segunda tanda: (a) el mismo daño pero sobre la imagen YA ESTIRADA (asinh),
// que es lo que de verdad llega en un JPG de hips2fits, y (b) la vía híbrida
// máscara-de-catálogo + relleno desde el entorno (estilo rellenarNucleo).
const N = 400;

function gauss2D(s) { const r = Math.max(1, Math.ceil(3 * s)), k = new Float64Array(2 * r + 1); let t = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * s * s)); t += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= t; return { k, r }; }
function conv(v, s) { const { k, r } = gauss2D(s), a = new Float32Array(v.length), b = new Float32Array(v.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let t = 0; for (let i = -r; i <= r; i++) t += k[i + r] * v[y * N + Math.min(N - 1, Math.max(0, x + i))]; a[y * N + x] = t; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let t = 0; for (let i = -r; i <= r; i++) t += k[i + r] * a[Math.min(N - 1, Math.max(0, y + i)) * N + x]; b[y * N + x] = t; }
  return b; }
function sersic(v, cx, cy, Ie, Re, n) { const bn = 2 * n - 0.327;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x - cx, y - cy); v[y * N + x] += Ie * Math.exp(-bn * (Math.pow(Math.max(r, 0.3) / Re, 1 / n) - 1)); } }

// Escena: galaxia + 3 estrellas de catálogo (posición y flujo conocidos)
const CAT = [[100, 100, 4000], [300, 120, 400], [208, 200, 2500]];
function escena() {
  const v = new Float32Array(N * N);
  sersic(v, 200, 200, 30, 16, 4);
  for (const [x, y, f] of CAT) v[y * N + x] += f;
  return conv(v, 1.0);
}
// Estirado asinh, como el JPG de un HiPS de visualización
function estirar(v) { const q = 20, m = Math.asinh(3000 / q), o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = Math.min(255, 255 * Math.asinh(Math.max(0, v[i]) / q) / m); return o; }

function ero(v, r, dil) { const a = new Float32Array(v.length), b = new Float32Array(v.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let m = dil ? -1e30 : 1e30; for (let i = -r; i <= r; i++) { const s = v[y * N + Math.min(N - 1, Math.max(0, x + i))]; if (dil ? s > m : s < m) m = s; } a[y * N + x] = m; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let m = dil ? -1e30 : 1e30; for (let i = -r; i <= r; i++) { const s = a[Math.min(N - 1, Math.max(0, y + i)) * N + x]; if (dil ? s > m : s < m) m = s; } b[y * N + x] = m; }
  return b; }
const apertura = (v, r) => ero(ero(v, r, false), r, true);

// Híbrido: máscara circular en las posiciones del catálogo + relleno con el
// desenfoque de la imagen enmascarada (media ponderada válida, à la rellenarNucleo)
function mascaraYRelleno(v, radios) {
  const m = new Uint8Array(v.length);
  CAT.forEach(([cx, cy], i) => { const R = radios[i];
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++)
      if (y >= 0 && y < N && x >= 0 && x < N && (x - cx) ** 2 + (y - cy) ** 2 <= R * R) m[y * N + x] = 1; });
  const dat = new Float32Array(v.length), peso = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) { if (!m[i]) { dat[i] = v[i]; peso[i] = 1; } }
  const sd = conv(dat, 4), sp = conv(peso, 4), out = Float32Array.from(v);
  for (let i = 0; i < v.length; i++) if (m[i]) out[i] = sp[i] > 0.02 ? sd[i] / sp[i] : 0;
  return out;
}
// Resta de PSF con la fotometría del catálogo, con error de centroide y de escala
function restaPSF(v, dxErr, escalaErr) {
  const out = Float32Array.from(v), s = 1.0, R = 8;
  for (const [cx, cy, f] of CAT) {
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (y < 0 || y >= N || x < 0 || x >= N) continue;
      const dx = x - cx - dxErr, dy = y - cy;
      out[y * N + x] -= escalaErr * f * Math.exp(-(dx * dx + dy * dy) / (2 * s * s)) / (2 * Math.PI * s * s);
    }
  }
  return out;
}
const pico = (v, cx, cy) => v[cy * N + cx];
const flux = (v, cx, cy, R) => { let t = 0; for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (y >= 0 && y < N && x >= 0 && x < N && (x - cx) ** 2 + (y - cy) ** 2 <= R * R) t += v[y * N + x]; return t; };
const maxAbs = (v, cx, cy, R) => { let t = 0; for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (y >= 0 && y < N && x >= 0 && x < N) t = Math.max(t, Math.abs(v[y * N + x])); return t; };

const lin = escena(), est = estirar(lin);

console.log('\n===== sobre la imagen ESTIRADA (asinh, lo que llega en el JPG) =====');
console.log('  filtro                     pico núcleo   F(r<5px)   F(r<30px)   pico estrella brillante');
const p0 = pico(est, 200, 200), f5 = flux(est, 200, 200, 5), f30 = flux(est, 200, 200, 30), e0 = pico(est, 100, 100);
const fila = (etq, w) => console.log('  ' + etq.padEnd(25) +
  (100 * pico(w, 200, 200) / p0).toFixed(0).padStart(9) + '%' + (100 * flux(w, 200, 200, 5) / f5).toFixed(0).padStart(10) + '%' +
  (100 * flux(w, 200, 200, 30) / f30).toFixed(0).padStart(11) + '%' + (100 * pico(w, 100, 100) / e0).toFixed(0).padStart(19) + '%');
fila('original', est);
for (const r of [2, 3, 5, 8]) fila('apertura SE ' + (2 * r + 1) + 'x' + (2 * r + 1), apertura(est, r));

console.log('\n===== híbrido catálogo: máscara + relleno desde el entorno =====');
console.log('  (mismo formato; la máscara solo toca las 3 posiciones del catálogo)');
for (const R of [3, 5, 8]) fila('máscara r=' + R + ' + relleno', mascaraYRelleno(est, [R, R, R]));

console.log('\n===== resta de PSF con la fotometría del catálogo (imagen LINEAL) =====');
console.log('  el residuo se mide como |pico| en un radio de 6 px alrededor de la estrella,');
console.log('  en % del pico original de esa estrella.');
const pe = pico(lin, 100, 100);
for (const [dxErr, escErr, etq] of [[0, 1, 'PSF perfecta, centro exacto'],
    [0.3, 1, 'centroide desviado 0,3 px'], [0.5, 1, 'centroide desviado 0,5 px'],
    [0, 1.1, 'flujo 10% de más'], [0, 0.9, 'flujo 10% de menos'],
    [0.3, 1.1, 'centroide 0,3 px + flujo 10%']]) {
  const w = restaPSF(lin, dxErr, escErr);
  console.log('  ' + etq.padEnd(32) + 'residuo ' + (100 * maxAbs(w, 100, 100, 6) / pe).toFixed(1).padStart(6) + '%   ' +
    'núcleo galaxia ' + (100 * pico(w, 200, 200) / pico(lin, 200, 200)).toFixed(0) + '%');
}
