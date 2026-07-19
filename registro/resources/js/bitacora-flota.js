/* ===========================================================================
 * BITÁCORA MESSIER · Mi flota (equipo del observador)
 * ---------------------------------------------------------------------------
 * Gestiona el equipo PERSONAL del observador (telescopios, oculares y
 * auxiliares): listar, añadir desde el catálogo global (con buscador), añadir a
 * medida, editar y borrar. Habla con /wp-json/bitacora/v1/equipo*.
 *
 * Va SUBIDO POR FTP a /wp-content/uploads/bitacora/ (no se pega en el editor:
 * escaparía los "&" y rompería el JavaScript). Incrementa ?v=N al actualizar.
 * =========================================================================== */

(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  // Configuración por categoría: id de contenedores, columna de "modelo/nombre",
  // campos editables (con su tipo) y cómo resumir las specs en la lista.
  var CATS = {
    telescopio: {
      lista: 'listaTelescopios', add: 'addTelescopio', modeloCol: 'modelo',
      etiquetaModelo: 'Modelo', singular: 'telescopio',
      campos: [
        { k: 'apertura_mm', lab: 'Apertura (mm)', tipo: 'number' },
        { k: 'focal_mm', lab: 'Focal (mm)', tipo: 'number' },
        { k: 'f_ratio', lab: 'f/', tipo: 'number' },
        { k: 'optica', lab: 'Óptica', tipo: 'text' }
      ],
      specs: function (it) {
        var p = [];
        if (num(it.apertura_mm) != null) p.push(num(it.apertura_mm) + ' mm');
        if (num(it.focal_mm) != null) p.push('f=' + num(it.focal_mm) + ' mm');
        if (num(it.f_ratio) != null) p.push('f/' + num(it.f_ratio));
        if (it.optica) p.push(it.optica);
        return p.join('  ·  ');
      }
    },
    ocular: {
      lista: 'listaOculares', add: 'addOcular', modeloCol: 'modelo',
      etiquetaModelo: 'Modelo', singular: 'ocular',
      campos: [
        { k: 'focal_mm', lab: 'Focal (mm)', tipo: 'number' },
        { k: 'campo_aparente', lab: 'Campo aparente (°)', tipo: 'number' },
        { k: 'barril_mm', lab: 'Barril (")', tipo: 'number' }
      ],
      specs: function (it) {
        var p = [];
        if (num(it.focal_mm) != null) p.push(num(it.focal_mm) + ' mm');
        if (num(it.campo_aparente) != null) p.push(num(it.campo_aparente) + '°');
        if (num(it.barril_mm) != null) p.push(num(it.barril_mm) + '"');
        return p.join('  ·  ');
      }
    },
    auxiliar: {
      lista: 'listaAuxiliares', add: 'addAuxiliar', modeloCol: 'nombre',
      etiquetaModelo: 'Nombre', singular: 'auxiliar',
      campos: [
        { k: 'factor', lab: 'Factor (×)', tipo: 'number' },
        { k: 'extension_mm', lab: 'Extensión focal (mm)', tipo: 'number' }
      ],
      specs: function (it) {
        var p = [];
        if (num(it.factor) != null) p.push('×' + num(it.factor));
        if (num(it.extension_mm) != null) p.push('+' + num(it.extension_mm) + ' mm');
        return p.length ? p.join('  ·  ') : 'sin efecto óptico';
      }
    }
  };

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function arrancar() {
    try {
      var $ = function (id) { return document.getElementById(id); };
      var WP = window.BITACORA_WP || null;
      var flash = $('flotaFlash');

      if (!WP) {
        if (flash) { flash.textContent = 'Inicia sesión para gestionar tu flota.'; flash.className = 'flash show err'; }
        return;
      }

      // Base de la API de equipo, derivada de WP.endpoint (…/observaciones).
      var API = WP.endpoint.replace(/observaciones\/?$/, 'equipo');

      var estado = { personal: null, catalogo: null };

      function esc(t) {
        if (t === null || t === undefined) return '';
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      function mostrarFlash(txt, esError) {
        flash.textContent = txt;
        flash.className = 'flash show ' + (esError ? 'err' : 'ok');
        clearTimeout(mostrarFlash._t);
        mostrarFlash._t = setTimeout(function () { flash.className = 'flash'; }, 4000);
      }

      // Llamada a la API con cookie de sesión, nonce y JSON.
      function api(url, opciones) {
        opciones = opciones || {};
        opciones.credentials = 'same-origin';
        opciones.headers = opciones.headers || {};
        opciones.headers['X-WP-Nonce'] = WP.nonce;
        if (opciones.body && typeof opciones.body !== 'string') {
          opciones.headers['Content-Type'] = 'application/json';
          opciones.body = JSON.stringify(opciones.body);
        }
        return fetch(url, opciones).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            return { ok: r.ok, status: r.status, data: data };
          });
        });
      }

      function errorDe(res, porDefecto) {
        if (res.status === 401) return 'Debes iniciar sesión.';
        if (res.status === 403) return 'Solo puedes tocar tu propio equipo.';
        if (res.data && res.data.message) return res.data.message;
        return porDefecto + ' (error ' + res.status + ')';
      }

      var plural = { telescopio: 'telescopios', ocular: 'oculares', auxiliar: 'auxiliares' };

      // ── Pintado de cada sección ──
      function pintarCategoria(tipo) {
        var cfg = CATS[tipo];
        var items = (estado.personal && estado.personal[plural[tipo]]) || [];
        var lista = $(cfg.lista);
        lista.innerHTML = '';
        if (!items.length) {
          var vacio = document.createElement('div');
          vacio.className = 'flota-empty';
          vacio.textContent = 'Aún no tienes ' + plural[tipo] + '. Añade uno del catálogo o a medida.';
          lista.appendChild(vacio);
        }
        items.forEach(function (it) { lista.appendChild(crearItem(tipo, it)); });
      }

      function crearItem(tipo, it) {
        var cfg = CATS[tipo];
        var el = document.createElement('div');
        el.className = 'flota-item';
        var nombre = ((it.vendor ? it.vendor + ' ' : '') + (it[cfg.modeloCol] || '')).trim() || '(sin nombre)';
        el.innerHTML =
          '<div class="fi-main">' +
            '<div class="fi-nom">' + esc(nombre) + '</div>' +
            '<div class="fi-specs">' + esc(cfg.specs(it)) + '</div>' +
          '</div>' +
          '<div class="fi-acts">' +
            '<button type="button" class="fi-btn" data-a="editar">Editar</button>' +
            '<button type="button" class="fi-btn danger" data-a="borrar">Borrar</button>' +
          '</div>';
        el.querySelector('[data-a="editar"]').addEventListener('click', function () { editarItem(tipo, it, el); });
        el.querySelector('[data-a="borrar"]').addEventListener('click', function () { borrarItem(tipo, it, el); });
        return el;
      }

      // ── Formulario "a medida" / edición (reutiliza los campos de la config) ──
      function camposHTML(cfg, valores) {
        valores = valores || {};
        var html = '<label class="field"><span class="lab">Fabricante</span>' +
          '<input type="text" class="f-vendor" value="' + esc(valores.vendor || '') + '"></label>' +
          '<label class="field"><span class="lab">' + esc(cfg.etiquetaModelo) + '</span>' +
          '<input type="text" class="f-modelo" value="' + esc(valores[cfg.modeloCol] || '') + '"></label>' +
          '<div class="row">';
        cfg.campos.forEach(function (c) {
          var v = (valores[c.k] === null || valores[c.k] === undefined) ? '' : valores[c.k];
          html += '<label class="field"><span class="lab">' + esc(c.lab) + '</span>' +
            '<input type="' + c.tipo + '" step="any" class="f-campo" data-k="' + c.k + '" value="' + esc(v) + '"></label>';
        });
        html += '</div>';
        return html;
      }

      function leerCampos(cont, cfg) {
        var datos = {
          vendor: cont.querySelector('.f-vendor').value.trim(),
          modelo: cont.querySelector('.f-modelo').value.trim()  // 'modelo' vale de alias del nombre del auxiliar
        };
        cont.querySelectorAll('.f-campo').forEach(function (inp) {
          var v = inp.value.trim();
          datos[inp.getAttribute('data-k')] = (v === '') ? null : parseFloat(v);
        });
        return datos;
      }

      // ── Zona "añadir" de cada categoría: buscador del catálogo + a medida ──
      function pintarAdd(tipo) {
        var cfg = CATS[tipo];
        var cont = $(cfg.add);
        cont.innerHTML =
          '<div class="obj-wrap">' +
            '<input type="text" class="add-buscar" placeholder="Buscar en el catálogo (' + esc(plural[tipo]) + '): fabricante o modelo…" autocomplete="off">' +
            '<div class="suggest"></div>' +
          '</div>' +
          '<button type="button" class="link-btn toggle-custom">+ Añadir uno a medida</button>' +
          '<div class="flota-add-custom">' +
            camposHTML(cfg) +
            '<div class="actions"><button type="button" class="primary guardar-custom">Añadir a mi flota</button></div>' +
          '</div>';

        // Buscador de catálogo común (bitacora-base.js): al elegir un item,
        // se añade a la flota personal por su id de catálogo.
        BitacoraBase.montarBuscadorCatalogo({
          input: cont.querySelector('.add-buscar'),
          suggest: cont.querySelector('.suggest'),
          contenedor: cont,
          fuente: function () { return (estado.catalogo && estado.catalogo[plural[tipo]]) || []; },
          texto: function (it) { return ((it.vendor ? it.vendor + ' ' : '') + (it[cfg.modeloCol] || '')).trim(); },
          specs: cfg.specs,
          onElegir: function (it) { crear(tipo, { catalogoId: parseInt(it.id, 10) }, null); }
        });

        var custom = cont.querySelector('.flota-add-custom');
        cont.querySelector('.toggle-custom').addEventListener('click', function () {
          custom.classList.toggle('open');
        });
        cont.querySelector('.guardar-custom').addEventListener('click', function (ev) {
          var datos = leerCampos(custom, cfg);
          if (!datos.vendor && !datos.modelo) { mostrarFlash('Indica al menos un fabricante o modelo.', true); return; }
          crear(tipo, datos, ev.currentTarget);
        });
      }


      // ── Operaciones de API ──
      function crear(tipo, datos, btn) {
        if (btn) btn.disabled = true;
        api(API + '/' + tipo, { method: 'POST', body: datos })
          .then(function (res) {
            if (btn) btn.disabled = false;
            if (res.ok && res.data && res.data.ok) {
              estado.personal[plural[tipo]].push(res.data.item);
              estado.personal[plural[tipo]].sort(ordenar(CATS[tipo]));
              pintarCategoria(tipo);
              pintarAdd(tipo);
              mostrarFlash('Añadido a tu flota.', false);
              return;
            }
            mostrarFlash(errorDe(res, 'No se pudo añadir'), true);
          })
          .catch(function () { if (btn) btn.disabled = false; mostrarFlash('No se pudo contactar con el servidor.', true); });
      }

      function editarItem(tipo, it, el) {
        var cfg = CATS[tipo];
        if (el.querySelector('.fi-edit')) return;
        var edit = document.createElement('div');
        edit.className = 'fi-edit flota-add-custom open';
        edit.style.flexBasis = '100%';
        edit.innerHTML = camposHTML(cfg, it) +
          '<div class="actions"><button type="button" class="primary guardar">Guardar</button>' +
          '<button type="button" class="link-btn cancelar">Cancelar</button></div>';
        el.appendChild(edit);
        edit.querySelector('.cancelar').addEventListener('click', function () { edit.remove(); });
        edit.querySelector('.guardar').addEventListener('click', function (ev) {
          var datos = leerCampos(edit, cfg);
          ev.currentTarget.disabled = true;
          api(API + '/' + tipo + '/' + it.id, { method: 'PUT', body: datos })
            .then(function (res) {
              if (res.ok && res.data && res.data.ok) {
                var arr = estado.personal[plural[tipo]];
                var i = arr.findIndex(function (x) { return x.id === it.id; });
                if (i !== -1) arr[i] = res.data.item;
                arr.sort(ordenar(cfg));
                pintarCategoria(tipo);
                mostrarFlash('Cambios guardados.', false);
                return;
              }
              ev.currentTarget.disabled = false;
              mostrarFlash(errorDe(res, 'No se pudo guardar'), true);
            })
            .catch(function () { ev.currentTarget.disabled = false; mostrarFlash('No se pudo contactar con el servidor.', true); });
        });
      }

      function borrarItem(tipo, it, el) {
        if (el.querySelector('.confirm-del')) return;
        var conf = document.createElement('div');
        conf.className = 'confirm-del';
        conf.style.cssText = 'flex-basis:100%;display:flex;gap:10px;align-items:center;margin-top:8px;font-size:14px;color:var(--tinta-tenue)';
        conf.innerHTML = '<span>¿Quitar de tu flota?</span>' +
          '<button type="button" class="fi-btn" data-c="no">Cancelar</button>' +
          '<button type="button" class="fi-btn danger" data-c="si">Sí, quitar</button>';
        el.appendChild(conf);
        conf.querySelector('[data-c="no"]').addEventListener('click', function () { conf.remove(); });
        conf.querySelector('[data-c="si"]').addEventListener('click', function (ev) {
          ev.currentTarget.disabled = true;
          api(API + '/' + tipo + '/' + it.id, { method: 'DELETE' })
            .then(function (res) {
              if (res.ok && res.data && res.data.ok) {
                estado.personal[plural[tipo]] = estado.personal[plural[tipo]].filter(function (x) { return x.id !== it.id; });
                pintarCategoria(tipo);
                mostrarFlash('Quitado de tu flota.', false);
                return;
              }
              ev.currentTarget.disabled = false;
              mostrarFlash(errorDe(res, 'No se pudo quitar'), true);
            })
            .catch(function () { ev.currentTarget.disabled = false; mostrarFlash('No se pudo contactar con el servidor.', true); });
        });
      }

      function ordenar(cfg) {
        return function (a, b) {
          var na = ((a.vendor || '') + ' ' + (a[cfg.modeloCol] || '')).toLowerCase();
          var nb = ((b.vendor || '') + ' ' + (b[cfg.modeloCol] || '')).toLowerCase();
          return na < nb ? -1 : (na > nb ? 1 : 0);
        };
      }

      // ── Carga inicial ──
      Promise.all([api(API), api(API + '/catalogo')]).then(function (r) {
        if (!r[0].ok || !r[1].ok) {
          mostrarFlash('No se pudo cargar tu flota.', true);
          return;
        }
        estado.personal = r[0].data || { telescopios: [], oculares: [], auxiliares: [] };
        estado.catalogo = r[1].data || { telescopios: [], oculares: [], auxiliares: [] };
        ['telescopio', 'ocular', 'auxiliar'].forEach(function (tipo) {
          pintarCategoria(tipo);
          pintarAdd(tipo);
        });
      }).catch(function () {
        mostrarFlash('No se pudo contactar con el servidor.', true);
      });

    } catch (err) {
      console.error('[Bitácora] Error al iniciar Mi flota:', err);
      var f = document.getElementById('flotaFlash');
      if (f) { f.textContent = 'Error al iniciar Mi flota: ' + err.message; f.className = 'flash show err'; }
    }
  }

})();
