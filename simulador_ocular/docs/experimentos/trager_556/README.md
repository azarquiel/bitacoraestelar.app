# M15 y M30 antes y después de la forma de Trager (#556, ADR 0035)

Capturas del lienzo del simulador (vista «Estrellas de Gaia DR3 (Canvas 2D)»), 2026-11-14.
Equipo: 457 mm, focal 4774 mm con el ocular de ejemplo (154×), SQM 21,5, pupila 7 mm.
`*_antes.png` es `main` (9ead455, King 1962); `*_despues.png` es la rama de #556.
Servidas con `php -S localhost:<puerto> scripts/dev_servidor_ocular.php`.

Nivel de la capa difusa en el centro (`pintarCumulo`, misma configuración, sin estrellas):

| | antes | después | Δ |
|---|---:|---:|---:|
| M30, r = 0 | 176,3 DN | 140,3 DN | −36,0 |
| M15, r = 0 | 160,3 DN | 165,9 DN | +5,6 |

La mediana de 21×21 píxeles en el centro de las capturas (estrellas incluidas) pasa de
105 a 97 en M30 y de 132 a 126 en M15.

El ADR 0035 preveía que el centro de M30 bajase 34–36 DN. **El usuario da por creíble
el núcleo de M30 (2026-11-14):** el cambio se nota, pero no hace falta tocar el núcleo.
