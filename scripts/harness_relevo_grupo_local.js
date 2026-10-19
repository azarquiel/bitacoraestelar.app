#!/usr/bin/env node
/* HARNESS: ¿entra y sale la Vía Láctea centrada del Grupo Local? (b1552ec).
   Desplaza el mapa (MODO=arrastre, por defecto, o MODO=centrar con «Centrar»
   en objId), aleja hasta el relevo y vuelve, midiendo el núcleo de la imagen
   frente al centro del visor. Con el Sol fuera de la vista el zoom se para:
   pulsa «Volver al Sol» y sigue.

   Abre el mapa real en Chrome headless (CDP): sirve mapa.html y mapa/js de este
   repo y reenvía el resto (datos.js, imágenes) a bitacoraestelar.app.

   node scripts/harness_relevo_grupo_local.js [objId=ngc2419]  */
'use strict';
var http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
var cp = require('child_process');
var REPO = path.join(__dirname, '..'), OBJ = process.argv[2] || 'ngc2419';
var PORT = 8765, DBG = 9333;
var PERFIL = fs.mkdtempSync(path.join(require('os').tmpdir(), 'harness-mapa-'));

var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0];
  var local = null;
  if (u === '/mapa.html') local = path.join(REPO, 'mapa/mapa.html');
  else if (u.indexOf('/bitacora-mapa/js/') === 0) local = path.join(REPO, 'mapa/js', u.slice(18));
  if (local && fs.existsSync(local)) {
    res.writeHead(200, { 'content-type': u.endsWith('.js') ? 'application/javascript' : 'text/html' });
    var txt = fs.readFileSync(local, 'utf8');
    return res.end(txt);
  }
  https.get('https://bitacoraestelar.app' + req.url, function (r) {
    res.writeHead(r.statusCode, { 'content-type': r.headers['content-type'] || '' });
    r.pipe(res);
  }).on('error', function () { res.writeHead(502); res.end(); });
}).listen(PORT);

var chrome = cp.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=' + DBG, '--window-size=1280,800',
  '--user-data-dir=' + PERFIL, '--no-first-run', 'about:blank'
], { stdio: 'ignore' });
// El perfil se borra cuando Chrome ya ha salido: antes aún escribe en él.
chrome.on('exit', function () { fs.rmSync(PERFIL, { recursive: true, force: true }); });

function salir(c) { chrome.once('exit', function () { process.exit(c); }); chrome.kill(); }
function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function main() {
  var tabs;
  for (var i = 0; i < 50; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:' + DBG + '/json')).json(); break; } catch (e) { await esperar(200); }
  }
  var page = tabs.filter(function (t) { return t.type === 'page'; })[0];
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (r) { ws.onopen = r; });
  var id = 0, pend = {};
  ws.onmessage = function (m) { var d = JSON.parse(m.data); if (pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  function cdp(method, params) {
    return new Promise(function (r) { var k = ++id; pend[k] = r; ws.send(JSON.stringify({ id: k, method: method, params: params || {} })); });
  }
  async function ev(expr) {
    var r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  }
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/mapa.html' });
  for (i = 0; i < 100; i++) {
    await esperar(300);
    try { if (await ev("!!document.getElementById('mw-image').naturalWidth && !!document.getElementById('" + OBJ + "-anchor')")) break; } catch (e) {}
  }
  await esperar(1500);
  var NUC = "(function(){var i=document.getElementById('mw-image').getBoundingClientRect(),v=document.getElementById('mw-viewer').getBoundingClientRect(),c=document.getElementById('mw-content');" +
    "return {dx:Math.round(i.left+i.width/2-v.left-v.width/2),dy:Math.round(i.top+i.height/2-v.top-v.height/2),op:+(+getComputedStyle(c).opacity).toFixed(2),cx:v.left+v.width/2,cy:v.top+v.height/2};})()";
  var v = await ev(NUC);
  var modo = process.env.MODO || 'arrastre';
  if (modo === 'arrastre') {
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: v.cx, y: v.cy, button: 'left', clickCount: 1 });
    for (var k = 1; k <= 10; k++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: v.cx + 30 * k, y: v.cy + 20 * k, button: 'left', buttons: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: v.cx + 300, y: v.cy + 200, button: 'left', clickCount: 1 });
  } else {
    await ev("document.getElementById('" + OBJ + "-anchor').querySelector('.mw-punto').click()");
    await esperar(300);
    await ev("document.getElementById('ficha-centrar').click()");
  }
  await esperar(900);
  v = await ev(NUC);
  console.log('desplazado (' + modo + ')  nucleo', v.dx, v.dy, 'op', v.op);
  var relevo = null, fallo = false, n;
  for (n = 0; n < 40; n++) {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: v.cx, y: v.cy, deltaX: 0, deltaY: 100 });
    await esperar(120);
    var s1 = await ev(NUC);
    if (!relevo && s1.op <= 0.5) { relevo = s1; console.log('relevo al GL      nucleo', s1.dx, s1.dy, 'op', s1.op); }
    if (s1.op === 0) break;
  }
  if (!relevo) {
    // Bloqueado con el Sol fuera: «Volver al Sol» y seguir alejando.
    var pill = await ev("(function(){var p=document.getElementById('mw-centro');return p.classList.contains('mw-centro-visible')})()");
    console.log('no llega al Grupo Local tras', n, 'pasos; op', s1.op, '; pastilla «Volver al Sol»', pill);
    await ev("document.getElementById('mw-centro-volver').click()");
    await esperar(900);
    for (n = 0; n < 40; n++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: v.cx, y: v.cy, deltaX: 0, deltaY: 100 });
      await esperar(120);
      s1 = await ev(NUC);
      if (!relevo && s1.op <= 0.5) { relevo = s1; console.log('tras Volver al Sol, relevo nucleo', s1.dx, s1.dy, 'op', s1.op); }
      if (s1.op === 0) break;
    }
  }
  if (relevo && (Math.abs(relevo.dx) > 5 || Math.abs(relevo.dy) > 5)) fallo = true;
  for (n = 0; n < 40; n++) {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: v.cx, y: v.cy, deltaX: 0, deltaY: -100 });
    await esperar(120);
    var s2 = await ev(NUC);
    if (s2.op >= 1) { console.log('vuelta a galaxia  nucleo', s2.dx, s2.dy, 'op', s2.op); if (Math.abs(s2.dx) > 5 || Math.abs(s2.dy) > 5) fallo = true; break; }
  }
  console.log(fallo ? 'ROJO: la Vía Láctea no está en el centro en el relevo' : (relevo ? 'VERDE' : 'SIN RELEVO'));
  ws.close(); srv.close();
  salir(fallo ? 1 : 0);
}
main().catch(function (e) { console.error(e); srv.close(); salir(2); });
