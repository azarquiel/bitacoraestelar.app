#!/usr/bin/env node
/* Test del resultado «Visto / No visto» en el formulario de registro (#395).

   La lógica con cuentas vive en BitacoraBase (serialización, reseteo al derivar,
   textos); el resto es cableado, que se comprueba leyendo el HTML y el .js
   porque el fragmento va pegado en WordPress y el .js por FTP.

   Sin dependencias:  node scripts/test_resultado_formulario.js */
'use strict';

var fs = require('fs');
var path = require('path');

global.window = {};
require('../resources/js/bitacora-base.js');
var B = global.window.BitacoraBase;

var fallos = 0;
function ok(cond, etiqueta) {
  if (cond) { console.log('  ok   ' + etiqueta); }
  else { fallos++; console.error('  FALLA ' + etiqueta); }
}
function seccion(t) { console.log('\n' + t); }

seccion('Serialización: lo que viaja al servidor');
var s = B.serializarResultado({ visto: true, subtipo: 'detectado_no_visto', motivo: 'luna' });
ok(s.resultado === 'visto' && s.motivo_no_visto === null,
   'visto no envía motivo ni subtipo aunque estén marcados en memoria');
s = B.serializarResultado({ visto: false, subtipo: 'no_visto', motivo: null });
ok(s.resultado === 'no_visto' && s.motivo_no_visto === null, 'no visto sin motivo: se acepta, motivo nulo');
s = B.serializarResultado({ visto: false, subtipo: 'detectado_no_visto', motivo: 'seeing' });
ok(s.resultado === 'detectado_no_visto' && s.motivo_no_visto === 'seeing', 'detectado + motivo');
s = B.serializarResultado({ visto: false, subtipo: '', motivo: '' });
ok(s.resultado === 'no_visto' && s.motivo_no_visto === null, 'sin subtipo manda «claramente no visto»; motivo vacío es nulo');
s = B.serializarResultado();
ok(s.resultado === 'visto' && s.motivo_no_visto === null, 'sin estado, «visto»');

seccion('Los ocho motivos coinciden con la lista cerrada del servidor');
var php = fs.readFileSync(path.join(__dirname, '../resources/plugins/bitacora-registro/bitacora-registro.php'), 'utf8');
var servidor = /'nubes', 'contaminacion'[^)]*\)/.exec(php)[0].match(/'([a-z_]+)'/g).map(function (x) { return x.slice(1, -1); });
var cliente = B.MOTIVOS_NO_VISTO.map(function (m) { return m.valor; });
ok(servidor.length === 8 && JSON.stringify(servidor) === JSON.stringify(cliente), 'mismos valores y mismo orden');
ok(B.MOTIVOS_NO_VISTO.every(function (m) { return m.etiqueta; }), 'todos llevan etiqueta visible');

seccion('Estado inicial y edición');
var ini = B.resultadoInicial();
ok(ini.visto === true && ini.subtipo === 'no_visto' && ini.motivo === null, 'inicial: visto, subtipo «claramente no visto», sin motivo');
var ed = B.resultadoDeObservacion({ resultado: 'detectado_no_visto', motivo_no_visto: 'apertura' });
ok(ed.visto === false && ed.subtipo === 'detectado_no_visto' && ed.motivo === 'apertura', '?editar=N: muestra resultado, subtipo y motivo guardados');
ed = B.resultadoDeObservacion({ resultado: 'no_visto', motivo_no_visto: null });
ok(ed.visto === false && ed.subtipo === 'no_visto' && ed.motivo === null, '?editar=N de un no visto sin motivo');
ed = B.resultadoDeObservacion({ resultado: 'visto', motivo_no_visto: null });
ok(ed.visto === true, '?editar=N de una vista: visto');
ed = B.resultadoDeObservacion({});
ok(ed.visto === true, 'fila sin la columna (servidor viejo): visto');

seccion('Derivar desde un fallo (reintentarlo): vuelve a «Visto» y sin motivo');
var der = B.resultadoDeObservacion({ resultado: 'no_visto', motivo_no_visto: 'luna' }, true);
ok(der.visto === true && der.motivo === null && der.subtipo === 'no_visto', 'no hereda ni resultado ni motivo ni subtipo');

seccion('Textos según el estado');
var t = B.textosResultado(true, false);
ok(t.boton === 'Guardar observación' && t.tituloOculares === 'Lo que viste, por ocular', 'visto: textos de siempre');
t = B.textosResultado(false, false);
ok(t.boton === 'Guardar exploración no confirmada' && t.tituloOculares === 'Qué probaste (opcional)', 'no visto: botón y sección de oculares');
ok(/aumentos/.test(t.ayudaExploracion) && /filtros/.test(t.ayudaExploracion) && /método de búsqueda/.test(t.ayudaExploracion),
   'la ayuda de Exploración invita a contar aumentos, filtros y método');
