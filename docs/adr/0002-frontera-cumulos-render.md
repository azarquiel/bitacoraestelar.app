# Frontera entre `bitacora-cumulos.js` y `bitacora-gaia-render.js`

La física de población estelar de los cúmulos (Capas 1 y 2) vive en un módulo nuevo,
`resources/js/bitacora-cumulos.js` (`window.BitacoraCumulos`); la imagen y la percepción (Capas
3 a 5) siguen en `bitacora-gaia-render.js`. La frontera se define por **dueño de la ley**, no por
comodidad:

```
bitacora-cumulos.js   = qué estrellas existen y cuáles son potencialmente resolubles
bitacora-gaia-render.js = cómo esas estrellas producen una imagen, y qué parte de esa imagen
                          resulta perceptualmente visible
```

**Regla estricta:** si una función de `bitacora-cumulos.js` necesita conocer `Cmin`, canvas,
`ctxFotometrico`, `visibilidadDifusa`, `realzarPerceptual` o cualquier parámetro de display, está
en el módulo equivocado. `grep Cmin resources/js/bitacora-cumulos.js` vacío es una garantía
arquitectónica automática.

## Reparto

| `bitacora-cumulos.js` | `bitacora-gaia-render.js` |
|---|---|
| LF tabulada (×3, por metalicidad), `N_tot` | `m_lim,sky(r)` contra el fondo local `Fcielo + ⟨I⟩(r)` |
| `S1(m_lim)`, `S2(m_lim)` | `m_res(r) = min(m_crowd, m_lim,sky)` |
| Perfil radial (PDF), población sintética, seed | Iteración única que rompe la circularidad |
| `mCrowd(r, fwhm)` | Campo definitivo, PSF, `s_halo` / `s_grano` |
| `campo(r, m_lim) → {I, sigma}` | Percepción (H2c) y display |
| `clasificar(estrella, m_lim, Δ)` | `pintarCumulo(difuso, mask, modelo, o)` |

## Por qué `m_res(r)` se compone en el render

`m_res(r) = min(m_lim,sky(r), m_crowd(r))` es conceptualmente de la Capa 2, pero su criterio de
detección pertenece al sistema visual. `m_crowd` es geometría y conteos: no necesita ojo ninguno.
`m_lim,sky` es puro umbral de detección. Por eso su evaluación y la composición con `m_crowd`
pertenecen al renderizador, **que es el punto de integración entre física/instrumentación y
percepción** — no porque la percepción empiece artificialmente allí. Esto evita que la separación
en módulos nos obligue a mentir sobre dónde se produce realmente `m_res(r)`.

## Circularidad y su resolución

`m_lim,sky(r)` depende de `⟨I⟩(r)` (fondo local) y `⟨I⟩(r)` depende de `m_lim(r)`. Se resuelve con
**una sola iteración, no un punto fijo**: `⟨I⟩₀(r)` se evalúa con `m_lim = m_crowd(r)` (cota
superior), con eso se calcula `m_lim,sky(r)`, y se recalcula `⟨I⟩(r)` una vez. El fondo local
mueve el umbral en décimas de magnitud; una iteración fija es determinista y barata, mientras que
un punto fijo iterado metería el criterio de parada dentro de la imagen.

## Consecuencias

- **La PSF es una sola.** El render pasa `FWHM_total = 2 · radioImagenEstelar(D)` al módulo. La
  PSF que resuelve, la que dibuja y la que fija `θ_grano` son la misma. No se añaden ahora los
  términos `FWHM_ojo(p_exit)` ni `FWHM_ocular`: no están calibrados, y el comportamiento angular
  del ojo ya está medido dentro de H2c. Como `FWHM_total` es un parámetro de entrada, añadirlos
  mañana no cambia ninguna interfaz.
- **La atenuación de la banda de transición se expresa como magnitud efectiva**,
  `m_eff = m + 2.5·log10(1/a)`, y no como columna extra por estrella: `capaEstrellas` ya sabe
  dibujar una magnitud. Cuando `a → 0` la estrella supera `mlim` y se apaga por el camino que ya
  existe; además encoge, porque `radioEstrella` va con la magnitud. Guardarraíles obligatorios:
  `m_eff` es **solo de dibujo** (nunca entra en S1/S2, `m_res` ni conservación — invariante 2), la
  sigmoide se evalúa sobre `m` y nunca sobre `m_eff` (cadena `m → m_res(r) → a → m_eff`, sin
  bucle), y la misma `m_res(r)` decide la clasificación y el descuento de flujo (invariante 3).
- **La máscara difusa pasa a ser `Float32Array`** con centinela `-1`. Contrato:
  `mask[i] < 0` → flujo no evaluado por un modelo difuso específico; `mask[i] >= 0` → flujo ya
  evaluado, y **el valor es la `t` de `realzarPerceptual`**. PS1 escribe `0` (gamma completa, bit a
  bit igual que antes); el cúmulo escribe `s_halo`. `t` no *es* `s_halo`: coinciden hoy por
  diseño, y la API no debe fusionarlas semánticamente. Se exporta `difusoMarcado(mask, i)` para
  que los harness no repitan la convención (hoy la tienen copiada a mano en seis sitios).
- **Despliegue:** el render de cúmulos es solo del simulador. `bitacora-cumulos.js` se carga
  únicamente en `simulador_ocular/ocular-wordpress.html`, antes de `bitacora-gaia-render.js`.
  `pintarCumulo` comprueba la existencia de `window.BitacoraCumulos` como **protección de
  integración**, no como camino alternativo que produzca un cúmulo parcialmente distinto. Deuda
  independiente anotada: `registro/registrar-observacion-wordpress.html:171` carga
  `globulares-datos.js` sin usarlo; no se toca en esta rama.
