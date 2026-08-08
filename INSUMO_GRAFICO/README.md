# INSUMO_GRAFICO — material gráfico del Consolidador Previred

Fuente de verdad del material gráfico: el asset recibido, todo lo que se derivó de él, y la
evidencia de que la maqueta quedó bien. Nada de esto tiene datos personales — a diferencia de
`INSUMO/`, que está en `.gitignore` justamente porque sí los tiene.

⚠️ **`banner3.jpg` se rediseñó conservando el nombre de archivo.** El asset actual es un banner
de cabecera web (17,13:1); el anterior era un membrete de documento (10,39:1). **El nombre no te
avisa de nada**: si heredas un CSS o unas medidas escritas contra el membrete, sus números están
todos mal. Por eso la copia que usa la app se llama `banner-conaf-uia.jpg`.

## Qué hay aquí

| Archivo | Qué es |
| --- | --- |
| `banner3.jpg` | **Original recibido, intacto.** 3032 × 177, 50 055 B. Es la procedencia; no se toca. |
| `implementacion_banner.md` | Prompt reutilizable para integrar un banner institucional en cualquier stack, con el anexo de medidas de este asset. Portable: sirve para otros proyectos tal cual. |
| `derivados/banner-conaf-uia.jpg` | Copia byte a byte del original, con el nombre que usa la app. Sin recortar ni reoptimizar (no hay artefacto de borde, y reencodear 50 KB sólo añade pérdida generacional). |
| `derivados/favicon-32.png` | 32 × 32. Isotipo CONAF recortado del banner sobre `#064928`. |
| `derivados/apple-touch-icon-180.png` | 180 × 180, mismo recorte. |
| `verificacion/` | Capturas aceptadas de la corrida de `npm run verify:banner`: los cinco anchos en tema claro y oscuro, la marca ampliada ×4 a 390 px y el caso sin imagen. Línea base visual. |

## Dónde vive cada cosa en el proyecto

| Qué | Dónde |
| --- | --- |
| El asset que compila Vite | `frontend/src/assets/banner-conaf-uia.jpg` (importado desde JS: hash de contenido y base resuelta sola) |
| El componente | `frontend/src/components/Banner.jsx` |
| Los números de la maqueta | `frontend/src/index.css` → `--razon-banner`, `--alto-minimo-banner`, `--verde-institucional` |
| La decisión de paleta, escrita | comentario de `.banner` en `frontend/src/App.css` |
| Los iconos que se publican | `frontend/public/favicon.png`, `frontend/public/apple-touch-icon.png` |
| Cómo se generan los iconos | `frontend/scripts/gen-favicon.mjs` (`npm run favicon`) — la caja de recorte medida está ahí |
| Cómo se verifica | `frontend/scripts/verify-banner.mjs` (`npm run verify:banner`), también en CI |

## Medidas, en una tabla

Verificadas píxel a píxel sobre `banner3.jpg`. Si el asset cambia, **hay que volver a medirlas**.

| Dato | Valor |
| --- | --- |
| Tamaño y razón | 3032 × 177, **17,1299:1** |
| Campo izquierdo (bajo la marca) | `#15301d` |
| Campo principal | `#064928` |
| Filete, **sólo en el borde superior** | azul `#0e69b0` en x 67–169, rojo `#eb3d49` en x 170–283, filas y 1–14 |
| Remate decorativo derecho | `#5e8f19` / `#388429`, desde x = 2745 |
| Zona segura para cortar sin costura | 858 ≤ x ≤ 2744 |
| Marca (isotipo + logotipo UIA) | hasta x = 540 (17,8 % izquierdo) |
| Isotipo CONAF: copa | x 105–189, y 51–99 |
| Isotipo CONAF: tronco | x 134–157, y 100–125 |
| Palabra "conaf" | desde x ≈ 155, y 100–135 |
| Recorte del favicon | x 105–190, y 51–127, tapando x 153–190 / y 97–127 con `#064928` |

## Si el banner cambia

1. Reemplazar `banner3.jpg` y **volver a medirlo** (§1 de `implementacion_banner.md`; en Windows
   sin Python, con .NET `System.Drawing`, o con la misma técnica de Chrome + `<canvas>` que usa
   `verify-banner.mjs`).
2. Copiarlo a `frontend/src/assets/banner-conaf-uia.jpg` y a `derivados/`.
3. Actualizar `--razon-banner` y `--alto-minimo-banner` en `frontend/src/index.css`, y las
   constantes de `frontend/scripts/verify-banner.mjs`.
4. `npm run favicon` y revisar la caja de recorte de `gen-favicon.mjs`.
5. `npm run build && npm run verify:banner`, **mirar** `captura-banner-390-marca-x4.png`, y
   recopiar las capturas a `verificacion/`.
