# Notas

Apuntes sueltos, sin el peso de una especificación o un experimento cerrado.

Orden cronológico de ejecución:

1. `notas-resolucion-dobles.md` → `resolucion-dobles.md` (2026-08-19)
2. `notas-separacion-dobles-dibujo.md` → `separacion-dobles-dibujo.md` (2026-08-19)
3. `notas-render-difuso-gaia.md` → `render-difuso-gaia.md` (2026-08-19)
4. `notas-pupila-salida-fondo-cielo.md` → `pupila-salida-fondo-cielo.md` (2026-08-19)
5. `informe_color_estrellas.md` → `color_estrellas.md` (2026-08-19)
6. `tonalidad-azul-estrellas.md` (2026-09-02)
7. `recaptura-golden-difusas.md` (2026-09-05) — procedimiento para recapturar el golden bit a bit sin perder la atribución
8. `validacion-visual-difusas.md` (2026-09-05) — qué se mira, de dónde sale su Gaia y cómo se guarda el «antes»
9. `costura-parche-nebulosas.md` (2026-09-06) — medida de la costura del parche en NGC 6888 y por qué el grano se recorta a la mlim del equipo (#210)
10. `luz-sub-mlim-tres-canales.md` (2026-09-19) — dos medidas sobre los canales sub-mlim: qué canal se lleva la luz en cada tipo de objeto con un 18", y de dónde sale el halo de M13 a 514x (#329). El mapa de los canales está en `auditoria-identidad-conservacion-canales.md`
11. `nucleo-quemado-globulares-rango-dinamico.md` (2026-11-10) — núcleo quemado de M22 a 406 mm/50×: en un arnés aproximado lo recortan los solapes de los discos de estrella en el `clamp` final, con ayuda de `adaptacionLocal`, no la capa difusa; falta confirmarlo en el canvas real, luminancias reales en el ocular y operadores de tono de la literatura
12. `20261112_auditoria_pintado_estrellas.md` (2026-11-12) — auditoría contra el modelo físico lineal al cambiar de ocular: fondo, campo y escala OK; flujo estelar crece ×5–10 con M y la PSF no escala (decisiones ADR 0018/0019); salto del −50 % en `factorDilucion` confirmado. Arnés: `scripts/harness_auditoria_estrellas.js`
13. `brillo-halo-globulares-justificacion.md` (2026-11-11, superada en parte por #535) — de dónde salía el brillo del halo de los globulares antes del halo lineal: el exterior lo inflaban la gamma perceptual con t = s_halo y la rampa que arranca 1 mag bajo el umbral (ninguna con fuente), más un King 1962 que va 0,9-1,1 mag por encima de Trager entre 5′ y 17′
14. `perfil-king-contra-trager-globulares.md` (2026-11-13) — #537: King 1962 con los parámetros de Harris contra Trager 1995 en los 13 globulares del seed. El exceso del halo exterior aparece en 8 de 13 y no depende de la concentración. Ningún modelo analítico (King 1966, Wilson) mejora a producción en todos; el sustituto con respaldo es la curva medida de Trager. Con el halo lineal, el exceso se pinta en M13 y M9, y de forma marginal en M2 y M55
