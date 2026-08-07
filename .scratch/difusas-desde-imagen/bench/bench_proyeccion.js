// ¿Cuánto se desvía la proyección LINEAL que usa dibujar() de la TAN real que
// entrega hips2fits? Medido en píxeles del lienzo, que es lo que decide si una
// resta de PSF en posiciones de catálogo cae encima de la estrella o al lado.
const D2R = Math.PI / 180;
function tan(ra, dec, ra0, dec0) {                 // coords estándar gnomónicas (rad)
  const dra = (ra - ra0) * D2R, d = dec * D2R, d0 = dec0 * D2R;
  const den = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dra);
  return [Math.cos(d) * Math.sin(dra) / den,
          (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dra)) / den];
}
function lineal(ra, dec, ra0, dec0) {              // lo que hace bitacora-gaia-render.js
  return [((ra - ra0 + 540) % 360 - 180) * Math.cos(dec0 * D2R) * D2R, (dec - dec0) * D2R];
}
for (const dec0 of [0, 40, 70]) {
  console.log('\ndec0 = ' + dec0 + '°');
  for (const [arcmin, PROC] of [[10, 720], [30, 720], [60, 720], [120, 720], [360, 1440]]) {
    const escPxPorRad = PROC / (arcmin / 60 * D2R);
    let peor = 0, peorPos = '';
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const dd = j * arcmin / 120, dr = i * arcmin / 120 / Math.cos(dec0 * D2R);
      const ra = dr, dec = dec0 + dd;
      const t = tan(ra, dec, 0, dec0), l = lineal(ra, dec, 0, dec0);
      const e = Math.hypot(t[0] - l[0], t[1] - l[1]) * escPxPorRad;
      if (e > peor) { peor = e; peorPos = '(' + i + ',' + j + ')'; }
    }
    console.log('  campo ' + String(arcmin).padStart(3) + '′ / ' + PROC + ' px  (' +
      (arcmin * 60 / PROC).toFixed(2) + '″/px)   desvío máx en esquina: ' +
      peor.toFixed(2).padStart(7) + ' px  ' + peorPos);
  }
}
