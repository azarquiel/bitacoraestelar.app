// Coste real en JS de las vías de supresión de estrellas.
// Node 26 = V8, mismo motor que Chrome. Sin canvas: solo los bucles de array.
// Implementaciones monomórficas (nada de Math.min por referencia dentro del bucle).

/* ── vHGW separable, min y max especializados ── */
function vhgwMin(src, dst, W, H, r, pre, suf) {
  const k = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x0 = 0; x0 < W; x0 += k) {
      let acc = src[o + x0];
      for (let i = 0; i < k; i++) { const x = x0 + i; if (x >= W) { pre[x] = acc; continue; } const s = src[o + x]; if (s < acc) acc = s; pre[x] = acc; }
      const fin = Math.min(x0 + k - 1, W - 1);
      acc = src[o + fin];
      for (let i = k - 1; i >= 0; i--) { const x = x0 + i; if (x >= W) { suf[x] = acc; continue; } const s = src[o + x]; if (s < acc) acc = s; suf[x] = acc; }
    }
    for (let x = 0; x < W; x++) {
      const a = x - r, b = x + r;
      const va = suf[a >= 0 ? a : 0], vb = pre[b < W ? b : W - 1];
      dst[o + x] = va < vb ? va : vb;
    }
  }
}
function vhgwMax(src, dst, W, H, r, pre, suf) {
  const k = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x0 = 0; x0 < W; x0 += k) {
      let acc = src[o + x0];
      for (let i = 0; i < k; i++) { const x = x0 + i; if (x >= W) { pre[x] = acc; continue; } const s = src[o + x]; if (s > acc) acc = s; pre[x] = acc; }
      const fin = Math.min(x0 + k - 1, W - 1);
      acc = src[o + fin];
      for (let i = k - 1; i >= 0; i--) { const x = x0 + i; if (x >= W) { suf[x] = acc; continue; } const s = src[o + x]; if (s > acc) acc = s; suf[x] = acc; }
    }
    for (let x = 0; x < W; x++) {
      const a = x - r, b = x + r;
      const va = suf[a >= 0 ? a : 0], vb = pre[b < W ? b : W - 1];
      dst[o + x] = va > vb ? va : vb;
    }
  }
}
function transponer(src, dst, N) {                       // por bloques, cache-friendly
  const B = 32;
  for (let y0 = 0; y0 < N; y0 += B) for (let x0 = 0; x0 < N; x0 += B) {
    const yf = Math.min(y0 + B, N), xf = Math.min(x0 + B, N);
    for (let y = y0; y < yf; y++) for (let x = x0; x < xf; x++) dst[x * N + y] = src[y * N + x];
  }
}
function apertura(v, N, r) {                             // erosión seguida de dilatación, SE cuadrado
  const a = new Float32Array(v.length), b = new Float32Array(v.length);
  const pre = new Float32Array(N + 2 * r + 2), suf = new Float32Array(N + 2 * r + 2);
  vhgwMin(v, a, N, N, r, pre, suf); transponer(a, b, N);
  vhgwMin(b, a, N, N, r, pre, suf); transponer(a, b, N);
  vhgwMax(b, a, N, N, r, pre, suf); transponer(a, b, N);
  vhgwMax(b, a, N, N, r, pre, suf); transponer(a, b, N);
  return b;
}

/* ── Mediana de anillo (Secker 1995): quickselect en vez de sort ── */
function selecciona(buf, n, k) {                          // nth_element
  let izq = 0, der = n - 1;
  for (;;) {
    if (der <= izq + 1) {
      if (der === izq + 1 && buf[der] < buf[izq]) { const t = buf[izq]; buf[izq] = buf[der]; buf[der] = t; }
      return buf[k];
    }
    const m = (izq + der) >> 1;
    let t = buf[m]; buf[m] = buf[izq + 1]; buf[izq + 1] = t;
    if (buf[izq] > buf[der]) { t = buf[izq]; buf[izq] = buf[der]; buf[der] = t; }
    if (buf[izq + 1] > buf[der]) { t = buf[izq + 1]; buf[izq + 1] = buf[der]; buf[der] = t; }
    if (buf[izq] > buf[izq + 1]) { t = buf[izq]; buf[izq] = buf[izq + 1]; buf[izq + 1] = t; }
    let i = izq + 1, j = der; const piv = buf[izq + 1];
    for (;;) {
      do i++; while (buf[i] < piv);
      do j--; while (buf[j] > piv);
      if (j < i) break;
      t = buf[i]; buf[i] = buf[j]; buf[j] = t;
    }
    buf[izq + 1] = buf[j]; buf[j] = piv;
    if (j >= k) der = j - 1;
    if (j <= k) izq = i;
  }
}
function anilloMediana(v, N, rIn, rOut) {
  const off = [];
  for (let dy = -rOut; dy <= rOut; dy++) for (let dx = -rOut; dx <= rOut; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy); if (d >= rIn && d <= rOut) off.push(dy * N + dx);
  }
  const n = off.length, O = Int32Array.from(off), buf = new Float32Array(n), out = new Float32Array(v.length);
  for (let y = rOut; y < N - rOut; y++) for (let x = rOut; x < N - rOut; x++) {
    const p = y * N + x;
    for (let i = 0; i < n; i++) buf[i] = v[p + O[i]];
    out[p] = selecciona(buf, n, n >> 1);
  }
  return { out, n };
}

