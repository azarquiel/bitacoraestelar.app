#!/usr/bin/env node
/* HARNESS: tras «Centrar» un objeto en el mapa de la galaxia, ¿sigue en el
   centro del visor con cada paso de zoom? (7ae3cf4: con NGC 2419, fuera de la
   imagen, el primer zoom lo sacaba ~1700 px).

   Abre el mapa real en Chrome headless (CDP): sirve mapa.html y mapa/js de este
   repo y reenvía el resto (datos.js, imágenes) a bitacoraestelar.app.
   SIN_CENTRAR=1: sin «Centrar», mide la deriva bajo el cursor al hacer zoom.
   Con M13 da ROJO (~17 px): es el clamp del borde de la imagen, no el centrado.

   node scripts/harness_zoom_centro_galaxia.js [objId=ngc2419]  */
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
  // Desfase del punto del objeto al centro del visor, y escala.
  var MEDIR = "(function(){var a=document.getElementById('" + OBJ + "-anchor');var el=a.querySelector('.mw-punto')||a;" +
    "var r=el.getBoundingClientRect(),v=document.getElementById('mw-viewer').getBoundingClientRect();" +
    "return {dx:Math.round(r.left+r.width/2-v.left-v.width/2),dy:Math.round(r.top+r.height/2-v.top-v.height/2)," +
    "cx:v.left+v.width/2,cy:v.top+v.height/2};})()";
  // Abrir ficha (clic real en el punto) y pulsar «Centrar».
  if (process.env.SIN_CENTRAR) {
    var m0 = await ev(MEDIR);
    var px = m0.cx + m0.dx, py = m0.cy + m0.dy, mal = false;
    console.log('sin Centrar, rueda sobre el objeto en', px, py);
    for (var q of [-1, -1, 1, 1]) {
      var a0 = await ev(MEDIR);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: a0.cx + a0.dx, y: a0.cy + a0.dy, deltaX: 0, deltaY: q * 100 });
      await esperar(250);
      var a1 = await ev(MEDIR);
      console.log('  deriva bajo el cursor', a1.dx - a0.dx, a1.dy - a0.dy);
      if (Math.abs(a1.dx - a0.dx) > 3 || Math.abs(a1.dy - a0.dy) > 3) mal = true;
    }
    console.log(mal ? 'ROJO' : 'VERDE'); ws.close(); srv.close(); salir(mal ? 1 : 0);
  }
  await ev("document.getElementById('" + OBJ + "-anchor').querySelector('.mw-punto').click()");
  await esperar(300);
  var btn = await ev("(function(){var b=document.getElementById('ficha-centrar');return b?{hidden:b.hidden,txt:b.textContent}:null})()");
  console.log('botón', JSON.stringify(btn));
  await ev("document.getElementById('ficha-centrar').click()");
  await esperar(900);
  var m = await ev(MEDIR);
  console.log('tras Centrar      ', m.dx, m.dy);
  // Rueda en el centro del visor (donde está el objeto centrado).
  var fallo = Math.abs(m.dx) > 3 || Math.abs(m.dy) > 3;
  for (var paso of [-1, -1, 1, 1, 1]) {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: m.cx, y: m.cy, deltaX: 0, deltaY: paso * 100 });
    await esperar(250);
    var z = await ev(MEDIR);
    console.log((paso < 0 ? 'zoom in ' : 'zoom out') + '          ', z.dx, z.dy);
    if (Math.abs(z.dx) > 3 || Math.abs(z.dy) > 3) fallo = true;
  }
  console.log(fallo ? 'ROJO: el objeto centrado se va del centro con el zoom' : 'VERDE');
  ws.close(); srv.close();
  salir(fallo ? 1 : 0);
}
main().catch(function (e) { console.error(e); srv.close(); salir(2); });
