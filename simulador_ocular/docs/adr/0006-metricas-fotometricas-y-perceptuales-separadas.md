# Métricas fotométricas y métricas perceptuales van separadas

## Contexto

El falso defecto D2 de v7 —«el cielo se atenúa 2,733 mag y el halo 0,026»— no fue un error de
física sino de contabilidad: el cielo se medía por `SBe`, que ya lleva `dim`, y el halo por flujo
crudo, que no. Se comparaban dos números de marcos distintos y salía un diagnóstico con tres
decimales. El render trabaja en el marco del cielo: `pintarFot` pinta el objeto como incremento
de contraste sobre `Fcielo`, y `dim` entra **una sola vez**, en `SBe` y en `Cmin`.

## Decisión

Una métrica fotométrica (flujo, magnitud, brillo superficial, residuo de conservación) y una
métrica perceptual (contraste frente a `Cmin`, visibilidad, realce) no se comparan, no se suman y
no se mezclan en el mismo assert. Cada panel y cada test que compare componentes declara en qué
marco mide. La conservación fotométrica se verifica **antes** de la Capa 4, como ya fija
ADR-0003.

## Motivo

Las dos familias responden a mandos distintos y viven en escalas distintas: la fotométrica no se
mueve cuando cambia la pupila del ojo, y la perceptual sí. Mezclarlas produce diferencias
espectaculares que solo miden el cambio de marco, y —peor— invita a corregirlas con un factor,
que es lo que ADR-0004 prohíbe.

## Consecuencias

- La capa fotométrica no nombra los mandos del ojo: `bitacora-cumulos.js` no usa `Cmin`,
  `pupilaOjo`, `pupilaSalida`, `sqm`, `SBe` ni `contraste` (guardián en `test_cumulos.js` §9 para
  la frontera de módulos de ADR-0002, y en `test_disciplina_v7.js` §4 para los mandos).
- La prueba de que la separación es real es de comportamiento, no de nombres, y la mide E1.3:
  partir la pupila del ojo de 7 a 3,5 mm mueve `dim` ×4 y el contraste 0,00000 mag.
- Cuando una comparación deba cruzar marcos, se convierte explícitamente y se dice en la
  etiqueta del assert.

## Regla

Antes de comparar dos números de la cadena, declarar en qué marco está cada uno. Si un assert
necesita una cantidad fotométrica y otra perceptual para producir su veredicto, está midiendo el
marco, no la ley: se parte en dos.
