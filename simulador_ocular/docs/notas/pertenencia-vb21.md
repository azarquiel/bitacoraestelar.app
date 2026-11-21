# Pertenencia de las estrellas de Gaia a un globular: Vasiliev & Baumgardt 2021 (#575)

Fecha: 2026-11-17. Historia US-2 de la épica #578 (prerrequisito 2 del ADR 0039).

## Fuente (abierta, no de segunda mano)

Vasiliev, E. & Baumgardt, H. 2021, «Gaia EDR3 view on Galactic globular clusters», MNRAS 505, 5978-6002. Leído en arXiv:2102.09568v3 (12 jul 2021), §2 («Method») y «Data availability».

Datos: Zenodo, registro 4891252 (versión 2, 2021-06-01, «updated to match the published paper»). El artículo enlaza 4549397, que resuelve a esta versión. Se abrió `clusters.zip` (119 MB): `!readme.txt` y `catalogues/NGC_6205_M_13.txt` (37 720 fuentes, radio 0,4165° = 25′; r_t de M13 = 21′).

**Método (§2, resumido del original).**
- Modelo de mezcla en paralaje y movimiento propio. El cúmulo es una gaussiana con paralaje común y dispersión de PM con perfil radial. El campo son una o dos gaussianas.
- Tiene en cuenta la distancia al centro con un perfil de Plummer.
- Solo usa astrometría, no la fotometría. El CMD de los miembros se inspecciona a mano después.
- La probabilidad se calcula para **todas** las fuentes con solución de 5 o 6 parámetros, también las que no pasan los filtros de calidad. Es la media sobre 100 realizaciones de la cadena MCMC.

**Subconjunto «limpio»** (bit 2 de `qflag` en el catálogo). Excluye:
- (a) G < 13;
- (b) RUWE > 1,15;
- (c) `astrometric_excess_noise_sig` > 2;
- (d) `ipd_gof_harmonic_amplitude` > exp[0,18 (G − 33)];
- (e) `ipd_frac_multi_peak` > 2;
- (f) `visibility_periods_used` < 10;
- (g) exceso BP/RP fuera de 3σ (Riello et al. 2021);
- (h) fuente duplicada.

Los propios autores dicen que en los 1-2′ centrales de algunos cúmulos casi ninguna estrella pasa estos filtros.

## Criterio y corte

```
campo  ⇔  memberprob < 0,5  y  (astrometría limpia  o  G < 13)
```

- **memberprob < 0,5**: la clase más probable del modelo.
- **Astrometría limpia.** La probabilidad de las fuentes que no pasan los filtros no sirve donde hay aglomeración. Medido en el catálogo de M13 (p < 0,5, por anillo):

  | anillo | todas (/arcmin²) | solo limpias (/arcmin²) |
  |---|---:|---:|
  | 0-1 r_h | 79,9 | 0,00 |
  | 1-2 r_h | 38,0 | 0,30 |
  | 2-4 r_h | 5,8 | 1,16 |
  | 4-8 r_h | 1,8 | 1,24 |
  | 8-12,4 r_h (sobre todo fuera de r_t) | 1,7 | 1,32 |

  El campo es uniforme a esta escala. Con limpias, la densidad sale plana; sin ellas, el núcleo tendría unas 47 veces más «campo» que fuera de r_t. Son miembros con astrometría estropeada por la aglomeración: las 1 733 de 0-2 r_h con p < 0,5 y sin astrometría limpia tienen casi todas G = 15-19.
- **o G < 13.** El filtro (a) saca de «limpia» a toda estrella brillante por calibración, no por aglomeración. En 4-8 r_h, 16 de las 17 con G < 13 tienen p < 0,5, con PM a varios mas/año del cúmulo. Dentro de 4 r_h solo hay tres. Sin esta excepción, la estrella que el ADR 0039 señaló como de campo (V = 10,6) contaría como miembro.

**Lo que este corte pierde (declarado).**
- El campo con astrometría no limpia en el halo, unas 0,5 estrellas/arcmin², casi todas con G = 19-20: poca luz.
- El campo que cae dentro de 2 r_h.
- Las filas sin solución de 5/6 parámetros, que no tienen pertenencia.