/* ── Mediana de caja por histograma deslizante (Huang 1979), luma 0-255 ── */
function medianaHuang(v8, N, r) {
  const k = 2 * r + 1, mitad = (k * k) >> 1, out = new Uint8Array(v8.length);
  const h = new Int32Array(256);
  for (let y = r; y < N - r; y++) {
    h.fill(0);
    for (let dy = -r; dy <= r; dy++) for (let dx = 0; dx < k; dx++) h[v8[(y + dy) * N + dx]]++;
    for (let x = r; x < N - r; x++) {
      if (x > r) {
        const sale = x - r - 1, entra = x + r;
        for (let dy = -r; dy <= r; dy++) { h[v8[(y + dy) * N + sale]]--; h[v8[(y + dy) * N + entra]]++; }
      }
      let acc = 0, m = 0;
      for (; m < 256; m++) { acc += h[m]; if (acc > mitad) break; }
      out[y * N + x] = m;
    }
  }
  return out;
}

/* ── Resta de PSF en posiciones de catálogo ── */
function restaPSF(v, N, nEstrellas, radio) {
  const R = radio, k = 2 * R + 1, g = new Float32Array(k * k), s = R / 2;
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const dx = i - R, dy = j - R; g[j * k + i] = Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
  }
  let semilla = 1;
  const rnd = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let e = 0; e < nEstrellas; e++) {
    const cx = (rnd() * N) | 0, cy = (rnd() * N) | 0, amp = rnd() * 200;
    for (let j = 0; j < k; j++) { const y = cy + j - R; if (y < 0 || y >= N) continue;
      for (let i = 0; i < k; i++) { const x = cx + i - R; if (x < 0 || x >= N) continue;
        v[y * N + x] -= amp * g[j * k + i]; } }
  }
  return v;
}

/* ── Máscara + relleno desde el entorno (lo que ya hace rellenarNucleo) ── */
function rellenarDesdeEntorno(v, entorno, mascara) {
  for (let i = 0; i < v.length; i++) if (mascara[i]) v[i] = entorno[i];
  return v;
}

function campo(N) {
  const v = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - N / 2, dy = y - N / 2;
    v[y * N + x] = 20 + 200 * Math.exp(-Math.sqrt(dx * dx + dy * dy) / (N / 12));
  }
  return v;
}
function cron(etiqueta, f, reps) {
  f(); f();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) f();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps;
  console.log('  ' + etiqueta.padEnd(50), ms.toFixed(1).padStart(7) + ' ms');
}

for (const N of [400, 720, 1440]) {
  console.log('\n=== lienzo ' + N + 'x' + N + ' (' + (N * N / 1e3).toFixed(0) + ' kpx) ===');
  const v = campo(N);
  const v8 = Uint8Array.from(v, x => Math.min(255, x));
  const mask = new Uint8Array(v.length); for (let i = 0; i < mask.length; i += 37) mask[i] = 1;
  cron('apertura vHGW r=3 (SE 7x7)', () => apertura(v, N, 3), 20);
  cron('apertura vHGW r=6 (SE 13x13)', () => apertura(v, N, 6), 20);
  const { n } = anilloMediana(v, N, 4, 6);
  cron('mediana de anillo r=4..6 (' + n + ' muestras/px)', () => anilloMediana(v, N, 4, 6), 5);
  cron('mediana de anillo r=6..9', () => anilloMediana(v, N, 6, 9), 3);
  cron('mediana de caja 9x9 histograma (Huang, 8 bit)', () => medianaHuang(v8, N, 4), 5);
  cron('mediana de caja 15x15 histograma', () => medianaHuang(v8, N, 7), 5);
  cron('resta PSF 2000 estrellas, sello 15x15', () => restaPSF(Float32Array.from(v), N, 2000, 7), 20);
  cron('resta PSF 8000 estrellas, sello 31x31', () => restaPSF(Float32Array.from(v), N, 8000, 15), 10);
  cron('resta PSF 8000 estrellas, sello 81x81 (alas)', () => restaPSF(Float32Array.from(v), N, 8000, 40), 5);
  cron('mascara + relleno desde entorno (1 pasada)', () => rellenarDesdeEntorno(Float32Array.from(v), v, mask), 20);
}
