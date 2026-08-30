# 0005 · El tramo de audio es cuatro columnas de la observación

Fecha: 2026-08-30
Estado: aceptado

## Contexto

Una observación puede llevar el recorte de un reportaje sonoro ajeno —el
caso de arranque es Néstor GM y su podcast *Luces Extrañas*— en el que se
habla del objeto observado. El mapa que decidió esto (issue #156) fijó diez
premisas antes de discutir nada: destino es especificación, no
implementación; el autor tiene usuario propio, sin capacidad de editar
observación ajena; se guarda contenido mínimo más enlace, la crónica sigue
viviendo en los canales del autor; el tramo se reproduce en el segundo
exacto; la función es genérica, no montada alrededor de un autor concreto;
el audio cuelga de la observación, no de la entrada; se guardan cuatro
datos (URL del MP3, inicio, fin, URL del episodio); la ficha muestra
episodio, web del autor y su podcast; el marcador del mapa no cambia; el
autor ya dio su permiso.

Sobre esa base, cinco tickets del mapa resolvieron: si el CDN de iVoox
cuenta como escucha y qué tan fiable es su feed RSS (#157), el modelo de
datos (#158), si el tramo viaja en el XML de OAL (#159, resuelto dentro de
#158), cómo se captura en el formulario (#160) y dónde cae en la ficha del
mapa (#161). Esta ADR reúne esas cinco decisiones en una sola regla
verificable.

## Decisión

**El tramo de audio son cuatro columnas anulables de `{prefix}bitacora`,
reproducidas con `<audio>` nativo y un media fragment, capturadas a mano en
un fieldset plegado, y nunca exportadas a OAL.**

### Modelo de datos

Dos términos, no uno: **episodio** es la obra entera de otro autor —vive
fuera, en sus canales, el sitio ni la rehospeda ni la transcribe—; **tramo
de audio** es el recorte que corresponde a esta observación, lo único que
se guarda. Entrada de glosario ya escrita en `registro/CONTEXT.md`
(sección «Tramo de audio»).

Cuatro columnas nuevas en `{prefix}bitacora`, todas anulables:

| Columna | Tipo | Significado |
|---|---|---|
| `audio_url` | `varchar(255) NOT NULL DEFAULT ''` | URL del MP3. Vacía = sin tramo. |
| `audio_inicio` | `int unsigned DEFAULT NULL` | Segundo de inicio en el MP3. `0` es legítimo. |
| `audio_fin` | `int unsigned DEFAULT NULL` | Segundo de fin. `NULL` = hasta el final del episodio. |
| `audio_episodio_url` | `varchar(255) NOT NULL DEFAULT ''` | URL de la página del episodio. |

Reglas de validez: sin `audio_url` no hay tramo, aunque queden números
sueltos en las otras columnas; `audio_fin <= audio_inicio` se rechaza al
guardar; `audio_fin` ausente significa hasta el final.

Se guardan **URLs, no el identificador de ningún proveedor**: meter el
identificador de iVoox en el modelo ataría la función a ese proveedor
concreto, y un segundo autor sonoro en Spotify o en su propio servidor no
tiene identificador de iVoox que guardar. Derivar la URL a partir del
catálogo de un proveedor es ayuda de captura, no forma parte del dato
guardado.

Columnas de la observación, no tabla hija: una observación es un usuario +
una noche + un objeto, y lleva como mucho un tramo. Lo rompería un objeto
del que hablan dos episodios distintos la misma noche y el mismo
observador; se acepta ese techo, migrar a tabla hija el día que aparezca es
un `INSERT ... SELECT`.

### Ciclo de vida

- **Borrado (`borrada_en`) y adopción por `oal_id`**: nada que decidir. Al
  ser columnas de la fila de la observación, el borrado se las lleva y
  restaurar las devuelve; la adopción hace `$wpdb->update()` con un array
  construido solo desde lo que trae el XML (`bitacora-oal.php:913`), así
  que las columnas de audio, que el importador no conoce, quedan intactas.
- **No viaja en el XML de OAL.** OAL no tiene campo para esto; inventarlo
  sería ampliar el dialecto propio, contra la ADR 0003 (un solo escritor
  del dialecto). Es dato del sitio, no de la observación portable. El
  ciclo «exportar → corregir → reimportar» de `registro/CONTEXT.md` no se
  rompe: el importador no toca columnas que no construye.

### Reproducción

`<audio src="URL_DEL_MP3#t=inicio,fin">` nativo del navegador. El
reproductor incrustable de iVoox (y de proveedores equivalentes) queda
descartado para el tramo: no admite tiempo de inicio ni `postMessage`
—arranca siempre en cero—, aunque sí compute la escucha para las
estadísticas del autor si se usara para el episodio completo. La puerta de
entrada al autor no la hace un reproductor: la hacen los tres enlaces
visibles junto al tramo (episodio, web del autor, su podcast en la
plataforma que use), con el crédito pegado al reproductor.

### Captura en el formulario

Fieldset plegada «Reportaje sonoro (opcional)» en
`registro/registrar-observacion-wordpress.html`, mismo patrón que la
sección «Exploración (opcional)»: colapsada por defecto, se despliega solo
si el usuario marca que la observación tiene audio. Colocada después de
Exploración, antes de los botones de envío.

Dos campos de URL (episodio y MP3) que se pegan a mano. Encima, si el
`observador_id` de la observación tiene ficha de catálogo con
`feed_rss_url` rellena (columna nueva y opcional en
`bitacora_observadores`), el bloque ofrece un desplegable de los episodios
de ese feed que autorrellena ambos campos al elegir uno; sin
`feed_rss_url` configurada, el bloque avisa "no encontrado/configurado" y
quedan los dos campos manuales. El feed se lee en servidor —un endpoint
REST del plugin, por CORS—, se cachea unas horas en un `transient` de
WordPress, y se pide solo al abrir el bloque, nunca por cron.

Inicio y fin se piden en `hh:mm:ss` (`hh` opcional, obligatoria para
episodios de más de una hora) y se convierten a segundos al construir el
envío; el dato guardado sigue siendo segundos enteros. Sin ayuda de
"reproducir y marcar": el usuario escucha el episodio en otra pestaña.

`audio_url` se sanea igual que `imagen_url`: `esc_url_raw()`, esquema
`https` obligatorio, sin lista blanca de dominios.

### Ficha del mapa

El reproductor va en una banda a todo lo ancho, justo bajo la cabecera
(título/coordenadas) y antes de las dos columnas de boceto y texto —visible
igual sea cual sea la pestaña de ocular seleccionada, coherente con que el
audio cuelga de la observación entera, no de una entrada por ocular—.
Prototipo de referencia (variantes A/B/C descartando B y C) en la rama
`worktree-prototipo-audio-ficha`, `mapa/prototipo-audio-ficha.html`; no se
fusiona a `main`, queda como fuente de la posición exacta.

El listado de observaciones muestra un icono 🎧 cuando la observación tiene
tramo; el marcador del mapa no cambia — es una observación como otra
cualquiera. La puerta de entrada al material de un autor es seleccionarlo
en el filtro `#mw-observador` del cuadro de mando, ya existente
(`mapa/js/via-lactea-observadores.js`), comprobado con un observador real
que no es el dueño del sitio (issue #162).

## Alternativas descartadas

- **Guardar el identificador del proveedor** (p. ej. el de iVoox) en vez de
  URLs. Más compacto, pero mete un proveedor concreto dentro del modelo;
  descartado porque choca con la premisa de función genérica.
- **Tabla hija para el tramo.** Sin caso de uso que la justifique hoy: una
  observación lleva como mucho un tramo.
- **Reproductor incrustado del proveedor (iframe).** Cuenta la escucha,
  pero no admite tiempo de inicio ni control por `postMessage`: no sirve
  para el tramo exacto.
- **Ampliar el dialecto OAL con un campo de audio.** Contra la ADR 0003; el
  tramo es dato del sitio, no de la observación portable.
- **Ayuda "reproducir y marcar" en el formulario para localizar minutos.**
  El usuario ya tiene el episodio abierto en otra pestaña; no aporta sobre
  el coste medido (ver Consecuencias).

## Consecuencias

- El importador y el exportador de OAL no necesitan tocarse: las columnas
  de audio son invisibles para el dialecto y sobreviven intactas al ciclo
  exportar → corregir → reimportar.
- Un segundo autor sonoro (distinto de Néstor GM, en otra plataforma) no
  necesita ningún cambio de modelo: solo, si se le quiere dar la misma
  ayuda de captura, una `feed_rss_url` en su ficha de observador.
- Medido en el episodio de arranque (ep. 87 de Néstor GM, issue #162):
  anotar inicio y fin de 7 objetos costó 1h20min, incluyendo escuchar el
  episodio entero. No se añade ayuda de "reproducir y marcar" a la primera
  versión; si ese coste resulta alto en el uso real, es la señal para
  reabrirlo.
- Quedan fuera de esta ADR, sin resolver: qué ve el visitante cuando el MP3
  muere o cambia de nombre; qué hay que hacer el día que Néstor GM tome su
  propio usuario; y qué de lo decidido aquí se queda corto si entra un
  tercer autor sonoro. Notas del mapa (#156), no bloquean esta decisión.