ok(B.textosResultado(false, true).boton === 'Guardar cambios' && B.textosResultado(true, true).boton === 'Guardar cambios',
   'en edición el botón sigue siendo «Guardar cambios»');

seccion('Aviso de éxito');
ok(B.avisoGuardado(true, 7, false) === 'Observación guardada (registro nº 7).', 'visto');
ok(B.avisoGuardado(false, 7, false) === 'Exploración no confirmada guardada (registro nº 7).', 'no visto repite el estado');
ok(B.avisoGuardado(false, 7, true) === 'Cambios guardados en la observación nº 7.', 'edición');
ok(B.urlMapa('NGC 6826') === '/mapa.html?objeto=NGC%206826', 'enlace al mapa con el objeto codificado');

seccion('Cableado: HTML y formulario');
var RAIZ = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(RAIZ, 'registro/registrar-observacion-wordpress.html'), 'utf8');
var js = fs.readFileSync(path.join(RAIZ, 'registro/resources/js/bitacora-formulario.js'), 'utf8');
var css = fs.readFileSync(path.join(RAIZ, 'registro/resources/css/bitacora-formulario.css'), 'utf8');

ok(html.indexOf('id="obj"') < html.indexOf('id="resultadoBloque"') && html.indexOf('id="resultadoBloque"') < html.indexOf('id="fechaObs"'),
   'la elección va debajo del objeto y antes de la fecha');
ok(/name="resultado"[^>]*value="visto"[^>]*checked|checked[^>]*name="resultado"[^>]*value="visto"|value="visto"[^>]*checked/.test(html), '«Visto» marcado por defecto');
ok(/<input[^>]*type="radio"[^>]*name="resultado"[^>]*value="no_visto"[^>]*aria-controls="noVistoCampos"[^>]*aria-expanded="false"/.test(html),
   '«No visto» anuncia sus campos con aria-controls y aria-expanded');
ok(/id="noVistoCampos"[^>]*hidden/.test(html), 'los campos nuevos nacen ocultos');
ok(/name="subtipo"[^>]*value="no_visto"[^>]*checked|checked[^>]*name="subtipo"[^>]*value="no_visto"/.test(html), '«Claramente no visto» preseleccionado');
ok(!/name="motivo"[^>]*checked/.test(html) && (html.match(/name="motivo"/g) || []).length === 8, 'ocho chips de motivo y ninguno preseleccionado');
ok(!/<select[^>]*id="(motivo|subtipo)/.test(html), 'ni motivo ni subtipo son desplegables');
ok(/<legend[^>]*>[^<]*(<[^>]+>[^<]*)*opcional/.test(html.slice(html.indexOf('id="subtipoCampo"'), html.indexOf('id="motivoCampo"'))), 'la subpregunta lleva «(opcional)» en su leyenda');
ok(/no llegaste a confirmarlo/.test(html), 'línea de ayuda de «detectado»');
ok(/id="tituloOculares"/.test(html) && /id="ayudaExploracion"/.test(html), 'títulos reescribibles por el formulario');

ok(/B\.serializarResultado|BitacoraBase\.serializarResultado/.test(js), 'recompute serializa por la lógica de Base');
ok(/resultadoDeObservacion\(obs, !!derivandoId\)/.test(js), 'precargar muestra lo guardado, o «Visto» si se deriva');
var enc = js.slice(js.indexOf('function encadenar('), js.indexOf("if(otraBtn){ otraBtn.addEventListener"));
ok(/resultadoInicial\(\)/.test(enc), 'encadenar/derivar devuelve el resultado a «Visto»');
ok(/addEventListener\('click'/.test(js.slice(js.indexOf('resultadoBloque'))), 'un solo listener delegado sobre el bloque');
ok(!/hidden\s*=\s*false;?\s*\n?\s*\$\('noVistoCampos'\)\.focus/.test(js), 'el foco no se mueve al revelar');

ok(/\.seg-op > span, [^{]*\.chip > span \{[^}]*min-height:44px;min-width:44px/.test(css), 'segmentos y chips de al menos 44×44 px');
ok(/\.seg, [^{]*\.chips \{[^}]*flex-wrap:wrap;gap:8px/.test(css), 'separación de 8 px y salto de línea');
ok(!/#resultadoBloque[^{]*\{[^}]*animation/.test(css) && !/transition:[^;]*[^.0-9]0?\.[2-9]\d*s/.test(css.slice(css.indexOf('#resultadoBloque'), css.indexOf('Movimiento reducido'))),
   'sin animaciones de más de 150 ms (y reduced-motion ya anula las transiciones)');

if (fallos) { console.error('\n' + fallos + ' fallo(s)'); process.exit(1); }
console.log('\nTodo bien.');