Todas esas se quedan como miembros, que es lo que suponía producción hasta ahora.

## Fixture y generador

- `python3 scripts/gen_m13_pertenencia.py [clusters.zip]` cruza `m13_gaia_dr3.csv` con el catálogo por posición (< 0,05″).
  - Gaia DR3 hereda la astrometría de EDR3: la separación máxima medida es 0,002″ y |ΔG| ≤ 0,02.
  - De 11 972 filas, 9 312 tienen pareja; de ellas, 313 son de campo. Las 2 660 sin pareja están casi todas a menos de 4′ del centro.
- La salida es `simulador_ocular/docs/validacion/m13_vb21_campo.csv`: las filas de campo con su `ra,dec` tal cual en el fixture, `memberprob` y `qflag`.
- `scripts/test_pertenencia_m13.js` fija dos cosas:
  - La densidad de campo es plana: en 0-2 r_h, como mucho el doble que en 4-8 r_h. Medido: 0,06 contra 0,53 por arcmin². El caso malo (p < 0,5 sin exigir limpia) da 31,9 contra 0,68 y el test lo rechaza, comprobado.
  - La más brillante de 4-8 r_h es de campo.

## En producción

- `estrellasCumulo` (`resources/js/bitacora-gaia-render.js`) acepta un 5º elemento `true` en la fila de catálogo: «es de campo». La regla es `BitacoraGaiaRender.esCampo(fila)`, y el arnés la lee de ahí (ADR 0008).
  - Esa fila sale como si estuviera fuera de r_t: sin corte `m > m_res` y sin sorteo `aCrowd`. Se sigue pintando como estrella de campo, con su glow si es tenue, así que el disco oscuro de #570 no vuelve.
  - No cuenta como luz del cúmulo.
  - Es una propiedad de la estrella, no del ocular: no cambia de canal al cambiar de ocular.
  - Lo fija `scripts/test_campo_no_es_cumulo.js` a 61, 173 y 250×.
- **Lo que falta:** las filas que trae `gaia_proxy.php` no llevan todavía la marca. Hoy no tienen ni `source_id` ni PM. Medido el tamaño: dentro de r_t y con G ≤ 20 hay 396 389 estrellas de campo en los 138 globulares de VB21 que están en `globulares-datos.js` (#601 los recuenta: son los 143; ver ADR 0041) (54 215 solo en M22). Llevarlas a producción es #583.

## Resultado en M13 (criterio 2 de #575)

`node scripts/harness_fusion_blending.js` (467 mm, 173×, SQM 21, en V). `--todas` reproduce el ADR 0039 sin separar miembros.

Diagnóstico ADR 0003 `(ΣF_cat + ∫V1)/∫Σ·S1` por anillo:

| | ≤0,25 | ≤0,5 | ≤1 | ≤2 | ≤4 | ≤8 |
|---|---:|---:|---:|---:|---:|---:|
| todas (`--todas`) | 1,123 | 0,988 | 0,953 | 0,843 | 0,791 | 3,201 |
| solo miembros | 1,108 | 0,988 | 0,953 | 0,836 | 0,758 | **0,985** |
| solo miembros, `--banda G` | 1,270 | 1,133 | 1,109 | 1,009 | 0,909 | 1,158 |

**4-8 r_h: 0,985, dentro de ±10 % (fase 1). Criterio 2 cumplido.**

Residuos que no son de esta historia y se registran sin forzarlos (ADR 0003):
- 1-2 r_h (0,836) y 2-4 r_h (0,758) ya estaban fuera del ±10 % antes de separar miembros (0,843 y 0,791). Quitar el campo los baja algo, como debe.
- La causa no está medida aquí. Queda para #577.
- R2 (criterio 3 del ADR 0039) en 4-8 r_h pasa de 29,8 a 0,47, con 1 + 2σ = 1,198. Aquí no se interpreta: el criterio 3 con potencia es de #576 y #577.
