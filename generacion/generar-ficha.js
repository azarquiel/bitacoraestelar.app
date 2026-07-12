/* ===========================================================================
 * GENERADOR DE FICHAS · Bitácora Messier
 * ---------------------------------------------------------------------------
 * Toma la plantilla .docx original (plantilla_ficha.docx) y sustituye los
 * campos [entre corchetes] por los datos de una observación, conservando
 * EXACTAMENTE el diseño (tipografías, colores, brújula, márgenes).
 *
 * No reconstruye el documento: edita el que ya existe. El resultado es
 * idéntico a la plantilla salvo por los valores.
 *
 * Uso:
 *   node generar-ficha.js observacion.json ficha.docx [plantilla.docx]
 *
 * El .docx resultante lo abre Pages de forma nativa; desde Pages se exporta
 * a .pages con un clic si se desea.
 * =========================================================================== */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ─── Formato de valores ───
function grados(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(v);
  return (n >= 0 ? '+' : '\u2212') + Math.abs(n).toFixed(1) + '\u00b0';
}
function azimut(v) {
  if (v === null || v === undefined || v === '') return '—';
  return parseFloat(v).toFixed(1) + '\u00b0';
}
function nombreLargo(obs) {
  if (obs.tipo === 'messier' && obs.num) return 'Messier ' + obs.num;
  return (obs.objeto || '').split(/\s+[·(]/)[0].trim();
}
// "SQM-L 21.40 IR -1.3º Temperatura ambiente 18º" — cada parte es opcional
function datosDelCielo(obs) {
  const p = [];
  if (obs.sqm  !== null && obs.sqm  !== undefined && obs.sqm  !== '') p.push('SQM-L ' + obs.sqm);
  if (obs.ir   !== null && obs.ir   !== undefined && obs.ir   !== '') p.push('IR ' + obs.ir + '\u00b0');
  if (obs.temp !== null && obs.temp !== undefined && obs.temp !== '') p.push('Temperatura ambiente ' + obs.temp + '\u00b0');
  return p.join(' ');
}
// "Ophiucus 17h 01m -30º 06’"
function constelacionCoords(obs) {
  const partes = [];
  if (obs.cons) partes.push(obs.cons);
  if (obs.coordsTexto) partes.push(obs.coordsTexto);
  else if (obs.ra != null && obs.dec != null) partes.push(raDecTexto(obs.ra, obs.dec));
  return partes.join(' ');
}
function raDecTexto(ra, dec) {
  const h = ra / 15, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const signo = dec < 0 ? '-' : '+', ad = Math.abs(dec);
  const dd = Math.floor(ad), dm = Math.round((ad - dd) * 60);
  return `${hh}h ${String(mm).padStart(2,'0')}m ${signo}${dd}º ${String(dm).padStart(2,'0')}’`;
}

// ─── Entidades XML dentro de <w:t> ───
function decode(s) {
  return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function encode(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Extrae los <w:t>…</w:t> de un XML y su texto decodificado concatenado.
function extraerRuns(xml) {
  const re = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
  const runs = []; let m;
  while ((m = re.exec(xml)) !== null) {
    runs.push({ apertura: m[1], texto: decode(m[2]), cierre: m[3],
                ini: m.index, fin: m.index + m[0].length });
  }
  let concat = '';
  runs.forEach(r => { concat += r.texto; });
  return { runs, concat };
}

// Reparte un reemplazo [pos, pos+len) que puede abarcar varios runs:
// el valor entero va al primer run tocado; en los demás se borra su parte.
function reemplazar(runs, nuevo, pos, len, valor) {
  const offsets = []; let acc = 0;
  runs.forEach(r => { offsets.push(acc); acc += r.texto.length; });
  let restante = len;
  for (let idx = 0; idx < runs.length && restante > 0; idx++) {
    const ini = offsets[idx], fin = ini + runs[idx].texto.length;
    if (pos < fin && pos + len > ini) {
      const li = Math.max(0, pos - ini);
      const lf = Math.min(runs[idx].texto.length, pos + len - ini);
      const inserta = (restante === len) ? valor : '';
      nuevo[idx] = nuevo[idx].slice(0, li) + inserta + nuevo[idx].slice(lf);
      restante -= (lf - li);
    }
  }
}

// Reconstruye el XML aplicando los textos nuevos de cada run.
function reconstruir(xml, runs, nuevo) {
  let salida = '', cursor = 0;
  runs.forEach((r, idx) => {
    salida += xml.slice(cursor, r.ini);
    salida += r.apertura + encode(nuevo[idx]) + r.cierre;
    cursor = r.fin;
  });
  return salida + xml.slice(cursor);
}

// Sustituye los campos [clave] (posiblemente partidos en varios runs).
function sustituirCampos(xml, valores) {
  const { runs, concat } = extraerRuns(xml);
  if (!runs.length) return xml;
  const nuevo = runs.map(r => r.texto);
  Object.keys(valores).forEach(clave => {
    const marca = '[' + clave + ']';
    let desde = 0, pos;
    while ((pos = concat.indexOf(marca, desde)) !== -1) {
      reemplazar(runs, nuevo, pos, marca.length, valores[clave]);
      desde = pos + marca.length;
    }
  });
  return reconstruir(xml, runs, nuevo);
}

// Sustituye la línea fija de constelación+coordenadas del ejemplo.
function sustituirConstelacion(xml, obs) {
  const nueva = constelacionCoords(obs);
  if (!nueva) return xml;
  const { runs, concat } = extraerRuns(xml);
  const nuevo = runs.map(r => r.texto);
  const pat = /Ophiucus\s+\d{1,2}h\s+\d{1,2}m\s+[-+]?\d{1,3}º\s+\d{1,2}’/g;
  let m, hubo = false;
  while ((m = pat.exec(concat)) !== null) {
    reemplazar(runs, nuevo, m.index, m[0].length, nueva);
    hubo = true;
  }
  return hubo ? reconstruir(xml, runs, nuevo) : xml;
}

// ─── Proceso principal ───
function generar(observacionJSON, salidaDocx, plantillaDocx) {
  const datos = JSON.parse(fs.readFileSync(observacionJSON, 'utf8'));
  const obs = datos.observacion || datos;

  // La plantilla trae la errata "Datos_del_dielo"; la respetamos, y por si
  // acaso también cubrimos la forma correcta.
  const valores = {
    'Nombre_observador': obs.observador || '',
    'Nombre_objeto':     nombreLargo(obs),
    'Catálogo':          obs.catalogo || 'Catálogo Messier',
    'Datos_del_dielo':   datosDelCielo(obs),
    'Datos_del_cielo':   datosDelCielo(obs),
    'altitud_sol':       grados(obs.sunAlt),
    'altitud_luna':      grados(obs.moonAlt),
    'altitud_objeto':    grados(obs.objAlt),
    'azimut_objeto':     azimut(obs.objAz),
    'Telescopio':        obs.telescopio || '',
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-'));
  try {
    execSync(`unzip -q -o "${plantillaDocx}" -d "${tmp}"`);
    execSync(`find "${tmp}" -type l -delete`);
    const wordDir = path.join(tmp, 'word');
    fs.readdirSync(wordDir).forEach(archivo => {
      if (/^(header\d+|footer\d+|document)\.xml$/.test(archivo)) {
        const ruta = path.join(wordDir, archivo);
        let xml = fs.readFileSync(ruta, 'utf8');
        xml = sustituirConstelacion(xml, obs);
        xml = sustituirCampos(xml, valores);
        fs.writeFileSync(ruta, xml);
      }
    });
    const abs = path.resolve(salidaDocx);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    execSync(`cd "${tmp}" && zip -q -X -r "${abs}" .`);
    console.log('Ficha generada:', salidaDocx);
  } finally {
    execSync(`rm -rf "${tmp}"`);
  }
}

// ─── CLI ───
if (require.main === module) {
  const [,, entrada, salida, plantilla] = process.argv;
  if (!entrada || !salida) {
    console.error('Uso: node generar-ficha.js observacion.json ficha.docx [plantilla.docx]');
    process.exit(1);
  }
  const plt = plantilla || path.join(__dirname, 'plantilla_ficha.docx');
  generar(entrada, salida, plt);
}

module.exports = { generar };
