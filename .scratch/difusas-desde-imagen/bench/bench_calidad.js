// Cuánto daño hace cada filtro al NÚCLEO de una galaxia, y cuánto se lleva de
// una estrella del mismo brillo. Campo sintético: Sérsic n=4 convolucionado con
// la PSF + estrellas gaussianas de la misma FWHM.
const N = 400;

function gauss2D(sigma) {                     // kernel separable
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
  let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return { k, r };
}
function convolucionar(v, N, sigma) {
  const { k, r } = gauss2D(sigma), a = new Float32Array(v.length), b = new Float32Array(v.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0; for (let i = -r; i <= r; i++) { const xx = Math.min(N - 1, Math.max(0, x + i)); s += k[i + r] * v[y * N + xx]; }
    a[y * N + x] = s;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0; for (let i = -r; i <= r; i++) { const yy = Math.min(N - 1, Math.max(0, y + i)); s += k[i + r] * a[yy * N + x]; }
    b[y * N + x] = s;
  }
  return b;
}
function sersic(v, N, cx, cy, Ie, Re, n) {
  const bn = 2 * n - 0.327;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    v[y * N + x] += Ie * Math.exp(-bn * (Math.pow(r / Re, 1 / n) - 1));
  }
}
function estrella(v, N, cx, cy, pico) { v[(cy | 0) * N + (cx | 0)] += pico; }

/* ── filtros ── */
function erosionar(v, N, r, dilatar) {
  const a = new Float32Array(v.length), b = new Float32Array(v.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let m = dilatar ? -Infinity : Infinity;
    for (let i = -r; i <= r; i++) { const xx = Math.min(N - 1, Math.max(0, x + i)); const s = v[y * N + xx]; if (dilatar ? s > m : s < m) m = s; }
    a[y * N + x] = m;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let m = dilatar ? -Infinity : Infinity;
    for (let i = -r; i <= r; i++) { const yy = Math.min(N - 1, Math.max(0, y + i)); const s = a[yy * N + x]; if (dilatar ? s > m : s < m) m = s; }
    b[y * N + x] = m;
  }
  return b;
}
const apertura = (v, r) => erosionar(erosionar(v, N, r, false), N, r, true);

function medianaAnillo(v, N, rIn, rOut) {
  const off = [];
  for (let dy = -rOut; dy <= rOut; dy++) for (let dx = -rOut; dx <= rOut; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy); if (d >= rIn && d <= rOut) off.push([dx, dy]);
  }
  const out = new Float32Array(v.length), buf = new Float64Array(off.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (let i = 0; i < off.length; i++) {
      const xx = Math.min(N - 1, Math.max(0, x + off[i][0])), yy = Math.min(N - 1, Math.max(0, y + off[i][1]));
      buf[i] = v[yy * N + xx];
    }
    const s = Array.from(buf).sort((a, b) => a - b);
    out[y * N + x] = s[s.length >> 1];
  }
  return out;
}
function medianaCaja(v, N, r) {
  const out = new Float32Array(v.length), k = 2 * r + 1, buf = new Float64Array(k * k);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let m = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = Math.min(N - 1, Math.max(0, x + dx)), yy = Math.min(N - 1, Math.max(0, y + dy));
      buf[m++] = v[yy * N + xx];
    }
    const s = Array.from(buf).sort((a, b) => a - b);
    out[y * N + x] = s[s.length >> 1];
  }
  return out;
}

/* ── medidas ── */
function fluxEn(v, N, cx, cy, R) {
  let s = 0;
  for (let y = Math.max(0, cy - R); y <= Math.min(N - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(N - 1, cx + R); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) s += v[y * N + x];
  return s;
}
const pico = (v, N, cx, cy) => v[cy * N + cx];

function escena(Re) {
  const v = new Float32Array(N * N);
  sersic(v, N, 200, 200, 30, Re, 4);           // galaxia en el centro
  estrella(v, N, 100, 100, 4000);              // estrella brillante aislada
  estrella(v, N, 300, 120, 400);               // estrella media
  estrella(v, N, 208, 200, 2500);              // estrella JUSTO al lado del núcleo
  return convolucionar(v, N, 1.0);             // PSF sigma=1 px → FWHM 2,35 px
}

const FWHM = 2.35;
for (const Re of [16, 6]) {
  const v = escena(Re);
  const nombre = Re === 16 ? 'galaxia extensa (Re=16 px ≈ 6,8 FWHM)' : 'galaxia compacta (Re=6 px ≈ 2,6 FWHM)';
  console.log('\n===== ' + nombre + ' | PSF FWHM = ' + FWHM.toFixed(1) + ' px =====');
  const pico0 = pico(v, N, 200, 200), f2 = fluxEn(v, N, 200, 200, 2), f5 = fluxEn(v, N, 200, 200, 5), f30 = fluxEn(v, N, 200, 200, 30);
  const est0 = pico(v, N, 100, 100);
  console.log('  filtro                        pico núcleo   F(r<2px)   F(r<5px)   F(r<30px)   pico estrella');
  const fila = (etq, w) => {
    console.log('  ' + etq.padEnd(28) +
      (100 * pico(w, N, 200, 200) / pico0).toFixed(0).padStart(9) + '%' +
      (100 * fluxEn(w, N, 200, 200, 2) / f2).toFixed(0).padStart(10) + '%' +
      (100 * fluxEn(w, N, 200, 200, 5) / f5).toFixed(0).padStart(10) + '%' +
      (100 * fluxEn(w, N, 200, 200, 30) / f30).toFixed(0).padStart(11) + '%' +
      (100 * pico(w, N, 100, 100) / est0).toFixed(1).padStart(13) + '%');
  };
  fila('original', v);
  for (const r of [2, 3, 5, 8]) fila('apertura SE ' + (2 * r + 1) + 'x' + (2 * r + 1), apertura(v, r));
  for (const [ri, ro] of [[3, 5], [4, 7], [6, 10]]) fila('mediana anillo r=' + ri + '..' + ro, medianaAnillo(v, N, ri, ro));
  for (const r of [3, 5, 8]) fila('mediana caja ' + (2 * r + 1) + 'x' + (2 * r + 1), medianaCaja(v, N, r));
}
