# Informe E2+E3 — semántica y coste del rango source_id (eje 2, ADR 0012)

Medido el 2026-08-18 contra `tapvizier.cds.unistra.fr` (`I/355/gaiadr3`), G≤20, sin
`ORDER BY`, 3 repeticiones intercaladas, protocolo endurecido de E1 (pausas + backoff).
Arnés: `scripts/harness_gaia_e2_e3_source_id.js`. Crudo: `scripts/salida_gaia_e2_e3.json`.

## E3 — el rango de source_id está indexado: PASA

La misma celda (la que contiene el centro, niveles 6 y 7) pedida como
`Source BETWEEN a AND b` frente al cono circunscrito con `CONTAINS`:

| Caso | rango (mediana) | cono (mediana) | ventaja del rango |
|---|---|---|---|
| M6 nivel 6 (199 627 filas) | 2,04 s | 2,92 s | 1,43× |
| M6 nivel 7 (32 898 filas) | 0,75 s | 1,34 s | 1,80× |
| Polo nivel 6 (1 310 filas) | 0,20 s | 0,90 s | 4,41× |
| Polo nivel 7 (310 filas) | 0,21 s | 0,84 s | 4,07× |

- El rango gana en los 4 casos. En campos pobres el coste del rango es **constante ~0,2 s**:
  comportamiento de índice primario, no de barrido geométrico.
- **El mecanismo celda-sin-ORDER BY es real**: 199 627 filas de la celda densa de M6 en
  2,04 s, cuando la consulta de producción de esa zona (40 000 filas CON `ORDER BY`)
  costó 3,3–10 s en E1. Ordenar es lo caro; traer filas por índice es barato.
- RA/Dec queda descartado como candidato principal, como preveía el orden de investigación.

## E2 — la semántica es real pero el borde es borroso: 99,04 %

Para 3 871 estrellas reales del polo se comparó el ipix nivel 12 según sus bits altos del
`source_id` contra el calculado de sus (RA, Dec) con un `ang2pix` nested propio:
**3 834 coinciden (99,04 %), 37 caen en un píxel vecino**. No es un fallo del algoritmo
(mal implementado daría ~0 %): el `source_id` se asignó con la posición de una época de
detección anterior, y las estrellas pegadas a un borde de píxel (o con movimiento propio)
quedan al otro lado.

Consecuencia de diseño, no descarte:

- La celda por `source_id` es una **partición exacta y disyunta del catálogo**: cada
  estrella vive en exactamente una celda, siempre la misma. Para la caché eso es lo que
  importa (sin duplicados, sin huecos entre celdas).
- Su **borde geométrico es borroso** (~1 % de las estrellas, desplazamiento acotado por
  ~1 píxel de nivel 12 ≈ 0,86′). Para reconstruir un campo, el proxy/cliente debe
  seleccionar las celdas que intersecan el círculo **ampliado en un margen ≥ 1 píxel de
  nivel 12**, y el recorte final se hace por RA/Dec reales. Con ese margen la
  equivalencia exacta con el diseño actual sigue siendo alcanzable; se verificará
  empíricamente en E4 (es parte de su listón de equivalencia, no un supuesto).

## Qué cambia para E4

1. Selección de celdas de un campo: círculo + margen de 0,9′ (borde borroso) — coste
   marginal nulo (ninguna celda extra en la práctica salvo tangencias).
2. El nivel 5 puede descartarse por aritmética en el bulbo sin medirlo: la celda de
   3,36 deg² sobre M7 (~1,1 M filas/deg² a G≤20) daría ~3,7 M filas — reventaría el
   diagnóstico de 10 MB y el TOP de cualquier consulta. El barrido útil es 6/7.
3. En el bulbo, la celda a G≤20 sigue siendo enorme (~10⁶ filas a nivel 6). La
   profundidad monotónica trabaja a favor: la primera adquisición puede hacerse a la
   profundidad que el campo necesita (escalera por celda, sin COUNT: el cliente sabe si
   la unión ya cubre su TOP 40000 y solo entonces pide más hondo). E4 debe medir celdas
   a varias profundidades (16/18/20), no solo a 20.
